import { describe, expect, it } from "vitest";
import { RELAYOUT_MAX_MS, RELAYOUT_QUIET_MS, afterPass, relayoutDue, startRelayout } from "./relayoutClock";

describe("the passes after a style is picked", () => {
  it("runs the passes it was asked for, then none", () => {
    const r = startRelayout([], 0);
    expect(relayoutDue(r, 0)).toBe(true);
    const second = afterPass(r, 700);
    expect(second?.left).toBe(1);
    expect(afterPass(second!, 1400)).toBeNull();
  });

  it("stops waiting for a pass that nothing will set off", () => {
    /* the first pass changed no size: nothing is measured again, so the second never comes */
    const second = afterPass(startRelayout([], 0), 700)!;
    expect(relayoutDue(second, 700 + RELAYOUT_QUIET_MS - 1)).toBe(true);
    expect(relayoutDue(second, 700 + RELAYOUT_QUIET_MS)).toBe(false);
  });

  it("never holds the rules back past its time, however late the first pass", () => {
    const r = startRelayout([], 0, 3);
    expect(relayoutDue(r, RELAYOUT_MAX_MS)).toBe(false);
    expect(afterPass(r, RELAYOUT_MAX_MS)).toBeNull();
    /* a later pass never stretches the time a pick has */
    const late = afterPass(r, RELAYOUT_MAX_MS - 100)!;
    expect(late.until).toBe(RELAYOUT_MAX_MS);
  });

  it("keeps nothing due once it is gone", () => {
    expect(relayoutDue(null, 0)).toBe(false);
  });
});
