import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LangContext, setGlobalLang } from "../lib/i18n";
import { makeItem, PALETTES, type ComponentDef, type Group, type Palette } from "../lib/tokens";
import { DeviceBars } from "./DeviceBars";
import { InstanceInspector, ComponentsPanel } from "./ReusePanels";
import { TemplatesPanel } from "./TemplatesPanel";
import { Toolbar } from "./Toolbar";

/* What the editor's panels say while a definition is open, and what a phone is offered. */

setGlobalLang("en");
const p: Palette = PALETTES[0];
const noop = () => {};
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(LangContext.Provider, { value: "en" }, element));
const button = (id: string): Group => ({ id, x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: `${id}-b`, props: { label: "Go" } }] });
const def: ComponentDef = { id: "c", name: "Card", w: 100, h: 40, groups: [button("g")] };

const toolbar = (over: Partial<Parameters<typeof Toolbar>[0]> = {}) =>
  html(createElement(Toolbar, { p, mode: "select", onMode: noop, frame: "phone", onFrame: noop, zoom: 1, onZoom: noop, onFit: noop, canUndo: false, canRedo: false, onUndo: noop, onRedo: noop, onClear: noop, onAddFrame: noop, onPreview: noop, rightInset: 0, ...over }));

describe("while a definition is open", () => {
  it("Add screen says it cannot, rather than doing nothing", () => {
    expect(toolbar()).not.toMatch(/<button[^>]*title="Add screen"[^>]*disabled/);
    const blocked = toolbar({ addFrameBlocked: true });
    expect(blocked).toMatch(/<button[^>]*title="Finish editing the component to add a screen"[^>]*disabled/);
    expect(blocked).not.toContain('title="Add screen"');
  });

  it("a template says it cannot either", () => {
    const out = html(createElement(TemplatesPanel, { p, onAdd: noop, blocked: true }));
    expect(out).toContain("A template adds screens. Finish editing the component first.");
    const tiles = out.match(/<button[^>]*data-template=[^>]*>/g) ?? [];
    expect(tiles.length).toBeGreaterThan(5);
    for (const tile of tiles) expect(tile).toMatch(/disabled/);
  });

  it("a definition cannot be deleted from inside another: that could not be taken back from in there", () => {
    const panel = (editingId: string | null) => html(createElement(ComponentsPanel, { p, components: [def, { ...def, id: "d" }], uses: {}, editingId, onPointerDown: noop, onActivate: noop, onEdit: noop, onRename: noop, onDelete: noop }));
    expect(panel(null)).not.toContain("Finish editing the component to delete a definition");
    expect(panel("d").match(/<button[^>]*title="Finish editing the component to delete a definition"[^>]*disabled/g)).toHaveLength(2);
  });
});

describe("a definition's tile", () => {
  it("holds real buttons, so it is no button itself: a button may not hold a button", () => {
    const out = html(createElement(ComponentsPanel, { p, components: [def], uses: {}, editingId: null, onPointerDown: noop, onActivate: noop, onEdit: noop, onRename: noop, onDelete: noop }));
    expect(out).toMatch(/<div[^>]*role="button"[^>]*data-component-tile="c"/);
    expect(out).not.toMatch(/<button[^>]*data-component-tile/);
  });
});

describe("on a phone", () => {
  it("the toolbar offers the preview, and fits a narrow screen without its word", () => {
    vi.stubGlobal("window", { innerWidth: 390 });
    expect(toolbar({ mobile: true })).toContain('title="Preview"');
    expect(toolbar({ mobile: true })).toContain("Prompt");
    vi.stubGlobal("window", { innerWidth: 320 });
    expect(toolbar({ mobile: true })).toContain('aria-label="Copy prompt"');
    expect(toolbar({ mobile: true })).not.toContain(">Prompt<");
    vi.unstubAllGlobals();
  });

  it("an instance's panel has no way into its definition: a phone does not edit one", () => {
    const panel = (onEdit?: () => void) =>
      html(createElement(InstanceInspector, { group: { ...button("i"), instanceOf: "c" }, def, components: [def], palette: p, locked: false, inFlow: false, onDuplicate: noop, onDelete: noop, onEdit, onDetach: noop, onOverrides: noop, selectionKey: "" }));
    expect(panel(noop)).toContain("data-instance-edit");
    expect(panel()).not.toContain("data-instance-edit");
    expect(panel()).toContain("data-instance-detach");
  });
});

describe("the device's bars", () => {
  it("take no pointer and read in the colour of what they stand on", () => {
    const on = html(createElement(DeviceBars, { p, bg: "primary", height: 892, zIndex: 3 }));
    expect(on).toContain("pointer-events:none");
    expect(on).toContain("9:41");
    expect(on).toContain(p.onPrimary);
  });
});
