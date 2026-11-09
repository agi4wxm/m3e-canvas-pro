/* What a screen's subscription to a realtime channel holds and what `data.<name>` reads of it, as plain functions over
 * plain data (docs/数据绑定.md “订阅”): the messages kept so far (the newest `keep`), the latest of them, whether the
 * channel is open. The preview's engine and the exported apps' runtime (packages/app-runtime copies this file) both go
 * by these, so a list of messages grows and is cut the same way in both. No imports: the mini-program runs it too. */

/** how many messages a subscription keeps when the design says nothing, and the most it may keep */
export const KEEP_DEFAULT = 50;
export const KEEP_MAX = 500;

/** whether the channel is connecting, open, or closed (by the other side, or never opened: a transport with no realtime) */
export type ChannelStatus = "connecting" | "open" | "closed";

/** one message a subscription kept: its name, what it carries, when it was sent (ms on the back end's clock) */
export type ChannelEntry = { message: string; payload: unknown; at: number };

/** one subscription, as far as it has got */
export type ChannelState = { status: ChannelStatus; messages: ChannelEntry[] };

export const idleChannel = (): ChannelState => ({ status: "connecting", messages: [] });

/** a message kept, as `data.<name>.messages` and an action's `event` read it: its time as an ISO string, like `now` */
export type ChannelEvent = { channel: string; message: string; payload: unknown; at: string };

/** What `data.<name>` reads of a subscription: `value` the latest message's payload, `items` every payload kept (oldest
 *  first, or the newest first when the design says), `messages` the same with their names and times, `latest` the
 *  newest of those, `count`, `empty`, `status` and `open`. */
export type ChannelView = {
  status: ChannelStatus;
  open: boolean;
  value: unknown;
  items: unknown[];
  messages: { message: string; payload: unknown; at: string }[];
  latest: { message: string; payload: unknown; at: string } | null;
  count: number;
  empty: boolean;
};

/** a time in ms as an expression reads it, like `now`; nothing when it is none */
export const isoOf = (ms: number): string => (Number.isFinite(ms) ? new Date(ms).toISOString() : "");

/** how many messages a subscription keeps: the design's word, kept within 1 and `KEEP_MAX` */
export const keepOf = (keep: unknown): number => (typeof keep === "number" && Number.isFinite(keep) ? Math.min(KEEP_MAX, Math.max(1, Math.floor(keep))) : KEEP_DEFAULT);

/** A message arrives: kept at the end, the oldest let go past `keep`. */
export function received(s: ChannelState, entry: ChannelEntry, keep: number): ChannelState {
  const messages = [...s.messages, entry];
  return { status: "open", messages: messages.length > keep ? messages.slice(messages.length - keep) : messages };
}

/** what `data.<name>` reads (see `ChannelView`) */
export function channelView(s: ChannelState | undefined, o: { newest?: boolean } = {}): ChannelView {
  const kept = (s?.messages ?? []).map((m) => ({ message: m.message, payload: m.payload, at: isoOf(m.at) }));
  const ordered = o.newest ? [...kept].reverse() : kept;
  const latest = kept.length ? kept[kept.length - 1] : null;
  const status = s?.status ?? "connecting";
  return { status, open: status === "open", value: latest?.payload, items: ordered.map((m) => m.payload), messages: ordered, latest, count: kept.length, empty: !kept.length };
}

/** A channel's address with its parameters filled in (`/rooms/{roomId}` → `/rooms/r1`), each as one segment; one that
 *  is not given is left empty. */
export function addressOf(address: string, params: Readonly<Record<string, unknown>>): string {
  return address.replace(/\{([^{}]+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? "" : encodeURIComponent(String(v));
  });
}

/** the names of an address's parameters, in order */
export const addressParams = (address: string): string[] => [...address.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);

/** The key of an action on a subscription's messages (`Subscription.actions`): `on:<message>` for one message, else
 *  `on:message` for any; the one that runs for a message, when there is one. */
export function messageAction<T>(actions: Readonly<Record<string, T>> | undefined, message: string): T | undefined {
  if (!actions) return undefined;
  const own = Object.prototype.hasOwnProperty.call(actions, `on:${message}`) ? actions[`on:${message}`] : undefined;
  return own ?? (Object.prototype.hasOwnProperty.call(actions, "on:message") ? actions["on:message"] : undefined);
}
