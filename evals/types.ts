/* The shapes of the evaluation suite: a task (a starting document, what a person asks, what it may spend, how it is
 * graded), what a run of it leaves behind for the graders (`Observed`, which is also what a recording keeps, so a
 * recorded run can be graded again without the model), and what grading says. */

import type { Usage } from "../lib/llm/types";
import type { Lang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";

export type Widths = Record<string, number>;

/** what one task may spend before the harness stops asking the model */
export type Budget = {
  /** model calls in the turn (the turn runner's maxSteps) */
  steps: number;
  /** input + output tokens of every model call, the ones the tools make included */
  tokens: number;
  /** wall time of the turn */
  ms: number;
  /** drawings with a model (SVG, pictures) the harness lets through; the turn's own allowance, and the prompt that
   *  names it, stay the app's. The suite-wide cap (--max-drawings) applies too. */
  drawings?: number;
};

/** the abilities the tasks are spread over, for the report */
export type Ability = "new-screen" | "edit" | "data" | "variables" | "components" | "styles" | "svg" | "replicate" | "game" | "multilingual" | "ambiguous" | "flow" | "long-screen";

export type EvalTask = {
  id: string;
  ability: Ability;
  /** one line for the report */
  title: string;
  /** the editor's language: the words on the canvas should be in it */
  lang: Lang;
  /** what the author types, the way a person would */
  request: string;
  /** the starting document (evals/fixtures.ts) */
  fixture: string;
  /** parts selected when the request is sent */
  select?: string[];
  /** the screen selected when the request is sent */
  selectScreen?: string;
  /** a picture attached to the request, a file in evals/refs */
  reference?: string;
  budget: Budget;
  checks: Check[];
};

/** one recorded tool call */
export type CallRecord = {
  step: number;
  id: string;
  name: string;
  /** the arguments, cut short when long */
  args: unknown;
  /** the operations of a batch (apply_ops), kept whole when the arguments are cut short */
  ops?: string[];
  ok: boolean;
  error?: { code: string; message: string };
  summary: string;
  ms: number;
};

/** Everything a run left that the graders read. Recorded runs keep it as observed.json beside start.json and
 *  final.json (the documents as project files), so they can be graded again offline. */
export type Observed = {
  task: string;
  lang: Lang;
  request: string;
  model: string;
  effort: string;
  start: Doc;
  final: Doc;
  /** the sizes parts came out at when the start was drawn, guesses where nothing was drawn */
  startWidths: Widths;
  /** the same after the turn */
  widths: Widths;
  calls: CallRecord[];
  /** how the turn ended: end_turn, max_steps, max_tokens, refusal, aborted, error */
  stop: string;
  error?: string;
  /** the agent's last words to the author */
  text: string;
  /** every model call, the ones tools made (generate_style, SVG as code) included */
  usage: Usage;
  /** the turn runner's own count */
  turnUsage: Usage;
  ms: number;
  steps: number;
  drawings: number;
  /** whether one undo took the whole turn back to the start; null when the turn changed nothing */
  undo: { steps: number; restores: boolean } | null;
  /** how alike each changed screen is to the attached reference (compareGrid, 0–100) */
  likeness?: { screen: string; similarity: number }[];
  /** screenshots taken after the turn, files beside observed.json */
  shots: { screen: string; file: string }[];
  budget: Budget;
  /** each model call's tokens, in order (the tools' own calls among them) */
  perCall?: { input: number; cachedInput: number; output: number }[];
  /** what the harness stopped, if it did: "tokens", "time" */
  cut?: string;
};

export type CheckResult = { pass: boolean; detail: string };

export type Check = {
  id: string;
  /** what it checks, in a few words, for the report */
  label: string;
  /** how much it counts towards the task's score (1 by default) */
  weight?: number;
  /** the task fails without it whatever the score */
  critical?: boolean;
  run(g: Graded): CheckResult;
};

/** a check's verdict as reported */
export type Verdict = { id: string; label: string; pass: boolean; detail: string; weight: number; critical: boolean };

/** a vision model's opinion of the result */
export type JudgeVerdict = { score: number; reasons: string[]; usage?: Usage; error?: string };

export type TaskScore = { task: string; ability: Ability; title: string; pass: boolean; score: number; verdicts: Verdict[]; judge?: JudgeVerdict };

/** what the graders get: the observation and what is worked out from it once */
export type Graded = import("./graders").Graded;
