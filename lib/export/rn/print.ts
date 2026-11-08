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
  type ActionBody,
  type Condition,
  type DataSource,
  type Doc,
  type Effect,
  type Frame,
  type Group,
  type Item,
  type ScreenParam,
} from "../../tokens";
import type { Answer } from "../../actions/model";
import { partBySlug, reader, treeOf } from "../../../parts/registry";
import type { PartDef } from "../../../parts/types";
import { fullWidth, roleOf } from "../../../parts/role";
import { sanitizeSvg } from "../../../parts/svg";
import { isNode, type PNode } from "../../../parts/node";
import { str } from "../../../parts/print";
import type { Node } from "../../../parts/templates/kit";
import { expandDoc } from "../../expand";
import { getLang } from "../../i18n";
import { childLayoutOf, flowOf, sizingOf, type Flow } from "../../flow";
import { PANE_SIDES, panesOfSplit, splitOf } from "../../split";
import { cleanLook } from "../../look";
import { kitLookOf, splitTaps } from "../../kits";
import { kindsIn, styleContext, styleDifferences, withDocStyles, type StyleScreen } from "../../styles";
import { pinOf } from "../../tidy";
import { footOf } from "../../foot";
import { templateOf } from "../../collections";
import { INPUT_PROP } from "../../interact";
import { eventOfKey, eventsOf, familiesOf, familyOfKey, isPlaceKey, optionsOf } from "../../partContract";
import { eventProp } from "../partEvents";
import { endpointOf, formFields, type FieldSpec } from "../../bindings/contract";
import { formStateProps } from "../../../parts/fieldState";
import { fillCode, holdsCode, isApiEffect, listCode, pageSizeOf, paneState, partNames, readCode, readOf, regionOptions } from "../bindCode";
import { formsOf, messagesShown } from "../../bindings/view";
import { NATIVE, isNative, kitPropName } from "../../../rn/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../rn/src/kit/parts.generated";
import { SET_ONLY, plainTree, propValues, type AtomTaps, type PlainNode } from "./data";
import { dockPanes, isLaidOutDock, offTabOf } from "../panes";

/* The React Native code of a document: one screen component per screen, built from the kit (rn/src/kit), the way
 * lib/codegen.ts prints the web's. A screen is the design's: what stands loose is placed where it stands (`At`), the bars
 * are pinned to their edge (`Pin`), what an auto layout holds is nested in it and laid out by it, and each part is the
 * kit's component with the part's own props. A part the kit has no component for is printed as the tree of atoms it
 * splits into, or as a `Placeholder` that names it; each of those is reported.
 *
 * What a tap does beyond going to a screen (setting a variable, showing a part, a snackbar, a condition) is the design's
 * action as data, run by the kit's `useAct` (rn/src/kit/app.tsx); a part hidden at the start or shown on a condition is
 * drawn while the app's memory says so. With the app's runtime (`runtime`: the exported app, packages/app-runtime), a
 * screen bound to the API is printed with it too: its data sources, the expressions its parts read, its lists drawn per
 * element (a FlatList where the list has the screen's room), the state each region shows, its forms with their fields
 * checked by the contract, and taps that call the API (docs/数据绑定.md).
 *
 * Every word of the document goes into the code as a string (`str`), never as JSX text or a comment, and every name
 * the code is given (a component, a screen's key, a variable) is made of letters and digits only
 * (lib/exportInjection.test.ts). Expressions stay the author's words, as strings the runtime's evaluator reads. */

/** something the printed app does not do as the design says, for the exporter to list */
export type RnWarning = {
  kind: "placeholder" | "atoms" | "holder" | "effects" | "condition" | "hidden" | "trigger" | "slot" | "event" | "look" | "image" | "unknown" | "binding" | "input" | "style";
  /** the screen, by its name */
  screen?: string;
  /** what touches more than one (what of the style is not drawn), every screen it touches */
  screens?: string[];
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
  /** what it is given when it is opened (`params.<name>`); the component takes them as its `params` prop */
  params?: ScreenParam[];
  /** "required": only with a session; "login": the sign-in screen */
  auth?: "required" | "login";
  /** its forms: the operation each sends and the fields its inputs fill */
  forms?: { id: string; operationId: string; fields: string[] }[];
};

export type RnScreens = {
  screens: RnScreen[];
  warnings: RnWarning[];
  /** every icon name the screens draw */
  icons: string[];
  /** the screen an app opens on, and each flow's first screen */
  initial: string;
  flows: { name: string; screen: string }[];
  /** the parts (by key) hidden until a tap shows them: the app's memory starts so */
  hidden: string[];
  /** the design's variables, as the app's memory starts them */
  vars: { id: string; name: string; type: "text" | "number" | "bool" | "color"; value: string | number | boolean }[];
  /** the screens a tap opens over another */
  overlays: string[];
  /** the screens a navigation bar's destinations are: an app's tabs */
  tabs: string[];
  /** the overlays (by key) a tap opens or closes that keep a trigger of their own on the screen while shut (a menu) */
  triggers: string[];
};

export type RnPrintOptions = {
  /** where the kit is, from a screen's file */
  kitImport?: string;
  /** The pictures the document holds as data (a data: URL), as files the app bundles: `name` gives the name a picture
   *  is required by in the images module (lib/export/rn/app.ts `RnPictures`), `from` is where a screen imports that
   *  module from. Left out, such a picture is left out of the app, and reported. */
  images?: { from: string; name: (data: string) => string | undefined };
  /** The app's runtime, for a document bound to its API: where a screen imports the data layer the export generates
   *  beside the screens (its data sources, forms, scope; see lib/export/rn/mobile.ts). Left out (the kit's test bed),
   *  the bindings keep the design's values and are reported. */
  runtime?: { bind: string };
  /** the capability views drawn by the product's slots: where a screen imports them from, and each one's component by
   *  item id (lib/export/appCapabilities.ts) */
  slots?: { from: string; names: Record<string, string> };
};

/* ---------- JSX as data ---------- */

/** an element: a kit component (or `View`, or "" for a fragment) with its props, each an expression already printed,
 *  and what it holds */
type El = { tag: string; props: [string, string][]; kids: J[] };
/** an expression among an element's children (`{…}`), printed at a depth */
type Code = { code: (depth: number) => string };
type J = El | Code;

const el = (tag: string, props: [string, string][] = [], kids: J[] = []): El => ({ tag, props, kids });
const isCode = (j: J): j is Code => "code" in j;

/** an attribute's name: only names the printer chose, made of letters */
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** code standing where a value is printed: a picture the app bundles, read from the images module (`IMAGES.image1`) */
class Raw {
  constructor(readonly code: string) {}
}

/** a value as an expression: numbers, words (as strings), lists and objects of them */
export function expr(v: unknown): string {
  if (v instanceof Raw) return v.code;
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

const pad = (depth: number) => "  ".repeat(depth);

/** an element as indented JSX */
function jsx(j: J, depth: number): string {
  if (isCode(j)) return j.code(depth);
  const p = pad(depth);
  if (!j.tag) return `${p}<>\n${j.kids.map((k) => jsx(k, depth + 1)).join("\n")}\n${p}</>`;
  const attrs = j.props.map(([k, v]) => attr(k, v));
  const open = `<${j.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const long = p.length + open.length > 120 || open.includes("\n");
  const head = long ? `<${j.tag}\n${attrs.map((a) => `${p}  ${a.replace(/\n/g, `\n${p}  `)}`).join("\n")}\n${p}` : open;
  if (!j.kids.length) return `${p}${head}${long ? "/>" : " />"}`;
  return `${p}${head}>\n${j.kids.map((k) => jsx(k, depth + 1)).join("\n")}\n${p}</${j.tag}>`;
}

/** what is drawn only while `test` holds */
const when = (test: string, inner: J): Code => ({ code: (d) => `${pad(d)}{${test} ? (\n${jsx(inner, d + 1)}\n${pad(d)}) : null}` });

/** one of several, by what `on` is */
function cases(on: string, branches: [string, J[]][]): Code {
  const one = (kids: J[]): J => (kids.length === 1 ? kids[0] : el("", [], kids));
  return {
    code: (d) => {
      const lines = [`${pad(d)}{`];
      for (const [value, kids] of branches) lines.push(`${pad(d + 1)}${on} === ${str(value)} ? (`, jsx(one(kids), d + 2), `${pad(d + 1)}) :`);
      lines.push(`${pad(d + 1)}null}`);
      return lines.join("\n");
    },
  };
}

/* ---------- names ---------- */

/** a name made of the letters and digits of the author's words, unique among those taken */
function nameOf(words: string, fallback: string, taken: Set<string>, suffix = ""): string {
  const parts = (words.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w[0].toUpperCase() + w.slice(1));
  let base = parts.join("");
  if (!base || /^\d/.test(base)) base = fallback;
  else if (suffix && !base.endsWith(suffix)) base += suffix;
  /* distinct where case does not count: each is a file's name too, one file on macOS and Windows */
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
    /* a table whose structure has a column of icons (an onboarding's pages): each row's */
    const at = d.kind === "table" ? (d.columns ?? []).findIndex((col) => col.key === "icon") : -1;
    const rows = at >= 0 && v && typeof v === "object" ? (v as { rows?: unknown }).rows : undefined;
    if (Array.isArray(rows)) for (const row of rows) if (Array.isArray(row) && typeof row[at] === "string" && row[at]) out.push(row[at] as string);
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

/* ---------- what the whole document says that a screen needs ---------- */

/** the parts navigation bars stand for: their destinations are an app's tabs */
const NAV_BARS = new Set(["navigation-bar", "tab-bar", "floating-nav", "navigation-rail"]);

/** the inputs a form fills: what each enters a field with */
const FILE_INPUTS = new Set(["file-upload"]);
/** the inputs whose kit control the printer wires to a form field or a variable */
const RN_INPUTS = new Set(["input", "text-field", "textarea", "switch", "checkbox", "slider", "select", "radio-group", "rating"]);
/* D3: the pickers' and the entry parts' kit controls take a value and a change too, each as its input's kind says */
for (const slug of ["color-field", "item-picker", "multi-select", "color-palette", "number-picker", "transfer-list", "region-picker", "seat-map", "quantity-stepper", "tag-input", "number-pad", "signature-pad", "rich-text-editor"]) RN_INPUTS.add(slug);
/* the rows a sortable list is moved into, and whether a swipe row is open */
for (const slug of ["sortable-list", "swipe-row"]) RN_INPUTS.add(slug);
/** the parts whose chosen row is `selected` and which say so when one is tapped (`onSelect`), without moving it
 *  themselves: the app moves it, as the preview does */
const SELECTS_BY_PROP = new Set(["bar-list", "file-list", "tree"]);
/** a list input's rows as their words */
const labelsOf = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((r) => (r && typeof r === "object" ? String((r as { label?: unknown }).label ?? "") : String(r))) : []);
/** a list input's value as a text variable holds it, and the kit control takes it: one row a line */
const linesOf = (rows: unknown) => labelsOf(rows).join("\n");

/** Every action body the document holds: each part's taps, their else, the then and catch of their calls, and a form's. */
function eachBody(doc: Doc, fn: (b: ActionBody & { when?: Condition }, item?: Item) => void) {
  const visit = (b: (ActionBody & { when?: Condition; else?: ActionBody }) | undefined, item?: Item, depth = 0) => {
    if (!b || depth > 6) return;
    fn(b, item);
    visit(b.else, item, depth + 1);
    for (const e of b.effects ?? []) {
      if (e.do !== "call" && e.do !== "invoke") continue;
      visit(e.then, item, depth + 1);
      visit(e.catch, item, depth + 1);
    }
  };
  for (const g of doc.groups) {
    for (const it of g.items) {
      visit(it.action, it);
      for (const a of Object.values(it.actions ?? {})) visit(a, it);
    }
    visit(g.form?.then);
    visit(g.form?.catch);
  }
}

type DocFacts = {
  /** the group that holds each item */
  groupOf: Map<string, string>;
  /** the groups a tap shows or hides, and those hidden at the start */
  toggled: Set<string>;
  hidden: Set<string>;
  /** the inputs a condition asks whether they are filled */
  filled: Set<string>;
  /** the props taps set, by item */
  setProps: Map<string, Set<string>>;
  /** the groups a tap opens or closes */
  opened: Set<string>;
  overlays: Set<string>;
  tabs: Set<string>;
  /** what a warning calls a part: its words (`bindCode.partNames`), not its id */
  names: Map<string, string>;
};

function factsOf(doc: Doc): DocFacts {
  const groupOf = new Map<string, string>();
  for (const g of doc.groups) for (const it of g.items) groupOf.set(it.id, g.id);
  const facts: DocFacts = { groupOf, toggled: new Set(), hidden: new Set(doc.groups.filter((g) => g.hidden).map((g) => g.id)), filled: new Set(), setProps: new Map(), opened: new Set(), overlays: new Set(), tabs: new Set(), names: partNames(doc) };
  const conditions = (c: Condition | undefined) => {
    if (c && "filled" in c && typeof c.filled === "string") facts.filled.add(c.filled);
  };
  for (const g of doc.groups) conditions(g.showWhen);
  eachBody(doc, (b, item) => {
    conditions(b.when);
    if (b.overlay && b.to) facts.overlays.add(b.to);
    for (const e of b.effects ?? []) {
      if (e.do === "show" || e.do === "hide" || e.do === "toggle" || e.do === "open" || e.do === "close") {
        const g = groupOf.get(e.part);
        if (g) facts.toggled.add(g);
        if (g && (e.do === "open" || e.do === "close")) facts.opened.add(g);
      }
      if (e.do === "setProp") facts.setProps.set(e.part, new Set([...(facts.setProps.get(e.part) ?? []), e.prop]));
    }
    if (item && NAV_BARS.has(item.component ?? "") && b.to) facts.tabs.add(b.to);
  });
  return facts;
}

/** an overlay that keeps its trigger on the screen while shut (a menu): closing it shuts its popup only */
function keepsTrigger(it: Item | undefined): boolean {
  const def = it ? partBySlug(it.component) : undefined;
  return !!def?.overlay && !!def.open && def.open.trigger !== "hide";
}

/** the kit's components that open and close as their prop says, a tap's open and close effects too */
const OPENS_BY_PROP = new Set(["dropdown-menu", "tooltip", "popover", "hover-card"]);

/** whether a body (and its else) makes a call or an invoke, or submits: what its answer is told apart by is the part */
const answers = (a: Action) => [a, a.else].some((b) => (b?.effects ?? []).some((e) => e.do === "call" || e.do === "invoke" || e.do === "submit"));

/* ---------- one screen ---------- */

type Screens = { keys: Map<string, string>; names: Map<string, string> };

/** what an expression is read in where a part is printed: the scope's variable, the form it is in, the element of the
 *  list its row was drawn for */
type Ctx = { $: string; form?: { v: string; id: string }; item?: string; locals?: string[] };

/** a data source of the screen as printed: its variable and what it is */
type SourceInfo = { v: string; def: DataSource };

/** the words a reserved name of the printed screen cannot be a data source's variable */
const RESERVED = new Set(["app", "act", "nav", "params", "given", "item", "index", "keyOf", "regionOf", "rowsOf", "optionOf", "pickFile", "fileName", "useSource", "useFormFor", "useParams", "useScreenScope", "View", "IMAGES"]);

class ScreenPrinter {
  /** the kit's components this screen names */
  kit = new Set<string>(["Screen"]);
  /** the slots the screen draws its capability views with */
  slots = new Set<string>();
  /** what the screen imports from its data layer, and from React Native */
  bind = new Set<string>();
  rn = new Set<string>();
  /** the module's constants: actions, data sources, forms, params */
  consts: string[] = [];
  /** the component's hooks before its JSX, in order */
  head = { sources: [] as string[], scope: [] as string[], forms: [] as string[], regions: [] as string[], after: [] as string[] };
  uses = { nav: false, app: false, act: false, $: false };
  sources = new Map<string, SourceInfo>();
  forms = new Map<string, string>();
  formInfos: { id: string; operationId: string; fields: string[] }[] = [];
  /** the inputs a form keeps that a condition asks whether they are filled: each by its id, what reads it */
  formInputs: [string, string][] = [];
  icons = new Set<string>();
  /** whether the screen reads a picture the app bundles (the images module) */
  pictures = false;
  ctx: Ctx;
  private n = { action: 0, event: 0, form: 0, region: 0, row: 0, source: 0 };
  readonly runtime: boolean;
  /** the bottom bars' height: a list that scrolls stops above them */
  private foot = 0;
  /** how far a list that scrolls runs past its last row, clear of what floats over the screen's foot (lib/foot.ts) */
  private room = 0;
  /** which form each group is in */
  private owner: Map<string, string>;

  constructor(
    readonly doc: Doc,
    readonly frame: Frame,
    readonly widths: Record<string, number>,
    readonly all: Group[],
    readonly screens: Screens,
    readonly warnings: RnWarning[],
    readonly o: RnPrintOptions,
    readonly facts: DocFacts,
  ) {
    /* the exported app always has its runtime: a design with no API still reads its expressions and params with it */
    this.runtime = !!o.runtime;
    this.ctx = { $: "$" };
    this.owner = formsOf(all);
    if (this.runtime) {
      const taken = new Set(RESERVED);
      for (const d of frame.data ?? []) {
        let v = NAME.test(d.name) && !taken.has(d.name) ? d.name : `source${++this.n.source}`;
        while (taken.has(v)) v = `source${++this.n.source}`;
        taken.add(v);
        this.sources.set(d.name, { v, def: d });
      }
    }
  }

  warn(kind: RnWarning["kind"], detail: string, part?: string) {
    this.warnings.push({ kind, screen: this.frame.name, ...(part ? { part: this.facts.names.get(part) ?? part.replace(/[^\w-]/g, "") } : {}), detail });
  }

  /** the scope variable of where a part is printed: the screen's data, its params and the app's variables */
  get $(): string {
    this.uses.$ = true;
    return this.ctx.$;
  }

  /* ---------- taps ---------- */

  /** where an action goes, as the kit's action data says it: a screen's key, "back", "link" or "none" */
  target(to: string): string {
    if (to === BACK_TARGET) return "back";
    if (to === LINK_TARGET) return "link";
    return this.screens.keys.get(to) ?? "none";
  }

  /** an action body as the data the kit runs: screens by their keys, the parts a tap shows by the group they are in */
  bodyData(b: ActionBody | undefined, depth = 0): Record<string, unknown> | undefined {
    if (!b || depth > 6) return undefined;
    const to = this.target(b.to);
    const url = to === "link" ? linkUrlOf(b) : null;
    const effects = (b.effects ?? []).flatMap((e): Record<string, unknown>[] => {
      /* what the API does runs only in an app with its runtime (the exported app, not the kit's test bed) */
      if ((isApiEffect(e) || e.do === "invoke") && !this.runtime) {
        if (e.do === "call") this.warn("binding", "a call to the API runs only in an app with its runtime");
        if (e.do === "invoke") this.warn("binding", "an invoke of a platform capability runs only in an app with its runtime");
        return [];
      }
      switch (e.do) {
        case "show":
        case "hide":
        case "toggle":
        case "open":
        case "close": {
          const g = this.facts.groupOf.get(e.part);
          return g ? [{ do: e.do, part: g }] : [];
        }
        case "call":
        case "invoke":
          // eslint-disable-next-line unicorn/no-thenable -- an action body as data, never a function: nothing awaits it
          return [{ ...e, then: this.answerData(e.then, depth + 1), catch: this.answerData(e.catch, depth + 1) }];
        default:
          return [e as unknown as Record<string, unknown>];
      }
    });
    return {
      to: to === "link" && !url ? "none" : to,
      ...(url ? { url } : {}),
      ...(b.overlay && to !== "back" && to !== "link" && to !== "none" ? { overlay: true } : {}),
      ...(b.params && Object.keys(b.params).length && this.runtime ? { params: b.params } : {}),
      ...(effects.length ? { effects } : {}),
    };
  }

  /** a call's or an invoke's then or catch as data, with the branch the answer picks (docs/交互规则.md, 回答上的条件) */
  answerData(a: Answer | undefined, depth: number): Record<string, unknown> | undefined {
    const body = this.bodyData(a, depth);
    if (!body || !a?.when) return body;
    /* its condition as a tap's is printed (the kit's host reads it the same way) */
    return { ...body, when: a.when, ...(a.else ? { else: this.bodyData(a.else, depth) } : {}) };
  }

  /** whether a tap reads expressions: a condition on one, a value set from one, words with {{one}}, a call, a form */
  private readsScope(a: Action): boolean {
    if (!this.runtime) return false;
    const reads = (b: ActionBody | undefined): boolean => !!b && (!!(b.params && Object.keys(b.params).length) || (b.effects ?? []).some((e: Effect) => (e.do === "setVar" && typeof e.expr === "string") || (e.do === "snackbar" && e.message.includes("{{")) || e.do === "call" || e.do === "invoke" || e.do === "submit"));
    return (!!a.when && "expr" in a.when) || reads(a) || reads(a.else);
  }

  /** Where a tap was made, for the expressions it reads and the interpreter: the scope, the form, the row's element and
   *  its place, the part (what a call's answer is told apart by), and `more` (the place of a family, an event). */
  here(a: Action, part?: string, more: string[] = []): string | undefined {
    const parts: string[] = [];
    /* a submit that names its form (a button outside it) submits that one */
    const named = [a, a.else].flatMap((b) => b?.effects ?? []).find((e): e is Extract<Effect, { do: "submit" }> => e.do === "submit" && !!e.form);
    const form = (named?.form && this.forms.get(named.form)) || this.ctx.form?.v;
    if (this.readsScope(a) || this.ctx.form || this.ctx.item || (more.length && this.runtime)) parts.push(`scope: ${this.$}.scope`);
    if (form) parts.push(`form: ${form}`);
    if (this.ctx.item) parts.push(this.ctx.item === "item" ? "item, index" : `item: ${this.ctx.item}`);
    /* the part by a name of its own, the same on every export (its id may be new each time a template is used) */
    if (part && this.runtime && answers(a)) parts.push(`part: ${str(this.facts.names.get(part) ?? part.replace(/[^\w-]/g, ""))}`);
    parts.push(...more);
    return parts.length ? `{ ${parts.join(", ")} }` : undefined;
  }

  /** A tap as a call: to a screen (over this one when it is an overlay), back, out to an address; or, when it does more
   *  (effects, a condition, params), the design's action run by the kit. A delayed one runs by itself. */
  action(a: Action | undefined, part: string): string | undefined {
    if (!a) return undefined;
    if (a.trigger?.on === "hover") this.warn("trigger", "a hover trigger is printed as a tap", part);
    if (a.scrollTo) this.warn("effects", "scrolling to a part is not printed", part);
    const run = this.run(a, part);
    const call = run ? `() => ${run}` : undefined;
    if (call && a.trigger?.on === "delay") {
      if (this.ctx.item) this.warn("trigger", "a delayed tap inside a list runs as a tap", part);
      else {
        this.kit.add("useAfter");
        this.head.after.push(`useAfter(${Math.max(0, Math.round(a.trigger.ms))}, ${call});`);
        return undefined;
      }
    }
    return call;
  }

  /** What runs an action, as an expression: a plain move by itself, else the design's action run where it was made
   *  (`more`: the place a family's action was run for, the event that started it). */
  run(a: Action, part: string, more: string[] = []): string | undefined {
    /* an address outside the app opens through the capability registry (link.open), which the interpreter reaches */
    const plain = !more.length && !a.when && !a.else && !a.effects?.length && !(a.params && Object.keys(a.params).length && this.runtime) && !(a.to === LINK_TARGET && this.runtime);
    if (plain) {
      const call = this.call(a);
      if (call) this.uses.nav = true;
      return call;
    }
    const data = { ...this.bodyData(a), ...(a.when ? { when: a.when } : {}), ...(a.else ? { else: this.bodyData(a.else) } : {}) };
    const name = `A${++this.n.action}`;
    this.consts.push(`const ${name}: Action = ${expr(data)};`);
    this.kit.add("type Action");
    this.uses.act = true;
    const here = this.here(a, part, more);
    return `act(${name}${here ? `, ${here}` : ""})`;
  }

  /** a plain move as an expression: back, out to an address, to a screen (over this one when it is an overlay) */
  call(a: Action): string | undefined {
    if (a.to === BACK_TARGET) return "nav.back()";
    if (a.to === LINK_TARGET) {
      const url = linkUrlOf(a);
      return url ? `nav.open(${str(url)})` : undefined;
    }
    const key = this.screens.keys.get(a.to);
    if (key) return a.overlay ? `nav.go(${str(key)}, { overlay: true })` : `nav.go(${str(key)})`;
    return undefined;
  }

  /** a condition as code */
  holds(c: Condition): string {
    if ("expr" in c && this.runtime) return holdsCode(this.$, c.expr);
    this.uses.app = true;
    return `app.holds(${expr(c)}${this.ctx.item || this.ctx.form ? `, { scope: ${this.$}.scope }` : ""})`;
  }

  /** what decides whether a group is drawn: a tap that shows or hides it, its condition */
  visible(run: Group, j: J): J {
    const tests: string[] = [];
    if (this.facts.toggled.has(run.id) || this.facts.hidden.has(run.id)) {
      this.uses.app = true;
      tests.push(`app.shown(${str(run.id)})`);
    }
    if (run.showWhen) tests.push(this.holds(run.showWhen));
    return tests.length ? when(tests.join(" && "), j) : j;
  }

  /** What an item carries beside its props: its look and its taps. A part drawn as atoms takes no taps of places:
   *  `slots` is then the places whose taps went to the atoms that show them, and any other is lost and said so. */
  extras(it: Item, slots: boolean | ReadonlySet<string> = true): [string, string][] {
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
    const wired = Object.entries(it.actions ?? {}).filter(([k, a]) => !!a && isPlaceKey(k));
    const lost = slots === true ? [] : wired.filter(([k]) => !(slots instanceof Set && slots.has(k)));
    if (lost.length) this.warn("slot", "a tap on a place inside a part drawn as atoms is not kept", it.id);
    const taps = slots === true
      ? wired.map(([slot, a]) => [slot, this.action(a, it.id)] as const).filter((x): x is readonly [string, string] => !!x[1])
      : [];
    /* a family's action runs for every place of it that has none of its own, told which (`slot`) */
    const prefixes = new Set(familiesOf(it).map((f) => f.prefix));
    const families = slots === true ? Object.entries(it.actions ?? {}).flatMap(([k, a]) => (a && familyOfKey(k) !== null && prefixes.has(familyOfKey(k)!) ? [[familyOfKey(k)!, this.run(a, it.id, ["slot"])] as const] : [])) : [];
    if (slots !== true && Object.keys(it.actions ?? {}).some((k) => familyOfKey(k) !== null)) this.warn("slot", "the action for every entry of a part drawn as atoms is not kept", it.id);
    const own = `{ ${taps.map(([s, f]) => `${str(s)}: ${f}`).join(", ")} }`;
    if (families.length) {
      this.kit.add("slotTaps");
      out.push(["taps", `slotTaps(${own}, { ${families.map(([prefix, f]) => `${str(prefix)}: (slot) => ${f}`).join(", ")} })`]);
    } else if (taps.length) out.push(["taps", own]);
    out.push(...this.events(it));
    return out;
  }

  /** what a capability view's slot sends (`onEvent(name, payload)`), each event running the design's action on it */
  slotEvents(it: Item): [string, string][] {
    const cases = Object.entries(it.actions ?? {}).flatMap(([key, a]) => {
      const name = eventOfKey(key);
      const declared = name !== null ? eventsOf(it).find((e) => e.name === name) : undefined;
      if (!a || !declared) return [];
      const fields = `E${++this.n.event}`;
      this.consts.push(`const ${fields}: EventFields = ${expr(declared.payload ?? {})};`);
      this.kit.add("eventOf").add("type EventFields");
      const run = this.run(a, it.id, [`event: eventOf(${fields}, payload)`]);
      return run ? [`if (name === ${str(declared.name)}) ${run};`] : [];
    });
    return cases.length ? [["onEvent", `(name: string, payload: unknown) => { ${cases.join(" ")} }`]] : [];
  }

  /** The part's events as the kit component hands them out (`onSettled`, `onReorder`…), each running the design's action
   *  on it with what it carries (`event`), cut down to what the part declares. */
  events(it: Item): [string, string][] {
    const out: [string, string][] = [];
    const def = partBySlug(it.component);
    for (const [key, a] of Object.entries(it.actions ?? {})) {
      const name = eventOfKey(key);
      const declared = name !== null ? eventsOf(it).find((e) => e.name === name) : undefined;
      if (!a || !declared || !def) continue;
      const ep = isNative(def.slug) ? eventProp(def.slug, declared.name) : null;
      if (!ep) {
        /* a capability view's slot sends its events itself (`onEvent`) */
        if (!this.o.slots?.names[it.id]) this.warn("event", `the part does not send its event "${declared.name}" on a phone: the action on it is not run`, it.id);
        continue;
      }
      this.kit.add("eventOf");
      const fields = `E${++this.n.event}`;
      this.consts.push(`const ${fields}: EventFields = ${expr(declared.payload ?? {})};`);
      this.kit.add("type EventFields");
      const run = this.run(a, it.id, [`event: eventOf(${fields}, ${ep.payload})`]);
      if (run) out.push([ep.prop, `(${ep.params}) => ${run}`]);
    }
    return out;
  }

  /* ---------- props ---------- */

  /** A picture the document holds as data, as the screen reads it: the file the app bundles it as, from the images
   *  module. One the export does not write as a file is left out, and reported. */
  picture(data: string, part: string): Raw | string {
    const name = this.o.images?.name(data);
    if (!name) {
      this.warn("image", "a picture held in the document is left out (PNG, JPEG, GIF and WebP are written as files the app bundles)", part);
      return "";
    }
    this.pictures = true;
    return new Raw(`IMAGES.${name}`);
  }

  /** the pictures a tree of atoms holds as data, each the file the app bundles it as */
  pictured(v: unknown, part: string | undefined): unknown {
    if (typeof v === "string") return v.startsWith("data:image/") && this.o.images ? this.picture(v, part ?? "") : v;
    if (Array.isArray(v)) return v.map((x) => this.pictured(x, part));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.pictured(x, part)]));
    return v;
  }

  /** a part's own props as the kit takes them: what differs from the kit's defaults, under the kit's names */
  props(def: PartDef, it: Item): [string, string][] {
    const values = propValues(def, it.props);
    const defaults = KIT_PARTS[def.slug]?.defaults ?? {};
    const out: [string, string][] = [];
    const bound = new Set(Object.keys(it.bind ?? {}));
    for (const d of def.props) {
      const key = kitPropName(def.slug, d.key);
      let v = values[d.key];
      if (SET_ONLY.has(d.key) && !(it.props && typeof it.props[d.key] === "number")) continue;
      if (d.kind === "image" && typeof v === "string" && v.startsWith("data:")) v = this.picture(v, it.id);
      if (d.kind === "list" && Array.isArray(v)) v = (v as Record<string, unknown>[]).map((row) => (typeof row.image === "string" && row.image.startsWith("data:") ? { ...row, image: this.picture(row.image, it.id) } : row));
      if (def.slug === "svg" && d.key === "markup" && typeof v === "string" && v) v = svgMarkup(v, it.id) ?? "";
      let code: string | undefined;
      const ref = it.bind?.[d.key];
      if (typeof ref === "string" && bound.has(d.key)) code = this.boundProp(d, ref, v, it.id);
      else if (this.runtime && d.kind === "text" && typeof v === "string" && v.includes("{{")) code = fillCode(this.$, v);
      const set = this.facts.setProps.get(it.id);
      /* a row picked moves the chosen one where the part leaves that to whoever draws it (`selects`) */
      if ((set?.has(d.key) || (d.key === "selected" && this.selects(def, it))) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
        this.uses.app = true;
        code = `app.prop(${str(it.id)}, ${str(d.key)}, ${code ?? expr(v)})`;
      }
      if (code === undefined && !SET_ONLY.has(d.key) && same(v, defaults[key])) continue;
      out.push([key, code ?? expr(v)]);
    }
    for (const n of iconNamesOf(def.slug, values)) this.icons.add(n);
    return out;
  }

  /** whether the part's chosen row is the app's to move when one is tapped: it is not bound to anything */
  selects(def: PartDef, it: Item): boolean {
    return SELECTS_BY_PROP.has(def.slug) && it.bind?.selected === undefined;
  }

  /** a prop that follows a variable or an expression, in the kind of value the prop takes */
  boundProp(d: PartDef["props"][number], ref: string, design: unknown, part: string): string | undefined {
    if (!ref.startsWith("=")) {
      if (d.kind === "list" || d.kind === "table" || !(typeof design === "string" || typeof design === "number" || typeof design === "boolean")) return undefined;
      this.uses.app = true;
      return `app.bound(${str(ref)}, ${expr(design)})`;
    }
    const e = ref.slice(1);
    if (!this.runtime) {
      this.warn("binding", "a prop bound to an expression keeps the design's value without the app's runtime", part);
      return undefined;
    }
    const read = readOf(d.kind);
    if (!read) {
      this.warn("binding", "a table bound to an expression keeps the design's rows", part);
      return undefined;
    }
    /* what follows the expression: the design's value, as the kind of value the prop takes, and its range or choices */
    const extra =
      d.kind === "bool"
        ? [expr(!!design)]
        : d.kind === "number"
          ? [expr(typeof design === "number" ? design : 0), expr(d.min), expr(d.max)]
          : d.kind === "enum"
            ? [expr(d.options.map((o) => (typeof o === "string" ? o : o.value))), expr(String(design ?? ""))]
            : d.kind === "list"
              ? [expr(design), expr(d.max ?? 50)]
              : [];
    if (read === "rows") this.kit.add("rowsOf");
    return readCode(read, this.$, e, extra);
  }

  /** An input's wiring: the form field it fills, the variable it is bound to, or what a condition asks of it. What it
   *  says takes the place of the design's value and error. */
  input(def: PartDef, it: Item, props: [string, string][]): [string, string][] {
    const slug = def.slug;
    /* the inputs the kit's own controls take a value and a change for; another part that declares an input keeps its
       value to itself on a phone, and says so where something reads it */
    const known = INPUT_PROP[slug] !== undefined && RN_INPUTS.has(slug);
    if (INPUT_PROP[slug] !== undefined && !known && ((it.field && this.ctx.form) || (typeof it.bind?.[INPUT_PROP[slug]] === "string" && !it.bind[INPUT_PROP[slug]].startsWith("=")) || this.facts.filled.has(it.id))) {
      this.warn("input", "what is entered here does not reach its variable or form on a phone", it.id);
      return [];
    }
    const key = known ? INPUT_PROP[slug] : undefined;
    const form = this.ctx.form;
    if (it.field && form && (key !== undefined || FILE_INPUTS.has(slug) || slug === "date-picker")) {
      const f = `${form.v}`;
      const field = str(it.field);
      const out: [string, string][] = [];
      if (this.facts.filled.has(it.id)) this.formInputs.push([it.id, `${f}.value(${field})`]);
      if (slug === "file-upload") {
        this.bind.add("pickFile").add("fileName");
        const accept = propValues(def, it.props).accept;
        out.push(["onPress", `() => void pickFile(${expr(typeof accept === "string" ? accept : "")}).then((file) => file && ${f}.set(${field}, file))`], ["chosen", `fileName(${f}.value(${field}))`]);
      } else if (slug === "date-picker") out.push(["value", `${f}.text(${field})`], ["onChange", `(v: string) => ${f}.set(${field}, v)`]);
      else if (slug === "switch" || slug === "checkbox") out.push(["checked", `!!${f}.value(${field})`], ["onValueChange", `(v: boolean) => ${f}.set(${field}, v)`]);
      else if (def.input?.kind === "bool") out.push([kitPropName(slug, key!), `!!${f}.value(${field})`], ["onValueChange", `(v: boolean) => ${f}.set(${field}, v)`]);
      else if (def.input?.kind === "number") out.push(["value", `Number(${f}.value(${field}) ?? 0)`], ["onValueChange", `(v: number) => ${f}.set(${field}, v)`]);
      else if (slug === "select" || slug === "radio-group") {
        this.kit.add("optionOf");
        const items = props.find(([k]) => k === "items")?.[1] ?? expr(propValues(def, it.props).items);
        out.push(["selected", `optionOf(${items}, ${f}.value(${field}))`], ["onSelect", `(_i: number, label: string) => ${f}.set(${field}, label)`]);
      } else if (def.input?.kind === "choice") {
        /* a choice of the D3 pickers: the field holds the words of the option, as a select's does */
        this.kit.add("optionOf");
        out.push([kitPropName(slug, key!), `optionOf(${this.optionRows(def, it, props)}, ${f}.value(${field}))`], ["onSelect", `(_i: number, label: string) => ${f}.set(${field}, label)`]);
      } else if (def.input?.kind === "choices" && def.props.find((d) => d.key === key)?.kind === "list") {
        /* a list of words (the tags): the field holds the words, as the preview sends them */
        out.push([kitPropName(slug, key!), `(${f}.value(${field}) as string[] | undefined) ?? ${expr(linesOf(propValues(def, it.props)[key!]))}`], ["onChange", `(v: string[]) => ${f}.set(${field}, v)`]);
      } else {
        out.push([kitPropName(slug, key ?? "value"), `${f}.text(${field})`], ["onChangeText", `(v: string) => ${f}.set(${field}, v)`]);
        const kind = this.fieldKind(form.id, it.field);
        if (slug === "input" && (kind === "date" || kind === "datetime")) out.push(["type", str(kind)]);
      }
      /* its error and message, and required as the contract says, by its field states (parts/fieldState.ts) */
      const apart = (this.shown ??= messagesShown(this.all)).has(`${form.id}:${it.field}`);
      for (const [k, v] of formStateProps(def, { invalid: `!!${f}.error(${field})`, ...(apart ? {} : { message: `${f}.error(${field}) ?? ""` }), required: !!this.fieldSpec(form.id, it.field)?.required })) out.push([kitPropName(slug, k), v === true ? "true" : v]);
      out.push(["testID", str(`field:${it.field}`)]);
      return out;
    }
    if (key === undefined) return [];
    const varId = it.bind?.[key];
    const toVar = typeof varId === "string" && !varId.startsWith("=");
    if (!toVar && !this.facts.filled.has(it.id)) return [];
    this.uses.app = true;
    const write = (type: string) => `(v: ${type}) => app.input(${str(it.id)}, v${toVar ? `, ${str(varId)}` : ""})`;
    if (slug === "switch" || slug === "checkbox" || def.input?.kind === "bool") return [["onValueChange", write("boolean")]];
    if (def.input?.kind === "number") return [["onValueChange", write("number")]];
    if (slug === "select" || slug === "radio-group") return [["onSelect", `(_i: number, label: string) => app.input(${str(it.id)}, label${toVar ? `, ${str(varId)}` : ""})`]];
    if (def.input?.kind === "choice") return this.choiceToVar(def, it, props, key, toVar ? varId : undefined);
    if (def.input?.kind === "choices" && def.props.find((d) => d.key === key)?.kind === "list") {
      /* a list of words in a variable is one a line, as the preview writes it, and the control reads it back so */
      const shown: [string, string][] = toVar ? [[kitPropName(slug, key), `app.bound(${str(varId)}, ${expr(linesOf(propValues(def, it.props)[key]))})`]] : [];
      return [...shown, ["onChange", `(v: string[]) => app.input(${str(it.id)}, v.join("\\n")${toVar ? `, ${str(varId)}` : ""})`]];
    }
    return [["onChangeText", write("string")]];
  }

  /** the rows a choice input picks from, as code: its list prop as printed, or the words it lists with commas */
  optionRows(def: PartDef, it: Item, props: [string, string][]): string {
    const key = def.input?.options ?? "items";
    /* rows read from data are found among as they are read; the design's own by their words */
    const read = it.bind?.[key] !== undefined ? props.find(([k]) => k === kitPropName(def.slug, key))?.[1] : undefined;
    return read ?? expr(optionsOf(it).map((label) => ({ label })));
  }

  /** A D3 choice bound to a variable: a text variable holds the words of the option chosen and the control finds them
   *  among its options (lib/interact.ts `writeField`, `boundValue`), any other its place among them. */
  choiceToVar(def: PartDef, it: Item, props: [string, string][], key: string, varId: string | undefined): [string, string][] {
    const words = !!varId && this.doc.vars?.find((v) => v.id === varId)?.type === "text";
    const to = varId ? `, ${str(varId)}` : "";
    if (!words) return [["onSelect", `(i: number) => app.input(${str(it.id)}, i${to})`]];
    this.kit.add("optionOf");
    const design = propValues(def, it.props)[key];
    const label = typeof design === "number" ? (optionsOf(it)[design] ?? "") : "";
    return [
      [kitPropName(def.slug, key), `optionOf(${this.optionRows(def, it, props)}, app.bound(${str(varId!)}, ${expr(label)}))`],
      ["onSelect", `(_i: number, label: string) => app.input(${str(it.id)}, label${to})`],
    ];
  }

  /** how a form's field is entered, as its operation's body says */
  fieldKind(formId: string, field: string): string | undefined {
    return this.fieldSpec(formId, field)?.kind;
  }

  /** the fields whose error the design shows in a line of its own, by `<form id>:<field>` */
  shown?: Set<string>;

  /** a form's field as its operation's body says it is entered and checked */
  fieldSpec(formId: string, field: string): FieldSpec | undefined {
    const g = this.all.find((x) => x.id === formId);
    const e = g?.form ? endpointOf(this.doc.api, g.form.operationId) : undefined;
    return e && this.doc.api ? formFields(this.doc.api, e).find((s) => s.name === field) : undefined;
  }

  /** A tree of atoms (a split) as elements, the root wearing the item's look and taps. `at` walks the tree it was
   *  drawn from beside it, so each tap of a place lands on the atom the split gives it (lib/kits.ts `splitTaps`). */
  tree(n: PlainNode, root?: Item, dir = "column", stretch = false, at?: AtomTaps): J {
    const name = (NATIVE as Record<string, string>)[n.slug];
    if (!name) {
      this.kit.add("Placeholder");
      return el("Placeholder", [["part", str(n.slug)]]);
    }
    this.kit.add(name);
    for (const i of iconNamesOf(n.slug, n.props)) this.icons.add(i);
    const props: [string, string][] = Object.entries(n.props).map(([k, v]) => [k, expr(this.pictured(v, root?.id))]);
    if (n.fill) props.push(["fill", str(n.fill)]);
    if (n.textColor) props.push(["textColor", str(n.textColor)]);
    if (n.corners) props.push(["corners", expr(n.corners)]);
    if (n.look) props.push(["look", expr(cleanLook(n.look))]);
    if (root) props.push(...this.extras(root, at?.placed ?? false));
    const placed = at && at.actions.get(at.node);
    const tap = placed && this.action(placed, at.owner);
    if (tap) props.push(["onPress", tap]);
    const own = (n.props.layout as string | undefined) ?? (n.slug === "box" ? "column" : "free");
    const kids = (n.kids ?? []).map((k, i) => this.tree(k, undefined, own, n.props.align === "stretch", at && at.node.kids?.[i] ? { ...at, node: at.node.kids[i] } : undefined));
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
    /* a capability view is its slot (src/custom/slots), handed what the design's stand-in is and drawing it until written */
    const slot = def.capability ? this.o.slots?.names[it.id] : undefined;
    if (slot) {
      this.slots.add(slot);
      const size = this.size(it);
      const given = Object.entries(treeOf(def, it.props).props ?? {}).filter(([k, v]) => /^[a-z][A-Za-z0-9]*$/.test(k) && k !== "className" && k !== "style" && k !== "width" && k !== "height" && (v === null || ["string", "number", "boolean", "object"].includes(typeof v)));
      /* the stand-in is the kit's own drawing of the view where it has one (the camera's, the map's, the call's), its
         props the part's as the kit takes them */
      const standIn = isNative(def.slug) ? NATIVE[def.slug] : "Placeholder";
      this.kit.add(standIn);
      const drawn = isNative(def.slug) ? el(standIn, [...this.props(def, it), ...this.extras(it)]) : el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)]]);
      return el(slot, [...given.map(([k, v]) => [k, expr(v)] as [string, string]), ["width", expr(size.w)], ["height", expr(size.h)], ...this.slotEvents(it)], [drawn]);
    }
    if (isNative(def.slug)) {
      const name = NATIVE[def.slug];
      this.kit.add(name);
      /* what the layout says of a layout's own size stands over the part's props of the same name */
      const own = new Set(layout.map(([k]) => k));
      const props = this.props(def, it).filter(([k]) => !own.has(k));
      const wired = this.input(def, it, props);
      const replaced = new Set(wired.map(([k]) => k));
      const extras = this.extras(it).filter(([k]) => !replaced.has(k));
      if (this.selects(def, it)) {
        this.uses.app = true;
        extras.push(["onSelect", `(i: number) => app.setProp(${str(it.id)}, "selected", i)`]);
      }
      /* a menu a tap opens or closes: its popup follows the app's memory, and the visitor's own opening is kept there */
      const group = this.facts.groupOf.get(it.id);
      if (group && this.facts.opened.has(group) && OPENS_BY_PROP.has(def.slug)) {
        this.uses.app = true;
        extras.push(["open", `app.opened(${str(group)})`], ["onOpenChange", `(on: boolean) => app.setOpened(${str(group)}, on)`]);
      }
      const submits = !!this.ctx.form && this.submits(it);
      /* a submit button is held, and loads, while its form submits (parts/fieldState.ts) */
      const submitting: [string, string][] = submits && this.ctx.form ? formStateProps(def, { submitting: `${this.ctx.form.v}.submitting` }).map(([k, v]) => [kitPropName(def.slug, k), v === true ? "true" : v]) : [];
      const held = new Set(submitting.map(([k]) => k));
      if (submits && this.ctx.form && !replaced.has("testID")) submitting.push(["testID", str(`submit:${this.ctx.form.id}`)]);
      return el(name, [...props.filter(([k]) => !replaced.has(k) && !held.has(k)), ...layout, ...extras, ...wired, ...submitting], kids);
    }
    if (it.bind && Object.keys(it.bind).length) this.warn("binding", "a bound prop of a part drawn as atoms keeps the design's value", it.id);
    if (def.atoms && !kids.length) {
      this.warn("atoms", `drawn as the atoms it splits into (${def.slug})`, it.id);
      const styles = styleContext(this.doc.styles);
      const p = reader(def, it.props);
      const tree = def.atoms(p, kitLookOf(normalizeTheme(this.doc.theme, styles), styles)) as Node;
      const taps = splitTaps(def, p, tree, it);
      return this.tree(plainTree(tree, getLang()), it, "column", false, { node: tree, actions: taps.actions, placed: taps.placed, owner: it.id });
    }
    this.kit.add("Placeholder");
    this.warn(kids.length ? "holder" : "placeholder", `${def.slug} has no component in the kit`, it.id);
    const size = this.size(it);
    return el("Placeholder", [["part", str(def.slug)], ["name", str(def.name)], ["width", expr(size.w)], ["height", expr(size.h)], ...layout, ...this.extras(it)], kids);
  }

  /** whether a part's tap submits a form */
  submits(it: Item): boolean {
    return [it.action, ...Object.values(it.actions ?? {})].some((a) => a?.effects?.some((e) => e.do === "submit"));
  }

  size(it: Item) {
    const def = partBySlug(it.component);
    return { w: Math.round(this.widths[it.id] ?? def?.w ?? 120), h: Math.round(this.widths[`${it.id}:h`] ?? def?.h ?? 40) };
  }

  /* ---------- layout ---------- */

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

  /** whether a run is a list of data that scrolls on its own: a repeat over data standing loose on its screen */
  scrolls(run: Group): boolean {
    return this.runtime && run.repeat?.data !== undefined && !run.inFlow && !!flowOf(run);
  }

  /** a run a layout holds: the part, and nested in it what it lays out */
  flow(run: Group, parent?: Flow, origin = { x: 0, y: 0 }): J {
    if (run.expandedFrom !== undefined && parent) return this.instance(run);
    const asked = parent ? this.cell(run, parent, origin) : [];
    const boxed = (j: J): J => (asked.length ? (this.kit.add("Cell"), el("Cell", asked, [j])) : j);
    /* a split view: the kit's, its two panes in it, each a box filling its pane (both show: no tab's visibility rule) */
    if (run.items.length === 1 && splitOf(run)) {
      const it = run.items[0];
      const panes = panesOfSplit(this.all, run.id);
      const held = PANE_SIDES.flatMap((side) => (panes[side] ? [this.flow(panes[side]!, undefined, { x: panes[side]!.x, y: panes[side]!.y })] : []));
      const kept: [string, string][] = it.props?.persist === true ? [["persistKey", str(`m3e-split:${it.id}`)]] : [];
      /* the kit has no storage on the device of its own: the share is kept while the app runs */
      if (kept.length) this.warn("input", "the visitor's share of a split view is remembered while the app runs, not across launches", it.id);
      return this.visible(run, boxed(this.part(it, held, kept)));
    }
    const flow = run.items.length === 1 ? flowOf(run) : null;
    if (!flow) {
      if (run.items.length === 1) return this.visible(run, boxed(this.part(run.items[0])));
      this.rn.add("View");
      return this.visible(run, boxed(el("View", [["style", expr({ flexDirection: run.axis === "x" ? "row" : "column", gap: GAP })]], run.items.map((x) => this.part(x)))));
    }
    const kids = this.all.filter((g) => g.inFlow === run.id && !g.locked);
    const flowing = kids.some((k) => !childLayoutOf(k.items.length === 1 ? k.items[0] : undefined).absolute);
    const box = { x: run.x + flow.inset.l, y: run.y + flow.inset.t };
    /* a form's parts read it as `form` */
    const outer = this.ctx;
    const form = run.form && this.runtime ? this.formOf(run) : undefined;
    if (form) this.ctx = { ...outer, $: form.$, form: { v: form.v, id: run.id } };
    try {
      const hugs = this.hugs(run, flow, parent, flowing);
      const scrolls = this.scrolls(run);
      /* a dock with an auto layout switches its tabs itself: what each tab holds, the kit showing the chosen one */
      const held =
        isLaidOutDock(run) && run.repeat?.data === undefined
          ? dockPanes(run, kids).map(([pane, gs]) => (this.kit.add("DockPane"), el("DockPane", [["pane", expr(pane)]], this.held(run, gs, flow, box, scrolls))))
          : this.held(run, kids, flow, box, scrolls);
      /* a list that scrolls takes the room it is given down to the bars at the foot */
      const layout = scrolls ? [...hugs.filter(([k]) => k !== "hugHeight"), ["hugHeight", "false"] as [string, string]] : hugs;
      return this.visible(run, boxed(this.part(run.items[0], held, layout)));
    } finally {
      this.ctx = outer;
    }
  }

  /** what a layout holds: its parts; a region's, the design of each state, the one its data is in shown; a repeat's,
   *  its first part once per element of the list */
  held(run: Group, kids: Group[], flow: Flow, box: { x: number; y: number }, scrolls: boolean): J[] {
    const print = (gs: Group[]) => gs.map((k) => this.flow(k, flow, box));
    if (!this.runtime) {
      if (run.repeat?.data !== undefined) this.warn("binding", "a list of data draws its first element as the design has it without the app's runtime", run.items[0]?.id);
      return print(kids.filter((k) => !(run.states && (k.pane ?? 0) !== 0)));
    }
    const content = run.states ? kids.filter((k) => paneState(k) === "ready") : kids;
    const ready = run.repeat?.data !== undefined ? this.repeat(run, content, flow, box, scrolls) : print(content);
    if (!run.states) return ready;
    const src = run.states.source ? this.sources.get(run.states.source) : undefined;
    if (!src) return ready;
    const v = `r${++this.n.region}`;
    /* the scope is read only where a condition says when the region is empty */
    const options = regionOptions(src.def.load, run.states.emptyWhen, run.states.emptyWhen ? this.$ : "", true);
    this.bind.add("regionOf");
    this.declare(`const ${v} = regionOf(${src.v}, { ${options.join(", ")} });`);
    const branches: [string, J[]][] = [["ready", ready]];
    for (const state of ["loading", "empty", "error", "forbidden"] as const) {
      const design = kids.filter((k) => paneState(k) === state);
      if (design.length) branches.push([state, print(design)]);
    }
    return [cases(v, branches)];
  }

  /** a line the component (or the row it is in) reads before what it draws */
  declare(line: string) {
    if (this.ctx.locals) this.ctx.locals.push(line);
    else this.head.regions.push(line);
  }

  /** a repeat over data: its first part drawn once per element, each reading it as `item` */
  repeat(run: Group, content: Group[], flow: Flow, box: { x: number; y: number }, scroll: boolean): J[] {
    const template = templateOf(this.all, run);
    const rest = content.filter((k) => k !== template);
    const list = run.repeat?.data ?? "";
    const out: J[] = [];
    if (template) {
      if (this.ctx.item) this.warn("binding", "a list inside a row of another list is drawn inside it", run.items[0]?.id);
      const outer = this.ctx;
      const row = `$${++this.n.row}`;
      const locals: string[] = [];
      this.ctx = { ...outer, $: row, item: "item", locals };
      let drawn: J;
      try {
        drawn = this.flow(template, flow, box);
      } finally {
        this.ctx = outer;
      }
      const base = this.$;
      const name = /^data\.([A-Za-z_$][\w$]*)\./.exec(list)?.[1];
      const src = name ? this.sources.get(name) : undefined;
      const props: [string, string][] = [
        ["data", listCode(base, list, run.repeat?.limit)],
        ["keyOf", "keyOf"],
      ];
      if (scroll) props.push(["scroll", "true"]);
      if (flow.dir === "row") props.push(["horizontal", "true"]);
      const gap = Math.round(flow.gap ?? 0);
      if (scroll && gap) props.push(["gap", expr(gap)]);
      if (src && scroll && src.def.paging === "scroll") props.push(["onEndReached", `() => void ${src.v}.loadMore()`], ["loadingMore", `${src.v}.loadingMore`]);
      if (src && scroll && src.def.pullToRefresh) props.push(["onRefresh", `() => void ${src.v}.refresh()`], ["refreshing", `${src.v}.loading && ${src.v}.ready`]);
      if (scroll && this.room > 0) props.push(["room", expr(this.room)]);
      if (src && !scroll && (src.def.paging === "scroll" || src.def.pullToRefresh)) this.warn("binding", "paging by scrolling and pull to refresh work where the list has the screen's room", run.items[0]?.id);
      this.kit.add("Repeat");
      this.bind.add("keyOf");
      const fn: Code = {
        code: (d) => [`${pad(d)}{(item, index) => {`, `${pad(d + 1)}const ${row} = ${base}.with({ item, index });`, ...locals.map((l) => `${pad(d + 1)}${l}`), `${pad(d + 1)}return (`, jsx(drawn, d + 2), `${pad(d + 1)});`, `${pad(d)}}}`].join("\n"),
      };
      out.push(el("Repeat", props, [fn]));
    }
    out.push(...rest.map((k) => this.flow(k, flow, box)));
    return out;
  }

  /** a form: its hook, the scope its parts read it in */
  formOf(run: Group): { v: string; $: string } | undefined {
    const fb = run.form;
    if (!fb) return undefined;
    if (this.ctx.item) {
      this.warn("binding", "a form inside a row of a list is drawn without its form", run.items[0]?.id);
      return undefined;
    }
    const n = ++this.n.form;
    const v = `form${n}`;
    const $v = `$form${n}`;
    const fields: string[] = [];
    const initial: Record<string, unknown> = {};
    for (const g of this.all) {
      if (this.owner.get(g.id) !== run.id) continue;
      for (const it of g.items) {
        if (!it.field) continue;
        fields.push(it.field);
        const def = partBySlug(it.component);
        if (!def) continue;
        const values = propValues(def, it.props);
        const key = INPUT_PROP[def.slug];
        const raw = key ? values[key] : undefined;
        if ((def.slug === "select" || def.slug === "radio-group") && typeof raw === "number") {
          const rows = values.items as { label?: string }[] | undefined;
          if (raw >= 0 && rows?.[raw]?.label) initial[it.field] = rows[raw].label;
        } else if (def.input?.kind === "choice" && typeof raw === "number") {
          /* D3: a choice starts with the words of its option, a list of words with its words */
          const words = raw >= 0 ? optionsOf(it)[raw] : undefined;
          if (words) initial[it.field] = words;
        } else if (Array.isArray(raw) && RN_INPUTS.has(def.slug)) {
          if (raw.length) initial[it.field] = labelsOf(raw);
        } else if (typeof raw === "boolean" || typeof raw === "number" || (typeof raw === "string" && raw)) initial[it.field] = raw;
      }
    }
    const login = !!this.doc.api?.auth?.login && fb.operationId === this.doc.api.auth.login;
    const def = {
      id: run.id,
      operationId: fb.operationId,
      fields: [...new Set(fields)],
      ...(fb.params && Object.keys(fb.params).length ? { params: fb.params } : {}),
      ...(fb.values && Object.keys(fb.values).length ? { values: fb.values } : {}),
      ...(Object.keys(initial).length ? { initial } : {}),
      // eslint-disable-next-line unicorn/no-thenable -- an action body as data, never a function: nothing awaits it
      ...(fb.then ? { then: this.bodyData(fb.then) } : {}),
      ...(fb.catch ? { catch: this.bodyData(fb.catch) } : {}),
      ...(login ? { login: true } : {}),
    };
    this.consts.push(`const F${n}: FormDef = ${expr(def)};`);
    this.formInfos.push({ id: run.id, operationId: fb.operationId, fields: def.fields });
    this.bind.add("useFormFor").add("type FormDef");
    const outer = this.$;
    this.head.forms.push(`const ${v} = useFormFor(F${n}, ${outer});`, `const ${$v} = ${outer}.with({ form: ${v}.view });`);
    this.forms.set(run.id, v);
    return { v, $: $v };
  }

  /** an instance standing in a layout: a box of its size, its parts placed inside it */
  instance(run: Group): J {
    const kids = this.all.filter((g) => g.id.startsWith(`${run.id}/`) && !g.inFlow).sort((a, b) => a.y - b.y || a.x - b.x);
    const { width, height } = (run.items[0].props ?? {}) as { width?: number; height?: number };
    this.rn.add("View");
    return el("View", [["style", expr({ width: Math.round(width ?? 0), height: Math.round(height ?? 0) })]], kids.map((k) => this.at(k, { x: run.x, y: run.y })));
  }

  /** a run standing loose, placed from the top left of what it stands on */
  at(run: Group, origin: { x: number; y: number }): J {
    const flow = run.items.length === 1 ? flowOf(run) : null;
    const at = flow ? { x: run.x, y: run.y } : (layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y });
    const down: [string, string][] = this.scrolls(run) ? [["bottom", expr(this.foot)]] : [];
    this.kit.add("At");
    return el("At", [["x", expr(at.x - origin.x)], ["y", expr(at.y - origin.y)], ...down], [this.flow(run)]);
  }

  /** the screen's body: every run on it, the bars pinned to their edge */
  body(): J[] {
    const hosts = new Set(this.all.filter((r) => flowOf(r) || splitOf(r)).map((r) => r.id));
    const runs = [...this.all].sort((a, b) => a.y - b.y || a.x - b.x);
    const { h } = frameSizeOf(this.frame);
    const pins = new Map<string, string>();
    /* a screen that loads data keeps what stands at its foot on the glass, its list ending clear of it */
    const foot = this.runtime && this.frame.data?.length ? footOf(this.frame, this.all, this.widths) : undefined;
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      const first = run.items[0];
      const role = first ? roleOf(first) : undefined;
      const pin = pinOf(run, this.frame, this.widths);
      const top = Math.round(run.y - this.frame.y);
      if (run.items.length === 1 && first && fullWidth(first) && (role === "top" || role === "bottom" || role === "floatingBottom")) {
        const atFoot = role !== "top" && (pin === "foot" || top + this.size(first).h >= frameLengthOf(this.frame) - 1 || frameLengthOf(this.frame) === h);
        if (role === "top" ? top <= 32 || pin === "head" : atFoot) {
          pins.set(run.id, role === "floatingBottom" ? "floatingBottom" : role);
          if (role === "bottom") this.foot = Math.max(this.foot, this.size(first).h);
        }
      }
    }
    if (foot) this.room = Math.max(0, foot.room - this.foot);
    const out: J[] = [];
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      /* what an instance placed by a layout holds is printed with it */
      if (ownerIdOf(run.id) && this.all.some((g) => g.id === ownerIdOf(run.id) && g.expandedFrom !== undefined)) continue;
      const first = run.items[0];
      const edge = pins.get(run.id);
      if (edge) {
        this.kit.add("Pin");
        out.push(el("Pin", [["edge", str(edge)]], [this.flow(run)]));
        continue;
      }
      if (run.items.length === 1 && first && fullWidth(first)) {
        this.kit.add("At");
        out.push(el("At", [["y", expr(Math.round(run.y - this.frame.y))], ["span", "true"]], [this.flow(run)]));
        continue;
      }
      /* a button (or a FAB) at the foot of a screen of data floats there, as far above the foot as the design has it */
      const above = foot?.above.get(run.id);
      if (above !== undefined) {
        const at = layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y };
        this.kit.add("Pin");
        out.push(el("Pin", [["edge", str("floatingBottom")], ["x", expr(Math.round(at.x - this.frame.x))], ["bottom", expr(above)]], [this.flow(run)]));
        continue;
      }
      out.push(this.at(run, { x: this.frame.x, y: this.frame.y }));
    }
    return out;
  }

  /** the component's hooks, in the order they may read each other */
  hooks(): string[] {
    const out: string[] = [];
    if (this.uses.nav) out.push("const nav = useNav();");
    if (this.uses.app) out.push("const app = useApp();");
    if (this.runtime && (this.uses.$ || this.sources.size)) {
      const params = this.frame.params?.length ? "params" : "{}";
      if (this.frame.params?.length) {
        this.bind.add("useParams");
        out.push("const params = useParams(PARAMS, given);");
      }
      this.bind.add("useScreenScope");
      const sources = [...this.sources.values()];
      out.push(`const ${sources.length ? "$0" : "$"} = useScreenScope(${params});`);
      sources.forEach((s, i) => {
        this.bind.add("useSource").add("type SourceDef");
        const before = sources.slice(0, i).map((x) => x.v);
        out.push(`const ${s.v} = useSource(S${i + 1}, $0${before.length ? `.with({ data: { ${before.join(", ")} } })` : ""});`);
      });
      if (sources.length) out.push(`const $ = $0.with({ data: { ${sources.map((s) => (s.v === s.def.name ? s.v : `${NAME.test(s.def.name) ? s.def.name : str(s.def.name)}: ${s.v}`)).join(", ")} } });`);
    }
    out.push(...this.head.forms);
    /* the screen's taps, after its forms: what they act on is the screen's (its key and params, its data sources, its
       forms and what their inputs hold), the form a tap submits where the tap was made */
    if (this.uses.act) {
      this.kit.add("useAct");
      const parts: string[] = [];
      if (this.runtime) parts.push(`key: ${str(this.screens.keys.get(this.frame.id) ?? "")}`);
      if (this.runtime && this.frame.params?.length) parts.push("params");
      if (this.sources.size) parts.push(`sources: { ${[...this.sources.values()].map((s) => (s.v === s.def.name ? s.v : `${NAME.test(s.def.name) ? s.def.name : str(s.def.name)}: ${s.v}`)).join(", ")} }`);
      if (this.forms.size) parts.push(`forms: { ${[...this.forms].map(([g, v]) => `${str(g)}: ${v}`).join(", ")} }`);
      if (this.formInputs.length) parts.push(`inputs: { ${this.formInputs.map(([id, code]) => `${str(id)}: () => ${code}`).join(", ")} }`);
      out.push(`const act = useAct(${parts.length ? `{ ${parts.join(", ")} }` : ""});`);
    }
    out.push(...this.head.regions);
    if (this.uses.app) this.kit.add("useApp");
    out.push(...this.head.after);
    return out;
  }

  /** the data sources' definitions, as module constants */
  sourceConsts(): string[] {
    return [...this.sources.values()].map((s, i) => {
      const d = s.def;
      const pageSize = pageSizeOf(d, !!endpointOf(this.doc.api, d.operationId)?.pagination);
      const def = {
        name: d.name,
        operationId: d.operationId,
        ...(d.params && Object.keys(d.params).length ? { params: d.params } : {}),
        ...(d.body ? { body: d.body } : {}),
        ...(d.load === "demand" ? { load: "demand" } : {}),
        ...(pageSize ? { pageSize } : {}),
      };
      return `const S${i + 1}: SourceDef = ${expr(def)};`;
    });
  }
}

/** Every screen of a document as React Native code on the kit, read in the document's own styles */
export function printRnScreens(source: Doc, widths: Record<string, number>, o: RnPrintOptions = {}): RnScreens {
  /* what the printer calls further down (the layout, the parts) may read a style without being handed one: the
     document's are in reach for this one synchronous call */
  return withDocStyles(styleContext(source.styles), () => screensOf(source, widths, o));
}

function screensOf(source: Doc, widths: Record<string, number>, o: RnPrintOptions): RnScreens {
  const doc = expandDoc(withoutMarks(source), widths);
  const kitImport = o.kitImport ?? "../../kit";
  const runtime = !!o.runtime;
  let frames = doc.frame === "phone" ? doc.frames : [];
  if (!frames.length && doc.groups.length) {
    const { l, t, r, b } = unionRect(doc.groups.map((g) => groupBounds(g, widths)));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(b - t)) }];
  }
  /* a screen's component is never the kit's Screen, which its file draws with (its key, "Back" and the like, starts
     with a capital, so it is never the kit's "back", "link" or "none") */
  const taken = new Set<string>(["screen"]);
  const keys = new Set<string>();
  const screens: Screens = { keys: new Map(), names: new Map() };
  frames.forEach((f, i) => {
    const component = nameOf(f.name, `Screen${i + 1}`, taken, "Screen");
    screens.names.set(f.id, component);
    screens.keys.set(f.id, nameOf(f.name, `screen${i + 1}`, keys));
  });
  const warnings: RnWarning[] = [];
  const icons = new Set<string>();
  /* with the runtime a region draws every state's design, and shows the one its data is in; a dock with an auto layout
     gets what each of its tabs holds (../panes.ts) */
  const offTab = offTabOf(runtime ? doc.groups.map((g) => (g.states ? { ...g, states: undefined } : g)) : doc.groups, widths);
  const facts = factsOf(doc);
  /* the kinds of part on each screen: what of the style is not drawn here is reported with the screens it touches */
  const kinds: StyleScreen[] = [];
  const printed = frames.map((frame): RnScreen => {
    const all = doc.groups.filter((g) => (frames.length === 1 && frame.id === "canvas") || frameOfPart(g, doc.groups, frames, widths)?.id === frame.id).filter((g) => !offTab.has(g.id)).flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]));
    kinds.push({ name: frame.name, slugs: kindsIn(all) });
    const p = new ScreenPrinter(doc, frame, widths, all, screens, warnings, o, facts);
    const body = p.body();
    p.icons.forEach((n) => icons.add(n));
    const { w, h } = frameSizeOf(frame);
    const length = frameLengthOf(frame);
    const bg = frame.bg && COLOR_TOKENS.some((t) => t.key === frame.bg) ? frame.bg : undefined;
    const screen = el("Screen", [...(bg ? ([["bg", str(bg)]] as [string, string][]) : []), ["width", expr(w)], ["height", expr(h)], ...(length > h ? ([["length", expr(length)]] as [string, string][]) : [])], body);
    const hooks = p.hooks();
    if (p.uses.nav) p.kit.add("useNav");
    const component = screens.names.get(frame.id)!;
    const params = runtime && frame.params?.length ? frame.params : undefined;
    const consts = [...(params ? [`const PARAMS: ParamSpec[] = ${expr(params.map((x) => ({ name: x.name, ...(x.type ? { type: x.type } : {}), ...(x.example !== undefined ? { example: x.example } : {}) })))};`] : []), ...p.sourceConsts(), ...p.consts];
    if (params) p.bind.add("type ParamSpec");
    const kitNames = [...p.kit].sort((a, b) => a.replace(/^type /, "").localeCompare(b.replace(/^type /, "")));
    const bindNames = [...p.bind].sort((a, b) => a.replace(/^type /, "").localeCompare(b.replace(/^type /, "")));
    const imports = [
      ...(p.rn.size ? [`import { ${[...p.rn].sort().join(", ")} } from "react-native";`] : []),
      `import { ${kitNames.join(", ")} } from ${str(kitImport)};`,
      ...(p.slots.size && o.slots ? [`import { ${[...p.slots].sort().join(", ")} } from ${str(o.slots.from)};`] : []),
      ...(bindNames.length && o.runtime ? [`import { ${bindNames.join(", ")} } from ${str(o.runtime.bind)};`] : []),
      ...(p.pictures && o.images ? [`import { IMAGES } from ${str(o.images.from)};`] : []),
    ];
    const source = [
      "// Generated by M3E Canvas from the design. Do not edit: change the design and export again.",
      ...imports,
      "",
      ...(consts.length ? [...consts, ""] : []),
      params ? `export function ${component}({ params: given }: { params?: Record<string, unknown> }) {` : `export function ${component}() {`,
      ...hooks.map((l) => `  ${l}`),
      "  return (",
      jsx(screen, 2),
      "  );",
      "}",
      "",
    ].join("\n");
    return { id: frame.id, key: screens.keys.get(frame.id)!, component, width: w, height: h, source, ...(params ? { params } : {}), ...(frame.auth ? { auth: frame.auth } : {}), ...(p.formInfos.length ? { forms: p.formInfos } : {}) };
  });
  const flows = frames.filter((f) => typeof f.flow === "string" && f.flow).map((f) => ({ name: f.flow!, screen: screens.keys.get(f.id)! }));
  const keyOf = (id: string) => screens.keys.get(id);
  /* what of the document's style a phone does not draw (lib/styles/support.ts): after the parts, as one more kind */
  const styles = styleContext(source.styles);
  warnings.push(...styleDifferences({ theme: normalizeTheme(doc.theme, styles), styles, docStyles: source.styles, screens: kinds }, "mobile"));
  return {
    screens: printed,
    warnings,
    icons: [...icons].sort(),
    initial: flows[0]?.screen ?? printed[0]?.key ?? "screen1",
    flows,
    hidden: [...facts.hidden].sort(),
    vars: (doc.vars ?? []).map((v) => ({ id: v.id, name: v.name, type: v.type, value: v.value })),
    overlays: [...facts.overlays].flatMap((id) => keyOf(id) ?? []).sort(),
    tabs: [...facts.tabs].flatMap((id) => keyOf(id) ?? []).sort(),
    triggers: [...facts.opened].filter((g) => keepsTrigger(doc.groups.find((x) => x.id === g)?.items[0])).sort(),
  };
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
    `export const SCREENS: Record<string, ComponentType<{ params?: Record<string, unknown> }>> = { ${printed.screens.map((s) => `${str(s.key)}: ${s.component}`).join(", ")} };`,
    "",
    "/** the screen the app opens on: the first flow's, else the first screen */",
    `export const INITIAL = ${str(printed.initial)};`,
    "",
    "/** where each flow of the design starts */",
    `export const FLOWS: { name: string; screen: string }[] = ${expr(printed.flows)};`,
    "",
  ].join("\n");
}
