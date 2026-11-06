/* The MCP clients the author told the editor to remember (lib/mcp/editorBridge.ts): each one's id and secret, the
 * client it was for and the access it was given. Kept in this browser's projects database (the `kv` store, one key),
 * so a server started again for that client is approved without asking; forgetting one in the MCP panel takes it
 * away here and tells the servers that are listening. The secret proves a server, so it is never shown. */

import type { Access, ClientInfo } from "./protocol";

export type TrustedServer = {
  /** the server's id for the pairing (mcp/src/trust.ts) */
  id: string;
  /** hex, given to the server when the author approved */
  secret: string;
  client: ClientInfo;
  access: Access;
  created: number;
  used: number;
  /** forgotten by the author, waiting to tell a server so it forgets its side too */
  forgotten?: boolean;
};

/** where the editor keeps them */
export interface TrustedStore {
  list(): Promise<TrustedServer[]>;
  put(r: TrustedServer): Promise<void>;
  remove(id: string): Promise<void>;
}

const KEY = "mcp:trusted";

/** the editor's own: one key of the projects database's kv store */
export function browserTrusted(): TrustedStore {
  const db = () => import("../projects/db");
  const read = async () => {
    const v = await (await db()).getKv<TrustedServer[]>(KEY);
    return Array.isArray(v) ? v.filter((r) => r && typeof r.id === "string" && typeof r.secret === "string") : [];
  };
  /* one change at a time: two answers landing together must not lose one */
  let tail: Promise<unknown> = Promise.resolve();
  const change = (fn: (list: TrustedServer[]) => TrustedServer[]) => {
    const next = tail.then(async () => (await db()).putKv(KEY, fn(await read())));
    tail = next.catch(() => {});
    return next;
  };
  return {
    list: read,
    put: (r) => change((list) => [...list.filter((x) => x.id !== r.id), r]),
    remove: (id) => change((list) => list.filter((x) => x.id !== id)),
  };
}

/** a store in memory, for tests */
export function memoryTrusted(): TrustedStore & { all: TrustedServer[] } {
  const all: TrustedServer[] = [];
  return {
    all,
    list: async () => all.map((r) => ({ ...r })),
    put: async (r) => {
      const i = all.findIndex((x) => x.id === r.id);
      if (i >= 0) all[i] = { ...r };
      else all.push({ ...r });
    },
    remove: async (id) => {
      const i = all.findIndex((x) => x.id === id);
      if (i >= 0) all.splice(i, 1);
    },
  };
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** `n` random bytes as hex */
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** whether this page can check a server's proof (WebCrypto is only there in a secure context) */
export const canProve = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** What a server holding `secret` answers the challenge `nonce` on `port` with (mcp/src/trust.ts `proofOf`). */
export async function expectedProof(secret: string, nonce: string, port: number): Promise<string> {
  const bytes = new Uint8Array((secret.match(/../g) ?? []).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`m3e-mcp-pair:${port}:${nonce}`))));
}
