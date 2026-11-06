/* Editor words for one area of work, kept in their own file and spread into `UI` and `KO` in lib/i18n.ts.
 * Each entry has ja, en and zh; Korean is in the matching `KITS_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const KITS_UI = {
  tierAtoms: { ja: "アトム", en: "Atoms", zh: "原子组件" },
  tierComposites: { ja: "コンポジット", en: "Composites", zh: "组合组件" },
  tierPick: { ja: "部品の層", en: "Tier of parts", zh: "组件层级" },
  kitMark: { ja: "アトム", en: "Atoms", zh: "原子" },
  kitMarkHint: { ja: "アトムを組み合わせた部品です。追加すると、一つずつ編集できます", en: "Made of atoms: once added, every piece can be edited on its own", zh: "由原子组件拼成：加入后每一块都能单独编辑" },
  splitMark: { ja: "分解可", en: "Splits", zh: "可拆" },
  splitMarkHint: { ja: "まとめて追加されます。インスペクターでアトムに分解できます", en: "Added whole; the inspector can split it into atoms", zh: "整体加入，可在检查器中拆分为原子组件" },
  kitVariants: { ja: "バリエーション", en: "Variants", zh: "变体" },
  kitSuits: { ja: "このスタイル向け", en: "Suits this style", zh: "适合当前风格" },
  kitOpenVariants: { ja: "バリエーションを選ぶ", en: "Choose a variant", zh: "选择变体" },
  splitAtoms: { ja: "アトムに分解", en: "Split into atoms", zh: "拆分为原子组件" },
  splitAtomsHint: { ja: "同じ場所に、ボックスと文字・アイコンなどの組み合わせとして置き換えます", en: "Replaces it in place with the boxes, words and icons it is made of", zh: "在原位置替换为它由盒子、文字、图标等组成的结构" },
  splitDone: { ja: "アトムに分解しました", en: "Split into atoms", zh: "已拆分为原子组件" },
} as const satisfies Record<string, Str>;

export const KITS_KO: Record<keyof typeof KITS_UI, string> = {
  tierAtoms: "원자 구성 요소",
  tierComposites: "조합 구성 요소",
  tierPick: "구성 요소 단계",
  kitMark: "원자",
  kitMarkHint: "원자 구성 요소로 만든 조합입니다. 추가하면 하나씩 편집할 수 있습니다",
  splitMark: "분해 가능",
  splitMarkHint: "통째로 추가되며, 인스펙터에서 원자 구성 요소로 분해할 수 있습니다",
  kitVariants: "변형",
  kitSuits: "이 스타일에 맞음",
  kitOpenVariants: "변형 선택",
  splitAtoms: "원자 구성 요소로 분해",
  splitAtomsHint: "같은 자리에서 상자, 글자, 아이콘 등의 조합으로 바꿉니다",
  splitDone: "원자 구성 요소로 분해했습니다",
};
