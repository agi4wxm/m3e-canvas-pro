
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/tokens";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, useIsPresent } from "motion/react";
import type { Variants } from "motion/react";
import {
  Action,
  ActionBody,
  Motion,
  BACK_TARGET,
  LINK_TARGET,
  STAY_TARGET,
  VarValue,
  linkUrlOf,
  BEZEL,
  Doc,
  Frame,
  FramePreset,
  GAP,
  Group,
  PHONE_H,
  PHONE_R,
  PHONE_W,
  Palette,
  SLIDE_SPEC,
  SWIPE_DIRS,
  SwipeDir,
  Theme,
  Transition,
  fontFamilyOf,
  frameLengthOf,
  framePresetOf,
  canCollapseFab,
  frameRadius,
  frameSizeOf,
  groupsInFrame,
  isPhoneFrame,
  normalizeTheme,
  paletteOf,
  sizeOf,
  takesDeviceBars,
} from "@/lib/tokens";
import { DeviceBars } from "./DeviceBars";
import { Icon } from "./Icon";
import { PartView } from "./PartView";
import { partBySlug, reader } from "@/parts/registry";
import { PartThemeContext, usePartTheme } from "@/parts/theme";
import { roleOf } from "@/parts/role";
import { actionSlotsOf, darkVarOf } from "@/lib/tokens";
import { screenBackground } from "@/lib/styles";
import { t, useLang } from "@/lib/i18n";
import { pinOf } from "@/lib/tidy";
import { INPUT_PROP, PreviewState, applyEffects, chooseBranch, closeOpened, inRow, isOverlayPart, leftRow, liveGroups, scopeOf, screenVars, startState, writeField } from "@/lib/interact";
import type { Effect, Group as DocGroup } from "@/lib/tokens";
import { groupBounds } from "@/lib/tokens";
import type { Transport, TransportFile } from "@/lib/api/transport";
import { BindingEngine, emptyBindings, screenScope, type BindingState } from "@/lib/bindings/runtime";
import { boundScreen, formsOf, readForm, type BoundScreen } from "@/lib/bindings/view";
import { endpointOf, paramsOf as endpointParamsOf } from "@/lib/bindings/contract";
import { evaluate, type Scope } from "@/lib/bindings/expr";
import { fallbackTransport } from "@/lib/bindings/transport";
import { BoundValues } from "./boundValues";
import { MockLogPanel, MockScenarioSwitch, PreviewMocksContext, usePreviewMocks } from "./MockPreview";
import { PRESETS, variantFor } from "@/lib/variants";
import { flowStarts } from "@/lib/prototype";
import { EASE, SLIDE_S as SLIDE_MS, screenPoses, type ScreenMove } from "@/lib/screenMotion";

/** room reserved for the wide preview controls: panel, right margin and breathing space */
const WIDE_CONTROL_SPACE = 220;
/** the strip the controls take along the bottom of a phone */
const PHONE_BAR_H = 56;

/** how the current screen was reached, so "back" can play it in reverse, and what it was opened with */
type Entry = { id: string; t: Transition; m?: Motion; params?: Record<string, unknown> };

const pct = (v: number) => `${v * 100}%`;

/* Each change of screen plays the poses an exported app plays too (lib/screenMotion.ts): Figma's animation where the
 * action has one, else its older transition, backwards for going back. */
const screenVariants: Variants = {
  initial: (c: ScreenMove) => screenPoses(c).initial,
  animate: (c: ScreenMove) => screenPoses(c).animate,
  exit: (c: ScreenMove) => screenPoses(c).exit,
};

/* the destination bars: a tap on their destination is shared with the bar of the same entries on
 * every other screen */
const NAV_PARTS = new Set(["navigation-bar", "navigation-rail", "tabs"]);

/** the buttons inside an overlay that dismiss it, whichever overlay it is */
const CLOSERS = '[data-slot$="-close"], [data-slot="alert-dialog-cancel"], [data-slot="alert-dialog-action"]';

/** what an input part holds right now, read off the page: a base-ui control keeps its value to itself,
 *  so the page is the one place every kind of input can be asked the same way */
function readInput(root: HTMLElement, it: Item): VarValue | undefined {
  const def = partBySlug(it.component);
  switch (it.component) {
    case "input":
    case "text-field":
    case "textarea":
      return root.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.value;
    case "switch":
      return root.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true";
    case "checkbox":
      return root.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true";
    case "slider": {
      const v = Number(root.querySelector<HTMLInputElement>('input[type="range"]')?.value);
      return Number.isFinite(v) ? v : undefined;
    }
    case "radio-group":
      return [...root.querySelectorAll('[role="radio"]')].findIndex((r) => r.getAttribute("aria-checked") === "true");
    case "select": {
      const text = root.querySelector('[data-slot="select-value"]')?.textContent?.trim();
      return def ? reader(def, it.props).list("items").findIndex((row) => row.label === text) : undefined;
    }
    default:
      return undefined;
  }
}

/** the files a file input holds, as the transport carries them: their bytes as data URLs, at most 25 MB each */
async function readFiles(root: HTMLElement): Promise<TransportFile[]> {
  const files = [...(root.querySelector<HTMLInputElement>('input[type="file"]')?.files ?? [])].slice(0, 10);
  const out: TransportFile[] = [];
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) continue;
    const dataUrl = await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(typeof r.result === "string" ? r.result : "");
      r.onerror = () => ok("");
      r.readAsDataURL(f);
    });
    if (dataUrl) out.push({ name: f.name, type: f.type || "application/octet-stream", dataUrl, size: f.size });
  }
  return out;
}

/** A real shadcn M3E component in the preview: it works. A press lands where it was aimed --
 *  on a place the part marked `data-tap` (a destination, a menu item) it fires that slot's
 *  action; anywhere else it is the part's own tap. An input says what it now holds, a button
 *  inside an overlay that dismisses it closes it. */
function LivePart({ item, widths, screen, onTap, onSlot, onHover, easeWidth, onField, onFiles, onClose, held }: { item: Item; widths: Record<string, number>; screen?: { w: number; h: number }; onTap?: () => void; onSlot?: (slot: string) => void; /** the pointer came over it: an interaction that starts so */ onHover?: () => void; easeWidth?: boolean; onField?: (value: VarValue) => void; /** a file input took files */ onFiles?: (files: TransportFile[]) => void; onClose?: () => void; held?: boolean }) {
  const size = sizeOf(item, widths);
  const input = !!INPUT_PROP[item.component ?? ""];
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const slot = target.closest?.("[data-tap]")?.getAttribute("data-tap");
    /* a place that works by itself (the arrow that opens a split button's menu) is no press on the part */
    if (slot === "self") return;
    /* a place that answers to nothing of its own (a row of a list item with one action on the whole part) is still a press on the part */
    if (slot != null && onSlot) onSlot(slot);
    else onTap?.();
    /* a menu an effect holds open has no way to close itself: any press on it ends it */
    if (held || target.closest?.(CLOSERS)) onClose?.();
    /* a press on a labelled input is how it changes: stopping it would freeze the control */
    if ((onTap || onSlot) && !input) e.preventDefault();
  };
  const box = useRef<HTMLDivElement>(null);
  const live = useRef({ item, onField });
  live.current = { item, onField };
  /* the value this input last reported, told apart from one a button put in its variable: an input
   * is uncontrolled, so that one only reaches it by drawing it afresh */
  const key = INPUT_PROP[item.component ?? ""];
  const value = key ? item.props?.[key] : undefined;
  const own = useRef(value);
  const seen = useRef(value);
  const redraw = useRef(0);
  if (value !== seen.current) {
    seen.current = value;
    if (value !== own.current) {
      own.current = value;
      redraw.current++;
    }
  }
  const slug = item.component;
  const files = useRef(onFiles);
  files.current = onFiles;
  useEffect(() => {
    const root = box.current;
    if (!root || slug !== "file-upload") return;
    const took = () => void readFiles(root).then((list) => files.current?.(list));
    root.addEventListener("change", took);
    return () => root.removeEventListener("change", took);
  }, [slug]);
  useEffect(() => {
    const root = box.current;
    if (!root || !input) return;
    const sync = () => {
      const now = readInput(root, live.current.item);
      if (now === undefined) return;
      own.current = now;
      live.current.onField?.(now);
    };
    /* typing is an event; a slider's thumb, a switch and a chosen row show only on the page */
    const watch = new MutationObserver(sync);
    watch.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-checked", "aria-valuenow"] });
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    return () => {
      watch.disconnect();
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
    };
  }, [input, slug]);
  return (
    <div
      ref={box}
      data-live-part
      data-part={item.id}
      onClick={onTap || onSlot || onClose ? click : undefined}
      onPointerEnter={onHover ? () => onHover() : undefined}
      /* a tap on the whole part is a button for the keyboard too; what is focusable inside it answers for itself, its click reaching `click` */
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={
        onTap
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              onTap();
            }
          : undefined
      }
      style={{ position: "relative", display: "flex", flex: "0 0 auto", width: easeWidth ? "max-content" : size.w, height: size.h }}>
      <PartView key={`${redraw.current}:${held ? 1 : 0}`} item={item} live screen={screen} held={held} />
    </div>
  );
}

function Screen({
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
}: {
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
  /** a tap on a part: its row, its element and its form go with it */
  onAction: (a: Action, it?: Item) => void;
  values: Record<string, number>;
  onValue: (id: string, v: number) => void;
  /** the overlays an effect holds open, by item id */
  opened: Record<string, boolean>;
  onField: (it: Item, value: VarValue) => void;
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
  const fixedPin = loads ? new Map(groups.flatMap((g) => (pinOf(g, frame, widths) ? [[g.id, pinOf(g, frame, widths)!] as const] : []))) : null;
  const length = fixedPin
    ? Math.max(
        authored,
        Math.ceil(
          Math.max(0, ...groups.filter((g) => !fixedPin.has(g.id)).map((g) => groupBounds(g, widths).b - frame.y)) +
            groups.filter((g) => fixedPin.get(g.id) === "foot").reduce((h, g) => Math.max(h, groupBounds(g, widths).b - groupBounds(g, widths).t), 0) +
            24,
        ),
      )
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
          className="m3-preview-group"
          data-preview-group={g.id}
          /* a part making room for one that appeared eases over; the rest of the time nothing moves */
          data-in-flow={g.inFlow ? "" : undefined}
          style={
            g.free
              ? { position: "absolute", left: g.x - frame.x, top: g.y - frame.y - lift(g), zIndex: isOpen(g) ? 2 : undefined }
              : {
                  position: "absolute",
                  left: g.x - frame.x,
                  top: g.y - frame.y - lift(g),
                  zIndex: isOpen(g) ? 2 : undefined,
                  display: "flex",
                  flexDirection: g.axis === "x" ? "row" : "column",
                  alignItems: g.axis === "x" ? "center" : "stretch",
                  gap: GAP,
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
            const held = !act && !it.actions ? heldTap(g) : undefined;
            const tap = act && !on ? () => onAction(act, it) : held ? () => onAction(held.action, held.item) : undefined;
            const hover = act && on === "hover" ? () => onAction(act, it) : undefined;
            const slotActions = it.actions;
            /* a part says which prop is its chosen entry (`selectKey`): a tap moves it. Destination
             *  bars share the choice across screens */
            const def = partBySlug(it.component);
            const selectKey = def?.selectKey;
            const navKey = def && selectKey && NAV_PARTS.has(def.slug) ? `nav:${def.slug}:${actionSlotsOf(it).map((s) => s.label).join("|")}` : "";
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
                        const a = slotActions?.[slot];
                        /* a tapped destination lights up where it opens nothing; where it opens a
                           screen, that screen's bar shows the destination its author chose, or the
                           tapped one when the author chose none */
                        if (selectKey && slot.startsWith("tab:")) {
                          /* a tab that only runs effects opens nothing, so it still lights up */
                          const opens = a && a.to !== STAY_TARGET;
                          onValue(navKey || it.id, opens ? -1 : Number(slot.slice(4)));
                          if (opens && navKey) onValue(`${navKey}:opened:${a.to}`, Number(slot.slice(4)));
                        }
                        if (a) onAction(a, it);
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

/** the screen being pulled in by a swipe, and the slide it arrives with */
type Peek = { frameId: string; t: Transition };

/** how long a snackbar stands, M3's short duration */
const SNACK_MS = 4000;

/** the parts inside it are drawn in the mode the preview's own switch is on */
function PreviewTheme({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  const theme = usePartTheme();
  return <PartThemeContext.Provider value={theme.dark === dark ? theme : { ...theme, dark }}>{children}</PartThemeContext.Provider>;
}

export function Preview({
  doc,
  widths,
  palette,
  startId,
  onClose,
  transport,
}: {
  doc: Doc;
  widths: Record<string, number>;
  palette: Palette;
  startId: string | null;
  onClose: () => void;
  /** what the preview's calls to the API go through (the mock library); a stand-in when none is given */
  transport?: Transport;
}) {
  const lang = useLang();
  const frames = doc.frames;
  /* the API answered by the mock library for this preview session (components/MockPreview.tsx) */
  const mocks = usePreviewMocks(doc);
  const [logOpen, setLogOpen] = useState(false);
  /* with no screen chosen, the preview starts where the first flow does */
  const [stack, setStack] = useState<Entry[]>(() => [{ id: startId ?? flowStarts(frames)[0]?.id ?? frames[0]?.id ?? "", t: "none" }]);
  /** a screen laid over the one on show by an interaction, and how it came in */
  const [overlay, setOverlay] = useState<Entry | null>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const [anim, setAnim] = useState<ScreenMove>({ transition: "none", backwards: false });
  const theme = normalizeTheme(doc.theme);
  const spring = theme.motion === "expressive";
  const [scale, setScale] = useState(1);
  const [values, setValues] = useState<Record<string, number>>({});
  const [peek, setPeek] = useState<Peek | null>(null);
  /* the prototype's state starts over each time the preview opens, and is never written to the document */
  const [state, setStateNow] = useState<PreviewState>(() => startState(doc.vars, doc.collections, theme.dark));
  /* the width the visitor switched to; until then each screen shows at its own size */
  const [device, setDevice] = useState<FramePreset | null>(null);
  /** the sibling of a screen at the width chosen: navigation keeps naming the screen it was written for */
  const shownId = useCallback((id: string) => (device ? (variantFor(frames, id, device)?.id ?? id) : id), [device, frames]);
  /* every size of a screen is laid out on its own, so the switch is only there when there is something to switch to */
  const hasSizes = frames.some((f) => f.variantOf);
  const stateRef = useRef(state);
  /* a tap reads what the one before it just wrote, whether or not React has drawn it yet */
  const setState = useCallback((next: PreviewState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setStateNow(next);
  }, []);
  /* a look at the other mode, for this preview only; a variable that drives the dark mode is that mode, so a tap that
     sets it switches the theme, and so does the bar's own button */
  const [ownDark, setOwnDark] = useState(theme.dark);
  const darkVar = darkVarOf(doc.vars);
  const dark = darkVar ? !!state.vars[darkVar.id] : ownDark;
  const toggleDark = () => (darkVar ? setState({ ...stateRef.current, vars: { ...stateRef.current.vars, [darkVar.id]: !stateRef.current.vars[darkVar.id] } }) : setOwnDark((d) => !d));
  const p = dark === theme.dark ? palette : paletteOf(doc.paletteKey, doc.customPalette, { ...theme, dark });
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const swiped = useRef(false);

  const top = stack[stack.length - 1];
  const current = frames.find((f) => f.id === (top ? shownId(top.id) : undefined)) ?? frames[0];
  const peekFrame = peek ? frames.find((f) => f.id === peek.frameId) : undefined;
  /* what a tap reads, whenever it comes: the screen on show and the mode the preview is in */
  const frameRef = useRef(current);
  frameRef.current = current;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const { w: frameW, h: frameH } = current ? frameSizeOf(current) : { w: PHONE_W, h: PHONE_H };
  const phone = current ? isPhoneFrame(current) : true;
  /* every screen sits in the same bezel; only the corners tell a phone from a window */
  const radius = current ? frameRadius(current) : PHONE_R;
  const outerW = frameW + BEZEL * 2;
  const outerH = frameH + BEZEL * 2;
  const targetFrame = peekFrame ?? current;
  const { w: targetFrameW, h: targetFrameH } = targetFrame ? frameSizeOf(targetFrame) : { w: frameW, h: frameH };
  const targetRadius = targetFrame ? frameRadius(targetFrame) : radius;
  const targetOuterW = targetFrameW + BEZEL * 2;
  const targetOuterH = targetFrameH + BEZEL * 2;

  /* The shell is the size of the screen on show. When the screen changes it eases to
   * the new size in step with the slide; a tracked swipe steers it toward the target
   * with the finger, so a phone and a desktop screen hand over without a snap. */
  const prog = useMotionValue(0);
  const shellW = useMotionValue(outerW);
  const shellH = useMotionValue(outerH);
  const screenRadius = useMotionValue(radius);
  useEffect(() => {
    const opts = { duration: SLIDE_MS, ease: EASE };
    const runs = [animate(shellW, outerW, opts), animate(shellH, outerH, opts), animate(screenRadius, radius, opts)];
    return () => runs.forEach((r) => r.stop());
  }, [outerW, outerH, radius, shellW, shellH, screenRadius]);
  useEffect(
    () =>
      prog.on("change", (v) => {
        if (!peekRef.current) return;
        shellW.set(outerW + (targetOuterW - outerW) * v);
        shellH.set(outerH + (targetOuterH - outerH) * v);
        screenRadius.set(radius + (targetRadius - radius) * v);
      }),
    [prog, outerW, outerH, radius, targetOuterW, targetOuterH, targetRadius, shellW, shellH, screenRadius],
  );
  const screenW = useTransform(shellW, (v) => v - BEZEL * 2);
  const screenH = useTransform(shellH, (v) => v - BEZEL * 2);
  const shellRadius = useTransform(screenRadius, (v) => v + BEZEL);
  /* on a wide window the controls stand in a column at the right edge, clear of the phone;
   * on a phone they stay along the bottom, where the frame fills the width anyway */
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 720);
  /* the stage is sized for the largest screen in the document, so the scale never changes while a
   * swipe crosses sizes or a screen is opened from the picker. On a phone the screen on show fills the
   * window instead: a desktop size elsewhere in the document would leave it the size of a stamp */
  const onStage = wide || !current ? frames : [current];
  const maxOuterW = Math.max(outerW, ...onStage.map((f) => frameSizeOf(f).w + BEZEL * 2));
  const maxOuterH = Math.max(outerH, ...onStage.map((f) => frameSizeOf(f).h + BEZEL * 2));
  const shellLeft = useTransform(shellW, (v) => ((maxOuterW - v) * scale) / 2);
  const shellTop = useTransform(shellH, (v) => ((maxOuterH - v) * scale) / 2);

  useEffect(() => {
    const fit = () => {
      const isWide = window.innerWidth >= 720;
      setWide(isWide);
      setScale(
        /* along the bottom, the controls take a strip of the height */
        Math.min(1.4, (window.innerHeight - 32 - (isWide ? 0 : PHONE_BAR_H)) / maxOuterH, (window.innerWidth - (isWide ? WIDE_CONTROL_SPACE + 16 : 16)) / maxOuterW),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [maxOuterH, maxOuterW]);

  /* a slide between a phone and a desktop screen would drag one shape through the
   * other; screens of different sizes cross-fade while the shell changes size */
  const sameSize = useCallback(
    (fromId: string, toId: string) => {
      const a = frames.find((f) => f.id === shownId(fromId));
      const b = frames.find((f) => f.id === shownId(toId));
      if (!a || !b) return true;
      const sa = frameSizeOf(a);
      const sb = frameSizeOf(b);
      return sa.w === sb.w && sa.h === sb.h;
    },
    [frames, shownId],
  );

  const back = useCallback(() => {
    /* an overlay is what going back closes first */
    if (overlayRef.current) {
      setOverlay(null);
      return;
    }
    const s = stackRef.current;
    if (s.length < 2 || peekRef.current) return;
    const from = s[s.length - 1];
    const to = s[s.length - 2];
    const same = sameSize(from.id, to.id);
    setAnim({ transition: same ? from.t : "fade", backwards: true, spring, ...(same && from.m ? { motion: from.m } : {}) });
    setStack(s.slice(0, -1));
  }, [spring, sameSize]);

  const go = useCallback(
    (a: ActionBody, params?: Record<string, unknown>) => {
      if (a.to === BACK_TARGET) {
        back();
        return;
      }
      /* a link leaves the sketch: the page opens in a tab of its own, and the preview stays put */
      if (a.to === LINK_TARGET) {
        const href = linkUrlOf(a);
        if (href) window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      /* a part to scroll to, on the screen on show */
      if (a.scrollTo) {
        const el = document.querySelector(`[data-preview-active] [data-part="${CSS.escape(a.scrollTo)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
      const target = frames.find((f) => f.id === a.to);
      if (!target) return;
      /* a screen that needs a session, without one: the sign-in screen first, then on to it */
      const login = frames.find((f) => f.auth === "login");
      if (target.auth === "required" && !bindingsRef.current.session && login && login.id !== target.id) {
        pending.current = { entry: { id: a.to, t: a.transition, ...(params ? { params } : {}) } };
        setOverlay(null);
        setAnim({ transition: "fade", backwards: false, spring });
        setStack((cur) => [...cur, { id: login.id, t: "fade" }]);
        return;
      }
      if (a.overlay) {
        setOverlay({ id: a.to, t: a.transition, ...(a.motion ? { m: a.motion } : {}), ...(params ? { params } : {}) });
        return;
      }
      /* an overlay closes when its screen goes on to another */
      setOverlay(null);
      const s = stackRef.current;
      const same = sameSize(s[s.length - 1].id, a.to);
      const t = same ? a.transition : "fade";
      const m = same ? a.motion : undefined;
      setAnim({ transition: t, backwards: false, spring, ...(m ? { motion: m } : {}) });
      setStack((cur) => [...cur, { id: a.to, t, ...(m ? { m } : {}), ...(params ? { params } : {}) }]);
    },
    [frames, back, spring, sameSize],
  );

  /** once signed in: back to where a 401 left the app, or on to the screen that needed the session */
  const afterSignIn = useCallback((): boolean => {
    const p = pending.current;
    pending.current = null;
    if (!p) return false;
    if ("back" in p) {
      back();
      return true;
    }
    setAnim({ transition: "fade", backwards: false, spring });
    setStack((cur) => [...cur.slice(0, -1), p.entry]);
    return true;
  }, [back, spring]);

  /** what a tap runs: its effects in order (those that reach the API sent off, not waited for), then where it goes,
   *  with the params it gives; `extra` is what a call's answer adds to the scope (`response`, `error`) */
  const runBody = useRef<(body: ActionBody, it: Item | undefined, extra: Scope | undefined, depth: number) => void>(() => {});
  runBody.current = (body, it, extra, depth) => {
    if (depth > 6) return;
    const f = frameRef.current;
    const ctx = boundRef.current[f.id]?.ctx;
    const row = it?.row;
    const scoped: PreviewState = { ...inRow(screenVars(stateRef.current, doc, f, darkRef.current), row), ...(ctx ? { ctx } : {}) };
    const env = { it, extra };
    const { ctx: _ctx, ...next } = leftRow(applyEffects(scoped, body.effects, doc, env), row);
    setState(next);
    /* an effect has just said which tab is chosen: an earlier tap on the tabs no longer speaks for it */
    const told = (body.effects ?? []).flatMap((e) => (e.do === "setProp" ? [e.part] : []));
    if (told.length) setValues((m) => ({ ...m, ...Object.fromEntries(told.map((id) => [id, -1])) }));
    for (const e of body.effects ?? []) reach(e, it, extra, depth);
    const scope = scopeOf({ ...next, ...(ctx ? { ctx } : {}) }, it, extra);
    const params = body.params ? Object.fromEntries(Object.entries(body.params).map(([k, x]) => [k, evaluate(x, scope, ctx?.eval)])) : undefined;
    go(body, params);
  };

  /** an effect that reaches the API: a call, a load, a page, a form's submit, a sign-out */
  const reach = (e: Effect, it: Item | undefined, extra: Scope | undefined, depth: number) => {
    const f = frameRef.current;
    const src = "source" in e ? f.data?.find((d) => d.name === e.source) : undefined;
    const params = stackRef.current[stackRef.current.length - 1]?.params;
    switch (e.do) {
      case "refresh":
        if (src) void engine.load(f, src, scopeNow(f, params), { force: true }).catch(() => {});
        return;
      case "loadMore":
        if (src) void engine.load(f, src, scopeNow(f, params), { more: true }).catch(() => {});
        return;
      case "signOut":
        pending.current = null;
        engine.signOut();
        return;
      case "call":
        void callNow(e, it, extra, depth).catch(() => {});
        return;
      case "submit":
        void submitNow(e.form, it, depth).catch(() => {});
        return;
      default:
        return;
    }
  };

  const callNow = async (e: Extract<Effect, { do: "call" }>, it: Item | undefined, extra: Scope | undefined, depth: number) => {
    const f = frameRef.current;
    const ctx = boundRef.current[f.id]?.ctx;
    const scope = scopeOf({ ...stateRef.current, ...(ctx ? { ctx } : {}) }, it, extra);
    const ep = endpointOf(doc.api, e.operationId);
    const takes = new Set(doc.api && ep ? endpointParamsOf(doc.api, ep).map((x) => x.name) : []);
    const params: Record<string, unknown> = {};
    const fields: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(e.args ?? {})) (takes.has(k) ? params : fields)[k] = evaluate(x, scope, ctx?.eval);
    const body = e.body ? evaluate(e.body, scope, ctx?.eval) : Object.keys(fields).length ? fields : undefined;
    const undo = e.optimistic && it?.scope?.item !== undefined ? engine.optimistic(f.id, e.optimistic, it.scope.item, scope) : null;
    const out = await engine.call(e.operationId, { params, body });
    if (out.ok) {
      if (doc.api?.auth?.login === e.operationId && afterSignIn()) return;
      if (e.then) runBody.current(e.then, it, { ...extra, response: out.body, status: out.status }, depth + 1);
      return;
    }
    undo?.();
    if (out.unauthorized) return;
    if (e.catch) runBody.current(e.catch, it, { ...extra, error: out.problem, status: out.status }, depth + 1);
  };

  const submitNow = async (formId: string | undefined, it: Item | undefined, depth: number) => {
    const f = frameRef.current;
    const bound = boundRef.current[f.id];
    if (!bound) return;
    const owner = formsOf(bound.groups);
    const id = formId ?? it?.scope?.form ?? (it ? owner.get(bound.groups.find((g) => g.items.some((x) => x.id === it.id))?.id ?? "") : undefined);
    const form = bound.groups.find((g) => g.id === id) ?? (id ? doc.groups.find((g) => g.id === id) : undefined);
    if (!form?.form) return;
    const scope = scopeOf({ ...stateRef.current, ctx: bound.ctx }, it);
    const read = readForm({ form, groups: bound.groups, owner, doc, fields: stateRef.current.fields, files: files.current, scope, ctx: bound.ctx.eval });
    if (Object.keys(read.errors).length) {
      engine.setForm(form.id, { errors: read.errors, submitted: true, error: null });
      return;
    }
    const params = Object.fromEntries(Object.entries(form.form.params ?? {}).map(([k, x]) => [k, evaluate(x, scope, bound.ctx.eval)]));
    const tick = (fn: () => void) => {
      const t = window.setInterval(fn, 120);
      return () => window.clearInterval(t);
    };
    const out = await engine.submit(form.id, form.form.operationId, { params, body: read.body }, { files: read.files, tick });
    if (out.ok) {
      if (doc.api?.auth?.login === form.form.operationId && afterSignIn()) {
        if (form.form.then?.effects?.length) runBody.current({ ...form.form.then, to: STAY_TARGET }, it, { response: out.body, status: out.status }, depth + 1);
        return;
      }
      if (form.form.then) runBody.current(form.form.then, it, { response: out.body, status: out.status }, depth + 1);
      return;
    }
    if (out.unauthorized) return;
    if (form.form.catch) runBody.current(form.form.catch, it, { error: out.problem, status: out.status }, depth + 1);
  };

  /* A tap: its condition picks what runs, its effects run in order, and then it goes where it goes. */
  const fire = useCallback(
    (a: Action, it?: Item) => {
      if (swiped.current) return;
      /* a tap from a repeated part reads its row's fields as `row.field`, and only for this tap; the variables read as
         the screen on show has them */
      const ctx = boundRef.current[frameRef.current.id]?.ctx;
      const scoped: PreviewState = { ...inRow(screenVars(stateRef.current, doc, frameRef.current, darkRef.current), it?.row), ...(ctx ? { ctx } : {}) };
      const body = chooseBranch(a, scoped, doc, it);
      if (!body) return;
      runBody.current(body, it, undefined, 0);
    },
    [doc],
  );

  /* ---------- the bindings: data, calls, forms, the session (lib/bindings) ---------- */
  const [bindings, setBindingsNow] = useState<BindingState>(emptyBindings);
  const bindingsRef = useRef(bindings);
  const setBindings = useCallback((next: BindingState) => {
    bindingsRef.current = next;
    setBindingsNow(next);
  }, []);
  const docRef = useRef(doc);
  docRef.current = doc;
  const transportRef = useRef<Transport>(transport ?? fallbackTransport(doc));
  if (transport && transportRef.current !== transport) transportRef.current = transport;
  const langRef = useRef(lang);
  langRef.current = lang;
  /** what was opened over the sign-in screen: where the app goes once signed in */
  const pending = useRef<{ back: true } | { entry: Entry } | null>(null);
  const unauthorized = useRef<() => void>(() => {});
  const engine = useMemo(
    () =>
      new BindingEngine({
        doc: () => docRef.current,
        transport: { request: (r) => transportRef.current.request(r) },
        get: () => bindingsRef.current,
        set: setBindings,
        ctx: () => ({ lang: langRef.current }),
        unauthorized: () => unauthorized.current(),
      }),
    [setBindings],
  );
  const files = useRef<Record<string, TransportFile[]>>({});
  /** each screen as its bindings had it when last drawn: what a tap reads */
  const boundRef = useRef<Record<string, BoundScreen>>({});
  const loginFrame = frames.find((f) => f.auth === "login");
  /* a 401 ends the session and sends the app to the sign-in screen, which goes back to where it was once signed in */
  unauthorized.current = () => {
    const s = stackRef.current;
    if (!loginFrame || s[s.length - 1]?.id === loginFrame.id) return;
    pending.current = { back: true };
    setOverlay(null);
    setAnim({ transition: "fade", backwards: false, spring });
    setStack((cur) => [...cur, { id: loginFrame.id, t: "fade" }]);
  };
  const varNames = useMemo(() => (doc.vars ?? []).map((v) => ({ id: v.id, name: v.name })), [doc.vars]);
  /** the scope of a screen as it is now: its data, its params, the variables, the session */
  const scopeNow = useCallback(
    (f: Frame, params?: Record<string, unknown>): Scope => screenScope({ frame: f, state: bindingsRef.current, params, vars: screenVars(stateRef.current, doc, f, darkRef.current).vars, varNames }),
    [doc, varNames],
  );
  /* a screen loads its data as it comes on show, and again when it is opened with other params */
  const topParams = top?.params;
  const paramsKey = JSON.stringify(topParams ?? null);
  useEffect(() => {
    if (!current?.data?.length) return;
    void engine.enter(current, scopeNow(current, topParams)).catch(() => {});
    // the params are read through their key: a new object with the same values loads nothing again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, paramsKey, engine]);
  const overlayParams = overlay?.params;
  const overlayKey = JSON.stringify(overlayParams ?? null);
  useEffect(() => {
    const f = overlay ? frames.find((x) => x.id === shownId(overlay.id)) : undefined;
    if (!f?.data?.length) return;
    void engine.enter(f, scopeNow(f, overlayParams)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.id, overlayKey, engine]);

  const snack = state.snack;
  useEffect(() => {
    if (!snack) return;
    const id = window.setTimeout(() => setState({ ...stateRef.current, snack: null }), SNACK_MS);
    return () => window.clearTimeout(id);
  }, [snack, setState]);

  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* an open menu is the thing Escape dismisses, then an overlay */
        if (picker) setPicker(false);
        else if (overlayRef.current) setOverlay(null);
        else onClose();
      }
      if (e.key === "Backspace" || e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, onClose, picker]);
  /* The control that opened the preview gets the keyboard back when it closes, whichever
   * screens were shown in between. Read
   * during the first render, before a screen's effect moves focus onto its rail. */
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => () => { if (opener?.isConnected && !opener.closest("[inert]")) opener.focus(); }, [opener]);

  /* a screen's parts as they are right now. The tab a visitor chose goes in first, since which parts
   * the dock shows and how they are laid out both follow from it; then its bindings: the data drawn in, the regions in
   * the state their data is in, the forms' errors (lib/bindings/view.ts). */
  const groupsFor = useCallback(
    (f: Frame, params?: Record<string, unknown>): { groups: DocGroup[]; widths: Record<string, number> } => {
      const tabbed = groupsInFrame(doc.groups, f, frames, widths).map((g) => {
        const it = g.items[0];
        const def = g.items.length === 1 ? partBySlug(it.component) : undefined;
        return def?.panes && def.selectKey && values[it.id] >= 0 ? { ...g, items: [{ ...it, props: { ...it.props, [def.selectKey]: values[it.id] } }] } : g;
      });
      const vars = screenVars(state, doc, f, dark);
      try {
        const bound = boundScreen({ groups: tabbed, frame: f, doc, state: bindings, params, vars: vars.vars, fields: state.fields, files: files.current, widths, ctx: { lang } });
        boundRef.current[f.id] = bound;
        return { groups: liveGroups(bound.groups, { ...vars, ctx: bound.ctx }, doc, bound.widths), widths: bound.widths };
      } catch {
        /* a binding that cannot be drawn leaves the screen as designed: the preview never stops for it */
        return { groups: liveGroups(tabbed, vars, doc, widths), widths };
      }
    },
    [doc, frames, widths, values, state, dark, bindings, lang],
  );
  /** the variables as a screen shows them, for the design fields bound to them */
  const boundFor = useCallback((f: Frame | undefined) => (doc.vars?.length && f ? screenVars(state, doc, f, dark).vars : null), [doc, state, dark]);
  const live = useMemo(() => (current ? groupsFor(current, top?.params) : { groups: [], widths }), [current, groupsFor, top?.params, widths]);
  const groups = live.groups;
  const overlayFrame = overlay ? frames.find((f) => f.id === shownId(overlay.id)) : undefined;
  const overlayLive = useMemo(() => (overlayFrame ? groupsFor(overlayFrame, overlay?.params) : { groups: [], widths }), [overlayFrame, groupsFor, overlay?.params, widths]);
  const peekLive = useMemo(() => (peekFrame ? groupsFor(peekFrame) : { groups: [], widths }), [peekFrame, groupsFor, widths]);

  /* ---- finger-tracked swipes: only the swipes the author set on the frame ---- */
  const axisMV = useMotionValue(0); // 0 = x, 1 = y
  const enterMV = useMotionValue(0);
  const exitMV = useMotionValue(0);
  const curX = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 0 ? pct(ex * p) : "0%"));
  const curY = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 1 ? pct(ex * p) : "0%"));
  const curOp = useTransform(prog, (p: number) => 1 - 0.4 * p);
  const peekX = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 0 ? pct(en * (1 - p)) : "0%"));
  const peekY = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 1 ? pct(en * (1 - p)) : "0%"));

  const gesture = useRef<{
    id: number;
    x0: number;
    y0: number;
    phase: "idle" | "drag" | "none";
    dir?: SwipeDir;
    size: number;
    last: number;
    lastT: number;
    vel: number;
    /** a finger or pen landed on a body that scrolls: a drag up or down there is the scroll */
    body: boolean;
  } | null>(null);

  const onScreenPointerDown = (e: React.PointerEvent) => {
    if (peekRef.current || e.button !== 0) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, phase: "idle", size: frameW, last: 0, lastT: e.timeStamp, vel: 0, body: e.pointerType !== "mouse" && !!(e.target as Element).closest("[data-scroll-body]") };
    swiped.current = false;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = (e.clientX - g.x0) / scale;
      const dy = (e.clientY - g.y0) / scale;
      if (g.phase === "none") return;
      if (g.phase === "idle") {
        if (Math.hypot(dx, dy) < 8) return;
        const dir: SwipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        const s = stackRef.current;
        const on = s[s.length - 1]?.id;
        const cur = frames.find((f) => f.id === (on ? shownId(on) : undefined));
        if (!cur) return;
        const swipedTo = cur.swipe?.[dir];
        const to = swipedTo ? shownId(swipedTo) : undefined;
        const spec = SWIPE_DIRS.find((d) => d.key === dir)!;
        /* only swipes the author set up move screens; nothing is inferred. A finger dragging up or
         * down a body that scrolls is scrolling it; a mouse scrolls with its wheel, so it still swipes */
        let pk: Peek | null = null;
        const scrolling = g.body && (dir === "up" || dir === "down");
        if (to && !scrolling && frames.some((f) => f.id === to)) pk = { frameId: to, t: spec.transition };
        if (!pk) {
          g.phase = "none";
          return;
        }
        const sl = SLIDE_SPEC[pk.t]!;
        g.phase = "drag";
        g.dir = dir;
        const { w, h } = frameSizeOf(cur);
        g.size = sl.axis === "x" ? w : h;
        swiped.current = true;
        axisMV.set(sl.axis === "x" ? 0 : 1);
        enterMV.set(sl.enter);
        exitMV.set(sl.exit);
        prog.set(0);
        peekRef.current = pk;
        setPeek(pk);
      }
      const along = g.dir === "left" ? -dx : g.dir === "right" ? dx : g.dir === "up" ? -dy : dy;
      const pr = Math.max(0, Math.min(1, along / g.size));
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.vel = (pr - g.last) / dt;
      g.last = pr;
      g.lastT = e.timeStamp;
      prog.set(pr);
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      if (g.phase !== "drag") return;
      const pk = peekRef.current;
      if (!pk) return;
      const commit = prog.get() > 0.25 || g.vel > 0.0012;
      animate(prog, commit ? 1 : 0, { duration: 0.26, ease: EASE }).then(() => {
        if (commit) {
          setAnim({ transition: "none", backwards: false, spring });
          setStack((s) => [...s, { id: pk.frameId, t: pk.t }]);
        }
        peekRef.current = null;
        setPeek(null);
        enterMV.set(0);
        exitMV.set(0);
        prog.set(0);
        window.setTimeout(() => {
          swiped.current = false;
        }, 50);
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [frames, scale, prog, axisMV, enterMV, exitMV, shownId]);

  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  /* A menu hands focus back to its button when it closes; a chosen screen is then one Tab
   * away. The chosen item is still in the tree here because the menu animates out. */
  useEffect(() => {
    const focused = document.activeElement;
    if (!picker && focused !== pickerButton.current && pickerRef.current?.contains(focused)) pickerButton.current?.focus();
  }, [picker]);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [picker]);

  if (!current) {
    return null;
  }

  const screenProps = {
    widths,
    p,
    styled: { ...theme, dark },
    onAction: fire,
    values,
    onValue: (id: string, v: number) => setValues((m) => ({ ...m, [id]: v })),
    opened: state.opened,
    onField: (it: Item, value: VarValue) => setState(writeField(stateRef.current, it, value, doc)),
    onCloseOverlay: (id: string) => setState(applyEffects(stateRef.current, [{ do: "close", part: id }], doc)),
    onScrim: () => setState(closeOpened(stateRef.current, doc)),
    onFiles: (it: Item, list: TransportFile[]) => {
      files.current = { ...files.current, [it.id]: list };
      /* the names stand for the files where a value is read (a condition, a required field) */
      setState(writeField({ ...stateRef.current, fields: { ...stateRef.current.fields, [it.id]: list.map((x) => x.name).join(", ") } }, it, list.map((x) => x.name).join(", "), doc));
    },
  };
  /** what a screen does on a pull and at the end of its scrolling, and whether a pull's load is under way */
  const dataHandlers = (f: Frame, params?: Record<string, unknown>) => {
    const pulls = (f.data ?? []).filter((d) => d.pullToRefresh);
    const pages = (f.data ?? []).filter((d) => d.paging === "scroll");
    return {
      onPull: pulls.length ? () => pulls.forEach((d) => void engine.load(f, d, scopeNow(f, params), { force: true }).catch(() => {})) : undefined,
      onNearEnd: pages.length ? () => pages.forEach((d) => void engine.load(f, d, scopeNow(f, params), { more: true }).catch(() => {})) : undefined,
      refreshing: pulls.some((d) => bindings.sources[`${f.id}/${d.name}`]?.loading && bindings.sources[`${f.id}/${d.name}`]?.value !== undefined),
    };
  };
  /* a snackbar sits over the content, above a bar at the foot of the screen */
  const footH = Math.max(0, ...groups.filter((g) => g.items.length === 1 && roleOf(g.items[0]) === "bottom").map((g) => sizeOf(g.items[0], widths).h));

  const barBtn: React.CSSProperties = {
    height: 40,
    padding: "0 14px 0 10px",
    borderRadius: 20,
    border: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    /* the column has a fixed width, so labels are cut with an ellipsis instead of widening it */
    width: wide ? "100%" : undefined,
    minWidth: 0,
    /* along a phone's bottom it is the screen's name that gives way, not the buttons beside it */
    flexShrink: wide ? undefined : 0,
  };
  /* along a phone's bottom there is room for the marks, not the words: the title says them */
  const markOnly: React.CSSProperties = wide ? {} : { padding: "0 10px" };
  const label: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

  return (
    <PreviewMocksContext.Provider value={mocks}>
    <PreviewTheme dark={dark}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: p.surfaceContainer,
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box",
        paddingRight: wide ? WIDE_CONTROL_SPACE : 0,
      }}
    >
      <div
        style={{
          width: maxOuterW * scale,
          height: maxOuterH * scale,
          position: "relative",
          marginBottom: wide ? 0 : PHONE_BAR_H,
        }}
      >
        <motion.div
          onPointerDown={onScreenPointerDown}
          style={{
            position: "absolute",
            left: shellLeft,
            top: shellTop,
            width: shellW,
            height: shellH,
            transform: `scale(${scale})`,
            touchAction: "none",
            transformOrigin: "0 0",
            borderRadius: shellRadius,
            background: p.inverseSurface,
            boxShadow: "0 30px 80px rgba(0,0,0,0.22)",
          }}
        >
          <motion.div
            onClickCapture={(e) => {
              if (swiped.current) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            style={{
              position: "absolute",
              left: BEZEL,
              top: BEZEL,
              width: screenW,
              height: screenH,
              borderRadius: screenRadius,
              overflow: "hidden",
              background: screenBackground(p[current.bg ?? "surface"], { ...theme, dark }),
              fontFamily: fontFamilyOf(theme.font, lang),
              touchAction: "none",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                x: curX,
                y: curY,
                opacity: curOp,
              }}
            >
              <AnimatePresence initial={false} mode="popLayout" custom={anim}>
                <motion.div
                  key={current.id}
                  custom={anim}
                  variants={screenVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  style={{ position: "absolute", inset: 0 }}
                >
                  <Screen frame={current} groups={groups} {...screenProps} widths={live.widths} {...dataHandlers(current, top?.params)} active={!overlayFrame} bound={boundFor(current)} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
            <AnimatePresence>
              {overlayFrame && overlay && (
                <motion.div key={`overlay:${overlay.id}`} data-preview-overlay={overlay.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center" }}>
                  <div aria-hidden onClick={() => setOverlay(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)" }} />
                  <motion.div
                    custom={{ transition: overlay.t, backwards: false, spring, motion: overlay.m } satisfies ScreenMove}
                    variants={screenVariants}
                    initial="initial"
                    animate="animate"
                    style={{ position: "relative", width: frameSizeOf(overlayFrame).w, height: frameSizeOf(overlayFrame).h, borderRadius: frameRadius(overlayFrame) / 2, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
                  >
                    <Screen frame={overlayFrame} groups={overlayLive.groups} {...screenProps} widths={overlayLive.widths} {...dataHandlers(overlayFrame, overlay?.params)} bound={boundFor(overlayFrame)} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {peek && peekFrame && (
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  x: peekX,
                  y: peekY,
                  pointerEvents: "none",
                }}
              >
                <Screen {...screenProps} active={false} frame={peekFrame} groups={peekLive.groups} widths={peekLive.widths} bound={boundFor(peekFrame)} />
              </motion.div>
            )}
            <AnimatePresence>
              {snack && (
                <motion.div
                  key={snack.id}
                  role="status"
                  data-preview-snackbar
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  style={{ position: "absolute", left: 16, right: 16, bottom: 16 + footH, zIndex: 3, padding: "14px 16px", borderRadius: 4, background: p.inverseSurface, color: p.inverseOnSurface, fontSize: 14, lineHeight: "20px", boxShadow: "0 3px 8px rgba(0,0,0,0.24)" }}
                >
                  {snack.message}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {mocks && logOpen && <MockLogPanel mocks={mocks} p={p} onClose={() => setLogOpen(false)} />}

      <div
        style={
          wide
            ? { position: "absolute", right: 20, bottom: 20, display: "flex", alignItems: "flex-end", pointerEvents: "none" }
            : { position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", pointerEvents: "none" }
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: wide ? "column" : "row",
            alignItems: wide ? "stretch" : "center",
            gap: 4,
            padding: 6,
            borderRadius: 28,
            background: p.surface,
            boxShadow: "0 4px 18px rgba(0,0,0,0.14)",
            pointerEvents: "auto",
            width: wide ? 172 : undefined,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <button
            onClick={back}
            disabled={stack.length < 2 && !overlay}
            title={t("back", lang)}
            aria-label={t("back", lang)}
            className="m3-press"
            style={{
              ...barBtn,
              ...markOnly,
              color: stack.length < 2 && !overlay ? p.outlineVariant : p.onSurfaceVariant,
              cursor: stack.length < 2 && !overlay ? "default" : "pointer",
            }}
          >
            <Icon name="arrow_back" size={20} />
            {wide && <span style={label}>{t("back", lang)}</span>}
          </button>
          <div ref={pickerRef} style={{ position: "relative", minWidth: 0, flex: wide ? undefined : "0 1 auto" }}>
            <button
              ref={pickerButton}
              onClick={() => setPicker((v) => !v)}
              title={t("screens", lang)}
              aria-expanded={picker}
              className="m3-press"
              style={{
                ...barBtn,
                background: p.secondaryContainer,
                color: p.onSecondaryContainer,
                width: "100%",
                maxWidth: wide ? undefined : 200,
                padding: wide ? barBtn.padding : "0 8px 0 12px",
              }}
            >
              {wide && <Icon name={phone ? "smartphone" : "desktop_windows"} size={20} />}
              <span style={{ ...label, flex: wide ? 1 : undefined, textAlign: "left" }}>{current.name || t("screen", lang)}</span>
              <Icon name={wide ? (picker ? "chevron_right" : "chevron_left") : picker ? "expand_more" : "expand_less"} size={18} />
            </button>
            <AnimatePresence>
              {picker && (
                <motion.div
                  role="menu"
                  initial={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, x: wide ? 0 : "-50%", y: 0, scale: 1 }}
                  exit={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  style={{
                    position: "absolute",
                    ...(wide ? { right: "calc(100% + 14px)", bottom: 0 } : { bottom: 48, left: "50%" }),
                    minWidth: 160,
                    maxWidth: "calc(100vw - 24px)",
                    maxHeight: "50vh",
                    overflowY: "auto",
                    padding: 6,
                    borderRadius: 18,
                    background: p.surfaceContainerLow,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transformOrigin: wide ? "bottom right" : "bottom center",
                  }}
                >
                  {flowStarts(frames).map((f) => (
                    <button
                      key={`flow:${f.id}`}
                      role="menuitem"
                      data-preview-flow={f.flow}
                      onClick={() => {
                        setPicker(false);
                        setDevice(null);
                        setOverlay(null);
                        setAnim({ transition: "fade", backwards: false, spring });
                        setStack([{ id: f.id, t: "fade" }]);
                      }}
                      className="m3-press"
                      style={{ height: 40, padding: "0 14px 0 10px", borderRadius: 12, border: "none", background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", textAlign: "left" }}
                    >
                      <Icon name="play_arrow" size={18} />
                      {f.flow || t("prFlowStart", lang)}
                    </button>
                  ))}
                  {frames.map((f) => {
                    const on = f.id === current.id;
                    return (
                      <button
                        key={f.id}
                        role="menuitemradio"
                        aria-checked={on}
                        onClick={() => {
                          setPicker(false);
                          if (on) return;
                          /* a screen picked by hand is shown as it is, whichever width was on */
                          setDevice(null);
                          setOverlay(null);
                          setAnim({ transition: "fade", backwards: false, spring });
                          setStack([{ id: f.id, t: "fade" }]);
                        }}
                        className="m3-press"
                        style={{
                          height: 40,
                          padding: "0 14px 0 10px",
                          borderRadius: 12,
                          border: "none",
                          background: on ? p.secondaryContainer : "transparent",
                          color: on ? p.onSecondaryContainer : p.onSurface,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          whiteSpace: "nowrap",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ width: 18, display: "inline-flex" }}>
                          {on ? <Icon name="check" size={18} /> : <Icon name={isPhoneFrame(f) ? "smartphone" : "desktop_windows"} size={18} />}
                        </span>
                        {f.name || t("screen", lang)}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {mocks && <MockScenarioSwitch mocks={mocks} scenarios={doc.mocks?.scenarios ?? []} p={p} wide={wide} barBtn={{ ...barBtn, ...markOnly }} />}
          {mocks && (
            <button data-preview-log-button aria-pressed={logOpen} onClick={() => setLogOpen((v) => !v)} title={t("mocksLog", lang)} aria-label={t("mocksLog", lang)} className="m3-press" style={{ ...barBtn, ...markOnly, color: logOpen ? p.onSecondaryContainer : p.onSurfaceVariant, background: logOpen ? p.secondaryContainer : "transparent" }}>
              <Icon name="receipt_long" size={20} />
              {wide && <span style={label}>{t("mocksLog", lang)}</span>}
            </button>
          )}
          <button
            data-preview-dark={dark ? "on" : "off"}
            onClick={toggleDark}
            title={t(dark ? "light" : "dark", lang)}
            aria-label={t(dark ? "light" : "dark", lang)}
            className="m3-press"
            style={{ ...barBtn, ...markOnly, color: p.onSurfaceVariant }}
          >
            <Icon name={dark ? "light_mode" : "dark_mode"} size={20} />
            {wide && <span style={label}>{t(dark ? "light" : "dark", lang)}</span>}
          </button>
          {hasSizes && (
            <div role="radiogroup" aria-label={t("previewWidth", lang)} data-preview-width style={{ display: "flex", gap: 2, justifyContent: "center", flexShrink: 0 }}>
              {PRESETS.map((preset) => {
                const on = framePresetOf(current) === preset;
                const word = t(preset === "phone" ? "phoneFrame" : preset === "tablet" ? "tabletFrame" : "desktopFrame", lang);
                return (
                  <button
                    key={preset}
                    role="radio"
                    aria-checked={on}
                    aria-label={word}
                    title={word}
                    data-preview-size={preset}
                    onClick={() => {
                      setAnim({ transition: "fade", backwards: false, spring });
                      setDevice(preset);
                    }}
                    className="m3-press"
                    style={{ ...barBtn, width: wide ? 44 : 36, padding: 0, justifyContent: "center", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurfaceVariant }}
                  >
                    <Icon name={preset === "phone" ? "smartphone" : preset === "tablet" ? "tablet" : "desktop_windows"} size={20} />
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={onClose} title={t("close", lang)} aria-label={t("close", lang)} className="m3-press" style={{ ...barBtn, ...markOnly, color: p.onSurfaceVariant }}>
            <Icon name="close" size={20} />
            {wide && <span style={label}>{t("closeBtn", lang)}</span>}
          </button>
        </div>
      </div>
    </motion.div>
    </PreviewTheme>
    </PreviewMocksContext.Provider>
  );
}
