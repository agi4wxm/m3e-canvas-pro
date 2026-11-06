import {
  COLOR_TOKENS,
  BACK_TARGET,
  LINK_TARGET,
  GAP,
  PHONE_H,
  PHONE_W,
  explodeGroup,
  frameLengthOf,
  frameOfPart,
  frameSizeOf,
  groupBounds,
  layoutOf,
  linkUrlOf,
  normalizeTheme,
  ownerIdOf,
  unionRect,
  type Action,
  type Doc,
  type Frame,
  type Group,
  type Item,
} from "../../tokens";
import { partBySlug, reader } from "../../../parts/registry";
import type { PartDef } from "../../../parts/types";
import { fullWidth, roleOf } from "../../../parts/role";
import { sanitizeSvg } from "../../../parts/svg";
import { isNode, type PNode } from "../../../parts/node";
import { str } from "../../../parts/print";
import type { Node } from "../../../parts/templates/kit";
import { expandDoc } from "../../expand";
import { getLang } from "../../i18n";
import { childLayoutOf, flowOf, outOfPane, sizingOf, type Flow } from "../../flow";
import { cleanLook } from "../../look";
import { kitLookOf } from "../../kits";
import { withDocStyles } from "../../styles";
import { pinOf } from "../../tidy";
import { NATIVE, isNative, kitPropName } from "../../../rn/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../rn/src/kit/parts.generated";
import { SET_ONLY, plainTree, propValues, type PlainNode } from "./data";

/* The React Native code of a document: one screen component per screen, built from the kit (rn/src/kit), the way
 * lib/codegen.ts prints the web's. A screen is the design's: what stands loose is placed where it stands (`At`), the bars
 * are pinned to their edge (`Pin`), what an auto layout holds is nested in it and laid out by it, and each part is the
 * kit's component with the part's own props. A part the kit has no component for is printed as the tree of atoms it
 * splits into, or as a `Placeholder` that names it; each of those is reported.
 *
 * Every word of the document goes into the code as a string (`str`), never as JSX text or a comment, and every name
 * the code is given (a component, a screen's key) is made of letters and digits only (lib/exportInjection.test.ts). */

/** something the printed app does not do as the design says, for the exporter to list */
export type RnWarning = {
  kind: "placeholder" | "atoms" | "holder" | "effects" | "condition" | "hidden" | "trigger" | "slot" | "look" | "image" | "unknown";
  /** the screen, by its name */
  screen?: string;
  /** the part, by its id */
  part?: string;
  detail: string;
};

export type RnScreen = {
  id: string;
  /** what `nav.go("…")` knows it by */
  key: string;
  /** the component's name, which is its file's name too */
  component: string;
  width: number;
  height: number;
  source: string;
};

export type RnScreens = {
  screens: RnScreen[];
  warnings: RnWarning[];
  /** every icon name the screens draw */
  icons: string[];
  /** the screen an app opens on, and each flow's first screen */
  initial: string;
  flows: { name: string; screen: string }[];
};

export type RnPrintOptions = {
  /** where the kit is, from a screen's file */
  kitImport?: string;
  /** the path a picture the document holds as data is written to */
  image?: (data: string) => string;
};

/* ---------- JSX as data ---------- */

/** an element: a kit component (or `View`) with its props, each an expression already printed, and what it holds */
type J = { tag: string; props: [string, string][]; kids: J[] };

const el = (tag: string, props: [string, string][] = [], kids: J[] = []): J => ({ tag, props, kids });

/** an attribute's name: only names the printer chose, made of letters */
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** a value as an expression: numbers, words (as strings), lists and objects of them */
export function expr(v: unknown): string {
  if (v === null || v === undefined) return "undefined";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "0";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) return `[${v.map(expr).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return `{ ${entries.map(([k, x]) => `${NAME.test(k) ? k : str(k)}: ${expr(x)}`).join(", ")} }`;
  }
  return "undefined";
}

/** an attribute as JSX writes it: a bare word for true, a quoted string when it holds nothing a quote could end */
function attr(name: string, value: string): string {
  if (value === "true") return name;
  if (/^"[\w .,:#%/()+-]*"$/.test(value)) return `${name}=${value}`;
  return `${name}={${value}}`;
}

/** an element as indented JSX */
function jsx(j: J, depth: number): string {
  const pad = "  ".repeat(depth);
  const attrs = j.props.map(([k, v]) => attr(k, v));
  const open = `<${j.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const long = pad.length + open.length > 120;
  const head = long ? `<${j.tag}\n${attrs.map((a) => `${pad}  ${a}`).join("\n")}\n${pad}` : open;
  if (!j.kids.length) return `${pad}${head}${long ? "/>" : " />"}`;
  return `${pad}${head}>\n${j.kids.map((k) => jsx(k, depth + 1)).join("\n")}\n${pad}</${j.tag}>`;
}

/* ---------- names ---------- */

/** a name made of the letters and digits of the author's words, unique among those taken */
function nameOf(words: string, fallback: string, taken: Set<string>, suffix = ""): string {
  const parts = (words.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w[0].toUpperCase() + w.slice(1));
  let base = parts.join("");
  if (!base || /^\d/.test(base)) base = fallback;
  else if (suffix && !base.endsWith(suffix)) base += suffix;
  let out = base;
  for (let i = 2; taken.has(out); i++) out = `${base}${i}`;
  taken.add(out);
  return out;
}


/** the printer's own characters (U+E000 to U+E01F) are cleared from a document's words first, as lib/codegen.ts does */
const PRINTER_MARKS = /[-]/g;
function withoutMarks<T>(value: T): T {
  if (typeof value === "string") return value.replace(PRINTER_MARKS, "") as T;
  if (Array.isArray(value)) return value.map(withoutMarks) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [withoutMarks(k), withoutMarks(v)])) as T;
  return value;
}

/* ---------- a part's props ---------- */

/** the icon names a part's props draw: its icon props and the icons of its rows */
export function iconNamesOf(slug: string, props: Record<string, unknown>): string[] {
  const def = partBySlug(slug);
  if (!def) return [];
  const out: string[] = [];
  for (const d of def.props) {
    const v = props[d.key] ?? props[kitPropName(slug, d.key)];
    if (d.kind === "icon" && typeof v === "string" && v) out.push(v);
    if (d.kind === "list" && Array.isArray(v)) for (const row of v) if (row && typeof row === "object" && typeof (row as { icon?: unknown }).icon === "string" && (row as { icon: string }).icon) out.push((row as { icon: string }).icon);
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Markup the editor cleaned, written back as markup for the kit's `SvgXml`: only what `sanitizeSvg` kept, every value
 *  escaped for an attribute. */
function svgMarkup(markup: string, scope: string): string | undefined {
  const clean = sanitizeSvg(markup, scope);
  if (!clean) return undefined;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const kebabAttr = (k: string) => (/^(viewBox|preserveAspectRatio|gradientUnits|gradientTransform|patternUnits|patternTransform|spreadMethod|markerWidth|markerHeight|refX|refY|maskUnits|clipPathUnits|stdDeviation|textLength|lengthAdjust|pathLength)$/.test(k) ? k : k === "className" ? "class" : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  const attrs = (props: Record<string, unknown> | undefined) =>
    Object.entries(props ?? {})
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => ` ${kebabAttr(k)}="${esc(String(v))}"`)
      .join("");
  const node = (n: PNode | string): string => (typeof n === "string" ? esc(n) : isNode(n) ? `<${n.type}${attrs(n.props as Record<string, unknown>)}>${(n.children ?? []).map(node).join("")}</${n.type}>` : "");
  return `<svg xmlns="http://www.w3.org/2000/svg"${attrs({ ...clean.attrs, viewBox: clean.viewBox, fill: clean.attrs.fill ?? "currentColor" })}>${clean.children.map(node).join("")}</svg>`;
}

/* ---------- one screen ---------- */

type Screens = { keys: Map<string, string>; names: Map<string, string> };

class ScreenPrinter {
  /** the kit's components this screen names */
  kit = new Set<string>(["At", "Screen"]);
  view = false;
  nav = false;
  icons = new Set<string>();

  constructor(
    readonly doc: Doc,
    readonly frame: Frame,
    readonly widths: Record<string, number>,
    readonly all: Group[],
    readonly screens: Screens,
    readonly warnings: RnWarning[],
    readonly o: RnPrintOptions,
  ) {}

  warn(kind: RnWarning["kind"], detail: string, part?: string) {
    this.warnings.push({ kind, screen: this.frame.name, ...(part ? { part } : {}), detail });
  }

  /** a tap as a call: to a screen (over this one when it is an overlay), back, out to an address */
  action(a: Action | undefined, part: string): string | undefined {
    if (!a) return undefined;
    if (a.trigger) this.warn("trigger", "a hover or delayed trigger is printed as a tap", part);
    if (a.when || a.else) this.warn("condition", "a tap's condition is not printed: it always takes its first branch", part);
    if (a.effects?.length) this.warn("effects", "what a tap sets or shows (variables, parts, snackbars) is printed as nav.todo", part);
    const call = this.call(a);
    if (call) this.nav = true;
    return call;
  }

  call(a: Action): string | undefined {
    if (a.to === BACK_TARGET) return "() => nav.back()";
    if (a.to === LINK_TARGET) {
      const url = linkUrlOf(a);
      return url ? `() => nav.open(${str(url)})` : undefined;
    }
    const key = this.screens.keys.get(a.to);
    if (key) return a.overlay ? `() => nav.go(${str(key)}, { overlay: true })` : `() => nav.go(${str(key)})`;
    if (a.effects?.length || a.scrollTo) return `() => nav.todo(${str(a.scrollTo ? "scrollTo" : "effects")})`;
    return undefined;
  }

  /** what an item carries beside its props: its look and its taps */
  extras(it: Item, slots = true): [string, string][] {
    const out: [string, string][] = [];
    if (it.fill && COLOR_TOKENS.some((t) => t.key === it.fill)) out.push(["fill", str(it.fill)]);
    if (it.textColor) out.push(["textColor", str(it.textColor)]);
    if (it.corners) out.push(["corners", expr({ tl: it.corners.tl, tr: it.corners.tr, br: it.corners.br, bl: it.corners.bl })]);
    const look = cleanLook(it.look);
    if (look) {
      if (look.texture) this.warn("look", "a texture is not drawn on a phone", it.id);
      out.push(["look", expr(look)]);
    }
    const tap = this.action(it.action, it.id);
    if (tap) out.push(["onPress", tap]);
    const wired = Object.entries(it.actions ?? {}).filter(([, a]) => !!a);
    if (wired.length && !slots) this.warn("slot", "a tap on a place inside a part drawn as atoms is not kept", it.id);
    const taps = slots
      ? wired.map(([slot, a]) => [slot, this.action(a, it.id)] as const).filter((x): x is readonly [string, string] => !!x[1])
      : [];
    if (taps.length) out.push(["taps", `{ ${taps.map(([s, f]) => `${str(s)}: ${f}`).join(", ")} }`]);
    return out;
  }

  /** a part's own props as the kit takes them: what differs from the kit's defaults, under the kit's names */
  props(def: PartDef, it: Item): [string, string][] {
    const values = propValues(def, it.props);
    const defaults = KIT_PARTS[def.slug]?.defaults ?? {};
    const out: [string, string][] = [];
    for (const d of def.props) {
      const key = kitPropName(def.slug, d.key);
      let v = values[d.key];
      if (SET_ONLY.has(d.key) && !(it.props && typeof it.props[d.key] === "number")) continue;
      if (d.kind === "image" && typeof v === "string" && v.startsWith("data:")) {
        v = this.o.image ? this.o.image(v) : "";
        this.warn("image", "a picture held in the document is written to a file", it.id);
      }
      if (d.kind === "list" && Array.isArray(v)) v = (v as Record<string, unknown>[]).map((row) => (typeof row.image === "string" && row.image.startsWith("data:") ? { ...row, image: this.o.image ? this.o.image(row.image) : "" } : row));
      if (def.slug === "svg" && d.key === "markup" && typeof v === "string" && v) v = svgMarkup(v, it.id) ?? "";
      if (!SET_ONLY.has(d.key) && same(v, defaults[key])) continue;
      out.push([key, expr(v)]);
    }
    for (const n of iconNamesOf(def.slug, values)) this.icons.add(n);
    return out;
  }

  /** a tree of atoms (a split) as elements, the root wearing the item's look and taps */
  tree(n: PlainNode, root?: Item, dir = "column", stretch = false): J {
    const name = (NATIVE as Record<string, string>)[n.slug];
    if (!name) {
      this.kit.add("Placeholder");
      return el("Placeholder", [["part", str(n.slug)]]);
    }
    this.kit.add(name);
    for (const i of iconNamesOf(n.slug, n.props)) this.icons.add(i);
    const props: [string, string][] = Object.entries(n.props).map(([k, v]) => [k, expr(v)]);
    if (n.fill) props.push(["fill", str(n.fill)]);
    if (n.textColor) props.push(["textColor", str(n.textColor)]);
    if (n.corners) props.push(["corners", expr(n.corners)]);
    if (n.look) props.push(["look", expr(cleanLook(n.look))]);
    if (root) props.push(...this.extras(root, false));
    const own = (n.props.layout as string | undefined) ?? (n.slug === "box" ? "column" : "free");
    const kids = (n.kids ?? []).map((k) => this.tree(k, undefined, own, n.props.align === "stretch"));
    const self = el(name, props, kids);
    const across = dir !== "row" && stretch;
    const tall = dir === "row" && stretch;
    if (!n.grow && !across && !tall) return self;
    this.kit.add("Cell");
    return el("Cell", [["dir", str(dir === "grid" ? "grid" : dir)], ...(n.grow ? ([["grow", "true"]] as [string, string][]) : []), ...(across ? ([["fillWidth", "true"]] as [string, string][]) : []), ...(tall ? ([["fillHeight", "true"]] as [string, string][]) : [])], [self]);
  }

  /** one part: the kit's component, the atoms it splits into, or a placeholder naming it */
  part(it: Item, kids: J[] = [], layout: [string, string][] = []): J {
    const def = partBySlug(it.component);
    if (!def) {
      this.warn("unknown", "a part no definition stands for", it.id);
      this.kit.add("Placeholder");
      return el("Placeholder", [["part", str(typeof it.component === "string" ? it.component.replace(/[^\w-]+/g, "").slice(0, 60) : "")]]);
    }
    if (isNative(def.slug)) {
      const name = NATIVE[def.slug];
      this.kit.add(name);
      /* what the layout says of a layout's own size stands over the part's props of the same name */
      const own = new Set(layout.map(([k]) => k));
      return el(name, [...this.props(def, it).filter(([k]) => !own.has(k)), ...layout, ...this.extras(it)], kids);
    }
    if (def.atoms && !kids.length) {
      this.warn("atoms", `drawn as the atoms it splits into (${def.slug})`, it.id);
      const tree = def.atoms(reader(def, it.props), kitLookOf(normalizeTheme(this.doc.theme))) as Node;
      return this.tree(plainTree(tree, getLang()), it);
    }
    this.kit.add("Placeholder");
    this.warn(kids.length ? "holder" : "placeholder", `${def.slug} has no component in the kit`, it.id);
    const size = this.size(it);
    return el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)], ...layout, ...this.extras(it)], kids);
  }

  size(it: Item) {
    const def = partBySlug(it.component);
    return { w: Math.round(this.widths[it.id] ?? def?.w ?? 120), h: Math.round(this.widths[`${it.id}:h`] ?? def?.h ?? 40) };
  }

  /** what a part in a layout asks of it, as the props of the `Cell` around it */
  cell(run: Group, parent: Flow, origin: { x: number; y: number }): [string, string][] {
    const it = run.items.length === 1 ? run.items[0] : undefined;
    const c = childLayoutOf(it);
    if (c.absolute) return [["x", expr(run.x - origin.x)], ["y", expr(run.y - origin.y)]];
    const w = sizingOf(it, parent, "w");
    const h = sizingOf(it, parent, "h");
    const out: [string, string][] = [];
    const flag = (k: string) => out.push([k, "true"]);
    const selfAlign = c.self && c.self !== "stretch" ? c.self : undefined;
    if (parent.dir === "grid") {
      if (c.span > 1) out.push(["span", expr(Math.min(c.span, parent.columns))]);
      if (w === "fill") flag("fillWidth");
      if (h === "fill") flag("fillHeight");
      if (selfAlign) out.push(["self", str(selfAlign)]);
    } else {
      const main = parent.dir === "row" ? w : h;
      const cross = parent.dir === "row" ? h : w;
      const across = c.self ?? parent.align;
      if (main === "fill") flag("grow");
      if (cross === "fill") flag(parent.dir === "row" ? "fillHeight" : "fillWidth");
      if (cross === "fill" && across !== "stretch") flag("stretch");
      else if (cross !== "fill" && across === "stretch") out.push(["self", str("start")]);
      else if (selfAlign) out.push(["self", str(selfAlign)]);
    }
    for (const [axis, key] of [["w", "W"], ["h", "H"]] as const) {
      if (c.min[axis] !== undefined) out.push([`min${key}`, expr(c.min[axis])]);
      if (c.max[axis] !== undefined) out.push([`max${key}`, expr(c.max[axis])]);
    }
    if (out.length) out.unshift(["dir", str(parent.dir)]);
    return out;
  }

  /** a layout's own size on each axis: what it holds, unless the layout around it fills that axis or it says otherwise */
  hugs(run: Group, flow: Flow, parent: Flow | undefined, flowing: boolean): [string, string][] {
    const it = run.items[0];
    const one = (axis: "w" | "h") => {
      if (!flowing) return false;
      const own = axis === "w" ? flow.hugW : flow.hugH;
      if (!parent) return own;
      const s = sizingOf(it, parent, axis);
      if (s === "fill" && !(axis === "w" ? parent.hugW : parent.hugH)) return false;
      const set = childLayoutOf(it).size[axis];
      return set === "hug" ? true : set === "fixed" ? false : own;
    };
    const def = KIT_PARTS[it.component ?? ""]?.defaults ?? {};
    const out: [string, string][] = [];
    for (const [axis, key] of [["w", "hugWidth"], ["h", "hugHeight"]] as const) {
      const v = one(axis);
      if (v !== def[key]) out.push([key, expr(v)]);
    }
    return out;
  }

  /** a run a layout holds: the part, and nested in it what it lays out */
  flow(run: Group, parent?: Flow, origin = { x: 0, y: 0 }): J {
    if (run.expandedFrom !== undefined && parent) return this.instance(run);
    if (run.hidden) this.warn("hidden", "a part hidden until something shows it is not printed", run.items[0]?.id);
    if (run.showWhen) this.warn("condition", "a part shown on a condition is printed always", run.items[0]?.id);
    const asked = parent ? this.cell(run, parent, origin) : [];
    const boxed = (j: J): J => (asked.length ? (this.kit.add("Cell"), el("Cell", asked, [j])) : j);
    const flow = run.items.length === 1 ? flowOf(run) : null;
    if (!flow) {
      if (run.items.length === 1) return boxed(this.part(run.items[0]));
      this.view = true;
      return boxed(el("View", [["style", expr({ flexDirection: run.axis === "x" ? "row" : "column", gap: GAP })]], run.items.map((x) => this.part(x))));
    }
    const kids = this.all.filter((g) => g.inFlow === run.id && !g.locked && !g.hidden);
    const flowing = kids.some((k) => !childLayoutOf(k.items.length === 1 ? k.items[0] : undefined).absolute);
    const box = { x: run.x + flow.inset.l, y: run.y + flow.inset.t };
    const held = kids.map((k) => this.flow(k, flow, box));
    return boxed(this.part(run.items[0], held, this.hugs(run, flow, parent, flowing)));
  }

  /** an instance standing in a layout: a box of its size, its parts placed inside it */
  instance(run: Group): J {
    const kids = this.all.filter((g) => g.id.startsWith(`${run.id}/`) && !g.inFlow).sort((a, b) => a.y - b.y || a.x - b.x);
    const { width, height } = (run.items[0].props ?? {}) as { width?: number; height?: number };
    this.view = true;
    return el("View", [["style", expr({ width: Math.round(width ?? 0), height: Math.round(height ?? 0) })]], kids.map((k) => this.at(k, { x: run.x, y: run.y })));
  }

  /** a run standing loose, placed from the top left of what it stands on */
  at(run: Group, origin: { x: number; y: number }): J {
    const flow = run.items.length === 1 ? flowOf(run) : null;
    const at = flow ? { x: run.x, y: run.y } : (layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y });
    return el("At", [["x", expr(at.x - origin.x)], ["y", expr(at.y - origin.y)]], [this.flow(run)]);
  }

  /** the screen's body: every run on it, the bars pinned to their edge */
  body(): J[] {
    const hosts = new Set(this.all.filter((r) => flowOf(r)).map((r) => r.id));
    const runs = [...this.all].sort((a, b) => a.y - b.y || a.x - b.x);
    const { h } = frameSizeOf(this.frame);
    const out: J[] = [];
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      /* what an instance placed by a layout holds is printed with it */
      if (ownerIdOf(run.id) && this.all.some((g) => g.id === ownerIdOf(run.id) && g.expandedFrom !== undefined)) continue;
      if (run.hidden) {
        this.warn("hidden", "a part hidden until something shows it is not printed", run.items[0]?.id);
        continue;
      }
      const first = run.items[0];
      const role = first ? roleOf(first) : undefined;
      const pin = pinOf(run, this.frame, this.widths);
      const top = Math.round(run.y - this.frame.y);
      if (run.items.length === 1 && first && fullWidth(first) && (role === "top" || role === "bottom" || role === "floatingBottom")) {
        const atFoot = role !== "top" && (pin === "foot" || top + this.size(first).h >= frameLengthOf(this.frame) - 1 || frameLengthOf(this.frame) === h);
        if (role === "top" ? top <= 32 || pin === "head" : atFoot) {
          this.kit.add("Pin");
          out.push(el("Pin", [["edge", str(role === "floatingBottom" ? "floatingBottom" : role)]], [this.flow(run)]));
          continue;
        }
      }
      if (run.items.length === 1 && first && fullWidth(first)) {
        out.push(el("At", [["y", expr(top)], ["span", "true"]], [this.flow(run)]));
        continue;
      }
      out.push(this.at(run, { x: this.frame.x, y: this.frame.y }));
    }
    return out;
  }
}

/** Every screen of a document as React Native code on the kit, read in the document's own styles */
export function printRnScreens(source: Doc, widths: Record<string, number>, o: RnPrintOptions = {}): RnScreens {
  return withDocStyles(source.styles, () => screensOf(source, widths, o));
}

function screensOf(source: Doc, widths: Record<string, number>, o: RnPrintOptions): RnScreens {
  const doc = expandDoc(withoutMarks(source), widths);
  const kitImport = o.kitImport ?? "../../kit";
  let frames = doc.frame === "phone" ? doc.frames : [];
  if (!frames.length && doc.groups.length) {
    const { l, t, r, b } = unionRect(doc.groups.map((g) => groupBounds(g, widths)));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(b - t)) }];
  }
  const taken = new Set<string>();
  const keys = new Set<string>();
  const screens: Screens = { keys: new Map(), names: new Map() };
  frames.forEach((f, i) => {
    const component = nameOf(f.name, `Screen${i + 1}`, taken, "Screen");
    screens.names.set(f.id, component);
    screens.keys.set(f.id, nameOf(f.name, `screen${i + 1}`, keys));
  });
  const warnings: RnWarning[] = [];
  const icons = new Set<string>();
  const offTab = outOfPane(doc.groups, widths);
  const printed = frames.map((frame): RnScreen => {
    const all = doc.groups.filter((g) => (frames.length === 1 && frame.id === "canvas") || frameOfPart(g, doc.groups, frames, widths)?.id === frame.id).filter((g) => !offTab.has(g.id)).flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]));
    const p = new ScreenPrinter(doc, frame, widths, all, screens, warnings, o);
    const body = p.body();
    p.icons.forEach((n) => icons.add(n));
    const { w, h } = frameSizeOf(frame);
    const length = frameLengthOf(frame);
    const bg = frame.bg && COLOR_TOKENS.some((t) => t.key === frame.bg) ? frame.bg : undefined;
    const screen = el("Screen", [...(bg ? ([["bg", str(bg)]] as [string, string][]) : []), ["width", expr(w)], ["height", expr(h)], ...(length > h ? ([["length", expr(length)]] as [string, string][]) : [])], body);
    if (!body.some((j) => j.tag === "At")) p.kit.delete("At");
    if (p.nav) p.kit.add("useNav");
    const component = screens.names.get(frame.id)!;
    const imports = [...(p.view ? ['import { View } from "react-native";'] : []), `import { ${[...p.kit].sort().join(", ")} } from ${str(kitImport)};`];
    const source = [
      "// Generated by M3E Canvas from the design. Do not edit: change the design and export again.",
      ...imports,
      "",
      `export function ${component}() {`,
      ...(p.nav ? ["  const nav = useNav();"] : []),
      "  return (",
      jsx(screen, 2),
      "  );",
      "}",
      "",
    ].join("\n");
    return { id: frame.id, key: screens.keys.get(frame.id)!, component, width: w, height: h, source };
  });
  const flows = frames.filter((f) => typeof f.flow === "string" && f.flow).map((f) => ({ name: f.flow!, screen: screens.keys.get(f.id)! }));
  return { screens: printed, warnings, icons: [...icons].sort(), initial: flows[0]?.screen ?? printed[0]?.key ?? "screen1", flows };
}

/** the index of the screens: each by its key, the one the app opens on, and the flows */
export function screensIndex(printed: RnScreens): string {
  return [
    "// Generated by M3E Canvas from the design. Do not edit: change the design and export again.",
    'import type { ComponentType } from "react";',
    "",
    ...printed.screens.map((s) => `import { ${s.component} } from ${str(`./${s.component}`)};`),
    "",
    "/** every screen, by the key a tap goes to it by */",
    `export const SCREENS: Record<string, ComponentType> = { ${printed.screens.map((s) => `${str(s.key)}: ${s.component}`).join(", ")} };`,
    "",
    "/** the screen the app opens on: the first flow's, else the first screen */",
    `export const INITIAL = ${str(printed.initial)};`,
    "",
    "/** where each flow of the design starts */",
    `export const FLOWS: { name: string; screen: string }[] = ${expr(printed.flows)};`,
    "",
  ].join("\n");
}
