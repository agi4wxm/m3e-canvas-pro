/* Editor words for one area of work, kept in their own file and spread into `UI` and `KO` in lib/i18n.ts.
 * Each entry has ja, en and zh; Korean is in the matching `EDITOR_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const EDITOR_UI = {
  /* a style put on: what it took off the parts that wore their own look */
  styleStripped: {
    ja: "「{style}」の規定に合わせて、{n} 個の部品の独自の見た目を外しました",
    en: "Removed the custom look of {n} parts to follow {style}",
    zh: "已按「{style}」规范移除 {n} 个组件的自定义外观",
  },
  /* the phone's button that opens the parts */
  addParts: { ja: "部品を追加", en: "Add parts", zh: "添加组件" },
} as const satisfies Record<string, Str>;

export const EDITOR_KO: Record<keyof typeof EDITOR_UI, string> = {
  styleStripped: "「{style}」 규칙에 맞춰 {n}개 구성 요소의 사용자 지정 모양을 제거했습니다",
  addParts: "구성 요소 추가",
};
