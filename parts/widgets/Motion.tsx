import { useEffect, useRef, useState, type RefObject } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Chip } from "@/components/m3e/chip";
import { LoadingIndicator } from "@/components/m3e/loading-indicator";
import { Progress } from "@/components/m3e/progress";
import { WidgetIcon } from "./WidgetIcon";

/* What moves over time or under a finger. On the canvas a part is a drawing, so nothing here runs
 * under `inert`; and it holds still when the system asks for reduced motion. After flutter_shadcn_kit's
 * number ticker, overflow marquee and refresh trigger, the web components' slide group and swipe reveal,
 * and Android's chronometer. */

const still = (el: Element | null) => !!el?.closest("[inert]") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** seconds as a clock */
const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

export function NumberTicker({ value = 0, prefix = "", suffix = "", size = "headline", className, style }: { value?: number; prefix?: string; suffix?: string; size?: string } & Look) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (still(ref.current)) return setShown(value);
    const start = performance.now();
    let frame = 0;
    const run = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const scale = size === "display" ? "text-display-small" : size === "title" ? "text-title-large" : "text-headline-medium";
  return (
    <span ref={ref} data-slot="number-ticker" data-value={shown} className={cn(`${scale} text-on-surface inline-block tabular-nums`, className)} style={style}>
      {prefix}
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}

export function Marquee({ text = "", seconds = 12, width = 320, className, style }: { text?: string; seconds?: number; width?: number } & Look) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = line.current;
    if (!el || still(box.current)) return;
    const run = el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: seconds * 1000, iterations: Infinity, easing: "linear" });
    return () => run.cancel();
  }, [seconds, text]);
  return (
    <div ref={box} data-slot="marquee" className={cn("text-body-medium text-on-surface overflow-hidden whitespace-nowrap", className)} style={{ width, ...style }}>
      <span ref={line} className="inline-block">
        <span className="pr-8">{text}</span>
        <span className="pr-8" aria-hidden>{text}</span>
      </span>
    </div>
  );
}

export function Timer({ seconds = 60, countdown = true, width = 200, className, style }: { seconds?: number; countdown?: boolean; width?: number } & Look) {
  const [left, setLeft] = useState(countdown ? seconds : 0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => (countdown ? Math.max(0, s - 1) : s + 1)), 1000);
    return () => clearInterval(id);
  }, [running, countdown]);
  useEffect(() => {
    if (countdown && left === 0) setRunning(false);
  }, [countdown, left]);
  return (
    <div data-slot="timer" data-left={left} data-running={running || undefined} className={cn("bg-surface-container-low flex items-center justify-between gap-2 rounded-2xl p-3", className)} style={{ width, ...style }}>
      <span className="text-title-large text-on-surface tabular-nums">{clock(left)}</span>
      <span className="flex gap-1">
        <Button variant="tonal" size="icon-sm" aria-label={running ? "Pause" : "Start"} onClick={() => setRunning((r) => !r)}>
          <WidgetIcon name={running ? "pause" : "play_arrow"} />
        </Button>
        <Button
          variant="text"
          size="icon-sm"
          aria-label="Reset"
          onClick={() => {
            setRunning(false);
            setLeft(countdown ? seconds : 0);
          }}
        >
          <WidgetIcon name="replay" />
        </Button>
      </span>
    </div>
  );
}

const PULL = 64;

export function PullToRefresh({ hint = "", width = 360, height = 200, className, style }: { hint?: string; width?: number; height?: number } & Look) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const from = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const release = () => {
    if (from.current === null) return;
    from.current = null;
    if (pull < PULL) return setPull(0);
    setRefreshing(true);
    setPull(PULL);
    timer.current = setTimeout(() => {
      setRefreshing(false);
      setPull(0);
    }, 1200);
  };
  return (
    <div
      data-slot="pull-to-refresh"
      data-phase={refreshing ? "refreshing" : pull > 0 ? "pulling" : "idle"}
      className={cn("bg-surface-container-low relative flex touch-none flex-col items-center overflow-hidden rounded-xl", className)}
      style={{ width, height, ...style }}
      onPointerDown={(e) => {
        if (refreshing) return;
        from.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => from.current !== null && setPull(Math.min(PULL * 1.5, Math.max(0, e.clientY - from.current)))}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="flex items-center justify-center overflow-hidden" style={{ height: pull }}>
        <LoadingIndicator />
      </div>
      <div className="text-body-small text-on-surface-variant p-3">{hint}</div>
    </div>
  );
}

export function SlideGroup({ items = [], width = 320, className, style }: { items?: string[]; width?: number } & Look) {
  const row = useRef<HTMLDivElement>(null);
  const by = (dx: number) => row.current?.scrollBy({ left: dx, behavior: "smooth" });
  return (
    <div data-slot="slide-group" className={cn("flex items-center gap-1", className)} style={{ width, ...style }}>
      <Button variant="text" size="icon-sm" aria-label="Previous" onClick={() => by(-160)}>
        <WidgetIcon name="chevron_left" />
      </Button>
      <div ref={row as RefObject<HTMLDivElement>} className="flex min-w-0 flex-1 gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {items.map((label, i) => (
          <Chip key={i} className="shrink-0">
            {label}
          </Chip>
        ))}
      </div>
      <Button variant="text" size="icon-sm" aria-label="Next" onClick={() => by(160)}>
        <WidgetIcon name="chevron_right" />
      </Button>
    </div>
  );
}

const REVEAL = 88;

export function SwipeRow({ title = "", note = "", action = "", width = 360, className, style }: { title?: string; note?: string; action?: string; width?: number } & Look) {
  const [dx, setDx] = useState(0);
  const from = useRef<{ x: number; dx: number } | null>(null);
  const [done, setDone] = useState(false);
  const release = () => {
    if (!from.current) return;
    from.current = null;
    setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
  };
  if (done) return <div data-slot="swipe-row" data-done="true" style={{ width }} />;
  return (
    /* the fill belongs on the face that moves: what shows under it is the action's own */
    <div data-slot="swipe-row" data-open={dx === -REVEAL || undefined} className="bg-error-container relative overflow-hidden rounded-xl" style={{ width, ...style }}>
      <div className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: REVEAL }}>
        <Button variant="text" size="xs" className="text-on-error-container" onClick={() => setDone(true)}>
          {action}
        </Button>
      </div>
      <div
        className={cn("bg-surface-container-low relative flex touch-pan-y flex-col gap-0.5 p-3", className)}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          from.current = { x: e.clientX, dx };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => from.current && setDx(Math.min(0, Math.max(-REVEAL, from.current.dx + e.clientX - from.current.x)))}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span className="text-body-large text-on-surface truncate">{title}</span>
        {note && <span className="text-body-small text-on-surface-variant truncate">{note}</span>}
      </div>
    </div>
  );
}

const webAddress = (url: string) => (/^https?:\/\//i.test(url) ? url : "");

export function AudioPlayer({ title = "", artist = "", src = "", seconds = 180, width = 360, className, style }: { title?: string; artist?: string; src?: string; seconds?: number; width?: number } & Look) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(seconds);
  const address = webAddress(src);
  /* with no file it plays in name only: the bar moves so a prototype shows what it would do */
  useEffect(() => {
    if (!playing || address) return;
    const id = setInterval(() => setAt((s) => (s + 1 >= length ? (setPlaying(false), 0) : s + 1)), 1000);
    return () => clearInterval(id);
  }, [playing, address, length]);
  const toggle = () => {
    if (address) void (playing ? audio.current?.pause() : audio.current?.play());
    setPlaying((p) => !p);
  };
  return (
    <div data-slot="audio-player" data-playing={playing || undefined} className={cn("bg-surface-container-low flex items-center gap-3 rounded-2xl p-3", className)} style={{ width, ...style }}>
      <Button variant="filled" size="icon" aria-label={playing ? "Pause" : "Play"} className="shrink-0" onClick={toggle}>
        <WidgetIcon name={playing ? "pause" : "play_arrow"} />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-body-medium text-on-surface truncate">{title}</div>
        {artist && <div className="text-body-small text-on-surface-variant truncate">{artist}</div>}
        <Progress value={length ? (at / length) * 100 : 0} />
        <div className="text-label-small text-on-surface-variant flex justify-between tabular-nums">
          <span>{clock(at)}</span>
          <span>{clock(length)}</span>
        </div>
      </div>
      {address && <audio ref={audio} src={address} preload="metadata" onLoadedMetadata={(e) => setLength(e.currentTarget.duration || seconds)} onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />}
    </div>
  );
}
