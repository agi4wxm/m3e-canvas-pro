import type { Recipes } from "./catalog";
import { BUTTON, BUTTONS, FAB, FADED, OUTLINED, PRESSES, SHEEN, TONED, mix, role, type RecipeCss } from "./shared";

/* Buttons, floating buttons, and what a press looks like. */

export const BUTTON_CSS: RecipeCss<Recipes["button"]> = {
  m3: "",
  flat: `${BUTTONS}{box-shadow:none}
${TONED}:not([data-variant=outlined],[data-variant=outline]){border:1px solid var(--st-toned-line)}`,
  hard: `${BUTTONS}{border:var(--st-edge) solid var(--st-rim-dark);box-shadow:inset 0 0 0 2px var(--st-rim),3px 3px 0 var(--st-rim-dark)}
${PRESSES}{translate:2px 2px;box-shadow:inset 0 0 0 2px var(--st-rim),1px 1px 0 var(--st-rim-dark)}`,
  chamfer: `${BUTTONS}{border-radius:0;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:none}`,
  bevel: `${BUTTONS}{border:1px solid ${mix("primary", 55, "black")};background-image:linear-gradient(180deg,rgb(255 255 255/.24),rgb(0 0 0/.2));box-shadow:inset 0 1px 0 rgb(255 255 255/.42),inset 0 -1px 0 rgb(0 0 0/.35),0 2px 0 rgb(0 0 0/.4)}
${PRESSES}{translate:0 1px;box-shadow:inset 0 2px 4px rgb(0 0 0/.45)}`,
  glow: `${BUTTONS}{border:1px solid ${role("primary")};box-shadow:0 0 12px ${mix("primary", 55)},inset 0 0 8px ${mix("primary", 20)}}`,
  glass: `${BUTTONS}{-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);border:1px solid rgb(255 255 255/.28);box-shadow:0 4px 16px rgb(0 0 0/.18),inset 0 1px 0 rgb(255 255 255/.3)}
${TONED}{background-color:${mix("surface-container-high", 45)}}`,
  /* Royal Match and Clash Royale: a gradient over the fill, a gold rim, a dark outer line, a lip below, white words with an outline */
  gloss: `${BUTTONS}{border:3px solid var(--st-rim);background-image:${SHEEN};box-shadow:0 0 0 2px var(--st-rim-dark),0 4px 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.55);color:#fff;${OUTLINED("var(--st-stroke)")};font-family:var(--st-display,inherit);font-weight:400}
${PRESSES}{translate:0 3px;box-shadow:0 0 0 2px var(--st-rim-dark),0 1px 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.3)}
:is(${FAB}){background-color:${role("primary")}}`,
  /* Block Blast: flat, with a darker lip */
  lip: `${BUTTONS}{box-shadow:0 4px 0 ${mix("primary", 60, "black")};font-weight:600}
${PRESSES}{translate:0 3px;box-shadow:0 1px 0 ${mix("primary", 60, "black")}}`,
  /* Elden Ring: no box at all; the words stand between two hairlines that fade out, on a faint glow */
  text: `${BUTTONS}{background-color:transparent;color:${role("on-surface")};border:0;border-block:1px solid;border-image:linear-gradient(90deg,transparent,${mix("primary", 70)},transparent) 1;background-image:radial-gradient(70% 100% at 50% 50%,${mix("primary", 16)},transparent);box-shadow:none;border-radius:0}
${TONED}{border-image:none;border-color:transparent;background-image:none;color:${role("on-surface-variant")}}`,
  /* Black Myth: a pale band with faded ends and dark words; anything lesser is words alone */
  band: `${BUTTONS}{border:0;border-radius:0;box-shadow:none;${FADED}}
${TONED}{background-color:transparent;color:${role("on-surface")}}`,
  /* Marvel Rivals: a parallelogram, bold italic capitals */
  slant: `${BUTTONS}{border:0;border-radius:0;clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);box-shadow:none;font-style:italic;font-weight:800;text-transform:uppercase;letter-spacing:.02em}`,
  /* Genshin: a capsule with a thin ring just inside its edge */
  ring: `${BUTTONS}{border:0;box-shadow:inset 0 0 0 2px ${mix("on-primary", 16)},0 2px 6px rgb(0 0 0/.25)}
${TONED}{box-shadow:inset 0 0 0 1px ${mix("on-secondary-container", 30)},0 2px 6px rgb(0 0 0/.25)}`,
  /* Cyberpunk 2077: the color at a low strength, a line of it around, its words in it, one corner cut */
  tint: `${BUTTONS}{background-color:${mix("primary", 16)};color:${role("primary")};border:1px solid ${role("primary")};border-radius:0;box-shadow:none;clip-path:polygon(0 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%)}
${BUTTON}:hover{background-color:${mix("primary", 34)}}`,
  /* Wild Rift: dark with a thin gold line and a glow from inside; the main action in gold */
  frame: `${BUTTONS}{border:1px solid var(--st-rim);border-radius:0;background-image:linear-gradient(180deg,rgb(255 255 255/.14),rgb(0 0 0/.18));box-shadow:inset 0 0 10px rgb(255 255 255/.08),0 2px 8px rgb(0 0 0/.4)}
${TONED}{background-color:${role("surface-container-low")};color:${role("on-surface")}}`,
};

const FABS = `:is(${FAB},[data-slot=fab-menu-trigger])`;
/** the floating action: its outline and how far it floats. Its paint and rim come from the button recipe. */
export const FAB_CSS: RecipeCss<Recipes["fab"]> = {
  m3: "",
  /* WhatsApp, iOS apps that have one: a circle, softly lifted */
  round: `${FABS}{border-radius:999px;box-shadow:0 4px 14px rgb(0 0 0/.18)}
[data-slot=extended-fab]{border-radius:999px}`,
  /* desktop software: nothing floats */
  flat: `${FABS}{box-shadow:none}`,
  square: `${FABS}{border-radius:var(--md-sys-shape-corner-medium)}`,
  glow: `${FABS}{box-shadow:0 0 0 1px ${role("primary")},0 0 18px ${mix("primary", 55)}}`,
};

const QUIET = `[data-slot=ripple],.m3-ripple-host{display:none}`;
const PRESSABLE = `[data-button],[data-slot=toggle],[data-slot=fab],[data-slot=extended-fab],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=tabs-trigger]`;
export const FEEDBACK_CSS: RecipeCss<Recipes["feedback"]> = {
  m3: "",
  dim: `${QUIET}\n:is(${PRESSABLE}):active{opacity:.62}`,
  press: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(.92)}`,
  flash: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(1.35)}`,
};
