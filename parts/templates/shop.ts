import { col, go, grid, panel, part, row, say, screen, txt, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { shopNav, WORDS } from "./words";

/* A shop, one screen each. Each builder takes the links the shop flow gives it. */

type Link = ReturnType<typeof go>;

const TOTE = say("Everyday canvas tote", "日常帆布包", "キャンバストート", "데일리 캔버스 토트백");
const MUG = say("Ceramic mug", "陶瓷马克杯", "陶器のマグカップ", "세라믹 머그컵");
const LAMP = say("Desk lamp", "台灯", "デスクライト", "책상 조명");
const BOTTLE = say("Steel bottle", "不锈钢水壶", "ステンレスボトル", "스테인리스 물병");

const FREE = say("Free delivery", "免运费", "送料無料", "무료 배송");
const ADD = say("Add to cart", "加入购物车", "カートに追加", "장바구니 담기");
const IN_CART = say("In cart", "已加购", "追加済み", "담김");

const product = (title: Say, price: string, original: string, badge: string, rating: number, link?: Link): Node =>
  part("product-card", { title, subtitle: "", price, original, badge, rating, action: ADD, done: IN_CART }, { actions: { open: link } });

export const productListScreen = (link?: Link): ScreenSeed =>
  screen({
    id: "products",
    name: say("Products", "商品", "商品一覧", "상품 목록"),
    top: [part("app-bar", { title: WORDS.shop, leading: "menu", trailing: "shopping_cart", trailing2: "search" })],
    bottom: [shopNav(1)],
    bodyProps: { padY: 8, gap: 12 },
    body: [
      part("chip", {
        kind: "filter",
        selected: 0,
        items: [
          { label: say("All", "全部", "すべて", "전체") },
          { label: say("Bags", "包袋", "バッグ", "가방") },
          { label: say("Home", "家居", "インテリア", "홈") },
          { label: say("Sale", "特价", "セール", "세일") },
        ],
      }),
      grid(2, {}, [product(TOTE, "$24.00", "$32.00", "-25%", 4.6, link), product(MUG, "$12.50", "", "", 4.8, link), product(LAMP, "$38.00", "$45.00", "-15%", 4.3, link), product(BOTTLE, "$19.00", "", "", 4.7, link)]),
    ],
  });

export const productDetailScreen = (links: { cart?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "product",
    name: say("Product", "商品详情", "商品詳細", "상품 상세"),
    top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "favorite" }, { actions: { icon: links.back } })],
    bottom: [
      part(
        "checkout-bar",
        { label: say("Price", "价格", "価格", "가격"), amount: "$24.00", note: FREE, icons: [{ label: say("Save", "收藏", "保存", "저장"), icon: "favorite" }], action: ADD, done: IN_CART },
        { actions: { action: links.cart } },
      ),
    ],
    bodyProps: { padY: 8, gap: 12 },
    body: [
      part("image", { alt: TOTE, height: 320, radius: 20 }),
      part("price-tag", { currency: "$", amount: "24.00", original: "$32.00", discount: "-25%", size: "medium" }),
      txt(TOTE, "title", { bold: true }),
      part("rating", { value: 4.6, readOnly: true }),
      txt(say("Heavy cotton canvas with a roomy inside pocket. Made to carry a laptop and a day's shopping.", "厚实的棉质帆布，内袋宽敞，放得下笔记本和一天的采购。", "厚手のコットンキャンバスに広い内ポケット。ノートパソコンと一日の買い物が入ります。", "두꺼운 면 캔버스에 넉넉한 안주머니. 노트북과 하루치 장보기가 들어갑니다."), "body", { color: "muted" }),
      part("chip", {
        kind: "filter",
        selected: 0,
        items: [{ label: say("Sand", "沙色", "サンド", "샌드") }, { label: say("Navy", "藏青", "ネイビー", "네이비") }, { label: say("Olive", "橄榄绿", "オリーブ", "올리브") }],
      }),
      part("item", {
        size: "sm",
        description: "",
        items: [
          { label: say("Arrives by Friday", "周五前送达", "金曜日までにお届け", "금요일까지 도착"), icon: "local_shipping" },
          { label: say("Free returns for 30 days", "30 天免费退货", "30 日間返品無料", "30일 무료 반품"), icon: "assignment_return" },
        ],
      }),
    ],
  });

export const cartScreen = (links: { checkout?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "cart",
    name: WORDS.cart,
    top: [part("app-bar", { title: WORDS.cart, leading: "arrow_back", trailing: "" }, { actions: { icon: links.back } })],
    bodyProps: { gap: 12 },
    body: [
      part(
        "cart-list",
        {
          data: {
            columns: ["Name", "Variant", "Price", "Quantity"],
            rows: [
              [TOTE, say("Sand / Large", "沙色 / 大号", "サンド / L", "샌드 / 대"), "24.00", "1"],
              [MUG, say("Glazed white", "釉白", "白釉", "화이트 유약"), "12.50", "2"],
              [BOTTLE, say("Steel / 500 ml", "钢色 / 500 ml", "スチール / 500 ml", "스틸 / 500 ml"), "19.00", "1"],
            ],
          },
          currency: "$",
          selectAll: say("All", "全选", "すべて選択", "전체 선택"),
          total: say("Total", "合计", "合計", "합계"),
          action: say("Checkout", "结算", "レジに進む", "결제하기"),
          empty: say("Your cart is empty", "购物车是空的", "カートは空です", "장바구니가 비어 있습니다"),
        },
        { actions: { action: links.checkout } },
      ),
      part("coupon", {
        amount: "$10",
        condition: say("Over $50", "满 $50 可用", "$50 以上で利用可", "$50 이상 사용 가능"),
        title: say("New member offer", "新人专享", "新規会員特典", "신규 회원 혜택"),
        expiry: say("Until Dec 31", "12 月 31 日前有效", "12 月 31 日まで", "12월 31일까지"),
        action: say("Claim", "领取", "受け取る", "받기"),
        done: say("Claimed", "已领取", "受取済み", "받음"),
      }),
      part("section-header", { title: say("Goes well with", "搭配推荐", "一緒にどうぞ", "함께 구매"), action: "" }),
      part("product-card", { title: LAMP, subtitle: FREE, price: "$38.00", original: "", badge: "", rating: 4.3, layout: "horizontal", action: ADD, done: IN_CART }),
    ],
  });

export const checkoutScreen = (links: { place?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "checkout",
    name: say("Checkout", "结算", "レジ", "결제"),
    top: [part("app-bar", { title: say("Checkout", "结算", "レジ", "결제"), leading: "arrow_back", trailing: "" }, { actions: { icon: links.back } })],
    bottom: [part("checkout-bar", { label: say("Total", "合计", "合計", "합계"), amount: "$68.00", note: FREE, icons: [], action: say("Place order", "提交订单", "注文を確定", "주문하기"), done: "" }, { actions: { action: links.place } })],
    bodyProps: { gap: 12 },
    body: [
      part("steps", { current: 1, items: [{ label: say("Address", "地址", "住所", "주소") }, { label: say("Payment", "支付", "支払い", "결제") }, { label: say("Review", "确认", "確認", "확인") }] }),
      panel({ gap: 8 }, [
        txt(say("Deliver to", "配送至", "お届け先", "배송지"), "label", { color: "muted" }),
        txt(say("12 Harbour Road, Apartment 4", "海港路 12 号 4 室", "港通り 12 番地 4 号室", "항구로 12, 4호"), "body"),
      ]),
      panel({ gap: 8 }, [
        txt(say("Pay with", "支付方式", "お支払い方法", "결제 수단"), "label", { color: "muted" }),
        part("radio-group", { selected: 0, items: [{ label: say("Card ending 4242", "尾号 4242 的卡", "下 4 桁 4242 のカード", "끝자리 4242 카드") }, { label: say("Bank transfer", "银行转账", "銀行振込", "계좌 이체") }, { label: say("Cash on delivery", "货到付款", "代金引換", "착불") }] }),
      ]),
      part("input-group", { placeholder: say("Promo code", "优惠码", "プロモーションコード", "프로모션 코드"), leadingIcon: "sell", leadingText: "", trailingText: "", button: say("Apply", "使用", "適用", "적용") }),
      panel({ gap: 8 }, [
        txt(say("Summary", "订单摘要", "ご注文内容", "주문 요약"), "label", { color: "muted" }),
        part("description-list", {
          data: {
            columns: ["Name", "Value"],
            rows: [
              [say("Items", "商品", "商品", "상품"), "$68.00"],
              [say("Delivery", "运费", "送料", "배송비"), say("Free", "免费", "無料", "무료")],
              [say("Arrives", "预计送达", "お届け予定", "도착 예정"), say("Friday", "周五", "金曜日", "금요일")],
            ],
          },
        }),
      ]),
    ],
  });

export const orderSuccessScreen = (links: { more?: Link } = {}): ScreenSeed =>
  screen({
    id: "success",
    name: say("Order placed", "下单成功", "注文完了", "주문 완료"),
    bodyProps: { justify: "center", gap: 16, padX: 24, padY: 48 },
    body: [
      row({ justify: "center" }, [part("icon", { name: "check_circle", size: 96, color: "primary", filled: true })]),
      txt(say("Thank you for your order", "感谢你的订单", "ご注文ありがとうございます", "주문해 주셔서 감사합니다"), "headline", { align: "center" }),
      txt(say("We will email you when it ships.", "发货后会给你发邮件。", "発送時にメールでお知らせします。", "배송이 시작되면 이메일로 알려 드립니다."), "body", { align: "center", color: "muted" }),
      panel({}, [
        part("description-list", {
          data: {
            columns: ["Name", "Value"],
            rows: [
              [say("Order", "订单号", "注文番号", "주문 번호"), "A-1042"],
              [say("Arrives", "预计送达", "お届け予定", "도착 예정"), say("Friday", "周五", "金曜日", "금요일")],
              [say("Total", "合计", "合計", "합계"), "$68.00"],
            ],
          },
        }),
      ]),
      col({ gap: 8 }, [
        part("button", { label: say("Track order", "查看物流", "配送を確認", "배송 조회"), icon: "local_shipping" }),
        part("button", { label: say("Continue shopping", "继续购物", "買い物を続ける", "쇼핑 계속하기"), variant: "text" }, { action: links.more }),
      ]),
    ],
  });

export const shop: Template[] = [
  { slug: "product-list", name: "Product list", labels: { ja: "商品一覧", zh: "商品列表", ko: "상품 목록" }, category: "shop", frame: "phone", icon: "storefront", build: () => [productListScreen()] },
  { slug: "product-detail", name: "Product detail", labels: { ja: "商品詳細", zh: "商品详情", ko: "상품 상세" }, category: "shop", frame: "phone", icon: "sell", build: () => [productDetailScreen()] },
  { slug: "cart", name: "Cart", labels: { ja: "カート", zh: "购物车", ko: "장바구니" }, category: "shop", frame: "phone", icon: "shopping_cart", build: () => [cartScreen()] },
  { slug: "checkout", name: "Checkout", labels: { ja: "レジ", zh: "结算", ko: "결제" }, category: "shop", frame: "phone", icon: "shopping_bag", build: () => [checkoutScreen()] },
  { slug: "order-success", name: "Order success", labels: { ja: "注文完了", zh: "下单成功", ko: "주문 완료" }, category: "shop", frame: "phone", icon: "task_alt", build: () => [orderSuccessScreen()] },
];
