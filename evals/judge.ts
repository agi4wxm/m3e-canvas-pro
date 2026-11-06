/* The optional vision judge (--judge): a model looks at the screens a run changed, next to the request and the
 * reference picture when there is one, and scores the result 1–5 with its reasons. Off by default: it costs a model
 * call per task and is an opinion, so it is reported beside the deterministic checks and never decides a pass. */

import { collectTurn, textOf, type Adapter, type UserPart } from "../lib/llm";
import type { JudgeVerdict } from "./types";

const SYSTEM = [
  "You review the work of a design agent in a UI editor. You see what an author asked for and screenshots of the screens the agent made or changed (and, when the author attached one, the reference picture first).",
  "Score the result from 1 to 5:",
  "5: does everything asked, looks finished and consistent, nothing broken.",
  "4: does what was asked with small flaws (spacing, alignment, a detail missing).",
  "3: the main thing is there but clearly unfinished or with visible problems (overlaps, cut-off text, wrong language, wrong colors).",
  "2: only part of the request, or badly broken layout.",
  "1: not done, or something else was done.",
  "When there is a reference, judge how closely the screen copies it: layout, spacing, sizes, colors, type and words.",
  'Answer with JSON only: {"score": <1-5>, "reasons": ["<short reason>", …]} with two to five reasons.',
].join("\n");

/** Parses the judge's answer: the JSON object in it, the score kept to 1–5. */
export function parseJudge(text: string): { score: number; reasons: string[] } | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { score?: unknown; reasons?: unknown };
    const score = Math.round(Number(v.score));
    if (!Number.isFinite(score)) return null;
    return { score: Math.min(5, Math.max(1, score)), reasons: Array.isArray(v.reasons) ? v.reasons.map(String).slice(0, 6) : [] };
  } catch {
    return null;
  }
}

export async function judge(adapter: Adapter, o: { request: string; shots: string[]; reference?: string; signal?: AbortSignal }): Promise<JudgeVerdict> {
  /* nothing changed, or nothing could be drawn: there is nothing to look at, and no opinion is given */
  if (!o.shots.length) return { score: 0, reasons: [], error: "no screenshot to judge" };
  const pictures: UserPart[] = [
    ...(o.reference ? [{ type: "image" as const, dataUrl: o.reference, detail: "high" as const }] : []),
    ...o.shots.map((dataUrl) => ({ type: "image" as const, dataUrl, detail: "high" as const })),
  ];
  const words = `The author asked: ${JSON.stringify(o.request)}\n${o.reference ? "The first picture is the reference the author attached; the others are the screens after the agent's turn." : `The ${o.shots.length === 1 ? "picture is the screen" : "pictures are the screens"} after the agent's turn.`}`;
  try {
    const turn = await collectTurn(adapter, { system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: words }, ...pictures] }], maxOutputTokens: 4000 }, o.signal);
    const text = textOf(turn.message);
    const v = parseJudge(text);
    return v ? { ...v, usage: turn.usage } : { score: 0, reasons: [], usage: turn.usage, error: `unreadable answer: ${text.slice(0, 200)}` };
  } catch (e) {
    return { score: 0, reasons: [], error: e instanceof Error ? e.message : String(e) };
  }
}
