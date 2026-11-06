import { compileCustomStyle, type CustomStyle } from "./custom";
import type { StylePack } from "./types";

/* The custom styles in reach: the document's own (`Doc.styles`), compiled to the packs the rest of the system reads, so
 * that `styleOf` finds a custom key as it finds a built-in one and nothing that reads a style has to be told where the
 * document keeps them. Everything that reads a style reads it through a theme, and there are many of them; a theme
 * names its style by key, and the key is resolved here.
 *
 * Which document's styles are in reach is said in one of two ways:
 *   - `setDocStyles(doc.styles)`: for as long as a document is open. The editor says it whenever its styles change,
 *     before anything is drawn with them.
 *   - `withDocStyles(doc.styles, () => …)`: for the length of one call, and then what was in reach before is again.
 *     What takes a whole document and reads its style (an export, the code view, the prompt, a headless tool such as
 *     the MCP server working on a file) wraps its work in this, so it reads that document's styles whatever else is
 *     open. It is for work that runs to its end without waiting: what comes after an `await` is outside it.
 * `resolveStyle(key, styles)` (theme.ts) reads one key against a list without touching what is in reach. */

/** the compiled packs of what has been put in reach, by the JSON of the style, so an unchanged style is compiled once */
const compiled = new Map<string, StylePack | null>();
const COMPILED_MAX = 200;

function packFor(style: CustomStyle): StylePack | null {
  const json = JSON.stringify(style);
  let pack = compiled.get(json);
  if (pack === undefined) {
    pack = compileCustomStyle(style);
    if (compiled.size >= COMPILED_MAX) compiled.delete(compiled.keys().next().value as string);
    compiled.set(json, pack);
  }
  return pack;
}

const packsOf = (styles: readonly CustomStyle[] | undefined) => {
  const out = new Map<string, StylePack>();
  for (const s of styles ?? []) {
    const pack = packFor(s);
    if (pack && !out.has(pack.key)) out.set(pack.key, pack);
  }
  return out;
};

type Book = { styles: readonly CustomStyle[] | undefined; packs: Map<string, StylePack> };
let book: Book = { styles: undefined, packs: new Map() };
let revision = 0;

/** Puts a document's custom styles in reach, in place of those before. The same list again changes nothing. */
export function setDocStyles(styles: readonly CustomStyle[] | undefined): void {
  if (styles === book.styles) return;
  book = { styles, packs: packsOf(styles) };
  revision++;
}

/** Runs `run` with a document's custom styles in reach, and then puts back what was in reach before. */
export function withDocStyles<T>(styles: readonly CustomStyle[] | undefined, run: () => T): T {
  const was = book;
  setDocStyles(styles);
  try {
    return run();
  } finally {
    if (book !== was) {
      book = was;
      revision++;
    }
  }
}

/** the compiled pack of a custom style in reach */
export const customPackOf = (key: string): StylePack | undefined => book.packs.get(key);
/** every custom style in reach, compiled, in the document's order */
export const customPacks = (): StylePack[] => [...book.packs.values()];
/** the custom styles in reach, as the document keeps them */
export const docStyles = (): readonly CustomStyle[] | undefined => book.styles;
/** goes up whenever what is in reach changes: for what keeps what it worked out from a style */
export const docStylesRevision = () => revision;

/** one custom style of a list, compiled, without changing what is in reach */
export const customPackIn = (key: string, styles: readonly CustomStyle[] | undefined): StylePack | undefined => packsOf(styles?.filter((s) => s.key === key)).get(key);
