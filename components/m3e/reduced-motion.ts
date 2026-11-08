import * as React from "react"

/*
 * Whether the system asks for reduced motion, read in one place. The setting
 * can change while the page is open: `prefersReducedMotion()` reads it as it
 * is now, and `useReducedMotionPreference()` draws a component again when it
 * changes. What animates from script (the ripple's WAAPI press, the loading
 * indicator's frames, the widgets' spins) asks here; CSS transitions follow
 * the same media query in styles/m3e.css.
 */
const QUERY = "(prefers-reduced-motion: reduce)"

let media: MediaQueryList | null | undefined
const query = () => {
  if (media === undefined)
    media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(QUERY)
        : null
  return media
}

/** the system asks for reduced motion, now */
export function prefersReducedMotion(): boolean {
  return query()?.matches === true
}

const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

/** call `listener` whenever the setting changes; returns the unsubscribe */
export function onReducedMotionChange(listener: () => void): () => void {
  const m = query()
  if (!m) return () => {}
  if (!listeners.size) m.addEventListener("change", changed)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) m.removeEventListener("change", changed)
  }
}

/** the setting, kept up to date: the component draws again when it changes */
export function useReducedMotionPreference(): boolean {
  return React.useSyncExternalStore(
    onReducedMotionChange,
    prefersReducedMotion,
    () => false
  )
}
