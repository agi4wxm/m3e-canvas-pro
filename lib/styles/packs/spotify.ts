import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* its dark palette from third-party breakdowns; Spotify's own brand page could not be read */
export default definePack({
  key: "spotify",
  name: say("Spotify", "Spotify", "Spotify", "Spotify"),
  hint: say("音乐流媒体：近黑底、荧光绿胶囊按钮、方形封面", "Music streaming: near black, bright green capsules, square covers", "音楽配信：黒地に緑のカプセル", "음악 스트리밍: 검정 바탕에 초록"),
  refs: ["Spotify"],
  basis: "observed",
  group: "app",
  seed: "#1ED760",
  mode: "dark",
  light: roles({ p: ["#1ED760", "#000000"], pc: ["#C9F7DA", "#0F5B2C"], s: ["#121212", "#FFFFFF"], sc: ["#EDEDED", "#121212"], t: ["#535353", "#FFFFFF"], tc: ["#E4E4E4", "#121212"], bg: ["#FFFFFF", "#FAFAFA", "#F5F5F5", "#EDEDED", "#E4E4E4"], text: ["#121212", "#535353"], line: ["#878787", "#DDDDDD"] }),
  dark: roles({ p: ["#1ED760", "#000000"], pc: ["#0F5B2C", "#C9F7DA"], s: ["#FFFFFF", "#000000"], sc: ["#282828", "#FFFFFF"], t: ["#B3B3B3", "#000000"], tc: ["#3A3A3A", "#FFFFFF"], bg: ["#121212", "#181818", "#181818", "#282828", "#333333"], text: ["#FFFFFF", "#B3B3B3"], line: ["#727272", "#3E3E3E"] }),
  shape: "square",
  font: "dmsans",
  icons: "phosphor",
  motion: "standard",
  control: "pill",
  pill: "round",
  tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#1ED760", primaryText: "#0E7A3A" },
  recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "pill", card: "flat", segmented: "capsules", search: "filled", input: "filled", progress: "thin", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "round", badge: "dot", scroll: "thin" },
  art: "bold album-cover art, saturated duotone, grainy texture, strong graphic shapes",
  ux: { margin: 16, gap: 24, tight: 4, nav: "bottom" },
  layout: { zh: "先是一行胶囊筛选，再是一段段带标题的横向封面；列表无分隔线；底部标签栏上方常驻迷你播放条。", en: "A row of capsule filters, then titled shelves of square covers; lists without lines; a mini player resting above the tab bar." },
  type: { ...TITLES([24, 30, 700, -0.2], [16, 22, 700, 0], [14, 20, 700, 0]), ...BODIES([16, 22, 400, 0], [14, 20, 400, 0], [13, 16, 400, 0]), ...LABELS([14, 20, 700, 0], [12, 16, 700, 0], [11, 14, 500, 0]) },
  css: "",
});
