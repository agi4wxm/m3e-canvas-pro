import { DATA_PANELS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* Temu's orange from a third-party breakdown; Taobao's from memory; the layout from its screenshots */
export default definePack({
  key: "shop",
  name: say("淘宝 / Temu", "Taobao / Temu", "Taobao / Temu", "Taobao / Temu"),
  hint: say("电商：灰底白卡片、橙色胶囊按钮、红色价格", "Marketplace: white tiles on grey, orange capsules, red prices", "EC：灰地に白いカードと橙のボタン", "커머스: 회색 바탕에 흰 카드와 주황 버튼"),
  refs: ["Taobao", "Temu", "Shein"],
  basis: "memory",
  group: "app",
  seed: "#FF5000",
  mode: "light",
  light: roles({ p: ["#FF5000", "#FFFFFF"], pc: ["#FFE7DC", "#7A2600"], s: ["#333333", "#FFFFFF"], sc: ["#FFF1E8", "#7A2600"], t: ["#FF3141", "#FFFFFF"], tc: ["#FFE5E7", "#8A0F1A"], bg: ["#F5F5F5", "#FFFFFF", "#FFFFFF", "#F8F8F8", "#EEEEEE"], text: ["#1F1F1F", "#666666"], line: ["#808080", "#EEEEEE"] }),
  dark: roles({ p: ["#FF5000", "#FFFFFF"], pc: ["#4A2110", "#FFD9C4"], s: ["#E6E6E6", "#141414"], sc: ["#3A2418", "#FFD9C4"], t: ["#FF5A66", "#2B0003"], tc: ["#4A1A1E", "#FFD6DA"], bg: ["#141414", "#1F1F1F", "#1F1F1F", "#2A2A2A", "#333333"], text: ["#F2F2F2", "#A6A6A6"], line: ["#8C8C8C", "#333333"] }),
  loud: ["primary", "tertiary"],
  shape: "rounded",
  font: "inter",
  icons: "remix",
  motion: "standard",
  control: "pill",
  pill: "round",
  tokens: { toggleOn: "#FF5000" },
  recipes: { button: "flat", surface: "tile", tabs: "short", toggle: "ios", slider: "thin", nav: "plain", field: "pill", bar: "line", meter: "thin", feedback: "dim", list: "inset", dialog: "weui", chip: "tag", card: "flat", segmented: "capsules", appbar: "center", search: "pill", input: "filled", progress: "track", row: "arrow", divider: "hairline", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", scroll: "hidden", picker: "weui" },
  art: "bright product flat-lay, saturated promo colors, bold sale badges, cheerful and busy",
  ux: { margin: 12, gap: 8, tight: 8, nav: "bottom" },
  layout: { zh: "顶部常驻搜索框，下面是促销横幅和两列商品卡片，价格用红色放大；底部五个标签，商品页底部固定购买按钮。", en: "A search box pinned at the top, promo banners, then two columns of product cards with large red prices; five bottom tabs; a fixed buy button at the foot of a product page." },
  type: { ...TITLES([18, 24, 600, 0], [15, 20, 600, 0], [14, 18, 600, 0]), ...BODIES([14, 20, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 600, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  css: [
    /* the bars are white with a hairline, not ruled off by a heavy line */
    `[data-slot=app-bar]{background-color:${role("surface-container-low")};border-bottom:.5px solid ${role("outline-variant")}}`,
    `:is([data-slot=checkout-bar],[data-slot=chat-composer]){background-color:${role("surface-container-low")};border-top:.5px solid ${role("outline-variant")}}`,
    /* the tab bar: white, small words, the chosen tab orange and the rest near black */
    `[data-slot=navigation-bar]{background-color:${role("surface-container-low")}}`,
    `[data-slot=navigation-bar] [data-slot=nav-label]{font-size:11px;line-height:14px}`,
    `[data-slot=navigation-bar] [data-slot=nav-item]:not([data-active]) :is([data-slot=icon],[data-slot=nav-label]){color:${role("on-surface")}}`,
    /* the buying buttons: an orange capsule that warms toward amber; the lesser ones orange words on a pale orange, or an orange line */
    `[data-button]:is([data-variant=default],[data-variant=filled]){background-image:linear-gradient(90deg,${mix("primary", 70, "#FFB000")},${role("primary")});font-weight:600}`,
    `[data-slot=button]:is([data-variant=tonal],[data-variant=secondary]){background-color:${role("primary-container")};color:${role("primary")}}`,
    `[data-slot=button]:is([data-variant=outlined],[data-variant=outline]){border:1px solid ${role("primary")};color:${role("primary")}}`,
    /* prices are red and bold */
    `[data-slot$="-price"],[data-slot=price-tag]{color:${role("tertiary")};font-weight:700}`,
    /* charts and tables on white cards */
    `${DATA_PANELS}{background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-medium);padding:12px}`,
  ].join("\n"),
});
