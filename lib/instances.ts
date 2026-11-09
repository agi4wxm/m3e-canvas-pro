import { partBySlug } from "../parts/registry";
import { expandRepeats, measuresFor } from "./collections";
import { arrangeFlows, outOfPane, ownSize } from "./flow";
import { type Collection, type ComponentDef, type Doc, type Group, type Item, type VarValue, heldBy, makeItem, retarget, uid, unionRect } from "./tokens";
import type { PropDef } from "../parts/types";

/* Reusable components. A definition holds its parts relative to its own top left. In the document an
 * instance is one group with `instanceOf` and a single empty container as its item: the container is
 * what is selected, dragged and measured, and it keeps its slot in an auto layout. Everything an
 * instance shows is worked out here, under composite ids (`instanceGroupId/itemId`), so that the
 * canvas, the measuring layer, the preview, the prompt and the printed code all read the same parts.
 *
 * An instance is laid out on its own, inside its own box, and then the box is placed: its size is what
 * its definition comes to, and a layout around it places it but does not stretch it. */

type Widths = Record<string, number>;

/** the empty container standing in for an instance */
const BOX = (w: number, h: number) => ({ label: "", note: "", fill: "", border: "none", radius: 0, width: Math.round(w), height: Math.round(h) });

export const standIn = (def: ComponentDef, x: number, y: number, id = uid()): Group => ({ id, x: Math.round(x), y: Math.round(y), axis: "x", instanceOf: def.id, items: [{ ...makeItem("container"), label: def.name, props: BOX(def.w, def.h) }] });

/* ---------- nesting ---------- */

const usesOf = (def: ComponentDef) => def.groups.flatMap((g) => (g.instanceOf ? [g.instanceOf] : []));

/** whether a definition holds another, at any depth */
function reaches(components: ComponentDef[], fromId: string, toId: string, seen = new Set<string>()): boolean {
  if (fromId === toId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  const from = components.find((c) => c.id === fromId);
  return !!from && usesOf(from).some((id) => reaches(components, id, toId, seen));
}

/** An instance of `placedId` may go inside the definition `hostId` (null: on a screen) only if that
 *  would not put a definition inside itself. */
export const canNest = (components: ComponentDef[] | undefined, hostId: string | null, placedId: string) => !hostId || !reaches(components ?? [], placedId, hostId);

/* ---------- expansion ---------- */

/** How much one expansion draws, whatever a file says: instances nested this deep, and this many groups drawn for
 *  them in all. A definition holding a few instances of one holding a few instances of another… grows as a power of
 *  its depth, so a file of a few kilobytes could ask for millions of parts; past these an instance is its empty box,
 *  as one that would hold itself is. */
export const MAX_INSTANCE_DEPTH = 24;
export const MAX_INSTANCE_GROUPS = 10_000;

/** a part with what the instance changes of it; keys are `itemId/propKey` */
function overridden(it: Item, overrides: Record<string, VarValue> | undefined): Item {
  if (!overrides) return it;
  let props = it.props;
  for (const [key, value] of Object.entries(overrides)) {
    const at = key.lastIndexOf("/");
    if (at > 0 && key.slice(0, at) === it.id) props = { ...props, [key.slice(at + 1)]: value };
  }
  return props === it.props ? it : { ...it, props };
}

/** the overrides meant for a nested instance, with its own place in the path taken off; outer ones win */
function passedDown(g: Group, overrides: Record<string, VarValue> | undefined): Record<string, VarValue> | undefined {
  const prefix = `${g.id}/`;
  const down = Object.entries(overrides ?? {}).filter(([k]) => k.startsWith(prefix));
  return down.length ? { ...g.overrides, ...Object.fromEntries(down.map(([k, v]) => [k.slice(prefix.length), v])) } : g.overrides;
}

/** What an instance's property values come to: words written over parts as overrides would be, layers left out, nested
 *  instances that are another component. A property the instance says nothing of shows what the definition does,
 *  except a visibility property whose own value is off. */
export function propertyEffects(def: ComponentDef, values: Group["properties"]): { overrides: Record<string, VarValue>; hidden: Set<string>; swaps: Map<string, string> } {
  const overrides: Record<string, VarValue> = {};
  const hidden = new Set<string>();
  const swaps = new Map<string, string>();
  for (const p of def.props ?? []) {
    const v = values?.[p.id];
    if (p.type === "text") {
      if (v !== undefined) for (const key of p.targets) overrides[key] = String(v);
    } else if (p.type === "bool") {
      if ((v ?? p.value) === false) for (const id of p.targets) hidden.add(id);
    } else if (typeof v === "string" && v) for (const id of p.targets) swaps.set(id, v);
  }
  return { overrides, hidden, swaps };
}

/** the groups of a definition with the layers a property hides taken out, and what those lay out with them */
function withoutHidden(groups: Group[], hidden: Set<string>): Group[] {
  if (!hidden.size) return groups;
  const gone = new Set(hidden);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of groups)
      if (!gone.has(g.id) && g.inFlow && gone.has(g.inFlow)) {
        gone.add(g.id);
        grew = true;
      }
  }
  return groups.filter((g) => !gone.has(g.id));
}

/** A definition's groups placed at (x, y) under new ids, as `inst` shows them: its property values and overrides
 *  over them. What they point at among themselves follows. */
function placedCopy(def: ComponentDef, x: number, y: number, inst: Pick<Group, "overrides" | "properties">, groupId: (id: string) => string, itemId: (id: string) => string): Group[] {
  const fx = propertyEffects(def, inst.properties);
  /* what an instance overrides by hand wins over what its properties say */
  const overrides = Object.keys(fx.overrides).length ? { ...fx.overrides, ...inst.overrides } : inst.overrides;
  const source = withoutHidden(def.groups, fx.hidden);
  const groupIds = new Map(source.map((g) => [g.id, groupId(g.id)]));
  const itemIds = new Map(source.flatMap((g) => g.items.map((it) => [it.id, itemId(it.id)] as const)));
  return source.map((g) => {
    const { inFlow, overrides: _own, ...rest } = g;
    const down = g.instanceOf ? passedDown(g, overrides) : undefined;
    const swapped = g.instanceOf ? fx.swaps.get(g.id) : undefined;
    return retarget(
      {
        ...rest,
        id: groupIds.get(g.id)!,
        x: g.x + x,
        y: g.y + y,
        ...(swapped ? { instanceOf: swapped } : {}),
        ...(inFlow && groupIds.has(inFlow) ? { inFlow: groupIds.get(inFlow) } : {}),
        ...(down ? { overrides: down } : {}),
        ...(g.pos ? { pos: Object.fromEntries(Object.entries(g.pos).map(([id, p]) => [itemIds.get(id) ?? id, p])) } : {}),
        items: g.items.map((it) => ({ ...overridden(it, overrides), id: itemIds.get(it.id)! })),
      },
      itemIds,
    );
  });
}

type Context = { components: ComponentDef[]; collections?: Collection[]; widths: Widths; rows: boolean; keepEmpty?: boolean; /** groups this expansion may still draw */ left: number };

/** the container left where an instance was, its size what the parts come to */
function wrapperOf(g: Group, name: string, w: number, h: number): Group {
  const { instanceOf: _of, overrides: _over, properties: _props, ...rest } = g;
  return { ...rest, expandedFrom: name, items: [{ ...g.items[0], component: "container", props: BOX(w, h) }] };
}

/** One instance as the container left in its place and the parts on it. `stack` is the definitions
 *  being expanded around this one: a file can hold a loop that the editor would have refused, and
 *  the loop stops here, empty, rather than going on for ever. */
function expandOne(g: Group, ctx: Context, stack: string[]): Group[] {
  const def = ctx.components.find((c) => c.id === g.instanceOf);
  if (!def) return [wrapperOf(g, "", 40, 40)];
  if (stack.includes(def.id) || stack.length >= MAX_INSTANCE_DEPTH || ctx.left <= 0) return [wrapperOf(g, def.name, def.w, def.h)];
  const clones = placedCopy(def, g.x, g.y, g, (id) => `${g.id}/${id}`, (id) => `${g.id}/${id}`);
  ctx.left -= clones.length;
  let kids = clones.flatMap((k) => (k.instanceOf ? expandOne(k, ctx, [...stack, def.id]) : [k]));
  if (ctx.rows) {
    const before = kids.length;
    kids = expandRepeats(kids, { collections: ctx.collections, widths: ctx.widths, keepEmpty: ctx.keepEmpty });
    ctx.left -= kids.length - before;
  }
  const measures = measuresFor(kids, ctx.widths);
  kids = arrangeFlows(kids, measures);
  /* a second pass settles a hugging layout inside a layout */
  kids = arrangeFlows(kids, measures);
  if (!kids.length) return [wrapperOf(g, def.name, def.w, def.h)];
  /* what stands on a dock's other tab is still where it was last laid out, which says nothing of the size */
  const off = outOfPane(kids, measures);
  const seen = kids.filter((k) => !off.has(k.id));
  /* a loop, not a spread: a definition can hold more groups than a call takes arguments */
  let r = -Infinity;
  let b = -Infinity;
  for (const k of seen) {
    const size = ownSize(k, measures);
    r = Math.max(r, k.x + size.w);
    b = Math.max(b, k.y + size.h);
  }
  return [wrapperOf(g, def.name, r - g.x, b - g.y), ...kids];
}

/** Every instance as plain groups. `rows: false` leaves repeats inside them undrawn, for the prompt.
 *  The same array comes back when there is nothing to expand. */
export function expandInstances(doc: Pick<Doc, "groups" | "components" | "collections">, widths: Widths = {}, o: { rows?: boolean; keepEmpty?: boolean } = {}): Group[] {
  if (!doc.groups.some((g) => g.instanceOf)) return doc.groups;
  const ctx: Context = { components: doc.components ?? [], collections: doc.collections, widths, rows: o.rows !== false, keepEmpty: o.keepEmpty, left: MAX_INSTANCE_GROUPS };
  return doc.groups.flatMap((g) => (g.instanceOf ? expandOne(g, ctx, []) : [g]));
}

/* ---------- making and unmaking ---------- */

/** The chosen groups, with what they hold, turned into a definition and an instance in their place. */
export function makeComponent(groups: Group[], chosenIds: Set<string>, name: string, widths: Widths, id = uid()): { groups: Group[]; def: ComponentDef; instance: Group } | null {
  const units = groups.filter((g) => chosenIds.has(g.id));
  if (!units.length || units.some((g) => g.locked)) return null;
  const members = new Set(units.map((g) => g.id));
  for (const g of units) for (const held of heldBy(g, groups, widths)) members.add(held.id);
  const chosen = groups.filter((g) => members.has(g.id));
  const { l, t, r, b } = shownBounds(chosen, groups, widths);
  const def: ComponentDef = {
    id,
    name,
    w: Math.round(r - l),
    h: Math.round(b - t),
    groups: chosen.map((g) => {
      /* a layout left behind no longer places it; the instance takes that slot instead */
      const { inFlow, ...rest } = g;
      return { ...rest, x: g.x - l, y: g.y - t, ...(inFlow && members.has(inFlow) ? { inFlow } : {}) };
    }),
  };
  const first = chosen.find((g) => g.inFlow && !members.has(g.inFlow));
  const instance: Group = { ...standIn(def, l, t), ...(first ? { inFlow: first.inFlow, ...(first.pane !== undefined ? { pane: first.pane } : {}) } : {}) };
  const at = groups.findIndex((g) => members.has(g.id));
  /* what the rest of the screen reaches for goes on working: those parts are the instance's now */
  const moved = new Map(chosen.flatMap((g) => g.items.map((it) => [it.id, `${instance.id}/${it.id}`] as const)));
  const out = groups.filter((g) => !members.has(g.id)).map((g) => retarget(g, moved));
  out.splice(at, 0, instance);
  return { groups: out, def, instance };
}

/** the box around the groups given, leaving out what stands on a dock's other tab: that is still where it was last laid out */
function shownBounds(chosen: Group[], all: Group[], widths: Widths) {
  const off = outOfPane(all, widths);
  const seen = chosen.filter((g) => !off.has(g.id));
  return unionRect((seen.length ? seen : chosen).map((g) => {
    const s = ownSize(g, widths);
    return { l: g.x, t: g.y, r: g.x + s.w, b: g.y + s.h };
  }));
}

/** One instance as plain parts of its own, one level down: an instance nested in it stays one. It keeps
 *  its slot, its visibility and its lock through its one top-level part where it has just one, or
 *  through a plain container where it has several and something to keep. */
function detachedParts(g: Group, def: ComponentDef, newIds?: Map<string, string>): Group[] {
  const named = (id: string) => {
    const fresh = uid();
    newIds?.set(`${g.id}/${id}`, fresh);
    return fresh;
  };
  const parts = placedCopy(def, g.x, g.y, g, uid, named);
  const kept = { ...(g.inFlow ? { inFlow: g.inFlow } : {}), ...(g.pane !== undefined ? { pane: g.pane } : {}), ...(g.hidden ? { hidden: true } : {}), ...(g.showWhen ? { showWhen: g.showWhen } : {}), ...(g.locked ? { locked: true } : {}), ...(g.name ? { name: g.name } : {}) };
  const top = parts.filter((p) => !p.inFlow);
  if (top.length === 1) return parts.map((p) => (p === top[0] ? { ...p, ...kept } : p));
  if (!Object.keys(kept).length) return parts;
  const { instanceOf: _of, overrides: _over, properties: _props, ...rest } = g;
  return [{ ...rest, items: [{ ...g.items[0], component: "container", props: BOX(def.w, def.h) }] }, ...parts];
}

export function detachInstance(groups: Group[], id: string, components: ComponentDef[] | undefined): Group[] {
  const g = groups.find((x) => x.id === id);
  const def = g && components?.find((c) => c.id === g.instanceOf);
  if (!g || !def) return groups;
  const newIds = new Map<string, string>();
  const parts = detachedParts(g, def, newIds);
  /* what reached for a part inside it follows that part out */
  return groups.flatMap((x) => (x.id === id ? parts : [retarget(x, newIds)]));
}

/** a definition gone: what its instances showed stays, as plain parts, on the screens and in the other definitions */
export function removeComponent(groups: Group[], components: ComponentDef[], id: string): { groups: Group[]; components: ComponentDef[] } {
  const def = components.find((c) => c.id === id);
  if (!def) return { groups, components };
  const newIds = new Map<string, string>();
  const inGroups = (list: Group[]) => {
    const made = list.map((g) => (g.instanceOf === id ? detachedParts(g, def, newIds) : g));
    return made.flatMap((g) => (Array.isArray(g) ? g : [retarget(g, newIds)]));
  };
  return { groups: inGroups(groups), components: components.filter((c) => c.id !== id).map((c) => (usesOf(c).includes(id) ? { ...c, groups: inGroups(c.groups) } : c)) };
}

/* ---------- what an instance may change ---------- */

const OVERRIDABLE = new Set<PropDef["kind"]>(["text", "icon", "image", "bool"]);

export type OverridePart = { /** the part's path in the override key: `itemId`, or `nestedGroupId/itemId` */ path: string; item: Item; props: PropDef[] };

/** the parts inside a definition that an instance can change, with the props of each */
export function overridableParts(def: ComponentDef, components: ComponentDef[] | undefined, prefix = "", stack: string[] = [], budget = { left: MAX_INSTANCE_GROUPS }): OverridePart[] {
  return def.groups.flatMap((g): OverridePart[] => {
    /* bounded as an expansion is: nested definitions multiply what is listed */
    if (budget.left <= 0) return [];
    if (g.instanceOf) {
      const inner = components?.find((c) => c.id === g.instanceOf);
      if (!inner || stack.includes(inner.id) || inner.id === def.id || stack.length >= MAX_INSTANCE_DEPTH) return [];
      return overridableParts(inner, components, `${prefix}${g.id}/`, [...stack, def.id], budget).map((p) => ({ ...p, item: overridden({ ...p.item, id: p.path.slice(prefix.length + g.id.length + 1) }, g.overrides) }));
    }
    budget.left -= g.items.length;
    return g.items.flatMap((it) => {
      const part = partBySlug(it.component);
      /* a container's switches are how it lays out, not what it shows */
      const props = part?.holds === true ? [] : (part?.props.filter((d) => OVERRIDABLE.has(d.kind)) ?? []);
      return props.length ? [{ path: `${prefix}${it.id}`, item: it, props }] : [];
    });
  });
}

/** An instance's overrides with one changed. Set back to what the definition says, it stops being an
 *  override, so a later change to the definition reaches it again. */
export function withOverride(overrides: Group["overrides"], key: string, value: VarValue | undefined, inherited: unknown): Group["overrides"] {
  const { [key]: _was, ...rest } = overrides ?? {};
  const next = value === undefined || value === inherited ? rest : { ...rest, [key]: value };
  return Object.keys(next).length ? next : undefined;
}

/** the definition as the parts on its editing screen now stand: put back on its own top left */
export function definitionFrom(def: ComponentDef, groups: Group[], widths: Widths): ComponentDef {
  if (!groups.length) return { ...def, groups: [] };
  const { l, t, r, b } = shownBounds(groups, groups, widths);
  return { ...def, w: Math.round(r - l), h: Math.round(b - t), groups: groups.map((g) => ({ ...g, x: g.x - l, y: g.y - t })) };
}

/* ---------- copies ---------- */

/** A copy of a unit under fresh ids, moved by (dx, dy). An instance stays an instance of the same
 *  definition with the same overrides: those are keyed by the definition's ids, not the copy's. */
export function rekeyed(g: Group, dx: number, dy: number): Group {
  const idMap = new Map(g.items.map((it) => [it.id, uid()]));
  const pos: Record<string, { x: number; y: number }> | undefined = g.pos ? {} : undefined;
  if (pos) for (const it of g.items) pos[idMap.get(it.id)!] = g.pos?.[it.id] ?? { x: 0, y: 0 };
  const items = g.items.map((it): Item => ({ ...structuredClone(it), id: idMap.get(it.id)! }));
  return { ...structuredClone(g), id: uid(), x: g.x + dx, y: g.y + dy, pos, items };
}

/** Copies of several units: one laid out by another among them follows its copy; one whose container
 *  stays behind joins that container, next to the original. */
export function rekeyedAll(units: Group[], dx: number, dy: number, sameScreen = true): Group[] {
  /* what a copied part reaches for follows the copy, when that was copied too */
  const made = units.map((u) => rekeyed(u, dx, dy));
  const ids = new Map(units.flatMap((u, i) => u.items.map((it, j) => [it.id, made[i].items[j].id] as const)));
  const fresh = new Map(units.map((u, i) => [u.id, made[i].id]));
  /* a part inside an instance goes by the instance's id, and follows its copy too; a form may go by its group's */
  const follows = (id: string) => {
    const known = ids.get(id) ?? fresh.get(id);
    if (known) return known;
    const at = id.indexOf("/");
    const instance = at > 0 ? fresh.get(id.slice(0, at)) : undefined;
    return instance ? `${instance}${id.slice(at)}` : id;
  };
  const copies = made.map((c) => retarget(c, follows));
  return copies.map((c) => {
    if (!c.inFlow) return c;
    if (fresh.has(c.inFlow)) return { ...c, inFlow: fresh.get(c.inFlow) };
    if (sameScreen) return c;
    /* its container stayed behind on another screen: it does not reach across for it */
    const { inFlow: _left, ...rest } = c;
    return rest;
  });
}

/* ---------- variants, swapping and properties ---------- */

/** the variants of a set, in the order the document lists them */
export const variantsOf = (components: ComponentDef[] | undefined, setId: string | undefined): ComponentDef[] => (setId ? (components ?? []).filter((c) => c.set === setId) : []);

/** The variant of a set with these values for its properties, or the one that shares most of them with it (the
 *  first property counting most): picking one value of one property lands on the closest variant there is. */
export function variantMatching(components: ComponentDef[] | undefined, setId: string, values: Record<string, string>, order: string[] = Object.keys(values)): ComponentDef | undefined {
  const list = variantsOf(components, setId);
  const score = (c: ComponentDef) => order.reduce((n, name, i) => n + (c.variant?.[name] === values[name] ? 2 ** (order.length - i) : 0), 0);
  return list.reduce<ComponentDef | undefined>((best, c) => (!best || score(c) > score(best) ? c : best), undefined);
}

/** what a part is called when it is looked for in another component: its kind and the name it goes by */
const partName = (it: Item) => `${it.component ?? ""}|${it.label}`;

/** An instance's overrides carried to another component. A key whose part the other one has under the same path stays
 *  (variants copied from one another share their ids); one whose part goes by the same kind and name there follows
 *  it; the rest go, as Figma keeps an override where the layer names match. */
export function carriedOverrides(overrides: Group["overrides"], from: ComponentDef, to: ComponentDef, components: ComponentDef[] | undefined): Group["overrides"] {
  if (!overrides) return undefined;
  const there = overridableParts(to, components);
  const paths = new Set(there.map((p) => p.path));
  const before = new Map(overridableParts(from, components).map((p) => [p.path, p]));
  const out: Record<string, VarValue> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const at = key.lastIndexOf("/");
    const path = key.slice(0, at);
    const prop = key.slice(at + 1);
    if (paths.has(path)) {
      out[key] = value;
      continue;
    }
    const was = before.get(path);
    const same = was && there.find((p) => partName(p.item) === partName(was.item) && p.props.some((d) => d.key === prop) && out[`${p.path}/${prop}`] === undefined);
    if (same) out[`${same.path}/${prop}`] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** an instance's property values carried to another component: by the name and kind of property */
export function carriedProperties(values: Group["properties"], from: ComponentDef, to: ComponentDef): Group["properties"] {
  if (!values) return undefined;
  const out: Record<string, VarValue> = {};
  for (const [id, value] of Object.entries(values)) {
    const was = from.props?.find((p) => p.id === id);
    const now = to.props?.find((p) => p.id === id && (!was || p.type === was.type)) ?? (was && to.props?.find((p) => p.name === was.name && p.type === was.type));
    if (now) out[now.id] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** An instance made an instance of another component (a variant of its own, or any other): what it overrides and the
 *  values it gives follow where they can, and the box standing in for it takes the other one's size. */
export function swappedInstance(g: Group, to: ComponentDef, components: ComponentDef[] | undefined): Group {
  const from = components?.find((c) => c.id === g.instanceOf);
  const { overrides: _o, properties: _p, ...rest } = g;
  const overrides = from ? carriedOverrides(g.overrides, from, to, components) : undefined;
  const properties = from ? carriedProperties(g.properties, from, to) : undefined;
  const it = g.items[0];
  return {
    ...rest,
    instanceOf: to.id,
    ...(overrides ? { overrides } : {}),
    ...(properties ? { properties } : {}),
    items: it ? [{ ...it, label: to.name, props: { ...it.props, ...BOX(to.w, to.h) } }, ...g.items.slice(1)] : g.items,
  };
}

/** A copy of a definition to be another variant of it: the same parts under the same ids, so that an instance moved
 *  from one to the other keeps what it overrides. */
export const variantCopy = (def: ComponentDef, id: string, name: string, variant: Record<string, string>): ComponentDef => ({ ...structuredClone(def), id, name, variant });

/** what a definition's targets for a property can be: parts' words (override keys), its layers, its nested instances */
export function propertyTargets(def: ComponentDef, components: ComponentDef[] | undefined): { text: { key: string; item: Item; prop: PropDef }[]; layers: Group[]; nested: Group[] } {
  const text = overridableParts(def, components).flatMap((p) => p.props.filter((d) => d.kind === "text").map((d) => ({ key: `${p.path}/${d.key}`, item: p.item, prop: d })));
  return { text, layers: def.groups, nested: def.groups.filter((g) => !!g.instanceOf) };
}
