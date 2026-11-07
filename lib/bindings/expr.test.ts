/* The expression language of the bindings: what it reads and computes, how it writes values in each language, and
 * that no input (deeply nested, huge, prototype-shaped, a step budget's worth) can make it throw, hang or reach past
 * plain data. */

import { describe, expect, it } from "vitest";
import { EXPR_LIMITS, HELPERS, display, evaluate, exprProblems, fillTemplate, hasTemplate, holds, parseExpr, pathsOf, readKey, rootsOf, truthy } from "./expr";

const scope = {
  data: { products: { items: [{ id: "p1", name: "Tea", price: 12.5, tags: [{ name: "hot" }, { name: "green" }] }, { id: "p2", name: "Cake", price: 30, stock: 0 }], status: "ready", loading: false } },
  params: { productId: "p2" },
  vars: { count: 3, name: "Ann", dark: false },
  item: { id: "p1", name: "Tea", price: 12.5, qty: 2, createdAt: "2026-11-06T10:00:00Z", subtitle: null },
  index: 0,
  auth: { signedIn: true, user: { name: "Ann" } },
};
const NOW = Date.parse("2026-11-06T12:00:00Z");
const ev = (src: string, lang = "en") => evaluate(src, scope, { lang, now: NOW });

describe("reading and computing", () => {
  it("reads paths, lists and lengths", () => {
    expect(ev("data.products.items[1].name")).toBe("Cake");
    expect(ev("data.products.items.length")).toBe(2);
    expect(ev("data.products.items[-1].id")).toBe("p2");
    expect(ev('item["name"]')).toBe("Tea");
    expect(ev("item.missing.deeper")).toBeUndefined();
    expect(ev("item?.name")).toBe("Tea");
    expect(ev("params.productId")).toBe("p2");
    expect(ev("vars.name.length")).toBe(3);
    expect(ev("index")).toBe(0);
  });

  it("computes with numbers, words, comparisons and the logic", () => {
    expect(ev("item.price * item.qty")).toBe(25);
    expect(ev('"Hi " + vars.name + "!"')).toBe("Hi Ann!");
    expect(ev("1 + 2 * 3 - 4 / 2")).toBe(5);
    expect(ev("(1 + 2) * 3 % 4")).toBe(1);
    expect(ev("10 / 0")).toBeUndefined();
    expect(ev("item.price > 10 && !vars.dark")).toBe(true);
    expect(ev('vars.count == "3"')).toBe(true);
    expect(ev('vars.count === "3"')).toBe(false);
    expect(ev('"b" > "a"')).toBe(true);
    expect(ev("item.subtitle ?? 'none'")).toBe("none");
    expect(ev("item.subtitle || item.name")).toBe("Tea");
    expect(ev("data.products.items[1].stock > 0 ? 'In stock' : 'Sold out'")).toBe("Sold out");
    expect(ev("-item.price")).toBe(-12.5);
    expect(ev("!data.products.items")).toBe(false);
  });

  it("counts an empty list as no", () => {
    expect(truthy([])).toBe(false);
    expect(truthy([0])).toBe(true);
    expect(holds("data.products.items", scope)).toBe(true);
    expect(holds("data.none.items", scope)).toBe(false);
  });

  it("says where an expression stops making sense", () => {
    expect(parseExpr("item.").ok).toBe(false);
    expect(parseExpr("(1 + 2").ok).toBe(false);
    expect(parseExpr("'open").ok).toBe(false);
    expect(parseExpr("foo.bar").ok).toBe(false);
    expect(parseExpr("item.name()").ok).toBe(false);
    expect(parseExpr("eval('1')").ok).toBe(false);
    expect(parseExpr("1 +").ok).toBe(false);
    expect(parseExpr("").ok).toBe(false);
    const bad = parseExpr("item.name @ 2");
    expect(bad.ok === false && bad.at).toBe(10);
  });

  it("names the roots and the paths it reads", () => {
    const p = parseExpr("currency(item.price * item.qty) + data.cart.value.total + params.id");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(rootsOf(p.expr).sort()).toEqual(["data", "item", "params"]);
    expect(pathsOf(p.expr).map((x) => x.join("."))).toEqual(expect.arrayContaining(["item.price", "item.qty", "data.cart.value.total", "params.id"]));
    expect(exprProblems("data.cart.items", { sources: ["products"] })[0]).toContain('"cart"');
    expect(exprProblems("params.productId", { params: ["productId"] })).toEqual([]);
  });
});

describe("formatting per language", () => {
  it("writes dates absolute and relative", () => {
    expect(ev('date("2026-11-06", "date")')).toBe("Nov 6, 2026");
    expect(ev('date("2026-11-06", "date")', "zh")).toBe("2026年11月6日");
    expect(ev("relative(item.createdAt)")).toBe("2 hours ago");
    expect(ev("relative(item.createdAt)", "zh")).toBe("2小时前");
    expect(ev("relative(item.createdAt)", "ja")).toBe("2 時間前");
    expect(ev("date('nonsense')")).toBe("nonsense");
  });

  it("writes numbers, money, percentages and sizes", () => {
    expect(ev("number(1234567.891, 2)")).toBe("1,234,567.89");
    expect(ev("currency(12.5)")).toBe("$12.50");
    expect(ev("currency(12.5)", "zh")).toBe("¥12.50");
    expect(ev("currency(1200, 'JPY')", "ja")).toBe("￥1,200");
    expect(ev("percent(0.256, 1)")).toBe("25.6%");
    expect(ev("fileSize(1536000)")).toBe("1.5 MB");
    expect(ev("fileSize(512)")).toBe("512 B");
  });

  it("chooses the plural and cuts long words", () => {
    expect(ev("plural(1, '# item', '# items')")).toBe("1 item");
    expect(ev("plural(1200, '# item', '# items')")).toBe("1,200 items");
    expect(ev("plural(1, '# item', '# items')", "zh")).toBe("1 items");
    expect(ev("truncate('A long product name', 8)")).toBe("A long …");
    expect(ev("join(pluck(item.tags ?? data.products.items[0].tags, 'name'), ' · ')")).toBe("hot · green");
    expect(ev("sum(data.products.items, 'price')")).toBe(42.5);
    expect(ev("len(data.products.items)")).toBe(2);
    expect(ev("contains(pluck(data.products.items, 'id'), params.productId)")).toBe(true);
  });

  it("fills {{expressions}} in words and leaves other tokens", () => {
    expect(fillTemplate("Hi {{auth.user.name}}, {{plural(vars.count, '# item', '# items')}} in {{field}}", scope, { lang: "en" })).toBe("Hi Ann, 3 items in {{field}}");
    expect(hasTemplate("{{field}}")).toBe(false);
    expect(hasTemplate("{{item.name}}")).toBe(true);
    expect(display([1, "a", null])).toBe("1, a, ");
  });
});

describe("hostile input", () => {
  it("refuses nesting past its bound without overflowing the stack", () => {
    const deep = "(".repeat(5000) + "1" + ")".repeat(5000);
    const p = parseExpr(deep);
    expect(p.ok).toBe(false);
    const unary = "!".repeat(10_000) + "1";
    expect(parseExpr(unary).ok).toBe(false);
    const chain = "item" + ".a".repeat(5000);
    expect(parseExpr(chain).ok).toBe(false);
    const ternary = "1 ? ".repeat(3000) + "1" + " : 0".repeat(3000);
    expect(parseExpr(ternary).ok).toBe(false);
  });

  it("refuses huge sources and caps the words it makes", () => {
    expect(parseExpr(`"${"x".repeat(EXPR_LIMITS.length)}"`).ok).toBe(false);
    expect(parseExpr("1+".repeat(1500) + "1").ok).toBe(false);
    const big = { item: { s: "y".repeat(15_000) } };
    const v = evaluate("item.s + item.s + item.s", big) as string;
    expect(v.length).toBe(EXPR_LIMITS.text);
    expect((evaluate("join(item.list)", { item: { list: Array.from({ length: 100_000 }, () => "word") } }) as string).length).toBeLessThanOrEqual(EXPR_LIMITS.text);
  });

  it("stops a long evaluation at its step budget", () => {
    const list = Array.from({ length: 100_000 }, (_, i) => i);
    const t = performance.now();
    expect(evaluate("sum(item) + sum(item) + sum(item)", { item: list })).toBeUndefined();
    expect(performance.now() - t).toBeLessThan(500);
    const many = Array.from({ length: 900 }, () => "a").join(" + ");
    expect(typeof evaluate(many, { a: 1 } as never)).toBe("undefined");
  });

  it("never reads past plain data", () => {
    const polluted = JSON.parse('{"__proto__": {"admin": true}, "a": 1}');
    expect(evaluate("item.__proto__", { item: polluted })).toBeUndefined();
    expect(evaluate("item.__proto__.admin", { item: polluted })).toBeUndefined();
    expect(evaluate('item["__proto__"]', { item: { a: 1 } })).toBeUndefined();
    expect(evaluate("item.constructor", { item: { a: 1 } })).toBeUndefined();
    expect(evaluate("item.constructor.prototype", { item: {} })).toBeUndefined();
    expect(evaluate("item.toString", { item: {} })).toBeUndefined();
    expect(evaluate("item.hasOwnProperty", { item: {} })).toBeUndefined();
    expect(evaluate("item.name.constructor", { item: { name: "x" } })).toBeUndefined();
    expect(evaluate("item.push", { item: [] })).toBeUndefined();
    expect(evaluate("item.f", { item: { f: () => 1 } })).toBeUndefined();
    expect(evaluate("item.getTime", { item: new Date() })).toBeUndefined();
    expect(evaluate("item.x", { item: new Map([["x", 1]]) })).toBeUndefined();
    expect(readKey(Object.create({ inherited: 1 }), "inherited")).toBeUndefined();
    /* a scope's own prototype is no root */
    expect(parseExpr("constructor").ok).toBe(false);
    expect(parseExpr("toString").ok).toBe(false);
    expect(Object.keys(HELPERS)).not.toContain("constructor");
    expect(parseExpr("constructor(1)").ok).toBe(false);
    expect(parseExpr("hasOwnProperty(1)").ok).toBe(false);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  /* `{{` and a long run of spaces with no `}}` after them: three quantifiers over the same characters made the template's
     pattern try every split of the run (cubic: 2000 spaces took a second, 8000 almost a minute), on the preview, in
     the exported apps and while the export prints a screen */
  it("reads words with an unclosed {{ and a long run of spaces at once", () => {
    for (const words of [`{{${" ".repeat(50_000)}x`, `{{ item.name${" ".repeat(50_000)}}`, `${"{{ ".repeat(20_000)}`, `{{${" \t".repeat(20_000)}}}`]) {
      const t = performance.now();
      expect(hasTemplate(words)).toBe(false);
      expect(fillTemplate(words, scope).length).toBeLessThanOrEqual(EXPR_LIMITS.text);
      expect(performance.now() - t).toBeLessThan(200);
    }
    /* what the pattern found before, it still finds: spaces inside the braces are the expression's own */
    expect(fillTemplate("{{  item.name  }} and {{item.price}}", scope)).toBe("Tea and 12.5");
    expect(fillTemplate("{{ }} {{}} {{ field }}", scope)).toBe("{{ }} {{}} {{ field }}");
  });

  /* a helper that repeats words it was given (a separator between a long list's elements, a plural's `#` written
     once per number) made strings far past the cap before cutting them: memory a page full of bindings could not hold */
  it("caps what a helper makes before it makes it", () => {
    const list = Array.from({ length: 1000 }, (_, i) => i);
    const sep = "s".repeat(1_000_000);
    const t = performance.now();
    expect((evaluate("join(item.list, item.sep)", { item: { list, sep } }) as string).length).toBeLessThanOrEqual(EXPR_LIMITS.text);
    expect((evaluate(`plural(1000000000000000, "${"#".repeat(3800)}")`, {}) as string).length).toBeLessThanOrEqual(EXPR_LIMITS.text);
    expect((evaluate("upper(item.sep)", { item: { sep } }) as string).length).toBeLessThanOrEqual(EXPR_LIMITS.text);
    expect(performance.now() - t).toBeLessThan(500);
    expect(evaluate("join(item.list, ' · ')", { item: { list: [1, 2, 3] } })).toBe("1 · 2 · 3");
  });

  it("never throws on any input", () => {
    const junk = ["", "\u0000", "}}{{", "a".repeat(300), "((((", "1e999", "'\\u12'", "item[item[item[item]]]", "x?.5:1", "item?.[0]", "@#$%", "date(", "plural()", "?? 1", "a ? b", "\\"];
    for (const j of junk) expect(() => evaluate(j, scope)).not.toThrow();
    for (const j of junk) expect(() => fillTemplate(`{{${j}}}`, scope)).not.toThrow();
  });
});
