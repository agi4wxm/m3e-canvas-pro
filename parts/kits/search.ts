import { atom, entry, hbox, icon, iconButton, round } from "../atoms";
import { say } from "../templates/kit";
import type { KitDef } from "./types";

/* A search field as a row in a field box: the glass, a bare entry that takes the rest, and what each
 * platform puts at its end. Which platform's it is follows the style. */

const PLACEHOLDER = say("Search", "搜索", "検索", "검색");

const search: KitDef = {
  slug: "search-bar",
  name: "Search bar",
  labels: { zh: "搜索栏", ja: "検索バー", ko: "검색 바" },
  category: "Menus & search",
  icon: "search",
  about: "a field box in a row: a search icon, a plain entry that takes the rest, and a mic, an avatar or a shortcut key at the end",
  variants: [
    {
      key: "material",
      name: "Material, full round",
      labels: { zh: "Material 圆角", ja: "Material・丸型", ko: "Material·둥근형" },
      suits: (l) => l.group !== "desktop" && (l.field === "m3" || l.field === "ring" || l.field === "hard" || l.field === "glow"),
      build: () =>
        hbox({ surface: "field", width: 380, hugWidth: false, padX: 16, padY: 4, gap: 12 }, [icon("search", { color: "" }), entry(PLACEHOLDER), iconButton("mic", say("Voice search", "语音搜索", "音声検索", "음성 검색"), { variant: "ghost" }), atom("avatar", { initials: "A", size: "sm" })], {
          name: say("Search bar", "搜索栏", "検索バー", "검색 바"),
          corners: round(28),
        }),
    },
    {
      key: "soft",
      name: "Small, rounded (iOS-like)",
      labels: { zh: "小号圆角（iOS 式）", ja: "小さめ角丸（iOS 風）", ko: "작은 둥근형 (iOS 식)" },
      suits: (l) => l.group !== "desktop" && (l.field === "soft" || l.field === "pill" || l.field === "line"),
      build: () =>
        hbox({ surface: "field", width: 380, hugWidth: false, padX: 8, padY: 6, gap: 6 }, [icon("search", { size: 20, color: "on-surface-variant" }), entry(PLACEHOLDER), icon("mic", { size: 20, color: "on-surface-variant" })], {
          name: say("Search bar", "搜索栏", "検索バー", "검색 바"),
          corners: round(10),
        }),
    },
    {
      key: "desktop",
      name: "Desktop, with a shortcut",
      labels: { zh: "桌面带快捷键", ja: "デスクトップ・ショートカット付き", ko: "데스크톱·단축키" },
      suits: (l) => l.group === "desktop" || l.compact,
      build: () =>
        hbox({ surface: "field", width: 320, hugWidth: false, padX: 10, padY: 4, gap: 8 }, [icon("search", { size: 20, color: "on-surface-variant" }), entry(PLACEHOLDER, { size: "sm" }), atom("kbd", { keys: [{ label: "Ctrl" }, { label: "K" }] })], {
          name: say("Search bar", "搜索栏", "検索バー", "검색 바"),
          corners: round(8),
        }),
    },
  ],
};

export const searchKits: KitDef[] = [search];
