//! Filled in for the product (lib/export/regions.ts, lib/export/copy.ts filledFile) into apps/mobile/src/generated/routing.tsx of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { router, type Href } from "expo-router"
import { Linking } from "react-native"
import type { ParamSpec } from "@m3e/app-runtime"
import { screenShown, type Nav } from "../kit"
import { runtime } from "./runtime"

/** a screen's route: its path (its params are segments of it), whether it is a tab, whether a tap opens it over another */
type Route = { path: string; params: string[]; spec: ParamSpec[]; tab?: boolean; overlay?: boolean; auth?: "required" | "login" }

/** every screen of the design, by the key its taps name it by */
export const ROUTES: Record<string, Route> = {
/*$routes*/  home: {"path":"/home","params":[],"spec":[]},/*$*/
}

/** the screen the app opens on */
export const INITIAL = /*$initial*/"home"/*$*/

/** the sign-in screen, where a screen that needs a session and a 401 send the app */
export const LOGIN: string | undefined = /*$login*/undefined/*$*/

/** where a screen is, opened with these params (the ones its path holds are filled with their examples when missing) */
export function hrefOf(key: string, params: Record<string, unknown> = {}, overlay = false): Href | undefined {
  const r = ROUTES[key]
  if (!r) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) out[k] = typeof v === "object" ? JSON.stringify(v) : String(v)
  for (const p of r.params) if (!(p in out)) out[p] = String(r.spec.find((s) => s.name === p)?.example ?? "-")
  return { pathname: (overlay ? `/overlay${r.path}` : r.path) as never, params: out }
}

/** the screen on show, to come back to after a sign-in */
let current: { key: string; params?: Record<string, unknown> } | undefined

/** a screen came on show (./ScreenRoute): one the app did not go to (the system's back button, a swipe back) is a move
 *  of the visitor's all the same, which an answer that comes later is told (the kit's screenShown) */
export function seen(screen: { key: string; params?: Record<string, unknown> }) {
  current = screen
  screenShown(`${screen.key}:${JSON.stringify(screen.params ?? {})}`)
}

/** where a tap goes, on Expo Router: a tab is switched to, a screen pushed (or put in place of this one), an overlay
 *  opened over it */
export const routerNav: Nav = {
  go: (key, o = {}) => {
    const href = hrefOf(key, o.params, !!o.overlay && !!ROUTES[key]?.overlay)
    if (!href) return
    if (o.replace) router.replace(href)
    else if (ROUTES[key]?.tab) router.navigate(href)
    else router.push(href)
  },
  /* the native stack plays the platform's own animation going back, as it does going forward: a back action's motion
     (Nav.back's options) has no say there (docs/手机端.md) */
  back: () => {
    if (router.canGoBack()) router.back()
    else router.replace(hrefOf(INITIAL) ?? "/")
  },
  open: (url) => {
    if (/^https?:\/\//i.test(url)) void Linking.openURL(url)
  },
  todo: () => {},
}

/** sends the app to sign in, remembering where it was so the sign-in can bring it back */
export function toSignIn(from = current) {
  if (!LOGIN) return
  if (from && from.key !== LOGIN) runtime.rememberReturn(from)
  routerNav.go(LOGIN, { replace: true })
}

/* a call refused for want of a session (a 401 no refresh mended) */
runtime.whenUnauthorized(() => toSignIn())

