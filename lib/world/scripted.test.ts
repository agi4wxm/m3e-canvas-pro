/* A mock world played from a script (docs/模拟库.md “世界脚本”): what it shows at a time is the script's scene at that
 * time; it runs its own loop off the clock it is made with, so the mocks' clock standing still stops it and a faster
 * rate runs it faster, and the same script comes to the same snapshots and sends the same events at the same world
 * times however its clock went; it loops, seeks without sending, and is spoken to only through `World`. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlledClock, type MockClock } from "../mocks/clock";
import { battleScript } from "../mocks/world";
import { createWorlds } from "./channel";
import { connectWorld } from "./example";
import { eventsBetween, sceneAt, scriptLength, type WorldScript } from "./script";
import { createScriptedWorld } from "./scripted";

const walk: WorldScript = {
  id: "walk",
  name: "Walk",
  start: { entities: [{ id: "hero", kind: "player", x: 10, y: 50 }, { id: "coin", kind: "coin", x: 30, y: 50 }], score: 0, status: "running" },
  scene: "A field",
  steps: [
    { at: 0, events: [{ name: "hit", payload: { id: "start", by: "hero" } }] },
    { at: 1000, entities: [{ id: "hero", x: 30 }, { id: "coin", gone: true }], set: { score: 1 }, events: [{ name: "collected", payload: { id: "coin", kind: "coin" } }] },
    { at: 500, entities: [{ id: "hero", x: 20 }], scene: "Halfway", picture: "model:box" },
    { at: 2000, entities: [{ id: "slime", kind: "enemy", x: 60, y: 50 }], set: { status: "ended" }, events: [{ name: "ended", payload: { score: 1 } }] },
  ],
};

describe("a world script", () => {
  it("shows at a time what its steps up to then make of its start, in the order of their times", () => {
    expect(sceneAt(walk, 0).snapshot.entities).toEqual(walk.start!.entities);
    const half = sceneAt(walk, 700);
    expect(half.scene).toBe("Halfway");
    expect(half.picture).toBe("model:box");
    expect((half.snapshot.entities as { x: number }[])[0].x).toBe(20);
    const after = sceneAt(walk, 1500);
    expect(after.snapshot.entities).toEqual([{ id: "hero", kind: "player", x: 30, y: 50 }]);
    expect(after.snapshot.score).toBe(1);
    expect(sceneAt(walk, 5000).snapshot).toMatchObject({ status: "ended", entities: [{ id: "hero" }, { id: "slime", kind: "enemy" }] });
    /* the design's state is under the script's start */
    expect(sceneAt({ id: "x", name: "x", steps: [] }, 0, { entities: [{ id: "a", kind: "item", x: 1, y: 2 }], score: 4 }).snapshot).toEqual({ entities: [{ id: "a", kind: "item", x: 1, y: 2 }], score: 4 });
    expect(scriptLength(walk)).toBe(2000);
    expect(eventsBetween(walk, -1, 1000).map((e) => e.name)).toEqual(["hit", "collected"]);
    expect(eventsBetween(walk, 0, 1000).map((e) => e.name)).toEqual(["collected"]);
  });
});

/** a clock under the mocks' controlled one that moves only when the test says */
function handClock() {
  let t = 1_000_000;
  const under: MockClock = { now: () => t, sleep: () => Promise.resolve(), setTimer: () => () => {} };
  return { clock: controlledClock(under), move: (ms: number) => (t += ms) };
}

type Seen = { at: number; name: string; payload: unknown; hp: number[] };

/** a round of the battle played on a clock that goes as `drive` moves it, every event with the world's time and the
 *  enemies' hit points when it came */
function playBattle(drive: (o: { move: (ms: number) => void; tick: () => void; clock: ReturnType<typeof controlledClock> }) => void): Seen[] {
  const { clock, move } = handClock();
  const w = createScriptedWorld(battleScript(), { now: clock.now, tickMs: 20 });
  const seen: Seen[] = [];
  w.onAny((name, payload, at) => seen.push({ at, name, payload, hp: ((w.view().entities ?? []) as { kind: string; hp?: number }[]).filter((e) => e.kind === "enemy").map((e) => e.hp ?? -1) }));
  w.mount(null, { w: 360, h: 240 });
  drive({ move, clock, tick: () => vi.advanceTimersByTime(20) });
  w.unmount();
  return seen;
}

describe("a mock world", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs its own loop off the clock it is given: still while it stands still, faster at its rate", () => {
    const { clock, move } = handClock();
    const w = createScriptedWorld(walk, { now: clock.now, tickMs: 10 });
    const events: string[] = [];
    w.onAny((name) => events.push(name));
    w.mount(null, { w: 360, h: 240 });
    clock.pause();
    move(5000);
    vi.advanceTimersByTime(100);
    /* the clock stood still: so did the world, whatever the device's time, and only the start's event came */
    expect(w.clock().now).toBe(0);
    expect(events).toEqual(["hit"]);
    clock.resume();
    clock.setRate(2);
    move(300);
    vi.advanceTimersByTime(10);
    /* 300 ms under it is 600 ms of the mocks' clock at twice the rate */
    expect(w.clock().now).toBe(600);
    expect((w.view().entities as { x: number }[])[0].x).toBe(20);
    expect(w.scene()).toEqual({ scene: "Halfway", picture: "model:box" });
    move(300);
    vi.advanceTimersByTime(10);
    expect(events).toEqual(["hit", "collected"]);
    expect(w.view().score).toBe(1);
    w.unmount();
  });

  it("comes to the same snapshots and sends the same events at the same world times on any clock", () => {
    /* at the mocks' own pace, 20 ms a turn */
    const steady = playBattle(({ move, tick }) => {
      for (let i = 0; i < 1100; i++) {
        move(20);
        tick();
      }
    });
    /* paused now and then, at twice and half the rate, the turns uneven */
    const bumpy = playBattle(({ move, tick, clock }) => {
      let i = 0;
      for (let world = 0; world < 22_000; i++) {
        if (i % 50 === 10) clock.pause();
        if (i % 50 === 20) clock.resume();
        clock.setRate(i % 3 === 0 ? 2 : i % 3 === 1 ? 0.5 : 1);
        const ms = 7 + (i % 5) * 9;
        move(ms);
        if (!clock.paused) world += ms * clock.rate;
        tick();
      }
    });
    const round = (list: Seen[]) => list.filter((e) => e.at > 0 && e.at < 21_000);
    expect(round(steady).length).toBeGreaterThan(100);
    expect(round(bumpy)).toEqual(round(steady));
    /* twenty enemies, each with hit points that only go down, all defeated in the round */
    expect(steady[0].hp).toHaveLength(20);
    expect(steady.filter((e) => e.name === "defeated")).toHaveLength(20);
    expect(steady.find((e) => e.name === "ended")?.payload).toEqual({ score: expect.any(Number) });
  });

  it("starts over when its round loops, and goes to a time at once without sending anything", () => {
    const w = createScriptedWorld({ ...walk, loop: 3000 });
    const events: string[] = [];
    w.onAny((name) => events.push(name));
    w.step(2500);
    expect(events).toEqual(["hit", "collected", "ended"]);
    expect(w.view().status).toBe("ended");
    w.step(1000);
    /* a new round: its time from 0 again, its start's event sent again, the coin back */
    expect(w.clock().now).toBe(500);
    expect(events).toEqual(["hit", "collected", "ended", "hit"]);
    expect((w.view().entities as unknown[]).length).toBe(2);
    w.seek(1200);
    expect(events).toHaveLength(4);
    expect(w.view().score).toBe(1);
    expect(w.clock().now).toBe(1200);
    w.seek(4000);
    expect(w.clock().now).toBe(1000);
  });

  it("is spoken to through World: connected to a channel, its events by name, paused when asked", async () => {
    const w = createScriptedWorld(walk);
    const worlds = createWorlds();
    const named: [string, unknown][] = [];
    connectWorld(w, worlds.channel("v"), (name, payload) => void named.push([name, payload]));
    worlds.send("v", "move", { x: 1, y: 0 });
    w.step(1000);
    expect(named).toEqual([["hit", { id: "start", by: "hero" }], ["collected", { id: "coin", kind: "coin" }]]);
    expect(await w.requestPause(true)).toEqual({ accepted: true });
    expect(w.view().status).toBe("paused");
    w.step(5000);
    expect(w.clock()).toEqual({ now: 1000, paused: true, rate: 1 });
    /* its snapshot crosses as JSON */
    expect(JSON.parse(JSON.stringify(w.view()))).toEqual(w.view());
  });
});
