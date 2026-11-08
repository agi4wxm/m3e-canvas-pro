import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, Text as RNText, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";

import type { PartBase } from "../atoms/basics";
import { Button, IconButton } from "../atoms/controls";
import { Progress } from "../atoms/indicators";
import { Glyph } from "../icons/Icon";
import { FillWidth, NoFill, useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, sourceOf, withDefaults, type ListRow, type Picture } from "../parts";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* What a screen shows of pictures, sound and moving things, drawn natively: an expressive carousel, a video, a web page
 * and an animation (each the stand-in the canvas draws when it has nothing to play), the camera and the map (capability
 * views: the stand-in an exported app's slot draws until the product writes the real one, docs/平台能力.md), a grid of
 * photos, an audio player, a line that keeps moving past, a playlist, a QR code, a picture viewer and a cropper.
 *
 * Nothing here plays a file, opens a page or a camera, or links an SDK: the kit has no player, web view or camera to draw
 * them with, and those are the product's to add (a slot, or batch 4's adapters). What is true comes in as props (whether
 * it plays and where it is, the marker chosen, whether a crop is done); what the visitor does goes out as the part's
 * value (`onValueChange`) and its events as callbacks named after them (`onPlay`, `onMarkerTap`, `onCrop`…), which the
 * exported app wires once it runs events. A press on one of the part's places runs what the design wires to it (`taps`). */

export const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** an address a player or a web view could open: only the web's (a saved `javascript:` must never run) */
export const webAddress = (url: string | undefined) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : "");

/** a picture a part was given, if it is one (an address, a data URL, a file the app bundles) */
export const pictureOf = (p: Picture | undefined): Picture | undefined => (typeof p === "string" ? (/^(https?:|data:image\/)/i.test(p) ? p : undefined) : p);

/** seconds as a clock: 03:05, or 1:02:03 past an hour */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

/** a whole number with its thousands marked, the same on every device (an engine's own locale may not mark them) */
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

/** whether things should hold still: the system asks for less motion, or this is a test, where no loop is started */
export function useCalm(): boolean {
  const test = process.env.NODE_ENV === "test";
  const [calm, setCalm] = useState(test);
  useEffect(() => {
    if (test) return;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setCalm(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setCalm);
    return () => {
      live = false;
      sub.remove();
    };
  }, [test]);
  return calm;
}

const fullBox = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

/** a picture filling its box, or the tinted ground with an icon the canvas draws when there is none */
function PictureFill({ src, icon = "image", size = 40 }: { src?: Picture; icon?: string; size?: number }) {
  const kit = useKit();
  const pic = pictureOf(src);
  if (pic !== undefined && pic !== "") return <ExpoImage source={sourceOf(pic)} contentFit="cover" style={fullBox} />;
  return (
    <LinearGradient colors={[c(kit, "primary-container"), c(kit, "tertiary-container")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[fullBox, { alignItems: "center", justifyContent: "center" }]}>
      <Glyph name={icon} size={size} color={c(kit, "on-primary-container")} />
    </LinearGradient>
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
  if (pic !== undefined && pic !== "")
    return (
      <Surface base={{ ...fullBox, backgroundColor: c(kit, "surface-container-highest"), justifyContent: "flex-end" }} appearance={look}>
        <ExpoImage source={sourceOf(pic)} contentFit="cover" style={fullBox} />
        {slide.label ? (
          /* words over a photo: no theme role can answer for what the photo is */
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={{ padding: 12 }}>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-medium"), color: "#FFFFFF" }}>{slide.label}</RNText>
          </LinearGradient>
        ) : null}
      </Surface>
    );
  return (
    <Surface base={{ ...fullBox, backgroundColor: c(kit, bg), justifyContent: "flex-end", padding: 16 }} appearance={look}>
      <RNText numberOfLines={2} style={{ ...typeStyle(kit, "title-large"), color: c(kit, ink) }}>{slide.label}</RNText>
    </Surface>
  );
}

/** A finger moves the track: in multi-browse and hero the items grow and shrink as it goes (M3's keylines), and it
 *  settles on a step when the finger lifts; uncontained and full-screen items keep their width and scroll past. Where the
 *  track is, is the carousel's own. A screen reader moves it a step with each slide's "next" and "previous" actions. */
export function ExpressiveCarousel(props: ExpressiveCarouselProps) {
  const p = withDefaults<ExpressiveCarouselProps>("expressive-carousel", props);
  const kit = useKit();
  const fill = useFill();
  const calm = useCalm();
  const variant = p.variant ?? "multi-browse";
  const slides = p.slides ?? [];
  const gap = Math.round(p.gap ?? 8);
  const height = Math.round(p.height ?? 180);
  const itemWidth = Math.round(p.itemWidth ?? 186);
  const [width, setWidth] = useState(Math.round(p.width ?? 420));
  const k = keylinesOf(variant, width, itemWidth, gap);
  const step = k ? k.large + gap : itemWidth + gap;
  const last = k ? Math.max(0, slides.length - k.big - (variant === "hero" ? 1 : 2)) : 0;
  const [offset, setOffset] = useState(0);
  /* where the finger took hold (the page, the time, the track then) and where it was last, for how fast it left */
  const grab = useRef({ x: 0, y: 0, offset: 0, lastX: 0, lastT: 0, v: 0 });
  const tween = useRef<number | null>(null);
  useEffect(() => () => void (tween.current !== null && cancelAnimationFrame(tween.current)), []);
  const clampOffset = (v: number) => Math.max(0, Math.min(last * step, v));
  /* settles on a step: drawn there at once when motion is held still, else eased there */
  const settle = (to: number) => {
    const target = clampOffset(Math.round(to / step) * step);
    if (tween.current !== null) cancelAnimationFrame(tween.current);
    if (calm) return setOffset(target);
    const from = offset;
    /* the frames' own clock: when the first one came, and how far on each one is */
    let start = -1;
    const run = (now: number) => {
      if (start < 0) start = now;
      const t = Math.min(1, (now - start) / 220);
      setOffset(from + (target - from) * (1 - (1 - t) ** 3));
      tween.current = t < 1 ? requestAnimationFrame(run) : null;
    };
    tween.current = requestAnimationFrame(run);
  };
  /* the responder's own props (no PanResponder): a sideways move takes the touch from the slide under it */
  const touch = {
    onTouchStart: (e: GestureResponderEvent) => {
      const { pageX, pageY, timestamp } = e.nativeEvent;
      grab.current = { x: pageX, y: pageY, offset, lastX: pageX, lastT: timestamp, v: 0 };
    },
    onMoveShouldSetResponderCapture: (e: GestureResponderEvent) => {
      const dx = e.nativeEvent.pageX - grab.current.x;
      return Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.nativeEvent.pageY - grab.current.y);
    },
    onResponderGrant: () => {
      if (tween.current !== null) cancelAnimationFrame(tween.current);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const g = grab.current;
      const { pageX, timestamp } = e.nativeEvent;
      if (timestamp > g.lastT) g.v = (pageX - g.lastX) / (timestamp - g.lastT);
      g.lastX = pageX;
      g.lastT = timestamp;
      setOffset(clampOffset(g.offset - (pageX - g.x)));
    },
    onResponderRelease: (e: GestureResponderEvent) => settle(grab.current.offset - (e.nativeEvent.pageX - grab.current.x) - grab.current.v * step * 0.5),
    onResponderTerminate: (e: GestureResponderEvent) => settle(grab.current.offset - (e.nativeEvent.pageX - grab.current.x)),
  };
  const move = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "next") settle(offset + step);
    else if (e.nativeEvent.actionName === "previous") settle(offset - step);
  };
  const radius = corner(kit, "xl");
  const box: ViewStyle = { width: Math.round(p.width ?? 420), height, overflow: "hidden", ...fill };
  const measure = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  if (!k) {
    const slide = variant === "full-screen" ? width : itemWidth;
    return (
      <View testID={p.testID} style={box} onLayout={measure} accessibilityRole="none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={slide + gap} decelerationRate="fast" contentContainerStyle={{ columnGap: gap }}>
          {slides.map((s, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={s.label || `${i + 1}`} onPress={tapOf(p, `tab:${i}`)} style={{ width: slide, height, borderRadius: radius, overflow: "hidden" }}>
              <SlideFace slide={s} i={i} look={p} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }
  const at = layoutAt(slides.length, step ? offset / step : 0, k, gap);
  return (
    <View testID={p.testID} style={box} onLayout={measure} {...touch}>
      {slides.map((s, i) => {
        const { x, w } = at[i];
        const shown = w >= 1;
        const tap = tapOf(p, `tab:${i}`);
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={s.label || `${i + 1}`}
            accessibilityActions={[{ name: "activate" }, { name: "next", label: "Next slide" }, { name: "previous", label: "Previous slide" }]}
            onAccessibilityAction={(e) => (e.nativeEvent.actionName === "activate" ? tap?.() : move(e))}
            accessibilityElementsHidden={!shown}
            importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
            onPress={tap}
            style={{ position: "absolute", top: 0, left: x, width: w, height, borderRadius: radius, overflow: "hidden", opacity: shown ? 1 : 0 }}
          >
            {/* the slide keeps its large size and is masked by the item that shrinks, as Compose's carousel does */}
            <View style={{ position: "absolute", top: 0, bottom: 0, left: (w - k.large) / 2, width: k.large }}>
              <SlideFace slide={s} i={i} look={p} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- a video, a web page, an animation: their stand-ins ---------- */

export type VideoProps = PartBase & { src?: string; title?: string; time?: string; width?: number };

/** A video's frame at 16:9, the play mark, its title and time: what the canvas draws until it has a file. The kit has
 *  no player, so an address is not played here either (the export reports it). */
export function Video(props: VideoProps) {
  const p = withDefaults<VideoProps>("video", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 380);
  return (
    <Surface base={{ width: w, height: Math.round((w * 9) / 16), borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high"), alignItems: "center", justifyContent: "center", rowGap: 4, overflow: "hidden", ...fill }} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" accessibilityLabel={p.title || "Video"}>
      <Glyph name="play_circle" size={48} color={c(kit, "on-surface-variant")} />
      {p.title ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.title}</RNText> : null}
      {p.time ? <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>{p.time}</RNText> : null}
    </Surface>
  );
}

export type WebPageProps = PartBase & { address?: string; load?: boolean; width?: number; height?: number };

/** a web page's frame: its address across the top, a globe where the page goes (a phone app embeds no browser here) */
export function WebPage(props: WebPageProps) {
  const p = withDefaults<WebPageProps>("web-view", props);
  const kit = useKit();
  const fill = useFill();
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 280), borderRadius: corner(kit, "lgi"), borderWidth: 1, borderColor: c(kit, "outline-variant"), overflow: "hidden", ...fill }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <View style={{ backgroundColor: c(kit, "surface-container"), paddingHorizontal: 12, paddingVertical: 8 }}>
        <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.address}</RNText>
      </View>
      <View accessibilityRole="image" accessibilityLabel={p.address} style={{ flex: 1, backgroundColor: c(kit, "surface"), alignItems: "center", justifyContent: "center" }}>
        <Glyph name="language" size={40} color={c(kit, "outline")} />
      </View>
    </Surface>
  );
}

export type AnimationProps = PartBase & { file?: string; size?: number };

/** where an animation goes: a square with the mark and the file's name (Lottie and the like are not drawn on a phone) */
export function Animation(props: AnimationProps) {
  const p = withDefaults<AnimationProps>("animation", props);
  const kit = useKit();
  const s = Math.round(p.size ?? 180);
  return (
    <Surface base={{ width: s, height: s, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high"), alignItems: "center", justifyContent: "center", rowGap: 4, overflow: "hidden" }} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" accessibilityLabel={p.file}>
      <Glyph name="animation" size={40} color={c(kit, "on-surface-variant")} />
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>{p.file}</RNText>
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
  const ink = c(kit, "inverse-on-surface");
  const blocked = p.state === "denied" || p.state === "unavailable";
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 480), borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "inverse-surface"), alignItems: "center", justifyContent: "center", overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {blocked ? (
        <View style={{ alignItems: "center", rowGap: 8, padding: 24 }}>
          <Glyph name={p.state === "denied" ? "no_photography" : "videocam_off"} size={48} color={ink} />
          {p.denied ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: ink, textAlign: "center" }}>{p.denied}</RNText> : null}
        </View>
      ) : p.mode === "scan" ? (
        <View style={{ width: 192, height: 192, borderRadius: corner(kit, "xl"), borderWidth: 4, borderStyle: "dashed", borderColor: ink }} />
      ) : (
        <Glyph name="photo_camera" size={48} color={ink} />
      )}
      {!blocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.mode === "scan" ? "Scan" : p.mode === "video" ? "Record" : "Take a picture"}
          onPress={tapOf(p, "shutter")}
          style={{ position: "absolute", bottom: 16, left: "50%", marginLeft: -28, width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: ink }}
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
 *  sends `longPress` with where. No map is drawn: the product's slot draws the real one. */
export function MapStandIn(props: MapStandInProps) {
  const p = withDefaults<MapStandInProps>("map", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 380);
  const h = Math.round(p.height ?? 240);
  const markers = markersOf(p.markers);
  const center = centerOf(p.center);
  const [chosen, choose] = useControlled(p.selected ?? "", p.onValueChange);
  const route = p.route && markers.length > 1 ? markers : [];
  const points = [...markers, ...(center ? [center] : [])];
  const proj = points.length ? projection(points, w, h) : null;
  const path = proj ? route.map((m) => proj.at(m)) : [];
  const road = c(kit, "surface-container");
  return (
    <Surface base={{ width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={p.label || "Map"}
        delayLongPress={600}
        onLongPress={(e: GestureResponderEvent) => proj && p.onLongPress?.(proj.back(e.nativeEvent.locationX, e.nativeEvent.locationY))}
        onPress={p.onPress}
        style={fullBox}
      >
        <View style={{ position: "absolute", left: 0, right: 0, top: "33.3%", height: 12, backgroundColor: road }} />
        <View style={{ position: "absolute", top: 0, bottom: 0, left: "25%", width: 12, backgroundColor: road }} />
        <View style={{ position: "absolute", top: 0, bottom: 0, right: "20%", width: 8, backgroundColor: road }} />
        {path.length > 1 ? (
          <Svg pointerEvents="none" style={fullBox} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <Polyline points={path.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(" ")} fill="none" stroke={c(kit, "primary")} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </Pressable>
      {proj && markers.length ? (
        markers.map((m) => {
          const at = proj.at(m);
          const on = chosen === m.id;
          const s = on ? 36 : 28;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={m.title || m.id}
              accessibilityState={{ selected: on }}
              onPress={() => {
                choose(m.id);
                p.onMarkerTap?.({ id: m.id });
              }}
              style={{ position: "absolute", left: Math.round(at.x) - 64, top: Math.round(at.y) - s - (on && m.title ? 22 : 0), width: 128, alignItems: "center", zIndex: on ? 1 : 0 }}
            >
              {on && m.title ? (
                <View style={{ maxWidth: 128, marginBottom: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface"), boxShadow: "0px 1px 3px 0px #0000004D" }}>
                  <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface") }}>{m.title}</RNText>
                </View>
              ) : null}
              <Glyph name="location_on" size={s} filled color={c(kit, on ? "primary" : "on-surface-variant")} />
            </Pressable>
          );
        })
      ) : (
        <View pointerEvents="none" style={[fullBox, { alignItems: "center", justifyContent: "center" }]}>
          <Glyph name="location_on" size={40} filled color={c(kit, "primary")} />
        </View>
      )}
      {p.label ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 8, alignItems: "center" }}>
          <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), backgroundColor: withAlpha(c(kit, "surface"), 0.8), borderRadius: corner(kit, "md"), paddingHorizontal: 8, overflow: "hidden" }}>{p.label}</RNText>
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- a grid of photos ---------- */

export type PhotoGridProps = PartBase & { count?: number; columns?: number; width?: number };

/** square cells, two points apart, each the ground where a photo goes */
export function PhotoGrid(props: PhotoGridProps) {
  const p = withDefaults<PhotoGridProps>("photo-grid", props);
  const kit = useKit();
  const fill = useFill();
  const cols = clampInt(p.columns ?? 3, 1, 6);
  const count = clampInt(p.count ?? 9, 1, 30);
  const [w, setW] = useState(Math.round(p.width ?? 380));
  const gap = 2;
  const cell = Math.max(0, Math.floor((w - gap * (cols - 1)) / cols));
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), flexDirection: "row", flexWrap: "wrap", columnGap: gap, rowGap: gap, borderRadius: corner(kit, "sm"), overflow: "hidden", ...fill }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <View style={{ position: "absolute", left: 0, right: 0, height: 0 }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} />
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: cell, height: cell, backgroundColor: c(kit, "surface-container-high"), alignItems: "center", justifyContent: "center" }}>
          <Glyph name="image" size={24} color={c(kit, "outline")} />
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
 *  it is, is `position` as given. The kit plays no file: the bar stands where `position` puts it (the canvas moves it
 *  only in a prototype's demo, which an app never runs). */
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
  const muted = c(kit, "on-surface-variant");
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), flexDirection: "row", alignItems: "center", columnGap: 12, padding: 12, borderRadius: corner(kit, "xl"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      <NoFill>
        <IconButton icon={playing ? "pause" : "play_arrow"} variant="filled" ariaLabel={playing ? "Pause" : "Play"} onPress={toggle} />
        <View style={{ flex: 1, minWidth: 0, rowGap: 4 }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{p.title}</RNText>
          {p.artist ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: muted }}>{p.artist}</RNText> : null}
          <FillWidth>
            <Progress value={(at / length) * 100} label="" />
          </FillWidth>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <RNText style={{ ...typeStyle(kit, "label-small"), color: muted, fontVariant: ["tabular-nums"] }}>{clock(at)}</RNText>
            <RNText style={{ ...typeStyle(kit, "label-small"), color: muted, fontVariant: ["tabular-nums"] }}>{clock(length)}</RNText>
          </View>
        </View>
      </NoFill>
    </Surface>
  );
}

/* ---------- a line that keeps moving past ---------- */

export type MarqueeProps = PartBase & { text?: string; seconds?: number; width?: number };

/** Its words twice in a row, moving left a whole copy every `seconds` and starting over: the same loop the canvas
 *  runs. It holds still when the system asks for less motion. */
export function Marquee(props: MarqueeProps) {
  const p = withDefaults<MarqueeProps>("marquee", props);
  const kit = useKit();
  const fill = useFill();
  const calm = useCalm();
  const [line, setLine] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const seconds = Math.max(2, p.seconds ?? 12);
  useEffect(() => {
    if (calm || line <= 0) return;
    x.setValue(0);
    const loop = Animated.loop(Animated.timing(x, { toValue: -line, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x, line, seconds, calm]);
  const words = { ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface"), paddingRight: 32 };
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), overflow: "hidden", ...fill }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <Animated.View style={{ flexDirection: "row", alignSelf: "flex-start", transform: [{ translateX: x }] }}>
        <RNText numberOfLines={1} onLayout={(e) => setLine(e.nativeEvent.layout.width)} style={words}>{p.text}</RNText>
        <RNText numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no" style={words}>{p.text}</RNText>
      </Animated.View>
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
  const soft = withAlpha(c(kit, "on-surface"), 0.7);
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 8, rowGap: 2, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      {p.title ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", columnGap: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <RNText numberOfLines={1} style={{ flexShrink: 1, ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{p.title}</RNText>
          {done > 0 ? <RNText style={{ ...typeStyle(kit, "label-medium"), color: soft }}>{`${done} / ${rows.length}`}</RNText> : null}
        </View>
      ) : null}
      {rows.map((r, i) => {
        const locked = r[3] === "locked";
        const current = i === p.selected;
        const ink = current ? c(kit, "on-secondary-container") : c(kit, "on-surface");
        const sub = current ? withAlpha(ink, 0.7) : soft;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={r[0] || `${i + 1}`}
            accessibilityState={{ disabled: locked, selected: current }}
            disabled={locked}
            onPress={() => {
              p.onPlay?.({ index: i, playing: current ? !p.playing : true });
              tapOf(p, `tab:${i}`)?.();
            }}
            style={{ flexDirection: "row", alignItems: "center", columnGap: 12, padding: 8, borderRadius: corner(kit, "lg"), backgroundColor: current ? c(kit, "secondary-container") : "transparent", opacity: locked ? 0.5 : 1 }}
          >
            <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
              {locked ? <Glyph name="lock" size={20} color={ink} /> : current ? <Glyph name={p.playing ? "pause" : "play_arrow"} size={24} color={ink} /> : r[3] === "done" ? <Glyph name="check" size={20} color={c(kit, "primary")} /> : <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{i + 1}</RNText>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: ink }}>{r[0] ?? ""}</RNText>
              {r[1] ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: sub }}>{r[1]}</RNText> : null}
            </View>
            <RNText style={{ ...typeStyle(kit, "label-medium"), color: sub, fontVariant: ["tabular-nums"] }}>{r[2] ?? ""}</RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- a QR code: byte mode, versions 1 to 10 (ISO/IEC 18004) ----------
 * The editor's encoder (parts/widgets/AppTools.tsx `qrMatrix`, checked by parts/qr.test.ts with a reader written from
 * the standard), as it is, with the words turned into UTF-8 by hand: an engine may have no TextEncoder. */

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

/** the dark modules as one path, four modules of quiet zone around them */
export const qrPath = (m: boolean[][]) => m.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join("");

export type QrCodeProps = PartBase & {
  text?: string;
  level?: "L" | "M" | "Q" | "H";
  caption?: string;
  copy?: string;
  copied?: string;
  tooLong?: string;
  size?: number;
  /** copies the words: the app's clipboard (a phone has none without a package the product adds). Said "copied" once
   *  it is done, never before */
  onCopy?: (text: string) => void | boolean | Promise<unknown>;
};

/** The symbol for its words, drawn module by module, with its caption and a button that copies them. Too much text for
 *  version 10 shows `tooLong` in its place. */
export function QrCode(props: QrCodeProps) {
  const p = withDefaults<QrCodeProps>("qr-code", props);
  const kit = useKit();
  const text = p.text ?? "";
  const matrix = useMemo(() => qrMatrix(text, p.level ?? "M"), [text, p.level]);
  const path = useMemo(() => (matrix ? qrPath(matrix) : ""), [matrix]);
  const size = Math.round(p.size ?? 200);
  const span = (matrix?.length ?? 0) + 8;
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const copy = async () => {
    if (!p.onCopy) return;
    try {
      if ((await p.onCopy(text)) === false) return;
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1500);
    } catch {
      /* the copy was refused: the button simply does not say it copied */
    }
  };
  return (
    <Surface base={{ width: size + 24, padding: 12, rowGap: 8, alignItems: "center", alignSelf: "flex-start", borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface") }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <NoFill>
        {matrix ? (
          <View accessibilityRole="image" accessibilityLabel={text}>
            <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
              <Path d={path} fill={c(kit, "on-surface")} />
            </Svg>
          </View>
        ) : (
          <View accessibilityRole="alert" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
            <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "error"), textAlign: "center" }}>{p.tooLong}</RNText>
          </View>
        )}
        {p.caption ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: withAlpha(c(kit, "on-surface"), 0.7), textAlign: "center", alignSelf: "stretch" }}>{p.caption}</RNText> : null}
        {p.copy && matrix ? <Button label={done ? p.copied || p.copy : p.copy} variant="tonal" size="xs" onPress={() => void copy()} /> : null}
      </NoFill>
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
 *  thumbnail move it); full screen opens over the app, sent as `fullscreen`, and zooms there. Zooming is the viewer's. */
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
        <View style={{ position: "absolute", left: inset, top: "50%", marginTop: -20 }}>
          <IconButton icon="chevron_left" variant="tonal" ariaLabel="Previous" onPress={() => go(-1)} />
        </View>
        <View style={{ position: "absolute", right: inset, top: "50%", marginTop: -20 }}>
          <IconButton icon="chevron_right" variant="tonal" ariaLabel="Next" onPress={() => go(1)} />
        </View>
      </>
    ) : null;
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), rowGap: 8, overflow: "hidden", borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container"), ...fill }} appearance={p} testID={p.testID}>
      <NoFill>
        <View style={{ height: Math.round(p.height ?? 260) }} accessibilityRole="image" accessibilityLabel={row.label || undefined}>
          <PictureFill src={row.image} />
          {arrows(8)}
          <View style={{ position: "absolute", top: 8, right: 8 }}>
            <IconButton icon="fullscreen" variant="tonal" ariaLabel="Full screen" onPress={() => open(true)} />
          </View>
          {many ? (
            <View style={{ position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" }}>
              <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "inverse-on-surface"), backgroundColor: c(kit, "inverse-surface"), borderRadius: 999, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2 }}>{counter}</RNText>
            </View>
          ) : null}
        </View>
        {row.label ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface"), paddingHorizontal: 12 }}>{row.label}</RNText> : null}
        {p.thumbnails && many ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ columnGap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
            {rows.map((r, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={r.label || `${i + 1}`}
                accessibilityState={{ selected: i === current }}
                onPress={() => {
                  show(i);
                  p.taps?.[`tab:${i}`]?.();
                }}
                style={{ width: 56, height: 56, borderRadius: corner(kit, "md"), borderWidth: 2, borderColor: i === current ? c(kit, "primary") : "transparent", overflow: "hidden" }}
              >
                <PictureFill src={r.image} size={20} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Modal visible={full} transparent animationType="fade" onRequestClose={() => open(false)}>
          <View testID={p.testID ? `${p.testID}-full` : undefined} style={{ flex: 1, backgroundColor: c(kit, "inverse-surface") }}>
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 4, padding: 8, paddingTop: 40 }}>
              <IconButton icon="close" ariaLabel="Close" onPress={() => open(false)} />
              <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "title-medium"), color: c(kit, "inverse-on-surface") }}>{row.label}</RNText>
              <IconButton icon="zoom_out" ariaLabel="Zoom out" disabled={zoom <= 1} onPress={() => setZoom((z) => Math.max(1, z - 0.5))} />
              <IconButton icon="zoom_in" ariaLabel="Zoom in" disabled={zoom >= 3} onPress={() => setZoom((z) => Math.min(3, z + 0.5))} />
            </View>
            <View style={{ flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: "100%", aspectRatio: 1, transform: [{ scale: zoom }] }}>
                <PictureFill src={row.image} />
              </View>
              {arrows(12)}
            </View>
            {many ? <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "inverse-on-surface"), textAlign: "center", padding: 12, paddingBottom: 32 }}>{counter}</RNText> : null}
          </View>
        </Modal>
      </NoFill>
    </Surface>
  );
}

/* ---------- a picture cropper ---------- */

export type ImageCropperProps = PartBase & {
  image?: Picture;
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
 *  start over when those change. A finger moves the frame and pulls its corner; a screen reader grows, shrinks and
 *  moves it with the frame's actions. The button sends `crop` with the frame and the turn; cutting the picture, and
 *  whether it is done (`cropped`), are the other side's. */
export function ImageCropper(props: ImageCropperProps) {
  const p = withDefaults<ImageCropperProps>("image-cropper", props);
  const kit = useKit();
  const fill = useFill();
  const width = Math.round(p.width ?? 380);
  const height = Math.round(p.height ?? 300);
  const aspect = p.aspect ?? "1:1";
  const [crop, setCrop] = useSeeded<Crop>(startCrop(p.crop, aspect, width, height));
  const [turn, setTurn] = useSeeded((((Math.round((p.turn ?? 0) / 90) * 90) % 360) + 360) % 360);
  const [area, setArea] = useState({ w: width - 16, h: height });
  /* where the finger took hold, and the frame then */
  const from = useRef({ x: 0, y: 0, crop });
  /* the responder's own props: the frame and its corner each take the touch where it lands, and keep it */
  const moved = (e: GestureResponderEvent, kind: "move" | "size") => {
    const f = from.current;
    setCrop(dragCrop(f.crop, kind, (e.nativeEvent.pageX - f.x) / Math.max(1, area.w), (e.nativeEvent.pageY - f.y) / Math.max(1, area.h), aspect, width, height));
  };
  const held = (e: GestureResponderEvent) => {
    from.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, crop };
  };
  const frameTouch = { onStartShouldSetResponder: () => true, onResponderTerminationRequest: () => false, onResponderGrant: held, onResponderMove: (e: GestureResponderEvent) => moved(e, "move") };
  const cornerTouch = { onStartShouldSetResponder: () => true, onResponderTerminationRequest: () => false, onResponderGrant: held, onResponderMove: (e: GestureResponderEvent) => moved(e, "size") };
  const onAction = (e: AccessibilityActionEvent) => {
    const step = 0.05;
    const by: Record<string, [kind: "move" | "size", dx: number, dy: number]> = { increment: ["size", step, step], decrement: ["size", -step, -step], left: ["move", -step, 0], right: ["move", step, 0], up: ["move", 0, -step], down: ["move", 0, step] };
    const d = by[e.nativeEvent.actionName];
    if (d) setCrop(dragCrop(crop, d[0], d[1], d[2], aspect, width, height));
  };
  const pct = (n: number) => `${n * 100}%` as const;
  const scrim = withAlpha(c(kit, "scrim"), 0.55);
  const edge = c(kit, "on-primary");
  return (
    <Surface base={{ width, padding: 8, rowGap: 8, overflow: "hidden", borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container"), ...fill }} appearance={p} testID={p.testID}>
      <NoFill>
        <View style={{ height, borderRadius: corner(kit, "lg"), overflow: "hidden" }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <View style={[fullBox, { transform: [{ rotate: `${turn}deg` }] }]}>
            <PictureFill src={p.image} />
          </View>
          {/* what falls outside the frame is dimmed: four panes around it */}
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: pct(crop.y), backgroundColor: scrim }} />
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: pct(crop.y + crop.h), bottom: 0, backgroundColor: scrim }} />
          <View pointerEvents="none" style={{ position: "absolute", left: 0, width: pct(crop.x), top: pct(crop.y), height: pct(crop.h), backgroundColor: scrim }} />
          <View pointerEvents="none" style={{ position: "absolute", left: pct(crop.x + crop.w), right: 0, top: pct(crop.y), height: pct(crop.h), backgroundColor: scrim }} />
          <View
            testID={p.testID ? `${p.testID}-frame` : undefined}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Crop"
            accessibilityValue={{ text: `${Math.round(crop.w * width)} × ${Math.round(crop.h * height)}` }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "left", label: "Move left" }, { name: "right", label: "Move right" }, { name: "up", label: "Move up" }, { name: "down", label: "Move down" }]}
            onAccessibilityAction={onAction}
            style={{ position: "absolute", left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h), borderWidth: 2, borderColor: edge }}
            {...frameTouch}
          >
            <View hitSlop={12} style={{ position: "absolute", right: -10, bottom: -10, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: edge, backgroundColor: c(kit, "primary") }} {...cornerTouch} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 4 }}>
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
          <RNText numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: "right", ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.cropped ? p.doneText : `${Math.round(crop.w * width)} × ${Math.round(crop.h * height)}`}</RNText>
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
