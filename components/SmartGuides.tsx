import type { Palette } from "@/lib/tokens";
import { labelSpot, type GuideGap, type GuideLine, type Rect } from "@/lib/guides";

/* The smart guides of a drag, drawn on the canvas in canvas units: a line across what lines up, a mark on every even
 * gap, and the distance to each neighbour. Strokes are one device pixel at any zoom, and the labels keep their size.
 * A number is written where it covers no other part's words, on a chip of its own. */

const LABEL_H = 18;
/** even gaps are marked in pink, as in Figma: apart from the lines (the primary colour) and the distances (the error colour) */
const EQUAL = "#d6408a";

function Label({ x, y, text, bg, fg, z }: { x: number; y: number; text: string; bg: string; fg: string; z: number }) {
  return (
    <div
      data-guide-label
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
        /* a ring of white keeps the chip apart from whatever it stands beside */
        boxShadow: "0 0 0 1.5px #ffffff, 0 1px 3px rgba(0,0,0,0.25)",
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

/** how big a label comes out, in canvas units: a digit is about 7px wide at 11px, with 5px of padding each side */
const labelSize = (text: string, z: number) => ({ w: (text.length * 7 + 12) / z, h: (LABEL_H + 2) / z });

export function SmartGuides({ lines, gaps, z, p, avoid = [] }: { lines: GuideLine[]; gaps: GuideGap[]; z: number; p: Palette; /** the parts the numbers must not cover */ avoid?: Rect[] }) {
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
        const text = String(size);
        const at = labelSpot(g, labelSize(text, z), avoid);
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
            <Label x={at.x} y={at.y} text={text} bg={color} fg={on} z={z} />
          </div>
        );
      })}
    </>
  );
}

/** Where a part let go in an auto layout will go, as Figma marks it: a 2px line in the accent colour at its slot, with a
 *  small cap at each end, in place of the distances a free drop shows. */
export function InsertionMark({ line, z, p }: { line: GuideLine; z: number; p: Palette }) {
  const w = 2 / z;
  const cap = 6 / z;
  const len = Math.max(w, line.to - line.from);
  const standing = line.axis === "x";
  return (
    <div data-flow-insert={line.axis} style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: standing ? line.at - w / 2 : line.from, top: standing ? line.from : line.at - w / 2, width: standing ? w : len, height: standing ? len : w, borderRadius: w, background: p.primary }} />
      {[line.from, line.from + len].map((end, i) => (
        <div key={i} style={{ position: "absolute", left: standing ? line.at - cap / 2 : end - w, top: standing ? end - w : line.at - cap / 2, width: standing ? cap : w * 2, height: standing ? w * 2 : cap, borderRadius: w, background: p.primary }} />
      ))}
    </div>
  );
}
