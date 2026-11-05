import { definePack, roles, say } from "../types";

/* the Dark Modern and Light Modern theme files in VS Code's own repository */
export default definePack({
  key: "vscode",
  name: say("VS Code", "VS Code", "VS Code", "VS Code"),
  hint: say("开发工具：炭灰面板、灰线、单一蓝色、方正紧凑", "Developer tool: charcoal panels, grey lines, one blue, square and dense", "開発ツール：炭色のパネル", "개발 도구: 숯색 패널"),
  refs: ["VS Code", "Cursor"],
  basis: "official",
  group: "desktop",
  seed: "#0078D4",
  mode: "dark",
  light: roles({ p: ["#005FB8", "#FFFFFF"], pc: ["#D6E8F8", "#003A70"], s: ["#616161", "#FFFFFF"], sc: ["#E5E5E5", "#3B3B3B"], t: ["#0F7B6C", "#FFFFFF"], tc: ["#D2F2EC", "#0A3D35"], bg: ["#FFFFFF", "#F8F8F8", "#F8F8F8", "#F2F2F2", "#E5E5E5"], text: ["#3B3B3B", "#616161"], line: ["#8A8A8A", "#E5E5E5"] }),
  dark: roles({ p: ["#0078D4", "#FFFFFF"], pc: ["#04395E", "#CCCCCC"], s: ["#9D9D9D", "#181818"], sc: ["#313131", "#CCCCCC"], t: ["#4EC9B0", "#0B2A24"], tc: ["#0B3A33", "#BFF0E6"], bg: ["#1F1F1F", "#181818", "#181818", "#252526", "#2B2B2B"], text: ["#CCCCCC", "#9D9D9D"], line: ["#7A7A7A", "#2B2B2B"] }),
  shape: "square",
  font: "segoe",
  icons: "codicon",
  motion: "standard",
  control: "small",
  pill: "round",
  compact: true,
  tokens: { tabOn: "#0078D4" },
  recipes: { button: "flat", surface: "line", tabs: "topline", toggle: "outline", slider: "thin", nav: "icononly", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "outlined", segmented: "boxed", appbar: "compact", search: "boxed", input: "boxed", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "light", fab: "flat", badge: "pill", icon: "muted", scroll: "block" },
  art: "dark code editor workspace, charcoal panels, thin grey lines, a single blue accent",
  ux: { margin: 12, gap: 8, tight: 0, nav: "rail" },
  layout: { zh: "最左一列窄图标栏，旁边是树形侧栏，中间是方正的标签页和内容，最底下一条细状态栏。", en: "A narrow column of icons at the far left, a tree sidebar beside it, square tabs over the content, a thin status bar along the foot." },
  css: "",
});
