/* The documents the editor starts with: the desktop's starter sketch and the phone's three buttons. */

import { partBySlug } from "@/parts/registry";
import { COMMON_TEXT } from "@/parts/labels";
import { getLang, SEED_TEXT, type Lang } from "@/lib/i18n";
import { makeItem, PHONE_H, PHONE_MARGIN, PHONE_W, uid, type Frame, type Group, type Item } from "@/lib/tokens";

export const SEED_FRAMES: Frame[] = [{ id: "seedF1", name: "Home", x: 0, y: 0 }];

/** a part that is a shadcn M3E component, with the values the author would have set */
export const partOf = (slug: string, props: Record<string, unknown>, id: string): Item => ({ ...makeItem(slug), id, props });

/* The starter sketch: an app bar, a pair of buttons, three list items, a FAB and a navigation bar, all
 * of them the real components. Parts are as tall as they measure, so the rows sit apart on their own. */
export const seed = (lang: Lang = getLang()): Group[] => {
  /* the parts' own seed words, so a change of language reseeds them the way it does a part added later */
  const word = (en: string) => (lang === "en" ? en : (COMMON_TEXT[en]?.[lang] ?? en));
  const text = { favorite: word("Favorite"), share: word("Share"), inbox: word("Inbox"), starred: word("Starred"), archive: word("Archive"), supporting: word("Supporting text") };
  let n = 0;
  const sid = () => `seed${++n}`;
  const content = PHONE_W - PHONE_MARGIN * 2;
  const bar = partOf("app-bar", { title: text.inbox, width: PHONE_W }, sid());
  /* the two buttons are one connected pair, the way the first canvas drew them */
  const pair = partOf(
    "button-group",
    { items: [{ label: text.favorite, icon: "star", variant: "filled" }, { label: text.share, icon: "share" }], buttonVariant: "tonal", size: "md" },
    sid(),
  );
  const rows = [text.inbox, text.starred, text.archive].map((label, i) =>
    partOf("item", { items: [{ label, icon: ["inbox", "star", "archive"][i] }], description: text.supporting, trailing: "icon", width: content }, sid()),
  );
  const fab = partOf("fab", { icon: "edit" }, sid());
  const nav = partOf("navigation-bar", { width: PHONE_W }, sid());
  const navH = partBySlug("navigation-bar")?.h ?? 64;
  return [
    { id: sid(), x: 0, y: 0, axis: "x", items: [bar] },
    { id: sid(), x: PHONE_MARGIN, y: 88, axis: "x", items: [pair] },
    ...rows.map((row, i) => ({ id: sid(), x: PHONE_MARGIN, y: 168 + i * 76, axis: "y" as const, items: [row] })),
    { id: sid(), x: PHONE_W - 56 - PHONE_MARGIN, y: PHONE_H - navH - 56 - PHONE_MARGIN, axis: "x", items: [fab] },
    { id: sid(), x: 0, y: PHONE_H - navH, axis: "x", items: [nav] },
  ];
};

/** The phone version starts with buttons only: that is all it edits. */
export const mobileSeed = (lang: Lang = getLang()): Group[] => {
  const text = SEED_TEXT[lang];
  const a = partOf("button", { label: text.favorite, icon: "star", size: "md" }, uid());
  const b = partOf("button", { label: text.share, icon: "share", variant: "tonal", size: "md" }, uid());
  const c = partOf("button", { label: text.start, icon: "arrow_forward", size: "md" }, uid());
  return [
    { id: uid(), x: PHONE_MARGIN, y: 120, axis: "x", items: [a] },
    { id: uid(), x: PHONE_MARGIN + 160, y: 120, axis: "x", items: [b] },
    { id: uid(), x: PHONE_MARGIN, y: 200, axis: "x", items: [c] },
  ];
};
