/* What a turn of the agent changed, for the author to look over before keeping it: the screens and parts added,
 * removed and changed, how many only moved (a layout pass moves many), and which document-wide fields changed. */

import { partBySlug } from "../../parts/registry";
import { labelOfPart } from "../../parts/resize";
import type { Doc, Group, Item } from "../tokens";

export type Named = { id: string; name: string };
export type DocDiff = {
  screens: { added: Named[]; removed: Named[]; changed: Named[] };
  nodes: { added: Named[]; removed: Named[]; changed: Named[]; moved: number };
  /** document fields that changed: title, theme, styles, vars, collections, components… */
  doc: string[];
};

const nameOf = (it: Item, g?: Group): string => g?.name || labelOfPart(partBySlug(it.component), it.props) || partBySlug(it.component)?.name || it.component || it.id;

/** everything about a group but where it stands and what it holds */
const groupRest = (g: Group) => {
  const { x: _x, y: _y, items: _items, ...rest } = g;
  return JSON.stringify(rest);
};

export function diffDocs(a: Doc, b: Doc): DocDiff {
  const fa = new Map(a.frames.map((f) => [f.id, f]));
  const fb = new Map(b.frames.map((f) => [f.id, f]));
  const screens: DocDiff["screens"] = { added: [], removed: [], changed: [] };
  for (const f of b.frames) {
    const was = fa.get(f.id);
    if (!was) screens.added.push({ id: f.id, name: f.name });
    else if (JSON.stringify(was) !== JSON.stringify(f)) screens.changed.push({ id: f.id, name: f.name });
  }
  for (const f of a.frames) if (!fb.has(f.id)) screens.removed.push({ id: f.id, name: f.name });

  type Placed = { it: Item; g: Group };
  const index = (d: Doc) => new Map<string, Placed>(d.groups.flatMap((g) => g.items.map((it) => [it.id, { it, g }] as const)));
  const ia = index(a);
  const ib = index(b);
  const nodes: DocDiff["nodes"] = { added: [], removed: [], changed: [], moved: 0 };
  for (const [id, { it, g }] of ib) {
    const was = ia.get(id);
    if (!was) {
      nodes.added.push({ id, name: nameOf(it, g) });
      continue;
    }
    if (was.it === it && was.g === g) continue;
    if (JSON.stringify(was.it) !== JSON.stringify(it) || groupRest(was.g) !== groupRest(g)) nodes.changed.push({ id, name: nameOf(it, g) });
    else if (was.g.x !== g.x || was.g.y !== g.y) nodes.moved++;
  }
  for (const [id, { it, g }] of ia) if (!ib.has(id)) nodes.removed.push({ id, name: nameOf(it, g) });

  const doc: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "groups" || k === "frames") continue;
    if (JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((b as Record<string, unknown>)[k])) doc.push(k);
  }
  return { screens, nodes, doc };
}

export const isEmptyDiff = (d: DocDiff) =>
  !d.screens.added.length && !d.screens.removed.length && !d.screens.changed.length && !d.nodes.added.length && !d.nodes.removed.length && !d.nodes.changed.length && !d.nodes.moved && !d.doc.length;

/** the screens a turn touched: added or changed itself, or holding a part that was added or changed */
export function touchedScreens(d: DocDiff, after: Doc, screenOf: (partId: string) => string | undefined): string[] {
  const ids = new Set<string>([...d.screens.added, ...d.screens.changed].map((s) => s.id));
  for (const n of [...d.nodes.added, ...d.nodes.changed]) {
    const s = screenOf(n.id);
    if (s) ids.add(s);
  }
  return after.frames.map((f) => f.id).filter((id) => ids.has(id));
}
