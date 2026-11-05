import type { Recipes } from "./catalog";
import { CARDS, PANELS, UNPAINTED, mix, role, type RecipeCss } from "./shared";

/* Whatever holds other things: panels in general, cards in particular, sheets, tooltips, and the surface roles of the
 * box an author builds with. */

export const SURFACE_CSS: RecipeCss<Recipes["surface"]> = {
  m3: "",
  soft: `:is(${PANELS}){box-shadow:0 1px 2px rgb(0 0 0/.06),0 6px 20px rgb(0 0 0/.06)}
[data-slot=card][class~="bg-surface-container-highest"]{background-color:${role("surface-container-low")}}`,
  line: `:is(${PANELS}){border:1px solid ${role("outline-variant")};box-shadow:0 1px 2px rgb(0 0 0/.05)}`,
  hard: `:is(${PANELS}){border:var(--st-edge) solid var(--st-line);box-shadow:4px 4px 0 var(--st-line)}`,
  glow: `:is(${PANELS}){border:1px solid ${mix("primary", 55)};box-shadow:0 0 16px ${mix("primary", 20)},inset 0 0 22px ${mix("primary", 7)}}`,
  glass: `:is(${PANELS}){background-color:${mix("surface-container-high", 42)};-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);border:1px solid rgb(255 255 255/.22);box-shadow:0 8px 32px rgb(0 0 0/.2),inset 0 1px 0 rgb(255 255 255/.22)}`,
  ornate: `:is(${PANELS}){border:1px solid ${role("primary")};box-shadow:0 0 0 1px ${role("surface")},0 0 0 3px ${mix("primary", 55)},0 6px 18px rgb(0 0 0/.45),inset 0 0 26px rgb(0 0 0/.3)}`,
  plain: `:is(${PANELS}){border:0;box-shadow:none}`,
  /* a marketplace's white card on grey */
  tile: `:is(${PANELS}){border:0;box-shadow:none}
[data-slot=card]{background-color:${role("surface-container-low")}}`,
  /* the casual games' popups: a thick rim of two colors and a lip */
  chunk: `:is(${PANELS}){border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 2px rgb(0 0 0/.25),inset 0 2px 0 rgb(255 255 255/.7)}`,
  /* Elden Ring and Wild Rift: a thin line of the accent, a fainter one just outside it */
  hairline: `:is(${PANELS}){border:1px solid var(--st-rim);outline:1px solid ${mix("primary", 14)};outline-offset:3px;box-shadow:none;background-image:linear-gradient(180deg,rgb(255 255 255/.03),transparent)}`,
  /* Stardew Valley: a wooden frame around parchment that darkens toward its foot */
  wood: `:is(${PANELS}){border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),3px 5px 0 2px rgb(0 0 0/.25);background-image:linear-gradient(180deg,rgb(255 255 255/.22),rgb(120 60 0/.1))}`,
  /* Genshin: one thin line of pale gold */
  gilt: `:is(${PANELS}){border:1px solid var(--st-rim);box-shadow:inset 0 0 0 1px rgb(255 255 255/.06),0 4px 18px rgb(0 0 0/.25)}`,
  /* the strategy games' plate: a dark edge, a light top, a small lip */
  steel: `:is(${PANELS}){border:2px solid var(--st-rim-dark);box-shadow:inset 0 1px 0 rgb(255 255 255/.6),0 3px 0 rgb(0 0 0/.18)}`,
};

const CARD = `:is(${CARDS})`;
/** a card still in a surface of its own, not one an author has filled with an accent */
const PLAIN_CARD = `:is(${CARDS})${UNPAINTED}`;
/** How a card is put together: its edge, how far it lifts, and what its header, media and footer do. It comes after
 *  the surface recipe, so a card can differ from the other panels of the same style. */
export const CARD_CSS: RecipeCss<Recipes["card"]> = {
  m3: "",
  /* WeChat, a marketplace: a white block on the grey ground and nothing else */
  flat: `${CARD}{border:0;box-shadow:none}
${PLAIN_CARD}{background-color:${role("surface-container-low")}}`,
  /* Fluent, Ant Design's plain card, VS Code: a hairline all round */
  outlined: `${CARD}{border:1px solid ${role("outline-variant")};box-shadow:none}
${PLAIN_CARD}{background-color:${role("surface-container-low")}}`,
  /* iOS and the stores: white, lifted by a soft wide shadow, larger corners */
  raised: `${CARD}{border:0;box-shadow:0 1px 2px rgb(0 0 0/.05),0 8px 24px rgb(0 0 0/.07)}
${PLAIN_CARD}{background-color:${role("surface-container-low")}}
[data-slot=card]{border-radius:var(--md-sys-shape-corner-large)}`,
  /* Ant Design: a title row ruled off from the body, the actions in a row of their own along the foot */
  headed: `${CARD}{border:1px solid ${role("outline-variant")};box-shadow:none}
${PLAIN_CARD}{background-color:${role("surface-container-low")}}
[data-slot=card-header]{padding-bottom:12px;border-bottom:1px solid ${role("outline-variant")}}
[data-slot=card-title]{font-size:var(--text-title-medium);line-height:var(--text-title-medium--line-height);font-weight:600}
[data-slot=card-footer]{border-top:1px solid ${role("outline-variant")};padding-top:8px;justify-content:space-around}`,
  /* Notion and Claude: a quiet page, ruled, roomy, barely lifted */
  paper: `${CARD}{border:1px solid ${role("outline-variant")};box-shadow:0 1px 2px rgb(0 0 0/.04)}
${PLAIN_CARD}{background-color:${role("surface-container-low")}}
[data-slot=card]{--card-spacing:20px}
[data-slot=card-title]{font-family:var(--st-display,inherit);font-weight:500}`,
  /* the games: the rim of the style around the card, a lighter line inside it */
  framed: `${CARD}{border:2px solid var(--st-rim);box-shadow:inset 0 0 0 1px rgb(255 255 255/.12),0 3px 0 var(--st-rim-dark)}
[data-slot=card-title]{font-family:var(--st-display,inherit)}`,
  glass: `${PLAIN_CARD}{background-color:${mix("surface-container-high", 50)}}
${CARD}{-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);border:1px solid rgb(255 255 255/.24);box-shadow:0 8px 28px rgb(0 0 0/.16)}`,
};

const SHEETS = `:is([data-slot=sheet-content],[data-slot=drawer-popup],[data-slot=action-sheet-group],[data-slot=side-sheet-content],[data-surface=sheet])`;
const HANDLE = `[data-slot=sheet-handle]`;
/** sheets that rise from the foot, and panels that slide from a side */
export const SHEET_CSS: RecipeCss<Recipes["sheet"]> = {
  m3: "",
  /* iOS: a grabber on top, corners of about 10pt, the actions of an action sheet in a rounded group with Cancel apart */
  grabber: `:is([data-slot=sheet-content][data-side=bottom],[data-surface=sheet]) ${HANDLE}{display:block;width:36px;height:5px;margin:6px auto 0;border-radius:3px;background-color:${mix("on-surface", 22)}}
[data-slot=sheet-content][data-side=bottom],[data-slot=drawer-popup][data-swipe-direction=down]{border-radius:12px 12px 0 0}
[data-slot=drawer-swipe-handle]{opacity:.6}
[data-slot=action-sheet-group]{border-radius:14px;background-color:${mix("surface-container-low", 88)};-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
[data-slot=action-sheet-action]{color:${role("primary")};font-size:20px;height:56px}
[data-slot=action-sheet-cancel]{border-radius:14px;height:56px;font-size:20px;font-weight:600;background-color:${role("surface-container-low")};color:${role("primary")};border:0}`,
  /* WeChat: the actions as full-width rows of words, Cancel parted from them by a band of the grey ground */
  weui: `[data-slot=action-sheet]{gap:0;background-color:${role("surface")};border-radius:12px 12px 0 0;overflow:hidden}
[data-slot=action-sheet-group]{border-radius:0;background-color:${role("surface-container-low")}}
[data-slot=action-sheet-action]{height:56px;font-size:17px;font-weight:400;color:${role("on-surface")};border-radius:0}
[data-slot=action-sheet-cancel]{margin-top:8px;height:56px;border-radius:0;font-size:17px;font-weight:400;background-color:${role("surface-container-low")};color:${role("on-surface")};border:0;box-shadow:none}
[data-slot=sheet-content][data-side=bottom],[data-slot=drawer-popup][data-swipe-direction=down]{border-radius:12px 12px 0 0}`,
  /* desktop software: a panel docked to the edge, square, a line where it meets the window, no handle */
  panel: `${SHEETS}{border-radius:0;box-shadow:-1px 0 0 ${role("outline-variant")},0 8px 24px rgb(0 0 0/.12)}
[data-slot=drawer-swipe-handle]{display:none}`,
  /* the games: the rim around it, the handle a bar of the rim */
  rim: `${SHEETS}{border:2px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark)}
[data-slot=sheet-content][data-side=bottom] ${HANDLE}{display:block;width:48px;height:6px;margin:6px auto 0;background-color:var(--st-rim)}`,
};

const TIP = `[data-slot=tooltip-content]`;
export const TOOLTIP_CSS: RecipeCss<Recipes["tooltip"]> = {
  m3: "",
  /* Fluent and Ant Design: a small light card with a line and a shadow */
  light: `${TIP}{background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${role("outline-variant")};box-shadow:0 4px 12px rgb(0 0 0/.14);border-radius:var(--md-sys-shape-corner-extra-small)}`,
  /* iOS, the web apps: near-black and slightly see-through, rounder */
  dark: `${TIP}{background-color:rgb(20 20 20/.86);color:#fff;border-radius:8px;padding:6px 10px}`,
  rim: `${TIP}{background-color:${role("surface-container-high")};color:${role("on-surface")};border:2px solid var(--st-rim);border-radius:var(--st-control-r)}`,
  glow: `${TIP}{background-color:${role("surface-container-low")};color:${role("primary")};border:1px solid ${role("primary")};box-shadow:0 0 10px ${mix("primary", 45)};border-radius:0}`,
};

/** The box an author builds with, by the surface role it plays. Most roles reach it through the recipe of what it
 *  plays (a card box is one of CARDS, a field box takes the field recipe); these are what is left: a well is a sunken
 *  place. */
export const BOX_CSS = `[data-surface=well]${UNPAINTED}{background-color:${role("surface-container-highest")}}
[data-surface=well]{box-shadow:inset 0 1px 2px rgb(0 0 0/.08)}`;
