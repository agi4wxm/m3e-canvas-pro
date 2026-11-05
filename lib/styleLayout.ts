import { partBySlug } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import { roleOf } from "../parts/role";
import { isStrict, recipesOf, uxOf, type StyleUX } from "./styles";
import { lengthToHold, MATERIAL_METRICS, stretchFrame, tidyFrame, type LayoutMetrics } from "./tidy";
import { frameLengthOf, frameOfGroup, frameRect, frameSizeOf, groupBounds, isExpanded, railWidth, type Frame, type Group, type Item, type Theme } from "./tokens";

/* The third layer of a style: how a screen is laid out. Changing style moves the main navigation to where that product
 * has it, gives the body that product's margins, and runs Tidy with that product's gaps. Only the screens' own parts move:
 * what is locked, and what a layout holds, stays as it is. Rules only, as Tidy is: nothing here is guessed by a model. */

/** what Tidy spaces a screen by under a theme */
export function metricsOf(theme: Theme): LayoutMetrics {
  const ux = uxOf(theme);
  /* lists that run from edge to edge have nowhere to keep a margin */
  const edgeToEdge = new Set<string>([...(recipesOf(theme).list === "flush" ? ["item"] : []), ...(ux.bleed ?? [])]);
  return { margin: ux.margin, gap: ux.gap, tight: ux.tight, sitsOn: isStrict(theme), flush: edgeToEdge.size ? (it) => edgeToEdge.has(it.component ?? "") : undefined };
}

const isBar = (it: Item) => it.component === "navigation-bar";
const isRail = (it: Item) => it.component === "navigation-rail";
/** tabs that took the place of a navigation bar under a style, and go back to being one */
const isNavTabs = (it: Item) => it.component === "tabs" && it.navTabs === true;
const isNav = (it: Item) => isBar(it) || isRail(it) || isNavTabs(it);

/** the part as the kind of navigation a style wants on this screen; M3 has no bar on a wide window, and neither has anyone else */
function navAs(it: Item, kind: StyleUX["nav"], frame: Frame): Item {
  const common = { items: it.props?.items, selected: it.props?.selected };
  const { w } = frameSizeOf(frame);
  const want = kind === "keep" ? (isNavTabs(it) ? "bottom" : null) : kind;
  /* a screen too wide for a bar has a rail in its place, whatever the phone version does */
  const to = want === "bottom" && isExpanded(w) ? "rail" : want;
  if (to === "bottom" && !isBar(it)) return { ...withoutNavTabs(it), component: "navigation-bar", props: { ...common, width: w } };
  if (to === "rail" && !isRail(it)) return { ...withoutNavTabs(it), component: "navigation-rail", props: { ...common, narrow: true, fab: false, menu: false, height: frameLengthOf(frame) } };
  if (to === "top" && !isNavTabs(it)) return { ...it, component: "tabs", navTabs: true, props: { ...common, width: w } };
  return it;
}

function withoutNavTabs(it: Item): Item {
  const { navTabs: _was, ...rest } = it;
  return rest;
}

/** how much of a screen's width the rails standing on it take */
const railsWidth = (mine: Group[]) => mine.reduce((sum, g) => sum + (g.items.length === 1 && isRail(g.items[0]) ? railWidth(g.items[0]) : 0), 0);

type Result = { groups: Group[]; frames: Frame[] };

/** One screen laid out the way a style lays them out. */
function layoutScreen(state: Result, frame: Frame, measures: Record<string, number>, ux: StyleUX, m: LayoutMetrics, pick: boolean): Result {
  const owner = (g: Group) => frameOfGroup(g, state.frames, measures)?.id === frame.id;
  const free = (g: Group) => owner(g) && !g.inFlow && !g.locked && roleOf(g.items[0]) !== "backdrop";
  /* 1. the navigation goes where the product has it; only the first, and only one standing on its own */
  const fr = frameRect(frame);
  const { w: screenW } = frameSizeOf(frame);
  const navGroup = state.groups.find((g) => free(g) && g.items.length === 1 && isNav(g.items[0]));
  let groups = state.groups;
  if (navGroup) {
    const was = navGroup.items[0];
    const now = navAs(was, ux.nav, frame);
    if (now !== was) {
      /* what was measured was the other part: this one is as big as its kind, until it is drawn */
      measures[now.id] = isRail(now) ? railWidth(now) : screenW;
      measures[`${now.id}:h`] = isRail(now) ? frameLengthOf(frame) : (partBySlug(now.component)?.h ?? 48);
      /* a rail runs from the head of the screen; Tidy pins a bar or tabs to their edge from wherever they are */
      groups = state.groups.map((g) => (g === navGroup ? { ...g, x: fr.l, y: isRail(now) ? fr.t : g.y, items: [now] } : g));
    }
  }

  const mine = groups.filter(free);
  const bodyW = screenW - railsWidth(mine);
  const inner = bodyW - m.margin * 2;
  /* the widest part in the body says how wide the body was: what filled it fills the new one */
  const bodyParts = mine.filter((g) => g.items.length === 1 && !["top", "bottom", "rail", "overlay", "fab", "floatingBottom", "fullWidth"].includes(roleOf(g.items[0]) ?? ""));
  const widthOf = (it: Item) => {
    const ax = resizeOf(partBySlug(it.component), it.props);
    return ax?.width ? axisValue(ax.width, it.props) : undefined;
  };
  /* a list that runs edge to edge says nothing of how wide the rest may be */
  const widest = Math.max(0, ...bodyParts.filter((g) => !m.flush?.(g.items[0])).map((g) => widthOf(g.items[0]) ?? 0));
  /* the body as it was, beside the rail that was there */
  const wasBody = screenW - railsWidth(state.groups.filter(free));
  const wasInner = widest >= wasBody * 0.8 ? widest : Math.max(wasBody - 32, 1);
  /* what stands on a picture is a composition: it keeps its size. And a wide screen's panels are not shares of it */
  const composed = groups.some((g) => owner(g) && roleOf(g.items[0]) === "backdrop");
  const resize = (it: Item, to: number): Item => {
    const ax = resizeOf(partBySlug(it.component), it.props)?.width;
    if (!ax) return it;
    /* what was measured may be of an earlier width: this one holds until the part is drawn at it */
    measures[it.id] = to;
    return axisValue(ax, it.props) === to ? it : { ...it, props: { ...it.props, [ax.key]: axisWrite(ax, to) } };
  };

  /* 2. bars span the body, a list a style runs edge to edge spans it too, and the rest keeps its share of it */
  groups = groups.map((g) => {
    if (!free(g) || g.items.length !== 1) return g;
    const it = g.items[0];
    const r = roleOf(it);
    if (r === "top" || (r === "bottom" && isBar(it))) return { ...g, items: [resize(it, bodyW)] };
    /* what floats at the foot may not reach past the body it floats over */
    if (r === "floatingBottom" && (widthOf(it) ?? 0) > inner) return { ...g, items: [resize(it, inner)] };
    if (!composed && bodyParts.some((b) => b.id === g.id)) {
      if (m.flush?.(it)) return { ...g, items: [resize(it, bodyW)] };
      const cur = widthOf(it);
      if (cur === undefined) return g;
      const share = cur / wasInner;
      /* widths come in whole shares of the body: all of it when the part has the row to itself, a half, or a third */
      const box = groupBounds(g, measures);
      const alone = !bodyParts.some((o) => {
        if (o.id === g.id) return false;
        const b = groupBounds(o, measures);
        return Math.min(box.b, b.b) - Math.max(box.t, b.t) > 1;
      });
      if (share >= 0.85 || (share >= 0.7 && alone)) return { ...g, items: [resize(it, inner)] };
      if (!isExpanded(screenW) && share >= 0.42 && share <= 0.56) return { ...g, items: [resize(it, Math.floor((inner - 8) / 2))] };
      if (!isExpanded(screenW) && share >= 0.28 && share <= 0.38) return { ...g, items: [resize(it, Math.floor((inner - 16) / 3))] };
    }
    return g;
  });

  /* 3. where the body gathers: a screen keeps its own, until a style is put on the whole document */
  const place = !pick || ux.place === "top" ? (pick ? undefined : frame.place) : ux.place;
  const placed: Frame = frame.place === place ? frame : { ...frame, place };

  /* 4. a style with more room around things may need a longer screen than the last one did, and one that needs less
     gives back what a style took. The length comes first: Tidy leaves what does not fit where it was */
  const base = placed.grownFrom ?? frameLengthOf(placed);
  const length = Math.max(base, Math.ceil(lengthToHold(groups.filter(owner), placed, measures, m) / 4) * 4);
  const grownFrom = length > base ? base : undefined;
  let frames = placed === frame ? state.frames : state.frames.map((f) => (f.id === frame.id ? placed : f));
  let next = placed;
  if (length !== frameLengthOf(placed) || grownFrom !== placed.grownFrom) {
    const stretched = stretchFrame(groups, placed, length, frames, measures);
    groups = stretched.groups;
    frames = stretched.frames.map((f) => (f.id === frame.id ? (next = grownFrom ? { ...f, grownFrom } : f) : f));
  }

  /* 5. and the rules of Tidy, with this style's numbers */
  return { groups: tidyFrame(groups, next, frames, measures, m) ?? groups, frames };
}

/** Every screen laid out the way a theme's style lays them out, or null when nothing would move. */
export function layoutForStyle(groups: Group[], frames: Frame[], widths: Record<string, number>, theme: Theme, opts: { together?: string[][]; pick?: boolean } = {}): Result | null {
  const ux = uxOf(theme);
  const m = { ...metricsOf(theme), together: opts.together };
  /* the sizes given here hold until the parts are drawn at them, for every screen after this one too */
  const measures = { ...widths };
  let state: Result = { groups, frames };
  for (const f of frames) {
    const live = state.frames.find((x) => x.id === f.id) ?? f;
    state = layoutScreen(state, live, measures, ux, m, !!opts.pick);
  }
  return state.groups === groups && state.frames === frames ? null : state;
}

export { MATERIAL_METRICS };
