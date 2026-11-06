/* Editor words for exporting: the choice between the prototype project and the whole product (a monorepo), exporting
 * the product into a folder on this computer and again into the same one, and the report of what that did. Kept in
 * their own file and spread into `UI` and `KO` in lib/i18n.ts; Korean is in `EXPORT_KO` below, with exactly the same
 * keys. Custom code is "custom code (written by people or AI)", never "hand-written". */

type Str = { ja: string; en: string; zh: string };

export const EXPORT_UI = {
  exportKind: { ja: "書き出す内容", en: "What to export", zh: "导出内容" },
  exportPrototype: { ja: "プロトタイプ", en: "Prototype project", zh: "原型项目" },
  exportProduct: { ja: "完全なプロダクト（monorepo）", en: "Whole product (monorepo)", zh: "完整产品（monorepo）" },
  exportPrototypeHint: { ja: "画面とタップの動きだけの React アプリ 1 つ。", en: "One React app: the screens and what taps do.", zh: "一个 React 应用：屏幕和点击后的行为。" },
  exportProductHint: {
    ja: "Web アプリ、API 契約とクライアント、モック、サーバーの骨組みをひとつのリポジトリに。もう一度書き出してもカスタムコード（人や AI が書いたもの）は消えません。",
    en: "The web app, the API contract and client, the mocks and a server skeleton in one repository. Exporting again never erases custom code (written by people or AI).",
    zh: "Web 应用、接口契约和客户端、模拟库、后端骨架放在同一个仓库里。重新导出不会删掉自定义代码（人或 AI 写的）。",
  },
  exportToFolder: { ja: "フォルダに書き出す…", en: "Export to folder…", zh: "导出到文件夹…" },
  exportToFolderTitle: { ja: "このコンピュータのフォルダに書き出します。あとで同じフォルダにもう一度書き出せます", en: "Write it into a folder on this computer; you can export into the same folder again later", zh: "写入这台电脑上的文件夹，以后可以再次导出到同一个文件夹" },
  exportAgain: { ja: "{name} に再書き出し", en: "Export again to {name}", zh: "再次导出到 {name}" },
  exportOtherFolder: { ja: "別のフォルダ…", en: "Another folder…", zh: "换一个文件夹…" },
  exportZip: { ja: "zip をダウンロード", en: "Download zip", zh: "下载 zip" },
  exportZipTitle: { ja: "プロダクト全体を zip で保存します", en: "Save the whole product as a zip", zh: "把完整产品保存为 zip" },
  exportNoFolderApi: { ja: "このブラウザはフォルダに書き込めません。zip をダウンロードしてください。", en: "This browser cannot write into a folder: download the zip.", zh: "这个浏览器不能写入文件夹，请下载 zip。" },
  exportFolderNotEmpty: {
    ja: "このフォルダは空ではなく、書き出したプロダクトでもありません。もう一度押すとここに書き出します（同じ名前の生成ファイルは上書きせず .m3e-new として横に書きます）。",
    en: "This folder is not empty and holds no exported product. Press again to export into it anyway (a generated file with a name already there is not overwritten: it is written beside it as .m3e-new).",
    zh: "这个文件夹不是空的，也不是导出过的产品。再按一次就导出到这里（同名的生成文件不会覆盖，写在旁边的 .m3e-new）。",
  },
  exportFolderDenied: { ja: "ブラウザがこのフォルダへの書き込みを許可しませんでした。", en: "The browser did not allow writing into this folder.", zh: "浏览器没有允许写入这个文件夹。" },
  exportWriting: { ja: "書き込み中… {done} / {total}", en: "Writing… {done} of {total}", zh: "正在写入… {done} / {total}" },
  exportReport: {
    ja: "{folder} に書き出しました: {written} 件書き込み、{unchanged} 件変更なし、カスタムコード {kept} 件をそのまま保持、{removed} 件削除。",
    en: "Exported to {folder}: {written} written, {unchanged} unchanged, {kept} custom kept as they were, {removed} removed.",
    zh: "已导出到 {folder}：写入 {written} 个，未变 {unchanged} 个，保留自定义代码 {kept} 个，删除 {removed} 个。",
  },
  exportConflicts: {
    ja: "手で変更された生成ファイル {n} 件は上書きしていません。新しい版は横の .m3e-new にあります:",
    en: "{n} generated files were changed by hand and are not overwritten; the new versions are beside them as .m3e-new:",
    zh: "{n} 个生成文件被手动改过，没有覆盖，新版本写在旁边的 .m3e-new：",
  },
  exportOrphaned: { ja: "生成しなくなったが変更されていたため残したファイル:", en: "No longer generated, but changed, so left in place:", zh: "不再生成、但被改过，所以留在原处：" },
  exportCustomOrphans: {
    ja: "デザインにもう無いもののカスタムコード（どこからも使われず、削除するまで残ります）:",
    en: "Custom code for what the design no longer has (nothing uses it; it stays until you delete it):",
    zh: "设计里已经没有的东西的自定义代码（不再被使用，删除之前一直留着）：",
  },
  exportMerged: { ja: "追加された依存関係を保持した package.json: {n} 件。", en: "package.json files that keep dependencies someone added: {n}.", zh: "保留了新增依赖的 package.json：{n} 个。" },
} as const satisfies Record<string, Str>;

export const EXPORT_KO: Record<keyof typeof EXPORT_UI, string> = {
  exportKind: "내보낼 내용",
  exportPrototype: "프로토타입 프로젝트",
  exportProduct: "전체 제품(monorepo)",
  exportPrototypeHint: "React 앱 하나: 화면과 탭했을 때의 동작.",
  exportProductHint: "웹 앱, API 계약과 클라이언트, 목(mock), 서버 골격을 하나의 저장소에. 다시 내보내도 사용자 정의 코드(사람이나 AI가 작성)는 지워지지 않습니다.",
  exportToFolder: "폴더로 내보내기…",
  exportToFolderTitle: "이 컴퓨터의 폴더에 씁니다. 나중에 같은 폴더로 다시 내보낼 수 있습니다",
  exportAgain: "{name}(으)로 다시 내보내기",
  exportOtherFolder: "다른 폴더…",
  exportZip: "zip 다운로드",
  exportZipTitle: "전체 제품을 zip으로 저장합니다",
  exportNoFolderApi: "이 브라우저는 폴더에 쓸 수 없습니다. zip을 다운로드하세요.",
  exportFolderNotEmpty: "이 폴더는 비어 있지 않고 내보낸 제품도 아닙니다. 한 번 더 누르면 여기로 내보냅니다(같은 이름의 생성 파일은 덮어쓰지 않고 옆에 .m3e-new로 씁니다).",
  exportFolderDenied: "브라우저가 이 폴더에 쓰는 것을 허용하지 않았습니다.",
  exportWriting: "쓰는 중… {done} / {total}",
  exportReport: "{folder}(으)로 내보냈습니다: {written}개 씀, {unchanged}개 그대로, 사용자 정의 코드 {kept}개 유지, {removed}개 삭제.",
  exportConflicts: "생성 파일 {n}개가 직접 수정되어 덮어쓰지 않았습니다. 새 버전은 옆의 .m3e-new에 있습니다:",
  exportOrphaned: "더 이상 생성되지 않지만 수정되어 그대로 둔 파일:",
  exportCustomOrphans: "디자인에 더 이상 없는 것의 사용자 정의 코드(아무 데서도 쓰지 않으며, 지울 때까지 남습니다):",
  exportMerged: "추가된 의존성을 유지한 package.json: {n}개.",
};
