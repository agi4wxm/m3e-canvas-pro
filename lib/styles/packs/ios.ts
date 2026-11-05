import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* Apple's system colors and control sizes; iOS 26 puts buttons and the tab bar in capsules */
export default definePack({
  key: "ios",
  name: say("iOS", "iOS", "iOS", "iOS"),
  hint: say("iPhone 系统和苹果应用：胶囊按钮、悬浮底栏、分段控件", "iPhone and Apple's apps: capsule buttons, a floating tab bar, segmented controls", "iPhone とアップルのアプリ", "iPhone과 애플 앱"),
  refs: ["iOS 26", "Apple apps"],
  basis: "official",
  group: "app",
  seed: "#007AFF",
  mode: "light",
  light: roles({ p: ["#007AFF", "#FFFFFF"], pc: ["#D6E8FF", "#003A7A"], s: ["#636366", "#FFFFFF"], sc: ["#E5E5EA", "#1C1C1E"], t: ["#C75300", "#FFFFFF"], tc: ["#FFE3C7", "#4A1F00"], bg: ["#F2F2F7", "#FFFFFF", "#FFFFFF", "#EFEFF4", "#E5E5EA"], text: ["#000000", "#5C5C60"], line: ["#85858A", "#D1D1D6"] }),
  dark: roles({ p: ["#0A84FF", "#FFFFFF"], pc: ["#003A7A", "#D6E8FF"], s: ["#AEAEB2", "#1C1C1E"], sc: ["#3A3A3C", "#FFFFFF"], t: ["#FF9F0A", "#2B1600"], tc: ["#4A2A00", "#FFE3C7"], bg: ["#000000", "#1C1C1E", "#1C1C1E", "#2C2C2E", "#3A3A3C"], text: ["#FFFFFF", "#AEAEB2"], line: ["#8E8E93", "#38383A"] }),
  loud: ["primary"],
  shape: "rounded",
  font: "apple",
  icons: "sf",
  motion: "standard",
  control: "pill",
  pill: "round",
  tokens: { toggleOn: "#34C759" },
  recipes: { button: "flat", surface: "soft", tabs: "segmented", toggle: "ios", slider: "thin", nav: "floating", field: "soft", bar: "center", meter: "thin", feedback: "dim", list: "inset", dialog: "alert", chip: "pill", check: "round", card: "raised", segmented: "ios", appbar: "ios", search: "cancel", input: "filled", progress: "thin", row: "chevron", divider: "hairline", menu: "ios", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", icon: "tile", scroll: "hidden" },
  art: "clean airy product photography, soft daylight, subtle translucency, restrained color",
  ux: { margin: 16, gap: 24, tight: 8, nav: "bottom" },
  layout: { zh: "分组列表放在灰底上，组与组之间留大间距；标题居中，底部悬浮胶囊标签栏，主按钮靠近内容、通栏胶囊。", en: "Inset grouped lists on a grey ground with generous gaps between groups; a centered title; a floating capsule tab bar; the main action a full-width capsule near the content." },
  type: { "headline-large": [34, 41, 700, 0.4], "headline-medium": [28, 34, 700, 0.4], "headline-small": [22, 28, 700, 0.3], ...TITLES([20, 25, 600, 0.3], [17, 22, 600, -0.4], [15, 20, 600, -0.2]), ...BODIES([17, 22, 400, -0.4], [15, 20, 400, -0.2], [13, 18, 400, -0.1]), ...LABELS([15, 20, 500, -0.2], [13, 18, 500, -0.1], [11, 13, 500, 0]) },
  css: "",
});
