/* The tools that read the mock library (lib/mocks): its settings in a few lines, the records a model has, and what the
 * mocks answer to calls, tried on a fresh session of their own. None of them changes the document. The mocks (the
 * generator and its words) load only when one of these runs. */

import { tool, ToolFailure, type Tool } from "./types";

/** files in an answer, shortened: a data URL of a picture (or a file's base64 or text in a field) is kilobytes the
 *  model has no use for */
const lean = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === "string" && ((x.startsWith("data:") && x.length > 100) || x.length > 2000) ? `${x.slice(0, 40)}…(${x.length} chars)` : x)));

const getMocks = tool<Record<string, never>>({
  name: "get_mocks",
  group: "read",
  description:
    "The mock library in a few lines: seed, locale, latency, sign-in; how each operation is answered (list, get, create, update, delete, singleton, upload, download, login…, the model and paging); each model's record count, pinned records and every field's hint (* = the author's, the rest read from the field names); the scenarios; the files; the realtime scripts.",
  input: { type: "object", properties: {}, required: [], additionalProperties: false },
  output: "the outline as text",
  readOnly: true,
  destructive: false,
  async run(_a, env) {
    const { mocksOutline } = await import("../mocks/outline");
    const s = env.store.get();
    return { result: mocksOutline(s.doc.api, s.doc.mocks, { locale: env.store.options.lang() }) };
  },
});

const listMockRecords = tool<{ model: string; offset?: number; limit?: number; scenario?: string }>({
  name: "list_mock_records",
  group: "read",
  description: "The records the mocks have for a model, pinned ones first, as the app would get them (files shortened). A scenario's record counts apply when it is named.",
  input: { type: "object", properties: { model: { type: "string" }, offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 50 }, scenario: { type: "string" } }, required: ["model"], additionalProperties: false },
  output: "{model, total, pinned, records}",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    const s = env.store.get();
    if (!s.doc.api?.models?.some((m) => m.name === a.model)) throw new ToolFailure("not_found", `There is no model ${JSON.stringify(a.model)}.`, "get_api lists the models.");
    const { MockData } = await import("../mocks/data");
    const scenario = a.scenario ? s.doc.mocks?.scenarios?.find((x) => x.id === a.scenario) : undefined;
    if (a.scenario && !scenario) throw new ToolFailure("not_found", `There is no scenario ${JSON.stringify(a.scenario)}.`, "get_mocks lists the scenarios.");
    const data = new MockData({ api: s.doc.api, mocks: s.doc.mocks, collections: s.doc.collections }, { locale: s.doc.mocks?.locale ?? (env.store.options.lang() as "en"), counts: scenario?.counts });
    const all = data.records(a.model);
    const from = a.offset ?? 0;
    return { result: { model: a.model, total: all.length, pinned: data.pinned(a.model).length, records: lean(all.slice(from, from + (a.limit ?? 5))) } };
  },
});

type Call = { operationId?: string; method?: string; path?: string; params?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> };

const tryMock = tool<{ calls: Call[]; scenario?: string }>({
  name: "try_mock",
  group: "read",
  description:
    'Calls the API the way the app would, answered by the mocks on a fresh session (what one call makes, the next sees: create then list), with no waiting: each call by operationId with params for its path (or method and path), query, body, headers. e.g. {calls: [{operationId: "createProduct", body: {...}}, {operationId: "listProducts", query: {limit: 2}}], scenario: "new-user"}. A later call can use an earlier answer\'s token as "Bearer {{0.accessToken}}" (call index, then field).',
  input: {
    type: "object",
    properties: {
      calls: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "object", properties: { operationId: { type: "string" }, method: { type: "string" }, path: { type: "string" }, params: { type: "object" }, query: { type: "object" }, body: {}, headers: { type: "object" } }, additionalProperties: false },
      },
      scenario: { type: "string", description: "a scenario's id (the document's own choice when left out; \"\" for none)" },
    },
    required: ["calls"],
    additionalProperties: false,
  },
  output: "[{status, headers, body}] in order (files shortened)",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    const s = env.store.get();
    if (!s.doc.api?.endpoints?.length) throw new ToolFailure("not_found", "The API has no endpoints to call.", "add_endpoint or import_openapi first.");
    if (a.scenario && !s.doc.mocks?.scenarios?.some((x) => x.id === a.scenario)) throw new ToolFailure("not_found", `There is no scenario ${JSON.stringify(a.scenario)}.`, "get_mocks lists the scenarios.");
    const { createMockTransport, fakeClock } = await import("../mocks");
    const transport = createMockTransport({ api: s.doc.api, mocks: s.doc.mocks, collections: s.doc.collections }, { scenario: a.scenario, latency: false, clock: fakeClock(Date.now()), locale: s.doc.mocks?.locale ?? (env.store.options.lang() as "en") });
    const answers: { status: number; headers: Record<string, string>; body: unknown }[] = [];
    /* {{0.accessToken}}: a field of an earlier answer */
    const fill = (v: unknown): unknown => {
      if (typeof v === "string")
        return v.replace(/\{\{(\d+)\.([\w.]+)\}\}/g, (all, i: string, path: string) => {
          const found = path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), answers[Number(i)]?.body);
          return found === undefined ? all : String(found);
        });
      if (Array.isArray(v)) return v.map(fill);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
      return v;
    };
    for (const [i, raw] of a.calls.entries()) {
      const c = fill(raw) as Call;
      const e = c.operationId ? s.doc.api.endpoints.find((x) => x.operationId === c.operationId) : undefined;
      if (c.operationId && !e) throw new ToolFailure("not_found", `calls[${i}]: there is no operation ${JSON.stringify(c.operationId)}.`, "get_api lists them.");
      const template = e?.path ?? c.path;
      if (!template) throw new ToolFailure("bad_args", `calls[${i}] needs an operationId, or a method and a path.`);
      const path = template.replace(/\{([^{}]+)\}/g, (all, name: string) => (c.params?.[name] !== undefined ? encodeURIComponent(String(c.params[name])) : all));
      const res = await transport.request({ operationId: e?.operationId, method: (e?.method ?? c.method ?? "get").toUpperCase() as "GET", path, query: c.query as Record<string, string>, headers: c.headers, body: c.body });
      answers.push({ status: res.status, headers: { ...res.headers }, body: res.body });
    }
    transport.close();
    return { result: answers.map((x) => ({ ...x, body: lean(x.body) })) };
  },
});

export const MOCK_READ_TOOLS: Tool<never>[] = [getMocks, listMockRecords, tryMock] as unknown as Tool<never>[];
