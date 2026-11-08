import { col, go, grid, panel, part, row, say, screen, txt, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { atomsOf } from "./atoms";
import { PEOPLE, shopNav, WORDS } from "./words";

/* A shop, one screen each. Each builder takes the links the shop flow gives it. */

type Link = ReturnType<typeof go>;

const TOTE = say("Everyday canvas tote", "日常帆布包", "キャンバストート", "데일리 캔버스 토트백");
const MUG = say("Ceramic mug", "陶瓷马克杯", "陶器のマグカップ", "세라믹 머그컵");
const LAMP = say("Desk lamp", "台灯", "デスクライト", "책상 조명");
const BOTTLE = say("Steel bottle", "不锈钢水壶", "ステンレスボトル", "스테인리스 물병");

const TOTE_KIND = say("Sand / Large", "沙色 / 大号", "サンド / L", "샌드 / 대");
const MUG_KIND = say("Glazed white", "釉白", "白釉", "화이트 유약");
const LAMP_KIND = say("Black", "黑色", "ブラック", "블랙");
const BOTTLE_KIND = say("Steel / 500 ml", "钢色 / 500 ml", "スチール / 500 ml", "스틸 / 500 ml");

const FREE = say("Free delivery", "免运费", "送料無料", "무료 배송");
const ADD = say("Add to cart", "加入购物车", "カートに追加", "장바구니 담기");
const IN_CART = say("In cart", "已加购", "追加済み", "담김");
const ADDRESS = say("12 Example Road, Unit 4", "示例路 12 号 4 室", "サンプル通り 12 番地 4 号室", "예시로 12, 4호");
const ARRIVES = say("Arrives", "预计送达", "お届け予定", "도착 예정");
const FRIDAY = say("Friday", "周五", "金曜日", "금요일");
const TOTAL = say("Total", "合计", "合計", "합계");

const product = (title: Say, price: string, original: string, badge: string, rating: number, link?: Link): Node =>
  part("product-card", { title, subtitle: "", price, original, badge, rating, action: ADD, done: IN_CART }, { actions: { open: link } });

/** a bar with a way back and nothing else to do */
const backBar = (title: Say, link?: Link, trailing = ""): Node => part("app-bar", { title, leading: "arrow_back", trailing }, { actions: { icon: link } });

/** one thing bought: its picture, what it is, what it cost */
const line = (title: Say, kind: Say, price: string): Node =>
  row({ gap: 12 }, [
    part("image", { alt: title, width: 56, height: 56 }),
    col({ gap: 2 }, [txt(title, "body"), txt(kind, "caption", { color: "muted" })], { fill: true }),
    txt(price, "body", { align: "end", width: 72 }),
  ]);

/** where it goes: a row to tap to change it */
const deliverTo = (): Node =>
  part("item", { items: [{ label: PEOPLE.ada, icon: "location_on" }], description: ADDRESS, trailing: "icon", trailingIcon: "chevron_right" });

const addPhotos = (): Node =>
  part("file-upload", {
    title: say("Add photos", "添加照片", "写真を追加", "사진 추가"),
    hint: say("Up to 5 photos", "最多 5 张", "5 枚まで", "최대 5장"),
    action: say("Choose photos", "选择照片", "写真を選ぶ", "사진 선택"),
  });

export const productListScreen = (link?: Link): ScreenSeed =>
  screen({
    id: "products",
    name: say("Products", "商品", "商品一覧", "상품 목록"),
    /* the bar below already goes to the cart and the other sections: up here is only what acts on this list */
    top: [part("app-bar", { title: WORDS.shop, leading: "", trailing: "filter_list", trailing2: "search" })],
    bottom: [shopNav(1)],
    body: [
      col({ gap: 8 }, [
        part("chip", {
          kind: "filter",
          selected: 0,
          items: [
            { label: say("All", "全部", "すべて", "전체") },
            { label: say("Bags", "包袋", "バッグ", "가방") },
            { label: say("Home", "家居", "雑貨", "홈") },
            { label: say("Sale", "特价", "セール", "세일") },
          ],
        }),
        grid(2, { gap: 8 }, [product(TOTE, "$24.00", "$32.00", "-25%", 4.6, link), product(MUG, "$12.50", "", "", 4.8, link), product(LAMP, "$38.00", "$45.00", "-15%", 4.3, link), product(BOTTLE, "$19.00", "", "", 4.7, link)]),
      ]),
    ],
  });

export const productDetailScreen = (links: { cart?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "product",
    name: say("Product", "商品详情", "商品詳細", "상품 상세"),
    /* saving it is on the bar at the foot, so it is not here as well */
    top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "shopping_cart" }, { actions: { icon: links.back } })],
    bottom: [
      part(
        "checkout-bar",
        { label: say("Price", "价格", "価格", "가격"), amount: "$24.00", note: FREE, icons: [{ label: say("Save", "收藏", "保存", "저장"), icon: "favorite" }], action: ADD, done: IN_CART },
        { actions: { action: links.cart } },
      ),
    ],
    body: [
      part("image", { alt: TOTE, height: 240 }),
      part("price-tag", { currency: "$", amount: "24.00", original: "$32.00", discount: "-25%", size: "medium" }),
      txt(TOTE, "title", { bold: true }),
      row({ gap: 8 }, [part("rating", { value: 5, readOnly: true }), txt(say("4.6 · 128 reviews", "4.6 · 128 条评价", "4.6 · レビュー 128 件", "4.6 · 리뷰 128개"), "caption", { color: "muted" }, { fill: true })]),
      txt(say("Heavy cotton canvas with a roomy inside pocket. Made to carry a laptop and a day's shopping.", "厚实的棉质帆布，内袋宽敞，放得下笔记本和一天的采购。", "厚手のコットンキャンバスに広い内ポケット。ノートパソコンと一日の買い物が入ります。", "두꺼운 면 캔버스에 넉넉한 안주머니. 노트북과 하루치 장보기가 들어갑니다."), "body", { color: "muted" }),
      col({ gap: 8 }, [
        txt(say("Color", "颜色", "カラー", "색상"), "label", { color: "muted" }),
        part("chip", {
          kind: "filter",
          selected: 0,
          items: [{ label: say("Sand", "沙色", "サンド", "샌드") }, { label: say("Navy", "藏青", "ネイビー", "네이비") }, { label: say("Olive", "橄榄绿", "オリーブ", "올리브") }],
        }),
      ]),
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
    top: [backBar(WORDS.cart, links.back)],
    body: [
      /* in one layout: a cart is as tall as what is in it, and what is under it stays under it */
      col({ gap: 16 }, [
        atomsOf(
          "cart-list",
          {
            data: {
              columns: ["Name", "Variant", "Price", "Quantity"],
              rows: [
                [TOTE, TOTE_KIND, "24.00", "1"],
                [MUG, MUG_KIND, "12.50", "2"],
                [BOTTLE, BOTTLE_KIND, "19.00", "1"],
              ],
            },
            currency: "$",
            selectAll: say("All", "全选", "すべて選択", "전체 선택"),
            total: TOTAL,
            action: say("Checkout", "结算", "レジに進む", "결제하기"),
            empty: say("Your cart is empty", "购物车是空的", "カートは空です", "장바구니가 비어 있습니다"),
          },
          { actions: { action: links.checkout } },
        ),
        part("section-header", { title: say("You may also like", "猜你喜欢", "こちらもおすすめ", "함께 보면 좋은 상품"), subtitle: "", action: "" }),
        grid(2, { gap: 8 }, [
          part("product-card", { title: LAMP, subtitle: "", price: "$38.00", original: "", badge: "", rating: 0, action: "", done: "" }),
          part("product-card", { title: say("Linen notebook", "亚麻笔记本", "リネンノート", "린넨 노트"), subtitle: "", price: "$9.00", original: "", badge: "", rating: 0, action: "", done: "" }),
        ]),
      ]),
    ],
  });

export const checkoutScreen = (links: { place?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "checkout",
    name: say("Checkout", "结算", "レジ", "결제"),
    top: [backBar(say("Checkout", "结算", "レジ", "결제"), links.back)],
    bottom: [part("checkout-bar", { label: TOTAL, amount: "$68.00", note: FREE, icons: [], action: say("Place order", "提交订单", "注文を確定", "주문하기"), done: "" }, { actions: { action: links.place } })],
    body: [
      panel({ gap: 8 }, [txt(say("Deliver to", "配送至", "お届け先", "배송지"), "label", { color: "muted" }), deliverTo()]),
      panel({}, [
        row({ gap: 8 }, [
          part("image", { alt: TOTE, width: 56, height: 56 }),
          part("image", { alt: MUG, width: 56, height: 56 }),
          part("image", { alt: BOTTLE, width: 56, height: 56 }),
          txt(say("4 items", "共 4 件", "4 点", "4개"), "body", { align: "end", color: "muted" }, { fill: true }),
        ]),
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
              [ARRIVES, FRIDAY],
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
    place: "center",
    body: [
      /* as tall as the icon from the start: a row that only grows once the icon is drawn takes the words below it in */
      row({ justify: "center", hugHeight: false, height: 96 }, [part("icon", { name: "check_circle", size: 96, color: "primary", filled: true })]),
      txt(say("Thank you for your order", "感谢你的订单", "ご注文ありがとうございます", "주문해 주셔서 감사합니다"), "headline", { align: "center" }),
      txt(say("We will email you when it ships.", "发货后会给你发邮件。", "発送時にメールでお知らせします。", "배송이 시작되면 이메일로 알려 드립니다."), "body", { align: "center", color: "muted" }),
      panel({}, [
        part("description-list", {
          data: {
            columns: ["Name", "Value"],
            rows: [
              [say("Order", "订单号", "注文番号", "주문 번호"), "A-1042"],
              [ARRIVES, FRIDAY],
              [TOTAL, "$68.00"],
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

const orderCard = (number: string, status: Say, title: Say, kind: Say, price: string, action: Say): Node =>
  panel({ gap: 8 }, [
    row({ justify: "between" }, [txt(number, "label", { color: "muted", width: 160 }), txt(status, "label", { color: "primary", align: "end", width: 120 })]),
    line(title, kind, price),
    row({ justify: "end" }, [part("button", { label: action, size: "sm", variant: "tonal" })]),
  ]);

const couponRow = (amount: string, condition: Say, title: Say, expiry: Say): Node =>
  part("coupon", { amount, condition, title, expiry, action: say("Use", "去使用", "使う", "사용"), done: say("Used", "已使用", "使用済み", "사용됨") });

const UNTIL = say("Until Dec 31", "12 月 31 日前有效", "12 月 31 日まで", "12월 31일까지");

export const shop: Template[] = [
  {
    slug: "category-browse",
    name: "Categories",
    labels: { ja: "カテゴリ", zh: "分类", ko: "카테고리" },
    category: "shop",
    frame: "phone",
    icon: "category",
    build: () => [
      screen({
        id: "categories",
        name: say("Categories", "分类", "カテゴリ", "카테고리"),
        top: [part("search", { kind: "bar", placeholder: say("Search", "搜索商品", "検索", "검색"), trailing: "" })],
        bottom: [shopNav(1)],
        body: [
          row({ gap: 12, align: "start" }, [
            /* the list on the left runs down the screen, and what is on the right is the one that is chosen */
            part("side-tabs", {
              selected: 1,
              width: 96,
              items: [
                { label: say("New", "新品", "新着", "신상품") },
                { label: say("Bags", "包袋", "バッグ", "가방") },
                { label: say("Home", "家居", "雑貨", "홈") },
                { label: say("Kitchen", "厨房", "キッチン", "주방") },
                { label: say("Outdoor", "户外", "アウトドア", "야외") },
                { label: say("Clothing", "服饰", "ファッション", "의류") },
                { label: say("Beauty", "美妆", "コスメ", "뷰티") },
                { label: say("Tech", "数码", "デジタル", "디지털") },
                { label: say("Books", "图书", "本", "도서") },
                { label: say("Toys", "玩具", "おもちゃ", "장난감") },
              ],
            }),
            col({ gap: 8 }, [
              part("image", { alt: say("Promotion", "活动图", "キャンペーン", "프로모션"), height: 120 }),
              part("section-header", { title: say("Everyday", "日常", "普段使い", "데일리"), subtitle: "", action: "" }),
              part("icon-grid", { columns: 3, badge: "", items: [{ label: say("Totes", "托特包", "トート", "토트백"), icon: "shopping_bag" }, { label: say("Backpacks", "双肩包", "リュック", "백팩"), icon: "backpack" }, { label: say("Wallets", "钱包", "財布", "지갑"), icon: "wallet" }] }),
              part("section-header", { title: say("Travel", "出行", "旅行", "여행"), subtitle: "", action: "" }),
              part("icon-grid", { columns: 3, badge: "", items: [{ label: say("Luggage", "行李箱", "キャリー", "캐리어"), icon: "luggage" }, { label: say("Laptop", "电脑包", "PC 用", "노트북"), icon: "laptop_mac" }, { label: say("Pouches", "收纳包", "ポーチ", "파우치"), icon: "inventory_2" }] }),
            ], { fill: true }),
          ]),
        ],
      }),
    ],
  },
  { slug: "product-list", name: "Product list", labels: { ja: "商品一覧", zh: "商品列表", ko: "상품 목록" }, category: "shop", frame: "phone", icon: "storefront", build: () => [productListScreen()] },
  { slug: "product-detail", name: "Product detail", labels: { ja: "商品詳細", zh: "商品详情", ko: "상품 상세" }, category: "shop", frame: "phone", icon: "sell", build: () => [productDetailScreen()] },
  { slug: "cart", name: "Cart", labels: { ja: "カート", zh: "购物车", ko: "장바구니" }, category: "shop", frame: "phone", icon: "shopping_cart", build: () => [cartScreen()] },
  { slug: "checkout", name: "Checkout", labels: { ja: "レジ", zh: "结算", ko: "결제" }, category: "shop", frame: "phone", icon: "shopping_bag", build: () => [checkoutScreen()] },
  { slug: "order-success", name: "Order success", labels: { ja: "注文完了", zh: "下单成功", ko: "주문 완료" }, category: "shop", frame: "phone", icon: "task_alt", build: () => [orderSuccessScreen()] },
  {
    slug: "order-list",
    name: "Orders",
    labels: { ja: "注文履歴", zh: "我的订单", ko: "주문 내역" },
    category: "shop",
    frame: "phone",
    icon: "receipt_long",
    build: () => [
      screen({
        id: "orders",
        name: say("Orders", "我的订单", "注文履歴", "주문 내역"),
        top: [
          backBar(say("Orders", "我的订单", "注文履歴", "주문 내역"), undefined, "search"),
          part("tabs", { selected: 0, items: [{ label: say("All", "全部", "すべて", "전체") }, { label: say("To pay", "待付款", "未払い", "결제 대기") }, { label: say("To ship", "待发货", "発送待ち", "배송 대기") }, { label: say("To review", "待评价", "レビュー待ち", "리뷰 대기") }] }),
        ],
        body: [
          orderCard("A-1042", say("To pay", "待付款", "未払い", "결제 대기"), LAMP, LAMP_KIND, "$38.00", say("Pay now", "去付款", "支払う", "결제하기")),
          orderCard("A-1038", say("On the way", "运输中", "配送中", "배송 중"), TOTE, TOTE_KIND, "$24.00", say("Track", "查看物流", "配送状況", "배송 조회")),
          orderCard("A-1027", say("Delivered", "已完成", "配達済み", "배송 완료"), MUG, MUG_KIND, "$25.00", say("Review", "去评价", "レビューする", "리뷰 쓰기")),
        ],
      }),
    ],
  },
  {
    slug: "order-detail",
    name: "Order detail",
    labels: { ja: "注文詳細", zh: "订单详情", ko: "주문 상세" },
    category: "shop",
    frame: "phone",
    icon: "receipt",
    build: () => [
      screen({
        id: "order",
        name: say("Order detail", "订单详情", "注文詳細", "주문 상세"),
        top: [backBar(say("Order detail", "订单详情", "注文詳細", "주문 상세"))],
        bottom: [
          part("checkout-bar", {
            label: "",
            amount: "",
            note: "",
            icons: [{ label: say("Help", "客服", "ヘルプ", "문의"), icon: "support_agent" }, { label: say("Refund", "退款", "返金", "환불"), icon: "assignment_return" }],
            action: say("Confirm receipt", "确认收货", "受取を確認", "수령 확인"),
            done: "",
          }),
        ],
        body: [
          panel({ gap: 8 }, [
            txt(say("On the way", "运输中", "配送中", "배송 중"), "title", { bold: true, color: "primary" }),
            part("timeline", {
              current: 2,
              data: {
                columns: ["Time", "Title", "Detail"],
                rows: [
                  [say("Mon 14:32", "周一 14:32", "月 14:32", "월 14:32"), say("Order placed", "已下单", "注文済み", "주문 완료"), ""],
                  [say("Tue 09:05", "周二 09:05", "火 09:05", "화 09:05"), say("Shipped", "已发货", "発送済み", "발송 완료"), ""],
                  [say("Wed 18:20", "周三 18:20", "水 18:20", "수 18:20"), say("Out for delivery", "派送中", "配達中", "배송 출발"), ""],
                  [say("Expected Friday", "预计周五", "金曜日の予定", "금요일 예정"), say("Delivered", "已送达", "配達完了", "배송 완료"), ""],
                ],
              },
            }),
          ]),
          panel({ gap: 8 }, [txt(say("Deliver to", "配送至", "お届け先", "배송지"), "label", { color: "muted" }), deliverTo()]),
          panel({}, [line(TOTE, TOTE_KIND, "$24.00")]),
          panel({}, [
            part("description-list", {
              data: {
                columns: ["Name", "Value"],
                rows: [
                  [say("Order", "订单号", "注文番号", "주문 번호"), "A-1038"],
                  [say("Delivery", "运费", "送料", "배송비"), say("Free", "免费", "無料", "무료")],
                  [TOTAL, "$24.00"],
                ],
              },
            }),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "refund-request",
    name: "Refund request",
    labels: { ja: "返品・返金", zh: "申请退款", ko: "환불 신청" },
    category: "shop",
    frame: "phone",
    icon: "assignment_return",
    build: () => [
      screen({
        id: "refund",
        name: say("Refund request", "申请退款", "返品・返金", "환불 신청"),
        top: [backBar(say("Refund request", "申请退款", "返品・返金", "환불 신청"))],
        bottom: [part("checkout-bar", { label: say("Refund", "退款", "返金額", "환불액"), amount: "$24.00", note: "", icons: [], action: say("Submit", "提交申请", "申請する", "신청하기"), done: "" })],
        body: [
          panel({}, [line(TOTE, TOTE_KIND, "$24.00")]),
          panel({ gap: 8 }, [
            txt(say("What would you like?", "你希望如何处理", "ご希望の対応", "원하는 처리 방법"), "label", { color: "muted" }),
            part("radio-group", { selected: 0, items: [{ label: say("Refund only", "仅退款", "返金のみ", "환불만") }, { label: say("Return and refund", "退货退款", "返品して返金", "반품 후 환불") }] }),
          ]),
          /* on a phone this is a row that opens a list of reasons */
          part("item", { items: [{ label: say("Reason", "退款原因", "理由", "사유"), icon: "help" }], description: say("Choose a reason", "请选择原因", "理由を選択", "사유 선택"), trailing: "icon", trailingIcon: "chevron_right" }),
          part("textarea", { placeholder: say("Tell us more (optional)", "补充说明（选填）", "詳細（任意）", "추가 설명 (선택)") }),
          addPhotos(),
        ],
      }),
    ],
  },
  {
    slug: "write-review",
    name: "Write a review",
    labels: { ja: "レビューを書く", zh: "写评价", ko: "리뷰 작성" },
    category: "shop",
    frame: "phone",
    icon: "rate_review",
    build: () => [
      screen({
        id: "review",
        name: say("Write a review", "写评价", "レビューを書く", "리뷰 작성"),
        top: [backBar(say("Write a review", "写评价", "レビューを書く", "리뷰 작성"))],
        body: [
          panel({}, [line(MUG, MUG_KIND, "$25.00")]),
          col({ gap: 8 }, [
            txt(say("How was it?", "你觉得怎么样", "いかがでしたか", "어떠셨나요?"), "title", { align: "center" }),
            row({ justify: "center" }, [part("rating", { value: 4 })]),
          ]),
          part("chip", { kind: "filter", selected: 0, items: [{ label: say("Quality", "质量好", "品質", "품질") }, { label: say("Value", "性价比高", "コスパ", "가성비") }, { label: say("Delivery", "发货快", "配送", "배송") }] }),
          part("textarea", { placeholder: say("What did you like or dislike?", "说说你的使用感受", "良かった点や気になった点を教えてください", "좋았던 점이나 아쉬웠던 점을 알려 주세요") }),
          col({ gap: 12 }, [
            addPhotos(),
            part("checkbox", { checked: false, label: say("Post anonymously", "匿名评价", "匿名で投稿", "익명으로 작성") }),
            part("button", { label: say("Submit review", "提交评价", "レビューを投稿", "리뷰 등록"), size: "md" }),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "coupon-list",
    name: "Coupons",
    labels: { ja: "クーポン", zh: "优惠券", ko: "쿠폰" },
    category: "shop",
    frame: "phone",
    icon: "confirmation_number",
    build: () => [
      screen({
        id: "coupons",
        name: say("Coupons", "优惠券", "クーポン", "쿠폰"),
        top: [
          backBar(say("Coupons", "优惠券", "クーポン", "쿠폰")),
          part("tabs", { selected: 0, items: [{ label: say("Available", "可使用", "利用可能", "사용 가능") }, { label: say("Used", "已使用", "使用済み", "사용 완료") }, { label: say("Expired", "已过期", "期限切れ", "기간 만료") }] }),
        ],
        body: [
          part("input-group", { placeholder: say("Enter a code", "输入兑换码", "コードを入力", "코드 입력"), leadingIcon: "sell", leadingText: "", trailingText: "", button: say("Redeem", "兑换", "交換", "등록") }),
          couponRow("$10", say("Over $50", "满 $50 可用", "$50 以上で利用可", "$50 이상 사용 가능"), say("New member offer", "新人专享", "新規会員特典", "신규 회원 혜택"), UNTIL),
          couponRow("20%", say("Over $30", "满 $30 可用", "$30 以上で利用可", "$30 이상 사용 가능"), say("Sitewide discount", "全场折扣", "全品割引", "전 상품 할인"), UNTIL),
          couponRow("$5", say("Any order", "无门槛", "条件なし", "조건 없음"), say("Thank-you gift", "感谢回馈", "感謝クーポン", "감사 쿠폰"), say("Until Nov 30", "11 月 30 日前有效", "11 月 30 日まで", "11월 30일까지")),
          couponRow("$3", say("Over $20", "满 $20 可用", "$20 以上で利用可", "$20 이상 사용 가능"), say("Delivery discount", "运费券", "送料割引", "배송비 할인"), say("Until Nov 15", "11 月 15 日前有效", "11 月 15 日まで", "11월 15일까지")),
          couponRow("10%", say("Over $20", "满 $20 可用", "$20 以上で利用可", "$20 이상 사용 가능"), say("Weekend offer", "周末特惠", "週末限定", "주말 혜택"), say("Until Sunday", "本周日前有效", "今週日曜まで", "이번 주 일요일까지")),
          couponRow("$2", say("Any order", "无门槛", "条件なし", "조건 없음"), say("Daily reward", "每日奖励", "デイリー特典", "오늘의 혜택"), say("Today only", "仅限今日", "本日限り", "오늘만")),
        ],
      }),
    ],
  },
  {
    slug: "address-list",
    name: "Addresses",
    labels: { ja: "お届け先", zh: "收货地址", ko: "배송지" },
    category: "shop",
    frame: "phone",
    icon: "location_on",
    build: () => [
      screen({
        id: "addresses",
        name: say("Addresses", "收货地址", "お届け先", "배송지"),
        top: [backBar(say("Addresses", "收货地址", "お届け先", "배송지"))],
        body: [
          /* each address is a row of its own: one item shares its one line of words between all its rows */
          col({ gap: 8 }, [
            part("item", { trailing: "icon", trailingIcon: "edit", description: ADDRESS, items: [{ label: say("Home · Default", "家 · 默认", "自宅・既定", "집 · 기본"), icon: "home" }] }),
            part("item", { trailing: "icon", trailingIcon: "edit", description: say("88 Sample Avenue, Floor 3", "样例大道 88 号 3 层", "サンプル大通り 88 番地 3 階", "샘플대로 88, 3층"), items: [{ label: say("Office", "公司", "職場", "회사"), icon: "work" }] }),
            part("item", { trailing: "icon", trailingIcon: "edit", description: say("5 Placeholder Lane", "占位巷 5 号", "プレースホルダー通り 5 番地", "자리표시길 5"), items: [{ label: say("Family", "家人", "実家", "가족"), icon: "family_restroom" }] }),
            part("button", { label: say("Add an address", "新增地址", "お届け先を追加", "배송지 추가"), size: "md", icon: "add" }),
          ]),
        ],
      }),
    ],
  },
];
