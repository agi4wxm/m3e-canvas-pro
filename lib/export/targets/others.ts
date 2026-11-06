/* The slot of the mini-program: a target a later part of the export fills in place (lib/export/targets/index.ts). The
 * mobile app is lib/export/targets/mobile.ts, the contract tests lib/export/targets/contractTests.ts. */

import { generated, type ProductTarget, type Workspace } from "../types";

/** a folder that is a slot for a target to come: a README that says what will be there, and no workspace yet */
const slot = (dir: string, title: string, zh: string, en: string): Workspace => ({
  dir,
  scripts: {},
  summary: { zh: `${zh}（待生成）`, en: `${en} (to come)` },
  files: { "README.md": generated(`# ${title}\n\n${zh}将在后续版本里由设计生成到这里，和 Web 应用共用 \`packages/api\` 和 \`packages/mocks\`。\n\n${en} will be generated here from the same design, sharing \`packages/api\` and \`packages/mocks\` with the web app.\n`) },
});

export const miniappTarget: ProductTarget = { id: "miniapp", build: () => slot("apps/miniapp", "apps/miniapp", "小程序（Taro：微信、抖音）", "The mini-program (Taro: WeChat, Douyin)") };
