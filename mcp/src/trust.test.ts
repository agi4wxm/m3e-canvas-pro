/* Remembered pairings on the server's side: where the file lives on each platform, that only the user may read it, that
 * one is forgotten only by whoever holds its secret, and that one nobody used for long is let go. */

import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLog } from "./log";
import { scratchDir } from "./testkit";
import { configDir, editorProven, proofOf, TRUST_LOCK_STALE_MS, TRUST_MAX_IDLE_MS, TrustStore } from "./trust";

const SECRET = "0f".repeat(32);

describe("remembered pairings", () => {
  it("live in the user's config folder", () => {
    expect(configDir({ M3E_MCP_CONFIG_DIR: "/x" }, "linux", "/home/a")).toBe("/x");
    expect(configDir({}, "linux", "/home/a")).toBe("/home/a/.config/m3e-canvas-mcp");
    expect(configDir({ XDG_CONFIG_HOME: "/cfg" }, "linux", "/home/a")).toBe("/cfg/m3e-canvas-mcp");
    expect(configDir({}, "darwin", "/Users/a")).toBe("/Users/a/Library/Application Support/m3e-canvas-mcp");
    expect(configDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32", "C:\\Users\\a")).toContain("m3e-canvas-mcp");
  });

  it("are kept where only the user may read them, and forgotten only with their secret", async () => {
    const dir = join(scratchDir(), "nested");
    const warned: string[] = [];
    const store = TrustStore.at(dir, (m) => warned.push(m));
    const r = await store.add({ secret: SECRET, client: "claude-ai", title: "Claude", origin: "http://localhost:3000", access: "edit" });
    if (process.platform !== "win32") {
      expect(statSync(store.path).mode & 0o777).toBe(0o600);
      expect(statSync(dir).mode & 0o077).toBe(0);
    }
    expect(await store.known("claude-ai", "http://localhost:3000")).toEqual([r.id]);
    expect(await store.known("claude-ai", "http://localhost:4173")).toEqual([]);
    expect(await store.known("codex", "http://localhost:3000")).toEqual([]);
    expect(await store.remove(r.id, "aa".repeat(32))).toBe(false);
    expect(await store.list()).toHaveLength(1);
    expect(await store.remove(r.id, SECRET)).toBe(true);
    expect(await store.list()).toEqual([]);

    /* a file opened up to others is closed again, and said */
    await store.add({ secret: SECRET, client: "c", origin: "o", access: "read" });
    if (process.platform !== "win32") {
      chmodSync(store.path, 0o644);
      expect(await store.list()).toHaveLength(1);
      expect(statSync(store.path).mode & 0o777).toBe(0o600);
      expect(warned.join(" ")).toMatch(/other users/);
    }
    expect(JSON.parse(readFileSync(store.path, "utf8")).version).toBe(1);
  });

  it("lets go of one nobody used for long", async () => {
    let now = 1_000;
    const store = new TrustStore(join(scratchDir(), "t.json"), undefined, () => now);
    await store.add({ secret: SECRET, client: "c", origin: "o", access: "edit" });
    now += TRUST_MAX_IDLE_MS + 1;
    expect(await store.list()).toEqual([]);
  });

  it("proves a challenge bound to the port it was reached on", () => {
    expect(proofOf(SECRET, "ab12", 47831)).toMatch(/^[0-9a-f]{64}$/);
    expect(proofOf(SECRET, "ab12", 47831)).not.toBe(proofOf(SECRET, "ab12", 47832));
    expect(proofOf(SECRET, "ab12", 47831)).not.toBe(proofOf(SECRET, "ab13", 47831));
  });

  it("checks the tab's answer to the server's own challenge", () => {
    const challenge = "cd".repeat(16);
    const mac = createHmac("sha256", Buffer.from(SECRET, "hex")).update(`m3e-mcp-editor:47831:${challenge}`).digest("hex");
    expect(editorProven(SECRET, challenge, 47831, mac)).toBe(true);
    expect(editorProven(SECRET, challenge, 47832, mac)).toBe(false);
    expect(editorProven("aa".repeat(32), challenge, 47831, mac)).toBe(false);
    expect(editorProven(SECRET, challenge, 47831, "nope")).toBe(false);
    /* the server's answer is another HMAC: one cannot stand for the other */
    expect(editorProven(SECRET, challenge, 47831, proofOf(SECRET, challenge, 47831))).toBe(false);
  });
});

/* ---------- several servers on one file: real processes, a real folder ---------- */

const TRUST_TS = fileURLToPath(new URL("./trust.ts", import.meta.url));
/* the processes run the TypeScript as it is, as `bun run mcp:dev` does */
const BUN = process.versions.bun ? process.execPath : "bun";

/** what one server process does to the file, told by its arguments; it prints what came of it */
const WORKER = `
import { readFileSync, statSync } from "node:fs";
const [, , mod, file, role, raw] = process.argv;
const { TrustStore } = await import(mod);
const store = new TrustStore(file);
const a = JSON.parse(raw);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (role === "add") {
  const ids = [];
  for (let i = 0; i < a.n; i++) ids.push((await store.add({ secret: a.secret, client: a.client, origin: "http://localhost:3000", access: "edit" })).id);
  console.log(JSON.stringify(ids));
} else if (role === "touch") {
  const end = Date.now() + a.ms;
  let n = 0;
  while (Date.now() < end) for (const id of a.ids) (await store.touch(id), n++);
  console.log(n);
} else if (role === "remove") {
  await sleep(a.after);
  const gone = [];
  for (const id of a.ids) gone.push(await store.remove(id, a.secret));
  console.log(JSON.stringify(gone));
} else if (role === "clear") {
  await sleep(a.after);
  await store.clear();
  console.log("cleared");
} else if (role === "read") {
  const end = Date.now() + a.ms;
  let reads = 0;
  const bad = [];
  while (Date.now() < end) {
    try {
      JSON.parse(readFileSync(file, "utf8"));
      const mode = statSync(file).mode & 0o777;
      if (process.platform !== "win32" && mode !== 0o600) bad.push("mode " + mode.toString(8));
      reads++;
    } catch (e) {
      if (e.code !== "ENOENT") bad.push(String(e.message));
    }
    await sleep(0);
  }
  console.log(JSON.stringify({ reads, bad }));
}
`;

function workers(dir: string) {
  const script = join(dir, "worker.mjs");
  writeFileSync(script, WORKER);
  const file = join(dir, "cfg", "trusted-editors.json");
  const run = (role: string, arg: Record<string, unknown>) =>
    new Promise<string>((resolve, reject) => {
      const p = spawn(BUN, [script, TRUST_TS, file, role, JSON.stringify(arg)], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += String(d)));
      p.stderr.on("data", (d) => (err += String(d)));
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${role} exited ${code}: ${err}`))));
    });
  return { file, run, store: new TrustStore(file) };
}

const SECRET2 = "1e".repeat(32);

describe("the file several servers share", () => {
  it("loses no pairing added by processes at the same time, and stays whole and private", async () => {
    const { file, run, store } = workers(scratchDir());
    const [reader, ...adds] = await Promise.all([run("read", { ms: 1500 }), ...Array.from({ length: 6 }, (_, i) => run("add", { n: 8, secret: SECRET, client: `client-${i}` }))]);
    const added = adds.flatMap((o) => JSON.parse(o) as string[]);
    expect(added).toHaveLength(48);
    const kept = (await store.list()).map((r) => r.id).sort();
    expect(kept).toEqual([...added].sort());
    expect(JSON.parse(reader).bad).toEqual([]);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    /* no lock, temporary file or breaker left behind */
    expect(readdirSync(join(file, "..")).sort()).toEqual(["trusted-editors.json"]);
  });

  it("never brings back a pairing another process forgot, however often it is touched meanwhile", async () => {
    const { run, store } = workers(scratchDir());
    const forgotten = await store.add({ secret: SECRET2, client: "claude-ai", origin: "http://localhost:3000", access: "edit" });
    const kept = await store.add({ secret: SECRET, client: "claude-ai", origin: "http://localhost:3000", access: "edit" });
    const later = await store.add({ secret: SECRET2, client: "codex", origin: "http://localhost:3000", access: "read" });
    const [t1, t2, removed, adds, reader] = await Promise.all([
      run("touch", { ids: [forgotten.id, kept.id], ms: 1500 }),
      run("touch", { ids: [kept.id, forgotten.id, later.id], ms: 1500 }),
      run("remove", { ids: [forgotten.id, later.id], secret: SECRET2, after: 400 }),
      run("add", { n: 10, secret: SECRET, client: "other" }),
      run("read", { ms: 1500 }),
    ]);
    expect(Number(t1)).toBeGreaterThan(0);
    expect(Number(t2)).toBeGreaterThan(0);
    expect(JSON.parse(removed)).toEqual([true, true]);
    const ids = (await store.list()).map((r) => r.id);
    expect(ids).not.toContain(forgotten.id);
    expect(ids).not.toContain(later.id);
    expect(ids).toContain(kept.id);
    for (const id of JSON.parse(adds) as string[]) expect(ids).toContain(id);
    expect(JSON.parse(reader).bad).toEqual([]);
  });

  it("forgets them all at once, between the others' changes, and the file stays readable", async () => {
    const { file, run, store } = workers(scratchDir());
    await store.add({ secret: SECRET, client: "c", origin: "o", access: "edit" });
    const [cleared, adds, reader] = await Promise.all([run("clear", { after: 300 }), run("add", { n: 30, secret: SECRET, client: "c" }), run("read", { ms: 1200 })]);
    expect(cleared).toBe("cleared");
    expect(JSON.parse(reader).bad).toEqual([]);
    /* what was added after the clear is there, whole */
    const ids = (await store.list()).map((r) => r.id);
    const added = JSON.parse(adds) as string[];
    expect(ids.every((id) => added.includes(id))).toBe(true);
    expect(added.slice(ids.length ? added.indexOf(ids[0]) : added.length)).toEqual(ids);
    if (existsSync(file) && process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("takes away a lock its process left, and waits for one a live process holds", async () => {
    const dir = scratchDir();
    const warned: string[] = [];
    const file = join(dir, "trusted-editors.json");
    const store = new TrustStore(file, (m) => warned.push(m));
    const lock = `${file}.lock`;
    /* a process that died holding it */
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    writeFileSync(lock, JSON.stringify({ pid: dead, host: hostname(), token: "gone", at: Date.now() }));
    const started = Date.now();
    await store.add({ secret: SECRET, client: "c", origin: "o", access: "edit" });
    expect(Date.now() - started).toBeLessThan(TRUST_LOCK_STALE_MS);
    expect(warned.join(" ")).toMatch(/left by a process that stopped/);
    expect(existsSync(lock)).toBe(false);

    /* half written by a process on another machine, long ago */
    writeFileSync(lock, "{");
    const old = new Date(Date.now() - TRUST_LOCK_STALE_MS - 5000);
    utimesSync(lock, old, old);
    await store.add({ secret: SECRET, client: "c", origin: "o", access: "edit" });
    expect(await store.list()).toHaveLength(2);

    /* held right now by a process that is alive: waited for, not taken */
    const alive = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
    try {
      writeFileSync(lock, JSON.stringify({ pid: alive.pid, host: hostname(), token: "busy", at: Date.now() }));
      let released = 0;
      setTimeout(() => {
        released = Date.now();
        unlinkSync(lock);
      }, 500);
      const pending = store.add({ secret: SECRET, client: "c", origin: "o", access: "edit" });
      await new Promise((r) => setTimeout(r, 250));
      expect(readFileSync(lock, "utf8")).toContain("busy");
      await pending;
      expect(released).toBeGreaterThan(0);
      expect(await store.list()).toHaveLength(3);
    } finally {
      alive.kill();
    }
  });
});

describe("the config folder and the log file", () => {
  it.skipIf(process.platform === "win32")("close a config folder open to other users, and keep the log file private", async () => {
    const dir = join(scratchDir(), "open");
    mkdirSync(dir);
    chmodSync(dir, 0o755);
    const warned: string[] = [];
    const store = TrustStore.at(dir, (m) => warned.push(m));
    expect(await store.list()).toEqual([]);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(warned.join(" ")).toMatch(/0700/);

    const file = join(scratchDir(), "server.log");
    writeFileSync(file, "");
    chmodSync(file, 0o644);
    createLog({ file, quiet: true }).notice("pairing code 123-456");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const made = join(scratchDir(), "new.log");
    createLog({ file: made, quiet: true }).notice("hello");
    expect(statSync(made).mode & 0o777).toBe(0o600);
    expect(readFileSync(made, "utf8")).toContain("hello");
  });
});
