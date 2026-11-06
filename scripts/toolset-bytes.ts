/* How many bytes of tool definitions typical requests send with the in-app agent's tool sets (lib/agent/toolsets.ts):
 * `bun scripts/toolset-bytes.ts`. Prints each set's size, then the sets and bytes each request starts with. */

import { setGlobalLang } from "../lib/i18n";
import { agentSetup } from "../lib/agent/turn";
import { setsFor, toolsIn, TOOL_SETS } from "../lib/agent/toolsets";
import { toolDefs } from "../lib/tools";

setGlobalLang("en");

export const TYPICAL = [
  "Make a login screen in the current style",
  "Build a Codex-style prompt box with an attach icon and a send button",
  "Change the icon of the first tab to a heart",
  "按当前风格做一个登录页面",
  "把这个列表改成卡片，背景是浅灰色",
  "加一个深色模式开关变量并绑定",
  "画一个叶子图标放进标签栏",
  "ホーム画面に検索バーとカードのリストを追加して",
  "설정 화면을 만들어 줘. 검색 바와 알림 스위치가 있어야 해",
  "When I tap the login button, go to the home screen",
];

const { registry } = agentSetup({ canSee: true, canDraw: true, drawings: 2 });
const bytes = (sets: readonly (typeof TOOL_SETS)[number][]) => JSON.stringify(toolDefs(toolsIn(registry.tools, sets))).length;

console.log("set sizes:", TOOL_SETS.map((s) => `${s} ${(bytes([s]) / 1024).toFixed(1)} KB`).join(", "), `; all ${(bytes(TOOL_SETS) / 1024).toFixed(1)} KB`);
let total = 0;
for (const r of TYPICAL) {
  const sets = setsFor(r);
  const b = bytes(sets);
  total += b;
  console.log(`${(b / 1024).toFixed(1).padStart(5)} KB  ${sets.join("+").padEnd(28)} ${r}`);
}
console.log(`mean ${(total / TYPICAL.length / 1024).toFixed(1)} KB`);
