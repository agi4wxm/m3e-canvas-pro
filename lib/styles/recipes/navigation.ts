import type { Recipes } from "./catalog";
import { FOOT_BARS, TOP_BARS, mix, role, type RecipeCss } from "./shared";

/* What a screen is navigated by: the bar of destinations, the bar across the top (its paint, and apart from it how its
 * title, back label and actions are composed). */

const NAV_BARS = `[data-slot=navigation-bar],[data-slot=navigation-rail]`;
const CHOSEN_NAV = `:is(${NAV_BARS}) [data-active],:is(${NAV_BARS}) [data-active] *`;
const NO_PILL = `[data-slot=nav-indicator]{background-color:transparent}`;
export const NAV_CSS: RecipeCss<Recipes["nav"]> = {
  m3: "",
  plain: `[data-slot=navigation-bar]{border-top:1px solid ${role("outline-variant")};background-color:${mix("surface-container", 92)}}
[data-slot=navigation-rail]{background-color:${role("surface-container-low")}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}`,
  topline: `[data-slot=navigation-bar]{border-top:1px solid ${mix("outline", 40)}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;top:-1px;left:18%;right:18%;height:2px;background-color:var(--st-nav-on);box-shadow:0 0 10px var(--st-nav-on)}`,
  block: `[data-slot=navigation-bar]{border-top:var(--st-edge) solid var(--st-line)}
[data-slot=nav-indicator]{border:var(--st-edge-thin) solid var(--st-line);background-color:${role("primary-container")}}
:is(${NAV_BARS}) [data-active] [data-slot=icon]{color:${role("on-primary-container")}}`,
  /* iOS 26: a capsule that floats above the foot, the chosen tab a capsule within it */
  floating: `[data-slot=navigation-bar]{position:relative;background-color:transparent;padding:2px 22px 10px}
[data-slot=nav-item]{padding-block:2px;gap:0;position:relative;z-index:1}
[data-slot=navigation-bar]::before{content:"";position:absolute;inset:0 16px 8px;border-radius:999px;background-color:${mix("surface-container", 78)};-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);border:1px solid rgb(255 255 255/.28);box-shadow:0 8px 28px rgb(0 0 0/.16)}
[data-slot=nav-indicator]{background-color:transparent}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]{background-color:${mix("on-surface", 8)};border-radius:999px}`,
  /* Instagram: no words, the chosen icon filled */
  icononly: `[data-slot=navigation-bar]{border-top:1px solid ${role("outline-variant")};background-color:${role("surface")}}
[data-slot=navigation-rail]{background-color:${role("surface-container-low")}}
${NO_PILL}
:is(${NAV_BARS}) [data-slot=nav-label]{display:none}
${CHOSEN_NAV}{color:var(--st-nav-on)}`,
  /* Royal Match and the strategy games: a saturated bar with a rim, the chosen tile raised and lighter */
  gamebar: `[data-slot=navigation-bar]{background-color:var(--st-nav-bg);border-top:3px solid var(--st-rim)}
[data-slot=navigation-bar] :is([data-slot=nav-label],[data-slot=icon]){color:#fff;text-shadow:0 1px 0 rgb(0 0 0/.5)}
${NO_PILL}
[data-slot=navigation-bar] [data-active] [data-slot=nav-indicator]{background-color:var(--st-nav-active);border-radius:10px;inset:-5px -6px -22px;box-shadow:0 0 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.4)}
[data-slot=navigation-bar] [data-slot=nav-label]{position:relative;z-index:2}`,
  /* Wild Rift: dark, with gold light rising from the foot of the chosen tab */
  goldglow: `[data-slot=navigation-bar]{background-color:${role("surface-container-low")};border-top:1px solid ${mix("outline", 60)}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 80% at 50% 100%,${mix("primary", 55)},transparent)}`,
};

/** the paint of what stands across the top of a screen and across its foot */
export const BAR_CSS: RecipeCss<Recipes["bar"]> = {
  m3: "",
  center: `${TOP_BARS}{background-color:${mix("surface", 88)};border-bottom:1px solid ${role("outline-variant")}}
${FOOT_BARS}{border-top:1px solid ${role("outline-variant")}}
[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{text-align:center;font-size:17px;font-weight:600;letter-spacing:0}`,
  line: `${TOP_BARS}{background-color:${role("surface-container-high")};border-bottom:var(--st-bar-line) solid var(--st-line)}
${FOOT_BARS}{background-color:${role("surface-container-high")};border-top:var(--st-bar-line) solid var(--st-line)}`,
  glow: `${TOP_BARS}{background-color:${mix("surface-container", 88)};border-bottom:1px solid ${role("primary")};box-shadow:0 0 14px ${mix("primary", 30)}}
${FOOT_BARS}{background-color:${mix("surface-container", 88)};border-top:1px solid ${role("primary")}}
[data-slot=app-bar-title]{text-shadow:0 0 10px ${mix("primary", 60)}}`,
  /* over a video, a picture, or nothing: no bar to speak of */
  plain: `${TOP_BARS}{background-color:transparent}`,
  /* a game's strip across the top: its own dark fill, its own words, a rim beneath */
  hud: `${TOP_BARS}{background-color:var(--st-bar-bg);border-bottom:2px solid var(--st-rim)}
${FOOT_BARS}{background-color:var(--st-bar-bg);border-top:2px solid var(--st-rim)}
[data-slot=app-bar] :is([data-slot=app-bar-title],[data-slot=app-bar-subtitle],[data-slot=app-bar-back-label],[data-button],[data-slot=icon]){color:var(--st-on-bar)}`,
};

const SMALL = `[data-slot=app-bar][data-size=small]`;
/** the small bar's row as three columns, its title in the middle one whatever stands at either side */
const CENTERED = `${SMALL} [data-slot=app-bar-row]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,max-content) minmax(0,1fr);grid-template-areas:"lead title trail"}
${SMALL} [data-slot=app-bar-leading]{grid-area:lead;justify-self:start}
${SMALL} [data-slot=app-bar-heading]{grid-area:title;text-align:center;padding-inline:8px}
${SMALL} [data-slot=app-bar-trailing]{grid-area:trail;justify-self:end}
${SMALL} [data-slot=app-bar-title]{font-size:17px;line-height:22px;font-weight:600;letter-spacing:0}`;
/** How a bar across the top is composed: where its title stands, whether the back arrow says where it goes back to,
 *  whether a large title stands under it. Its paint is the `bar` recipe's. */
export const APPBAR_CSS: RecipeCss<Recipes["appbar"]> = {
  m3: "",
  /* WeChat, the stores: the title centered whatever stands at the sides */
  center: CENTERED,
  /* iOS: centered, the back chevron saying where it leads in the accent color, actions in the accent, and a medium or
     large bar a bold large title at the left */
  ios: `${CENTERED}
[data-slot=app-bar-back-label]{display:inline;margin-left:-6px;font-size:17px;line-height:22px;color:${role("primary")}}
[data-slot=app-bar-leading] :is([data-button],[data-slot=icon]),[data-slot=app-bar-trailing] :is([data-button],[data-slot=icon]){color:${role("primary")}}
[data-slot=app-bar]:is([data-size=medium],[data-size=large]) [data-slot=app-bar-title]{font-size:34px;line-height:41px;font-weight:700;letter-spacing:.4px}
[data-slot=app-bar-row]{height:44px}`,
  /* Notion, iOS's root screens: the row stays for its buttons, and the title stands large below it */
  large: `${SMALL} [data-slot=app-bar-heading]{visibility:hidden}
[data-slot=app-bar-large-title]{display:block}
[data-slot=app-bar-row]{height:44px}`,
  /* desktop software: a short row, a small title at the left */
  compact: `[data-slot=app-bar-row]{height:48px}
${SMALL} [data-slot=app-bar-title]{font-size:15px;line-height:20px;font-weight:600}
[data-slot=app-bar]:is([data-size=medium],[data-size=large]) [data-slot=app-bar-title]{font-size:24px;line-height:30px;font-weight:600}`,
};
