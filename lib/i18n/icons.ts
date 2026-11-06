/* Words of the icon picker for the document's own icons (components/IconPicker.tsx). Kept on their own, with their
 * own lookup, so nothing else's dictionary changes; every language has the same keys (lib/i18n/icons.test.ts). */

import type { Lang } from "../i18n";

type Words = { docIcons: string; symbols: string };

export const ICON_TEXT: Record<Lang, Words> = {
  en: { docIcons: "This document", symbols: "Material Symbols" },
  zh: { docIcons: "本文档", symbols: "Material Symbols" },
  ja: { docIcons: "このドキュメント", symbols: "Material Symbols" },
  ko: { docIcons: "이 문서", symbols: "Material Symbols" },
};

export const iconText = (key: keyof Words, lang: Lang) => (ICON_TEXT[lang] ?? ICON_TEXT.en)[key];
