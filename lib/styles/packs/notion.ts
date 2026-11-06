import { UNPAINTED, mix, role } from "../recipes/shared";
import { BODIES, LABELS, TITLES, definePack, roles, zhEnJaKo } from "../types";
import { firm, menubar, palette, picked, short, sidebar, toolbar, tree } from "./desk";

/* secondary sources for its text and sidebar colors; it publishes none. What gives it away beyond the warm white: almost
 * nothing has an edge, a row is only a grey fill under the pointer or when chosen, toggles open by a small triangle at
 * their left, callouts are grey blocks, a database table is ruled in both directions, cards and menus float on a soft
 * layered shadow, and the switch and the check boxes are small and blue. */

/** the grey under a hovered or chosen row */
const HOVER = mix("on-surface", 8);
/** Notion's layered shadow: a hairline ring, a near shade and a far one */
const FLOAT = "0 0 0 1px rgb(15 15 15/.05),0 3px 6px rgb(15 15 15/.1),0 9px 24px rgb(15 15 15/.2)";
const RING = `inset 0 0 0 1px ${mix("on-surface", 12)}`;
const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const MENUS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content],[data-slot=popover-content])";
const MENU_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger])";
const FIELDS = ":is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group],[data-surface=field])";

export default definePack({
  key: "notion",
  name: zhEnJaKo("Notion", "Notion", "Notion", "Notion"),
  hint: zhEnJaKo("文档工具：暖白、柔灰、细线、几乎没有颜色", "Document tool: warm white, soft grey, hairlines, almost no color", "文書ツール：温かい白と細線", "문서 도구: 따뜻한 흰색과 가는 선"),
  refs: ["Notion"],
  basis: "observed",
  group: "desktop",
  seed: "#2383E2",
  mode: "light",
  light: roles({ p: ["#2383E2", "#FFFFFF"], pc: ["#E7F3FC", "#0B4A80"], s: ["#64635E", "#FFFFFF"], sc: ["#F1F1EF", "#37352F"], t: ["#B35C00", "#FFFFFF"], tc: ["#FAEBDD", "#5A2C00"], bg: ["#FFFFFF", "#F7F6F3", "#F7F6F3", "#F1F1EF", "#EBEAE6"], text: ["#37352F", "#64635E"], line: ["#91908C", "#E9E9E7"] }),
  dark: roles({ p: ["#2383E2", "#FFFFFF"], pc: ["#1F3A54", "#CFE6FA"], s: ["#A6A6A6", "#191919"], sc: ["#2C2C2C", "#D4D4D4"], t: ["#FFA344", "#2B1600"], tc: ["#4A2F12", "#FFE2C2"], bg: ["#191919", "#202020", "#252525", "#2C2C2C", "#2F2F2F"], text: ["#D4D4D4", "#A6A6A6"], line: ["#7F7F7F", "#2F2F2F"] }),
  loud: ["primary"],
  shape: "square",
  font: "inter",
  icons: "lucide",
  motion: "standard",
  control: "medium",
  pill: "round",
  tokens: { toggleOn: "#2383E2", tabOn: "var(--md-sys-color-on-surface)" },
  recipes: { picker: "boxed", button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "tag", card: "outlined", segmented: "underline", appbar: "large", search: "filled", input: "boxed", progress: "thin", row: "dense", divider: "hairline", menu: "compact", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", icon: "muted", scroll: "thin" },
  art: "quiet paper-like workspace, warm off-white, soft grey lines, hand-drawn doodle spot illustrations",
  ux: { margin: 20, gap: 12, tight: 0, nav: "keep" },
  layout: { zh: "像一页纸：大标题在左上，正文宽松，页面元素不加框，靠缩进和留白分层，几乎没有颜色。", en: "Like a page of paper: a large title at the upper left, roomy text, elements without boxes, layered by indent and white space, almost no color." },
  type: { "headline-large": [40, 48, 700, 0], "headline-medium": [30, 38, 700, 0], "headline-small": [24, 32, 600, 0], ...TITLES([20, 28, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  css: [
    /* buttons: 28px, 6px corners; the secondary one white with a ring and the faintest drop, the text one grey */
    `[data-button]{border-radius:6px;font-weight:500}
[data-button]:is([data-size=sm],[data-size=default]){height:28px;padding-inline:10px;font-size:14px}
[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${role("surface")};color:${role("on-surface")};border:0;box-shadow:${RING},0 1px 2px rgb(15 15 15/.1)}
[data-button][data-variant=text]{color:${role("on-surface-variant")}}`,
    /* fields: a faint grey box with an inner ring; focused, a blue ring */
    `${FIELDS}{border:0;border-radius:6px;background-color:${mix("surface-container-high", 60)};box-shadow:${RING}}
${FIELDS}:focus-within{box-shadow:inset 0 0 0 1px ${mix("primary", 57)},0 0 0 2px ${mix("primary", 35)}}
[data-slot=switch][data-size=default]{width:30px;height:18px}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:14px;height:14px;translate:2px -50%;box-shadow:none}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:14px -50%}
[data-slot=checkbox]{width:16px;height:16px;border-width:1.5px;border-radius:3px}
[data-slot=checkbox][data-checked]{border-color:${role("primary")}}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:4px}
[data-slot=slider-rest]{background-color:${HOVER}}
[data-slot=slider] [data-slot=slider-thumb]{width:14px;height:14px;box-shadow:0 0 0 1px rgb(15 15 15/.1),0 2px 4px rgb(15 15 15/.2)}`,
    /* the sidebar: 30px rows of grey words with 6px corners, the chosen one on the hover grey */
    sidebar(30, "6px", 18),
    `[data-slot=sidebar]{background-color:${role("surface-container-low")}}
[data-slot=sidebar-menu-button]{color:${role("on-surface-variant")};font-weight:500;font-size:14px}
[data-slot=sidebar-menu-button][data-active]{background-color:${HOVER};color:${role("on-surface")}}
[data-slot=sidebar-group-label]{font-size:12px;font-weight:500}
[data-slot=side-tabs-item]{border-radius:6px}
[data-slot=side-tabs-item][data-active]{background-color:${HOVER};color:${role("on-surface")}}`,
    tree(28, "6px"),
    `[data-slot=tree-row]{color:${role("on-surface-variant")}}
[data-slot=tree-row][data-active]{background-color:${HOVER};color:${role("on-surface")}}`,
    /* a database's view tabs: words from the left, the chosen one dark over a dark line */
    `[data-slot=tabs-list]{justify-content:flex-start;gap:4px;border-bottom:1px solid ${role("outline-variant")}}
[data-slot=tabs-trigger]{flex:none;padding-inline:8px;font-size:14px;font-weight:500;color:${role("on-surface-variant")}}
[data-slot=tabs-list] [data-slot=tabs-indicator]{height:2px;border-radius:0}`,
    /* toggles: a small triangle at the left of the words, no lines between them */
    `[data-slot=accordion]{gap:0}
[data-slot=accordion-item]{background-color:transparent;border:0;border-radius:0}
[data-slot=accordion-trigger]{justify-content:flex-start;gap:4px;min-height:30px;padding-inline:2px;font-size:16px;font-weight:400;border-radius:6px}
[data-slot=accordion-trigger-icon]{order:-1;margin-left:0;width:18px;height:18px;color:${role("on-surface-variant")}}
[data-slot=accordion-content]{padding-left:26px;font-size:16px;color:${role("on-surface")}}`,
    /* callouts: a grey block with the icon at its left, no edge */
    `[data-slot=alert]{border:0;border-radius:4px;background-color:${role("surface-container-high")};padding:16px 16px 16px 12px;color:${role("on-surface")}}
[data-slot=alert] [data-slot=icon]{color:${role("on-surface")}}
[data-slot=alert-title]{font-weight:600}
[data-slot=alert-description]{color:${role("on-surface")}}`,
    /* a database table: ruled both ways, its header grey words */
    `[data-slot=table-head]{height:34px;padding-inline:8px;font-size:14px;font-weight:400;color:${role("on-surface-variant")};border-right:1px solid ${role("outline-variant")}}
[data-slot=table-cell]{height:34px;padding-inline:8px;border-right:1px solid ${role("outline-variant")}}
[data-slot=table-row]{border-bottom-color:${role("outline-variant")}}
[data-slot=table-header] [data-slot=table-row]{border-top:1px solid ${role("outline-variant")}}`,
    /* the board: lanes with no ground, cards white on the layered shadow */
    `[data-slot=kanban]{background-color:transparent}
${firm("kanban-lane")}{background-color:transparent;border:0;box-shadow:none}
[data-slot=data-table]{background-color:${role("surface")}}
:is([data-slot=card],[data-surface=card],[data-slot=kanban-card]){border:0;border-radius:6px;box-shadow:0 0 0 1px rgb(15 15 15/.08),0 2px 4px rgb(15 15 15/.08)}
:is([data-slot=card],[data-surface=card],[data-slot=kanban-card])${UNPAINTED}{background-color:${role("surface")}}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){height:22px;padding-inline:6px;border:0;border-radius:3px;background-color:${mix("on-surface", 9)};color:${role("on-surface")};font-size:14px}`,
    /* menus and the search: white panels on the layered shadow, 6px rows */
    `${MENUS}{border:0;border-radius:10px;padding:6px;background-color:${role("surface")};box-shadow:${FLOAT}}
${MENU_ROWS}{min-height:28px;border-radius:6px;font-size:14px;padding-inline:8px}
${MENU_ROWS}:is([data-highlighted],:focus){background-color:${HOVER}}`,
    picked,
    short(30),
    menubar(28, "6px"),
    toolbar("8px"),
    palette(36, "12px"),
    `[data-slot=command]{border:0;background-color:${role("surface")};box-shadow:${FLOAT}}
[data-slot=command-input-wrapper]{padding:4px;border-bottom:1px solid ${role("outline-variant")}}
[data-slot=command] [data-slot=input-group]{height:44px;box-shadow:none;background-color:transparent;font-size:16px}
[data-slot=command-item]{border-radius:6px}
[data-slot=command-item][data-selected=true]{background-color:${HOVER}}`,
    /* dialogs: white, 12px, the layered shadow; the buttons at the right */
    `${DIALOG}{border:0;border-radius:12px;background-color:${role("surface")};box-shadow:${FLOAT}}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:16px;line-height:24px;font-weight:600}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{background-color:${role("surface")};color:${role("on-surface")};box-shadow:${RING}}
[data-slot=dialog-close][data-tap=confirm]{background-color:${role("primary")};color:${role("on-primary")}}
[data-slot=tooltip-content]{border-radius:6px;font-size:12px;font-weight:500}`,
    /* lists: rows are only a grey fill when chosen */
    `[data-slot=item]{border-radius:6px}
[data-slot=item][data-active]{background-color:${HOVER}}
[data-slot=title-bar]{background-color:${role("surface")};border-bottom:0}
[data-slot=title-bar-title]{font-size:14px;font-weight:400}
[data-slot=status-bar]{background-color:${role("surface")};border-top:1px solid ${role("outline-variant")};font-size:12px}`,
  ].join("\n"),
});
