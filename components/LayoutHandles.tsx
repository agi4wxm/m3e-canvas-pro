import { useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import type { Flow } from "@/lib/flow";
import { t, useLang } from "@/lib/i18n";

/* The spacing of a selected auto layout, pulled on the canvas as in Figma: a handle in the middle of each padding band
 * and of each gap between the parts it lays out. A padding handle pulled changes that side (Alt: both sides of that
 * axis, Shift+Alt: all four); a gap handle the gap. Shift steps by 8. The number shows while a handle is held or
 * pointed at. Drawn in canvas units: line widths and labels are kept the same at any zoom. */

type Rect = { l: number; t: number; r: number; b: number };
type Side = "t" | "r" | "b" | "l";

/** what a handle writes: the container's own props */
export type SpacingPatch = Record<string, number | undefined>;

const MAX = 96;

export function LayoutHandles({ box, flow, kids, z, p, onChange }: { box: Rect; flow: Flow; kids: Rect[]; z: number; p: Palette; onChange: (patch: SpacingPatch, key: string) => void }) {
  const lang = useLang();
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{ key: string; x: number; y: number; start: number; sign: 1 | -1; axis: "x" | "y"; write: (v: number, alt: boolean, all: boolean) => SpacingPatch } | null>(null);
  const room: Rect = { l: box.l + flow.inset.l, t: box.t + flow.inset.t, r: box.r - flow.inset.r, b: box.b - flow.inset.b };
  const pad = flow.pad;
  const sidesOf = (next: Record<Side, number>): SpacingPatch => ({ padTop: next.t, padRight: next.r, padBottom: next.b, padLeft: next.l });
  const padWrite = (side: Side) => (v: number, alt: boolean, all: boolean): SpacingPatch => {
    if (all) return { padX: v, padY: v, padTop: undefined, padRight: undefined, padBottom: undefined, padLeft: undefined };
    if (alt) return sidesOf({ ...pad, ...(side === "t" || side === "b" ? { t: v, b: v } : { l: v, r: v }) });
    return sidesOf({ ...pad, [side]: v });
  };
  const start = (e: React.PointerEvent, key: string, value: number, axis: "x" | "y", sign: 1 | -1, write: (v: number, alt: boolean, all: boolean) => SpacingPatch) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { key, x: e.clientX, y: e.clientY, start: value, sign, axis, write };
    setHeld(key);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = ((d.axis === "x" ? e.clientX - d.x : e.clientY - d.y) / z) * d.sign;
    let v = Math.max(0, Math.min(MAX, Math.round(d.start + delta)));
    if (e.shiftKey) v = Math.round(v / 8) * 8;
    onChange(d.write(v, e.altKey, e.altKey && e.shiftKey), d.key);
  };
  const end = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setHeld(null);
  };

  const line = 1 / z;
  const handles: { key: string; at: { x: number; y: number }; long: "x" | "y"; value: number; axis: "x" | "y"; sign: 1 | -1; write: (v: number, alt: boolean, all: boolean) => SpacingPatch; title: string; band: Rect }[] = [];
  const cx = (room.l + room.r) / 2;
  const cy = (room.t + room.b) / 2;
  /* the padding bands, each with its handle in the middle */
  const padTitle = t("lhPad", lang);
  handles.push({ key: "pad-t", at: { x: cx, y: room.t + pad.t / 2 }, long: "x", value: pad.t, axis: "y", sign: 1, write: padWrite("t"), title: padTitle, band: { l: room.l, t: room.t, r: room.r, b: room.t + pad.t } });
  handles.push({ key: "pad-b", at: { x: cx, y: room.b - pad.b / 2 }, long: "x", value: pad.b, axis: "y", sign: -1, write: padWrite("b"), title: padTitle, band: { l: room.l, t: room.b - pad.b, r: room.r, b: room.b } });
  handles.push({ key: "pad-l", at: { x: room.l + pad.l / 2, y: cy }, long: "y", value: pad.l, axis: "x", sign: 1, write: padWrite("l"), title: padTitle, band: { l: room.l, t: room.t, r: room.l + pad.l, b: room.b } });
  handles.push({ key: "pad-r", at: { x: room.r - pad.r / 2, y: cy }, long: "y", value: pad.r, axis: "x", sign: -1, write: padWrite("r"), title: padTitle, band: { l: room.r - pad.r, t: room.t, r: room.r, b: room.b } });
  /* the gaps between what a single row or column lays out */
  if ((flow.dir === "row" && !flow.wrap) || flow.dir === "column") {
    const row = flow.dir === "row";
    const sorted = [...kids].sort((a, b) => (row ? a.l - b.l : a.t - b.t));
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const band: Rect = row ? { l: a.r, t: room.t + pad.t, r: b.l, b: room.b - pad.b } : { l: room.l + pad.l, t: a.b, r: room.r - pad.r, b: b.t };
      if (row ? band.r - band.l < 0 : band.b - band.t < 0) continue;
      handles.push({
        key: `gap-${i}`,
        at: { x: (band.l + band.r) / 2, y: (band.t + band.b) / 2 },
        long: row ? "y" : "x",
        value: flow.gap,
        axis: row ? "x" : "y",
        sign: 1,
        write: (v) => ({ gap: v }),
        title: t("lhGap", lang),
        band,
      });
    }
  }
  const shown = held ?? over;
  return (
    <div data-layout-handles aria-hidden={false} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 65 }}>
      {handles.map((h) => {
        const on = shown === h.key || (held?.startsWith("gap") && h.key.startsWith("gap"));
        const len = 14 / z;
        const thick = 4 / z;
        return (
          <div key={h.key}>
            {on && (
              <div aria-hidden style={{ position: "absolute", left: h.band.l, top: h.band.t, width: Math.max(0, h.band.r - h.band.l), height: Math.max(0, h.band.b - h.band.t), background: `${p.error}22`, pointerEvents: "none" }} />
            )}
            <div
              role="slider"
              aria-label={h.title}
              aria-valuenow={h.value}
              aria-valuemin={0}
              aria-valuemax={MAX}
              title={h.title}
              data-layout-handle={h.key}
              onPointerDown={(e) => start(e, h.key, h.value, h.axis, h.sign, h.write)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onPointerEnter={() => setOver(h.key)}
              onPointerLeave={() => setOver((o) => (o === h.key ? null : o))}
              style={{
                position: "absolute",
                left: h.at.x - (h.long === "x" ? len : thick + 4 / z) / 2,
                top: h.at.y - (h.long === "y" ? len : thick + 4 / z) / 2,
                width: h.long === "x" ? len : thick + 4 / z,
                height: h.long === "y" ? len : thick + 4 / z,
                display: "grid",
                placeItems: "center",
                cursor: h.axis === "x" ? "ew-resize" : "ns-resize",
                touchAction: "none",
              }}
            >
              <span style={{ width: h.long === "x" ? len : line * 2, height: h.long === "y" ? len : line * 2, borderRadius: 2 / z, background: p.error, opacity: on ? 1 : 0.7 }} />
            </div>
            {on && (
              <div aria-hidden style={{ position: "absolute", left: h.at.x, top: h.at.y, transform: `translate(-50%, ${h.long === "x" ? -150 : 60}%) scale(${1 / z})`, transformOrigin: "50% 50%", padding: "1px 5px", borderRadius: 4, background: p.error, color: p.onError, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
                {h.value}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
