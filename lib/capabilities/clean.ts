/* `Doc.capabilities` as a file may hold it: whatever is the wrong shape goes, what is of the right shape is kept,
 * unknown fields included, lists capped. Run by the one loader (lib/project.ts); the mock rules are the mocks' cleaner's
 * (lib/mocks/clean.ts). */

import { CAPABILITY_LIMITS, CAPABILITY_NAME, FAILURE_KINDS, type CapabilityDef, type CapabilityEvent, type CapabilitySpec, type FailureKind } from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KINDS = ["call", "event", "view"] as const;
const isSchema = (v: unknown) => typeof v === "boolean" || isRecord(v);
const isFailure = (v: unknown): v is FailureKind => typeof v === "string" && (FAILURE_KINDS as readonly string[]).includes(v);

/** a capability's name as a document may hold it */
export const isCapabilityName = (v: unknown): v is string => typeof v === "string" && CAPABILITY_NAME.test(v);

function cleanEvent(v: unknown): CapabilityEvent | undefined {
  if (!isRecord(v) || typeof v.name !== "string" || !/^[a-z][a-zA-Z0-9]{0,31}$/.test(v.name)) return undefined;
  return { ...v, name: v.name, ...(typeof v.summary === "string" ? { summary: v.summary.slice(0, 400) } : {}), ...(isSchema(v.payload) ? { payload: v.payload as CapabilityEvent["payload"] } : {}) } as CapabilityEvent;
}

/** one capability a product declares, or undefined when it is not one */
export function cleanCapabilityDef(v: unknown): CapabilityDef | undefined {
  if (!isRecord(v) || !isCapabilityName(v.name) || !(KINDS as readonly unknown[]).includes(v.kind)) return undefined;
  const out: Record<string, unknown> = { ...v };
  for (const k of ["args", "result", "payload", "props"]) if (out[k] !== undefined && !isSchema(out[k])) delete out[k];
  if (out.summary !== undefined) {
    if (typeof out.summary === "string") out.summary = out.summary.slice(0, 400);
    else delete out.summary;
  }
  if (out.failures !== undefined) {
    if (Array.isArray(out.failures)) out.failures = [...new Set(out.failures.filter(isFailure))];
    else delete out.failures;
  }
  if (out.events !== undefined) {
    if (Array.isArray(out.events)) out.events = out.events.map(cleanEvent).filter((e) => e !== undefined).slice(0, CAPABILITY_LIMITS.events);
    else delete out.events;
  }
  for (const k of ["generic", "silent"]) if (out[k] !== undefined && typeof out[k] !== "boolean") delete out[k];
  if (out.view !== undefined && !isCapabilityName(out.view)) delete out.view;
  if (out.version !== undefined && !(typeof out.version === "number" && Number.isInteger(out.version) && out.version > 0)) delete out.version;
  return out as CapabilityDef;
}

/** `Doc.capabilities` as a file may hold it; undefined when nothing of it is left */
export function cleanCapabilities(v: unknown): CapabilitySpec | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, unknown> = { ...v };
  if (out.uses !== undefined) {
    const uses = Array.isArray(out.uses) ? [...new Set(out.uses.filter(isCapabilityName))].slice(0, CAPABILITY_LIMITS.uses) : [];
    if (uses.length) out.uses = uses;
    else delete out.uses;
  }
  if (out.own !== undefined) {
    const seen = new Set<string>();
    const own = Array.isArray(out.own) ? out.own.map(cleanCapabilityDef).filter((c): c is CapabilityDef => !!c && !seen.has(c.name) && !!seen.add(c.name)).slice(0, CAPABILITY_LIMITS.own) : [];
    if (own.length) out.own = own;
    else delete out.own;
  }
  return Object.keys(out).length ? (out as CapabilitySpec) : undefined;
}
