import type { Palette } from "@/lib/tokens";
import type { GuideGap, GuideLine } from "@/lib/guides";

/* The smart guides of a drag, drawn on the canvas in canvas units: a line across what lines up, a mark on every even
 * gap, and the distance to each neighbour. Strokes are one device pixel at any zoom, and the labels keep their size. */

const LABEL_H = 18;
/** even gaps are marked in pink, as in Figma: apart from the lines (the primary colour) and the distances (the error colour) */
const EQUAL = "#d6408a";

function Label({ x, y, text, bg, fg, z }: { x: number; y: number; text: string; bg: string; fg: string; z: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${1 / z})`,
        height: LABEL_H,
        padding: "0 5px",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: `${LABEL_H}px`,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}

export function SmartGuides({ lines, gaps, z, p }: { lines: GuideLine[]; gaps: GuideGap[]; z: number; p: Palette }) {
  const px = 1 / z;
  const tick = 6 / z;
  return (
    <>
      {lines.map((l, i) => (
        <div
          key={`line-${i}`}
          data-guide-line={l.axis}
          style={{
            position: "absolute",
            left: l.axis === "x" ? l.at - px / 2 : l.from,
            top: l.axis === "x" ? l.from : l.at - px / 2,
            width: l.axis === "x" ? px : Math.max(px, l.to - l.from),
            height: l.axis === "x" ? Math.max(px, l.to - l.from) : px,
            background: p.primary,
            pointerEvents: "none",
          }}
        />
      ))}
      {gaps.map((g, i) => {
        const size = Math.round(g.to - g.from);
        if (size <= 0) return null;
        const color = g.kind === "equal" ? EQUAL : p.error;
        const on = g.kind === "equal" ? "#ffffff" : p.onError;
        const along = g.axis === "x";
        const mid = (g.from + g.to) / 2;
        return (
          <div key={`gap-${i}`} data-guide-gap={g.kind} style={{ pointerEvents: "none" }}>
            {/* an even gap is shaded, a distance is a line with a tick at each end */}
            {g.kind === "equal" && (
              <div style={{ position: "absolute", left: along ? g.from : g.at - tick * 2, top: along ? g.at - tick * 2 : g.from, width: along ? size : tick * 4, height: along ? tick * 4 : size, background: `${color}33` }} />
            )}
            <div style={{ position: "absolute", left: along ? g.from : g.at - px / 2, top: along ? g.at - px / 2 : g.from, width: along ? size : px, height: along ? px : size, background: color }} />
            {[g.from, g.to].map((end) => (
              <div key={end} style={{ position: "absolute", left: along ? end - px / 2 : g.at - tick / 2, top: along ? g.at - tick / 2 : end - px / 2, width: along ? px : tick, height: along ? tick : px, background: color }} />
            ))}
            <Label x={along ? mid : g.at} y={along ? g.at : mid} text={String(size)} bg={color} fg={on} z={z} />
          </div>
        );
      })}
    </>
  );
}
