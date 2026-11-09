import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, Text as RNText, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import type { PartBase } from "../atoms/basics";
import { Button, buttonColors } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { elevation, withAlpha } from "../look";
import { withDefaults, type ListRow } from "../parts";
import { capsOf } from "../recipes";
import { Surface } from "../Surface";
import { controlRadius, corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { clockNow } from "../clock";

/* The game parts on a phone (parts/defs/game.ts, parts/defs/more.ts; drawn on the canvas by parts/widgets/Draws.tsx,
 * Joystick.tsx and GameParts.tsx): six prize machines, a movement pad, a skill with a cooldown, the map of a game's
 * levels and a board to play on.
 *
 * The rules of the game are the other side's (docs/边界与契约.md). A machine's prize is its `result` (-1: none yet),
 * `pending` says one is on its way: a press only asks (the `action` place, or an egg), the machine plays its run, settles
 * on the result it is given and says so with `onSettled` ({ index, label }). A press waits for the answer that comes
 * after it: a result already there when it is pressed is played, unless `pending` says a new one is coming. There is
 * no demo here: an exported app never acts out a prize, a cooldown or a turn of its own, it shows what its props say.
 * A cooldown ends when the other side says (`endsAt` on its clock, `clockSkew` ahead of the device's); a board is the
 * cells it is given; a pad hands out the direction a finger pushes (`onValueChange`, "x,y" from -1 to 1) and its
 * letting go (`onRelease`). Motion stops when the device asks for less of it. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** how long a machine plays its run */
export const SPIN_MS = 1200;
/** how often a machine's light, reels or shake move while it runs */
const TICK_MS = 90;

/** whether the device asks for less motion, read when a run starts (a ref: nothing is drawn anew when it changes) */
function useCalm() {
  const calm = useRef(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (live) calm.current = !!v;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => (calm.current = v));
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return calm;
}

/** A value a part holds for the visitor: its own, from the design's, starting again from the design's whenever that
 *  changes; or, when `onChange` is given, the one it is handed (docs/组件规范.md "受控值和草稿"). */
function useDraft<T>(given: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [own, setOwn] = useState({ from: given, value: given });
  const value = onChange ? given : Object.is(own.from, given) ? own.value : given;
  return [
    value,
    (v: T) => {
      setOwn({ from: given, value: v });
      onChange?.(v);
    },
  ];
}

/* ---------- the prize machines ---------- */

/** where a draw is: waiting for a press, playing its run, or settled on a prize; and whether a press waits for its answer */
export type DrawState = { phase: "idle" | "running" | "done"; won: number; runs: number; asked: boolean };
export const DRAW_START: DrawState = { phase: "idle", won: -1, runs: 0, asked: false };

/** the prize a result names among the first `count` (what the machine shows), -1 for none */
export const givenOf = (result: number | undefined, count: number): number => (typeof result === "number" && Number.isInteger(result) && result >= 0 && result < count ? result : -1);

/** whether a press is no press now: a run playing, a press already waiting, or a result on its way */
export const drawBusy = (s: DrawState, pending: boolean) => s.phase === "running" || s.asked || pending;

/** A press: it asks, and waits for its answer. */
export const drawPress = (s: DrawState, pending: boolean, count: number): DrawState => (drawBusy(s, pending) || count === 0 ? s : { ...s, asked: true });

/** What the result and `pending` say to a draw: the prize to play to, if any, and where it is then. A press plays the
 *  answer that comes after it; a settled machine follows its result: told another prize it plays to it, told none it
 *  goes back to waiting for a press. Nothing changes the same state object. */
export function drawAnswer(s: DrawState, given: number, pending: boolean): { state: DrawState; play?: number } {
  if (s.asked) return pending || given < 0 ? { state: s } : { state: { ...s, asked: false }, play: given };
  if (s.phase !== "done" || given === s.won) return { state: s };
  return given < 0 ? { state: { ...s, phase: "idle" } } : { state: s, play: given };
}

/** a run to a prize: one more, so the same prize twice still plays */
export const drawRun = (s: DrawState, pick: number): DrawState => ({ phase: "running", won: pick, runs: s.runs + 1, asked: false });

/** what a machine shows: waiting (a press asked, or a result is on its way), playing, settled, or nothing yet */
export const drawShown = (s: DrawState, pending: boolean): "idle" | "pending" | "running" | "done" => (s.asked || pending ? "pending" : s.phase);

export type DrawProps = PartBase & {
  label?: string;
  prizes?: ListRow[];
  /** the prize the other side gives, by its place in `prizes` (-1: none yet) */
  result?: number;
  /** a result is on its way */
  pending?: boolean;
  size?: number;
  /** the machine has shown the result it was given */
  onSettled?: (e: { index: number; label: string }) => void;
};

/** One draw at a time over the first `count` prizes: `tick` moves while it runs, `runs` counts the runs. */
function useDraw(p: DrawProps, count: number) {
  const prizes = p.prizes ?? [];
  const drawable = Math.min(count, prizes.length);
  const given = givenOf(p.result, drawable);
  const pending = !!p.pending;
  const [s, setS] = useState(DRAW_START);
  const [tick, setTick] = useState(0);
  const calm = useCalm();
  /* What the result says is read as the machine is drawn: the press's own effects (the action it asks with) may have
     cleared the old result or said a new one is pending by then. A change is made here, while drawing, and drawn again
     at once (React's way of following a prop), never in an effect after it showed the old state. */
  const answer = drawAnswer(s, given, pending);
  if (answer.play !== undefined) setS(drawRun(answer.state, answer.play));
  else if (answer.state !== s) setS(answer.state);
  /* the run: the light or the reels move, then it settles and says so; leaving the screen mid-run stops it */
  useEffect(() => {
    if (s.phase !== "running") return;
    const won = s.won;
    const runs = s.runs;
    const step = setInterval(() => setTick((t) => t + 1), TICK_MS);
    const end = setTimeout(
      () => {
        clearInterval(step);
        setS((was) => (was.runs === runs && was.phase === "running" ? { ...was, phase: "done" } : was));
        p.onSettled?.({ index: won, label: prizes[won]?.label ?? "" });
      },
      calm.current ? 0 : SPIN_MS,
    );
    return () => {
      clearInterval(step);
      clearTimeout(end);
    };
  }, [s.phase, s.runs]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = drawBusy(s, pending);
  /** a press (on the button, or an egg): it asks through what the place is wired to, and waits for the answer */
  const press = (slot: string) => {
    if (busy || drawable === 0) return;
    setS(drawPress(s, pending, drawable));
    tapOf(p, slot)?.();
  };
  const phase = drawShown(s, pending);
  return { phase, won: s.won, runs: s.runs, tick, busy, press, calm, prize: s.phase === "done" && !s.asked && !pending ? prizes[s.won] : undefined };
}

/** the prize a machine settled on, said to a screen reader as it comes */
function Result({ prize }: { prize?: ListRow }) {
  const kit = useKit();
  return (
    <View accessibilityLiveRegion="polite" style={{ height: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 4 }}>
      {prize?.icon ? <Glyph name={prize.icon} size={16} color={c(kit, "on-surface")} /> : null}
      {prize ? <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface") }}>{prize.label}</RNText> : null}
    </View>
  );
}

/** the button a machine is pressed with: a small filled button, held (and said to be) while the machine is busy */
function DrawButton({ label, busy, onPress, style }: { label: string; busy: boolean; onPress: () => void; style?: ViewStyle }) {
  const kit = useKit();
  const look = buttonColors(kit, "filled", busy);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || "Draw"} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [{ height: 32, paddingHorizontal: 12, borderRadius: controlRadius(kit, 32), alignItems: "center", justifyContent: "center", ...look.box, opacity: pressed ? 0.85 : 1 }, style]}>
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: look.ink, ...(look.weight ? { fontWeight: look.weight } : null), ...capsOf(kit) }}>{label}</RNText>
    </Pressable>
  );
}

/** the root of a machine: its look on it, as wide as its size */
function Machine({ p, gap, children }: { p: DrawProps; gap: number; children: ReactNode }) {
  const fill = useFill();
  return (
    <Surface base={{ width: Math.round(p.size ?? 220), rowGap: gap, alignItems: "center", alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      {children}
    </Surface>
  );
}

/** a point on a circle, `deg` from the top and turning clockwise */
const polar = (cx: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cx - r * Math.cos(a) };
};

/** how far a wheel has turned after `runs` runs, ending on `won`: five full turns more each time, the winner's wedge
 *  under the pointer at the top (the canvas's turn) */
export const wheelTurn = (won: number, runs: number, count: number) => (won < 0 ? 0 : 360 * 5 * runs - (won + 0.5) * (360 / Math.max(1, count)));

export function PrizeWheel(props: DrawProps) {
  const p = withDefaults<DrawProps>("prize-wheel", props);
  const kit = useKit();
  const prizes = p.prizes ?? [];
  const d = useDraw(p, prizes.length);
  const size = Math.round(p.size ?? 220);
  const half = size / 2;
  const sweep = 360 / Math.max(1, prizes.length);
  const [turn] = useState(() => new Animated.Value(0));
  const spin = useMemo(() => turn.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"], extrapolate: "extend" }), [turn]);
  const to = wheelTurn(d.won, d.runs, prizes.length);
  useEffect(() => {
    const run = Animated.timing(turn, { toValue: to, duration: d.calm.current ? 0 : SPIN_MS, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [turn, to, d.calm]);
  const wedge = (i: number) => {
    const a = polar(half, half, i * sweep);
    const b = polar(half, half, (i + 1) * sweep);
    return `M${half} ${half}L${a.x} ${a.y}A${half} ${half} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}Z`;
  };
  return (
    <Machine p={p} gap={4}>
      <View style={{ width: size, height: size }}>
        <Animated.View testID={p.testID ? `${p.testID}-track` : undefined} style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
          <Svg width={size} height={size} pointerEvents="none">
            {prizes.length <= 1 ? <Circle cx={half} cy={half} r={half - 0.5} fill={c(kit, "surface-container-low")} /> : prizes.map((_, i) => <Path key={i} d={wedge(i)} fill={c(kit, i % 2 ? "surface-container-high" : "surface-container-low")} />)}
            <Circle cx={half} cy={half} r={half - 0.5} fill="none" stroke={c(kit, "outline-variant")} strokeWidth={1} />
          </Svg>
          {prizes.map((it, i) => {
            const at = polar(half, size * 0.36, (i + 0.5) * sweep);
            const w = it.icon ? 20 : 64;
            return (
              <View key={i} pointerEvents="none" style={{ position: "absolute", left: at.x - w / 2, top: at.y - 10, width: w, height: 20, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${(i + 0.5) * sweep}deg` }] }}>
                {it.icon ? <Glyph name={it.icon} size={20} color={c(kit, "on-surface")} /> : <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface") }}>{it.label}</RNText>}
              </View>
            );
          })}
        </Animated.View>
        {/* the pointer at the top, over the wedge that wins */}
        <View pointerEvents="none" style={{ position: "absolute", top: -4, left: half - 8, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 12, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: c(kit, "primary") }} />
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} />
        </View>
      </View>
      <Result prize={d.prize} />
    </Machine>
  );
}

/** the eight cells around the middle of a grid, in the order the light walks round them */
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

/** the cell of the ring that is lit: the light walking round while it runs, the prize once settled */
export const litOf = (phase: string, tick: number, won: number, count: number) => (phase === "running" ? tick % Math.max(1, count) : phase === "done" ? won : -1);

export function GridDraw(props: DrawProps) {
  const p = withDefaults<DrawProps>("grid-draw", props);
  const kit = useKit();
  /* the grid shows eight prizes: a result past them is none it could light up */
  const shown = (p.prizes ?? []).slice(0, 8);
  const d = useDraw(p, shown.length);
  const size = Math.round(p.size ?? 240);
  const lit = litOf(d.phase, d.tick, d.won, shown.length);
  const cell = (n: number) => {
    if (n === 4)
      return (
        <DrawButton key={n} label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} style={{ flex: 1, height: "100%", paddingHorizontal: 4, borderRadius: corner(kit, "md") }} />
      );
    const at = RING.indexOf(n);
    const it = shown[at];
    const on = at === lit;
    const ink = c(kit, on ? "on-primary-container" : "on-surface");
    return (
      <View key={n} accessibilityState={{ selected: on }} style={{ flex: 1, borderRadius: corner(kit, "md"), overflow: "hidden", alignItems: "center", justifyContent: "center", rowGap: 2, backgroundColor: c(kit, on ? "primary-container" : "surface-container") }}>
        {it?.icon ? <Glyph name={it.icon} size={20} color={ink} /> : null}
        <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: ink, textAlign: "center" }}>{it?.label ?? ""}</RNText>
      </View>
    );
  };
  return (
    <Machine p={p} gap={4}>
      <View style={{ width: size, height: size, rowGap: 4 }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flex: 1, flexDirection: "row", columnGap: 4 }}>
            {[0, 1, 2].map((col) => cell(row * 3 + col))}
          </View>
        ))}
      </View>
      <Result prize={d.prize} />
    </Machine>
  );
}

const DOTS = ["primary-container", "secondary-container", "tertiary-container"];

export function Gacha(props: DrawProps) {
  const p = withDefaults<DrawProps>("gacha", props);
  const kit = useKit();
  const d = useDraw(p, (p.prizes ?? []).length);
  const size = Math.round(p.size ?? 170);
  const shake = d.phase === "running" && !d.calm.current ? (d.tick % 2 ? -3 : 3) : 0;
  const dot = Math.max(4, (size - 40 - 12) / 4);
  return (
    <Machine p={p} gap={8}>
      <View style={{ width: size, height: size, borderRadius: size / 2, padding: 20, backgroundColor: c(kit, "surface-container-high"), flexDirection: "row", flexWrap: "wrap", alignContent: "center", gap: 4, transform: [{ translateX: shake }] }}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c(kit, DOTS[i % 3]) }} />
        ))}
      </View>
      <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} />
      <Result prize={d.prize} />
    </Machine>
  );
}

/** the three reels' prizes to stop on, from words like "1,3,2": a miss shows unlike prizes; none given, three alike */
export const reelsOf = (reels: string | undefined, count: number): number[] | null => {
  const at = (reels ?? "").split(/[\s,，]+/).filter(Boolean).map(Number);
  return at.length === 3 && at.every((n) => Number.isInteger(n) && n >= 0 && n < count) ? at : null;
};

/** what a reel shows: the prizes rolling past while it runs, where it stopped once settled, a row of prizes before */
export const reelAt = (phase: string, tick: number, reel: number, won: number, stops: number[] | null, count: number) => (phase === "running" ? (tick + reel * 2) % Math.max(1, count) : phase === "done" ? (stops ? stops[reel] : won) : reel % Math.max(1, count));

export type SlotMachineProps = DrawProps & { reels?: string };

export function SlotMachine(props: SlotMachineProps) {
  const p = withDefaults<SlotMachineProps>("slot-machine", props);
  const kit = useKit();
  const prizes = p.prizes ?? [];
  const d = useDraw(p, prizes.length);
  const stops = reelsOf(p.reels, prizes.length);
  return (
    <Machine p={p} gap={8}>
      <View style={{ alignSelf: "stretch", flexDirection: "row", columnGap: 8, padding: 12, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high") }}>
        {[0, 1, 2].map((reel) => {
          const it = prizes[reelAt(d.phase, d.tick, reel, d.won, stops, prizes.length)];
          return (
            <View key={reel} style={{ flex: 1, height: 64, borderRadius: corner(kit, "md"), overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: c(kit, "surface") }}>
              {it?.icon ? <Glyph name={it.icon} size={28} color={c(kit, "on-surface")} /> : <RNText numberOfLines={2} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface"), textAlign: "center" }}>{it?.label ?? ""}</RNText>}
            </View>
          );
        })}
      </View>
      <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} />
      <Result prize={d.prize} />
    </Machine>
  );
}

export function MoneyTree(props: DrawProps) {
  const p = withDefaults<DrawProps>("money-tree", props);
  const kit = useKit();
  const d = useDraw(p, (p.prizes ?? []).length);
  const sway = d.phase === "running" && !d.calm.current ? (d.tick % 2 ? -6 : 6) : 0;
  return (
    <Machine p={p} gap={8}>
      {/* it sways from the foot of its trunk */}
      <View style={{ width: 96, height: 96, transformOrigin: "50% 100%", transform: [{ rotate: `${sway}deg` }] }}>
        <Glyph name="park" size={96} color={c(kit, "primary")} />
      </View>
      <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} />
      <Result prize={d.prize} />
    </Machine>
  );
}

/** an egg in a 64 × 80 box, rounder at its foot */
const EGG = "M32 0C50 0 64 28 64 50C64 68 50 80 32 80C14 80 0 68 0 50C0 28 14 0 32 0Z";

export function EggSmash(props: DrawProps) {
  const p = withDefaults<DrawProps>("egg-smash", props);
  const kit = useKit();
  const d = useDraw(p, (p.prizes ?? []).length);
  /* which egg the visitor hit: the machine's own, drawn broken while it plays and once it settles */
  const [chosen, setChosen] = useState(-1);
  return (
    <Machine p={p} gap={8}>
      {p.label ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.label}</RNText> : null}
      <View style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "space-around" }}>
        {[0, 1, 2].map((egg) => {
          const broken = chosen === egg && d.phase !== "idle";
          return (
            <Pressable
              key={egg}
              accessibilityRole="button"
              accessibilityLabel={`${p.label || "Egg"} ${egg + 1}`}
              accessibilityState={{ disabled: d.busy, selected: broken }}
              disabled={d.busy}
              onPress={() => {
                setChosen(egg);
                d.press(`egg:${egg}`);
              }}
              style={{ width: 64, height: 80 }}
            >
              <Svg width={64} height={80} pointerEvents="none">
                <Path d={EGG} fill={c(kit, broken ? "outline-variant" : "tertiary-container")} />
              </Svg>
            </Pressable>
          );
        })}
      </View>
      <Result prize={d.prize} />
    </Machine>
  );
}

/* ---------- the movement pad ---------- */

/** how far the knob travels from the middle, as a share of the pad's side */
const TRAVEL = 0.32;

export type Vec = { x: number; y: number };

const clamp1 = (n: number) => Math.min(1, Math.max(-1, n));
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** a direction in degrees, 0 at the top and turning clockwise, at full travel */
export const fromAngle = (angle: number): Vec => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: round2(Math.cos(rad)), y: round2(Math.sin(rad)) };
};

/** a direction's angle in whole degrees, 0 at the top and turning clockwise */
export const angleOf = ({ x, y }: Vec) => {
  const deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
  return Math.round(((deg % 360) + 360) % 360);
};

/** "x,y" as a direction; undefined for anything else */
export const vecOf = (value: string | undefined): Vec | undefined => {
  if (!value || !value.includes(",")) return undefined;
  const [x, y, more] = value.split(",").map((s) => Number(s.trim()));
  return more === undefined && Number.isFinite(x) && Number.isFinite(y) ? { x: clamp1(x), y: clamp1(y) } : undefined;
};

/** a direction as the words its value is */
export const wordsOfVec = (v: Vec) => `${round2(v.x)},${round2(v.y)}`;

/** The direction of a finger `dx`, `dy` from the middle of a pad that lets the knob travel `travel`: full travel at the
 *  rim and past it, and nothing at all near the middle, which is no direction (rather than a random angle). */
export function pushOf(dx: number, dy: number, travel: number): Vec {
  const far = Math.hypot(dx, dy);
  if (far < travel * 0.22) return { x: 0, y: 0 };
  const reach = Math.max(far, travel);
  return { x: round2(clamp1(dx / reach)), y: round2(clamp1(dy / reach)) };
}

/** the way each of a screen reader's actions pushes it, at full travel */
const PUSH: Record<string, Vec> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export type JoystickProps = PartBase & {
  size?: number;
  /** the direction it rests in when nothing gives one (0: the middle) */
  angle?: number;
  /** back to the middle when the finger lets go */
  autoCenter?: boolean;
  /** the direction, "x,y" from -1 to 1 */
  value?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** the direction the finger pushes, while it does and once more as it lets go */
  onValueChange?: (value: string) => void;
  /** the finger let go, where it was */
  onRelease?: (at: Vec) => void;
};

export function Joystick(props: JoystickProps) {
  const p = withDefaults<JoystickProps>("joystick", props);
  const kit = useKit();
  const size = Math.round(p.size ?? 132);
  /* where the finger holds the knob, while it does: the pad's own, however fast the value comes back */
  const [held, setHeld] = useState<Vec | null>(null);
  /* where it was let go, while nothing says otherwise and it stays put */
  const [left, setLeft] = useState<{ at: Vec; given: string } | null>(null);
  const given = vecOf(p.value);
  const controlled = !!p.onValueChange;
  const resting = left && left.given === (p.value ?? "") && !controlled ? left.at : (given ?? ((p.angle ?? 0) > 0 ? fromAngle(p.angle ?? 0) : { x: 0, y: 0 }));
  const shown = held ?? resting;
  const out = shown.x !== 0 || shown.y !== 0;
  const r = Math.max(8, Math.round(size * TRAVEL));
  const side = Math.max(24, Math.round(size * 0.34));
  /* the finger's direction, from where it is on the pad (what the pad holds lets touches through, so the place is the
     pad's own) */
  const pointAt = (e: GestureResponderEvent) => pushOf(e.nativeEvent.locationX - size / 2, e.nativeEvent.locationY - size / 2, size * TRAVEL);
  const push = (at: Vec) => {
    setHeld(at);
    p.onValueChange?.(wordsOfVec(at));
  };
  const letGo = (at: Vec) => {
    const rest = p.autoCenter !== false ? { x: 0, y: 0 } : at;
    p.onRelease?.({ x: at.x, y: at.y });
    setHeld(null);
    setLeft({ at: rest, given: p.value ?? "" });
    p.onValueChange?.(wordsOfVec(rest));
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => !p.disabled,
    onMoveShouldSetPanResponderCapture: () => !p.disabled,
    onPanResponderGrant: (e) => push(pointAt(e)),
    onPanResponderMove: (e) => push(pointAt(e)),
    /* where the finger left it, read off the event itself: the last move may not have been drawn yet */
    onPanResponderRelease: (e) => letGo(pointAt(e)),
    onPanResponderTerminate: () => letGo(held ?? { x: 0, y: 0 }),
  });
  /* a screen reader pushes it one way and lets go, as a tap of an arrow key does on the web */
  const onAction = (e: AccessibilityActionEvent) => {
    const to = PUSH[e.nativeEvent.actionName];
    if (!to || p.disabled) return;
    push(to);
    letGo(to);
  };
  return (
    <Surface base={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c(kit, "surface-container-high"), opacity: p.disabled ? 0.38 : 1, alignSelf: "flex-start" }} appearance={p}>
      <View
        testID={p.testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={p.ariaLabel || "Joystick"}
        accessibilityState={{ disabled: !!p.disabled }}
        accessibilityValue={{ min: 0, max: 360, now: out ? angleOf(shown) : 0, text: wordsOfVec(shown) }}
        accessibilityActions={Object.keys(PUSH).map((name) => ({ name, label: name[0].toUpperCase() + name.slice(1) }))}
        onAccessibilityAction={onAction}
        style={{ width: size, height: size }}
        {...(p.disabled ? null : pan.panHandlers)}
      >
        <View pointerEvents="none" style={{ position: "absolute", left: size / 2 - 3, top: size / 2 - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: c(kit, "outline-variant") }} />
        <View pointerEvents="none" testID={p.testID ? `${p.testID}-knob` : undefined} style={{ position: "absolute", width: side, height: side, borderRadius: side / 2, left: size / 2 + Math.round(shown.x * r) - side / 2, top: size / 2 + Math.round(shown.y * r) - side / 2, backgroundColor: c(kit, out || held ? "primary" : "primary-container"), boxShadow: elevation(1) }} />
      </View>
    </Surface>
  );
}

/* ---------- a skill with a cooldown ---------- */


/** seconds left of a cooldown that ends at `endsAt` (ms on the other side's clock), none once it has passed or with none */
export const cooldownLeft = (endsAt: number | undefined, now: number) => (endsAt && endsAt > 0 ? Math.max(0, (endsAt - now) / 1000) : 0);

/** Draws again every `ms` while `on`, for what is read off a clock. */
function useTicking(on: boolean, ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** a pie from the top, turning clockwise, `share` of a circle `side` across */
function piePath(side: number, share: number) {
  const h = side / 2;
  if (share >= 0.999) return `M${h} 0A${h} ${h} 0 1 1 ${h - 0.01} 0Z`;
  const end = polar(h, h, share * 360);
  return `M${h} ${h}L${h} 0A${h} ${h} 0 ${share > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}Z`;
}

export type SkillButtonProps = PartBase & { icon?: string; label?: string; cooldown?: number; endsAt?: number; clockSkew?: number; disabled?: boolean; size?: number };

export function SkillButton(props: SkillButtonProps) {
  const p = withDefaults<SkillButtonProps>("skill-button", props);
  const kit = useKit();
  const fill = useFill();
  const size = Math.round(p.size ?? 72);
  const left = cooldownLeft(p.endsAt, clockNow(p.clockSkew));
  const cooling = left > 0;
  useTicking(cooling, 100);
  const blocked = cooling || !!p.disabled;
  /* the cooldown's length is only how much of the ring is dark */
  const ring = Math.min(1, left / Math.max(0.1, p.cooldown ?? 5));
  const ask = blocked ? undefined : tapOf(p, "action");
  return (
    <Surface base={{ width: size, rowGap: 4, alignItems: "center", alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      <Pressable accessibilityRole="button" accessibilityLabel={p.label || p.icon} accessibilityState={{ disabled: blocked, busy: cooling }} accessibilityValue={cooling ? { text: `${Math.ceil(left)}` } : undefined} disabled={blocked} onPress={ask} style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: c(kit, "primary") }}>
        <Glyph name={p.icon ?? "bolt"} size={Math.round(size / 2)} color={c(kit, "on-primary")} />
        {cooling ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
            <Svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }}>
              <Path d={piePath(size, ring)} fill={withAlpha(c(kit, "scrim"), 0.65)} />
            </Svg>
            <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "inverse-on-surface"), fontVariant: ["tabular-nums"] }}>{String(Math.ceil(left))}</RNText>
          </View>
        ) : null}
      </Pressable>
      {/* the label is part of the skill: while it cools down a press on it is no press at all */}
      {p.label ? (
        <Pressable accessible={false} disabled={blocked} onPress={ask} style={{ alignSelf: "stretch" }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface"), textAlign: "center" }}>{p.label}</RNText>
        </Pressable>
      ) : null}
    </Surface>
  );
}

/* ---------- the map of a game's levels ---------- */

const ROW_H = 92;

/** where level `i` stands on a map `width` wide with `columns` to a row: the path turns back at the end of each row */
export function levelAt(i: number, columns: number, width: number) {
  const row = Math.floor(i / columns);
  const col = row % 2 ? columns - 1 - (i % columns) : i % columns;
  return { x: ((col + 0.5) / columns) * width, y: row * ROW_H + ROW_H / 2 };
}

/** the stars earned on each level, from words like "3,2,3" */
export const starsOf = (stars: string | undefined) => (stars ?? "").split(/[\s,，]+/).map((s) => Math.min(3, Math.max(0, Number(s) || 0)));

export type LevelMapProps = PartBase & {
  levels?: number;
  /** the level reached, counted from 0 as every place is; the map shows it counted from 1 */
  level?: number;
  /** the level picked (-1: none): the visitor's, starting at the design's */
  selected?: number;
  stars?: string;
  perRow?: number;
  width?: number;
  /** told of the level picked; given, `selected` says which is picked */
  onSelect?: (index: number) => void;
};

export function LevelMap(props: LevelMapProps) {
  const p = withDefaults<LevelMapProps>("level-map", props);
  const kit = useKit();
  const fill = useFill();
  const levels = Math.max(0, Math.round(p.levels ?? 12));
  const current = Math.round(p.level ?? 4) + 1;
  const columns = Math.max(2, Math.round(p.perRow ?? 4));
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.round(p.width ?? 380);
  const [on, pick] = useDraft(Math.round(p.selected ?? -1), p.onSelect);
  const earned = starsOf(p.stars);
  const height = Math.ceil(levels / columns) * ROW_H;
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), height, borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onLayout={(e: LayoutChangeEvent) => setMeasured(Math.round(e.nativeEvent.layout.width))} pointerEvents="none">
        <Svg width={width} height={height}>
          {Array.from({ length: Math.max(0, levels - 1) }, (_, i) => {
            const a = levelAt(i, columns, width);
            const b = levelAt(i + 1, columns, width);
            return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={4} stroke={c(kit, i + 1 < current ? "primary" : "outline-variant")} />;
          })}
        </Svg>
      </View>
      {Array.from({ length: levels }, (_, i) => {
        const n = i + 1;
        const at = levelAt(i, columns, width);
        const locked = n > current;
        const here = n === current;
        const picked = i === on;
        return (
          <View key={i} pointerEvents="box-none" style={{ position: "absolute", left: at.x - 28, top: at.y - 28, width: 56, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: here ? withAlpha(c(kit, "primary"), 0.3) : "transparent", borderWidth: picked ? 2 : 0, borderColor: c(kit, "primary") }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${n}`}
                accessibilityState={{ disabled: locked, selected: picked }}
                disabled={locked}
                onPress={() => {
                  pick(i);
                  tapOf(p, `tab:${i}`)?.();
                }}
                style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, locked ? "surface-container-high" : here ? "primary" : "primary-container") }}
              >
                {locked ? <Glyph name="lock" size={20} color={c(kit, "on-surface-variant")} /> : <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, here ? "on-primary" : "on-primary-container") }}>{String(n)}</RNText>}
              </Pressable>
            </View>
            {!locked && !here ? (
              <View style={{ flexDirection: "row", marginTop: -4 }} accessibilityLabel={`${earned[i] ?? 0} / 3`}>
                {[0, 1, 2].map((s) => (
                  <View key={s} style={{ opacity: s >= (earned[i] ?? 0) ? 0.3 : 1 }}>
                    <Glyph name="star" size={12} filled color={c(kit, "tertiary")} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a board to play on ---------- */

/** cells from words like "X,,O": as many as the board has */
export const boardOf = (cells: string | undefined, size: number) => {
  const given = (cells ?? "").split(",").map((s) => s.trim());
  return Array.from({ length: size }, (_, i) => given[i] ?? "");
};

/** picked cells from words like "1,5", counted from 1 */
export const pickedOf = (picked: string | undefined, size: number) => [...new Set((picked ?? "").split(/[\s,，]+/).map((s) => Number(s) - 1).filter((n) => Number.isInteger(n) && n >= 0 && n < size))];

/** What a board says above it: what the other side tells; told nothing, the design's own words for the opening (whose
 *  turn it is at the start). Who won, and whose turn it is now, are the game's to say: the kit works out neither. */
export function boardStatus(told: string | undefined, mode: string | undefined, turnText: string | undefined, marks: string | undefined) {
  if (told) return told;
  if (mode !== "mark") return "";
  const first = (marks ?? "").split(/[\s,，]+/).filter(Boolean)[0] ?? "X";
  return (turnText ?? "").replace("{mark}", first);
}

export type GameBoardProps = PartBase & {
  mode?: "mark" | "select";
  rows?: number;
  columns?: number;
  cells?: string;
  status?: string;
  picked?: string;
  marks?: string;
  need?: number;
  turnText?: string;
  winText?: string;
  drawText?: string;
  reset?: string;
  width?: number;
};

export function GameBoard(props: GameBoardProps) {
  const p = withDefaults<GameBoardProps>("game-board", props);
  const kit = useKit();
  const fill = useFill();
  const rows = Math.max(1, Math.round(p.rows ?? 3));
  const columns = Math.max(1, Math.round(p.columns ?? 3));
  const size = Math.min(400, rows * columns);
  const board = boardOf(p.cells, size);
  const picked = pickedOf(p.picked, size);
  const status = boardStatus(p.status, p.mode, p.turnText, p.marks);
  const [inner, setInner] = useState(0);
  const room = inner || Math.max(0, Math.round(p.width ?? 320) - 24);
  const side = Math.max(0, (room - 4 * (columns - 1)) / columns);
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), padding: 12, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      {status ? <RNText accessibilityLiveRegion="polite" style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface"), textAlign: "center" }}>{status}</RNText> : null}
      <View onLayout={(e: LayoutChangeEvent) => setInner(Math.round(e.nativeEvent.layout.width))} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {board.map((mark, i) => {
          const on = picked.includes(i);
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i + 1}`} accessibilityValue={mark ? { text: mark } : undefined} accessibilityState={{ selected: on }} onPress={tapOf(p, `cell:${i}`)} style={{ width: side, height: side, borderRadius: corner(kit, "md"), alignItems: "center", justifyContent: "center", backgroundColor: c(kit, on ? "primary" : mark ? "primary-container" : "surface-container-high") }}>
              <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, on ? "on-primary" : mark ? "on-primary-container" : "on-surface") }}>{mark}</RNText>
            </Pressable>
          );
        })}
      </View>
      {p.reset ? <Button label={p.reset} variant="text" onPress={tapOf(p, "reset")} /> : null}
    </Surface>
  );
}
