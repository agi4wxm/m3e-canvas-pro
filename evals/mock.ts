/* The mock model: a recorded real run played back through the in-app agent as it is now. Each model request of the
 * turn is answered with the next assistant turn of the recording (its words and tool calls), so the same system
 * prompt, tool sets, loop, guard, undo and grading run on the current code without calling any provider. What the
 * tools answer now is compared with what they answered then, call by call:
 *
 * - a call that succeeded then and fails now (or the other way round) is a divergence: the code changed what the
 *   tools accept, or what they do with it;
 * - ids the code makes (new parts, groups, a style's key) come out different on every run, so they are paired:
 *   the recorded result and the current one are aligned token by token, and where an id-shaped token of the
 *   recording stands against a different one now, the recorded id is mapped to the current one. Later recorded
 *   calls are rewritten through that map before they run. An id that cannot be paired (its result changed shape
 *   around it) and is used later, or that pairs two ways, is a divergence too;
 * - the turn asking for more model turns than were recorded, or ending with recorded turns left, is a divergence.
 *
 * Words, sizes and numbers that differ in a result are not divergences: the recorded model read the old ones and
 * would have read the new ones, which only a real run can tell. The tools' own model calls (generate_style, SVG
 * written as code) are answered with what they made then (the style or drawing in the recorded final document), and
 * with --no-shots the pictures are stand-ins: a blank picture, the sizes the recorded run measured. */

import { gunzipSync, gzipSync } from "fflate";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocStore } from "../lib/core";
import { emptyUsage, type Adapter, type AssistantMessage, type AssistantPart, type LlmEvent, type LlmRequest, type Message, type ToolMessage, type ToolResult, type Usage } from "../lib/llm";
import { encodePng } from "../lib/mocks/formats/codecs";
import type { RemoteDrawing, Renderer } from "../lib/tools";
import type { Doc } from "../lib/tokens";
import type { Observed, Widths } from "./types";

/* ---------- what is kept of a recorded run ---------- */

type Tokens = { input: number; cachedInput: number; output: number };

/** What the mock needs of one recorded run, besides its conversation (transcript.json.gz). */
export type RecordingMeta = {
  task: string;
  model: string;
  effort: string;
  /** where it came from (the commit, the run) */
  source?: string;
  /** what grading said then */
  pass: boolean;
  failed: string[];
  stop: string;
  /** the tokens of each agent turn, and of each model call a tool made, in order */
  usage: { turns: Tokens[]; tools: Tokens[] };
  /** the sizes measured before and after the turn, for the stand-in pictures */
  startWidths: Widths;
  widths: Widths;
  likeness?: Observed["likeness"];
  /** what a generative call made, by call id: an SVG's markup, a style written by the model, a picture */
  made: Record<string, { markup?: string; style?: unknown; image?: string }>;
};

export type Recording = RecordingMeta & { transcript: Message[] };

const GENERATIVE = new Set(["generate_style", "generate_svg", "generate_image"]);
/* the tools whose work goes through the text model: their calls take a share of the recorded tokens */
const USES_TEXT_MODEL = (name: string, args: Record<string, unknown> | null) => name === "generate_style" || (name === "generate_svg" && args?.route === "code");

const resultText = (r: ToolResult) => r.content.map((p) => (p.type === "text" && !/^\[picture [^\]]+\]$/.test(p.text) ? p.text : "")).join("\n");
const jsonOr = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

/** The compact recording of a run folder (what `--record`/`--artifacts` wrote): the conversation without the
 *  model's reasoning words, and what the mock reads from observed.json and result.json. */
export function recordingOf(dir: string, source?: string): Recording {
  const o = JSON.parse(readFileSync(join(dir, "observed.json"), "utf8")) as Observed;
  const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8")) as { pass: boolean; verdicts: { id: string; pass: boolean }[] };
  const raw = JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8")) as Message[];
  const transcript = raw.map((m): Message => (m.role === "assistant" ? { ...m, content: m.content.filter((p) => p.type !== "reasoning") } : m));
  /* the recorded calls, and what each generative one made, found in the final document */
  const made: RecordingMeta["made"] = {};
  const calls: { name: string; args: Record<string, unknown> | null }[][] = [];
  for (const m of transcript) {
    if (m.role === "assistant") calls.push(m.content.flatMap((p) => (p.type === "tool_call" ? [{ name: p.name, args: p.args }] : [])));
    if (m.role !== "tool") continue;
    for (const r of m.results) {
      if (!GENERATIVE.has(r.name) || r.isError) continue;
      const out = jsonOr(resultText(r)) ?? {};
      const item = typeof out.itemId === "string" ? o.final.groups.flatMap((g) => g.items).find((it) => it.id === out.itemId) : undefined;
      const props = (item?.props ?? {}) as Record<string, unknown>;
      if (r.name === "generate_style" && typeof out.key === "string") {
        const style = o.final.styles?.find((x) => (x as { key?: string }).key === out.key);
        if (style) made[r.callId] = { style };
      } else if (r.name === "generate_svg") {
        const icon = typeof out.icon === "string" ? o.final.icons?.[out.icon.replace(/^svg:/, "")] : undefined;
        const markup = icon ?? (typeof props.markup === "string" ? props.markup : undefined);
        if (markup) made[r.callId] = { markup };
      } else if (r.name === "generate_image") {
        const src = typeof props.src === "string" ? props.src : undefined;
        if (src) made[r.callId] = { image: src };
      }
    }
  }
  /* each agent turn's tokens in order; what is left over went to the tools' own model calls, one each */
  const per = o.perCall ?? [];
  const turns: Tokens[] = [];
  const tools: Tokens[] = [];
  let at = 0;
  let extra = per.length - calls.length;
  for (const list of calls) {
    if (at < per.length) turns.push(per[at++]);
    for (const c of list) {
      if (extra > 0 && USES_TEXT_MODEL(c.name, c.args) && at < per.length) {
        tools.push(per[at++]);
        extra--;
      }
    }
  }
  while (at < per.length) tools.push(per[at++]);
  return {
    task: o.task,
    model: o.model,
    effort: o.effort,
    ...(source ? { source } : {}),
    pass: result.pass,
    failed: result.verdicts.filter((v) => !v.pass).map((v) => v.id),
    stop: o.stop,
    usage: { turns, tools },
    startWidths: o.startWidths,
    widths: o.widths,
    ...(o.likeness ? { likeness: o.likeness } : {}),
    made,
    transcript,
  };
}

/** a recording written as the committed set keeps it: run.json beside the gzipped conversation */
export function writeRecording(dir: string, r: Recording) {
  mkdirSync(dir, { recursive: true });
  const { transcript, ...meta } = r;
  writeFileSync(join(dir, "run.json"), `${JSON.stringify(meta)}\n`);
  writeFileSync(join(dir, "transcript.json.gz"), gzipSync(new TextEncoder().encode(JSON.stringify(transcript)), { level: 9, mtime: 0 }));
}

export function readRecording(dir: string): Recording | null {
  const meta = join(dir, "run.json");
  if (!existsSync(meta)) return null;
  const transcript = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(join(dir, "transcript.json.gz")))))) as Message[];
  return { ...(JSON.parse(readFileSync(meta, "utf8")) as RecordingMeta), transcript };
}

/** every recording under a folder, by folder name */
export function readRecordings(root: string): { name: string; recording: Recording }[] {
  const here = readRecording(root);
  if (here) return [{ name: here.task, recording: here }];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .flatMap((name) => {
      const recording = readRecording(join(root, name));
      return recording ? [{ name, recording }] : [];
    });
}

/* ---------- pairing the ids the code makes ---------- */

const TOKEN = /[A-Za-z0-9]+|[^A-Za-z0-9]+/g;
export const tokensOf = (s: string): string[] => s.match(TOKEN) ?? [];
/* What an id the code makes looks like: lowercase letters and digits (lib/tokens.ts `uid`: 8 of them; a custom
   style's key ends in 4). A word of the same shape is told apart by the rules of `learn`. */
const ID_SHAPE = /^[a-z0-9]{4,12}$/;
/* what an id the code made looks like when nothing pairs it: uid's 8 or a style key's 4, with a digit unless it is a
   word nobody has used (the prompt, the tools, the model's own calls) */
const MADE_SHAPE = /^(?:[a-z0-9]{8}|[a-z0-9]{4})$/;

/** Matched index pairs of a longest common subsequence of two token lists (Myers' O(ND) diff), or null when they
 *  differ by more than `maxD` edits. */
export function matchTokens(a: string[], b: string[], maxD = 4000): [number, number][] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) pairs.push([--x, --y]);
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

export type Divergence = {
  /** the model turn of the recording whose call it is (1 is the first) */
  step: number;
  kind: "status" | "id" | "turns";
  /** the call: its tool and arguments as they ran now */
  call?: { id: string; name: string; args: unknown };
  /** what it gave then and now, cut short */
  recorded?: string;
  now?: string;
  detail: string;
};

/** The ids of a recording paired with the ids the code makes now. */
export class IdMap {
  /** recorded id → id now */
  readonly map = new Map<string, string>();
  private back = new Map<string, string>();
  /** recorded ids the code made that could not be paired, and the step whose result named them */
  readonly orphans = new Map<string, number>();
  /** the tokens of the starting document: an id it has is nobody's new id */
  private known: Set<string>;
  /** words the prompt, the tools and the model's own calls used: an id the code made is none of them */
  private words = new Set<string>();
  constructor(start: Doc | string) {
    this.known = new Set(tokensOf(typeof start === "string" ? start : JSON.stringify(start)));
  }

  /** words that are not ids the code made: the prompt and tools as sent, what the model wrote itself */
  saw(text: string) {
    for (const t of tokensOf(text)) if (ID_SHAPE.test(t) && !this.map.has(t) && !this.orphans.has(t)) this.words.add(t);
  }

  /** Learns what a call's recorded result and its result now pair, given the document now. Returns the pairs that
   *  contradict ones already learned. */
  learn(recorded: string, now: string, docNow: string, step: number): string[] {
    if (recorded === now) return [];
    const a = tokensOf(recorded);
    const b = tokensOf(now);
    const inDoc = new Set(tokensOf(docNow));
    const fresh = (t: string, side: "rec" | "now") => ID_SHAPE.test(t) && !this.known.has(t) && (side === "rec" ? !this.words.has(t) : inDoc.has(t));
    /* an id the code made that nothing pairs is one the current result does not have at all */
    const nowHas = new Set(b);
    const conflicts: string[] = [];
    const pair = (r: string, c: string) => {
      if (r === c) return;
      const had = this.map.get(r);
      const owner = this.back.get(c);
      if (had === c) return;
      if ((had && had !== c) || (owner && owner !== r)) {
        conflicts.push(`${r} → ${had ?? c}${owner && owner !== r ? ` (now ${c} is already ${owner}'s)` : ` and → ${c}`}`);
        return;
      }
      this.map.set(r, c);
      this.back.set(c, r);
      this.orphans.delete(r);
    };
    const orphan = (r: string) => {
      if (this.map.has(r) || this.orphans.has(r) || nowHas.has(r) || !MADE_SHAPE.test(r)) return;
      if (/\d/.test(r) || !this.words.has(r)) this.orphans.set(r, step);
    };
    /* the same number of tokens is the usual case (only ids differ): position against position; otherwise a diff */
    const matched = a.length === b.length ? a.map((_, i) => [i, i] as [number, number]).filter(([i]) => a[i] === b[i]) : matchTokens(a, b);
    if (!matched) {
      for (const t of a) if (fresh(t, "rec")) orphan(t);
      return conflicts;
    }
    /* the gaps between matched tokens hold what changed: the ids made there pair in order when they are as many and
       as long on both sides */
    let i0 = 0;
    let j0 = 0;
    for (const [i, j] of [...matched, [a.length, b.length] as [number, number]]) {
      if (i > i0 || j > j0) {
        const ra = a.slice(i0, i).filter((t) => fresh(t, "rec"));
        const cb = b.slice(j0, j).filter((t) => fresh(t, "now"));
        if (ra.length === cb.length && ra.every((t, x) => t.length === cb[x].length)) ra.forEach((t, x) => pair(t, cb[x]));
        else for (const t of ra) orphan(t);
      }
      i0 = i + 1;
      j0 = j + 1;
    }
    return conflicts;
  }

  /** a recorded call's arguments with every paired id replaced by its id now, and the orphans they name */
  rewrite<T>(value: T): { value: T; orphans: string[] } {
    const used: string[] = [];
    const str = (s: string) =>
      tokensOf(s)
        .map((t) => {
          const to = this.map.get(t);
          if (to) return to;
          if (this.orphans.has(t)) used.push(t);
          return t;
        })
        .join("");
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return str(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [str(k), walk(x)]));
      return v;
    };
    return { value: walk(value) as T, orphans: [...new Set(used)] };
  }
}

/* ---------- the stand-ins ---------- */

const clipText = (s: string, n = 600) => (s.length <= n ? s : `${s.slice(0, n)}…(${s.length} chars)`);

/** two texts around the first place they differ */
export function firstDifference(a: string, b: string, around = 120): { recorded: string; now: string } {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const cut = (s: string) => `${i > around ? "…" : ""}${s.slice(Math.max(0, i - around), Math.min(s.length - j + around, i + 3 * around))}${s.length - j + around < s.length ? "…" : ""}`;
  return { recorded: cut(a), now: cut(b) };
}
const usageOf = (t?: Tokens): Usage => ({ ...emptyUsage(), ...(t ? { input: t.input, cachedInput: t.cachedInput, output: t.output } : {}) });

/** a picture standing in for a screenshot: blank, the screen's shape */
function blankPicture(w = 412, h = 892): string {
  const pw = 64;
  const ph = Math.max(16, Math.min(512, Math.round((pw * h) / Math.max(1, w))));
  const rgba = new Uint8Array(pw * ph * 4).fill(240);
  return `data:image/png;base64,${Buffer.from(encodePng({ w: pw, h: ph, rgba, alpha: false })).toString("base64")}`;
}

const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>';

export type MockReport = {
  /** the recording's model turns, and how many were played */
  turns: number;
  played: number;
  /** recorded ids paired with the ids made now */
  mapped: number;
  /** calls whose result differs from the recording in more than ids (words, sizes): for reading, not divergences */
  changed: number;
  /** the first few of them, around where they first differ */
  changes: { step: number; call: string; recorded: string; now: string }[];
  divergences: Divergence[];
  /** what grading said of the recorded run */
  recorded: { pass: boolean; failed: string[] };
};

/** What a task's run is given in place of the model and the pictures. */
export type MockModel = {
  adapter: Adapter;
  /** the model the tools ask (generate_style, SVG as code) */
  gen: Adapter;
  remote: RemoteDrawing;
  /** pictures without Chromium: blank, sized as the recorded run measured */
  renderer: Renderer;
  likeness?: Observed["likeness"];
  /** told before each call runs, so the tools' model calls know whose they are */
  callStarted(id: string): void;
  /** once the turn is over */
  report(): MockReport;
};

/** The mock model of one recording, for a task run on `store`. `mapIds: false` plays the recorded ids as they are
 *  (for the test that shows the pairing is needed). */
export function mockModel(rec: Recording, store: DocStore, o: { mapIds?: boolean } = {}): MockModel {
  const steps = rec.transcript.flatMap((m, i) => (m.role === "assistant" ? [i] : []));
  const ids = new IdMap(store.get().doc as Doc);
  const divergences: Divergence[] = [];
  let next = 0;
  let changed = 0;
  const changes: MockReport["changes"] = [];
  let started = false;
  let running: string | undefined;
  let toolCall = 0;
  /* the recorded call of each id, as it was rewritten when played */
  const played = new Map<string, { step: number; name: string; args: unknown }>();

  /** what came after recorded assistant turn `s` (its results, a review), up to the next one */
  const after = (s: number): Message[] => rec.transcript.slice(steps[s] + 1, steps[s + 1] ?? rec.transcript.length);

  /** the results the current code gave for the turn just played, against the recording's */
  const compare = (req: LlmRequest) => {
    const s = next - 1;
    const recorded = after(s);
    const recTools = recorded.find((m): m is ToolMessage => m.role === "tool");
    const recReview = recorded.some((m) => m.role === "user");
    const last = req.messages[req.messages.length - 1];
    const nowTools = [...req.messages].reverse().find((m): m is ToolMessage => m.role === "tool");
    const review = last?.role === "user";
    if (review !== recReview) divergences.push({ step: s + 1, kind: "turns", detail: review ? "the runner showed the screens for review where the recording went on" : "the recording was shown its screens for review here and the runner now was not" });
    if (!recTools) return;
    const doc = JSON.stringify(store.get().doc);
    for (const r of recTools.results) {
      const now = nowTools?.results.find((x) => x.callId === r.callId);
      const call = played.get(r.callId);
      const callOf = call ? { id: r.callId, name: call.name, args: call.args } : { id: r.callId, name: r.name, args: null };
      const was = resultText(r);
      if (!now) {
        divergences.push({ step: s + 1, kind: "status", call: callOf, recorded: clipText(was), detail: "the call did not run" });
        continue;
      }
      const is = resultText(now);
      if (!!r.isError !== !!now.isError) divergences.push({ step: s + 1, kind: "status", call: callOf, recorded: clipText(was), now: clipText(is), detail: r.isError ? "failed then, succeeds now" : "succeeded then, fails now" });
      const conflicts = o.mapIds === false ? [] : ids.learn(was, is, doc, s + 1);
      for (const c of conflicts) divergences.push({ step: s + 1, kind: "id", call: callOf, recorded: clipText(was), now: clipText(is), detail: `the ids pair two ways: ${c}` });
      const mapped = ids.rewrite(was).value;
      if (mapped !== is) {
        changed++;
        if (changes.length < 8) changes.push({ step: s + 1, call: callOf.name, ...firstDifference(mapped, is) });
      }
    }
  };

  const adapter: Adapter = {
    kind: "openai-responses",
    model: rec.model,
    async *stream(req): AsyncIterable<LlmEvent> {
      started = true;
      if (next === 0) ids.saw(req.system);
      ids.saw(JSON.stringify(req.tools ?? []));
      for (const m of req.messages) if (m.role === "user") ids.saw(typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(" "));
      if (next > 0) compare(req);
      else {
        /* the document and request as the model is shown them: a changed fixture or context shows here first */
        /* pictures left out: the recording has words in their place (a file name, "left out to save room") */
        const words = (m: Message | undefined) => (m?.role !== "user" ? "" : typeof m.content === "string" ? m.content : m.content.flatMap((p) => (p.type === "text" && !/^\[[^\]]*picture[^\]]*\]$/.test(p.text) ? [p.text] : [])).join("\n"));
        const then = words(rec.transcript.find((m) => m.role === "user"));
        const now = words(req.messages[req.messages.length - 1]);
        if (then !== now) {
          changed++;
          changes.push({ step: 0, call: "(the request and its context)", ...firstDifference(then, now) });
        }
      }
      const s = next++;
      const at = steps[s];
      if (at === undefined) {
        divergences.push({ step: s + 1, kind: "turns", detail: `the turn asked the model again after the recording's ${steps.length} turns` });
        const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "" }], kind: "openai-responses", model: rec.model };
        yield { type: "done", stop: "end_turn", message, usage: emptyUsage() };
        return;
      }
      const m = rec.transcript[at] as AssistantMessage;
      const content: AssistantPart[] = [];
      for (const p of m.content) {
        if (p.type === "text") {
          content.push({ type: "text", text: p.text });
          yield { type: "text", delta: p.text };
        } else if (p.type === "tool_call") {
          const { value, orphans } = ids.rewrite({ args: p.args, argsText: p.argsText });
          ids.saw(p.argsText);
          for (const o of orphans) divergences.push({ step: s + 1, kind: "id", call: { id: p.id, name: p.name, args: value.args }, detail: `the call names ${o}, an id the code made at step ${ids.orphans.get(o)} that has no counterpart now` });
          const args = value.args;
          const argsText = args ? JSON.stringify(args) : value.argsText;
          played.set(p.id, { step: s + 1, name: p.name, args });
          const call = { id: p.id, name: p.name, args, argsText };
          content.push({ type: "tool_call", ...call });
          yield { type: "tool_call_start", id: p.id, name: p.name };
          yield { type: "tool_call", call };
        }
      }
      const usage = usageOf(rec.usage.turns[s]);
      const message: AssistantMessage = { role: "assistant", content, kind: "openai-responses", model: rec.model };
      yield { type: "usage", usage };
      yield { type: "done", stop: content.some((p) => p.type === "tool_call") ? "tool_use" : "end_turn", message, usage };
    },
  };

  /* a tool's own model call: answered with what that call made in the recording */
  const gen: Adapter = {
    kind: "openai-responses",
    model: rec.model,
    async *stream(): AsyncIterable<LlmEvent> {
      const made = running ? rec.made[running] : undefined;
      const text = made?.style ? JSON.stringify(made.style) : made?.markup ? made.markup : "";
      const usage = usageOf(rec.usage.tools[toolCall++]);
      if (!text) {
        yield { type: "error", error: new Error(`The recording has nothing a model wrote for the call ${running ?? "(none)"}.`) };
        return;
      }
      yield { type: "text", delta: text };
      yield { type: "usage", usage };
      yield { type: "done", stop: "end_turn", message: { role: "assistant", content: [{ type: "text", text }], kind: "openai-responses", model: rec.model }, usage };
    },
  };

  const remote: RemoteDrawing = {
    async svg() {
      const markup = (running && rec.made[running]?.markup) || PLACEHOLDER_SVG;
      return { markup, route: "code", warnings: [], ms: 0 };
    },
    async image() {
      return (running && rec.made[running]?.image) || blankPicture(240, 160);
    },
  };

  /* the sizes the recorded run measured, under the ids they have now: the start's before the turn, the end's after */
  const sizes = (): Widths => {
    const from = started ? rec.widths : rec.startWidths;
    const out: Widths = {};
    for (const [k, v] of Object.entries(from)) {
      const [id, ...rest] = k.split(":");
      out[[ids.map.get(id) ?? id, ...rest].join(":")] = v;
    }
    return out;
  };
  const renderer: Renderer = {
    async screenshot(id, o) {
      if (!o?.doc) store.setWidths((cur) => ({ ...cur, ...sizes() }));
      const f = (o?.doc ?? store.get().doc).frames.find((x) => x.id === id);
      return blankPicture(f?.w, f?.h);
    },
  };

  return {
    adapter,
    gen,
    remote,
    renderer,
    ...(rec.likeness ? { likeness: rec.likeness.map((l) => ({ ...l, screen: ids.map.get(l.screen) ?? l.screen })) } : {}),
    callStarted(id) {
      running = id;
    },
    report() {
      const out = [...divergences];
      if (next < steps.length) out.push({ step: next + 1, kind: "turns", detail: `the turn ended with ${steps.length - next} of the recording's ${steps.length} turns not played` });
      return { turns: steps.length, played: Math.min(next, steps.length), mapped: ids.map.size, changed, changes, divergences: out.sort((a, b) => a.step - b.step), recorded: { pass: rec.pass, failed: rec.failed } };
    },
  };
}
