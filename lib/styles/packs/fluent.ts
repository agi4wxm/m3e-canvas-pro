import { mix, role } from "../recipes/shared";
import { BODIES, LABELS, TITLES, definePack, roles, say } from "../types";
import { menubar, palette, picked, short, sidebar, toolbar, tree, windowsCaption } from "./desk";

/* Microsoft's Fluent 2 tokens and Windows geometry doc: 4px controls, 8px dialogs and flyouts, 32px controls, a 40x20
 * switch, Segoe's ramp with 14px body words. What gives it away beyond the colors: a short accent bar beside the chosen
 * row of a nav pane and under the chosen tab, the accent line at the foot of a focused field, acrylic flyouts, a
 * slider's thumb that is an accent dot ringed in white, and a window's caption buttons at its right. */

const STROKE = mix("outline", 35, role("outline-variant"));
/* Fluent's shadow ramp: a hairline of shade all round and a soft drop, deeper the higher a surface stands */
const SHADOW4 = "0 0 2px rgb(0 0 0/.12),0 2px 4px rgb(0 0 0/.14)";
const SHADOW16 = "0 0 2px rgb(0 0 0/.12),0 8px 16px rgb(0 0 0/.14)";
const SHADOW64 = "0 0 8px rgb(0 0 0/.12),0 32px 64px rgb(0 0 0/.14)";
/** the bar beside a chosen row, or under a chosen tab */
const BAR = `content:"";position:absolute;border-radius:2px;background-color:${role("primary")}`;
const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const FOOT = ":is([data-slot=dialog-footer],[data-slot=alert-dialog-footer])";
const FIELDS = ":is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=native-select],[data-slot=input-group],[data-surface=field])";
const FLYOUTS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content],[data-slot=popover-content],[data-slot=hover-card-content])";
const FLYOUT_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger],[data-slot=command-item])";

export default definePack({
  key: "fluent",
  name: say("Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office"),
  hint: say("Fluent：小圆角、细边框、紧凑、微软蓝", "Fluent: small corners, hairlines, compact, Microsoft blue", "Fluent：小さな角丸と細線", "Fluent: 작은 모서리와 가는 선"),
  refs: ["Windows 11", "Microsoft 365", "Teams", "Edge"],
  basis: "official",
  group: "desktop",
  seed: "#0F6CBD",
  mode: "light",
  light: roles({ p: ["#0F6CBD", "#FFFFFF"], pc: ["#CFE4FA", "#0A3A66"], s: ["#616161", "#FFFFFF"], sc: ["#FFFFFF", "#242424"], t: ["#03787C", "#FFFFFF"], tc: ["#C3F1F2", "#012728"], bg: ["#FAFAFA", "#FFFFFF", "#FFFFFF", "#F5F5F5", "#EBEBEB"], text: ["#242424", "#616161"], line: ["#8A8A8A", "#E0E0E0"] }),
  dark: roles({ p: ["#479EF5", "#04213B"], pc: ["#0C3B5E", "#CFE4FA"], s: ["#ADADAD", "#242424"], sc: ["#3D3D3D", "#FFFFFF"], t: ["#4BC4C8", "#00292B"], tc: ["#024B4E", "#C3F1F2"], bg: ["#1F1F1F", "#292929", "#292929", "#333333", "#3D3D3D"], text: ["#FFFFFF", "#ADADAD"], line: ["#6E6E6E", "#525252"] }),
  shape: "square",
  font: "segoe",
  icons: "fluentui",
  motion: "standard",
  control: "medium",
  pill: "round",
  compact: true,
  tokens: { tonedLine: "#D1D1D1" },
  screen: "radial-gradient(90% 60% at 80% 0%, rgb(15 108 189 / 0.05), transparent 70%)",
  recipes: { picker: "boxed", button: "flat", surface: "line", tabs: "underline", toggle: "outline", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "outlined", segmented: "boxed", appbar: "compact", search: "boxed", input: "boxed", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "light", fab: "flat", badge: "pill", icon: "muted", scroll: "thin" },
  art: "soft translucent layers, gentle blue wallpaper bloom, calm productivity",
  ux: { margin: 16, gap: 12, tight: 0, nav: "keep" },
  layout: { zh: "宽屏时左侧导航窗格，顶部命令栏，内容是紧凑的列表和表单；控件矮、边距小，信息密度高。", en: "A navigation pane on the left when wide, a command bar on top, compact lists and forms below; short controls, small margins, dense." },
  /* Segoe's ramp: 14px body, 12px caption, semibold titles */
  type: { "display-small": [40, 52, 600, 0], "headline-large": [32, 40, 600, 0], "headline-medium": [28, 36, 600, 0], "headline-small": [24, 32, 600, 0], ...TITLES([20, 28, 600, 0], [16, 22, 600, 0], [14, 20, 600, 0]), ...BODIES([14, 20, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 400, 0], [12, 16, 400, 0], [10, 14, 400, 0]) },
  css: [
    /* buttons: semibold words; the secondary one white with a stroke, as a Windows app's are */
    `[data-button]{font-weight:600}
[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${STROKE};box-shadow:none}`,
    /* fields: a stroke, darker along the foot; focused, the accent along the foot and nothing else */
    `${FIELDS}{border:1px solid ${STROKE};border-bottom-color:${role("on-surface-variant")};border-radius:4px;background-color:${role("surface-container-low")};box-shadow:none}
${FIELDS}:focus-within{border-color:${STROKE};border-bottom-color:${role("primary")};box-shadow:inset 0 -1px 0 ${role("primary")}}`,
    /* check boxes and radios: a 1px edge, 4px corners on the box */
    `[data-slot=checkbox]{border-width:1px;border-radius:4px}
[data-slot=checkbox][data-checked]{border-color:${role("primary")}}
[data-slot=radio-group-item]{border-width:1px}
[data-slot=radio-group-item][data-checked]{border-color:${role("primary")}}`,
    /* the slider: a 4px rail of grey, the accent up to a 20px thumb that is an accent dot ringed in white */
    `[data-slot=slider-rest]{background-color:${mix("on-surface", 45)}}
[data-slot=slider] [data-slot=slider-thumb]{width:20px;height:20px;border-radius:50%;background-color:${role("primary")};box-shadow:inset 0 0 0 4px ${role("surface-container-low")},0 0 0 1px ${STROKE},0 1px 2px rgb(0 0 0/.12)}`,
    /* the TabList: words in grey, the chosen one semibold over a 3px accent bar; tabs as wide as their words, from the left */
    `[data-slot=tabs-list]{justify-content:flex-start;gap:0}
[data-slot=tabs-trigger]{flex:none;padding-inline:12px;color:${role("on-surface-variant")};font-weight:400}
[data-slot=tabs-list] [data-slot=tabs-indicator]{height:3px;border-radius:2px;left:calc(var(--active-tab-left) + 12px);width:calc(var(--active-tab-width) - 24px)}`,
    /* the nav pane: rows of 36px, the chosen one on a soft fill with a short accent bar at its left; Teams' app bar the
       same bar beside the chosen icon */
    sidebar(36, "4px", 20),
    `[data-slot=sidebar-menu-button][data-active]{background-color:${mix("on-surface", 6)};color:${role("on-surface")};font-weight:400}
[data-slot=sidebar-menu-button][data-active] [data-slot=icon]{color:${role("primary")}}
[data-slot=sidebar-menu-button][data-active]::before{${BAR};left:0;top:50%;translate:0 -50%;width:3px;height:16px}
[data-slot=navigation-rail] [data-slot=nav-item][data-active]::before{${BAR};left:0;top:50%;translate:0 -50%;width:3px;height:28px}
[data-slot=navigation-rail] [data-slot=nav-label]{font-size:11px}
[data-slot=side-tabs-item][data-active]{background-color:${mix("on-surface", 6)};color:${role("on-surface")}}`,
    tree(32, "4px"),
    `[data-slot=tree-row][data-active]{position:relative;background-color:${mix("on-surface", 6)};color:${role("on-surface")}}
[data-slot=tree-row][data-active]::before{${BAR};left:0;top:50%;translate:0 -50%;width:3px;height:16px}`,
    /* flyouts: acrylic, 8px corners, a hairline and a deep soft shadow; rows of 32px with 4px corners */
    `${FLYOUTS}{border-radius:8px;border:1px solid ${mix("on-surface", 8)};background-color:${mix("surface-container-low", 88)};-webkit-backdrop-filter:blur(30px) saturate(1.25);backdrop-filter:blur(30px) saturate(1.25);box-shadow:${SHADOW16}}
${FLYOUT_ROWS}{min-height:32px;border-radius:4px;font-size:14px}`,
    picked,
    short(32),
    palette(36, "8px"),
    `[data-slot=command-item][data-selected=true]{position:relative;background-color:${mix("on-surface", 6)}}
[data-slot=command-item][data-selected=true]::before{${BAR};left:0;top:50%;translate:0 -50%;width:3px;height:16px}`,
    menubar(28, "4px"),
    toolbar("8px"),
    /* dialogs: 8px, white, the deepest shadow; a 20px semibold title; the buttons at the right, the one that confirms in
       the accent, the other a secondary button */
    `${DIALOG}{border-radius:8px;padding:24px;gap:8px;background-color:${role("surface-container-low")};border:1px solid ${mix("on-surface", 6)};box-shadow:${SHADOW64}}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:20px;line-height:28px;font-weight:600}
${FOOT}{margin-top:16px;gap:8px}
${FOOT} [data-button]{min-width:96px}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${STROKE}}
[data-slot=dialog-close][data-tap=confirm]{background-color:${role("primary")};color:${role("on-primary")};border-color:transparent}`,
    /* cards stand on Fluent's shadow, not a line */
    `:is([data-slot=card],[data-surface=card],[data-slot=kanban-card]){border-color:transparent;box-shadow:${SHADOW4}}
[data-slot=card]{border-radius:4px}
[data-slot=tooltip-content]{border-color:transparent;box-shadow:0 0 2px rgb(0 0 0/.12),0 4px 8px rgb(0 0 0/.14);border-radius:4px;padding:5px 10px;font-size:12px}`,
    /* tables: 40px rows, a semibold header in the body color */
    `[data-slot=table-head]{height:40px;padding-inline:12px;font-size:14px;font-weight:600;color:${role("on-surface")}}
[data-slot=table-cell]{height:40px;padding-inline:12px}
[data-slot=table-row][data-state=selected]{background-color:${mix("on-surface", 6)};color:${role("on-surface")}}`,
    /* the window: its bar is Mica, the window's own ground, with a Windows app's caption buttons */
    windowsCaption,
    `[data-slot=title-bar]{background-color:${role("surface")};border-bottom:0}
[data-slot=title-bar-icon]{color:${role("primary")}}
[data-slot=window]{border-radius:8px;box-shadow:0 0 8px rgb(0 0 0/.12),0 16px 32px rgb(0 0 0/.14)}
[data-slot=status-bar]{height:24px;font-size:12px;background-color:${role("surface-container-high")};border-top:1px solid ${role("outline-variant")}}`,
    /* the MessageBar: a quiet band with a stroke, its icon in the accent */
    `[data-slot=alert]{border-radius:4px;border:1px solid ${role("outline-variant")};padding:10px 12px}
[data-slot=alert] [data-slot=icon]{color:${role("primary")}}
[data-slot=steps-number]{width:20px;height:20px;font-size:12px}`,
  ].join("\n"),
});
