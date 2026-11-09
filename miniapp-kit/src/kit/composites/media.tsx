import { Image as TaroImage, ScrollView, View, type CommonEvent, type ITouchEvent } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Button, IconButton } from "../atoms/controls";
import { Progress } from "../atoms/indicators";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph, svgUrl } from "../icons";
import { FillWidth, NoFill, useFill } from "../layout";
import { clampInt, recordsOf, withDefaults, type ListRow } from "../parts";
import { accentText } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { merge, sx, ROW, COL, type CSS } from "../styles";
import { corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";

/* What a screen shows of pictures, sound and moving things, drawn with Taro's views: a carousel and an expressive one,
 * a video, a web page and an animation (each the stand-in the canvas draws when it has nothing to play), the camera and
 * the map (capability views: the stand-in an exported mini-program's slot draws until the product writes the real one
 * with Taro's <Camera> or <Map>, docs/平台能力.md), a grid of photos, an audio player, a line that keeps moving past, a
 * playlist, a QR code, a scene behind a game screen, a picture viewer and a cropper.
 *
 * No platform player, web view, camera or map is drawn and no SDK is linked: those are the product's to add (a slot, or
 * batch 4's adapters), and Taro's Swiper is not used (docs/小程序.md, its dependencies' known issues). What is true comes
 * in as props (whether it plays and where it is, the marker chosen, whether a crop is done); what the visitor does goes
 * out as the part's value (`onValueChange`) and its events as callbacks named after them (`onPlay`, `onMarkerTap`,
 * `onCrop`…), which the exported mini-program wires once it runs events. A press on one of the part's places runs what
 * the design wires to it (`taps`). Fingers move things with touch events: sideways ones leave the page's own scrolling
 * alone, and what must keep a finger to itself (a frame dragged across a picture) says `catchMove`. */

/** an address a player or a web view could open: only the web's (a saved `javascript:` must never run) */
export const webAddress = (url: string | undefined) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : "");

/** a picture a part was given, if it is one: an address, a data URL, or a file the mini-program carries */
export const pictureOf = (p: string | undefined) => (typeof p === "string" && p && !/^\s*javascript:/i.test(p) ? p : "");

/** seconds as a clock: 03:05, or 1:02:03 past an hour */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

/** a whole number with its thousands marked, the same on every engine (a mini-program's may not mark them) */
export const grouped = (n: number) => {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return `${v < 0 ? "-" : ""}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

/** a table prop as the printer writes it (`{ columns, rows }`), its rows; anything else is no rows */
export const rowsOfTable = (t: unknown): string[][] => {
  const rows = t && typeof t === "object" ? (t as { rows?: unknown }).rows : undefined;
  return Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map((x) => (x === null || x === undefined ? "" : String(x))) : [])) : [];
};

/** State that starts at `seed`, and starts over when `seed` becomes a different value: a draft's external reset
 *  (docs/组件规范.md "受控值和草稿"). */
export function useSeeded<T>(seed: T): [T, (next: T | ((was: T) => T)) => void] {
  const key = JSON.stringify(seed) ?? "";
  const [held, setHeld] = useState({ key, value: seed });
  if (held.key !== key) setHeld({ key, value: seed });
  const value = held.key === key ? held.value : seed;
  return [value, (next) => setHeld((h) => ({ key: h.key, value: typeof next === "function" ? (next as (was: T) => T)(h.value) : next }))];
}

/** A value the visitor changes: controlled while someone takes it (`onValueChange` given: the prop is the value, a
 *  change only goes out), else a draft that starts at the prop and starts over when the prop changes. */
export function useControlled<T>(given: T, onValueChange: ((v: T) => void) | undefined): [T, (v: T) => void] {
  const [draft, setDraft] = useSeeded(given);
  return [onValueChange ? given : draft, (v: T) => (onValueChange ? onValueChange(v) : setDraft(v))];
}

/** whether things should hold still: the web asks for less motion (a mini-program has no such setting), or this is a test */
export const calm = (): boolean => {
  if ((process.env.NODE_ENV as string) === "test") return true;
  return process.env.TARO_ENV === "h5" && typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
};

/** the first finger of a touch event */
export const fingerOf = (e: CommonEvent, changed = false): { clientX: number; clientY: number } | undefined => {
  const t = e as unknown as ITouchEvent;
  return (changed ? t.changedTouches : t.touches)?.[0] as { clientX: number; clientY: number } | undefined;
};

let count = 0;
/** an id of the page's own, for asking where a view stands (Taro.createSelectorQuery) */
export const useViewId = (stem: string) => useState(() => `m3e-${stem}-${++count}`)[0];

/** where a view stands on the page, asked of the platform */
export function rectOf(id: string, then: (r: { left: number; top: number; width: number; height: number }) => void) {
  try {
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((r) => {
        const rect = (Array.isArray(r) ? r[0] : r) as { left: number; top: number; width: number; height: number } | null;
        if (rect) then(rect);
      })
      .exec();
  } catch {
    /* a page that cannot say leaves the view as it was */
  }
}

const FULL: CSS = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };

/** a picture filling its box, or the tinted ground with an icon the canvas draws when there is none */
export function PictureFill({ src, icon = "image", size = 40 }: { src?: string; icon?: string; size?: number }) {
  const pic = pictureOf(src);
  if (pic) return <TaroImage src={pic} mode="aspectFill" style={sx(FULL, { width: "100%", height: "100%", display: "block" })} />;
  return (
    <View style={sx(FULL, ROW, { justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${c("primary-container")}, ${c("tertiary-container")})` })}>
      <Glyph name={icon} size={size} color="on-primary-container" />
    </View>
  );
}

/** an SVG as a picture the platform's <Image> draws, its `currentColor` painted with a role (or a hex) */
function SvgPicture({ svg, color, style, label }: { svg: string; color: string; style: CSS; label?: string }) {
  const kit = useKit();
  const paint = kit.paint(color);
  const src = useMemo(() => svgUrl(svg, paint), [svg, paint]);
  return <TaroImage src={src} mode="aspectFit" style={sx({ display: "block" }, style)} ariaLabel={label} />;
}

/* ---------- a carousel ---------- */

export type CarouselProps = PartBase & { slides?: ListRow[]; arrows?: boolean; orientation?: "horizontal" | "vertical"; itemWidth?: number; gap?: number; width?: number; height?: number };

const SLIDE_COLORS = ["primary-container", "secondary-container", "tertiary-container", "surface-container-highest"];

/** where a track of `count` items `item` long, `gap` apart, stands at slide `at` in a view `view` long: never past its end */
export const trackOffset = (at: number, count: number, item: number, gap: number, view: number) => Math.max(0, Math.min(at * (item + gap), count * item + Math.max(0, count - 1) * gap - view));

/** Slides a finger pages through (touch events, not Taro's Swiper), each a picture or a tinted card with its words; with
 *  `arrows`, which one of how many shows, as the phone's kit says it. Which slide shows is the carousel's own. */
export function Carousel(props: CarouselProps) {
  const p = withDefaults<CarouselProps>("carousel", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 320);
  const h = Math.round(p.height ?? 200);
  const vertical = p.orientation === "vertical";
  const item = (p.itemWidth ?? 0) > 0 ? Math.round(p.itemWidth!) : vertical ? h : w;
  const gap = Math.round(p.gap ?? 16);
  const slides = p.slides ?? [];
  const view = vertical ? h : w;
  const last = Math.max(0, slides.length - 1);
  const [at, setAt] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const grab = useRef({ x: 0, y: 0, along: false });
  const offset = trackOffset(at, slides.length, item, gap, view);
  const onStart = (e: CommonEvent) => {
    const f = fingerOf(e);
    if (f) grab.current = { x: f.clientX, y: f.clientY, along: false };
  };
  const onMove = (e: CommonEvent) => {
    const f = fingerOf(e);
    if (!f) return;
    const dx = f.clientX - grab.current.x;
    const dy = f.clientY - grab.current.y;
    /* a finger going the other way is the page's to scroll */
    if (!grab.current.along && Math.abs(vertical ? dy : dx) > 6 && Math.abs(vertical ? dy : dx) > Math.abs(vertical ? dx : dy)) grab.current.along = true;
    if (grab.current.along) setDrag(vertical ? dy : dx);
  };
  const onEnd = () => {
    if (drag !== null && Math.abs(drag) > (item + gap) * 0.2) setAt(clampInt(at + (drag < 0 ? 1 : -1) * Math.max(1, Math.round(Math.abs(drag) / (item + gap))), 0, last));
    setDrag(null);
  };
  const moved = -offset + (drag ?? 0);
  return (
    <View {...tagOf(p.testID)} style={sx({ position: "relative", width: w, height: h, overflow: "hidden", flexShrink: 0 }, fill)} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd} catchMove={vertical}>
      <View style={sx({ display: "flex", flexDirection: vertical ? "column" : "row", [vertical ? "rowGap" : "columnGap"]: gap, transform: vertical ? `translateY(${moved}px)` : `translateX(${moved}px)`, transition: drag === null ? "transform 300ms ease-out" : "none" })}>
        {slides.map((s, i) => {
          const tone = SLIDE_COLORS[i % SLIDE_COLORS.length];
          const pic = pictureOf(s.image);
          return (
            <Surface key={i} base={{ position: "relative", flexShrink: 0, width: vertical ? w : item, height: vertical ? item : h, borderRadius: corner(kit, "xl"), overflow: "hidden", backgroundColor: c(tone), display: "flex", alignItems: "center", justifyContent: "center" }} appearance={p} onPress={tapOf(p, `tab:${i}`) ?? (() => {})} label={s.label}>
              {pic ? <TaroImage src={pic} mode="aspectFill" style={sx(FULL, { width: "100%", height: "100%" })} /> : null}
              <Words text={s.label} style={{ position: "relative", ...typeStyle(kit, "title-large"), color: pic ? "#FFFFFF" : c(tone === "surface-container-highest" ? "on-surface" : `on-${tone}`) }} />
            </Surface>
          );
        })}
      </View>
      {p.arrows && slides.length > 1 ? <Words text={`${at + 1}/${slides.length}`} style={{ position: "absolute", right: 12, bottom: 8, ...typeStyle(kit, "label-small"), color: accentText() }} /> : null}
    </View>
  );
}

/* ---------- an expressive carousel ---------- */

export type ExpressiveCarouselProps = PartBase & { variant?: "multi-browse" | "hero" | "uncontained" | "full-screen"; slides?: ListRow[]; itemWidth?: number; gap?: number; height?: number; width?: number };

const SMALL = 56;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Keylines = { big: number; large: number; medium: number; small: number };

/** M3's keylines for a track `width` wide (components/m3e/expressive-carousel.tsx): how many large items, and the
 *  large, medium and small widths; none for the variants whose items keep one width */
export function keylinesOf(variant: string, width: number, itemWidth: number, gap: number): Keylines | null {
  if (variant === "uncontained" || variant === "full-screen" || width <= 0) return null;
  if (variant === "hero") return { big: 1, large: Math.max(SMALL, width - SMALL - gap), medium: SMALL, small: SMALL };
  const big = Math.max(1, Math.floor((width - 1.5 * SMALL - gap) / (itemWidth + gap)));
  const large = (width - 1.5 * SMALL - (big + 1) * gap) / (big + 0.5);
  return { big, large, medium: (large + SMALL) / 2, small: SMALL };
}

/** the width of the item `d` steps ahead of where the track is */
export function widthAt(d: number, k: Keylines): number {
  if (d <= -2) return 0;
  if (d < -1) return lerp(0, k.small, d + 2);
  if (d < 0) return lerp(k.small, k.large, d + 1);
  if (d < k.big - 1) return k.large;
  if (d < k.big) return lerp(k.large, k.medium, d - (k.big - 1));
  if (d < k.big + 1) return lerp(k.medium, k.small, d - k.big);
  if (d < k.big + 2) return lerp(k.small, 0, d - (k.big + 1));
  return 0;
}

/** where each item stands and how wide it is, the track moved `s` steps on */
export function layoutAt(count: number, s: number, k: Keylines, gap: number): { x: number; w: number }[] {
  let x = 0;
  return Array.from({ length: count }, (_, i) => {
    const w = widthAt(i - s, k);
    const at = { x, w };
    if (w >= 1) x += w + gap;
    return at;
  });
}

const TONES: [string, string][] = [
  ["primary-container", "on-primary-container"],
  ["secondary-container", "on-secondary-container"],
  ["tertiary-container", "on-tertiary-container"],
];

/** what a slide shows: its picture with its words over a dark fade, or its words on a tinted ground */
function SlideFace({ slide, i, look }: { slide: ListRow; i: number; look: PartBase }) {
  const kit = useKit();
  const pic = pictureOf(slide.image);
  const [bg, ink] = TONES[i % TONES.length];
  return (
    <Surface base={{ ...FULL, display: "flex", flexDirection: "column", justifyContent: "flex-end", backgroundColor: c(pic ? "surface-container-highest" : bg), padding: pic ? 0 : 16 }} appearance={look}>
      {pic ? <TaroImage src={pic} mode="aspectFill" style={sx(FULL, { width: "100%", height: "100%" })} /> : null}
      {pic ? (
        slide.label ? (
          /* words over a photo: no theme role can answer for what the photo is */
          <View style={sx({ position: "relative", padding: 12, backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.6))" })}>
            <Words text={slide.label} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: "#FFFFFF" }} />
          </View>
        ) : null
      ) : (
        <Words text={slide.label} lines={2} style={{ ...typeStyle(kit, "title-large"), color: c(ink) }} />
      )}
    </Surface>
  );
}

/** A finger moves the track: in multi-browse and hero the items grow and shrink as it goes (M3's keylines), and it
 *  settles on a step when the finger lifts (eased by the stylesheet); uncontained and full-screen items keep their
 *  width and scroll past. Where the track is, is the carousel's own. */
export function ExpressiveCarousel(props: ExpressiveCarouselProps) {
  const p = withDefaults<ExpressiveCarouselProps>("expressive-carousel", props);
  const kit = useKit();
  const fill = useFill();
  const variant = p.variant ?? "multi-browse";
  const slides = p.slides ?? [];
  const gap = Math.round(p.gap ?? 8);
  const height = Math.round(p.height ?? 180);
  const itemWidth = Math.round(p.itemWidth ?? 186);
  const id = useViewId("carousel");
  /* the track's width: the design's, or what the cell gave it once measured */
  const [width, setWidth] = useState(Math.round(p.width ?? 420));
  useEffect(() => rectOf(id, (r) => r.width > 0 && setWidth(Math.round(r.width))), [id]);
  const k = keylinesOf(variant, width, itemWidth, gap);
  const step = k ? k.large + gap : itemWidth + gap;
  const last = k ? Math.max(0, slides.length - k.big - (variant === "hero" ? 1 : 2)) : 0;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const grab = useRef({ x: 0, y: 0, offset: 0, along: false });
  const clampOffset = (v: number) => Math.max(0, Math.min(last * step, v));
  const radius = corner(kit, "xl");
  const box = merge({ position: "relative", width: Math.round(p.width ?? 420), height, overflow: "hidden", flexShrink: 0 }, fill);
  if (!k) {
    const slide = variant === "full-screen" ? width : itemWidth;
    return (
      <View id={id} {...tagOf(p.testID)} style={sx(box)}>
        <ScrollView scrollX enhanced showScrollbar={false} style={sx({ width: "100%", height, whiteSpace: "nowrap" })}>
          <View style={sx(ROW, { columnGap: gap, height })}>
            {slides.map((s, i) => (
              <Surface key={i} base={{ position: "relative", flexShrink: 0, width: slide, height, borderRadius: radius, overflow: "hidden" }} onPress={tapOf(p, `tab:${i}`) ?? (() => {})} label={s.label || `${i + 1}`}>
                <SlideFace slide={s} i={i} look={p} />
              </Surface>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }
  const onStart = (e: CommonEvent) => {
    const f = fingerOf(e);
    if (f) grab.current = { x: f.clientX, y: f.clientY, offset, along: false };
  };
  const onMove = (e: CommonEvent) => {
    const f = fingerOf(e);
    if (!f) return;
    const dx = f.clientX - grab.current.x;
    if (!grab.current.along && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(f.clientY - grab.current.y)) {
      grab.current.along = true;
      setDragging(true);
    }
    if (grab.current.along) setOffset(clampOffset(grab.current.offset - dx));
  };
  const onEnd = () => {
    if (!grab.current.along) return;
    grab.current.along = false;
    setDragging(false);
    setOffset((o) => clampOffset(Math.round(o / step) * step));
  };
  const at = layoutAt(slides.length, step ? offset / step : 0, k, gap);
  const ease = dragging ? "none" : "left 220ms ease-out, width 220ms ease-out";
  return (
    <View id={id} {...tagOf(p.testID)} style={sx(box)} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      {slides.map((s, i) => {
        const { x, w } = at[i];
        return (
          <Surface key={i} base={{ position: "absolute", top: 0, left: x, width: w, height, borderRadius: radius, overflow: "hidden", visibility: w < 1 ? "hidden" : "visible", transition: ease }} onPress={tapOf(p, `tab:${i}`) ?? (() => {})} label={s.label || `${i + 1}`}>
            {/* the slide keeps its large size and is masked by the item that shrinks, as Compose's carousel does */}
            <View style={sx({ position: "absolute", top: 0, bottom: 0, left: (w - k.large) / 2, width: k.large, transition: dragging ? "none" : "left 220ms ease-out" })}>
              <SlideFace slide={s} i={i} look={p} />
            </View>
          </Surface>
        );
      })}
    </View>
  );
}

/* ---------- a video, a web page, an animation: their stand-ins ---------- */

export type VideoProps = PartBase & { src?: string; title?: string; time?: string; width?: number };

/** A video's frame at 16:9, the play mark, its title and time: what the canvas draws until it has a file. Taro's
 *  <Video> is not drawn, so an address is not played (the export reports it; a slot can add the player). */
export function Video(props: VideoProps) {
  const p = withDefaults<VideoProps>("video", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 380);
  return (
    <Surface base={merge({ ...COL, alignItems: "center", justifyContent: "center", rowGap: 4, width: w, height: Math.round((w * 9) / 16), borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} onPress={p.onPress} testID={p.testID} label={p.title || "Video"} role="img">
      <Glyph name="play_circle" size={48} color="on-surface-variant" />
      {p.title ? <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null}
      {p.time ? <Words text={p.time} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} /> : null}
    </Surface>
  );
}

export type WebPageProps = PartBase & { address?: string; load?: boolean; width?: number; height?: number };

/** a web page's frame: its address across the top, a globe where the page goes (a mini-program's <WebView> takes a
 *  whole page and a domain the product registers, so none is embedded here) */
export function WebPage(props: WebPageProps) {
  const p = withDefaults<WebPageProps>("web-view", props);
  const kit = useKit();
  const fill = useFill();
  return (
    <Surface base={merge({ ...COL, width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 280), borderRadius: corner(kit, "lgi"), border: `1px solid ${c("outline-variant")}`, overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} onPress={p.onPress} testID={p.testID}>
      <View style={sx({ backgroundColor: c("surface-container"), padding: "8px 12px" })}>
        <Words text={p.address} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} />
      </View>
      <View ariaRole="img" ariaLabel={p.address} style={sx(ROW, { flex: 1, justifyContent: "center", backgroundColor: c("surface") })}>
        <Glyph name="language" size={40} color="outline" />
      </View>
    </Surface>
  );
}

export type AnimationProps = PartBase & { file?: string; size?: number };

/** where an animation goes: a square with the mark and the file's name (Lottie and the like are not drawn here) */
export function Animation(props: AnimationProps) {
  const p = withDefaults<AnimationProps>("animation", props);
  const kit = useKit();
  const s = Math.round(p.size ?? 180);
  return (
    <Surface base={{ ...COL, alignItems: "center", justifyContent: "center", rowGap: 4, width: s, height: s, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high"), overflow: "hidden", flexShrink: 0 }} appearance={p} onPress={p.onPress} testID={p.testID} label={p.file} role="img">
      <Glyph name="animation" size={40} color="on-surface-variant" />
      <Words text={p.file} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} />
    </Surface>
  );
}

/* ---------- the camera and the map: capability views ---------- */

export type CameraStandInProps = PartBase & { facing?: "back" | "front"; mode?: "photo" | "video" | "scan"; state?: "live" | "denied" | "unavailable"; denied?: string; width?: number; height?: number };

/** The camera's stand-in (lib/capabilities `camera`): the frame and the shutter, or the scanning frame; the designs for a
 *  camera refused or missing. It opens no camera and takes nothing: the shutter is only its place (`taps.shutter`), and
 *  what the camera captures or scans is the slot's to send. */
export function CameraStandIn(props: CameraStandInProps) {
  const p = withDefaults<CameraStandInProps>("camera", props);
  const kit = useKit();
  const fill = useFill();
  const blocked = p.state === "denied" || p.state === "unavailable";
  return (
    <Surface base={merge({ ...ROW, justifyContent: "center", width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 480), borderRadius: corner(kit, "lgi"), backgroundColor: c("inverse-surface"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {blocked ? (
        <View style={sx(COL, { alignItems: "center", rowGap: 8, padding: 24 })}>
          <Glyph name={p.state === "denied" ? "no_photography" : "videocam_off"} size={48} color="inverse-on-surface" />
          {p.denied ? <Words text={p.denied} style={{ ...typeStyle(kit, "body-medium"), color: c("inverse-on-surface"), textAlign: "center" }} /> : null}
        </View>
      ) : p.mode === "scan" ? (
        <View style={sx({ width: 192, height: 192, borderRadius: corner(kit, "xl"), border: `4px dashed ${c("inverse-on-surface")}`, boxSizing: "border-box" })} />
      ) : (
        <Glyph name="photo_camera" size={48} color="inverse-on-surface" />
      )}
      {!blocked ? (
        <View
          ariaRole="button"
          ariaLabel={p.mode === "scan" ? "Scan" : p.mode === "video" ? "Record" : "Take a picture"}
          hoverClass="m3e-pressed"
          onClick={(e) => (e.stopPropagation(), tapOf(p, "shutter")?.())}
          style={sx({ position: "absolute", bottom: 16, left: "50%", marginLeft: -28, width: 56, height: 56, borderRadius: 28, border: `4px solid ${c("inverse-on-surface")}`, boxSizing: "border-box" })}
        />
      ) : null}
    </Surface>
  );
}

export type MapMarker = { id: string; title: string; lat: number; lng: number };

/** the markers of a table (Id, Title, Lat, Lng), those with an id and a place */
export const markersOf = (t: unknown): MapMarker[] =>
  rowsOfTable(t)
    .map((r) => ({ id: r[0] ?? "", title: r[1] ?? "", lat: Number(r[2]), lng: Number(r[3]) }))
    .filter((m) => m.id && Number.isFinite(m.lat) && Number.isFinite(m.lng));

/** a centre written "lat,lng", if it is one */
export const centerOf = (s: string | undefined) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s ?? "");
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : undefined;
};

/** Where markers stand on the stand-in (parts/widgets/Platform.tsx): their box of coordinates (and the centre's) laid
 *  over the view, padded, the north up. A stand-in draws no real map, so the spread is the markers' own. */
export function projection(points: { lat: number; lng: number }[], w: number, h: number) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = 0.15;
  const [lat0, lat1] = [Math.min(...lats), Math.max(...lats)];
  const [lng0, lng1] = [Math.min(...lngs), Math.max(...lngs)];
  const dLat = lat1 - lat0 || 0.01;
  const dLng = lng1 - lng0 || 0.01;
  return {
    at: (p: { lat: number; lng: number }) => ({ x: w * (pad + ((p.lng - lng0) / dLng) * (1 - 2 * pad)), y: h * (pad + ((lat1 - p.lat) / dLat) * (1 - 2 * pad)) }),
    back: (x: number, y: number) => ({ lat: lat1 - ((y / h - pad) / (1 - 2 * pad)) * dLat, lng: lng0 + ((x / w - pad) / (1 - 2 * pad)) * dLng }),
  };
}

export type MapStandInProps = PartBase & {
  label?: string;
  /** "lat,lng" */
  center?: string;
  zoom?: number;
  /** a table: Id, Title, Lat, Lng */
  markers?: { columns?: string[]; rows?: string[][] };
  /** the marker chosen, by its id: the view's input */
  selected?: string;
  route?: boolean;
  width?: number;
  height?: number;
  onValueChange?: (id: string) => void;
  onMarkerTap?: (e: { id: string }) => void;
  onLongPress?: (e: { lat: number; lng: number }) => void;
};

/** The map's stand-in (lib/capabilities `map`): a still ground, the markers where their coordinates put them and the
 *  route through them. A tap on a marker chooses it (`selected`, the view's value) and sends `markerTap`; a long press
 *  sends `longPress` with where. No map is drawn: the product's slot draws the real one (Taro's <Map>). */
export function MapStandIn(props: MapStandInProps) {
  const p = withDefaults<MapStandInProps>("map", props);
  const kit = useKit();
  const fill = useFill();
  const id = useViewId("map");
  const w = Math.round(p.width ?? 380);
  const h = Math.round(p.height ?? 240);
  const markers = markersOf(p.markers);
  const center = centerOf(p.center);
  const [chosen, choose] = useControlled(p.selected ?? "", p.onValueChange);
  const points = [...markers, ...(center ? [center] : [])];
  const proj = points.length ? projection(points, w, h) : null;
  const path = proj && p.route && markers.length > 1 ? markers.map((m) => proj.at(m)) : [];
  const route = path.length > 1 ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${path.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
  /* where the finger was held, read off the page and the map's own place on it */
  const held = (e: CommonEvent) => {
    const f = fingerOf(e) ?? fingerOf(e, true);
    if (!proj || !f || !p.onLongPress) return;
    rectOf(id, (r) => p.onLongPress?.(proj.back(((f.clientX - r.left) / Math.max(1, r.width)) * w, ((f.clientY - r.top) / Math.max(1, r.height)) * h)));
  };
  const road = c("surface-container");
  return (
    <View id={id} {...tagOf(p.testID)} ariaRole="img" ariaLabel={p.label || "Map"} onLongPress={held} onClick={p.onPress} style={sx({ position: "relative", width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high"), overflow: "hidden", flexShrink: 0 }, fill)}>
      <View style={sx({ position: "absolute", left: 0, right: 0, top: "33.3%", height: 12, backgroundColor: road })} />
      <View style={sx({ position: "absolute", top: 0, bottom: 0, left: "25%", width: 12, backgroundColor: road })} />
      <View style={sx({ position: "absolute", top: 0, bottom: 0, right: "20%", width: 8, backgroundColor: road })} />
      {route ? <SvgPicture svg={route} color="primary" style={{ ...FULL, width: w, height: h, pointerEvents: "none" }} /> : null}
      {proj && markers.length ? (
        markers.map((m) => {
          const at = proj.at(m);
          const on = chosen === m.id;
          const s = on ? 36 : 28;
          return (
            <View
              key={m.id}
              ariaRole="button"
              ariaLabel={m.title || m.id}
              hoverClass="m3e-pressed"
              onClick={(e) => {
                e.stopPropagation();
                choose(m.id);
                p.onMarkerTap?.({ id: m.id });
              }}
              style={sx(COL, { position: "absolute", left: Math.round(at.x) - 64, top: Math.round(at.y) - s - (on && m.title ? 22 : 0), width: 128, alignItems: "center", zIndex: on ? "1" : "0" })}
            >
              {on && m.title ? (
                <View style={sx({ maxWidth: 128, marginBottom: 2, padding: "2px 6px", borderRadius: corner(kit, "md"), backgroundColor: c("surface"), boxShadow: "0 1px 3px rgba(0,0,0,0.3)" })}>
                  <Words text={m.title} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface") }} />
                </View>
              ) : null}
              <Glyph name="location_on" size={s} filled color={on ? "primary" : "on-surface-variant"} />
            </View>
          );
        })
      ) : (
        <View style={sx(FULL, ROW, { justifyContent: "center" })}>
          <Glyph name="location_on" size={40} filled color="primary" />
        </View>
      )}
      {p.label ? (
        <View style={sx(ROW, { position: "absolute", left: 0, right: 0, bottom: 8, justifyContent: "center" })}>
          <Words text={p.label} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), backgroundColor: ca("surface", 0.8), borderRadius: corner(kit, "md"), padding: "0 8px" }} />
        </View>
      ) : null}
    </View>
  );
}

/* ---------- a grid of photos ---------- */

export type PhotoGridProps = PartBase & { count?: number; columns?: number; width?: number };

/** square cells, two points apart, each the ground where a photo goes (squares by their padding: no aspect-ratio needed) */
export function PhotoGrid(props: PhotoGridProps) {
  const p = withDefaults<PhotoGridProps>("photo-grid", props);
  const kit = useKit();
  const fill = useFill();
  const cols = clampInt(p.columns ?? 3, 1, 6);
  const count = clampInt(p.count ?? 9, 1, 30);
  const side = `calc((100% - ${(cols - 1) * 2}px) / ${cols})`;
  return (
    <Surface base={merge({ display: "flex", flexDirection: "row", flexWrap: "wrap", columnGap: 2, rowGap: 2, width: Math.round(p.width ?? 380), borderRadius: corner(kit, "sm"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} onPress={p.onPress} testID={p.testID}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={sx({ position: "relative", width: side, height: 0, paddingBottom: side, backgroundColor: c("surface-container-high") })}>
          <View style={sx(FULL, ROW, { justifyContent: "center" })}>
            <Glyph name="image" size={24} color="outline" />
          </View>
        </View>
      ))}
    </Surface>
  );
}

/* ---------- an audio player ---------- */

export type AudioPlayerProps = PartBase & {
  title?: string;
  artist?: string;
  src?: string;
  seconds?: number;
  /** whether it plays: the part's value */
  playing?: boolean;
  position?: number;
  width?: number;
  onValueChange?: (playing: boolean) => void;
  onPlay?: (e: { position: number }) => void;
  onPause?: (e: { position: number }) => void;
};

/** Whether it plays is the visitor's (`playing`, handed out with `onValueChange`, and sent as `play` or `pause`); where
 *  it is, is `position` as given. No file is played (Taro's audio context is the product's to add): the bar stands
 *  where `position` puts it, as an app that runs no prototype demo has it. */
export function AudioPlayer(props: AudioPlayerProps) {
  const p = withDefaults<AudioPlayerProps>("audio-player", props);
  const kit = useKit();
  const fill = useFill();
  const [playing, setPlaying] = useControlled(!!p.playing, p.onValueChange);
  const length = Math.max(1, p.seconds ?? 180);
  const at = Math.max(0, Math.min(length, p.position ?? 0));
  const toggle = () => {
    const next = !playing;
    setPlaying(next);
    (next ? p.onPlay : p.onPause)?.({ position: Math.round(at) });
    p.taps?.toggle?.();
  };
  const meta = { ...typeStyle(kit, "label-small"), color: c("on-surface-variant"), fontVariantNumeric: "tabular-nums" };
  return (
    <Surface base={merge({ ...ROW, columnGap: 12, padding: 12, width: Math.round(p.width ?? 360), borderRadius: corner(kit, "xl"), backgroundColor: c("surface-container-low"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <NoFill>
        <IconButton icon={playing ? "pause" : "play_arrow"} variant="filled" ariaLabel={playing ? "Pause" : "Play"} onPress={toggle} />
        <View style={sx(COL, { flex: 1, minWidth: 0, rowGap: 4 })}>
          <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
          {p.artist ? <Words text={p.artist} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
          <FillWidth>
            <Progress value={(at / length) * 100} label="" />
          </FillWidth>
          <View style={sx(ROW, { justifyContent: "space-between" })}>
            <Words text={clock(at)} style={meta} />
            <Words text={clock(length)} style={meta} />
          </View>
        </View>
      </NoFill>
    </Surface>
  );
}

/* ---------- a line that keeps moving past ---------- */

export type MarqueeProps = PartBase & { text?: string; seconds?: number; width?: number };

/** Its words twice in a row, moving left a whole copy every `seconds` and starting over: the kit's stylesheet runs the
 *  loop (`m3e-marquee`), and holds it still where the system asks for less motion. */
export function Marquee(props: MarqueeProps) {
  const p = withDefaults<MarqueeProps>("marquee", props);
  const kit = useKit();
  const fill = useFill();
  const words = { ...typeStyle(kit, "body-medium"), color: c("on-surface"), paddingRight: 32, whiteSpace: "nowrap", flexShrink: 0 };
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 320), overflow: "hidden", whiteSpace: "nowrap", flexShrink: 0 }, fill)} appearance={p} onPress={p.onPress} testID={p.testID} label={p.text}>
      <View className={calm() ? undefined : "m3e-marquee"} style={sx({ display: "inline-flex", flexDirection: "row", animationDuration: `${Math.max(2, p.seconds ?? 12)}s` })}>
        <Words text={p.text} style={words} />
        <View ariaHidden style={sx({ display: "flex" })}>
          <Words text={p.text} style={words} />
        </View>
      </View>
    </Surface>
  );
}

/* ---------- a playlist ---------- */

export type PlaylistProps = PartBase & {
  title?: string;
  /** a table: Title, Detail, Length, State (done, locked or empty) */
  data?: { columns?: string[]; rows?: string[][] };
  /** the current row, which whoever draws the list moves */
  selected?: number;
  /** whether the current row plays: the other side's */
  playing?: boolean;
  width?: number;
  onPlay?: (e: { index: number; playing: boolean }) => void;
};

/** The current row is `selected` and whether it plays is `playing`, both the other side's: a press on a row asks to
 *  play it, or to pause the one playing (`play`, with the row and whether it should play now). Locked rows are held. */
export function Playlist(props: PlaylistProps) {
  const p = withDefaults<PlaylistProps>("playlist", props);
  const kit = useKit();
  const fill = useFill();
  const rows = rowsOfTable(p.data);
  const done = rows.filter((r) => r[3] === "done").length;
  return (
    <Surface base={merge({ ...COL, rowGap: 2, padding: 8, width: Math.round(p.width ?? 380), borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {p.title ? (
        <View style={sx(ROW, { alignItems: "baseline", justifyContent: "space-between", columnGap: 8, padding: "4px 8px" })}>
          <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} />
          {done > 0 ? <Words text={`${done} / ${rows.length}`} style={{ ...typeStyle(kit, "label-medium"), color: ca("on-surface", 0.7), flexShrink: 0 }} /> : null}
        </View>
      ) : null}
      {rows.map((r, i) => {
        const locked = r[3] === "locked";
        const current = i === p.selected;
        const ink = current ? "on-secondary-container" : "on-surface";
        const sub = ca(ink, 0.7);
        return (
          <View
            key={i}
            ariaRole="button"
            ariaLabel={r[0] || `${i + 1}`}
            hoverClass={locked ? "none" : "m3e-pressed"}
            onClick={
              locked
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    p.onPlay?.({ index: i, playing: current ? !p.playing : true });
                    tapOf(p, `tab:${i}`)?.();
                  }
            }
            style={sx(ROW, { columnGap: 12, padding: 8, borderRadius: corner(kit, "lg"), backgroundColor: current ? c("secondary-container") : undefined, opacity: locked ? 0.5 : 1 })}
          >
            <View style={sx(ROW, { width: 32, height: 32, justifyContent: "center", flexShrink: 0 })}>
              {locked ? <Glyph name="lock" size={20} color={ink} /> : current ? <Glyph name={p.playing ? "pause" : "play_arrow"} size={24} color={ink} /> : r[3] === "done" ? <Glyph name="check" size={20} color="primary" /> : <Words text={String(i + 1)} style={{ ...typeStyle(kit, "label-large"), color: c(ink) }} />}
            </View>
            <View style={sx(COL, { flex: 1, minWidth: 0 })}>
              <Words text={r[0] ?? ""} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c(ink) }} />
              {r[1] ? <Words text={r[1]} lines={1} style={{ ...typeStyle(kit, "body-small"), color: sub }} /> : null}
            </View>
            <Words text={r[2] ?? ""} style={{ ...typeStyle(kit, "label-medium"), color: sub, flexShrink: 0, fontVariantNumeric: "tabular-nums" }} />
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a QR code: byte mode, versions 1 to 10 (ISO/IEC 18004) ----------
 * The editor's encoder (parts/widgets/AppTools.tsx `qrMatrix`, checked by parts/qr.test.ts with a reader written from
 * the standard), as it is, with the words turned into UTF-8 by hand: a mini-program's engine may have no TextEncoder. */

/** per level, by version 1..10: error correction codewords per block, and blocks */
const QR_LEVELS: Record<string, { bits: number; ecc: number[]; blocks: number[] }> = {
  L: { bits: 1, ecc: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
  M: { bits: 0, ecc: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
  Q: { bits: 3, ecc: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24], blocks: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8] },
  H: { bits: 2, ecc: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28], blocks: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8] },
};

/** words as UTF-8 bytes, a lone surrogate as U+FFFD (as TextEncoder writes it) */
export function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0) ?? 0xfffd;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** the modules of a version left for data and error correction, in bits */
const qrRawBits = (version: number) => {
  let bits = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    bits -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) bits -= 36;
  }
  return bits;
};

/** multiplication in GF(2^8) over the polynomial QR uses */
const gfTimes = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
};

/** the Reed-Solomon remainder of `data`: its `degree` error correction codewords */
function qrRemainder(data: number[], degree: number): number[] {
  const divisor = Array.from({ length: degree }, () => 0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      divisor[j] = gfTimes(divisor[j], root);
      if (j + 1 < degree) divisor[j] ^= divisor[j + 1];
    }
    root = gfTimes(root, 2);
  }
  const rest = Array.from({ length: degree }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (rest.shift() as number);
    rest.push(0);
    divisor.forEach((d, i) => (rest[i] ^= gfTimes(d, factor)));
  }
  return rest;
}

const QR_MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** how much a finished symbol looks like something a scanner trips on (the standard's four rules) */
function qrPenalty(m: boolean[][]) {
  const size = m.length;
  let score = 0;
  let dark = 0;
  const lines = (read: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let run = 0;
      let last = false;
      let word = 0;
      for (let b = 0; b < size; b++) {
        const v = read(a, b);
        if (b > 0 && v === last) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
          last = v;
        }
        word = ((word << 1) | (v ? 1 : 0)) & 0x7ff;
        if (b >= 10 && (word === 0b10111010000 || word === 0b00001011101)) score += 40;
      }
    }
  };
  lines((y, x) => m[y][x]);
  lines((x, y) => m[y][x]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (y + 1 < size && x + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  return score + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
}

/** the modules of a QR code for `text`, or null when it does not fit in version 10 */
export function qrMatrix(text: string, level = "M"): boolean[][] | null {
  const spec = QR_LEVELS[level] ?? QR_LEVELS.M;
  const bytes = utf8(text);
  let version = 0;
  let capacity = 0;
  for (let v = 1; v <= 10; v++) {
    capacity = Math.floor(qrRawBits(v) / 8) - spec.ecc[v - 1] * spec.blocks[v - 1];
    if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= capacity * 8) {
      version = v;
      break;
    }
  }
  if (!version) return null;

  /* the data: mode, length, bytes, terminator, then padding up to capacity */
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = Array.from({ length: capacity }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));

  /* split into blocks, add error correction, interleave */
  const eccLength = spec.ecc[version - 1];
  const count = spec.blocks[version - 1];
  const shortData = Math.floor(capacity / count);
  const longFrom = count - (capacity % count);
  const blocks: number[][] = [];
  for (let i = 0, at = 0; i < count; i++) {
    const length = shortData + (i < longFrom ? 0 : 1);
    blocks.push(data.slice(at, at + length));
    at += length;
  }
  const eccs = blocks.map((b) => qrRemainder(b, eccLength));
  const stream: number[] = [];
  for (let i = 0; i <= shortData; i++) blocks.forEach((b) => i < b.length && stream.push(b[i]));
  for (let i = 0; i < eccLength; i++) eccs.forEach((e) => stream.push(e[i]));

  /* the fixed patterns */
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const fixed = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const mark = (x: number, y: number, on: boolean) => {
    modules[y][x] = on;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    mark(6, i, i % 2 === 0);
    mark(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) mark(x, y, ring !== 2 && ring !== 4);
      }
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    const step = Math.ceil((version * 4 + 4) / (aligns * 2 - 2)) * 2;
    const spots = [6, ...Array.from({ length: aligns - 1 }, (_, i) => size - 7 - (aligns - 2 - i) * step)];
    spots.forEach((cy, j) =>
      spots.forEach((cx, i) => {
        if ((i === 0 && j === 0) || (i === 0 && j === aligns - 1) || (i === aligns - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }
  const format = (mask: number) => {
    const value = (spec.bits << 3) | mask;
    let rest = value;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const word = ((value << 10) | rest) ^ 0x5412;
    const bit = (i: number) => ((word >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) mark(8, i, bit(i));
    mark(8, 7, bit(6));
    mark(8, 8, bit(7));
    mark(7, 8, bit(8));
    for (let i = 9; i < 15; i++) mark(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) mark(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) mark(8, size - 15 + i, bit(i));
    mark(8, size - 8, true);
  };
  format(0);
  if (version >= 7) {
    let rest = version;
    for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const word = (version << 12) | rest;
    for (let i = 0; i < 18; i++) {
      const on = ((word >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(a, b, on);
      mark(b, a, on);
    }
  }

  /* the data, zigzagging up and down from the right edge */
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - step : step;
        if (fixed[y][x] || index >= stream.length * 8) continue;
        modules[y][x] = ((stream[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index++;
      }
  }

  /* the mask a scanner reads best */
  const masked = (mask: number) => {
    format(mask);
    return modules.map((row, y) => row.map((on, x) => (fixed[y][x] ? on : on !== QR_MASKS[mask](x, y))));
  };
  let best = masked(0);
  let bestScore = qrPenalty(best);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = masked(mask);
    const score = qrPenalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** the symbol as an SVG: the dark modules as one path, four modules of quiet zone around them */
export const qrSvg = (m: boolean[][], size: number) => {
  const span = m.length + 8;
  const d = m.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}" shape-rendering="crispEdges"><path d="${d}" fill="currentColor"/></svg>`;
};

export type QrCodeProps = PartBase & {
  text?: string;
  level?: "L" | "M" | "Q" | "H";
  caption?: string;
  copy?: string;
  copied?: string;
  tooLong?: string;
  size?: number;
  /** copies the words another way than the platform's clipboard (Taro.setClipboardData) */
  onCopy?: (text: string) => void | boolean | Promise<unknown>;
};

/** The symbol for its words, drawn module by module, with its caption and a button that copies them (the platform's
 *  clipboard; said "copied" once it is done). Too much text for version 10 shows `tooLong` in its place. */
export function QrCode(props: QrCodeProps) {
  const p = withDefaults<QrCodeProps>("qr-code", props);
  const kit = useKit();
  const text = p.text ?? "";
  const size = Math.round(p.size ?? 200);
  const matrix = useMemo(() => qrMatrix(text, p.level ?? "M"), [text, p.level]);
  const svg = useMemo(() => (matrix ? qrSvg(matrix, size) : ""), [matrix, size]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const copy = async () => {
    try {
      if (p.onCopy) {
        if ((await p.onCopy(text)) === false) return;
      } else await Taro.setClipboardData({ data: text });
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1500);
    } catch {
      /* the copy was refused: the button simply does not say it copied */
    }
  };
  return (
    <Surface base={{ ...COL, alignItems: "center", rowGap: 8, padding: 12, width: size + 24, alignSelf: "flex-start", borderRadius: corner(kit, "lg"), backgroundColor: c("surface"), flexShrink: 0 }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <NoFill>
        {matrix ? (
          <SvgPicture svg={svg} color="on-surface" style={{ width: size, height: size }} label={text} />
        ) : (
          <View ariaRole="alert" style={sx(ROW, { width: size, height: size, justifyContent: "center" })}>
            <Words text={p.tooLong} style={{ ...typeStyle(kit, "body-small"), color: c("error"), textAlign: "center" }} />
          </View>
        )}
        {p.caption ? <Words text={p.caption} lines={1} style={{ ...typeStyle(kit, "body-small"), color: ca("on-surface", 0.7), textAlign: "center", alignSelf: "stretch" }} /> : null}
        {p.copy && matrix ? <Button label={done ? p.copied || p.copy : p.copy} variant="tonal" size="xs" onPress={() => void copy()} /> : null}
      </NoFill>
    </Surface>
  );
}

/* ---------- a scene behind a game screen ---------- */

export type SceneProps = PartBase & { image?: string; scrim?: "none" | "top" | "bottom" | "both" | "full"; icon?: string; hotspots?: { columns?: string[]; rows?: string[][] }; width?: number; height?: number; children?: ReactNode };

/** the fades that keep words readable over a picture, by where they darken (parts/widgets/Scene.tsx) */
const SCRIMS: Record<string, string | undefined> = {
  none: undefined,
  top: `linear-gradient(${ca("scrim", 0.65)}, transparent 40%)`,
  bottom: `linear-gradient(transparent 55%, ${ca("scrim", 0.7)})`,
  both: `linear-gradient(${ca("scrim", 0.6)}, transparent 35%, transparent 60%, ${ca("scrim", 0.7)})`,
  full: `linear-gradient(${ca("scrim", 0.4)}, ${ca("scrim", 0.4)})`,
};

/** a cell of the hotspots' table as a percentage of the scene */
const percentOf = (cell: string | undefined) => Math.max(0, Math.min(100, Number(String(cell ?? "").replace("%", "")) || 0));

/** The picture a game screen stands on, its fade, and the places in it that answer a tap (`tab:N`); what the player
 *  reads and presses is the parts laid over it. A motion the canvas animates holds its first frame here. */
export function Scene(props: SceneProps) {
  const p = withDefaults<SceneProps>("scene", props);
  const fill = useFill();
  const pic = pictureOf(p.image);
  /* the places to tap, read by key as the editor's row model reads them: label, x, y, w, h (parts/tableColumns.ts) */
  const spots = recordsOf("scene", "hotspots", p.hotspots);
  const scrim = SCRIMS[p.scrim ?? "none"];
  return (
    <Surface base={merge({ position: "relative", width: Math.round(p.width ?? 412), height: Math.round(p.height ?? 892), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {pic ? (
        <TaroImage src={pic} mode="aspectFill" style={sx(FULL, { width: "100%", height: "100%" })} />
      ) : (
        <View style={sx(FULL, ROW, { justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${c("primary-container")}, ${c("tertiary-container")})`, opacity: 1 })}>
          <View style={sx({ opacity: 0.6 })}>
            <Glyph name={p.icon || "landscape"} size={64} color="on-primary-container" />
          </View>
        </View>
      )}
      {scrim ? <View style={sx(FULL, { backgroundImage: scrim, pointerEvents: "none" })} /> : null}
      {spots.map((r, i) => (
        <View key={i} ariaRole="button" ariaLabel={r.label || `${i + 1}`} onClick={(e) => (e.stopPropagation(), tapOf(p, `tab:${i}`)?.())} style={sx({ position: "absolute", left: `${percentOf(r.x)}%`, top: `${percentOf(r.y)}%`, width: `${percentOf(r.w)}%`, height: `${percentOf(r.h)}%` })} />
      ))}
      <NoFill>{p.children}</NoFill>
    </Surface>
  );
}

/* ---------- a picture viewer ---------- */

export type ImageViewerProps = PartBase & {
  images?: ListRow[];
  height?: number;
  thumbnails?: boolean;
  /** the picture on show: the part's value */
  index?: number;
  width?: number;
  onValueChange?: (index: number) => void;
  onChange?: (e: { index: number }) => void;
  onFullscreen?: (e: { open: boolean }) => void;
};

/** The picture on show is `index` (handed out with `onValueChange` and sent as `change` whenever the arrows or a
 *  thumbnail move it); full screen covers the page, sent as `fullscreen`, and zooms there. Zooming is the viewer's. */
export function ImageViewer(props: ImageViewerProps) {
  const p = withDefaults<ImageViewerProps>("image-viewer", props);
  const kit = useKit();
  const fill = useFill();
  const rows = p.images?.length ? p.images : [{ label: "" }];
  const [at, setAt] = useControlled(clampInt(p.index ?? 0, 0, 99), p.onValueChange);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const current = clampInt(at, 0, rows.length - 1);
  const many = rows.length > 1;
  const show = (to: number) => {
    setZoom(1);
    if (to === current) return;
    setAt(to);
    p.onChange?.({ index: to });
  };
  const go = (d: number) => show((current + d + rows.length) % rows.length);
  const open = (on: boolean) => {
    setFull(on);
    p.onFullscreen?.({ open: on });
  };
  const row = rows[current];
  const counter = `${current + 1} / ${rows.length}`;
  const arrows = (inset: number) =>
    many ? (
      <>
        <View style={sx({ position: "absolute", left: inset, top: "50%", marginTop: -20 })}>
          <IconButton icon="chevron_left" variant="tonal" ariaLabel="Previous" onPress={() => go(-1)} />
        </View>
        <View style={sx({ position: "absolute", right: inset, top: "50%", marginTop: -20 })}>
          <IconButton icon="chevron_right" variant="tonal" ariaLabel="Next" onPress={() => go(1)} />
        </View>
      </>
    ) : null;
  return (
    <Surface base={merge({ ...COL, rowGap: 8, width: Math.round(p.width ?? 380), overflow: "hidden", borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <NoFill>
        <View ariaRole="img" ariaLabel={row.label || undefined} style={sx({ position: "relative", height: Math.round(p.height ?? 260) })}>
          <PictureFill src={row.image} />
          {arrows(8)}
          <View style={sx({ position: "absolute", top: 8, right: 8 })}>
            <IconButton icon="fullscreen" variant="tonal" ariaLabel="Full screen" onPress={() => open(true)} />
          </View>
          {many ? (
            <View style={sx(ROW, { position: "absolute", bottom: 8, left: 0, right: 0, justifyContent: "center" })}>
              <Words text={counter} style={{ ...typeStyle(kit, "label-small"), color: c("inverse-on-surface"), backgroundColor: c("inverse-surface"), borderRadius: 999, padding: "2px 8px" }} />
            </View>
          ) : null}
        </View>
        {row.label ? <Words text={row.label} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface"), padding: "0 12px" }} /> : null}
        {p.thumbnails && many ? (
          <ScrollView scrollX enhanced showScrollbar={false} style={sx({ width: "100%", whiteSpace: "nowrap" })}>
            <View style={sx(ROW, { columnGap: 8, padding: "0 12px 12px" })}>
              {rows.map((r, i) => (
                <View
                  key={i}
                  ariaRole="button"
                  ariaLabel={r.label || `${i + 1}`}
                  ariaSelected={i === current}
                  hoverClass="m3e-pressed"
                  onClick={(e) => {
                    e.stopPropagation();
                    show(i);
                    p.taps?.[`tab:${i}`]?.();
                  }}
                  style={sx({ position: "relative", width: 56, height: 56, flexShrink: 0, borderRadius: corner(kit, "md"), border: `2px solid ${i === current ? c("primary") : "transparent"}`, overflow: "hidden", boxSizing: "border-box" })}
                >
                  <PictureFill src={r.image} size={20} />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
        {full ? (
          <View {...tagOf(p.testID ? `${p.testID}-full` : undefined)} catchMove style={sx(COL, { position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: "100", backgroundColor: c("inverse-surface") })}>
            <View style={sx(ROW, { columnGap: 4, padding: 8, paddingTop: 40 })}>
              <IconButton icon="close" ariaLabel="Close" onPress={() => open(false)} />
              <Words text={row.label} lines={1} style={{ flex: 1, ...typeStyle(kit, "title-medium"), color: c("inverse-on-surface") }} />
              <IconButton icon="zoom_out" ariaLabel="Zoom out" disabled={zoom <= 1} onPress={() => setZoom((z) => Math.max(1, z - 0.5))} />
              <IconButton icon="zoom_in" ariaLabel="Zoom in" disabled={zoom >= 3} onPress={() => setZoom((z) => Math.min(3, z + 0.5))} />
            </View>
            <View style={sx(ROW, { position: "relative", flex: 1, minHeight: 0, overflow: "hidden", justifyContent: "center" })}>
              <View style={sx({ position: "relative", width: "100%", height: 0, paddingBottom: "100%", transform: `scale(${zoom})`, transition: "transform 200ms" })}>
                <PictureFill src={row.image} />
              </View>
              {arrows(12)}
            </View>
            {many ? <Words text={counter} style={{ ...typeStyle(kit, "label-large"), color: c("inverse-on-surface"), textAlign: "center", padding: "12px 12px 32px" }} /> : null}
          </View>
        ) : null}
      </NoFill>
    </Surface>
  );
}

/* ---------- a picture cropper ---------- */

export type ImageCropperProps = PartBase & {
  image?: string;
  aspect?: "free" | "1:1" | "4:3" | "3:4" | "16:9";
  action?: string;
  reset?: string;
  doneText?: string;
  /** where the frame starts: "x,y,w,h" in fractions of the picture */
  crop?: string;
  turn?: number;
  /** whether the crop is done: the other side's to say */
  cropped?: boolean;
  height?: number;
  width?: number;
  onCrop?: (e: Crop & { turn: number }) => void;
};

export type Crop = { x: number; y: number; w: number; h: number };
const ASPECTS: Record<string, number> = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9 };

/** a crop given as "x,y,w,h" in fractions of the picture, if it is one */
export const cropOf = (words: string | undefined): Crop | null => {
  const [x, y, w, h, more] = (words ?? "").split(",").map((n) => Number(n.trim()));
  return more === undefined && [x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && w > 0 && h > 0 ? { x, y, w, h } : null;
};

/** where the frame starts: the crop given, else centred at the aspect (parts/widgets/AppMore.tsx) */
export function startCrop(given: string | undefined, aspect: string, width: number, height: number): Crop {
  const own = cropOf(given);
  if (own) return own;
  const ratio = ASPECTS[aspect];
  if (!ratio) return { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
  const w = Math.min(0.7, (0.7 * height * ratio) / width);
  const h = (w * width) / ratio / height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** the frame moved, or resized from its corner keeping the aspect, by a fraction of the picture */
export function dragCrop(from: Crop, kind: "move" | "size", dx: number, dy: number, aspect: string, width: number, height: number): Crop {
  if (kind === "move") return { ...from, x: Math.min(1 - from.w, Math.max(0, from.x + dx)), y: Math.min(1 - from.h, Math.max(0, from.y + dy)) };
  const ratio = ASPECTS[aspect];
  let w = Math.min(1 - from.x, Math.max(0.1, from.w + dx));
  let h = Math.min(1 - from.y, Math.max(0.1, from.h + dy));
  if (ratio) {
    h = (w * width) / ratio / height;
    if (from.y + h > 1) {
      h = 1 - from.y;
      w = (h * height * ratio) / width;
    }
  }
  return { x: from.x, y: from.y, w, h };
}

/** Where the frame stands and how far the picture turns are the visitor's draft: they start at `crop` and `turn`, and
 *  start over when those change. A finger moves the frame and pulls its corner (keeping the finger from the page:
 *  `catchMove`). The button sends `crop` with the frame and the turn; cutting the picture, and whether it is done
 *  (`cropped`), are the other side's. */
export function ImageCropper(props: ImageCropperProps) {
  const p = withDefaults<ImageCropperProps>("image-cropper", props);
  const kit = useKit();
  const fill = useFill();
  const id = useViewId("crop");
  const width = Math.round(p.width ?? 380);
  const height = Math.round(p.height ?? 300);
  const aspect = p.aspect ?? "1:1";
  const [crop, setCrop] = useSeeded<Crop>(startCrop(p.crop, aspect, width, height));
  const [turn, setTurn] = useSeeded((((Math.round((p.turn ?? 0) / 90) * 90) % 360) + 360) % 360);
  /* where the finger took hold, the frame then, and the picture's size on the page (asked when it lands) */
  const grab = useRef({ x: 0, y: 0, crop, w: width - 16, h: height, kind: "move" as "move" | "size" });
  const hold = (e: CommonEvent, kind: "move" | "size") => {
    e.stopPropagation();
    const f = fingerOf(e);
    if (!f) return;
    grab.current = { ...grab.current, x: f.clientX, y: f.clientY, crop, kind };
    rectOf(id, (r) => Object.assign(grab.current, { w: Math.max(1, r.width), h: Math.max(1, r.height) }));
  };
  const onMove = (e: CommonEvent) => {
    const f = fingerOf(e);
    if (!f) return;
    const g = grab.current;
    setCrop(dragCrop(g.crop, g.kind, (f.clientX - g.x) / g.w, (f.clientY - g.y) / g.h, aspect, width, height));
  };
  const pct = (n: number) => `${n * 100}%`;
  const scrim = ca("scrim", 0.55);
  const edge = c("on-primary");
  const pane = (s: CSS) => <View style={sx({ position: "absolute", backgroundColor: scrim, pointerEvents: "none" }, s)} />;
  return (
    <Surface base={merge({ ...COL, rowGap: 8, padding: 8, width, overflow: "hidden", borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <NoFill>
        <View id={id} style={sx({ position: "relative", height, borderRadius: corner(kit, "lg"), overflow: "hidden" })}>
          <View style={sx(FULL, { transform: `rotate(${turn}deg)`, transition: "transform 200ms" })}>
            <PictureFill src={p.image} />
          </View>
          {/* what falls outside the frame is dimmed: four panes around it */}
          {pane({ left: 0, right: 0, top: 0, height: pct(crop.y) })}
          {pane({ left: 0, right: 0, top: pct(crop.y + crop.h), bottom: 0 })}
          {pane({ left: 0, width: pct(crop.x), top: pct(crop.y), height: pct(crop.h) })}
          {pane({ left: pct(crop.x + crop.w), right: 0, top: pct(crop.y), height: pct(crop.h) })}
          <View
            {...tagOf(p.testID ? `${p.testID}-frame` : undefined)}
            ariaLabel={`Crop ${Math.round(crop.w * width)} × ${Math.round(crop.h * height)}`}
            catchMove
            onTouchStart={(e) => hold(e, "move")}
            onTouchMove={onMove}
            style={sx({ position: "absolute", left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h), border: `2px solid ${edge}`, boxSizing: "border-box" })}
          >
            <View catchMove onTouchStart={(e) => hold(e, "size")} onTouchMove={onMove} style={sx({ position: "absolute", right: -10, bottom: -10, width: 20, height: 20, borderRadius: 10, border: `2px solid ${edge}`, backgroundColor: c("primary"), boxSizing: "border-box" })} />
          </View>
        </View>
        <View style={sx(ROW, { columnGap: 4 })}>
          <IconButton icon="rotate_right" ariaLabel="Rotate" onPress={() => setTurn((t) => (t + 90) % 360)} />
          {p.reset ? (
            <Button
              label={p.reset}
              variant="text"
              onPress={() => {
                setTurn(0);
                setCrop(startCrop(p.crop, aspect, width, height));
              }}
            />
          ) : null}
          <Words text={p.cropped ? p.doneText : `${Math.round(crop.w * width)} × ${Math.round(crop.h * height)}`} lines={1} style={{ flex: 1, minWidth: 0, textAlign: "right", ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} />
          {p.action ? (
            <Button
              label={p.action}
              onPress={() => {
                p.onCrop?.({ ...crop, turn });
                tapOf(p, "done")?.();
              }}
            />
          ) : null}
        </View>
      </NoFill>
    </Surface>
  );
}
