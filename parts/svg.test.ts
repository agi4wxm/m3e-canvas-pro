import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_DEPTH, MAX_REUSE, SVG_PRESETS, cleanPath, sanitizeSvg, unsafe, type CleanSvg } from "./svg";
import { renderNode } from "./render";
import { loadAllModules } from "./components";
import { h, type PNode, type PValue } from "./node";
import { applyAppearance } from "./appearance";
import { partBySlug, treeOf, viewOf } from "./registry";
import { buildCode } from "../lib/codegen";
import { setGlobalLang } from "../lib/i18n";
import { makeItem, type Doc } from "../lib/tokens";

/* Markup pasted into the vector atom is rebuilt from what draws; whatever could run, reach out, or
 * hide either is dropped on the way. Markup also comes in shared links, so a drawing may not be made
 * to draw without end, to nest past what anything can walk, or to paint with another drawing's parts. */

beforeAll(async () => {
  setGlobalLang("en");
  /* a static render cannot wait for a part's components to be fetched */
  await loadAllModules();
});

const drawn = (markup: string, scope?: string) => {
  const clean = sanitizeSvg(markup, scope);
  return clean ? renderToStaticMarkup(createElement("div", null, renderNode(h("svg", { viewBox: clean.viewBox, ...clean.attrs }, ...clean.children)))).replace(/^<div>|<\/div>$/g, "") : "";
};

const kids = (n: PNode): PNode[] => (n.children ?? []).filter((c): c is PNode => typeof c !== "string");
const types = (nodes: PNode[]): string[] => nodes.flatMap((n) => [n.type, ...types(kids(n))]);
const depthOf = (n: PNode): number => 1 + Math.max(0, ...kids(n).map(depthOf));
const elements = (nodes: PNode[]): number => nodes.reduce((sum, n) => sum + 1 + elements(kids(n)), 0);
const ids = (nodes: PNode[]): string[] => nodes.flatMap((n) => [...(typeof n.props?.id === "string" ? [n.props.id] : []), ...ids(kids(n))]);

/** What a browser draws for a cleaned drawing: every element, with what a `use`, a mask or a clip draws
 *  in its place, and a pattern's tile once for every element that paints with it. Fails on a loop. */
function drawnCount(clean: CleanSvg): number {
  const root = h("svg", clean.attrs, ...clean.children);
  const byId = new Map<string, PNode>();
  const index = (n: PNode) => {
    const id = n.props?.id;
    if (typeof id === "string" && !byId.has(id)) byId.set(id, n);
    kids(n).forEach(index);
  };
  index(root);
  const targets = (v: PValue) => (typeof v === "string" ? [...v.matchAll(/url\(#([^)]+)\)/g)].map((m) => byId.get(m[1])).filter((t): t is PNode => !!t) : []);
  const memo = new Map<PNode, number>();
  const busy = new Set<PNode>();
  const count = (n: PNode): number => {
    const known = memo.get(n);
    if (known !== undefined) return known;
    if (busy.has(n)) throw new Error(`the drawing points back at ${n.type}#${n.props?.id}`);
    busy.add(n);
    const props = n.props ?? {};
    let base = 1 + kids(n).reduce((s, k) => s + count(k), 0);
    if (n.type === "use" && typeof props.href === "string") {
      const t = byId.get(props.href.slice(1));
      if (t) base += count(t);
    }
    for (const t of [...targets(props.mask), ...targets(props.clipPath)]) base += count(t);
    let total = base;
    const style = (props.style ?? {}) as Record<string, PValue>;
    for (const t of [...targets(props.fill), ...targets(props.stroke), ...targets(style.fill), ...targets(style.stroke)]) if (t.type === "pattern") total += base * count(t);
    busy.delete(n);
    memo.set(n, total);
    return total;
  };
  return count(root);
}

/** a drawing may draw what it holds, and no more than `MAX_REUSE` beyond that */
const withinReuse = (clean: CleanSvg | null) => {
  expect(clean).not.toBeNull();
  expect(drawnCount(clean!)).toBeLessThanOrEqual(1 + elements(clean!.children) + MAX_REUSE);
};

describe("pasted markup", () => {
  it("keeps the shapes, their paint and the drawing's box", () => {
    const clean = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24" width="96"><g fill="red"><path d="M0 0h10v10z" stroke-width="2" fill-rule="evenodd"/><circle cx="5" cy="5" r="3"/></g></svg>');
    expect(clean?.viewBox).toBe("0 0 48 24");
    expect(types(clean!.children)).toEqual(["g", "path", "circle"]);
    const path = (clean!.children[0].children![0] as PNode).props!;
    expect(path).toEqual({ d: "M0 0h10v10z", strokeWidth: "2", fillRule: "evenodd" });
  });

  it("drops scripts, styles, foreign content and pictures, with all they hold", () => {
    const out = drawn('<svg viewBox="0 0 10 10"><script>alert(1)</script><style>*{fill:red}</style><foreignObject><div>hi</div></foreignObject><image href="https://x.test/a.png"/><a href="javascript:alert(1)"><rect width="5" height="5"/></a><rect width="1" height="1"/></svg>');
    expect(out).not.toMatch(/script|alert|style>|foreignObject|<div|image|<a\b|javascript/);
    expect((out.match(/<rect/g) ?? []).length).toBe(1);
  });

  it("drops event handlers under any spelling", () => {
    const out = drawn('<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="5" height="5" onClick="x()" ONMOUSEOVER="y()"/></svg>');
    expect(out).not.toMatch(/on[a-z]+=|alert|x\(\)|y\(\)/i);
    expect(out).toContain("<rect");
  });

  it("keeps a reference to a part of the drawing, under the drawing's own name for it, and none to anything else", () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs><rect fill="url(#g)" width="5" height="5"/><rect fill="url(https://evil.test/x.svg#g)" width="5" height="5"/><use href="#g"/><use href="https://evil.test/x.svg#g"/><use xlink:href="data:image/svg+xml,boom"/></svg>', "part-1");
    expect(types(clean!.children)).toEqual(["defs", "linearGradient", "stop", "rect", "rect", "use"]);
    const [gradient] = ids(clean!.children);
    expect(gradient).toMatch(/^s[a-z0-9]+-g$/);
    expect(clean!.children[1].props?.fill).toBe(`url(#${gradient})`);
    expect(clean!.children[2].props?.fill).toBeUndefined();
    expect(clean!.children[3].props?.href).toBe(`#${gradient}`);
    /* what points at nothing in the drawing points at nothing at all */
    const out = drawn('<svg viewBox="0 0 10 10"><rect fill="url(#g)"/><rect fill="url(https://evil.test/x)"/><use href="#g"/><use href="https://evil.test/x#g"/></svg>');
    expect(out).not.toMatch(/evil|url\(|<use/);
  });

  it("keeps only the painting properties of a style, and none that reach out", () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10"><linearGradient id="a"/><rect style="fill: #00ff00; stroke: url(#a); position: fixed; background: url(https://x.test); fill-opacity: .5; behavior: url(x.htc)" width="1" height="1"/><rect style="fill: expression(alert(1))" width="1" height="1"/></svg>');
    const [a] = ids(clean!.children);
    expect(clean!.children[1].props!.style).toEqual({ fill: "#00ff00", stroke: `url(#${a})`, fillOpacity: ".5" });
    expect(clean!.children[2].props?.style).toBeUndefined();
  });

  it("refuses values that hide a way out behind escapes or entities", () => {
    const out = drawn('<svg viewBox="0 0 10 10"><rect fill="url(&#104;ttps://x.test/a)" width="1"/><rect fill="u\\72l(https://x.test)" width="1"/><rect transform="javascript&#58;alert(1)" width="1"/></svg>');
    expect(out).not.toMatch(/x\.test|javascript|alert/);
  });

  it("reads shapes with no svg around them, and survives what is not markup at all", () => {
    expect(types(sanitizeSvg('<path d="M0 0L1 1"/><circle r="2"/>')!.children)).toEqual(["path", "circle"]);
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("just words")).toBeNull();
    expect(sanitizeSvg("<svg><script>x</script></svg>")).toBeNull();
    expect(() => sanitizeSvg("<svg <<<< ='\"><path d='M0 0'")).not.toThrow();
    expect(() => sanitizeSvg("<".repeat(10000))).not.toThrow();
    expect(sanitizeSvg(42 as unknown as string)).toBeNull();
  });

  it("takes its box from the width and height when it has no viewBox", () => {
    expect(sanitizeSvg('<svg width="32" height="16"><rect width="1" height="1"/></svg>')?.viewBox).toBe("0 0 32 16");
    expect(sanitizeSvg('<svg viewBox="bad"><rect width="1" height="1"/></svg>')?.viewBox).toBe("0 0 24 24");
  });
});

describe("an address hidden in a value", () => {
  /* each was seen, or could be, to make a browser fetch from elsewhere: quoted addresses holding a quote or
   * a bracket, entities, other spellings, and the other ways CSS has of loading something */
  const HOSTILE = [
    `url(&quot;https://evil.example/x'y.svg#g&quot;)`,
    `url(&quot;https://evil.example/m)n.svg#m&quot;)`,
    `url(&#34;https://evil.example/a#b&#34;)`,
    `url(&#39;https://evil.example/a)b#c&#39;)`,
    `url( https://evil.example/a#b )`,
    `URL(https://evil.example/a#b)`,
    `Url(&quot;//evil.example/a#b&quot;)`,
    `url(#g) url(https://evil.example/b#g)`,
    `url(#g), url("https://evil.example/b#g")`,
    `url(/**/https://evil.example/a#b)`,
    `url(&#x68;ttps://evil.example/a#b)`,
    `url(&amp;quot;https://evil.example/a#b&amp;quot;)`,
    `url( #g)`,
    `url("#g)`,
    `url('#g")`,
    `url(evil.example#g)`,
    `url(./evil#g)`,
    `u/**/rl(https://evil.example/a)`,
    `image-set("https://evil.example/a.png" 1x)`,
    `-webkit-image-set(url(https://evil.example/a.png) 1x)`,
    `image("https://evil.example/a.png")`,
    `src("https://evil.example/a.png")`,
    `cross-fade(url(https://evil.example/a.png), red)`,
    `element(#evil)`,
    `attr(data-evil url)`,
    `expression(alert(1))`,
    `EXPRESSION /**/ (alert(1))`,
    `javascript:alert(1)`,
    `JaVaScRiPt&#58;alert(1)`,
    `vbscript:msgbox(1)`,
    `data:image/svg+xml,<svg/>`,
    `@import "https://evil.example/a.css"`,
    `red; behavior: url(https://evil.example/x.htc)`,
    `-moz-binding:url(https://evil.example/x.xml#x)`,
    `\\75 rl(https://evil.example/a)`,
    `red\u0000url(https://evil.example/a)`,
  ];

  it("is refused, whatever its spelling", () => {
    for (const raw of HOSTILE) {
      const decoded = raw.replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x68;/g, "h").replace(/&#58;/g, ":").replace(/&amp;/g, "&");
      expect(unsafe(decoded), raw).toBe(true);
    }
  });

  it("is dropped from every attribute and every style that could carry it, on the canvas", () => {
    for (const raw of HOSTILE) {
      const value = raw.replace(/"/g, "&quot;");
      for (const markup of [
        `<svg viewBox="0 0 10 10"><linearGradient id="g"/><rect width="10" height="10" fill="${value}"/></svg>`,
        `<svg viewBox="0 0 10 10"><mask id="g"/><rect width="10" height="10" mask="${value}"/></svg>`,
        `<svg viewBox="0 0 10 10"><clipPath id="g"/><rect width="10" height="10" clip-path="${value}"/></svg>`,
        `<svg viewBox="0 0 10 10"><linearGradient id="g"/><rect width="10" height="10" stroke="${value}" transform="${value}"/></svg>`,
        `<svg viewBox="0 0 10 10"><linearGradient id="g"/><rect width="10" height="10" style="fill:${value};stroke:${value}"/></svg>`,
        `<svg viewBox="0 0 10 10" fill="${value}" style="stroke:${value}"><linearGradient id="g"/><rect width="10" height="10"/></svg>`,
        `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill='${raw.replace(/'/g, "&#39;")}'/></svg>`,
      ]) {
        const clean = sanitizeSvg(markup);
        const out = drawn(markup) + JSON.stringify(clean?.attrs ?? {});
        expect(out, markup).not.toMatch(/evil|https?:|\/\/|javascript|vbscript|expression|image-set|src\(|data:|@import|binding|behavior|attr\(|element\(|image\(/i);
      }
    }
  });

  it("is dropped from printed code too", () => {
    const markup = `<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)" style="stroke:url(&quot;https://evil.example/a'b#c&quot;)" mask='url("https://evil.example/m)n#m")'/></svg>`;
    const doc: Doc = { groups: [{ id: "g1", x: 16, y: 100, axis: "x", items: [{ ...makeItem("svg"), id: "art", props: { mode: "markup", markup } }] }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" };
    const { code } = buildCode(doc, {});
    expect(code).toContain("linearGradient");
    expect(code).not.toMatch(/evil/);
  });

  it("still lets a drawing point at its own parts, however it quotes them", () => {
    const out = drawn(`<svg viewBox="0 0 10 10"><linearGradient id="g"/><rect fill="url( '#g' )"/><rect fill='url("#g")'/><rect fill="url(&#9;#g&#9;)"/><rect style="fill:url(#g)"/></svg>`, "item");
    expect((out.match(/url\(#s[a-z0-9]+-g\)/g) ?? []).length).toBe(4);
  });
});

describe("the names a drawing gives its parts", () => {
  const RED = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>';
  const BLUE = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#0000ff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>';

  it("are its own: two drawings that both call a gradient `g` each paint with theirs", () => {
    const red = sanitizeSvg(RED, "item-a")!;
    const blue = sanitizeSvg(BLUE, "item-b")!;
    const [r] = ids(red.children);
    const [b] = ids(blue.children);
    expect(r).not.toBe(b);
    expect(red.children[1].props?.fill).toBe(`url(#${r})`);
    expect(blue.children[1].props?.fill).toBe(`url(#${b})`);
    /* the same markup on two parts is two drawings too */
    expect(ids(sanitizeSvg(RED, "item-c")!.children)[0]).not.toBe(r);
  });

  it("are the same each time the same part is drawn, and come from the part, not the markup", () => {
    expect(ids(sanitizeSvg(RED, "item-a")!.children)).toEqual(ids(sanitizeSvg(RED, "item-a")!.children));
    expect(ids(sanitizeSvg(RED, "item-a")!.children)).toEqual(ids(sanitizeSvg(BLUE, "item-a")!.children));
    /* with no part to name it, the markup names itself */
    expect(ids(sanitizeSvg(RED)!.children)).toEqual(ids(sanitizeSvg(RED)!.children));
    expect(ids(sanitizeSvg(RED)!.children)).not.toEqual(ids(sanitizeSvg(BLUE)!.children));
  });

  it("are the ones the canvas draws, the printed code prints and the project exports", () => {
    const def = partBySlug("svg")!;
    const item = { ...makeItem("svg"), id: "art-7", props: { mode: "markup", markup: RED } };
    const canvas = renderToStaticMarkup(createElement("div", null, renderNode(viewOf(def, item.props, undefined, undefined, false, item.id))));
    const name = /id="([^"]+)"/.exec(canvas)![1];
    expect(name).toMatch(/-g$/);
    expect(canvas).toContain(`fill="url(#${name})"`);
    const doc: Doc = { groups: [{ id: "g1", x: 16, y: 100, axis: "x", items: [item] }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" };
    const { code } = buildCode(doc, {});
    expect(code).toContain(`id="${name}"`);
    expect(code).toContain(`fill="url(#${name})"`);
    expect(inlineIds(treeOf(def, item.props, undefined, item.id))).toEqual([name]);
  });

  it("keep the first of two parts that share a name, and point nowhere for one never defined", () => {
    const clean = sanitizeSvg('<svg><linearGradient id="g"><stop stop-color="red"/></linearGradient><linearGradient id="g"><stop stop-color="blue"/></linearGradient><rect fill="url(#g)"/><rect fill="url(#missing)" stroke="red"/><use href="#missing"/></svg>', "x")!;
    expect(ids(clean.children)).toHaveLength(1);
    expect(clean.children[2].props?.fill).toBe(`url(#${ids(clean.children)[0]})`);
    expect(clean.children[3].props).toEqual({ stroke: "red" });
    expect(types(clean.children)).not.toContain("use");
  });

  it("may not be names the outer element gives itself, which is the part's own", () => {
    const out = drawn('<svg id="root" viewBox="0 0 10 10"><use href="#root"/><rect mask="url(#root)" width="1" height="1"/></svg>');
    expect(out).not.toMatch(/<use|mask=|id=/);
  });
});

const inlineIds = (n: PNode): string[] => ids([n]);

describe("what a drawing reuses", () => {
  /** levels of ten references each to the level below: ten to the `levels` copies, unchecked */
  const bomb = (levels: number, level: (k: number, below: string) => string, base: string, top: (id: string) => string) => {
    let defs = base;
    for (let k = 1; k <= levels; k++) defs += level(k, `a${k - 1}`);
    return `<svg width="100" height="100" viewBox="0 0 10 10"><defs>${defs}</defs>${top(`a${levels}`)}</svg>`;
  };
  const ten = (one: (i: number) => string) => Array.from({ length: 10 }, (_, i) => one(i)).join("");

  it("never draws more than a drawing's worth through `use`", () => {
    const markup = bomb(7, (k, below) => `<g id="a${k}">${ten(() => `<use href="#${below}"/>`)}</g>`, `<path id="a0" d="M0 0h1v1z"/>`, (id) => `<use href="#${id}"/>`);
    const t0 = performance.now();
    const clean = sanitizeSvg(markup);
    expect(performance.now() - t0).toBeLessThan(1000);
    withinReuse(clean);
  });

  it("never draws more than a drawing's worth through masks, clips or patterns", () => {
    const masks = bomb(9, (k, below) => `<mask id="a${k}">${ten((i) => `<rect x="${i / 10}" width="10" height="10" fill="white" mask="url(#${below})"/>`)}</mask>`, `<mask id="a0"><rect width="10" height="10" fill="white"/></mask>`, (id) => `<rect width="10" height="10" mask="url(#${id})"/>`);
    const clips = bomb(9, (k, below) => `<clipPath id="a${k}">${ten((i) => `<rect x="${i / 10}" width="10" height="10" clip-path="url(#${below})"/>`)}</clipPath>`, `<clipPath id="a0"><rect width="10" height="10"/></clipPath>`, (id) => `<rect width="10" height="10" clip-path="url(#${id})"/>`);
    const patterns = bomb(9, (k, below) => `<pattern id="a${k}" width="1" height="1" patternUnits="userSpaceOnUse">${ten((i) => `<rect x="${i / 100}" width="1" height="1" fill="url(#${below})"/>`)}</pattern>`, `<pattern id="a0" width="1" height="1"><rect width="1" height="1" fill="red"/></pattern>`, (id) => `<rect width="10" height="10" fill="url(#${id})"/>`);
    /* one pattern painted onto a group of many is drawn once for each of them */
    const inherited = `<svg><pattern id="p" width="1" height="1">${"<rect width='1' height='1'/>".repeat(200)}</pattern><g fill="url(#p)">${"<rect width='1' height='1'/>".repeat(1000)}</g><g style="stroke:url(#p)">${"<rect width='1' height='1'/>".repeat(1000)}</g></svg>`;
    const outer = `<svg fill="url(#p)"><pattern id="p" width="1" height="1">${"<rect width='1' height='1'/>".repeat(200)}</pattern>${"<rect width='1' height='1'/>".repeat(1000)}</svg>`;
    for (const markup of [masks, clips, patterns, inherited, outer]) {
      const t0 = performance.now();
      const clean = sanitizeSvg(markup);
      expect(performance.now() - t0).toBeLessThan(1000);
      withinReuse(clean);
    }
  });

  it("never points back at itself", () => {
    for (const markup of [
      '<svg><g id="a"><use href="#a"/><rect width="1" height="1"/></g></svg>',
      '<svg><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g><use href="#a"/></svg>',
      '<svg><mask id="m"><rect width="1" height="1" mask="url(#m)"/></mask><rect mask="url(#m)" width="1" height="1"/></svg>',
      '<svg><clipPath id="c" clip-path="url(#c)"><rect width="1" height="1"/></clipPath><rect clip-path="url(#c)" width="1" height="1"/></svg>',
      '<svg><pattern id="p"><rect width="1" height="1" fill="url(#q)"/></pattern><pattern id="q"><rect width="1" height="1" fill="url(#p)"/></pattern><rect fill="url(#p)" width="1" height="1"/></svg>',
      '<svg><g id="a"><g><g><use href="#a"/></g></g></g></svg>',
    ]) {
      const clean = sanitizeSvg(markup);
      expect(clean, markup).not.toBeNull();
      expect(() => drawnCount(clean!), markup).not.toThrow();
    }
  });

  it("keeps what icons and design tools ordinarily reuse", () => {
    const sprite = sanitizeSvg('<svg viewBox="0 0 24 24"><defs><symbol id="dot" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></symbol></defs><use href="#dot" x="0" width="4" height="4"/><use xlink:href="#dot" x="10" width="4" height="4"/><use href="#dot" x="20" width="4" height="4"/></svg>', "icon")!;
    expect(types(sprite.children).filter((t) => t === "use")).toHaveLength(3);
    const figma = sanitizeSvg(
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><g clip-path="url(#clip0_1_2)"><path d="M0 0h24v24H0z" fill="url(#paint0_linear_1_2)"/><circle cx="12" cy="12" r="4" mask="url(#mask0)"/></g><defs><linearGradient id="paint0_linear_1_2" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#6750A4"/><stop offset="1" stop-color="#B3261E"/></linearGradient><clipPath id="clip0_1_2"><rect width="24" height="24" fill="white"/></clipPath><mask id="mask0"><rect width="24" height="24" fill="url(#paint0_linear_1_2)"/></mask></defs></svg>',
      "figma",
    )!;
    const g = figma.children[0];
    expect(g.props?.clipPath).toMatch(/^url\(#s[a-z0-9]+-clip0_1_2\)$/);
    expect(kids(g)[0].props?.fill).toMatch(/^url\(#s[a-z0-9]+-paint0_linear_1_2\)$/);
    expect(kids(g)[1].props?.mask).toMatch(/^url\(#s[a-z0-9]+-mask0\)$/);
    expect(figma.attrs.fill).toBe("none");
    /* a thousand shapes filled with gradients is a drawing, not a bomb: a gradient costs nothing to point at */
    const many = sanitizeSvg(`<svg><linearGradient id="g"><stop stop-color="red"/></linearGradient>${'<rect width="1" height="1" fill="url(#g)"/>'.repeat(3000)}</svg>`)!;
    expect(many.children.filter((n) => typeof n.props?.fill === "string")).toHaveLength(3000);
  });
});

describe("deep markup", () => {
  const nested = (depth: number, inner = '<path d="M0 0h1v1z"/>') => `<svg>${"<g>".repeat(depth)}${inner}${"</g>".repeat(depth)}<rect width="2" height="2"/></svg>`;

  it("is read down to a drawing's depth, and the rest of the drawing after it still is", () => {
    for (const depth of [10, 63, 64, 65, 500, 3000, 3999, 10000]) {
      const clean = sanitizeSvg(nested(depth));
      expect(clean, `${depth}`).not.toBeNull();
      expect(Math.max(...clean!.children.map(depthOf)), `${depth}`).toBeLessThanOrEqual(MAX_DEPTH);
      if (depth < 3999) expect(clean!.children[clean!.children.length - 1].type, `${depth}`).toBe("rect");
    }
    expect(types(sanitizeSvg(nested(10))!.children)).toContain("path");
    expect(types(sanitizeSvg(nested(500))!.children)).not.toContain("path");
  });

  it("draws, painted and printed, without running out of stack", () => {
    const def = partBySlug("svg")!;
    const props = { mode: "markup", markup: nested(3000) };
    const tree = applyAppearance(treeOf(def, props, undefined, "deep"), { look: { text: { size: 20 } } } as never);
    expect(() => renderToStaticMarkup(createElement("div", null, renderNode(tree)))).not.toThrow();
    const doc: Doc = { groups: [{ id: "g1", x: 16, y: 100, axis: "x", items: [{ ...makeItem("svg"), id: "deep", props }] }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" };
    expect(() => buildCode(doc, {})).not.toThrow();
  });

  it("is read in time in proportion to its length, however it is shaped", () => {
    const cases = [
      "<svg><rect " + '"'.repeat(199_000) + "/></svg>",
      "<svg><rect " + "=".repeat(199_000) + "/></svg>",
      "<svg><rect " + "a ".repeat(99_000) + "/></svg>",
      "<svg><rect " + 'a="' + "x".repeat(199_000) + "/></svg>",
      "<svg>" + "<".repeat(199_000) + "</svg>",
      "<!--".repeat(50_000),
      "<g>".repeat(66_000),
      "<g></x>".repeat(28_000),
      "<g>".repeat(3999) + "</x>".repeat(45_000),
      "<svg>" + "<g>".repeat(3998) + "</g>".repeat(45_000) + "</svg>",
      '<svg><rect fill="' + "&#x41;".repeat(33_000) + '"/></svg>',
      '<svg><rect style="' + "fill:red;".repeat(22_000) + '"/></svg>',
      '<svg><linearGradient id="a"/><rect fill="' + "url(#a)".repeat(28_000) + '"/></svg>',
    ];
    const t0 = performance.now();
    for (const markup of cases) expect(() => sanitizeSvg(markup)).not.toThrow();
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe("a path and the library", () => {
  it("takes a path of commands and numbers only", () => {
    expect(cleanPath("M0 0 L10 10 Z")).toBe("M0 0 L10 10 Z");
    expect(cleanPath("M0 0 url(x)")).toBeUndefined();
    expect(cleanPath("")).toBeUndefined();
  });

  it("draws every shape of the library from clean paths", () => {
    for (const [key, shape] of Object.entries(SVG_PRESETS)) {
      expect(shape.viewBox, key).toMatch(/^0 0 \d+ \d+$/);
      for (const d of shape.d) expect(cleanPath(d), key).toBe(d);
    }
  });
});
