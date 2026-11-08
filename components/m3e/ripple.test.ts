import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

/* The ripple's bookkeeping, on stand-ins for the elements (the tests run without a DOM): its delayed steps end with it,
 * the document hears a release only while a press is down, and under reduced motion a press is a still layer. The
 * real browser: e2e/motion.e2e.ts. */

type Listener = (e: Record<string, unknown>) => void
/** a stand-in for an element or the document: its listeners, attributes and style */
function node(rect = { width: 100, height: 40, left: 0, top: 0 }) {
  const listeners = new Map<string, Set<Listener>>()
  const attrs = new Map<string, string>()
  const style: Record<string, string> & { removeProperty(k: string): void } = {
    removeProperty(k: string) {
      delete style[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())]
    },
  } as never
  const animations: { cancelled: boolean }[] = []
  return {
    listeners,
    animations,
    style,
    addEventListener: (type: string, fn: Listener) => void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type: string, fn: Listener) => void listeners.get(type)?.delete(fn),
    fire: (type: string, e: Record<string, unknown> = {}) => [...(listeners.get(type) ?? [])].forEach((fn) => fn(e)),
    count: (type: string) => listeners.get(type)?.size ?? 0,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    hasAttribute: (k: string) => attrs.has(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    matches: () => false,
    getBoundingClientRect: () => rect,
    animate: () => {
      const a = { cancelled: false, currentTime: 0, cancel: () => void (a.cancelled = true) }
      animations.push(a)
      return a
    },
  }
}

let reduced = false
const win = node()
const doc = node()
let trackRipple: typeof import("./ripple").trackRipple
let trackPress: typeof import("./ripple").trackPress

beforeAll(async () => {
  vi.useFakeTimers()
  Object.assign(win, {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    matchMedia: () => ({
      get matches() {
        return reduced
      },
      addEventListener() {},
      removeEventListener() {},
    }),
  })
  vi.stubGlobal("window", win)
  vi.stubGlobal("document", doc)
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  ;({ trackRipple, trackPress } = await import("./ripple"))
})
afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
afterEach(() => {
  reduced = false
})

const pointer = { isPrimary: true, button: 0, pointerType: "mouse", clientX: 10, clientY: 10 }
const setUp = () => {
  const target = node()
  const host = node()
  const press = node()
  const stop = trackRipple(target as never, host as never, press as never)
  return { target, press, stop }
}

describe("the ripple", () => {
  it("grows on a press and lets go after its minimum time", () => {
    const { target, press, stop } = setUp()
    target.fire("pointerdown", pointer)
    expect(press.animations).toHaveLength(1)
    expect(press.hasAttribute("data-pressed")).toBe(true)
    win.fire("pointerup")
    expect(press.hasAttribute("data-pressed")).toBe(true)
    vi.advanceTimersByTime(300)
    expect(press.hasAttribute("data-pressed")).toBe(false)
    stop()
  })

  it("leaves the ripple alone once it has gone: the release still to come is dropped with it", () => {
    const { target, press, stop } = setUp()
    target.fire("pointerdown", pointer)
    win.fire("pointerup")
    stop()
    vi.advanceTimersByTime(1000)
    expect(press.hasAttribute("data-pressed")).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(press.animations[0].cancelled).toBe(true)
  })

  it("is a still layer over the whole control under reduced motion, asked at each press", () => {
    const { target, press, stop } = setUp()
    reduced = true
    target.fire("pointerdown", pointer)
    expect(press.animations).toHaveLength(0)
    expect(press.hasAttribute("data-pressed")).toBe(true)
    /* centred, and wide enough that the soft edge clears the corners of a 100 x 40 control */
    const size = Number.parseFloat(press.style.width)
    expect(size).toBeGreaterThan(Math.hypot(100, 40) + 2 * 70)
    expect(press.style.transform).toBe(`translate(${(100 - size) / 2}px, ${(40 - size) / 2}px)`)
    win.fire("pointerup")
    vi.advanceTimersByTime(300)
    expect(press.hasAttribute("data-pressed")).toBe(false)
    /* the setting changed back while the page is open: the next press grows again */
    reduced = false
    target.fire("pointerdown", pointer)
    expect(press.animations).toHaveLength(1)
    expect(press.style.transform).toBeUndefined()
    win.fire("pointerup")
    stop()
  })
})

describe("the pressed state", () => {
  it("has the document hear a release only while a press is down, and its delayed release ends with it", () => {
    const target = node()
    const stop = trackPress(target as never)
    expect(doc.count("pointerup")).toBe(0)
    target.fire("pointerdown", pointer)
    expect(target.hasAttribute("data-press")).toBe(true)
    expect(doc.count("pointerup")).toBe(1)
    expect(doc.count("pointercancel")).toBe(1)
    doc.fire("pointerup")
    expect(doc.count("pointerup")).toBe(0)
    expect(doc.count("pointercancel")).toBe(0)
    vi.advanceTimersByTime(300)
    expect(target.hasAttribute("data-press")).toBe(false)
    /* a press the control is taken away during */
    target.fire("pointerdown", pointer)
    stop()
    expect(doc.count("pointerup")).toBe(0)
    expect(target.hasAttribute("data-press")).toBe(false)
  })
})
