import { BUTTON, MENU_ITEMS, ROWS, TONED, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
/** the weight of one id, which every element matches: it lifts a rule over the panel recipe, whose selector is long, without
 *  naming anything about how a part is built */
const FIRM = ":not(#_)";

/* Apex's and Valorant's menus looked at on Interface In Game; Valorant's red and off-white as it publishes them */
export default definePack({
  key: "fps",
  name: say("战术射击", "Tactical shooter", "タクティカル FPS", "전술 슈팅"),
  hint: say("像 Apex、Valorant：深蓝黑底、Valorant 红、米白选中、扁平直角和细线、窄体大写", "Like Apex, Valorant: blue-black, Valorant red, off-white selection, flat square shapes and thin lines, condensed capitals", "Apex や Valorant のように赤と米白、平たい四角と細線", "Apex, Valorant처럼 빨강과 미색, 납작한 사각형과 가는 선"),
  refs: ["Apex Legends", "VALORANT", "PUBG", "Counter-Strike 2"],
  basis: "observed",
  group: "pcGame",
  seed: "#FF4655",
  mode: "dark",
  light: roles({ p: ["#C62526", "#FFFFFF"], pc: ["#FFDAD6", "#410002"], s: ["#0F1923", "#ECE8E1"], sc: ["#E2DDD3", "#0F1923"], t: ["#0E7A5E", "#FFFFFF"], tc: ["#C7F5E6", "#04241B"], bg: ["#ECE8E1", "#F7F4EE", "#F2EEE7", "#E2DDD3", "#D8D2C6"], text: ["#0F1923", "#3F4A55"], line: ["#6E7782", "#C4BEB2"] }),
  dark: roles({ p: ["#FF4655", "#FFFFFF"], pc: ["#4A1114", "#FFD6D6"], s: ["#ECE8E1", "#0F1923"], sc: ["#1F2A36", "#ECE8E1"], t: ["#5BD1B0", "#04241B"], tc: ["#103A2F", "#C7F5E6"], bg: ["#0F1923", "#16212D", "#1C2936", "#243340", "#2C3D4C"], text: ["#ECE8E1", "#B5C2CE"], line: ["#6E8296", "#2C3D4C"] }),
  /* white on Valorant's red reads at about 3.4:1, and it is what the game and its site print */
  loud: ["primary"],
  shape: "none",
  font: "barlow",
  display: "barlow",
  icons: "tabler",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  capsLabels: true,
  screenDark: "radial-gradient(100% 70% at 70% 30%, rgb(60 90 130 / 0.35), transparent 70%)",
  tokens: { barBg: "#0B131B", onBar: "#ECE8E1", rim: "#FF4655", tabOn: "#FF4655", navOn: "#ECE8E1", toggleOn: "#FF4655", primaryTextDark: "#FF7A7A" },
  recipes: { picker: "boxed", button: "flat", surface: "line", tabs: "slant", toggle: "block", slider: "block", nav: "topline", field: "boxed", bar: "hud", meter: "block", feedback: "flash", list: "tile", dialog: "plain", chip: "tag", card: "outlined", segmented: "underline", appbar: "compact", search: "underline", input: "underline", progress: "segment", row: "dense", menu: "compact", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", text: "caps", scroll: "block" },
  art: "gritty tactical shooter art, overcast urban map, muted colors, a hot orange rim light",
  ux: { margin: 16, gap: 8, tight: 4, nav: "top" },
  layout: { zh: "顶部一行大写导航，选中项是红色平行四边形；人物站在中间；左下角一列匹配按钮和大号准备按钮；右上角货币。", en: "A line of capital navigation on top with the chosen item a red parallelogram; the character standing in the middle; a column of match buttons and a big ready button at the lower left; currency at the upper right." },
  type: { ...TITLES([26, 30, 700, 0.5], [20, 24, 700, 0.5], [16, 20, 700, 0.5]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 700, 1], [14, 18, 600, 0.5], [12, 14, 600, 0.5]) },
  /* Flat rectangles and thin lines on Valorant's blue-black: a list's chosen line turns off-white with a red edge, the
     main button stands in a thin frame of its own a few pixels out, every label is spaced capitals. */
  css: `${LINES}{border-radius:0}
[data-slot=item]{border:0;background-color:${mix("on-surface", 5)}}
${LINES}${LIT}${FIRM}{background-color:${role("secondary")};color:${role("on-secondary")};box-shadow:inset 3px 0 0 ${role("primary")};border-color:transparent}
${LINES}${LIT} :is([data-slot$="-title"],[data-slot$="-subtitle"],[data-slot$="-meta"],[data-slot$="-value"],[data-slot=item-description],[data-slot=icon]){color:inherit}
:is([data-slot=toggle-group-item][data-pressed],[data-slot=pagination-link][data-active=true])${FIRM}{background-color:${role("secondary")};color:${role("on-secondary")};border-color:transparent}
${BUTTON}:is([data-variant=filled],[data-variant=default]){outline:1px solid ${mix("on-surface", 35)};outline-offset:3px}
${TONED}{border:1px solid ${mix("on-surface", 28)}}
[data-button][data-variant=outlined]{border-color:${mix("on-surface", 55)};color:${role("on-surface")}}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content])${FIRM}{border-top:2px solid ${role("primary")}}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){text-transform:uppercase;letter-spacing:.06em}
[data-slot=tooltip-content]{border-radius:0;background-color:${role("surface-container-high")};color:${role("on-surface")};border:1px solid ${mix("on-surface", 18)}}
[data-slot=snackbar]{background-color:${role("surface-container-high")};color:${role("on-surface")};border-radius:0;border-left:3px solid ${role("primary")}}
[data-slot=snackbar-action]{color:var(--st-primary-text)}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label],[data-slot=check-in-title],[data-slot=table-head]){text-transform:uppercase;letter-spacing:.12em;font-size:var(--text-label-medium);color:${role("on-surface-variant")}}
[data-slot=table-header] [data-slot=table-row]{border-bottom-color:${mix("on-surface", 30)}}
[data-slot=table-row]{border-bottom-color:${mix("on-surface", 8)}}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){border-color:${mix("on-surface", 30)}}
[data-slot=checkbox]{border-radius:0}
${SLOTS}${FIRM}{border-radius:0;background-image:none;background-color:${mix("on-surface", 4)};border:0;box-shadow:inset 0 0 0 1px ${mix("on-surface", 18)}}
${SLOTS}:is([aria-pressed=true],[data-lit])${FIRM}{background-color:${mix("on-surface", 10)};color:${role("on-surface")};box-shadow:inset 0 0 0 2px ${role("secondary")}}
:is([data-slot=level-map-cell],[data-slot=game-board-cell],[data-slot=skill-button-face]){border-radius:0}`,
});
