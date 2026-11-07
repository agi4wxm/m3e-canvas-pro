/* The words the app being designed says on its own, in the four languages: what a field's validation reports and what a
 * call that failed is called when the server says nothing. They are the app's words, not the editor's (lib/i18n), so
 * the preview and the exported app (the next export wave copies this file) say the same. */

export type AppLang = "zh" | "en" | "ja" | "ko";

const M = {
  required: { en: "Required", zh: "必填", ja: "入力してください", ko: "필수 항목입니다" },
  minLength: { en: "At least {n} characters", zh: "至少 {n} 个字符", ja: "{n} 文字以上で入力してください", ko: "{n}자 이상 입력하세요" },
  maxLength: { en: "At most {n} characters", zh: "最多 {n} 个字符", ja: "{n} 文字以内で入力してください", ko: "{n}자 이하로 입력하세요" },
  pattern: { en: "Not in the right format", zh: "格式不正确", ja: "形式が正しくありません", ko: "형식이 올바르지 않습니다" },
  email: { en: "Enter an email address", zh: "请输入有效的邮箱地址", ja: "メールアドレスを入力してください", ko: "이메일 주소를 입력하세요" },
  url: { en: "Enter a web address", zh: "请输入有效的网址", ja: "URL を入力してください", ko: "웹 주소를 입력하세요" },
  uuid: { en: "Not a valid id", zh: "不是有效的编号", ja: "有効な ID ではありません", ko: "올바른 ID가 아닙니다" },
  date: { en: "Enter a date (YYYY-MM-DD)", zh: "请输入日期（YYYY-MM-DD）", ja: "日付を入力してください（YYYY-MM-DD）", ko: "날짜를 입력하세요(YYYY-MM-DD)" },
  dateTime: { en: "Enter a date and time", zh: "请输入日期和时间", ja: "日時を入力してください", ko: "날짜와 시간을 입력하세요" },
  number: { en: "Enter a number", zh: "请输入数字", ja: "数値を入力してください", ko: "숫자를 입력하세요" },
  integer: { en: "Enter a whole number", zh: "请输入整数", ja: "整数を入力してください", ko: "정수를 입력하세요" },
  minimum: { en: "At least {n}", zh: "不能小于 {n}", ja: "{n} 以上にしてください", ko: "{n} 이상이어야 합니다" },
  maximum: { en: "At most {n}", zh: "不能大于 {n}", ja: "{n} 以下にしてください", ko: "{n} 이하여야 합니다" },
  enum: { en: "Choose one of the options", zh: "请从选项中选择", ja: "選択肢から選んでください", ko: "옵션 중에서 선택하세요" },
  network: { en: "Can't reach the server", zh: "无法连接服务器", ja: "サーバーに接続できません", ko: "서버에 연결할 수 없습니다" },
  failed: { en: "Something went wrong", zh: "出了点问题", ja: "問題が発生しました", ko: "문제가 발생했습니다" },
  /* the designs a region bound to data starts with (lib/bindings/designs.ts) */
  emptyTitle: { en: "Nothing here yet", zh: "还没有内容", ja: "まだ何もありません", ko: "아직 내용이 없어요" },
  emptyDetail: { en: "When there is something, it shows up here.", zh: "有内容时会显示在这里。", ja: "追加されるとここに表示されます。", ko: "내용이 생기면 여기에 표시됩니다." },
  notFoundTitle: { en: "Not found", zh: "找不到内容", ja: "見つかりません", ko: "찾을 수 없어요" },
  notFoundDetail: { en: "It may have been moved or deleted.", zh: "它可能已被移走或删除。", ja: "移動または削除された可能性があります。", ko: "이동되었거나 삭제되었을 수 있어요." },
  refresh: { en: "Refresh", zh: "刷新", ja: "更新", ko: "새로고침" },
  errorTitle: { en: "Couldn't load", zh: "加载失败", ja: "読み込めませんでした", ko: "불러오지 못했어요" },
  errorDetail: { en: "Check your connection and try again.", zh: "请检查网络后重试。", ja: "接続を確認して、もう一度お試しください。", ko: "연결을 확인하고 다시 시도하세요." },
  retry: { en: "Try again", zh: "重试", ja: "再試行", ko: "다시 시도" },
  forbiddenTitle: { en: "You don't have access", zh: "没有访问权限", ja: "アクセス権がありません", ko: "접근 권한이 없어요" },
  forbiddenDetail: { en: "Sign in with an account that can see this.", zh: "请使用有权限的账号登录。", ja: "閲覧できるアカウントでログインしてください。", ko: "볼 수 있는 계정으로 로그인하세요." },
  signIn: { en: "Sign in", zh: "登录", ja: "ログイン", ko: "로그인" },
  loadMore: { en: "Load more", zh: "加载更多", ja: "さらに読み込む", ko: "더 보기" },
  submit: { en: "Submit", zh: "提交", ja: "送信", ko: "제출" },
  submitFailed: { en: "Couldn't submit. Check the fields and try again.", zh: "提交失败，请检查后重试。", ja: "送信できませんでした。入力内容を確認してください。", ko: "제출하지 못했어요. 입력 내용을 확인하세요." },
  optional: { en: "Optional", zh: "选填", ja: "任意", ko: "선택 사항" },
  /* what a form says of a failed call when the server gave no explanation of its own (rules.ts `problemMessage`) */
  signInFirst: { en: "Please sign in and try again.", zh: "请先登录，然后再试一次。", ja: "ログインしてから、もう一度お試しください。", ko: "로그인한 뒤 다시 시도하세요." },
  conflict: { en: "This changed in the meantime. Reload and try again.", zh: "内容已被改动，请刷新后重试。", ja: "その間に変更されました。再読み込みしてもう一度お試しください。", ko: "그사이에 변경되었어요. 새로고침한 뒤 다시 시도하세요." },
  tooLarge: { en: "That is too large to send.", zh: "内容太大，无法发送。", ja: "サイズが大きすぎて送信できません。", ko: "너무 커서 보낼 수 없어요." },
  tooMany: { en: "Too many tries. Wait a moment and try again.", zh: "操作太频繁，请稍后再试。", ja: "操作が多すぎます。少し待ってからもう一度お試しください。", ko: "요청이 너무 많아요. 잠시 후 다시 시도하세요." },
  serverError: { en: "The server ran into a problem. Try again later.", zh: "服务器出了点问题，请稍后再试。", ja: "サーバーで問題が発生しました。しばらくしてからお試しください。", ko: "서버에 문제가 생겼어요. 잠시 후 다시 시도하세요." },
} satisfies Record<string, Record<AppLang, string>>;

export type MessageKey = keyof typeof M;

/** an app message in a language, its `{n}` filled in */
export function appMessage(key: MessageKey, lang: string, n?: number | string): string {
  const words = M[key][(lang in M[key] ? lang : "en") as AppLang];
  return n === undefined ? words : words.replace("{n}", String(n));
}

export const APP_MESSAGES = M;
