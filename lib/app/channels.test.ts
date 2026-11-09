import { describe, expect, it } from "vitest";
import type { ChannelMessage, Transport } from "../api/transport";
import { channelView } from "../bindings/channels";
import { channelSpecFor } from "./channels";
import { createRuntime } from "./runtime";
import { Bindings } from "./scope";

/** a back end with realtime channels: every connection kept, open or closed, and a clock of its own */
function backend() {
  const conns: { address: string; on: (m: ChannelMessage) => void; open: boolean; token?: string }[] = [];
  let now = 5000;
  const transport: Transport = {
    request: async () => ({ status: 200, headers: {}, body: {} }),
    connect(address, on, o) {
      const c = { address, on, open: true, ...(o?.token ? { token: o.token } : {}) };
      conns.push(c);
      return { send: () => {}, close: () => void (c.open = false) };
    },
    now: () => now,
  };
  return {
    transport,
    conns,
    tick: (ms: number) => void (now += ms),
    /** a message on every connection to the address, the closed ones too */
    push: (address: string, message: string, payload: unknown) => conns.filter((c) => c.address === address).forEach((c) => c.on({ channel: "feed", message, payload, at: now })),
  };
}

const spec = { key: "feed:/feed", channel: "feed", address: "/feed", keep: 2 };

describe("the subscriptions of lib/app", () => {
  it("keep the newest messages, hand each on, and read as data.<name> does", () => {
    const b = backend();
    const rt = createRuntime({ transport: b.transport });
    const heard: string[] = [];
    const sub = rt.channels.subscribe(spec, (m) => heard.push(m.message));
    expect(rt.channels.state(sub.id)?.status).toBe("open");
    b.push("/feed", "post", { n: 1 });
    b.push("/feed", "post", { n: 2 });
    b.push("/feed", "ping", { n: 3 });
    expect(heard).toEqual(["post", "post", "ping"]);
    const view = channelView(rt.channels.state(sub.id));
    expect(view.items).toEqual([{ n: 2 }, { n: 3 }]);
    expect(view.value).toEqual({ n: 3 });
    expect(view.latest).toEqual({ message: "ping", payload: { n: 3 }, at: new Date(5000).toISOString() });
    expect(channelView(rt.channels.state(sub.id), { newest: true }).items).toEqual([{ n: 3 }, { n: 2 }]);
  });

  it("keep only the messages they ask for", () => {
    const b = backend();
    const rt = createRuntime({ transport: b.transport });
    const sub = rt.channels.subscribe({ ...spec, messages: ["post"] });
    b.push("/feed", "ping", {});
    b.push("/feed", "post", { n: 1 });
    expect(channelView(rt.channels.state(sub.id)).count).toBe(1);
  });

  it("drop what comes on a closed subscription, and after the runtime starts over (late answers' rules)", () => {
    const b = backend();
    const rt = createRuntime({ transport: b.transport });
    const heard: unknown[] = [];
    const sub = rt.channels.subscribe(spec, (m) => heard.push(m.payload));
    sub.close();
    expect(b.conns[0].open).toBe(false);
    b.push("/feed", "post", { late: true });
    expect(heard).toEqual([]);
    const again = rt.channels.subscribe(spec, (m) => heard.push(m.payload));
    rt.restart();
    expect(b.conns[1].open).toBe(false);
    expect(rt.channels.state(again.id)).toBeUndefined();
    b.push("/feed", "post", { afterRestart: true });
    expect(heard).toEqual([]);
  });

  it("read as closed on a transport with no realtime, and hand the session's token to one that has", () => {
    const rt = createRuntime({ transport: { request: async () => ({ status: 200, headers: {}, body: {} }) } });
    expect(rt.channels.state(rt.channels.subscribe(spec).id)?.status).toBe("closed");
    const b = backend();
    const signed = createRuntime({ transport: b.transport });
    signed.session.signIn({ token: "t-1" });
    signed.channels.subscribe(spec);
    expect(b.conns[0].token).toBe("t-1");
  });

  it("fill the address with the screen's scope, and key by it", () => {
    const $ = new Bindings({ params: { roomId: "r 7" }, vars: { n: 3 } }, { lang: "en" });
    expect(channelSpecFor({ name: "room", channel: "room", address: "/rooms/{roomId}" }, $)).toEqual({ key: "room:/rooms/r%207", channel: "room", address: "/rooms/r%207", keep: 50 });
    expect(channelSpecFor({ name: "room", channel: "room", address: "/rooms/{roomId}", params: { roomId: "vars.n" }, keep: 9999, messages: ["said"] }, $)).toEqual({ key: "room:/rooms/3", channel: "room", address: "/rooms/3", messages: ["said"], keep: 500 });
  });

  it("tell the time of the transport's clock, the device's only for a transport that tells none", () => {
    const b = backend();
    const rt = createRuntime({ transport: b.transport });
    expect(rt.now()).toBe(5000);
    b.tick(250);
    expect(rt.ctx().now).toBe(5250);
    const plain = createRuntime({ transport: { request: async () => ({ status: 200, headers: {}, body: {} }) } });
    expect(Math.abs(plain.now() - Date.now())).toBeLessThan(1000);
    expect(createRuntime({ transport: b.transport, now: () => 7 }).now()).toBe(7);
  });
});
