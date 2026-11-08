import { useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";

/* The movement pad; its geometry comes from 17722797729/m3e-canvas game-ui (MIT). The component holds
 * both the drag and the drawing, so the editor needs no branch for it. The canvas draws parts inert,
 * so a press there still selects the part. */

/** how far the knob travels from the middle, as a share of the pad's side */
const TRAVEL = 0.32;

const knobAt = (angle: number, size: number) => {
  const r = Math.max(8, Math.round(size * TRAVEL));
  const rad = ((angle - 90) * Math.PI) / 180;
  return { dx: Math.round(Math.cos(rad) * r), dy: Math.round(Math.sin(rad) * r) };
};

const angleOf = (dx: number, dy: number) => {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return Math.round(((deg % 360) + 360) % 360);
};

/** the way each arrow pushes it, as an angle; Escape lets it go back to the middle */
const PUSH: Record<string, number> = { ArrowUp: 360, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270, Escape: 0 };

export function Joystick({ size = 132, angle = 0, autoCenter = true, className, style }: { size?: number; angle?: number; autoCenter?: boolean } & Look) {
  const ref = useRef<HTMLDivElement>(null);
  /* null: nobody has moved it, so it shows the angle it was given */
  const [held, setHeld] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const shown = held ?? angle;
  const out = shown > 0 || dragging;
  const knob = out ? knobAt(shown, size) : { dx: 0, dy: 0 };
  const side = Math.max(24, Math.round(size * 0.34));

  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    /* the middle is not a direction: a finger there is worth nothing rather than a random angle */
    setHeld(Math.hypot(dx, dy) < Math.min(r.width, r.height) * TRAVEL * 0.22 ? 0 : angleOf(dx, dy));
  };

  return (
    <div
      ref={ref}
      data-slot="joystick"
      data-angle={shown}
      role="slider"
      aria-label="Joystick"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={shown}
      tabIndex={0}
      className={cn("bg-surface-container-high relative rounded-full", className)}
      style={{ width: size, height: size, touchAction: "none", ...style }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        move(e);
      }}
      onPointerMove={(e) => dragging && move(e)}
      onPointerUp={() => {
        setDragging(false);
        if (autoCenter) setHeld(0);
      }}
      onPointerCancel={() => {
        setDragging(false);
        if (autoCenter) setHeld(0);
      }}
      /* the arrows push it that way while held (up is 360, not 0, which is the middle); Escape lets it go */
      onKeyDown={(e) => {
        const to = PUSH[e.key];
        if (to === undefined) return;
        e.preventDefault();
        setHeld(to);
      }}
      onKeyUp={(e) => {
        if (autoCenter && e.key.startsWith("Arrow")) setHeld(0);
      }}
    >
      <span data-slot="joystick-dot" className="bg-outline-variant absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <span
        data-slot="joystick-handle"
        data-joystick-knob=""
        className={`absolute rounded-full shadow-elevation-1 ${out ? "bg-primary" : "bg-primary-container"}`}
        style={{ width: side, height: side, left: `calc(50% + ${knob.dx}px)`, top: `calc(50% + ${knob.dy}px)`, marginLeft: -side / 2, marginTop: -side / 2 }}
      />
    </div>
  );
}
