import { BUTTONS, PRESSES } from "../recipes/shared";
import { definePack, roles, say, CHUNKY_RAMP } from "../types";

/* the background and board read off Block Blast's store screenshots: the most downloaded game of 2025 */

/* The panels recipe also dresses any rounded box filled with a container color, and weighs as much as three attributes
 * doing it; a part named here is meant over that, so its rule carries the weight of an id that nothing has. */
const W = ":not(#_)";
const NAVY = "#1B1F4B";
/** one of the game's pieces: a flat bright square, lit along its top and left edges, shaded along the others */
const piece = (c: string) =>
  `background-color:${c};background-image:linear-gradient(180deg,rgb(255 255 255/.18),rgb(255 255 255/0) 60%);border:0;box-shadow:inset 0 3px 0 rgb(255 255 255/.42),inset 3px 0 0 rgb(255 255 255/.2),inset 0 -4px 0 rgb(0 0 0/.3),inset -3px 0 0 rgb(0 0 0/.16)`;
/** a cell of the board: darker than the board, sunk into it */
const well = `background-color:${NAVY};border:0;box-shadow:inset 0 2px 3px rgb(0 0 0/.45),0 1px 0 rgb(255 255 255/.08)`;
/** the navy panel things stand on, a lighter line along its top */
const board = `background-color:#262A66;border:0;box-shadow:inset 0 2px 0 rgb(255 255 255/.1),inset 0 0 0 1px rgb(255 255 255/.05),0 6px 0 rgb(0 0 0/.22),0 10px 24px rgb(0 0 0/.25)`;
/** white words with an outline of a darker shade */
const stroke = (c: string) => `text-shadow:-1px -1px 0 ${c},1px -1px 0 ${c},-1px 1px 0 ${c},1px 1px 0 ${c},0 2px 0 ${c}`;
/** a purple ribbon with notched ends, the one that carries a title */
const ribbon = `background-color:#8C4FE8;background-image:linear-gradient(180deg,rgb(255 255 255/.25),rgb(255 255 255/0) 50%,rgb(0 0 0/.15));clip-path:polygon(0 0,100% 0,calc(100% - 16px) 50%,100% 100%,0 100%,16px 50%);color:#fff;${stroke("#4A1E8F")}`;

const CSS = `
:is(${BUTTONS}){background-image:linear-gradient(180deg,rgb(255 255 255/.28),rgb(255 255 255/0) 55%);box-shadow:inset 0 2px 0 rgb(255 255 255/.45),0 4px 0 color-mix(in srgb,var(--md-sys-color-primary) 55%,#000),0 6px 10px rgb(0 0 0/.25);font-weight:700}
:is(${BUTTONS}):is([data-variant=tonal],[data-variant=secondary]){background-color:#46C35B;color:#fff;box-shadow:inset 0 2px 0 rgb(255 255 255/.4),0 4px 0 #23803A,0 6px 10px rgb(0 0 0/.25);${stroke("#1D6A30")}}
:is(${BUTTONS}):is([data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:#5B74E0;border:0;color:#fff;box-shadow:inset 0 2px 0 rgb(255 255 255/.35),0 4px 0 #2C3A8F,0 6px 10px rgb(0 0 0/.25)}
:is(${BUTTONS})[data-variant=destructive]{background-color:#F0503C;color:#fff;box-shadow:inset 0 2px 0 rgb(255 255 255/.4),0 4px 0 #A12A1C}
:is(${PRESSES}){translate:0 3px;box-shadow:inset 0 2px 0 rgb(255 255 255/.3),0 1px 0 rgb(0 0 0/.4)}
[data-button][data-size^=icon]:is([data-variant=filled],[data-variant=default],[data-variant=tonal]){box-shadow:inset 0 2px 0 rgb(255 255 255/.4),0 3px 0 rgb(0 0 0/.35)}
:is([data-slot=card],[data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=sheet-content],[data-slot=popover-content])${W}{${board}}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title])${W}{align-self:center;width:fit-content;max-width:calc(100% + 16px);margin:10px -8px 0;padding:8px 30px 10px;${ribbon};filter:drop-shadow(0 3px 0 #4A1E8F)}
[data-slot=snackbar]${W}{background-color:rgb(27 31 75/.94);border:0;border-radius:14px;box-shadow:inset 0 2px 0 rgb(255 255 255/.1),0 4px 0 rgb(0 0 0/.3);color:#fff}
[data-slot=skeleton]${W}{background-color:rgb(255 255 255/.1);border:0;box-shadow:none}

[data-slot=rating-star]{color:rgb(255 255 255/.22);text-shadow:none}
[data-slot=rating-star][data-on]{color:#FFD23F;${stroke("#B07800")}}
[data-slot=checkbox]{width:22px;height:22px;border-radius:6px;${well}}
[data-slot=checkbox][data-checked]{${piece("#46C35B")};color:#fff}
[data-slot=radio-group-item]{width:22px;height:22px;${well}}
[data-slot=radio-group-indicator]{width:12px;height:12px;background-color:#FFD23F;box-shadow:inset 0 2px 0 rgb(255 255 255/.5),inset 0 -2px 0 rgb(0 0 0/.2)}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip])${W}{border:0;border-radius:10px;background-color:${NAVY};box-shadow:inset 0 1px 0 rgb(255 255 255/.08)}
[data-slot=slider] [data-slot=slider-track]${W}{height:12px;border-radius:999px;${well}}
[data-slot=slider] [data-slot=slider-thumb]{width:24px;height:24px;border-radius:8px;${piece("#FFD23F")}}

[data-slot=asset-pill]${W}{height:32px;padding:0 14px 0 6px;gap:6px;border-radius:999px;${well};color:#fff;font-weight:700;font-size:16px}
[data-slot=asset-pill] [data-slot=icon]{width:24px;height:24px}
[data-slot=stat-bar] [data-slot=stat-bar-track]{height:14px;border-radius:999px;${well}}
[data-slot=stat-bar-fill]{border-radius:999px;box-shadow:inset 0 3px 0 rgb(255 255 255/.4),inset 0 -3px 0 rgb(0 0 0/.22)}
:is([data-slot=stat-bar-label],[data-slot=stat-bar-value],[data-slot=reward-track-meta],[data-slot=character-card-value]){color:#fff;font-weight:700}
[data-slot=skill-button-face]{border-radius:22%;box-shadow:inset 0 4px 0 rgb(255 255 255/.45),inset 4px 0 0 rgb(255 255 255/.2),inset 0 -5px 0 rgb(0 0 0/.25),inset -4px 0 0 rgb(0 0 0/.12),0 4px 0 #B07800}
[data-slot=skill-button-cooldown]{border-radius:22%;color:#fff;font-weight:700}
[data-slot=function-button-glyph]${W}{border-radius:30%;${piece("#5B74E0")}}
[data-slot=function-button-value]{padding:0 8px;border-radius:999px;background-color:${NAVY};color:#fff;font-weight:600}

[data-slot=level-map]${W}{${board}}
[data-slot=level-map-line]{stroke:rgb(255 255 255/.12);stroke-width:10px;stroke-linecap:round}
[data-slot=level-map-line][data-done]{stroke:#FFD23F}
[data-slot=level-map-cell]${W}{border-radius:14px;${piece("#5B74E0")};color:#fff;font-weight:700;font-size:20px;outline:0;${stroke("#2C3A8F")}}
[data-slot=level-map-cell][data-current]${W}{width:56px;height:56px;${piece("#FFD23F")};color:#fff;font-size:24px;${stroke("#B07800")};outline:3px solid rgb(255 255 255/.85);outline-offset:3px}
[data-slot=level-map-cell][data-locked]${W}{${well};color:rgb(255 255 255/.5)}
[data-slot=level-map-stars]{margin-top:2px}

[data-slot=reward-track-cell]${W}{border-radius:12px;${well};color:#fff;font-weight:700}
[data-slot=reward-track-cell][data-ready]${W}{${piece("#46C35B")};color:#fff}
[data-slot=reward-track-track]${W}{height:12px;${well}}
[data-slot=reward-track-fill]{background-color:#FFD23F;box-shadow:inset 0 3px 0 rgb(255 255 255/.45),inset 0 -3px 0 rgb(0 0 0/.2)}
[data-slot=check-in]${W}{${board}}
[data-slot=check-in-title]{font-weight:700;font-size:var(--text-title-medium);color:#fff}
[data-slot=check-in-cell]${W}{border-radius:10px;${well};color:rgb(255 255 255/.75);font-weight:700}
[data-slot=check-in-cell][data-state=done]${W}{${piece("#46C35B")};color:#fff}
[data-slot=check-in-cell][data-state=today]${W}{${piece("#FFD23F")};color:#2B1F00}
[data-slot=task-bar]${W}{${board}}
[data-slot=task-bar-title]{font-weight:700}
[data-slot=item-cell-frame]${W}{border-radius:14px;${piece("#5B74E0")}}
[data-slot=item-cell-value]{right:5px;bottom:2px;color:#fff;font-weight:700;${stroke(NAVY)}}
[data-slot=item-cell-badge]{background-color:#F0503C;color:#fff;font-weight:700;box-shadow:0 0 0 2px ${NAVY}}
[data-slot=item-cell-tag]{border-radius:12px 0 10px 0;font-weight:700}
[data-slot=item-cell-label]{color:#fff;font-weight:600}
[data-slot=inventory]${W}{${board}}
[data-slot=inventory-cell]${W}{border-radius:10px;${well}}
[data-slot=inventory-cell][data-filled]${W}{${piece("#8C4FE8")}}

[data-slot=character-card-media]{background-image:radial-gradient(70% 80% at 50% 40%,rgb(255 255 255/.25),transparent 70%)}
[data-slot=character-card-tag]{${piece("#8C4FE8")};color:#fff;font-weight:700;border-radius:8px}
[data-slot=character-card-level]{background-color:${NAVY};color:#fff;border-radius:999px;font-weight:700}
[data-slot=character-card-track]${W}{height:10px;${well}}
[data-slot=character-card-fill]{background-color:#FFD23F;box-shadow:inset 0 2px 0 rgb(255 255 255/.45)}

[data-slot=game-result]${W}{overflow:visible;${board}}
[data-slot=game-result-title]{margin:-36px -36px 4px;padding:10px 40px 14px;${ribbon};filter:drop-shadow(0 3px 0 #4A1E8F);font-size:28px;line-height:1.1}
[data-slot=game-result-stars]{filter:drop-shadow(0 3px 0 rgb(0 0 0/.3))}
[data-slot=game-result-cell]${W}{border-radius:12px;${well}}

[data-slot=game-board]${W}{${board}}
[data-slot=game-board-title]{font-weight:700;color:#fff}
[data-slot=game-board-grid]{gap:4px;padding:6px;border-radius:12px;background-color:#141838}
[data-slot=game-board-cell]${W}{border-radius:6px;${well};color:#fff;font-weight:700;font-size:30px}
[data-slot=game-board-cell][data-mark]${W}{${piece("#F0503C")};${stroke("rgb(0 0 0/.35)")}}
[data-slot=game-board-cell][data-mark=O]${W}{${piece("#3FB8F5")}}
[data-slot=game-board-cell][aria-pressed=true]${W}{${piece("#FFD23F")}}

[data-slot=wheel-track]${W}{--md-sys-color-surface-container-high:#5B74E0;--md-sys-color-surface-container-low:#8C4FE8;border:8px solid #FFD23F;box-shadow:0 0 0 3px #B07800,0 6px 0 3px rgb(0 0 0/.25),inset 0 0 0 2px rgb(0 0 0/.2);color:#fff}
[data-slot=wheel-label] [data-slot=icon]{width:26px;height:26px}
[data-slot=wheel-indicator]{top:-14px;z-index:2;border-left-width:12px;border-right-width:12px;border-top-width:24px;border-top-color:#F0503C;filter:drop-shadow(0 3px 0 rgb(0 0 0/.35))}
[data-slot=wheel-stage] [data-button]{width:64px;height:64px;padding:0;border-radius:999px}
[data-slot=grid-wheel-grid]{padding:6px;border-radius:14px;background-color:#141838}
[data-slot=grid-wheel-cell]${W}{border-radius:10px;${piece("#3A47A0")};color:#fff;font-weight:600}
[data-slot=grid-wheel-cell][data-lit]${W}{${piece("#FFD23F")};color:#2B1F00;outline:3px solid #fff;outline-offset:-1px}
[data-slot=gacha-media]${W}{background-color:rgb(20 24 56/.6);background-image:radial-gradient(60% 50% at 32% 24%,rgb(255 255 255/.4),rgb(255 255 255/0) 60%);border:4px solid #8FA4F0;box-shadow:inset 0 -10px 20px rgb(0 0 0/.35),0 6px 0 #2C3A8F}
[data-slot=gacha-dot]{border-radius:30%;box-shadow:inset 0 3px 0 rgb(255 255 255/.45),inset 0 -3px 0 rgb(0 0 0/.25)}
[data-slot=gacha-dot][class~="bg-primary-container"]{background-color:#F0503C}
[data-slot=gacha-dot][class~="bg-secondary-container"]{background-color:#46C35B}
[data-slot=gacha-dot][class~="bg-tertiary-container"]{background-color:#FFD23F}
[data-slot=slot-machine-track]${W}{${board};border-radius:16px}
[data-slot=slot-machine-cell]{border-radius:10px;${well};color:#fff}
[data-slot=egg-smash-title]{font-weight:700;color:#fff;font-size:var(--text-title-medium)}
[data-slot=egg-smash-item]${W}{background-color:#FFD23F;background-image:radial-gradient(40% 30% at 36% 28%,rgb(255 255 255/.85),rgb(255 255 255/0)),radial-gradient(90% 80% at 62% 78%,rgb(176 120 0/.5),transparent 70%);box-shadow:0 5px 0 rgb(0 0 0/.25)}
[data-slot=egg-smash-item][data-state=broken]${W}{background-color:#3A47A0;background-image:none}
[data-slot=draw-result]{color:#FFD23F;font-weight:700}
[data-slot=joystick]${W}{background-color:rgb(27 31 75/.7);border:3px solid rgb(255 255 255/.25);box-shadow:inset 0 3px 8px rgb(0 0 0/.4)}
[data-slot=joystick-handle]{border-radius:30%;${piece("#FFD23F")}}
[data-slot=joystick-dot]{display:none}
[data-slot=side-tabs]${W}{${board}}
[data-slot=side-tabs-item][data-active]${W}{${piece("#5B74E0")};color:#fff}
`;

export default definePack({
  key: "blocks",
  name: say("方块解谜", "Block puzzle", "ブロックパズル", "블록 퍼즐"),
  hint: say("像 Block Blast：宝蓝底、深蓝棋盘、金色皇冠、紫色飘带", "Like Block Blast: royal blue ground, navy board, gold crown, purple ribbon", "Block Blast のような青地と金", "Block Blast 같은 파란 바탕과 금색"),
  refs: ["Block Blast"],
  basis: "sampled",
  group: "mobileGame",
  seed: "#425AB7",
  mode: "dark",
  light: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
  dark: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
  shape: "rounded",
  font: "fredoka",
  display: "fredoka",
  icons: "emoji",
  motion: "expressive",
  control: "large",
  pill: "round",
  tokens: { navOn: "#FFD23F", toggleOn: "#46D160", tabOn: "#FFD23F" },
  recipes: { button: "lip", surface: "plain", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "jelly", feedback: "press", list: "tile", dialog: "game", card: "flat", segmented: "capsules", appbar: "center", search: "filled", progress: "jelly", divider: "fade", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", icon: "emboss", text: "outlined", scroll: "hidden" },
  art: "flat vibrant illustration of glowing gem-like blocks, bold shapes, saturated colors on deep blue",
  ux: { margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" },
  layout: { zh: "几乎没有菜单：左上皇冠和最高分，右上设置，中间大分数，下面是深蓝棋盘和待放方块。", en: "Almost no menus: a crown and best score at the upper left, settings at the upper right, a big score in the middle, the navy board and the pieces below it." },
  type: CHUNKY_RAMP,
  css: CSS,
});
