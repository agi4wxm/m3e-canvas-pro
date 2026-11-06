/* A screen made to run longer than its device, or back: its length slider and the grip under it, dragged or stepped
 * from the keyboard. What stands at its foot goes with the foot (lib/core `set_screen_length`). */

import { useRef, useState, type RefObject } from "react";
import { clamp, Frame, frameLengthOf, frameSizeOf, Group } from "@/lib/tokens";
import { maxFrameLength } from "@/lib/tidy";
import { ops, type DocStore, type Op, type TxOptions } from "@/lib/core";
import type { View } from "./model";

export type ScreenLengthInputs = {
  store: DocStore;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string }) => boolean;
  framesRef: RefObject<Frame[]>;
  groupsRef: RefObject<Group[]>;
  viewRef: RefObject<View>;
  tidyRef: { current: unknown };
};

export function useScreenLength({ store, didOp, framesRef, groupsRef, viewRef, tidyRef }: ScreenLengthInputs) {
  /** the document a run of length changes started from, and what the last of them made of it */
  const lengthRun = useRef<{ id: string; from: { frames: Frame[]; groups: Group[] }; to: { frames: Frame[]; groups: Group[] } } | null>(null);
  /** makes a screen run longer than its device, or back: what stands at its foot goes with the foot.
   *  A slider sends a stream of lengths; each is worked out from where the stream began, so a part
   *  is never taken for one at the foot halfway through and dragged along from then on. */
  /** One drag of a screen's length handle: the document it started from, and whether it took its one undo step */
  type LengthDrag = { from: { frames: Frame[]; groups: Group[] }; snapped: boolean };
  const setFrameLength = (id: string, length: number, drag?: LengthDrag) => {
    const run = lengthRun.current;
    const from = drag
      ? drag.from
      : run && run.id === id && run.to.frames === framesRef.current && run.to.groups === groupsRef.current
        ? run.from
        : { frames: framesRef.current, groups: groupsRef.current };
    if (!didOp(ops.setScreenLength, { id, length, from }, { history: drag ? (drag.snapped ? "none" : "step") : { coalesce: "frame:" + id + ":length" } })) return;
    if (drag) drag.snapped = true;
    lengthRun.current = { id, from, to: { frames: store.get().doc.frames, groups: store.get().doc.groups } };
    tidyRef.current = null;
  };

  /** the screen whose length handle is being dragged: it follows the pointer without easing */
  const [lengthDragId, setLengthDragId] = useState<string | null>(null);
  /** the grip under the chosen screen: dragging it makes the screen run longer or shorter, as the
   *  length slider does, in steps of 4dp. The whole drag is worked out from the document it began
   *  with, and takes one undo step, and only once the length really changes. */
  const onLengthHandleDown = (e: React.PointerEvent, f: Frame) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pointerId = e.pointerId;
    const startY = e.clientY;
    const start = frameLengthOf(f);
    const deviceH = frameSizeOf(f).h;
    const max = maxFrameLength(f);
    const drag: LengthDrag = { from: { frames: framesRef.current, groups: groupsRef.current }, snapped: false };
    lengthRun.current = null;
    setLengthDragId(f.id);
    /* captured, the pointer's events reach the window through the handle wherever it is let go;
     * should the handle go away mid-drag, they reach the window directly */
    (e.currentTarget as HTMLElement).setPointerCapture(pointerId);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setFrameLength(f.id, clamp(Math.round((start + (ev.clientY - startY) / viewRef.current.z) / 4) * 4, deviceH, max), drag);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      lengthRun.current = null;
      setLengthDragId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  /** the same handle from the keyboard: arrows move it by 4dp, with Shift by 40dp */
  const onLengthHandleKey = (e: React.KeyboardEvent, f: Frame) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 40 : 4) * (e.key === "ArrowDown" ? 1 : -1);
    setFrameLength(f.id, clamp(frameLengthOf(f) + step, frameSizeOf(f).h, maxFrameLength(f)));
  };
  return { lengthRun, setFrameLength, lengthDragId, onLengthHandleDown, onLengthHandleKey };
}
