/* Variables with collections and modes: which mode shows where, a design field bound to a variable, the operations
 * that make and change them, a file read back, the preview's state, and the exported app. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { buildScreens } from "./codegen";
import { counterIds, DocStore, guessMeasurer, OpError, ops, savedDoc, stateOf } from "./core";
import { applyEffects, screenVars, startState } from "./interact";
import { openProject, projectFile } from "./project";
import { makeItem, type Doc, type DocVar, type Group, type VarCollection } from "./tokens";
import { boundItem, collectionsOf, darkSwitched, darkSwitchedCss, DEFAULT_COLLECTION, modeFor, varValues } from "./variables";

beforeAll(() => setGlobalLang("en"));

const theme: VarCollection = { id: "theme", name: "Theme", modes: [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }], dark: "dark" };
const brand: DocVar = { id: "brand", name: "brand", type: "color", value: "#ffffff", collection: "theme", modes: { dark: "#000000" } };
const gap: DocVar = { id: "gap", name: "gap", type: "number", value: 8 };
const docOf = (over: Partial<Doc> = {}): Doc => ({ groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "", vars: [brand, gap], varCollections: [theme], ...over });

describe("collections and modes", () => {
  it("puts a variable that names no collection in the default one, which has one mode", () => {
    const list = collectionsOf(docOf());
    expect(list.map((c) => c.id)).toEqual([DEFAULT_COLLECTION, "theme"]);
    expect(collectionsOf({ vars: [gap] })).toEqual([{ id: DEFAULT_COLLECTION, name: "", modes: [{ id: "default", name: "" }] }]);
    expect(collectionsOf({ vars: [brand], varCollections: [theme] }).map((c) => c.id)).toEqual(["theme"]);
  });

  it("shows a screen's own mode, else the document's, else the dark one in dark mode, else the first", () => {
    expect(modeFor({}, theme)).toBe("light");
    expect(modeFor({}, theme, null, true)).toBe("dark");
    expect(modeFor({ varModes: { theme: "light" } }, theme, null, true)).toBe("light");
    expect(modeFor({ varModes: { theme: "light" } }, theme, { varModes: { theme: "dark" } })).toBe("dark");
    /* a choice of a mode the collection has no longer counts for nothing */
    expect(modeFor({ varModes: { theme: "gone" } }, theme)).toBe("light");
  });

  it("gives every variable its value in the modes on show", () => {
    expect(varValues(docOf())).toEqual({ brand: "#ffffff", gap: 8 });
    expect(varValues(docOf(), null, true)).toEqual({ brand: "#000000", gap: 8 });
    expect(varValues(docOf({ varModes: { theme: "dark" } }))).toEqual({ brand: "#000000", gap: 8 });
  });
});

describe("a design field bound to a variable", () => {
  const item = { ...makeItem("box"), id: "b", bind: { "@fill": "brand", "@opacity": "gap", "@radius": "gap", "@text": "brand", "@stroke": "brand", "@rotation": "gap" } };

  it("is drawn with the variable's value", () => {
    const out = boundItem(item, { brand: "#000000", gap: 8 });
    expect(out.look?.fills).toEqual([{ type: "solid", color: "#000000" }]);
    expect(out.look).toMatchObject({ opacity: 8, rotate: 8, text: { color: "#000000" }, stroke: { width: 1, color: "#000000" } });
    expect(out.corners).toEqual({ tl: 8, tr: 8, bl: 8, br: 8 });
  });

  it("is left as it is for a value of the wrong kind, and the same item comes back with nothing bound", () => {
    const out = boundItem({ ...makeItem("box"), id: "b", bind: { "@fill": "gap" } }, { gap: 8 });
    expect(out.look).toBeUndefined();
    const plain = { ...makeItem("box"), id: "c", bind: { label: "brand" } };
    expect(boundItem(plain, { brand: "#000" })).toBe(plain);
  });

  it("names the CSS variable that switches a fill, when asked", () => {
    expect(boundItem(item, { brand: "#ffffff", gap: 0 }, () => "brand-x").look?.fills).toEqual([{ type: "solid", color: "#ffffff", cssVar: "brand-x" }]);
  });
});

describe("the operations", () => {
  const store = () => new DocStore(stateOf({ groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("box"), id: "box" }] } as Group], frames: [{ id: "f", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const ai = { origin: "ai" as const };

  it("makes a collection with modes, a color variable valued in each, and binds a fill to it", () => {
    const s = store();
    const { id, modes } = s.run(ops.addVarCollection, { id: "t", name: "Theme", modes: ["Light", "Dark"] }, ai);
    expect(id).toBe("t");
    s.run(ops.addVar, { id: "c", name: "surface", type: "color", value: "#ffffff", collection: "t", values: { Dark: "#111111" } }, ai);
    expect(s.get().doc.vars).toEqual([{ id: "c", name: "surface", type: "color", value: "#ffffff", collection: "t", modes: { [modes[1]]: "#111111" } }]);
    s.run(ops.bindProp, { id: "box", prop: "@fill", var: "c" }, ai);
    expect(s.get().doc.groups[0].items[0].bind).toEqual({ "@fill": "c" });
    expect(() => s.run(ops.bindProp, { id: "box", prop: "@opacity", var: "c" }, ai)).toThrow(OpError);
    expect(() => s.run(ops.bindProp, { id: "box", prop: "@colour", var: "c" }, ai)).toThrow(OpError);
    expect(() => s.run(ops.addVar, { name: "bad", type: "color", value: "red" }, ai)).toThrow(/a color/);
    s.run(ops.setVarMode, { collection: "t", mode: "Dark" }, ai);
    expect(s.get().doc.varModes).toEqual({ t: modes[1] });
    s.run(ops.setVarMode, { collection: "t", mode: "Light", screen: "f" }, ai);
    expect(s.get().doc.frames[0].varModes).toEqual({ t: modes[0] });
    /* every step is taken back, the collection with it */
    while (s.history().length) s.undo();
    expect(s.get().doc.varCollections).toBeUndefined();
    expect(s.get().doc.vars).toBeUndefined();
  });

  it("keeps each variable's values with their modes when the modes are reordered or one goes", () => {
    const s = store();
    const { modes } = s.run(ops.addVarCollection, { id: "t", name: "Theme", modes: ["Light", "Dark", "Dim"] }, ai);
    s.run(ops.addVar, { id: "c", name: "ink", type: "color", value: "#ffffff", collection: "t", values: { Dark: "#000000", Dim: "#777777" } }, ai);
    s.run(ops.setVarMode, { collection: "t", mode: "Dim" }, ai);
    s.run(ops.updateVarCollection, { id: "t", modes: [{ id: modes[1], name: "Dark" }, { id: modes[0], name: "Light" }], dark: modes[1] }, ai);
    const v = s.get().doc.vars![0];
    expect(v.value).toBe("#000000");
    expect(v.modes).toEqual({ [modes[0]]: "#ffffff" });
    expect(s.get().doc.varCollections![0].dark).toBe(modes[1]);
    /* the document chose the mode that went: it chooses nothing now */
    expect(s.get().doc.varModes).toBeUndefined();
  });

  it("gives the default collection modes of its own, and removes a collection with its variables and their bindings", () => {
    const s = store();
    s.run(ops.addVar, { id: "n", name: "space", type: "number", value: 4 }, ai);
    const { modes } = s.run(ops.updateVarCollection, { id: DEFAULT_COLLECTION, modes: [{ id: "default", name: "Compact" }, { name: "Roomy" }] }, ai);
    s.run(ops.updateVar, { id: "n", values: { Roomy: 12 } }, ai);
    expect(s.get().doc.vars![0].modes).toEqual({ [modes[1]]: 12 });
    s.run(ops.bindProp, { id: "box", prop: "@radius", var: "n" }, ai);
    s.run(ops.removeVarCollection, { id: DEFAULT_COLLECTION }, ai);
    expect(s.get().doc.vars).toBeUndefined();
    expect(s.get().doc.groups[0].items[0].bind).toBeUndefined();
  });

  it("reads a file back with its collections and modes, and an old one as it was", () => {
    const doc = docOf({ varModes: { theme: "dark" }, frames: [{ id: "f", name: "Home", x: 0, y: 0, varModes: { theme: "light" } }] });
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc))))!;
    expect(back.vars).toEqual(doc.vars);
    expect(back.varCollections).toEqual(doc.varCollections);
    expect(back.varModes).toEqual(doc.varModes);
    expect(back.frames[0].varModes).toEqual({ theme: "light" });
    const old = openProject({ ...docOf(), varCollections: undefined, vars: [{ id: "v", name: "n", type: "number", value: 2 }] })!;
    expect(old.vars).toEqual([{ id: "v", name: "n", type: "number", value: 2 }]);
    expect(old.varCollections).toBeUndefined();
    const broken = openProject({ ...docOf(), vars: [{ id: "c", name: "c", type: "color", value: "red", modes: { dark: 3 } }], varCollections: [{ id: "x" }] })!;
    expect(broken.vars![0]).toEqual({ id: "c", name: "c", type: "color", value: "#6750a4" });
    expect(broken.varCollections).toEqual([{ id: "x", name: "", modes: [{ id: "default", name: "" }] }]);
    const store = new DocStore(stateOf(doc));
    expect(savedDoc(store.get())).toMatchObject({ varCollections: doc.varCollections, varModes: doc.varModes });
  });
});

describe("the preview", () => {
  it("reads each screen's modes, and what a tap wrote everywhere", () => {
    const doc = docOf({ frames: [{ id: "a", name: "A", x: 0, y: 0 }, { id: "b", name: "B", x: 500, y: 0, varModes: { theme: "dark" } }] });
    const s = startState(doc.vars, undefined, false);
    expect(screenVars(s, doc, doc.frames[0], false).vars.brand).toBe("#ffffff");
    expect(screenVars(s, doc, doc.frames[1], false).vars.brand).toBe("#000000");
    expect(screenVars(s, doc, doc.frames[0], true).vars.brand).toBe("#000000");
    const set = applyEffects(s, [{ do: "setVar", var: "brand", value: "#ff0000" }], doc);
    expect(screenVars(set, doc, doc.frames[1], false).vars.brand).toBe("#ff0000");
    expect(applyEffects(s, [{ do: "setVar", var: "brand", value: "not a color" }], doc)).toBe(s);
  });
});

describe("the exported app", () => {
  const box: Group = { id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("box"), id: "box", props: { surface: "card", width: 120, height: 80 }, bind: { "@fill": "brand", "@opacity": "gap" } }] };

  it("prints a bound fill with the CSS variable the dark mode switches, and the stylesheet that switches it", () => {
    const doc = docOf({ groups: [box] });
    expect([...darkSwitched(doc).values()].map((x) => x.name)).toEqual(["brand-brand"]);
    const css = darkSwitchedCss(doc, { scope: ":root", dark: ":root.dark" }, (c) => String(c));
    expect(css).toContain(":root {\n  --m3e-v-brand-brand: #ffffff;");
    expect(css).toContain(":root.dark {\n  --m3e-v-brand-brand: #000000;");
    const { screens } = buildScreens(doc, { box: 120, "box:h": 80 }, { live: true });
    expect(screens[0].source).toContain("var(--m3e-v-brand-brand, #ffffff)");
    expect(screens[0].source).toMatch(/opacity: 0\.08/);
  });

  it("prints a screen's own mode as the value it shows, with nothing to switch", () => {
    const doc = docOf({ groups: [box], frames: [{ id: "f", name: "Home", x: 0, y: 0, varModes: { theme: "dark" } }] });
    const { screens } = buildScreens(doc, { box: 120, "box:h": 80 }, { live: true });
    expect(screens[0].source).not.toContain("--m3e-v-");
    expect(screens[0].source).toContain("#000000");
  });
});
