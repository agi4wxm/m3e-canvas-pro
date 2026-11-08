import {
  COLOR_TOKENS,
  GAP,
  PHONE_H,
  PHONE_W,
  REGION_STATES,
  explodeGroup,
  frameLengthOf,
  frameOfPart,
  frameSizeOf,
  groupBounds,
  layoutOf,
  normalizeTheme,
  ownerIdOf,
  unionRect,
  type Action,
  type ActionBody,
  type ApiSpec,
  type Condition,
  type Doc,
  type Effect,
  type Frame,
  type Group,
  type Item,
  type ScreenParam,
} from "../../tokens";
import { partBySlug, reader } from "../../../parts/registry";
import type { PartDef, PropDef } from "../../../parts/types";
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
import { footOf } from "../../foot";
import { isOverlayPart } from "../../interact";
import { isPlaceKey } from "../../partContract";
import { endpointOf } from "../../bindings/contract";
import { answerShape, fillCode, formRules, listCode, okStatus, pageSizeOf, paneState, partNames, readCode, readOf, regionOptions } from "../bindCode";
import { NATIVE, INPUT_PROPS, isNative, kitPropName } from "../../../miniapp-kit/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../miniapp-kit/src/kit/parts.generated";
import { SET_ONLY, plainTree, propValues, type PlainNode } from "../rn/data";
import { iconNamesOf } from "../rn/print";

/* The Taro code of a document: one screen component per screen, built from the mini-program kit (miniapp-kit/src/kit),
 * the way lib/export/rn/print.ts prints the React Native app's. A screen is the design's: what stands loose is placed
 * where it stands (`At`), the bars are pinned to their edge (`Pin`), what an auto layout holds is nested in it, and each
 * part is the kit's component with the part's own props. On top of that the bindings (lib/bindings, docs/数据绑定.md):
 * a screen's data sources (`useDataSource`), its params (the page's query), props bound to expressions or variables,
 * lists drawn from data, regions showing the state of their data, forms over an operation's body (`useForm`), and taps,
 * which are the design's own data (`Action`) run by the kit's screen runtime (kit/app/screen.tsx) as the preview runs
 * them. Expressions stay the author's words, read at run time by the editor's own evaluator (packages/app-runtime).
 *
 * Every word of the document goes into the code as a string (`str`, `expr`), never as JSX text or a comment, and every
 * name the code is given (a component, a screen's key, a variable) is made of letters and digits only
 * (lib/exportInjection.test.ts). */

/** something the printed app does not do as the design says, for the exporter to list */
export type MiniWarning = {
  kind: "placeholder" | "atoms" | "holder" | "trigger" | "hidden" | "slot" | "look" | "image" | "unknown" | "binding" | "scroll" | "link";
  screen?: string;
  part?: string;
  detail: string;
};

export type MiniScreen = {
  id: string;
  /** what a tap knows it by: letters and digits */
  key: string;
  /** the component's name, which is its file's name too */
  component: string;
  /** its page, from src: pages/<key>/index */
  path: string;
  /** the screen's own name, the page's title */
  title: string;
  width: number;
  height: number;
  source: string;
  /** a data source of it loads again on a pull down */
  pull: boolean;
  params?: ScreenParam[];
  auth?: "required" | "login";
  /** its place in the tab bar */
  tab?: number;
};

/** the tab bar of an app whose screens a pinned navigation bar switches between: the bar's props and the screen of each
 *  of its items (absent where an item goes nowhere) */
export type MiniTabBar = { props: string; items: { label: string; screen?: string }[]; screens: string[] };

export type MiniScreens = {
  screens: MiniScreen[];
  warnings: MiniWarning[];
  /** every icon name the screens draw */
  icons: string[];
  /** the screen an app opens on: the first flow's, else the first screen */
  initial: string;
  flows: { name: string; screen: string }[];
  tabBar?: MiniTabBar;
};

export type MiniPrintOptions = {
  /** where the kit is, from a screen's file */
  kitImport?: string;
  /** the shared runtime's module */
  runtimeImport?: string;
  /** where the calls are (src/generated/calls.ts), from a screen's file; no calls when the document has no API */
  callsImport?: string;
  /** the path a picture the document holds as data is written to */
  image?: (data: string) => string;
  /** false: no tab bar, a shared navigation bar is drawn on each screen as it stands (the kit's own app) */
  tabBar?: boolean;
};

/* ---------- code as data ---------- */

/** an element, a part shown on a condition, a list drawn from data, or an expression among the children */
type J =
  | { tag: string; props: [string, string][]; kids: J[] }
  | { when: string; show: J[] }
  | { each: string; item: string; index: string; pre: string[]; body: J[] }
  | { code: string };

const el = (tag: string, props: [string, string][] = [], kids: J[] = []): J => ({ tag, props, kids });

const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** an object literal of printed `key: value` entries; `{}` with none */
const objOf = (entries: string[]) => (entries.length ? `{ ${entries.join(", ")} }` : "{}");

/** a key of an object literal: bare when it can be */
const keyName = (k: string) => (NAME.test(k) ? k : str(k));

/** a value as an expression: numbers, words (as strings), lists and objects of them */
export function expr(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
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

function jsxAll(js: J[], depth: number): string {
  return js.map((j) => jsx(j, depth)).join("\n");
}

/** an element as indented JSX */
function jsx(j: J, depth: number): string {
  const pad = "  ".repeat(depth);
  if ("code" in j) return `${pad}{${j.code}}`;
  if ("when" in j) {
    const inner = j.show.length === 1 && "tag" in j.show[0] ? jsx(j.show[0], depth + 1) : `${pad}  <>\n${jsxAll(j.show, depth + 2)}\n${pad}  </>`;
    return `${pad}{${j.when} ? (\n${inner}\n${pad}) : null}`;
  }
  if ("each" in j) {
    const pre = j.pre.map((l) => `${pad}  ${l}`).join("\n");
    return `${pad}{${j.each}.map((${j.item}, ${j.index}) => {\n${pre}${pre ? "\n" : ""}${pad}  return (\n${pad}    <Fragment key={keyOf(${j.item}, ${j.index})}>\n${jsxAll(j.body, depth + 3)}\n${pad}    </Fragment>\n${pad}  );\n${pad}})}`;
  }
  const attrs = j.props.map(([k, v]) => attr(k, v));
  const open = `<${j.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const long = pad.length + open.length > 120;
  const head = long ? `<${j.tag}\n${attrs.map((a) => `${pad}  ${a}`).join("\n")}\n${pad}` : open;
  if (!j.kids.length) return `${pad}${head}${long ? "/>" : " />"}`;
  return `${pad}${head}>\n${jsxAll(j.kids, depth + 1)}\n${pad}</${j.tag}>`;
}

/* ---------- names ---------- */

/** a name made of the letters and digits of the author's words, unique among those taken */
function nameOf(words: string, fallback: string, taken: Set<string>, suffix = "", lower = false): string {
  const parts = (words.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w[0].toUpperCase() + w.slice(1));
  let base = parts.join("");
  if (!base || /^\d/.test(base)) base = fallback;
  else if (suffix && !base.endsWith(suffix)) base += suffix;
  if (lower) base = base[0].toLowerCase() + base.slice(1);
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${base}${i}`;
  taken.add(out.toLowerCase());
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Markup the editor cleaned, written back as markup for the kit's `Svg`: only what `sanitizeSvg` kept, every value
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

/* ---------- taps as data ---------- */

const EFFECT_KEYS: Record<string, string[]> = {
  show: ["part"],
  hide: ["part"],
  toggle: ["part"],
  open: ["part"],
  close: ["part"],
  setVar: ["var", "value", "expr"],
  toggleVar: ["var"],
  addVar: ["var", "by"],
  setProp: ["part", "prop", "value"],
  snackbar: ["message"],
  call: ["operationId", "args", "body", "then", "catch", "optimistic"],
  refresh: ["source"],
  loadMore: ["source"],
  submit: ["form"],
  signOut: [],
};

/** What the printed code calls the document's things: a screen by its key (a tap names it by its frame's id; back, a
 *  link and nowhere as they are), a part or a form by a name of its own made from its words, the same for the same
 *  design whatever ids it was given (a part a template adds has a random one). `shown` is what the screen's runtime
 *  shows and hides a part by: its group's, by the name of the group's first part (`keyOfGroup`). */
type Names = { screen: (frameId: string) => string; part: (id: string) => string; shown: (id: string) => string };

/** the effects that show or hide a part: they reach its whole group, as in the preview (lib/interact.ts) */
const VISIBILITY = new Set(["show", "hide", "toggle", "open", "close"]);

/** where a tap goes besides a screen, as the kit reads `to` (miniapp-kit/src/kit/app/screen.tsx): no screen's key */
const RESERVED_KEYS = ["back", "link", "none"];
/** what a screen's file imports from the kit under a name a screen's component could take ("…Screen") */
const RESERVED_COMPONENTS = ["screen"];

/** a condition with the part it reads by its printed name */
const cleanCondition = (c: Condition, names: Names): Condition => ("filled" in c ? { filled: names.part(c.filled) } : c);

/** an effect with only what the runtime reads, its nested bodies cleaned too; an effect this version does not know is left out */
function cleanEffect(e: Effect, depth: number, names: Names): Record<string, unknown> | null {
  const keys = EFFECT_KEYS[e.do];
  if (!keys) return null;
  const out: Record<string, unknown> = { do: e.do };
  for (const k of keys) {
    const v = (e as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if ((k === "then" || k === "catch") && depth >= 4) continue;
    out[k] = k === "then" || k === "catch" ? cleanBody(v as ActionBody, names, depth + 1) : k === "part" && typeof v === "string" && VISIBILITY.has(e.do) ? names.shown(v) : (k === "part" || k === "form") && typeof v === "string" ? names.part(v) : v;
  }
  return out;
}

function cleanBody(b: ActionBody, names: Names, depth = 0): Record<string, unknown> {
  const effects = (b.effects ?? []).map((e) => cleanEffect(e, depth, names)).filter((e): e is Record<string, unknown> => !!e);
  return { to: names.screen(b.to), ...(b.url ? { url: b.url } : {}), ...(effects.length ? { effects } : {}), ...(b.overlay ? { overlay: true } : {}), ...(b.params ? { params: b.params } : {}) };
}

function cleanAction(a: Action, names: Names): Record<string, unknown> {
  const when = a.when as Condition | undefined;
  return { ...cleanBody(a, names), ...(when ? { when: cleanCondition(when, names) } : {}), ...(a.else ? { else: cleanBody(a.else, names) } : {}) };
}

/** every effect of a document's taps, nested ones too */
function effectsOf(doc: Doc): Effect[] {
  const out: Effect[] = [];
  const body = (b: ActionBody | undefined, depth: number) => {
    for (const e of b?.effects ?? []) {
      out.push(e);
      if (e.do === "call" && depth < 4) {
        body(e.then, depth + 1);
        body(e.catch, depth + 1);
      }
    }
  };
  const action = (a: Action | undefined) => {
    body(a, 0);
    body(a?.else, 0);
  };
  for (const g of doc.groups) {
    for (const it of g.items) {
      action(it.action);
      for (const a of Object.values(it.actions ?? {})) action(a);
    }
    if (g.form) {
      body(g.form.then, 0);
      body(g.form.catch, 0);
    }
  }
  return out;
}

/* ---------- one screen ---------- */

type Screens = { keys: Map<string, string>; names: Map<string, string> };

/** where a part stands as the code reads it: the expressions' scope, and what a tap from it is run with */
type At = { $: string; item?: string; form?: { id: string; handle: string } };

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** a part's key in the screen's runtime: its first item's id (what effects name) */
const keyOfGroup = (g: Group) => g.items[0]?.id ?? g.id;

class ScreenPrinter {
  kit = new Set<string>(["Screen", "useScreen"]);
  runtime = new Set<string>();
  react = new Set<string>();
  icons = new Set<string>();
  /** module-level constants: taps, conditions, form rules */
  consts: string[] = [];
  private constIds = new Map<string, string>();
  /** the screen's runtime's starting state */
  hidden: string[] = [];
  inputs: Record<string, string> = {};
  /** lines at the top of the component: hooks and scopes */
  hooks: string[] = [];
  /** forms by their group id */
  forms = new Map<string, { handle: string; scope: string; op: string }>();
  repeats = 0;
  uses$ = false;
  usesCalls = false;
  /** how far the page scrolls past its content, clear of what floats over the screen's foot (lib/foot.ts) */
  room = 0;

  constructor(
    readonly doc: Doc,
    readonly frame: Frame,
    readonly key: string,
    readonly widths: Record<string, number>,
    readonly all: Group[],
    readonly screens: Screens,
    readonly warnings: MiniWarning[],
    readonly o: MiniPrintOptions,
    readonly setProps: Set<string>,
    readonly tabBar: { screens: Set<string>; bars: Set<string> },
    readonly parts: Map<string, string>,
    /** the document's group of each part, and the groups an effect shows or hides */
    readonly visibility: { owner: Map<string, Group>; toggled: Set<string> },
  ) {}

  get api(): ApiSpec {
    return this.doc.api ?? {};
  }

  /** what the printed code calls a screen and a part (see `Names`) */
  readonly names: Names = {
    screen: (to: string): string => this.screens.keys.get(to) ?? (to === "back" || to === "link" ? to : "none"),
    part: (id: string): string => this.parts.get(id) ?? id.replace(/[^\w-]/g, ""),
    shown: (id: string): string => {
      const g = this.visibility.owner.get(id);
      return this.names.part(g ? keyOfGroup(g) : id);
    },
  };

  warn(kind: MiniWarning["kind"], detail: string, part?: string) {
    this.warnings.push({ kind, screen: this.frame.name, ...(part ? { part: this.names.part(part) } : {}), detail });
  }

  /** a value as a module constant, the same value once */
  constant(prefix: string, value: unknown, type?: string): string {
    const code = expr(value);
    const seen = this.constIds.get(`${prefix}:${code}`);
    if (seen) return seen;
    const name = `${prefix}${this.constIds.size + 1}`;
    this.constIds.set(`${prefix}:${code}`, name);
    this.consts.push(`const ${name}${type ? `: ${type}` : ""} = ${code};`);
    return name;
  }

  /* ---------- taps ---------- */

  env(at: At): string {
    return `{ $: ${at.$}${at.item ? `, item: ${at.item}` : ""}${at.form ? `, form: ${str(at.form.id)}` : ""} }`;
  }

  /** a tap as a handler, run by the screen's runtime with where the part stands */
  tap(a: Action | undefined, part: string, at: At): string | undefined {
    if (!a) return undefined;
    if (a.trigger) this.warn("trigger", "a hover or delayed trigger is printed as a tap", part);
    if (a.scrollTo) this.warn("scroll", "scrolling to a part is not printed", part);
    if (a.to === "link") this.warn("link", "a mini-program copies the address (WeChat and Douyin open no outside page without a web-view domain); H5 opens it", part);
    this.kit.add("Action");
    this.uses$ = true;
    return `s.tap(${this.constant("A", cleanAction(a, this.names), "Action")}, ${this.env(at)})`;
  }

  /** what an item carries beside its props: its look and its taps */
  extras(it: Item, at: At, slots = true, close?: string): [string, string][] {
    const out: [string, string][] = [];
    if (it.fill && COLOR_TOKENS.some((t) => t.key === it.fill)) out.push(["fill", str(it.fill)]);
    if (it.textColor) out.push(["textColor", str(it.textColor)]);
    if (it.corners) out.push(["corners", expr({ tl: it.corners.tl, tr: it.corners.tr, br: it.corners.br, bl: it.corners.bl })]);
    const look = cleanLook(it.look);
    if (look) {
      if (look.texture) this.warn("look", "a texture is not drawn in a mini-program", it.id);
      out.push(["look", expr(look)]);
    }
    const tap = this.tap(it.action, it.id, at);
    if (tap) out.push(["onPress", tap]);
    /* an event or a family of places is not printed yet: lib/export/boundary.ts reports it */
    const wired = Object.entries(it.actions ?? {}).filter(([k, a]) => !!a && isPlaceKey(k));
    if (wired.length && !slots) this.warn("slot", "a tap on a place inside a part drawn as atoms is not kept", it.id);
    const taps = slots ? wired.map(([slot, a]) => [slot, this.tap(a, it.id, at)] as const).filter((x): x is readonly [string, string] => !!x[1]) : [];
    /* a part open over the screen closes once one of its places is tapped */
    const closing = close ? taps.map(([slot, f]) => [slot, `() => (${f}(), s.close(${str(close)}))`] as const) : taps;
    const all = close && !closing.some(([slot]) => slot === "dismiss") ? [...closing, ["dismiss", `() => s.close(${str(close)})`] as const] : closing;
    if (all.length) out.push(["taps", `{ ${all.map(([s, f]) => `${str(s)}: ${f}`).join(", ")} }`]);
    return out;
  }

  /* ---------- props ---------- */

  /** a prop bound to an expression, in the kind of value the prop takes (lib/interact.ts `exprValue`) */
  boundExpr(d: PropDef, e: string, design: string, $: string): string {
    this.uses$ = true;
    const read = readOf(d.kind);
    if (!read) return design;
    /* what follows the expression: the design's value (already code), and the prop's range or choices */
    const extra =
      d.kind === "bool"
        ? [design]
        : d.kind === "number"
          ? [design, `${d.min}`, `${d.max}`]
          : d.kind === "enum"
            ? [`${expr(d.options.map((x) => (typeof x === "string" ? x : x.value)))} as const`, design]
            : d.kind === "list"
              ? [design, `${d.max ?? 50}`]
              : [];
    if (read === "rows") this.kit.add("rowsOf");
    return readCode(read, $, e, extra);
  }

  /** a picture the document holds as data, as the page reads it: the file the export writes it as; one it does not
   *  write is left out, and reported */
  picture(data: string, part: string): string {
    const path = this.o.image?.(data) ?? "";
    if (!path) this.warn("image", "a picture held in the document is left out (PNG, JPEG, GIF, WebP and SVG are written as files)", part);
    return path;
  }

  /** a part's own props as the kit takes them: what differs from the kit's defaults, under the kit's names, each read
   *  from what it is bound to; the prop a person enters is left to `input` */
  props(def: PartDef, it: Item, at: At, skip?: string): [string, string][] {
    const values = propValues(def, it.props);
    const defaults = KIT_PARTS[def.slug]?.defaults ?? {};
    const out: [string, string][] = [];
    for (const d of def.props) {
      if (d.key === skip) continue;
      const key = kitPropName(def.slug, d.key);
      let v = values[d.key];
      if (SET_ONLY.has(d.key) && !(it.props && typeof it.props[d.key] === "number")) continue;
      if (d.kind === "image" && typeof v === "string" && v.startsWith("data:")) v = this.picture(v, it.id);
      if (d.kind === "list" && Array.isArray(v)) v = (v as Record<string, unknown>[]).map((row) => (typeof row.image === "string" && row.image.startsWith("data:") ? { ...row, image: this.picture(row.image, it.id) } : row));
      if (def.slug === "svg" && d.key === "markup" && typeof v === "string" && v) v = svgMarkup(v, it.id) ?? "";
      const bind = it.bind?.[d.key];
      let code = expr(v);
      if (typeof bind === "string" && bind.startsWith("=")) code = this.boundExpr(d, bind.slice(1), code, at.$);
      else if (typeof bind === "string" && bind) {
        const labels = d.key === "selected" ? listLabels(def, it) : undefined;
        code = `s.bound(${str(bind)}, ${code}${labels ? `, ${expr(labels)}` : ""})`;
      } else if (typeof v === "string" && v.includes("{{") && (d.kind === "text" || d.kind === "image")) {
        this.uses$ = true;
        code = fillCode(at.$, v);
      } else if (!this.setProps.has(`${it.id}:${d.key}`) && !SET_ONLY.has(d.key) && same(v, defaults[key])) continue;
      if (this.setProps.has(`${it.id}:${d.key}`)) code = `s.prop(${str(this.names.part(it.id))}, ${str(d.key)}, ${code})`;
      out.push([key, code]);
    }
    for (const n of iconNamesOf(def.slug, values)) this.icons.add(n);
    return out;
  }

  /** what a person enters in a part: held by its form's field, else by the screen's runtime (and the variable it is
   *  bound to), so a condition can read it */
  input(def: PartDef, it: Item, at: At): { skip?: string; props: [string, string][] } {
    const key = INPUT_PROPS[def.slug];
    if (!key) return { props: [] };
    const prop = kitPropName(def.slug, key);
    const values = propValues(def, it.props);
    const labels = key === "selected" ? listLabels(def, it) : undefined;
    const form = it.field && at.form ? at.form : undefined;
    if (form) {
      const f = str(it.field!);
      const h = form.handle;
      const out: [string, string][] = [];
      if (labels) {
        this.kit.add("optionIndex");
        out.push([prop, `optionIndex(${expr(labels)}, ${h}.value(${f}))`], ["onChange", `(i: number) => ${h}.set(${f}, ${expr(labels)}[i])`]);
      } else if (key === "checked") out.push([prop, `!!${h}.value(${f})`], ["onChange", `(v: boolean) => ${h}.set(${f}, v)`]);
      else if (def.slug === "slider") out.push([prop, `Number(${h}.value(${f}) ?? ${expr(values.value ?? 0)})`], ["onChange", `(v: number) => ${h}.set(${f}, v)`]);
      else if (def.slug === "file-upload") {
        this.kit.add("PickedFile");
        out.push([prop, `${h}.value(${f}) as PickedFile | PickedFile[] | undefined`], ["onChange", `(v?: PickedFile | PickedFile[]) => ${h}.set(${f}, v)`]);
      } else out.push([prop, `${h}.text(${f})`], ["onChange", `(v: string) => ${h}.set(${f}, v)`]);
      if (def.props.some((d) => d.key === "error") || def.slug === "select" || def.slug === "file-upload") out.push(["error", `!!${h}.error(${f})`]);
      return { skip: key, props: out };
    }
    if (it.field) this.warn("binding", "an input with a field outside a form is entered but sent nowhere", it.id);
    const design = values[key];
    const bind = it.bind?.[key];
    const varId = typeof bind === "string" && bind && !bind.startsWith("=") ? bind : undefined;
    const start = typeof bind === "string" && bind.startsWith("=") ? this.boundExpr(def.props.find((d) => d.key === key)!, bind.slice(1), expr(design), at.$) : expr(design ?? (def.slug === "file-upload" ? undefined : ""));
    this.inputs[this.names.part(it.id)] = `{ value: ${expr(design ?? null)}${varId ? `, var: ${str(varId)}` : ""}${labels ? `, labels: ${expr(labels)}` : ""} }`;
    const id = str(this.names.part(it.id));
    const typed = def.slug === "file-upload" ? "PickedFile | PickedFile[] | undefined" : typeof design === "boolean" ? "boolean" : typeof design === "number" ? "number" : "string";
    if (def.slug === "file-upload") this.kit.add("PickedFile");
    return { skip: key, props: [[prop, `s.value<${typed}>(${id}, ${start}${def.slug === "file-upload" ? " as PickedFile | undefined" : ""})`], ["onChange", `s.setter(${id})`]] };
  }

  /** a tree of atoms (a split) as elements, the root wearing the item's look and taps */
  tree(n: PlainNode, at: At, root?: Item, dir = "column", stretch = false): J {
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
    if (root) props.push(...this.extras(root, at, false), ["testID", str(this.names.part(root.id))]);
    const own = (n.props.layout as string | undefined) ?? (n.slug === "box" ? "column" : "free");
    const kids = (n.kids ?? []).map((k) => this.tree(k, at, undefined, own, n.props.align === "stretch"));
    const self = el(name, props, kids);
    const across = dir !== "row" && stretch;
    const tall = dir === "row" && stretch;
    if (!n.grow && !across && !tall) return self;
    this.kit.add("Cell");
    return el("Cell", [["dir", str(dir === "grid" ? "grid" : dir)], ...(n.grow ? ([["grow", "true"]] as [string, string][]) : []), ...(across ? ([["fillWidth", "true"]] as [string, string][]) : []), ...(tall ? ([["fillHeight", "true"]] as [string, string][]) : [])], [self]);
  }

  /** one part: the kit's component, the atoms it splits into, or a placeholder naming it */
  part(it: Item, at: At, kids: J[] = [], layout: [string, string][] = [], close?: string): J {
    const def = partBySlug(it.component);
    if (!def) {
      this.warn("unknown", "a part no definition stands for", it.id);
      this.kit.add("Placeholder");
      return el("Placeholder", [["part", str(typeof it.component === "string" ? it.component.replace(/[^\w-]+/g, "").slice(0, 60) : "")]]);
    }
    if (isNative(def.slug)) {
      const name = NATIVE[def.slug];
      this.kit.add(name);
      const own = new Set(layout.map(([k]) => k));
      const input = this.input(def, it, at);
      const props = this.props(def, it, at, input.skip).filter(([k]) => !own.has(k));
      /* a form's submit is held while it submits */
      const submits = at.form && [it.action, ...Object.values(it.actions ?? {})].some((a) => a?.effects?.some((e) => e.do === "submit"));
      if (submits && def.props.some((d) => d.key === "disabled")) {
        const was = props.findIndex(([k]) => k === "disabled");
        const design = was >= 0 ? props.splice(was, 1)[0][1] : "false";
        props.push(["disabled", design === "false" ? `${at.form!.handle}.submitting` : `${at.form!.handle}.submitting || ${design}`]);
      }
      return el(name, [...props, ...input.props, ...layout, ...this.extras(it, at, true, close), ["testID", str(this.names.part(it.id))]], kids);
    }
    if (def.atoms && !kids.length) {
      this.warn("atoms", `drawn as the atoms it splits into (${def.slug})`, it.id);
      const tree = def.atoms(reader(def, it.props), kitLookOf(normalizeTheme(this.doc.theme))) as Node;
      return this.tree(plainTree(tree, getLang()), at, it);
    }
    this.kit.add("Placeholder");
    this.warn(kids.length ? "holder" : "placeholder", `${def.slug} has no component in the mini-program kit`, it.id);
    const size = this.size(it);
    return el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)], ...layout, ...this.extras(it, at)], kids);
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

  /** A part shown only while the screen's runtime says so: hidden until shown, shown until a tap hides it, or on a
   *  condition. What is shown or hidden is the document's group: a piece of a free group goes with the rest. */
  shown(run: Group, at: At, j: J): J {
    const tests: string[] = [];
    const first = run.items[0]?.id ?? run.id;
    const owner = this.visibility.owner.get(first);
    if (run.hidden || (owner && this.visibility.toggled.has(owner.id))) {
      const key = this.names.shown(first);
      if (run.hidden) this.hidden.push(key);
      tests.push(`s.shows(${str(key)})`);
    }
    if (run.showWhen) {
      this.uses$ = true;
      tests.push(`s.holds(${this.constant("C", cleanCondition(run.showWhen, this.names), "Condition")}, ${at.$})`);
      this.kit.add("Condition");
    }
    return tests.length ? { when: tests.join(" && "), show: [j] } : j;
  }

  /** a run a layout holds: the part, and nested in it what it lays out */
  flow(run: Group, at: At, parent?: Flow, origin = { x: 0, y: 0 }): J {
    if (run.expandedFrom !== undefined && parent) return this.instance(run, at);
    const asked = parent ? this.cell(run, parent, origin) : [];
    const boxed = (j: J): J => (asked.length ? (this.kit.add("Cell"), el("Cell", asked, [j])) : j);
    const flow = run.items.length === 1 ? flowOf(run) : null;
    if (!flow) {
      if (run.items.length === 1) return this.shown(run, at, boxed(this.part(run.items[0], at)));
      this.kit.add("Box");
      return this.shown(run, at, boxed(el("Box", [["layout", str(run.axis === "x" ? "row" : "column")], ["gap", expr(GAP)], ["padX", "0"], ["padY", "0"]], run.items.map((x) => this.part(x, at)))));
    }
    let inner = at;
    /* a form: its fields, its rules and its submit, over its operation's body */
    if (run.form) inner = this.form(run, at) ?? at;
    const kids = this.all.filter((g) => g.inFlow === run.id && !g.locked);
    const flowing = kids.some((k) => !childLayoutOf(k.items.length === 1 ? k.items[0] : undefined).absolute);
    const box = { x: run.x + flow.inset.l, y: run.y + flow.inset.t };
    const print = (list: Group[], a: At) => list.map((k) => this.flow(k, a, flow, box));
    let held: J[];
    if (run.states) {
      /* a region: what it holds on each of its states, the one its data is in drawn */
      const region = this.region(run, inner);
      held = [];
      for (const state of REGION_STATES) {
        const list = kids.filter((k) => paneState(k) === state);
        if (!list.length) continue;
        const body = state === "ready" && run.repeat?.data !== undefined ? this.repeat(run, list, inner, print) : print(list, inner);
        held.push({ when: `${region} === ${str(state)}`, show: body });
      }
    } else if (run.repeat?.data !== undefined) held = this.repeat(run, kids, inner, print);
    else {
      if (run.repeat) this.warn("binding", "a repeat over a collection is drawn once", run.items[0]?.id);
      held = print(kids, inner);
    }
    return this.shown(run, at, boxed(this.part(run.items[0], inner, held, this.hugs(run, flow, parent, flowing))));
  }

  /** the first of what a layout holds drawn once for each element of the list its repeat reads, the rest after */
  repeat(run: Group, kids: Group[], at: At, print: (list: Group[], a: At) => J[]): J[] {
    const [template, ...rest] = kids;
    if (!template) return [];
    const n = ++this.repeats;
    const item = `item${n}`;
    const index = `index${n}`;
    const $r = `$r${n}`;
    this.runtime.add("keyOf");
    this.react.add("Fragment");
    this.uses$ = true;
    const each: J = { each: listCode(at.$, run.repeat!.data!, run.repeat?.limit), item, index, pre: [`const ${$r} = ${at.$}.with({ item: ${item}, index: ${index} });`], body: print([template], { ...at, $: $r, item }) };
    return [each, ...print(rest, at)];
  }

  /** the state a region shows, as a constant of the render */
  region(run: Group, at: At): string {
    const st = run.states!;
    const src = st.source ? (this.frame.data ?? []).find((d) => d.name === st.source) : undefined;
    this.runtime.add("regionOf");
    const name = `region${this.hooks.filter((h) => h.startsWith("const region")).length + 1}`;
    if (!src) this.warn("binding", `a region shows data the screen does not load (${st.source ?? "none"}): it shows its content`, run.items[0]?.id);
    if (st.emptyWhen) this.uses$ = true;
    this.hooks.push(`const ${name} = regionOf(${src ? identOf(src.name) : "undefined"}, { ${regionOptions(src?.load, st.emptyWhen, at.$, true).join(", ")} });`);
    return name;
  }

  /** a form over an operation's body: its hook at the top of the screen, and the scope its parts read */
  form(run: Group, at: At): At | undefined {
    const f = run.form!;
    const e = endpointOf(this.api, f.operationId);
    if (!e) {
      this.warn("binding", `a form for an operation the contract does not have (${f.operationId})`, run.items[0]?.id);
      return undefined;
    }
    if (at.item) {
      this.warn("binding", "a form inside a list drawn from data is drawn but not sent", run.items[0]?.id);
      return undefined;
    }
    const n = this.forms.size + 1;
    const handle = `form${n}`;
    const scope = `$f${n}`;
    /* the rules of the fields this form has an input for: one with no input is not asked for */
    const owned = new Set<string>();
    const walk = (id: string) => {
      for (const g of this.all.filter((x) => x.inFlow === id)) {
        if (g.form) continue;
        for (const it of g.items) if (it.field) owned.add(it.field);
        walk(g.id);
      }
    };
    walk(run.id);
    const R = this.constant("F", formRules(this.api, e, { only: owned, whole: true }), "FormFields");
    this.runtime.add("useForm").add("type FormFields");
    this.usesCalls = true;
    this.uses$ = true;
    const params = Object.entries(f.params ?? {}).map(([k, x]) => `${NAME.test(k) ? k : str(k)}: ${at.$}.ev(${str(x)})`);
    const values = Object.entries(f.values ?? {}).map(([k, x]) => `${str(k)}: ${at.$}.ev(${str(x)})`);
    const then = f.then ? this.constant("A", cleanBody(f.then, this.names), "ActionBody") : "undefined";
    const caught = f.catch ? this.constant("A", cleanBody(f.catch, this.names), "ActionBody") : "undefined";
    if (f.then || f.catch) this.kit.add("ActionBody");
    const env = (extra: string) => `{ $: ${scope}.with({ ${extra} }), form: ${str(this.names.part(run.id))} }`;
    this.hooks.push(
      [
        `const ${handle} = useForm({`,
        `  id: ${str(`${this.key}/${this.names.part(run.id)}`)},`,
        `  fields: ${R},`,
        `  send: (body, init) => CALLS[${str(f.operationId)}](${objOf(params)}, body, init),`,
        ...(values.length ? [`  extra: () => ({ ${values.join(", ")} }),`] : []),
        `  status: ${expr(okStatus(e))},`,
        `  then: (response, status) => s.answered(${str(f.operationId)}, ${then}, ${env("response, status")}, true),`,
        `  catch: (error, status) => s.answered(${str(f.operationId)}, ${caught}, ${env("error, status")}, false),`,
        `});`,
        `const ${scope} = ${at.$}.with({ form: ${handle}.view });`,
      ].join("\n"),
    );
    this.forms.set(run.id, { handle, scope, op: f.operationId });
    return { $: scope, form: { id: this.names.part(run.id), handle } };
  }

  /** an instance standing in a layout: a box of its size, its parts placed inside it */
  instance(run: Group, at: At): J {
    const kids = this.all.filter((g) => g.id.startsWith(`${run.id}/`) && !g.inFlow).sort((a, b) => a.y - b.y || a.x - b.x);
    const { width, height } = (run.items[0].props ?? {}) as { width?: number; height?: number };
    this.kit.add("Box");
    return el("Box", [["layout", str("free")], ["padX", "0"], ["padY", "0"], ["width", expr(Math.round(width ?? 0))], ["height", expr(Math.round(height ?? 0))]], kids.map((k) => this.at(k, at, { x: run.x, y: run.y })));
  }

  /** a run standing loose, placed from the top left of what it stands on */
  at(run: Group, at: At, origin: { x: number; y: number }): J {
    const flow = run.items.length === 1 ? flowOf(run) : null;
    const pos = flow ? { x: run.x, y: run.y } : (layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y });
    this.kit.add("At");
    return el("At", [["x", expr(pos.x - origin.x)], ["y", expr(pos.y - origin.y)]], [this.flow(run, at)]);
  }

  /** a part open over the screen while the runtime says so: a dialog, a sheet, a menu that starts hidden */
  layer(run: Group, at: At): J {
    const id = this.names.shown(run.items[0]?.id ?? run.id);
    this.hidden.push(id);
    this.kit.add("Layer");
    const it = run.items[0];
    const bottom = /sheet/.test(it.component ?? "") && (it.props?.side ?? "bottom") === "bottom";
    return el("Layer", [["open", `s.shows(${str(id)})`], ["onClose", `() => s.close(${str(id)})`], ["align", str(bottom ? "bottom" : "center")]], [this.part(it, at, [], [], id)]);
  }

  /** the screen's body: every run on it, the bars pinned to their edge */
  body(): J[] {
    const at: At = { $: "$" };
    const hosts = new Set(this.all.filter((r) => flowOf(r)).map((r) => r.id));
    const runs = [...this.all].sort((a, b) => a.y - b.y || a.x - b.x);
    const { h } = frameSizeOf(this.frame);
    const out: J[] = [];
    /* a screen that loads data keeps what stands at its foot on the glass, its page ending clear of it */
    const foot = this.frame.data?.length ? footOf(this.frame, this.all, this.widths) : undefined;
    this.room = foot?.room ?? 0;
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      if (ownerIdOf(run.id) && this.all.some((g) => g.id === ownerIdOf(run.id) && g.expandedFrom !== undefined)) continue;
      const first = run.items[0];
      if (run.items.length === 1 && first && run.hidden && isOverlayPart(first) && !flowOf(run)) {
        out.push(this.layer({ ...run, hidden: false }, at));
        continue;
      }
      const role = first ? roleOf(first) : undefined;
      const pin = pinOf(run, this.frame, this.widths);
      const top = Math.round(run.y - this.frame.y);
      if (run.items.length === 1 && first && fullWidth(first) && (role === "top" || role === "bottom" || role === "floatingBottom")) {
        const atFoot = role !== "top" && (pin === "foot" || top + this.size(first).h >= frameLengthOf(this.frame) - 1 || frameLengthOf(this.frame) === h);
        if (role === "top" ? top <= 32 || pin === "head" : atFoot) {
          this.kit.add("Pin");
          /* the app's tab bar draws itself in a mini-program (custom-tab-bar); on the web it stands here */
          if (this.tabBar.bars.has(first.id)) {
            out.push({ when: `process.env.TARO_ENV === "h5"`, show: [el("Pin", [["edge", str("bottom")]], [el("TabBar", [])])] });
            continue;
          }
          out.push(el("Pin", [["edge", str(role === "floatingBottom" ? "floatingBottom" : role)]], [this.flow(run, at)]));
          continue;
        }
      }
      if (run.items.length === 1 && first && fullWidth(first)) {
        this.kit.add("At");
        out.push(el("At", [["y", expr(top)], ["span", "true"]], [this.flow(run, at)]));
        continue;
      }
      /* a button (or a FAB) at the foot of a screen of data floats there, as far above the foot as the design has it */
      const above = foot?.above.get(run.id);
      if (above !== undefined) {
        const pos = layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y };
        this.kit.add("Pin");
        out.push(el("Pin", [["edge", str("floatingBottom")], ["x", expr(Math.round(pos.x - this.frame.x))], ["bottom", expr(above)]], [this.flow(run, at)]));
        continue;
      }
      out.push(this.at(run, at, { x: this.frame.x, y: this.frame.y }));
    }
    return out;
  }
}

/** the labels of a part's rows, for a choice that holds a row's words */
function listLabels(def: PartDef, it: Item): string[] | undefined {
  if (!def.props.some((d) => d.key === "items" && d.kind === "list")) return undefined;
  return reader(def, it.props)
    .list("items")
    .map((r) => r.label);
}

/** a data source's name as a variable: letters and digits, never one the printed code uses itself */
const RESERVED = new Set(["s", "api", "runtime", "item", "index", "form", "region", "props", "data", "params", "vars", "auth", "now", "default", "new", "this", "class", "function", "var", "let", "const", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "delete", "typeof", "void", "in", "of", "instanceof", "try", "catch", "finally", "throw", "with", "yield", "await", "async", "import", "export", "extends", "super", "true", "false", "null", "undefined", "enum", "interface", "package", "private", "protected", "public", "static", "implements", "let", "debugger", "Fragment"]);
export function identOf(name: string): string {
  const base = name.replace(/[^A-Za-z0-9]/g, "") || "data";
  const id = /^\d/.test(base) ? `d${base}` : base;
  return RESERVED.has(id) || /^(\$|A|C|F|item|index|form|region)\d*$/.test(id) ? `src${id[0].toUpperCase()}${id.slice(1)}` : id;
}

/** Every screen of a document as Taro code on the kit, read in the document's own styles */
export function printMiniScreens(source: Doc, widths: Record<string, number>, o: MiniPrintOptions = {}): MiniScreens {
  return withDocStyles(source.styles, () => screensOf(source, widths, o));
}

/** the screens a pinned navigation bar switches between: the tabs of the app's tab bar */
function tabBarOf(doc: Doc, frames: Frame[], screens: Screens, groupsOf: (f: Frame) => Group[], widths: Record<string, number>): { bar?: Item; tabs: Map<string, number>; bars: Set<string>; items: { label: string; screen?: string }[] } {
  const none = { tabs: new Map<string, number>(), bars: new Set<string>(), items: [] };
  const found: { frame: Frame; item: Item }[] = [];
  for (const f of frames) {
    const bar = groupsOf(f).find((g) => g.items.length === 1 && g.items[0].component === "navigation-bar" && roleOf(g.items[0]) === "bottom" && !g.inFlow);
    /* pinned to the foot as the screen's printer pins it (`body`) */
    const h = Math.round(widths[`${bar?.items[0].id}:h`] ?? partBySlug("navigation-bar")?.h ?? 80);
    if (bar && (pinOf(bar, f, widths) === "foot" || Math.round(bar.y - f.y) + h >= frameLengthOf(f) - 1 || frameLengthOf(f) === frameSizeOf(f).h)) found.push({ frame: f, item: bar.items[0] });
  }
  if (found.length < 2) return none;
  const labelsOf = (it: Item) => JSON.stringify(reader(partBySlug("navigation-bar")!, it.props).list("items").map((r) => r.label));
  const sig = labelsOf(found[0].item);
  const same = found.filter((x) => labelsOf(x.item) === sig);
  const tabs = new Map<string, number>();
  const items = reader(partBySlug("navigation-bar")!, same[0].item.props).list("items");
  /* each tab's screen: the one whose bar has it chosen, else where a bar's tap on it goes */
  for (const x of same) {
    const sel = Math.round(Number(x.item.props?.selected ?? 0));
    if (!tabs.has(x.frame.id) && ![...tabs.values()].includes(sel)) tabs.set(x.frame.id, sel);
  }
  for (const x of same)
    for (const [slot, a] of Object.entries(x.item.actions ?? {})) {
      const m = /^tab:(\d+)$/.exec(slot);
      const to = a?.to;
      if (m && to && screens.keys.has(to) && !tabs.has(to) && ![...tabs.values()].includes(Number(m[1])) && same.some((y) => y.frame.id === to)) tabs.set(to, Number(m[1]));
    }
  /* a tab page takes no params: a screen with params is no tab */
  const withParams = frames.filter((f) => tabs.has(f.id) && f.params?.length).map((f) => f.id);
  for (const id of withParams) tabs.delete(id);
  if (tabs.size < 2 || tabs.size > 5) return none;
  const byIndex = new Map([...tabs].map(([id, i]) => [i, id]));
  return { bar: same[0].item, tabs, bars: new Set(same.filter((x) => tabs.has(x.frame.id)).map((x) => x.item.id)), items: items.map((r, i) => ({ label: r.label, ...(byIndex.has(i) ? { screen: screens.keys.get(byIndex.get(i)!) } : {}) })) };
}

function screensOf(source: Doc, widths: Record<string, number>, o: MiniPrintOptions): MiniScreens {
  const doc = expandDoc(withoutMarks(source), widths);
  const kitImport = o.kitImport ?? "../../kit";
  const runtimeImport = o.runtimeImport ?? "@m3e/app-runtime";
  let frames = doc.frame === "phone" ? doc.frames : [];
  if (!frames.length && doc.groups.length) {
    const { l, t, r, b } = unionRect(doc.groups.map((g) => groupBounds(g, widths)));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(b - t)) }];
  }
  /* a screen's component is never the kit's Screen, which its file draws with; its key is never where a tap goes beside
     a screen ("back", "link", "none": miniapp-kit/src/kit/app/screen.tsx), so a screen named Back opens itself */
  const taken = new Set<string>(RESERVED_COMPONENTS);
  const keys = new Set<string>(RESERVED_KEYS);
  const screens: Screens = { keys: new Map(), names: new Map() };
  frames.forEach((f, i) => {
    screens.names.set(f.id, nameOf(f.name, `Screen${i + 1}`, taken, "Screen"));
    screens.keys.set(f.id, nameOf(f.name, `screen${i + 1}`, keys, "", true));
  });
  const warnings: MiniWarning[] = [];
  const icons = new Set<string>();
  /* what a dock's other tabs hold is left out; a region's other states are its own to switch between */
  const offTab = outOfPane(
    doc.groups.map((g) => (g.states ? { ...g, states: undefined } : g)),
    widths,
  );
  const groupsOf = (frame: Frame) => doc.groups.filter((g) => (frames.length === 1 && frame.id === "canvas") || frameOfPart(g, doc.groups, frames, widths)?.id === frame.id).filter((g) => !offTab.has(g.id)).flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]));
  const setProps = new Set(
    effectsOf(doc)
      .filter((e): e is Extract<Effect, { do: "setProp" }> => e.do === "setProp")
      .map((e) => `${e.part}:${e.prop}`),
  );
  const parts = partNames(doc);
  /* each part's group, and the groups a tap shows or hides: drawn while the screen's runtime says, whether they start
     hidden or not */
  const owner = new Map(doc.groups.flatMap((g) => g.items.map((it) => [it.id, g] as const)));
  const toggled = new Set(effectsOf(doc).flatMap((e) => (VISIBILITY.has(e.do) && "part" in e && owner.has(e.part) ? [owner.get(e.part)!.id] : [])));
  const tab = o.tabBar === false ? { tabs: new Map<string, number>(), bars: new Set<string>(), items: [] } : tabBarOf(doc, frames, screens, groupsOf, widths);
  const printed = frames.map((frame): MiniScreen => {
    const key = screens.keys.get(frame.id)!;
    const p = new ScreenPrinter(doc, frame, key, widths, groupsOf(frame), screens, warnings, o, setProps, { screens: new Set(tab.tabs.keys()), bars: tab.bars }, parts, { owner, toggled });
    const body = p.body();
    p.icons.forEach((n) => icons.add(n));
    const { w, h } = frameSizeOf(frame);
    const length = frameLengthOf(frame);
    const bg = frame.bg && COLOR_TOKENS.some((t) => t.key === frame.bg) ? frame.bg : undefined;
    /* the screen's data: each source's arguments read in the screen's scope, loaded through the generated calls */
    const sources = (frame.data ?? []).map((d) => sourceHook(p, doc.api ?? {}, d));
    const names = sources.map((x) => x.name);
    const usesBody = body.some((j) => JSON.stringify(j).includes('"TabBar"'));
    const top: string[] = [];
    const init: string[] = [];
    if (p.hidden.length) init.push(`hidden: ${expr([...new Set(p.hidden)])}`);
    if (Object.keys(p.inputs).length) init.push(`inputs: { ${Object.entries(p.inputs).map(([k, v]) => `${str(k)}: ${v}`).join(", ")} }`);
    top.push(`const s = useScreen(${str(key)}${init.length ? `, { ${init.join(", ")} }` : ""});`);
    if (sources.length) {
      p.runtime.add("useBindings").add("useDataSource").add("sourceKey");
      p.usesCalls = true;
      /* the sources' arguments are read in the screen's scope before the sources are there */
      if (sources.some((src) => src.lines.some((l) => l.includes("$0.")))) top.push("const $0 = useBindings({ params: s.params, vars: s.vars });");
      for (const src of sources) top.push(...src.lines);
    }
    const needs$ = p.uses$ || p.hooks.length > 0 || sources.length > 0;
    if (needs$) {
      p.runtime.add("useBindings");
      top.push(`const $ = useBindings({ ${names.length ? `data: { ${names.join(", ")} }, ` : ""}params: s.params, vars: s.vars });`);
    }
    top.push(...p.hooks);
    const paged = sources.filter((x) => x.pull || x.more);
    if (paged.length) {
      p.kit.add("usePageData");
      top.push(`usePageData([${paged.map((x) => `{ source: ${x.name}${x.pull ? ", pull: true" : ""}${x.more ? ", more: true" : ""} }`).join(", ")}]);`);
    }
    if (sources.length || p.forms.size) top.push(`s.register({ ${sources.length ? `sources: { ${sources.map((x) => (x.name === identOf(x.source) && x.name === x.source ? x.name : `${str(x.source)}: ${x.name}`)).join(", ")} }` : ""}${sources.length && p.forms.size ? ", " : ""}${p.forms.size ? `forms: { ${[...p.forms].map(([id, f]) => `${keyName(p.names.part(id))}: ${f.handle}`).join(", ")} }` : ""} });`);
    const screen = el("Screen", [["screen", str(key)], ...(bg ? ([["bg", str(bg)]] as [string, string][]) : []), ["width", expr(w)], ["height", expr(h)], ...(length > h ? ([["length", expr(length)]] as [string, string][]) : []), ...(p.room > 0 ? ([["room", expr(p.room)]] as [string, string][]) : [])], [...body, { code: "s.layer" }]);
    const component = screens.names.get(frame.id)!;
    const kitTypes = ["Action", "ActionBody", "Condition", "PickedFile"].filter((t) => p.kit.has(t));
    const kitValues = [...p.kit].filter((k) => !kitTypes.includes(k)).sort();
    const runtimeTypes = [...p.runtime].filter((k) => k.startsWith("type ")).map((k) => k.slice(5));
    const runtimeValues = [...p.runtime].filter((k) => !k.startsWith("type ")).sort();
    const imports = [
      ...(p.react.size ? [`import { ${[...p.react].sort().join(", ")} } from "react";`] : []),
      ...(runtimeValues.length || runtimeTypes.length ? [`import { ${[...runtimeValues, ...runtimeTypes.sort().map((t) => `type ${t}`)].join(", ")} } from ${str(runtimeImport)};`] : []),
      `import { ${[...kitValues, ...kitTypes.sort().map((t) => `type ${t}`)].join(", ")} } from ${str(kitImport)};`,
      ...(p.usesCalls ? [`import { CALLS } from ${str(o.callsImport ?? "../calls")};`] : []),
      ...(usesBody ? ['import { TabBar } from "../tabBar";'] : []),
    ];
    const src = [
      "// Generated by M3E Canvas. Do not edit: the next export rewrites this file (see AGENTS.md).",
      ...imports,
      "",
      ...(p.consts.length ? [...p.consts, ""] : []),
      `export function ${component}() {`,
      ...top.flatMap((l) => l.split("\n")).map((l) => `  ${l}`),
      "  return (",
      jsx(screen, 2),
      "  );",
      "}",
      "",
    ].join("\n");
    return {
      id: frame.id,
      key,
      component,
      path: `pages/${key}/index`,
      title: frame.name,
      width: w,
      height: h,
      source: src,
      pull: sources.some((x) => x.pull),
      ...(frame.params?.length ? { params: frame.params } : {}),
      ...(frame.auth ? { auth: frame.auth } : {}),
      ...(tab.tabs.has(frame.id) ? { tab: tab.tabs.get(frame.id)! } : {}),
    };
  });
  const flows = frames.filter((f) => typeof f.flow === "string" && f.flow).map((f) => ({ name: f.flow!, screen: screens.keys.get(f.id)! }));
  let tabBar: MiniTabBar | undefined;
  if (tab.bar) {
    const def = partBySlug("navigation-bar")!;
    const values = propValues(def, tab.bar.props);
    const defaults = KIT_PARTS["navigation-bar"]?.defaults ?? {};
    const props = def.props
      .filter((d) => d.key !== "selected" && d.key !== "width" && !same(values[d.key], defaults[kitPropName("navigation-bar", d.key)]))
      .map((d) => `${kitPropName("navigation-bar", d.key)}={${expr(values[d.key])}}`)
      .join(" ");
    for (const n of iconNamesOf("navigation-bar", values)) icons.add(n);
    tabBar = { props, items: tab.items, screens: [...tab.tabs.keys()].map((id) => screens.keys.get(id)!) };
  }
  return { screens: printed, warnings, icons: [...icons].sort(), initial: flows[0]?.screen ?? printed[0]?.key ?? "screen1", flows, ...(tabBar ? { tabBar } : {}) };
}

/** a data source's hook: its arguments read in the screen's scope (`$0`), its key, how it pages, its call */
function sourceHook(p: ScreenPrinter, api: ApiSpec, d: NonNullable<Frame["data"]>[number]): { name: string; source: string; lines: string[]; pull: boolean; more: boolean } {
  const name = identOf(d.name);
  const e = endpointOf(api, d.operationId);
  if (!e) p.warn("binding", `the data ${d.name} comes from an operation the contract does not have (${d.operationId})`);
  const args = Object.entries(d.params ?? {}).map(([k, x]) => `${NAME.test(k) ? k : str(k)}: $0.arg(${str(x)})`);
  const { list, paging } = e ? answerShape(api, e) : {};
  const pageSize = pageSizeOf(d, !!paging);
  const spec = [
    `key: sourceKey(${str(d.operationId)}, ${name}Args${d.body ? `, ${name}Body` : ""}),`,
    `operation: ${str(d.operationId)},`,
    ...(list ? [`list: ${expr({ field: list.field })},`] : []),
    ...(paging ? [`paging: ${expr(paging)},`] : []),
    ...(pageSize ? [`pageSize: ${expr(pageSize)},`] : []),
    `args: ${name}Args,`,
    `load: ({ page, signal }) => CALLS[${str(d.operationId)}]({ ...${name}Args, ...page }, ${d.body ? `${name}Body` : "undefined"}, { signal }),`,
  ];
  const lines = [
    `const ${name}Args = ${objOf(args)};`,
    ...(d.body ? [`const ${name}Body = $0.ev(${str(d.body)});`] : []),
    `const ${name} = useDataSource({`,
    ...spec.map((l) => `  ${l}`),
    `}${d.load === "demand" ? ', { load: "demand" }' : ""});`,
  ];
  return { name, source: d.name, lines, pull: !!d.pullToRefresh, more: d.paging === "scroll" && !!paging };
}

export { kebab };
