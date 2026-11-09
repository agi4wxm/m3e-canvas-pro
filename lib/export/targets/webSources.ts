/* The files of apps/web that are the product's own, beside the screens the printer writes: the entry, the API client
 * on the shared runtime (packages/app-runtime) with the session the contract asks for, the mocks in development with a
 * picker of their scenarios, the router with each screen's params in its address. What only a browser has (the scroll
 * body that pulls to refresh and pages, file inputs, date inputs, sessionStorage, uploads with progress) is real files
 * of this repo, lib/export/files/web, copied as they are. */

import { tokenPlacement } from "../../bindings/contract";
import { authFields, type ApiSpec } from "../../api/types";
import { kebab } from "../paths";
import { GENERATED, literal, propKey, str } from "../code";

export const MAIN = (scope: string) => `${GENERATED}
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RuntimeProvider, SetupGate } from ${str(`${scope}/app-runtime`)}
import { App } from "./generated/App"
import { runtime } from "./generated/api"
import { RouterSync } from "./generated/router"
import { AppProvider } from "./generated/runtime"
import { Theme } from "./generated/theme"
import { Providers } from "./custom/Providers"
import { setup } from "./custom/setup"
import "./generated/index.css"

/* In development the API answers from the mocks (${scope}/mocks) unless VITE_API_MOCKS is "off", with a picker of
 * their scenarios; a production build has none of them: the branch is dropped with what it imports. The app is drawn
 * once the custom setup has run (SetupGate: nothing before; a setup that fails is reported and the app drawn all the
 * same), as the mobile app and the mini-program draw theirs. */
async function start() {
  const picker = import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "off" ? await (await import("./generated/mocks")).startMocks(import.meta.env.VITE_API_MOCKS) : null
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Theme>
        <RuntimeProvider runtime={runtime}>
          <SetupGate setup={setup}>
            <AppProvider>
              <Providers>
                <RouterSync />
                <App />
              </Providers>
            </AppProvider>
          </SetupGate>
        </RuntimeProvider>
        {picker}
      </Theme>
    </StrictMode>,
  )
}

void start()
`;

/** the session's needs of a contract: which operations sign in, refresh and sign out, and how each one's token rides */
export function authSource(api: ApiSpec): string {
  const auth = api.auth;
  const f = authFields(auth);
  const opOf = (id: string | undefined) => {
    const e = id ? api.endpoints?.find((x) => x.operationId === id) : undefined;
    return e ? `{ operationId: ${str(e.operationId)}, method: ${str(e.method.toUpperCase())}, path: ${str(e.path)} }` : undefined;
  };
  const lines: string[] = [];
  if (auth?.login && api.endpoints?.some((e) => e.operationId === auth.login)) lines.push(`login: ${str(auth.login)},`);
  const refresh = opOf(auth?.refresh);
  const logout = opOf(auth?.logout);
  if (refresh) lines.push(`refresh: ${refresh},`);
  if (logout) lines.push(`logout: ${logout},`);
  if (f.token !== "accessToken") lines.push(`tokenField: ${str(f.token)},`);
  if (f.refreshToken !== "refreshToken") lines.push(`refreshTokenField: ${str(f.refreshToken)},`);
  const security = (api.endpoints ?? []).map((e) => `    ${propKey(e.operationId)}: ${literal(tokenPlacement(api, e))},`);
  return `{\n${lines.map((l) => `  ${l}\n`).join("")}  security: {\n${security.join("\n")}${security.length ? "\n" : ""}  },\n}`;
}

export const API_CLIENT = (scope: string, name: string, lang: string, api: ApiSpec, capabilities = false) => {
  const realtime = !!api.channels?.length;
  const fetchTransport = "withUploads(createFetchTransport({ baseUrl: BASE_URL }), BASE_URL)";
  return `${GENERATED}
import { createApi, createFetchTransport, ${realtime ? "CHANNELS, REALTIME_URL, withRealtime, " : ""}type Transport } from ${str(`${scope}/api`)}
import { createRuntime, type AuthConfig } from ${str(`${scope}/app-runtime`)}
${capabilities ? 'import { registry } from "./capabilities"\n' : ""}import { webStorage, withUploads } from "./platform"

/** where the API is: VITE_API_BASE_URL, else /api on this site (the dev server forwards it to the server) */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api"
${realtime ? `
/** where the realtime channels are: VITE_REALTIME_URL, else the contract's dev server's, else /realtime on this site
 *  (in development the mocks answer them, as the API) */
const REALTIME = import.meta.env.VITE_REALTIME_URL ?? (REALTIME_URL || \`\${window.location.origin.replace(/^http/, "ws")}/realtime\`)
` : ""}
/** what the session needs of the contract: the operations that sign in, refresh and sign out, and how each operation's
 *  token rides (null for one anyone may call) */
const AUTH: AuthConfig = ${authSource(api)}

/** The app's runtime (${scope}/app-runtime): the session, kept in this tab's sessionStorage and put on the calls that
 *  need it; the data the screens load; the language. */
export const runtime = createRuntime({
  transport: ${realtime ? `withRealtime(${fetchTransport}, { url: REALTIME, channels: CHANNELS })` : fetchTransport},
  auth: AUTH,
  storage: webStorage(),
  storageKey: ${str(`${name}:session`)},
  lang: ${str(lang)},
${capabilities ? "  capabilities: registry,\n" : ""}})

/** Answers the app's calls another way from now on: the mocks in development, or a transport of the custom code's. The
 *  data and the session start over; \`presumed\` counts the app as signed in without a token (the mocks' session). */
export function setTransport(next: Transport, o: { presumed?: boolean } = {}) {
  runtime.setTransport(next, o)
}

/** the API as the screens call it: one function per operation of the contract, the session's token on those that need it */
export const api = createApi(runtime.transport)
`;
};

export const SCENARIO_PICKER = (scope: string) => `${GENERATED}
import { useState } from "react"
import { SCENARIOS } from ${str(`${scope}/mocks`)}

/** A corner of the screen, in development only, that says which scenario of the mocks answers and switches it. */
export function ScenarioPicker({ start, choose }: { start: string | undefined; choose: (id: string) => void }) {
  const [now, setNow] = useState(start ?? "")
  if (!SCENARIOS.length) return null
  return (
    <label className="bg-inverse-surface text-inverse-on-surface text-label-medium shadow-elevation-2 fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 opacity-80 hover:opacity-100">
      Mocks
      <select
        data-mock-scenario
        aria-label="Mock scenario"
        className="bg-transparent outline-none"
        value={now}
        onChange={(event) => {
          setNow(event.target.value)
          choose(event.target.value)
        }}
      >
        <option value="">Default</option>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
`;

export const MOCKS = (scope: string) => `${GENERATED}
import { createElement, type ReactNode } from "react"
import { createMockTransport, startsSignedIn, type ScenarioName } from ${str(`${scope}/mocks`)}
import type { Transport, TransportRequest } from ${str(`${scope}/api`)}
import { runtime, setTransport } from "./api"
import { ScenarioPicker } from "./ScenarioPicker"

/** the scenario asked for: ?scenario= in the address, else VITE_MOCK_SCENARIO, else the design's own */
function scenarioAsked(): string | undefined {
  return new URLSearchParams(window.location.search).get("scenario") ?? import.meta.env.VITE_MOCK_SCENARIO ?? undefined
}

/** a picked file as the mocks take one: its bytes as a data URL */
async function dataFile(file: Blob & { name?: string }) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const type = file.type || "application/octet-stream"
  return { name: file.name ?? "file", type, size: file.size, dataUrl: \`data:\${type};base64,\${btoa(bin)}\` }
}

/** the mocks over the files a form sends: each picked file made a data URL first */
function withDataFiles(inner: Transport): Transport {
  return {
    /* the mocks' realtime channels and their clock, as they are */
    ...(inner.connect ? { connect: inner.connect.bind(inner) } : {}),
    ...(inner.now ? { now: inner.now.bind(inner) } : {}),
    async request(request: TransportRequest) {
      const body = request.body
      if (!body || typeof body !== "object" || Array.isArray(body)) return inner.request(request)
      const entries = Object.entries(body as Record<string, unknown>)
      if (!entries.some(([, v]) => v instanceof Blob || (Array.isArray(v) && v.some((x) => x instanceof Blob)))) return inner.request(request)
      const out: Record<string, unknown> = {}
      for (const [k, v] of entries) out[k] = v instanceof Blob ? await dataFile(v) : Array.isArray(v) ? await Promise.all(v.map((x) => (x instanceof Blob ? dataFile(x) : x))) : v
      return inner.request({ ...request, body: out })
    },
  }
}

/** the address with the scenario in it, so a reload plays it again */
function remember(id: string) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set("scenario", id)
  else url.searchParams.delete("scenario")
  window.history.replaceState(window.history.state, "", url)
}

/** Development only (main.tsx imports this behind import.meta.env.DEV): the API answers from the mocks, signed in as
 *  their session starts. "msw" serves them from a service worker instead, so they show in the browser's network panel.
 *  Gives back the scenario picker. */
export async function startMocks(mode?: string): Promise<ReactNode> {
  const asked = scenarioAsked()
  if (mode === "msw") {
    const { startWorker } = await import(${str(`${scope}/mocks/browser`)})
    await startWorker(asked !== undefined ? { scenario: asked as ScenarioName } : {})
    runtime.restart(startsSignedIn(asked))
    return createElement(ScenarioPicker, {
      start: asked,
      choose: (id) => {
        remember(id)
        window.location.reload()
      },
    })
  }
  const mock = createMockTransport(asked !== undefined ? { scenario: asked as ScenarioName } : {})
  setTransport(withDataFiles(mock), { presumed: startsSignedIn(mock.scenario) })
  return createElement(ScenarioPicker, {
    start: mock.scenario,
    choose: (id) => {
      remember(id)
      mock.setScenario(id || undefined)
      setTransport(withDataFiles(mock), { presumed: startsSignedIn(mock.scenario) })
    },
  })
}
`;

/** each screen's address: its path from its key, unique, with a segment for each param it takes */
export function routesSource(screens: string[], start: string, params: Record<string, { name: string }[]>): string {
  const paths = new Map<string, string>();
  const taken = new Set<string>();
  for (const key of screens) {
    let path = `/${kebab(key) || "screen"}`;
    for (let i = 2; taken.has(path); i++) path = `/${kebab(key) || "screen"}-${i}`;
    taken.add(path);
    const names = (params[key] ?? []).map((p) => p.name).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    paths.set(key, `${path}${names.map((n) => `/:${n}`).join("")}`);
  }
  return `${GENERATED}
import type { ScreenId } from "./runtime"

/** the address of each screen, under the app's base: \`:name\` is a param the screen is opened with */
export const ROUTES: Record<ScreenId, string> = {
${screens.map((key) => `  ${propKey(key)}: ${str(paths.get(key))},`).join("\n")}
}

/** the screen the app starts on when the address names none */
export const START: ScreenId = ${str(start)}

const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "")

/** the screen an address names, with the params its segments carry */
export function routeOf(pathname: string): { screen: ScreenId; params: Record<string, string> } | undefined {
  const path = (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname).replace(/\\/+$/, "") || "/"
  const got = path.split("/")
  for (const screen of Object.keys(ROUTES) as ScreenId[]) {
    const want = ROUTES[screen].split("/")
    if (want.length !== got.length) continue
    const params: Record<string, string> = {}
    const same = want.every((piece, i) => {
      if (!piece.startsWith(":")) return piece === got[i]
      if (!got[i]) return false
      try {
        params[piece.slice(1)] = decodeURIComponent(got[i])
        return true
      } catch {
        return false
      }
    })
    if (same) return { screen, params }
  }
  return undefined
}

/** the screen an address names, if it names one */
export const screenAt = (pathname: string): ScreenId | undefined => routeOf(pathname)?.screen

/** the address of a screen opened with these params */
export const pathOf = (screen: ScreenId, params?: Record<string, unknown>) =>
  BASE + ROUTES[screen].replace(/:([A-Za-z_$][\\w$]*)/g, (_, name: string) => encodeURIComponent(String(params?.[name] ?? "")))
`;
}

/** the router: the browser's history kept with the screens the app opens, their params in the address */
export const ROUTER = `${GENERATED}
import { useEffect, useRef } from "react"
import { pathOf, routeOf } from "./routes"
import { useApp, useScreenParams, type ScreenId } from "./runtime"

/** Keeps the address and the screen on show together: a screen the app opens is pushed onto the browser's history with
 *  its params in its address, the app's own back takes it off again, the browser's back and forward move between the
 *  screens, and an address opened directly (a deep link) starts at its screen with its params. Overlays have no
 *  address. */
export function RouterSync() {
  const { screen, move, navigate, back } = useApp()
  const params = useScreenParams()
  /* the addresses as the app opened them, to tell the browser's back from its forward */
  const trail = useRef<string[]>([])
  const seen = useRef<{ screen: ScreenId; move: object } | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const asked = routeOf(window.location.pathname)
    if (asked && (asked.screen !== screen || Object.keys(asked.params).length)) navigate(asked.screen, asked.params, "none")
  }, [navigate, screen])

  useEffect(() => {
    if (seen.current && seen.current.screen === screen && seen.current.move === move) return
    const first = !seen.current
    seen.current = { screen, move }
    const trailNow = trail.current
    const want = pathOf(screen, params)
    const here = window.location.pathname === want
    if (move.backwards && !first) {
      trailNow.pop()
      if (!here) {
        const state: unknown = window.history.state
        const ours = typeof state === "object" && state !== null && "m3e" in state
        if (ours && trailNow.length) window.history.back()
        else window.history.replaceState({ m3e: trailNow.length }, "", want + window.location.search)
      }
      return
    }
    trailNow.push(want)
    if (first) window.history.replaceState({ m3e: trailNow.length }, "", here ? undefined : want + window.location.search)
    else if (!here) window.history.pushState({ m3e: trailNow.length }, "", want + window.location.search)
  }, [screen, move, params])

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname
      const trailNow = trail.current
      const asked = routeOf(path)
      if (!asked || path === trailNow[trailNow.length - 1]) return
      if (path === trailNow[trailNow.length - 2]) back()
      else navigate(asked.screen, asked.params, "none")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [navigate, back])

  return null
}
`;

export const ROUTER_TEST = `${GENERATED}
import { describe, expect, it } from "vitest"
import { ROUTES, START, pathOf, routeOf, screenAt } from "./routes"

describe("the router", () => {
  it("gives every screen an address of its own, with a segment for each param it takes", () => {
    const paths = Object.values(ROUTES)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path).toMatch(/^\\/[a-z0-9-]+(\\/:[A-Za-z_$][\\w$]*)*$/)
  })

  it("reads each address back as its screen and its params", () => {
    for (const screen of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const names = [...ROUTES[screen].matchAll(/:([A-Za-z_$][\\w$]*)/g)].map((m) => m[1])
      const params = Object.fromEntries(names.map((n) => [n, \`\${n} 1/2\`]))
      expect(routeOf(pathOf(screen, params))).toEqual({ screen, params })
    }
    expect(screenAt("/no-such-screen")).toBeUndefined()
    expect(Object.keys(ROUTES)).toContain(START)
  })
})
`;

export const ENV = `${GENERATED}
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** where the API is (default /api on the same site) */
  readonly VITE_API_BASE_URL?: string
  /** development only: "off" calls the real server, "msw" serves the mocks from a service worker */
  readonly VITE_API_MOCKS?: string
  /** development only: the scenario of the mocks to play (new-user, network-error…); ?scenario= in the address wins */
  readonly VITE_MOCK_SCENARIO?: string
  /** where the realtime channels are (default: the contract's dev server's realtime address, else /realtime on this site) */
  readonly VITE_REALTIME_URL?: string
}
`;
