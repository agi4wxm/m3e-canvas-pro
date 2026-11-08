/* The consistency table as docs/交互规则.md lists it: every row, the hosts that pass it, and every known divergence with
 * its reason. The doc's section between the two marks is this text; summary.test.ts fails when it is behind, and
 * `bun lib/actions/consistency/summary.ts` writes it. */

import { readFileSync, writeFileSync } from "node:fs";
import { ROWS } from "./rows";
import { HOSTS, HOST_TITLES, type HostName } from "./types";

export const DOC_PATH = new URL("../../../docs/交互规则.md", import.meta.url);
export const MARKS = ["<!-- 一致性表：由 lib/actions/consistency/summary.ts 生成，不要手改 -->", "<!-- 一致性表结束 -->"] as const;

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** the table of rows and hosts, and the list of divergences, as Markdown */
export function summaryMarkdown(): string {
  const short: Record<HostName, string> = { interpreter: "解释器", preview: "预览", webPrototype: "原型 Web", webProduct: "产品 Web", rn: "手机端", miniapp: "小程序" };
  const head = `| 行 | 检查什么 | ${HOSTS.map((h) => short[h]).join(" | ")} |\n| --- | --- | ${HOSTS.map(() => ":-:").join(" | ")} |`;
  const lines = ROWS.map((r) => `| \`${r.id}\` | ${cell(r.title)} | ${HOSTS.map((h) => (r.known?.[h] ? "✗" : "✓")).join(" | ")} |`);
  const count = (h: HostName) => ROWS.filter((r) => r.known?.[h]).length;
  const totals = `${HOSTS.filter((h) => h !== "interpreter").map((h) => `${HOST_TITLES[h]} ${count(h)} 处`).join("，")}。`;
  const list = HOSTS.filter((h) => count(h)).map((h) => [`**${HOST_TITLES[h]}**`, "", ...ROWS.filter((r) => r.known?.[h]).map((r) => `- \`${r.id}\`（${cell(r.title)}）：${cell(r.known![h]!)}`), ""].join("\n"));
  return [MARKS[0], "", `共 ${ROWS.length} 行。✓ 是今天就照规则做，✗ 是已知分歧。分歧：${totals}`, "", head, ...lines, "", "### 已知分歧（第四批要消掉的清单）", "", ...list, MARKS[1]].join("\n");
}

/** the doc with its section replaced by `text` */
export function withSummary(doc: string, text: string): string {
  const a = doc.indexOf(MARKS[0]);
  const b = doc.indexOf(MARKS[1]);
  if (a < 0 || b < a) throw new Error(`docs/交互规则.md has no section between ${MARKS[0]} and ${MARKS[1]}`);
  return doc.slice(0, a) + text + doc.slice(b + MARKS[1].length);
}

if (import.meta.main) {
  const doc = readFileSync(DOC_PATH, "utf8");
  writeFileSync(DOC_PATH, withSummary(doc, summaryMarkdown()));
  console.log("wrote docs/交互规则.md");
}
