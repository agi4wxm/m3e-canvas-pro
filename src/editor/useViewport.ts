/* The canvas's camera: where it looks and how near (pan and zoom), the wheel and two-finger pinch, fitting what is on
 * the canvas into view, and gliding to a screen. Nothing here changes the document. */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { BEZEL, clamp, FRAME_LABEL_H, frameLengthOf, frameRect, frameSizeOf, layoutOf, PHONE_H, PHONE_W, SETTLE_MS, type Frame, type FrameMode, type Group } from "@/lib/tokens";
import { GLIDE_PAD, GLIDE_TOP, MAX_Z, MIN_Z, type View } from "./model";

type Live<T> = MutableRefObject<T>;

export type Viewport = ReturnType<typeof useViewport>;

/** what the camera reads of the editor at the moment it moves */
export type ViewportInputs = {
  groupsRef: Live<Group[]>;
  framesRef: Live<Frame[]>;
  widthsRef: Live<Record<string, number>>;
  frameRef: Live<FrameMode>;
  mobileRef: Live<boolean>;
  /** two fingers came down: whatever one finger started is given up */
  onPinch: () => void;
};

export function useViewport({ groupsRef, framesRef, widthsRef, frameRef, mobileRef, onPinch }: ViewportInputs) {
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  /** Keep the server-rendered world hidden until its first fit has completed. */
  const [viewReady, setViewReady] = useState(false);
  /** the canvas transform eases while the camera glides to or from a screen */
  const [cameraEasing, setCameraEasing] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const canvasRef = useRef<HTMLDivElement>(null);
  /** active touch points, for pinch zoom */
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ d0: number; z0: number; mx: number; my: number; vx: number; vy: number } | null>(null);

  const canvasRect = () => canvasRef.current?.getBoundingClientRect();
  const inCanvas = (clientX: number, clientY: number) => {
    const r = canvasRect();
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    return {
      x: (clientX - (r?.left ?? 0) - v.x) / v.z,
      y: (clientY - (r?.top ?? 0) - v.y) / v.z,
    };
  };

  const setZoomAt = useCallback((nz: number, cx?: number, cy?: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const z = clamp(nz, MIN_Z, MAX_Z);
    const px = cx === undefined ? (r?.width ?? 0) / 2 : cx - (r?.left ?? 0);
    const py = cy === undefined ? (r?.height ?? 0) / 2 : cy - (r?.top ?? 0);
    setView({
      x: px - ((px - v.x) * z) / v.z,
      y: py - ((py - v.y) * z) / v.z,
      z,
    });
  }, []);

  const fit = useCallback(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const gs = groupsRef.current;
    let x0 = -BEZEL;
    let y0 = -BEZEL - FRAME_LABEL_H;
    let x1 = PHONE_W + BEZEL;
    let y1 = PHONE_H + BEZEL;
    const fs = framesRef.current;
    if (frameRef.current === "phone" && fs.length > 0) {
      x0 = Math.min(...fs.map((f) => f.x)) - BEZEL;
      y0 = Math.min(...fs.map((f) => f.y)) - BEZEL - FRAME_LABEL_H;
      x1 = Math.max(...fs.map((f) => frameRect(f).r)) + BEZEL;
      y1 = Math.max(...fs.map((f) => frameRect(f).b)) + BEZEL;
    }
    if (frameRef.current === "blank") {
      if (gs.length === 0) {
        setView({ x: 48, y: 48, z: 1 });
        return;
      }
      x0 = Infinity;
      y0 = Infinity;
      x1 = -Infinity;
      y1 = -Infinity;
      for (const g of gs) {
        for (const pl of layoutOf(g, widthsRef.current)) {
          x0 = Math.min(x0, pl.x);
          y0 = Math.min(y0, pl.y);
          x1 = Math.max(x1, pl.x + pl.w);
          y1 = Math.max(y1, pl.y + pl.h);
        }
      }
    }
    const mobile = mobileRef.current;
    const pad = mobile ? 14 : 40;
    const top = mobile ? 96 : 84; // keep the floating toolbar clear of the frame
    const bottom = mobile ? 96 : pad;
    if (mobile) {
      // a phone zooms to the width of the first screen and starts at its top; the rest are a pan away.
      // Fitting them all would leave each a stamp, with the first cut off at the edge
      const first = frameRef.current === "phone" ? fs[0] : undefined;
      if (first) {
        x0 = first.x - BEZEL;
        x1 = frameRect(first).r + BEZEL;
      }
      const z = clamp((r.width - pad * 2) / (x1 - x0), MIN_Z, MAX_Z);
      setView({ x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: top - y0 * z, z });
      return;
    }
    const z = clamp(Math.min((r.width - pad * 2) / (x1 - x0), (r.height - top - bottom) / (y1 - y0), 1), MIN_Z, MAX_Z);
    setView({
      x: (r.width - (x1 - x0) * z) / 2 - x0 * z,
      y: top + (r.height - top - bottom - (y1 - y0) * z) / 2 - y0 * z,
      z,
    });
    // the camera reads the document through its refs, at the moment it fits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Brings a box of the canvas into view as large as it fits (Shift+2, the selection), gliding there. */
  const fitBox = (b: { l: number; t: number; r: number; b: number }) => {
    const r = canvasRect();
    if (!r || b.r <= b.l || b.b <= b.t) return;
    const pad = 64;
    const z = clamp(Math.min((r.width - pad * 2) / (b.r - b.l), (r.height - GLIDE_TOP - pad) / (b.b - b.t)), MIN_Z, MAX_Z);
    glide({ x: (r.width - (b.r - b.l) * z) / 2 - b.l * z, y: GLIDE_TOP + (r.height - GLIDE_TOP - pad - (b.b - b.t) * z) / 2 - b.t * z, z });
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;

  /* touch: two fingers pinch-zoom and pan, cancelling whatever one finger started */
  const onTouchCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchesRef.current.size === 2) {
      const [a, b] = [...touchesRef.current.values()];
      const v = viewRef.current;
      pinchRef.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: v.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y };
      onPinch();
    }
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !touchesRef.current.has(e.pointerId)) return;
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (!pinch || touchesRef.current.size < 2) return;
      const [a, b] = [...touchesRef.current.values()];
      const r = canvasRef.current?.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const z = clamp((pinch.z0 * d) / Math.max(1, pinch.d0), MIN_Z, MAX_Z);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = pinch.mx - (r?.left ?? 0);
      const py = pinch.my - (r?.top ?? 0);
      setView({
        x: px - ((px - pinch.vx) * z) / pinch.z0 + (mx - pinch.mx),
        y: py - ((py - pinch.vy) * z) / pinch.z0 + (my - pinch.my),
        z,
      });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touchesRef.current.delete(e.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  /* wheel: pan, or zoom with ctrl / pinch */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setZoomAt(viewRef.current.z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoomAt]);

  /** the camera glides for a moment: a screen is brought to the center before the
   *  preview opens over it, and the view returns once the preview closes */
  const glide = (v: View) => {
    setCameraEasing(true);
    setView(v);
    window.setTimeout(() => setCameraEasing(false), SETTLE_MS + 40);
  };
  /** Brings one screen to the middle of the canvas at the zoom it fits in, gliding there. A
   *  screen already wholly in view is left where it is, so picking it does not move the camera. */
  const glideToFrame = (f: Frame) => {
    const r = canvasRect();
    if (!r) return;
    const { w } = frameSizeOf(f);
    const h = frameLengthOf(f);
    const boxW = w + BEZEL * 2;
    const boxH = h + BEZEL * 2 + FRAME_LABEL_H;
    const v = viewRef.current;
    const left = (f.x - BEZEL) * v.z + v.x;
    const top = (f.y - BEZEL - FRAME_LABEL_H) * v.z + v.y;
    if (left >= GLIDE_PAD && top >= GLIDE_TOP && left + boxW * v.z <= r.width - GLIDE_PAD && top + boxH * v.z <= r.height - GLIDE_PAD) return;
    const z = clamp(Math.min((r.width - GLIDE_PAD * 2) / boxW, (r.height - GLIDE_TOP - GLIDE_PAD) / boxH, v.z), MIN_Z, MAX_Z);
    glide({ x: (r.width - boxW * z) / 2 - (f.x - BEZEL) * z, y: GLIDE_TOP + (r.height - GLIDE_TOP - GLIDE_PAD - boxH * z) / 2 - (f.y - BEZEL - FRAME_LABEL_H) * z, z });
  };

  return { view, setView, viewRef, viewReady, setViewReady, cameraEasing, canvasRef, canvasRect, inCanvas, toWorld, setZoomAt, fit, fitRef, fitBox, onTouchCapture, glide, glideToFrame };
}
