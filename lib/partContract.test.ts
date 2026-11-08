/* What a part sends out and what it only acts out (lib/partContract.ts), as the operations, the tools and the exports
 * see it: the keys `Item.actions` may hold, a family's action for every slot, an event's payload, a demo that stops
 * as soon as something real takes it over, and an export that never runs a demo in the product and reports what it
 * cannot do yet instead of dropping it (docs/边界与契约.md). */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { PARTS, partBySlug } from "../parts/registry";
import { setGlobalLang } from "./i18n";
import { INPUT_PROP, isOverlayPart } from "./interact";
import { counterIds, DocStore, guessMeasurer, OpError, ops, savedDoc, stateOf } from "./core";
import { describeNode } from "./core/query";
import { executeTool } from "./tools";
import { demoRuns, demoTakenOver, eventAction, outletKeysOf, payloadOf, slotAction, untakenDemos } from "./partContract";
import { listRowsPatch, makeItem, type Action, type Doc, type Item } from "./tokens";
import { buildProject } from "./exportProject";
import { buildProduct } from "./export/product";
import { boundaryDifferences } from "./export/boundary";
import { differenceCounts } from "./export/differences";
import { toolGuide } from "./tools/registry";
import { agentSystem } from "./agent/prompt";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const stay = (effects: Action["effects"] = []): Action => ({ to: "none", transition: "none", effects });
const part = (slug: string, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id: slug, ...more });

/** a store with one screen, as the AI and MCP use it */
function store() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home", h: 1600 }, { origin: "ai" });
  return s;
}
const fails = (fn: () => unknown, words: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};

describe("the declarations replace the lists by slug", () => {
  it("make the inputs the parts that declare one, the eight the hosts always wired among them, each by the same prop", () => {
    const before = { input: "value", "text-field": "value", textarea: "value", switch: "checked", checkbox: "checked", slider: "value", select: "selected", "radio-group": "selected" };
    for (const [slug, prop] of Object.entries(before)) expect(INPUT_PROP[slug], slug).toBe(prop);
    expect(INPUT_PROP).toMatchObject({ rating: "value", "quantity-stepper": "value", "number-pad": "value" });
    for (const d of PARTS) expect(INPUT_PROP[d.slug], d.slug).toBe(d.input?.prop);
  });

  it("make the overlays the same parts the category and the names used to say", () => {
    for (const d of PARTS) expect(isOverlayPart(part(d.slug)), d.slug).toBe(d.category === "Overlays" || /menu|drawer/.test(d.slug));
  });

  it("name the destination bars, whose chosen entry the preview and the web app share across screens", () => {
    expect(PARTS.filter((d) => d.nav).map((d) => d.slug).sort()).toEqual(["navigation-bar", "navigation-rail", "tabs"]);
  });
});

describe("a part's outlets", () => {
  it("are its slots, its families and its events, and nothing else", () => {
    expect(outletKeysOf(part("number-pad"))).toEqual(["confirm", "on:submit"]);
    expect(outletKeysOf(part("item", { props: { items: [{ label: "A" }, { label: "B" }] } }))).toEqual(["tab:0", "tab:1", "tab:*"]);
    expect(outletKeysOf(part("prize-wheel"))).toEqual(["on:settled"]);
    expect(outletKeysOf(part("text"))).toEqual([]);
  });

  it("run a slot's own action before its family's, and give the family the slot it was", () => {
    const own = stay([{ do: "snackbar", message: "own" }]);
    const every = stay([{ do: "snackbar", message: "every" }]);
    const it = part("item", { props: { items: [{ label: "A" }, { label: "B" }, { label: "C" }] }, actions: { "tab:1": own, "tab:*": every } });
    expect(slotAction(it, "tab:1")).toEqual({ action: own });
    expect(slotAction(it, "tab:2")).toEqual({ action: every, scope: { slot: { key: "tab:2", index: 2 } } });
    /* a part with no such family gives none, whatever its actions hold */
    expect(slotAction(part("coupon", { actions: { "tab:*": every } }), "tab:0")).toBeNull();
    expect(eventAction(part("number-pad", { actions: { "on:submit": own } }), "submit")).toBe(own);
    expect(eventAction(part("number-pad", { actions: { "on:nope": own } }), "nope")).toBeNull();
  });

  it("carry only what an event declares, each field of its kind", () => {
    const submit = partBySlug("number-pad")!.events![0];
    expect(payloadOf(submit, { value: "42", extra: "x" })).toEqual({ value: "42" });
    expect(payloadOf(submit, { value: 42 })).toEqual({});
    expect(payloadOf(submit, "nope")).toEqual({});
  });

  it("keep a family's action when the rows it answers are edited", () => {
    const every = stay();
    const it = part("item", { props: { items: [{ label: "A" }, { label: "B" }] }, actions: { "tab:1": stay(), "tab:*": every } });
    const patch = listRowsPatch(it, "items", [{ label: "B" }], [1]);
    expect(patch.actions).toEqual({ "tab:0": stay(), "tab:*": every });
  });
});

describe("the operations", () => {
  it("wire an event, a family and a slot the part declares, and refuse a key it does not", () => {
    const s = store();
    s.run(ops.addPart, { slug: "number-pad", id: "pad", screen: "home", at: { x: 16, y: 40 } }, { origin: "ai" });
    s.run(ops.addPart, { slug: "item", id: "rows", screen: "home", at: { x: 16, y: 500 } }, { origin: "ai" });
    s.run(ops.setAction, { id: "pad", slot: "on:submit", action: stay([{ do: "snackbar", message: "{{event.value}}" }]) }, { origin: "ai" });
    s.run(ops.setAction, { id: "rows", slot: "tab:*", action: stay([{ do: "snackbar", message: "{{slot.index}}" }]) }, { origin: "ai" });
    const items = s.get().doc.groups.flatMap((g) => g.items);
    expect(Object.keys(items.find((x) => x.id === "pad")!.actions ?? {})).toEqual(["on:submit"]);
    expect(Object.keys(items.find((x) => x.id === "rows")!.actions ?? {})).toEqual(["tab:*"]);
    fails(() => s.run(ops.setAction, { id: "pad", slot: "on:nope", action: stay() }, { origin: "ai" }), /"on:nope" is not an event this part sends \(it has confirm, on:submit\)/);
    fails(() => s.run(ops.setAction, { id: "pad", slot: "tab:*", action: stay() }, { origin: "ai" }), /not a family of places/);
  });

  it("refuse a condition on a call's answer, which no host would read", () => {
    const s = store();
    s.run(ops.addEndpoint, { operationId: "pay", method: "post", path: "/pay", returns: { type: "object", properties: { status: { type: "string" } } } }, { origin: "ai" });
    s.run(ops.addPart, { slug: "button", id: "b", screen: "home", at: { x: 16, y: 40 } }, { origin: "ai" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const answer = { do: "call", operationId: "pay", then: { to: "none", transition: "none", when: { expr: "response.status == 'paid'" } } };
    fails(() => s.run(ops.setAction, { id: "b", action: stay([answer as never]) }, { origin: "ai" }), /then takes no when: it runs whenever the call answers 2XX/);
  });

  it("describe what a part declares, for the AI and MCP", async () => {
    const s = store();
    s.run(ops.addPart, { slug: "coupon", id: "c", screen: "home", at: { x: 16, y: 40 } }, { origin: "ai" });
    const node = describeNode(s.get().doc, {}, "c") as Record<string, unknown>;
    expect(node.demo).toMatchObject({ onlyInPrototype: true });
    expect(node.demoRunsInPrototype).toBe(true);
    const pad = await executeTool(s, "describe_part", { slug: "number-pad" }, { origin: "ai" } as never);
    expect(pad.ok && (pad.result as Record<string, unknown>)).toMatchObject({ input: { prop: "value", kind: "text" }, events: [{ key: "on:submit", payload: { "event.value": "text" } }] });
    const listed = await executeTool(s, "list_parts", { query: "number pad" }, { origin: "ai" } as never);
    expect(JSON.stringify(listed.ok && listed.result)).toContain("events: on:submit");
  });
});

describe("a demo", () => {
  const claim = stay([{ do: "call", operationId: "claimCoupon" }]);
  it("runs only in a prototype, until a prop it names is bound or its part calls the API", () => {
    expect(demoRuns(part("coupon"), "prototype")).toBe(true);
    expect(demoRuns(part("coupon"), "product")).toBe(false);
    expect(demoTakenOver(part("coupon", { bind: { claimed: "=data.coupon.value.claimed" } }))).toBe(true);
    expect(demoTakenOver(part("coupon", { actions: { action: claim } }))).toBe(true);
    expect(demoTakenOver(part("coupon", { actions: { action: { to: "home", transition: "slide" } } }))).toBe(false);
    expect(demoTakenOver(part("prize-wheel", { bind: { result: "won" } }))).toBe(true);
    expect(demoRuns(part("text"), "prototype")).toBe(false);
    expect(untakenDemos([part("coupon"), part("coupon", { actions: { action: claim } }), part("text")]).map((x) => x.component)).toEqual(["coupon"]);
  });
});

/* ---------- the exports ---------- */

function demoDoc(): Doc {
  const s = store();
  const ai = { origin: "ai" as const };
  s.run(ops.addEndpoint, { operationId: "claimCoupon", method: "post", path: "/claims", returns: { type: "object", properties: { ok: { type: "boolean" } } } }, ai);
  s.run(ops.addVar, { id: "score", name: "score", type: "number", value: 3 }, ai);
  s.run(ops.addPart, { slug: "coupon", id: "free", screen: "home", at: { x: 16, y: 40 } }, ai);
  s.run(ops.addPart, { slug: "coupon", id: "asked", screen: "home", at: { x: 16, y: 160 } }, ai);
  s.run(ops.setAction, { id: "asked", slot: "action", action: stay([{ do: "call", operationId: "claimCoupon" }]) }, ai);
  s.run(ops.addPart, { slug: "number-pad", id: "pad", screen: "home", at: { x: 16, y: 280 } }, ai);
  /* an operation the contract does not have: strict operations refuse it, a file written elsewhere can hold it */
  s.run(ops.setAction, { id: "pad", slot: "on:submit", action: stay([{ do: "call", operationId: "payNow" }]) }, { origin: "user" });
  s.run(ops.addPart, { slug: "rating", id: "stars", screen: "home", at: { x: 16, y: 760 } }, ai);
  s.run(ops.bindProp, { id: "stars", prop: "value", var: "score" }, ai);
  s.run(ops.addPart, { slug: "map", id: "where", screen: "home", at: { x: 16, y: 800 } }, ai);
  return savedDoc(s.get());
}

describe("the exports", () => {
  it("act out a demo in the prototype only where nothing takes it over, and wire a widget's input to its variable", async () => {
    const { files } = await buildProject(demoDoc(), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const screen = Object.entries(files).find(([p]) => /^src\/screens\/.*\.tsx$/.test(p))![1] as string;
    /* each part's JSX, up to its end */
    const jsx = (name: string) => screen.split(`<${name}`).slice(1).map((x) => x.slice(0, x.indexOf("/>")));
    expect(jsx("Coupon").map((x) => /\bdemo\b/.test(x))).toEqual([true, false]);
    /* the pad's submit calls the API: its demo is taken over, so it never says it was sent by itself */
    expect(jsx("NumberPad").map((x) => /\bdemo\b/.test(x))).toEqual([false]);
    expect(screen).toMatch(/<Rating[^>]*value=\{vars\.score\}[^>]*onValueChange=\{\(value\) => setVar\("score", Number\(value\) \|\| 0\)\}/);
  }, 60_000);

  it("never run a demo in the product, and report it, the event, the missing interface and the capability on every app", async () => {
    const product = await buildProduct(demoDoc(), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const web = Object.entries(product.files).filter(([p]) => p.startsWith("apps/web/src/generated/screens/") && p.endsWith(".tsx"));
    expect(web.length).toBeGreaterThan(0);
    for (const [, f] of web) expect(String(f.body)).not.toMatch(/^\s*demo$|\bdemo=/m);
    const counts = differenceCounts(product.differences);
    for (const app of ["web", "mobile", "miniapp"] as const) {
      const kinds = Object.fromEntries(counts.find((c) => c.app === app)?.kinds ?? []);
      expect(kinds, app).toMatchObject({ demo: 1, event: 1, interface: 1, capability: 1 });
    }
    const warnings = JSON.parse(String(product.files["apps/web/src/generated/warnings.json"].body)) as { kind: string; detail: string }[];
    expect(warnings.find((w) => w.kind === "interface")?.detail).toContain('"payNow"');
    expect(warnings.find((w) => w.kind === "event")?.detail).toContain('"submit"');
    /* the mobile printers print no tap for an event, they report it */
    for (const [p, f] of Object.entries(product.files)) if (/^apps\/(mobile|miniapp)\/src\/generated\/screens\//.test(p)) expect(String(f.body), p).not.toContain("on:submit");
  }, 120_000);

  it("report nothing of the kind for a design that leans on nothing", () => {
    const s = store();
    s.run(ops.addPart, { slug: "button", id: "b", screen: "home", at: { x: 16, y: 40 } }, { origin: "ai" });
    for (const app of ["web", "mobile", "miniapp"] as const) expect(boundaryDifferences(savedDoc(s.get()), app)).toEqual([]);
  });
});

describe("the AI is told the boundary", () => {
  it("in the tools' guide, which the in-app agent and MCP both start from", () => {
    const guide = toolGuide();
    for (const words of ["Variables hold UI state only", "Never decide a result on the screen", "Platform capabilities", "keeps its data to itself", "on:<name>"]) expect(guide).toContain(words);
    const system = agentSystem({ guide, canSee: true, drawings: 0 });
    expect(system).toContain("a random or a jump to a success screen never stands in for a result");
  });
});
