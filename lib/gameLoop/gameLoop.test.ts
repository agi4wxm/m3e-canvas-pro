/* The preview answered by a local game loop (docs/玩法契约.md “本地 game-loop”), against the stand-in game loop of the
 * tests (fixtures/standIn.ts) with no network in between: the address the project keeps (never a credential), the
 * hello that says whose contract the game loop plays and at which version, and what is wrong when it does not answer
 * as the document expects (nothing there, CORS, another version); the summon's and the check-in's templates answered by
 * it through the preview's data engine, each refusal on its own notice; a realtime channel and the world over the
 * exported client's wire; and the preview bar's choice kept in the project's configuration. */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRuntime } from "../app/runtime";
import { outcomeOf } from "../app/actions";
import { DesignRuntime, authConfigOf, steadyTransport } from "../bindings/design";
import { endpointOf, paramsOf } from "../bindings/contract";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { Backend } from "../actions/consistency/check";
import { ReferenceHost } from "../actions/consistency/reference";
import { conditionHolds, run } from "../actions/run";
import type { Action } from "../actions/model";
import type { ChannelMessage } from "../api/transport";
import type { SocketLike } from "../export/files/api/realtime";
import type { FetchTransportOptions } from "../export/files/api/fetch";
import { setGlobalLang } from "../i18n";
import { openProject, projectFile } from "../project";
import type { Doc, Item } from "../tokens";
import { connectWorld } from "../world/example";
import { createWorlds } from "../world/channel";
import { createStandIn, type StandIn } from "./fixtures/standIn";
import { GAME_LOOP_HELLO, checkGameLoop, cleanGameLoopLink, createGameLoopTransport, createGameLoopWorld, gameLoopOf, readGameLoopHello, readGameLoopUrl, type HelloFetch } from ".";

beforeAll(() => setGlobalLang("en"));

const URL_ = "http://127.0.0.1:8787";
let standIns: StandIn[] = [];
afterEach(() => {
  standIns.forEach((s) => s.stop());
  standIns = [];
});
const standIn = (tickMs = 20) => {
  const s = createStandIn({ tickMs });
  standIns.push(s);
  return s;
};

/** the stand-in reached as a browser reaches it: a request it does not let other origins read fails as a browser fails
 *  one (a TypeError, the same as nothing there), unless it is opaque (`no-cors`) */
type Loose = { method?: string; headers?: unknown; body?: unknown; mode?: string };
const browserFetch = (s: StandIn) =>
  (async (url: string, init?: Loose) => {
    const res = await s.handle(new Request(url, { method: init?.method ?? "GET", headers: init?.headers as Record<string, string> | undefined, body: (init?.body as string | undefined) ?? undefined }));
    if (init?.mode !== "no-cors" && !res.headers.get("access-control-allow-origin")) throw new TypeError("Failed to fetch");
    return res;
  }) as unknown as HelloFetch & NonNullable<FetchTransportOptions["fetch"]>;
const nobody: HelloFetch = () => Promise.reject(new TypeError("Failed to fetch"));

/** the stand-in's sockets, in memory: what the realtime client opens goes straight to it */
const sockets =
  (s: StandIn) =>
  (url: string): SocketLike => {
    const fns: { open?: () => void; text?: (t: string) => void; close?: () => void } = {};
    let taken: ReturnType<StandIn["connect"]>;
    queueMicrotask(() => {
      taken = s.connect(url, { send: (t) => fns.text?.(t), close: () => fns.close?.() });
      if (taken) fns.open?.();
      else fns.close?.();
    });
    return {
      send: (t) => taken?.text(t),
      close: () => {
        taken?.close();
        fns.close?.();
      },
      onOpen: (fn) => void (fns.open = fn),
      onText: (fn) => void (fns.text = fn),
      onClose: (fn) => void (fns.close = fn),
    };
  };

const until = async (ok: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("never");
    await new Promise((r) => setTimeout(r, 5));
  }
};

const store = (doc: Partial<Doc> = {}) => new DocStore(stateOf({ groups: [], frames: [], ...doc }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const mcp = { origin: "mcp" as const };
function withTemplate(slug: string): Doc {
  const s = store();
  s.run(ops.addTemplate, { slug }, mcp);
  return savedDoc(s.get());
}
const itemsOf = (doc: Doc): Item[] => doc.groups.flatMap((g) => g.items);

/** the preview's way of running a tap (as lib/game/game.test.ts runs it against the mocks), its calls through the
 *  preview's data engine to the game loop's transport */
function preview(doc: Doc, s: StandIn) {
  const transport = createGameLoopTransport({ url: URL_, api: doc.api, fetch: browserFetch(s) });
  const runtime = createRuntime({ transport: steadyTransport(() => transport), auth: authConfigOf(doc.api), lang: "en", now: () => 0 });
  const data = new DesignRuntime(runtime, () => doc);
  const host = new ReferenceHost(doc, new Backend({}));
  host.call = async (operationId, given) => {
    const ep = endpointOf(doc.api!, operationId);
    const takes = new Set(ep ? paramsOf(doc.api!, ep).map((p) => p.name) : []);
    const params: Record<string, unknown> = {};
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(given.args)) (takes.has(k) ? params : fields)[k] = v;
    return outcomeOf(await data.call(operationId, { params, body: given.body !== undefined ? given.body : Object.keys(fields).length ? fields : undefined }));
  };
  const tap = async (part: Item) => {
    host.snack = undefined as never;
    await run(part.action as Action, host, { screen: doc.frames[0].id, part: part.id });
    const notices = doc.groups.filter((g) => g.showWhen && "expr" in g.showWhen && /Issue/.test(g.showWhen.expr));
    return { shown: notices.filter((g) => conditionHolds(g.showWhen, host, { screen: doc.frames[0].id })).map((g) => (g.showWhen as { expr: string }).expr), toast: host.snack as string | undefined };
  };
  return { tap };
}

describe("the address the project keeps", () => {
  it("is an http(s) address with no credential, query or fragment in it", () => {
    expect(readGameLoopUrl(" http://localhost:8787/ ")).toEqual({ url: "http://localhost:8787" });
    expect(readGameLoopUrl("https://dev.example.com/loop/")).toEqual({ url: "https://dev.example.com/loop" });
    expect(readGameLoopUrl("")).toEqual({ problem: "empty" });
    expect(readGameLoopUrl("localhost:8787")).toEqual({ problem: "scheme" });
    expect(readGameLoopUrl("ws://localhost:8787")).toEqual({ problem: "scheme" });
    expect(readGameLoopUrl("http://me:secret@localhost:8787")).toEqual({ problem: "credentials" });
    expect(readGameLoopUrl("http://localhost:8787/?token=abc")).toEqual({ problem: "query" });
    expect(readGameLoopUrl("http://localhost:8787/#key")).toEqual({ problem: "query" });
    expect(cleanGameLoopLink({ url: "http://localhost:8787", preview: true, token: "x" })).toEqual({ url: "http://localhost:8787", preview: true });
  });

  it("is set by the preview bar's operation, one step of the history, and refused with a secret in it", () => {
    const s = store();
    s.run(ops.setGameLoop, { url: "http://localhost:8787/", preview: true }, { origin: "user" });
    expect(s.get().doc.external).toEqual({ gameLoop: { url: "http://localhost:8787", preview: true } });
    s.run(ops.setGameLoop, { url: "http://localhost:8787", preview: false }, { origin: "user" });
    expect(gameLoopOf(s.get().doc)).toEqual({ url: "http://localhost:8787" });
    expect(() => s.run(ops.setGameLoop, { url: "http://localhost:8787?key=1", preview: true }, { origin: "user" })).toThrow(/no user, password, query or fragment/);
    expect(() => s.run(ops.setGameLoop, { url: "http://localhost:8787" }, { origin: "user" })).toThrow(/already/);
    s.undo();
    expect(gameLoopOf(s.get().doc)).toEqual({ url: "http://localhost:8787", preview: true });
    s.run(ops.setGameLoop, { url: "" }, { origin: "user" });
    expect(s.get().doc.external).toBeUndefined();
  });

  it("is kept by the project file, and one with a secret in it is not read", () => {
    const doc = { ...withTemplate("gacha-pull"), external: { gameContract: "loop/contract.m3e-game.json", gameLoop: { url: "http://localhost:8787", preview: true } } };
    expect(openProject(JSON.parse(JSON.stringify(projectFile(doc))))?.external).toEqual(doc.external);
    const leaky = { ...doc, external: { gameLoop: { url: "http://me:pw@localhost:8787", preview: true } } };
    expect(openProject(JSON.parse(JSON.stringify(projectFile(leaky as Doc))))?.external).toBeUndefined();
  });
});

describe("the game loop's hello", () => {
  const expected = { namespace: "game", contractVersion: "1.0.0" };
  it("says whose contract it plays and at which version, and its clock", async () => {
    const s = standIn();
    const out = await checkGameLoop(URL_, expected, browserFetch(s));
    expect(out.status).toMatchObject({ state: "ok", hello: { namespace: "game", contractVersion: "1.0.0" } });
    expect(Math.abs(out.offset ?? NaN)).toBeLessThan(1000);
    expect(s.calls[0]).toEqual({ method: "GET", path: GAME_LOOP_HELLO });
    expect(readGameLoopHello({ format: "m3e-game-loop", version: 2, namespace: "game", contractVersion: "1" })).toBeUndefined();
  });

  it("tells nothing there, a game loop that refuses this page (CORS), another version and no game loop apart", async () => {
    const s = standIn();
    expect((await checkGameLoop(URL_, expected, nobody)).status).toEqual({ state: "unreachable" });
    s.state.cors = false;
    expect((await checkGameLoop(URL_, expected, browserFetch(s))).status).toEqual({ state: "cors" });
    s.state.cors = true;
    s.state.contractVersion = "2.0.0";
    expect((await checkGameLoop(URL_, expected, browserFetch(s))).status).toMatchObject({ state: "version", expected: "1.0.0", hello: { contractVersion: "2.0.0" } });
    expect((await checkGameLoop(URL_, { namespace: "arena", contractVersion: "2.0.0" }, browserFetch(s))).status).toMatchObject({ state: "namespace", expected: "arena" });
    /* a document with no contract linked expects nothing of it */
    expect((await checkGameLoop(URL_, undefined, browserFetch(s))).status.state).toBe("ok");
    const notALoop: HelloFetch = async () => ({ status: 404, json: async () => ({}) });
    expect((await checkGameLoop(URL_, expected, notALoop)).status).toEqual({ state: "not-a-game-loop", status: 404 });
  });
});

describe("the summon and the check-in, answered by the local game loop", () => {
  it("show what the game loop drew, and each refusal on its own notice", async () => {
    const doc = withTemplate("gacha-pull");
    const [one, ten] = itemsOf(doc).filter((it) => it.component === "button" && it.action?.effects?.some((e) => e.do === "call"));
    const s = standIn();
    const p = preview(doc, s);
    const done = await p.tap(ten);
    expect(done.shown).toEqual([]);
    expect(done.toast).toBe("Stand-in Knight");
    expect(s.calls.at(-1)).toEqual({ method: "POST", path: "/game/commands/pull", body: { count: 10 } });
    expect(s.state.gems).toBe(100);
    /* 100 gems left, a pull costs 150: the game loop says not enough */
    expect((await p.tap(one)).shown).toEqual(["vars.summonIssue == 'gems'"]);
    s.state.gems = 1000;
    s.state.poolOpen = false;
    expect((await p.tap(one)).shown).toEqual(["vars.summonIssue == 'closed'"]);
    /* the game loop gone: the design for any other failure */
    const gone = createGameLoopTransport({ url: URL_, api: doc.api, fetch: nobody as never });
    await expect(gone.request({ operationId: "game.pull", method: "POST", path: "/game/commands/pull", body: { count: 1 } })).rejects.toThrow();
  });

  it("show the day the game loop counts, and a check-in already made today on its own notice", async () => {
    const doc = withTemplate("daily-check-in");
    const button = itemsOf(doc).find((it) => it.action?.effects?.some((e) => e.do === "call"))!;
    const s = standIn();
    const p = preview(doc, s);
    const done = await p.tap(button);
    expect(done.shown).toEqual([]);
    expect(done.toast).toBe("Stand-in gems ×50");
    expect((await p.tap(button)).shown).toEqual(["vars.checkInIssue == 'cooldown'"]);
  });
});

describe("the realtime channels and the world, over the exported client's wire", () => {
  it("open the contract's channels under the game loop's realtime prefix", async () => {
    const s = standIn();
    const doc = withTemplate("gacha-pull");
    const api = { ...doc.api!, channels: [{ id: "ticker", address: "/ticker", messages: [{ name: "tick", payload: { type: "object" as const, properties: { n: { type: "number" as const } }, required: ["n"] } }], operations: [{ id: "onTick", action: "send" as const }] }] };
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
      return sockets(s)(url);
    };
    const t = createGameLoopTransport({ url: URL_, api, fetch: browserFetch(s), open });
    const got: ChannelMessage[] = [];
    const statuses: string[] = [];
    const c = t.connect!("ticker", (m) => got.push(m), { onStatus: (x) => statuses.push(x) });
    await until(() => got.length >= 2);
    c.close();
    expect(opened).toEqual(["ws://127.0.0.1:8787/realtime/ticker"]);
    expect(statuses[0]).toBe("open");
    expect(got.slice(0, 2).map((m) => [m.channel, m.message, m.payload])).toEqual([
      ["ticker", "tick", { n: 1 }],
      ["ticker", "tick", { n: 2 }],
    ]);
  });

  it("play the world through the World interface: its snapshots, the inputs sent to it, its events and its clock", async () => {
    const s = standIn();
    const opened: string[] = [];
    const w = createGameLoopWorld({ url: URL_, view: "arena", open: (url) => (opened.push(url), sockets(s)(url)) });
    const worlds = createWorlds();
    const hits: unknown[] = [];
    /* an input held before the world was mounted reaches it once it is */
    worlds.send("arena", "move", { x: 1, y: 0 });
    const off = connectWorld(w, worlds.channel("arena"), (name, payload) => hits.push([name, payload]));
    w.mount(null, { w: 360, h: 240 });
    await until(() => (w.view().entities?.find((e) => e.id === "hero")?.x ?? 0) > 20);
    expect(opened).toEqual(["ws://127.0.0.1:8787/realtime/world?view=arena"]);
    expect(s.inputs[0]).toBe('move {"x":1,"y":0}');
    worlds.send("arena", "attack", true);
    await until(() => hits.length > 0 && (w.view().score ?? 0) >= 10);
    expect(hits[0]).toEqual(["hit", { id: "slime", by: "hero" }]);
    expect(await w.requestPause(true)).toEqual({ accepted: true });
    await until(() => w.clock().paused);
    const stood = w.clock().now;
    await new Promise((r) => setTimeout(r, 60));
    expect(w.clock().now).toBe(stood);
    expect(w.view().status).toBe("paused");
    off();
    w.unmount();
  });
});
