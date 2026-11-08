import * as React from "react"

import { cn } from "@/lib/m3e/cn"
import { prefersReducedMotion } from "@/components/m3e/reduced-motion"

/*
 * Press feedback for M3 components.
 *
 * 1. Pressed state — `data-press` on the control, held for at least 225ms so a
 *    quick click still shows the whole shape morph (matraic/m3e
 *    PressedController: pointer presses start at once, Space holds until
 *    keyup, Enter/other keyboard clicks hold for the minimum).
 *
 * 2. Ripple — port of Material Web's <md-ripple> press animation (Apache-2.0,
 *    material-components/material-web ripple/internal/ripple.ts): a soft-edged
 *    circle starts at 20% of the larger side on the press and grows past the
 *    corners while travelling to the centre, 450ms on the standard easing;
 *    fades in over 105ms, out over 375ms; touches wait 150ms so scrolling
 *    never lights anything up. When the system asks for reduced motion
 *    (asked at each press, so a change while the page is open counts), the
 *    press is a still layer over the whole control instead: nothing grows or
 *    travels, and the pressed state, focus and disabled look stay as they are.
 *
 * Every delayed step is kept and cleared when the control goes, and the
 * document hears a pointer's release only while a press is down.
 */
const MINIMUM_PRESS_MS = 225
const PRESS_GROW_MS = 450
const INITIAL_ORIGIN_SCALE = 0.2
const PADDING = 10
const SOFT_EDGE_MINIMUM_SIZE = 75
const SOFT_EDGE_CONTAINER_RATIO = 0.35
const TOUCH_DELAY_MS = 150
const EASING_STANDARD = "cubic-bezier(0.2, 0, 0, 1)"

type RippleProps = {
  /** turn the ripple off (the pressed state is still tracked) */
  disabled?: boolean
  className?: string
}

function isDisabled(el: HTMLElement) {
  return (
    el.matches(":disabled") ||
    el.getAttribute("aria-disabled") === "true" ||
    el.hasAttribute("data-disabled")
  )
}

/** the control a ripple host belongs to */
function controlOf(host: HTMLElement): HTMLElement | null {
  let el = host.parentElement
  // inside a non-interactive part (e.g. a switch handle): use the control
  if (el && getComputedStyle(el).pointerEvents === "none") {
    el =
      el.parentElement?.closest<HTMLElement>("button, a, [role], label") ?? null
  }
  return el
}

/**
 * Tracks the pressed state of `target` as `data-press`, held for at least
 * 225ms. Returns a cleanup function.
 */
function trackPress(target: HTMLElement) {
  let since = 0
  let timer = 0
  // the click a Space press produces on keyup is part of that press
  let spaceClick = false

  const down = () => {
    window.clearTimeout(timer)
    since = performance.now()
    target.setAttribute("data-press", "")
  }
  const release = () => target.removeAttribute("data-press")
  /* the release of a pointer can happen anywhere on the page, so the document
     hears it, but only while a press is down: a page of many controls keeps no
     listener per control on the document */
  const listen = (on: boolean) => {
    const method = on ? "addEventListener" : "removeEventListener"
    document[method]("pointerup", up)
    document[method]("pointercancel", up)
  }
  const up = () => {
    listen(false)
    if (!since) return
    const left = MINIMUM_PRESS_MS - (performance.now() - since)
    since = 0
    if (left > 0) timer = window.setTimeout(release, left)
    else release()
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button > 1) return
    if (isDisabled(target)) return
    down()
    listen(true)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== target || e.repeat || isDisabled(target)) return
    if (e.key === " ") {
      spaceClick = true
      down()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") up()
  }
  // Enter (and other synthetic clicks) carry detail 0
  const onClick = (e: MouseEvent) => {
    if (spaceClick) {
      spaceClick = false
      return
    }
    if (e.detail === 0 && !since && !isDisabled(target)) {
      down()
      up()
    }
  }

  target.addEventListener("pointerdown", onPointerDown)
  target.addEventListener("keydown", onKeyDown)
  target.addEventListener("keyup", onKeyUp)
  target.addEventListener("click", onClick)
  return () => {
    window.clearTimeout(timer)
    listen(false)
    target.removeAttribute("data-press")
    target.removeEventListener("pointerdown", onPointerDown)
    target.removeEventListener("keydown", onKeyDown)
    target.removeEventListener("keyup", onKeyUp)
    target.removeEventListener("click", onClick)
  }
}

/** Material Web ripple on `target`, drawn into `press`. Returns a cleanup. */
function trackRipple(
  target: HTMLElement,
  host: HTMLElement,
  press: HTMLElement
) {
  let grow: Animation | null = null
  /** the press under way, by when it began: a release for an earlier one leaves it alone */
  let pressed: { at: number } | null = null
  let touchTimer = 0
  let pendingTouch: PointerEvent | null = null
  /* the delayed steps still to come, so none of them touches the ripple after it has gone */
  const timers = new Set<number>()
  const later = (step: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      step()
    }, ms)
    timers.add(id)
  }

  const start = (e?: PointerEvent) => {
    const { width, height, left, top } = host.getBoundingClientRect()
    const maxDim = Math.max(width, height)
    const softEdge = Math.max(
      SOFT_EDGE_CONTAINER_RATIO * maxDim,
      SOFT_EDGE_MINIMUM_SIZE
    )
    const maxRadius = Math.hypot(width, height) + PADDING

    grow?.cancel()
    grow = null
    pressed = { at: performance.now() }
    press.setAttribute("data-pressed", "")
    if (prefersReducedMotion()) {
      // a still layer, centred and large enough that its soft edge clears the corners
      const size = Math.ceil(maxRadius + 2 * softEdge)
      press.style.width = press.style.height = `${size}px`
      press.style.transform = `translate(${(width - size) / 2}px, ${(height - size) / 2}px)`
      return
    }
    const initial = Math.max(1, Math.floor(maxDim * INITIAL_ORIGIN_SCALE))
    const scale = (maxRadius + softEdge) / initial
    const from = e
      ? { x: e.clientX - left - initial / 2, y: e.clientY - top - initial / 2 }
      : { x: (width - initial) / 2, y: (height - initial) / 2 }
    const to = { x: (width - initial) / 2, y: (height - initial) / 2 }

    press.style.removeProperty("transform")
    press.style.width = press.style.height = `${initial}px`
    grow = press.animate(
      {
        transform: [
          `translate(${from.x}px, ${from.y}px) scale(1)`,
          `translate(${to.x}px, ${to.y}px) scale(${scale})`,
        ],
      },
      { duration: PRESS_GROW_MS, easing: EASING_STANDARD, fill: "forwards" }
    )
  }

  const end = () => {
    const mine = pressed
    if (!mine) return
    const played = performance.now() - mine.at
    const release = () => {
      if (pressed === mine) press.removeAttribute("data-pressed")
    }
    if (played >= MINIMUM_PRESS_MS) release()
    else later(release, MINIMUM_PRESS_MS - played)
  }

  const cleanupUp = () => {
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerCancel)
  }
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0 || isDisabled(target)) return
    if (e.pointerType === "touch") {
      pendingTouch = e
      touchTimer = window.setTimeout(() => {
        if (pendingTouch) start(pendingTouch)
        pendingTouch = null
      }, TOUCH_DELAY_MS)
    } else {
      start(e)
    }
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
  }
  const onPointerUp = () => {
    cleanupUp()
    if (pendingTouch) {
      // a quick tap: show the ripple anyway
      window.clearTimeout(touchTimer)
      start(pendingTouch)
      pendingTouch = null
    }
    end()
  }
  const onPointerCancel = () => {
    cleanupUp()
    window.clearTimeout(touchTimer)
    pendingTouch = null
    end()
  }
  const onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && pressed) end()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target === target &&
      e.key === " " &&
      !e.repeat &&
      !isDisabled(target)
    )
      start()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") end()
  }
  const onClick = (e: MouseEvent) => {
    if (
      e.detail === 0 &&
      !isDisabled(target) &&
      !press.hasAttribute("data-pressed")
    ) {
      start()
      end()
    }
  }

  // A control that turns "current" (navigation item, tab) has done its job:
  // let the ripple go at once instead of trailing over the new state.
  const settle = new MutationObserver(() => {
    if (!pressed || !press.hasAttribute("data-pressed")) return
    if (
      !target.hasAttribute("data-active") &&
      !target.hasAttribute("aria-current")
    )
      return
    press.style.transitionDuration = "90ms"
    press.removeAttribute("data-pressed")
    later(() => press.style.removeProperty("transition-duration"), 120)
  })
  settle.observe(target, {
    attributes: true,
    attributeFilter: ["data-active", "aria-current"],
  })

  target.addEventListener("pointerdown", onPointerDown)
  target.addEventListener("pointerleave", onPointerLeave)
  target.addEventListener("keydown", onKeyDown)
  target.addEventListener("keyup", onKeyUp)
  target.addEventListener("click", onClick)
  return () => {
    settle.disconnect()
    cleanupUp()
    window.clearTimeout(touchTimer)
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    target.removeEventListener("pointerdown", onPointerDown)
    target.removeEventListener("pointerleave", onPointerLeave)
    target.removeEventListener("keydown", onKeyDown)
    target.removeEventListener("keyup", onKeyUp)
    target.removeEventListener("click", onClick)
    grow?.cancel()
  }
}

/**
 * M3 press feedback. Drop it inside any interactive element: it marks the
 * element with `data-press` while pressed (≥225ms) and draws the ripple,
 * clipped to the element's corners. The element needs `position: relative`
 * (the `state-layer` utility sets it). The ripple color is `currentColor`, or
 * `--ripple-color`.
 */
function Ripple({ disabled, className }: RippleProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null)
  const pressRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const host = hostRef.current
    const target = host && controlOf(host)
    if (!target) return undefined
    return trackPress(target)
  }, [])

  React.useEffect(() => {
    const host = hostRef.current
    const press = pressRef.current
    const target = host && controlOf(host)
    if (!host || !press || !target || disabled) return undefined
    return trackRipple(target, host, press)
  }, [disabled])

  return (
    <span
      ref={hostRef}
      aria-hidden
      data-slot="ripple"
      className={cn("m3-ripple-host", className)}
    >
      <span ref={pressRef} className="m3-ripple" />
    </span>
  )
}

export { Ripple, trackPress, trackRipple }
