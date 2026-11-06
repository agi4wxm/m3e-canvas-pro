/* What the MCP server (mcp/) and an editor tab say to each other over the live bridge: a WebSocket on 127.0.0.1 that
 * the tab opens when the author turns on "Connect to MCP". The server says hello with a pairing code it has also
 * printed to its log; the author compares the two and approves in the tab, choosing edit or read-only access. Only then
 * does the server send tool calls, which the tab runs on its own store, so every change appears live and is one undo
 * step. A destructive call waits for a click in the tab. The tab never sees a key: a drawing a generative tool needs
 * is asked of the server, which holds OPENAI_API_KEY, and only what was drawn comes back.
 *
 * Remembering a client: when the author approves with "remember this client", the tab gives the server a secret
 * (`approve.remember`), the server keeps it under an id it returns (`paired.remembered`), and the tab keeps both. A
 * later server for that client says which ids it holds (`hello.known`, `client.known`); the tab challenges it
 * (`prove`), checks the answer (`proof`: an HMAC of the challenge and the port, mcp/src/trust.ts `proofOf`) and
 * approves without asking. The fields are optional, so either side of an older version simply never offers it.
 *
 * Plain types and constants: the server bundle and the editor both import this, nothing else. */

import type { ToolError, ToolOutcome } from "../tools/types";

/** bumped when a message changes shape; the two sides refuse each other when it differs */
export const BRIDGE_PROTOCOL = 1;

/** where the first server listens; a second one (another client on the same machine) takes the next */
export const BRIDGE_PORT = 47831;
/** how many ports from BRIDGE_PORT the servers take and the editor looks at */
export const BRIDGE_PORTS = 4;

/** how long a destructive call waits for the author's click before it is refused */
export const CONFIRM_MS = 60_000;

export type Access = "edit" | "read";

/** the MCP client the server is serving, as it named itself when it connected (Claude Desktop, Codex…) */
export type ClientInfo = { name: string; version?: string; title?: string };

/** a picture asked of the server for a generative tool running in the tab */
export type DrawRequest =
  | { what: "svg"; args: Record<string, unknown> }
  | { what: "image"; args: { prompt: string; box: { w: number; h: number } } };

/** what the server drew: an SVG with how it was made, or a picture as a data URL */
export type DrawResult = { markup: string; route: "image" | "code"; warnings: string[]; ms: number } | { picture: string };

/** server → editor */
export type ServerMsg =
  | {
      t: "hello";
      protocol: number;
      /** `id` is new each time the server starts, so a tab paired with an earlier one asks again */
      server: { name: string; version: string; id: string };
      client: ClientInfo | null;
      /** what the server allows; the author may give less */
      access: Access;
      /** the code the server printed, for the author to compare */
      code: string;
      /** whether the server can draw (it has an OpenAI key) */
      generate: boolean;
      confirmMs: number;
      /** the remembered pairings this server can prove for its client and the tab's origin; present when it can
       *  remember one at all */
      known?: string[];
    }
  | { t: "client"; client: ClientInfo | null; known?: string[] }
  | { t: "paired"; access: Access; resume: string; remembered?: { id: string } }
  /** the answer to a tab's challenge: the HMAC, or null when this server holds no such pairing */
  | { t: "proof"; id: string; nonce: string; mac: string | null }
  /** another tab is paired already, or the protocols differ: the connection closes after this */
  | { t: "refused"; reason: "busy" | "protocol" | "denied" }
  | { t: "call"; id: string; name: string; args: unknown; client: ClientInfo | null }
  | { t: "cancel"; id: string }
  | { t: "drawn"; id: string; ok: true; value: DrawResult }
  | { t: "drawn"; id: string; ok: false; error: ToolError };

/** editor → server */
export type EditorMsg =
  | { t: "hello"; protocol: number; resume?: string }
  | { t: "approve"; access: Access; remember?: { secret: string } }
  /** a challenge: prove holding the remembered pairing `id` */
  | { t: "prove"; id: string; nonce: string }
  /** the author forgot a remembered pairing in the editor: its secret, so only the tab that holds it can */
  | { t: "forget"; id: string; secret: string }
  | { t: "deny" }
  | { t: "result"; id: string; outcome: ToolOutcome }
  /** a drawing for the call `call` (a generative tool's), under the request id `id` */
  | ({ t: "draw"; id: string; call: string } & DrawRequest)
  /** the document changed (by anyone): what the server's clients read of it is stale */
  | { t: "changed" };

/** A pairing code: six digits, said in two halves. Not a secret (anything that reaches the socket sees it): it lets the
 *  author check that the tab is talking to the server they started. */
export function pairingCode(random: (n: number) => number): string {
  const d = () => String(random(10));
  return `${d()}${d()}${d()}-${d()}${d()}${d()}`;
}

/** the hosts a page or a request on this machine may name */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** the ports the editor is served on in development and preview, and the next few a busy port moves them to */
const EDITOR_PORTS = [
  [3000, 3010],
  [4173, 4183],
  [5173, 5183],
] as const;

/** Whether a page at `origin` may open the bridge: the editor served on this machine (its dev and preview ports), or
 *  one of the origins the server was told about. */
export function editorOrigin(origin: string | undefined, allowed: readonly string[] = []): boolean {
  if (!origin) return false;
  const o = origin.trim().replace(/\/+$/, "").toLowerCase();
  if (allowed.some((a) => a.trim().replace(/\/+$/, "").toLowerCase() === o)) return true;
  let u: URL;
  try {
    u = new URL(o);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" || !LOOPBACK.has(u.hostname)) return false;
  const port = Number(u.port || 80);
  return EDITOR_PORTS.some(([a, b]) => port >= a && port <= b);
}

/** Whether a Host header names this machine at `port`: a page that reached the port through a name of its own (DNS
 *  rebinding) carries that name instead. */
export function loopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  return [...LOOPBACK].some((name) => h === `${name}:${port}`);
}

/** a message from the other side, or null when it is not one */
export function parseMsg<T extends { t: string }>(data: unknown): T | null {
  try {
    const v = JSON.parse(typeof data === "string" ? data : String(data)) as unknown;
    return v && typeof v === "object" && typeof (v as { t?: unknown }).t === "string" ? (v as T) : null;
  } catch {
    return null;
  }
}
