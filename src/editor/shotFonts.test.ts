/* Which web font faces a screen picture embeds: the faces its words would be drawn with, by family list, weight, style
 * and the characters they hold, against the page's @font-face rules and their unicode ranges. */

import { describe, expect, it } from "vitest";
import { facesFor, facesInCss, familiesOf, rangesOf } from "./shotFonts";

/* the way Google Fonts writes a face split by script: one rule per weight and subset */
const CSS = `
/* latin */
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/roboto/r400-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+2000-206F; }
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 500; src: url(https://fonts.gstatic.com/s/roboto/r500-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131; }
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/s/roboto/r700-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131; }
@font-face { font-family: 'Roboto'; font-style: italic; font-weight: 400; src: url(https://fonts.gstatic.com/s/roboto/r400i-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* cyrillic */
@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/roboto/r400-cyr.woff2) format('woff2'); unicode-range: U+0400-045F; }
/* [12] */
@font-face { font-family: 'Noto Sans SC'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosanssc/sc400-12.woff2) format('woff2'); unicode-range: U+5df2, U+5b58, U+6863; }
/* [13] */
@font-face { font-family: 'Noto Sans SC'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosanssc/sc400-13.woff2) format('woff2'); unicode-range: U+4e00-4e0f; }
@font-face { font-family: 'Noto Sans SC'; font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/s/notosanssc/sc700-12.woff2) format('woff2'); unicode-range: U+5df2, U+5b58, U+6863; }
/* a variable face, all weights in one file, same origin */
@font-face { font-family: 'Roboto Flex'; font-style: normal; font-weight: 100 1000; src: url(./files/roboto-flex.woff2) format('woff2-variations'); unicode-range: U+0000-00FF; }
`;

const by = (css: string, base = "https://fonts.googleapis.com/css2") => {
  const m = new Map<string, ReturnType<typeof facesInCss>>();
  for (const f of facesInCss(css, base)) m.set(f.family, [...(m.get(f.family) ?? []), f]);
  return m;
};
const use = (families: string, weight: number, text: string, style: "normal" | "italic" = "normal") =>
  new Map([[`${families}|${weight}|${style}`, { families: familiesOf(families), weight, style, chars: new Set([...text].map((c) => c.codePointAt(0)!)) }]]);
const files = (faces: { src: string }[]) => faces.map((f) => f.src.split("/").pop()).sort();

describe("the faces a picture embeds", () => {
  it("reads family lists and unicode ranges", () => {
    expect(familiesOf(`'Roboto Flex', Roboto, "Noto Sans SC", system-ui, sans-serif`)).toEqual(["roboto flex", "roboto", "noto sans sc", "system-ui", "sans-serif"]);
    expect(rangesOf("U+0000-00FF, U+0131, U+4??")).toEqual([[0, 255], [0x131, 0x131], [0x400, 0x4ff]]);
    expect(rangesOf("")).toBeNull();
  });

  it("takes only the subsets the words' characters fall in, at their weight", () => {
    const faces = by(CSS);
    expect(files(facesFor(use("Roboto, 'Noto Sans SC', sans-serif", 400, "Starred 已存档"), faces))).toEqual(["r400-latin.woff2", "sc400-12.woff2"]);
    expect(files(facesFor(use("Roboto, 'Noto Sans SC', sans-serif", 700, "Archive 存档"), faces))).toEqual(["r700-latin.woff2", "sc700-12.woff2"]);
    /* a weight it has no face for takes the nearest; italic its own */
    expect(files(facesFor(use("Roboto", 600, "Go"), faces))).toEqual(["r500-latin.woff2", "r700-latin.woff2"]);
    expect(files(facesFor(use("Roboto", 400, "Go", "italic"), faces))).toEqual(["r400i-latin.woff2"]);
    /* nothing for words no face covers, past a generic family, or in a family the page has no face of */
    expect(facesFor(use("Roboto, sans-serif", 400, "😀"), faces)).toEqual([]);
    expect(files(facesFor(use("'SF Pro Text', Roboto", 400, "Hi"), faces))).toEqual(["r400-latin.woff2"]);
    expect(facesFor(use("Georgia, serif", 400, "Hi"), faces)).toEqual([]);
  });

  it("resolves a face's file against its stylesheet, and keeps a variable face's range of weights", () => {
    const faces = by(CSS, "https://app.example/assets/index.css");
    const flex = facesFor(use("'Roboto Flex', Roboto", 650, "Hi"), faces);
    expect(flex).toHaveLength(1);
    expect(flex[0]).toMatchObject({ src: "https://app.example/assets/files/roboto-flex.woff2", weight: [100, 1000], format: "woff2-variations" });
  });
});
