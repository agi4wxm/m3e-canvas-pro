import type { FontKey, IconFamily, MotionScheme, Palette, ShapeScale } from "./tokens";

/* A style is what a whole document looks like: its colors, its type, its corners and how its controls are
 * built. It is plain data, written out as one stylesheet, so the canvas, the preview and an exported app wear
 * the same one and no part has to know about it. The stylesheet is unlayered, and everything a component says
 * about itself sits in Tailwind's layers, so it wins without !important; what a part is told by hand (its own
 * corners, its own fill) is drawn inline or by class on that part and stays its own. Material adds nothing. */

export type StyleText = { zh: string; en: string; ja: string; ko: string };
export const styleTextOf = (t: StyleText, lang: string) => t[lang as keyof StyleText] ?? t.en;

/* ---------- how the controls are built ---------- */

export const RECIPES = {
  button: ["m3", "flat", "hard", "chamfer", "bevel", "glow", "glass"],
  surface: ["m3", "soft", "line", "hard", "glow", "glass", "ornate"],
  tabs: ["m3", "segmented", "boxed", "glow"],
  toggle: ["m3", "ios", "block"],
  slider: ["m3", "thin", "block"],
  nav: ["m3", "plain", "topline", "block"],
  field: ["m3", "soft", "boxed", "hard", "glow"],
  bar: ["m3", "center", "line", "glow"],
  feedback: ["m3", "dim", "press", "flash"],
} as const;

export type RecipeKey = keyof typeof RECIPES;
export type Recipes = { [K in RecipeKey]: (typeof RECIPES)[K][number] };
export const RECIPE_KEYS = Object.keys(RECIPES) as RecipeKey[];

const M3: Recipes = { button: "m3", surface: "m3", tabs: "m3", toggle: "m3", slider: "m3", nav: "m3", field: "m3", bar: "m3", feedback: "m3" };

export const RECIPE_LABELS: Record<RecipeKey, StyleText> = {
  button: { zh: "按钮", en: "Buttons", ja: "ボタン", ko: "버튼" },
  surface: { zh: "卡片和面板", en: "Cards and panels", ja: "カードとパネル", ko: "카드와 패널" },
  tabs: { zh: "标签页", en: "Tabs", ja: "タブ", ko: "탭" },
  toggle: { zh: "开关", en: "Switches", ja: "スイッチ", ko: "스위치" },
  slider: { zh: "滑块", en: "Sliders", ja: "スライダー", ko: "슬라이더" },
  nav: { zh: "导航栏", en: "Navigation", ja: "ナビゲーション", ko: "내비게이션" },
  field: { zh: "输入框", en: "Text fields", ja: "入力欄", ko: "입력란" },
  bar: { zh: "顶栏", en: "Top bars", ja: "トップバー", ko: "상단 바" },
  feedback: { zh: "按下反馈", en: "Press feedback", ja: "押下の反応", ko: "누름 반응" },
};

export const VARIANT_LABELS: Record<string, StyleText> = {
  m3: { zh: "Material 默认", en: "Material", ja: "Material", ko: "Material" },
  flat: { zh: "扁平", en: "Flat", ja: "フラット", ko: "플랫" },
  hard: { zh: "粗边硬影", en: "Hard edge", ja: "太枠と硬い影", ko: "굵은 테두리" },
  chamfer: { zh: "切角", en: "Chamfered", ja: "面取り", ko: "모따기" },
  bevel: { zh: "金属浮雕", en: "Beveled", ja: "ベベル", ko: "베벨" },
  glow: { zh: "霓虹发光", en: "Neon glow", ja: "ネオン", ko: "네온" },
  glass: { zh: "毛玻璃", en: "Glass", ja: "ガラス", ko: "유리" },
  soft: { zh: "柔和", en: "Soft", ja: "ソフト", ko: "부드럽게" },
  line: { zh: "细线", en: "Hairline", ja: "細線", ko: "가는 선" },
  ornate: { zh: "华丽描边", en: "Ornate", ja: "装飾枠", ko: "장식 테두리" },
  segmented: { zh: "分段", en: "Segmented", ja: "セグメント", ko: "세그먼트" },
  boxed: { zh: "方框", en: "Boxed", ja: "ボックス", ko: "상자" },
  ios: { zh: "iOS 式", en: "iOS", ja: "iOS 風", ko: "iOS" },
  block: { zh: "方块", en: "Block", ja: "ブロック", ko: "블록" },
  thin: { zh: "细轨圆钮", en: "Thin track", ja: "細いトラック", ko: "얇은 트랙" },
  plain: { zh: "纯图标", en: "Plain", ja: "プレーン", ko: "단순" },
  topline: { zh: "顶部亮线", en: "Top line", ja: "上部ライン", ko: "상단 선" },
  center: { zh: "居中标题", en: "Centered", ja: "中央タイトル", ko: "가운데 제목" },
  dim: { zh: "变暗", en: "Dim", ja: "暗くする", ko: "어둡게" },
  press: { zh: "下压", en: "Press down", ja: "沈み込み", ko: "눌림" },
  flash: { zh: "闪亮", en: "Flash", ja: "発光", ko: "번쩍임" },
};

/* ---------- the styles ---------- */

/** the color roles a style names; the ones a scheme has beyond these follow from them */
export type StyleRoles = Omit<Palette, "key" | "label" | "seed" | "error" | "onError" | "errorContainer" | "onErrorContainer"> & {
  onSecondary: string;
  tertiary: string;
  onTertiary: string;
} & Partial<Pick<Palette, "error" | "onError" | "errorContainer" | "onErrorContainer">>;

export type StylePack = {
  key: string;
  name: StyleText;
  /** one line in the style's own terms, shown under its name */
  hint: StyleText;
  group: "app" | "game";
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
  /** the color of a switch that is on, when it is not the primary color */
  toggleOn?: string;
  /** the width of a hard edge, in px */
  edge?: number;
  /** behind everything on a screen, in both modes unless `screenDark` says otherwise */
  screen?: string;
  screenDark?: string;
  /** set in capitals, spaced out: the labels on its buttons and tabs */
  capsLabels?: boolean;
  /** the words every picture of this style is painted with */
  art: string;
};

const ERRORS_LIGHT = { error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B" };
const ERRORS_DARK = { error: "#FF8A80", onError: "#3B0907", errorContainer: "#7A1F1A", onErrorContainer: "#FFDAD6" };

export const STYLE_PACKS: StylePack[] = [
  {
    key: "ios",
    name: { zh: "iOS", en: "iOS", ja: "iOS", ko: "iOS" },
    hint: { zh: "分段控件、居中标题、圆形滑钮", en: "Segmented controls, centered titles, round thumbs", ja: "セグメント、中央タイトル、丸いつまみ", ko: "세그먼트, 가운데 제목, 둥근 손잡이" },
    group: "app",
    seed: "#007AFF",
    mode: "light",
    light: {
      primary: "#0071E3", onPrimary: "#FFFFFF", primaryContainer: "#D6E8FF", onPrimaryContainer: "#003A7A", inversePrimary: "#64B0FF",
      secondary: "#636366", onSecondary: "#FFFFFF", secondaryContainer: "#E5E5EA", onSecondaryContainer: "#1C1C1E",
      tertiary: "#C75300", onTertiary: "#FFFFFF", tertiaryContainer: "#FFE3C7", onTertiaryContainer: "#4A1F00",
      surface: "#F2F2F7", surfaceContainerLow: "#FFFFFF", surfaceContainer: "#FFFFFF", surfaceContainerHigh: "#EFEFF4", surfaceContainerHighest: "#E5E5EA",
      onSurface: "#000000", onSurfaceVariant: "#5C5C60", outline: "#85858A", outlineVariant: "#D1D1D6", inverseSurface: "#1C1C1E", inverseOnSurface: "#FFFFFF",
    },
    dark: {
      primary: "#409CFF", onPrimary: "#001A33", primaryContainer: "#003A7A", onPrimaryContainer: "#D6E8FF", inversePrimary: "#0071E3",
      secondary: "#AEAEB2", onSecondary: "#1C1C1E", secondaryContainer: "#3A3A3C", onSecondaryContainer: "#FFFFFF",
      tertiary: "#FF9F0A", onTertiary: "#2B1600", tertiaryContainer: "#4A2A00", onTertiaryContainer: "#FFE3C7",
      surface: "#000000", surfaceContainerLow: "#1C1C1E", surfaceContainer: "#1C1C1E", surfaceContainerHigh: "#2C2C2E", surfaceContainerHighest: "#3A3A3C",
      onSurface: "#FFFFFF", onSurfaceVariant: "#AEAEB2", outline: "#8E8E93", outlineVariant: "#38383A", inverseSurface: "#F2F2F7", inverseOnSurface: "#000000",
    },
    shape: "rounded",
    font: "apple",
    icons: "light",
    motion: "standard",
    control: "medium",
    pill: "round",
    toggleOn: "#34C759",
    recipes: { button: "flat", surface: "soft", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", feedback: "dim" },
    art: "clean contemporary look, soft natural daylight, restrained colors, refined and uncluttered",
  },
  {
    key: "fluent",
    name: { zh: "Fluent", en: "Fluent", ja: "Fluent", ko: "Fluent" },
    hint: { zh: "Windows 的细边、小圆角和克制的色彩", en: "Windows hairlines, small corners, restrained color", ja: "Windows の細線と小さな角丸", ko: "Windows의 가는 선과 작은 모서리" },
    group: "app",
    seed: "#0F6CBD",
    mode: "light",
    light: {
      primary: "#0F6CBD", onPrimary: "#FFFFFF", primaryContainer: "#CFE4FA", onPrimaryContainer: "#0A3A66", inversePrimary: "#7CB6EC",
      secondary: "#616161", onSecondary: "#FFFFFF", secondaryContainer: "#EBEBEB", onSecondaryContainer: "#242424",
      tertiary: "#835B00", onTertiary: "#FFFFFF", tertiaryContainer: "#FBEBC2", onTertiaryContainer: "#3A2800",
      surface: "#FAFAFA", surfaceContainerLow: "#FFFFFF", surfaceContainer: "#FFFFFF", surfaceContainerHigh: "#F5F5F5", surfaceContainerHighest: "#EBEBEB",
      onSurface: "#242424", onSurfaceVariant: "#616161", outline: "#8A8A8A", outlineVariant: "#D1D1D1", inverseSurface: "#292929", inverseOnSurface: "#FFFFFF",
    },
    dark: {
      primary: "#479EF5", onPrimary: "#04213B", primaryContainer: "#0C3B5E", onPrimaryContainer: "#CFE4FA", inversePrimary: "#0F6CBD",
      secondary: "#ADADAD", onSecondary: "#242424", secondaryContainer: "#3D3D3D", onSecondaryContainer: "#FFFFFF",
      tertiary: "#E9C343", onTertiary: "#2B2000", tertiaryContainer: "#4A3800", onTertiaryContainer: "#FBEBC2",
      surface: "#1F1F1F", surfaceContainerLow: "#292929", surfaceContainer: "#292929", surfaceContainerHigh: "#333333", surfaceContainerHighest: "#3D3D3D",
      onSurface: "#FFFFFF", onSurfaceVariant: "#ADADAD", outline: "#8A8A8A", outlineVariant: "#474747", inverseSurface: "#F5F5F5", inverseOnSurface: "#242424",
    },
    shape: "square",
    font: "segoe",
    icons: "light",
    motion: "standard",
    control: "large",
    pill: "round",
    recipes: { button: "flat", surface: "line", tabs: "m3", toggle: "block", slider: "thin", nav: "plain", field: "boxed", bar: "line", feedback: "dim" },
    art: "crisp modern productivity look, soft depth, gentle neutral light, calm and professional",
  },
  {
    key: "glass",
    name: { zh: "玻璃拟态", en: "Glass", ja: "グラス", ko: "글래스" },
    hint: { zh: "半透明的面板浮在渐变之上", en: "Translucent panels over a gradient", ja: "グラデーションに浮かぶ半透明パネル", ko: "그라데이션 위의 반투명 패널" },
    group: "app",
    seed: "#7C5CFF",
    mode: "dark",
    light: {
      primary: "#5B3FD6", onPrimary: "#FFFFFF", primaryContainer: "#E4DCFF", onPrimaryContainer: "#22125E", inversePrimary: "#C3B4FF",
      secondary: "#5A5570", onSecondary: "#FFFFFF", secondaryContainer: "#E7E2F5", onSecondaryContainer: "#221E33",
      tertiary: "#A32A7F", onTertiary: "#FFFFFF", tertiaryContainer: "#FFD8EF", onTertiaryContainer: "#4A0B38",
      surface: "#EFEBFF", surfaceContainerLow: "#F7F4FF", surfaceContainer: "#F3F0FF", surfaceContainerHigh: "#E9E4FA", surfaceContainerHighest: "#E0DBF2",
      onSurface: "#1B1730", onSurfaceVariant: "#4C4763", outline: "#79748F", outlineVariant: "#C9C3DE", inverseSurface: "#2A2640", inverseOnSurface: "#F4F1FF",
    },
    dark: {
      primary: "#B7A6FF", onPrimary: "#1E1254", primaryContainer: "#3E2E8F", onPrimaryContainer: "#E4DCFF", inversePrimary: "#5B3FD6",
      secondary: "#C8C2E0", onSecondary: "#25213A", secondaryContainer: "#3A3652", onSecondaryContainer: "#EBE7FF",
      tertiary: "#FF9FDC", onTertiary: "#4A0B38", tertiaryContainer: "#6E1F58", onTertiaryContainer: "#FFD8EF",
      surface: "#120F2B", surfaceContainerLow: "#1B1738", surfaceContainer: "#211C42", surfaceContainerHigh: "#2A254F", surfaceContainerHighest: "#332D5C",
      onSurface: "#F4F1FF", onSurfaceVariant: "#C8C2E0", outline: "#938DAE", outlineVariant: "#4A4566", inverseSurface: "#F4F1FF", inverseOnSurface: "#1B1730",
    },
    shape: "full",
    font: "inter",
    icons: "rounded",
    motion: "expressive",
    control: "pill",
    pill: "round",
    screen: "radial-gradient(90% 60% at 15% 10%, #C4B5FD 0%, transparent 60%), radial-gradient(80% 60% at 90% 30%, #F9A8D4 0%, transparent 60%), radial-gradient(90% 70% at 40% 100%, #93C5FD 0%, transparent 65%)",
    screenDark: "radial-gradient(90% 60% at 15% 10%, #5B3FD6 0%, transparent 60%), radial-gradient(80% 60% at 90% 30%, #A32A7F 0%, transparent 60%), radial-gradient(90% 70% at 40% 100%, #1D4ED8 0%, transparent 65%)",
    recipes: { button: "glass", surface: "glass", tabs: "segmented", toggle: "ios", slider: "thin", nav: "plain", field: "soft", bar: "center", feedback: "dim" },
    art: "luminous dreamy atmosphere, soft colored light and depth of field, translucent materials",
  },
  {
    key: "pixel",
    name: { zh: "像素", en: "Pixel", ja: "ピクセル", ko: "픽셀" },
    hint: { zh: "8 位机的粗边框、硬阴影和方块控件", en: "8-bit thick borders, hard shadows, block controls", ja: "8 ビットの太枠と硬い影", ko: "8비트의 굵은 테두리와 단단한 그림자" },
    group: "game",
    seed: "#B83B2A",
    mode: "light",
    light: {
      primary: "#A8341F", onPrimary: "#FFF7DC", primaryContainer: "#F2B880", onPrimaryContainer: "#3A1608", inversePrimary: "#F2B880",
      secondary: "#1F5F85", onSecondary: "#FFF7DC", secondaryContainer: "#A9D6E5", onSecondaryContainer: "#0B2A3C",
      tertiary: "#8A5A00", onTertiary: "#FFF7DC", tertiaryContainer: "#FFD97A", onTertiaryContainer: "#3A2800",
      surface: "#F4E8C1", surfaceContainerLow: "#FFF7DC", surfaceContainer: "#FBF0CC", surfaceContainerHigh: "#EFE0B0", surfaceContainerHighest: "#E8D8A0",
      onSurface: "#2B1D0E", onSurfaceVariant: "#4F3B26", outline: "#2B1D0E", outlineVariant: "#7A6442", inverseSurface: "#2B1D0E", inverseOnSurface: "#FFF7DC",
    },
    dark: {
      primary: "#E8A33D", onPrimary: "#2B1800", primaryContainer: "#6E3B10", onPrimaryContainer: "#FFE2B0", inversePrimary: "#A8341F",
      secondary: "#7FC8E8", onSecondary: "#06222F", secondaryContainer: "#1F4A63", onSecondaryContainer: "#D3EEFA",
      tertiary: "#8BD450", onTertiary: "#132B02", tertiaryContainer: "#2F5A12", onTertiaryContainer: "#DDF7C2",
      surface: "#1A1C2C", surfaceContainerLow: "#23263A", surfaceContainer: "#29294A", surfaceContainerHigh: "#333C57", surfaceContainerHighest: "#3F4A68",
      onSurface: "#F4F4F4", onSurfaceVariant: "#C5CBD6", outline: "#F4F4F4", outlineVariant: "#94B0C2", inverseSurface: "#F4F4F4", inverseOnSurface: "#1A1C2C",
    },
    shape: "none",
    font: "pixel",
    icons: "pixel",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    edge: 3,
    recipes: { button: "hard", surface: "hard", tabs: "boxed", toggle: "block", slider: "block", nav: "block", field: "hard", bar: "line", feedback: "press" },
    art: "16-bit pixel art, a limited palette, crisp visible pixels and no anti-aliasing, like a classic console game",
  },
  {
    key: "cyber",
    name: { zh: "赛博朋克", en: "Cyberpunk", ja: "サイバーパンク", ko: "사이버펑크" },
    hint: { zh: "霓虹描边、切角按钮和扫描线", en: "Neon lines, chamfered buttons, scan lines", ja: "ネオンの線と面取りボタン", ko: "네온 선과 모따기 버튼" },
    group: "game",
    seed: "#00C8D7",
    mode: "dark",
    light: {
      primary: "#00707A", onPrimary: "#FFFFFF", primaryContainer: "#B8F4F9", onPrimaryContainer: "#00363B", inversePrimary: "#00F0FF",
      secondary: "#A8127F", onSecondary: "#FFFFFF", secondaryContainer: "#FFD6F2", onSecondaryContainer: "#4A0538",
      tertiary: "#716100", onTertiary: "#FFFFFF", tertiaryContainer: "#FFF27A", onTertiaryContainer: "#332C00",
      surface: "#E9F1F4", surfaceContainerLow: "#F4F9FA", surfaceContainer: "#EEF5F7", surfaceContainerHigh: "#E0EBEF", surfaceContainerHighest: "#D5E2E7",
      onSurface: "#07141A", onSurfaceVariant: "#37515B", outline: "#00707A", outlineVariant: "#8FB8C2", inverseSurface: "#07141A", inverseOnSurface: "#D8F7FF",
    },
    dark: {
      primary: "#00F0FF", onPrimary: "#00191C", primaryContainer: "#00363C", onPrimaryContainer: "#7DF7FF", inversePrimary: "#00707A",
      secondary: "#FF4FDD", onSecondary: "#2E0023", secondaryContainer: "#3A0B33", onSecondaryContainer: "#FFB3F0",
      tertiary: "#FFE600", onTertiary: "#1F1B00", tertiaryContainer: "#3A3400", onTertiaryContainer: "#FFF27A",
      surface: "#07070F", surfaceContainerLow: "#0D0D1A", surfaceContainer: "#10101E", surfaceContainerHigh: "#161628", surfaceContainerHighest: "#1F1F36",
      onSurface: "#D8F7FF", onSurfaceVariant: "#8FC6D2", outline: "#00C8D7", outlineVariant: "#1E5A63", inverseSurface: "#D8F7FF", inverseOnSurface: "#07070F",
      error: "#FF4D6D", onError: "#2B0009", errorContainer: "#5C0A1F", onErrorContainer: "#FFD6DE",
    },
    shape: "none",
    font: "rajdhani",
    display: "orbitron",
    icons: "sharp",
    motion: "standard",
    control: "extra-small",
    pill: "follow",
    capsLabels: true,
    screenDark: "repeating-linear-gradient(0deg, rgb(0 240 255 / 0.035) 0 1px, transparent 1px 3px), radial-gradient(120% 70% at 50% 0%, rgb(0 240 255 / 0.10), transparent 60%), radial-gradient(100% 60% at 50% 100%, rgb(255 79 221 / 0.10), transparent 60%)",
    screen: "repeating-linear-gradient(0deg, rgb(0 112 122 / 0.04) 0 1px, transparent 1px 3px)",
    recipes: { button: "chamfer", surface: "glow", tabs: "glow", toggle: "block", slider: "block", nav: "topline", field: "glow", bar: "glow", feedback: "flash" },
    art: "cyberpunk megacity, rain-slick streets, cyan and magenta neon, volumetric haze, high contrast cinematic lighting",
  },
  {
    key: "fantasy",
    name: { zh: "奇幻 RPG", en: "Fantasy RPG", ja: "ファンタジー RPG", ko: "판타지 RPG" },
    hint: { zh: "金色描边、浮雕按钮和羊皮纸质感", en: "Gold frames, beveled buttons, parchment", ja: "金の枠とベベルボタン", ko: "금색 테두리와 베벨 버튼" },
    group: "game",
    seed: "#B8862B",
    mode: "dark",
    light: {
      primary: "#7A5A12", onPrimary: "#FFF6DD", primaryContainer: "#EBD193", onPrimaryContainer: "#332400", inversePrimary: "#E8C468",
      secondary: "#7A2E22", onSecondary: "#FFF6DD", secondaryContainer: "#EBC4B4", onSecondaryContainer: "#3A0F08",
      tertiary: "#8A4B08", onTertiary: "#FFF6DD", tertiaryContainer: "#F2CFA0", onTertiaryContainer: "#331A00",
      surface: "#F2E3C0", surfaceContainerLow: "#F8EDD2", surfaceContainer: "#F4E7C8", surfaceContainerHigh: "#EADAB2", surfaceContainerHighest: "#E0CEA2",
      onSurface: "#2A1C0C", onSurfaceVariant: "#57432A", outline: "#7A5A12", outlineVariant: "#B39A68", inverseSurface: "#2A1C0C", inverseOnSurface: "#F8EDD2",
    },
    dark: {
      primary: "#E8C468", onPrimary: "#2A1B04", primaryContainer: "#5A4210", onPrimaryContainer: "#FBE7B2", inversePrimary: "#7A5A12",
      secondary: "#E2A08A", onSecondary: "#3A0F08", secondaryContainer: "#5C2418", onSecondaryContainer: "#FAD9CD",
      tertiary: "#FFB454", onTertiary: "#2A1600", tertiaryContainer: "#5A3A10", onTertiaryContainer: "#FFE2B8",
      surface: "#17110B", surfaceContainerLow: "#1F1810", surfaceContainer: "#261D13", surfaceContainerHigh: "#2F2418", surfaceContainerHighest: "#3A2D1E",
      onSurface: "#F2E6CF", onSurfaceVariant: "#CBB998", outline: "#B8964A", outlineVariant: "#5C4A2A", inverseSurface: "#F2E6CF", inverseOnSurface: "#17110B",
    },
    shape: "square",
    font: "garamond",
    display: "cinzel",
    icons: "sharp",
    motion: "standard",
    control: "small",
    pill: "follow",
    screenDark: "radial-gradient(120% 90% at 50% 40%, transparent 40%, rgb(0 0 0 / 0.55) 100%)",
    screen: "radial-gradient(120% 90% at 50% 40%, transparent 50%, rgb(90 60 20 / 0.22) 100%)",
    recipes: { button: "bevel", surface: "ornate", tabs: "boxed", toggle: "block", slider: "block", nav: "block", field: "hard", bar: "line", feedback: "press" },
    art: "epic high-fantasy digital painting, warm torchlight, rich detail, painterly brushwork in the style of a AAA role-playing game",
  },
];

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
};

/** the settings a style brings: picking it writes them on the theme, where each can be changed afterwards */
export function stylePatch(key: string) {
  const pack = styleOf(key);
  if (!pack) return { style: undefined, ownColors: undefined, recipes: undefined, displayFont: undefined, icons: undefined, shape: "rounded" as const, font: "roboto" as const, motion: "standard" as const, dark: false };
  return { style: pack.key, ownColors: undefined, recipes: undefined, displayFont: pack.display, icons: pack.icons, shape: pack.shape, font: pack.font, motion: pack.motion, dark: pack.mode === "dark" };
}

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
const BUTTON = `[data-slot=button]:not([data-size^=icon],[data-variant=text],[data-variant=ghost],[data-variant=link])`;
const FAB = `[data-slot=fab],[data-slot=extended-fab]`;
const BUTTONS = `${BUTTON},${FAB},[data-slot=skill-button-face]`;
const TONED = `${BUTTON}:is([data-variant=tonal],[data-variant=secondary],[data-variant=tertiary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated])`;
const CORNERED = `[data-slot=button],[data-slot=toggle]`;
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
  `:is(${FILLS.map((f) => `[class~="bg-${f}"]`).join(",")})[class*="rounded"]:not([aria-hidden],[data-slot=button],[data-slot=toggle],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=nav-indicator],[data-slot=tabs-indicator],[data-slot=skill-button-face])`,
].join(",");

const BUTTON_CSS: Record<Recipes["button"], string> = {
  m3: "",
  flat: `${BUTTONS}{box-shadow:none}`,
  hard: `${BUTTONS}{border:var(--st-edge) solid var(--st-line);box-shadow:3px 3px 0 var(--st-line)}
${BUTTON}:active,${FAB}:active{translate:2px 2px;box-shadow:1px 1px 0 var(--st-line)}`,
  chamfer: `${BUTTONS}{border-radius:0;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:none}`,
  bevel: `${BUTTONS}{border:1px solid ${mix("primary", 55, "black")};background-image:linear-gradient(180deg,rgb(255 255 255/.24),rgb(0 0 0/.2));box-shadow:inset 0 1px 0 rgb(255 255 255/.42),inset 0 -1px 0 rgb(0 0 0/.35),0 2px 0 rgb(0 0 0/.4)}
${BUTTON}:active,${FAB}:active{translate:0 1px;box-shadow:inset 0 2px 4px rgb(0 0 0/.45)}`,
  glow: `${BUTTONS}{border:1px solid ${role("primary")};box-shadow:0 0 12px ${mix("primary", 55)},inset 0 0 8px ${mix("primary", 20)}}`,
  glass: `${BUTTONS}{-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);border:1px solid rgb(255 255 255/.28);box-shadow:0 4px 16px rgb(0 0 0/.18),inset 0 1px 0 rgb(255 255 255/.3)}
${TONED}{background-color:${mix("surface-container-high", 45)}}`,
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
};

const TABS_CSS: Record<Recipes["tabs"], string> = {
  m3: "",
  segmented: `[data-slot=tabs-list]{height:36px;width:100%;padding:2px;border:0;background-color:${role("surface-container-highest")};border-radius:var(--st-control-r)}
[data-slot=tabs-trigger]{margin-block:0;height:100%;border-radius:calc(var(--st-control-r) - 2px)}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")}}
[data-slot=tabs-list] [data-slot=tabs-indicator]{top:2px;bottom:2px;left:var(--active-tab-left);width:var(--active-tab-width);height:auto;border-radius:calc(var(--st-control-r) - 2px);background-color:${role("surface-container-low")};box-shadow:0 1px 3px rgb(0 0 0/.18)}`,
  boxed: `[data-slot=tabs-list]{height:44px;border-bottom:var(--st-edge) solid var(--st-line)}
[data-slot=tabs-trigger]{margin-block:0;height:100%;border-radius:0;border:var(--st-edge) solid transparent;border-bottom:0}
[data-slot=tabs-trigger][data-active]{color:${role("on-surface")};background-color:${role("surface-container-high")};border-color:var(--st-line)}
[data-slot=tabs-indicator]{display:none}`,
  glow: `[data-slot=tabs-list]{border-color:${mix("primary", 35)}}
[data-slot=tabs-list] [data-slot=tabs-indicator]{left:var(--active-tab-left);width:var(--active-tab-width);height:2px;border-radius:0;box-shadow:0 0 10px ${role("primary")}}
[data-slot=tabs-trigger]{border-radius:0}
[data-slot=tabs-trigger][data-active]{text-shadow:0 0 10px ${mix("primary", 70)}}`,
};

const TOGGLE_CSS: Record<Recipes["toggle"], string> = {
  m3: "",
  ios: `[data-slot=switch]{border:0;background-color:${role("surface-container-highest")}}
[data-slot=switch][data-checked]{background-color:var(--st-toggle-on)}
[data-slot=switch][data-size=default]{width:51px;height:31px}
[data-slot=switch] [data-slot=switch-thumb],[data-slot=switch] [data-slot=switch-thumb][data-checked]{background-color:#fff;box-shadow:0 2px 6px rgb(0 0 0/.25)}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:27px;height:27px;translate:2px -50%}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:22px -50%}
[data-slot=switch][data-size=sm] [data-slot=switch-thumb]{width:20px;height:20px;translate:2px -50%}
[data-slot=switch][data-size=sm] [data-slot=switch-thumb][data-checked]{translate:18px -50%}
[data-slot=switch-thumb]::before,[data-slot=switch-checked-icon],[data-slot=switch-unchecked-icon]{display:none}`,
  block: `[data-slot=switch]{border-width:var(--st-edge-thin);border-color:var(--st-line);background-color:${role("surface-container-highest")}}
[data-slot=switch][data-checked]{background-color:${role("primary")};border-color:var(--st-line)}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:18px;height:18px;translate:5px -50%}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:24px -50%}
[data-slot=switch][data-size=sm] [data-slot=switch-thumb]{width:12px;height:12px;translate:3px -50%}
[data-slot=switch][data-size=sm] [data-slot=switch-thumb][data-checked]{translate:18px -50%}
[data-slot=switch] [data-slot=switch-thumb]{background-color:var(--st-line)}
[data-slot=switch] [data-slot=switch-thumb][data-checked]{background-color:${role("on-primary")}}
[data-slot=switch-thumb]::before{display:none}`,
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
const NAV_CSS: Record<Recipes["nav"], string> = {
  m3: "",
  plain: `[data-slot=navigation-bar]{border-top:1px solid ${role("outline-variant")};background-color:${mix("surface-container", 92)}}
[data-slot=nav-indicator]{background-color:transparent}
:is(${NAV_BARS}) [data-active],:is(${NAV_BARS}) [data-active] *{color:${role("primary")}}`,
  topline: `[data-slot=navigation-bar]{border-top:1px solid ${mix("primary", 40)}}
[data-slot=nav-indicator]{background-color:transparent}
:is(${NAV_BARS}) [data-active],:is(${NAV_BARS}) [data-active] *{color:${role("primary")}}
[data-slot=navigation-bar] [data-active]::before{content:"";position:absolute;top:-1px;left:18%;right:18%;height:2px;background-color:${role("primary")};box-shadow:0 0 10px ${role("primary")}}`,
  block: `[data-slot=navigation-bar]{border-top:var(--st-edge) solid var(--st-line)}
[data-slot=nav-indicator]{border:var(--st-edge-thin) solid var(--st-line);background-color:${role("primary-container")}}
:is(${NAV_BARS}) [data-active] [data-slot=icon]{color:${role("on-primary-container")}}`,
};

/** the label stays inside the box: with no notch in the outline there is nothing for it to sit in */
const inside = (box: string, focus: string) => `[data-slot=text-field]>div:first-child{border-radius:var(--st-control-r);background-color:transparent;${box}}
[data-slot=text-field]:focus-within>div:first-child{${focus}}
[data-slot=text-field]>div:first-child>[aria-hidden]{display:none}
[data-slot=text-field] :is(input,textarea){padding-top:22px;padding-bottom:6px}
[data-slot=text-field][data-variant=outlined]:focus-within label,[data-slot=text-field][data-variant=outlined]:has(:is(input,textarea):not(:placeholder-shown)) label{translate:0 7px}
:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea]){border-radius:var(--st-control-r);${box}}
:is([data-slot=input],[data-slot=select-trigger],[data-slot=textarea]):focus-within{${focus}}`;

const FIELD_CSS: Record<Recipes["field"], string> = {
  m3: "",
  soft: inside(`background-color:${role("surface-container-highest")};border:0`, `box-shadow:0 0 0 2px ${role("primary")}`),
  boxed: inside(`background-color:${role("surface-container-low")};border:1px solid ${role("outline-variant")};border-bottom-color:${role("outline")}`, `border-bottom:2px solid ${role("primary")}`),
  hard: inside(`background-color:${role("surface-container-low")};border:var(--st-edge) solid var(--st-line)`, `box-shadow:3px 3px 0 var(--st-line)`),
  glow: inside(`background-color:${mix("primary", 6)};border:1px solid ${mix("primary", 55)}`, `border-color:${role("primary")};box-shadow:0 0 12px ${mix("primary", 50)}`),
};

const BAR_CSS: Record<Recipes["bar"], string> = {
  m3: "",
  center: `[data-slot=app-bar]{background-color:${mix("surface", 88)};border-bottom:1px solid ${role("outline-variant")}}
[data-slot=app-bar][data-size=small] h1{text-align:center;font-size:17px;font-weight:600;letter-spacing:0}`,
  line: `[data-slot=app-bar]{background-color:${role("surface-container-high")};border-bottom:var(--st-bar-line) solid var(--st-line)}`,
  glow: `[data-slot=app-bar]{background-color:${mix("surface-container", 88)};border-bottom:1px solid ${role("primary")};box-shadow:0 0 14px ${mix("primary", 30)}}
[data-slot=app-bar] h1{text-shadow:0 0 10px ${mix("primary", 60)}}`,
};

const QUIET = `[data-slot=ripple],.m3-ripple-host{display:none}`;
const PRESSABLE = `[data-slot=button],[data-slot=toggle],[data-slot=fab],[data-slot=extended-fab],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=tabs-trigger]`;
const FEEDBACK_CSS: Record<Recipes["feedback"], string> = {
  m3: "",
  dim: `${QUIET}\n:is(${PRESSABLE}):active{opacity:.62}`,
  press: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(.92)}`,
  flash: `${QUIET}\n:is(${PRESSABLE}):active{filter:brightness(1.35)}`,
};

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
  const squared = t.shape === "square" || t.shape === "none";
  const recipes = recipesOf(t);
  const anyRecipe = RECIPE_KEYS.some((k) => recipes[k] !== "m3");
  const display = t.displayFamily;
  if (!pack && !squared && !anyRecipe && !display) return "";

  /* the corner a button gets when its style names none: M3's pill, until the shape scale says the document is square */
  const control = pack?.control ?? (squared ? "small" : "pill");
  const pill = pack?.pill === "follow" || (t.shape === "none" && !pack) ? "follow" : (pack?.pill ?? "round");
  const controlR = control === "pill" ? "999px" : `var(--md-sys-shape-corner-${control})`;
  const edge = pack?.edge ?? 2;
  const vars = `--st-line:${role("outline")};--st-edge:${edge}px;--st-edge-thin:${Math.max(1, edge - 1)}px;--st-bar-line:${edge}px;--st-control-r:${controlR};--st-toggle-on:${pack?.toggleOn ?? role("primary")};`;

  const colors = pack && !t.ownColors && (!t.contrast || t.contrast === "standard") ? pack : undefined;
  const top = [
    `${at.scope}{${vars}${colors ? roleVars(colors.light, false) : ""}${display ? `--st-display:${display};` : ""}}`,
    colors ? `${at.dark}{${roleVars(colors.dark, true)}}` : "",
  ];
  const rules = [
    cornerCss(control, pill),
    BUTTON_CSS[recipes.button],
    SURFACE_CSS[recipes.surface],
    TABS_CSS[recipes.tabs],
    TOGGLE_CSS[recipes.toggle],
    SLIDER_CSS[recipes.slider],
    NAV_CSS[recipes.nav],
    FIELD_CSS[recipes.field],
    BAR_CSS[recipes.bar],
    FEEDBACK_CSS[recipes.feedback],
    display ? `:is([class*="text-display-"],[class*="text-headline-"],[class~="text-title-large"]){font-family:var(--st-display)}` : "",
    pack?.capsLabels ? `:is(${BUTTON},[data-slot=tabs-trigger]){text-transform:uppercase;letter-spacing:.08em}` : "",
  ].filter(Boolean);
  /* an exported screen and a style's sample are drawn by class, so a rule reaches them; on the canvas and in the
     preview a screen paints itself inline: see screenBackground */
  const backdrop = !colors
    ? []
    : [colors.screen ? `${at.scope} [data-backdrop]{background-image:${colors.screen}}` : "", colors.screenDark ?? colors.screen ? `${at.dark} [data-backdrop]{background-image:${colors.screenDark ?? colors.screen}}` : ""];
  return [...top, `${at.scope}{\n${rules.join("\n")}\n}`, ...backdrop].filter(Boolean).join("\n");
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
