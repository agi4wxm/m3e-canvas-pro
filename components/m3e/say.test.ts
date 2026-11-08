import { readFileSync } from "node:fs"
import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Combobox, ComboboxChip, ComboboxChips, ComboboxInput } from "./combobox"
import { SAY_WORDS, SayLanguage, sayIn } from "./say"
import { TextField } from "./text-field"
import { TimePicker } from "./time-picker"

/* The words the components say by themselves (report UI-4): in Chinese, Japanese, Korean and English, from the
 * language passed down (the canvas's) or the page's, each overridable by the component's props; and a field's own
 * supporting text joins what describes it from outside instead of replacing it. */

const inLang = (lang: string, element: ReactElement) => renderToStaticMarkup(createElement(SayLanguage.Provider, { value: lang }, element))
const labels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1])
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("the words of the components", () => {
  it("come in every language, with the same placeholders as the English", () => {
    for (const [english, words] of Object.entries(SAY_WORDS))
      for (const lang of ["zh", "ja", "ko"] as const) {
        expect(words[lang].trim(), `${english} in ${lang}`).not.toBe("")
        expect(placeholders(words[lang]), `${english} in ${lang}`).toEqual(placeholders(english))
      }
  })

  it("are said in the language asked for, by its tag, and fill their placeholders", () => {
    expect(sayIn("zh-CN", "Show options")).toBe("显示选项")
    expect(sayIn("ja", "Clear selection")).toBe("選択を解除")
    expect(sayIn("ko-KR", "Remove {name}", { name: "Astro" })).toBe("Astro 제거")
    expect(sayIn("en", "Remove {name}", { name: "Astro" })).toBe("Remove Astro")
    expect(sayIn("fr", "Show options")).toBe("Show options")
    expect(sayIn("ja", "Words no one wrote")).toBe("Words no one wrote")
  })

  it("leave no English for a screen reader written into the combobox or the time picker", () => {
    for (const file of ["combobox.tsx", "time-picker.tsx"]) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8")
      expect(src, file).not.toMatch(/aria-label="[A-Za-z]/)
      expect(src, file).not.toMatch(/aria-label=\{`[A-Za-z]/)
      expect(src, file).not.toMatch(/aria-label=\{[^}]*\? "[A-Z]/)
    }
  })
})

describe("the combobox", () => {
  const input = (props: Record<string, unknown> = {}) => createElement(Combobox, { items: ["Next.js", "Astro"] }, createElement(ComboboxInput, { showClear: true, ...props }))

  it("names its buttons in the canvas language", () => {
    expect(labels(inLang("en", input()))).toEqual(expect.arrayContaining(["Show options"]))
    expect(labels(inLang("zh", input()))).toEqual(expect.arrayContaining(["显示选项"]))
    expect(labels(inLang("ja", input()))).toEqual(expect.arrayContaining(["選択肢を表示"]))
    expect(labels(inLang("ko", input()))).toEqual(expect.arrayContaining(["옵션 표시"]))
  })

  it("takes the names it is given instead", () => {
    const html = inLang("ja", input({ triggerLabel: "Pick a framework" }))
    expect(labels(html)).toContain("Pick a framework")
    expect(labels(html)).not.toContain("選択肢を表示")
  })

  it("names a chip's remove button after the chip, in the canvas language", () => {
    const chips = createElement(Combobox, { items: ["Astro"], multiple: true, defaultValue: ["Astro"] }, createElement(ComboboxChips, null, createElement(ComboboxChip, null, "Astro")))
    expect(labels(inLang("zh", chips))).toContain("移除Astro")
    expect(labels(inLang("en", chips))).toContain("Remove Astro")
  })
})

describe("the time picker", () => {
  const picker = (props: Record<string, unknown> = {}) => createElement(TimePicker, { defaultValue: { hours: 9, minutes: 5 }, onCancel: () => {}, onConfirm: () => {}, ...props })

  it("says its title, selectors, dial, AM/PM run, switch and buttons in the canvas language", () => {
    const en = inLang("en", picker())
    expect(en).toContain(">Select time<")
    expect(labels(en)).toEqual(expect.arrayContaining(["Hours: 09", "Minutes: 05", "AM or PM", "Hours", "Switch to text input"]))
    expect(en).toContain(">Cancel<")
    const zh = inLang("zh", picker())
    expect(zh).toContain(">选择时间<")
    expect(labels(zh)).toEqual(expect.arrayContaining(["小时：09", "分钟：05", "上午或下午", "小时", "切换到文本输入"]))
    expect(zh).toContain(">取消<")
    expect(zh).toContain(">上午<")
    const ja = inLang("ja", picker())
    expect(labels(ja)).toEqual(expect.arrayContaining(["時：09", "分：05", "午前または午後", "テキスト入力に切り替え"]))
    expect(ja).toContain(">キャンセル<")
    const ko = inLang("ko", picker())
    expect(labels(ko)).toEqual(expect.arrayContaining(["시: 09", "분: 05", "오전 또는 오후", "텍스트 입력으로 전환"]))
    expect(ko).toContain(">확인<")
  })

  it("says its fields' captions in the canvas language, and takes words it is given", () => {
    const fields = inLang("ja", picker({ mode: "input" }))
    expect(labels(fields)).toEqual(expect.arrayContaining(["時", "分"]))
    const given = inLang("zh", picker({ title: "Pickup", labels: { hours: "Std", ok: "Done" } }))
    expect(given).toContain(">Pickup<")
    expect(labels(given)).toContain("Std: 09")
    expect(given).toContain(">Done<")
  })
})

describe("a text field", () => {
  it("is described by what is given from outside and by its own supporting text, both", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "email", "aria-describedby": "form-hint", supportingText: "We never share it" }))
    expect(html).toMatch(/aria-describedby="form-hint email-support"/)
    expect(html).toContain('id="email-support"')
    expect(renderToStaticMarkup(createElement(TextField, { id: "x", "aria-describedby": "hint" }))).toMatch(/aria-describedby="hint"/)
    expect(renderToStaticMarkup(createElement(TextField, { id: "y", supportingText: "Help" }))).toMatch(/aria-describedby="y-support"/)
  })
})
