import type { Lang } from "../../lib/i18n";
import { splitTaps } from "../../lib/kits";
import { defaultTextOf, listTextOf, nameOf } from "../labels";
import { partBySlug, reader } from "../registry";
import { roleOf } from "../role";
import type { P, PartDef, PropValues } from "../types";
import { inLang, type Node, type Say } from "./kit";

/* A part a template used to hold, as the atoms it splits into (parts/defs/splits.ts, parts/defs/retired.ts): the
 * templates build with atoms, not with retired parts, and look as they did. The tree is the split of the part in each
 * of the four languages put together, its words a Say wherever they differ; the part's taps go to the atoms that show
 * them, its name and its paint to the outermost box, which keeps to the screen's edge where the part did. */

const LANGS: Lang[] = ["en", "zh", "ja", "ko"];

/** the part's props in one language, every one it has, so nothing is left to the language the editor happens to be in */
function valuesIn(def: PartDef, props: Record<string, unknown>, lang: Lang): PropValues {
  const given = inLang(props, lang);
  return Object.fromEntries(
    def.props.map((d) => {
      if (given[d.key] !== undefined) return [d.key, given[d.key]];
      if (d.kind === "text") return [d.key, defaultTextOf(d, lang)];
      if (d.kind === "list") return [d.key, d.default.map((x) => ({ ...x, label: listTextOf(x.label, lang) }))];
      if (d.kind === "table") return [d.key, { columns: d.default.columns.map((c) => listTextOf(c, lang)), rows: d.default.rows.map((r) => r.map((c) => listTextOf(c, lang))) }];
      return [d.key, d.default];
    }),
  );
}

/** a reader of the part's props in one language, what it says by itself too */
const readerIn = (def: PartDef, props: Record<string, unknown>, lang: Lang): P => ({ ...reader(def, valuesIn(def, props, lang)), say: (words) => listTextOf(words, lang) });

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** one value in four languages: as it is where they agree, a Say where words differ */
function together(values: unknown[], where: string): unknown {
  const [first] = values;
  if (values.every((v) => same(v, first))) return first;
  if (values.every((v) => typeof v === "string")) return Object.fromEntries(LANGS.map((l, i) => [l, values[i]])) as Say;
  if (values.every(Array.isArray) && values.every((v) => (v as unknown[]).length === (first as unknown[]).length)) return (first as unknown[]).map((_, i) => together(values.map((v) => (v as unknown[])[i]), `${where}[${i}]`));
  if (values.every(isRec) && values.every((v) => same(Object.keys(v as object), Object.keys(first as object)))) return Object.fromEntries(Object.keys(first as object).map((k) => [k, together(values.map((v) => (v as Record<string, unknown>)[k]), `${where}.${k}`)]));
  throw new Error(`a template's atoms differ by language at ${where}`);
}

/** the trees of the four languages as one, which they must be but for their words */
function merged(trees: Node[], where: string): Node {
  const [first] = trees;
  const kids = first.kids;
  if (trees.some((t) => t.slug !== first.slug || (t.kids?.length ?? -1) !== (kids?.length ?? -1))) throw new Error(`a template's atoms differ by language at ${where}`);
  const { props: _props, kids: _kids, ...own } = first;
  return {
    ...(together(trees.map(({ props: _p, kids: _k, ...rest }) => rest), `${where} itself`) as typeof own),
    props: together(trees.map((t) => t.props), `${where}.props`) as Record<string, unknown>,
    ...(kids ? { kids: kids.map((_, i) => merged(trees.map((t) => t.kids![i]), `${where}/${i}`)) } : {}),
  };
}

/** the pin of the box a part that stands on an edge becomes, as a split gives it */
const PIN: Record<string, string> = { top: "top", bottom: "bottom", floatingBottom: "floatingBottom" };

type Link = NonNullable<Node["action"]>;

/** A part as the atoms it splits into, for a template: its props as the template gives them (words in every language),
 *  its taps by its slots, and what the template asks of it otherwise (a name, paint, a tap on the whole). A width the
 *  template leaves to the screen stays the screen's; a bar standing on its own (not `inLayout`) keeps to its edge. */
export function atomsOf(slug: string, props: Record<string, unknown> = {}, extra: Omit<Node, "slug" | "props" | "kids"> & { actions?: Record<string, Link | undefined> } = {}, o: { inLayout?: boolean } = {}): Node {
  const def = partBySlug(slug);
  if (!def?.atoms) throw new Error(`${slug} does not split into atoms`);
  const readers = LANGS.map((l) => readerIn(def, props, l));
  const trees = readers.map((p) => def.atoms!(p) as Node);
  const tree = merged(trees, slug);
  /* the taps of its slots go where the split puts them; the English tree stands for all four, which are alike */
  const { actions: slots, ...rest } = extra;
  const wired = Object.fromEntries(Object.entries(slots ?? {}).filter((e): e is [string, Link] => !!e[1]));
  const placed = splitTaps(def, readers[0], trees[0], { actions: wired }).actions;
  const withTaps = (n: Node, en: Node): Node => {
    const tap = placed.get(en) as Link | undefined;
    return { ...n, ...(tap ? { action: { to: tap.to, transition: tap.transition } } : {}), ...(n.kids ? { kids: n.kids.map((k, i) => withTaps(k, en.kids![i])) } : {}) };
  };
  const tapped = withTaps(tree, trees[0]);
  const role = o.inLayout ? undefined : roleOf({ component: slug, props: valuesIn(def, props, "en") });
  const { width: _width, ...unsized } = tapped.props;
  const name = Object.fromEntries(LANGS.map((l) => [l, nameOf(def, l)])) as Say;
  return {
    ...tapped,
    props: { ...(props.width === undefined ? unsized : tapped.props), ...(PIN[role ?? ""] ? { pin: PIN[role ?? ""] } : {}) },
    name,
    ...rest,
  };
}
