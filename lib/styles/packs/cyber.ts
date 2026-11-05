import { BUTTONS, MENU_ITEMS, PANELS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
/** the lower right corner cut off */
const CUT = (n: number) => `clip-path:polygon(0 0,100% 0,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,0 100%)`;
/** the frame's line carried along the cut: a stroke across the corner's square, just inside where it is cut */
const CUT_LINE = (c: string) => `linear-gradient(to top left,transparent 50%,${c} 50% calc(50% + 1.5px),transparent calc(50% + 1.5px))`;
const MONO = `'JetBrains Mono',ui-monospace,'Cascadia Code',Consolas,monospace`;
const CYAN = role("secondary");
const YELLOW = role("tertiary");
const RED_LINE = mix("primary", 55);
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
/** what is drawn round on purpose, an egg or a ball, and what is too small to lose a corner: a key, a face */
const ROUND = `[data-slot=egg-smash-item],[data-slot=gacha-dot],[data-slot=gacha-media],[data-slot=wheel-track],[data-slot=kbd],[data-slot=avatar],[data-slot=avatar-fallback]`;

/* its character screen read off a Steam store screenshot: dark crimson panels, red words, cyan accents, one corner cut */
export default definePack({
  key: "cyber",
  name: say("赛博朋克 2077", "Cyberpunk 2077", "サイバーパンク 2077", "사이버펑크 2077"),
  hint: say("暗红面板、红色大写字、青色选中、黄色标记、切角、扫描线", "Dark crimson panels, red capitals, cyan for what is chosen, yellow marks, cut corners, scan lines", "暗い赤のパネルと赤い文字、シアンの選択、黄色の印", "짙은 빨강 패널과 빨간 글자, 청록 선택, 노란 표시"),
  refs: ["Cyberpunk 2077"],
  basis: "sampled",
  group: "pcGame",
  seed: "#FF5C57",
  mode: "dark",
  light: roles({ p: ["#B3261E", "#FFFFFF"], pc: ["#FFDAD4", "#410002"], s: ["#00707A", "#FFFFFF"], sc: ["#FBE9E7", "#5C1A15"], t: ["#716100", "#FFFFFF"], tc: ["#FFF27A", "#332C00"], bg: ["#F7EFEE", "#FFF8F7", "#FDF3F2", "#F5E6E4", "#EDDAD8"], text: ["#3D0F0B", "#6B2C26"], line: ["#A8504A", "#E0BFBB"] }),
  dark: roles({ p: ["#FF5C57", "#1A0607"], pc: ["#3A1418", "#FF8A80"], s: ["#5EF6FF", "#00191C"], sc: ["#250C10", "#FF7A70"], t: ["#FCEE09", "#1A1800"], tc: ["#3A3600", "#FFF27A"], bg: ["#111217", "#1A0E12", "#250C10", "#2E1E23", "#3A1F26"], text: ["#FF8078", "#F07068"], line: ["#A8322F", "#4A1C20"] }),
  shape: "none",
  font: "rajdhani",
  icons: "tabler",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  capsLabels: true,
  screenDark: "repeating-linear-gradient(0deg, rgb(255 92 87 / 0.035) 0 1px, transparent 1px 3px), radial-gradient(90% 60% at 60% 20%, rgb(120 20 40 / 0.55), transparent 70%), radial-gradient(70% 60% at 100% 100%, rgb(10 30 70 / 0.6), transparent 70%)",
  tokens: { rim: "#A8322F", rimDark: "#4A1C20", barBg: "#1A0E12", onBar: "#5EF6FF", tabOn: "var(--md-sys-color-secondary)", navOn: "var(--md-sys-color-secondary)", toggleOn: "var(--md-sys-color-primary)" },
  recipes: { picker: "boxed", button: "tint", surface: "line", tabs: "glow", toggle: "block", slider: "block", nav: "topline", field: "glow", bar: "hud", meter: "segment", feedback: "flash", list: "tile", dialog: "plain", avatar: "framed", segmented: "underline", appbar: "compact", search: "glow", progress: "segment", row: "dense", menu: "glow", sheet: "panel", tooltip: "glow", fab: "flat", badge: "square", icon: "glow", text: "caps", scroll: "block" },
  art: "rain-soaked neon megacity at night, crimson and teal light, grit and haze, glitch artefacts, cinematic",
  ux: { margin: 16, gap: 8, tight: 4, nav: "top" },
  layout: { zh: "顶部标题配青色下划线，右侧一列切角的暗红面板，每行一个大写标签和数值；底部一排青色按键提示；边缘散布细小的技术文字。", en: "A title with a cyan underline on top, a column of dark crimson panels with cut corners at the right, each row a capital label and a value; a row of cyan key hints along the foot; small technical text scattered at the edges." },
  type: { ...TITLES([24, 28, 600, 1], [18, 22, 600, 0.5], [16, 20, 600, 0.5]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 600, 1], [14, 18, 600, 0.5], [12, 14, 600, 0.5]) },
  /* Every panel is a thin red frame with its lower right corner cut, a short yellow mark on its top edge and scan lines
     across it; what is chosen turns cyan with a bar at its left; figures are set in a monospaced face; counts and
     marks are the yellow of the game's tags. */
  css: `:is(${PANELS}):where(:not(${ROUND})){border-radius:0;border:1px solid ${RED_LINE};${CUT(14)};background-origin:border-box;background-image:${CUT_LINE(RED_LINE)},linear-gradient(${YELLOW},${YELLOW}),repeating-linear-gradient(0deg,${mix("primary", 5)} 0 1px,transparent 1px 3px);background-size:14px 14px,24px 2px,auto;background-position:100% 100%,0 0,0 0;background-repeat:no-repeat,no-repeat,repeat;box-shadow:none}
${BUTTONS}{background-origin:border-box;background-image:${CUT_LINE(role("primary"))};background-size:9px 9px;background-position:100% 100%;background-repeat:no-repeat}
[data-slot=button-group] [data-button]{background-image:none;clip-path:none}
:is([data-slot=tooltip-content],[data-slot=switch],[data-slot=skill-button-face]){${CUT(7)};background-image:${CUT_LINE(RED_LINE)};background-size:7px 7px;background-position:100% 100%;background-repeat:no-repeat;background-origin:border-box}
[data-slot=snackbar]{background-color:${role("surface-container-low")};color:${role("on-surface")};border:1px solid ${RED_LINE};border-left:3px solid ${YELLOW};border-radius:0;${CUT(10)};background-image:${CUT_LINE(RED_LINE)};background-size:10px 10px;background-position:100% 100%;background-repeat:no-repeat;background-origin:border-box}
[data-slot=snackbar-action]{color:${CYAN}}
[data-slot=item]{border-color:${mix("primary", 35)}}
${LINES}{border-radius:0}
${LINES}${LIT}{background-color:${mix("secondary", 10)};background-image:none;border-color:transparent;clip-path:none;box-shadow:inset 3px 0 0 ${CYAN};color:${CYAN}}
${LINES}${LIT} :is([data-slot$="-title"],[data-slot$="-subtitle"],[data-slot=item-description],[data-slot=icon]){color:inherit}
:is([data-slot=toggle-group-item][data-pressed],[data-slot=pagination-link][data-active=true]){background-color:${mix("secondary", 12)};color:${CYAN};border-color:${CYAN}}
:is([data-slot$="-value"],[data-slot$="-price"],[data-slot=kbd],[data-slot=timer-value],[data-slot=number-ticker],[data-slot=progress-value]){font-family:${MONO};letter-spacing:0;font-variant-numeric:tabular-nums}
:is([data-slot$="-value"],[data-slot=timer-value]){color:${CYAN}}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label],[data-slot=check-in-title],[data-slot=table-head]){color:${CYAN};text-transform:uppercase;letter-spacing:.12em;font-size:var(--text-label-medium)}
[data-slot=table-row]{border-bottom-color:${mix("primary", 25)}}
:is([data-slot=badge],[data-slot=notification-badge],[data-slot$="-badge"]){background-color:${YELLOW};color:${role("on-tertiary")};border-radius:0;font-family:${MONO}}
[data-slot=checkbox]{border-radius:0}
[data-slot=app-bar]{box-shadow:0 4px 0 -3px ${CYAN}}
:is(${SLOTS},[data-slot=level-map-cell],[data-slot=game-board-cell]){${CUT(8)};background-image:${CUT_LINE(RED_LINE)};background-size:8px 8px;background-position:100% 100%;background-repeat:no-repeat;background-origin:border-box}
${SLOTS}{border:0;border-radius:0;background-color:${mix("primary", 6)};box-shadow:inset 0 0 0 1px ${mix("primary", 40)}}
${SLOTS}:is([aria-pressed=true],[data-lit]){background-color:${mix("secondary", 10)};color:${CYAN};box-shadow:inset 0 0 0 1px ${CYAN},0 0 10px ${mix("secondary", 45)}}
:is([data-slot=level-map-cell],[data-slot=game-board-cell]){border-radius:0}
[data-slot=level-map-cell][data-current]{background-color:${YELLOW};color:${role("on-tertiary")};--tw-ring-color:${mix("tertiary", 30)}}`,
});
