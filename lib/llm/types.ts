/* The common language of the model providers. A conversation is kept in this shape, whoever answers
 * it, and is plain JSON: it can be saved with a document, handed to the MCP server, or passed back
 * into the agent loop to go on where it stopped.
 *
 * What a provider needs to see again exactly as it sent it (OpenAI's encrypted reasoning items,
 * Anthropic's signed thinking blocks, Gemini's thought signatures) rides along as `native` on the
 * part it belongs to. An adapter replays `native` only to the provider and model that wrote it;
 * any other adapter rebuilds the part from its plain fields. */

/** which wire protocol an adapter speaks */
export type AdapterKind = "openai-responses" | "anthropic" | "chat";

export type TextPart = { type: "text"; text: string };

/** a picture as a data URL (a PNG screenshot, usually); `detail` is a hint some providers read */
export type ImagePart = { type: "image"; dataUrl: string; detail?: "low" | "high" | "auto" };

/** what the model thought, as far as the provider shows it: a summary for people, and the opaque
 *  item the provider wants back on the next step */
export type ReasoningPart = { type: "reasoning"; text: string; native?: unknown };

/** a tool call as the model wrote it; `args` is null when `argsText` was not a JSON object */
export type ToolCall = { id: string; name: string; args: Record<string, unknown> | null; argsText: string };

export type ToolCallPart = { type: "tool_call"; native?: unknown } & ToolCall;

export type AssistantTextPart = TextPart & { native?: unknown };

export type UserPart = TextPart | ImagePart;
export type AssistantPart = AssistantTextPart | ReasoningPart | ToolCallPart;

/** what one tool call gave back; an error is still a result, so the model can read it and try again */
export type ToolResult = { callId: string; name: string; content: UserPart[]; isError?: boolean };

export type UserMessage = { role: "user"; content: string | UserPart[] };
/** `kind` and `model` say who wrote it, which decides whether its `native` parts may be replayed */
export type AssistantMessage = { role: "assistant"; content: AssistantPart[]; kind?: AdapterKind; model?: string };
export type ToolMessage = { role: "tool"; results: ToolResult[] };
export type Message = UserMessage | AssistantMessage | ToolMessage;

/** a tool the model may call: its parameters are a JSON Schema object */
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal";

/** tokens spent; `reasoning` is part of `output`, `cachedInput` and `cacheWrite` are parts of `input` */
export type Usage = { input: number; output: number; reasoning: number; cachedInput: number; cacheWrite: number };

export const emptyUsage = (): Usage => ({ input: 0, output: 0, reasoning: 0, cachedInput: 0, cacheWrite: 0 });

export const addUsage = (a: Usage, b: Partial<Usage>): Usage => ({
  input: a.input + (b.input ?? 0),
  output: a.output + (b.output ?? 0),
  reasoning: a.reasoning + (b.reasoning ?? 0),
  cachedInput: a.cachedInput + (b.cachedInput ?? 0),
  cacheWrite: a.cacheWrite + (b.cacheWrite ?? 0),
});

/** One step of streamed output, the same for every provider. A stream ends with exactly one `done`
 *  or one `error`; `retry` says a failed attempt is being made again before anything was shown. */
export type LlmEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: Usage }
  | { type: "retry"; attempt: number; delayMs: number; error: unknown }
  | { type: "done"; stop: StopReason; message: AssistantMessage; usage: Usage }
  | { type: "error"; error: unknown };

/** what one model turn is asked */
export type LlmRequest = {
  system: string;
  messages: Message[];
  tools?: ToolDef[];
  /** "none" forbids tools this turn; forcing a call is left out because the newest models refuse it */
  toolChoice?: "auto" | "none";
  maxOutputTokens?: number;
};

export interface Adapter {
  readonly kind: AdapterKind;
  readonly model: string;
  /** one model turn, streamed; never throws: a failure is the stream's last event */
  stream(req: LlmRequest, signal?: AbortSignal): AsyncIterable<LlmEvent>;
}

/** how often, and how patiently, a request that failed before any output is sent again */
export type RetryPolicy = { attempts: number; baseMs: number; maxMs: number };

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseMs: 1000, maxMs: 20_000 };

/** what every adapter is built from */
export type AdapterOptions = {
  baseUrl: string;
  model: string;
  /** may be empty for a server on this machine */
  key: string;
  retry?: RetryPolicy;
  /** another fetch (a test's, or one that goes through a proxy in Node) */
  fetch?: typeof fetch;
  /** waits between attempts; tests replace it */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export const textOf = (m: AssistantMessage) =>
  m.content
    .filter((p): p is AssistantTextPart => p.type === "text")
    .map((p) => p.text)
    .join("");

export const toolCallsOf = (m: AssistantMessage): ToolCall[] =>
  m.content.filter((p): p is ToolCallPart => p.type === "tool_call").map(({ id, name, args, argsText }) => ({ id, name, args, argsText }));

export const userParts = (m: UserMessage): UserPart[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);

/** a data URL's media type and base64 body, or null when it is not a base64 picture */
export function splitDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]*)$/i.exec(url.trim());
  return m ? { mediaType: m[1].toLowerCase(), data: m[2].replace(/\s+/g, "") } : null;
}

/** a tool's arguments as an object, or null with the reason; an empty string is no arguments at all */
export function parseArgs(text: string): { args: Record<string, unknown> | null; error?: string } {
  if (!text.trim()) return { args: {} };
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return { args: v as Record<string, unknown> };
    return { args: null, error: "arguments are not a JSON object" };
  } catch (e) {
    return { args: null, error: e instanceof Error ? e.message : String(e) };
  }
}
