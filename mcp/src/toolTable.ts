/* The tool list of docs/MCP.md, written from the registry so it names exactly the tools there are (`bun run mcp:docs`
 * writes it; mcp/src/docs.test.ts fails when the file is behind). */

import { createRegistry } from "../../lib/tools";
import { GENERATE_TOOLS } from "../../lib/tools/generate";
import type { ToolGroup } from "../../lib/tools/types";

export const TABLE_START = "<!-- tools:start (bun run mcp:docs) -->";
export const TABLE_END = "<!-- tools:end -->";

const GROUP: Record<ToolGroup, string> = { read: "读取", edit: "搭建", style: "风格", data: "数据与交互", generate: "生成（需 OPENAI_API_KEY）" };

/** a description's first sentence, fit for a table cell */
const firstSentence = (s: string) => {
  const m = /^(.*?[.!?])(\s|$)/.exec(s);
  /* a name like svg:<id> is words in a cell, not a tag */
  const one = (m ? m[1] : s).replaceAll("|", "\\|").replaceAll("<", "&lt;").replace(/\s+/g, " ").trim();
  return one.length > 180 ? `${one.slice(0, 179)}…` : one;
};

export function toolTable(): string {
  const tools = createRegistry({ extra: GENERATE_TOOLS }).tools;
  const rows = tools.map((t) => `| \`${t.name}\` | ${GROUP[t.group]} | ${t.readOnly ? "是" : ""} | ${t.destructive ? "是" : t.name === "apply_ops" ? "含破坏性操作时" : ""} | ${firstSentence(t.description)} |`);
  return [
    TABLE_START,
    "",
    `共 ${tools.length + 4} 个工具：服务器环境里没有 OPENAI_API_KEY 时不含“生成”组，只读会话只列出“只读”一栏为“是”的，\`undo\`、\`redo\`、\`export_product\` 只在文件模式里有。说明取自工具给模型看的描述。`,
    "",
    "| 工具 | 组 | 只读 | 需作者确认 | 说明 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "| `undo` | 文件模式自带 |  |  | Takes back the last change this server made to the project file (one tool call, or one apply_ops batch) and saves the file. |",
    "| `redo` | 文件模式自带 |  |  | Makes the last change undo took back again, and saves the file. |",
    "| `export_product` | 文件模式自带 |  |  | Exports the project as a whole product (an npm workspaces monorepo) into a folder; exporting again never overwrites custom code, see [导出](导出.md). |",
    "| `connection_status` | 服务器自带 | 是 |  | Where this server's calls go, whether an editor tab is paired, and the pairing code when none is. |",
    "",
    TABLE_END,
  ].join("\n");
}

/** the document with its table replaced by the current one */
export function withTable(doc: string): string {
  const a = doc.indexOf(TABLE_START);
  const b = doc.indexOf(TABLE_END);
  if (a < 0 || b < a) throw new Error("docs/MCP.md has no tool table markers");
  return doc.slice(0, a) + toolTable() + doc.slice(b + TABLE_END.length);
}
