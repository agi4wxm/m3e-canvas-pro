import { afterEach, describe, expect, it } from "vitest";
import { fromPack, setDocStyles, styleOf, STYLE_PACKS, type CustomStyle } from "../styles";
import type { Theme } from "../tokens";
import { counterIds, DocStore } from "./store";
import { loadInto, savedDoc, stateOf } from "./state";
import { guessMeasurer } from "./op";
import { applyStyle, setStyles } from "./ops";

/* A document's own styles (lib/styles/custom.ts) live in the document like everything else: an operation sets them,
 * picking one puts it on, editing the one worn wears it as it now is, and an undo takes either back. */

afterEach(() => setDocStyles(undefined));

const make = (now: () => number = () => 0) =>
  new DocStore(stateOf({ groups: [], frames: [{ id: "s1", name: "Home", x: 0, y: 0 }] }), { measurer: guessMeasurer, ids: counterIds("t"), lang: () => "en", now });
const ios = (): CustomStyle => fromPack(STYLE_PACKS.find((s) => s.key === "ios")!);

describe("the document's own styles", () => {
  it("are kept with the document, and a pick puts one on in the same step", () => {
    const store = make();
    const mine = ios();
    store.run(applyStyle, { style: mine.key, styles: [mine] }, { origin: "mcp" });
    expect(store.get().doc.theme.style).toBe(mine.key);
    expect(savedDoc(store.get()).styles?.map((s) => s.key)).toEqual([mine.key]);
    /* one undo takes the style and the styles back together */
    store.undo();
    expect(store.get().doc.theme.style ?? "").toBe("");
    expect(savedDoc(store.get()).styles).toBeUndefined();
  });

  it("wear the style worn as it now is when it is edited in place, and a run of edits is one step", () => {
    let now = 0;
    const store = make(() => now);
    const mine = ios();
    store.run(applyStyle, { style: mine.key, styles: [mine] });
    const font = store.get().doc.theme.font;
    const edited: CustomStyle = { ...mine, font: font === "garamond" ? "inter" : "garamond" };
    const history = { coalesce: `styles:${mine.key}` };
    store.run(setStyles, { styles: [edited] }, { history });
    now += 100;
    store.run(setStyles, { styles: [{ ...edited, display: "cinzel" }] }, { history });
    expect(store.get().doc.theme.font).toBe(edited.font);
    expect(store.get().doc.theme.displayFont).toBe("cinzel");
    store.undo();
    expect(store.get().doc.theme.font).toBe(font);
    expect(store.get().doc.styles).toEqual([mine]);
  });

  it("leave the theme alone when a style the document does not wear changes", () => {
    const store = make();
    const mine = ios();
    store.run(setStyles, { styles: [mine] });
    const theme = store.get().doc.theme;
    store.run(setStyles, { styles: [{ ...mine, font: "garamond" }] });
    expect(store.get().doc.theme).toBe(theme);
  });

  it("come back with the document, cleaned, and its theme is read against them", () => {
    const mine = ios();
    const s = loadInto(stateOf({ groups: [], frames: [] }), { styles: [mine, "not a style", { ...mine }] as unknown as CustomStyle[], theme: { style: mine.key } as Theme }, true);
    expect(s.doc.styles?.map((x) => x.key)).toEqual([mine.key]);
    expect(s.doc.theme.style).toBe(mine.key);
    /* reading a document leaves nothing of it in reach */
    expect(styleOf(mine.key)).toBeUndefined();
  });

  it("are checked when an agent sets them", () => {
    const store = make();
    expect(() => store.run(setStyles, { styles: [ios(), 42] as unknown as CustomStyle[] }, { origin: "mcp" })).toThrow(/styles\[1\] should be an object/);
    store.run(setStyles, { styles: [ios(), { ...ios(), font: "garamond" }] }, { origin: "mcp" });
    expect(store.get().doc.styles?.map((x) => x.key)).toEqual([ios().key]);
  });
});
