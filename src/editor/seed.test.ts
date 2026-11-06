import { describe, expect, it } from "vitest";
import { STARTER_PARTS } from "@/parts/prefetch";
import { LANGS } from "@/lib/i18n";
import { mobileSeed, seed } from "./seed";

/* parts/prefetch.ts fetches what a new document is drawn with before the editor has come, from its own list of the
 * starter's parts: the list and the seeds stay one and the same. */
describe("the starter document", () => {
  it("is made of the parts the opening fetch gets ahead of time", () => {
    for (const { key: lang } of LANGS) {
      const used = new Set([...seed(lang), ...mobileSeed(lang)].flatMap((g) => g.items.map((it) => it.component)));
      expect([...used].sort(), lang).toEqual([...STARTER_PARTS].sort());
    }
  });
});
