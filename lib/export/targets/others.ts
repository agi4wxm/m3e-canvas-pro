/* The slot of the mobile app: a target a later part of the export fills in place (lib/export/targets/index.ts). The
 * mini-program is lib/export/targets/miniapp.ts, the contract tests lib/export/targets/contractTests.ts. */

import { generated, type ProductTarget, type Workspace } from "../types";

/** a folder that is a slot for a target to come: a README that says what will be there, and no workspace yet */
const slot = (dir: string, title: string, zh: string, en: string): Workspace => ({
  dir,
  scripts: {},
  summary: { zh: `${zh}（待生成）`, en: `${en} (to come)` },
  files: { "README.md": generated(`# ${title}\n\n${zh}将在后续版本里由设计生成到这里，和 Web 应用共用 \`packages/api\` 和 \`packages/mocks\`。\n\n${en} will be generated here from the same design, sharing \`packages/api\` and \`packages/mocks\` with the web app.\n`) },
});

export const mobileTarget: ProductTarget = { id: "mobile", build: () => slot("apps/mobile", "apps/mobile", "移动应用（React Native、Expo）", "The mobile app (React Native, Expo)") };
