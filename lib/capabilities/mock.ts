/* The mock library's side of the capabilities (docs/模拟库.md, “能力”): every capability a design invokes answered with
 * the catalog's example, or as the document's mock settings say (`Doc.mocks.capabilities`), or as the scenario on show
 * says (`MockScenario.capabilities`: a payment cancelled, the location denied, the scan slow). A scenario describes a
 * situation, not a rule: the mock never decides what a payment comes to, the order's status from the (mock) back end
 * does. Each invoke is logged, for the preview's request log.
 *
 * No imports but this folder's, so the file goes into an exported app's packages/capabilities as it is. */

import { capabilityOf, exampleOf } from "./catalog";
import type { CapabilityHost, CapabilitySpec, FailureKind, InvokeOutcome, MockCapabilityRule } from "./types";

/** what of `Doc.mocks` the capabilities read: the rules, the scenarios' rules, the files a picker gives */
export type MockCapabilitySource = {
  capabilities?: Record<string, MockCapabilityRule>;
  scenarios?: { id: string; name?: string; capabilities?: Record<string, MockCapabilityRule> }[];
  files?: { id: string; name: string; type: string; data: string }[];
  locale?: string;
};

/** one invoke, as the request log shows it */
export type CapabilityLogEntry = {
  id: number;
  /** when it was asked (ms) */
  at: number;
  capability: string;
  args: Record<string, unknown>;
  /** the result, or how it failed */
  ok: boolean;
  failure?: FailureKind;
  result?: unknown;
  ms: number;
  scenario?: string;
};

export type MockCapabilityOptions = {
  /** the scenario it starts in; the document's own (`Doc.mocks.scenario`) is the caller's to pass */
  scenario?: string;
  /** false: answer at once; a number: wait that long unless a rule says; left out, 300 ms */
  latency?: false | number;
  onLog?: (entry: CapabilityLogEntry) => void;
  /** how a wait is made (a test's fake clock) */
  wait?: (ms: number) => Promise<void>;
};

export type MockCapabilities = CapabilityHost & {
  readonly scenario: string | undefined;
  /** another scenario: what is out when it changes comes back dropped */
  setScenario(id: string | undefined): void;
  /** starts over in the same scenario */
  reset(): void;
  readonly log: CapabilityLogEntry[];
};

/** where a device is, by the language of the mock data: a city of its own */
const HERE: Record<string, { lat: number; lng: number }> = { zh: { lat: 31.2304, lng: 121.4737 }, en: { lat: 51.5072, lng: -0.1276 }, ja: { lat: 35.6762, lng: 139.6503 }, ko: { lat: 37.5665, lng: 126.978 } };

/** a small picture to stand for a file picked when the library has none */
const PICTURE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjOTk5Ii8+PC9zdmc+";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** whether a file's type fits an input's accept: `image/*`, `.pdf`, `application/pdf` */
function accepts(accept: unknown, f: { name: string; type: string }): boolean {
  if (typeof accept !== "string" || !accept.trim()) return true;
  return accept.split(",").some((raw) => {
    const a = raw.trim().toLowerCase();
    if (!a) return false;
    if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a);
    if (a.endsWith("/*")) return f.type.toLowerCase().startsWith(a.slice(0, -1));
    return f.type.toLowerCase() === a;
  });
}

/** What a capability answers with when nothing says otherwise: the catalog's (or the product's own) example, filled
 *  from what it was given where that is the point (the provider signed in with, the product bought, the files). */
function answerOf(name: string, args: Record<string, unknown>, source: MockCapabilitySource, spec: CapabilitySpec | undefined): unknown {
  const def = capabilityOf(spec, name);
  const example = exampleOf(def?.result);
  switch (name) {
    case "location.current":
      return { ...(HERE[source.locale ?? ""] ?? HERE.en), accuracy: args.accuracy === "high" ? 5 : args.accuracy === "low" ? 500 : 20 };
    case "auth.oauth":
      return { ...(isObject(example) ? example : {}), provider: typeof args.provider === "string" ? args.provider : "other" };
    case "iap.purchase":
      return { ...(isObject(example) ? example : {}), ...(typeof args.productId === "string" ? { productId: args.productId } : {}) };
    case "file.pick": {
      const mine = (source.files ?? []).filter((f) => accepts(args.accept, f));
      const files = mine.length ? mine.slice(0, args.multiple === true ? 3 : 1).map((f) => ({ name: f.name, type: f.type, size: Math.round((f.data.length * 3) / 4), url: f.data })) : [{ name: "photo.svg", type: "image/svg+xml", size: 200, url: PICTURE }];
      return { files };
    }
    default:
      return example ?? {};
  }
}

export function createMockCapabilities(source: MockCapabilitySource = {}, spec?: CapabilitySpec, o: MockCapabilityOptions = {}): MockCapabilities {
  let scenario = o.scenario;
  let epoch = 0;
  let n = 0;
  const log: CapabilityLogEntry[] = [];
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ruleOf = (name: string): MockCapabilityRule | undefined => source.scenarios?.find((s) => s.id === scenario)?.capabilities?.[name] ?? source.capabilities?.[name];
  return {
    get scenario() {
      return scenario;
    },
    setScenario(id) {
      scenario = id || undefined;
      epoch++;
    },
    reset() {
      epoch++;
    },
    log,
    async invoke(name, given) {
      const started = epoch;
      const at = Date.now();
      const args = isObject(given) ? given : {};
      const def = capabilityOf(spec, name);
      const rule = ruleOf(name);
      const ms = o.latency === false ? 0 : typeof rule?.delayMs === "number" ? Math.max(0, Math.min(60_000, rule.delayMs)) : typeof o.latency === "number" ? o.latency : 300;
      if (ms > 0) await wait(ms);
      let outcome: InvokeOutcome;
      if (!def) outcome = { ok: false, error: { type: "not-implemented", capability: name, message: `${name} is no capability of the catalog or of the product` } };
      else if (rule?.fail && !def.silent) outcome = { ok: false, error: { type: rule.fail, capability: name, ...(rule.message ? { message: rule.message } : {}) } };
      else {
        const answer = answerOf(name, args, source, spec);
        outcome = { ok: true, result: isObject(rule?.result) && isObject(answer) ? { ...answer, ...rule.result } : rule?.result !== undefined ? rule.result : answer };
      }
      const entry: CapabilityLogEntry = { id: ++n, at, capability: name, args, ok: outcome.ok, ...(outcome.ok ? { result: outcome.result } : { failure: outcome.error.type }), ms: Math.max(ms, Date.now() - at), ...(scenario ? { scenario } : {}) };
      log.push(entry);
      if (log.length > 200) log.splice(0, log.length - 200);
      o.onLog?.(entry);
      /* an answer to a session started over lands nowhere */
      if (started !== epoch) return outcome.ok ? { ok: false, error: { type: "failed", capability: name }, dropped: true } : { ...outcome, dropped: true };
      return outcome;
    },
  };
}
