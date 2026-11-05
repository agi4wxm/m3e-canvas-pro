import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* Instagram's blue from memory; its layout from common knowledge of the app */
export default definePack({
  key: "social",
  name: say("Instagram", "Instagram", "Instagram", "Instagram"),
  hint: say("图片社交：黑白极简、底栏只有图标、细分隔线", "Photo social: black and white, an icon-only bar, hairlines", "写真 SNS：白黒とアイコンのみのバー", "사진 SNS: 흑백과 아이콘만 있는 바"),
  refs: ["Instagram", "Threads"],
  basis: "memory",
  group: "app",
  seed: "#0095F6",
  mode: "light",
  light: roles({ p: ["#0095F6", "#FFFFFF"], pc: ["#E0F1FF", "#003A66"], s: ["#262626", "#FFFFFF"], sc: ["#EFEFEF", "#262626"], t: ["#ED4956", "#FFFFFF"], tc: ["#FFE3E5", "#7A1019"], bg: ["#FFFFFF", "#FFFFFF", "#FAFAFA", "#F2F2F2", "#EFEFEF"], text: ["#000000", "#696969"], line: ["#8E8E8E", "#DBDBDB"] }),
  dark: roles({ p: ["#0095F6", "#FFFFFF"], pc: ["#003A66", "#E0F1FF"], s: ["#F5F5F5", "#000000"], sc: ["#262626", "#F5F5F5"], t: ["#ED4956", "#FFFFFF"], tc: ["#4A1419", "#FFD6DA"], bg: ["#000000", "#121212", "#121212", "#1C1C1C", "#262626"], text: ["#F5F5F5", "#A8A8A8"], line: ["#737373", "#262626"] }),
  loud: ["primary", "tertiary"],
  shape: "rounded",
  font: "apple",
  icons: "phosphor",
  motion: "standard",
  control: "small",
  pill: "round",
  tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#0095F6", primaryText: "#00376B" },
  recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "icononly", field: "soft", bar: "center", appbar: "center", meter: "thin", feedback: "dim", list: "plain", dialog: "alert", card: "flat", segmented: "capsules", search: "filled", input: "filled", progress: "thin", row: "arrow", divider: "hairline", menu: "ios", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", scroll: "hidden" },
  art: "candid bright lifestyle photograph, natural color, square or vertical crop",
  ux: { margin: 16, gap: 12, tight: 0, nav: "bottom", bleed: ["image", "video"] },
  layout: { zh: "内容从边到边，图片通栏，几乎不用卡片和分隔；颜色只给主按钮；底栏只有图标没有文字。", en: "Content edge to edge with full-width pictures, hardly any cards or lines; color only on the main action; a bottom bar of icons with no words." },
  type: { "display-small": [32, 40, 700, -0.4], "headline-medium": [28, 34, 700, -0.2], "headline-small": [24, 30, 700, 0], ...TITLES([20, 24, 700, 0], [16, 20, 600, 0], [14, 18, 600, 0]), ...BODIES([14, 18, 400, 0], [14, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 18, 600, 0], [12, 16, 600, 0], [11, 13, 500, 0]) },
  /* A story not yet seen has the gradient ring, a seen one a grey hairline. A post runs edge to edge with no corners:
     its header, the picture, the row of outline icons, then the caption. Icons are black, never the accent; the blue is
     for Follow and links, the grey capsule for Edit profile. */
  css: `[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{font-size:16px;line-height:22px;font-weight:700}
[data-button]:not([data-size^=icon]){font-weight:600}
[data-slot=story-row-ring]:not([data-seen],[data-own]){box-shadow:none;padding:2px;border:2px solid transparent;background:linear-gradient(var(--md-sys-color-surface),var(--md-sys-color-surface)) padding-box,linear-gradient(45deg,#FEDA75,#FA7E1E 28%,#D62976 58%,#962FBF 82%,#4F5BD5) border-box}
[data-slot=story-row-ring][data-seen]{box-shadow:none;padding:3px;border:1px solid var(--md-sys-color-outline-variant)}
[data-slot=post-card]:is([data-slot]){border-radius:0;background-color:var(--md-sys-color-surface);padding-inline:0;gap:10px}
:is([data-slot=post-card-header],[data-slot=post-card-description],[data-slot=post-card-actions]){margin-inline:12px}
[data-slot=post-card-media]{order:1;--md-sys-shape-corner-large:0px}
[data-slot=post-card-actions]{order:2}
[data-slot=post-card-description]{order:3}
[data-slot=avatar-fallback][class~="bg-primary-container"]{background-color:var(--md-sys-color-surface-container-highest);color:var(--md-sys-color-on-surface-variant)}
:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger])[class~="bg-primary-container"]{background-color:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
[data-button][data-size^=icon][class~="text-primary"]{color:var(--md-sys-color-on-surface)}
[data-slot=chat-composer]{border-top:0;background-color:transparent}
[data-slot=chat-composer-field] :is([data-slot=input],[data-slot=textarea]){border-radius:999px}
[data-slot=sidebar-menu-button]{height:48px;border-radius:8px;padding-inline:12px;gap:16px;font-size:16px;font-weight:400;color:var(--md-sys-color-on-surface)}
[data-slot=sidebar-menu-button] [data-slot=icon]{color:var(--md-sys-color-on-surface)}
[data-slot=sidebar-menu-button][data-active]{background-color:transparent;font-weight:700}`,
});
