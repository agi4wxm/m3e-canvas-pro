import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* What is fetched ahead of the canvas: the document the editor opens with, beside the editor's own code; what its
 * preview and the palette will want, in idle time once the editor is up. Each test starts from a fresh module graph,
 * so nothing has been fetched yet. */

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function fresh() {
  const { setGlobalLang } = await import("../lib/i18n");
  setGlobalLang("en");
  const { makeItem } = await import("../lib/tokens");
  const prefetch = await import("./prefetch");
  const parts = await import("./components");
  const item = (component: string, props: Record<string, unknown> = {}, id = component) => ({ ...makeItem(component), id, props });
  return { ...prefetch, ...parts, item };
}

const storage = (doc: unknown) => ({ getItem: (key: string) => (key === "m3e:doc" && doc ? JSON.stringify(doc) : null), setItem() {}, removeItem() {} });

describe("what a document needs", () => {
  it("is what its screens' parts and its reusable components' parts are drawn with", async () => {
    const { modulesOfDoc, item } = await fresh();
    const doc = {
      groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item("button", { label: "Go" }), item("rating")] }],
      components: [{ id: "c", name: "Card", w: 100, h: 100, groups: [{ id: "cg", x: 0, y: 0, axis: "x", items: [item("switch")] }] }],
    };
    expect(modulesOfDoc(doc)).toEqual(["button", "label", "switch", "widgets/Rating"]);
  });

  it("passes over what is not shaped as a document, rather than failing the editor's start", async () => {
    const { modulesOfDoc, item } = await fresh();
    expect(modulesOfDoc(null)).toEqual([]);
    expect(modulesOfDoc("nope")).toEqual([]);
    expect(modulesOfDoc({ groups: [null, { items: [null, { component: 7 }, item("no-such-part")] }], components: [null] })).toEqual([]);
  });

  it("in the preview is what the preview draws: an overlay that opens itself comes with what opens it", async () => {
    const { modulesOfDoc, modulesOf, item } = await fresh();
    const { PARTS, viewOf } = await import("./registry");
    const opens = PARTS.filter((d) => d.open && d.open.trigger !== "hide");
    expect(opens.length).toBeGreaterThan(0);
    const items = opens.map((d, i) => item(d.slug, {}, `i${i}`));
    const doc = { groups: items.map((it, i) => ({ id: `g${i}`, x: 0, y: 0, axis: "x", items: [it] })) };
    const drawnLive = [...new Set(items.flatMap((it) => modulesOf(viewOf(PARTS.find((d) => d.slug === it.component)!, it.props, undefined, undefined, true, it.id))))].sort();
    expect(modulesOfDoc(doc, true)).toEqual(drawnLive);
    expect(modulesOfDoc(doc, true)).not.toEqual(modulesOfDoc(doc));
  });
});

describe("the document the editor opens with", () => {
  it("is the one it kept in this browser: its parts' modules are fetched, and nothing else", async () => {
    const { loadOpeningModules, modulesIn, item } = await fresh();
    vi.stubGlobal("localStorage", storage({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item("rating", { value: 4 })] }] }));
    await loadOpeningModules();
    expect(modulesIn(["widgets/Rating"])).toBe(true);
    expect(modulesIn(["recharts"])).toBe(false);
    expect(modulesIn(["app-bar"])).toBe(false);
  });

  it("is the project the tab opens when it is handed one, read from wherever projects are kept", async () => {
    const { loadOpeningModules, modulesIn, item } = await fresh();
    vi.stubGlobal("localStorage", storage(null));
    await loadOpeningModules(Promise.resolve({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item("rating", { value: 4 })] }] }));
    expect(modulesIn(["widgets/Rating"])).toBe(true);
    expect(modulesIn(["app-bar"])).toBe(false);
  });

  it("is the starter when nothing is kept: the parts a new document starts with come with the editor", async () => {
    const { loadOpeningModules, modulesIn, modulesOfPart, STARTER_PARTS } = await fresh();
    vi.stubGlobal("localStorage", storage(null));
    await loadOpeningModules();
    const starter = [...new Set(STARTER_PARTS.flatMap((slug) => modulesOfPart(slug)))];
    expect(starter).toEqual(expect.arrayContaining(["app-bar", "button", "button-group", "fab", "item", "navigation"]));
    expect(modulesIn(starter)).toBe(true);
    expect(modulesIn(["recharts"])).toBe(false);
  });

  it("gets a head start before the part definitions have come: the starter's modules, which are what the starter needs", async () => {
    const { modulesOfPart, STARTER_PARTS } = await fresh();
    const { STARTER_MODULES, headStart } = await import("./opening");
    const { setGlobalLang } = await import("../lib/i18n");
    for (const lang of ["en", "zh", "ja", "ko"] as const) {
      setGlobalLang(lang);
      expect([...new Set(STARTER_PARTS.flatMap((slug) => modulesOfPart(slug)))].sort(), lang).toEqual(STARTER_MODULES);
    }
    expect(headStart(storage(null))).toEqual(STARTER_MODULES);
  });

  it("gets a head start on a later visit from what the parts on screen were drawn with when the page was left", async () => {
    const { holdModules, drawnModules, item } = await fresh();
    const { headStart } = await import("./opening");
    const release = holdModules(["button", "widgets/Rating"]);
    const again = holdModules(["button"]);
    expect(drawnModules()).toEqual(["button", "widgets/Rating"]);
    release();
    expect(drawnModules()).toEqual(["button"]);
    again();
    expect(drawnModules()).toEqual([]);
    /* kept from the last visit; a module this build no longer has is passed over */
    const kept = { getItem: (key: string) => (key === "m3e:doc" ? JSON.stringify({ groups: [{ items: [item("button")] }] }) : key === "m3e:drawn-modules" ? JSON.stringify(["button", "widgets/Gone", 7, "chart"]) : null) };
    expect(headStart(kept)).toEqual(["button", "chart"]);
    expect(headStart({ getItem: (key: string) => (key === "m3e:doc" ? "{}" : "{oops") })).toEqual([]);
  });

  it("does not stop the editor from starting when what is kept cannot be read", async () => {
    const { loadOpeningModules } = await fresh();
    vi.stubGlobal("localStorage", { getItem: () => "{not json" });
    await expect(loadOpeningModules()).resolves.toBeUndefined();
  });
});

describe("fetching in idle time", () => {
  it("waits for the editor to be up, then fetches what was asked for, a little at a time", async () => {
    const { prefetchModules, startIdleFetching, modulesIn, modulesSettled, whenStarted } = await fresh();
    const idle: (() => void)[] = [];
    vi.stubGlobal("window", { requestIdleCallback: (run: () => void) => idle.push(run) });
    const ran = vi.fn();
    whenStarted(ran);
    prefetchModules(["badge", "chip", "kbd", "label"]);
    /* nothing while the editor is starting: the network is its */
    expect(idle).toHaveLength(0);
    startIdleFetching();
    while (idle.length) {
      idle.shift()!();
      await modulesSettled();
    }
    expect(ran).toHaveBeenCalledOnce();
    expect(modulesIn(["badge", "chip", "kbd", "label"])).toBe(true);
  });
});
