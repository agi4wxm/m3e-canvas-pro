//! Not copied: the editor's test of packages/api's realtime client (./realtime.ts).
import { afterEach, describe, expect, it } from "vitest"
import { messageOf, withRealtime, type RealtimeChannel, type SocketLike } from "./realtime"
import type { ChannelMessage, Transport } from "./transport"

const CHANNELS: RealtimeChannel[] = [
  { id: "room", address: "/rooms/{roomId}", messages: [{ name: "said", required: ["text"] }, { name: "typing", fixed: { kind: "typing" } }] },
  { id: "feed", address: "/feed", transport: "sse", messages: [{ name: "post" }] },
]
const inner: Transport = { request: async () => ({ status: 204, headers: {}, body: undefined }), now: () => 42 }

/** a socket the test speaks for: what was opened, sent and closed */
function sockets() {
  const made: { url: string; sent: string[]; closed: boolean; open: () => void; text: (t: string) => void; close: () => void }[] = []
  const open = (url: string): SocketLike => {
    const s = { url, sent: [] as string[], closed: false, open: () => {}, text: (_t: string) => {}, close: () => {} }
    made.push(s)
    return { send: (t) => void s.sent.push(t), close: () => void (s.closed = true), onOpen: (fn) => void (s.open = fn), onText: (fn) => void (s.text = fn), onClose: (fn) => void (s.close = fn) }
  }
  return { made, open }
}

afterEach(() => {
  delete (globalThis as { EventSource?: unknown }).EventSource
})

describe("packages/api's realtime client", () => {
  it("tells a frame's message by what its payload has, as the server's frames carry no name", () => {
    expect(messageOf(CHANNELS[0], { text: "hi" })).toBe("said")
    expect(messageOf(CHANNELS[0], { kind: "typing" })).toBe("typing")
    expect(messageOf(CHANNELS[0], { other: 1 })).toBeUndefined()
  })

  it("connects a WebSocket to the channel's address under the realtime URL, the token in it, and hands on its messages", () => {
    const s = sockets()
    const t = withRealtime(inner, { url: "wss://rt.example.com/realtime/", channels: CHANNELS, open: s.open })
    const got: ChannelMessage[] = []
    const statuses: string[] = []
    const c = t.connect!("/rooms/r1", (m) => got.push(m), { onStatus: (st) => statuses.push(st), token: "a b" })
    expect(s.made[0].url).toBe("wss://rt.example.com/realtime/rooms/r1?access_token=a%20b")
    s.made[0].open()
    s.made[0].text(JSON.stringify({ text: "hello" }))
    s.made[0].text("not json")
    s.made[0].text(JSON.stringify({ nothing: true }))
    expect(got).toEqual([{ channel: "room", message: "said", payload: { text: "hello" }, at: 42 }])
    c.send("ack", { id: 1 })
    expect(s.made[0].sent).toEqual(['{"id":1}'])
    s.made[0].close()
    c.close()
    expect(s.made[0].closed).toBe(true)
    expect(statuses).toEqual(["open", "closed"])
    /* the requests and the clock are the transport's own */
    expect(t.now?.()).toBe(42)
  })

  it("listens to server-sent events by the messages' names", () => {
    const listeners: Record<string, (e: { data?: unknown }) => void> = {}
    let url = ""
    ;(globalThis as { EventSource?: unknown }).EventSource = class {
      onopen: unknown
      onerror: unknown
      constructor(u: string) {
        url = u
      }
      addEventListener(name: string, fn: (e: { data?: unknown }) => void) {
        listeners[name] = fn
      }
      close() {}
    }
    const t = withRealtime(inner, { url: "https://api.example.com/realtime", channels: CHANNELS })
    const got: ChannelMessage[] = []
    t.connect!("feed", (m) => got.push(m))
    expect(url).toBe("https://api.example.com/realtime/feed")
    listeners.post({ data: JSON.stringify({ n: 1 }) })
    expect(got).toEqual([{ channel: "feed", message: "post", payload: { n: 1 }, at: 42 }])
  })

  it("is closed where the platform has no socket", () => {
    const t = withRealtime(inner, { url: "wss://x", channels: CHANNELS, open: () => undefined })
    const statuses: string[] = []
    t.connect!("/rooms/1", () => {}, { onStatus: (st) => statuses.push(st) })
    expect(statuses).toEqual(["closed"])
  })
})
