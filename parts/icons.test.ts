import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Icon, symbolName } from "@/components/m3e/icon";
import { isKnownIcon } from "@/components/m3e/icon-registry";
import { docIcons, ensureIcons } from "./icons";

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

describe("the document's own icons", () => {
  const LEAF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 20C4 9 11 4 20 4c0 9-5 16-16 16z"/></svg>';

  /* loaded here, so the tests above load what they always have */
  const setDocIcons = async (icons: Record<string, string> | undefined) => (await import("@/src/editor/docIcons")).setDocIcons(icons);

  it("are drawn by name, filled or not, and never fetched", async () => {
    const before = asked.length;
    await setDocIcons({ leaf: LEAF });
    ensureIcons(["svg:leaf"]);
    await settle();
    expect(asked.length).toBe(before);
    expect(isKnownIcon("m3e-doc:leaf")).toBe(true);
    expect(symbolName("svg:leaf", true)).toBe("m3e-doc:leaf");
    const drawn = renderToStaticMarkup(createElement(Icon, { name: "svg:leaf", size: 32 }));
    expect(drawn).toContain("<path");
    expect(drawn).toContain('viewBox="0 0 24 24"');
    expect(drawn).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(createElement(Icon, { name: "svg:leaf", fill: "auto" }))).toContain("<path");
  });

  it("follow the document: a drawing changed is drawn anew, one taken away is gone from the list", async () => {
    await setDocIcons({ leaf: LEAF.replace("M4 20", "M2 22") });
    expect(renderToStaticMarkup(createElement(Icon, { name: "svg:leaf" }))).toContain("M2 22");
    await setDocIcons(undefined);
    expect(docIcons()).toEqual({});
  });
});
