import { BUTTONS, PRESSES } from "../recipes/shared";
import { definePack, roles, say, CHUNKY_RAMP } from "../types";

/* button, rim and bar colors read off Royal Match's store screenshots; Clash Royale's from Interface In Game */

/* The panels recipe also dresses any rounded box filled with a container color, and weighs as much as three attributes
 * doing it; a part named here is meant over that, so its rule carries the weight of an id that nothing has. */
const W = ":not(#_)";
/** words outlined all round in a color, and dropped a little below: the white words of every casual game */
const stroke = (c: string) => `text-shadow:-1.5px -1.5px 0 ${c},1.5px -1.5px 0 ${c},-1.5px 1.5px 0 ${c},1.5px 1.5px 0 ${c},0 1.5px 0 ${c},0 3px 0 ${c}`;
const DARK = "#3A1F00";
/** a raised candy face in the color --cz: lighter on top, a shine across its upper half, a darker lip below */
const candy = `background-image:linear-gradient(180deg,rgb(255 255 255/.45),rgb(255 255 255/.16) 46%,rgb(255 255 255/0) 54%,rgb(0 0 0/.12));border:2px solid color-mix(in srgb,var(--cz) 42%,${DARK});box-shadow:inset 0 2px 0 rgb(255 255 255/.6),inset 0 -3px 0 color-mix(in srgb,var(--cz) 70%,#000),0 4px 0 color-mix(in srgb,var(--cz) 42%,${DARK}),0 6px 8px rgb(0 0 0/.22)`;
/** a cream tile with the gold rim, raised off its panel */
const tile = `background-color:var(--md-sys-color-surface-container-low);border:2px solid var(--st-rim);box-shadow:0 0 0 1.5px var(--st-rim-dark),0 3px 0 1.5px var(--st-rim-dark),inset 0 2px 0 #fff;color:var(--md-sys-color-on-surface)`;

const CSS = `
:is(${BUTTONS}){--cz:var(--md-sys-color-primary);${candy};color:#fff;${stroke("color-mix(in srgb,var(--cz) 38%,#000)")}}
:is(${BUTTONS}):is([data-variant=tonal],[data-variant=secondary]){--cz:var(--md-sys-color-secondary-container)}
:is(${BUTTONS}):is([data-variant=outlined],[data-variant=outline],[data-variant=elevated]){--cz:var(--md-sys-color-secondary);background-color:var(--cz)}
:is(${BUTTONS})[data-variant=tertiary]{--cz:var(--md-sys-color-tertiary);background-color:var(--cz)}
:is(${BUTTONS})[data-variant=destructive]{--cz:#E8392B;background-color:var(--cz)}
:is(${PRESSES}){translate:0 3px;box-shadow:inset 0 2px 0 rgb(255 255 255/.4),inset 0 -2px 0 color-mix(in srgb,var(--cz) 70%,#000),0 1px 0 color-mix(in srgb,var(--cz) 42%,${DARK})}
[data-button][data-size^=icon]:is([data-variant=filled],[data-variant=default],[data-variant=tonal],[data-variant=secondary],[data-variant=destructive]){--cz:var(--md-sys-color-primary);${candy};color:#fff;border-radius:999px}
[data-button][data-size^=icon]:is([data-variant=tonal],[data-variant=secondary]){--cz:var(--md-sys-color-secondary-container)}
[data-button][data-size^=icon][data-variant=destructive]{--cz:#E8392B}
:is([data-slot=dialog-close],[data-slot=sheet-close])[data-size^=icon]{--cz:#E8392B;${candy};background-color:var(--cz);color:#fff;border-radius:999px}

:is([data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=card],[data-slot=sheet-content],[data-slot=popover-content])${W}{box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 2px rgb(0 0 0/.25),inset 0 2px 0 rgb(255 255 255/.8),inset 0 -6px 0 rgb(176 122 42/.18)}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){background-image:linear-gradient(180deg,rgb(255 255 255/.28),rgb(255 255 255/0) 55%,rgb(0 0 0/.14));box-shadow:inset 0 -3px 0 rgb(0 0 0/.22),0 2px 0 var(--st-rim);font-size:var(--text-title-large);line-height:1.2}
[data-slot=snackbar]${W}{background-color:rgb(28 58 110/.92);border:2px solid var(--st-rim);border-radius:999px;box-shadow:0 0 0 1.5px var(--st-rim-dark),0 4px 0 rgb(0 0 0/.25);color:#fff;font-family:var(--st-display,inherit);${stroke("#0E2547")}}
[data-slot=skeleton]${W}{border:0;box-shadow:inset 0 2px 3px rgb(90 50 0/.18)}

[data-slot=rating-star]{color:rgb(58 31 0/.22);text-shadow:0 2px 0 rgb(255 255 255/.5)}
[data-slot=rating-star][data-on]{color:#FFC21A;${stroke(DARK)}}
[data-slot=checkbox]{width:22px;height:22px;border-radius:6px;border:2px solid var(--st-rim-dark);background-color:#fff;box-shadow:inset 0 2px 2px rgb(0 0 0/.18)}
[data-slot=checkbox][data-checked]{border-color:color-mix(in srgb,var(--md-sys-color-primary) 42%,${DARK});background-image:linear-gradient(180deg,rgb(255 255 255/.4),transparent 55%);box-shadow:inset 0 -2px 0 rgb(0 0 0/.2)}
[data-slot=radio-group-item]{width:22px;height:22px;border:2px solid var(--st-rim-dark);background-color:#fff;box-shadow:inset 0 2px 2px rgb(0 0 0/.18)}
[data-slot=radio-group-indicator]{width:12px;height:12px;background-image:linear-gradient(180deg,rgb(255 255 255/.5),transparent 60%);box-shadow:0 1px 0 rgb(0 0 0/.25)}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip])${W}{border:2px solid var(--st-rim);background-color:var(--md-sys-color-surface-container-low);box-shadow:0 0 0 1px var(--st-rim-dark),0 2px 0 1px var(--st-rim-dark);border-radius:999px}
[data-slot=slider]{--slider-gap:0px!important}
[data-slot=slider] [data-slot=slider-track]${W}{height:14px;border-radius:999px;outline:0;border:2px solid var(--st-rim-dark);background-color:rgb(0 0 0/.28);box-shadow:inset 0 2px 3px rgb(0 0 0/.35)}
[data-slot=slider-range]{background-image:linear-gradient(180deg,rgb(255 255 255/.5),rgb(255 255 255/.05) 55%,rgb(0 0 0/.18))}
[data-slot=slider] [data-slot=slider-thumb]{width:26px;height:26px;border-radius:50%;background-color:#fff;outline:0;border:2px solid var(--st-rim-dark);background-image:linear-gradient(180deg,#fff 40%,#E9DCC0);box-shadow:0 3px 0 var(--st-rim-dark)}
[data-slot=tabs-trigger][data-active]{font-family:var(--st-display,inherit)}

[data-slot=asset-pill]${W}{position:relative;height:30px;gap:6px;padding:0 14px 0 4px;margin-left:12px;border-radius:999px;background-color:rgb(16 46 98/.82);background-image:linear-gradient(180deg,rgb(255 255 255/.16),rgb(255 255 255/0) 50%);border:2px solid #0B2350;box-shadow:inset 0 2px 3px rgb(0 0 0/.35),0 2px 0 rgb(255 255 255/.35);color:#fff;font-family:var(--st-display,inherit);font-size:16px;${stroke("#0B2350")}}
[data-slot=asset-pill] [data-slot=icon]{width:30px;height:30px;margin-left:-20px;filter:drop-shadow(0 2px 0 rgb(0 0 0/.35))}

[data-slot=stat-bar] [data-slot=stat-bar-track]{height:16px;border:2px solid ${DARK};border-radius:999px;background-color:#4A2A10;box-shadow:inset 0 3px 3px rgb(0 0 0/.45),0 2px 0 rgb(255 255 255/.4)}
[data-slot=stat-bar-fill]{background-image:linear-gradient(180deg,rgb(255 255 255/.55),rgb(255 255 255/.12) 45%,rgb(0 0 0/0) 55%,rgb(0 0 0/.2));box-shadow:inset 0 -2px 0 rgb(0 0 0/.18)}
:is([data-slot=stat-bar-label],[data-slot=stat-bar-value],[data-slot=skill-button-label],[data-slot=function-button-label],[data-slot=reward-track-meta],[data-slot=item-cell-label],[data-slot=character-card-value]){color:#fff;font-family:var(--st-display,inherit);${stroke(DARK)}}
[data-slot=stat-bar] [data-slot=icon]{width:26px;height:26px;filter:drop-shadow(0 2px 0 rgb(0 0 0/.35))}

[data-slot=skill-button-face]{border-radius:999px}
[data-slot=skill-button-cooldown]{color:#fff;font-family:var(--st-display,inherit);${stroke("#000")}}
[data-slot=function-button-glyph]${W}{--cz:var(--md-sys-color-secondary);${candy};background-color:var(--cz);border-radius:999px}
[data-slot=function-button-value]{padding:0 8px;border-radius:999px;background-color:rgb(40 20 0/.7);color:#fff;font-family:var(--st-display,inherit)}

[data-slot=level-map]${W}{background-color:#7CCB5A;background-image:radial-gradient(circle at 20% 30%,rgb(255 255 255/.18) 0 18%,transparent 19%),radial-gradient(circle at 75% 70%,rgb(255 255 255/.14) 0 22%,transparent 23%),linear-gradient(180deg,#8FD86A,#5DB43C);border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),inset 0 0 18px rgb(0 60 0/.35)}
[data-slot=level-map-line]{stroke:rgb(255 255 255/.75);stroke-width:7px;stroke-dasharray:0 11;stroke-linecap:round}
[data-slot=level-map-line][data-done]{stroke:#FFE066}
[data-slot=level-map-node]${W}{--cz:#2F8FE0;${candy};background-color:var(--cz);color:#fff;font-family:var(--st-display,inherit);border-radius:999px;${stroke("#0B3C70")};outline:0}
[data-slot=level-map-node][data-state=current]${W}{--cz:#F2A007;width:56px;height:56px;font-size:22px;box-shadow:inset 0 2px 0 rgb(255 255 255/.6),inset 0 -3px 0 #B06A00,0 4px 0 #7A4300,0 0 0 5px rgb(255 240 150/.7),0 0 18px 6px rgb(255 230 90/.8);${stroke("#7A4300")}}
[data-slot=level-map-node][data-state=locked]${W}{--cz:#9AA6B2;color:#fff;box-shadow:inset 0 2px 0 rgb(255 255 255/.5),inset 0 -3px 0 #6B7480,0 3px 0 #4A525C}
[data-slot=level-map-stars]{margin-top:-6px;gap:0;filter:drop-shadow(0 1px 0 rgb(0 0 0/.4))}

[data-slot=reward-track-cell]${W}{${tile};font-family:var(--st-display,inherit)}
[data-slot=reward-track-cell][data-ready]${W}{--cz:var(--md-sys-color-primary);${candy};background-color:var(--cz);color:#fff;${stroke("#1E5200")}}
[data-slot=reward-track-track]${W}{height:16px;border:2px solid ${DARK};background-color:#4A2A10;box-shadow:inset 0 3px 3px rgb(0 0 0/.45),0 2px 0 rgb(255 255 255/.4)}
[data-slot=reward-track-fill]{background-color:#FFB21A;background-image:linear-gradient(180deg,rgb(255 255 255/.6),rgb(255 255 255/.15) 45%,rgb(0 0 0/0) 55%,rgb(0 0 0/.18))}

[data-slot=check-in]${W}{padding:0 12px 12px;overflow:hidden}
[data-slot=check-in-title]{margin:0 -12px 4px;padding:8px 12px;text-align:center;background-color:var(--st-bar-bg);background-image:linear-gradient(180deg,rgb(255 255 255/.25),rgb(255 255 255/0) 55%,rgb(0 0 0/.15));box-shadow:inset 0 -3px 0 rgb(0 0 0/.2),0 2px 0 var(--st-rim);color:#fff;font-family:var(--st-display,inherit);font-size:var(--text-title-medium);${stroke("#0B3C70")}}
[data-slot=check-in-cell]${W}{${tile};border-radius:10px;font-family:var(--st-display,inherit)}
[data-slot=check-in-cell][data-state=done]${W}{--cz:var(--md-sys-color-primary);${candy};background-color:var(--cz);border-radius:10px;color:#fff}
[data-slot=check-in-cell][data-state=today]${W}{border-color:#FFB21A;box-shadow:0 0 0 1.5px var(--st-rim-dark),0 3px 0 1.5px var(--st-rim-dark),0 0 10px 3px rgb(255 200 40/.75);color:var(--md-sys-color-tertiary)}

[data-slot=task-bar-title]{font-family:var(--st-display,inherit);font-size:var(--text-title-small)}
[data-slot=item-cell-frame]${W}{${tile};border-radius:14px;background-image:radial-gradient(80% 70% at 50% 35%,#fff,transparent)}
[data-slot=item-cell-value]{right:4px;bottom:1px;color:#fff;font-family:var(--st-display,inherit);font-size:13px;${stroke(DARK)}}
[data-slot=item-cell-badge]{background-color:#E8392B;color:#fff;border:2px solid #fff;box-shadow:0 1px 0 rgb(0 0 0/.35);font-family:var(--st-display,inherit)}
[data-slot=item-cell-tag]{border-radius:12px 0 10px 0;color:#fff;font-family:var(--st-display,inherit);${stroke("rgb(0 0 0/.55)")}}
[data-slot=inventory]${W}{background-color:#3B6FC4;background-image:linear-gradient(180deg,rgb(255 255 255/.14),rgb(0 0 0/.08));border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 2px rgb(0 0 0/.25),inset 0 2px 0 rgb(255 255 255/.4)}
[data-slot=inventory-cell]${W}{background-color:rgb(10 30 80/.45);border:0;border-radius:12px;box-shadow:inset 0 3px 4px rgb(0 0 0/.4),0 1px 0 rgb(255 255 255/.25)}
[data-slot=inventory-cell][data-filled]${W}{${tile};border-radius:12px}

[data-slot=character-card-media]{background-image:radial-gradient(70% 80% at 50% 40%,rgb(255 255 255/.5),transparent 70%)}
[data-slot=character-card-tag]{background-color:#B44BE1;color:#fff;border:2px solid #fff;border-radius:999px;box-shadow:0 2px 0 rgb(0 0 0/.3);font-family:var(--st-display,inherit);${stroke("#4A1066")}}
[data-slot=character-card-level]{background-color:rgb(16 46 98/.85);border:2px solid var(--st-rim);border-radius:999px;color:#fff;font-family:var(--st-display,inherit)}
[data-slot=character-card-track]${W}{height:12px;border:2px solid ${DARK};border-radius:999px;background-color:#4A2A10;box-shadow:inset 0 2px 2px rgb(0 0 0/.4)}
[data-slot=character-card-fill]{background-color:#FFB21A;background-image:linear-gradient(180deg,rgb(255 255 255/.55),rgb(255 255 255/.1) 50%,rgb(0 0 0/.15))}

[data-slot=game-result]{overflow:visible}
[data-slot=game-result-title]{position:relative;margin:-34px -34px 4px;padding:8px 40px 12px;background-color:#E8392B;background-image:linear-gradient(180deg,rgb(255 255 255/.3),rgb(255 255 255/0) 50%,rgb(0 0 0/.18));clip-path:polygon(0 8%,100% 8%,calc(100% - 18px) 54%,100% 100%,0 100%,18px 54%);filter:drop-shadow(0 3px 0 #7A1208);font-size:28px;line-height:1.1}
[data-slot=game-result-stars]{filter:drop-shadow(0 3px 0 rgb(80 40 0/.45))}
[data-slot=game-result-label]{font-family:var(--st-display,inherit);color:var(--md-sys-color-on-surface-variant)}
[data-slot=game-result-cell]${W}{${tile};font-family:var(--st-display,inherit)}

[data-slot=game-board]${W}{background-color:rgb(40 70 150/.82);background-image:linear-gradient(180deg,rgb(255 255 255/.12),rgb(0 0 0/.1));border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 2px rgb(0 0 0/.25)}
[data-slot=game-board-status]{color:#fff;font-family:var(--st-display,inherit);font-size:var(--text-title-medium);${stroke("#0B2350")}}
[data-slot=game-board-grid]{padding:6px;border-radius:14px;background-color:rgb(0 10 40/.45);box-shadow:inset 0 3px 6px rgb(0 0 0/.4)}
[data-slot=game-board-cell]${W}{background-color:rgb(255 255 255/.16);border:0;box-shadow:inset 0 2px 0 rgb(255 255 255/.18),inset 0 -2px 0 rgb(0 0 0/.15);border-radius:10px;color:#fff;font-family:var(--st-display,inherit);font-size:34px}
[data-slot=game-board-cell][data-mark]{${stroke("#7A1208")}}
[data-slot=game-board-cell][aria-pressed=true]${W}{--cz:var(--md-sys-color-secondary-container);${candy};background-color:var(--cz)}
[data-slot=game-board] [data-button][data-variant=text]{color:#FFE066;font-family:var(--st-display,inherit);${stroke("#0B2350")}}

[data-slot=wheel-stage]::before{content:"";position:absolute;inset:-10px;border-radius:50%;background:repeating-conic-gradient(#FFF6B0 0 6deg,#E8392B 6deg 22.5deg);box-shadow:0 0 0 3px ${DARK},0 6px 0 3px rgb(0 0 0/.25),inset 0 0 0 3px #FFC933}
[data-slot=wheel-disc]${W}{--md-sys-color-surface-container-high:#FF8A3D;--md-sys-color-surface-container-low:#FFE27A;border:4px solid #FFC933;box-shadow:inset 0 0 0 2px ${DARK},inset 0 0 26px rgb(120 40 0/.35)}
[data-slot=wheel-label]{filter:drop-shadow(0 2px 0 rgb(0 0 0/.3))}
[data-slot=wheel-label] [data-slot=icon]{width:26px;height:26px}
[data-slot=wheel-pointer]{top:-18px;z-index:2;border-left-width:13px;border-right-width:13px;border-top-width:26px;border-top-color:#E8392B;filter:drop-shadow(0 0 1.5px ${DARK}) drop-shadow(0 3px 0 ${DARK})}
[data-slot=wheel-stage] [data-button]{width:68px;height:68px;padding:0;border-radius:999px;font-size:17px}
[data-slot=grid-wheel-grid]{padding:8px;border-radius:18px;background-color:#E8392B;background-image:radial-gradient(circle,#FFF6B0 0 2.5px,transparent 3px);background-size:22px 22px;background-position:4px 4px;box-shadow:0 0 0 3px ${DARK},0 5px 0 3px rgb(0 0 0/.25),inset 0 0 0 3px #FFC933}
[data-slot=grid-wheel-cell]${W}{${tile};border-radius:12px;font-family:var(--st-display,inherit)}
[data-slot=grid-wheel-cell][data-lit]${W}{--cz:#FFC21A;${candy};background-color:var(--cz);color:${DARK};box-shadow:0 0 0 2px #fff,0 0 16px 6px rgb(255 240 120/.9)}
[data-slot=grid-wheel-grid] [data-button]{border-radius:12px;font-size:18px}
[data-slot=gacha-globe]${W}{position:relative;background-color:rgb(200 236 255/.55);background-image:radial-gradient(60% 50% at 32% 24%,rgb(255 255 255/.85),rgb(255 255 255/0) 60%);border:4px solid #fff;box-shadow:0 0 0 3px ${DARK},inset 0 -10px 20px rgb(30 80 160/.3),0 8px 0 -2px #E8392B,0 8px 0 1px ${DARK}}
[data-slot=gacha-ball]{background-image:radial-gradient(circle at 34% 30%,rgb(255 255 255/.9) 0 14%,rgb(255 255 255/0) 42%),linear-gradient(180deg,transparent 48%,rgb(0 0 0/.18) 52%);box-shadow:inset 0 -2px 3px rgb(0 0 0/.25),0 1px 0 rgb(0 0 0/.25)}
[data-slot=gacha-ball][class~="bg-primary-container"]{background-color:#FF5A5A}
[data-slot=gacha-ball][class~="bg-secondary-container"]{background-color:#3FA9F5}
[data-slot=gacha-ball][class~="bg-tertiary-container"]{background-color:#FFD23F}
[data-slot=slot-machine-frame]${W}{padding:12px;background-color:#C8241A;background-image:linear-gradient(180deg,rgb(255 255 255/.25),rgb(255 255 255/0) 40%,rgb(0 0 0/.2));border:4px solid #FFC933;border-radius:20px;box-shadow:0 0 0 3px ${DARK},0 6px 0 3px rgb(0 0 0/.25),inset 0 0 0 2px rgb(0 0 0/.25)}
[data-slot=slot-machine-reel]{border-radius:10px;background-color:#fff;background-image:linear-gradient(180deg,rgb(0 0 0/.3),rgb(0 0 0/0) 26%,rgb(0 0 0/0) 74%,rgb(0 0 0/.3));box-shadow:inset 0 0 0 2px ${DARK}}
[data-slot=money-tree-media]{filter:drop-shadow(0 4px 0 rgb(0 0 0/.2))}
[data-slot=egg-smash-title]{color:#fff;font-family:var(--st-display,inherit);font-size:var(--text-title-medium);${stroke(DARK)}}
[data-slot=egg-smash-egg]${W}{background-color:#FFC21A;background-image:radial-gradient(40% 30% at 36% 28%,rgb(255 255 255/.9),rgb(255 255 255/0)),radial-gradient(90% 80% at 60% 75%,rgb(200 110 0/.55),transparent 70%);box-shadow:0 0 0 2.5px ${DARK},0 5px 0 rgb(0 0 0/.25)}
[data-slot=egg-smash-egg][data-state=broken]${W}{background-color:#B7A27A;background-image:none;opacity:.7}
[data-slot=draw-result]{color:#fff;font-family:var(--st-display,inherit);${stroke(DARK)}}

[data-slot=joystick]${W}{background-color:rgb(16 46 98/.45);background-image:radial-gradient(circle,transparent 54%,rgb(255 255 255/.25) 55% 58%,transparent 59%);border:4px solid rgb(255 255 255/.85);box-shadow:0 0 0 2px rgb(11 35 80/.6),inset 0 4px 10px rgb(0 0 0/.3)}
[data-slot=joystick-handle]{background-color:#fff;background-image:radial-gradient(60% 50% at 40% 30%,#fff,#D8E6F5);border:2px solid #0B2350;box-shadow:0 4px 0 #0B2350,0 6px 8px rgb(0 0 0/.3)}
[data-slot=joystick-dot]{display:none}
[data-slot=side-tabs-item][data-active]{--cz:var(--md-sys-color-secondary-container);${candy};background-color:var(--cz);color:#fff;${stroke("#7A4300")}}
`;

export default definePack({
  key: "casual",
  name: say("消除休闲", "Casual match-3", "カジュアルパズル", "캐주얼 퍼즐"),
  hint: say("像 Royal Match、Candy Crush、皇室战争：光泽按钮、厚金边、白字描边", "Like Royal Match, Candy Crush, Clash Royale: glossy buttons, thick gold rims, outlined white words", "Royal Match や Candy Crush のように光沢と金の縁", "Royal Match, Candy Crush처럼 광택과 금테"),
  refs: ["Royal Match", "Candy Crush", "Monopoly GO", "Clash Royale", "Coin Master"],
  basis: "sampled",
  group: "mobileGame",
  seed: "#3E9B14",
  mode: "light",
  light: roles({ p: ["#3E9B14", "#FFFFFF"], pc: ["#D8F5B8", "#1E5200"], s: ["#2177D0", "#FFFFFF"], sc: ["#F59E0B", "#FFFFFF"], t: ["#C76A00", "#FFFFFF"], tc: ["#FFF4D6", "#5A3A05"], bg: ["#BFE6FF", "#FFF8E7", "#FFF4D6", "#FBE9BE", "#F5DFA8"], text: ["#3A2208", "#5E4019"], line: ["#8A5A1E", "#D9A94A"] }),
  dark: roles({ p: ["#3E9B14", "#FFFFFF"], pc: ["#1E5200", "#D8F5B8"], s: ["#6FB4F2", "#04203F"], sc: ["#F59E0B", "#FFFFFF"], t: ["#FFC933", "#2B1D00"], tc: ["#4A3A1E", "#FFF4D6"], bg: ["#12305F", "#1C3F78", "#1C3F78", "#264D8F", "#2C568F"], text: ["#FFFFFF", "#D6E4FF"], line: ["#7C9CD1", "#3A5C9C"] }),
  loud: ["primary", "secondaryContainer", "tertiary"],
  shape: "full",
  font: "lilita",
  display: "lilita",
  icons: "emoji",
  motion: "expressive",
  control: "large",
  pill: "round",
  edge: 3,
  screen: "linear-gradient(#7CC8FF, #D6F0FF)",
  screenDark: "linear-gradient(#0E2A5A, #1C3F78)",
  tokens: { rim: "#FFC933", rimDark: "#8A4B00", stroke: "#4A2A00", navBg: "#1763B8", navActive: "#4DA3F0", barBg: "#1763B8", onBar: "#FFFFFF", toggleOn: "#3E9B14", primaryText: "#2E7A0E", primaryTextDark: "#8FE05A" },
  recipes: { button: "gloss", surface: "chunk", tabs: "boxed", toggle: "chunky", slider: "block", nav: "gamebar", field: "hard", bar: "hud", meter: "jelly", feedback: "press", list: "tile", dialog: "game", card: "framed", segmented: "block", appbar: "center", search: "filled", progress: "jelly", divider: "fade", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", icon: "emboss", text: "outlined", scroll: "hidden" },
  art: "bright cartoon 3D render, saturated candy colors, glossy shiny objects, soft rounded shapes, a kingdom or toy-box world",
  ux: { margin: 12, gap: 12, tight: 8, nav: "bottom" },
  layout: { zh: "顶部一排奶油色胶囊显示金币、生命、星星；中间整屏场景图；两个大光泽按钮贴在底部标签栏上方；底栏选中项抬高变亮。", en: "A row of cream capsules for coins, lives and stars on top; a full-screen scene in the middle; two big glossy buttons just above the bottom bar, whose chosen tab rises and brightens." },
  type: CHUNKY_RAMP,
  css: CSS,
});
