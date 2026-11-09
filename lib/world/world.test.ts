/* lib/world on its own (docs/世界宿主契约.md): the contract's schemas agree with what the world view declares and what the
 * example engine sends; the example engine runs its own loop off the clock it is given and is spoken to only through
 * `World`; a host lets go of what a world holds as an overlay opens; everything that crosses is plain JSON. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { partBySlug } from "../../parts/registry";
import { inputDeclsOf } from "../../parts/defs/world";
import { createWorlds } from "./channel";
import { EXAMPLE_WORLD_CONTRACT, contractInputs } from "./contract";
import { connectWorld, createExampleWorld } from "./example";
import { WORLD_HOST_CONTRACT, WORLD_LIFECYCLE } from "./hostContract";
import { WORLD_EVENTS, type World, type WorldEventName } from "./types";

const start = { entities: [{ id: "hero", kind: "player", x: 20, y: 40 }, { id: "coin", kind: "coin", x: 32, y: 40 }, { id: "slime", kind: "enemy", x: 25, y: 52 }] };

describe("the world's contract", () => {
  it("describes every event the world view declares, with the same fields and kinds, as JSON Schema", () => {
    const def = partBySlug("world-view")!;
    const kinds: Record<string, string> = { string: "text", number: "number", boolean: "bool", array: "list", object: "object" };
    expect(Object.keys(EXAMPLE_WORLD_CONTRACT.events).sort()).toEqual([...WORLD_EVENTS].sort());
    for (const e of def.events ?? []) {
      const schema = EXAMPLE_WORLD_CONTRACT.events[e.name]?.payload as { properties: Record<string, { type: string }> };
      expect(Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, kinds[v.type]])), e.name).toEqual(e.payload);
    }
  });

  it("declares the input actions the world view starts with, each with its type", () => {
    const def = partBySlug("world-view")!;
    expect(inputDeclsOf(def.props.find((p) => p.key === "inputs")!.default)).toEqual(contractInputs(EXAMPLE_WORLD_CONTRACT));
    expect(inputDeclsOf("move: vec2, attack:bool，jump, Bad, move: bool, aim: vec3")).toEqual([{ name: "move", type: "vec2" }, { name: "attack", type: "bool" }, { name: "jump" }]);
  });

  it("is plain JSON, as the host's contract is", () => {
    expect(JSON.parse(JSON.stringify(EXAMPLE_WORLD_CONTRACT))).toEqual(EXAMPLE_WORLD_CONTRACT);
    expect(JSON.parse(JSON.stringify(WORLD_HOST_CONTRACT))).toEqual({ ...WORLD_HOST_CONTRACT, lifecycle: [...WORLD_LIFECYCLE] });
    expect(WORLD_HOST_CONTRACT.overlay.release).toBe(true);
  });
});

describe("the example engine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs its own loop once mounted, its world time off the clock it is given: still while that stands still, faster at its rate", () => {
    let now = 1000;
    const w: World = createExampleWorld(start, { now: () => now, tickMs: 10, rate: 2 });
    const events: [WorldEventName, unknown][] = [];
    const worlds = createWorlds();
    connectWorld(w, worlds.channel("w"), (name, payload) => void events.push([name, payload]));
    w.mount(null, { w: 360, h: 240 });
    worlds.send("w", "move", { x: 1, y: 0 });
    /* the app's clock stands still: the world does not move, whatever the device's time */
    vi.advanceTimersByTime(500);
    expect(w.clock()).toEqual({ now: 0, paused: false, rate: 2 });
    expect(w.view().entities?.[0].x).toBe(20);
    /* 40 ms of the app's clock is 80 ms of world time at rate 2: 4 hundredths at full tilt, onto the coin */
    now += 40;
    vi.advanceTimersByTime(10);
    expect(w.clock().now).toBe(80);
    expect(w.view().entities?.[0].x).toBe(24);
    expect(events).toEqual([["collected", { id: "coin", kind: "coin" }], ["ended", { score: 1 }]]);
    expect(JSON.parse(JSON.stringify(w.view()))).toEqual(w.view());
    w.unmount();
  });

  it("stands still when asked to pause, and its loop stops when unmounted", async () => {
    let now = 0;
    const w = createExampleWorld(start, { now: () => now, tickMs: 10 });
    w.mount(null, { w: 1, h: 1 });
    w.input("move", { x: 0, y: 1 }, 0);
    expect(await w.requestPause(true)).toEqual({ accepted: true });
    now += 50;
    vi.advanceTimersByTime(20);
    expect(w.clock()).toMatchObject({ now: 0, paused: true });
    await w.requestPause(false);
    w.unmount();
    now += 50;
    vi.advanceTimersByTime(20);
    expect(w.clock().now).toBe(0);
  });

  it("hits an enemy near the player when attack is pressed", () => {
    const w = createExampleWorld(start);
    const hits: unknown[] = [];
    w.on("hit", (p) => void hits.push(p));
    w.input("attack", true, 0);
    expect(hits).toEqual([{ id: "slime", by: "hero" }]);
  });
});

describe("a host's channels", () => {
  it("let go of what a world holds, as an overlay opens over it, and nothing more", () => {
    const worlds = createWorlds(() => 7);
    const heard: unknown[] = [];
    worlds.channel("w").listen((a, v, at) => void heard.push([a, v, at]));
    worlds.send("w", "move", { x: 1, y: 0 });
    worlds.send("w", "attack", true);
    worlds.send("w", "jump", false);
    heard.length = 0;
    worlds.release("w");
    expect(heard).toEqual([["move", { x: 0, y: 0 }, 7], ["attack", false, 7]]);
    expect(worlds.channel("w").held()).toEqual({ move: { x: 0, y: 0 }, attack: false, jump: false });
    heard.length = 0;
    worlds.release("w");
    expect(heard).toEqual([]);
  });
});
