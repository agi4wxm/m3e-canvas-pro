
import { useEffect, useRef } from "react";
import { LoadingAnimator, morphedShape } from "@/lib/shapes";

function useFrame(cb: (ts: number) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      ref.current(ts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/* ---------- loading indicator (shape morph) ---------- */

export function LoadingIndicator({ size, color }: { size: number; color: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  const anim = useRef<LoadingAnimator | null>(null);
  if (!anim.current) anim.current = new LoadingAnimator();

  const scale = (size * 0.79) / 2;
  const c = size / 2;

  useFrame((ts) => {
    const a = anim.current!;
    a.update(ts);
    const pts = morphedShape(a.morph);
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      d += (i === 0 ? "M" : "L") + (pts[i][0] * scale).toFixed(2) + " " + (pts[i][1] * scale).toFixed(2);
    }
    const el = pathRef.current;
    if (el) {
      el.setAttribute("d", d + "Z");
      el.setAttribute("transform", `translate(${c} ${c}) rotate(${a.rotation.toFixed(2)})`);
    }
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <path ref={pathRef} fill={color} />
    </svg>
  );
}
