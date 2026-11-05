import { mix, role } from "../recipes/shared";
import { definePack, roles, say } from "../types";
import { menubar, palette, picked, short, sidebar, toolbar, tree, windowsCaption } from "./desk";

/* third-party palettes of its store and client; Valve publishes none. What gives it away beyond the navy: flat buttons
 * of 2px corners, the one that buys or plays a green gradient and the client's own primary a blue one, the others a
 * faded blue; panels lit by a faint gradient; capsules of art over a dark plate; the discount in a lime block; tabs and
 * menus in capitals. The colors of the buttons are the store's stylesheet, not roles: they are the same in either mode. */

/** the store's green purchase button and its words; the client's blue primary */
const GREEN = "linear-gradient(to right,#75B022 5%,#588A1B 95%)";
const ON_GREEN = "#D2EFA9";
const BLUE = "linear-gradient(to right,#47BFFF 5%,#1A44C2 95%)";
/** the faint light across a panel, from its top left */
const SHEEN = "linear-gradient(135deg,rgb(255 255 255/.06),transparent 55%)";
const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const MENUS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content])";
const MENU_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger])";
const TONED = "[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=tertiary],[data-variant=elevated])";

export default definePack({
  key: "steam",
  name: say("Steam", "Steam", "Steam", "Steam"),
  hint: say("游戏平台：深海军蓝、钢蓝面板、天蓝点缀", "Game store: deep navy, steel-blue panels, sky-blue accents", "ゲームストア：濃紺と空色", "게임 스토어: 짙은 남색과 하늘색"),
  refs: ["Steam"],
  basis: "observed",
  group: "desktop",
  seed: "#66C0F4",
  mode: "dark",
  light: roles({ p: ["#1A6FA8", "#FFFFFF"], pc: ["#D3E9F7", "#0B3A5A"], s: ["#4B5A68", "#FFFFFF"], sc: ["#DCE6EE", "#1B2838"], t: ["#5C7A00", "#FFFFFF"], tc: ["#E7F4B8", "#2B3A00"], bg: ["#E9EFF4", "#FFFFFF", "#F4F7FA", "#E2EAF0", "#D6E0E9"], text: ["#1B2838", "#46586A"], line: ["#73879A", "#C6D3DE"] }),
  dark: roles({ p: ["#66C0F4", "#0B1A26"], pc: ["#2A475E", "#C7D5E0"], s: ["#8F98A0", "#171A21"], sc: ["#2A475E", "#C7D5E0"], t: ["#A4D007", "#1A2600"], tc: ["#3D4F0F", "#D2EFA9"], bg: ["#1B2838", "#171A21", "#16202D", "#223447", "#223A50"], text: ["#C7D5E0", "#A3B1BE"], line: ["#66788A", "#2A475E"] }),
  shape: "square",
  font: "inter",
  icons: "tabler",
  motion: "standard",
  control: "small",
  pill: "round",
  compact: true,
  screenDark: "linear-gradient(#171A21 0, #1B2838 140px)",
  tokens: { barBg: "#171A21", onBar: "#C7D5E0", rim: "#2A475E", toggleOn: "#1A9FFF" },
  recipes: { button: "flat", surface: "plain", tabs: "boxed", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "hud", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "flat", segmented: "boxed", appbar: "compact", search: "boxed", input: "filled", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", scroll: "block" },
  art: "dark game library, deep navy panels, cool blue glow, cover art lined up",
  ux: { margin: 12, gap: 8, tight: 4, nav: "top" },
  layout: { zh: "深色顶部导航，下面是大幅封面和成排的游戏卡片，列表里是缩略图、名字和绿色价格标签。", en: "A dark navigation along the top, a large cover below it and rows of game cards; lists of a thumbnail, a name and a green price tag." },
  css: [
    /* buttons: flat, 2px corners; the one that buys or plays green, the others a faded blue with blue words */
    `[data-button]{border-radius:2px;font-weight:400}
[data-button]:is([data-variant=filled],[data-variant=default]){background-image:${GREEN};color:${ON_GREEN};border:0}
${TONED}{background-color:${mix("primary", 20)};color:${role("primary")};border:0;box-shadow:none}
[data-button]:is([data-variant=outlined],[data-variant=outline]){background-color:${mix("on-surface", 8)};color:${role("on-surface")};border:0}
[data-slot=fab]{border-radius:2px;background-image:${GREEN};color:${ON_GREEN};box-shadow:0 2px 8px rgb(0 0 0/.4)}`,
    /* panels and capsules: square, lit by a faint gradient; the art over a dark plate */
    `:is([data-slot=card],[data-surface=card],[data-slot=product-card],[data-slot=character-card]){border-radius:2px;background-image:${SHEEN}}
[data-slot=card-title]{font-weight:400}
[data-slot=product-card-price]{color:${role("on-surface")}}
:is([data-slot=price-tag-tag],[data-slot=product-card-tag],[data-slot=coupon-stub]){border-radius:0;background-color:#4C6B22;color:#BEEE11;font-weight:600}
[data-slot=price-tag]{color:${role("on-surface")}}`,
    /* tabs: capitals on the dark, the chosen one on a lighter plate */
    `[data-slot=tabs-list]{justify-content:flex-start;gap:2px;border-bottom:0}
[data-slot=tabs-trigger]{flex:none;padding-inline:14px;text-transform:uppercase;letter-spacing:.04em;font-size:13px;color:${role("on-surface-variant")};border:0}
[data-slot=tabs-trigger][data-active]{background-color:${role("primary-container")};color:${role("on-primary-container")};border:0}`,
    /* fields: a dark sunken box with 2px corners; the switch the client's, short and blue */
    `:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group],[data-surface=field]){border-radius:2px;box-shadow:inset 0 1px 2px rgb(0 0 0/.3)}
[data-slot=switch][data-size=default]{width:38px;height:20px}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:16px;height:16px;translate:2px -50%}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:20px -50%}
[data-slot=checkbox]{border-radius:2px;border-width:1px}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:4px}
[data-slot=slider-range]{background-image:linear-gradient(to right,#1A44C2,#1A9FFF)}
[data-slot=slider-rest]{background-color:${mix("on-surface", 18)}}
[data-slot=slider] [data-slot=slider-thumb]{width:14px;height:14px;background-color:${role("on-surface")};box-shadow:0 1px 3px rgb(0 0 0/.5)}
[data-slot=progress-fill]{background-image:linear-gradient(to right,#1A44C2,#1A9FFF)}`,
    /* the library's list: short rows, the chosen one blue */
    sidebar(28, "2px", 18),
    `[data-slot=sidebar]{background-color:${role("surface-container-low")}}
[data-slot=sidebar-group-label]{text-transform:uppercase;letter-spacing:.04em}
[data-slot=sidebar-menu-button][data-active]{background-color:${mix("primary", 22)};color:${role("on-surface")}}
[data-slot=side-tabs-item]{border-radius:2px}
[data-slot=side-tabs-item][data-active]{background-color:${mix("primary", 22)};color:${role("on-surface")}}`,
    tree(26, "2px"),
    `[data-slot=tree-row][data-active]{background-color:${mix("primary", 22)};color:${role("on-surface")}}`,
    /* the top navigation in capitals, the chosen one blue */
    `[data-slot=navigation-bar] [data-slot=nav-label]{text-transform:uppercase;letter-spacing:.04em}
[data-slot=navigation-rail]{background-color:${role("surface-container-low")}}`,
    /* menus: a light grey-blue panel of the client, dark words, the hovered row lighter */
    `${MENUS}{background-color:#3D4450;color:#DCDEDF;border:0;border-radius:2px;box-shadow:0 4px 16px rgb(0 0 0/.5)}
${MENU_ROWS}{min-height:28px;border-radius:0;font-size:13px;color:#DCDEDF}
${MENU_ROWS} [data-slot=icon]{color:#DCDEDF}
${MENU_ROWS}[data-variant=destructive],${MENU_ROWS}[data-variant=destructive] [data-slot=icon]{color:#FF8A80}
${MENU_ROWS}:is([data-highlighted],:focus){background-color:#DCDEDF;color:#3D4450}
${MENU_ROWS}:is([data-highlighted],:focus) [data-slot=icon]{color:#3D4450}`,
    picked,
    short(32),
    `${MENU_ROWS}[data-selected]{background-color:rgb(255 255 255/.12);color:#DCDEDF}`,
    menubar(28, "2px"),
    `[data-slot=menubar-trigger]{text-transform:uppercase;letter-spacing:.04em;font-size:13px}`,
    toolbar("2px"),
    palette(30, "2px"),
    /* dialogs: a gradient of the client's blue-grey, square, the confirming button the blue gradient */
    `${DIALOG}{border-radius:4px;padding:24px;border:0;background-image:linear-gradient(160deg,${mix("primary", 12)},transparent 60%);box-shadow:0 8px 32px rgb(0 0 0/.6)}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:22px;line-height:28px;font-weight:700;color:${role("on-surface")}}
:is([data-slot=dialog-footer],[data-slot=alert-dialog-footer]) [data-button]{min-width:96px}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{background-color:${mix("on-surface", 12)};color:${role("on-surface")}}
:is([data-slot=dialog-close][data-tap=confirm],[data-slot=alert-dialog-action]){background-image:${BLUE};color:#fff}`,
    /* tables, tooltips and the rest */
    `[data-slot=table-head]{height:32px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:${role("on-surface-variant")}}
[data-slot=table-cell]{height:36px}
[data-slot=table-row]{border-bottom-color:${mix("on-surface", 8)}}
[data-slot=tooltip-content]{background-image:linear-gradient(to bottom,#E3EAEF,#C7D5E0);color:#3D4450;border-radius:2px;font-size:12px}
[data-slot=alert]{border-radius:2px;background-image:${SHEEN};border-left:3px solid ${role("primary")}}`,
    /* the window: the client's dark bar, the caption buttons of Windows */
    windowsCaption,
    `[data-slot=title-bar]{background-color:${role("surface-container-low")};border-bottom:0}
[data-slot=title-bar-icon]{color:${role("primary")}}
[data-slot=status-bar]{background-color:${role("surface-container-low")};border-top:1px solid ${mix("on-surface", 8)};font-size:12px}`,
  ].join("\n"),
});
