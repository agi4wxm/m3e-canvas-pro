/* Screens in layers on their own (lib/world/layers.ts, docs/交互规则.md “分层”): what opening and going back do to the layers,
 * which of them take input, when the worlds under them are let go of and paused, what of a HUD covers a world, and
 * where a pointer goes; and the channel's side of it (lib/world/channel.ts): covering, pausing, what the HUD covers and
 * a pointer, carried to a world through `connectWorld` only. */

import { describe, expect, it } from "vitest";
import { createWorlds, hostLog, inputLog } from "./channel";
import { connectWorld, createExampleWorld } from "./example";
import { WORLD_HOST_CONTRACT } from "./hostContract";
import { closeTop, covers, createPointerRouter, inputFloor, laidAs, layOver, occlusionOf, pausesWorld, pointerOwner, sameRects, standingWith, stood, takesInput, type Layer } from "./layers";
import type { HostSignal, World, WorldPointer, WorldRect } from "./types";

type E = { id: string };
const same = (a: E, b: E) => a.id === b.id;
const lay = (layers: Layer<E>[], layer: Layer<E>["layer"], id: string) => layOver(layers, { layer, entry: { id } }, same);
const ids = (layers: Layer<E>[]) => layers.map((l) => `${l.layer}:${l.entry.id}`);

describe("laying screens over the page", () => {
  it("lays a HUD, a dialog and a toast over the page, and an action's overlay; a world and a page take its place", () => {
    expect([laidAs("hud"), laidAs("dialog"), laidAs("toast"), laidAs(undefined, true), laidAs("dialog", true)]).toEqual(["hud", "dialog", "toast", "overlay", "dialog"]);
    expect([laidAs(undefined), laidAs("world"), laidAs("world", true)]).toEqual([null, null, null]);
  });

  it("stands each by its height, whatever order they opened in: a toast over a dialog over a HUD", () => {
    let l: Layer<E>[] = [];
    l = lay(l, "toast", "saved");
    l = lay(l, "dialog", "bag");
    l = lay(l, "hud", "hud");
    l = lay(l, "dialog", "map");
    expect(ids(l)).toEqual(["hud:hud", "dialog:bag", "dialog:map", "toast:saved"]);
    /* the same screen again moves to the top of its height, never twice */
    expect(ids(lay(l, "dialog", "bag"))).toEqual(["hud:hud", "dialog:map", "dialog:bag", "toast:saved"]);
    /* a screen an action lays over takes the place of the one laid over before, as an overlay always did */
    expect(ids(lay(lay(l, "overlay", "sheet"), "overlay", "other"))).toEqual(["hud:hud", "dialog:bag", "dialog:map", "overlay:other", "toast:saved"]);
    /* going back closes the topmost */
    expect(ids(closeTop(l))).toEqual(["hud:hud", "dialog:bag", "dialog:map"]);
    expect(closeTop([])).toEqual([]);
  });

  it("puts a page's own HUDs under what was laid over it", () => {
    const screens = [{ id: "arena", layer: "world" as const }, { id: "hud", layer: "hud" as const, over: "arena" }, { id: "map", layer: "hud" as const, over: "shop" }, { id: "self", layer: "hud" as const, over: "self" }];
    expect(standingWith(screens, "arena").map((s) => s.id)).toEqual(["hud"]);
    expect(standingWith(screens, "self")).toEqual([]);
    expect(ids(stood([{ id: "hud" }], [{ layer: "toast", entry: { id: "note" } }, { layer: "hud", entry: { id: "radar" } }]))).toEqual(["hud:hud", "hud:radar", "toast:note"]);
  });
});

describe("input through the layers", () => {
  it("stops at the topmost modal layer: what is under a dialog takes nothing", () => {
    const l: Layer<E>[] = [{ layer: "hud", entry: { id: "hud" } }, { layer: "dialog", entry: { id: "bag" } }, { layer: "toast", entry: { id: "note" } }];
    expect(inputFloor(l)).toBe(1);
    expect([-1, 0, 1, 2].map((i) => takesInput(l, i))).toEqual([false, false, true, true]);
    /* with only a HUD up, the page under it takes input too */
    expect(inputFloor(l.slice(0, 1))).toBe(-1);
    expect(takesInput(l.slice(0, 1), -1)).toBe(true);
  });

  it("finds who a pointer belongs to from the top down, and keeps it there until it is lifted", () => {
    const stage = {
      layers: [{ layer: "hud" as const, controls: [{ id: "fire", x: 300, y: 600, w: 60, h: 60 }] }],
      page: { controls: [{ id: "menu", x: 0, y: 0, w: 40, h: 40 }], worlds: [{ id: "arena", x: 0, y: 0, w: 412, h: 892 }] },
    };
    expect(pointerOwner(stage, 320, 620)).toEqual({ layer: 0, control: "fire" });
    expect(pointerOwner(stage, 10, 10)).toEqual({ layer: -1, control: "menu" });
    expect(pointerOwner(stage, 200, 400)).toEqual({ world: "arena" });
    expect(pointerOwner({ ...stage, page: { ...stage.page, worlds: [] } }, 200, 400)).toBeNull();
    /* a dialog takes what lands on it, control or not */
    expect(pointerOwner({ ...stage, layers: [...stage.layers, { layer: "dialog", controls: [] }] }, 200, 400)).toEqual({ layer: 1, control: "" });
    const router = createPointerRouter((x, y) => pointerOwner(stage, x, y));
    expect(router.down(1, 200, 400)).toEqual({ world: "arena" });
    /* the finger moves over the fire button: the world keeps it */
    expect(router.move(1)).toEqual({ world: "arena" });
    expect(router.down(2, 320, 620)).toEqual({ layer: 0, control: "fire" });
    expect(router.up(1)).toEqual({ world: "arena" });
    expect(router.move(1)).toBeNull();
    expect(router.up(2)).toEqual({ layer: 0, control: "fire" });
  });
});

describe("what the layers tell the worlds", () => {
  it("covers the worlds while a dialog, an overlay or an overlay part is up; a HUD or a toast does not", () => {
    expect(WORLD_HOST_CONTRACT.layers.releases).toEqual(["dialog"]);
    expect(covers([{ layer: "hud" }, { layer: "toast" }])).toBe(false);
    expect(covers([{ layer: "hud" }, { layer: "dialog" }])).toBe(true);
    expect(covers([{ layer: "overlay" }])).toBe(true);
    expect(covers([], true)).toBe(true);
  });

  it("pauses them only while a dialog that says so is up (the host's own policy does not pause)", () => {
    const pauses = (e: E) => e.id === "pause";
    expect(WORLD_HOST_CONTRACT.overlay.pause).toBe(false);
    expect(pausesWorld([{ layer: "dialog", entry: { id: "bag" } }], pauses)).toBe(false);
    expect(pausesWorld([{ layer: "dialog", entry: { id: "pause" } }], pauses)).toBe(true);
    /* a HUD that says so is no dialog */
    expect(pausesWorld([{ layer: "hud", entry: { id: "pause" } }], pauses)).toBe(false);
  });

  it("cuts what a HUD covers to the world view, in the view's own pixels", () => {
    const view = { x: 16, y: 100, w: 360, h: 240 };
    expect(occlusionOf(view, [{ x: 0, y: 80, w: 56, h: 56 }, { x: 300, y: 300, w: 100, h: 100 }, { x: 0, y: 500, w: 40, h: 40 }])).toEqual([
      { x: 0, y: 0, w: 40, h: 36 },
      { x: 284, y: 200, w: 76, h: 40 },
    ]);
    expect(sameRects([{ x: 1, y: 2, w: 3, h: 4 }], [{ x: 1, y: 2, w: 3, h: 4 }])).toBe(true);
    expect(sameRects([{ x: 1, y: 2, w: 3, h: 4 }], [])).toBe(false);
  });
});

describe("a world view's channel under the layers", () => {
  it("lets go of what each view holds as it is covered, sends nothing more while it is, and sends again once uncovered", () => {
    const worlds = createWorlds(() => 5);
    const heard: string[] = [];
    worlds.channel("arena").listen((action, value) => heard.splice(0, heard.length, ...inputLog(heard, action, value)));
    worlds.send("arena", "move", { x: 1, y: 0 });
    worlds.send("arena", "attack", true);
    worlds.cover(true);
    expect(worlds.covered()).toBe(true);
    worlds.send("arena", "jump", true);
    worlds.pointer("arena", { kind: "down", x: 1, y: 1, at: 5 });
    expect(heard).toEqual(["move 1,0", "attack ↓", "move 0,0", "attack ↑"]);
    expect(worlds.channel("arena").held()).toEqual({ move: { x: 0, y: 0 }, attack: false });
    /* covering again lets go of nothing more */
    worlds.cover(true);
    worlds.cover(false);
    worlds.send("arena", "jump", true);
    expect(heard.at(-1)).toBe("jump ↓");
  });

  it("tells the worlds to pause and go on, what the HUD covers, a pointer; a world mounted later hears what it was told", () => {
    const worlds = createWorlds();
    const told: HostSignal[] = [];
    worlds.channel("arena").watch?.((s) => told.push(s));
    worlds.pause(true);
    worlds.pause(true);
    worlds.occlude("arena", [{ x: 0, y: 0, w: 10, h: 10 }]);
    worlds.pointer("arena", { kind: "down", x: 3, y: 4, at: 9 });
    worlds.pause(false);
    expect(told).toEqual([{ pause: true }, { occlude: [{ x: 0, y: 0, w: 10, h: 10 }] }, { pointer: { kind: "down", x: 3, y: 4, at: 9 } }, { pause: false }]);
    expect(told.reduce<string[]>((log, s) => hostLog(log, s), [])).toEqual(["paused", "resumed"]);
    worlds.pause(true);
    expect(worlds.channel("late").hosted?.()).toEqual({ paused: true, occluded: [] });
    expect(worlds.channel("arena").hosted?.()).toEqual({ paused: true, occluded: [{ x: 0, y: 0, w: 10, h: 10 }] });
  });

  it("reaches a world only through World: connectWorld turns what it is told into requestPause, occlude and pointer", () => {
    const calls: unknown[] = [];
    const world: World = {
      ...createExampleWorld(),
      requestPause: (on) => {
        calls.push(["pause", on]);
        return Promise.resolve({ accepted: true });
      },
      occlude: (rects: WorldRect[]) => void calls.push(["occlude", rects]),
      pointer: (e: WorldPointer) => void calls.push(["pointer", e.kind]),
    };
    const worlds = createWorlds();
    /* told before it connects: it hears it as it connects */
    worlds.pause(true);
    worlds.occlude("arena", [{ x: 1, y: 1, w: 2, h: 2 }]);
    const off = connectWorld(world, worlds.channel("arena"));
    worlds.pointer("arena", { kind: "move", x: 0, y: 0, at: 0 });
    worlds.pause(false);
    off();
    worlds.pause(true);
    expect(calls).toEqual([["pause", true], ["occlude", [{ x: 1, y: 1, w: 2, h: 2 }]], ["pointer", "move"], ["pause", false]]);
  });

  it("pauses the example engine: its world time stands still while it is told to", () => {
    const worlds = createWorlds();
    const w = createExampleWorld({ entities: [{ id: "hero", kind: "player", x: 20, y: 40 }] });
    connectWorld(w, worlds.channel("arena"));
    worlds.pause(true);
    w.step(50);
    expect(w.clock()).toMatchObject({ now: 0, paused: true });
    expect(w.view().status).toBe("paused");
    worlds.pause(false);
    w.step(50);
    expect(w.clock()).toMatchObject({ now: 50, paused: false });
  });
});
