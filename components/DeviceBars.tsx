import { GESTURE_BAR_H, Palette, STATUS_BAR_H, type ColorToken, onToken } from "@/lib/tokens";

/* The bars a phone or a tablet draws for itself, over a screen in the editor and the preview. They take
 * no pointer and are never printed: the device the app ends up on has its own. Drawn here rather than
 * from the icon set, so that a document using them does not fetch or bundle anything for them. */

/** the marks of a status bar, in the screen's own "on" colour */
function StatusMarks({ color }: { color: string }) {
  return (
    <svg width={52} height={12} viewBox="0 0 52 12" aria-hidden style={{ display: "block" }}>
      {/* signal */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4} y={9 - i * 3} width={3} height={3 + i * 3} rx={0.5} fill={color} />
      ))}
      {/* wifi */}
      <path d="M21 4.2a9 9 0 0 1 12 0l-1.4 1.5a7 7 0 0 0-9.2 0zM23.6 7a5 5 0 0 1 6.8 0L27 11z" fill={color} />
      {/* battery */}
      <rect x={37.5} y={1.5} width={12} height={9} rx={2} fill="none" stroke={color} strokeWidth={1} />
      <rect x={39} y={3} width={9} height={6} rx={1} fill={color} />
      <rect x={50.2} y={4.5} width={1.3} height={3} rx={0.5} fill={color} />
    </svg>
  );
}

/** Stands over the first `height` of a screen, however far it scrolls. `zIndex` keeps it over what the screen holds. */
export function DeviceBars({ p, bg, height, zIndex }: { p: Palette; bg: ColorToken; height: number; zIndex: number }) {
  const color = onToken(bg, p);
  return (
    <div data-device-bars aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height, zIndex, pointerEvents: "none", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: STATUS_BAR_H, padding: "0 16px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", color, fontSize: 12, fontWeight: 500 }}>
        <span>9:41</span>
        <StatusMarks color={color} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: GESTURE_BAR_H, display: "grid", placeItems: "center" }}>
        <span style={{ width: 108, height: 4, borderRadius: 2, background: color, opacity: 0.8 }} />
      </div>
    </div>
  );
}
