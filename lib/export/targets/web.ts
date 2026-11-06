/* apps/web: the React app of the design. It is the prototype export (lib/exportProject.ts) moved into the workspace,
 * with the screens' bindings printed against the product's runtime (packages/app-runtime) and client (packages/api):
 * what the design makes lives in src/generated/ (the app shell, the runtime, the theme, a screen per file with its data
 * hooks beside it, the router with each screen's params in its address, the API client on the session, the mocks in
 * development, what only a browser has), the editor's components it copies stay where their imports expect them
 * (src/components, src/lib, src/hooks, src/styles), and src/custom/ holds the extension points, written once.
 *
 * The prototype's own files are not changed to get here: they are moved, and the few imports that name a moved file
 * are rewritten line by line in the import blocks (never in the code a document's words reach). */

import { buildProject, type ProjectFiles } from "../../exportProject";
import { PRODUCT_WEB_DEV } from "../../exportPackages";
import { GENERATED, jsonFile, sortedObject } from "../code";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";
import { specOf } from "./mocks";
import { API_CLIENT, DATA_SCROLL, ENV, MAIN, MOCKS, PLATFORM, ROUTER, ROUTER_TEST, SCENARIO_PICKER, routesSource } from "./webSources";

/** the prototype's own files that move into src/generated/ */
const MOVED: Record<string, string> = {
  "src/App.tsx": "src/generated/App.tsx",
  "src/runtime.tsx": "src/generated/runtime.tsx",
  "src/theme.tsx": "src/generated/theme.tsx",
  "src/index.css": "src/generated/index.css",
  "src/style.css": "src/generated/style.css",
  "src/doc-icons.ts": "src/generated/doc-icons.ts",
  "src/style-icons.ts": "src/generated/style-icons.ts",
};
/** what the workspace writes its own way */
const REPLACED = new Set(["package.json", "README.md", "LICENSE", "NOTICE", ".gitignore", "src/main.tsx", "vite.config.ts", "tsconfig.json"]);
/** the generated modules the prototype names by their old place */
const RENAMED_IMPORTS: Record<string, string> = { "@/runtime": "@/generated/runtime", "@/theme": "@/generated/theme", "@/style-icons": "@/generated/style-icons", "@/doc-icons": "@/generated/doc-icons", "@/api": "@/generated/api", "@/platform": "@/generated/platform", "@/DataScroll": "@/generated/DataScroll" };

/** An import line with its module renamed, when it names one of `map`; any other line as it is. */
function renamedImport(line: string, map: Record<string, string>): string {
  if (!/^(import|export)\s/.test(line)) return line;
  const m = /^(.*\sfrom\s)"([^"]+)"(\s*;?)$/.exec(line) ?? /^(import\s)"([^"]+)"(\s*;?)$/.exec(line);
  return m && map[m[2]] ? `${m[1]}"${map[m[2]]}"${m[3]}` : line;
}

/** the imports at the head of a printed screen, renamed; the screen's code below them is left as it is */
export function withRenamedHead(text: string, map: Record<string, string>): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && (lines[i] === "" || /^import\s/.test(lines[i])); i++) lines[i] = renamedImport(lines[i], map);
  return lines.join("\n");
}

/** every import line of a file of the export's own making renamed (theme.tsx registers icons between its imports) */
const withRenamedImports = (text: string, map: Record<string, string>) =>
  text
    .split("\n")
    .map((line) => renamedImport(line, map))
    .join("\n");

/** the stylesheet's own imports, from its new place one folder down */
function cssFromGenerated(css: string): string {
  const lines = css.split("\n");
  for (let i = 0; i < lines.length && (lines[i] === "" || lines[i].startsWith("@import ")); i++) if (lines[i] === '@import "./styles/m3e.css";') lines[i] = '@import "../styles/m3e.css";';
  return lines.join("\n");
}

/** the screens' file names, made distinct where only case tells two apart (one file on macOS and Windows) */
export function distinctScreenFiles(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of names) {
    let file = name;
    for (let i = 2; taken.has(file.toLowerCase()); i++) file = `${name}-${i}`;
    taken.add(file.toLowerCase());
    out.set(name, file);
  }
  return out;
}

const VITE_CONFIG = `${GENERATED}
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { msw } from "msw/vite"
import { defineConfig } from "vite"

/* where /api goes on the dev server when the mocks are off, and on \`vite preview\` of the build: the server's address */
const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:3001"
const proxy = { "/api": { target: API_TARGET, changeOrigin: true, rewrite: (path: string) => path.replace(/^\\/api/, "") } }

export default defineConfig({
  /* the mocks' service worker is served in development only, never built */
  plugins: [react(), tailwindcss(), { ...msw({ mode: "worker-only" }), apply: "serve" }],
  resolve: {
    alias: [{ find: /^@\\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  server: { proxy },
  preview: { proxy },
  build: { chunkSizeWarningLimit: 4096 },
})
`;

const TSCONFIG = jsonFile({
  extends: "../../tsconfig.base.json",
  compilerOptions: { lib: ["DOM", "DOM.Iterable", "ESNext"], types: ["vite/client"], jsx: "react-jsx", paths: { "@/*": ["./src/*"] } },
  include: ["src"],
});

const CUSTOM_SETUP = `/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. setup() runs before the app is drawn: start an SDK
 * (analytics, payments, push), read a token, change how the API is called
 * (setTransport in ../generated/api).
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

const README = (scope: string) => `# ${scope}/web

The web app of the design: React, Vite and Tailwind. \`src/generated/\` and the copied components
(\`src/components\`, \`src/lib\`, \`src/hooks\`, \`src/styles\`) are rewritten by every export;
\`src/custom/\` is yours. See the root README and AGENTS.md.

由设计生成的 Web 应用。\`src/generated/\` 和复制来的组件每次导出都会重写，\`src/custom/\` 是自定义代码的位置。
`;

/** the web app's section of AGENTS.md */
const AGENTS = (scope: string) => `## The web app (apps/web)

\`src/generated/screens/\` holds one component per screen of the design; a screen bound to the API has its data
sources beside it as hooks named after them (\`<Screen>.data.ts\`, on the typed client of \`${scope}/api\`) and reads the
design's expressions through \`${scope}/app-runtime\`. Screens, routes (\`/product/:productId\`), the session and the
mocks in development are all generated: change them in the design. Custom code goes in \`src/custom/setup.ts\` (before
the app is drawn: \`setTransport\` and \`runtime\` from \`../generated/api\`, to call the API another way or read the
session) and \`src/custom/Providers.tsx\` (third-party providers).

- \`VITE_API_BASE_URL\`: where the API is in a build (default \`/api\`; \`vite dev\` and \`vite preview\` forward \`/api\` to
  \`API_TARGET\`, default \`http://127.0.0.1:3001\`).
- Development only: \`VITE_API_MOCKS\` (\`off\` calls the server, \`msw\` serves the mocks from a service worker),
  \`VITE_MOCK_SCENARIO\` or \`?scenario=\` in the address picks a scenario of the mocks.
`;

export const webTarget: ProductTarget = {
  id: "web",
  async build(ctx: ProductContext): Promise<Workspace> {
    const api = specOf(ctx);
    const project = await buildProject(ctx.doc, ctx.widths, { lang: ctx.lang, read: ctx.read, fetchIcons: ctx.fetchIcons, onProgress: ctx.onProgress, binds: { runtime: `${ctx.scope}/app-runtime`, api, operations: ctx.api.operations } });
    ctx.warnings.push(...project.warnings);
    const proto: ProjectFiles = project.files;
    const files: ProductFiles = {};

    /* the screens, each in a file of its own, distinct even where case does not count */
    const screenPaths = Object.keys(proto).filter((p) => /^src\/screens\/[^/]+\.tsx$/.test(p));
    const names = screenPaths.map((p) => p.slice("src/screens/".length, -".tsx".length));
    const fileOf = distinctScreenFiles(names);
    for (const name of names) {
      const file = fileOf.get(name)!;
      /* a screen's data hooks beside it, under the name it imports them by */
      const map = file === name ? RENAMED_IMPORTS : { ...RENAMED_IMPORTS, [`./${name}.data`]: `./${file}.data` };
      files[`src/generated/screens/${file}.tsx`] = generated(withRenamedHead(proto[`src/screens/${name}.tsx`] as string, map));
      const data = proto[`src/screens/${name}.data.ts`];
      if (typeof data === "string") files[`src/generated/screens/${file}.data.ts`] = generated(withRenamedHead(data, RENAMED_IMPORTS));
    }

    for (const [path, body] of Object.entries(proto)) {
      if (REPLACED.has(path) || path.startsWith("src/screens/")) continue;
      const to = MOVED[path];
      if (!to) {
        files[path] = generated(body);
        continue;
      }
      let text = body as string;
      if (path === "src/index.css") text = cssFromGenerated(text);
      else if (path === "src/theme.tsx") text = withRenamedImports(text, RENAMED_IMPORTS);
      else if (path === "src/App.tsx") for (const [name, file] of fileOf) if (file !== name) text = text.replace(`from "./screens/${name}"\n`, `from "./screens/${file}"\n`);
      files[to] = generated(text);
    }

    /* the screens' keys, in order, out of the runtime the prototype wrote (its ScreenId type) */
    const runtime = proto["src/runtime.tsx"] as string;
    const ids = /^export type ScreenId = (.*)$/m.exec(runtime)?.[1] ?? "";
    const keys = [...ids.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
    const start = /^const START_SCREEN: ScreenId = (".*")$/m.exec(runtime)?.[1];
    files["src/generated/routes.ts"] = generated(routesSource(keys, start ? (JSON.parse(start) as string) : keys[0], project.spec?.bound?.params ?? {}));
    files["src/generated/routes.test.ts"] = generated(ROUTER_TEST);
    files["src/generated/router.ts"] = generated(ROUTER);
    files["src/generated/api.ts"] = generated(API_CLIENT(ctx.scope, ctx.name, ctx.lang, api));
    files["src/generated/mocks.ts"] = generated(MOCKS(ctx.scope));
    files["src/generated/ScenarioPicker.tsx"] = generated(SCENARIO_PICKER(ctx.scope));
    files["src/generated/platform.ts"] = generated(PLATFORM(ctx.scope));
    files["src/generated/DataScroll.tsx"] = generated(DATA_SCROLL);
    files["src/generated/env.d.ts"] = generated(ENV);
    files["src/main.tsx"] = generated(MAIN(ctx.scope));
    files["src/custom/setup.ts"] = seeded(CUSTOM_SETUP);
    files["src/custom/Providers.tsx"] = seeded(CUSTOM_PROVIDERS);
    files["vite.config.ts"] = generated(VITE_CONFIG);
    files["tsconfig.json"] = generated(TSCONFIG);
    files["README.md"] = generated(README(ctx.scope));

    const used = Object.keys((JSON.parse(proto["package.json"] as string) as { dependencies: Record<string, string> }).dependencies);
    files["package.json"] = {
      ...generated(
        jsonFile({
          name: `${ctx.scope}/web`,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview", typecheck: "tsc --noEmit -p .", test: "vitest run" },
          dependencies: sortedObject({ ...Object.fromEntries(used.map((d) => [d, ctx.version(d)])), [`${ctx.scope}/api`]: "0.1.0", [`${ctx.scope}/app-runtime`]: "0.1.0" }),
          devDependencies: sortedObject({ ...Object.fromEntries(PRODUCT_WEB_DEV.map((d) => [d, ctx.version(d)])), [`${ctx.scope}/mocks`]: "0.1.0" }),
        }),
      ),
      merge: "package.json",
    };
    return {
      dir: "apps/web",
      pkg: `${ctx.scope}/web`,
      scripts: { dev: true, build: true, typecheck: true, test: true },
      agents: AGENTS(ctx.scope),
      files,
      summary: { zh: "Web 应用（React + Vite）：屏幕、数据、表单、路由、主题由设计生成", en: "the web app (React + Vite): screens, data, forms, router and theme from the design" },
    };
  },
};

