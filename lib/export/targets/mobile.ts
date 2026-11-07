/* apps/mobile: the design's app for phones, an Expo app on Expo Router. The screens are the React Native printer's
 * (lib/export/rn/print.ts) on the kit (rn/src/kit, copied whole into src/kit), each screen a route of its own (its
 * params in its path), the navigation bar's destinations tabs, an overlay a modal route; the runtime the web app runs on
 * too (packages/app-runtime) holds the session (its tokens in expo-secure-store), the data sources, the forms and the
 * expressions; the API is the shared typed client (packages/api) over fetch, its base URL from the environment or
 * app.json; in development the mocks (packages/mocks) answer it, a scenario chosen in a dev menu. Everything here is
 * generated but src/custom/, written once. docs/手机端.md says how it fits together. */

import rnPackage from "../../../rn/package.json";
import { KIT_FILES } from "../rn/kitFiles.generated";
import { iconsModule, rnDependencies, themeModule } from "../rn/app";
import { formRulesOf, operationsOf } from "../rn/contract";
import { authSource } from "./webSources";
import { rnIconData } from "../rn/icons";
import { printRnScreens, type RnScreen, type RnScreens } from "../rn/print";
import { rnThemeOf } from "../rn/theme";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { darkVarOf } from "../../tokens";
import { GENERATED, jsonCode, jsonFile, propKey, sortedObject, str } from "../code";
import { kebab } from "../paths";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";

/** The Expo packages the app needs beyond the kit's (rn/package.json): the router and what it stands on, the secure
 *  store for the session's tokens, the pickers for uploads. Each the version Expo SDK 58's bundledNativeModules.json
 *  names (checked against the npm registry when written here). */
export const MOBILE_PINS: Record<string, string> = {
  "expo-constants": "58.0.15",
  "expo-document-picker": "58.0.4",
  "expo-image-picker": "58.0.10",
  "expo-linking": "58.0.16",
  "expo-router": "58.0.30",
  "expo-secure-store": "58.0.2",
  "react-native-screens": "4.30.1",
};

/** what the app's tests run on, at the kit's versions (rn/package.json) */
const TEST_DEV = ["@testing-library/react-native", "@types/jest", "jest", "jest-expo", "test-renderer"];

/** an Android package name and an iOS bundle id: letters and digits of the product's name */
const appId = (name: string) => `dev.m3ecanvas.${name.replace(/[^a-z0-9]/g, "") || "app"}`;

/* ---------- configuration ---------- */

const BABEL = `${GENERATED}
/* NativeWind compiles \`className\` into styles at build time; Expo's preset does the rest. */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  }
}
`;

const METRO = `${GENERATED}
/* Metro in the monorepo: Expo finds the workspace's root and its node_modules by itself; React, React Native and the web
 * renderer resolve from this app whatever package asks for them (packages/app-runtime, the kit), so there is one copy
 * of each. NativeWind compiles global.css. */
const path = require("node:path")
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const config = getDefaultConfig(__dirname)
const ONE_COPY = ["react", "react-dom", "react-native", "react-native-web"]
const resolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, name, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest
  if (ONE_COPY.some((pkg) => name === pkg || name.startsWith(\`\${pkg}/\`)))
    return resolve({ ...context, originModulePath: path.join(__dirname, "package.json") }, name, platform)
  return resolve(context, name, platform)
}

module.exports = withNativeWind(config, { input: "./global.css" })
`;

const TAILWIND = `${GENERATED}
/* NativeWind reads the classes custom code writes; the kit and the screens are styled from the theme. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
}
`;

const GLOBAL_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const NATIVEWIND_ENV = `${GENERATED}
/// <reference types="nativewind/types" />

/* the stylesheet NativeWind compiles is imported for its effect */
declare module "*.css"
`;

const TSCONFIG = jsonFile({
  compilerOptions: {
    allowJs: true,
    esModuleInterop: true,
    jsx: "react-jsx",
    lib: ["DOM", "ESNext"],
    module: "preserve",
    moduleDetection: "force",
    moduleResolution: "bundler",
    customConditions: ["react-native"],
    noEmit: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    target: "ESNext",
    strict: true,
    types: ["jest", "node"],
  },
  include: ["**/*.ts", "**/*.tsx", "nativewind-env.d.ts"],
  exclude: ["node_modules", "dist", "android", "ios", "*.config.js"],
});

const JEST = `${GENERATED}
/* jest-expo runs the tests the way the app runs on a phone (the iOS preset); React Native Testing Library renders them.
 * The monorepo's packages are TypeScript sources, transformed like the app's own. */
module.exports = {
  preset: "jest-expo/ios",
  setupFiles: ["./jest.setup.tsx"],
  testMatch: ["<rootDir>/src/**/*.test.ts?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|react-native-svg|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets|react-native-screens))",
  ],
}
`;

const JEST_SETUP = `${GENERATED}
/* Reanimated and Worklets have no native side under Jest: their own mocks stand in. */
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"))
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"))

/* the platform's date and time pickers are native views: a stand-in that names what it was asked for */
jest.mock("@react-native-community/datetimepicker", () => {
  const { Text } = jest.requireActual("react-native")
  const Picker = ({ mode }: { mode: string }) => <Text>{\`native \${mode} picker\`}</Text>
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } }
})

/* the device's safe area: the library's own stand-in, with a phone's insets */
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default)

/* the session's tokens: kept in memory */
jest.mock("expo-secure-store", () => {
  const kept = new Map<string, string>()
  return {
    getItemAsync: async (k: string) => kept.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void kept.set(k, v),
    deleteItemAsync: async (k: string) => void kept.delete(k),
  }
})
`;

/* ---------- the app's own modules ---------- */

const RUNTIME = (scope: string, name: string, lang: string) => `${GENERATED}
import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { createRuntime, type TokenStorage } from ${str(`${scope}/app-runtime`)}
import { AUTH } from "./contract"
import { createNativeTransport } from "./transport"

/** where the API is: EXPO_PUBLIC_API_BASE_URL when the app is built, else app.json's extra.apiBaseUrl */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "http://localhost:3001"

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
  transport: createNativeTransport({ baseUrl: API_BASE_URL }),
  auth: AUTH,
  storage: tokenStorage(),
  storageKey: ${str(`${name.replace(/[^A-Za-z0-9]/g, "_")}.session`)},
  lang: ${str(lang)},
})
`;

const API = (scope: string) => `${GENERATED}
import { createApi, type CallInit } from ${str(`${scope}/api`)}
import { OPERATIONS } from "./contract"
import { runtime } from "./runtime"

/** the API as the app calls it: one function per operation (packages/api), over the session's transport */
export const api = createApi(runtime.transport)

/** what a call is given: its parameters by name (path, query, header, as the contract places them) and its body */
export type CallInput = { params?: Record<string, unknown>; body?: unknown }

/** Calls an operation of the contract by its id, as the design names it: its path filled in, the other parameters in its
 *  query or headers, the body as its media type wants it. A 2xx answer's body, or an ApiError. */
export function call<T = unknown>(operationId: string, input: CallInput = {}, init: CallInit = {}): Promise<T> {
  const op = OPERATIONS[operationId]
  if (!op) return Promise.reject(new Error(\`The contract has no operation \${operationId}\`))
  let path = op.path
  const query: Record<string, string | number | boolean> = {}
  const headers: Record<string, string> = { ...init.headers }
  for (const [name, v] of Object.entries(input.params ?? {})) {
    const at = op.params[name] ?? "query"
    if (v === undefined || v === null || v === "") continue
    const value = typeof v === "number" || typeof v === "boolean" ? v : typeof v === "string" ? v : JSON.stringify(v)
    if (at === "path") path = path.split(\`{\${name}}\`).join(encodeURIComponent(String(value)))
    else if (at === "header") headers[name] = String(value)
    else query[name] = value
  }
  if (op.media && input.body !== undefined) headers["content-type"] = op.media
  return api.request<T>({
    operationId,
    method: op.method,
    path,
    ...(Object.keys(query).length ? { query } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
    ...(init.onUploadProgress ? { onUploadProgress: init.onUploadProgress } : {}),
  })
}
`;

const CONTRACT = (scope: string, ops: unknown, auth: string, forms: unknown) => `${GENERATED}
import type { AuthConfig, FieldRule, HttpMethod, ListAt, Paging } from ${str(`${scope}/app-runtime`)}

/** an operation of the contract as the app calls it */
export type Operation = {
  method: HttpMethod
  path: string
  /** where each parameter goes, by name */
  params: Record<string, "path" | "query" | "header">
  /** the request body's media type when it is not JSON */
  media?: string
  /** the status a success answers with */
  status: number
  list?: ListAt
  paging?: Paging
}

/** every operation of the contract (packages/api/openapi.yaml), by its id */
export const OPERATIONS: Record<string, Operation> = ${jsonCode(ops)}

/** what the session needs of the contract: which operations sign in, refresh and sign out, how each one's token rides */
export const AUTH: AuthConfig = ${auth}

/** the rules of the fields of each operation a form of the design sends, from its body's schema */
export const FORMS: Record<string, Record<string, FieldRule>> = ${jsonCode(forms)}
`;

const TRANSPORT = (scope: string) => `${GENERATED}
import { Platform } from "react-native"
import { createFetchTransport, queryString, type Transport, type TransportRequest, type TransportResponse } from ${str(`${scope}/api`)}

/** a file a picker gave (./files): what the transport sends for a file field, as the mocks read one too */
export type PickedFile = { name: string; type: string; size?: number; dataUrl: string; uri?: string }

const isFile = (v: unknown): v is PickedFile => !!v && typeof v === "object" && typeof (v as PickedFile).dataUrl === "string"

const multipart = (r: TransportRequest) => /multipart\\/form-data/i.test(r.headers?.["content-type"] ?? "") && !!r.body && typeof r.body === "object"

/** the headers of an answer, by their names in lower case */
function headersOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\\r?\\n/)) {
    const at = line.indexOf(":")
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return out
}

/** A multipart form sent with XMLHttpRequest, which tells how far the upload has gone: a file field is the file the
 *  picker gave (its uri on a phone, its bytes on the web), any other field its words. */
async function upload(baseUrl: string, r: TransportRequest): Promise<TransportResponse> {
  const form = new FormData()
  for (const [key, value] of Object.entries(r.body as Record<string, unknown>)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one === undefined || one === null) continue
      if (isFile(one)) {
        if (Platform.OS === "web") form.append(key, await (await fetch(one.uri ?? one.dataUrl)).blob(), one.name)
        else form.append(key, { uri: one.uri ?? one.dataUrl, name: one.name, type: one.type } as unknown as Blob)
      } else form.append(key, typeof one === "object" ? JSON.stringify(one) : String(one))
    }
  }
  const search = queryString(r.query)
  const url = \`\${baseUrl.replace(/\\/$/, "")}\${r.path}\${search ? \`?\${search}\` : ""}\`
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(r.method, url)
    xhr.setRequestHeader("accept", "application/json")
    for (const [h, v] of Object.entries(r.headers ?? {})) if (h.toLowerCase() !== "content-type") xhr.setRequestHeader(h, v)
    if (r.onUploadProgress) xhr.upload.onprogress = (e) => r.onUploadProgress?.(e.loaded, e.total)
    xhr.onload = () => {
      const text = xhr.responseText
      let body: unknown = text === "" ? undefined : text
      if (text && /json/i.test(xhr.getResponseHeader("content-type") ?? "")) {
        try {
          body = JSON.parse(text) as unknown
        } catch {
          /* words, then */
        }
      }
      resolve({ status: xhr.status, headers: headersOf(xhr.getAllResponseHeaders()), body })
    }
    xhr.onerror = () => reject(new Error("Network request failed"))
    xhr.send(form)
  })
}

/** The API over React Native's fetch: JSON as JSON, a multipart form (an upload) with its progress. */
export function createNativeTransport(options: { baseUrl: string }): Transport {
  const json = createFetchTransport({ baseUrl: options.baseUrl })
  return { request: (r) => (multipart(r) ? upload(options.baseUrl, r) : json.request(r)) }
}
`;

const FILES = `${GENERATED}
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import type { PickedFile } from "./transport"

/** a file's bytes as a data URL: what the mocks read, and what the web sends */
async function dataUrlOf(uri: string): Promise<{ dataUrl: string; size: number }> {
  const blob = await (await fetch(uri)).blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"))
    reader.readAsDataURL(blob)
  })
  return { dataUrl, size: blob.size }
}

/** Asks for a file the way a phone does: its photos for pictures (the field accepts images only), its files for anything
 *  else. Nothing when the person changes their mind. */
export async function pickFile(accept: string): Promise<PickedFile | undefined> {
  const kinds = accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const images = kinds.length > 0 && kinds.every((k) => /^image\\//.test(k) || /^\\.(png|jpe?g|gif|webp|heic)$/i.test(k))
  if (images) {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 })
    const a = picked.canceled ? undefined : picked.assets[0]
    if (!a) return undefined
    const { dataUrl, size } = await dataUrlOf(a.uri)
    return { name: a.fileName ?? "image.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize ?? size, dataUrl, uri: a.uri }
  }
  const picked = await DocumentPicker.getDocumentAsync({ type: kinds.filter((k) => k.includes("/")).length ? kinds.filter((k) => k.includes("/")) : "*/*", copyToCacheDirectory: true })
  const a = picked.canceled ? undefined : picked.assets[0]
  if (!a) return undefined
  const { dataUrl, size } = await dataUrlOf(a.uri)
  return { name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size ?? size, dataUrl, uri: a.uri }
}

/** the names of the files a field holds, for its upload panel */
export function fileName(v: unknown): string {
  const names = (Array.isArray(v) ? v : [v]).flatMap((f) => (f && typeof f === "object" && typeof (f as PickedFile).name === "string" ? [(f as PickedFile).name] : []))
  return names.join(", ")
}
`;

const BIND = (scope: string) => `${GENERATED}
import { useMemo } from "react"
import { screenParams, sourceKey, useBindings, useDataSource, useForm, useRuntime, type Bindings, type FieldRule, type FormHandle, type ParamSpec, type SourceHandle } from ${str(`${scope}/app-runtime`)}
import { useApp, useNav, type ActionBody, type Here } from "../kit"
import { call } from "./api"
import { FORMS, OPERATIONS } from "./contract"
import { afterSignIn } from "./effects"

/* What a printed screen's bindings stand on (lib/export/rn/print.ts writes the screens): its params, the scope its
 * expressions read, its data sources and its forms, each made of packages/app-runtime's hooks. */

export { keyOf, regionOf, type ParamSpec } from ${str(`${scope}/app-runtime`)}
export { pickFile, fileName } from "./files"

/** a data source of a screen, as the design has it (Frame.data) */
export type SourceDef = { name: string; operationId: string; params?: Record<string, string>; body?: string; load?: "enter" | "demand"; pageSize?: number }

/** a form of a screen, as the design has it (Group.form): its operation, the fields its inputs fill, what it sends
 *  besides, where it goes after */
export type FormDef = {
  id: string
  operationId: string
  fields: string[]
  params?: Record<string, string>
  values?: Record<string, string>
  initial?: Record<string, unknown>
  then?: ActionBody
  catch?: ActionBody
  /** it signs in: once it has, the screen the app was sent from takes the place of where \`then\` goes */
  login?: boolean
}

/** a screen's params: what it was opened with, each as its type has it, the example of each it was not given */
export function useParams(specs: ParamSpec[], given: Record<string, unknown> | undefined): Record<string, unknown> {
  /* the params as words: an equal object is the same params */
  const key = JSON.stringify(given ?? {})
  return useMemo(() => screenParams(specs, JSON.parse(key) as Record<string, unknown>), [specs, key])
}

/** what a screen's expressions read: its params, the variables, the session (\`auth\`) and the time (\`now\`) */
export function useScreenScope(params: Record<string, unknown>): Bindings {
  const app = useApp()
  return useBindings({ params, vars: app.varScope })
}

/** A data source: its operation called with its params (each an expression; a path parameter it does not give is the
 *  screen's param of that name), page after page as the contract pages it. */
export function useSource(def: SourceDef, $: Bindings): SourceHandle {
  const op = OPERATIONS[def.operationId]
  const args: Record<string, unknown> = {}
  for (const [name, at] of Object.entries(op?.params ?? {})) if (at === "path" && !def.params?.[name]) args[name] = $.arg(\`params.\${name}\`)
  for (const [name, e] of Object.entries(def.params ?? {})) {
    const v = $.arg(e)
    if (v !== undefined) args[name] = v
  }
  const body = def.body ? $.ev(def.body) : undefined
  return useDataSource(
    {
      key: sourceKey(def.operationId, body === undefined ? args : { args, body }),
      operation: def.operationId,
      ...(op?.list ? { list: op.list } : {}),
      ...(op?.paging ? { paging: op.paging } : {}),
      ...(def.pageSize ? { pageSize: def.pageSize } : {}),
      args,
      load: ({ page, signal }) => call(def.operationId, { params: { ...args, ...page }, body }, signal ? { signal } : {}),
    },
    { load: def.load ?? "enter" },
  )
}

/** A form: its fields checked by the rules of its operation's body, sent with its params and values, \`then\` or \`catch\`
 *  run after. \`run\` runs an action of the screen (its \`act\`). */
export function useFormFor(def: FormDef, $: Bindings, run: (body: ActionBody | undefined, here: Here) => void): FormHandle {
  const runtime = useRuntime()
  const nav = useNav()
  const fields = useMemo(() => {
    const all = FORMS[def.operationId] ?? {}
    const out: Record<string, FieldRule> = {}
    for (const f of def.fields) if (all[f]) out[f] = all[f]
    return out
  }, [def])
  const scope = $.scope
  return useForm({
    /* kept by the runtime: what is typed stays while the app signs in and comes back */
    id: def.id,
    fields,
    initial: def.initial,
    status: OPERATIONS[def.operationId]?.status,
    send: (body, init) => {
      const params: Record<string, unknown> = {}
      for (const [k, e] of Object.entries(def.params ?? {})) params[k] = $.arg(e)
      return call(def.operationId, { params, body }, init)
    },
    extra: () => Object.fromEntries(Object.entries(def.values ?? {}).map(([k, e]) => [k, $.ev(e)])),
    then: (response, status) => afterSignIn(runtime, def.login ? def.operationId : undefined, def.then, { scope: { ...scope, response, status } }, run, nav),
    catch: (error, status) => run(def.catch, { scope: { ...scope, error, status } }),
  })
}
`;

const EFFECTS = (scope: string) => `${GENERATED}
import { Bindings, evaluate, fillTemplate, type FormHandle, type Runtime, type SourceHandle } from ${str(`${scope}/app-runtime`)}
import type { ActionBody, EffectHandler, Here, Nav, Reader } from "../kit"
import { call } from "./api"
import { AUTH, OPERATIONS } from "./contract"
import { runtime } from "./runtime"

/** the design's expressions, read by the evaluator the preview reads them with (never eval) */
export const reader: Reader = {
  ev: (expr, scope) => evaluate(expr, scope, runtime.ctx()),
  fill: (template, scope) => fillTemplate(template, scope, runtime.ctx()),
}

/** where a sign-in sends the app back to: the screen a guard or a 401 left */
type Back = { key: string; params?: Record<string, unknown> }

/** What follows an answer: \`then\`; after a sign-in, the screen the app was sent to sign in from takes the place of where
 *  \`then\` goes (its effects still run). */
export function afterSignIn(rt: Runtime, signedIn: string | undefined, then: ActionBody | undefined, here: Here, run: (body: ActionBody | undefined, here: Here) => void, nav: Nav) {
  const back = signedIn !== undefined && signedIn === AUTH.login ? rt.takeReturn<Back>() : undefined
  if (!back) return run(then, here)
  run(then ? { ...then, to: "none" } : undefined, here)
  nav.go(back.key, { ...(back.params ? { params: back.params } : {}), replace: true })
}

/** The effects of a tap that are the API's: a call (with its optimistic change, then and catch), loading a data source
 *  again or its next page, submitting a form, signing out. */
export const handleEffect: EffectHandler = (e, { here, screen, nav, run }) => {
  const $ = new Bindings(here.scope ?? {}, runtime.ctx())
  const source = (name: string) => screen.sources?.[name] as SourceHandle | undefined
  switch (e.do) {
    case "call": {
      const op = OPERATIONS[e.operationId]
      if (!op) return
      const params: Record<string, unknown> = {}
      const fields: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(e.args ?? {})) {
        const v = $.ev(x)
        if (v === undefined) continue
        if (k in op.params) params[k] = v
        else fields[k] = v
      }
      const body = e.body !== undefined ? $.ev(e.body) : Object.keys(fields).length ? fields : undefined
      const change = e.optimistic
      const list = change ? source(change.source) : undefined
      const optimistic =
        change && list && here.item !== undefined
          ? () => (change.remove ? list.remove(here.item) : list.patch(here.item, (row) => Object.fromEntries(Object.entries(change.patch ?? {}).map(([k, x]) => [k, $.with({ item: row }).ev(x)]))))
          : undefined
      void runtime.call(() => call(e.operationId, { params, body }), {
        status: op.status,
        ...(optimistic ? { optimistic } : {}),
        then: (response, status) => afterSignIn(runtime, e.operationId, e.then, { ...here, scope: { ...here.scope, response, status } }, run, nav),
        catch: (error, status) => run(e.catch, { ...here, scope: { ...here.scope, error, status } }),
      })
      return
    }
    case "refresh":
      void source(e.source)?.refresh()
      return
    case "loadMore":
      void source(e.source)?.loadMore()
      return
    case "submit": {
      const form = (here.form ?? (e.form ? screen.forms?.[e.form] : undefined)) as FormHandle | undefined
      void form?.submit()
      return
    }
    case "signOut":
      runtime.signOut()
      return
  }
}
`;

type RouteInfo = { key: string; component: string; path: string; params: string[]; tab: boolean; overlay: boolean; auth?: "required" | "login"; spec: { name: string; type?: string; example?: string }[] };

/** the routes of the screens: each a path of its own from its key, its params as segments of it */
function routesOf(screens: RnScreens): RouteInfo[] {
  const taken = new Set<string>(["overlay", "index"]);
  const tabs = new Set(screens.tabs.length >= 2 ? screens.tabs : []);
  return screens.screens.map((s) => {
    let slug = kebab(s.key) || "screen";
    for (let i = 2; taken.has(slug); i++) slug = `${kebab(s.key) || "screen"}-${i}`;
    taken.add(slug);
    const params = (s.params ?? []).map((p) => p.name).filter((n) => /^[A-Za-z][A-Za-z0-9_]*$/.test(n));
    return {
      key: s.key,
      component: s.component,
      path: `/${slug}${params.map((p) => `/[${p}]`).join("")}`,
      params,
      tab: tabs.has(s.key) && !params.length,
      overlay: screens.overlays.includes(s.key),
      ...(s.auth ? { auth: s.auth } : {}),
      spec: (s.params ?? []).map((p) => ({ name: p.name, ...(p.type ? { type: p.type } : {}), ...(p.example !== undefined ? { example: p.example } : {}) })),
    };
  });
}

const ROUTING = (scope: string, routes: RouteInfo[], initial: string, login: string | undefined) => `${GENERATED}
import { router, type Href } from "expo-router"
import { Linking } from "react-native"
import type { ParamSpec } from ${str(`${scope}/app-runtime`)}
import type { Nav } from "../kit"
import { runtime } from "./runtime"

/** a screen's route: its path (its params are segments of it), whether it is a tab, whether a tap opens it over another */
type Route = { path: string; params: string[]; spec: ParamSpec[]; tab?: boolean; overlay?: boolean; auth?: "required" | "login" }

/** every screen of the design, by the key its taps name it by */
export const ROUTES: Record<string, Route> = {
${routes.map((r) => `  ${propKey(r.key)}: ${jsonCode({ path: r.path, params: r.params, spec: r.spec, ...(r.tab ? { tab: true } : {}), ...(r.overlay ? { overlay: true } : {}), ...(r.auth ? { auth: r.auth } : {}) }, 0)},`).join("\n")}
}

/** the screen the app opens on */
export const INITIAL = ${str(initial)}

/** the sign-in screen, where a screen that needs a session and a 401 send the app */
export const LOGIN: string | undefined = ${login ? str(login) : "undefined"}

/** where a screen is, opened with these params (the ones its path holds are filled with their examples when missing) */
export function hrefOf(key: string, params: Record<string, unknown> = {}, overlay = false): Href | undefined {
  const r = ROUTES[key]
  if (!r) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) out[k] = typeof v === "object" ? JSON.stringify(v) : String(v)
  for (const p of r.params) if (!(p in out)) out[p] = String(r.spec.find((s) => s.name === p)?.example ?? "-")
  return { pathname: (overlay ? \`/overlay\${r.path}\` : r.path) as never, params: out }
}

/** the screen on show, to come back to after a sign-in */
let current: { key: string; params?: Record<string, unknown> } | undefined

/** a screen came on show (./ScreenRoute) */
export function seen(screen: { key: string; params?: Record<string, unknown> }) {
  current = screen
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
  back: () => {
    if (router.canGoBack()) router.back()
    else router.replace(hrefOf(INITIAL) ?? "/")
  },
  open: (url) => {
    if (/^https?:\\/\\//i.test(url)) void Linking.openURL(url)
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

`;

const SCREEN_ROUTE = (scope: string) => `${GENERATED}
import { useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useMemo, type ReactNode } from "react"
import { screenParams, useRequireAuth } from ${str(`${scope}/app-runtime`)}
import { OverlayFrame } from "../kit"
import { ROUTES, routerNav, seen, toSignIn } from "./routing"

/** the params an address holds, one value each */
const flat = (given: Record<string, string | string[] | undefined>) => Object.fromEntries(Object.entries(given).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])))

/** A screen as a route: its params read off the address as their types have them, kept as the screen on show, and a
 *  screen that needs a session sending the app to sign in when there is none. */
export function ScreenRoute({ screen, overlay, render }: { screen: string; overlay?: boolean; render: (params: Record<string, unknown>) => ReactNode }) {
  const given = useLocalSearchParams()
  const route = ROUTES[screen]
  /* the address as words: equal params are the same params */
  const key = JSON.stringify(given)
  const params = useMemo(() => screenParams(route?.spec, flat(JSON.parse(key) as Record<string, string | string[] | undefined>)), [route, key])
  useFocusEffect(
    useCallback(() => {
      seen({ key: screen, params })
    }, [screen, params]),
  )
  useRequireAuth(route?.auth === "required", () => toSignIn({ key: screen, params }))
  const body = render(params)
  return overlay ? <OverlayFrame onClose={() => routerNav.back()}>{body}</OverlayFrame> : <>{body}</>
}
`;

const ROOT = (scope: string, vars: unknown, hidden: unknown, dark: string | undefined) => `${GENERATED}
import { useEffect, type ComponentType, type ReactNode } from "react"
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context"
import { RuntimeProvider } from ${str(`${scope}/app-runtime`)}
import { AppProvider, NavProvider, SnackHost, ThemeProvider, registerIcons, ${dark ? "useApp, " : ""}type AppVar } from "../kit"
import { Providers } from "../custom/Providers"
import { setup } from "../custom/setup"
import { handleEffect, reader } from "./effects"
import { icons } from "./icons"
import { routerNav } from "./routing"
import { runtime } from "./runtime"
import { theme } from "./theme"

registerIcons(icons)

/** the design's variables, and the parts hidden until a tap shows them */
const VARS: AppVar[] = ${jsonCode(vars, 0)}
const HIDDEN: string[] = ${jsonCode(hidden, 0)}

/* In development the API answers from the mocks (${scope}/mocks) unless EXPO_PUBLIC_API_MOCKS is "off", and a dev menu
 * picks their scenario; a production build has neither: Metro drops the branch with what it requires. */
let DevMenu: ComponentType | null = null
if (__DEV__ && process.env.EXPO_PUBLIC_API_MOCKS !== "off") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- development only, dropped from a production build
  const mocks = require("./mocks") as typeof import("./mocks")
  mocks.startMocks()
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- development only, dropped from a production build
  DevMenu = (require("./DevMenu") as typeof import("./DevMenu")).DevMenu
}

${
  dark
    ? `/** the theme, dark while the variable that drives the dark mode says so */
function Themed({ children }: { children: ReactNode }) {
  const app = useApp()
  const dark = app.vars[${str(dark)}]
  return <ThemeProvider theme={theme} dark={typeof dark === "boolean" ? dark : undefined}>{children}</ThemeProvider>
}`
    : `/** the theme: light or dark as the device is */
function Themed({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}`
}

/** The app around its routes: the safe area, the runtime (session, data, language), the app's memory (variables, what
 *  taps showed, the snackbar) with the API's effects, the theme, where taps go, the custom providers. */
export function AppRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    void setup()
  }, [])
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <RuntimeProvider runtime={runtime}>
        <AppProvider vars={VARS} hidden={HIDDEN} reader={reader} handle={handleEffect}>
          <Themed>
            <NavProvider value={routerNav}>
              <Providers>{children}</Providers>
              <SnackHost />
              {DevMenu ? <DevMenu /> : null}
            </NavProvider>
          </Themed>
        </AppProvider>
      </RuntimeProvider>
    </SafeAreaProvider>
  )
}
`;

const MOCKS = (scope: string) => `${GENERATED}
import { Platform } from "react-native"
import { createMockTransport, startsSignedIn, type ScenarioName } from ${str(`${scope}/mocks`)}
import { runtime } from "./runtime"

/* Development only (./root requires this behind __DEV__): the API answers from the mocks, the editor preview's own,
 * in the scenario the design chose, the address's ?scenario= on the web, or the one picked in the dev menu. */

let scenario: string | undefined

/** the scenario an address asks for on the web */
function asked(): string | undefined {
  if (Platform.OS !== "web") return undefined
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? ""
  const v = new URLSearchParams(search).get("scenario")
  return v === null ? undefined : v
}

/** Answers the API from the mocks in a scenario ("" for none, left out for the design's own), starting over: no data, no
 *  session but the one the scenario starts with. */
export function startMocks(next: string | undefined = scenario ?? asked()) {
  const transport = createMockTransport(next === undefined ? {} : { scenario: next as ScenarioName | "" })
  scenario = transport.scenario ?? ""
  /* the app's session starts as the mocks' does under the scenario, as the preview's does */
  runtime.setTransport(transport, { presumed: startsSignedIn(scenario) })
}

/** the scenario the mocks answer in now ("" for none) */
export const scenarioNow = () => scenario ?? ""
`;

const DEV_MENU = (scope: string) => `${GENERATED}
import { useState } from "react"
import { Modal, Platform, Pressable, Text, View } from "react-native"
import { SCENARIOS } from ${str(`${scope}/mocks`)}
import { useKit } from "../kit"
import { scenarioNow, startMocks } from "./mocks"

/* Development only (./root requires this behind __DEV__): the scenarios of the mocks, one tap away. */

/** whether the dev menu shows: ?devmenu=off on the web hides it (screenshots) */
const shown = () => {
  if (Platform.OS !== "web") return true
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? ""
  return new URLSearchParams(search).get("devmenu") !== "off"
}

/** a small button in a corner that opens the scenarios of the mocks: one tapped starts the app over in it */
export function DevMenu() {
  const kit = useKit()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(scenarioNow)
  if (!shown()) return null
  const pick = (id: string) => {
    startMocks(id)
    setAt(id)
    setOpen(false)
  }
  const row = (id: string, name: string) => (
    <Pressable key={id || "-"} accessibilityRole="menuitem" onPress={() => pick(id)} style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: id === at ? kit.colors["secondary-container"] : "transparent" }}>
      <Text style={{ color: kit.colors["on-surface"], fontSize: 16 }}>{name}</Text>
    </Pressable>
  )
  return (
    <>
      <Pressable accessibilityLabel="Mocks" testID="dev-menu" onPress={() => setOpen(true)} style={{ position: "absolute", right: 8, bottom: 140, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: kit.colors["inverse-surface"], opacity: 0.7, zIndex: 200 }}>
        <Text style={{ color: kit.colors["inverse-on-surface"], fontSize: 12, fontWeight: "600" }}>{\`mocks · \${SCENARIOS.find((s) => s.id === at)?.name ?? "normal"}\`}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "#00000052", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: kit.colors["surface-container-high"], borderRadius: 16, paddingVertical: 8 }}>
            <Text style={{ color: kit.colors["on-surface-variant"], fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 }}>Scenario of the mocks</Text>
            {row("", "normal")}
            {SCENARIOS.map((s) => row(s.id, s.name || s.id))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
`;

const ENV = `${GENERATED}
/* what the app reads of its environment when it is built (Expo inlines EXPO_PUBLIC_ variables) */
declare namespace NodeJS {
  interface ProcessEnv {
    /** where the API is (default: app.json's extra.apiBaseUrl) */
    readonly EXPO_PUBLIC_API_BASE_URL?: string
    /** development only: "off" calls the real server instead of the mocks */
    readonly EXPO_PUBLIC_API_MOCKS?: string
  }
}
`;

/** a route file: the screen drawn as a route, from where the file is */
function routeFile(r: RouteInfo, depth: number, overlay: boolean): string {
  const up = "../".repeat(depth);
  const render = r.spec.length ? `(params) => <${r.component} params={params} />` : `() => <${r.component} />`;
  return `${GENERATED}
import { ScreenRoute } from ${str(`${up}generated/ScreenRoute`)}
import { ${r.component} } from ${str(`${up}generated/screens/${r.component}`)}

export default function ${r.component}Route() {
  return <ScreenRoute screen=${str(r.key)}${overlay ? " overlay" : ""} render={${render}} />
}
`;
}

const LAYOUT = (routes: RouteInfo[], tabs: boolean) => `${GENERATED}
import "../../global.css"
import { Stack } from "expo-router"
import { AppRoot } from "../generated/root"

/** the app's routes in a stack: the design draws its own bars, so the router draws none; an overlay comes over the
 *  screen it was opened on */
export default function Layout() {
  return (
    <AppRoot>
      <Stack screenOptions={{ headerShown: false }}>
${[...(tabs ? ['        <Stack.Screen name="(tabs)" />'] : []), ...routes.filter((r) => r.overlay).map((r) => `        <Stack.Screen name=${str(`overlay${r.path}`)} options={{ presentation: "transparentModal", animation: "fade" }} />`)].join("\n")}
      </Stack>
    </AppRoot>
  )
}
`;

const TABS_LAYOUT = `${GENERATED}
import { Tabs } from "expo-router"

/** the navigation bar's destinations: each keeps its place while another is on show; the bar is the design's own,
 *  drawn by each screen, so the router draws none */
export default function TabsLayout() {
  return <Tabs tabBar={() => null} screenOptions={{ headerShown: false }} />
}
`;

const INDEX = `${GENERATED}
import { Redirect } from "expo-router"
import { INITIAL, hrefOf } from "../generated/routing"

/** the app opens on the design's first screen */
export default function Index() {
  return <Redirect href={hrefOf(INITIAL) ?? "/"} />
}
`;

/* the app's own tests: every screen draws, its data comes, a form checks what is entered before it sends */
const TEST = (scope: string, screens: RnScreen[], forms: { screen: string; operationId: string; required: boolean }[]) => `${GENERATED}
import { act, fireEvent, render, screen } from "@testing-library/react-native"
import type { ComponentType } from "react"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { RuntimeProvider, type TransportRequest } from ${str(`${scope}/app-runtime`)}
import { createMockTransport } from ${str(`${scope}/mocks`)}
import { AppProvider, NavProvider, ThemeProvider, registerIcons } from "../kit"
import { handleEffect, reader } from "./effects"
import { icons } from "./icons"
import { runtime } from "./runtime"
${screens.map((s) => `import { ${s.component} } from ${str(`./screens/${s.component}`)}`).join("\n")}
import { theme } from "./theme"

registerIcons(icons)

const SCREENS: [string, ComponentType][] = [${screens.map((s) => `[${str(s.key)}, ${s.component}]`).join(", ")}]
/** each screen's first form: what it sends, and whether a field of it must be given */
const FORMS: { screen: ComponentType; operationId: string; required: boolean }[] = [${forms.map((f) => `{ screen: ${f.screen}, operationId: ${str(f.operationId)}, required: ${f.required} }`).join(", ")}]

const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() }

/** the requests the mocks were asked, as the app sent them */
let asked: TransportRequest[] = []

beforeEach(() => {
  asked = []
  const mocks = createMockTransport({ latency: false })
  runtime.setTransport({ request: (r) => (asked.push(r), mocks.request(r)) }, { presumed: true })
})

function draw(Screen: ComponentType) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
      <RuntimeProvider runtime={runtime}>
        <AppProvider reader={reader} handle={handleEffect}>
          <ThemeProvider theme={theme} dark={false}>
            <NavProvider value={nav}>
              <Screen />
            </NavProvider>
          </ThemeProvider>
        </AppProvider>
      </RuntimeProvider>
    </SafeAreaProvider>,
  )
}

/** lets the mocks answer and the screen draw what they said */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)))

it("starts its runtime on the contract's session", () => {
  expect(runtime.auth).toBeDefined()
})

if (SCREENS.length) describe("the screens", () => {
  it.each(SCREENS)("draw %s with the mocks answering", async (_key, Screen) => {
    await draw(Screen)
    await settle()
    expect(screen.toJSON()).toBeTruthy()
  })

  it("load their data sources: none is left loading", async () => {
    for (const [, Screen] of SCREENS) await (await draw(Screen)).unmount()
    await settle()
    for (const s of Object.values(runtime.sources.store.get())) expect(s.loading).toBe(false)
  })
})

/* a design without forms has none to check: Jest wants a table that is not empty */
if (FORMS.length) describe("the forms", () => {
  it.each(FORMS.map((f) => [f.operationId, f] as const))("check what is entered before %s is sent", async (operationId, f) => {
    await draw(f.screen)
    await settle()
    const submit = screen.queryAllByTestId(/^submit:/)[0]
    if (!submit) return
    await fireEvent.press(submit)
    await settle()
    const sent = asked.filter((r) => r.operationId === operationId)
    /* nothing typed: a form with a field that must be given sends nothing, and says what is missing */
    if (f.required) {
      expect(sent).toHaveLength(0)
      expect(screen.queryAllByText(/./).length).toBeGreaterThan(0)
    } else expect(sent.length).toBeLessThanOrEqual(1)
  })
})
`;

const CUSTOM_SETUP = `/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. setup() runs as the app starts: start an SDK
 * (analytics, payments, push), or answer the API another way:
 *   import { runtime } from "../generated/runtime";
 *   runtime.setTransport(myTransport);
 * In development the mocks answer the API; @scope/mocks/native (startNative)
 * serves them through MSW instead.
 */
export async function setup(): Promise<void> {}
`;

const CUSTOM_PROVIDERS = `import type { ReactNode } from "react";

/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. Providers wraps the whole app: put the providers of
 * third-party SDKs here.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
`;

const README = (scope: string) => `# ${scope}/mobile

The phone app of the design: Expo (SDK 58), Expo Router, React Native and the design's own component kit. Generated
code is in \`src/generated/\`, \`src/app/\` (the routes) and \`src/kit/\`; \`src/custom/\` is yours. See AGENTS.md.

\`\`\`bash
npm run start -w apps/mobile          # Expo: a phone with Expo Go, an emulator, or the web
npm run web -w apps/mobile
npm run typecheck -w apps/mobile
npm test -w apps/mobile
npm run export:android -w apps/mobile # Metro bundles the app for Android
\`\`\`

In development the API answers from the mocks; a small button in a corner picks their scenario (on the web,
\`?scenario=new-user\` too). \`EXPO_PUBLIC_API_MOCKS=off\` calls the server at \`EXPO_PUBLIC_API_BASE_URL\` (default:
\`extra.apiBaseUrl\` in app.json). A production build has no mocks.

由设计生成的手机应用（Expo、Expo Router）。\`src/generated/\`、\`src/app/\`、\`src/kit/\` 是生成的代码，\`src/custom/\` 是自定义代码的位置。
开发时接口由模拟库回答，角落里的小按钮切换场景；\`EXPO_PUBLIC_API_MOCKS=off\` 请求真实后端。
`;

const AGENTS = (scope: string) => `## The mobile app (apps/mobile)

\`${scope}/mobile\` is an Expo app on Expo Router, generated from the design: \`src/app/\` holds a route per screen (a
screen's params are segments of its path; the navigation bar's destinations are tabs; a screen a tap opens over another
is a modal route), \`src/generated/screens/\` the screens printed on the design's own component kit (\`src/kit/\`, copied
whole), \`src/generated/\` the rest: the runtime (\`runtime.ts\`: \`${scope}/app-runtime\` with the session's tokens in
expo-secure-store and fetch to \`EXPO_PUBLIC_API_BASE_URL\`), the API by operation id (\`api.ts\`), the contract's data
(\`contract.ts\`), the bindings' hooks (\`bind.ts\`), the API's effects (\`effects.ts\`), uploads (\`files.ts\`,
\`transport.ts\`) and the mocks with their dev menu (\`mocks.ts\`, development only). **Never edit any of it**: change the
design and export again.

- Custom code goes in \`src/custom/\`: \`setup.ts\` (runs as the app starts: SDKs, \`runtime.setTransport(…)\`) and
  \`Providers.tsx\` (wraps the app: third-party providers). New files of your own beside them are yours too.
- Read the session or call the API from custom code with \`useSession()\` / \`useRuntime()\` (\`${scope}/app-runtime\`) and
  \`api\` (\`src/generated/api.ts\`).
- Check with \`npm run typecheck -w apps/mobile\`, \`npm test -w apps/mobile\` and \`npm run export:android -w apps/mobile\`.
`;

/** apps/mobile, the design's app for phones (see the top of this file) */
export const mobileTarget: ProductTarget = {
  id: "mobile",
  async build(ctx: ProductContext): Promise<Workspace> {
    const { doc, scope } = ctx;
    const screens = printRnScreens(doc, ctx.widths, { kitImport: "../../kit", runtime: { bind: "../bind" } });
    const theme = rnThemeOf(doc);
    const iconData = await rnIconData([theme.icons], [...screens.icons, ...KIT_ICONS]);
    for (const [id, markup] of Object.entries(doc.icons ?? {})) {
      const box = /viewBox="([\d.\s-]+)"/.exec(markup)?.[1]?.trim().split(/\s+/).map(Number);
      const body = markup.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      iconData.glyphs[`m3e-doc:${id}`] = [body, box?.[2] ?? 24, box?.[3] ?? 24];
    }
    const files: ProductFiles = {};
    for (const path of KIT_FILES) files[`src/kit/${path}`] = generated(await ctx.read(`rn/src/kit/${path}`));
    files["src/generated/theme.ts"] = generated(themeModule(theme, "../kit"));
    files["src/generated/icons.ts"] = generated(iconsModule(iconData, "../kit"));
    for (const s of screens.screens) files[`src/generated/screens/${s.component}.tsx`] = generated(s.source);
    /* what the app does not do as the design says (a part drawn as its atoms or as a placeholder, a binding the kit
       keeps at the design's value): listed beside the screens for the author, as the mini-program lists its own */
    files["src/generated/warnings.json"] = generated(`${JSON.stringify(screens.warnings, null, 1)}\n`);
    ctx.differences.push(...screens.warnings.map((w) => ({ app: "mobile" as const, ...w })));

    /* the routes */
    const routes = routesOf(screens);
    const login = screens.screens.find((s) => s.auth === "login")?.key;
    const tabs = routes.some((r) => r.tab);
    files["src/app/_layout.tsx"] = generated(LAYOUT(routes, tabs));
    files["src/app/index.tsx"] = generated(INDEX);
    if (tabs) files["src/app/(tabs)/_layout.tsx"] = generated(TABS_LAYOUT);
    for (const r of routes) {
      const at = r.tab ? `(tabs)${r.path}` : r.path.slice(1);
      files[`src/app/${at}.tsx`] = generated(routeFile(r, at.split("/").length, false));
      if (r.overlay) files[`src/app/overlay${r.path}.tsx`] = generated(routeFile(r, `overlay${r.path}`.split("/").length, true));
    }

    /* the app's own modules */
    const dark = darkVarOf(doc.vars)?.id;
    files["src/generated/root.tsx"] = generated(ROOT(scope, screens.vars, screens.hidden, dark));
    files["src/generated/routing.tsx"] = generated(ROUTING(scope, routes, screens.initial, login));
    files["src/generated/runtime.ts"] = generated(RUNTIME(scope, ctx.name, ctx.lang));
    files["src/generated/api.ts"] = generated(API(scope));
    files["src/generated/contract.ts"] = generated(CONTRACT(scope, operationsOf(doc.api), authSource(doc.api ?? {}), formRulesOf(doc)));
    files["src/generated/bind.ts"] = generated(BIND(scope));
    files["src/generated/effects.ts"] = generated(EFFECTS(scope));
    files["src/generated/transport.ts"] = generated(TRANSPORT(scope));
    files["src/generated/files.ts"] = generated(FILES);
    files["src/generated/mocks.ts"] = generated(MOCKS(scope));
    files["src/generated/DevMenu.tsx"] = generated(DEV_MENU(scope));
    files["src/generated/ScreenRoute.tsx"] = generated(SCREEN_ROUTE(scope));
    files["src/generated/env.d.ts"] = generated(ENV);
    const rules = formRulesOf(doc);
    const formScreens = screens.screens.flatMap((s) => (s.forms ?? []).slice(0, 1).map((f) => ({ screen: s.component, operationId: f.operationId, required: f.fields.some((x) => rules[f.operationId]?.[x]?.required) })));
    files["src/generated/app.test.tsx"] = generated(TEST(scope, screens.screens, formScreens));

    /* custom code */
    files["src/custom/setup.ts"] = seeded(CUSTOM_SETUP.replace("@scope/mocks/native", `${scope}/mocks/native`));
    files["src/custom/Providers.tsx"] = seeded(CUSTOM_PROVIDERS);

    /* configuration */
    files["app.json"] = generated(
      jsonFile({
        expo: {
          name: ctx.title,
          slug: ctx.name,
          scheme: ctx.name,
          version: "0.1.0",
          orientation: "portrait",
          userInterfaceStyle: "automatic",
          platforms: ["ios", "android", "web"],
          web: { bundler: "metro", output: "single" },
          /* every route in the one bundle, on the web as on a phone: lazy routes name their chunks by their file, and two screens with the same param (item/[id], photo/[id]) would share one */
          plugins: [["expo-router", { asyncRoutes: false }]],
          android: { package: appId(ctx.name) },
          ios: { bundleIdentifier: appId(ctx.name) },
          extra: { apiBaseUrl: "http://localhost:3001" },
        },
      }),
    );
    files["babel.config.js"] = generated(BABEL);
    files["metro.config.js"] = generated(METRO);
    files["tailwind.config.js"] = generated(TAILWIND);
    files["global.css"] = generated(GLOBAL_CSS);
    files["nativewind-env.d.ts"] = generated(NATIVEWIND_ENV);
    files["tsconfig.json"] = generated(TSCONFIG);
    files["jest.config.js"] = generated(JEST);
    files["jest.setup.tsx"] = generated(JEST_SETUP);
    files["README.md"] = generated(README(scope));

    const { dependencies } = rnDependencies();
    const dev = rnPackage.devDependencies as Record<string, string>;
    files["package.json"] = {
      ...generated(
        jsonFile({
          name: `${scope}/mobile`,
          version: "0.1.0",
          private: true,
          main: "expo-router/entry",
          scripts: {
            start: "expo start",
            android: "expo start --android",
            ios: "expo start --ios",
            web: "expo start --web",
            typecheck: "tsc --noEmit -p .",
            test: "jest",
            "export:web": "expo export --platform web --output-dir dist/web",
            "export:android": "expo export --platform android --output-dir dist/android",
          },
          dependencies: sortedObject({ ...dependencies, ...MOBILE_PINS, [`${scope}/api`]: "0.1.0", [`${scope}/app-runtime`]: "0.1.0" }),
          devDependencies: sortedObject({
            ...Object.fromEntries(TEST_DEV.filter((d) => dev[d]).map((d) => [d, dev[d]])),
            "@types/node": ctx.version("@types/node"),
            "@types/react": ctx.version("@types/react"),
            tailwindcss: dev.tailwindcss,
            typescript: ctx.version("typescript"),
            [`${scope}/mocks`]: "0.1.0",
          }),
        }),
      ),
      merge: "package.json",
    };
    return {
      dir: "apps/mobile",
      pkg: `${scope}/mobile`,
      scripts: { typecheck: true, test: true },
      files,
      summary: { zh: "手机应用（Expo、Expo Router、React Native），屏幕、路由、主题由设计生成", en: "the phone app (Expo, Expo Router, React Native): screens, routes and theme from the design" },
      agents: AGENTS(scope),
    };
  },
};
