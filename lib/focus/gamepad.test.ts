/* The gamepad read as UI actions: a press once, a direction held repeating, a stick pushed and let go, confirm and
 * cancel never repeating. */

import { describe, expect, it } from "vitest";
import { PadReader, REPEAT_AFTER_MS, REPEAT_EVERY_MS, type PadState } from "./gamepad";

const pad = (o: { pressed?: number[]; axes?: number[]; id?: string } = {}): PadState => ({
  id: o.id ?? "Xbox Wireless Controller (STANDARD GAMEPAD)",
  mapping: "standard",
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!o.pressed?.includes(i), value: o.pressed?.includes(i) ? 1 : 0 })),
  axes: o.axes ?? [0, 0, 0, 0],
});

describe("the gamepad", () => {
  it("presses an action once when a button goes down, and the pad's family with it", () => {
    const r = new PadReader();
    expect(r.poll([pad()], 0)).toEqual({ actions: [] });
    expect(r.poll([pad({ pressed: [0] })], 16)).toEqual({ actions: ["confirm"], pad: "xbox" });
    expect(r.poll([pad({ pressed: [0] })], 32).actions).toEqual([]);
    /* held long, A still pressed only once */
    expect(r.poll([pad({ pressed: [0] })], 2000).actions).toEqual([]);
    expect(r.poll([pad()], 2016).actions).toEqual([]);
    expect(r.poll([pad({ pressed: [1] })], 2032).actions).toEqual(["cancel"]);
  });

  it("repeats a direction held, after a wait and then at a pace", () => {
    const r = new PadReader();
    expect(r.poll([pad({ pressed: [13] })], 0).actions).toEqual(["down"]);
    expect(r.poll([pad({ pressed: [13] })], REPEAT_AFTER_MS - 1).actions).toEqual([]);
    expect(r.poll([pad({ pressed: [13] })], REPEAT_AFTER_MS).actions).toEqual(["down"]);
    expect(r.poll([pad({ pressed: [13] })], REPEAT_AFTER_MS + REPEAT_EVERY_MS - 1).actions).toEqual([]);
    expect(r.poll([pad({ pressed: [13] })], REPEAT_AFTER_MS + REPEAT_EVERY_MS).actions).toEqual(["down"]);
  });

  it("reads the left stick pushed past the mark, and let go only once it comes back", () => {
    const r = new PadReader();
    expect(r.poll([pad({ axes: [0.3, 0] })], 0).actions).toEqual([]);
    expect(r.poll([pad({ axes: [0.8, 0] })], 16).actions).toEqual(["right"]);
    /* still past the lower mark: held, not pressed again */
    expect(r.poll([pad({ axes: [0.4, 0] })], 32).actions).toEqual([]);
    expect(r.poll([pad({ axes: [0.1, 0] })], 48).actions).toEqual([]);
    expect(r.poll([pad({ axes: [0, -0.9] })], 64).actions).toEqual(["up"]);
  });

  it("leaves out a pad that is gone, and tells a PlayStation pad", () => {
    const r = new PadReader();
    expect(r.poll([null, { ...pad({ pressed: [0] }), connected: false }], 0).actions).toEqual([]);
    expect(r.poll([pad({ pressed: [12], id: "DualSense (Vendor: 054c)" })], 16)).toEqual({ actions: ["up"], pad: "playstation" });
  });
});
