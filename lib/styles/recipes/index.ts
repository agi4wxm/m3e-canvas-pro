import { BUTTON_CSS, FAB_CSS, FEEDBACK_CSS } from "./buttons";
import { M3, RECIPES, RECIPE_KEYS, RECIPE_LABELS, VARIANT_LABELS, variantLabel, type RecipeKey, type Recipes } from "./catalog";
import { AVATAR_CSS, BADGE_CSS, CHECK_CSS, CHIP_CSS, SLIDER_CSS, TOGGLE_CSS } from "./controls";
import { DIALOGUE_CSS, DIALOG_CSS } from "./dialogs";
import { FIELD_CSS, INPUT_CSS, SEARCH_CSS } from "./fields";
import { METER_CSS, PROGRESS_CSS } from "./gauges";
import { DIVIDER_CSS, LIST_CSS, MENU_CSS, ROW_CSS, ROW_MARK } from "./lists";
import { ICON_CSS, SCREEN_TEXTURE, SCROLL_CSS, TEXT_CSS } from "./marks";
import { APPBAR_CSS, BAR_CSS, NAV_CSS } from "./navigation";
import { PICKER_CSS } from "./pickers";
import { BOX_CSS, CARD_CSS, SHEET_CSS, SURFACE_CSS, TOOLTIP_CSS } from "./surfaces";
import { SEGMENTED_CSS, TABS_CSS } from "./tabs";

export { M3, RECIPES, RECIPE_KEYS, RECIPE_LABELS, SCREEN_TEXTURE, VARIANT_LABELS, variantLabel, type RecipeKey, type Recipes };
export { HEADINGS } from "./shared";

/** each recipe's CSS, by kind and then by variant; the screen's texture is drawn behind the screen, not by a rule */
export const RECIPE_CSS: { [K in Exclude<RecipeKey, "screen">]: Record<Recipes[K], string> } = {
  button: BUTTON_CSS,
  fab: FAB_CSS,
  surface: SURFACE_CSS,
  card: CARD_CSS,
  sheet: SHEET_CSS,
  tooltip: TOOLTIP_CSS,
  tabs: TABS_CSS,
  segmented: SEGMENTED_CSS,
  toggle: TOGGLE_CSS,
  slider: SLIDER_CSS,
  nav: NAV_CSS,
  field: FIELD_CSS,
  input: INPUT_CSS,
  search: SEARCH_CSS,
  bar: BAR_CSS,
  appbar: APPBAR_CSS,
  meter: METER_CSS,
  progress: PROGRESS_CSS,
  list: LIST_CSS,
  row: ROW_CSS,
  divider: DIVIDER_CSS,
  menu: MENU_CSS,
  dialog: DIALOG_CSS,
  avatar: AVATAR_CSS,
  chip: CHIP_CSS,
  badge: BADGE_CSS,
  check: CHECK_CSS,
  icon: ICON_CSS,
  dialogue: DIALOGUE_CSS,
  scroll: SCROLL_CSS,
  feedback: FEEDBACK_CSS,
  text: TEXT_CSS,
  picker: PICKER_CSS,
};

/** The order the recipes are written in. What builds on another comes after it: a card after the panels, the bare
 *  inputs after the text fields, a row after its list, the composition of a bar after its paint. */
const ORDER: Exclude<RecipeKey, "screen">[] = ["button", "fab", "surface", "card", "sheet", "tooltip", "tabs", "segmented", "toggle", "slider", "nav", "field", "input", "search", "bar", "appbar", "meter", "progress", "list", "row", "divider", "menu", "dialog", "picker", "avatar", "chip", "badge", "check", "icon", "dialogue", "scroll", "feedback"];

/** every recipe a theme builds its controls with, as rules; headings come apart, after the faces are named */
export function recipeRules(r: Recipes): string[] {
  const rules = ORDER.map((k) => (RECIPE_CSS[k] as Record<string, string>)[r[k]]);
  /* a row's end mark is Material's accent only in Material's list */
  if (r.list !== "m3") rules.splice(ORDER.indexOf("list"), 0, ROW_MARK);
  return rules;
}

/** what a style says of the box an author builds with, beyond what its recipes reach */
export { BOX_CSS };

export const headingRules = (r: Recipes) => TEXT_CSS[r.text];
