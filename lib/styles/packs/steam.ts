import { definePack, roles, say } from "../types";

/* third-party palettes of its store and client; Valve publishes none */
export default definePack({
  key: "steam",
  name: say("Steam", "Steam", "Steam", "Steam"),
  hint: say("游戏平台：深海军蓝、钢蓝面板、天蓝点缀", "Game store: deep navy, steel-blue panels, sky-blue accents", "ゲームストア：濃紺と空色", "게임 스토어: 짙은 남색과 하늘색"),
  refs: ["Steam"],
  basis: "observed",
  group: "desktop",
  seed: "#66C0F4",
  mode: "dark",
  light: roles({ p: ["#1A6FA8", "#FFFFFF"], pc: ["#D3E9F7", "#0B3A5A"], s: ["#4B5A68", "#FFFFFF"], sc: ["#DCE6EE", "#1B2838"], t: ["#5C7A00", "#FFFFFF"], tc: ["#E7F4B8", "#2B3A00"], bg: ["#E9EFF4", "#FFFFFF", "#F4F7FA", "#E2EAF0", "#D6E0E9"], text: ["#1B2838", "#46586A"], line: ["#73879A", "#C6D3DE"] }),
  dark: roles({ p: ["#66C0F4", "#0B1A26"], pc: ["#2A475E", "#C7D5E0"], s: ["#8F98A0", "#171A21"], sc: ["#2A475E", "#C7D5E0"], t: ["#A4D007", "#1A2600"], tc: ["#3D4F0F", "#D2EFA9"], bg: ["#1B2838", "#171A21", "#16202D", "#223447", "#223A50"], text: ["#C7D5E0", "#A3B1BE"], line: ["#66788A", "#2A475E"] }),
  shape: "square",
  font: "inter",
  icons: "tabler",
  motion: "standard",
  control: "small",
  pill: "round",
  compact: true,
  screenDark: "linear-gradient(#171A21 0, #1B2838 140px)",
  tokens: { barBg: "#171A21", onBar: "#C7D5E0", rim: "#2A475E", toggleOn: "#66C0F4" },
  recipes: { button: "bevel", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "hud", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "flat", segmented: "boxed", appbar: "compact", search: "boxed", input: "filled", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", scroll: "block" },
  art: "dark game library, deep navy panels, cool blue glow, cover art lined up",
  ux: { margin: 12, gap: 8, tight: 4, nav: "top" },
  layout: { zh: "深色顶部导航，下面是大幅封面和成排的游戏卡片，列表里是缩略图、名字和绿色价格标签。", en: "A dark navigation along the top, a large cover below it and rows of game cards; lists of a thumbnail, a name and a green price tag." },
  css: "",
});
