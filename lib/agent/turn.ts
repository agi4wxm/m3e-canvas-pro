/* One turn of the in-app agent: the author's request goes to the model with the document's context, the model plans,
 * acts with the tools, looks at what it made and fixes it, and the turn ends as one undo step with a summary of what
 * changed. Stopping it mid-turn takes back what it did and keeps what the author changed meanwhile (ledger.ts); the
 * result says whether all of it went back, part of it (and what stayed), or none. Built on lib/llm's `runAgent`
 * (streaming, any provider) and lib/tools (every change through the document core, origin `ai`). */

import { savedDoc, type CoreState, type DocStore } from "../core";
import { frameOfPart } from "../tokens";
import { addUsage, emptyUsage, runAgent, type Adapter, type AgentStop, type Message, type ToolOutput, type Usage, type UserPart } from "../llm";
import { createRegistry, executeTool, toolDefs, toolGuide, type Attachment, type GenerateEnv, type Registry, type Renderer, type ToolOutcome } from "../tools";
import { GENERATE_TOOLS } from "../tools/generate";
import { atomsReference } from "../tools/atoms";
import type { Pixels } from "../tools/pixels";
import type { Lang } from "../i18n";
import { diffDocs, isEmptyDiff, touchedScreens, type DocDiff } from "./diff";
import { changedMeanwhile, declined, namedIn, plainlyAsksToRemove, removalOf, unchecked, type ConfirmRemoval, type RemovalAsk } from "./guard";
import { TurnLedger, type RevertReport } from "./ledger";
import { prunePictures } from "./pictures";
import { agentSystem, turnContext } from "./prompt";
import { loadTools, setsFor, setsGuide, toolsIn, TOOL_SETS, type ToolSet } from "./toolsets";

export type TurnEvent =
  | { type: "step"; step: number }
  | { type: "text"; step: number; delta: string }
  | { type: "reasoning"; step: number; delta: string }
  | { type: "tool_start"; step: number; id: string; name: string; args: Record<string, unknown> | null }
  | { type: "tool_end"; step: number; id: string; name: string; ok: boolean; summary: string; images: string[]; ms: number }
  | { type: "review"; screens: string[]; images: string[] }
  | { type: "retry"; attempt: number; delayMs: number }
  /** a call that would take away much of the author's work waits for their answer (guard.ts); then what they said */
  | { type: "ask"; step: number; id: string; ask: RemovalAsk }
  | { type: "answer"; step: number; id: string; allow: boolean }
  /** what the turn has spent so far */
  | { type: "usage"; usage: Usage };

export type TurnOptions = {
  store: DocStore;
  adapter: Adapter;
  /** the conversation before this turn; it is never edited, only added to */
  history: Message[];
  /** what the author asked */
  request: string;
  /** pictures the author attached to this request (a screenshot to copy): shown to the model with it */
  images?: Attachment[];
  /** every picture attached in the conversation so far, this turn's included, for the tools to read by id */
  attachments?: Attachment[];
  /** the tool sets the conversation has loaded (lib/agent/toolsets.ts); a turn only ever adds to them */
  sets?: readonly ToolSet[];
  /** decodes a picture for the tools that measure one */
  pixels?: (dataUrl: string) => Promise<Pixels>;
  lang: Lang;
  renderer?: Renderer;
  /** what the generative tools draw with; left out, the agent cannot draw */
  gen?: Omit<GenerateEnv, "budget" | "styles">;
  /** how many drawings a turn may make (2 by default) */
  drawings?: number;
  /** how many styles a turn may have the text model write, revisions included (2 by default) */
  styles?: number;
  /** how many model calls the turn may make, reviews included (30 by default) */
  maxSteps?: number;
  /** how many times the runner shows the model its changed screens when it did not look itself (1 by default) */
  reviews?: number;
  /** a word for the model in front of the request (the author undid the last turn…) */
  note?: string;
  /** Asks the author whether a call that would take away much of their work, which the request does not plainly ask
   *  for, may go ahead (the chat panel's Allow / Don't). Left out, such a call is declined: there is no one to ask. */
  confirm?: ConfirmRemoval;
  signal?: AbortSignal;
  onEvent?: (e: TurnEvent) => void;
};

export type TurnResult = {
  /** the conversation after the turn: the history as it was when the turn was stopped and taken back */
  messages: Message[];
  stop: AgentStop;
  error?: unknown;
  /** the model's last words to the author */
  text: string;
  usage: Usage;
  steps: number;
  ms: number;
  diff: DocDiff;
  changed: boolean;
  /** the undo step the turn is, while it is the last one in the history and the author did not edit in between */
  step?: { label: string; depth: number };
  /** everything stopped was taken back */
  rolledBack: boolean;
  /** what taking a stopped turn back did: all of it, part of it (and what stayed, and why), or none */
  revert?: RevertReport;
  /** Takes a finished turn back later, keeping what the author changed meanwhile and after (the panel's undo when one
   *  undo step would not do it); `release` once the turn is kept or another starts. */
  takeBack?: { run: () => RevertReport; release: () => void };
  /** drawings made with a model */
  drawings: number;
  /** the tool sets loaded by the end of the turn: what the next turn starts with */
  sets: ToolSet[];
};

/** The system prompt and every tool a turn may load. The prompt names all of them by set whichever are loaded, so it
 *  is the same for the whole conversation. */
export function agentSetup(o: { canSee: boolean; canDraw: boolean; drawings: number; styles?: number; load?: (sets: ToolSet[]) => ToolSet[] }): { registry: Registry; system: string } {
  const extra = [...(o.canDraw ? GENERATE_TOOLS : []), loadTools(o.load ?? ((s) => s))];
  const all = createRegistry({ extra });
  const unseen = new Set(o.canSee ? [] : ["screenshot", "compare_to_reference"]);
  const registry = unseen.size ? createRegistry({ extra, only: all.tools.filter((t) => !unseen.has(t.name)).map((t) => t.name) }) : all;
  return { registry, system: agentSystem({ guide: `${toolGuide(registry.tools, { list: false })}\n\n${setsGuide(registry.tools)}`, canSee: o.canSee, drawings: o.canDraw ? o.drawings : 0, styles: o.canDraw ? (o.styles ?? 2) : 0, parts: atomsReference() }) };
}

/** what a model reads back from a call: the result as text, and any picture */
const LIMIT = 24_000;
function outputOf(o: ToolOutcome, name: string): ToolOutput {
  if (!o.ok) return { content: [{ type: "text", text: JSON.stringify(o.error) }], isError: true };
  let text = typeof o.result === "string" ? o.result : JSON.stringify(o.result);
  if (text.length > LIMIT) text = `${text.slice(0, LIMIT)}\n…(cut short: ask for less, e.g. one screen, a smaller depth or a limit)`;
  const images: UserPart[] = (o.images ?? []).map((dataUrl, i) => ({ type: "image", dataUrl, detail: "auto", name: `picture ${i + 1} of a ${name} call` }));
  return { content: [{ type: "text", text }, ...images] };
}

/** a call's result in a few words, for the step list */
function summaryOf(name: string, o: ToolOutcome): string {
  if (!o.ok) return o.error.message;
  const r = o.result as Record<string, unknown> | string | null;
  if (typeof r === "string") return `${r.split("\n").length} lines`;
  if (!r || typeof r !== "object") return "";
  if (name === "apply_ops") return `${r.ran} changes`;
  if ("nothing_to_do" in r) return String(r.nothing_to_do);
  if (typeof r.itemId === "string") return r.itemId;
  if (typeof r.id === "string") return r.id;
  return "";
}

const REVIEW =
  "Here is how the screens you changed look now. Compare them with the request. If something is wrong (parts overlapping or cut off, uneven spacing, misaligned edges, missing content, words in the wrong language), fix it with the tools now; otherwise answer the author in one or two sentences. An open select, menu or date picker hangs over what is below it on the canvas: that is how the canvas draws them, leave it.";

export async function runTurn(o: TurnOptions): Promise<TurnResult> {
  const t0 = Date.now();
  const { store } = o;
  const emit = (e: TurnEvent) => {
    try {
      o.onEvent?.(e);
    } catch {
      /* a listener that fails must not stop the turn */
    }
  };
  const before = store.get();
  const label = `AI: ${o.request.trim().replace(/\s+/g, " ").slice(0, 40)}`;
  /* what the turn changes, apart from what the author changes meanwhile */
  const ledger = new TurnLedger(store);
  let step: { label: string; depth: number } | undefined;
  const onTop = () => {
    if (!step) return false;
    const h = store.history();
    return h.length === step.depth && h[h.length - 1] === label;
  };
  let dirty = false;
  /* the turn's undo step is taken once its first change has landed, from the state just before it; a change after the
     author took a step of their own gets a step of the turn's again */
  const onWrite = (prev: CoreState) => {
    dirty = true;
    if (onTop()) return;
    store.checkpoint(label, { from: prev, whole: true, origin: "ai" });
    step = { label, depth: store.history().length };
  };

  const drawings = o.drawings ?? 2;
  const styles = o.styles ?? 2;
  const gen: GenerateEnv | undefined = o.gen ? { ...o.gen, budget: { left: drawings }, styles: { left: styles, of: styles } } : undefined;
  const images = o.images ?? [];
  const attachments = o.attachments ?? images;
  /* the sets loaded so far, those this request calls for, and those the model loads as it goes */
  const loaded = new Set<ToolSet>([...(o.sets ?? []), ...setsFor(o.request, { attachments: images.length })]);
  if (attachments.length) loaded.add("reference");
  const load = (sets: ToolSet[]) => {
    for (const x of sets) loaded.add(x);
    return TOOL_SETS.filter((x) => loaded.has(x));
  };
  const { registry, system } = agentSetup({ canSee: !!o.renderer, canDraw: !!gen, drawings, styles, load });
  const tools = () => toolDefs(toolsIn(registry.tools, [...loaded]));
  const s = store.get();
  const context = turnContext({ doc: s.doc as never, widths: store.ctx("ai").widths, selection: s.session.selection, frameId: s.session.frameId, lang: o.lang });
  const words = [o.note, context, "", o.request.trim()].filter((x) => x !== undefined).join("\n");
  const attached = images.length ? `\n\nAttached ${images.length === 1 ? "picture" : "pictures"} (tools read ${images.length === 1 ? "it" : "them"} by id): ${images.map((a) => `${a.id}${a.w && a.h ? ` (${a.w}×${a.h} px)` : ""}${a.name ? ` "${a.name}"` : ""}`).join(", ")}.` : "";
  const user: Message = images.length
    ? { role: "user", content: [{ type: "text", text: words + attached }, ...images.map((a): UserPart => ({ type: "image", dataUrl: a.dataUrl, detail: "high", name: `the attached picture ${a.id}` }))] }
    : { role: "user", content: words };

  let usage = emptyUsage();
  /* what the readout shows while the turn runs: every model call so far */
  let spent = emptyUsage();
  const outcomes = new Map<string, ToolOutcome>();
  let stepsUsed = 0;
  const maxSteps = o.maxSteps ?? 30;
  let messages: Message[] = [...o.history, user];
  let reviews = o.reviews ?? 1;
  let last: Awaited<ReturnType<typeof runAgent>>;
  let atStep = 0;

  /* A call that would take away much of the author's work waits for their answer; with no one to ask, it is declined.
     What may go is bound to exactly what goes (guard.ts): what the author allowed, and what a plain request names. A
     check that fails is an error, never a pass; an answer given while the document changed holds only for what was
     shown, so the call is checked again and asked about again when it would now take more. */
  const named = plainlyAsksToRemove(o.request);
  const allowed = new Set<string>();
  const covered = (k: { key: string; names: string[] }) => allowed.has(k.key) || (named && namedIn(o.request, k.names));
  const guard = async (call: { id: string; name: string; args: unknown }, signal?: AbortSignal): Promise<ToolOutcome | null> => {
    for (let asked = 0; ; asked++) {
      let ask: RemovalAsk | null;
      try {
        ask = await removalOf(store, ledger.baseline(), call.name, call.args, { registry, selection: before.session.selection, covered });
      } catch (e) {
        return unchecked(e);
      }
      if (!ask) return null;
      if (asked >= 3) return changedMeanwhile(ask);
      const seen = store.get().doc;
      emit({ type: "ask", step: atStep, id: call.id, ask });
      let yes = false;
      try {
        yes = !!o.confirm && !signal?.aborted && (await o.confirm(ask, signal)) === true;
      } catch {
        yes = false;
      }
      emit({ type: "answer", step: atStep, id: call.id, allow: yes });
      if (!yes) return declined(ask);
      for (const k of ask.keys) allowed.add(k);
      if (store.get().doc === seen) return null;
    }
  };

  for (;;) {
    const offset = stepsUsed;
    last = await runAgent({
      adapter: o.adapter,
      system,
      messages,
      tools,
      prepare: (m) => prunePictures(m),
      maxSteps: Math.max(1, maxSteps - stepsUsed),
      signal: o.signal,
      execute: async (call, ctx) => {
        const held = await guard(call, ctx.signal);
        if (held) {
          outcomes.set(call.id, held);
          return outputOf(held, call.name);
        }
        const out = await executeTool(store, call.name, call.args, { origin: "ai", history: "none", onWrite, renderer: o.renderer, signal: ctx.signal, gen, registry, attachments, ...(o.pixels ? { pixels: o.pixels } : {}) });
        if (out.ok && (call.name === "screenshot" || call.name === "compare_to_reference")) dirty = false;
        outcomes.set(call.id, out);
        return outputOf(out, call.name);
      },
      onEvent: (e) => {
        const at = offset + e.step;
        atStep = at;
        if (e.type === "step") emit({ type: "step", step: at });
        else if (e.type === "text") emit({ type: "text", step: at, delta: e.delta });
        else if (e.type === "reasoning") emit({ type: "reasoning", step: at, delta: e.delta });
        else if (e.type === "tool_start") emit({ type: "tool_start", step: at, id: e.call.id, name: e.call.name, args: e.call.args });
        else if (e.type === "tool_end") {
          const out = outcomes.get(e.call.id);
          const words = e.result.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
          emit({ type: "tool_end", step: at, id: e.call.id, name: e.call.name, ok: out ? out.ok : !e.result.isError, summary: out ? summaryOf(e.call.name, out) : words.slice(0, 200), images: out?.ok ? (out.images ?? []) : [], ms: e.ms });
        } else if (e.type === "retry") emit({ type: "retry", attempt: e.attempt, delayMs: e.delayMs });
        else if (e.type === "done") {
          spent = addUsage(spent, e.usage);
          emit({ type: "usage", usage: spent });
        }
      },
    });
    usage = addUsage(usage, last.usage);
    stepsUsed += last.steps;
    messages = last.messages;
    /* the model finished without looking at what it changed: it is shown, once, and may fix what it sees */
    if (last.stop !== "end_turn" || !reviews || !o.renderer || !dirty || stepsUsed >= maxSteps || o.signal?.aborted) break;
    reviews--;
    const now = store.get();
    const diff = diffDocs(savedDoc(before), savedDoc(now));
    const screens = touchedScreens(diff, now.doc as never, (id) => {
      const g = now.doc.groups.find((x) => x.items.some((it) => it.id === id));
      return g ? frameOfPart(g, now.doc.groups, now.doc.frames, store.ctx("ai").widths)?.id : undefined;
    }).slice(0, 2);
    if (!screens.length) break;
    const shots: string[] = [];
    try {
      for (const id of screens) shots.push(await o.renderer.screenshot(id, { signal: o.signal }));
    } catch {
      break;
    }
    dirty = false;
    emit({ type: "review", screens, images: shots });
    messages = [...messages, { role: "user", content: [{ type: "text", text: REVIEW }, ...shots.map((dataUrl, i): UserPart => ({ type: "image", dataUrl, detail: "auto", name: `the review picture of ${screens[i]}` }))] }];
  }

  const aborted = last.stop === "aborted";
  /* a stopped turn is discarded, not undone: its own changes go, the author's stay, and nothing waits to be redone */
  const revert = aborted ? ledger.revert(label) : undefined;
  const rolledBack = revert?.outcome === "full" || revert?.outcome === "none";
  /* one undo step takes the turn back only when nothing of the author's came in between */
  const single = !ledger.authorEdited;
  const takeBack = !aborted && ledger.changed ? { run: () => ledger.revert(label), release: () => ledger.close() } : undefined;
  if (!takeBack) ledger.close();
  const after = store.get();
  const diff = diffDocs(savedDoc(before), savedDoc(after));
  return {
    messages: aborted ? o.history : messages,
    stop: last.stop,
    ...(last.error !== undefined ? { error: last.error } : {}),
    text: last.text,
    usage,
    steps: stepsUsed,
    ms: Date.now() - t0,
    diff,
    changed: !isEmptyDiff(diff),
    ...(step && onTop() && single ? { step } : {}),
    rolledBack,
    ...(revert ? { revert } : {}),
    ...(takeBack ? { takeBack } : {}),
    drawings: gen ? drawings - (gen.budget?.left ?? drawings) : 0,
    sets: aborted ? [...new Set(["build" as const, ...(o.sets ?? [])])] : TOOL_SETS.filter((x) => loaded.has(x)),
  };
}
