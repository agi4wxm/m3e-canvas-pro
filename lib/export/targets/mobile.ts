/* apps/mobile: the design's app for phones, an Expo app on Expo Router. The screens are the React Native printer's
 * (lib/export/rn/print.ts) on the kit (rn/src/kit, copied whole into src/kit), each screen a route of its own (its
 * params in its path), the navigation bar's destinations tabs, an overlay a modal route; the runtime the web app runs on
 * too (packages/app-runtime) holds the session (its tokens in expo-secure-store), the data sources, the forms and the
 * expressions; the API is the shared typed client (packages/api) over fetch, its base URL from the environment or
 * app.json; in development the mocks (packages/mocks) answer it, a scenario chosen in a dev menu. Everything here is
 * generated but src/custom/, written once. docs/手机端.md says how it fits together. */

import { capabilityFiles, docWorldContract, slotFiles, slotNames, slotsOf } from "../appCapabilities";
import rnPackage from "../../../rn/package.json";
import { KIT_FILES } from "../rn/kitFiles.generated";
import { RnPictures, iconsModule, rnDependencies, themeModule } from "../rn/app";
import { formRulesOf, operationsOf } from "../rn/contract";
import { authSource } from "./webSources";
import { rnIconData } from "../rn/icons";
import { printRnScreens, type RnScreen, type RnScreens } from "../rn/print";
import { rnThemeOf } from "../rn/theme";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { darkVarOf } from "../../tokens";
import { focusData } from "../../focus/design";
import { GENERATED, jsonCode, jsonFile, propKey, sortedObject, str } from "../code";
import { kebab } from "../paths";
import { boundaryDifferences } from "../boundary";
import { rnAssetsFile } from "../assets";
import { EXPO_PINS, MOBILE_PACKAGES } from "../../exportPackages";
import { MOBILE_CUSTOM_DIR, MOBILE_FILES_DIR, copiedFile, filledFile, seededFile } from "../copy";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";

/** The Expo packages the app needs beyond the kit's (rn/package.json): the router and what it stands on, the secure
 *  store for the session's tokens, the pickers for uploads, at the Expo line's versions (lib/exportPackages.ts). */
export const MOBILE_PINS: Record<string, string> = Object.fromEntries(MOBILE_PACKAGES.map((name) => [name, EXPO_PINS[name]]));

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

/* ---------- the app's own modules: real files of the kit (rn/src/app), filled in for the design ---------- */

/** the app's own module by its file, as the kit has it */
const app = (file: string) => `${MOBILE_FILES_DIR}/${file}`;

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

/* the app's own tests: it waits for the custom setup, every screen draws, its data comes, a form checks what is entered
   before it sends */
const TEST = (scope: string, screens: RnScreen[], forms: { screen: string; operationId: string; required: boolean }[]) => `${GENERATED}
import { act, fireEvent, render, screen } from "@testing-library/react-native"
import type { ComponentType } from "react"
import { Text } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { RuntimeProvider, type TransportRequest } from ${str(`${scope}/app-runtime`)}
import { createMockTransport } from ${str(`${scope}/mocks`)}
import { AppProvider, NavProvider, ThemeProvider, registerIcons } from "../kit"
import { interpret, reader } from "./effects"
import { icons } from "./icons"
import { AppRoot } from "./root"
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
        <AppProvider reader={reader} interpret={interpret}>
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

/* Expo Router stands outside Jest's reach (its stack is ESM): where taps go is a stand-in here, as it is for the screens */
jest.mock("./routing", () => ({ routerNav: { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() } }))

/* the custom setup, held until the test lets it finish */
let mockFinishSetup: () => void = () => {}
jest.mock("../custom/setup", () => ({
  setup: () =>
    new Promise<void>((resolve) => {
      mockFinishSetup = resolve
    }),
}))

it("starts its runtime on the contract's session", () => {
  expect(runtime.auth).toBeDefined()
})

it("draws its routes only once the custom setup has run (SetupGate)", async () => {
  await render(
    <AppRoot>
      <Text>the routes</Text>
    </AppRoot>,
  )
  expect(screen.queryByText("the routes")).toBeNull()
  await act(async () => mockFinishSetup())
  expect(screen.getByText("the routes")).toBeTruthy()
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
    /* the pictures the design holds as data: files under assets/images, which Metro bundles from src/generated/images.ts */
    const pictures = new RnPictures("assets/images", "../../assets/images");
    /* the capability views are drawn by slots the product writes once (lib/export/appCapabilities.ts) */
    const slots = slotsOf(doc, ctx.widths);
    const capabilities = capabilityFiles(ctx, "mobile");
    const screens = printRnScreens(doc, ctx.widths, { kitImport: "../../kit", runtime: { bind: "../bind" }, images: { from: "../images", name: pictures.name }, assets: { from: "../assets" }, ...(slots.length ? { slots: { from: "../slots", names: slotNames(slots) } } : {}) });
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
    if (pictures.any) files["src/generated/images.ts"] = generated(pictures.module({ requireRule: true }));
    /* the asset pipeline's assets the design names: a lookup from the manifest, never the files (lib/export/assets.ts) */
    const assets = rnAssetsFile(doc, ctx.assets);
    if (assets) files["src/generated/assets.ts"] = generated(assets);
    for (const [path, bytes] of Object.entries(pictures.files)) files[path] = generated(bytes);
    /* what the app does not do as the design says (a part drawn as its atoms or as a placeholder, a binding the kit
       keeps at the design's value): listed beside the screens for the author, as the mini-program lists its own */
    const warnings = [...screens.warnings, ...boundaryDifferences(doc, "mobile", ctx.widths, ctx.assets).map(({ app: _app, ...w }) => w)];
    files["src/generated/warnings.json"] = generated(`${JSON.stringify(warnings, null, 1)}\n`);
    ctx.differences.push(...warnings.map((w) => ({ app: "mobile" as const, ...w })));
    /* a keyboard's and a gamepad's focus as the design has it (lib/focus): the data, for a TV or keyboard adaptor of the
       product's own; the kit draws the ring where the platform moves its focus (docs/焦点与输入.md) */
    const focus = focusData(doc, ctx.widths);
    if (focus) {
      files["src/generated/focus.json"] = generated(`${JSON.stringify(focus, null, 1)}\n`);
      ctx.differences.push({ app: "mobile", kind: "focus", detail: "a keyboard's or a gamepad's focus: the kit draws the ring where the platform moves its focus (Android TV, a keyboard), by the platform's own search; where the design starts it, what cancel runs and where each direction goes are in src/generated/focus.json for an adaptor of the product's own" });
    }

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

    /* the app's own modules: real files of the kit (rn/src/app), copied as they are or filled in for the design
       (lib/export/copy.ts, lib/export/regions.ts) */
    const dark = darkVarOf(doc.vars)?.id;
    files["src/generated/root.tsx"] = generated(await filledFile(ctx, app("root.tsx"), { dark: !!dark }, { vars: jsonCode(screens.vars, 0), hidden: jsonCode(screens.hidden, 0), triggers: jsonCode(screens.triggers, 0), darkVar: str(dark ?? "") }));
    files["src/generated/routing.tsx"] = generated(
      await filledFile(ctx, app("routing.tsx"), {}, {
        routes: routes.map((r) => `  ${propKey(r.key)}: ${jsonCode({ path: r.path, params: r.params, spec: r.spec, ...(r.tab ? { tab: true } : {}), ...(r.overlay ? { overlay: true } : {}), ...(r.auth ? { auth: r.auth } : {}) }, 0)},`).join("\n"),
        initial: str(screens.initial),
        login: login ? str(login) : "undefined",
      }),
    );
    files["src/generated/runtime.ts"] = generated(await filledFile(ctx, app("runtime.ts"), { capabilities: !!capabilities, realtime: !!ctx.doc.api?.channels?.length }, { storageKey: str(`${ctx.name.replace(/[^A-Za-z0-9]/g, "_")}.session`), lang: str(ctx.lang) }));
    Object.assign(files, capabilities?.files ?? {}, slotFiles(scope, slots, "mobile", undefined, { world: docWorldContract(ctx.doc) }));
    files["src/generated/api.ts"] = generated(await copiedFile(ctx, app("api.ts")));
    files["src/generated/contract.ts"] = generated(await filledFile(ctx, app("contract.ts"), {}, { operations: jsonCode(operationsOf(doc.api)), auth: authSource(doc.api ?? {}), forms: jsonCode(formRulesOf(doc)) }));
    files["src/generated/bind.ts"] = generated(await filledFile(ctx, app("bind.ts"), { copies: !!screens.copies }));
    files["src/generated/effects.ts"] = generated(await filledFile(ctx, app("effects.ts"), {}));
    files["src/generated/transport.ts"] = generated(await copiedFile(ctx, app("transport.ts")));
    files["src/generated/files.ts"] = generated(await copiedFile(ctx, app("files.ts")));
    files["src/generated/mocks.ts"] = generated(await copiedFile(ctx, app("mocks.ts")));
    files["src/generated/DevMenu.tsx"] = generated(await copiedFile(ctx, app("DevMenu.tsx")));
    files["src/generated/ScreenRoute.tsx"] = generated(await copiedFile(ctx, app("ScreenRoute.tsx")));
    files["src/generated/env.d.ts"] = generated(await copiedFile(ctx, app("env.d.ts")));
    const rules = formRulesOf(doc);
    const formScreens = screens.screens.flatMap((s) => (s.forms ?? []).slice(0, 1).map((f) => ({ screen: s.component, operationId: f.operationId, required: f.fields.some((x) => rules[f.operationId]?.[x]?.required) })));
    files["src/generated/app.test.tsx"] = generated(TEST(scope, screens.screens, formScreens));

    /* custom code */
    files["src/custom/setup.ts"] = seeded(await seededFile(ctx, `${MOBILE_CUSTOM_DIR}/setup.ts`));
    files["src/custom/Providers.tsx"] = seeded(await seededFile(ctx, `${MOBILE_CUSTOM_DIR}/Providers.tsx`));

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
    files["jest.setup.tsx"] = generated(await copiedFile(ctx, app("jest.setup.tsx")));
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
          dependencies: sortedObject({ ...dependencies, ...MOBILE_PINS, [`${scope}/api`]: "0.1.0", [`${scope}/app-runtime`]: "0.1.0", ...capabilities?.dependency }),
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
