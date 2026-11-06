import { atom, button, hbox, icon, iconButton, image, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { SCREEN, T, W, kit, lines, muted, push, rule, tag, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Buying, as atoms: a cart line, the sums, the bar a checkout stands on and a coupon. Where shops sell by the tile
 * (a grey ground of white tiles) prices are red, the cart line opens with a round check and the bar at the foot
 * splits Add to cart and Buy now; elsewhere a price is the words' own color and the bar holds the total and one
 * button. */

const shopLike = (l: KitLook) => l.list === "tile";
const priceColor = (l: KitLook) => (shopLike(l) ? "error" : "default");

const ITEM = say("Linen shirt, relaxed fit", "亚麻衬衫 宽松版", "リネンシャツ リラックスフィット", "린넨 셔츠 릴랙스 핏");
const ITEM_PRICE = say("$48.00", "¥199", "¥5,900", "₩59,000");

/** minus, the count and plus in a small well */
const qty = (n = "1"): Node =>
  hbox({ surface: "well", padX: 0, padY: 0, gap: 0 }, [iconButton("remove", say("Fewer", "减少", "減らす", "줄이기"), { size: "xs", iconFill: true }), hbox({ justify: "center", hugWidth: false, width: 28 }, [text(n, "label", { bold: true })]), iconButton("add", say("More", "增加", "増やす", "늘리기"), { size: "xs" })], { corners: round(8) });

const cartRow = kit(
  "cart-row",
  "Cart row",
  ["购物车行", "カートの行", "장바구니 행"],
  "Commerce",
  "shopping_cart",
  "a row box: a check, a square picture, then a column taking the rest of the name over two lines, the chosen variant as a tag, and the price with a minus / count / plus stepper at the end; or a simple line of a small picture, the name over the count, the price and a delete button",
  [
    variant("stepper", "With a stepper", ["带步进器", "ステッパー付き", "스테퍼 포함"], (l) =>
      hbox({ width: W, hugWidth: false, padX: 0, padY: 8, gap: 10 }, [
        atom("checkbox", { label: "", checked: true }),
        image({ width: 88, height: 88, alt: "" }),
        vbox({ gap: 6, hugWidth: false, width: 200 }, [para(ITEM, "body", { maxLines: 2 }), hbox({ gap: 0 }, [tag(say("Size M · Sand", "M 码 · 沙色", "M · サンド", "M · 샌드"), "secondary")]), hbox({ justify: "between" }, [text(ITEM_PRICE, "heading", { bold: true, color: priceColor(l) }), qty()])], { grow: true }),
      ]),
    ),
    variant("simple", "Simple line", ["简单行", "シンプルな行", "간단한 행"], (l) =>
      hbox({ width: W, hugWidth: false, padX: 0, padY: 8, gap: 12 }, [image({ width: 56, height: 56, alt: "" }), lines(ITEM, say("Qty 1", "数量 1", "数量 1", "수량 1"), "label"), text(ITEM_PRICE, "label", { bold: true, color: priceColor(l) }), iconButton("delete", T.remove, { size: "xs" })]),
    ),
  ],
);

const SUMS: [Say, Say][] = [
  [say("Subtotal", "商品金额", "小計", "상품 금액"), say("$86.00", "¥358", "¥10,800", "₩108,000")],
  [say("Shipping", "运费", "送料", "배송비"), say("Free", "免运费", "無料", "무료")],
  [say("Tax", "税费", "税", "세금"), say("$6.88", "¥0", "¥1,080", "₩10,800")],
];
const TOTAL = say("$92.88", "¥358", "¥11,880", "₩118,800");
/** a line of the sums: what it is muted at the start, how much at the end */
const sumLine = ([what, much]: [Say, Say], color = "default"): Node => hbox({ justify: "between" }, [muted(what), text(much, "body", { color })]);

const summary = kit(
  "price-summary",
  "Price summary",
  ["价格明细", "金額の内訳", "가격 요약"],
  "Commerce",
  "receipt",
  "a column of lines, each a muted name at the start and the sum at the end, then a hairline and the total in bold; or the same on a card with a coupon line (a tag glyph, the coupon, the saving in red and a chevron)",
  [
    variant("lines", "Lines and a total", ["明细与合计", "内訳と合計", "내역과 합계"], () =>
      vbox({ width: W, hugWidth: false, gap: 10 }, [...SUMS.map((s, i) => sumLine(s, i === 1 ? "primary" : "default")), rule(), hbox({ justify: "between" }, [text(say("Total", "合计", "合計", "합계"), "lead", { bold: true }), text(TOTAL, "title", { bold: true })])]),
    ),
    variant("card", "On a card, with a coupon", ["卡片带优惠券", "カード・クーポン付き", "카드·쿠폰"], (l) =>
      vbox({ surface: "card", width: W, hugWidth: false, padX: 16, padY: 16, gap: 10 }, [
        ...SUMS.slice(0, 2).map((s) => sumLine(s)),
        hbox({ gap: 8 }, [icon("sell", { size: 18, color: "error" }), para(say("Coupon", "优惠券", "クーポン", "쿠폰"), "body", { maxLines: 1 }, { grow: true }), text(say("-$10.00", "-¥20", "-¥1,000", "-₩10,000"), "body", { color: "error" }), icon("chevron_right", { size: 18, color: "muted" })]),
        rule(),
        hbox({ justify: "between" }, [text(say("Total", "合计", "合計", "합계"), "lead", { bold: true }), text(TOTAL, "title", { bold: true, color: priceColor(l) })]),
      ]),
    ),
  ],
);

/** an icon over a word, as a shop's bottom bar shows its store and cart */
const barIcon = (name: string, words: Say): Node => vbox({ gap: 0, align: "center", padX: 6 }, [icon(name, { size: 22 }), text(words, "tiny")]);

const buyBar = kit(
  "buy-bar",
  "Buy bar",
  ["购买栏", "購入バー", "구매 바"],
  "Commerce",
  "shopping_cart_checkout",
  "a bar box pinned to the foot of the screen: the total (a muted word over the sum) and a filled checkout button at the end; a shop's product bar (store and cart icons over words, then Add to cart and Buy now side by side); or a cart's bar with a select-all check, the total in red and a checkout button with the count",
  [
    variant(
      "total",
      "Total and checkout",
      ["合计与结算", "合計と購入", "합계와 결제"],
      (l) => hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 16, padY: 10, gap: 12 }, [vbox({ gap: 0 }, [muted(say("Total", "合计", "合計", "합계"), "caption"), text(TOTAL, "title", { bold: true, color: priceColor(l) })]), push(), button(say("Checkout", "去结算", "購入手続きへ", "결제하기"), { variant: "filled", size: "md" })]),
      { span: "screen" },
    ),
    variant(
      "product",
      "Add to cart and Buy now",
      ["加入购物车和立即购买", "カートに入れる・今すぐ購入", "장바구니·바로 구매"],
      () =>
        hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 8, padY: 8, gap: 4 }, [barIcon("storefront", say("Store", "店铺", "ショップ", "상점")), barIcon("shopping_cart", say("Cart", "购物车", "カート", "장바구니")), push(), button(say("Add to cart", "加入购物车", "カートに入れる", "장바구니 담기"), { variant: "tonal", size: "sm" }), button(say("Buy now", "立即购买", "今すぐ購入", "바로 구매"), { variant: "filled", size: "sm" })]),
      { span: "screen", suits: shopLike },
    ),
    variant(
      "cart",
      "Select all and checkout",
      ["全选与结算", "すべて選択と購入", "전체 선택과 결제"],
      (l) =>
        hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 16, padY: 10, gap: 8 }, [atom("checkbox", { label: say("All", "全选", "すべて", "전체"), checked: true }), para(say("Total:", "合计：", "合計：", "합계:"), "body", { color: "muted", align: "end", maxLines: 1 }, { grow: true }), text(TOTAL, "heading", { bold: true, color: priceColor(l) }), button(say("Checkout (2)", "结算(2)", "購入 (2)", "결제 (2)"), { variant: "filled", size: "sm" })]),
      { span: "screen" },
    ),
  ],
);

const couponCard = kit(
  "coupon-ticket",
  "Coupon ticket",
  ["优惠券票根", "クーポン券", "쿠폰 티켓"],
  "Commerce",
  "confirmation_number",
  "a card box split like a ticket: a tinted stub with the saving large over what it is, the conditions over the validity taking the rest, and a small Use button; or a small chip with a tag glyph, the offer and a Get link",
  [
    variant("ticket", "Ticket", ["票根", "チケット", "티켓"], () =>
      hbox({ surface: "card", width: W, hugWidth: false, padX: 0, padY: 0, gap: 0, align: "stretch", hugHeight: false, height: 88 }, [
        vbox({ gap: 0, align: "center", justify: "center", hugWidth: false, width: 104, hugHeight: false, height: 88 }, [text(say("$10", "¥20", "¥1,000", "₩10,000"), "headline", { bold: true }), muted(say("OFF", "立减", "オフ", "할인"), "caption")], { fill: "primaryContainer", corners: { tl: 12, tr: 0, br: 0, bl: 12 } }),
        vbox({ gap: 2, padX: 14, padY: 0, justify: "center", hugWidth: false, width: 160, hugHeight: false, height: 88 }, [para(say("On orders over $50", "满 199 元可用", "5,000 円以上で利用可", "5만 원 이상 주문 시"), "label", { bold: true, maxLines: 1 }), para(say("Valid until Dec 31", "有效期至 12 月 31 日", "12 月 31 日まで有効", "12월 31일까지"), "caption", { color: "muted", maxLines: 1 })], { grow: true }),
        hbox({ padX: 12, padY: 0, gap: 0, hugHeight: false, height: 88 }, [button(say("Use", "使用", "使う", "사용"), { variant: "filled", size: "xs" })]),
      ], { corners: round(12) }),
    ),
    variant("chip", "Small chip", ["小标签", "小さなチップ", "작은 칩"], () =>
      hbox({ surface: "chip", padX: 10, padY: 6, gap: 6 }, [icon("sell", { size: 16, color: "error" }), text(say("$10 off $50", "满 199 减 20", "5,000 円以上 1,000 円引き", "5만 원 이상 1만 원 할인"), "caption", { color: "error" }), text(say("Get", "领取", "受け取る", "받기"), "caption", { bold: true, color: "primary" })], { corners: round(6) }),
    ),
  ],
);

export const commerceKits: KitDef[] = [cartRow, summary, buyBar, couponCard];
