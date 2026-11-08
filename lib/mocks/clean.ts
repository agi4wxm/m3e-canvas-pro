/* The mock settings as they come in from outside (a file, a shared link, an MCP client, an operation's arguments):
 * every part checked for its shape and held to bounds, every value copied as plain JSON, so a hostile document can
 * neither hang the tab nor reach a prototype. What is not usable goes; the order of lists is the author's. A file of
 * the library must be a data URL. */

import { cleanJson, compact } from "../api/clean";
import { isRecord } from "../api/schema";
import { fields, withUnknown } from "../keep";
import { CAPABILITY_NAME, FAILURE_KINDS, type FailureKind, type MockCapabilityRule } from "../capabilities/types";
import { MAX_COUNT, MOCK_KINDS, MOCK_LOCALES, MOCK_ROUTE_KINDS, type MockAuth, type MockFile, type MockHint, type MockKind, type MockLocale, type MockModelConfig, type MockOpRule, type MockRealtimeScript, type MockRealtimeTrigger, type MockRouteRule, type MockScenario, type MockSpec, type MockStep } from "./types";

/** how much the mock settings may hold */
export const MOCK_LIMITS = {
  models: 1000,
  hints: 400,
  fixtures: 500,
  scenarios: 100,
  opsPerScenario: 2000,
  sequence: 20,
  files: 200,
  /** characters of one file's data URL (about 12 MB of bytes) */
  fileChars: 16_000_000,
  /** characters of every file together */
  allFileChars: 96_000_000,
  realtime: 500,
  steps: 200,
  credentials: 50,
  routes: 2000,
  /** JSON values of pinned records and bodies */
  nodes: 400_000,
};

/** an id of a scenario, a file, a script: letters, digits, - _ . */
export const MOCK_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

type Budget = { nodes: number };

/* What each object of the settings has. A field this version does not know is kept as it came, copied as plain JSON
   within the budget (lib/keep.ts), after the fields it knows. */
const SPEC = fields("seed", "locale", "scenario", "latency", "errorRate", "models", "scenarios", "files", "realtime", "auth", "routes", "capabilities");
const RANGE = fields("min", "max");
const HINT = fields("kind", "min", "max", "from", "to", "weights", "values", "value", "files", "type", "nullRate");
const MODEL = fields("name", "count", "seed", "hints", "fixtures");
const STEP = fields("status", "body", "patch", "latencyMs", "network", "empty");
const RULE = fields("status", "body", "patch", "latencyMs", "network", "empty", "fixtures", "sequence");
const SCENARIO = fields("id", "name", "description", "all", "ops", "latency", "errorRate", "counts", "signedIn", "capabilities");
const CAPABILITY_RULE = fields("result", "fail", "message", "delayMs");
const FILE = fields("id", "name", "type", "data", "tags");
const TRIGGER = fields("on", "operationId", "message");
const SCRIPT = fields("id", "channel", "trigger", "steps", "repeat");
const SCRIPT_STEP = fields("at", "message", "payload");
const REPEAT = fields("every", "times");
const AUTH = fields("signedIn", "accept", "tokenTtl", "refreshTtl");
const ROUTE = fields("operationId", "kind", "model");
/** what a field this version does not know becomes: plain JSON within the budget */
const kept = (b: Budget) => (v: unknown) => cleanJson(v, b);
/** a shared budget for the cleaners that are also called on their own (a file, a route) */
const freshBudget = (): Budget => ({ nodes: MOCK_LIMITS.nodes });

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const str = (v: unknown, max = 2000): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);
const json = (v: unknown, b: Budget): unknown => (v === undefined ? undefined : cleanJson(v, b));

function cleanRange(v: unknown): { min: number; max: number } | undefined {
  if (!isRecord(v)) return undefined;
  const min = num(v.min, 0, 120_000);
  const max = num(v.max, 0, 120_000);
  if (min === undefined && max === undefined) return undefined;
  const lo = min ?? max!;
  return withUnknown(v, { min: Math.round(lo), max: Math.round(Math.max(lo, max ?? lo)) }, RANGE, kept(freshBudget()));
}

export function cleanHint(v: unknown, b: Budget): MockHint | undefined {
  if (!isRecord(v) || typeof v.kind !== "string" || !(MOCK_KINDS as readonly string[]).includes(v.kind)) return undefined;
  const weights = isRecord(v.weights) ? Object.fromEntries(Object.entries(v.weights).slice(0, 200).filter(([, w]) => typeof w === "number" && Number.isFinite(w) && w >= 0).map(([k, w]) => [k.slice(0, 200), Math.min(w as number, 1e6)])) : undefined;
  const values = Array.isArray(v.values) ? (json(v.values.slice(0, 500), b) as unknown[] | undefined) : undefined;
  const files = Array.isArray(v.files) ? v.files.filter((f): f is string => typeof f === "string" && MOCK_ID.test(f)).slice(0, 200) : undefined;
  return withUnknown(v, compact({
    kind: v.kind as MockKind,
    min: num(v.min, -1e15, 1e15),
    max: num(v.max, -1e15, 1e15),
    from: str(v.from, 40),
    to: str(v.to, 40),
    weights: weights && Object.keys(weights).length ? weights : undefined,
    values: values?.length ? values : undefined,
    value: json(v.value, b),
    files: files?.length ? files : undefined,
    type: typeof v.type === "string" && /^[\w.+-]{1,60}(\/[\w.+-]{1,100})?$/.test(v.type.trim()) ? v.type.trim().toLowerCase() : undefined,
    nullRate: num(v.nullRate, 0, 1),
  }), HINT, kept(b));
}

function cleanModel(v: unknown, b: Budget): MockModelConfig | undefined {
  if (!isRecord(v) || typeof v.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v.name)) return undefined;
  const hints: Record<string, MockHint> = {};
  if (isRecord(v.hints))
    for (const [path, h] of Object.entries(v.hints).slice(0, MOCK_LIMITS.hints)) {
      const c = cleanHint(h, b);
      if (c && path.length <= 300) hints[path] = c;
    }
  const fixtures = Array.isArray(v.fixtures) ? v.fixtures.slice(0, MOCK_LIMITS.fixtures).map((r) => json(r, b)).filter(isRecord) : undefined;
  return withUnknown(v, compact({
    name: v.name,
    count: num(v.count, 0, MAX_COUNT) !== undefined ? Math.round(num(v.count, 0, MAX_COUNT)!) : undefined,
    seed: num(v.seed, -1e9, 1e9) !== undefined ? Math.round(num(v.seed, -1e9, 1e9)!) : undefined,
    hints: Object.keys(hints).length ? hints : undefined,
    fixtures: fixtures?.length ? (fixtures as Record<string, unknown>[]) : undefined,
  }), MODEL, kept(b));
}

function cleanStep(v: unknown, b: Budget, known: ReadonlySet<string> = STEP): MockStep {
  if (!isRecord(v)) return {};
  return withUnknown(v, compact({
    status: num(v.status, 0, 599) !== undefined ? Math.round(num(v.status, 0, 599)!) : undefined,
    body: json(v.body, b),
    patch: isRecord(v.patch) ? (json(v.patch, b) as Record<string, unknown>) : undefined,
    latencyMs: num(v.latencyMs, 0, 120_000),
    network: typeof v.network === "boolean" ? v.network : undefined,
    empty: typeof v.empty === "boolean" ? v.empty : undefined,
  }), known, kept(b));
}

function cleanRule(v: unknown, b: Budget): MockOpRule | undefined {
  if (!isRecord(v)) return undefined;
  const fixtures: "all" | string[] | undefined = v.fixtures === "all" ? "all" : Array.isArray(v.fixtures) ? v.fixtures.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 500) : undefined;
  const sequence = Array.isArray(v.sequence) ? v.sequence.slice(0, MOCK_LIMITS.sequence).map((s) => cleanStep(s, b)) : undefined;
  return compact({ ...cleanStep(v, b, RULE), fixtures, sequence: sequence?.length ? sequence : undefined });
}

/** how the capabilities answer, by capability name (lib/capabilities): a result laid over the catalog's example, or a
 *  failure, after a delay */
function cleanCapabilityRules(v: unknown, b: Budget): Record<string, MockCapabilityRule> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, MockCapabilityRule> = {};
  for (const [name, r] of Object.entries(v).slice(0, 200)) {
    if (!CAPABILITY_NAME.test(name) || !isRecord(r)) continue;
    const fail = typeof r.fail === "string" && (FAILURE_KINDS as readonly string[]).includes(r.fail) ? (r.fail as FailureKind) : undefined;
    const rule = withUnknown(r, compact({ result: json(r.result, b), fail, message: str(r.message, 200), delayMs: num(r.delayMs, 0, 60_000) !== undefined ? Math.round(num(r.delayMs, 0, 60_000)!) : undefined }), CAPABILITY_RULE, kept(b));
    if (Object.keys(rule).length) out[name] = rule;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanScenario(v: unknown, b: Budget): MockScenario | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !MOCK_ID.test(v.id)) return undefined;
  const ops: Record<string, MockOpRule> = {};
  if (isRecord(v.ops))
    for (const [id, r] of Object.entries(v.ops).slice(0, MOCK_LIMITS.opsPerScenario)) {
      const c = cleanRule(r, b);
      if (c && id.length <= 128) ops[id] = c;
    }
  const counts = isRecord(v.counts) ? Object.fromEntries(Object.entries(v.counts).slice(0, 1000).filter(([, n]) => typeof n === "number" && Number.isFinite(n)).map(([k, n]) => [k.slice(0, 64), Math.round(Math.max(0, Math.min(MAX_COUNT, n as number)))])) : undefined;
  const all = cleanRule(v.all, b);
  return withUnknown(v, compact({
    id: v.id,
    name: str(v.name, 200) || v.id,
    description: str(v.description, 2000),
    all: all && Object.keys(all).length ? all : undefined,
    ops: Object.keys(ops).length ? ops : undefined,
    latency: cleanRange(v.latency),
    errorRate: num(v.errorRate, 0, 1),
    counts: counts && Object.keys(counts).length ? counts : undefined,
    signedIn: typeof v.signedIn === "boolean" ? v.signedIn : undefined,
    capabilities: cleanCapabilityRules(v.capabilities, b),
  }), SCENARIO, kept(b));
}

/** a file of the library: its data must be a data URL */
export function cleanFile(v: unknown): MockFile | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !MOCK_ID.test(v.id) || typeof v.data !== "string") return undefined;
  /* in the browser a large file waits in IndexedDB under a reference (lib/assets.ts), a folder keeps it beside the file */
  if (!/^data:[\w.+-]+\/[\w.+-]+[;,]/.test(v.data) && !/^m3e-(asset|file):/.test(v.data)) return undefined;
  if (v.data.length > MOCK_LIMITS.fileChars) return undefined;
  const type = typeof v.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(v.type) ? v.type.toLowerCase() : (/^data:([\w.+-]+\/[\w.+-]+)/.exec(v.data)?.[1] ?? "application/octet-stream");
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string" && t.length > 0).map((t) => t.slice(0, 40)).slice(0, 20) : undefined;
  return withUnknown(v, compact({ id: v.id, name: (str(v.name, 200) || v.id).replace(/[\\/]/g, "-"), type, data: v.data, tags: tags?.length ? tags : undefined }), FILE, kept(freshBudget()));
}

function cleanTrigger(v: unknown): MockRealtimeTrigger | undefined {
  if (!isRecord(v)) return undefined;
  const keep = <T extends MockRealtimeTrigger>(t: T) => withUnknown(v, t, TRIGGER, kept(freshBudget()));
  if (v.on === "connect") return keep({ on: "connect" });
  if (v.on === "call" && typeof v.operationId === "string") return keep({ on: "call", operationId: v.operationId.slice(0, 128) });
  if (v.on === "message" && typeof v.message === "string") return keep({ on: "message", message: v.message.slice(0, 200) });
  return undefined;
}

function cleanScript(v: unknown, b: Budget): MockRealtimeScript | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !MOCK_ID.test(v.id) || typeof v.channel !== "string") return undefined;
  const steps = (Array.isArray(v.steps) ? v.steps : [])
    .slice(0, MOCK_LIMITS.steps)
    .filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.message === "string")
    .map((s) => withUnknown(s, compact({ at: Math.round(num(s.at, 0, 3_600_000) ?? 0), message: (s.message as string).slice(0, 200), payload: json(s.payload, b) }), SCRIPT_STEP, kept(b)));
  const repeat = isRecord(v.repeat) && num(v.repeat.every, 100, 3_600_000) !== undefined ? withUnknown(v.repeat, compact({ every: Math.round(num(v.repeat.every, 100, 3_600_000)!), times: num(v.repeat.times, 0, 10_000) !== undefined ? Math.round(num(v.repeat.times, 0, 10_000)!) : undefined }), REPEAT, kept(b)) : undefined;
  return withUnknown(v, compact({ id: v.id, channel: v.channel.slice(0, 64), trigger: cleanTrigger(v.trigger), steps, repeat }), SCRIPT, kept(b));
}

function cleanAuth(v: unknown): MockAuth | undefined {
  if (!isRecord(v)) return undefined;
  const accept = Array.isArray(v.accept)
    ? v.accept
        .slice(0, MOCK_LIMITS.credentials)
        .filter(isRecord)
        .map((c) => Object.fromEntries(Object.entries(c).slice(0, 10).filter(([, x]) => typeof x === "string").map(([k, x]) => [k.slice(0, 100), (x as string).slice(0, 500)])))
        .filter((c) => Object.keys(c).length)
    : undefined;
  const out = compact({
    signedIn: typeof v.signedIn === "boolean" ? v.signedIn : undefined,
    accept: accept?.length ? accept : undefined,
    tokenTtl: num(v.tokenTtl, 1, 31_536_000) !== undefined ? Math.round(num(v.tokenTtl, 1, 31_536_000)!) : undefined,
    refreshTtl: num(v.refreshTtl, 1, 315_360_000) !== undefined ? Math.round(num(v.refreshTtl, 1, 315_360_000)!) : undefined,
  });
  return Object.keys(out).length ? withUnknown(v, out, AUTH, kept(freshBudget())) : undefined;
}

function cleanRoute(v: unknown): MockRouteRule | undefined {
  if (!isRecord(v) || typeof v.operationId !== "string") return undefined;
  const kind = typeof v.kind === "string" && (MOCK_ROUTE_KINDS as readonly string[]).includes(v.kind) ? (v.kind as MockRouteRule["kind"]) : undefined;
  return withUnknown(v, compact({ operationId: v.operationId.slice(0, 128), kind, model: typeof v.model === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v.model) ? v.model : undefined }), ROUTE, kept(freshBudget()));
}

/** unique by a key: the first of each stays */
function unique<T>(list: (T | undefined)[], key: (x: T) => string, max: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    if (x === undefined || out.length >= max) continue;
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export const isEmptyMocks = (m: MockSpec | undefined) => !m || Object.values(m).every((v) => v === undefined || (Array.isArray(v) ? !v.length : isRecord(v) ? !Object.keys(v).length : false));

/** The mock settings in their shape, within bounds; undefined when nothing is left of them. */
export function cleanMocks(v: unknown): MockSpec | undefined {
  if (!isRecord(v)) return undefined;
  const b: Budget = { nodes: MOCK_LIMITS.nodes };
  let chars = 0;
  const files = unique(
    (Array.isArray(v.files) ? v.files : []).map((f) => {
      const c = cleanFile(f);
      if (!c) return undefined;
      chars += c.data.length;
      return chars > MOCK_LIMITS.allFileChars ? undefined : c;
    }),
    (f) => f.id,
    MOCK_LIMITS.files,
  );
  const built: MockSpec = compact({
    seed: num(v.seed, -1e9, 1e9) !== undefined ? Math.round(num(v.seed, -1e9, 1e9)!) : undefined,
    locale: typeof v.locale === "string" && (MOCK_LOCALES as readonly string[]).includes(v.locale) ? (v.locale as MockLocale) : undefined,
    scenario: typeof v.scenario === "string" && MOCK_ID.test(v.scenario) ? v.scenario : undefined,
    latency: cleanRange(v.latency),
    errorRate: num(v.errorRate, 0, 1),
    models: Array.isArray(v.models) ? unique(v.models.slice(0, MOCK_LIMITS.models * 2).map((m) => cleanModel(m, b)), (m) => m.name, MOCK_LIMITS.models) : undefined,
    scenarios: Array.isArray(v.scenarios) ? unique(v.scenarios.slice(0, MOCK_LIMITS.scenarios * 2).map((s) => cleanScenario(s, b)), (s) => s.id, MOCK_LIMITS.scenarios) : undefined,
    files: files.length ? files : undefined,
    realtime: Array.isArray(v.realtime) ? unique(v.realtime.slice(0, MOCK_LIMITS.realtime * 2).map((s) => cleanScript(s, b)), (s) => s.id, MOCK_LIMITS.realtime) : undefined,
    auth: cleanAuth(v.auth),
    routes: Array.isArray(v.routes) ? unique(v.routes.slice(0, MOCK_LIMITS.routes * 2).map(cleanRoute), (r) => r.operationId, MOCK_LIMITS.routes) : undefined,
    capabilities: cleanCapabilityRules(v.capabilities, b),
  });
  const out = withUnknown(v, built, SPEC, kept(b));
  /* an empty list of scripts says "none", where no list at all plays the channels' defaults */
  /* a model's settings with nothing in them are no settings */
  if (out.models) out.models = out.models.filter((m) => Object.keys(m).length > 1);
  for (const k of ["models", "scenarios", "routes"] as const) if (Array.isArray(out[k]) && !out[k]!.length) delete out[k];
  return isEmptyMocks(out) ? undefined : out;
}
