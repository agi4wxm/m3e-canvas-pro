import { mix, role } from "../recipes/shared";
import { definePack, roles, zhEnJaKo, TITLES, BODIES, LABELS } from "../types";

/* #FE2C55 and #25F4EE from third-party breakdowns of its brand; the black feed from its screenshots */
export default definePack({
  key: "shortvideo",
  name: zhEnJaKo("抖音 / TikTok", "TikTok", "TikTok", "TikTok"),
  hint: zhEnJaKo("短视频：纯黑底、红色主色、青色点缀、文字标签", "Short video: pure black, red accent, cyan touches, text tabs", "ショート動画：黒地に赤", "숏폼 영상: 검정 바탕에 빨강"),
  refs: ["TikTok", "Douyin"],
  basis: "observed",
  group: "app",
  seed: "#FE2C55",
  mode: "dark",
  light: roles({ p: ["#FE2C55", "#FFFFFF"], pc: ["#FFE3E9", "#5C0A1C"], s: ["#161823", "#FFFFFF"], sc: ["#F1F1F2", "#161823"], t: ["#007F7B", "#FFFFFF"], tc: ["#D6FBFA", "#00302F"], bg: ["#FFFFFF", "#FFFFFF", "#F8F8F8", "#F1F1F2", "#E8E8EA"], text: ["#161823", "#5F6066"], line: ["#8A8B91", "#E3E3E4"] }),
  dark: roles({ p: ["#FE2C55", "#FFFFFF"], pc: ["#4A0B1A", "#FFD6DF"], s: ["#25F4EE", "#00201F"], sc: ["#2A2A2E", "#FFFFFF"], t: ["#25F4EE", "#00201F"], tc: ["#0B3B3A", "#C8FBF9"], bg: ["#000000", "#121212", "#161823", "#1F2029", "#2A2B33"], text: ["#FFFFFF", "#A8A8B0"], line: ["#8A8B91", "#2F3038"] }),
  loud: ["primary"],
  shape: "rounded",
  font: "tiktok",
  icons: "remix",
  motion: "standard",
  control: "extra-small",
  pill: "round",
  tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#FE2C55" },
  recipes: { button: "flat", surface: "plain", tabs: "short", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "alert", card: "flat", segmented: "capsules", appbar: "center", search: "filled", input: "filled", progress: "thin", row: "arrow", divider: "hairline", menu: "compact", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", scroll: "hidden", picker: "weui" },
  art: "moody high-contrast portrait, neon rim light, vertical frame, deep black shadows",
  ux: { margin: 12, gap: 12, tight: 4, nav: "bottom", bleed: ["video"] },
  layout: { zh: "视频铺满整屏（用全屏场景图表现），顶部是文字标签，右侧竖排互动按钮，底部叠一段说明文字和黑色标签栏。", en: "The video fills the whole screen, so draw it as a full-screen scene rather than a video box; text tabs at the top; a column of actions down the right; a caption and a black tab bar over the foot." },
  type: { ...TITLES([20, 26, 600, 0], [16, 22, 600, 0], [14, 20, 600, 0]), ...BODIES([15, 21, 400, 0], [14, 19, 400, 0], [12, 16, 400, 0]), ...LABELS([15, 20, 600, 0], [13, 16, 500, 0], [10, 13, 500, 0]) },
  css: [
    /* the tab bar is the screen's own black (or white), a hairline above it; small words, the chosen tab bold and bright */
    `[data-slot=navigation-bar]{background-color:${role("surface")};border-top:.5px solid ${mix("on-surface", 12)}}`,
    `[data-slot=navigation-bar] [data-slot=nav-label]{font-size:10px;line-height:13px}`,
    `[data-slot=navigation-bar] [data-active] [data-slot=nav-label]{font-weight:600}`,
    /* a lesser button is a grey block or a grey line, its words in the text color */
    `[data-slot=button]:is([data-variant=outlined],[data-variant=outline]){border:1px solid ${role("outline-variant")};color:${role("on-surface")}}`,
    `[data-button]:is([data-variant=default],[data-variant=filled]){font-weight:600}`,
    /* a floating action is the red of its buttons, not a pale container */
    `:is([data-slot=fab],[data-slot=extended-fab],[data-slot=fab-menu-trigger]){background-color:${role("primary")};color:${role("on-primary")}}`,
  ].join("\n"),
});
