/* What an expression can read where it is written, and what to offer as it is typed: the shape of the scope a part sees
 * (the screen's data sources and the schemas of what they answer, its params, the variables, the element of the data
 * repeat around it, the form it is in, the session, a call's answer) and the names a path can go on with at the
 * caret. The editor's expression field (components/ExprField.tsx) shows them; the AI reads the same through
 * describe_bindings. */

import type { ApiSpec, JsonSchema } from "../api/types";
import { heldBy, type Doc, type Frame, type Group } from "../tokens";
import { endpointOf, formFields, listOf, responseSchema, schemaAt, stepsOf, type PathStep } from "./contract";
import { HELPERS, parseExpr, pathsOf } from "./expr";
import { partBySlug } from "../../parts/registry";
import { worldContractOf, worldIdsOf } from "../world/design";
import { worldRootSchema } from "../world/root";

/** what the scope of one place holds, as far as the editor knows before anything runs */
export type ScopeShape = {
  sources: { name: string; operationId: string; value?: JsonSchema; item?: JsonSchema; paged: boolean; channel?: string }[];
  params: string[];
  vars: { name: string; type: string }[];
  /** the schema of one element of the data repeat around the place, when there is one */
  item?: JsonSchema;
  inRepeat: boolean;
  /** the fields of the form around the place */
  form?: string[];
  /** what a sign-in answers (`auth.user`) */
  user?: JsonSchema;
  /** a call's answer, in its `then` */
  response?: JsonSchema;
  /** in a call's `catch` */
  error?: boolean;
  /** inside a collection's repeat: its fields, as `row.` */
  row?: string[];
  /** The `world` root a binding per frame reads (lib/world/root.ts), as the world's contract describes its snapshot,
   *  when the document has a world view; and the ids its entities start with, what `world.byId.` offers. */
  world?: JsonSchema;
  worldIds?: string[];
};

const SOURCE_FIELDS: PathStep[] = [
  { name: "value", type: "body", doc: "the answer's body" },
  { name: "items", type: "list", doc: "the list it holds, every page so far", list: true },
  { name: "status", type: "idle|loading|ready|error" },
  { name: "loading", type: "boolean" },
  { name: "loadingMore", type: "boolean" },
  { name: "hasMore", type: "boolean" },
  { name: "empty", type: "boolean" },
  { name: "ready", type: "boolean" },
  { name: "error", type: "Problem" },
  { name: "total", type: "integer" },
];
/** what `data.<name>` reads of a subscription to a realtime channel (lib/bindings/channels.ts `ChannelView`) */
const CHANNEL_FIELDS: PathStep[] = [
  { name: "value", type: "payload", doc: "the latest message's payload" },
  { name: "items", type: "list", doc: "every payload kept", list: true },
  { name: "latest", type: "{message, payload, at}", doc: "the latest message" },
  { name: "messages", type: "{message, payload, at}[]", list: true },
  { name: "count", type: "integer" },
  { name: "empty", type: "boolean" },
  { name: "status", type: "connecting|open|closed" },
  { name: "open", type: "boolean" },
];
const PROBLEM_FIELDS: PathStep[] = [
  { name: "status", type: "integer" },
  { name: "title", type: "string" },
  { name: "detail", type: "string" },
  { name: "errors", type: "{pointer, detail}[]", list: true },
];
const FORM_FIELDS: PathStep[] = [
  { name: "values", type: "object" },
  { name: "errors", type: "object", doc: "each field's error" },
  { name: "error", type: "Problem" },
  { name: "submitting", type: "boolean" },
  { name: "valid", type: "boolean" },
  { name: "progress", type: "number", doc: "an upload's progress, 0-100" },
];

/** The shape of the scope a part on a screen sees: the screen's sources and params, the variables, the data repeat
 *  and the form it is inside. */
export function shapeFor(doc: Pick<Doc, "api" | "vars" | "groups" | "collections">, frame: Frame | undefined, groupId: string | undefined, widths: Record<string, number> = {}): ScopeShape {
  const api = doc.api ?? {};
  const sources: ScopeShape["sources"] = (frame?.data ?? []).map((d) => {
    const e = endpointOf(api, d.operationId);
    const list = e ? listOf(api, e) : undefined;
    return { name: d.name, operationId: d.operationId, value: e ? responseSchema(api, e) : undefined, item: list?.item, paged: !!e?.pagination };
  });
  for (const sub of frame?.subscriptions ?? []) {
    const c = (api.channels ?? []).find((x) => x.id === sub.channel);
    /* the payload of the messages it keeps: one schema, or any of them */
    const kept = (c?.messages ?? []).filter((m) => m.payload !== undefined && (!sub.messages?.length || sub.messages.includes(m.name))).map((m) => m.payload as JsonSchema);
    const payload: JsonSchema | undefined = kept.length === 1 ? kept[0] : kept.length ? { anyOf: kept } : undefined;
    sources.push({ name: sub.name, operationId: `channel:${sub.channel}`, value: payload, item: payload, paged: false, channel: sub.channel });
  }
  const shape: ScopeShape = { sources, params: (frame?.params ?? []).map((p) => p.name), vars: (doc.vars ?? []).map((v) => ({ name: v.name || v.id, type: v.type })), inRepeat: false };
  /* a world view anywhere: a HUD laid over it reads its world per frame */
  const ids = worldIdsOf(doc);
  if (ids.length || doc.groups.some((g) => g.items.some((it) => partBySlug(it.component)?.world))) {
    shape.world = worldRootSchema(worldContractOf(doc).snapshot) as JsonSchema;
    shape.worldIds = ids;
  }
  const login = api.auth?.login ? endpointOf(api, api.auth.login) : undefined;
  if (login) {
    const r = responseSchema(api, login);
    shape.user = r && typeof r === "object" && r.properties && "user" in r.properties ? (r.properties.user as JsonSchema) : r;
  }
  if (!groupId) return shape;
  /* the containers around the place, nearest first */
  const byId = new Map(doc.groups.map((g) => [g.id, g]));
  const around: Group[] = [];
  let at = byId.get(groupId);
  for (let i = 0; at && i < 64; i++) {
    around.push(at);
    const up: Group | undefined = at.inFlow ? byId.get(at.inFlow) : doc.groups.find((h) => h !== at && h.repeat && heldBy(h, doc.groups, widths).some((x) => x.id === at!.id));
    if (!up || around.includes(up)) break;
    at = up;
  }
  for (const g of around.slice(0)) {
    if (g.id === groupId && !g.form) continue;
    if (g.repeat?.data !== undefined && !shape.inRepeat && g.id !== groupId) {
      shape.inRepeat = true;
      shape.item = itemSchemaOf(api, g.repeat.data, shape);
    }
    if (g.repeat?.collection !== undefined && !shape.row) shape.row = doc.collections?.find((c) => c.id === g.repeat!.collection)?.fields;
    if (g.form && !shape.form) {
      const e = endpointOf(api, g.form.operationId);
      shape.form = e ? formFields(api, e).map((f) => f.name) : [];
    }
  }
  return shape;
}

/** the schema of one element of the list a repeat's expression reads, as far as it can be told */
export function itemSchemaOf(api: ApiSpec, expr: string, shape: ScopeShape): JsonSchema | undefined {
  const p = parseExpr(expr);
  if (!p.ok) return undefined;
  const path = pathsOf(p.expr)[0];
  if (!path) return undefined;
  const list = schemaOfPath(api, shape, path);
  if (list.kind === "items") return list.schema;
  if (list.kind === "schema" && list.schema && typeof list.schema === "object" && list.schema.type === "array") return list.schema.items as JsonSchema;
  return undefined;
}

type Reached = { kind: "schema"; schema: JsonSchema | undefined } | { kind: "items"; schema: JsonSchema | undefined } | { kind: "steps"; steps: PathStep[] } | { kind: "none" };

/** what a path of steps reaches in a shape: a schema, the elements of a list, or a fixed set of names */
function schemaOfPath(api: ApiSpec, shape: ScopeShape, path: string[]): Reached {
  const [root, ...rest] = path;
  const inSchema = (s: JsonSchema | undefined, steps: string[]): Reached => (steps.length ? { kind: "schema", schema: schemaAt(api, s, steps) } : { kind: "schema", schema: s });
  switch (root) {
    case "data": {
      if (!rest.length) return { kind: "steps", steps: shape.sources.map((s) => ({ name: s.name, type: s.operationId })) };
      const src = shape.sources.find((s) => s.name === rest[0]);
      if (!src) return { kind: "none" };
      if (rest.length === 1) return { kind: "steps", steps: src.channel ? CHANNEL_FIELDS : SOURCE_FIELDS };
      if (src.channel && rest[1] === "latest") return rest.length === 2 ? { kind: "steps", steps: [{ name: "message", type: "string" }, { name: "payload", type: "payload" }, { name: "at", type: "date-time" }] } : rest[2] === "payload" ? inSchema(src.value, rest.slice(3)) : { kind: "none" };
      if (src.channel && rest[1] === "messages") return { kind: "none" };
      if (rest[1] === "value") return inSchema(src.value, rest.slice(2));
      if (rest[1] === "items") return rest.length === 2 ? { kind: "items", schema: src.item } : inSchema(src.item, rest.slice(3));
      if (rest[1] === "error") return rest.length === 2 ? { kind: "steps", steps: PROBLEM_FIELDS } : { kind: "none" };
      return { kind: "none" };
    }
    case "item":
      return shape.item ? inSchema(shape.item, rest) : { kind: "none" };
    case "response":
      return inSchema(shape.response, rest);
    case "error":
      return rest.length ? { kind: "none" } : { kind: "steps", steps: PROBLEM_FIELDS };
    case "params":
      return rest.length ? { kind: "none" } : { kind: "steps", steps: shape.params.map((n) => ({ name: n, type: "param" })) };
    case "vars":
      return rest.length ? { kind: "none" } : { kind: "steps", steps: shape.vars.map((v) => ({ name: v.name, type: v.type })) };
    case "row":
      return rest.length ? { kind: "none" } : { kind: "steps", steps: (shape.row ?? []).map((n) => ({ name: n, type: "string" })) };
    case "form":
      if (!shape.form) return { kind: "none" };
      if (!rest.length) return { kind: "steps", steps: [...shape.form.filter((f) => !f.includes(".")).map((n) => ({ name: n, type: "field" })), ...FORM_FIELDS] };
      if ((rest[0] === "errors" || rest[0] === "values") && rest.length === 1) return { kind: "steps", steps: shape.form.map((n) => ({ name: n, type: rest[0] === "errors" ? "string" : "field" })) };
      if (rest[0] === "error" && rest.length === 1) return { kind: "steps", steps: PROBLEM_FIELDS };
      return { kind: "none" };
    case "world": {
      if (!shape.world) return { kind: "none" };
      if (rest[0] !== "byId") return inSchema(shape.world, rest);
      if (rest.length === 1) return { kind: "steps", steps: (shape.worldIds ?? []).map((id) => ({ name: id, type: "entity" })) };
      const entity = (shape.world as { properties?: { byId?: { additionalProperties?: JsonSchema } } }).properties?.byId?.additionalProperties;
      return inSchema(entity, rest.slice(2));
    }
    case "auth":
      if (!rest.length) return { kind: "steps", steps: [{ name: "signedIn", type: "boolean" }, { name: "user", type: "object" }] };
      if (rest[0] === "user") return inSchema(shape.user, rest.slice(1));
      return { kind: "none" };
    default:
      return { kind: "none" };
  }
}

/** one suggestion: what it is called, what replaces the word at the caret, and a word on it */
export type Suggestion = { label: string; insert: string; detail: string; kind: "root" | "field" | "helper" | "list" };

/** The word at the caret and what it can be: the roots and helpers at the start of a path, else the names the path
 *  before it can go on with. `from` is where the word starts. */
export function suggest(api: ApiSpec, shape: ScopeShape, text: string, caret = text.length): { from: number; items: Suggestion[] } {
  const before = text.slice(0, caret);
  /* the path that ends at the caret: names, dots and plain [index] steps */
  const m = /((?:[\p{L}_$][\p{L}\p{N}_$]*)(?:\??\.[\p{L}_$][\p{L}\p{N}_$]*|\[\d+\])*)?(\??\.)?([\p{L}_$][\p{L}\p{N}_$]*)?$/u.exec(before);
  const word = m?.[3] ?? "";
  const from = caret - word.length;
  const head = m?.[1] && m[2] ? m[1] : undefined;
  const starts = (s: string) => s.toLowerCase().startsWith(word.toLowerCase());
  if (!head) {
    /* the start of a path: what there is to read, then the helpers */
    const roots: Suggestion[] = [
      shape.sources.length ? { label: "data", insert: "data", detail: shape.sources.map((s) => s.name).join(", "), kind: "root" } : null,
      shape.params.length ? { label: "params", insert: "params", detail: shape.params.join(", "), kind: "root" } : null,
      shape.vars.length ? { label: "vars", insert: "vars", detail: shape.vars.map((v) => v.name).join(", "), kind: "root" } : null,
      shape.inRepeat ? { label: "item", insert: "item", detail: "the element this row is drawn for", kind: "root" } : null,
      shape.inRepeat ? { label: "index", insert: "index", detail: "its place, from 0", kind: "root" } : null,
      shape.form ? { label: "form", insert: "form", detail: "the form's values and errors", kind: "root" } : null,
      { label: "auth", insert: "auth", detail: "signedIn, user", kind: "root" },
      shape.response !== undefined ? { label: "response", insert: "response", detail: "the call's answer", kind: "root" } : null,
      shape.error ? { label: "error", insert: "error", detail: "status, title, detail, errors", kind: "root" } : null,
      shape.row?.length ? { label: "row", insert: "row", detail: shape.row.join(", "), kind: "root" } : null,
      shape.world ? { label: "world", insert: "world", detail: "the world's snapshot, byId, clock (per frame only)", kind: "root" } : null,
    ].filter((x): x is Suggestion => !!x);
    const helpers: Suggestion[] = Object.keys(HELPERS).map((h) => ({ label: `${h}()`, insert: `${h}(`, detail: "helper", kind: "helper" }));
    return { from, items: [...roots, ...helpers].filter((s) => starts(s.label)).slice(0, 40) };
  }
  const path = head
    .replace(/\?\./g, ".")
    .split(/\.|(?=\[)/)
    .map((x) => (x.startsWith("[") ? x.slice(1, -1) : x))
    .filter(Boolean);
  const reached = schemaOfPath(api, shape, path);
  let steps: PathStep[] = [];
  if (reached.kind === "steps") steps = reached.steps;
  else if (reached.kind === "schema") steps = stepsOf(api, reached.schema);
  else if (reached.kind === "items") steps = [{ name: "length", type: "integer" }];
  return { from, items: steps.filter((s) => starts(s.name)).slice(0, 60).map((s) => ({ label: s.name, insert: s.name, detail: s.type, kind: s.list ? "list" : "field" })) };
}

/** every path to a list the shape holds, for picking what a repeat goes over: data.<source>.items, item.<list>… */
export function listPaths(api: ApiSpec, shape: ScopeShape): { path: string; detail: string }[] {
  const out: { path: string; detail: string }[] = [];
  for (const s of shape.sources) {
    if (s.item !== undefined || s.paged) out.push({ path: `data.${s.name}.items`, detail: s.operationId });
    for (const st of stepsOf(api, s.value)) if (st.list && st.name !== "items") out.push({ path: `data.${s.name}.value.${st.name}`, detail: st.type });
  }
  if (shape.item) for (const st of stepsOf(api, shape.item)) if (st.list) out.push({ path: `item.${st.name}`, detail: st.type });
  return out;
}

/** the fields of the elements a repeat over `expr` draws, for binding a row's parts */
export function itemFieldsOf(api: ApiSpec, shape: ScopeShape, expr: string): PathStep[] {
  return stepsOf(api, itemSchemaOf(api, expr, shape));
}

/** What a per-frame expression reads of `world` that the world's contract says is not there: a key of the snapshot (or
 *  of an entity, of the clock) its schema does not have and allows no other. An id under `world.byId` is the world's
 *  to say at run time, never a problem. Empty when the shape has no world, or nothing is known to be wrong. */
export function worldReadProblems(source: string, shape: ScopeShape): string[] {
  if (!shape.world) return [];
  const p = parseExpr(source);
  if (!p.ok) return [];
  const out: string[] = [];
  for (const path of pathsOf(p.expr)) {
    if (path[0] !== "world") continue;
    for (let i = 2; i <= path.length; i++) {
      if (path[1] === "byId" && i === 3) continue;
      const parent = schemaOfPath({}, shape, path.slice(0, i - 1));
      const at = schemaOfPath({}, shape, path.slice(0, i));
      if (at.kind !== "schema" || at.schema !== undefined) continue;
      if (parent.kind !== "schema" || !parent.schema || typeof parent.schema !== "object") break;
      const ps = parent.schema as { type?: unknown; properties?: Record<string, unknown>; additionalProperties?: unknown };
      const step = path[i - 1];
      /* a list's elements by their place, and its length */
      if (ps.type === "array" && (/^-?\d+$/.test(step) || step === "length")) continue;
      if (ps.properties && ps.additionalProperties === false) out.push(`the world's ${path.slice(1, i - 1).join(".") || "snapshot"} has no ${JSON.stringify(step)} (it has ${Object.keys(ps.properties).join(", ")}): the world's contract says what its snapshot holds`);
      break;
    }
  }
  return [...new Set(out)];
}
