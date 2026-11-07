/* The evaluation suite's command line (bun run eval). See evals/README.md.
 *
 *   bun run eval                                  every task once, with gpt-6.1-sol at medium effort
 *   bun run eval -- --only login-material,data    tasks by id, or every task of an ability
 *   bun run eval -- --repeat 3 --record out/      three runs a task, each recorded
 *   bun run eval -- --replay out/                 grade recorded runs again, no model called
 *   bun run eval -- --replay out/ --judge         and have a model judge their screenshots
 *
 * The key comes from OPENAI_API_KEY (ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY for the others); with none,
 * OpenAI's requests carry a placeholder for a proxy that adds the key on the way out. A key is never printed. Bun's
 * fetch goes through HTTPS_PROXY by itself; under Node the proxy-aware fetch the MCP server uses is put in its place. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createAdapter } from "../lib/llm";
import type { Provider } from "../lib/ai";
import { providerSpec } from "../lib/ai";
import { proxyFetch } from "../mcp/src/generate";
import { score } from "./graders";
import { attachmentOf, DEFAULT_MODEL, Renderers, runTask, settingsOf, type ModelConfig } from "./harness";
import { judge } from "./judge";
import { writeRun } from "./record";
import { replay } from "./replay";
import { PRICES, rowOf, summaryMarkdown, totalsOf, type Price, type RunRow } from "./report";
import { TASKS } from "./tasks";
import type { EvalTask, JudgeVerdict, TaskScore } from "./types";

const HELP = `bun run eval [options]

  --only <ids|abilities>   comma-separated task ids or abilities (new-screen, edit, data, variables, components,
                           styles, svg, replicate, game, multilingual, ambiguous, flow, long-screen, product)
  --repeat <n>             run each task n times
  --provider <name>        openai (default), claude, gemini, deepseek
  --model <id>             the text model (default gpt-6.1-sol)
  --effort <low|medium|high>   reasoning effort (default medium)
  --image-model <id>       the image model (default gpt-image-2.6-sunburst)
  --budget-tokens <n>      cap every task's token budget
  --max-drawings <n>       drawings (images, SVG) the whole suite may make (default: what the tasks allow)
  --destructive <answer>   what the author says when the agent asks to take away much of their work: decline
                           (default, the author who wants to be asked first) or allow
  --record <dir>           write each run (transcript, calls, documents, screenshots, scores, usage) and a summary
  --artifacts <dir>        put the per-run folders here instead of in --record (keep big pictures out of git)
  --replay <dir>           grade recorded runs again without calling the agent
  --judge                  also have a vision model score each run's screenshots 1–5
  --judge-model <id>       the judge's model (default: --model)
  --price <in,cached,out>  dollars per million tokens for the cost estimate
  --no-shots               no headless Chromium: no screenshots during or after the turn
  --title <text>           the heading of summary.md
  --list                   list the tasks
  -h, --help
`;

const { values: v } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    only: { type: "string" },
    repeat: { type: "string" },
    provider: { type: "string" },
    model: { type: "string" },
    effort: { type: "string" },
    "image-model": { type: "string" },
    "budget-tokens": { type: "string" },
    "max-drawings": { type: "string" },
    destructive: { type: "string" },
    record: { type: "string" },
    artifacts: { type: "string" },
    replay: { type: "string" },
    judge: { type: "boolean" },
    "judge-model": { type: "string" },
    price: { type: "string" },
    "no-shots": { type: "boolean" },
    list: { type: "boolean" },
    title: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (v.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (v.list) {
  for (const t of TASKS) console.log(`${t.id.padEnd(22)} ${t.ability.padEnd(13)} ${t.lang}  ${t.title}`);
  process.exit(0);
}

/* Node's fetch ignores HTTPS_PROXY; the MCP server's proxy-aware one stands in (Bun needs nothing) */
const pf = proxyFetch();
if (pf) globalThis.fetch = pf;

const provider = (v.provider ?? "openai") as Provider;
const KEYS: Record<Provider, string> = { openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", deepseek: "DEEPSEEK_API_KEY" };
const model: ModelConfig = {
  ...DEFAULT_MODEL,
  provider,
  baseUrl: providerSpec(provider).baseUrl,
  model: v.model ?? (provider === "openai" ? DEFAULT_MODEL.model : providerSpec(provider).model),
  effort: (["low", "medium", "high"].includes(v.effort ?? "") ? v.effort : "medium") as ModelConfig["effort"],
  key: process.env[KEYS[provider]]?.trim() || (provider === "openai" ? "proxy-injected" : ""),
  ...(v["image-model"] ? { imageModel: v["image-model"] } : {}),
};
const price: Price | undefined = v.price ? (([input, cachedInput, output]) => ({ input, cachedInput, output }))(v.price.split(",").map(Number)) : PRICES[model.model];
const judgeAdapter = v.judge ? createAdapter(settingsOf({ ...model, model: v["judge-model"] ?? model.model }), { effort: "low" }) : null;

const picked = (() => {
  if (!v.only) return TASKS;
  const want = v.only.split(",").map((s) => s.trim()).filter(Boolean);
  const out = TASKS.filter((t) => want.includes(t.id) || want.includes(t.ability));
  const unknown = want.filter((w) => !TASKS.some((t) => t.id === w || t.ability === w));
  if (unknown.length) {
    console.error(`Unknown task or ability: ${unknown.join(", ")}. bun run eval -- --list shows them.`);
    process.exit(2);
  }
  return out;
})();

const date = new Date().toISOString().slice(0, 10);
const write = (dir: string | undefined, rows: RunRow[], meta: { title: string; model: string; effort: string; price?: Price }) => {
  const judgedRuns = rows.some((r) => r.judge);
  const md = summaryMarkdown(rows, { ...meta, date, ...(judgedRuns ? { note: "with the vision judge" } : {}) });
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.md"), md);
    writeFileSync(join(dir, "results.json"), `${JSON.stringify({ date, model: meta.model, effort: meta.effort, provider: model.provider, totals: totalsOf(rows), runs: rows.map(({ text, ...r }) => ({ ...r, text: text.slice(0, 600) })) }, null, 2)}\n`);
  }
  return md;
};

const line = (r: RunRow) => `${r.pass ? "PASS" : "FAIL"} ${r.name.padEnd(24)} score ${r.score.toFixed(2)}  ${r.steps} steps  ${Math.round((r.usage.input + r.usage.output) / 1000)}k tokens  ${Math.round(r.ms / 1000)}s  ${r.stop}${r.judge ? `  judge ${r.judge.score}` : ""}${r.verdicts.some((x) => !x.pass) ? `  failed: ${r.verdicts.filter((x) => !x.pass).map((x) => x.id).join(", ")}` : ""}`;

async function judged(task: EvalTask, request: string, shots: string[]): Promise<JudgeVerdict | undefined> {
  if (!judgeAdapter) return undefined;
  return judge(judgeAdapter, { request, shots, ...(task.reference ? { reference: attachmentOf(task.reference).dataUrl } : {}) });
}

/* ---------- replay: recorded runs graded again ---------- */

if (v.replay) {
  const { rows, model: used, effort } = await replay(resolve(v.replay), {
    ...(judgeAdapter ? { judge: (task, o, shots) => judged(task, o.request, shots) } : {}),
    ...(v.price ? { price } : {}),
    onRow: (row) => console.log(line(row)),
    onSkip: (name, task) => console.error(`skipped ${name}: there is no task ${task} any more`),
  });
  const replayPrice = v.price ? price : used ? PRICES[used] : undefined;
  const md = write(v.record, rows, { title: v.title ?? "Replayed eval runs", model: used ?? model.model, effort: effort ?? model.effort, ...(replayPrice ? { price: replayPrice } : {}) });
  if (!v.record) console.log(`\n${md}`);
  process.exit(0);
}

/* ---------- live runs ---------- */

const renderers = v["no-shots"] ? null : new Renderers();
if (renderers && !renderers.available) console.warn("No app build found (bun run build): running without screenshots.");
const drawings = { left: v["max-drawings"] !== undefined ? Number(v["max-drawings"]) : Infinity };
const repeat = Math.max(1, Number(v.repeat ?? 1));
const rows: RunRow[] = [];
const artifacts = v.artifacts ?? v.record;
try {
  for (const task of picked) {
    for (let i = 1; i <= repeat; i++) {
      const name = repeat > 1 ? `${task.id}#${i}` : task.id;
      console.log(`\n▶ ${name}: ${task.request}`);
      let out: Awaited<ReturnType<typeof runTask>>;
      try {
        out = await runTask(task, {
          model,
          renderers: renderers?.available ? renderers : null,
          ...(v["budget-tokens"] ? { budgetTokens: Number(v["budget-tokens"]) } : {}),
          drawings,
          destructive: v.destructive === "allow" ? "allow" : "decline",
          onEvent: (e) => {
            if (e.type === "tool_end") console.log(`  [${e.step}] ${e.ok ? "ok " : "ERR"} ${e.name}${e.summary ? `: ${e.summary.slice(0, 100)}` : ""} (${(e.ms / 1000).toFixed(1)}s)`);
            else if (e.type === "review") console.log(`  review: ${e.screens.join(", ")}`);
            else if (e.type === "retry") console.log(`  retry ${e.attempt} in ${Math.round(e.delayMs / 1000)}s`);
          },
        });
      } catch (e) {
        /* a run the harness itself could not finish is reported and the suite goes on */
        console.error(`  harness error in ${name}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        continue;
      }
      const s = score(task.checks, out.observed);
      const j = await judged(task, task.request, out.observed.shots.map((x) => out.pictures[x.file]).filter(Boolean));
      const result: TaskScore = { task: task.id, ability: task.ability, title: task.title, ...s, ...(j ? { judge: j } : {}) };
      const row = rowOf(name, result, out.observed, price);
      rows.push(row);
      if (artifacts) writeRun(join(resolve(artifacts), name.replace("#", "-")), out, { ...result, ...(row.cost !== undefined ? { cost: row.cost } : {}) });
      console.log(line(row));
    }
  }
} finally {
  await renderers?.close();
}
const md = write(v.record ? resolve(v.record) : undefined, rows, { title: v.title ?? "Eval run", model: model.model, effort: model.effort, ...(price ? { price } : {}) });
console.log(`\n${md}`);
