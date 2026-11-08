import { useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { useHost, type HostProps } from "./host";

/* The movement pad; its geometry comes from 17722797729/m3e-canvas game-ui (MIT). The component holds
 * both the drag and the drawing, so the editor needs no branch for it. The canvas draws parts inert,
 * so a press there still selects the part.
 *
 * An input of a direction (docs/组件规范.md "受控值和草稿"): its value is `value`, x and y from -1 to 1 ("0.71,-0.71";
 * "0,0" is the middle, "0,-1" straight up), handed out while a finger moves it and once more when it lets go, which
 * also sends `release` with where it was. Where the knob is under the finger is the pad's own; at rest it shows
 * `value`, or, with none given, the direction `angle` draws it in (an older pad's way: 0 there is the middle). */

/** how far the knob travels from the middle, as a share of the pad's side */
const TRAVEL = 0.32;

type Vec = { x: number; y: number };

/** a direction in degrees, 0 at the top and turning clockwise, at full travel */
const fromAngle = (angle: number): Vec => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
};

const angleOf = ({ x, y }: Vec) => {
  const deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
  return Math.round(((deg % 360) + 360) % 360);
};

const clamp = (n: number) => Math.min(1, Math.max(-1, n));
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** "x,y" as a direction; undefined for anything else */
const vecOf = (value: string): Vec | undefined => {
  const [x, y, more] = value.split(",").map((s) => Number(s.trim()));
  return more === undefined && Number.isFinite(x) && Number.isFinite(y) && value.includes(",") ? { x: clamp(x), y: clamp(y) } : undefined;
};
const wordsOf = (v: Vec) => `${round2(v.x)},${round2(v.y)}`;

export function Joystick({ size = 132, angle = 0, autoCenter = true, value = "", demo, onValueChange, onEvent, wired, className, style }: { size?: number; angle?: number; autoCenter?: boolean; value?: string } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const ref = useRef<HTMLDivElement>(null);
  /* where the finger holds the knob, while it does: the pad's own, however fast the value comes back */
  const [held, setHeld] = useState<Vec | null>(null);
  /* where it was let go, while nothing says otherwise and it stays put */
  const [left, setLeft] = useState<{ at: Vec; given: string } | null>(null);
  const given = vecOf(value);
  const resting = left && left.given === value && !host.controlled ? left.at : (given ?? (angle > 0 ? fromAngle(angle) : { x: 0, y: 0 }));
  const shown = held ?? resting;
  const out = shown.x !== 0 || shown.y !== 0;
  const r = Math.max(8, Math.round(size * TRAVEL));
  const knob = { dx: Math.round(shown.x * r), dy: Math.round(shown.y * r) };
  const side = Math.max(24, Math.round(size * 0.34));

  const move = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const travel = Math.min(box.width, box.height) * TRAVEL;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const far = Math.hypot(dx, dy);
    /* the middle is not a direction: a finger there is worth nothing rather than a random angle */
    const at: Vec = far < travel * 0.22 ? { x: 0, y: 0 } : { x: round2(clamp(dx / Math.max(far, travel))), y: round2(clamp(dy / Math.max(far, travel))) };
    setHeld(at);
    host.input(wordsOf(at));
  };
  const release = () => {
    if (!held) return;
    const at = autoCenter ? { x: 0, y: 0 } : held;
    host.emit("release", { x: held.x, y: held.y });
    setHeld(null);
    setLeft({ at, given: value });
    host.input(wordsOf(at));
  };

  return (
    <div
      ref={ref}
      data-slot="joystick"
      data-angle={out ? angleOf(shown) : 0}
      data-value={wordsOf(shown)}
      role="slider"
      aria-label="Joystick"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={out ? angleOf(shown) : 0}
      aria-valuetext={wordsOf(shown)}
      tabIndex={0}
      className={cn("bg-surface-container-high relative rounded-full", className)}
      style={{ width: size, height: size, touchAction: "none", ...style }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => held && move(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span data-slot="joystick-dot" className="bg-outline-variant absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <span
        data-slot="joystick-handle"
        data-joystick-knob=""
        className={`absolute rounded-full shadow-elevation-1 ${out || held ? "bg-primary" : "bg-primary-container"}`}
        style={{ width: side, height: side, left: `calc(50% + ${knob.dx}px)`, top: `calc(50% + ${knob.dy}px)`, marginLeft: -side / 2, marginTop: -side / 2 }}
      />
    </div>
  );
}
