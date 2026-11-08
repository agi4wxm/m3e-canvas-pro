/* The names expressions read (lib/refs.ts): a variable, a data source of the screen, a param of it. They are found by
 * an expression's tokens, so a rename changes what read the thing renamed and nothing else; a variable is kept by its
 * key (its id), and its name reads follow a rename, through the one operation that renames it. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { makeItem, type DocVar, type Group } from "./tokens";
import { mapNamesInExpr, mapNamesInWords, namesRead, renamedName, varRead, varReadsKept } from "./refs";
import { evaluate } from "./bindings/expr";
import { guessMeasurer } from "./core/op";
import { counterIds, DocStore } from "./core/store";
import { stateOf } from "./core/state";
import * as ops from "./core/ops";

beforeAll(() => setGlobalLang("en"));

describe("the names an expression reads", () => {
  it("are the steps after vars, data and params where they start a path, dotted or in brackets", () => {
    const src = `vars.count + vars["购物车"] + data.products?.items.length + data?.["cart"].total + params.id + item.data.x + 'vars.no'`;
    expect(namesRead(src).map((r) => [r.root, r.name, src.slice(r.start, r.end)])).toEqual([
      ["vars", "count", ".count"],
      ["vars", "购物车", '["购物车"]'],
      ["data", "products", ".products"],
      ["data", "cart", '?.["cart"]'],
      ["params", "id", ".id"],
    ]);
  });

  it("are none of a computed key, a field called the same, or an expression that cannot be read", () => {
    expect(namesRead("vars[key] + item.vars.count + row.params")).toEqual([]);
    expect(namesRead("vars.count + 'open")).toEqual([]);
  });

  it("are spelled again the way they were where the new name allows it, in brackets where it does not", () => {
    const f = (root: string, name: string) => (root === "vars" && name === "count" ? "total" : root === "vars" && name === "n" ? "件数 two" : null);
    expect(mapNamesInExpr("vars.count * 2 + vars['count'] + vars?.count", f)).toBe(`vars.total * 2 + vars["total"] + vars?.total`);
    expect(mapNamesInExpr("vars.n + vars?.n", f)).toBe(`vars["件数 two"] + vars?.["件数 two"]`);
    /* what is not renamed is the very same string */
    const same = "data.products.items";
    expect(mapNamesInExpr(same, f)).toBe(same);
  });

  it("are read the same after a rename as the evaluator reads them", () => {
    const src = mapNamesInExpr("vars.count + vars['count']", (r, n) => (r === "vars" && n === "count" ? "a b" : null));
    expect(evaluate(src, { vars: { "a b": 2 } })).toBe(4);
  });

  it("in words are those inside {{…}}, and only those", () => {
    const f = renamedName("data", "products", "goods");
    expect(mapNamesInWords("data.products: {{ data.products.total }} of {{data.products.items.length}}", f)).toBe("data.products: {{ data.goods.total }} of {{data.goods.items.length}}");
    expect(mapNamesInWords("{{title}} and {{current.name}}", f)).toBe("{{title}} and {{current.name}}");
  });
});

describe("a variable's reads", () => {
  const v = (id: string, name: string): DocVar => ({ id, name, type: "number", value: 0 });

  it("read a variable by name, the last of a name winning, else by its key", () => {
    const vars = [v("v1", "count"), v("v2", "v1"), v("v3", "count")];
    expect(varRead(vars, "count")).toBe("v3");
    /* a name over a key, as lib/bindings/scope.ts builds `vars` */
    expect(varRead(vars, "v1")).toBe("v2");
    expect(varRead(vars, "v2")).toBe("v2");
    expect(varRead(vars, "none")).toBeUndefined();
  });

  it("follow a rename, and one that would now read another is written by its key", () => {
    const before = [v("v1", "count"), v("v2", "total")];
    /* v1 takes the name v2 is read by: v1's reads follow it, v2's are kept by key, a read by key stays */
    const after = [v("v1", "total"), v("v2", "total")];
    const f = varReadsKept(before, [after[1], after[0]]);
    expect(mapNamesInExpr("vars.count + vars.total + vars.v1", f)).toBe("vars.total + vars.v2 + vars.v1");
  });
});

describe("renaming through the operations", () => {
  const screen = { id: "F1", name: "Home", x: 0, y: 0 };
  const part = (id: string, slug: string, y: number, extra: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x: 16, y, axis: "x", items: [{ ...makeItem(slug), id, ...extra }] });
  const vars: DocVar[] = [
    { id: "v-count", name: "count", type: "number", value: 1 },
    { id: "v-name", name: "name", type: "text", value: "Ann" },
  ];
  const store = () =>
    new DocStore(
      stateOf({
        groups: [
          part("t", "text", 100, { props: { text: "{{vars.count}} for {{ vars.name }}" }, bind: { text: "v-name", label: "=vars.count + 1" } }),
          { ...part("b", "button", 200, { action: { to: "none", when: { expr: "vars.count > 0" }, effects: [{ do: "setVar", var: "v-count", value: 0, expr: "vars.count * 2" }, { do: "snackbar", message: "Now {{vars.count}}" }] } }), showWhen: { expr: "vars['count'] != 3" } },
        ],
        frames: [screen],
        vars,
      }),
      { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" },
    );
  const items = (s: DocStore) => s.get().doc.groups.flatMap((g) => g.items);

  it("a variable's new name is what every expression reads it by; what names it by key is untouched", () => {
    const s = store();
    s.run(ops.updateVar, { id: "v-count", name: "clicks" }, { origin: "ai" });
    const [t, b] = items(s);
    expect(t.props?.text).toBe("{{vars.clicks}} for {{ vars.name }}");
    expect(t.bind).toEqual({ text: "v-name", label: "=vars.clicks + 1" });
    expect(b.action?.when).toEqual({ expr: "vars.clicks > 0" });
    expect(b.action?.effects).toEqual([
      { do: "setVar", var: "v-count", value: 0, expr: "vars.clicks * 2" },
      { do: "snackbar", message: "Now {{vars.clicks}}" },
    ]);
    expect(s.get().doc.groups[1].showWhen).toEqual({ expr: `vars["clicks"] != 3` });
    /* one step to undo */
    s.undo();
    expect(items(s)[0].props?.text).toBe("{{vars.count}} for {{ vars.name }}");
  });

  it("taking a name another variable is read by keeps every read on its own variable, by key where a name cannot", () => {
    const s = store();
    /* the later variable of a name is the one it reads, so "name" still reads v-name and v-count is read by key */
    s.run(ops.updateVar, { id: "v-count", name: "name" }, { origin: "ai" });
    expect(items(s)[0].props?.text).toBe(`{{vars["v-count"]}} for {{ vars.name }}`);
  });

  it("a value or a type changed leaves every expression as it was", () => {
    const s = store();
    const before = JSON.stringify(s.get().doc.groups);
    s.run(ops.updateVar, { id: "v-count", value: 5 }, { origin: "ai" });
    expect(JSON.stringify(s.get().doc.groups)).toBe(before);
  });
});
