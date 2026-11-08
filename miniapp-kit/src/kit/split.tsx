import { View, type CommonEvent, type ITouchEvent } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

import { c } from "./color";
import type { PartBase } from "./atoms/basics";
import { FillBoth, useFill } from "./layout";
import { withDefaults } from "./parts";
import { sx, type CSS } from "./styles";
import { tagOf } from "./Surface";

/* A split view in a mini-program: two panes, both showing, and a divider a finger drags (touch events, `catchMove` so
 * the page does not scroll under the finger). The panes are what the printer hands it, each a box that fills its
 * pane. The share is the visitor's own (UI state): it starts at the design's `split`, is handed out as
 * `onValueChange` when the finger lifts, and, when the design asks to remember it (`persistKey`), is kept in Taro's
 * storage (wx.setStorage, tt.setStorage, the web's localStorage). Narrower than `breakpoint` (a phone, by default), a
 * split that stacks lays its panes one over the other. */

export type SplitViewProps = PartBase & {
  orientation?: "horizontal" | "vertical";
  /** the design's share of the first pane, 0–100 */
  split?: number;
  minFirst?: number;
  maxFirst?: number;
  minSecond?: number;
  maxSecond?: number;
  collapsible?: "none" | "first" | "second";
  collapsedSize?: number;
  collapsed?: boolean;
  divider?: "line" | "gap";
  handle?: boolean;
  compact?: "stack" | "keep";
  breakpoint?: number;
  /** the design asks for the visitor's share to be remembered (under `persistKey`) */
  persist?: boolean;
  /** the key Taro's storage keeps the visitor's share under, when it is to be remembered */
  persistKey?: string;
  width?: number;
  height?: number;
  onValueChange?: (share: number) => void;
  children?: ReactNode;
};

type Limits = { min: [number, number]; max: [number, number]; collapsible: "none" | "first" | "second"; collapsedSize: number; collapsed: boolean };

/** the least a pane may be: its own limit, and for the pane that folds more than its folded size */
const leastOf = (l: Limits, i: 0 | 1) => (l.collapsible === (i ? "second" : "first") ? Math.max(l.min[i], l.collapsedSize + 1) : l.min[i]);

/** How long the first pane is in `room` (what the divider leaves), as the editor's layout has it (lib/split.ts): the share
 *  kept inside both panes' limits, or a folding pane folded, by the design or below half way to its least. */
export function firstOf(share: number, room: number, l: Limits): { first: number; folded: boolean } {
  const most = (v: number) => (v > 0 ? v : Infinity);
  const raw = (Math.max(0, Math.min(100, share)) / 100) * room;
  const folds = (i: 0 | 1, own: number) => l.collapsible === (i ? "second" : "first") && (l.collapsed || own < (l.collapsedSize + leastOf(l, i)) / 2);
  if (folds(0, raw)) return { first: Math.min(room, l.collapsedSize), folded: true };
  if (folds(1, room - raw)) return { first: room - Math.min(room, l.collapsedSize), folded: true };
  const lo = Math.max(leastOf(l, 0), room - most(l.max[1]));
  const hi = Math.min(most(l.max[0]), room - leastOf(l, 1));
  return { first: Math.max(0, lo <= hi ? Math.max(lo, Math.min(hi, raw)) : Math.min(room, lo)), folded: false };
}

let count = 0;

/** the share a visitor left, from Taro's storage */
function kept(key: string | undefined): number | null {
  if (!key) return null;
  try {
    const v = Number(Taro.getStorageSync(key));
    return Taro.getStorageSync(key) !== "" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  } catch {
    return null;
  }
}

export function SplitView(props: SplitViewProps) {
  const p = withDefaults<SplitViewProps>("split-view", props);
  const fill = useFill();
  const [first, second] = Children.toArray(p.children);
  const [id] = useState(() => `m3e-split-${++count}`);
  /* a mini-program runs on a phone: its own width is the design's, or the window's when it fills its cell */
  const [width] = useState(() => {
    const own = fill.width === undefined ? p.width : undefined;
    try {
      return own ?? Taro.getSystemInfoSync().windowWidth;
    } catch {
      return own ?? 375;
    }
  });
  const vertical = p.orientation === "vertical" || (p.compact !== "keep" && width < (p.breakpoint ?? 600));
  const divider = p.divider === "gap" ? 8 : 1;
  const limits: Limits = { min: [p.minFirst ?? 0, p.minSecond ?? 0], max: [p.maxFirst ?? 0, p.maxSecond ?? 0], collapsible: p.collapsible ?? "none", collapsedSize: p.collapsedSize ?? 0, collapsed: false };
  const [share, setShare] = useState(() => kept(p.persistKey) ?? p.split ?? 50);
  /* the design's fold holds until the visitor moves the divider */
  const [folded, setFolded] = useState(!!p.collapsed && limits.collapsible !== "none");
  /* the box the finger drags across, measured when it lands */
  const [room, setRoom] = useState(0);
  const box = useRef({ start: 0, length: 0 });
  useEffect(() => {
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((r) => {
        const rect = Array.isArray(r) ? r[0] : r;
        if (rect) setRoom(Math.max(0, (vertical ? rect.height : rect.width) - divider));
      })
      .exec();
  }, [id, vertical, divider]);
  const at = room > 0 ? firstOf(share, room, { ...limits, collapsed: folded }).first : 0;
  const onStart = () => {
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((r) => {
        const rect = Array.isArray(r) ? r[0] : r;
        if (!rect) return;
        box.current = { start: vertical ? rect.top : rect.left, length: Math.max(1, (vertical ? rect.height : rect.width) - divider) };
        setRoom(box.current.length);
      })
      .exec();
  };
  /** the share where a finger is */
  const shareAt = (t: { clientX: number; clientY: number }) => Math.max(0, Math.min(100, (((vertical ? t.clientY : t.clientX) - box.current.start) / box.current.length) * 100));
  const onMove = (e: CommonEvent) => {
    const t = (e as unknown as ITouchEvent).touches?.[0];
    if (!t || !box.current.length) return;
    setFolded(false);
    setShare(shareAt(t));
  };
  /* where the finger left it, read off the event itself: the last move may not have been drawn yet */
  const onEnd = (e: CommonEvent) => {
    if (!box.current.length) return;
    const t = (e as unknown as ITouchEvent).changedTouches?.[0];
    const raw = t ? shareAt(t) : share;
    const v = Math.round((firstOf(raw, box.current.length, limits).first / box.current.length) * 10000) / 100;
    setShare(v);
    if (p.persistKey) Taro.setStorage({ key: p.persistKey, data: String(v) }).catch(() => {});
    p.onValueChange?.(v);
  };
  const base: CSS = {
    display: "flex",
    flexDirection: vertical ? "column" : "row",
    overflow: "hidden",
    boxSizing: "border-box",
    ...(fill.width === undefined && p.width !== undefined ? { width: p.width } : null),
    ...(fill.flexGrow === undefined && p.height !== undefined ? { height: p.height } : null),
    ...fill,
  };
  /* before it has been measured the share stands for the size */
  const along = room > 0 ? at : `${share}%`;
  const pane = (size?: number | string): CSS => ({
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    ...(size === undefined ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 } : vertical ? { height: size, flexShrink: 0 } : { width: size, flexShrink: 0 }),
  });
  return (
    <View id={id} {...tagOf(p.testID)} style={sx(base)}>
      <View style={sx(pane(along))}>
        <FillBoth>{first}</FillBoth>
      </View>
      <View
        ariaRole="slider"
        ariaLabel="Resize panes"
        catchMove
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
        style={sx({ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: "1", ...(vertical ? { height: divider } : { width: divider }), backgroundColor: p.divider === "gap" ? undefined : c("outline-variant") })}
      >
        {/* a finger's reach either side of a hairline */}
        <View style={sx({ position: "absolute", ...(vertical ? { left: 0, right: 0, top: -12, bottom: -12 } : { top: 0, bottom: 0, left: -12, right: -12 }) })} />
        {p.handle !== false ? <View style={sx({ position: "absolute", width: vertical ? 32 : 4, height: vertical ? 4 : 32, borderRadius: 2, backgroundColor: c("outline") })} /> : null}
      </View>
      <View style={sx(pane())}>
        <FillBoth>{second}</FillBoth>
      </View>
    </View>
  );
}
