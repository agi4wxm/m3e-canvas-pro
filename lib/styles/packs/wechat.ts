import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

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
  recipes: { button: "flat", surface: "plain", tabs: "short", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", meter: "thin", feedback: "dim", list: "flush", dialog: "weui", avatar: "square", check: "round", card: "flat", segmented: "ios", appbar: "center", search: "filled", input: "filled", progress: "thin", row: "arrow", divider: "hairline", menu: "compact", sheet: "weui", tooltip: "dark", fab: "round", badge: "pill", scroll: "hidden" },
  art: "flat friendly illustration, light grey ground, single green accent",
  ux: { margin: 16, gap: 8, tight: 0, nav: "bottom" },
  layout: { zh: "白色列表从屏幕一边铺到另一边，用灰色窄带分组，分隔线从文字处开始；圆角方形头像；标题居中；四个底部标签。", en: "White lists run edge to edge, grouped by narrow grey bands, with lines starting at the words; rounded-square avatars; a centered title; four bottom tabs." },
  type: { "headline-medium": [22, 30, 600, 0], "headline-small": [20, 28, 600, 0], ...TITLES([17, 24, 600, 0], [17, 24, 500, 0], [15, 20, 500, 0]), ...BODIES([17, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([17, 24, 500, 0], [14, 20, 400, 0], [10, 14, 400, 0]) },
  css: "",
});
