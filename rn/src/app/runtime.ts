//! Filled in for the product (lib/export/regions.ts, lib/export/copy.ts filledFile) into apps/mobile/src/generated/runtime.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
//! As it stands here the design invokes no capability and has no realtime channel; the lines marked //| hand the runtime
//! the capabilities' registry and the contract's channels, which scripts/check-product.ts typechecks in the exported
//! proof app (it pays through payment.pay) and the shop (its order updates).
//#if capabilities
//| import { registry } from "./capabilities"
//#end
import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { createRuntime, type TokenStorage } from "@m3e/app-runtime"
//#if realtime
//| import { CHANNELS, REALTIME_URL, withRealtime } from "@m3e/api"
//#end
import { AUTH } from "./contract"
import { createNativeTransport } from "./transport"

/** where the API is: EXPO_PUBLIC_API_BASE_URL when the app is built, else app.json's extra.apiBaseUrl */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "http://localhost:3001"

//#if realtime
//| /** where the realtime channels are: EXPO_PUBLIC_REALTIME_URL when the app is built, else the contract's dev server's,
//|  *  else /realtime beside the API (in development the mocks answer them) */
//| const REALTIME: string = process.env.EXPO_PUBLIC_REALTIME_URL ?? (REALTIME_URL || `${API_BASE_URL.replace(/^http/, "ws").replace(/\/$/, "")}/realtime`)
//|
//#end
/** where the session's tokens are kept: the device's secure store; on the web, which has none, the tab's sessionStorage */
function tokenStorage(): TokenStorage {
  if (Platform.OS !== "web") return { get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v), remove: (k) => SecureStore.deleteItemAsync(k) }
  const web = (globalThis as { sessionStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } }).sessionStorage
  return { get: (k) => web?.getItem(k) ?? null, set: (k, v) => web?.setItem(k, v), remove: (k) => web?.removeItem(k) }
}

/** The app's runtime (packages/app-runtime): the session, the data sources, the language. Its transport is the API
 *  over fetch; in development the mocks take its place (./mocks), and custom code may give it another
 *  (runtime.setTransport). */
export const runtime = createRuntime({
//#if realtime
//|   transport: withRealtime(createNativeTransport({ baseUrl: API_BASE_URL }), { url: REALTIME, channels: CHANNELS }),
//#else
  transport: createNativeTransport({ baseUrl: API_BASE_URL }),
//#end
  auth: AUTH,
  storage: tokenStorage(),
  storageKey: /*$storageKey*/"app.session"/*$*/,
  lang: /*$lang*/"en"/*$*/,
//#if capabilities
//|   capabilities: registry,
//#end
})
