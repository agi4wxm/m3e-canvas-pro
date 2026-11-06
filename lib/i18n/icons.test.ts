import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { ICON_TEXT, iconText } from "./icons";

describe("the icon picker's words", () => {
  it.each(LANGS)("has every word in $key", ({ key: lang }) => {
    expect(Object.keys(ICON_TEXT[lang]).sort()).toEqual(Object.keys(ICON_TEXT.en).sort());
    for (const w of Object.values(ICON_TEXT[lang])) expect(w.trim()).not.toBe("");
  });
  it("looks a word up", () => expect(iconText("docIcons", "zh")).toBe("本文档"));
});
