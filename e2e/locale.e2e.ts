/* The words the components say by themselves follow the canvas language (report UI-4): a time picker and a combobox on
 * the canvas give their title and their screen-reader names in English, then, the editor switched to Japanese, Chinese
 * and Korean, in each at once -- passed down from the canvas, not read off the page after it has drawn. */

import { join } from "node:path";
import { bySlug, check, clickAdd, equal, savedDoc, settle, type E2ETest, type Page } from "./lib";

/** what the time picker and the combobox on the canvas say: the picker's title and the names a screen reader gets */
const words = (page: Page, picker: string, combo: string) =>
  page.evaluate(
    ([p, c]) => {
      const tp = document.querySelector(`[data-screen] [data-node="${p}"] [data-slot="time-picker"]`);
      const cb = document.querySelector(`[data-screen] [data-node="${c}"]`);
      return {
        title: tp?.querySelector('[data-slot="time-picker-title"]')?.textContent ?? null,
        picker: tp ? [...tp.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")) : [],
        combo: cb ? [...cb.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")) : [],
      };
    },
    [picker, combo] as const,
  );

async function language(page: Page, name: string) {
  await page.locator('button[title="Language"], button[title="言語"], button[title="语言"], button[title="언어"]').first().click();
  await settle(page, 300);
  await page.locator('[role="menuitemradio"]').filter({ hasText: name }).first().click();
  await settle(page, 1200);
}

export const tests: E2ETest[] = [
  {
    name: "locale: the time picker and the combobox on the canvas speak the canvas language, switched at once",
    async run({ page, out }) {
      await clickAdd(page, "Time picker");
      await clickAdd(page, "Combobox");
      const doc = await savedDoc(page);
      const picker = bySlug(doc, "time-picker")[0]?.id;
      const combo = bySlug(doc, "combobox")[0]?.id;
      check(picker && combo, "a time picker and a combobox are on the canvas");

      let seen = await words(page, picker, combo);
      equal(seen.title, "Select time", "the picker's title in English");
      check(seen.picker.includes("AM or PM") && seen.picker.includes("Switch to text input"), `its names in English: ${seen.picker.join(", ")}`);
      check(seen.combo.includes("Show options"), `the combobox's button in English: ${seen.combo.join(", ")}`);

      const expected: [string, { title: string; period: string; toInput: string; options: string }][] = [
        ["日本語", { title: "時刻を選択", period: "午前または午後", toInput: "テキスト入力に切り替え", options: "選択肢を表示" }],
        ["中文", { title: "选择时间", period: "上午或下午", toInput: "切换到文本输入", options: "显示选项" }],
        ["한국어", { title: "시간 선택", period: "오전 또는 오후", toInput: "텍스트 입력으로 전환", options: "옵션 표시" }],
      ];
      for (const [name, want] of expected) {
        await language(page, name);
        seen = await words(page, picker, combo);
        equal(seen.title, want.title, `the picker's title in ${name}`);
        check(seen.picker.includes(want.period) && seen.picker.includes(want.toInput), `its names in ${name}: ${seen.picker.join(", ")}`);
        check(seen.combo.includes(want.options), `the combobox's button in ${name}: ${seen.combo.join(", ")}`);
        await page.screenshot({ path: join(out, `locale-${name}.png`) });
      }
      await language(page, "English");
      seen = await words(page, picker, combo);
      equal(seen.title, "Select time", "back in English");
    },
  },
];
