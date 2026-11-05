import { definePack, roles, say, CHUNKY_RAMP } from "../types";

/* the background and board read off Block Blast's store screenshots: the most downloaded game of 2025 */
export default definePack({
  key: "blocks",
  name: say("方块解谜", "Block puzzle", "ブロックパズル", "블록 퍼즐"),
  hint: say("像 Block Blast：宝蓝底、深蓝棋盘、金色皇冠、紫色飘带", "Like Block Blast: royal blue ground, navy board, gold crown, purple ribbon", "Block Blast のような青地と金", "Block Blast 같은 파란 바탕과 금색"),
  refs: ["Block Blast"],
  basis: "sampled",
  group: "mobileGame",
  seed: "#425AB7",
  mode: "dark",
  light: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
  dark: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
  shape: "rounded",
  font: "fredoka",
  display: "fredoka",
  icons: "emoji",
  motion: "expressive",
  control: "large",
  pill: "round",
  tokens: { navOn: "#FFD23F", toggleOn: "#46D160", tabOn: "#FFD23F" },
  recipes: { button: "lip", surface: "plain", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "jelly", feedback: "press", list: "tile", dialog: "game", card: "flat", segmented: "capsules", appbar: "center", search: "filled", progress: "jelly", divider: "fade", menu: "rim", sheet: "rim", tooltip: "rim", fab: "round", badge: "rim", icon: "emboss", text: "outlined", scroll: "hidden" },
  art: "flat vibrant illustration of glowing gem-like blocks, bold shapes, saturated colors on deep blue",
  ux: { margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" },
  layout: { zh: "几乎没有菜单：左上皇冠和最高分，右上设置，中间大分数，下面是深蓝棋盘和待放方块。", en: "Almost no menus: a crown and best score at the upper left, settings at the upper right, a big score in the middle, the navy board and the pieces below it." },
  type: CHUNKY_RAMP,
  css: "",
});
