/* The frame loop: what every host runs a screen's bindings per frame on (lib/bindings/frame.ts, docs/数据绑定.md “每帧
 * 绑定”). Each frame it reads the world the HUD reads once (lib/world/root.ts `readWorld`: a world view's world, as
 * `connectWorld` attached it to the views' channels), evaluates every binding per frame of the screens on show over it,
 * and hands each value that changed to whoever writes it into the drawing (`listen`): the preview and the web app a DOM
 * writer (lib/world/frameTargets.ts), the phone app an animated value, the mini-program its page's node. Nothing here
 * is React: a frame commits nothing, renders nothing. The platform hands in how to wait for the next frame (the web's
 * and React Native's `requestAnimationFrame`, Taro's), so the same loop runs everywhere, and `tick` runs one frame by
 * hand (the consistency table, a test). The loop runs only while some binding is there to evaluate. Plain TypeScript,
 * copied into an exported app's runtime. */

import { evaluate, type Expr } from "../bindings/expr";
import { compileFrame, FRAME_LIMITS, type FrameBinding } from "../bindings/frame";
import type { FormatContext } from "../bindings/format";
import { frameValueOf, type FrameKind, type FrameTarget } from "../world/frameTargets";
import { readWorld, type WorldSource } from "../world/root";

/** a binding per frame as a host hands it to the loop: the part, the prop, the expression, and the kind of value the
 *  prop takes (lib/world/frameTargets.ts) */
export type FrameSpec = FrameBinding & Pick<FrameTarget, "kind" | "min" | "max">;

export type FrameLoopOptions = {
  /** the world the HUD reads now: the first one connected to a view, or none */
  world: () => WorldSource | undefined;
  /** waits for the next frame and runs `fn` then; gives back what `cancel` takes. Left out, the loop runs only by `tick`. */
  schedule?: (fn: () => void) => unknown;
  cancel?: (handle: unknown) => void;
  /** how words are written (the app's language) */
  context?: () => FormatContext;
};

type Sink = { write: (v: string | number) => void; every: boolean };
type Slot = { spec: FrameSpec; expr: Expr | null; value: string | number | undefined; has: boolean; sinks: Set<Sink> };

export type FrameLoop = {
  /** Adds the bindings of a screen on show; gives back how to take them away again (the screen went). A binding of a
   *  part and prop already there takes its place. */
  add(specs: readonly FrameSpec[]): () => void;
  /** Hears each new value of a part's prop bound per frame (and the one it has now, at once); gives back how to stop.
   *  `every`: hears the value on every frame, changed or not (a writer that checks what is drawn, which a render may
   *  have put back). */
  listen(part: string, prop: string, sink: (v: string | number) => void, every?: boolean): () => void;
  /** the value a part's prop came to on the last frame, undefined before the world gave one */
  value(part: string, prop: string): string | number | undefined;
  /** the words of every binding of words on show, as the last frame wrote them (what a test reads) */
  words(): string[];
  /** one frame, now */
  tick(): void;
  /** how many frames have run (a test, the editor's benchmark) */
  frames(): number;
  /** stops the loop and forgets every binding */
  dispose(): void;
};

const keyOf = (part: string, prop: string) => `${part}\u0000${prop}`;

export function createFrameLoop(o: FrameLoopOptions): FrameLoop {
  const slots = new Map<string, Slot>();
  /* the bindings each screen added, so a screen that goes takes only its own */
  const owners = new Map<string, number>();
  let handle: unknown;
  let waiting = false;
  let count = 0;
  let disposed = false;

  const slotOf = (part: string, prop: string, spec?: FrameSpec): Slot => {
    const k = keyOf(part, prop);
    let s = slots.get(k);
    if (!s) {
      s = { spec: spec ?? { part, prop, expr: "", kind: "text" }, expr: spec ? compileFrame(spec.expr) : null, value: undefined, has: false, sinks: new Set() };
      slots.set(k, s);
    } else if (spec && (spec.expr !== s.spec.expr || spec.kind !== s.spec.kind || spec.min !== s.spec.min || spec.max !== s.spec.max)) {
      s.spec = spec;
      s.expr = compileFrame(spec.expr);
      s.has = false;
    }
    return s;
  };

  const live = () => [...slots.values()].filter((s) => s.expr !== null);

  const tick = () => {
    count++;
    const world = readWorld(o.world());
    /* no world to read: what is drawn stays the design's */
    if (!world) return;
    const ctx = o.context?.() ?? { lang: "en" };
    let budget = FRAME_LIMITS.perScreen;
    for (const s of live()) {
      if (budget-- <= 0) break;
      const v = frameValueOf(evaluate(s.expr!, { world }, ctx), s.spec);
      if (v === undefined) continue;
      const changed = !s.has || s.value !== v;
      s.value = v;
      s.has = true;
      for (const sink of [...s.sinks]) if (changed || sink.every) sink.write(v);
    }
  };

  const loop = () => {
    waiting = false;
    if (disposed) return;
    tick();
    wake();
  };
  /* waits for the next frame while there is a binding to evaluate */
  const wake = () => {
    if (waiting || disposed || !o.schedule || !live().length) return;
    waiting = true;
    handle = o.schedule(loop);
  };

  return {
    add(specs) {
      const mine: string[] = [];
      for (const spec of specs) {
        const k = keyOf(spec.part, spec.prop);
        slotOf(spec.part, spec.prop, spec);
        owners.set(k, (owners.get(k) ?? 0) + 1);
        mine.push(k);
      }
      wake();
      return () => {
        for (const k of mine) {
          const n = (owners.get(k) ?? 1) - 1;
          if (n > 0) {
            owners.set(k, n);
            continue;
          }
          owners.delete(k);
          const s = slots.get(k);
          /* a writer still listening keeps its slot (and the last value), not its binding */
          if (s && s.sinks.size) {
            s.expr = null;
            s.spec = { ...s.spec, expr: "" };
          } else slots.delete(k);
        }
      };
    },
    listen(part, prop, write, every = false) {
      const s = slotOf(part, prop);
      const sink: Sink = { write, every };
      s.sinks.add(sink);
      if (s.has && s.value !== undefined) write(s.value);
      return () => {
        s.sinks.delete(sink);
        if (!s.sinks.size && s.expr === null && !owners.has(keyOf(part, prop))) slots.delete(keyOf(part, prop));
      };
    },
    value: (part, prop) => slots.get(keyOf(part, prop))?.value,
    words: () => live().flatMap((s) => (s.has && s.spec.kind === ("text" satisfies FrameKind) ? [String(s.value)] : [])),
    tick,
    frames: () => count,
    dispose() {
      disposed = true;
      if (waiting && o.cancel) o.cancel(handle);
      waiting = false;
      slots.clear();
      owners.clear();
    },
  };
}
