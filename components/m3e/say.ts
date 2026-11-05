/* The few words the components themselves show. They go by the language of the page, so they need
 * nothing from the editor and read the same in an exported project. */

const ZH: Record<string, string> = {
  Previous: "上一步",
  Next: "下一步",
  Skip: "跳过",
  Submit: "提交",
  Cancel: "取消",
  AM: "上午",
  PM: "下午",
  Date: "日期",
  "Start date": "开始日期",
  "End date": "结束日期",
  "Enter date": "输入日期",
  "Select date": "选择日期",
  "Select dates": "选择日期",
}

export const pageIsChinese = () => typeof document !== "undefined" && document.documentElement.lang.startsWith("zh")

/** the page's language as a locale's code, for dates; otherwise the browser's own */
export const pageLocale = () => (pageIsChinese() ? "zh-CN" : undefined)

export const say = (words: string) => (pageIsChinese() ? (ZH[words] ?? words) : words)
