/* The live bridge, end to end in Node: the MCP server's WebSocket and the editor's own end of it (lib/mcp/editorBridge.ts)
 * on a store like the editor's, joined by a real socket. Pages that are not the editor are turned away; a tab pairs
 * only when the author approves; calls change the tab's store, each one undo step; read-only access takes the writing
 * tools away; a destructive call nobody confirms is refused; a generative call draws on the server's side. */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import { setGlobalLang } from "../../lib/i18n";
import { scriptedAdapter } from "../../lib/llm/testkit";
import { EditorBridge, type BridgeView } from "../../lib/mcp/editorBridge";
import { PAIRING_TRIES } from "../../lib/mcp/protocol";
import { memoryTrusted, type TrustedStore } from "../../lib/mcp/trusted";
import type { AiSettings } from "../../lib/ai";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { connect, errorOf, scratchDir, textOf } from "./testkit";
import type { LiveBackend } from "./live";

beforeAll(() => setGlobalLang("en"));

const EDITOR = "http://localhost:3000";

/** the editor's socket: the browser sends the page's origin with it */
const tabSocket = (origin = EDITOR, sent?: string[]) =>
  class extends WebSocket {
    constructor(url: string) {
      super(url, { origin });
      if (sent) {
        const send = this.send.bind(this);
        this.send = ((data: string) => {
          sent.push(String(data));
          send(data);
        }) as typeof this.send;
      }
    }
  };

/** a store as the editor has one, with a screen holding a box and a text */
function editorStore() {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => "en" });
  store.transact("Start", "user", (tx) => {
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addPart, { slug: "box", id: "card", screen: "home", at: { x: 16, y: 120 } });
    tx.run(ops.addPart, { slug: "text", id: "hello", into: { container: "card" }, props: { text: "Hello" } });
  });
  /* what the author did before the client came is theirs; the tests count the steps the client adds */
  return store;
}

const until = async (ok: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
};

let cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanup.reverse()) await c();
  cleanup = [];
});

async function server(o: Parameters<typeof connect>[0] = {}, clientName?: string) {
  const s = await connect({ live: true, port: 0, ports: 1, pairWaitMs: 200, ...o }, undefined, clientName);
  cleanup.push(s.close);
  const live = s.backend as LiveBackend;
  return { ...s, live, port: live.port! };
}

function tab(port: number, o: { store?: DocStore; storage?: Map<string, string>; origin?: string; sent?: string[]; trusted?: TrustedStore } = {}) {
  const store = o.store ?? editorStore();
  const kept = o.storage ?? new Map<string, string>();
  const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  const bridge = new EditorBridge({ store, WebSocket: tabSocket(o.origin, o.sent) as never, ports: [port], storage, retryMs: 100, ...(o.trusted ? { trusted: o.trusted } : {}) });
  const views: BridgeView[] = [];
  bridge.subscribe(() => views.push(bridge.view()));
  bridge.start();
  cleanup.push(() => bridge.stop());
  return { bridge, store, kept, view: () => bridge.view() };
}

/** a socket opened by hand, and how it ended */
const rawOpen = (url: string, o: WebSocket.ClientOptions) =>
  new Promise<string>((resolve) => {
    const ws = new WebSocket(url, o);
    ws.on("unexpected-response", (_req, res) => resolve(`http ${res.statusCode}`));
    ws.on("open", () => {
      resolve("open");
      ws.close();
    });
    ws.on("error", (e) => resolve(`error ${e.message}`));
  });

describe("the live bridge", () => {
  it("turns away pages that are not the editor, and names that are not this machine", async () => {
    const { port } = await server();
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: "https://evil.example" })).toBe("http 403");
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: "http://localhost:8080" })).toBe("http 403");
    expect(await rawOpen(`ws://127.0.0.1:${port}`, {})).toBe("http 403");
    /* a page that reached the port under a name of its own (DNS rebinding) */
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: EDITOR, headers: { host: `rebound.example:${port}` } })).toBe("http 403");
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: EDITOR })).toBe("open");
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: "http://127.0.0.1:4173" })).toBe("open");
  });

  it("takes an origin it was told about", async () => {
    const { port } = await server({ origins: ["https://canvas.example.com"] });
    expect(await rawOpen(`ws://127.0.0.1:${port}`, { origin: "https://canvas.example.com" })).toBe("open");
  });

  it("pairs only when the author types the code the client gave them, then runs calls in the tab, each one undo step", async () => {
    const { live, port, call, client } = await server();
    const notConnected = await call("get_outline");
    expect(errorOf(notConnected)?.code).toBe("unavailable");
    expect(errorOf(notConnected)?.hint).toContain(live.code);
    expect(((await call("connection_status")).structuredContent as { result: { pairingCode: string } }).result.pairingCode).toBe(live.code);

    const t = tab(port);
    await until(() => t.view().asks.some((a) => a.kind === "pair"));
    const ask = t.view().asks.find((a) => a.kind === "pair")!;
    expect(ask).toMatchObject({ kind: "pair", offered: "edit" });
    expect(ask.client?.name).toBe("test-client");
    /* the code never reached the tab: it has to be typed */
    expect(JSON.stringify(t.view())).not.toContain(live.code.replace("-", ""));
    expect(JSON.stringify(t.view())).not.toContain(live.code);
    /* not approved yet: nothing reaches the tab */
    expect(errorOf(await call("get_outline"))?.message).toMatch(/not typed the pairing code/);

    t.bridge.approve(port, "edit", { code: ` ${live.code.replace("-", " ")} ` });
    await until(() => t.view().conns[0]?.phase === "paired");
    const outline = await call("get_outline");
    expect(textOf(outline)).toContain('screen home "Home"');

    const steps = t.store.history().length;
    const added = await call("add_screen", { id: "cart", name: "Cart" });
    expect(added.isError).toBeFalsy();
    expect(t.store.get().doc.frames.map((f) => f.id)).toEqual(["home", "cart"]);
    expect(t.store.history().length).toBe(steps + 1);

    const batch = await call("apply_ops", { ops: [{ op: "add_part", args: { slug: "button", id: "buy", screen: "cart", props: { label: "Buy" } } }, { op: "set_props", args: { id: "hello", props: { text: "Hi" } } }] });
    expect(batch.isError).toBeFalsy();
    expect(t.store.history().length).toBe(steps + 2);
    t.store.undo();
    const doc = savedDoc(t.store.get());
    expect(doc.groups.flatMap((g) => g.items).some((it) => it.id === "buy")).toBe(false);
    expect(doc.groups.flatMap((g) => g.items).find((it) => it.id === "hello")?.props?.text).toBe("Hello");
    expect(doc.frames.map((f) => f.id)).toEqual(["home", "cart"]);

    /* the activity log in the tab */
    expect(t.view().log.map((e) => e.name).slice(0, 3)).toEqual(["apply_ops", "add_screen", "get_outline"]);
    expect(t.view().log[0]).toMatchObject({ state: "ok", client: "test-client" });
    const status = (await call("connection_status")).structuredContent as { result: { editor: string; access: string } };
    expect(status.result).toMatchObject({ editor: "paired", access: "edit" });
    expect((await client.listTools()).tools.length).toBeGreaterThan(40);
  });

  it("never sends the code to a page, and takes no more codes after too many wrong ones", async () => {
    const { live, port, call } = await server();
    /* a page on an allowed port that is not the author's: it reads what the server says and guesses */
    const heard: string[] = [];
    const rogue = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "http://localhost:5173" });
    cleanup.push(() => rogue.close());
    rogue.on("message", (d) => heard.push(String(d)));
    await new Promise((r) => rogue.once("open", r));
    rogue.send(JSON.stringify({ t: "hello", protocol: 2 }));
    await until(() => heard.some((m) => m.includes('"t":"hello"')));
    expect(heard.join("\n")).not.toContain(live.code);
    expect(heard.join("\n")).not.toContain(live.code.replace("-", ""));
    /* an approval with no code, or a made-up remembered pairing, is a wrong try */
    rogue.send(JSON.stringify({ t: "approve", access: "edit" }));
    await until(() => heard.some((m) => m.includes('"t":"wrong"')));
    expect(JSON.parse(heard.find((m) => m.includes('"t":"wrong"'))!)).toEqual({ t: "wrong", left: PAIRING_TRIES - 1 });
    rogue.send(JSON.stringify({ t: "approve", access: "edit", known: { id: "00ff", mac: "ab".repeat(32) } }));
    await until(() => heard.filter((m) => m.includes('"t":"wrong"')).length === 2);
    const wrong = live.code === "000-000" ? "111-111" : "000-000";
    for (let i = 2; i < PAIRING_TRIES; i++) {
      rogue.send(JSON.stringify({ t: "approve", access: "edit", code: wrong }));
      await until(() => heard.filter((m) => m.includes('"t":"wrong"')).length === i + 1 || heard.some((m) => m.includes('"locked"')));
    }
    await until(() => heard.some((m) => m.includes('"reason":"locked"')));
    expect(live.paired()).toBe(false);
    /* now even the right code is turned away, and the client is told to restart the server */
    const t = tab(port);
    await until(() => t.view().asks.some((a) => a.kind === "pair"));
    t.bridge.approve(port, "edit", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "refused");
    expect(t.view().conns[0].reason).toBe("locked");
    const status = ((await call("connection_status")).structuredContent as { result: Record<string, unknown> }).result;
    expect(status.editor).toMatch(/locked/);
    expect(status.pairingCode).toBeUndefined();
    expect(String(status.howToConnect)).toMatch(/restart/);
  });

  it("asks again after a wrong code, saying how many tries are left", async () => {
    const { live, port } = await server();
    const t = tab(port);
    await until(() => t.view().asks.some((a) => a.kind === "pair"));
    t.bridge.approve(port, "edit", { code: live.code === "123-456" ? "654-321" : "123-456" });
    await until(() => t.view().asks.some((a) => a.kind === "pair" && a.left === PAIRING_TRIES - 1));
    expect(t.view().conns[0].phase).toBe("pairing");
    t.bridge.approve(port, "edit", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "paired");
  });

  it("refuses the pairing when the author says no", async () => {
    const { port, call } = await server();
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.deny(port);
    await until(() => t.view().conns[0]?.phase === "refused");
    expect(errorOf(await call("get_outline"))?.code).toBe("unavailable");
  });

  it("gives a session the author made read-only only the reading tools", async () => {
    const { port, call, client, live } = await server();
    let listChanged = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      listChanged++;
    });
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "read", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "paired");
    await until(() => listChanged > 0);
    const tools = (await client.listTools()).tools;
    expect(tools.every((x) => x.annotations?.readOnlyHint)).toBe(true);
    const r = await call("add_screen", { name: "Nope" });
    expect(errorOf(r)?.code).toBe("refused");
    expect(t.store.get().doc.frames).toHaveLength(1);
    expect(textOf(await call("find_nodes", { text: "hello" }))).toContain("hello");
  });

  it("refuses a destructive call nobody confirms in time, and does one the author allows", async () => {
    const { port, call, live } = await server({ confirmMs: 300 });
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "edit", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "paired");

    const started = Date.now();
    const pending = call("remove_nodes", { ids: ["hello"] });
    await until(() => t.view().asks.some((a) => a.kind === "confirm"));
    expect(t.view().asks[0]).toMatchObject({ kind: "confirm", name: "remove_nodes" });
    const r = await pending;
    expect(Date.now() - started).toBeGreaterThanOrEqual(280);
    expect(errorOf(r)).toMatchObject({ code: "refused" });
    expect(errorOf(r)?.message).toMatch(/did not confirm/);
    expect(t.store.get().doc.groups.flatMap((g) => g.items).some((it) => it.id === "hello")).toBe(true);
    expect(t.view().log[0].state).toBe("denied");

    /* a batch holding a destructive operation asks too; this time the author allows it */
    const second = call("apply_ops", { ops: [{ op: "set_title", args: { title: "x" } }, { op: "remove_nodes", args: { ids: ["hello"] } }] });
    await until(() => t.view().asks.some((a) => a.kind === "confirm"));
    const ask = t.view().asks.find((a) => a.kind === "confirm")!;
    t.bridge.answer((ask as { id: string }).id, true);
    expect((await second).isError).toBeFalsy();
    expect(t.store.get().doc.groups.flatMap((g) => g.items).some((it) => it.id === "hello")).toBe(false);
  });

  it("asks the author before a call that takes work away under a name that does not say so", async () => {
    const { port, call, live } = await server({ confirmMs: 300 });
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "edit", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "paired");
    expect((await call("add_collection", { id: "fruit", name: "Fruit", fields: ["name"], rows: [["Apple"], ["Pear"]] })).isError).toBeFalsy();
    expect(t.view().asks).toEqual([]);

    const pending = call("update_collection", { id: "fruit", rows: [] });
    await until(() => t.view().asks.some((a) => a.kind === "confirm"));
    expect(t.view().asks[0]).toMatchObject({ kind: "confirm", name: "update_collection", summary: expect.stringMatching(/2 of the 2 rows of "Fruit"/) });
    expect(errorOf(await pending)?.message).toMatch(/did not confirm/);
    expect(t.store.get().doc.collections?.[0].rows).toHaveLength(2);
  });

  it("lets a reloaded tab back in without asking, and turns a second tab away", async () => {
    const { port, call, live } = await server();
    const kept = new Map<string, string>();
    const first = tab(port, { storage: kept });
    await until(() => first.view().asks.length > 0);
    first.bridge.approve(port, "edit", { code: live.code });
    await until(() => first.view().conns[0]?.phase === "paired");

    const second = tab(port);
    await until(() => second.view().conns[0]?.phase === "refused");
    expect(second.view().conns[0].reason).toBe("busy");

    first.bridge.stop();
    const again = tab(port, { storage: kept, store: first.store });
    await until(() => again.view().conns[0]?.phase === "paired");
    expect(again.view().asks).toEqual([]);
    expect((await call("list_screens")).isError).toBeFalsy();
  });

  it("draws for a generative call in the tab with the server's model, and never sends a key", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="currentColor"/></svg>';
    const adapter = scriptedAdapter([{ text: svg }]);
    const settings: AiSettings = { provider: "deepseek", baseUrl: "https://example.invalid", model: "m", key: "server-secret-key" };
    const { port, call, client, live } = await server({ gen: { settings, adapter } });
    expect((await client.listTools()).tools.map((x) => x.name)).toContain("generate_svg");
    const sent: string[] = [];
    const t = tab(port, { sent });
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "edit", { code: live.code });
    await until(() => t.view().conns[0]?.phase === "paired");
    const r = await call("generate_svg", { prompt: "a square", route: "code", screen: "home", at: { x: 20, y: 400 }, id: "logo" });
    expect(r.isError).toBeFalsy();
    const logo = t.store.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === "logo");
    expect(logo?.component).toBe("svg");
    expect(String(logo?.props?.markup)).toContain("<path");
    expect(adapter.requests).toHaveLength(1);
    expect(sent.some((m) => m.includes('"t":"draw"'))).toBe(true);
    expect(sent.join("\n")).not.toContain("server-secret-key");
  });
});

describe("a client the author told the editor to remember", () => {
  /** pairs a tab with a server, remembering the client when asked; the tab's store of remembered clients */
  async function pairOnce(trustDir: string, trusted: TrustedStore, remember: boolean, clientName?: string) {
    const s = await server({ trustDir }, clientName);
    const t = tab(s.port, { trusted });
    await until(() => t.view().asks.some((a) => a.kind === "pair"));
    expect(t.view().asks[0]).toMatchObject({ kind: "pair", canRemember: true });
    t.bridge.approve(s.port, "edit", { code: s.live.code, remember });
    await until(() => t.view().conns[0]?.phase === "paired");
    return { s, t };
  }

  it("is approved without asking by the next server of that client, which proves it holds the secret", async () => {
    const dir = scratchDir();
    const trusted = memoryTrusted();
    const first = await pairOnce(dir, trusted, true);
    await until(() => trusted.all.length === 1);
    expect(trusted.all[0]).toMatchObject({ client: { name: "test-client" }, access: "edit" });
    expect(first.t.view().conns[0].remembered).toBe(true);
    await until(() => first.t.view().remembered.length === 1);
    expect(JSON.stringify(first.t.view())).not.toContain(trusted.all[0].secret);
    /* the server's side: a file only the user may read, with the client, origin and access */
    const file = join(dir, "trusted-editors.json");
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8")).editors[0]).toMatchObject({ id: trusted.all[0].id, client: "test-client", origin: EDITOR, access: "edit" });
    first.t.bridge.stop();
    await first.s.close();

    /* the client starts a new server: new code, new port, nothing asked */
    const sent: string[] = [];
    const s2 = await server({ trustDir: dir });
    const t2 = tab(s2.port, { trusted, sent });
    await until(() => t2.view().conns[0]?.phase === "paired");
    expect(t2.view().asks).toEqual([]);
    expect(t2.view().conns[0]).toMatchObject({ remembered: true, access: "edit" });
    expect(sent.some((m) => m.includes('"t":"prove"'))).toBe(true);
    /* the secret was not sent again */
    expect(sent.join("\n")).not.toContain(trusted.all[0].secret);
    expect((await s2.call("list_screens")).isError).toBeFalsy();
  });

  it("is not remembered unless the author asks, and a server for another client asks again", async () => {
    const dir = scratchDir();
    const trusted = memoryTrusted();
    const once = await pairOnce(dir, trusted, false);
    expect(trusted.all).toEqual([]);
    once.t.bridge.stop();
    await once.s.close();
    const s2 = await server({ trustDir: dir });
    const t2 = tab(s2.port, { trusted });
    await until(() => t2.view().asks.some((a) => a.kind === "pair"));

    /* remembered for one client: another client's server proves nothing and is asked about */
    const dir2 = scratchDir();
    const kept = memoryTrusted();
    const a = await pairOnce(dir2, kept, true, "claude-ai");
    await until(() => kept.all.length === 1);
    a.t.bridge.stop();
    await a.s.close();
    const other = await server({ trustDir: dir2 }, "codex-mcp-client");
    const t3 = tab(other.port, { trusted: kept });
    await until(() => t3.view().asks.some((x) => x.kind === "pair"));
    expect(t3.view().conns[0].phase).toBe("pairing");
  });

  it("asks again when the server cannot prove the secret", async () => {
    const dir = scratchDir();
    const trusted = memoryTrusted();
    const once = await pairOnce(dir, trusted, true);
    await until(() => trusted.all.length === 1);
    once.t.bridge.stop();
    await once.s.close();
    /* the server's file holds another secret for that id (a copy that is not the tab's) */
    const file = join(dir, "trusted-editors.json");
    const f = JSON.parse(readFileSync(file, "utf8"));
    f.editors[0].secret = "ab".repeat(32);
    (await import("node:fs")).writeFileSync(file, JSON.stringify(f));
    const s2 = await server({ trustDir: dir });
    const sent: string[] = [];
    const t2 = tab(s2.port, { trusted, sent });
    /* challenged, answered wrong, and asked at once rather than after the wait for a proof */
    await until(() => t2.view().asks.some((a) => a.kind === "pair"), 1500);
    expect(sent.some((m) => m.includes('"t":"prove"'))).toBe(true);
    expect(t2.view().conns[0].phase).toBe("pairing");
  });

  it("is forgotten from the panel: the tab and the server both let it go, and the next server asks", async () => {
    const dir = scratchDir();
    const trusted = memoryTrusted();
    const once = await pairOnce(dir, trusted, true);
    await until(() => trusted.all.length === 1);
    const id = trusted.all[0].id;
    await once.t.bridge.forget(id);
    expect(trusted.all).toEqual([]);
    expect(once.t.view().remembered).toEqual([]);
    const file = join(dir, "trusted-editors.json");
    await until(() => JSON.parse(readFileSync(file, "utf8")).editors.length === 0);
    once.t.bridge.stop();
    await once.s.close();
    const s2 = await server({ trustDir: dir });
    const t2 = tab(s2.port, { trusted });
    await until(() => t2.view().asks.some((a) => a.kind === "pair"));
  });

  it("forgotten while no server listens, tells the next one to forget its side", async () => {
    const dir = scratchDir();
    const trusted = memoryTrusted();
    const once = await pairOnce(dir, trusted, true);
    await until(() => trusted.all.length === 1);
    once.t.bridge.stop();
    await once.s.close();
    const off = new EditorBridge({ store: editorStore(), WebSocket: tabSocket() as never, ports: [], trusted });
    await off.forget(trusted.all[0].id);
    expect(trusted.all[0].forgotten).toBe(true);
    const file = join(dir, "trusted-editors.json");
    expect(JSON.parse(readFileSync(file, "utf8")).editors).toHaveLength(1);
    const s2 = await server({ trustDir: dir });
    const t2 = tab(s2.port, { trusted });
    await until(() => t2.view().asks.some((a) => a.kind === "pair"));
    await until(() => JSON.parse(readFileSync(file, "utf8")).editors.length === 0);
    expect(trusted.all).toEqual([]);
  });
});
