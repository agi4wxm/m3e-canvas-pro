/* One question and its answer, streamed: what a whole-app draft asks. A draft takes a minute, and a request that sends
 * nothing for that long is cut by intermediaries (one did at ~30 s in testing); streamed, bytes flow from the start,
 * and the author sees it working. Same errors as lib/ai `complete`: "refusal", "long", "empty". */

import { createAdapter, collectTurn, textOf, type Usage } from "../llm";
import type { AiSettings, Complete } from "../ai";

export type Progress = { chars: number; reasoning: number; usage?: Usage };

export function streamedComplete(onProgress?: (p: Progress) => void, fetchFn?: typeof fetch): Complete {
  return async (s: AiSettings, system: string, user: string, signal?: AbortSignal, maxTokens = 16000) => {
    if (!s.model.trim()) throw new Error("model");
    const adapter = createAdapter(s, { effort: s.effort ?? "medium", maxOutputTokens: maxTokens, ...(fetchFn ? { fetch: fetchFn } : {}) });
    const seen: Progress = { chars: 0, reasoning: 0 };
    const turn = await collectTurn(adapter, { system, messages: [{ role: "user", content: user }], maxOutputTokens: maxTokens }, signal, (e) => {
      if (e.type === "text") seen.chars += e.delta.length;
      else if (e.type === "reasoning") seen.reasoning += e.delta.length;
      else if (e.type === "usage") seen.usage = e.usage;
      else return;
      onProgress?.({ ...seen });
    });
    if (turn.stop === "refusal") throw new Error("refusal");
    if (turn.stop === "max_tokens") throw new Error("long");
    const text = textOf(turn.message);
    if (!text.trim()) throw new Error("empty");
    return text;
  };
}
