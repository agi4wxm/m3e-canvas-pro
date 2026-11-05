import { definePack, roles, say } from "../types";

/* Ant Design's seed tokens and Ant Design Mobile's theme file */
export default definePack({
  key: "antd",
  name: say("支付宝 / 钉钉", "Ant Design", "Ant Design", "Ant Design"),
  hint: say("Ant Design：灰底白卡片、科技蓝、中后台和国内企业软件", "Ant Design: white cards on pale grey, tech blue, Chinese business software", "Ant Design：業務ソフトの定番", "Ant Design: 업무용 소프트웨어"),
  refs: ["Alipay", "DingTalk", "Feishu", "Ant Design"],
  basis: "official",
  group: "desktop",
  seed: "#1677FF",
  mode: "light",
  light: roles({ p: ["#1677FF", "#FFFFFF"], pc: ["#E6F4FF", "#003EB3"], s: ["#595959", "#FFFFFF"], sc: ["#FFFFFF", "#262626"], t: ["#FAAD14", "#2B1D00"], tc: ["#FFF7E6", "#613400"], bg: ["#F5F5F5", "#FFFFFF", "#FFFFFF", "#FAFAFA", "#F0F0F0"], text: ["#1F1F1F", "#595959"], line: ["#8C8C8C", "#D9D9D9"] }),
  dark: roles({ p: ["#1668DC", "#FFFFFF"], pc: ["#111A2C", "#A5C8FF"], s: ["#A6A6A6", "#141414"], sc: ["#1F1F1F", "#E6E6E6"], t: ["#D89614", "#1F1400"], tc: ["#2B2111", "#FFE3A6"], bg: ["#000000", "#141414", "#141414", "#1F1F1F", "#262626"], text: ["#E6E6E6", "#A6A6A6"], line: ["#7A7A7A", "#424242"] }),
  loud: ["primary"],
  shape: "soft",
  font: "inter",
  icons: "ant",
  motion: "standard",
  control: "medium",
  pill: "round",
  compact: true,
  tokens: { toggleOn: "#1677FF", tonedLine: "#D9D9D9" },
  recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "ring", bar: "line", meter: "thin", feedback: "dim", list: "hairline", dialog: "modal", chip: "tag", card: "headed", segmented: "boxed", appbar: "center", search: "filled", input: "boxed", progress: "track", row: "arrow", menu: "compact", sheet: "weui", tooltip: "dark", fab: "round", badge: "pill", scroll: "thin" },
  art: "clean enterprise dashboard, white cards on pale grey, confident blue accent, tidy tables",
  ux: { margin: 16, gap: 16, tight: 8, nav: "keep" },
  layout: { zh: "宽屏时左侧菜单、顶部面包屑，灰底上放白色卡片，卡片里是数据表格和表单；手机上是灰底白卡片加四个底部标签。", en: "A menu on the left and breadcrumbs on top when wide, white cards on grey holding tables and forms; on a phone, white cards on grey with four bottom tabs." },
  css: "",
});
