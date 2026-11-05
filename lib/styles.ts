import type { FontKey, IconFamily, MotionScheme, Palette, ShapeScale } from "./tokens";

/* A style is what a whole document looks like, in three layers: its colors and type, the shapes of its components, and
 * how a screen is laid out (margins, gaps, where the navigation stands, how lists run). It is plain data, written out as one stylesheet, so the canvas, the preview and an exported app wear
 * the same one and no part has to know about it. The stylesheet is unlayered, and everything a component says
 * about itself sits in Tailwind's layers, so it wins without !important; what a part is told by hand (its own
 * corners, its own fill) is drawn inline or by class on that part and stays its own. Material adds nothing.
 *
 * Every style here is modeled on products people actually use, chosen from download, revenue and concurrent-player
 * rankings of 2025 and 2026. They take a product's general visual language and none of its assets. `basis` says how
 * far the numbers can be trusted:
 *   official  published by the maker: design tokens, a theme file, brand guidelines
 *   sampled   read off the pixels of real screenshots of the product
 *   observed  described from looking at real screenshots, without exact values
 *   memory    no source could be reached; from general knowledge, to be checked */

export type StyleText = { zh: string; en: string; ja: string; ko: string };
export const styleTextOf = (t: StyleText, lang: string) => t[lang as keyof StyleText] ?? t.en;
const say = (zh: string, en: string, ja: string, ko: string): StyleText => ({ zh, en, ja, ko });

/* ---------- how the controls are built ---------- */

export const RECIPES = {
  button: ["m3", "flat", "hard", "chamfer", "bevel", "glow", "glass", "gloss", "lip", "text", "band", "slant", "ring", "tint", "frame"],
  surface: ["m3", "soft", "line", "hard", "glow", "glass", "ornate", "plain", "tile", "chunk", "hairline", "wood", "gilt", "steel"],
  tabs: ["m3", "segmented", "boxed", "glow", "underline", "topline", "slant", "band", "fade"],
  toggle: ["m3", "ios", "block", "outline", "chunky"],
  slider: ["m3", "thin", "block"],
  nav: ["m3", "plain", "topline", "block", "floating", "icononly", "gamebar", "goldglow"],
  field: ["m3", "soft", "boxed", "hard", "glow", "ring", "pill", "line"],
  bar: ["m3", "center", "line", "glow", "plain", "hud"],
  meter: ["m3", "thin", "jelly", "block", "segment"],
  list: ["m3", "inset", "flush", "plain", "hairline", "tile"],
  dialog: ["m3", "alert", "weui", "modal", "game", "plain"],
  avatar: ["m3", "square", "framed"],
  chip: ["m3", "pill", "tag"],
  check: ["m3", "round"],
  dialogue: ["m3", "portrait", "band"],
  feedback: ["m3", "dim", "press", "flash"],
} as const;

export type RecipeKey = keyof typeof RECIPES;
export type Recipes = { [K in RecipeKey]: (typeof RECIPES)[K][number] };
export const RECIPE_KEYS = Object.keys(RECIPES) as RecipeKey[];

const M3: Recipes = { button: "m3", surface: "m3", tabs: "m3", toggle: "m3", slider: "m3", nav: "m3", field: "m3", bar: "m3", meter: "m3", list: "m3", dialog: "m3", avatar: "m3", chip: "m3", check: "m3", dialogue: "m3", feedback: "m3" };

export const RECIPE_LABELS: Record<RecipeKey, StyleText> = {
  button: say("按钮", "Buttons", "ボタン", "버튼"),
  surface: say("卡片和面板", "Cards and panels", "カードとパネル", "카드와 패널"),
  tabs: say("标签页", "Tabs", "タブ", "탭"),
  toggle: say("开关", "Switches", "スイッチ", "스위치"),
  slider: say("滑块", "Sliders", "スライダー", "슬라이더"),
  nav: say("导航栏", "Navigation", "ナビゲーション", "내비게이션"),
  field: say("输入框", "Text fields", "入力欄", "입력란"),
  bar: say("顶栏", "Top bars", "トップバー", "상단 바"),
  meter: say("血条和进度", "Stat bars", "ゲージ", "상태 막대"),
  list: say("列表", "Lists", "リスト", "목록"),
  dialog: say("弹窗", "Dialogs", "ダイアログ", "대화상자"),
  avatar: say("头像", "Avatars", "アバター", "아바타"),
  chip: say("标签", "Chips", "チップ", "칩"),
  check: say("勾选框", "Checkboxes", "チェックボックス", "체크박스"),
  dialogue: say("剧情对话", "Story dialogue", "ストーリー会話", "스토리 대화"),
  feedback: say("按下反馈", "Press feedback", "押下の反応", "누름 반응"),
};

export const VARIANT_LABELS: Record<string, StyleText> = {
  portrait: say("文字在左，立绘在右", "Words left, portrait right", "左に文字、右に立ち絵", "왼쪽 글, 오른쪽 초상화"),
  m3: say("Material 默认", "Material", "Material", "Material"),
  flat: say("扁平", "Flat", "フラット", "플랫"),
  hard: say("粗边硬影", "Hard edge", "太枠と硬い影", "굵은 테두리"),
  chamfer: say("切角", "Chamfered", "面取り", "모따기"),
  bevel: say("金属浮雕", "Beveled", "ベベル", "베벨"),
  glow: say("霓虹发光", "Neon glow", "ネオン", "네온"),
  glass: say("毛玻璃", "Glass", "ガラス", "유리"),
  gloss: say("光泽厚边", "Glossy", "光沢の厚枠", "광택"),
  lip: say("底部厚边", "Bottom lip", "下縁の厚み", "아래 두께"),
  text: say("纯文字", "Text only", "文字のみ", "글자만"),
  band: say("米白色带", "Pale band", "淡い帯", "옅은 띠"),
  fade: say("淡出光带", "Fading band", "消えていく帯", "사라지는 띠"),
  slant: say("斜切", "Slanted", "斜め", "기울임"),
  ring: say("细内环胶囊", "Ringed capsule", "細い内枠", "가는 안쪽 테"),
  tint: say("暗色描边", "Tinted line", "暗色の線", "어두운 선"),
  frame: say("金色细框", "Gold frame", "金の細枠", "금색 테"),
  soft: say("柔和", "Soft", "ソフト", "부드럽게"),
  line: say("细线", "Hairline", "細線", "가는 선"),
  ornate: say("华丽描边", "Ornate", "装飾枠", "장식 테두리"),
  plain: say("无边无影", "Plain", "プレーン", "단순"),
  tile: say("白色方块", "Tile", "タイル", "타일"),
  chunk: say("厚重双色边", "Chunky", "太い二色枠", "두꺼운 테"),
  hairline: say("双层细金线", "Double hairline", "二重の細線", "이중 가는 선"),
  wood: say("木框", "Wood frame", "木枠", "나무 테"),
  gilt: say("细金边", "Gilt", "金の縁", "금테"),
  steel: say("钢板", "Steel", "鋼板", "강판"),
  segmented: say("分段", "Segmented", "セグメント", "세그먼트"),
  boxed: say("方框", "Boxed", "ボックス", "상자"),
  underline: say("下划线", "Underline", "下線", "밑줄"),
  topline: say("顶部亮线", "Top line", "上部ライン", "상단 선"),
  ios: say("iOS 式", "iOS", "iOS 風", "iOS"),
  block: say("方块", "Block", "ブロック", "블록"),
  outline: say("Windows 式", "Windows", "Windows 風", "Windows"),
  chunky: say("厚实胶囊", "Chunky", "太いカプセル", "두꺼운 캡슐"),
  thin: say("细轨", "Thin", "細い", "얇게"),
  floating: say("悬浮胶囊", "Floating capsule", "浮くカプセル", "떠 있는 캡슐"),
  icononly: say("只有图标", "Icons only", "アイコンのみ", "아이콘만"),
  gamebar: say("游戏底栏", "Game bar", "ゲームバー", "게임 바"),
  goldglow: say("金色光晕", "Gold glow", "金の光", "금빛"),
  pill: say("大圆角", "Rounded box", "大きな角丸", "큰 둥근 모서리"),
  center: say("居中标题", "Centered", "中央タイトル", "가운데 제목"),
  hud: say("游戏信息条", "Game HUD", "ゲーム HUD", "게임 HUD"),
  jelly: say("果冻", "Jelly", "ゼリー", "젤리"),
  segment: say("分段格", "Segmented", "区切り", "칸"),
  inset: say("圆角分组", "Inset groups", "角丸のグループ", "둥근 묶음"),
  flush: say("通栏细线", "Full width", "全幅", "전체 너비"),
  alert: say("居中提醒", "Centered alert", "中央アラート", "가운데 알림"),
  weui: say("上下分栏按钮", "Split buttons", "分割ボタン", "나뉜 버튼"),
  modal: say("靠右按钮", "Buttons at right", "右寄せボタン", "오른쪽 버튼"),
  game: say("彩色标题条", "Colored header", "色付きヘッダー", "색 머리글"),
  square: say("圆角方形", "Rounded square", "角丸の四角", "둥근 사각"),
  framed: say("带框", "Framed", "枠付き", "테두리"),
  tag: say("小方标签", "Small tag", "小さなタグ", "작은 태그"),
  round: say("圆形", "Round", "丸", "원형"),
  dim: say("变暗", "Dim", "暗くする", "어둡게"),
  press: say("下压", "Press down", "沈み込み", "눌림"),
  flash: say("闪亮", "Flash", "発光", "번쩍임"),
};

/* ---------- the styles ---------- */

/** the color roles a style names; the ones a scheme has beyond these follow from them */
export type StyleRoles = Omit<Palette, "key" | "label" | "seed" | "error" | "onError" | "errorContainer" | "onErrorContainer"> & {
  onSecondary: string;
  tertiary: string;
  onTertiary: string;
} & Partial<Pick<Palette, "error" | "onError" | "errorContainer" | "onErrorContainer">>;

export type StyleGroup = "app" | "desktop" | "mobileGame" | "pcGame";

/** where a screen's main navigation stands, and how a screen is spaced: what Tidy lays a screen out by */
export type StyleUX = {
  /** between the screen's edge and what is on it, in px */
  margin: number;
  /** between the rows of a screen */
  gap: number;
  /** between rows of one kind, and after a heading */
  tight: number;
  /** "keep" leaves it wherever the author put it */
  nav: "keep" | "bottom" | "rail" | "top";
  /** where the body of a screen gathers */
  place: "top" | "center" | "bottom" | "spread";
  /** the media a style runs from edge to edge, with no corners */
  bleed?: ("video" | "image")[];
};

/** Material's own: a 16dp margin, 16dp between rows, 8dp between rows of a kind */
export const DEFAULT_UX: StyleUX = { margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" };

export type StylePack = {
  key: string;
  name: StyleText;
  /** one line saying whose look this is and what gives it away */
  hint: StyleText;
  /** the products it is modeled on */
  refs: string[];
  basis: "official" | "sampled" | "observed" | "memory";
  group: StyleGroup;
  /** the color a scheme is generated from at the higher contrast levels, and for the roles it does not name */
  seed: string;
  light: StyleRoles;
  dark: StyleRoles;
  /** the mode it is at its best in, and the one it opens with */
  mode: "light" | "dark";
  shape: ShapeScale;
  font: FontKey;
  /** headings, when they take another face */
  display?: FontKey;
  icons: IconFamily;
  motion: MotionScheme;
  recipes: Partial<Recipes>;
  /** the corner of a button or a chip: "pill" keeps M3's round ends, a step follows the shape scale */
  control: "pill" | "extra-small" | "small" | "medium" | "large";
  /** what `rounded-full` means: "round" stays round, "follow" takes the control's corner, so a circle turns square */
  pill: "round" | "follow";
  /** desktop software packs its controls closer and sets its words smaller */
  compact?: boolean;
  /** the width of a hard edge, in px */
  edge?: number;
  /** behind everything on a screen, in both modes unless `screenDark` says otherwise */
  screen?: string;
  screenDark?: string;
  /** set in capitals, spaced out: the labels on its buttons and tabs */
  capsLabels?: boolean;
  /** headings lean */
  italicDisplay?: boolean;
  /** the pairs of roles that are this product's own even though they read below 4.5:1, kept because they are what it looks like */
  loud?: (keyof StyleRoles)[];
  /** colors of a control that no role names */
  tokens?: Partial<Record<StyleToken, string>>;
  /** the words every picture of this style is painted with */
  art: string;
  /** how a screen of this style is spaced and where its navigation stands */
  ux: StyleUX;
  /** how a screen of this product is composed, in words: for a model drafting one, and in the prompt */
  layout: StyleText;
};

export type StyleToken = "rim" | "rimDark" | "stroke" | "toggleOn" | "navOn" | "navBg" | "navActive" | "barBg" | "onBar" | "tabOn" | "primaryText" | "primaryTextDark" | "tonedLine";

type Pair = [string, string];
/** a scheme written short: [fill, on it] for each accent, then the five surfaces low to high, the two text levels and the two lines */
const roles = (r: { p: Pair; pc: Pair; s: Pair; sc: Pair; t: Pair; tc: Pair; bg: [string, string, string, string, string]; text: Pair; line: Pair }): StyleRoles => ({
  primary: r.p[0],
  onPrimary: r.p[1],
  primaryContainer: r.pc[0],
  onPrimaryContainer: r.pc[1],
  inversePrimary: r.pc[0],
  secondary: r.s[0],
  onSecondary: r.s[1],
  secondaryContainer: r.sc[0],
  onSecondaryContainer: r.sc[1],
  tertiary: r.t[0],
  onTertiary: r.t[1],
  tertiaryContainer: r.tc[0],
  onTertiaryContainer: r.tc[1],
  surface: r.bg[0],
  surfaceContainerLow: r.bg[1],
  surfaceContainer: r.bg[2],
  surfaceContainerHigh: r.bg[3],
  surfaceContainerHighest: r.bg[4],
  onSurface: r.text[0],
  onSurfaceVariant: r.text[1],
  outline: r.line[0],
  outlineVariant: r.line[1],
  inverseSurface: r.text[0],
  inverseOnSurface: r.bg[0],
});

const ERRORS_LIGHT = { error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B" };
const ERRORS_DARK = { error: "#FF8A80", onError: "#3B0907", errorContainer: "#7A1F1A", onErrorContainer: "#FFDAD6" };

const PACKS: Omit<StylePack, "ux" | "layout">[] = [
  /* ---------- phone apps ---------- */
  {
    /* Apple's system colors and control sizes; iOS 26 puts buttons and the tab bar in capsules */
    key: "ios",
    name: say("iOS", "iOS", "iOS", "iOS"),
    hint: say("iPhone 系统和苹果应用：胶囊按钮、悬浮底栏、分段控件", "iPhone and Apple's apps: capsule buttons, a floating tab bar, segmented controls", "iPhone とアップルのアプリ", "iPhone과 애플 앱"),
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
    icons: "light",
    motion: "standard",
    control: "pill",
    pill: "round",
    tokens: { toggleOn: "#34C759" },
    recipes: { button: "flat", surface: "soft", tabs: "segmented", toggle: "ios", slider: "thin", nav: "floating", field: "soft", bar: "center", meter: "thin", feedback: "dim" },
    art: "clean airy product photography, soft daylight, subtle translucency, restrained color",
  },
  {
    /* #FE2C55 and #25F4EE from third-party breakdowns of its brand; the black feed from its screenshots */
    key: "shortvideo",
    name: say("抖音 / TikTok", "TikTok", "TikTok", "TikTok"),
    hint: say("短视频：纯黑底、红色主色、青色点缀、文字标签", "Short video: pure black, red accent, cyan touches, text tabs", "ショート動画：黒地に赤", "숏폼 영상: 검정 바탕에 빨강"),
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
    icons: "rounded",
    motion: "standard",
    control: "extra-small",
    pill: "round",
    tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#FE2C55" },
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim" },
    art: "moody high-contrast portrait, neon rim light, vertical frame, deep black shadows",
  },
  {
    /* its dark palette from third-party breakdowns; Spotify's own brand page could not be read */
    key: "spotify",
    name: say("Spotify", "Spotify", "Spotify", "Spotify"),
    hint: say("音乐流媒体：近黑底、荧光绿胶囊按钮、方形封面", "Music streaming: near black, bright green capsules, square covers", "音楽配信：黒地に緑のカプセル", "음악 스트리밍: 검정 바탕에 초록"),
    refs: ["Spotify"],
    basis: "observed",
    group: "app",
    seed: "#1ED760",
    mode: "dark",
    light: roles({ p: ["#1ED760", "#000000"], pc: ["#C9F7DA", "#0F5B2C"], s: ["#121212", "#FFFFFF"], sc: ["#EDEDED", "#121212"], t: ["#535353", "#FFFFFF"], tc: ["#E4E4E4", "#121212"], bg: ["#FFFFFF", "#FAFAFA", "#F5F5F5", "#EDEDED", "#E4E4E4"], text: ["#121212", "#535353"], line: ["#878787", "#DDDDDD"] }),
    dark: roles({ p: ["#1ED760", "#000000"], pc: ["#0F5B2C", "#C9F7DA"], s: ["#FFFFFF", "#000000"], sc: ["#282828", "#FFFFFF"], t: ["#B3B3B3", "#000000"], tc: ["#3A3A3A", "#FFFFFF"], bg: ["#121212", "#181818", "#181818", "#282828", "#333333"], text: ["#FFFFFF", "#B3B3B3"], line: ["#727272", "#3E3E3E"] }),
    shape: "square",
    font: "dmsans",
    icons: "filled",
    motion: "standard",
    control: "pill",
    pill: "round",
    tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#1ED760", primaryText: "#0E7A3A" },
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim" },
    art: "bold album-cover art, saturated duotone, grainy texture, strong graphic shapes",
  },
  {
    /* WeChat's own WeUI 2.6: its colors, 8px buttons, 56px rows */
    key: "wechat",
    name: say("微信", "WeChat", "WeChat", "WeChat"),
    hint: say("超级应用：灰底白列表、细分隔线、只用一种绿", "Super app: grey ground, white lists, hairlines, one green", "スーパーアプリ：灰地に白のリスト", "슈퍼앱: 회색 바탕에 흰 목록"),
    refs: ["WeChat"],
    basis: "official",
    group: "app",
    seed: "#07C160",
    mode: "light",
    light: roles({ p: ["#07C160", "#FFFFFF"], pc: ["#D8F5E4", "#05532A"], s: ["#576B95", "#FFFFFF"], sc: ["#F2F2F2", "#1A1A1A"], t: ["#FA5151", "#FFFFFF"], tc: ["#FFE1E1", "#7A1010"], bg: ["#EDEDED", "#FFFFFF", "#FFFFFF", "#F7F7F7", "#F2F2F2"], text: ["#191919", "#666666"], line: ["#808080", "#E5E5E5"] }),
    dark: roles({ p: ["#07C160", "#FFFFFF"], pc: ["#0B3D22", "#C9F2DB"], s: ["#7D90A9", "#0E1114"], sc: ["#2C2C2C", "#D1D1D1"], t: ["#FA5151", "#FFFFFF"], tc: ["#4A1616", "#FFD6D6"], bg: ["#111111", "#191919", "#191919", "#232323", "#2C2C2C"], text: ["#D1D1D1", "#9A9A9A"], line: ["#7A7A7A", "#2E2E2E"] }),
    loud: ["primary", "tertiary"],
    shape: "rounded",
    font: "system",
    icons: "light",
    motion: "standard",
    control: "small",
    pill: "round",
    tokens: { toggleOn: "#07C160", primaryText: "#576B95", primaryTextDark: "#7D90A9" },
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", meter: "thin", feedback: "dim" },
    art: "flat friendly illustration, light grey ground, single green accent",
  },
  {
    /* Temu's orange from a third-party breakdown; Taobao's from memory; the layout from its screenshots */
    key: "shop",
    name: say("淘宝 / Temu", "Taobao / Temu", "Taobao / Temu", "Taobao / Temu"),
    hint: say("电商：灰底白卡片、橙色胶囊按钮、红色价格", "Marketplace: white tiles on grey, orange capsules, red prices", "EC：灰地に白いカードと橙のボタン", "커머스: 회색 바탕에 흰 카드와 주황 버튼"),
    refs: ["Taobao", "Temu", "Shein"],
    basis: "memory",
    group: "app",
    seed: "#FF5000",
    mode: "light",
    light: roles({ p: ["#FF5000", "#FFFFFF"], pc: ["#FFE7DC", "#7A2600"], s: ["#333333", "#FFFFFF"], sc: ["#FFF1E8", "#7A2600"], t: ["#FF3141", "#FFFFFF"], tc: ["#FFE5E7", "#8A0F1A"], bg: ["#F5F5F5", "#FFFFFF", "#FFFFFF", "#F8F8F8", "#EEEEEE"], text: ["#1F1F1F", "#666666"], line: ["#808080", "#EEEEEE"] }),
    dark: roles({ p: ["#FF5000", "#FFFFFF"], pc: ["#4A2110", "#FFD9C4"], s: ["#E6E6E6", "#141414"], sc: ["#3A2418", "#FFD9C4"], t: ["#FF5A66", "#2B0003"], tc: ["#4A1A1E", "#FFD6DA"], bg: ["#141414", "#1F1F1F", "#1F1F1F", "#2A2A2A", "#333333"], text: ["#F2F2F2", "#A6A6A6"], line: ["#8C8C8C", "#333333"] }),
    loud: ["primary", "tertiary"],
    shape: "rounded",
    font: "inter",
    icons: "rounded",
    motion: "standard",
    control: "pill",
    pill: "round",
    tokens: { toggleOn: "#FF5000" },
    recipes: { button: "flat", surface: "tile", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "pill", bar: "line", meter: "thin", feedback: "dim" },
    art: "bright product flat-lay, saturated promo colors, bold sale badges, cheerful and busy",
  },
  {
    /* Instagram's blue from memory; its layout from common knowledge of the app */
    key: "social",
    name: say("Instagram", "Instagram", "Instagram", "Instagram"),
    hint: say("图片社交：黑白极简、底栏只有图标、细分隔线", "Photo social: black and white, an icon-only bar, hairlines", "写真 SNS：白黒とアイコンのみのバー", "사진 SNS: 흑백과 아이콘만 있는 바"),
    refs: ["Instagram", "Threads"],
    basis: "memory",
    group: "app",
    seed: "#0095F6",
    mode: "light",
    light: roles({ p: ["#0095F6", "#FFFFFF"], pc: ["#E0F1FF", "#003A66"], s: ["#262626", "#FFFFFF"], sc: ["#EFEFEF", "#262626"], t: ["#ED4956", "#FFFFFF"], tc: ["#FFE3E5", "#7A1019"], bg: ["#FFFFFF", "#FFFFFF", "#FAFAFA", "#F2F2F2", "#EFEFEF"], text: ["#000000", "#696969"], line: ["#8E8E8E", "#DBDBDB"] }),
    dark: roles({ p: ["#0095F6", "#FFFFFF"], pc: ["#003A66", "#E0F1FF"], s: ["#F5F5F5", "#000000"], sc: ["#262626", "#F5F5F5"], t: ["#ED4956", "#FFFFFF"], tc: ["#4A1419", "#FFD6DA"], bg: ["#000000", "#121212", "#121212", "#1C1C1C", "#262626"], text: ["#F5F5F5", "#A8A8A8"], line: ["#737373", "#262626"] }),
    loud: ["primary", "tertiary"],
    shape: "rounded",
    font: "apple",
    icons: "rounded",
    motion: "standard",
    control: "small",
    pill: "round",
    tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#0095F6", primaryText: "#00376B" },
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "icononly", field: "soft", bar: "line", meter: "thin", feedback: "dim" },
    art: "candid bright lifestyle photograph, natural color, square or vertical crop",
  },
  {
    /* from memory of its web app's palette; the 2024 redesign from a press report */
    key: "whatsapp",
    name: say("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp"),
    hint: say("聊天：中性底色、绿色点缀、浅绿气泡、胶囊指示", "Chat: neutral ground, green accents, pale green bubbles", "チャット：緑のアクセント", "채팅: 초록 포인트"),
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
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "m3", slider: "thin", nav: "m3", field: "pill", bar: "line", meter: "thin", feedback: "dim" },
    art: "warm candid moment between friends, soft natural light, gentle muted colors",
  },
  {
    /* the second most downloaded app of 2025; its colors from memory */
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
    icons: "light",
    motion: "standard",
    control: "pill",
    pill: "round",
    tokens: { navOn: "var(--md-sys-color-on-surface)", tabOn: "var(--md-sys-color-on-surface)", toggleOn: "#10A37F" },
    recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "pill", bar: "plain", meter: "thin", feedback: "dim" },
    art: "calm minimal abstract gradient, soft monochrome, quiet and uncluttered",
  },

  /* ---------- desktop software ---------- */
  {
    /* Microsoft's Fluent 2 tokens and Windows geometry doc: 4px controls, 8px dialogs, 32px controls, a 40x20 switch */
    key: "fluent",
    name: say("Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office", "Windows 11 / Office"),
    hint: say("Fluent：小圆角、细边框、紧凑、微软蓝", "Fluent: small corners, hairlines, compact, Microsoft blue", "Fluent：小さな角丸と細線", "Fluent: 작은 모서리와 가는 선"),
    refs: ["Windows 11", "Microsoft 365", "Teams", "Edge"],
    basis: "official",
    group: "desktop",
    seed: "#0F6CBD",
    mode: "light",
    light: roles({ p: ["#0F6CBD", "#FFFFFF"], pc: ["#CFE4FA", "#0A3A66"], s: ["#616161", "#FFFFFF"], sc: ["#FFFFFF", "#242424"], t: ["#835B00", "#FFFFFF"], tc: ["#FBEBC2", "#3A2800"], bg: ["#FAFAFA", "#FFFFFF", "#FFFFFF", "#F5F5F5", "#EBEBEB"], text: ["#242424", "#616161"], line: ["#8A8A8A", "#E0E0E0"] }),
    dark: roles({ p: ["#479EF5", "#04213B"], pc: ["#0C3B5E", "#CFE4FA"], s: ["#ADADAD", "#242424"], sc: ["#3D3D3D", "#FFFFFF"], t: ["#E9C343", "#2B2000"], tc: ["#4A3800", "#FBEBC2"], bg: ["#1F1F1F", "#292929", "#292929", "#333333", "#3D3D3D"], text: ["#FFFFFF", "#ADADAD"], line: ["#6E6E6E", "#525252"] }),
    shape: "square",
    font: "segoe",
    icons: "light",
    motion: "standard",
    control: "medium",
    pill: "round",
    compact: true,
    tokens: { tonedLine: "#D1D1D1" },
    screen: "radial-gradient(90% 60% at 80% 0%, rgb(15 108 189 / 0.05), transparent 70%)",
    recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "outline", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim" },
    art: "soft translucent layers, gentle blue wallpaper bloom, calm productivity",
  },
  {
    /* the Dark Modern and Light Modern theme files in VS Code's own repository */
    key: "vscode",
    name: say("VS Code", "VS Code", "VS Code", "VS Code"),
    hint: say("开发工具：炭灰面板、灰线、单一蓝色、方正紧凑", "Developer tool: charcoal panels, grey lines, one blue, square and dense", "開発ツール：炭色のパネル", "개발 도구: 숯색 패널"),
    refs: ["VS Code", "Cursor"],
    basis: "official",
    group: "desktop",
    seed: "#0078D4",
    mode: "dark",
    light: roles({ p: ["#005FB8", "#FFFFFF"], pc: ["#D6E8F8", "#003A70"], s: ["#616161", "#FFFFFF"], sc: ["#E5E5E5", "#3B3B3B"], t: ["#0F7B6C", "#FFFFFF"], tc: ["#D2F2EC", "#0A3D35"], bg: ["#FFFFFF", "#F8F8F8", "#F8F8F8", "#F2F2F2", "#E5E5E5"], text: ["#3B3B3B", "#616161"], line: ["#8A8A8A", "#E5E5E5"] }),
    dark: roles({ p: ["#0078D4", "#FFFFFF"], pc: ["#04395E", "#CCCCCC"], s: ["#9D9D9D", "#181818"], sc: ["#313131", "#CCCCCC"], t: ["#4EC9B0", "#0B2A24"], tc: ["#0B3A33", "#BFF0E6"], bg: ["#1F1F1F", "#181818", "#181818", "#252526", "#2B2B2B"], text: ["#CCCCCC", "#9D9D9D"], line: ["#7A7A7A", "#2B2B2B"] }),
    shape: "square",
    font: "segoe",
    icons: "light",
    motion: "standard",
    control: "small",
    pill: "round",
    compact: true,
    tokens: { tabOn: "#0078D4" },
    recipes: { button: "flat", surface: "line", tabs: "topline", toggle: "outline", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim" },
    art: "dark code editor workspace, charcoal panels, thin grey lines, a single blue accent",
  },
  {
    /* blurple from Discord's brand page; the dark greys from third-party palettes */
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
    icons: "filled",
    motion: "standard",
    control: "extra-small",
    pill: "round",
    compact: true,
    tokens: { toggleOn: "#23A55A", primaryText: "#006CE7", primaryTextDark: "#00A8FC" },
    recipes: { button: "flat", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "line", meter: "thin", feedback: "dim" },
    art: "dark gaming hub, deep grey panels, bright blurple accents, glowing avatars",
  },
  {
    /* third-party palettes of its store and client; Valve publishes none */
    key: "steam",
    name: say("Steam", "Steam", "Steam", "Steam"),
    hint: say("游戏平台：深海军蓝、钢蓝面板、天蓝点缀", "Game store: deep navy, steel-blue panels, sky-blue accents", "ゲームストア：濃紺と空色", "게임 스토어: 짙은 남색과 하늘색"),
    refs: ["Steam"],
    basis: "observed",
    group: "desktop",
    seed: "#66C0F4",
    mode: "dark",
    light: roles({ p: ["#1A6FA8", "#FFFFFF"], pc: ["#D3E9F7", "#0B3A5A"], s: ["#4B5A68", "#FFFFFF"], sc: ["#DCE6EE", "#1B2838"], t: ["#5C7A00", "#FFFFFF"], tc: ["#E7F4B8", "#2B3A00"], bg: ["#E9EFF4", "#FFFFFF", "#F4F7FA", "#E2EAF0", "#D6E0E9"], text: ["#1B2838", "#46586A"], line: ["#73879A", "#C6D3DE"] }),
    dark: roles({ p: ["#66C0F4", "#0B1A26"], pc: ["#2A475E", "#C7D5E0"], s: ["#8F98A0", "#171A21"], sc: ["#2A475E", "#C7D5E0"], t: ["#A4D007", "#1A2600"], tc: ["#3D4F0F", "#D2EFA9"], bg: ["#1B2838", "#171A21", "#16202D", "#223447", "#223A50"], text: ["#C7D5E0", "#A3B1BE"], line: ["#66788A", "#2A475E"] }),
    shape: "square",
    font: "inter",
    icons: "filled",
    motion: "standard",
    control: "small",
    pill: "round",
    compact: true,
    screenDark: "linear-gradient(#171A21 0, #1B2838 140px)",
    tokens: { barBg: "#171A21", onBar: "#C7D5E0", rim: "#2A475E", toggleOn: "#66C0F4" },
    recipes: { button: "bevel", surface: "plain", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "hud", meter: "thin", feedback: "dim" },
    art: "dark game library, deep navy panels, cool blue glow, cover art lined up",
  },
  {
    /* secondary sources for its text and sidebar colors; it publishes none */
    key: "notion",
    name: say("Notion", "Notion", "Notion", "Notion"),
    hint: say("文档工具：暖白、柔灰、细线、几乎没有颜色", "Document tool: warm white, soft grey, hairlines, almost no color", "文書ツール：温かい白と細線", "문서 도구: 따뜻한 흰색과 가는 선"),
    refs: ["Notion"],
    basis: "observed",
    group: "desktop",
    seed: "#2383E2",
    mode: "light",
    light: roles({ p: ["#2383E2", "#FFFFFF"], pc: ["#E7F3FC", "#0B4A80"], s: ["#64635E", "#FFFFFF"], sc: ["#F1F1EF", "#37352F"], t: ["#B35C00", "#FFFFFF"], tc: ["#FAEBDD", "#5A2C00"], bg: ["#FFFFFF", "#F7F6F3", "#F7F6F3", "#F1F1EF", "#EBEAE6"], text: ["#37352F", "#64635E"], line: ["#91908C", "#E9E9E7"] }),
    dark: roles({ p: ["#2383E2", "#FFFFFF"], pc: ["#1F3A54", "#CFE6FA"], s: ["#A6A6A6", "#191919"], sc: ["#2C2C2C", "#D4D4D4"], t: ["#FFA344", "#2B1600"], tc: ["#4A2F12", "#FFE2C2"], bg: ["#191919", "#202020", "#252525", "#2C2C2C", "#2F2F2F"], text: ["#D4D4D4", "#A6A6A6"], line: ["#7F7F7F", "#2F2F2F"] }),
    loud: ["primary"],
    shape: "square",
    font: "inter",
    icons: "light",
    motion: "standard",
    control: "medium",
    pill: "round",
    tokens: { toggleOn: "#2383E2", tabOn: "var(--md-sys-color-on-surface)" },
    recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "boxed", bar: "line", meter: "thin", feedback: "dim" },
    art: "quiet paper-like workspace, warm off-white, soft grey lines, hand-drawn doodle spot illustrations",
  },
  {
    /* Ant Design's seed tokens and Ant Design Mobile's theme file */
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
    icons: "light",
    motion: "standard",
    control: "medium",
    pill: "round",
    compact: true,
    tokens: { toggleOn: "#1677FF", tonedLine: "#D9D9D9" },
    recipes: { button: "flat", surface: "line", tabs: "underline", toggle: "ios", slider: "thin", nav: "plain", field: "ring", bar: "line", meter: "thin", feedback: "dim" },
    art: "clean enterprise dashboard, white cards on pale grey, confident blue accent, tidy tables",
  },

  /* ---------- mobile games ---------- */
  {
    /* button, rim and bar colors read off Royal Match's store screenshots; Clash Royale's from Interface In Game */
    key: "casual",
    name: say("消除休闲", "Casual match-3", "カジュアルパズル", "캐주얼 퍼즐"),
    hint: say("像 Royal Match、Candy Crush、皇室战争：光泽按钮、厚金边、白字描边", "Like Royal Match, Candy Crush, Clash Royale: glossy buttons, thick gold rims, outlined white words", "Royal Match や Candy Crush のように光沢と金の縁", "Royal Match, Candy Crush처럼 광택과 금테"),
    refs: ["Royal Match", "Candy Crush", "Monopoly GO", "Clash Royale", "Coin Master"],
    basis: "sampled",
    group: "mobileGame",
    seed: "#3E9B14",
    mode: "light",
    light: roles({ p: ["#3E9B14", "#FFFFFF"], pc: ["#D8F5B8", "#1E5200"], s: ["#2177D0", "#FFFFFF"], sc: ["#F59E0B", "#FFFFFF"], t: ["#C76A00", "#FFFFFF"], tc: ["#FFF4D6", "#5A3A05"], bg: ["#BFE6FF", "#FFF8E7", "#FFF4D6", "#FBE9BE", "#F5DFA8"], text: ["#3A2208", "#5E4019"], line: ["#8A5A1E", "#D9A94A"] }),
    dark: roles({ p: ["#3E9B14", "#FFFFFF"], pc: ["#1E5200", "#D8F5B8"], s: ["#6FB4F2", "#04203F"], sc: ["#F59E0B", "#FFFFFF"], t: ["#FFC933", "#2B1D00"], tc: ["#4A3A1E", "#FFF4D6"], bg: ["#12305F", "#1C3F78", "#1C3F78", "#264D8F", "#2C568F"], text: ["#FFFFFF", "#D6E4FF"], line: ["#7C9CD1", "#3A5C9C"] }),
    loud: ["primary", "secondaryContainer", "tertiary"],
    shape: "full",
    font: "lilita",
    display: "lilita",
    icons: "filled",
    motion: "expressive",
    control: "large",
    pill: "round",
    edge: 3,
    screen: "linear-gradient(#7CC8FF, #D6F0FF)",
    screenDark: "linear-gradient(#0E2A5A, #1C3F78)",
    tokens: { rim: "#FFC933", rimDark: "#8A4B00", stroke: "#4A2A00", navBg: "#1763B8", navActive: "#4DA3F0", barBg: "#1763B8", onBar: "#FFFFFF", toggleOn: "#3E9B14", primaryText: "#2E7A0E", primaryTextDark: "#8FE05A" },
    recipes: { button: "gloss", surface: "chunk", tabs: "boxed", toggle: "chunky", slider: "block", nav: "gamebar", field: "hard", bar: "hud", meter: "jelly", feedback: "press" },
    art: "bright cartoon 3D render, saturated candy colors, glossy shiny objects, soft rounded shapes, a kingdom or toy-box world",
  },
  {
    /* the background and board read off Block Blast's store screenshots: the most downloaded game of 2025 */
    key: "blocks",
    name: say("方块解谜", "Block puzzle", "ブロックパズル", "블록 퍼즐"),
    hint: say("像 Block Blast：宝蓝底、深蓝棋盘、金色皇冠、紫色飘带", "Like Block Blast: royal blue ground, navy board, gold crown, purple ribbon", "Block Blast のような青地と金", "Block Blast 같은 파란 바탕과 금색"),
    refs: ["Block Blast"],
    basis: "sampled",
    group: "mobileGame",
    seed: "#425AB7",
    mode: "dark",
    light: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
    dark: roles({ p: ["#FFD23F", "#2B1F00"], pc: ["#3A2E8F", "#E6E0FF"], s: ["#FFFFFF", "#1B2A5E"], sc: ["#2C3A8F", "#FFFFFF"], t: ["#D8B8FF", "#2B1266"], tc: ["#4A2A8F", "#EADCFF"], bg: ["#425AB7", "#282858", "#2F3378", "#36408F", "#3A47A0"], text: ["#FFFFFF", "#E0E6FF"], line: ["#C3CCF7", "#5A6CC8"] }),
    shape: "rounded",
    font: "fredoka",
    display: "fredoka",
    icons: "filled",
    motion: "expressive",
    control: "large",
    pill: "round",
    tokens: { navOn: "#FFD23F", toggleOn: "#46D160", tabOn: "#FFD23F" },
    recipes: { button: "lip", surface: "plain", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "jelly", feedback: "press" },
    art: "flat vibrant illustration of glowing gem-like blocks, bold shapes, saturated colors on deep blue",
  },
  {
    /* the HUD navy and pale blue read off Whiteout Survival's store screenshots; Last War's bars look the same */
    key: "survival",
    name: say("冰雪策略", "Survival strategy", "サバイバル戦略", "생존 전략"),
    hint: say("像寒霜启示录、Last War：深蓝信息条、冰白画面、橙色主按钮", "Like Whiteout Survival, Last War: navy HUD strips, icy white, orange main buttons", "Whiteout Survival のような紺と氷の白", "Whiteout Survival 같은 남색과 얼음빛"),
    refs: ["Whiteout Survival", "Last War", "Kingshot"],
    basis: "sampled",
    group: "mobileGame",
    seed: "#3B5588",
    mode: "light",
    light: roles({ p: ["#F08A00", "#FFFFFF"], pc: ["#FFE3B8", "#5A3000"], s: ["#2F86D6", "#FFFFFF"], sc: ["#3B5588", "#FFFFFF"], t: ["#D08A00", "#2B1800"], tc: ["#D7F0FF", "#0A3A5C"], bg: ["#DDE8F4", "#F7FAFD", "#F1F6FB", "#E6EEF7", "#D5E2EF"], text: ["#1E2A44", "#3F5275"], line: ["#6B7FA3", "#B7C7DE"] }),
    dark: roles({ p: ["#F08A00", "#FFFFFF"], pc: ["#5A3000", "#FFE3B8"], s: ["#6FB8F2", "#04203F"], sc: ["#45629B", "#FFFFFF"], t: ["#FFC94D", "#2B1800"], tc: ["#0A3A5C", "#D7F0FF"], bg: ["#1E2A44", "#2C3E66", "#303F6B", "#354A77", "#3B5588"], text: ["#FFFFFF", "#DCE8F7"], line: ["#8BA3CC", "#4A628F"] }),
    loud: ["primary", "secondary"],
    shape: "rounded",
    font: "barlow",
    display: "barlow",
    icons: "filled",
    motion: "standard",
    control: "small",
    pill: "round",
    edge: 2,
    screen: "linear-gradient(#EAF2FA, #D5E2EF)",
    screenDark: "linear-gradient(#141D33, #1E2A44)",
    tokens: { rim: "#FFD27A", rimDark: "#7A4300", stroke: "#5A2F00", navBg: "#303F6B", navActive: "#4C6AA6", barBg: "#303344", onBar: "#FFFFFF", toggleOn: "#3FA34D", primaryText: "#A85600", primaryTextDark: "#FFB454" },
    recipes: { button: "gloss", surface: "steel", tabs: "boxed", toggle: "chunky", slider: "block", nav: "gamebar", field: "hard", bar: "hud", meter: "block", feedback: "press" },
    art: "stylized semi-realistic strategy game art, frozen wasteland, snow and warm firelight, blue-grey palette with orange highlights",
  },
  {
    /* looked at in Genshin's and Star Rail's menus on Interface In Game; the cream and slate are common knowledge among players */
    key: "anime",
    name: say("原神 / 星穹铁道", "Genshin / Star Rail", "原神 / スターレイル", "원신 / 스타레일"),
    hint: say("二次元开放世界：石板蓝半透明面板、米白胶囊按钮、淡金细线", "Anime open world: translucent slate panels, cream capsules, pale gold lines", "スレート色のパネルとクリーム色のカプセル", "슬레이트 패널과 크림색 캡슐"),
    refs: ["Genshin Impact", "Honkai: Star Rail"],
    basis: "observed",
    group: "mobileGame",
    seed: "#3B4255",
    mode: "dark",
    light: roles({ p: ["#3B4255", "#ECE5D8"], pc: ["#D3BC8E", "#2A2418"], s: ["#6E5C30", "#FFFFFF"], sc: ["#E4DCCB", "#3B4255"], t: ["#A8640F", "#FFFFFF"], tc: ["#F6E6C8", "#4A2F05"], bg: ["#ECE5D8", "#F8F4EC", "#F5F0E6", "#E4DCCB", "#DBD2BE"], text: ["#3B4255", "#4F566B"], line: ["#8A7F66", "#CFC5AE"] }),
    dark: roles({ p: ["#ECE5D8", "#3B4255"], pc: ["#D3BC8E", "#2A2418"], s: ["#D3BC8E", "#2A2418"], sc: ["#3B4255", "#ECE5D8"], t: ["#FFB13F", "#2B1800"], tc: ["#4A3A1E", "#FFE8C2"], bg: ["#1E2435", "#2A3042", "#3B4255", "#454C60", "#4F566B"], text: ["#ECE5D8", "#E0DACC"], line: ["#A89A7C", "#5A6175"] }),
    shape: "rounded",
    font: "mrounded",
    icons: "light",
    motion: "standard",
    control: "pill",
    pill: "round",
    screenDark: "radial-gradient(120% 80% at 50% 0%, rgb(90 110 170 / 0.35), transparent 60%), radial-gradient(100% 60% at 50% 100%, rgb(211 188 142 / 0.12), transparent 60%)",
    tokens: { rim: "#D3BC8E", toggleOn: "#D3BC8E", tabOn: "#D3BC8E" },
    recipes: { button: "ring", surface: "gilt", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "plain", meter: "thin", feedback: "dim" },
    art: "anime open-world concept painting, soft cel shading, luminous fantasy sky, gentle blue and gold light",
  },
  {
    /* Wild Rift's menus looked at on Interface In Game; Honor of Kings' store shots share its blue and gold. Its own lobby could not be reached */
    key: "moba",
    name: say("MOBA 竞技", "MOBA", "MOBA", "MOBA"),
    hint: say("像王者荣耀、英雄联盟手游：深海军蓝、金色细框、菱形和金色光晕", "Like Honor of Kings, Wild Rift: deep navy, thin gold frames, diamonds and gold glow", "Honor of Kings のような紺と金", "Honor of Kings 같은 남색과 금색"),
    refs: ["Honor of Kings", "League of Legends: Wild Rift"],
    basis: "observed",
    group: "mobileGame",
    seed: "#C8AA6E",
    mode: "dark",
    light: roles({ p: ["#0848B8", "#FFFFFF"], pc: ["#D6E4FF", "#06265F"], s: ["#7A5C14", "#FFFFFF"], sc: ["#F8F2D8", "#3A2C05"], t: ["#7A5C14", "#FFFFFF"], tc: ["#F8F2D8", "#3A2C05"], bg: ["#F2F6FF", "#FFFFFF", "#FFFFFF", "#E8EFFC", "#DCE6F8"], text: ["#0B1E3F", "#3F5275"], line: ["#5A76A8", "#C8D6EE"] }),
    dark: roles({ p: ["#C8AA6E", "#1A1408"], pc: ["#463714", "#F0E6D2"], s: ["#0AC8B9", "#00201D"], sc: ["#1E2328", "#F0E6D2"], t: ["#F0C75E", "#1A1408"], tc: ["#0A3A45", "#CDFAFA"], bg: ["#0A1428", "#0A1F3A", "#0F2540", "#15304F", "#1C3A5E"], text: ["#F0E6D2", "#C8C2B0"], line: ["#785A28", "#2A3F5A"] }),
    shape: "square",
    font: "inter",
    display: "cinzel",
    icons: "sharp",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    capsLabels: true,
    screenDark: "radial-gradient(120% 70% at 50% 0%, rgb(10 90 150 / 0.28), transparent 65%)",
    tokens: { rim: "#C8AA6E", rimDark: "#785A28", tabOn: "#C8AA6E", navOn: "#F0E6D2", toggleOn: "#C8AA6E" },
    recipes: { button: "frame", surface: "hairline", tabs: "glow", toggle: "block", slider: "block", nav: "goldglow", field: "line", bar: "line", meter: "thin", feedback: "flash" },
    art: "high fantasy splash art, luminous magic, deep blue and gold, dramatic heroes in dynamic poses",
  },

  /* ---------- PC games ---------- */
  {
    /* looked at in Elden Ring's menus on Interface In Game */
    key: "souls",
    name: say("艾尔登法环", "Elden Ring", "Elden Ring", "Elden Ring"),
    hint: say("魂系：近黑褐底、衬线体、纯文字菜单、选中时淡出的暗金光带", "Souls-like: near-black brown, serif type, text-only menus, a fading dark-gold band on the selected row", "ソウルライク：文字だけのメニューと暗い金", "소울라이크: 글자만 있는 메뉴와 어두운 금색"),
    refs: ["Elden Ring", "Baldur's Gate 3"],
    basis: "observed",
    group: "pcGame",
    seed: "#C8AA6E",
    mode: "dark",
    light: roles({ p: ["#6E5210", "#FFF6DD"], pc: ["#EBD193", "#332400"], s: ["#5E5540", "#FFFFFF"], sc: ["#E4D9BE", "#2A1C0C"], t: ["#8E2A1E", "#FFFFFF"], tc: ["#F2CFC6", "#3D1510"], bg: ["#F2EAD6", "#F8F2E2", "#F4EDDB", "#E9DFC6", "#E0D4B6"], text: ["#2A1C0C", "#57482F"], line: ["#7A6A45", "#C9BB97"] }),
    dark: roles({ p: ["#C8AA6E", "#17130B"], pc: ["#3A3020", "#E6DCC3"], s: ["#A89F8A", "#14120C"], sc: ["#2A2519", "#E6DCC3"], t: ["#D85A4A", "#1A0502"], tc: ["#3D1510", "#FFD6CF"], bg: ["#0E0D0A", "#17150F", "#1C1A13", "#24211A", "#2C2820"], text: ["#E6DCC3", "#A89F8A"], line: ["#7A6A45", "#3A3324"] }),
    shape: "none",
    font: "garamond",
    display: "cinzel",
    icons: "light",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    screenDark: "radial-gradient(120% 90% at 50% 40%, transparent 35%, rgb(0 0 0 / 0.6) 100%)",
    screen: "radial-gradient(120% 90% at 50% 40%, transparent 50%, rgb(90 60 20 / 0.22) 100%)",
    tokens: { rim: "#7A6A45", rimDark: "#3A3324", tabOn: "#C8AA6E", navOn: "#C8AA6E", toggleOn: "#C8AA6E" },
    recipes: { button: "text", surface: "hairline", tabs: "fade", toggle: "block", slider: "thin", nav: "plain", field: "line", bar: "plain", meter: "thin", feedback: "dim" },
    art: "dark gothic fantasy painting, ruined cathedrals in fog, muted gold light, desaturated, a golden tree on the horizon",
  },
  {
    /* looked at in Black Myth's menus on Interface In Game */
    key: "wukong",
    name: say("黑神话：悟空", "Black Myth: Wukong", "黒神話：悟空", "검은 신화: 오공"),
    hint: say("国风暗黑：纯黑底、衬线字、选中项是边缘虚化的米白色带", "Chinese dark fantasy: pure black, serif type, a pale band with faded edges on the selected row", "国風ダーク：黒地と淡い帯", "동양풍 다크: 검정 바탕과 옅은 띠"),
    refs: ["Black Myth: Wukong"],
    basis: "observed",
    group: "pcGame",
    seed: "#A8A090",
    mode: "dark",
    light: roles({ p: ["#1A1814", "#F2EDE0"], pc: ["#E9E3D3", "#1A1814"], s: ["#5A5448", "#FFFFFF"], sc: ["#E9E3D3", "#1A1814"], t: ["#A63D1C", "#FFFFFF"], tc: ["#F5D9CC", "#3D1A0E"], bg: ["#F2EDE0", "#FAF7EF", "#F7F3E8", "#E9E3D3", "#DED7C4"], text: ["#1A1814", "#4F4A3F"], line: ["#7A7364", "#CFC8B5"] }),
    dark: roles({ p: ["#E8E2D2", "#0A0A0A"], pc: ["#2A261D", "#E8E2D2"], s: ["#A8A090", "#0A0A0A"], sc: ["#1A1814", "#E8E2D2"], t: ["#E0693A", "#1F0A02"], tc: ["#3D1A0E", "#FFD9C7"], bg: ["#0A0A0A", "#121110", "#161513", "#1E1C19", "#26231F"], text: ["#E8E2D2", "#A8A090"], line: ["#6E675A", "#2E2B26"] }),
    shape: "none",
    font: "garamond",
    display: "brush",
    icons: "light",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    screenDark: "radial-gradient(90% 70% at 70% 45%, rgb(120 80 30 / 0.22), transparent 70%)",
    tokens: { rim: "#6E675A", rimDark: "#2E2B26", tabOn: "#E8E2D2", navOn: "#E8E2D2", toggleOn: "#E8E2D2" },
    recipes: { button: "band", surface: "plain", tabs: "band", toggle: "block", slider: "thin", nav: "plain", field: "line", bar: "plain", meter: "thin", feedback: "dim" },
    art: "Chinese mythological dark fantasy, ancient temples in misty mountains, autumn gold and ember light, photorealistic and cinematic",
  },
  {
    /* its character screen read off a Steam store screenshot: dark crimson panels, red words, cyan accents, one corner cut */
    key: "cyber",
    name: say("赛博朋克 2077", "Cyberpunk 2077", "サイバーパンク 2077", "사이버펑크 2077"),
    hint: say("暗红面板、红色大写字、青色点缀、切角、扫描线", "Dark crimson panels, red capitals, cyan accents, a cut corner, scan lines", "暗い赤のパネルと赤い文字、シアンのアクセント", "짙은 빨강 패널과 빨간 글자, 청록 포인트"),
    refs: ["Cyberpunk 2077"],
    basis: "sampled",
    group: "pcGame",
    seed: "#FF5C57",
    mode: "dark",
    light: roles({ p: ["#B3261E", "#FFFFFF"], pc: ["#FFDAD4", "#410002"], s: ["#00707A", "#FFFFFF"], sc: ["#FBE9E7", "#5C1A15"], t: ["#716100", "#FFFFFF"], tc: ["#FFF27A", "#332C00"], bg: ["#F7EFEE", "#FFF8F7", "#FDF3F2", "#F5E6E4", "#EDDAD8"], text: ["#3D0F0B", "#6B2C26"], line: ["#A8504A", "#E0BFBB"] }),
    dark: roles({ p: ["#FF5C57", "#1A0607"], pc: ["#3A1418", "#FF8A80"], s: ["#5EF6FF", "#00191C"], sc: ["#250C10", "#FF7A70"], t: ["#FCEE09", "#1A1800"], tc: ["#3A3600", "#FFF27A"], bg: ["#111217", "#1A0E12", "#250C10", "#2E1E23", "#3A1F26"], text: ["#FF8078", "#F07068"], line: ["#A8322F", "#4A1C20"] }),
    shape: "none",
    font: "rajdhani",
    icons: "sharp",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    capsLabels: true,
    screenDark: "repeating-linear-gradient(0deg, rgb(255 92 87 / 0.035) 0 1px, transparent 1px 3px), radial-gradient(90% 60% at 60% 20%, rgb(120 20 40 / 0.55), transparent 70%), radial-gradient(70% 60% at 100% 100%, rgb(10 30 70 / 0.6), transparent 70%)",
    tokens: { rim: "#A8322F", rimDark: "#4A1C20", barBg: "#1A0E12", onBar: "#5EF6FF", tabOn: "#5EF6FF", navOn: "#5EF6FF", toggleOn: "#FF5C57" },
    recipes: { button: "tint", surface: "line", tabs: "glow", toggle: "block", slider: "block", nav: "topline", field: "glow", bar: "hud", meter: "segment", feedback: "flash" },
    art: "rain-soaked neon megacity at night, crimson and teal light, grit and haze, glitch artefacts, cinematic",
  },
  {
    /* looked at in Marvel Rivals' menus on Interface In Game: white panels, navy strips, yellow, slants */
    key: "rivals",
    name: say("漫威争锋", "Marvel Rivals", "Marvel Rivals", "Marvel Rivals"),
    hint: say("漫画英雄：白面板、海军蓝条、亮黄选中、斜切和粗斜体大写", "Comic hero: white panels, navy strips, bright yellow, slants and bold italic capitals", "コミック調：白いパネルと黄色、斜めの形", "코믹풍: 흰 패널과 노랑, 기울인 형태"),
    refs: ["Marvel Rivals"],
    basis: "observed",
    group: "pcGame",
    seed: "#4B3FC8",
    mode: "light",
    light: roles({ p: ["#FFD60A", "#15193A"], pc: ["#E6E9F8", "#15193A"], s: ["#4B3FC8", "#FFFFFF"], sc: ["#15193A", "#FFFFFF"], t: ["#4B3FC8", "#FFFFFF"], tc: ["#E2DFFF", "#1E1866"], bg: ["#E9ECF8", "#FFFFFF", "#FFFFFF", "#F3F5FC", "#DDE1F2"], text: ["#15193A", "#4A5070"], line: ["#7A80A0", "#C9CEE6"] }),
    dark: roles({ p: ["#FFD60A", "#15193A"], pc: ["#30365C", "#E6E9F8"], s: ["#A89FFF", "#15193A"], sc: ["#30365C", "#FFFFFF"], t: ["#A89FFF", "#15193A"], tc: ["#2A2566", "#E2DFFF"], bg: ["#0F1224", "#181C36", "#1E2340", "#272C4E", "#30365C"], text: ["#FFFFFF", "#C9CEEA"], line: ["#7A80A0", "#30365C"] }),
    shape: "none",
    font: "barlow",
    display: "barlow",
    icons: "filled",
    motion: "expressive",
    control: "extra-small",
    pill: "follow",
    capsLabels: true,
    italicDisplay: true,
    screen: "linear-gradient(115deg, transparent 58%, rgb(75 63 200 / 0.16) 58%, rgb(75 63 200 / 0.16) 80%, transparent 80%)",
    tokens: { barBg: "#15193A", onBar: "#FFFFFF", rim: "#FFD60A", tabOn: "#FFD60A", navOn: "#4B3FC8", toggleOn: "#FFD60A", primaryText: "#4B3FC8" },
    recipes: { button: "slant", surface: "plain", tabs: "slant", toggle: "block", slider: "block", nav: "topline", field: "boxed", bar: "hud", meter: "block", feedback: "flash" },
    art: "bold comic-book hero poster, halftone dots, dynamic diagonals, saturated purple and yellow",
  },
  {
    /* Apex's and Valorant's menus looked at on Interface In Game; red and tan as they appear there */
    key: "fps",
    name: say("战术射击", "Tactical shooter", "タクティカル FPS", "전술 슈팅"),
    hint: say("像 Apex、Valorant：深蓝灰底、红色斜切选中、窄体大写", "Like Apex, Valorant: dark blue-grey, red slanted selection, condensed capitals", "Apex や Valorant のように赤い斜めの選択", "Apex, Valorant처럼 빨간 기울임 선택"),
    refs: ["Apex Legends", "VALORANT", "PUBG", "Counter-Strike 2"],
    basis: "observed",
    group: "pcGame",
    seed: "#DA292A",
    mode: "dark",
    light: roles({ p: ["#C62526", "#FFFFFF"], pc: ["#FFDAD6", "#410002"], s: ["#0F1923", "#ECE8E1"], sc: ["#E2DDD3", "#0F1923"], t: ["#0E7A5E", "#FFFFFF"], tc: ["#C7F5E6", "#04241B"], bg: ["#ECE8E1", "#F7F4EE", "#F2EEE7", "#E2DDD3", "#D8D2C6"], text: ["#0F1923", "#3F4A55"], line: ["#6E7782", "#C4BEB2"] }),
    dark: roles({ p: ["#DA292A", "#FFFFFF"], pc: ["#4A1114", "#FFD6D6"], s: ["#ECE8E1", "#0F1923"], sc: ["#1F2A36", "#ECE8E1"], t: ["#5BD1B0", "#04241B"], tc: ["#103A2F", "#C7F5E6"], bg: ["#0F1923", "#16212D", "#1C2936", "#243340", "#2C3D4C"], text: ["#ECE8E1", "#B5C2CE"], line: ["#6E8296", "#2C3D4C"] }),
    shape: "none",
    font: "barlow",
    display: "barlow",
    icons: "sharp",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    capsLabels: true,
    screenDark: "radial-gradient(100% 70% at 70% 30%, rgb(60 90 130 / 0.35), transparent 70%)",
    tokens: { barBg: "#0B131B", onBar: "#ECE8E1", rim: "#DA292A", tabOn: "#DA292A", navOn: "#ECE8E1", toggleOn: "#DA292A", primaryTextDark: "#FF7A7A" },
    recipes: { button: "flat", surface: "line", tabs: "slant", toggle: "block", slider: "block", nav: "topline", field: "boxed", bar: "hud", meter: "block", feedback: "flash" },
    art: "gritty tactical shooter art, overcast urban map, muted colors, a hot orange rim light",
  },
  {
    /* the dialog frame and panel read off Stardew Valley's Steam screenshots */
    key: "stardew",
    name: say("星露谷物语", "Stardew Valley", "Stardew Valley", "Stardew Valley"),
    hint: say("像素农场：木框、橙褐羊皮纸面板、深棕像素字、卷轴名牌", "Pixel farm: wooden frames, orange-tan parchment panels, dark brown pixel type", "ピクセル農場：木枠と羊皮紙", "픽셀 농장: 나무 테와 양피지"),
    refs: ["Stardew Valley", "Terraria"],
    basis: "sampled",
    group: "pcGame",
    seed: "#B95705",
    mode: "light",
    light: roles({ p: ["#A84F05", "#FFF4D6"], pc: ["#F6C27A", "#4A1C08"], s: ["#3F7A22", "#FFFFFF"], sc: ["#F7E3B5", "#4A1C08"], t: ["#7A5000", "#FFF4D6"], tc: ["#F9E79F", "#3A2208"], bg: ["#F5C98A", "#FBE3B5", "#F6C27A", "#F2BA6E", "#EFB366"], text: ["#4A1C08", "#5E2A0E"], line: ["#8B4A12", "#C98A45"] }),
    dark: roles({ p: ["#E8A828", "#2B1800"], pc: ["#5A3A1A", "#F7E3B5"], s: ["#8FD45A", "#132B02"], sc: ["#4A3015", "#F7E3B5"], t: ["#F2C65A", "#2B1800"], tc: ["#4A3015", "#F9E79F"], bg: ["#1E140C", "#2B1C10", "#38240F", "#4A3015", "#5A3A1A"], text: ["#F7E3B5", "#E8CF9E"], line: ["#C98A45", "#6E4A22"] }),
    shape: "none",
    font: "pixel",
    icons: "pixel",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    edge: 3,
    tokens: { rim: "#B5641E", rimDark: "#5B2B06", toggleOn: "#3F7A22", navOn: "#4A1C08" },
    recipes: { button: "hard", surface: "wood", tabs: "boxed", toggle: "block", slider: "block", nav: "block", field: "hard", bar: "line", meter: "block", feedback: "press" },
    art: "cozy 16-bit pixel art farming village, warm sunlight, soft greens and oranges, crisp visible pixels and no anti-aliasing",
  },
];

/* The second and third layers of each style: how its components are shaped beyond the first ten kinds, how its screens
 * are spaced, where its navigation stands, and in words how its screens are composed. From the same screenshots and
 * design systems as the rest; spacing that no maker publishes is measured by eye from those screenshots. */
const SHAPE_AND_LAYOUT: Record<string, { recipes: Partial<Recipes>; ux: Partial<StyleUX>; layout: { zh: string; en: string } }> = {
  ios: { recipes: { list: "inset", dialog: "alert", chip: "pill", check: "round" }, ux: { margin: 16, gap: 24, tight: 8, nav: "bottom" }, layout: { zh: "分组列表放在灰底上，组与组之间留大间距；标题居中，底部悬浮胶囊标签栏，主按钮靠近内容、通栏胶囊。", en: "Inset grouped lists on a grey ground with generous gaps between groups; a centered title; a floating capsule tab bar; the main action a full-width capsule near the content." } },
  shortvideo: { recipes: { list: "plain", dialog: "alert" }, ux: { margin: 12, gap: 12, tight: 4, nav: "bottom", bleed: ["video"] }, layout: { zh: "视频铺满整屏（用全屏场景图表现），顶部是文字标签，右侧竖排互动按钮，底部叠一段说明文字和黑色标签栏。", en: "The video fills the whole screen, so draw it as a full-screen scene rather than a video box; text tabs at the top; a column of actions down the right; a caption and a black tab bar over the foot." } },
  spotify: { recipes: { list: "plain", dialog: "modal", chip: "pill" }, ux: { margin: 16, gap: 24, tight: 4, nav: "bottom" }, layout: { zh: "先是一行胶囊筛选，再是一段段带标题的横向封面；列表无分隔线；底部标签栏上方常驻迷你播放条。", en: "A row of capsule filters, then titled shelves of square covers; lists without lines; a mini player resting above the tab bar." } },
  wechat: { recipes: { list: "flush", dialog: "weui", avatar: "square", check: "round" }, ux: { margin: 16, gap: 8, tight: 0, nav: "bottom" }, layout: { zh: "白色列表从屏幕一边铺到另一边，用灰色窄带分组，分隔线从文字处开始；圆角方形头像；标题居中；四个底部标签。", en: "White lists run edge to edge, grouped by narrow grey bands, with lines starting at the words; rounded-square avatars; a centered title; four bottom tabs." } },
  shop: { recipes: { list: "tile", dialog: "weui", chip: "tag" }, ux: { margin: 12, gap: 8, tight: 8, nav: "bottom" }, layout: { zh: "顶部常驻搜索框，下面是促销横幅和两列商品卡片，价格用红色放大；底部五个标签，商品页底部固定购买按钮。", en: "A search box pinned at the top, promo banners, then two columns of product cards with large red prices; five bottom tabs; a fixed buy button at the foot of a product page." } },
  social: { recipes: { list: "plain", dialog: "alert" }, ux: { margin: 16, gap: 12, tight: 0, nav: "bottom", bleed: ["image", "video"] }, layout: { zh: "内容从边到边，图片通栏，几乎不用卡片和分隔；颜色只给主按钮；底栏只有图标没有文字。", en: "Content edge to edge with full-width pictures, hardly any cards or lines; color only on the main action; a bottom bar of icons with no words." } },
  whatsapp: { recipes: { list: "plain", check: "round" }, ux: { margin: 16, gap: 8, tight: 0, nav: "bottom" }, layout: { zh: "顶部标题和搜索框，下面是头像、名字、最后一句、时间组成的聊天列表，右下角悬浮新建按钮，底部四个标签。", en: "A title and search on top, then chat rows of avatar, name, last line and time; a floating new-chat button at the lower right; four bottom tabs." } },
  chatgpt: { recipes: { list: "plain", dialog: "modal", chip: "pill" }, ux: { margin: 16, gap: 16, tight: 4, nav: "keep" }, layout: { zh: "几乎没有界面：中间是对话，底部一个大圆角输入框和圆形发送按钮，导航收在侧边抽屉里。", en: "Almost no chrome: the conversation in the middle, a large rounded composer with a round send button at the foot, navigation folded into a side drawer." } },
  fluent: { recipes: { list: "hairline", dialog: "modal", chip: "tag" }, ux: { margin: 16, gap: 12, tight: 0, nav: "keep" }, layout: { zh: "宽屏时左侧导航窗格，顶部命令栏，内容是紧凑的列表和表单；控件矮、边距小，信息密度高。", en: "A navigation pane on the left when wide, a command bar on top, compact lists and forms below; short controls, small margins, dense." } },
  vscode: { recipes: { nav: "icononly", list: "hairline", dialog: "modal", chip: "tag" }, ux: { margin: 12, gap: 8, tight: 0, nav: "rail" }, layout: { zh: "最左一列窄图标栏，旁边是树形侧栏，中间是方正的标签页和内容，最底下一条细状态栏。", en: "A narrow column of icons at the far left, a tree sidebar beside it, square tabs over the content, a thin status bar along the foot." } },
  discord: { recipes: { nav: "icononly", list: "plain", dialog: "modal", chip: "pill" }, ux: { margin: 12, gap: 8, tight: 0, nav: "rail" }, layout: { zh: "最左一列圆形服务器图标，旁边是频道列表，再旁边是消息流，底部一个输入框。", en: "A column of round server icons at the far left, a channel list beside it, the stream of messages beside that, a composer at the foot." } },
  steam: { recipes: { list: "hairline", dialog: "modal", chip: "tag" }, ux: { margin: 12, gap: 8, tight: 4, nav: "top" }, layout: { zh: "深色顶部导航，下面是大幅封面和成排的游戏卡片，列表里是缩略图、名字和绿色价格标签。", en: "A dark navigation along the top, a large cover below it and rows of game cards; lists of a thumbnail, a name and a green price tag." } },
  notion: { recipes: { list: "plain", dialog: "modal", chip: "tag" }, ux: { margin: 20, gap: 12, tight: 0, nav: "keep" }, layout: { zh: "像一页纸：大标题在左上，正文宽松，页面元素不加框，靠缩进和留白分层，几乎没有颜色。", en: "Like a page of paper: a large title at the upper left, roomy text, elements without boxes, layered by indent and white space, almost no color." } },
  antd: { recipes: { list: "hairline", dialog: "modal", chip: "tag" }, ux: { margin: 16, gap: 16, tight: 8, nav: "keep" }, layout: { zh: "宽屏时左侧菜单、顶部面包屑，灰底上放白色卡片，卡片里是数据表格和表单；手机上是灰底白卡片加四个底部标签。", en: "A menu on the left and breadcrumbs on top when wide, white cards on grey holding tables and forms; on a phone, white cards on grey with four bottom tabs." } },
  casual: { recipes: { list: "tile", dialog: "game" }, ux: { margin: 12, gap: 12, tight: 8, nav: "bottom" }, layout: { zh: "顶部一排奶油色胶囊显示金币、生命、星星；中间整屏场景图；两个大光泽按钮贴在底部标签栏上方；底栏选中项抬高变亮。", en: "A row of cream capsules for coins, lives and stars on top; a full-screen scene in the middle; two big glossy buttons just above the bottom bar, whose chosen tab rises and brightens." } },
  blocks: { recipes: { list: "tile", dialog: "game" }, ux: { margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" }, layout: { zh: "几乎没有菜单：左上皇冠和最高分，右上设置，中间大分数，下面是深蓝棋盘和待放方块。", en: "Almost no menus: a crown and best score at the upper left, settings at the upper right, a big score in the middle, the navy board and the pieces below it." } },
  survival: { recipes: { list: "tile", dialog: "game", avatar: "framed" }, ux: { margin: 8, gap: 8, tight: 6, nav: "bottom" }, layout: { zh: "顶部左边头像和战力，右边一排资源数字；屏幕边缘挂满圆形功能图标；底部一排深蓝入口；操作卡片从下方升起。", en: "An avatar and power at the upper left, a row of resource figures at the right; round feature icons along the edges; a navy row of entries at the foot; action cards rising from below." } },
  anime: { recipes: { list: "tile", dialog: "plain", dialogue: "band" }, ux: { margin: 16, gap: 12, tight: 6, nav: "rail" }, layout: { zh: "左侧一列分类，选中项是米白胶囊；中间是物品格子；右侧是详情卡和底部的胶囊按钮；右上角圆形关闭。", en: "A column of categories at the left with the chosen one a cream capsule; a grid of items in the middle; a detail card at the right with capsule buttons at its foot; a round close at the upper right." } },
  moba: { recipes: { list: "tile", dialog: "plain", avatar: "framed" }, ux: { margin: 16, gap: 12, tight: 6, nav: "bottom" }, layout: { zh: "人物立绘占一侧，另一侧是深蓝列表；底部标签选中时金光从下往上泛起；到处是金色细线和菱形。", en: "A hero portrait on one side, a navy list on the other; bottom tabs whose chosen one glows gold from below; thin gold lines and diamonds throughout." } },
  souls: { recipes: { list: "plain", dialog: "plain", avatar: "framed" }, ux: { margin: 24, gap: 8, tight: 0, nav: "rail" }, layout: { zh: "几乎全黑：左边一列文字菜单，选中行从左向右淡出暗金光带；数据小而密地排成几列；底部一行按键提示。", en: "Nearly black: a column of words at the left whose chosen row is lit by a dark-gold band fading to the right; small dense columns of figures; a line of key hints along the foot." } },
  wukong: { recipes: { list: "plain", dialog: "plain" }, ux: { margin: 24, gap: 8, tight: 0, nav: "top" }, layout: { zh: "纯黑底，左上角淡淡的大号书法字；顶部一行文字标签，选中项是米白色带；左边文字列表，右边留白或插画；右下角按键提示。", en: "Pure black with a large faint calligraphic character at the upper left; a line of text tabs on top with the chosen one a pale band; a text list at the left, emptiness or a picture at the right; key hints at the lower right." } },
  cyber: { recipes: { list: "tile", dialog: "plain", avatar: "framed" }, ux: { margin: 16, gap: 8, tight: 4, nav: "top" }, layout: { zh: "顶部标题配青色下划线，右侧一列切角的暗红面板，每行一个大写标签和数值；底部一排青色按键提示；边缘散布细小的技术文字。", en: "A title with a cyan underline on top, a column of dark crimson panels with cut corners at the right, each row a capital label and a value; a row of cyan key hints along the foot; small technical text scattered at the edges." } },
  rivals: { recipes: { list: "tile", dialog: "plain", chip: "tag" }, ux: { margin: 16, gap: 12, tight: 6, nav: "top" }, layout: { zh: "顶部窄导航选中项亮黄；一边是人物立绘和斜切色块，另一边是白面板；标题是粗斜体大写；胜利画面是一道斜向黄光。", en: "A slim navigation on top with the chosen item bright yellow; a hero and slanted color blocks on one side, white panels on the other; bold italic capital titles; a slanted yellow streak on victory." } },
  fps: { recipes: { list: "tile", dialog: "plain", chip: "tag" }, ux: { margin: 16, gap: 8, tight: 4, nav: "top" }, layout: { zh: "顶部一行大写导航，选中项是红色平行四边形；人物站在中间；左下角一列匹配按钮和大号准备按钮；右上角货币。", en: "A line of capital navigation on top with the chosen item a red parallelogram; the character standing in the middle; a column of match buttons and a big ready button at the lower left; currency at the upper right." } },
  stardew: { recipes: { list: "tile", dialog: "game", avatar: "framed", dialogue: "portrait" }, ux: { margin: 12, gap: 8, tight: 6, nav: "bottom" }, layout: { zh: "整屏是场景；对话框贴在下方，左边文字、右边头像和卷轴名牌；底部一排方形物品格当导航。", en: "The scene fills the screen; a dialog sits low on it with words at the left and a portrait with a scroll nameplate at the right; a row of square item slots along the foot serves as navigation." } },
};

export const STYLE_PACKS: StylePack[] = PACKS.map((p) => {
  const more = SHAPE_AND_LAYOUT[p.key];
  return { ...p, recipes: { ...p.recipes, ...more.recipes }, ux: { ...DEFAULT_UX, ...more.ux }, layout: { zh: more.layout.zh, en: more.layout.en, ja: more.layout.en, ko: more.layout.en } };
});

export const STYLE_GROUPS: StyleGroup[] = ["app", "desktop", "mobileGame", "pcGame"];

/** the table of styles in public/agent.md, for a model choosing one and composing its screens */
export function styleCatalog(): string {
  const row = (key: string, refs: string, layout: string) => `| ${key} | ${refs} | ${layout} |`;
  return [
    "| `style` | Looks like | How its screens are composed |",
    "| --- | --- | --- |",
    row("(left out)", "Android, Google's apps", "Plain Material 3: a top bar, a body on 16dp margins, a bottom navigation bar."),
    ...STYLE_PACKS.map((s) => row(`\`${s.key}\``, s.refs.join(", "), s.layout.en)),
  ].join("\n");
}

export const styleOf = (key: string | undefined): StylePack | undefined => (key ? STYLE_PACKS.find((s) => s.key === key) : undefined);

/* ---------- a theme's style ---------- */

type Styled = {
  style?: string;
  ownColors?: boolean;
  recipes?: Partial<Recipes>;
  dark?: boolean;
  contrast?: string;
  shape?: ShapeScale;
  font?: FontKey;
  displayFont?: FontKey;
  icons?: IconFamily;
  ux?: Partial<StyleUX>;
};

/** the settings a style brings: picking it writes them on the theme, where each can be changed afterwards */
export function stylePatch(key: string) {
  const pack = styleOf(key);
  if (!pack) return { style: undefined, strict: true, ownColors: undefined, recipes: undefined, ux: undefined, displayFont: undefined, icons: undefined, shape: "rounded" as const, font: "roboto" as const, motion: "standard" as const, dark: false };
  return { style: pack.key, strict: true, ownColors: undefined, recipes: undefined, ux: undefined, displayFont: pack.display, icons: pack.icons, shape: pack.shape, font: pack.font, motion: pack.motion, dark: pack.mode === "dark" };
}

/** whether a document is held to its style's rules. A style held by default; Android once the author has picked it. */
export const isStrict = (t: { style?: string; strict?: boolean }) => t.strict ?? !!styleOf(t.style);

/** a style's colors are the document's until the author picks others */
const colorsOf = (t: Styled) => (t.ownColors ? undefined : styleOf(t.style));

/** the seed the rest of a scheme comes from, when the style is the one coloring the document */
export const styleSeed = (t: Styled | undefined) => (t ? colorsOf(t)?.seed : undefined);

/** The palette the editor and the screens draw with. At a higher contrast the generated scheme is kept, since it is
 *  the one that promises that contrast; a style's own colors are for the standard level. */
export function stylePalette(t: Styled | undefined): Palette | undefined {
  if (!t || (t.contrast && t.contrast !== "standard")) return undefined;
  const pack = colorsOf(t);
  if (!pack) return undefined;
  const r = t.dark ? pack.dark : pack.light;
  return { key: pack.key, label: pack.name.en, seed: pack.seed, ...(t.dark ? ERRORS_DARK : ERRORS_LIGHT), ...r };
}

export const recipesOf = (t: Styled): Recipes => ({ ...M3, ...styleOf(t.style)?.recipes, ...t.recipes });

/** how a screen is laid out under a theme: Material's, the style's, and what the author changed */
export const uxOf = (t: Styled): StyleUX => ({ ...DEFAULT_UX, ...styleOf(t.style)?.ux, ...t.ux });

/** the words a picture is painted with when its scene names no style of its own */
export const artOf = (t: Styled | undefined) => styleOf(t?.style)?.art ?? "";

/* ---------- the stylesheet ---------- */

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** every role of a scheme a style has an opinion on: what it names, and what follows from those */
function roleVars(r: StyleRoles, dark: boolean): string {
  const all: Record<string, string> = {
    ...(dark ? ERRORS_DARK : ERRORS_LIGHT),
    ...r,
    background: r.surface,
    onBackground: r.onSurface,
    surfaceBright: r.surfaceContainerHigh,
    surfaceDim: r.surface,
    surfaceContainerLowest: r.surfaceContainerLow,
    surfaceVariant: r.surfaceContainerHighest,
    surfaceTint: r.primary,
    primaryDim: r.primary,
    secondaryDim: r.secondary,
    tertiaryDim: r.tertiary,
    primaryFixed: r.primaryContainer,
    primaryFixedDim: r.primaryContainer,
    onPrimaryFixed: r.onPrimaryContainer,
    onPrimaryFixedVariant: r.onPrimaryContainer,
    secondaryFixed: r.secondaryContainer,
    secondaryFixedDim: r.secondaryContainer,
    onSecondaryFixed: r.onSecondaryContainer,
    onSecondaryFixedVariant: r.onSecondaryContainer,
    tertiaryFixed: r.tertiaryContainer,
    tertiaryFixedDim: r.tertiaryContainer,
    onTertiaryFixed: r.onTertiaryContainer,
    onTertiaryFixedVariant: r.onTertiaryContainer,
  };
  return Object.entries(all).map(([k, v]) => `--md-sys-color-${kebab(k)}:${v};`).join("");
}

const role = (name: string) => `var(--md-sys-color-${name})`;
const mix = (name: string, percent: number, other = "transparent") => `color-mix(in srgb,${role(name)} ${percent}%,${other})`;

/** a button with something of its own to draw: not one that is only an icon or only its words */
const BUTTON = `[data-button]:not([data-size^=icon],[data-variant=text],[data-variant=ghost],[data-variant=link])`;
const FAB = `[data-slot=fab],[data-slot=extended-fab]`;
const BUTTONS = `${BUTTON},${FAB},[data-slot=skill-button-face]`;
const PRESSES = `${BUTTON}:active,[data-slot=fab]:active,[data-slot=extended-fab]:active`;
const TONED = `${BUTTON}:is([data-variant=tonal],[data-variant=secondary],[data-variant=tertiary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated])`;
const CORNERED = `[data-button],[data-slot=toggle],[data-slot=toggle-group-item]`;
const CHIPS = `[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]`;

/** the panels that are named, and any box that fills itself with a container role and has corners. `~=` is exact,
 *  so a row that only fills on hover is not one, and what is drawn behind something else is not either. */
const FILLS = ["surface-container", "surface-container-low", "surface-container-lowest", "surface-container-high", "surface-container-highest", "primary-container", "secondary-container", "tertiary-container"];
const PANELS = [
  "[data-slot=card]",
  "[data-slot=dialog-content]",
  "[data-slot=alert-dialog-content]",
  "[data-slot=select-content]",
  "[data-slot=dropdown-menu-content]",
  "[data-slot=popover-content]",
  "[data-slot=sheet-content]",
  "[data-slot=drawer-content]",
  "[data-slot=dialogue-box]",
  `:is(${FILLS.map((f) => `[class~="bg-${f}"]`).join(",")})[class*="rounded"]:not([aria-hidden],[data-button],[data-slot=toggle],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=nav-indicator],[data-slot=tabs-indicator],[data-slot=skill-button-face],[data-slot=stat-bar-track],[data-slot=switch])`,
].join(",");

/** words outlined in a dark color, for white words on a bright button */
const OUTLINED = (c: string) => `text-shadow:-1px -1px 0 ${c},1px -1px 0 ${c},-1px 1px 0 ${c},1px 1px 0 ${c},0 2px 0 ${c}`;
const SHEEN = `linear-gradient(180deg,rgb(255 255 255/.38) 0%,rgb(255 255 255/.08) 46%,rgb(0 0 0/.06) 54%,rgb(0 0 0/.22) 100%)`;
/** a band of the color that fades out at both ends */
const FADED = `-webkit-mask-image:linear-gradient(90deg,transparent,#000 8px,#000 calc(100% - 8px),transparent);mask-image:linear-gradient(90deg,transparent,#000 8px,#000 calc(100% - 8px),transparent)`;

const BUTTON_CSS: Record<Recipes["button"], string> = {
  m3: "",
  flat: `${BUTTONS}{box-shadow:none}
${TONED}{border:1px solid var(--st-toned-line)}`,
  hard: `${BUTTONS}{border:var(--st-edge) solid var(--st-rim-dark);box-shadow:inset 0 0 0 2px var(--st-rim),3px 3px 0 var(--st-rim-dark)}
${PRESSES}{translate:2px 2px;box-shadow:inset 0 0 0 2px var(--st-rim),1px 1px 0 var(--st-rim-dark)}`,
  chamfer: `${BUTTONS}{border-radius:0;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:none}`,
  bevel: `${BUTTONS}{border:1px solid ${mix("primary", 55, "black")};background-image:linear-gradient(180deg,rgb(255 255 255/.24),rgb(0 0 0/.2));box-shadow:inset 0 1px 0 rgb(255 255 255/.42),inset 0 -1px 0 rgb(0 0 0/.35),0 2px 0 rgb(0 0 0/.4)}
${PRESSES}{translate:0 1px;box-shadow:inset 0 2px 4px rgb(0 0 0/.45)}`,
  glow: `${BUTTONS}{border:1px solid ${role("primary")};box-shadow:0 0 12px ${mix("primary", 55)},inset 0 0 8px ${mix("primary", 20)}}`,
  glass: `${BUTTONS}{-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);border:1px solid rgb(255 255 255/.28);box-shadow:0 4px 16px rgb(0 0 0/.18),inset 0 1px 0 rgb(255 255 255/.3)}
${TONED}{background-color:${mix("surface-container-high", 45)}}`,
  /* Royal Match and Clash Royale: a gradient over the fill, a gold rim, a dark outer line, a lip below, white words with an outline */
  gloss: `${BUTTONS}{border:3px solid var(--st-rim);background-image:${SHEEN};box-shadow:0 0 0 2px var(--st-rim-dark),0 4px 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.55);color:#fff;${OUTLINED("var(--st-stroke)")};font-family:var(--st-display,inherit);font-weight:400}
${PRESSES}{translate:0 3px;box-shadow:0 0 0 2px var(--st-rim-dark),0 1px 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.3)}
:is(${FAB}){background-color:${role("primary")}}`,
  /* Block Blast: flat, with a darker lip */
  lip: `${BUTTONS}{box-shadow:0 4px 0 ${mix("primary", 60, "black")};font-weight:600}
${PRESSES}{translate:0 3px;box-shadow:0 1px 0 ${mix("primary", 60, "black")}}`,
  /* Elden Ring: no box at all; the words stand between two hairlines that fade out, on a faint glow */
  text: `${BUTTONS}{background-color:transparent;color:${role("on-surface")};border:0;border-block:1px solid;border-image:linear-gradient(90deg,transparent,${mix("primary", 70)},transparent) 1;background-image:radial-gradient(70% 100% at 50% 50%,${mix("primary", 16)},transparent);box-shadow:none;border-radius:0}
${TONED}{border-image:none;border-color:transparent;background-image:none;color:${role("on-surface-variant")}}`,
  /* Black Myth: a pale band with faded ends and dark words; anything lesser is words alone */
  band: `${BUTTONS}{border:0;border-radius:0;box-shadow:none;${FADED}}
${TONED}{background-color:transparent;color:${role("on-surface")}}`,
  /* Marvel Rivals: a parallelogram, bold italic capitals */
  slant: `${BUTTONS}{border:0;border-radius:0;clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);box-shadow:none;font-style:italic;font-weight:800;text-transform:uppercase;letter-spacing:.02em}`,
  /* Genshin: a capsule with a thin ring just inside its edge */
  ring: `${BUTTONS}{border:0;box-shadow:inset 0 0 0 2px ${mix("on-primary", 16)},0 2px 6px rgb(0 0 0/.25)}
${TONED}{box-shadow:inset 0 0 0 1px ${mix("on-secondary-container", 30)},0 2px 6px rgb(0 0 0/.25)}`,
  /* Cyberpunk 2077: the color at a low strength, a line of it around, its words in it, one corner cut */
  tint: `${BUTTONS}{background-color:${mix("primary", 16)};color:${role("primary")};border:1px solid ${role("primary")};border-radius:0;box-shadow:none;clip-path:polygon(0 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%)}
${BUTTON}:hover{background-color:${mix("primary", 34)}}`,
  /* Wild Rift: dark with a thin gold line and a glow from inside; the main action in gold */
  frame: `${BUTTONS}{border:1px solid var(--st-rim);border-radius:0;background-image:linear-gradient(180deg,rgb(255 255 255/.14),rgb(0 0 0/.18));box-shadow:inset 0 0 10px rgb(255 255 255/.08),0 2px 8px rgb(0 0 0/.4)}
${TONED}{background-color:${role("surface-container-low")};color:${role("on-surface")}}`,
};

const SURFACE_CSS: Record<Recipes["surface"], string> = {
  m3: "",
  soft: `:is(${PANELS}){box-shadow:0 1px 2px rgb(0 0 0/.06),0 6px 20px rgb(0 0 0/.06)}
[data-slot=card][class~="bg-surface-container-highest"]{background-color:${role("surface-container-low")}}`,
  line: `:is(${PANELS}){border:1px solid ${role("outline-variant")};box-shadow:0 1px 2px rgb(0 0 0/.05)}`,
  hard: `:is(${PANELS}){border:var(--st-edge) solid var(--st-line);box-shadow:4px 4px 0 var(--st-line)}`,
  glow: `:is(${PANELS}){border:1px solid ${mix("primary", 55)};box-shadow:0 0 16px ${mix("primary", 20)},inset 0 0 22px ${mix("primary", 7)}}`,
  glass: `:is(${PANELS}){background-color:${mix("surface-container-high", 42)};-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);border:1px solid rgb(255 255 255/.22);box-shadow:0 8px 32px rgb(0 0 0/.2),inset 0 1px 0 rgb(255 255 255/.22)}`,
  ornate: `:is(${PANELS}){border:1px solid ${role("primary")};box-shadow:0 0 0 1px ${role("surface")},0 0 0 3px ${mix("primary", 55)},0 6px 18px rgb(0 0 0/.45),inset 0 0 26px rgb(0 0 0/.3)}`,
  plain: `:is(${PANELS}){border:0;box-shadow:none}`,
  /* a marketplace's white card on grey */
  tile: `:is(${PANELS}){border:0;box-shadow:none}
[data-slot=card]{background-color:${role("surface-container-low")}}`,
  /* the casual games' popups: a thick rim of two colors and a lip */
  chunk: `:is(${PANELS}){border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),0 6px 0 2px rgb(0 0 0/.25),inset 0 2px 0 rgb(255 255 255/.7)}`,
  /* Elden Ring and Wild Rift: a thin line of the accent, a fainter one just outside it */
  hairline: `:is(${PANELS}){border:1px solid var(--st-rim);outline:1px solid ${mix("primary", 14)};outline-offset:3px;box-shadow:none;background-image:linear-gradient(180deg,rgb(255 255 255/.03),transparent)}`,
  /* Stardew Valley: a wooden frame around parchment that darkens toward its foot */
  wood: `:is(${PANELS}){border:3px solid var(--st-rim);box-shadow:0 0 0 2px var(--st-rim-dark),3px 5px 0 2px rgb(0 0 0/.25);background-image:linear-gradient(180deg,rgb(255 255 255/.22),rgb(120 60 0/.1))}`,
  /* Genshin: one thin line of pale gold */
  gilt: `:is(${PANELS}){border:1px solid var(--st-rim);box-shadow:inset 0 0 0 1px rgb(255 255 255/.06),0 4px 18px rgb(0 0 0/.25)}`,
  /* the strategy games' plate: a dark edge, a light top, a small lip */
  steel: `:is(${PANELS}){border:2px solid var(--st-rim-dark);box-shadow:inset 0 1px 0 rgb(255 255 255/.6),0 3px 0 rgb(0 0 0/.18)}`,
};

const INDICATOR = `[data-slot=tabs-list] [data-slot=tabs-indicator]`;
const FLUSH_TABS = `[data-slot=tabs-trigger]{margin-block:0;height:100%}`;
const TABS_CSS: Record<Recipes["tabs"], string> = {
  m3: "",
  segmented: `[data-slot=tabs]{padding-inline:var(--st-margin)}
[data-slot=tabs-list]{height:36px;width:100%;padding:2px;border:0;background-color:${role("surface-container-highest")};border-radius:var(--st-control-r)}
[data-slot=tabs-trigger]{margin-block:0;height:100%;border-radius:calc(var(--st-control-r) - 2px)}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")}}
${INDICATOR}{top:2px;bottom:2px;left:var(--active-tab-left);width:var(--active-tab-width);height:auto;border-radius:calc(var(--st-control-r) - 2px);background-color:${role("surface-container-low")};box-shadow:0 1px 3px rgb(0 0 0/.18)}`,
  boxed: `[data-slot=tabs-list]{height:44px;border-bottom:var(--st-edge) solid var(--st-line)}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;border:var(--st-edge) solid transparent;border-bottom:0}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};background-color:${role("surface-container-high")};border-color:var(--st-line)}
[data-slot=tabs-indicator]{display:none}`,
  glow: `[data-slot=tabs-list]{border-color:${mix("outline", 40)}}
${INDICATOR}{left:var(--active-tab-left);width:var(--active-tab-width);height:2px;border-radius:0;background-color:var(--st-tab-on);box-shadow:0 0 10px var(--st-tab-on)}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{color:var(--st-tab-on)}`,
  /* Fluent, TikTok, a marketplace: no track, a rounded bar under the chosen one */
  underline: `[data-slot=tabs-list]{border-bottom-color:transparent}
${INDICATOR}{background-color:var(--st-tab-on)}
[data-slot=tabs-trigger]{border-radius:var(--st-control-r)}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};font-weight:600}`,
  /* VS Code: square tabs, the chosen one the color of the page with a line along its top */
  topline: `[data-slot=tabs-list]{height:36px;background-color:${role("surface-container-low")}}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;border-right:1px solid ${role("outline-variant")}}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};background-color:${role("surface")}}
${INDICATOR}{top:0;bottom:auto;left:var(--active-tab-left);width:var(--active-tab-width);height:1px;border-radius:0;background-color:var(--st-tab-on)}`,
  /* Apex and Marvel Rivals: the chosen one is a filled parallelogram */
  slant: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0;font-style:italic;font-weight:700;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
[data-slot=tabs-trigger][data-active]{background-color:var(--st-tab-on);color:${role("on-primary")}}
[data-slot=tabs-indicator]{display:none}`,
  /* Elden Ring and Black Myth: words alone; the chosen one a pale band with faded ends */
  band: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{background-color:var(--st-tab-on);color:${role("surface")};${FADED}}
[data-slot=tabs-indicator]{display:none}`,
  /* Elden Ring: the chosen row is lit from the left, and the light fades out before it ends */
  fade: `[data-slot=tabs-list]{border-bottom-color:transparent}
${FLUSH_TABS}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{background-image:linear-gradient(90deg,${mix("primary", 42)},transparent);color:${role("on-surface")}}
[data-slot=tabs-indicator]{display:none}`,
};

const SW = `[data-slot=switch]`;
const THUMB = `[data-slot=switch-thumb]`;
const TOGGLE_CSS: Record<Recipes["toggle"], string> = {
  m3: "",
  ios: `${SW}{border:0;background-color:${role("surface-container-highest")}}
${SW}[data-checked]{background-color:var(--st-toggle-on)}
${SW}[data-size=default]{width:51px;height:31px}
${SW} ${THUMB},${SW} ${THUMB}[data-checked]{background-color:#fff;box-shadow:0 2px 6px rgb(0 0 0/.25)}
${SW}[data-size=default] ${THUMB}{width:27px;height:27px;translate:2px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:22px -50%}
${SW}[data-size=sm] ${THUMB}{width:20px;height:20px;translate:2px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${THUMB}::before,[data-slot=switch-checked-icon],[data-slot=switch-unchecked-icon]{display:none}`,
  block: `${SW}{border-width:var(--st-edge-thin);border-color:var(--st-line);background-color:${role("surface-container-highest")}}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:var(--st-line)}
${SW}[data-size=default] ${THUMB}{width:18px;height:18px;translate:5px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:24px -50%}
${SW}[data-size=sm] ${THUMB}{width:12px;height:12px;translate:3px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${SW} ${THUMB}{background-color:var(--st-line)}
${SW} ${THUMB}[data-checked]{background-color:${role("surface")}}
${THUMB}::before{display:none}`,
  /* Fluent's 40 by 20: a line and a dark thumb when off, the color and a white thumb when on */
  outline: `${SW}{border:1px solid ${role("on-surface-variant")};background-color:transparent}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:transparent}
${SW}[data-size=default]{width:40px;height:20px}
${SW}[data-size=default] ${THUMB}{width:14px;height:14px;translate:2px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:22px -50%}
${SW}[data-size=sm]{width:32px;height:16px}
${SW}[data-size=sm] ${THUMB}{width:10px;height:10px;translate:2px -50%}
${SW}[data-size=sm] ${THUMB}[data-checked]{translate:18px -50%}
${SW} ${THUMB}{background-color:${role("on-surface-variant")}}
${SW} ${THUMB}[data-checked]{background-color:#fff}
${THUMB}::before{display:none}`,
  /* the casual games: a thick dark edge, a sunken track, a glossy white knob */
  chunky: `${SW}{border:2px solid var(--st-rim-dark);background-color:${role("surface-container-highest")};box-shadow:inset 0 2px 3px rgb(0 0 0/.25)}
${SW}[data-checked]{background-color:var(--st-toggle-on);border-color:var(--st-rim-dark)}
${SW}[data-size=default] ${THUMB},${SW}[data-size=default] ${THUMB}[data-checked]{width:22px;height:22px;background-color:#fff;box-shadow:0 2px 0 rgb(0 0 0/.3),inset 0 -2px 0 rgb(0 0 0/.08)}
${SW}[data-size=default] ${THUMB}{translate:3px -50%}
${SW}[data-size=default] ${THUMB}[data-checked]{translate:23px -50%}
${THUMB}::before{display:none}`,
};

const SLIDER_CSS: Record<Recipes["slider"], string> = {
  m3: "",
  thin: `[data-slot=slider]{--slider-gap:0px!important}
[data-slot=slider-stop]{display:none}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:4px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-track]{width:4px}
[data-slot=slider] [data-slot=slider-thumb]{width:28px;height:28px;border-radius:50%;background-color:#fff;box-shadow:0 1px 5px rgb(0 0 0/.32),0 0 0 .5px rgb(0 0 0/.06)}`,
  block: `[data-slot=slider]{--slider-gap:0px!important}
[data-slot=slider-stop]{display:none}
[data-slot=slider-track]{outline:var(--st-edge-thin) solid var(--st-line);border-radius:0}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-track]{height:10px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-track]{width:10px}
[data-slot=slider] [data-slot=slider-thumb]{border-radius:0;background-color:${role("primary")};outline:var(--st-edge-thin) solid var(--st-line)}
[data-slot=slider][data-orientation=horizontal] [data-slot=slider-thumb]{width:14px;height:24px}
[data-slot=slider][data-orientation=vertical] [data-slot=slider-thumb]{width:24px;height:14px}`,
};

const NAV_BARS = `[data-slot=navigation-bar],[data-slot=navigation-rail]`;
const CHOSEN_NAV = `:is(${NAV_BARS}) [data-active],:is(${NAV_BARS}) [data-active] *`;
const NO_PILL = `[data-slot=nav-indicator]{background-color:transparent}`;
const NAV_CSS: Record<Recipes["nav"], string> = {
  m3: "",
  plain: `[data-slot=navigation-bar]{border-top:1px solid ${role("outline-variant")};background-color:${mix("surface-container", 92)}}
[data-slot=navigation-rail]{background-color:${role("surface-container-low")}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}`,
  topline: `[data-slot=navigation-bar]{border-top:1px solid ${mix("outline", 40)}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;top:-1px;left:18%;right:18%;height:2px;background-color:var(--st-nav-on);box-shadow:0 0 10px var(--st-nav-on)}`,
  block: `[data-slot=navigation-bar]{border-top:var(--st-edge) solid var(--st-line)}
[data-slot=nav-indicator]{border:var(--st-edge-thin) solid var(--st-line);background-color:${role("primary-container")}}
:is(${NAV_BARS}) [data-active] [data-slot=icon]{color:${role("on-primary-container")}}`,
  /* iOS 26: a capsule that floats above the foot, the chosen tab a capsule within it */
  floating: `[data-slot=navigation-bar]{position:relative;background-color:transparent;padding:2px 22px 10px}
[data-slot=nav-item]{padding-block:2px;gap:0;position:relative;z-index:1}
[data-slot=navigation-bar]::before{content:"";position:absolute;inset:0 16px 8px;border-radius:999px;background-color:${mix("surface-container", 78)};-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);border:1px solid rgb(255 255 255/.28);box-shadow:0 8px 28px rgb(0 0 0/.16)}
[data-slot=nav-indicator]{background-color:transparent}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]{background-color:${mix("on-surface", 8)};border-radius:999px}`,
  /* Instagram: no words, the chosen icon filled */
  icononly: `[data-slot=navigation-bar]{border-top:1px solid ${role("outline-variant")};background-color:${role("surface")}}
[data-slot=navigation-rail]{background-color:${role("surface-container-low")}}
${NO_PILL}
:is(${NAV_BARS}) [data-slot=nav-label]{display:none}
${CHOSEN_NAV}{color:var(--st-nav-on)}`,
  /* Royal Match and the strategy games: a saturated bar with a rim, the chosen tile raised and lighter */
  gamebar: `[data-slot=navigation-bar]{background-color:var(--st-nav-bg);border-top:3px solid var(--st-rim)}
[data-slot=navigation-bar] :is([data-slot=nav-label],[data-slot=icon]){color:#fff;text-shadow:0 1px 0 rgb(0 0 0/.5)}
${NO_PILL}
[data-slot=navigation-bar] [data-active] [data-slot=nav-indicator]{background-color:var(--st-nav-active);border-radius:10px;inset:-5px -6px -22px;box-shadow:0 0 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.4)}
[data-slot=navigation-bar] [data-slot=nav-label]{position:relative;z-index:2}`,
  /* Wild Rift: dark, with gold light rising from the foot of the chosen tab */
  goldglow: `[data-slot=navigation-bar]{background-color:${role("surface-container-low")};border-top:1px solid ${mix("outline", 60)}}
${NO_PILL}
${CHOSEN_NAV}{color:var(--st-nav-on)}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 80% at 50% 100%,${mix("primary", 55)},transparent)}`,
};

/** the label stays inside the box: with no notch in the outline there is nothing for it to sit in */
const inside = (box: string, focus: string, radius = "var(--st-control-r)") => `[data-slot=text-field-box]{border-radius:${radius};background-color:transparent;${box}}
[data-slot=text-field]:focus-within [data-slot=text-field-box]{${focus}}
[data-slot=text-field-outline]{display:none}
[data-slot=text-field] :is(input,textarea){padding-top:22px;padding-bottom:6px}
[data-slot=text-field][data-variant=outlined]:focus-within label,[data-slot=text-field][data-variant=outlined]:has(:is(input,textarea):not(:placeholder-shown)) label{translate:0 7px}
:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea]){border-radius:${radius};${box}}
:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea]):focus-within{${focus}}`;

const FIELD_CSS: Record<Recipes["field"], string> = {
  m3: "",
  soft: inside(`background-color:${role("surface-container-highest")};border:0`, `box-shadow:0 0 0 2px ${role("primary")}`),
  boxed: inside(`background-color:${role("surface-container-low")};border:1px solid ${role("outline-variant")};border-bottom-color:${role("outline")}`, `border-bottom:2px solid ${role("primary")}`),
  hard: inside(`background-color:${role("surface-container-low")};border:var(--st-edge) solid var(--st-line)`, `box-shadow:3px 3px 0 var(--st-line)`),
  glow: inside(`background-color:${mix("primary", 6)};border:1px solid ${mix("primary", 55)}`, `border-color:${role("primary")};box-shadow:0 0 12px ${mix("primary", 50)}`),
  /* Ant Design: a line that takes the color when focused, with a soft ring around it */
  ring: inside(`background-color:${role("surface-container-low")};border:1px solid ${role("outline-variant")}`, `border-color:${role("primary")};box-shadow:0 0 0 2px ${mix("primary", 20)}`),
  /* ChatGPT's composer, a marketplace's search box */
  pill: inside(`background-color:${role("surface-container-high")};border:1px solid ${role("outline-variant")}`, `border-color:${role("outline")}`, "26px"),
  /* Elden Ring: nothing but a thin line beneath */
  line: inside(`border:0;border-bottom:1px solid var(--st-rim)`, `border-bottom-color:${role("primary")}`, "0"),
};

/* whatever stands across the top of a screen or a window, and whatever stands across its foot */
const TOP_BARS = `:is([data-slot=app-bar],[data-slot=title-bar],[data-slot=mini-program-header])`;
const FOOT_BARS = `:is([data-slot=status-bar],[data-slot=checkout-bar],[data-slot=chat-composer],[data-slot=layout-dock])`;
const BAR_CSS: Record<Recipes["bar"], string> = {
  m3: "",
  center: `${TOP_BARS}{background-color:${mix("surface", 88)};border-bottom:1px solid ${role("outline-variant")}}
${FOOT_BARS}{border-top:1px solid ${role("outline-variant")}}
[data-slot=app-bar][data-size=small] [data-slot=app-bar-title]{text-align:center;font-size:17px;font-weight:600;letter-spacing:0}`,
  line: `${TOP_BARS}{background-color:${role("surface-container-high")};border-bottom:var(--st-bar-line) solid var(--st-line)}
${FOOT_BARS}{background-color:${role("surface-container-high")};border-top:var(--st-bar-line) solid var(--st-line)}`,
  glow: `${TOP_BARS}{background-color:${mix("surface-container", 88)};border-bottom:1px solid ${role("primary")};box-shadow:0 0 14px ${mix("primary", 30)}}
${FOOT_BARS}{background-color:${mix("surface-container", 88)};border-top:1px solid ${role("primary")}}
[data-slot=app-bar-title]{text-shadow:0 0 10px ${mix("primary", 60)}}`,
  /* over a video, a picture, or nothing: no bar to speak of */
  plain: `${TOP_BARS}{background-color:transparent}`,
  /* a game's strip across the top: its own dark fill, its own words, a rim beneath */
  hud: `${TOP_BARS}{background-color:var(--st-bar-bg);border-bottom:2px solid var(--st-rim)}
${FOOT_BARS}{background-color:var(--st-bar-bg);border-top:2px solid var(--st-rim)}
[data-slot=app-bar] :is([data-slot=app-bar-title],[data-slot=app-bar-subtitle],[data-button],[data-slot=icon]){color:var(--st-on-bar)}`,
};

const STAT = `[data-slot=stat-bar-track]`;
const STAT_FILL = `[data-slot=stat-bar-fill]`;
const METER_CSS: Record<Recipes["meter"], string> = {
  m3: "",
  /* Elden Ring: a thin line of a bar in a thin frame */
  thin: `${STAT}{height:6px;border-radius:0;background-color:rgb(0 0 0/.35);outline:1px solid var(--st-rim,${role("outline")})}
${STAT_FILL}{border-radius:0}`,
  /* the casual games: a fat sunken trough, a glossy fill */
  jelly: `${STAT}{height:14px;border:2px solid var(--st-rim-dark,${role("outline")});background-color:rgb(0 0 0/.35)}
${STAT_FILL}{background-image:linear-gradient(180deg,rgb(255 255 255/.5),rgb(255 255 255/.05) 55%,rgb(0 0 0/.18))}`,
  block: `${STAT}{height:12px;border-radius:0;border:var(--st-edge-thin) solid var(--st-line)}
${STAT_FILL}{border-radius:0}`,
  /* Cyberpunk 2077: cut into cells */
  segment: `${STAT}{height:10px;border-radius:0;outline:1px solid var(--st-line);background-color:rgb(0 0 0/.3)}
${STAT_FILL}{border-radius:0;-webkit-mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px);mask-image:repeating-linear-gradient(90deg,#000 0 6px,transparent 6px 8px)}`,
};

const ROW = `[data-slot=item]`;
const ROWS = `[data-slot=item-group]`;
/** rows closed up, each with a line above it, from where its words start or from the edge */
const closedRows = (lineFrom: string) => `${ROWS}{gap:0}
${ROW}{border-radius:0}
${ROW}+${ROW}::before{content:"";position:absolute;top:0;left:${lineFrom};right:0;height:1px;background-color:${role("outline-variant")}}`;
/** the mark at a row's end, a chevron, says there is more: only Material draws it in the accent color */
const ROW_MARK = `[data-slot=item-actions] [data-button]{color:${role("on-surface-variant")}}`;
const LIST_CSS: Record<Recipes["list"], string> = {
  m3: "",
  /* iOS: rows closed up into a rounded white group, the lines starting where the words do */
  inset: `${closedRows("52px")}
${ROWS}{background-color:${role("surface-container-low")};border-radius:var(--md-sys-shape-corner-medium);overflow:hidden}
${ROW}{min-height:44px;padding-block:6px;padding-inline:16px}`,
  /* WeChat: white rows from edge to edge on the grey ground */
  flush: `${closedRows("16px")}
${ROWS}{background-color:${role("surface-container-low")}}
${ROW}{min-height:56px;padding-inline:16px;background-color:${role("surface-container-low")}}`,
  /* Spotify, Instagram: no lines at all */
  plain: `${ROWS}{gap:0}
${ROW}{border-radius:0}`,
  /* Fluent, VS Code, Ant Design: short rows with a line under each */
  hairline: `${closedRows("0px")}
${ROW}{min-height:40px;padding-block:4px;padding-inline:8px}`,
  /* the games: each row its own plate */
  tile: `${ROWS}{gap:6px}
${ROW}{padding-inline:12px;background-color:${role("surface-container")};border:1px solid var(--st-rim);border-radius:var(--st-control-r)}`,
};

const DIALOG = `[data-slot=dialog-content]`;
const SPLIT_FOOT = `${DIALOG} [data-slot=dialog-footer]{flex-direction:row;gap:0;margin:8px -16px 0;border-top:1px solid ${role("outline-variant")}}
${DIALOG} [data-slot=dialog-footer] [data-button]{flex:1;height:44px;border-radius:0}
${DIALOG} [data-slot=dialog-footer] [data-button]+[data-button]{border-left:1px solid ${role("outline-variant")}}`;
const DIALOG_CSS: Record<Recipes["dialog"], string> = {
  m3: "",
  /* iOS: a small centered card, its words centered, its buttons split across the foot */
  alert: `${DIALOG}{max-width:280px;min-width:0;padding:20px 16px 0;gap:6px;text-align:center;border-radius:var(--md-sys-shape-corner-large-increased)}
${DIALOG} [data-slot=dialog-title]{font-size:17px;line-height:22px;font-weight:600}
${DIALOG} [data-slot=dialog-description]{font-size:13px;line-height:18px}
${SPLIT_FOOT}`,
  /* WeUI: the same, a little wider, with room around its words */
  weui: `${DIALOG}{max-width:320px;min-width:0;padding:24px 16px 0;gap:8px;text-align:center;border-radius:12px}
${DIALOG} [data-slot=dialog-title]{font-size:17px;line-height:24px;font-weight:600}
${DIALOG} [data-slot=dialog-description]{font-size:15px;line-height:22px}
${SPLIT_FOOT}`,
  /* Fluent, Ant Design, VS Code: left-aligned, smaller, its buttons at the right */
  modal: `${DIALOG}{padding:20px;gap:8px;border-radius:var(--md-sys-shape-corner-large)}
${DIALOG} [data-slot=dialog-title]{font-size:16px;line-height:24px;font-weight:600}
${DIALOG} [data-slot=dialog-description]{font-size:14px;line-height:20px}`,
  /* the casual games: a colored band across the head, the words centered in it */
  game: `${DIALOG}{padding:0 16px 16px;gap:12px;text-align:center;overflow:hidden}
${DIALOG} [data-slot=dialog-title]{margin:0 -16px;padding:12px 16px;background-color:var(--st-bar-bg);color:var(--st-on-bar);font-family:var(--st-display,inherit)}
${DIALOG} [data-slot=dialog-footer]{justify-content:center;flex-direction:row}`,
  /* Elden Ring, Black Myth: words centered, square, nothing else */
  plain: `${DIALOG}{padding:24px;gap:10px;text-align:center;border-radius:0}
${DIALOG} [data-slot=dialog-footer]{justify-content:center;flex-direction:row}`,
};

const AVATARS = `:is([data-slot=avatar],[data-slot=avatar-image],[data-slot=avatar-fallback])`;
const AVATAR_CSS: Record<Recipes["avatar"], string> = {
  m3: "",
  /* WeChat: a square with small corners */
  square: `${AVATARS}{border-radius:15%}`,
  /* the games: a square in a frame */
  framed: `${AVATARS}{border-radius:var(--st-control-r)}
[data-slot=avatar]{outline:2px solid var(--st-rim);outline-offset:1px}`,
};

const CHIP_CSS: Record<Recipes["chip"], string> = {
  m3: "",
  pill: `:is(${CHIPS}){border-radius:999px}`,
  /* Ant Design and the marketplaces: short, small words, small corners */
  tag: `:is(${CHIPS}){height:24px;padding-inline:8px;font-size:12px;border-radius:var(--md-sys-shape-corner-extra-small)}`,
};

const TALK = `[data-slot=dialogue-box]`;
const SPEAKER = `[data-slot=dialogue-speaker]`;
const PORTRAIT = `[data-slot=dialogue-portrait]`;
const SPEAKER_NAME = `[data-slot=dialogue-name]`;
const WORDS = `:is([data-slot=dialogue-words],[data-slot=dialogue-choices],[data-slot=dialogue-next])`;
const DIALOGUE_CSS: Record<Recipes["dialogue"], string> = {
  m3: "",
  /* Stardew Valley: the words at the left, and at the right a portrait over a nameplate */
  portrait: `${TALK}{display:grid;grid-template-columns:minmax(0,1fr) 132px;column-gap:12px;align-content:start}
${WORDS}{grid-column:1}
${SPEAKER}{grid-column:2;grid-row:1/span 4;flex-direction:column;align-items:stretch;gap:6px;padding-left:12px;border-left:3px solid var(--st-rim)}
${PORTRAIT}{width:100%;height:auto;aspect-ratio:1;border-radius:0;border:3px solid var(--st-rim)}
${SPEAKER_NAME}{flex:none;text-align:center;padding:2px 4px;background-color:${role("surface-container-lowest")};color:${role("on-surface")};border:1px solid var(--st-rim)}`,
  /* Genshin Impact, Honkai Star Rail: no box, the name over the words on a band fading up into the picture */
  band: `${TALK}{background:linear-gradient(transparent,rgb(0 0 0/.72) 32%);border:none;outline:none;border-radius:0;box-shadow:none;align-items:center;text-align:center;padding-top:32px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
${SPEAKER}{justify-content:center}
${PORTRAIT}{display:none}
${SPEAKER_NAME}{flex:none;color:${role("primary")}}
[data-slot=dialogue-words]{color:#fff;text-align:center;min-height:0}`,
};
const CHECK_CSS: Record<Recipes["check"], string> = {
  m3: "",
  /* WeChat and iOS: round, not square */
  round: `[data-slot=checkbox]{border-radius:50%}`,
};

const QUIET = `[data-slot=ripple],.m3-ripple-host{display:none}`;
const PRESSABLE = `[data-button],[data-slot=toggle],[data-slot=fab],[data-slot=extended-fab],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=tabs-trigger]`;
const FEEDBACK_CSS: Record<Recipes["feedback"], string> = {
  m3: "",
  dim: `${QUIET}\n:is(${PRESSABLE}):active{opacity:.62}`,
  press: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(.92)}`,
  flash: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(1.35)}`,
};

/** what desktop software does to everything: smaller words, shorter controls */
/** a type ramp as the variables the type classes read: [size, line, weight, tracking in px] */
type Step = [size: number, line: number, weight?: number, track?: number];
const ramp = (steps: Record<string, Step>) =>
  Object.entries(steps)
    .map(([k, [size, line, weight, track]]) =>
      [k, `${k}-emphasized`]
        .map((n, i) => `--text-${n}:${size}px;--text-${n}--line-height:${line}px;${weight ? `--text-${n}--font-weight:${i ? Math.min(900, weight + 100) : weight};` : ""}${track !== undefined ? `--text-${n}--letter-spacing:${track}px;` : ""}`)
        .join(""),
    )
    .join("");
const TITLES = (l: Step, m: Step, s: Step) => ({ "title-large": l, "title-medium": m, "title-small": s });
const BODIES = (l: Step, m: Step, s: Step) => ({ "body-large": l, "body-medium": m, "body-small": s });
const LABELS = (l: Step, m: Step, s: Step) => ({ "label-large": l, "label-medium": m, "label-small": s });
const SERIF_RAMP = (title: number): Record<string, Step> => ({ "headline-small": [28, 36, 400, 1], ...TITLES([title, title + 8, 400, 1], [17, 24, 400, 0.5], [15, 22, 400, 0.5]), ...BODIES([16, 24, 400, 0.2], [15, 22, 400, 0.2], [13, 18, 400, 0.2]), ...LABELS([15, 20, 400, 0.5], [13, 18, 400, 0.3], [12, 16, 400, 0.3]) });
const CHUNKY_RAMP: Record<string, Step> = { "headline-small": [26, 32, 400, 0], ...TITLES([22, 28, 400, 0], [18, 24, 400, 0], [16, 22, 400, 0]), ...BODIES([16, 22, 500, 0], [14, 20, 500, 0], [12, 16, 500, 0]), ...LABELS([16, 22, 400, 0], [14, 18, 400, 0], [12, 14, 400, 0]) };
/** how each style sets its words. iOS is Apple's Dynamic Type at its default size, WeChat is WeUI; the others are read off
 *  the products' screens, so close, not measured. The desktop styles without one here share the compact ramp. */
const TYPE_RAMPS: Record<string, Record<string, Step>> = {
  ios: { "headline-large": [34, 41, 700, 0.4], "headline-medium": [28, 34, 700, 0.4], "headline-small": [22, 28, 700, 0.3], ...TITLES([20, 25, 600, 0.3], [17, 22, 600, -0.4], [15, 20, 600, -0.2]), ...BODIES([17, 22, 400, -0.4], [15, 20, 400, -0.2], [13, 18, 400, -0.1]), ...LABELS([15, 20, 500, -0.2], [13, 18, 500, -0.1], [11, 13, 500, 0]) },
  wechat: { "headline-medium": [22, 30, 600, 0], "headline-small": [20, 28, 600, 0], ...TITLES([17, 24, 600, 0], [17, 24, 500, 0], [15, 20, 500, 0]), ...BODIES([17, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([17, 24, 500, 0], [14, 20, 400, 0], [10, 14, 400, 0]) },
  shortvideo: { ...TITLES([20, 26, 600, 0], [16, 22, 600, 0], [14, 20, 600, 0]), ...BODIES([15, 21, 400, 0], [14, 19, 400, 0], [12, 16, 400, 0]), ...LABELS([15, 20, 600, 0], [13, 16, 500, 0], [10, 13, 500, 0]) },
  spotify: { ...TITLES([24, 30, 700, -0.2], [16, 22, 700, 0], [14, 20, 700, 0]), ...BODIES([16, 22, 400, 0], [14, 20, 400, 0], [13, 16, 400, 0]), ...LABELS([14, 20, 700, 0], [12, 16, 700, 0], [11, 14, 500, 0]) },
  shop: { ...TITLES([18, 24, 600, 0], [15, 20, 600, 0], [14, 18, 600, 0]), ...BODIES([14, 20, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 600, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  social: { ...TITLES([20, 24, 700, 0], [16, 20, 600, 0], [14, 18, 600, 0]), ...BODIES([14, 18, 400, 0], [14, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 18, 600, 0], [12, 16, 600, 0], [11, 13, 500, 0]) },
  whatsapp: { ...TITLES([22, 28, 600, 0], [17, 22, 500, 0], [15, 20, 500, 0]), ...BODIES([16, 21, 400, 0], [14, 19, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 19, 500, 0], [13, 16, 500, 0], [12, 16, 500, 0]) },
  chatgpt: { ...TITLES([18, 26, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [13, 18, 500, 0], [12, 16, 500, 0]) },
  notion: { "headline-large": [40, 48, 700, 0], "headline-medium": [30, 38, 700, 0], "headline-small": [24, 32, 600, 0], ...TITLES([20, 28, 600, 0], [16, 24, 600, 0], [14, 20, 600, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 500, 0], [12, 16, 500, 0], [11, 14, 500, 0]) },
  casual: CHUNKY_RAMP,
  blocks: CHUNKY_RAMP,
  survival: { ...TITLES([22, 26, 700, 0.2], [18, 22, 700, 0.2], [16, 20, 700, 0.2]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 700, 0.2], [14, 18, 600, 0.2], [12, 14, 600, 0.2]) },
  anime: { ...TITLES([22, 28, 600, 0], [17, 24, 600, 0], [15, 20, 600, 0]), ...BODIES([15, 22, 500, 0], [14, 20, 500, 0], [12, 16, 500, 0]), ...LABELS([15, 20, 600, 0], [13, 16, 500, 0], [11, 14, 500, 0]) },
  moba: { ...TITLES([20, 26, 700, 0.5], [16, 22, 600, 0], [14, 20, 600, 0]), ...BODIES([14, 20, 400, 0], [13, 18, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 18, 700, 0], [12, 16, 600, 0], [11, 14, 600, 0]) },
  souls: SERIF_RAMP(20),
  wukong: SERIF_RAMP(24),
  cyber: { ...TITLES([24, 28, 600, 1], [18, 22, 600, 0.5], [16, 20, 600, 0.5]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 600, 1], [14, 18, 600, 0.5], [12, 14, 600, 0.5]) },
  rivals: { ...TITLES([28, 30, 800, 0], [20, 24, 700, 0], [17, 20, 700, 0]), ...BODIES([16, 20, 500, 0], [15, 19, 500, 0], [13, 16, 500, 0]), ...LABELS([18, 22, 800, 0.5], [14, 18, 700, 0.5], [12, 14, 700, 0.5]) },
  fps: { ...TITLES([26, 30, 700, 0.5], [20, 24, 700, 0.5], [16, 20, 700, 0.5]), ...BODIES([17, 22, 500, 0.2], [15, 20, 500, 0.2], [13, 16, 500, 0.2]), ...LABELS([16, 20, 700, 1], [14, 18, 600, 0.5], [12, 14, 600, 0.5]) },
  stardew: { ...TITLES([24, 30, 400, 0], [20, 26, 400, 0], [16, 22, 400, 0]), ...BODIES([16, 24, 400, 0], [14, 20, 400, 0], [12, 16, 400, 0]), ...LABELS([14, 20, 400, 0], [12, 16, 400, 0], [12, 14, 400, 0]) },
};
const COMPACT_VARS = `--text-body-large:14px;--text-body-large--line-height:20px;--text-body-medium:13px;--text-body-medium--line-height:18px;--text-title-large:16px;--text-title-large--line-height:22px;--text-title-medium:14px;--text-title-medium--line-height:20px;--text-title-small:13px;--text-label-large:13px;--text-label-large--line-height:18px;--text-label-medium:12px;`;
const COMPACT_CSS = `[data-button][data-size=xs]{height:24px;padding-inline:8px}
[data-button]:is([data-size=sm],[data-size=default]){height:32px;padding-inline:12px}
[data-button][data-size=md]{height:36px;padding-inline:16px;font-size:14px}
[data-button][data-size=lg]{height:44px;padding-inline:20px;font-size:15px}
[data-slot=tabs-list]{height:36px}
[data-slot=tabs-trigger]{margin-block:0;height:100%}
[data-slot=app-bar-row]{height:48px}
[data-slot=navigation-bar]{height:56px}
[data-slot=text-field-box]{min-height:44px}
[data-slot=text-field] :is(input,textarea){padding-top:18px;padding-bottom:4px}`;

/** the corners a control takes under a style, or nothing when it keeps M3's own */
function cornerCss(control: StylePack["control"], pill: StylePack["pill"]): string {
  const r = control === "pill" ? "var(--st-control-r)" : `var(--md-sys-shape-corner-${control})`;
  return [
    control === "pill" ? "" : `:is(${CORNERED}){--btn-r:${r};--btn-r-pressed:${r};--btn-r-square:${r};--btn-r-selected:${r};--btn-h2:${r}}`,
    control === "pill" ? "" : `:is(${CHIPS},[data-slot=fab],[data-slot=extended-fab]){border-radius:${r}}`,
    pill === "follow" ? `.rounded-full{border-radius:${r}}\n:is([data-slot=radio-group-item],[data-slot=radio-group-indicator],[data-slot=slider-thumb]).rounded-full{border-radius:50%}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type StyleSelectors = {
  /** where the variables are set in light mode, and where the rules start from */
  scope: string;
  /** where they are set in dark mode */
  dark: string;
};

export const CANVAS_SCOPE: StyleSelectors = { scope: ".m3-part-scope.m3-part-scope", dark: ".dark .m3-part-scope.m3-part-scope" };
/* the theme provider writes its scheme on :root at run time, later than this stylesheet: twice is enough to outrank it */
export const APP_SCOPE: StyleSelectors = { scope: ":root:root", dark: ":root:root.dark" };

type StyleInput = Styled & { fontFamily?: string; displayFamily?: string };

/** The whole look of a theme as CSS, or "" when it adds nothing to Material. */
export function styleCss(t: StyleInput, at: StyleSelectors = CANVAS_SCOPE): string {
  const pack = styleOf(t.style);
  const squared = t.shape === "square" || t.shape === "none" || t.shape === "soft";
  const recipes = recipesOf(t);
  const anyRecipe = RECIPE_KEYS.some((k) => recipes[k] !== "m3");
  const display = t.displayFamily;
  if (!pack && !squared && !anyRecipe && !display) return "";

  /* the corner a button gets when its style names none: M3's pill, until the shape scale says the document is square */
  const control = pack?.control ?? (squared ? "small" : "pill");
  const pill = pack?.pill === "follow" || (t.shape === "none" && !pack) ? "follow" : (pack?.pill ?? "round");
  const controlR = control === "pill" ? "999px" : `var(--md-sys-shape-corner-${control})`;
  const edge = pack?.edge ?? 2;
  const tk = pack?.tokens ?? {};
  const vars = [
    `--st-line:${role("outline")};--st-edge:${edge}px;--st-edge-thin:${Math.max(1, edge - 1)}px;--st-bar-line:${pack?.compact ? 1 : edge}px;--st-control-r:${controlR};`,
    `--st-rim:${tk.rim ?? role("outline")};--st-rim-dark:${tk.rimDark ?? role("on-surface")};--st-stroke:${tk.stroke ?? "rgb(0 0 0/.75)"};`,
    `--st-margin:${uxOf(t).margin}px;--st-toned-line:${tk.tonedLine ?? "transparent"};--st-toggle-on:${tk.toggleOn ?? role("primary")};--st-nav-on:${tk.navOn ?? role("primary")};--st-tab-on:${tk.tabOn ?? role("primary")};`,
    `--st-nav-bg:${tk.navBg ?? role("surface-container")};--st-nav-active:${tk.navActive ?? role("secondary-container")};--st-bar-bg:${tk.barBg ?? role("surface-container")};--st-on-bar:${tk.onBar ?? role("on-surface")};`,
    pack?.compact ? COMPACT_VARS : "",
    pack && TYPE_RAMPS[pack.key] ? ramp(TYPE_RAMPS[pack.key]) : "",
    /* a pixel face has its one weight: anything drawn bolder only smears */
    pack?.font === "pixel" ? "--st-mono:'Pixelify Sans','Fusion Pixel 12px Proportional SC',monospace;" : "",
    /* the Chinese that stands in for these faces has its one weight, and anything drawn bolder only smears */
    pack && ["pixel", "barlow", "rajdhani", "lilita", "fredoka"].includes(pack.font) ? "font-synthesis-weight:none;" : "",
  ].join("");

  const colors = pack && !t.ownColors && (!t.contrast || t.contrast === "standard") ? pack : undefined;
  const top = [
    `${at.scope}{${vars}${colors ? `${roleVars(colors.light, false)}--st-primary-text:${tk.primaryText ?? role("primary")};` : ""}${display ? `--st-display:${display};` : ""}}`,
    colors ? `${at.dark}{${roleVars(colors.dark, true)}--st-primary-text:${tk.primaryTextDark ?? role("primary")};}` : "",
  ];
  /* words a part sets no size for are body text, by this style's ramp. On a whole page that is said of its body: the root's size is what rem counts from */
  const plainWords = pack && TYPE_RAMPS[pack.key] ? `${at === APP_SCOPE ? `${at.scope} body` : at.scope}{font-size:var(--text-body-large);line-height:var(--text-body-large--line-height)}` : "";
  const bleed = uxOf(t).bleed ?? [];
  const rules = [
    pack ? `.rounded{border-radius:var(--md-sys-shape-corner-extra-small)}` : "",
    bleed.includes("video") ? `:is([data-slot=video],[data-slot=video-placeholder]){border-radius:0}` : "",
    /* a picture's corner comes from the theme by a variable, on the picture itself */
    bleed.includes("image") ? `[data-slot=image]{--md-sys-shape-corner-medium:0px}` : "",
    cornerCss(control, pill),
    /* a color made for filling a button is not always one words can be read in */
    colors && (tk.primaryText || tk.primaryTextDark) ? `.text-primary:not([data-slot=app-bar] *){color:var(--st-primary-text)}` : "",
    pack?.compact ? COMPACT_CSS : "",
    BUTTON_CSS[recipes.button],
    SURFACE_CSS[recipes.surface],
    TABS_CSS[recipes.tabs],
    TOGGLE_CSS[recipes.toggle],
    SLIDER_CSS[recipes.slider],
    NAV_CSS[recipes.nav],
    FIELD_CSS[recipes.field],
    BAR_CSS[recipes.bar],
    METER_CSS[recipes.meter],
    recipes.list === "m3" ? "" : ROW_MARK,
    LIST_CSS[recipes.list],
    DIALOG_CSS[recipes.dialog],
    AVATAR_CSS[recipes.avatar],
    CHIP_CSS[recipes.chip],
    CHECK_CSS[recipes.check],
    DIALOGUE_CSS[recipes.dialogue],
    FEEDBACK_CSS[recipes.feedback],
    display ? `:is([class*="text-display-"],[class*="text-headline-"],[class~="text-title-large"]){font-family:var(--st-display)}` : "",
    pack?.italicDisplay ? `:is([class*="text-display-"],[class*="text-headline-"],[class~="text-title-large"]){font-style:italic;font-weight:800;text-transform:uppercase}` : "",
    pack?.capsLabels ? `:is(${BUTTON},[data-slot=tabs-trigger]){text-transform:uppercase;letter-spacing:.06em}` : "",
  ].filter(Boolean);
  /* an exported screen and a style's sample are drawn by class, so a rule reaches them; on the canvas and in the
     preview a screen paints itself inline: see screenBackground */
  const backdrop = !colors
    ? []
    : [colors.screen ? `${at.scope} [data-backdrop]{background-image:${colors.screen}}` : "", colors.screenDark ?? colors.screen ? `${at.dark} [data-backdrop]{background-image:${colors.screenDark ?? colors.screen}}` : ""];
  return [...top, plainWords, `${at.scope}{\n${rules.join("\n")}\n}`, ...backdrop].filter(Boolean).join("\n");
}

/** what lies behind a screen of this style, if it is more than the screen's color */
const screenImageOf = (t: Styled) => {
  const pack = colorsOf(t);
  return pack && (t.dark ? (pack.screenDark ?? pack.screen) : pack.screen);
};

/** the screen's background, for where it is drawn inline: the style's picture over the screen's color */
export const screenBackground = (color: string, t: Styled) => {
  const image = screenImageOf(t);
  return image ? `${image}, ${color}` : color;
};

/** whether an exported screen has anything to draw behind itself */
export const hasBackdrop = (t: Styled) => {
  const pack = colorsOf(t);
  return !!(pack?.screen ?? pack?.screenDark);
};

/* ---------- reading one back ---------- */

const isVariant = <K extends RecipeKey>(k: K, v: unknown): v is Recipes[K] => (RECIPES[k] as readonly unknown[]).includes(v);

/** the layout settings a stored theme names, without what it could not mean */
export function normalizeUx(u: unknown): Partial<StyleUX> | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const r = u as Record<string, unknown>;
  const out: Partial<StyleUX> = {};
  for (const k of ["margin", "gap", "tight"] as const) if (Number.isFinite(r[k]) && (r[k] as number) >= 0 && (r[k] as number) <= 64) out[k] = r[k] as number;
  if (r.nav === "keep" || r.nav === "bottom" || r.nav === "rail" || r.nav === "top") out.nav = r.nav;
  if (r.place === "top" || r.place === "center" || r.place === "bottom" || r.place === "spread") out.place = r.place;
  return Object.keys(out).length ? out : undefined;
}

/** the recipes a stored theme names, without the ones this version does not know */
export function normalizeRecipes(r: unknown): Partial<Recipes> | undefined {
  if (typeof r !== "object" || r === null) return undefined;
  const out: Partial<Recipes> = {};
  for (const k of RECIPE_KEYS) {
    const v = (r as Record<string, unknown>)[k];
    if (isVariant(k, v)) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
