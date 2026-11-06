import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { MCP_TEXT, mcpText } from "./mcp";

describe("the MCP connection's words", () => {
  const keys = Object.keys(MCP_TEXT.en).sort();
  it.each(LANGS)("has every word in $key, none blank, with the same placeholders", ({ key: lang }) => {
    expect(Object.keys(MCP_TEXT[lang]).sort()).toEqual(keys);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys) {
      const word = MCP_TEXT[lang][k as keyof (typeof MCP_TEXT)["en"]];
      expect(word.trim(), `${lang}.${k}`).not.toBe("");
      expect(holes(word), `${lang}.${k}`).toEqual(holes(MCP_TEXT.en[k as keyof (typeof MCP_TEXT)["en"]]));
    }
  });

  it("fills its placeholders", () => {
    expect(mcpText("pairTitle", "en", { client: "Codex" })).toBe("Codex wants to work on this canvas");
    expect(mcpText("confirmLeft", "zh", { n: 12 })).toBe("12 秒后自动拒绝");
  });
});
