import { View, type CommonEvent, type ITouchEvent } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { buttonColors, inkCss } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { withDefaults, type ListRow } from "../parts";
import { capsOf } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";
import { clockNow } from "../clock";

/* The game parts in a mini-program (parts/defs/game.ts, parts/defs/more.ts; drawn on the canvas by
 * parts/widgets/Draws.tsx, Joystick.tsx and GameParts.tsx): six prize machines, a movement pad, a skill with a cooldown,
 * the map of a game's levels and a board to play on.
 *
 * The rules of the game are the other side's (docs/边界与契约.md). A machine's prize is its `result` (-1: none yet),
 * `pending` says one is on its way: a press only asks (the `action` place, or an egg), the machine plays its run, settles
 * on the result it is given and says so with `onSettled` ({ index, label }). A press waits for the answer that comes
 * after it: a result already there when it is pressed is played, unless `pending` says a new one is coming. There is
 * no demo here: an exported mini-program never acts out a prize, a cooldown or a turn of its own, it shows what its
 * props say. A cooldown ends when the other side says (`endsAt` on its clock, `clockSkew` ahead of the device's); a
 * board is the cells it is given; a pad hands out the direction a finger pushes (`onValueChange`, "x,y" from -1 to 1)
 * and its letting go (`onRelease`). Motion stops where the page asks for less of it (H5's reduced motion). */

/** how long a machine plays its run */
export const SPIN_MS = 1200;
/** how often a machine's light, reels or shake move while it runs */
const TICK_MS = 90;

/** whether the page asks for less motion: a mini-program's WebView says nothing, H5 says what the browser does */
const calm = () => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

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

/** a press on a view, stopped there (a button in a row is not a tap on the row) */
const pressOf = (run: (() => void) | undefined) => (run ? (e: ITouchEvent) => (e.stopPropagation(), run()) : undefined);

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
  /* What the result says is read as the machine is drawn: the press's own effects (the action it asks with) may have
     cleared the old result or said a new one is pending by then. A change is made here, while drawing, and drawn again
     at once (React's way of following a prop), never in an effect after it showed the old state. */
  const answer = drawAnswer(s, given, pending);
  if (answer.play !== undefined) setS(drawRun(answer.state, answer.play));
  else if (answer.state !== s) setS(answer.state);
  /* the run: the light or the reels move, then it settles and says so; leaving the page mid-run stops it */
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
      calm() ? 0 : SPIN_MS,
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
  return { phase: drawShown(s, pending), won: s.won, runs: s.runs, tick, busy, press, prize: s.phase === "done" && !s.asked && !pending ? prizes[s.won] : undefined };
}

/** the prize a machine settled on, said to a screen reader as it comes */
function Result({ prize }: { prize?: ListRow }) {
  const kit = useKit();
  return (
    <View ariaRole="status" style={sx(ROW, { height: 24, justifyContent: "center", columnGap: 4 })}>
      {prize?.icon ? <Glyph name={prize.icon} size={16} color="on-surface" /> : null}
      {prize ? <Words text={prize.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface") }} /> : null}
    </View>
  );
}

/** the button a machine is pressed with: a small filled button, held while the machine is busy */
function DrawButton({ label, busy, onPress, style }: { label: string; busy: boolean; onPress: () => void; style?: CSS }) {
  const kit = useKit();
  const look = buttonColors(kit, "filled", busy);
  return (
    <View ariaRole="button" ariaLabel={label || "Draw"} hoverClass={busy ? "none" : "m3e-pressed"} onClick={pressOf(busy ? undefined : onPress)} style={sx(merge(ROW, { height: 32, paddingLeft: 12, paddingRight: 12, boxSizing: "border-box", justifyContent: "center", borderRadius: controlRadius(kit, 32), flexShrink: 0 }, look.box, style))}>
      <Words text={label} lines={1} style={merge(typeStyle(kit, "label-large"), { color: inkCss(look.ink), textAlign: "center" }, look.weight ? { fontWeight: look.weight } : null, capsOf(kit))} />
    </View>
  );
}

/** the root of a machine: its look on it, as wide as its size */
function Machine({ p, gap, children }: { p: DrawProps; gap: number; children: ReactNode }) {
  const fill = useFill();
  return (
    <Surface base={{ display: "flex", flexDirection: "column", alignItems: "center", rowGap: gap, width: Math.round(p.size ?? 220), alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      {children}
    </Surface>
  );
}

/** how far a wheel has turned after `runs` runs, ending on `won`: five full turns more each time, the winner's wedge
 *  under the pointer at the top (the canvas's turn) */
export const wheelTurn = (won: number, runs: number, count: number) => (won < 0 ? 0 : 360 * 5 * runs - (won + 0.5) * (360 / Math.max(1, count)));

/** the wedges of a wheel as the canvas paints them: a conic gradient of the two container roles in turn */
export const wheelStops = (count: number) => {
  const sweep = 360 / Math.max(1, count);
  return Array.from({ length: Math.max(1, count) }, (_, i) => `${c(i % 2 ? "surface-container-high" : "surface-container-low")} ${i * sweep}deg ${(i + 1) * sweep}deg`).join(", ");
};

export function PrizeWheel(props: DrawProps) {
  const p = withDefaults<DrawProps>("prize-wheel", props);
  const kit = useKit();
  const prizes = p.prizes ?? [];
  const d = useDraw(p, prizes.length);
  const size = Math.round(p.size ?? 220);
  const sweep = 360 / Math.max(1, prizes.length);
  return (
    <Machine p={p} gap={4}>
      <View style={sx({ position: "relative", width: size, height: size, flexShrink: 0 })}>
        <View style={sx({ position: "relative", width: size, height: size, boxSizing: "border-box", borderRadius: "50%", border: `1px solid ${c("outline-variant")}`, background: `conic-gradient(${wheelStops(prizes.length)})`, transform: `rotate(${wheelTurn(d.won, d.runs, prizes.length)}deg)`, transition: calm() ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.2, 0, 0, 1)` })}>
          {prizes.map((it, i) => (
            <View key={i} style={sx(ROW, { position: "absolute", left: "50%", top: "50%", justifyContent: "center", transform: `translate(-50%, -50%) rotate(${(i + 0.5) * sweep}deg) translateY(${-size * 0.36}px)` })}>
              {it.icon ? <Glyph name={it.icon} size={20} color="on-surface" /> : <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface") }} />}
            </View>
          ))}
        </View>
        {/* the pointer at the top, over the wedge that wins */}
        <View style={sx({ position: "absolute", top: -4, left: "50%", marginLeft: -8, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `12px solid ${c("primary")}` })} />
        <View style={sx(ROW, { position: "absolute", left: 0, top: 0, width: size, height: size, justifyContent: "center", pointerEvents: "none" })}>
          <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} style={{ pointerEvents: "auto" }} />
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
  return (
    <Machine p={p} gap={4}>
      <View style={sx({ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: 4, width: size, height: size })}>
        {Array.from({ length: 9 }, (_, n) => {
          if (n === 4) return <DrawButton key={n} label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} style={{ width: "100%", height: "100%", paddingLeft: 4, paddingRight: 4, borderRadius: corner(kit, "md") }} />;
          const at = RING.indexOf(n);
          const it = shown[at];
          const on = at === lit;
          const ink = on ? "on-primary-container" : "on-surface";
          return (
            <View key={n} ariaSelected={on} style={sx({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", rowGap: 2, overflow: "hidden", borderRadius: corner(kit, "md"), backgroundColor: c(on ? "primary-container" : "surface-container") })}>
              {it?.icon ? <Glyph name={it.icon} size={20} color={ink} /> : null}
              <Words text={it?.label ?? ""} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c(ink), textAlign: "center" }} />
            </View>
          );
        })}
      </View>
      <Result prize={d.prize} />
    </Machine>
  );
}

const DOTS = ["primary-container", "secondary-container", "tertiary-container"];

export function Gacha(props: DrawProps) {
  const p = withDefaults<DrawProps>("gacha", props);
  const d = useDraw(p, (p.prizes ?? []).length);
  const size = Math.round(p.size ?? 170);
  const shake = d.phase === "running" && !calm() ? (d.tick % 2 ? -3 : 3) : 0;
  return (
    <Machine p={p} gap={8}>
      <View style={sx({ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", alignContent: "center", gap: 4, boxSizing: "border-box", width: size, height: size, padding: 20, borderRadius: "50%", backgroundColor: c("surface-container-high"), transform: `translateX(${shake}px)` })}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={sx({ width: "100%", paddingTop: "100%", borderRadius: "50%", backgroundColor: c(DOTS[i % 3]) })} />
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
      <View style={sx(ROW, { alignSelf: "stretch", columnGap: 8, padding: 12, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high") })}>
        {[0, 1, 2].map((reel) => {
          const it = prizes[reelAt(d.phase, d.tick, reel, d.won, stops, prizes.length)];
          return (
            <View key={reel} style={sx(ROW, { flex: 1, minWidth: 0, height: 64, justifyContent: "center", overflow: "hidden", borderRadius: corner(kit, "md"), backgroundColor: c("surface") })}>
              {it?.icon ? <Glyph name={it.icon} size={28} color="on-surface" /> : <Words text={it?.label ?? ""} lines={2} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface"), textAlign: "center" }} />}
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
  const d = useDraw(p, (p.prizes ?? []).length);
  const sway = d.phase === "running" && !calm() ? (d.tick % 2 ? -6 : 6) : 0;
  return (
    <Machine p={p} gap={8}>
      {/* it sways from the foot of its trunk */}
      <View style={sx({ width: 96, height: 96, transform: `rotate(${sway}deg)`, transformOrigin: "bottom center" })}>
        <Glyph name="park" size={96} color="primary" />
      </View>
      <DrawButton label={p.label ?? ""} busy={d.busy} onPress={() => d.press("action")} />
      <Result prize={d.prize} />
    </Machine>
  );
}

export function EggSmash(props: DrawProps) {
  const p = withDefaults<DrawProps>("egg-smash", props);
  const kit = useKit();
  const d = useDraw(p, (p.prizes ?? []).length);
  /* which egg the visitor hit: the machine's own, drawn broken while it plays and once it settles */
  const [chosen, setChosen] = useState(-1);
  return (
    <Machine p={p} gap={8}>
      {p.label ? <Words text={p.label} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null}
      <View style={sx(ROW, { alignSelf: "stretch", justifyContent: "space-around" })}>
        {[0, 1, 2].map((egg) => {
          const broken = chosen === egg && d.phase !== "idle";
          return (
            <View
              key={egg}
              ariaRole="button"
              ariaLabel={`${p.label || "Egg"} ${egg + 1}`}
              ariaSelected={broken}
              hoverClass={d.busy ? "none" : "m3e-pressed"}
              onClick={pressOf(
                d.busy
                  ? undefined
                  : () => {
                      setChosen(egg);
                      d.press(`egg:${egg}`);
                    },
              )}
              style={sx({ width: 64, height: 80, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%", backgroundColor: c(broken ? "outline-variant" : "tertiary-container") })}
            />
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

/** where a pad at rest stands: where it was let go while its value is what it was then (with nothing taking its value),
 *  else the value it is given, else the direction the design draws it in (0: the middle) */
export function restingOf(left: { at: Vec; given: string } | null, value: string | undefined, controlled: boolean, angle: number | undefined): Vec {
  if (left && left.given === (value ?? "") && !controlled) return left.at;
  return vecOf(value) ?? ((angle ?? 0) > 0 ? fromAngle(angle ?? 0) : { x: 0, y: 0 });
}

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

let pads = 0;

export function Joystick(props: JoystickProps) {
  const p = withDefaults<JoystickProps>("joystick", props);
  const size = Math.round(p.size ?? 132);
  const [id] = useState(() => `m3e-pad-${++pads}`);
  /* where the finger holds the knob, while it does: the pad's own, however fast the value comes back */
  const [held, setHeld] = useState<Vec | null>(null);
  /* where it was let go, while nothing says otherwise and it stays put */
  const [left, setLeft] = useState<{ at: Vec; given: string } | null>(null);
  /* the pad on the page, measured when a finger lands on it */
  const box = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const shown = held ?? restingOf(left, p.value, !!p.onValueChange, p.angle);
  const out = shown.x !== 0 || shown.y !== 0;
  const r = Math.max(8, Math.round(size * TRAVEL));
  const side = Math.max(24, Math.round(size * 0.34));
  const pointAt = (t: { clientX: number; clientY: number }) => {
    const b = box.current;
    return b ? pushOf(t.clientX - b.left - b.width / 2, t.clientY - b.top - b.height / 2, Math.min(b.width, b.height) * TRAVEL) : null;
  };
  const push = (at: Vec | null) => {
    if (!at) return;
    setHeld(at);
    p.onValueChange?.(wordsOfVec(at));
  };
  const onStart = (e: CommonEvent) => {
    if (p.disabled) return;
    const t = (e as unknown as ITouchEvent).touches?.[0];
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((rect) => {
        const b = Array.isArray(rect) ? rect[0] : rect;
        if (!b) return;
        box.current = { left: b.left, top: b.top, width: b.width, height: b.height };
        if (t) push(pointAt(t));
      })
      .exec();
  };
  const onMove = (e: CommonEvent) => {
    const t = (e as unknown as ITouchEvent).touches?.[0];
    if (!p.disabled && t) push(pointAt(t));
  };
  /* where the finger left it, read off the event itself: the last move may not have been drawn yet */
  const onEnd = (e: CommonEvent) => {
    if (p.disabled || !held) return;
    const t = (e as unknown as ITouchEvent).changedTouches?.[0];
    const at = (t && pointAt(t)) || held;
    const rest = p.autoCenter !== false ? { x: 0, y: 0 } : at;
    p.onRelease?.({ x: at.x, y: at.y });
    setHeld(null);
    setLeft({ at: rest, given: p.value ?? "" });
    p.onValueChange?.(wordsOfVec(rest));
  };
  return (
    <Surface base={{ width: size, height: size, borderRadius: "50%", backgroundColor: c("surface-container-high"), opacity: p.disabled ? 0.38 : 1, flexShrink: 0, alignSelf: "flex-start" }} appearance={p}>
      <View
        id={id}
        {...tagOf(p.testID)}
        ariaRole="slider"
        ariaLabel={p.ariaLabel || "Joystick"}
        ariaValuemin="0"
        ariaValuemax="360"
        ariaValuenow={String(out ? angleOf(shown) : 0)}
        ariaValuetext={wordsOfVec(shown)}
        catchMove
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
        style={sx({ position: "relative", width: size, height: size })}
      >
        <View style={sx({ position: "absolute", left: size / 2 - 3, top: size / 2 - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: c("outline-variant") })} />
        <View style={sx({ position: "absolute", width: side, height: side, borderRadius: "50%", left: size / 2 + Math.round(shown.x * r) - side / 2, top: size / 2 + Math.round(shown.y * r) - side / 2, backgroundColor: c(out || held ? "primary" : "primary-container"), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)" })} />
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
  const ask = pressOf(blocked ? undefined : tapOf(p, "action"));
  return (
    <Surface base={{ display: "flex", flexDirection: "column", alignItems: "center", rowGap: 4, width: size, alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      <View ariaRole="button" ariaLabel={p.label || p.icon} hoverClass={blocked ? "none" : "m3e-pressed"} onClick={ask} style={sx(ROW, { position: "relative", width: size, height: size, justifyContent: "center", overflow: "hidden", borderRadius: "50%", backgroundColor: c("primary"), flexShrink: 0 })}>
        <Glyph name={p.icon ?? "bolt"} size={Math.round(size / 2)} color="on-primary" />
        {cooling ? (
          <View style={sx(ROW, { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, justifyContent: "center", borderRadius: "50%", background: `conic-gradient(${ca("scrim", 0.65)} ${ring * 360}deg, transparent 0deg)` })}>
            <Words text={String(Math.ceil(left))} style={{ ...typeStyle(kit, "title-medium"), color: c("inverse-on-surface"), fontVariantNumeric: "tabular-nums" }} />
          </View>
        ) : null}
      </View>
      {/* the label is part of the skill: while it cools down a press on it is no press at all */}
      {p.label ? <Words text={p.label} lines={1} onPress={blocked ? undefined : tapOf(p, "action")} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface"), textAlign: "center", width: "100%" }} /> : null}
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
  current?: number;
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
  const levels = Math.max(0, Math.round(p.levels ?? 12));
  const current = Math.round(p.current ?? 5);
  const columns = Math.max(2, Math.round(p.perRow ?? 4));
  /* a mini-program draws the map at the design's width: the path is laid out in it */
  const width = Math.round(p.width ?? 380);
  const [on, pick] = useDraft(Math.round(p.selected ?? -1), p.onSelect);
  const earned = starsOf(p.stars);
  const height = Math.ceil(levels / columns) * ROW_H;
  return (
    <Surface base={{ position: "relative", width, height, overflow: "hidden", borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low"), flexShrink: 0 }} appearance={p} testID={p.testID}>
      {/* the path between the levels: a line of 4 from each to the next, done up to the current one */}
      {Array.from({ length: Math.max(0, levels - 1) }, (_, i) => {
        const a = levelAt(i, columns, width);
        const b = levelAt(i + 1, columns, width);
        const long = Math.hypot(b.x - a.x, b.y - a.y);
        return <View key={`l${i}`} style={sx({ position: "absolute", left: a.x, top: a.y - 2, width: long, height: 4, backgroundColor: c(i + 1 < current ? "primary" : "outline-variant"), transformOrigin: "0 50%", transform: `rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI}deg)` })} />;
      })}
      {Array.from({ length: levels }, (_, i) => {
        const n = i + 1;
        const at = levelAt(i, columns, width);
        const locked = n > current;
        const here = n === current;
        const picked = i === on;
        return (
          <View key={i} style={sx({ position: "absolute", left: at.x - 28, top: at.y - 28, width: 56, display: "flex", flexDirection: "column", alignItems: "center" })}>
            <View style={sx(ROW, { width: 56, height: 56, boxSizing: "border-box", justifyContent: "center", borderRadius: "50%", backgroundColor: here ? ca("primary", 0.3) : "transparent", border: picked ? `2px solid ${c("primary")}` : undefined })}>
              <View
                ariaRole="button"
                ariaLabel={`${n}`}
                ariaSelected={picked}
                hoverClass={locked ? "none" : "m3e-pressed"}
                onClick={pressOf(
                  locked
                    ? undefined
                    : () => {
                        pick(i);
                        tapOf(p, `tab:${i}`)?.();
                      },
                )}
                style={sx(ROW, { width: 48, height: 48, justifyContent: "center", borderRadius: "50%", backgroundColor: c(locked ? "surface-container-high" : here ? "primary" : "primary-container") })}
              >
                {locked ? <Glyph name="lock" size={20} color="on-surface-variant" /> : <Words text={String(n)} style={{ ...typeStyle(kit, "title-medium"), color: c(here ? "on-primary" : "on-primary-container") }} />}
              </View>
            </View>
            {!locked && !here ? (
              <View ariaLabel={`${earned[i] ?? 0} / 3`} style={sx(ROW, { marginTop: -4 })}>
                {[0, 1, 2].map((s) => (
                  <View key={s} style={sx({ opacity: s >= (earned[i] ?? 0) ? 0.3 : 1 })}>
                    <Glyph name="star" size={12} filled color="tertiary" />
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
  const width = Math.round(p.width ?? 320);
  /* square cells, from the design's width (a mini-program's old WebViews have no aspect-ratio) */
  const side = Math.max(0, (width - 24 - 4 * (columns - 1)) / columns);
  const reset = p.reset ? buttonColors(kit, "text") : undefined;
  return (
    <Surface base={{ display: "flex", flexDirection: "column", rowGap: 8, boxSizing: "border-box", width, padding: 12, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low"), alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      {status ? <Words text={status} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface"), textAlign: "center" }} /> : null}
      <View style={sx({ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 4 })}>
        {board.map((mark, i) => {
          const on = picked.includes(i);
          return (
            <View key={i} ariaRole="button" ariaLabel={mark ? `${i + 1} ${mark}` : `${i + 1}`} ariaSelected={on} hoverClass="m3e-pressed" onClick={pressOf(tapOf(p, `cell:${i}`))} style={sx(ROW, { height: side, minWidth: 0, justifyContent: "center", borderRadius: corner(kit, "md"), backgroundColor: c(on ? "primary" : mark ? "primary-container" : "surface-container-high") })}>
              <Words text={mark} style={{ ...typeStyle(kit, "title-large"), color: c(on ? "on-primary" : mark ? "on-primary-container" : "on-surface") }} />
            </View>
          );
        })}
      </View>
      {p.reset && reset ? (
        <View ariaRole="button" hoverClass="m3e-pressed" onClick={pressOf(tapOf(p, "reset"))} style={sx(ROW, { height: 40, justifyContent: "center", borderRadius: controlRadius(kit, 40) })}>
          <Words text={p.reset} style={merge(typeStyle(kit, "label-large"), { color: inkCss(reset.ink) }, capsOf(kit))} />
        </View>
      ) : null}
    </Surface>
  );
}
