import { partBySlug } from "../parts/registry";
import { resizeOf } from "../parts/resize";
import { expandRepeats, measuresFor } from "./collections";
import { arrangeFlows, outOfPane } from "./flow";
import { expandInstances } from "./instances";
import type { Doc, Group, Item } from "./tokens";
import { layoutOf } from "./tokens";

/* The one expansion path: instances, then repeats, then one layout over all of it. What comes out is a
 * document of plain groups that the preview, the prompt and the printed code can read like any other. */

type Widths = Record<string, number>;
type Source = Pick<Doc, "groups" | "components" | "collections">;

const needsExpanding = (groups: Group[]) => groups.some((g) => g.instanceOf || g.repeat);

/** laid out until it stops changing: a hugging layout inside another can take a second pass */
function settled(groups: Group[], widths: Widths): Group[] {
  let at = groups;
  for (let i = 0; i < 4; i++) {
    const next = arrangeFlows(at, widths);
    if (next === at) return at;
    at = next;
  }
  return at;
}

function laidOut(doc: Source, widths: Widths, keepEmpty: boolean): { groups: Group[]; widths: Widths } {
  const groups = expandRepeats(expandInstances(doc, widths, { keepEmpty }), { collections: doc.collections, widths, keepEmpty });
  const measures = measuresFor(groups, widths);
  return { groups: settled(groups, measures), widths: measures };
}

/** a document with its instances and repeats drawn out as plain parts; the same document when it has none */
export function expandDoc(doc: Doc, widths: Widths): Doc {
  if (!needsExpanding(doc.groups)) return doc;
  const { components: _gone, ...rest } = doc;
  return { ...rest, groups: laidOut(doc, widths, false).groups };
}

/** the measures of a part that a layout writes: the same keys `arrangeFlows` can change */
function measureKeys(it: Item): string[] {
  const ax = resizeOf(partBySlug(it.component), it.props);
  return [ax?.width, ax?.height].flatMap((a) => (a?.kind === "number" ? [a.key] : []));
}

/** What the layout of the expansion decided, put back on the document's own groups: where they stand
 *  and how big they are. A row's words stay out of it: only the measures are taken from an item, since
 *  row one is the template with its tokens filled in. The same array comes back when nothing changed. */
function writtenBack(real: Group[], laid: Group[]): Group[] {
  const byId = new Map(real.map((g) => [g.id, g]));
  const next = laid.flatMap((l): Group[] => {
    const o = byId.get(l.id);
    if (!o) return [];
    let items = o.items;
    o.items.forEach((it, i) => {
      const from = l.items[i];
      if (!from) return;
      const props = measureKeys(it).reduce((acc, key) => {
        const v = from.props?.[key];
        return v === undefined || acc?.[key] === v ? acc : { ...acc, [key]: v };
      }, it.props);
      if (props !== it.props) items = items.map((x, j) => (j === i ? { ...x, props } : x));
    });
    const same = l.x === o.x && l.y === o.y && l.inFlow === o.inFlow && l.pane === o.pane && items === o.items;
    if (same) return [o];
    const { inFlow: _f, pane: _p, ...rest } = o;
    return [{ ...rest, x: l.x, y: l.y, items, ...(l.inFlow !== undefined ? { inFlow: l.inFlow } : {}), ...(l.pane !== undefined ? { pane: l.pane } : {}) }];
  });
  /* a group the expansion did not carry is left as it was, so nothing is ever lost here */
  const seen = new Set(next.map((g) => g.id));
  for (const g of real) if (!seen.has(g.id)) next.push(g);
  return next.length === real.length && next.every((g, i) => g === real[i]) ? real : next;
}

/** one part the canvas draws for an instance or a row, relative to the group it belongs to */
export type DrawnPart = { item: Item; dx: number; dy: number; /** a copy of a row, or hidden at the start */ dim: boolean };

export type CanvasView = {
  /** the document's groups as the layout has them */
  groups: Group[];
  /** what is drawn on top of each group of the document, by group id; none of it can be selected */
  drawn: Map<string, DrawnPart[]>;
  /** a part of the document drawn with other words: row one of a repeat */
  shown: Map<string, Item>;
  /** the parts of the expansion the measuring layer has to measure */
  extra: { item: Item; owner: string }[];
};

/** What the canvas needs in one go. The document's own groups stay what is selected and dragged;
 *  everything else is drawn on them and rides along with them. */
export function canvasView(doc: Source, widths: Widths): CanvasView {
  if (!needsExpanding(doc.groups)) return { groups: arrangeFlows(doc.groups, widths), drawn: new Map(), shown: new Map(), extra: [] };
  const { groups: laid, widths: measures } = laidOut(doc, widths, true);
  const real = new Map(doc.groups.map((g) => [g.id, g]));
  const at = new Map(laid.map((g) => [g.id, g]));
  const drawn = new Map<string, DrawnPart[]>();
  const shown = new Map<string, Item>();
  const extra: CanvasView["extra"] = [];
  const offTab = outOfPane(laid, measures);
  for (const g of laid) {
    const source = real.get(g.id);
    if (source) {
      g.items.forEach((it, i) => {
        if (it !== source.items[i] && it.row) shown.set(it.id, it);
      });
      continue;
    }
    const ownerId = g.id.split(/[/#]/)[0];
    const owner = at.get(ownerId);
    if (!owner) continue;
    for (const it of g.items) extra.push({ item: it, owner: ownerId });
    if (offTab.has(g.id)) continue;
    const list = drawn.get(ownerId) ?? [];
    for (const pl of layoutOf(g, measures)) list.push({ item: pl.item, dx: pl.x - owner.x, dy: pl.y - owner.y, dim: g.id.includes("#") || !!g.hidden });
    drawn.set(ownerId, list);
  }
  return { groups: writtenBack(doc.groups, laid), drawn, shown, extra };
}
