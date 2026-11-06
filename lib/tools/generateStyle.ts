/* generate_style: a custom style written by the text model from words and/or a reference picture, held to what a
 * custom style may be (lib/styles/custom.ts `validateCustomStyle`, never bypassed), with one round of fixes when the
 * model's colors read too faintly or its rules were dropped, then the last faint pairs put right by rule, and the
 * style added to the document (and worn) through `add_custom_style`. The agent then looks at a screen in it and calls
 * again with `refine` and what to change. */

import { contrastRatio, ROLE_KEYS, READS, STYLE_PACKS, contrastFloor, validateCustomStyle, type CustomStyle, type StyleProblem } from "../styles";
import { RECIPES } from "../styles/recipes";
import { FONTS, ICON_FAMILIES, SHAPES } from "../tokens";
import { onColorFor } from "../color";
import { collectTurn, textOf, type UserPart } from "../llm";
import { ops, type CoreState } from "../core";
import { problemLines } from "../core/ops/styles";
import { afterWrite } from "./ops";
import { tool, ToolFailure } from "./types";

/** what the style author is told: the format, and the catalog it may choose from */
export function styleSystemPrompt(): string {
  return [
    "You design one custom style for M3E Canvas, a UI design editor. A style is data: colors, faces, shapes and how each kind of control is drawn. Reply with one JSON object only, no prose, no code fence.",
    "",
    "Fields (leave out what you do not mean to set; with `extends`, what you leave out is that style's):",
    '- key: "custom:<lowercase-words>"; name: {"en", "zh", "ja", "ko"} or one string; hint: one line on what it suits.',
    `- extends: the nearest built-in style to start from (its CSS stays the base): ${STYLE_PACKS.map((p) => `${p.key} (${p.name.en})`).join(", ")}. Leave it out to start from Material.`,
    '- group: "app" | "desktop" | "mobileGame" | "pcGame"; mode: "light" | "dark" (the mode it opens in).',
    `- seed: #RRGGBB, the accent; light and dark: role → #RRGGBB for ${ROLE_KEYS.join(", ")} (all 24 in each mode, or leave a mode out to have it made from the seed).`,
    `- font and display (headings): one of ${FONTS.map((f) => f.key).join(", ")}. icons: one of ${ICON_FAMILIES.join(", ")}. shape: ${SHAPES.map((s) => s.key).join(", ")}. motion: standard | expressive. control (button corners): pill | extra-small | small | medium | large.`,
    `- recipes: per kind of control, one variant: ${Object.entries(RECIPES).map(([k, v]) => `${k}: ${v.join("/")}`).join("; ")}.`,
    "- ux: {margin, gap, tight} in px (0–64), nav: keep | bottom | rail | top, place: top | center | bottom | spread.",
    '- screen and screenDark: what lies behind every screen: #RRGGBB or CSS gradients only (e.g. "radial-gradient(circle at 20% 0%, #FFF6E5, #F3E7D0)"), never a picture.',
    "- type: {\"title-large\": [size, line, weight, tracking], …} for display/headline/title/body/label × large/medium/small; capsLabels, italicDisplay: booleans.",
    '- rules (optional, few): [{"selector": "[data-slot=\\"card\\"]", "declarations": {"border": "1px solid var(--md-sys-color-outline-variant)", "box-shadow": "0 1px 0 #0000000F"}}]. Selectors only by [data-slot=…], [data-surface=…], other [data-*] / [aria-*] attributes and states (:hover, :checked…); colors as var(--md-sys-color-<role-in-kebab-case>) or #hex; no url(), no !important.',
    "",
    "Legibility is checked and must hold in both modes: every pair reads at 4.5:1 at least — " + READS.map(([bg, fg]) => `${fg} on ${bg}`).join(", ") + "; outline on surface 2.8:1; primary on surfaceContainerHigh 3:1.",
    "Make the palette coherent: surfaces in a few close steps (surface lightest in light mode, darkest in dark), on- colors that read on their grounds, containers as soft tints of their accent.",
  ].join("\n");
}

/** the first JSON object of a reply */
function jsonOf(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(text.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** what is worth sending back to the model: faint colors and rules taken out */
const worth = (problems: StyleProblem[]) => problems.filter((p) => p.code === "contrast" || p.code === "rule" || p.code === "recipe" || p.code === "font" || p.code === "color");

/** The pairs that still read too faintly, put right by rule: the words take the color that reads on their ground,
 *  an outline is darkened (or lightened) toward the words until it shows. What it changed, in words. */
export function repairContrast(style: CustomStyle): { style: CustomStyle; changed: string[] } {
  const changed: string[] = [];
  const fix = (mode: "light" | "dark") => {
    const roles = { ...style[mode] };
    for (const [bg, fg] of READS) {
      const floor = contrastFloor(bg, style.loud);
      if (contrastRatio(roles[bg] as string, roles[fg] as string) >= floor) continue;
      const on = onColorFor(roles[bg] as string).toUpperCase();
      const pick = [on, "#000000", "#FFFFFF"].find((c) => contrastRatio(roles[bg] as string, c) >= floor) ?? on;
      changed.push(`${mode}.${fg} ${roles[fg]} → ${pick} (on ${bg})`);
      roles[fg] = pick;
    }
    const surface = roles.surface;
    let outline = roles.outline;
    for (let i = 0; i < 12 && contrastRatio(surface, outline) < 2.8; i++) outline = mix(outline, roles.onSurface, 0.2);
    if (outline !== roles.outline) {
      changed.push(`${mode}.outline ${roles.outline} → ${outline}`);
      roles.outline = outline;
    }
    return roles;
  };
  const light = fix("light");
  const dark = fix("dark");
  return { style: { ...style, light, dark }, changed };
}

const mix = (a: string, b: string, t: number) => {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(c(a, i) * (1 - t) + c(b, i) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};

type Args = { description?: string; reference?: string; name?: string; extends?: string; refine?: string; feedback?: string; wear?: boolean };

export const generateStyle = tool<Args>({
  name: "generate_style",
  group: "generate",
  description:
    'Writes a custom style with the text model, from a description ("warm paper notebook: cream paper, ink-blue accents, serif headings") and/or an attached reference picture (ref1…), validated (colors, contrast, catalog recipes, safe CSS), added to the document and worn unless wear is false. To change it after looking at a screen in it, call again with refine (its key) and feedback. About 20–60 s.',
  input: {
    type: "object",
    properties: {
      description: { type: "string", description: "what the style is like: mood, materials, colors, type, shapes, products it recalls" },
      reference: { type: "string", description: "an attached picture to take the style from (ref1…)" },
      name: { type: "string" },
      extends: { type: "string", description: "a built-in style to start from" },
      refine: { type: "string", description: "the custom: key of a style of the document to revise" },
      feedback: { type: "string", description: "what to change, with refine" },
      wear: { type: "boolean", description: "put it on the document (default true)" },
    },
    additionalProperties: false,
  },
  output: "{key, name, worn, problems, repaired, ms}",
  readOnly: false,
  destructive: false,
  async run(a, env) {
    const gen = env.gen;
    if (!gen?.adapter) throw new ToolFailure("unavailable", "There is no text model to write a style with here.", "Write the style yourself with add_custom_style.");
    if (!a.description && !a.reference && !a.refine) throw new ToolFailure("bad_args", "Say what the style is like (description), attach a picture (reference) or name one to revise (refine).");
    const ref = a.reference ? env.attachments?.find((x) => x.id === a.reference) : undefined;
    if (a.reference && !ref) throw new ToolFailure("not_found", `There is no attached picture ${JSON.stringify(a.reference)}.`, env.attachments?.length ? `The attached pictures are ${env.attachments.map((x) => x.id).join(", ")}.` : "The author attached no picture.");
    const s = env.store.get();
    const was = a.refine ? s.doc.styles?.find((x) => x.key === a.refine) : undefined;
    if (a.refine && !was) throw new ToolFailure("not_found", `The document has no style ${JSON.stringify(a.refine)}.`, "list_styles gives the document's own styles.");
    const t0 = Date.now();
    const ask = [
      was ? `Revise this style (keep its key ${was.key}):\n${JSON.stringify({ ...was, rules: was.rules })}` : "",
      a.description ? `The style: ${a.description}` : "",
      a.feedback ? `What to change: ${a.feedback}` : "",
      ref ? "Take its colors, surfaces, type and shapes from the attached picture." : "",
      a.name ? `Name it ${JSON.stringify(a.name)}.` : "",
      a.extends ? `Extend the built-in style ${a.extends}.` : "",
    ].filter(Boolean).join("\n\n");
    const content: UserPart[] = [{ type: "text", text: ask }, ...(ref ? [{ type: "image" as const, dataUrl: ref.dataUrl, detail: "high" as const }] : [])];
    const system = styleSystemPrompt();
    const messages: Parameters<typeof collectTurn>[1]["messages"] = [{ role: "user", content }];
    let made: CustomStyle | null = null;
    let problems: StyleProblem[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const turn = await collectTurn(gen.adapter, { system, messages, toolChoice: "none", maxOutputTokens: 16000 }, env.signal);
      if (turn.stop === "refusal") throw new ToolFailure("refused", "The model declined to write this style.", "Describe it differently.");
      const json = jsonOf(textOf(turn.message));
      if (!json) {
        if (attempt === 2) throw new ToolFailure("failed", "The model did not answer with a style.", "Try again, or write it with add_custom_style.");
        messages.push(turn.message, { role: "user", content: "Reply with the style as one JSON object only." });
        continue;
      }
      const v = validateCustomStyle({ ...json, ...(was ? { key: was.key } : {}) });
      made = v.style;
      problems = v.problems;
      const fixes = worth(problems);
      if (!made || !fixes.length || attempt === 2) break;
      messages.push(turn.message, { role: "user", content: `Validation found these problems:\n${problemLines(fixes).map((l) => `- ${l}`).join("\n")}\nReply with the whole corrected style as JSON only.` });
    }
    if (!made) throw new ToolFailure("invalid_value", `The model's answer is not a style: ${problemLines(problems).join("; ")}`, "Try again with a clearer description.");
    const repaired = repairContrast(made);
    const prev: CoreState = env.store.get();
    const out = env.store.run(ops.addCustomStyle, { style: repaired.style as unknown as Record<string, unknown>, wear: a.wear ?? true }, { origin: env.origin, ...(env.history ? { history: env.history } : {}) });
    afterWrite(env, prev);
    return { result: { key: out.key, name: made.name.en, worn: out.worn, ...(out.problems.length ? { problems: out.problems } : {}), ...(repaired.changed.length ? { repaired: repaired.changed } : {}), ms: Date.now() - t0 } };
  },
});

