/* The API section read back in short, for a model and for the editor: a compact outline of everything (get_api), one
 * endpoint with what it refers to (describe_endpoint), one model with where it is used (describe_model). */

import { fieldRows, followRef, isRecord, pointerRoot, resolvePointer, schemaModels, typeText } from "./schema";
import { schemaTypeTs } from "./typescript";
import { paginationOf, type ApiEndpoint, type ApiSpec, type JsonSchema } from "./types";
import { apiProblems, endpointParams, isRef, modelUses } from "./validate";

/** the schema of a body or response: its first media type's, and which one that is */
export function bodyOf(v: unknown, api: ApiSpec): { type: string; schema?: JsonSchema } | undefined {
  const target = isRef(v) ? resolvePointer(pointerRoot(api), v.$ref) : v;
  if (!isRecord(target) || !isRecord(target.content)) return undefined;
  const [type, media] = Object.entries(target.content)[0] ?? [];
  return type ? { type, schema: isRecord(media) ? (media.schema as JsonSchema | undefined) : undefined } : undefined;
}

/** the success response an endpoint answers with: the first 2XX, else the first of all */
export function successOf(e: ApiEndpoint): string | undefined {
  const codes = Object.keys(e.responses);
  return codes.find((c) => c.startsWith("2")) ?? codes.find((c) => c !== "default") ?? codes[0];
}

/** the tag an endpoint is grouped under: its first, or "" */
export const tagOf = (e: ApiEndpoint) => e.tags?.[0] ?? "";

/** one line for an endpoint: GET /users/{id} getUser → User (auth) */
export function endpointLine(api: ApiSpec, e: ApiEndpoint): string {
  const body = e.requestBody ? bodyOf(e.requestBody, api) : undefined;
  const ok = successOf(e);
  const res = ok ? bodyOf(e.responses[ok], api) : undefined;
  const query = endpointParams(api, e).filter((p) => p.in === "query").map((p) => p.name);
  const parts = [
    `${e.method.toUpperCase()} ${e.path}`,
    e.operationId,
    query.length ? `?${query.join("&")}` : "",
    body ? `body ${typeText(body.schema)}${body.type !== "application/json" ? ` (${body.type})` : ""}` : "",
    ok ? `→ ${ok}${res ? ` ${typeText(res.schema)}` : ""}` : "",
    e.pagination ? `pages by ${e.pagination.style} (${e.pagination.items})` : "",
    e.security?.length === 0 ? "public" : e.security?.length ? `auth ${e.security.map((r) => Object.keys(r).join("+")).join("|")}` : "",
    e.summary ? `— ${e.summary}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** The API in a few lines a model can read: info, servers, auth, each model with its fields, the endpoints by tag,
 *  the channels with their messages, and how many problems there are (the first few named). */
export function apiOutline(api: ApiSpec | undefined, o: { problems?: number } = {}): string {
  if (!api) return "The document has no API yet: add_model, add_endpoint, add_channel, or import_openapi / import_asyncapi.";
  const out: string[] = [];
  out.push(`API ${api.info?.title ?? "(untitled)"} ${api.info?.version ?? ""}`.trim());
  if (api.servers?.length) out.push(`Servers: ${api.servers.map((s) => `${s.env} ${s.url}${s.realtime ? ` (realtime ${s.realtime})` : ""}`).join("; ")}`);
  const a = api.auth;
  if (a) {
    const schemes = Object.entries(a.schemes).map(([n, s]) => `${n} (${s.type}${s.scheme ? ` ${s.scheme}` : ""}${s.bearerFormat ? ` ${s.bearerFormat}` : ""}${s.in ? ` in ${s.in} ${s.name}` : ""})`);
    out.push(`Auth: ${schemes.join(", ") || "no schemes"}; default ${a.security?.length ? a.security.map((r) => Object.keys(r).join("+")).join(" or ") : "none"}${a.login ? `; login ${a.login}` : ""}${a.refresh ? `; refresh ${a.refresh}` : ""}${a.logout ? `; logout ${a.logout}` : ""}`);
  }
  if (api.models?.length) {
    out.push(`Models (${api.models.length}):`);
    for (const m of api.models) {
      const rows = fieldRows(m.schema);
      out.push(`- ${m.name}${rows.length ? `: ${rows.map((r) => `${r.name}${r.required ? "" : "?"} ${r.type === "ref" ? r.ref : r.type === "array" ? `${r.ref ?? r.items}[]` : r.type}${r.format ? `(${r.format})` : ""}${r.enum ? `=${r.enum.join("|")}` : ""}${r.nullable ? "|null" : ""}`).join(", ")}` : ` = ${typeText(m.schema)}`}`);
    }
  }
  if (api.endpoints?.length) {
    out.push(`Endpoints (${api.endpoints.length}):`);
    const tags = [...new Set(api.endpoints.map(tagOf))];
    for (const t of tags) {
      if (tags.length > 1 || t) out.push(`  [${t || "untagged"}]`);
      for (const e of api.endpoints.filter((x) => tagOf(x) === t)) out.push(`- ${endpointLine(api, e)}`);
    }
  }
  if (api.channels?.length) {
    out.push(`Channels (${api.channels.length}):`);
    for (const c of api.channels) {
      const ops = c.operations.map((op) => `${op.id} server ${op.action}s ${(op.messages ?? c.messages.map((m) => m.name)).join(", ")}`);
      out.push(`- ${c.id} ${c.address}${c.transport === "sse" ? " (SSE)" : ""}: messages ${c.messages.map((m) => `${m.name} ${typeText(m.payload)}`).join(", ") || "none"}${ops.length ? `; ${ops.join("; ")}` : ""}`);
    }
  }
  const problems = apiProblems(api);
  const errors = problems.filter((p) => p.level === "error");
  if (problems.length) {
    const n = o.problems ?? 5;
    out.push(`Problems: ${errors.length} errors, ${problems.length - errors.length} warnings${n ? ":" : ""}`);
    for (const p of problems.slice(0, n)) out.push(`- ${p.level} ${p.at}: ${p.message}`);
  }
  return out.join("\n");
}

/** One endpoint in full, as stored, with what a caller needs besides: its parameters with references followed, the
 *  models it uses (their schemas), its security as it applies, its pagination with the defaults filled in, its
 *  problems. */
export function describeEndpoint(api: ApiSpec, e: ApiEndpoint) {
  const used = new Set<string>();
  const collect = (v: unknown) => {
    for (const m of schemaModels(v as JsonSchema)) used.add(m);
  };
  const walk = (v: unknown, depth = 0) => {
    if (depth > 30 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    for (const [k, x] of Object.entries(v)) {
      if (k === "schema") collect(x);
      else walk(x, depth + 1);
    }
  };
  walk({ p: e.parameters, b: e.requestBody, r: e.responses });
  /* the models those models use, all the way down: a name added while the set is walked is walked too, each once */
  for (const name of used) for (const m of schemaModels(api.models?.find((x) => x.name === name)?.schema)) used.add(m);
  const prefix = `endpoints.${e.operationId}`;
  return {
    endpoint: e,
    parameters: endpointParams(api, e),
    security: e.security ?? api.auth?.security ?? [],
    ...(e.pagination ? { pagination: paginationOf(e.pagination) } : {}),
    models: Object.fromEntries([...used].map((n) => [n, api.models?.find((m) => m.name === n)?.schema ?? "(missing)"])),
    problems: apiProblems(api)
      .filter((p) => p.at === prefix || p.at.startsWith(`${prefix}.`))
      .map((p) => `${p.level}: ${p.at}: ${p.message}`),
  };
}

/** One model in full: its schema, its fields, the TypeScript type it becomes, and where it is used. */
export function describeModel(api: ApiSpec, name: string, collections: { id: string; name: string; model?: string }[] = []) {
  const m = api.models?.find((x) => x.name === name);
  if (!m) return undefined;
  const prefix = `models.${name}`;
  return {
    name,
    schema: m.schema,
    fields: fieldRows(followRef(api, m.schema)),
    typescript: `type ${name} = ${schemaTypeTs(m.schema)};`,
    usedBy: [...modelUses(api, name), ...collections.filter((c) => c.model === name).map((c) => `data ${c.name || c.id}`)],
    problems: apiProblems(api)
      .filter((p) => p.at === prefix || p.at.startsWith(`${prefix}/`))
      .map((p) => `${p.level}: ${p.at}: ${p.message}`),
  };
}
