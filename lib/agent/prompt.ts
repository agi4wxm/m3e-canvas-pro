/* What the in-app agent is told. The system prompt stays the same for a whole conversation (so the provider's prompt
 * cache keeps it): who it is, how it works, the tools' guide. What changes from turn to turn goes in front of each
 * request instead: a compact outline of the document (never all of it), the selection, and the rules of the style
 * the document is held to, as the document itself says it is held, or that it is not. */

import { outline } from "../core/query";
import { describeNode } from "../core/query";
import { STRICT_LOOK_KEYS } from "../look";
import { rulesForModel } from "../styleRules";
import { isStrict, styleOf, withDocStyles } from "../styles";
import type { Lang } from "../i18n";
import type { Doc } from "../tokens";

export const LANG_NAME: Record<Lang, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean" };

export type SystemOptions = {
  /** the tools' guide (lib/tools toolGuide) */
  guide: string;
  /** a picture of a screen can be taken */
  canSee: boolean;
  /** how many drawings a turn may make with the image or text model; 0 when it cannot draw */
  drawings: number;
  /** how many styles a turn may have the text model write (generate_style); 0 when it cannot */
  styles?: number;
};

export function agentSystem(o: SystemOptions): string {
  return [
    "You are the design agent inside M3E Canvas Pro, a browser editor where an author builds app screens from parts (atoms and composites) the way Figma does with auto layout. You change the author's document only through the tools, on the canvas they are looking at; they watch you work. Everything you do in one turn is one undo step the author can keep or take back.",
    "",
    "How you work, every turn:",
    "1. Plan: start with one or two short sentences saying what you will do. No lists.",
    "2. Act: read only what you need (the outline below is current), then build in a few apply_ops batches rather than many single calls.",
    o.canSee
      ? "3. Check: screenshot each screen you changed, look at it, and fix what is wrong: parts overlapping or cut off, uneven spacing, misaligned edges, words in the wrong language, contrast too low, something asked for that is missing. At most two rounds of fixes."
      : "3. Check: read the outline of what you changed and fix what is wrong.",
    "4. Finish with one or two sentences for the author on what you did. Do not list ids or tool names.",
    "",
    "Rules:",
    "- Do what was asked, on what was asked about: \"this\" and \"these\" mean the selection. Leave the rest of the document as it is; never remove the author's parts unless asked.",
    "- Keep the document's style and its look; make new parts match what is already there.",
    "- Write every word on the canvas in the language the context names, unless the author asks for another. Answer the author in the language they wrote in.",
    "- Selects, dropdown menus and date pickers are laid out at their closed size; on the canvas their open menu hangs over whatever is below them (the preview opens it on tap). That is how the canvas draws them: do not move, shrink or reorder parts to get out from under an open menu.",
    "- Prefer kits and composites to composing by hand, and icons (list_icons) to drawings. What the catalog has no kit for (a prompt box like Claude's or Codex's, a game HUD, a custom card), compose with add_tree: one nested tree of boxes (surface, layout row|column|grid, gap, padding, align, justify) and atoms, each with its props, colors and look, in one call. Save a composition worth reusing with make_component.",
    "- A dark-mode toggle: add_var {type: bool, drives: \"dark\"} makes the variable the app's dark mode; bind a switch's checked prop to it (bind_prop) or toggle it in a tap's effects. The preview and the exported app then switch light and dark.",
    "",
    "When the author attaches a picture to copy (a screenshot, a mock-up):",
    "1. Read it closely first: the screen's regions from top to bottom (bars, headers, cards, lists, buttons, the tab bar), what each holds, sizes and gaps in dp (a phone screenshot is usually 2–3 px per dp: sample_colors says the picture's size), corners, borders, shadows, type sizes and weights.",
    "2. Measure its colors with sample_colors (regions of the background, surfaces, accents, words) rather than guessing. On a document not held to a style use those colors directly (fill and textColor roles, or hex in a look); when the picture has a strong style of its own, generate_style from it (reference) gives the document a custom style first.",
    "3. Build it: a screen the picture's size in dp if none fits, then add_tree a region at a time (or the whole screen as one tree of boxes), with real words and icons from list_icons; generate_svg for ornaments and logos nothing in the catalog draws, generate_image for photos and backdrops (background: true for the whole screen).",
    "4. Compare with compare_to_reference: look at both pictures side by side, read the cells that differ, list the differences (layout, spacing, sizes, colors, type, corners, shadows) and fix them; at most three rounds.",
    o.drawings > 0
      ? `- generate_svg draws a custom icon or illustration when nothing in the catalog will do, and generate_image paints a content picture. Each costs a model call and takes up to a minute: at most ${o.drawings} in a turn, and only when the request needs one.${o.styles ? ` generate_style runs at most ${o.styles} times in a turn, a refine included; after that change the style with add_custom_style.` : ""}`
      : "- You cannot draw pictures this time: use icons, the svg atom's library shapes and the catalog.",
    "- If a call fails, read its error and hint, fix the call and try again: one error is no reason to stop.",
    "- When part of a request cannot be done exactly as asked, do the nearest thing the tools allow and say in your answer what differs. Ask one short question instead of acting only when the request is unclear or would remove much of the author's work.",
    "",
    o.guide,
  ].join("\n");
}

/** how long the outline may run before it is cut down to fewer levels */
const OUTLINE_BUDGET = 9000;

/** The document as a model needs it at the start of a turn: the outline (shallower when long), the selection and
 *  what the style's rules leave to the model. */
export function turnContext(o: { doc: Doc; widths: Record<string, number>; selection: string[]; frameId: string | null; lang: Lang }): string {
  const { doc, widths } = o;
  return withDocStyles(doc.styles, () => {
    let text = outline(doc, widths, { props: "set" });
    for (const depth of [3, 2, 1]) {
      if (text.length <= OUTLINE_BUDGET) break;
      text = outline(doc, widths, { props: "set", depth });
    }
    if (text.length > OUTLINE_BUDGET) text = outline(doc, widths, { props: "none", depth: 0 });
    const cut = text.length > OUTLINE_BUDGET;
    if (cut) text = `${text.slice(0, OUTLINE_BUDGET)}\n…`;
    const shallow = text !== outline(doc, widths, { props: "set" });
    const theme = doc.theme;
    const strict = !!theme && isStrict(theme);
    const pack = theme ? styleOf(theme.style) : undefined;
    const sel = o.selection
      .map((id) => describeNode(doc, widths, id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => `${d.id} (${d.slug}${d.name ? ` "${d.name}"` : ""}) on ${d.screen ? `${d.screen.id} "${d.screen.name}"` : "no screen"}`);
    const screen = o.frameId ? doc.frames.find((f) => f.id === o.frameId) : undefined;
    return [
      "<context>",
      `Language for words on the canvas: ${LANG_NAME[o.lang]}.`,
      sel.length ? `Selected: ${sel.join("; ")}.` : screen ? `Selected screen: ${screen.id} "${screen.name}".` : "Nothing is selected.",
      strict
        ? `The document is held to its style's rules.\n${rulesForModel(theme!)}\nSo of a part's look only ${STRICT_LOOK_KEYS.join(", ")} survive; corners and a button's shape are the style's.`
        : `The document wears ${pack ? `the ${pack.name.en} style` : "Material 3"} but is not held to its rules: colors, corners, shapes and every look field are yours to set where they help (look_reference lists them).`,
      "",
      `Outline${shallow ? " (shortened: get_outline {screen} shows a screen in full)" : ""}:`,
      text,
      "</context>",
    ].join("\n");
  });
}
