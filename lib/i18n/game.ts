/* Editor words for the gameplay contract (lib/game, docs/玩法契约.md): importing the game loop's contract file and what
 * reading it again came to. Each entry has ja, en and zh; Korean is in the matching `GAME_KO` below, with exactly the
 * same keys. */

type Str = { ja: string; en: string; zh: string };

export const GAME_UI = {
  gcImport: { ja: "ゲーム契約を読み込む…", en: "Import game contract…", zh: "导入玩法契约…" },
  gcImportHint: { ja: "game-loop が書いた .m3e-game.json を読み取り専用でつなぎます。コマンドは game.* の操作に、拒否コードはエラーの種類になります", en: "Links the game loop's .m3e-game.json, read-only: its commands become game.* operations and its rejection codes problem types", zh: "只读接入 game-loop 输出的 .m3e-game.json：命令变成 game.* 接口操作，拒绝码变成错误类型" },
  gcImported: { ja: "ゲーム契約 {version} をつなぎました", en: "Linked game contract {version}", zh: "已接入玩法契约 {version}" },
  gcBroke: { ja: "ゲーム契約 {version}：デザインの {n} か所が契約に合わなくなりました", en: "Game contract {version}: {n} references in the design no longer match it", zh: "玩法契约 {version}：设计里有 {n} 处引用和契约不再对应" },
  gcInvalid: { ja: "読み込めるゲーム契約ではありません（m3e-game バージョン 1）", en: "Not a game contract this version can read (m3e-game, version 1)", zh: "不是可以读取的玩法契约（m3e-game 版本 1）" },
  gcMissing: { ja: "ゲーム契約 {path} がフォルダに見つかりません。前回の契約のままです", en: "The game contract {path} is not in the folder: the one read last is kept", zh: "文件夹里找不到玩法契约 {path}，沿用上次读到的契约" },
} as const satisfies Record<string, Str>;

export const GAME_KO: Record<keyof typeof GAME_UI, string> = {
  gcImport: "게임 계약 가져오기…",
  gcImportHint: "game-loop가 쓴 .m3e-game.json을 읽기 전용으로 연결합니다. 명령은 game.* 작업이 되고 거부 코드는 오류 유형이 됩니다",
  gcImported: "게임 계약 {version}을(를) 연결했습니다",
  gcBroke: "게임 계약 {version}: 디자인의 {n}곳이 계약과 더 이상 맞지 않습니다",
  gcInvalid: "읽을 수 있는 게임 계약이 아닙니다(m3e-game 버전 1)",
  gcMissing: "폴더에 게임 계약 {path}이(가) 없습니다. 마지막으로 읽은 계약을 유지합니다",
};
