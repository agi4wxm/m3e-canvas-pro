/* A screen drawn as the preview shows it, with no editor: data from the mocks under a scenario, repeats drawn, words
 * bound, regions in the state their data is in; and the screenshot tool handing that version of the document to the
 * renderer. */

import { describe, expect, it } from "vitest";
import { DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { executeTool, type Renderer, type ShotOptions } from "../tools";
import type { Doc } from "../tokens";
import { shopDoc } from "./fixture";
import { previewScreen, regionsShowing } from "./headless";

setGlobalLang("en");

const withMocks = (doc: Doc): Doc => {
  const store = new DocStore(stateOf(doc), { measurer: guessMeasurer, lang: () => "en" });
  store.run(ops.fillMocksOp, {}, { origin: "mcp" });
  return store.document();
};

const texts = (doc: Doc, screenGroups: string[]) =>
  doc.groups
    .filter((g) => screenGroups.includes(g.id) || screenGroups.some((id) => g.id.startsWith(`${id}#`)))
    .flatMap((g) => g.items.map((it) => String(it.props?.text ?? "")))
    .filter(Boolean);

describe("previewScreen", () => {
  it("loads a list from the mocks, repeats its row and binds its words", async () => {
    const doc = shopDoc();
    const out = await previewScreen(doc, "products", { scenario: "", lang: "en", widths: {} });
    expect(out.report.sources).toEqual([expect.objectContaining({ name: "products", operationId: "listProducts", status: "ready" })]);
    expect(out.report.sources[0].items).toBeGreaterThan(3);
    expect(out.report.regions).toEqual([expect.objectContaining({ source: "products", state: "ready" })]);
    expect(out.report.calls[0]).toMatch(/^GET \/products → 200/);
    /* the row is drawn once per product, with the product's own words, and nothing on it repeats or fades again */
    const before = doc.groups.length;
    expect(out.doc.groups.length).toBeGreaterThan(before + 3);
    expect(out.doc.groups.some((g) => g.repeat)).toBe(false);
    const words = out.doc.groups.flatMap((g) => g.items.map((it) => String(it.props?.text ?? "")));
    expect(words.filter((w) => /^Name$/.test(w)).length).toBeLessThan(2);
  });

  it("plays a scenario: a new user's list is empty, a network error is an error", async () => {
    const doc = withMocks(shopDoc());
    const empty = await previewScreen(doc, "products", { scenario: "new-user", lang: "en", widths: {} });
    expect(empty.report.regions[0].state).toBe("empty");
    expect(empty.report.sources[0].items).toBe(0);
    const down = await previewScreen(doc, "products", { scenario: "network-error", lang: "en", widths: {} });
    expect(down.report.regions[0].state).toBe("error");
    expect(down.report.sources[0].error).toBeTruthy();
    const out = await previewScreen(doc, "products", { scenario: "signed-out", lang: "en", widths: {} });
    expect(out.report.signedIn).toBe(false);
  });

  it("keeps an empty list's row and its other state designs where the canvas has them, for the canvas to lay out", async () => {
    const doc = withMocks(shopDoc());
    const out = await previewScreen(doc, "products", { scenario: "new-user", lang: "en", widths: {} });
    const host = out.doc.groups.find((g) => g.states?.source === "products")!;
    expect(host.states?.show).toBe("empty");
    /* nothing was drawn for the list, so it stays a list (the canvas hides its content pane), its row still in it */
    expect(host.repeat?.data).toBe("data.products.items");
    const panes = out.doc.groups.filter((g) => g.inFlow === host.id).map((g) => g.pane ?? 0);
    expect(panes.sort()).toEqual([0, 1, 2, 3, 4]);
    /* the screen's parts stay in the document's order */
    expect(out.doc.groups.map((g) => g.id).filter((id) => doc.groups.some((x) => x.id === id))).toEqual(doc.groups.map((g) => g.id));
  });

  it("opens a detail screen with an id the mocks hand out when it has no example", async () => {
    const base = shopDoc();
    const doc = { ...base, frames: base.frames.map((f) => (f.id === "detail" ? { ...f, params: [{ name: "productId", type: "string" as const }] } : f)) };
    const out = await previewScreen(doc, "detail", { lang: "en", widths: {} });
    expect(out.report.params.productId).toBeTruthy();
    expect(out.report.sources[0]).toEqual(expect.objectContaining({ name: "product", status: "ready" }));
    expect(out.report.regions[0].state).toBe("ready");
  });

  it("says what is wrong with a scenario it does not know", async () => {
    await expect(previewScreen(shopDoc(), "products", { scenario: "nope", lang: "en", widths: {} })).rejects.toThrow(/no scenario "nope"/);
  });

  it("draws a screen's regions in one state", () => {
    const doc = shopDoc();
    const out = regionsShowing(doc, "products", "error");
    expect(out.regions.length).toBe(1);
    expect(out.doc.groups.find((g) => g.items[0]?.id === out.regions[0])?.states?.show).toBe("error");
    expect(doc.groups.find((g) => g.states)?.states?.show).toBeUndefined();
  });

  it("keeps a screen with nothing bound as it is", async () => {
    const doc = shopDoc({ unwired: true });
    const out = await previewScreen(doc, "products", { lang: "en", widths: {} });
    expect(out.report.sources).toEqual([]);
    expect(texts(out.doc, []).length).toBe(0);
  });
});

describe("the screenshot tool under a scenario and in a state", () => {
  const shots: { id: string; o?: ShotOptions }[] = [];
  const renderer: Renderer = {
    async screenshot(id, o) {
      shots.push({ id, o });
      return "data:image/png;base64,AAAA";
    },
  };
  const store = () => new DocStore(stateOf(withMocks(shopDoc())), { measurer: guessMeasurer, lang: () => "en" });

  it("draws the screen with its mock data and says what each source got", async () => {
    const out = await executeTool(store(), "screenshot", { id: "products", scenario: "" }, { origin: "ai", renderer });
    expect(out.ok).toBe(true);
    const r = (out as { result: { data: { sources: { status: string }[] } } }).result;
    expect(r.data.sources[0].status).toBe("ready");
    const shot = shots.at(-1)!;
    expect(shot.o?.doc?.groups.some((g) => g.id.includes("#"))).toBe(true);
  });

  it("draws the regions in the state asked for, under a scenario or not", async () => {
    let out = await executeTool(store(), "screenshot", { id: "products", state: "empty" }, { origin: "ai", renderer });
    expect(out.ok).toBe(true);
    expect(shots.at(-1)!.o?.doc?.groups.filter((g) => g.states?.show === "empty").length).toBe(1);
    out = await executeTool(store(), "screenshot", { id: "products", scenario: "network-error" }, { origin: "ai", renderer });
    expect((out as { result: { data: { regions: { state: string }[] } } }).result.data.regions[0].state).toBe("error");
  });

  it("answers with what the screen got when no picture can be taken", async () => {
    const out = await executeTool(store(), "screenshot", { id: "products", scenario: "new-user" }, { origin: "ai" });
    expect(out.ok).toBe(true);
    expect((out as { result: { data: { regions: { state: string }[] } } }).result.data.regions[0].state).toBe("empty");
  });

  it("refuses a state on a screen with no region, and an unknown scenario", async () => {
    const plain = new DocStore(stateOf(shopDoc({ unwired: true })), { measurer: guessMeasurer, lang: () => "en" });
    const out = await executeTool(plain, "screenshot", { id: "products", state: "empty" }, { origin: "ai", renderer });
    expect(out.ok).toBe(false);
    const bad = await executeTool(store(), "screenshot", { id: "products", scenario: "nope" }, { origin: "ai", renderer });
    expect(bad.ok).toBe(false);
    expect((bad as { error: { message: string } }).error.message).toMatch(/new-user/);
  });
});
