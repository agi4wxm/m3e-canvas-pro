import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** an animation holds its first frame while it is being drawn on the canvas, or for someone who asked for less motion */
function Still({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const picture = new Image();
    picture.onload = () => {
      const c = canvas.current;
      if (!c) return;
      c.width = picture.naturalWidth;
      c.height = picture.naturalHeight;
      c.getContext("2d")?.drawImage(picture, 0, 0);
    };
    picture.src = src;
  }, [src]);
  return <canvas ref={canvas} data-scene-still aria-hidden className="absolute inset-0 size-full object-cover" />;
}

const isAnimation = (src: string) => /^data:image\/gif|\.gif(\?|$)/i.test(src);

export function Scene({ image = "", icon = "landscape", scrim = "none", hotspots = [], width = 412, height = 892, className, style }: { image?: string; icon?: string; scrim?: string; hotspots?: Hotspot[]; width?: number; height?: number } & Look) {
  const painted = PICTURE.test(image);
  const root = useRef<HTMLDivElement>(null);
  /* it holds on the canvas for good; for someone who asked for less motion, until they ask for this one */
  const [hold, setHold] = useState<"no" | "drawing" | "calm">("no");
  useLayoutEffect(() => {
    setHold(root.current?.closest("[inert]") ? "drawing" : typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "calm" : "no");
  }, []);
  return (
    <div ref={root} data-slot="scene" data-painted={painted || undefined} className={cn("relative overflow-hidden", className)} style={{ width, height, ...style }}>
      {painted ? (
        hold !== "no" && isAnimation(image) ? <Still src={image} /> : <img src={image} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-container to-tertiary-container text-on-primary-container">
          <WidgetIcon name={icon} className="size-16 opacity-60" />
        </div>
      )}
      {SCRIMS[scrim] && <div data-scene-scrim className="pointer-events-none absolute inset-0" style={{ background: SCRIMS[scrim] }} />}
      {hold === "calm" && isAnimation(image) && (
        <Tap aria-label="Play animation" data-scene-play data-tap="self" className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-inverse-surface text-inverse-on-surface" onClick={() => setHold("no")}>
          <WidgetIcon name="play_arrow" className="size-6" />
        </Tap>
      )}
      {hotspots.map((spot, i) => (
        <Tap key={i} aria-label={spot.label || `${i + 1}`} data-hotspot data-tap={`tab:${i}`} className="absolute rounded-md" style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }} />
      ))}
    </div>
  );
}
