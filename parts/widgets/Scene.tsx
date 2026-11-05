import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* A whole screen's picture, with the places in it that answer a tap. Everything the player reads or
 * presses is a real part standing on it: the picture is only ever the world behind the interface. */

export type Hotspot = { label: string; x: number; y: number; w: number; h: number };

const PICTURE = /^(https?:|data:image\/)/i;
const DARK = "var(--md-sys-color-scrim)";
const shade = (percent: number) => `color-mix(in srgb, ${DARK} ${percent}%, transparent)`;
const SCRIMS: Record<string, string | undefined> = {
  none: undefined,
  top: `linear-gradient(${shade(65)}, transparent 40%)`,
  bottom: `linear-gradient(transparent 55%, ${shade(70)})`,
  both: `linear-gradient(${shade(60)}, transparent 35%, transparent 60%, ${shade(70)})`,
  full: `linear-gradient(${shade(40)}, ${shade(40)})`,
};

export function Scene({ image = "", icon = "landscape", scrim = "none", hotspots = [], width = 412, height = 892, className, style }: { image?: string; icon?: string; scrim?: string; hotspots?: Hotspot[]; width?: number; height?: number } & Look) {
  const painted = PICTURE.test(image);
  return (
    <div data-slot="scene" data-painted={painted || undefined} className={cn("relative overflow-hidden", className)} style={{ width, height, ...style }}>
      {painted ? (
        <img src={image} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-container to-tertiary-container text-on-primary-container">
          <WidgetIcon name={icon} className="size-16 opacity-60" />
        </div>
      )}
      {SCRIMS[scrim] && <div data-scene-scrim className="pointer-events-none absolute inset-0" style={{ background: SCRIMS[scrim] }} />}
      {hotspots.map((spot, i) => (
        <Tap key={i} aria-label={spot.label || `${i + 1}`} data-hotspot data-tap={`tab:${i}`} className="absolute rounded-md" style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }} />
      ))}
    </div>
  );
}
