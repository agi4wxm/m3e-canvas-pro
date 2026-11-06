import { beforeEach, describe, expect, it, vi } from "vitest";

/* A part's components come in a chunk of their own, fetched the first time a part needs them (parts/components.ts).
 * Until they have come the part holds its place: an empty box at the size it is about to be, which the canvas measures
 * without anything moving, and then the real thing. Each test starts from a fresh module graph, so nothing has been
 * fetched yet. */

beforeEach(() => {
  vi.resetModules();
});

async function fresh() {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { setGlobalLang } = await import("../lib/i18n");
  setGlobalLang("en");
  const { PartView } = await import("./PartView");
  const parts = await import("../parts/components");
  const { makeItem } = await import("../lib/tokens");
  const { h, raw, wrap } = await import("../parts/node");
  const { renderNode } = await import("../parts/render");
  const draw = (slug: string, props: Record<string, unknown> = {}, id = `${slug}-1`) => renderToStaticMarkup(createElement(PartView, { item: { ...makeItem(slug), id, props } }));
  return { ...parts, draw, h, raw, wrap, renderNode };
}

describe("a part whose drawing has not come yet", () => {
  it("holds its place at the size it is about to be, asks for what it needs, and is drawn when that has come", async () => {
    const { draw, modulesPending, modulesSettled, modulesIn } = await fresh();
    const waiting = draw("button", { label: "Go" });
    expect(waiting).toContain("data-part-waiting");
    /* the size the part is dropped at (PartDef w × h), so a first measure is not far off */
    expect(waiting).toMatch(/data-part-waiting[^>]*style="width:96px;height:40px"/);
    /* marked as what the editor's measure pass keeps the last size of, while it is not drawn */
    expect(waiting).toMatch(/data-part-waiting=""\s+data-fit=""/);
    expect(waiting).not.toContain(`data-slot="button"`);
    expect(modulesPending()).toBe(true);

    await modulesSettled();
    expect(modulesIn(["button"])).toBe(true);
    const drawn = draw("button", { label: "Go" });
    expect(drawn).not.toContain("data-part-waiting");
    expect(drawn).toContain(`data-slot="button"`);
    expect(drawn).toContain("Go");
  });

  it("holds the size its props give it, not only the size parts of its kind usually are", async () => {
    const { draw } = await fresh();
    expect(draw("app-bar", { title: "Inbox", width: 360 })).toMatch(/data-part-waiting[^>]*style="width:360px;height:64px"/);
  });

  it("is drawn at once, with no stand-in, when another part has already brought its modules", async () => {
    const { draw, loadModules } = await fresh();
    await loadModules(["button"]);
    const out = draw("button", { label: "Now" }, "another");
    expect(out).not.toContain("data-part-waiting");
    expect(out).toContain("Now");
  });

  it("is never drawn with a component that has not arrived: that is said, not drawn as an unknown tag", async () => {
    const { renderNode, h } = await fresh();
    expect(() => renderNode(h("div", null, h("Button", null, "Go")))).toThrow(/Button is drawn before its module \(button\) has arrived/);
    /* a plain tag needs nothing */
    expect(() => renderNode(h("div", null, "words"))).not.toThrow();
  });
});

describe("what a tree needs", () => {
  it("is the module of every component it names: in its nodes, in nodes its props hold, and in its render props", async () => {
    const { modulesOf, h, raw, wrap } = await fresh();
    const tree = h(
      "div",
      { onClick: raw("() => go()") },
      h("Button", null, "Go"),
      h("Rating", { value: 3 }),
      h("ChartContainer", { config: {} }, h("BarChart", { data: [] }, h("Bar", { dataKey: "a" }))),
      h("DropdownMenuTrigger", { render: wrap("IconButton") }),
      h("Card", { action: h("Switch") }),
    );
    expect(modulesOf(tree)).toEqual(["button", "card", "chart", "dropdown-menu", "recharts", "switch", "widgets/Rating"]);
    /* the same array for the same tree: what a draw compares */
    expect(modulesOf(tree)).toBe(modulesOf(tree));
    expect(modulesOf(h("div", null, h("span")))).toEqual([]);
  });

  it("is what the canvas fetches for each module key: every key there is can be loaded", async () => {
    const { MODULE_KEYS, loadAllModules, modulesIn, COMPONENTS } = await fresh();
    expect(MODULE_KEYS.length).toBeGreaterThan(90);
    await loadAllModules();
    expect(modulesIn(MODULE_KEYS)).toBe(true);
    for (const name of ["Button", "Rating", "BarChart", "SnackbarPreview", "Contained", "Scene"]) expect(COMPONENTS[name], name).toBeTruthy();
  }, 60000);
});

describe("a module that will not load", () => {
  it("ends the wait, so the part draws the mark that it cannot be drawn rather than a stand-in for ever", async () => {
    vi.doMock("../parts/components.generated", async (original) => {
      const real = await original<typeof import("../parts/components.generated")>();
      return { MODULES: { ...real.MODULES, button: () => Promise.reject(new Error("offline")) } };
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { draw, modulesSettled, modulesIn, componentOf, modulesPending } = await fresh();
      expect(draw("button")).toContain("data-part-waiting");
      await modulesSettled();
      expect(modulesPending()).toBe(false);
      expect(modulesIn(["button"])).toBe(true);
      /* PartBoundary catches this and shows BrokenPart in the part's place */
      expect(() => componentOf("Button")).toThrow(/could not be loaded/);
      expect(quiet).toHaveBeenCalled();
    } finally {
      quiet.mockRestore();
      vi.doUnmock("../parts/components.generated");
    }
  });
});
