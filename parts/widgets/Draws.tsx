import { useEffect, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* The prize machines, after 17722797729/m3e-canvas game-ui (MIT): the same draw, six ways to watch it.
 * `result` forces the outcome (a prototype often has to show one particular path); -1 draws at
 * random. Nothing here is a real lottery: the odds are even and nothing is stored. */

type Prize = { label: string; icon?: string };
type DrawProps = { prizes?: Prize[]; label?: string; result?: number; size?: number };

const SPIN_MS = 1200;

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** one draw at a time: `tick` moves while it runs, so a machine can show something happening */
function useDraw(prizes: Prize[], result: number) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [won, setWon] = useState(-1);
  const [tick, setTick] = useState(0);
  const running = useRef<(() => void) | undefined>(undefined);
  /* leaving the screen mid-draw stops it */
  useEffect(() => () => running.current?.(), []);
  const start = () => {
    if (phase === "running" || prizes.length === 0) return;
    const pick = result >= 0 && result < prizes.length ? result : Math.floor(Math.random() * prizes.length);
    setPhase("running");
    setWon(pick);
    const step = setInterval(() => setTick((t) => t + 1), 90);
    const end = setTimeout(
      () => {
        clearInterval(step);
        running.current = undefined;
        setPhase("done");
      },
      reduced() ? 0 : SPIN_MS,
    );
    running.current = () => {
      clearInterval(step);
      clearTimeout(end);
    };
  };
  return { phase, won, tick, start, prize: phase === "done" ? prizes[won] : undefined };
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

export function Wheel({ prizes = [], label = "", result = -1, size = 220, className, style }: DrawProps & Look) {
  const { phase, won, start, prize } = useDraw(prizes, result);
  const sweep = 360 / Math.max(1, prizes.length);
  const stops = prizes.map((_, i) => `var(--md-sys-color-${i % 2 ? "surface-container-high" : "surface-container-low"}) ${i * sweep}deg ${(i + 1) * sweep}deg`).join(", ");
  /* several full turns, ending with the winner's wedge under the pointer at the top */
  const turn = won < 0 ? 0 : 360 * 5 - (won + 0.5) * sweep;
  return (
    <div data-slot="wheel" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-1", className)} style={{ width: size, ...style }}>
      <div className="relative" style={{ width: size, height: size }}>
        <div className="border-outline-variant relative size-full rounded-full border" style={{ background: `conic-gradient(${stops})`, transform: `rotate(${turn}deg)`, transition: reduced() ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.2, 0, 0, 1)` }}>
          {prizes.map((p, i) => (
            <span key={i} className="text-on-surface absolute top-1/2 left-1/2 flex items-center justify-center" style={{ transform: `translate(-50%, -50%) rotate(${(i + 0.5) * sweep}deg) translateY(${-size * 0.36}px)` }}>
              {p.icon ? <WidgetIcon name={p.icon} className="size-5" /> : <span className="text-label-small">{p.label}</span>}
            </span>
          ))}
        </div>
        <span className="border-t-primary absolute -top-1 left-1/2 -translate-x-1/2 border-x-8 border-t-12 border-x-transparent" />
        <Button variant="filled" size="xs" className="absolute! top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" disabled={phase === "running"} onClick={start}>
          {label}
        </Button>
      </div>
      <Result prize={prize} />
    </div>
  );
}

/** the eight cells around the middle, in the order the light walks round them */
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

export function GridWheel({ prizes = [], label = "", result = -1, size = 240, className, style }: DrawProps & Look) {
  const { phase, won, tick, start, prize } = useDraw(prizes, result);
  const shown = prizes.slice(0, 8);
  const lit = phase === "running" ? tick % Math.max(1, shown.length) : phase === "done" ? won % Math.max(1, shown.length) : -1;
  return (
    <div data-slot="grid-wheel" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col gap-1", className)} style={{ width: size, ...style }}>
      <div className="grid grid-cols-3 gap-1" style={{ height: size }}>
        {Array.from({ length: 9 }, (_, cell) => {
          if (cell === 4)
            return (
              <Button key={cell} variant="filled" size="xs" className="h-full! w-full rounded-md! px-1" disabled={phase === "running"} onClick={start}>
                {label}
              </Button>
            );
          const at = RING.indexOf(cell);
          const p = shown[at];
          return (
            <div key={cell} data-lit={at === lit || undefined} className={`text-label-small flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md text-center ${at === lit ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface"}`}>
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

export function Gacha({ prizes = [], label = "", result = -1, size = 170, className, style }: DrawProps & Look) {
  const { phase, tick, start, prize } = useDraw(prizes, result);
  const shake = phase === "running" ? (tick % 2 ? -3 : 3) : 0;
  return (
    <div data-slot="gacha" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div className="bg-surface-container-high grid aspect-square w-full grid-cols-4 content-center gap-1 rounded-full p-5" style={{ transform: `translateX(${shake}px)` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={`aspect-square rounded-full ${["bg-primary-container", "bg-secondary-container", "bg-tertiary-container"][i % 3]}`} />
        ))}
      </div>
      <Button variant="filled" size="xs" disabled={phase === "running"} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function SlotMachine({ prizes = [], label = "", result = -1, size = 280, className, style }: DrawProps & Look) {
  const { phase, won, tick, start, prize } = useDraw(prizes, result);
  const at = (reel: number) => (phase === "running" ? prizes[(tick + reel * 2) % Math.max(1, prizes.length)] : phase === "done" ? prizes[won] : prizes[reel % Math.max(1, prizes.length)]);
  return (
    <div data-slot="slot-machine" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div className="bg-surface-container-high flex w-full gap-2 rounded-xl p-3">
        {[0, 1, 2].map((reel) => {
          const p = at(reel);
          return (
            <div key={reel} className="bg-surface text-on-surface text-label-small flex h-16 flex-1 flex-col items-center justify-center overflow-hidden rounded-md">
              {p?.icon ? <WidgetIcon name={p.icon} className="size-7" /> : p?.label}
            </div>
          );
        })}
      </div>
      <Button variant="filled" size="xs" disabled={phase === "running"} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function MoneyTree({ prizes = [], label = "", result = -1, size = 190, className, style }: DrawProps & Look) {
  const { phase, tick, start, prize } = useDraw(prizes, result);
  const sway = phase === "running" ? (tick % 2 ? -6 : 6) : 0;
  return (
    <div data-slot="money-tree" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      <div className="text-primary" style={{ transform: `rotate(${sway}deg)`, transformOrigin: "bottom center" }}>
        <WidgetIcon name="park" className="size-24" />
      </div>
      <Button variant="filled" size="xs" disabled={phase === "running"} onClick={start}>
        {label}
      </Button>
      <Result prize={prize} />
    </div>
  );
}

export function EggSmash({ prizes = [], label = "", result = -1, size = 260, className, style }: DrawProps & Look) {
  const { phase, start, prize } = useDraw(prizes, result);
  const [chosen, setChosen] = useState(-1);
  return (
    <div data-slot="egg-smash" data-phase={phase} data-result={prize?.label} className={cn("inline-flex flex-col items-center gap-2", className)} style={{ width: size, ...style }}>
      {label && <div className="text-title-small text-on-surface">{label}</div>}
      <div className="flex w-full justify-around">
        {[0, 1, 2].map((egg) => (
          <Tap
            key={egg}
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
