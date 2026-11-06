import type { Recipes } from "./catalog";
import { mix, role, type RecipeCss } from "./shared";

/* Bars that show how much: a game's stat bars, and the progress bar of everything else. */

const STAT = `[data-slot=stat-bar-track]`;
const STAT_FILL = `[data-slot=stat-bar-fill]`;
export const METER_CSS: RecipeCss<Recipes["meter"]> = {
  m3: "",
  /* Elden Ring: a thin line of a bar in a thin frame */
  thin: `${STAT}{height:6px;border-radius:0;background-color:rgb(0 0 0/.35);outline:1px solid var(--st-rim,${role("outline")})}
${STAT_FILL}{border-radius:0}`,
  /* the casual games: a fat sunken trough, a glossy fill */
  jelly: `${STAT}{height:14px;border:2px solid var(--st-rim-dark,${role("outline")});background-color:rgb(0 0 0/.35)}
${STAT_FILL}{background-image:linear-gradient(180deg,rgb(255 255 255/.5),rgb(255 255 255/.05) 55%,rgb(0 0 0/.18))}`,
  block: `${STAT}{height:12px;border-radius:0;border:var(--st-edge-thin) solid var(--st-line)}
${STAT_FILL}{border-radius:0}`,
  /* Cyberpunk 2077: cut into cells */
  segment: `${STAT}{height:10px;border-radius:0;outline:1px solid var(--st-line);background-color:rgb(0 0 0/.3)}
${STAT_FILL}{border-radius:0;-webkit-mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px);mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px)}`,
};

const TRACK = `[data-slot=progress-track]`;
const BAR = `[data-slot=progress-bar]`;
const REST = `[data-slot=progress-rest]`;
/** M3's bar leaves a gap and a stop dot; every other product draws one unbroken track */
const JOINED = `:is([data-slot=progress-gap],[data-slot=progress-stop]){display:none}`;
/* the bar's thickness is set inline from its prop, so a style that changes it has to say so firmly */
const THICK = (px: number) => `${TRACK}{height:${px}px!important}
:is(${BAR},${REST}){height:100%!important}`;
export const PROGRESS_CSS: RecipeCss<Recipes["progress"]> = {
  m3: "",
  /* iOS, WeChat, the desktop: one thin unbroken track, the fill in the accent */
  thin: `${JOINED}
${REST}{background-color:${mix("on-surface", 12)}}
${TRACK}{border-radius:999px}`,
  /* the web apps and the stores: a thicker rounded track */
  track: `${JOINED}
${THICK(8)}
${TRACK}{border-radius:999px;background-color:${role("surface-container-highest")}}
${REST}{background-color:transparent}`,
  /* Cyberpunk 2077 and the shooters: square, cut into cells */
  segment: `${JOINED}
${THICK(8)}
${TRACK}{border-radius:0;outline:1px solid var(--st-line);background-color:rgb(0 0 0/.25)}
:is(${BAR},[data-slot=progress-fill]){border-radius:0}
${BAR}{-webkit-mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px);mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px)}
${REST}{background-color:transparent}`,
  glow: `${JOINED}
${REST}{background-color:${mix("primary", 16)}}
${BAR}{box-shadow:0 0 8px ${role("primary")}}
[data-slot=progress-fill]{overflow:visible}`,
  /* the casual games: a fat sunken trough with a rim, a glossy fill */
  jelly: `${JOINED}
${THICK(14)}
${TRACK}{border:2px solid var(--st-rim-dark);border-radius:999px;background-color:rgb(0 0 0/.3)}
${BAR}{background-image:linear-gradient(180deg,rgb(255 255 255/.5),rgb(255 255 255/.05) 55%,rgb(0 0 0/.18))}
${REST}{background-color:transparent}`,
};
