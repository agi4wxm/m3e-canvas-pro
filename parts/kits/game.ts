import { hbox, icon, iconButton, svg, text } from "../atoms";
import { say } from "../templates/kit";
import type { KitDef } from "./types";

/* The pills along the top of a game's screens: a currency's mark, how much there is, and the plus
 * that opens the shop. The mark is an icon or a shape from the vector library. */

const ADD = say("Get more", "获取更多", "追加", "더 얻기");
const NAME = say("Resource pill", "资源胶囊", "リソース表示", "자원 표시");

const pill: KitDef = {
  slug: "resource-pill",
  name: "Resource pill",
  labels: { zh: "游戏资源胶囊", ja: "ゲームのリソース表示", ko: "게임 자원 표시" },
  category: "Game",
  icon: "toll",
  about: "a chip box: a currency icon or vector mark, the amount in bold, and a small filled plus button",
  variants: [
    {
      key: "coins",
      name: "Coins with a plus",
      labels: { zh: "金币带加号", ja: "コイン・プラス付き", ko: "코인·플러스" },
      build: () =>
        hbox({ surface: "chip", padX: 4, padY: 4, gap: 6 }, [icon("paid", { filled: true, color: "tertiary" }), text("12,480", "label", { bold: true }), iconButton("add", ADD, { variant: "filled", size: "xs" })], {
          name: NAME,
          fill: "surfaceContainerHigh",
          corners: { tl: 20, tr: 20, br: 20, bl: 20 },
        }),
    },
    {
      key: "gems",
      name: "Gems",
      labels: { zh: "宝石", ja: "ジェム", ko: "보석" },
      build: () =>
        hbox({ surface: "chip", padX: 10, padY: 6, gap: 6 }, [svg("diamond", { width: 20, height: 20, color: "primary" }), text("860", "label", { bold: true })], {
          name: NAME,
          fill: "surfaceContainerHigh",
          corners: { tl: 20, tr: 20, br: 20, bl: 20 },
        }),
    },
    {
      key: "energy",
      name: "Energy with a cap",
      labels: { zh: "体力（上限）", ja: "スタミナ（上限）", ko: "에너지 (최대)" },
      build: () =>
        hbox({ surface: "chip", padX: 4, padY: 4, gap: 6 }, [icon("bolt", { filled: true, color: "secondary" }), text("86/120", "label", { bold: true }), iconButton("add", ADD, { variant: "tonal", size: "xs" })], {
          name: NAME,
          fill: "surfaceContainerHigh",
          corners: { tl: 20, tr: 20, br: 20, bl: 20 },
        }),
    },
  ],
};

export const gameKits: KitDef[] = [pill];
