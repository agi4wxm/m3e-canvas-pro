import * as React from "react"

/* The few words the components themselves show or give a screen reader: a picker's title, the label of a button
 * that is only an icon. They are written in English here and said in the language of the page -- Chinese, Japanese,
 * Korean or English -- so they need nothing from the editor and read the same in an exported project. Where the page
 * is not in the language the components should speak (the editor's canvas, which follows the canvas language),
 * `SayLanguage` passes it down; `useSay` reads it. Every word can also be overridden by the component's own props. */

type Words = { zh: string; ja: string; ko: string }

const WORDS: Record<string, Words> = {
  Previous: { zh: "上一步", ja: "前へ", ko: "이전" },
  Next: { zh: "下一步", ja: "次へ", ko: "다음" },
  Skip: { zh: "跳过", ja: "スキップ", ko: "건너뛰기" },
  Submit: { zh: "提交", ja: "送信", ko: "제출" },
  Cancel: { zh: "取消", ja: "キャンセル", ko: "취소" },
  OK: { zh: "确定", ja: "OK", ko: "확인" },
  /* a field's states (parts/widgets/FieldFrame.tsx) */
  Loading: { zh: "加载中", ja: "読み込み中", ko: "로딩 중" },
  /* a rating's name for a screen reader, where its part gives none */
  Rating: { zh: "评分", ja: "評価", ko: "평점" },
  AM: { zh: "上午", ja: "午前", ko: "오전" },
  PM: { zh: "下午", ja: "午後", ko: "오후" },
  Date: { zh: "日期", ja: "日付", ko: "날짜" },
  "Start date": { zh: "开始日期", ja: "開始日", ko: "시작일" },
  "End date": { zh: "结束日期", ja: "終了日", ko: "종료일" },
  "Enter date": { zh: "输入日期", ja: "日付を入力", ko: "날짜 입력" },
  "Select date": { zh: "选择日期", ja: "日付を選択", ko: "날짜 선택" },
  "Select dates": { zh: "选择日期", ja: "日付を選択", ko: "날짜 선택" },
  /* the combobox */
  "Show options": { zh: "显示选项", ja: "選択肢を表示", ko: "옵션 표시" },
  "Clear selection": { zh: "清除选择", ja: "選択を解除", ko: "선택 지우기" },
  "Remove selection": { zh: "移除所选项", ja: "選択した項目を削除", ko: "선택 항목 제거" },
  "Remove {name}": { zh: "移除{name}", ja: "{name}を削除", ko: "{name} 제거" },
  /* the time picker */
  "Select time": { zh: "选择时间", ja: "時刻を選択", ko: "시간 선택" },
  Hours: { zh: "小时", ja: "時", ko: "시" },
  Minutes: { zh: "分钟", ja: "分", ko: "분" },
  Hour: { zh: "小时", ja: "時", ko: "시" },
  Minute: { zh: "分钟", ja: "分", ko: "분" },
  "Hours: {value}": { zh: "小时：{value}", ja: "時：{value}", ko: "시: {value}" },
  "Minutes: {value}": { zh: "分钟：{value}", ja: "分：{value}", ko: "분: {value}" },
  "AM or PM": { zh: "上午或下午", ja: "午前または午後", ko: "오전 또는 오후" },
  "Switch to text input": { zh: "切换到文本输入", ja: "テキスト入力に切り替え", ko: "텍스트 입력으로 전환" },
  "Switch to dial": { zh: "切换到表盘", ja: "ダイヤルに切り替え", ko: "다이얼로 전환" },
}

/** the words the components say, for the tests that hold every language to the English */
export const SAY_WORDS: Readonly<Record<string, Words>> = WORDS

type SayLang = keyof Words | "en"

/** a language tag (zh-CN, ja, ko-KR, en) as one of the languages the words come in; anything else is English */
const langOf = (tag: string | undefined): SayLang => {
  const t = (tag ?? "").toLowerCase()
  return t.startsWith("zh") ? "zh" : t.startsWith("ja") ? "ja" : t.startsWith("ko") ? "ko" : "en"
}

export const pageIsChinese = () => typeof document !== "undefined" && document.documentElement.lang.startsWith("zh")

/** the page's language as a locale's code, for dates; otherwise the browser's own */
export const pageLocale = () => (pageIsChinese() ? "zh-CN" : undefined)

/** the language of the page */
const pageLang = () => (typeof document !== "undefined" ? document.documentElement.lang : undefined)

/** The words in a language (a tag such as "zh-CN"), `{name}`s in them filled from `values`. */
export function sayIn(lang: string | undefined, words: string, values?: Record<string, string | number>): string {
  const l = langOf(lang)
  let out = l === "en" ? words : (WORDS[words]?.[l] ?? words)
  if (values) for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

/** The words in the language of the page. */
export const say = (words: string, values?: Record<string, string | number>) => sayIn(pageLang(), words, values)

/** The language the components inside speak when it is not the page's: the editor's canvas passes its own. */
export const SayLanguage = React.createContext<string | undefined>(undefined)

/** `say` in the language passed down by `SayLanguage`, else the page's */
export function useSay(): (words: string, values?: Record<string, string | number>) => string {
  const lang = React.useContext(SayLanguage)
  return React.useCallback((words, values) => sayIn(lang ?? pageLang(), words, values), [lang])
}
