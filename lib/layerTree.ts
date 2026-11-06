/* The canvas as a tree of layers, the way a design tool's layers panel and its selection read it: screens, then the
 * boxes on them, then what each box holds, down to the atoms. A part's parent is the container whose auto layout
 * places it, else the smallest container it lies wholly inside and is drawn over (lib/tokens `heldBy`); a hand-made
 * group and a run of joined parts are nodes of their own with their parts under them.
 *
 * The same tree answers what a click on the canvas selects (the outermost layer in the current context, as in Figma),
 * what Enter and Shift+Enter go to, and which sibling Tab steps to. Pure functions of the document and its measures. */

import { flowOf } from "./flow";
import { explodeGroup, frameOfPart, groupBounds, holdsParts, liesInside, ownerIdOf, type Frame, type Group, type Item } from "./tokens";

type Widths = Record<string, number>;

export type LayerKind = "screen" | "box" | "kit" | "instance" | "group" | "run" | "part" | "item";

export type LayerNode = {
  /** the node's id: a screen's is `s:` and its id, a group's is the group's, a part of a group or a run `group:item` */
  id: string;
  kind: LayerKind;
  /** the group the node is, or stands in */
  groupId?: string;
  /** the screen a screen node is */
  frameId?: string;
  /** the part a node shows, for its name and icon: the group's first, or the one part of an item node */
  item?: Item;
  /** what selecting the node selects */
  itemIds: string[];
  /** the parent node, null at the top of a screen (or of the canvas with no screens) */
  parent: string | null;
  /** the nodes under it, in the order the panel lists them: a layout's in its run, anything else front first */
  children: string[];
  /** the auto layout of a box, when it has one */
  flow?: "row" | "column" | "grid" | "wrap";
  /** the node is placed by its parent's layout, or stands loose in it */
  placed?: "flow" | "absolute";
  locked?: boolean;
  hidden?: boolean;
};

export type LayerTree = {
  nodes: Map<string, LayerNode>;
  /** the top: the screens in their order (or, with no screens, the canvas's top layers front first) */
  roots: string[];
  /** what stands on no screen, front first */
  loose: string[];
  /** the node a part is shown as */
  nodeOfItem: Map<string, string>;
};

export const screenNodeId = (frameId: string) => `s:${frameId}`;

/** The parent group of each group: the layout that places it, else the smallest container it lies inside and is drawn
 *  over, among the groups of the same screen. Buckets by screen so a large document stays quick. */
export function parentGroups(groups: Group[], widths: Widths, screenOf: (g: Group) => string | undefined): Map<string, string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const index = new Map(groups.map((g, i) => [g.id, i]));
  const parent = new Map<string, string>();
  const buckets = new Map<string, Group[]>();
  for (const g of groups) {
    const key = screenOf(g) ?? "";
    const list = buckets.get(key);
    if (list) list.push(g);
    else buckets.set(key, [g]);
  }
  for (const list of buckets.values()) {
    const holders = list.filter(holdsParts).map((c) => {
      const b = groupBounds(c, widths);
      return { c, b, area: (b.r - b.l) * (b.b - b.t), at: index.get(c.id)! };
    });
    for (const g of list) {
      if (g.inFlow && byId.has(g.inFlow) && g.inFlow !== g.id) {
        parent.set(g.id, g.inFlow);
        continue;
      }
      const owner = ownerIdOf(g.id);
      if (owner && byId.has(owner)) {
        parent.set(g.id, owner);
        continue;
      }
      const at = index.get(g.id)!;
      let best: { id: string; area: number } | null = null;
      for (const h of holders) {
        if (h.c.id === g.id || h.at > at || (best && h.area >= best.area)) continue;
        if (liesInside(g, h.b, widths)) best = { id: h.c.id, area: h.area };
      }
      if (best) parent.set(g.id, best.id);
    }
  }
  /* a cycle a hand-edited file could make is broken where it closes */
  for (const g of groups) {
    const seen = new Set<string>([g.id]);
    let at = parent.get(g.id);
    while (at) {
      if (seen.has(at)) {
        parent.delete(g.id);
        break;
      }
      seen.add(at);
      at = parent.get(at);
    }
  }
  return parent;
}

const kindOf = (g: Group): LayerKind => (g.instanceOf ? "instance" : g.free ? "group" : g.items.length > 1 ? "run" : holdsParts(g) ? (g.kit ? "kit" : "box") : "part");

function flowWord(g: Group): LayerNode["flow"] {
  const f = flowOf(g);
  if (!f) return undefined;
  return f.dir === "row" && f.wrap ? "wrap" : f.dir;
}

/** The whole canvas as layers. `frameOf` says which screen each group stands on when the caller knows it already. */
export function layerTree(groups: Group[], frames: Frame[], widths: Widths, opts: { phone: boolean; frameOf?: Map<string, string> } = { phone: true }): LayerTree {
  const screenOf = (g: Group) => (opts.phone ? (opts.frameOf ? opts.frameOf.get(g.id) : frameOfPart(g, groups, frames, widths)?.id) : undefined);
  const parent = parentGroups(groups, widths, screenOf);
  const nodes = new Map<string, LayerNode>();
  const nodeOfItem = new Map<string, string>();
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const g of groups) {
    const kind = kindOf(g);
    const lead = g.items[0];
    const host = g.inFlow ? byId.get(g.inFlow) : undefined;
    const inHostFlow = !!host && parent.get(g.id) === host.id && !!flowOf(host);
    const node: LayerNode = {
      id: g.id,
      kind,
      groupId: g.id,
      item: lead,
      itemIds: g.items.map((it) => it.id),
      parent: null,
      children: [],
      ...(kind === "box" || kind === "kit" ? { flow: flowWord(g) } : {}),
      ...(inHostFlow ? { placed: g.items.length === 1 && g.items[0].flowAbsolute ? ("absolute" as const) : ("flow" as const) } : {}),
      ...(g.locked ? { locked: true } : {}),
      ...(g.hidden ? { hidden: true } : {}),
    };
    nodes.set(g.id, node);
    if (kind === "group" || kind === "run") {
      /* a hand-made group lists its parts front first; a run in its reading order */
      const parts = kind === "group" ? [...explodeGroup(g, widths)].reverse().map((r) => r.items[0]) : g.items;
      for (const it of parts) {
        const id = `${g.id}:${it.id}`;
        nodes.set(id, { id, kind: "item", groupId: g.id, item: it, itemIds: [it.id], parent: g.id, children: [], ...(g.locked ? { locked: true } : {}), ...(g.hidden ? { hidden: true } : {}) });
        node.children.push(id);
        nodeOfItem.set(it.id, id);
      }
    } else for (const it of g.items) nodeOfItem.set(it.id, g.id);
  }
  /* what a layout places is listed in its run; anything else front first, as it is drawn */
  const kidsOf = new Map<string, Group[]>();
  const tops = new Map<string, Group[]>();
  for (const g of groups) {
    const p = parent.get(g.id);
    if (p) {
      const list = kidsOf.get(p);
      if (list) list.push(g);
      else kidsOf.set(p, [g]);
      nodes.get(g.id)!.parent = p;
    } else {
      const key = screenOf(g) ?? "";
      const list = tops.get(key);
      if (list) list.push(g);
      else tops.set(key, [g]);
    }
  }
  for (const [p, kids] of kidsOf) {
    const host = byId.get(p);
    const node = nodes.get(p);
    if (!host || !node) continue;
    node.children = (flowOf(host) ? kids : [...kids].reverse()).map((g) => g.id);
  }
  const roots: string[] = [];
  if (opts.phone) {
    for (const f of frames) {
      const id = screenNodeId(f.id);
      const top = [...(tops.get(f.id) ?? [])].reverse().map((g) => g.id);
      nodes.set(id, { id, kind: "screen", frameId: f.id, itemIds: [], parent: null, children: top });
      for (const c of top) nodes.get(c)!.parent = id;
      roots.push(id);
    }
  } else roots.push(...[...(tops.get("") ?? [])].reverse().map((g) => g.id));
  const loose = opts.phone ? [...(tops.get("") ?? [])].reverse().map((g) => g.id) : [];
  return { nodes, roots, loose, nodeOfItem };
}

/* ---------- reading the selection through the tree ---------- */

/** the nodes a selection of parts stands for: a group whose parts are all selected is the group */
export function selectedNodes(tree: LayerTree, selection: string[]): string[] {
  const sel = new Set(selection);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of selection) {
    let n = tree.nodeOfItem.get(id);
    if (!n) continue;
    const node = tree.nodes.get(n)!;
    if (node.kind === "item" && node.parent) {
      const g = tree.nodes.get(node.parent)!;
      if (g.itemIds.every((x) => sel.has(x))) n = g.id;
    }
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** the node and every node above it, nearest first, up to (not including) its screen */
export function chainOf(tree: LayerTree, nodeId: string): string[] {
  const out: string[] = [];
  let at: string | null = nodeId;
  while (at) {
    const n = tree.nodes.get(at);
    if (!n || n.kind === "screen") break;
    out.push(at);
    at = n.parent;
  }
  return out;
}

const ROOT = "\u0000root";
/** a run of joined parts is no level of its own on the canvas: its parts are picked one by one, as they always were */
const pickable = (n: LayerNode) => n.kind !== "run";

/** What a press on a part selects. Plain, the outermost layer under it in the context of what is selected now: a
 *  sibling of the selection or of anything above it. `deep` (Ctrl/Cmd) takes the part itself. */
export function pickTarget(tree: LayerTree, itemId: string, selection: string[], deep = false): string[] {
  const leaf = tree.nodeOfItem.get(itemId);
  if (!leaf) return [itemId];
  if (deep) return [itemId];
  const chain = chainOf(tree, leaf).filter((id) => pickable(tree.nodes.get(id)!));
  if (!chain.length) return [itemId];
  /* the context: the parents of what is selected, and everything above them */
  const context = new Set<string>();
  for (const s of selectedNodes(tree, selection)) {
    let p = tree.nodes.get(s)?.parent ?? null;
    context.add(p && tree.nodes.get(p)?.kind !== "screen" ? p : ROOT);
    while (p) {
      const n = tree.nodes.get(p);
      if (!n || n.kind === "screen") break;
      p = n.parent;
      context.add(p && tree.nodes.get(p)?.kind !== "screen" ? p : ROOT);
    }
  }
  const parentKey = (id: string) => {
    const p = tree.nodes.get(id)?.parent ?? null;
    return p && tree.nodes.get(p)?.kind !== "screen" ? p : ROOT;
  };
  if (context.size) for (const id of chain) if (context.has(parentKey(id))) return tree.nodes.get(id)!.itemIds;
  return tree.nodes.get(chain[chain.length - 1])!.itemIds;
}

/** What a double-click on a part selects: one level further in than the selected layer it is inside, else what a press
 *  would. */
export function pickInside(tree: LayerTree, itemId: string, selection: string[]): string[] {
  const leaf = tree.nodeOfItem.get(itemId);
  if (!leaf) return [itemId];
  const chain = chainOf(tree, leaf).filter((id) => pickable(tree.nodes.get(id)!));
  const sel = new Set(selectedNodes(tree, selection));
  const at = chain.findIndex((id) => sel.has(id));
  if (at > 0) return tree.nodes.get(chain[at - 1])!.itemIds;
  return pickTarget(tree, itemId, selection);
}

/** Enter: the children of what is selected. Null when nothing selected holds anything. */
export function childrenOfSelection(tree: LayerTree, selection: string[]): string[] | null {
  const out: string[] = [];
  for (const s of selectedNodes(tree, selection)) for (const c of tree.nodes.get(s)?.children ?? []) out.push(...tree.nodes.get(c)!.itemIds);
  return out.length ? out : null;
}

/** Shift+Enter: the parents of what is selected; a top layer's parent is its screen. Null when there is none. */
export function parentOfSelection(tree: LayerTree, selection: string[]): { items: string[] } | { screen: string } | null {
  const parents = new Set<string>();
  let screen: string | null = null;
  for (const s of selectedNodes(tree, selection)) {
    let p = tree.nodes.get(s)?.parent ?? null;
    /* a run is no level on the canvas: its parent stands for it */
    while (p && tree.nodes.get(p)?.kind === "run") p = tree.nodes.get(p)?.parent ?? null;
    const n = p ? tree.nodes.get(p) : undefined;
    if (!n) continue;
    if (n.kind === "screen") screen = n.frameId ?? null;
    else parents.add(n.id);
  }
  if (parents.size) return { items: [...parents].flatMap((id) => tree.nodes.get(id)!.itemIds) };
  return screen ? { screen } : null;
}

/** Tab and Shift+Tab: the next or the previous sibling of the last selected layer, round the end. */
export function siblingOf(tree: LayerTree, selection: string[], dir: 1 | -1): string[] | null {
  const nodes = selectedNodes(tree, selection);
  const last = nodes[nodes.length - 1];
  const node = last ? tree.nodes.get(last) : undefined;
  if (!node) return null;
  const siblings = node.parent ? (tree.nodes.get(node.parent)?.children ?? []) : tree.roots.includes(last) ? tree.roots : tree.loose;
  if (siblings.length < 2) return null;
  const at = siblings.indexOf(last);
  /* the panel lists the front first; Tab walks down the list */
  const next = siblings[(at + dir + siblings.length) % siblings.length];
  return tree.nodes.get(next)?.itemIds ?? null;
}

/** every node above a node, nearest first, screens included: what the panel opens to show it */
export function ancestorsOf(tree: LayerTree, nodeId: string): string[] {
  const out: string[] = [];
  let at = tree.nodes.get(nodeId)?.parent ?? null;
  while (at) {
    out.push(at);
    at = tree.nodes.get(at)?.parent ?? null;
  }
  return out;
}

/** The node's parts and everything they hold: what a layer row's outline on the canvas covers. */
export function itemsUnder(tree: LayerTree, nodeId: string): string[] {
  const n = tree.nodes.get(nodeId);
  if (!n) return [];
  return [...n.itemIds, ...n.children.flatMap((c) => itemsUnder(tree, c))];
}
