import { mix, role } from "../recipes/shared";
import { BODIES, LABELS, TITLES, definePack, roles, zhEnJaKo } from "../types";
import { menubar, palette, picked, short, sidebar, toolbar, tree, windowsCaption } from "./desk";

/* blurple from Discord's brand page; the dark greys from third-party palettes. What gives it away beyond the colors:
 * the server rail of round icons, the chosen one a blurple squircle with a white pill beside it; the channel list of
 * grey rows with 4px corners; messages as rows of an avatar, a name and the words, never bubbles; context menus whose
 * hovered row turns blurple; a modal's footer on a darker band; the green switch with its knob. */

const DIALOG = ":is([data-slot=dialog-content],[data-slot=alert-dialog-content])";
const FOOT = ":is([data-slot=dialog-footer],[data-slot=alert-dialog-footer])";
const MENUS = ":is([data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content])";
const MENU_ROWS = ":is([data-slot=dropdown-menu-item],[data-slot=context-menu-item],[data-slot=menubar-item],[data-slot=select-item],[data-slot=combobox-item],[data-slot=dropdown-menu-sub-trigger])";
/** the grey of a chosen row, and of one under the pointer */
const SELECTED = mix("on-surface-variant", 24);
const RAIL = "[data-slot=navigation-rail]";

export default definePack({
  key: "discord",
  name: zhEnJaKo("Discord", "Discord", "Discord", "Discord"),
  hint: zhEnJaKo("玩家聊天：深灰分层、蓝紫主色、实心图标", "Gamer chat: layered dark greys, blurple, solid icons", "ゲーマーのチャット：濃い灰と青紫", "게이머 채팅: 짙은 회색과 파랑보라"),
  refs: ["Discord"],
  basis: "official",
  group: "desktop",
  seed: "#5865F2",
  mode: "dark",
  light: { ...roles({ p: ["#5865F2", "#FFFFFF"], pc: ["#E0E3FF", "#2A2F7A"], s: ["#4E5058", "#FFFFFF"], sc: ["#E3E5E8", "#060607"], t: ["#1A7F45", "#FFFFFF"], tc: ["#D2F5E0", "#0A3D22"], bg: ["#FFFFFF", "#F2F3F5", "#F2F3F5", "#EBEDEF", "#E3E5E8"], text: ["#060607", "#4E5058"], line: ["#80848E", "#E3E5E8"] }), error: "#DA373C", onError: "#FFFFFF" },
  dark: { ...roles({ p: ["#5865F2", "#FFFFFF"], pc: ["#3C45A5", "#E0E3FF"], s: ["#B5BAC1", "#1E1F22"], sc: ["#4E5058", "#FFFFFF"], t: ["#23A55A", "#03210F"], tc: ["#0F3D22", "#C7F2D6"], bg: ["#313338", "#2B2D31", "#2B2D31", "#383A40", "#1E1F22"], text: ["#F2F3F5", "#B5BAC1"], line: ["#80848E", "#3F4147"] }), error: "#DA373C", onError: "#FFFFFF" },
  shape: "rounded",
  font: "inter",
  icons: "remix",
  motion: "standard",
  control: "extra-small",
  pill: "round",
  compact: true,
  tokens: { toggleOn: "#23A55A", primaryText: "#006CE7", primaryTextDark: "#00A8FC" },
  recipes: { picker: "boxed", button: "flat", surface: "plain", tabs: "pill", toggle: "ios", slider: "thin", nav: "icononly", field: "soft", bar: "line", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "pill", card: "flat", segmented: "capsules", appbar: "compact", search: "filled", input: "filled", progress: "thin", row: "dense", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", scroll: "thin" },
  art: "dark gaming hub, deep grey panels, bright blurple accents, glowing avatars",
  ux: { margin: 12, gap: 8, tight: 0, nav: "rail" },
  layout: { zh: "最左一列圆形服务器图标，旁边是频道列表，再旁边是消息流，底部一个输入框。", en: "A column of round server icons at the far left, a channel list beside it, the stream of messages beside that, a composer at the foot." },
  /* gg sans's sizes: 16px messages, 14px chrome, heavy headings */
  type: { "headline-small": [24, 30, 800, 0], ...TITLES([20, 24, 700, 0], [16, 20, 600, 0], [14, 18, 600, 0]), ...BODIES([16, 22, 400, 0], [14, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 18, 500, 0], [12, 16, 600, 0], [11, 14, 600, 0.2]) },
  css: [
    /* buttons: 4px corners, medium words; the secondary one a filled grey */
    `[data-button]{font-weight:500}
[data-button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${role("secondary-container")};color:${role("on-secondary-container")};border:0;box-shadow:none}`,
    /* the switch: 40 by 24, grey when off and green when on, a white knob */
    `[data-slot=switch][data-size=default]{width:40px;height:24px}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:18px;height:18px;translate:3px -50%;box-shadow:none}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:19px -50%}
[data-slot=switch]{background-color:${mix("on-surface-variant", 45)}}
[data-slot=checkbox]{border-radius:6px;border-width:1px;border-color:${mix("on-surface-variant", 60)}}
[data-slot=checkbox][data-checked]{border-color:${role("primary")}}`,
    /* the slider: an 8px grey track, blurple up to a white grabber taller than it is wide */
    `[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:8px}
[data-slot=slider-rest]{background-color:${role("secondary-container")}}
[data-slot=slider] [data-slot=slider-thumb]{width:10px;height:24px;border-radius:3px;background-color:#fff;box-shadow:0 0 0 1px ${mix("on-surface-variant", 40)},0 3px 1px rgb(0 0 0/.12)}`,
    /* the server rail: round icons on the darkest grey; the chosen one a blurple squircle with a white pill at the rail's
       edge; the add button green; no words */
    `${RAIL}{background-color:${role("surface-container-highest")};gap:8px;padding-top:12px}
${RAIL} [data-slot=nav-item]{height:48px}
${RAIL} [data-slot=nav-indicator]{inset:auto;left:50%;top:50%;width:48px;height:48px;translate:-50% -50%;scale:1;border-radius:24px;background-color:${role("surface")}}
${RAIL} [data-slot=nav-item][data-active] [data-slot=nav-indicator]{border-radius:16px;background-color:${role("primary")}}
${RAIL} [data-slot=nav-item][data-active] *{color:${role("on-primary")}}
${RAIL} [data-slot=nav-item] [data-slot=icon]{color:${role("on-surface")}}
${RAIL} [data-slot=nav-item][data-active]::before{content:"";position:absolute;left:0;top:50%;width:4px;height:40px;translate:0 -50%;border-radius:0 4px 4px 0;background-color:${role("on-surface")}}
${RAIL} [data-slot=fab]{width:48px;height:48px;border-radius:50%;background-color:${role("surface")};color:${role("tertiary")};box-shadow:none;border:0}
${RAIL} [data-slot=navigation-rail-header] [data-button]{width:48px;height:48px;border-radius:16px;background-color:${role("primary")};color:${role("on-primary")}}`,
    /* the channel list: grey rows with 4px corners, the chosen one lighter and white */
    sidebar(32, "4px", 20),
    `[data-slot=sidebar]{background-color:${role("surface-container-low")}}
[data-slot=sidebar-menu-button]{color:${role("on-surface-variant")};font-weight:500;font-size:16px}
[data-slot=sidebar-menu-button] [data-slot=icon]{color:${role("outline")}}
[data-slot=sidebar-menu-button][data-active]{background-color:${SELECTED};color:${role("on-surface")}}
[data-slot=sidebar-menu-button][data-active] [data-slot=icon]{color:${role("on-surface")}}
[data-slot=sidebar-group-label]{text-transform:uppercase;font-size:12px;letter-spacing:.02em}
[data-slot=side-tabs-item][data-active]{background-color:${SELECTED};color:${role("on-surface")}}`,
    tree(32, "4px"),
    `[data-slot=tree-row]{color:${role("on-surface-variant")}}
[data-slot=tree-row][data-active]{background-color:${SELECTED};color:${role("on-surface")}}`,
    /* the tabs of the friends page: words, the chosen one on a grey fill */
    `[data-slot=tabs-list]{justify-content:flex-start;gap:8px}
[data-slot=tabs-trigger]{flex:none;height:28px;margin-block:auto;padding-inline:8px;border-radius:4px;font-size:16px;font-weight:500}
[data-slot=tabs-trigger][data-active]{background-color:${SELECTED}}`,
    /* messages: an avatar, the sender, the words on the page; nobody's on the right and nothing in a bubble */
    `[data-slot=message][data-align=end]{flex-direction:row}
[data-slot=message]{gap:16px}
[data-slot=message-avatar]{align-self:flex-start;min-width:40px}
[data-slot=message-avatar] [data-slot=avatar]{width:40px;height:40px}
[data-slot=message-header]{padding-inline:0;font-size:16px;font-weight:500;color:${role("on-surface")}}
[data-slot=message-footer]{padding-inline:0}
[data-slot=message]:not(:has([data-slot=message-avatar])){padding-left:56px}
[data-slot=bubble]{align-self:flex-start;max-width:100%}
[data-slot=bubble] [data-slot=bubble-content]{background-color:transparent;color:${role("on-surface")};padding:0;border:0;border-radius:0;font-size:16px;line-height:22px}`,
    /* the composer: a grey box of 8px corners, the attach button a round grey plus, no send button to speak of */
    `[data-slot=chat-composer]{background-color:${role("surface-container-high")};border-radius:8px;border:0;padding:4px 8px}
[data-slot=chat-composer-field] :is([data-slot=input],[data-slot=textarea]){background-color:transparent;box-shadow:none;border:0}
[data-slot=chat-composer-send]{background-color:transparent;color:${role("on-surface-variant")}}`,
    /* menus: the darkest grey, the hovered row blurple */
    `${MENUS}{background-color:${role("surface-container-highest")};border:0;border-radius:8px;padding:6px;box-shadow:0 8px 16px rgb(0 0 0/.24)}
${MENU_ROWS}{min-height:32px;border-radius:4px;font-size:14px;font-weight:500;color:${role("on-surface-variant")}}
${MENU_ROWS}:is([data-highlighted],:focus){background-color:${role("primary")};color:${role("on-primary")}}
${MENU_ROWS}:is([data-highlighted],:focus) [data-slot=icon]{color:${role("on-primary")}}
${MENU_ROWS}[data-variant=destructive]{color:${role("error")}}
${MENU_ROWS}[data-variant=destructive]:is([data-highlighted],:focus){background-color:${role("error")};color:${role("on-error")}}`,
    picked,
    short(40),
    menubar(28, "4px"),
    toolbar("8px"),
    palette(34, "8px"),
    `[data-slot=command]{background-color:${role("surface-container-low")};border:0;box-shadow:0 8px 24px rgb(0 0 0/.3)}
[data-slot=command-item][data-selected=true]{background-color:${SELECTED}}`,
    /* modals: the title heavy and at the left, the buttons at the right of a darker band along the foot; Cancel only words */
    `${DIALOG}{border-radius:8px;padding:16px;border:0;background-color:${role("surface")};box-shadow:0 8px 24px rgb(0 0 0/.3)}
${DIALOG} :is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-size:20px;line-height:24px;font-weight:700;color:${role("on-surface")}}
${FOOT}{margin:8px -16px -16px;padding:16px;background-color:${role("surface-container-low")};border-radius:0 0 8px 8px}
:is([data-slot=dialog-close],[data-slot=alert-dialog-cancel])[data-variant=text]{color:${role("on-surface")}}
[data-slot=dialog-close][data-tap=confirm]{background-color:${role("primary")};color:${role("on-primary")}}`,
    /* tables, cards and the rest of the chrome */
    `[data-slot=table-head]{height:36px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
[data-slot=table-cell]{height:44px}
[data-slot=table-row]{border-bottom-color:${role("outline-variant")}}
:is([data-slot=card],[data-surface=card]){border-radius:8px}
[data-slot=tooltip-content]{background-color:${role("surface-container-highest")};color:${role("on-surface")};border-radius:6px;font-size:14px;font-weight:500;box-shadow:0 8px 16px rgb(0 0 0/.24)}
[data-slot=alert]{border-radius:8px;border:1px solid ${mix("primary", 50)};background-color:${mix("primary", 10)}}
[data-slot=alert] [data-slot=icon]{color:${role("primary")}}`,
    /* the window: Windows's caption buttons over the darkest grey, the app's name small and bold at the left */
    windowsCaption,
    `[data-slot=title-bar]{height:24px;background-color:${role("surface-container-highest")};border-bottom:0}
[data-slot=title-bar-title]{font-weight:700;color:${role("on-surface-variant")}}
[data-slot=title-bar-icon]{color:${role("on-surface-variant")}}
[data-slot=status-bar]{height:52px;background-color:${mix("surface-container-highest", 70, role("surface-container-low"))};border-top:0;font-size:14px;color:${role("on-surface")}}`,
  ].join("\n"),
});
