/* What one turn of the agent may spend, held in one place and enforced by the app, not left to the model or to each
 * provider's defaults. Next to the step, drawing and style allowances the turn already had (turn.ts), a turn has:
 * - output tokens per model call: each provider's cap (lib/llm `createAdapter`), and no request above `stepOutputTokens`;
 * - tokens in all: every model call counts, the tools' own (a style written, an SVG drawn as code) with the agent's;
 *   past it no new call is made;
 * - tool calls in all, across every step and every review;
 * - bytes: the pictures attached to the request, what one tool may hand back, and what the tools hand back in all;
 * - a deadline for the whole turn, and (lib/llm/http.ts) an idle limit for a stream that stalls.
 * Reaching one ends the turn as `limit` with the reason (LimitReached); what it did so far stays, as at the step
 * limit. The author's stop is not a limit. */

import { addUsage, emptyUsage, LimitReached, type Adapter, type LlmEvent, type LlmRequest, type ToolOutput, type Usage, type UserPart } from "../llm";

export type TurnLimits = {
  /** the most output tokens one model call may ask for */
  stepOutputTokens: number;
  /** the tokens the whole turn may spend, input and output, every model call counted */
  tokens: number;
  /** the tool calls the whole turn may make */
  toolCalls: number;
  /** the bytes of the pictures attached to the request */
  attachmentBytes: number;
  /** the bytes one tool may hand back (pictures beyond it are left out, with a word why) */
  toolResponseBytes: number;
  /** the bytes the turn's tools may hand back in all */
  toolBytes: number;
  /** how long the whole turn may run */
  deadlineMs: number;
};

/** generous next to what a real turn takes (the baselines: at most ~400k tokens, 15 steps, two minutes), tight enough
 *  that a stuck or looping turn ends */
export const DEFAULT_LIMITS: TurnLimits = {
  stepOutputTokens: 32000,
  tokens: 2_000_000,
  toolCalls: 150,
  attachmentBytes: 24 * 1024 * 1024,
  toolResponseBytes: 8 * 1024 * 1024,
  toolBytes: 64 * 1024 * 1024,
  deadlineMs: 15 * 60_000,
};

const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

/** the bytes of a tool's answer as it is sent: its words and its pictures */
const bytesOf = (parts: UserPart[]) => parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : p.dataUrl.length), 0);

export class TurnBudget {
  readonly limits: TurnLimits;
  /** every model call so far, the tools' own included */
  usage: Usage = emptyUsage();
  /** the tool calls still allowed (lib/llm `runAgent` counts them down) */
  readonly calls: { left: number; of: number };
  private toolBytes = 0;

  constructor(limits: Partial<TurnLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.calls = { left: this.limits.toolCalls, of: this.limits.toolCalls };
  }

  private spent = () => this.usage.input + this.usage.output;

  /** why the pictures attached to a request cannot be sent, or null */
  attachments(images: { dataUrl: string }[]): LimitReached | null {
    const n = images.reduce((s, a) => s + a.dataUrl.length, 0);
    return n > this.limits.attachmentBytes ? new LimitReached("attachments", `the attached pictures come to ${mb(n)}, more than the ${mb(this.limits.attachmentBytes)} a request may carry`) : null;
  }

  /** what the turn ran out of, once the deadline passes */
  deadline(): LimitReached {
    return new LimitReached("deadline", `the turn ran out of time (${Math.round(this.limits.deadlineMs / 60_000)} min)`);
  }

  /** The adapter with every call counted against the turn's tokens and held to the per-call output cap. Once the
   *  tokens are spent it starts no new call: the stream ends with the limit as its error. */
  adapter(inner: Adapter): Adapter {
    const cap = this.limits.stepOutputTokens;
    const stream = async function* (b: TurnBudget, req: LlmRequest, signal?: AbortSignal): AsyncGenerator<LlmEvent> {
      if (b.spent() >= b.limits.tokens) {
        yield { type: "error", error: new LimitReached("tokens", `the turn has spent the ${Math.round(b.limits.tokens / 1000)}k tokens it may spend`) };
        return;
      }
      const asked = req.maxOutputTokens !== undefined && req.maxOutputTokens > cap ? { ...req, maxOutputTokens: cap } : req;
      for await (const e of inner.stream(asked, signal)) {
        if (e.type === "done") b.usage = addUsage(b.usage, e.usage);
        yield e;
      }
    };
    return { kind: inner.kind, model: inner.model, stream: (req, signal) => stream(this, req, signal) };
  }

  /** A tool's answer within the byte limits: pictures that would make one answer too large are left out with a word
   *  why, and the turn's total is counted; past it, the reason the turn must end. */
  output(out: ToolOutput): { out: ToolOutput; over?: LimitReached } {
    if (typeof out === "string") {
      this.toolBytes += out.length;
      return { out, ...this.over() };
    }
    let content = out.content;
    if (bytesOf(content) > this.limits.toolResponseBytes) {
      const words = content.filter((p) => p.type === "text");
      const dropped = content.length - words.length;
      content = [...words, { type: "text", text: `(${dropped} picture${dropped === 1 ? "" : "s"} left out: together they came to more than the ${mb(this.limits.toolResponseBytes)} one answer may hold; ask for one screen or a smaller picture)` }];
    }
    this.toolBytes += bytesOf(content);
    return { out: { ...out, content }, ...this.over() };
  }

  private over(): { over?: LimitReached } {
    return this.toolBytes > this.limits.toolBytes ? { over: new LimitReached("tool_bytes", `the turn's tools have handed back more than the ${mb(this.limits.toolBytes)} it may read`) } : {};
  }
}
