/* The screen intermediate representation (report 9.2): what a screen of the design is, worked out once from the
 * document, for the phone app's printer (lib/export/rn/print.ts) and the mini-program's (lib/export/miniapp/print.ts)
 * to print on their kits. Neither decides any of this for itself any more:
 *
 *   the screens       which frames are screens, what each is called in the code (its key, its component: names.ts),
 *                     the groups on each, its size, its ground
 *   the placement     what stands loose where, what is pinned to an edge (the bars), what spans the screen, what floats
 *                     at the foot of a screen of data, what is a layer opened over it
 *   the runs          for each run on the screen what it is (a part, a row of parts, an instance, a split view and its
 *                     panes, an auto layout and what it holds) and what the layout around it asks of it (`cell`, `hugs`)
 *   the parts         each part's definition, size, taps of places, families of places, events (with what each
 *                     declares it carries), whether it submits, and the atoms it splits into
 *   the document      what taps show, hide, open and set (facts.ts), the forms each group is in
 *
 * A printer walks the plan and prints each node in its kit's terms (a `Cell`, a `Pin`, the kit's component for a part),
 * the data its runtime reads (an action as its kit's runtime names screens and parts), and the differences it has
 * from the design (a part its kit has no component for). What differs between the two is the kit, and what each kit's
 * runtime reads: never the reading of the design. */

import {
  PHONE_H,
  PHONE_W,
  explodeGroup,
  frameLengthOf,
  frameOfPart,
  frameSizeOf,
  groupBounds,
  layoutOf,
  normalizeTheme,
  ownerIdOf,
  unionRect,
  type Action,
  type Doc,
  type Frame,
  type Group,
  type Item,
} from "../../tokens";
import { partBySlug, reader, treeOf } from "../../../parts/registry";
import type { PartDef } from "../../../parts/types";
import { fullWidth, roleOf } from "../../../parts/role";
import type { Node } from "../../../parts/templates/kit";
import { expandDoc } from "../../expand";
import { inlineReads, mapConditionExprs, mapItemExprs, type ExprMap } from "../../refs";
import { getLang } from "../../i18n";
import { childLayoutOf, flowOf, sizingOf, type Flow } from "../../flow";
import { splitOf, panesOfSplit, PANE_SIDES } from "../../split";
import { kitLookOf, splitTaps } from "../../kits";
import { styleContext } from "../../styles";
import { pinOf } from "../../tidy";
import { footOf, type Foot } from "../../foot";
import { isOverlayPart } from "../../interact";
import { eventOfKey, eventsOf, familiesOf, familyOfKey, isPlaceKey } from "../../partContract";
import { formsOf } from "../../bindings/view";
import { slotTakes } from "../../capabilities/doc";
import type { CapabilitySpec } from "../../capabilities/types";
import { dockPanes, isLaidOutDock, offTabOf } from "../panes";
import { plainTree, type AtomTaps, type PlainNode } from "../rn/data";
import { kitPropName } from "../../../rn/src/kit/coverage";
import { exprOf, nameOf, str, withoutMarks } from "./code";
import { factsOf, type DocFacts } from "./facts";
import { screenNameParts } from "./names";

/* ---------- the plan ---------- */

/** A part's event that carries an action: its name, what it declares it carries (the payload an action reads as
 *  `event`) and the action on it. */
export type PartEvent = { key: string; name: string; payload: Record<string, unknown>; action: Action };

/** One part of a run: what it is, how big, and what is attached to it. */
export type PartNode = {
  item: Item;
  /** its definition; none for a part this version does not know */
  def?: PartDef;
  size: { w: number; h: number };
  /** the taps of its places (`like`, `tab:2`), in the order the design has them */
  places: [key: string, action: Action][];
  /** the action of each family of its places (`tab:*`) the part declares, by the family's prefix */
  families: [prefix: string, action: Action][];
  /** whether the design holds an action for a family of places at all (a part drawn as atoms keeps none) */
  familyKeys: boolean;
  /** the actions on its events (`on:submit`), each with what the event declares it carries */
  events: PartEvent[];
  /** whether a tap of it submits a form */
  submits: boolean;
};

/** A run (a group, or a piece of a free one) and what the layout around it asks of it. */
export type RunNode = {
  run: Group;
  /** what the auto layout it is in asks of it, as the props of a `Cell` around it; none standing loose */
  cell: [string, string][];
  content: RunContent;
};

export type RunContent =
  /** an instance standing in a layout: a box of its size, its parts placed in it */
  | { kind: "instance"; width: number; height: number; kids: Loose[] }
  /** a split view and its two panes, each a run filling its pane */
  | { kind: "split"; part: PartNode; panes: RunNode[] }
  /** one part */
  | { kind: "part"; part: PartNode }
  /** several parts side by side (`axis` "x") or one under another */
  | { kind: "items"; axis: "x" | "y"; parts: PartNode[] }
  /** a part with an auto layout and what it lays out: `flowing` when any of it is not placed absolutely; `hugs` its
   *  own size on each axis where the kit's default differs; `dock` what each tab holds when it switches its tabs */
  | { kind: "flow"; part: PartNode; flow: Flow; kids: RunNode[]; flowing: boolean; hugs: [string, string][]; dock?: [pane: number, kids: RunNode[]][] };

/** a run standing loose, placed from the top left of what it stands on */
export type Loose = { node: RunNode; x: number; y: number };

/** Where a run of the screen's body stands. `layer` says it is a part open over the screen that starts hidden (a
 *  dialog, a sheet): a kit that draws such a part as a layer of its own does, whatever its placement. */
export type Placement = { node: RunNode; layer: boolean } & (
  | { at: "pin"; edge: "top" | "bottom" | "floatingBottom" }
  | { at: "span"; y: number }
  | { at: "float"; x: number; bottom: number }
  | { at: "loose"; x: number; y: number }
);

export type ScreenPlan = {
  frame: Frame;
  /** what a tap goes to it by, and its component's name */
  key: string;
  component: string;
  /** the groups drawn on it */
  groups: Group[];
  width: number;
  height: number;
  /** how far it runs, when longer than the device */
  length: number;
  /** what stands on it, in the order it is drawn */
  body: Placement[];
  /** how tall the bars pinned to its foot are: a list that scrolls stops above them */
  footBars: number;
  /** on a screen that loads data (when the plan asks), what stays at its foot and the room its body leaves at its end */
  foot?: Foot;
  /** which form each group is in */
  forms: Map<string, string>;
};

export type DocPlan = {
  /** the document as the screens are printed from it: its instances expanded, the printer's characters cleared */
  doc: Doc;
  frames: Frame[];
  facts: DocFacts;
  keys: Map<string, string>;
  components: Map<string, string>;
  screens: ScreenPlan[];
};

export type PlanOptions = {
  /** what a screen's key and component are called: the kit's runtime knows screens by `keys` (`lower`: in camelCase),
   *  and neither ever takes a name it keeps for itself */
  names: { lower: boolean; reservedKeys?: string[]; reservedComponents?: string[] };
  /** whether a region's states are its own to switch between (each state's design is drawn), else only what it holds
   *  in its first state is on the screen, as a dock's other tabs are not */
  regions: boolean;
  /** whether a screen of data keeps what stands at its foot over its body (`foot`) */
  foot: boolean;
  /** the kit's defaults of a part's props, by the kit's prop names (a layout's `hugWidth`) */
  defaults: (slug: string) => Record<string, unknown>;
};

/** The plan of every screen of a document. Called within the document's styles (`withDocStyles`): what it reads of a
 *  part's layout may read a style. */
export function planScreens(source: Doc, widths: Record<string, number>, o: PlanOptions): DocPlan {
  const doc = rowsRead(expandDoc(withoutMarks(source), widths));
  let frames = doc.frame === "phone" ? doc.frames : [];
  if (!frames.length && doc.groups.length) {
    const { l, t, r, b } = unionRect(doc.groups.map((g) => groupBounds(g, widths)));
    frames = [{ id: "canvas", name: doc.title || "Screen", x: l, y: t, w: Math.max(PHONE_W, Math.round(r - l)), h: Math.max(PHONE_H / 2, Math.round(b - t)) }];
  }
  /* a screen's component is never the kit's Screen, which its file draws with; its key is never where a tap goes beside
     a screen in the kit's runtime ("back", "link", "none") */
  const taken = new Set<string>(o.names.reservedComponents ?? []);
  const keyed = new Set<string>(o.names.reservedKeys ?? []);
  const keys = new Map<string, string>();
  const components = new Map<string, string>();
  for (const f of frames) {
    const component = screenNameParts(f, false);
    components.set(f.id, nameOf(component.words, component.fallback, taken, "Screen"));
    const key = screenNameParts(f, true);
    keys.set(f.id, nameOf(key.words, key.fallback, keyed, "", o.names.lower));
  }
  /* what a dock's other tabs hold is left out, unless the dock lays it out and so switches its tabs itself
     (../panes.ts); a region's other states are its own to switch between where the kit draws them */
  const offTab = offTabOf(o.regions ? doc.groups.map((g) => (g.states ? { ...g, states: undefined } : g)) : doc.groups, widths);
  const facts = factsOf(doc);
  const screens = frames.map((frame) => {
    const groups = doc.groups.filter((g) => (frames.length === 1 && frame.id === "canvas") || frameOfPart(g, doc.groups, frames, widths)?.id === frame.id).filter((g) => !offTab.has(g.id)).flatMap((g) => (g.free ? explodeGroup(g, widths) : [g]));
    return new Planner(doc, frame, groups, widths, o).screen(keys.get(frame.id)!, components.get(frame.id)!);
  });
  return { doc, frames, facts, keys, components, screens };
}

/** The document drawn out with what each row's parts read of their row written in (lib/refs.ts `inlineReads`): the row a
 *  part of a repeat over a collection was drawn for is known here, where neither kit has rows to read, so its
 *  conditions (`row.price == "0"`), its taps' expressions and its bindings say the row's words themselves. A group's
 *  condition reads the row of its first part, as the preview's does. */
export function rowsRead(doc: Doc): Doc {
  if (!doc.groups.some((g) => g.items.some((it) => it.row))) return doc;
  const reading = (row: Record<string, string>): ExprMap => ({ expr: (src) => (/\brow\b/.test(src) ? inlineReads(src, "row", row) : src), words: (text) => text });
  const groups = doc.groups.map((g) => {
    if (!g.items.some((it) => it.row)) return g;
    const items = g.items.map((it) => (it.row ? mapItemExprs(it, reading(it.row)) : it));
    const first = g.items[0]?.row;
    const showWhen = first ? mapConditionExprs(g.showWhen, reading(first)) : g.showWhen;
    return items.every((it, i) => it === g.items[i]) && showWhen === g.showWhen ? g : { ...g, items, ...(showWhen ? { showWhen } : {}) };
  });
  return { ...doc, groups };
}

/* ---------- a part ---------- */

/** a part's size: as measured on the canvas, else its definition's */
export function sizeOf(it: Item, widths: Record<string, number>) {
  const def = partBySlug(it.component);
  return { w: Math.round(widths[it.id] ?? def?.w ?? 120), h: Math.round(widths[`${it.id}:h`] ?? def?.h ?? 40) };
}

export function partNode(it: Item, widths: Record<string, number>): PartNode {
  const def = partBySlug(it.component);
  const entries = Object.entries(it.actions ?? {});
  const prefixes = new Set(familiesOf(it).map((f) => f.prefix));
  const declared = def ? eventsOf(it) : [];
  return {
    item: it,
    ...(def ? { def } : {}),
    size: sizeOf(it, widths),
    places: entries.filter(([k, a]) => !!a && isPlaceKey(k)),
    families: entries.flatMap(([k, a]): [string, Action][] => (a && familyOfKey(k) !== null && prefixes.has(familyOfKey(k)!) ? [[familyOfKey(k)!, a]] : [])),
    familyKeys: entries.some(([k]) => familyOfKey(k) !== null),
    events: entries.flatMap(([key, a]): PartEvent[] => {
      const name = eventOfKey(key);
      const e = name !== null ? declared.find((x) => x.name === name) : undefined;
      return a && e ? [{ key, name: e.name, payload: (e.payload ?? {}) as Record<string, unknown>, action: a }] : [];
    }),
    submits: [it.action, ...Object.values(it.actions ?? {})].some((a) => a?.effects?.some((e) => e.do === "submit")),
  };
}

/** The atoms a part splits into, as its kit draws them (words in the editor's language, settled sizes), beside the
 *  tree they were drawn from and where its taps of places went in it (lib/kits.ts `splitTaps`). */
export function atomsOf(doc: Doc, def: PartDef, it: Item): { plain: PlainNode; taps: AtomTaps } {
  const styles = styleContext(doc.styles);
  const p = reader(def, it.props);
  const tree = def.atoms!(p, kitLookOf(normalizeTheme(doc.theme, styles), styles)) as Node;
  const taps = splitTaps(def, p, tree, it);
  return { plain: plainTree(tree, getLang()), taps: { node: tree, actions: taps.actions, placed: taps.placed, owner: it.id } };
}

/** What a slot is handed of a capability view (or a world view): the props of the design's stand-in, as plain values,
 *  that the view's props take (`slotTakes`: the stand-in may be drawn with more, which only the stand-in gets). */
export function slotGiven(def: PartDef, it: Item, spec: CapabilitySpec | undefined): [string, unknown][] {
  const takes = def.capability ? slotTakes(spec, def.capability) : () => true;
  return Object.entries(treeOf(def, it.props).props ?? {}).filter(([k, v]) => /^[a-z][A-Za-z0-9]*$/.test(k) && k !== "className" && k !== "style" && k !== "width" && k !== "height" && takes(k) && (v === null || ["string", "number", "boolean", "object"].includes(typeof v)));
}

/** an overlay that keeps its trigger on the screen while shut (a menu): closing it shuts its popup only */
export function keepsTrigger(it: Item | undefined): boolean {
  const def = it ? partBySlug(it.component) : undefined;
  return !!def?.overlay && !!def.open && def.open.trigger !== "hide";
}

/** the kits' components that open and close as their prop says, a tap's open and close effects too */
export const OPENS_BY_PROP = new Set(["dropdown-menu", "tooltip", "popover", "hover-card"]);

/** The parts whose chosen row is `selected` and which say so when one is tapped (`onSelect`), without moving it
 *  themselves: the app moves it, as the preview does, unless it is bound to something. */
export const selectsByProp = (def: PartDef, it: Item) => ["bar-list", "file-list", "tree"].includes(def.slug) && it.bind?.selected === undefined;

/** a list input's rows as their words */
export const labelsOf = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((r) => (r && typeof r === "object" ? String((r as { label?: unknown }).label ?? "") : String(r))) : []);
/** a list input's value as a text variable holds it, and the kits' controls take it: one row a line */
export const linesOf = (rows: unknown) => labelsOf(rows).join("\n");

/* ---------- layout ---------- */

/** what a part in a layout asks of it, as the props of the `Cell` around it */
export function cellOf(run: Group, parent: Flow, origin: { x: number; y: number }): [string, string][] {
  const it = run.items.length === 1 ? run.items[0] : undefined;
  const c = childLayoutOf(it);
  if (c.absolute) return [["x", exprOf(run.x - origin.x)], ["y", exprOf(run.y - origin.y)]];
  const w = sizingOf(it, parent, "w");
  const h = sizingOf(it, parent, "h");
  const out: [string, string][] = [];
  const flag = (k: string) => out.push([k, "true"]);
  const selfAlign = c.self && c.self !== "stretch" ? c.self : undefined;
  if (parent.dir === "grid") {
    if (c.span > 1) out.push(["span", exprOf(Math.min(c.span, parent.columns))]);
    if (w === "fill") flag("fillWidth");
    if (h === "fill") flag("fillHeight");
    if (selfAlign) out.push(["self", str(selfAlign)]);
  } else {
    const main = parent.dir === "row" ? w : h;
    const cross = parent.dir === "row" ? h : w;
    const across = c.self ?? parent.align;
    if (main === "fill") flag("grow");
    if (cross === "fill") flag(parent.dir === "row" ? "fillHeight" : "fillWidth");
    if (cross === "fill" && across !== "stretch") flag("stretch");
    else if (cross !== "fill" && across === "stretch") out.push(["self", str("start")]);
    else if (selfAlign) out.push(["self", str(selfAlign)]);
  }
  for (const [axis, key] of [["w", "W"], ["h", "H"]] as const) {
    if (c.min[axis] !== undefined) out.push([`min${key}`, exprOf(c.min[axis])]);
    if (c.max[axis] !== undefined) out.push([`max${key}`, exprOf(c.max[axis])]);
  }
  if (out.length) out.unshift(["dir", str(parent.dir)]);
  return out;
}

/** a layout's own size on each axis: what it holds, unless the layout around it fills that axis or it says otherwise;
 *  only where it differs from the kit's default */
export function hugsOf(run: Group, flow: Flow, parent: Flow | undefined, flowing: boolean, defaults: Record<string, unknown>): [string, string][] {
  const it = run.items[0];
  const one = (axis: "w" | "h") => {
    if (!flowing) return false;
    const own = axis === "w" ? flow.hugW : flow.hugH;
    if (!parent) return own;
    const s = sizingOf(it, parent, axis);
    if (s === "fill" && !(axis === "w" ? parent.hugW : parent.hugH)) return false;
    const set = childLayoutOf(it).size[axis];
    return set === "hug" ? true : set === "fixed" ? false : own;
  };
  const out: [string, string][] = [];
  for (const [axis, key] of [["w", "hugWidth"], ["h", "hugHeight"]] as const) {
    const v = one(axis);
    if (v !== defaults[key]) out.push([key, exprOf(v)]);
  }
  return out;
}

/* ---------- the planner ---------- */

class Planner {
  constructor(
    readonly doc: Doc,
    readonly frame: Frame,
    readonly all: Group[],
    readonly widths: Record<string, number>,
    readonly o: PlanOptions,
  ) {}

  part(it: Item): PartNode {
    return partNode(it, this.widths);
  }

  /** a run a layout holds (`parent`, from `origin`), or one standing by itself */
  node(run: Group, parent?: Flow, origin = { x: 0, y: 0 }): RunNode {
    if (run.expandedFrom !== undefined && parent) {
      const kids = this.all.filter((g) => g.id.startsWith(`${run.id}/`) && !g.inFlow).sort((a, b) => a.y - b.y || a.x - b.x);
      const { width, height } = (run.items[0].props ?? {}) as { width?: number; height?: number };
      return { run, cell: [], content: { kind: "instance", width: Math.round(width ?? 0), height: Math.round(height ?? 0), kids: kids.map((k) => this.loose(k, { x: run.x, y: run.y })) } };
    }
    const cell = parent ? cellOf(run, parent, origin) : [];
    if (run.items.length === 1 && splitOf(run)) {
      const panes = panesOfSplit(this.all, run.id);
      return { run, cell, content: { kind: "split", part: this.part(run.items[0]), panes: PANE_SIDES.flatMap((side) => (panes[side] ? [this.node(panes[side]!)] : [])) } };
    }
    const flow = run.items.length === 1 ? flowOf(run) : null;
    if (!flow) {
      if (run.items.length === 1) return { run, cell, content: { kind: "part", part: this.part(run.items[0]) } };
      return { run, cell, content: { kind: "items", axis: run.axis === "x" ? "x" : "y", parts: run.items.map((x) => this.part(x)) } };
    }
    const groups = this.all.filter((g) => g.inFlow === run.id && !g.locked);
    const flowing = groups.some((k) => !childLayoutOf(k.items.length === 1 ? k.items[0] : undefined).absolute);
    const box = { x: run.x + flow.inset.l, y: run.y + flow.inset.t };
    const kids = groups.map((k) => this.node(k, flow, box));
    const byGroup = new Map(groups.map((g, i) => [g, kids[i]]));
    const dock = isLaidOutDock(run) ? dockPanes(run, groups).map(([pane, gs]): [number, RunNode[]] => [pane, gs.map((g) => byGroup.get(g)!)]) : undefined;
    return { run, cell, content: { kind: "flow", part: this.part(run.items[0]), flow, kids, flowing, hugs: hugsOf(run, flow, parent, flowing, this.o.defaults(run.items[0].component ?? "")), ...(dock ? { dock } : {}) } };
  }

  /** a run standing loose, placed from the top left of what it stands on */
  loose(run: Group, origin: { x: number; y: number }): Loose {
    const flow = run.items.length === 1 ? flowOf(run) : null;
    const at = flow ? { x: run.x, y: run.y } : (layoutOf(run, this.widths)[0] ?? { x: run.x, y: run.y });
    return { node: this.node(run), x: at.x - origin.x, y: at.y - origin.y };
  }

  screen(key: string, component: string): ScreenPlan {
    const { frame, all, widths } = this;
    const { w, h } = frameSizeOf(frame);
    const length = frameLengthOf(frame);
    const hosts = new Set(all.filter((r) => flowOf(r) || splitOf(r)).map((r) => r.id));
    const runs = [...all].sort((a, b) => a.y - b.y || a.x - b.x);
    /* a screen that loads data keeps what stands at its foot on the glass, its list ending clear of it */
    const foot = this.o.foot && frame.data?.length ? footOf(frame, all, widths) : undefined;
    /* the bars pinned to an edge: the full-width top, bottom and floating bottom bars standing at it */
    const edgeOf = (run: Group): "top" | "bottom" | "floatingBottom" | undefined => {
      const first = run.items[0];
      const role = first ? roleOf(first) : undefined;
      if (!(run.items.length === 1 && first && fullWidth(first) && (role === "top" || role === "bottom" || role === "floatingBottom"))) return undefined;
      const pin = pinOf(run, frame, widths);
      const top = Math.round(run.y - frame.y);
      const atFoot = role !== "top" && (pin === "foot" || top + sizeOf(first, widths).h >= frameLengthOf(frame) - 1 || frameLengthOf(frame) === h);
      return (role === "top" ? top <= 32 || pin === "head" : atFoot) ? role : undefined;
    };
    let footBars = 0;
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      if (edgeOf(run) === "bottom") footBars = Math.max(footBars, sizeOf(run.items[0], widths).h);
    }
    const body: Placement[] = [];
    for (const run of runs) {
      if (run.inFlow && hosts.has(run.inFlow) && !run.locked) continue;
      /* what an instance placed by a layout holds is printed with it */
      if (ownerIdOf(run.id) && all.some((g) => g.id === ownerIdOf(run.id) && g.expandedFrom !== undefined)) continue;
      const first = run.items[0];
      const layer = run.items.length === 1 && !!first && !!run.hidden && isOverlayPart(first) && !flowOf(run);
      const node = this.node(run);
      const edge = edgeOf(run);
      if (edge) {
        body.push({ node, layer, at: "pin", edge });
        continue;
      }
      if (run.items.length === 1 && first && fullWidth(first)) {
        body.push({ node, layer, at: "span", y: Math.round(run.y - frame.y) });
        continue;
      }
      /* a button (or a FAB) at the foot of a screen of data floats there, as far above the foot as the design has it */
      const above = foot?.above.get(run.id);
      if (above !== undefined) {
        const at = layoutOf(run, widths)[0] ?? { x: run.x, y: run.y };
        body.push({ node, layer, at: "float", x: Math.round(at.x - frame.x), bottom: above });
        continue;
      }
      const placed = this.loose(run, { x: frame.x, y: frame.y });
      body.push({ node, layer, at: "loose", x: placed.x, y: placed.y });
    }
    return { frame, key, component, groups: all, width: w, height: h, length, body, footBars, ...(foot ? { foot } : {}), forms: formsOf(all) };
  }
}

/** the icon names a part's props draw: its icon props and the icons of its rows (`props` read as the canvas reads them,
 *  under the part's own names or the kits') */
export function iconNamesOf(slug: string, props: Record<string, unknown>): string[] {
  const def = partBySlug(slug);
  if (!def) return [];
  const out: string[] = [];
  for (const d of def.props) {
    const v = props[d.key] ?? props[kitPropName(slug, d.key)];
    if (d.kind === "icon" && typeof v === "string" && v) out.push(v);
    if (d.kind === "list" && Array.isArray(v)) for (const row of v) if (row && typeof row === "object" && typeof (row as { icon?: unknown }).icon === "string" && (row as { icon: string }).icon) out.push((row as { icon: string }).icon);
    /* a table whose structure has a column of icons (an onboarding's pages): each row's */
    const at = d.kind === "table" ? (d.columns ?? []).findIndex((col) => col.key === "icon") : -1;
    const rows = at >= 0 && v && typeof v === "object" ? (v as { rows?: unknown }).rows : undefined;
    if (Array.isArray(rows)) for (const row of rows) if (Array.isArray(row) && typeof row[at] === "string" && row[at]) out.push(row[at] as string);
  }
  return out;
}
