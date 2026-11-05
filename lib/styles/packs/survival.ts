import { BUTTONS, PRESSES, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* the HUD navy and pale blue read off Whiteout Survival's store screenshots; Last War's bars look the same */

/* The panels recipe also dresses any rounded box filled with a container color, and weighs as much as three attributes
 * doing it; a part named here is meant over that, so its rule carries the weight of an id that nothing has. */
const W = ":not(#_)";
const NAVY = "#24314F";
/** white words outlined in a dark shade: every label on a button or an icon */
const stroke = (c: string) => `text-shadow:-1px -1px 0 ${c},1px -1px 0 ${c},-1px 1px 0 ${c},1px 1px 0 ${c},0 2px 1px ${c}`;
/** the big call to action: a top-lit gradient in two shades, a dark edge, a light line inside, a short drop */
const cta = (hi: string, lo: string, edge: string) =>
  `background-color:${lo};background-image:linear-gradient(180deg,${hi},${lo} 70%);border:1px solid ${edge};box-shadow:inset 0 1px 0 rgb(255 255 255/.6),inset 0 -2px 0 rgb(0 0 0/.18),0 2px 0 ${edge},0 3px 6px rgb(0 0 0/.25);color:#fff;${stroke(edge)}`;
/** the steel plate a popup is: frost white, a blue-grey frame with a dark line outside and a light one inside */
const plate = `background-color:${role("surface-container-low")};background-image:linear-gradient(180deg,rgb(255 255 255/.35),rgb(255 255 255/0) 35%,rgb(20 40 70/.08));border:2px solid #7488AC;box-shadow:inset 0 1px 0 #fff,inset 0 0 0 1px rgb(255 255 255/.7),0 0 0 1px #2B3A57,0 3px 0 rgb(20 30 50/.25)`;
/** the dark strip of the HUD and of a panel's head */
const strip = `background-color:${role("on-surface")};background-image:linear-gradient(180deg,#3A4B70,#24314F);color:#fff`;
/** a slot in a grid, sunk into the plate */
const socket = `background-color:${role("surface-container-highest")};background-image:linear-gradient(180deg,rgb(20 40 70/.14),rgb(20 40 70/0));border:1px solid ${role("outline")};box-shadow:inset 0 2px 3px rgb(30 45 75/.3)`;
/** an item's frame, by rarity: blue is the everyday rare, and the others are the author's own color */
const rare = `background-color:#3E7CC9;background-image:linear-gradient(160deg,#78B4F0,#3069B8 60%,#24538F);border:1px solid #1C3B66;box-shadow:inset 0 0 0 1px rgb(255 255 255/.35),0 2px 0 rgb(20 30 50/.3)`;

const CSS = `
:is(${BUTTONS}){border-radius:6px;${cta("#FFB238", "#EE7F00", "#8A3F00")}}
:is(${BUTTONS}):is([data-variant=tonal],[data-variant=secondary]){${cta("#69B6F7", "#2C74D2", "#123E7A")}}
:is(${BUTTONS}):is([data-variant=outlined],[data-variant=outline],[data-variant=elevated]){${cta("#7BD35E", "#3A9A2A", "#1D5A14")}}
:is(${BUTTONS})[data-variant=destructive]{${cta("#FF7A6A", "#D9372A", "#7A1208")}}
:is(${PRESSES}){translate:0 2px;box-shadow:inset 0 2px 3px rgb(0 0 0/.25),0 0 0 rgb(0 0 0/0)}
[data-button][data-size^=icon]:is([data-variant=filled],[data-variant=default],[data-variant=tonal],[data-variant=secondary]){${cta("#69B6F7", "#2C74D2", "#123E7A")}}
[data-slot=dialog-close][data-size^=icon],[data-slot=sheet-close][data-size^=icon]{color:#fff;background-color:#D9372A;border-radius:6px;box-shadow:inset 0 1px 0 rgb(255 255 255/.5),0 0 0 1px #7A1208}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=card],[data-slot=sheet-content],[data-slot=drawer-popup],[data-slot=side-sheet-content],[data-slot=action-sheet-group],[data-slot=popover-content],[data-slot=hover-card-content],[data-slot=dropdown-menu-content],[data-slot=select-content],[data-slot=context-menu-content],[data-slot=menubar-content])${W}{${plate};border-radius:8px}
:is([data-slot$="-card"],[data-slot=dialogue-box])${W}{border-radius:8px}
[data-slot=sheet-content] [data-slot=sheet-handle]{background-color:#7488AC}
[data-slot=tooltip-content]{${strip};border:1px solid #0F1A2E;border-radius:4px}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){${strip};box-shadow:inset 0 -2px 0 rgb(0 0 0/.25),0 1px 0 #7488AC;font-size:var(--text-title-large);letter-spacing:.04em}
[data-slot=snackbar]${W}{${strip};border:1px solid #0F1A2E;border-radius:4px;box-shadow:0 3px 8px rgb(0 0 0/.3)}
[data-slot=skeleton]${W}{border:0;box-shadow:none}
:is([data-slot=notification-badge],[data-slot=sidebar-menu-badge],[data-slot$="-badge"]){background-color:#E5332A;color:#fff;border:1.5px solid #fff;box-shadow:0 1px 2px rgb(0 0 0/.4)}

[data-slot=rating-star]{color:#A9B7CC;text-shadow:none}
[data-slot=rating-star][data-on]{color:#FFC22E;${stroke("#8A4B00")}}
[data-slot=checkbox]{width:20px;height:20px;border-radius:3px;${socket}}
[data-slot=checkbox][data-checked]{background-color:#3FA34D;background-image:linear-gradient(180deg,#7BD35E,#3A9A2A);border-color:#1D5A14}
[data-slot=radio-group-item]{${socket}}
[data-slot=radio-group-indicator]{background-color:#EE7F00;box-shadow:inset 0 1px 0 rgb(255 255 255/.5)}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip])${W}{border-radius:4px;${socket};color:${role("on-surface")}}
[data-slot=slider] [data-slot=slider-track]${W}{height:10px;border-radius:5px;outline:0;${socket}}
[data-slot=slider-range]{background-image:linear-gradient(180deg,#FFB238,#EE7F00)}
[data-slot=slider] [data-slot=slider-thumb]{width:22px;height:22px;border-radius:50%;outline:0;background-color:#fff;background-image:linear-gradient(180deg,#fff,#C9D6E6);border:1px solid #2B3A57;box-shadow:0 2px 0 rgb(20 30 50/.4)}
[data-slot=tabs-list]{${strip};border-bottom:2px solid #7488AC}
[data-slot=tabs-trigger]{color:rgb(255 255 255/.75)}
[data-slot=tabs-trigger][data-active]{${plate};color:${role("on-surface")};border-bottom:0}

[data-slot=asset-pill]${W}{height:28px;padding:0 12px 0 2px;gap:4px;border-radius:4px;background-color:rgb(20 30 52/.78);border:1px solid rgb(255 255 255/.18);box-shadow:inset 0 1px 0 rgb(255 255 255/.12);color:#fff;font-weight:700;${stroke("#0F1A2E")}}
[data-slot=asset-pill] [data-slot=icon]{width:24px;height:24px;filter:drop-shadow(0 1px 1px rgb(0 0 0/.5))}
[data-slot=stat-bar] [data-slot=stat-bar-track]{height:14px;border-radius:3px;border:1px solid #0F1A2E;background-color:#2B3A57;box-shadow:inset 0 2px 2px rgb(0 0 0/.4)}
[data-slot=stat-bar-fill]{border-radius:2px;background-image:linear-gradient(180deg,rgb(255 255 255/.45),rgb(255 255 255/0) 50%,rgb(0 0 0/.15));-webkit-mask-image:repeating-linear-gradient(90deg,#000 0 10px,transparent 10px 11px);mask-image:repeating-linear-gradient(90deg,#000 0 10px,transparent 10px 11px)}
:is([data-slot=stat-bar-label],[data-slot=stat-bar-value]){font-weight:700;color:${role("on-surface")}}
[data-slot=skill-button-face]${W}{${cta("#69B6F7", "#2C74D2", "#123E7A")};border-radius:50%;border:2px solid #E6EEF7;box-shadow:0 0 0 2px #2B3A57,0 3px 0 2px rgb(20 30 50/.3),inset 0 2px 0 rgb(255 255 255/.5)}
[data-slot=skill-button-cooldown]{color:#fff;font-weight:700;${stroke("#000")}}
:is([data-slot=skill-button-label],[data-slot=function-button-label]){color:#fff;font-weight:700;${stroke(NAVY)}}
[data-slot=function-button-glyph]${W}{background-color:#2E3F63;background-image:radial-gradient(circle at 50% 35%,#4D6699,#24314F 70%);border:2px solid #C9D6E6;box-shadow:0 0 0 1px #0F1A2E,0 3px 4px rgb(0 0 0/.35)}
[data-slot=function-button-value]{padding:0 6px;border-radius:3px;background-color:rgb(20 30 52/.82);color:#7BE35E;font-weight:700}

[data-slot=level-map]${W}{${plate};background-image:radial-gradient(circle at 20% 30%,rgb(255 255 255/.35) 0 10%,transparent 11%),radial-gradient(circle at 80% 75%,rgb(255 255 255/.3) 0 14%,transparent 15%),linear-gradient(180deg,rgb(255 255 255/.3),rgb(20 40 70/.1))}
[data-slot=level-map-line]{stroke:#9DB0CB;stroke-width:5px;stroke-dasharray:8 6}
[data-slot=level-map-line][data-done]{stroke:#EE7F00;stroke-dasharray:none}
[data-slot=level-map-cell]${W}{${cta("#69B6F7", "#2C74D2", "#123E7A")};border-radius:50%;border:2px solid #E6EEF7;box-shadow:0 0 0 2px #123E7A,0 3px 0 2px rgb(20 30 50/.3);font-weight:700;outline:0}
[data-slot=level-map-cell][data-current]${W}{${cta("#FFB238", "#EE7F00", "#8A3F00")};width:56px;height:56px;border:2px solid #FFF3D6;box-shadow:0 0 0 2px #8A3F00,0 0 14px 4px rgb(255 170 40/.7)}
[data-slot=level-map-cell][data-locked]${W}{background-color:#8F9DB3;background-image:linear-gradient(180deg,#B5C0D0,#7F8DA4);color:#fff;border:2px solid #E6EEF7;box-shadow:0 0 0 2px #4A5870;text-shadow:none}
[data-slot=level-map-stars]{filter:drop-shadow(0 1px 0 rgb(0 0 0/.35))}

[data-slot=reward-track-cell]${W}{${socket};border-radius:4px;color:${role("on-surface")};font-weight:700}
[data-slot=reward-track-cell][data-ready]${W}{${rare};color:#fff;${stroke("#123E7A")}}
[data-slot=reward-track-track]${W}{height:10px;border-radius:3px;border:1px solid #0F1A2E;background-color:#2B3A57;box-shadow:inset 0 2px 2px rgb(0 0 0/.4)}
[data-slot=reward-track-fill]{border-radius:2px;background-color:#EE7F00;background-image:linear-gradient(180deg,#FFC45A,#EE7F00)}
[data-slot=reward-track-meta]{font-weight:700;color:${role("on-surface")}}
[data-slot=check-in]${W}{padding:0 10px 10px;overflow:hidden}
[data-slot=check-in-title]{margin:0 -10px 4px;padding:8px 10px;${strip};text-align:center;font-size:var(--text-title-medium);box-shadow:inset 0 -2px 0 rgb(0 0 0/.25)}
[data-slot=check-in-cell]${W}{border-radius:4px;${socket};color:${role("on-surface")};font-weight:700}
[data-slot=check-in-cell][data-state=done]${W}{${cta("#7BD35E", "#3A9A2A", "#1D5A14")};border-radius:4px}
[data-slot=check-in-cell][data-state=today]${W}{${rare};border:2px solid #FFC22E;color:#fff;border-radius:4px}
[data-slot=task-bar]${W}{${plate};border-radius:6px}
[data-slot=task-bar-title]{font-weight:700;color:${role("on-surface")}}
[data-slot=item-cell-frame]${W}{${rare};border-radius:6px}
[data-slot=item-cell-value]{right:3px;bottom:0;color:#fff;font-weight:700;${stroke("#0F1A2E")}}
[data-slot=item-cell-tag]{border-radius:5px 0 6px 0;font-weight:700;color:#fff}
[data-slot=item-cell-label]{color:${role("on-surface")};font-weight:600}
[data-slot=inventory]${W}{${plate}}
[data-slot=inventory-cell]${W}{border-radius:6px;${socket}}
[data-slot=inventory-cell][data-filled]${W}{${rare}}

[data-slot=character-card-media]{background-image:linear-gradient(180deg,rgb(255 255 255/0) 50%,rgb(20 30 52/.55))}
[data-slot=character-card-tag]{background-color:#F0A500;background-image:linear-gradient(180deg,#FFD15A,#E08A00);color:#fff;border:1px solid #7A4300;border-radius:3px;${stroke("#7A4300")};font-weight:800}
[data-slot=character-card-level]{${strip};border-radius:3px;font-weight:700}
[data-slot=character-card-track]${W}{height:8px;border-radius:2px;border:1px solid #0F1A2E;background-color:#2B3A57}
[data-slot=character-card-fill]{border-radius:1px;background-color:#3FA34D;background-image:linear-gradient(180deg,#7BD35E,#3A9A2A)}

[data-slot=game-result]${W}{${plate};padding-top:0;overflow:hidden}
[data-slot=game-result-title]{align-self:stretch;margin:0 -20px 2px;padding:10px 20px;${strip};box-shadow:inset 0 -2px 0 rgb(0 0 0/.25)}
[data-slot=game-result-label]{color:#3F5275;font-weight:700}
[data-slot=game-result-cell]${W}{${rare};color:#fff;${stroke("#123E7A")}}

[data-slot=game-board]${W}{${plate}}
[data-slot=game-board-title]{font-weight:700;color:${role("on-surface")}}
[data-slot=game-board-grid]{padding:4px;border-radius:6px;background-color:#2B3A57;box-shadow:inset 0 2px 4px rgb(0 0 0/.4)}
[data-slot=game-board-cell]${W}{border-radius:4px;${socket};color:${role("on-surface")};font-weight:800;font-size:32px}
[data-slot=game-board-cell][data-mark]${W}{${rare};color:#fff;${stroke("#123E7A")}}
[data-slot=game-board-cell][data-mark=O]${W}{${cta("#FFB238", "#EE7F00", "#8A3F00")}}
[data-slot=game-board-cell][aria-pressed=true]${W}{${cta("#7BD35E", "#3A9A2A", "#1D5A14")}}

[data-slot=wheel-track]${W}{--md-sys-color-surface-container-high:#3E7CC9;--md-sys-color-surface-container-low:#E6EEF7;border:6px solid #2B3A57;box-shadow:0 0 0 2px #C9D6E6,0 0 0 4px #2B3A57,0 4px 8px 4px rgb(20 30 50/.3),inset 0 0 18px rgb(20 30 50/.35)}
[data-slot=wheel-label] [data-slot=icon]{width:24px;height:24px;filter:drop-shadow(0 1px 1px rgb(0 0 0/.4))}
[data-slot=wheel-indicator]{top:-12px;z-index:2;border-left-width:11px;border-right-width:11px;border-top-width:22px;border-top-color:#EE7F00;filter:drop-shadow(0 2px 0 #8A3F00)}
[data-slot=wheel-stage] [data-button]{width:62px;height:62px;padding:0;border-radius:50%;border:2px solid #FFF3D6;box-shadow:0 0 0 2px #8A3F00,0 3px 6px rgb(0 0 0/.35)}
[data-slot=grid-wheel-grid]{padding:6px;border-radius:6px;${strip};box-shadow:0 0 0 1px #0F1A2E,inset 0 1px 0 rgb(255 255 255/.15)}
[data-slot=grid-wheel-cell]${W}{border-radius:4px;${plate};color:${role("on-surface")};font-weight:700;box-shadow:inset 0 1px 0 #fff}
[data-slot=grid-wheel-cell][data-lit]${W}{${cta("#FFB238", "#EE7F00", "#8A3F00")};box-shadow:0 0 0 2px #FFF3D6,0 0 12px 4px rgb(255 170 40/.8)}
[data-slot=grid-wheel-grid] [data-button]{border-radius:4px}
[data-slot=gacha-media]${W}{background-color:rgb(215 235 250/.7);background-image:radial-gradient(60% 50% at 32% 24%,rgb(255 255 255/.9),rgb(255 255 255/0) 60%);border:3px solid #7488AC;box-shadow:0 0 0 2px #2B3A57,inset 0 -10px 18px rgb(40 80 140/.3),0 7px 0 -1px #2B3A57}
[data-slot=gacha-dot]{background-image:radial-gradient(circle at 34% 30%,rgb(255 255 255/.85) 0 14%,rgb(255 255 255/0) 42%);box-shadow:inset 0 -2px 3px rgb(0 0 0/.25)}
[data-slot=gacha-dot][class~="bg-primary-container"]{background-color:#EE7F00}
[data-slot=gacha-dot][class~="bg-secondary-container"]{background-color:#3E7CC9}
[data-slot=gacha-dot][class~="bg-tertiary-container"]{background-color:#3FA34D}
[data-slot=slot-machine-track]${W}{${strip};border-radius:6px;border:2px solid #7488AC;box-shadow:0 0 0 1px #0F1A2E,0 3px 0 rgb(20 30 50/.3)}
[data-slot=slot-machine-cell]{border-radius:4px;background-color:#F8FBFE;background-image:linear-gradient(180deg,rgb(20 30 50/.3),rgb(20 30 50/0) 28%,rgb(20 30 50/0) 72%,rgb(20 30 50/.3));box-shadow:inset 0 0 0 1px #2B3A57;color:${role("on-surface")}}
[data-slot=egg-smash-title]{font-weight:700;color:${role("on-surface")};font-size:var(--text-title-medium)}
[data-slot=egg-smash-item]${W}{background-color:#FFC22E;background-image:radial-gradient(40% 30% at 36% 28%,rgb(255 255 255/.9),rgb(255 255 255/0)),radial-gradient(90% 80% at 62% 78%,rgb(160 90 0/.5),transparent 70%);box-shadow:0 0 0 2px #8A4B00,0 4px 6px rgb(20 30 50/.3)}
[data-slot=egg-smash-item][data-state=broken]${W}{background-color:#A9B7CC;background-image:none}
[data-slot=draw-result]{font-weight:700;color:var(--st-primary-text)}
[data-slot=joystick]${W}{background-color:rgb(36 49 79/.45);border:3px solid rgb(255 255 255/.7);box-shadow:0 0 0 1px rgb(15 26 46/.5),inset 0 3px 8px rgb(0 0 0/.3)}
[data-slot=joystick-handle]{background-color:#F8FBFE;background-image:linear-gradient(180deg,#fff,#C9D6E6);border:2px solid #2B3A57;box-shadow:0 3px 0 #2B3A57}
[data-slot=joystick-dot]{display:none}
[data-slot=side-tabs]${W}{${strip};border:1px solid #0F1A2E}
[data-slot=side-tabs-item]{color:rgb(255 255 255/.8);border-radius:4px}
[data-slot=side-tabs-item][data-active]${W}{${cta("#FFB238", "#EE7F00", "#8A3F00")}}
`;

export default definePack({
  key: "survival",
  name: say("冰雪策略", "Survival strategy", "サバイバル戦略", "생존 전략"),
  hint: say("像寒霜启示录、Last War：深蓝信息条、冰白画面、橙色主按钮", "Like Whiteout Survival, Last War: navy HUD strips, icy white, orange main buttons", "Whiteout Survival のような紺と氷の白", "Whiteout Survival 같은 남색과 얼음빛"),
  refs: ["Whiteout Survival", "Last War", "Kingshot"],
  basis: "sampled",
  group: "mobileGame",
  seed: "#3B5588",
  mode: "light",
  light: roles({ p: ["#F08A00", "#FFFFFF"], pc: ["#FFE3B8", "#5A3000"], s: ["#2F86D6", "#FFFFFF"], sc: ["#3B5588", "#FFFFFF"], t: ["#D08A00", "#2B1800"], tc: ["#D7F0FF", "#0A3A5C"], bg: ["#DDE8F4", "#F7FAFD", "#F1F6FB", "#E6EEF7", "#D5E2EF"], text: ["#1E2A44", "#3F5275"], line: ["#6B7FA3", "#B7C7DE"] }),
  dark: roles({ p: ["#F08A00", "#FFFFFF"], pc: ["#5A3000", "#FFE3B8"], s: ["#6FB8F2", "#04203F"], sc: ["#45629B", "#FFFFFF"], t: ["#FFC94D", "#2B1800"], tc: ["#0A3A5C", "#D7F0FF"], bg: ["#1E2A44", "#2C3E66", "#303F6B", "#354A77", "#3B5588"], text: ["#FFFFFF", "#DCE8F7"], line: ["#8BA3CC", "#4A628F"] }),
  loud: ["primary", "secondary"],
  shape: "rounded",
  font: "barlow",
  display: "barlow",
  icons: "emoji",
  motion: "standard",
  control: "small",
  pill: "round",
  edge: 2,
  screen: "linear-gradient(#EAF2FA, #D5E2EF)",
  screenDark: "linear-gradient(#141D33, #1E2A44)",
  tokens: { rim: "#8FA3C4", rimDark: "#2B3A57", stroke: "#1E2A44", navBg: "#303F6B", navActive: "#4C6AA6", barBg: "#303344", onBar: "#FFFFFF", toggleOn: "#3FA34D", primaryText: "#A85600", primaryTextDark: "#FFB454" },
  recipes: { button: "gloss", surface: "steel", tabs: "boxed", toggle: "chunky", slider: "block", nav: "gamebar", field: "hard", bar: "hud", meter: "block", feedback: "press", list: "tile", dialog: "game", avatar: "framed", card: "framed", segmented: "block", appbar: "center", search: "filled", progress: "jelly", divider: "fade", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", icon: "emboss", scroll: "hidden" },
  art: "stylized semi-realistic strategy game art, frozen wasteland, snow and warm firelight, blue-grey palette with orange highlights",
  ux: { margin: 8, gap: 8, tight: 6, nav: "bottom" },
  layout: { zh: "顶部左边头像和战力，右边一排资源数字；屏幕边缘挂满圆形功能图标；底部一排深蓝入口；操作卡片从下方升起。", en: "An avatar and power at the upper left, a row of resource figures at the right; round feature icons along the edges; a navy row of entries at the foot; action cards rising from below." },
  type: { ...TITLES([22, 26, 700, 0.2], [18, 22, 700, 0.2], [16, 20, 700, 0.2]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 700, 0.2], [14, 18, 600, 0.2], [12, 14, 600, 0.2]) },
  css: CSS,
});
