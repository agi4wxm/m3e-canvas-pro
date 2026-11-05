import { BODIES, LABELS, TITLES, definePack, roles, say } from "../types";

/* Claude.ai as it looks in its web and phone apps: warm ivory, near-black words, one terracotta accent, titles in a
 * serif. The colors are from memory of the app and screenshots of it, not from a published palette; its own faces
 * are not free, so a free serif and a geometric sans stand in for them. */
export default definePack({
  key: "claude",
  name: say("Claude", "Claude", "Claude", "Claude"),
  hint: say("AI 助手：暖象牙色底、近黑文字、陶土橙点缀、衬线标题、柔和圆角卡片", "AI assistant: warm ivory, near-black words, a terracotta accent, serif titles, soft rounded cards", "AI アシスタント：温かいアイボリーとテラコッタ、明朝の見出し", "AI 도우미: 따뜻한 아이보리와 테라코타, 세리프 제목"),
  refs: ["Claude"],
  basis: "observed",
  group: "app",
  seed: "#C96442",
  mode: "light",
  light: roles({ p: ["#C96442", "#FFFFFF"], pc: ["#F5E3D8", "#5A2410"], s: ["#3D3D3A", "#FFFFFF"], sc: ["#EDEBE3", "#1F1E1D"], t: ["#4D6B3C", "#FFFFFF"], tc: ["#E2EAD8", "#1F2E14"], bg: ["#FAF9F5", "#FFFFFF", "#F5F4ED", "#F0EEE6", "#E8E6DC"], text: ["#141413", "#5E5D59"], line: ["#8C8A82", "#E5E3DA"] }),
  dark: roles({ p: ["#D97757", "#FFFFFF"], pc: ["#4A2A1C", "#F5D9C9"], s: ["#C2C0B6", "#1F1E1D"], sc: ["#3A3936", "#F5F4EE"], t: ["#9DBB86", "#14200C"], tc: ["#2A3622", "#DCEBCF"], bg: ["#262624", "#1F1E1D", "#30302E", "#3A3936", "#45443F"], text: ["#F5F4EE", "#C2C0B6"], line: ["#8A8880", "#3E3D39"] }),
  loud: ["primary"],
  shape: "rounded",
  font: "dmsans",
  display: "sourceSerif",
  icons: "phosphor",
  motion: "standard",
  control: "small",
  pill: "round",
  tokens: { toggleOn: "#C96442", navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", tonedLine: "#E5E3DA" },
  recipes: { button: "flat", surface: "line", card: "paper", tabs: "pill", segmented: "capsules", toggle: "ios", slider: "thin", nav: "plain", appbar: "center", bar: "plain", field: "pill", input: "boxed", search: "pill", progress: "thin", list: "plain", divider: "hairline", menu: "compact", dialog: "modal", sheet: "grabber", tooltip: "dark", fab: "flat", chip: "pill", badge: "pill", icon: "muted", scroll: "thin", feedback: "dim" },
  art: "warm minimal editorial illustration on ivory paper, terracotta and charcoal, soft hand-drawn shapes, calm and thoughtful",
  ux: { margin: 20, gap: 20, tight: 8, nav: "keep" },
  layout: {
    zh: "大量留白的暖象牙色页面：衬线大标题居中问候，下面一个白色大圆角输入框（细边、柔和阴影、陶土橙发送按钮），几枚胶囊快捷建议；导航收进侧边栏，对话正文宽松易读。",
    en: "A roomy warm-ivory page: a centered serif greeting, a large white rounded composer below it (hairline, soft shadow, a terracotta send button), a few capsule suggestions; navigation folded into a sidebar, the conversation set wide and easy to read.",
  },
  type: { "headline-large": [36, 44, 400, -0.4], "headline-medium": [30, 38, 400, -0.3], "headline-small": [24, 32, 400, -0.2], ...TITLES([20, 28, 500, -0.1], [16, 24, 500, 0], [14, 20, 500, 0]), ...BODIES([16, 26, 400, 0], [14, 22, 400, 0], [12, 18, 400, 0]), ...LABELS([14, 20, 500, 0], [13, 18, 500, 0], [11, 16, 500, 0.2]) },
  /* the composer is the product's face: a white box with a hairline and a soft shadow, larger corners than the rest */
  css: `[data-slot=chat-composer]{background-color:var(--md-sys-color-surface-container-low);border:1px solid var(--md-sys-color-outline-variant);border-radius:20px;box-shadow:0 4px 20px rgb(0 0 0/.05)}
:is([data-slot=card-title],[data-slot=dialog-title],[data-slot=sheet-title],[data-slot=section-header-title],[data-slot=empty-title]){font-family:var(--st-display,inherit);font-weight:500}`,
});
