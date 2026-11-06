/* The prototype on the canvas, the way Figma draws it: while a part's Prototype tab is open, a handle on its right edge
 * drags out a connection (the noodle) to the screen it is let go on, and a connection picked on the canvas opens a box
 * that edits it in place. Every change is `set_action`, the taps a line stands for changed as one step. */

import { useRef, useState, type RefObject } from "react";
import { frameRect, type Action, type Frame, type Group } from "@/lib/tokens";
import { ops, type DocStore, type Op, type TxOptions } from "@/lib/core";
import type { Tab } from "@/components/PartPanel";

export type Noodle = { itemId: string; from: { x: number; y: number }; to: { x: number; y: number }; over: string | null };

export type ConnectInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  framesRef: RefObject<Frame[]>;
  setSelectedLinkId: (id: string | null) => void;
};

/** the action behind a line, by its id `itemId|slot` */
export function linkAction(groups: Group[], linkId: string): Action | undefined {
  const [itemId, slot] = linkId.split("|");
  const it = groups.flatMap((g) => g.items).find((x) => x.id === itemId);
  return slot ? it?.actions?.[slot] : it?.action;
}

export function useConnect({ store, runOp, toWorld, framesRef, setSelectedLinkId }: ConnectInputs) {
  /** the tab the panel of a part shows: on Prototype, the canvas offers the handle that connects */
  const [partTab, setPartTab] = useState<Tab>("design");
  const [noodle, setNoodle] = useState<Noodle | null>(null);
  const live = useRef<Noodle | null>(null);

  /** the screen under a point of the canvas, other than the one it starts on */
  const screenAt = (p: { x: number; y: number }, not?: string) => (framesRef.current ?? []).find((f) => f.id !== not && (() => {
    const r = frameRect(f);
    return p.x >= r.l && p.x <= r.r && p.y >= r.t - 40 && p.y <= r.b;
  })())?.id ?? null;

  /** A connection made: the part's tap goes to the screen, keeping what else it does and how it came in before. */
  const connect = (itemId: string, to: string) => {
    const it = store.get().doc.groups.flatMap((g) => g.items).find((x) => x.id === itemId);
    if (!it) return;
    const was = it.action;
    const toScreen = !!was && (store.get().doc.frames.some((f) => f.id === was.to));
    const action = { ...was, to, transition: toScreen ? was!.transition : "slide" } as Action;
    runOp(ops.setAction, { id: itemId, action }, { history: "step" });
    setSelectedLinkId(`${itemId}|`);
  };

  /** the handle pressed: the noodle follows the pointer and lands on the screen it is let go over */
  const onHandleDown = (e: React.PointerEvent, itemId: string, from: { x: number; y: number }, source?: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const start: Noodle = { itemId, from, to: from, over: null };
    live.current = start;
    setNoodle(start);
    const move = (ev: PointerEvent) => {
      const at = toWorld(ev.clientX, ev.clientY);
      const next = { ...live.current!, to: at, over: screenAt(at, source) };
      live.current = next;
      setNoodle(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const done = live.current;
      live.current = null;
      setNoodle(null);
      if (done?.over) connect(done.itemId, done.over);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  /** a line's taps given the action edited in the box on the canvas: one step, however many taps it stands for */
  const setLinkActions = (ids: string[], action: Action) => {
    store.transact(
      "Interaction",
      "user",
      (tx) => {
        for (const id of ids) {
          const [itemId, slot] = id.split("|");
          tx.run(ops.setAction, { id: itemId, ...(slot ? { slot } : {}), action });
        }
      },
      { history: { coalesce: `link:${ids.join(",")}` } },
    );
  };

  return { partTab, setPartTab, noodle, onHandleDown, setLinkActions };
}
