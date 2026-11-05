import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* secondary sources for its text and sidebar colors; it publishes none */
export default definePack({
  key: "notion",
  name: say("Notion", "Notion", "Notion", "Notion"),
  hint: say("文档工具：暖白、柔灰、细线、几乎没有颜色", "Document tool: warm white, soft grey, hairlines, almost no color", "文書ツール：温かい白と細線", "문서 도구: 따뜻한 흰색과 가는 선"),
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
  recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "tag", card: "outlined", segmented: "underline", appbar: "large", search: "filled", input: "boxed", progress: "thin", row: "dense", divider: "hairline", menu: "compact", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", icon: "muted", scroll: "thin" },
  art: "quiet paper-like workspace, warm off-white, soft grey lines, hand-drawn doodle spot illustrations",
  ux: { margin: 20, gap: 12, tight: 0, nav: "keep" },
  layout: { zh: "像一页纸：大标题在左上，正文宽松，页面元素不加框，靠缩进和留白分层，几乎没有颜色。", en: "Like a page of paper: a large title at the upper left, roomy text, elements without boxes, layered by indent and white space, almost no color." },
  type: { "headline-large": [40, 48, 700, 0], "headline-medium": [30, 38, 700, 0], "headline-small": [24, 32, 600, 0], ...TITLES([20, 28, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  css: "",
});
