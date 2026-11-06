/* Editor words for one area of work, kept in their own file and spread into `UI` and `KO` in lib/i18n.ts.
 * Each entry has ja, en and zh; Korean is in the matching `STYLES_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const STYLES_UI = {
  styleGallery: { ja: "このスタイルで全部品を見る", en: "See every part in this style", zh: "在这个风格下查看全部组件" },
} as const satisfies Record<string, Str>;

export const STYLES_KO: Record<keyof typeof STYLES_UI, string> = {
  styleGallery: "이 스타일로 모든 컴포넌트 보기",
};
