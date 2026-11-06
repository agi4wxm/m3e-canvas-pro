/* What a document fetches from other sites, and the parts drawn with none of it while a project holds them back. */

import { describe, expect, it } from "vitest";
import { partBySlug } from "../parts/registry";
import { isOutside, outsideInDoc, outsideOf, withoutOutside } from "./outside";
import { outsideBlocked, setOutsideBlocked, subscribeOutside } from "./outsidePolicy";
import { makeItem, type Group } from "./tokens";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const def = (slug: string) => partBySlug(slug)!;
const group = (id: string, slug: string, props: Record<string, unknown>): Group => ({ id: `g-${id}`, x: 0, y: 0, axis: "x", items: [{ ...makeItem(slug), id, props }] });

describe("what a document fetches from other sites", () => {
  it("knows an outside address from the project's own pictures", () => {
    for (const v of ["https://t.example/p.png", "http://t.example/p.png", "//t.example/p.png", " HTTPS://T.EXAMPLE/x"]) expect(isOutside(v), v).toBe(true);
    for (const v of [PIXEL, "m3e-asset:abc-12", "", "/local.png", "svg:leaf", undefined, 3]) expect(isOutside(v), String(v)).toBe(false);
  });

  it("finds pictures, rows' pictures, a video's address and a web page told to load, and nothing else", () => {
    expect(outsideOf(def("image"), { src: "https://t.example/a.png" })).toEqual(["https://t.example/a.png"]);
    expect(outsideOf(def("image"), { src: PIXEL })).toEqual([]);
    expect(outsideOf(def("carousel"), { slides: [{ label: "a", image: "https://t.example/1.jpg" }, { label: "b", image: PIXEL }] })).toEqual(["https://t.example/1.jpg"]);
    expect(outsideOf(def("video"), { src: "https://t.example/v.mp4" })).toEqual(["https://t.example/v.mp4"]);
    expect(outsideOf(def("web-view"), { address: "https://t.example", load: true })).toEqual(["https://t.example"]);
    expect(outsideOf(def("web-view"), { address: "https://t.example", load: false })).toEqual([]);
    /* a link only goes somewhere when it is followed */
    expect(outsideOf(def("link"), { href: "https://t.example" })).toEqual([]);
  });

  it("draws a part with none of them: pictures emptied, a page not loaded, the rest as it was", () => {
    const props = { slides: [{ label: "a", image: "https://t.example/1.jpg" }, { label: "b", image: PIXEL }] };
    const out = withoutOutside(def("carousel"), props)!;
    expect(out.slides).toEqual([{ label: "a", image: "" }, { label: "b", image: PIXEL }]);
    expect(props.slides[0].image).toBe("https://t.example/1.jpg");
    expect(withoutOutside(def("web-view"), { address: "https://t.example", load: true })).toEqual({ address: "https://t.example", load: false });
    const own = { src: PIXEL, alt: "x" };
    expect(withoutOutside(def("image"), own)).toBe(own);
  });

  it("lists every outside address of a document, inside its components and its screens' tracing pictures", () => {
    const doc = {
      groups: [group("a", "image", { src: "https://t.example/a.png" }), group("b", "image", { src: PIXEL }), { ...group("c", "container", {}), instanceOf: "card", overrides: { "pic/src": "https://t.example/o.png", "pic/label": "https://not.a.picture" } }],
      components: [{ id: "card", name: "Card", w: 100, h: 100, groups: [group("pic", "image", { src: "https://t.example/c.png" })] }],
      frames: [{ id: "f", name: "F", x: 0, y: 0, backgroundImage: "https://t.example/trace.png" }],
    };
    expect(outsideInDoc(doc).sort()).toEqual(["https://t.example/a.png", "https://t.example/c.png", "https://t.example/o.png", "https://t.example/trace.png"]);
    expect(outsideInDoc({ groups: [group("b", "image", { src: PIXEL })] })).toEqual([]);
  });

  it("is held back or let load for the whole tab, and says so to who listens", () => {
    let heard = 0;
    const off = subscribeOutside(() => heard++);
    setOutsideBlocked(true);
    setOutsideBlocked(true);
    expect(outsideBlocked()).toBe(true);
    setOutsideBlocked(false);
    off();
    setOutsideBlocked(true);
    setOutsideBlocked(false);
    expect(heard).toBe(2);
  });
});
