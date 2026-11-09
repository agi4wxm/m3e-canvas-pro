/* The packages an exported mobile app installs that the kit does not (lib/exportPackages.ts MOBILE_PACKAGES, and the
 * product's own packages/mocks), as much of each as the app's own files in src/app use: so those files, which every
 * export copies or fills in (lib/export/targets/mobile.ts), typecheck and lint with the kit. Each is what the version
 * the app pins declares (Expo SDK 58); scripts/check-product.ts typechecks the exported app against the real packages.
 * Remove a module here once the kit installs it. */

declare module "expo-secure-store" {
  export function getItemAsync(key: string): Promise<string | null>
  export function setItemAsync(key: string, value: string): Promise<void>
  export function deleteItemAsync(key: string): Promise<void>
}

declare module "expo-router" {
  import type { EffectCallback } from "react"
  export type Href = string | { pathname: string; params?: Record<string, string> }
  export const router: { push(href: Href): void; replace(href: Href): void; navigate(href: Href): void; back(): void; canGoBack(): boolean; dismiss(count?: number): void }
  export function useFocusEffect(effect: EffectCallback): void
  export function useLocalSearchParams(): Record<string, string | string[] | undefined>
}

declare module "expo-image-picker" {
  export type ImagePickerAsset = { uri: string; fileName?: string | null; mimeType?: string; fileSize?: number }
  export type ImagePickerResult = { canceled: true; assets: null } | { canceled: false; assets: ImagePickerAsset[] }
  export function launchImageLibraryAsync(options?: { mediaTypes?: ("images" | "videos" | "livePhotos")[]; quality?: number }): Promise<ImagePickerResult>
}

declare module "expo-document-picker" {
  export type DocumentPickerAsset = { uri: string; name: string; mimeType?: string; size?: number }
  export type DocumentPickerResult = { canceled: true; assets: null } | { canceled: false; assets: DocumentPickerAsset[] }
  export function getDocumentAsync(options?: { type?: string | string[]; copyToCacheDirectory?: boolean }): Promise<DocumentPickerResult>
}

/* the product's mocks (lib/export/targets/mocks.ts): the editor preview's own, as the app's development build uses them */
declare module "@m3e/mocks" {
  import type { Transport } from "@m3e/api"
  export type ScenarioName = string
  export const SCENARIOS: readonly { id: ScenarioName; name: string }[]
  export type MockTransport = Transport & { scenario?: string }
  export function startsSignedIn(scenario?: string): boolean
  export function createMockTransport(options?: { scenario?: ScenarioName | ""; latency?: boolean }): MockTransport
}
