/* Each family of operations: what it does, what it refuses and how it says so, and the rules of a style applied
 * inside it. Run as an agent would (origin "ai": arguments checked strictly), unless the editor's own trust is what is
 * being shown. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { makeItem, type Group } from "../tokens";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import { OPS, opByName } from "./ops";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const screen = { id: "F1", name: "Home", x: 0, y: 0 };
const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }] });
const store = (groups: Group[] = [part("a", "button", 16, 100), part("b", "text", 16, 200, { text: "Hi" })]) =>
  new DocStore(stateOf({ groups, frames: [screen] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const ai = { origin: "ai" as const };
const fails = (fn: () => unknown, code: string, words?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    if (words) expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};
const item = (s: DocStore, id: string) => s.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === id);

describe("the operations' registry", () => {
  it("names every operation once and describes its arguments", () => {
    const names = OPS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    for (const o of OPS) {
      expect(o.summary.length).toBeGreaterThan(10);
      expect((o.args as { type: string }).type).toBe("object");
      expect(opByName(o.name)).toBe(o);
    }
  });
});

describe("document", () => {
  it("sets the title, the brief and the prompt", () => {
    const s = store();
    s.run(ops.setPrompt, { title: "App", brief: "For notes", promptEdit: "Edited" }, ai);
    expect(s.get().doc).toMatchObject({ title: "App", brief: "For notes", promptEdit: "Edited" });
    s.run(ops.setPrompt, { promptEdit: null }, ai);
    expect("promptEdit" in s.get().doc).toBe(false);
  });

  it("refuses a style that does not exist, and theme fields a style decides", () => {
    const s = store();
    fails(() => s.run(ops.applyStyle, { style: "nope" }, ai), "not_found", /no style "nope"/);
    s.run(ops.applyStyle, { style: "ios" }, ai);
    fails(() => s.run(ops.patchTheme, { patch: { font: "mono" } }, ai), "refused", /held to its style/);
    s.run(ops.patchTheme, { patch: { dark: true } }, ai);
    expect(s.get().doc.theme.dark).toBe(true);
    fails(() => s.run(ops.setPalette, { key: "blue" }, ai), "refused");
    s.run(ops.setRules, { on: false }, ai);
    s.run(ops.setPalette, { key: "blue" }, ai);
    expect(s.get().doc.paletteKey).toBe("blue");
  });

  it("switches between screens and a blank canvas, and clears", () => {
    const s = store();
    s.run(ops.setFrameMode, { mode: "blank" }, ai);
    expect(s.get().doc.frame).toBe("blank");
    fails(() => s.run(ops.setFrameMode, { mode: "blank" }, ai), "nothing_to_do");
    s.run(ops.clearAll, {}, ai);
    expect(s.get().doc.groups).toEqual([]);
    fails(() => s.run(ops.clearAll, {}, ai), "nothing_to_do");
  });
});

describe("screens", () => {
  it("adds, renames, resizes, copies and removes screens", () => {
    const s = store();
    const { id } = s.run(ops.addScreen, { name: "Second" }, ai);
    expect(s.get().doc.frames.map((f) => f.name)).toEqual(["Home", "Second"]);
    s.run(ops.patchScreen, { id, patch: { name: "Other", bg: "surfaceContainer" } }, ai);
    fails(() => s.run(ops.patchScreen, { id, patch: { bg: "red" as never } }, ai), "invalid_value", /color role/);
    fails(() => s.run(ops.patchScreen, { id, patch: { x: 5 } }, ai), "invalid_value", /no field "x"/);
    s.run(ops.resizeScreen, { id, preset: "tablet" }, ai);
    expect(s.get().doc.frames[1]).toMatchObject({ w: 834, h: 1194 });
    fails(() => s.run(ops.resizeScreen, { id, preset: "tablet" }, ai), "nothing_to_do");
    const copy = s.run(ops.duplicateScreen, { id: "F1" }, ai);
    expect(s.get().doc.groups.length).toBe(4);
    s.run(ops.removeScreen, { id: copy.id }, ai);
    expect(s.get().doc.groups.length).toBe(2);
    fails(() => s.run(ops.removeScreen, { id: "nope" }, ai), "not_found", /no screen "nope"/);
  });

  it("adds a template's screens and makes a screen run longer", () => {
    const s = store();
    const { frames } = s.run(ops.addTemplate, { slug: "login" }, ai);
    expect(frames.length).toBeGreaterThan(0);
    fails(() => s.run(ops.addTemplate, { slug: "nope" }, ai), "not_found");
    s.run(ops.setScreenLength, { id: "F1", length: 1400 }, ai);
    expect(s.get().doc.frames[0].length).toBe(1400);
  });

  it("makes another size of a screen", () => {
    const s = store();
    const made = s.run(ops.createScreenVariant, { id: "F1", preset: "desktop" }, ai);
    expect(s.get().doc.frames.find((f) => f.id === made.id)?.variantOf).toBe("F1");
    fails(() => s.run(ops.createScreenVariant, { id: "F1", preset: "desktop" }, ai), "nothing_to_do");
  });
});

describe("parts", () => {
  it("adds a part at a point, where there is room, and into a layout at a place in its run", () => {
    const s = store();
    s.run(ops.addPart, { slug: "chip", id: "c", screen: "F1", at: { x: 40, y: 300 } }, ai);
    expect(s.get().doc.groups.find((g) => g.items[0].id === "c")).toMatchObject({ x: 40, y: 300 });
    s.run(ops.addPart, { slug: "box", id: "box", screen: "F1", at: { x: 16, y: 400 } }, ai);
    s.run(ops.setLayout, { id: "box", layout: "row", props: { gap: 8 } }, ai);
    s.run(ops.addPart, { slug: "text", id: "t1", into: { container: "box" } }, ai);
    s.run(ops.addPart, { slug: "text", id: "t0", into: { container: "box", index: 0 } }, ai);
    const host = s.get().doc.groups.find((g) => g.items[0].id === "box")!;
    expect(s.get().doc.groups.filter((g) => g.inFlow === host.id).map((g) => g.items[0].id)).toEqual(["t0", "t1"]);
    s.run(ops.addPart, { slug: "icon", id: "free", screen: "F1" }, ai);
    expect(item(s, "free")).toBeTruthy();
  });

  it("refuses an unknown part, props it does not have, values of the wrong kind, a taken id", () => {
    const s = store();
    fails(() => s.run(ops.addPart, { slug: "nope" }, ai), "not_found", /no part "nope"/);
    fails(() => s.run(ops.addPart, { slug: "button", props: { colour: "red" } }, ai), "invalid_value", /has no prop "colour"/);
    fails(() => s.run(ops.addPart, { slug: "button", props: { label: 3 } }, ai), "invalid_value", /label should be text/);
    fails(() => s.run(ops.addPart, { slug: "button", id: "a" }, ai), "invalid_value", /taken/);
    fails(() => s.run(ops.addPart, { slug: "text", into: { container: "a" } }, ai), "invalid_value", /not a container with an auto layout/);
  });

  it("sets props, fields and group fields, and refuses a locked part", () => {
    const s = store();
    s.run(ops.setProps, { id: "a", props: { label: "Go", variant: "tonal" } }, ai);
    expect(item(s, "a")?.props).toMatchObject({ label: "Go", variant: "tonal" });
    s.run(ops.setProps, { id: "a", props: { variant: null } }, ai);
    expect(item(s, "a")?.props).toEqual({ label: "Go" });
    s.run(ops.setItem, { id: "a", patch: { fill: "primaryContainer", look: { opacity: 80, nonsense: 1 } as never, note: "Pays" } }, ai);
    expect(item(s, "a")).toMatchObject({ fill: "primaryContainer", look: { opacity: 80 }, note: "Pays" });
    fails(() => s.run(ops.setItem, { id: "a", patch: { component: "chip" } }, ai), "invalid_value", /cannot change/);
    fails(() => s.run(ops.setItem, { id: "a", patch: { flowSpan: 99 } }, ai), "invalid_value", /1 to 12/);
    s.run(ops.setGroup, { id: "a", patch: { name: "Pay", hidden: true } }, ai);
    expect(s.get().doc.groups[0]).toMatchObject({ name: "Pay", hidden: true });
    s.run(ops.setGroup, { id: "a", patch: { hidden: null, locked: true } }, ai);
    expect(s.get().doc.groups[0].hidden).toBeUndefined();
    fails(() => s.run(ops.setProps, { id: "a", props: { label: "No" } }, ai), "locked");
    fails(() => s.run(ops.removeNodes, { ids: ["a"] }, ai), "locked");
  });

  it("removes, duplicates, groups and ungroups, moves and orders", () => {
    const s = store();
    const { ids } = s.run(ops.duplicateNodes, { ids: ["a"] }, ai);
    expect(ids).toHaveLength(1);
    const g = s.run(ops.groupNodes, { ids: ["a", "b"], id: "pair" }, ai);
    expect(s.get().doc.groups.find((x) => x.id === g.groupId)?.free).toBe(true);
    fails(() => s.run(ops.groupNodes, { ids: ["a"] }, ai), "bad_args", /at least 2/);
    s.run(ops.ungroup, { id: "pair" }, ai);
    expect(s.get().doc.groups.some((x) => x.free)).toBe(false);
    s.run(ops.moveNode, { id: "a", screen: "F1", x: 100, y: 500 }, ai);
    expect(s.get().doc.groups.find((x) => x.items[0].id === "a")).toMatchObject({ x: 100, y: 500 });
    s.run(ops.nudge, { ids: ["a"], dx: 4, dy: -4 }, ai);
    expect(s.get().doc.groups.find((x) => x.items[0].id === "a")).toMatchObject({ x: 104, y: 496 });
    s.run(ops.zOrder, { ids: ["b"], to: "front" }, ai);
    s.run(ops.removeNodes, { ids: [ids[0]] }, ai);
    fails(() => s.run(ops.removeNodes, { ids: ["nope"] }, ai), "not_found");
  });

  it("moves a part into a layout and along it", () => {
    const s = store();
    s.run(ops.addPart, { slug: "box", id: "box", screen: "F1", at: { x: 16, y: 400 } }, ai);
    s.run(ops.setLayout, { id: "box", layout: "column" }, ai);
    s.run(ops.moveInto, { id: "a", container: "box" }, ai);
    s.run(ops.moveInto, { id: "b", container: "box", index: 0 }, ai);
    const host = s.get().doc.groups.find((g) => g.items[0].id === "box")!;
    expect(s.get().doc.groups.filter((g) => g.inFlow === host.id).map((g) => g.items[0].id)).toEqual(["b", "a"]);
    fails(() => s.run(ops.moveInto, { id: "box", container: "box" }, ai), "refused", /inside itself/);
  });
});

describe("layout", () => {
  it("refuses a layout on a part that cannot hold others, and a prop that is not a layout's", () => {
    const s = store();
    fails(() => s.run(ops.setLayout, { id: "a", layout: "row" }, ai), "invalid_value", /cannot lay out/);
    s.run(ops.addPart, { slug: "box", id: "box", screen: "F1" }, ai);
    fails(() => s.run(ops.setLayout, { id: "box", props: { label: "x" } }, ai), "invalid_value", /not a layout prop/);
    fails(() => s.run(ops.setLayout, { id: "box", props: { gap: -5 } }, ai), "invalid_value");
  });

  it("aligns, spreads, tidies up, tidies a screen and suggests auto layout", () => {
    const s = store([part("a", "button", 16, 100), part("b", "button", 40, 180), part("c", "button", 20, 300)]);
    s.run(ops.align, { ids: ["a", "b", "c"], how: "left" }, ai);
    expect(new Set(s.get().doc.groups.map((g) => g.x)).size).toBe(1);
    s.run(ops.distribute, { ids: ["a", "b", "c"], axis: "y", gap: 16 }, ai);
    fails(() => s.run(ops.align, { ids: ["a", "b", "c"], how: "left" }, ai), "nothing_to_do");
    s.run(ops.tidyScreen, { screen: "F1" }, ai);
    const made = s.run(ops.autoLayout, { ids: ["a", "b", "c"], id: "col" }, ai);
    expect(made.itemId).toBe("col");
    expect(s.get().doc.groups.filter((g) => g.inFlow).length).toBe(3);
  });

  it("splits a composite into atoms and refuses an atom", () => {
    const s = store([part("bar", "app-bar", 0, 0, { title: "Inbox" })]);
    const out = s.run(ops.split, { id: "bar" }, ai);
    expect(item(s, out.rootItemId)?.component).toBe("box");
    fails(() => s.run(ops.split, { id: out.rootItemId }, ai), "refused", /cannot be split/);
  });
});

describe("components", () => {
  it("makes a component, adds, overrides and detaches an instance, renames and removes the component", () => {
    const s = store();
    const made = s.run(ops.makeComponentOp, { ids: ["a"], id: "C" }, ai);
    const inst = s.run(ops.addInstance, { component: "C", screen: "F1", at: { x: 16, y: 500 } }, ai);
    s.run(ops.setOverrides, { id: inst.itemId, key: "a/label", value: "Mine" }, ai);
    expect(s.get().doc.groups.find((g) => g.id === inst.groupId)?.overrides).toEqual({ "a/label": "Mine" });
    fails(() => s.run(ops.setOverrides, { id: inst.itemId, key: "a/nope", value: 1 }, ai), "invalid_value");
    s.run(ops.renameComponent, { id: "C", name: "Buy" }, ai);
    expect(s.get().doc.components?.[0].name).toBe("Buy");
    s.run(ops.detach, { id: made.instanceId }, ai);
    expect(s.get().doc.groups.filter((g) => g.instanceOf === "C")).toHaveLength(1);
    s.run(ops.removeComponentOp, { id: "C" }, ai);
    expect(s.get().doc.components).toBeUndefined();
    fails(() => s.run(ops.addInstance, { component: "C" }, ai), "not_found");
  });
});

describe("data and behaviour", () => {
  it("adds and changes collections and refuses rows wider than the fields", () => {
    const s = store();
    s.run(ops.addCollection, { id: "d", fields: ["a", "b"], rows: [["1", "2"]] }, ai);
    fails(() => s.run(ops.updateCollection, { id: "d", rows: [["1", "2", "3"]] }, ai), "invalid_value", /more cells/);
    s.run(ops.updateCollection, { id: "d", name: "Data" }, ai);
    expect(s.get().doc.collections?.[0].name).toBe("Data");
    s.run(ops.addPart, { slug: "box", id: "box", screen: "F1" }, ai);
    fails(() => s.run(ops.setRepeat, { id: "box", repeat: { collection: "d" } }, ai), "invalid_value", /auto layout/);
    s.run(ops.setLayout, { id: "box", layout: "column" }, ai);
    s.run(ops.setRepeat, { id: "box", repeat: { collection: "d" } }, ai);
    s.run(ops.removeCollection, { id: "d" }, ai);
    expect(s.get().doc.groups.find((g) => g.items[0].id === "box")?.repeat).toBeUndefined();
  });

  it("adds variables, taps and bindings, and refuses ones that point at nothing", () => {
    const s = store();
    fails(() => s.run(ops.addVar, { name: "n", type: "number", value: "one" }, ai), "invalid_value", /a number/);
    s.run(ops.addVar, { id: "v", name: "on", type: "bool", value: false }, ai);
    fails(() => s.run(ops.setAction, { id: "a", action: { to: "nowhere", transition: "slide" } }, ai), "invalid_value", /no screen "nowhere"/);
    fails(() => s.run(ops.setAction, { id: "a", action: { to: "none", transition: "none", effects: [{ do: "toggleVar", var: "x" }] } }, ai), "invalid_value", /no variable "x"/);
    s.run(ops.setAction, { id: "a", action: { to: "none", transition: "none", effects: [{ do: "toggleVar", var: "v" }, { do: "hide", part: "b" }] } }, ai);
    expect(item(s, "a")?.action?.effects).toHaveLength(2);
    s.run(ops.bindProp, { id: "b", prop: "text", var: "v" }, ai);
    expect(item(s, "b")?.bind).toEqual({ text: "v" });
    fails(() => s.run(ops.bindProp, { id: "b", prop: "nope", var: "v" }, ai), "invalid_value");
    s.run(ops.setGroup, { id: "b", patch: { showWhen: { var: "v", op: "eq", value: true } } }, ai);
    fails(() => s.run(ops.setGroup, { id: "b", patch: { showWhen: { var: "zz", op: "eq", value: 1 } } }, ai), "invalid_value");
    s.run(ops.removeVar, { id: "v" }, ai);
    expect(item(s, "b")?.bind).toBeUndefined();
  });
});

describe("the rules of a style", () => {
  it("hold inside every operation: what the style decides comes off or is refused", () => {
    const s = store();
    s.run(ops.applyStyle, { style: "wechat" }, ai);
    fails(() => s.run(ops.setItem, { id: "a", patch: { corners: { tl: 4, tr: 4, bl: 4, br: 4 } } }, ai), "invalid_value", /decided by the style/);
    s.run(ops.addPart, { slug: "box", id: "box", screen: "F1", props: { surface: "card" } }, ai);
    /* the editor is trusted to write what it shows; the rules still take off what the style decides */
    s.run(ops.setItem, { id: "box", patch: { corners: { tl: 4, tr: 4, bl: 4, br: 4 }, look: { opacity: 50, glass: 9 } } });
    expect(item(s, "box")?.corners).toBeUndefined();
    expect(item(s, "box")?.look).toEqual({ opacity: 50 });
  });

  it("the editor's own quiet edits take no step: the title, the variables", () => {
    const s = store();
    s.run(ops.setTitle, { title: "Quiet" });
    s.run(ops.setVars, { vars: [{ id: "x", name: "x", type: "number", value: 1 }] });
    expect(s.canUndo()).toBe(false);
    expect(savedDoc(s.get()).title).toBe("Quiet");
  });
});
