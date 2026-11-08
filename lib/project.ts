import { childLayoutFields } from "./flow";
import { standIn } from "./instances";
import { cleanLook } from "./look";
import { cleanStyles } from "./styles";
import { cleanDocIcons } from "./docIcons";
import { cleanApi } from "./api/clean";
import { cleanMocks } from "./mocks/clean";
import { cleanCapabilities } from "./capabilities/clean";
import { fitsType, startValueOf } from "./variables";
import { cleanMotion, cleanTrigger } from "./prototype";
import { H_CONSTRAINTS, V_CONSTRAINTS } from "./constraints";
import { COLOR_TOKENS, type ActionBody, Collection, ComponentDef, ComponentProp, ComponentSet, Condition, VarCollection, Doc, DocVar, Effect, Frame, Group, Item, Palette, VARIANTS, VarValue, isPlace, isTextToken } from "./tokens";
import { cleanDataSources, cleanExpr, cleanExprMap, cleanForm, cleanRegion, cleanScreenParams } from "./bindings/clean";
import { BARE_VERSION, PROJECT_VERSION, migrate, versionOf, type Migration } from "./migrations";
import { fields, withUnknown } from "./keep";
import { bindRule, conditionRule } from "./rules";
/* how deep a call's `then` and `catch` may hold calls of their own: the interpreter's own limit */
import { MAX_CALL_DEPTH } from "./actions/model";

/* A project file is the Doc as JSON, nothing more. Reading one back only checks
 * the shape the editor relies on. */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const validCorners = (c: unknown) => c === undefined || (isRecord(c) && ["tl", "tr", "bl", "br"].every((k) => Number.isFinite(c[k])));

/* A look is cleaned rather than checked (lib/look.ts): what is wrong in it is dropped, a number past its limits is brought
 * back, and a string that is not a color never reaches a style. A file is not refused for its looks. */

const validItem = (item: unknown) =>
  isRecord(item) &&
  validCorners(item.corners) &&
  (item.collapseOnScroll === undefined || typeof item.collapseOnScroll === "boolean") &&
  (item.textColor === undefined || isTextToken(item.textColor)) &&
  typeof item.id === "string" &&
  item.kind === "component" &&
  typeof item.component === "string" &&
  typeof item.label === "string" &&
  (typeof item.icon === "string" || item.icon === null) &&
  VARIANTS.some((variant) => variant.key === item.variant) &&
  (item.note === undefined || typeof item.note === "string") &&
  (item.props === undefined || isRecord(item.props));

const validGroup = (group: unknown) =>
  isRecord(group) &&
  typeof group.id === "string" &&
  Number.isFinite(group.x) &&
  Number.isFinite(group.y) &&
  (group.axis === "x" || group.axis === "y") &&
  (group.locked === undefined || typeof group.locked === "boolean") &&
  Array.isArray(group.items) &&
  /* an instance may come without the item standing in for it; `cleanInstance` gives it one */
  (group.items.length > 0 || group.instanceOf !== undefined) &&
  group.items.every(validItem);

const validFrame = (frame: unknown) =>
  isRecord(frame) &&
  typeof frame.id === "string" &&
  typeof frame.name === "string" &&
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  (frame.w === undefined || (Number.isFinite(frame.w) && (frame.w as number) > 0)) &&
  (frame.h === undefined || (Number.isFinite(frame.h) && (frame.h as number) > 0)) &&
  (frame.note === undefined || typeof frame.note === "string") &&
  (frame.place === undefined || isPlace(frame.place)) &&
  (frame.length === undefined || (Number.isFinite(frame.length) && (frame.length as number) > 0)) &&
  (frame.grownFrom === undefined || (Number.isFinite(frame.grownFrom) && (frame.grownFrom as number) > 0));

/* Behaviour is cleaned rather than checked: one effect of a wrong shape, from a file edited by hand,
 * is dropped and the rest of the file opens. Nothing here rejects a document. */

const isValue = (v: unknown): v is VarValue => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

const CONDITION = fields("filled", "expr", "var", "op", "value");

/** a condition as the one rule for conditions has it (lib/rules.ts), which operations hold it to as well */
function cleanCondition(c: unknown): Condition | undefined {
  if (!isRecord(c) || conditionRule(c)) return undefined;
  const keep = (built: Condition) => withUnknown(c, built, CONDITION);
  if (typeof c.filled === "string") return keep({ filled: c.filled });
  if (c.expr !== undefined) return keep({ expr: c.expr as string });
  return keep({ var: c.var as string, op: c.op as "eq" | "neq", value: c.value as VarValue });
}

/** the fields each kind of effect has: what `cleanEffect` checks, the rest of an effect kept as it came */
const EFFECT_FIELDS: Record<string, ReadonlySet<string>> = {
  show: fields("do", "part"),
  hide: fields("do", "part"),
  toggle: fields("do", "part"),
  open: fields("do", "part"),
  close: fields("do", "part"),
  setVar: fields("do", "var", "value", "expr"),
  toggleVar: fields("do", "var"),
  addVar: fields("do", "var", "by"),
  setProp: fields("do", "part", "prop", "value"),
  snackbar: fields("do", "message"),
  call: fields("do", "operationId", "args", "body", "then", "catch", "optimistic"),
  invoke: fields("do", "capability", "args", "then", "catch"),
  refresh: fields("do", "source"),
  loadMore: fields("do", "source"),
  submit: fields("do", "form"),
  signOut: fields("do"),
};
const OPTIMISTIC = fields("source", "remove", "patch");

/** An effect checked for its kind's fields. One of a kind this version does not know (a newer version's) is kept as
 *  it came, an opaque record every runtime skips (lib/interact.ts); one of a known kind and the wrong shape goes. */
function cleanEffect(e: unknown, depth = 0): Effect | undefined {
  if (!isRecord(e)) return undefined;
  const known = typeof e.do === "string" && Object.prototype.hasOwnProperty.call(EFFECT_FIELDS, e.do) ? EFFECT_FIELDS[e.do] : undefined;
  if (!known) return typeof e.do === "string" && e.do ? ({ ...e } as unknown as Effect) : undefined;
  const built = cleanKnownEffect(e, depth);
  return built ? withUnknown(e, built, known) : undefined;
}

function cleanKnownEffect(e: Record<string, unknown>, depth: number): Effect | undefined {
  switch (e.do) {
    case "show":
    case "hide":
    case "toggle":
    case "open":
    case "close":
      return typeof e.part === "string" ? { do: e.do, part: e.part } : undefined;
    case "setVar": {
      if (typeof e.var !== "string" || !isValue(e.value)) return undefined;
      const expr = e.expr === undefined ? undefined : cleanExpr(e.expr);
      return { do: "setVar", var: e.var, value: e.value, ...(expr ? { expr } : {}) };
    }
    case "toggleVar":
      return typeof e.var === "string" ? { do: "toggleVar", var: e.var } : undefined;
    case "addVar":
      return typeof e.var === "string" && typeof e.by === "number" && Number.isFinite(e.by) ? { do: "addVar", var: e.var, by: e.by } : undefined;
    case "setProp":
      return typeof e.part === "string" && typeof e.prop === "string" && isValue(e.value) ? { do: "setProp", part: e.part, prop: e.prop, value: e.value } : undefined;
    case "snackbar":
      return typeof e.message === "string" ? { do: "snackbar", message: e.message } : undefined;
    case "call": {
      if (typeof e.operationId !== "string" || !e.operationId || depth > MAX_CALL_DEPTH) return undefined;
      const args = cleanExprMap(e.args);
      const body = e.body === undefined ? undefined : cleanExpr(e.body);
      const then = cleanBody(e.then, depth + 1);
      const fail = cleanBody(e.catch, depth + 1);
      const o = isRecord(e.optimistic) && typeof e.optimistic.source === "string" ? withUnknown(e.optimistic, { source: e.optimistic.source, ...(e.optimistic.remove === true ? { remove: true } : {}), ...(cleanExprMap(e.optimistic.patch) ? { patch: cleanExprMap(e.optimistic.patch) } : {}) }, OPTIMISTIC) : undefined;
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      return { do: "call", operationId: e.operationId, ...(args ? { args } : {}), ...(body ? { body } : {}), ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}), ...(o && (o.remove || o.patch) ? { optimistic: o } : {}) };
    }
    case "invoke": {
      if (typeof e.capability !== "string" || !e.capability || depth > MAX_CALL_DEPTH) return undefined;
      const args = cleanExprMap(e.args);
      const then = cleanBody(e.then, depth + 1);
      const fail = cleanBody(e.catch, depth + 1);
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      return { do: "invoke", capability: e.capability.slice(0, 128), ...(args ? { args } : {}), ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}) };
    }
    case "refresh":
    case "loadMore":
      return typeof e.source === "string" && e.source ? { do: e.do, source: e.source } : undefined;
    case "submit":
      return { do: "submit", ...(typeof e.form === "string" && e.form ? { form: e.form } : {}) };
    case "signOut":
      return { do: "signOut" };
    default:
      return undefined;
  }
}

/** the fields named are the new ones: a field that is not of its type goes, and the rest stays as it came */
function cleaned<T extends Record<string, unknown>>(value: T, fields: Record<string, (v: unknown) => unknown>): T {
  const out: Record<string, unknown> = { ...value };
  for (const [key, clean] of Object.entries(fields)) {
    if (out[key] === undefined) continue;
    const v = clean(out[key]);
    if (v === undefined) delete out[key];
    else out[key] = v;
  }
  return out as T;
}

const cleanEffects = (list: unknown, depth = 0) => (Array.isArray(list) ? list.map((e) => cleanEffect(e, depth)).filter((e) => e !== undefined) : undefined);
/* what a prototype adds to a tap: an overlay, a part to scroll to, a motion, a trigger (lib/prototype.ts), and the
   params the screen it opens is given (lib/bindings) */
const PROTOTYPE = { overlay: (v: unknown) => (typeof v === "boolean" ? v : undefined), scrollTo: (v: unknown) => (typeof v === "string" ? v : undefined), motion: (v: unknown) => cleanMotion(v, true), params: cleanExprMap };
function cleanBody(a: unknown, depth = 0): ActionBody | undefined {
  return isRecord(a) && typeof a.to === "string" ? (cleaned(a, { effects: (l) => cleanEffects(l, depth), ...PROTOTYPE }) as unknown as ActionBody) : undefined;
}
const cleanAction = (a: unknown) => (isRecord(a) && typeof a.to === "string" ? cleaned(a, { effects: cleanEffects, when: cleanCondition, else: cleanBody, trigger: (v) => cleanTrigger(v, true), ...PROTOTYPE }) : undefined);

const cleanActions = (map: unknown) => {
  if (!isRecord(map)) return undefined;
  return Object.fromEntries(Object.entries(map).flatMap(([slot, a]) => {
    const action = cleanAction(a);
    return action ? [[slot, action]] : [];
  }));
};

/* a binding to a variable, or to an expression no longer than any other may be (lib/rules.ts) */
const cleanBind = (map: unknown) => (isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([, id]) => !bindRule(id))) : undefined);

/** one variable at most is the dark mode: the first that says so */
function onlyOneDark(vars: DocVar[]): DocVar[] {
  const first = vars.findIndex((v) => v.drives === "dark");
  /* only the flag goes: the others keep their collection and their values in its modes */
  return vars.map((v, i) => {
    if (!v.drives || i === first) return v;
    const { drives: _drives, ...rest } = v;
    return rest;
  });
}

const VAR = fields("id", "name", "type", "value", "drives", "collection", "modes");

function cleanVar(v: unknown): DocVar | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || (v.type !== "text" && v.type !== "number" && v.type !== "bool" && v.type !== "color")) return undefined;
  const type = v.type;
  const fallback = startValueOf(type);
  /* a start value of another type keeps the variable and loses the value */
  const value = fitsType(v.value, type) ? v.value : fallback;
  const modes = isRecord(v.modes) ? (Object.fromEntries(Object.entries(v.modes).filter(([, x]) => fitsType(x, type))) as Record<string, VarValue>) : undefined;
  const built: DocVar = {
    id: v.id,
    name: typeof v.name === "string" ? v.name : "",
    type,
    value,
    ...(v.drives === "dark" && type === "bool" ? { drives: "dark" as const } : {}),
    ...(typeof v.collection === "string" ? { collection: v.collection } : {}),
    ...(modes && Object.keys(modes).length ? { modes } : {}),
  };
  return withUnknown(v, built, VAR);
}

const VAR_COLLECTION = fields("id", "name", "modes", "dark");
const VAR_MODE = fields("id", "name");

/** a collection of variables, with modes that each have an id; one of no modes is given one */
function cleanVarCollection(c: unknown): VarCollection | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const modes = Array.isArray(c.modes) ? c.modes.flatMap((m) => (isRecord(m) && typeof m.id === "string" ? [withUnknown(m, { id: m.id, name: typeof m.name === "string" ? m.name : "" }, VAR_MODE)] : [])) : [];
  if (!modes.length) modes.push({ id: "default", name: "" });
  return withUnknown(c, { id: c.id, name: typeof c.name === "string" ? c.name : "", modes, ...(typeof c.dark === "string" && modes.some((m) => m.id === c.dark) ? { dark: c.dark } : {}) }, VAR_COLLECTION);
}

const cleanModes = (map: unknown) => (isRecord(map) ? (Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === "string")) as Record<string, string>) : undefined);

/** a part's constraints in a box, whichever of the two are of the right kind */
const CONSTRAINTS = fields("h", "v");

function cleanConstraints(v: unknown) {
  if (!isRecord(v)) return undefined;
  const h = H_CONSTRAINTS.includes(v.h as never) ? (v.h as (typeof H_CONSTRAINTS)[number]) : undefined;
  const vv = V_CONSTRAINTS.includes(v.v as never) ? (v.v as (typeof V_CONSTRAINTS)[number]) : undefined;
  return h || vv ? withUnknown(v, { ...(h ? { h } : {}), ...(vv ? { v: vv } : {}) }, CONSTRAINTS) : undefined;
}

const cleanItem = (it: Item) =>
  cleaned(it as unknown as Record<string, unknown>, {
    action: cleanAction,
    actions: cleanActions,
    bind: cleanBind,
    look: (v) => cleanLook(v, true),
    fill: (v) => (COLOR_TOKENS.some((t) => t.key === v) ? v : undefined),
    row: () => undefined,
    scope: () => undefined,
    constraints: cleanConstraints,
    field: (v) => (typeof v === "string" && v && v.length <= 200 ? v : undefined),
  }) as unknown as Item;

const cleanOverrides = (map: unknown) => (isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([, v]) => isValue(v))) : undefined);

/** what a kit's box remembers, whole or not at all: a mark of another shape only means the kit is left as it is */
const KIT = fields("slug", "variant", "auto", "sig");

function cleanKit(k: unknown) {
  if (!isRecord(k) || typeof k.slug !== "string" || typeof k.variant !== "string" || typeof k.auto !== "boolean" || typeof k.sig !== "string") return undefined;
  return withUnknown(k, { slug: k.slug, variant: k.variant, auto: k.auto, sig: k.sig }, KIT);
}

const REPEAT = fields("collection", "limit", "data", "sample");

function cleanRepeat(r: unknown) {
  if (!isRecord(r)) return undefined;
  /* a limit of the wrong kind goes, and the repeat stays */
  const limit = typeof r.limit === "number" && Number.isInteger(r.limit) && r.limit >= 0 ? { limit: r.limit } : {};
  if (typeof r.collection === "string") return withUnknown(r, { collection: r.collection, ...limit }, REPEAT);
  const data = cleanExpr(r.data);
  if (!data) return undefined;
  return withUnknown(r, { data, ...limit, ...(typeof r.sample === "number" && Number.isInteger(r.sample) && r.sample >= 1 && r.sample <= 12 ? { sample: r.sample } : {}) }, REPEAT);
}

const cleanGroup = (g: Group) =>
  ({
    ...cleaned(g as unknown as Record<string, unknown>, {
      name: (v) => (typeof v === "string" ? v : undefined),
      hidden: (v) => (typeof v === "boolean" ? v : undefined),
      showWhen: cleanCondition,
      pane: (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined),
      splitPane: (v) => (v === "first" || v === "second" ? v : undefined),
      instanceOf: (v) => (typeof v === "string" ? v : undefined),
      overrides: cleanOverrides,
      properties: cleanOverrides,
      repeat: cleanRepeat,
      form: (v) => cleanForm(v, cleanBody),
      states: cleanRegion,
      kit: cleanKit,
      expandedFrom: () => undefined,
      rowsOf: () => undefined,
    }),
    items: g.items.map(cleanItem),
  }) as unknown as Group;

const cleanFrame = (f: Frame) =>
  cleaned(f as unknown as Record<string, unknown>, {
    variantOf: (v) => (typeof v === "string" && v !== f.id ? v : undefined),
    /* a color role, never a class or a style of the file's own */
    bg: (v) => (COLOR_TOKENS.some((t) => t.key === v) ? v : undefined),
    deviceBars: (v) => (typeof v === "boolean" ? v : undefined),
    backgroundImage: (v) => (typeof v === "string" && v ? v : undefined),
    backgroundOpacity: (v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined),
    varModes: cleanModes,
    flow: (v) => (typeof v === "string" ? v : undefined),
    data: cleanDataSources,
    params: cleanScreenParams,
    auth: (v) => (v === "required" || v === "login" ? v : undefined),
  }) as unknown as Frame;

/** A scheme of the author's own: colors, and only colors, since every one of them is painted with and printed.
 *  One with anything else in it is not kept, and the document falls back to a scheme of the editor's. */
function cleanPalette(p: unknown): Palette | undefined {
  if (!isRecord(p) || typeof p.primary !== "string") return undefined;
  for (const [k, v] of Object.entries(p)) {
    if (k === "key" || k === "label") {
      if (typeof v !== "string") return undefined;
    } else if (typeof v !== "string" || !/^#[0-9a-f]{3,8}$/i.test(v)) return undefined;
  }
  return p as unknown as Palette;
}

/** a property of a component, whole or not at all */
const COMPONENT_PROP = fields("id", "name", "type", "value", "targets");

function cleanComponentProp(p: unknown): ComponentProp | undefined {
  if (!isRecord(p) || typeof p.id !== "string" || (p.type !== "text" && p.type !== "bool" && p.type !== "swap") || !Array.isArray(p.targets)) return undefined;
  const fallback = p.type === "bool" ? true : "";
  const value = p.type === "bool" ? (typeof p.value === "boolean" ? p.value : fallback) : typeof p.value === "string" ? p.value : fallback;
  const built: ComponentProp = { id: p.id, name: typeof p.name === "string" ? p.name : "", type: p.type, value, targets: p.targets.filter((t): t is string => typeof t === "string") };
  return withUnknown(p, built, COMPONENT_PROP);
}

const cleanStrings = (map: unknown): Record<string, string> | undefined => (isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === "string")) as Record<string, string> : undefined);

/** one definition, or nothing when it has no id to be called by. Its groups go through the same checks as a screen's. */
function cleanComponent(c: unknown): ComponentDef | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const groups = Array.isArray(c.groups) ? cappedNesting(c.groups.filter(validGroup).map((g) => cleanGroup(g as Group))) : [];
  const size = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 40);
  const props = Array.isArray(c.props) ? c.props.map(cleanComponentProp).filter((p) => p !== undefined) : [];
  const variant = cleanStrings(c.variant);
  const built: ComponentDef = {
    id: c.id,
    name: typeof c.name === "string" ? c.name : "",
    groups,
    w: size(c.w),
    h: size(c.h),
    ...(typeof c.set === "string" ? { set: c.set } : {}),
    ...(variant ? { variant } : {}),
    ...(props.length ? { props } : {}),
  };
  return withUnknown(c, built, COMPONENT);
}

const COMPONENT = fields("id", "name", "groups", "w", "h", "set", "variant", "props");
const COMPONENT_SET = fields("id", "name", "props");
const SET_PROP = fields("name", "values");

/** a set of variants: its properties and their values, as words */
function cleanComponentSet(c: unknown): ComponentSet | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const props = Array.isArray(c.props)
    ? c.props.flatMap((p) => (isRecord(p) && typeof p.name === "string" && Array.isArray(p.values) ? [withUnknown(p, { name: p.name, values: p.values.filter((v): v is string => typeof v === "string") }, SET_PROP)] : []))
    : [];
  return withUnknown(c, { id: c.id, name: typeof c.name === "string" ? c.name : "", props }, COMPONENT_SET);
}

const COLLECTION = fields("id", "name", "fields", "rows", "model");

/** one collection, or nothing when it has no id. A cell of another kind is read as words where it can be; a row that is no row goes. */
function cleanCollection(c: unknown): Collection | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const cell = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
  const names = Array.isArray(c.fields) ? c.fields.filter((f): f is string => typeof f === "string") : [];
  const rows = Array.isArray(c.rows) ? c.rows.filter(Array.isArray).map((r: unknown[]) => r.map(cell)) : [];
  return withUnknown(c, { id: c.id, name: typeof c.name === "string" ? c.name : "", fields: names, rows, ...(typeof c.model === "string" && c.model ? { model: c.model } : {}) }, COLLECTION);
}

/** the fields a part (`Item`) has */
const ITEM_FIELDS = fields("id", "kind", "label", "icon", "variant", "component", "props", "look", "navTabs", "note", "noteHistory", "collapseOnScroll", "fill", "textColor", "corners", "flowFill", "flowSize", "alignSelf", "flowAbsolute", "flowMin", "flowMax", "flowSpan", "constraints", "action", "actions", "bind", "field", "row", "scope");

/** An instance has a definition to draw from and one item standing in for it, whatever the file said.
 *  One of nothing known loses the link, and goes altogether if nothing else is left of it. */
function cleanInstance(g: Group, components: ComponentDef[] | undefined): Group | undefined {
  if (g.instanceOf === undefined) return g;
  const def = components?.find((c) => c.id === g.instanceOf);
  if (!def) {
    const { instanceOf: _gone, overrides: _too, ...rest } = g;
    return rest.items.length ? rest : undefined;
  }
  const made = standIn(def, g.x, g.y, g.id);
  const was = g.items[0];
  /* what the instance asks of the layout it stands in, where it goes and what it is said to be are its own, not the definition's */
  const own = was ? { ...childLayoutFields(was), ...(was.action ? { action: was.action } : {}), ...(typeof was.note === "string" ? { note: was.note } : {}) } : {};
  /* and so is what this version does not know of it */
  return { ...g, items: [withUnknown(was, { ...made.items[0], ...own, id: was?.id ?? made.items[0].id }, ITEM_FIELDS)] };
}

/** How many auto layouts deep a part may be laid out. Layout, the layers and the outline go down a nest one call a
 *  level, so a file nesting thousands of boxes would run the tab out of stack; no design comes near this. */
export const MAX_NESTING = 100;

/** The groups with every one laid out deeper than MAX_NESTING taken out of its layout: it stays where it is, on its
 *  own, with what it holds. The same array when none is that deep. */
export function cappedNesting(groups: Group[]): Group[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depth = new Map<string, number>();
  /* walked up without recursion, so the nest itself cannot run this out of stack; a loop counts as no deeper */
  const depthOf = (g: Group): number => {
    const chain: Group[] = [];
    const on = new Set<string>();
    let at: Group | undefined = g;
    while (at && !depth.has(at.id) && !on.has(at.id)) {
      chain.push(at);
      on.add(at.id);
      at = at.inFlow !== undefined ? byId.get(at.inFlow) : undefined;
    }
    let d = at && depth.has(at.id) ? depth.get(at.id)! : 0;
    for (let i = chain.length - 1; i >= 0; i--) depth.set(chain[i].id, chain[i].inFlow !== undefined && byId.has(chain[i].inFlow!) ? ++d : (d = 0));
    return depth.get(g.id)!;
  };
  if (!groups.some((g) => g.inFlow !== undefined && depthOf(g) > MAX_NESTING)) return groups;
  return groups.map((g) => {
    if (g.inFlow === undefined || depthOf(g) <= MAX_NESTING) return g;
    const { inFlow: _out, ...rest } = g;
    return rest;
  });
}

/** a document with what is wrong in its behaviour taken out; it always comes back whole */
export function cleanBehavior(doc: Doc): Doc {
  const out: Doc = { ...doc, frames: doc.frames.map(cleanFrame), groups: cappedNesting(doc.groups.map(cleanGroup)) };
  if (out.customPalette !== undefined) {
    const palette = cleanPalette(out.customPalette);
    if (palette) out.customPalette = palette;
    else delete out.customPalette;
  }
  if (out.components !== undefined) {
    if (Array.isArray(out.components)) out.components = out.components.map(cleanComponent).filter((c) => c !== undefined);
    else delete out.components;
  }
  if (out.collections !== undefined) {
    if (Array.isArray(out.collections)) out.collections = out.collections.map(cleanCollection).filter((c) => c !== undefined);
    else delete out.collections;
  }
  if (out.componentSets !== undefined) {
    if (Array.isArray(out.componentSets)) out.componentSets = out.componentSets.map(cleanComponentSet).filter((c) => c !== undefined);
    else delete out.componentSets;
  }
  /* a style of the document's own is validated as any style that comes from outside: what it says that a style may
     not is left out, and one that is no style goes. The theme naming one that is gone wears Material, as it does a
     built-in key this version does not know */
  if (out.styles !== undefined) {
    const styles = cleanStyles(out.styles);
    if (styles) out.styles = styles;
    else delete out.styles;
  }
  if (out.varCollections !== undefined) {
    if (Array.isArray(out.varCollections)) out.varCollections = out.varCollections.map(cleanVarCollection).filter((c) => c !== undefined);
    else delete out.varCollections;
  }
  if (out.varModes !== undefined) {
    const modes = cleanModes(out.varModes);
    if (modes) out.varModes = modes;
    else delete out.varModes;
  }
  /* the document's own icons are drawings, held to what the vector atom keeps; one that is not goes */
  if (out.icons !== undefined) {
    const icons = cleanDocIcons(out.icons);
    if (icons) out.icons = icons;
    else delete out.icons;
  }
  /* the API section is held to its shape and its bounds (lib/api/clean.ts); what is merely wrong in it stays, for the
     author to see and fix */
  if (out.api !== undefined) {
    const api = cleanApi(out.api);
    if (api) out.api = api;
    else delete out.api;
  }
  /* so are the mock settings (lib/mocks/clean.ts): their files are data URLs, their records plain JSON */
  if (out.mocks !== undefined) {
    const mocks = cleanMocks(out.mocks);
    if (mocks) out.mocks = mocks;
    else delete out.mocks;
  }
  /* the capabilities it uses and the ones it declares (lib/capabilities/clean.ts) */
  if (out.capabilities !== undefined) {
    const capabilities = cleanCapabilities(out.capabilities);
    if (capabilities) out.capabilities = capabilities;
    else delete out.capabilities;
  }
  const instances = (list: Group[]) => list.map((g) => cleanInstance(g, out.components)).filter((g): g is Group => g !== undefined && g.items.length > 0);
  out.groups = instances(out.groups);
  if (out.components) out.components = out.components.map((c) => ({ ...c, groups: instances(c.groups) }));
  if (out.vars === undefined) return out;
  if (Array.isArray(out.vars)) out.vars = onlyOneDark(out.vars.map(cleanVar).filter((v) => v !== undefined));
  else delete out.vars;
  return out;
}

/** whether a parsed file has the shape of a document the editor can open */
export const isProject = (value: unknown): value is Doc =>
  isRecord(value) && Array.isArray(value.groups) && Array.isArray(value.frames) && value.groups.every(validGroup) && value.frames.every(validFrame) && (value.promptOptions === undefined || (Array.isArray(value.promptOptions) && value.promptOptions.every((o) => typeof o === "string")));

/* ---------- the file format ---------- */

/** A document may also come bare, with no envelope, from a link or a hand-written file. */
export const PROJECT_FORMAT = "m3e-project";
export { BARE_VERSION, PROJECT_VERSION };

/** the file a document is saved as: a document read from a newer version keeps saying so (see `loadDocument`) */
export const projectFile = (doc: Doc) => {
  const newer = newerOf(doc);
  return { format: PROJECT_FORMAT, version: newer?.version ?? PROJECT_VERSION, document: (newer?.raw as Doc | undefined) ?? doc };
};

/** What `loadDocument` gives: the document, checked, cleaned and brought up to this version. */
export type Loaded = {
  doc: Doc;
  /** the version it was written at: what its envelope or its record says, else BARE_VERSION */
  version: number;
  /** the steps that ran on it, by name */
  migrated: string[];
  /** Set when it was written by a newer version than this one. It is shown as this version understands it, and is
   *  never written back: the editor and the MCP server open it read-only, and a copy of it keeps what it held. */
  newer?: number;
};

/** Documents of a newer version, by the object `loadDocument` gave: their version and what they held as written,
 *  so whatever passes the document on (the editor's store, a new project made of it) knows not to write it back,
 *  and a copy of it is the document as it came, not as this version understood it. */
const NEWER = new WeakMap<object, { version: number; raw: Record<string, unknown> }>();
const newerOf = (doc: object) => NEWER.get(doc);

/** the version of the format a document came in at, when that is newer than this app's (see `Loaded.newer`) */
export const newerVersionOf = (doc: unknown): number | undefined => (doc && typeof doc === "object" ? NEWER.get(doc)?.version : undefined);

/** a document of a newer version as it came, every field of it, for a copy that must not lose any; null for any other */
export const newerOriginalOf = (doc: unknown): Record<string, unknown> | null => (doc && typeof doc === "object" ? (NEWER.get(doc)?.raw ?? null) : null);

/** `doc` marked as of a newer version, with `raw` what it held as written: what the document a newer record held is
 *  taken as when it is read back (lib/projects) */
export function markNewer<T extends object>(doc: T, version: number, raw: Record<string, unknown>): T {
  if (version > PROJECT_VERSION) NEWER.set(doc, { version, raw });
  return doc;
}

export type LoadOptions = {
  /** The version a document with no envelope is at, when where it was kept says (the browser's own copy records
   *  it); BARE_VERSION when nothing does. */
  version?: number;
  /** the steps to run and the version they bring a document to: MIGRATIONS and PROJECT_VERSION, but for the tests'
   *  own worked examples (lib/migrations.test.ts) */
  steps?: readonly Migration[];
  target?: number;
};

/** The one way in for a document, whatever brings it: a project file or folder, a shared link, the browser's own copy,
 *  an MCP client's file, a model's draft. Takes it out of its envelope, brings it up to this version (lib/migrations.ts),
 *  and returns it only if it then has the shape the editor relies on, its behaviour cleaned (`cleanBehavior`); anything
 *  else is refused rather than half understood. What this version does not know of it, at any level, is kept as it
 *  came. A document of a newer version is not migrated: it opens as this version understands it, marked `newer`. */
export function loadDocument(value: unknown, o: LoadOptions = {}): Loaded | null {
  if (!isRecord(value)) return null;
  let doc: unknown = value;
  let version = o.version ?? BARE_VERSION;
  if (value.format !== undefined) {
    if (value.format !== PROJECT_FORMAT) return null;
    doc = value.document;
    version = versionOf(value);
  }
  if (!isRecord(doc)) return null;
  const raw = doc;
  const target = o.target ?? PROJECT_VERSION;
  const { doc: migrated, ran } = migrate(doc, version, { steps: o.steps, target });
  if (!isProject(migrated)) return null;
  const out = cleanBehavior(migrated);
  if (version > target) {
    markNewer(out, version, raw);
    return { doc: out, version, migrated: ran, newer: version };
  }
  return { doc: out, version, migrated: ran };
}

/** The document a file or a link holds (`loadDocument`), or null. */
export const openProject = (value: unknown, o: LoadOptions = {}): Doc | null => loadDocument(value, o)?.doc ?? null;

/** The browser's own copy of a document (a project's record, the earlier version's localStorage), with the version its
 *  record says: brought up to this version and cleaned as any document is. One that does not have the shape a document
 *  has (an editor long ago may have kept a part this one cannot draw) is not refused: it is the author's own work, and
 *  goes in as it is, migrated, for the store to keep what it can draw (lib/core/state.ts `drawableGroups`). */
export function loadStored(value: unknown, version?: number): Partial<Doc> | null {
  if (!isRecord(value)) return null;
  const loaded = loadDocument(value, { version });
  if (loaded) return loaded.doc;
  if (value.format !== undefined) return null;
  const from = version ?? BARE_VERSION;
  const out = migrate(value, from).doc as Partial<Doc>;
  return from > PROJECT_VERSION ? markNewer(out, from, value) : out;
}

/** the file name a project is saved under: m3e-canvas, followed by its name (the project's, else the app's) when it has one */
export const projectFileName = (doc: Pick<Doc, "title">, projectName?: string) => {
  const name = (projectName?.trim() || doc.title)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? `m3e-canvas ${name}.json` : "m3e-canvas.json";
};

/** reads a chosen file back into a document, or null when it is not one */
export async function readProject(file: File): Promise<Doc | null> {
  try {
    return openProject(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
