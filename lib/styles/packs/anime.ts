import { BUTTONS, MENUS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* looked at in Genshin's and Star Rail's menus on Interface In Game; the cream and slate are common knowledge among players */

/* The panels recipe also dresses any rounded box filled with a container color, and weighs as much as three attributes
 * doing it; a part named here is meant over that, so its rule carries the weight of an id that nothing has. */
const W = ":not(#_)";
const GOLD = "var(--st-rim)";
/** a hairline of pale gold, and a fainter one a few pixels inside it: the frame of every menu */
const frame = `border:1px solid ${mix("primary-container", 70)};outline:1px solid ${mix("primary-container", 22)};outline-offset:-5px`;
/** a panel: slate, a little see-through, softly lit from the top */
const panel = `background-color:${mix("surface-container-low", 92)};background-image:linear-gradient(180deg,rgb(255 255 255/.05),rgb(255 255 255/0) 40%);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);${frame};box-shadow:0 6px 24px rgb(0 0 0/.35)`;
/** an item's card: the rarity's glow behind the icon and a cream band at its foot. Five stars by default */
const card = (top: string, bottom: string) =>
  `background-color:${bottom};background-image:linear-gradient(180deg,transparent 76%,#E9E5DC 76%),linear-gradient(160deg,${top},${bottom});border:0;outline:0;box-shadow:0 2px 6px rgb(0 0 0/.35);border-radius:6px 6px 18px 6px`;
const GOLDEN = card("#9C6A35", "#D8A148");
const PURPLE = card("#5E4E8C", "#A884D0");
/** The round mark in front of an action: a yellow ring in a dark disc is Genshin's "confirm", a pale blue cross its
 *  "cancel". Drawn after the words and ordered before them, since a button's ::before is its state layer. */
const MARK = `flex:none;order:-1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:-8px;border-radius:50%;background-color:#3B4255`;
const RING = `content:"";${MARK};box-shadow:inset 0 0 0 4px #3B4255,inset 0 0 0 7px #F5C04A`;
const CROSS = `content:"✕";${MARK};background-color:#2A3042;color:#7FC4F0;font-size:12px;font-weight:700;line-height:1`;

const CSS = `
:is(${BUTTONS}){border:0;box-shadow:inset 0 0 0 2px ${role("primary")},inset 0 0 0 3px ${mix("on-primary", 22)},0 2px 8px rgb(0 0 0/.3)}
:is(${BUTTONS}):is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${role("secondary-container")};color:${role("on-secondary-container")};box-shadow:inset 0 0 0 1px ${mix("primary-container", 55)},0 2px 8px rgb(0 0 0/.3)}
[data-button]:is([data-variant=filled],[data-variant=default]):not([data-size^=icon]):not(:has([data-slot=icon]))::after{${RING}}
:is([data-slot=alert-dialog-cancel],[data-slot=dialog-close]:not([data-size^=icon]))[data-button]{background-color:#3B4255;color:#ECE5D8;box-shadow:inset 0 0 0 1px ${mix("primary-container", 55)},0 2px 8px rgb(0 0 0/.3);padding-inline:20px}
:is([data-slot=alert-dialog-cancel],[data-slot=dialog-close][data-tap=dismiss])[data-button]::after{${CROSS}}
[data-slot=dialog-close][data-tap=confirm][data-button]{background-color:${role("primary")};color:${role("on-primary")};box-shadow:inset 0 0 0 2px ${role("primary")},inset 0 0 0 3px ${mix("on-primary", 22)},0 2px 8px rgb(0 0 0/.3)}
[data-slot=dialog-close][data-tap=confirm][data-button]::after{${RING}}
[data-button][data-size^=icon]:is([data-variant=filled],[data-variant=default],[data-variant=tonal],[data-variant=secondary]){border-radius:50%;box-shadow:inset 0 0 0 1px ${mix("primary-container", 55)}}
:is([data-slot=dialog-close],[data-slot=sheet-close])[data-size^=icon]{border-radius:50%;background-color:${role("primary")};color:${role("on-primary")};box-shadow:0 0 0 1px ${mix("primary-container", 60)},0 2px 6px rgb(0 0 0/.35)}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=sheet-content],[data-slot=popover-content],[data-slot=card])${W}{${panel}}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content])${W}{border-radius:14px}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){padding-bottom:10px;background-image:linear-gradient(90deg,transparent,${mix("primary-container", 80)} 25%,${mix("primary-container", 80)} 75%,transparent);background-size:100% 1px;background-position:bottom;background-repeat:no-repeat;letter-spacing:.06em}
:is(${MENUS})${W}{${panel};border-radius:10px}
:is([data-slot=text-field-box],[data-slot=input],[data-slot=select-trigger],[data-slot=textarea],[data-slot=native-select],[data-slot=input-group],[data-surface=field]){border-radius:8px;background-color:${mix("surface-container-lowest", 70)};box-shadow:inset 0 0 0 1px ${mix("on-surface", 16)}}
[data-slot=tooltip-content]{${frame};background-color:${mix("surface-container-low", 94)};border-radius:6px}
[data-slot=snackbar]${W}{background-color:transparent;background-image:linear-gradient(90deg,transparent,rgb(0 0 0/.62) 18%,rgb(0 0 0/.62) 82%,transparent);border:0;border-radius:0;box-shadow:none;color:#ECE5D8;justify-content:center;text-align:center}
[data-slot=snackbar-text]{flex:1;text-align:center}
[data-slot=skeleton]${W}{border:0;outline:0;box-shadow:none}

[data-slot=rating-star]{color:${mix("on-surface", 22)}}
[data-slot=rating-star][data-on]{color:${role("tertiary")};text-shadow:0 0 6px rgb(255 200 80/.5)}
[data-slot=checkbox]{border-radius:4px;border:1.5px solid ${mix("on-surface", 70)};background-color:transparent}
[data-slot=checkbox][data-checked]{background-color:${role("primary")};border-color:${role("primary")};color:${role("on-primary")}}
[data-slot=radio-group-item]{border:1.5px solid ${mix("on-surface", 70)}}
[data-slot=radio-group-indicator]{background-color:${GOLD}}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip])${W}{border:1px solid ${mix("primary-container", 55)};background-color:${mix("surface-container-high", 70)};border-radius:999px}
[data-slot=filter-chip][data-pressed]${W}{background-color:${role("primary")};color:${role("on-primary")};border-color:${role("primary")}}
[data-slot=filter-chip][data-pressed] [data-slot=chip-leading]{color:${role("on-primary")}}
[data-slot=tabs-list] [data-slot=tabs-indicator]{background-color:${role("primary")};box-shadow:inset 0 0 0 2px ${role("primary")},inset 0 0 0 3px ${mix("on-primary", 20)}}
[data-slot=tabs-trigger][data-active]{color:${role("on-primary")}}
[data-slot=side-tabs]${W}{background-color:transparent;border:0;outline:0;box-shadow:none}
[data-slot=side-tabs-item]{border-radius:999px;color:${role("on-surface-variant")}}
[data-slot=side-tabs-item][data-active]${W}{background-color:${role("primary")};color:${role("on-primary")};box-shadow:inset 0 0 0 2px ${role("primary")},inset 0 0 0 3px ${mix("on-primary", 20)}}

[data-slot=asset-pill]${W}{height:32px;gap:8px;padding:0 14px 0 3px;border-radius:999px;background-color:rgb(20 24 36/.62);border:1px solid rgb(255 255 255/.14);outline:0;box-shadow:none;color:#ECE5D8;font-weight:600}
[data-slot=asset-pill] [data-slot=icon]{width:26px;height:26px;padding:4px;border-radius:50%;background-color:#3B4255;box-shadow:inset 0 0 0 1px ${GOLD};color:#F5C04A}
[data-slot=stat-bar] [data-slot=stat-bar-track]{height:6px;border-radius:3px;outline:0;background-color:rgb(0 0 0/.45);box-shadow:0 0 0 1px rgb(255 255 255/.18)}
[data-slot=stat-bar-fill]{border-radius:3px;background-image:linear-gradient(180deg,rgb(255 255 255/.35),rgb(255 255 255/0))}
[data-slot=skill-button-face]{background-color:rgb(20 24 36/.55);color:#ECE5D8;box-shadow:inset 0 0 0 2px rgb(255 255 255/.8),inset 0 0 0 4px rgb(0 0 0/.25),0 0 10px rgb(0 0 0/.35)}
[data-slot=skill-button-cooldown]{color:#fff;font-weight:600}
[data-slot=function-button-glyph]${W}{background-color:rgb(20 24 36/.62);color:#ECE5D8;box-shadow:inset 0 0 0 1px ${mix("primary-container", 70)},0 2px 6px rgb(0 0 0/.35)}
[data-slot=function-button-value]{color:${role("secondary")}}

[data-slot=level-map]${W}{${panel}}
[data-slot=level-map-line]{stroke:${mix("on-surface", 18)};stroke-width:2px}
[data-slot=level-map-line][data-done]{stroke:${GOLD}}
[data-slot=level-map-cell]${W}{background-color:${role("surface-container")};color:${role("secondary")};box-shadow:inset 0 0 0 1px ${GOLD},0 0 0 3px ${mix("surface-container-low", 90)},0 0 0 4px ${mix("primary-container", 35)};outline:0;font-weight:600}
[data-slot=level-map-cell][data-current]${W}{background-color:${role("primary")};color:${role("on-primary")};box-shadow:inset 0 0 0 2px ${role("primary")},inset 0 0 0 3px ${mix("on-primary", 25)},0 0 0 4px ${mix("primary-container", 45)},0 0 16px 4px rgb(245 192 74/.45)}
[data-slot=level-map-cell][data-locked]${W}{background-color:${mix("surface-container-low", 80)};color:${role("on-surface-variant")};box-shadow:inset 0 0 0 1px ${mix("on-surface", 18)}}
[data-slot=level-map-stars]{color:${role("tertiary")}}

[data-slot=reward-track-cell]${W}{${PURPLE};color:#3B4255;font-weight:600}
[data-slot=reward-track-cell][data-ready]${W}{${GOLDEN};box-shadow:0 0 0 1.5px #F5C04A,0 0 12px rgb(245 192 74/.55)}
[data-slot=reward-track-cell] [data-slot=icon]{color:#fff;filter:drop-shadow(0 1px 2px rgb(0 0 0/.4))}
[data-slot=reward-track-track]${W}{height:4px;border-radius:2px;outline:0;background-color:rgb(0 0 0/.4);box-shadow:0 0 0 1px rgb(255 255 255/.12)}
[data-slot=reward-track-fill]{background-color:${GOLD};background-image:linear-gradient(90deg,#B98E4E,#F5D58E);box-shadow:0 0 6px rgb(245 192 74/.6)}
[data-slot=reward-track-meta]{color:${role("on-surface-variant")}}
[data-slot=check-in]${W}{${panel}}
[data-slot=check-in-title]{letter-spacing:.06em;padding-bottom:8px;background-image:linear-gradient(90deg,${mix("primary-container", 80)},transparent);background-size:100% 1px;background-position:bottom;background-repeat:no-repeat}
[data-slot=check-in-cell]${W}{border-radius:6px 6px 12px 6px;background-color:${mix("surface-container-high", 80)};color:${role("on-surface")};box-shadow:inset 0 0 0 1px ${mix("on-surface", 12)}}
[data-slot=check-in-cell][data-state=done]${W}{background-color:${mix("primary-container", 35)};color:${role("secondary")};box-shadow:inset 0 0 0 1px ${mix("primary-container", 60)}}
[data-slot=check-in-cell][data-state=today]${W}{background-color:${role("primary")};color:${role("on-primary")};border:0;box-shadow:0 0 0 1.5px #F5C04A,0 0 10px rgb(245 192 74/.5)}
[data-slot=task-bar]${W}{${panel};border-radius:10px}
[data-slot=item-cell-frame]${W}{${GOLDEN}}
[data-slot=item-cell-frame] [data-slot=icon]{margin-bottom:22%;color:#fff;filter:drop-shadow(0 2px 3px rgb(0 0 0/.4))}
[data-slot=item-cell-value]{left:0;right:0;bottom:1px;text-align:center;color:#4F566B;font-weight:600}
[data-slot=item-cell-badge]{background-color:#E25A4A;color:#fff;border:0;box-shadow:0 0 0 1.5px #ECE5D8}
[data-slot=item-cell-tag]{border-radius:6px 0 6px 0;color:#fff}
[data-slot=inventory]${W}{${panel}}
[data-slot=inventory-cell]${W}{border-radius:6px 6px 18px 6px;background-color:${mix("on-surface", 4)};box-shadow:inset 0 0 0 1px ${mix("on-surface", 14)}}
[data-slot=inventory-cell][data-filled]${W}{${PURPLE}}
[data-slot=inventory-cell][data-filled] [data-slot=icon]{margin-bottom:22%;color:#fff}

[data-slot=character-card]${W}{${panel};border-radius:12px}
[data-slot=character-card-media]{background-image:linear-gradient(170deg,#9C6A35,#D8A148)}
[data-slot=character-card-media] [data-slot=icon]{color:#FFF4DC}
[data-slot=character-card-tag]{background-color:transparent;color:#FFCC4D;letter-spacing:.1em;text-shadow:0 1px 3px rgb(0 0 0/.6);font-weight:700}
[data-slot=character-card-level]{background-color:rgb(20 24 36/.6);color:#ECE5D8;border-radius:999px}
[data-slot=character-card-subtitle]{color:${role("secondary")}}
[data-slot=character-card-track]${W}{height:4px;outline:0;background-color:rgb(0 0 0/.4);box-shadow:none}
[data-slot=character-card-fill]{background-color:${GOLD}}

[data-slot=game-result]${W}{${panel};border-radius:14px}
[data-slot=game-result-title]{align-self:stretch;color:${role("tertiary")};letter-spacing:.2em;background-image:linear-gradient(90deg,transparent,${mix("primary-container", 90)} 12%,transparent 30%,transparent 70%,${mix("primary-container", 90)} 88%,transparent);background-size:100% 1px;background-position:center;background-repeat:no-repeat;text-shadow:0 0 12px rgb(245 192 74/.45)}
[data-slot=game-result-stars]{color:${role("tertiary")};filter:drop-shadow(0 0 6px rgb(255 200 80/.5))}
[data-slot=game-result-cell]${W}{${PURPLE};color:#3B4255;padding-bottom:4px}
[data-slot=game-result-cell] [data-slot=icon]{color:#fff;margin-bottom:6px}

[data-slot=game-board]${W}{${panel}}
[data-slot=game-board-grid]{gap:6px}
[data-slot=game-board-cell]${W}{border-radius:6px;background-color:${mix("on-surface", 4)};color:${role("secondary")};box-shadow:inset 0 0 0 1px ${mix("primary-container", 35)}}
[data-slot=game-board-cell][data-mark]${W}{background-color:${mix("primary-container", 16)};text-shadow:0 0 10px rgb(245 192 74/.6)}
[data-slot=game-board-cell][aria-pressed=true]${W}{background-color:${role("primary")};color:${role("on-primary")}}

[data-slot=wheel-track]${W}{--md-sys-color-surface-container-high:#2A3042;--md-sys-color-surface-container-low:#3B4255;border:1px solid ${GOLD};box-shadow:0 0 0 5px rgb(20 24 36/.85),0 0 0 6px ${mix("primary-container", 60)},0 0 24px rgb(245 192 74/.25)}
[data-slot=wheel-label]{color:#ECE5D8}
[data-slot=wheel-indicator]{top:-10px;z-index:2;border-top-color:${GOLD};filter:drop-shadow(0 0 4px rgb(245 192 74/.6))}
[data-slot=grid-wheel-cell]${W}{${PURPLE};color:#3B4255}
[data-slot=grid-wheel-cell] [data-slot=icon]{color:#fff}
[data-slot=grid-wheel-cell][data-lit]${W}{${GOLDEN};box-shadow:0 0 0 1.5px #F5C04A,0 0 14px rgb(245 192 74/.7)}
[data-slot=gacha-media]${W}{background-color:#1B1E3A;background-image:radial-gradient(circle at 50% 45%,rgb(160 120 230/.55),rgb(60 70 150/.35) 45%,transparent 70%),radial-gradient(circle at 30% 25%,rgb(255 255 255/.5) 0 2%,transparent 3%),radial-gradient(circle at 70% 65%,rgb(255 255 255/.4) 0 1.5%,transparent 2.5%);box-shadow:inset 0 0 0 1px ${GOLD},0 0 0 6px rgb(20 24 36/.8),0 0 0 7px ${mix("primary-container", 50)},0 0 30px rgb(160 120 230/.35)}
[data-slot=gacha-dot]{border-radius:30% 30% 50% 30%;rotate:45deg;scale:.62}
[data-slot=gacha-dot][class~="bg-primary-container"]{background-color:#F5C04A;box-shadow:0 0 8px #F5C04A}
[data-slot=gacha-dot][class~="bg-secondary-container"]{background-color:#B48EEA;box-shadow:0 0 8px #B48EEA}
[data-slot=gacha-dot][class~="bg-tertiary-container"]{background-color:#7FB6F0;box-shadow:0 0 8px #7FB6F0}
[data-slot=slot-machine-track]${W}{${panel}}
[data-slot=slot-machine-cell]{background-color:${mix("on-surface", 5)};box-shadow:inset 0 0 0 1px ${mix("primary-container", 40)};color:${role("on-surface")}}
[data-slot=egg-smash-item]${W}{background-color:#8E7CC3;background-image:radial-gradient(40% 30% at 36% 28%,rgb(255 255 255/.7),rgb(255 255 255/0)),radial-gradient(80% 80% at 60% 75%,rgb(40 30 90/.5),transparent 70%);box-shadow:inset 0 0 0 1px ${GOLD},0 0 14px rgb(160 120 230/.4)}
[data-slot=egg-smash-item][data-state=broken]${W}{background-color:${role("surface-container")};background-image:none;box-shadow:inset 0 0 0 1px ${mix("on-surface", 18)}}
[data-slot=draw-result]{color:${role("secondary")}}
[data-slot=joystick]${W}{background-color:rgb(255 255 255/.06);border:2px solid rgb(255 255 255/.45);box-shadow:none;outline:0}
[data-slot=joystick-handle]{background-color:rgb(255 255 255/.75);box-shadow:0 0 10px rgb(255 255 255/.3)}
[data-slot=joystick-dot]{display:none}
`;

export default definePack({
  key: "anime",
  name: say("原神 / 星穹铁道", "Genshin / Star Rail", "原神 / スターレイル", "원신 / 스타레일"),
  hint: say("二次元开放世界：石板蓝半透明面板、米白胶囊按钮、淡金细线", "Anime open world: translucent slate panels, cream capsules, pale gold lines", "スレート色のパネルとクリーム色のカプセル", "슬레이트 패널과 크림색 캡슐"),
  refs: ["Genshin Impact", "Honkai: Star Rail"],
  basis: "observed",
  group: "mobileGame",
  seed: "#3B4255",
  mode: "dark",
  light: roles({ p: ["#3B4255", "#ECE5D8"], pc: ["#D3BC8E", "#2A2418"], s: ["#6E5C30", "#FFFFFF"], sc: ["#E4DCCB", "#3B4255"], t: ["#A8640F", "#FFFFFF"], tc: ["#F6E6C8", "#4A2F05"], bg: ["#ECE5D8", "#F8F4EC", "#F5F0E6", "#E4DCCB", "#DBD2BE"], text: ["#3B4255", "#4F566B"], line: ["#8A7F66", "#CFC5AE"] }),
  dark: roles({ p: ["#ECE5D8", "#3B4255"], pc: ["#D3BC8E", "#2A2418"], s: ["#D3BC8E", "#2A2418"], sc: ["#3B4255", "#ECE5D8"], t: ["#FFB13F", "#2B1800"], tc: ["#4A3A1E", "#FFE8C2"], bg: ["#1E2435", "#2A3042", "#3B4255", "#454C60", "#4F566B"], text: ["#ECE5D8", "#E0DACC"], line: ["#A89A7C", "#5A6175"] }),
  shape: "rounded",
  font: "mrounded",
  icons: "game",
  motion: "standard",
  control: "pill",
  pill: "round",
  screenDark: "radial-gradient(120% 80% at 50% 0%, rgb(90 110 170 / 0.35), transparent 60%), radial-gradient(100% 60% at 50% 100%, rgb(211 188 142 / 0.12), transparent 60%)",
  tokens: { rim: "#D3BC8E", toggleOn: "#D3BC8E", tabOn: "#D3BC8E" },
  recipes: { button: "ring", picker: "rim", surface: "gilt", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim", list: "tile", dialog: "plain", dialogue: "band", segmented: "capsules", appbar: "compact", search: "pill", progress: "thin", divider: "ornament", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", scroll: "thin" },
  art: "anime open-world concept painting, soft cel shading, luminous fantasy sky, gentle blue and gold light",
  ux: { margin: 16, gap: 12, tight: 6, nav: "rail" },
  layout: { zh: "左侧一列分类，选中项是米白胶囊；中间是物品格子；右侧是详情卡和底部的胶囊按钮；右上角圆形关闭。", en: "A column of categories at the left with the chosen one a cream capsule; a grid of items in the middle; a detail card at the right with capsule buttons at its foot; a round close at the upper right." },
  type: { ...TITLES([22, 28, 600, 0], [17, 24, 600, 0], [15, 20, 600, 0]), ...BODIES([15, 22, 500, 0], [14, 20, 500, 0], [12, 16, 500, 0]), ...LABELS([15, 20, 600, 0], [13, 16, 500, 0], [11, 14, 500, 0]) },
  css: CSS,
});
