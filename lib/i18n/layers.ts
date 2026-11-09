/* Editor words for screens in layers (docs/交互规则.md “分层”): the screen panel's layer, the page a HUD stands over, a
 * dialog that pauses the world, and a part of a HUD that covers the world. Spread into `UI` and `KO` in lib/i18n.ts;
 * each entry has ja, en and zh, and Korean is in `LAYERS_KO` below with exactly the same keys. */

export const LAYERS_UI = {
  screenLayer: { ja: "レイヤー", en: "Layer", zh: "层" },
  screenLayerPage: { ja: "ページ（重ねない）", en: "Page (not laid over)", zh: "页面（不叠放）" },
  screenLayerWorld: { ja: "ワールド", en: "World", zh: "世界层" },
  screenLayerHud: { ja: "HUD", en: "HUD", zh: "HUD 层" },
  screenLayerDialog: { ja: "ダイアログ", en: "Dialog", zh: "弹窗层" },
  screenLayerToast: { ja: "トースト", en: "Toast", zh: "提示层" },
  screenLayerHint: {
    ja: "HUD・ダイアログ・トーストは開くと表示中の画面に重なり、置き換えません。戻ると一番上の層が閉じます。",
    en: "A HUD, a dialog or a toast is laid over the screen on show when it opens, instead of taking its place; going back closes the topmost layer.",
    zh: "HUD、弹窗、提示层打开时叠在正显示的屏幕上，不替换它；返回关掉最上面一层。",
  },
  screenLayerOver: { ja: "常に重ねる画面", en: "Stands over", zh: "跟着这个屏幕显示" },
  screenLayerOverNone: { ja: "なし（タップで開く）", en: "None (a tap opens it)", zh: "无（点击打开）" },
  screenLayerPauses: { ja: "開いている間ワールドを一時停止", en: "Pause the world while open", zh: "打开时暂停世界" },
  partOccludes: { ja: "ワールドを覆う", en: "Covers the world", zh: "挡住世界" },
  partOccludesHint: {
    ja: "HUD の上で、覆う部品はタッチを受け取り、その範囲をワールドに伝えます。覆わない部品はタッチを下のワールドに通します。",
    en: "On a HUD, a part that covers the world takes the touches that land on it and the world is told where it is; one that does not lets touches through to the world.",
    zh: "在 HUD 上，挡住世界的部件接住落在它上面的触摸，世界会知道它的区域；不挡的部件让触摸穿到下面的世界。",
  },
};

type Keys = keyof typeof LAYERS_UI;

export const LAYERS_KO: Record<Keys, string> = {
  screenLayer: "레이어",
  screenLayerPage: "페이지(겹치지 않음)",
  screenLayerWorld: "월드",
  screenLayerHud: "HUD",
  screenLayerDialog: "대화상자",
  screenLayerToast: "토스트",
  screenLayerHint: "HUD, 대화상자, 토스트는 열리면 표시 중인 화면 위에 겹치며 화면을 바꾸지 않습니다. 뒤로 가면 맨 위 레이어가 닫힙니다.",
  screenLayerOver: "항상 겹칠 화면",
  screenLayerOverNone: "없음(탭으로 열기)",
  screenLayerPauses: "열려 있는 동안 월드 일시 정지",
  partOccludes: "월드를 가림",
  partOccludesHint: "HUD 위에서 월드를 가리는 부품은 그 위의 터치를 받고 월드에 영역을 알립니다. 가리지 않는 부품은 터치를 아래 월드로 통과시킵니다.",
};
