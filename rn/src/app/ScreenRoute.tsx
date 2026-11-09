//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/ScreenRoute.tsx of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react"
import { screenParams, useRequireAuth } from "@m3e/app-runtime"
import { Laid, OnShowProvider } from "../kit"
import { ROUTES, listenOnShow, placeOf, placesOnShow, routerNav, seen, toSignIn } from "./routing"

/** the params an address holds, one value each */
const flat = (given: Record<string, string | string[] | undefined>) => Object.fromEntries(Object.entries(given).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])))

/** A screen as a route: its params read off the address as their types have them, kept as the screen on show, and a
 *  screen that needs a session sending the app to sign in when there is none. One laid over the screen on show stands as
 *  its layer (docs/交互规则.md “分层”): a HUD, a dialog (`pauses`: the worlds under it stand still), a toast, or in the
 *  middle at its own size when an action lays it over. */
export function ScreenRoute({ screen, overlay, layer, pauses, render }: { screen: string; overlay?: boolean; layer?: "hud" | "dialog" | "toast"; pauses?: boolean; render: (params: Record<string, unknown>) => ReactNode }) {
  const given = useLocalSearchParams()
  const route = ROUTES[screen]
  /* the address as words: equal params are the same params */
  const key = JSON.stringify(given)
  const params = useMemo(() => screenParams(route?.spec, flat(JSON.parse(key) as Record<string, string | string[] | undefined>)), [route, key])
  useFocusEffect(
    useCallback(() => {
      seen({ key: screen, params }, !!overlay)
    }, [screen, params, overlay]),
  )
  /* on show while it is the screen come on show last, or the one under an overlay over it: what it holds open while on
     show (its subscriptions) follows */
  const place = placeOf({ key: screen, params })
  const read = () => placesOnShow().includes(place)
  const shown = useSyncExternalStore(listenOnShow, read, read)
  useRequireAuth(route?.auth === "required", () => toSignIn({ key: screen, params }))
  const body = <OnShowProvider value={shown}>{render(params)}</OnShowProvider>
  return overlay ? (
    <Laid layer={layer ?? "overlay"} pauses={pauses} onClose={() => routerNav.back()}>
      {body}
    </Laid>
  ) : (
    <>{body}</>
  )
}
