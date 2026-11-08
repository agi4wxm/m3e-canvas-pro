/* Finger-tracked swipes between screens: only the swipes the author set on a screen (`Frame.swipe`), nothing inferred.
 * The screen being pulled in (the peek) follows the finger; let go past a quarter of the way, or quickly enough, and
 * it is the screen on show. A press that turned into a swipe is no tap (`swiped`). */

import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { SLIDE_SPEC, SWIPE_DIRS, frameSizeOf, type Frame, type SwipeDir, type Transition } from "@/lib/tokens";
import { EASE } from "@/lib/screenMotion";

/** the screen being pulled in by a swipe, and the slide it arrives with */
export type Peek = { frameId: string; t: Transition };

const pct = (v: number) => `${v * 100}%`;

type Gesture = {
  id: number;
  x0: number;
  y0: number;
  phase: "idle" | "drag" | "none";
  dir?: SwipeDir;
  size: number;
  last: number;
  lastT: number;
  vel: number;
  /** a finger or pen landed on a body that scrolls: a drag up or down there is the scroll */
  body: boolean;
};

export function useSwipe(o: {
  frames: Frame[];
  /** the sibling of a screen at the width chosen */
  shownId: (id: string) => string;
  /** the id of the screen on show, as navigation names it */
  onShow: () => string | undefined;
  scale: number;
  /** how far along the swipe is, 0 to 1: the shell steers its size by it too */
  prog: MotionValue<number>;
  /** the swipe was let go far enough: the screen pulled in is the one on show */
  onCommit: (peek: Peek) => void;
}) {
  const { frames, shownId, scale, prog } = o;
  const [peek, setPeekNow] = useState<Peek | null>(null);
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const swiped = useRef(false);
  const live = useRef(o);
  live.current = o;
  const axisMV = useMotionValue(0); // 0 = x, 1 = y
  const enterMV = useMotionValue(0);
  const exitMV = useMotionValue(0);
  const curX = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 0 ? pct(ex * p) : "0%"));
  const curY = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 1 ? pct(ex * p) : "0%"));
  const curOp = useTransform(prog, (p: number) => 1 - 0.4 * p);
  const peekX = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 0 ? pct(en * (1 - p)) : "0%"));
  const peekY = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 1 ? pct(en * (1 - p)) : "0%"));
  const gesture = useRef<Gesture | null>(null);

  const onPointerDown = (e: React.PointerEvent, frameW: number) => {
    if (peekRef.current || e.button !== 0) return;
    /* a split view's divider is dragged, not swiped: the library takes the press (and marks it) where it lands near one */
    const at = e.target as Element;
    if (at.closest?.('[role="separator"]') || (e.nativeEvent.defaultPrevented && at.closest?.('[data-slot="resizable-panel-group"]'))) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, phase: "idle", size: frameW, last: 0, lastT: e.timeStamp, vel: 0, body: e.pointerType !== "mouse" && !!(e.target as Element).closest("[data-scroll-body]") };
    swiped.current = false;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = (e.clientX - g.x0) / scale;
      const dy = (e.clientY - g.y0) / scale;
      if (g.phase === "none") return;
      if (g.phase === "idle") {
        if (Math.hypot(dx, dy) < 8) return;
        const dir: SwipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        const on = live.current.onShow();
        const cur = frames.find((f) => f.id === (on ? shownId(on) : undefined));
        if (!cur) return;
        const swipedTo = cur.swipe?.[dir];
        const to = swipedTo ? shownId(swipedTo) : undefined;
        const spec = SWIPE_DIRS.find((d) => d.key === dir)!;
        /* only swipes the author set up move screens; nothing is inferred. A finger dragging up or
         * down a body that scrolls is scrolling it; a mouse scrolls with its wheel, so it still swipes */
        let pk: Peek | null = null;
        const scrolling = g.body && (dir === "up" || dir === "down");
        if (to && !scrolling && frames.some((f) => f.id === to)) pk = { frameId: to, t: spec.transition };
        if (!pk) {
          g.phase = "none";
          return;
        }
        const sl = SLIDE_SPEC[pk.t]!;
        g.phase = "drag";
        g.dir = dir;
        const { w, h } = frameSizeOf(cur);
        g.size = sl.axis === "x" ? w : h;
        swiped.current = true;
        axisMV.set(sl.axis === "x" ? 0 : 1);
        enterMV.set(sl.enter);
        exitMV.set(sl.exit);
        prog.set(0);
        peekRef.current = pk;
        setPeekNow(pk);
      }
      const along = g.dir === "left" ? -dx : g.dir === "right" ? dx : g.dir === "up" ? -dy : dy;
      const pr = Math.max(0, Math.min(1, along / g.size));
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.vel = (pr - g.last) / dt;
      g.last = pr;
      g.lastT = e.timeStamp;
      prog.set(pr);
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      if (g.phase !== "drag") return;
      const pk = peekRef.current;
      if (!pk) return;
      const commit = prog.get() > 0.25 || g.vel > 0.0012;
      animate(prog, commit ? 1 : 0, { duration: 0.26, ease: EASE }).then(() => {
        if (commit) live.current.onCommit(pk);
        peekRef.current = null;
        setPeekNow(null);
        enterMV.set(0);
        exitMV.set(0);
        prog.set(0);
        window.setTimeout(() => {
          swiped.current = false;
        }, 50);
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [frames, scale, prog, axisMV, enterMV, exitMV, shownId]);

  return { peek, peekRef, swiped, onPointerDown, curX, curY, curOp, peekX, peekY };
}
