/* Editors the author told to remember an MCP client: a pairing that survives the server's restarts. When the author
 * approves a pairing with "remember this client", the tab hands the server a secret of its own; the server keeps it
 * here, in a file under the user's config folder that only they may read (0600), with the client it was for (its MCP
 * name), the editor's origin and the access given. A later server for the same client, from the same origin, proves to
 * the tab that it holds the secret (an HMAC of a fresh challenge, bound to the port the tab reached it on) and the tab
 * approves without asking. The secret itself never travels again, except once more to be forgotten.
 *
 * Several servers (one per client) share the file: each change reads it, changes it and writes it back at once. */

import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Access } from "../../lib/mcp/protocol";

export type Remembered = {
  id: string;
  /** hex; what the tab proves the server against */
  secret: string;
  /** the MCP client's name, as it gives it when it connects ("claude-ai", "codex-mcp-client"…) */
  client: string;
  /** what the editor calls it */
  title?: string;
  /** the editor's origin it was approved from */
  origin: string;
  access: Access;
  created: number;
  used: number;
};

type TrustFile = { version: 1; editors: Remembered[] };

/** how long a remembered pairing nobody used is kept */
export const TRUST_MAX_IDLE_MS = 180 * 24 * 3600_000;

/** The folder for this server's own settings: $M3E_MCP_CONFIG_DIR, else the platform's per-user config folder. */
export function configDir(env: Record<string, string | undefined> = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (env.M3E_MCP_CONFIG_DIR) return env.M3E_MCP_CONFIG_DIR;
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "m3e-canvas-mcp");
  if (platform === "darwin") return join(home, "Library", "Application Support", "m3e-canvas-mcp");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "m3e-canvas-mcp");
}

/** what a tab's challenge is answered with: an HMAC of it, bound to the port the tab reached this server on */
export function proofOf(secret: string, nonce: string, port: number): string {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`m3e-mcp-pair:${port}:${nonce}`).digest("hex");
}

const HEX = /^[0-9a-f]+$/;
const valid = (r: unknown): r is Remembered => {
  const x = r as Remembered;
  return !!x && typeof x.id === "string" && HEX.test(x.id) && typeof x.secret === "string" && HEX.test(x.secret) && x.secret.length >= 32 && typeof x.client === "string" && typeof x.origin === "string" && (x.access === "edit" || x.access === "read");
};

export class TrustStore {
  constructor(
    readonly path: string,
    private readonly warn: (m: string) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  /** the store at its usual place */
  static at(dir = configDir(), warn?: (m: string) => void) {
    return new TrustStore(join(dir, "trusted-editors.json"), warn);
  }

  /** every pairing kept, those idle too long left out */
  async list(): Promise<Remembered[]> {
    let text: string;
    try {
      const st = await stat(this.path);
      /* a file others may read is no place for a secret: it is closed again, and said */
      if (process.platform !== "win32" && st.mode & 0o077) {
        this.warn(`${this.path} could be read by other users; its permissions were set back to 0600.`);
        await chmod(this.path, 0o600).catch(() => {});
      }
      text = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    try {
      const f = JSON.parse(text) as TrustFile;
      const cutoff = this.now() - TRUST_MAX_IDLE_MS;
      return Array.isArray(f?.editors) ? f.editors.filter(valid).filter((r) => r.used >= cutoff) : [];
    } catch {
      this.warn(`${this.path} is not readable as JSON; remembered pairings start afresh.`);
      return [];
    }
  }

  /** writes the list whole: beside the file first, only the user may read it, then over it */
  private async write(editors: Remembered[]) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmp = `${this.path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    const fh = await open(tmp, "wx", 0o600);
    try {
      await fh.writeFile(`${JSON.stringify({ version: 1, editors } satisfies TrustFile, null, 2)}\n`);
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await rename(tmp, this.path);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
    await chmod(this.path, 0o600).catch(() => {});
  }

  /** keeps a new pairing; its id */
  async add(r: Omit<Remembered, "id" | "created" | "used">): Promise<Remembered> {
    const now = this.now();
    const made: Remembered = { ...r, id: randomBytes(8).toString("hex"), created: now, used: now };
    await this.write([...(await this.list()), made]);
    return made;
  }

  /** the pairing with this id, for this client and origin */
  async find(id: string, client: string, origin: string): Promise<Remembered | undefined> {
    return (await this.list()).find((r) => r.id === id && r.client === client && r.origin === origin);
  }

  /** the ids kept for this client and origin: what a tab may ask this server to prove */
  async known(client: string, origin: string): Promise<string[]> {
    return (await this.list()).filter((r) => r.client === client && r.origin === origin).map((r) => r.id);
  }

  async touch(id: string) {
    const list = await this.list();
    const r = list.find((x) => x.id === id);
    if (!r) return;
    r.used = this.now();
    await this.write(list);
  }

  /** forgets a pairing, for whoever shows its secret (the tab that holds it); whether one went */
  async remove(id: string, secret: string): Promise<boolean> {
    const list = await this.list();
    const next = list.filter((r) => !(r.id === id && r.secret === secret));
    if (next.length === list.length) return false;
    await this.write(next);
    return true;
  }

  /** forgets them all */
  async clear() {
    await unlink(this.path).catch(() => {});
  }
}
