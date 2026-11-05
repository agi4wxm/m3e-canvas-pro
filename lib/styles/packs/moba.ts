import { BUTTON, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* Wild Rift's menus looked at on Interface In Game; Honor of Kings' store shots share its blue and gold. Its own lobby could not be reached */

/* The panels recipe also dresses any rounded box filled with a container color, and weighs as much as three attributes
 * doing it; a part named here is meant over that, so its rule carries the weight of an id that nothing has. */
const W = ":not(#_)";
const GOLD = "#C8AA6E";
const DEEP = "#785A28";
/** the gold of a frame, lit from above like metal */
const METAL = `linear-gradient(180deg,#F0E6D2,${GOLD} 45%,#A07C3C)`;
/** A box with its corners cut off by n px, a line of a color around it, the diagonals too, over a fill. The straight
 *  edges are an inset line; each cut corner gets a short diagonal of the same color, on the line the corner is cut on. */
const cut = (n: number, line: string, fill: string) => {
  const d = (dir: string) => `linear-gradient(to ${dir},transparent calc(50% - 1.2px),${line} calc(50% - 1.2px) calc(50% + .4px),transparent calc(50% + .4px))`;
  return `clip-path:polygon(${n}px 0,calc(100% - ${n}px) 0,100% ${n}px,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,${n}px 100%,0 calc(100% - ${n}px),0 ${n}px);border:0;border-radius:0;outline:0;background-image:${d("bottom right")},${d("bottom left")},${d("top right")},${d("top left")},${fill};background-size:${n}px ${n}px,${n}px ${n}px,${n}px ${n}px,${n}px ${n}px${",100% 100%".repeat(3)};background-position:top left,top right,bottom left,bottom right${",center".repeat(3)};background-repeat:no-repeat;box-shadow:inset 0 0 0 1px ${line}`;
};
/** the navy a panel is filled with; a role, so the light scheme reads too */
const NAVY_FILL = `linear-gradient(180deg,${role("surface-container-high")},${role("surface")})`;
const BLUE_FILL = "linear-gradient(180deg,#1E5C8A,#0B2A4A)";
/** a navy panel, its corners cut, a gold line round it and a fainter one inside */
const plate = (n: number) => `${cut(n, GOLD, `radial-gradient(120% 80% at 50% 0%,rgb(30 92 138/.35),transparent 70%),${NAVY_FILL}`)};outline:1px solid rgb(200 170 110/.22);outline-offset:-6px`;
/** A diamond drawn in a square: a gold edge, and inside it a fill, one quarter of it in each corner of the box */
const diamond = (edge: string, fill: string) => {
  const q = (dir: string) => `linear-gradient(to ${dir},transparent calc(50% + 1.5px),${fill} calc(50% + 1.5px))`;
  return `clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);border-radius:0;background-color:${edge};background-image:${q("bottom right")},${q("bottom left")},${q("top right")},${q("top left")};background-size:50% 50%;background-position:top left,top right,bottom left,bottom right;background-repeat:no-repeat;box-shadow:none;outline:0`;
};
/** a disc with a ring of gold and a dark line outside it: the skill buttons, the knob */
const disc = (fill: string) => `border-radius:50%;background-color:#0A1F3A;background-image:${fill};box-shadow:0 0 0 2px ${GOLD},0 0 0 4px #0A1428,0 0 0 5px ${DEEP},0 4px 10px rgb(0 0 0/.5)`;
const GILT_WORDS = `background-image:linear-gradient(180deg,#FFF6D8,${GOLD} 60%,${DEEP});-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent`;

const CSS = `
:is(${BUTTON}):is([data-variant=filled],[data-variant=default]){${cut(7, "#FFF3D0", METAL)};color:#1A1408;font-weight:700}
:is(${BUTTON}):not([data-variant=filled],[data-variant=default],[data-variant=destructive]){${cut(7, GOLD, NAVY_FILL)};color:${role("on-surface")}}
:is(${BUTTON})[data-variant=destructive]{${cut(7, "#F08A7A", "linear-gradient(180deg,#8A2A20,#4A0F0A)")};color:#FFE6E0}
[data-button][data-size^=icon]:is([data-variant=filled],[data-variant=default],[data-variant=tonal],[data-variant=secondary]){${cut(6, GOLD, BLUE_FILL)};color:#F0E6D2}
:is([data-slot=dialog-close],[data-slot=sheet-close])[data-size^=icon]{color:${role("primary")}}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=sheet-content],[data-slot=popover-content],[data-slot=card])${W}{${plate(14)}}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title],[data-slot=game-result-title]){padding-inline:36px;background-image:linear-gradient(180deg,#FFF6D8,${GOLD} 60%,${DEEP}),linear-gradient(90deg,transparent,${GOLD}),linear-gradient(90deg,${GOLD},transparent);background-size:100% 100%,28px 1px,28px 1px;background-position:center,left center,right center;background-repeat:no-repeat;-webkit-background-clip:text,border-box,border-box;background-clip:text,border-box,border-box;letter-spacing:.08em}
[data-slot=snackbar]${W}{${cut(8, GOLD, NAVY_FILL)};color:${role("on-surface")}}
[data-slot=tooltip-content]{${cut(5, GOLD, NAVY_FILL)};color:${role("on-surface")}}
:is([data-slot=dropdown-menu-content],[data-slot=select-content],[data-slot=context-menu-content],[data-slot=menubar-content])${W}{${plate(8)}}
[data-slot=skeleton]${W}{border:0;outline:0;box-shadow:none}

[data-slot=rating-star]{color:${mix("on-surface", 18)};text-shadow:none}
[data-slot=rating-star][data-on]{color:${role("tertiary")};text-shadow:0 0 6px rgb(200 170 110/.55)}
[data-slot=checkbox]{border-radius:0;border:1px solid ${GOLD};background-color:rgb(10 20 40/.6)}
[data-slot=checkbox][data-checked]{background-color:${GOLD};background-image:${METAL};color:#1A1408}
[data-slot=radio-group-item]{border:1px solid ${GOLD}}
[data-slot=radio-group-indicator]{background-color:${GOLD};box-shadow:0 0 6px rgb(200 170 110/.7)}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip])${W}{${cut(5, mix("primary", 70), NAVY_FILL)};color:${role("on-surface")}}
[data-slot=side-tabs]${W}{${plate(8)}}
[data-slot=side-tabs-item]{border-radius:0;color:${role("on-surface-variant")}}
[data-slot=side-tabs-item][data-active]${W}{background-color:transparent;background-image:linear-gradient(90deg,rgb(200 170 110/.32),transparent);box-shadow:inset 3px 0 0 ${GOLD};color:${role("on-surface")}}

[data-slot=asset-pill]${W}{height:30px;gap:6px;padding:0 12px 0 8px;${cut(6, mix("primary", 70), NAVY_FILL)};color:${role("on-surface")};font-weight:700}
[data-slot=asset-pill] [data-slot=icon]{color:${role("primary")};width:20px;height:20px}
[data-slot=stat-bar] [data-slot=stat-bar-track]{height:8px;border-radius:0;outline:1px solid ${DEEP};background-color:rgb(0 0 0/.55)}
[data-slot=stat-bar-fill]{border-radius:0;background-image:repeating-linear-gradient(90deg,transparent 0 9px,rgb(0 0 0/.55) 9px 10px),linear-gradient(180deg,rgb(255 255 255/.35),rgb(255 255 255/0) 60%)}
[data-slot=stat-bar-value]{color:${role("on-surface-variant")}}
[data-slot=skill-button-face]{${disc("radial-gradient(circle at 50% 30%,#2A6A9A,#0A1F3A 72%)")};color:#F0E6D2}
[data-slot=skill-button-cooldown]{border-radius:50%;color:#fff;font-weight:700}
[data-slot=skill-button-label]{color:${role("on-surface")};text-transform:uppercase;letter-spacing:.06em}
[data-slot=function-button-glyph]${W}{${disc("radial-gradient(circle at 50% 30%,#1E4E78,#0A1F3A 72%)")};color:${GOLD}}
[data-slot=function-button-value]{color:#0AC8B9}

[data-slot=level-map]${W}{${plate(12)}}
[data-slot=level-map-line]{stroke:#2A3F5A;stroke-width:2px}
[data-slot=level-map-line][data-done]{stroke:${GOLD}}
[data-slot=level-map-cell]${W}{${diamond(GOLD, "#0F2540")};color:#F0E6D2;font-weight:700}
[data-slot=level-map-cell][data-current]${W}{width:58px;height:58px;${diamond("#FFF3D0", GOLD)};color:#1A1408}
[data-slot=level-map-cell][data-locked]${W}{${diamond("#2A3F5A", "#0A1428")};color:#5B6B80}
[data-slot=level-map-stars]{color:${role("tertiary")}}

[data-slot=reward-track-cell]${W}{${cut(6, mix("primary", 55), NAVY_FILL)};color:${role("on-surface-variant")}}
[data-slot=reward-track-cell][data-ready]${W}{${cut(6, "#FFF3D0", `radial-gradient(100% 90% at 50% 100%,rgb(200 170 110/.55),transparent 70%),${BLUE_FILL}`)};color:#F0E6D2}
[data-slot=reward-track-cell] [data-slot=icon]{color:${role("primary")}}
[data-slot=reward-track-track]${W}{height:6px;border-radius:0;outline:1px solid ${DEEP};background-color:rgb(0 0 0/.55)}
[data-slot=reward-track-fill]{border-radius:0;background-image:${METAL};box-shadow:0 0 8px rgb(200 170 110/.6)}
[data-slot=reward-track-meta]{color:${role("on-surface-variant")}}
[data-slot=check-in]${W}{${plate(12)}}
[data-slot=check-in-title]{${GILT_WORDS};letter-spacing:.08em;font-family:var(--st-display,inherit)}
[data-slot=check-in-cell]${W}{border-radius:0;background-color:rgb(10 20 40/.6);box-shadow:inset 0 0 0 1px #2A3F5A;color:#C8C2B0}
[data-slot=check-in-cell][data-state=done]${W}{background-color:${GOLD};background-image:${METAL};color:#1A1408;box-shadow:none}
[data-slot=check-in-cell][data-state=today]${W}{border:0;background-color:#0B2A4A;color:#0AC8B9;box-shadow:inset 0 0 0 1px #0AC8B9,0 0 10px rgb(10 200 185/.5)}
[data-slot=task-bar]${W}{${plate(10)}}
[data-slot=item-cell-frame]${W}{border:0;border-radius:0;background-color:#0B2A4A;background-image:radial-gradient(90% 80% at 50% 30%,rgb(40 110 170/.6),transparent 70%);box-shadow:inset 0 0 0 1px ${GOLD},inset 0 0 0 3px rgb(10 20 40/.9),inset 0 0 0 4px rgb(200 170 110/.3);color:${GOLD}}
[data-slot=item-cell-value]{right:5px;bottom:3px;color:#F0E6D2;font-weight:700;text-shadow:0 1px 2px #000}
[data-slot=item-cell-badge]{border-radius:0;background-color:#B3261E;color:#fff;border:1px solid ${GOLD}}
[data-slot=item-cell-tag]{border-radius:0;color:#fff;font-weight:700}
[data-slot=item-cell-label]{color:${role("on-surface-variant")}}
[data-slot=inventory]${W}{${plate(12)}}
[data-slot=inventory-cell]${W}{border-radius:0;background-color:rgb(10 20 40/.7);box-shadow:inset 0 0 0 1px #2A3F5A}
[data-slot=inventory-cell][data-filled]${W}{background-color:#0B2A4A;background-image:radial-gradient(90% 80% at 50% 30%,rgb(40 110 170/.6),transparent 70%);box-shadow:inset 0 0 0 1px ${GOLD};color:${GOLD}}

[data-slot=character-card]${W}{${plate(14)}}
[data-slot=character-card-media]{background-image:radial-gradient(80% 90% at 50% 20%,rgb(40 110 170/.7),transparent 70%),linear-gradient(180deg,#0B2A4A,#0A1428);border-bottom:1px solid ${GOLD}}
[data-slot=character-card-media] [data-slot=icon]{color:${GOLD};filter:drop-shadow(0 0 10px rgb(200 170 110/.5))}
[data-slot=character-card-tag]{clip-path:polygon(22% 0,78% 0,100% 50%,78% 100%,22% 100%,0 50%);border-radius:0;padding-inline:14px;background-color:${GOLD};background-image:${METAL};color:#1A1408;font-weight:800}
[data-slot=character-card-level]{border-radius:0;background-color:rgb(10 20 40/.8);color:${GOLD};box-shadow:inset 0 0 0 1px ${DEEP}}
[data-slot=character-card-track]${W}{height:4px;border-radius:0;outline:0;background-color:rgb(0 0 0/.55);box-shadow:none}
[data-slot=character-card-fill]{border-radius:0;background-color:${GOLD};background-image:${METAL}}
[data-slot=character-card-value]{color:${role("primary")}}

[data-slot=game-result]${W}{${plate(16)}}
[data-slot=game-result-title]{font-size:30px;line-height:1.15}
[data-slot=game-result-stars]{color:${role("tertiary")};filter:drop-shadow(0 0 8px rgb(200 170 110/.6))}
[data-slot=game-result-label]{text-transform:uppercase;letter-spacing:.12em}
[data-slot=game-result-cell]${W}{${cut(6, mix("primary", 60), NAVY_FILL)}}
[data-slot=game-result-cell] [data-slot=icon]{color:${role("primary")}}

[data-slot=game-board]${W}{${plate(12)}}
[data-slot=game-board-title]{color:${role("primary")};text-transform:uppercase;letter-spacing:.08em}
[data-slot=game-board-cell]${W}{border-radius:0;background-color:rgb(10 20 40/.7);box-shadow:inset 0 0 0 1px #2A3F5A;color:${GOLD}}
[data-slot=game-board-cell][data-mark]${W}{box-shadow:inset 0 0 0 1px ${GOLD},inset 0 0 14px rgb(200 170 110/.3);text-shadow:0 0 8px rgb(200 170 110/.7)}
[data-slot=game-board-cell][data-mark=O]${W}{color:#0AC8B9;box-shadow:inset 0 0 0 1px #0AC8B9,inset 0 0 14px rgb(10 200 185/.3);text-shadow:0 0 8px rgb(10 200 185/.7)}
[data-slot=game-board-cell][aria-pressed=true]${W}{background-color:${GOLD};color:#1A1408}

[data-slot=wheel-track]${W}{--md-sys-color-surface-container-high:#0F2540;--md-sys-color-surface-container-low:#1C3A5E;border-radius:50%;border:2px solid ${GOLD};box-shadow:0 0 0 3px #0A1428,0 0 0 4px ${DEEP},0 0 20px rgb(200 170 110/.3),inset 0 0 20px rgb(0 0 0/.5)}
[data-slot=wheel-label]{color:${GOLD}}
[data-slot=wheel-indicator]{top:-10px;z-index:2;border-top-color:${GOLD};filter:drop-shadow(0 0 4px rgb(200 170 110/.8))}
[data-slot=wheel-stage] [data-button]${W}{width:64px;height:64px;padding:0;${diamond("#FFF3D0", GOLD)};color:#1A1408}
[data-slot=grid-wheel-cell]${W}{${cut(5, mix("outline", 80), NAVY_FILL)};color:${role("on-surface-variant")}}
[data-slot=grid-wheel-cell] [data-slot=icon]{color:${role("primary")}}
[data-slot=grid-wheel-cell][data-lit]${W}{${cut(5, "#FFF3D0", `radial-gradient(circle,rgb(200 170 110/.55),transparent 75%),${BLUE_FILL}`)};color:#F0E6D2}
[data-slot=gacha-media]${W}{border-radius:50%;background-color:#0A1F3A;background-image:radial-gradient(circle at 50% 45%,rgb(10 200 185/.35),rgb(10 90 150/.25) 50%,transparent 72%);box-shadow:inset 0 0 0 1px ${GOLD},0 0 0 4px #0A1428,0 0 0 5px ${DEEP},0 0 26px rgb(10 200 185/.3)}
[data-slot=gacha-dot]{border-radius:0;rotate:45deg;scale:.6}
[data-slot=gacha-dot][class~="bg-primary-container"]{background-color:${GOLD};box-shadow:0 0 8px ${GOLD}}
[data-slot=gacha-dot][class~="bg-secondary-container"]{background-color:#0AC8B9;box-shadow:0 0 8px #0AC8B9}
[data-slot=gacha-dot][class~="bg-tertiary-container"]{background-color:#9A6AE0;box-shadow:0 0 8px #9A6AE0}
[data-slot=slot-machine-track]${W}{${plate(10)}}
[data-slot=slot-machine-cell]{border-radius:0;background-color:rgb(10 20 40/.8);box-shadow:inset 0 0 0 1px #2A3F5A,inset 0 10px 12px -8px rgb(0 0 0/.8),inset 0 -10px 12px -8px rgb(0 0 0/.8);color:${GOLD}}
[data-slot=egg-smash-title]{${GILT_WORDS};font-family:var(--st-display,inherit);letter-spacing:.06em}
[data-slot=egg-smash-item]${W}{background-color:#0B3A55;background-image:radial-gradient(40% 30% at 36% 28%,rgb(205 250 250/.55),transparent),radial-gradient(80% 70% at 55% 75%,rgb(10 200 185/.35),transparent 70%);box-shadow:inset 0 0 0 1px ${GOLD},0 0 14px rgb(10 200 185/.3)}
[data-slot=egg-smash-item][data-state=broken]${W}{background-color:#15304F;background-image:none;box-shadow:inset 0 0 0 1px #2A3F5A}
[data-slot=draw-result]{color:${role("primary")};text-transform:uppercase;letter-spacing:.06em}
[data-slot=joystick]${W}{border-radius:50%;background-color:rgb(10 20 40/.5);background-image:radial-gradient(circle,transparent 58%,rgb(200 170 110/.25) 59% 60%,transparent 61%);box-shadow:inset 0 0 0 1.5px ${GOLD},0 0 0 3px rgb(10 20 40/.6);outline:0}
[data-slot=joystick-handle]{${disc("radial-gradient(circle at 50% 30%,#2A6A9A,#0A1F3A 72%)")}}
[data-slot=joystick-dot]{display:none}
`;

export default definePack({
  key: "moba",
  name: say("MOBA 竞技", "MOBA", "MOBA", "MOBA"),
  hint: say("像王者荣耀、英雄联盟手游：深海军蓝、金色细框、菱形和金色光晕", "Like Honor of Kings, Wild Rift: deep navy, thin gold frames, diamonds and gold glow", "Honor of Kings のような紺と金", "Honor of Kings 같은 남색과 금색"),
  refs: ["Honor of Kings", "League of Legends: Wild Rift"],
  basis: "observed",
  group: "mobileGame",
  seed: "#C8AA6E",
  mode: "dark",
  light: roles({ p: ["#0848B8", "#FFFFFF"], pc: ["#D6E4FF", "#06265F"], s: ["#7A5C14", "#FFFFFF"], sc: ["#F8F2D8", "#3A2C05"], t: ["#7A5C14", "#FFFFFF"], tc: ["#F8F2D8", "#3A2C05"], bg: ["#F2F6FF", "#FFFFFF", "#FFFFFF", "#E8EFFC", "#DCE6F8"], text: ["#0B1E3F", "#3F5275"], line: ["#5A76A8", "#C8D6EE"] }),
  dark: roles({ p: ["#C8AA6E", "#1A1408"], pc: ["#463714", "#F0E6D2"], s: ["#0AC8B9", "#00201D"], sc: ["#1E2328", "#F0E6D2"], t: ["#F0C75E", "#1A1408"], tc: ["#0A3A45", "#CDFAFA"], bg: ["#0A1428", "#0A1F3A", "#0F2540", "#15304F", "#1C3A5E"], text: ["#F0E6D2", "#C8C2B0"], line: ["#785A28", "#2A3F5A"] }),
  shape: "square",
  font: "inter",
  display: "cinzel",
  icons: "game",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  capsLabels: true,
  screenDark: "radial-gradient(120% 70% at 50% 0%, rgb(10 90 150 / 0.28), transparent 65%)",
  tokens: { rim: "#C8AA6E", rimDark: "#785A28", tabOn: "#C8AA6E", navOn: "#F0E6D2", toggleOn: "#C8AA6E" },
  recipes: { button: "frame", surface: "hairline", tabs: "glow", toggle: "block", slider: "block", nav: "goldglow", field: "line", bar: "line", meter: "thin", feedback: "flash", list: "tile", dialog: "plain", avatar: "framed", card: "framed", segmented: "block", appbar: "compact", search: "underline", progress: "thin", row: "bullet", divider: "ornament", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", icon: "emboss", text: "gilded", scroll: "thin" },
  art: "high fantasy splash art, luminous magic, deep blue and gold, dramatic heroes in dynamic poses",
  ux: { margin: 16, gap: 12, tight: 6, nav: "bottom" },
  layout: { zh: "人物立绘占一侧，另一侧是深蓝列表；底部标签选中时金光从下往上泛起；到处是金色细线和菱形。", en: "A hero portrait on one side, a navy list on the other; bottom tabs whose chosen one glows gold from below; thin gold lines and diamonds throughout." },
  type: { ...TITLES([20, 26, 700, 0.5], [16, 22, 600, 0], [14, 20, 600, 0]), ...BODIES([14, 20, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 18, 700, 0], [12, 16, 600, 0], [11, 14, 600, 0]) },
  css: CSS,
});
