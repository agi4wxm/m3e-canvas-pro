/* Where an answer of the author's model may land (report 13.3 AI-3): only on the field it was asked for, as it was. */

import { describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "@/lib/core";
import { AnswerDesk, partIn, screenIn } from "./aiLanding";

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  s.run(ops.addPart, { slug: "button", id: "buy", screen: "home", at: { x: 16, y: 80 } }, { origin: "user" });
  return s;
};
const note = (id: string) => (s: ReturnType<DocStore["get"]>) => partIn(s, id)?.note;
const setNote = (s: DocStore, id: string, text: string) => s.update("Note", "user", (st) => ({ ...st, doc: { ...st.doc, groups: st.doc.groups.map((g) => ({ ...g, items: g.items.map((it) => (it.id === id ? { ...it, note: text } : it)) })) } }));
/** an answer that takes a while */
const later = () => new Promise<void>((r) => setTimeout(r, 5));

describe("an answer of the author's model", () => {
  it("lands when it comes late on a field nobody touched", async () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const ticket = desk.take({ kind: "part", id: "buy" }, note("buy"));
    s.run(ops.addScreen, { id: "other", name: "Other" }, { origin: "user" });
    await later();
    expect(desk.check(ticket)).toBe("land");
  });

  it("waits for the author when they edited the field meanwhile", async () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const ticket = desk.take({ kind: "part", id: "buy" }, note("buy"));
    setNote(s, "buy", "Mine");
    await later();
    expect(desk.check(ticket)).toBe("edited");
    /* the answer is kept: the author may still put it in */
    expect(desk.present(ticket)).toBe(true);
  });

  it("goes when the part was deleted, even if another was made under the same id", async () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const ticket = desk.take({ kind: "part", id: "buy" }, note("buy"));
    s.run(ops.removeNodes, { ids: ["buy"] }, { origin: "user" });
    s.run(ops.addPart, { slug: "button", id: "buy", screen: "home", at: { x: 16, y: 80 } }, { origin: "user" });
    await later();
    expect(partIn(s.get(), "buy")).toBeDefined();
    expect(desk.check(ticket)).toBe("gone");
    expect(desk.present(ticket)).toBe(false);
  });

  it("goes when another document or draft took the canvas, even with the same ids", async () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const ticket = desk.take({ kind: "screen", id: "home" }, (st) => screenIn(st, "home")?.note);
    s.replace(savedDoc(s.get()), { trusted: true, label: "Draft" });
    await later();
    expect(screenIn(s.get(), "home")).toBeDefined();
    expect(desk.check(ticket)).toBe("gone");
  });

  it("leaves the newer of two requests about one field to land", async () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const first = desk.take({ kind: "part", id: "buy" }, note("buy"));
    const second = desk.take({ kind: "part", id: "buy" }, note("buy"));
    await later();
    expect(desk.check(first)).toBe("superseded");
    expect(desk.check(second)).toBe("land");
  });

  it("stops following when disposed", () => {
    const s = store();
    const desk = new AnswerDesk(s);
    const ticket = desk.take({ kind: "part", id: "buy" }, note("buy"));
    desk.dispose();
    expect(desk.check(ticket)).toBe("gone");
  });
});
