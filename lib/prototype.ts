import { MOTION_DIRS, MOTION_EASINGS, MOTION_KINDS, transitionOf, type Action, type ActionBody, type Frame, type Motion, type Transition, type Trigger } from "./tokens";

/* The prototype the way Figma has it, over the taps the document always had: what starts an interaction (a tap, the
 * pointer coming over a part, time since its screen showed), what it does (go to a screen, lay one over the screen on
 * show, go back, scroll to a part, set variables through its effects) and how the next screen comes in (Figma's
 * animations, with a direction, an easing and a duration). Plain data and the reading of it: the preview plays it
 * (components/Preview.tsx), the panels and the canvas edit it. */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);

/** the longest an animation or a delay runs, in ms */
export const MAX_MS = 10_000;

/** a motion as the document keeps it, or nothing when it is no motion */
export function cleanMotion(v: unknown): Motion | undefined {
  if (!isRecord(v)) return undefined;
  const kind = oneOf(v.kind, MOTION_KINDS);
  if (!kind) return undefined;
  const dir = oneOf(v.dir, MOTION_DIRS);
  const easing = oneOf(v.easing, MOTION_EASINGS);
  const ms = typeof v.ms === "number" && Number.isFinite(v.ms) ? Math.max(0, Math.min(MAX_MS, Math.round(v.ms))) : undefined;
  return { kind, ...(dir && kind !== "instant" && kind !== "dissolve" ? { dir } : {}), ...(easing && kind !== "instant" ? { easing } : {}), ...(ms !== undefined && kind !== "instant" ? { ms } : {}) };
}

/** a trigger as the document keeps it, or nothing when it is none */
export function cleanTrigger(v: unknown): Trigger | undefined {
  if (!isRecord(v)) return undefined;
  if (v.on === "hover") return { on: "hover" };
  if (v.on === "delay" && typeof v.ms === "number" && Number.isFinite(v.ms)) return { on: "delay", ms: Math.max(0, Math.min(MAX_MS, Math.round(v.ms))) };
  return undefined;
}

/** what an older transition is as a motion: the motion the panel shows for an action that has none of its own */
export function motionOf(a: Pick<ActionBody, "transition" | "motion">): Motion {
  if (a.motion) return a.motion;
  const t: Transition = a.transition ?? "slide";
  if (t === "none") return { kind: "instant" };
  if (t === "fade" || t === "expand") return { kind: "dissolve" };
  return { kind: "slide", dir: t === "slideLeft" ? "right" : t === "slideUp" ? "up" : t === "slideDown" ? "down" : "left" };
}

/** an action with another motion, its older transition following */
export const withMotion = <B extends ActionBody>(a: B, m: Motion): B => ({ ...a, motion: m, transition: transitionOf(m) });

/** the trigger an action starts on: a tap, unless it says otherwise */
export const triggerOf = (a: Pick<Action, "trigger"> | undefined): Trigger | { on: "tap" } => a?.trigger ?? { on: "tap" };

/** the screens a flow starts at, in the order the document lists them */
export const flowStarts = (frames: Frame[]): Frame[] => frames.filter((f) => typeof f.flow === "string");

/** an easing as the preview's animations take it: a cubic Bézier, or nothing for a spring */
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
