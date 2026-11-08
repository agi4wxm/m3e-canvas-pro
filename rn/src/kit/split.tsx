import { Children, useState, type ReactNode } from "react";
import { PanResponder, View, type AccessibilityActionEvent, type DimensionValue, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";

import type { PartBase } from "./atoms/basics";
import { FillDown, useFill } from "./layout";
import { withDefaults } from "./parts";
import { useKit } from "./theme/ThemeProvider";

/* A split view on a phone: two panes, both showing, and a divider a finger drags (PanResponder, as the kit's slider
 * is dragged). The panes are what the printer hands it, each a box that fills its pane and lays out what it holds.
 * The share is the visitor's own (UI state): it starts at the design's `split`, is handed out as `onValueChange` when
 * the finger lifts, and, when the design asks to remember it (`persistKey`), is kept for as long as the app runs, not
 * across launches (the export reports that). Narrower than `breakpoint`, a split that stacks lays its panes one over
 * the other, which is what a phone shows by default. The divider is `adjustable` for a screen reader: swipe up and
 * down to move it, and activate it to fold the pane that folds. */

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
  /** where the visitor's share is kept while the app runs, when it is to be remembered */
  persistKey?: string;
  width?: number;
  height?: number;
  onValueChange?: (share: number) => void;
  children?: ReactNode;
};

/** the shares visitors left, while the app runs */
const KEPT = new Map<string, number>();

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

export function SplitView(props: SplitViewProps) {
  const p = withDefaults<SplitViewProps>("split-view", props);
  const kit = useKit();
  const fill = useFill();
  const [first, second] = Children.toArray(p.children);
  const [size, setSize] = useState({ w: p.width ?? 0, h: p.height ?? 0 });
  const vertical = p.orientation === "vertical" || (p.compact !== "keep" && size.w > 0 && size.w < (p.breakpoint ?? 600));
  const divider = p.divider === "gap" ? 8 : 1;
  const room = Math.max(0, (vertical ? size.h : size.w) - divider);
  const limits: Limits = {
    min: [p.minFirst ?? 0, p.minSecond ?? 0],
    max: [p.maxFirst ?? 0, p.maxSecond ?? 0],
    collapsible: p.collapsible ?? "none",
    collapsedSize: p.collapsedSize ?? 0,
    collapsed: false,
  };
  const [share, setShare] = useState(() => (p.persistKey && KEPT.has(p.persistKey) ? KEPT.get(p.persistKey)! : (p.split ?? 50)));
  /* the design's fold holds until the visitor moves the divider */
  const [folded, setFolded] = useState(!!p.collapsed && limits.collapsible !== "none");
  const { first: at } = firstOf(share, room, { ...limits, collapsed: folded });
  const settle = (next: number) => {
    const v = Math.round(Math.max(0, Math.min(100, next)) * 100) / 100;
    setFolded(false);
    setShare(v);
    if (p.persistKey) KEPT.set(p.persistKey, v);
    p.onValueChange?.(v);
    return v;
  };
  /* Where the finger took hold: the first pane's length then, and the finger's place on the page. The responder is made
     afresh each time the view is drawn (as the kit's slider's is), so it reads the page's coordinates, never a running
     total of its own. */
  const [grab, setGrab] = useState<{ from: number; at: number } | null>(null);
  const pageAt = (e: GestureResponderEvent) => (vertical ? e.nativeEvent.pageY : e.nativeEvent.pageX);
  /* where the finger left it, read off the event itself: the last move may not have been drawn yet */
  const release = (e: GestureResponderEvent) => {
    const raw = grab && room > 0 ? ((grab.from + pageAt(e) - grab.at) / room) * 100 : share;
    setGrab(null);
    settle(room > 0 ? (firstOf(raw, room, limits).first / room) * 100 : raw);
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (e) => setGrab({ from: at, at: pageAt(e) }),
    onPanResponderMove: (e) => {
      if (!grab || room <= 0) return;
      setFolded(false);
      setShare(Math.max(0, Math.min(100, ((grab.from + pageAt(e) - grab.at) / room) * 100)));
    },
    onPanResponderRelease: release,
    onPanResponderTerminate: release,
  });
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === "increment") settle(share + 5);
    else if (name === "decrement") settle(share - 5);
    else if (name === "activate" && limits.collapsible !== "none") {
      if (folded || firstOf(share, room, limits).folded) settle(50);
      else setFolded(true);
    }
  };
  const base: ViewStyle = {
    flexDirection: vertical ? "column" : "row",
    overflow: "hidden",
    ...(fill.width === undefined && p.width !== undefined ? { width: p.width } : null),
    ...(fill.flexGrow === undefined && p.height !== undefined ? { height: p.height } : null),
    ...fill,
  };
  /* before it has been measured the share stands for the size */
  const along = (px: number): DimensionValue => (room > 0 ? px : `${share}%`);
  const line = kit.colors["outline-variant"];
  const grip = kit.colors.outline;
  return (
    <View testID={p.testID} style={base} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View testID={p.testID ? `${p.testID}-first` : undefined} style={{ ...(vertical ? { height: along(at) } : { width: along(at) }), overflow: "hidden" }}>
        <FillDown across>{first}</FillDown>
      </View>
      <View
        testID={p.testID ? `${p.testID}-divider` : undefined}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Resize panes"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(room > 0 ? (at / room) * 100 : share) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }, ...(limits.collapsible !== "none" ? [{ name: "activate" }] : [])]}
        onAccessibilityAction={onAction}
        hitSlop={vertical ? { top: 12, bottom: 12 } : { left: 12, right: 12 }}
        style={{ ...(vertical ? { height: divider } : { width: divider }), backgroundColor: p.divider === "gap" ? undefined : line, alignItems: "center", justifyContent: "center", zIndex: 1 }}
        {...pan.panHandlers}
      >
        {p.handle !== false ? <View style={{ position: "absolute", width: vertical ? 32 : 4, height: vertical ? 4 : 32, borderRadius: 2, backgroundColor: grip }} /> : null}
      </View>
      <View testID={p.testID ? `${p.testID}-second` : undefined} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, overflow: "hidden" }}>
        <FillDown across>{second}</FillDown>
      </View>
    </View>
  );
}
