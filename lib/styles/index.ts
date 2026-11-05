/* A style is what a whole document looks like, in three layers: its colors and type, the shapes of its components, and
 * how a screen is laid out (margins, gaps, where the navigation stands, how lists run). It is plain data, written out as
 * one stylesheet, so the canvas, the preview and an exported app wear the same one and no part has to know about it.
 *
 *   types.ts       what a style is made of
 *   packs/*.ts     one file per style: its colors, type, recipes, layout, and CSS of its own
 *   recipes/*.ts   how each kind of control can be built, as CSS on named parts, shared by every style
 *   theme.ts       reading a style off a theme
 *   sheet.ts       the stylesheet a theme comes to
 *
 * Every style here is modeled on products people actually use, chosen from download, revenue and concurrent-player
 * rankings of 2025 and 2026. They take a product's general visual language and none of its assets. `basis` says how
 * far the numbers can be trusted:
 *   official  published by the maker: design tokens, a theme file, brand guidelines
 *   sampled   read off the pixels of real screenshots of the product
 *   observed  described from looking at real screenshots, without exact values
 *   memory    no source could be reached; from general knowledge, to be checked */

export { DEFAULT_UX, styleTextOf, type StyleGroup, type StylePack, type StyleRoles, type StyleText, type StyleToken, type StyleUX } from "./types";
export { RECIPES, RECIPE_KEYS, RECIPE_LABELS, VARIANT_LABELS, variantLabel, type RecipeKey, type Recipes } from "./recipes";
export { STYLE_GROUPS, STYLE_PACKS, artOf, isStrict, normalizeRecipes, normalizeUx, recipesOf, styleCatalog, styleOf, stylePalette, stylePatch, styleSeed, uxOf } from "./theme";
export { APP_SCOPE, CANVAS_SCOPE, hasBackdrop, screenBackground, styleCss, type StyleSelectors } from "./sheet";
