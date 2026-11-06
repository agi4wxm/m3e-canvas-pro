/* The in-app agent's side of the editor: the conversation, the turn that is running and what it shows as it goes (its
 * plan, each tool, the pictures it took, what it spent), and what the author does with a finished turn: keep it,
 * undo it as one step, or try it again. The turn itself runs in lib/agent (runTurn), on the editor's own store. */

import { useEffect, useRef, useState } from "react";
import { createAdapter, emptyUsage, type AgentStop, type Message, type Usage } from "@/lib/llm";
import { runTurn, type DocDiff, type TurnEvent } from "@/lib/agent";
import { hasKey, isSecureUrl, type AiSettings } from "@/lib/ai";
import { CORE_REGISTRY, type Renderer, type ToolGroup } from "@/lib/tools";
import { frameOfPart } from "@/lib/tokens";
import type { DocStore } from "@/lib/core";
import { aiErrorText } from "@/components/AiPanel";
import { t, type Lang } from "@/lib/i18n";

export type LogEntry =
  | { kind: "text"; step: number; text: string }
  | { kind: "tool"; id: string; name: string; group: ToolGroup | "other"; state: "running" | "ok" | "error"; summary: string; ms?: number }
  | { kind: "review"; images: string[] };

export type TurnView = {
  id: string;
  request: string;
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
  /** how long the conversation was before it */
  before: number;
};

const toolGroup = (name: string): ToolGroup | "other" => CORE_REGISTRY.byName(name)?.group ?? (name.startsWith("generate_") ? "generate" : "other");

export type AgentInputs = {
  store: DocStore;
  settings: AiSettings;
  lang: Lang;
  renderer: Renderer;
  editable: boolean;
  showToast: (msg: string, ms?: number, icon?: string) => void;
};

export function useAgent({ store, settings, lang, renderer, editable, showToast }: AgentInputs) {
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [running, setRunning] = useState(false);
  /** the screen the agent last changed, which wears the thinking ring meanwhile */
  const [agentFrameId, setAgentFrameId] = useState<string | null>(null);
  const messages = useRef<Message[]>([]);
  const abort = useRef<AbortController | null>(null);
  /** the author took the last turn back: the model is told on the next one */
  const undone = useRef(false);
  const runningRef = useRef(false);

  const ready = hasKey(settings) && settings.model.trim().length > 0 && isSecureUrl(settings.baseUrl);

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
  useEffect(() => () => abort.current?.abort(), []);

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
        patch(id, (x) => ({ ...x, log: [...x.log, { kind: "tool", id: e.id, name: e.name, group: toolGroup(e.name), state: "running", summary: "" }] }));
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
    }
  };

  /** Sends a request to the agent: one turn, streamed into the panel as it goes. */
  const send = async (request: string) => {
    const words = request.trim();
    if (!words || runningRef.current) return;
    if (!ready) {
      showToast(t("agentNeedsKey", lang), 4000);
      return;
    }
    if (!editable) return;
    const id = `turn-${Date.now().toString(36)}`;
    const ac = new AbortController();
    abort.current = ac;
    runningRef.current = true;
    setRunning(true);
    const before = messages.current.length;
    setTurns((ts) => [...ts, { id, request: words, status: "running", log: [], reasoning: "", shots: [], usage: emptyUsage(), ms: 0, drawings: 0, before }]);
    const t0 = Date.now();
    try {
      const adapter = createAdapter(settings, { effort: settings.effort ?? "medium" });
      const note = undone.current ? "(The author undid your previous turn: the canvas is back to how it was before it.)" : undefined;
      undone.current = false;
      /* SVG written as code needs only the text model; the image model is used when its key is set */
      const r = await runTurn({ store, adapter, history: messages.current, request: words, lang, renderer, gen: { settings, adapter }, signal: ac.signal, note, onEvent: onEvent(id) });
      messages.current = r.messages;
      const failed = r.stop === "error" || r.stop === "refusal" || r.stop === "max_tokens";
      const error = r.stop === "error" ? aiErrorText(r.error, lang) : r.stop === "refusal" ? t("aiErrorRefusal", lang) : r.stop === "max_tokens" ? t("aiErrorLong", lang) : r.stop === "max_steps" ? t("agentStepLimit", lang) : undefined;
      patch(id, (x) => ({ ...x, status: r.stop === "aborted" ? "stopped" : failed ? "error" : "done", diff: r.diff, usage: r.usage, ms: r.ms, drawings: r.drawings, stop: r.stop, ...(error ? { error } : {}), ...(r.step ? { step: r.step } : {}), rolledBack: r.rolledBack }));
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

  const undoTurn = (id: string) => {
    const x = turns.find((y) => y.id === id);
    if (!x?.step || x.verdict) return;
    if (!onTop(x)) {
      showToast(t("agentCannotUndo", lang), 4000);
      return;
    }
    store.undo();
    undone.current = true;
    patch(id, (y) => ({ ...y, verdict: "undone" }));
  };

  const keepTurn = (id: string) => patch(id, (y) => ({ ...y, verdict: "kept" }));

  /** the last turn again: what it did taken back, its part of the conversation forgotten */
  const retry = (id: string) => {
    const x = turns[turns.length - 1];
    if (!x || x.id !== id || runningRef.current) return;
    if (x.step && !x.verdict) {
      if (!onTop(x)) {
        showToast(t("agentCannotUndo", lang), 4000);
        return;
      }
      store.undo();
    }
    messages.current = messages.current.slice(0, x.before);
    setTurns((ts) => ts.filter((y) => y.id !== id));
    void send(x.request);
  };

  const reset = () => {
    if (runningRef.current) return;
    messages.current = [];
    undone.current = false;
    setTurns([]);
  };

  return { turns, running, ready, agentFrameId, send, stop, undoTurn, keepTurn, retry, reset, onTop };
}
