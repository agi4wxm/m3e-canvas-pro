/* The tools that draw with a model: an SVG for the vector atom (the image model traced as SVG, or the text model writing
 * the code) and a picture for an image or a scene. A group of its own, so a client without keys (or an MCP server
 * without OPENAI_API_KEY) leaves it out; later work extends it here (kits and components built by a model, styles,
 * a screenshot redrawn as parts). */

import { generateImage, hasImageKey, type AiSettings } from "../ai";
import { generateSvgCode, generateSvgImageStreamed } from "../llm/svg";
import { describeNode, ops, type CoreState, type Schema } from "../core";
import { afterWrite } from "./ops";
import { tool, ToolFailure, type GenerateEnv, type Tool, type ToolEnv } from "./types";

const OPENAI = "https://api.openai.com/v1";

/** the key, address and models an SVG traced from the image model is asked with; null when there is no OpenAI key */
export function svgImageRoute(s: AiSettings): { key: string; baseUrl: string; model: string; textModel: string } | null {
  if ((s.imageProvider ?? "openai") !== "openai") return null;
  const key = s.imageKey?.trim() || (s.provider === "openai" ? s.key.trim() : "");
  if (!key) return null;
  return { key, baseUrl: s.imageBaseUrl?.trim() || OPENAI, model: s.imageModel?.trim() || "gpt-image-2.6-sunburst", textModel: s.provider === "openai" && s.model.trim() ? s.model.trim() : "gpt-6.1-sol" };
}

/* ---------- making a drawing fit for the canvas ---------- */

const num = (attrs: string, name: string): number | undefined => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  if (!m) return undefined;
  if (m[1].trim() === "100%") return Infinity;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : undefined;
};

/** Takes away the opaque rectangle the image model paints behind every drawing (even when asked for a transparent
 *  background): any rect that covers the whole viewBox from its corner. For icons and atoms, whose ground is the
 *  part they stand on. */
export function stripBackdrop(markup: string): string {
  const vb = /viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(markup);
  if (!vb) return markup;
  const [x0, y0, w, h] = vb.slice(1).map(Number);
  const covers = (attrs: string) => {
    const x = num(attrs, "x") ?? 0;
    const y = num(attrs, "y") ?? 0;
    const rw = num(attrs, "width");
    const rh = num(attrs, "height");
    if (rw === undefined || rh === undefined || /\stransform="/.test(attrs)) return false;
    return x <= x0 + w * 0.01 && y <= y0 + h * 0.01 && (rw === Infinity || x + rw >= x0 + w * 0.99) && (rh === Infinity || y + rh >= y0 + h * 0.99);
  };
  return markup.replace(/<rect\b([^>]*?)\/>/g, (all, attrs: string) => (covers(attrs) ? "" : all)).replace(/<rect\b([^>]*?)><\/rect>/g, (all, attrs: string) => (covers(attrs) ? "" : all));
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const lightness = (hex: string) => {
  const h = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** what one painted color becomes in a one-color icon */
const inkOf = (v: string) => {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent" || s.startsWith("url(")) return s === "transparent" ? "none" : v;
  if (s === "white" || (HEX.test(s) && lightness(s) > 0.85)) return "none";
  return "currentColor";
};

/** A drawing in one color, the part's own (currentColor), so it follows the theme like an icon: dark paint becomes
 *  the ink, near-white paint (the holes the image model paints white) becomes nothing. */
export function toCurrentColor(markup: string): string {
  return markup
    .replace(/\s(fill|stroke)="([^"]*)"/g, (_all, k: string, v: string) => ` ${k}="${inkOf(v)}"`)
    .replace(/\sstyle="([^"]*)"/g, (_all, css: string) => ` style="${css.replace(/(^|;)\s*(fill|stroke)\s*:\s*([^;]+)/g, (_m, sep: string, k: string, v: string) => `${sep}${k}:${inkOf(v)}`)}"`);
}

/* ---------- placing what was drawn ---------- */

type Place = { screen?: string; at?: { x: number; y: number }; into?: { container: string; index?: number }; replace?: string; id?: string };

/** where a part that takes another's place goes: the same place in the same layout, or the same spot */
function placeOf(s: CoreState, widths: Record<string, number>, id: string): { into?: { container: string; index: number }; screen?: string; at?: { x: number; y: number }; size: { w: number; h: number } } {
  const d = describeNode(s.doc as never, widths, id);
  if (!d) throw new ToolFailure("not_found", `There is no part ${JSON.stringify(id)} to replace.`, "find_nodes gives the ids of the parts.");
  const size = { w: d.bounds.w, h: d.bounds.h };
  const g = s.doc.groups.find((x) => x.items.some((it) => it.id === id))!;
  if (g.inFlow && d.inLayout && !d.inLayout.absolute) {
    const kids = s.doc.groups.filter((x) => x.inFlow === g.inFlow && !(x.items.length === 1 && x.items[0].flowAbsolute));
    const host = s.doc.groups.find((x) => x.id === g.inFlow)!;
    return { into: { container: host.items[0].id, index: Math.max(0, kids.indexOf(g)) }, size };
  }
  return { screen: d.screen?.id, at: { x: d.bounds.x, y: d.bounds.y }, size };
}

/** Puts a new part where the caller asked, or in place of another, as one change. */
function put(env: ToolEnv, slug: string, props: Record<string, unknown>, p: Place, size?: { w?: number; h?: number }): { itemId: string; replaced?: string } {
  const store = env.store;
  const prev = store.get();
  const widths = store.ctx(env.origin).widths;
  const where = p.replace ? placeOf(prev, widths, p.replace) : undefined;
  const w = size?.w ?? where?.size.w;
  const h = size?.h ?? where?.size.h;
  const sized = { ...props, ...(w ? { width: Math.max(4, Math.round(w)) } : {}), ...(h ? { height: Math.max(4, Math.round(h)) } : {}) };
  const out = store.transact(
    p.replace ? `Replace with ${slug}` : `Add ${slug}`,
    env.origin,
    (tx) => {
      if (p.replace) tx.run(ops.removeNodes, { ids: [p.replace] });
      const target = where ?? p;
      return tx.run(ops.addPart, { slug, props: sized, ...(p.id ? { id: p.id } : {}), ...(target.into ? { into: target.into } : {}), ...(target.screen ? { screen: target.screen } : {}), ...(target.at ? { at: target.at } : {}) });
    },
    env.history ? { history: env.history } : {},
  );
  afterWrite(env, prev);
  return { itemId: out.itemId, ...(p.replace ? { replaced: p.replace } : {}) };
}

const PLACE: Record<string, Schema> = {
  replace: { type: "string", description: "a part to take the place of (an icon in a tab bar, a placeholder): same spot in its layout, same size" },
  into: { type: "object", properties: { container: { type: "string" }, index: { type: "integer" } }, required: ["container"], description: "a box's auto layout to put it in" },
  screen: { type: "string" },
  at: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], description: "its top left, from the screen's top left" },
  id: { type: "string", description: "an id for the new part" },
};

function needGen(env: ToolEnv): GenerateEnv {
  if (!env.gen) throw new ToolFailure("unavailable", "Drawing with a model is not set up here.", "Use the svg atom's library shapes, an icon, or ask the author to add an API key.");
  if (env.gen.budget && env.gen.budget.left <= 0) throw new ToolFailure("refused", "No more drawings are allowed this turn.", "Use what was drawn already, an icon or the svg atom's library shapes.");
  return env.gen;
}
const spend = (gen: GenerateEnv) => {
  if (gen.budget) gen.budget.left--;
};

/* ---------- the tools ---------- */

type SvgArgs = Place & { prompt: string; route?: "image" | "code"; kind?: "icon" | "illustration"; width?: number; height?: number; colors?: string[] };

export const generateSvg = tool<SvgArgs>({
  name: "generate_svg",
  group: "generate",
  description:
    "Draws a custom SVG and puts it on the canvas as a vector (svg) part: a new icon, a logo, an illustration, a decoration nothing in the catalog has. `kind: icon` (the default) gives a one-color drawing in the part's own color with no background, like an icon. route `image` (the default when an OpenAI key is set) has the image model draw it and trace it as SVG, about 30 s; `code` has the text model write the SVG, quicker and plainer. `replace` puts it in place of another part (an icon in a tab bar). Costs a model call: check the catalog and the icons first.",
  input: { type: "object", properties: { prompt: { type: "string", description: "what to draw, concretely: subject, style, no text" }, route: { type: "string", enum: ["image", "code"] }, kind: { type: "string", enum: ["icon", "illustration"] }, width: { type: "number", minimum: 4, maximum: 1600 }, height: { type: "number", minimum: 4, maximum: 1600 }, colors: { type: "array", items: { type: "string" }, description: "hex colors an illustration written as code may use" }, ...PLACE }, required: ["prompt"], additionalProperties: false },
  output: "{itemId, route, warnings, ms}",
  readOnly: false,
  destructive: false,
  async run(a, env) {
    const gen = needGen(env);
    const icon = (a.kind ?? "icon") === "icon";
    const traced = svgImageRoute(gen.settings);
    const route = a.route === "code" || !traced ? "code" : "image";
    if (route === "code" && !gen.adapter) throw new ToolFailure("unavailable", "There is no text model to write the SVG.", "Use an icon instead.");
    spend(gen);
    const warnings: string[] = [];
    if (a.route === "image" && !traced) warnings.push("No OpenAI image key is set, so the text model wrote the SVG instead.");
    let markup: string;
    let ms: number;
    if (route === "image") {
      const ask = icon ? `A simple flat icon: ${a.prompt}. One solid dark color on a transparent background, bold simple shapes, centered with a small margin, no text, no shadow, no frame.` : `${a.prompt}. Flat vector illustration, no text.`;
      const r = await generateSvgImageStreamed({ prompt: ask, key: traced!.key, baseUrl: traced!.baseUrl, model: traced!.model, textModel: traced!.textModel, complexity: icon ? "low" : "medium", background: "transparent", size: "1024x1024", signal: env.signal, fetch: gen.fetch });
      markup = icon ? toCurrentColor(stripBackdrop(r.markup)) : r.markup;
      warnings.push(...r.warnings);
      ms = r.ms;
    } else {
      const w = a.width ?? (icon ? 24 : 240);
      const h = a.height ?? (icon ? 24 : 160);
      const r = await generateSvgCode({ adapter: gen.adapter!, prompt: a.prompt, viewBox: icon ? "0 0 24 24" : `0 0 ${Math.round(w)} ${Math.round(h)}`, colors: icon ? "current" : a.colors?.length ? a.colors : undefined, signal: env.signal });
      markup = icon ? stripBackdrop(r.markup) : r.markup;
      warnings.push(...r.warnings);
      ms = r.ms;
    }
    const size = { w: a.width ?? (a.replace ? undefined : icon ? 24 : 240), h: a.height ?? (a.replace ? undefined : icon ? 24 : 240) };
    const placed = put(env, "svg", { mode: "markup", markup, label: a.prompt.slice(0, 60) }, a, size);
    return { result: { ...placed, route, ...(warnings.length ? { warnings } : {}), ms } };
  },
});

type ImageArgs = Place & { prompt: string; width?: number; height?: number };

export const generateImageTool = tool<ImageArgs>({
  name: "generate_image",
  group: "generate",
  description:
    "Paints a picture with the image model (about 20–40 s): with `replace` naming an image, a scene or another part, that part gets it (an image or scene keeps its place and takes the picture; any other part is replaced by an image); else a new image part. Say what it shows, never words or interface in it. Costs an image call: only for real content pictures.",
  input: { type: "object", properties: { prompt: { type: "string" }, width: { type: "number", minimum: 24, maximum: 1600 }, height: { type: "number", minimum: 24, maximum: 1600 }, ...PLACE }, required: ["prompt"], additionalProperties: false },
  output: "{itemId}",
  readOnly: false,
  destructive: false,
  async run(a, env) {
    const gen = needGen(env);
    if (!hasImageKey(gen.settings)) throw new ToolFailure("unavailable", "No image model key is set.", "Leave the picture empty; the author can paint it later.");
    const s = env.store.get();
    const target = a.replace ? s.doc.groups.flatMap((g) => g.items).find((it) => it.id === a.replace) : undefined;
    if (a.replace && !target) throw new ToolFailure("not_found", `There is no part ${JSON.stringify(a.replace)}.`, "find_nodes gives the ids of the parts.");
    const widths = env.store.ctx(env.origin).widths;
    const box = target ? describeNode(s.doc as never, widths, target.id)!.bounds : { w: a.width ?? 240, h: a.height ?? 160 };
    spend(gen);
    const t0 = Date.now();
    const picture = await generateImage(gen.settings, `${a.prompt}. No text, letters, logos or user interface in the picture.`, { w: box.w, h: box.h }, env.signal);
    const ms = Date.now() - t0;
    if (target && (target.component === "image" || target.component === "scene")) {
      const prev = env.store.get();
      env.store.run(ops.setProps, { id: target.id, props: target.component === "image" ? { src: picture } : { image: picture } }, { origin: env.origin, ...(env.history ? { history: env.history } : {}) });
      afterWrite(env, prev);
      return { result: { itemId: target.id, ms } };
    }
    const placed = put(env, "image", { src: picture, alt: a.prompt.slice(0, 80) }, a, { w: a.width, h: a.height });
    return { result: { ...placed, ms } };
  },
});

export const GENERATE_TOOLS: Tool<never>[] = [generateSvg, generateImageTool] as unknown as Tool<never>[];
