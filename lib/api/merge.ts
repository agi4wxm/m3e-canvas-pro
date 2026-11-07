/* An imported spec put into the API section a document already has. `merge` adds what the file has and replaces what
 * it has under the same name (a model, an endpoint by operationId, a channel by id, a server by environment), and
 * keeps the rest. `replace` makes the file's half of the API the file's: an OpenAPI file replaces the HTTP half
 * (endpoints, models, auth, servers' URLs, tags), an AsyncAPI file the realtime half (channels, servers' realtime
 * URLs); models a remaining half still refers to stay, so nothing is left pointing nowhere. */

import { cleanApi, compact } from "./clean";
import { schemaModels } from "./schema";
import type { ApiModel, ApiServer, ApiSpec } from "./types";

export type ImportMode = "merge" | "replace";

/** a list with the incoming entries put in by key: the same key replaced where it stood, new ones at the end */
function byKey<T>(current: T[] | undefined, incoming: T[] | undefined, key: (x: T) => string): T[] | undefined {
  if (!incoming?.length) return current;
  const out = [...(current ?? [])];
  for (const x of incoming) {
    const at = out.findIndex((y) => key(y) === key(x));
    if (at >= 0) out[at] = x;
    else out.push(x);
  }
  return out.length ? out : undefined;
}

/** the models some schemas refer to, and the models those refer to, all the way down */
function modelsNeeded(models: ApiModel[], roots: unknown[]): Set<string> {
  const need = new Set<string>();
  const queue = roots.flatMap((r) => schemaModels(r as never));
  /* a schema's references, wherever they stand in what is given */
  const refsIn = (v: unknown): string[] => {
    const text = JSON.stringify(v ?? null);
    return [...text.matchAll(/"#\/components\/schemas\/([^"/]+)/g)].map((m) => m[1].replace(/~1/g, "/").replace(/~0/g, "~"));
  };
  for (const r of roots) queue.push(...refsIn(r));
  while (queue.length && need.size < 5000) {
    const n = queue.pop()!;
    if (need.has(n)) continue;
    need.add(n);
    const m = models.find((x) => x.name === n);
    if (m) queue.push(...refsIn(m.schema));
  }
  return need;
}

/** servers put together by environment: the file's HTTP URL or realtime URL over the one there */
function mergeServers(current: ApiServer[] | undefined, incoming: ApiServer[] | undefined, half: "http" | "realtime", replace: boolean): ApiServer[] | undefined {
  if (!incoming?.length) return replace && half === "realtime" ? current?.map(({ realtime: _gone, ...s }) => s) : current;
  const out: ApiServer[] = (current ?? []).map((s) => (replace && half === "realtime" ? (({ realtime: _gone, ...rest }) => rest)(s) : s));
  for (const s of incoming) {
    const at = out.findIndex((x) => x.env === s.env);
    if (at < 0) out.push(s);
    else if (half === "http") out[at] = compact({ ...s, realtime: s.realtime ?? out[at].realtime });
    else out[at] = compact({ ...out[at], realtime: s.realtime, description: out[at].description ?? s.description });
  }
  if (replace && half === "http") {
    /* environments the file does not have keep only a realtime URL they had; without one they go */
    return out.filter((s) => incoming.some((x) => x.env === s.env) || s.realtime).map((s) => (incoming.some((x) => x.env === s.env) ? s : { ...s, url: "/" }));
  }
  return out.length ? out : undefined;
}

/** The API section with an imported spec put in (see the top of this file), in the shape loading gives it (cleanApi).
 *  `format` says which half the file is. */
export function mergeApi(current: ApiSpec | undefined, incoming: ApiSpec, format: "openapi" | "asyncapi", mode: ImportMode): ApiSpec | undefined {
  const cur = current ?? {};
  const replace = mode === "replace";
  if (format === "openapi") {
    const endpoints = replace ? incoming.endpoints : byKey(cur.endpoints, incoming.endpoints, (e) => e.operationId);
    let models = replace ? incoming.models : byKey(cur.models, incoming.models, (m) => m.name);
    if (replace && cur.models?.length) {
      /* what the channels refer to stays */
      const need = modelsNeeded(cur.models, (cur.channels ?? []).map((c) => c.messages));
      const keep = cur.models.filter((m) => need.has(m.name) && !incoming.models?.some((x) => x.name === m.name));
      models = [...(incoming.models ?? []), ...keep];
    }
    const out: ApiSpec = compact({
      ...cur,
      info: incoming.info ?? cur.info,
      servers: mergeServers(cur.servers, incoming.servers, "http", replace),
      models: models?.length ? models : undefined,
      endpoints: endpoints?.length ? endpoints : undefined,
      tags: replace ? incoming.tags : byKey(cur.tags, incoming.tags, (t) => t.name),
      auth: replace ? incoming.auth : incoming.auth ? compact({ ...cur.auth, ...incoming.auth, schemes: { ...cur.auth?.schemes, ...incoming.auth.schemes } }) : cur.auth,
      extra: compact({ ...cur.extra, openapi: replace ? incoming.extra?.openapi : incoming.extra?.openapi ? { ...cur.extra?.openapi, ...incoming.extra.openapi } : cur.extra?.openapi }),
    });
    if (out.extra && !Object.keys(out.extra).length) delete out.extra;
    return cleanApi(out);
  }
  const channels = replace ? incoming.channels : byKey(cur.channels, incoming.channels, (c) => c.id);
  const out: ApiSpec = compact({
    ...cur,
    info: cur.info ?? incoming.info,
    servers: mergeServers(cur.servers, incoming.servers, "realtime", replace),
    /* models are shared with the HTTP half: the file's are put in, none taken away */
    models: byKey(cur.models, incoming.models, (m) => m.name),
    channels: channels?.length ? channels : undefined,
    extra: compact({ ...cur.extra, asyncapi: replace ? incoming.extra?.asyncapi : incoming.extra?.asyncapi ? { ...cur.extra?.asyncapi, ...incoming.extra.asyncapi } : cur.extra?.asyncapi }),
  });
  if (out.extra && !Object.keys(out.extra).length) delete out.extra;
  return cleanApi(out);
}
