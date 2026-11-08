/* Operations on the platform capabilities (lib/capabilities, docs/平台能力.md): the product's own declared beside the
 * catalog's, the ones it uses beyond those its designs invoke, and how the mock library answers each (in every
 * scenario, or in one). M3E never implements a capability: these say what one takes, gives back and how it fails, so
 * the design shows every outcome and the export prints its types and a slot for its adapter. */

import { capabilityOf, CAPABILITY_CATALOG, standardCapability } from "../../capabilities/catalog";
import { cleanCapabilities, cleanCapabilityDef, isCapabilityName } from "../../capabilities/clean";
import { CAPABILITY_LIMITS, FAILURE_KINDS, type CapabilityDef, type CapabilitySpec, type FailureKind, type MockCapabilityRule } from "../../capabilities/types";
import { cleanMocks } from "../../mocks/clean";
import type { MockSpec } from "../../mocks/types";
import { op, OpError, S } from "../op";
import { withDoc, type CoreState } from "../state";

const specOf = (s: CoreState): CapabilitySpec => s.doc.capabilities ?? {};
const withSpec = (s: CoreState, next: CapabilitySpec) => withDoc(s, { capabilities: cleanCapabilities(next) });
const nothing = (what: string) => new OpError("nothing_to_do", `${what} is that already.`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function needCapability(s: CoreState, name: string): CapabilityDef {
  const def = capabilityOf(s.doc.capabilities, name);
  if (!def) throw new OpError("not_found", `There is no capability ${JSON.stringify(name)}: list_capabilities lists the catalog's (${CAPABILITY_CATALOG.map((c) => c.name).join(", ")}), declare_capability declares one of the product's own.`, name);
  return def;
}

export const declareCapability = op<{ name: string; kind: "call" | "event" | "view"; summary?: string; args?: unknown; result?: unknown; failures?: FailureKind[]; payload?: unknown; props?: unknown; events?: unknown[] }>({
  name: "declare_capability",
  summary:
    "Declares a platform capability of the product's own, beside the catalog's (list_capabilities): name (dotted, e.g. \"acme.ticket.scan\"), kind (call: invoked by an effect; event: the platform sends it; view: a part draws it), summary, args and result (JSON Schema objects, for a call), failures (of cancelled, failed, unavailable, denied, timeout; not-implemented always), payload (an event's), props and events [{name, payload}] (a view's). The same name again replaces it. M3E never implements it: the exported app gets its type and a place to write the adapter.",
  args: S.obj(
    {
      name: S.str("dotted identifiers, each starting with a small letter"),
      kind: S.enum(["call", "event", "view"]),
      summary: S.str(),
      args: S.any("a JSON Schema object of what a call takes"),
      result: S.any("a JSON Schema object of what a call gives back"),
      failures: { type: "array", items: { type: "string", enum: FAILURE_KINDS.filter((k) => k !== "not-implemented") } },
      payload: S.any("a JSON Schema object of what an event carries"),
      props: S.any("a JSON Schema object of a view's props"),
      events: { type: "array", items: { type: "object" }, description: "a view's events: {name, summary?, payload?}" },
    },
    ["name", "kind"],
  ),
  label: (a) => `Declare capability ${a.name}`,
  run(s, a) {
    if (!isCapabilityName(a.name)) throw new OpError("invalid_value", `${JSON.stringify(a.name)} is no capability name: up to four dotted identifiers, each starting with a small letter ("acme.ticket.scan").`, a.name);
    if (standardCapability(a.name)) throw new OpError("refused", `${a.name} is the catalog's: it is used as it is (invoke it, or list it with use_capabilities); a capability of the product's own needs a name of its own.`, a.name);
    const def = cleanCapabilityDef(a);
    if (!def) throw new OpError("invalid_value", "A capability is {name, kind: call | event | view, …}.");
    const spec = specOf(s);
    const own = spec.own ?? [];
    if (own.length >= CAPABILITY_LIMITS.own && !own.some((c) => c.name === def.name)) throw new OpError("refused", `A document declares at most ${CAPABILITY_LIMITS.own} capabilities of its own.`);
    const next = own.some((c) => c.name === def.name) ? own.map((c) => (c.name === def.name ? def : c)) : [...own, def];
    if (same(next, own)) throw nothing(`The capability ${def.name}`);
    return { state: withSpec(s, { ...spec, own: next }) };
  },
});

export const removeCapability = op<{ name: string }>({
  name: "remove_capability",
  summary: "Removes a capability the product declared (declare_capability). Invokes of it are left as they are: the checks then report them. Destructive: ask first.",
  args: S.obj({ name: S.str() }, ["name"]),
  label: (a) => `Remove capability ${a.name}`,
  run(s, a) {
    const spec = specOf(s);
    if (!(spec.own ?? []).some((c) => c.name === a.name)) throw new OpError("not_found", `The product declares no capability ${JSON.stringify(a.name)}.`, a.name);
    return { state: withSpec(s, { ...spec, own: (spec.own ?? []).filter((c) => c.name !== a.name), ...(spec.uses ? { uses: spec.uses.filter((n) => n !== a.name) } : {}) }) };
  },
});

export const useCapabilities = op<{ add?: string[]; remove?: string[] }>({
  name: "use_capabilities",
  summary:
    "Says the product uses these capabilities beyond the ones its designs invoke or draw (those count anyway): an event such as push.opened, or one only the code will invoke. add and remove take names; the export prints their types and adapters.",
  args: S.obj({ add: { type: "array", items: { type: "string" } }, remove: { type: "array", items: { type: "string" } } }),
  label: () => "Capabilities used",
  run(s, a) {
    for (const n of a.add ?? []) needCapability(s, n);
    const spec = specOf(s);
    const gone = new Set(a.remove ?? []);
    const uses = [...new Set([...(spec.uses ?? []).filter((n) => !gone.has(n)), ...(a.add ?? [])])];
    if (same(uses, spec.uses ?? [])) throw nothing("The capabilities used");
    return { state: withSpec(s, { ...spec, uses }) };
  },
});

export const setMockCapability = op<{ capability: string; scenario?: string; result?: unknown; fail?: FailureKind | null; message?: string | null; delayMs?: number | null; clear?: boolean }>({
  name: "set_mock_capability",
  summary:
    'Says how the mock library answers a capability in the preview (and in an exported app\'s tests or development build that puts its createMockCapabilities in place): in every scenario, or in one (scenario). result: an object laid over the catalog\'s example ({status: "submitted"} for payment.pay); fail: how it fails instead (cancelled, failed, unavailable, not-implemented, denied, timeout; null: it does what it is asked); message; delayMs. clear: true drops the rule. A scenario describes a situation ("payment cancelled"), never a rule: whether an order is paid stays the back end\'s answer (its order status).',
  args: S.obj(
    {
      capability: S.str(),
      scenario: S.str("a scenario's id: the rule holds in it only"),
      result: S.any(),
      fail: { type: ["string", "null"], enum: [...FAILURE_KINDS, null] },
      message: { type: ["string", "null"] },
      delayMs: { type: ["number", "null"], minimum: 0, maximum: 60000 },
      clear: S.bool(),
    },
    ["capability"],
  ),
  label: (a) => `Mock capability ${a.capability}`,
  run(s, a) {
    const def = needCapability(s, a.capability);
    if (def.kind !== "call") throw new OpError("invalid_value", `${def.name} is a ${def.kind}, not a call: the mocks answer calls.`, a.capability);
    const mocks: MockSpec = s.doc.mocks ?? {};
    const scenario = a.scenario ? mocks.scenarios?.find((x) => x.id === a.scenario) : undefined;
    if (a.scenario && !scenario) throw new OpError("not_found", `There is no scenario ${JSON.stringify(a.scenario)}${mocks.scenarios?.length ? ` (the scenarios are: ${mocks.scenarios.map((x) => x.id).join(", ")})` : "; add_mock_scenario adds one"}.`, a.scenario);
    const rules = { ...(scenario ? scenario.capabilities : mocks.capabilities) };
    const was = rules[a.capability] ?? {};
    let rule: MockCapabilityRule | undefined;
    if (!a.clear) {
      const next: Record<string, unknown> = { ...was };
      if (a.result !== undefined) next.result = a.result;
      if (a.fail !== undefined) {
        if (a.fail === null) delete next.fail;
        else next.fail = a.fail;
      }
      if (a.message !== undefined) {
        if (a.message === null) delete next.message;
        else next.message = a.message;
      }
      if (a.delayMs !== undefined) {
        if (a.delayMs === null) delete next.delayMs;
        else next.delayMs = a.delayMs;
      }
      rule = Object.keys(next).length ? (next as MockCapabilityRule) : undefined;
    }
    if (rule) rules[a.capability] = rule;
    else delete rules[a.capability];
    const capabilities = Object.keys(rules).length ? rules : undefined;
    const next: MockSpec = scenario ? { ...mocks, scenarios: mocks.scenarios!.map((x) => (x.id === scenario.id ? { ...x, capabilities } : x)) } : { ...mocks, capabilities };
    const cleaned = cleanMocks(next);
    if (same(cleaned, s.doc.mocks)) throw nothing(`How ${a.capability} answers`);
    return { state: withDoc(s, { mocks: cleaned }) };
  },
});
