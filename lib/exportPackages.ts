/* The packages an exported project names besides what its copied files import, and every version this repo writes by
 * hand: the one place a version is bumped. scripts/gen-versions.ts (bun run gen:versions) writes the rest from here and
 * from this repo's own package.json and bun.lock: lib/versions.generated.ts (what the exports pin), and the versions of
 * rn/package.json and miniapp-kit/package.json (the kits, which the mobile app and the mini-program are built on).
 * bun run check:versions fails when any of them is behind, or when a kit's package-lock.json is (npm install there).
 *
 *   the editor's own packages      package.json and bun.lock (bun install), read off as they are
 *   PRODUCT_PINS                   what a product pins that the editor does not run; the kits' too, where they share it
 *   EXPO_PINS                      the Expo SDK line: rn/package.json and an exported mobile app
 *   TARO_PINS                      the Taro line: miniapp-kit/package.json and an exported mini-program
 *
 * A kit's package is pinned at its line's version, else at PRODUCT_PINS' (TypeScript, the mini-program's ESLint). */

/** what an exported project always depends on: what its entry, its stylesheet and its components' CLI name */
export const EXPORT_ALWAYS = ["react", "react-dom", "motion", "tailwindcss", "tw-animate-css"];

/** what an exported project builds with, its devDependencies. Tailwind is a build tool there, though the stylesheet names it;
 *  so is shadcn, whose stylesheet the build reads (its CLI and that CLI's own dependencies never reach the app) */
export const EXPORT_DEV = ["@tailwindcss/vite", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "shadcn", "tailwindcss", "typescript", "vite", "vite-plus"];

/** The packages a product (the monorepo export, lib/export) names that this repo does not run itself, at the exact
 *  version it pins them at. Each was checked against the npm registry when it was written here
 *  (`bun scripts/gen-versions.ts --registry` checks them again and says which have newer releases); every other package
 *  a product names is pinned at the version this repo's lockfile has, as the prototype export does.
 *
 *  - vite: plain Vite, where the editor builds with vite-plus (the product lints with ESLint and formats with Prettier).
 *  - typescript: 6.0, the last line typescript-eslint supports (its peer range is <6.1.0); the editor's 7.x has no
 *    JavaScript API for it. The copied components typecheck with it (scripts/check-product.ts).
 *  - the server's Fastify plugins and its validator (ajv with the JSON Schema 2020-12 dialect OpenAPI 3.1 uses): the
 *    newest release at least two weeks old when they were written here. */
export const PRODUCT_PINS: Record<string, string> = {
  "@eslint/js": "10.0.1",
  "@fastify/cors": "11.3.1",
  "@fastify/multipart": "10.1.6",
  "@fastify/swagger": "9.9.2",
  "@fastify/swagger-ui": "6.1.2",
  "@fastify/websocket": "11.3.4",
  /* MSW 3's own interceptors, for React Native (packages/mocks/src/native.ts): the version msw 3.0.4 resolves to */
  "@mswjs/interceptors": "0.45.11",
  "@types/node": "22.20.5",
  "@types/ws": "8.18.2",
  ajv: "8.20.0",
  "ajv-formats": "3.0.1",
  esbuild: "0.28.2",
  eslint: "10.14.0",
  "eslint-plugin-react-hooks": "7.1.1",
  "eslint-plugin-react-refresh": "0.5.7",
  fastify: "5.12.8",
  globals: "17.14.0",
  msw: "3.0.4",
  prettier: "3.9.10",
  tsx: "4.23.15",
  typescript: "6.0.3",
  "typescript-eslint": "8.72.1",
  vite: "8.3.6",
  vitest: "5.1.0",
};

/** what a product's web app builds with, beside the packages its copied files import */
export const PRODUCT_WEB_DEV = ["@tailwindcss/vite", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "msw", "shadcn", "tailwindcss", "typescript", "vite", "vitest"];

/** The Expo SDK 58 line: every package rn/package.json names (the kit, its gallery and its tests) that PRODUCT_PINS does
 *  not, and what an exported mobile app needs beyond the kit (MOBILE_PACKAGES: the router and what it stands on, the
 *  secure store for the session's tokens, the pickers for uploads). Each the version Expo SDK 58's
 *  bundledNativeModules.json names, `expo` itself the current stable release when it was written here (checked
 *  against the npm registry). ESLint stays on 9 here: eslint-config-expo 58 is made for it. */
export const EXPO_PINS: Record<string, string> = {
  "@expo/metro-runtime": "58.0.17",
  "@react-native-community/datetimepicker": "9.2.1",
  "@react-native/jest-preset": "0.88.1",
  "@testing-library/react-native": "14.1.0",
  "@types/jest": "30.0.0",
  "@types/react": "19.3.0",
  eslint: "9.39.5",
  "eslint-config-expo": "58.0.4",
  expo: "58.0.23",
  "expo-blur": "58.0.5",
  "expo-constants": "58.0.15",
  "expo-document-picker": "58.0.4",
  "expo-image": "58.0.18",
  "expo-image-picker": "58.0.10",
  "expo-linear-gradient": "58.0.3",
  "expo-linking": "58.0.16",
  "expo-router": "58.0.30",
  "expo-secure-store": "58.0.2",
  "expo-status-bar": "58.0.4",
  jest: "30.5.2",
  "jest-expo": "58.0.14",
  nativewind: "4.2.7",
  react: "19.3.0",
  "react-dom": "19.3.0",
  "react-native": "0.88.1",
  "react-native-reanimated": "4.7.1",
  "react-native-safe-area-context": "5.11.1",
  "react-native-screens": "4.30.1",
  "react-native-svg": "15.16.0",
  "react-native-web": "0.21.4",
  "react-native-worklets": "0.13.0",
  tailwindcss: "3.4.19",
  "test-renderer": "1.3.0",
};

/** what an exported mobile app pins beyond the kit's own packages (lib/export/targets/mobile.ts), each at EXPO_PINS' */
export const MOBILE_PACKAGES = ["expo-constants", "expo-document-picker", "expo-image-picker", "expo-linking", "expo-router", "expo-secure-store", "react-native-screens"] as const;

/** The Taro 4.3 line: every package miniapp-kit/package.json names (the kit, its gallery, its build) that PRODUCT_PINS
 *  does not. Taro 4 runs on React 18 (docs/小程序.md). */
export const TARO_PINS: Record<string, string> = {
  "@babel/core": "7.29.13",
  "@babel/preset-react": "7.29.7",
  "@babel/runtime": "7.29.13",
  "@pmmmwh/react-refresh-webpack-plugin": "0.5.17",
  "@tarojs/cli": "4.3.2",
  "@tarojs/components": "4.3.2",
  "@tarojs/helper": "4.3.2",
  "@tarojs/plugin-framework-react": "4.3.2",
  "@tarojs/plugin-platform-h5": "4.3.2",
  "@tarojs/plugin-platform-tt": "4.3.2",
  "@tarojs/plugin-platform-weapp": "4.3.2",
  "@tarojs/react": "4.3.2",
  "@tarojs/router": "4.3.2",
  "@tarojs/runtime": "4.3.2",
  "@tarojs/shared": "4.3.2",
  "@tarojs/taro": "4.3.2",
  "@tarojs/taro-loader": "4.3.2",
  "@tarojs/webpack5-runner": "4.3.2",
  "@types/react": "18.3.31",
  "babel-preset-taro": "4.3.2",
  postcss: "8.5.32",
  react: "18.3.1",
  "react-dom": "18.3.1",
  "react-refresh": "0.14.2",
  webpack: "5.91.0",
};

/** the version a kit's manifest gives a package: its line's, else the product's; undefined for one nothing pins */
export function kitPin(line: Record<string, string>, name: string): string | undefined {
  return line[name] ?? PRODUCT_PINS[name];
}
