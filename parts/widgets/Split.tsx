import { Children, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { GroupImperativeHandle, Layout, LayoutChangedMeta, PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/m3e/resizable";
import { cn } from "@/lib/m3e/cn";
import { useHost, useRemember, type HostProps } from "./host";
import type { Look } from "./look";

/* A split view: two panes and the divider between them, on react-resizable-panels (the shadcn M3E Resizable). The
 * divider is the library's separator: focusable, `role="separator"` with its value, range and the pane it sizes, the
 * arrow keys, Home and End, Enter to fold a pane that folds, a double click to go back to where it started. Sizes are
 * percentages of the room ("40%"), limits pixels ("240px"): the library reads a bare number as pixels.
 *
 * What a visitor drags is their own share, UI state: it is handed out as the part's input (`onValueChange`, or the
 * preview's host, which lays the panes' parts out again by it) and, when the drag is over, as the `resize` event. It
 * starts from `defaultSplit`, the design's, each time the view is drawn, unless `persist` names where the visitor's
 * share is kept on their device and the host lets it be kept. Narrower than `breakpoint`, a view that stacks lays
 * its panes one over the other through the library's own orientation, so the drag runs along the new axis. */

type Side = "first" | "second";
type Kept = { split: number; collapsed?: boolean };

/** the room the divider takes, as the editor's layout has it (lib/split.ts DIVIDER_SIZE) */
const GAP_CLASS = "w-2 bg-transparent aria-[orientation=horizontal]:h-2";

const round2 = (v: number) => Math.round(v * 100) / 100;

function readKept(key: string | undefined): Kept | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null") as Kept | null;
    return v && typeof v.split === "number" && Number.isFinite(v.split) && v.split >= 0 && v.split <= 100 ? v : null;
  } catch {
    return null;
  }
}

function keep(key: string, value: Kept) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a browser that keeps nothing (private mode, a full store) starts from the design next time */
  }
}

export type SplitViewProps = {
  orientation?: "horizontal" | "vertical";
  /** the design's share of the first pane, 0–100 */
  defaultSplit?: number;
  /** the share when the app holds it (a variable the divider is bound to): the divider follows it */
  split?: number;
  minFirst?: number;
  maxFirst?: number;
  minSecond?: number;
  maxSecond?: number;
  /** the pane that folds away, if either */
  collapsible?: Side;
  collapsedSize?: number;
  defaultCollapsed?: boolean;
  divider?: "line" | "gap";
  handle?: boolean;
  compact?: "stack" | "keep";
  breakpoint?: number;
  /** where the visitor's share is kept on their device, when it is to be remembered */
  persist?: string;
  /** what the divider is called for a screen reader */
  label?: string;
  /** the two panes */
  children?: ReactNode;
} & HostProps &
  Look;

export function SplitView({ orientation = "horizontal", defaultSplit: designed = 50, split: held, minFirst, maxFirst, minSecond, maxSecond, collapsible, collapsedSize = 0, defaultCollapsed = false, divider = "line", handle = true, compact = "stack", breakpoint = 600, persist, label = "Resize panes", children, demo, onValueChange, onEvent, className, style }: SplitViewProps) {
  const host = useHost({ demo, onValueChange, onEvent });
  const defaultSplit = typeof held === "number" && Number.isFinite(held) ? Math.max(0, Math.min(100, held)) : designed;
  const remember = useRemember() && !!persist;
  const [first, second] = Children.toArray(children);
  /* the panels' ids are the page's: two split views on one page must not share them */
  const own = useId();
  const ids = { first: `${own}first`, second: `${own}second` };
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const firstRef = useRef<PanelImperativeHandle | null>(null);
  const secondRef = useRef<PanelImperativeHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /* Where it starts, read once: what the visitor last left, else the design. The library takes a panel's default
     size again whenever it changes, which would pull the divider back under a drag; a later design moves it below. */
  const [start] = useState(() => {
    const kept = remember ? readKept(persist) : null;
    return { split: kept?.split ?? defaultSplit, folded: kept ? !!kept.collapsed : defaultCollapsed && !!collapsible };
  });
  /* narrower than its breakpoint it stacks; the first guess is its own width, so it does not draw sideways first */
  const wide = typeof style?.width === "number" ? style.width : undefined;
  const [narrow, setNarrow] = useState(() => compact === "stack" && wide !== undefined && wide < breakpoint);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || compact !== "stack" || typeof ResizeObserver === "undefined") return;
    /* its own width, not as a scaled preview draws it */
    const look = () => {
      if (el.offsetWidth > 0) setNarrow(el.offsetWidth < breakpoint);
    };
    look();
    const watch = new ResizeObserver(look);
    watch.observe(el);
    return () => watch.disconnect();
  }, [compact, breakpoint]);
  const vertical = orientation === "vertical" || (compact === "stack" && narrow);

  /* the shares the visitor's drag handed out: the same values coming back as the design are not the design moving */
  const reported = useRef(new Set<number>());
  const dragging = useRef(false);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const report = (share: number) => {
    reported.current.add(share);
    if (reported.current.size > 64) reported.current = new Set([share]);
    host.input(share);
  };
  const shareOf = (layout: Layout) => (typeof layout[ids.first] === "number" ? round2(layout[ids.first]) : null);
  /* while the divider is dragged, the panes' parts follow once a frame */
  const onLayoutChange = (layout: Layout) => {
    const share = shareOf(layout);
    if (!dragging.current || share === null) return;
    pending.current = share;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current !== null) report(pending.current);
      pending.current = null;
    });
  };
  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    dragging.current = false;
    const split = shareOf(layout);
    if (!meta.isUserInteraction || split === null) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    const collapsed = collapsible === "first" ? !!firstRef.current?.isCollapsed() : collapsible === "second" ? !!secondRef.current?.isCollapsed() : false;
    report(split);
    host.emit("resize", { split, collapsed });
    if (remember && persist) keep(persist, { split, collapsed });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /* The design moving after the view is drawn (a variable it is bound to, in an app): the divider goes there. What the
     visitor's own drag handed out, coming back, is left alone. */
  const drawn = useRef({ split: defaultSplit, folded: defaultCollapsed });
  useEffect(() => {
    const was = drawn.current;
    drawn.current = { split: defaultSplit, folded: defaultCollapsed };
    if (defaultSplit !== was.split && !reported.current.has(defaultSplit)) {
      reported.current.clear();
      groupRef.current?.setLayout({ [ids.first]: defaultSplit, [ids.second]: 100 - defaultSplit });
    }
    if (defaultCollapsed !== was.folded && collapsible) {
      const pane = collapsible === "first" ? firstRef.current : secondRef.current;
      if (defaultCollapsed) pane?.collapse();
      else pane?.expand();
    }
  }, [defaultSplit, defaultCollapsed, collapsible, ids.first, ids.second]);

  /* Enter folds the pane before the divider (the library's own); the one after it folds here */
  const onDividerKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || collapsible !== "second") return;
    const pane = secondRef.current;
    if (!pane) return;
    dragging.current = true;
    if (pane.isCollapsed()) pane.expand();
    else pane.collapse();
  };

  const px = (v: number | undefined) => (v ? `${Math.round(v)}px` : undefined);
  /** the least a folding pane may be is more than it folds to: the library folds a pane dragged below its least */
  const least = (side: Side, limit: number | undefined) => (collapsible === side ? px(Math.max(limit ?? 0, collapsedSize + 1)) : px(limit));
  const size = (side: Side): string | undefined => {
    if (start.folded && collapsible === side) return `${Math.round(collapsedSize)}px`;
    if (start.folded) return undefined;
    return `${round2(side === "first" ? start.split : 100 - start.split)}%`;
  };
  const panel = (side: Side, content: ReactNode) => (
    <ResizablePanel
      id={ids[side]}
      panelRef={side === "first" ? firstRef : secondRef}
      data-split-pane={side}
      defaultSize={size(side)}
      minSize={least(side, side === "first" ? minFirst : minSecond)}
      maxSize={px(side === "first" ? maxFirst : maxSecond)}
      collapsible={collapsible === side || undefined}
      collapsedSize={collapsible === side ? `${Math.round(collapsedSize)}px` : undefined}
      className="flex flex-col"
    >
      {content}
    </ResizablePanel>
  );
  return (
    <ResizablePanelGroup
      data-split-view=""
      data-orientation={vertical ? "vertical" : "horizontal"}
      orientation={vertical ? "vertical" : "horizontal"}
      groupRef={groupRef}
      elementRef={rootRef}
      onLayoutChange={onLayoutChange}
      onLayoutChanged={onLayoutChanged}
      onPointerDownCapture={() => (dragging.current = true)}
      onKeyDownCapture={() => (dragging.current = true)}
      className={cn("overflow-hidden", className)}
      style={style}
    >
      {panel("first", first)}
      <ResizableHandle withHandle={handle} aria-label={label} data-split-divider={divider} className={divider === "gap" ? GAP_CLASS : undefined} onKeyDown={onDividerKey} />
      {panel("second", second)}
    </ResizablePanelGroup>
  );
}
