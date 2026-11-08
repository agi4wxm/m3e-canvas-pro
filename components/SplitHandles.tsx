import { useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import type { Split } from "@/lib/split";
import { t, useLang } from "@/lib/i18n";

/* The divider of a selected split view (or of one holding the selection), pulled on the canvas: it writes the design's
 * share of the first pane, and the panes' parts follow as it moves. One drag is one undo step (the editor coalesces
 * the writes). It snaps to whole percents (Shift: 5, with Alt: 10), to half and to the panes' limits; a double click
 * splits it in half again. It is a focusable `role="separator"` with its value and range: the arrow keys move it a
 * percent (Shift: 5), Home and End to the limits, Enter folds the pane that folds. Drawn in canvas units. */

type Rect = { l: number; t: number; r: number; b: number };

/** one split view's divider as the canvas draws it */
export type SplitHandle = {
  /** the split view's part */
  id: string;
  box: Rect;
  split: Split;
  /** the first pane's share now, and where the divider stands along the axis from the split's start */
  share: number;
  at: number;
  /** the share the limits allow */
  range: { min: number; max: number };
  /** what the panes are called, for the divider's name */
  names: [string, string];
  folded: boolean;
};

const SNAP_PX = 6;

export function SplitHandles({ handles, z, p, onChange, onFold }: { handles: SplitHandle[]; z: number; p: Palette; /** `step` names the undo step: one per drag, per double click, per run of arrow keys */ onChange: (id: string, share: number, step: string) => void; onFold: (id: string, folded: boolean) => void }) {
  const lang = useLang();
  const [held, setHeld] = useState<string | null>(null);
  const drag = useRef<{ id: string; start: number; pos: number } | null>(null);
  /* each gesture its own undo step: a run of arrow presses is one, anything else starts the next */
  const steps = useRef({ n: 0, arrows: false });
  const nextStep = (arrows = false) => {
    if (!(arrows && steps.current.arrows)) steps.current.n += 1;
    steps.current.arrows = arrows;
    return String(steps.current.n);
  };
  const current = () => String(steps.current.n);
  const room = (h: SplitHandle) => Math.max(1, (h.split.vertical ? h.box.b - h.box.t : h.box.r - h.box.l) - h.split.divider);
  /** a share the pointer reached, snapped */
  const snapped = (h: SplitHandle, raw: number, e: { shiftKey: boolean; altKey: boolean }) => {
    const step = e.shiftKey ? (e.altKey ? 10 : 5) : 1;
    const near = (to: number) => Math.abs(((raw - to) / 100) * room(h)) * z <= SNAP_PX;
    /* the limits and the middle pull it to them; a pane that folds may be dragged past its least, to fold it */
    for (const to of [h.range.min, h.range.max, 50]) if (near(to)) return Math.round(to * 100) / 100;
    const v = Math.round(raw / step) * step;
    const lo = h.split.collapsible === "first" ? 0 : h.range.min;
    const hi = h.split.collapsible === "second" ? 100 : h.range.max;
    return Math.max(lo, Math.min(hi, v));
  };
  const start = (e: React.PointerEvent, h: SplitHandle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: h.id, start: h.split.vertical ? e.clientY : e.clientX, pos: h.at };
    nextStep();
    setHeld(h.id);
  };
  const move = (e: React.PointerEvent, h: SplitHandle) => {
    const d = drag.current;
    if (!d || d.id !== h.id) return;
    const pos = d.pos + ((h.split.vertical ? e.clientY : e.clientX) - d.start) / z;
    const share = snapped(h, (pos / room(h)) * 100, e);
    if (share !== h.share) onChange(h.id, share, current());
  };
  const end = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setHeld(null);
  };
  const key = (e: React.KeyboardEvent, h: SplitHandle) => {
    const back = h.split.vertical ? "ArrowUp" : "ArrowLeft";
    const on = h.split.vertical ? "ArrowDown" : "ArrowRight";
    const by = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === back) next = h.share - by;
    else if (e.key === on) next = h.share + by;
    else if (e.key === "Home") next = h.range.min;
    else if (e.key === "End") next = h.range.max;
    else if (e.key === "Enter" && h.split.collapsible !== "none") {
      e.preventDefault();
      e.stopPropagation();
      onFold(h.id, !h.folded);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    const v = Math.round(Math.max(h.range.min, Math.min(h.range.max, next)) * 100) / 100;
    const step = nextStep(e.key === back || e.key === on);
    if (v !== h.share) onChange(h.id, v, step);
  };

  return (
    <div data-split-handles style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 66 }}>
      {handles.map((h) => {
        const v = h.split.vertical;
        const on = held === h.id;
        /* a hit target of 12 screen pixels however thin the divider, centred on it */
        const reach = 12 / z;
        const mid = (v ? h.box.t : h.box.l) + h.at + h.split.divider / 2;
        const name = t("splitDivider", lang).replace("{first}", h.names[0]).replace("{second}", h.names[1]);
        return (
          <div
            key={h.id}
            role="separator"
            tabIndex={0}
            aria-label={name}
            aria-orientation={v ? "horizontal" : "vertical"}
            aria-valuenow={Math.round(h.share * 100) / 100}
            aria-valuemin={Math.round(h.range.min * 100) / 100}
            aria-valuemax={Math.round(h.range.max * 100) / 100}
            aria-valuetext={`${Math.round(h.share)}%`}
            title={`${name}. ${t("splitDividerHint", lang)}`}
            data-split-handle={h.id}
            onPointerDown={(e) => start(e, h)}
            onPointerMove={(e) => move(e, h)}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (h.share !== 50) onChange(h.id, 50, nextStep());
            }}
            onKeyDown={(e) => key(e, h)}
            style={{
              color: p.primary,
              position: "absolute",
              left: v ? h.box.l : mid - reach / 2,
              top: v ? mid - reach / 2 : h.box.t,
              width: v ? h.box.r - h.box.l : reach,
              height: v ? reach : h.box.b - h.box.t,
              display: "grid",
              placeItems: "center",
              cursor: v ? "row-resize" : "col-resize",
              touchAction: "none",
            }}
          >
            <span aria-hidden style={{ width: v ? "100%" : Math.max(1, 2 / z), height: v ? Math.max(1, 2 / z) : "100%", background: p.primary, opacity: on ? 1 : 0.55 }} />
            <span aria-hidden style={{ position: "absolute", width: v ? 32 / z : 6 / z, height: v ? 6 / z : 32 / z, borderRadius: 3 / z, background: p.primary }} />
            {on && (
              <span aria-hidden style={{ position: "absolute", transform: `translate(${v ? 0 : "-50%"}, ${v ? "-150%" : 0}) scale(${1 / z})`, padding: "1px 5px", borderRadius: 4, background: p.primary, color: p.onPrimary, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(h.share)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
