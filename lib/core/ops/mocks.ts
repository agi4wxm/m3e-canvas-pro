/* Operations on the mock library (Doc.mocks, lib/mocks, docs/模拟库.md): its settings, each model's hints, count and
 * pinned records, the scenarios, the files, the realtime scripts, signing in, how an operation is answered, and
 * "fill the mocks for this API" in one step. What they write is cleaned the way a file read in is (lib/mocks/clean.ts),
 * and what names the API (a model, a field, an operation, a channel, a message) must be there, so a mock setting never
 * points at nothing. Changing the document's fields, each is one undo step of the whole document. */

import { isRecord } from "../../api/schema";
import type { JsonSchemaObject } from "../../api/types";
import { cleanFile, cleanHint, cleanMocks, MOCK_ID, MOCK_LIMITS } from "../../mocks/clean";
import { modelShape } from "../../mocks/shape";
import { fillMocks } from "../../mocks/fill";
import { FILE_KINDS, formatOf, FORMATS, placeholderFile, type BasicKind, type FileKind } from "../../mocks/files";
import { MOCK_KINDS, MOCK_LOCALES, MOCK_ROUTE_KINDS, type MockAuth, type MockFile, type MockHint, type MockLocale, type MockModelConfig, type MockOpRule, type MockRealtimeScript, type MockRouteKind, type MockScenario, type MockSpec } from "../../mocks/types";
import { op, OpError, S, type Schema } from "../op";
import { withDoc, type CoreState } from "../state";

const mocksOf = (s: CoreState): MockSpec => s.doc.mocks ?? {};

/** the state with the mock settings replaced, in the shape loading gives them */
function withMocks(s: CoreState, next: MockSpec): CoreState {
  const mocks = cleanMocks(next);
  return withDoc(s, { mocks });
}

const nothing = (what: string) => new OpError("nothing_to_do", `${what} is that already.`);

/** the editor's language as a locale of the mocks */
const localeOf = (lang: string): MockLocale => ((MOCK_LOCALES as readonly string[]).includes(lang) ? (lang as MockLocale) : "en");

function modelNames(s: CoreState): string[] {
  return (s.doc.api?.models ?? []).map((m) => m.name);
}

function needModel(s: CoreState, name: string) {
  const names = modelNames(s);
  if (!names.includes(name)) throw new OpError("not_found", `There is no model ${JSON.stringify(name)} in the API.${names.length ? ` The models are: ${names.join(", ")}.` : " The API has no models yet: add_model makes one."}`, name);
}

function operationIds(s: CoreState): string[] {
  return (s.doc.api?.endpoints ?? []).map((e) => e.operationId);
}

function needOperation(s: CoreState, id: string, at: string) {
  const ids = operationIds(s);
  if (!ids.includes(id)) throw new OpError("not_found", `${at}: there is no operation ${JSON.stringify(id)}.${ids.length ? ` The operations are: ${ids.slice(0, 60).join(", ")}.` : ""}`, id);
}

/** a hint's field path must start at a field of the model: "name", "price.amount", "images[]" */
function needField(s: CoreState, model: string, path: string) {
  const shape = modelShape(s.doc.api ?? {}, model);
  const fields = isRecord(shape?.properties) ? Object.keys(shape!.properties as object) : [];
  const first = path.split(/[.[]/)[0];
  if (!fields.includes(first)) throw new OpError("invalid_value", `${JSON.stringify(path)} is not a field of ${model}: a path starts at one of its fields (${fields.join(", ") || "it has none"}), like "name", "price.amount" or "images[]".`, path);
}

const HINT: Schema = {
  type: ["object", "null"],
  description: `how one field is made: {kind} plus what narrows it. kind: ${MOCK_KINDS.join(", ")}. min/max for numbers and list lengths; from/to for dates ("-30d", "+7d", "now", an ISO date); weights {value: weight} for an enum or status; values: words to pick from; value for constant; files: mock file ids for image/file/audio/video; type: the file's format for image/file/audio/video, a media type or an extension (text/csv, xlsx, model/gltf-binary, png); nullRate 0-1. null removes the hint (back to what the field's name says)`,
};
const RULE_WORDS =
  '{status (an error to answer with: 401, 404, 500…), body (the body to answer with), latencyMs, network (true: no answer arrives), empty (lists start empty, details 404), fixtures ("all" or record ids: only pinned records), sequence ([steps] answered in turn for retries; the last repeats)}';
const RULE: Schema = { type: ["object", "null"], description: `how an operation answers in the scenario: ${RULE_WORDS}` };
const RANGE = (d: string): Schema => ({ type: ["object", "null"], properties: { min: { type: "number", minimum: 0 }, max: { type: "number", minimum: 0 } }, required: ["min", "max"], additionalProperties: false, description: d });

function checkHint(h: unknown, at: string): MockHint {
  const c = cleanHint(h, { nodes: 50_000 });
  if (!c) throw new OpError("invalid_value", `${at}: a hint is {kind, …} with kind one of ${MOCK_KINDS.join(", ")}.`, at);
  return c;
}

/* ---------- settings ---------- */

export const setMocks = op<{ seed?: number; locale?: MockLocale | null; scenario?: string | null; latency?: { min: number; max: number } | null; errorRate?: number | null }>({
  name: "set_mocks",
  summary:
    "Sets the mock library's settings: seed (the same seed, the same made-up data), locale (zh, en, ja, ko: names, words, addresses, phone numbers), scenario (the scenario the preview starts in; null for none), latency {min, max} in ms (null for the default 150–450), errorRate 0–1 (how often a call fails with 500).",
  args: S.obj({ seed: S.int("any whole number"), locale: { type: ["string", "null"], enum: [...MOCK_LOCALES, null] }, scenario: { type: ["string", "null"] }, latency: RANGE("how long answers take"), errorRate: { type: ["number", "null"], minimum: 0, maximum: 1 } }),
  label: () => "Mock settings",
  run(s, a) {
    const m = mocksOf(s);
    if (typeof a.scenario === "string" && !m.scenarios?.some((x) => x.id === a.scenario)) throw new OpError("not_found", `There is no scenario ${JSON.stringify(a.scenario)}.${m.scenarios?.length ? ` The scenarios are: ${m.scenarios.map((x) => x.id).join(", ")}.` : " add_mock_scenario or fill_mocks adds some."}`, a.scenario);
    const next: MockSpec = { ...m };
    if (a.seed !== undefined) next.seed = a.seed;
    if (a.locale !== undefined) next.locale = a.locale ?? undefined;
    if (a.scenario !== undefined) next.scenario = a.scenario ?? undefined;
    if (a.latency !== undefined) next.latency = a.latency ?? undefined;
    if (a.errorRate !== undefined) next.errorRate = a.errorRate ?? undefined;
    const out = withMocks(s, next);
    if (out === s) throw nothing("The mock settings");
    return { state: out };
  },
});

/* ---------- models ---------- */

export const setMockModel = op<{ model: string; count?: number | null; hints?: Record<string, MockHint | null>; regenerate?: boolean }, { model: string; count?: number; hints: string[] }>({
  name: "set_mock_model",
  summary:
    'Sets how a model\'s mock records are made: count (how many records, pinned ones included; null for the default 24), hints by field path ({"name": {kind: "personName"}, "price.amount": {kind: "price", min: 10, max: 99}, "createdAt": {kind: "dateTime", from: "-30d", to: "now"}, "status": {kind: "status", weights: {paid: 3, pending: 1}}, "avatar": {kind: "avatar", files: ["face1"]}}; null removes a hint), regenerate: true makes every record of this model anew (no other model\'s change).',
  args: S.obj({ model: S.str("the model's name"), count: { type: ["integer", "null"], minimum: 0, maximum: 5000 }, hints: { type: "object", additionalProperties: HINT, description: "hints by field path" }, regenerate: S.bool("make this model's records anew") }, ["model"]),
  label: () => "Mock model",
  run(s, a) {
    needModel(s, a.model);
    const m = mocksOf(s);
    const models = [...(m.models ?? [])];
    let at = models.findIndex((x) => x.name === a.model);
    if (at < 0) {
      models.push({ name: a.model });
      at = models.length - 1;
    }
    const config: MockModelConfig = { ...models[at] };
    if (a.count !== undefined) config.count = a.count ?? undefined;
    if (a.hints) {
      const hints = { ...config.hints };
      for (const [path, h] of Object.entries(a.hints)) {
        if (h === null) {
          delete hints[path];
          continue;
        }
        needField(s, a.model, path);
        hints[path] = checkHint(h, `hints.${path}`);
      }
      config.hints = Object.keys(hints).length ? hints : undefined;
    }
    if (a.regenerate) config.seed = (config.seed ?? 0) + 1;
    models[at] = config;
    const out = withMocks(s, { ...m, models });
    if (out === s || JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing(`The mocks of ${a.model}`);
    const saved = out.doc.mocks?.models?.find((x) => x.name === a.model);
    return { state: out, result: { model: a.model, ...(saved?.count !== undefined ? { count: saved.count } : {}), hints: Object.keys(saved?.hints ?? {}) } };
  },
});

export const pinMockRecords = op<{ model: string; records: Record<string, unknown>[]; replace?: boolean }, { model: string; pinned: number }>({
  name: "pin_mock_records",
  summary:
    "Pins records of a model by hand: they come first in its mock data, exactly as written (the rest are made up). A record with the id of one pinned already takes its place; replace: true makes these the only pinned records.",
  args: S.obj({ model: S.str(), records: S.arr(S.any("a record of the model, as JSON"), undefined, { minItems: 0 }), replace: S.bool() }, ["model", "records"]),
  label: () => "Pin mock records",
  run(s, a) {
    needModel(s, a.model);
    const m = mocksOf(s);
    const models = [...(m.models ?? [])];
    let at = models.findIndex((x) => x.name === a.model);
    if (at < 0) {
      models.push({ name: a.model });
      at = models.length - 1;
    }
    const shape = modelShape(s.doc.api ?? {}, a.model);
    const props = isRecord(shape?.properties) ? Object.keys(shape!.properties as object) : [];
    const idField = ["id", "_id", "uuid", "key", "code", "slug"].find((k) => props.includes(k));
    for (const [i, r] of a.records.entries()) {
      if (!isRecord(r)) throw new OpError("invalid_value", `records[${i}] should be an object, a record of ${a.model}.`);
      const unknown = Object.keys(r).filter((k) => !props.includes(k));
      if (props.length && unknown.length && (shape as JsonSchemaObject)?.additionalProperties === false) throw new OpError("invalid_value", `records[${i}] has fields ${a.model} does not: ${unknown.join(", ")}. Its fields are ${props.join(", ")}.`);
    }
    let fixtures = a.replace ? [] : [...(models[at].fixtures ?? [])];
    for (const r of a.records) {
      const same = idField && r[idField] !== undefined ? fixtures.findIndex((x) => String(x[idField]) === String(r[idField])) : -1;
      if (same >= 0) fixtures[same] = r;
      else fixtures.push(r);
    }
    fixtures = fixtures.slice(0, MOCK_LIMITS.fixtures);
    models[at] = { ...models[at], fixtures: fixtures.length ? fixtures : undefined };
    const out = withMocks(s, { ...m, models });
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing(`The pinned records of ${a.model}`);
    return { state: out, result: { model: a.model, pinned: out.doc.mocks?.models?.find((x) => x.name === a.model)?.fixtures?.length ?? 0 } };
  },
});

export const unpinMockRecords = op<{ model: string; ids?: string[]; all?: boolean }, { model: string; unpinned: number }>({
  name: "unpin_mock_records",
  summary: "Takes pinned records of a model away: those with these ids, or all of them. Made-up records take their place.",
  args: S.obj({ model: S.str(), ids: S.arr(S.str(), "the records' ids (their id field as text)"), all: S.bool() }, ["model"]),
  label: () => "Unpin mock records",
  run(s, a) {
    needModel(s, a.model);
    const m = mocksOf(s);
    const at = (m.models ?? []).findIndex((x) => x.name === a.model);
    const fixtures = at >= 0 ? (m.models![at].fixtures ?? []) : [];
    if (!fixtures.length) throw nothing(`${a.model} has no pinned records, so that`);
    if (!a.all && !a.ids?.length) throw new OpError("bad_args", "Say which records: ids, or all: true.");
    const shape = modelShape(s.doc.api ?? {}, a.model);
    const props = isRecord(shape?.properties) ? Object.keys(shape!.properties as object) : [];
    const idField = ["id", "_id", "uuid", "key", "code", "slug"].find((k) => props.includes(k));
    const keep = a.all ? [] : fixtures.filter((r) => !(idField && a.ids!.includes(String(r[idField]))));
    if (keep.length === fixtures.length) throw new OpError("not_found", `None of the pinned records of ${a.model} has those ids.${idField ? ` They are: ${fixtures.map((r) => String(r[idField])).join(", ")}.` : ""}`);
    const models = [...m.models!];
    models[at] = { ...models[at], fixtures: keep.length ? keep : undefined };
    return { state: withMocks(s, { ...m, models }), result: { model: a.model, unpinned: fixtures.length - keep.length } };
  },
});

/* ---------- scenarios ---------- */

const SCENARIO_FIELDS = {
  name: S.str("what it is called in the editor: 新用户, Lots of data"),
  description: S.str(),
  all: { type: ["object", "null"], description: `what every operation does in it: ${RULE_WORDS}` },
  ops: { type: "object", additionalProperties: RULE, description: "by operationId: how that operation answers (over `all`); null removes one" },
  latency: RANGE("how long every answer takes, in ms"),
  errorRate: { type: ["number", "null"], minimum: 0, maximum: 1, description: "how often a call fails with 500" },
  counts: { type: ["object", "null"], additionalProperties: { type: "integer", minimum: 0, maximum: 5000 }, description: 'records per model: {"*": 300} for every model, or by model name' },
  signedIn: { type: ["boolean", "null"], description: "false: the session starts signed out, secured endpoints answer 401 until the app signs in" },
};

function checkScenario(s: CoreState, sc: Partial<MockScenario>) {
  for (const id of Object.keys(sc.ops ?? {})) needOperation(s, id, `ops.${id}`);
  for (const model of Object.keys(sc.counts ?? {})) if (model !== "*") needModel(s, model);
}

/** a scenario's id from its name: words in Latin letters, else scenario-n */
function scenarioId(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "scenario";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

type ScenarioArgs = { id?: string; name?: string; description?: string; all?: MockOpRule | null; ops?: Record<string, MockOpRule | null>; latency?: { min: number; max: number } | null; errorRate?: number | null; counts?: Record<string, number> | null; signedIn?: boolean | null };

function applyScenario(base: MockScenario, a: ScenarioArgs): MockScenario {
  const out: MockScenario = { ...base };
  if (a.name !== undefined) out.name = a.name;
  if (a.description !== undefined) out.description = a.description || undefined;
  if (a.all !== undefined) out.all = a.all ?? undefined;
  if (a.ops) {
    const ops = { ...out.ops };
    for (const [id, r] of Object.entries(a.ops)) {
      if (r === null) delete ops[id];
      else ops[id] = r;
    }
    out.ops = Object.keys(ops).length ? ops : undefined;
  }
  if (a.latency !== undefined) out.latency = a.latency ?? undefined;
  if (a.errorRate !== undefined) out.errorRate = a.errorRate ?? undefined;
  if (a.counts !== undefined) out.counts = a.counts ?? undefined;
  if (a.signedIn !== undefined) out.signedIn = a.signedIn ?? undefined;
  return out;
}

export const addMockScenario = op<ScenarioArgs & { name: string }, { id: string }>({
  name: "add_mock_scenario",
  summary:
    'Adds a named scenario the app can be previewed in: e.g. {name: "Payment fails", ops: {payOrder: {status: 402}}}, {name: "Empty cart", ops: {getCart: {empty: true}}}, {name: "Flaky", ops: {listOrders: {sequence: [{network: true}, {status: 503}, {}]}}}, {name: "Slow", latency: {min: 2000, max: 3000}}, {name: "Signed out", signedIn: false}, {name: "Lots", counts: {"*": 300}}.',
  args: S.obj({ id: S.str("letters, digits, - _ . (made from the name when left out)"), ...SCENARIO_FIELDS }, ["name"]),
  label: () => "Add scenario",
  run(s, a) {
    const m = mocksOf(s);
    const taken = new Set((m.scenarios ?? []).map((x) => x.id));
    if (a.id !== undefined && !MOCK_ID.test(a.id)) throw new OpError("invalid_value", `${JSON.stringify(a.id)} cannot be a scenario's id: letters, digits, - _ . up to 64.`);
    if (a.id && taken.has(a.id)) throw new OpError("invalid_value", `There is a scenario ${JSON.stringify(a.id)} already: update_mock_scenario changes it.`);
    if ((m.scenarios?.length ?? 0) >= MOCK_LIMITS.scenarios) throw new OpError("refused", `A document has at most ${MOCK_LIMITS.scenarios} scenarios.`);
    const id = a.id ?? scenarioId(a.name, taken);
    const sc = applyScenario({ id, name: a.name }, a);
    checkScenario(s, sc);
    return { state: withMocks(s, { ...m, scenarios: [...(m.scenarios ?? []), sc] }), result: { id } };
  },
});

export const updateMockScenario = op<ScenarioArgs & { id: string; rename?: string }, { id: string }>({
  name: "update_mock_scenario",
  summary: "Changes a scenario: its name, words, what every operation does (all), how single operations answer (ops: merged by operationId; null removes one), latency, error rate, record counts, whether it starts signed in; rename gives it another id.",
  args: S.obj({ id: S.str(), rename: S.str("a new id"), ...SCENARIO_FIELDS }, ["id"]),
  label: () => "Scenario",
  run(s, a) {
    const m = mocksOf(s);
    const at = (m.scenarios ?? []).findIndex((x) => x.id === a.id);
    if (at < 0) throw new OpError("not_found", `There is no scenario ${JSON.stringify(a.id)}.${m.scenarios?.length ? ` The scenarios are: ${m.scenarios.map((x) => x.id).join(", ")}.` : ""}`, a.id);
    let sc = applyScenario(m.scenarios![at], a);
    if (a.rename !== undefined && a.rename !== a.id) {
      if (!MOCK_ID.test(a.rename)) throw new OpError("invalid_value", `${JSON.stringify(a.rename)} cannot be a scenario's id: letters, digits, - _ . up to 64.`);
      if (m.scenarios!.some((x) => x.id === a.rename)) throw new OpError("invalid_value", `There is a scenario ${JSON.stringify(a.rename)} already.`);
      sc = { ...sc, id: a.rename };
    }
    checkScenario(s, sc);
    const scenarios = [...m.scenarios!];
    scenarios[at] = sc;
    const out = withMocks(s, { ...m, scenarios, ...(m.scenario === a.id && a.rename ? { scenario: a.rename } : {}) });
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing(`The scenario ${a.id}`);
    return { state: out, result: { id: sc.id } };
  },
});

export const removeMockScenario = op<{ id: string }, { removed: string }>({
  name: "remove_mock_scenario",
  summary: "Removes a scenario.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Remove scenario",
  run(s, a) {
    const m = mocksOf(s);
    if (!m.scenarios?.some((x) => x.id === a.id)) throw new OpError("not_found", `There is no scenario ${JSON.stringify(a.id)}.`, a.id);
    return { state: withMocks(s, { ...m, scenarios: m.scenarios.filter((x) => x.id !== a.id), scenario: m.scenario === a.id ? undefined : m.scenario }), result: { removed: a.id } };
  },
});

/* ---------- files ---------- */

const fileIdFor = (name: string, taken: Set<string>) => {
  const base =
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
};

export const addMockFile = op<{ id?: string; name: string; type?: string; data: string; tags?: string[] }, { id: string }>({
  name: "add_mock_file",
  summary:
    "Adds a file to the mock library: a picture, a PDF, audio, video or any other file, as a data URL (data:<type>;base64,…, up to about 12 MB). Image fields (avatar, photo, cover…) draw from the library's images, file fields from its PDFs, and so on; tags (avatar, product…) say what a picture is of. generate_image with mockFile paints one; generate_mock_files makes placeholders.",
  args: S.obj({ id: S.str("letters, digits, - _ . (made from the name when left out)"), name: S.str("its file name: receipt.pdf"), type: S.str("its media type; read from the data URL when left out"), data: S.str("data:<type>;base64,…"), tags: S.arr(S.str()) }, ["name", "data"]),
  label: () => "Add mock file",
  run(s, a) {
    const m = mocksOf(s);
    const taken = new Set((m.files ?? []).map((f) => f.id));
    if (a.id !== undefined && !MOCK_ID.test(a.id)) throw new OpError("invalid_value", `${JSON.stringify(a.id)} cannot be a file's id: letters, digits, - _ . up to 64.`);
    if (a.id && taken.has(a.id)) throw new OpError("invalid_value", `There is a mock file ${JSON.stringify(a.id)} already.`);
    if (!/^data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,/.test(a.data)) throw new OpError("invalid_value", "data should be a base64 data URL: data:<type>;base64,…");
    if (a.data.length > MOCK_LIMITS.fileChars) throw new OpError("invalid_value", `That file is too large for the mock library (at most about ${Math.round((MOCK_LIMITS.fileChars * 3) / 4 / 1_000_000)} MB).`);
    if ((m.files?.length ?? 0) >= MOCK_LIMITS.files) throw new OpError("refused", `The mock library holds at most ${MOCK_LIMITS.files} files.`);
    const id = a.id ?? fileIdFor(a.name, taken);
    const f = cleanFile({ id, name: a.name, type: a.type, data: a.data, tags: a.tags });
    if (!f) throw new OpError("invalid_value", "That is not a file the mock library can keep: a base64 data URL with a media type.");
    return { state: withMocks(s, { ...m, files: [...(m.files ?? []), f] }), result: { id } };
  },
});

/* What makes the files of the other formats (lib/mocks/formats) is too large for the editor's first bundle: it loads
   with the engine (the Mocks tab and the preview load it), or the first time an operation asks for one of them. Until
   then such an operation is turned down as busy, and the same call succeeds once it has loaded. */
let makers: typeof import("../../mocks/formats") | undefined;
let loadingMakers: Promise<unknown> | undefined;
/** loads what makes the mock library's files of every format; resolves once operations can make them */
export function loadMockMakers(): Promise<unknown> {
  loadingMakers ??= import("../../mocks/formats").then((m) => (makers = m));
  return loadingMakers;
}
const BASIC = new Set<FileKind>(["image", "avatar", "pdf", "audio", "video", "file"]);

export const generateMockFiles = op<{ kinds?: FileKind[]; types?: string[]; title?: string; count?: number; tags?: string[] }, { ids: string[] }>({
  name: "generate_mock_files",
  summary:
    "Makes placeholder files for the mock library without a model. kinds: image (an SVG picture with the title), avatar (initials on a circle), pdf (a PDF of a few pages), audio (a short WAV tone), video (a two-second MP4 clip), document (DOCX), spreadsheet (XLSX), presentation (PPTX), data (JSON), text (TXT), archive (ZIP), model (a GLB 3D model), file (a few bytes). types: exact formats, as media types or extensions: png, jpg, webp, gif, svg, bmp, ico, tif, avif, pdf, docx, xlsx, pptx, csv, tsv, json, ndjson, xml, yaml, geojson, gpx, kml, ics, vcf, txt, md, html, rtf, zip, gz, tar, wav, mp3, ogg, weba, m4a, mp4, webm, glb, gltf, obj, stl, ply. count of each (1–10).",
  args: S.obj({ kinds: S.arr(S.enum([...FILE_KINDS])), types: S.arr(S.str("a media type or an extension: text/csv, xlsx, model/gltf-binary")), title: S.str("the words the picture or the document shows"), count: S.int(undefined, { minimum: 1, maximum: 10 }), tags: S.arr(S.str()) }),
  label: () => "Make mock files",
  run(s, a) {
    const m = mocksOf(s);
    const taken = new Set((m.files ?? []).map((f) => f.id));
    const made: MockFile[] = [];
    const count = Math.max(1, Math.min(10, a.count ?? 1));
    const unknown = (a.types ?? []).filter((t) => !formatOf(t));
    if (unknown.length) throw new OpError("invalid_value", `The mock library makes no ${unknown.map((t) => JSON.stringify(t)).join(", ")} file: types are media types or extensions of ${FORMATS.map((f) => f.ext).join(", ")}.`);
    if (!a.kinds?.length && !a.types?.length) throw new OpError("invalid_value", "Say which files to make: kinds (image, pdf, spreadsheet, model…) or types (png, xlsx, glb, text/csv…).");
    const engine = makers;
    if (!engine && ((a.kinds ?? []).some((k) => !BASIC.has(k)) || a.types?.length)) {
      void loadMockMakers();
      throw new OpError("busy", "The mock library is still loading what makes files of that format: call generate_mock_files again in a moment.");
    }
    type Make = (o: { seed: string; title: string; id: string }) => MockFile;
    const asks: { label: string; make: Make }[] = [
      ...(a.kinds ?? []).map((kind) => ({ label: kind as string, make: ((o) => (BASIC.has(kind) ? placeholderFile(kind as BasicKind, o) : engine!.placeholderFile(kind, o))) as Make })),
      ...(a.types ?? []).map((t) => ({ label: formatOf(t)!.ext, make: ((o) => engine!.mockFile(formatOf(t)!.type, o)) as Make })),
    ];
    for (const ask of asks)
      for (let i = 0; i < count; i++) {
        const title = a.title ? (count > 1 ? `${a.title} ${i + 1}` : a.title) : `${ask.label} ${(m.files?.length ?? 0) + made.length + 1}`;
        const id = fileIdFor(`${ask.label}-${title}`, new Set([...taken, ...made.map((f) => f.id)]));
        const f = ask.make({ seed: `${id}:${s.doc.mocks?.seed ?? 1}`, title, id });
        made.push(a.tags?.length ? { ...f, tags: [...new Set([...(f.tags ?? []), ...a.tags])] } : f);
      }
    if ((m.files?.length ?? 0) + made.length > MOCK_LIMITS.files) throw new OpError("refused", `The mock library holds at most ${MOCK_LIMITS.files} files.`);
    return { state: withMocks(s, { ...m, files: [...(m.files ?? []), ...made] }), result: { ids: made.map((f) => f.id) } };
  },
});

export const updateMockFile = op<{ id: string; name?: string; tags?: string[] }, { id: string }>({
  name: "update_mock_file",
  summary: "Renames a file of the mock library or changes its tags.",
  args: S.obj({ id: S.str(), name: S.str(), tags: S.arr(S.str()) }, ["id"]),
  label: () => "Mock file",
  run(s, a) {
    const m = mocksOf(s);
    const at = (m.files ?? []).findIndex((f) => f.id === a.id);
    if (at < 0) throw new OpError("not_found", `There is no mock file ${JSON.stringify(a.id)}.`, a.id);
    const files = [...m.files!];
    files[at] = { ...files[at], ...(a.name !== undefined ? { name: a.name } : {}), ...(a.tags !== undefined ? { tags: a.tags.length ? a.tags : undefined } : {}) };
    const out = withMocks(s, { ...m, files });
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing(`The file ${a.id}`);
    return { state: out, result: { id: a.id } };
  },
});

export const removeMockFile = op<{ id: string }, { removed: string; hints: string[] }>({
  name: "remove_mock_file",
  summary: "Removes a file from the mock library; hints that named it no longer do.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Remove mock file",
  run(s, a) {
    const m = mocksOf(s);
    if (!m.files?.some((f) => f.id === a.id)) throw new OpError("not_found", `There is no mock file ${JSON.stringify(a.id)}.`, a.id);
    const touched: string[] = [];
    const models = m.models?.map((c) => {
      if (!c.hints) return c;
      const hints = Object.fromEntries(
        Object.entries(c.hints).map(([path, h]) => {
          if (!h.files?.includes(a.id)) return [path, h];
          touched.push(`${c.name}.${path}`);
          const files = h.files.filter((x) => x !== a.id);
          return [path, { ...h, files: files.length ? files : undefined }];
        }),
      );
      return { ...c, hints };
    });
    return { state: withMocks(s, { ...m, models, files: m.files.filter((f) => f.id !== a.id) }), result: { removed: a.id, hints: touched } };
  },
});

/* ---------- realtime ---------- */

export const setMockRealtime = op<{ id?: string; channel: string; trigger?: MockRealtimeScript["trigger"]; steps: MockRealtimeScript["steps"]; repeat?: MockRealtimeScript["repeat"] | null }, { id: string }>({
  name: "set_mock_realtime",
  summary:
    'Adds or replaces (by id) a realtime script: the messages the server sends over a channel, each at a time in ms after it starts, e.g. {channel: "chat", steps: [{at: 1000, message: "newMessage", payload: {text: "Hi!"}}, {at: 3000, message: "typing"}], repeat: {every: 8000, times: 3}}. trigger: {on: "connect"} (default), {on: "call", operationId} (after the app calls it), {on: "message", message} (an auto-reply to what the app sends). A payload left out is made from the message\'s schema; an object is laid over the made one.',
  args: S.obj(
    {
      id: S.str("letters, digits, - _ . (made from the channel when left out)"),
      channel: S.str("the channel's id"),
      trigger: { type: "object", description: '{on: "connect"} | {on: "call", operationId} | {on: "message", message}' },
      steps: S.arr(S.obj({ at: S.num("ms after the script starts", { minimum: 0 }), message: S.str("a message of the channel"), payload: { description: "what it carries (any JSON)" } }, ["at", "message"])),
      repeat: { type: ["object", "null"], properties: { every: { type: "number", minimum: 100 }, times: { type: "integer", minimum: 0 } }, required: ["every"], additionalProperties: false },
    },
    ["channel", "steps"],
  ),
  label: () => "Realtime script",
  run(s, a) {
    const channel = s.doc.api?.channels?.find((c) => c.id === a.channel);
    if (!channel) throw new OpError("not_found", `There is no channel ${JSON.stringify(a.channel)}.${s.doc.api?.channels?.length ? ` The channels are: ${s.doc.api.channels.map((c) => c.id).join(", ")}.` : " add_channel makes one."}`, a.channel);
    for (const [i, step] of a.steps.entries()) if (!channel.messages.some((m) => m.name === step.message)) throw new OpError("invalid_value", `steps[${i}]: the channel ${a.channel} has no message ${JSON.stringify(step.message)}. Its messages are: ${channel.messages.map((m) => m.name).join(", ") || "none"}.`);
    const t = a.trigger;
    if (t && t.on === "call") needOperation(s, t.operationId, "trigger");
    if (t && t.on === "message" && !channel.messages.some((m) => m.name === t.message)) throw new OpError("invalid_value", `trigger: the channel ${a.channel} has no message ${JSON.stringify(t.message)}.`);
    if (t && !["connect", "call", "message"].includes(t.on)) throw new OpError("invalid_value", 'trigger is {on: "connect"}, {on: "call", operationId} or {on: "message", message}.');
    const m = mocksOf(s);
    /* the first script written down takes the place of the defaults the channels played */
    const scripts = [...(m.realtime ?? [])];
    const taken = new Set(scripts.map((x) => x.id));
    if (a.id !== undefined && !MOCK_ID.test(a.id)) throw new OpError("invalid_value", `${JSON.stringify(a.id)} cannot be a script's id.`);
    let id = a.id ?? `${a.channel}-script`;
    if (!a.id) for (let i = 2; taken.has(id); i++) id = `${a.channel}-script-${i}`;
    const script: MockRealtimeScript = { id, channel: a.channel, ...(t ? { trigger: t } : {}), steps: a.steps, ...(a.repeat ? { repeat: a.repeat } : {}) };
    const at = scripts.findIndex((x) => x.id === id);
    if (at >= 0) scripts[at] = script;
    else scripts.push(script);
    return { state: withMocks(s, { ...m, realtime: scripts }), result: { id } };
  },
});

export const removeMockRealtime = op<{ id: string }, { removed: string }>({
  name: "remove_mock_realtime",
  summary: "Removes a realtime script.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Remove realtime script",
  run(s, a) {
    const m = mocksOf(s);
    if (!m.realtime?.some((x) => x.id === a.id)) throw new OpError("not_found", `There is no realtime script ${JSON.stringify(a.id)}.${m.realtime?.length ? ` The scripts are: ${m.realtime.map((x) => x.id).join(", ")}.` : ""}`, a.id);
    return { state: withMocks(s, { ...m, realtime: m.realtime.filter((x) => x.id !== a.id) }), result: { removed: a.id } };
  },
});

/* ---------- auth and routes ---------- */

export const setMockAuth = op<{ signedIn?: boolean | null; accept?: Record<string, string>[] | null; tokenTtl?: number | null; refreshTtl?: number | null }>({
  name: "set_mock_auth",
  summary:
    'How signing in behaves in the mocks: signedIn (true by default: secured calls work without a token; false: 401 until the app signs in), accept (the credentials the login endpoint takes, e.g. [{email: "demo@example.com", password: "demo1234"}]; null for any), tokenTtl (seconds an access token lasts; short to try the refresh flow), refreshTtl.',
  args: S.obj({ signedIn: { type: ["boolean", "null"] }, accept: { type: ["array", "null"], items: { type: "object", additionalProperties: { type: "string" } } }, tokenTtl: { type: ["integer", "null"], minimum: 1 }, refreshTtl: { type: ["integer", "null"], minimum: 1 } }),
  label: () => "Mock sign-in",
  run(s, a) {
    const m = mocksOf(s);
    const auth: MockAuth = { ...m.auth };
    for (const k of ["signedIn", "accept", "tokenTtl", "refreshTtl"] as const) if (a[k] !== undefined) (auth as Record<string, unknown>)[k] = a[k] ?? undefined;
    const out = withMocks(s, { ...m, auth });
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing("The mock sign-in");
    return { state: out };
  },
});

export const setMockRoute = op<{ operationId: string; kind?: MockRouteKind; model?: string | null }>({
  name: "set_mock_route",
  summary: `Says how the mocks answer an operation when its method and path do not say it plainly: kind ${MOCK_ROUTE_KINDS.join(", ")} ("auto" goes back to what REST conventions say), model (whose records it hands out).`,
  args: S.obj({ operationId: S.str(), kind: S.enum(MOCK_ROUTE_KINDS), model: { type: ["string", "null"] } }, ["operationId"]),
  label: () => "Mock route",
  run(s, a) {
    needOperation(s, a.operationId, "operationId");
    if (typeof a.model === "string") needModel(s, a.model);
    const m = mocksOf(s);
    const routes = (m.routes ?? []).filter((r) => r.operationId !== a.operationId);
    const was = m.routes?.find((r) => r.operationId === a.operationId);
    const kind = a.kind ?? was?.kind;
    const model = a.model === null ? undefined : (a.model ?? was?.model);
    if ((kind && kind !== "auto") || model) routes.push({ operationId: a.operationId, ...(kind && kind !== "auto" ? { kind } : {}), ...(model ? { model } : {}) });
    const out = withMocks(s, { ...m, routes });
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing(`How ${a.operationId} is answered`);
    return { state: out };
  },
});

/* ---------- all of it ---------- */

export const fillMocksOp = op<{ locale?: MockLocale; counts?: number; scenarios?: boolean; hints?: boolean }, { models: number; hints: number; scenarios: string[]; scripts: number }>({
  name: "fill_mocks",
  summary:
    "Fills the mock library for the API in one step: every model's fields get the hint their names, formats and enums say (written down, to change), each listed model a record count, the channels their realtime scripts, and the scenarios new user (empty), lots of data, network error, slow network and signed out. What is set already stays.",
  args: S.obj({ locale: S.enum(MOCK_LOCALES, "the language of the data (the editor's by default)"), counts: S.int("records per listed model (24)", { minimum: 0, maximum: 5000 }), scenarios: S.bool("add the five scenarios (true)"), hints: S.bool("write the hints down (true)") }),
  label: () => "Fill mocks",
  run(s, a, ctx) {
    const api = s.doc.api;
    if (!api?.models?.length && !api?.endpoints?.length) throw new OpError("refused", "The API is empty: add its models and endpoints first (add_model, add_endpoint, import_openapi).");
    const before = mocksOf(s);
    const next = fillMocks(api, before, { locale: a.locale ?? before.locale ?? localeOf(ctx.lang), counts: a.counts, scenarios: a.scenarios, hints: a.hints });
    const out = withMocks(s, next);
    if (JSON.stringify(out.doc.mocks) === JSON.stringify(s.doc.mocks)) throw nothing("The mock library");
    const m = out.doc.mocks ?? {};
    return {
      state: out,
      result: { models: m.models?.length ?? 0, hints: (m.models ?? []).reduce((n, c) => n + Object.keys(c.hints ?? {}).length, 0), scenarios: (m.scenarios ?? []).map((x) => x.id), scripts: m.realtime?.length ?? 0 },
    };
  },
});

export const clearMocks = op<Record<string, never>>({
  name: "clear_mocks",
  summary: "Takes every mock setting away (hints, counts, pinned records, scenarios, files, scripts): the API is then answered with data made from its schemas alone.",
  args: S.obj({}),
  label: () => "Clear mocks",
  run(s) {
    if (!s.doc.mocks) throw nothing("The mock library");
    return { state: withDoc(s, { mocks: undefined }) };
  },
});
