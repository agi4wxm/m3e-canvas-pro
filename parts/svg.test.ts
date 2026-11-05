import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SVG_PRESETS, cleanPath, sanitizeSvg } from "./svg";
import { renderNode } from "./render";
import { h, type PNode } from "./node";

/* Markup pasted into the vector atom is rebuilt from what draws; whatever could run, reach out, or
 * hide either is dropped on the way. */

const drawn = (markup: string) => {
  const clean = sanitizeSvg(markup);
  return clean ? renderToStaticMarkup(createElement("div", null, renderNode(h("svg", { viewBox: clean.viewBox, ...clean.attrs }, ...clean.children)))).replace(/^<div>|<\/div>$/g, "") : "";
};

const types = (nodes: PNode[]): string[] => nodes.flatMap((n) => [n.type, ...types((n.children ?? []).filter((c): c is PNode => typeof c !== "string"))]);

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

  it("keeps a reference to a part of the drawing, never to anything outside it", () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs><rect fill="url(#g)" width="5" height="5"/><rect fill="url(https://evil.test/x.svg#g)" width="5" height="5"/><use href="#g"/><use href="https://evil.test/x.svg#g"/><use xlink:href="data:image/svg+xml,boom"/></svg>');
    const out = drawn('<svg viewBox="0 0 10 10"><rect fill="url(#g)"/><rect fill="url(https://evil.test/x)"/><use href="#g"/><use href="https://evil.test/x#g"/></svg>');
    expect(out).toContain('fill="url(#g)"');
    expect(out).not.toContain("evil");
    expect((out.match(/<use/g) ?? []).length).toBe(1);
    expect(types(clean!.children)).toEqual(["defs", "linearGradient", "stop", "rect", "rect", "use"]);
  });

  it("keeps only the painting properties of a style, and none that reach out", () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10"><rect style="fill: #00ff00; stroke: url(#a); position: fixed; background: url(https://x.test); fill-opacity: .5; behavior: url(x.htc)" width="1" height="1"/><rect style="fill: expression(alert(1))" width="1" height="1"/></svg>');
    expect(clean!.children[0].props!.style).toEqual({ fill: "#00ff00", stroke: "url(#a)", fillOpacity: ".5" });
    expect(clean!.children[1].props?.style).toBeUndefined();
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
  });

  it("takes its box from the width and height when it has no viewBox", () => {
    expect(sanitizeSvg('<svg width="32" height="16"><rect width="1" height="1"/></svg>')?.viewBox).toBe("0 0 32 16");
    expect(sanitizeSvg('<svg viewBox="bad"><rect width="1" height="1"/></svg>')?.viewBox).toBe("0 0 24 24");
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
