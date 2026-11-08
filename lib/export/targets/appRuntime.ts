/* packages/app-runtime: the runtime every front end of the product runs on (the web app, the React Native app, the
 * Taro mini-program). React, but no DOM, React Native or Taro: the platform's pieces (where tokens are kept, the
 * transport, where a 401 goes) are handed in. It is the editor's own code, copied as it is into src/engine (the way
 * packages/mocks copies the mock library): the expression evaluator, the formats and the app's words in zh/en/ja/ko,
 * the rules forms are checked by, how a data source pages and what a region shows (lib/bindings), and the runtime made
 * of them (lib/app: data sources, forms, calls, the session, React hooks). So the exported apps and the editor's
 * preview behave alike, from one implementation. docs/导出.md lists its API. */

import { GENERATED, jsonFile } from "../code";
import { copiedFile } from "../copy";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

/** the editor's files the runtime is made of: the bindings' pure pieces, the three of lib/api they read (body.ts: how a
 *  transport reads an answer, for the mini-program's), and lib/app */
export const APP_RUNTIME_FILES = [
  ...["expr", "format", "messages", "rules", "sources", "form"].map((n) => `lib/bindings/${n}.ts`),
  ...["types", "transport", "body"].map((n) => `lib/api/${n}.ts`),
  /* what an invoke comes to (lib/app reads the types only) */
  "lib/capabilities/types.ts",
  /* the interpreter of the design's taps (lib/actions), and the screen moves its model names */
  "lib/screenMotion.ts",
  ...["model", "host", "run"].map((n) => `lib/actions/${n}.ts`),
  ...["store", "session", "sources", "forms", "scope", "runtime", "react", "actions", "index"].map((n) => `lib/app/${n}.ts`),
];

const INDEX = `${GENERATED}
/* The runtime of the product's front ends: see src/engine/app/index.ts, and docs/导出.md in the design editor. */
export * from "./engine/app/index"
export * from "./setup"
`;

/** the runtime's own pieces beside the editor's: real files of this repo, copied as they are (lib/export/copy.ts). The
 *  app's setup (`SetupGate`, which every front end puts around its screens), and the runtime's test as the product runs it. */
const COPIED = { "src/setup.ts": "appRuntime/setup.ts", "src/runtime.test.ts": "appRuntime/runtime.spec.ts" } as const;

const TSCONFIG = jsonFile({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: [], jsx: "react-jsx", verbatimModuleSyntax: true }, include: ["src"], exclude: ["src/**/*.test.ts"] });

/* the test sees what the code sees, and renders on the server (react-dom/server) */
const TSCONFIG_TEST = jsonFile({ extends: "./tsconfig.json", include: ["src"], exclude: [] });

const README = (scope: string) => `# ${scope}/app-runtime

The runtime the product's front ends share: data sources, forms, calls, the session, expressions and their formats,
the states of a region, as React hooks over plain TypeScript (no DOM, React Native or Taro). \`src/engine/\` is the
design editor's own code, copied as it is; never edit it here. See AGENTS.md.

前端（Web、React Native、小程序）共用的运行时：数据源、表单、调用、会话、表达式和格式化、区域的状态。\`src/engine/\`
是设计编辑器自己的代码，原样复制，不要在这里修改。
`;

const AGENTS = (scope: string) => `## The app runtime (packages/app-runtime)

\`${scope}/app-runtime\` is what the generated screens run on: \`createRuntime({ transport, auth, storage, presumed, lang })\`
holds the session (tokens kept in the platform's storage, put on the calls that need them, refreshed once on a 401, then
the app is sent to sign in), the data sources' cache and the language; \`RuntimeProvider\` puts it under the app and the
hooks (\`useDataSource\`, \`useForm\`, \`useSession\`, \`useBindings\`, \`useRegion\`, \`useRequireAuth\`, \`useCall\`) are what a
screen uses. Expressions are the design's own, evaluated by the design editor's evaluator (never \`eval\`). It is copied
from the design editor (\`src/engine/\`): **never edit it**. Custom code may use it (\`useRuntime()\`, \`useSession()\`), for
example to read the signed-in user in a third-party SDK's setup. \`SetupGate\` (\`src/setup.ts\`) is how every front end runs
its \`src/custom/setup.ts\`: once, before its first screen is drawn (nothing is drawn meanwhile); a setup that fails is
reported on the console and the app is drawn all the same.
`;

export const appRuntimeTarget: ProductTarget = {
  id: "app-runtime",
  async build(ctx: ProductContext): Promise<Workspace> {
    const engine: Record<string, ReturnType<typeof generated>> = {};
    for (const path of APP_RUNTIME_FILES) engine[`src/engine/${path.slice("lib/".length)}`] = generated(await ctx.read(path));
    return {
      dir: "packages/app-runtime",
      pkg: `${ctx.scope}/app-runtime`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "前端共用的运行时：数据源、表单、调用、会话、表达式（React，不依赖 DOM）", en: "the front ends' shared runtime: data sources, forms, calls, the session, expressions (React, no DOM)" },
      agents: AGENTS(ctx.scope),
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/app-runtime`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts" },
              scripts: { typecheck: "tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json", test: "vitest run" },
              /* the app's own React: one copy, whichever front end it runs in */
              peerDependencies: { react: ">=18.3.0" },
              devDependencies: { "@types/react": ctx.version("@types/react"), "@types/react-dom": ctx.version("@types/react-dom"), "react-dom": ctx.version("react-dom"), typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(TSCONFIG),
        "tsconfig.test.json": generated(TSCONFIG_TEST),
        "README.md": generated(README(ctx.scope)),
        "src/index.ts": generated(INDEX),
        ...Object.fromEntries(await Promise.all(Object.entries(COPIED).map(async ([at, from]) => [at, generated(await copiedFile(ctx, from))] as const))),
        ...engine,
      },
    };
  },
};
