import { DATA_PANELS, mix, role } from "../recipes/shared";
import { definePack, roles, say, TITLES, BODIES, LABELS } from "../types";

/** iOS's tertiary system fill: a grey that reads on the grey ground and on a white group alike */
const FILL = mix("outline", 20);
/** every field a person types into, whichever component draws it */
const FIELDS = `:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea],[data-slot=native-select],[data-slot=input-group],[data-slot=phone-input],[data-surface=field],[data-slot=text-field-box])`;

/* Apple's system colors and control sizes: capsule buttons, a translucent tab bar with a hairline, inset groups */
export default definePack({
  key: "ios",
  name: say("iOS", "iOS", "iOS", "iOS"),
  hint: say("iPhone 系统和苹果应用：胶囊按钮、半透明标签栏、圆角分组列表", "iPhone and Apple's apps: capsule buttons, a translucent tab bar, inset grouped lists", "iPhone とアップルのアプリ", "iPhone과 애플 앱"),
  refs: ["iOS 26", "Apple apps"],
  basis: "official",
  group: "app",
  seed: "#007AFF",
  mode: "light",
  light: roles({ p: ["#007AFF", "#FFFFFF"], pc: ["#D6E8FF", "#003A7A"], s: ["#636366", "#FFFFFF"], sc: ["#E5E5EA", "#1C1C1E"], t: ["#C75300", "#FFFFFF"], tc: ["#FFE3C7", "#4A1F00"], bg: ["#F2F2F7", "#FFFFFF", "#FFFFFF", "#EFEFF4", "#E5E5EA"], text: ["#000000", "#5C5C60"], line: ["#85858A", "#D1D1D6"] }),
  dark: roles({ p: ["#0A84FF", "#FFFFFF"], pc: ["#003A7A", "#D6E8FF"], s: ["#AEAEB2", "#1C1C1E"], sc: ["#3A3A3C", "#FFFFFF"], t: ["#FF9F0A", "#2B1600"], tc: ["#4A2A00", "#FFE3C7"], bg: ["#000000", "#1C1C1E", "#1C1C1E", "#2C2C2E", "#3A3A3C"], text: ["#FFFFFF", "#AEAEB2"], line: ["#8E8E93", "#38383A"] }),
  loud: ["primary"],
  shape: "rounded",
  font: "apple",
  icons: "sf",
  motion: "standard",
  control: "pill",
  pill: "round",
  tokens: { toggleOn: "#34C759" },
  recipes: { button: "flat", surface: "soft", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", meter: "thin", feedback: "dim", list: "inset", dialog: "alert", chip: "pill", check: "round", card: "raised", segmented: "ios", appbar: "ios", search: "cancel", input: "filled", progress: "thin", row: "chevron", divider: "hairline", menu: "ios", sheet: "grabber", tooltip: "dark", fab: "round", badge: "pill", icon: "tile", scroll: "hidden", picker: "ios" },
  art: "clean airy product photography, soft daylight, subtle translucency, restrained color",
  ux: { margin: 16, gap: 24, tight: 8, nav: "bottom" },
  layout: { zh: "分组列表放在灰底上，组与组之间留大间距；标题居中，返回箭头旁写上一页的名字；底部半透明标签栏，主按钮靠近内容、通栏胶囊。", en: "Inset grouped lists on a grey ground with generous gaps between groups; a centered title, the back chevron naming where it leads; a translucent tab bar along the foot; the main action a full-width capsule near the content." },
  type: { "headline-large": [34, 41, 700, 0.4], "headline-medium": [28, 34, 700, 0.4], "headline-small": [22, 28, 700, 0.3], ...TITLES([20, 25, 600, 0.3], [17, 22, 600, -0.4], [15, 20, 600, -0.2]), ...BODIES([17, 22, 400, -0.4], [15, 20, 400, -0.2], [13, 18, 400, -0.1]), ...LABELS([15, 20, 500, -0.2], [13, 18, 500, -0.1], [11, 13, 500, 0]) },
  css: [
    /* the tab bar: a translucent material across the foot with a hairline on top, no pill; the chosen tab is its filled
       glyph and its word in the tint, the others grey */
    `[data-slot=navigation-bar]{background-color:${mix("surface-container-low", 80)};-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);border-top:.5px solid ${mix("on-surface", 22)}}`,
    `[data-slot=navigation-bar] [data-slot=nav-item]{gap:2px;padding-block:6px 4px}`,
    `[data-slot=navigation-bar] [data-slot=nav-label]{font-size:10px;line-height:12px;font-weight:500;letter-spacing:.1px}`,
    `[data-slot=navigation-bar] [data-slot=nav-item]:not([data-active]) :is([data-slot=icon],[data-slot=nav-label]){color:${role("outline")}}`,
    /* the bar across the top is the same material, its hairline half a point */
    `[data-slot=app-bar]{-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);border-bottom-width:.5px}`,
    /* buttons: tinted (the accent at a low strength) and gray (the system fill) under the accent's words; the filled one semibold */
    `[data-slot=button]:is([data-variant=tonal],[data-variant=secondary]){background-color:${mix("primary", 15)};color:${role("primary")}}`,
    `[data-slot=button]:is([data-variant=outlined],[data-variant=outline],[data-variant=elevated]){background-color:${FILL};color:${role("primary")};border:0;box-shadow:none}`,
    `[data-button]:is([data-variant=default],[data-variant=filled]){font-weight:600}`,
    /* text fields: a rounded rectangle of the system fill, never a capsule; it reads on the grey ground and on a white group alike */
    `${FIELDS}{border-radius:10px;background-color:${FILL};border:0}`,
    `[data-slot=tag-input] [data-slot=input]{background-color:transparent}`,
    `[data-slot=input-otp-slot]{border:0;border-radius:10px;background-color:${FILL}}`,
    /* the stepper: a short grey rounded rectangle, its minus and plus in the words' color */
    `[data-slot=quantity-stepper]{max-height:34px;border-radius:9px;background-color:${FILL};padding:0}`,
    `[data-slot=quantity-stepper] [data-button]{color:${role("on-surface")};border-radius:9px}`,
    `[data-slot=quantity-stepper-value]{font-size:15px;font-weight:600}`,
    /* an action sheet's title is a small grey line, its actions are regular */
    `[data-slot=action-sheet-title]{font-size:13px;line-height:18px;font-weight:600;color:${role("on-surface-variant")}}`,
    `[data-slot=action-sheet-message]{font-size:13px;line-height:18px}`,
    `[data-slot=action-sheet-action]{font-weight:400}`,
    /* a sheet's title is the bar's: black, semibold; rows of a group parted by hairlines from where their words start */
    `:is([data-slot=sheet-title],[data-slot=drawer-title]){font-size:17px;line-height:22px;font-weight:600;color:${role("on-surface")}}`,
    `:is([data-slot=settings-row],[data-slot=file-row]){position:relative}`,
    `:is([data-slot=settings-row],[data-slot=file-row])+:is([data-slot=settings-row],[data-slot=file-row])::before{content:"";position:absolute;top:0;left:50px;right:0;height:.5px;background-color:${mix("on-surface", 14)}}`,
    /* a list a person reorders is a group too, its grips at the right of each row */
    `[data-slot=sortable-list]{gap:0;border-radius:var(--md-sys-shape-corner-medium);overflow:hidden;background-color:${role("surface-container-low")}}`,
    `[data-slot=sortable-list-row]{position:relative;border-radius:0;padding-inline:16px}`,
    `[data-slot=sortable-list-row]:not([data-dragging]){background-color:transparent}`,
    `[data-slot=sortable-list-row] [data-slot=icon]{order:2}`,
    `[data-slot=sortable-list-row]+[data-slot=sortable-list-row]::before{content:"";position:absolute;top:0;left:16px;right:0;height:.5px;background-color:${mix("on-surface", 14)}}`,
    /* an alert is a frosted card */
    `:is([data-slot=dialog-content],[data-slot=alert-dialog-content]){background-color:${mix("surface-container-high", 86)};-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8)}`,
    /* charts and tables stand on white cards on the grey ground, as in Health and Stocks */
    `${DATA_PANELS}{background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-large);padding:16px}`,
  ].join("\n"),
});
