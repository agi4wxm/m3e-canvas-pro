import { atom, avatar, box, button, hbox, icon, iconButton, image, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { SCREEN, T, W, disc, isDense, isIosLike, kit, lines, muted, rule, section, tag, tile, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Rows of lists, as atoms: what leads (an avatar, a tile), two lines of words that take the rest and stop at an
 * ellipsis, and what trails (a time and a count, an amount, a chevron). Chat lists put the time on the name's line and
 * the unread count on the message's; a grouped settings list stands on a rounded card on a grey ground on an
 * iPhone, runs edge to edge with hairlines in WeChat, and sits bare under a colored heading in Material. */

const MIA = say("Mia Carter", "林小雨", "佐藤 葵", "김하늘");
const LEO = say("Leo Park", "陈子昂", "鈴木 蓮", "박지훈");
const LAST = say("See you at the station at six.", "六点车站见。", "6時に駅で会おう。", "6시에 역에서 봐요.");

/** a row of a list: a fixed width, its parts centered across it */
const row = (kids: Node[], padY = 12, gap = 16, more: Record<string, unknown> = {}, extra: Partial<Node> = {}): Node => hbox({ width: W, hugWidth: false, padX: 16, padY, gap, ...more }, kids, extra);

/** the title line of a two-line row with something at its end (a time) */
const topLine = (title: Say, end: Node, bold = true): Node => hbox({ gap: 8 }, [para(title, "lead", { bold, maxLines: 1 }, { grow: true }), end]);

const conversation = kit(
  "conversation-row",
  "Conversation row",
  ["会话行", "トークの行", "대화 행"],
  "Social & chat",
  "forum",
  "a row box: an avatar, then a column taking the rest of a name line (the name, the time at its end) over a message line (the last message cut short, an unread count at its end); denser on desktop",
  [
    variant("material", "Avatar, name, message, count", ["头像·名称·消息·未读数", "アバター・名前・メッセージ・件数", "아바타·이름·메시지·개수"], () =>
      row([avatar("MC"), vbox({ gap: 2, hugWidth: false, width: 200 }, [topLine(MIA, muted("9:41", "caption")), hbox({ gap: 8 }, [para(LAST, "body", { color: "on-surface-variant", maxLines: 1 }, { grow: true }), atom("badge", { kind: "label", label: "2" })])], { grow: true })]),
    ),
    variant(
      "im",
      "Messenger list",
      ["即时通讯列表", "メッセンジャーのリスト", "메신저 목록"],
      () =>
        row(
          [
            avatar("MC"),
            vbox({ gap: 4, hugWidth: false, width: 200 }, [topLine(MIA, muted("9:41", "caption"), false), hbox({ gap: 8 }, [para(LAST, "body", { color: "on-surface-variant", maxLines: 1 }, { grow: true }), atom("badge", { kind: "label", label: "3", variant: "destructive" })])], { grow: true }),
          ],
          12,
          12,
        ),
      { suits: (l) => l.avatar === "square" || l.list === "flush" },
    ),
    variant(
      "desk",
      "Dense, selected",
      ["紧凑·选中", "詰めた・選択中", "촘촘·선택됨"],
      () =>
        hbox({ width: 280, hugWidth: false, padX: 10, padY: 6, gap: 10 }, [avatar("MC", { size: "sm" }), vbox({ gap: 0, hugWidth: false, width: 160 }, [hbox({ gap: 6 }, [para(MIA, "label", { bold: true, maxLines: 1 }, { grow: true }), muted("9:41", "caption")]), para(LAST, "caption", { color: "on-surface-variant", maxLines: 1 })], { grow: true })], { fill: "surfaceContainerHigh", corners: round(6) }),
      { suits: isDense },
    ),
  ],
);

const contact = kit(
  "contact-row",
  "Contact row",
  ["联系人行", "連絡先の行", "연락처 행"],
  "Social & chat",
  "contacts",
  "a row box: an avatar, a name over a phone number taking the rest, and tonal call and message buttons; a letter heading over plain avatar-and-name rows parted by hairlines (messenger contacts); or a checkbox before the avatar to pick people",
  [
    variant("actions", "With call and message", ["带通话和消息", "通話・メッセージ付き", "통화·메시지"], () =>
      row([avatar("MC"), lines(MIA, say("Mobile · +1 415 555 0132", "手机 · 138 0013 8000", "携帯 · 090-1234-5678", "휴대폰 · 010-1234-5678")), hbox({ gap: 4 }, [iconButton("call", T.call, { variant: "tonal", size: "sm" }), iconButton("chat", T.message, { variant: "tonal", size: "sm" })])], 10),
    ),
    variant(
      "index",
      "Under a letter",
      ["字母分组", "頭文字ごと", "자음 묶음"],
      () =>
        vbox({ width: W, hugWidth: false, gap: 0 }, [
          hbox({ padX: 16, padY: 4 }, [muted(say("L", "L", "さ", "ㄱ"), "caption", { bold: true })], { fill: "surfaceContainerLow" }),
          hbox({ padX: 16, padY: 10, gap: 12 }, [avatar("MC"), para(MIA, "lead", { maxLines: 1 }, { grow: true })]),
          rule(),
          hbox({ padX: 16, padY: 10, gap: 12 }, [avatar("LP"), para(LEO, "lead", { maxLines: 1 }, { grow: true })]),
        ]),
      { suits: (l) => l.avatar === "square" || l.list === "flush" },
    ),
    variant("pick", "Pick people", ["选择联系人", "人を選ぶ", "사람 선택"], () =>
      row([atom("checkbox", { label: "", checked: true }), avatar("MC", { size: "sm" }), lines(MIA, say("Online", "在线", "オンライン", "온라인"))], 8, 12),
    ),
  ],
);

const notification = kit(
  "notification-row",
  "Notification row",
  ["通知行", "通知の行", "알림 행"],
  "Lists",
  "notifications",
  "a row box: a glyph on a tonal disc, a bold title with the time at its end over two muted lines, and an unread dot; an avatar, who did what and a thumbnail; or a lock-screen card: the app's tile, the sender and the time over the message",
  [
    variant("icon", "Icon, title, unread", ["图标·标题·未读", "アイコン・タイトル・未読", "아이콘·제목·안 읽음"], () =>
      row(
        [
          disc("local_shipping"),
          vbox({ gap: 2, hugWidth: false, width: 200 }, [topLine(say("Your order is on its way", "你的订单已发货", "ご注文の商品を発送しました", "주문하신 상품이 배송 중입니다"), muted(say("2m", "2 分钟", "2 分", "2분"), "caption")), para(say("Arrives tomorrow between 9 and 12. Track it any time.", "预计明天 9 点到 12 点送达，可随时查看物流。", "明日 9〜12 時にお届け予定。いつでも追跡できます。", "내일 9시~12시 도착 예정. 언제든 조회할 수 있어요."), "body", { color: "on-surface-variant", maxLines: 2 })], { grow: true }),
          atom("dot", { color: "primary", size: 8 }),
        ],
        12,
        16,
        { align: "start" },
      ),
    ),
    variant("social", "Someone did something", ["他人的动态", "誰かのアクション", "다른 사람의 활동"], () =>
      row([avatar("MC"), para(say("Mia Carter liked your photo. 2h", "林小雨赞了你的照片。2 小时", "佐藤 葵さんがあなたの写真にいいねしました。2 時間", "김하늘 님이 회원님의 사진을 좋아합니다. 2시간"), "body", { maxLines: 2 }, { grow: true }), image({ width: 44, height: 44, alt: "" })], 10, 12),
    ),
    variant(
      "card",
      "Lock-screen card",
      ["锁屏卡片", "ロック画面のカード", "잠금 화면 카드"],
      () =>
        hbox({ surface: "card", width: W, hugWidth: false, padX: 14, padY: 12, gap: 10, align: "start" }, [tile("chat", "primary", 38, 22, 9), vbox({ gap: 0, hugWidth: false, width: 200 }, [topLine(MIA, muted(say("now", "现在", "今", "지금"), "caption")), para(LAST, "body", { maxLines: 2 })], { grow: true })], { corners: round(20) }),
      { suits: isIosLike },
    ),
  ],
);

const file = kit(
  "file-row",
  "File row",
  ["文件行", "ファイルの行", "파일 행"],
  "Lists",
  "draft",
  "a row box: a colored file-type tile, the name over its size and date taking the rest, and a more button; a dense desktop row with a date and a size in columns; or an upload with a progress line and a cancel button",
  [
    variant("list", "Tile, name, details", ["图标·名称·详情", "タイル・名前・詳細", "타일·이름·세부"], () =>
      row([tile("picture_as_pdf", "tertiaryContainer"), lines(say("Q3 report.pdf", "第三季度报告.pdf", "Q3 レポート.pdf", "3분기 보고서.pdf"), say("2.4 MB · Today", "2.4 MB · 今天", "2.4 MB · 今日", "2.4 MB · 오늘")), iconButton("more_vert", T.more, { size: "sm" })], 10),
    ),
    variant(
      "table",
      "Dense, in columns",
      ["紧凑分栏", "詰めた列", "촘촘한 열"],
      () =>
        hbox({ width: 640, hugWidth: false, padX: 12, padY: 6, gap: 12 }, [
          icon("description", { size: 20, color: "primary" }),
          para(say("Q3 report.pdf", "第三季度报告.pdf", "Q3 レポート.pdf", "3분기 보고서.pdf"), "body", { maxLines: 1 }, { grow: true }),
          hbox({ gap: 0, hugWidth: false, width: 140 }, [muted(say("Nov 3, 2026", "2026年11月3日", "2026/11/03", "2026. 11. 3."), "caption")]),
          hbox({ gap: 0, hugWidth: false, width: 64, justify: "end" }, [muted("2.4 MB", "caption")]),
        ]),
      { suits: isDense },
    ),
    variant("upload", "Uploading", ["上传中", "アップロード中", "업로드 중"], () =>
      row([tile("image", "secondaryContainer"), vbox({ gap: 6, hugWidth: false, width: 200 }, [hbox({ gap: 8 }, [para(say("IMG_0412.jpg", "IMG_0412.jpg", "IMG_0412.jpg", "IMG_0412.jpg"), "label", { maxLines: 1 }, { grow: true }), muted("68%", "caption")]), atom("progress", { value: 68, thickness: 4 })], { grow: true }), iconButton("close", T.cancel, { size: "xs" })], 12),
    ),
  ],
);

/** the end of a money row: the amount over a muted line, flush right */
const amount = (sum: Say, note: Node, color = ""): Node => vbox({ gap: 2, align: "end" }, [text(sum, "label", { bold: true, color }), note]);

const transaction = kit(
  "transaction-row",
  "Transaction row",
  ["交易记录行", "取引の行", "거래 내역 행"],
  "Commerce",
  "receipt_long",
  "a row box: a merchant's glyph on a round tile (or a person's avatar), the name over a category and time taking the rest, and the amount flush right over the card or a status tag",
  [
    variant("spent", "Spent", ["支出", "支出", "지출"], (l) =>
      row([tile("local_mall", "secondaryContainer", 40, 22, 20), lines(say("Green Market", "鲜果超市", "グリーンマーケット", "그린 마켓"), say("Groceries · 9:41", "日用 · 9:41", "食料品 · 9:41", "식료품 · 9:41")), amount(say("-$86.50", "-¥86.50", "-¥1,280", "-₩12,000"), muted(say("Card ·· 4242", "银行卡 ·· 4242", "カード ·· 4242", "카드 ·· 4242"), "caption"))], isDense(l) ? 8 : 12),
    ),
    variant("received", "Received", ["收入", "入金", "입금"], (l) =>
      row([avatar("MC"), lines(MIA, say("Transfer · Yesterday", "转账 · 昨天", "送金 · 昨日", "송금 · 어제")), amount(say("+$1,200.00", "+¥1,200.00", "+¥12,000", "+₩120,000"), muted(say("Balance", "余额", "残高", "잔액"), "caption"), "primary")], isDense(l) ? 8 : 12),
    ),
    variant("pending", "Pending", ["处理中", "処理中", "처리 중"], (l) =>
      row([tile("schedule", "surfaceContainerHigh", 40, 22, 20), lines(say("City Rides", "城市出行", "シティライド", "시티 라이드"), say("Transport · 8:12", "出行 · 8:12", "交通 · 8:12", "교통 · 8:12")), vbox({ gap: 2, align: "end" }, [text(say("-$24.00", "-¥24.00", "-¥360", "-₩3,200"), "label", { bold: true, color: "on-surface-variant" }), tag(say("Pending", "处理中", "処理中", "처리 중"), "outline")])], isDense(l) ? 8 : 12),
    ),
  ],
);

const leaderboard = kit(
  "leaderboard-row",
  "Leaderboard row",
  ["排行榜行", "ランキングの行", "순위표 행"],
  "Social & chat",
  "leaderboard",
  "a row box: the rank, an avatar, a name over a level taking the rest, and the score in bold; your own row tinted; or the top three's row on a panel with a round medal and a trophy by the score",
  [
    variant("rank", "Rank and score", ["名次和分数", "順位とスコア", "순위와 점수"], () =>
      row([hbox({ gap: 0, justify: "center", hugWidth: false, width: 28 }, [text("4", "heading", { bold: true, color: "on-surface-variant" })]), avatar("LP"), lines(LEO, say("Lv. 32 · Dawnbreakers", "32 级 · 破晓者", "Lv. 32 · 夜明け団", "Lv. 32 · 새벽단")), text("8,420", "heading", { bold: true })], 10, 12),
    ),
    variant("me", "Your own row", ["我的排名", "自分の行", "내 순위"], () =>
      row([hbox({ gap: 0, justify: "center", hugWidth: false, width: 28 }, [text("12", "heading", { bold: true })]), avatar("ME"), lines(say("You", "我", "あなた", "나"), say("Lv. 28 · 320 to go", "28 级 · 还差 320", "Lv. 28 · あと 320", "Lv. 28 · 320 남음")), text("6,180", "heading", { bold: true })], 10, 12, { surface: "panel" }, { fill: "primaryContainer", corners: round(14) }),
    ),
    variant(
      "medal",
      "Medal for the top three",
      ["前三名奖牌", "上位三人のメダル", "상위 3위 메달"],
      () =>
        row(
          [
            box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 32, height: 32, hugWidth: false, hugHeight: false }, [text("1", "label", { bold: true })], { fill: "tertiaryContainer", corners: round(16), look: { stroke: { width: 2, color: "tertiary" } } }),
            avatar("MC"),
            lines(MIA, say("Lv. 60 · Legend", "60 级 · 传奇", "Lv. 60 · レジェンド", "Lv. 60 · 전설")),
            hbox({ gap: 4 }, [icon("trophy", { size: 18, filled: true, color: "tertiary" }), text("12,960", "heading", { bold: true })]),
          ],
          10,
          12,
          { surface: "panel", padX: 12 },
          { corners: round(14) },
        ),
      { suits: (l: KitLook) => l.group === "mobileGame" || l.group === "pcGame" },
    ),
  ],
);

const POPULAR = say("Popular near you", "附近热门", "近くで人気", "근처 인기");

const sectionHead = kit(
  "see-all-header",
  "Section header with See all",
  ["带“查看全部”的分区标题", "「すべて表示」付き見出し", "‘모두 보기’ 섹션 제목"],
  "Lists",
  "view_list",
  "a row: a bold heading at the start and a text button with a chevron at the end; a small muted capitalized heading over an inset group; or a large title over a muted line with a round arrow button",
  [
    variant("text", "Heading and a link", ["标题和链接", "見出しとリンク", "제목과 링크"], () =>
      hbox({ width: W, hugWidth: false, justify: "between" }, [text(POPULAR, "heading", { bold: true }), button(T.seeAll, { variant: "text", size: "xs", trailingIcon: "chevron_right" })]),
    ),
    variant(
      "caps",
      "Small capitals",
      ["小号大写", "小さな大文字", "작은 대문자"],
      () => hbox({ width: W, hugWidth: false, padX: 16, justify: "between" }, [muted(POPULAR, "caption", {}, { look: { text: { case: "upper", letterSpacing: 0.4 } } }), button(T.seeAll, { variant: "text", size: "xs" })]),
      { suits: (l) => l.list === "inset" },
    ),
    variant("large", "Large title", ["大标题", "大きな見出し", "큰 제목"], () =>
      hbox({ width: W, hugWidth: false, justify: "between", gap: 12 }, [vbox({ gap: 2, hugWidth: false, width: 200 }, [para(POPULAR, "title", { bold: true, maxLines: 1 }), para(say("Picked from what you saved", "根据你的收藏推荐", "保存した場所から", "저장한 곳 기반 추천"), "body", { color: "on-surface-variant", maxLines: 1 })], { grow: true }), iconButton("arrow_forward", T.seeAll, { variant: "tonal", size: "sm" })]),
    ),
  ],
);

const SETTINGS: [string, Say, Say, Node["fill"]][] = [
  ["wifi", say("Wi-Fi", "无线局域网", "Wi-Fi", "Wi-Fi"), say("Home", "家", "自宅", "집"), "primary"],
  ["bluetooth", say("Bluetooth", "蓝牙", "Bluetooth", "블루투스"), say("On", "打开", "オン", "켬"), "primary"],
  ["notifications", say("Notifications", "通知", "通知", "알림"), say("Allowed", "允许", "許可", "허용"), "primary"],
];
const GROUP = say("Connections", "连接", "接続", "연결");
const NOTE = say("Turn off Bluetooth to save battery when you are not using it.", "不用时关闭蓝牙可以省电。", "使わないときは Bluetooth をオフにすると電池が長持ちします。", "사용하지 않을 때 블루투스를 끄면 배터리를 아낄 수 있어요.");

const insetGroup = kit(
  "inset-group",
  "Grouped list",
  ["分组列表", "グループ化リスト", "그룹 목록"],
  "Lists",
  "view_list",
  "a column of setting rows under a heading: Material's bare rows (an icon, a name over its value) under a heading in the primary color; an iPhone's rounded card on the grey ground (a glyph on a colored tile, the name, the value and a chevron, parted by hairlines) between a capitalized heading and a footnote; or rows running edge to edge with hairlines",
  [
    variant("material", "Under a colored heading", ["彩色标题下", "色付き見出しの下", "색 제목 아래"], () =>
      vbox({ width: W, hugWidth: false, gap: 0 }, [hbox({ padX: 16, padY: 8 }, [text(GROUP, "label", { color: "primary", bold: true })]), ...SETTINGS.map(([name, label, value]) => hbox({ padX: 16, padY: 12, gap: 16 }, [icon(name, { color: "on-surface-variant", filled: true }), lines(label, value)]))]),
    ),
    variant(
      "inset",
      "Rounded card on grey",
      ["灰底圆角卡片", "グレー地の角丸カード", "회색 바탕 둥근 카드"],
      (look) =>
        vbox({ width: W, hugWidth: false, gap: 6 }, [
          hbox({ padX: 16 }, [muted(GROUP, "caption", {}, { look: { text: { case: "upper", letterSpacing: 0.4 } } })]),
          /* the hairlines start at the words, past the 30 px tile: 16 + 30 + 12 */
          section(
            SETTINGS.map(([name, label, value, fill]) => hbox({ padX: 16, padY: 10, gap: 12 }, [tile(name, fill, 30, 18, 7), para(label, "body", { maxLines: 1 }, { grow: true }), muted(value), icon("chevron_right", { size: 20, color: "on-surface-variant" })])),
            look,
            58,
            W,
            "inset",
          ),
          hbox({ padX: 16 }, [para(NOTE, "caption", { color: "on-surface-variant" }, { grow: true })]),
        ]),
      /* grouped on a card where the style groups lists, and where a game sets its rows on tiles */
      { suits: (l) => l.list === "inset" || l.list === "tile" },
    ),
    variant(
      "flush",
      "Edge to edge",
      ["通栏", "端から端まで", "가장자리까지"],
      /* cells 56 px high across the screen, the hairlines from the words: 16 + 24 + 12 */
      (look) =>
        section(
          SETTINGS.map(([name, label, value]) => hbox({ padX: 16, padY: 16, gap: 12 }, [icon(name, { color: "", filled: true }), para(label, "lead", { maxLines: 1 }, { grow: true }), muted(value), icon("chevron_right", { size: 20, color: "on-surface-variant" })])),
          look,
          52,
          SCREEN,
          "flush",
        ),
      { span: "screen", suits: (l) => l.list === "flush" || l.list === "hairline" },
    ),
  ],
);

export const rowKits: KitDef[] = [conversation, contact, notification, file, transaction, leaderboard, sectionHead, insetGroup];
