import type { Rect } from "./tokens";

/* The lines the canvas draws from a tappable part to the screen it opens. A design has many of them,
 * so a line shows when it is about what is selected, or when the author asks for them all. */

/** parts that switch between the app's main screens: every screen has one, so their lines say little */
const NAV_SLUGS = new Set(["navigation-bar", "navigation-rail", "floating-nav", "tabs", "side-tabs", "sidebar"]);
export const isNavPart = (slug: string | undefined) => !!slug && NAV_SLUGS.has(slug);

const CORNER = 16;
/** how far above the screens the line that goes around them runs, clear of their names */
const LANE = 72;

type Box = { l: number; t: number; r: number; b: number };

export type Route = { d: string; mx: number; my: number; tx: number; ty: number; ang: number };

/** A line from a part to a screen. Straight across to a neighbour; one that would cross other
 *  screens runs above them and comes down into its screen from the top. */
export function routeLink(from: Box, to: Rect, others: Rect[], source: Rect | undefined, bezel: number, laneShift = 0): Route {
  const rightward = (to.l + to.r) / 2 >= (from.l + from.r) / 2;
  const sx = rightward ? from.r : from.l;
  const sy = (from.t + from.b) / 2;
  const left = Math.min(sx, to.l);
  const right = Math.max(sx, to.r);
  const between = others.filter((o) => o.l > left - 1 && o.r < right + 1 && o.t < to.b && o.b > to.t);
  if (between.length && source) {
    const dir = rightward ? 1 : -1;
    const lane = Math.min(to.t, source.t, ...between.map((o) => o.t)) - LANE - laneShift;
    const edge = (rightward ? source.r : source.l) + dir * (bezel + CORNER);
    /* into the far end of the top edge: the screen's name stands at the near one */
    const tx = to.l + (to.r - to.l) * 0.75;
    const ty = to.t - bezel;
    const d = [
      `M${sx} ${sy}`,
      `L${edge - dir * CORNER} ${sy}`,
      `Q${edge} ${sy} ${edge} ${sy - CORNER}`,
      `L${edge} ${lane + CORNER}`,
      `Q${edge} ${lane} ${edge + dir * CORNER} ${lane}`,
      `L${tx - dir * CORNER} ${lane}`,
      `Q${tx} ${lane} ${tx} ${lane + CORNER}`,
      `L${tx} ${ty}`,
    ].join(" ");
    return { d, mx: (edge + tx) / 2, my: lane, tx, ty, ang: 90 };
  }
  const tx = rightward ? to.l - bezel : to.r + bezel;
  const ty = Math.min(Math.max(sy, to.t + 40), to.b - 40);
  const dx = Math.max(60, Math.abs(tx - sx) * 0.5);
  const c1x = sx + (rightward ? dx : -dx);
  const c2x = tx + (rightward ? -dx : dx);
  return {
    d: `M${sx} ${sy} C${c1x} ${sy} ${c2x} ${ty} ${tx} ${ty}`,
    // midpoint of the cubic at t = 0.5
    mx: 0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * tx,
    my: 0.5 * sy + 0.5 * ty,
    tx,
    ty,
    ang: rightward ? 0 : 180,
  };
}

export type LinkSource = { id: string; itemId: string; to: string };

/** One line per part and screen it opens: the rows of a list that all open one screen are one line,
 *  which stands for all of them. */
export function mergeLinks<L extends LinkSource>(links: L[]): (L & { ids: string[] })[] {
  const byRoute = new Map<string, L & { ids: string[] }>();
  for (const l of links) {
    const key = `${l.itemId}>${l.to}`;
    const seen = byRoute.get(key);
    if (seen) seen.ids.push(l.id);
    else byRoute.set(key, { ...l, ids: [l.id] });
  }
  return [...byRoute.values()];
}

export type LinkLine = LinkSource & { fromFrame?: string; nav: boolean };

/** which lines to draw: what is selected picks its own, and "show all" adds all but the navigation
 *  bars', which only say that every main screen reaches every other. */
export function shownLinks<L extends LinkLine>(links: L[], o: { all: boolean; selectedIds: string[]; selectedFrameId: string | null; selectedLinkId: string | null }): L[] {
  const picked = new Set(o.selectedIds);
  return links.filter((l) => {
    if (l.id === o.selectedLinkId || picked.has(l.itemId)) return true;
    if (l.nav) return false;
    return o.all || (o.selectedFrameId !== null && (l.fromFrame === o.selectedFrameId || l.to === o.selectedFrameId));
  });
}
