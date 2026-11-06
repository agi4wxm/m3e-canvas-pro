/* The banner over the canvas of a project from elsewhere whose pictures from other sites are held back
 * (src/editor/useOutsideImages.ts): what is not loaded and why, "Load external images", and "Not now". */

import type { Lang } from "@/lib/i18n";
import { safetyText } from "@/lib/i18n/safety";
import type { Palette } from "@/lib/tokens";
import { Icon } from "./Icon";

export function OutsideBanner({ p, lang, onAllow, onLater }: { p: Palette; lang: Lang; onAllow: () => void; onLater: () => void }) {
  return (
    <div
      role="status"
      data-outside-banner
      style={{
        position: "absolute",
        /* below the toolbar, over the canvas */
        top: 76,
        left: "50%",
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: "min(560px, calc(100% - 32px))",
        boxSizing: "border-box",
        zIndex: 46,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 12,
        rowGap: 6,
        padding: "10px 10px 10px 14px",
        borderRadius: 16,
        background: p.surfaceContainerHigh,
        color: p.onSurface,
        boxShadow: "0 4px 16px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.12)",
        pointerEvents: "auto",
      }}
    >
      <Icon name="hide_image" size={20} color={p.onSurfaceVariant} />
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{safetyText("outsideTitle", lang)}</div>
        <div style={{ fontSize: 12, lineHeight: 1.4, color: p.onSurfaceVariant }}>{safetyText("outsideBody", lang)}</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
        <button type="button" data-outside-later className="m3-press" onClick={onLater} style={{ height: 36, padding: "0 12px", borderRadius: 18, border: "none", background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {safetyText("outsideLater", lang)}
        </button>
        <button type="button" data-outside-load className="m3-press" onClick={onAllow} style={{ height: 36, padding: "0 14px", borderRadius: 18, border: "none", background: p.primary, color: p.onPrimary, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {safetyText("outsideLoad", lang)}
        </button>
      </div>
    </div>
  );
}
