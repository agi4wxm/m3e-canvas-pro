import { describe, expect, it } from "vitest";
import { makeItem, type Group } from "../tokens";
import { counterIds, DocStore, HISTORY_MAX, type ChangeEvent } from "./store";
import { MAX_SCREEN, MAX_SCREEN_LENGTH, savedDoc, stateOf, withGroups, type CoreState } from "./state";
import { addPart, addScreen, applyStyle, patchTheme, removeNodes, setItem, setTitle, makeComponentOp, OpError } from "./ops";
import { guessMeasurer } from "./op";

const part = (id: string, slug = "button", x = 16, y = 100): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id }] });
const screen = { id: "F1", name: "Home", x: 0, y: 0 };

function fresh(groups: Group[] = [part("a"), part("b", "text", 16, 200)], o: { now?: () => number } = {}) {
  return new DocStore(stateOf({ groups, frames: [screen] }), { ids: counterIds("id"), measurer: guessMeasurer, lang: () => "en", ...o });
}

const ids = (s: CoreState) => s.doc.groups.map((g) => g.id);

describe("DocStore", () => {
  it("runs an operation as one change and tells who changed what", () => {
    const store = fresh();
    const seen: ChangeEvent[] = [];
    store.subscribe((e) => seen.push(e));
    const out = store.run(addPart, { slug: "chip", screen: "F1", at: { x: 40, y: 400 } }, { origin: "ai" });
    expect(store.get().doc.groups.some((g) => g.items[0].id === out.itemId)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ origin: "ai", kind: "edit", label: "Add chip" });
    expect(seen[0].changedIds).toContain(out.itemId);
    expect(seen[0].changedIds).toContain(out.groupId);
    expect(store.canUndo()).toBe(true);
    expect(store.view().history.undoLabel).toBe("Add chip");
  });

  it("keeps a turn of changes, each with no step, as one step taken from where it began", () => {
    const store = fresh();
    const begin = store.get();
    store.run(removeNodes, { ids: ["a"] }, { origin: "ai", history: "none" });
    store.checkpoint("AI: tidy", { from: begin, whole: true, origin: "ai" });
    store.run(setTitle, { title: "Turned" }, { origin: "ai", history: "none" });
    store.run(addScreen, { id: "F2" }, { origin: "ai", history: "none" });
    expect(store.history()).toEqual(["AI: tidy"]);
    expect(store.undo()).toBe("AI: tidy");
    expect(ids(store.get())).toEqual(["g-a", "g-b"]);
    expect(store.get().doc.title).toBe("");
    expect(store.get().doc.frames.map((f) => f.id)).toEqual(["F1"]);
  });

  it("undoes and redoes steps with their labels", () => {
    const store = fresh();
    store.run(setTitle, { title: "One" }, { origin: "ai" });
    store.run(removeNodes, { ids: ["a"] });
    expect(ids(store.get())).toEqual(["g-b"]);
    expect(store.undo()).toBe("Delete");
    expect(ids(store.get())).toEqual(["g-a", "g-b"]);
    expect(store.undo()).toBe("Title");
    expect(store.get().doc.title).toBe("");
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBe("Title");
    expect(store.get().doc.title).toBe("One");
    expect(store.redo()).toBe("Delete");
    expect(store.redo()).toBeNull();
  });

  it("a step that changes the title crosses the whole document; a canvas step does not", () => {
    const store = fresh();
    store.run(setTitle, { title: "Kept" }, { origin: "ai" });
    store.run(removeNodes, { ids: ["a"] }, { history: "step" });
    store.run(setTitle, { title: "Later" }, { history: "none" });
    store.undo();
    /* the delete's step held the canvas only: the title set since stays */
    expect(store.get().doc.title).toBe("Later");
    expect(ids(store.get())).toEqual(["g-a", "g-b"]);
    store.undo();
    expect(store.get().doc.title).toBe("");
  });

  it("transactions are all or nothing, and nested ones are part of the outer", () => {
    const store = fresh();
    expect(() =>
      store.transact("Turn", "ai", (tx) => {
        tx.run(setTitle, { title: "Half done" });
        tx.run(removeNodes, { ids: ["nope"] });
      }),
    ).toThrow(OpError);
    expect(store.get().doc.title).toBe("");
    expect(store.canUndo()).toBe(false);

    store.transact("Turn", "ai", (tx) => {
      tx.run(setTitle, { title: "A" });
      store.transact("inner", "ai", (inner) => inner.run(removeNodes, { ids: ["a"] }));
      /* a failed inner step is put back; the outer one goes on */
      try {
        store.transact("inner", "ai", (inner) => {
          inner.run(removeNodes, { ids: ["b"] });
          throw new Error("no");
        });
      } catch {}
    });
    expect(store.get().doc.title).toBe("A");
    expect(ids(store.get())).toEqual(["g-b"]);
    expect(store.history()).toEqual(["Turn"]);
    store.undo();
    expect(store.get().doc.title).toBe("");
    expect(ids(store.get())).toEqual(["g-a", "g-b"]);
  });

  it("coalesces edits of one key a moment apart, and not past the window", () => {
    let now = 1000;
    const store = fresh(undefined, { now: () => now });
    for (const label of ["H", "He", "Hel"]) {
      store.run(setItem, { id: "a", patch: { props: { label } } }, { history: { coalesce: "a:props" } });
      now += 300;
    }
    expect(store.history()).toHaveLength(1);
    now += 900;
    store.run(setItem, { id: "a", patch: { props: { label: "Hello" } } }, { history: { coalesce: "a:props" } });
    expect(store.history()).toHaveLength(2);
    store.run(setItem, { id: "b", patch: { props: { text: "x" } } }, { history: { coalesce: "b:props" } });
    expect(store.history()).toHaveLength(3);
    store.undo();
    store.undo();
    expect(store.get().doc.groups[0].items[0].props).toEqual({ label: "Hel" });
    store.undo();
    expect(store.get().doc.groups[0].items[0].props).toEqual({});
  });

  it("keeps at most HISTORY_MAX steps", () => {
    const store = fresh();
    for (let i = 0; i < HISTORY_MAX + 5; i++) store.run(setTitle, { title: `t${i}` }, { origin: "mcp" });
    expect(store.history()).toHaveLength(HISTORY_MAX);
  });

  it("an operation may ask for no step of its own: a theme patch that composes nothing anew", () => {
    const store = fresh();
    store.run(patchTheme, { patch: { contrast: "medium" } });
    expect(store.canUndo()).toBe(false);
    expect(store.get().doc.theme.contrast).toBe("medium");
  });

  it("a style is a whole step: an undo brings the whole document back", () => {
    const store = fresh();
    store.run(setItem, { id: "a", patch: { look: { opacity: 50, glass: 12 } } }, { history: "none" });
    const stripped = store.run(applyStyle, { style: "ios" });
    expect(stripped.stripped).toBeGreaterThanOrEqual(1);
    expect(store.get().doc.theme.style).toBe("ios");
    expect(store.get().doc.groups[0].items[0].look).toEqual({ opacity: 50 });
    store.undo();
    expect(store.get().doc.theme.style).toBeUndefined();
    expect(store.get().doc.groups[0].items[0].look).toEqual({ opacity: 50, glass: 12 });
  });

  it("holds every operation to the rules of a style the document is held to", () => {
    const store = fresh();
    store.run(applyStyle, { style: "wechat" });
    store.run(setItem, { id: "b", patch: { look: { opacity: 40, blur: 2, glass: 10 } } });
    expect(store.get().doc.groups.find((g) => g.id === "g-b")!.items[0].look).toEqual({ opacity: 40, blur: 2 });
  });

  it("a definition has a history of its own; closing it is one step of the document's", () => {
    const store = fresh();
    store.run(makeComponentOp, { ids: ["a"], name: "Card", id: "C1" });
    const before = savedDoc(store.get());
    store.openDefinition("C1");
    expect(store.get().editing?.id).toBe("C1");
    expect(store.get().doc.frames[0].id).toBe("def:C1");
    expect(store.canUndo()).toBe(false);
    store.run(setItem, { id: "a", patch: { props: { label: "Inside" } } });
    expect(store.canUndo()).toBe(true);
    store.undo();
    store.redo();
    store.closeDefinition();
    expect(store.get().editing).toBeNull();
    const def = store.get().doc.components![0];
    expect(def.groups[0].items[0].props).toEqual({ label: "Inside" });
    expect(store.history().at(-1)).toBe("Edit component");
    store.undo();
    expect(store.get().doc.components![0].groups[0].items[0].props).toEqual({});
    expect(savedDoc(store.get()).groups).toEqual(before.groups);
  });

  it("a whole step undone from inside a definition drops the definition's own redo steps", () => {
    const store = fresh();
    store.run(makeComponentOp, { ids: ["a"], name: "Card", id: "C1" });
    const docGroups = savedDoc(store.get()).groups.map((g) => g.id);
    store.openDefinition("C1");
    store.run(applyStyle, { style: "ios" });
    store.run(setItem, { id: "a", patch: { props: { label: "Inside" } } });
    store.undo();
    expect(store.canRedo()).toBe(true);
    /* the style's step: the definition ends with it, and only that step waits to be redone */
    expect(store.undo()).toBe("Style ios");
    expect(store.get().editing).toBeNull();
    expect(store.get().doc.theme.style).toBeUndefined();
    expect(store.redo()).toBe("Style ios");
    expect(store.get().doc.theme.style).toBe("ios");
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBeNull();
    expect(ids(store.get())).toEqual(docGroups);
  });

  it("saves the document's own screens while a definition is open", () => {
    const store = fresh();
    store.run(makeComponentOp, { ids: ["a"], id: "C1" });
    const screens = savedDoc(store.get()).frames;
    store.openDefinition("C1");
    expect(savedDoc(store.get()).frames).toEqual(screens);
  });

  it("a whole document opened is one step, and refuses what is no document", () => {
    const store = fresh();
    expect(() => store.replace({ nope: true })).toThrow(OpError);
    store.replace({ format: "m3e-project", version: 2, document: { groups: [part("z")], frames: [screen], paletteKey: "blue", frame: "phone", title: "Other", brief: "" } });
    expect(store.get().doc.title).toBe("Other");
    expect(ids(store.get())).toEqual(["g-z"]);
    store.undo();
    expect(store.get().doc.title).toBe("");
    expect(ids(store.get())).toEqual(["g-a", "g-b"]);
  });

  it("translates the canvas and the history to another language", () => {
    const seedRow: Group = { id: "g-r", x: 16, y: 168, axis: "y", items: [{ ...makeItem("app-bar"), id: "r", props: { title: "Inbox" } }] };
    const store = fresh([seedRow]);
    store.run(addScreen, {});
    store.translate("zh");
    expect(store.get().doc.groups[0].items[0].props?.title).toBe("收件箱");
    store.undo();
    expect(store.get().doc.groups[0].items[0].props?.title).toBe("收件箱");
    expect(store.get().doc.frames).toHaveLength(1);
  });

  it("selection and measures are the session's: no step, no document change", () => {
    const store = fresh();
    const seen: ChangeEvent[] = [];
    store.subscribe((e) => seen.push(e));
    store.select(["a"]);
    store.select((cur) => [...cur, "b"]);
    store.setWidths({ a: 80 });
    expect(store.get().session.selection).toEqual(["a", "b"]);
    expect(seen.map((e) => e.kind)).toEqual(["session", "session", "session"]);
    expect(store.canUndo()).toBe(false);
    const view = store.view();
    expect(store.view()).toBe(view);
  });

  it("ids are deterministic with an id source", () => {
    const a = fresh();
    const b = fresh();
    a.run(addPart, { slug: "box", screen: "F1" }, { origin: "ai" });
    b.run(addPart, { slug: "box", screen: "F1" }, { origin: "ai" });
    expect(savedDoc(a.get())).toEqual(savedDoc(b.get()));
  });

  it("checks the arguments of a caller other than the editor", () => {
    const store = fresh();
    expect(() => store.run(addPart, { slug: 3 } as never, { origin: "mcp" })).toThrow(/slug should be a string/);
    expect(() => store.run(addPart, { slug: "button", nope: 1 } as never, { origin: "mcp" })).toThrow(/nope is not an argument/);
    expect(() => store.run(setItem, { id: "a", patch: { props: { size: "huge" } } }, { origin: "ai" })).toThrow(/size should be one of/);
    expect(() => store.run(setItem, { id: "a", patch: { props: { nope: 1 } } }, { origin: "ai" })).toThrow(/has no prop "nope"/);
    expect(() => store.run(setItem, { id: "a", patch: { fill: "red" as never } }, { origin: "ai" })).toThrow(/color role/);
    /* the editor's own panels are trusted */
    store.run(setItem, { id: "a", patch: { props: { anything: 1 } } }, { origin: "user" });
    expect(store.get().doc.groups[0].items[0].props).toEqual({ anything: 1 });
  });

  it("an update has no step and belongs to the step before", () => {
    const store = fresh();
    store.run(setTitle, { title: "A" }, { origin: "ai" });
    store.update("layout", "system", (s) => withGroups(s, s.doc.groups.map((g) => ({ ...g, x: g.x + 4 }))));
    expect(store.history()).toHaveLength(1);
    store.undo();
    expect(store.get().doc.groups[0].x).toBe(16);
  });
});

describe("opening a document", () => {
  it("holds its screens to the largest size the operations allow, and leaves ones that fit as they were", () => {
    const store = fresh();
    const frames = [
      { id: "huge", name: "Huge", x: 0, y: 0, w: 10_000_000, h: 9_000, length: 1e9 },
      { id: "fine", name: "Fine", x: 400, y: 0, w: 1440, h: 900 },
    ];
    store.replace({ groups: [], frames, paletteKey: "purple", frame: "phone", title: "", brief: "" });
    const [huge, fine] = store.get().doc.frames;
    expect(huge).toMatchObject({ w: MAX_SCREEN, h: MAX_SCREEN, length: MAX_SCREEN_LENGTH });
    expect(fine).toEqual(frames[1]);
    const same = [{ id: "p", name: "Phone", x: 0, y: 0 }];
    store.load({ frames: same });
    expect(store.get().doc.frames).toBe(same);
  });
});
