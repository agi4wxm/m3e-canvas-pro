/* The root of the monorepo: the workspaces' package.json, the shared TypeScript, ESLint and Prettier settings, the
 * README (Chinese, then a short English one), AGENTS.md for the AI coding agents that write the custom code, and the
 * licenses. Made last, from the workspaces the targets made. */

import { GENERATED, jsonFile, sortedObject } from "../code";
import { generated, seeded, type ProductContext, type ProductFiles, type Workspace } from "../types";

/** the folders whose files are all generated: Prettier leaves them alone, AGENTS.md names them */
export const GENERATED_DIRS = ["**/src/generated/", "apps/web/src/components/", "apps/web/src/lib/", "apps/web/src/hooks/", "apps/web/src/styles/", "apps/web/public/", "packages/api/", "packages/mocks/"];

/** the editor's copied components: ESLint leaves them alone (they are the editor's code, checked there) */
const VENDORED = ["apps/web/src/components/", "apps/web/src/lib/", "apps/web/src/hooks/", "apps/web/src/styles/", "apps/web/src/react-css.d.ts", "packages/mocks/src/engine/"];

const ROOT_DEV = ["@eslint/js", "eslint", "eslint-plugin-react-hooks", "eslint-plugin-react-refresh", "globals", "prettier", "typescript", "typescript-eslint"];

const ESLINT = `${GENERATED}
import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["**/node_modules/", "**/dist/", ".m3e/", "**/*.m3e-new", ${VENDORED.map((v) => JSON.stringify(v)).join(", ")}]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["server/**", "contract-tests/**", "scripts/**", "**/*.mjs", "**/*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  /* The app the design makes is checked where it is made (the export's own tests); what are matters of taste in code
     someone writes is not asked of it here. Custom code gets every rule. */
  {
    files: ["apps/web/src/generated/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "react-refresh/only-export-components": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/unsupported-syntax": "off",
    },
  },
])
`;

const TSCONFIG_BASE = jsonFile({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    skipLibCheck: true,
    isolatedModules: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    noEmit: true,
  },
});

const DEV = `${GENERATED}
// Starts the server and the web app side by side (npm run dev); Ctrl+C stops both.
import { spawn } from "node:child_process"

/* npm's own script when run through npm, else the npm command */
const npmJs = /\\.c?js$/.test(process.env.npm_execpath ?? "") ? process.env.npm_execpath : undefined
const run = (workspace) =>
  spawn(npmJs ? process.execPath : "npm", [...(npmJs ? [npmJs] : []), "run", "dev", "-w", workspace], {
    stdio: "inherit",
    shell: !npmJs && process.platform === "win32",
  })

const children = ["server", "apps/web"].map(run)
const stop = () => {
  for (const child of children) child.kill()
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
for (const child of children)
  child.on("exit", (code) => {
    if (code) {
      process.exitCode = code
      stop()
    }
  })
`;

const GITIGNORE = `node_modules
dist
*.log
*.tsbuildinfo
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
`;

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
`;

const PRETTIER = jsonFile({ printWidth: 100 });

const CLAUDE = `# Notes for Claude Code

The rules of this repository are in AGENTS.md:

@AGENTS.md

This file is custom (the export created it once and never changes it again): add your own notes below.
`;

function agentsSource(ws: Workspace[], scope: string): string {
  const handlers = ws.some((w) => w.dir === "server");
  return `# AGENTS.md

Rules for AI coding agents (Codex, Claude Code, …) and people working in this repository.

This monorepo is exported from a design made in **M3E Canvas Pro**. The design defines the product: the screens, the
navigation, the states, the API contract, the mocks. **Custom code (written by people or AI)** exists only where the
design stops on purpose: the back end's business logic, and rare client integrations (payments, maps, push and other
third-party SDKs). Everything else is regenerated whenever the design is exported again.

## What you may edit

| Where | What |
| --- | --- |
${handlers ? "| `server/src/handlers/*.ts` | One file per API operation (and per realtime channel in `channels/`): what the server does for it. Each starts as a stub that answers 501 Not Implemented. |\n| `server/src/custom/*.ts` | `auth.ts` (who a credential stands for), `db.ts` (the data layer), `setup.ts` (Fastify plugins, hooks, routes the contract does not have). |\n" : ""}| \`apps/web/src/custom/setup.ts\` | Runs before the web app is drawn: start an SDK, read a token, change how the API is called. |
| \`apps/web/src/custom/Providers.tsx\` | Wraps the web app: providers of third-party SDKs. |
| \`CLAUDE.md\`, new files and folders of your own | Yours. |

These files were written once by the export and are never written again. Everything listed in \`.m3e/manifest.json\`
with \`"kind": "generated"\` is the export's: **do not edit it**. That includes every \`generated/\` folder,
\`packages/api\` (the contract, its types and the client), \`packages/mocks\`, the copied components in
\`apps/web/src/components\`, \`apps/web/src/lib\`, \`apps/web/src/hooks\`, \`apps/web/src/styles\`, and the
configuration files at the root.

## When something generated is wrong

- The screens, the navigation, the texts, the states, the API contract and the mocks are changed **in the design**,
  then exported again. Do not patch them here: the next export would report your edit as a conflict.
- An export never overwrites a generated file someone edited: it leaves the file as it is, writes the new version
  beside it as \`<file>.m3e-new\`, and reports the conflict. Move the change somewhere custom code belongs, then
  replace the file with its \`.m3e-new\` version (or delete both and export again).
- Dependencies: add them with \`npm install <package> -w <workspace>\`. A generated \`package.json\` keeps what you add:
  the export only sets the entries it writes itself.

## Commands

\`\`\`bash
npm install
npm run dev        # the server and the web app (the web app answers from the mocks in development)
npm run typecheck
npm run lint       # ESLint with no warnings, and Prettier on the custom code
npm test
npm run build
\`\`\`

Before you finish, run \`npm run typecheck && npm run lint && npm test && npm run build\`; all must pass.

## How the pieces fit

- \`packages/api\` (\`${scope}/api\`): \`createApi(transport)\` gives one typed function per operation of the contract
  (\`openapi.yaml\`). The client runs over a \`Transport\` and assumes no DOM and no global fetch, so the web app, the
  mobile app and a mini-program share it.
- \`packages/mocks\` (\`${scope}/mocks\`): \`createMockTransport()\` answers the API with made-up data; MSW handlers do the
  same for dev servers. Development only: never import it from production code.
${handlers ? `- \`server\` (\`${scope}/server\`): Fastify. \`src/generated/routes.ts\` routes every operation to \`src/handlers/<operation>.ts\`;\n  the handler types in \`src/generated/handlers.ts\` say what each one receives and returns.\n` : ""}- \`contract-tests\`: checks the server against the contract (\`npm run contract -w contract-tests\`; the server's section below says how
  to run it strictly).
${ws
  .map((w) => w.agents?.trim())
  .filter(Boolean)
  .map((section) => `\n${section}\n`)
  .join("")}`;
}

function readmeSource(ctx: ProductContext, ws: Workspace[]): string {
  const rows = (lang: "zh" | "en") => ws.map((w) => `| \`${w.dir}\` | ${w.summary[lang]} |`).join("\n");
  return `# ${ctx.title}

由 M3E Canvas Pro 导出的完整产品（npm workspaces 单仓库）：前端、接口契约、模拟库和后端骨架都由同一份设计生成。

## 结构

| 目录 | 内容 |
| --- | --- |
${rows("zh")}
| \`.m3e/manifest.json\` | 导出清单：每个生成文件和它的哈希 |

## 运行

需要 Node 22.12 以上。

\`\`\`bash
npm install
npm run dev        # 同时启动后端和 Web 应用；开发时 Web 应用的接口由模拟库回答
npm run typecheck
npm run lint
npm test
npm run build
\`\`\`

开发时设 \`VITE_API_MOCKS=off\` 就改为请求本地后端（\`/api\` 转发到 \`http://127.0.0.1:3001\`），设 \`msw\` 用 Service Worker 提供模拟数据。
\`npm run contract -w contract-tests\` 按契约检查后端的每个接口（未实现的算“待实现”，加 \`-- --strict\` 时也算失败）；开发时后端自带接口文档（Swagger UI，地址见 AGENTS.md）。

## 生成的代码和自定义代码

- **生成的文件**（\`.m3e/manifest.json\` 里 \`"kind": "generated"\`）每次导出都会重写，不要修改。要改屏幕、导航、文字、接口，请改设计后重新导出。
- **自定义代码（人或 AI 写）**只写在导出时创建一次、之后不再改动的位置：\`server/src/handlers/\`（每个接口一个文件，先返回 501）、\`server/src/custom/\`、\`apps/web/src/custom/\`。
- 重新导出时，被手动改过的生成文件不会被覆盖：新版本写在旁边的 \`<文件>.m3e-new\`，并在导出报告里列出。
- 给某个工作区加依赖用 \`npm install <包> -w <工作区>\`，重新导出会保留它。

给 Codex、Claude Code 等 AI 编程助手的规则见 [AGENTS.md](AGENTS.md)。

---

## English

The whole product exported from M3E Canvas Pro as an npm workspaces monorepo: front end, API contract, mocks and a
back-end skeleton, all from one design.

| Folder | What |
| --- | --- |
${rows("en")}

\`npm install\`, then \`npm run dev\` (the server and the web app; in development the web app's API answers from the
mocks). \`npm run typecheck\`, \`npm run lint\`, \`npm test\` and \`npm run build\` check and build everything.

Generated files are rewritten by every export; custom code (written by people or AI) goes only in
\`server/src/handlers/\`, \`server/src/custom/\` and \`apps/web/src/custom/\`. See [AGENTS.md](AGENTS.md).
`;
}

/** The root's files, made from the workspaces and everything they hold. */
export async function rootFiles(ctx: ProductContext, ws: Workspace[], all: ProductFiles): Promise<ProductFiles> {
  const packages = ws.filter((w) => w.pkg);
  const files: ProductFiles = {
    "package.json": {
      ...generated(
        jsonFile({
          name: ctx.name,
          version: "0.1.0",
          private: true,
          type: "module",
          workspaces: packages.map((w) => w.dir),
          scripts: {
            dev: "node scripts/dev.mjs",
            build: "npm run build --workspaces --if-present",
            typecheck: "npm run typecheck --workspaces --if-present",
            lint: "eslint . --max-warnings=0 && prettier --check .",
            format: "prettier --write .",
            test: "npm run test --workspaces --if-present",
          },
          engines: { node: "^22.12.0 || ^24.0.0 || >=26.0.0" },
          devDependencies: sortedObject(Object.fromEntries(ROOT_DEV.map((d) => [d, ctx.version(d)]))),
        }),
      ),
      merge: "package.json",
    },
    "tsconfig.base.json": generated(TSCONFIG_BASE),
    "eslint.config.js": generated(ESLINT),
    ".prettierrc.json": generated(PRETTIER),
    ".gitignore": generated(GITIGNORE),
    ".editorconfig": generated(EDITORCONFIG),
    "scripts/dev.mjs": generated(DEV),
    "README.md": generated(readmeSource(ctx, ws)),
    "AGENTS.md": generated(agentsSource(ws, ctx.scope)),
    "CLAUDE.md": seeded(CLAUDE),
    LICENSE: generated(await ctx.read("LICENSE")),
  };
  const copied = [...new Set(Object.keys(all).filter((p) => /^apps\/web\/src\/(components|lib|hooks)\//.test(p)).map((p) => p.split("/").slice(0, 5).join("/")))].sort();
  files.NOTICE = generated(`This product was exported from M3E Canvas Pro, whose notice follows. Of the code it names, only the\nfiles in ${copied.join(", ")} are copied here.\n\n${await ctx.read("NOTICE")}`);
  /* Prettier formats custom code only: a generated file it reformatted would count as edited at the next export */
  const covered = (path: string) => GENERATED_DIRS.some((d) => (d.startsWith("**/") ? path.includes(`/${d.slice(3)}`) : path.startsWith(d)));
  const loose = [...Object.entries(all), ...Object.entries(files)]
    .filter(([path, f]) => f.kind === "generated" && !covered(path))
    .map(([path]) => `/${path}`)
    .sort();
  files[".prettierignore"] = generated(
    `# Generated by M3E Canvas. The export's own files are not formatted here: one Prettier rewrote would count as edited,\n# and the next export would report it as a conflict. Custom code is formatted.\nnode_modules/\ndist/\n.m3e/\n*.m3e-new\n${GENERATED_DIRS.join("\n")}\n/.prettierignore\n${loose.join("\n")}\n`,
  );
  return files;
}
