import { standIn } from "./instances";
import { cleanLook } from "./look";
import { COLOR_TOKENS, Collection, ComponentDef, Condition, Doc, DocVar, Effect, Frame, Group, Item, Palette, VARIANTS, VarValue, isPlace, isTextToken } from "./tokens";

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

function cleanCondition(c: unknown): Condition | undefined {
  if (!isRecord(c)) return undefined;
  if (typeof c.filled === "string") return { filled: c.filled };
  if (typeof c.var === "string" && (c.op === "eq" || c.op === "neq") && isValue(c.value)) return { var: c.var, op: c.op, value: c.value };
  return undefined;
}

function cleanEffect(e: unknown): Effect | undefined {
  if (!isRecord(e)) return undefined;
  switch (e.do) {
    case "show":
    case "hide":
    case "toggle":
    case "open":
    case "close":
      return typeof e.part === "string" ? { do: e.do, part: e.part } : undefined;
    case "setVar":
      return typeof e.var === "string" && isValue(e.value) ? { do: "setVar", var: e.var, value: e.value } : undefined;
    case "toggleVar":
      return typeof e.var === "string" ? { do: "toggleVar", var: e.var } : undefined;
    case "addVar":
      return typeof e.var === "string" && typeof e.by === "number" && Number.isFinite(e.by) ? { do: "addVar", var: e.var, by: e.by } : undefined;
    case "setProp":
      return typeof e.part === "string" && typeof e.prop === "string" && isValue(e.value) ? { do: "setProp", part: e.part, prop: e.prop, value: e.value } : undefined;
    case "snackbar":
      return typeof e.message === "string" ? { do: "snackbar", message: e.message } : undefined;
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

const cleanEffects = (list: unknown) => (Array.isArray(list) ? list.map(cleanEffect).filter((e) => e !== undefined) : undefined);
const cleanBody = (a: unknown) => (isRecord(a) && typeof a.to === "string" ? cleaned(a, { effects: cleanEffects }) : undefined);
const cleanAction = (a: unknown) => (isRecord(a) && typeof a.to === "string" ? cleaned(a, { effects: cleanEffects, when: cleanCondition, else: cleanBody }) : undefined);

const cleanActions = (map: unknown) => {
  if (!isRecord(map)) return undefined;
  return Object.fromEntries(Object.entries(map).flatMap(([slot, a]) => {
    const action = cleanAction(a);
    return action ? [[slot, action]] : [];
  }));
};

const cleanBind = (map: unknown) => (isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([, id]) => typeof id === "string")) : undefined);

function cleanVar(v: unknown): DocVar | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || (v.type !== "text" && v.type !== "number" && v.type !== "bool")) return undefined;
  const fallback = v.type === "text" ? "" : v.type === "number" ? 0 : false;
  /* a start value of another type keeps the variable and loses the value */
  const value = typeof v.value === typeof fallback && isValue(v.value) ? v.value : fallback;
  return { id: v.id, name: typeof v.name === "string" ? v.name : "", type: v.type, value };
}

const cleanItem = (it: Item) => cleaned(it as unknown as Record<string, unknown>, { action: cleanAction, actions: cleanActions, bind: cleanBind, look: cleanLook, fill: (v) => (COLOR_TOKENS.some((t) => t.key === v) ? v : undefined), row: () => undefined }) as unknown as Item;

const cleanOverrides = (map: unknown) => (isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([, v]) => isValue(v))) : undefined);

function cleanRepeat(r: unknown) {
  if (!isRecord(r) || typeof r.collection !== "string") return undefined;
  /* a limit of the wrong kind goes, and the repeat stays */
  return { collection: r.collection, ...(typeof r.limit === "number" && Number.isInteger(r.limit) && r.limit >= 0 ? { limit: r.limit } : {}) };
}

const cleanGroup = (g: Group) =>
  ({
    ...cleaned(g as unknown as Record<string, unknown>, {
      name: (v) => (typeof v === "string" ? v : undefined),
      hidden: (v) => (typeof v === "boolean" ? v : undefined),
      showWhen: cleanCondition,
      pane: (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined),
      instanceOf: (v) => (typeof v === "string" ? v : undefined),
      overrides: cleanOverrides,
      repeat: cleanRepeat,
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

/** one definition, or nothing when it has no id to be called by. Its groups go through the same checks as a screen's. */
function cleanComponent(c: unknown): ComponentDef | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const groups = Array.isArray(c.groups) ? c.groups.filter(validGroup).map((g) => cleanGroup(g as Group)) : [];
  const size = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 40);
  return { id: c.id, name: typeof c.name === "string" ? c.name : "", groups, w: size(c.w), h: size(c.h) };
}

/** one collection, or nothing when it has no id. A cell of another kind is read as words where it can be; a row that is no row goes. */
function cleanCollection(c: unknown): Collection | undefined {
  if (!isRecord(c) || typeof c.id !== "string") return undefined;
  const cell = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
  const fields = Array.isArray(c.fields) ? c.fields.filter((f): f is string => typeof f === "string") : [];
  const rows = Array.isArray(c.rows) ? c.rows.filter(Array.isArray).map((r: unknown[]) => r.map(cell)) : [];
  return { id: c.id, name: typeof c.name === "string" ? c.name : "", fields, rows };
}

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
  return { ...g, items: [{ ...made.items[0], id: g.items[0]?.id ?? made.items[0].id }] };
}

/** a document with what is wrong in its behaviour taken out; it always comes back whole */
export function cleanBehavior(doc: Doc): Doc {
  const out: Doc = { ...doc, frames: doc.frames.map(cleanFrame), groups: doc.groups.map(cleanGroup) };
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
  const instances = (list: Group[]) => list.map((g) => cleanInstance(g, out.components)).filter((g): g is Group => g !== undefined && g.items.length > 0);
  out.groups = instances(out.groups);
  if (out.components) out.components = out.components.map((c) => ({ ...c, groups: instances(c.groups) }));
  if (out.vars === undefined) return out;
  if (Array.isArray(out.vars)) out.vars = out.vars.map(cleanVar).filter((v) => v !== undefined);
  else delete out.vars;
  return out;
}

/** whether a parsed file has the shape of a document the editor can open */
export const isProject = (value: unknown): value is Doc =>
  isRecord(value) && Array.isArray(value.groups) && Array.isArray(value.frames) && value.groups.every(validGroup) && value.frames.every(validFrame) && (value.promptOptions === undefined || (Array.isArray(value.promptOptions) && value.promptOptions.every((o) => typeof o === "string")));

/* ---------- the file format ---------- */

/** A document may also come bare, with no envelope, from a link or a hand-written file. */
export const PROJECT_FORMAT = "m3e-project";
export const PROJECT_VERSION = 2;

/** What changes a document from one version to the next, run in order: a change of format adds its
 *  step here under the version it comes from. Each must leave a field it does not know alone. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

/** the file a document is saved as */
export const projectFile = (doc: Doc) => ({ format: PROJECT_FORMAT, version: PROJECT_VERSION, document: doc });

/** The one way in for a document that comes from outside: a file or a link. Takes it out of its
 *  envelope, brings it up to this version, and returns it only if it then has the shape the editor
 *  relies on. Anything else is refused rather than half understood. */
export function openProject(value: unknown): Doc | null {
  if (!isRecord(value)) return null;
  let doc: unknown = value;
  let version = 0;
  if (value.format !== undefined) {
    if (value.format !== PROJECT_FORMAT) return null;
    doc = value.document;
    version = typeof value.version === "number" ? value.version : 0;
    if (version > PROJECT_VERSION) return null;
  }
  if (!isRecord(doc)) return null;
  for (let v = version; v < PROJECT_VERSION; v++) doc = MIGRATIONS[v]?.(doc as Record<string, unknown>) ?? doc;
  return isProject(doc) ? cleanBehavior(doc) : null;
}

/** the file name a project is saved under: m3e-canvas, followed by the app's name when it has one */
export const projectFileName = (doc: Doc) => {
  const name = doc.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? `m3e-canvas ${name}.json` : "m3e-canvas.json";
};

/** hands the document to the browser as a JSON download */
export function saveProject(doc: Doc) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(projectFile(doc), null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = projectFileName(doc);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** reads a chosen file back into a document, or null when it is not one */
export async function readProject(file: File): Promise<Doc | null> {
  try {
    return openProject(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
