import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildProduct } from "./export/product";
import { boundShopDoc } from "./export/product.fixture";
import { FOOT_GAP, footOf } from "./foot";
import { setGlobalLang } from "./i18n";
import { makeItem, type Frame, type Group } from "./tokens";

setGlobalLang("en");

const frame: Frame = { id: "f", name: "List", x: 0, y: 0, w: 412, h: 892, data: [{ name: "products", operationId: "listProducts" }] };
const loose = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id, x, y, axis: "y", items: [{ ...makeItem(slug), id: `${id}-it`, props }] });
const widths = { "add-it": 120, "add-it:h": 40, "words-it": 200, "words-it:h": 20, "top-it": 120, "top-it:h": 40, "bar-it": 412, "bar-it:h": 80, "fab-it": 56, "fab-it:h": 56 };

describe("what floats over the foot of a screen of data", () => {
  it("takes the buttons standing loose in the lower half and the bars pinned there, and leaves room under the last row", () => {
    const foot = footOf(frame, [loose("add", "button", 16, 820), loose("words", "text", 16, 840), loose("top", "button", 16, 300), loose("bar", "navigation-bar", 0, 812)], widths);
    expect([...foot.floats].sort()).toEqual(["add", "bar"]);
    expect(foot.above.get("add")).toBe(32);
    expect(foot.above.get("bar")).toBe(0);
    /* the bar's top is the highest: 80 above the foot */
    expect(foot.room).toBe(80 + FOOT_GAP);
  });

  it("is nothing on a screen with nothing at its foot, and a FAB stands as far above the foot as it was drawn", () => {
    expect(footOf(frame, [loose("top", "button", 16, 300)], widths)).toEqual({ floats: new Set(), above: new Map(), room: 0 });
    const fab = footOf(frame, [loose("fab", "fab", 340, 804)], widths);
    expect([...fab.floats]).toEqual(["fab"]);
    expect(fab.above.get("fab")).toBe(32);
    expect(fab.room).toBe(88 + FOOT_GAP);
  });

  it("keeps the shop's buttons on the glass in every app, the list's end clear of them", async () => {
    const { doc, widths: w } = boundShopDoc();
    const p = await buildProduct(doc, w, { read: (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8"), fetchIcons: async (ids) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) }), lang: "en" });
    const text = (path: string) => String(p.files[path].body);
    const web = text("apps/web/src/generated/screens/ProductsScreen.tsx");
    /* the buttons come after the scrolling body, on the screen itself; the body ends 96 past its content */
    expect(web.indexOf("Add product")).toBeGreaterThan(web.indexOf("</DataScroll>"));
    expect(web).toContain('<span aria-hidden className="pointer-events-none absolute top-full left-0 w-px" style={{ height: 96 }} />');
    const mobile = text("apps/mobile/src/generated/screens/ProductsScreen.tsx");
    expect(mobile).toContain('<Pin edge="floatingBottom" x={16} bottom={32}>');
    expect(mobile).toContain("room={96}");
    const miniapp = text("apps/miniapp/src/generated/screens/ProductsScreen.tsx");
    expect(miniapp).toContain('<Screen screen="products" width={412} height={892} room={96}>');
    expect(miniapp).toContain('<Pin edge="floatingBottom" x={220} bottom={32}>');
  });
});
