import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../lib/i18n";
import { withTable } from "./toolTable";

beforeAll(() => setGlobalLang("en"));

describe("docs/MCP.md", () => {
  it("lists exactly the registry's tools (bun run mcp:docs rewrites the list)", () => {
    const doc = readFileSync(new URL("../../docs/MCP.md", import.meta.url), "utf8");
    expect(withTable(doc)).toBe(doc);
  });
});
