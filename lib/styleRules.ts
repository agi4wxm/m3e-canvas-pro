import { partBySlug } from "../parts/registry";
import { isStrict, styleOf, uxOf, recipesOf, RECIPE_KEYS, type StyleContext } from "./styles";
import { fontFamilyOf, type Doc, type Group, type Item, type Theme } from "./tokens";
import { STRICT_LOOK_KEYS, strictLook } from "./look";

/* A style is a set of rules: its faces, its colors, its corners, how its controls are built and how its screens are laid
 * out. Held to them, a document says nothing of its own about those. This is the one place that says what a part may still
 * carry: whatever writes a document (a panel, a model, a file) comes through here, so nothing has to be trusted to behave. */

/** a part's own prop that a style decides for it */
export const styleOwnsProp = (slug: string | undefined, key: string): boolean => key === "shape" || key === "radius" || (slug === "scene" && key === "style");

/** A part as the rules allow it: its corners are the style's, and of its look only what places it keeps (how much of it
 *  shows, how it is turned and scaled, a blur, a blend) and a level of the style's own elevation. Its colors only ever
 *  name the style's roles. The same object when there is nothing to take away. */
export function conformItem(it: Item): Item {
  const def = partBySlug(it.component);
  const owned = def?.props.filter((d) => styleOwnsProp(it.component, d.key) && it.props?.[d.key] !== undefined) ?? [];
  const keepLook = strictLook(it.look);
  const lookChanged = !!it.look && (!keepLook || Object.keys(keepLook).length !== Object.keys(it.look).length);
  if (!owned.length && !it.corners && !lookChanged) return it;
  const { corners: _corners, look: _look, ...rest } = it;
  const props = owned.length ? Object.fromEntries(Object.entries(it.props ?? {}).filter(([k]) => !owned.some((d) => d.key === k))) : it.props;
  return { ...rest, ...(props ? { props } : {}), ...(keepLook ? { look: keepLook } : {}) };
}

/** the parts of a document as the rules of its theme allow them; the same array when none had to change */
export function conformGroups(groups: Group[], theme: Theme, styles?: StyleContext): Group[] {
  if (!isStrict(theme, styles)) return groups;
  let changed = false;
  const out = groups.map((g) => {
    const items = g.items.map(conformItem);
    if (items.every((it, i) => it === g.items[i])) return g;
    changed = true;
    return { ...g, items };
  });
  return changed ? out : groups;
}

/** a whole document as the rules of its theme allow it */
export function conformDoc<D extends Pick<Doc, "groups"> & Partial<Pick<Doc, "components">>>(doc: D, theme: Theme, styles?: StyleContext): D {
  if (!isStrict(theme, styles)) return doc;
  const groups = conformGroups(doc.groups, theme, styles);
  const components = doc.components?.map((c) => ({ ...c, groups: conformGroups(c.groups, theme, styles) }));
  return { ...doc, groups, ...(components ? { components } : {}) };
}

/** What a model is told when the document it writes is held to a style. It is told so it can compose well; what it does
 *  regardless is taken away when the document arrives. */
export function rulesForModel(theme: Theme, styles?: StyleContext): string {
  if (!isStrict(theme, styles)) return "";
  const pack = styleOf(theme.style, styles);
  const ux = uxOf(theme, styles);
  const recipes = recipesOf(theme, styles);
  const name = pack ? `the ${pack.name.en} style` : "Android's Material 3";
  return [
    `This document is held to ${name}, and you may not change it.`,
    pack ? `Write "theme": { "style": "${pack.key}" } and nothing else in theme, whatever the idea asks for.` : `Leave "style" out of theme.`,
    `Faces: ${fontFamilyOf(theme.font)}. Colors only by role name. Controls are built as: ${RECIPE_KEYS.filter((k) => recipes[k] !== "m3").map((k) => `${k} ${recipes[k]}`).join(", ") || "Material's own"}.`,
    `Never set corners, a button's shape, an image's radius or a scene's style: the style decides them and they are removed. Of \`look\`, only ${STRICT_LOOK_KEYS.map((k) => `\`${k}\``).join(", ")} stay, with a material fill tinted by a role; \`elevation\` (0–4) raises a surface in the style's own shadow, and every other look field is removed.`,
    `Layout: ${ux.margin}px side margins, ${ux.gap}px between sections, ${ux.tight}px between rows of a kind${ux.nav === "keep" ? "" : `, navigation ${ux.nav === "rail" ? "as a rail at the left" : ux.nav === "top" ? "as tabs on top" : "at the bottom"}`}. The screens are laid out by these rules when the document arrives, so put parts in the order they read, in sensible places.`,
    ...(pack ? [`Compose its screens this way: ${pack.layout.en}`] : []),
  ].join("\n");
}
