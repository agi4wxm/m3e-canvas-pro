/* What a document says of its world views (docs/组件规范.md “世界视口”): the input actions each world says it takes,
 * which the editor's checks hold the design's `move`, `press` and `release` to. The editor's own; not copied into an
 * exported app. */

import { partBySlug } from "../../parts/registry";
import type { Item } from "../tokens";
import { inputDeclsOf } from "../../parts/defs/world";
import type { WorldInputDecl } from "./types";
import { EXAMPLE_WORLD_CONTRACT, type WorldContract } from "./contract";

export { inputDeclsOf };

/** The input actions a world view says its world takes (its `inputs` prop, the definition's default when it has none
 *  of its own), each with its type where it says one; none when the part is no world view or says none, which takes any. */
export function worldInputsOf(it: Pick<Item, "component" | "props">): WorldInputDecl[] {
  const def = partBySlug(it.component);
  if (!def?.world) return [];
  const given = it.props?.inputs;
  return inputDeclsOf(given === undefined ? def.props.find((p) => p.key === "inputs")?.default : given);
}

/** The contract of the world a document's world views host, whose snapshot the `world` root reads (lib/world/root.ts):
 *  the one place the editor's checks, suggestions and the exports ask for it. Today every world view hosts M3E's example
 *  engine; a world contract a game loop hands in (the plan's batch 7) is read here instead. */
export function worldContractOf(_doc?: unknown): WorldContract {
  return EXAMPLE_WORLD_CONTRACT;
}

/** the ids of the entities the document's world views start with (their `entities` tables): what `world.byId.` offers */
export function worldIdsOf(doc: { groups: { items: Pick<Item, "component" | "props">[] }[] }): string[] {
  const out = new Set<string>();
  for (const g of doc.groups)
    for (const it of g.items) {
      const def = partBySlug(it.component);
      if (!def?.world) continue;
      const t = (it.props?.entities ?? def.props.find((p) => p.key === "entities")?.default) as { rows?: unknown[][] } | undefined;
      for (const r of t?.rows ?? []) if (typeof r?.[0] === "string" && r[0]) out.add(r[0]);
    }
  return [...out].slice(0, 200);
}
