/* What the editor's canvas works with besides the document: how it eases and springs, the camera, what a drag and a
 * gesture carry, the smart guides, and the left rail's tabs. */

import { partBySlug } from "@/parts/registry";
import { resizeOf } from "@/parts/resize";
import { childLayoutOf, flowOf, outOfPane } from "@/lib/flow";
import { insertionMark, type GuideGap, type GuideLine } from "@/lib/guides";
import { getLang, t } from "@/lib/i18n";
import { groupBounds, PHONE_MARGIN, SETTLE_MS, type Group, type Item } from "@/lib/tokens";

/** the screens while a model drafts: primary, tertiary and primary container, drifting */
export const BASE_PATH = import.meta.env.VITE_BASE_PATH ?? "";

/** the dragged part's own travel: a little lag reads as weight */
export const CARRY = {
  type: "spring" as const,
  stiffness: 620,
  damping: 38,
  mass: 0.7,
};
/** the gap opening and the run's counter-shift; identical configs so they cancel */
export const OPEN = {
  type: "spring" as const,
  stiffness: 700,
  damping: 42,
  mass: 0.55,
};
export const INSTANT = { duration: 0 };
/** a cancelled part shrinking away: long enough to be seen, short enough not to be waited for */
export const VANISH_MS = 180;
export const VANISH = { duration: VANISH_MS / 1000, ease: [0.3, 0, 0.8, 0.15] as const };
/** a hole opening or closing: the run's offset travels on the same curve the hole's own width does */
export const GAP_TWEEN = { duration: SETTLE_MS / 1000, ease: [0.2, 0, 0, 1] as const };

/** the icon rail on the left edge of the parts / layers panel */
export const RAIL_W = 52;
export const MIN_Z = 0.25;
export const MAX_Z = 3;
/** the room a screen keeps from the canvas edges when the camera glides to it: the floating
 *  toolbar's row at the top, a margin elsewhere */
export const GLIDE_TOP = 84;
export const GLIDE_PAD = 40;
export const UI_KEY = "m3e:ui";

export type View = { x: number; y: number; z: number };

/** Smart guides for what is being carried: where it snaps on each axis (left out where it does not), and what to draw:
 *  the lines it lines up with, the even gaps it keeps, the distances to its neighbours (lib/guides.ts). */
export type Guide = { x?: number; y?: number; lines: GuideLine[]; gaps: GuideGap[] };
export const GUIDE_PX = 7;

/** How far below the top of a drawn part its first line of text sits. The browser gives the box of that line's glyphs;
 *  the baseline is taken at four fifths of it, where it falls for the Latin and CJK faces a style uses. Undefined for a
 *  part with no words. */
export function firstBaseline(el: HTMLElement, top: number): number | undefined {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getClientRects()[0];
    if (r && r.height > 0) return Math.max(1, Math.round(r.top + r.height * 0.8 - top));
  }
  return undefined;
}

export const FRAME_MARGIN = PHONE_MARGIN;

export type DragState = {
  item: Item;
  guide: Guide | null;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  px: number;
  py: number;
  active: boolean;
  fromPalette: boolean;
  overBin: boolean;
  /** let go where it cannot land: the ghost shrinks away before the state is cleared */
  vanishing: boolean;
  /** what is carried from the Components tab: it lands as an instance of this definition */
  instance?: string;
  /** A kit carried from the palette: `item` is its outermost box, and these are all its groups with
   *  that box's top left at 0,0, and the sizes they were laid out by. It lands as all of them. */
  kit?: { slug: string; variant?: string; groups: Group[]; measures: Record<string, number> };
};

export type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | {
      kind: "marquee";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      moved: boolean;
      /** started on a screen's own ground: a press there with no drag selects the screen */
      frame?: string;
      /** Ctrl/Cmd held: the parts themselves, not the outermost layers they are in */
      deep?: boolean;
      /** what was selected when it started, kept with Shift */
      base?: string[];
    }
  | {
      kind: "frame";
      id: string;
      sx: number;
      sy: number;
      fx: number;
      fy: number;
      groups: { id: string; x: number; y: number }[];
      moved: boolean;
    }
  | { kind: "group"; id: string; sx: number; sy: number; gx: number; gy: number; moved: boolean; overBin: boolean; guide?: Guide | null; carry?: { id: string; x: number; y: number }[] };

/** a repeated row other than the template, on the canvas */
export const ROW_DIM = 0.5;

/** a part drawn open (a dialog, a menu) floats over the parts around it, whichever was added later */
export const drawnOpen = (g: Group) => g.items.some((it) => !!partBySlug(it.component)?.open);
/** the handles of a part: pulled by whichever measures its props have */
export const componentAxes = (it: Item) => resizeOf(partBySlug(it.component), it.props);
export const BAR_SIDES = ["left", "right"] as const;
export const TALL_SIDES = ["top", "bottom"] as const;

/** a screen changing size eases the way a settling part does */
export const SIZE_TRANSITION = `width ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), height ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), border-radius ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
/** how a part hidden at the start of the preview is drawn on the canvas */
export const HIDDEN_DIM = 0.4;

/** Seed ids are deterministic so server and client render the same markup. */
/* shown when an edit is refused because the group is locked */
export const lockedGroupMsg = () => t("lockedGroup", getLang());
export const groupRefusedMsg = () => t("groupInstanceRefused", getLang());

/** the id a part carried from the palette goes by while it is carried */
export const CARRIED = "carried";

/** the document with a part being carried standing where it is now, in place of where it was */
export const carriedDrag = (groups: Group[], item: Item, x: number, y: number): Group[] => [...groups.filter((g) => !g.items.some((it) => it.id === item.id)), { id: CARRIED, x, y, axis: "x", items: [item] }];

/** The slot a carried group would take in the auto layout under it, by the order the layout reads its parts, and the line
 *  that marks it there. What stands loose in the layout, or on a tab not showing, has no place in the run. */
export function slotIn(host: Group, groups: Group[], id: string, widths: Record<string, number>) {
  const f = flowOf(host);
  const carried = groups.find((g) => g.id === id);
  if (!f || !carried) return null;
  const off = outOfPane(groups, widths);
  const kids = groups.filter((g) => g.inFlow === host.id && g.id !== id && !off.has(g.id) && !(g.items.length === 1 && childLayoutOf(g.items[0]).absolute)).map((g) => groupBounds(g, widths));
  const b = groupBounds(host, widths);
  const room = { l: b.l + f.inset.l + f.pad.l, t: b.t + f.inset.t + f.pad.t, r: b.r - f.inset.r - f.pad.r, b: b.b - f.inset.b - f.pad.b };
  return insertionMark(kids, { x: carried.x, y: carried.y }, { dir: f.dir, wrap: f.wrap, gap: f.gap }, room);
}
export type LeftTab = "parts" | "templates" | "components" | "data" | "api" | "mocks" | "variables" | "layers" | "style" | "color" | "shape" | "type" | "motion" | "ai";
/** the left rail: parts, templates, what the design reuses and layers, then the look of the whole design: its style, and the four axes under it */
export const LEFT_TABS: { key: LeftTab; icon: string; title: "parts" | "screenTemplates" | "components" | "data" | "apiTab" | "mocksTab" | "vrTitle" | "layers" | "styleTab" | "colors" | "shape" | "typography" | "motion" | "ai" }[] = [
  { key: "parts", icon: "add_box", title: "parts" },
  { key: "templates", icon: "dashboard_customize", title: "screenTemplates" },
  { key: "components", icon: "widgets", title: "components" },
  { key: "data", icon: "table_chart", title: "data" },
  { key: "api", icon: "api", title: "apiTab" },
  { key: "mocks", icon: "science", title: "mocksTab" },
  { key: "variables", icon: "data_object", title: "vrTitle" },
  { key: "layers", icon: "layers", title: "layers" },
  { key: "style", icon: "style", title: "styleTab" },
  { key: "color", icon: "palette", title: "colors" },
  { key: "shape", icon: "rounded_corner", title: "shape" },
  { key: "type", icon: "text_fields", title: "typography" },
  { key: "motion", icon: "animation", title: "motion" },
  { key: "ai", icon: "auto_awesome", title: "ai" },
];
