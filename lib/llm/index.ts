import type { AiSettings } from "../ai";
import { anthropicMessages } from "./anthropic";
import { chatCompletions } from "./chat";
import { openAiResponses } from "./openai";
import type { Adapter, RetryPolicy } from "./types";

/* The provider layer of the AI system: a common conversation shape (types), one streaming adapter per
 * wire protocol, the agent loop, and the two ways to draw SVG. Nothing here knows about documents. */

export * from "./types";
export { AiHttpError, isLocalUrl, isSecureUrl, readError } from "./errors";
export { anthropicMessages, type AnthropicOptions } from "./anthropic";
export { chatCompletions, type ChatOptions } from "./chat";
export { openAiResponses, type OpenAiResponsesOptions, type ReasoningEffort } from "./openai";
export { collectTurn, runAgent, type AgentEvent, type AgentResult, type AgentStop, type RunAgentOptions, type ToolOutput } from "./loop";
export { checkSvg, cleanToMarkup, generateSvgCode, generateSvgImage, generateSvgImageStreamed, svgSystemPrompt, type SvgCodeOptions, type SvgCodeResult, type SvgImageOptions, type SvgImageResult, type SvgStreamedOptions } from "./svg";
export { LlmHttpError, isAbortError, retryable } from "./http";

export type AgentTuning = {
  /** how hard the model thinks: medium for most work, high for a whole app */
  effort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  retry?: RetryPolicy;
  fetch?: typeof fetch;
};

/** The adapter for the author's settings: OpenAI through the Responses API (the only place its newest
 *  models call tools), Claude through Messages, Gemini and DeepSeek through their compatible chat endpoints. */
export function createAdapter(s: AiSettings, t: AgentTuning = {}): Adapter {
  const base = { baseUrl: s.baseUrl, model: s.model, key: s.key, retry: t.retry, fetch: t.fetch };
  if (s.provider === "openai") return openAiResponses({ ...base, effort: t.effort ?? "medium", summary: "auto", maxOutputTokens: t.maxOutputTokens });
  if (s.provider === "claude") return anthropicMessages({ ...base, effort: t.effort, maxTokens: t.maxOutputTokens ?? 32000 });
  /* these endpoints cap around 8k unless told otherwise; Gemini also reads an effort, DeepSeek may refuse one */
  return chatCompletions({ ...base, maxTokens: t.maxOutputTokens ?? 8192, ...(s.provider === "gemini" && t.effort ? { reasoningEffort: t.effort } : {}) });
}
