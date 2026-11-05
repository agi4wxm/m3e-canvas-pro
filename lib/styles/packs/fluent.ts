import { definePack, roles, say } from "../types";

/* Microsoft's Fluent 2 tokens and Windows geometry doc: 4px controls, 8px dialogs, 32px controls, a 40x20 switch */
export default definePack({
  key: "fluent",
  name: say("Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office"),
  hint: say("Fluent：小圆角、细边框、紧凑、微软蓝", "Fluent: small corners, hairlines, compact, Microsoft blue", "Fluent：小さな角丸と細線", "Fluent: 작은 모서리와 가는 선"),
  refs: ["Windows 11", "Microsoft 365", "Teams", "Edge"],
  basis: "official",
  group: "desktop",
  seed: "#0F6CBD",
  mode: "light",
  light: roles({ p: ["#0F6CBD", "#FFFFFF"], pc: ["#CFE4FA", "#0A3A66"], s: ["#616161", "#FFFFFF"], sc: ["#FFFFFF", "#242424"], t: ["#835B00", "#FFFFFF"], tc: ["#FBEBC2", "#3A2800"], bg: ["#FAFAFA", "#FFFFFF", "#FFFFFF", "#F5F5F5", "#EBEBEB"], text: ["#242424", "#616161"], line: ["#8A8A8A", "#E0E0E0"] }),
  dark: roles({ p: ["#479EF5", "#04213B"], pc: ["#0C3B5E", "#CFE4FA"], s: ["#ADADAD", "#242424"], sc: ["#3D3D3D", "#FFFFFF"], t: ["#E9C343", "#2B2000"], tc: ["#4A3800", "#FBEBC2"], bg: ["#1F1F1F", "#292929", "#292929", "#333333", "#3D3D3D"], text: ["#FFFFFF", "#ADADAD"], line: ["#6E6E6E", "#525252"] }),
  shape: "square",
  font: "segoe",
  icons: "fluentui",
  motion: "standard",
  control: "medium",
  pill: "round",
  compact: true,
  tokens: { tonedLine: "#D1D1D1" },
  screen: "radial-gradient(90% 60% at 80% 0%, rgb(15 108 189 / 0.05), transparent 70%)",
  recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "outline", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "outlined", segmented: "boxed", appbar: "compact", search: "boxed", input: "boxed", progress: "thin", row: "dense", menu: "compact", sheet: "panel", tooltip: "light", fab: "flat", badge: "pill", icon: "muted", scroll: "thin" },
  art: "soft translucent layers, gentle blue wallpaper bloom, calm productivity",
  ux: { margin: 16, gap: 12, tight: 0, nav: "keep" },
  layout: { zh: "宽屏时左侧导航窗格，顶部命令栏，内容是紧凑的列表和表单；控件矮、边距小，信息密度高。", en: "A navigation pane on the left when wide, a command bar on top, compact lists and forms below; short controls, small margins, dense." },
  css: "",
});
