/* Remembered pairings on the server's side: where the file lives on each platform, that only the user may read it, that
 * one is forgotten only by whoever holds its secret, and that one nobody used for long is let go. */

import { createHmac } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLog } from "./log";
import { scratchDir } from "./testkit";
import { configDir, editorProven, proofOf, TRUST_MAX_IDLE_MS, TrustStore } from "./trust";

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
