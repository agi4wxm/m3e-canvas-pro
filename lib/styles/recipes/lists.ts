import type { Recipes } from "./catalog";
import { MENUS, MENU_ITEMS, MENU_SEPARATORS, ROWS, anyPart, mix, role, type RecipeCss } from "./shared";

/* Lists: how rows are grouped (the list recipe), how one row is composed (the row recipe), the lines between things,
 * and the menus that drop from a button. */

const ROW = `[data-slot=item]`;
const GROUPS = `[data-slot=item-group]`;
/** rows closed up, each with a line above it, from where its words start or from the edge */
const closedRows = (lineFrom: string) => `${GROUPS}{gap:0}
${ROW}{border-radius:0}
${ROW}+${ROW}::before{content:"";position:absolute;top:0;left:${lineFrom};right:0;height:1px;background-color:${role("outline-variant")}}`;
/** the mark at a row's end, a chevron, says there is more: only Material draws it in the accent color */
export const ROW_MARK = `[data-slot=item-actions] [data-button]{color:${role("on-surface-variant")}}`;
export const LIST_CSS: RecipeCss<Recipes["list"]> = {
  m3: "",
  /* iOS: rows closed up into a rounded white group, the lines starting where the words do */
  inset: `${closedRows("52px")}
${GROUPS}{background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-medium);overflow:hidden}
${ROW}{min-height:44px;padding-block:6px;padding-inline:16px}
${ROW}[data-flush]:not(${GROUPS} *){background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-medium)}`,
  /* WeChat: white rows from edge to edge on the grey ground */
  flush: `${closedRows("16px")}
${GROUPS}{background-color:${role("surface-container-low")}}
${ROW}{min-height:56px;padding-inline:16px;background-color:${role("surface-container-low")}}`,
  /* Spotify, Instagram: no lines at all */
  plain: `${GROUPS}{gap:0}
${ROW}{border-radius:0}`,
  /* Fluent, VS Code, Ant Design: short rows with a line under each */
  hairline: `${closedRows("0px")}
${ROW}{min-height:40px;padding-block:4px;padding-inline:8px}`,
  /* the games: each row its own plate */
  tile: `${GROUPS}{gap:6px}
${ROW}{padding-inline:12px;background-color:${role("surface-container")};border:1px solid var(--st-rim);border-radius:var(--st-control-r)}`,
};

const IN_ROWS = (part: string) => `:is(${ROWS}) ${anyPart(part)}`;
const CHEVRONS = anyPart("chevron");
/** How one row is composed: whether it ends in a chevron, where its value stands, how tall it is. The chevron is a
 *  part every row carries and Material hides. */
export const ROW_CSS: RecipeCss<Recipes["row"]> = {
  m3: "",
  /* iOS: a grey chevron at the end of every row that leads somewhere, its value grey just before it */
  chevron: `${CHEVRONS}{display:inline-flex;align-items:center;color:${mix("on-surface-variant", 55)}}
${CHEVRONS} [data-slot=icon]{font-size:20px;width:20px;height:20px}
${IN_ROWS("value")}{color:${role("on-surface-variant")};font-size:var(--text-body-large)}`,
  /* WeChat: a smaller, lighter chevron, the value grey */
  arrow: `${CHEVRONS}{display:inline-flex;align-items:center;color:${mix("on-surface-variant", 40)}}
${CHEVRONS} [data-slot=icon]{font-size:16px;width:16px;height:16px}
${IN_ROWS("value")}{color:${role("on-surface-variant")}}`,
  /* desktop software: short rows, small icons, body words */
  dense: `:is(${ROWS}){min-height:32px;padding-block:4px;gap:8px}
:is(${ROWS}) [data-slot=item-media][data-variant=icon] [data-slot=icon]{font-size:18px;width:18px;height:18px}
:is(${ROWS}) :is([data-slot=item-title],${anyPart("title")}){font-size:var(--text-body-medium);line-height:var(--text-body-medium--line-height)}
:is(${ROWS}) :is([data-slot=item-description],${anyPart("subtitle")}){font-size:var(--text-body-small);line-height:var(--text-body-small--line-height)}`,
  /* Wild Rift, Elden Ring: a small diamond of the rim before each row's words */
  bullet: `:is(${ROWS}) [data-slot=item-title]::before{content:"";display:inline-block;flex:none;width:6px;height:6px;margin-right:8px;rotate:45deg;background-color:var(--st-rim)}`,
};

const DIVIDERS = `:is([data-slot=separator],[data-slot=item-separator],[data-slot=dialog-divider],[data-slot=field-separator],[data-slot=sidebar-separator],${anyPart("divider")})`;
const ACROSS = `${DIVIDERS}:not([data-orientation=vertical])`;
/** the lines that part one thing from the next */
export const DIVIDER_CSS: RecipeCss<Recipes["divider"]> = {
  m3: "",
  /* iOS: barely there */
  hairline: `${DIVIDERS}{background-color:${mix("on-surface", 12)}}
${ACROSS}{height:.5px}`,
  /* the games: a line of the rim that fades at both ends */
  fade: `${DIVIDERS}{background-color:transparent;background-image:linear-gradient(90deg,transparent,var(--st-rim),transparent)}`,
  /* Wild Rift, Elden Ring: the fading line with a small diamond at its middle */
  ornament: `${DIVIDERS}{background-color:transparent;background-image:linear-gradient(90deg,transparent,var(--st-rim) 30%,var(--st-rim) 70%,transparent);position:relative;overflow:visible}
${ACROSS}::after{content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;translate:-50% -50%;rotate:45deg;background-color:var(--st-rim);box-shadow:0 0 0 2px ${role("surface")}}`,
  dashed: `${ACROSS}{height:0;background:none;border-top:1px dashed ${role("outline")}}`,
  /* pixel games: a line as thick as the style's edge */
  bold: `${DIVIDERS}{background-color:var(--st-line)}
${ACROSS}{height:var(--st-edge)}`,
};

const MENU = `:is(${MENUS})`;
const ITEM = `:is(${MENU_ITEMS})`;
/** the menus that drop from a button, a field or a bar */
export const MENU_CSS: RecipeCss<Recipes["menu"]> = {
  m3: "",
  /* iOS: a frosted rounded panel, full-width rows parted by hairlines, the icon at the right */
  ios: `${MENU}{border-radius:13px;padding:0;background-color:${mix("surface-container-low", 82)};-webkit-backdrop-filter:blur(24px) saturate(1.8);backdrop-filter:blur(24px) saturate(1.8);box-shadow:0 10px 38px rgb(0 0 0/.2);border:0}
${ITEM}{border-radius:0;min-height:44px;padding-inline:16px;font-size:17px;border-bottom:.5px solid ${mix("on-surface", 12)}}
${ITEM} [data-slot=icon]{order:2;margin-left:auto}
${ITEM}:is([data-selected],[data-checked]){background-color:transparent;color:${role("on-surface")}}
:is(${MENU_SEPARATORS}){height:8px;margin:0;background-color:${mix("on-surface", 6)}}`,
  /* Fluent, VS Code, Ant Design: a small panel with a hairline, short rows, the shortcut at the right */
  compact: `${MENU}{border-radius:var(--md-sys-shape-corner-small);padding:4px;border:1px solid ${role("outline-variant")};box-shadow:0 8px 16px rgb(0 0 0/.14)}
${ITEM}{min-height:30px;padding:4px 8px;border-radius:var(--md-sys-shape-corner-extra-small);font-size:var(--text-body-medium);gap:8px}
${ITEM} [data-slot=icon]{font-size:16px;width:16px;height:16px}
${ITEM}:is([data-selected],[data-checked]){background-color:${mix("primary", 10)};color:${role("on-surface")};font-weight:600}
:is(${MENU_SEPARATORS}){height:1px;margin:4px -4px;background-color:${role("outline-variant")}}`,
  /* Elden Ring, Black Myth: no panel to speak of, words on the dark, the hovered one lit */
  plain: `${MENU}{border-radius:0;border:0;box-shadow:none;background-color:${mix("surface", 92)}}
${ITEM}{border-radius:0}
${ITEM}:focus{background-image:linear-gradient(90deg,${mix("primary", 36)},transparent);background-color:transparent}`,
  /* the casual games: the panel with the style's rim, the rows as plates */
  rim: `${MENU}{border:2px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 rgb(0 0 0/.2);border-radius:var(--st-control-r)}
${ITEM}{border-radius:calc(var(--st-control-r) - 4px)}`,
  glow: `${MENU}{border:1px solid ${role("primary")};border-radius:0;box-shadow:0 0 16px ${mix("primary", 30)}}
${ITEM}{border-radius:0}
${ITEM}:focus{background-color:${mix("primary", 18)};color:${role("primary")}}`,
};
