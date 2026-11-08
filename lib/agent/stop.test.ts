/* Stopping a turn the author edited in (report 13.3 AI-2): the turn's own changes go back, the author's stay, the
 * panel is told exactly how much went back, and neither undo, redo nor the next request brings the stopped work back. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { scriptedAdapter, type ScriptedTurn } from "../llm/testkit";
import type { LlmRequest } from "../llm";
import { runTurn } from ".";

beforeAll(() => setGlobalLang("en"));

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  s.run(ops.addPart, { slug: "text", id: "title", screen: "home", at: { x: 16, y: 80 }, props: { text: "Mine" } }, { origin: "user" });
  return s;
};
const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });
const textOf = (s: DocStore, id: string) => s.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === id)?.props?.text;
const has = (s: DocStore, id: string) => s.get().doc.groups.some((g) => g.items.some((it) => it.id === id));

/** A turn that makes change A, lets the author make B, makes C, and is stopped while it thinks about the next step. */
function interleaved(s: DocStore, a: ScriptedTurn, b: () => void, c: ScriptedTurn) {
  const ac = new AbortController();
  const adapter = scriptedAdapter([
    a,
    (req: LlmRequest) => {
      void req;
      b();
      return c;
    },
    () => {
      ac.abort();
      return { text: "Next…" };
    },
  ]);
  return { adapter, signal: ac.signal };
}

describe("stopping a turn the author edited in", () => {
  it("takes back the turn's A and C, keeps the author's B, and says all of it went back", async () => {
    const s = store();
    const start = savedDoc(s.get());
    const steps = s.history().length;
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "add_screen", { id: "a", name: "A" })] },
      () => s.run(ops.addPart, { slug: "button", id: "mine", screen: "home", at: { x: 16, y: 200 } }, { origin: "user" }),
      { calls: [call("c2", "set_props", { id: "title", props: { text: "AI words" } })] },
    );
    const r = await runTurn({ store: s, adapter, history: [], request: "redo the app", lang: "en", signal });
    expect(r.stop).toBe("aborted");
    expect(r.revert).toMatchObject({ outcome: "full", authorEdited: true, kept: [] });
    expect(r.rolledBack).toBe(true);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(textOf(s, "title")).toBe("Mine");
    expect(has(s, "mine")).toBe(true);
    /* the history: the turn's steps are gone, the author's is there without the turn's changes in it */
    expect(s.history().length).toBe(steps + 1);
    expect(s.redo()).toBeNull();
    s.undo();
    expect(savedDoc(s.get())).toEqual(start);
    s.redo();
    expect(has(s, "mine")).toBe(true);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(textOf(s, "title")).toBe("Mine");
  });

  it("keeps what the author changed after the turn did, and names it", async () => {
    const s = store();
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "set_props", { id: "title", props: { text: "AI words" } })] },
      () => s.run(ops.setProps, { id: "title", props: { text: "My words now" } }, { origin: "user" }),
      { calls: [call("c2", "add_screen", { id: "c", name: "C" })] },
    );
    const r = await runTurn({ store: s, adapter, history: [], request: "polish", lang: "en", signal });
    expect(r.revert?.outcome).toBe("partial");
    expect(r.revert?.kept).toEqual([expect.objectContaining({ kind: "part", why: "edited", name: "My words now" })]);
    expect(r.rolledBack).toBe(false);
    expect(textOf(s, "title")).toBe("My words now");
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });

  it("keeps what the turn added when the author built on it", async () => {
    const s = store();
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "add_part", { slug: "box", id: "panel", screen: "home", at: { x: 16, y: 300 } })] },
      () => s.run(ops.addPart, { slug: "text", id: "inside", into: { container: "panel" }, props: { text: "Mine inside" } }, { origin: "user" }),
      { calls: [call("c2", "add_screen", { id: "c", name: "C" })] },
    );
    const r = await runTurn({ store: s, adapter, history: [], request: "add a panel", lang: "en", signal });
    expect(r.revert?.outcome).toBe("partial");
    expect(r.revert?.kept.map((k) => k.why)).toEqual(["used"]);
    expect(has(s, "panel")).toBe(true);
    expect(has(s, "inside")).toBe(true);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });

  it("brings nothing back when the author had undone the turn's step before the stop", async () => {
    const s = store();
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "add_screen", { id: "a", name: "A" })] },
      () => s.undo(),
      { calls: [call("c2", "get_outline", {})] },
    );
    const r = await runTurn({ store: s, adapter, history: [], request: "x", lang: "en", signal });
    expect(r.stop).toBe("aborted");
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    /* what the author undid would have been redone with the turn's screen in it */
    expect(s.redo()).toBeNull();
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });

  it("counts the editor's own upkeep as nobody's edit, and a gesture after a step as the author's", async () => {
    const move = (s: DocStore, id: string, dx: number) => s.update("Canvas", "user", (st) => ({ ...st, doc: { ...st.doc, groups: st.doc.groups.map((g) => (g.items.some((it) => it.id === id) ? { ...g, x: g.x + dx } : g)) } }));
    /* the canvas settling what the turn added (no step taken: it is not the author's) */
    const s = store();
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "add_part", { slug: "button", id: "theirs", screen: "home", at: { x: 16, y: 300 } })] },
      () => move(s, "theirs", 4),
      { calls: [call("c2", "add_screen", { id: "c", name: "C" })] },
    );
    const r = await runTurn({ store: s, adapter, history: [], request: "x", lang: "en", signal });
    expect(r.revert).toMatchObject({ outcome: "full", authorEdited: false });
    expect(has(s, "theirs")).toBe(false);
    /* the author dragging it (a step taken first) is theirs: it stays */
    const t = store();
    const two = interleaved(
      t,
      { calls: [call("c1", "add_part", { slug: "button", id: "theirs", screen: "home", at: { x: 16, y: 300 } })] },
      () => {
        t.checkpoint("Move");
        move(t, "theirs", 40);
        move(t, "theirs", 40);
      },
      { calls: [call("c2", "add_screen", { id: "c", name: "C" })] },
    );
    const r2 = await runTurn({ store: t, adapter: two.adapter, history: [], request: "x", lang: "en", signal: two.signal });
    expect(r2.revert).toMatchObject({ outcome: "partial", authorEdited: true });
    expect(has(t, "theirs")).toBe(true);
    expect(t.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });

  it("does not hand the stopped work to the next request", async () => {
    const s = store();
    const history = [{ role: "user" as const, content: "earlier" }];
    const { adapter, signal } = interleaved(
      s,
      { calls: [call("c1", "add_screen", { id: "a", name: "A" })] },
      () => s.run(ops.setTitle, { title: "Mine" }, { origin: "user" }),
      { calls: [call("c2", "add_screen", { id: "c", name: "C" })] },
    );
    const r = await runTurn({ store: s, adapter, history, request: "two screens", lang: "en", signal });
    expect(r.messages).toBe(history);
    const next = scriptedAdapter([{ text: "Hello." }]);
    await runTurn({ store: s, adapter: next, history: r.messages, request: "hi", lang: "en" });
    expect(JSON.stringify(next.requests[0].messages)).not.toContain('"c2"');
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(s.get().doc.title).toBe("Mine");
  });
});
