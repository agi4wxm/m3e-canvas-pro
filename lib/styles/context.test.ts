import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { NO_DOC_STYLES, copyOfStyle, setDocStyles, styleContext, styleCss, styleOf, stylesInReach, withDocStyles, type CustomStyle } from ".";
import { printMiniApp } from "../export/miniapp/app";
import { printRnApp } from "../export/rn/app";
import { DEFAULT_THEME, makeItem, normalizeTheme, type Doc } from "../tokens";

/* A style's key is read against one document's own styles, handed to what reads it (book.ts `StyleContext`), never
 * against whatever another document has put in reach. */

afterEach(() => setDocStyles(undefined));

const base = copyOfStyle(styleOf("ios")!);
/** two styles under one key, as two documents may each have */
const brand = (primary: string, tabs: "underline" | "pill", margin: number): CustomStyle => ({ ...base, key: "custom:brand", light: { ...base.light, primary }, recipes: { ...base.recipes, tabs }, ux: { ...base.ux, margin } });
const A = brand("#C2185B", "underline", 24);
const B = brand("#2E7D32", "pill", 8);

const docWearing = (style: CustomStyle, title: string): Doc => ({
  groups: [{ id: "g", x: 20, y: 120, axis: "x", items: [{ ...makeItem("button"), id: "b", label: "Go" }] }],
  frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
  paletteKey: "purple",
  frame: "phone",
  title,
  brief: "",
  theme: { ...DEFAULT_THEME, style: style.key },
  styles: [style],
});

describe("a style context", () => {
  it("is one document's styles, the same for the same list, and reads a key without what is in reach", () => {
    const list = [A];
    const a = styleContext(list);
    expect(styleContext(list)).toBe(a);
    expect(styleContext(undefined)).toBe(NO_DOC_STYLES);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.styleOf("custom:brand")?.light.primary).toBe("#C2185B");
    expect(a.styleOf("ios")?.key).toBe("ios");
    expect(a.customs.map((p) => p.key)).toEqual(["custom:brand"]);
    /* another document's styles in reach change nothing for it */
    setDocStyles([B]);
    expect(styleOf("custom:brand", a)?.light.primary).toBe("#C2185B");
    expect(normalizeTheme({ style: "custom:brand" }, a).font).toBe(A.font);
    expect(styleCss(normalizeTheme({ style: "custom:brand" }, a), undefined, a)).toContain("--md-sys-color-primary:#C2185B");
    expect(styleOf("custom:brand")?.light.primary).toBe("#2E7D32");
  });

  it("is in reach through withDocStyles only for synchronous work: a callback that returns a promise is refused", async () => {
    const before = stylesInReach();
    expect(withDocStyles([A], () => styleOf("custom:brand")?.light.primary)).toBe("#C2185B");
    expect(stylesInReach()).toBe(before);
    /* what came after an await would read whatever is in reach by then */
    const late = async () => {
      await Promise.resolve();
      return styleOf("custom:brand")?.light.primary;
    };
    expect(() => withDocStyles([A], late)).toThrow(/synchronous work/);
    expect(stylesInReach()).toBe(before);
    expect(() => withDocStyles([A], () => Promise.resolve(1))).toThrow(TypeError);
    /* a context goes in as a list does */
    expect(withDocStyles(styleContext([B]), () => styleOf("custom:brand")?.light.primary)).toBe("#2E7D32");
  });
});

describe("two exports of documents with the same style key", () => {
  const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
  /* every file read waits a turn, so two exports running together take turns */
  const slowly = async (path: string) => {
    await new Promise((r) => setTimeout(r, 0));
    return fromDisk(path);
  };

  /** what each export says of the style it wears: the mobile theme, the mini-program's, and the web's stylesheet */
  async function exported(doc: Doc) {
    const { buildProject } = await import("../exportProject");
    const [rn, mini, web] = await Promise.all([printRnApp(doc, {}), printMiniApp(doc, {}), buildProject(doc, {}, { read: slowly, fetchIcons: noNetwork, lang: "en" })]);
    return { rn: rn.theme, mini: mini.css, webTheme: web.files["src/theme.tsx"] as string, webStyle: web.files["src/style.css"] as string };
  }

  it("each wear their own, alone or side by side, whatever else is in reach", async () => {
    const a = docWearing(A, "Alpha");
    const b = docWearing(B, "Beta");
    const aloneA = await exported(a);
    const aloneB = await exported(b);
    /* read in each document's own styles even with none in reach: the custom style is not lost */
    expect(aloneA.rn).toMatchObject({ key: "custom:brand", recipes: { tabs: "underline" }, ux: { margin: 24 } });
    expect(aloneA.rn.light.colors.primary).toBe("#C2185B");
    expect(aloneB.rn).toMatchObject({ key: "custom:brand", recipes: { tabs: "pill" }, ux: { margin: 8 } });
    expect(aloneA.mini).toContain("--md-sys-color-primary: #c2185b;");
    expect(aloneB.mini).toContain("--md-sys-color-primary: #2e7d32;");
    expect(aloneA.webStyle).toContain("--md-sys-color-primary:#C2185B");
    expect(aloneB.webStyle).toContain("--md-sys-color-primary:#2E7D32");
    /* the two at once, interleaved, with a third document's style of the same key in reach (the editor's) */
    setDocStyles([brand("#000000", "pill", 0)]);
    const [togetherA, togetherB] = await Promise.all([exported(a), exported(b)]);
    expect(togetherA).toEqual(aloneA);
    expect(togetherB).toEqual(aloneB);
    expect(styleOf("custom:brand")?.light.primary).toBe("#000000");
  }, 60_000);
});
