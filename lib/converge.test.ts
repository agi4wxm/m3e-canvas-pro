/* Version 3 (lib/converge.ts): each written form it converges, on every place a document holds one, and that every
 * reader does with the converged document what it did before: the preview's conditions and the interpreter's, the
 * moves the preview plays, the web prototype an old file exports to. The contract every step keeps (pure, keeps what
 * it does not know, idempotent, a document for every old file) and the old files' behaviour are in
 * lib/migrations.test.ts. */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { asWrittenAt4, bodyMotion, bodyTransition, CONVERGE, CONVERGE_4, CONVERGE_5, conditionExpr, conditionValue, convergeBindings, convergeConditions, convergeMotions, convergeRows, convergeTransitions, itemBind, itemBindExpr } from "./converge";
import { DEFAULT_MOTION, TRANSITION_MOTIONS } from "./screenMotion";
import { boundVarOf, comparisonExpr, comparisonOf, fieldVarOf } from "./bindings/bind";
import { fillRow } from "./collections";
import { MIGRATIONS, PROJECT_VERSION } from "./migrations";
import { loadDocument, PROJECT_FORMAT } from "./project";
import { serializeProject } from "./core/projectFile";
import { conditionHolds, inRow, liveItem, startState, writeField } from "./interact";
import { screenPoses, type Transition } from "./screenMotion";
import { buildProject } from "./exportProject";
import { setGlobalLang } from "./i18n";
import { makeItem, MOTION_PRESETS, presetOf, type Condition, type Doc, type DocVar } from "./tokens";
import { drawnStates } from "./fixtures/history/drawn";
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

  it("hold in the preview exactly when they held before, once written as expressions, whatever the variable holds", () => {
    const conditions = [
      ...["3", "3.0", "", "x", "2.5"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "n", op, value }))),
      ...["true", "false", "1"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "b", op, value }))),
      ...[3, true, "3"].flatMap((value) => (["eq", "neq"] as const).map((op) => ({ var: "t", op, value }))),
    ];
    const values: Record<string, (string | number | boolean)[]> = { n: [3, 2.5, 0, -1], b: [true, false], t: ["3", "true", "x", ""] };
    const d = { groups: [], vars } as unknown as Doc;
    /* how version 3's readers compared a variable with a value: by text */
    const before = (c: { var: string; op: string; value: unknown }, v: unknown) => (String(v) === String(c.value)) === (c.op !== "neq");
    for (const c of conditions)
      for (const value of values[c.var]) {
        const s = { ...startState(vars, []), vars: { ...startState(vars, []).vars, [c.var]: value } };
        const written = conditionExpr(vars)(typed(c)) as Condition;
        expect(conditionHolds(written, s, d), JSON.stringify([c, written, value])).toBe(before(c, value));
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

describe("the steps", () => {
  it("are versions 3, 4 and 5, and saving writes 5", () => {
    expect(PROJECT_VERSION).toBe(5);
    expect(MIGRATIONS).toEqual([CONVERGE, CONVERGE_4, CONVERGE_5]);
    const loaded = loadDocument({ format: PROJECT_FORMAT, version: 2, document: doc([group("g", [item("b", { bind: {}, action: { to: "a", transition: "fade", motion: { kind: "instant" } } })])]) })!;
    expect(loaded.migrated).toEqual([CONVERGE.name, CONVERGE_4.name, CONVERGE_5.name]);
    const saved = JSON.parse(serializeProject(loaded.doc).text);
    expect(saved.version).toBe(5);
    expect(saved.document.groups[0].items[0]).not.toHaveProperty("bind");
    expect(saved.document.groups[0].items[0].action).toEqual({ to: "a", motion: { kind: "instant" } });
  });

  it("run only what comes after a file's own version, and a file of a later one opens as it came, read-only", () => {
    const v3 = { format: PROJECT_FORMAT, version: 3, document: doc([group("g", [item("b", { action: { to: "a", transition: "fade" } })])]) };
    expect(loadDocument(v3)!.migrated).toEqual([CONVERGE_4.name, CONVERGE_5.name]);
    expect(loadDocument(v3)!.doc.groups[0].items[0].action).toEqual({ to: "a", motion: { kind: "dissolve", easing: "emphasized", ms: 300 } });
    expect(loadDocument({ ...v3, version: 4 })!.migrated).toEqual([CONVERGE_5.name]);
    const own = { ...v3, version: 5 };
    expect(loadDocument(own)!.migrated).toEqual([]);
    const later = loadDocument({ ...v3, version: 6 })!;
    expect(later.newer).toBe(6);
    expect((later.doc.groups[0].items[0].action as unknown as { transition: string }).transition).toBe("fade");
  });
});

describe("old files in the preview", () => {
  const dir = new URL("./fixtures/history/", import.meta.url);
  const files = ["2026-11-04-bf2463d-all-parts", "2026-11-05-65278cb-proof", "2026-11-06-55ab801-systems", "2026-11-06-79ec9e7-reuse", "2026-11-06-cf3fa45-bound-shop", "2026-11-09-0228f1c-names"];
  /* what the preview of the version that wrote each drew of it (version 3 for the older files, version 4 for the one of
     the props version 5 renames; written by lib/fixtures/history/drawn.ts), each part's props read under the names of
     version 4 */
  const golden = JSON.parse(readFileSync(new URL("drawn.json", dir), "utf8")) as Record<string, Record<string, string>>;

  it.each(files)("draw every part as the version that wrote them drew them, at the start, after each tap and after each input is used: %s", (name) => {
    const file = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as { document: Doc };
    const now = drawnStates(loadDocument(file)!.doc, asWrittenAt4);
    expect(Object.keys(now).sort()).toEqual(Object.keys(golden[name]).sort());
    expect(Object.entries(now).filter(([k, v]) => golden[name][k] !== v).map(([k]) => k)).toEqual([]);
  });
});

describe("an old file in the readers that print it", () => {
  const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
  const file = JSON.parse(readFileSync(new URL("./fixtures/history/2026-11-05-65278cb-proof.json", import.meta.url), "utf8")) as { document: Doc };

  /* Version 3's export of this file and this one's differ only where the printed taps now say their move by its motion
     (no `transition` in a tap's data, a motion where the older move was not the default slide: the app then plays the
     preview's own poses, src/lib/screenMotion.ts) and in the editor's code it copies (lib/actions, lib/screenMotion.ts,
     lib/bindings/expr.ts). Conditions on variables still print as reads of the app's state. */
  it("prints its taps in the one form and its conditions as reads of the app's state", async () => {
    const files = (await buildProject(loadDocument(file)!.doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" })).files;
    const screens = Object.entries(files).filter(([path]) => path.startsWith("src/screens/"));
    for (const [path, body] of screens) expect(String(body), path).not.toMatch(/transition: "/);
    const counter = String(files["src/screens/CounterScreen.tsx"]);
    expect(counter).toContain("vars.count === 3");
    expect(counter).toContain("vars.flag");
    /* the older fade, expand and at-once moves are their motions, and the app plays them as the preview does */
    const menu = String(files["src/screens/MenuScreen.tsx"]);
    expect(menu).toContain('motion: { kind: "dissolve", easing: "emphasized", ms: 300 }');
    expect(menu).toContain('motion: { kind: "expand", easing: "theme", ms: 360 }');
    expect(String(files["src/App.tsx"])).toContain("screenPoses({ ...m, spring: SPRINGS })");
  }, 60_000);
});

/* ---------- version 4 ---------- */

/** how version 3 played a move (lib/screenMotion.ts `screenPoses` there, for the older transitions), kept as the
 *  reference the motions written for them must play exactly */
function posesV3(transition: Transition, backwards: boolean, spring: boolean) {
  const ZI = { zIndex: { duration: 0 } };
  const STILL = { x: 0, y: 0, opacity: 1, scale: 1 };
  const EASE = [0.2, 0, 0, 1] as const;
  const SPRING = { type: "spring" as const, stiffness: 360, damping: 26, mass: 1 };
  const SPEC: Partial<Record<Transition, { axis: "x" | "y"; enter: number; exit: number }>> = { slide: { axis: "x", enter: 1, exit: -0.3 }, slideLeft: { axis: "x", enter: -1, exit: 0.3 }, slideUp: { axis: "y", enter: 1, exit: -0.3 }, slideDown: { axis: "y", enter: -1, exit: 0.3 } };
  const off = (axis: "x" | "y", v: number) => (axis === "x" ? { x: `${v * 100}%`, y: 0 } : { x: 0, y: `${v * 100}%` });
  const s = SPEC[transition];
  if (s) {
    const tr = spring ? { ...SPRING, ...ZI } : { duration: 0.42, ease: EASE, ...ZI };
    return backwards
      ? { initial: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1 }, animate: { ...STILL, zIndex: 1, transition: tr }, exit: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2, transition: tr } }
      : { initial: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1, transition: tr } };
  }
  if (transition === "fade") {
    const tr = { duration: 0.3, ease: EASE, ...ZI };
    return { initial: { ...STILL, opacity: 0, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, opacity: 0, zIndex: 1, transition: tr } };
  }
  if (transition === "expand") {
    const tr = spring ? { ...SPRING, ...ZI } : { duration: 0.36, ease: EASE, ...ZI };
    const z = backwards ? 1 : 2;
    return { initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: z }, animate: { ...STILL, zIndex: z, transition: tr }, exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: backwards ? 2 : 1, transition: tr } };
  }
  const tr = { duration: 0, ...ZI };
  return { initial: { ...STILL, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, zIndex: 1, transition: tr } };
}

const ALL_TRANSITIONS: Transition[] = ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"];

describe("version 4: motions", () => {
  it("play every older move exactly, forwards and back, eased and on the theme's springs", () => {
    for (const t of ALL_TRANSITIONS)
      for (const backwards of [false, true])
        for (const spring of [false, true]) {
          expect(screenPoses({ motion: TRANSITION_MOTIONS[t], backwards, spring }), JSON.stringify([t, backwards, spring])).toEqual(posesV3(t, backwards, spring));
          /* what an app's own moves still name by the older words plays the same */
          expect(screenPoses({ transition: t, backwards, spring })).toEqual(posesV3(t, backwards, spring));
        }
    /* the default, what a tap that says no motion plays, is the older slide */
    expect(DEFAULT_MOTION).toEqual(TRANSITION_MOTIONS.slide);
  });

  it("are what an older transition becomes; the default slide is no motion, and nothing says transition after", () => {
    expect(bodyMotion({ to: "a", transition: "fade" })).toEqual({ to: "a", motion: { kind: "dissolve", easing: "emphasized", ms: 300 } });
    expect(bodyMotion({ to: "a", transition: "slideUp" })).toEqual({ to: "a", motion: { kind: "slide", dir: "up", easing: "theme", ms: 420 } });
    expect(bodyMotion({ to: "a", transition: "expand" })).toEqual({ to: "a", motion: { kind: "expand", easing: "theme", ms: 360 } });
    expect(bodyMotion({ to: "a", transition: "none" })).toEqual({ to: "a", motion: { kind: "instant" } });
    expect(bodyMotion({ to: "a", transition: "slide" })).toEqual({ to: "a" });
    /* a motion of its own is what plays, as it was */
    expect(bodyMotion({ to: "a", transition: "slideUp", motion: { kind: "push", dir: "up", ms: 300 } })).toEqual({ to: "a", motion: { kind: "push", dir: "up", ms: 300 } });
    /* what goes to no screen played no transition, and a back action keeps its own motion */
    expect(bodyMotion({ to: "none", transition: "none" })).toEqual({ to: "none" });
    expect(bodyMotion({ to: "back", transition: "none", motion: { kind: "dissolve" } })).toEqual({ to: "back", motion: { kind: "dissolve" } });
    const kept = { to: "a", motion: { kind: "instant" } };
    expect(bodyMotion(kept)).toBe(kept);
  });

  it("are written on every body a document holds, and the step leaves no transition anywhere", () => {
    // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
    const deep = { to: "none", transition: "none", effects: [{ do: "call", operationId: "x", then: { to: "a", transition: "fade", effects: [{ do: "invoke", capability: "c", catch: { to: "a", transition: "expand" } }] } }] };
    // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
    const d = doc([group("g", [item("b", { action: { ...deep, else: { to: "a", transition: "slideDown" } }, actions: { "tab:0": { to: "a", transition: "none" } } })], { form: { operationId: "f", then: { to: "a", transition: "fade" } } })], { components: [{ id: "c", name: "C", w: 1, h: 1, groups: [group("cg", [item("cb", { action: { to: "a", transition: "none" } })])] }] });
    const out = convergeMotions(d);
    expect(JSON.stringify(out)).not.toContain('"transition"');
    const b = (out.groups as { items: Record<string, any>[] }[])[0].items[0];
    expect(b.action.effects[0].then.motion.kind).toBe("dissolve");
    expect(b.action.effects[0].then.effects[0].catch.motion.kind).toBe("expand");
    expect(b.action.else.motion).toEqual({ kind: "slide", dir: "down", easing: "theme", ms: 420 });
    expect(b.actions["tab:0"].motion).toEqual({ kind: "instant" });
    expect((out.components as Record<string, any>[])[0].groups[0].items[0].action.motion).toEqual({ kind: "instant" });
  });

  it("are read by the panel's presets: a preset is its motion, a motion of its own none of them", () => {
    for (const p of MOTION_PRESETS) expect(presetOf(p.motion)).toBe(p.key);
    expect(presetOf(undefined)).toBe("slide");
    expect(presetOf({ kind: "push", dir: "left" })).toBeUndefined();
  });
});

describe("version 4: conditions", () => {
  const vars: DocVar[] = [
    { id: "n", name: "count", type: "number", value: 3 },
    { id: "b", name: "on", type: "bool", value: true },
    { id: "t", name: "word", type: "text", value: "3" },
    { id: "v-odd", name: "a b", type: "text", value: "" },
  ];
  const asExpr = (c: Record<string, unknown>) => conditionExpr(vars)(conditionValue(vars)(c));

  it("are expressions: a variable compared by its name (or key), a value of its type, the text where it is another", () => {
    expect(asExpr({ var: "n", op: "eq", value: "3" })).toEqual({ expr: "vars.count == 3" });
    expect(asExpr({ var: "b", op: "neq", value: true })).toEqual({ expr: "vars.on != true" });
    expect(asExpr({ var: "t", op: "eq", value: 3 })).toEqual({ expr: 'vars.word == "3"' });
    expect(asExpr({ var: "v-odd", op: "eq", value: 'say "hi"' })).toEqual({ expr: 'vars["a b"] == "say \\"hi\\""' });
    expect(asExpr({ var: "n", op: "eq", value: "3.0" })).toEqual({ expr: 'string(vars.count) == "3.0"' });
    expect(asExpr({ var: "row.price", op: "eq", value: 3 })).toEqual({ expr: 'row.price == "3"' });
    expect(asExpr({ var: "row.unit-price", op: "neq", value: "0" })).toEqual({ expr: 'row["unit-price"] != null && row["unit-price"] != "0"' });
    expect(asExpr({ var: "gone", op: "neq", value: 1 })).toEqual({ expr: "false" });
    /* what it does not know stays beside it, and what is no comparison is left as it was */
    expect(asExpr({ var: "n", op: "eq", value: 3, "x-mine": 1 })).toEqual({ expr: "vars.count == 3", "x-mine": 1 });
    for (const c of [{ filled: "x" }, { expr: "vars.count > 1" }]) expect(conditionExpr(vars)(c)).toBe(c);
  });

  it("hold exactly when they held, on a variable and on a row, in the preview and in the panel's reading of them", () => {
    const before = (c: { var: string; op: string; value: unknown }, v: unknown) => v !== undefined && (String(v) === String(c.value)) === (c.op !== "neq");
    const cases: [Record<string, unknown>, unknown[]][] = [
      [{ var: "n", op: "eq", value: 3 }, [3, 2, 0, -3]],
      [{ var: "n", op: "neq", value: "3.0" }, [3, 3.5]],
      [{ var: "b", op: "eq", value: true }, [true, false]],
      [{ var: "b", op: "neq", value: "1" }, [true, false]],
      [{ var: "t", op: "neq", value: "" }, ["", "x", "3"]],
      [{ var: "v-odd", op: "eq", value: "x" }, ["x", "y"]],
    ];
    const d = { groups: [], vars } as unknown as Doc;
    for (const [c, values] of cases)
      for (const value of values) {
        const s0 = startState(vars, []);
        const s = { ...s0, vars: { ...s0.vars, [c.var as string]: value as never } };
        const written = asExpr(c) as Condition;
        expect(conditionHolds(written, s, d), JSON.stringify([c, value])).toBe(before(c as never, value));
      }
    /* a field of the row a part was drawn for; a row without it, or a part drawn for none, answers no to both */
    for (const op of ["eq", "neq"] as const)
      for (const row of [{ name: "Pear" }, { name: "Plum" }, {}, undefined] as (Record<string, string> | undefined)[]) {
        const c = { var: "row.name", op, value: "Pear" };
        const written = asExpr(c) as Condition;
        const s = inRow(startState(vars, []), row);
        expect(conditionHolds(written, s, d, row ? { row } : {}), JSON.stringify([op, row])).toBe(before(c, row?.name));
      }
  });

  it("are edited as a variable, is or is not, and a value where they are one", () => {
    for (const c of [
      { var: "n", op: "eq" as const, value: 3 },
      { var: "n", op: "neq" as const, value: -2.5 },
      { var: "b", op: "eq" as const, value: false },
      { var: "v-odd", op: "neq" as const, value: 'a "b"' },
      { var: "row.price", op: "eq" as const, value: "0" },
    ])
      expect(comparisonOf(comparisonExpr(c, vars), vars)).toEqual(c);
    for (const expr of ["vars.count > 3", "vars.count == 'x'", "string(vars.count) == '3.0'", "vars.gone == 1", "row.price == 3"]) expect(comparisonOf(expr, vars)).toBeNull();
  });
});

describe("version 4: bindings", () => {
  const vars: DocVar[] = [
    { id: "v-count", name: "count", type: "number", value: 2 },
    { id: "v-name", name: "名前", type: "text", value: "Ada" },
    { id: "v-odd", name: "", type: "text", value: "" },
    { id: "v-brand", name: "brand", type: "color", value: "primary" },
  ];

  it("are expressions: a variable's id the plain read of it, a design field's by key, one that is gone left out", () => {
    const bound = itemBindExpr(vars)(item("b", { bind: { label: "v-count", text: "v-name", value: "v-odd", "@fill": "v-brand", title: "gone", icon: "=item.icon" } }));
    expect(bound.bind).toEqual({ label: "=vars.count", text: "=vars.名前", value: '=vars["v-odd"]', "@fill": '=vars["v-brand"]', icon: "=item.icon" });
    expect(itemBindExpr(vars)(item("b", { bind: { label: "gone" } }))).not.toHaveProperty("bind");
    const kept = item("b", { bind: { label: "=vars.count" } });
    expect(itemBindExpr(vars)(kept)).toBe(kept);
  });

  it("are to a variable where they read it plainly, by name or key: what an input writes back to", () => {
    expect(boundVarOf("=vars.count", vars)).toBe("v-count");
    expect(boundVarOf('=vars["v-count"]', vars)).toBe("v-count");
    expect(boundVarOf("=vars?.名前", vars)).toBe("v-name");
    for (const b of ["=vars.count + 1", "=item.count", "=vars.gone", "v-count", "="]) expect(boundVarOf(b, vars)).toBeUndefined();
    expect(fieldVarOf('=vars["v-brand"]')).toBe("v-brand");
  });

  it("show a variable as they did, and an input bound to one writes it back, whatever its type", () => {
    const d = { groups: [], vars } as unknown as Doc;
    const s0 = startState(vars, []);
    const show = (component: string, prop: string, value: unknown) => {
      const it = { ...makeItem(component), id: "p", bind: { [prop]: "=vars.count" } };
      const s = { ...s0, vars: { ...s0.vars, "v-count": value as never } };
      return liveItem(it, s).props?.[prop];
    };
    expect(show("text", "text", 2)).toBe("2");
    expect(show("switch", "checked", 0)).toBe(false);
    expect(show("switch", "checked", "false")).toBe(false);
    expect(show("slider", "value", "7")).toBe(7);
    const field = { ...makeItem("text-field"), id: "f", bind: { value: "=vars.名前" } };
    expect(writeField(s0, field, "Grace", d).vars["v-name"]).toBe("Grace");
    /* any other expression only shows */
    const shown = { ...field, bind: { value: '=vars.名前 + "!"' } };
    expect(writeField(s0, shown, "Grace", d).vars["v-name"]).toBe("Ada");
  });
});

describe("version 4: rows", () => {
  const collections = [{ id: "fruit", name: "Fruit", fields: ["name", "unit price"], rows: [["Apple", "1"]] }];
  const rows = () =>
    doc(
      [
        group("list", [item("l", { component: "box", props: { layout: "column" } })], { repeat: { collection: "fruit" } }),
        group("row", [item("r", { component: "box", props: { layout: "row" } })], { inFlow: "list" }),
        group("name", [item("n", { component: "text", props: { text: "{{name}} at {{ unit price }}, {{vars.n}} {{gone}}" }, action: { to: "none", effects: [{ do: "snackbar", message: "Got {{name}}" }] } })], { inFlow: "row" }),
        group("outside", [item("o", { component: "text", props: { text: "{{name}}" } })]),
      ],
      { collections },
    );

  it("read a field of the row as row.<field> in every part a repeat over a collection lays out", () => {
    const out = convergeRows(rows()) as Record<string, any>;
    expect(out.groups[2].items[0].props.text).toBe('{{row.name}} at {{row["unit price"]}}, {{vars.n}} {{gone}}');
    expect(out.groups[2].items[0].action.effects[0].message).toBe("Got {{row.name}}");
    /* words outside any repeat are left as written */
    expect(out.groups[3].items[0].props.text).toBe("{{name}}");
    expect(convergeRows(out)).toBe(out);
  });

  it("are filled by the one filler: a row's reads at once, the rest left for whoever reads them later", () => {
    const row = { name: "Apple", "unit price": "1" };
    expect(fillRow('{{row.name}} at {{row["unit price"]}}, {{upper(row.name)}} {{vars.n}} {{gone}}', row)).toBe("Apple at 1, APPLE {{vars.n}} {{gone}}");
    /* the older bare field, where the step could not tell the part is in a repeat */
    expect(fillRow("{{name}}", row)).toBe("Apple");
  });
});

describe("what the operations write from now on", () => {
  const store = () =>
    new DocStore(stateOf({ groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id: "b" }] }, { id: "g2", x: 16, y: 200, axis: "x", items: [{ ...makeItem("text-field"), id: "f" }] }], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }, { id: "F2", name: "Next", x: 500, y: 0 }], vars: [{ id: "n", name: "n", type: "number", value: 0 }, { id: "w", name: "word", type: "text", value: "" }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });

  it("is the one form whatever form a model gives: a motion, an expression, a binding to the expression that reads a variable", () => {
    const s = store();
    s.run(ops.setAction, { id: "b", action: { to: "F2", transition: "fade", when: { var: "n", op: "eq", value: "3" }, else: { to: "F2", motion: { kind: "instant" } } } as never }, { origin: "ai" });
    expect(s.get().doc.groups[0].items[0].action).toEqual({ to: "F2", motion: { kind: "dissolve", easing: "emphasized", ms: 300 }, when: { expr: "vars.n == 3" }, else: { to: "F2", motion: { kind: "instant" } } });
    /* the default slide, given in full, is written as none */
    s.run(ops.setAction, { id: "b", action: { to: "F2", motion: TRANSITION_MOTIONS.slide } }, { origin: "ai" });
    expect(s.get().doc.groups[0].items[0].action).toEqual({ to: "F2" });
    s.run(ops.setGroup, { id: "g", patch: { showWhen: { var: "n", op: "neq", value: "0" } as never } }, { origin: "ai" });
    expect(s.get().doc.groups[0].showWhen).toEqual({ expr: "vars.n != 0" });
    s.run(ops.bindProp, { id: "f", prop: "value", var: "w" }, { origin: "ai" });
    expect(s.get().doc.groups[1].items[0].bind).toEqual({ value: "=vars.word" });
    s.run(ops.setItem, { id: "f", patch: { bind: { value: "n" } } }, { origin: "ai" });
    expect(s.get().doc.groups[1].items[0].bind).toEqual({ value: "=vars.n" });
    s.run(ops.setLinkMotion, { links: ["b|"], motion: "expand" }, { origin: "ai" });
    expect(s.get().doc.groups[0].items[0].action?.motion).toEqual(TRANSITION_MOTIONS.expand);
  });
});
