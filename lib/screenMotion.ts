/* How one screen gives way to another in a prototype: Figma's animations (at once, a dissolve, the new screen moving in
 * over the one there, pushing it out, or sliding in while it parks a little way off), from a side, on an easing curve,
 * for so long, and the transitions documents had before them. Plain data and arithmetic with no imports: the preview
 * (components/Preview.tsx) plays these poses with motion, and an exported app gets a copy of this file and plays the
 * very same ones (lib/exportProject.ts). */

/** the transitions a document had before Figma's animations; what reads only these still plays every action */
export type Transition = "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none";

/** The way a screen comes in, Figma's animations: at once, fading in, moving in over the one there, pushing it out, or
 *  sliding in while it parks; from a side, on an easing curve, for so long. `transition` beside it stays the nearest of
 *  the older kinds (lib/tokens.ts `transitionOf`). */
export type Motion = { kind: "instant" | "dissolve" | "move" | "push" | "slide"; dir?: "left" | "right" | "up" | "down"; easing?: "out" | "in" | "inOut" | "linear" | "spring"; ms?: number };
export const MOTION_KINDS = ["instant", "dissolve", "move", "push", "slide"] as const;
export const MOTION_DIRS = ["left", "right", "up", "down"] as const;
export const MOTION_EASINGS = ["out", "in", "inOut", "linear", "spring"] as const;

/** how a sliding transition moves: the axis, where the new screen enters from and where the old one parks, as
 *  fractions of the screen */
export const SLIDE_SPEC: Partial<Record<Transition, { axis: "x" | "y"; enter: number; exit: number }>> = {
  slide: { axis: "x", enter: 1, exit: -0.3 },
  slideLeft: { axis: "x", enter: -1, exit: 0.3 },
  slideUp: { axis: "y", enter: 1, exit: -0.3 },
  slideDown: { axis: "y", enter: -1, exit: 0.3 },
};

/** an easing as a cubic Bézier, or nothing for a spring */
export const EASING_CURVE: Record<NonNullable<Motion["easing"]>, [number, number, number, number] | null> = {
  out: [0, 0, 0.2, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.4, 0, 0.2, 1],
  linear: [0, 0, 1, 1],
  spring: null,
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

/** One change of screen: the older transition, whether it is being undone (going back), Figma's animation over it
 *  where the action has one, and whether the theme moves on springs (the expressive motion scheme). */
export type ScreenMove = { transition: Transition; backwards: boolean; motion?: Motion; spring?: boolean };

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

/** The poses of one of Figma's animations: at once, a dissolve, or the new screen coming in from a side over the one
 *  there (move in), pushing it out (push), or while it parks a little way off (slide in); backwards, the same undone. */
export function motionPoses(m: Motion, backwards: boolean): Poses {
  const curve = EASING_CURVE[m.easing ?? "out"];
  const tr: Timing = m.kind === "instant" ? { duration: 0, ...ZI } : curve ? { duration: (m.ms ?? 300) / 1000, ease: curve, ...ZI } : { ...SPRING, ...ZI };
  if (m.kind === "instant") return { initial: { ...STILL, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, zIndex: 1, transition: tr } };
  if (m.kind === "dissolve") return { initial: { ...STILL, opacity: 0, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, opacity: 0, zIndex: 1, transition: tr } };
  const d = DIR_OFFSET[m.dir ?? "left"];
  const into = off(d.axis, d.from);
  /* where the screen it covers goes: nowhere, all the way out, or a little way off */
  const away = m.kind === "move" ? STILL : m.kind === "push" ? { ...off(d.axis, -d.from), opacity: 1, scale: 1 } : { ...off(d.axis, -0.3 * d.from), opacity: 0.6, scale: 1 };
  return backwards
    ? { initial: { ...away, zIndex: 1 }, animate: { ...STILL, zIndex: 1, transition: tr }, exit: { ...into, opacity: 1, scale: 1, zIndex: 2, transition: tr } }
    : { initial: { ...into, opacity: 1, scale: 1, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...away, zIndex: 1, transition: tr } };
}

/** The poses of a screen coming in and the one it replaces going off, for one change: Figma's animation where there is
 *  one, else the older transition. Going back plays the same move in reverse. */
export function screenPoses(c: ScreenMove): Poses {
  if (c.motion) return motionPoses(c.motion, c.backwards);
  const s = SLIDE_SPEC[c.transition];
  if (s) {
    const tr: Timing = c.spring ? { ...SPRING, ...ZI } : { duration: SLIDE_S, ease: EASE, ...ZI };
    return c.backwards
      ? {
          initial: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1 },
          animate: { ...STILL, zIndex: 1, transition: tr },
          exit: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2, transition: tr },
        }
      : {
          initial: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2 },
          animate: { ...STILL, zIndex: 2, transition: tr },
          exit: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1, transition: tr },
        };
  }
  if (c.transition === "fade") {
    const tr: Timing = { duration: 0.3, ease: EASE, ...ZI };
    return { initial: { ...STILL, opacity: 0, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, opacity: 0, zIndex: 1, transition: tr } };
  }
  if (c.transition === "expand") {
    const tr: Timing = c.spring ? { ...SPRING, ...ZI } : { duration: 0.36, ease: EASE, ...ZI };
    const z = c.backwards ? 1 : 2;
    return {
      initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: z },
      animate: { ...STILL, zIndex: z, transition: tr },
      exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: c.backwards ? 2 : 1, transition: tr },
    };
  }
  const tr: Timing = { duration: 0, ...ZI };
  return { initial: { ...STILL, zIndex: 2 }, animate: { ...STILL, zIndex: 2, transition: tr }, exit: { ...STILL, zIndex: 1, transition: tr } };
}
