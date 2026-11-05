import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { symbolName } from "@/components/m3e/icon";
import { isKnownIcon } from "@/components/m3e/icon-registry";
import { ensureIcons } from "./icons";

/* The canvas loads a part's icons out of the bundled sets; only a name none of them has is asked of Iconify. */

const asked: string[] = [];
const settle = () => new Promise((r) => setTimeout(r, 200));

beforeAll(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      const names = new URL(url).searchParams.get("icons")!.split(",");
      return { ok: true, json: async () => ({ prefix: "material-symbols", icons: Object.fromEntries(names.map((n) => [n, { body: "<path/>" }])) }) };
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("the icons a part names", () => {
  it("come out of the bundled sets, with no network", async () => {
    ensureIcons(["home", "shopping_cart", "emoji_events"]);
    await settle();
    expect(asked).toEqual([]);
    expect(isKnownIcon("material-symbols:shopping-cart-outline-rounded")).toBe(true);
    expect(isKnownIcon("material-symbols:emoji-events-rounded")).toBe(true);
    expect(symbolName("home", true)).toBe("material-symbols:home-rounded");
  });

  it("are fetched from Iconify only when no set has them, once", async () => {
    ensureIcons(["sailing", "home"]);
    await settle();
    ensureIcons(["sailing"]);
    await settle();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("material-symbols.json?icons=sailing-outline-rounded,sailing-rounded");
    expect(isKnownIcon("material-symbols:sailing-rounded")).toBe(true);
  });
});
