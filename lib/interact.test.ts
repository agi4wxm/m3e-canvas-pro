import { describe, expect, it } from "vitest";
import { applyEffects, chooseBranch, closeOpened, coerce, conditionHolds, goneIds, isHidden, isOverlayPart, liveGroups, liveItem, retarget, startState, writeField } from "./interact";
import { outOfPane, panesAfterReorder, settleInFlow } from "./flow";
import { actionWithoutScreen, makeItem, type Action, type Doc, type DocVar, type Group, type Item } from "./tokens";
import { cleanBehavior, openProject, projectFile } from "./project";
import { readShareHash, shareLink, shareable } from "./share";
import { buildPrompt } from "./prompt";
import { buildCode } from "./codegen";

const part = (slug: string, id: string, props: Record<string, unknown> = {}, extra: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...extra });
const group = (id: string, x: number, y: number, it: Item, extra: Partial<Group> = {}): Group => ({ id, x, y, axis: "x", items: [it], ...extra });

const vars: DocVar[] = [
  { id: "n", name: "count", type: "number", value: 0 },
  { id: "t", name: "who", type: "text", value: "Ann" },
  { id: "b", name: "on", type: "bool", value: false },
];
const email = part("input", "email");
const scope = { groups: [group("g-email", 0, 0, email), group("g-label", 0, 80, part("text", "label")), group("g-sheet", 0, 200, part("sheet", "sheet"), { hidden: true }), group("g-menu", 0, 300, part("dropdown-menu", "menu"))], vars };

describe("a condition", () => {
  it("holds when there is none", () => {
    expect(conditionHolds(undefined, startState(vars), scope)).toBe(true);
  });

  it("compares a variable by what it reads as, either way", () => {
    const s = startState(vars);
    expect(conditionHolds({ var: "n", op: "eq", value: 0 }, s, scope)).toBe(true);
    expect(conditionHolds({ var: "n", op: "eq", value: "0" }, s, scope)).toBe(true);
    expect(conditionHolds({ var: "n", op: "neq", value: 0 }, s, scope)).toBe(false);
    expect(conditionHolds({ var: "b", op: "eq", value: false }, s, scope)).toBe(true);
    expect(conditionHolds({ var: "t", op: "neq", value: "Bob" }, s, scope)).toBe(true);
  });

  it("is false about a variable or a field that is gone", () => {
    const s = startState(vars);
    expect(conditionHolds({ var: "gone", op: "eq", value: 1 }, s, scope)).toBe(false);
    expect(conditionHolds({ var: "gone", op: "neq", value: 1 }, s, scope)).toBe(false);
    expect(conditionHolds({ filled: "gone" }, s, scope)).toBe(false);
    expect(conditionHolds({ filled: "label" }, s, scope)).toBe(false);
  });

  it("sees a form field fill and empty", () => {
    let s = startState(vars);
    expect(conditionHolds({ filled: "email" }, s, scope)).toBe(false);
    s = writeField(s, email, "   ", scope);
    expect(conditionHolds({ filled: "email" }, s, scope)).toBe(false);
    s = writeField(s, email, "a@b.c", scope);
    expect(conditionHolds({ filled: "email" }, s, scope)).toBe(true);
    s = writeField(s, email, "", scope);
    expect(conditionHolds({ filled: "email" }, s, scope)).toBe(false);
  });

  it("reads a field's start value, a tick and a choice", () => {
    const s = startState(vars);
    const inScope = (it: Item) => ({ groups: [group("g", 0, 0, it)], vars });
    expect(conditionHolds({ filled: "a" }, s, inScope(part("input", "a", { value: "seed" })))).toBe(true);
    expect(conditionHolds({ filled: "a" }, s, inScope(part("switch", "a", { checked: false })))).toBe(false);
    expect(conditionHolds({ filled: "a" }, s, inScope(part("switch", "a", { checked: true })))).toBe(true);
    expect(conditionHolds({ filled: "a" }, s, inScope(part("select", "a", { selected: -1 })))).toBe(false);
    expect(conditionHolds({ filled: "a" }, s, inScope(part("select", "a", { selected: 1 })))).toBe(true);
  });
});

describe("the branch a tap runs", () => {
  const submit: Action = { to: "done", transition: "slide", when: { filled: "email" }, else: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Empty" }] } };

  it("is the action itself with no condition", () => {
    const plain: Action = { to: "x", transition: "fade" };
    expect(chooseBranch(plain, startState(vars), scope)).toBe(plain);
  });

  it("is `else` when the condition fails, and itself when it holds", () => {
    let s = startState(vars);
    expect(chooseBranch(submit, s, scope)).toBe(submit.else);
    s = writeField(s, email, "a", scope);
    expect(chooseBranch(submit, s, scope)).toBe(submit);
  });

  it("is nothing when the condition fails and there is no `else`", () => {
    expect(chooseBranch({ to: "x", transition: "none", when: { filled: "email" } }, startState(vars), scope)).toBeNull();
  });
});

describe("effects", () => {
  it("run in order, each seeing what the one before did", () => {
    const s = applyEffects(startState(vars), [{ do: "setVar", var: "n", value: 5 }, { do: "addVar", var: "n", by: 2 }, { do: "addVar", var: "n", by: -1 }], scope);
    expect(s.vars.n).toBe(6);
  });

  it("do nothing for no effects, and never change the state they are given", () => {
    const s = startState(vars);
    expect(applyEffects(s, undefined, scope)).toBe(s);
    expect(applyEffects(s, [], scope)).toBe(s);
    applyEffects(s, [{ do: "hide", part: "label" }, { do: "setVar", var: "n", value: 1 }, { do: "snackbar", message: "x" }], scope);
    expect(s).toEqual(startState(vars));
  });

  it("ignore what is gone or unknown", () => {
    const s = startState(vars);
    const stale = applyEffects(s, [{ do: "show", part: "gone" }, { do: "open", part: "gone" }, { do: "close", part: "gone" }, { do: "setVar", var: "gone", value: 1 }, { do: "toggleVar", var: "gone" }, { do: "addVar", var: "gone", by: 1 }, { do: "setProp", part: "gone", prop: "x", value: 1 }, { do: "nonsense" } as never], scope);
    expect(stale).toBe(s);
  });

  it("show, hide and toggle a group by a part in it", () => {
    let s = startState(vars);
    s = applyEffects(s, [{ do: "toggle", part: "label" }], scope);
    expect(isHidden(s, scope.groups[1])).toBe(true);
    s = applyEffects(s, [{ do: "toggle", part: "label" }], scope);
    expect(isHidden(s, scope.groups[1])).toBe(false);
    s = applyEffects(s, [{ do: "hide", part: "label" }, { do: "show", part: "sheet" }], scope);
    expect(isHidden(s, scope.groups[1])).toBe(true);
    expect(isHidden(s, scope.groups[2])).toBe(false);
  });

  it("start from `Group.hidden`", () => {
    const s = startState(vars);
    expect(isHidden(s, scope.groups[2])).toBe(true);
    expect(isHidden(applyEffects(s, [{ do: "toggle", part: "sheet" }], scope), scope.groups[2])).toBe(false);
  });

  it("keep a variable to its type", () => {
    const s = applyEffects(startState(vars), [{ do: "setVar", var: "n", value: "7" }, { do: "setVar", var: "t", value: 3 }, { do: "setVar", var: "b", value: "true" }], scope);
    expect(s.vars).toEqual({ n: 7, t: "3", b: true });
    expect(applyEffects(s, [{ do: "setVar", var: "n", value: "words" }], scope).vars.n).toBe(7);
    expect(coerce("", "number")).toBeNull();
    expect(coerce("false", "bool")).toBe(false);
  });

  it("flip only what can flip", () => {
    const s = applyEffects(startState(vars), [{ do: "toggleVar", var: "b" }], scope);
    expect(s.vars.b).toBe(true);
    expect(applyEffects(s, [{ do: "toggleVar", var: "b" }], scope).vars.b).toBe(false);
    expect(applyEffects(s, [{ do: "toggleVar", var: "n" }], scope).vars.n).toBe(0);
  });

  it("add without the float noise", () => {
    const s = applyEffects(startState(vars), [{ do: "addVar", var: "n", by: 0.1 }, { do: "addVar", var: "n", by: 0.2 }], scope);
    expect(s.vars.n).toBe(0.3);
  });

  it("change a prop, over what the part was given", () => {
    const s = applyEffects(startState(vars), [{ do: "setProp", part: "email", prop: "error", value: true }], scope);
    expect(liveItem(email, s).props?.error).toBe(true);
    expect(email.props?.error).toBeUndefined();
  });

  it("show the latest snackbar, each one new", () => {
    const one = applyEffects(startState(vars), [{ do: "snackbar", message: "a" }], scope);
    const two = applyEffects(one, [{ do: "snackbar", message: "b" }], scope);
    expect(two.snack?.message).toBe("b");
    expect(two.snack?.id).not.toBe(one.snack?.id);
  });
});

describe("an overlay", () => {
  it("with no trigger stands on the screen only while open", () => {
    let s = startState(vars);
    s = applyEffects(s, [{ do: "open", part: "sheet" }], scope);
    expect(isHidden(s, scope.groups[2])).toBe(false);
    expect(s.opened.sheet).toBe(true);
    s = applyEffects(s, [{ do: "close", part: "sheet" }], scope);
    expect(isHidden(s, scope.groups[2])).toBe(true);
    expect(s.opened.sheet).toBeUndefined();
  });

  it("with a trigger stays there when it closes", () => {
    let s = applyEffects(startState(vars), [{ do: "open", part: "menu" }], scope);
    expect(s.opened.menu).toBe(true);
    s = applyEffects(s, [{ do: "close", part: "menu" }], scope);
    expect(s.opened.menu).toBeUndefined();
    expect(isHidden(s, scope.groups[3])).toBe(false);
  });

  it("closes all at once from the scrim", () => {
    const s = applyEffects(startState(vars), [{ do: "open", part: "menu" }, { do: "open", part: "sheet" }], scope);
    const closed = closeOpened(s, scope);
    expect(closed.opened).toEqual({});
    expect(isHidden(closed, scope.groups[2])).toBe(true);
  });

  it("is what the panel offers for open and close", () => {
    expect(isOverlayPart(part("dialog", "x"))).toBe(true);
    expect(isOverlayPart(part("dropdown-menu", "x"))).toBe(true);
    expect(isOverlayPart(part("drawer", "x"))).toBe(true);
    expect(isOverlayPart(part("button", "x"))).toBe(false);
  });
});

describe("a bound prop", () => {
  const label = part("text", "lb", { text: "start" }, { bind: { text: "n" } });

  it("reads the variable, in the kind of value the prop takes", () => {
    expect(liveItem(label, startState(vars)).props?.text).toBe("0");
    const count = part("navigation-bar", "nav", {}, { bind: { badge: "t" } });
    const s = { ...startState(vars), vars: { ...startState(vars).vars, t: "12" } };
    expect(liveItem(count, s).props?.badge).toBe(12);
    const sw = part("switch", "sw", {}, { bind: { checked: "b" } });
    expect(liveItem(sw, startState(vars)).props?.checked).toBe(false);
  });

  it("keeps the part's own value where a variable cannot say", () => {
    const off = part("navigation-bar", "nav", { badge: 3 }, { bind: { badge: "t" } });
    expect(liveItem(off, startState(vars)).props?.badge).toBe(3);
    const lost = part("text", "lb", { text: "x" }, { bind: { text: "gone", nope: "n" } });
    expect(liveItem(lost, startState(vars)).props?.text).toBe("x");
  });

  it("leaves a part with nothing live untouched", () => {
    expect(liveItem(email, startState(vars))).toBe(email);
  });

  it("follows the input that writes it", () => {
    const name = part("input", "name", {}, { bind: { value: "t" } });
    const doc = { groups: [group("g", 0, 0, name)], vars };
    const s = writeField(startState(vars), name, "Zed", doc);
    expect(s.vars.t).toBe("Zed");
    expect(s.fields.name).toBe("Zed");
    expect(liveItem(name, s).props?.value).toBe("Zed");
  });

  it("is written in the variable's own type", () => {
    const slider = part("slider", "sl", {}, { bind: { value: "n" } });
    const doc = { groups: [group("g", 0, 0, slider)], vars };
    expect(writeField(startState(vars), slider, 42, doc).vars.n).toBe(42);
    const sw = part("switch", "sw", {}, { bind: { checked: "b" } });
    expect(writeField(startState(vars), sw, true, { groups: [group("g", 0, 0, sw)], vars }).vars.b).toBe(true);
    const typed = part("input", "i", {}, { bind: { value: "n" } });
    expect(writeField(startState(vars), typed, "9", { groups: [group("g", 0, 0, typed)], vars }).vars.n).toBe(9);
  });

  it("of a choice holds the row's words in a text variable, and turns them back", () => {
    const pick = part("select", "pick", { items: [{ label: "Apple" }, { label: "Pear" }] }, { bind: { selected: "t" } });
    const doc = { groups: [group("g", 0, 0, pick)], vars };
    const s = writeField(startState(vars), pick, 1, doc);
    expect(s.vars.t).toBe("Pear");
    expect(liveItem(pick, s).props?.selected).toBe(1);
  });

  it("does not report a change that is none, so a watcher cannot loop", () => {
    const s = writeField(startState(vars), email, "a", scope);
    expect(writeField(s, email, "a", scope)).toBe(s);
    expect(writeField(s, part("text", "x"), "a", scope)).toBe(s);
  });
});

/* a container whose parts have been measured */
const column = (id: string, extra: Record<string, unknown> = {}) => group(id, 0, 0, part("container", `i-${id}`, { layout: "column", gap: 8, padX: 0, padY: 0, width: 200, height: 400, ...extra }));
const row = (id: string, y: number, extra: Partial<Group> = {}) => group(id, 0, y, part("button", `i-${id}`), { inFlow: "col", ...extra });
const measured = { "i-a": 100, "i-a:h": 40, "i-b": 100, "i-b:h": 40, "i-c": 100, "i-c:h": 40 };
const ys = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.id, g.y]));

describe("laying out what is on show", () => {
  const groups = [column("col"), row("a", 0), row("b", 48, { hidden: true }), row("c", 96)];

  it("leaves no hole for a hidden part in a layout", () => {
    const s = startState(vars);
    expect(ys(liveGroups(groups, s, { groups, vars }, measured))).toEqual({ col: 0, a: 0, c: 48 });
  });

  it("makes room when it appears", () => {
    const s = applyEffects(startState(vars), [{ do: "show", part: "i-b" }], { groups, vars });
    expect(ys(liveGroups(groups, s, { groups, vars }, measured))).toEqual({ col: 0, a: 0, b: 48, c: 96 });
  });

  it("shrinks a container that hugs what it holds", () => {
    const hug = [column("col", { hugHeight: true }), row("a", 0), row("b", 48, { hidden: true })];
    const out = liveGroups(hug, startState(vars), { groups: hug, vars }, measured);
    expect(out[0].items[0].props?.height).toBe(40);
  });

  it("hides on a condition, and what a hidden container holds goes with it", () => {
    const set = [column("col", { }), row("a", 0)];
    const when = [{ ...set[0], showWhen: { var: "b", op: "eq" as const, value: true } }, set[1]];
    const doc = { groups: when, vars };
    expect(goneIds(when, startState(vars), doc, measured)).toEqual(new Set(["col", "a"]));
    const on = applyEffects(startState(vars), [{ do: "setVar", var: "b", value: true }], doc);
    expect(goneIds(when, on, doc, measured).size).toBe(0);
  });

  it("does not move the document's own groups", () => {
    const s = startState(vars);
    liveGroups(groups, s, { groups, vars }, measured);
    expect(groups[3].y).toBe(96);
  });
});

describe("a dock's tabs", () => {
  const dock = (selected: number) => group("dock", 0, 0, part("dock", "i-dock", { selected, width: 300, height: 300, gap: 8, padX: 0, padY: 0 }));
  const kid = (id: string, pane: number | undefined, y: number) => group(id, 0, y, part("button", `i-${id}`), { inFlow: "dock", ...(pane === undefined ? {} : { pane }) });
  const sizes = { "i-dock": 300, "i-dock:h": 300, "i-a": 100, "i-a:h": 40, "i-b": 100, "i-b:h": 40, "i-c": 100, "i-c:h": 40 };

  it("flows from the start, and shows the chosen tab's parts", () => {
    const groups = [dock(1), kid("a", 0, 40), kid("b", 1, 40), kid("c", 1, 88)];
    expect(outOfPane(groups, sizes)).toEqual(new Set(["a"]));
    const out = liveGroups(groups, startState(vars), { groups, vars }, sizes);
    expect(ys(out)).toEqual({ dock: 0, b: 40, c: 88 });
  });

  it("reads a part with no tab as the first tab's", () => {
    expect(outOfPane([dock(0), kid("a", undefined, 40)], sizes).size).toBe(0);
    expect(outOfPane([dock(1), kid("a", undefined, 40)], sizes)).toEqual(new Set(["a"]));
  });

  it("keeps the content of a removed tab, on the last one left", () => {
    expect(outOfPane([dock(2), kid("a", 9, 40)], sizes).size).toBe(0);
  });

  it("gives a part dropped on it the tab showing, and takes it back when it leaves", () => {
    const groups = [dock(2), group("a", 10, 60, part("button", "i-a"))];
    const dropped = settleInFlow(groups, "a", sizes);
    expect(dropped.find((g) => g.id === "a")).toMatchObject({ inFlow: "dock", pane: 2 });
    const away = dropped.map((g) => (g.id === "a" ? { ...g, x: 900 } : g));
    const left = settleInFlow(away, "a", sizes).find((g) => g.id === "a")!;
    expect(left.inFlow).toBeUndefined();
    expect(left.pane).toBeUndefined();
  });

  it("leaves a part dropped elsewhere as it was", () => {
    const groups = [dock(0), group("a", 900, 60, part("button", "i-a"))];
    expect(settleInFlow(groups, "a", sizes)).toBe(groups);
  });

  it("carries content along when its tabs are reordered or removed", () => {
    const groups = [dock(0), kid("a", 0, 40), kid("b", 1, 40), kid("c", 2, 40)];
    const moved = panesAfterReorder(groups, "dock", [2, 0, 1], sizes);
    expect(moved.slice(1).map((g) => g.pane)).toEqual([1, 2, 0]);
    const gone = panesAfterReorder(groups, "dock", [0, 2], sizes);
    expect(gone.slice(1).map((g) => g.pane)).toEqual([0, 1, 1]);
  });

  it("prints each tab's content under its tab", () => {
    const doc = { groups: [group("dock", 0, 0, part("dock", "i-dock", { selected: 1, width: 300, height: 300 })), { ...kid("a", 0, 40), items: [part("button", "i-a", { label: "OnFirstTab" })] }, { ...kid("b", 1, 40), items: [part("button", "i-b", { label: "OnSecondTab" })] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
    const { code } = buildCode(doc, sizes);
    expect(code).toMatch(/\{tab\("dock", 1\) === 0 && \(\s+<Button[^>]*>OnFirstTab/);
    expect(code).toMatch(/\{tab\("dock", 1\) === 1 && \(\s+<Button[^>]*>OnSecondTab/);
    expect(code).toContain(`data-tap="tab:1"`);
  });

  it("leaves a dock with nothing to switch between alone", () => {
    const doc = { groups: [group("dock", 0, 0, part("dock", "i-dock", { selected: 0, width: 300, height: 300 })), { ...kid("a", 0, 40), items: [part("button", "i-a", { label: "OnFirstTab" })] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
    const { code } = buildCode(doc, sizes);
    expect(code).toContain("OnFirstTab");
    expect(code).not.toContain("useApp");
    expect(code).not.toContain("data-tap");
  });
});

describe("copies and deleted screens", () => {
  it("points a copy at the copy of what it reached for", () => {
    const g = group("g", 0, 0, part("button", "btn", {}, { action: { to: "none", transition: "none", when: { filled: "field" }, effects: [{ do: "hide", part: "field" }, { do: "hide", part: "other" }], else: { to: "none", transition: "none", effects: [{ do: "show", part: "field" }] } } }), { showWhen: { filled: "field" } });
    const out = retarget(g, new Map([["field", "field2"]]));
    expect(out.showWhen).toEqual({ filled: "field2" });
    const a = out.items[0].action!;
    expect(a.when).toEqual({ filled: "field2" });
    expect(a.effects).toEqual([{ do: "hide", part: "field2" }, { do: "hide", part: "other" }]);
    expect(a.else?.effects).toEqual([{ do: "show", part: "field2" }]);
  });

  it("drops a plain tap with its screen, and keeps what else one does", () => {
    expect(actionWithoutScreen({ to: "s", transition: "fade" }, "s")).toBeUndefined();
    expect(actionWithoutScreen({ to: "s", transition: "fade", effects: [{ do: "snackbar", message: "x" }] }, "s")).toMatchObject({ to: "none", effects: [{ do: "snackbar", message: "x" }] });
    expect(actionWithoutScreen({ to: "o", transition: "fade", when: { filled: "x" }, else: { to: "s", transition: "fade" } }, "s")).toMatchObject({ to: "o", else: { to: "none" } });
    const other: Action = { to: "o", transition: "fade" };
    expect(actionWithoutScreen(other, "s")).toBe(other);
  });
});

const base = { frames: [{ id: "f", name: "Home", x: 0, y: 0 }, { id: "f2", name: "Done", x: 500, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" };

describe("a file with behaviour in it", () => {
  const good: Doc = {
    ...base,
    frame: "phone",
    vars,
    groups: [group("g", 0, 0, part("button", "b", {}, { bind: { label: "t" }, action: { to: "f2", transition: "slide", when: { var: "n", op: "eq", value: 1 }, else: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "no" }] }, effects: [{ do: "addVar", var: "n", by: 1 }] } }), { hidden: true, pane: 1, showWhen: { filled: "b" } })],
  };

  it("comes back whole", () => {
    expect(openProject(JSON.parse(JSON.stringify(projectFile(good))))).toEqual(good);
  });

  it("keeps it through a shared link", async () => {
    expect(shareable(good).vars).toEqual(vars);
    expect(shareable(good).groups[0]).toMatchObject({ hidden: true, pane: 1, showWhen: { filled: "b" } });
    expect(shareable(good).groups[0].items[0]).toMatchObject({ bind: { label: "t" }, action: { when: { var: "n" } } });
    const link = await shareLink(good, "https://x.test/");
    expect(await readShareHash(link.slice(link.indexOf("#")))).toEqual(good);
  });

  it("loses only what is of the wrong type, and never throws or refuses", () => {
    const item = (extra: Record<string, unknown>) => ({ ...part("button", "b"), ...extra });
    const bad = {
      ...base,
      vars: [null, 3, { id: 1, type: "text" }, { id: "x", type: "nope" }, { id: "k", name: 7, type: "number", value: "words" }, { id: "ok", name: "ok", type: "bool", value: true }],
      groups: [
        {
          id: "g",
          x: 0,
          y: 0,
          axis: "x",
          hidden: "yes",
          pane: -1,
          showWhen: { var: 3 },
          items: [
            item({
              bind: { label: "t", icon: 4 },
              action: { to: "f2", transition: "slide", when: "nope", else: { to: 1 }, effects: [null, 3, { do: "nope" }, { do: "show" }, { do: "show", part: "a" }, { do: "setVar", var: "n", value: {} }, { do: "addVar", var: "n", by: "1" }, { do: "snackbar", message: "hi" }] },
              actions: { "tab:0": 5, "tab:1": { to: "f" , transition: "none", effects: "x" } },
            }),
          ],
        },
        { id: "h", x: 0, y: 0, axis: "x", hidden: true, pane: 2.5, items: [item({ id: "c", bind: 9, action: 3, actions: 7 })] },
      ],
    };
    const doc = openProject(JSON.parse(JSON.stringify(bad)))!;
    expect(doc).not.toBeNull();
    expect(doc.vars).toEqual([{ id: "k", name: "", type: "number", value: 0 }, { id: "ok", name: "ok", type: "bool", value: true }]);
    const [g, h] = doc.groups;
    expect(g.hidden).toBeUndefined();
    expect(g.pane).toBeUndefined();
    expect(g.showWhen).toBeUndefined();
    const it = g.items[0];
    expect(it.bind).toEqual({ label: "t" });
    /* an effect of a kind this version does not know is kept as it came, for the version that wrote it */
    expect(it.action).toEqual({ to: "f2", transition: "slide", effects: [{ do: "nope" }, { do: "show", part: "a" }, { do: "snackbar", message: "hi" }] });
    expect(it.actions).toEqual({ "tab:1": { to: "f", transition: "none" } });
    expect(h.hidden).toBe(true);
    expect(h.pane).toBeUndefined();
    expect(h.items[0].bind).toBeUndefined();
    expect(h.items[0].action).toBeUndefined();
    expect(h.items[0].actions).toBeUndefined();
  });

  it("drops vars that are not a list", () => {
    expect(cleanBehavior({ ...good, vars: "x" as never }).vars).toBeUndefined();
  });

  it("leaves a file with none of it as it was", () => {
    const plain = { ...base, groups: [group("g", 0, 0, part("button", "b", {}, { action: { to: "f2", transition: "slide" } }))] } as Doc;
    expect(openProject(JSON.parse(JSON.stringify(plain)))).toEqual(plain);
  });
});

describe("the prompt", () => {
  const button = part("button", "b", { label: "Submit" }, {
    bind: { label: "t" },
    action: {
      to: "f2",
      transition: "none",
      when: { filled: "mail" },
      effects: [{ do: "setVar", var: "n", value: 1 }, { do: "show", part: "tip" }, { do: "open", part: "sh" }, { do: "setProp", part: "mail", prop: "error", value: false }],
      else: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Fill it in" }, { do: "toggleVar", var: "b" }, { do: "addVar", var: "n", by: 2 }, { do: "hide", part: "tip" }, { do: "toggle", part: "tip" }, { do: "close", part: "sh" }] },
    },
  });
  const doc = {
    ...base,
    vars,
    groups: [
      group("d", 0, 0, part("dock", "dock", { width: 300, height: 100 })),
      group("k", 0, 40, part("button", "kid", { label: "Inside" }), { inFlow: "d", pane: 1 }),
      group("g1", 0, 200, part("input", "mail", { placeholder: "Mail" }, { bind: { value: "t" } })),
      group("g2", 0, 300, part("text", "tip", { text: "Tip" }), { hidden: true, showWhen: { var: "n", op: "neq", value: 0 } }),
      group("g3", 0, 400, part("sheet", "sh", { title: "More" }), { hidden: true }),
      group("g4", 0, 500, button),
    ],
  } as Doc;

  it.each(["ja", "en", "zh", "ko"] as const)("says what the prototype does in %s", (lang) => {
    const text = buildPrompt(doc, {}, undefined, lang);
    /* the names are the author's in every language: what is around them is the language's own */
    for (const word of ["count", "who", "Fill it in", "Submit", "Tip", "Inside", "error"]) expect(text, word).toContain(word);
    const wording = {
      ja: ["変数", "入力があるとき", "そうでないときは", "最初は表示せず", "表示する", "だけ表示", "タブの中身", "連動"],
      en: ["variable", "is filled in", "otherwise", "starts hidden", "shows", "shown only", "tab of", "writes to it"],
      zh: ["变量", "已填写", "否则", "初始隐藏", "显示", "仅", "标签页内容", "写回"],
      ko: ["변수", "입력이 있을 때", "그렇지 않으면", "처음에는 숨겨져", "표시", "만 표시", "탭 내용", "기록"],
    }[lang];
    for (const word of wording) expect(text, word).toContain(word);
  });

  it("reads a plain tap exactly as before", () => {
    const plain = { ...base, groups: [group("g", 0, 0, part("button", "b", { label: "Go" }, { action: { to: "f2", transition: "none" } }))] } as Doc;
    expect(buildPrompt(plain, {}, undefined, "en")).toContain('opens the "Done" screen when tapped');
  });

  it("leaves out a step whose part or variable is gone", () => {
    const stale = { ...base, groups: [group("g", 0, 0, part("button", "b", { label: "Go" }, { action: { to: "none", transition: "none", effects: [{ do: "show", part: "gone" }, { do: "setVar", var: "gone", value: 1 }] } }))] } as Doc;
    expect(() => buildPrompt(stale, {}, undefined, "en")).not.toThrow();
    expect(buildPrompt(stale, {}, undefined, "en")).not.toContain("gone");
  });
});
