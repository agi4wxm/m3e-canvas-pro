/* What stands over the foot of a screen whose body grows with its data, and the room the body leaves at its end so that
 * its last row scrolls clear of it. A screen that loads data is as long as what the data makes of it: its body scrolls,
 * while the bars and buttons at its foot stay on the glass over it. Without room at its end the last row would stay
 * under them. The editor's preview (components/Preview.tsx) and the three apps the product exports (the web app,
 * lib/codegen.ts; React Native, lib/export/rn/print.ts; the mini-program, lib/export/miniapp/print.ts) go by this one
 * rule, so a screen ends the same way everywhere. */

import { roleOf } from "../parts/role";
import { frameRect, frameSizeOf, groupBounds, type Frame, type Group } from "./tokens";
import { pinOf } from "./tidy";

/** the air between the end of the body and the highest of what floats over it */
export const FOOT_GAP = 24;

/** parts that are buttons a person taps: standing loose at a screen's foot, they float there over its data */
const FLOATING_CONTROLS = new Set(["button", "icon-button", "fab", "split-button", "fab-menu", "button-group"]);

export type Foot = {
  /** the groups that stay at the foot of the glass, over the body */
  floats: Set<string>;
  /** how far each of them stands above the screen's foot (from its own foot), by group */
  above: Map<string, number>;
  /** how far the body's end scrolls past its content, so that the last row clears them all: 0 with nothing at the foot */
  room: number;
};

/** On a screen that loads data, what stays at its foot over the body: the bars and FABs pinned to the foot (`pinOf`), and
 *  buttons standing loose in the lower half of its last screenful (a screen's "Add" and "Orders" buttons); and the room
 *  its body leaves at its end, from the highest of them to the foot, and a gap. `groups` are the screen's own. */
export function footOf(frame: Frame, groups: readonly Group[], widths: Record<string, number>): Foot {
  const fr = frameRect(frame);
  const viewH = frameSizeOf(frame).h;
  const floats = new Set<string>();
  const above = new Map<string, number>();
  let reach = 0;
  for (const g of groups) {
    if (g.inFlow || g.hidden || g.items.length !== 1) continue;
    const it = g.items[0];
    const role = roleOf(it);
    const bb = groupBounds(g, widths);
    const pinned = (role === "bottom" || role === "floatingBottom" || role === "fab") && pinOf(g, frame, widths) === "foot";
    const button = !role && FLOATING_CONTROLS.has(it.component ?? "") && !g.repeat && !g.states && fr.b - bb.b < bb.t - fr.t && bb.t >= fr.b - viewH / 2 && bb.b <= fr.b + 1;
    if (!pinned && !button) continue;
    floats.add(g.id);
    above.set(g.id, Math.max(0, Math.round(fr.b - bb.b)));
    reach = Math.max(reach, fr.b - bb.t);
  }
  return { floats, above, room: floats.size ? Math.ceil(reach) + FOOT_GAP : 0 };
}
