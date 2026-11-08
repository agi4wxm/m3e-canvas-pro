/* The in-app agent's side of the editor: the conversation, the turn that is running and what it shows as it goes (its
 * plan, each tool, the pictures it took, what it spent), the pictures the author attaches, and what the author does
 * with a finished turn: keep it, undo it as one step, or try it again. The turn itself runs in lib/agent (runTurn), on
 * the editor's own store. lib/agent, lib/llm and lib/tools are loaded the first time a request is sent, so the editor
 * starts without them. The conversation is kept with its project (agentMemory.ts). */

import { useEffect, useRef, useState } from "react";
import type { Message, Usage } from "@/lib/llm/types";
import type { AgentStop } from "@/lib/llm/loop";
import type { DocDiff } from "@/lib/agent/diff";
import type { RevertReport } from "@/lib/agent/ledger";
import type { TurnEvent, TurnResult } from "@/lib/agent/turn";
import type { Taken } from "@/lib/tools/removals";
import type { Attachment, Renderer } from "@/lib/tools/types";
import { hasKey, isSecureUrl, type AiSettings } from "@/lib/ai";
import { frameOfPart } from "@/lib/tokens";
import type { DocStore } from "@/lib/core";
import { aiErrorText } from "@/components/AiPanel";
import { t, type Lang } from "@/lib/i18n";
import { loadMemory, saveMemory, type KeptTurn } from "./agentMemory";
import type { PickedImage } from "./attachImage";

export type LogEntry =
  | { kind: "text"; step: number; text: string }
  | { kind: "tool"; id: string; name: string; state: "running" | "ok" | "error"; summary: string; ms?: number }
  | { kind: "review"; images: string[] }
  /** a removal the turn waits on the author for (lib/agent/guard.ts), and what they said */
  | { kind: "ask"; id: string; state: "waiting" | "allowed" | "declined"; screens: string[]; parts: number; components: string[]; collections: string[]; takes?: Taken[] };

export type TurnView = {
  id: string;
  request: string;
  /** the pictures attached to it, as the author handed them */
  images?: { id: string; dataUrl: string }[];
  status: "running" | "done" | "stopped" | "error";
  log: LogEntry[];
  reasoning: string;
  /** pictures the agent looked at */
  shots: string[];
  diff?: DocDiff;
  usage: Usage;
  ms: number;
  drawings: number;
  stop?: AgentStop;
  error?: string;
  /** the undo step the turn is */
  step?: { label: string; depth: number };
  verdict?: "kept" | "undone";
  rolledBack?: boolean;
  /** what stopping it, or undoing it later, took back: all, part (and what stayed, and why), or none */
  revert?: Pick<RevertReport, "outcome" | "authorEdited"> & { kept: { name: string; why: string }[] };
  /** it can be taken back keeping what the author changed in between and after, though one undo step would not do it */
  canTakeBack?: boolean;
  /** how long the conversation was before it */
  before: number;
};

const noUsage = (): Usage => ({ input: 0, output: 0, reasoning: 0, cachedInput: 0, cacheWrite: 0 });

export type AgentInputs = {
  store: DocStore;
  settings: AiSettings;
  lang: Lang;
  renderer: Renderer;
  editable: boolean;
  showToast: (msg: string, ms?: number, icon?: string) => void;
  /** the project the conversation belongs to, kept with it; null keeps it only while the page is open */
  project?: string | null;
};

/** a turn as it is kept: what it said and did, without the pictures it looked at */
const keptOf = (x: TurnView): KeptTurn => {
  const { shots: _s, log, images, ...rest } = x;
  return { ...rest, log: log.filter((l) => l.kind !== "review").map((l) => (l.kind === "ask" && l.state === "waiting" ? { ...l, state: "declined" } : l)), ...(images?.length ? { images } : {}), ...(x.status === "running" ? { status: "stopped" } : {}) } as unknown as KeptTurn;
};
const viewOf = (k: KeptTurn): TurnView => ({ shots: [], log: [], reasoning: "", usage: noUsage(), ms: 0, drawings: 0, before: 0, status: "done", ...(k as unknown as Partial<TurnView>), canTakeBack: false }) as TurnView;

/** what the panel keeps of a revert's report */
const reportOf = (r: RevertReport): NonNullable<TurnView["revert"]> => ({ outcome: r.outcome, authorEdited: r.authorEdited, kept: r.kept.slice(0, 8).map((k) => ({ name: k.name, why: k.why })) });

export function useAgent({ store, settings, lang, renderer, editable, showToast, project = null }: AgentInputs) {
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [running, setRunning] = useState(false);
  /** the screen the agent last changed, which wears the thinking ring meanwhile */
  const [agentFrameId, setAgentFrameId] = useState<string | null>(null);
  const messages = useRef<Message[]>([]);
  /** every picture attached in the conversation, by id (ref1, ref2…) */
  const attachments = useRef<Attachment[]>([]);
  /** the tool sets the conversation has loaded (lib/agent/toolsets.ts) */
  const sets = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  /** the author took the last turn back: the model is told on the next one */
  const undone = useRef(false);
  const runningRef = useRef(false);
  /** the answer the running turn waits on, when it asked whether it may take away the author's work */
  const answerRef = useRef<((allow: boolean) => void) | null>(null);
  /** finished turns that can still be taken back keeping the author's edits, by turn id (one at most: the next turn
   *  starts afresh) */
  const takeBacks = useRef(new Map<string, NonNullable<TurnResult["takeBack"]>>());
  const releaseAll = () => {
    for (const h of takeBacks.current.values()) h.release();
    takeBacks.current.clear();
  };

  const ready = hasKey(settings) && settings.model.trim().length > 0 && isSecureUrl(settings.baseUrl);

  /* the project's conversation comes back with it, and is kept whenever no turn is running */
  const recalled = useRef<string | null>(null);
  useEffect(() => {
    if (!project) return;
    let gone = false;
    void loadMemory(project).then((m) => {
      if (gone) return;
      if (m && !runningRef.current) {
        messages.current = m.messages;
        attachments.current = m.attachments ?? [];
        sets.current = m.sets ?? [];
        setTurns(m.turns.map(viewOf));
      }
      recalled.current = project;
    });
    return () => {
      gone = true;
    };
  }, [project]);
  useEffect(() => {
    if (!project || running || recalled.current !== project) return;
    void saveMemory(project, { messages: messages.current, turns: turns.map(keptOf), sets: sets.current, attachments: attachments.current });
  }, [turns, running, project]);

  /* which screen the agent is working on: the one its last change touched */
  useEffect(
    () =>
      store.subscribe((e) => {
        if (e.origin !== "ai" || !runningRef.current || e.kind !== "edit") return;
        const doc = e.state.doc;
        const screen = e.changedIds.find((id) => doc.frames.some((f) => f.id === id));
        if (screen) return setAgentFrameId(screen);
        const g = doc.groups.find((x) => e.changedIds.includes(x.id) || x.items.some((it) => e.changedIds.includes(it.id)));
        const f = g ? frameOfPart(g, doc.groups, doc.frames, e.state.session.widths) : undefined;
        if (f) setAgentFrameId(f.id);
      }),
    [store],
  );
  useEffect(
    () => () => {
      abort.current?.abort();
      releaseAll();
    },
    [],
  );

  const patch = (id: string, fn: (t: TurnView) => TurnView) => setTurns((ts) => ts.map((x) => (x.id === id ? fn(x) : x)));

  const onEvent = (id: string) => (e: TurnEvent) => {
    switch (e.type) {
      case "text":
        patch(id, (x) => {
          const last = x.log[x.log.length - 1];
          if (last?.kind === "text" && last.step === e.step) return { ...x, log: [...x.log.slice(0, -1), { ...last, text: last.text + e.delta }] };
          return { ...x, log: [...x.log, { kind: "text", step: e.step, text: e.delta }] };
        });
        break;
      case "reasoning":
        patch(id, (x) => ({ ...x, reasoning: x.reasoning + e.delta }));
        break;
      case "tool_start":
        patch(id, (x) => ({ ...x, log: [...x.log, { kind: "tool", id: e.id, name: e.name, state: "running", summary: "" }] }));
        break;
      case "tool_end":
        patch(id, (x) => ({
          ...x,
          log: x.log.map((l) => (l.kind === "tool" && l.id === e.id ? { ...l, state: e.ok ? "ok" : "error", summary: e.summary, ms: e.ms } : l)),
          shots: e.images.length ? [...x.shots, ...e.images] : x.shots,
        }));
        break;
      case "review":
        patch(id, (x) => ({ ...x, log: [...x.log, { kind: "review", images: e.images }], shots: [...x.shots, ...e.images] }));
        break;
      case "usage":
        patch(id, (x) => ({ ...x, usage: e.usage }));
        break;
      case "ask":
        patch(id, (x) => ({ ...x, log: [...x.log, { kind: "ask", id: e.id, state: "waiting", screens: e.ask.screens.map((s) => s.name), parts: e.ask.parts, components: e.ask.components.map((c) => c.name), collections: e.ask.collections.map((c) => c.name), ...(e.ask.takes.length ? { takes: e.ask.takes } : {}) }] }));
        break;
      case "answer":
        patch(id, (x) => ({ ...x, log: x.log.map((l) => (l.kind === "ask" && l.id === e.id ? { ...l, state: e.allow ? "allowed" : "declined" } : l)) }));
        break;
    }
  };

  /** Waits for the author's Allow or Don't on a removal the turn asked about; stopping the turn is a Don't. */
  const confirm = (_ask: unknown, signal?: AbortSignal) =>
    new Promise<boolean>((resolve) => {
      const done = (allow: boolean) => {
        answerRef.current = null;
        signal?.removeEventListener("abort", stopped);
        resolve(allow);
      };
      const stopped = () => done(false);
      signal?.addEventListener("abort", stopped, { once: true });
      answerRef.current = done;
    });
  /** the author's answer to the removal the running turn waits on */
  const answer = (allow: boolean) => answerRef.current?.(allow);

  /** Sends a request to the agent, with any pictures attached to it: one turn, streamed into the panel as it goes. */
  const send = async (request: string, pictures: PickedImage[] = []) => {
    const words = request.trim();
    if ((!words && !pictures.length) || runningRef.current) return;
    if (!ready) {
      showToast(t("agentNeedsKey", lang), 4000);
      return;
    }
    if (!editable) return;
    const id = `turn-${Date.now().toString(36)}`;
    /* a turn before this one is no longer followed: what it changed is the starting point of this one */
    releaseAll();
    setTurns((ts) => ts.map((x) => (x.canTakeBack ? { ...x, canTakeBack: false } : x)));
    const ac = new AbortController();
    abort.current = ac;
    runningRef.current = true;
    setRunning(true);
    const before = messages.current.length;
    const keptAttachments = attachments.current;
    const images: Attachment[] = pictures.map((p, i) => ({ id: `ref${keptAttachments.length + i + 1}`, dataUrl: p.dataUrl, w: p.w, h: p.h, name: p.name }));
    const ask = words || t("agentCopyPicture", lang);
    setTurns((ts) => [...ts, { id, request: ask, ...(images.length ? { images: images.map((a) => ({ id: a.id, dataUrl: a.dataUrl })) } : {}), status: "running", log: [], reasoning: "", shots: [], usage: noUsage(), ms: 0, drawings: 0, before }]);
    const t0 = Date.now();
    try {
      /* the agent, the providers and the tools come with the first request, not with the editor */
      const [{ createAdapter }, { runTurn }] = await Promise.all([import("@/lib/llm"), import("@/lib/agent")]);
      const adapter = createAdapter(settings, { effort: settings.effort ?? "medium" });
      const note = undone.current ? "(The author undid your previous turn: the canvas is back to how it was before it.)" : undefined;
      undone.current = false;
      const all = [...keptAttachments, ...images];
      /* SVG written as code needs only the text model; the image model is used when its key is set */
      const r = await runTurn({ store, adapter, history: messages.current, request: ask, images, attachments: all, sets: sets.current as never, lang, renderer, gen: { settings, adapter }, signal: ac.signal, note, confirm, onEvent: onEvent(id) });
      messages.current = r.messages;
      if (r.stop !== "aborted") {
        attachments.current = all;
        sets.current = r.sets;
      }
      const failed = r.stop === "error" || r.stop === "refusal" || r.stop === "max_tokens";
      const error = r.stop === "error" ? aiErrorText(r.error, lang) : r.stop === "refusal" ? t("aiErrorRefusal", lang) : r.stop === "max_tokens" ? t("aiErrorLong", lang) : r.stop === "max_steps" ? t("agentStepLimit", lang) : undefined;
      if (r.takeBack) takeBacks.current.set(id, r.takeBack);
      patch(id, (x) => ({ ...x, status: r.stop === "aborted" ? "stopped" : failed ? "error" : "done", diff: r.diff, usage: r.usage, ms: r.ms, drawings: r.drawings, stop: r.stop, ...(error ? { error } : {}), ...(r.step ? { step: r.step } : {}), rolledBack: r.rolledBack, ...(r.revert ? { revert: reportOf(r.revert) } : {}), canTakeBack: !!r.takeBack }));
    } catch (e) {
      patch(id, (x) => ({ ...x, status: "error", error: aiErrorText(e, lang), ms: Date.now() - t0 }));
    } finally {
      if (abort.current === ac) abort.current = null;
      runningRef.current = false;
      setRunning(false);
      setAgentFrameId(null);
    }
  };

  const stop = () => abort.current?.abort();

  /** whether a turn is still the last step of the history, so one undo takes exactly it back */
  const onTop = (x: TurnView) => {
    if (!x.step) return false;
    const h = store.history();
    return h.length === x.step.depth && h[h.length - 1] === x.step.label;
  };

  const settle = (id: string, verdict: "kept" | "undone", report?: RevertReport) => {
    takeBacks.current.get(id)?.release();
    takeBacks.current.delete(id);
    patch(id, (y) => ({ ...y, verdict, canTakeBack: false, ...(report ? { revert: reportOf(report) } : {}) }));
  };

  /** Takes a finished turn back: one undo step when it is the last and nothing of the author's came in between, else
   *  its own changes alone, keeping what the author changed in between and after. */
  const takeBack = (x: TurnView): RevertReport | "undone" | null => {
    if (x.step && onTop(x)) {
      store.undo();
      return "undone";
    }
    return takeBacks.current.get(x.id)?.run() ?? null;
  };

  const undoTurn = (id: string) => {
    const x = turns.find((y) => y.id === id);
    if (!x || x.verdict || (!x.step && !x.canTakeBack)) return;
    const r = takeBack(x);
    if (!r) {
      showToast(t("agentCannotUndo", lang), 4000);
      return;
    }
    undone.current = true;
    settle(id, "undone", r === "undone" ? undefined : r);
  };

  const keepTurn = (id: string) => settle(id, "kept");

  /** the last turn again: what it did taken back, its part of the conversation forgotten */
  const retry = (id: string) => {
    const x = turns[turns.length - 1];
    if (!x || x.id !== id || runningRef.current) return;
    if ((x.step || x.canTakeBack) && !x.verdict) {
      if (x.step && onTop(x)) store.undo("user", { forget: true });
      else if (!takeBacks.current.get(x.id)?.run()) {
        showToast(t("agentCannotUndo", lang), 4000);
        return;
      }
      takeBacks.current.delete(x.id);
    }
    messages.current = messages.current.slice(0, x.before);
    const pictures = (x.images ?? []).map((im) => {
      const a = attachments.current.find((y) => y.id === im.id);
      return { dataUrl: im.dataUrl, w: a?.w ?? 0, h: a?.h ?? 0, name: a?.name ?? im.id };
    });
    attachments.current = attachments.current.filter((a) => !(x.images ?? []).some((im) => im.id === a.id));
    setTurns((ts) => ts.filter((y) => y.id !== id));
    void send(x.request, pictures);
  };

  const reset = () => {
    if (runningRef.current) return;
    releaseAll();
    messages.current = [];
    attachments.current = [];
    sets.current = [];
    undone.current = false;
    setTurns([]);
  };

  return { turns, running, ready, agentFrameId, send, stop, undoTurn, keepTurn, retry, reset, onTop, answer };
}
