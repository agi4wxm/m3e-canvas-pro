/* Copies recorded runs into evals/recorded for the unit test: each run's observed.json, gzipped, and the verdicts the
 * graders give it now written to expected.json. Run it after changing what a check decides, once the new verdicts are
 * looked over, or to add a run.
 *
 *   bun evals/keep-recorded.ts <recorded runs folder> <run> [<run>…]
 *   bun evals/keep-recorded.ts --update        only rewrite expected.json from the runs already kept
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "fflate";
import { score } from "./graders";
import { readRuns } from "./record";
import { taskById } from "./tasks";

const DIR = join(new URL(".", import.meta.url).pathname, "recorded");
const args = process.argv.slice(2);

if (args[0] !== "--update") {
  const [from, ...names] = args;
  if (!from || !names.length) {
    console.error("bun evals/keep-recorded.ts <recorded runs folder> <run> [<run>…]");
    process.exit(2);
  }
  for (const name of names) {
    const text = readFileSync(join(from, name, "observed.json"));
    mkdirSync(join(DIR, name), { recursive: true });
    writeFileSync(join(DIR, name, "observed.json.gz"), gzipSync(new Uint8Array(text), { level: 9, mtime: 0 }));
    console.log(`kept ${name}`);
  }
}

const expected: Record<string, { pass: boolean; failed: string[] }> = {};
for (const run of readRuns(DIR)) {
  const task = taskById(run.observed.task);
  if (!task) throw new Error(`${run.name}: there is no task ${run.observed.task}`);
  const s = score(task.checks, run.observed);
  expected[run.name] = { pass: s.pass, failed: s.verdicts.filter((v) => !v.pass).map((v) => v.id) };
}
writeFileSync(join(DIR, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`);
console.log(JSON.stringify(expected, null, 2));
