import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* the dialog frame and panel read off Stardew Valley's Steam screenshots */
export default definePack({
  key: "stardew",
  name: say("星露谷物语", "Stardew Valley", "Stardew Valley", "Stardew Valley"),
  hint: say("像素农场：木框、橙褐羊皮纸面板、深棕像素字、卷轴名牌", "Pixel farm: wooden frames, orange-tan parchment panels, dark brown pixel type", "ピクセル農場：木枠と羊皮紙", "픽셀 농장: 나무 테와 양피지"),
  refs: ["Stardew Valley", "Terraria"],
  basis: "sampled",
  group: "pcGame",
  seed: "#B95705",
  mode: "light",
  light: roles({ p: ["#A84F05", "#FFF4D6"], pc: ["#F6C27A", "#4A1C08"], s: ["#3F7A22", "#FFFFFF"], sc: ["#F7E3B5", "#4A1C08"], t: ["#7A5000", "#FFF4D6"], tc: ["#F9E79F", "#3A2208"], bg: ["#F5C98A", "#FBE3B5", "#F6C27A", "#F2BA6E", "#EFB366"], text: ["#4A1C08", "#5E2A0E"], line: ["#8B4A12", "#C98A45"] }),
  dark: roles({ p: ["#E8A828", "#2B1800"], pc: ["#5A3A1A", "#F7E3B5"], s: ["#8FD45A", "#132B02"], sc: ["#4A3015", "#F7E3B5"], t: ["#F2C65A", "#2B1800"], tc: ["#4A3015", "#F9E79F"], bg: ["#1E140C", "#2B1C10", "#38240F", "#4A3015", "#5A3A1A"], text: ["#F7E3B5", "#E8CF9E"], line: ["#C98A45", "#6E4A22"] }),
  shape: "none",
  font: "pixel",
  icons: "pixel",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  edge: 3,
  tokens: { rim: "#B5641E", rimDark: "#5B2B06", toggleOn: "#3F7A22", navOn: "#4A1C08" },
  recipes: { button: "hard", surface: "wood", tabs: "boxed", toggle: "block", slider: "block", nav: "block", field: "hard", bar: "line", meter: "block", feedback: "press", list: "tile", dialog: "game", avatar: "framed", dialogue: "portrait", card: "framed", segmented: "block", appbar: "center", search: "boxed", progress: "segment", divider: "bold", menu: "rim", sheet: "rim", tooltip: "rim", fab: "square", badge: "rim", scroll: "block" },
  art: "cozy 16-bit pixel art farming village, warm sunlight, soft greens and oranges, crisp visible pixels and no anti-aliasing",
  ux: { margin: 12, gap: 8, tight: 6, nav: "bottom" },
  layout: { zh: "整屏是场景；对话框贴在下方，左边文字、右边头像和卷轴名牌；底部一排方形物品格当导航。", en: "The scene fills the screen; a dialog sits low on it with words at the left and a portrait with a scroll nameplate at the right; a row of square item slots along the foot serves as navigation." },
  type: { ...TITLES([24, 30, 400, 0], [20, 26, 400, 0], [16, 22, 400, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 400, 0], [12, 16, 400, 0], [12, 14, 400, 0]) },
  css: "",
});
