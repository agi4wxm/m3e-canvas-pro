/* The realtime half of the API section as an AsyncAPI 3.0 document, and back. The document describes the back end, as
 * the OpenAPI one does: an operation with action `send` is a message the server sends to the app (a new chat message
 * pushed to the room), `receive` one the server takes from the app (a message the user sends). Channels hold their
 * messages inline; operations name their channel and messages by reference; the models are components.schemas, so a
 * payload refers to a model the same way an HTTP body does. */

import { cleanApi, compact, freeName, MODEL_NAME, modelNameFor } from "./clean";
import { define, isRecord, mapRefs, resolvePointer } from "./schema";
import { MODEL_REF, decodePointer, encodePointer, modelRef, type ApiChannel, type ApiChannelOperation, type ApiMessage, type ApiModel, type ApiServer, type ApiSpec, type JsonSchema } from "./types";
import { ApiImportError, specValue, type ImportReport, type SpecSource } from "./openapi";
import { apiProblems } from "./validate";
import { toYaml } from "./yaml";

export const ASYNCAPI_VERSION = "3.0.0";

/* ---------- writing ---------- */

/** an environment's realtime URL as an AsyncAPI 3.0 Server object */
export function asyncServer(s: ApiServer): Record<string, unknown> | undefined {
  const url = s.realtime;
  if (!url) return undefined;
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (!m) return undefined;
  return compact({ host: m[2], protocol: m[1].toLowerCase(), pathname: m[3] && m[3] !== "/" ? m[3] : undefined, description: s.description });
}

const messageObject = (m: ApiMessage) => compact({ name: m.name, title: m.title, summary: m.summary, description: m.description, contentType: m.contentType, headers: m.headers, payload: m.payload, examples: m.examples, ...m.extra });

/** The channels as an AsyncAPI 3.0 document (plain data): asyncapi, info, defaultContentType, the servers of the
 *  environments with a realtime URL, channels with their messages, operations naming them by reference, and the
 *  models as components.schemas. */
export function asyncApiObject(doc: SpecSource): Record<string, unknown> {
  const api = doc.api ?? {};
  const { components: extraComponents, ...rest } = { ...api.extra?.asyncapi } as Record<string, unknown> & { components?: Record<string, unknown> };
  const servers: Record<string, unknown> = {};
  for (const s of api.servers ?? []) {
    const o = asyncServer(s);
    if (o) define(servers, s.env, o);
  }
  const channels: Record<string, unknown> = {};
  const operations: Record<string, unknown> = {};
  for (const c of api.channels ?? []) {
    const messages: Record<string, unknown> = {};
    for (const m of c.messages) define(messages, m.name, messageObject(m));
    define(
      channels,
      c.id,
      compact({
        address: c.address,
        title: c.title,
        summary: c.summary,
        description: c.description,
        messages,
        parameters: c.parameters && Object.keys(c.parameters).length ? c.parameters : undefined,
        "x-m3e-transport": c.transport,
        ...c.extra,
      }),
    );
    const channelRef = `#/channels/${encodePointer(c.id)}`;
    for (const o of c.operations) {
      /* left out, the operation carries every message of its channel, as AsyncAPI reads an operation without them */
      define(
        operations,
        o.id,
        compact({
          action: o.action,
          channel: { $ref: channelRef },
          summary: o.summary,
          description: o.description,
          messages: o.messages?.map((n) => ({ $ref: `${channelRef}/messages/${encodePointer(n)}` })),
          ...o.extra,
        }),
      );
    }
  }
  const schemas: Record<string, unknown> = {};
  for (const m of api.models ?? []) define(schemas, m.name, m.schema);
  const components = compact({ schemas: Object.keys(schemas).length ? schemas : undefined, ...(isRecord(extraComponents) ? extraComponents : {}) });
  return compact({
    asyncapi: ASYNCAPI_VERSION,
    info: compact({ title: api.info?.title || doc.title || "API", version: api.info?.version || "1.0.0", description: api.info?.description }),
    defaultContentType: typeof rest.defaultContentType === "string" ? rest.defaultContentType : "application/json",
    servers: Object.keys(servers).length ? servers : undefined,
    channels,
    operations,
    components: Object.keys(components).length ? components : undefined,
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "defaultContentType")),
  });
}

/** The channels as AsyncAPI 3.0 YAML: asyncapi.yaml. The same document always gives the same text. */
export function toAsyncApi(doc: SpecSource): string {
  return toYaml(asyncApiObject(doc));
}

/* ---------- reading ---------- */

const others = (o: Record<string, unknown>, known: string[]) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) define(out, k, v);
  return Object.keys(out).length ? out : undefined;
};

/** Reads an AsyncAPI 3.0 document (YAML, JSON or parsed) into the channels of an API section, with the models of its
 *  components.schemas and the realtime URLs of its servers. Messages a channel refers to (components.messages) are
 *  written into the channel. Throws ApiImportError for what is no AsyncAPI 3 document (2.x included). */
export function fromAsyncApi(input: unknown): { api: ApiSpec; report: ImportReport } {
  const doc = specValue(input);
  const version = typeof doc.asyncapi === "string" ? doc.asyncapi : "";
  if (version.startsWith("2.")) throw new ApiImportError("AsyncAPI 2 is not supported: convert it to 3.0 first (asyncapi convert), then import that.");
  if (!/^3\.\d+(?:\.\d+)?$/.test(version)) throw new ApiImportError(doc.openapi !== undefined ? "This is an OpenAPI document: import it as OpenAPI." : `This is not an AsyncAPI 3 document (asyncapi: ${JSON.stringify(doc.asyncapi ?? null)}).`);
  const report: ImportReport = { format: "asyncapi", version, models: 0, endpoints: 0, channels: 0, converted: [], kept: [], dropped: [], problems: [] };
  const components = isRecord(doc.components) ? doc.components : {};

  const renamed = new Map<string, string>();
  const taken = new Set<string>();
  const models: ApiModel[] = [];
  for (const [name, s] of Object.entries(isRecord(components.schemas) ? components.schemas : {})) {
    const n = freeName(MODEL_NAME.test(name) ? name : modelNameFor(name), taken);
    taken.add(n);
    if (n !== name) {
      renamed.set(name, n);
      report.converted.push(`model ${JSON.stringify(name)} is called ${n}`);
    }
    if (isRecord(s) && typeof s.schemaFormat === "string" && isRecord(s.schema)) report.converted.push(`the ${s.schemaFormat} schema of ${name} is read as JSON Schema`);
    models.push({ name: n, schema: (isRecord(s) && typeof s.schemaFormat === "string" && s.schema !== undefined ? s.schema : s) as JsonSchema });
  }
  const fixRefs = <T>(v: T): T =>
    renamed.size
      ? mapRefs(v, (ref) => {
          if (!ref.startsWith(MODEL_REF)) return ref;
          const [head, ...tail] = ref.slice(MODEL_REF.length).split("/");
          const to = renamed.get(decodePointer(head));
          return to ? [modelRef(to), ...tail].join("/") : ref;
        })
      : v;

  /* a message, its reference followed; a payload given with a schemaFormat is read as its schema */
  const messageOf = (name: string, raw: unknown): ApiMessage | undefined => {
    let m = raw;
    for (let i = 0; i < 8 && isRecord(m) && typeof m.$ref === "string"; i++) m = resolvePointer(doc, m.$ref);
    if (!isRecord(m)) {
      report.dropped.push(`the message ${name}: its reference leads nowhere`);
      return undefined;
    }
    let payload = m.payload;
    if (isRecord(payload) && typeof payload.schemaFormat === "string" && payload.schema !== undefined) {
      report.converted.push(`the ${payload.schemaFormat} payload of ${name} is read as JSON Schema`);
      payload = payload.schema;
    }
    return compact({
      name,
      title: typeof m.title === "string" ? m.title : undefined,
      summary: typeof m.summary === "string" ? m.summary : undefined,
      description: typeof m.description === "string" ? m.description : undefined,
      contentType: typeof m.contentType === "string" ? m.contentType : undefined,
      payload: payload as JsonSchema | undefined,
      headers: m.headers as JsonSchema | undefined,
      examples: Array.isArray(m.examples) ? (m.examples.filter(isRecord) as ApiMessage["examples"]) : undefined,
      extra: others(m, ["name", "title", "summary", "description", "contentType", "payload", "headers", "examples"]),
    });
  };

  const channels: ApiChannel[] = [];
  const byRef = new Map<string, ApiChannel>();
  const usedMessageRefs = new Set<string>();
  for (const [id, raw] of Object.entries(isRecord(doc.channels) ? doc.channels : {})) {
    let c = raw;
    if (isRecord(c) && typeof c.$ref === "string") c = resolvePointer(doc, c.$ref);
    if (!isRecord(c)) continue;
    const messages: ApiMessage[] = [];
    for (const [name, m] of Object.entries(isRecord(c.messages) ? c.messages : {})) {
      if (isRecord(m) && typeof m.$ref === "string") usedMessageRefs.add(m.$ref);
      const msg = messageOf(name, m);
      if (msg) {
        /* a message's own `name` field, when it differs from its key, is kept with it */
        if (isRecord(m) && typeof m.name === "string" && m.name !== name) msg.extra = { ...msg.extra, name: m.name };
        else if (isRecord(m) && typeof m.$ref === "string") {
          const target = resolvePointer(doc, m.$ref);
          if (isRecord(target) && typeof target.name === "string" && target.name !== name) msg.extra = { ...msg.extra, name: target.name };
        }
        messages.push(fixRefs(msg));
      }
    }
    const transport = c["x-m3e-transport"] === "sse" || c["x-m3e-transport"] === "websocket" ? c["x-m3e-transport"] : undefined;
    const channel: ApiChannel = compact({
      id,
      address: typeof c.address === "string" ? c.address : c.address === null ? "" : `/${id}`,
      title: typeof c.title === "string" ? c.title : undefined,
      summary: typeof c.summary === "string" ? c.summary : undefined,
      description: typeof c.description === "string" ? c.description : undefined,
      transport,
      parameters: isRecord(c.parameters) ? (c.parameters as ApiChannel["parameters"]) : undefined,
      messages,
      operations: [],
      extra: others(c, ["address", "title", "summary", "description", "messages", "parameters", "x-m3e-transport"]),
    });
    if (c.address === null) report.converted.push(`the channel ${id} has a dynamic address (null): it is written as an empty one`);
    if (channel.extra) report.kept.push(`${Object.keys(channel.extra).join(", ")} of the channel ${id}`);
    channels.push(channel);
    byRef.set(`#/channels/${encodePointer(id)}`, channel);
  }
  if (usedMessageRefs.size) report.converted.push("messages the channels referred to (components.messages) are written into their channels");

  for (const [id, raw] of Object.entries(isRecord(doc.operations) ? doc.operations : {})) {
    if (!isRecord(raw)) continue;
    const ref = isRecord(raw.channel) && typeof raw.channel.$ref === "string" ? raw.channel.$ref : "";
    const channel = byRef.get(ref);
    if (!channel) {
      report.dropped.push(`the operation ${id}: its channel ${JSON.stringify(ref)} is not one of the document's`);
      continue;
    }
    if (raw.action !== "send" && raw.action !== "receive") {
      report.dropped.push(`the operation ${id}: action should be send or receive`);
      continue;
    }
    const names = Array.isArray(raw.messages)
      ? raw.messages.map((m) => {
          const r = isRecord(m) && typeof m.$ref === "string" ? m.$ref : "";
          const local = `${ref}/messages/`;
          if (r.startsWith(local)) return decodePointer(r.slice(local.length));
          /* a message named through components: the channel's message that came from the same reference */
          const found = Object.entries(isRecord((resolvePointer(doc, ref) as Record<string, unknown>)?.messages) ? ((resolvePointer(doc, ref) as Record<string, unknown>).messages as Record<string, unknown>) : {}).find(([, x]) => isRecord(x) && x.$ref === r);
          return found ? found[0] : "";
        })
      : undefined;
    const op: ApiChannelOperation = compact({
      id,
      action: raw.action,
      messages: names?.filter(Boolean),
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      description: typeof raw.description === "string" ? raw.description : undefined,
      extra: others(raw, ["action", "channel", "messages", "summary", "description"]),
    });
    if (op.extra) report.kept.push(`${Object.keys(op.extra).join(", ")} of the operation ${id}`);
    channel.operations.push(op);
  }

  const servers: ApiServer[] = [];
  for (const [env, s] of Object.entries(isRecord(doc.servers) ? doc.servers : {})) {
    if (!isRecord(s) || typeof s.host !== "string" || typeof s.protocol !== "string") continue;
    servers.push(compact({ env, url: "", realtime: `${s.protocol}://${s.host}${typeof s.pathname === "string" ? s.pathname : ""}`, description: typeof s.description === "string" ? s.description : undefined }));
    const rest = others(s, ["host", "protocol", "pathname", "description"]);
    if (rest) report.dropped.push(`${Object.keys(rest).join(", ")} of the server ${env} (a server is its URL here)`);
  }

  const extraComponents = others(components, ["schemas", "messages"]);
  if (extraComponents) report.kept.push(`the reusable ${Object.keys(extraComponents).join(", ")} of components`);
  const top = others(doc, ["asyncapi", "info", "servers", "channels", "operations", "components"]);
  if (top) report.kept.push(Object.keys(top).join(", "));
  const info = isRecord(doc.info) ? doc.info : {};
  const asyncExtra = compact({ ...top, components: extraComponents });
  const raw: ApiSpec = compact({
    info: compact({ title: typeof info.title === "string" ? info.title : undefined, version: info.version !== undefined ? String(info.version) : undefined, description: typeof info.description === "string" ? info.description : undefined }),
    /* a server here has only its realtime URL until it is merged with the HTTP one of the same name */
    servers: servers.length ? servers.map((s) => ({ ...s, url: s.url || "/" })) : undefined,
    models: models.length ? models.map((m) => fixRefs(m)) : undefined,
    channels: channels.length ? channels : undefined,
    extra: Object.keys(asyncExtra).length ? { asyncapi: asyncExtra } : undefined,
  });
  const api = cleanApi(raw) ?? {};
  report.models = api.models?.length ?? 0;
  report.channels = api.channels?.length ?? 0;
  report.problems = apiProblems(api).map((p) => `${p.level}: ${p.at}: ${p.message}`);
  return { api, report };
}
