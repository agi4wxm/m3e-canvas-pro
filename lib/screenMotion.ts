/* How one screen gives way to another in a prototype: Figma's animations (at once, a dissolve, the new screen moving in
 * over the one there, pushing it out, or sliding in while it parks a little way off), from a side, on an easing curve,
 * for so long, and the transitions documents had before them. Plain data and arithmetic with no imports: the preview
 * (components/Preview.tsx) plays these poses with motion, and an exported app gets a copy of this file and plays the
 * very same ones (lib/exportProject.ts). */

/** The names of the moves documents had before Figma's animations (version 3 and earlier). A document no longer says
 *  them: version 4 wrote each as the motion that plays it (`TRANSITION_MOTIONS`). They remain the names of the moves an
 *  app makes on its own (the sign-in screen fading in), and what an older exported app's runtime calls its moves. */
export type Transition = "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none";

/** The way a screen comes in, Figma's animations and the older moves: at once, fading in, moving in over the one there,
 *  pushing it out, sliding in while it parks a little way off, or growing in from the middle (`expand`); from a side, on
 *  an easing curve, for so long. Easings beyond Figma's: `emphasized` is Material's emphasized curve, `theme` the theme's
 *  own: that curve, or its spring where the theme moves on springs (the expressive motion scheme). */
export type Motion = { kind: "instant" | "dissolve" | "move" | "push" | "slide" | "expand"; dir?: "left" | "right" | "up" | "down"; easing?: "out" | "in" | "inOut" | "linear" | "spring" | "emphasized" | "theme"; ms?: number };
export const MOTION_KINDS = ["instant", "dissolve", "move", "push", "slide", "expand"] as const;
export const MOTION_DIRS = ["left", "right", "up", "down"] as const;
export const MOTION_EASINGS = ["out", "in", "inOut", "linear", "spring", "emphasized", "theme"] as const;
/** the kinds of motion that come in from a side */
export const SIDED_KINDS: readonly Motion["kind"][] = ["move", "push", "slide"];

/** how a sliding transition moves: the axis, where the new screen enters from and where the old one parks, as
 *  fractions of the screen */
export const SLIDE_SPEC: Partial<Record<Transition, { axis: "x" | "y"; enter: number; exit: number }>> = {
  slide: { axis: "x", enter: 1, exit: -0.3 },
  slideLeft: { axis: "x", enter: -1, exit: 0.3 },
  slideUp: { axis: "y", enter: 1, exit: -0.3 },
  slideDown: { axis: "y", enter: -1, exit: 0.3 },
};

/** an easing as a cubic Bézier, or nothing for a spring; `theme` is the emphasized curve unless the theme moves on
 *  springs */
export const EASING_CURVE: Record<NonNullable<Motion["easing"]>, [number, number, number, number] | null> = {
  out: [0, 0, 0.2, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.4, 0, 0.2, 1],
  linear: [0, 0, 1, 1],
  spring: null,
  emphasized: [0.2, 0, 0, 1],
  theme: [0.2, 0, 0, 1],
};

/** where a screen moving in from a side starts, as fractions of the screen along the axis */
export const DIR_OFFSET: Record<NonNullable<Motion["dir"]>, { axis: "x" | "y"; from: number }> = {
  left: { axis: "x", from: 1 },
  right: { axis: "x", from: -1 },
  up: { axis: "y", from: 1 },
  down: { axis: "y", from: -1 },
};

/** Material's emphasized easing, and how long an older slide takes */
export const EASE = [0.2, 0, 0, 1] as const;
export const SLIDE_S = 0.42;
/** M3 Expressive spatial spring, with a visible overshoot: what the expressive motion scheme moves on */
export const SPRING = { type: "spring" as const, stiffness: 360, damping: 26, mass: 1 };

/** The motion each older move plays exactly: a slide on the theme's motion for 0.42 s (Material's emphasized curve, or
 *  the theme's spring), a fade on the emphasized curve for 0.3 s, an expand on the theme's motion for 0.36 s, none at
 *  once. Version 4 of the format (lib/converge.ts) wrote every tap's older transition as one of these. */
export const TRANSITION_MOTIONS: Record<Transition, Motion> = {
  slide: { kind: "slide", dir: "left", easing: "theme", ms: 420 },
  slideLeft: { kind: "slide", dir: "right", easing: "theme", ms: 420 },
  slideUp: { kind: "slide", dir: "up", easing: "theme", ms: 420 },
  slideDown: { kind: "slide", dir: "down", easing: "theme", ms: 420 },
  fade: { kind: "dissolve", easing: "emphasized", ms: 300 },
  expand: { kind: "expand", easing: "theme", ms: 360 },
  none: { kind: "instant" },
};

/** how a tap that says no motion goes to a screen: the older slide */
export const DEFAULT_MOTION: Motion = TRANSITION_MOTIONS.slide;

/** One change of screen: the motion it plays, whether it is being undone (going back), and whether the theme moves on
 *  springs (the expressive motion scheme). `transition` names one of the older moves instead of a motion: what an app's
 *  own moves (the sign-in fade) and an older exported runtime say; a motion given goes over it. */
export type ScreenMove = { motion?: Motion; transition?: Transition; backwards: boolean; spring?: boolean };

type Timing = { duration?: number; ease?: readonly [number, number, number, number]; type?: "spring"; stiffness?: number; damping?: number; mass?: number; zIndex: { duration: number } };
/** where a screen stands at one end of a change, as motion takes it */
export type Pose = { x: string | number; y: string | number; opacity: number; scale: number; zIndex: number; transition?: Timing };
export type Poses = { initial: Pose; animate: Pose; exit: Pose };

const pct = (v: number) => `${v * 100}%`;
/** an offset along one axis, as a share of the screen */
const off = (axis: "x" | "y", v: number) => (axis === "x" ? { x: pct(v), y: 0 } : { x: 0, y: pct(v) });
/* the screen on top changes at once, whatever else eases */
const ZI = { zIndex: { duration: 0 } };
const STILL = { x: 0, y: 0, opacity: 1, scale: 1 };

/** The poses of a motion: at once, a dissolve, growing in from the middle while the screen there grows away (expand),
 *  or the new screen coming in from a side over the one there (move in), pushing it out (push), or while it parks a
 *  little way off (slide in); backwards, the same undone. `spring` is whether the theme moves on springs: what the
 *  `theme` easing plays then. */
export function motionPoses(m: Motion, backwards: boolean, spring = false): Poses {
  const easing = m.easing ?? "out";
  const curve = easing === "theme" && spring ? null : EASING_CURVE[easing];
  const tr: Timing = m.kind === "instant" ? { duration: 0, ...ZI } : curve ? { duration: (m.ms ?? 300) / 1000, ease: curve, ...ZI } : { ...SPRING, ...ZI };
  if (m.kind === "instant") return { initial: { ...STILL, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, zIndex: 1, transition: tr } };
  if (m.kind === "dissolve") return { initial: { ...STILL, opacity: 0, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, opacity: 0, zIndex: 1, transition: tr } };
  if (m.kind === "expand") {
    /* the screen on top is the one coming in, or going back is the one leaving */
    const z = backwards ? 1 : 2;
    return {
      initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: z },
      animate: { ...STILL, zIndex: z, transition: tr },
      exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: backwards ? 2 : 1, transition: tr },
    };
  }
  const d = DIR_OFFSET[m.dir ?? "left"];
  const into = off(d.axis, d.from);
  /* where the screen it covers goes: nowhere, all the way out, or a little way off */
  const away = m.kind === "move" ? STILL : m.kind === "push" ? { ...off(d.axis, -d.from), opacity: 1, scale: 1 } : { ...off(d.axis, -0.3 * d.from), opacity: 0.6, scale: 1 };
  return backwards
    ? { initial: { ...away, zIndex: 1 }, animate: { ...STILL, zIndex: 1, transition: tr }, exit: { ...into, opacity: 1, scale: 1, zIndex: 2, transition: tr } }
    : { initial: { ...into, opacity: 1, scale: 1, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...away, zIndex: 1, transition: tr } };
}

/** The poses of a screen coming in and the one it replaces going off, for one change: its motion (an older move's name
 *  plays the motion it is, none at once). Going back plays the same move in reverse. */
export function screenPoses(c: ScreenMove): Poses {
  return motionPoses(c.motion ?? TRANSITION_MOTIONS[c.transition ?? "none"] ?? TRANSITION_MOTIONS.none, c.backwards, c.spring);
}
