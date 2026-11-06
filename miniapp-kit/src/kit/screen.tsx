import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Children, createContext, isValidElement, useContext, useMemo, type ReactNode } from "react";

import { c, ca } from "./color";
import { FillWidth } from "./layout";
import { sx, type CSS } from "./styles";
import { themeClass, useKit } from "./theme";

/* What a printed screen stands on: the page itself (its ground, the theme's variables on its root, light or dark), the
 * parts placed where the design has them (`At`), the bars pinned to an edge (`Pin`), and what floats over it (`Layer`).
 * The page scrolls as a whole (so a mini-program's own pull-down refresh and reach-bottom reach it); pinned bars stay.
 *
 * Every screen has a custom navigation style: the page draws its own top bar, under the device's status bar, and keeps
 * clear of the capsule (WeChat's and Douyin's "… ◎" button at the top right), whose place the platform gives
 * (`chrome`). On the web (H5) there is neither. Sizes are px, one per point of the design (docs/小程序.md). */

export type Chrome = {
  /** the device's status bar, over the page */
  status: number;
  /** the row the capsule sits in, under the status bar */
  nav: number;
  /** what the capsule takes off the right of that row, with a margin */
  capsule: number;
  /** the gesture bar at the foot */
  bottom: number;
};

let measured: Chrome | undefined;

/** where the device's own things are, measured once */
export function chrome(): Chrome {
  if (measured) return measured;
  if (process.env.TARO_ENV === "h5") return (measured = { status: 0, nav: 0, capsule: 0, bottom: 0 });
  try {
    const info = Taro.getSystemInfoSync();
    const status = info.statusBarHeight ?? 0;
    let nav = 44;
    let capsule = 0;
    try {
      const m = Taro.getMenuButtonBoundingClientRect();
      if (m && m.height) {
        nav = Math.max(32, (m.top - status) * 2 + m.height);
        capsule = Math.max(0, info.windowWidth - m.left + 8);
      }
    } catch {
      /* a platform with no capsule */
    }
    const bottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0;
    measured = { status, nav, capsule, bottom };
  } catch {
    measured = { status: 0, nav: 0, capsule: 0, bottom: 0 };
  }
  return measured;
}

/** the device's chrome, for a bar that has to keep clear of it */
export const useChrome = () => useMemo(() => chrome(), []);

/** a part placed on its screen, from the screen's top left; `span` runs it from edge to edge */
export function At({ x = 0, y = 0, span, z, children }: { x?: number; y?: number; span?: boolean; z?: number; children?: ReactNode }) {
  const style: CSS = span ? { position: "absolute", left: 0, right: 0, top: y } : { position: "absolute", left: x, top: y };
  if (z) style.zIndex = String(z);
  return <View style={sx(style)}>{span ? <FillWidth>{children}</FillWidth> : children}</View>;
}

/** inside a pinned bar at the top: the bar keeps clear of the capsule */
const PinnedTop = createContext(false);
export const usePinnedTop = () => useContext(PinnedTop);

/** a bar pinned to an edge of the screen, over what scrolls, inside the device's own bars */
export function Pin({ edge, x, children }: { edge: "top" | "bottom" | "floatingBottom"; x?: number; children?: ReactNode }) {
  const ch = useChrome();
  const floating = edge === "floatingBottom";
  const style: CSS =
    edge === "top"
      ? { position: "fixed", left: 0, right: 0, top: 0, paddingTop: ch.status }
      : { position: "fixed", left: floating && x !== undefined ? x : 0, right: floating && x !== undefined ? undefined : 0, bottom: floating ? 16 + ch.bottom : 0, paddingBottom: floating ? 0 : ch.bottom, display: "flex", flexDirection: "column", alignItems: floating && x === undefined ? "center" : "stretch" };
  const ground = edge === "top" ? undefined : undefined;
  return (
    <View style={sx(style, { zIndex: "10", boxSizing: "border-box", pointerEvents: floating ? "none" : undefined, backgroundColor: ground })}>
      <View style={sx({ pointerEvents: "auto" })}>
        <PinnedTop.Provider value={edge === "top"}>{floating ? children : <FillWidth>{children}</FillWidth>}</PinnedTop.Provider>
      </View>
    </View>
  );
}

const BG: Record<string, string> = {
  surface: "surface",
  surfaceContainerLow: "surface-container-low",
  surfaceContainer: "surface-container",
  surfaceContainerHigh: "surface-container-high",
  surfaceContainerHighest: "surface-container-highest",
  primaryContainer: "primary-container",
  secondaryContainer: "secondary-container",
  tertiaryContainer: "tertiary-container",
  primary: "primary",
  inverseSurface: "inverse-surface",
};

/** a screen shown over another stands at its own size, its corners rounded */
const Overlaid = createContext(false);
export const OverlaidProvider = Overlaid.Provider;

export type ScreenProps = {
  /** the screen's ground: a fill role, as the document writes it */
  bg?: string;
  /** the design's width: an overlay's size */
  width?: number;
  /** how tall the design is; longer than the device, the page scrolls under the pinned bars */
  length?: number;
  /** the design's height */
  height?: number;
  /** the screen's key, on its root for tests and tools (`data-screen`) */
  screen?: string;
  children?: ReactNode;
};

/** a screen: its ground, its body (the page, scrolling when it is longer than the device) and its pinned bars */
export function Screen({ bg = "surface", width, length, height, screen, children }: ScreenProps) {
  const kit = useKit();
  const ch = useChrome();
  const overlaid = useContext(Overlaid);
  const pinned: ReactNode[] = [];
  const body: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === Pin) pinned.push(child);
    else body.push(child);
  });
  const ground = c(BG[bg] ?? bg);
  const tall = Math.max(length ?? 0, height ?? 0);
  const tag = screen ? { "data-screen": screen } : {};
  if (overlaid)
    return (
      <View {...tag} style={sx({ position: "relative", width, height, borderRadius: 20, backgroundColor: ground, overflow: "hidden" })}>
        {body}
        {pinned}
      </View>
    );
  /* Cut at the sides, never a scroller of its own: the page is what scrolls, or the platform's pull-down refresh and
     reach-bottom never hear of it. `clip` (not `hidden`, which would make it scroll) is dropped by an older WebView,
     which then lets a part past the edge show. */
  return (
    <View {...tag} className={themeClass(kit.dark, kit.theme.scope)} style={sx({ position: "relative", minHeight: "100vh", backgroundColor: ground, color: c("on-surface"), overflowX: "clip" })}>
      <View style={sx({ position: "relative", height: tall || undefined, marginTop: ch.status, marginBottom: ch.bottom })}>{body}</View>
      {pinned}
    </View>
  );
}

/** What floats over the screen while it is open: a dialog, a sheet, a menu, a screen opened over this one. A tap on the
 *  scrim around it closes it. */
export function Layer({ open, onClose, align = "center", children }: { open: boolean; onClose?: () => void; align?: "center" | "bottom" | "none"; children?: ReactNode }) {
  if (!open) return null;
  return (
    <View
      style={sx({ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: "100", backgroundColor: ca("scrim", 0.32), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: align === "bottom" ? "flex-end" : "center" })}
      onClick={onClose}
      catchMove
    >
      <View onClick={(e) => e.stopPropagation()} style={sx(align === "bottom" ? { width: "100%" } : null)}>
        {children}
      </View>
    </View>
  );
}

/** the theme's root for what is drawn outside a screen (the custom tab bar): its variables, light or dark */
export function ThemeRoot({ children, style }: { children?: ReactNode; style?: CSS }) {
  const kit = useKit();
  return (
    <View className={themeClass(kit.dark, kit.theme.scope)} style={sx(style)}>
      {children}
    </View>
  );
}
