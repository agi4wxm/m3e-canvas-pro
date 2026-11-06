import type { Recipes } from "./catalog";
import { CHIPS, anyPart, role, type RecipeCss } from "./shared";

/* The small controls: switches, sliders, check boxes, chips, badges and avatars. */

const SW = `[data-slot=switch]`;
const THUMB = `[data-slot=switch-thumb]`;
export const TOGGLE_CSS: RecipeCss<Recipes["toggle"]> = {
  m3: "",
  ios: `${SW}{border:0;background-color:${role("surface-container-highest")}}
${SW}[data-checked]{background-color:var(--st-toggle-on)}
${SW}[data-size=default]{width:51px;height:31px}
${SW} ${THUMB},${SW} ${THUMB}[data-checked]{background-color:#fff;box-shadow:0 2px 6px rgb(0 0 0/.25)}
${SW}[data-size=default] ${THUMB}{width:27px;height:27px;translate:2px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:22px -50%}
${SW}[data-size=sm] ${THUMB}{width:20px;height:20px;translate:2px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${THUMB}::before,[data-slot=switch-checked-icon],[data-slot=switch-unchecked-icon]{display:none}`,
  block: `${SW}{border-width:var(--st-edge-thin);border-color:var(--st-line);background-color:${role("surface-container-highest")}}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:var(--st-line)}
${SW}[data-size=default] ${THUMB}{width:18px;height:18px;translate:5px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:24px -50%}
${SW}[data-size=sm] ${THUMB}{width:12px;height:12px;translate:3px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${SW} ${THUMB}{background-color:var(--st-line)}
${SW} ${THUMB}[data-checked]{background-color:${role("surface")}}
${THUMB}::before{display:none}`,
  /* Fluent's 40 by 20: a line and a dark thumb when off, the color and a white thumb when on */
  outline: `${SW}{border:1px solid ${role("on-surface-variant")};background-color:transparent}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:transparent}
${SW}[data-size=default]{width:40px;height:20px}
${SW}[data-size=default] ${THUMB}{width:14px;height:14px;translate:2px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:22px -50%}
${SW}[data-size=sm]{width:32px;height:16px}
${SW}[data-size=sm] ${THUMB}{width:10px;height:10px;translate:2px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${SW} ${THUMB}{background-color:${role("on-surface-variant")}}
${SW} ${THUMB}[data-checked]{background-color:#fff}
${THUMB}::before{display:none}`,
  /* the casual games: a thick dark edge, a sunken track, a glossy white knob */
  chunky: `${SW}{border:2px solid var(--st-rim-dark);background-color:${role("surface-container-highest")};box-shadow:inset 0 2px 3px rgb(0 0 0/.25)}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:var(--st-rim-dark)}
${SW}[data-size=default] ${THUMB},${SW}[data-size=default] ${THUMB}[data-checked]{width:22px;height:22px;background-color:#fff;box-shadow:0 2px 0 rgb(0 0 0/.3),inset 0 -2px 0 rgb(0 0 0/.08)}
${SW}[data-size=default] ${THUMB}{translate:3px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:23px -50%}
${THUMB}::before{display:none}`,
};

export const SLIDER_CSS: RecipeCss<Recipes["slider"]> = {
  m3: "",
  thin: `[data-slot=slider]{--slider-gap:0px!important}
[data-slot=slider-stop]{display:none}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:4px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-track]{width:4px}
[data-slot=slider] [data-slot=slider-thumb]{width:28px;height:28px;border-radius:50%;background-color:#fff;box-shadow:0 1px 5px rgb(0 0 0/.32),0 0 0 .5px rgb(0 0 0/.06)}`,
  block: `[data-slot=slider]{--slider-gap:0px!important}
[data-slot=slider-stop]{display:none}
[data-slot=slider-track]{outline:var(--st-edge-thin) solid var(--st-line);border-radius:0}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:10px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-track]{width:10px}
[data-slot=slider] [data-slot=slider-thumb]{border-radius:0;background-color:${role("primary")};outline:var(--st-edge-thin) solid var(--st-line)}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-thumb]{width:14px;height:24px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-thumb]{width:24px;height:14px}`,
};

export const CHECK_CSS: RecipeCss<Recipes["check"]> = {
  m3: "",
  /* WeChat and iOS: round, not square */
  round: `[data-slot=checkbox]{border-radius:50%}`,
};

export const CHIP_CSS: RecipeCss<Recipes["chip"]> = {
  m3: "",
  pill: `:is(${CHIPS}){border-radius:999px}`,
  /* Ant Design and the marketplaces: short, small words, small corners */
  tag: `:is(${CHIPS}){height:24px;padding-inline:8px;font-size:12px;border-radius:var(--md-sys-shape-corner-extra-small)}`,
};

const BADGES = `:is([data-slot=badge],[data-slot=notification-badge],[data-slot=avatar-badge],[data-slot=sidebar-menu-badge],${anyPart("badge")})`;
const COUNTS = `:is([data-slot=notification-badge],[data-slot=sidebar-menu-badge],${anyPart("badge")})`;
/** the counts and labels that sit on or beside something */
export const BADGE_CSS: RecipeCss<Recipes["badge"]> = {
  m3: "",
  /* desktop software: any count is a small dot of the accent, its number left out */
  dot: `${COUNTS}{min-width:8px;width:8px;height:8px;padding:0;font-size:0;line-height:0;border-radius:50%}`,
  /* iOS and WeChat: a red capsule, white words, a little larger than Material's */
  pill: `${BADGES}{border-radius:999px}
${COUNTS}{min-width:18px;height:18px;padding-inline:5px;font-size:11px;line-height:18px;font-weight:600}`,
  /* Ant Design, the stores: a small square tag */
  square: `${BADGES}{border-radius:var(--md-sys-shape-corner-extra-small)}`,
  /* the games: the count in a coin with the style's rim */
  rim: `${COUNTS}{min-width:20px;height:20px;border:2px solid var(--st-rim);box-shadow:0 1px 0 var(--st-rim-dark);font-weight:700}`,
};

const AVATARS = `:is([data-slot=avatar],[data-slot=avatar-image],[data-slot=avatar-fallback])`;
export const AVATAR_CSS: RecipeCss<Recipes["avatar"]> = {
  m3: "",
  /* WeChat: a square with small corners */
  square: `${AVATARS}{border-radius:15%}`,
  /* the games: a square in a frame */
  framed: `${AVATARS}{border-radius:var(--st-control-r)}
[data-slot=avatar]{outline:2px solid var(--st-rim);outline-offset:1px}`,
};

