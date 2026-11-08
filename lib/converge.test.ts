/* Version 3 (lib/converge.ts): each written form it converges, on every place a document holds one, and that every
 * reader does with the converged document what it did before: the preview's conditions and the interpreter's, the
 * moves the preview plays, the web prototype an old file exports to. The contract every step keeps (pure, keeps what
 * it does not know, idempotent, a document for every old file) and the old files' behaviour are in
 * lib/migrations.test.ts. */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { bodyTransition, CONVERGE, conditionValue, convergeBindings, convergeConditions, convergeTransitions, itemBind } from "./converge";
import { MIGRATIONS, PROJECT_VERSION } from "./migrations";
import { loadDocument, PROJECT_FORMAT } from "./project";
import { serializeProject } from "./core/projectFile";
import { applyEffects, chooseBranch, conditionHolds, goneIds, liveItem, startState } from "./interact";
import { screenPoses, type Transition } from "./screenMotion";
import { buildProject } from "./exportProject";
import { setGlobalLang } from "./i18n";
import { makeItem, type Condition, type Doc, type DocVar } from "./tokens";
import { guessMeasurer } from "./core/op";
import { counterIds, DocStore } from "./core/store";
import { stateOf } from "./core/state";
import * as ops from "./core/ops";

beforeAll(() => setGlobalLang("en"));

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "component", component: "button", label: "", icon: null, variant: "filled", ...extra });
const doc = (groups: unknown[], extra: Record<string, unknown> = {}) => ({ title: "T", frames: [{ id: "a", name: "A", x: 0, y: 0 }], groups, ...extra });
const group = (id: string, items: unknown[], extra: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, axis: "x", items, ...extra });

describe("transitions", () => {
  it("are the nearest older kind of the motion beside them, whatever they said", () => {
    expect(bodyTransition({ to: "a", transition: "fade", motion: { kind: "push", dir: "up", ms: 300 } })).toEqual({ to: "a", transition: "slideUp", motion: { kind: "push", dir: "up", ms: 300 } });
    expect(bodyTransition({ to: "a", transition: "slide", motion: { kind: "instant" } }).transition).toBe("none");
    expect(bodyTransition({ to: "a", transition: "none", motion: { kind: "dissolve" } }).transition).toBe("fade");
    expect(bodyTransition({ to: "a", motion: { kind: "slide", dir: "right" } }).transition).toBe("slideLeft");
  });

  it("are slide where a tap says none (none where it goes to no screen), and an older one stays as it was", () => {
    expect(bodyTransition({ to: "a" })).toEqual({ to: "a", transition: "slide" });
    expect(bodyTransition({ to: "a", transition: "zoom" }).transition).toBe("slide");
    expect(bodyTransition({ to: "none" }).transition).toBe("none");
    expect(bodyTransition({ to: "back" }).transition).toBe("none");
    for (const t of ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"]) {
      const b = { to: "a", transition: t };
      expect(bodyTransition(b)).toBe(b);
    }
    /* a motion of a kind this version does not know is no motion any reader plays */
    expect(bodyTransition({ to: "a", transition: "fade", motion: { kind: "spin" } }).transition).toBe("fade");
  });

  it("are converged on every body a document holds: a tap, a place's, its else, a call's answers at any depth, a form's answers, inside components", () => {
    // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
    const deep = { to: "none", effects: [{ do: "call", operationId: "x", then: { to: "a", motion: { kind: "instant" }, effects: [{ do: "invoke", capability: "c", catch: { to: "a" } }] } }] };
    // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
    const d = doc([group("g", [item("b", { action: { ...deep, else: { to: "a", transition: "fade", motion: { kind: "slide", dir: "down" } } }, actions: { "tab:0": { to: "a" } } })], { form: { operationId: "f", then: { to: "a" }, catch: { to: "none" } } })], { components: [{ id: "c", name: "C", w: 1, h: 1, groups: [group("cg", [item("cb", { action: { to: "a" } })])] }] });
    const out = convergeTransitions(d) as typeof d & Record<string, never>;
    const b = (out.groups[0] as { items: Record<string, any>[] }).items[0];
    expect(b.action.transition).toBe("none");
    expect(b.action.effects[0].then.transition).toBe("none");
    expect(b.action.effects[0].then.effects[0].catch.transition).toBe("slide");
    expect(b.action.else.transition).toBe("slideDown");
    expect(b.actions["tab:0"].transition).toBe("slide");
    // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
    expect((out.groups[0] as Record<string, any>).form).toEqual({ operationId: "f", then: { to: "a", transition: "slide" }, catch: { to: "none", transition: "none" } });
    expect((out.components as Record<string, any>[])[0].groups[0].items[0].action.transition).toBe("slide");
  });

  it("play as they did in the preview wherever a motion is given: the motion is what plays, there and back", () => {
    const bodies = [
      { transition: "fade", motion: { kind: "push", dir: "up", ms: 300 } },
      { transition: "slide", motion: { kind: "instant" } },
      { transition: "expand", motion: { kind: "move", dir: "left", easing: "spring" } },
    ] as const;
    for (const b of bodies) {
      const after = bodyTransition({ to: "a", ...b }) as { transition: Transition };
      for (const backwards of [false, true])
        for (const spring of [false, true]) expect(screenPoses({ transition: after.transition, motion: b.motion, backwards, spring })).toEqual(screenPoses({ transition: b.transition, motion: b.motion, backwards, spring }));
    }
  });
});

describe("conditions", () => {
  const vars: DocVar[] = [
    { id: "n", name: "n", type: "number", value: 3 },
    { id: "b", name: "b", type: "bool", value: true },
    { id: "t", name: "t", type: "text", value: "3" },
    { id: "c", name: "c", type: "color", value: "primary" },
  ];
  const typed = conditionValue(vars);

  it("compare a value written as what it is compared as: the variable's type, a row's text", () => {
    expect(typed({ var: "n", op: "eq", value: "3" })).toEqual({ var: "n", op: "eq", value: 3 });
    expect(typed({ var: "n", op: "neq", value: "2.5" }).value).toBe(2.5);
    expect(typed({ var: "b", op: "eq", value: "true" }).value).toBe(true);
    expect(typed({ var: "b", op: "eq", value: "false" }).value).toBe(false);
    expect(typed({ var: "t", op: "eq", value: 3 }).value).toBe("3");
    expect(typed({ var: "t", op: "eq", value: true }).value).toBe("true");
    expect(typed({ var: "row.price", op: "eq", value: 3 }).value).toBe("3");
  });

  it("keep a value whose text is another answer, and leave what is no comparison of a variable alone", () => {
    for (const value of ["3.0", " 3", "", "1e3", "x", "-0"]) expect(typed({ var: "n", op: "eq", value }).value).toBe(value);
    for (const value of ["1", "yes", 1]) expect(typed({ var: "b", op: "eq", value }).value).toBe(value);
    expect(typed({ var: "c", op: "eq", value: "primary" }).value).toBe("primary");
    const others = [{ var: "gone", op: "eq", value: "3" }, { filled: "x" }, { expr: "vars.n == 3" }, { var: "n", expr: "x", op: "eq", value: "3" }];
    for (const c of others) expect(typed(c)).toBe(c);
  });

  it("hold in the preview and in the interpreter exactly when they held before, whatever the variable holds", () => {
    const conditions: Condition[] = [
      ...["3", "3.0", "", "x", "2.5"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "n", op, value }))),
      ...["true", "false", "1"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "b", op, value }))),
      ...[3, true, "3"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "t", op, value }))),
    ];
    const values: Record<string, (string | number | boolean)[]> = { n: [3, 2.5, 0, -1], b: [true, false], t: ["3", "true", "x", ""] };
    const d = { groups: [], vars } as unknown as Doc;
    for (const c of conditions)
      for (const value of values[(c as { var: string }).var]) {
        const s = { ...startState(vars, []), vars: { ...startState(vars, []).vars, [(c as { var: string }).var]: value } };
        expect(conditionHolds(typed(c as Record<string, unknown>) as Condition, s, d), JSON.stringify([c, value])).toBe(conditionHolds(c, s, d));
      }
  });

  it("are converged on a tap's condition and a group's, on the canvas and inside components", () => {
    const d = doc([group("g", [item("b", { action: { to: "a", transition: "slide", when: { var: "n", op: "eq", value: "3" } } })], { showWhen: { var: "b", op: "eq", value: "true" } })], { vars, components: [{ id: "c", name: "C", w: 1, h: 1, groups: [group("cg", [item("cb")], { showWhen: { var: "n", op: "neq", value: "1" } })] }] });
    const out = convergeConditions(d) as Record<string, any>;
    expect(out.groups[0].items[0].action.when.value).toBe(3);
    expect(out.groups[0].showWhen.value).toBe(true);
    expect(out.components[0].groups[0].showWhen.value).toBe(1);
  });
});

describe("bindings", () => {
  it("are an expression with no space around it, and a part bound to nothing has no bind", () => {
    expect(itemBind(item("b", { bind: { label: "=  item.title ", text: "v-name", value: "=vars.n" } }))).toMatchObject({ bind: { label: "=item.title", text: "v-name", value: "=vars.n" } });
    expect(itemBind(item("b", { bind: {} }))).not.toHaveProperty("bind");
    const kept = item("b", { bind: { label: "=item.title" } });
    expect(itemBind(kept)).toBe(kept);
    /* an empty expression is no binding: reading the file drops it, as it always did */
    const empty = item("b", { bind: { label: "=  " } });
    expect(itemBind(empty)).toBe(empty);
    expect(convergeBindings(doc([group("g", [item("b", { bind: {} })])]))).toEqual(doc([group("g", [item("b")])]));
  });
});

describe("the step", () => {
  it("is the one step of version 3, which saving writes", () => {
    expect(PROJECT_VERSION).toBe(3);
    expect(MIGRATIONS).toEqual([CONVERGE]);
    const loaded = loadDocument({ format: PROJECT_FORMAT, version: 2, document: doc([group("g", [item("b", { bind: {}, action: { to: "a", transition: "fade", motion: { kind: "instant" } } })])]) })!;
    expect(loaded.migrated).toEqual([CONVERGE.name]);
    const saved = JSON.parse(serializeProject(loaded.doc).text);
    expect(saved.version).toBe(3);
    expect(saved.document.groups[0].items[0]).not.toHaveProperty("bind");
    expect(saved.document.groups[0].items[0].action.transition).toBe("none");
  });

  it("runs on no file of its own version, and a file of a later one opens as it came, read-only", () => {
    const own = { format: PROJECT_FORMAT, version: 3, document: doc([group("g", [item("b", { action: { to: "a", transition: "fade", motion: { kind: "instant" } } })])]) };
    expect(loadDocument(own)!.migrated).toEqual([]);
    const later = loadDocument({ ...own, version: 4 })!;
    expect(later.newer).toBe(4);
    expect((later.doc.groups[0].items[0].action as { transition: string }).transition).toBe("fade");
  });
});

describe("old files in the preview", () => {
  const dir = new URL("./fixtures/history/", import.meta.url);
  const files = ["2026-11-04-bf2463d-all-parts", "2026-11-05-65278cb-proof", "2026-11-06-55ab801-systems", "2026-11-06-79ec9e7-reuse", "2026-11-06-cf3fa45-bound-shop"];

  it.each(files)("draw every part as before, at the start and after each of their taps: %s", (name) => {
    const file = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as { document: Doc };
    const before = loadDocument(file, { steps: [], target: 2 })!.doc;
    const after = loadDocument(file)!.doc;
    const drawn = (d: Doc) => {
      const s0 = startState(d.vars, d.collections);
      const all = [...d.groups, ...(d.components ?? []).flatMap((c) => c.groups)].flatMap((g) => g.items);
      const states = [s0, ...all.flatMap((it) => [it.action, ...Object.values(it.actions ?? {})].flatMap((a) => (a ? [applyEffects(s0, chooseBranch(a, s0, d, it)?.effects, d, { it })] : [])))];
      return states.map((s) => ({ parts: all.map((it) => liveItem(it, s).props), gone: [...goneIds(d.groups, s, d, {})].sort() }));
    };
    expect(drawn(after)).toEqual(drawn(before));
  });
});

describe("an old file in the readers that print it", () => {
  const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
  const file = JSON.parse(readFileSync(new URL("./fixtures/history/2026-11-05-65278cb-proof.json", import.meta.url), "utf8")) as { document: Doc };

  it("exports to the same web prototype once its conditions are converged", async () => {
    const before = loadDocument(file, { steps: [], target: 2 })!.doc;
    const after = loadDocument(file)!.doc;
    /* the file is one the step changes: a condition on a number variable written as words */
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    const exported = async (d: Doc) => (await buildProject(d, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" })).files;
    expect(await exported(after)).toEqual(await exported(before));
  }, 60_000);
});

describe("what the operations write from now on", () => {
  const store = () =>
    new DocStore(stateOf({ groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id: "b" }] }], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }, { id: "F2", name: "Next", x: 500, y: 0 }], vars: [{ id: "n", name: "n", type: "number", value: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });

  it("is the converged form: a transition follows its motion, a condition's value is of its variable's type", () => {
    const s = store();
    s.run(ops.setAction, { id: "b", action: { to: "F2", transition: "fade", motion: { kind: "push", dir: "up" }, when: { var: "n", op: "eq", value: "3" }, else: { to: "F2", motion: { kind: "instant" } } as never } }, { origin: "ai" });
    const a = s.get().doc.groups[0].items[0].action!;
    expect(a.transition).toBe("slideUp");
    expect(a.when).toEqual({ var: "n", op: "eq", value: 3 });
    expect(a.else?.transition).toBe("none");
    s.run(ops.setGroup, { id: "g", patch: { showWhen: { var: "n", op: "neq", value: "0" } } }, { origin: "ai" });
    expect(s.get().doc.groups[0].showWhen).toEqual({ var: "n", op: "neq", value: 0 });
  });
});
