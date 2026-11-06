/* Realtime channels played by the mocks: when the app connects to a channel (by its id or its address), the scripts of
 * that channel run their timelines of server messages, again every so often if they repeat; a script can also start
 * when the app calls an operation (a message is posted, the server pushes it) or sends a message of its own (an
 * auto-reply). A message's payload is made from its schema, with what the script says laid over it. With no scripts
 * written, each channel the server sends over plays its messages once a few seconds apart, three times, and answers
 * what the app sends with the first message it sends back.
 *
 * On the wire, as the exported server sends them (docs/后端.md): a WebSocket frame is the message's JSON payload alone,
 * no envelope, and which message it is is read from which of the channel's messages the payload fits; server-sent
 * events carry the message's name as the event and its JSON payload as the data. Each message the mocks send carries
 * that `frame`, and `receive` takes a frame the app sent. */

import { isRecord } from "../api/schema";
import type { ApiChannel, ApiSpec } from "../api/types";
import { checkValue } from "./check";
import type { MockClock } from "./clock";
import type { MockData } from "./data";
import type { MockRealtimeScript, MockSpec } from "./types";

/** a message the server sent: which, what it carries, and its text on the wire (`frame`): the JSON payload alone over a
 *  WebSocket, `event: <name>` and `data: <JSON>` as server-sent events */
export type MockMessage = { channel: string; message: string; payload: unknown; at: number; transport: "websocket" | "sse"; frame: string };

export type MockConnection = {
  /** the channel it is connected to (its id), undefined when the address named none */
  readonly channel: string | undefined;
  /** how it goes over the wire */
  readonly transport: "websocket" | "sse";
  readonly open: boolean;
  /** the app sends a message (the channel's `receive` side), by its name */
  send(message: string, payload?: unknown): void;
  /** the app sends a frame as it goes over a WebSocket (the JSON payload alone): the message is the one it fits; the
   *  name of that message, or undefined when it fits none (or is no JSON) */
  receive(frame: string): string | undefined;
  close(): void;
};

/** a message's text on the wire */
export function frameOf(transport: "websocket" | "sse", message: string, payload: unknown): string {
  const json = JSON.stringify(payload ?? null);
  return transport === "sse" ? `event: ${message.replace(/[\r\n]/g, "")}\ndata: ${json}\n\n` : json;
}

/** the messages the app may send over a channel (its `receive` operations'), in order */
export function receivedMessages(c: ApiChannel): string[] {
  return [...new Set(c.operations.filter((o) => o.action === "receive").flatMap((o) => o.messages ?? c.messages.map((m) => m.name)))];
}

/** the scripts a channel plays when nobody wrote any */
export function defaultScripts(api: ApiSpec): MockRealtimeScript[] {
  const out: MockRealtimeScript[] = [];
  for (const c of api.channels ?? []) {
    const sends = c.operations.filter((o) => o.action === "send").flatMap((o) => o.messages ?? c.messages.map((m) => m.name));
    const receives = c.operations.filter((o) => o.action === "receive").flatMap((o) => o.messages ?? c.messages.map((m) => m.name));
    const pushed = [...new Set(sends)].filter((m) => c.messages.some((x) => x.name === m));
    if (pushed.length) out.push({ id: `${c.id}-feed`, channel: c.id, trigger: { on: "connect" }, steps: pushed.map((message, i) => ({ at: 1200 + i * 1500, message })), repeat: { every: 6000, times: 2 } });
    if (pushed.length && receives.length && c.transport !== "sse") out.push({ id: `${c.id}-reply`, channel: c.id, trigger: { on: "message", message: receives[0] }, steps: [{ at: 900, message: pushed[0] }] });
  }
  return out;
}

/** a channel's address as a pattern its URLs end with: /rooms/{roomId} → /rooms/[^/]+ (under any base: /realtime) */
export function channelPattern(c: ApiChannel): string {
  return `${c.address.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^{}]+\}/g, "[^/]+")}/?$`;
}

/** whether an address is a channel's: its id, or a URL or path ending in its address with each {parameter} filled in */
function channelFor(api: ApiSpec, address: string): ApiChannel | undefined {
  const channels = api.channels ?? [];
  const byId = channels.find((c) => c.id === address);
  if (byId) return byId;
  const clean = `/${address.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0].replace(/^\/+/, "")}`;
  /* the longest address that fits, so /rooms/{id}/typing is not taken for /typing */
  return channels
    .filter((c) => c.address && new RegExp(`(?:^|/)${channelPattern(c).replace(/^\\?\//, "")}`).test(clean))
    .sort((a, b) => b.address.length - a.address.length)[0];
}

type Live = { channel: ApiChannel; onMessage: (m: MockMessage) => void; timers: Set<() => void>; open: boolean; plays: number };

export class Realtime {
  private readonly api: ApiSpec;
  private readonly spec: MockSpec;
  private readonly clock: MockClock;
  private readonly data: () => MockData;
  private readonly live = new Set<Live>();

  constructor(o: { api: ApiSpec; spec: MockSpec; clock: MockClock; data: () => MockData }) {
    this.api = o.api;
    this.spec = o.spec;
    this.clock = o.clock;
    this.data = o.data;
  }

  private scripts(channel: string): MockRealtimeScript[] {
    return (this.spec.realtime ?? defaultScripts(this.api)).filter((s) => s.channel === channel);
  }

  connect(address: string, onMessage: (m: MockMessage) => void): MockConnection {
    const channel = channelFor(this.api, address);
    const live: Live | undefined = channel ? { channel, onMessage, timers: new Set(), open: true, plays: 0 } : undefined;
    if (live) {
      this.live.add(live);
      for (const s of this.scripts(channel!.id)) if ((s.trigger ?? { on: "connect" }).on === "connect") this.play(live, s);
    }
    let open = true;
    const sent = (message: string) => {
      if (!live?.open) return;
      for (const s of this.scripts(live.channel.id)) if (s.trigger?.on === "message" && s.trigger.message === message) this.play(live, s);
    };
    return {
      channel: channel?.id,
      transport: channel?.transport === "sse" ? "sse" : "websocket",
      get open() {
        return open && (!live || live.open);
      },
      send: (message: string) => sent(message),
      receive: (frame: string) => {
        if (!live?.open) return undefined;
        let payload: unknown;
        try {
          payload = JSON.parse(frame);
        } catch {
          return undefined;
        }
        /* which message it is: the first of those the app may send whose payload schema it fits */
        const c = live.channel;
        const name = receivedMessages(c).find((m) => {
          const schema = c.messages.find((x) => x.name === m)?.payload;
          return schema === undefined || checkValue(this.api, schema, payload, { locale: "en", direction: "request" }).length === 0;
        });
        if (name) sent(name);
        return name;
      },
      close: () => {
        open = false;
        if (live) this.stop(live);
      },
    };
  }

  /** an operation was called: the scripts it starts play on every open connection of their channel */
  called(operationId: string) {
    for (const live of this.live) for (const s of this.scripts(live.channel.id)) if (s.trigger?.on === "call" && s.trigger.operationId === operationId) this.play(live, s);
  }

  closeAll() {
    /* a set may lose what it has walked past */
    for (const live of this.live) this.stop(live);
  }

  private stop(live: Live) {
    live.open = false;
    for (const cancel of live.timers) cancel();
    live.timers.clear();
    this.live.delete(live);
  }

  private play(live: Live, script: MockRealtimeScript, round = 0) {
    const play = live.plays++;
    const steps = [...script.steps].sort((a, b) => a.at - b.at).slice(0, 200);
    for (const [i, step] of steps.entries()) {
      const cancel = this.clock.setTimer(() => {
        live.timers.delete(cancel);
        if (!live.open) return;
        const message = live.channel.messages.find((m) => m.name === step.message);
        const made = message?.payload !== undefined ? this.data().value(message.payload, `rt:${script.id}:${play}:${i}`, { name: message.name }) : undefined;
        const payload = isRecord(made) && isRecord(step.payload) ? { ...made, ...step.payload } : step.payload !== undefined ? step.payload : made;
        const transport = live.channel.transport === "sse" ? "sse" : "websocket";
        try {
          live.onMessage({ channel: live.channel.id, message: step.message, payload, at: this.clock.now(), transport, frame: frameOf(transport, step.message, payload) });
        } catch {
          /* a listener's mistake is its own */
        }
      }, Math.max(0, step.at));
      live.timers.add(cancel);
    }
    const r = script.repeat;
    if (r && r.every > 0 && (r.times === undefined || round < r.times)) {
      const last = steps.length ? steps[steps.length - 1].at : 0;
      const cancel = this.clock.setTimer(() => {
        live.timers.delete(cancel);
        if (live.open) this.play(live, script, round + 1);
      }, Math.max(last, 0) + Math.max(100, r.every));
      live.timers.add(cancel);
    }
  }
}
