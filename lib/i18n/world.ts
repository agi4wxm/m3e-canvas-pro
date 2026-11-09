/* Editor words for the world view's input actions (docs/交互规则.md “输入动作”): the move, press and release effects in
 * the effects panel. Spread into `UI` and `KO` in lib/i18n.ts; each entry has ja, en and zh, and Korean is in
 * `WORLD_KO` below with exactly the same keys. */

export const WORLD_UI = {
  worldEffMove: { ja: "ワールドに方向を送る", en: "Send a world a direction", zh: "给世界发送方向" },
  worldEffPress: { ja: "ワールドの入力を押す", en: "Press a world's input", zh: "按下世界的输入" },
  worldEffRelease: { ja: "ワールドの入力を離す", en: "Let go of a world's input", zh: "松开世界的输入" },
  worldView: { ja: "ワールドビュー", en: "World view", zh: "世界视口" },
  worldAction: { ja: "入力アクション", en: "Input action", zh: "输入动作" },
  worldVector: { ja: "方向（x,y、例: event）", en: "Direction (x,y; e.g. event)", zh: "方向（x,y，例如 event）" },
  worldNoViews: { ja: "画面にワールドビューがありません。", en: "No world view is on a screen.", zh: "屏幕上还没有世界视口。" },
};

type Keys = keyof typeof WORLD_UI;

export const WORLD_KO: Record<Keys, string> = {
  worldEffMove: "월드에 방향 보내기",
  worldEffPress: "월드 입력 누르기",
  worldEffRelease: "월드 입력 떼기",
  worldView: "월드 뷰",
  worldAction: "입력 동작",
  worldVector: "방향(x,y, 예: event)",
  worldNoViews: "화면에 월드 뷰가 없습니다.",
};
