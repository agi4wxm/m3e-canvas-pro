/* What every request to a provider shares, with nothing else attached: the error a failed answer becomes, reading
 * that answer's words, and the one rule about where a key may be sent. Kept apart from lib/ai.ts so the provider
 * layer (and the MCP server built on it) does not pull in the parts registry and the prompt builder. */

/** a provider's answer that was not a success: its status says what the author is told, its message keeps the provider's words */
export class AiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/* The body is read once, as text: an answer that is not JSON (a gateway's plain words) still has something to say. */
export async function readError(res: Response): Promise<AiHttpError> {
  let detail = "";
  try {
    detail = await res.text();
  } catch {}
  try {
    const j = JSON.parse(detail);
    detail = String(j?.error?.message ?? j?.message ?? detail);
  } catch {}
  return new AiHttpError(res.status, `${res.status}${res.statusText ? ` ${res.statusText}` : ""}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
}

/** an address on this machine */
export const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u.trim());

/** the key must not travel over plain http, except to this machine */
export const isSecureUrl = (u: string) => /^https:\/\//i.test(u.trim()) || isLocalUrl(u);
