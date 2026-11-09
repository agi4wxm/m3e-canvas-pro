/* Keeps real runs for the mock model (evals/mock.ts): for each task, the conversation (gzipped, the model's
 * reasoning words left out) and what the mock reads of the run (run.json: the tokens of each model call, the sizes
 * measured, what generative calls made, what grading said), without pictures. Run it after a real run of the suite,
 * with the folders that run wrote (--artifacts, or --record without it); for a task found in several, the last run
 * that passed is kept (the last one at all when none did, with a warning).
 *
 *   bun evals/keep-mock.ts <name> <run folder> [<run folder>…] [--source <where it came from>]
 *
 * writes evals/recorded/mock/<name>/<task>/; `bun run eval -- --mock evals/recorded/mock/<name>` plays it back. */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { recordingOf, writeRecording } from "./mock";
import { taskById } from "./tasks";

const ROOT = join(new URL(".", import.meta.url).pathname, "recorded", "mock");
const args = process.argv.slice(2).filter((a) => a !== "--");
const at = args.indexOf("--source");
const source = at >= 0 ? args.splice(at, 2)[1] : undefined;
const [name, ...dirs] = args;
if (!name || !dirs.length || !/^[\w.-]+$/.test(name)) {
  console.error("bun evals/keep-mock.ts <name> <run folder> [<run folder>…] [--source <text>]");
  process.exit(2);
}

/* every run folder (observed.json, result.json and transcript.json side by side), by task */
const runs = new Map<string, { dir: string; pass: boolean }[]>();
for (const root of dirs.map((d) => resolve(d))) {
  for (const sub of readdirSync(root).sort()) {
    const dir = join(root, sub);
    if (!statSync(dir).isDirectory() || !["observed.json", "result.json", "transcript.json"].every((f) => existsSync(join(dir, f)))) continue;
    const { task, pass } = JSON.parse(readFileSync(join(dir, "result.json"), "utf8")) as { task: string; pass: boolean };
    if (!taskById(task)) {
      console.warn(`skipped ${dir}: there is no task ${task} any more`);
      continue;
    }
    runs.set(task, [...(runs.get(task) ?? []), { dir, pass }]);
  }
}

const out = join(ROOT, name);
rmSync(out, { recursive: true, force: true });
for (const [task, list] of [...runs].sort(([a], [b]) => a.localeCompare(b))) {
  const pick = list.filter((r) => r.pass).at(-1) ?? list.at(-1)!;
  if (!pick.pass) console.warn(`${task}: no run passed; keeping ${pick.dir}`);
  writeRecording(join(out, task), recordingOf(pick.dir, source));
  console.log(`kept ${task} from ${pick.dir}`);
}
console.log(`${runs.size} tasks in ${out}`);
