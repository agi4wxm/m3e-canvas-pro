/* apps/miniapp: the design's mini-program, a Taro (React) app built for WeChat (weapp), Douyin (tt) and the web (H5)
 * from the same design and the same shared runtime (packages/app-runtime) as the web and React Native apps. One page
 * per screen (src/pages/<screen>/index: a thin entry over src/generated/screens), the kit it is drawn with copied into
 * src/kit (miniapp-kit/src/kit), the theme as CSS variables (src/generated/theme.css), the calls over the typed client
 * (packages/api) through a Taro.request transport, tokens in Taro's storage, and the mocks (packages/mocks) answering in
 * development only. src/custom is the custom code's. docs/小程序.md says all of it. */

import { capabilityFiles, slotFiles, slotNames, slotsOf } from "../appCapabilities";
import miniPackage from "../../../miniapp-kit/package.json";
import { str } from "../../../parts/print";
import { fromBase64 } from "../../mocks/bytes";
import { styleContext } from "../../styles";
import { normalizeTheme } from "../../tokens";
import { GENERATED, jsonFile, sortedObject } from "../code";
import { specOf } from "./mocks";
import { authSource } from "./webSources";
import { MINIAPP_KIT_DIR, MINIAPP_KIT_FILES, kitFileFor } from "../miniapp/kitFiles";
import { callsModule, iconsModule, pageConfig, pageModule, printMiniApp, screensIndex, specModule, tabBarModule, themeModule } from "../miniapp/app";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";
import { boundaryDifferences } from "../boundary";

/** the packages the app is built with, at the versions the kit is built and checked with (miniapp-kit/package.json) */
export function miniappDependencies(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  const dev = miniPackage.devDependencies as Record<string, string>;
  const keep = ["@babel/core", "@babel/preset-react", "@pmmmwh/react-refresh-webpack-plugin", "@tarojs/cli", "@tarojs/taro-loader", "@tarojs/webpack5-runner", "@types/react", "babel-preset-taro", "postcss", "react-refresh", "webpack"];
  return { dependencies: { ...(miniPackage.dependencies as Record<string, string>) }, devDependencies: Object.fromEntries(keep.filter((k) => dev[k]).map((k) => [k, dev[k]])) };
}

const CONFIG = `${GENERATED}
/* Taro: React 18 on the webpack 5 runner, for WeChat (weapp), Douyin (tt) and the web (h5), each built into
   dist/<platform>. Sizes stay px, one per point of the design: the px-to-rpx transform is off (docs/小程序.md). */
import path from "node:path"
import { defineConfig, type UserConfigExport } from "@tarojs/cli"

/* the app's own React (18, Taro's), whichever folder of the monorepo npm put it in */
const own = (pkg: string) => path.dirname(require.resolve(\`\${pkg}/package.json\`, { paths: [__dirname] }))

/* the product's packages (the client, the runtime, the mocks) are TypeScript sources: compiled with the app's */
const packages = [path.resolve(__dirname, "../../../packages")]

/* what the app reads of the environment, fixed when it is built */
const env = (name: string) => JSON.stringify(process.env[name] ?? "")

/* Packages are looked for up the folders from where they are asked for, as Node does, and then in the app's own
   node_modules: npm keeps there the packages that want React 18, which Taro's packages at the monorepo's root ask for */
type Modules = { clear: () => Modules; add: (dir: string) => Modules }
const resolveOwn = (chain: { resolve: { modules: Modules } }) => {
  chain.resolve.modules.clear().add("node_modules").add(path.resolve(__dirname, "../node_modules"))
}

export default defineConfig<"webpack5">(async (merge: <T>(...configs: T[]) => T) => {
  const base: UserConfigExport<"webpack5"> = {
    projectName: "miniapp",
    designWidth: 375,
    deviceRatio: { 375: 2, 750: 1 },
    sourceRoot: "src",
    outputRoot: \`dist/\${process.env.TARO_ENV}\`,
    framework: "react",
    /* no prebundling of node_modules in development: the monorepo keeps React 18 apart from the root, which the
       prebundler cannot follow */
    compiler: { type: "webpack5", prebundle: { enable: false } },
    cache: { enable: false },
    /* one copy of what holds the app's state: React, and the web's router (npm may keep a second one inside Taro's) */
    alias: { react: own("react"), "react-dom": own("react-dom"), "@tarojs/router": own("@tarojs/router") },
    defineConstants: {
      "process.env.TARO_APP_API_BASE_URL": env("TARO_APP_API_BASE_URL"),
      "process.env.TARO_APP_API_MOCKS": env("TARO_APP_API_MOCKS"),
      "process.env.TARO_APP_MOCK_SCENARIO": env("TARO_APP_MOCK_SCENARIO"),
      "process.env.TARO_APP_REALTIME_URL": env("TARO_APP_REALTIME_URL"),
    },
    mini: {
      compile: { include: packages },
      postcss: { pxtransform: { enable: false }, cssModules: { enable: false } },
      webpackChain: resolveOwn,
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      router: { mode: "hash" },
      /* npm run dev:h5 serves the app here (H5_PORT picks another port), its /api passed on to the server (API_TARGET) */
      devServer: {
        host: "127.0.0.1",
        port: Number(process.env.H5_PORT || 10086),
        proxy: { "/api": { target: process.env.API_TARGET || "http://127.0.0.1:3001", changeOrigin: true, pathRewrite: { "^/api": "" } } },
      },
      compile: { include: packages },
      postcss: { pxtransform: { enable: false }, autoprefixer: { enable: true }, cssModules: { enable: false } },
      webpackChain: resolveOwn,
    },
  }
  return merge({}, base, {})
})
`;

const BABEL = `${GENERATED}
module.exports = {
  presets: [["taro", { framework: "react", ts: true, compiler: "webpack5" }]],
}
`;

const GLOBAL_TYPES = `${GENERATED}
/// <reference types="@tarojs/taro" />

declare module "*.css"
declare module "*.png"

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production"
    /** the platform being built: weapp (WeChat), tt (Douyin) or h5 */
    TARO_ENV: "weapp" | "tt" | "h5" | "swan" | "alipay" | "qq" | "jd" | "rn" | "harmony"
    /** where the API is (a mini-program asks only https addresses its admin allowed) */
    TARO_APP_API_BASE_URL: string
    /** development only: "off" calls the real server instead of the mocks */
    TARO_APP_API_MOCKS: string
    /** development only: the mocks' scenario to start in */
    TARO_APP_MOCK_SCENARIO: string
    /** where the realtime channels are (a mini-program connects only to wss addresses its admin allowed) */
    TARO_APP_REALTIME_URL: string
  }
}
`;

const INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta content="text/html; charset=utf-8" http-equiv="Content-Type">
  <meta content="width=device-width,initial-scale=1,user-scalable=no" name="viewport">
  <meta name="format-detection" content="telephone=no,address=no">
  <title></title>
  <script><%= htmlWebpackPlugin.options.script %></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>
`;

const APP_ENTRY = `${GENERATED}
import type { PropsWithChildren } from "react"
import "./app.css"

/** The app: every page draws its screen inside the app's providers (src/generated/root.tsx), once the custom setup
 *  (src/custom/setup.ts) has run; the first page's starts it, as the mini-program starts. */
export default function App({ children }: PropsWithChildren) {
  return children
}
`;

const APP_CSS = `/* Generated by M3E Canvas. Do not edit: the next export rewrites this file (see AGENTS.md). */
@import "./kit/kit.css";
@import "./generated/theme.css";
`;

const ROOT = (scope: string, dark: boolean | undefined) => `${GENERATED}
import type { ReactNode } from "react"
import { RuntimeProvider, SetupGate } from ${str(`${scope}/app-runtime`)}
import { AppSpecProvider, ThemeProvider, registerIcons } from "../kit"
import { Providers } from "../custom/Providers"
import { setup } from "../custom/setup"
import { icons } from "./icons"
import { runtime } from "./runtime"
import { SCREENS } from "./screens"
import { SPEC } from "./spec"
import { theme } from "./theme"

registerIcons(icons)

/** The app's providers around a page: the shared runtime, the app's spec, the theme (${dark === undefined ? "light or dark as the device is" : dark ? "dark, as the design is" : "light, as the design is"}), and the custom code's.
 *  The page is drawn once the custom setup has run (SetupGate: once for the app, nothing before; a setup that fails is
 *  reported and the app drawn all the same), as the web app and the mobile app draw theirs. */
export function Root({ children }: { children?: ReactNode }) {
  return (
    <RuntimeProvider runtime={runtime}>
      <AppSpecProvider spec={SPEC} components={SCREENS}>
        <ThemeProvider theme={theme}${dark === undefined ? "" : ` dark={${dark}}`}>
          <SetupGate setup={setup}>
            <Providers>{children}</Providers>
          </SetupGate>
        </ThemeProvider>
      </AppSpecProvider>
    </RuntimeProvider>
  )
}
`;

const RUNTIME = (ctx: ProductContext, auth: string, capabilities = false, realtime = !!ctx.doc.api?.channels?.length) => `${GENERATED}
import { createRuntime, type AuthConfig } from ${str(`${ctx.scope}/app-runtime`)}
${realtime ? `import { CHANNELS, REALTIME_URL, withRealtime } from ${str(`${ctx.scope}/api`)}\n` : ""}import { createTaroTransport, ${realtime ? "taroSocket, " : ""}taroStorage } from "../kit"
${capabilities ? 'import { registry } from "./capabilities"\n' : ""}
/** where the API is: TARO_APP_API_BASE_URL when the app is built, else the server on this computer (on the web its
 *  /api, which the dev server passes on to it, as the web app's does). A mini-program asks only https addresses its
 *  admin put on the request domain list (AGENTS.md). */
export const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || (process.env.TARO_ENV === "h5" ? "/api" : "http://127.0.0.1:3001")

/** what the session needs of the contract */
const AUTH: AuthConfig = ${auth}
${realtime ? `
/** where the realtime channels are: TARO_APP_REALTIME_URL when the app is built, else the contract's dev server's (a
 *  mini-program connects only to wss addresses on its socket domain list); in development the mocks answer them */
const REALTIME = process.env.TARO_APP_REALTIME_URL || REALTIME_URL
` : ""}
/** the shared runtime: the session (its tokens in Taro's storage), the data, the calls, the language */
export const runtime = createRuntime({
  transport: ${realtime ? "withRealtime(createTaroTransport({ baseUrl: API_BASE_URL }), { url: REALTIME, channels: CHANNELS, open: taroSocket })" : "createTaroTransport({ baseUrl: API_BASE_URL })"},
  auth: AUTH,
  storage: taroStorage,
  storageKey: ${str(`${ctx.name}:session`)},
  lang: ${str(ctx.lang)},
${capabilities ? "  capabilities: registry,\n" : ""}})

/* Development only: the API answers from the mocks (${ctx.scope}/mocks) unless TARO_APP_API_MOCKS is "off". A
   production build has none of it: the branch is dropped with the module it reads. */
if (process.env.NODE_ENV !== "production" && process.env.TARO_APP_API_MOCKS !== "off") {
  const { startMocks } = require("./mocks") as typeof import("./mocks")
  startMocks(runtime)
}
`;

const MOCKS = (scope: string) => `${GENERATED}
import { createMockTransport, startsSignedIn, type ScenarioName } from ${str(`${scope}/mocks`)}
import type { Runtime } from ${str(`${scope}/app-runtime`)}
import { withFileData } from "../kit"

/** the scenario asked for: on the web ?scenario= in the page's address (?scenario=new-user), else TARO_APP_MOCK_SCENARIO */
function asked(): string | undefined {
  if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
    const m = /[?&]scenario=([\\w-]*)/.exec(window.location.search + window.location.hash)
    if (m) return m[1]
  }
  return process.env.TARO_APP_MOCK_SCENARIO || undefined
}

/** Development only (runtime.ts reads this behind process.env.NODE_ENV): the API answers from the mocks, the same the
 *  design editor's preview answers from, signed in as their session starts. A file the platform handed over is read
 *  into the data URL the mocks take. On the web, \`m3eMocks.start("network-error")\` plays another scenario. */
export function startMocks(runtime: Runtime) {
  const scenario = asked()
  const mock = createMockTransport(scenario !== undefined ? { scenario: scenario as ScenarioName } : {})
  const start = (id?: string) => {
    if (id !== undefined) mock.setScenario(id || undefined)
    runtime.setTransport(withFileData(mock), { presumed: startsSignedIn(mock.scenario) })
  }
  start()
  if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") (window as unknown as { m3eMocks: { start: typeof start } }).m3eMocks = { start }
}
`;

const CUSTOM_SETUP = `/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. setup() runs once as the mini-program starts: start an
 * SDK (analytics, payments, push), or change how the API is called
 * (runtime.setTransport, with runtime from ../generated/runtime).
 */
export async function setup(): Promise<void> {}
`;

const CUSTOM_PROVIDERS = `import type { ReactNode } from "react";

/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. Providers wraps every page: put the providers of
 * third-party SDKs here.
 */
export function Providers({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
`;

const TSCONFIG = jsonFile({
  extends: "../../tsconfig.base.json",
  compilerOptions: {
    lib: ["ES2022", "DOM"],
    jsx: "react-jsx",
    /* Taro's config runs in Node; the app reads process.env, which the build fixes */
    types: ["node"],
    /* React 18 is this app's (Taro's); the other apps have React 19: every import of react reads this app's types */
    paths: { react: ["./node_modules/@types/react", "../../node_modules/@types/react"], "react/*": ["./node_modules/@types/react/*", "../../node_modules/@types/react/*"] },
  },
  include: ["src", "types", "config"],
});

const README = (scope: string) => `# ${scope}/miniapp

The mini-program of the design: Taro (React) for WeChat (weapp), Douyin (tt) and the web (H5).
\`src/generated/\`, \`src/kit/\`, \`src/pages/\` and the config are rewritten by every export; \`src/custom/\`,
\`project.config.json\` and \`project.tt.json\` are yours. See the root README and AGENTS.md.

由设计生成的小程序（Taro：微信、抖音、H5）。\`src/generated/\`、\`src/kit/\`、\`src/pages/\` 和配置每次导出都会重写，
\`src/custom/\`、\`project.config.json\`、\`project.tt.json\` 是自定义的。

\`\`\`bash
npm run dev:weapp    # dist/weapp，用微信开发者工具打开
npm run dev:tt       # dist/tt，用抖音开发者工具打开
npm run dev:h5       # dist/h5，浏览器
npm run build        # 三个平台的生产构建
\`\`\`
`;

const AGENTS = `## The mini-program (apps/miniapp)

A Taro 4 (React 18) app built for WeChat (\`npm run build:weapp\` → \`dist/weapp\`), Douyin (\`build:tt\` → \`dist/tt\`) and
the web (\`build:h5\` → \`dist/h5\`); \`dev:weapp\`, \`dev:tt\`, \`dev:h5\` rebuild as files change. One page per screen
(\`src/pages/<screen>/index\`), drawn by \`src/generated/screens\` on the kit in \`src/kit\` (both generated: never edit).

- **Open it**: in 微信开发者工具 import the folder \`apps/miniapp\` (\`project.config.json\` points it at \`dist/weapp\`); in
  抖音开发者工具 open \`apps/miniapp/dist/tt\` (built from \`project.tt.json\`). Run \`npm run dev:weapp\` / \`dev:tt\` first.
- **AppID**: \`project.config.json\` and \`project.tt.json\` are custom files (the export writes them once): put the real
  AppID in place of \`touristappid\` there.
- **The API**: calls go through \`Taro.request\` (files through \`Taro.uploadFile\`) to \`TARO_APP_API_BASE_URL\` (set it
  when building: \`TARO_APP_API_BASE_URL=https://api.example.com npm run build:weapp\`). Unset, it is the server on this
  computer (\`http://127.0.0.1:3001\`); on H5 it is \`/api\`, which \`dev:h5\` passes on to \`API_TARGET\` (that server by
  default) and which whatever serves a production H5 build must pass on too, as for the web app. A mini-program only calls
  **https** addresses on its **request domain list** (服务器域名: request 合法域名, uploadFile 合法域名) set in the
  WeChat and Douyin admin consoles; in the developer tools, "不校验合法域名" allows a local server while developing.
- **Mocks**: a development build answers from \`packages/mocks\` unless \`TARO_APP_API_MOCKS=off\`;
  \`TARO_APP_MOCK_SCENARIO=new-user\` picks a scenario (on H5 also \`?scenario=new-user\` in the address). A production build has no mocks.
- **Custom code** goes in \`src/custom/setup.ts\` (runs once at start) and \`src/custom/Providers.tsx\` (wraps every page).
  Third-party mini-program SDKs (payments: \`Taro.requestPayment\`, maps, push) are called from there or from a component
  of your own under \`src/custom/\`.
`;

export const miniappTarget: ProductTarget = {
  id: "miniapp",
  async build(ctx: ProductContext): Promise<Workspace> {
    const images: Record<string, string> = {};
    const image = (data: string) => {
      const m = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.exec(data);
      if (!m) return "";
      const ext = m[1] === "svg+xml" ? "svg" : m[1] === "jpeg" ? "jpg" : m[1];
      const name = `assets/image${Object.keys(images).length + 1}.${ext}`;
      const seen = Object.entries(images).find(([, d]) => d === data)?.[0];
      if (seen) return `/${seen}`;
      images[name] = data;
      return `/${name}`;
    };
    /* the capability views are drawn by slots the product writes once (lib/export/appCapabilities.ts) */
    const slots = slotsOf(ctx.doc, ctx.widths);
    const capabilities = capabilityFiles(ctx, "miniapp");
    const app = await printMiniApp(ctx.doc, ctx.widths, { kitImport: "../../kit", runtimeImport: `${ctx.scope}/app-runtime`, callsImport: "../calls", image, ...(slots.length ? { slots: { from: "../slots", names: slotNames(slots) } } : {}) });
    const { printed } = app;
    /* the design's mode, as the web app has it: light or dark, or the device's when the design is drawn in both */
    const look = normalizeTheme(ctx.doc.theme, styleContext(ctx.doc.styles));
    const dark = look.bothModes ? undefined : look.dark;
    const files: ProductFiles = {};
    /* what the mini-program does not do as the design says (a part drawn as its atoms or as a placeholder, a tap not
       printed): listed beside the screens for the author, as the React Native printer lists its own */
    const warnings = [...printed.warnings, ...boundaryDifferences(ctx.doc, "miniapp", ctx.widths).map(({ app: _app, ...w }) => w)];
    files["src/generated/warnings.json"] = generated(`${JSON.stringify(warnings, null, 1)}\n`);
    ctx.differences.push(...warnings.map((w) => ({ app: "miniapp" as const, ...w })));
    for (const path of MINIAPP_KIT_FILES) files[`src/kit/${path}`] = generated(kitFileFor(await ctx.read(`${MINIAPP_KIT_DIR}/${path}`), `${ctx.scope}/app-runtime`));
    for (const s of printed.screens) {
      files[`src/generated/screens/${s.component}.tsx`] = generated(s.source);
      files[`src/${s.path}.tsx`] = generated(pageModule(s.component, { rootFrom: "../../generated/root", screenFrom: `../../generated/screens/${s.component}` }));
      files[`src/${s.path}.config.ts`] = generated(pageConfig(s, dark === true));
    }
    files["src/generated/screens/index.ts"] = generated(screensIndex(printed));
    files["src/generated/theme.ts"] = generated(themeModule(app.theme, "../kit"));
    files["src/generated/theme.css"] = generated(app.css);
    files["src/generated/icons.ts"] = generated(iconsModule(app.icons, "../kit"));
    files["src/generated/calls.ts"] = generated(callsModule(ctx.api, { apiImport: `${ctx.scope}/api`, kitImport: "../kit", runtimeFrom: "./runtime" }));
    files["src/generated/spec.ts"] = generated(specModule(ctx.doc, printed, ctx.api, { kitImport: "../kit", callsFrom: "./calls" }));
    files["src/generated/runtime.ts"] = generated(RUNTIME(ctx, authSource(specOf(ctx)), !!capabilities));
    Object.assign(files, capabilities?.files ?? {}, slotFiles(ctx.scope, slots, "miniapp"));
    files["src/generated/mocks.ts"] = generated(MOCKS(ctx.scope));
    files["src/generated/root.tsx"] = generated(ROOT(ctx.scope, dark));
    if (printed.tabBar) {
      files["src/generated/tabBar.tsx"] = generated(tabBarModule(printed.tabBar, { kitImport: "../kit", specFrom: "./spec" }));
      files["src/custom-tab-bar/index.tsx"] = generated(`${GENERATED}\nimport { Root } from "../generated/root"\nimport { TabBar } from "../generated/tabBar"\n\n/** the mini-program's custom tab bar: the design's navigation bar */\nexport default function CustomTabBar() {\n  return (\n    <Root>\n      <TabBar />\n    </Root>\n  )\n}\n`);
    }
    for (const [path, data] of Object.entries(images)) files[`src/${path}`] = generated(fromBase64(data.slice(data.indexOf(",") + 1)));
    /* the app: its pages, the first the one it opens on, and the tab bar */
    const first = printed.screens.find((s) => s.key === printed.initial) ?? printed.screens[0];
    const pages = [first, ...printed.screens.filter((s) => s !== first)].filter(Boolean).map((s) => s.path);
    /* the platform's own colors (the window behind a page, the tab bar) in the design's mode */
    const ground = (dark ? app.theme.dark : app.theme.light).colors;
    const tabBar = printed.tabBar
      ? { custom: true, color: ground["on-surface-variant"], selectedColor: ground.primary, backgroundColor: ground["surface-container"], borderStyle: dark ? "black" : "white", list: printed.tabBar.screens.map((key) => ({ pagePath: printed.screens.find((s) => s.key === key)!.path, text: printed.tabBar!.items.find((x) => x.screen === key)?.label ?? key })) }
      : undefined;
    const appConfig = { pages, window: { navigationStyle: "custom", backgroundColor: ground.surface, backgroundTextStyle: dark ? "light" : "dark", navigationBarBackgroundColor: ground.surface, navigationBarTextStyle: dark ? "white" : "black", navigationBarTitleText: ctx.title.slice(0, 60) }, ...(tabBar ? { tabBar } : {}) };
    /* WeChat tells a page the system's light or dark (and draws its own components to match) only to an app that says
       it follows it: a design drawn in both modes follows the device, as on the web */
    const config = JSON.stringify(appConfig, null, 2);
    files["src/app.config.ts"] = generated(`${GENERATED}\nexport default defineAppConfig(${dark === undefined ? `${config.slice(0, -2)},\n  ...(process.env.TARO_ENV === "weapp" ? { darkmode: true } : {}),\n}` : config})\n`);
    files["src/app.ts"] = generated(APP_ENTRY);
    files["src/app.css"] = generated(APP_CSS);
    files["src/index.html"] = generated(INDEX_HTML);
    files["src/custom/setup.ts"] = seeded(CUSTOM_SETUP);
    files["src/custom/Providers.tsx"] = seeded(CUSTOM_PROVIDERS);
    files["config/index.ts"] = generated(Object.keys(images).length ? CONFIG.replace("    cache: { enable: false },\n", "    cache: { enable: false },\n    /* the pictures the design holds, as files beside the pages */\n    copy: { patterns: [{ from: \"src/assets/\", to: `dist/${process.env.TARO_ENV}/assets/` }], options: {} },\n") : CONFIG);
    files["babel.config.js"] = generated(BABEL);
    files["types/global.d.ts"] = generated(GLOBAL_TYPES);
    files["tsconfig.json"] = generated(TSCONFIG);
    files["README.md"] = generated(README(ctx.scope));
    files["project.config.json"] = seeded(jsonFile({ miniprogramRoot: "dist/weapp/", projectname: ctx.name, description: ctx.title, appid: "touristappid", setting: { urlCheck: false, es6: false, enhance: false, postcss: false, minified: false }, compileType: "miniprogram" }));
    files["project.tt.json"] = seeded(jsonFile({ miniprogramRoot: "./", projectname: ctx.name, appid: "testappid", setting: { urlCheck: false, es6: false, postcss: false, minified: false } }));
    const deps = miniappDependencies();
    files["package.json"] = {
      ...generated(
        jsonFile({
          name: `${ctx.scope}/miniapp`,
          version: "0.1.0",
          private: true,
          scripts: {
            "dev:weapp": "taro build --type weapp --watch",
            "dev:tt": "taro build --type tt --watch",
            "dev:h5": "taro build --type h5 --watch",
            "build:weapp": "taro build --type weapp",
            "build:tt": "taro build --type tt",
            "build:h5": "taro build --type h5",
            build: "npm run build:weapp && npm run build:tt && npm run build:h5",
            typecheck: "tsc --noEmit -p .",
          },
          browserslist: miniPackage.browserslist,
          dependencies: sortedObject({ ...deps.dependencies, [`${ctx.scope}/api`]: "0.1.0", [`${ctx.scope}/app-runtime`]: "0.1.0", ...capabilities?.dependency }),
          devDependencies: sortedObject({ ...deps.devDependencies, "@types/node": ctx.version("@types/node"), typescript: ctx.version("typescript"), [`${ctx.scope}/mocks`]: "0.1.0" }),
        }),
      ),
      merge: "package.json",
    };
    return {
      dir: "apps/miniapp",
      pkg: `${ctx.scope}/miniapp`,
      scripts: { build: true, typecheck: true },
      files,
      summary: { zh: "小程序（Taro：微信、抖音、H5），页面、主题、接口调用由设计生成", en: "the mini-program (Taro: WeChat, Douyin, H5): pages, theme and calls from the design" },
      agents: AGENTS,
    };
  },
};
