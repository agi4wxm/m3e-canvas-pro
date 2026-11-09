/* The mock model (evals/mock.ts): the id pairing on its own, a recorded run played back clean and with the code
 * "changed" under it (a recording tampered with), and the gate: every committed recording of the latest real run
 * played through the current code, with no divergence and every task passing its critical checks. Nothing here
 * reaches a model provider: fetch is made to fail for the whole file. */

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { score } from "./graders";
import { DEFAULT_MODEL, runTask } from "./harness";
import { firstDifference, IdMap, matchTokens, mockModel, readRecording, readRecordings, tokensOf, type Recording } from "./mock";
import { taskById, TASKS } from "./tasks";
import type { AssistantMessage, ToolMessage } from "../lib/llm";

const HERE = new URL(".", import.meta.url).pathname;
/** the recordings the gate plays: the latest real run kept with keep-mock.ts */
const LATEST = join(HERE, "recorded", "mock", "2026-11-09-batch5");

const fetchSpy = vi.fn(async () => {
  throw new Error("a mock run must not go online");
});
beforeAll(() => vi.stubGlobal("fetch", fetchSpy));
afterAll(() => {
  vi.unstubAllGlobals();
  expect(fetchSpy).not.toHaveBeenCalled();
});

const play = async (rec: Recording, o: { mapIds?: boolean } = {}) => {
  const task = taskById(rec.task)!;
  const out = await runTask(task, { model: { ...DEFAULT_MODEL, key: "" }, mock: (store) => mockModel(rec, store, o), renderers: null, drawings: { left: Infinity } });
  return { out, s: score(task.checks, out.observed), report: out.mock! };
};
const recording = (task: string) => structuredClone(readRecording(join(LATEST, task))!);

describe("token matching", () => {
  /* a plain LCS length by dynamic programming, to hold Myers' diff to */
  const lcs = (a: string[], b: string[]) => {
    const d = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    return d[a.length][b.length];
  };
  it("finds a longest common subsequence, in order, of matching tokens", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) >>> 0) % n);
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: rnd(14) }, () => "abcd"[rnd(4)]);
      const b = Array.from({ length: rnd(14) }, () => "abcd"[rnd(4)]);
      const pairs = matchTokens(a, b)!;
      expect(pairs.length).toBe(lcs(a, b));
      for (const [i, j] of pairs) expect(a[i]).toBe(b[j]);
      for (let k = 1; k < pairs.length; k++) expect(pairs[k][0] > pairs[k - 1][0] && pairs[k][1] > pairs[k - 1][1]).toBe(true);
    }
  });
  it("gives up past its edit limit", () => {
    expect(matchTokens(["a", "b", "c"], ["x", "y", "z"], 2)).toBeNull();
  });
  it("splits text into words and what is between them", () => {
    expect(tokensOf('{"itemId":"4p29dq8h"} {{data.ab12cd34}}')).toEqual(['{"', "itemId", '":"', "4p29dq8h", '"} {{', "data", ".", "ab12cd34", "}}"]);
  });
  it("shows two texts around where they first differ", () => {
    expect(firstDifference("abc 1 xyz", "abc 22 xyz", 2)).toEqual({ recorded: "…c 1 x…", now: "…c 22 x…" });
  });
});

describe("pairing the ids the code makes", () => {
  const start = { frames: [{ id: "home" }], groups: [{ id: "f17", items: [{ id: "title" }] }] };
  it("pairs the ids a result names now with the ones it named then, and rewrites later calls through them", () => {
    const ids = new IdMap(JSON.stringify(start));
    const doc = JSON.stringify({ ...start, groups: [...start.groups, { id: "q1w2e3r4", items: [{ id: "k9j8h7g6" }] }] });
    expect(ids.learn('{"itemId":"a1b2c3d4","groupId":"z9y8x7w6"}', '{"itemId":"k9j8h7g6","groupId":"q1w2e3r4"}', doc, 1)).toEqual([]);
    expect([...ids.map]).toEqual([
      ["a1b2c3d4", "k9j8h7g6"],
      ["z9y8x7w6", "q1w2e3r4"],
    ]);
    /* in values, in keys, inside expressions; what is no id of the code's stays */
    const { value, orphans } = ids.rewrite({ ops: [{ id: "a1b2c3d4", into: "home", text: "{{data.a1b2c3d4}} title", overrides: { z9y8x7w6: { text: "x" } } }] });
    expect(value).toEqual({ ops: [{ id: "k9j8h7g6", into: "home", text: "{{data.k9j8h7g6}} title", overrides: { q1w2e3r4: { text: "x" } } }] });
    expect(orphans).toEqual([]);
  });
  it("pairs through an outline whose sizes and words changed around the ids", () => {
    const ids = new IdMap(JSON.stringify(start));
    const then = '## screen home "Home" 412×892\n  - a1b2c3d4 box "Box" @16,16 380×120 [layout=column]\n    - title text "Title" @16,16 380×24\n    - e5f6g7h8 button "Go" @16,48 120×40';
    const now = '## screen home "Home" 412×892\n  - k9j8h7g6 box "Box" @16,16 380×128 [layout=column, kit card]\n    - title text "Title" @16,16 380×28\n    - m3n4b5v6 button "Go" @16,52 132×40';
    ids.learn(then, now, JSON.stringify({ ...start, ids: ["k9j8h7g6", "m3n4b5v6"] }), 2);
    expect(Object.fromEntries(ids.map)).toEqual({ a1b2c3d4: "k9j8h7g6", e5f6g7h8: "m3n4b5v6" });
  });
  it("leaves alone what is no new id: ids of the start, words, numbers, ids not in the document now", () => {
    const ids = new IdMap(JSON.stringify(start));
    ids.saw("a prompt that names the tools: screen, layout, bookmark");
    ids.learn('{"id":"f17","w":412,"kind":"layout","named":"bookmark"}', '{"id":"title","w":380,"kind":"column","named":"settings"}', JSON.stringify({ ...start, x: "settings" }), 1);
    expect(ids.map.size).toBe(0);
    ids.learn('{"itemId":"a1b2c3d4"}', '{"itemId":"k9j8h7g6"}', JSON.stringify(start), 1);
    expect(ids.map.size).toBe(0);
  });
  it("reports an id that pairs two ways", () => {
    const ids = new IdMap(JSON.stringify(start));
    const doc = JSON.stringify({ a: "k9j8h7g6", b: "q1w2e3r4" });
    ids.learn('{"itemId":"a1b2c3d4"}', '{"itemId":"k9j8h7g6"}', doc, 1);
    expect(ids.learn('{"itemId":"a1b2c3d4"}', '{"itemId":"q1w2e3r4"}', doc, 2)).toHaveLength(1);
    expect(ids.map.get("a1b2c3d4")).toBe("k9j8h7g6");
  });
  it("names an id the code made then that nothing pairs now when a later call uses it", () => {
    const ids = new IdMap(JSON.stringify(start));
    /* the result now has a different shape: two ids then, one now */
    ids.learn('{"made":["a1b2c3d4","e5f6g7h8"]}', '{"made":["k9j8h7g6"],"note":"merged"}', JSON.stringify({ x: "k9j8h7g6" }), 3);
    expect(ids.orphans.has("a1b2c3d4") || ids.orphans.has("e5f6g7h8")).toBe(true);
    const used = [...ids.orphans.keys()][0];
    expect(ids.rewrite({ id: used }).orphans).toEqual([used]);
    expect(ids.rewrite({ id: "title" }).orphans).toEqual([]);
  });
});

describe("a recorded run played back", () => {
  it("plays clean on the code it was recorded with, its ids paired", async () => {
    const { report, s } = await play(recording("cart-ko"));
    expect(report.divergences).toEqual([]);
    expect(report.played).toBe(report.turns);
    expect(report.mapped).toBeGreaterThan(10);
    expect(s.pass).toBe(true);
  });
  it("needs the pairing: without it the recorded calls name parts that are not there", async () => {
    const { report } = await play(recording("cart-ko"), { mapIds: false });
    expect(report.divergences.some((d) => d.kind === "status" && d.detail === "succeeded then, fails now")).toBe(true);
  });
  it("reports a call the tools now refuse: the step, the call, what it gave then and now", async () => {
    const rec = recording("stepper-vars");
    const turn = rec.transcript.find((m): m is AssistantMessage => m.role === "assistant" && m.content.some((p) => p.type === "tool_call" && p.name === "apply_ops"))!;
    const call = turn.content.find((p) => p.type === "tool_call")!;
    if (call.type !== "tool_call") throw new Error("no call");
    /* a recording whose op the current code does not know: as if the code had renamed it */
    call.argsText = call.argsText.replace('"op":"add_var"', '"op":"add_variable"');
    call.args = JSON.parse(call.argsText);
    const { report } = await play(rec);
    const first = report.divergences[0];
    expect(first).toMatchObject({ step: 1, kind: "status", detail: "succeeded then, fails now", call: { name: "apply_ops" } });
    expect(first.recorded).toContain('"ran":7');
    expect(first.now).toMatch(/add_variable/);
  });
  it("reports a call that succeeds now where it failed then", async () => {
    const rec = recording("stepper-vars");
    const tools = rec.transcript.find((m): m is ToolMessage => m.role === "tool")!;
    tools.results[0].isError = true;
    const { report } = await play(rec);
    expect(report.divergences).toEqual([expect.objectContaining({ step: 1, kind: "status", detail: "failed then, succeeds now" })]);
  });
  it("reports turns the recording does not have, and turns left over", async () => {
    const short = recording("stepper-vars");
    short.transcript.pop();
    const a = await play(short);
    expect(a.report.divergences).toEqual([expect.objectContaining({ kind: "turns", detail: expect.stringMatching(/asked the model again after the recording's 2 turns/) })]);
    const long = recording("stepper-vars");
    long.transcript.push({ role: "user", content: "more" }, { role: "assistant", content: [{ type: "text", text: "and more" }] });
    const b = await play(long);
    expect(b.report.divergences.map((d) => d.kind)).toContain("turns");
  });
  it("answers the tools' own model calls with what they made then", async () => {
    const { report, out } = await play(recording("paper-style"));
    expect(report.divergences).toEqual([]);
    expect(out.observed.final.styles?.some((x) => (x as { key?: string }).key === "custom:warm-paper-journal")).toBe(true);
    const svg = await play(recording("svg-tab-icon"));
    expect(svg.report.divergences).toEqual([]);
    expect(Object.keys(svg.out.observed.final.icons ?? {})).toContain("dotted-route");
  });
});

/* The gate: the latest real run of every task, played on the code as it is. A divergence means the code now answers
   a recorded call differently (see the report: `bun run eval -- --mock <dir> --no-shots --only <task>`); when that is
   meant, run the tasks for real once credit allows and keep the new run (evals/README.md). */
describe("the latest recorded run of every task, played on the current code", () => {
  const all = readRecordings(LATEST);
  it("has a recording of every task", () => {
    expect(all.map((r) => r.recording.task).sort()).toEqual(TASKS.map((t) => t.id).sort());
  });
  for (const { name, recording: rec } of all) {
    it(`${name}: no divergence, the critical checks pass`, { timeout: 120_000 }, async () => {
      const { report, s } = await play(structuredClone(rec));
      expect(report.divergences, JSON.stringify(report.divergences, null, 2)).toEqual([]);
      expect(s.verdicts.filter((v) => v.critical && !v.pass).map((v) => `${v.id}: ${v.detail}`)).toEqual([]);
      expect(s.pass).toBe(true);
    });
  }
});
