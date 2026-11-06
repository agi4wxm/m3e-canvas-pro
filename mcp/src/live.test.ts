/* The live bridge, end to end in Node: the MCP server's WebSocket and the editor's own end of it (lib/mcp/editorBridge.ts)
 * on a store like the editor's, joined by a real socket. Pages that are not the editor are turned away; a tab pairs
 * only when the author approves; calls change the tab's store, each one undo step; read-only access takes the writing
 * tools away; a destructive call nobody confirms is refused; a generative call draws on the server's side. */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import { setGlobalLang } from "../../lib/i18n";
import { scriptedAdapter } from "../../lib/llm/testkit";
import { EditorBridge, type BridgeView } from "../../lib/mcp/editorBridge";
import type { AiSettings } from "../../lib/ai";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { connect, errorOf, textOf } from "./testkit";
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

async function server(o: Parameters<typeof connect>[0] = {}) {
  const s = await connect({ live: true, port: 0, ports: 1, pairWaitMs: 200, ...o });
  cleanup.push(s.close);
  const live = s.backend as LiveBackend;
  return { ...s, live, port: live.port! };
}

function tab(port: number, o: { store?: DocStore; storage?: Map<string, string>; origin?: string; sent?: string[] } = {}) {
  const store = o.store ?? editorStore();
  const kept = o.storage ?? new Map<string, string>();
  const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  const bridge = new EditorBridge({ store, WebSocket: tabSocket(o.origin, o.sent) as never, ports: [port], storage, retryMs: 100 });
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

  it("pairs only when the author approves the code, then runs calls in the tab, each one undo step", async () => {
    const { live, port, call, client } = await server();
    const notConnected = await call("get_outline");
    expect(errorOf(notConnected)?.code).toBe("unavailable");
    expect(errorOf(notConnected)?.hint).toContain(live.code);

    const t = tab(port);
    await until(() => t.view().asks.some((a) => a.kind === "pair"));
    const ask = t.view().asks.find((a) => a.kind === "pair")!;
    expect(ask).toMatchObject({ kind: "pair", code: live.code, offered: "edit" });
    expect(ask.client?.name).toBe("test-client");
    /* not approved yet: nothing reaches the tab */
    expect(errorOf(await call("get_outline"))?.message).toMatch(/not approved/);

    t.bridge.approve(port, "edit");
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

  it("refuses the pairing when the author says no", async () => {
    const { port, call } = await server();
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.deny(port);
    await until(() => t.view().conns[0]?.phase === "refused");
    expect(errorOf(await call("get_outline"))?.code).toBe("unavailable");
  });

  it("gives a session the author made read-only only the reading tools", async () => {
    const { port, call, client } = await server();
    let listChanged = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      listChanged++;
    });
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "read");
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
    const { port, call } = await server({ confirmMs: 300 });
    const t = tab(port);
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "edit");
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

  it("lets a reloaded tab back in without asking, and turns a second tab away", async () => {
    const { port, call } = await server();
    const kept = new Map<string, string>();
    const first = tab(port, { storage: kept });
    await until(() => first.view().asks.length > 0);
    first.bridge.approve(port, "edit");
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
    const { port, call, client } = await server({ gen: { settings, adapter } });
    expect((await client.listTools()).tools.map((x) => x.name)).toContain("generate_svg");
    const sent: string[] = [];
    const t = tab(port, { sent });
    await until(() => t.view().asks.length > 0);
    t.bridge.approve(port, "edit");
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
