import { COLOR_TOKENS, GAP, REGION_STATES, frameLengthOf, frameSizeOf, normalizeTheme, type Action, type ActionBody, type ApiSpec, type Condition, type Doc, type Effect, type Frame, type Group, type Item, type ScreenParam } from "../../tokens";
import type { Answer } from "../../actions/model";
import { partBySlug, reader } from "../../../parts/registry";
import type { PartDef, PropDef } from "../../../parts/types";
import { formStateProps } from "../../../parts/fieldState";
import { roleOf } from "../../../parts/role";
import { str } from "../../../parts/print";
import { cleanLook } from "../../look";
import { kindsIn, styleContext, styleDifferences, withDocStyles, type StyleScreen } from "../../styles";
import { pinOf } from "../../tidy";
import { optionsOf } from "../../partContract";
import { eventProp } from "../partEvents";
import { endpointOf } from "../../bindings/contract";
import { messagesShown } from "../../bindings/view";
import { answerShape, fillCode, formRules, listCode, okStatus, pageSizeOf, paneState, readCode, readOf, regionOptions } from "../bindCode";
import { NATIVE, INPUT_PROPS, isNative, kitPropName } from "../../../miniapp-kit/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../miniapp-kit/src/kit/parts.generated";
import { SET_ONLY, propValues, type AtomTaps, type PlainNode } from "../rn/data";
import { Imports, NAME, andThen, draws, el, exprOf, handler, jsx, objOf, printHandler, same, svgMarkup, type Handler, type J } from "../ir/code";
import { answers, setsProp, type DocFacts } from "../ir/facts";
import { OPENS_BY_PROP, atomsOf, iconNamesOf, keepsTrigger, linesOf, partNode, planScreens, selectsByProp, slotGiven, type Loose, type PartNode, type RunNode, type ScreenPlan } from "../ir/screen";

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
  kind: "placeholder" | "atoms" | "holder" | "trigger" | "hidden" | "slot" | "event" | "look" | "image" | "unknown" | "binding" | "scroll" | "link" | "input" | "style";
  screen?: string;
  /** what touches more than one (what of the style is not drawn), every screen it touches */
  screens?: string[];
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
  /** the capability views drawn by the product's slots: where a screen imports them from, and each one's component by
   *  item id (lib/export/appCapabilities.ts) */
  slots?: { from: string; names: Record<string, string> };
};

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
  invoke: ["capability", "args", "then", "catch"],
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
    out[k] = k === "then" || k === "catch" ? cleanAnswer(v as Answer, names, depth + 1) : k === "part" && typeof v === "string" && VISIBILITY.has(e.do) ? names.shown(v) : (k === "part" || k === "form") && typeof v === "string" ? names.part(v) : v;
  }
  return out;
}

function cleanBody(b: ActionBody, names: Names, depth = 0): Record<string, unknown> {
  const effects = (b.effects ?? []).map((e) => cleanEffect(e, depth, names)).filter((e): e is Record<string, unknown> => !!e);
  return { to: names.screen(b.to), ...(b.url ? { url: b.url } : {}), ...(effects.length ? { effects } : {}), ...(b.overlay ? { overlay: true } : {}), ...(b.params ? { params: b.params } : {}) };
}

/** a call's or an invoke's then or catch: a body, with the branch the answer picks (docs/交互规则.md, 回答上的条件) */
function cleanAnswer(a: Answer, names: Names, depth: number): Record<string, unknown> {
  return { ...cleanBody(a, names, depth), ...(a.when ? { when: cleanCondition(a.when, names) } : {}), ...(a.else ? { else: cleanBody(a.else, names, depth) } : {}) };
}

function cleanAction(a: Action, names: Names): Record<string, unknown> {
  const when = a.when as Condition | undefined;
  return { ...cleanBody(a, names), ...(when ? { when: cleanCondition(when, names) } : {}), ...(a.else ? { else: cleanBody(a.else, names) } : {}) };
}

/* ---------- one screen ---------- */

type Screens = { keys: Map<string, string>; names: Map<string, string> };

/** where a part stands as the code reads it: the expressions' scope, and what a tap from it is run with */
type At = { $: string; item?: string; index?: string; form?: { id: string; handle: string } };

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** a part's key in the screen's runtime: its first item's id (what effects name) */
const keyOfGroup = (g: Group) => g.items[0]?.id ?? g.id;

class ScreenPrinter {
  kit = new Imports().add("Screen").add("useScreen");
  /** the slots the screen draws its capability views with */
  slots = new Set<string>();
  runtime = new Imports();
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
  /** the delayed taps, after every scope they read */
  after: string[] = [];
  /** the inputs a form keeps that a condition asks whether they are filled, by their printed name */
  formFields: Record<string, { form: string; field: string }> = {};
  /** forms by their group id */
  forms = new Map<string, { handle: string; scope: string; op: string }>();
  repeats = 0;
  uses$ = false;
  usesCalls = false;
  /** how far the page scrolls past its content, clear of what floats over the screen's foot (lib/foot.ts) */
  room = 0;

  readonly frame: Frame;
  readonly key: string;
  /** the groups on the screen */
  readonly all: Group[];
  /** how many regions the screen shows the state of */
  private regions = 0;

  constructor(
    readonly doc: Doc,
    readonly screen: ScreenPlan,
    readonly widths: Record<string, number>,
    readonly screens: Screens,
    readonly warnings: MiniWarning[],
    readonly o: MiniPrintOptions,
    /** what the document's taps show, hide, open and set (lib/export/ir/facts.ts) */
    readonly facts: DocFacts,
    readonly tabBar: { screens: Set<string>; bars: Set<string> },
  ) {
    this.frame = screen.frame;
    this.key = screen.key;
    this.all = screen.groups;
  }

  get api(): ApiSpec {
    return this.doc.api ?? {};
  }

  /** what the printed code calls a screen and a part (see `Names`) */
  readonly names: Names = {
    screen: (to: string): string => this.screens.keys.get(to) ?? (to === "back" || to === "link" ? to : "none"),
    part: (id: string): string => this.facts.names.get(id) ?? id.replace(/[^\w-]/g, ""),
    shown: (id: string): string => {
      const g = this.facts.owner.get(id);
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

  /** where a tap is made, as the screen's runtime runs it: the scope, the row's element and its place, the form, the part
   *  (what a call's answer is told apart by), and `more` (the place of a family, an event) */
  env(at: At, more: string[] = []): string {
    return `{ ${[`$: ${at.$}`, ...(at.item ? [`item: ${at.item}`, ...(at.index ? [`index: ${at.index}`] : [])] : []), ...(at.form ? [`form: ${str(at.form.id)}`] : []), ...more].join(", ")} }`;
  }

  /** a tap as a handler, run by the screen's runtime with where the part stands; a delayed one runs by itself */
  tap(a: Action | undefined, part: string, at: At): Handler | undefined {
    if (!a) return undefined;
    if (a.trigger?.on === "hover") this.warn("trigger", "a hover trigger is printed as a tap", part);
    if (a.scrollTo) this.warn("scroll", "scrolling to a part is not printed", part);
    if (a.to === "link") this.warn("link", "a mini-program copies the address (WeChat and Douyin open no outside page without a web-view domain); H5 opens it", part);
    const run = handler(this.run(a, part, at));
    if (a.trigger?.on === "delay") {
      if (at.item) this.warn("trigger", "a delayed tap inside a list runs as a tap", part);
      else {
        this.kit.add("useAfter");
        this.after.push(`useAfter(${Math.max(0, Math.round(a.trigger.ms))}, ${printHandler(run)});`);
        return undefined;
      }
    }
    return run;
  }

  /** an action run by the screen's runtime where the part stands, as an expression (`more`: the place of a family, an
   *  event) */
  run(a: Action, part: string, at: At, more: string[] = []): string {
    this.kit.type("Action");
    this.uses$ = true;
    const where = answers(a) ? [`part: ${str(this.names.part(part))}`, ...more] : more;
    return `s.run(${this.constant("A", cleanAction(a, this.names), "Action")}, ${this.env(at, where)})`;
  }

  /** What an item carries beside its props: its look and its taps. A part drawn as atoms takes no taps of places:
   *  `slots` is then the places whose taps went to the atoms that show them, and any other is lost and said so. A part
   *  open over the screen (`close`, its key) closes once one of its places is tapped. */
  extras(p: PartNode, at: At, slots: boolean | ReadonlySet<string> = true, close?: string): [string, string][] {
    const it = p.item;
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
    if (tap) out.push(["onPress", printHandler(tap)]);
    const lost = slots === true ? [] : p.places.filter(([k]) => !(slots instanceof Set && slots.has(k)));
    if (lost.length) this.warn("slot", "a tap on a place inside a part drawn as atoms is not kept", it.id);
    const taps = slots === true ? p.places.flatMap(([slot, a]): [string, Handler][] => {
      const h = this.tap(a, it.id, at);
      return h ? [[slot, h]] : [];
    }) : [];
    const closing = close ? taps.map(([slot, h]): [string, Handler] => [slot, andThen(h, `s.close(${str(close)})`)]) : taps;
    const all = close && !closing.some(([slot]) => slot === "dismiss") ? [...closing, ["dismiss", handler(`s.close(${str(close)})`)] as [string, Handler]] : closing;
    /* a family's action runs for every place of it that has none of its own, told which (`slot`) */
    const families = slots === true ? p.families.map(([prefix, a]) => [prefix, this.run(a, it.id, at, ["slot"])] as const) : [];
    if (slots !== true && p.familyKeys) this.warn("slot", "the action for every entry of a part drawn as atoms is not kept", it.id);
    const own = `{ ${all.map(([s, h]) => `${str(s)}: ${printHandler(h)}`).join(", ")} }`;
    if (families.length) {
      this.kit.add("slotTaps");
      const done = close ? `, s.close(${str(close)})` : "";
      out.push(["taps", `slotTaps(${own}, { ${families.map(([prefix, f]) => `${str(prefix)}: (slot) => (${f}${done})`).join(", ")} })`]);
    } else if (all.length) out.push(["taps", own]);
    out.push(...this.events(p, at));
    return out;
  }

  /** The part's events as the kit component hands them out (`onSettled`, `onReorder`…), each running the design's action
   *  on it with what it carries (`event`), cut down to what the part declares. */
  events(p: PartNode, at: At): [string, string][] {
    const out: [string, string][] = [];
    if (!p.def) return out;
    for (const e of p.events) {
      const ep = isNative(p.def.slug) ? eventProp(p.def.slug, e.name) : null;
      if (!ep) {
        /* a capability view's slot sends its events itself (`onEvent`) */
        if (!this.o.slots?.names[p.item.id]) this.warn("event", `the part does not send its event "${e.name}" in a mini-program: the action on it is not run`, p.item.id);
        continue;
      }
      this.kit.add("eventOf").type("EventFields");
      const fields = this.constant("E", e.payload, "EventFields");
      out.push([ep.prop, `(${ep.params}) => ${this.run(e.action, p.item.id, at, [`event: eventOf(${fields}, ${ep.payload})`])}`]);
    }
    return out;
  }

  /** what a capability view's slot sends (`onEvent(name, payload)`), each event running the design's action on it */
  slotEvents(p: PartNode, at: At): [string, string][] {
    const cases = p.events.map((e) => {
      this.kit.add("eventOf").type("EventFields");
      const fields = this.constant("E", e.payload, "EventFields");
      return `if (name === ${str(e.name)}) ${this.run(e.action, p.item.id, at, [`event: eventOf(${fields}, payload)`])};`;
    });
    return cases.length ? [["onEvent", `(name: string, payload: unknown) => { ${cases.join(" ")} }`]] : [];
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
      if (typeof bind === "string" && bind.startsWith("=")) {
        code = this.boundExpr(d, bind.slice(1), code, at.$);
        /* as the app for phones says: a table is not read from data yet */
        if (d.kind === "table") this.warn("binding", "a table bound to an expression keeps the design's rows", it.id);
      } else if (typeof bind === "string" && bind) {
        const labels = d.key === "selected" ? listLabels(def, it) : undefined;
        code = `s.bound(${str(bind)}, ${code}${labels ? `, ${expr(labels)}` : ""})`;
      } else if (typeof v === "string" && v.includes("{{") && (d.kind === "text" || d.kind === "image")) {
        this.uses$ = true;
        code = fillCode(at.$, v);
      } else if (!setsProp(this.facts, it.id, d.key) && !(d.key === "selected" && selectsByProp(def, it)) && !SET_ONLY.has(d.key) && same(v, defaults[key])) continue;
      /* a row picked moves the chosen one where the part leaves that to whoever draws it (`selects`) */
      if (setsProp(this.facts, it.id, d.key) || (d.key === "selected" && selectsByProp(def, it))) code = `s.prop(${str(this.names.part(it.id))}, ${str(d.key)}, ${code})`;
      out.push([key, code]);
    }
    for (const n of iconNamesOf(def.slug, values)) this.icons.add(n);
    return out;
  }

  /** what a person enters in a part: held by its form's field, else by the screen's runtime (and the variable it is
   *  bound to), so a condition can read it */
  input(def: PartDef, it: Item, at: At): { skip?: string; props: [string, string][] } {
    const key = INPUT_PROPS[def.slug];
    if (!key) {
      /* a part that declares an input the kit does not wire keeps its value to itself here, and says so where it is read */
      const own = def.input?.prop;
      if (own && ((it.field && at.form) || (typeof it.bind?.[own] === "string" && !it.bind[own].startsWith("=")))) this.warn("input", "what is entered here does not reach its variable or form in a mini-program", it.id);
      return { props: [] };
    }
    const prop = kitPropName(def.slug, key);
    const values = propValues(def, it.props);
    /* set read-only (a product's stars), it takes nothing in: only a field or a binding makes it follow something */
    if (values.readOnly === true && !it.field && it.bind?.[key] === undefined) return { props: [] };
    /* a choice picks among words (a list's rows, or words with commas: a palette's colors) and holds the words of what
       it picks; several picks of a text prop (a multi-select's "1,3") are words of their own */
    const labels = def.input?.kind === "choice" ? optionsOf(it) : def.input ? undefined : key === "selected" ? listLabels(def, it) : undefined;
    /* D3: a list of words (the tags) is held as its words in a form, and one a line in the screen's runtime and its variable */
    const list = def.input?.kind === "choices" && def.props.find((d) => d.key === key)?.kind === "list";
    const form = it.field && at.form ? at.form : undefined;
    if (form) {
      const f = str(it.field!);
      const h = form.handle;
      const out: [string, string][] = [];
      if (this.facts.filled.has(it.id)) this.formFields[this.names.part(it.id)] = { form: form.id, field: it.field! };
      if (labels) {
        this.kit.add("optionIndex");
        out.push([prop, `optionIndex(${expr(labels)}, ${h}.value(${f}))`], ["onChange", `(i: number) => ${h}.set(${f}, ${expr(labels)}[i])`]);
      } else if (key === "checked" || def.input?.kind === "bool") out.push([prop, `!!${h}.value(${f})`], ["onChange", `(v: boolean) => ${h}.set(${f}, v)`]);
      else if (list) out.push([prop, `(${h}.value(${f}) as string[] | undefined) ?? ${expr(linesOf(values[key]))}`], ["onChange", `(v: string[]) => ${h}.set(${f}, v)`]);
      else if (def.input?.kind === "number") out.push([prop, `Number(${h}.value(${f}) ?? ${expr(values.value ?? 0)})`], ["onChange", `(v: number) => ${h}.set(${f}, v)`]);
      else if (def.slug === "file-upload") {
        this.kit.type("PickedFile");
        out.push([prop, `${h}.value(${f}) as PickedFile | PickedFile[] | undefined`], ["onChange", `(v?: PickedFile | PickedFile[]) => ${h}.set(${f}, v)`]);
      } else out.push([prop, `${h}.text(${f})`], ["onChange", `(v: string) => ${h}.set(${f}, v)`]);
      /* its error and message, and required as the contract says, by its field states (parts/fieldState.ts); the
         kit's select and file upload show an error of their own */
      const apart = (this.messagesApart ??= messagesShown(this.all)).has(`${form.id}:${it.field}`);
      const set = formStateProps(def, { invalid: `!!${h}.error(${f})`, ...(apart ? {} : { message: `${h}.error(${f}) ?? ""` }), required: this.requiredField(form.id, it.field!) });
      if (!set.length && (def.slug === "select" || def.slug === "file-upload")) set.push(["error", `!!${h}.error(${f})`]);
      out.push(...set.map(([k, v]): [string, string] => [kitPropName(def.slug, k), v === true ? "true" : v]));
      return { skip: key, props: out };
    }
    if (it.field) this.warn("binding", "an input with a field outside a form is entered but sent nowhere", it.id);
    const design = list ? linesOf(values[key]) : values[key];
    const bind = it.bind?.[key];
    const varId = typeof bind === "string" && bind && !bind.startsWith("=") ? bind : undefined;
    const start = typeof bind === "string" && bind.startsWith("=") ? this.boundExpr(def.props.find((d) => d.key === key)!, bind.slice(1), expr(design), at.$) : expr(design ?? (def.slug === "file-upload" ? undefined : ""));
    this.inputs[this.names.part(it.id)] = `{ value: ${expr(design ?? null)}${varId ? `, var: ${str(varId)}` : ""}${labels ? `, labels: ${expr(labels)}` : ""} }`;
    const id = str(this.names.part(it.id));
    const typed = def.slug === "file-upload" ? "PickedFile | PickedFile[] | undefined" : typeof design === "boolean" ? "boolean" : typeof design === "number" ? "number" : "string";
    if (def.slug === "file-upload") this.kit.type("PickedFile");
    const change = list ? `(v: string[]) => s.setter(${id})(v.join("\\n"))` : `s.setter(${id})`;
    return { skip: key, props: [[prop, `s.value<${typed}>(${id}, ${start}${def.slug === "file-upload" ? " as PickedFile | undefined" : ""})`], ["onChange", change]] };
  }

  /** A tree of atoms (a split) as elements, the root wearing the item's look and taps. `taps` walks the tree it was
   *  drawn from beside it, so each tap of a place lands on the atom the split gives it (lib/kits.ts `splitTaps`). */
  tree(n: PlainNode, at: At, root?: PartNode, dir = "column", stretch = false, taps?: AtomTaps): J {
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
    if (root) props.push(...this.extras(root, at, taps?.placed ?? false), ["testID", str(this.names.part(root.item.id))]);
    const placed = taps && taps.actions.get(taps.node);
    const tap = placed && this.tap(placed, taps.owner, at);
    if (tap) props.push(["onPress", printHandler(tap)]);
    const own = (n.props.layout as string | undefined) ?? (n.slug === "box" ? "column" : "free");
    const kids = (n.kids ?? []).map((k, i) => this.tree(k, at, undefined, own, n.props.align === "stretch", taps && taps.node.kids?.[i] ? { ...taps, node: taps.node.kids[i] } : undefined));
    const self = el(name, props, kids);
    const across = dir !== "row" && stretch;
    const tall = dir === "row" && stretch;
    if (!n.grow && !across && !tall) return self;
    this.kit.add("Cell");
    return el("Cell", [["dir", str(dir === "grid" ? "grid" : dir)], ...(n.grow ? ([["grow", "true"]] as [string, string][]) : []), ...(across ? ([["fillWidth", "true"]] as [string, string][]) : []), ...(tall ? ([["fillHeight", "true"]] as [string, string][]) : [])], [self]);
  }

  /** one part: the kit's component, its slot, the atoms it splits into, or a placeholder naming it */
  part(p: PartNode, at: At, kids: J[] = [], layout: [string, string][] = [], close?: string): J {
    const { item: it, def, size } = p;
    if (!def) {
      this.warn("unknown", "a part no definition stands for", it.id);
      this.kit.add("Placeholder");
      return el("Placeholder", [["part", str(typeof it.component === "string" ? it.component.replace(/[^\w-]+/g, "").slice(0, 60) : "")]]);
    }
    /* a capability view is its slot (src/custom/slots), handed what the design's stand-in is and drawing it until written */
    const slot = this.o.slots?.names[it.id];
    if (slot && def.capability) {
      this.slots.add(slot);
      /* the stand-in is the kit's own drawing of the view where it has one (the camera's, the map's, the call's), its
         props the part's as the kit takes them */
      const standIn = isNative(def.slug) ? NATIVE[def.slug] : "Placeholder";
      this.kit.add(standIn);
      const drawn = isNative(def.slug) ? el(standIn, [...this.props(def, it, at), ...this.extras(p, at, true, close), ["testID", str(this.names.part(it.id))]]) : el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)]]);
      return el(slot, [...slotGiven(def, it).map(([k, v]) => [k, expr(v)] as [string, string]), ["width", expr(size.w)], ["height", expr(size.h)], ...this.slotEvents(p, at)], [drawn]);
    }
    /* a part the product draws itself (`Item.slot`): its slot, handed what the kit's component is (the generated slots
       module draws the kit's component inside it), or around the atoms or the placeholder it is drawn as */
    if (slot) this.slots.add(slot);
    if (isNative(def.slug)) {
      const name = NATIVE[def.slug];
      if (!slot) this.kit.add(name);
      const own = new Set(layout.map(([k]) => k));
      const input = this.input(def, it, at);
      const props = this.props(def, it, at, input.skip).filter(([k]) => !own.has(k));
      /* a form's submit is held while it submits */
      if (at.form && p.submits) {
        /* held, and loading, by its field states (parts/fieldState.ts), as long as what the design says holds too */
        for (const [k] of formStateProps(def, { submitting: "" })) {
          const key = kitPropName(def.slug, k);
          const was = props.findIndex(([x]) => x === key);
          const design = was >= 0 ? props.splice(was, 1)[0][1] : "false";
          props.push([key, design === "false" ? `${at.form.handle}.submitting` : `${at.form.handle}.submitting || ${design}`]);
        }
      }
      /* a menu a tap opens or closes: its sheet follows the screen's runtime, the visitor's own opening kept there */
      const owner = this.facts.owner.get(it.id);
      const opens: [string, string][] = owner && this.facts.opened.has(owner.id) && OPENS_BY_PROP.has(def.slug) ? [["open", `s.opened(${str(this.names.shown(it.id))})`], ["onOpenChange", `(on: boolean) => s.setOpened(${str(this.names.shown(it.id))}, on)`]] : [];
      const picks: [string, string][] = selectsByProp(def, it) ? [["onSelect", `(i: number) => s.setProp(${str(this.names.part(it.id))}, "selected", i)`]] : [];
      /* files are asked for through the capability registry (file.pick) */
      if (def.slug === "file-upload") picks.push(["pick", "s.pickFiles"]);
      return el(slot ?? name, [...props, ...input.props, ...layout, ...this.extras(p, at, true, close), ...opens, ...picks, ["testID", str(this.names.part(it.id))]], kids);
    }
    const drawn = this.drawn(p, at, kids, layout);
    return slot ? el(slot, [["width", expr(size.w)], ["height", expr(size.h)]], [drawn]) : drawn;
  }

  /** a part the kit has no component for: the atoms it splits into, or a placeholder naming it */
  drawn(p: PartNode, at: At, kids: J[], layout: [string, string][]): J {
    const { item: it, def, size } = p as Required<PartNode>;
    if (def.atoms && !kids.length) {
      this.warn("atoms", `drawn as the atoms it splits into (${def.slug})`, it.id);
      const atoms = atomsOf(this.doc, def, it);
      return this.tree(atoms.plain, at, p, "column", false, atoms.taps);
    }
    this.kit.add("Placeholder");
    this.warn(kids.length ? "holder" : "placeholder", `${def.slug} has no component in the mini-program kit`, it.id);
    return el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)], ...layout, ...this.extras(p, at)], kids);
  }

  /** A part shown only while the screen's runtime says so: hidden until shown, shown until a tap hides it, or on a
   *  condition. What is shown or hidden is the document's group: a piece of a free group goes with the rest. */
  shown(run: Group, at: At, j: J): J {
    const tests: string[] = [];
    const first = run.items[0]?.id ?? run.id;
    const owner = this.facts.owner.get(first);
    if (run.hidden || (owner && this.facts.toggled.has(owner.id))) {
      const key = this.names.shown(first);
      if (run.hidden) this.hidden.push(key);
      tests.push(`s.shows(${str(key)})`);
    }
    if (run.showWhen) {
      this.uses$ = true;
      tests.push(`s.holds(${this.constant("C", cleanCondition(run.showWhen, this.names), "Condition")}, ${at.$})`);
      this.kit.type("Condition");
    }
    return tests.length ? { when: tests.join(" && "), show: [j] } : j;
  }

  /** a run as the plan has it: the part, and nested in it what it lays out */
  flow(node: RunNode, at: At): J {
    const { run, content: c } = node;
    if (c.kind === "instance") {
      this.kit.add("Box");
      return el("Box", [["layout", str("free")], ["padX", "0"], ["padY", "0"], ["width", expr(c.width)], ["height", expr(c.height)]], c.kids.map((k) => this.at(k, at)));
    }
    const asked = node.cell;
    const boxed = (j: J): J => (asked.length ? (this.kit.add("Cell"), el("Cell", asked, [j])) : j);
    /* a split view: the kit's, its two panes in it, each a box filling its pane (both show: no tab's visibility rule) */
    if (c.kind === "split") {
      const it = c.part.item;
      const held = c.panes.map((pane) => this.flow(pane, at));
      const kept: [string, string][] = it.props?.persist === true ? [["persistKey", str(`m3e-split:${it.id}`)]] : [];
      return this.shown(run, at, boxed(this.part(c.part, at, held, kept)));
    }
    if (c.kind === "part") return this.shown(run, at, boxed(this.part(c.part, at)));
    if (c.kind === "items") {
      this.kit.add("Box");
      return this.shown(run, at, boxed(el("Box", [["layout", str(c.axis === "x" ? "row" : "column")], ["gap", expr(GAP)], ["padX", "0"], ["padY", "0"]], c.parts.map((x) => this.part(x, at)))));
    }
    let inner = at;
    /* a form: its fields, its rules and its submit, over its operation's body */
    if (run.form) inner = this.form(run, at) ?? at;
    const print = (list: RunNode[], a: At) => list.map((k) => this.flow(k, a));
    let held: J[];
    if (run.states) {
      /* a region: what it holds on each of its states, the one its data is in drawn */
      const region = this.region(run, inner);
      held = [];
      for (const state of REGION_STATES) {
        const list = c.kids.filter((k) => paneState(k.run) === state);
        if (!list.length) continue;
        const body = state === "ready" && run.repeat?.data !== undefined ? this.repeat(run, list, inner, print) : print(list, inner);
        held.push({ when: `${region} === ${str(state)}`, show: body });
      }
    } else if (run.repeat?.data !== undefined) held = this.repeat(run, c.kids, inner, print);
    else {
      if (run.repeat) this.warn("binding", "a repeat over a collection is drawn once", run.items[0]?.id);
      /* a dock with an auto layout switches its tabs itself: what each tab holds, the kit showing the chosen one */
      held = c.dock ? c.dock.map(([pane, ns]) => (this.kit.add("DockPane"), el("DockPane", [["pane", expr(pane)]], print(ns, inner)))) : print(c.kids, inner);
    }
    return this.shown(run, at, boxed(this.part(c.part, inner, held, c.hugs)));
  }

  /** the first of what a layout holds drawn once for each element of the list its repeat reads, the rest after */
  repeat(run: Group, kids: RunNode[], at: At, print: (list: RunNode[], a: At) => J[]): J[] {
    const [template, ...rest] = kids;
    if (!template) return [];
    const n = ++this.repeats;
    const item = `item${n}`;
    const index = `index${n}`;
    const $r = `$r${n}`;
    this.runtime.add("keyOf");
    this.react.add("Fragment");
    this.uses$ = true;
    const each: J = { each: listCode(at.$, run.repeat!.data!, run.repeat?.limit), item, index, pre: [`const ${$r} = ${at.$}.with({ item: ${item}, index: ${index} });`], body: print([template], { ...at, $: $r, item, index }) };
    return [each, ...print(rest, at)];
  }

  /** the state a region shows, as a constant of the render */
  region(run: Group, at: At): string {
    const st = run.states!;
    const src = st.source ? (this.frame.data ?? []).find((d) => d.name === st.source) : undefined;
    this.runtime.add("regionOf");
    const name = `region${++this.regions}`;
    if (!src) this.warn("binding", `a region shows data the screen does not load (${st.source ?? "none"}): it shows its content`, run.items[0]?.id);
    if (st.emptyWhen) this.uses$ = true;
    this.hooks.push(`const ${name} = regionOf(${src ? identOf(src.name) : "undefined"}, { ${regionOptions(src?.load, st.emptyWhen, at.$, true).join(", ")} });`);
    return name;
  }

  /** the fields whose error the design shows in a line of its own, by `<form id>:<field>` */
  messagesApart?: Set<string>;

  /** whether a form's contract requires one of its fields */
  requiredField(formId: string, field: string): boolean {
    const g = this.all.find((x) => x.id === formId);
    const e = g?.form ? endpointOf(this.api, g.form.operationId) : undefined;
    return !!e && !!formRules(this.api, e)[field]?.required;
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
    this.runtime.type("FormFields");
    this.kit.add("useScreenForm");
    this.usesCalls = true;
    this.uses$ = true;
    const params = Object.entries(f.params ?? {}).map(([k, x]) => `${NAME.test(k) ? k : str(k)}: ${at.$}.ev(${str(x)})`);
    const values = Object.entries(f.values ?? {}).map(([k, x]) => `${str(k)}: ${at.$}.ev(${str(x)})`);
    const then = f.then ? this.constant("A", cleanBody(f.then, this.names), "ActionBody") : "undefined";
    const caught = f.catch ? this.constant("A", cleanBody(f.catch, this.names), "ActionBody") : "undefined";
    if (f.then || f.catch) this.kit.type("ActionBody");
    /* what runs after its answer is the design's, run by the screen's runtime as a call's then and catch are */
    this.hooks.push(
      [
        `const ${handle} = useScreenForm(s, ${str(this.names.part(run.id))}, {`,
        `  id: ${str(`${this.key}/${this.names.part(run.id)}`)},`,
        `  fields: ${R},`,
        `  operationId: ${str(f.operationId)},`,
        `  send: (body, init) => CALLS[${str(f.operationId)}](${objOf(params)}, body, init),`,
        ...(values.length ? [`  extra: () => ({ ${values.join(", ")} }),`] : []),
        `  status: ${expr(okStatus(e))},`,
        ...(f.then ? [`  then: ${then},`] : []),
        ...(f.catch ? [`  catch: ${caught},`] : []),
        `});`,
        `const ${scope} = ${at.$}.with({ form: ${handle}.view });`,
      ].join("\n"),
    );
    this.forms.set(run.id, { handle, scope, op: f.operationId });
    return { $: scope, form: { id: this.names.part(run.id), handle } };
  }

  /** a run standing loose, placed from the top left of what it stands on */
  at(l: Loose, at: At): J {
    this.kit.add("At");
    return el("At", [["x", expr(l.x)], ["y", expr(l.y)]], [this.flow(l.node, at)]);
  }

  /** a part open over the screen while the runtime says so: a dialog, a sheet, a menu that starts hidden */
  layer(node: RunNode, at: At): J {
    const { run } = node;
    const id = this.names.shown(run.items[0]?.id ?? run.id);
    this.hidden.push(id);
    this.kit.add("Layer");
    const it = run.items[0];
    const bottom = /sheet/.test(it.component ?? "") && (it.props?.side ?? "bottom") === "bottom";
    const part = node.content.kind === "part" ? node.content.part : partNode(it, this.widths);
    return el("Layer", [["open", `s.shows(${str(id)})`], ["onClose", `() => s.close(${str(id)})`], ["align", str(bottom ? "bottom" : "center")]], [this.part(part, at, [], [], id)]);
  }

  /** the screen's body: every run on it as the plan places it, the bars pinned to their edge */
  body(): J[] {
    const at: At = { $: "$" };
    /* a screen that loads data keeps what stands at its foot on the glass, its page ending clear of it */
    this.room = this.screen.foot?.room ?? 0;
    return this.screen.body.map((p): J => {
      if (p.layer) return this.layer(p.node, at);
      switch (p.at) {
        case "pin":
          this.kit.add("Pin");
          /* the app's tab bar draws itself in a mini-program (custom-tab-bar); on the web it stands here */
          if (this.tabBar.bars.has(p.node.run.items[0].id)) {
            return { when: `process.env.TARO_ENV === "h5"`, show: [el("Pin", [["edge", str("bottom")]], [el("TabBar", [])])] };
          }
          return el("Pin", [["edge", str(p.edge)]], [this.flow(p.node, at)]);
        case "span":
          this.kit.add("At");
          return el("At", [["y", expr(p.y)], ["span", "true"]], [this.flow(p.node, at)]);
        case "float":
          /* a button (or a FAB) at the foot of a screen of data floats there, as far above the foot as the design has it */
          this.kit.add("Pin");
          return el("Pin", [["edge", str("floatingBottom")], ["x", expr(p.x)], ["bottom", expr(p.bottom)]], [this.flow(p.node, at)]);
        case "loose":
          return this.at({ node: p.node, x: p.x, y: p.y }, at);
      }
    });
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
  /* what the printer calls further down (the layout, the parts) may read a style without being handed one: the
     document's are in reach for this one synchronous call */
  return withDocStyles(styleContext(source.styles), () => screensOf(source, widths, o));
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
  const kitImport = o.kitImport ?? "../../kit";
  const runtimeImport = o.runtimeImport ?? "@m3e/app-runtime";
  /* a screen's component is never the kit's Screen, which its file draws with; its key is never where a tap goes beside
     a screen ("back", "link", "none": miniapp-kit/src/kit/app/screen.tsx), so a screen named Back opens itself; a
     region's other states are its own to switch between, and a screen of data keeps what stands at its foot over it */
  const plan = planScreens(source, widths, { names: { lower: true, reservedKeys: RESERVED_KEYS, reservedComponents: RESERVED_COMPONENTS }, regions: true, foot: true, defaults: (slug) => KIT_PARTS[slug]?.defaults ?? {} });
  const { doc, facts, frames } = plan;
  const screens: Screens = { keys: plan.keys, names: plan.components };
  const warnings: MiniWarning[] = [];
  const icons = new Set<string>();
  const groupsOf = (frame: Frame) => plan.screens.find((x) => x.frame.id === frame.id)?.groups ?? [];
  const tab = o.tabBar === false ? { tabs: new Map<string, number>(), bars: new Set<string>(), items: [] } : tabBarOf(doc, frames, screens, groupsOf, widths);
  const printed = plan.screens.map((sp): MiniScreen => {
    const { frame, key } = sp;
    const p = new ScreenPrinter(doc, sp, widths, screens, warnings, o, facts, { screens: new Set(tab.tabs.keys()), bars: tab.bars });
    const body = p.body();
    p.icons.forEach((n) => icons.add(n));
    const { width: w, height: h, length } = sp;
    const bg = frame.bg && COLOR_TOKENS.some((t) => t.key === frame.bg) ? frame.bg : undefined;
    /* the screen's data: each source's arguments read in the screen's scope, loaded through the generated calls */
    const sources = (frame.data ?? []).map((d) => sourceHook(p, doc.api ?? {}, d));
    const names = sources.map((x) => x.name);
    const usesBody = draws(body, "TabBar");
    const top: string[] = [];
    const init: string[] = [];
    if (p.hidden.length) init.push(`hidden: ${expr([...new Set(p.hidden)])}`);
    if (Object.keys(p.inputs).length) init.push(`inputs: { ${Object.entries(p.inputs).map(([k, v]) => `${str(k)}: ${v}`).join(", ")} }`);
    if (Object.keys(p.formFields).length) init.push(`fields: ${expr(p.formFields)}`);
    /* the menus on this screen a tap opens or closes */
    const triggers = [...facts.opened].flatMap((g) => {
      const first = doc.groups.find((x) => x.id === g)?.items[0];
      return first && keepsTrigger(first) && p.all.some((x) => x.id === g) ? [p.names.shown(first.id)] : [];
    });
    if (triggers.length) init.push(`triggers: ${expr(triggers)}`);
    top.push(`const s = useScreen(${str(key)}${init.length ? `, { ${init.join(", ")} }` : ""});`);
    if (sources.length) {
      p.runtime.add("useBindings").add("useDataSource").add("sourceKey");
      p.usesCalls = true;
      /* the sources' arguments are read in the screen's scope before the sources are there */
      if (sources.some((src) => src.reads0)) top.push("const $0 = useBindings({ params: s.params, vars: s.vars });");
      for (const src of sources) top.push(...src.lines);
    }
    const needs$ = p.uses$ || p.hooks.length > 0 || sources.length > 0;
    if (needs$) {
      p.runtime.add("useBindings");
      top.push(`const $ = useBindings({ ${names.length ? `data: { ${names.join(", ")} }, ` : ""}params: s.params, vars: s.vars });`);
    }
    top.push(...p.hooks, ...p.after);
    const paged = sources.filter((x) => x.pull || x.more);
    if (paged.length) {
      p.kit.add("usePageData");
      top.push(`usePageData([${paged.map((x) => `{ source: ${x.name}${x.pull ? ", pull: true" : ""}${x.more ? ", more: true" : ""} }`).join(", ")}]);`);
    }
    if (sources.length) top.push(`s.register({ sources: { ${sources.map((x) => (x.name === identOf(x.source) && x.name === x.source ? x.name : `${str(x.source)}: ${x.name}`)).join(", ")} } });`);
    const screen = el("Screen", [["screen", str(key)], ...(bg ? ([["bg", str(bg)]] as [string, string][]) : []), ["width", expr(w)], ["height", expr(h)], ...(length > h ? ([["length", expr(length)]] as [string, string][]) : []), ...(p.room > 0 ? ([["room", expr(p.room)]] as [string, string][]) : [])], [...body, { expr: "s.layer" }]);
    const component = screens.names.get(frame.id)!;
    const imports = [
      ...(p.react.size ? [`import { ${[...p.react].sort().join(", ")} } from "react";`] : []),
      ...(p.runtime.size ? [p.runtime.line(runtimeImport, "split")] : []),
      p.kit.line(kitImport, "split"),
      ...(p.usesCalls ? [`import { CALLS } from ${str(o.callsImport ?? "../calls")};`] : []),
      ...(p.slots.size && o.slots ? [`import { ${[...p.slots].sort().join(", ")} } from ${str(o.slots.from)};`] : []),
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
  /* what of the document's style a mini-program does not draw (lib/styles/support.ts), with the screens it touches */
  const styles = styleContext(source.styles);
  const kinds = plan.screens.map((x): StyleScreen => ({ name: x.frame.name, slugs: kindsIn(x.groups) }));
  warnings.push(...styleDifferences({ theme: normalizeTheme(doc.theme, styles), styles, docStyles: source.styles, screens: kinds }, "miniapp"));
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
function sourceHook(p: ScreenPrinter, api: ApiSpec, d: NonNullable<Frame["data"]>[number]): { name: string; source: string; lines: string[]; pull: boolean; more: boolean; reads0: boolean } {
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
  /* its arguments and its body are read in the screen's scope before the sources are there (`$0`) */
  return { name, source: d.name, lines, pull: !!d.pullToRefresh, more: d.paging === "scroll" && !!paging, reads0: args.length > 0 || !!d.body };
}

export { kebab };

/** a value as an expression: numbers, words (as strings), lists and objects of them; null as the runtime reads it */
export const expr = (v: unknown): string => exprOf(v, "null");
