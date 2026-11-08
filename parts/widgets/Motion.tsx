import { useEffect, useRef, useState, type RefObject } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { prefersReducedMotion } from "@/components/m3e/reduced-motion";
import { Chip } from "@/components/m3e/chip";
import { LoadingIndicator } from "@/components/m3e/loading-indicator";
import { Progress } from "@/components/m3e/progress";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { clockNow, secondsLeft, useSeeded, useValue } from "./seed";

/* What moves over time or under a finger. On the canvas a part is a drawing, so nothing here runs
 * under `inert`; and it holds still when the system asks for reduced motion. After flutter_shadcn_kit's
 * number ticker, overflow marquee and refresh trigger, the web components' slide group and swipe reveal,
 * and Android's chronometer. */

const still = (el: Element | null) => !!el?.closest("[inert]") || prefersReducedMotion();

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

/* A clock read off the one the other side keeps (docs/边界与契约.md): counting down to `endsAt`, or up from
 * `startedAt` (ms on that clock, `clockSkew` ahead of the device's), while `running` says it runs; with neither given
 * it shows `seconds` (or nothing yet, counting up) and stands still. Its buttons only ask (`toggle`, `reset`), and a
 * countdown it shows reaching the end sends `ended` once. Only a prototype's demo runs a clock of its own from a
 * press, the way a stopwatch app would. */
export function Timer({ seconds = 60, countdown = true, running = false, endsAt = 0, startedAt = 0, clockSkew = 0, width = 200, demo, onValueChange, onEvent, wired, className, style }: { seconds?: number; countdown?: boolean; running?: boolean; endsAt?: number; startedAt?: number; clockSkew?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const ref = useRef<HTMLDivElement>(null);
  /* the demo's own clock: what it shows, and whether it runs */
  const [mine, setMine] = useSeeded({ left: countdown ? seconds : 0, running: false, from: [seconds, countdown] });
  const [, setTick] = useState(0);
  const given = countdown ? endsAt > 0 : startedAt > 0;
  const live = host.demo && !given ? mine.running : running && given;
  const left = host.demo && !given ? mine.left : !given ? (countdown ? seconds : 0) : countdown ? secondsLeft(endsAt, clockSkew) : Math.max(0, Math.floor((clockNow(clockSkew) - startedAt) / 1000));
  useEffect(() => {
    if (!live || ref.current?.closest("[inert]")) return;
    const id = setInterval(() => {
      if (host.demo && !given) setMine((m) => ({ ...m, left: countdown ? Math.max(0, m.left - 1) : m.left + 1, running: !countdown || m.left > 1 }));
      else setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [live, countdown, given]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the end of a countdown on show is said once */
  const before = useRef(left);
  useEffect(() => {
    if (countdown && before.current > 0 && left === 0 && !ref.current?.closest("[inert]")) host.emit("ended", {});
    before.current = left;
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const runs = host.demo && !given ? mine.running : running;
  return (
    <div ref={ref} data-slot="timer" data-left={left} data-running={live || undefined} className={cn("bg-surface-container-low flex items-center justify-between gap-2 rounded-2xl p-3", className)} style={{ width, ...style }}>
      <span data-slot="timer-value" role="timer" className="text-title-large text-on-surface tabular-nums">{clock(left)}</span>
      <span data-slot="timer-actions" className="flex gap-1">
        <Button variant="tonal" size="icon-sm" aria-label={runs ? "Pause" : "Start"} data-tap="toggle" onClick={() => host.demo && !given && setMine((m) => ({ ...m, running: !m.running && (!countdown || m.left > 0) }))}>
          <WidgetIcon name={runs ? "pause" : "play_arrow"} />
        </Button>
        <Button variant="text" size="icon-sm" aria-label="Reset" data-tap="reset" onClick={() => host.demo && !given && setMine((m) => ({ ...m, running: false, left: countdown ? seconds : 0 }))}>
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
      <div data-slot="pull-to-refresh-indicator" className="flex items-center justify-center overflow-hidden" style={{ height: pull }}>
        <LoadingIndicator />
      </div>
      <div data-slot="pull-to-refresh-description" className="text-body-small text-on-surface-variant p-3">{hint}</div>
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
      <div ref={row as RefObject<HTMLDivElement>} data-slot="slide-group-row" className="flex min-w-0 flex-1 gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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

/* A row with an action under it: whether the action shows is `open`, an input (the row's own while nobody takes it),
 * handed out and sent as `open` whenever a swipe, or the left and right arrow keys, open or shut it. The action only
 * asks (the `action` slot): the row goes when the data it stands for goes, never by itself. */
export function SwipeRow({ title = "", note = "", action = "", open: given = false, width = 360, demo, onValueChange, onEvent, wired, className, style }: { title?: string; note?: string; action?: string; open?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [open, setOpen] = useValue(given, host);
  /* how far the finger has the face, while it does */
  const [dx, setDx] = useState<number | null>(null);
  const from = useRef<{ x: number; dx: number } | null>(null);
  const shut = (to: boolean) => {
    if (to === open) return;
    setOpen(to);
    host.emit("open", { open: to });
  };
  const release = () => {
    if (!from.current) return;
    from.current = null;
    shut((dx ?? 0) < -REVEAL / 2);
    setDx(null);
  };
  const at = dx ?? (open ? -REVEAL : 0);
  return (
    /* the fill belongs on the face that moves: what shows under it is the action's own */
    <div data-slot="swipe-row" data-open={open || undefined} className="bg-error-container relative overflow-hidden rounded-xl" style={{ width, ...style }}>
      <div data-slot="swipe-row-actions" className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: REVEAL }} aria-hidden={!open || undefined}>
        <Button variant="text" size="xs" data-tap="action" tabIndex={open ? 0 : -1} className="text-on-error-container">
          {action}
        </Button>
      </div>
      <div
        data-slot="swipe-row-face"
        tabIndex={0}
        aria-expanded={open}
        aria-label={title}
        className={cn("bg-surface-container-low relative flex touch-pan-y flex-col gap-0.5 p-3 outline-none", className)}
        style={{ transform: `translateX(${at}px)` }}
        onPointerDown={(e) => {
          from.current = { x: e.clientX, dx: at };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => from.current && setDx(Math.min(0, Math.max(-REVEAL, from.current.dx + e.clientX - from.current.x)))}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") shut(true);
          else if (e.key === "ArrowRight" || e.key === "Escape") shut(false);
          else return;
          e.preventDefault();
        }}
      >
        <span data-slot="swipe-row-title" className="text-body-large text-on-surface truncate">{title}</span>
        {note && <span data-slot="swipe-row-subtitle" className="text-body-small text-on-surface-variant truncate">{note}</span>}
      </div>
    </div>
  );
}

const webAddress = (url: string) => (/^https?:\/\//i.test(url) ? url : "");

/* Whether it plays is `playing`, an input (the player's own while nobody takes it): the button hands the other one
 * out and sends `play` or `pause` (the `toggle` slot is the same button). With a file it plays the file, from
 * `position` and from wherever `position` is moved to, and sends `ended` at its end. With no file only a prototype's
 * demo moves the bar, to show what it would do; a product shows `position` as given. */
export function AudioPlayer({ title = "", artist = "", src = "", seconds = 180, playing: given = false, position = 0, width = 360, demo, onValueChange, onEvent, wired, className, style }: { title?: string; artist?: string; src?: string; seconds?: number; playing?: boolean; position?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useValue(given, host);
  const [at, setAt] = useSeeded(Math.max(0, position));
  const [length, setLength] = useSeeded(seconds);
  const address = webAddress(src);
  const play = (on: boolean) => {
    setPlaying(on);
    host.emit(on ? "play" : "pause", { position: Math.round(at) });
  };
  /* the file follows whether it plays and where it is put */
  useEffect(() => {
    const el = audio.current;
    if (!el || !address) return;
    if (playing && el.paused) void el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
  }, [playing, address]);
  useEffect(() => {
    if (audio.current && address && Math.abs(audio.current.currentTime - position) > 1) audio.current.currentTime = Math.max(0, position);
  }, [position, address]);
  /* with no file it plays in name only, and only in a prototype's demo: the bar moves so it shows what it would do */
  useEffect(() => {
    if (!playing || address || !host.demo) return;
    const id = setInterval(
      () =>
        setAt((s) => {
          if (s + 1 < length) return s + 1;
          setPlaying(false);
          host.emit("ended", {});
          return 0;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [playing, address, length, host.demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-slot="audio-player" data-playing={playing || undefined} className={cn("bg-surface-container-low flex items-center gap-3 rounded-2xl p-3", className)} style={{ width, ...style }}>
      <Button variant="filled" size="icon" aria-label={playing ? "Pause" : "Play"} aria-pressed={playing} data-tap="toggle" className="shrink-0" onClick={() => play(!playing)}>
        <WidgetIcon name={playing ? "pause" : "play_arrow"} />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div data-slot="audio-player-title" className="text-body-medium text-on-surface truncate">{title}</div>
        {artist && <div data-slot="audio-player-subtitle" className="text-body-small text-on-surface-variant truncate">{artist}</div>}
        <Progress value={length ? (at / length) * 100 : 0} />
        <div data-slot="audio-player-meta" className="text-label-small text-on-surface-variant flex justify-between tabular-nums">
          <span>{clock(at)}</span>
          <span>{clock(length)}</span>
        </div>
      </div>
      {address && (
        <audio
          ref={audio}
          src={address}
          preload="metadata"
          onLoadedMetadata={(e) => setLength(e.currentTarget.duration || seconds)}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            host.emit("ended", {});
          }}
        />
      )}
    </div>
  );
}
