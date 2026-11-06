import { mix, role } from "../recipes/shared";
import { BODIES, LABELS, TITLES, definePack, roles, zhEnJaKo } from "../types";
import { menubar, palette, picked, short, sidebar, toolbar, tree } from "./desk";

/* the Dark Modern and Light Modern theme files in VS Code's own repository. What gives it away beyond the charcoal: the
 * activity bar of bare icons with a 2px bar beside the chosen one, trees of 22px rows with twisties, square editor tabs
 * with a line along the chosen one's top and its close button, the status bar along the foot (the classic blue, which
 * is what the product is known by), 2px corners, 1px focus borders in the accent, and the quick pick at the top. */

/** the classic status bar, and what is written on it */
const STATUS = "#007ACC";
/** the line between the workbench's parts: the sidebar, the tabs, the panels */
const SEAM = role("outline-variant");
/** a list's chosen row while it has focus: the selection fill, a 1px focus border inside it */
const CHOSEN = `background-color:${role("primary-container")};color:${role("on-surface")};box-shadow:inset 0 0 0 1px ${role("primary")}`;
const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const FIELDS = ":is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group],[data-surface=field])";
const MENUS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content])";
const MENU_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger])";

export default definePack({
  key: "vscode",
  name: zhEnJaKo("VS Code", "VS Code", "VS Code", "VS Code"),
  hint: zhEnJaKo("开发工具：炭灰面板、灰线、单一蓝色、方正紧凑", "Developer tool: charcoal panels, grey lines, one blue, square and dense", "開発ツール：炭色のパネル", "개발 도구: 숯색 패널"),
  refs: ["VS Code", "Cursor"],
  basis: "official",
  group: "desktop",
  seed: "#0078D4",
  mode: "dark",
  light: roles({ p: ["#005FB8", "#FFFFFF"], pc: ["#D6E8F8", "#003A70"], s: ["#616161", "#FFFFFF"], sc: ["#E5E5E5", "#3B3B3B"], t: ["#0F7B6C", "#FFFFFF"], tc: ["#D2F2EC", "#0A3D35"], bg: ["#FFFFFF", "#F8F8F8", "#F8F8F8", "#F2F2F2", "#E5E5E5"], text: ["#3B3B3B", "#616161"], line: ["#8A8A8A", "#E5E5E5"] }),
  dark: roles({ p: ["#0078D4", "#FFFFFF"], pc: ["#04395E", "#CCCCCC"], s: ["#9D9D9D", "#181818"], sc: ["#313131", "#CCCCCC"], t: ["#4EC9B0", "#0B2A24"], tc: ["#0B3A33", "#BFF0E6"], bg: ["#1F1F1F", "#181818", "#181818", "#252526", "#2B2B2B"], text: ["#CCCCCC", "#9D9D9D"], line: ["#7A7A7A", "#2B2B2B"] }),
  shape: "square",
  font: "segoe",
  icons: "codicon",
  motion: "standard",
  control: "small",
  pill: "round",
  compact: true,
  tokens: { tabOn: "#0078D4" },
  recipes: { picker: "boxed", button: "flat", surface: "line", tabs: "topline", toggle: "outline", slider: "thin", nav: "icononly", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "tag", card: "outlined", segmented: "boxed", appbar: "compact", search: "boxed", input: "boxed", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "light", fab: "flat", badge: "pill", icon: "muted", scroll: "block" },
  art: "dark code editor workspace, charcoal panels, thin grey lines, a single blue accent",
  ux: { margin: 12, gap: 8, tight: 0, nav: "rail" },
  layout: { zh: "最左一列窄图标栏，旁边是树形侧栏，中间是方正的标签页和内容，最底下一条细状态栏。", en: "A narrow column of icons at the far left, a tree sidebar beside it, square tabs over the content, a thin status bar along the foot." },
  /* the workbench's 13px words; titles barely larger, never heavy */
  type: { "headline-large": [26, 32, 600, 0], "headline-medium": [22, 28, 600, 0], "headline-small": [18, 24, 600, 0], ...TITLES([16, 22, 600, 0], [14, 20, 600, 0], [13, 18, 600, 0]), ...BODIES([13, 18, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([13, 18, 400, 0], [12, 16, 400, 0], [11, 14, 400, 0]) },
  css: [
    /* buttons: 2px corners, 26px, 13px words; the secondary one grey, not outlined */
    `[data-button]{border-radius:2px}
[data-button]:is([data-size=sm],[data-size=default]){height:26px;padding-inline:12px;font-size:13px}
[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${role("secondary-container")};color:${role("on-secondary-container")};border:1px solid transparent;box-shadow:none}`,
    /* inputs and dropdowns: a grey box with a 1px border that turns the accent when focused, nothing more */
    `${FIELDS}{border:1px solid ${mix("on-surface", 14)};border-radius:2px;background-color:${role("surface-container-highest")};box-shadow:none}
${FIELDS}:focus-within{border-color:${role("primary")};box-shadow:none}
[data-slot=checkbox]{border-width:1px;border-color:${mix("on-surface", 22)};border-radius:3px;background-color:${role("surface-container-highest")}}
[data-slot=checkbox][data-checked]{background-color:${role("primary")};border-color:${role("primary")}}
[data-slot=radio-group-item]{border-width:1px}`,
    /* the slider has no VS Code of its own: a thin rail and a small round thumb, as its settings' range would draw */
    `[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:2px}
[data-slot=slider-rest]{background-color:${mix("on-surface", 22)}}
[data-slot=slider] [data-slot=slider-thumb]{width:12px;height:12px;border-radius:50%;background-color:${role("primary")};box-shadow:none}`,
    /* the activity bar: bare icons, grey, the chosen one bright with a 2px bar at its left; no FAB, its button an icon too */
    `[data-slot=navigation-rail]{background-color:${role("surface-container-low")};border-right:1px solid ${SEAM};gap:0;padding-top:4px}
[data-slot=navigation-rail] [data-slot=nav-item]{height:48px}
[data-slot=navigation-rail] [data-slot=icon]{width:24px;height:24px;color:${role("on-surface-variant")}}
[data-slot=navigation-rail] [data-slot=nav-item][data-active] *{color:${role("on-surface")}}
[data-slot=navigation-rail] [data-slot=nav-item][data-active]::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background-color:${role("primary")}}
[data-slot=navigation-rail-header]{gap:0;padding-bottom:0}
[data-slot=navigation-rail] [data-slot=fab]{width:48px;height:48px;background-color:transparent;box-shadow:none;border:0;color:${role("on-surface-variant")}}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;left:30%;right:30%;top:0;height:2px;background-color:${role("primary")}}`,
    /* the side bar: a section head in small capitals, rows of 22px, the chosen one the list's selection */
    sidebar(22, "0", 16),
    `[data-slot=sidebar]{background-color:${role("surface-container-low")}}
[data-slot=sidebar-group-label]{height:22px;text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.02em}
[data-slot=sidebar-menu]{gap:0}
[data-slot=sidebar-menu-button][data-active]{${CHOSEN}}
[data-slot=sidebar-menu-button][data-active] [data-slot=icon]{color:${role("on-surface")}}
[data-slot=side-tabs-item]{border-radius:0}
[data-slot=side-tabs-item][data-active]{${CHOSEN}}`,
    tree(22, "0"),
    `[data-slot=tree-row]{font-size:13px}
[data-slot=tree-row][data-active]{${CHOSEN}}
[data-slot=item][data-active]{${CHOSEN}}`,
    /* the side bar's sections: a 22px head in small bold capitals, its twisty at the left, a seam above each */
    `[data-slot=accordion]{gap:0}
[data-slot=accordion-item]{border-radius:0;background-color:transparent;border-top:1px solid ${SEAM}}
[data-slot=accordion-trigger]{justify-content:flex-start;gap:4px;min-height:22px;padding-inline:4px;text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.02em;color:${role("on-surface")}}
[data-slot=accordion-trigger-icon]{order:-1;margin-left:0;width:16px;height:16px}
[data-slot=accordion-content]{padding-inline:20px;font-size:13px}`,
    /* editor tabs: square, as wide as their words, a seam between them, the chosen one the editor's color with a line on
       top and its close button */
    `[data-slot=tabs-list]{height:35px;justify-content:flex-start;border-bottom:1px solid ${SEAM}}
[data-slot=tabs-trigger]{flex:none;padding-inline:10px;gap:6px;font-size:13px;font-weight:400;color:${role("on-surface-variant")}}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};font-weight:400}
[data-slot=tabs-trigger][data-active] [data-slot=tabs-close]{display:inline-flex;align-items:center;color:${role("on-surface")}}
[data-slot=tabs-close] [data-slot=icon]{width:16px;height:16px}`,
    /* menus: the workbench's own, a hairline and a deep shade, 5px corners; the hovered row in the accent */
    `${MENUS}{border-radius:5px;border:1px solid ${mix("on-surface", 18)};background-color:${role("surface")};box-shadow:0 2px 8px rgb(0 0 0/.36);padding:4px 0}
${MENU_ROWS}{min-height:24px;padding:2px 20px 2px 12px;margin-inline:4px;border-radius:3px;font-size:13px}
${MENU_ROWS}:is([data-highlighted],:focus){background-color:${role("primary")};color:${role("on-primary")}}`,
    picked,
    short(26),
    `[data-slot=select-trigger]{height:26px;min-height:26px}`,
    menubar(22, "3px"),
    toolbar("4px"),
    /* the quick pick: hanging from the top of the window, a short field with a focus border, 22px rows, the chosen one
       the list's selection */
    palette(22, "6px"),
    `[data-slot=command]{border:1px solid ${mix("on-surface", 12)};box-shadow:0 0 8px 2px rgb(0 0 0/.36);background-color:${role("surface-container-high")}}
[data-slot=command] [data-slot=input-group]{height:26px;border-color:${role("primary")}}
[data-slot=command-item]{border-radius:3px}
[data-slot=command-item][data-selected=true]{${CHOSEN}}`,
    /* dialogs: square-ish, the buttons at the right, the confirming one the accent and the other grey */
    `${DIALOG}{border-radius:6px;padding:20px;border:1px solid ${mix("on-surface", 12)};background-color:${role("surface-container-high")};box-shadow:0 0 8px 2px rgb(0 0 0/.36)}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:13px;line-height:18px;font-weight:600}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{background-color:${role("secondary-container")};color:${role("on-secondary-container")}}
[data-slot=dialog-close][data-tap=confirm]{background-color:${role("primary")};color:${role("on-primary")}}`,
    /* tables and the settings' rows: dense, a seam under the header only */
    `[data-slot=table-head]{height:28px;padding-inline:8px;font-size:12px;font-weight:600;color:${role("on-surface")}}
[data-slot=table-cell]{height:24px;padding-inline:8px}
[data-slot=table-row]{border-bottom-color:transparent}
[data-slot=table-header] [data-slot=table-row]{border-bottom-color:${SEAM}}
[data-slot=table-row][data-state=selected]{${CHOSEN}}`,
    /* the window: a 35px bar in the side bar's color, the title centered and grey; the status bar the classic blue */
    `[data-slot=title-bar]{height:35px;background-color:${role("surface-container-low")};border-bottom:1px solid ${SEAM}}
[data-slot=title-bar-title]{font-size:12px;font-weight:400;color:${role("on-surface-variant")}}
[data-slot=title-bar][data-controls=windows] [data-slot=title-bar-icon]{display:inline-flex;color:${role("primary")}}
[data-slot=window]{border-radius:6px;border-color:${SEAM}}
[data-slot=status-bar]{height:22px;gap:6px;padding-inline:8px;background-color:${STATUS};color:#fff;font-size:12px;border-top:0}
[data-slot=status-bar] [data-slot=icon]{color:#fff;width:14px;height:14px}
:is([data-slot=code-block],[data-slot=file-diff]){border-radius:0}
[data-slot=file-diff-row]:is([data-kind=added],[data-kind=removed]){color:${role("on-surface")}}
[data-slot=file-diff-row][data-kind=added]{background-color:rgb(156 204 44/.2)}
[data-slot=file-diff-row][data-kind=removed]{background-color:rgb(255 0 0/.2)}
[data-slot=card]{border-radius:4px}
[data-slot=tooltip-content]{border-radius:3px;font-size:12px;box-shadow:0 2px 8px rgb(0 0 0/.36)}
[data-slot=alert]{border-radius:2px;border:1px solid ${SEAM};border-left:3px solid ${role("primary")}}
[data-slot=alert] [data-slot=icon]{color:${role("primary")}}`,
  ].join("\n"),
});
