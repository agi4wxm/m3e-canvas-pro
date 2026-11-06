import { Suspense, lazy } from "react";
import { isStrict } from "@/lib/styles";
import type { Palette, Theme } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { whenStarted } from "@/parts/prefetch";
import type { StylePanelProps } from "./StylePanelBody";

/* The styles panel draws every style with real M3E controls (StylePanelBody.tsx). Those come when the panel is first
 * opened, or before, once the editor is up and the page is idle: the editor does not wait for them to start. */

const loadBody = () => import("./StylePanelBody");
const Body = lazy(() => loadBody().then((m) => ({ default: m.StylePanel })));
whenStarted(() => void loadBody());

/** the styles, each drawn by real controls wearing it, and how each kind of control is built */
export function StylePanel(props: StylePanelProps) {
  return (
    <Suspense fallback={<div aria-busy="true" style={{ height: "100%" }} />}>
      <Body {...props} />
    </Suspense>
  );
}

/** A panel for something the style decides: shown as it stands, and not to be changed, unless the author lets the rules go.
 *  Android's rules leave the colors and how lively things are to the author, as Material does. */
export function StyleGate({ p, theme, what, onFree, children }: { p: Palette; theme: Theme; what: "color" | "shape" | "type" | "motion"; onFree: () => void; children: React.ReactNode }) {
  const lang = useLang();
  const held = isStrict(theme) && (!!theme.style || what === "shape" || what === "type");
  if (!held) return <>{children}</>;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div data-style-gate style={{ margin: "12px 12px 0", padding: "10px 12px", borderRadius: 12, background: p.secondaryContainer, color: p.onSecondaryContainer, fontSize: 12, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 8 }}>
        <span>{t("styleGate", lang)}</span>
        <button onClick={onFree} className="m3-press" style={{ alignSelf: "flex-start", height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: p.surface, color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {t("styleUnlock", lang)}
        </button>
      </div>
      <div inert style={{ flex: 1, minHeight: 0, overflow: "hidden", opacity: 0.45, pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}
