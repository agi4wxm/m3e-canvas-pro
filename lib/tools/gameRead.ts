/* The tool that reads the document's gameplay contract (lib/game, docs/玩法契约.md): the game loop's commands as the
 * calls and input actions a design makes, each refusal with the condition a catch branches on, its events, snapshot,
 * clock and facts, and what in the design no longer matches it. It changes nothing. */

import { apiCommands, gameGaps, gameInputsText, gameOperationId, refusalsOf, type GameContract } from "../game";
import type { JsonSchema } from "../api/types";
import { tool, type Tool } from "./types";

/** a schema's fields in a line: `count*: integer(1|10), note: string` */
function fields(schema: JsonSchema | undefined): string {
  if (!schema || typeof schema !== "object" || typeof schema.properties !== "object" || !schema.properties) return "";
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.entries(schema.properties as Record<string, JsonSchema>)
    .map(([k, v]) => {
      const o = typeof v === "object" && v ? v : {};
      const type = Array.isArray(o.type) ? o.type.join("|") : String(o.type ?? "any");
      return `${k}${required.has(k) ? "*" : ""}: ${type}${Array.isArray(o.enum) ? `(${o.enum.map(String).join("|")})` : ""}`;
    })
    .join(", ");
}

export function gameOutline(c: GameContract, path: string | undefined, example: boolean): string[] {
  const lines = [
    `Gameplay contract ${c.namespace} ${c.contractVersion}${example ? " (M3E's example, standing in until the game loop's own is linked)" : ""}${path ? `, read from ${path} beside the project` : ""}: the game loop's, read-only. ${c.summary ?? ""}`.trim(),
    "Commands sent as calls ({do: \"call\", operationId, args: {param: expression}, then: reads response, catch: reads error}; branch the catch on a refusal with when: {expr: <condition>}, else: ...):",
  ];
  for (const [name, cmd] of apiCommands(c)) {
    lines.push(`- ${gameOperationId(c.namespace, name)}: ${cmd.summary ?? ""}`.trimEnd());
    lines.push(`  args {${fields(cmd.params)}} → response {${fields(cmd.result)}}`);
    for (const r of refusalsOf(c, name, cmd)) lines.push(`  refuses ${r.code} (${r.status}, ${r.title}): when ${r.condition}`);
  }
  const inputs = gameInputsText(c);
  lines.push(inputs ? `Commands sent as input actions to a world-view (its inputs prop: "${inputs}"): move for a vec2, press and release for a bool.` : "No input actions.");
  lines.push(`Events a world-view's actions run on: ${Object.entries(c.events).map(([n, e]) => `on:${n} {${fields(e.payload)}}`).join(", ") || "none"}.`);
  lines.push(`Snapshot (what the HUD reads): {${fields(c.snapshot)}}. Clock: world time in ${c.clock.unit}, ${c.clock.pausable ? "pausable" : "never paused"}, rates ${c.clock.rates.join(", ")}.`);
  const facts = Object.entries(c.facts ?? {});
  if (facts.length) lines.push(`Facts other systems tell the game loop, never the app (do not call them): ${facts.map(([n, f]) => `${n} from ${f.from}`).join(", ")}.`);
  return lines;
}

const getGameContract = tool<Record<string, never>>({
  name: "get_game_contract",
  group: "read",
  description:
    "The document's gameplay contract, the game loop's (read-only): each command as the call a design makes (operationId game.<command>, its args and response) with every refusal and the condition a catch branches on (error.type == '<problem type>'), the input actions a world-view takes, its events, snapshot, clock and the facts only other systems send, and the gaps: what in the design no longer matches it.",
  input: { type: "object", properties: {}, required: [], additionalProperties: false },
  output: "the contract and its gaps as text",
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const doc = env.store.get().doc;
    const link = doc.game;
    if (!link) return { result: "The document links no gameplay contract. A game loop's contract file (format m3e-game) is linked with import_game_contract; the game templates (gacha-pull, daily-check-in) bring M3E's example one." };
    const gaps = gameGaps(doc);
    return {
      result: [...gameOutline(link.contract, link.path, !!link.example), "", gaps.length ? `Gaps (${gaps.length}):\n${gaps.slice(0, 40).map((g) => `- ${g.kind} ${g.ref} at ${g.where}: ${g.detail}`).join("\n")}` : "Gaps: none, the design matches the contract."].join("\n"),
    };
  },
});

export const GAME_READ_TOOLS: Tool<never>[] = [getGameContract as unknown as Tool<never>];
