//! Filled in for the product (lib/export/regions.ts, lib/export/copy.ts filledFile) into apps/mobile/src/generated/root.tsx of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
//! As it stands here a variable of the design drives the dark mode; the lines marked //| are the theme that follows the
//! device's, which scripts/check-product.ts typechecks in the exported proof and shop apps.
import type { ComponentType, ReactNode } from "react"
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context"
import { RuntimeProvider, SetupGate } from "@m3e/app-runtime"
import { AppProvider, NavProvider, SnackHost, ThemeProvider, registerIcons, setClock, /*#if dark*/useApp, /*#end*/type AppVar } from "../kit"
import { Providers } from "../custom/Providers"
import { setup } from "../custom/setup"
import { interpret, reader } from "./effects"
import { icons } from "./icons"
import { routerNav } from "./routing"
import { runtime } from "./runtime"
import { theme } from "./theme"

registerIcons(icons)
/* the kit's parts read the time off the runtime's clock: the back end's (the mocks' in development), never the device's */
setClock(() => runtime.now())

/** the design's variables, and the parts hidden until a tap shows them */
const VARS: AppVar[] = /*$vars*/[]/*$*/
const HIDDEN: string[] = /*$hidden*/[]/*$*/
/** the overlays that keep a trigger of their own on the screen while shut (a menu) */
const TRIGGERS: string[] = /*$triggers*/[]/*$*/

/* In development the API answers from the mocks (@@scope@@/mocks) unless EXPO_PUBLIC_API_MOCKS is "off", and a dev menu
 * picks their scenario; a production build has neither: Metro drops the branch with what it requires. */
let DevMenu: ComponentType | null = null
if (__DEV__ && process.env.EXPO_PUBLIC_API_MOCKS !== "off") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- development only, dropped from a production build
  const mocks = require("./mocks") as typeof import("./mocks")
  mocks.startMocks()
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- development only, dropped from a production build
  DevMenu = (require("./DevMenu") as typeof import("./DevMenu")).DevMenu
}

//#if dark
/** the theme, dark while the variable that drives the dark mode says so */
function Themed({ children }: { children: ReactNode }) {
  const app = useApp()
  const dark = app.vars[/*$darkVar*/"dark"/*$*/]
  return <ThemeProvider theme={theme} dark={typeof dark === "boolean" ? dark : undefined}>{children}</ThemeProvider>
}
//#else
//| /** the theme: light or dark as the device is */
//| function Themed({ children }: { children: ReactNode }) {
//|   return <ThemeProvider theme={theme}>{children}</ThemeProvider>
//| }
//#end

/** The app around its routes: the safe area, the runtime (session, data, language), the app's memory (variables, what
 *  taps showed, the snackbar) with the API's effects, the theme, where taps go, the custom providers. The routes are
 *  drawn once the custom setup has run (SetupGate: nothing before; a setup that fails is reported and the app drawn
 *  all the same), as the web app and the mini-program draw theirs. */
export function AppRoot({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <RuntimeProvider runtime={runtime}>
        <AppProvider vars={VARS} hidden={HIDDEN} triggers={TRIGGERS} reader={reader} interpret={interpret}>
          <Themed>
            <NavProvider value={routerNav}>
              <SetupGate setup={setup}>
                <Providers>{children}</Providers>
              </SetupGate>
              <SnackHost />
              {DevMenu ? <DevMenu /> : null}
            </NavProvider>
          </Themed>
        </AppProvider>
      </RuntimeProvider>
    </SafeAreaProvider>
  )
}
