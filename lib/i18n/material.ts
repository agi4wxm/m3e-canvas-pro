/* Editor words for the document's materials (lib/materials.ts, docs/m3e-material.md): the material layer of a look and
 * the library. Each entry has ja, en and zh; Korean is in the matching `MATERIAL_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const MATERIAL_UI = {
  lkMaterial: { ja: "マテリアル", en: "Material", zh: "材质" },
  mtImport: { ja: "マテリアルを読み込む…", en: "Import materials…", zh: "导入材质…" },
  mtImportHint: { ja: "Material Pro の .m3e-material.json をドキュメントのライブラリに追加します（プロジェクトは置き換えません）", en: "Adds a Material Pro .m3e-material.json to the document's library (the project is not replaced)", zh: "把 Material Pro 的 .m3e-material.json 加进文档的材质库（不替换工程）" },
  mtImported: { ja: "マテリアルを {n} 個追加しました", en: "Added {n} materials", zh: "已添加 {n} 个材质" },
  mtInvalid: { ja: "読み込めるマテリアルパックではありません", en: "Not a material pack this version can read", zh: "不是可以读取的材质包" },
  mtNone: { ja: "ライブラリにマテリアルがありません。マテリアルパックを読み込んでください。", en: "The library has no materials yet. Import a material pack.", zh: "材质库里还没有材质。请先导入材质包。" },
  mtLibrary: { ja: "マテリアルライブラリ", en: "Material library", zh: "材质库" },
  mtMissing: { ja: "ライブラリにないマテリアル（描画されません）", en: "Not in the library (draws nothing)", zh: "材质库里没有（不绘制）" },
  mtModeSurface: { ja: "そのまま", en: "As it is", zh: "原样" },
  mtModeTint: { ja: "色付け", en: "Tinted", zh: "染色" },
  mtTint: { ja: "色付けの色", en: "Tint", zh: "染色颜色" },
  mtTintAverage: { ja: "マテリアルの平均色", en: "The material's average colour", zh: "材质的平均色" },
  mtScale: { ja: "拡大率", en: "Scale", zh: "缩放" },
  mtOffsetX: { ja: "ずらし X", en: "Offset X", zh: "偏移 X" },
  mtOffsetY: { ja: "ずらし Y", en: "Offset Y", zh: "偏移 Y" },
  mtRemove: { ja: "ライブラリから削除", en: "Remove from library", zh: "从材质库删除" },
  mtRemoveAsk: { ja: "「{name}」を削除しますか？", en: "Remove “{name}”?", zh: "删除“{name}”？" },
  mtRemoveUsed: { ja: "{n} 個のレイヤーがまだ使っています。削除するとそれらは描画されなくなります。", en: "{n} layers still use it. Once it is removed they draw nothing.", zh: "仍有 {n} 个图层在引用它。删除后这些图层不再绘制。" },
  mtRemoveUnused: { ja: "どのレイヤーも使っていません。", en: "No layer uses it.", zh: "没有图层引用它。" },
} as const satisfies Record<string, Str>;

export const MATERIAL_KO: Record<keyof typeof MATERIAL_UI, string> = {
  lkMaterial: "머티리얼",
  mtImport: "머티리얼 가져오기…",
  mtImportHint: "Material Pro의 .m3e-material.json을 문서 라이브러리에 추가합니다(프로젝트를 바꾸지 않습니다)",
  mtImported: "머티리얼 {n}개를 추가했습니다",
  mtInvalid: "읽을 수 있는 머티리얼 팩이 아닙니다",
  mtNone: "라이브러리에 머티리얼이 없습니다. 머티리얼 팩을 가져오세요.",
  mtLibrary: "머티리얼 라이브러리",
  mtMissing: "라이브러리에 없음(그려지지 않음)",
  mtModeSurface: "그대로",
  mtModeTint: "색 입히기",
  mtTint: "입힐 색",
  mtTintAverage: "머티리얼의 평균 색",
  mtScale: "배율",
  mtOffsetX: "오프셋 X",
  mtOffsetY: "오프셋 Y",
  mtRemove: "라이브러리에서 삭제",
  mtRemoveAsk: "“{name}”을(를) 삭제할까요?",
  mtRemoveUsed: "아직 레이어 {n}개가 사용합니다. 삭제하면 그 레이어는 그려지지 않습니다.",
  mtRemoveUnused: "사용하는 레이어가 없습니다.",
};
