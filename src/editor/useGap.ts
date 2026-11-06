/* The hole a run holds for a part being carried out of it or into it. */

import { useCallback, useEffect, useRef, useState } from "react";
import { SETTLE_MS } from "@/lib/tokens";

/* The hole a run holds for a part: where it is, how big, and whether it is still wanted. It
 * outlives the drag by the moment it takes to close, and is the same element throughout, so
 * the closing is a transition rather than a part vanishing. */
export type Gap = { gid: string; index: number; w: number; h: number; open: boolean; /** the hole the part was pulled out of, which stays its full size while the part is in reach */ from: boolean };

export function useGap() {
  const [gapOut, setGapOut] = useState<Gap | null>(null);
  const gapRef = useRef<Gap | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gapTimer.current) clearTimeout(gapTimer.current); }, []);
  const setGap = useCallback((next: Gap | null) => {
    const cur = gapRef.current;
    if (cur === next) return;
    if (cur && next && cur.gid === next.gid && cur.index === next.index && cur.w === next.w && cur.h === next.h && cur.open === next.open && cur.from === next.from) return;
    gapRef.current = next;
    setGapOut(next);
  }, []);
  /** the group keeps the hole a part came out of open, and closes it once the part has moved on */
  const holdGap = useCallback(
    (gid: string, index: number, w: number, h: number, from = false) => {
      if (gapTimer.current) {
        clearTimeout(gapTimer.current);
        gapTimer.current = null;
      }
      setGap({ gid, index, w, h, open: true, from });
    },
    [setGap],
  );
  const closeGap = useCallback(() => {
    const cur = gapRef.current;
    if (!cur || !cur.open) return;
    setGap({ ...cur, open: false });
    if (gapTimer.current) clearTimeout(gapTimer.current);
    gapTimer.current = setTimeout(() => setGap(null), SETTLE_MS + 40);
  }, [setGap]);
  return { gapOut, holdGap, closeGap };
}
