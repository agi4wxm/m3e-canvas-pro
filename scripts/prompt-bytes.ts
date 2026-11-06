/* How big the in-app agent's cached system prompt is, and what product requests load: `bun scripts/prompt-bytes.ts`.
 * Prints the system prompt's bytes and a rough token count (4 bytes a token for English), then for a few realistic
 * product requests in the four languages the tool sets they start with and the bytes of those tools. */

import { setGlobalLang } from "../lib/i18n";
import { agentSetup } from "../lib/agent/turn";
import { setsFor, toolsIn } from "../lib/agent/toolsets";
import { toolDefs } from "../lib/tools";

setGlobalLang("en");

export const PRODUCT_REQUESTS = [
  "Make the shop list screen real: infer the API it needs, wire it up and fill the mocks so it shows rows",
  "Add a create-product form that posts to the API, with validation and the server's errors on the fields",
  "Tapping a product opens its detail screen with that product's data",
  "Add login and make the orders screen require sign-in",
  "Import this OpenAPI file and wire the products and orders screens to it",
  "Add empty, error and slow network scenarios and design the matching states",
  "做一个聊天页面：实时消息，用模拟数据",
  "帮我做一个记账小应用：账单列表、记一笔、统计三个页面，要有接口、数据绑定和模拟数据",
  "商品列表页连上接口，显示模拟库里的数据",
  "この一覧画面をAPIにつないで、モックデータで表示して",
  "주문 목록 화면을 API에 연결하고 목업 데이터를 채워 줘",
];

const { registry, system } = agentSetup({ canSee: true, canDraw: true, drawings: 2 });
const bytes = (s: string) => new TextEncoder().encode(s).length;
console.log(`system prompt: ${bytes(system)} bytes, ~${Math.round(bytes(system) / 4)} tokens`);
for (const r of PRODUCT_REQUESTS) {
  const sets = setsFor(r);
  const b = JSON.stringify(toolDefs(toolsIn(registry.tools, sets))).length;
  console.log(`${(b / 1024).toFixed(1).padStart(5)} KB  ${sets.join("+").padEnd(34)} ${r}`);
}
