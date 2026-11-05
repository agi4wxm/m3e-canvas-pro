import { mix, role } from "../recipes/shared";
import { definePack, roles, zhEnJaKo } from "../types";
import { menubar, palette, picked, short, sidebar, toolbar, tree } from "./desk";

/* Ant Design's seed tokens and Ant Design Mobile's theme file. What gives it away beyond the blue: 32px controls with
 * 6px corners and a 1px grey border that turns blue with a soft ring, white default buttons, the ink bar under the
 * chosen tab with its words blue, the chosen menu row on a pale blue, Steps of numbered circles joined by lines, square
 * pagination with the current page outlined, tags of 22px with a border, alerts tinted by their kind, tables with a
 * grey header, and a modal's buttons at the right. On a phone the same pack reads as Alipay: centered bars, rows with
 * a light arrow, white groups on grey. */

/** antd's pale blue of a chosen row, and the lighter blue of a border that leads to it */
const SELECTED_BG = mix("primary", 10, role("surface-container-low"));
const SPLIT = mix("on-surface", 6);
/** the dropdown's shadow, "boxShadowSecondary" */
const DROP = "0 6px 16px 0 rgb(0 0 0/.08),0 3px 6px -4px rgb(0 0 0/.12),0 9px 28px 8px rgb(0 0 0/.05)";
const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const MENUS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content],[data-slot=popover-content])";
const MENU_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger])";
const DEFAULT_BUTTONS = "[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated])";

export default definePack({
  key: "antd",
  name: zhEnJaKo("支付宝 / 钉钉", "Ant Design", "Ant Design", "Ant Design"),
  hint: zhEnJaKo("Ant Design：灰底白卡片、科技蓝、中后台和国内企业软件", "Ant Design: white cards on pale grey, tech blue, Chinese business software", "Ant Design：業務ソフトの定番", "Ant Design: 업무용 소프트웨어"),
  refs: ["Alipay", "DingTalk", "Feishu", "Ant Design"],
  basis: "official",
  group: "desktop",
  seed: "#1677FF",
  mode: "light",
  light: { ...roles({ p: ["#1677FF", "#FFFFFF"], pc: ["#E6F4FF", "#003EB3"], s: ["#595959", "#FFFFFF"], sc: ["#FFFFFF", "#262626"], t: ["#FAAD14", "#2B1D00"], tc: ["#FFF7E6", "#613400"], bg: ["#F5F5F5", "#FFFFFF", "#FFFFFF", "#FAFAFA", "#F0F0F0"], text: ["#1F1F1F", "#595959"], line: ["#8C8C8C", "#D9D9D9"] }), error: "#FF4D4F", onError: "#FFFFFF" },
  dark: { ...roles({ p: ["#1668DC", "#FFFFFF"], pc: ["#111A2C", "#A5C8FF"], s: ["#A6A6A6", "#141414"], sc: ["#1F1F1F", "#E6E6E6"], t: ["#D89614", "#1F1400"], tc: ["#2B2111", "#FFE3A6"], bg: ["#000000", "#141414", "#141414", "#1F1F1F", "#262626"], text: ["#E6E6E6", "#A6A6A6"], line: ["#7A7A7A", "#424242"] }), error: "#DC4446", onError: "#FFFFFF" },
  loud: ["primary", "error"],
  shape: "soft",
  font: "inter",
  icons: "ant",
  motion: "standard",
  control: "medium",
  pill: "round",
  compact: true,
  tokens: { toggleOn: "#1677FF", tonedLine: "#D9D9D9" },
  recipes: { picker: "boxed", button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "ring", bar: "line", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "headed", segmented: "boxed", appbar: "center", search: "filled", input: "boxed", progress: "track", row: "arrow", menu: "compact", sheet: "weui", tooltip: "dark", fab: "round", badge: "pill", scroll: "thin" },
  art: "clean enterprise dashboard, white cards on pale grey, confident blue accent, tidy tables",
  ux: { margin: 16, gap: 16, tight: 8, nav: "keep" },
  layout: { zh: "宽屏时左侧菜单、顶部面包屑，灰底上放白色卡片，卡片里是数据表格和表单；手机上是灰底白卡片加四个底部标签。", en: "A menu on the left and breadcrumbs on top when wide, white cards on grey holding tables and forms; on a phone, white cards on grey with four bottom tabs." },
  css: [
    /* buttons: 32px, 6px, 14px words at regular weight; the default one white with a grey border and the faintest drop */
    `[data-button]{border-radius:6px;font-weight:400}
[data-button]:is([data-size=sm],[data-size=default]){height:32px;padding-inline:15px;font-size:14px}
[data-button]:is([data-variant=filled],[data-variant=default]){box-shadow:0 2px 0 ${mix("primary", 10)}}
${DEFAULT_BUTTONS}{background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${role("outline-variant")};box-shadow:0 2px 0 rgb(0 0 0/.02)}`,
    /* fields: 32px, 6px, the grey border; the ring recipe turns it blue with a soft glow */
    `:is([data-slot=input],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group]){border-radius:6px;min-height:32px}
[data-slot=select-trigger]{border:1px solid ${role("outline-variant")};background-color:${role("surface-container-low")}}
[data-slot=checkbox]{width:16px;height:16px;border-width:1px;border-color:${role("outline-variant")};border-radius:4px}
[data-slot=checkbox][data-checked]{border-color:${role("primary")}}
[data-slot=radio-group-item]{width:16px;height:16px;border-width:1px;border-color:${role("outline-variant")}}
[data-slot=radio-group-item][data-checked]{border-color:${role("primary")};background-color:${role("primary")}}
[data-slot=radio-group-indicator]{width:6px;height:6px;background-color:#fff}`,
    /* the switch: 44 by 22, grey off and blue on, an 18px white handle with a shadow */
    `[data-slot=switch][data-size=default]{width:44px;height:22px;background-color:${mix("on-surface", 25)}}
[data-slot=switch][data-size=default][data-checked]{background-color:var(--st-toggle-on)}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:18px;height:18px;translate:2px -50%;box-shadow:0 2px 4px 0 rgb(0 35 11/.2)}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:24px -50%}`,
    /* the slider: a 4px grey rail, a pale blue track, a 10px white handle ringed in the pale blue */
    `[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:4px}
[data-slot=slider-rest]{background-color:${mix("on-surface", 6)}}
[data-slot=slider-range]{opacity:.5}
[data-slot=slider] [data-slot=slider-thumb]{width:10px;height:10px;border-radius:50%;background-color:${role("surface-container-low")};box-shadow:0 0 0 2px ${mix("primary", 50, role("surface-container-low"))}}`,
    /* Tabs: words from the left 32px apart, a hairline across, the chosen one blue over a 2px ink bar */
    `[data-slot=tabs-list]{justify-content:flex-start;gap:32px;border-bottom:1px solid ${SPLIT}}
[data-slot=tabs-trigger]{flex:none;padding-inline:0;border-radius:0;font-size:14px;font-weight:400;color:${role("on-surface")}}
[data-slot=tabs-trigger][data-active]{color:${role("primary")};font-weight:400}
[data-slot=tabs-list] [data-slot=tabs-indicator]{height:2px;border-radius:0}`,
    /* Menu: 40px rows with 8px corners, the chosen one blue on a pale blue */
    sidebar(40, "8px", 16),
    `[data-slot=sidebar-menu-button]{padding-inline:24px;font-size:14px}
[data-slot=sidebar-menu-button][data-active]{background-color:${SELECTED_BG};color:${role("primary")}}
[data-slot=sidebar-menu-button][data-active] [data-slot=icon]{color:${role("primary")}}
[data-slot=sidebar-group-label]{padding-inline:24px;font-weight:400;font-size:14px}
[data-slot=sidebar-menu]{gap:4px}
[data-slot=side-tabs-item][data-active]{background-color:${SELECTED_BG};color:${role("primary")}}
[data-slot=navigation-rail] [data-slot=nav-item][data-active] [data-slot=nav-indicator]{background-color:${SELECTED_BG};border-radius:8px}`,
    tree(28, "4px"),
    `[data-slot=tree-row][data-active]{background-color:${SELECTED_BG};color:${role("on-surface")}}`,
    /* Steps: 32px circles, the done ones pale blue with a check, the current one blue, the rest grey; a line after each title */
    `[data-slot=steps]{gap:16px}
[data-slot=steps-item]{gap:8px}
[data-slot=steps-number]{width:32px;height:32px;font-size:16px}
[data-slot=steps-item][data-state=done] [data-slot=steps-number]{background-color:${SELECTED_BG};color:${role("primary")}}
[data-slot=steps-item][data-state=done] [data-slot=steps-digit]{display:none}
[data-slot=steps-check]{display:inline-flex}
[data-slot=steps-item][data-state=todo] [data-slot=steps-number]{background-color:${mix("on-surface", 6)};color:${mix("on-surface", 65)}}
[data-slot=steps-label]{flex:none;font-size:16px;color:${role("on-surface")}}
[data-slot=steps-item][data-state=todo] [data-slot=steps-label]{color:${mix("on-surface", 45)}}
[data-slot=steps-tail]{display:block;flex:1;min-width:16px;height:1px;background-color:${role("outline-variant")}}
[data-slot=steps-item][data-state=done] [data-slot=steps-tail]{background-color:${role("primary")}}`,
    /* Pagination: 32px squares, the current page outlined in blue, its number blue and bold */
    `[data-slot=pagination-link]{min-width:32px;height:32px;padding-inline:6px;border-radius:6px;font-size:14px}
[data-slot=pagination-link][data-active]{border:1px solid ${role("primary")};color:${role("primary")};font-weight:600;background-color:${role("surface-container-low")}}
[data-slot=breadcrumb-separator] :is([data-slot=icon],[data-icon]){display:none}
[data-slot=breadcrumb-separator]::before{content:"/";color:${mix("on-surface", 45)}}
[data-slot=breadcrumb-list]{gap:8px;font-size:14px;color:${mix("on-surface", 45)}}`,
    /* Collapse: one bordered box, its headers on a faint grey with the arrow at the left */
    `[data-slot=accordion]{gap:0;border:1px solid ${role("outline-variant")};border-radius:8px;overflow:hidden}
[data-slot=accordion-item]{border-radius:0;border-bottom:1px solid ${role("outline-variant")};background-color:${role("surface-container-high")}}
[data-slot=accordion-trigger]{justify-content:flex-start;gap:12px;min-height:46px;padding-inline:16px;font-size:14px;font-weight:400;color:${role("on-surface")}}
[data-slot=accordion-trigger-icon]{order:-1;margin-left:0;width:12px;height:12px}
[data-slot=accordion-content]{padding:16px;background-color:${role("surface-container-low")};border-top:1px solid ${role("outline-variant")};color:${role("on-surface")}}`,
    /* Tag: 22px, 4px, a border; Alert: tinted by its kind */
    `:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){height:22px;padding-inline:7px;font-size:12px;border-radius:4px;border:1px solid ${role("outline-variant")};background-color:${role("surface-container-high")};color:${role("on-surface")}}
[data-slot=alert]{border-radius:8px;border:1px solid ${mix("primary", 40, role("surface-container-low"))};background-color:${SELECTED_BG};padding:8px 12px;color:${role("on-surface")}}
[data-slot=alert] [data-slot=icon]{color:${role("primary")}}
:is([data-slot=badge],[data-slot=notification-badge])[data-variant=default]{background-color:${role("error")};color:${role("on-error")};box-shadow:0 0 0 1px ${role("surface-container-low")}}`,
    /* menus: white, 8px, the dropdown shadow; 32px rows, a grey hover, the chosen one pale blue and bold */
    `${MENUS}{border:0;border-radius:8px;padding:4px;background-color:${role("surface-container-low")};box-shadow:${DROP}}
${MENU_ROWS}{min-height:32px;padding:5px 12px;border-radius:4px;font-size:14px}
${MENU_ROWS}:is([data-highlighted],:focus){background-color:${mix("on-surface", 4)}}`,
    picked,
    short(32),
    `[data-slot=select-item][data-selected]{background-color:${SELECTED_BG};font-weight:600}`,
    menubar(32, "6px"),
    toolbar("8px"),
    palette(32, "8px"),
    `[data-slot=command]{border:0;box-shadow:${DROP}}
[data-slot=command-item][data-selected=true]{background-color:${SELECTED_BG};color:${role("primary")}}`,
    /* Modal: 8px, 20px 24px, a 16px title; the buttons at the right, the confirming one blue, the other white */
    `${DIALOG}{border:0;border-radius:8px;padding:20px 24px;background-color:${role("surface-container-low")};box-shadow:${DROP}}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:16px;line-height:24px;font-weight:600;color:${role("on-surface")}}
:is([data-slot=dialog-footer],[data-slot=alert-dialog-footer]){margin-top:12px;gap:8px}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${role("outline-variant")}}
[data-slot=dialog-close][data-tap=confirm]{background-color:${role("primary")};color:${role("on-primary")}}
[data-slot=tooltip-content]{border-radius:6px;padding:6px 8px;font-size:14px}`,
    /* Table: a grey header of semibold words, 16px cells, a hairline between rows */
    `[data-slot=table-head]{height:auto;padding:12px 16px;background-color:${role("surface-container-high")};font-size:14px;font-weight:600;color:${role("on-surface")}}
[data-slot=table-cell]{height:auto;padding:12px 16px}
[data-slot=table-row]{border-bottom-color:${role("surface-container-highest")}}
[data-slot=table-row][data-state=selected]{background-color:${SELECTED_BG};color:${role("on-surface")}}
:is([data-slot=card],[data-surface=card]){border-radius:8px;border-color:${role("surface-container-highest")}}
[data-slot=kanban-card]{border-radius:6px}
[data-slot=title-bar]{background-color:${role("surface-container-low")};border-bottom:1px solid ${SPLIT}}
[data-slot=status-bar]{background-color:${role("surface-container-low")};border-top:1px solid ${SPLIT}}`,
  ].join("\n"),
});
