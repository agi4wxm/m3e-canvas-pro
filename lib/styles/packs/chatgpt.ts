import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/* the second most downloaded app of 2025; its colors from memory */
export default definePack({
  key: "chatgpt",
  name: say("ChatGPT", "ChatGPT", "ChatGPT", "ChatGPT"),
  hint: say("AI 助手：黑白灰、大圆角输入框、圆形发送按钮", "AI assistant: black, white and grey, a large rounded composer", "AI アシスタント：白黒と大きな入力欄", "AI 도우미: 흑백과 큰 입력창"),
  refs: ["ChatGPT"],
  basis: "memory",
  group: "app",
  seed: "#10A37F",
  mode: "light",
  light: roles({ p: ["#0D0D0D", "#FFFFFF"], pc: ["#ECECEC", "#0D0D0D"], s: ["#5D5D5D", "#FFFFFF"], sc: ["#F4F4F4", "#0D0D0D"], t: ["#0B7A5E", "#FFFFFF"], tc: ["#D9F5EC", "#06382B"], bg: ["#FFFFFF", "#F9F9F9", "#F9F9F9", "#F4F4F4", "#ECECEC"], text: ["#0D0D0D", "#5D5D5D"], line: ["#8F8F8F", "#E5E5E5"] }),
  dark: roles({ p: ["#FFFFFF", "#0D0D0D"], pc: ["#2F2F2F", "#ECECEC"], s: ["#B4B4B4", "#0D0D0D"], sc: ["#2F2F2F", "#ECECEC"], t: ["#10A37F", "#001F17"], tc: ["#0F3D31", "#C9F2E6"], bg: ["#212121", "#171717", "#171717", "#2F2F2F", "#3A3A3A"], text: ["#ECECEC", "#B4B4B4"], line: ["#8F8F8F", "#3A3A3A"] }),
  shape: "rounded",
  font: "inter",
  icons: "lucide",
  motion: "standard",
  control: "pill",
  pill: "round",
  tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#10A37F" },
  recipes: { button: "flat", surface: "line", tabs: "pill", toggle: "ios", slider: "thin", nav: "plain", field: "pill", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "pill", card: "outlined", segmented: "capsules", appbar: "center", search: "pill", input: "pill", progress: "thin", divider: "hairline", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "flat", badge: "pill", icon: "muted", scroll: "thin" },
  art: "calm minimal abstract gradient, soft monochrome, quiet and uncluttered",
  ux: { margin: 16, gap: 16, tight: 4, nav: "keep" },
  layout: { zh: "几乎没有界面：中间是对话，底部一个大圆角输入框和圆形发送按钮，导航收在侧边抽屉里。", en: "Almost no chrome: the conversation in the middle, a large rounded composer with a round send button at the foot, navigation folded into a side drawer." },
  type: { ...TITLES([18, 26, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [13, 18, 500, 0], [12, 16, 500, 0]) },
  css: "",
});
