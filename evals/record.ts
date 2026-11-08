/* Recording runs and reading them back. A recorded run is a folder per task run:
 *
 *   observed.json     everything the graders read (both documents, the measured sizes, the calls, how it ended)
 *   result.json       the verdict of every check, the score, the judge's opinion, what it cost
 *   calls.json        the tool calls in order, with their arguments, results and times
 *   transcript.json   the conversation (pictures written out as files, opaque reasoning left out)
 *   start.json, final.json   the documents as project files: open them in the editor to look
 *   *.png             the screens before and after, and every picture the agent looked at
 *
 * `observed.json` may also be gzipped (observed.json.gz), as the small committed set for the unit test is. */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "fflate";
import { formatProject } from "../lib/core/projectFile";
import { loadDocument, projectFile } from "../lib/project";
import type { Doc } from "../lib/tokens";
import type { RunOutput } from "./harness";
import type { JudgeVerdict, Observed, TaskScore } from "./types";

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export function writeRun(dir: string, out: RunOutput, result: TaskScore & { cost?: number }) {
  mkdirSync(dir, { recursive: true });
  const o = out.observed;
  writeFileSync(join(dir, "observed.json"), JSON.stringify(o));
  writeFileSync(join(dir, "result.json"), json({ ...result, usage: o.usage, turnUsage: o.turnUsage, ms: o.ms, steps: o.steps, stop: o.stop, drawings: o.drawings, ...(o.error ? { error: o.error } : {}), text: o.text }));
  writeFileSync(join(dir, "calls.json"), json(o.calls));
  writeFileSync(join(dir, "transcript.json"), json(out.transcript));
  writeFileSync(join(dir, "start.json"), formatProject(projectFile(o.start)));
  writeFileSync(join(dir, "final.json"), formatProject(projectFile(o.final)));
  for (const [name, url] of Object.entries(out.pictures)) {
    const b64 = url.slice(url.indexOf(",") + 1);
    writeFileSync(join(dir, name), Buffer.from(b64, "base64"));
  }
}

/** an observation read back */
export function readObserved(dir: string): Observed | null {
  const plain = join(dir, "observed.json");
  const zipped = `${plain}.gz`;
  if (existsSync(plain)) return asRead(JSON.parse(readFileSync(plain, "utf8")) as Observed);
  if (existsSync(zipped)) return asRead(JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(zipped))))) as Observed);
  return null;
}

/** A recorded run's documents as the format reads them now: one recorded by an earlier version is an old document,
 *  brought up by the steps after it (lib/migrations.ts), as it would be if opened; a newer one's steps find nothing. */
function asRead(o: Observed): Observed {
  const read = (d: Doc) => loadDocument(d)?.doc ?? d;
  return { ...o, start: read(o.start), final: read(o.final) };
}

/** every recorded run under a folder (each folder holding an observation), by folder name */
export function readRuns(root: string): { name: string; dir: string; observed: Observed }[] {
  const out: { name: string; dir: string; observed: Observed }[] = [];
  const here = readObserved(root);
  if (here) return [{ name: here.task, dir: root, observed: here }];
  for (const name of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const o = readObserved(join(root, name));
    if (o) out.push({ name, dir: join(root, name), observed: o });
  }
  return out;
}

/** what the judge said of a recorded run, if it was asked */
export function recordedJudge(dir: string): JudgeVerdict | undefined {
  const file = join(dir, "result.json");
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { judge?: JudgeVerdict }).judge;
}

/** the after-pictures of a recorded run, as data URLs, for the judge */
export function shotsOf(dir: string, o: Observed): string[] {
  return o.shots.map((s) => join(dir, s.file)).filter(existsSync).map((f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`);
}
