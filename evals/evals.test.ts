/* The evaluation suite's own tests, with no network: the graders on documents built with operations, the harness
 * running a task with a scripted model, and the committed recorded runs (evals/recorded) graded again to the verdicts
 * they were recorded with, the way `bun run eval -- --replay` grades them. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf, type Tx } from "../lib/core";
import { emptyUsage } from "../lib/llm";
import { scriptedAdapter } from "../lib/llm/testkit";
import { setGlobalLang, type Lang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { fixtureDoc, FIXTURES } from "./fixtures";
import { inLanguage, score } from "./graders";
import { DEFAULT_MODEL, likenessOf, metered, runTask, type Meter } from "./harness";
import { parseJudge } from "./judge";
import { readRuns } from "./record";
import { rowOf, summaryMarkdown } from "./report";
import { taskById, TASKS } from "./tasks";
import type { Observed } from "./types";

/** a turn's observation made by hand: the fixture, changed by `change`, as if the agent had done it */
function observe(taskId: string, change: (tx: Tx) => void, o: Partial<Observed> = {}): Observed {
  const task = taskById(taskId)!;
  const start = fixtureDoc(task.fixture);
  setGlobalLang(task.lang);
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("t"), measurer: guessMeasurer, lang: () => task.lang });
  store.load(start, true);
  const before = savedDoc(store.get());
  const startWidths = guessMeasurer.measure(store.get());
  store.transact("AI", "ai", change);
  const final = savedDoc(store.get());
  return {
    task: taskId,
    lang: task.lang,
    request: task.request,
    model: "scripted",
    effort: "medium",
    start: before,
    final,
    startWidths,
    widths: guessMeasurer.measure(store.get()),
    calls: [],
    stop: "end_turn",
    text: "Done.",
    usage: { ...emptyUsage(), input: 1000, output: 100 },
    turnUsage: emptyUsage(),
    ms: 1000,
    steps: 3,
    drawings: 0,
    undo: { steps: 1, restores: true },
    shots: [],
    budget: task.budget,
    ...o,
  };
}

const HERE = new URL(".", import.meta.url).pathname;

const verdict = (o: Observed, id: string) => score(taskById(o.task)!.checks, o).verdicts.find((v) => v.id === id)!;

describe("the fixtures", () => {
  it("build every task's starting document, the same every time", () => {
    for (const t of TASKS) expect(FIXTURES[t.fixture], t.id).toBeTruthy();
    for (const [name, f] of Object.entries(FIXTURES)) {
      const a = f.doc();
      expect(a.frames.length, name).toBeGreaterThan(0);
      expect(JSON.stringify(f.doc()), name).toBe(JSON.stringify(a));
    }
  });
});

describe("the graders", () => {
  it("tell the language of a word", () => {
    const cases: [string, Lang, boolean | null][] = [
      ["登录", "zh", true],
      ["Sign in", "zh", false],
      ["OK", "zh", null],
      ["ログイン", "ja", true],
      ["设置", "ja", true],
      ["로그인", "ko", true],
      ["登录", "ko", false],
      ["Sign in", "en", true],
      ["登录", "en", false],
      ["¥3", "zh", null],
      ["{{name}}", "en", null],
      ["maya@example.com", "zh", null],
    ];
    for (const [s, lang, want] of cases) expect(inLanguage(s, lang), `${s} in ${lang}`).toBe(want);
  });

  it("pass a dark-mode switch wired to a variable that drives dark, and fail one that is not", () => {
    const good = observe("dark-mode-switch", (tx) => {
      tx.run(ops.addVar, { id: "dark", name: "dark", type: "bool", value: false, drives: "dark" });
      tx.run(ops.addPart, { slug: "switch", id: "sw", screen: "f1", at: { x: 16, y: 690 } });
      tx.run(ops.bindProp, { id: "sw", prop: "checked", var: "dark" });
    });
    const s = score(taskById("dark-mode-switch")!.checks, good);
    expect(s.verdicts.filter((v) => !v.pass)).toEqual([]);
    expect(s.pass).toBe(true);
    const loose = observe("dark-mode-switch", (tx) => {
      tx.run(ops.addVar, { id: "dark", name: "dark", type: "bool", value: false });
      tx.run(ops.addPart, { slug: "switch", id: "sw", screen: "f1", at: { x: 16, y: 690 } });
    });
    const bad = score(taskById("dark-mode-switch")!.checks, loose);
    expect(bad.pass).toBe(false);
    expect(bad.verdicts.filter((v) => !v.pass).map((v) => v.id)).toEqual(["dark-var", "dark-control"]);
  });

  it("find parts that overlap and parts out of the screen", () => {
    const o = observe("login-material", (tx) => {
      tx.run(ops.addScreen, { id: "login", name: "登录" });
      tx.run(ops.addPart, { slug: "text", id: "a", screen: "login", at: { x: 16, y: 100 }, props: { text: "欢迎回来" } });
      tx.run(ops.addPart, { slug: "text", id: "b", screen: "login", at: { x: 20, y: 104 }, props: { text: "登录后继续" } });
      tx.run(ops.addPart, { slug: "button", id: "c", screen: "login", at: { x: 380, y: 300 }, props: { label: "登录", width: 200 } });
    });
    expect(verdict(o, "no-overlap")).toMatchObject({ pass: false });
    expect(verdict(o, "no-overlap").detail).toMatch(/a .*× b/);
    expect(verdict(o, "in-bounds")).toMatchObject({ pass: false });
    expect(verdict(o, "in-bounds").detail).toMatch(/^1 out: c/);
    expect(verdict(o, "language")).toMatchObject({ pass: true });
    /* loose atoms are no auto layout */
    expect(verdict(o, "auto-layout")).toMatchObject({ pass: false });
  });

  it("pass a screen composed in auto layout, in the right language", () => {
    const o = observe("login-material", (tx) => {
      tx.run(ops.addScreen, { id: "login", name: "登录" });
      tx.run(ops.addTree, {
        screen: "login",
        at: { x: 16, y: 120 },
        tree: {
          part: "box",
          props: { surface: "none", layout: "column", gap: 16, padX: 0, padY: 0, hugWidth: false, width: 380 },
          children: [
            { part: "text", props: { text: "欢迎回来", style: "title" } },
            { part: "input", props: { placeholder: "邮箱" } },
            { part: "input", props: { placeholder: "密码", type: "password" } },
            { part: "button", props: { label: "登录" } },
            { part: "link", props: { label: "忘记密码？" } },
          ],
        },
      });
    });
    const s = score(taskById("login-material")!.checks, o);
    expect(s.verdicts.filter((v) => !v.pass)).toEqual([]);
    expect(s.pass).toBe(true);
    /* the same words in English fail the language check */
    const en = observe("login-material", (tx) => {
      tx.run(ops.addScreen, { id: "login", name: "Sign in" });
      tx.run(ops.addTree, { screen: "login", at: { x: 16, y: 120 }, tree: { part: "box", props: { layout: "column", gap: 16 }, children: [{ part: "input", props: { placeholder: "Email" } }, { part: "button", props: { label: "Sign in" } }] } });
    });
    expect(verdict(en, "language")).toMatchObject({ pass: false });
  });

  it("hold a strict document to its style", () => {
    const kept = observe("profile-ios-strict", (tx) => {
      tx.run(ops.addScreen, { id: "me", name: "Profile" });
    });
    expect(verdict(kept, "style-rules")).toMatchObject({ pass: true });
    const left = observe("profile-ios-strict", (tx) => {
      tx.run(ops.applyStyle, { style: "" });
    });
    expect(verdict(left, "style-rules")).toMatchObject({ pass: false });
  });

  it("see ragged edges and uneven gaps, and that nothing of the author's was taken away", () => {
    const messy = observe("polish-spacing", () => {});
    expect(verdict(messy, "even-spacing")).toMatchObject({ pass: false });
    const tidied = observe("polish-spacing", (tx) => {
      tx.run(ops.autoLayoutScreen, { screen: "profile" });
    });
    expect(verdict(tidied, "even-spacing").detail).toMatch(/rows/);
    const wiped = observe("vague-wipe", (tx) => {
      tx.run(ops.removeScreen, { id: tx.state.doc.frames[0].id });
    });
    expect(verdict(wiped, "keeps-work")).toMatchObject({ pass: false });
    expect(score(taskById("vague-wipe")!.checks, wiped).pass).toBe(false);
  });

  it("follow data from a collection to a repeated row and a detail screen", () => {
    /* the detail reads the tapped row, or variables the tap sets from it, or nothing of it */
    const build = (detail: "current" | "vars" | "none") =>
      observe("contacts-data", (tx) => {
        tx.run(ops.addCollection, { id: "people", name: "People", fields: ["name", "phone", "city"], rows: [["Ana", "1", "Porto"], ["Ben", "2", "Oslo"], ["Cai", "3", "Lima"], ["Dee", "4", "Rome"], ["Eli", "5", "Kyiv"]] });
        tx.run(ops.addVar, { id: "picked", name: "picked", type: "text", value: "" });
        tx.run(ops.addScreen, { id: "detail", name: "Contact" });
        tx.run(ops.addPart, { slug: "text", id: "who", screen: "detail", at: { x: 16, y: 100 }, props: { text: detail === "current" ? "{{current.name}}" : "Contact" } });
        if (detail === "vars") tx.run(ops.bindProp, { id: "who", prop: "text", var: "picked" });
        tx.run(ops.addPart, { slug: "box", id: "rows", screen: "contacts", at: { x: 16, y: 80 }, props: { layout: "column", gap: 8 } });
        tx.run(ops.addPart, { slug: "text", id: "row", into: { container: "rows" }, props: { text: "{{name}}" } });
        tx.run(ops.setRepeat, { id: "rows", repeat: { collection: "people" } });
        tx.run(ops.setAction, { id: "row", action: { to: "detail", transition: "slide", ...(detail === "vars" ? { effects: [{ do: "setVar", var: "picked", value: "{{name}}" }] } : {}) } });
      });
    for (const id of ["collection", "repeat", "tap-detail"]) expect(verdict(build("current"), id), id).toMatchObject({ pass: true });
    expect(verdict(build("vars"), "tap-detail").detail).toMatch(/sets variables from the row/);
    expect(verdict(build("none"), "tap-detail")).toMatchObject({ pass: false });
  });

  it("count a failed call put right later as recovered, and one left as it was as not", () => {
    const fail = { step: 1, id: "c1", name: "set_props", args: {}, ok: false, error: { code: "invalid_value", message: "no" }, summary: "no", ms: 1 };
    const fixed = observe("dark-mode-switch", () => {}, { calls: [fail, { ...fail, id: "c2", ok: true, step: 2 }] });
    expect(verdict(fixed, "finished")).toMatchObject({ pass: true });
    const left = observe("dark-mode-switch", () => {}, { calls: [fail] });
    expect(verdict(left, "finished")).toMatchObject({ pass: false });
    expect(verdict(observe("dark-mode-switch", () => {}, { stop: "max_steps" }), "finished")).toMatchObject({ pass: false });
  });

  it("read the reference likeness and the budget", () => {
    const close = observe("replicate-weather", () => {}, { likeness: [{ screen: "home", similarity: 82 }] });
    expect(verdict(close, "likeness")).toMatchObject({ pass: true });
    const far = observe("replicate-weather", () => {}, { likeness: [{ screen: "home", similarity: 40 }], usage: { ...emptyUsage(), input: 9_000_000 }, cut: "tokens" });
    expect(verdict(far, "likeness")).toMatchObject({ pass: false });
    expect(verdict(far, "budget").detail).toMatch(/tokens .*cut by tokens/);
  });

  it("score a picture against itself as alike", () => {
    const ref = `data:image/png;base64,${readFileSync(join(HERE, "refs", "weather.png")).toString("base64")}`;
    expect(likenessOf(ref, ref)).toBe(100);
  });
});

describe("the harness", () => {
  const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });

  it("runs a task through the agent's own turn with a scripted model and grades it", async () => {
    const task = taskById("dark-mode-switch")!;
    const adapter = () =>
      scriptedAdapter([
        { text: "I'll add the variable and a switch.", calls: [call("c1", "apply_ops", { ops: [{ op: "add_var", args: { id: "dark", name: "深色模式", type: "bool", value: false, drives: "dark" } }, { op: "add_part", args: { slug: "switch", id: "sw", screen: "f1", at: { x: 16, y: 690 } } }, { op: "bind_prop", args: { id: "sw", prop: "checked", var: "dark" } }] })] },
        { calls: [call("c2", "set_props", { id: "nope", props: {} })] },
        { calls: [call("c3", "set_props", { id: "sw", props: { label: "深色模式" } })] },
        { text: "加好了深色模式开关。" },
      ]);
    const out = await runTask(task, { model: DEFAULT_MODEL, adapter, renderers: null, drawings: { left: 0 } });
    const o = out.observed;
    expect(o.stop).toBe("end_turn");
    expect(o.calls.map((c) => [c.name, c.ok])).toEqual([
      ["apply_ops", true],
      ["set_props", false],
      ["set_props", true],
    ]);
    expect(o.calls[1].error?.code).toBe("not_found");
    expect(o.undo).toEqual({ steps: 1, restores: true });
    expect(o.usage.input).toBeGreaterThan(0);
    const s = score(task.checks, o);
    expect(s.verdicts.filter((v) => !v.pass)).toEqual([]);
    expect(s.pass).toBe(true);
    /* the conversation is kept as it went, the request first */
    expect(out.transcript[0]).toMatchObject({ role: "user" });
  });

  it("stops asking once the token budget is spent, and keeps what was done", async () => {
    const task = { ...taskById("stepper-vars")!, budget: { ...taskById("stepper-vars")!.budget, tokens: 10 } };
    const adapter = () => scriptedAdapter([{ calls: [call("c1", "add_var", { id: "qty", name: "qty", type: "number", value: 1 })] }, { text: "never asked" }]);
    const out = await runTask(task, { model: DEFAULT_MODEL, adapter, renderers: null, drawings: { left: 0 } });
    expect(out.observed.cut).toBe("tokens");
    expect(out.observed.stop).toBe("error");
    expect(out.observed.final.vars?.map((v) => v.id)).toEqual(["qty"]);
    expect(verdict(out.observed, "budget")).toMatchObject({ pass: false });
    expect(verdict(out.observed, "finished")).toMatchObject({ pass: false });
  });

  it("counts every call the meter sees", async () => {
    const meter: Meter = { usage: emptyUsage(), calls: 0 };
    const a = metered(scriptedAdapter([{ text: "a" }, { text: "b" }]), { tokens: 1e6, ms: 1e6 }, Date.now(), meter);
    for (let i = 0; i < 2; i++) for await (const e of a.stream({ system: "", messages: [] })) expect(e.type).not.toBe("error");
    expect(meter.calls).toBe(2);
    expect(meter.usage.input).toBe(20);
  });
});

describe("the judge and the report", () => {
  it("reads a judge's answer", () => {
    expect(parseJudge('Here: {"score": 4, "reasons": ["clean", "one gap"]}')).toEqual({ score: 4, reasons: ["clean", "one gap"] });
    expect(parseJudge('{"score": 9}')).toEqual({ score: 5, reasons: [] });
    expect(parseJudge("no idea")).toBeNull();
  });

  it("writes a summary with every run and its failed checks", () => {
    const o = observe("dark-mode-switch", () => {});
    const s = score(taskById("dark-mode-switch")!.checks, o);
    const md = summaryMarkdown([rowOf("dark-mode-switch", { task: o.task, ability: "variables", title: "t", ...s }, o, { input: 1, cachedInput: 0.1, output: 10 })], { title: "Eval run", model: "m", effort: "medium", date: "2026-01-01" });
    expect(md).toContain("| dark-mode-switch | variables | zh | FAIL |");
    expect(md).toContain("**dark-var**");
    expect(md).toMatch(/Est\. cost \| \$0\.00/);
  });
});

describe("recorded runs", () => {
  const dir = join(HERE, "recorded");
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as Record<string, { pass: boolean; failed: string[] }>;

  it("grade again to the verdicts they were recorded with", () => {
    const runs = readRuns(dir);
    expect(runs.map((r) => r.name).sort()).toEqual(Object.keys(expected).sort());
    for (const run of runs) {
      const task = taskById(run.observed.task)!;
      const s = score(task.checks, run.observed as Observed & { final: Doc });
      expect({ pass: s.pass, failed: s.verdicts.filter((v) => !v.pass).map((v) => v.id) }, run.name).toEqual(expected[run.name]);
    }
  });
});
