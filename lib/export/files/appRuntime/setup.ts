//! Copied as it is (lib/export/copy.ts) into packages/app-runtime/src/setup.ts of every product (lib/export/targets/appRuntime.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
/* The app's setup (src/custom/setup.ts: an SDK started, a token read, another transport), run the same way by every
 * front end before it draws its first screen: the web app, the React Native app and the mini-program each put
 * `SetupGate` around their screens (docs/导出.md, “setup”).
 *
 *   - It runs once for the app's life, however many times the gate is drawn (React's strict mode, every page of a
 *     mini-program), after the development mocks are on: the gate starts it when it is first drawn.
 *   - While it runs, the gate draws nothing: no screen loads its data or reads the session before setup has had its
 *     say. A setup that returns without a promise lets the screens draw at once.
 *   - When it fails (it throws, or its promise rejects), the failure is reported once (`console.error`) and the app is
 *     drawn all the same: what setup had done stays, what it had not stays as it was (the generated transport, the
 *     capabilities' platform defaults). A setup that must stop the app handles its own failure.
 *   - One that never ends keeps the app undrawn: setup decides how long it may take. */

import { createElement, Fragment, useSyncExternalStore, type ReactNode } from "react"

/** where the app's setup has got to */
export type SetupState = { status: "pending" } | { status: "ready" } | { status: "failed"; error: unknown }

/** what the app's setup is: src/custom/setup.ts's `setup` */
export type Setup = () => void | Promise<void>

/** one run of the app's setup, as the gate reads it */
export type SetupRun = {
  /** where it has got to now */
  state(): SetupState
  /** told each time it gets further; gives back what stops the telling */
  subscribe(listener: () => void): () => void
  /** settles once setup has (ready or failed); never rejects */
  done: Promise<SetupState>
}

const PENDING: SetupState = { status: "pending" }
const READY: SetupState = { status: "ready" }

/** the runs so far, one per setup: the app's setup runs once, whoever asks for it */
const runs = new WeakMap<Setup, SetupRun>()

/** How a failure is told: once, on the console, as the platform has it (a browser's, Metro's, the mini-program tools').
 *  The package has no DOM or Node types, so the console is read off the global object. */
const report = (error: unknown) => (globalThis as { console?: { error(...what: unknown[]): void } }).console?.error("[app] setup failed; the app is drawn without what it did not finish:", error)

/** Runs the app's setup, once: the run it started the first time it was asked, every time after. */
export function runSetup(setup: Setup, o: { report?: (error: unknown) => void } = {}): SetupRun {
  const known = runs.get(setup)
  if (known) return known
  let now: SetupState = PENDING
  const listeners = new Set<() => void>()
  let settle: (s: SetupState) => void = () => {}
  const done = new Promise<SetupState>((resolve) => (settle = resolve))
  const reach = (next: SetupState) => {
    if (now.status !== "pending") return
    now = next
    if (next.status === "failed") (o.report ?? report)(next.error)
    settle(next)
    for (const l of listeners) l()
  }
  const run: SetupRun = {
    state: () => now,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    done,
  }
  runs.set(setup, run)
  try {
    const out = setup()
    if (out && typeof (out as Promise<void>).then === "function")
      (out as Promise<void>).then(
        () => reach(READY),
        (error: unknown) => reach({ status: "failed", error }),
      )
    else reach(READY)
  } catch (error) {
    reach({ status: "failed", error })
  }
  return run
}

/** where the app's setup has got to, drawn again as it gets further; it is started by the first who asks */
export function useSetup(setup: Setup): SetupState {
  const run = runSetup(setup)
  return useSyncExternalStore(run.subscribe, run.state, run.state)
}

/** Draws its children once the app's setup has run (ready, or failed and reported), nothing before: what every front
 *  end puts around its screens. */
export function SetupGate({ setup, children }: { setup: Setup; children?: ReactNode }) {
  return useSetup(setup).status === "pending" ? null : createElement(Fragment, null, children)
}
