import { appearanceOf } from "../parts/appearance";
import { isNode, isRaw, isWrap, mapNodes, raw, type PNode, type PValue } from "../parts/node";
import { EXPR_NODE, namesIn, printValue, str } from "../parts/print";
import { OVERLAY_ROOTS, partBySlug, reader, treeOf, withoutPickedImages } from "../parts/registry";
import type { PartDef, PropDef } from "../parts/types";
import { WIDGET_SOURCES } from "../parts/widgets/sources";
import { type Row, fillCurrent, firstRows, markCurrent } from "./collections";
import { INPUT_PROP, coerce, isOverlayPart } from "./interact";
import { demoRuns, familiesOf, isPlaceKey, optionsOf } from "./partContract";
import { collectionIdOf, collectionsOf, cssNameOf, isBindField, modeFor, valueIn, varValues } from "./variables";
import { cleanMotion, cleanTrigger, flowStarts } from "./prototype";
import type { BoundPrint } from "./printBindings";
import { BACK_TARGET, LINK_TARGET, STAY_TARGET, actionSlotsOf, presetOf, actionsOf, darkVarOf, heldBy, holdsParts, linkUrlOf, type Action, type ActionBody, type Condition, type Doc, type Effect, type Frame, type Group, type Item, type VarType, type VarValue } from "./tokens";
import { WORLD_EFFECTS, eventKey, familyKey, type Answer } from "./actions/model";
import { evaluate, parseExpr, rootsOf, truthy } from "./bindings/expr";
import { boundVar, comparisonOf, fieldVarOf, type Comparison } from "./bindings/bind";
import { inlineReads } from "./refs";
import { FRAME_LIMITS } from "./bindings/frame";
import type { FrameSpec } from "./app/frame";
import { framesOfItem } from "./world/frameTargets";
import { literal } from "./export/code";
import { screenToken, screenWords } from "./export/ir/names";

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
  /** the taps are printed as data the runtime runs with lib/actions: what it needs to know of the app for them */
  acts?: ActsSpec;
  /** a part hands its Pressable a family's action as a function of the entry (`families`), for the entries the design's
   *  props do not hold */
  families?: true;
  /** the screens draw world views, which the taps' input actions reach on a channel each (lib/world) */
  worlds?: true;
  /** a part is bound per frame (lib/bindings/frame.ts): the runtime runs the frame loop its screens hand them to */
  frames?: true;
};

/** What the runtime runs the taps over (lib/actions' `Host`, src/runtime.tsx): where each part an effect reaches stands,
 *  the bars whose chosen destination a tap moves, what of an API a prototype's taps ask for (reported, since a
 *  prototype has none), and the mocks a prototype answers the capabilities it invokes with. */
export type ActsSpec = {
  parts: Record<string, { shows?: string; overlay?: "stands" | "menu" }>;
  tabs: Record<string, string>;
  unreached?: string[];
  mocks?: { rules?: Record<string, unknown>; spec?: unknown; locale?: string };
};

/** What the product web app's runtime keeps for the bindings: the params each screen takes, the screens that need a
 *  session, the sign-in screen, and the runtime package's name. */
export type BoundSpec = {
  runtime: string;
  params: Record<string, { name: string; type?: string; example?: unknown }[]>;
  auth: string[];
  signIn?: string;
  /** the operation that signs in: once it answers, the app goes back where it was sent to sign in from */
  login?: string;
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

/** a condition that never holds */
const NEVER: Condition = { expr: "false" };

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
    /* where only its truth counts (a test, a negation), `!!x` is `x`: ESLint calls the other redundant */
    const test = /^!![\w$.]+(?:\((?:[^()]|\([^()]*\))*\))?$/.test(expr) ? expr.slice(2) : expr;
    if (on === true && off === undefined) return `${expr} || undefined`;
    if (on === true && off === false) return expr;
    if (off === true && on === undefined) return `!${test} || undefined`;
    if (off === true && on === false) return `!${test}`;
    return `${test} ? ${lit(on)} : ${lit(off)}`;
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
  /** a part's family of places has been printed with its action as a function of the entry (`families`) */
  private printedFamilies = false;
  /** a world view has been printed with its channel */
  private printedWorlds = false;
  /** the bindings per frame of the screen being printed, each by the key its part is marked with; and of any screen */
  private screenFrames: (FrameSpec & { slug: string })[] = [];
  private printedFrames = false;
  /** the bindings, printed against the product's runtime */
  readonly bound?: BoundPrint;
  private readonly groupById: Map<string, Group>;
  /** an expression has been printed: the runtime reads them */
  private readsExprs = false;
  /** where each part an effect shows, hides, opens or closes stands, by its key: the run it shows with (the first part
   *  of its group) when that is another, and how it stands when it is an overlay */
  private readonly reach = new Map<string, { shows?: string; overlay?: "stands" | "menu" }>();
  /** the bars whose chosen destination a tap sets, with the prop it sets */
  private readonly tabProps = new Map<string, string>();
  /** what a tap of the prototype asks of an API it does not have: reported, never dropped */
  private readonly unreached = new Set<string>();
  /** the capabilities the taps invoke */
  private readonly invokes = new Set<string>();
  /** a tap has been printed as data: the runtime runs it */
  private acts = false;
  /** the screen being printed: its table of actions, the keys taken in it, its name */
  private screenActs = new Map<string, Action>();
  private actKeys = new Set<string>();
  private screenTapped = false;
  /** the key each action printed on the screen has in its table, by what it was printed for */
  private actNamed = new Map<string, string | null>();
  private actsName = "screenActions";
  /** the key of the part being printed: what its taps say they were made on */
  private partNow = "part";

  constructor(doc: Doc, widths: Record<string, number>, o: Options) {
    this.doc = doc;
    this.live = o.live;
    this.image = o.image;
    this.readsCurrent = JSON.stringify(doc.groups).includes("{{current.");
    this.shown = o.shown;
    this.bound = o.binds;
    this.groupById = new Map(doc.groups.map((g) => [g.id, g]));
    const screenKeys = new Set<string>();
    /* a screen's key (its address, lib/export/targets/webSources.ts) is its words, else the English the templates give
       them, else its id's (lib/export/ir/names.ts), as on the phone and in the mini-program */
    for (const f of o.shown) this.screens.set(f.id, camel(screenWords(f), `screen${screenToken(f)}`, screenKeys));
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
        for (const [field, bind] of Object.entries(it.bind ?? {})) {
          const id = isBindField(field) ? fieldVarOf(bind) : undefined;
          const v = id !== undefined && !this.boundNames.has(id) ? doc.vars?.find((x) => x.id === id) : undefined;
          if (!v) continue;
          const base = cssNameOf(v);
          let name = base;
          for (let i = 2; cssNames.has(name); i++) name = `${base.slice(0, 36)}-${i}`;
          cssNames.add(name);
          this.boundNames.set(v.id, name);
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
      /* an input action goes to a world view's channel: it shows, hides and sets nothing */
      if (WORLD_EFFECTS.has(e.do)) continue;
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
      ...(this.readsExprs || this.bound || this.acts ? { exprs: { vars: this.varNames() } } : {}),
      ...(this.bound ? { bound: this.boundSpec() } : {}),
      ...(this.acts ? { acts: this.actsSpec() } : {}),
      ...(this.printedFamilies ? { families: true as const } : {}),
      ...(this.printedWorlds || this.printedFrames ? { worlds: true as const } : {}),
      ...(this.printedFrames ? { frames: true as const } : {}),
    };
  }

  /** what the runtime runs the taps over */
  private actsSpec(): ActsSpec {
    const mocks = this.doc.mocks;
    return {
      parts: Object.fromEntries(this.reach),
      tabs: Object.fromEntries(this.tabProps),
      ...(this.unreached.size ? { unreached: [...this.unreached] } : {}),
      /* a prototype answers what it invokes as the editor's preview does: with the mocks */
      ...(!this.bound && this.invokes.size ? { mocks: { ...(mocks?.capabilities ? { rules: mocks.capabilities } : {}), ...(this.doc.capabilities ? { spec: this.doc.capabilities } : {}), ...(mocks?.locale ? { locale: mocks.locale } : {}) } } : {}),
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
    const login = this.bound!.o.api.auth?.login;
    return { runtime: this.bound!.o.runtime, params, auth, ...(signIn ? { signIn } : {}), ...(login ? { login } : {}) };
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
    /* an input bound to a plain read of a variable reads and writes that variable */
    const boundId = boundVar(it, key, this.doc.vars);
    const bound = boundId ? this.vars.get(boundId) : undefined;
    if (bound) return bound;
    if (this.inputs.has(it.id)) return this.inputs.get(it.id)!;
    if (!this.live && !this.filled.has(it.id) && !this.propTargets.get(it.id)?.has(key)) return null;
    const p = reader(def, it.props);
    const d = def.props.find((x) => x.key === key);
    const name = this.partKeys.get(it.id);
    let info: VarInfo;
    if (def.input?.kind === "choice" && d?.kind === "number") {
      const options = optionsOf(it);
      info = { key: camel(name, "field", this.varKeys), type: "text", start: options[Math.min(p.n(key), options.length - 1)] ?? "" };
    } else if (d?.kind === "list") info = { key: camel(name, "field", this.varKeys), type: "text", start: p.list(key).map((r) => r.label).join("\n") };
    else if (d?.kind === "bool") info = { key: camel(name, "field", this.varKeys), type: "bool", start: p.b(key) };
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

  /** A condition's expression with the fields of the row its part was drawn for written in: the row is known here,
   *  where the printed app has no rows to read (lib/refs.ts `inlineReads`). */
  private rowRead(expr: string, row: Row | undefined): string {
    return row && /\brow\b/.test(expr) ? inlineReads(expr, "row", row) : expr;
  }

  /** a condition on the fields of the row a part was drawn for, and nothing else, is settled here, row by row */
  private onRow(c: Condition, row: Row | undefined): boolean | undefined {
    if (!("expr" in c) || typeof c.expr !== "string" || !row || !/\brow\b/.test(c.expr)) return undefined;
    const p = parseExpr(this.rowRead(c.expr, row));
    return p.ok && !rootsOf(p.expr).length ? truthy(evaluate(p, {})) : undefined;
  }

  condition(c: Condition, uses: Uses, row: Row | undefined = this.rowNow): string {
    const known = this.onRow(c, row);
    if (known !== undefined) return String(known);
    if ("expr" in c) {
      if (typeof c.expr !== "string") return "false";
      const expr = this.rowRead(c.expr, row);
      /* a variable compared with a value is read off the app's state as it always was */
      const cmp = comparisonOf(expr, this.doc.vars ?? []);
      if (cmp && !cmp.var.startsWith("row.")) return this.comparison(cmp, uses);
      /* any other expression: the product reads it in the part's scope; the prototype's runtime reads what it can of it */
      if (this.bound) return this.bound.holds(expr);
      this.readsExprs = true;
      uses.app.add("holds");
      return `holds(${json(expr)})`;
    }
    if ("filled" in c) {
      const it = this.owner.get(c.filled)?.items.find((x) => x.id === c.filled);
      const v = it && this.inputVar(it);
      if (!v) return "false";
      uses.app.add("vars").add("hasValue");
      return `hasValue(vars.${v.key})`;
    }
    return "false";
  }

  /** a variable compared with a value of its type (lib/bindings/bind.ts `comparisonOf`), as code over the app's state */
  private comparison(c: Comparison, uses: Uses): string {
    const v = this.vars.get(c.var);
    const neq = c.op === "neq";
    if (!v) return "false";
    uses.app.add("vars");
    if (v.type === "bool") return c.value === !neq ? `vars.${v.key}` : `!vars.${v.key}`;
    return `vars.${v.key} ${neq ? "!==" : "==="} ${json(c.value)}`;
  }

  /* ---------- what a tap does, as data ---------- */

  /* A tap is printed as the data it is (lib/actions/model.ts): the interpreter the editor's preview and every other host
     run (lib/actions/run.ts) runs it in the app, over the runtime's state (src/runtime.tsx). The printer only puts the
     app's names in it (a screen's key for its id, a part's, a variable's) and settles what is known here: a condition on
     the row a part was drawn for, the words that read that row, what a part a tap shows or opens is. */

  /** a condition in the app's names; one that can never hold reads `false` */
  private conditionData(c: Condition): Condition {
    if ("expr" in c) return typeof c.expr === "string" ? { expr: this.rowRead(c.expr, this.rowNow) } : NEVER;
    if ("filled" in c) {
      const it = this.owner.get(c.filled)?.items.find((x) => x.id === c.filled);
      if (!it) return NEVER;
      /* a field of a form is read off the form that keeps it (lib/printBindings.ts) */
      const field = this.bound?.filledField(this.owner.get(c.filled)!.id, it, this.partKeys.get(it.id)!);
      if (field) return { filled: field };
      const v = this.inputVar(it);
      return v ? { filled: v.key } : NEVER;
    }
    return NEVER;
  }

  /** an effect in the app's names; null for one that does nothing here */
  private effectData(e: Effect, uses: Uses): Effect | null {
    if (!e || typeof e !== "object") return null;
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
        const key = this.partKeys.get(it.id)!;
        this.part(it.id);
        /* a dialog stands only while open; a menu keeps its trigger, and only its popup opens; anything else shows and
           hides with its run (the first part of its group) */
        const shows = this.partKeys.get(g.items[0].id)!;
        this.part(g.items[0].id);
        const where = { ...(standing !== "plain" ? { overlay: standing } : {}), ...(shows !== key ? { shows } : {}) };
        if (Object.keys(where).length) this.reach.set(key, where);
        return { do: e.do, part: key };
      }
      case "setVar": {
        const v = this.vars.get(e.var);
        return v ? { do: "setVar", var: v.key, value: e.value, ...(typeof e.expr === "string" ? { expr: e.expr } : {}) } : null;
      }
      case "toggleVar":
      case "addVar": {
        const v = this.vars.get(e.var);
        if (!v) return null;
        return e.do === "toggleVar" ? { do: "toggleVar", var: v.key } : { do: "addVar", var: v.key, by: e.by };
      }
      case "setProp":
        return this.setPropData(e);
      case "snackbar":
        return typeof e.message === "string" ? { do: "snackbar", message: e.message } : null;
      case "call": {
        if (typeof e.operationId !== "string" || !e.operationId) return null;
        if (this.bound && !this.bound.callable(e.operationId, e.args)) return null;
        if (!this.bound) this.unreached.add(`call:${e.operationId}`);
        const then = e.then && this.answerData(e.then, uses);
        const fail = e.catch && this.answerData(e.catch, uses);
        const o = e.optimistic && (!this.bound || this.bound.sourceVar(e.optimistic.source)) ? e.optimistic : undefined;
        // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
        return { do: "call", operationId: e.operationId, ...(e.args ? { args: e.args } : {}), ...(typeof e.body === "string" ? { body: e.body } : {}), ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}), ...(o ? { optimistic: o } : {}) };
      }
      case "invoke": {
        if (typeof e.capability !== "string" || !e.capability) return null;
        this.invokes.add(e.capability);
        const then = e.then && this.answerData(e.then, uses);
        const fail = e.catch && this.answerData(e.catch, uses);
        // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
        return { do: "invoke", capability: e.capability, ...(e.args ? { args: e.args } : {}), ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}) };
      }
      case "refresh":
      case "loadMore":
        if (this.bound) return this.bound.sourceVar(e.source) ? { do: e.do, source: e.source } : null;
        this.unreached.add(`${e.do}:${e.source}`);
        return { do: e.do, source: e.source };
      case "submit": {
        if (!this.bound) {
          this.unreached.add("submit");
          return { do: "submit" };
        }
        const form = this.bound.formKey(e.form);
        return form ? { do: "submit", form } : null;
      }
      case "signOut":
        if (!this.bound) this.unreached.add("signOut");
        return { do: "signOut" };
      case "move":
      case "press":
      case "release": {
        /* the world view by its key, whose channel the runtime keeps */
        const it = this.owner.get(e.part)?.items.find((x) => x.id === e.part);
        if (!it || !partBySlug(it.component)?.world) return null;
        this.part(it.id);
        return { ...e, part: this.partKeys.get(it.id)! };
      }
      default:
        /* a kind this version does not know, from a file saved by a later one */
        return null;
    }
  }

  private setPropData(e: Extract<Effect, { do: "setProp" }>): Effect | null {
    const it = this.owner.get(e.part)?.items.find((x) => x.id === e.part);
    const def = partBySlug(it?.component);
    const d = def?.props.find((x) => x.key === e.prop);
    if (!it || !def || !d) return null;
    /* an input's value is its variable */
    if (INPUT_PROP[def.slug] === e.prop) {
      const v = this.inputVar(it);
      if (!v) return null;
      const choice = def.input?.kind === "choice" && d.kind === "number";
      const value = choice && v.type === "text" ? (optionsOf(it)[Number(e.value)] ?? "") : coerce(e.value, v.type);
      return value === null ? null : { do: "setVar", var: v.key, value };
    }
    /* a bar's chosen destination is the runtime's */
    if (e.prop === def.selectKey && this.selecting(it, def)) {
      const bar = this.barKey(it, def);
      this.usedParts.add(bar);
      this.tabProps.set(bar, e.prop);
      return { do: "setProp", part: bar, prop: e.prop, value: Number(e.value) || 0 };
    }
    const value = d.kind === "number" ? Number(e.value) || 0 : d.kind === "bool" ? (coerce(e.value, "bool") as boolean) : String(e.value);
    return { do: "setProp", part: this.partKeys.get(it.id)!, prop: e.prop, value };
  }

  /** where a body goes, in the app's names: a screen it has (or nowhere), back, out to a page, a part scrolled to */
  private bodyData(b: ActionBody, uses: Uses): ActionBody {
    const effects = (Array.isArray(b.effects) ? b.effects : []).map((e) => this.effectData(e, uses)).filter((e): e is Effect => !!e);
    const out: ActionBody = { to: STAY_TARGET };
    if (b.to === BACK_TARGET) {
      out.to = BACK_TARGET;
      /* a back action's own motion is played backwards in place of the way the screen came in (Host.back) */
      const motion = cleanMotion(b.motion);
      if (motion) {
        this.printed.motion = true;
        out.motion = motion;
      }
    } else if (b.to === LINK_TARGET) {
      /* an address read off the row last tapped can only be known at run time; the interpreter opens only a web page */
      const url = b.url?.includes("{{current.") ? b.url.trim() : linkUrlOf(b);
      if (url) Object.assign(out, { to: LINK_TARGET, url });
    } else {
      if (typeof b.scrollTo === "string" && this.scrollTargets.has(b.scrollTo)) {
        this.printed.scroll = true;
        out.scrollTo = this.partKeys.get(b.scrollTo)!;
        this.part(b.scrollTo);
      }
      const key = b.to === STAY_TARGET ? undefined : this.screens.get(b.to);
      if (key) {
        out.to = key;
        /* the default slide is no motion: the runtime plays it for none (lib/screenMotion.ts DEFAULT_MOTION) */
        const motion = cleanMotion(b.motion);
        if (motion && presetOf(motion) !== "slide") {
          this.printed.motion = true;
          out.motion = motion;
        }
        if (b.overlay === true) {
          this.printed.overlay = true;
          out.overlay = true;
        }
        /* a screen opened with params: what each is read after the effects, as the screen reads them (only the
           product's screens take params) */
        if (this.bound && b.params && Object.keys(b.params).length && b.overlay !== true) out.params = { ...b.params };
      }
    }
    if (effects.length) out.effects = effects;
    return out;
  }

  /** a call's or an invoke's then or catch, with the branch the answer picks */
  private answerData(a: Answer, uses: Uses): Answer {
    const body: Answer = this.bodyData(a, uses);
    if (!a.when) return body;
    return { ...body, when: this.conditionData(a.when), ...(a.else ? { else: this.bodyData(a.else, uses) } : {}) };
  }

  /** An action as the data the interpreter runs, or null when it does nothing: a condition on the row the part was
   *  drawn for is settled here, and so are the words that read that row. */
  private actionData(a: Action, uses: Uses): Action | null {
    const settled = a.when && this.onRow(a.when, this.rowNow);
    const chosen: ActionBody | undefined = settled === false ? a.else : a;
    if (!chosen) return null;
    const src = this.rowNow ? fillCurrent(chosen, this.rowNow) : chosen;
    const body = this.bodyData(src, uses);
    const out: Action = !a.when || settled !== undefined ? body : { ...body, when: this.conditionData(a.when), ...(a.else ? { else: this.bodyData(this.rowNow ? fillCurrent(a.else, this.rowNow) : a.else, uses) } : {}) };
    const idle = (x: ActionBody | undefined) => !x || (x.to === STAY_TARGET && !x.effects?.length && !x.scrollTo);
    return idle(out) && idle(out.else) ? null : out;
  }

  /** what a tap runs, as statements: the row it was made on picked first (the screen it opens may read it), then the
   *  action run by the interpreter (`act`, src/runtime.tsx `useActions`) */
  private statements(a: Action, uses: Uses, name: string, more: string[] = []): string[] {
    /* one action reached from several places (a family's, for each of its entries) is in the table once */
    let key = this.actNamed.get(name);
    if (key === undefined) {
      const data = this.actionData(a, uses);
      key = data ? this.actKey(name) : null;
      if (key && data) this.screenActs.set(key, data);
      this.actNamed.set(name, key);
    }
    if (!key) return [];
    this.screenTapped = true;
    const at = this.bound?.tapAt() ?? [];
    const run = `act(${this.actsName}.${key}, { ${[`part: ${json(this.partNow)}`, ...at, ...more].join(", ")} })`;
    if (!this.rowNow || !this.readsCurrent) return [run];
    uses.app.add("pickRow");
    return [`pickRow(${json(this.rowNow)})`, run];
  }

  /** What runs on a message of a subscription of the screen being printed, as a statement: the action put in the
   *  screen's table and run by the interpreter with the message as `event` (no part made it). */
  messageRun(a: Action, uses: Uses, name: string): string | undefined {
    const data = this.actionData(a, uses);
    if (!data) return undefined;
    const key = this.actKey(name);
    this.screenActs.set(key, data);
    this.screenTapped = true;
    return `act(${this.actsName}.${key}, { event })`;
  }

  /** a key of the screen's table of actions */
  private actKey(name: string): string {
    return camel(name, "tap", this.actKeys);
  }

  /** what a form's then or catch runs, put in the screen's table: its name there */
  answerOf(a: Answer, uses: Uses, name: string): string {
    const key = this.actKey(name);
    this.screenActs.set(key, this.answerData(a, uses));
    return `${this.actsName}.${key}`;
  }

  /** Starts a screen: its table of actions is its own. */
  beginScreen(component: string) {
    this.screenFrames = [];
    this.screenActs = new Map();
    this.actNamed = new Map();
    this.screenTapped = false;
    this.actKeys = new Set();
    this.actsName = `${component[0].toLowerCase()}${component.slice(1)}Actions`;
  }

  /** The screen's bindings per frame as code, once its parts are printed: the table the screen hands the runtime's frame
   *  loop (src/runtime.tsx `useFrames`), which writes each value into the element its part is marked with
   *  (`data-part`) on every frame, never through a render. Undefined with none. */
  screenFramesCode(component: string): { name: string; code: string } | undefined {
    if (!this.screenFrames.length) return undefined;
    const name = `${component[0].toLowerCase()}${component.slice(1)}Frames`;
    const rows = this.screenFrames.slice(0, FRAME_LIMITS.perScreen).map((f) => `  ${literal(f)},`);
    return { name, code: `/** what this screen shows of the world on every frame (lib/bindings/frame.ts): src/runtime.tsx writes each into its part */
const ${name} = [
${rows.join("\n")}
] satisfies ScreenFrame[]` };
  }

  /** whether the screen being printed has actions to run (a form's then or catch among them), and taps that run them */
  hasScreenActions(): { any: boolean; tapped: boolean } {
    return { any: this.screenActs.size > 0, tapped: this.screenTapped };
  }

  /** the screen's table of actions as code, once its parts (and its forms) are printed; undefined with none */
  screenActions(): string | undefined {
    if (!this.screenActs.size) return undefined;
    this.acts = true;
    const rows = [...this.screenActs].map(([k, a]) => `  ${k}: ${literal(a)},`);
    return `/** what the taps on this screen do, as data: src/runtime.tsx runs each with the editor's own interpreter (lib/actions) */\nconst ${this.actsName} = {\n${rows.join("\n")}\n} satisfies Record<string, Action>`;
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
      const boundId = boundVar(it, d.key, this.doc.vars);
      const bound = boundId ? this.vars.get(boundId) : undefined;
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
        const inFrame = (wired: PNode): PNode => (widget === tree ? wired : { ...tree, children: tree.children?.map((c) => (c === widget ? wired : c)) });
        const d = def.props.find((x) => x.key === input.prop);
        /* a choice is its place among the options, which a text variable holds as their words */
        if (input.kind === "choice" && d?.kind === "number") {
          const options = json(optionsOf(it));
          const read = v.type === "text" ? `${options}.indexOf(${this.readVar(v, "text", uses)})` : this.readVar(v, "number", uses);
          const write = v.type === "text" ? `${options}[Number(value)] ?? ""` : this.toVar(v, "Number(value)", "number");
          return inFrame({ ...widget, props: { ...widget.props, [input.prop]: raw(read), onValueChange: raw(`(value) => ${set(write)}`) } });
        }
        /* a list's rows are its words, a line each */
        if (d?.kind === "list") {
          const read = `${this.readVar(v, "text", uses)}.split("\\n").filter(Boolean)`;
          const write = 'Array.isArray(value) ? value.join("\\n") : String(value ?? "")';
          return inFrame({ ...widget, props: { ...widget.props, [input.prop]: raw(read), onValueChange: raw(`(value) => ${set(this.toVar(v, write, "text"))}`) } });
        }
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
    this.partNow = this.partKeys.get(it.id) ?? "part";
    const own = it.action ? this.handler(this.statements(it.action, uses, this.partNow)) : null;
    const trigger = cleanTrigger(it.action?.trigger);
    const onPress = trigger ? null : own;
    const onHover = trigger?.on === "hover" ? own : null;
    const after = trigger?.on === "delay" && own ? { ms: trigger.ms, run: own } : null;
    if (onHover) this.printed.hover = true;
    if (after) this.printed.delay = true;
    const selecting = this.selecting(it, def);
    const slots: Record<string, PValue> = {};
    let selfSelecting = false;
    /* A family's action (`tab:*`) runs for each of its entries that has none of its own, reading the entry as `slot`
       (docs/交互规则.md, 事件与槽位族) */
    const places = def.slots ? def.slots(reader(def, it.props)).map((x) => x.key) : [];
    const ofFamily = (key: string): { a: Action; more: string[]; name: string } | undefined => {
      const m = /^(.+):(\d+)$/.exec(key);
      const a = m && !it.actions?.[key] ? it.actions?.[familyKey(m[1])] : undefined;
      return a && m ? { a, more: [`slot: { key: ${json(key)}, index: ${m[2]} }`], name: `${this.partNow} ${m[1]} each` } : undefined;
    };
    if (selecting) {
      const bar = json(this.barKey(it, def));
      for (const key of places) {
        const m = /^tab:(\d+)$/.exec(key);
        if (!m) continue;
        const family = ofFamily(key);
        const a = it.actions?.[key] ?? family?.a;
        if (!a) {
          selfSelecting = true;
          continue;
        }
        /* a destination that opens a screen leaves the choice to that screen's own bar; one that only runs effects lights up */
        const opens = a.to !== STAY_TARGET;
        const target = opens ? this.screens.get(a.to) : undefined;
        const lead = opens ? `leaveTab(${bar}, ${m[1]}${isNavBar(def) && target ? `, ${json(target)}` : ""})` : `selectTab(${bar}, ${m[1]})`;
        uses.app.add(opens ? "leaveTab" : "selectTab");
        slots[key] = raw(this.handler([lead, ...(family ? this.statements(family.a, uses, family.name, family.more) : this.statements(a, uses, `${this.partNow} ${key}`))])!);
      }
    }
    for (const [slot, a] of Object.entries(it.actions ?? {})) {
      if (!a || slot in slots || !isPlaceKey(slot)) continue;
      const code = this.handler(this.statements(a, uses, `${this.partNow} ${slot}`));
      if (code) slots[slot] = raw(code);
    }
    for (const key of places) {
      const family = key in slots ? undefined : ofFamily(key);
      const code = family && this.handler(this.statements(family.a, uses, family.name, family.more));
      if (code) slots[key] = raw(code);
    }
    /* The entries above are the ones the design's props hold; an entry bound data or a tap adds at run time has no
       handler of its own there, so the family's action is also handed over as a function of the entry (`families`),
       which the Pressable runs for any entry of the family it has no handler for, told which (`slot`) */
    const families: string[] = [];
    for (const f of familiesOf(it)) {
      const a = it.actions?.[familyKey(f.prefix)];
      if (!a) continue;
      const run = this.statements(a, uses, `${this.partNow} ${f.prefix} each`, ["slot"]);
      if (!run.length) continue;
      const lead: string[] = [];
      if (selecting && f.prefix === "tab") {
        /* as for an entry the props hold: a destination that opens a screen leaves the choice to that screen's bar */
        const bar = json(this.barKey(it, def));
        const opens = a.to !== STAY_TARGET;
        const target = opens ? this.screens.get(a.to) : undefined;
        lead.push(opens ? `leaveTab(${bar}, slot.index${isNavBar(def) && target ? `, ${json(target)}` : ""})` : `selectTab(${bar}, slot.index)`);
        uses.app.add(opens ? "leaveTab" : "selectTab");
      }
      const all = [...lead, ...run];
      families.push(`${json(f.prefix)}: (slot) => ${all.length === 1 && !all[0].startsWith("if ") ? all[0] : `{ ${all.join("; ")} }`}`);
    }
    if (families.length) this.printedFamilies = true;
    /* A named event the part sends (`on:<name>`) runs its action with what the event carries, as the part declares it
       (`event.*`): a widget hands its events out through \`onEvent\` (parts/widgets/host.ts) */
    const events = (def.events ?? []).flatMap((e) => {
      const a = it.actions?.[eventKey(e.name)];
      const run = a ? this.statements(a, uses, `${this.partNow} on ${e.name}`, [`event: payload`, `declared: ${literal(e.payload ?? {})}`]) : [];
      return run.length ? [`if (name === ${json(e.name)}) { ${run.join("; ")} }`] : [];
    });
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
    const direct = !!onPress && !hasSlots && !families.length && !selfSelecting && !closes && !insideTap && CLICKS_ON_ROOT.has(root.type) && !root.props?.onClick;
    const pressable = !direct && (!!onPress || !!onHover || !!after || hasSlots || families.length > 0 || selfSelecting || closes);
    let tree = this.liveTree(it, def, uses, pressable);
    /* A prototype acts out a domain demo where nothing takes it over; a product (printed with bindings) never does,
       which is the widgets' own default (parts/widgets/host.ts) */
    if (!this.bound && demoRuns(it, "prototype") && tree.type in WIDGET_SOURCES) tree = { ...tree, props: { ...tree.props, demo: true } };
    /* a control of the widget's own (a heart) keeps a press to itself unless told something is wired to it */
    const wired = tree.type in WIDGET_SOURCES ? (def.slots?.(reader(def, it.props)) ?? []).filter((s) => s.own && slots[s.key]).map((s) => s.key) : [];
    if (wired.length) tree = { ...tree, props: { ...tree.props, wired } };
    /* a part an action scrolls to is marked, so the runtime finds it on the screen in use */
    if (this.scrollTargets.has(it.id)) {
      const key = this.partKeys.get(it.id)!;
      this.usedParts.add(key);
      tree = { ...tree, props: { ...tree.props, "data-part": key } };
    }
    if (events.length) {
      const widget = tree.type === "FieldFrame" ? tree.children?.find((c): c is PNode => typeof c !== "string" && c.type in WIDGET_SOURCES) : tree;
      if (widget && widget.type in WIDGET_SOURCES) {
        const wired = { ...widget, props: { ...widget.props, onEvent: raw(`(name, payload) => { ${events.join(" else ")} }`) } };
        tree = widget === tree ? wired : { ...tree, children: tree.children?.map((c) => (c === widget ? wired : c)) };
      }
    }
    /* a prop bound per frame is written into the part's element by the runtime's frame loop: the element is marked */
    const frames = this.live ? framesOfItem(it) : [];
    if (frames.length) {
      const key = this.partKeys.get(it.id)!;
      this.usedParts.add(key);
      this.printedFrames = true;
      this.screenFrames.push(...frames.map((f) => ({ ...f, part: key, slug: it.component ?? "" })));
      tree = { ...tree, props: { ...tree.props, "data-part": key } };
    }
    /* a world view listens on its channel, which the taps' input actions are sent on (lib/world) */
    if (def.world && tree.type in WIDGET_SOURCES) {
      uses.app.add("worldChannel");
      this.printedWorlds = true;
      tree = { ...tree, props: { ...tree.props, channel: raw(`worldChannel(${this.part(it.id)})`) } };
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
      families.length ? `families={{ ${families.join(", ")} }}` : "",
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
