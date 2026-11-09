import { describe, expect, it } from "vitest";
import { drive, turns, verdict } from "./check";
import { designDoc } from "./design";
import { ReferenceHost } from "./reference";
import { ROWS } from "./rows";

/* The table on the interpreter itself (lib/actions/run.ts over the reference host): the specification, so every row
 * passes here and none may list the interpreter as diverging. */

describe("the consistency table on the interpreter", () => {
  it.each(ROWS.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    expect(row.known?.interpreter, "the interpreter is the specification: it has no known divergences").toBeUndefined();
    const { doc } = designDoc(row.design);
    let host: ReferenceHost | undefined;
    const { problems } = await drive(row, (backend) => {
      const h = (host = new ReferenceHost(doc, backend));
      return {
        tap: (w) => h.tap(w),
        hover: (w) => h.hover(w),
        tapSlot: (w, slot) => h.tapSlot(w, slot),
        emit: (w, name, payload) => h.emit(w, name, payload),
        type: (w, v) => h.type(w, v),
        restart: () => h.restart(),
        /* the reference's own back, as the platform's would be: no action asks for it */
        platformBack: () => h.back(),
        settle: () => turns(),
        observe: () => h.observe(),
      };
    });
    host?.stop();
    const v = verdict(row, "interpreter", problems);
    expect(v.ok ? "" : v.why).toBe("");
  });

  it("has rows with ids of their own, each on at least one step and one expectation", () => {
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(ROWS.length);
    for (const r of ROWS) {
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      expect(Object.keys(r.expect).length, r.id).toBeGreaterThan(0);
    }
  });
});
