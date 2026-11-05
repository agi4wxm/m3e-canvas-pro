import { MENU_ITEMS, PANELS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, zhEnJaKo, TITLES, BODIES, LABELS } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
/** the wood of a frame where the light falls on it, and where it does not */
const LIT_WOOD = "color-mix(in srgb,var(--st-rim) 72%,#FFE2A8)";
const DARK_WOOD = "color-mix(in srgb,var(--st-rim) 72%,#3A1600)";
/** the red square round the item in hand */
const PICKED = "#D8402A";

/* the dialog frame and panel read off Stardew Valley's Steam screenshots */
export default definePack({
  key: "stardew",
  name: zhEnJaKo("星露谷物语", "Stardew Valley", "Stardew Valley", "Stardew Valley"),
  hint: zhEnJaKo("像素农场：木框、橙褐羊皮纸面板、深棕像素字、卷轴名牌", "Pixel farm: wooden frames, orange-tan parchment panels, dark brown pixel type", "ピクセル農場：木枠と羊皮紙", "픽셀 농장: 나무 테와 양피지"),
  refs: ["Stardew Valley", "Terraria"],
  basis: "sampled",
  group: "pcGame",
  seed: "#B95705",
  mode: "light",
  light: roles({ p: ["#A84F05", "#FFF4D6"], pc: ["#F6C27A", "#4A1C08"], s: ["#3F7A22", "#FFFFFF"], sc: ["#F7E3B5", "#4A1C08"], t: ["#7A5000", "#FFF4D6"], tc: ["#F9E79F", "#3A2208"], bg: ["#F5C98A", "#FBE3B5", "#F6C27A", "#F2BA6E", "#EFB366"], text: ["#4A1C08", "#5E2A0E"], line: ["#8B4A12", "#C98A45"] }),
  dark: roles({ p: ["#E8A828", "#2B1800"], pc: ["#5A3A1A", "#F7E3B5"], s: ["#8FD45A", "#132B02"], sc: ["#4A3015", "#F7E3B5"], t: ["#F2C65A", "#2B1800"], tc: ["#4A3015", "#F9E79F"], bg: ["#1E140C", "#2B1C10", "#38240F", "#4A3015", "#5A3A1A"], text: ["#F7E3B5", "#E8CF9E"], line: ["#C98A45", "#6E4A22"] }),
  shape: "none",
  font: "pixel",
  icons: "pixel",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  edge: 3,
  tokens: { rim: "#B5641E", rimDark: "#5B2B06", toggleOn: "#3F7A22", navOn: "#4A1C08" },
  recipes: { picker: "rim", button: "hard", surface: "wood", tabs: "boxed", toggle: "block", slider: "block", nav: "block", field: "hard", bar: "line", meter: "block", feedback: "press", list: "tile", dialog: "game", avatar: "framed", dialogue: "portrait", card: "framed", segmented: "block", appbar: "center", search: "boxed", progress: "segment", divider: "bold", menu: "rim", sheet: "rim", tooltip: "rim", fab: "square", badge: "rim", scroll: "block" },
  art: "cozy 16-bit pixel art farming village, warm sunlight, soft greens and oranges, crisp visible pixels and no anti-aliasing",
  ux: { margin: 12, gap: 8, tight: 6, nav: "bottom" },
  layout: { zh: "整屏是场景；对话框贴在下方，左边文字、右边头像和卷轴名牌；底部一排方形物品格当导航。", en: "The scene fills the screen; a dialog sits low on it with words at the left and a portrait with a scroll nameplate at the right; a row of square item slots along the foot serves as navigation." },
  type: { ...TITLES([24, 30, 400, 0], [20, 26, 400, 0], [16, 22, 400, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 400, 0], [12, 16, 400, 0], [12, 14, 400, 0]) },
  /* Every panel is the game's wooden frame: a dark outer line, a beveled band of wood lit from the upper left, a dark
     line inside, then parchment. A list's lines are little beveled boards that turn pale yellow under the pointer; the
     item slots are sunk into the panel and the chosen one is framed in red, as on the toolbar. */
  css: `:is(${PANELS}){border:4px solid var(--st-rim);border-color:${LIT_WOOD} ${DARK_WOOD} ${DARK_WOOD} ${LIT_WOOD};box-shadow:0 0 0 2px var(--st-rim-dark),inset 0 0 0 2px ${mix("on-surface", 40)},4px 6px 0 2px rgb(0 0 0/.22)}
${LINES}{border-radius:0}
[data-slot=item]{border:2px solid var(--st-rim);background-color:${role("surface-container-low")};box-shadow:inset 2px 2px 0 rgb(255 255 255/.35),inset -2px -2px 0 rgb(120 60 0/.15)}
${LINES}${LIT}{background-color:${role("tertiary-container")};color:${role("on-tertiary-container")};border-color:var(--st-rim);box-shadow:inset 2px 2px 0 rgb(255 255 255/.45)}
${LINES}${LIT} :is([data-slot$="-title"],[data-slot$="-subtitle"],[data-slot$="-meta"],[data-slot$="-value"],[data-slot=item-description],[data-slot=icon]){color:inherit}
[data-slot=checkbox]{border:2px solid var(--st-rim-dark);border-radius:0;background-color:${role("surface-container-low")}}
[data-slot=checkbox][data-checked]{background-color:${role("surface-container-low")};border-color:var(--st-rim-dark);color:${role("secondary")}}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content]) :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){background-color:${role("tertiary-container")};color:${role("on-tertiary-container")};border-bottom:var(--st-edge) solid var(--st-rim)}
[data-slot=tooltip-content]{box-shadow:0 0 0 2px var(--st-rim-dark),3px 4px 0 2px rgb(0 0 0/.2)}
[data-slot=snackbar]{background-color:${role("surface-container-low")};color:${role("on-surface")};border:3px solid var(--st-rim);border-radius:0;box-shadow:0 0 0 2px var(--st-rim-dark)}
[data-slot=snackbar-action]{color:${role("primary")}}
${SLOTS}{border:2px solid var(--st-rim);border-radius:0;background-image:none;background-color:${role("surface-container-low")};box-shadow:inset 3px 3px 0 rgb(120 60 0/.28),inset -2px -2px 0 rgb(255 255 255/.4)}
${SLOTS}:is([aria-pressed=true],[data-lit]){border-color:${PICKED};box-shadow:inset 0 0 0 2px ${PICKED};background-color:${role("tertiary-container")};color:${role("on-tertiary-container")}}
:is([data-slot=level-map-cell],[data-slot=game-board-cell],[data-slot=skill-button-face]){border-radius:0}`,
});
