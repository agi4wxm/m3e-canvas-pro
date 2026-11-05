import { BUTTON, BUTTONS, MENU_ITEMS, PANELS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
const NAVY = "#15193A";
const YELLOW = "#FFD60A";
/** the ink line a comic draws round everything: navy on white, white on the dark */
const INK = role("on-surface");
const LEAN = "transform:skewX(-12deg)";

/* looked at in Marvel Rivals' menus on Interface In Game: white panels, navy strips, yellow, slants */
export default definePack({
  key: "rivals",
  name: say("漫威争锋", "Marvel Rivals", "Marvel Rivals", "Marvel Rivals"),
  hint: say("漫画英雄：白面板粗墨线、海军蓝条、亮黄选中、斜切和粗斜体大写", "Comic hero: white panels in thick ink lines, navy strips, bright yellow, slants and bold italic capitals", "コミック調：太い線の白いパネルと黄色、斜めの形", "코믹풍: 굵은 선의 흰 패널과 노랑, 기울인 형태"),
  refs: ["Marvel Rivals"],
  basis: "observed",
  group: "pcGame",
  seed: "#4B3FC8",
  mode: "light",
  light: roles({ p: ["#FFD60A", "#15193A"], pc: ["#E6E9F8", "#15193A"], s: ["#4B3FC8", "#FFFFFF"], sc: ["#15193A", "#FFFFFF"], t: ["#4B3FC8", "#FFFFFF"], tc: ["#E2DFFF", "#1E1866"], bg: ["#E9ECF8", "#FFFFFF", "#FFFFFF", "#F3F5FC", "#DDE1F2"], text: ["#15193A", "#4A5070"], line: ["#7A80A0", "#C9CEE6"] }),
  dark: roles({ p: ["#FFD60A", "#15193A"], pc: ["#30365C", "#E6E9F8"], s: ["#A89FFF", "#15193A"], sc: ["#30365C", "#FFFFFF"], t: ["#A89FFF", "#15193A"], tc: ["#2A2566", "#E2DFFF"], bg: ["#0F1224", "#181C36", "#1E2340", "#272C4E", "#30365C"], text: ["#FFFFFF", "#C9CEEA"], line: ["#7A80A0", "#30365C"] }),
  shape: "none",
  font: "barlow",
  display: "barlow",
  icons: "remix",
  motion: "expressive",
  control: "extra-small",
  pill: "follow",
  capsLabels: true,
  screen: "linear-gradient(115deg, transparent 58%, rgb(75 63 200 / 0.16) 58%, rgb(75 63 200 / 0.16) 80%, transparent 80%)",
  tokens: { barBg: "#15193A", onBar: "#FFFFFF", rim: "#FFD60A", tabOn: "#FFD60A", navOn: "#4B3FC8", toggleOn: "#FFD60A", primaryText: "#4B3FC8" },
  recipes: { picker: "rim", button: "slant", surface: "plain", tabs: "slant", toggle: "block", slider: "block", nav: "topline", field: "boxed", bar: "hud", meter: "block", feedback: "flash", list: "tile", dialog: "game", chip: "tag", card: "flat", segmented: "block", appbar: "compact", search: "boxed", progress: "track", divider: "bold", menu: "compact", sheet: "panel", tooltip: "light", fab: "flat", badge: "square", text: "italic", screen: "dots", scroll: "block" },
  art: "bold comic-book hero poster, halftone dots, dynamic diagonals, saturated purple and yellow",
  ux: { margin: 16, gap: 12, tight: 6, nav: "top" },
  layout: { zh: "顶部窄导航选中项亮黄；一边是人物立绘和斜切色块，另一边是白面板；标题是粗斜体大写；胜利画面是一道斜向黄光。", en: "A slim navigation on top with the chosen item bright yellow; a hero and slanted color blocks on one side, white panels on the other; bold italic capital titles; a slanted yellow streak on victory." },
  type: { ...TITLES([28, 30, 800, 0], [20, 24, 700, 0], [17, 20, 700, 0]), ...BODIES([16, 20, 500, 0], [15, 19, 500, 0], [13, 16, 500, 0]), ...LABELS([18, 22, 800, 0.5], [14, 18, 700, 0.5], [12, 14, 700, 0.5]) },
  /* A comic page: every panel in a thick ink line with a purple slab behind it, buttons and switches leaning
     forward with their outline intact, the chosen line a yellow bar cut off at a slant, a navy band with yellow slashes
     across the head of a dialog. */
  css: `:is(${PANELS}){border:2px solid ${INK};box-shadow:4px 4px 0 ${role("secondary")}}
${BUTTONS}{clip-path:none;${LEAN};font-style:normal;border:2px solid ${INK};box-shadow:3px 3px 0 ${INK}}
${BUTTON}:active{translate:2px 2px;box-shadow:1px 1px 0 ${INK}}
[data-slot=tabs-trigger]{font-weight:800}
:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group],[data-slot=text-field-box],[data-slot=search-bar],[data-slot=search-view],[data-surface=field]){border:2px solid ${INK};border-radius:0}
:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=input-group],[data-slot=text-field-box],[data-slot=search-bar]):focus-within{border-color:${role("secondary")};box-shadow:3px 3px 0 ${YELLOW}}
${LINES}{border-radius:0}
[data-slot=item]{border:0;border-left:4px solid ${INK};background-color:${role("surface-container-low")}}
${LINES}${LIT}{background-color:transparent;background-image:linear-gradient(105deg,${YELLOW} calc(100% - 22px),transparent calc(100% - 22px));background-repeat:no-repeat;color:${NAVY};border-color:transparent;border-left-color:${NAVY};box-shadow:none}
${LINES}${LIT} :is([data-slot$="-title"],[data-slot$="-subtitle"],[data-slot$="-meta"],[data-slot$="-value"],[data-slot=item-description],[data-slot=icon]){color:inherit}
[data-slot=pagination-link][data-active=true]{background-color:${YELLOW};color:${NAVY};border:2px solid ${INK};${LEAN}}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){background-image:linear-gradient(115deg,transparent 0 14px,${YELLOW} 14px 22px,transparent 22px 28px,${YELLOW} 28px 31px,transparent 31px);font-style:italic;font-weight:800;text-transform:uppercase}
[data-slot=snackbar]{background-color:${NAVY};color:#fff;border-radius:0;border:2px solid ${NAVY};border-left:6px solid ${YELLOW};box-shadow:4px 4px 0 ${role("secondary")};font-style:italic;font-weight:700}
[data-slot=snackbar-action]{color:${YELLOW}}
[data-slot=tooltip-content]{border:2px solid ${INK};border-radius:0;font-weight:700;font-style:italic}
:is([data-slot=switch],[data-slot=checkbox],[data-slot=radio-group-item]){border:2px solid ${INK}}
:is([data-slot=switch],[data-slot=checkbox]){border-radius:0}
[data-slot=switch]{${LEAN}}
[data-slot=switch] [data-slot=switch-thumb]{background-color:${INK}}
[data-slot=switch] [data-slot=switch-thumb][data-checked]{background-color:${NAVY}}
:is([data-slot=badge],[data-slot=notification-badge],[data-slot$="-badge"]){background-color:${YELLOW};color:${NAVY};box-shadow:0 0 0 2px ${NAVY};border-radius:0;font-style:italic;font-weight:800;${LEAN}}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){border:2px solid ${INK};font-weight:700;font-style:italic;text-transform:uppercase}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label],[data-slot=check-in-title],[data-slot=table-head]){font-style:italic;font-weight:800;text-transform:uppercase;color:${INK}}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label])::before{content:"";display:inline-block;width:6px;height:.9em;margin-right:6px;vertical-align:-.1em;background-color:${YELLOW};box-shadow:0 0 0 1px ${NAVY};${LEAN}}
[data-slot=table-header]{background-color:${NAVY}}
[data-slot=table-header] [data-slot=table-head]{color:#fff}
[data-slot=table-row]{border-bottom:2px solid ${mix("on-surface", 14)}}
${SLOTS}{border-radius:0;border:2px solid ${INK};background-image:none;background-color:${role("surface-container-low")};box-shadow:none}
${SLOTS}:is([aria-pressed=true],[data-lit]){background-color:${YELLOW};color:${NAVY};box-shadow:3px 3px 0 ${role("secondary")}}
:is([data-slot=level-map-cell],[data-slot=game-board-cell]){border-radius:0;border:2px solid ${INK}}
[data-slot=level-map-cell]{${LEAN}}`,
});
