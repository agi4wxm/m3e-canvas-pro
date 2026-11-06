import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { COMPONENTS, FILE_OF, loadAllModules } from "./components";
import { EXTERNAL } from "./externals";
import { h, ic, raw } from "./node";
import { WIDGET_SOURCES } from "./widgets/sources";
import { existsSync } from "node:fs";
import { choiceValueOf } from "./labels";
import { inlineNode, namesIn } from "./print";
import { renderNode } from "./render";
import { PARTS, defaultValues, partBySlug, treeOf, viewOf } from "./registry";
import { setGlobalLang } from "../lib/i18n";

/* some components read the viewport while they render (the sidebar); a browser would have one.
 * Seed text is in English here: the editor's language is a module-level value, set it. */
beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  /* a static render cannot wait for a widget to be fetched */
  await loadAllModules();
});

describe("the part registry", () => {
  it("gives every part a unique slug and unique prop keys", () => {
    expect(new Set(PARTS.map((d) => d.slug)).size).toBe(PARTS.length);
    for (const d of PARTS) expect(new Set(d.props.map((p) => p.key)).size, d.slug).toBe(d.props.length);
  });

  it("keeps every default inside what its prop allows", () => {
    for (const d of PARTS)
      for (const p of d.props) {
        if (p.kind === "enum") expect(p.options.map(choiceValueOf), `${d.slug}.${p.key}`).toContain(p.default);
        if (p.kind === "number") expect(p.default >= p.min && p.default <= p.max, `${d.slug}.${p.key}`).toBe(true);
      }
  });

  it("falls back to the default for a missing or wrong value", () => {
    const button = partBySlug("button")!;
    expect(treeOf(button, { variant: "nope", size: 3 }).props?.variant).toBe("filled");
    expect(treeOf(button, { variant: "tonal" }).props?.variant).toBe("tonal");
  });

  it("names only components that exist", () => {
    for (const d of PARTS)
      for (const name of namesIn(treeOf(d, defaultValues(d)))) expect(FILE_OF[name] ?? EXTERNAL[name] ?? WIDGET_SOURCES[name], `${d.slug}: ${name}`).toBeTruthy();
  });

  it("draws every part with its real components", () => {
    for (const d of PARTS) {
      const html = renderToStaticMarkup(createElement("div", null, renderNode(treeOf(d, defaultValues(d)))));
      expect(html.length, d.slug).toBeGreaterThan(20);
      expect(html, d.slug).not.toMatch(/undefined|\[object/);
    }
  });
});

describe("components", () => {
  it("finds the shadcn M3E components by name", () => {
    expect(COMPONENTS.Button).toBeTruthy();
    expect(FILE_OF.Button).toBe("button");
    expect(FILE_OF.ExtendedFab).toBe("fab");
    expect(FILE_OF.toast).toBe("sonner");
  });
});

describe("inlineNode", () => {
  it("prints a short element on one line", () => {
    expect(inlineNode(treeOf(partBySlug("button")!))).toBe(`<Button variant="filled" size="sm">Button</Button>`);
  });

  it("prints an icon inside a button and drops undefined and false props", () => {
    const tree = h("Button", { variant: "tonal", shape: undefined, disabled: false }, ic("add"), "Add");
    expect(inlineNode(tree)).toBe(`<Button variant="tonal" disabled={false}><Icon name="add" />Add</Button>`);
  });

  it("escapes braces and angles in text and prints values as expressions", () => {
    expect(inlineNode(h("p", null, "a < b {c}"))).toBe(`<p>{"a < b {c}"}</p>`);
    expect(inlineNode(h("Slider", { defaultValue: [50], items: [{ value: "a", label: "A" }] }))).toBe(`<Slider defaultValue={[50]} items={[{ value: "a", label: "A" }]} />`);
  });

  it("prints raw code as it is and counts what it uses", () => {
    const node = h("Button", { onClick: raw(`() => toast("Saved")`, "toast") }, "Save");
    expect(inlineNode(node)).toBe(`<Button onClick={() => toast("Saved")}>Save</Button>`);
    expect([...namesIn(node)]).toEqual(["Button", "toast"]);
  });
});

describe("component modules", () => {
  it("has a file for every module a part can name", () => {
    const files = new Set(Object.values(FILE_OF));
    expect(files.size).toBeGreaterThan(60);
    for (const file of files) expect(existsSync(new URL(`../components/m3e/${file}.tsx`, import.meta.url)), file).toBe(true);
  });
});

describe("the canvas view of a part", () => {
  it("draws every part, open where it opens something", () => {
    for (const d of PARTS) {
      const html = renderToStaticMarkup(createElement("div", null, renderNode(viewOf(d, defaultValues(d)))));
      expect(html.length, d.slug).toBeGreaterThan(20);
      expect(html, d.slug).not.toMatch(/undefined|\[object/);
    }
  });

  it("puts a part that opens something in a box, and prints it closed", () => {
    const dialog = partBySlug("dialog")!;
    expect(viewOf(dialog).type).toBe("Contained");
    expect(treeOf(dialog).type).toBe("Dialog");
    expect(inlineNode(treeOf(dialog))).not.toContain("defaultOpen");
    expect(partBySlug("button")).toBeTruthy();
    expect(viewOf(partBySlug("button")!).type).toBe("Button");
  });
});
