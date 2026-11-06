/* The smaller workspaces: the contract tests, and the slots of the mobile app and the mini-program. Each is a target
 * a later part of the export fills in place (lib/export/targets/index.ts). */

import { GENERATED, jsonFile, str } from "../code";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

const CONTRACT_TEST = (scope: string) => `${GENERATED}
import { describe, expect, it } from "vitest"
import { OPERATIONS } from ${str(`${scope}/api`)}
import { buildApp } from ${str(`${scope}/server`)}

/** an operation's path with every parameter filled in */
const sample = (path: string) => path.replace(/\\{[^{}/]+\\}/g, "1")

/* The server against the contract: every operation is routed in the server built here, and, when CONTRACT_BASE_URL
   names a running server, every operation there answers with a status the contract allows or 501 (not written yet). */
describe("the server keeps the contract", () => {
  it("routes every operation", async () => {
    const app = await buildApp()
    await app.ready()
    for (const op of OPERATIONS) expect(app.hasRoute({ method: op.method, url: op.path.replace(/\\{([^{}/]+)\\}/g, (_, name: string) => \`:\${name.replace(/[^A-Za-z0-9_]/g, "_")}\`) }), \`\${op.method} \${op.path}\`).toBe(true)
    await app.close()
  })

  const base = process.env.CONTRACT_BASE_URL
  it.skipIf(!base)("answers every operation on a running server", async () => {
    for (const op of OPERATIONS.filter((o) => o.method === "GET")) {
      const response = await fetch(\`\${base}\${sample(op.path)}\`)
      expect([op.status, 501, 400, 401, 403, 404], \`\${op.method} \${op.path}\`).toContain(response.status)
    }
  })
})
`;

export const contractTestsTarget: ProductTarget = {
  id: "contract-tests",
  build(ctx: ProductContext): Workspace {
    return {
      dir: "contract-tests",
      pkg: `${ctx.scope}/contract-tests`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "契约测试：检查后端是否符合接口契约", en: "contract tests: the server checked against the contract" },
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/contract-tests`,
              version: "0.1.0",
              private: true,
              type: "module",
              scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run" },
              devDependencies: { [`${ctx.scope}/api`]: "0.1.0", [`${ctx.scope}/server`]: "0.1.0", "@types/node": ctx.version("@types/node"), typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(jsonFile({ extends: "../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: ["node"] }, include: ["src"] })),
        "src/contract.test.ts": generated(CONTRACT_TEST(ctx.scope)),
      },
    };
  },
};

/** a folder that is a slot for a target to come: a README that says what will be there, and no workspace yet */
const slot = (dir: string, title: string, zh: string, en: string): Workspace => ({
  dir,
  scripts: {},
  summary: { zh: `${zh}（待生成）`, en: `${en} (to come)` },
  files: { "README.md": generated(`# ${title}\n\n${zh}将在后续版本里由设计生成到这里，和 Web 应用共用 \`packages/api\` 和 \`packages/mocks\`。\n\n${en} will be generated here from the same design, sharing \`packages/api\` and \`packages/mocks\` with the web app.\n`) },
});

export const mobileTarget: ProductTarget = { id: "mobile", build: () => slot("apps/mobile", "apps/mobile", "移动应用（React Native、Expo）", "The mobile app (React Native, Expo)") };
export const miniappTarget: ProductTarget = { id: "miniapp", build: () => slot("apps/miniapp", "apps/miniapp", "小程序（Taro：微信、抖音）", "The mini-program (Taro: WeChat, Douyin)") };
