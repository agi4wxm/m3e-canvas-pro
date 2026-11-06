/* The guard on taking away the author's work: a call that would remove much of it, which the request does not plainly
 * ask for, waits for the author's answer; declined (or with no one to ask) it does not run and the model is told to
 * keep the work and ask. Small removals, removals of what is selected and plainly asked-for ones go through. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { scriptedAdapter } from "../llm/testkit";
import { createRegistry } from "../tools";
import { plainlyAsksToRemove, removalOf, runTurn, type RemovalAsk, type TurnEvent } from ".";

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
