/* What a call would take away of the author's work that no destructive operation's name says: the rows or fields of a
 * collection rewritten by update_collection, the modes (and their values) update_var_collection leaves out, a custom
 * style or one of the document's own icons replaced under its key, a component's property dropped, and in the API
 * (lib/api) a model, a model's fields, an endpoint, a channel or its messages, a server or a security scheme gone (an
 * import in replace mode, update_model, set_servers, set_auth). A client that is
 * asked to confirm `remove_collection` must be asked for `update_collection {rows: []}` too. The call is run once on a
 * scratch copy of the document and what it leaves is compared with what was there; nothing reaches the real store.
 * A generative tool is not run twice (it reaches a provider): what it would replace is read from its arguments.
 * The MCP bridge in the tab, the MCP file backend and the in-app agent's guard (lib/agent/guard.ts) ask the author
 * about it as they ask about a destructive call.
 *
 * Rows and pinned mock records are told apart by what they hold, not counted: a record that keeps its id (or most of
 * its cells) was edited, one that does not was removed or written over, so a list rewritten with as many new rows as
 * it had is a removal too, while editing a field or two of some rows is not. Each thing taken away also has a key
 * (`TakenKey`) that names it the same way every time, which the agent's guard binds an author's answer to. */

import { counterIds, DocStore, savedDoc, type CoreState } from "../core";
import type { ApiSpec, Doc } from "../tokens";
import type { MockSpec } from "../mocks/types";
import { collectionsOf } from "../variables";
import { executeTool, type Registry } from "./registry";
import { isDestructiveCall } from "./ops";

/** One piece of the author's work a change takes away: what kind it is, its name, and what it belongs to. Rows and
 *  pinned mock records written over, as many as there were, are `replaced`. */
export type Taken =
  | { kind: "collection"; name: string }
  | { kind: "fields"; of: string; names: string[] }
  | { kind: "rows"; of: string; n: number; total: number; replaced?: boolean }
  | { kind: "variables"; names: string[] }
  | { kind: "varCollection"; name: string }
  | { kind: "modes"; of: string; names: string[] }
  | { kind: "style"; name: string; replaced: boolean }
  | { kind: "icon"; name: string; replaced: boolean }
  | { kind: "component"; name: string }
  | { kind: "props"; of: string; names: string[] }
  | { kind: "model"; name: string }
  | { kind: "modelFields"; of: string; names: string[] }
  | { kind: "endpoint"; name: string }
  | { kind: "channel"; name: string }
  | { kind: "messages"; of: string; names: string[] }
  | { kind: "server"; name: string }
  | { kind: "scheme"; name: string }
  | { kind: "mockScenario"; name: string }
  | { kind: "mockFile"; name: string }
  | { kind: "mockRecords"; of: string; n: number; replaced?: boolean }
  | { kind: "mockScript"; name: string };

/** One thing a change takes away, named the same way every time it is asked about (a screen by its id, a row by what
 *  it held): what an author's answer is bound to, so allowing one removal allows only what it named. `names` are what
 *  a request may call it by. */
export type TakenKey = { key: string; names: string[] };

/** a piece of the author's work a change takes away, with a key for each thing in it */
export type TakenTarget = { taken: Taken; keys: TakenKey[] };

/* ---------- records: rows of a collection, pinned mock records ---------- */

type Cells = Record<string, string>;

/** what a record holds, as one string: the same record the same digest, whatever order its fields come in */
const digestOf = (c: Cells) =>
  JSON.stringify(
    Object.keys(c)
      .filter((k) => c[k] !== "")
      .sort()
      .map((k) => [k, c[k]]),
  );

/** a record edited rather than written over: at least half of what it held is still there */
function alike(a: Cells, b: Cells): boolean {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? "") !== "" || (b[k] ?? "") !== "");
  if (!keys.length) return true;
  const same = keys.filter((k) => (a[k] ?? "") === (b[k] ?? "")).length;
  return same > 0 && same * 2 >= keys.length;
}

/** how many other records one that moved is compared with: a long list is not compared pair by pair */
const SCAN = 400;

/** The records of `before` that `after` no longer holds, by their place in `before`, each with a key that names it
 *  the same way every time. A record with an id of its own is the same record while its id is there, however much of
 *  it was edited. One without is the same record when it holds the same, or when at least half of it is as it was
 *  (looked for where it stood first). The rest were removed or written over. */
export function lostRecords(before: Cells[], after: Cells[], ids?: { before: (string | undefined)[]; after: (string | undefined)[] }): { index: number; key: string }[] {
  const free = new Set(after.map((_, i) => i));
  const lost: { index: number; key: string }[] = [];
  const open: number[] = [];
  if (ids) {
    const byId = new Map<string, number[]>();
    ids.after.forEach((id, i) => {
      if (id !== undefined) byId.set(id, [...(byId.get(id) ?? []), i]);
    });
    before.forEach((_, i) => {
      const id = ids.before[i];
      if (id === undefined) return void open.push(i);
      const at = byId.get(id)?.shift();
      if (at === undefined) lost.push({ index: i, key: `id:${id}` });
      else free.delete(at);
    });
  } else before.forEach((_, i) => open.push(i));
  /* the same record, wherever it went */
  const byDigest = new Map<string, number[]>();
  for (const j of free) {
    const d = digestOf(after[j]);
    byDigest.set(d, [...(byDigest.get(d) ?? []), j]);
  }
  const seen = new Map<string, number>();
  const unmatched: { i: number; key: string }[] = [];
  for (const i of open) {
    const d = digestOf(before[i]);
    const n = (seen.get(d) ?? 0) + 1;
    seen.set(d, n);
    const at = byDigest.get(d)?.shift();
    if (at === undefined) unmatched.push({ i, key: n === 1 ? d : `${d}#${n}` });
    else free.delete(at);
  }
  /* the same record edited: where it stood first, then among the others */
  for (const { i, key } of unmatched) {
    if (free.has(i) && alike(before[i], after[i])) {
      free.delete(i);
      continue;
    }
    let found = -1;
    let looked = 0;
    for (const j of free) {
      if (++looked > SCAN) break;
      if (alike(before[i], after[j])) {
        found = j;
        break;
      }
    }
    if (found >= 0) free.delete(found);
    else lost.push({ index: i, key });
  }
  return lost.sort((a, b) => a.index - b.index);
}

/** Whether losing these records is worth asking about: fewer are left, or most of them were written over at once.
 *  An edit of a field or two of some rows is not. */
const recordsTaken = (lost: number, total: number, left: number) => lost > 0 && (left < total || (lost >= 2 && lost * 2 >= total));

/** a row of a collection as its cells by field name */
const rowCells = (fields: string[], row: string[]): Cells => Object.fromEntries(fields.map((f, j) => [f, String(row[j] ?? "")]));

/** a collection's own id field, when it has one: rows keep it while they are edited */
const idField = (fields: string[]) => fields.find((f) => f.toLowerCase() === "id");

/** a pinned mock record as its cells, and its id when it has one */
const recordCells = (r: Record<string, unknown>): Cells => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v ?? null)]));
const recordId = (r: Record<string, unknown>): string | undefined => (typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : undefined);

/** the rows of a collection `before` had that `after` lost or wrote over */
function rowsTaken(c: { id: string; fields: string[]; rows: string[][] }, now: { fields: string[]; rows: string[][] }): { index: number; key: string }[] {
  const a = c.rows.map((r) => rowCells(c.fields, r));
  const b = now.rows.map((r) => rowCells(now.fields, r));
  const fa = idField(c.fields);
  const fb = idField(now.fields);
  const ids = fa && fb ? { before: a.map((x) => x[fa] || undefined), after: b.map((x) => x[fb] || undefined) } : undefined;
  return lostRecords(a, b, ids);
}

/* ---------- what is taken ---------- */

/** the property names of an object schema */
const fieldsOf = (s: unknown): string[] => {
  const props = s && typeof s === "object" ? (s as { properties?: unknown }).properties : undefined;
  return props && typeof props === "object" ? Object.keys(props) : [];
};

const k = (key: string, ...names: (string | undefined)[]): TakenKey => ({ key, names: [...new Set(names.filter((x): x is string => !!x))] });
/** a style's name in every language it has one in */
const styleNames = (n: unknown): string[] => (typeof n === "string" ? [n] : n && typeof n === "object" ? Object.values(n as Record<string, unknown>).filter((x): x is string => typeof x === "string") : []);

/** What the API section lost, each with its keys: models, fields of a model, endpoints, channels and their messages,
 *  servers, security schemes. One renamed (the same schema under another name, the same route under another
 *  operationId, the same address under another id) is not lost. */
export function apiTargets(before: ApiSpec | undefined, after: ApiSpec | undefined): TakenTarget[] {
  const out: TakenTarget[] = [];
  if (!before) return out;
  const a = after ?? {};
  const json = (v: unknown) => JSON.stringify(v ?? null);
  const isNewModel = (name: string) => !(before.models ?? []).some((y) => y.name === name);
  for (const m of before.models ?? []) {
    const now = a.models?.find((x) => x.name === m.name);
    if (!now) {
      const ref = `"#/components/schemas/${m.name}"`;
      const renamed = (a.models ?? []).some((x) => isNewModel(x.name) && json(x.schema).split(`"#/components/schemas/${x.name}"`).join(ref) === json(m.schema));
      if (!renamed) out.push({ taken: { kind: "model", name: m.name }, keys: [k(`model:${m.name}`, m.name)] });
      continue;
    }
    const gone = fieldsOf(m.schema).filter((f) => !fieldsOf(now.schema).includes(f));
    if (gone.length) out.push({ taken: { kind: "modelFields", of: m.name, names: gone }, keys: gone.map((f) => k(`modelField:${m.name}:${f}`, m.name, f)) });
  }
  const isNewEndpoint = (id: string) => !(before.endpoints ?? []).some((y) => y.operationId === id);
  for (const e of before.endpoints ?? []) {
    if (a.endpoints?.some((x) => x.operationId === e.operationId)) continue;
    const renamed = (a.endpoints ?? []).some((x) => x.method === e.method && x.path === e.path && isNewEndpoint(x.operationId));
    if (!renamed) out.push({ taken: { kind: "endpoint", name: `${e.operationId} (${e.method.toUpperCase()} ${e.path})` }, keys: [k(`endpoint:${e.operationId}`, e.operationId, e.path)] });
  }
  for (const c of before.channels ?? []) {
    const now = a.channels?.find((x) => x.id === c.id) ?? a.channels?.find((x) => x.address === c.address && !(before.channels ?? []).some((y) => y.id === x.id));
    if (!now) {
      out.push({ taken: { kind: "channel", name: c.id }, keys: [k(`channel:${c.id}`, c.id, c.address)] });
      continue;
    }
    const gone = c.messages.filter((m) => !now.messages.some((x) => x.name === m.name)).map((m) => m.name);
    if (gone.length) out.push({ taken: { kind: "messages", of: c.id, names: gone }, keys: gone.map((m) => k(`message:${c.id}:${m}`, c.id, m)) });
  }
  for (const sv of before.servers ?? []) if (!a.servers?.some((x) => x.env === sv.env)) out.push({ taken: { kind: "server", name: sv.env }, keys: [k(`server:${sv.env}`, sv.env)] });
  for (const name of Object.keys(before.auth?.schemes ?? {})) if (!a.auth?.schemes[name]) out.push({ taken: { kind: "scheme", name }, keys: [k(`scheme:${name}`, name)] });
  return out;
}

/** What the API section lost: models, fields of a model, endpoints, channels and their messages, servers, security
 *  schemes. */
export const apiTakenAway = (before: ApiSpec | undefined, after: ApiSpec | undefined): Taken[] => apiTargets(before, after).map((t) => t.taken);

/** What the mock library lost, each with its keys: scenarios, files, records pinned by hand (removed, or written
 *  over at once), realtime scripts written down. Hints and counts are settings, changed freely. */
export function mocksTargets(before: MockSpec | undefined, after: MockSpec | undefined): TakenTarget[] {
  const out: TakenTarget[] = [];
  if (!before) return out;
  const a = after ?? {};
  for (const sc of before.scenarios ?? []) if (!a.scenarios?.some((x) => x.id === sc.id)) out.push({ taken: { kind: "mockScenario", name: sc.name || sc.id }, keys: [k(`mockScenario:${sc.id}`, sc.name, sc.id)] });
  for (const f of before.files ?? []) if (!a.files?.some((x) => x.id === f.id)) out.push({ taken: { kind: "mockFile", name: f.name || f.id }, keys: [k(`mockFile:${f.id}`, f.name, f.id)] });
  for (const m of before.models ?? []) {
    const was = m.fixtures ?? [];
    if (!was.length) continue;
    const now = a.models?.find((x) => x.name === m.name)?.fixtures ?? [];
    const lost = lostRecords(was.map(recordCells), now.map(recordCells), { before: was.map(recordId), after: now.map(recordId) });
    if (recordsTaken(lost.length, was.length, now.length)) out.push({ taken: { kind: "mockRecords", of: m.name, n: lost.length, ...(now.length >= was.length ? { replaced: true } : {}) }, keys: lost.map((x) => k(`mockRecord:${m.name}:${x.key}`, m.name)) });
  }
  for (const r of before.realtime ?? []) if (!a.realtime?.some((x) => x.id === r.id)) out.push({ taken: { kind: "mockScript", name: r.id }, keys: [k(`mockScript:${r.id}`, r.id, r.channel)] });
  return out;
}

/** What the mock library lost: scenarios, files, records pinned by hand, realtime scripts written down. */
export const mocksTakenAway = (before: MockSpec | undefined, after: MockSpec | undefined): Taken[] => mocksTargets(before, after).map((t) => t.taken);

/** Every piece of the author's work `before` has that `after` lost or holds changed under the same name, with a key
 *  for each thing in it. Parts and screens are left to the destructive operations that remove them. */
export function takenTargets(before: Doc, after: Doc): TakenTarget[] {
  const out: TakenTarget[] = [];
  const name = (x: { name?: string; id: string }) => x.name || x.id;
  for (const c of before.collections ?? []) {
    const now = after.collections?.find((x) => x.id === c.id);
    if (!now) {
      out.push({ taken: { kind: "collection", name: name(c) }, keys: [k(`collection:${c.id}`, c.name, c.id)] });
      continue;
    }
    const fields = c.fields.filter((f) => !now.fields.includes(f));
    if (fields.length) out.push({ taken: { kind: "fields", of: name(c), names: fields }, keys: fields.map((f) => k(`field:${c.id}:${f}`, c.name, c.id, f)) });
    const lost = rowsTaken(c, now);
    if (recordsTaken(lost.length, c.rows.length, now.rows.length))
      out.push({ taken: { kind: "rows", of: name(c), n: lost.length, total: c.rows.length, ...(now.rows.length >= c.rows.length ? { replaced: true } : {}) }, keys: lost.map((x) => k(`row:${c.id}:${x.key}`, c.name, c.id)) });
  }
  const vars = new Set((after.vars ?? []).map((v) => v.id));
  const goneVars = (before.vars ?? []).filter((v) => !vars.has(v.id));
  if (goneVars.length) out.push({ taken: { kind: "variables", names: goneVars.map(name) }, keys: goneVars.map((v) => k(`var:${v.id}`, v.name, v.id)) });
  const collectionsAfter = collectionsOf(after);
  for (const c of collectionsOf(before)) {
    const now = collectionsAfter.find((x) => x.id === c.id);
    if (!now) {
      if (c.modes.length > 1 || (before.varCollections ?? []).some((x) => x.id === c.id)) out.push({ taken: { kind: "varCollection", name: name(c) }, keys: [k(`varCollection:${c.id}`, c.name, c.id)] });
      continue;
    }
    const modes = c.modes.filter((m) => !now.modes.some((x) => x.id === m.id));
    if (modes.length) out.push({ taken: { kind: "modes", of: name(c), names: modes.map(name) }, keys: modes.map((m) => k(`mode:${c.id}:${m.id}`, c.name, m.name)) });
  }
  for (const s of before.styles ?? []) {
    const now = after.styles?.find((x) => x.key === s.key);
    if (!now) out.push({ taken: { kind: "style", name: s.key, replaced: false }, keys: [k(`style:${s.key}`, s.key, ...styleNames(s.name))] });
    else if (JSON.stringify(now) !== JSON.stringify(s)) out.push({ taken: { kind: "style", name: s.key, replaced: true }, keys: [k(`style:${s.key}`, s.key, ...styleNames(s.name))] });
  }
  for (const [id, markup] of Object.entries(before.icons ?? {})) {
    const now = after.icons?.[id];
    if (now === undefined) out.push({ taken: { kind: "icon", name: `svg:${id}`, replaced: false }, keys: [k(`icon:${id}`, id, `svg:${id}`)] });
    else if (now !== markup) out.push({ taken: { kind: "icon", name: `svg:${id}`, replaced: true }, keys: [k(`icon:${id}`, id, `svg:${id}`)] });
  }
  for (const c of before.components ?? []) {
    const now = after.components?.find((x) => x.id === c.id);
    if (!now) out.push({ taken: { kind: "component", name: name(c) }, keys: [k(`component:${c.id}`, c.name, c.id)] });
    else {
      const props = (c.props ?? []).filter((p) => !(now.props ?? []).some((x) => x.id === p.id));
      if (props.length) out.push({ taken: { kind: "props", of: name(c), names: props.map(name) }, keys: props.map((p) => k(`prop:${c.id}:${p.id}`, c.name, p.name)) });
    }
  }
  out.push(...apiTargets(before.api, after.api));
  out.push(...mocksTargets(before.mocks, after.mocks));
  return out;
}

/** Every piece of the author's work `before` has that `after` lost or holds changed under the same name. Parts and
 *  screens are left to the destructive operations that remove them. */
export const takenAway = (before: Doc, after: Doc): Taken[] => takenTargets(before, after).map((t) => t.taken);

/** one piece in a few English words, for a model, a client's confirmation and the MCP card */
export function takenText(t: Taken): string {
  const q = JSON.stringify;
  const list = (xs: string[]) => xs.map((x) => q(x)).join(", ");
  switch (t.kind) {
    case "collection":
      return `the data collection ${q(t.name)}`;
    case "fields":
      return `the field${t.names.length === 1 ? "" : "s"} ${list(t.names)} of ${q(t.of)}`;
    case "rows":
      return t.replaced ? `${t.n} of the ${t.total} rows of ${q(t.of)} (written over with other rows)` : `${t.n} of the ${t.total} rows of ${q(t.of)}`;
    case "variables":
      return `the variable${t.names.length === 1 ? "" : "s"} ${list(t.names)}`;
    case "varCollection":
      return `the variable collection ${q(t.name)}`;
    case "modes":
      return `the mode${t.names.length === 1 ? "" : "s"} ${list(t.names)} of ${q(t.of)}, with every variable's value in ${t.names.length === 1 ? "it" : "them"}`;
    case "style":
      return t.replaced ? `the custom style ${q(t.name)} as it was (it is replaced)` : `the custom style ${q(t.name)}`;
    case "icon":
      return t.replaced ? `the drawing of the icon ${t.name} (it is replaced)` : `the icon ${t.name}`;
    case "component":
      return `the component ${q(t.name)}`;
    case "props":
      return `the propert${t.names.length === 1 ? "y" : "ies"} ${list(t.names)} of the component ${q(t.of)}`;
    case "model":
      return `the data model ${q(t.name)}`;
    case "modelFields":
      return `the field${t.names.length === 1 ? "" : "s"} ${list(t.names)} of the model ${q(t.of)}`;
    case "endpoint":
      return `the endpoint ${t.name}`;
    case "channel":
      return `the realtime channel ${q(t.name)}`;
    case "messages":
      return `the message${t.names.length === 1 ? "" : "s"} ${list(t.names)} of the channel ${q(t.of)}`;
    case "server":
      return `the server ${q(t.name)}`;
    case "scheme":
      return `the security scheme ${q(t.name)}`;
    case "mockScenario":
      return `the mock scenario ${q(t.name)}`;
    case "mockFile":
      return `the mock file ${q(t.name)}`;
    case "mockRecords":
      return `${t.n} pinned mock record${t.n === 1 ? "" : "s"} of ${q(t.of)}${t.replaced ? " (written over with other records)" : ""}`;
    case "mockScript":
      return `the realtime script ${q(t.name)}`;
  }
}

/** every piece of the author's work `before` has that `after` lost, in a few words each */
export const workTakenAway = (before: Doc, after: Doc): string[] => takenAway(before, after).map(takenText);

/** What a generative call would replace of the author's work, read from its arguments against the document as it
 *  was (`since`) and as it is, with its key: a style revised under its key, an icon drawn again under its id. What it
 *  adds new is given a key of its own (generate_style never writes over a style it was not asked to revise). */
export function generativeTargets(since: Doc, now: Doc, name: string, args: unknown): TakenTarget[] {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "generate_style" && typeof a.refine === "string") {
    const key = a.refine;
    const was = since.styles?.find((s) => s.key === key);
    return was && now.styles?.some((s) => s.key === key) ? [{ taken: { kind: "style", name: key, replaced: true }, keys: [k(`style:${key}`, key, ...styleNames(was.name))] }] : [];
  }
  if (name === "generate_svg" && typeof a.icon === "string" && a.icon.trim()) {
    const id = a.icon.trim().replace(/^svg:/, "");
    return since.icons?.[id] !== undefined && now.icons?.[id] !== undefined ? [{ taken: { kind: "icon", name: `svg:${id}`, replaced: true }, keys: [k(`icon:${id}`, id, `svg:${id}`)] }] : [];
  }
  return [];
}

/** What a generative call would replace of the author's work, read from its arguments. */
export const generativeTakes = (since: Doc, now: Doc, name: string, args: unknown): Taken[] => generativeTargets(since, now, name, args).map((t) => t.taken);

/** What a call that no destructive name marks would take away, compared with the document as it was at `since` (the
 *  store's document now when left out: the in-app agent passes the state its turn started from, so what the turn made
 *  itself is its own to change). Found by running the call on a copy of the store's document; a generative call by its
 *  arguments. Empty when it takes nothing, fails or only reads. Throws when the check itself fails: a caller must not
 *  read that as nothing taken. */
export async function takesOf(store: DocStore, name: string, args: unknown, o: { registry: Registry; since?: CoreState }): Promise<Taken[]> {
  const t = o.registry.byName(name);
  if (!t || t.readOnly || isDestructiveCall(name, args)) return [];
  const now = store.get();
  const since = o.since ?? now;
  if (t.group === "generate") return generativeTakes(savedDoc(since), savedDoc(now), name, args);
  const scratch = new DocStore(now, { measurer: store.options.measurer, lang: store.options.lang, ids: counterIds("dry") });
  const out = await executeTool(scratch, name, args, { origin: "mcp", history: "none", registry: o.registry });
  if (!out.ok || scratch.get().doc === now.doc) return [];
  return takenAway(savedDoc(since), savedDoc(scratch.get()));
}

/** what `takesOf` finds, in words: what the MCP bridge and the file backend ask the author about */
export async function wouldTakeAway(store: DocStore, name: string, args: unknown, o: { registry: Registry }): Promise<string[]> {
  return (await takesOf(store, name, args, o)).map(takenText);
}
