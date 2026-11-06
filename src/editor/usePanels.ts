/* The editor's own layout: the tool, the two side panels (open or not, their widths, their tabs), the favourites, and
 * whether every arrow is shown. A panel's edge dragged makes it wider or narrower. */

import { useEffect, useState } from "react";
import { clamp } from "@/lib/tokens";
import type { Mode } from "@/components/Toolbar";
import { RAIL_W, type LeftTab } from "./model";

export function usePanels() {
  const [mode, setMode] = useState<Mode>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(RAIL_W + 268);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  /** pointer over the collapsed rail: the logo becomes the open button */
  const [railHover, setRailHover] = useState(false);
  /** the screen whose layers are listed when nothing on a screen is selected */
  const [layersFrameId, setLayersFrameId] = useState<string | null>(null);
  const [rightW, setRightW] = useState(320);
  const [rightTab, setRightTab] = useState<"edit" | "prompt">("edit");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  /* ---------- panel resize ---------- */
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      if (resizing === "left") setLeftW(clamp(e.clientX, RAIL_W + 244, 480));
      else setRightW(clamp(window.innerWidth - e.clientX, 280, 480));
    };
    const up = () => setResizing(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizing]);
  return { mode, setMode, spaceHeld, setSpaceHeld, leftOpen, setLeftOpen, rightOpen, setRightOpen, leftW, setLeftW, leftTab, setLeftTab, railHover, setRailHover, layersFrameId, setLayersFrameId, rightW, setRightW, rightTab, setRightTab, favorites, setFavorites, showAllLinks, setShowAllLinks, resizing, setResizing };
}
