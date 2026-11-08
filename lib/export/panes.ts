import { partBySlug, reader } from "../../parts/registry";
import { flowOf, outOfPane } from "../flow";
import type { Group } from "../tokens";

/* A dock (a container whose rows are tabs: `PartDef.panes`) holds parts on each of its tabs, and only the chosen tab's
 * show. On a phone and in a mini-program the dock switches its tabs itself, so the printers print what every tab of a
 * dock with an auto layout holds, each tab's in a `DockPane` the kit's dock shows while that tab is chosen. What another
 * state of a region holds, and what lies loose over a dock with no auto layout, stays out as before (lib/flow.ts
 * `outOfPane`): nothing on the device could bring it into view. */

/** whether a group is a dock that lays out what its tabs hold, which shows them one tab at a time */
export function isLaidOutDock(g: Group): boolean {
  if (g.items.length !== 1 || g.states) return false;
  const def = partBySlug(g.items[0].component);
  return !!def?.panes && !!def.selectKey && !!def.slots && !!flowOf(g);
}

/** how many tabs a dock has */
function tabsOf(g: Group): number {
  const def = partBySlug(g.items[0].component);
  return def?.slots ? Math.max(1, def.slots(reader(def, g.items[0].props)).length) : 1;
}

/** the tab of its dock a part was dropped on, kept to the tabs there are (removing a tab must not lose what it held) */
export const paneOf = (k: Group, dock: Group): number => Math.max(0, Math.min(tabsOf(dock) - 1, Math.round(k.pane ?? 0)));

/** What a printer leaves out of its screens: what a dock's other tabs hold (lib/flow.ts `outOfPane`), except what a laid-
 *  out dock holds on its other tabs, and all that is laid out in that, which the printer hands the dock tab by tab. */
export function offTabOf(groups: Group[], widths: Record<string, number>): Set<string> {
  const off = outOfPane(groups, widths);
  if (!groups.some(isLaidOutDock)) return off;
  /* off for some other reason: with the laid-out docks taken for containers with no tabs */
  const plain = outOfPane(
    groups.map((g) => (isLaidOutDock(g) ? { ...g, items: [{ ...g.items[0], component: "container" }] } : g)),
    widths,
  );
  const byId = new Map(groups.map((g) => [g.id, g]));
  /* what a laid-out dock lays out, at any depth: a part loose over it would show on every tab, so it stays out */
  const underDock = (g: Group): boolean => {
    const seen = new Set<string>();
    for (let at = g.inFlow ? byId.get(g.inFlow) : undefined; at && !seen.has(at.id); at = at.inFlow ? byId.get(at.inFlow) : undefined) {
      seen.add(at.id);
      if (isLaidOutDock(at)) return true;
    }
    return false;
  };
  return new Set([...off].filter((id) => plain.has(id) || !underDock(byId.get(id)!)));
}

/** what a laid-out dock holds, tab by tab, in the order of its tabs */
export function dockPanes(dock: Group, kids: Group[]): [number, Group[]][] {
  const by = new Map<number, Group[]>();
  for (const k of kids) {
    const pane = paneOf(k, dock);
    by.set(pane, [...(by.get(pane) ?? []), k]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
}
