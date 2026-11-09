import { describe, expect, it } from "vitest";
import { controlledClock, fakeClock } from "./clock";
import { createMockTransport } from "./transport";
import type { ApiSpec } from "../api/types";

describe("the mocks' controlled clock", () => {
  it("tells the time of the clock under it until paused, then stands still; resumed, it goes on from there", async () => {
    const under = fakeClock(1000);
    const c = controlledClock(under);
    expect(c.now()).toBe(1000);
    await under.advance(500);
    expect(c.now()).toBe(1500);
    c.pause();
    await under.advance(2000);
    expect(c.now()).toBe(1500);
    c.resume();
    await under.advance(100);
    expect(c.now()).toBe(1600);
  });

  it("runs its timers on its own time: none while paused, sooner at a higher rate", async () => {
    const under = fakeClock(0);
    const c = controlledClock(under);
    const fired: string[] = [];
    c.setTimer(() => fired.push("a"), 1000);
    c.setTimer(() => fired.push("b"), 2000);
    c.pause();
    await under.advance(5000);
    expect(fired).toEqual([]);
    c.resume();
    c.setRate(2);
    await under.advance(499);
    expect(fired).toEqual([]);
    await under.advance(1);
    expect(fired).toEqual(["a"]);
    await under.advance(500);
    expect(fired).toEqual(["a", "b"]);
    expect(c.now()).toBe(2000);
  });

  it("keeps its rate within bounds, tells its listeners, and cancels a timer", async () => {
    const under = fakeClock(0);
    const c = controlledClock(under);
    let told = 0;
    const off = c.listen(() => told++);
    c.setRate(100);
    expect(c.rate).toBe(10);
    c.pause();
    c.pause();
    expect(told).toBe(2);
    off();
    c.resume();
    expect(told).toBe(2);
    let ran = false;
    const cancel = c.setTimer(() => (ran = true), 10);
    cancel();
    await under.advance(1000);
    expect(ran).toBe(false);
  });

  it("is the clock a mock transport tells the app (`now`) and plays its realtime scripts by", async () => {
    const api: ApiSpec = { channels: [{ id: "ticker", address: "/ticker", messages: [{ name: "price", payload: { type: "object", properties: { v: { type: "number" } } } }], operations: [{ id: "push", action: "send" }] }] };
    const under = fakeClock(Date.UTC(2026, 0, 1));
    const clock = controlledClock(under);
    const t = createMockTransport({ api, mocks: { realtime: [{ id: "s", channel: "ticker", steps: [{ at: 1000, message: "price", payload: { v: 1 } }] }] } }, { clock, latency: false });
    expect(t.now()).toBe(Date.UTC(2026, 0, 1));
    const got: unknown[] = [];
    t.connect("/ticker", (m) => got.push(m.payload));
    clock.pause();
    await under.advance(3000);
    expect(got).toEqual([]);
    expect(t.now()).toBe(Date.UTC(2026, 0, 1));
    clock.resume();
    clock.setRate(4);
    await under.advance(250);
    expect(got).toEqual([{ v: 1 }]);
    expect(t.now()).toBe(Date.UTC(2026, 0, 1) + 1000);
  });
});
