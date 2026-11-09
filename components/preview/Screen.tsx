/* One screen of the preview: its parts laid out as the screen draws them, the body scrolling under what stays put at
 * its head and foot, what an effect opened floating over a scrim, what starts after a delay started when it comes on
 * show. A tap on a part (its place, its event, the pointer coming over it) goes to `onAction` with the part as the
 * screen drew it; the preview makes the tap of it and the interpreter runs it (components/Preview.tsx). */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIsPresent } from "motion/react";
import { GAP, STAY_TARGET, actionSlotsOf, canCollapseFab, frameLengthOf, frameSizeOf, groupBounds, sizeOf, takesDeviceBars, type Action, type Frame, type Group, type Item, type Palette, type Theme, type VarValue } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { pinOf } from "@/lib/tidy";
import { FOOT_GAP, footOf } from "@/lib/foot";
import { paneClips } from "@/lib/flow";
import { screenBackground } from "@/lib/styles";
import { INPUT_PROP, isOverlayPart, type FieldValue } from "@/lib/interact";
import type { TransportFile } from "@/lib/api/transport";
import { demoRuns, eventAction, eventOfKey, eventsOf, payloadOf, slotAction } from "@/lib/partContract";
import { partBySlug } from "@/parts/registry";
import { DeviceBars } from "../DeviceBars";
import { BoundValues } from "../boundValues";
import { boundTextIds, wordsHeight } from "../previewText";
import { LivePart } from "./LivePart";
import type { TapExtra } from "./host";
import { SPAWN_OF, SPAWN_SLOT, driveSpawns } from "@/lib/spawnDom";
import { spawnSpecOf, type Spawns } from "@/lib/spawn";
import { domainNow } from "@/parts/widgets/host";

/** a copy of a template no instance is drawn in yet: there, but not seen and not touched (lib/spawnDom.ts shows it) */
const SPAWN_HIDDEN = { visibility: "hidden", pointerEvents: "none" } as const;

export function Screen({
  active = true,
  frame,
  groups,
  widths,
  p,
  styled,
  onAction,
  values,
  onValue,
  opened,
  onField,
  onCloseOverlay,
  onScrim,
  bound,
  onFiles,
  onPull,
  onNearEnd,
  refreshing,
  onWordHeights,
  spawns = null,
}: {
  /** the instances spawned on events, which the screen draws in its templates' copies (lib/spawnDom.ts) */
  spawns?: Spawns | null;
  /** how tall bound words in an auto layout are drawn here, where that is not what the canvas measured (`${id}:h`) */
  onWordHeights?: (heights: Record<string, number>) => void;
  /** a file input of the screen took files */
  onFiles?: (it: Item, files: TransportFile[]) => void;
  /** the body was pulled down from its top: what loads on a pull loads again */
  onPull?: () => void;
  /** the body was scrolled to its end: what pages on scroll loads its next page */
  onNearEnd?: () => void;
  /** a pull's load is under way */
  refreshing?: boolean;
  active?: boolean;
  frame: Frame;
  groups: Group[];
  /** the variables as this screen shows them, for the design fields parts bind to them */
  bound: Record<string, VarValue> | null;
  widths: Record<string, number>;
  p: Palette;
  /** the theme in the mode this preview shows, for what the style draws behind a screen */
  styled: Theme;
  /** a tap on a part: its row, its element and its form go with it, and the place or event it came from; the preview
   *  adds the screen it is on */
  onAction: (a: Action, it?: Item, extra?: TapExtra) => void;
  values: Record<string, number>;
  onValue: (id: string, v: number) => void;
  /** the overlays an effect holds open, by item id */
  opened: Record<string, boolean>;
  onField: (it: Item, value: FieldValue) => void;
  onCloseOverlay: (id: string) => void;
  onScrim: () => void;
}) {
  /* a folding FAB folds on the way down and stays folded until the body scrolls back up */
  const [fabFolded, setFabFolded] = useState(false);
  const fabScrollTop = useRef(0);
  const lang = useLang();
  const isPresent = useIsPresent();
  const interactive = active && isPresent;
  const screenRef = useRef<HTMLDivElement>(null);
  /* bound words are as tall as they are wrapped, not as the canvas measured the design's words (components/previewText.ts):
     read once they are drawn, before they are shown, and laid out again with that height */
  const wordIds = useMemo(() => boundTextIds(groups), [groups]);
  useLayoutEffect(() => {
    const root = screenRef.current;
    if (!onWordHeights || !root || !wordIds.size) return;
    const items = new Map(groups.flatMap((g) => g.items.map((it) => [it.id, it] as const)));
    const next: Record<string, number> = {};
    for (const id of wordIds) {
      const el = root.querySelector<HTMLElement>(`[data-part="${CSS.escape(id)}"] [data-slot="text"]`);
      const it = items.get(id);
      const h = el && it ? wordsHeight(el) : null;
      if (h !== null && it && Math.abs(h - sizeOf(it, widths).h) >= 1) next[`${id}:h`] = h;
    }
    if (Object.keys(next).length) onWordHeights(next);
  }, [groups, widths, wordIds, onWordHeights]);
  /* A screen longer than the device scrolls its body under what stays put. Which end a part
   * stays with is the same rule a change of length goes by (`pinOf`): one at the head keeps its
   * place on the glass, one at the foot keeps its distance from the foot, so a navigation bar at
   * the bottom of the long screen sits at the bottom of the glass, and one left between the two
   * is part of the body and scrolls with it. A rail running the length is shown a screenful tall. */
  const viewH = frameSizeOf(frame).h;
  const authored = frameLengthOf(frame);
  /* A screen that loads data is as long as what the data makes of it: the list grows past the device and its body
   * scrolls, while what stands at its head and foot stays put. Any other screen is as long as it was drawn. */
  const loads = !!frame.data?.length;
  /* What stands at its foot stays on the glass: its bars, and the buttons standing loose there (lib/foot.ts). Its body
     ends far enough past its content for the last row to scroll clear of them. */
  const foot = loads ? footOf(frame, groups, widths) : null;
  const fixedPin = foot ? new Map([...groups.flatMap((g) => (pinOf(g, frame, widths) ? [[g.id, pinOf(g, frame, widths)!] as const] : [])), ...[...foot.floats].map((id) => [id, "foot"] as const)]) : null;
  const length = fixedPin && foot
    ? Math.max(authored, Math.ceil(Math.max(0, ...groups.filter((g) => !fixedPin.has(g.id)).map((g) => groupBounds(g, widths).b - frame.y)) + (foot.room || FOOT_GAP)))
    : authored;
  const scrolls = length > viewH;
  const pins = new Map<string, number>();
  if (scrolls) {
    for (const g of groups) {
      const pin = fixedPin ? (fixedPin.get(g.id) ?? null) : pinOf(g, frame, widths);
      /* what stands at the foot was put there for the screen's own length, not the length the data gives it */
      if (pin) pins.set(g.id, pin === "head" ? 0 : (fixedPin ? authored : length) - viewH);
    }
    /* what a pinned layout lays out stays put with it: a kit's bar is a box and the parts in it */
    const byId = new Map(groups.map((g) => [g.id, g]));
    const heldPin = (g: Group | undefined, depth = 0): number | undefined => {
      if (!g?.inFlow || depth > 32) return undefined;
      return pins.get(g.inFlow) ?? heldPin(byId.get(g.inFlow), depth + 1);
    };
    for (const g of groups) {
      if (pins.has(g.id)) continue;
      const lift = heldPin(g);
      if (lift !== undefined) pins.set(g.id, lift);
    }
  }
  /* what an effect opened floats over the screen: it stands on the glass, over a scrim, not on the body */
  const isOpen = (g: Group) => g.items.some((it) => opened[it.id]);
  const openGroups = groups.filter(isOpen);
  if (scrolls) for (const g of openGroups) if (!pins.has(g.id)) pins.set(g.id, 0);
  /* a menu dims nothing; a tap outside it still has to land on something that closes it */
  const dims = openGroups.some((g) => g.items.some((it) => opened[it.id] && partBySlug(it.component)?.open?.trigger === "hide"));
  const lift = (g: Group) => pins.get(g.id) ?? 0;
  /* A part that comes into a layout after the screen is up (a form's error, a "load more") shows once what is beside it
   * has moved over to make room, so it never stands over the part that is still on its way (src/index.css) */
  const arrived = useRef<{ ids: Set<string> | null; at: Map<string, number> }>({ ids: null, at: new Map() });
  const now = Date.now();
  const seen = arrived.current;
  if (seen.ids) for (const g of groups) if (g.inFlow && !seen.ids.has(g.id)) seen.at.set(g.id, now);
  seen.ids = new Set(groups.map((g) => g.id));
  const entering = (g: Group) => now - (seen.at.get(g.id) ?? -Infinity) < 400;
  /* what a split's pane holds is seen within the pane, as in the exported app */
  const clips = useMemo(() => paneClips(groups, widths), [groups, widths]);
  const hasFoldingFab = groups.some((g) => g.items.some((it) => canCollapseFab(it) && it.collapseOnScroll));
  const onBodyScroll = (e: { currentTarget: { scrollTop: number; scrollHeight?: number; clientHeight?: number } }) => {
    const top = e.currentTarget.scrollTop;
    const down = top - fabScrollTop.current;
    fabScrollTop.current = top;
    if (hasFoldingFab && down !== 0) setFabFolded(down > 0);
    const el = e.currentTarget;
    if (onNearEnd && down > 0 && el.scrollHeight !== undefined && el.clientHeight !== undefined && el.scrollHeight - top - el.clientHeight < 160) onNearEnd();
  };
  /* a pull down from the top of the body, by finger or by wheel, loads what loads on a pull */
  const pull = useRef<{ y: number; at: number } | null>(null);
  const onPullStart = onPull
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        const top = (e.currentTarget as HTMLElement).scrollTop ?? 0;
        pull.current = top <= 0 ? { y: e.clientY, at: 0 } : null;
      }
    : undefined;
  const onPullMove = onPull
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        if (pull.current) pull.current.at = e.clientY - pull.current.y;
      }
    : undefined;
  const onPullEnd = onPull
    ? () => {
        if (pull.current && pull.current.at > 64) onPull();
        pull.current = null;
      }
    : undefined;
  const wheelPull = useRef(0);
  const onPullWheel = onPull
    ? (e: React.WheelEvent<HTMLDivElement>) => {
        if (((e.currentTarget as HTMLElement).scrollTop ?? 0) > 0 || e.deltaY >= 0) return;
        wheelPull.current += -e.deltaY;
        if (wheelPull.current > 240) {
          wheelPull.current = 0;
          onPull();
        }
      }
    : undefined;
  /* the tap of the nearest container around a part that has one, for a part that does nothing of its own */
  const byGroup = new Map(groups.map((g) => [g.id, g]));
  const heldTap = (g: Group): { action: Action; item: Item } | undefined => {
    const it = g.items.length === 1 ? g.items[0] : undefined;
    const def = it && partBySlug(it.component);
    if (!it || !def || INPUT_PROP[def.slug] !== undefined || def.slots || def.open) return undefined;
    let at = g.inFlow ? byGroup.get(g.inFlow) : undefined;
    for (let i = 0; at && i < 16; i++) {
      const host = at.items.length === 1 ? at.items[0] : undefined;
      if (host?.action && !host.action.trigger) return { action: host.action, item: host };
      at = at.inFlow ? byGroup.get(at.inFlow) : undefined;
    }
    return undefined;
  };
  /* what starts after a delay starts once, when the screen comes on show; the parts and the handler are read as they are
     then, so a change of state does not start them again */
  const timed = useRef({ groups, onAction });
  timed.current = { groups, onAction };
  useEffect(() => {
    if (!interactive) return;
    const timers = timed.current.groups.flatMap((g) =>
      g.items.flatMap((it) => {
        const a = it.action;
        return a?.trigger?.on === "delay" ? [window.setTimeout(() => timed.current.onAction(a, it), a.trigger.ms)] : [];
      }),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [interactive]);
  /* the instances spawned on events, drawn in the copies of the screen's templates frame by frame on the app's clock:
     written to the page itself, so a spawn commits nothing (lib/spawnDom.ts) */
  const motions = useRef(new Map<string, string | undefined>());
  motions.current = new Map(groups.flatMap((g) => (g.spawn ? [[g.id, spawnSpecOf(g.spawn)?.motion] as const] : [])));
  const hasTemplates = groups.some((g) => g.spawnSlot);
  useEffect(() => {
    if (!spawns || !hasTemplates) return;
    return driveSpawns(() => screenRef.current, spawns, { now: domainNow, motion: (id) => motions.current.get(id) as never });
  }, [spawns, hasTemplates]);
  /* The editor behind the preview is inert while it is up, so focus has nowhere else to
   * go: a screen that becomes the one on show takes it when nothing inside the preview
   * holds it. */
  useEffect(() => {
    if (!interactive) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused.closest("[inert]")) screenRef.current?.focus();
  }, [interactive]);
  /* the body scrolls in a layer of its own, the length of the screen; what stays put is laid
   * over it, in the order the screen draws them */
  const inBody = (nodes: React.ReactElement[]) =>
    scrolls ? (
      <>
        <div
          data-scroll-body
          role="region"
          aria-label={`${frame.name || t("screen", lang)} content`}
          tabIndex={0}
          className="m3-hidden-scrollbar"
          onScroll={onBodyScroll}
          onPointerDown={onPullStart}
          onPointerMove={onPullMove}
          onPointerUp={onPullEnd}
          onPointerCancel={onPullEnd}
          onWheel={onPullWheel}
          style={{ position: "absolute", inset: 0, overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", touchAction: "pan-y" }}
        >
          <div style={{ position: "relative", height: length }}>{nodes.filter((_, i) => !pins.has(groups[i].id))}</div>
        </div>
        {nodes.filter((_, i) => pins.has(groups[i].id))}
      </>
    ) : onPull ? (
      <div data-pull-body onPointerDown={onPullStart} onPointerMove={onPullMove} onPointerUp={onPullEnd} onPointerCancel={onPullEnd} onWheel={onPullWheel} style={{ position: "absolute", inset: 0 }}>
        {nodes}
      </div>
    ) : (
      nodes
    );

  return (
    <div
      ref={screenRef}
      data-preview-screen={frame.id}
      data-preview-active={interactive ? "" : undefined}
      inert={!interactive}
      aria-hidden={!interactive || undefined}
      role="group"
      aria-label={frame.name || t("screen", lang)}
      tabIndex={-1}
      style={{ position: "absolute", inset: 0, background: screenBackground(p[frame.bg ?? "surface"], styled), overflow: "hidden", outline: "none" }}
    >
      {openGroups.length > 0 && <div data-preview-scrim aria-hidden onClick={onScrim} style={{ position: "absolute", inset: 0, zIndex: 1, background: dims ? "rgba(0,0,0,0.32)" : "transparent" }} />}
      <BoundValues.Provider value={bound}>
      {inBody(groups.map((g) => (
        <div
          key={g.id}
          className={entering(g) ? "m3-preview-group m3-preview-enter" : "m3-preview-group"}
          data-preview-group={g.id}
          {...(g.spawnSlot ? { [SPAWN_OF]: g.spawnSlot.of, [SPAWN_SLOT]: g.spawnSlot.slot } : {})}
          /* a part making room for one that appeared eases over; the rest of the time nothing moves */
          data-in-flow={g.inFlow ? "" : undefined}
          style={
            g.free
              ? { position: "absolute", left: g.x - frame.x, top: g.y - frame.y - lift(g), zIndex: isOpen(g) ? 2 : undefined, clipPath: clips.get(g.id), ...(g.spawnSlot ? SPAWN_HIDDEN : {}) }
              : {
                  position: "absolute",
                  left: g.x - frame.x,
                  top: g.y - frame.y - lift(g),
                  zIndex: isOpen(g) ? 2 : undefined,
                  clipPath: clips.get(g.id),
                  /* a split's pane is drawn over the split, not inside it: a press near the divider goes through it to
                     the divider, unless the pane does something of its own when tapped */
                  pointerEvents: g.splitPane && !g.items.some((it) => it.action || it.actions) ? "none" : undefined,
                  display: "flex",
                  flexDirection: g.axis === "x" ? "row" : "column",
                  alignItems: g.axis === "x" ? "center" : "stretch",
                  gap: GAP,
                  ...(g.spawnSlot ? SPAWN_HIDDEN : {}),
                }
          }
        >
          {g.items.map((it) => {
            const act = it.action;
            let shown = it;
            if (it.component === "navigation-rail" && pins.has(g.id)) shown = { ...shown, props: { ...shown.props, height: viewH } };
            /* The right edge stays authored while downward scrolling hides the label. */
            const foldable = scrolls && canCollapseFab(it) && !!it.collapseOnScroll;
            if (foldable && fabFolded) shown = { ...shown, props: { ...shown.props, collapsed: true } };
            /* an interaction that starts by the pointer or by time is no tap */
            const on = act?.trigger?.on;
            /* a part that does nothing of its own, inside a container that is tapped (a list's row), is a press on that
               container, as it is in the exported app where it is inside it */
            /* an event's action is no tap: what is wired to a place in the part is */
            const slotActions = it.actions && Object.keys(it.actions).some((k) => eventOfKey(k) === null) ? it.actions : undefined;
            const held = !act && !slotActions ? heldTap(g) : undefined;
            const tap = act && !on ? () => onAction(act, it) : held ? () => onAction(held.action, held.item) : undefined;
            const hover = act && on === "hover" ? () => onAction(act, it) : undefined;
            /* a part says which prop is its chosen entry (`selectKey`): a tap moves it. Destination
             *  bars share the choice across screens */
            const def = partBySlug(it.component);
            const selectKey = def?.selectKey;
            const navKey = def && selectKey && def.nav ? `nav:${def.slug}:${actionSlotsOf(it).map((s) => s.label).join("|")}` : "";
            if (selectKey) {
              const live = navKey
                ? values[navKey] !== undefined && values[navKey] >= 0
                  ? values[navKey]
                  : it.props?.[selectKey] === undefined
                    ? values[`${navKey}:opened:${frame.id}`]
                    : undefined
                : values[it.id] !== undefined && values[it.id] >= 0
                  ? values[it.id]
                  : undefined;
              if (live !== undefined) shown = { ...shown, props: { ...shown.props, [selectKey]: live } };
            }
            /* a rail the visitor expanded stays expanded while the screen is up */
            const railExpanded = values[`${it.id}:expanded`] !== undefined ? values[`${it.id}:expanded`] !== 0 : undefined;
            if (railExpanded !== undefined) shown = { ...shown, props: { ...shown.props, expanded: railExpanded } };
            const node = (
              <LivePart
                key={it.id}
                easeWidth={foldable}
                item={shown}
                widths={widths}
                screen={frameSizeOf(frame)}
                onField={INPUT_PROP[it.component ?? ""] ? (v) => onField(it, v) : undefined}
                onFiles={it.component === "file-upload" && onFiles ? (list) => onFiles(it, list) : undefined}
                /* an overlay with its own trigger opens by itself; only one an effect opened is held */
                held={!!opened[it.id] && !!def?.open && def.open.trigger !== "hide"}
                onClose={isOverlayPart(it) ? () => onCloseOverlay(it.id) : undefined}
                demo={demoRuns(it, "prototype")}
                onEvent={
                  eventsOf(it).length
                    ? (name, payload) => {
                        const e = eventsOf(it).find((x) => x.name === name);
                        const a = eventAction(it, name);
                        /* an action that runs on an event reads its payload as `event` */
                        if (e && a) onAction(a, it, { event: payloadOf(e, payload) });
                      }
                    : undefined
                }
                onTap={tap}
                onHover={hover}
                onSlot={
                  /* a part whose rows are no slots works on its own: a press here would only cancel it */
                  slotActions || (selectKey && def?.slots) || def?.slug === "navigation-rail"
                    ? (slot) => {
                        /* the menu button on a rail flips it open and shut */
                        if (slot === "rail") {
                          onValue(`${it.id}:expanded`, shown.props?.expanded === true ? 0 : 1);
                          return;
                        }
                        /* the slot's own action, else its family's, which reads the slot as `slot` */
                        const wired = slotAction(it, slot);
                        const a = wired?.action;
                        /* a tapped destination lights up where it opens nothing; where it opens a
                           screen, that screen's bar shows the destination its author chose, or the
                           tapped one when the author chose none */
                        if (selectKey && slot.startsWith("tab:")) {
                          /* a tab that only runs effects opens nothing, so it still lights up */
                          const opens = a && a.to !== STAY_TARGET;
                          onValue(navKey || it.id, opens ? -1 : Number(slot.slice(4)));
                          if (opens && navKey) onValue(`${navKey}:opened:${a.to}`, Number(slot.slice(4)));
                        }
                        if (wired) onAction(wired.action, it, wired.scope);
                        else tap?.();
                      }
                    : undefined
                }
              />
            );
            /* Keep the authored width as a right-aligned slot. The visual can then narrow from
             * its left edge while its right edge stays exactly where the author placed it. */
            const anchored = foldable
              ? (
                  <div
                    key={it.id}
                    style={{ width: sizeOf(it, widths).w, display: "flex", justifyContent: "flex-end", flex: "0 0 auto" }}
                  >
                    {node}
                  </div>
                )
              : node;
            if (!g.free) return anchored;
            const o = g.pos?.[it.id] ?? { x: 0, y: 0 };
            return (
              <div key={it.id} style={{ position: "absolute", left: o.x, top: o.y }}>
                {anchored}
              </div>
            );
          })}
        </div>
      )))}
      </BoundValues.Provider>
      {refreshing && (
        <div data-pull-refresh aria-hidden style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 4, width: 36, height: 36, borderRadius: 18, background: p.surfaceContainerHigh, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", display: "grid", placeItems: "center" }}>
          <div className="m3-spin" style={{ width: 20, height: 20, borderRadius: 10, border: `3px solid ${p.primary}`, borderTopColor: "transparent", animation: "m3e-spin 0.8s linear infinite" }} />
          <style>{"@keyframes m3e-spin { to { transform: rotate(360deg) } }"}</style>
        </div>
      )}
      {frame.deviceBars && takesDeviceBars(frame) && <DeviceBars p={p} bg={frame.bg ?? "surface"} height={viewH} zIndex={3} />}
    </div>
  );
}
