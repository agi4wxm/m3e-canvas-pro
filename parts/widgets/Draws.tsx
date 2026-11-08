import { useEffect, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { prefersReducedMotion } from "@/components/m3e/reduced-motion";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";

/* The prize machines, after 17722797729/m3e-canvas game-ui (MIT): the same draw, six ways to watch it.
 * The prize is the other side's to decide (docs/边界与契约.md): a press asks, `result` brings the answer in (-1: none
 * yet), and the machine plays its run, settles on it and sends `settled`. Until the answer comes it waits. Only a
 * prototype's demo picks a prize itself, at random with even odds, when nothing gives one. */

type Prize = { label: string; icon?: string };
type DrawProps = { prizes?: Prize[]; label?: string; result?: number; size?: number } & HostProps;

const SPIN_MS = 1200;

const reduced = prefersReducedMotion;

/** One draw at a time: `tick` moves while it runs, so a machine can show something happening. `pending` is a press
 *  waiting for its result. */
function useDraw(prizes: Prize[], result: number, contract: HostProps) {
  const host = useHost(contract);
  const [phase, setPhase] = useState<"idle" | "pending" | "running" | "done">("idle");
  const [won, setWon] = useState(-1);
  const [tick, setTick] = useState(0);
  const running = useRef<(() => void) | undefined>(undefined);
  const live = useRef({ prizes, host });
  live.current = { prizes, host };
  /* leaving the screen mid-draw stops it */
  useEffect(() => () => running.current?.(), []);
  const given = result >= 0 && result < prizes.length ? result : -1;
  const run = (pick: number) => {
    setPhase("running");
    setWon(pick);
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
  /* the answer to a press that is waiting has come */
  useEffect(() => {
    if (phase === "pending" && given >= 0) run(given);
  }, [phase, given]);
  const start = () => {
    if (phase === "running" || phase === "pending" || prizes.length === 0) return;
    if (given >= 0) run(given);
    else if (host.demo) run(Math.floor(Math.random() * prizes.length));
    else setPhase("pending");
  };
  return { phase, won, tick, start, busy: phase === "running" || phase === "pending", prize: phase === "done" ? prizes[won] : undefined };
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

export function Wheel({ prizes = [], label = "", result = -1, size = 220, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, won, start, busy, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const sweep = 360 / Math.max(1, prizes.length);
  const stops = prizes.map((_, i) => `var(--md-sys-color-${i % 2 ? "surface-container-high" : "surface-container-low"}) ${i * sweep}deg ${(i + 1) * sweep}deg`).join(", ");
  /* several full turns, ending with the winner's wedge under the pointer at the top */
  const turn = won < 0 ? 0 : 360 * 5 - (won + 0.5) * sweep;
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
        <Button variant="filled" size="xs" className="absolute! top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" disabled={busy} onClick={start}>
          {label}
        </Button>
      </div>
      <Result prize={prize} />
    </div>
  );
}

/** the eight cells around the middle, in the order the light walks round them */
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

export function GridWheel({ prizes = [], label = "", result = -1, size = 240, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, won, tick, start, busy, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const shown = prizes.slice(0, 8);
  const lit = phase === "running" ? tick % Math.max(1, shown.length) : phase === "done" ? won % Math.max(1, shown.length) : -1;
  return (
    <div data-slot="grid-wheel" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col gap-1", className)} style={{ width: size, ...style }}>
      <div data-slot="grid-wheel-grid" className="grid grid-cols-3 gap-1" style={{ height: size }}>
        {Array.from({ length: 9 }, (_, cell) => {
          if (cell === 4)
            return (
              <Button key={cell} variant="filled" size="xs" className="h-full! w-full rounded-md! px-1" disabled={busy} onClick={start}>
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

export function Gacha({ prizes = [], label = "", result = -1, size = 170, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, tick, start, busy, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const shake = phase === "running" ? (tick % 2 ? -3 : 3) : 0;
  return (
    <div data-slot="gacha" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div data-slot="gacha-media" className="bg-surface-container-high grid aspect-square w-full grid-cols-4 content-center gap-1 rounded-full p-5" style={{ transform: `translateX(${shake}px)` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} data-slot="gacha-dot" className={`aspect-square rounded-full ${["bg-primary-container", "bg-secondary-container", "bg-tertiary-container"][i % 3]}`} />
        ))}
      </div>
      <Button variant="filled" size="xs" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function SlotMachine({ prizes = [], label = "", result = -1, size = 280, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, won, tick, start, busy, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const at = (reel: number) => (phase === "running" ? prizes[(tick + reel * 2) % Math.max(1, prizes.length)] : phase === "done" ? prizes[won] : prizes[reel % Math.max(1, prizes.length)]);
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
      <Button variant="filled" size="xs" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function MoneyTree({ prizes = [], label = "", result = -1, size = 190, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, tick, start, busy, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const sway = phase === "running" ? (tick % 2 ? -6 : 6) : 0;
  return (
    <div data-slot="money-tree" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div data-slot="money-tree-media" className="text-primary" style={{ transform: `rotate(${sway}deg)`, transformOrigin: "bottom center" }}>
        <WidgetIcon name="park" className="size-24" />
      </div>
      <Button variant="filled" size="xs" disabled={busy} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function EggSmash({ prizes = [], label = "", result = -1, size = 260, demo, onValueChange, onEvent, className, style }: DrawProps & Look) {
  const { phase, start, prize } = useDraw(prizes, result, { demo, onValueChange, onEvent });
  const [chosen, setChosen] = useState(-1);
  return (
    <div data-slot="egg-smash" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      {label && <div data-slot="egg-smash-title" className="text-title-small text-on-surface">{label}</div>}
      <div className="flex w-full justify-around">
        {[0, 1, 2].map((egg) => (
          <Tap
            key={egg}
            data-slot="egg-smash-item"
            data-state={chosen === egg && phase !== "idle" ? "broken" : undefined}
            aria-label={`${label} ${egg + 1}`}
            disabled={phase !== "idle"}
            className={`h-20 w-16 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] ${chosen === egg && phase !== "idle" ? "bg-outline-variant" : "bg-tertiary-container"}`}
            onClick={() => {
              setChosen(egg);
              start();
            }}
          />
        ))}
      </div>
      <Result prize={prize} />
    </div>
  );
}
