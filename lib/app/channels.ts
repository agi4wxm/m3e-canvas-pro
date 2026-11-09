/* The subscriptions of an exported app to the contract's realtime channels (AsyncAPI), next to its data sources: each
 * opened by a screen as it comes on show and closed as it goes, over the transport's `connect` (the mocks' realtime
 * scripts in the preview and in a development build, the product's sockets in production). What a subscription keeps is
 * a store of plain states (lib/bindings/channels.ts makes them, as the preview does); each message is handed on to what
 * the screen runs on it.
 *
 * The rules of late answers hold for messages too (docs/交互规则.md “迟到的回答”, “订阅”): a message on a subscription
 * that has been closed (its screen gone, its parameters changed: a newer one speaks for it) does nothing; after the
 * runtime starts over (another back end, a new mock session) every subscription is closed and its messages forgotten,
 * and the screens on show open theirs again on the new session. */

import type { ChannelConnection, ChannelMessage, Transport } from "../api/transport";
import { addressOf, addressParams, idleChannel, keepOf, received, type ChannelEntry, type ChannelState } from "../bindings/channels";
import type { Bindings } from "./scope";
import { Store } from "./store";

/** A screen's subscription as the design has it (`Frame.subscriptions`) and a printed screen holds it: the channel and
 *  its address as the contract writes it (`/rooms/{roomId}`), the address's params as expressions, what it keeps. */
export type ChannelDef = {
  name: string;
  channel: string;
  address: string;
  /** each param of the address by name, an expression; one left out reads the screen's param of that name */
  params?: Readonly<Record<string, string>>;
  messages?: readonly string[];
  keep?: number;
  newest?: boolean;
};

/** A subscription as it is asked for now: its address filled in from the screen's scope (each param a word, a number
 *  or yes/no; anything else leaves it empty), keyed by the channel and that address. */
export function channelSpecFor(def: ChannelDef, $: Bindings): ChannelSpec {
  const given: Record<string, unknown> = {};
  for (const name of addressParams(def.address)) given[name] = $.arg(def.params?.[name] ?? `params.${name}`);
  const address = addressOf(def.address, given);
  return { key: `${def.channel}:${address}`, channel: def.channel, address, ...(def.messages?.length ? { messages: def.messages } : {}), keep: keepOf(def.keep) };
}

/** One subscription as a screen asks for it. */
export type ChannelSpec = {
  /** what it is asked with: the channel and its address filled in (a change opens it again, afresh) */
  key: string;
  /** the channel's id in the contract */
  channel: string;
  /** its address with its parameters filled in (`/rooms/r1`): what the transport connects to */
  address: string;
  /** the messages it keeps (the server's, by name); every one when left out */
  messages?: readonly string[];
  /** how many it keeps, the newest (lib/bindings/channels.ts `keepOf`) */
  keep: number;
};

type Open = { spec: ChannelSpec; connection?: ChannelConnection; live: boolean };

export class ChannelHub {
  /** every open subscription's state, by the id `open` gave it */
  readonly store = new Store<Readonly<Record<string, ChannelState>>>({});
  private readonly open = new Map<string, Open>();
  private n = 0;
  /** how many times it was cleared: a message to a subscription opened before then lands nowhere */
  private epoch = 0;

  constructor(private readonly o: { transport: () => Transport; now: () => number; token?: () => string | undefined }) {}

  state(id: string | undefined): ChannelState | undefined {
    return id === undefined ? undefined : this.store.get()[id];
  }

  private put(id: string, fn: (s: ChannelState) => ChannelState) {
    if (!this.open.get(id)?.live) return;
    this.store.set((all) => ({ ...all, [id]: fn(all[id] ?? idleChannel()) }));
  }

  /** Opens a subscription: its messages are kept (the newest `keep`) and each handed to `onMessage`. What it gives back
   *  is its id (what its state is kept under) and its end. With no realtime on the transport it reads as closed. */
  subscribe(spec: ChannelSpec, onMessage?: (m: ChannelEntry & { channel: string }) => void): { id: string; close: () => void } {
    const id = `c${++this.n}`;
    const epoch = this.epoch;
    const entry: Open = { spec, live: true };
    this.open.set(id, entry);
    this.store.set((all) => ({ ...all, [id]: idleChannel() }));
    const t = this.o.transport();
    const wanted = spec.messages?.length ? new Set(spec.messages) : undefined;
    const current = () => entry.live && epoch === this.epoch;
    const hear = (m: ChannelMessage) => {
      if (!current() || (wanted && !wanted.has(m.message))) return;
      const kept: ChannelEntry = { message: m.message, payload: m.payload, at: typeof m.at === "number" && Number.isFinite(m.at) ? m.at : this.o.now() };
      this.put(id, (s) => received(s, kept, spec.keep));
      try {
        onMessage?.({ ...kept, channel: m.channel || spec.channel });
      } catch {
        /* what the screen runs on a message is its own; the subscription goes on */
      }
    };
    if (typeof t.connect !== "function") this.put(id, (s) => ({ ...s, status: "closed" }));
    else {
      try {
        const token = this.o.token?.();
        entry.connection = t.connect(spec.address, hear, { onStatus: (st) => current() && this.put(id, (s) => ({ ...s, status: st })), ...(token ? { token } : {}) });
        /* a transport that says nothing of its status (the mocks') is open as soon as it is connected */
        if (current()) this.put(id, (s) => (s.status === "connecting" ? { ...s, status: "open" } : s));
      } catch {
        this.put(id, (s) => ({ ...s, status: "closed" }));
      }
    }
    return { id, close: () => this.close(id) };
  }

  private close(id: string) {
    const entry = this.open.get(id);
    if (!entry) return;
    entry.live = false;
    this.open.delete(id);
    try {
      entry.connection?.close();
    } catch {
      /* a connection that will not close is closed as far as the app goes */
    }
    this.store.set((all) => {
      const { [id]: _gone, ...rest } = all;
      return rest;
    });
  }

  /** closes every subscription and forgets what they kept: a message to any of them lands nowhere */
  clear() {
    this.epoch++;
    for (const id of this.open.keys()) this.close(id);
    this.store.set({});
  }
}
