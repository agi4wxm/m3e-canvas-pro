import { useEffect, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { prefersReducedMotion } from "@/components/m3e/reduced-motion";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";

/* The prize machines, after 17722797729/m3e-canvas game-ui (MIT): the same draw, six ways to watch it.
 * The prize is the other side's to decide (docs/边界与契约.md): a press asks (the `action` slot, or an egg), `result`
 * brings the answer in (-1: none), `pending` says it is on its way, and the machine plays its run, settles on the
 * answer and sends `settled`. A press waits for the answer that comes after it: a result already there when it is
 * pressed is played, unless `pending` says a new one is coming. Only a prototype's demo picks a prize itself, at
 * random with even odds, when nothing gives one. A machine can be pressed again once it has settled. */

type Prize = { label: string; icon?: string };
type DrawProps = { prizes?: Prize[]; label?: string; result?: number; pending?: boolean; size?: number } & HostProps;

const SPIN_MS = 1200;

const reduced = prefersReducedMotion;

/** One draw at a time over the first `count` prizes (what the machine can show): `tick` moves while it runs, so a
 *  machine can show something happening; `runs` counts the runs, so a wheel turns again for the same prize. */
function useDraw(prizes: Prize[], result: number, pending: boolean, contract: HostProps, count = prizes.length) {
  const host = useHost(contract);
  const [phase, setPhase] = useState<"idle" | "pending" | "running" | "done">("idle");
  const [won, setWon] = useState(-1);
  const [tick, setTick] = useState(0);
  const [runs, setRuns] = useState(0);
  /* a press waiting for its answer */
  const [asked, setAsked] = useState(false);
  const running = useRef<(() => void) | undefined>(undefined);
  const live = useRef({ prizes, host });
  live.current = { prizes, host };
  /* leaving the screen mid-draw stops it */
  useEffect(() => () => running.current?.(), []);
  const drawable = Math.min(count, prizes.length);
  const given = Number.isInteger(result) && result >= 0 && result < drawable ? result : -1;
  const run = (pick: number) => {
    running.current?.();
    setPhase("running");
    setWon(pick);
    setRuns((n) => n + 1);
    const step = setInterval(() => setTick((t) => t + 1), 90);
    const end = setTimeout(
      () => {
        clearInterval(step);
        running.current = undefined;
        setPhase("done");
        live.current.host.emit("settled", { index: pick, label: live.current.prizes[pick]?.label ?? "" });
      },
      reduced() ? 0 : SPIN_MS,
    );
    running.current = () => {
      clearInterval(step);
      clearTimeout(end);
    };
  };
  /* The answer to a press comes in after the press's own effects ran: those may have cleared the old result or said a
     new one is pending, so it is read a render later. A settled machine follows its result: told another prize it
     plays to it, told none it goes back to waiting for a press. */
  useEffect(() => {
    if (asked) {
      if (pending || given < 0) return;
      setAsked(false);
      run(given);
      return;
    }
    if (phase !== "done" || host.demo || given === won) return;
    if (given < 0) setPhase("idle");
    else run(given);
  }, [asked, pending, given]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = phase === "running" || asked || pending;
  const start = () => {
    if (busy || drawable === 0) return;
    if (host.demo && given < 0) run(Math.floor(Math.random() * drawable));
    else setAsked(true);
  };
  const shown = asked || pending ? "pending" : phase;
  return { phase: shown, won, tick, runs, start, busy, prize: phase === "done" && !asked ? prizes[won] : undefined };
}

function Result({ prize }: { prize?: Prize }) {
  return (
    <div data-slot="draw-result" aria-live="polite" className="text-label-large text-on-surface flex h-6 items-center justify-center gap-1">
      {prize && (
        <>
          {prize.icon && <WidgetIcon name={prize.icon} className="size-4" />}
          {prize.label}
        </>
      )}
    </div>
  );
}

export function Wheel({ prizes = [], label = "", result = -1, pending = false, size = 220, demo, onValueChange, onEvent, wired, className, style }: DrawProps & Look) {
  const { phase, won, runs, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired });
  const sweep = 360 / Math.max(1, prizes.length);
  const stops = prizes.map((_, i) => `var(--md-sys-color-${i % 2 ? "surface-container-high" : "surface-container-low"}) ${i * sweep}deg ${(i + 1) * sweep}deg`).join(", ");
  /* five full turns more for every run, ending with the winner's wedge under the pointer at the top: the same prize
     twice still turns */
  const turn = won < 0 ? 0 : 360 * 5 * runs - (won + 0.5) * sweep;
  return (
    <div data-slot="wheel" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-1", className)} style={{ width: size, ...style }}>
      <div data-slot="wheel-stage" className="relative" style={{ width: size, height: size }}>
        <div data-slot="wheel-track" className="border-outline-variant relative size-full rounded-full border" style={{ background: `conic-gradient(${stops})`, transform: `rotate(${turn}deg)`, transition: reduced() ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.2, 0, 0, 1)` }}>
          {prizes.map((p, i) => (
            <span key={i} data-slot="wheel-label" className="text-on-surface absolute top-1/2 left-1/2 flex items-center justify-center" style={{ transform: `translate(-50%, -50%) rotate(${(i + 0.5) * sweep}deg) translateY(${-size * 0.36}px)` }}>
              {p.icon ? <WidgetIcon name={p.icon} className="size-5" /> : <span className="text-label-small">{p.label}</span>}
            </span>
          ))}
        </div>
        <span data-slot="wheel-indicator" className="border-t-primary absolute -top-1 left-1/2 -translate-x-1/2 border-x-8 border-t-12 border-x-transparent" />
        <Button variant="filled" size="xs" data-tap="action" className="absolute! top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" disabled={busy} onClick={start}>
          {label}
        </Button>
      </div>
      <Result prize={prize} />
    </div>
  );
}

/** the eight cells around the middle, in the order the light walks round them */
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

export function GridWheel({ prizes = [], label = "", result = -1, pending = false, size = 240, demo, onValueChange, onEvent, wired, className, style }: DrawProps & Look) {
  /* the grid shows eight prizes: a result past them is none it could light up */
  const shown = prizes.slice(0, 8);
  const { phase, won, tick, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired }, shown.length);
  const lit = phase === "running" ? tick % Math.max(1, shown.length) : phase === "done" ? won : -1;
  return (
    <div data-slot="grid-wheel" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col gap-1", className)} style={{ width: size, ...style }}>
      <div data-slot="grid-wheel-grid" className="grid grid-cols-3 gap-1" style={{ height: size }}>
        {Array.from({ length: 9 }, (_, cell) => {
          if (cell === 4)
            return (
              <Button key={cell} variant="filled" size="xs" data-tap="action" className="h-full! w-full rounded-md! px-1" disabled={busy} onClick={start}>
                {label}
              </Button>
            );
          const at = RING.indexOf(cell);
          const p = shown[at];
          return (
            <div key={cell} data-slot="grid-wheel-cell" data-lit={at === lit || undefined} className={`text-label-small flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md text-center ${at === lit ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface"}`}>
              {p?.icon && <WidgetIcon name={p.icon} className="size-5" />}
              <span className="truncate">{p?.label}</span>
            </div>
          );
        })}
      </div>
      <Result prize={prize} />
    </div>
  );
}

export function Gacha({ prizes = [], label = "", result = -1, pending = false, size = 170, demo, onValueChange, onEvent, wired, className, style }: DrawProps & Look) {
  const { phase, tick, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired });
  const shake = phase === "running" ? (tick % 2 ? -3 : 3) : 0;
  return (
    <div data-slot="gacha" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div data-slot="gacha-media" className="bg-surface-container-high grid aspect-square w-full grid-cols-4 content-center gap-1 rounded-full p-5" style={{ transform: `translateX(${shake}px)` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} data-slot="gacha-dot" className={`aspect-square rounded-full ${["bg-primary-container", "bg-secondary-container", "bg-tertiary-container"][i % 3]}`} />
        ))}
      </div>
      <Button variant="filled" size="xs" data-tap="action" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

/** the three reels' prizes to stop on, from words like "1,3,2": a miss shows unlike prizes; none given, three alike */
const reelsOf = (reels: string, count: number): number[] | null => {
  const at = reels.split(/[\s,，]+/).filter(Boolean).map(Number);
  return at.length === 3 && at.every((n) => Number.isInteger(n) && n >= 0 && n < count) ? at : null;
};

export function SlotMachine({ prizes = [], label = "", result = -1, pending = false, reels = "", size = 280, demo, onValueChange, onEvent, wired, className, style }: DrawProps & { reels?: string } & Look) {
  const { phase, won, tick, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired });
  const stops = reelsOf(reels, prizes.length);
  const at = (reel: number) => (phase === "running" ? prizes[(tick + reel * 2) % Math.max(1, prizes.length)] : phase === "done" ? prizes[stops ? stops[reel] : won] : prizes[reel % Math.max(1, prizes.length)]);
  return (
    <div data-slot="slot-machine" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div data-slot="slot-machine-track" className="bg-surface-container-high flex w-full gap-2 rounded-xl p-3">
        {[0, 1, 2].map((reel) => {
          const p = at(reel);
          return (
            <div key={reel} data-slot="slot-machine-cell" className="bg-surface text-on-surface text-label-small flex h-16 flex-1 flex-col items-center justify-center overflow-hidden rounded-md">
              {p?.icon ? <WidgetIcon name={p.icon} className="size-7" /> : p?.label}
            </div>
          );
        })}
      </div>
      <Button variant="filled" size="xs" data-tap="action" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function MoneyTree({ prizes = [], label = "", result = -1, pending = false, size = 190, demo, onValueChange, onEvent, wired, className, style }: DrawProps & Look) {
  const { phase, tick, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired });
  const sway = phase === "running" ? (tick % 2 ? -6 : 6) : 0;
  return (
    <div data-slot="money-tree" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div data-slot="money-tree-media" className="text-primary" style={{ transform: `rotate(${sway}deg)`, transformOrigin: "bottom center" }}>
        <WidgetIcon name="park" className="size-24" />
      </div>
      <Button variant="filled" size="xs" data-tap="action" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function EggSmash({ prizes = [], label = "", result = -1, pending = false, size = 260, demo, onValueChange, onEvent, wired, className, style }: DrawProps & Look) {
  const { phase, start, busy, prize } = useDraw(prizes, result, pending, { demo, onValueChange, onEvent, wired });
  const [chosen, setChosen] = useState(-1);
  return (
    <div data-slot="egg-smash" data-phase={phase} data-result={prize?.label} data-egg={chosen >= 0 ? chosen : undefined} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      {label && <div data-slot="egg-smash-title" className="text-title-small text-on-surface">{label}</div>}
      <div className="flex w-full justify-around">
        {[0, 1, 2].map((egg) => {
          const broken = chosen === egg && phase !== "idle";
          return (
            <Tap
              key={egg}
              data-slot="egg-smash-item"
              data-tap={`egg:${egg}`}
              data-state={broken ? "broken" : undefined}
              aria-label={`${label} ${egg + 1}`}
              disabled={busy}
              className={`h-20 w-16 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] ${broken ? "bg-outline-variant" : "bg-tertiary-container"}`}
              onClick={() => {
                setChosen(egg);
                start();
              }}
            />
          );
        })}
      </div>
      <Result prize={prize} />
    </div>
  );
}
