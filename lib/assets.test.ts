import { describe, expect, it } from "vitest";
import { assetRefsIn, isAssetRef, restoreAssets, stripAssets } from "./assets";

const big = (fill: string) => `data:image/jpeg;base64,${fill.repeat(60_000)}`;

describe("assets", () => {
  const picture = big("a");
  const doc = { title: "t", groups: [{ items: [{ props: { image: picture, label: "x" } }] }], frames: [{ backgroundImage: "data:image/png;base64,small" }] };

  it("takes large pictures out, leaving a short reference", () => {
    const { doc: light, found } = stripAssets(doc);
    const ref = light.groups[0].items[0].props.image;
    expect(isAssetRef(ref)).toBe(true);
    expect(ref.length).toBeLessThan(60);
    expect(found.get(ref)).toBe(picture);
    expect(JSON.stringify(light).length).toBeLessThan(1000);
  });

  it("leaves small pictures, words and the document it was given alone", () => {
    const { doc: light } = stripAssets(doc);
    expect(light.frames[0].backgroundImage).toBe("data:image/png;base64,small");
    expect(light.groups[0].items[0].props.label).toBe("x");
    expect(doc.groups[0].items[0].props.image).toBe(picture);
  });

  it("gives one picture one name, and two pictures two", () => {
    const one = stripAssets({ a: picture, b: picture, c: big("b") });
    expect(one.doc.a).toBe(one.doc.b);
    expect(one.doc.c).not.toBe(one.doc.a);
    expect(one.found.size).toBe(2);
  });

  it("puts them back", () => {
    const { doc: light, found } = stripAssets(doc);
    expect(assetRefsIn(light)).toEqual(new Set(found.keys()));
    expect(restoreAssets(light, found)).toEqual(doc);
  });

  it("leaves an empty picture where one has gone", () => {
    const { doc: light } = stripAssets(doc);
    expect(restoreAssets(light, new Map()).groups[0].items[0].props.image).toBe("");
  });

  it("keeps a key such as __proto__ as a key on the way out and back", () => {
    const value = JSON.parse(`{"props":{"__proto__":{"image":${JSON.stringify(picture)}},"constructor":{"image":${JSON.stringify(picture)}}}}`) as { props: object };
    const { doc: light, found } = stripAssets(value);
    expect(Object.keys(light.props)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(light.props)).toBe(Object.prototype);
    expect(restoreAssets(light, found)).toEqual(value);
    expect(JSON.parse(JSON.stringify(restoreAssets(light, found)))).toEqual(value);
  });
});
