/* The editor's end of the live bridge against a server played by the test, message by message: a call has its
 * lifecycle from the moment it arrives, so a cancel reaches it while it waits its turn, while it is checked, while the
 * author is asked and after the connection it came on is gone; an approval holds only for what the author was shown,
 * and a call whose check fails is not done. */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { executeTool } from "../tools";
import type { Renderer } from "../tools/types";
import { EditorBridge, type BridgeAsk } from "./editorBridge";
import { BRIDGE_PROTOCOL, type EditorMsg, type ServerMsg } from "./protocol";

/* the review of what a call takes away, held or broken on purpose */
const review = vi.hoisted(() => ({ gate: null as Promise<void> | null, fail: false, calls: 0 }));
vi.mock("../tools/removals", async (importOriginal) => {
  const real = await importOriginal<typeof import("../tools/removals")>();
  return {
    ...real,
    wouldTakeAway: async (...a: Parameters<typeof real.wouldTakeAway>) => {
      review.calls++;
      if (review.fail) throw new Error("the reviewer broke");
      if (review.gate) await review.gate;
      return real.wouldTakeAway(...a);
    },
  };
});

beforeAll(() => setGlobalLang("en"));
afterEach(() => {
  review.gate = null;
  review.fail = false;
  review.calls = 0;
});

const PORT = 47999;

/** a socket the test plays the server's end of */
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 1;
  sent: EditorMsg[] = [];
  onclose: ((e: never) => void) | null = null;
  onerror: ((e: never) => void) | null = null;
  onmessage: ((e: never) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as EditorMsg);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({} as never);
  }
  /** what the server says */
  say(msg: ServerMsg) {
    this.onmessage?.({ data: JSON.stringify(msg) } as never);
  }
  results() {
    return this.sent.filter((m): m is Extract<EditorMsg, { t: "result" }> => m.t === "result");
  }
}

const until = async (ok: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function editorStore() {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => "en" });
  store.transact("Start", "user", (tx) => {
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addPart, { slug: "box", id: "card", screen: "home", at: { x: 16, y: 120 } });
    tx.run(ops.addPart, { slug: "text", id: "hello", into: { container: "card" }, props: { text: "Hello" } });
  });
  return store;
}

/** a screenshot that is drawn when the test says so: a long call that holds the queue */
function heldRenderer() {
  const waiting: (() => void)[] = [];
  const renderer: Renderer = {
    screenshot: (_id, o) =>
      new Promise((resolve, reject) => {
        waiting.push(() => resolve("data:image/png;base64,AAAA"));
        o?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Stopped."), { name: "AbortError" })));
      }),
  };
  return { renderer, release: () => waiting.splice(0).forEach((f) => f()), held: () => waiting.length };
}

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops) s();
  stops = [];
  FakeSocket.all = [];
});

/** a bridge on a store, paired with the test's server; the server's socket now */
async function paired(o: { renderer?: Renderer; confirmMs?: number } = {}) {
  const store = editorStore();
  const kept = new Map<string, string>();
  const bridge = new EditorBridge({ store, WebSocket: FakeSocket as never, ports: [PORT], retryMs: 20, renderer: o.renderer, storage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v), removeItem: (k) => void kept.delete(k) } });
  bridge.start();
  stops.push(() => bridge.stop());
  const hello = (s: FakeSocket) => s.say({ t: "hello", protocol: BRIDGE_PROTOCOL, server: { name: "m3e-canvas-mcp", version: "test", id: "srv1" }, client: { name: "test-client" }, access: "edit", challenge: "ab".repeat(16), generate: false, confirmMs: o.confirmMs ?? 2000 });
  const pair = async () => {
    const s = FakeSocket.all[FakeSocket.all.length - 1];
    hello(s);
    await until(() => s.sent.some((m) => m.t === "hello"));
    s.say({ t: "paired", access: "edit", resume: "resume-token" });
    await until(() => bridge.view().conns[0]?.phase === "paired");
    return s;
  };
  await until(() => FakeSocket.all.length === 1);
  const first = await pair();
  return { store, bridge, sock: first, pair, confirms: () => bridge.view().asks.filter((a): a is Extract<BridgeAsk, { kind: "confirm" }> => a.kind === "confirm") };
}

const frames = (store: DocStore) => store.get().doc.frames.map((f) => f.id);
const has = (store: DocStore, id: string) => store.get().doc.groups.some((g) => g.items.some((it) => it.id === id));

describe("a call's lifecycle in the tab", () => {
  it("is cancelled while it waits behind a long call: it never runs, and later calls still do", async () => {
    const held = heldRenderer();
    const { store, sock } = await paired({ renderer: held.renderer });
    sock.say({ t: "call", id: "a", name: "screenshot", args: { id: "home" }, client: null });
    await until(() => held.held() === 1);
    sock.say({ t: "call", id: "b", name: "add_screen", args: { id: "cart", name: "Cart" }, client: null });
    await tick();
    sock.say({ t: "cancel", id: "b" });
    /* answered at once, while A still holds the queue */
    await until(() => sock.results().some((r) => r.id === "b"));
    expect(sock.results().find((r) => r.id === "b")?.outcome).toMatchObject({ ok: false, error: { code: "aborted" } });
    held.release();
    await until(() => sock.results().some((r) => r.id === "a"));
    expect(sock.results().find((r) => r.id === "a")?.outcome.ok).toBe(true);
    await tick(60);
    expect(frames(store)).toEqual(["home"]);
    expect(sock.results().filter((r) => r.id === "b")).toHaveLength(1);
    /* the queue goes on */
    sock.say({ t: "call", id: "c", name: "add_screen", args: { id: "more", name: "More" }, client: null });
    await until(() => sock.results().some((r) => r.id === "c"));
    expect(frames(store)).toEqual(["home", "more"]);
  });

  it("is cancelled while it is checked for what it takes away: no confirmation comes up and nothing is written", async () => {
    const { store, sock, confirms } = await paired();
    let open!: () => void;
    review.gate = new Promise<void>((r) => (open = r));
    sock.say({ t: "call", id: "b", name: "update_collection", args: { id: "fruit", rows: [] }, client: null });
    await until(() => review.calls === 1);
    sock.say({ t: "cancel", id: "b" });
    await until(() => sock.results().some((r) => r.id === "b"));
    open();
    await tick(80);
    expect(confirms()).toEqual([]);
    expect(sock.results().filter((r) => r.id === "b")).toHaveLength(1);
    review.gate = null;
    sock.say({ t: "call", id: "c", name: "add_screen", args: { id: "cart", name: "Cart" }, client: null });
    await until(() => sock.results().some((r) => r.id === "c"));
    expect(frames(store)).toEqual(["home", "cart"]);
  });

  it("is cancelled while the author is asked: the ask goes away and nothing is removed", async () => {
    const { store, sock, confirms } = await paired();
    sock.say({ t: "call", id: "b", name: "remove_nodes", args: { ids: ["hello"] }, client: null });
    await until(() => confirms().length === 1);
    sock.say({ t: "cancel", id: "b" });
    await until(() => sock.results().some((r) => r.id === "b"));
    expect(confirms()).toEqual([]);
    expect(sock.results()[0].outcome).toMatchObject({ ok: false, error: { code: "aborted" } });
    expect(has(store, "hello")).toBe(true);
  });

  it("never runs a call that came on a socket since lost: after reconnecting, no stale confirmation and no write", async () => {
    const held = heldRenderer();
    const { store, sock, pair, confirms, bridge } = await paired({ renderer: held.renderer });
    sock.say({ t: "call", id: "a", name: "screenshot", args: { id: "home" }, client: null });
    await until(() => held.held() === 1);
    sock.say({ t: "call", id: "b", name: "remove_nodes", args: { ids: ["hello"] }, client: null });
    sock.say({ t: "call", id: "c", name: "add_screen", args: { id: "cart", name: "Cart" }, client: null });
    await tick();
    /* the server goes away and comes back (the same server: the tab resumes without asking) */
    sock.close();
    await until(() => FakeSocket.all.length === 2);
    const again = await pair();
    held.release();
    await tick(150);
    expect(confirms()).toEqual([]);
    expect(has(store, "hello")).toBe(true);
    expect(frames(store)).toEqual(["home"]);
    /* nothing of the old socket's is answered on the new one */
    expect(again.results()).toEqual([]);
    expect(bridge.view().log.filter((e) => e.state === "running" || e.state === "asking")).toEqual([]);
    /* the new connection works, its own destructive call asks as it should */
    again.say({ t: "call", id: "b", name: "add_screen", args: { id: "fresh", name: "Fresh" }, client: null });
    await until(() => again.results().some((r) => r.id === "b"));
    expect(frames(store)).toEqual(["home", "fresh"]);
  });

  it("stops what is queued when the bridge is turned off", async () => {
    const held = heldRenderer();
    const { store, sock, bridge } = await paired({ renderer: held.renderer });
    sock.say({ t: "call", id: "a", name: "screenshot", args: { id: "home" }, client: null });
    await until(() => held.held() === 1);
    sock.say({ t: "call", id: "b", name: "add_screen", args: { id: "cart", name: "Cart" }, client: null });
    await tick();
    bridge.stop();
    held.release();
    await tick(80);
    expect(frames(store)).toEqual(["home"]);
  });
});

describe("what the author approves", () => {
  async function withFruit() {
    const p = await paired();
    expect((await executeTool(p.store, "add_collection", { id: "fruit", name: "Fruit", fields: ["name"], rows: [["Apple"], ["Pear"]] }, { origin: "user" })).ok).toBe(true);
    return p;
  }

  it("is asked again when the document changes while the author is asked, with what the call would take now", async () => {
    const { store, sock, confirms, bridge } = await withFruit();
    sock.say({ t: "call", id: "b", name: "update_collection", args: { id: "fruit", rows: [] }, client: null });
    await until(() => confirms().length === 1);
    expect(confirms()[0].summary).toMatch(/2 of the 2 rows of "Fruit"/);
    /* the author adds a row while the ask is up, then allows what they were shown */
    expect((await executeTool(store, "update_collection", { id: "fruit", rows: [["Apple"], ["Pear"], ["Plum"]] }, { origin: "user" })).ok).toBe(true);
    bridge.answer(confirms()[0].id, true);
    await until(() => confirms().some((a) => a.changed));
    /* not done on the old summary: asked again with what it takes now */
    expect(store.get().doc.collections?.[0].rows).toHaveLength(3);
    expect(sock.results()).toEqual([]);
    expect(confirms()[0].summary).toMatch(/3 of the 3 rows of "Fruit"/);
    bridge.answer(confirms()[0].id, true);
    await until(() => sock.results().some((r) => r.id === "b"));
    expect(sock.results()[0].outcome.ok).toBe(true);
    expect(store.get().doc.collections?.[0].rows).toHaveLength(0);
  });

  it("is asked again when the author edits the target of a destructive call, and declined it is not done", async () => {
    const { store, sock, confirms, bridge } = await paired();
    sock.say({ t: "call", id: "b", name: "remove_nodes", args: { ids: ["hello"] }, client: null });
    await until(() => confirms().length === 1);
    expect((await executeTool(store, "set_props", { id: "hello", props: { text: "Edited while asked" } }, { origin: "user" })).ok).toBe(true);
    bridge.answer(confirms()[0].id, true);
    await until(() => confirms().some((a) => a.changed));
    expect(has(store, "hello")).toBe(true);
    bridge.answer(confirms()[0].id, false);
    await until(() => sock.results().some((r) => r.id === "b"));
    expect(sock.results()[0].outcome).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(has(store, "hello")).toBe(true);
  });

  it("holds when what the author edited meanwhile is not what the call changes", async () => {
    const { store, sock, confirms, bridge } = await paired();
    /* laid out once, as the canvas has it */
    expect((await executeTool(store, "add_screen", { id: "other", name: "Other" }, { origin: "user" })).ok).toBe(true);
    sock.say({ t: "call", id: "b", name: "remove_nodes", args: { ids: ["hello"] }, client: null });
    await until(() => confirms().length === 1);
    expect((await executeTool(store, "add_part", { slug: "button", id: "elsewhere", screen: "other", props: { label: "Go" } }, { origin: "user" })).ok).toBe(true);
    expect((await executeTool(store, "set_title", { title: "Renamed while asked" }, { origin: "user" })).ok).toBe(true);
    bridge.answer(confirms()[0].id, true);
    await until(() => sock.results().some((r) => r.id === "b"));
    expect(sock.results()[0].outcome.ok).toBe(true);
    expect(has(store, "hello")).toBe(false);
    expect(has(store, "elsewhere")).toBe(true);
    expect(store.get().doc.title).toBe("Renamed while asked");
  });

  it("refuses a call whose takes cannot be checked, saying why, and asks nothing", async () => {
    const { store, sock, confirms } = await withFruit();
    review.fail = true;
    sock.say({ t: "call", id: "b", name: "update_collection", args: { id: "fruit", rows: [] }, client: null });
    await until(() => sock.results().some((r) => r.id === "b"));
    const out = sock.results()[0].outcome;
    expect(out).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(!out.ok && out.error.message).toMatch(/could not be checked \(the reviewer broke\)/);
    expect(confirms()).toEqual([]);
    expect(store.get().doc.collections?.[0].rows).toHaveLength(2);
  });
});
