import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partCatalog } from "./catalog";
import { PARTS } from "./registry";

/* git may check it out with CRLF on Windows */
const guide = readFileSync(new URL("../public/agent.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");

describe("the guide an AI agent writes from", () => {
  it("holds the catalog of parts as it is now (bun run gen:agent)", () => {
    expect(guide).toContain(partCatalog());
  });

  it("names every part", () => {
    for (const d of PARTS) expect(guide, d.slug).toContain(`\`${d.slug}\``);
  });
});
