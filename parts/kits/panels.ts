import { atom, avatar, box, button, hbox, icon, iconButton, image, para, round, svg, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { presetOf } from "../../lib/look";
import { T, W, disc, isDense, isGame, kit, lines, muted, rule, tag, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Cards as atoms: a card box holding a picture, the words, the figures and the actions, in the order each kind of
 * product reads them. A shop's tile puts the price in red under two lines of name; a plan card stacks the price over
 * the features over the button; a social post leads with who posted it. A picture sits inside the card's padding, so
 * its corners never have to match the card's. */

/** the price on a shop tile: red and bold where shops sell by the tile, the plain words color elsewhere */
const priceColor = (l: KitLook) => (l.list === "tile" ? "error" : "default");

const PRODUCT = say("Wireless noise-cancelling headphones, 40 h battery", "无线降噪耳机，40 小时续航", "ワイヤレスノイズキャンセリングヘッドホン 40 時間再生", "무선 노이즈 캔슬링 헤드폰, 40시간 재생");
const PRICE = say("$129", "¥899", "¥19,800", "₩189,000");
const SOLD = say("2k+ sold", "已售 2000+", "2,000 個以上販売", "2천+ 판매");

const product = kit(
  "product-tile",
  "Product tile",
  ["商品卡片", "商品タイル", "상품 타일"],
  "Commerce",
  "storefront",
  "a card box: a square picture, two lines of the name, and the price in bold with how many sold (and on a shop's tile a free-shipping tag and an add-to-cart button); or the picture at the side of the name, a variant and the price with an add button",
  [
    variant("grid", "In a grid", ["网格", "グリッド", "그리드"], (l) =>
      vbox({ surface: "card", width: 180, hugWidth: false, padX: 8, padY: 8, gap: 8 }, [
        image({ height: 164, alt: "" }),
        vbox({ padX: 4, padY: 0, gap: 6 }, [para(PRODUCT, "body", { maxLines: 2 }), hbox({ justify: "between", gap: 4 }, [text(PRICE, "heading", { bold: true, color: priceColor(l) }), muted(SOLD, "tiny")])]),
      ]),
    ),
    variant(
      "shop",
      "Shop tile with a cart",
      ["电商卡片带购物车", "カート付きショップタイル", "장바구니 쇼핑 타일"],
      (l) =>
        vbox({ surface: "card", width: 180, hugWidth: false, padX: 8, padY: 8, gap: 6 }, [
          image({ height: 164, alt: "" }),
          vbox({ padX: 2, padY: 0, gap: 6 }, [
            para(PRODUCT, "body", { maxLines: 2 }),
            hbox({ gap: 4 }, [tag(say("Free shipping", "包邮", "送料無料", "무료 배송"), "outline")]),
            hbox({ justify: "between", gap: 4 }, [vbox({ gap: 0 }, [text(PRICE, "heading", { bold: true, color: priceColor(l) }), muted(SOLD, "tiny")]), iconButton("add_shopping_cart", say("Add to cart", "加入购物车", "カートに追加", "장바구니에 담기"), { variant: "filled", size: "xs" })]),
          ]),
        ]),
      { suits: (l) => l.list === "tile" && l.group === "app" },
    ),
    variant("side", "Picture at the side", ["图片在侧", "画像が横", "이미지 옆"], (l) =>
      hbox({ surface: "card", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12, align: "start" }, [
        image({ width: 96, height: 96, alt: "" }),
        vbox({ gap: 6, hugWidth: false, width: 200 }, [para(PRODUCT, "label", { maxLines: 2 }), muted(say("Midnight black", "午夜黑", "ミッドナイトブラック", "미드나이트 블랙"), "caption"), hbox({ justify: "between" }, [text(PRICE, "heading", { bold: true, color: priceColor(l) }), button(T.add, { variant: "tonal", size: "xs", icon: "add" })])], { grow: true }),
      ]),
    ),
  ],
);

const FEATURES = [say("Unlimited projects", "无限项目", "プロジェクト無制限", "프로젝트 무제한"), say("Export to code", "导出代码", "コードに書き出し", "코드로 내보내기"), say("Priority support", "优先支持", "優先サポート", "우선 지원")];

/** the price of a plan: the figure large, the period after it */
const planPrice = (sum: Say, per: Say): Node => hbox({ gap: 4, align: "end" }, [text(sum, "display", { bold: true }), hbox({ padY: 6, padX: 0 }, [muted(per)])]);
const featureList = (): Node => vbox({ gap: 10 }, FEATURES.map((f) => hbox({ gap: 10 }, [icon("check_circle", { size: 20, filled: true, color: "primary" }), text(f, "body")])));
const PRO = say("Pro", "专业版", "プロ", "프로");
const MONTH = say("/ month", "/ 月", "/ 月", "/ 월");

const plan = kit(
  "plan-card",
  "Plan card",
  ["套餐卡片", "プランカード", "요금제 카드"],
  "Commerce",
  "workspace_premium",
  "a card box: the plan's name, its price large with the period after it, a muted line, a hairline, features each with a check, and a wide button; the featured one tinted with a tag; or a choice row with a radio, the plan over its price and a saving tag",
  [
    variant("card", "Card", ["卡片", "カード", "카드"], () =>
      vbox({ surface: "card", width: 300, hugWidth: false, padX: 20, padY: 20, gap: 14 }, [text(PRO, "heading", { bold: true }), planPrice(say("$12", "¥68", "¥1,800", "₩16,000"), MONTH), para(say("For people who build every day.", "适合每天都在创作的人。", "毎日つくる人のために。", "매일 만드는 사람을 위해."), "body", { color: "muted" }), rule(260), featureList(), button(say("Start free trial", "免费试用", "無料で試す", "무료 체험 시작"), { variant: "outlined", size: "md" })]),
    ),
    variant("featured", "Featured", ["推荐", "おすすめ", "추천"], () =>
      vbox({ surface: "card", width: 300, hugWidth: false, padX: 20, padY: 20, gap: 14 }, [hbox({ justify: "between" }, [text(say("Team", "团队版", "チーム", "팀"), "heading", { bold: true }), tag(say("Most popular", "最受欢迎", "人気 No.1", "가장 인기"), "default")]), planPrice(say("$24", "¥128", "¥3,400", "₩32,000"), MONTH), para(say("Share libraries and review together.", "共享组件库，一起评审。", "ライブラリを共有し、一緒にレビュー。", "라이브러리를 공유하고 함께 검토하세요."), "body", { color: "muted" }), rule(260), featureList(), button(say("Get Team", "购买团队版", "チームを選ぶ", "팀 시작하기"), { variant: "filled", size: "md" })], { fill: "primaryContainer" }),
    ),
    variant("option", "A choice row", ["选项行", "選択の行", "선택 행"], () =>
      hbox({ surface: "chip", width: W, hugWidth: false, padX: 16, padY: 14, gap: 12 }, [atom("radio", { label: "", checked: true }), vbox({ gap: 2, hugWidth: false, width: 160 }, [text(say("Yearly", "按年", "年額", "연간"), "lead", { bold: true }), muted(say("$79.99 / year · $6.67 / month", "¥398 / 年 · 约 ¥33 / 月", "¥9,800 / 年 · 月あたり ¥817", "₩99,000 / 년 · 월 ₩8,250"))], { grow: true }), tag(say("Save 45%", "省 45%", "45% お得", "45% 절약"), "tertiary")], { corners: round(14) }),
    ),
  ],
);

const STATS: [string, Say][] = [
  ["128", say("Posts", "帖子", "投稿", "게시물")],
  ["4.2k", say("Followers", "粉丝", "フォロワー", "팔로워")],
  ["310", say("Following", "关注", "フォロー中", "팔로잉")],
];
const stat = ([n, label]: [string, Say], center = true): Node => vbox({ gap: 0, align: center ? "center" : "start" }, [text(n, "heading", { bold: true }), muted(label, "caption")]);

const profile = kit(
  "profile-summary",
  "Profile summary",
  ["个人资料概览", "プロフィール概要", "프로필 요약"],
  "Social & chat",
  "account_circle",
  "a column: a large avatar, the name and handle, a row of counts and Follow / Message buttons, all centered; the photo-app way with the avatar beside the counts, the name and bio under them and two wide buttons; or a game's panel with a framed avatar, a level tag and an experience bar",
  [
    variant("center", "Centered", ["居中", "中央揃え", "가운데"], () =>
      vbox({ width: W, hugWidth: false, gap: 12, align: "center" }, [
        avatar("MC", { size: "lg" }),
        vbox({ gap: 0, align: "center" }, [text(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), "title", { bold: true }), muted(say("@mia.carter", "@xiaoyu", "@aoi.sato", "@haneul"))]),
        hbox({ gap: 32 }, STATS.map((s) => stat(s))),
        hbox({ gap: 8 }, [button(T.follow, { variant: "filled", size: "sm" }), button(T.message, { variant: "tonal", size: "sm" })]),
      ]),
    ),
    variant(
      "photo",
      "Avatar beside the counts",
      ["头像在统计旁", "アバターと数字を横に", "아바타 옆 숫자"],
      () =>
        vbox({ width: W, hugWidth: false, gap: 12 }, [
          hbox({ gap: 24 }, [avatar("MC", { size: "lg" }), hbox({ justify: "between", hugWidth: false, width: 200 }, STATS.map((s) => stat(s)), { grow: true })]),
          vbox({ gap: 2 }, [text(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), "label", { bold: true }), para(say("Film photos and long walks. Kyoto → Lisbon.", "胶片和长途散步。京都 → 里斯本。", "フィルム写真と散歩。京都 → リスボン。", "필름 사진과 긴 산책. 교토 → 리스본."), "body")]),
          hbox({ gap: 8 }, [button(say("Edit profile", "编辑主页", "プロフィールを編集", "프로필 편집"), { variant: "tonal", size: "xs" }, { grow: true }), button(say("Share profile", "分享主页", "プロフィールをシェア", "프로필 공유"), { variant: "tonal", size: "xs" }, { grow: true })]),
        ]),
      { suits: (l) => l.list === "plain" && l.card === "flat" },
    ),
    variant(
      "game",
      "Player card",
      ["玩家卡片", "プレイヤーカード", "플레이어 카드"],
      () =>
        hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [
          box({ surface: "chip", layout: "row", padX: 2, padY: 2 }, [avatar("AS", { size: "lg" })], { corners: round(14), look: { stroke: { width: 2, color: "tertiary" } } }),
          vbox({ gap: 6, hugWidth: false, width: 200 }, [hbox({ gap: 8 }, [text(say("Aster", "星辰", "アスター", "아스터"), "heading", { bold: true }), tag(say("Lv. 42", "42 级", "Lv. 42", "Lv. 42"), "default")]), muted(say("Guild · Dawnbreakers", "公会 · 破晓者", "ギルド · 夜明け団", "길드 · 새벽단"), "caption"), atom("progress", { value: 64, thickness: 6 }), muted("6,420 / 10,000 XP", "tiny")], { grow: true }),
        ]),
      { suits: isGame },
    ),
  ],
);

const statTile = kit(
  "stat-tile",
  "Stat tile",
  ["数据卡片", "数値タイル", "통계 타일"],
  "Data & charts",
  "analytics",
  "a card box: a muted label, the figure large and a trend (an arrow and a percentage in color, then a muted comparison); a glyph on a disc beside the figure over its label; or the figure with a progress line toward a goal",
  [
    variant("trend", "With a trend", ["带趋势", "トレンド付き", "추세 포함"], (l) =>
      vbox({ surface: "card", width: 180, hugWidth: false, padX: 16, padY: isDense(l) ? 12 : 16, gap: 4 }, [muted(say("Revenue", "收入", "売上", "매출"), "label"), text(say("$48.2k", "¥32.6万", "¥482万", "₩4,820만"), "headline", { bold: true }), hbox({ gap: 4 }, [icon("trending_up", { size: 16, color: "primary", filled: true }), text("12.5%", "caption", { color: "primary", bold: true }), muted(say("vs last month", "较上月", "前月比", "전월 대비"), "caption")])]),
    ),
    variant("icon", "With a glyph", ["带图标", "アイコン付き", "아이콘 포함"], () =>
      hbox({ surface: "card", width: 180, hugWidth: false, padX: 16, padY: 16, gap: 12 }, [disc("group", "primaryContainer", 44, 22), vbox({ gap: 0 }, [text("1,284", "title", { bold: true }), muted(say("Active users", "活跃用户", "アクティブユーザー", "활성 사용자"), "caption")])]),
    ),
    variant("goal", "Toward a goal", ["目标进度", "目標まで", "목표까지"], () =>
      vbox({ surface: "card", width: 180, hugWidth: false, padX: 16, padY: 16, gap: 6 }, [hbox({ justify: "between" }, [muted(say("Steps", "步数", "歩数", "걸음 수"), "label"), text("72%", "caption", { bold: true, color: "primary" })]), text("7,240", "headline", { bold: true }), atom("progress", { value: 72, thickness: 6 })]),
    ),
  ],
);

const POST = say(
  "Sunrise from the ridge this morning. Worth every step of the 4 a.m. start.",
  "今早在山脊上看日出，凌晨四点出发也值了。",
  "今朝は尾根から日の出。朝 4 時出発の価値ありでした。",
  "오늘 아침 능선에서 본 일출. 새벽 4시 출발이 아깝지 않았어요.",
);
const WHEN = say("2 h · Public", "2 小时前 · 公开", "2 時間前 · 公開", "2시간 전 · 공개");

const post = kit(
  "feed-post",
  "Feed post",
  ["动态帖子", "フィード投稿", "피드 게시물"],
  "Social & chat",
  "feed",
  "a feed post: a header row (avatar, name over time, more), the words, a picture and a row of like / comment / share buttons; the photo-app way (a slim header, a square picture, icon actions with save at the end, likes and caption); or a thread post with the avatar in its own column",
  [
    variant("feed", "Feed card", ["信息流卡片", "フィードカード", "피드 카드"], () =>
      vbox({ surface: "card", width: W, hugWidth: false, padX: 12, padY: 12, gap: 10 }, [
        hbox({ gap: 10 }, [avatar("MC"), lines(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), WHEN, "label"), iconButton("more_horiz", T.more, { size: "sm" })]),
        para(POST, "body"),
        image({ height: 200, alt: "" }),
        hbox({ justify: "between", gap: 0 }, [button(T.like, { variant: "text", size: "xs", icon: "thumb_up" }), button(T.comment, { variant: "text", size: "xs", icon: "chat_bubble" }), button(T.share, { variant: "text", size: "xs", icon: "share" })]),
      ]),
    ),
    variant(
      "photo",
      "Photo post",
      ["图片帖子", "写真の投稿", "사진 게시물"],
      () =>
        vbox({ width: W, hugWidth: false, gap: 8 }, [
          hbox({ padX: 4, gap: 10 }, [avatar("MC", { size: "sm" }), para(say("mia.carter", "xiaoyu", "aoi.sato", "haneul"), "label", { bold: true, maxLines: 1 }, { grow: true }), iconButton("more_horiz", T.more, { size: "xs" })]),
          image({ height: 380, alt: "" }),
          hbox({ gap: 0 }, [iconButton("favorite", T.like, { size: "sm" }), iconButton("chat_bubble", T.comment, { size: "sm" }), iconButton("send", T.share, { size: "sm" }), box({ layout: "row", padX: 0, padY: 0, hugWidth: false, width: 8, height: 8 }, [], { grow: true }), iconButton("bookmark", T.save, { size: "sm" })]),
          vbox({ padX: 4, gap: 2 }, [text(say("1,204 likes", "1,204 次赞", "「いいね！」1,204 件", "좋아요 1,204개"), "label", { bold: true }), para(POST, "body", { maxLines: 2 })]),
        ]),
      { suits: (l) => l.list === "plain" && l.card === "flat" },
    ),
    variant("thread", "Avatar in its own column", ["头像单独一栏", "アバターを左列に", "아바타 왼쪽 열"], () =>
      hbox({ width: W, hugWidth: false, padX: 0, padY: 12, gap: 12, align: "start" }, [
        avatar("MC"),
        vbox({ gap: 6, hugWidth: false, width: 200 }, [
          hbox({ gap: 6 }, [text(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), "label", { bold: true }), para(say("@mia · 2h", "@xiaoyu · 2 小时", "@aoi · 2 時間", "@haneul · 2시간"), "label", { color: "muted", maxLines: 1 }, { grow: true }), icon("more_horiz", { size: 18, color: "muted" })]),
          para(POST, "body"),
          image({ height: 180, alt: "" }),
          hbox({ justify: "between" }, [["chat_bubble", "12"], ["repeat", "4"], ["favorite", "38"], ["bar_chart", "1.2k"]].map(([g, n]) => hbox({ gap: 4 }, [icon(g, { size: 18, color: "muted", filled: g === "repeat" }), muted(n, "caption")]))),
        ], { grow: true }),
      ]),
      /* microblogs, and a messenger's moments with its square avatars */
      { suits: (l) => l.avatar === "square" },
    ),
  ],
);

const promo = kit(
  "promo-banner",
  "Promo banner",
  ["促销横幅", "プロモバナー", "프로모션 배너"],
  "Commerce",
  "campaign",
  "a tinted card: a tag, a bold title, a muted line and a button at the start with a picture at the end; a thin tinted strip with a glyph, one line and a chevron; or a game's loud banner with a starburst, a gold title and a countdown",
  [
    variant("hero", "Hero card", ["主视觉卡片", "ヒーローカード", "히어로 카드"], () =>
      hbox({ surface: "card", width: W, hugWidth: false, padX: 20, padY: 20, gap: 12 }, [
        vbox({ gap: 8, hugWidth: false, width: 180, align: "start" }, [tag(say("Limited time", "限时", "期間限定", "기간 한정"), "default"), text(say("Summer sale", "夏日大促", "サマーセール", "여름 세일"), "title", { bold: true }), muted(say("Up to 50% off", "低至五折", "最大 50% オフ", "최대 50% 할인")), button(say("Shop now", "立即抢购", "今すぐ見る", "지금 쇼핑"), { variant: "filled", size: "xs" })], { grow: true }),
        image({ width: 112, height: 112, alt: "" }),
      ], { fill: "primaryContainer" }),
    ),
    variant("strip", "Thin strip", ["细横条", "細い帯", "얇은 띠"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 10, gap: 10 }, [icon("sell", { size: 20, color: "tertiary" }), para(say("Free delivery on orders over $30", "满 99 元包邮", "3,000 円以上で送料無料", "3만 원 이상 무료 배송"), "body", { maxLines: 1 }, { grow: true }), icon("chevron_right", { size: 20, color: "muted" })], { fill: "tertiaryContainer", corners: round(12) }),
    ),
    variant(
      "game",
      "Game event banner",
      ["游戏活动横幅", "ゲームのイベントバナー", "게임 이벤트 배너"],
      () =>
        hbox({ surface: "panel", width: W, hugWidth: false, padX: 14, padY: 14, gap: 12 }, [
          svg("starburst", { width: 64, height: 64, color: "tertiary" }),
          vbox({ gap: 2, hugWidth: false, width: 160 }, [text(say("MEGA SALE", "超级特惠", "メガセール", "메가 세일"), "title", {}, { look: presetOf("gameTitle") }), muted(say("Ends in 02:14:33", "02:14:33 后结束", "残り 02:14:33", "02:14:33 후 종료"), "caption")], { grow: true }),
          button(T.go, { variant: "filled", size: "sm" }, { look: presetOf("pressedLip") }),
        ], { fill: "primaryContainer", corners: round(16) }),
      { suits: isGame },
    ),
  ],
);

const emptyNote = kit(
  "empty-note",
  "Empty state",
  ["空状态", "空の状態", "빈 상태"],
  "Feedback",
  "inbox",
  "a centered column: a glyph in a large round well, a heading, a muted line and a tonal button; just a muted glyph and one line; or a desktop's, set at the start with a primary and an outlined button",
  [
    variant("illustrated", "With a picture", ["带插图", "イラスト付き", "그림 포함"], () =>
      vbox({ width: W, hugWidth: false, padX: 24, padY: 24, gap: 12, align: "center" }, [
        box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 96, height: 96, hugWidth: false, hugHeight: false }, [icon("inbox", { size: 48, color: "primary" })], { corners: round(48) }),
        text(say("No messages yet", "还没有消息", "メッセージはまだありません", "아직 메시지가 없어요"), "title", { align: "center" }),
        para(say("When someone writes to you, it shows up here.", "有人给你发消息时，会显示在这里。", "誰かからメッセージが届くとここに表示されます。", "누군가 메시지를 보내면 여기에 표시됩니다."), "body", { color: "muted", align: "center", width: 300 }),
        button(say("Start a chat", "发起聊天", "チャットを始める", "채팅 시작"), { variant: "tonal" }),
      ]),
    ),
    variant("quiet", "Just a line", ["只有一行", "一行だけ", "한 줄만"], () =>
      vbox({ width: W, hugWidth: false, padX: 24, padY: 32, gap: 8, align: "center" }, [icon("search_off", { size: 40, color: "muted", filled: true }), muted(say("No results for “ramen”", "没有找到“拉面”", "「ラーメン」の結果はありません", "‘라멘’ 검색 결과 없음"), "body", { align: "center" })]),
    ),
    variant(
      "desk",
      "Desktop, at the start",
      ["桌面靠左", "デスクトップ・左寄せ", "데스크톱·왼쪽"],
      () =>
        vbox({ width: 480, hugWidth: false, padX: 0, padY: 24, gap: 10, align: "start" }, [
          icon("folder_open", { size: 40, color: "muted" }),
          text(say("No folder open", "没有打开的文件夹", "フォルダーが開かれていません", "열린 폴더 없음"), "heading", { bold: true }),
          para(say("Open a folder to start, or clone a repository.", "打开一个文件夹开始，或克隆一个仓库。", "フォルダーを開くか、リポジトリをクローンして始めましょう。", "폴더를 열거나 저장소를 복제해 시작하세요."), "body", { color: "muted" }),
          hbox({ gap: 8 }, [button(say("Open folder", "打开文件夹", "フォルダーを開く", "폴더 열기"), { variant: "filled", size: "xs" }), button(say("Clone repository", "克隆仓库", "リポジトリをクローン", "저장소 복제"), { variant: "outlined", size: "xs" })]),
        ]),
      { suits: isDense },
    ),
  ],
);

export const panelKits: KitDef[] = [product, plan, profile, statTile, post, promo, emptyNote];
