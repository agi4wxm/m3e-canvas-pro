import { partBySlug } from "../parts/registry";
import { expandRepeats, measuresFor } from "./collections";
import { arrangeFlows, ownSize } from "./flow";
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
const BOX = (w: number, h: number) => ({ label: "", note: "", fill: "none", border: "none", radius: 0, width: Math.round(w), height: Math.round(h) });

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

/** A definition's groups placed at (x, y) under new ids. What they point at among themselves follows. */
function placedCopy(def: ComponentDef, x: number, y: number, overrides: Group["overrides"], groupId: (id: string) => string, itemId: (id: string) => string): Group[] {
  const groupIds = new Map(def.groups.map((g) => [g.id, groupId(g.id)]));
  const itemIds = new Map(def.groups.flatMap((g) => g.items.map((it) => [it.id, itemId(it.id)] as const)));
  return def.groups.map((g) => {
    const { inFlow, overrides: _own, ...rest } = g;
    const down = g.instanceOf ? passedDown(g, overrides) : undefined;
    return retarget(
      {
        ...rest,
        id: groupIds.get(g.id)!,
        x: g.x + x,
        y: g.y + y,
        ...(inFlow && groupIds.has(inFlow) ? { inFlow: groupIds.get(inFlow) } : {}),
        ...(down ? { overrides: down } : {}),
        ...(g.pos ? { pos: Object.fromEntries(Object.entries(g.pos).map(([id, p]) => [itemIds.get(id) ?? id, p])) } : {}),
        items: g.items.map((it) => ({ ...overridden(it, overrides), id: itemIds.get(it.id)! })),
      },
      itemIds,
    );
  });
}

type Context = { components: ComponentDef[]; collections?: Collection[]; widths: Widths; rows: boolean; keepEmpty?: boolean };

/** the container left where an instance was, its size what the parts come to */
function wrapperOf(g: Group, name: string, w: number, h: number): Group {
  const { instanceOf: _of, overrides: _over, ...rest } = g;
  return { ...rest, expandedFrom: name, items: [{ ...g.items[0], component: "container", props: BOX(w, h) }] };
}

/** One instance as the container left in its place and the parts on it. `stack` is the definitions
 *  being expanded around this one: a file can hold a loop that the editor would have refused, and
 *  the loop stops here, empty, rather than going on for ever. */
function expandOne(g: Group, ctx: Context, stack: string[]): Group[] {
  const def = ctx.components.find((c) => c.id === g.instanceOf);
  if (!def) return [wrapperOf(g, "", 40, 40)];
  if (stack.includes(def.id)) return [wrapperOf(g, def.name, def.w, def.h)];
  const clones = placedCopy(def, g.x, g.y, g.overrides, (id) => `${g.id}/${id}`, (id) => `${g.id}/${id}`);
  let kids = clones.flatMap((k) => (k.instanceOf ? expandOne(k, ctx, [...stack, def.id]) : [k]));
  if (ctx.rows) kids = expandRepeats(kids, { collections: ctx.collections, widths: ctx.widths, keepEmpty: ctx.keepEmpty });
  const measures = measuresFor(kids, ctx.widths);
  kids = arrangeFlows(kids, measures);
  /* a second pass settles a hugging layout inside a layout */
  kids = arrangeFlows(kids, measures);
  if (!kids.length) return [wrapperOf(g, def.name, def.w, def.h)];
  const r = Math.max(...kids.map((k) => k.x + ownSize(k, measures).w));
  const b = Math.max(...kids.map((k) => k.y + ownSize(k, measures).h));
  return [wrapperOf(g, def.name, r - g.x, b - g.y), ...kids];
}

/** Every instance as plain groups. `rows: false` leaves repeats inside them undrawn, for the prompt.
 *  The same array comes back when there is nothing to expand. */
export function expandInstances(doc: Pick<Doc, "groups" | "components" | "collections">, widths: Widths = {}, o: { rows?: boolean; keepEmpty?: boolean } = {}): Group[] {
  if (!doc.groups.some((g) => g.instanceOf)) return doc.groups;
  const ctx: Context = { components: doc.components ?? [], collections: doc.collections, widths, rows: o.rows !== false, keepEmpty: o.keepEmpty };
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
  const box = (g: Group) => {
    const s = ownSize(g, widths);
    return { l: g.x, t: g.y, r: g.x + s.w, b: g.y + s.h };
  };
  const { l, t, r, b } = unionRect(chosen.map(box));
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
  const out = groups.filter((g) => !members.has(g.id));
  out.splice(at, 0, instance);
  return { groups: out, def, instance };
}

/** One instance as plain parts of its own, one level down: an instance nested in it stays one. It keeps
 *  its slot, its visibility and its lock through its one top-level part where it has just one, or
 *  through a plain container where it has several and something to keep. */
function detachedParts(g: Group, def: ComponentDef): Group[] {
  const parts = placedCopy(def, g.x, g.y, g.overrides, uid, uid);
  const kept = { ...(g.inFlow ? { inFlow: g.inFlow } : {}), ...(g.pane !== undefined ? { pane: g.pane } : {}), ...(g.hidden ? { hidden: true } : {}), ...(g.showWhen ? { showWhen: g.showWhen } : {}), ...(g.locked ? { locked: true } : {}), ...(g.name ? { name: g.name } : {}) };
  const top = parts.filter((p) => !p.inFlow);
  if (top.length === 1) return parts.map((p) => (p === top[0] ? { ...p, ...kept } : p));
  if (!Object.keys(kept).length) return parts;
  const { instanceOf: _of, overrides: _over, ...rest } = g;
  return [{ ...rest, items: [{ ...g.items[0], component: "container", props: BOX(def.w, def.h) }] }, ...parts];
}

export function detachInstance(groups: Group[], id: string, components: ComponentDef[] | undefined): Group[] {
  const g = groups.find((x) => x.id === id);
  const def = g && components?.find((c) => c.id === g.instanceOf);
  if (!g || !def) return groups;
  return groups.flatMap((x) => (x.id === id ? detachedParts(x, def) : [x]));
}

/** a definition gone: what its instances showed stays, as plain parts, on the screens and in the other definitions */
export function removeComponent(groups: Group[], components: ComponentDef[], id: string): { groups: Group[]; components: ComponentDef[] } {
  const def = components.find((c) => c.id === id);
  if (!def) return { groups, components };
  const inGroups = (list: Group[]) => list.flatMap((g) => (g.instanceOf === id ? detachedParts(g, def) : [g]));
  return { groups: inGroups(groups), components: components.filter((c) => c.id !== id).map((c) => (usesOf(c).includes(id) ? { ...c, groups: inGroups(c.groups) } : c)) };
}

/* ---------- what an instance may change ---------- */

const OVERRIDABLE = new Set<PropDef["kind"]>(["text", "icon", "image", "bool"]);

export type OverridePart = { /** the part's path in the override key: `itemId`, or `nestedGroupId/itemId` */ path: string; item: Item; props: PropDef[] };

/** the parts inside a definition that an instance can change, with the props of each */
export function overridableParts(def: ComponentDef, components: ComponentDef[] | undefined, prefix = "", stack: string[] = []): OverridePart[] {
  return def.groups.flatMap((g): OverridePart[] => {
    if (g.instanceOf) {
      const inner = components?.find((c) => c.id === g.instanceOf);
      if (!inner || stack.includes(inner.id) || inner.id === def.id) return [];
      return overridableParts(inner, components, `${prefix}${g.id}/`, [...stack, def.id]).map((p) => ({ ...p, item: overridden({ ...p.item, id: p.path.slice(prefix.length + g.id.length + 1) }, g.overrides) }));
    }
    return g.items.flatMap((it) => {
      const part = partBySlug(it.component);
      /* a container's switches are how it lays out, not what it shows */
      const props = part?.holds ? [] : (part?.props.filter((d) => OVERRIDABLE.has(d.kind)) ?? []);
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
  const bounds = groups.map((g) => {
    const s = ownSize(g, widths);
    return { l: g.x, t: g.y, r: g.x + s.w, b: g.y + s.h };
  });
  const { l, t, r, b } = unionRect(bounds);
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
  const copies = made.map((c) => retarget(c, ids));
  const fresh = new Map(units.map((u, i) => [u.id, copies[i].id]));
  return copies.map((c) => {
    if (!c.inFlow) return c;
    if (fresh.has(c.inFlow)) return { ...c, inFlow: fresh.get(c.inFlow) };
    if (sameScreen) return c;
    /* its container stayed behind on another screen: it does not reach across for it */
    const { inFlow: _left, ...rest } = c;
    return rest;
  });
}
