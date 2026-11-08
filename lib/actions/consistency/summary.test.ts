import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOC_PATH, summaryMarkdown, withSummary } from "./summary";

describe("docs/交互规则.md", () => {
  it("lists the consistency table and its divergences as the table has them (bun lib/actions/consistency/summary.ts writes it)", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(withSummary(doc, summaryMarkdown())).toBe(doc);
  });
});
