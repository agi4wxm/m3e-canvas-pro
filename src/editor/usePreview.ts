/* The preview of the design, played from one screen: the camera glides to where the preview will show that screen,
 * the preview opens once it is there, and on closing the camera glides back to the view it left. */

import { useEffect, useRef, useState, type RefObject } from "react";
import { BEZEL, clamp, Frame, FrameMode, frameSizeOf, SETTLE_MS } from "@/lib/tokens";
import { MAX_Z, MIN_Z, type View } from "./model";

export type PreviewInputs = {
  frame: FrameMode;
  selectedFrameId: string | null;
  framesRef: RefObject<Frame[]>;
  viewRef: RefObject<View>;
  canvasRect: () => DOMRect | undefined;
  glide: (to: View) => void;
  /** the canvas put in another mode: the preview plays screens */
  changeFrame: (mode: FrameMode) => void;
};

export function usePreview({ frame, selectedFrameId, framesRef, viewRef, canvasRect, glide, changeFrame }: PreviewInputs) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewIdRef = useRef(previewId);
  previewIdRef.current = previewId;
  /** the view before the preview opened, restored when it closes */
  const viewBeforePreview = useRef<View | null>(null);
  /** the opening scheduled after the glide, while it is still pending */
  const previewTimer = useRef<number | null>(null);
  /** the camera's return scheduled after a close, with the view it is heading back to */
  const returnTimer = useRef<{ id: number; view: View } | null>(null);
  const cancelReturn = () => {
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
    returnTimer.current = null;
  };
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
  }, []);
  const openPreview = (startId?: string | null) => {
    if (frame !== "phone") {
      changeFrame("phone");
    }
    queueMicrotask(() => {
      const id = startId ?? selectedFrameId ?? framesRef.current[0]?.id ?? null;
      const f = framesRef.current.find((x) => x.id === id);
      const r = canvasRect();
      if (f && r) {
        /* the preview's own fit and center, in window coordinates: its stage is sized for the
         * largest screen and sits left of the control column, so the screen lands where the
         * preview will show it */
        const { w, h } = frameSizeOf(f);
        const wide = window.innerWidth >= 720;
        const maxW = Math.max(...framesRef.current.map((x) => frameSizeOf(x).w)) + BEZEL * 2;
        const maxH = Math.max(...framesRef.current.map((x) => frameSizeOf(x).h)) + BEZEL * 2;
        const z = clamp(Math.min(1.4, (window.innerHeight - 32) / maxH, (window.innerWidth - (wide ? 236 : 16)) / maxW), MIN_Z, MAX_Z);
        const cx = (window.innerWidth - (wide ? 220 : 0)) / 2 - r.left;
        const cy = window.innerHeight / 2 - (wide ? 0 : 28) - r.top;
        /* reopening while the camera is still returning keeps the view it was returning
         * to; reopening during the opening glide keeps the view already captured */
        if (returnTimer.current !== null) {
          viewBeforePreview.current = returnTimer.current.view;
          cancelReturn();
        } else if (previewTimer.current === null) {
          viewBeforePreview.current = viewRef.current;
        }
        glide({ x: cx - (f.x + w / 2) * z, y: cy - (f.y + h / 2) * z, z });
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null;
          /* the screen may have gone while the camera moved: an undo can remove it */
          if (framesRef.current.some((x) => x.id === id)) setPreviewId(id);
          else abandonPreview();
        }, SETTLE_MS);
      } else {
        setPreviewId(id);
      }
    });
  };
  /** Gives up an opening that has not happened yet and brings the camera straight back. */
  const abandonPreview = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    cancelReturn();
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    if (back) glide(back);
  };
  const closePreview = () => {
    setPreviewId(null);
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    cancelReturn();
    if (back) returnTimer.current = { id: window.setTimeout(() => { returnTimer.current = null; glide(back); }, 220), view: back };
  };
  /** A whole document arrived: the preview over the one it replaced closes. It can arrive during the opening glide,
   *  before previewId is set: the screen the glide was heading for belongs to the replaced document, so the pending
   *  opening is dropped and the camera returns. */
  const leavePreview = () => {
    if (previewTimer.current !== null) abandonPreview();
    else {
      /* a return still on its way would drag the camera off the new document's fit */
      cancelReturn();
      if (previewIdRef.current !== null) {
        setPreviewId(null);
        viewBeforePreview.current = null;
      }
    }
  };
  return { previewId, openPreview, closePreview, leavePreview };
}
