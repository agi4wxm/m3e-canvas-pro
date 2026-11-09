/* The report: a row per run (pass, score, the judge's opinion, steps, tokens, time, how it ended, which checks
 * failed), the suite's totals (pass rate, mean score, mean tokens and time, an estimated cost), and every check's
 * verdict below. Written as Markdown (summary.md) and JSON (results.json). */

import type { Usage } from "../lib/llm";
import type { MockReport } from "./mock";
import type { Observed, TaskScore } from "./types";

/** US dollars per million tokens */
export type Price = { input: number; cachedInput: number; output: number };

/* Assumed list prices for the estimate only (not a quote): set your own with --price in,cached,out. A drawing (an image
 * or SVG from the image model) is counted at a flat rate on top. */
export const PRICES: Record<string, Price> = {
  "gpt-6.1-sol": { input: 1.25, cachedInput: 0.125, output: 10 },
};
export const DRAWING_PRICE = 0.04;

export function costOf(u: Usage, price: Price | undefined, drawings = 0): number | undefined {
  if (!price) return undefined;
  const fresh = Math.max(0, u.input - u.cachedInput);
  return (fresh * price.input + u.cachedInput * price.cachedInput + u.output * price.output) / 1e6 + drawings * DRAWING_PRICE;
}

export type RunRow = TaskScore & {
  /** the run's folder name: the task's id, with #n for a repeat */
  name: string;
  lang: string;
  usage: Usage;
  ms: number;
  steps: number;
  stop: string;
  drawings: number;
  cost?: number;
  error?: string;
  text: string;
  /** a mock run (evals/mock.ts): how the recorded turns played on the current code */
  mock?: MockReport;
};

export const rowOf = (name: string, s: TaskScore, o: Observed, price?: Price): RunRow => ({
  ...s,
  name,
  lang: o.lang,
  usage: o.usage,
  ms: o.ms,
  steps: o.steps,
  stop: o.stop,
  drawings: o.drawings,
  ...(costOf(o.usage, price, o.drawings) !== undefined ? { cost: costOf(o.usage, price, o.drawings) } : {}),
  ...(o.error ? { error: o.error } : {}),
  text: o.text,
});

export type Totals = { runs: number; tasks: number; passed: number; passRate: number; meanScore: number; meanTokens: number; meanCachedShare: number; meanMs: number; drawings: number; cost?: number; meanJudge?: number };

export function totalsOf(rows: RunRow[]): Totals {
  const n = rows.length || 1;
  const sum = (f: (r: RunRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const judged = rows.filter((r) => r.judge && r.judge.score > 0);
  const costs = rows.map((r) => r.cost).filter((c): c is number => c !== undefined);
  const input = sum((r) => r.usage.input);
  return {
    runs: rows.length,
    tasks: new Set(rows.map((r) => r.task)).size,
    passed: rows.filter((r) => r.pass).length,
    passRate: Math.round((rows.filter((r) => r.pass).length / n) * 100) / 100,
    meanScore: Math.round((sum((r) => r.score) / n) * 100) / 100,
    meanTokens: Math.round(sum((r) => r.usage.input + r.usage.output) / n),
    meanCachedShare: input ? Math.round((sum((r) => r.usage.cachedInput) / input) * 100) / 100 : 0,
    meanMs: Math.round(sum((r) => r.ms) / n),
    drawings: sum((r) => r.drawings),
    ...(costs.length === rows.length && rows.length ? { cost: Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100 } : {}),
    ...(judged.length ? { meanJudge: Math.round((judged.reduce((a, r) => a + r.judge!.score, 0) / judged.length) * 10) / 10 } : {}),
  };
}

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const s = (ms: number) => `${Math.round(ms / 1000)}s`;
const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function summaryMarkdown(rows: RunRow[], meta: { title: string; model: string; effort: string; date: string; note?: string; price?: Price }): string {
  const t = totalsOf(rows);
  const lines: string[] = [];
  lines.push(`# ${meta.title}`, "");
  lines.push(`${meta.date} · ${meta.model} · effort ${meta.effort}${meta.note ? ` · ${meta.note}` : ""}`, "");
  lines.push("| | |", "| --- | --- |");
  lines.push(`| Runs | ${t.runs} (${t.tasks} tasks) |`);
  lines.push(`| Passed | ${t.passed}/${t.runs} (${Math.round(t.passRate * 100)}%) |`);
  lines.push(`| Mean score | ${t.meanScore.toFixed(2)} |`);
  if (t.meanJudge !== undefined) lines.push(`| Mean judge score (1–5) | ${t.meanJudge} |`);
  lines.push(`| Mean tokens | ${k(t.meanTokens)} (${Math.round(t.meanCachedShare * 100)}% of input cached) |`);
  lines.push(`| Mean time | ${s(t.meanMs)} |`);
  lines.push(`| Drawings | ${t.drawings} |`);
  if (t.cost !== undefined) lines.push(`| Est. cost | $${t.cost.toFixed(2)} total, $${(t.cost / (t.runs || 1)).toFixed(2)} per run${meta.price ? ` (assumed $${meta.price.input}/${meta.price.cachedInput}/${meta.price.output} per M input/cached/output, $${DRAWING_PRICE} per drawing)` : ""} |`);
  lines.push("");
  lines.push("| Task | Ability | Lang | Pass | Score | Judge | Steps | Tokens in (cached) / out | Time | Stop | Failed checks |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const failed = r.verdicts.filter((v) => !v.pass).map((v) => `${v.critical ? "**" : ""}${v.id}${v.critical ? "**" : ""}`);
    lines.push(`| ${r.name} | ${r.ability} | ${r.lang} | ${r.pass ? "PASS" : "FAIL"} | ${r.score.toFixed(2)} | ${r.judge ? (r.judge.score || "–") : ""} | ${r.steps} | ${k(r.usage.input)} (${k(r.usage.cachedInput)}) / ${k(r.usage.output)} | ${s(r.ms)} | ${r.stop} | ${failed.join(", ")} |`);
  }
  lines.push("", "Failed checks in **bold** are critical: the task fails with them whatever its score.", "");
  if (rows.some((r) => r.mock)) lines.push(...mockSection(rows));
  lines.push("## Checks", "");
  for (const r of rows) {
    lines.push(`### ${r.name}: ${r.title}`, "");
    for (const v of r.verdicts) lines.push(`- ${v.pass ? "ok" : "**FAIL**"} ${v.id}${v.critical ? " (critical)" : ""}: ${cell(v.detail)}`);
    if (r.judge) lines.push(`- judge: ${r.judge.score || "–"}${r.judge.reasons.length ? ` — ${r.judge.reasons.map(cell).join("; ")}` : ""}${r.judge.error ? ` (${cell(r.judge.error)})` : ""}`);
    if (r.error) lines.push(`- error: ${cell(r.error)}`);
    if (r.text) lines.push(`- answer: ${cell(r.text.slice(0, 400))}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** A mock run's playback: per task, the turns played, the ids paired, and every place the current code answered a
 *  recorded call differently (a call that failed or succeeded where it did not, an id that would not pair). */
function mockSection(rows: RunRow[]): string[] {
  const lines = ["## Playback", "", "Recorded model turns played on the current code (evals/mock.ts). A divergence is a recorded call the tools now answer differently (it fails where it succeeded, or the other way round), an id the code made that would not pair, or turns left over or missing: the code changed what the tools accept, or the model would have to adapt. Changed words and sizes are only counted.", ""];
  lines.push("| Task | Turns played | Ids mapped | Results changed | Divergences | First divergence |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const m = r.mock;
    if (!m) continue;
    const d = m.divergences[0];
    lines.push(`| ${r.name} | ${m.played}/${m.turns} | ${m.mapped} | ${m.changed} | ${m.divergences.length} | ${d ? cell(`step ${d.step}${d.call ? ` ${d.call.name}` : ""}: ${d.detail}`) : ""} |`);
  }
  lines.push("");
  for (const r of rows) {
    if (!r.mock?.divergences.length && !r.mock?.changes.length) continue;
    lines.push(`### ${r.name}: playback`, "");
    for (const d of r.mock.divergences) {
      lines.push(`- step ${d.step}, ${d.kind}: ${cell(d.detail)}`);
      if (d.call) lines.push(`  - call: \`${d.call.name}\` ${cell(JSON.stringify(d.call.args ?? null).slice(0, 400))}`);
      if (d.recorded !== undefined) lines.push(`  - then: ${cell(d.recorded)}`);
      if (d.now !== undefined) lines.push(`  - now: ${cell(d.now)}`);
    }
    for (const c of r.mock.changes) lines.push(`- step ${c.step}, \`${c.call}\` answers differently (not a divergence): then ${cell(JSON.stringify(c.recorded))}, now ${cell(JSON.stringify(c.now))}`);
    lines.push("");
  }
  return lines;
}
