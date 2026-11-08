import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { RETIRE_TEXT, retireText } from "./retire";

describe("the words for the retired parts", () => {
  const keys = Object.keys(RETIRE_TEXT.en).sort();
  it.each(LANGS)("has every word in $key, none blank, with the same placeholders", ({ key: lang }) => {
    expect(Object.keys(RETIRE_TEXT[lang]).sort()).toEqual(keys);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys) {
      const word = RETIRE_TEXT[lang][k as keyof (typeof RETIRE_TEXT)["en"]];
      expect(word.trim(), `${lang}.${k}`).not.toBe("");
      expect(holes(word), `${lang}.${k}`).toEqual(holes(RETIRE_TEXT.en[k as keyof (typeof RETIRE_TEXT)["en"]]));
    }
  });

  it("says how many there are", () => {
    expect(retireText("noticeTitle", "zh").replace("{n}", "3")).toBe("这个设计里有 3 个已退役的组件");
  });
});
