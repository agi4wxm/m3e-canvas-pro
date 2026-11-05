import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* looked at in Genshin's and Star Rail's menus on Interface In Game; the cream and slate are common knowledge among players */
export default definePack({
  key: "anime",
  name: say("原神 / 星穹铁道", "Genshin / Star Rail", "原神 / スターレイル", "원신 / 스타레일"),
  hint: say("二次元开放世界：石板蓝半透明面板、米白胶囊按钮、淡金细线", "Anime open world: translucent slate panels, cream capsules, pale gold lines", "スレート色のパネルとクリーム色のカプセル", "슬레이트 패널과 크림색 캡슐"),
  refs: ["Genshin Impact", "Honkai: Star Rail"],
  basis: "observed",
  group: "mobileGame",
  seed: "#3B4255",
  mode: "dark",
  light: roles({ p: ["#3B4255", "#ECE5D8"], pc: ["#D3BC8E", "#2A2418"], s: ["#6E5C30", "#FFFFFF"], sc: ["#E4DCCB", "#3B4255"], t: ["#A8640F", "#FFFFFF"], tc: ["#F6E6C8", "#4A2F05"], bg: ["#ECE5D8", "#F8F4EC", "#F5F0E6", "#E4DCCB", "#DBD2BE"], text: ["#3B4255", "#4F566B"], line: ["#8A7F66", "#CFC5AE"] }),
  dark: roles({ p: ["#ECE5D8", "#3B4255"], pc: ["#D3BC8E", "#2A2418"], s: ["#D3BC8E", "#2A2418"], sc: ["#3B4255", "#ECE5D8"], t: ["#FFB13F", "#2B1800"], tc: ["#4A3A1E", "#FFE8C2"], bg: ["#1E2435", "#2A3042", "#3B4255", "#454C60", "#4F566B"], text: ["#ECE5D8", "#E0DACC"], line: ["#A89A7C", "#5A6175"] }),
  shape: "rounded",
  font: "mrounded",
  icons: "game",
  motion: "standard",
  control: "pill",
  pill: "round",
  screenDark: "radial-gradient(120% 80% at 50% 0%, rgb(90 110 170 / 0.35), transparent 60%), radial-gradient(100% 60% at 50% 100%, rgb(211 188 142 / 0.12), transparent 60%)",
  tokens: { rim: "#D3BC8E", toggleOn: "#D3BC8E", tabOn: "#D3BC8E" },
  recipes: { button: "ring", surface: "gilt", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim", list: "tile", dialog: "plain", dialogue: "band", segmented: "capsules", appbar: "compact", search: "pill", progress: "thin", divider: "ornament", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", scroll: "thin" },
  art: "anime open-world concept painting, soft cel shading, luminous fantasy sky, gentle blue and gold light",
  ux: { margin: 16, gap: 12, tight: 6, nav: "rail" },
  layout: { zh: "左侧一列分类，选中项是米白胶囊；中间是物品格子；右侧是详情卡和底部的胶囊按钮；右上角圆形关闭。", en: "A column of categories at the left with the chosen one a cream capsule; a grid of items in the middle; a detail card at the right with capsule buttons at its foot; a round close at the upper right." },
  type: { ...TITLES([22, 28, 600, 0], [17, 24, 600, 0], [15, 20, 600, 0]), ...BODIES([15, 22, 500, 0], [14, 20, 500, 0], [12, 16, 500, 0]), ...LABELS([15, 20, 600, 0], [13, 16, 500, 0], [11, 14, 500, 0]) },
  css: "",
});
