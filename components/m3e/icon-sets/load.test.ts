import { describe, expect, it } from "vitest"

import { loadShard } from "./load"

/* A shard that came is shared and never fetched twice. One that did not come is fetched again on the next ask, at an
 * address of its own since Chromium keeps a failed import for its address for good: that is the browser's to show, in
 * e2e/icons.e2e.ts (the module runner here keeps a failed import too, and offers no way to fail one just once). */

describe("a shard of the bundled icon sets", () => {
  it("that came is shared: asked again, while on its way and after, the same promise", async () => {
    const first = loadShard("pixel", 0)
    expect(loadShard("pixel", 0)).toBe(first)
    const shard = await first
    expect(shard?.sets.length).toBeGreaterThan(0)
    expect(loadShard("pixel", 0)).toBe(first)
  })
})
