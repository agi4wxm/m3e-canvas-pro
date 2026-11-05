/* What people type into the palette's search that is not a part's own name. Each line is one idea, in every language the
 * editor speaks; a search that is (part of) one of its words finds whatever is called by any of the others. A person
 * looking for an input box types 输入框 and expects the text field, the multi-line input and the search bar too. */

const SYNONYMS: string[][] = [
  ["输入框", "输入栏", "文本框", "多行输入", "搜索栏", "input", "text field", "textarea", "text box", "composer", "prompt", "入力", "入力欄", "テキストフィールド", "입력", "입력창", "텍스트 필드"],
  ["按钮", "button", "ボタン", "버튼"],
  ["弹窗", "对话框", "弹出框", "弹出层", "dialog", "modal", "popup", "ダイアログ", "モーダル", "ポップアップ", "대화상자", "팝업", "모달"],
  ["列表", "列表项", "list", "リスト", "목록"],
  ["导航", "导航栏", "标签栏", "底栏", "tab bar", "navigation", "ナビゲーション", "タブバー", "내비게이션", "탭 바"],
  ["搜索", "search", "検索", "검색"],
  ["开关", "switch", "toggle", "スイッチ", "トグル", "스위치", "토글"],
  ["图片", "图像", "照片", "image", "picture", "photo", "画像", "写真", "이미지", "사진"],
  ["头像", "avatar", "アバター", "아바타"],
  ["卡片", "card", "カード", "카드"],
  ["提示", "通知", "消息提示", "toast", "snackbar", "alert", "notice", "トースト", "알림"],
  ["加载", "进度", "loading", "spinner", "progress", "ローディング", "進捗", "로딩", "진행률"],
  ["聊天", "消息", "气泡", "chat", "message", "bubble", "チャット", "メッセージ", "채팅", "메시지"],
  ["下拉", "选择器", "下拉菜单", "select", "dropdown", "picker", "セレクト", "ドロップダウン", "선택", "드롭다운"],
  ["标签", "纸片", "徽章", "tag", "chip", "badge", "タグ", "チップ", "バッジ", "태그", "칩", "배지"],
  ["图标", "icon", "アイコン", "아이콘"],
  ["文字", "文本", "テキスト", "텍스트"],
];

/** Every word to look for when someone searches `query`: the query itself, and the other words of each idea it is part
 *  of. A query of one or two Latin letters is too short to mean an idea, so it stays alone. */
export function searchTerms(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const latin = /^[\x20-\x7e]+$/.test(q);
  if (latin ? q.length < 3 : q.length < 2) return [q];
  const more = SYNONYMS.filter((line) => line.some((w) => w.toLowerCase().includes(q))).flat();
  return [...new Set([q, ...more.map((w) => w.toLowerCase())])];
}
