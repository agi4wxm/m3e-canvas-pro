import { panel, part, row, say, screen, txt, type Template } from "./kit";
import { homeNav, PEOPLE, WORDS } from "./words";

/* Reading, finding and playing things. */

const save = say("Save", "保存", "保存", "저장");

export const content: Template[] = [
  {
    slug: "search-results",
    name: "Search results",
    labels: { ja: "検索結果", zh: "搜索结果", ko: "검색 결과" },
    category: "content",
    frame: "phone",
    icon: "manage_search",
    build: () => [
      screen({
        id: "results",
        name: say("Search results", "搜索结果", "検索結果", "검색 결과"),
        bottom: [homeNav(1)],
        top: [part("app-bar", { title: say("Search", "搜索", "検索", "검색"), leading: "arrow_back", trailing: "" })],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("search", { kind: "bar", placeholder: say("Canvas bags", "帆布包", "キャンバスバッグ", "캔버스 가방"), leading: "search", trailing: "close" }),
          part("chip", {
            kind: "filter",
            selected: 0,
            items: [{ label: say("All", "全部", "すべて", "전체") }, { label: say("Under $50", "$50 以下", "$50 以下", "$50 이하") }, { label: say("Nearby", "附近", "近く", "근처") }],
          }),
          part("section-header", { title: say("24 results", "24 个结果", "24 件の結果", "결과 24개"), action: say("Sort", "排序", "並べ替え", "정렬") }),
          part("item", {
            items: [
              { label: say("Everyday canvas tote", "日常帆布包", "毎日使えるキャンバストート", "데일리 캔버스 토트백"), icon: "shopping_bag" },
              { label: say("Waxed canvas backpack", "蜡染帆布双肩包", "ワックスキャンバスのリュック", "왁스 캔버스 백팩"), icon: "backpack" },
              { label: say("Canvas laptop sleeve", "帆布电脑包", "キャンバスの PC ケース", "캔버스 노트북 파우치"), icon: "laptop_mac" },
              { label: say("Roll-top canvas bag", "卷口帆布包", "ロールトップバッグ", "롤탑 캔버스 가방"), icon: "luggage" },
              { label: say("Canvas shoulder bag", "帆布单肩包", "キャンバスのショルダーバッグ", "캔버스 숄더백"), icon: "work" },
            ],
            description: "",
            trailing: "icon",
          }),
          part("section-header", { title: say("Related searches", "相关搜索", "関連する検索", "관련 검색어"), action: "" }),
          part("chip", {
            kind: "assist",
            selected: -1,
            items: [{ label: say("Tote bags", "托特包", "トートバッグ", "토트백") }, { label: say("Backpacks", "双肩包", "リュック", "백팩") }, { label: say("Waxed cotton", "蜡棉", "ワックスコットン", "왁스 면") }],
          }),
        ],
      }),
    ],
  },
  {
    slug: "article-detail",
    name: "Article",
    labels: { ja: "記事", zh: "文章详情", ko: "기사" },
    category: "content",
    frame: "phone",
    icon: "article",
    build: () => [
      screen({
        id: "article",
        name: say("Article", "文章", "記事", "기사"),
        /* an article runs on: the body scrolls under its bar in the preview */
        length: 964,
        top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "bookmark" })],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("image", { alt: say("A harbour at dawn", "清晨的海港", "夜明けの港", "새벽의 항구"), height: 220, radius: 20 }),
          part("badge", { kind: "label", label: say("Travel", "旅行", "旅", "여행"), variant: "secondary" }),
          txt(say("A morning at the harbour", "海港的清晨", "港の朝", "항구의 아침"), "headline"),
          row({ gap: 12 }, [
            part("avatar", { initials: say("AL", "小雨", "葵", "하늘") }),
            txt(say("Ada Lovelace · 4 min read", "林小雨 · 阅读 4 分钟", "佐藤 葵 · 4 分で読めます", "김하늘 · 4분 분량"), "label", { color: "muted" }, { fill: true }),
          ]),
          txt(
            say(
              "The boats come in before the town wakes up. By six the first crates are on the quay, and the cafes along the water have their shutters half open.",
              "小镇还没醒，渔船已经靠岸。六点钟，第一批货箱摆上码头，沿岸的咖啡馆也半开了门。",
              "町が目を覚ます前に船が戻ってきます。六時には最初の木箱が岸壁に並び、水辺のカフェはシャッターを半分開けています。",
              "마을이 깨기 전에 배들이 들어옵니다. 여섯 시면 첫 상자들이 부두에 놓이고, 물가의 카페들은 셔터를 반쯤 올립니다.",
            ),
          ),
          txt(
            say(
              "Stay for an hour and you will see the whole place change hands, from the people who work the night to the people who walk the morning.",
              "待上一小时，你会看到这里从夜班的人交到晨练的人手中。",
              "一時間もいれば、夜に働く人から朝を歩く人へ、この場所が移り変わるのが見えます。",
              "한 시간만 머물면 밤에 일하는 사람들에서 아침을 걷는 사람들로 이곳이 넘어가는 것을 볼 수 있습니다.",
            ),
          ),
          part("button-group", {
            buttonVariant: "tonal",
            size: "sm",
            items: [
              { label: say("Like", "点赞", "いいね", "좋아요"), icon: "favorite" },
              { label: save, icon: "bookmark" },
              { label: say("Share", "分享", "共有", "공유"), icon: "share" },
            ],
          }),
          part("section-header", { title: say("Comments", "评论", "コメント", "댓글"), action: "" }),
          part("comment-list", {
            you: say("You", "我", "自分", "나"),
            now: say("Now", "刚刚", "たった今", "방금"),
            reply: say("Reply", "回复", "返信", "답글"),
            placeholder: say("Add a comment", "写评论", "コメントを追加", "댓글 추가"),
            data: {
              columns: ["Name", "Time", "Comment", "Likes"],
              rows: [
                [PEOPLE.grace, say("1 h", "1 小时", "1 時間", "1시간"), say("I could smell the salt from here.", "仿佛闻到了海的味道。", "潮の香りがしてきそうです。", "바다 냄새가 나는 것 같아요."), "12"],
                [PEOPLE.alan, say("3 h", "3 小时", "3 時間", "3시간"), say("Which cafe do you go to?", "你去的是哪家咖啡馆？", "どのカフェに行きますか？", "어느 카페에 가세요?"), "3"],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "pricing",
    name: "Pricing",
    labels: { ja: "料金プラン", zh: "价格方案", ko: "요금제" },
    category: "content",
    frame: "phone",
    icon: "payments",
    build: () => [
      screen({
        id: "pricing",
        name: say("Pricing", "价格", "料金", "요금"),
        top: [part("app-bar", { title: say("Choose a plan", "选择方案", "プランを選ぶ", "요금제 선택"), leading: "close", trailing: "" })],
        bodyProps: { gap: 16 },
        body: [
          txt(say("Start free. Upgrade when you need more.", "免费开始，需要更多时再升级。", "無料で始めて、必要になったらアップグレード。", "무료로 시작하고 필요할 때 업그레이드하세요."), "title", { align: "center" }),
          part("subscription", {
            title: say("Pro", "专业版", "プロ", "프로"),
            description: say("Everything you need to ship.", "发布所需的一切。", "リリースに必要なものすべて。", "출시에 필요한 모든 것."),
            plans: [
              { label: say("Monthly · $12", "按月 · $12", "月払い · $12", "월간 · $12") },
              { label: say("Yearly · $96 (save 33%)", "按年 · $96（省 33%）", "年払い · $96（33% お得）", "연간 · $96 (33% 할인)") },
            ],
            action: say("Start 14-day trial", "开始 14 天试用", "14 日間の試用を開始", "14일 체험 시작"),
          }),
          panel({ gap: 4 }, [
            txt(say("What you get", "包含内容", "含まれるもの", "포함 내용"), "label", { color: "muted" }),
            part("item", {
              size: "sm",
              description: "",
              items: [
                { label: say("Unlimited projects", "不限项目数", "プロジェクト無制限", "프로젝트 무제한"), icon: "check" },
                { label: say("Team sharing", "团队共享", "チームで共有", "팀 공유"), icon: "check" },
                { label: say("Priority support", "优先支持", "優先サポート", "우선 지원"), icon: "check" },
              ],
            }),
          ]),
          part("button", { label: say("Stay on the free plan", "继续使用免费版", "無料プランのまま使う", "무료 요금제 유지"), variant: "text" }),
          part("accordion", {
            openFirst: false,
            items: [{ label: say("Can I cancel at any time?", "可以随时取消吗？", "いつでも解約できますか？", "언제든 해지할 수 있나요?") }, { label: say("What happens to my work?", "我的内容会怎样？", "作品はどうなりますか？", "제 작업물은 어떻게 되나요?") }],
            content: say("Yes. Your work stays yours, and you can take it with you.", "可以。你的内容始终属于你，可以随时带走。", "はい。作品はあなたのもので、持ち出せます。", "네. 작업물은 언제나 당신의 것이며 가져갈 수 있습니다."),
          }),
        ],
      }),
    ],
  },
  {
    slug: "calendar",
    name: "Calendar",
    labels: { ja: "カレンダー", zh: "日历", ko: "달력" },
    category: "content",
    frame: "phone",
    icon: "calendar_month",
    build: () => [
      screen({
        id: "calendar",
        name: say("Calendar", "日历", "カレンダー", "달력"),
        top: [part("app-bar", { title: say("Calendar", "日历", "カレンダー", "달력"), leading: "menu", trailing: "add" })],
        bottom: [homeNav(0)],
        bodyProps: { padY: 8 },
        body: [
          part("agenda", {
            year: 2026,
            month: 11,
            day: 4,
            empty: say("Nothing planned", "没有安排", "予定はありません", "일정 없음"),
            data: {
              columns: ["Date", "Time", "Title"],
              rows: [
                ["2026-11-04", "09:30", say("Team stand-up", "团队站会", "チーム朝会", "팀 스탠드업")],
                ["2026-11-04", "14:00", say("Design review", "设计评审", "デザインレビュー", "디자인 리뷰")],
                ["2026-11-12", say("All day", "全天", "終日", "종일"), say("Company holiday", "公司假日", "会社の休日", "회사 휴일")],
                ["2026-11-20", "18:30", say("Dinner with friends", "和朋友聚餐", "友人と夕食", "친구들과 저녁")],
              ],
            },
          }),
          part("section-header", { title: say("Coming up", "接下来", "今後の予定", "다가오는 일정"), action: say("See all", "查看全部", "すべて見る", "모두 보기") }),
          part("item", {
            size: "sm",
            description: "",
            items: [
              { label: say("Company holiday · Nov 12", "公司假日 · 11 月 12 日", "会社の休日 · 11 月 12 日", "회사 휴일 · 11월 12일"), icon: "event" },
              { label: say("Dinner with friends · Nov 20", "和朋友聚餐 · 11 月 20 日", "友人と夕食 · 11 月 20 日", "친구들과 저녁 · 11월 20일"), icon: "restaurant" },
            ],
          }),
        ],
      }),
    ],
  },
  {
    slug: "music-player",
    name: "Music player",
    labels: { ja: "音楽プレーヤー", zh: "音乐播放器", ko: "음악 플레이어" },
    category: "content",
    frame: "phone",
    icon: "music_note",
    build: () => [
      screen({
        id: "player",
        name: say("Now playing", "正在播放", "再生中", "재생 중"),
        top: [part("app-bar", { title: say("Now playing", "正在播放", "再生中", "재생 중"), leading: "keyboard_arrow_down", trailing: "more_vert", centered: true })],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("image", { alt: say("Album cover", "专辑封面", "アルバムカバー", "앨범 커버"), height: 380, radius: 28 }),
          part("audio-player", { title: say("Harbour lights", "港湾灯火", "港の灯り", "항구의 불빛"), artist: say("The Early Tide", "早潮乐队", "朝潮バンド", "이른 물결"), seconds: 214 }),
          part("playlist", {
            title: say("Up next", "接下来播放", "次に再生", "다음 곡"),
            selected: 0,
            data: {
              columns: ["Title", "Detail", "Length", "State"],
              rows: [
                [say("Harbour lights", "港湾灯火", "港の灯り", "항구의 불빛"), say("The Early Tide", "早潮乐队", "朝潮バンド", "이른 물결"), "03:34", ""],
                [say("Salt and rope", "盐与绳", "塩とロープ", "소금과 밧줄"), say("The Early Tide", "早潮乐队", "朝潮バンド", "이른 물결"), "04:02", ""],
                [say("Slow water", "慢水", "ゆるやかな水", "느린 물"), say("Marine Layer", "海雾", "海霧", "바다 안개"), "02:48", ""],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "map-route",
    name: "Map and route",
    labels: { ja: "地図とルート", zh: "地图与路线", ko: "지도와 경로" },
    category: "content",
    frame: "phone",
    icon: "alt_route",
    build: () => [
      screen({
        id: "route",
        name: say("Route", "路线", "ルート", "경로"),
        top: [part("app-bar", { title: say("To the harbour", "前往海港", "港まで", "항구까지"), leading: "arrow_back", trailing: "more_vert" })],
        /* a route is reached from the map, not from a tab: its bar acts on the route */
        bottom: [
          part("toolbar", {
            kind: "docked",
            items: [
              { label: say("Start", "开始", "開始", "시작"), icon: "navigation" },
              { label: say("Steps", "步骤", "手順", "단계"), icon: "format_list_bulleted" },
              { label: say("Share", "分享", "共有", "공유"), icon: "share" },
            ],
          }),
        ],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("map", { label: say("Central Station", "中央车站", "中央駅", "중앙역") }, { fill: true }),
          part("toggle-group", {
            selected: 1,
            items: [
              { label: say("Drive", "驾车", "車", "자동차"), icon: "directions_car" },
              { label: say("Transit", "公交", "電車", "대중교통"), icon: "train" },
              { label: say("Walk", "步行", "徒歩", "도보"), icon: "directions_walk" },
            ],
          }),
          part("route-card", {
            from: say("Central Station", "中央车站", "中央駅", "중앙역"),
            to: say("Harbour Terminal", "海港码头", "港ターミナル", "항구 터미널"),
            duration: say("1 h 35 min", "1 小时 35 分", "1 時間 35 分", "1시간 35분"),
            note: say("Seat 12A", "座位 12A", "座席 12A", "좌석 12A"),
            price: "$18.00",
            action: say("Book", "预订", "予約", "예약"),
            done: say("Booked", "已预订", "予約済み", "예약됨"),
          }),
        ],
      }),
    ],
  },
  {
    slug: "wallet",
    name: "Wallet",
    labels: { ja: "ウォレット", zh: "钱包", ko: "지갑" },
    category: "content",
    frame: "phone",
    icon: "account_balance_wallet",
    build: () => [
      screen({
        id: "wallet",
        name: WORDS.wallet,
        top: [part("app-bar", { title: WORDS.wallet, leading: "menu", trailing: "qr_code_scanner" })],
        bottom: [
          part("navigation-bar", {
            selected: 1,
            items: [
              { label: WORDS.home, icon: "home" },
              { label: WORDS.wallet, icon: "account_balance_wallet" },
              { label: say("Activity", "动态", "履歴", "활동"), icon: "receipt_long" },
              { label: WORDS.profile, icon: "person" },
            ],
          }),
        ],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("balance-card", {
            title: say("Total balance", "总资产", "残高合計", "총 잔액"),
            amount: "$12,480.50",
            change: "+2.4%",
            actions: [
              { label: say("Send", "转账", "送金", "보내기"), icon: "north_east" },
              { label: say("Receive", "收款", "受取", "받기"), icon: "south_west" },
              { label: say("Pay", "支付", "支払い", "결제"), icon: "qr_code_scanner" },
              { label: say("More", "更多", "その他", "더보기"), icon: "more_horiz" },
            ],
          }),
          part("transaction-list", {
            filters: [{ label: say("All", "全部", "すべて", "전체") }, { label: say("Income", "收入", "入金", "입금") }, { label: say("Spending", "支出", "出金", "지출") }],
            data: {
              columns: ["Name", "Detail", "Amount"],
              rows: [
                [say("Salary", "工资", "給与", "급여"), say("Nov 1 · Bank transfer", "11 月 1 日 · 银行转账", "11 月 1 日 · 銀行振込", "11월 1일 · 계좌 이체"), "+3,200.00"],
                [say("Groceries", "买菜", "食料品", "식료품"), say("Nov 2 · Card", "11 月 2 日 · 银行卡", "11 月 2 日 · カード", "11월 2일 · 카드"), "-86.40"],
                [say("Refund", "退款", "返金", "환불"), say("Nov 3 · Card", "11 月 3 日 · 银行卡", "11 月 3 日 · カード", "11월 3일 · 카드"), "+24.00"],
                [say("Electricity", "电费", "電気代", "전기 요금"), say("Nov 4 · Direct debit", "11 月 4 日 · 自动扣款", "11 月 4 日 · 口座振替", "11월 4일 · 자동 이체"), "-112.75"],
              ],
            },
          }),
          part("coupon", {
            amount: "$10",
            condition: say("Over $50", "满 $50 可用", "$50 以上で利用可", "$50 이상 사용 가능"),
            title: say("Cashback offer", "返现优惠", "キャッシュバック特典", "캐시백 혜택"),
            expiry: say("Until Dec 31", "12 月 31 日前有效", "12 月 31 日まで", "12월 31일까지"),
            action: say("Claim", "领取", "受け取る", "받기"),
            done: say("Claimed", "已领取", "受取済み", "받음"),
          }),
        ],
      }),
    ],
  },
];

