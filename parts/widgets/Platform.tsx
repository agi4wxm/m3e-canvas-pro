import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { useValue } from "./seed";

/* The capability views (lib/capabilities, docs/平台能力.md): a map and a camera, drawn here as stand-ins. No map is
 * rendered and no camera is opened: an exported app hands the same props to a slot the product writes once
 * (src/custom/slots/<Name>.tsx), which draws the real one. What the stand-in shows is what the props say (the markers
 * placed by their coordinates, the marker chosen, the camera refused); what the visitor does to it goes out as the
 * capability's events. */

export type MapMarker = { id: string; title?: string; lat: number; lng: number };

/** Where markers stand on the stand-in: their box of coordinates (and the centre's) laid over the view, padded, the
 *  north up. A stand-in draws no real map, so the spread is the markers' own. */
function projection(points: { lat: number; lng: number }[], w: number, h: number) {
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

/** A map's stand-in: a still ground, the markers where their coordinates put them, the route through them. Tapping a
 *  marker chooses it (`selected`, the view's input) and sends `markerTap`; a long press sends `longPress` with where. */
export function MapView({ label = "", center, zoom = 14, markers = [], selected = "", route = [], width = 380, height = 240, demo, onValueChange, onEvent, className, style }: { label?: string; center?: { lat: number; lng: number }; zoom?: number; markers?: MapMarker[]; selected?: string; route?: { lat: number; lng: number }[]; width?: number; height?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  /* the chosen marker is the view's input: the prop while someone takes it, else a draft that starts over with the prop */
  const [shown, choose] = useValue(selected, host);
  const pressed = useRef<{ t: ReturnType<typeof setTimeout> } | null>(null);
  const points = [...markers, ...route, ...(center ? [center] : [])];
  const proj = points.length ? projection(points, width, height) : null;
  const press = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!proj || (e.target as HTMLElement).closest("[data-marker]")) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * width;
    const y = ((e.clientY - box.top) / Math.max(1, box.height)) * height;
    pressed.current = { t: setTimeout(() => host.emit("longPress", proj.back(x, y)), 600) };
  };
  const release = () => {
    if (pressed.current) clearTimeout(pressed.current.t);
    pressed.current = null;
  };
  const path = proj && route.length > 1 ? route.map((m) => proj.at(m)) : [];
  return (
    <div data-slot="map-placeholder" data-zoom={zoom} data-selected={shown || undefined} className={cn("bg-surface-container-high relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl", className)} style={{ width, height, ...style }} onPointerDown={press} onPointerUp={release} onPointerLeave={release}>
      <span className="bg-surface-container absolute inset-x-0 top-1/3 h-3" />
      <span className="bg-surface-container absolute inset-y-0 left-1/4 w-3" />
      <span className="bg-surface-container absolute inset-y-0 right-1/5 w-2" />
      {path.length > 1 && (
        <svg className="text-primary pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
          <polyline points={path.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {proj && markers.length ? (
        markers.map((m) => {
          const at = proj.at(m);
          const on = shown === m.id;
          return (
            <Tap
              key={m.id}
              data-marker={m.id}
              aria-label={m.title || m.id}
              aria-pressed={on}
              className={cn("absolute flex -translate-x-1/2 -translate-y-full flex-col items-center", on ? "text-primary z-[1]" : "text-on-surface-variant")}
              style={{ left: Math.round(at.x), top: Math.round(at.y) }}
              onClick={(e) => {
                e.stopPropagation();
                choose(m.id);
                host.emit("markerTap", { id: m.id });
              }}
            >
              {on && m.title && <span className="bg-surface text-label-small text-on-surface mb-0.5 max-w-32 truncate rounded-md px-1.5 py-0.5 shadow">{m.title}</span>}
              <WidgetIcon name="location_on" className={on ? "size-9" : "size-7"} />
            </Tap>
          );
        })
      ) : (
        <WidgetIcon name="location_on" className="text-primary relative size-10" />
      )}
      {label && <span className="text-label-medium text-on-surface bg-surface/80 relative mt-auto mb-2 rounded-md px-2">{label}</span>}
    </div>
  );
}

/** a picture to stand for what a prototype's camera took */
const SHOT = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjOTk5Ii8+PC9zdmc+";

/** A camera's stand-in: the frame, and the shutter (or the scanning frame). What the real camera does is the slot's;
 *  here only a prototype hands out a stand-in picture or the sample text of a scan. `state` draws the designs for a
 *  camera the visitor refused, or one the device does not have. */
export function CameraView({ facing = "back", mode = "photo", state = "live", denied = "", width = 360, height = 480, demo, onValueChange, onEvent, className, style }: { facing?: string; mode?: string; state?: string; denied?: string; width?: number; height?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const blocked = state === "denied" || state === "unavailable";
  return (
    <div data-slot="camera-placeholder" data-facing={facing} data-mode={mode} data-state={state} className={cn("bg-inverse-surface text-inverse-on-surface relative flex items-center justify-center overflow-hidden rounded-xl", className)} style={{ width, height, ...style }}>
      {blocked ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <WidgetIcon name={state === "denied" ? "no_photography" : "videocam_off"} className="size-12" />
          {denied && <span className="text-body-medium">{denied}</span>}
        </div>
      ) : mode === "scan" ? (
        <span className="border-inverse-on-surface size-48 rounded-2xl border-4 border-dashed" />
      ) : (
        <WidgetIcon name="photo_camera" className="size-12" />
      )}
      {!blocked && (
        <Tap
          aria-label={mode === "scan" ? "Scan" : mode === "video" ? "Record" : "Take a picture"}
          data-tap="shutter"
          className="border-inverse-on-surface absolute bottom-4 left-1/2 size-14 -translate-x-1/2 rounded-full border-4"
          onClick={() => {
            if (!host.demo) return;
            if (mode === "scan") host.emit("scanned", { text: "https://example.com/item/42", format: "qr" });
            else host.emit("captured", { file: { name: mode === "video" ? "clip.svg" : "photo.svg", type: "image/svg+xml", size: 200, url: SHOT } });
          }}
        />
      )}
    </div>
  );
}
