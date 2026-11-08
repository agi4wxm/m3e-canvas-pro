/* One rule a field, two outcomes (lib/rules.ts, report 8.6): what reading a file drops is what an operation refuses,
 * in the same words; where they differ (what a value points at, whether an expression parses) is on purpose. And the
 * references a tap holds are kept up the same way wherever they are (lib/refs.ts): a copy follows what it copied, a
 * screen deleted takes its links with it, at every depth. */

import { beforeAll, describe, expect, it } from "vitest";
import { DocStore, ops, savedDoc, stateOf } from "./core";
import { openProject } from "./project";
import { bindRule, conditionRule, exprRule } from "./rules";
import { EXPR_LIMITS } from "./bindings/expr";
import { setGlobalLang } from "./i18n";
import { makeItem, type Action, type Condition, type Doc, type Group } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const part = (id: string, slug: string, extra: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x: 16, y: 100, axis: "x", items: [{ ...makeItem(slug), id, ...extra }] });
const screens = [
  { id: "home", name: "Home", x: 0, y: 0 },
  { id: "next", name: "Next", x: 600, y: 0 },
];
const docWith = (groups: Group[], extra: Partial<Doc> = {}): Doc => ({ title: "T", brief: "", paletteKey: "purple", frame: "phone", frames: screens, groups, vars: [{ id: "on", name: "on", type: "bool", value: false }], ...extra }) as Doc;
const storeOf = (doc: Doc) => new DocStore(stateOf(doc));
const tapOn = (doc: Doc, id: string): Action | undefined => doc.groups.flatMap((g) => g.items).find((it) => it.id === id)?.action;

describe("one rule for a condition", () => {
  const cases: [string, unknown][] = [
    ["a variable", { var: "on", op: "eq", value: true }],
    ["a field of the row", { var: "row.title", op: "eq", value: "First" }],
    ["a filled part", { filled: "b" }],
    ["an expression", { expr: "vars.on" }],
    ["no object", "on"],
    ["no var", { var: 3, op: "eq", value: 1 }],
    ["another op", { var: "on", op: "gt", value: 1 }],
    ["a value of no kind", { var: "on", op: "eq", value: {} }],
    ["an empty expression", { expr: " " }],
    ["too long an expression", { expr: "1".repeat(EXPR_LIMITS.length + 1) }],
  ];

  it.each(cases)("reading drops %s exactly when an operation refuses its shape, in the same words", (_, when) => {
    const rule = conditionRule(when);
    const opened = openProject(docWith([part("b", "button", { action: { to: "none", transition: "none", when } })]))!;
    expect(tapOn(opened, "b")?.when === undefined).toBe(rule !== null);
    const store = storeOf(docWith([part("b", "button")]));
    const run = () => store.run(ops.setAction, { id: "b", action: { to: "none", transition: "none", when: when as Condition } }, { origin: "mcp" });
    if (rule) expect(run).toThrow(rule);
    else expect(run).not.toThrow();
  });

  it("takes a field of the row, as the guide says, where it took only the document's variables", () => {
    const store = storeOf(docWith([part("b", "button")]));
    store.run(ops.setAction, { id: "b", action: { to: "next", transition: "slide", when: { var: "row.title", op: "eq", value: "First" } } }, { origin: "mcp" });
    expect(tapOn(savedDoc(store.get()), "b")?.when).toEqual({ var: "row.title", op: "eq", value: "First" });
    /* a variable that is not there is still refused: a stale reference is the operation's to catch */
    expect(() => store.run(ops.setAction, { id: "b", action: { to: "none", transition: "none", when: { var: "gone", op: "eq", value: 1 } } }, { origin: "mcp" })).toThrow(/no variable "gone"/);
  });
});

describe("one rule for a binding", () => {
  const long = `=${"1+".repeat(EXPR_LIMITS.length / 2)}1`;

  it("holds an expression bound to a prop to the length of any other, reading a file and in an operation", () => {
    expect(bindRule(long)).toBe(exprRule(long.slice(1)));
    expect(bindRule("=title")).toBeNull();
    expect(bindRule("on")).toBeNull();
    const opened = openProject(docWith([part("t", "text", { bind: { text: long, label: "=ok", other: "on" } })]))!;
    expect(opened.groups[0].items[0].bind).toEqual({ label: "=ok", other: "on" });
    const store = storeOf(docWith([part("t", "text")]));
    expect(() => store.run(ops.setItem, { id: "t", patch: { bind: { text: long } } }, { origin: "mcp" })).toThrow(/longer than/);
  });
});

describe("the references a tap holds", () => {
  /* a form whose button submits it and scrolls to a part beside it, and whose answer shows that part */
  const form = (): Group[] => [
    { id: "form", x: 16, y: 100, axis: "y", form: { operationId: "send" }, items: [{ ...makeItem("box"), id: "box", props: { layout: "column" } }] },
    { id: "g-note", x: 16, y: 300, axis: "x", inFlow: "form", items: [{ ...makeItem("text"), id: "note", props: { text: "Sent" } }] },
    {
      id: "g-send",
      x: 16,
      y: 340,
      axis: "x",
      inFlow: "form",
      items: [
        {
          ...makeItem("button"),
          id: "send",
          // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
          action: { to: "none", transition: "none", scrollTo: "note", when: { filled: "note" }, effects: [{ do: "submit", form: "form" }, { do: "call", operationId: "send", then: { to: "none", transition: "none", effects: [{ do: "show", part: "note" }] }, catch: { to: "next", transition: "slide", effects: [{ do: "hide", part: "note" }] } }] },
        },
      ],
    },
  ];

  it("follow a copy to what was copied with it: the part it scrolls to, the form it submits, a call's answer", () => {
    const store = storeOf(docWith(form()));
    store.run(ops.duplicateNodes, { ids: ["box"] });
    const doc = savedDoc(store.get());
    const items = doc.groups.flatMap((g) => g.items);
    /* the copies of the button, the note and the form */
    const send = items.find((it) => it.id !== "send" && it.component === "button")!;
    const note = items.find((it) => it.id !== "note" && it.component === "text")!.id;
    const formCopy = doc.groups.find((g) => g.form && g.id !== "form")!.id;
    const a = send.action!;
    expect(a.scrollTo).toBe(note);
    expect(a.when).toEqual({ filled: note });
    expect(a.effects![0]).toEqual({ do: "submit", form: formCopy });
    const call = a.effects![1] as Extract<NonNullable<Action["effects"]>[number], { do: "call" }>;
    expect(call.then!.effects).toEqual([{ do: "show", part: note }]);
    expect(call.catch!.effects).toEqual([{ do: "hide", part: note }]);
    /* the original still points at its own */
    expect(tapOn(doc, "send")!.scrollTo).toBe("note");
  });

  it("go with a screen that is deleted, however deep they are: a call's answer, a form's", () => {
    const groups = form();
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    groups[0] = { ...groups[0], form: { operationId: "send", then: { to: "next", transition: "slide", effects: [{ do: "snackbar", message: "ok" }] } } };
    const store = storeOf(docWith(groups));
    store.run(ops.removeScreen, { id: "next" });
    const doc = savedDoc(store.get());
    const call = tapOn(doc, "send")!.effects![1] as Extract<NonNullable<Action["effects"]>[number], { do: "call" }>;
    expect(call.catch).toEqual({ to: "none", transition: "none", effects: [{ do: "hide", part: "note" }] });
    expect(doc.groups.find((g) => g.id === "form")!.form!.then).toEqual({ to: "none", transition: "none", effects: [{ do: "snackbar", message: "ok" }] });
    expect(JSON.stringify(doc)).not.toContain('"next"');
  });
});
