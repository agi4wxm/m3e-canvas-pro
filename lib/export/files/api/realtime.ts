//! Copied as it is (lib/export/copy.ts) into packages/api/src/realtime.ts of every product (lib/export/targets/api.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
/* The realtime channels of the contract (AsyncAPI) over the wire the exported server speaks (docs/后端.md 实时通道): a
 * WebSocket whose every frame is one message's JSON payload, no envelope, which message it is read from which of the
 * channel's messages it fits; or server-sent events whose event is the message's name and whose data is its JSON
 * payload. The session's token rides as `access_token` in the address. This is what a transport's `connect` is in
 * production; in development the mocks answer the same channels (their realtime scripts). No DOM types: the socket is
 * the platform's (`WebSocket`, `EventSource` where there are such, a mini-program's socket handed in as `open`). */

import type { ChannelConnection, ChannelMessage, ChannelStatus, Transport } from "./transport"

/** a channel of the contract as the client needs it: its address, how it goes over the wire, and what tells its
 *  messages apart (the fields each one's payload must have, and those fixed to one value) */
export type RealtimeChannel = {
  id: string
  address: string
  transport?: "websocket" | "sse"
  messages: { name: string; required?: readonly string[]; fixed?: Readonly<Record<string, unknown>> }[]
}

/** a socket, the little the client uses of one: what the platform's WebSocket or a mini-program's socket task does */
export type SocketLike = {
  send(text: string): void
  close(): void
  onOpen(fn: () => void): void
  onText(fn: (text: string) => void): void
  onClose(fn: () => void): void
}

type Events = { addEventListener(name: string, fn: (e: { data?: unknown }) => void): void; close(): void; onopen: unknown; onerror: unknown }
type Platform = { WebSocket?: new (url: string) => { send(t: string): void; close(): void; onopen: unknown; onmessage: unknown; onclose: unknown; onerror: unknown }; EventSource?: new (url: string) => Events }

/** the platform's WebSocket as a `SocketLike`, where it has one */
export function webSocket(url: string): SocketLike | undefined {
  const Ctor = (globalThis as Platform).WebSocket
  if (!Ctor) return undefined
  const ws = new Ctor(url)
  return {
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onOpen: (fn) => void (ws.onopen = () => fn()),
    onText: (fn) => void (ws.onmessage = (e: { data?: unknown }) => typeof e.data === "string" && fn(e.data)),
    onClose: (fn) => {
      ws.onclose = () => fn()
      ws.onerror = () => fn()
    },
  }
}

/** an address as a pattern URLs end with: /rooms/{roomId} → /rooms/[^/]+ */
const patternOf = (address: string) => new RegExp(`${address.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^{}]+\}/g, "[^/]+")}/?$`)

/** the channel an address is: its id, or the longest address it ends with */
function channelOf(channels: readonly RealtimeChannel[], address: string): RealtimeChannel | undefined {
  const byId = channels.find((c) => c.id === address)
  if (byId) return byId
  const path = address.split(/[?#]/)[0]
  return channels.filter((c) => c.address && patternOf(c.address).test(path)).sort((a, b) => b.address.length - a.address.length)[0]
}

/** which of a channel's messages a payload is: the first whose required fields it has and whose fixed ones it matches */
export function messageOf(c: RealtimeChannel, payload: unknown): string | undefined {
  const o = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : undefined
  return c.messages.find((m) => {
    if (!m.required?.length && !m.fixed) return true
    if (!o) return false
    return (m.required ?? []).every((k) => k in o) && Object.entries(m.fixed ?? {}).every(([k, v]) => JSON.stringify(o[k]) === JSON.stringify(v))
  })?.name
}

/** Adds the contract's realtime channels to a transport: `url` is where they are (`wss://rt.example.com/realtime`),
 *  `open` the platform's socket (the WebSocket by default). A message that is no JSON, or fits none of the channel's,
 *  is let go. */
export function withRealtime(inner: Transport, o: { url: string; channels: readonly RealtimeChannel[]; open?: (url: string) => SocketLike | undefined }): Transport {
  const base = o.url.replace(/\/$/, "")
  const connect = (address: string, onMessage: (m: ChannelMessage) => void, opts: { onStatus?: (s: ChannelStatus) => void; token?: string } = {}): ChannelConnection => {
    const c = channelOf(o.channels, address)
    const path = c && c.id === address ? c.address : address
    const url = `${base}${path}${opts.token ? `${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(opts.token)}` : ""}`
    const now = () => (inner.now ? inner.now() : Date.now())
    const hear = (message: string | undefined, text: string) => {
      if (!c || !message) return
      try {
        onMessage({ channel: c.id, message, payload: JSON.parse(text), at: now() })
      } catch {
        /* no JSON: not a message of the contract's */
      }
    }
    if (c?.transport === "sse") {
      const Ctor = (globalThis as Platform).EventSource
      if (!Ctor) {
        opts.onStatus?.("closed")
        return { send: () => {}, close: () => {} }
      }
      const es = new Ctor(url)
      es.onopen = () => opts.onStatus?.("open")
      es.onerror = () => opts.onStatus?.("closed")
      for (const m of c.messages) es.addEventListener(m.name, (e) => typeof e.data === "string" && hear(m.name, e.data))
      return { send: () => {}, close: () => es.close() }
    }
    const socket = (o.open ?? webSocket)(url)
    if (!socket) {
      opts.onStatus?.("closed")
      return { send: () => {}, close: () => {} }
    }
    socket.onOpen(() => opts.onStatus?.("open"))
    socket.onClose(() => opts.onStatus?.("closed"))
    socket.onText((text) => {
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        return
      }
      if (c) hear(messageOf(c, payload), text)
    })
    return { send: (_message, payload) => socket.send(JSON.stringify(payload ?? null)), close: () => socket.close() }
  }
  return { ...inner, request: (r) => inner.request(r), connect, ...(inner.now ? { now: () => inner.now!() } : {}) }
}
