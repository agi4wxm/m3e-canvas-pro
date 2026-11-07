/* Bound words in the preview, laid out by what they say. The canvas measures each text part with the words it was drawn
 * with (a field's name, a sample), and the preview lays its auto layouts out from those measures (lib/flow.ts
 * `arrangeFlows`). A text bound to data says something else: a product's description runs to two lines where the sample
 * had one. Drawn at the canvas's height it would be cut to a line (a row of a list) or spill over the part below it (a
 * product's details), where the exported apps lay it out by its words. So the preview reads how tall each bound text in
 * an auto layout is, its words wrapped in its width and cut at its most lines, and lays the screen out again with that
 * height in place of the canvas's: only in the preview, never in what the canvas measured. */

import { hasTemplate } from "@/lib/bindings/expr";
import { childLayoutOf, flowOf } from "@/lib/flow";
import type { Group } from "@/lib/tokens";

/** The text parts of a screen whose height the preview takes from their words: bound to data (drawn for an element of a
 *  list, bound to an expression, or with `{{expressions}}` in them), in an auto layout that does not set their height. */
export function boundTextIds(groups: readonly Group[]): Set<string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Set<string>();
  for (const g of groups) {
    const it = g.items.length === 1 ? g.items[0] : undefined;
    if (!it || it.component !== "text" || it.props?.fit === "auto" || !g.inFlow) continue;
    const parent = byId.get(g.inFlow);
    const flow = parent ? flowOf(parent) : null;
    if (!flow) continue;
    /* a height the author set, or the layout's to give (filling a column), stays */
    if (childLayoutOf(it).size.h !== undefined || (flow.dir === "column" && it.flowFill)) continue;
    const words = it.props?.text;
    if (it.scope !== undefined || typeof it.bind?.text === "string" || (typeof words === "string" && hasTemplate(words))) out.add(it.id);
  }
  return out;
}

/** How tall a text's words are, in the design's points: its lines as the browser wrapped them in its width (whatever height
 *  its box has now), no more than its most lines, and its padding. Bound to nothing (an empty field), it is only its
 *  padding, as in the exported apps. Null when its lines cannot be read. */
export function wordsHeight(el: HTMLElement): number | null {
  const cs = getComputedStyle(el);
  const padding = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
  if (!el.textContent) return Math.ceil(padding);
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) return null;
  /* the preview may be drawn scaled: the box's own height against what it takes on the page */
  const shown = el.getBoundingClientRect().height;
  const scale = el.offsetHeight > 0 && shown > 0 ? shown / el.offsetHeight : 1;
  const lineHeight = Number.parseFloat(cs.lineHeight) || rects[0].height / scale;
  /* a line is a run of fragments at the same height on the page */
  let lines = 0;
  let last = -Infinity;
  for (const r of [...rects].sort((a, b) => a.top - b.top)) {
    if (r.top > last + (lineHeight * scale) / 2) {
      lines++;
      last = r.top;
    }
  }
  const most = Number.parseInt(cs.webkitLineClamp, 10);
  const shownLines = Number.isFinite(most) && most > 0 ? Math.min(lines, most) : lines;
  return Math.ceil(shownLines * lineHeight + padding);
}
