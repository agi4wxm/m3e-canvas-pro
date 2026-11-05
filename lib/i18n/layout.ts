/* Editor words for one area of work, kept in their own file and spread into `UI` and `KO` in lib/i18n.ts.
 * Each entry has ja, en and zh; Korean is in the matching `LAYOUT_KO` below, with exactly the same keys. */

type Str = { ja: string; en: string; zh: string };

export const LAYOUT_UI = {} as const satisfies Record<string, Str>;

export const LAYOUT_KO: Record<keyof typeof LAYOUT_UI, string> = {};
