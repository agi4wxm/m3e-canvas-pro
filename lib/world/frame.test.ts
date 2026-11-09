/* Bindings per frame (lib/bindings/frame.ts, docs/数据绑定.md “每帧绑定”): the rule a per-frame expression is held to (in
 * one place), the `world` root it reads, the frame loop every host runs them on, the web's writer, and the operation that
 * binds one, strict as the AI and MCP call it. */

import { beforeAll, describe, expect, it } from "vitest";
import { createFrameLoop } from "../app/frame";
import { compileFrame, frameExprError, FRAME_LIMITS, readsWorld } from "../bindings/frame";
import { suggest, shapeFor } from "../bindings/complete";
import { exprPlaceError } from "../bindings/check";
import { counterIds, DocStore } from "../core/store";
import { guessMeasurer } from "../core/op";
import { stateOf } from "../core/state";
import * as ops from "../core/ops";
import { setGlobalLang } from "../i18n";
import { openProject, projectFile } from "../project";
import { formatProject } from "../core/projectFile";
import type { Doc } from "../tokens";
import { createWorlds } from "./channel";
import { connectWorld, createExampleWorld } from "./example";
import { frameTargetOf, writeFrameDom, type FrameNode } from "./frameTargets";
import { readWorld, worldRootOf, worldRootSchema } from "./root";
import { EXAMPLE_WORLD_CONTRACT } from "./contract";

beforeAll(() => setGlobalLang("en"));

describe("a per-frame expression", () => {
  it("reads world with literals and arithmetic, and nothing else", () => {
    for (const ok of ["world.score", "world.byId.hero.x / 100", "(world.byId.cd.readyAt - world.clock.now) / 1000", "world.status == 'ended' ? 0 : 100", "'HP ' + (world.byId['slime'].hp ?? 0)", "world.entities[0].x", "-world.score % 3"]) expect(frameExprError(ok), ok).toBeNull();
    expect(frameExprError("round(world.score)")).toMatch(/calls no helper/);
    expect(frameExprError("data.hp.value")).toMatch(/reads only world/);
    expect(frameExprError("world.score + vars.bonus")).toMatch(/not vars/);
    expect(frameExprError("now")).toMatch(/not now/);
    expect(frameExprError("world.")).toMatch(/no expression/);
    expect(frameExprError("")).toMatch(/empty/);
    expect(frameExprError(3)).toMatch(/text/);
    expect(frameExprError(`world.score${" + 1".repeat(30)}`)).toMatch(/at most 48 steps/);
    expect(frameExprError(`world.a${".b".repeat(200)}`)).toMatch(/at most 400 characters/);
    expect(frameExprError(`${"(".repeat(20)}world.score${")".repeat(20)}`)).toBeNull();
    expect(compileFrame("round(world.score)")).toBeNull();
    expect(compileFrame("world.score")).not.toBeNull();
    expect(readsWorld("world.score + 1")).toBe(true);
    expect(readsWorld("data.x")).toBe(false);
  });

  it("is the only binding that reads world: any other is refused where it goes", () => {
    const shape = { sources: [], params: [], vars: [], inRepeat: false };
    expect(exprPlaceError("world.score", shape)).toMatch(/only by a binding per frame/);
  });
});

describe("the world root", () => {
  it("is the snapshot with its entities by id and the world's clock", () => {
    const root = worldRootOf({ entities: [{ id: "hero", kind: "player", x: 1, y: 2 }, { id: "hero", kind: "ghost", x: 9, y: 9 }, { kind: "nameless" }], score: 3 }, { now: 1500, paused: false, rate: 2 });
    expect(root.score).toBe(3);
    expect((root.byId as Record<string, { kind: string }>).hero.kind).toBe("player");
    expect(root.clock).toEqual({ now: 1500, paused: false, rate: 2 });
    expect(worldRootOf("junk")).toEqual({ byId: {}, clock: { now: 0, paused: true, rate: 1 } });
    /* a world that throws reads as none */
    expect(readWorld({ view: () => { throw new Error("no"); } })).toBeUndefined();
    expect(readWorld(undefined)).toBeUndefined();
  });

  it("has a schema made of the contract's snapshot", () => {
    const s = worldRootSchema(EXAMPLE_WORLD_CONTRACT.snapshot) as { properties: Record<string, { additionalProperties?: { properties?: Record<string, unknown> } }> };
    expect(Object.keys(s.properties).sort()).toEqual(["byId", "clock", "entities", "follow", "score", "status"]);
    expect(Object.keys(s.properties.byId.additionalProperties!.properties!)).toContain("label");
  });
});

/** a world whose snapshot the test sets, standing still at a time it sets */
function fakeWorld(view: Record<string, unknown>, now = 0) {
  const w = { view: () => view, clock: () => ({ now, paused: false, rate: 1 }), set(v: Record<string, unknown>, at = now) { view = v; now = at; } };
  return w;
}

describe("the frame loop", () => {
  it("evaluates each binding per frame over the world and hands on what changed", () => {
    const world = fakeWorld({ entities: [{ id: "hero", hp: 72 }], score: 1 }, 1000);
    const loop = createFrameLoop({ world: () => world });
    const heard: (string | number)[] = [];
    const always: (string | number)[] = [];
    loop.add([
      { part: "hp", prop: "text", expr: "'HP ' + world.byId.hero.hp", kind: "text" },
      { part: "bar", prop: "value", expr: "world.byId.hero.hp * 2", kind: "number", min: 0, max: 100 },
      { part: "cd", prop: "text", expr: "(4000 - world.clock.now) / 1000", kind: "text" },
      { part: "bad", prop: "text", expr: "round(world.score)", kind: "text" },
    ]);
    loop.listen("hp", "text", (v) => heard.push(v));
    loop.listen("hp", "text", (v) => always.push(v), true);
    loop.tick();
    expect(loop.value("hp", "text")).toBe("HP 72");
    /* a number is kept to the prop's range */
    expect(loop.value("bar", "value")).toBe(100);
    expect(loop.value("cd", "text")).toBe("3");
    /* an expression that breaks the rule is never evaluated */
    expect(loop.value("bad", "text")).toBeUndefined();
    loop.tick();
    expect(heard).toEqual(["HP 72"]);
    expect(always).toEqual(["HP 72", "HP 72"]);
    world.set({ entities: [{ id: "hero", hp: 40 }] }, 2500);
    loop.tick();
    expect(heard).toEqual(["HP 72", "HP 40"]);
    expect(loop.value("bar", "value")).toBe(80);
    expect(loop.value("cd", "text")).toBe("1.5");
    expect(loop.words().sort()).toEqual(["1.5", "HP 40"]);
    /* a listener that comes later hears the value there is at once */
    const late: (string | number)[] = [];
    loop.listen("hp", "text", (v) => late.push(v));
    expect(late).toEqual(["HP 40"]);
  });

  it("writes nothing while there is no world, and runs only while there is a binding to evaluate", () => {
    let world: ReturnType<typeof fakeWorld> | undefined;
    const waiting: (() => void)[] = [];
    const loop = createFrameLoop({ world: () => world, schedule: (fn) => waiting.push(fn), cancel: () => {} });
    expect(waiting.length).toBe(0);
    const off = loop.add([{ part: "hp", prop: "text", expr: "world.score", kind: "text" }]);
    expect(waiting.length).toBe(1);
    waiting.shift()!();
    expect(loop.value("hp", "text")).toBeUndefined();
    world = fakeWorld({ score: 9 });
    waiting.shift()!();
    expect(loop.value("hp", "text")).toBe("9");
    expect(loop.frames()).toBe(2);
    off();
    /* the frame already asked for runs, and asks for no other */
    waiting.shift()!();
    expect(waiting.length).toBe(0);
  });

  it("reads the world a view connected to its channel, until it is disconnected", () => {
    const worlds = createWorlds(() => 0);
    const loop = createFrameLoop({ world: () => worlds.attached() });
    loop.add([{ part: "s", prop: "text", expr: "world.byId.hero.x", kind: "text" }]);
    const w = createExampleWorld({ entities: [{ id: "hero", kind: "player", x: 20, y: 50 }] }, { now: () => 0 });
    const off = connectWorld(w, worlds.channel("arena"));
    loop.tick();
    expect(loop.value("s", "text")).toBe("20");
    worlds.send("arena", "move", { x: 1, y: 0 });
    w.step(100);
    loop.tick();
    expect(loop.value("s", "text")).toBe("25");
    off();
    expect(worlds.attached()).toBeUndefined();
  });
});

/** a node of a fake DOM: enough for the writer */
function node(slot: string | null, attrs: Record<string, string> = {}, kids: FakeNode[] = [], text?: string): FakeNode {
  const n: FakeNode = {
    nodeType: 1,
    nodeValue: null,
    kids,
    attrs: { ...attrs, ...(slot ? { "data-slot": slot } : {}) },
    styles: {},
    writes: 0,
    get firstChild() { return this.kids[0] ?? null; },
    nextSibling: null,
    get textContent() { return this.kids.map((k) => k.textContent ?? "").join(""); },
    set textContent(v: string | null) { this.kids = [textNode(v ?? "")]; this.writes++; },
    style: { getPropertyValue: (k: string) => n.styles[k] ?? "", setProperty: (k: string, v: string) => { n.styles[k] = v; n.writes++; } },
    getAttribute: (k: string) => n.attrs[k] ?? null,
    setAttribute: (k: string, v: string) => { n.attrs[k] = v; n.writes++; },
    querySelector(sel: string) {
      const want = /\[data-slot="([^"]+)"\]/.exec(sel)?.[1];
      const all = (x: FakeNode): FakeNode[] => x.kids.flatMap((k) => [k, ...all(k)]);
      return all(n).find((k) => k.attrs?.["data-slot"] === want) ?? null;
    },
  } as FakeNode;
  if (text !== undefined) n.kids = [textNode(text)];
  return n;
}
type FakeNode = FrameNode & { kids: FakeNode[]; attrs: Record<string, string>; styles: Record<string, string>; writes: number };
function textNode(v: string): FakeNode {
  const t = { nodeType: 3, nodeValue: v, kids: [], attrs: {}, styles: {}, writes: 0, firstChild: null, nextSibling: null } as unknown as FakeNode;
  Object.defineProperty(t, "textContent", { get: () => t.nodeValue });
  return t;
}

describe("the web's writer", () => {
  it("writes a text's words into its text node, a stat bar's fill and numbers, and any part's opacity, and only what differs", () => {
    const text = node("text", {}, [], "HP ?");
    const box = node(null, {}, [text]);
    const was = text.firstChild;
    writeFrameDom("text", "text", box, "HP 72");
    expect(text.textContent).toBe("HP 72");
    /* the node React keeps is the one written */
    expect(text.firstChild).toBe(was);
    const fill = node("stat-bar-fill", {}, []);
    const track = node("stat-bar-track", { "aria-valuemax": "200", "aria-valuenow": "10" }, [fill]);
    const words = node("stat-bar-value", {}, [], "10/200");
    const bar = node(null, {}, [node("stat-bar", {}, [track, words])]);
    writeFrameDom("stat-bar", "value", bar, 50);
    expect(fill.styles.width).toBe("25%");
    expect(track.attrs["aria-valuenow"]).toBe("50");
    expect(words.textContent).toBe("50/200");
    const writes = fill.writes + track.writes;
    writeFrameDom("stat-bar", "value", bar, 50);
    expect(fill.writes + track.writes).toBe(writes);
    writeFrameDom("text", "@opacity", box, 40);
    expect(box.styles.opacity).toBe("0.4");
    /* no value, or no drawing there: nothing */
    writeFrameDom("text", "text", box, undefined);
    writeFrameDom("stat-bar", "value", node(null), 5);
    expect(frameTargetOf("text", "style")).toBeUndefined();
    expect(frameTargetOf("button", "@opacity")?.max).toBe(100);
  });
});

/** a store on a world view and a HUD, every call strict as the AI and MCP make them */
function arena() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("a"), measurer: guessMeasurer, lang: () => "en" });
  const run = (o: object, args: Record<string, unknown>) => s.run(o as never, args as never, { origin: "mcp" });
  run(ops.addScreen, { id: "arena", name: "Arena" });
  run(ops.addPart, { slug: "world-view", id: "world", screen: "arena", at: { x: 16, y: 40 } });
  run(ops.addPart, { slug: "text", id: "score", screen: "arena", at: { x: 16, y: 300 } });
  run(ops.addPart, { slug: "stat-bar", id: "hp", screen: "arena", at: { x: 16, y: 340 } });
  const item = (id: string) => s.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === id)!;
  return { s, run, item, doc: () => s.get().doc };
}
const refused = (fn: () => unknown, words: RegExp) => {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(String((err as Error | undefined)?.message), String(words)).toMatch(words);
};

describe("bind_expression with frame", () => {
  it("binds a prop per frame to a read of the world its contract describes, one binding a prop", () => {
    const { run, item, doc } = arena();
    run(ops.bindExpression, { id: "score", prop: "text", expr: "'Score ' + world.score", frame: true });
    expect(item("score").frame).toEqual({ text: "'Score ' + world.score" });
    run(ops.bindExpression, { id: "hp", prop: "value", expr: "world.byId.hero.x", frame: true });
    run(ops.bindExpression, { id: "hp", prop: "@opacity", expr: "world.status == 'ended' ? 40 : 100", frame: true });
    expect(item("hp").frame).toEqual({ value: "world.byId.hero.x", "@opacity": "world.status == 'ended' ? 40 : 100" });
    /* bound again through the app's state, it is no longer per frame; and back */
    run(ops.bindExpression, { id: "score", prop: "text", expr: "'x'" });
    expect(item("score").frame).toBeUndefined();
    expect(item("score").bind).toEqual({ text: "='x'" });
    run(ops.bindExpression, { id: "score", prop: "text", expr: "world.score", frame: true });
    expect(item("score").bind).toBeUndefined();
    run(ops.bindExpression, { id: "score", prop: "text", expr: null });
    expect(item("score").frame).toBeUndefined();
    /* it goes through a project file and back as it was */
    const text = formatProject(projectFile(doc()));
    expect(formatProject(projectFile(openProject(JSON.parse(text))!))).toBe(text);
    expect(openProject(JSON.parse(text))!.groups.flatMap((g) => g.items).find((it) => it.id === "hp")!.frame).toEqual(item("hp").frame);
  });

  it("refuses what is no cheap read of the world, a prop no frame writes, and what the world's contract says is not there", () => {
    const { run } = arena();
    refused(() => run(ops.bindExpression, { id: "score", prop: "text", expr: "round(world.score)", frame: true }), /calls no helper/);
    refused(() => run(ops.bindExpression, { id: "score", prop: "text", expr: "data.x.value", frame: true }), /reads only world/);
    refused(() => run(ops.bindExpression, { id: "score", prop: "style", expr: "world.status", frame: true }), /cannot be bound per frame/);
    refused(() => run(ops.bindExpression, { id: "score", prop: "text", expr: "world.health", frame: true }), /has no "health"/);
    refused(() => run(ops.bindExpression, { id: "hp", prop: "value", expr: "world.byId.slime.hp", frame: true }), /has no "hp"/);
    refused(() => run(ops.bindExpression, { id: "score", prop: "text", expr: "world.score" }), /only by a binding per frame/);
    refused(() => run(ops.setItem, { id: "score", patch: { frame: { text: "now" } } }), /reads only world/);
    refused(() => run(ops.setItem, { id: "score", patch: { frame: { bold: "world.score" } } }), /no prop "bold" that can be bound per frame/);
  });

  it("refuses a frame where the document has no world view", () => {
    const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("b"), measurer: guessMeasurer, lang: () => "en" });
    const run = (o: object, args: Record<string, unknown>) => s.run(o as never, args as never, { origin: "mcp" });
    run(ops.addScreen, { id: "hud", name: "HUD" });
    run(ops.addPart, { slug: "text", id: "t", screen: "hud", at: { x: 16, y: 40 } });
    refused(() => run(ops.bindExpression, { id: "t", prop: "text", expr: "world.score", frame: true }), /no world view/);
  });

  it("is offered as it is typed: world, its snapshot's keys, the entities' ids and their fields", () => {
    const { doc } = arena();
    const shape = shapeFor(doc() as Doc, doc().frames[0], undefined);
    expect(suggest({}, shape, "wor").items.map((x) => x.label)).toContain("world");
    expect(suggest({}, shape, "world.").items.map((x) => x.label).sort()).toEqual(["byId", "clock", "entities", "follow", "score", "status"]);
    expect(suggest({}, shape, "world.byId.").items.map((x) => x.label)).toEqual(["hero", "coin1", "coin2", "slime"]);
    expect(suggest({}, shape, "world.byId.hero.").items.map((x) => x.label)).toEqual(["id", "kind", "x", "y", "label"]);
    expect(suggest({}, shape, "world.clock.").items.map((x) => x.label)).toEqual(["now", "paused", "rate"]);
  });

  it("keeps on read what a file binds per frame within bounds, a broken one for the author to fix", () => {
    const { doc } = arena();
    const d = doc();
    const hostile = { ...d, groups: d.groups.map((g) => ({ ...g, items: g.items.map((it) => (it.id === "score" ? { ...it, frame: { text: "round(world.score)", style: 3, [`k${"x".repeat(80)}`]: "world.score", "@opacity": "x".repeat(5000) } } : it)) })) };
    const back = openProject(JSON.parse(formatProject(projectFile(hostile as Doc))))!;
    expect(back.groups.flatMap((g) => g.items).find((it) => it.id === "score")!.frame).toEqual({ text: "round(world.score)" });
    expect(FRAME_LIMITS.perScreen).toBeGreaterThan(20);
  });
});
