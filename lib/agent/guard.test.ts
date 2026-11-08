/* The guard on taking away the author's work: a call that would remove much of it, which the request does not plainly
 * ask for, waits for the author's answer; declined (or with no one to ask) it does not run and the model is told to
 * keep the work and ask. Small removals, removals of what is selected and plainly asked-for ones go through. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { scriptedAdapter } from "../llm/testkit";
import { createRegistry } from "../tools";
import { GENERATE_TOOLS } from "../tools/generate";
import { plainlyAsksToRemove, removalOf, removalText, runTurn, type RemovalAsk, type TurnEvent } from ".";

beforeAll(() => setGlobalLang("zh"));

/** three screens of the author's, eight parts on each */
const app = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "zh" });
  s.transact("App", "user", (tx) => {
    for (const [id, name] of [["login", "登录"], ["home", "首页"], ["me", "我的"]]) {
      tx.run(ops.addScreen, { id, name });
      for (let i = 0; i < 8; i++) tx.run(ops.addPart, { slug: "text", id: `${id}-${i}`, screen: id, at: { x: 16, y: 80 + i * 40 }, props: { text: `${name} ${i}` } });
    }
  });
  s.select([]);
  return s;
};
const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });
const WIPE = call("c1", "apply_ops", { ops: [{ op: "clear", args: {} }, { op: "add_screen", args: { id: "new", name: "新首页" } }] });

describe("what plainly asks for a removal", () => {
  it("reads deletion words in four languages, and a wish to redo as not plain", () => {
    for (const r of ["Delete the settings screen", "clear the canvas", "把个人主页删掉", "このボタンを削除して", "이 화면 삭제해 줘"]) expect(plainlyAsksToRemove(r), r).toBe(true);
    for (const r of ["都不好看，全删了重做", "Delete it all and start over", "make the list into cards", "全部作り直して"]) expect(plainlyAsksToRemove(r), r).toBe(false);
  });
});

describe("what a call would take away", () => {
  it("counts screens and parts against how the turn found the document, leaving the selection out", async () => {
    const s = app();
    const start = s.get();
    const registry = createRegistry();
    const all = await removalOf(s, start, "clear", {}, { registry });
    expect(all).toMatchObject({ tool: "clear", parts: 24 });
    expect(all!.screens.map((x) => x.name)).toEqual(["登录", "首页", "我的"]);
    /* a few parts are not worth asking about; the selected ones are the author's to lose */
    expect(await removalOf(s, start, "remove_nodes", { ids: ["home-0", "home-1", "home-2"] }, { registry })).toBeNull();
    const twelve = ["home", "me"].flatMap((p) => Array.from({ length: 6 }, (_, i) => `${p}-${i}`));
    expect((await removalOf(s, start, "remove_nodes", { ids: twelve }, { registry }))?.parts).toBe(12);
    expect(await removalOf(s, start, "remove_nodes", { ids: twelve }, { registry, selection: twelve })).toBeNull();
    /* nothing is changed by finding out */
    expect(s.get()).toBe(start);
    /* what does not take anything away is not asked about at all */
    expect(await removalOf(s, start, "add_screen", { name: "x" }, { registry })).toBeNull();
  });
});

describe("what a call takes away under a name that does not say so", () => {
  /** the app, with a collection, a variable collection with two modes, a style and an icon of the author's */
  const rich = () => {
    const s = app();
    s.transact("Data", "user", (tx) => {
      tx.run(ops.addCollection, { id: "fruit", name: "Fruit", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear", "2"], ["Fig", "3"]] });
      tx.run(ops.addVarCollection, { id: "theme", name: "Theme", modes: ["Light", "Dark"] });
      tx.run(ops.addCustomStyle, { style: { key: "custom:mine", name: "Mine", seed: "#336699" } });
      tx.run(ops.setIcon, { id: "leaf", svg: '<svg viewBox="0 0 24 24"><path d="M4 20C4 9 11 4 20 4c0 9-5 16-16 16z"/></svg>' });
    });
    return s;
  };

  it("names rows, modes, a replaced style and a redrawn icon, against how the turn found the document", async () => {
    const s = rich();
    const start = s.get();
    const registry = createRegistry();
    const rows = await removalOf(s, start, "update_collection", { id: "fruit", rows: [] }, { registry });
    expect(rows?.takes).toEqual([{ kind: "rows", of: "Fruit", n: 3, total: 3 }]);
    expect(removalText(rows!)).toMatch(/3 of the 3 rows of "Fruit"/);
    const modes = start.doc.varCollections![0].modes;
    expect((await removalOf(s, start, "update_var_collection", { id: "theme", modes: [{ id: modes[0].id, name: "Light" }] }, { registry }))?.takes).toEqual([{ kind: "modes", of: "Theme", names: ["Dark"] }]);
    expect((await removalOf(s, start, "add_custom_style", { style: { key: "custom:mine", name: "Mine", seed: "#993333" } }, { registry }))?.takes).toEqual([{ kind: "style", name: "custom:mine", replaced: true }]);
    expect((await removalOf(s, start, "set_icon", { id: "leaf", svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>' }, { registry }))?.takes).toEqual([{ kind: "icon", name: "svg:leaf", replaced: true }]);
    /* adding takes nothing away; what the turn made itself is its own to change */
    expect(await removalOf(s, start, "update_collection", { id: "fruit", rows: [["Apple", "1"], ["Pear", "2"], ["Fig", "3"], ["Kiwi", "4"]] }, { registry })).toBeNull();
    s.run(ops.addCustomStyle, { style: { key: "custom:new", name: "New", seed: "#336699" } }, { origin: "ai" });
    expect(await removalOf(s, start, "add_custom_style", { style: { key: "custom:new", name: "New", seed: "#993333" } }, { registry })).toBeNull();
    /* parts moved into a component are not lost */
    expect(await removalOf(s, start, "make_component", { ids: ["home-0", "home-1", "home-2", "home-3", "home-4", "home-5", "home-6", "home-7"] }, { registry })).toBeNull();
  });

  it("reads what a generative call would replace from its arguments, without drawing", async () => {
    const s = rich();
    const start = s.get();
    const registry = createRegistry({ extra: GENERATE_TOOLS });
    expect((await removalOf(s, start, "generate_style", { refine: "custom:mine", feedback: "warmer" }, { registry }))?.takes).toEqual([{ kind: "style", name: "custom:mine", replaced: true }]);
    expect((await removalOf(s, start, "generate_svg", { prompt: "a leaf", icon: "svg:leaf" }, { registry }))?.takes).toEqual([{ kind: "icon", name: "svg:leaf", replaced: true }]);
    expect(await removalOf(s, start, "generate_svg", { prompt: "a cup", icon: "cup" }, { registry })).toBeNull();
    expect(await removalOf(s, start, "generate_style", { description: "warm paper" }, { registry })).toBeNull();
  });

  it("pauses the turn for them as for a removal, and keeps the rows when the author declines", async () => {
    const s = rich();
    const asked: RemovalAsk[] = [];
    const adapter = scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "update_collection", args: { id: "fruit", rows: [["Apple", "1"]] } }] })] }, { text: "Kept." }]);
    await runTurn({ store: s, adapter, history: [], request: "make the fruit list shorter", lang: "zh", confirm: (ask) => (asked.push(ask), false) });
    expect(asked[0].takes).toEqual([{ kind: "rows", of: "Fruit", n: 2, total: 3 }]);
    expect(s.get().doc.collections![0].rows).toHaveLength(3);
    const result = adapter.requests[1].messages.at(-1) as { results: { content: { text: string }[] }[] };
    expect(result.results[0].content[0].text).toMatch(/"code":"declined".*2 of the 3 rows of \\"Fruit\\"/);
    /* asked plainly, it goes through */
    let asks = 0;
    await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "update_collection", args: { id: "fruit", rows: [] } }] })] }, { text: "Cleared." }]), history: [], request: "remove every fruit", lang: "zh", confirm: () => (asks++, false) });
    expect(asks).toBe(0);
    expect(s.get().doc.collections![0].rows).toHaveLength(0);
  });
});

describe("a turn that would wipe the author's work", () => {
  it("asks the author, and keeps the work when they decline; the model is told to ask instead", async () => {
    const s = app();
    const adapter = scriptedAdapter([{ calls: [WIPE] }, { text: "要先确认一下：删掉这 3 个页面重做，还是保留内容只改样式？" }]);
    const asked: RemovalAsk[] = [];
    const events: TurnEvent[] = [];
    const r = await runTurn({ store: s, adapter, history: [], request: "都不好看，全删了重做", lang: "zh", confirm: (ask) => (asked.push(ask), false), onEvent: (e) => events.push(e) });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ tool: "apply_ops", parts: 24 });
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["login", "home", "me"]);
    expect(r.changed).toBe(false);
    const result = adapter.requests[1].messages.at(-1) as { role: string; results: { content: { text: string }[]; isError?: boolean }[] };
    expect(result.results[0].isError).toBe(true);
    expect(result.results[0].content[0].text).toMatch(/"code":"declined".*3 screens.*24 parts/);
    expect(events.filter((e) => e.type === "ask" || e.type === "answer").map((e) => e.type)).toEqual(["ask", "answer"]);
    expect(r.text).toMatch(/？$/);
  });

  it("declines with no one to ask, and goes ahead once the author allows it", async () => {
    const lone = app();
    await runTurn({ store: lone, adapter: scriptedAdapter([{ calls: [WIPE] }, { text: "Asked." }]), history: [], request: "redo it all", lang: "zh" });
    expect(lone.get().doc.frames).toHaveLength(3);

    const s = app();
    const second = call("c2", "apply_ops", { ops: [{ op: "add_screen", args: { id: "x", name: "X" } }, { op: "remove_screen", args: { id: "new" } }] });
    let asks = 0;
    const r = await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [WIPE] }, { calls: [second] }, { text: "Done." }]), history: [], request: "都不好看，全删了重做", lang: "zh", confirm: () => (asks++, true) });
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["x"]);
    /* allowed once, the turn is not asked again */
    expect(asks).toBe(1);
    expect(r.changed).toBe(true);
  });

  it("does not ask when the request plainly asks for it, or the removal is small", async () => {
    const s = app();
    let asks = 0;
    await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "me" } }] })] }, { text: "Removed." }]), history: [], request: "删除“我的”页面", lang: "zh", confirm: () => (asks++, false) });
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["login", "home"]);
    await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [call("c1", "remove_nodes", { ids: ["home-0", "home-1"] })] }, { text: "Tidied." }]), history: [], request: "tidy the home screen", lang: "zh", confirm: () => (asks++, false) });
    expect(s.get().doc.groups.some((g) => g.items.some((it) => it.id === "home-0"))).toBe(false);
    expect(asks).toBe(0);
  });
});

describe("what an answer allows (report 13.3 AI-1)", () => {
  it("reads a request that says not to remove as not asking for it", () => {
    for (const r of ["不要删除现有内容，在旁边加一个设置页", "别删任何东西，只改颜色", "Don't delete anything, just add a button", "Do not remove the old screens", "既存の画面は削除しないで", "기존 화면은 삭제하지 마세요"]) expect(plainlyAsksToRemove(r), r).toBe(false);
  });

  it("asks for a removal under a request that says not to remove", async () => {
    const s = app();
    let asks = 0;
    await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "me" } }] })] }, { text: "Asked." }]), history: [], request: "不要删除现有内容，把“我的”页面做好看", lang: "zh", confirm: () => (asks++, false) });
    expect(asks).toBe(1);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["login", "home", "me"]);
  });

  it("lets a plain request remove only what it names", async () => {
    const s = app();
    const asked: RemovalAsk[] = [];
    const calls = [call("c1", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "me" } }] }), call("c2", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "login" } }] })];
    await runTurn({ store: s, adapter: scriptedAdapter([{ calls }, { text: "Done." }]), history: [], request: "删除“我的”页面", lang: "zh", confirm: (ask) => (asked.push(ask), false) });
    expect(asked.map((a) => a.screens.map((x) => x.name))).toEqual([["登录"]]);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["login", "home"]);
  });

  it("allows only what was allowed: a later removal of something else is asked about again", async () => {
    const s = app();
    const asked: RemovalAsk[] = [];
    const adapter = scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "login" } }] })] }, { calls: [call("c2", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "me" } }] })] }, { text: "Done." }]);
    await runTurn({ store: s, adapter, history: [], request: "redo it all", lang: "zh", confirm: (ask) => (asked.push(ask), asked.length === 1) });
    expect(asked.map((a) => a.screens.map((x) => x.id))).toEqual([["login"], ["me"]]);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home", "me"]);
  });

  it("asks again when the author's work grew while they were asked, and binds the answer to what they saw", async () => {
    for (const second of [true, false]) {
      const s = app();
      const asked: RemovalAsk[] = [];
      await runTurn({
        store: s,
        adapter: scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "clear", args: {} }] })] }, { text: "Done." }]),
        history: [],
        request: "redo it all",
        lang: "zh",
        confirm: (ask) => {
          asked.push(ask);
          /* the author adds a screen while the question is open */
          if (asked.length === 1) s.run(ops.addScreen, { id: "late", name: "新的" }, { origin: "user" });
          return asked.length === 1 || second;
        },
      });
      expect(asked.map((a) => a.screens.map((x) => x.id))).toEqual([["login", "home", "me"], ["late"]]);
      expect(s.get().doc.frames.map((f) => f.id)).toEqual(second ? [] : ["login", "home", "me", "late"]);
    }
  });

  it("does not run a call whose check failed, and tells the model why", async () => {
    const s = app();
    /* a value the check cannot read (no document holds one: it stands in for a check that throws) */
    s.update("Odd", "user", (st) => ({ ...st, doc: { ...st.doc, varCollections: [{ id: "theme", name: "Theme", modes: "broken" } as never] } }));
    const adapter = scriptedAdapter([{ calls: [call("c1", "apply_ops", { ops: [{ op: "set_title", args: { title: "New" } }] })] }, { text: "Could not." }]);
    await runTurn({ store: s, adapter, history: [], request: "rename it", lang: "zh", confirm: () => true });
    expect(s.get().doc.title).toBe("");
    const result = adapter.requests[1].messages.at(-1) as { results: { content: { text: string }[]; isError?: boolean }[] };
    expect(result.results[0].isError).toBe(true);
    expect(result.results[0].content[0].text).toContain("could not be checked");
    await expect(removalOf(s, s.get(), "set_title", { title: "New" }, { registry: createRegistry() })).rejects.toThrow();
  });

  it("counts what the turn made itself as its own however many calls made it", async () => {
    const s = app();
    let asks = 0;
    const adapter = scriptedAdapter([
      { calls: [call("c1", "add_screen", { id: "x", name: "X" })] },
      { calls: [call("c2", "add_screen", { id: "y", name: "Y" })] },
      { calls: [call("c3", "apply_ops", { ops: [{ op: "remove_screen", args: { id: "x" } }, { op: "remove_screen", args: { id: "y" } }] })] },
      { text: "Tried and took them away again." },
    ]);
    await runTurn({ store: s, adapter, history: [], request: "try two screens", lang: "zh", confirm: () => (asks++, false) });
    expect(asks).toBe(0);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["login", "home", "me"]);
  });

  it("names rows written over as many as there were, and not rows edited or reordered", async () => {
    const s = app();
    s.run(ops.addCollection, { id: "fruit", name: "Fruit", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear", "2"], ["Fig", "3"]] }, { origin: "user" });
    const start = s.get();
    const registry = createRegistry();
    const replaced = await removalOf(s, start, "update_collection", { id: "fruit", rows: [["Kiwi", "4"], ["Plum", "5"], ["Lime", "6"]] }, { registry });
    expect(replaced?.takes).toEqual([{ kind: "rows", of: "Fruit", n: 3, total: 3, replaced: true }]);
    expect(removalText(replaced!)).toMatch(/3 of the 3 rows of "Fruit" \(written over/);
    expect(await removalOf(s, start, "update_collection", { id: "fruit", rows: [["Apple", "1.5"], ["Pear", "2.5"], ["Fig", "3"]] }, { registry })).toBeNull();
    expect(await removalOf(s, start, "update_collection", { id: "fruit", rows: [["Fig", "3"], ["Apple", "1"], ["Pear", "2"]] }, { registry })).toBeNull();
  });
});
