import { definePack, roles, zhEnJaKo, TITLES, BODIES, LABELS } from "../types";

/* the second most downloaded app of 2025; its colors from memory */
export default definePack({
  key: "chatgpt",
  name: zhEnJaKo("ChatGPT", "ChatGPT", "ChatGPT", "ChatGPT"),
  hint: zhEnJaKo("AI 助手：黑白灰、大圆角输入框、圆形发送按钮", "AI assistant: black, white and grey, a large rounded composer", "AI アシスタント：白黒と大きな入力欄", "AI 도우미: 흑백과 큰 입력창"),
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
  recipes: { button: "flat", surface: "line", tabs: "pill", toggle: "ios", slider: "thin", nav: "plain", field: "pill", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "pill", card: "outlined", segmented: "capsules", search: "pill", input: "pill", progress: "thin", divider: "hairline", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "flat", badge: "pill", icon: "muted", scroll: "thin" },
  art: "calm minimal abstract gradient, soft monochrome, quiet and uncluttered",
  ux: { margin: 16, gap: 16, tight: 4, nav: "keep" },
  layout: { zh: "几乎没有界面：中间是对话，底部一个大圆角输入框和圆形发送按钮，导航收在侧边抽屉里；左上角是带下拉箭头的模型名；只有自己发的话在灰色气泡里，回答是铺满栏宽的正文，下面一行小操作图标。", en: "Almost no chrome: the conversation in the middle, a large rounded composer with a round send button at the foot, navigation folded into a side drawer; the model name with a caret at the top left; only what the person wrote is in a grey bubble, an answer is plain text across the column with a row of small actions under it." },
  type: { ...TITLES([18, 26, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [13, 18, 500, 0], [12, 16, 500, 0]) },
  /* the composer is a large rounded box of its own, the field in it bare, the send a round dark button. The model
     picker stands at the top left, a title with a caret. Only what the person wrote is in a bubble, a grey one at the
     right; an answer is plain text across the column with a row of small actions under it. */
  css: `[data-slot=chat-composer]{background-color:var(--md-sys-color-surface-container-low);border:1px solid var(--md-sys-color-outline-variant);border-radius:28px;box-shadow:0 2px 12px rgb(0 0 0/.06);padding:8px 10px}
[data-slot=chat-composer-field] :is([data-slot=input],[data-slot=textarea]){border:0;background-color:transparent;box-shadow:none}
[data-slot=chat-composer-send]{border-radius:999px}
[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{font-size:18px;line-height:28px;font-weight:500}
[data-slot=app-bar-caret]{display:inline-flex;vertical-align:-3px;margin-left:4px;color:var(--md-sys-color-on-surface-variant)}
[data-slot=app-bar-caret] [data-slot=icon]{width:18px;height:18px}
[data-slot=app-bar]:has([data-slot=app-bar-back-label]) [data-slot=app-bar-caret]{display:none}
:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger])[class~="bg-primary-container"]{background-color:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
:is([data-slot=fab],[data-slot=fab-menu-trigger],[data-slot=extended-fab]){border-radius:999px}
[data-slot=sidebar-menu-button]{height:36px;border-radius:10px;padding-inline:10px;gap:8px;font-size:14px;color:var(--md-sys-color-on-surface)}
[data-slot=sidebar-menu-button] [data-slot=icon]{width:18px;height:18px}
[data-slot=sidebar-menu-button][data-active]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
[data-slot=bubble]:is([data-variant=default],[data-variant=secondary],[data-variant=muted],[data-variant=tinted]) [data-slot=bubble-content]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);border-radius:18px;padding-inline:16px}
[data-slot=message][data-align=start] [data-slot=message-avatar]{display:none}
[data-slot=message][data-align=start] [data-slot=bubble]{max-width:100%}
[data-slot=message][data-align=start] [data-slot=bubble-content]{background-color:transparent;padding:0;border-radius:0;font-size:16px;line-height:28px}
[data-slot=message-actions]{display:flex;gap:2px;margin-left:-6px;color:var(--md-sys-color-on-surface-variant)}
[data-slot=message-actions] [data-slot=icon]{width:18px;height:18px;margin:5px}`,
});
