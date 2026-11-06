/* A whole tree of parts added in one operation: boxes with auto layout holding text, icons, vectors, pictures, inputs,
 * buttons and other boxes, each with its props, colors and look, the way a kit is made (parts/kits) but written by
 * whoever calls it. It is how a model composes something the catalog does not have (a prompt box, a game's HUD, a row
 * of a screenshot it is copying) in one call and one undo step, instead of a part at a time. Every node is checked
 * against its part's props and the fields a part may carry, with the path of the node in the message. */

import { settleSizes } from "../../../parts/atoms";
import { partBySlug, PARTS, tierOf } from "../../../parts/registry";
import { arranged, defaultMeasures, seedGroups, type Node } from "../../../parts/templates/kit";
import { settleInFlow } from "../../flow";
import { landTree, moveTo, roomOn, treeSize } from "../../kits";
import { tidyLook } from "../../look";
import { metricsOf } from "../../styleLayout";
import { COLOR_TOKENS, frameRect, frameSizeOf, STAY_TARGET, TEXT_TOKENS, type Action, type Condition, type Group, type Item } from "../../tokens";
import { op, OpError, S, type Schema } from "../op";
import { withGroups, withSession, type CoreState } from "../state";
import { frameById, freshId, freshPart, groupById, laidOut, spotOn } from "./common";
import { intoFlow } from "./nodes";
import { actionError, checkItemPatch, cleanedLook, conditionError, fullAction } from "./validate";

/** one node of a tree as a caller writes it */
export type TreeNode = {
  /** the part's slug: box, text, icon, svg, image, button, input… */
  part: string;
  id?: string;
  /** what the layers call it */
  name?: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
  /** takes the room left along its box's run */
  grow?: boolean;
  fill?: string;
  textColor?: string;
  corners?: { tl: number; tr: number; bl: number; br: number };
  look?: Record<string, unknown>;
  action?: Record<string, unknown>;
  note?: string;
  bind?: Record<string, string>;
  flowSize?: { w?: string; h?: string };
  alignSelf?: string;
  flowAbsolute?: boolean;
  flowMin?: { w?: number; h?: number };
  flowMax?: { w?: number; h?: number };
  flowSpan?: number;
  showWhen?: Condition;
  hidden?: boolean;
};

export type AddTreeArgs = { tree: TreeNode; screen?: string; at?: { x: number; y: number }; into?: { container: string; index?: number }; label?: string };

/** how big a tree may be: a screen is a few hundred parts at most, and a runaway answer should not freeze the editor */
const MAX_NODES = 600;
const MAX_DEPTH = 24;

/** the fields of a node that land on its part as they are */
const ITEM_KEYS = ["fill", "textColor", "corners", "look", "action", "note", "bind", "flowSize", "alignSelf", "flowAbsolute", "flowMin", "flowMax", "flowSpan"] as const;
const NODE_KEYS = new Set<string>(["part", "id", "name", "props", "children", "grow", "showWhen", "hidden", ...ITEM_KEYS]);

/** the slugs a caller most likely meant, for a part that does not exist */
function near(slug: string): string {
  const s = slug.toLowerCase();
  const atoms = PARTS.filter((d) => tierOf(d) === "atom").map((d) => d.slug);
  const like = PARTS.map((d) => d.slug).filter((x) => x.includes(s) || s.includes(x));
  return [...new Set([...like.slice(0, 6), ...atoms])].slice(0, 24).join(", ");
}

type Flat = { node: TreeNode; path: string; parent?: TreeNode };

/** The tree checked, in the order its groups come out (each node, then what it holds): the parts exist, only a box with
 *  a layout holds anything, every prop and field is one the part takes, the ids are free. */
function checked(s: CoreState, root: unknown, strict: boolean): Flat[] {
  const out: Flat[] = [];
  const ids = new Set<string>();
  const visit = (n: unknown, path: string, depth: number, parent?: TreeNode) => {
    if (!n || typeof n !== "object" || Array.isArray(n)) throw new OpError("invalid_value", `${path} should be a node: {part, props?, children?}.`, path);
    const node = n as TreeNode;
    if (depth > MAX_DEPTH) throw new OpError("invalid_value", `${path} is nested deeper than ${MAX_DEPTH} levels.`, path);
    if (out.length >= MAX_NODES) throw new OpError("invalid_value", `The tree has more than ${MAX_NODES} nodes: add it in parts.`, path);
    for (const k of Object.keys(node)) if (!NODE_KEYS.has(k)) throw new OpError("invalid_value", `${path}.${k} is not a field of a node (they are ${[...NODE_KEYS].join(", ")}).`, `${path}.${k}`);
    if (typeof node.part !== "string") throw new OpError("invalid_value", `${path}.part is required: the part's slug (box, text, icon, svg, image, button…).`, `${path}.part`);
    const def = partBySlug(node.part);
    if (!def) throw new OpError("not_found", `${path}: there is no part "${node.part}". Parts that may be meant: ${near(node.part)}.`, `${path}.part`);
    const kids = node.children ?? [];
    if (!Array.isArray(kids)) throw new OpError("invalid_value", `${path}.children should be a list of nodes.`, `${path}.children`);
    if (kids.length && !(def.holds && def.flow)) throw new OpError("invalid_value", `${path}: a ${node.part} holds no parts; put children in a box.`, `${path}.children`);
    if (kids.length && node.props?.layout === "free") throw new OpError("invalid_value", `${path}: a box that holds children lays them out in a row, column or grid, not "free".`, `${path}.props.layout`);
    if (node.id !== undefined) {
      if (typeof node.id !== "string" || !node.id.trim()) throw new OpError("invalid_value", `${path}.id should be text.`, `${path}.id`);
      if (ids.has(node.id)) throw new OpError("invalid_value", `${path}: the id ${JSON.stringify(node.id)} is used twice in the tree.`, `${path}.id`);
      freshId(s, node.id, () => "");
      ids.add(node.id);
    }
    if (node.name !== undefined && typeof node.name !== "string") throw new OpError("invalid_value", `${path}.name should be text.`, `${path}.name`);
    if (node.grow !== undefined && typeof node.grow !== "boolean") throw new OpError("invalid_value", `${path}.grow should be true or false.`, `${path}.grow`);
    if (strict) {
      const patch: Record<string, unknown> = node.props ? { props: node.props } : {};
      for (const k of ITEM_KEYS) if (node[k] !== undefined && k !== "action" && k !== "bind") patch[k] = node[k];
      try {
        checkItemPatch({ ...freshPart(node.part, false), id: node.id ?? "" }, patch, s);
        if (node.look !== undefined) cleanedLook(node.look);
      } catch (e) {
        if (e instanceof OpError) throw new OpError(e.code, `${path}: ${e.message}`, `${path}.${e.about ?? ""}`);
        throw e;
      }
      if (node.showWhen !== undefined) {
        const c = conditionError(node.showWhen, s);
        if (c) throw new OpError("invalid_value", `${path}.showWhen: ${c}.`, `${path}.showWhen`);
      }
      if (node.hidden !== undefined && typeof node.hidden !== "boolean") throw new OpError("invalid_value", `${path}.hidden should be true or false.`, `${path}.hidden`);
    }
    out.push({ node, path, parent });
    kids.forEach((k, i) => visit(k, `${path}.children[${i}]`, depth + 1, node));
  };
  visit(root, "tree", 0);
  /* taps and bindings may name parts and variables of the tree itself, so they are checked once every id is known */
  if (strict)
    for (const { node, path } of out) {
      if (node.action !== undefined) {
        const e = actionError(tapOf(node.action), withTreeIds(s, ids));
        if (e) throw new OpError("invalid_value", `${path}.action: ${e}.`, `${path}.action`);
      }
      if (node.bind !== undefined) {
        try {
          checkItemPatch({ ...freshPart(node.part, false), id: node.id ?? "" }, { bind: node.bind }, s);
        } catch (e) {
          if (e instanceof OpError) throw new OpError(e.code, `${path}: ${e.message}`, `${path}.bind`);
          throw e;
        }
      }
    }
  return out;
}

/** the state with stand-ins for the tree's own parts, so a tap in the tree can show or hide another part of it */
function withTreeIds(s: CoreState, ids: Set<string>): CoreState {
  if (!ids.size) return s;
  const stand: Group = { id: "\u0000tree", x: 0, y: 0, axis: "x", items: [...ids].map((id) => ({ ...freshPart("box", false), id })) };
  return withGroups(s, [...s.doc.groups, stand]);
}

/** a tap with only effects goes nowhere, which the document spells "none" */
const tapOf = (a: Record<string, unknown>): Action => fullAction({ ...a, to: typeof a.to === "string" ? a.to : STAY_TARGET } as Action);

/** Words hug themselves in a row and wrap at the column's width in a column that stretches them; elsewhere a short
 *  line hugs and a long one wraps. What a kit writes by choosing `text` or `para`. */
function fitOf(n: TreeNode, parent: TreeNode | undefined): string | undefined {
  if (n.part !== "text" || n.props?.fit !== undefined) return undefined;
  const layout = parent?.props?.layout ?? (parent ? "column" : undefined);
  if (layout === "row") return "auto";
  if ((layout === "column" || layout === "grid") && parent?.props?.align === "stretch") return "fixed";
  const words = typeof n.props?.text === "string" ? n.props.text : "";
  return words.length > 60 || n.props?.width !== undefined ? "fixed" : "auto";
}

/** the plain tree a kit is made of, so it settles its boxes' sizes the same way */
function toNode(n: TreeNode, parent?: TreeNode): Node {
  const fit = fitOf(n, parent);
  const name = n.name ? { en: n.name, zh: n.name, ja: n.name, ko: n.name } : undefined;
  return { slug: n.part, props: { ...(n.part === "box" ? { surface: "none", layout: "column", padX: 0, padY: 0, gap: 8 } : {}), ...n.props, ...(fit ? { fit } : {}) }, ...(name ? { name } : {}), ...(n.grow ? { grow: true } : {}), kids: (n.children ?? []).map((k) => toNode(k, n)) };
}

/** The tree as groups, outermost first, laid out by a guess at each part's size, its top left at 0,0. */
export function treeOf(s: CoreState, flat: Flat[], newId: () => string, maxWidth?: number): Group[] {
  const root = flat[0].node;
  const seeded = seedGroups({ id: "tree", name: { en: "", zh: "", ja: "", ko: "" }, frame: "phone", roots: [settleSizes(toNode(root))] });
  const groupIds = new Map(seeded.map((g) => [g.id, newId()]));
  let groups: Group[] = seeded.map((g, i) => {
    const { node } = flat[i];
    const { name, inFlow, items, at: _at, screenMain: _main, ...rest } = g;
    const base = items[0];
    const item: Item = { ...(base as unknown as Item), id: node.id ?? newId(), props: base.props as Item["props"] };
    for (const k of ITEM_KEYS) {
      const v = node[k];
      if (v === undefined) continue;
      if (k === "action") item.action = tapOf(v as Record<string, unknown>);
      else if (k === "look") item.look = tidyLook(cleanedLook(v) ?? undefined);
      else (item as Record<string, unknown>)[k] = v;
    }
    return {
      ...rest,
      id: groupIds.get(g.id)!,
      x: 0,
      y: 0,
      ...(name ? { name: name.en } : {}),
      ...(inFlow ? { inFlow: groupIds.get(inFlow)! } : {}),
      ...(node.showWhen ? { showWhen: node.showWhen } : {}),
      ...(node.hidden ? { hidden: true } : {}),
      items: [item],
    };
  });
  /* on a phone the root is brought down to the content width, and what it holds follows */
  const top = groups[0].items[0];
  if (maxWidth !== undefined && typeof top.props?.width === "number" && top.props.width > maxWidth) groups = [{ ...groups[0], items: [{ ...top, props: { ...top.props, width: Math.round(maxWidth) } }] }, ...groups.slice(1)];
  return arranged(groups);
}

const NODE: Schema = {
  type: "object",
  description: "a part and what it holds",
  properties: {
    part: S.str("the part's slug: box (the container, with surface and layout), text, icon, svg, image, button, icon-button, input, textarea, chip, avatar, badge, switch, checkbox, progress, separator… or a composite"),
    id: S.str("an id for later calls to name it"),
    name: S.str("its name in the layers"),
    props: S.any("prop values over the part's defaults (describe_part lists them); a box: surface, layout row|column|grid, gap, padX/padY or padTop…, align, justify, wrap, hugWidth/hugHeight (false to give it width/height of its own), width, height, pin"),
    children: { type: "array", description: "the parts a box holds, in reading order", items: { type: "object" } },
    grow: S.bool("takes the room left along its box's run"),
    fill: S.enum(COLOR_TOKENS.map((t) => t.key), "the surface's color role; any other color goes in look"),
    textColor: S.enum(TEXT_TOKENS.map((t) => t.key), "the words' color role; any other color goes in look"),
    corners: S.any("{tl, tr, bl, br} radii in dp"),
    look: S.any("effects (look_reference): fills, stroke, shadows, glass, text effects…"),
    action: S.any("what a tap does: {to, effects…}, as set_action takes it"),
    note: S.str(),
    bind: S.any("{prop: variable id}"),
    flowSize: S.any('{w?, h?}: "fixed" | "hug" | "fill"'),
    alignSelf: S.enum(["start", "center", "end", "stretch", "baseline"]),
    flowAbsolute: S.bool("out of its box's layout, drawn over it"),
    flowMin: S.any("{w?, h?} in dp"),
    flowMax: S.any("{w?, h?} in dp"),
    flowSpan: S.int("grid columns it spans"),
    showWhen: S.any("{var, op, value}: shown only while it holds"),
    hidden: S.bool("hidden when the preview starts"),
  },
  required: ["part"],
};

/** Adds a tree of parts: into a box's layout, at a point on a screen, or where there is room; a root pinned to an
 *  edge goes to that edge. One step; the root is selected. */
export const addTree = op<AddTreeArgs, { itemId: string; groupId: string; parts: number }>({
  name: "add_tree",
  summary: "Adds a whole tree of parts in one step: a box with auto layout holding atoms (text, icon, svg, image, button, input…) and other boxes, each with its props, colors and look. How to compose what the catalog has no part or kit for.",
  args: S.obj({ tree: NODE, screen: S.str("the screen it goes on"), at: S.point("where its top left lands, from the screen's top left"), into: S.obj({ container: S.str("a box with an auto layout"), index: S.int("its place in the run") }, ["container"]), label: S.str("the step's name") }, ["tree"]),
  label: (a) => a.label ?? `Add ${a.tree?.name ?? a.tree?.part ?? "tree"}`,
  run(s, a, ctx) {
    const flat = checked(s, a.tree, ctx.strict);
    const frames = s.doc.frames;
    const frame = a.screen !== undefined ? frameById(s, a.screen) : undefined;
    const host = a.into ? groupById(s, a.into.container) : undefined;
    const on = frame ?? frames.find((f) => f.id === s.session.frameId) ?? frames[0];
    const built = treeOf(s, flat, ctx.newId, host ? undefined : roomOn(on));
    const select = (state: CoreState, groupId: string) => {
      const itemId = state.doc.groups.find((g) => g.id === groupId)?.items[0]?.id ?? built[0].items[0].id;
      return { state: withSession(state, { selection: [itemId], frameId: null }), result: { itemId, groupId, parts: built.length } };
    };
    if (host) {
      const placed = moveTo(built, { x: host.x, y: host.y });
      const withRoot = intoFlow(s.doc.groups, placed[0], host.id, a.into!.index);
      const at = withRoot.findIndex((g) => g.id === placed[0].id);
      const groups = [...withRoot.slice(0, at + 1), ...placed.slice(1), ...withRoot.slice(at + 1)];
      return select(laidOut(withGroups(s, groups), { ...ctx.widths, ...defaultMeasures(placed) }), placed[0].id);
    }
    if (!on && !a.at) throw new OpError("invalid_value", "There is no screen to put it on: add a screen first, or give `at`.");
    const size = treeSize(built);
    let x: number;
    let y: number;
    if (a.at) {
      x = (frame?.x ?? 0) + a.at.x;
      y = (frame?.y ?? 0) + a.at.y;
    } else ({ x, y } = spotOn(s, on!, size, ctx.widths));
    const under = frames.find((f) => {
      const r = frameRect(f);
      return x + size.w / 2 >= r.l && x + size.w / 2 <= r.r && y + size.h / 2 >= r.t && y + size.h / 2 <= r.b;
    });
    /* as wide as the screen it lands on: it stands against the screen's left edge */
    const edge = !!under && size.w >= frameSizeOf(under).w - 1;
    const { groups: landed } = landTree(built, x, y, frames, edge, { groups: s.doc.groups, widths: ctx.widths, margin: metricsOf(s.doc.theme).margin });
    const top = landed[0];
    const measures = { ...ctx.widths, ...defaultMeasures(landed) };
    const groups = settleInFlow([...s.doc.groups, ...landed], top.id, measures);
    const state = withGroups(s, groups);
    return select(ctx.origin === "user" ? state : laidOut(state, measures), top.id);
  },
});
