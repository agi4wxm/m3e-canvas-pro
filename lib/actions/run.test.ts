import { describe, expect, it } from "vitest";
import { openProject, projectFile } from "../project";
import type { Doc } from "../tokens";
import { Backend } from "./consistency/check";
import { designDoc } from "./consistency/design";
import { ReferenceHost } from "./consistency/reference";
import type { CallArgs, Change, Host, Outcome, Tap } from "./host";
import { MAX_CALL_DEPTH, eventKey, eventOfKey, familyKey, familyOfKey, type Action, type Effect } from "./model";
import { coerce, fillCurrent, run, startOf, tapScope, vectorOf } from "./run";
import type { WorldInput } from "./host";
import { ops, DocStore, counterIds, guessMeasurer, stateOf } from "../core";

/* The interpreter's edges the consistency table does not reach: what starts an action, the event's payload, an answer
 * after a restart, an optimistic change and its undo, a host that throws, the one nesting limit. */

/** a host that records what it is asked, over the reference host */
function recording(doc: Doc, answers: (op: string) => Outcome | Promise<Outcome>) {
  const host = new ReferenceHost(doc, new Backend({}));
  const asked: { op: string; args: CallArgs }[] = [];
  const undone: string[] = [];
  const changes: Change[] = [];
  host.call = async (op: string, args: CallArgs) => {
    asked.push({ op, args });
    return answers(op);
  };
  host.optimistic = (source: string, change: Change) => {
    changes.push(change);
    return () => void undone.push(source);
  };
  const h: Host = host;
  return { host, h, asked, undone, changes };
}

const tap: Tap = { screen: "home", part: "go" };

describe("lib/actions", () => {
  it("starts a hover as a tap where there is no pointer, a delay after its time, anything else on a tap", () => {
    expect(startOf({ trigger: { on: "hover" } }, { pointer: true })).toEqual({ on: "hover" });
    expect(startOf({ trigger: { on: "hover" } }, { pointer: false })).toEqual({ on: "tap" });
    expect(startOf({ trigger: { on: "delay", ms: 1500.4 } }, { pointer: false })).toEqual({ on: "delay", ms: 1500 });
    expect(startOf({ trigger: { on: "delay", ms: -5 } }, { pointer: true })).toEqual({ on: "delay", ms: 0 });
    expect(startOf({}, { pointer: true })).toEqual({ on: "tap" });
  });

  it("names a part's events and families, and hands what an event carries and the place a family ran for to expressions", () => {
    expect(eventKey("change")).toBe("on:change");
    expect(eventOfKey("on:change")).toBe("change");
    expect(eventOfKey("tab:1")).toBeNull();
    expect(familyKey("tab")).toBe("tab:*");
    expect(familyOfKey("tab:*")).toBe("tab");
    expect(familyOfKey("on:*")).toBeNull();
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [] });
    const { h } = recording(doc, () => ({ ok: true, status: 200, response: {} }));
    expect((tapScope(h, { ...tap, event: { value: 21 } }) as { event?: unknown }).event).toEqual({ value: 21 });
    expect("event" in tapScope(h, tap)).toBe(false);
    expect((tapScope(h, { ...tap, slot: { key: "tab:2", index: 2 } }) as { slot?: unknown }).slot).toEqual({ key: "tab:2", index: 2 });
  });

  it("keeps a value to its variable's type", () => {
    expect(coerce("7", "number")).toBe(7);
    expect(coerce("x", "number")).toBeNull();
    expect(coerce(0, "bool")).toBe(false);
    expect(coerce("false", "bool")).toBe(false);
    expect(coerce(3, "text")).toBe("3");
  });

  it("fills {{current.field}} from the row last tapped, nothing for a field it does not have", () => {
    expect(fillCurrent({ to: "none", effects: [{ do: "snackbar", message: "Hi {{current.name}}{{current.gone}}" }] }, { name: "Ada" }).effects).toEqual([{ do: "snackbar", message: "Hi Ada" }]);
  });

  it("changes the tapped row first, puts it back when the call fails, and not when it was answered after a restart", async () => {
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [] });
    const remove: Effect = { do: "call", operationId: "del", optimistic: { source: "items", remove: true } };
    const failing = recording(doc, () => ({ ok: false, status: 500, error: {} }));
    await run({ to: "none", effects: [remove] }, failing.h, { ...tap, item: { id: "a" } });
    expect(failing.changes).toEqual([{ remove: true }]);
    expect(failing.undone).toEqual(["items"]);
    const dropped = recording(doc, () => ({ ok: false, status: 0, error: {}, dropped: true }));
    await run({ to: "none", effects: [remove] }, dropped.h, { ...tap, item: { id: "a" } });
    expect(dropped.changes.length).toBe(1);
    expect(dropped.undone).toEqual([]);
    /* no row tapped: nothing to change first */
    const none = recording(doc, () => ({ ok: true, status: 200, response: {} }));
    await run({ to: "none", effects: [remove] }, none.h, tap);
    expect(none.changes).toEqual([]);
  });

  it("patches the tapped row with fields read over it", async () => {
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [] });
    const r = recording(doc, () => ({ ok: true, status: 200, response: {} }));
    await run({ to: "none", effects: [{ do: "call", operationId: "like", optimistic: { source: "items", patch: { likes: "item.likes + 1" } } }] }, r.h, { ...tap, item: { likes: 1 } });
    const change = r.changes[0] as Extract<Change, { patch: unknown }>;
    expect(change.patch({ likes: 4 })).toEqual({ likes: 5 });
  });

  it("reads a call's arguments when it is made, leaving out what reads as nothing", async () => {
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], vars: [{ id: "q", name: "query", type: "text", value: "tea" }], parts: [] });
    const r = recording(doc, () => ({ ok: true, status: 200, response: {} }));
    await run({ to: "none", effects: [{ do: "call", operationId: "find", args: { q: "vars.query", gone: "data.nothing.here" }, body: "{ a: 1 }" }] }, r.h, tap);
    expect(r.asked).toEqual([{ op: "find", args: { args: { q: "tea" } } }]);
  });

  it("turns a host that throws into a failed call, and settles", async () => {
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [] });
    const r = recording(doc, () => Promise.reject(new Error("offline")));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const a: Action = { to: "none", effects: [{ do: "call", operationId: "x", catch: { to: "none", effects: [{ do: "snackbar", message: "{{status}}" }] } }] };
    await run(a, r.h, tap);
    expect(r.host.snack).toBe("0");
  });

  it("keeps the same nesting limit as the file reader", () => {
    expect(MAX_CALL_DEPTH).toBe(4);
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const deep = (n: number): Effect => (n === 0 ? { do: "call", operationId: "c" } : { do: "call", operationId: "c", then: { to: "none", effects: [deep(n - 1)] } });
    const built = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [{ id: "go", label: "Go", action: { to: "none", effects: [deep(6)] }, unchecked: true }] }).doc;
    const doc = openProject(projectFile(built));
    let depth = 0;
    let e: Effect | undefined = doc?.groups.flatMap((g) => g.items).find((it) => it.id === "go")?.action?.effects?.[0];
    while (e?.do === "call" && e.then?.effects?.[0]) {
      depth++;
      e = e.then.effects[0];
    }
    expect(e?.do).toBe("call");
    expect(depth).toBe(MAX_CALL_DEPTH);
  });
  it("runs the branch an answer's condition picks: then on the response, catch on the status, an invoke's on its result", async () => {
    const { doc } = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [] });
    const say = (message: string) => ({ to: "none", effects: [{ do: "snackbar" as const, message }] });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const branching = (answers: Pick<Extract<Effect, { do: "call" }>, "then" | "catch">): Action => ({ to: "none", effects: [{ do: "call", operationId: "pay", ...answers }] });
    const paid = recording(doc, () => ({ ok: true, status: 200, response: { state: "paid" } }));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    await run(branching({ then: { ...say("Paid"), when: { expr: "response.state == 'paid'" }, else: say("Pending") } }), paid.h, tap);
    expect(paid.host.snack).toBe("Paid");
    const pending = recording(doc, () => ({ ok: true, status: 200, response: { state: "pending" } }));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    await run(branching({ then: { ...say("Paid"), when: { expr: "response.state == 'paid'" }, else: say("Pending") } }), pending.h, tap);
    expect(pending.host.snack).toBe("Pending");
    /* no else: nothing runs when the condition does not hold */
    const quiet = recording(doc, () => ({ ok: true, status: 200, response: { state: "pending" } }));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    await run(branching({ then: { ...say("Paid"), when: { expr: "response.state == 'paid'" } } }), quiet.h, tap);
    expect(quiet.host.snack).toBeNull();
    const full = recording(doc, () => ({ ok: false, status: 409, error: {} }));
    await run(branching({ catch: { ...say("Taken"), when: { expr: "status == 409" }, else: say("Failed") } }), full.h, tap);
    expect(full.host.snack).toBe("Taken");
    const scanned = recording(doc, () => ({ ok: true, status: 200, response: {} }));
    scanned.host.invoke = async () => ({ ok: true, result: { text: "" } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    await run({ to: "none", effects: [{ do: "invoke", capability: "scan.code", then: { ...say("Read"), when: { expr: "result.text" }, else: say("Empty") } }] }, scanned.h, tap);
    expect(scanned.host.snack).toBe("Empty");
  });

  it("keeps an answer's condition and its else through a file, and drops one that is no condition", () => {
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const then = { to: "none", when: { expr: "response.ok" }, else: { to: "none", effects: [{ do: "snackbar" as const, message: "No" }] } };
    const built = designDoc({
      screens: [{ id: "home", name: "Home" }],
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      parts: [{ id: "go", label: "Go", action: { to: "none", effects: [{ do: "call", operationId: "c", then, catch: { ...then, when: { nonsense: 1 } as never } }] }, unchecked: true }],
    }).doc;
    const e = openProject(projectFile(built))?.groups.flatMap((g) => g.items).find((it) => it.id === "go")?.action?.effects?.[0] as Extract<Effect, { do: "call" }>;
    expect(e.then).toEqual(then);
    expect(e.catch && "when" in e.catch).toBe(false);
  });

  /* ---------- input actions (docs/交互规则.md “输入动作”) ---------- */

  it("reads a direction as one: {x, y} or words, kept to -1…1 and two places, a longer one cut back to length 1", () => {
    expect(vectorOf({ x: 0.5, y: -1 })).toEqual({ x: 0.45, y: -0.89 });
    expect(vectorOf("1,0")).toEqual({ x: 1, y: 0 });
    expect(vectorOf(" 0.25 , 0.5 ")).toEqual({ x: 0.25, y: 0.5 });
    expect(vectorOf({ x: -0, y: 0 })).toEqual({ x: 0, y: 0 });
    for (const none of ["", "1", "1,2,3", "a,b", ",1", null, undefined, 3, [1, 0], { x: "1", y: 0 }, { x: Number.NaN, y: 0 }]) expect(vectorOf(none), JSON.stringify(none)).toBeNull();
  });

  it("sends a world view a direction read at its step, presses and lets go in order, and nothing for no direction", async () => {
    const doc = designDoc({ screens: [{ id: "home", name: "Home" }], parts: [{ id: "arena", kind: "world", label: "Arena" }] }).doc;
    const host = new ReferenceHost(doc, new Backend({}));
    const sent: [string, string, WorldInput][] = [];
    host.worldInput = (part, action, value) => void sent.push([part, action, value]);
    const at: Tap = { ...tap, event: { x: 0, y: -1 } };
    await run({ to: "none", effects: [{ do: "move", part: "arena", vector: "event" }, { do: "move", part: "arena", action: "aim", vector: "'0.5,0.5'" }, { do: "move", part: "arena", vector: "nowhere" }, { do: "press", part: "arena", action: "attack" }, { do: "release", part: "arena", action: "attack" }] }, host, at);
    expect(sent).toEqual([
      ["arena", "move", { x: 0, y: -1 }],
      ["arena", "aim", { x: 0.5, y: 0.5 }],
      ["arena", "attack", true],
      ["arena", "attack", false],
    ]);
    /* an input with no name of the world's kind, or no part, goes nowhere; a host with no world views drops it */
    sent.length = 0;
    await run({ to: "none", effects: [{ do: "press", part: "arena", action: "Bad name" }, { do: "move", part: "", vector: "1,0" }] as Effect[] }, host, at);
    expect(sent).toEqual([]);
    const plain = new ReferenceHost(doc, new Backend({}));
    delete (plain as Partial<Host>).worldInput;
    await expect(run({ to: "none", effects: [{ do: "press", part: "arena", action: "attack" }] }, plain, at)).resolves.toBeUndefined();
  });

  it("keeps the input actions through a file, and drops one that is malformed", () => {
    const built = designDoc({
      screens: [{ id: "home", name: "Home" }],
      parts: [
        { id: "arena", kind: "world", label: "Arena" },
        { id: "go", label: "Go", unchecked: true, action: { to: "none", effects: [{ do: "move", part: "arena", vector: "event" }, { do: "move", part: "arena", action: "Bad", vector: "1,0" }, { do: "press", part: "arena", action: "jump" }, { do: "release", part: "arena" } as never, { do: "move", part: "arena", vector: "" }] } },
      ],
    }).doc;
    const effects = openProject(projectFile(built))?.groups.flatMap((g) => g.items).find((it) => it.id === "go")?.action?.effects;
    expect(effects).toEqual([
      { do: "move", part: "arena", vector: "event" },
      { do: "press", part: "arena", action: "jump" },
    ]);
  });

  it("checks an input action against the world it goes to: a world view, and an input its world takes", () => {
    const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    const set = (effects: Effect[]) => () => store.transact("set", "mcp", (tx) => tx.run(ops.setAction, { id: "go", action: { to: "none", effects } as never }));
    store.transact("build", "mcp", (tx) => {
      tx.run(ops.addScreen, { id: "home", name: "Home" });
      tx.run(ops.addPart, { slug: "world-view", id: "arena", screen: "home", at: { x: 16, y: 16 }, props: { inputs: "move, attack" } });
      tx.run(ops.addPart, { slug: "button", id: "go", screen: "home", at: { x: 16, y: 300 }, props: { label: "Go" } });
    });
    expect(set([{ do: "move", part: "arena", vector: "event" }, { do: "press", part: "arena", action: "attack" }])).not.toThrow();
    expect(set([{ do: "press", part: "go", action: "attack" }])).toThrow(/world view/);
    expect(set([{ do: "press", part: "arena", action: "jump" }])).toThrow(/takes move, attack/);
    expect(set([{ do: "move", part: "arena", vector: "" }])).toThrow(/vector/);
    expect(set([{ do: "move", part: "arena", vector: "event." }])).toThrow();
    expect(set([{ do: "move", part: "missing", vector: "1,0" }])).toThrow(/no part/);
  });
});
