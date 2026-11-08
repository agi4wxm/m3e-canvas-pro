/* Editor words for the retired parts (parts/defs/retired.ts): the notice over the canvas of a design that still holds
 * some, the line in the design panel of one selected, and what splitting them says. Kept on their own, with their own
 * lookup; every language has exactly the same keys (lib/i18n/retire.test.ts). */

import type { Lang } from "../i18n";

type Words = {
  noticeTitle: string;
  noticeBody: string;
  noticeSplit: string;
  noticeLater: string;
  splitDone: string;
  panelRetired: string;
};

export const RETIRE_TEXT: Record<Lang, Words> = {
  en: {
    noticeTitle: "{n} retired components in this design",
    noticeBody: "{names}: they look as they did, but keep their data to themselves, so a product cannot wire them. Split them into atoms: the same look, lists as data, taps as actions. One undo puts them back.",
    noticeSplit: "Split into atoms",
    noticeLater: "Not now",
    splitDone: "Split {n} retired components into atoms",
    panelRetired: "Retired: no longer offered. It looks as it did; split it to build on it with atoms, its rows as data.",
  },
  zh: {
    noticeTitle: "这个设计里有 {n} 个已退役的组件",
    noticeBody: "{names}：样子和以前一样，但数据都留在组件自己里，产品没法接上后端。拆成原子后外观不变，列表变成数据，点击变成动作；一次撤销可以恢复。",
    noticeSplit: "拆成原子",
    noticeLater: "暂不",
    splitDone: "已把 {n} 个退役组件拆成原子",
    panelRetired: "已退役：面板里不再提供。样子和以前一样；拆成原子后可以继续改，行变成数据。",
  },
  ja: {
    noticeTitle: "このデザインには廃止されたコンポーネントが {n} 個あります",
    noticeBody: "{names}：見た目は以前のままですが、データをコンポーネントの中に抱え込むため、プロダクトでは裏側につなげられません。アトムに分解すると、見た目はそのままで、リストはデータに、タップはアクションになります。1 回の取り消しで元に戻せます。",
    noticeSplit: "アトムに分解",
    noticeLater: "後で",
    splitDone: "廃止されたコンポーネント {n} 個をアトムに分解しました",
    panelRetired: "廃止：パレットには出てきません。見た目は以前のままです。アトムに分解すると、行をデータにして編集を続けられます。",
  },
  ko: {
    noticeTitle: "이 디자인에 지원이 끝난 구성 요소가 {n}개 있습니다",
    noticeBody: "{names}: 모습은 그대로지만 데이터를 구성 요소 안에만 두어 제품에서 백엔드와 연결할 수 없습니다. 원자로 분해하면 모습은 그대로이고 목록은 데이터가, 탭은 동작이 됩니다. 한 번 실행 취소로 되돌릴 수 있습니다.",
    noticeSplit: "원자로 분해",
    noticeLater: "나중에",
    splitDone: "지원이 끝난 구성 요소 {n}개를 원자로 분해했습니다",
    panelRetired: "지원 종료: 더 이상 패널에 나오지 않습니다. 모습은 그대로이며, 원자로 분해하면 행을 데이터로 두고 계속 편집할 수 있습니다.",
  },
};

export const retireText = (key: keyof Words, lang: Lang): string => RETIRE_TEXT[lang][key] ?? RETIRE_TEXT.en[key];
