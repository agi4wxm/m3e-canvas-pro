//! Copied as it is (lib/export/copy.ts) into apps/web/src/generated/DataScroll.tsx of every product with a web app (lib/export/targets/web.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react"

/** how far a pull must go to load again, in px */
const PULL = 64

/** The body of a screen that loads data: it scrolls under what stays put; a pull down from its top (a finger, the mouse
 *  dragged, or the wheel) loads again what loads on a pull, a spinner showing while it does; coming near its end (or a
 *  body too short to scroll) loads the next page of what pages on scroll. */
export function DataScroll({ onRefresh, refreshing = false, onEnd, onScroll, children, ...aria }: { onRefresh?: () => void; refreshing?: boolean; onEnd?: () => void; onScroll?: (event: UIEvent<HTMLDivElement>) => void; children: ReactNode; "aria-label"?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const pull = useRef<number | null>(null)
  const wheel = useRef(0)
  const [drag, setDrag] = useState(0)
  /* a body that does not fill the screen pages on by itself */
  useEffect(() => {
    const el = box.current
    if (el && onEnd && el.scrollHeight - el.clientHeight < 160) onEnd()
  })
  const atTop = () => (box.current?.scrollTop ?? 0) <= 0
  return (
    <div
      ref={box}
      role="region"
      tabIndex={0}
      {...aria}
      data-scroll-body
      data-refreshing={refreshing || undefined}
      className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
      onScroll={(event) => {
        onScroll?.(event)
        const el = event.currentTarget
        if (onEnd && el.scrollHeight - el.scrollTop - el.clientHeight < 160) onEnd()
      }}
      onPointerDown={onRefresh ? (event) => (pull.current = atTop() ? event.clientY : null) : undefined}
      onPointerMove={onRefresh ? (event) => pull.current !== null && setDrag(Math.max(0, Math.min(PULL * 1.5, event.clientY - pull.current))) : undefined}
      onPointerUp={
        onRefresh
          ? () => {
              if (drag >= PULL) onRefresh()
              pull.current = null
              setDrag(0)
            }
          : undefined
      }
      onPointerCancel={onRefresh ? () => ((pull.current = null), setDrag(0)) : undefined}
      onWheel={
        onRefresh
          ? (event) => {
              if (!atTop() || event.deltaY >= 0) return
              wheel.current += -event.deltaY
              if (wheel.current > 240) {
                wheel.current = 0
                onRefresh()
              }
            }
          : undefined
      }
    >
      {(refreshing || drag > 0) && (
        <div aria-hidden className="pointer-events-none sticky top-0 z-20 flex h-0 justify-center">
          <div className="bg-surface-container-high shadow-elevation-2 mt-3 grid size-9 place-items-center rounded-full" style={{ transform: `translateY(${refreshing ? 0 : drag - PULL}px)`, opacity: refreshing ? 1 : drag / PULL }}>
            <div className={`border-primary size-5 rounded-full border-2 border-t-transparent ${refreshing ? "animate-spin" : ""}`} style={refreshing ? undefined : { transform: `rotate(${drag * 4}deg)` }} />
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
