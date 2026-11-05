import { button, hbox, image, para, text, vbox } from "../atoms";
import { say } from "../templates/kit";
import type { KitDef } from "./types";

/* A card as atoms: a card box holding a picture, a title, a few lines and its actions. The picture
 * sits inside the card's padding, so its corners never have to match the card's. */

const TITLE = say("Weekend in the hills", "山间周末", "山あいの週末", "산속의 주말");
const BODY = say("Two easy trails, a lake to swim in and a cabin with a view. Book before Friday.", "两条轻松的步道、一片能游泳的湖，还有一间看得见风景的小屋。周五前预订。", "歩きやすい道が二本、泳げる湖、眺めのいい小屋。金曜までに予約を。", "쉬운 산책로 두 개, 수영할 수 있는 호수, 전망 좋은 오두막. 금요일까지 예약하세요.");
const OVERLINE = say("Travel", "旅行", "旅行", "여행");
const SHARE = say("Share", "分享", "共有", "공유");
const BOOK = say("Book", "预订", "予約", "예약");

const card: KitDef = {
  slug: "media-card",
  name: "Media card",
  labels: { zh: "图文卡片", ja: "メディアカード", ko: "미디어 카드" },
  category: "Layout",
  icon: "article",
  about: "a card box: a picture, an overline, a title, a few lines that wrap, and a row of actions at the end",
  variants: [
    {
      key: "media",
      name: "Picture on top",
      labels: { zh: "图片在上", ja: "画像が上", ko: "이미지 위" },
      build: () =>
        vbox(
          { surface: "card", width: 380, hugWidth: false, padX: 12, padY: 12, gap: 12 },
          [
            image({ height: 180, alt: "" }),
            vbox({ padX: 4, padY: 0, gap: 6 }, [text(OVERLINE, "label", { color: "primary" }), para(TITLE, "title"), para(BODY, "body", { color: "muted", maxLines: 3 })]),
            hbox({ justify: "end", gap: 8 }, [button(SHARE, { variant: "text" }), button(BOOK, { variant: "filled" })]),
          ],
          { name: say("Card", "卡片", "カード", "카드") },
        ),
    },
    {
      key: "side",
      name: "Picture at the side",
      labels: { zh: "图片在侧", ja: "画像が横", ko: "이미지 옆" },
      build: () =>
        hbox(
          { surface: "card", width: 380, hugWidth: false, padX: 12, padY: 12, gap: 12, align: "start" },
          [image({ width: 96, height: 96, alt: "" }), vbox({ gap: 4, hugWidth: false, width: 200 }, [para(TITLE, "heading", { maxLines: 1 }), para(BODY, "body", { color: "muted", maxLines: 2 }), hbox({ justify: "end", gap: 8 }, [button(BOOK, { variant: "tonal", size: "xs" })])], { grow: true })],
          { name: say("Card", "卡片", "カード", "카드") },
        ),
    },
    {
      key: "text",
      name: "Words only",
      labels: { zh: "纯文字", ja: "文字のみ", ko: "글자만" },
      build: () =>
        vbox(
          { surface: "card", width: 380, hugWidth: false, padX: 16, padY: 16, gap: 8 },
          [para(TITLE, "title"), para(BODY, "body", { color: "muted" }), hbox({ justify: "end", gap: 8 }, [button(SHARE, { variant: "text" }), button(BOOK, { variant: "tonal" })])],
          { name: say("Card", "卡片", "カード", "카드") },
        ),
    },
  ],
};

export const cardKits: KitDef[] = [card];
