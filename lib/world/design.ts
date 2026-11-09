/* What a document says of its world views (docs/组件规范.md “世界视口”): the input actions each world says it takes,
 * which the editor's checks hold the design's `move`, `press` and `release` to. The editor's own; not copied into an
 * exported app. */

import { partBySlug } from "../../parts/registry";
import type { Item } from "../tokens";
import { inputNamesOf } from "../../parts/defs/world";

export { inputNamesOf };

/** The input actions a world view says its world takes (its `inputs` prop, the definition's default when it has none
 *  of its own); none when the part is no world view or says none, which takes any. */
export function worldInputsOf(it: Pick<Item, "component" | "props">): string[] {
  const def = partBySlug(it.component);
  if (!def?.world) return [];
  const given = it.props?.inputs;
  return inputNamesOf(given === undefined ? def.props.find((p) => p.key === "inputs")?.default : given);
}
