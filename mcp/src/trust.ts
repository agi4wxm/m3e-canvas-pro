/* Editors the author told to remember an MCP client: a pairing that survives the server's restarts. When the author
 * approves a pairing with "remember this client", the tab hands the server a secret of its own; the server keeps it
 * here, in a file under the user's config folder that only they may read (0600), with the client it was for (its MCP
 * name), the editor's origin and the access given. A later server for the same client, from the same origin, proves to
 * the tab that it holds the secret (an HMAC of a fresh challenge, bound to the port the tab reached it on), the tab
 * proves the same to it against a challenge of the server's (`editorProven`), and the pairing needs no code. The
 * secret itself never travels again, except once more to be forgotten.
 *
 * Several servers (one per client) share the file. Each change (add, touch, remove, clear) is one transaction under a
 * lock file beside it (`trusted-editors.json.lock`, made with O_EXCL): it reads the file, changes it and writes it
 * back (beside it first, then renamed over it) while no other process can, so no pairing added is lost and none
 * removed comes back from a write made with an older list. A lock whose process has died, or that is older than any
 * transaction takes, is taken away, one process at a time. Reading needs no lock: the rename makes every read whole. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { proofWords, type Access } from "../../lib/mcp/protocol";

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

/** a lock older than this was left by a process that stopped in the middle (a transaction takes milliseconds) */
export const TRUST_LOCK_STALE_MS = 15_000;
/** how long a change waits for the lock before it gives up */
const LOCK_WAIT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** whether a process of this machine is still there */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

type LockHolder = { pid?: number; host?: string; token?: string };

/** The folder for this server's own settings: $M3E_MCP_CONFIG_DIR, else the platform's per-user config folder. */
export function configDir(env: Record<string, string | undefined> = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (env.M3E_MCP_CONFIG_DIR) return env.M3E_MCP_CONFIG_DIR;
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "m3e-canvas-mcp");
  if (platform === "darwin") return join(home, "Library", "Application Support", "m3e-canvas-mcp");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "m3e-canvas-mcp");
}

/** what a tab's challenge is answered with: an HMAC of it, bound to the port the tab reached this server on */
export function proofOf(secret: string, nonce: string, port: number): string {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(proofWords("server", nonce, port)).digest("hex");
}

/** whether a tab's answer to this server's challenge shows it holds `secret` (lib/mcp/trusted.ts `editorProof`) */
export function editorProven(secret: string, challenge: string, port: number, mac: unknown): boolean {
  if (typeof mac !== "string" || !/^[0-9a-f]{64}$/.test(mac)) return false;
  const want = createHmac("sha256", Buffer.from(secret, "hex")).update(proofWords("editor", challenge, port)).digest();
  return timingSafeEqual(want, Buffer.from(mac, "hex"));
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

  private tightened = false;

  /** The folder the file is in, closed to other users when it is open to them: a file there could otherwise be
   *  swapped or removed by someone else. Only one this user owns is changed (a folder named by M3E_MCP_CONFIG_DIR may
   *  be shared on purpose); Windows keeps its own per-user rights on the profile folder and is left alone. */
  private async tighten() {
    if (this.tightened || process.platform === "win32") return;
    this.tightened = true;
    const dir = dirname(this.path);
    try {
      const st = await stat(dir);
      if (!(st.mode & 0o077) || st.uid !== process.getuid?.()) return;
      await chmod(dir, 0o700);
      this.warn(`${dir} could be read by other users; its permissions were set to 0700.`);
    } catch {
      /* not there yet: it is made 0700 when the first pairing is kept */
    }
  }

  /** every pairing kept, those idle too long left out */
  async list(): Promise<Remembered[]> {
    await this.tighten();
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
    await this.tighten();
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

  private get lockPath() {
    return `${this.path}.lock`;
  }

  /** Runs `fn` while this process holds the lock: the one read-change-write of the file at a time. */
  private async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await this.tighten();
    const token = randomBytes(8).toString("hex");
    const end = Date.now() + LOCK_WAIT_MS;
    for (let tries = 1; ; tries++) {
      try {
        const fh = await open(this.lockPath, "wx", 0o600);
        try {
          await fh.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token, at: Date.now() } satisfies LockHolder & { at: number }));
        } finally {
          await fh.close();
        }
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      const gone = await this.breakStale();
      if (Date.now() > end) throw new Error(`${this.lockPath} is held by another process; nothing was changed.`);
      if (!gone) await sleep(Math.min(100, 2 * tries) + Math.random() * 10);
    }
    try {
      return await fn();
    } finally {
      /* only a lock that is still this one's is let go (one taken as stale and made again belongs to another) */
      const held = await readFile(this.lockPath, "utf8").catch(() => "");
      if (held.includes(token)) await unlink(this.lockPath).catch(() => {});
    }
  }

  /** Takes away a lock its process left: one whose process on this machine is gone, or one held longer than any
   *  transaction takes. One process at a time does it (its own lock beside it), and only to the lock it judged. Whether
   *  the lock is gone now (try again at once). */
  private async breakStale(): Promise<boolean> {
    const lock = this.lockPath;
    const [st, text] = await Promise.all([stat(lock).catch(() => null), readFile(lock, "utf8").catch(() => null)]);
    if (!st || text === null) return true;
    let holder: LockHolder = {};
    try {
      holder = JSON.parse(text) as LockHolder;
    } catch {
      /* a lock being written this moment, or a broken one: its age decides */
    }
    const dead = holder.host === hostname() && typeof holder.pid === "number" && holder.pid !== process.pid && !running(holder.pid);
    if (!dead && Date.now() - st.mtimeMs < TRUST_LOCK_STALE_MS) return false;
    const breaker = `${lock}.break`;
    try {
      await (await open(breaker, "wx", 0o600)).close();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      /* another process is breaking it, or died doing so */
      const b = await stat(breaker).catch(() => null);
      if (b && Date.now() - b.mtimeMs > TRUST_LOCK_STALE_MS) await unlink(breaker).catch(() => {});
      return false;
    }
    try {
      const [st2, again] = await Promise.all([stat(lock).catch(() => null), readFile(lock, "utf8").catch(() => null)]);
      if (st2 && again === text && st2.mtimeMs === st.mtimeMs) {
        await unlink(lock).catch(() => {});
        this.warn(`${lock} was left by a process that stopped${dead ? ` (pid ${holder.pid})` : ""}; it was taken away.`);
      }
    } finally {
      await unlink(breaker).catch(() => {});
    }
    return true;
  }

  /** keeps a new pairing; its id */
  async add(r: Omit<Remembered, "id" | "created" | "used">): Promise<Remembered> {
    const now = this.now();
    const made: Remembered = { ...r, id: randomBytes(8).toString("hex"), created: now, used: now };
    await this.transaction(async () => this.write([...(await this.list()), made]));
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

  /** marks a pairing used now; one forgotten meanwhile stays forgotten */
  async touch(id: string) {
    await this.transaction(async () => {
      const list = await this.list();
      const r = list.find((x) => x.id === id);
      if (!r) return;
      r.used = this.now();
      await this.write(list);
    });
  }

  /** forgets a pairing, for whoever shows its secret (the tab that holds it); whether one went */
  async remove(id: string, secret: string): Promise<boolean> {
    return this.transaction(async () => {
      const list = await this.list();
      const next = list.filter((r) => !(r.id === id && r.secret === secret));
      if (next.length === list.length) return false;
      await this.write(next);
      return true;
    });
  }

  /** forgets them all */
  async clear() {
    await this.transaction(async () => {
      await unlink(this.path).catch(() => {});
    });
  }
}
