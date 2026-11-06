import { partBySlug, reader } from "./registry";
import type { PartRole } from "./types";

/** the smallest slice of an `Item` a role is read off: a component's slug and prop values
 *  (a floating toolbar is a `floatingBottom`, a docked one a `bottom`). */
type RoleOf = { component?: string; props?: Record<string, unknown> };

/** What a part does on a screen, for Tidy and the prompt: where it is pinned and how it is
 *  described. A part answers from its `PartDef.role`; the parts that belong in the body rows
 *  answer undefined. */
export function roleOf(it: RoleOf): PartRole | undefined {
  const def = partBySlug(it.component);
  const r = def?.role;
  return typeof r === "function" ? r(reader(def!, it.props)) : r;
}

/** spans the screen edge to edge: the bars and a carousel, whose row is the screen.
 *  A sheet or drawer pinned to the bottom keeps its own width; a box pinned there is a bar
 *  built of atoms (a kit's tab bar, buy bar, chat input or sheet), and spans it. */
export const fullWidth = (it: RoleOf): boolean => {
  const r = roleOf(it);
  if (r === "top" || r === "fullWidth") return true;
  return r === "bottom" && (it.component === "navigation-bar" || it.component === "box");
};
