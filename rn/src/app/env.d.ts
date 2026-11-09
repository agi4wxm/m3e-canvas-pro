//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/env.d.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
/* what the app reads of its environment when it is built (Expo inlines EXPO_PUBLIC_ variables) */
declare namespace NodeJS {
  interface ProcessEnv {
    /** where the API is (default: app.json's extra.apiBaseUrl) */
    readonly EXPO_PUBLIC_API_BASE_URL?: string
    /** development only: "off" calls the real server instead of the mocks */
    readonly EXPO_PUBLIC_API_MOCKS?: string
    /** where the realtime channels are (default: the contract's dev server's, else /realtime beside the API) */
    readonly EXPO_PUBLIC_REALTIME_URL?: string
  }
}
