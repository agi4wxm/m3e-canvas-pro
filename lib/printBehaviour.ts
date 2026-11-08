import { appearanceOf } from "../parts/appearance";
import { isNode, isRaw, isWrap, mapNodes, raw, type PNode, type PValue } from "../parts/node";
import { EXPR_NODE, namesIn, printValue, str } from "../parts/print";
import { OVERLAY_ROOTS, partBySlug, reader, treeOf, withoutPickedImages } from "../parts/registry";
import type { PartDef, PropDef } from "../parts/types";
import { WIDGET_SOURCES } from "../parts/widgets/sources";
import { type Row, CURRENT_TOKEN, fillCurrent, firstRows, markCurrent } from "./collections";
import { INPUT_PROP, coerce, isOverlayPart } from "./interact";
import { demoRuns, isPlaceKey } from "./partContract";
import { collectionIdOf, collectionsOf, cssNameOf, isBindField, modeFor, valueIn, varValues } from "./variables";
import { cleanMotion, cleanTrigger, flowStarts } from "./prototype";
import type { BoundPrint } from "./printBindings";
import { BACK_TARGET, LINK_TARGET, STAY_TARGET, actionSlotsOf, actionsOf, darkVarOf, heldBy, holdsParts, linkUrlOf, type Action, type ActionBody, type Condition, type Doc, type Effect, type Frame, type Group, type Item, type Transition, type VarType, type VarValue } from "./tokens";

/* What a tap does and what state a part reads, as source text over the generated runtime
 * (lib/runtimeSource.ts). Pure, like the rest of the printer: a document in, strings out.
 *
 * A part's tree is written by its definition against plain values, so a value only known at run time
 * cannot simply be handed to it: `active: i === p.n("selected") || undefined` needs a number. Words go
 * through as marks and are swapped for the expression afterwards; anything else (a choice, a number,
 * an on/off) is drawn once per value it can take, and where those drawings differ becomes an expression
 * over that value. So the same definition prints `active={tab("nav", 0) === 2 || undefined}`, with no
 * second description of the part to keep in step. */

type VarInfo = { key: string; type: VarType; start: VarValue };

/** what a screen takes from the runtime */
export type Uses = { app: Set<string>; press: boolean };

export type RuntimeSpec = {
  screens: string[];
  vars: VarInfo[];
  parts: string[];
  /** parts that start off the screen */
  hidden: string[];
  /** overlays that start open */
  opened: string[];
  /** what `{{current.field}}` reads until a row has been tapped */
  current: Row;
  /** the variable that is the app's dark mode (DocVar `drives: "dark"`) */
  dark?: string;
  /** where flows start (`Frame.flow`), in the document's order: the first is where the app starts */
  flows?: { key: string; name: string; screen: string }[];
  /** what of the prototype the screens use beyond taps and plain transitions, when they use any of it: animations
   *  always come with it */
  proto?: { overlay: boolean; scroll: boolean; hover: boolean; delay: boolean };
  /** variables with a value in several modes, and the design fields bound to variables */
  modes?: ModesSpec;
  /** the screens read expressions (lib/bindings/expr.ts): the names and ids `vars.<name>` reads each variable by */
  exprs?: { vars: Record<string, string[]> };
  /** the product's bindings: what the runtime keeps for them (lib/printBindings.ts) */
  bound?: BoundSpec;
};

/** What the product web app's runtime keeps for the bindings: the params each screen takes, the screens that need a
 *  session, the sign-in screen, and the runtime package's name. */
export type BoundSpec = {
  runtime: string;
  params: Record<string, { name: string; type?: string; example?: unknown }[]>;
  auth: string[];
  signIn?: string;
};

/** What the runtime keeps of variable modes: the collections with more than one mode, by key; the mode of each a screen
 *  shows while light and while dark (by screen key, then collection key); each variable's value in each mode (by
 *  variable key, then mode key); the variables design fields are bound to, with the CSS variable each is painted by;
 *  and whether any screen's modes follow the dark mode. */
export type ModesSpec = {
  collections: string[];
  screens: Record<string, Record<string, [light: string, dark: string]>>;
  values: Record<string, { collection: string; values: Record<string, VarValue> }>;
  bound: { key: string; css: string; kind: "color" | "number" }[];
  followsDark: boolean;
};

const TRANSITIONS: readonly Transition[] = ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"];

type Options = {
  /** the whole app is generated, so a part behaves as it does in the preview even with no action on it */
  live: boolean;
  /** the screens printed: a tap to any other goes nowhere */
  shown: Frame[];
  /** the path the code gives a picture the document holds as data */
  image: string | ((data: string) => string);
  /** the bindings printed against the product's runtime and client (lib/printBindings.ts); left out, the prototype's
   *  own runtime reads what expressions it can (its variables) and the rest reads as nothing */
  binds?: BoundPrint;
};

const json = (v: unknown) => str(v);

/** a key for the code from what the author called something; `fallback` when it holds no latin letters */
function camel(name: string | undefined, fallback: string, taken: Set<string>): string {
  const words = (name ?? "").match(/[A-Za-z0-9]+/g) ?? [];
  let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join("");
  if (!base || /^\d/.test(base)) base = fallback;
  let out = base;
  for (let i = 2; taken.has(out); i++) out = `${base}${i}`;
  taken.add(out);
  return out;
}

/* ---------- values drawn several ways, folded into one tree ---------- */

type Folding = { expr: string; samples: VarValue[]; keepTap: boolean };

const same = (a: unknown, b: unknown) => json(a) === json(b);
const isPlain = (v: unknown): v is Record<string, PValue> => typeof v === "object" && v !== null && !Array.isArray(v) && !isRaw(v) && !isWrap(v) && !isNode(v);
const exprNode = (code: PValue): PNode => ({ type: EXPR_NODE, props: { code } });

/** `a * x + b` over the samples, when that says what the values do */
function linear(xs: number[], ys: number[], expr: string): string | null {
  const far = xs.findIndex((x) => x !== xs[0]);
  if (far < 0) return null;
  const slope = (ys[far] - ys[0]) / (xs[far] - xs[0]);
  const shift = ys[0] - slope * xs[0];
  if (xs.some((x, i) => Math.abs(slope * x + shift - ys[i]) > 1e-9)) return null;
  const times = slope === 1 ? expr : `${expr} * ${slope}`;
  return shift === 0 ? times : shift > 0 ? `${times} + ${shift}` : `${times} - ${-shift}`;
}

const inTemplate = (s: string) => s.replace(/[\\`]/g, "\\$&").replace(/\$\{/g, "\\${");

/** the code that reads one field of the row last tapped; a field it does not have reads as nothing */
const currentField = (field: string) => `${/^[A-Za-z_$][\w$]*$/.test(field) ? `current.${field}` : `current[${json(field)}]`} ?? ""`;

/** words that differ only in one number that follows the value: `tab-${value + 1}`, `${value}%` */
function templated(xs: number[], words: string[], expr: string): string | null {
  const pieces = words.map((w) => w.split(/(-?\d+(?:\.\d+)?)/));
  if (pieces.some((p) => p.length !== pieces[0].length)) return null;
  let at = -1;
  for (let i = 0; i < pieces[0].length; i++) {
    if (pieces.every((p) => p[i] === pieces[0][i])) continue;
    if (i % 2 === 0 || at >= 0) return null;
    at = i;
  }
  if (at < 0) return null;
  const inner = linear(xs, pieces.map((p) => Number(p[at])), expr);
  if (!inner) return null;
  return `\`${inTemplate(pieces[0].slice(0, at).join(""))}\${${inner}}${inTemplate(pieces[0].slice(at + 1).join(""))}\``;
}

/** the expression for one place where the drawings differ */
function leafCode(vals: PValue[], f: Folding): string {
  const { expr, samples } = f;
  const lit = (v: PValue) => (v === undefined ? "undefined" : printValue(v, f.keepTap));
  if (samples.every((s) => typeof s === "number")) {
    const xs = samples as number[];
    if (vals.every((v) => typeof v === "number")) {
      const code = linear(xs, vals as number[], expr);
      if (code) return code;
    }
    if (vals.every((v) => typeof v === "string")) {
      const code = templated(xs, vals as string[], expr);
      if (code) return code;
    }
  }
  if (samples.length === 2 && typeof samples[0] === "boolean") {
    const on = vals[samples[0] ? 0 : 1];
    const off = vals[samples[0] ? 1 : 0];
    if (on === true && off === undefined) return `${expr} || undefined`;
    if (on === true && off === false) return expr;
    if (off === true && on === undefined) return `!${expr} || undefined`;
    if (off === true && on === false) return `!${expr}`;
    return `${expr} ? ${lit(on)} : ${lit(off)}`;
  }
  /* the value most of the samples agree on goes last: "only the second tab looks like this" */
  const count = (v: PValue) => vals.filter((x) => same(x, v)).length;
  const usual = vals.reduce((best, v) => (count(v) > count(best) ? v : best), vals[0]);
  const rest = vals.map((v, i) => [samples[i], v] as const).filter(([, v]) => !same(v, usual));
  if (rest.length === 1 && rest[0][1] === true && usual === undefined) return `${expr} === ${json(rest[0][0])} || undefined`;
  if (rest.length === 1 && rest[0][1] === true && usual === false) return `${expr} === ${json(rest[0][0])}`;
  return `${rest.map(([s, v]) => `${expr} === ${json(s)} ? ${lit(v)} : `).join("")}${lit(usual)}`;
}

function leaf(vals: PValue[], f: Folding): PValue {
  const uses = vals.flatMap((v) => (isNode(v) ? [...namesIn(v)] : isRaw(v) ? (v.uses ?? []) : []));
  return raw(leafCode(vals, f), ...new Set(uses));
}

function foldValues(vals: PValue[], f: Folding): PValue {
  if (vals.every((v) => same(v, vals[0]))) return vals[0];
  if (vals.every(isNode)) return foldNodes(vals as PNode[], f);
  if (vals.every(Array.isArray) && vals.every((v) => (v as PValue[]).length === (vals[0] as PValue[]).length)) return (vals[0] as PValue[]).map((_, i) => foldValues(vals.map((v) => (v as PValue[])[i]), f));
  if (vals.every(isPlain)) {
    const keys = [...new Set(vals.flatMap((v) => Object.keys(v as object)))];
    return Object.fromEntries(keys.map((k) => [k, foldValues(vals.map((v) => (v as Record<string, PValue>)[k]), f)]));
  }
  return leaf(vals, f);
}

/* a `default…` prop only counts on the first draw: one that changes has to be the controlled one.
 * The tap on the part is what moves it, so a control with such a value is never left frozen */
const CONTROLLED: Record<string, string> = { defaultValue: "value", defaultChecked: "checked", defaultPressed: "pressed" };
const ON_OFF = new Set(["checked", "pressed"]);

function foldNodes(nodes: PNode[], f: Folding): PNode {
  const first = nodes[0];
  const alike = nodes.every((n) => n.type === first.type && (n.children?.length ?? 0) === (first.children?.length ?? 0) && (n.children ?? []).every((c, i) => typeof c === typeof first.children![i]));
  if (!alike) return exprNode(leaf(nodes, f));
  const keys = [...new Set(nodes.flatMap((n) => Object.keys(n.props ?? {})))];
  const props: Record<string, PValue> = {};
  for (const k of keys) {
    const vals = nodes.map((n) => n.props?.[k]);
    const moves = !vals.every((v) => same(v, vals[0]));
    const name = moves ? (CONTROLLED[k] ?? k) : k;
    /* an on/off a control holds is controlled for as long as it lives: "off" cannot be left out */
    props[name] = foldValues(ON_OFF.has(name) ? vals.map((v) => v ?? false) : vals, f);
  }
  const out: PNode = { type: first.type };
  if (keys.length) out.props = props;
  if (first.children?.length) {
    out.children = first.children.map((c, i) => {
      const at = nodes.map((n) => n.children![i]);
      if (typeof c === "string") return at.every((x) => x === c) ? c : exprNode(leaf(at as string[], f));
      return foldNodes(at as PNode[], f);
    });
  }
  return out;
}

/* ---------- words, which go through a part's tree as marks ---------- */

const MARK_OPEN = "";
const MARK_CLOSE = "";
const markOf = (key: string) => `${MARK_OPEN}${key}${MARK_CLOSE}`;
const MARKS = new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]*)${MARK_CLOSE}`, "g");

function unmarkWords(s: string, subs: Map<string, string>): string {
  const whole = new RegExp(`^${MARK_OPEN}([^${MARK_CLOSE}]*)${MARK_CLOSE}$`).exec(s);
  if (whole) return subs.get(whole[1]) ?? "undefined";
  let out = "`";
  let last = 0;
  for (const m of s.matchAll(MARKS)) {
    out += `${inTemplate(s.slice(last, m.index))}\${${subs.get(m[1])}}`;
    last = m.index + m[0].length;
  }
  return `${out}${inTemplate(s.slice(last))}\``;
}

function unmarkValue(v: PValue, subs: Map<string, string>): PValue {
  if (typeof v === "string") return v.includes(MARK_OPEN) ? raw(unmarkWords(v, subs)) : v;
  if (isRaw(v)) return v.$raw.includes(MARK_OPEN) ? { ...v, $raw: v.$raw.replace(new RegExp(`"[^"]*${MARK_OPEN}[^"]*"`, "g"), (q) => unmarkWords(JSON.parse(q), subs)) } : v;
  if (isWrap(v)) return v;
  if (isNode(v)) return unmarkNode(v, subs);
  if (Array.isArray(v)) return v.map((x) => unmarkValue(x, subs));
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmarkValue(x, subs)]));
  return v;
}

function unmarkNode(n: PNode, subs: Map<string, string>): PNode {
  return {
    ...n,
    props: n.props && Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, unmarkValue(v, subs)])),
    children: n.children?.map((c) => (typeof c === "string" ? (c.includes(MARK_OPEN) ? exprNode(raw(unmarkWords(c, subs))) : c) : unmarkNode(c, subs))),
  };
}

/* ---------- what a prop can take, to draw it each way ---------- */

function samplesOf(d: PropDef, def: PartDef, it: Item): VarValue[] {
  const p = reader(def, it.props);
  if (d.kind === "bool") return [true, false];
  if (d.kind === "enum") return d.options.map((o) => (typeof o === "string" ? o : o.value));
  if (d.kind !== "number") return [];
  const now = p.n(d.key);
  if (d.key === def.selectKey) {
    const rows = def.props.find((x) => x.kind === "list");
    const count = rows ? p.list(rows.key).length : 0;
    return [...new Set([...Array.from({ length: count }, (_, i) => i), now])];
  }
  const step = d.step ?? 1;
  if ((d.max - d.min) / step <= 12) {
    const all: number[] = [];
    for (let i = 0; d.min + i * step <= d.max + 1e-9; i++) all.push(Math.round((d.min + i * step) * 1e6) / 1e6);
    return [...new Set([...all, now])];
  }
  return [...new Set([now, Math.min(d.max, now + step), Math.max(d.min, now - step)])];
}

/* the destination bars (`PartDef.nav`): on every screen, the bar of the same entries is one bar */
const isNavBar = (def: PartDef) => !!def.nav;

/** where a part's click can go straight on its root: these pass it on to their button */
const CLICKS_ON_ROOT = new Set(["Button", "Fab", "ExtendedFab"]);

type Standing = "stands" | "menu" | "plain";
/** a dialog stands on the screen only while open; a menu keeps its trigger and only its popup opens;
 *  anything else an effect opens simply shows */
const standingOf = (def: PartDef | undefined): Standing => (!def?.open ? "plain" : def.open.trigger === "hide" ? "stands" : "menu");

export class Behaviour {
  readonly live: boolean;
  private readonly doc: Doc;
  private readonly image: Options["image"];
  private readonly screens = new Map<string, string>();
  private readonly vars = new Map<string, VarInfo>();
  /** the state an input holds when no variable of the author's does: by item id */
  private readonly inputs = new Map<string, VarInfo>();
  private readonly varKeys = new Set<string>();
  private readonly partKeys = new Map<string, string>();
  private readonly bars = new Map<string, string>();
  private readonly owner = new Map<string, Group>();
  private readonly holders = new Map<string, Group[]>();
  /** groups a show, hide or toggle reaches */
  private readonly visTargets = new Set<string>();
  /** items an open or close holds open */
  private readonly openTargets = new Set<string>();
  private readonly propTargets = new Map<string, Set<string>>();
  /** inputs a condition asks about */
  private readonly filled = new Set<string>();
  /** what a dock holds directly: the group, its tab and the dock */
  private readonly panes = new Map<string, { host: Item; pane: number }>();
  /** the docks whose tabs have to work: ids of what they hold, at any depth */
  private readonly inLiveDock = new Set<string>();
  private readonly usedParts = new Set<string>();
  /** something in the document reads the row last tapped, so a tap on a row has to say which it was */
  private readonly readsCurrent: boolean;
  /** the row the part being printed was drawn for */
  private rowNow: Row | undefined;
  /** the screens printed */
  private readonly shown: Frame[];
  /** parts an action scrolls to: each is marked so the runtime can find it */
  private readonly scrollTargets = new Set<string>();
  /** the CSS variable each variable a design field is bound to paints it by (`--m3e-v-<name>`), by variable id */
  private readonly boundNames = new Map<string, string>();
  /** what of the prototype has been printed so far */
  private readonly printed = { motion: false, overlay: false, scroll: false, hover: false, delay: false };
  /** the bindings, printed against the product's runtime */
  readonly bound?: BoundPrint;
  private readonly groupById: Map<string, Group>;
  /** an expression has been printed: the runtime reads them */
  private readsExprs = false;
  /** a screen opened with params, or a session asked for */
  private navigates = false;

  constructor(doc: Doc, widths: Record<string, number>, o: Options) {
    this.doc = doc;
    this.live = o.live;
    this.image = o.image;
    this.readsCurrent = JSON.stringify(doc.groups).includes("{{current.");
    this.shown = o.shown;
    this.bound = o.binds;
    this.groupById = new Map(doc.groups.map((g) => [g.id, g]));
    const screenKeys = new Set<string>();
    o.shown.forEach((f, i) => this.screens.set(f.id, camel(f.name, `screen${i + 1}`, screenKeys)));
    /* a variable starts at its value in the mode the document shows */
    const starts = varValues(doc);
    for (const [i, v] of (Array.isArray(doc.vars) ? doc.vars : []).entries()) this.vars.set(v.id, { key: camel(v.name, `var${i + 1}`, this.varKeys), type: v.type, start: starts[v.id] ?? v.value });
    const partNames = new Set<string>();
    for (const g of doc.groups)
      for (const it of g.items) {
        this.owner.set(it.id, g);
        /* what the author called it, else the first words it shows, else what it is */
        const props = (it.props ?? {}) as Record<string, unknown>;
        const shows = [props.text, props.label, props.title, props.placeholder].find((v): v is string => typeof v === "string" && /[A-Za-z]/.test(v));
        const name = (g.items.length === 1 ? g.name : undefined) ?? shows?.match(/[A-Za-z0-9]+/g)?.slice(0, 3).join(" ");
        this.partKeys.set(it.id, camel(name, it.component ? camel(it.component, "part", new Set()) : "part", partNames));
      }
    /* each variable a design field is bound to gets a CSS name of its own, the same however often it is bound */
    const cssNames = new Set<string>();
    for (const g of doc.groups)
      for (const it of g.items)
        for (const [field, id] of Object.entries(it.bind ?? {})) {
          const v = isBindField(field) && !this.boundNames.has(id) ? doc.vars?.find((x) => x.id === id) : undefined;
          if (!v) continue;
          const base = cssNameOf(v);
          let name = base;
          for (let i = 2; cssNames.has(name); i++) name = `${base.slice(0, 36)}-${i}`;
          cssNames.add(name);
          this.boundNames.set(id, name);
        }
    for (const g of doc.groups)
      for (const it of g.items) {
        if (g.showWhen && "filled" in g.showWhen) this.filled.add(g.showWhen.filled);
        for (const { action } of actionsOf(it)) {
          this.scanBody(action);
          if (action.when && "filled" in action.when) this.filled.add(action.when.filled);
          if (action.else) this.scanBody(action.else);
        }
      }
    for (const host of doc.groups) {
      if (!holdsParts(host)) continue;
      const held = heldBy(host, doc.groups, widths);
      for (const g of held) this.holders.set(g.id, [...(this.holders.get(g.id) ?? []), host]);
      const it = host.items[0];
      const def = partBySlug(it.component);
      if (!def?.panes || !def.selectKey || !def.slots) continue;
      const p = reader(def, it.props);
      const count = def.slots(p).length;
      const shown = Math.max(0, Math.min(count - 1, Math.round(p.n(def.selectKey))));
      const nested = new Set(held.flatMap((g) => heldBy(g, doc.groups, widths).map((x) => x.id)));
      const direct = held.filter((g) => !nested.has(g.id));
      const paneOf = (g: Group) => Math.max(0, Math.min(count - 1, g.pane ?? 0));
      if (!o.live && !Object.keys(it.actions ?? {}).length && !direct.some((g) => paneOf(g) !== shown)) continue;
      for (const g of direct) this.panes.set(g.id, { host: it, pane: paneOf(g) });
      for (const g of held) this.inLiveDock.add(g.id);
    }
  }

  private scanBody(b: ActionBody) {
    if (typeof b.scrollTo === "string" && this.owner.has(b.scrollTo)) this.scrollTargets.add(b.scrollTo);
    for (const e of Array.isArray(b.effects) ? b.effects : []) {
      if (!("part" in e)) continue;
      const g = this.owner.get(e.part);
      const it = g?.items.find((x) => x.id === e.part);
      if (!g || !it) continue;
      if (e.do === "setProp") {
        const set = this.propTargets.get(it.id) ?? new Set<string>();
        set.add(e.prop);
        this.propTargets.set(it.id, set);
        continue;
      }
      const standing = standingOf(partBySlug(it.component));
      if (standing === "stands") this.openTargets.add(it.id);
      else if (standing === "menu" && (e.do === "open" || e.do === "close")) this.openTargets.add(it.id);
      else this.visTargets.add(g.id);
    }
  }

  /** what a dock's tabs have to be able to bring up, so it is printed whichever tab starts chosen */
  keepsOffTab(id: string): boolean {
    /* every state a region designs is printed, each shown while its data is in that state */
    if (this.bound && this.groupById.get(id)?.inFlow && this.doc.groups.some((h) => h.states && h.id === this.groupById.get(id)!.inFlow)) return true;
    if (this.bound && this.regionDescendant(id)) return true;
    return this.inLiveDock.has(id);
  }

  /** whether a group stands inside a region's design */
  private regionDescendant(id: string): boolean {
    let at = this.groupById.get(id);
    for (let i = 0; at?.inFlow && i < 64; i++) {
      const host = this.groupById.get(at.inFlow);
      if (host?.states) return true;
      at = host;
    }
    return false;
  }

  /** the CSS variable a variable bound to a design field paints it by, in a whole app (lib/codegen.ts) */
  cssVarOf(varId: string): string | undefined {
    return this.live ? this.boundNames.get(varId) : undefined;
  }

  /** the flows that start on a printed screen */
  private flows(): RuntimeSpec["flows"] {
    const keys = new Set<string>();
    const out = flowStarts(this.shown).flatMap((f, i) => {
      const screen = this.screens.get(f.id);
      return screen ? [{ key: camel(f.flow, `flow${i + 1}`, keys), name: f.flow ?? "", screen }] : [];
    });
    return out.length ? out : undefined;
  }

  /** The collections with more than one mode, as the runtime reads them, and the design fields bound to variables.
   *  Which mode a screen shows is worked out here, by the editor's own rule (lib/variables.ts `modeFor`), for the app
   *  light and dark; the runtime only picks between the two. */
  private modes(): ModesSpec | undefined {
    const vars = (Array.isArray(this.doc.vars) ? this.doc.vars : []).filter((v) => v.drives !== "dark" && this.vars.has(v.id));
    const all = collectionsOf(this.doc);
    const used = all.filter((c) => c.modes.length > 1 && vars.some((v) => collectionIdOf(v, all) === c.id));
    const bound = [...this.boundNames].flatMap(([id, css]) => {
      const v = this.vars.get(id);
      return v ? [{ key: v.key, css, kind: v.type === "color" ? ("color" as const) : ("number" as const) }] : [];
    });
    if (!used.length && !bound.length) return undefined;
    const collectionKeys = new Set<string>();
    const named = used.map((c, i) => {
      const modeKeys = new Set<string>();
      return { c, key: camel(c.name, `collection${i + 1}`, collectionKeys), modes: new Map(c.modes.map((m, j) => [m.id, camel(m.name, `mode${j + 1}`, modeKeys)])) };
    });
    const screens = Object.fromEntries(
      this.shown.flatMap((f) => {
        const key = this.screens.get(f.id);
        return key ? [[key, Object.fromEntries(named.map((n) => [n.key, [n.modes.get(modeFor(this.doc, n.c, f, false))!, n.modes.get(modeFor(this.doc, n.c, f, true))!] as [string, string]]))]] : [];
      }),
    );
    const values = Object.fromEntries(
      vars.flatMap((v) => {
        const n = named.find((x) => x.c.id === collectionIdOf(v, all));
        return n ? [[this.vars.get(v.id)!.key, { collection: n.key, values: Object.fromEntries(n.c.modes.map((m) => [n.modes.get(m.id)!, valueIn(v, m.id, n.c)])) }]] : [];
      }),
    );
    const followsDark = Object.values(screens).some((byCollection) => Object.values(byCollection).some(([light, dark]) => light !== dark));
    return { collections: named.map((n) => n.key), screens, values, bound, followsDark };
  }

  /** the parts the runtime has to know about, once every screen has been printed */
  spec(screens: string[]): RuntimeSpec {
    const hidden: string[] = [];
    const opened: string[] = [];
    for (const g of this.doc.groups) {
      const key = this.partKeys.get(g.items[0]?.id ?? "");
      if (key && this.usedParts.has(key) && g.hidden && this.gatedByVisible(g)) hidden.push(key);
      for (const it of g.items) {
        const k = this.partKeys.get(it.id)!;
        if (this.usedParts.has(k) && this.heldByState(it, g) && standingOf(partBySlug(it.component)) === "stands" && !g.hidden) opened.push(k);
      }
    }
    const darkVar = darkVarOf(this.doc.vars);
    const dark = darkVar ? this.vars.get(darkVar.id)?.key : undefined;
    const flows = this.flows();
    const { motion, ...proto } = this.printed;
    const modes = this.live ? this.modes() : undefined;
    return {
      screens,
      vars: [...this.vars.values(), ...this.inputs.values()],
      parts: [...this.usedParts],
      hidden,
      opened,
      current: firstRows(this.doc.collections ?? []),
      ...(dark ? { dark } : {}),
      ...(flows ? { flows } : {}),
      ...(motion || Object.values(proto).some(Boolean) ? { proto } : {}),
      ...(modes ? { modes } : {}),
      ...(this.readsExprs || this.bound ? { exprs: { vars: this.varNames() } } : {}),
      ...(this.bound ? { bound: this.boundSpec() } : {}),
    };
  }

  /** each variable's key, with the names and the id expressions read it by */
  private varNames(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const v of Array.isArray(this.doc.vars) ? this.doc.vars : []) {
      const info = this.vars.get(v.id);
      if (info) out[info.key] = [...new Set([v.name, v.id].filter((n) => typeof n === "string" && n))];
    }
    return out;
  }

  /** what the product's runtime keeps for the bindings */
  private boundSpec(): BoundSpec {
    const params: BoundSpec["params"] = {};
    const auth: string[] = [];
    let signIn: string | undefined;
    for (const f of this.shown) {
      const key = this.screens.get(f.id);
      if (!key) continue;
      if (f.params?.length) params[key] = f.params.map((p) => ({ name: p.name, ...(p.type ? { type: p.type } : {}), ...(p.example !== undefined ? { example: p.example } : {}) }));
      if (f.auth === "required") auth.push(key);
      if (f.auth === "login" && !signIn) signIn = key;
    }
    return { runtime: this.bound!.o.runtime, params, auth, ...(signIn ? { signIn } : {}) };
  }

  /** Words that may read the row last tapped, as code. On a part drawn for a row the tap itself says
   *  which row that is, and it is known here: the app's own `current` is still the last tap's until the
   *  next draw. */
  private wordsCode(text: string, uses: Uses): string {
    const words = this.rowNow ? fillCurrent(text, this.rowNow) : text;
    const pieces = words.split(CURRENT_TOKEN);
    if (pieces.length === 1) return json(words);
    uses.app.add("current");
    /* split with a group: every odd piece is a field */
    return `\`${pieces.map((piece, i) => (i % 2 ? `\${${currentField(piece)}}` : inTemplate(piece))).join("")}\``;
  }

  /* ---------- names ---------- */

  private part(id: string, uses?: Uses, ...names: string[]): string {
    const key = this.partKeys.get(id) ?? "part";
    this.usedParts.add(key);
    for (const n of names) uses?.app.add(n);
    return json(key);
  }

  private barKey(it: Item, def: PartDef): string {
    if (!isNavBar(def)) return this.partKeys.get(it.id)!;
    const nav = `${def.slug}:${actionSlotsOf(it).map((s) => s.label).join("|")}`;
    if (!this.bars.has(nav)) this.bars.set(nav, this.partKeys.get(it.id)!);
    return this.bars.get(nav)!;
  }

  /* ---------- variables ---------- */

  /** the variable an input reads and writes: the one it is bound to, or one of its own when the
   *  document asks about it or, in a whole app, so that what was typed outlives the screen */
  private inputVar(it: Item): VarInfo | null {
    const key = INPUT_PROP[it.component ?? ""];
    const def = partBySlug(it.component);
    if (key === undefined || !def) return null;
    if (this.bound?.form && it.field) return null;
    const bound = it.bind?.[key] ? this.vars.get(it.bind[key]) : undefined;
    if (bound) return bound;
    if (this.inputs.has(it.id)) return this.inputs.get(it.id)!;
    if (!this.live && !this.filled.has(it.id) && !this.propTargets.get(it.id)?.has(key)) return null;
    const p = reader(def, it.props);
    const d = def.props.find((x) => x.key === key);
    const name = this.partKeys.get(it.id);
    let info: VarInfo;
    if (key === "selected") {
      const rows = p.list("items");
      info = { key: camel(name, "field", this.varKeys), type: "text", start: rows[Math.min(p.n(key), rows.length - 1)]?.label ?? "" };
    } else if (d?.kind === "bool") info = { key: camel(name, "field", this.varKeys), type: "bool", start: p.b(key) };
    else if (d?.kind === "number") info = { key: camel(name, "field", this.varKeys), type: "number", start: p.n(key) };
    else info = { key: camel(name, "field", this.varKeys), type: "text", start: p.s(key) };
    this.inputs.set(it.id, info);
    return info;
  }

  /** a variable as the kind of value a prop takes */
  private readVar(v: VarInfo, kind: "text" | "number" | "bool", uses: Uses): string {
    uses.app.add("vars");
    const at = `vars.${v.key}`;
    if (kind === v.type) return at;
    if (kind === "text") return `String(${at})`;
    if (kind === "number") return `Number(${at})`;
    if (v.type === "number") return `!!${at}`;
    uses.app.add("asBool");
    return `asBool(${at})`;
  }

  /** what an input just reported, as the variable's type */
  private toVar(v: VarInfo, code: string, from: "text" | "number" | "bool"): string {
    if (from === v.type) return code;
    if (v.type === "text") return `String(${code})`;
    if (v.type === "number") return `Number(${code}) || 0`;
    return `!!${code}`;
  }

  /* ---------- conditions and effects ---------- */

  /** a condition on a field of the row a part was drawn for is settled here, row by row */
  private onRow(c: Condition, row: Row | undefined): boolean | undefined {
    if ("filled" in c || "expr" in c || !c.var.startsWith("row.") || !row) return undefined;
    const same = String(row[c.var.slice(4)]) === String(c.value);
    return c.op === "neq" ? !same : same;
  }

  condition(c: Condition, uses: Uses, row: Row | undefined = this.rowNow): string {
    const known = this.onRow(c, row);
    if (known !== undefined) return String(known);
    /* an expression: the product reads it in the part's scope; the prototype's runtime reads what it can of it */
    if ("expr" in c) {
      if (typeof c.expr !== "string") return "false";
      if (this.bound) return this.bound.holds(c.expr);
      this.readsExprs = true;
      uses.app.add("holds");
      return `holds(${json(c.expr)})`;
    }
    if ("filled" in c) {
      const it = this.owner.get(c.filled)?.items.find((x) => x.id === c.filled);
      const v = it && this.inputVar(it);
      if (!v) return "false";
      uses.app.add("vars").add("hasValue");
      return `hasValue(vars.${v.key})`;
    }
    const v = this.vars.get(c.var);
    const neq = c.op === "neq";
    if (!v) return "false";
    uses.app.add("vars");
    /* the panel writes what it was typed as: "3" and 3 are the same answer, "x" and 3 never are */
    const typed = coerce(c.value, v.type);
    if (typed === null || String(typed) !== String(c.value)) return neq ? "true" : "false";
    if (v.type === "bool") return typed === !neq ? `vars.${v.key}` : `!vars.${v.key}`;
    return `vars.${v.key} ${neq ? "!==" : "==="} ${json(typed)}`;
  }

  private effect(e: Effect, uses: Uses): string | null {
    const call = (name: string, ...args: unknown[]) => {
      uses.app.add(name);
      return `${name}(${args.join(", ")})`;
    };
    if (this.bound) {
      const done = this.bound.effect(e, (body, scope) => this.bound!.within(scope, this.bound!.form, () => this.bodyStatements(body, uses)));
      if (done !== undefined) {
        for (const n of this.bound.appNames()) uses.app.add(n);
        return done;
      }
    }
    switch (e.do) {
      case "show":
      case "hide":
      case "toggle":
      case "open":
      case "close": {
        const g = this.owner.get(e.part);
        const it = g?.items.find((x) => x.id === e.part);
        if (!g || !it) return null;
        const standing = standingOf(partBySlug(it.component));
        const key = this.part(e.part);
        if (standing === "stands") {
          if (e.do === "toggle") return `${call("isOpen", key)} ? ${call("close", key)} : ${call("open", key)}`;
          return call(e.do === "show" || e.do === "open" ? "open" : "close", key);
        }
        if (standing === "menu" && (e.do === "open" || e.do === "close")) return call(e.do, key);
        const vis = this.part(g.items[0].id);
        return call(e.do === "open" ? "show" : e.do === "close" ? "hide" : e.do, vis);
      }
      case "setVar": {
        const v = this.vars.get(e.var);
        if (v && typeof e.expr === "string" && this.bound) return call("setVar", json(v.key), this.bound.setVarValue(e.expr, v.type));
        const value = v && coerce(e.value, v.type);
        return v && value !== null && value !== undefined ? call("setVar", json(v.key), typeof value === "string" ? this.wordsCode(value, uses) : json(value)) : null;
      }
      case "toggleVar": {
        const v = this.vars.get(e.var);
        return v?.type === "bool" ? call("toggleVar", json(v.key)) : null;
      }
      case "addVar": {
        const v = this.vars.get(e.var);
        return v && v.type !== "bool" && Number.isFinite(e.by) ? call("addVar", json(v.key), e.by) : null;
      }
      case "setProp":
        return this.setProp(e, uses, call);
      case "snackbar":
        return call("snackbar", (this.bound && this.bound.words(e.message)) || this.wordsCode(e.message, uses));
      default:
        /* a kind this version does not know, from a file saved by a later one */
        return null;
    }
  }

  private setProp(e: Extract<Effect, { do: "setProp" }>, uses: Uses, call: (name: string, ...args: unknown[]) => string): string | null {
    const it = this.owner.get(e.part)?.items.find((x) => x.id === e.part);
    const def = partBySlug(it?.component);
    const d = def?.props.find((x) => x.key === e.prop);
    if (!it || !def || !d) return null;
    if (INPUT_PROP[def.slug] === e.prop) {
      const v = this.inputVar(it);
      if (!v) return null;
      const rows = e.prop === "selected" ? reader(def, it.props).list("items") : [];
      const value = e.prop === "selected" && v.type === "text" ? (rows[Number(e.value)]?.label ?? "") : coerce(e.value, v.type);
      return value === null ? null : call("setVar", json(v.key), json(value));
    }
    if (e.prop === def.selectKey && this.selecting(it, def)) {
      this.usedParts.add(this.barKey(it, def));
      return call("selectTab", json(this.barKey(it, def)), Number(e.value) || 0);
    }
    const value = d.kind === "number" ? Number(e.value) || 0 : d.kind === "bool" ? coerce(e.value, "bool") : String(e.value);
    return call("setProp", this.part(it.id), json(e.prop), typeof value === "string" ? this.wordsCode(value, uses) : json(value));
  }

  /** where it goes, after its effects: back, out to a link, or a part of the screen scrolled into view and then on to a
   *  screen, in its place or laid over it, the way it comes in */
  private nav(b: ActionBody, uses: Uses): string[] {
    if (b.to === BACK_TARGET) {
      uses.app.add("back");
      return ["back()"];
    }
    if (b.to === LINK_TARGET) {
      /* an address read off the row last tapped can only be known at run time */
      if (b.url?.includes("{{current.") && !this.rowNow) {
        uses.app.add("openLink");
        return [`openLink(${this.wordsCode(b.url.trim(), uses)})`];
      }
      const href = linkUrlOf(this.rowNow ? fillCurrent(b, this.rowNow) : b);
      if (!href) return [];
      uses.app.add("openLink");
      return [`openLink(${json(href)})`];
    }
    const out: string[] = [];
    if (typeof b.scrollTo === "string" && this.scrollTargets.has(b.scrollTo)) {
      this.printed.scroll = true;
      out.push(`scrollTo(${this.part(b.scrollTo, uses, "scrollTo")})`);
    }
    if (b.to === STAY_TARGET) return out;
    const key = this.screens.get(b.to);
    if (!key) return out;
    /* what a document says of the move is checked again here: only its words for one, and a number */
    const transition = TRANSITIONS.includes(b.transition) ? b.transition : "slide";
    const motion = cleanMotion(b.motion);
    const call = b.overlay === true ? "openOverlay" : "go";
    if (motion) this.printed.motion = true;
    if (call === "openOverlay") this.printed.overlay = true;
    /* a screen opened with params: what each is read now, as the screen reads them */
    const given = this.bound && b.params && Object.keys(b.params).length ? b.params : undefined;
    if (given && call === "go") {
      uses.app.add("navigate");
      this.navigates = true;
      const rest = motion ? [json(transition), printValue(motion)] : transition !== "slide" ? [json(transition)] : [];
      return [...out, `navigate(${[json(key), this.bound!.navParams(given), ...rest].join(", ")})`];
    }
    uses.app.add(call);
    const args = [json(key), ...(motion ? [json(transition), printValue(motion)] : transition !== "slide" ? [json(transition)] : [])];
    return [...out, `${call}(${args.join(", ")})`];
  }

  private bodyStatements(b: ActionBody, uses: Uses): string[] {
    const effects = (Array.isArray(b.effects) ? b.effects : []).map((e) => this.effect(e, uses)).filter((s): s is string => !!s);
    return [...effects, ...this.nav(b, uses)];
  }

  /** what a call's or a form's then or catch runs, in the scope given (`answer.with…`), as statements */
  statementsOf(b: ActionBody, uses: Uses, scope: string): string[] {
    if (!this.bound) return this.bodyStatements(b, uses);
    return this.bound.within(scope, this.bound.form, () => this.bodyStatements(b, uses));
  }

  private statements(a: Action, uses: Uses): string[] {
    /* the screen this opens may read the row the tap came from */
    const picked = (list: string[]) => {
      if (!list.length || !this.rowNow || !this.readsCurrent) return list;
      uses.app.add("pickRow");
      return [`pickRow(${json(this.rowNow)})`, ...list];
    };
    const settled = a.when && this.onRow(a.when, this.rowNow);
    if (settled === false) return a.else ? picked(this.bodyStatements(a.else, uses)) : [];
    const body = picked(this.bodyStatements(a, uses));
    if (!a.when || settled) return body;
    const cond = this.condition(a.when, uses);
    const other = a.else ? picked(this.bodyStatements(a.else, uses)) : [];
    if (!body.length && !other.length) return [];
    if (!body.length) return [`if (!(${cond})) { ${other.join("; ")} }`];
    return [`if (${cond}) { ${body.join("; ")} }${other.length ? ` else { ${other.join("; ")} }` : ""}`];
  }

  private handler(statements: string[]): string | null {
    if (!statements.length) return null;
    return statements.length === 1 && !statements[0].startsWith("if ") ? `() => ${statements[0]}` : `() => { ${statements.join("; ")} }`;
  }

  /* ---------- a part as code ---------- */

  /** a tap moves the part's chosen entry: its bar is state */
  private selecting(it: Item, def: PartDef): boolean {
    if (!def.selectKey || !def.slots || INPUT_PROP[def.slug] !== undefined || it.bind?.[def.selectKey]) return false;
    return this.live || !!Object.keys(it.actions ?? {}).length || !!this.propTargets.get(it.id)?.has(def.selectKey) || [...this.panes.values()].some((p) => p.host.id === it.id);
  }

  private railToggles(it: Item, def: PartDef): boolean {
    const p = reader(def, it.props);
    /* a modal rail also closes by its scrim, with no menu button */
    return def.slug === "navigation-rail" && (p.b("menu") || p.b("modal")) && (this.live || !!Object.keys(it.actions ?? {}).length);
  }

  /** a dialog's open state belongs to the runtime: its button is on another part, or nowhere */
  private heldByState(it: Item, g: Group): boolean {
    const standing = standingOf(partBySlug(it.component));
    if (standing === "stands") return this.live || !!g.hidden || this.openTargets.has(it.id);
    return standing === "menu" && this.openTargets.has(it.id);
  }

  private plan(it: Item, def: PartDef, uses: Uses): { d: PropDef; expr: string; samples?: VarValue[] }[] {
    const out: { d: PropDef; expr: string; samples?: VarValue[] }[] = [];
    const inputKey = INPUT_PROP[def.slug];
    const inputVar = this.inputVar(it);
    const p = reader(def, it.props);
    const fromForm = this.bound ? this.bound.formProps(it, def) : [];
    for (const d of def.props) {
      const design = d.kind === "text" || d.kind === "image" || d.kind === "icon" ? (it.props?.[d.key] ?? undefined) : d.kind === "number" ? p.n(d.key) : d.kind === "bool" ? p.b(d.key) : d.kind === "enum" ? p.s(d.key) : undefined;
      const byExpr = this.bound ? this.bound.prop(it, d, d.kind === "text" ? p.s(d.key) : design) : null;
      if (byExpr !== null && !(d.key === inputKey && this.bound?.form && it.field)) {
        out.push({ d, expr: byExpr.code, ...(byExpr.samples ? { samples: byExpr.samples } : {}) });
        continue;
      }
      const given = fromForm.find((x) => x.key === d.key);
      if (given && (d.kind === "bool" || d.kind === "text")) {
        out.push({ d, expr: given.expr });
        continue;
      }
      if (d.kind !== "text" && d.kind !== "number" && d.kind !== "bool" && d.kind !== "enum") continue;
      if (d.key === inputKey && inputVar) continue;
      const bound = it.bind?.[d.key] ? this.vars.get(it.bind[d.key]) : undefined;
      if (bound && d.kind !== "enum") out.push({ d, expr: this.readVar(bound, d.kind, uses) });
      else if (d.key === def.selectKey && this.selecting(it, def)) {
        const bar = this.barKey(it, def);
        this.usedParts.add(bar);
        uses.app.add("tab");
        /* a bar the author chose nothing on lights the destination that opened its screen */
        const own = it.props?.[d.key];
        out.push({ d, expr: isNavBar(def) && own === undefined ? `tab(${json(bar)}, undefined, ${p.n(d.key)})` : `tab(${json(bar)}, ${p.n(d.key)})` });
      } else if ((d.key === "expanded" && this.railToggles(it, def)) || this.propTargets.get(it.id)?.has(d.key)) {
        const start = d.kind === "text" ? p.s(d.key) : d.kind === "enum" ? p.s(d.key) : d.kind === "number" ? p.n(d.key) : p.b(d.key);
        uses.app.add("prop");
        out.push({ d, expr: `prop(${this.part(it.id)}, ${json(d.key)}, ${json(start)})` });
      }
    }
    return out;
  }

  /** the tree with what is only known at run time as expressions in it */
  private liveTree(it: Item, def: PartDef, uses: Uses, keepTap: boolean): PNode {
    const look = appearanceOf(it);
    /* the row last tapped is only known at run time: its fields go through the tree as words do */
    const fields = new Map<string, string>();
    /* what a form fixes on it (required, as its contract says) is drawn as the design's own */
    const fixed = this.bound ? this.bound.formFixed(it, def) : {};
    const base = markCurrent(withoutPickedImages(def, { ...it.props, ...fixed }, this.image), (field) => {
      fields.set(`current.${field}`, currentField(field));
      uses.app.add("current");
      return markOf(`current.${field}`);
    });
    const plan = this.plan(it, def, uses);
    const words = plan.filter((x) => x.d.kind === "text" || x.d.kind === "image" || x.d.kind === "icon");
    const drawn = plan.filter((x) => x.d.kind !== "text" && x.d.kind !== "image" && x.d.kind !== "icon");
    const values = { ...base, ...Object.fromEntries(words.map((x) => [x.d.key, markOf(x.d.key)])) };
    /* one prop after another, each drawn every way it can be; past a point the rest stay as they are */
    let room = 64;
    const draw = (vals: Record<string, unknown>, rest: typeof drawn): PNode => {
      const [head, ...tail] = rest;
      if (!head) return treeOf(def, vals, look, it.id);
      const samples = head.samples ?? samplesOf(head.d, def, it);
      if (samples.length < 2 || samples.length > room) return draw(vals, tail);
      room = Math.floor(room / samples.length);
      return foldNodes(samples.map((s) => draw({ ...vals, [head.d.key]: s }, tail)), { expr: head.expr, samples, keepTap });
    };
    const tree = draw(values, drawn);
    return words.length || fields.size ? unmarkNode(tree, new Map([...fields, ...words.map((x) => [x.d.key, x.expr] as const)])) : tree;
  }

  /** an input reads its variable and writes back to it */
  private wireInput(tree: PNode, it: Item, def: PartDef, v: VarInfo, uses: Uses): PNode {
    uses.app.add("setVar");
    const set = (code: string) => `setVar(${json(v.key)}, ${code})`;
    const patch = (type: string, drop: string[], props: Record<string, PValue>) =>
      mapNodes(tree, (n) => (n.type === type ? { ...n, props: { ...Object.fromEntries(Object.entries(n.props ?? {}).filter(([k]) => !drop.includes(k))), ...props } } : n));
    switch (def.slug) {
      case "text-field":
      case "input":
      case "textarea": {
        const type = def.slug === "text-field" ? "TextField" : def.slug === "input" ? "Input" : "Textarea";
        return patch(type, ["defaultValue"], { value: raw(this.readVar(v, "text", uses)), onChange: raw(`(event) => ${set(this.toVar(v, "event.target.value", "text"))}`) });
      }
      case "switch":
      case "checkbox":
        return patch(def.slug === "switch" ? "Switch" : "Checkbox", ["defaultChecked"], { checked: raw(this.readVar(v, "bool", uses)), onCheckedChange: raw(`(on) => ${set(this.toVar(v, "on", "bool"))}`) });
      case "slider": {
        const p = reader(def, it.props);
        const read = this.readVar(v, "number", uses);
        return patch("Slider", ["defaultValue"], { value: p.b("range") ? [raw(read), p.n("end")] : [raw(read)], onValueChange: raw(`(value) => ${set(this.toVar(v, "Array.isArray(value) ? value[0] : value", "number"))}`) });
      }
      case "select":
      case "radio-group": {
        const rows = reader(def, it.props).list("items").map((r) => r.label);
        /* a choice is the row's words; a number variable holds its place in the list instead */
        const place = v.type !== "text";
        const words = place ? `${json(rows)}[${this.readVar(v, "number", uses)}]` : this.readVar(v, "text", uses);
        const write = place ? this.toVar(v, `${json(rows)}.indexOf(String(value))`, "number") : `String(value ?? "")`;
        return patch(def.slug === "select" ? "Select" : "RadioGroup", ["defaultValue"], { value: raw(def.slug === "select" ? `${words} || null` : words), onValueChange: raw(`(value) => ${set(write)}`) });
      }
      default: {
        /* a widget that declares an input takes its value as a prop and hands it out through onValueChange
           (parts/widgets/host.ts), whatever the widget is */
        const input = def.input;
        /* the widget itself, inside the frame its field states may draw around it (parts/fieldState.ts) */
        const widget = tree.type === "FieldFrame" ? tree.children?.find((c): c is PNode => typeof c !== "string" && c.type in WIDGET_SOURCES) : tree;
        if (!input || !widget || !(widget.type in WIDGET_SOURCES)) return tree;
        const kind = input.kind === "number" ? "number" : input.kind === "bool" ? "bool" : "text";
        const given = kind === "number" ? "Number(value) || 0" : kind === "bool" ? "!!value" : 'String(value ?? "")';
        const wired = { ...widget, props: { ...widget.props, [input.prop]: raw(this.readVar(v, kind, uses)), onValueChange: raw(`(value) => ${set(this.toVar(v, given, kind))}`) } };
        return widget === tree ? wired : { ...tree, children: tree.children?.map((c) => (c === widget ? wired : c)) };
      }
    }
  }

  /** a part as source: its tree with its state in it, and what wraps it to catch its taps */
  printPart(it: Item, uses: Uses, insideTap: boolean): { tree: PNode; keepTap: boolean; wrap: (source: string) => string } {
    const def = partBySlug(it.component)!;
    const g = this.owner.get(it.id);
    this.rowNow = it.row;
    /* the part's own action starts on a tap, unless it starts when the pointer comes over it or some time after its
       screen came into use; what its slots do is always a tap */
    const own = it.action ? this.handler(this.statements(it.action, uses)) : null;
    const trigger = cleanTrigger(it.action?.trigger);
    const onPress = trigger ? null : own;
    const onHover = trigger?.on === "hover" ? own : null;
    const after = trigger?.on === "delay" && own ? { ms: trigger.ms, run: own } : null;
    if (onHover) this.printed.hover = true;
    if (after) this.printed.delay = true;
    const selecting = this.selecting(it, def);
    const slots: Record<string, PValue> = {};
    let selfSelecting = false;
    if (selecting) {
      const bar = json(this.barKey(it, def));
      for (const { key } of def.slots!(reader(def, it.props))) {
        const m = /^tab:(\d+)$/.exec(key);
        if (!m) continue;
        const a = it.actions?.[key];
        if (!a) {
          selfSelecting = true;
          continue;
        }
        /* a destination that opens a screen leaves the choice to that screen's own bar; one that only runs effects lights up */
        const opens = a.to !== STAY_TARGET;
        const target = opens ? this.screens.get(a.to) : undefined;
        const lead = opens ? `leaveTab(${bar}, ${m[1]}${isNavBar(def) && target ? `, ${json(target)}` : ""})` : `selectTab(${bar}, ${m[1]})`;
        uses.app.add(opens ? "leaveTab" : "selectTab");
        slots[key] = raw(this.handler([lead, ...this.statements(a, uses)])!);
      }
    }
    for (const [slot, a] of Object.entries(it.actions ?? {})) {
      /* an event or a family of places is not printed yet: lib/export/boundary.ts reports it */
      if (!a || slot in slots || !isPlaceKey(slot)) continue;
      const code = this.handler(this.statements(a, uses));
      if (code) slots[slot] = raw(code);
    }
    this.rowNow = undefined;
    if (this.railToggles(it, def)) {
      const start = reader(def, it.props).b("expanded");
      uses.app.add("setProp").add("prop");
      const key = this.part(it.id);
      slots.rail = raw(`() => setProp(${key}, "expanded", !prop(${key}, "expanded", ${start}))`);
    }
    const hasSlots = Object.keys(slots).length > 0;
    const root = treeOf(def, withoutPickedImages(def, it.props ?? {}, this.image), appearanceOf(it), it.id);
    /* an overlay that only shows and hides has nothing of its own to shut it: its close button says so here */
    const closes = !!g && isOverlayPart(it) && standingOf(def) === "plain" && this.gatedByVisible(g);
    const direct = !!onPress && !hasSlots && !selfSelecting && !closes && !insideTap && CLICKS_ON_ROOT.has(root.type) && !root.props?.onClick;
    const pressable = !direct && (!!onPress || !!onHover || !!after || hasSlots || selfSelecting || closes);
    let tree = this.liveTree(it, def, uses, pressable);
    /* A prototype acts out a domain demo where nothing takes it over; a product (printed with bindings) never does,
       which is the widgets' own default (parts/widgets/host.ts) */
    if (!this.bound && demoRuns(it, "prototype") && tree.type in WIDGET_SOURCES) tree = { ...tree, props: { ...tree.props, demo: true } };
    /* a part an action scrolls to is marked, so the runtime finds it on the screen in use */
    if (this.scrollTargets.has(it.id)) {
      const key = this.partKeys.get(it.id)!;
      this.usedParts.add(key);
      tree = { ...tree, props: { ...tree.props, "data-part": key } };
    }
    const inputVar = this.inputVar(it);
    if (inputVar) tree = this.wireInput(tree, it, def, inputVar, uses);
    const field = this.bound?.wireField(tree, it, def);
    if (field) tree = field.tree;
    if (g && this.heldByState(it, g)) {
      const key = this.part(it.id);
      uses.app.add("isOpen").add("open").add("close");
      const stands = standingOf(def) === "stands";
      let held = false;
      tree = mapNodes(tree, (n) => {
        if (held || !OVERLAY_ROOTS.has(n.type)) return n;
        held = true;
        return {
          ...n,
          props: { ...n.props, open: raw(`isOpen(${key})`), onOpenChange: raw(`(next) => (next ? open(${key}) : close(${key}))`) },
          children: stands ? n.children?.filter((c) => typeof c === "string" || !c.type.endsWith("Trigger")) : n.children,
        };
      });
    }
    if (direct) tree = { ...tree, props: { ...tree.props, onClick: raw(onPress!) } };
    const fieldWrap = field?.wrap ?? ((source: string) => source);
    if (!pressable) return { tree, keepTap: false, wrap: fieldWrap };
    uses.press = true;
    const attrs = [
      onPress ? `onPress={${onPress}}` : "",
      onHover ? `onHover={${onHover}}` : "",
      after ? `after={${after.ms}} onAfter={${after.run}}` : "",
      hasSlots ? `slots={${printValue(slots)}}` : "",
      selecting && selfSelecting ? `onTab={(index) => ${(uses.app.add("selectTab"), `selectTab(${json(this.barKey(it, def))}, index)`)}}` : "",
      closes ? `onClose={() => ${(uses.app.add("hide"), `hide(${this.part(g!.items[0].id)})`)}}` : "",
    ].filter(Boolean);
    return { tree, keepTap: true, wrap: (source) => `<Pressable ${attrs.join(" ")}>${fieldWrap(source)}</Pressable>` };
  }

  /* ---------- what a part shows under ---------- */

  private gatedByVisible(g: Group): boolean {
    if (this.visTargets.has(g.id)) return true;
    if (!g.hidden) return false;
    /* a dialog that starts hidden is one that is not open yet */
    return !(g.items.length === 1 && standingOf(partBySlug(g.items[0].component)) === "stands");
  }

  private ownGates(g: Group, uses: Uses): string[] {
    const out: string[] = [];
    if (this.gatedByVisible(g)) {
      uses.app.add("visible");
      out.push(`visible(${this.part(g.items[0].id)})`);
    }
    if (g.showWhen) {
      const holds = this.condition(g.showWhen, uses, g.items[0]?.row);
      /* settled for this row: nothing left to ask */
      if (holds !== "true") out.push(holds);
    }
    const region = this.bound?.regionGate(g, g.inFlow ? this.groupById.get(g.inFlow) : undefined);
    if (region) out.push(region);
    const pane = this.panes.get(g.id);
    const def = pane && partBySlug(pane.host.component);
    if (pane && def?.selectKey) {
      const bar = this.barKey(pane.host, def);
      this.usedParts.add(bar);
      uses.app.add("tab");
      out.push(`tab(${json(bar)}, ${reader(def, pane.host.props).n(def.selectKey)}) === ${pane.pane}`);
    }
    return out;
  }

  /** the conditions a run shows under, leaving out those of what it is printed inside */
  gates(run: Group, inside: Set<string>, uses: Uses): string[] {
    const g = this.owner.get(run.items[0]?.id ?? "") ?? run;
    const out: string[] = [];
    for (const h of this.holders.get(g.id) ?? []) if (!inside.has(h.id)) out.push(...this.ownGates(h, uses));
    out.push(...this.ownGates(g, uses));
    return [...new Set(out)];
  }

  /** what an effect brings up stands over the parts around it */
  floats(run: Group): boolean {
    const g = this.owner.get(run.items[0]?.id ?? "") ?? run;
    return this.visTargets.has(g.id) && g.items.some((it) => partBySlug(it.component)?.category === "Overlays");
  }

  screenKey(id: string): string | undefined {
    return this.screens.get(id);
  }
}
