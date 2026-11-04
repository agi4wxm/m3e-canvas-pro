import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partBySlug } from "./registry";

/* docs/组件盘点.md says which part answers for each component of each source. This keeps it true: every
 * part it names has to exist, so removing or renaming one fails here until the list says where it went. */

const doc = readFileSync(new URL("../docs/组件盘点.md", import.meta.url), "utf8");
const rows = doc.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| ---"));
/** the column that holds parts: the second, or the third in the three-column table of the other sources */
const named = (row: string, index: number) => [...row.split(" | ")[index].matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]);

describe("the inventory of every source", () => {
  it("has real content", () => {
    expect(rows.length).toBeGreaterThan(300);
  });

  it("names only parts that exist", () => {
    const section = (title: string) => doc.slice(doc.indexOf(title), doc.indexOf("\n## ", doc.indexOf(title) + title.length));
    const inKinds = section("## 各分支的组件类型").split("\n").filter((l) => l.startsWith("| `"));
    const libraries = section("## 组件库").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| ---") && !l.startsWith("| 来源"));
    const gone = [...inKinds.flatMap((r) => named(r, 1)), ...libraries.flatMap((r) => named(r, r.includes("/") && r.split(" | ").length === 3 && !r.split(" | ")[1].includes("`") ? 2 : 1))].filter((slug) => !partBySlug(slug));
    expect([...new Set(gone)]).toEqual([]);
  });

  it("gives every source row somewhere to go, or says why it has none", () => {
    const empty = rows.filter((r) => /\| — \|\s*\|$/.test(r));
    expect(empty).toEqual([]);
  });
});
