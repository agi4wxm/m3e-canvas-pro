/* Editor words for the retired parts (parts/defs/retired.ts): the notice over the canvas of a design that still holds
 * some, the line in the design panel of one selected, and what splitting them says. A retired resizable converts to a
 * split view rather than splitting into atoms, so it has words of its own. Kept on their own, with their own lookup;
 * every language has exactly the same keys (lib/i18n/retire.test.ts). */

import type { Lang } from "../i18n";

type Words = {
  noticeTitle: string;
  noticeBody: string;
  noticeConvert: string;
  noticeConvertOnly: string;
  noticeSplit: string;
  noticeConvertButton: string;
  noticeLater: string;
  splitDone: string;
  panelRetired: string;
  panelRetiredConvert: string;
};

export const RETIRE_TEXT: Record<Lang, Words> = {
  en: {
    noticeTitle: "{n} retired components in this design",
    noticeBody: "{names}: they look as they did, but keep their data to themselves, so a product cannot wire them. Split them into atoms: the same look, lists as data, taps as actions. One undo puts them back.",
    noticeConvert: "A resizable becomes a split view, its panes holding what lay over each panel.",
    noticeConvertOnly: "{names}: they look as they did, but their panels hold only words. Convert them to split views, whose panes hold what lay over each panel. One undo puts them back.",
    noticeSplit: "Split into atoms",
    noticeConvertButton: "Convert to split view",
    noticeLater: "Not now",
    splitDone: "Replaced {n} retired components",
    panelRetired: "Retired: no longer offered. It looks as it did; split it to build on it with atoms, its rows as data.",
    panelRetiredConvert: "Retired: no longer offered. It looks as it did; convert it to a split view, whose panes hold parts.",
  },
  zh: {
    noticeTitle: "这个设计里有 {n} 个已退役的组件",
    noticeBody: "{names}：样子和以前一样，但数据都留在组件自己里，产品没法接上后端。拆成原子后外观不变，列表变成数据，点击变成动作；一次撤销可以恢复。",
    noticeConvert: "可调整面板会转为分栏视图，原来压在每一栏上的部件放进对应的栏里。",
    noticeConvertOnly: "{names}：样子和以前一样，但面板里只能放文字。转为分栏视图后，原来压在每一栏上的部件放进对应的栏里；一次撤销可以恢复。",
    noticeSplit: "拆成原子",
    noticeConvertButton: "转为分栏视图",
    noticeLater: "暂不",
    splitDone: "已替换 {n} 个退役组件",
    panelRetired: "已退役：面板里不再提供。样子和以前一样；拆成原子后可以继续改，行变成数据。",
    panelRetiredConvert: "已退役：面板里不再提供。样子和以前一样；转为分栏视图后，两栏里可以放部件。",
  },
  ja: {
    noticeTitle: "このデザインには廃止されたコンポーネントが {n} 個あります",
    noticeBody: "{names}：見た目は以前のままですが、データをコンポーネントの中に抱え込むため、プロダクトでは裏側につなげられません。アトムに分解すると、見た目はそのままで、リストはデータに、タップはアクションになります。1 回の取り消しで元に戻せます。",
    noticeConvert: "リサイズ可能パネルは分割ビューになり、各パネルに重ねてあったパーツはそのペインに入ります。",
    noticeConvertOnly: "{names}：見た目は以前のままですが、パネルには文字しか置けません。分割ビューに変換すると、各パネルに重ねてあったパーツがそのペインに入ります。1 回の取り消しで元に戻せます。",
    noticeSplit: "アトムに分解",
    noticeConvertButton: "分割ビューに変換",
    noticeLater: "後で",
    splitDone: "廃止されたコンポーネント {n} 個を置き換えました",
    panelRetired: "廃止：パレットには出てきません。見た目は以前のままです。アトムに分解すると、行をデータにして編集を続けられます。",
    panelRetiredConvert: "廃止：パレットには出てきません。見た目は以前のままです。分割ビューに変換すると、2 つのペインにパーツを置けます。",
  },
  ko: {
    noticeTitle: "이 디자인에 지원이 끝난 구성 요소가 {n}개 있습니다",
    noticeBody: "{names}: 모습은 그대로지만 데이터를 구성 요소 안에만 두어 제품에서 백엔드와 연결할 수 없습니다. 원자로 분해하면 모습은 그대로이고 목록은 데이터가, 탭은 동작이 됩니다. 한 번 실행 취소로 되돌릴 수 있습니다.",
    noticeConvert: "크기 조절 패널은 분할 보기가 되고, 각 패널 위에 있던 파트는 해당 창으로 들어갑니다.",
    noticeConvertOnly: "{names}: 모습은 그대로지만 패널에는 글자만 둘 수 있습니다. 분할 보기로 변환하면 각 패널 위에 있던 파트가 해당 창으로 들어갑니다. 한 번 실행 취소로 되돌릴 수 있습니다.",
    noticeSplit: "원자로 분해",
    noticeConvertButton: "분할 보기로 변환",
    noticeLater: "나중에",
    splitDone: "지원이 끝난 구성 요소 {n}개를 바꿨습니다",
    panelRetired: "지원 종료: 더 이상 패널에 나오지 않습니다. 모습은 그대로이며, 원자로 분해하면 행을 데이터로 두고 계속 편집할 수 있습니다.",
    panelRetiredConvert: "지원 종료: 더 이상 패널에 나오지 않습니다. 모습은 그대로이며, 분할 보기로 변환하면 두 창에 파트를 둘 수 있습니다.",
  },
};

export const retireText = (key: keyof Words, lang: Lang): string => RETIRE_TEXT[lang][key] ?? RETIRE_TEXT.en[key];
