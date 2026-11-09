/* Editor words for the game loop's fixtures (lib/game/fixture.ts, docs/玩法契约.md “fixture”): importing a known state
 * of the game as a mock scene, and what that came to. Each entry has ja, en and zh; Korean is in the matching
 * `FIXTURE_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const FIXTURE_UI = {
  gfImport: { ja: "ゲームのフィクスチャを読み込む…", en: "Import game fixture…", zh: "导入游戏 fixture…" },
  gfImportHint: { ja: "game-loop が書いた .m3e-fixture.json（ゲームのある状態）をモックの場面にします。プレビューはその状態から始まります", en: "Turns the game loop's .m3e-fixture.json, one known state of the game, into a mock scene the preview starts in", zh: "把 game-loop 输出的 .m3e-fixture.json（一个确定的游戏状态）变成模拟场景，预览从这个状态开始" },
  gfImported: { ja: "フィクスチャ「{name}」の場面をプレビューで使います", en: "The preview now starts in the fixture “{name}”", zh: "预览现在从 fixture“{name}”开始" },
  gfVersion: { ja: "フィクスチャ「{name}」は契約 {fixture} 向けで、つないでいる契約は {contract} です", en: "The fixture “{name}” was written for contract {fixture}; the linked contract is {contract}", zh: "fixture“{name}”是按契约 {fixture} 写的，当前接入的契约是 {contract}" },
  gfInvalid: { ja: "読み込めるフィクスチャではないか、つないでいるゲーム契約に合いません", en: "Not a game fixture this version reads, or it does not match the linked game contract", zh: "不是可以读取的 fixture，或者和接入的玩法契约对不上" },
} as const satisfies Record<string, Str>;

export const FIXTURE_KO: Record<keyof typeof FIXTURE_UI, string> = {
  gfImport: "게임 픽스처 가져오기…",
  gfImportHint: "game-loop가 쓴 .m3e-fixture.json(게임의 한 상태)을 목업 장면으로 만듭니다. 미리보기는 그 상태에서 시작합니다",
  gfImported: "이제 미리보기가 픽스처 “{name}”에서 시작합니다",
  gfVersion: "픽스처 “{name}”은(는) 계약 {fixture}용이고, 연결된 계약은 {contract}입니다",
  gfInvalid: "읽을 수 있는 게임 픽스처가 아니거나 연결된 게임 계약과 맞지 않습니다",
};
