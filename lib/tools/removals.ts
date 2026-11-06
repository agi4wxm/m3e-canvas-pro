/* What a call would take away of the author's work that no destructive operation's name says: the rows or fields of a
 * collection rewritten by update_collection, the modes (and their values) update_var_collection leaves out, a custom
 * style or one of the document's own icons replaced under its key, a component's property dropped, and in the API
 * (lib/api) a model, a model's fields, an endpoint, a channel or its messages, a server or a security scheme gone (an
 * import in replace mode, update_model, set_servers, set_auth). A client that is
 * asked to confirm `remove_collection` must be asked for `update_collection {rows: []}` too. The call is run once on a
 * scratch copy of the document and what it leaves is compared with what was there; nothing reaches the real store.
 * A generative tool is not run twice (it reaches a provider): what it would replace is read from its arguments.
 * The MCP bridge in the tab, the MCP file backend and the in-app agent's guard (lib/agent/guard.ts) ask the author
 * about it as they ask about a destructive call. */

import { counterIds, DocStore, savedDoc, type CoreState } from "../core";
import type { ApiSpec, Doc } from "../tokens";
import type { MockSpec } from "../mocks/types";
import { collectionsOf } from "../variables";
import { executeTool, type Registry } from "./registry";
import { isDestructiveCall } from "./ops";

/** One piece of the author's work a change takes away: what kind it is, its name, and what it belongs to. */
export type Taken =
  | { kind: "collection"; name: string }
  | { kind: "fields"; of: string; names: string[] }
  | { kind: "rows"; of: string; n: number; total: number }
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
  | { kind: "mockRecords"; of: string; n: number }
  | { kind: "mockScript"; name: string };

/** the property names of an object schema */
const fieldsOf = (s: unknown): string[] => {
  const props = s && typeof s === "object" ? (s as { properties?: unknown }).properties : undefined;
  return props && typeof props === "object" ? Object.keys(props) : [];
};

/** What the API section lost: models, fields of a model, endpoints, channels and their messages, servers, security
 *  schemes. One renamed (the same schema under another name, the same route under another operationId, the same
 *  address under another id) is not lost. */
export function apiTakenAway(before: ApiSpec | undefined, after: ApiSpec | undefined): Taken[] {
  const out: Taken[] = [];
  if (!before) return out;
  const a = after ?? {};
  const json = (v: unknown) => JSON.stringify(v ?? null);
  const isNewModel = (name: string) => !(before.models ?? []).some((y) => y.name === name);
  for (const m of before.models ?? []) {
    const now = a.models?.find((x) => x.name === m.name);
    if (!now) {
      const ref = `"#/components/schemas/${m.name}"`;
      const renamed = (a.models ?? []).some((x) => isNewModel(x.name) && json(x.schema).split(`"#/components/schemas/${x.name}"`).join(ref) === json(m.schema));
      if (!renamed) out.push({ kind: "model", name: m.name });
      continue;
    }
    const gone = fieldsOf(m.schema).filter((f) => !fieldsOf(now.schema).includes(f));
    if (gone.length) out.push({ kind: "modelFields", of: m.name, names: gone });
  }
  const isNewEndpoint = (id: string) => !(before.endpoints ?? []).some((y) => y.operationId === id);
  for (const e of before.endpoints ?? []) {
    if (a.endpoints?.some((x) => x.operationId === e.operationId)) continue;
    const renamed = (a.endpoints ?? []).some((x) => x.method === e.method && x.path === e.path && isNewEndpoint(x.operationId));
    if (!renamed) out.push({ kind: "endpoint", name: `${e.operationId} (${e.method.toUpperCase()} ${e.path})` });
  }
  for (const c of before.channels ?? []) {
    const now = a.channels?.find((x) => x.id === c.id) ?? a.channels?.find((x) => x.address === c.address && !(before.channels ?? []).some((y) => y.id === x.id));
    if (!now) {
      out.push({ kind: "channel", name: c.id });
      continue;
    }
    const gone = c.messages.filter((m) => !now.messages.some((x) => x.name === m.name)).map((m) => m.name);
    if (gone.length) out.push({ kind: "messages", of: c.id, names: gone });
  }
  for (const sv of before.servers ?? []) if (!a.servers?.some((x) => x.env === sv.env)) out.push({ kind: "server", name: sv.env });
  for (const name of Object.keys(before.auth?.schemes ?? {})) if (!a.auth?.schemes[name]) out.push({ kind: "scheme", name });
  return out;
}

/** What the mock library lost: scenarios, files, records pinned by hand, realtime scripts written down. Hints and
 *  counts are settings, changed freely. */
export function mocksTakenAway(before: MockSpec | undefined, after: MockSpec | undefined): Taken[] {
  const out: Taken[] = [];
  if (!before) return out;
  const a = after ?? {};
  for (const sc of before.scenarios ?? []) if (!a.scenarios?.some((x) => x.id === sc.id)) out.push({ kind: "mockScenario", name: sc.name || sc.id });
  for (const f of before.files ?? []) if (!a.files?.some((x) => x.id === f.id)) out.push({ kind: "mockFile", name: f.name || f.id });
  for (const m of before.models ?? []) {
    const n = (m.fixtures?.length ?? 0) - (a.models?.find((x) => x.name === m.name)?.fixtures?.length ?? 0);
    if (n > 0) out.push({ kind: "mockRecords", of: m.name, n });
  }
  for (const r of before.realtime ?? []) if (!a.realtime?.some((x) => x.id === r.id)) out.push({ kind: "mockScript", name: r.id });
  return out;
}

/** Every piece of the author's work `before` has that `after` lost or holds changed under the same name. Parts and
 *  screens are left to the destructive operations that remove them. */
export function takenAway(before: Doc, after: Doc): Taken[] {
  const out: Taken[] = [];
  const name = (x: { name?: string; id: string }) => x.name || x.id;
  for (const c of before.collections ?? []) {
    const now = after.collections?.find((x) => x.id === c.id);
    if (!now) out.push({ kind: "collection", name: name(c) });
    else {
      const fields = c.fields.filter((f) => !now.fields.includes(f));
      if (fields.length) out.push({ kind: "fields", of: name(c), names: fields });
      if (now.rows.length < c.rows.length) out.push({ kind: "rows", of: name(c), n: c.rows.length - now.rows.length, total: c.rows.length });
    }
  }
  const vars = new Set((after.vars ?? []).map((v) => v.id));
  const goneVars = (before.vars ?? []).filter((v) => !vars.has(v.id));
  if (goneVars.length) out.push({ kind: "variables", names: goneVars.map(name) });
  const collectionsAfter = collectionsOf(after);
  for (const c of collectionsOf(before)) {
    const now = collectionsAfter.find((x) => x.id === c.id);
    if (!now) {
      if (c.modes.length > 1 || (before.varCollections ?? []).some((x) => x.id === c.id)) out.push({ kind: "varCollection", name: name(c) });
      continue;
    }
    const modes = c.modes.filter((m) => !now.modes.some((x) => x.id === m.id));
    if (modes.length) out.push({ kind: "modes", of: name(c), names: modes.map(name) });
  }
  for (const s of before.styles ?? []) {
    const now = after.styles?.find((x) => x.key === s.key);
    if (!now) out.push({ kind: "style", name: s.key, replaced: false });
    else if (JSON.stringify(now) !== JSON.stringify(s)) out.push({ kind: "style", name: s.key, replaced: true });
  }
  for (const [id, markup] of Object.entries(before.icons ?? {})) {
    const now = after.icons?.[id];
    if (now === undefined) out.push({ kind: "icon", name: `svg:${id}`, replaced: false });
    else if (now !== markup) out.push({ kind: "icon", name: `svg:${id}`, replaced: true });
  }
  for (const c of before.components ?? []) {
    const now = after.components?.find((x) => x.id === c.id);
    if (!now) out.push({ kind: "component", name: name(c) });
    else {
      const props = (c.props ?? []).filter((p) => !(now.props ?? []).some((x) => x.id === p.id));
      if (props.length) out.push({ kind: "props", of: name(c), names: props.map(name) });
    }
  }
  out.push(...apiTakenAway(before.api, after.api));
  out.push(...mocksTakenAway(before.mocks, after.mocks));
  return out;
}

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
      return `${t.n} of the ${t.total} rows of ${q(t.of)}`;
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
      return `${t.n} pinned mock record${t.n === 1 ? "" : "s"} of ${q(t.of)}`;
    case "mockScript":
      return `the realtime script ${q(t.name)}`;
  }
}

/** every piece of the author's work `before` has that `after` lost, in a few words each */
export const workTakenAway = (before: Doc, after: Doc): string[] => takenAway(before, after).map(takenText);

/** What a generative call would replace of the author's work, read from its arguments against the document as it
 *  was (`since`) and as it is: a style revised under its key, an icon drawn again under its id. What it adds new is
 *  given a key of its own (generate_style never writes over a style it was not asked to revise). */
export function generativeTakes(since: Doc, now: Doc, name: string, args: unknown): Taken[] {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "generate_style" && typeof a.refine === "string") {
    const key = a.refine;
    return since.styles?.some((s) => s.key === key) && now.styles?.some((s) => s.key === key) ? [{ kind: "style", name: key, replaced: true }] : [];
  }
  if (name === "generate_svg" && typeof a.icon === "string" && a.icon.trim()) {
    const id = a.icon.trim().replace(/^svg:/, "");
    return since.icons?.[id] !== undefined && now.icons?.[id] !== undefined ? [{ kind: "icon", name: `svg:${id}`, replaced: true }] : [];
  }
  return [];
}

/** What a call that no destructive name marks would take away, compared with the document as it was at `since` (the
 *  store's document now when left out: the in-app agent passes the state its turn started from, so what the turn made
 *  itself is its own to change). Found by running the call on a copy of the store's document; a generative call by its
 *  arguments. Empty when it takes nothing, fails or only reads. */
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
