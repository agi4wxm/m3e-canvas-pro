import { BODIES, LABELS, TITLES, definePack, roles, zhEnJaKo } from "../types";

/* Claude.ai as it looks in its web and phone apps: warm ivory, near-black words, one terracotta accent, titles in a
 * serif. The colors are from memory of the app and screenshots of it, not from a published palette; its own faces
 * are not free, so a free serif and a geometric sans stand in for them. */
export default definePack({
  key: "claude",
  name: zhEnJaKo("Claude", "Claude", "Claude", "Claude"),
  hint: zhEnJaKo("AI 助手：暖象牙色底、近黑文字、陶土橙点缀、衬线标题、柔和圆角卡片", "AI assistant: warm ivory, near-black words, a terracotta accent, serif titles, soft rounded cards", "AI アシスタント：温かいアイボリーとテラコッタ、明朝の見出し", "AI 도우미: 따뜻한 아이보리와 테라코타, 세리프 제목"),
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
  tokens: { toggleOn: "#C96442", navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", tonedLine: "var(--md-sys-color-outline-variant)" },
  recipes: { button: "flat", surface: "line", card: "paper", tabs: "pill", segmented: "capsules", toggle: "ios", slider: "thin", nav: "plain", appbar: "center", bar: "plain", field: "ring", search: "pill", progress: "thin", list: "plain", divider: "hairline", menu: "compact", dialog: "modal", sheet: "grabber", tooltip: "dark", fab: "flat", badge: "pill", icon: "muted", scroll: "thin", feedback: "dim" },
  art: "warm minimal editorial illustration on ivory paper, terracotta and charcoal, soft hand-drawn shapes, calm and thoughtful",
  ux: { margin: 20, gap: 20, tight: 8, nav: "keep" },
  layout: {
    zh: "大量留白的暖象牙色页面：衬线大标题居中问候，下面一个白色大圆角输入框（细边、柔和阴影、陶土橙发送按钮），几枚细边圆角的快捷建议；导航收进侧边栏；回答不加气泡、用衬线字铺满栏宽，下面一行复制、重试、评价的小图标，自己发的话在右边浅色气泡里。",
    en: "A roomy warm-ivory page: a centered serif greeting, a large white rounded composer below it (hairline, soft shadow, a terracotta send button), a few outlined rounded suggestions; navigation folded into a sidebar; answers in no bubble, set in the serif across the column with a row of small copy, retry and rating icons under them, what the person wrote in a light bubble at the right.",
  },
  type: { "headline-large": [36, 44, 400, -0.4], "headline-medium": [30, 38, 400, -0.3], "headline-small": [24, 32, 400, -0.2], ...TITLES([20, 28, 500, -0.1], [16, 24, 500, 0], [14, 20, 500, 0]), ...BODIES([16, 26, 400, 0], [14, 22, 400, 0], [12, 18, 400, 0]), ...LABELS([14, 20, 500, 0], [13, 18, 500, 0], [11, 16, 500, 0.2]) },
  /* the composer is the product's face: a white box with a hairline and a soft shadow, larger corners than the rest.
     The terracotta is kept for what sends or starts something (the send arrow, the round new-chat button); a button
     with words on it is near-black, light in dark mode. Answers are not in a bubble: they run the width of the column in
     the serif, with a row of small actions under them; what the person wrote sits at the right in a light bubble. */
  css: `[data-slot=chat-composer]{background-color:var(--md-sys-color-surface-container-low);border:1px solid var(--md-sys-color-outline-variant);border-radius:20px;box-shadow:0 4px 20px rgb(0 0 0/.05);padding:10px 12px}
[data-slot=chat-composer-field] :is([data-slot=input],[data-slot=textarea]){border:0;background-color:transparent;box-shadow:none}
[data-slot=chat-composer-send]{border-radius:var(--md-sys-shape-corner-small);background-color:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
:is([data-slot=card-title],[data-slot=dialog-title],[data-slot=sheet-title],[data-slot=section-header-title],[data-slot=empty-title]){font-family:var(--st-display,inherit);font-weight:500}
:is([data-slot=dialog-content],[data-slot=alert-dialog-content]){background-color:var(--md-sys-color-surface-container-low);border-radius:16px}
[data-button][class~="bg-primary"]:not([data-size^=icon]){background-color:var(--md-sys-color-on-surface);color:var(--md-sys-color-surface)}
[data-button][class~="text-primary"]:is([data-variant=text],[data-variant=link]){color:var(--md-sys-color-on-surface)}
:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger])[class~="bg-primary-container"]{background-color:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger]){border-radius:999px;box-shadow:none}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){border-color:var(--md-sys-color-outline-variant);background-color:var(--md-sys-color-surface-container-low)}
[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{font-family:inherit;font-size:16px;line-height:24px;font-weight:500}
[data-slot=app-bar-caret]{display:inline-flex;vertical-align:-3px;margin-left:4px;color:var(--md-sys-color-on-surface-variant)}
[data-slot=app-bar-caret] [data-slot=icon]{width:16px;height:16px}
[data-slot=app-bar]:has([data-slot=app-bar-back-label]) [data-slot=app-bar-caret]{display:none}
[data-slot=sidebar-menu-button]{height:36px;border-radius:var(--md-sys-shape-corner-small);padding-inline:10px;gap:10px;font-size:14px;color:var(--md-sys-color-on-surface)}
[data-slot=sidebar-menu-button] [data-slot=icon]{width:18px;height:18px}
[data-slot=sidebar-menu-button][data-active]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
[data-slot=bubble]:is([data-variant=default],[data-variant=secondary],[data-variant=muted],[data-variant=tinted]) [data-slot=bubble-content]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);border-radius:16px}
[data-slot=message][data-align=start] [data-slot=message-avatar]{display:none}
[data-slot=message][data-align=start] [data-slot=bubble]{max-width:100%}
[data-slot=message][data-align=start] [data-slot=bubble-content]{background-color:transparent;padding:0;border-radius:0;font-family:var(--st-display,inherit);font-size:16px;line-height:26px}
[data-slot=message-actions]{display:flex;gap:2px;margin-left:-6px;color:var(--md-sys-color-on-surface-variant)}
[data-slot=message-actions] [data-slot=icon]{width:16px;height:16px;margin:6px}`,
});
