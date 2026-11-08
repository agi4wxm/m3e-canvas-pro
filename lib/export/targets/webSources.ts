/* The files of apps/web that are the product's own, beside the screens the printer writes: the entry, the API client
 * on the shared runtime (packages/app-runtime) with the session the contract asks for, the mocks in development with a
 * picker of their scenarios, the router with each screen's params in its address, and what only a browser has (the
 * scroll body that pulls to refresh and pages, file inputs, date inputs, sessionStorage, uploads with progress). */

import { tokenPlacement } from "../../bindings/contract";
import { authFields, type ApiSpec } from "../../api/types";
import { kebab } from "../paths";
import { GENERATED, literal, propKey, str } from "../code";

export const MAIN = (scope: string) => `${GENERATED}
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RuntimeProvider } from ${str(`${scope}/app-runtime`)}
import { App } from "./generated/App"
import { runtime } from "./generated/api"
import { RouterSync } from "./generated/router"
import { AppProvider } from "./generated/runtime"
import { Theme } from "./generated/theme"
import { Providers } from "./custom/Providers"
import { setup } from "./custom/setup"
import "./generated/index.css"

/* In development the API answers from the mocks (${scope}/mocks) unless VITE_API_MOCKS is "off", with a picker of
 * their scenarios; a production build has none of them: the branch is dropped with what it imports. */
async function start() {
  const picker = import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "off" ? await (await import("./generated/mocks")).startMocks(import.meta.env.VITE_API_MOCKS) : null
  await setup()
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Theme>
        <RuntimeProvider runtime={runtime}>
          <AppProvider>
            <Providers>
              <RouterSync />
              <App />
            </Providers>
          </AppProvider>
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

export const API_CLIENT = (scope: string, name: string, lang: string, api: ApiSpec, capabilities = false) => `${GENERATED}
import { createApi, createFetchTransport, type Transport } from ${str(`${scope}/api`)}
import { createRuntime, type AuthConfig } from ${str(`${scope}/app-runtime`)}
${capabilities ? 'import { registry } from "./capabilities"\n' : ""}import { webStorage, withUploads } from "./platform"

/** where the API is: VITE_API_BASE_URL, else /api on this site (the dev server forwards it to the server) */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api"

/** what the session needs of the contract: the operations that sign in, refresh and sign out, and how each operation's
 *  token rides (null for one anyone may call) */
const AUTH: AuthConfig = ${authSource(api)}

/** The app's runtime (${scope}/app-runtime): the session, kept in this tab's sessionStorage and put on the calls that
 *  need it; the data the screens load; the language. */
export const runtime = createRuntime({
  transport: withUploads(createFetchTransport({ baseUrl: BASE_URL }), BASE_URL),
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

export const PLATFORM = (scope: string) => `${GENERATED}
import type { ChangeEvent } from "react"
import { queryString, readBody, type Transport, type TransportRequest, type TransportResponse } from ${str(`${scope}/api`)}
import type { TokenStorage } from ${str(`${scope}/app-runtime`)}

/** the session's tokens in this tab's sessionStorage: kept across reloads, gone when the tab is closed */
export function webStorage(): TokenStorage {
  return {
    get: (key) => {
      try {
        return window.sessionStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value)
      } catch {
        /* storage refused (a private window): the session lasts as long as the page */
      }
    },
    remove: (key) => {
      try {
        window.sessionStorage.removeItem(key)
      } catch {
        /* nothing kept to remove */
      }
    },
  }
}

const isFile = (v: unknown): v is Blob => typeof Blob !== "undefined" && v instanceof Blob

/** whether a request's body goes as a multipart form: its content type says so, or files are in it */
function multipart(request: TransportRequest): boolean {
  const type = Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? ""
  if (/multipart\\/form-data/i.test(type)) return true
  const body = request.body
  return !!body && typeof body === "object" && Object.values(body).some((v) => isFile(v) || (Array.isArray(v) && v.some(isFile)))
}

/** a multipart body as form data: files as they are, lists as repeated fields, objects as JSON, the rest as words */
function formData(body: unknown): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries((body ?? {}) as Record<string, unknown>))
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one === undefined || one === null) continue
      if (isFile(one)) form.append(key, one, (one as File).name)
      else form.append(key, typeof one === "object" ? JSON.stringify(one) : String(one))
    }
  return form
}

/** Sends what carries files over XMLHttpRequest, so the upload's progress can be told (\`onUploadProgress\`); everything
 *  else goes through \`inner\`. */
export function withUploads(inner: Transport, baseUrl: string): Transport {
  return {
    request(request) {
      if (!multipart(request)) return inner.request(request)
      return new Promise<TransportResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const search = queryString(request.query)
        xhr.open(request.method, \`\${baseUrl.replace(/\\/$/, "")}\${request.path}\${search ? \`?\${search}\` : ""}\`)
        for (const [k, v] of Object.entries(request.headers ?? {})) if (k.toLowerCase() !== "content-type") xhr.setRequestHeader(k, v)
        xhr.setRequestHeader("accept", "application/json")
        xhr.upload.onprogress = (event) => request.onUploadProgress?.(event.loaded, event.lengthComputable ? event.total : 0)
        xhr.onerror = () => reject(new Error("The network failed"))
        /* the answer's bytes as they came, read as the fetch transport reads every answer (JSON, text or a file) */
        xhr.responseType = "arraybuffer"
        xhr.onload = () => {
          const headers: Record<string, string> = {}
          for (const line of xhr.getAllResponseHeaders().trim().split(/[\\r\\n]+/)) {
            const at = line.indexOf(":")
            if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
          }
          const bytes = xhr.response instanceof ArrayBuffer ? new Uint8Array(xhr.response) : new Uint8Array(0)
          resolve({ status: xhr.status, headers, body: readBody({ method: request.method, path: request.path, status: xhr.status, headers, bytes }) })
        }
        xhr.send(formData(request.body))
      })
    },
  }
}

/** what a file input inside a part picked, handed to \`take\`: its file, or its files for one that takes several */
export const pickFiles = (many: boolean, take: (files: File | File[]) => void) => (event: ChangeEvent<HTMLElement>) => {
  const input = event.target as HTMLInputElement
  if (input.type !== "file" || !input.files?.length) return
  take(many ? [...input.files] : input.files[0])
}

/** a date and time the contract writes (ISO 8601) as a datetime-local input shows it, in this place's time */
export function localDateTime(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())}T\${pad(d.getHours())}:\${pad(d.getMinutes())}\`
}

/** what a datetime-local input holds, as the contract writes a date and time */
export function isoDateTime(local: string): string {
  const d = new Date(local)
  return !local || Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

`;

export const DATA_SCROLL = `${GENERATED}
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
          <div className="bg-surface-container-high shadow-elevation-2 mt-3 grid size-9 place-items-center rounded-full" style={{ transform: \`translateY(\${refreshing ? 0 : drag - PULL}px)\`, opacity: refreshing ? 1 : drag / PULL }}>
            <div className={\`border-primary size-5 rounded-full border-2 border-t-transparent \${refreshing ? "animate-spin" : ""}\`} style={refreshing ? undefined : { transform: \`rotate(\${drag * 4}deg)\` }} />
          </div>
        </div>
      )}
      {children}
    </div>
  )
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
}
`;
