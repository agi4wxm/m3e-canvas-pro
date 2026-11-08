import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { rove } from "./roving";

/* What several kinds of app need and nothing else here draws: a picture looked at or cropped, a place
 * or a seat chosen, what reviews add up to, a voice note and a call, a funnel and a schedule. Each
 * holds its own state, so it works in the preview and in an exported project. */

const PICTURE = /^(https?:|data:image\/)/i;
const pictureOf = (src: string | undefined) => (src && PICTURE.test(src) ? src : "");
const SCRIM = "color-mix(in srgb, var(--md-sys-color-scrim) 55%, transparent)";

/** a part drawn inert on the canvas shows how it looks and starts nothing */
const isInert = (el: Element | null) => !el || !!el.closest("[inert]");

function Placeholder({ icon = "image", className }: { icon?: string; className?: string }) {
  return (
    <div className={cn("flex size-full items-center justify-center bg-gradient-to-br from-primary-container to-tertiary-container text-on-primary-container", className)}>
      <WidgetIcon name={icon} className="size-10" />
    </div>
  );
}

/** the screen a part stands on: what a full-screen view fills, in the preview and in an exported app alike */
function screenOf(el: Element | null): Element | null {
  for (let at = el?.parentElement ?? null; at && at !== document.body; at = at.parentElement) {
    const s = getComputedStyle(at);
    if (s.overflowX === "hidden" && s.overflowY === "hidden" && s.position !== "static" && at.clientHeight >= 200 && at.clientWidth >= 200) return at;
  }
  return document.body;
}

function OnScreen({ from, children }: { from: Element | null; children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => setHost(screenOf(from)), [from]);
  return host ? createPortal(children, host) : null;
}

/* ---------- pictures ---------- */

export function ImageViewer({ images = [], height = 260, width = 380, thumbnails = true, className, style }: { images?: { label: string; image?: string }[]; height?: number; width?: number; thumbnails?: boolean } & Look) {
  const rows = images.length ? images : [{ label: "" }];
  const [at, setAt] = useState(0);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const current = Math.min(at, rows.length - 1);
  const go = (d: number) => {
    setZoom(1);
    setAt((current + d + rows.length) % rows.length);
  };
  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFull(false);
      }
      if (e.key === "ArrowRight") {
        e.stopPropagation();
        go(1);
      }
      if (e.key === "ArrowLeft") {
        e.stopPropagation();
        go(-1);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });
  const src = pictureOf(rows[current].image);
  const many = rows.length > 1;
  return (
    <div ref={root} data-slot="image-viewer" data-index={current} className={cn("flex flex-col gap-2 overflow-hidden rounded-xl bg-surface-container", className)} style={{ width, ...style }}>
      <div className="relative" style={{ height }}>
        {src ? <img src={src} alt={rows[current].label} className="size-full object-cover" /> : <Placeholder />}
        {many && (
          <>
            <Button variant="tonal" size="icon" aria-label="Previous" className="absolute top-1/2 left-2 -translate-y-1/2" onClick={() => go(-1)}><WidgetIcon name="chevron_left" /></Button>
            <Button variant="tonal" size="icon" aria-label="Next" className="absolute top-1/2 right-2 -translate-y-1/2" onClick={() => go(1)}><WidgetIcon name="chevron_right" /></Button>
          </>
        )}
        <Button variant="tonal" size="icon" aria-label="Full screen" data-full className="absolute top-2 right-2" onClick={() => setFull(true)}><WidgetIcon name="fullscreen" /></Button>
        {many && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-inverse-surface px-2 py-0.5 text-label-small text-inverse-on-surface">{current + 1} / {rows.length}</span>}
      </div>
      {rows[current].label && <div className="px-3 text-body-medium text-on-surface">{rows[current].label}</div>}
      {thumbnails && many && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-3">
          {rows.map((row, i) => (
            <Tap key={i} aria-label={row.label || `${i + 1}`} aria-pressed={i === current} className={cn("size-14 shrink-0 rounded-md border-2", i === current ? "border-primary" : "border-transparent")} onClick={() => { setZoom(1); setAt(i); }}>
              {pictureOf(row.image) ? <img src={pictureOf(row.image)} alt="" className="size-full rounded-sm object-cover" /> : <Placeholder className="rounded-sm [&_svg]:size-5" />}
            </Tap>
          ))}
        </div>
      )}
      {full && (
        <OnScreen from={root.current}>
          <div data-slot="image-viewer-full" className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-inverse-surface text-inverse-on-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center gap-1 p-2">
              <Button variant="text" size="icon" aria-label="Close" className="text-inverse-on-surface" onClick={() => setFull(false)}><WidgetIcon name="close" /></Button>
              <span className="min-w-0 flex-1 truncate text-title-medium">{rows[current].label}</span>
              <Button variant="text" size="icon" aria-label="Zoom out" disabled={zoom <= 1} className="text-inverse-on-surface" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><WidgetIcon name="zoom_out" /></Button>
              <Button variant="text" size="icon" aria-label="Zoom in" disabled={zoom >= 3} className="text-inverse-on-surface" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}><WidgetIcon name="zoom_in" /></Button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <div data-zoom={zoom} className="flex size-full items-center justify-center transition-transform" style={{ transform: `scale(${zoom})` }}>
                {src ? <img src={src} alt={rows[current].label} className="max-h-full max-w-full object-contain" /> : <div className="aspect-square w-3/4 overflow-hidden rounded-lg"><Placeholder /></div>}
              </div>
              {many && (
                <>
                  <Button variant="tonal" size="icon" aria-label="Previous" className="absolute top-1/2 left-3 -translate-y-1/2" onClick={() => go(-1)}><WidgetIcon name="chevron_left" /></Button>
                  <Button variant="tonal" size="icon" aria-label="Next" className="absolute top-1/2 right-3 -translate-y-1/2" onClick={() => go(1)}><WidgetIcon name="chevron_right" /></Button>
                </>
              )}
            </div>
            {many && <div className="shrink-0 p-3 text-center text-label-large">{current + 1} / {rows.length}</div>}
          </div>
        </OnScreen>
      )}
    </div>
  );
}

const ASPECTS: Record<string, number> = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9 };
type Crop = { x: number; y: number; w: number; h: number };

export function ImageCropper({ image = "", aspect = "1:1", width = 380, height = 300, action = "", reset = "", doneText = "", className, style }: { image?: string; aspect?: string; width?: number; height?: number; action?: string; reset?: string; doneText?: string } & Look) {
  /* a crop in fractions of the picture, centred to start */
  const start = (): Crop => {
    const ratio = ASPECTS[aspect];
    if (!ratio) return { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
    const w = Math.min(0.7, (0.7 * height * ratio) / width);
    const h = (w * width) / ratio / height;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  };
  const [crop, setCrop] = useState<Crop>(start);
  const [turn, setTurn] = useState(0);
  const [done, setDone] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => setCrop(start()), [aspect, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = (kind: "move" | "size") => (e: ReactPointerEvent<HTMLElement>) => {
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = { px: e.clientX, py: e.clientY, ...crop };
    const ratio = ASPECTS[aspect];
    const target = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - from.px) / box.width;
      const dy = (ev.clientY - from.py) / box.height;
      setDone(false);
      if (kind === "move") setCrop({ ...from, x: Math.min(1 - from.w, Math.max(0, from.x + dx)), y: Math.min(1 - from.h, Math.max(0, from.y + dy)) });
      else {
        let w = Math.min(1 - from.x, Math.max(0.1, from.w + dx));
        let h = Math.min(1 - from.y, Math.max(0.1, from.h + dy));
        if (ratio) {
          h = (w * width) / ratio / height;
          if (from.y + h > 1) {
            h = 1 - from.y;
            w = (h * height * ratio) / width;
          }
        }
        setCrop({ x: from.x, y: from.y, w, h });
      }
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const src = pictureOf(image);
  const percent = (n: number) => `${n * 100}%`;
  return (
    <div data-slot="image-cropper" data-crop={`${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.w.toFixed(3)},${crop.h.toFixed(3)}`} data-turn={turn} className={cn("flex flex-col gap-2 overflow-hidden rounded-xl bg-surface-container p-2", className)} style={{ width, ...style }}>
      <div ref={area} className="relative touch-none overflow-hidden rounded-lg select-none" style={{ height }}>
        <div className="size-full transition-transform" style={{ transform: `rotate(${turn}deg)` }}>{src ? <img src={src} alt="" draggable={false} className="size-full object-cover" /> : <Placeholder />}</div>
        <div data-crop-box onPointerDown={drag("move")} className="absolute cursor-move border-2 border-on-primary" style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.w), height: percent(crop.h), boxShadow: `0 0 0 9999px ${SCRIM}` }}>
          <div data-crop-handle onPointerDown={drag("size")} className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize rounded-full border-2 border-on-primary bg-primary" />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="text" size="icon" aria-label="Rotate" onClick={() => { setDone(false); setTurn((t) => (t + 90) % 360); }}><WidgetIcon name="rotate_right" /></Button>
        {reset && <Button variant="text" onClick={() => { setDone(false); setTurn(0); setCrop(start()); }}>{reset}</Button>}
        <span className="min-w-0 flex-1 truncate text-right text-label-medium text-on-surface-variant">{done ? doneText : `${Math.round(crop.w * width)} × ${Math.round(crop.h * height)}`}</span>
        {action && <Button data-tap="done" onClick={() => setDone(true)}>{action}</Button>}
      </div>
    </div>
  );
}

/* ---------- choosing ---------- */

export function RegionPicker({ label = "", rows = [], placeholder = "", action = "", width = 380, height = 240, className, style }: { label?: string; rows?: string[][]; placeholder?: string; action?: string; width?: number; height?: number } & Look) {
  const [path, setPath] = useState<string[]>([]);
  const depth = Math.max(1, ...rows.map((r) => r.length));
  const columns = Array.from({ length: depth }, (_, level) => {
    const seen = rows.filter((r) => path.slice(0, level).every((p, i) => r[i] === p)).map((r) => r[level]).filter(Boolean);
    return level > path.length ? [] : [...new Set(seen)];
  });
  const complete = path.length === depth;
  return (
    <div data-slot="region-picker" data-value={path.join("/")} className={cn("flex flex-col gap-2 overflow-hidden rounded-xl bg-surface-container-low p-3", className)} style={{ width, ...style }}>
      {label && <div className="text-title-small text-on-surface">{label}</div>}
      <div data-region-value className={cn("truncate text-body-large", path.length ? "text-on-surface" : "text-on-surface-variant")}>{path.length ? path.join(" / ") : placeholder}</div>
      <div className="flex gap-1 overflow-hidden" style={{ height }}>
        {columns.map((options, level) => (
          <div key={level} role="listbox" aria-label={label ? `${label} ${level + 1}` : undefined} className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {options.map((name, i, all) => (
              <Tap
                key={name}
                role="option"
                aria-selected={path[level] === name}
                {...rove(all.length, all.indexOf(path[level] ?? ""), { orientation: "vertical", onMove: (at) => setPath([...path.slice(0, level), all[at]]) })(i)} className={cn("shrink-0 truncate rounded-md px-2 py-2 text-left text-body-medium", path[level] === name ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-on-surface/8")} onClick={() => setPath([...path.slice(0, level), name])}>
                {name}
              </Tap>
            ))}
          </div>
        ))}
      </div>
      {action && <Button data-tap="confirm" disabled={!complete}>{action}</Button>}
    </div>
  );
}

const seatId = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`;

export function SeatMap({ rows = 6, columns = 8, aisle = 4, taken = "", price = 0, currency = "", most = 4, screen = "", action = "", pickedText = "", width = 380, className, style }: { rows?: number; columns?: number; aisle?: number; taken?: string; price?: number; currency?: string; most?: number; screen?: string; action?: string; pickedText?: string; width?: number } & Look) {
  const [picked, setPicked] = useState<string[]>([]);
  const gone = new Set(taken.split(/[\s,，]+/).filter(Boolean).map((s) => s.toUpperCase()));
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length >= most ? now : [...now, id]));
  const total = picked.length * price;
  return (
    <div data-slot="seat-map" data-picked={picked.join(",")} className={cn("flex flex-col gap-3 rounded-xl bg-surface-container-low p-3", className)} style={{ width, ...style }}>
      {screen && <div className="mx-auto w-3/4 rounded-b-xl bg-surface-container-high py-1 text-center text-label-small text-on-surface-variant">{screen}</div>}
      <div className="flex flex-col items-stretch gap-1">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-1">
            <span className="w-4 shrink-0 text-center text-label-small text-on-surface-variant">{String.fromCharCode(65 + r)}</span>
            {Array.from({ length: columns }, (_, c) => {
              const id = seatId(r, c);
              const off = gone.has(id);
              const on = picked.includes(id);
              return (
                <Tap key={id} aria-label={id} aria-pressed={on} disabled={off} data-seat={id} className={cn("aspect-square min-w-0 flex-1 rounded-sm", aisle > 0 && c === aisle - 1 && "mr-3", off ? "bg-surface-container-highest opacity-50" : on ? "bg-primary" : "border border-outline-variant bg-surface")} onClick={() => toggle(id)} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-medium text-on-surface">{picked.length ? picked.join(" ") : pickedText}</div>
          {picked.length > 0 && price > 0 && <div className="text-title-medium text-primary">{currency}{total}</div>}
        </div>
        {action && <Button data-tap="confirm" disabled={!picked.length}>{action}</Button>}
      </div>
    </div>
  );
}

/* ---------- reading ---------- */

export function ReviewSummary({ score = "", count = "", values = [], tags = [], action = "", width = 380, className, style }: { score?: string; count?: string; values?: number[]; tags?: string[]; action?: string; width?: number } & Look) {
  const [on, setOn] = useState<string | null>(null);
  const most = Math.max(1, ...values);
  const stars = Math.round(Number(score) || 0);
  return (
    <div data-slot="review-summary" data-tag={on ?? ""} className={cn("flex flex-col gap-3 rounded-xl bg-surface-container-low p-4", className)} style={{ width, ...style }}>
      <div className="flex items-center gap-4">
        <div className="shrink-0 text-center">
          <div data-slot="review-summary-value" className="text-display-small text-on-surface">{score}</div>
          <div className="flex justify-center text-tertiary">{Array.from({ length: 5 }, (_, i) => <WidgetIcon key={i} name="star" className={cn("size-4", i >= stars && "opacity-30")} />)}</div>
          <div className="mt-1 text-label-small text-on-surface-variant">{count}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 text-label-small text-on-surface-variant">{values.length - i}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full rounded-full bg-primary" style={{ width: `${(v / most) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Tap key={tag} aria-pressed={on === tag} className={cn("rounded-md border px-3 py-1 text-label-large", on === tag ? "border-transparent bg-secondary-container text-on-secondary-container" : "border-outline-variant text-on-surface-variant")} onClick={() => setOn(on === tag ? null : tag)}>{tag}</Tap>
          ))}
        </div>
      )}
      {action && <Button variant="tonal" data-tap="action">{action}</Button>}
    </div>
  );
}

export function FunnelChart({ title = "", rows = [], width = 380, className, style }: { title?: string; rows?: { name: string; value: number }[]; width?: number } & Look) {
  const most = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div data-slot="funnel-chart" className={cn("flex flex-col gap-2 rounded-xl bg-surface-container-low p-4", className)} style={{ width, ...style }}>
      {title && <div className="text-title-medium text-on-surface">{title}</div>}
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div data-funnel-bar className="flex h-9 min-w-0 items-center justify-center overflow-hidden rounded-md px-2 text-label-large text-on-primary" style={{ width: `${Math.max(18, (row.value / most) * 100)}%`, background: `var(--chart-${(i % 5) + 1})` }}>
            <span className="truncate">{row.name} {row.value}</span>
          </div>
          {i < rows.length - 1 && row.value > 0 && <span className="text-label-small text-on-surface-variant">↓ {Math.round((rows[i + 1].value / row.value) * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}

export function GanttChart({ title = "", rows = [], units = 8, unit = "", today = -1, width = 380, className, style }: { title?: string; rows?: { name: string; start: number; length: number; done: number }[]; units?: number; unit?: string; today?: number; width?: number } & Look) {
  const [on, setOn] = useState(-1);
  const percent = (n: number) => `${(n / Math.max(1, units)) * 100}%`;
  return (
    <div data-slot="gantt-chart" data-selected={on} className={cn("flex flex-col gap-1 overflow-hidden rounded-xl bg-surface-container-low p-3", className)} style={{ width, ...style }}>
      {title && <div className="pb-1 text-title-medium text-on-surface">{title}</div>}
      <div className="flex text-label-small text-on-surface-variant">
        <div className="w-20 shrink-0" />
        <div className="flex min-w-0 flex-1">{Array.from({ length: units }, (_, i) => <span key={i} className="min-w-0 flex-1 truncate text-center">{i + 1}{i === 0 ? unit : ""}</span>)}</div>
      </div>
      {rows.map((row, i) => (
        <Tap key={i} aria-pressed={i === on} className={cn("flex items-center rounded-md text-left", i === on && "bg-secondary-container")} onClick={() => setOn(i === on ? -1 : i)}>
          <span className="w-20 shrink-0 truncate pr-2 text-body-small text-on-surface">{row.name}</span>
          <span className="relative block h-7 min-w-0 flex-1">
            <span data-gantt-bar className="absolute top-1 bottom-1 overflow-hidden rounded-sm bg-primary-container" style={{ left: percent(row.start), width: percent(row.length) }}>
              <span className="block h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, row.done))}%` }} />
            </span>
            {today >= 0 && <span className="absolute top-0 bottom-0 w-px bg-error" style={{ left: percent(today) }} />}
          </span>
        </Tap>
      ))}
    </div>
  );
}

/* ---------- talking ---------- */

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function VoiceMessage({ seconds = 12, mine = false, transcript = "", transcribe = "", width = 240, className, style }: { seconds?: number; mine?: boolean; transcript?: string; transcribe?: string; width?: number } & Look) {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setAt((now) => {
      if (now + 0.25 < seconds) return now + 0.25;
      setPlaying(false);
      return 0;
    }), 250);
    return () => clearInterval(id);
  }, [playing, seconds]);
  /* the same note always draws the same wave */
  const bars = Array.from({ length: 24 }, (_, i) => 30 + ((i * 37 + seconds * 13) % 70));
  const tone = mine ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface";
  return (
    <div data-slot="voice-message" data-playing={playing || undefined} data-at={at} className={cn("flex flex-col gap-1 rounded-2xl p-2", tone, className)} style={{ width, ...style }}>
      <div className="flex items-center gap-2">
        <Tap aria-label={playing ? "Pause" : "Play"} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-current/15" onClick={() => setPlaying((p) => !p)}>
          <WidgetIcon name={playing ? "pause" : "play_arrow"} className="size-5" />
        </Tap>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-px">
          {bars.map((h, i) => <span key={i} className={cn("min-w-0 flex-1 rounded-full bg-current", i / bars.length > at / Math.max(1, seconds) && "opacity-40")} style={{ height: `${h}%` }} />)}
        </div>
        <span className="shrink-0 text-label-small tabular-nums">{clock(playing || at ? at : seconds)}</span>
      </div>
      {transcript && transcribe && !shown && <Tap className="self-start rounded-md px-2 py-0.5 text-label-small underline" onClick={() => setShown(true)}>{transcribe}</Tap>}
      {transcript && shown && <div data-transcript className="px-1 text-body-small">{transcript}</div>}
    </div>
  );
}

export function VideoCall({ name = "", status = "", image = "", icon = "person", connected = true, width = 380, height = 560, className, style }: { name?: string; status?: string; image?: string; icon?: string; connected?: boolean; width?: number; height?: number } & Look) {
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [speaker, setSpeaker] = useState(true);
  const [time, setTime] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connected || isInert(root.current)) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);
  const src = pictureOf(image);
  const toggle = (on: boolean, set: (v: boolean) => void, yes: string, no: string, label: string) => (
    <Tap aria-label={label} aria-pressed={on} className={cn("flex size-12 items-center justify-center rounded-full", on ? "bg-surface-container-high text-on-surface" : "bg-inverse-on-surface text-inverse-surface")} onClick={() => set(!on)}>
      <WidgetIcon name={on ? yes : no} className="size-6" />
    </Tap>
  );
  return (
    <div ref={root} data-slot="video-call" data-mic={mic} data-camera={camera} data-time={time} className={cn("relative flex flex-col overflow-hidden rounded-2xl bg-inverse-surface text-inverse-on-surface", className)} style={{ width, height, ...style }}>
      <div className="absolute inset-0">{src ? <img src={src} alt="" className="size-full object-cover" /> : <Placeholder icon={icon} />}</div>
      <div className="relative flex flex-col items-center gap-0.5 p-4" style={{ background: `linear-gradient(${SCRIM}, transparent)` }}>
        <div className="text-title-large">{name}</div>
        <div className="text-body-small tabular-nums">{connected ? clock(time) : status}</div>
      </div>
      <div className="absolute top-20 right-3 flex h-28 w-20 items-center justify-center overflow-hidden rounded-lg bg-surface-container text-on-surface-variant">
        <WidgetIcon name={camera ? "person" : "videocam_off"} className="size-7" />
      </div>
      <div className="relative mt-auto flex items-center justify-center gap-3 p-4" style={{ background: `linear-gradient(transparent, ${SCRIM})` }}>
        {toggle(mic, setMic, "mic", "mic_off", "Microphone")}
        {toggle(camera, setCamera, "videocam", "videocam_off", "Camera")}
        {toggle(speaker, setSpeaker, "volume_up", "volume_off", "Speaker")}
        <Tap aria-label="End call" data-tap="end" className="flex size-12 items-center justify-center rounded-full bg-error text-on-error"><WidgetIcon name="call_end" className="size-6" /></Tap>
      </div>
    </div>
  );
}
