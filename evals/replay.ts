/* Replaying recorded runs: each one graded again with the checks as they are now, without calling the agent. What
 * `bun run eval -- --replay <dir>` prints and writes, and what the unit test grades the committed runs with. */

import { score } from "./graders";
import { readRuns, recordedJudge, shotsOf } from "./record";
import { PRICES, rowOf, type Price, type RunRow } from "./report";
import { taskById, TASKS } from "./tasks";
import type { EvalTask, JudgeVerdict, Observed } from "./types";

export type ReplayOptions = {
  /** asks the judge again (given the run's after-pictures); left out, a recorded opinion stands */
  judge?: (task: EvalTask, o: Observed, shots: string[]) => Promise<JudgeVerdict | undefined>;
  /** the prices to estimate with; by default the list price of the model each run used */
  price?: Price;
  /** told of each run as it is graded */
  onRow?: (row: RunRow) => void;
  /** told of a run that no task matches any more */
  onSkip?: (name: string, task: string) => void;
};

/** every run under `dir`, graded again, in the order the suite runs its tasks (repeats of a task together) */
export async function replay(dir: string, o: ReplayOptions = {}): Promise<{ rows: RunRow[]; model?: string; effort?: string }> {
  const order = (id: string) => TASKS.findIndex((t) => t.id === id);
  const runs = readRuns(dir).sort((a, b) => order(a.observed.task) - order(b.observed.task) || a.name.localeCompare(b.name));
  const rows: RunRow[] = [];
  for (const run of runs) {
    const task = taskById(run.observed.task);
    if (!task) {
      o.onSkip?.(run.name, run.observed.task);
      continue;
    }
    const s = score(task.checks, run.observed);
    const j = o.judge ? await o.judge(task, run.observed, shotsOf(run.dir, run.observed)) : recordedJudge(run.dir);
    const row = rowOf(run.name, { task: task.id, ability: task.ability, title: task.title, ...s, ...(j ? { judge: j } : {}) }, run.observed, o.price ?? PRICES[run.observed.model]);
    rows.push(row);
    o.onRow?.(row);
  }
  return { rows, ...(runs[0] ? { model: runs[0].observed.model, effort: runs[0].observed.effort } : {}) };
}
