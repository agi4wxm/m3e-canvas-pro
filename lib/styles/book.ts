import { compileCustomStyle, type CustomStyle } from "./custom";
import { PACKS } from "./packs";
import type { StylePack } from "./types";

/* What a style's key is read against: the built-in styles, and one document's own (`Doc.styles`), compiled to the packs
 * the rest of the system reads, so that a custom key is found as a built-in one is.
 *
 * A `StyleContext` is that, for one document, and it never changes: a document whose styles change has another one.
 * Whatever renders, lays out, exports or answers a tool for a document is handed its context (`styleContext(doc.styles)`)
 * and passes it to what reads a style (`styleOf(key, styles)`, `normalizeTheme(theme, styles)`, `styleCss(theme, at,
 * styles)`…). React reads it from the root's provider (parts/theme.tsx `DocStylesProvider`). Two documents open at once,
 * or two exports running side by side, each read their own.
 *
 * What is left of the older way, while the rest moves over: a context "in reach", read by whatever is not handed one.
 *   - `setDocStyles(doc.styles)`: the editor's store says it whenever its document's styles change (src/editor/store.ts),
 *     for the code that reads a style without being handed a context.
 *   - `withDocStyles(styles, () => …)`: for the length of one synchronous call, and then what was in reach before is again.
 *     It is for work that runs to its end without waiting, and refuses work that does not: a callback that returns a
 *     promise would go on after the context is put back, so it throws. Pass a context to async work instead. */

export type StyleContext = {
  /** the document's own styles, as it keeps them */
  readonly styles: readonly CustomStyle[] | undefined;
  /** its custom styles, compiled, in the document's order: one to a key */
  readonly customs: readonly StylePack[];
  /** the pack a key names: a built-in one, or one of the document's own */
  readonly styleOf: (key: string | undefined) => StylePack | undefined;
};

const BUILT_IN = new Map(PACKS.map((s) => [s.key, s]));

/** the compiled packs, by the JSON of the style, so an unchanged style is compiled once */
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

function make(styles: readonly CustomStyle[] | undefined): StyleContext {
  const packs = new Map<string, StylePack>();
  for (const s of styles ?? []) {
    const pack = packFor(s);
    if (pack && !packs.has(pack.key)) packs.set(pack.key, pack);
  }
  const customs = Object.freeze([...packs.values()]);
  return Object.freeze({ styles, customs, styleOf: (key: string | undefined) => (key ? (BUILT_IN.get(key) ?? packs.get(key)) : undefined) });
}

/** the context of no document's styles: the built-in ones alone */
export const NO_DOC_STYLES: StyleContext = make(undefined);

/** one context to a list of styles, so the same list (as React and a store hand it on) is the same context */
const contexts = new WeakMap<readonly CustomStyle[], StyleContext>();

/** The context of a document's own styles. The same list gives the same context. */
export function styleContext(styles: readonly CustomStyle[] | undefined): StyleContext {
  if (!styles?.length) return NO_DOC_STYLES;
  let ctx = contexts.get(styles);
  if (!ctx) contexts.set(styles, (ctx = make(styles)));
  return ctx;
}

const isContext = (v: unknown): v is StyleContext => typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as StyleContext).styleOf === "function";
const contextOf = (v: readonly CustomStyle[] | StyleContext | undefined) => (isContext(v) ? v : styleContext(v));

/* ---------- what is in reach, while the rest moves over ---------- */

let current: StyleContext = NO_DOC_STYLES;
let revision = 0;

/** the context in reach: what reads a style without being handed one reads this */
export const stylesInReach = (): StyleContext => current;

/** Puts a document's custom styles in reach, in place of those before. The same list again changes nothing. */
export function setDocStyles(styles: readonly CustomStyle[] | StyleContext | undefined): void {
  const next = contextOf(styles);
  if (next === current) return;
  current = next;
  revision++;
}

const isThenable = (v: unknown): v is PromiseLike<unknown> => (typeof v === "object" || typeof v === "function") && v !== null && typeof (v as PromiseLike<unknown>).then === "function";

/** Runs `run` with a document's custom styles in reach, and then puts back what was in reach before. Synchronous work
 *  only: what `run` does after an `await` would read whatever is in reach by then, so a promise is refused. */
export function withDocStyles<T>(styles: readonly CustomStyle[] | StyleContext | undefined, run: () => T): T {
  const was = current;
  setDocStyles(styles);
  let out: T;
  try {
    out = run();
  } finally {
    if (current !== was) {
      current = was;
      revision++;
    }
  }
  if (isThenable(out)) throw new TypeError("withDocStyles is for synchronous work: its callback returned a promise, which would read another document's styles after an await. Hand the work a StyleContext (styleContext(doc.styles)) instead.");
  return out;
}

/** the compiled pack of a custom style in reach */
export const customPackOf = (key: string): StylePack | undefined => (BUILT_IN.has(key) ? undefined : current.styleOf(key));
/** every custom style in reach, compiled, in the document's order */
export const customPacks = (): StylePack[] => [...current.customs];
/** the custom styles in reach, as the document keeps them */
export const docStyles = (): readonly CustomStyle[] | undefined => current.styles;
/** goes up whenever what is in reach changes: for what keeps what it worked out from a style */
export const docStylesRevision = () => revision;

/** one custom style of a list, compiled, without changing what is in reach */
export const customPackIn = (key: string, styles: readonly CustomStyle[] | undefined): StylePack | undefined => (BUILT_IN.has(key) ? undefined : styleContext(styles).styleOf(key));
