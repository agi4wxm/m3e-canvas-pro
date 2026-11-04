
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/tokens";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, useIsPresent } from "motion/react";
import type { TargetAndTransition, Variants } from "motion/react";
import {
  Action,
  BACK_TARGET,
  LINK_TARGET,
  linkUrlOf,
  BEZEL,
  Doc,
  Frame,
  GAP,
  Group,
  PHONE_H,
  PHONE_R,
  PHONE_W,
  Palette,
  SLIDE_SPEC,
  SWIPE_DIRS,
  SwipeDir,
  Transition,
  fontFamilyOf,
  frameLengthOf,
  canCollapseFab,
  frameRadius,
  frameSizeOf,
  groupsInFrame,
  isPhoneFrame,
  normalizeTheme,
  sizeOf,
} from "@/lib/tokens";
import { Icon } from "./Icon";
import { PartView } from "./PartView";
import { partBySlug } from "@/parts/registry";
import { actionSlotsOf } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { pinOf } from "@/lib/tidy";

const EASE = [0.2, 0, 0, 1] as const;
const SLIDE_MS = 0.42;
/** room reserved for the wide preview controls: panel, right margin and breathing space */
const WIDE_CONTROL_SPACE = 220;

type Anim = { t: Transition; back: boolean; /** the expressive motion scheme: springs instead of eased tweens */ spring?: boolean };

/** M3 Expressive spatial spring, with a visible overshoot */
const SPRING = { type: "spring" as const, stiffness: 360, damping: 26, mass: 1 };
/** how the current screen was reached, so "back" can play it in reverse */
type Entry = { id: string; t: Transition };

const pct = (v: number) => `${v * 100}%`;

/** offset along one axis, as a percentage of the screen */
const off = (axis: "x" | "y", v: number) => (axis === "x" ? { x: pct(v), y: 0 } : { x: 0, y: pct(v) });

type Pose = TargetAndTransition;

/** enter / leave poses for one screen change; the same spec drives forward and back */
function poses(c: Anim): { initial: Pose; animate: Pose; exit: Pose } {
  const zi = { zIndex: { duration: 0 } };
  const s = SLIDE_SPEC[c.t];
  if (s) {
    const tr = c.spring ? { ...SPRING, ...zi } : { duration: SLIDE_MS, ease: EASE, ...zi };
    return c.back
      ? {
          initial: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1 },
          animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 1, transition: tr },
          exit: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2, transition: tr },
        }
      : {
          initial: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2 },
          animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
          exit: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1, transition: tr },
        };
  }
  if (c.t === "fade") {
    const tr = { duration: 0.3, ease: EASE, ...zi };
    return {
      initial: { x: 0, y: 0, opacity: 0, scale: 1, zIndex: 2 },
      animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
      exit: { x: 0, y: 0, opacity: 0, scale: 1, zIndex: 1, transition: tr },
    };
  }
  if (c.t === "expand") {
    const tr = c.spring ? { ...SPRING, ...zi } : { duration: 0.36, ease: EASE, ...zi };
    return c.back
      ? {
          initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: 1 },
          animate: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1, transition: tr },
          exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: 2, transition: tr },
        }
      : {
          initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: 2 },
          animate: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 2, transition: tr },
          exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: 1, transition: tr },
        };
  }
  const tr = { duration: 0, ...zi };
  return {
    initial: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2 },
    animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
    exit: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 1, transition: tr },
  };
}

const screenVariants: Variants = {
  initial: (c: Anim) => poses(c).initial,
  animate: (c: Anim) => poses(c).animate,
  exit: (c: Anim) => poses(c).exit,
};

/* the destination bars: a tap on their destination is shared with the bar of the same entries on
 * every other screen */
const NAV_PARTS = new Set(["navigation-bar", "navigation-rail", "tabs"]);

/** A real shadcn M3E component in the preview: it works. A press lands where it was aimed --
 *  on a place the part marked `data-tap` (a destination, a menu item) it fires that slot's
 *  action; anywhere else it is the part's own tap. */
function LivePart({ item, widths, screen, onTap, onSlot, easeWidth }: { item: Item; widths: Record<string, number>; screen?: { w: number; h: number }; onTap?: () => void; onSlot?: (slot: string) => void; easeWidth?: boolean }) {
  const size = sizeOf(item, widths);
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const slot = (e.target as Element).closest?.("[data-tap]")?.getAttribute("data-tap");
    if (slot != null) onSlot?.(slot);
    else onTap?.();
    e.preventDefault();
  };
  return (
    <div data-live-part onClick={onTap || onSlot ? click : undefined} style={{ position: "relative", display: "flex", flex: "0 0 auto", width: easeWidth ? "max-content" : size.w, height: size.h }}>
      <PartView item={item} live screen={screen} />
    </div>
  );
}

function Screen({
  active = true,
  frame,
  groups,
  widths,
  p,
  onAction,
  values,
  onValue,
}: {
  active?: boolean;
  frame: Frame;
  groups: Group[];
  widths: Record<string, number>;
  p: Palette;
  onAction: (a: Action) => void;
  values: Record<string, number>;
  onValue: (id: string, v: number) => void;
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
  const length = frameLengthOf(frame);
  const scrolls = length > viewH;
  const pins = new Map<string, number>();
  if (scrolls) {
    for (const g of groups) {
      const pin = pinOf(g, frame, widths);
      if (pin) pins.set(g.id, pin === "head" ? 0 : length - viewH);
    }
  }
  const lift = (g: Group) => pins.get(g.id) ?? 0;
  const hasFoldingFab = groups.some((g) => g.items.some((it) => canCollapseFab(it) && it.collapseOnScroll));
  const onBodyScroll = (e: { currentTarget: { scrollTop: number } }) => {
    const top = e.currentTarget.scrollTop;
    const down = top - fabScrollTop.current;
    fabScrollTop.current = top;
    if (hasFoldingFab && down !== 0) setFabFolded(down > 0);
  };
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
          style={{ position: "absolute", inset: 0, overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", touchAction: "pan-y" }}
        >
          <div style={{ position: "relative", height: length }}>{nodes.filter((_, i) => !pins.has(groups[i].id))}</div>
        </div>
        {nodes.filter((_, i) => pins.has(groups[i].id))}
      </>
    ) : (
      nodes
    );

  return (
    <div
      ref={screenRef}
      inert={!interactive}
      aria-hidden={!interactive || undefined}
      role="group"
      aria-label={frame.name || t("screen", lang)}
      tabIndex={-1}
      style={{ position: "absolute", inset: 0, background: p[frame.bg ?? "surface"], overflow: "hidden", outline: "none" }}
    >
      {inBody(groups.map((g) => (
        <div
          key={g.id}
          className="m3-preview-group"
          data-preview-group={g.id}
          style={
            g.free
              ? { position: "absolute", left: g.x - frame.x, top: g.y - frame.y - lift(g) }
              : {
                  position: "absolute",
                  left: g.x - frame.x,
                  top: g.y - frame.y - lift(g),
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
            const tap = act ? () => onAction(act) : undefined;
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
                onTap={tap}
                onSlot={
                  slotActions || selectKey || def?.slug === "navigation-rail"
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
                          onValue(navKey || it.id, a ? -1 : Number(slot.slice(4)));
                          if (a && navKey) onValue(`${navKey}:opened:${a.to}`, Number(slot.slice(4)));
                        }
                        if (a) onAction(a);
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
    </div>
  );
}

/** the screen being pulled in by a swipe, and the slide it arrives with */
type Peek = { frameId: string; t: Transition };

export function Preview({
  doc,
  widths,
  palette: p,
  startId,
  onClose,
}: {
  doc: Doc;
  widths: Record<string, number>;
  palette: Palette;
  startId: string | null;
  onClose: () => void;
}) {
  const lang = useLang();
  const frames = doc.frames;
  const [stack, setStack] = useState<Entry[]>(() => [{ id: startId ?? frames[0]?.id ?? "", t: "none" }]);
  const [anim, setAnim] = useState<Anim>({ t: "none", back: false });
  const theme = normalizeTheme(doc.theme);
  const spring = theme.motion === "expressive";
  const [scale, setScale] = useState(1);
  const [values, setValues] = useState<Record<string, number>>({});
  const [peek, setPeek] = useState<Peek | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const swiped = useRef(false);

  const top = stack[stack.length - 1];
  const current = frames.find((f) => f.id === top?.id) ?? frames[0];
  const peekFrame = peek ? frames.find((f) => f.id === peek.frameId) : undefined;
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
  /* the stage is sized for the largest screen in the document, so the scale never
   * changes while a swipe crosses sizes or a screen is opened from the picker */
  const maxOuterW = Math.max(outerW, ...frames.map((f) => frameSizeOf(f).w + BEZEL * 2));
  const maxOuterH = Math.max(outerH, ...frames.map((f) => frameSizeOf(f).h + BEZEL * 2));
  const shellLeft = useTransform(shellW, (v) => ((maxOuterW - v) * scale) / 2);
  const shellTop = useTransform(shellH, (v) => ((maxOuterH - v) * scale) / 2);

  /* on a wide window the controls stand in a column at the right edge, clear of the phone;
   * on a phone they stay along the bottom, where the frame fills the width anyway */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const fit = () => {
      const isWide = window.innerWidth >= 720;
      setWide(isWide);
      setScale(
        Math.min(1.4, (window.innerHeight - 32) / maxOuterH, (window.innerWidth - (isWide ? WIDE_CONTROL_SPACE + 16 : 16)) / maxOuterW),
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
      const a = frames.find((f) => f.id === fromId);
      const b = frames.find((f) => f.id === toId);
      if (!a || !b) return true;
      const sa = frameSizeOf(a);
      const sb = frameSizeOf(b);
      return sa.w === sb.w && sa.h === sb.h;
    },
    [frames],
  );

  const back = useCallback(() => {
    const s = stackRef.current;
    if (s.length < 2 || peekRef.current) return;
    const from = s[s.length - 1];
    const to = s[s.length - 2];
    setAnim({ t: sameSize(from.id, to.id) ? from.t : "fade", back: true, spring });
    setStack(s.slice(0, -1));
  }, [spring, sameSize]);

  const go = useCallback(
    (a: Action) => {
      if (swiped.current) return;
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
      if (!frames.some((f) => f.id === a.to)) return;
      const s = stackRef.current;
      const t = sameSize(s[s.length - 1].id, a.to) ? a.transition : "fade";
      setAnim({ t, back: false, spring });
      setStack((cur) => [...cur, { id: a.to, t }]);
    },
    [frames, back, spring, sameSize],
  );

  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* an open menu is the thing Escape dismisses */
        if (picker) setPicker(false);
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

  const groupsFor = useCallback((f: Frame) => groupsInFrame(doc.groups, f, frames, widths), [doc.groups, frames, widths]);
  const groups = useMemo(() => (current ? groupsFor(current) : []), [current, groupsFor]);
  const peekGroups = useMemo(() => (peekFrame ? groupsFor(peekFrame) : []), [peekFrame, groupsFor]);

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
        const cur = frames.find((f) => f.id === s[s.length - 1]?.id);
        if (!cur) return;
        const to = cur.swipe?.[dir];
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
          setAnim({ t: "none", back: false, spring });
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
  }, [frames, scale, prog, axisMV, enterMV, exitMV]);

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
    onAction: go,
    values,
    onValue: (id: string, v: number) => setValues((m) => ({ ...m, [id]: v })),
  };

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
  };
  const label: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

  return (
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
          marginBottom: wide ? 0 : 56,
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
              background: p[current.bg ?? "surface"],
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
                  <Screen frame={current} groups={groups} {...screenProps} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
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
                <Screen {...screenProps} active={false} frame={peekFrame} groups={peekGroups} />
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>

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
            disabled={stack.length < 2}
            title={t("back", lang)}
            className="m3-press"
            style={{
              ...barBtn,
              color: stack.length < 2 ? p.outlineVariant : p.onSurfaceVariant,
              cursor: stack.length < 2 ? "default" : "pointer",
            }}
          >
            <Icon name="arrow_back" size={20} />
            <span style={label}>{t("back", lang)}</span>
          </button>
          <div ref={pickerRef} style={{ position: "relative", minWidth: 0 }}>
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
                maxWidth: wide ? undefined : 200,
              }}
            >
              <Icon name={phone ? "smartphone" : "desktop_windows"} size={20} />
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
                          setAnim({ t: "fade", back: false, spring });
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
          <button onClick={onClose} title={t("close", lang)} className="m3-press" style={{ ...barBtn, color: p.onSurfaceVariant }}>
            <Icon name="close" size={20} />
            <span style={label}>{t("closeBtn", lang)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
