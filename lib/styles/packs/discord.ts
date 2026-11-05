import { definePack, roles, say } from "../types";

/* blurple from Discord's brand page; the dark greys from third-party palettes */
export default definePack({
  key: "discord",
  name: say("Discord", "Discord", "Discord", "Discord"),
  hint: say("玩家聊天：深灰分层、蓝紫主色、实心图标", "Gamer chat: layered dark greys, blurple, solid icons", "ゲーマーのチャット：濃い灰と青紫", "게이머 채팅: 짙은 회색과 파랑보라"),
  refs: ["Discord"],
  basis: "official",
  group: "desktop",
  seed: "#5865F2",
  mode: "dark",
  light: roles({ p: ["#5865F2", "#FFFFFF"], pc: ["#E0E3FF", "#2A2F7A"], s: ["#4E5058", "#FFFFFF"], sc: ["#E3E5E8", "#060607"], t: ["#1A7F45", "#FFFFFF"], tc: ["#D2F5E0", "#0A3D22"], bg: ["#FFFFFF", "#F2F3F5", "#F2F3F5", "#EBEDEF", "#E3E5E8"], text: ["#060607", "#4E5058"], line: ["#80848E", "#E3E5E8"] }),
  dark: roles({ p: ["#5865F2", "#FFFFFF"], pc: ["#3C45A5", "#E0E3FF"], s: ["#B5BAC1", "#1E1F22"], sc: ["#4E5058", "#FFFFFF"], t: ["#23A55A", "#03210F"], tc: ["#0F3D22", "#C7F2D6"], bg: ["#313338", "#2B2D31", "#2B2D31", "#383A40", "#1E1F22"], text: ["#F2F3F5", "#B5BAC1"], line: ["#80848E", "#3F4147"] }),
  shape: "rounded",
  font: "inter",
  icons: "remix",
  motion: "standard",
  control: "extra-small",
  pill: "round",
  compact: true,
  tokens: { toggleOn: "#23A55A", primaryText: "#006CE7", primaryTextDark: "#00A8FC" },
  recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "icononly", field: "soft", bar: "line", meter: "thin", feedback: "dim", list: "plain", dialog: "modal", chip: "pill", card: "flat", segmented: "capsules", appbar: "compact", search: "filled", input: "filled", progress: "thin", row: "dense", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", scroll: "thin" },
  art: "dark gaming hub, deep grey panels, bright blurple accents, glowing avatars",
  ux: { margin: 12, gap: 8, tight: 0, nav: "rail" },
  layout: { zh: "最左一列圆形服务器图标，旁边是频道列表，再旁边是消息流，底部一个输入框。", en: "A column of round server icons at the far left, a channel list beside it, the stream of messages beside that, a composer at the foot." },
  css: "",
});
