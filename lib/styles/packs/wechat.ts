import { DATA_PANELS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/** the lists that are a group of rows of their own: WeUI draws each as white cells from edge to edge */
const GROUPS = `:is([data-slot=settings-group],[data-slot=file-list],[data-slot=notification-list])`;
const FIELDS = `:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea],[data-slot=native-select],[data-slot=input-group],[data-slot=phone-input],[data-surface=field],[data-slot=text-field-box],[data-slot=tag-input])`;

/* WeChat's own WeUI 2.6: its colors, 8px buttons, 56px rows */
export default definePack({
  key: "wechat",
  name: say("微信", "WeChat", "WeChat", "WeChat"),
  hint: say("超级应用：灰底白列表、细分隔线、只用一种绿", "Super app: grey ground, white lists, hairlines, one green", "スーパーアプリ：灰地に白のリスト", "슈퍼앱: 회색 바탕에 흰 목록"),
  refs: ["WeChat"],
  basis: "official",
  group: "app",
  seed: "#07C160",
  mode: "light",
  light: roles({ p: ["#07C160", "#FFFFFF"], pc: ["#D8F5E4", "#05532A"], s: ["#576B95", "#FFFFFF"], sc: ["#F2F2F2", "#1A1A1A"], t: ["#FA5151", "#FFFFFF"], tc: ["#FFE1E1", "#7A1010"], bg: ["#EDEDED", "#FFFFFF", "#FFFFFF", "#F7F7F7", "#F2F2F2"], text: ["#191919", "#666666"], line: ["#808080", "#E5E5E5"] }),
  dark: roles({ p: ["#07C160", "#FFFFFF"], pc: ["#0B3D22", "#C9F2DB"], s: ["#7D90A9", "#0E1114"], sc: ["#2C2C2C", "#D1D1D1"], t: ["#FA5151", "#FFFFFF"], tc: ["#4A1616", "#FFD6D6"], bg: ["#111111", "#191919", "#191919", "#232323", "#2C2C2C"], text: ["#D1D1D1", "#9A9A9A"], line: ["#7A7A7A", "#2E2E2E"] }),
  loud: ["primary", "tertiary"],
  shape: "rounded",
  font: "system",
  icons: "mingcute",
  motion: "standard",
  control: "small",
  pill: "round",
  tokens: { toggleOn: "#07C160", primaryText: "#576B95", primaryTextDark: "#7D90A9" },
  recipes: { button: "flat", surface: "plain", tabs: "short", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", meter: "thin", feedback: "dim", list: "flush", dialog: "weui", avatar: "square", check: "round", card: "flat", segmented: "ios", appbar: "center", search: "filled", input: "filled", progress: "thin", row: "arrow", divider: "hairline", menu: "compact", sheet: "weui", tooltip: "dark", fab: "round", badge: "pill", scroll: "hidden", picker: "weui" },
  art: "flat friendly illustration, light grey ground, single green accent",
  ux: { margin: 16, gap: 8, tight: 0, nav: "bottom" },
  layout: { zh: "白色列表从屏幕一边铺到另一边，用灰色窄带分组，分隔线从文字处开始；圆角方形头像；标题居中；四个底部标签。", en: "White lists run edge to edge, grouped by narrow grey bands, with lines starting at the words; rounded-square avatars; a centered title; four bottom tabs." },
  type: { "headline-medium": [22, 30, 600, 0], "headline-small": [20, 28, 600, 0], ...TITLES([17, 24, 600, 0], [17, 24, 500, 0], [15, 20, 500, 0]), ...BODIES([17, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([17, 24, 500, 0], [14, 20, 400, 0], [10, 14, 400, 0]) },
  css: [
    /* the top bar is the grey of the page, no line under it; its title centered, its icons black */
    `[data-slot=app-bar]{background-color:${role("surface")};border-bottom:0}`,
    `[data-slot=app-bar] :is([data-slot=app-bar-leading],[data-slot=app-bar-trailing]) :is([data-button],[data-slot=icon]){color:${role("on-surface")}}`,
    `[data-slot=app-bar]:is([data-size=medium],[data-size=large]) [data-slot=app-bar-title]{font-size:22px;line-height:30px;font-weight:600}`,
    /* the tab bar: a light grey strip with a hairline, the words small, the chosen tab green and the others black */
    `[data-slot=navigation-bar]{background-color:${role("surface-container-high")};border-top:.5px solid ${mix("on-surface", 14)}}`,
    `[data-slot=navigation-bar] [data-slot=nav-item]{gap:2px}`,
    `[data-slot=navigation-bar] [data-slot=nav-label]{font-size:10px;line-height:14px}`,
    `[data-slot=navigation-bar] [data-slot=nav-item]:not([data-active]) :is([data-slot=icon],[data-slot=nav-label]){color:${role("on-surface")}}`,
    /* WeUI's buttons: the main one green; the rest a light grey with green words; a link the blue-grey */
    `[data-button]:is([data-variant=default],[data-variant=filled]){font-weight:600}`,
    `[data-slot=button]:is([data-variant=tonal],[data-variant=secondary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${mix("on-surface", 5)};color:${role("primary")};border:0;box-shadow:none;font-weight:600}`,
    /* WeUI cells: a group is white from edge to edge, its rows 56 high, a hairline between rows from where the words start;
       its title stands on the grey above it */
    `${GROUPS}{border-radius:0;padding:0;gap:0}`,
    `${GROUPS} :is(${ROWS}){min-height:56px;padding-inline:16px;border-radius:0;position:relative}`,
    `:is(${ROWS})+:is(${ROWS})::before{content:"";position:absolute;top:0;left:16px;right:0;height:1px;scale:1 .5;transform-origin:0 0;background-color:${role("outline-variant")}}`,
    `[data-slot=settings-group-title]{padding:16px 16px 8px;font-size:14px;background-color:${role("surface")}}`,
    `[data-slot=notification-list-header]{padding-inline:16px}`,
    `[data-slot=sortable-list]{gap:0;background-color:${role("surface-container-low")}}`,
    `[data-slot=sortable-list-row]{position:relative;border-radius:0;min-height:56px;padding-inline:16px}`,
    `[data-slot=sortable-list-row]:not([data-dragging]){background-color:transparent}`,
    `[data-slot=sortable-list-row]+[data-slot=sortable-list-row]::before{content:"";position:absolute;top:0;left:16px;right:0;height:1px;scale:1 .5;transform-origin:0 0;background-color:${role("outline-variant")}}`,
    `:is([data-slot=sheet-title],[data-slot=drawer-title]){font-size:17px;line-height:24px;font-weight:600;color:${role("on-surface")}}`,
    /* fields: a quiet grey that reads on the grey page and inside a white cell alike */
    `${FIELDS}{border-radius:var(--md-sys-shape-corner-small);background-color:${mix("on-surface", 5)};border:0}`,
    `[data-slot=tag-input] [data-slot=input]{background-color:transparent}`,
    `[data-slot=input-otp-slot]{border:0;border-radius:var(--md-sys-shape-corner-small);background-color:${mix("on-surface", 5)}}`,
    /* the search box: white on the grey bar */
    `:is([data-slot=search-bar],[data-slot=search-view][data-variant=docked] [data-slot=search-header]){background-color:${role("surface-container-low")}}`,
    /* charts and tables on white blocks */
    `${DATA_PANELS}{background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-small);padding:16px}`,
  ].join("\n"),
});
