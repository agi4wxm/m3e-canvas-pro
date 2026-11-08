/* What a screen is called in the code and the addresses of every exported app (the web app's routes, the phone app's
 * Expo Router paths, the mini-program's pages), from one place, so that the three agree and an address stays the
 * same from one export to the next.
 *
 * A screen is named by the ASCII words of its name ("Product details": `productDetails`, `/product-details`). A
 * name with none, or none a name can start with (Chinese, Japanese, Korean: "商品详情"), is named by the English words
 * the editor's templates give it (lib/export/ir/screenWords.ts: "商品详情" is "Product"), with a number it ends in
 * kept ("屏幕 2" is "Screen 2"); a name the templates do not have is named after the screen's id, which the document
 * keeps for as long as the screen exists (`screenK3j2h1g5`). Never by its place among the screens: an address must not
 * move to another screen because one was added or taken out before it. Two screens that come out the same take a
 * number after the first, in the order the document has them. */

import { SCREEN_WORDS } from "./screenWords";

/** whether words make a name: some ASCII letters or digits, the first of them not a digit */
const naming = (words: string) => {
  const first = words.match(/[A-Za-z0-9]+/)?.[0];
  return !!first && !/^\d/.test(first);
};

/** The words a screen is named by: its own, when they make a name; else the English the templates give its words
 *  (with a number they end in); else none, and the screen is named after its id (`screenToken`). */
export function screenWords(f: { name?: unknown }): string | undefined {
  const name = typeof f.name === "string" ? f.name : "";
  if (naming(name)) return name;
  const plain = name.normalize("NFKC").trim();
  const known = SCREEN_WORDS[plain];
  if (known) return known;
  /* a name and its number ("屏幕 2", "步骤3") */
  const numbered = /^(.*?)\s*(\d+)$/u.exec(plain);
  const words = numbered ? SCREEN_WORDS[numbered[1]] : undefined;
  return words ? `${words} ${numbered![2]}` : undefined;
}

/** a short hash of words, as letters and digits */
const hashOf = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};

/** What a screen whose words make no name is named after: its id's letters and digits, each run capitalized
 *  (`K3j2h1g5`, `FWelcome`), else a hash of the id. The id stays the screen's for as long as it exists, through
 *  renames, so the address does too. */
export function screenToken(f: { id: string }): string {
  const runs = f.id.match(/[A-Za-z0-9]+/g) ?? [];
  const token = runs.map((w) => w[0].toUpperCase() + w.slice(1)).join("").slice(0, 24);
  return token || hashOf(f.id).toUpperCase();
}

/** a screen's words for a printer's `nameOf`, and the name it falls back to: `Screen<token>` or `screen<token>` */
export const screenNameParts = (f: { id: string; name?: unknown }, lower: boolean): { words: string; fallback: string } => ({ words: screenWords(f) ?? "", fallback: `${lower ? "screen" : "Screen"}${screenToken(f)}` });

/** a kebab-case address segment from a screen's key: `productDetails` and `ProductDetails` are `product-details` */
export const routeSegment = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
