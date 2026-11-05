import { BODIES, LABELS, TITLES, definePack, roles, zhEnJaKo } from "../types";

/* OpenAI's Codex, in the web app and the command line: neutral black and white, thin lines, compact rows, monospace
 * where the words are code (keys, diffs, branch names). From memory of its screens; its own faces are not free, so Inter and
 * JetBrains Mono stand in for them. */
export default definePack({
  key: "codex",
  name: zhEnJaKo("Codex", "Codex", "Codex", "Codex"),
  hint: zhEnJaKo("编程助手：中性黑白、细边框、紧凑任务列表、等宽字点缀", "Coding agent: neutral black and white, thin lines, a compact task list, monospace accents", "コーディングエージェント：白黒と細線、等幅の差し色", "코딩 에이전트: 흑백과 가는 선, 고정폭 글꼴"),
  refs: ["Codex"],
  basis: "memory",
  group: "app",
  seed: "#0D0D0D",
  mode: "dark",
  light: roles({ p: ["#0D0D0D", "#FFFFFF"], pc: ["#ECECEC", "#0D0D0D"], s: ["#5D5D5D", "#FFFFFF"], sc: ["#F3F3F3", "#0D0D0D"], t: ["#0B7A3E", "#FFFFFF"], tc: ["#DDF4E4", "#0A3A1E"], bg: ["#FFFFFF", "#FFFFFF", "#F9F9F9", "#F3F3F3", "#ECECEC"], text: ["#0D0D0D", "#5D5D5D"], line: ["#8F8F8F", "#E5E5E5"] }),
  dark: roles({ p: ["#F2F2F2", "#0D0D0D"], pc: ["#2A2A2A", "#ECECEC"], s: ["#A3A3A3", "#0D0D0D"], sc: ["#262626", "#ECECEC"], t: ["#3FB950", "#04210E"], tc: ["#0F2E1A", "#C6F2D3"], bg: ["#0D0D0D", "#141414", "#171717", "#212121", "#2A2A2A"], text: ["#ECECEC", "#A3A3A3"], line: ["#7A7A7A", "#2A2A2A"] }),
  shape: "rounded",
  font: "inter",
  icons: "lucide",
  motion: "standard",
  control: "pill",
  pill: "round",
  compact: true,
  tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#3FB950" },
  recipes: { button: "flat", surface: "line", card: "outlined", tabs: "underline", segmented: "boxed", toggle: "ios", slider: "thin", nav: "plain", appbar: "compact", bar: "line", field: "ring", input: "boxed", search: "boxed", progress: "thin", list: "hairline", row: "dense", menu: "compact", dialog: "modal", sheet: "panel", tooltip: "dark", fab: "flat", chip: "tag", badge: "square", icon: "muted", scroll: "thin", feedback: "dim" },
  art: "minimal dark terminal aesthetic, monospace glyphs, thin grey lines on near-black, a single green diff highlight",
  ux: { margin: 16, gap: 12, tight: 0, nav: "keep" },
  layout: {
    zh: "顶部一个大输入框写任务，旁边选仓库和分支；下面是紧凑的任务列表，每行标题、仓库名和等宽的增删行数（绿加红减），细线分隔；详情页左边对话日志，右边代码差异。",
    en: "A large prompt box on top to describe a task, with repository and branch pickers beside it; below, a compact task list, each row a title, the repository and monospace diff counts (green added, red removed), parted by hairlines; a task opens to a log at the left and the diff at the right.",
  },
  type: { "headline-large": [32, 40, 600, -0.5], "headline-medium": [26, 32, 600, -0.4], "headline-small": [20, 28, 600, -0.2], ...TITLES([16, 22, 600, 0], [14, 20, 600, 0], [13, 18, 600, 0]), ...BODIES([14, 20, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([13, 18, 500, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  /* Only what is code is set as code: keys, code, diffs. The rest is the sans of ChatGPT, whose web app Codex lives in:
     capsule buttons, a grey bubble for what the person wrote and plain text for the agent's answer. */
  css: `:is([data-slot=kbd],[data-slot=code-block],[data-slot=file-diff]){font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
[data-slot=chat-composer]{border:1px solid var(--md-sys-color-outline-variant);border-radius:var(--md-sys-shape-corner-large);background-color:var(--md-sys-color-surface-container-low)}
[data-slot=chat-composer-field] :is([data-slot=input],[data-slot=textarea]){border:0;background-color:transparent;box-shadow:none}
[data-slot=chat-composer-send]{border-radius:999px}
:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger])[class~="bg-primary-container"]{background-color:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
:is([data-slot=fab],[data-slot=fab-menu-trigger],[data-slot=extended-fab]){border-radius:999px}
[data-slot=sidebar-menu-button]{height:32px;border-radius:8px;padding-inline:8px;gap:8px;font-size:13px;color:var(--md-sys-color-on-surface-variant)}
[data-slot=sidebar-menu-button] [data-slot=icon]{width:16px;height:16px}
[data-slot=sidebar-menu-button][data-active]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
[data-slot=bubble]:is([data-variant=default],[data-variant=secondary],[data-variant=muted],[data-variant=tinted]) [data-slot=bubble-content]{background-color:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);border-radius:18px}
[data-slot=message][data-align=start] [data-slot=message-avatar]{display:none}
[data-slot=message][data-align=start] [data-slot=bubble]{max-width:100%}
[data-slot=message][data-align=start] [data-slot=bubble-content]{background-color:transparent;padding:0;border-radius:0}`,
});
