/* Reading a document the way a model, a client or the layers panel needs it: a compact outline that fits in a
 * prompt (screens, then the tree of parts with their ids and what matters about them), the real hierarchy (what a
 * layout places and what a container holds), finding parts, and everything about one part, its props with the
 * values they may take. Pure functions of a document and the sizes its parts measure. */

import { partBySlug, defaultValues, tierOf } from "../../parts/registry";
import { roleOf } from "../../parts/role";
import { labelOfPart } from "../../parts/resize";
import { flowOf, childLayoutOf } from "../flow";
import { kitLookOf } from "../kits";
import { isStrict } from "../styles";
import { declarationsOf, demoTakenOver } from "../partContract";
import { actionSlotsOf, frameLengthOf, frameOfPart, frameSizeOf, groupBounds, heldBy, holdsParts, layoutOf, type Doc, type Frame, type Group, type Item } from "../tokens";
import { propKindText } from "./ops/validate";
import type { Widths } from "./state";

/** one part in the tree */
export type TreeNode = {
  /** the part's id: what every operation names it by */
  id: string;
  /** the group it stands in (the unit that is moved, locked, hidden) */
  groupId: string;
  slug: string;
  tier: "atom" | "composite";
  /** what the author called it, else the words it shows */
  name: string;
  /** relative to its screen's top left (to the canvas when on none) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** how it is placed under its parent: laid out by its auto layout, or lying inside it */
  placed?: "flow" | "inside" | "loose";
  layout?: string;
  instanceOf?: string;
  kit?: string;
  locked?: boolean;
  hidden?: boolean;
  children: TreeNode[];
};

export type ScreenTree = { id: string; name: string; w: number; h: number; length: number; nodes: TreeNode[] };

/** What the canvas holds as a tree: each screen with its parts, a part under the container whose auto layout places it,
 *  or the smallest container it lies wholly inside (drawn over it), the way the prompt and the screens read them. */
export function nodeTree(doc: Pick<Doc, "groups" | "frames">, widths: Widths): { screens: ScreenTree[]; loose: TreeNode[] } {
  const groups = doc.groups;
  const byId = new Map(groups.map((g) => [g.id, g]));
  /* the parent of a group: its layout, else the smallest container holding it */
  const parent = new Map<string, string>();
  const areaOf = (g: Group) => {
    const b = groupBounds(g, widths);
    return (b.r - b.l) * (b.b - b.t);
  };
  const holders = groups.filter(holdsParts).map((c) => ({ c, held: new Set(heldBy(c, groups, widths)), area: areaOf(c) }));
  for (const g of groups) {
    if (g.inFlow && byId.has(g.inFlow) && g.inFlow !== g.id) {
      parent.set(g.id, g.inFlow);
      continue;
    }
    let best: { id: string; area: number } | null = null;
    for (const h of holders) if (h.c.id !== g.id && h.held.has(g) && (!best || h.area < best.area)) best = { id: h.c.id, area: h.area };
    if (best) parent.set(g.id, best.id);
  }
  const screenOf = new Map<string, Frame | undefined>(groups.map((g) => [g.id, frameOfPart(g, groups, doc.frames, widths)]));
  const nodeOf = (g: Group, it: Item, at: { x: number; y: number; w: number; h: number }): TreeNode => {
    const def = partBySlug(it.component);
    const f = screenOf.get(g.id);
    const flow = flowOf(g);
    return {
      id: it.id,
      groupId: g.id,
      slug: it.component ?? "",
      tier: def ? tierOf(def) : "composite",
      name: g.name || labelOfPart(def, it.props) || def?.name || "",
      x: Math.round(at.x - (f?.x ?? 0)),
      y: Math.round(at.y - (f?.y ?? 0)),
      w: Math.round(at.w),
      h: Math.round(at.h),
      ...(g.inFlow && parent.get(g.id) === g.inFlow ? { placed: childLayoutOf(it).absolute ? ("loose" as const) : ("flow" as const) } : parent.has(g.id) ? { placed: "inside" as const } : {}),
      ...(flow ? { layout: String(it.props?.layout ?? (def?.flow?.grid ? "grid" : "column")) } : {}),
      ...(g.instanceOf ? { instanceOf: g.instanceOf } : {}),
      ...(g.kit ? { kit: g.kit.slug } : {}),
      ...(g.locked ? { locked: true } : {}),
      ...(g.hidden ? { hidden: true } : {}),
      children: [],
    };
  };
  /* a group of one part is that part; a run or a hand-made group is its parts side by side */
  const nodesOf = new Map<string, TreeNode[]>();
  for (const g of groups) nodesOf.set(g.id, layoutOf(g, widths).map((pl) => nodeOf(g, pl.item, pl)));
  const roots: TreeNode[] = [];
  for (const g of groups) {
    const mine = nodesOf.get(g.id) ?? [];
    const p = parent.get(g.id);
    const host = p ? nodesOf.get(p)?.[0] : undefined;
    if (host) host.children.push(...mine);
    else roots.push(...mine);
  }
  const screens: ScreenTree[] = doc.frames.map((f) => ({ id: f.id, name: f.name, w: frameSizeOf(f).w, h: frameSizeOf(f).h, length: frameLengthOf(f), nodes: roots.filter((n) => screenOf.get(n.groupId)?.id === f.id) }));
  return { screens, loose: roots.filter((n) => !screenOf.get(n.groupId)) };
}

/* ---------- the outline ---------- */

export type OutlineOptions = {
  /** only this screen */
  screen?: string;
  /** how deep the tree goes (all of it by default) */
  depth?: number;
  /** the props shown for each part: those set over its defaults (`set`, the default), none, or every one */
  props?: "set" | "none" | "all";
  /** text for a prompt (the default), or the tree as JSON */
  format?: "text" | "json";
};

const clip = (v: unknown, n = 40): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** the props a part shows in the outline */
function propsLine(it: Item, mode: OutlineOptions["props"]): string {
  if (mode === "none") return "";
  const def = partBySlug(it.component);
  if (!def) return "";
  const defaults = defaultValues(def);
  const keys = def.props.map((d) => d.key).filter((k) => mode === "all" || (it.props?.[k] !== undefined && JSON.stringify(it.props[k]) !== JSON.stringify(defaults[k])));
  const shown = keys.slice(0, 10).map((k) => `${k}=${clip(it.props?.[k] ?? defaults[k], k === "image" || k === "svg" ? 16 : 40)}`);
  return shown.length ? ` {${shown.join(", ")}${keys.length > 10 ? `, +${keys.length - 10}` : ""}}` : "";
}

/** the rest of what matters about a part: its colors, look, tap, how it sits in a layout */
function fieldsLine(it: Item): string {
  const out: string[] = [];
  if (it.fill) out.push(`fill=${it.fill}`);
  if (it.textColor) out.push(`text=${it.textColor}`);
  if (it.corners) out.push("corners");
  if (it.look) out.push(`look(${Object.keys(it.look).join(",")})`);
  if (it.action) out.push(`tap→${it.action.to}${it.action.effects?.length ? `+${it.action.effects.length} effects` : ""}`);
  if (it.actions) out.push(`taps(${Object.keys(it.actions).join(",")})`);
  if (it.bind) out.push(`bind(${Object.entries(it.bind).map(([p, v]) => `${p}:${clip(v, 60)}`).join(",")})`);
  if (it.field) out.push(`field=${it.field}`);
  const c = childLayoutOf(it);
  if (it.flowSize || it.flowFill) out.push(`size=${c.size.w ?? (it.flowFill ? "fill" : "-")}/${c.size.h ?? "-"}`);
  if (c.self) out.push(`self=${c.self}`);
  if (c.absolute) out.push("absolute");
  if (it.note) out.push(`note="${clip(it.note, 30)}"`);
  return out.length ? ` ${out.join(" ")}` : "";
}

/** A compact, stable outline of the document for a model: its title and look, then each screen and the tree of its
 *  parts, one line each with its id, what it is, where it stands and what is set on it. */
export function outline(doc: Doc, widths: Widths, o: OutlineOptions = {}): string {
  const tree = nodeTree(doc, widths);
  const screens = o.screen ? tree.screens.filter((s) => s.id === o.screen) : tree.screens;
  if (o.format === "json") return JSON.stringify({ title: doc.title, style: doc.theme?.style ?? "", screens, ...(o.screen ? {} : { loose: tree.loose }) });
  const items = new Map(doc.groups.flatMap((g) => g.items.map((it) => [it.id, it] as const)));
  const groups = new Map(doc.groups.map((g) => [g.id, g]));
  const theme = doc.theme;
  const lines: string[] = [];
  const look = theme ? `${theme.style ? `style ${theme.style}${isStrict(theme) ? " (held to its rules)" : ""}` : "Material"}${theme.dark ? ", dark" : ""}` : "Material";
  lines.push(`# ${doc.title ? JSON.stringify(doc.title) : "Untitled"} — ${look}, ${doc.frames.length} screen${doc.frames.length === 1 ? "" : "s"}${doc.components?.length ? `, ${doc.components.length} components` : ""}${doc.collections?.length ? `, ${doc.collections.length} collections` : ""}${doc.vars?.length ? `, ${doc.vars.length} variables` : ""}`);
  if (doc.brief) lines.push(`brief: ${clip(doc.brief, 200)}`);
  if (!o.screen) {
    for (const c of doc.components ?? []) {
      const set = c.set ? doc.componentSets?.find((x) => x.id === c.set) : undefined;
      const variant = set ? ` variant of "${set.name}" (${set.id}): ${Object.entries(c.variant ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}` : "";
      const props = c.props?.length ? `; props ${c.props.map((p) => `${p.name}:${p.type}(${p.id})`).join(", ")}` : "";
      lines.push(`component ${c.id} "${c.name}" ${c.w}×${c.h}, ${c.groups.length} groups${variant}${props}`);
    }
    for (const c of doc.collections ?? []) lines.push(`collection ${c.id} "${c.name}" fields ${c.fields.join(", ")}; ${c.rows.length} rows`);
    for (const v of doc.vars ?? []) lines.push(`var ${v.id} "${v.name}" ${v.type} = ${JSON.stringify(v.value)}${v.drives === "dark" ? " (drives the dark mode)" : ""}`);
    /* the product layer in a line: get_api, get_mocks and describe_bindings read it in full */
    const api = doc.api;
    if (api && (api.models?.length || api.endpoints?.length || api.channels?.length)) {
      const mocks = doc.mocks;
      lines.push(`api: ${api.models?.length ?? 0} models, ${api.endpoints?.length ?? 0} endpoints${api.channels?.length ? `, ${api.channels.length} channels` : ""}${api.auth?.login ? `, sign-in ${api.auth.login}` : ""}; mocks: ${mocks ? `${mocks.scenarios?.length ?? 0} scenarios` : "none set (fill_mocks)"}`);
    }
  }
  /** a region's state designs sit on panes 1–4 of it: loading, empty, error, forbidden */
  const PANE_STATE = ["", "loading", "empty", "error", "forbidden"];
  const walk = (n: TreeNode, depth: number) => {
    if (o.depth !== undefined && depth > o.depth) return;
    const it = items.get(n.id);
    const g = groups.get(n.groupId);
    const host = g?.inFlow ? groups.get(g.inFlow) : undefined;
    const flags = [
      n.placed === "flow" ? "" : n.placed === "loose" ? "absolute in layout" : "",
      n.layout ? `layout=${n.layout}` : "",
      n.instanceOf ? `instance of ${n.instanceOf}` : "",
      n.kit ? `kit ${n.kit}` : "",
      n.locked ? "locked" : "",
      n.hidden ? "hidden" : "",
      g?.showWhen ? ("expr" in g.showWhen ? `showWhen ${clip(g.showWhen.expr, 40)}` : "showWhen") : "",
      g?.repeat ? `repeats ${g.repeat.data ?? g.repeat.collection}` : "",
      g?.states ? `region of ${g.states.source ?? "no source"}${g.states.show ? `, showing ${g.states.show}` : ""}` : "",
      host?.states && g?.pane ? `${PANE_STATE[g.pane] ?? "state"} design` : "",
      g?.form ? `form of ${g.form.operationId}` : "",
      /* an old design's retired part: drawn as before, split_retired turns it into atoms */
      partBySlug(it?.component)?.retired ? "retired" : "",
      roleOf(it ?? {}) && ["top", "bottom", "floatingBottom", "fab", "overlay", "rail"].includes(roleOf(it ?? {})!) ? `role=${roleOf(it ?? {})}` : "",
    ].filter(Boolean);
    lines.push(`${"  ".repeat(depth)}- ${n.id} ${n.slug} "${clip(n.name, 32)}" @${n.x},${n.y} ${n.w}×${n.h}${flags.length ? ` [${flags.join(", ")}]` : ""}${it ? propsLine(it, o.props ?? "set") + fieldsLine(it) : ""}`);
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const s of screens) {
    const f = doc.frames.find((x) => x.id === s.id)!;
    const bound = [
      f.data?.length ? `data ${f.data.map((d) => `${d.name}=${d.operationId}`).join(", ")}` : "",
      f.params?.length ? `params ${f.params.map((p) => p.name).join(", ")}` : "",
      f.auth ? `auth ${f.auth}` : "",
    ].filter(Boolean);
    lines.push(`## screen ${s.id} "${s.name}" ${s.w}×${s.h}${s.length > s.h ? ` scrolls to ${s.length}` : ""}${f.bg ? ` bg=${f.bg}` : ""}${f.variantOf ? ` size of ${f.variantOf}` : ""}${bound.length ? ` [${bound.join("; ")}]` : ""}${f.note ? ` — ${clip(f.note, 80)}` : ""}`);
    for (const n of s.nodes) walk(n, 1);
  }
  if (!o.screen && tree.loose.length) {
    lines.push("## off any screen");
    for (const n of tree.loose) walk(n, 1);
  }
  return lines.join("\n");
}

/* ---------- finding ---------- */

export type FindQuery = { screen?: string; slug?: string; name?: string; text?: string; tier?: "atom" | "composite"; category?: string; limit?: number };
export type Found = { id: string; groupId: string; slug: string; screen?: string; name: string; x: number; y: number; w: number; h: number };

/** the words a part shows: every text prop and list row, joined */
const wordsOf = (it: Item) => {
  const def = partBySlug(it.component);
  if (!def) return "";
  return def.props
    .flatMap((d) => {
      const v = it.props?.[d.key];
      if (d.kind === "text") return [typeof v === "string" ? v : d.default];
      if (d.kind === "list") return (Array.isArray(v) ? v : d.default).map((r: { label?: string }) => r.label ?? "");
      return [];
    })
    .join(" ");
};

/** Parts that match all of what is asked: on a screen, of a slug, tier or category, with a name or words containing
 *  the given text (case-insensitive). In document order. */
export function find(doc: Doc, widths: Widths, q: FindQuery): Found[] {
  const out: Found[] = [];
  const lower = (s: string) => s.toLowerCase();
  for (const g of doc.groups) {
    const f = frameOfPart(g, doc.groups, doc.frames, widths);
    if (q.screen && f?.id !== q.screen) continue;
    for (const pl of layoutOf(g, widths)) {
      const it = pl.item;
      const def = partBySlug(it.component);
      if (q.slug && it.component !== q.slug) continue;
      if (q.tier && (!def || tierOf(def) !== q.tier)) continue;
      if (q.category && def?.category !== q.category) continue;
      const name = g.name || labelOfPart(def, it.props) || def?.name || "";
      if (q.name && !lower(name).includes(lower(q.name))) continue;
      if (q.text && !lower(wordsOf(it)).includes(lower(q.text))) continue;
      out.push({ id: it.id, groupId: g.id, slug: it.component ?? "", ...(f ? { screen: f.id } : {}), name, x: Math.round(pl.x - (f?.x ?? 0)), y: Math.round(pl.y - (f?.y ?? 0)), w: Math.round(pl.w), h: Math.round(pl.h) });
      if (q.limit && out.length >= q.limit) return out;
    }
  }
  return out;
}

/* ---------- one part ---------- */

/** Everything about one part: what it is, its fields and its group's, where it stands, what lays it out and what it
 *  holds, and each of its props with the value it has now, its default and the values it takes. */
export function describeNode(doc: Doc, widths: Widths, id: string) {
  const g = doc.groups.find((x) => x.items.some((it) => it.id === id));
  if (!g) return null;
  const it = g.items.find((x) => x.id === id)!;
  const def = partBySlug(it.component);
  const f = frameOfPart(g, doc.groups, doc.frames, widths);
  const pl = layoutOf(g, widths).find((p) => p.item.id === id)!;
  const tree = nodeTree(doc, widths);
  const findNode = (nodes: TreeNode[], parent?: TreeNode): { node: TreeNode; parent?: TreeNode } | null => {
    for (const n of nodes) {
      if (n.id === id) return { node: n, parent };
      const deeper = findNode(n.children, n);
      if (deeper) return deeper;
    }
    return null;
  };
  const at = findNode([...tree.screens.flatMap((s) => s.nodes), ...tree.loose]);
  const values = def ? defaultValues(def) : {};
  const host = g.inFlow ? doc.groups.find((x) => x.id === g.inFlow) : undefined;
  const { items: _items, ...group } = g;
  return {
    id,
    slug: it.component,
    name: def?.name,
    category: def?.category,
    tier: def ? tierOf(def) : undefined,
    role: roleOf(it),
    screen: f ? { id: f.id, name: f.name } : null,
    bounds: { x: Math.round(pl.x - (f?.x ?? 0)), y: Math.round(pl.y - (f?.y ?? 0)), w: Math.round(pl.w), h: Math.round(pl.h) },
    group,
    parent: at?.parent ? { id: at.parent.id, placed: at.node.placed } : null,
    children: at?.node.children.map((c) => c.id) ?? [],
    layout: flowOf(g) ? Object.fromEntries(Object.entries(it.props ?? {}).filter(([k]) => ["layout", "gap", "gapY", "padX", "padY", "padTop", "padRight", "padBottom", "padLeft", "align", "justify", "wrap", "columns", "hugWidth", "hugHeight"].includes(k))) : null,
    inLayout: host ? { container: host.items[0]?.id, ...childLayoutOf(it) } : null,
    fields: Object.fromEntries(Object.entries(it).filter(([k]) => !["id", "kind", "props", "component", "icon", "variant"].includes(k))),
    props: (def?.props ?? []).map((d) => ({
      key: d.key,
      label: d.label,
      kind: d.kind,
      value: it.props?.[d.key] ?? values[d.key],
      set: it.props?.[d.key] !== undefined,
      default: values[d.key],
      takes: propKindText(d),
    })),
    slots: actionSlotsOf(it).map((s) => s.key),
    /* what else its actions may be stored under, its input and its demo (lib/partContract.ts) */
    ...(def ? declarationsOf(def) : {}),
    ...(def?.demo ? { demoRunsInPrototype: !demoTakenOver(it) } : {}),
    canSplit: !!def?.atoms,
    /* an old design's retired part: it draws as before, but is built anew from atoms (split_retired) */
    ...(def?.retired ? { retired: { use: def.retired.use, split: "split_retired" } } : {}),
    canHold: !!def?.holds,
    appearance: !!def?.appearance,
    look: doc.theme ? kitLookOf(doc.theme).group : undefined,
  };
}
