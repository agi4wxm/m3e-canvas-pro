/* Editor words for what the modules outside M3E do not deliver (lib/export/gaps.ts, docs/导出.md “缺口文件”): the kinds
 * of the export report's gaps, and what reading the hub's contract index came to (lib/hub/contractIndex.ts). Each entry
 * has ja, en and zh; Korean is in the matching `HUB_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const HUB_UI = {
  exportDiff_asset: { ja: "マニフェストにないアセット", en: "assets the manifest lacks", zh: "资产清单里没有的资产" },
  exportDiff_game: { ja: "ゲーム契約にない参照", en: "references the game contract lacks", zh: "玩法契约里没有的引用" },
  exportDiff_data: { ja: "古くなったリンクデータ", en: "stale linked data", zh: "过期的链接数据" },
  exportDiff_contract: { ja: "ハブと違う契約バージョン", en: "contract versions the hub differs on", zh: "和中枢不一致的契约版本" },
  hubMismatch: { ja: "ハブの契約インデックスでは {module} は {version} ですが、デザインは {was} に合わせて書かれています。契約を読み込み直してください", en: "The hub's contract index has {module} at {version}; the design is written to {was}: import that contract again", zh: "中枢的契约索引里 {module} 是 {version}，设计按 {was} 写：请重新导入契约" },
  hubUnlisted: { ja: "ハブの契約インデックスに名前空間 {namespace} がありません", en: "The hub's contract index does not list the namespace {namespace}", zh: "中枢的契约索引里没有命名空间 {namespace}" },
  hubMissing: { ja: "ハブの契約インデックス {path} がフォルダに見つかりません", en: "The hub's contract index {path} is not in the folder", zh: "文件夹里找不到中枢的契约索引 {path}" },
  hubInvalid: { ja: "{path} は読み込める契約インデックスではありません（m3e-contract-index バージョン 1）", en: "{path} is not a contract index this version can read (m3e-contract-index, version 1)", zh: "{path} 不是可以读取的契约索引（m3e-contract-index 版本 1）" },
} as const satisfies Record<string, Str>;

export const HUB_KO: Record<keyof typeof HUB_UI, string> = {
  exportDiff_asset: "매니페스트에 없는 에셋",
  exportDiff_game: "게임 계약에 없는 참조",
  exportDiff_data: "오래된 연결 데이터",
  exportDiff_contract: "허브와 다른 계약 버전",
  hubMismatch: "허브의 계약 색인에서 {module}은(는) {version}이지만 디자인은 {was}에 맞춰 작성되었습니다. 계약을 다시 가져오세요",
  hubUnlisted: "허브의 계약 색인에 네임스페이스 {namespace}이(가) 없습니다",
  hubMissing: "폴더에 허브의 계약 색인 {path}이(가) 없습니다",
  hubInvalid: "{path}은(는) 읽을 수 있는 계약 색인이 아닙니다(m3e-contract-index 버전 1)",
};
