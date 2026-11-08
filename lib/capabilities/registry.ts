/* The registry an app invokes capabilities through: the adapters written for it (src/custom/capabilities.ts in an
 * exported app), else the defaults its platform has for the generic ones, else `not-implemented`, the way a back end's
 * handler answers 501 until it is written. It never rejects: an adapter that throws `fail(kind)` comes to that failure,
 * anything else it throws to `failed`. The mock library of the preview is the same registry over mock adapters
 * (mock.ts), so a design runs alike in both.
 *
 * No imports but this folder's, so the file goes into an exported app's packages/capabilities as it is. */

import { capabilityOf } from "./catalog";
import { FAILURE_KINDS, type CapabilityAdapters, type CapabilityDef, type CapabilityHost, type CapabilitySpec, type FailureKind, type InvokeOutcome } from "./types";

/** What an adapter throws to fail in a way the design has a look for: cancelled, denied, unavailable… */
export class CapabilityFailure extends Error {
  constructor(
    readonly type: FailureKind,
    message?: string,
  ) {
    super(message ?? type);
    this.name = "CapabilityFailure";
  }
}

/** the failure an adapter throws: `throw fail("cancelled")` */
export const fail = (type: FailureKind, message?: string) => new CapabilityFailure(type, message);

const isFailure = (v: unknown): v is FailureKind => typeof v === "string" && (FAILURE_KINDS as readonly string[]).includes(v);

/** words of an error, short */
const wordsOf = (err: unknown) => (err instanceof Error ? err.message : typeof err === "string" ? err : "").slice(0, 200);

export type RegistryOptions = {
  /** the adapters written for the app; a capability left out falls to `defaults` */
  adapters?: CapabilityAdapters;
  /** what the platform has for the generic capabilities (a link, the clipboard, a share sheet, a file picker) */
  defaults?: CapabilityAdapters;
  /** the product's own capabilities, beside the catalog's */
  spec?: CapabilitySpec;
  /** told once of each capability that has no adapter: the app's development build says it in the console */
  onMissing?: (name: string, def: CapabilityDef | undefined) => void;
  /** how long an adapter may take before the invoke comes to `timeout` (none when left out) */
  timeoutMs?: number;
};

export type CapabilityRegistry = CapabilityHost & {
  /** whether there is an adapter (written or default) for it */
  has(name: string): boolean;
  /** puts adapters in, over what is there: a test, a setup that learns them late */
  use(adapters: CapabilityAdapters): void;
};

export function createCapabilities(o: RegistryOptions = {}): CapabilityRegistry {
  let adapters: CapabilityAdapters = { ...o.adapters };
  const told = new Set<string>();
  const adapterOf = (name: string) => adapters[name] ?? o.defaults?.[name];
  return {
    has: (name) => !!adapterOf(name),
    use(more) {
      adapters = { ...adapters, ...more };
    },
    async invoke(name, args) {
      const def = capabilityOf(o.spec, name);
      const done = (outcome: InvokeOutcome): InvokeOutcome => (def?.silent && !outcome.ok ? { ok: true, result: {} } : outcome);
      const adapter = adapterOf(name);
      if (!adapter) {
        if (!told.has(name)) {
          told.add(name);
          o.onMissing?.(name, def);
        }
        return done({ ok: false, error: { type: "not-implemented", capability: name, message: `no adapter for ${name}` } });
      }
      try {
        const running = Promise.resolve().then(() => adapter(args));
        const result = o.timeoutMs && o.timeoutMs > 0 ? await within(running, o.timeoutMs) : await running;
        return { ok: true, result: result ?? {} };
      } catch (err) {
        const type: FailureKind = err instanceof CapabilityFailure && isFailure(err.type) ? err.type : "failed";
        const message = wordsOf(err);
        return done({ ok: false, error: { type, capability: name, ...(message && message !== type ? { message } : {}) } });
      }
    },
  };
}

/** a promise that comes to `timeout` when it takes too long */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(fail("timeout", `took over ${ms} ms`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** the words a development build says of a capability with no adapter: where to write one */
export const missingAdapterWords = (name: string, def: CapabilityDef | undefined) =>
  `[capabilities] ${name} is not implemented yet: it answers "not-implemented" until an adapter is written in src/custom/capabilities.ts${def?.summary ? ` (${def.summary})` : ""}. The design's catch shows the visitor what happens meanwhile.`;
