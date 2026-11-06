import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/i18n";
import { h } from "../parts/node";
import { BrokenPart, CANT_DRAW, PartBoundary, startingValuesOf } from "./PartView";

describe("startingValuesOf", () => {
  it("finds what a tree sets only once, however deep", () => {
    const tree = h("div", null, h("Tabs", { defaultValue: "tab-2" }), "words", h("Switch", { defaultChecked: true, className: "x" }));
    expect(startingValuesOf(tree)).toBe(`defaultValue="tab-2";defaultChecked=true`);
  });
  it("says nothing of a tree with none, so a change to it draws nothing afresh", () => {
    expect(startingValuesOf(h("Button", { variant: "text" }, "Go"))).toBe("");
  });
});

/* A part that throws while it is drawn (a document from a file or a link can hold anything) shows a small
 * mark in its place; the canvas, the preview and the gallery around it carry on. */
describe("a part that cannot be drawn", () => {
  const item = { id: "i" };
  const boundary = (again: unknown[], failed = false) => {
    const b = new PartBoundary({ again, name: "svg", children: createElement("span", null, "drawn") });
    b.state = { failed, again };
    return b;
  };

  it("is caught, and shows the mark instead", () => {
    expect(PartBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const shown = boundary([item], true).render() as ReactElement;
    expect(isValidElement(shown) && shown.type).toBe(BrokenPart);
  });

  it("is tried again once what it draws changes, and not before", () => {
    const again = [item, false, false, 412, 892];
    expect(PartBoundary.getDerivedStateFromProps({ again: [...again], children: null }, { failed: true, again })).toBeNull();
    expect(PartBoundary.getDerivedStateFromProps({ again: [{ id: "i" }, false, false, 412, 892], children: null }, { failed: true, again })).toEqual({ failed: false, again: [{ id: "i" }, false, false, 412, 892] });
    expect(PartBoundary.getDerivedStateFromProps({ again: [item, true, false, 412, 892], children: null }, { failed: true, again })?.failed).toBe(false);
    const fine = boundary([item]).render();
    expect(renderToStaticMarkup(createElement("div", null, fine))).toBe("<div><span>drawn</span></div>");
  });

  it("says so in the editor's language", () => {
    for (const lang of ["en", "zh", "ja", "ko"] as const) {
      const html = renderToStaticMarkup(createElement(LangContext.Provider, { value: lang }, createElement(BrokenPart, { name: "svg" })));
      expect(html.replace(/&#x27;/g, "'")).toContain(CANT_DRAW[lang]);
      expect(html).toContain('data-broken-part="svg"');
    }
    expect(CANT_DRAW.zh).toBe("无法绘制");
  });

  it("is reported, not swallowed", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary([item]).componentDidCatch(new RangeError("Maximum call stack size exceeded"));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
