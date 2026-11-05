import type { Recipes } from "./catalog";
import { mix, role, type RecipeCss } from "./shared";

/* Where words are typed: Material's text field, the bare inputs other components are built from, and search. */

const BARE = `:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea],[data-slot=native-select],[data-slot=input-group],[data-surface=field])`;

/** the label stays inside the box: with no notch in the outline there is nothing for it to sit in */
const inside = (box: string, focus: string, radius = "var(--st-control-r)") => `[data-slot=text-field-box]{border-radius:${radius};background-color:transparent;${box}}
[data-slot=text-field]:focus-within [data-slot=text-field-box]{${focus}}
[data-slot=text-field-outline]{display:none}
[data-slot=text-field] :is(input,textarea){padding-top:22px;padding-bottom:6px}
[data-slot=text-field][data-variant=outlined]:focus-within label,[data-slot=text-field][data-variant=outlined]:has(:is(input,textarea):not(:placeholder-shown)) label{translate:0 7px}
${BARE}{border-radius:${radius};${box}}
${BARE}:focus-within{${focus}}`;

export const FIELD_CSS: RecipeCss<Recipes["field"]> = {
  m3: "",
  soft: inside(`background-color:${role("surface-container-highest")};border:0`, `box-shadow:0 0 0 2px ${role("primary")}`),
  boxed: inside(`background-color:${role("surface-container-low")};border:1px solid ${role("outline-variant")};border-bottom-color:${role("outline")}`, `border-bottom:2px solid ${role("primary")}`),
  hard: inside(`background-color:${role("surface-container-low")};border:var(--st-edge) solid var(--st-line)`, `box-shadow:3px 3px 0 var(--st-line)`),
  glow: inside(`background-color:${mix("primary", 6)};border:1px solid ${mix("primary", 55)}`, `border-color:${role("primary")};box-shadow:0 0 12px ${mix("primary", 50)}`),
  /* Ant Design: a line that takes the color when focused, with a soft ring around it */
  ring: inside(`background-color:${role("surface-container-low")};border:1px solid ${role("outline-variant")}`, `border-color:${role("primary")};box-shadow:0 0 0 2px ${mix("primary", 20)}`),
  /* ChatGPT's composer, a marketplace's search box */
  pill: inside(`background-color:${role("surface-container-high")};border:1px solid ${role("outline-variant")}`, `border-color:${role("outline")}`, "26px"),
  /* Elden Ring: nothing but a thin line beneath */
  line: inside(`border:0;border-bottom:1px solid var(--st-rim)`, `border-bottom-color:${role("primary")}`, "0"),
};

/** The bare inputs on their own, where they should differ from the style's text fields: the field recipe dresses them
 *  first, and this comes after it. */
export const INPUT_CSS: RecipeCss<Recipes["input"]> = {
  m3: "",
  boxed: `${BARE}{border:1px solid ${role("outline-variant")};border-radius:var(--md-sys-shape-corner-extra-small);background-color:${role("surface-container-low")};box-shadow:none}
${BARE}:focus-within{border-color:${role("primary")};box-shadow:0 0 0 1px ${role("primary")}}`,
  filled: `${BARE}{border:0;border-radius:var(--st-control-r);background-color:${role("surface-container-highest")};box-shadow:none}
${BARE}:focus-within{box-shadow:0 0 0 2px ${mix("primary", 60)}}`,
  underline: `${BARE}{border:0;border-bottom:1px solid ${role("outline")};border-radius:0;background-color:transparent;box-shadow:none}
${BARE}:focus-within{border-bottom:2px solid ${role("primary")}}`,
  /* no chrome at all: the words and the caret, for an input set inside a box that is already the field */
  plain: `${BARE}{border:0;border-radius:0;background-color:transparent;box-shadow:none;padding-inline:0}`,
  pill: `${BARE}{border:1px solid ${role("outline-variant")};border-radius:999px;background-color:${role("surface-container-low")};box-shadow:none}
${BARE}:focus-within{border-color:${role("outline")}}`,
};

const BOX = `:is([data-slot=search-view],[data-slot=search-bar],[data-slot=sidebar-input],[data-slot=command-input-wrapper])`;
const HEAD = `[data-slot=search-header]`;
/** how search is drawn: Material's floating bar, or the product's own field */
export const SEARCH_CSS: RecipeCss<Recipes["search"]> = {
  m3: "",
  /* WeChat, the stores: a grey rounded box, no shadow, the magnifier and the words grey */
  filled: `${BOX}{background-color:${role("surface-container-highest")};box-shadow:none;border:0;border-radius:var(--md-sys-shape-corner-small)}
${HEAD},[data-slot=search-bar]{height:36px}
${BOX} :is([data-slot=icon],input::placeholder){color:${role("on-surface-variant")}}
${BOX} input{font-size:15px}`,
  /* iOS: the same grey box with a Cancel at its right, in the accent color */
  cancel: `${BOX}{background-color:${mix("on-surface", 7)};box-shadow:none;border:0;border-radius:10px}
${HEAD},[data-slot=search-bar]{height:36px}
${BOX} :is([data-slot=icon],input::placeholder){color:${role("on-surface-variant")}}
${BOX} input{font-size:17px}
[data-slot=search-cancel]{display:inline-flex;align-items:center;height:36px;font-size:17px;color:${role("primary")};white-space:nowrap}`,
  /* the web apps: an outlined capsule */
  pill: `${BOX}{background-color:${role("surface-container-low")};box-shadow:none;border:1px solid ${role("outline-variant")};border-radius:999px}
${HEAD},[data-slot=search-bar]{height:44px}`,
  /* desktop software: a short box with a hairline */
  boxed: `${BOX}{background-color:${role("surface-container-low")};box-shadow:none;border:1px solid ${role("outline-variant")};border-radius:var(--md-sys-shape-corner-extra-small)}
${HEAD},[data-slot=search-bar]{height:32px}
${BOX} input{font-size:13px}`,
  /* the games and the dark fantasies: a line under the words and nothing else */
  underline: `${BOX}{background-color:transparent;box-shadow:none;border:0;border-bottom:1px solid var(--st-rim);border-radius:0}`,
  glow: `${BOX}{background-color:${mix("primary", 6)};box-shadow:0 0 12px ${mix("primary", 30)};border:1px solid ${mix("primary", 60)};border-radius:0}`,
};
