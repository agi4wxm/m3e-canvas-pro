import { partBySlug, reader } from "../../../parts/registry";
import type { PartDef, PropValues } from "../../../parts/types";
import type { Node, Say } from "../../../parts/templates/kit";
import { settleSizes } from "../../../parts/atoms";
import type { Lang } from "../../i18n";
import { kitPropName } from "../../../rn/src/kit/coverage";

/* Parts as plain data for the React Native kit: every prop of a part with its value read the way the canvas reads it
 * (the default in the current language when the author set none), and a tree of atoms with its words in one language. */

/** every prop of a part, read as the canvas reads it */
export function propValues(def: PartDef, values: PropValues | undefined): Record<string, unknown> {
  const p = reader(def, values);
  const out: Record<string, unknown> = {};
  for (const d of def.props) {
    switch (d.kind) {
      case "number":
        out[d.key] = p.n(d.key);
        break;
      case "bool":
        out[d.key] = p.b(d.key);
        break;
      case "list":
        out[d.key] = p.list(d.key);
        break;
      case "table":
        out[d.key] = p.table(d.key);
        break;
      default:
        out[d.key] = p.s(d.key);
    }
  }
  return out;
}

const isSay = (v: unknown): v is Say => !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as Say).en === "string" && typeof (v as Say).zh === "string";

/** a value with every word said in one language */
function words(v: unknown, lang: Lang): unknown {
  if (isSay(v)) return v[lang] ?? v.en;
  if (Array.isArray(v)) return v.map((x) => words(x, lang));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, words(x, lang)]));
  return v;
}

/** A tree of atoms as the kit draws it: settled sizes (lib/kits.ts does the same when it adds one), words in one
 *  language, props under the kit's names, and only what is drawn (no names, notes or links). */
export type PlainNode = { slug: string; props: Record<string, unknown>; grow?: boolean; fill?: string; textColor?: string; corners?: Record<string, number>; look?: Record<string, unknown>; kids?: PlainNode[] };

/** the layout props that count only when they are set (parts/flow.ts): left out, `gap`, `padX` and `padY` say them */
export const SET_ONLY = new Set(["gapY", "padTop", "padRight", "padBottom", "padLeft"]);

/** The props that differ from what the part has with nothing set: what the kit fills in by itself is left out. A layout
 *  prop that counts only when set is kept whenever it is. */
export function ownProps(slug: string, props: Record<string, unknown>): Record<string, unknown> {
  const def = partBySlug(slug);
  if (!def) return props;
  const defaults = propValues(def, {});
  return Object.fromEntries(Object.entries(props).filter(([k, v]) => SET_ONLY.has(k) || JSON.stringify(v) !== JSON.stringify(defaults[k])));
}

export function plainTree(root: Node, lang: Lang): PlainNode {
  const walk = (n: Node): PlainNode => {
    const own = ownProps(n.slug, words(n.props, lang) as Record<string, unknown>);
    const out: PlainNode = { slug: n.slug, props: Object.fromEntries(Object.entries(own).map(([k, v]) => [kitPropName(n.slug, k), v])) };
    if (n.grow || n.fill === true) out.grow = true;
    if (typeof n.fill === "string") out.fill = n.fill;
    if (n.textColor) out.textColor = n.textColor;
    if (n.corners) out.corners = { ...n.corners };
    if (n.look) out.look = n.look as Record<string, unknown>;
    if (n.kids?.length) out.kids = n.kids.map(walk);
    return out;
  };
  return walk(settleSizes(root));
}
