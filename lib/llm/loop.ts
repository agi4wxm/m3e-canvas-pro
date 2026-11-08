import { LimitReached } from "./errors";
import { abortReason, isAbortError } from "./http";
import { addUsage, emptyUsage, textOf, toolCallsOf, type Adapter, type AssistantMessage, type LlmEvent, type LlmRequest, type Message, type StopReason, type ToolCall, type ToolDef, type ToolResult, type Usage, type UserPart } from "./types";

/* The agent loop: ask the model, run the tools it calls, hand back what they gave, and ask again,
 * until it answers without calling anything, runs out of steps, or is stopped. It knows nothing
 * about documents: the tools and what they do are given to it.
 *
 * The conversation it returns is always one a provider will accept as it is, so passing it back in
 * (with a new user message) goes on from where it stopped. That is why a step that is cut short
 * still answers every call it made: a call that was not run gets an error result saying why.
 *
 * A run that reaches a limit of its caller's (`LimitReached`: the tool calls it may make, or a signal aborted with
 * one, such as a deadline) ends as `limit`, not as the author's stop: what it did so far is kept. */

/** what a tool gives back: words, or parts with pictures (a screenshot), and whether it failed */
export type ToolOutput = string | { content: UserPart[]; isError?: boolean };

export type AgentStop = "end_turn" | "max_steps" | "max_tokens" | "refusal" | "aborted" | "error" | "limit";

/** everything the stream says, with the step it belongs to, plus the tools' own progress */
export type AgentEvent =
  | (LlmEvent & { step: number })
  | { type: "step"; step: number }
  | { type: "tool_start"; step: number; call: ToolCall }
  | { type: "tool_end"; step: number; call: ToolCall; result: ToolResult; ms: number };

export type RunAgentOptions = {
  adapter: Adapter;
  system: string;
  /** the conversation so far, ending with the author's new message */
  messages: Message[];
  /** the tools, or what they are at each step (a tool can add others for the steps after it) */
  tools: ToolDef[] | (() => ToolDef[]);
  /** the conversation as it is sent at each step, when the caller sends less of it (older pictures left out); it
   *  must keep every message in its place. What it left out stays out of the conversation this run returns. */
  prepare?: (messages: Message[]) => Message[];
  /** runs one call; may throw, which the model is told as an error result */
  execute: (call: ToolCall, ctx: { step: number; signal?: AbortSignal }) => Promise<ToolOutput> | ToolOutput;
  onEvent?: (e: AgentEvent) => void;
  /** how many model turns at most (default 24) */
  maxSteps?: number;
  /** how many tool calls may still run, shared by every run of one turn; a call past it is not run and the run ends
   *  as `limit` */
  toolCalls?: { left: number; of: number };
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AgentResult = {
  /** the whole conversation, the given messages first; pass it back in to go on */
  messages: Message[];
  /** only what this run added */
  added: Message[];
  usage: Usage;
  stop: AgentStop;
  steps: number;
  /** the last answer's words */
  text: string;
  error?: unknown;
};

const errorResult = (call: ToolCall, text: string): ToolResult => ({ callId: call.id, name: call.name, content: [{ type: "text", text }], isError: true });

const asResult = (call: ToolCall, out: ToolOutput): ToolResult =>
  typeof out === "string" ? { callId: call.id, name: call.name, content: [{ type: "text", text: out }] } : { callId: call.id, name: call.name, content: out.content, ...(out.isError ? { isError: true } : {}) };

const describe = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));

/** a signal aborted because a limit was reached, not by the author */
const limitOf = (signal: AbortSignal | undefined): LimitReached | undefined => (signal?.aborted && signal.reason instanceof LimitReached ? signal.reason : undefined);

/** One model turn read to its end: the answer, how it ended, what it cost. Throws what the stream
 *  ended with when it failed. For a single question without the loop. */
export async function collectTurn(adapter: Adapter, req: LlmRequest, signal?: AbortSignal, onEvent?: (e: LlmEvent) => void): Promise<{ message: AssistantMessage; stop: StopReason; usage: Usage }> {
  for await (const e of adapter.stream(req, signal)) {
    onEvent?.(e);
    if (e.type === "done") return { message: e.message, stop: e.stop, usage: e.usage };
    if (e.type === "error") throw e.error;
  }
  throw new Error("empty");
}

export async function runAgent(o: RunAgentOptions): Promise<AgentResult> {
  const maxSteps = Math.max(1, o.maxSteps ?? 24);
  const toolsNow = () => (typeof o.tools === "function" ? o.tools() : o.tools);
  let added: Message[] = [];
  /* the conversation before this run, as last sent: what `prepare` left out of it stays out */
  let before = o.messages;
  let usage = emptyUsage();
  let text = "";
  const emit = (e: AgentEvent) => {
    try {
      o.onEvent?.(e);
    } catch {
      /* a listener that fails must not stop the work it is watching */
    }
  };
  const finish = (stop: AgentStop, steps: number, error?: unknown): AgentResult => ({ messages: [...before, ...added], added, usage, stop, steps, text, ...(error !== undefined ? { error } : {}) });

  for (let step = 1; step <= maxSteps; step++) {
    if (o.signal?.aborted) return finish(limitOf(o.signal) ? "limit" : "aborted", step - 1, abortReason(o.signal));
    emit({ type: "step", step });
    let done: Extract<LlmEvent, { type: "done" }> | undefined;
    let failed: unknown;
    let hasFailed = false;
    const defs = toolsNow();
    const tools = new Map(defs.map((t) => [t.name, t]));
    if (o.prepare) {
      /* what is left out once is left out for good, so the next request starts the same way this one does */
      const sent = o.prepare([...before, ...added]);
      before = sent.slice(0, before.length);
      added = sent.slice(before.length);
    }
    for await (const e of o.adapter.stream({ system: o.system, messages: [...before, ...added], tools: defs, maxOutputTokens: o.maxOutputTokens }, o.signal)) {
      emit({ ...e, step });
      if (e.type === "done") done = e;
      else if (e.type === "error") {
        failed = e.error;
        hasFailed = true;
      }
    }
    /* a turn that did not finish leaves nothing behind: the conversation stays as it was before it */
    if (!done) {
      const limit = limitOf(o.signal) ?? (failed instanceof LimitReached ? failed : undefined);
      if (limit) return finish("limit", step, limit);
      const aborted = o.signal?.aborted || isAbortError(failed);
      return finish(aborted ? "aborted" : "error", step, hasFailed ? failed : new Error("empty"));
    }
    usage = addUsage(usage, done.usage);
    /* a refusal's partial answer is not kept: the provider asks for it to be dropped */
    if (done.stop === "refusal") return finish("refusal", step);
    added.push(done.message);
    text = textOf(done.message);
    const calls = toolCallsOf(done.message);
    if (!calls.length) return finish(done.stop === "max_tokens" ? "max_tokens" : "end_turn", step);

    const results: ToolResult[] = [];
    let stopped: AgentStop | undefined;
    /* calls asked for together are run one after another, in the order written: they may change the
       same document, and the model wrote them in the order it meant them to happen */
    for (const call of calls) {
      if (done.stop === "max_tokens") {
        results.push(errorResult(call, "Not run: the answer was cut off at the output limit before this call was complete."));
        stopped = "max_tokens";
        continue;
      }
      if (o.signal?.aborted) {
        const limit = limitOf(o.signal);
        results.push(errorResult(call, limit ? `Not run: ${limit.message}.` : "Not run: the author stopped the agent."));
        stopped = limit ? "limit" : "aborted";
        continue;
      }
      if (o.toolCalls && o.toolCalls.left <= 0) {
        results.push(errorResult(call, `Not run: the turn has made the ${o.toolCalls.of} tool calls it may make.`));
        stopped = "limit";
        continue;
      }
      if (o.toolCalls) o.toolCalls.left--;
      const t0 = Date.now();
      emit({ type: "tool_start", step, call });
      let result: ToolResult;
      if (!tools.has(call.name)) result = errorResult(call, `Unknown tool "${call.name}". Available: ${[...tools.keys()].join(", ")}.`);
      else if (call.args === null) result = errorResult(call, `The arguments were not a JSON object: ${call.argsText.slice(0, 500)}`);
      else {
        try {
          result = asResult(call, await o.execute(call, { step, signal: o.signal }));
        } catch (e) {
          result =
            isAbortError(e) && o.signal?.aborted
              ? errorResult(call, limitOf(o.signal) ? `Stopped: ${limitOf(o.signal)!.message}. It may have done part of its work.` : "Stopped: the author stopped the agent while this call was running; it may have done part of its work.")
              : errorResult(call, `Error: ${describe(e)}`);
        }
      }
      results.push(result);
      emit({ type: "tool_end", step, call, result, ms: Date.now() - t0 });
    }
    added.push({ role: "tool", results });
    if (stopped === "limit") return finish("limit", step, limitOf(o.signal) ?? new LimitReached("tool_calls", `the turn has made the ${o.toolCalls?.of ?? 0} tool calls it may make`));
    if (stopped) return finish(stopped, step, stopped === "aborted" ? abortReason(o.signal!) : undefined);
    if (o.signal?.aborted) return finish(limitOf(o.signal) ? "limit" : "aborted", step, abortReason(o.signal));
  }
  return finish("max_steps", maxSteps);
}
