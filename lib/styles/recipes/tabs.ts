import type { Recipes } from "./catalog";
import { FADED, mix, role, type RecipeCss } from "./shared";

/* Tabs, and the segmented buttons that choose one of a few. */

const INDICATOR = `[data-slot=tabs-list] [data-slot=tabs-indicator]`;
const FLUSH_TABS = `[data-slot=tabs-trigger]{margin-block:0;height:100%}`;
export const TABS_CSS: RecipeCss<Recipes["tabs"]> = {
  m3: "",
  segmented: `[data-slot=tabs]{padding-inline:var(--st-margin)}
[data-slot=tabs-list]{height:36px;width:100%;padding:2px;border:0;background-color:${role("surface-container-highest")};border-radius:var(--st-control-r)}
[data-slot=tabs-trigger]{margin-block:0;height:100%;border-radius:calc(var(--st-control-r) - 2px)}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")}}
${INDICATOR}{top:2px;bottom:2px;left:var(--active-tab-left);width:var(--active-tab-width);height:auto;border-radius:calc(var(--st-control-r) - 2px);background-color:${role("surface-container-low")};box-shadow:0 1px 3px rgb(0 0 0/.18)}`,
  boxed: `[data-slot=tabs-list]{height:44px;border-bottom:var(--st-edge) solid var(--st-line)}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;border:var(--st-edge) solid transparent;border-bottom:0}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};background-color:${role("surface-container-high")};border-color:var(--st-line)}
[data-slot=tabs-indicator]{display:none}`,
  glow: `[data-slot=tabs-list]{border-color:${mix("outline", 40)}}
${INDICATOR}{left:var(--active-tab-left);width:var(--active-tab-width);height:2px;border-radius:0;background-color:var(--st-tab-on);box-shadow:0 0 10px var(--st-tab-on)}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{color:var(--st-tab-on)}`,
  /* Fluent, a marketplace: no track, a rounded bar under the chosen one */
  underline: `[data-slot=tabs-list]{border-bottom-color:transparent}
${INDICATOR}{background-color:var(--st-tab-on)}
[data-slot=tabs-trigger]{border-radius:var(--st-control-r)}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};font-weight:600}`,
  /* WeChat, TikTok, Taobao: the chosen word bold and larger, a short thick bar centered under it, the others grey */
  short: `[data-slot=tabs-list]{border-bottom-color:transparent}
[data-slot=tabs-trigger]{border-radius:0;color:${role("on-surface-variant")}}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};font-weight:700}
${INDICATOR}{left:calc(var(--active-tab-left) + var(--active-tab-width)/2 - 12px);width:24px;height:3px;border-radius:2px;background-color:var(--st-tab-on)}`,
  /* ChatGPT, Notion, Claude: the chosen one a soft filled capsule, no line at all */
  pill: `[data-slot=tabs-list]{border-bottom-color:transparent;gap:4px}
[data-slot=tabs-trigger]{margin-block:6px;border-radius:var(--st-control-r);color:${role("on-surface-variant")}}
[data-slot=tabs-trigger][data-active]{background-color:${role("surface-container-highest")};color:${role("on-surface")}}
[data-slot=tabs-indicator]{display:none}`,
  /* VS Code: square tabs, the chosen one the color of the page with a line along its top */
  topline: `[data-slot=tabs-list]{height:36px;background-color:${role("surface-container-low")}}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;border-right:1px solid ${role("outline-variant")}}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};background-color:${role("surface")}}
${INDICATOR}{top:0;bottom:auto;left:var(--active-tab-left);width:var(--active-tab-width);height:1px;border-radius:0;background-color:var(--st-tab-on)}`,
  /* Apex and Marvel Rivals: the chosen one is a filled parallelogram */
  slant: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;font-style:italic;font-weight:700;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
[data-slot=tabs-trigger][data-active]{background-color:var(--st-tab-on);color:${role("on-primary")}}
[data-slot=tabs-indicator]{display:none}`,
  /* Elden Ring and Black Myth: words alone; the chosen one a pale band with faded ends */
  band: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{background-color:var(--st-tab-on);color:${role("surface")};${FADED}}
[data-slot=tabs-indicator]{display:none}`,
  /* Elden Ring: the chosen row is lit from the left, and the light fades out before it ends */
  fade: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{background-image:linear-gradient(90deg,${mix("primary", 42)},transparent);color:${role("on-surface")}}
[data-slot=tabs-indicator]{display:none}`,
};

const GROUP = `:is([data-slot=toggle-group],[data-slot=button-group])`;
const SEG = `:is([data-slot=toggle-group-item],[data-slot=button-group] [data-button])`;
const SEG_ON = `[data-slot=toggle-group-item][data-pressed]`;
/** a row of a few choices, one chosen: M3's connected buttons, or the product's own segmented control */
export const SEGMENTED_CSS: RecipeCss<Recipes["segmented"]> = {
  m3: "",
  /* iOS: a grey track, the chosen one a white thumb lifted on it, no lines */
  ios: `${GROUP}{gap:0;padding:2px;border-radius:9px;background-color:${role("surface-container-highest")}}
${SEG}{--btn-r:7px;--btn-r-pressed:7px;--btn-r-selected:7px;--btn-h2:7px;border-radius:7px;height:28px;background-color:transparent;color:${role("on-surface")};box-shadow:none;border:0;font-weight:500}
${SEG_ON}{background-color:${role("surface-container-low")};color:${role("on-surface")};box-shadow:0 1px 3px rgb(0 0 0/.16),0 0 0 .5px rgb(0 0 0/.04)}`,
  /* Fluent and Ant Design: boxes joined by their lines, the chosen one in the accent */
  boxed: `${GROUP}{gap:0}
${SEG}{--btn-r:0px;--btn-r-pressed:0px;--btn-r-selected:0px;--btn-h2:var(--md-sys-shape-corner-extra-small);border-radius:0;border:1px solid ${role("outline-variant")};margin-left:-1px;background-color:${role("surface-container-low")};color:${role("on-surface")};box-shadow:none}
${SEG_ON}{border-color:${role("primary")};color:${role("primary")};background-color:${role("surface-container-low")};z-index:1}`,
  /* the web apps: separate capsules, the chosen one dark */
  capsules: `${GROUP}{gap:6px}
${SEG}{--btn-r:999px;--btn-r-pressed:999px;--btn-r-selected:999px;--btn-h2:999px;border-radius:999px;background-color:${role("surface-container-high")};color:${role("on-surface")};box-shadow:none}
${SEG_ON}{background-color:${role("on-surface")};color:${role("surface")}}`,
  /* words in a row, the chosen one underlined */
  underline: `${GROUP}{gap:12px}
${SEG}{border-radius:0;background-color:transparent;color:${role("on-surface-variant")};box-shadow:none;border:0;border-bottom:2px solid transparent;padding-inline:4px}
${SEG_ON}{color:${role("on-surface")};border-bottom-color:var(--st-tab-on);background-color:transparent}`,
  /* the games: square cells with the style's edge */
  block: `${GROUP}{gap:4px}
${SEG}{border-radius:var(--st-control-r);border:var(--st-edge-thin) solid var(--st-line);background-color:${role("surface-container-high")};background-image:none;color:${role("on-surface")};text-shadow:none;box-shadow:0 2px 0 var(--st-line)}
${SEG_ON}{background-color:var(--st-tab-on);color:${role("on-primary")}}`,
};
