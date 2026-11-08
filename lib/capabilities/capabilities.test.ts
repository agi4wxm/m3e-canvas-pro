/* The capabilities layer on its own: the catalog says what each capability takes and how it fails; the registry an
 * app invokes them through answers `not-implemented` until an adapter is written (and says so once), a thrown
 * `fail(kind)` is that failure and anything else `failed`; the mocks answer with the catalog's example, the
 * document's rule or the scenario's, log every invoke and drop what a restart left out; a file's capabilities come in
 * cleaned; and the operations that declare, use and mock them check what they are given. */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { setGlobalLang } from "../i18n";
import { openProject } from "../project";
import { parseProject, serializeProject } from "../core/projectFile";
import { guessMeasurer, OpError } from "../core/op";
import { counterIds, DocStore } from "../core/store";
import { stateOf } from "../core/state";
import * as ops from "../core/ops";
import { CAPABILITY_CATALOG, PROVIDERS, argNamesOf, capabilityOf, failuresOf, requiredArgsOf } from "./catalog";
import { cleanCapabilities } from "./clean";
import { capabilitiesUsed } from "./doc";
import { createMockCapabilities } from "./mock";
import { createCapabilities, fail } from "./registry";
import { CAPABILITY_NAME } from "./types";

beforeAll(() => setGlobalLang("en"));

const fails = (fn: () => unknown, code: string, words?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    if (words) expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};

describe("the catalog", () => {
  it("has every capability the report names, each named, typed and with its failures", () => {
    const names = CAPABILITY_CATALOG.map((c) => c.name);
    for (const n of ["payment.pay", "iap.purchase", "auth.oauth", "location.current", "scan.code", "push.register", "push.opened", "share.open", "clipboard.write", "link.open", "file.pick", "analytics.track", "biometric.verify", "rtc.call", "rtc.view", "map", "camera"]) expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
    for (const c of CAPABILITY_CATALOG) {
      expect(c.name, c.name).toMatch(CAPABILITY_NAME);
      expect(c.version, c.name).toBe(1);
      if (c.kind === "call") {
        expect(typeof c.args, c.name).toBe("object");
        expect(typeof c.result, c.name).toBe("object");
      }
      if (c.kind === "view") expect(c.events?.length, c.name).toBeGreaterThan(0);
    }
    expect(failuresOf(capabilityOf(undefined, "payment.pay"))).toEqual(["cancelled", "failed", "unavailable", "not-implemented"]);
    /* analytics never fails: nothing waits for it */
    expect(failuresOf(capabilityOf(undefined, "analytics.track"))).toEqual([]);
    expect(requiredArgsOf(capabilityOf(undefined, "payment.pay")!)).toEqual(["orderId"]);
    expect(argNamesOf(capabilityOf(undefined, "clipboard.write")!)).toEqual(["text"]);
  });

  it("names the services a brand button offers", async () => {
    const { BRAND_PROVIDERS } = await import("../../parts/defs/mobile");
    expect(BRAND_PROVIDERS).toEqual([...PROVIDERS]);
  });

  it("says a payment is only submitted: the result has no paid", () => {
    const pay = capabilityOf(undefined, "payment.pay")!;
    expect(JSON.stringify(pay.result)).not.toMatch(/paid|success/);
    expect(pay.summary).toMatch(/order's status/);
  });
});

describe("the registry", () => {
  it("answers not-implemented for a capability with no adapter, and says so once", async () => {
    const onMissing = vi.fn();
    const r = createCapabilities({ onMissing });
    expect(await r.invoke("payment.pay", { orderId: "o1" })).toEqual({ ok: false, error: { type: "not-implemented", capability: "payment.pay", message: "no adapter for payment.pay" } });
    await r.invoke("payment.pay", { orderId: "o2" });
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing.mock.calls[0][0]).toBe("payment.pay");
  });

  it("runs the adapter written, then the platform's default, and reads its failures", async () => {
    const r = createCapabilities({
      adapters: { "payment.pay": () => ({ status: "submitted" }), "scan.code": () => Promise.reject(fail("cancelled")), "share.open": () => Promise.reject(new Error("boom")) },
      defaults: { "clipboard.write": async () => undefined, "payment.pay": () => ({ status: "never" }) },
    });
    expect(await r.invoke("payment.pay", { orderId: "o1" })).toEqual({ ok: true, result: { status: "submitted" } });
    expect(await r.invoke("clipboard.write", { text: "x" })).toEqual({ ok: true, result: {} });
    expect(await r.invoke("scan.code", {})).toEqual({ ok: false, error: { type: "cancelled", capability: "scan.code" } });
    expect(await r.invoke("share.open", {})).toEqual({ ok: false, error: { type: "failed", capability: "share.open", message: "boom" } });
    expect(r.has("clipboard.write")).toBe(true);
    expect(r.has("location.current")).toBe(false);
  });

  it("times an adapter out, and lets a silent capability never fail", async () => {
    const r = createCapabilities({ adapters: { "location.current": () => new Promise(() => {}) }, timeoutMs: 20 });
    expect(await r.invoke("location.current", {})).toMatchObject({ ok: false, error: { type: "timeout" } });
    expect(await r.invoke("analytics.track", { event: "x" })).toEqual({ ok: true, result: {} });
  });
});

describe("the mocks", () => {
  it("answer with the example, the document's rule, then the scenario's, and log each invoke", async () => {
    const log: string[] = [];
    const mocks = { capabilities: { "location.current": { fail: "denied" as const } }, scenarios: [{ id: "cancelled", capabilities: { "payment.pay": { fail: "cancelled" as const, message: "The visitor closed the sheet" } } }] };
    const m = createMockCapabilities(mocks, undefined, { latency: false, onLog: (e) => log.push(`${e.capability}:${e.ok ? "ok" : e.failure}`) });
    expect(await m.invoke("payment.pay", { orderId: "o1" })).toEqual({ ok: true, result: { status: "submitted" } });
    expect(await m.invoke("location.current", {})).toMatchObject({ ok: false, error: { type: "denied" } });
    m.setScenario("cancelled");
    expect(await m.invoke("payment.pay", { orderId: "o1" })).toEqual({ ok: false, error: { type: "cancelled", capability: "payment.pay", message: "The visitor closed the sheet" } });
    expect(await m.invoke("nothing.here", {})).toMatchObject({ ok: false, error: { type: "not-implemented" } });
    expect(log).toEqual(["payment.pay:ok", "location.current:denied", "payment.pay:cancelled", "nothing.here:not-implemented"]);
    expect(m.log.map((e) => e.scenario)).toEqual([undefined, undefined, "cancelled", "cancelled"]);
  });

  it("fill what the call was given in, and pick files from the library", async () => {
    const m = createMockCapabilities({ locale: "ja", files: [{ id: "a", name: "a.png", type: "image/png", data: "data:image/png;base64,AAAA" }, { id: "b", name: "b.pdf", type: "application/pdf", data: "data:application/pdf;base64,AAAA" }] }, undefined, { latency: false });
    expect(await m.invoke("auth.oauth", { provider: "apple" })).toMatchObject({ ok: true, result: { provider: "apple" } });
    expect(await m.invoke("location.current", { accuracy: "high" })).toEqual({ ok: true, result: { lat: 35.6762, lng: 139.6503, accuracy: 5 } });
    expect(await m.invoke("file.pick", { accept: "image/*" })).toMatchObject({ ok: true, result: { files: [{ name: "a.png", type: "image/png" }] } });
    expect(await m.invoke("file.pick", { accept: ".pdf" })).toMatchObject({ ok: true, result: { files: [{ name: "b.pdf" }] } });
  });

  it("lay a rule's result over the example, and drop what a restart left out", async () => {
    const m = createMockCapabilities({ capabilities: { "scan.code": { result: { text: "TICKET-7" }, delayMs: 30 } } }, undefined, {});
    const out = m.invoke("scan.code", {});
    m.reset();
    expect(await out).toMatchObject({ ok: false, dropped: true });
    expect(await m.invoke("scan.code", {})).toEqual({ ok: true, result: { text: "TICKET-7", format: "qr" } });
  });
});

describe("a document's capabilities", () => {
  it("come in cleaned, and go out and back the same", () => {
    expect(cleanCapabilities({ uses: ["push.opened", "BAD NAME", "push.opened"], own: [{ name: "acme.scan", kind: "call", failures: ["cancelled", "nope"], future: 1 }, { name: "x", kind: "nope" }] })).toEqual({ uses: ["push.opened"], own: [{ name: "acme.scan", kind: "call", failures: ["cancelled"], future: 1 }] });
    expect(cleanCapabilities({ uses: [] })).toBeUndefined();
    const doc = openProject({ groups: [], frames: [{ id: "f", name: "F", x: 0, y: 0 }], capabilities: { uses: ["push.opened"] }, mocks: { capabilities: { "payment.pay": { fail: "cancelled", other: true } }, scenarios: [{ id: "s", name: "S", capabilities: { "payment.pay": { delayMs: 999999 } } }] } })!;
    expect(doc.capabilities).toEqual({ uses: ["push.opened"] });
    expect(doc.mocks?.capabilities).toEqual({ "payment.pay": { fail: "cancelled", other: true } });
    expect(doc.mocks?.scenarios?.[0].capabilities).toEqual({ "payment.pay": { delayMs: 60000 } });
    expect(parseProject(serializeProject(doc).text)!.doc.capabilities).toEqual(doc.capabilities);
  });

  it("uses what its designs invoke and draw, and what it names", () => {
    const doc = openProject({
      groups: [
        // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
        { id: "g", x: 0, y: 0, axis: "x", items: [{ id: "b", kind: "component", component: "button", label: "Pay", icon: null, variant: "filled", action: { to: "none", effects: [{ do: "call", operationId: "createOrder", then: { to: "none", effects: [{ do: "invoke", capability: "payment.pay", args: { orderId: "response.id" } }] } }] } }] },
        { id: "m", x: 0, y: 100, axis: "x", items: [{ id: "map1", kind: "component", component: "map", label: "Map", icon: null, variant: "filled", props: {} }] },
      ],
      frames: [{ id: "f", name: "F", x: 0, y: 0 }],
      capabilities: { uses: ["push.opened"] },
    })!;
    expect(capabilitiesUsed(doc)).toEqual(["map", "payment.pay", "push.opened"]);
  });
});

describe("the operations", () => {
  const store = () => new DocStore(stateOf({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ id: "b", kind: "component", component: "button", label: "Pay", icon: null, variant: "filled", props: {} }] }], frames: [{ id: "home", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const mcp = { origin: "mcp" as const };

  it("check an invoke against the catalog: the capability, its arguments, its depth", () => {
    const s = store();
    const tap = (effects: unknown[]) => s.run(ops.setAction, { id: "b", action: { to: "none", effects } as never }, mcp);
    tap([{ do: "invoke", capability: "payment.pay", args: { orderId: "'o1'" }, catch: { to: "none", effects: [{ do: "snackbar", message: "{{error.type}}" }] } }]);
    expect(s.get().doc.groups[0].items[0].action?.effects?.[0]).toMatchObject({ do: "invoke", capability: "payment.pay" });
    fails(() => tap([{ do: "invoke", capability: "payment.payy" }]), "invalid_value", /no capability "payment.payy"/);
    fails(() => tap([{ do: "invoke", capability: "payment.pay" }]), "invalid_value", /needs args.orderId/);
    fails(() => tap([{ do: "invoke", capability: "clipboard.write", args: { txt: "'x'" } }]), "invalid_value", /takes no argument "txt"/);
    fails(() => tap([{ do: "invoke", capability: "map" }]), "invalid_value", /is a view/);
    /* an answer may branch on what it says, but starts on nothing else */
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tap([{ do: "invoke", capability: "share.open", then: { to: "none", when: { expr: "result" }, else: { to: "none" } } }]);
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    fails(() => tap([{ do: "invoke", capability: "share.open", then: { to: "none", when: { expr: "result +" } } }]), "invalid_value", /then: when:/);
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    fails(() => tap([{ do: "invoke", capability: "share.open", then: { to: "none", trigger: { on: "hover" } } }]), "invalid_value", /then: takes no trigger/);
    fails(() => tap([{ do: "invoke", capability: "share.open", args: { url: "1 +" } }]), "invalid_value", /args.url/);
  });

  it("declare a capability of the product's own, use it, mock it and take it away", () => {
    const s = store();
    fails(() => s.run(ops.declareCapability, { name: "payment.pay", kind: "call" }, mcp), "refused", /catalog's/);
    fails(() => s.run(ops.declareCapability, { name: "Bad Name", kind: "call" }, mcp), "invalid_value");
    s.run(ops.declareCapability, { name: "acme.ticket.scan", kind: "call", args: { type: "object", properties: { gate: { type: "string" } }, required: ["gate"] }, failures: ["cancelled"] }, mcp);
    s.run(ops.setAction, { id: "b", action: { to: "none", effects: [{ do: "invoke", capability: "acme.ticket.scan", args: { gate: "'A'" } }] } as never }, mcp);
    s.run(ops.useCapabilities, { add: ["push.opened"] }, mcp);
    fails(() => s.run(ops.useCapabilities, { add: ["push.opened"] }, mcp), "nothing_to_do");
    s.run(ops.setMockCapability, { capability: "acme.ticket.scan", fail: "cancelled", delayMs: 10 }, mcp);
    expect(s.get().doc.mocks?.capabilities).toEqual({ "acme.ticket.scan": { fail: "cancelled", delayMs: 10 } });
    fails(() => s.run(ops.setMockCapability, { capability: "payment.pay", scenario: "nope", fail: "failed" }, mcp), "not_found");
    fails(() => s.run(ops.setMockCapability, { capability: "camera", fail: "denied" }, mcp), "invalid_value", /not a call/);
    s.run(ops.setMockCapability, { capability: "acme.ticket.scan", clear: true }, mcp);
    expect(s.get().doc.mocks).toBeUndefined();
    s.run(ops.removeCapability, { name: "acme.ticket.scan" }, mcp);
    expect(s.get().doc.capabilities).toEqual({ uses: ["push.opened"] });
    s.undo();
    expect(s.get().doc.capabilities?.own?.[0].name).toBe("acme.ticket.scan");
  });

  it("mock a capability in one scenario only", () => {
    const s = store();
    s.run(ops.addMockScenario, { name: "Payment cancelled", id: "pay-cancelled" }, mcp);
    s.run(ops.setMockCapability, { capability: "payment.pay", scenario: "pay-cancelled", fail: "cancelled" }, mcp);
    expect(s.get().doc.mocks?.scenarios?.[0].capabilities).toEqual({ "payment.pay": { fail: "cancelled" } });
    expect(s.get().doc.mocks?.capabilities).toBeUndefined();
  });
});
