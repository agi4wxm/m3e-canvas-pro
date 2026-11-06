import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { SAFETY_TEXT, safetyText } from "./safety";

describe("the words for keeping the author's work and privacy", () => {
  const keys = Object.keys(SAFETY_TEXT.en).sort();
  it.each(LANGS)("has every word in $key, none blank, with the same placeholders", ({ key: lang }) => {
    expect(Object.keys(SAFETY_TEXT[lang]).sort()).toEqual(keys);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys) {
      const word = SAFETY_TEXT[lang][k as keyof (typeof SAFETY_TEXT)["en"]];
      expect(word.trim(), `${lang}.${k}`).not.toBe("");
      expect(holes(word), `${lang}.${k}`).toEqual(holes(SAFETY_TEXT.en[k as keyof (typeof SAFETY_TEXT)["en"]]));
    }
  });

  it("fills its placeholders", () => {
    expect(safetyText("askRows", "en", { n: 3, total: 5, of: "Fruit" })).toBe("3 of the 5 rows of “Fruit”");
    expect(safetyText("askStyleReplaced", "zh", { name: "custom:paper" })).toBe("你的风格“custom:paper”现在的样子（会被替换）");
  });
});
