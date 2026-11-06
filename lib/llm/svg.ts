import { MAX_MARKUP, sanitizeSvg, type CleanSvg } from "../../parts/svg";
import type { PNode, PValue } from "../../parts/node";
import { readError } from "./errors";
import { LlmHttpError, postSse, streamError, trimSlash } from "./http";
import { collectTurn } from "./loop";
import { responsesUsage } from "./openai";
import { sseJson } from "./sse";
import { addUsage, emptyUsage, textOf, type Adapter, type LlmEvent, type Message, type UserPart, type Usage } from "./types";

/* Two ways to get a drawing for the vector atom, and one way out for both: whatever comes back is
 * read by parts/svg.ts's sanitizer and written out again from what it kept, so the markup handed to
 * the document holds only what that sanitizer allows, with its own short names for its parts.
 *
 * 1. The Images API draws a reference picture and an authoring model traces it as SVG
 *    (`output_format: "svg"`). One drawing per request, no streaming, no edits. The same drawing
 *    can be asked for through the Responses API's image_generation tool, which streams.
 * 2. The text model writes the SVG itself under strict rules; what breaks them is sent back once
 *    with the reasons. */

/** the elements a drawing may use: exactly what the sanitizer keeps, so nothing asked for is silently lost */
export const SVG_ELEMENTS = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "symbol", "use"];
/** what carries no drawing and is dropped without harm */
const HARMLESS = new Set(["title", "desc", "metadata"]);
const MAX_ELEMENTS = 4000;

/* ---------- writing a cleaned drawing out again ---------- */

/** attribute names React and SVG spell the same; every other React name is SVG's with dashes */
const CAMEL = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits", "maskContentUnits", "pathLength"]);
const svgName = (k: string) => (CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markup for what the sanitizer kept. Its parts are renamed p0, p1… in the order they appear, so the
 *  markup is short and the same for the same drawing; the vector atom scopes the names again when it
 *  draws them. */
export function cleanToMarkup(clean: CleanSvg): string {
  const names = new Map<string, string>();
  const collect = (n: PNode) => {
    const id = n.props?.id;
    if (typeof id === "string" && !names.has(id)) names.set(id, `p${names.size}`);
    for (const c of n.children ?? []) if (typeof c !== "string") collect(c);
  };
  clean.children.forEach(collect);
  const rename = (v: string) => v.replace(/url\(#([\w.-]+)\)/g, (all, id: string) => (names.has(id) ? `url(#${names.get(id)})` : all));
  const value = (k: string, v: PValue): string | undefined => {
    if (v === null || v === undefined || v === false) return undefined;
    if (k === "style" && typeof v === "object") {
      const decls = Object.entries(v as Record<string, PValue>)
        .filter(([, x]) => x !== null && x !== undefined)
        .map(([p, x]) => `${svgName(p)}:${rename(String(x))}`);
      return decls.length ? decls.join(";") : undefined;
    }
    if (typeof v === "object") return undefined;
    const s = String(v);
    if (k === "id") return names.get(s) ?? s;
    if (k === "href") return s.startsWith("#") && names.has(s.slice(1)) ? `#${names.get(s.slice(1))}` : s;
    return rename(s);
  };
  const attrs = (props: Record<string, PValue> | undefined) =>
    Object.entries(props ?? {})
      .map(([k, v]) => [k, value(k, v)] as const)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => ` ${svgName(k)}="${esc(v!)}"`)
      .join("");
  const write = (n: PNode | string): string => {
    if (typeof n === "string") return esc(n);
    const kids = (n.children ?? []).map(write).join("");
    return kids ? `<${n.type}${attrs(n.props)}>${kids}</${n.type}>` : `<${n.type}${attrs(n.props)}/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(clean.viewBox)}"${attrs(clean.attrs)}>${clean.children.map(write).join("")}</svg>`;
}

/** the outermost svg element of a reply, without prose or a code fence around it */
export function extractSvg(text: string): string | null {
  const a = text.search(/<svg[\s>]/i);
  const b = text.toLowerCase().lastIndexOf("</svg>");
  if (a < 0) return null;
  return b > a ? text.slice(a, b + 6) : text.slice(a);
}

export type SvgCheck = { markup: string | null; problems: string[]; warnings: string[] };

/** What a drawing breaks of the rules, and the cleaned markup when anything drawable is left.
 *  `problems` are worth asking the model to fix; `warnings` only say what the sanitizer dropped. */
export function checkSvg(raw: string, strict = true): SvgCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const svg = extractSvg(raw);
  if (!svg) return { markup: null, problems: ["The reply has no <svg> element."], warnings };
  const names = [...svg.matchAll(/<\s*([A-Za-z][\w:.-]*)/g)].map((m) => m[1]);
  const allowed = new Set(SVG_ELEMENTS);
  const foreign = [...new Set(names.filter((n) => !allowed.has(n) && !HARMLESS.has(n)))];
  if (foreign.length) (strict ? problems : warnings).push(`Elements that are not allowed and were dropped: ${foreign.map((n) => `<${n}>`).join(", ")}.`);
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  if (strict && !/\bviewBox\s*=\s*["'][^"']+["']/.test(root)) problems.push("The root <svg> has no viewBox.");
  /* the namespace declarations are addresses too, and harmless */
  if (/\b(?:https?|data|javascript|file|ftp):/i.test(svg.replace(/\sxmlns(?::\w+)?\s*=\s*(["'])[^"']*\1/g, ""))) (strict ? problems : warnings).push("It refers to something outside the drawing (a URL or data: address); only url(#id) and href=\"#id\" inside it are allowed.");
  if (/\sclass\s*=/.test(svg)) (strict ? problems : warnings).push("It uses class attributes; paint with attributes (fill, stroke, opacity) instead.");
  if (svg.length > MAX_MARKUP) warnings.push(`The markup is ${svg.length} characters; the editor keeps the first ${MAX_MARKUP}, so the end of the drawing was dropped.`);
  if (names.length > MAX_ELEMENTS) warnings.push(`The drawing has ${names.length} elements; the editor keeps the first ${MAX_ELEMENTS}.`);
  const clean = sanitizeSvg(svg);
  if (!clean) {
    problems.push("Nothing drawable is left once the disallowed parts are removed.");
    return { markup: null, problems, warnings };
  }
  return { markup: cleanToMarkup(clean), problems, warnings };
}

const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/* ---------- 1. the Images API ---------- */

export type SvgImageOptions = {
  prompt: string;
  key: string;
  baseUrl?: string;
  /** draws the reference picture */
  model?: string;
  /** traces it as SVG; null leaves the choice to the API, for keys without model selection */
  authorModel?: string | null;
  authorEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** how much thought goes into the reference picture */
  complexity?: "low" | "medium" | "high";
  size?: string;
  background?: "transparent" | "opaque" | "auto";
  signal?: AbortSignal;
  fetch?: typeof fetch;
};

export type SvgUsage = { input: number; output: number; reasoning: number; model?: string };

export type SvgResult = { markup: string; raw: string; warnings: string[]; ms: number };
export type SvgImageResult = SvgResult & { svgUsage?: SvgUsage; imageTokens?: number };

/** One drawing from the Images API as cleaned SVG markup.
 *
 *  Confirmed with one live call (2026-11-06, `gpt-image-2.6-sunburst` with `svg.model: "gpt-6.1-sol"`):
 *  request `{ model, prompt, n: 1, size: "1024x1024", output_format: "svg", complexity: "low",
 *  svg: { model, reasoning: { effort: "low" } } }`; answer after 24.4 s with no byte before it, 1.4 kB
 *  of JSON: `{ created, background: "transparent", output_format: "svg", quality: "medium",
 *  size: "1024x1024", data: [{ b64_json }], svg_usage: { input_tokens, output_tokens,
 *  reasoning_tokens, total_tokens, model }, usage: { input_tokens, output_tokens,
 *  output_tokens_details: { image_tokens } } }`. `b64_json` is the SVG text in base64 (621 bytes of
 *  markup: `<svg viewBox="0 0 1024 1024" width="1024" height="1024">`, a `<title>`, a full-size
 *  white `<rect>` behind everything despite `background: "transparent"`, flat fills, no text). */
export async function generateSvgImage(o: SvgImageOptions): Promise<SvgImageResult> {
  const base = trimSlash(o.baseUrl || "https://api.openai.com/v1");
  const f = o.fetch ?? globalThis.fetch;
  const t0 = Date.now();
  const res = await f(`${base}/images/generations`, {
    method: "POST",
    signal: o.signal,
    headers: { "content-type": "application/json", ...(o.key.trim() ? { authorization: `Bearer ${o.key.trim()}` } : {}) },
    body: JSON.stringify({
      model: o.model || "gpt-image-2.6-sunburst",
      prompt: o.prompt,
      n: 1,
      output_format: "svg",
      ...(o.size ? { size: o.size } : {}),
      ...(o.complexity ? { complexity: o.complexity } : {}),
      ...(o.background ? { background: o.background } : {}),
      ...(o.authorModel === null ? {} : { svg: { model: o.authorModel || "gpt-6.1-sol", ...(o.authorEffort ? { reasoning: { effort: o.authorEffort } } : {}) } }),
    }),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new LlmHttpError(e.status, e.message);
  }
  const j = (await res.json()) as { data?: { b64_json?: string; svg?: string }[]; svg_usage?: Record<string, unknown>; usage?: { output_tokens_details?: { image_tokens?: number } } };
  const first = j.data?.[0];
  const raw = typeof first?.svg === "string" ? first.svg : typeof first?.b64_json === "string" ? fromBase64(first.b64_json) : "";
  if (!raw) throw new Error("empty");
  const check = checkSvg(raw, false);
  if (!check.markup) throw new Error("svg");
  const u = j.svg_usage;
  return {
    markup: check.markup,
    raw,
    warnings: [...check.warnings, ...check.problems],
    ms: Date.now() - t0,
    ...(u ? { svgUsage: { input: Number(u.input_tokens ?? 0), output: Number(u.output_tokens ?? 0), reasoning: Number(u.reasoning_tokens ?? 0), model: typeof u.model === "string" ? u.model : undefined } } : {}),
    ...(j.usage?.output_tokens_details?.image_tokens !== undefined ? { imageTokens: j.usage.output_tokens_details.image_tokens } : {}),
  };
}

export type SvgStreamedOptions = SvgImageOptions & {
  /** the Responses model that calls the drawing tool, and the SVG author unless `authorModel` says otherwise */
  textModel?: string;
  /** "in_progress", "generating", … as the drawing goes along */
  onProgress?: (stage: string) => void;
};

/** The same drawing through the Responses API's image_generation tool, streamed. The Images API
 *  sends nothing until the drawing is done, and an intermediary that cuts a silent request after
 *  30 s (one did in testing) loses it; here the stream starts at once and reports its progress.
 *  It costs one short turn of the text model besides the drawing. */
export async function generateSvgImageStreamed(o: SvgStreamedOptions): Promise<SvgImageResult & { usage: Usage }> {
  const base = trimSlash(o.baseUrl || "https://api.openai.com/v1");
  const textModel = o.textModel || "gpt-6.1-sol";
  const t0 = Date.now();
  const tool = {
    type: "image_generation",
    model: o.model || "gpt-image-2.6-sunburst",
    output_format: "svg",
    ...(o.size ? { size: o.size } : {}),
    ...(o.complexity ? { complexity: o.complexity } : {}),
    ...(o.background ? { background: o.background } : {}),
    ...(o.authorModel === null ? {} : { svg: { model: o.authorModel || textModel, ...(o.authorEffort ? { reasoning: { effort: o.authorEffort } } : {}) } }),
  };
  const body = {
    model: textModel,
    instructions: "Draw exactly one image with the image generation tool, from the user's description as given. Do not answer in words.",
    input: [{ role: "user", content: [{ type: "input_text", text: o.prompt }] }],
    tools: [tool],
    tool_choice: { type: "image_generation" },
    reasoning: { effort: "low" },
    store: false,
    stream: true,
  };
  const headers: Record<string, string> = o.key.trim() ? { authorization: `Bearer ${o.key.trim()}` } : {};
  const events = await postSse({ baseUrl: base, model: textModel, key: o.key, fetch: o.fetch }, `${base}/responses`, headers, body, o.signal);
  let call: Record<string, unknown> | undefined;
  let usage = emptyUsage();
  for await (const sse of events) {
    const e = sseJson(sse.data);
    if (!e) continue;
    const type = String(e.type ?? sse.event);
    if (type.startsWith("response.image_generation_call.")) o.onProgress?.(type.slice("response.image_generation_call.".length));
    else if (type === "response.output_item.done" && (e.item as { type?: string })?.type === "image_generation_call") call = e.item as Record<string, unknown>;
    else if (type === "response.completed" || type === "response.incomplete") {
      usage = responsesUsage((e.response as { usage?: unknown })?.usage);
      call ??= ((e.response as { output?: Record<string, unknown>[] })?.output ?? []).find((it) => it.type === "image_generation_call");
      break;
    } else if (type === "response.failed") {
      const err = (e.response as { error?: { code?: string; message?: string } })?.error ?? {};
      throw streamError(err.code ?? "server_error", err.message ?? "the response failed");
    } else if (type === "error") throw streamError(e.code ?? "server_error", e.message);
  }
  if (call?.status === "failed" || call?.error) {
    const err = (call.error ?? {}) as { code?: string; message?: string };
    throw streamError(err.code ?? "invalid_prompt", err.message ?? "the drawing failed");
  }
  const raw = typeof call?.result === "string" && call.result ? fromBase64(call.result) : "";
  if (!raw) throw new Error("empty");
  const check = checkSvg(raw, false);
  if (!check.markup) throw new Error("svg");
  const u = call?.svg_usage as Record<string, unknown> | undefined;
  return {
    markup: check.markup,
    raw,
    warnings: [...check.warnings, ...check.problems],
    ms: Date.now() - t0,
    usage,
    ...(u ? { svgUsage: { input: Number(u.input_tokens ?? 0), output: Number(u.output_tokens ?? 0), reasoning: Number(u.reasoning_tokens ?? 0), model: typeof u.model === "string" ? u.model : undefined } } : {}),
  };
}

/* ---------- 2. the text model writes it ---------- */

export type SvgCodeOptions = {
  adapter: Adapter;
  prompt: string;
  /** the drawing's coordinate box (default "0 0 24 24", an icon's) */
  viewBox?: string;
  /** "current": one colour, the part's own (currentColor), with tints by opacity; "palette": these colours */
  colors?: "current" | string[];
  /** lettering drawn as outlines; SVG text is never kept */
  lettering?: boolean;
  /** a picture to draw from (a sketch, a screenshot) */
  reference?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onEvent?: (e: LlmEvent) => void;
};

export type SvgCodeResult = SvgResult & { attempts: number; usage: Usage };

export function svgSystemPrompt(o: Pick<SvgCodeOptions, "viewBox" | "colors" | "lettering">): string {
  const vb = o.viewBox || "0 0 24 24";
  const colors =
    !o.colors || o.colors === "current"
      ? 'Paint with fill="currentColor" and stroke="currentColor" so the editor\'s colour reaches the drawing; make lighter tones with fill-opacity or stroke-opacity, not other colours. Use a fixed colour only where the subject cannot do without one.'
      : `Use only these colours: ${o.colors.join(", ")}.`;
  return [
    "You draw one SVG for a UI design editor. Reply with the SVG markup only: a single <svg> element, no prose, no markdown fence.",
    "Rules:",
    `- The root is <svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"> with no width or height.`,
    `- Use only these elements: ${SVG_ELEMENTS.join(", ")}.`,
    "- No <text>, <image>, <foreignObject>, <style>, <script>, <filter>, animation, class attributes or event handlers.",
    '- Nothing outside the drawing: no http(s) or data: addresses. url(#id) and href="#id" may point only at elements of this SVG.',
    `- ${colors}`,
    o.lettering ? "- Lettering, if asked for, is drawn as outlined paths, never as text." : "- No letters, numbers or words anywhere in the drawing.",
    "- Keep it compact: well under 200 elements, coordinates with at most two decimals, shapes aligned to the viewBox with a little margin.",
  ].join("\n");
}

/** One drawing written by the text model, checked, and sent back once with the reasons when it broke
 *  the rules. Throws "svg" when even the second answer has nothing drawable. */
export async function generateSvgCode(o: SvgCodeOptions): Promise<SvgCodeResult> {
  const system = svgSystemPrompt(o);
  const first: UserPart[] = [{ type: "text", text: o.prompt.trim() }, ...(o.reference ? [{ type: "image" as const, dataUrl: o.reference }] : [])];
  const messages: Message[] = [{ role: "user", content: first }];
  const t0 = Date.now();
  let usage = emptyUsage();
  let last: SvgCheck | undefined;
  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const turn = await collectTurn(o.adapter, { system, messages, toolChoice: "none", maxOutputTokens: o.maxOutputTokens ?? 32000 }, o.signal, o.onEvent);
    usage = addUsage(usage, turn.usage);
    if (turn.stop === "refusal") throw new Error("refusal");
    raw = textOf(turn.message);
    last = checkSvg(raw);
    if (turn.stop === "max_tokens") last.problems.push("The SVG was cut off at the output limit: draw it with fewer, simpler shapes.");
    if (last.markup && !last.problems.length) return { markup: last.markup, raw, warnings: last.warnings, ms: Date.now() - t0, attempts: attempt, usage };
    if (attempt === 1) {
      messages.push(turn.message, { role: "user", content: `That SVG broke these rules:\n${last.problems.map((p) => `- ${p}`).join("\n")}\nReply with the corrected SVG only.` });
    }
  }
  if (!last?.markup) throw new Error(raw.trim() ? "svg" : "empty");
  /* the second answer still breaks a rule, but the sanitizer kept a drawing: it is used, and the reasons travel with it */
  return { markup: last.markup, raw, warnings: [...last.problems, ...last.warnings], ms: Date.now() - t0, attempts: 2, usage };
}
