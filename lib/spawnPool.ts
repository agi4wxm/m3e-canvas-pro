/* A screen's templates of instances spawned on events (lib/spawn.ts) as a host that draws pages lays them out: the
 * template and what it holds, its words' expressions marked so that nothing reads them before an instance does
 * (`markTemplates`, before the screen's bindings fill its words), then `max` copies of it standing where it stands, each
 * marked with its template and its place in the pool (`poolCopies`, once the screen is laid out). The copies are drawn
 * hidden; lib/spawnDom.ts shows and fills them as instances come and go. The copies are made as a repeat makes its rows
 * (lib/collections.ts `blockCopy`: ids `<template>#<place>/<id>`), the first being the template itself. The editor's
 * own: an exported app's printer lays out its pool the same way from the same groups. */

import { blockCopy, fillDeep, measuresFor } from "./collections";
import { markSpawnWords, spawnSpecOf, type SpawnSpec } from "./spawn";
import { heldBy, type Group, type Item } from "./tokens";

type Widths = Record<string, number>;

/** a template and what it holds, the template first */
export const templateMembers = (template: Group, groups: Group[], widths: Widths): Group[] => [template, ...heldBy(template, groups, widths).filter((g) => g !== template)];

const marked = (it: Item): Item => {
  const props = it.props ? fillDeep(it.props, markSpawnWords) : undefined;
  return props === it.props ? it : { ...it, props };
};

/** Every template's words with their expressions marked (lib/spawn.ts `markSpawnWords`): read by an instance, as it is
 *  spawned, not by the screen. The same groups when the screen has no template. */
export function markTemplates(groups: Group[], widths: Widths): Group[] {
  if (!groups.some((g) => g.spawn)) return groups;
  const inTemplate = new Set(groups.filter((g) => g.spawn).flatMap((g) => templateMembers(g, groups, widths).map((x) => x.id)));
  return groups.map((g) => {
    if (!inTemplate.has(g.id)) return g;
    const items = g.items.map(marked);
    return items.every((it, i) => it === g.items[i]) ? g : { ...g, items };
  });
}

/** the templates of a screen and what each says of its instances, by group id */
export const templatesOf = (groups: Group[]): Map<string, SpawnSpec> => new Map(groups.flatMap((g) => (g.spawn ? [[g.id, spawnSpecOf(g.spawn)!] as const] : [])));

/** Every template laid out as its pool: the template as place 0, then a copy for each other place up to its `max`, all
 *  where it stands, every group of each marked with `spawnSlot`. With the measures a copy takes from what it copies. */
export function poolCopies(groups: Group[], widths: Widths): { groups: Group[]; widths: Widths } {
  const templates = groups.filter((g) => g.spawn);
  if (!templates.length) return { groups, widths };
  let out = groups;
  for (const t of templates) {
    const spec = spawnSpecOf(t.spawn)!;
    const members = templateMembers(t, out, widths);
    const inBlock = new Set(members.map((g) => g.id));
    /* a copy is no template of its own: only the template says what its instances are */
    const slot = (g: Group, at: number): Group => {
      const { spawn: _own, ...rest } = g;
      return { ...(at === 0 ? g : rest), spawnSlot: { of: t.id, slot: at } };
    };
    const first = out.map((g) => (inBlock.has(g.id) ? slot(g, 0) : g));
    const copies = Array.from({ length: spec.max - 1 }, (_, i) => blockCopy(members, t.id, i + 1, (it) => it).map((g) => slot(g, i + 1))).flat();
    let last = -1;
    first.forEach((g, i) => {
      if (inBlock.has(g.id)) last = i;
    });
    first.splice(last + 1, 0, ...copies);
    out = first;
  }
  return { groups: out, widths: measuresFor(out, widths) };
}
