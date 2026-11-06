import { CHIPS, MENUS, role } from "../recipes/shared";

const FIELDS = `:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea],[data-slot=native-select],[data-slot=input-group],[data-slot=phone-input],[data-surface=field],[data-slot=text-field-box])`;
import { definePack, roles, zhEnJaKo, TITLES, BODIES, LABELS } from "../types";

/* from memory of its web app's palette; the 2024 redesign from a press report */
export default definePack({
  key: "whatsapp",
  name: zhEnJaKo("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp"),
  hint: zhEnJaKo("聊天：中性底色、绿色点缀、浅绿气泡、胶囊指示", "Chat: neutral ground, green accents, pale green bubbles", "チャット：緑のアクセント", "채팅: 초록 포인트"),
  refs: ["WhatsApp"],
  basis: "memory",
  group: "app",
  seed: "#00A884",
  mode: "light",
  light: roles({ p: ["#008069", "#FFFFFF"], pc: ["#D9FDD3", "#0B3D22"], s: ["#54656F", "#FFFFFF"], sc: ["#D8FDD2", "#0B3D22"], t: ["#25D366", "#003314"], tc: ["#D9FDD3", "#0B3D22"], bg: ["#FFFFFF", "#FFFFFF", "#F0F2F5", "#E9EDEF", "#E9EDEF"], text: ["#111B21", "#54656F"], line: ["#8696A0", "#E9EDEF"] }),
  dark: roles({ p: ["#00A884", "#001F17"], pc: ["#005C4B", "#E9EDEF"], s: ["#8696A0", "#111B21"], sc: ["#103529", "#D9FDD3"], t: ["#25D366", "#003314"], tc: ["#103529", "#D9FDD3"], bg: ["#111B21", "#111B21", "#202C33", "#2A3942", "#2A3942"], text: ["#E9EDEF", "#AEBAC1"], line: ["#8696A0", "#222D34"] }),
  shape: "rounded",
  font: "inter",
  icons: "rounded",
  motion: "standard",
  control: "pill",
  pill: "round",
  recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "m3", slider: "thin", nav: "m3", field: "pill", bar: "plain", meter: "thin", feedback: "dim", list: "plain", check: "round", card: "flat", segmented: "capsules", search: "filled", input: "pill", progress: "thin", divider: "hairline", sheet: "grabber", fab: "square", scroll: "hidden", chip: "pill", badge: "pill" },
  art: "warm candid moment between friends, soft natural light, gentle muted colors",
  ux: { margin: 16, gap: 8, tight: 0, nav: "bottom" },
  layout: { zh: "顶部标题和搜索框，下面是头像、名字、最后一句、时间组成的聊天列表，右下角悬浮新建按钮，底部四个标签。", en: "A title and search on top, then chat rows of avatar, name, last line and time; a floating new-chat button at the lower right; four bottom tabs." },
  type: { ...TITLES([22, 28, 600, 0], [17, 22, 500, 0], [15, 20, 500, 0]), ...BODIES([16, 21, 400, 0], [14, 19, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 19, 500, 0], [13, 16, 500, 0], [12, 16, 500, 0]) },
  css: [
    /* the top bar is the page itself: white (or the dark ground), no line, a bold title at the left */
    `[data-slot=app-bar]{background-color:${role("surface")};border-bottom:0}`,
    `[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{font-size:22px;line-height:28px;font-weight:600}`,
    /* the tab bar: the page's color with a hairline above it, the chosen tab in a pale green pill */
    `[data-slot=navigation-bar]{background-color:${role("surface")};border-top:1px solid ${role("outline-variant")}}`,
    /* filter chips: grey capsules with no line, the chosen one pale green */
    `:is(${CHIPS}):not([data-pressed]){border-color:transparent;background-color:${role("surface-container")}}`,
    /* fields: a grey capsule with no line, like its search box */
    `${FIELDS}{background-color:${role("surface-container")};border-color:transparent}`,
    `[data-slot=tag-input] [data-slot=input]{background-color:transparent}`,
    /* a menu floats on a shadow over the white page */
    `:is(${MENUS},[data-slot=popover-content]){box-shadow:0 4px 16px rgb(0 0 0/.16)}`,
    /* an unread count: a green disc */
    `:is([data-slot=notification-badge],[data-slot$="-badge"]){background-color:${role("tertiary")};color:${role("on-tertiary")}}`,
  ].join("\n"),
});
