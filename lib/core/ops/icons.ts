/* The document's own icons (lib/docIcons.ts): a drawing kept by id and named `svg:<id>` wherever a part takes an icon
 * name. Kept, replaced or taken away here; generate_svg keeps what it drew through `set_icon`. */

import { cleanDocIcon, DOC_ICON_ID, docIconIdFor, docIconName, MAX_DOC_ICONS } from "../../docIcons";
import type { Doc, Group } from "../../tokens";
import { op, OpError, S } from "../op";
import { withDoc } from "../state";

/** the parts that name an icon of the document's own, on the canvas and in the definitions */
export function docIconUses(doc: Pick<Doc, "groups" | "components">, id: string): string[] {
  const name = docIconName(id);
  const names = (v: unknown): boolean => (typeof v === "string" ? v === name : Array.isArray(v) ? v.some(names) : !!v && typeof v === "object" && Object.values(v).some(names));
  const ids = (groups: Group[]) => groups.flatMap((g) => g.items.filter((it) => names(it.props) || it.icon === name || names(g.overrides)).map((it) => it.id));
  return [...ids(doc.groups), ...(doc.components ?? []).flatMap((c) => ids(c.groups))];
}

export const setIcon = op<{ id?: string; svg: string }, { id: string; icon: string; replaced: boolean }>({
  name: "set_icon",
  summary:
    "Keeps an SVG drawing as one of the document's own icons, named svg:<id>: it then goes wherever a part takes an icon name (an icon atom's name, a button's or a list row's icon, a nav bar's tabs), in every style. The same id again replaces its drawing everywhere it is used. The markup is cleaned like the svg atom's (no text, scripts, filters or styles): paint with currentColor to follow the part's color, viewBox 0 0 24 24 for an icon.",
  args: S.obj({ id: S.str("lowercase words joined by dashes (leaf, coffee-cup); left out, a free one is made"), svg: S.str("the SVG markup") }, ["svg"]),
  label: () => "Icon",
  run(s, a) {
    const icons = s.doc.icons ?? {};
    const id = a.id ?? docIconIdFor("icon", icons);
    if (!DOC_ICON_ID.test(id)) throw new OpError("invalid_value", `${JSON.stringify(id)} cannot be an icon's id: lowercase letters and digits in words joined by single dashes, up to 40 characters (leaf, coffee-cup).`, "id");
    const markup = cleanDocIcon(a.svg);
    if (!markup) throw new OpError("invalid_value", "Nothing drawable is left of that SVG once what an icon may not hold is taken out (or it is too large): paths, shapes and gradients in an <svg> with a viewBox.", "svg");
    if (icons[id] === markup) throw new OpError("nothing_to_do", `svg:${id} is that drawing already.`);
    const replaced = id in icons;
    if (!replaced && Object.keys(icons).length >= MAX_DOC_ICONS) throw new OpError("refused", `A document keeps at most ${MAX_DOC_ICONS} icons of its own; remove_icon takes one away.`);
    return { state: withDoc(s, { icons: { ...icons, [id]: markup } }), result: { id, icon: docIconName(id), replaced } };
  },
});

export const removeIcon = op<{ id: string }, { removed: string; stillNamedBy: string[] }>({
  name: "remove_icon",
  summary: "Takes one of the document's own icons away. Parts that still name it (stillNamedBy) draw no icon until they are given another.",
  args: S.obj({ id: S.str("its id, without svg:") }, ["id"]),
  label: () => "Remove icon",
  run(s, a) {
    const id = a.id.startsWith("svg:") ? a.id.slice(4) : a.id;
    const icons = s.doc.icons ?? {};
    if (!(id in icons)) throw new OpError("not_found", `The document has no icon svg:${id}.${Object.keys(icons).length ? ` Its icons are: ${Object.keys(icons).map(docIconName).join(", ")}.` : " It has none."}`, id);
    const { [id]: _gone, ...rest } = icons;
    const state = withDoc(s, { icons: Object.keys(rest).length ? rest : undefined });
    return { state, result: { removed: docIconName(id), stillNamedBy: docIconUses(s.doc, id) } };
  },
});
