import { col, panel, part, row, say, sayInAction, screen, txt, type Template } from "./kit";
import { homeNav, PEOPLE, WORDS } from "./words";

/* Reading, finding and playing things. */

const FACE = say("MC", "小雨", "葵", "하늘");
const CATEGORY = say("Category", "分类", "カテゴリ", "분류");

export const content: Template[] = [
  {
    slug: "search-home",
    name: "Search",
    labels: { ja: "検索", zh: "搜索页", ko: "검색" },
    category: "content",
    frame: "phone",
    icon: "search",
    build: () => [
      screen({
        id: "search",
        name: say("Search", "搜索", "検索", "검색"),
        bottom: [homeNav(1)],
        body: [
          part("search", { kind: "bar", placeholder: say("Search", "搜索", "検索", "검색"), leading: "search", trailing: "mic" }),
          part("section-header", { title: say("Recent", "最近搜索", "最近の検索", "최근 검색"), action: say("Clear", "清除", "消去", "지우기") }),
          part("chip", { kind: "assist", selected: -1, items: [{ label: say("Keyword 1", "关键词一", "検索語 1", "키워드 1") }, { label: say("Keyword 2", "关键词二", "検索語 2", "키워드 2") }, { label: say("Keyword 3", "关键词三", "検索語 3", "키워드 3") }] }),
          part("section-header", { title: say("Trending", "热门搜索", "人気の検索", "인기 검색"), action: "" }),
          part("item", {
            description: "",
            size: "sm",
            items: [
              { label: say("Trending topic one", "热门话题一", "人気のトピック 1", "인기 주제 1"), icon: "trending_up" },
              { label: say("Trending topic two", "热门话题二", "人気のトピック 2", "인기 주제 2"), icon: "trending_up" },
              { label: say("Trending topic three", "热门话题三", "人気のトピック 3", "인기 주제 3"), icon: "trending_up" },
              { label: say("Trending topic four", "热门话题四", "人気のトピック 4", "인기 주제 4"), icon: "trending_up" },
            ],
          }),
          part("section-header", { title: say("Browse", "分类浏览", "カテゴリから探す", "둘러보기"), action: "" }),
          part("icon-grid", {
            columns: 4,
            badge: "",
            items: [
              { label: say("Music", "音乐", "音楽", "음악"), icon: "music_note" },
              { label: say("Video", "视频", "動画", "동영상"), icon: "smart_display" },
              { label: say("News", "资讯", "ニュース", "뉴스"), icon: "newspaper" },
              { label: say("Places", "地点", "スポット", "장소"), icon: "location_on" },
              { label: say("Books", "图书", "本", "도서"), icon: "menu_book" },
              { label: say("Games", "游戏", "ゲーム", "게임"), icon: "sports_esports" },
              { label: say("Food", "美食", "グルメ", "음식"), icon: "restaurant" },
              { label: say("Travel", "旅行", "旅行", "여행"), icon: "flight" },
            ],
          }),
        ],
      }),
    ],
  },
  {
    slug: "video-detail",
    name: "Video",
    labels: { ja: "動画", zh: "视频详情", ko: "동영상" },
    category: "content",
    frame: "phone",
    icon: "play_circle",
    build: () => [
      screen({
        id: "video",
        name: say("Video", "视频详情", "動画", "동영상"),
        top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "more_vert" })],
        body: [
          part("video", { title: "", time: "01:24 / 03:45" }),
          col({ gap: 2 }, [txt(say("Video title", "视频标题", "動画のタイトル", "동영상 제목"), "title"), txt(say("12K views · 2 days ago", "1.2 万次观看 · 2 天前", "視聴回数 1.2 万回 · 2 日前", "조회수 1.2만회 · 2일 전"), "caption", { color: "muted" })]),
          row({ gap: 12 }, [part("avatar", { initials: FACE }), txt(PEOPLE.ada, "label", {}, { fill: true }), part("button", { label: say("Follow", "关注", "フォロー", "팔로우"), size: "sm", variant: "tonal" })]),
          part("button-group", {
            buttonVariant: "tonal",
            size: "sm",
            items: [
              { label: say("Like", "点赞", "いいね", "좋아요"), icon: "favorite" },
              { label: say("Save", "收藏", "保存", "저장"), icon: "bookmark" },
              { label: say("Share", "分享", "共有", "공유"), icon: "share" },
            ],
          }),
          part("comment-list", {
            you: say("You", "我", "自分", "나"),
            now: say("Now", "刚刚", "たった今", "방금"),
            reply: say("Reply", "回复", "返信", "답글"),
            placeholder: say("Add a comment", "写评论", "コメントを追加", "댓글 추가"),
            data: { columns: ["Name", "Time", "Comment", "Likes"], rows: [[PEOPLE.grace, say("1 h", "1 小时", "1 時間", "1시간"), say("Very clear, thank you.", "讲得很清楚，谢谢。", "とても分かりやすいです。", "아주 명확해요, 고마워요."), "12"], [PEOPLE.alan, say("3 h", "3 小时", "3 時間", "3시간"), say("Is there a second part?", "还有下一集吗？", "続きはありますか？", "다음 편도 있나요?"), "3"], [PEOPLE.marie, say("5 h", "5 小时", "5 時間", "5시간"), say("Watched it twice already.", "已经看了两遍。", "もう 2 回見ました。", "벌써 두 번 봤어요."), "1"]] },
          }),
        ],
      }),
    ],
  },
  {
    slug: "booking",
    name: "Booking",
    labels: { ja: "予約", zh: "预约", ko: "예약" },
    category: "content",
    frame: "phone",
    icon: "event_available",
    build: () => [
      screen({
        id: "booking",
        name: say("Booking", "预约", "予約", "예약"),
        top: [part("app-bar", { title: say("Choose a time", "选择时间", "日時を選ぶ", "시간 선택"), leading: "arrow_back", trailing: "" })],
        body: [
          part("item", { variant: "muted", items: [{ label: say("Service name", "服务名称", "サービス名", "서비스 이름"), icon: "event_available" }], description: say("30 minutes", "30 分钟", "30 分", "30분") }),
          /* a calendar keeps its own width: it stands in the middle of the row */
          row({ justify: "center" }, [part("calendar", { mode: "single", weekStart: "monday" })]),
          part("section-header", { title: say("Available times", "可选时间", "空いている時間", "예약 가능 시간"), action: "" }),
          part("chip", { kind: "filter", selected: 1, items: [{ label: "09:00" }, { label: "10:30" }, { label: "13:00" }, { label: "15:30" }] }),
          part("button", { label: say("Confirm", "确认预约", "予約を確定", "예약 확정"), size: "md" }),
        ],
      }),
    ],
  },
  {
    slug: "help-center",
    name: "Help center",
    labels: { ja: "ヘルプ", zh: "帮助中心", ko: "도움말" },
    category: "content",
    frame: "phone",
    icon: "help",
    build: () => [
      screen({
        id: "help",
        name: say("Help center", "帮助中心", "ヘルプ", "도움말"),
        top: [part("app-bar", { title: say("Help", "帮助中心", "ヘルプ", "도움말"), leading: "arrow_back", trailing: "" })],
        body: [
          part("search", { kind: "bar", placeholder: say("Search for help", "搜索问题", "ヘルプを検索", "도움말 검색"), trailing: "" }),
          part("section-header", { title: say("Topics", "常见主题", "トピック", "주제"), action: "" }),
          part("icon-grid", {
            columns: 4,
            badge: "",
            items: [
              { label: say("Account", "账号", "アカウント", "계정"), icon: "person" },
              { label: say("Payment", "支付", "お支払い", "결제"), icon: "payments" },
              { label: say("Privacy", "隐私", "プライバシー", "개인정보"), icon: "lock" },
              { label: say("Devices", "设备", "デバイス", "기기"), icon: "devices" },
            ],
          }),
          part("section-header", { title: say("Common questions", "常见问题", "よくある質問", "자주 묻는 질문"), action: "" }),
          part("accordion", {
            openFirst: true,
            items: [{ label: say("How do I change my password?", "如何修改密码？", "パスワードの変更方法は？", "비밀번호는 어떻게 바꾸나요?") }, { label: say("How do I cancel?", "如何取消？", "解約方法は？", "어떻게 해지하나요?") }, { label: say("Where is my data kept?", "我的数据存在哪里？", "データはどこに保存されますか？", "데이터는 어디에 보관되나요?") }, { label: say("How do I reach a person?", "如何联系人工客服？", "担当者に連絡するには？", "상담원과 어떻게 연결하나요?") }],
            content: say("Short, direct answer goes here.", "这里写简短直接的回答。", "簡潔な回答をここに書きます。", "짧고 명확한 답변을 여기에 씁니다."),
          }),
          part("button", { label: say("Contact support", "联系客服", "サポートに連絡", "고객 지원 문의"), size: "md", variant: "tonal", icon: "support_agent" }),
        ],
      }),
    ],
  },
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
        body: [
          part("search", { kind: "bar", placeholder: say("Keyword", "关键词", "キーワード", "키워드"), leading: "arrow_back", trailing: "close" }),
          part("chip", {
            kind: "filter",
            selected: 0,
            items: [{ label: say("All", "全部", "すべて", "전체") }, { label: say("Recent", "最新", "新着", "최신") }, { label: say("Popular", "热门", "人気", "인기") }],
          }),
          part("section-header", { title: say("24 results", "24 个结果", "24 件の結果", "결과 24개"), action: say("Sort", "排序", "並べ替え", "정렬") }),
          part("item", {
            items: [
              { label: say("Result one", "结果一", "結果 1", "결과 1"), icon: "article" },
              { label: say("Result two", "结果二", "結果 2", "결과 2"), icon: "image" },
              { label: say("Result three", "结果三", "結果 3", "결과 3"), icon: "smart_display" },
              { label: say("Result four", "结果四", "結果 4", "결과 4"), icon: "article" },
              { label: say("Result five", "结果五", "結果 5", "결과 5"), icon: "person" },
              { label: say("Result six", "结果六", "結果 6", "결과 6"), icon: "location_on" },
            ],
            description: say("A short line about this result", "一句话说明这条结果", "この結果の短い説明", "이 결과에 대한 짧은 설명"),
          }),
          part("button", { label: say("Show more", "查看更多", "もっと見る", "더 보기"), variant: "text" }),
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
        top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "bookmark" })],
        body: [
          part("image", { alt: say("The article's picture", "文章配图", "記事の画像", "기사 이미지"), height: 220 }),
          part("badge", { kind: "label", label: CATEGORY, variant: "secondary" }),
          txt(say("The title of the article", "文章标题", "記事のタイトル", "기사 제목"), "headline"),
          row({ gap: 12 }, [
            part("avatar", { initials: FACE }),
            col({ gap: 0 }, [txt(PEOPLE.ada, "label"), txt(say("4 min read", "阅读 4 分钟", "4 分で読めます", "4분 분량"), "caption", { color: "muted" })], { fill: true }),
          ]),
          txt(
            say(
              "The first paragraph says what this article is about and why it matters to the reader, in a few plain sentences.",
              "第一段用几句平实的话，说明这篇文章讲什么、为什么值得一读。",
              "最初の段落では、この記事の内容と読む価値を、平易な言葉で数文にまとめます。",
              "첫 문단에서는 이 글이 무엇에 관한 것이고 왜 읽을 만한지 쉬운 말로 몇 문장에 담습니다.",
            ),
          ),
          txt(
            say(
              "The next paragraph goes into the detail, with an example or two that make the point easier to picture.",
              "下一段展开细节，用一两个例子让要点更容易理解。",
              "次の段落では詳しく説明し、要点が伝わりやすいように例を一つ二つ挙げます。",
              "다음 문단에서는 자세히 설명하고, 요점을 쉽게 떠올릴 수 있도록 예를 한두 개 듭니다.",
            ),
          ),
          txt(
            say(
              "The last paragraph sums up what to remember and where to go from here.",
              "最后一段总结要记住的内容，以及接下来可以做什么。",
              "最後の段落では、覚えておきたいことと次にできることをまとめます。",
              "마지막 문단에서는 기억할 내용과 다음에 할 일을 정리합니다.",
            ),
          ),
          part("button-group", {
            buttonVariant: "tonal",
            size: "sm",
            items: [
              { label: say("Like", "点赞", "いいね", "좋아요"), icon: "favorite" },
              { label: say("Comment", "评论", "コメント", "댓글"), icon: "mode_comment" },
            ],
          }),
          part("section-header", { title: say("Read next", "继续阅读", "次に読む", "다음 글"), action: "" }),
          part("item", {
            size: "sm",
            description: "",
            trailing: "icon",
            items: [{ label: say("Another article", "另一篇文章", "別の記事", "다른 글"), icon: "article" }],
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
        body: [
          txt(say("Start free. Upgrade when you need more.", "免费开始，需要更多时再升级。", "無料で始めて、必要になったらアップグレード。", "무료로 시작하고 필요할 때 업그레이드하세요."), "title", { align: "center" }),
          part("subscription", {
            title: say("Pro", "专业版", "プロ", "프로"),
            description: say("Everything you need.", "你需要的一切。", "必要なものすべて。", "필요한 모든 것."),
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
              { label: say("Project due · Nov 27", "项目截止 · 11 月 27 日", "プロジェクト締切 · 11 月 27 日", "프로젝트 마감 · 11월 27일"), icon: "flag" },
            ],
          }),
        ],
      }),
    ],
  },
  {
    slug: "event-detail",
    name: "Event detail",
    labels: { ja: "イベント詳細", zh: "活动详情", ko: "이벤트 상세" },
    category: "content",
    frame: "phone",
    icon: "confirmation_number",
    build: () => [
      screen({
        id: "event",
        name: say("Event detail", "活动详情", "イベント詳細", "이벤트 상세"),
        top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "bookmark" })],
        bottom: [part("checkout-bar", { label: say("From", "起售价", "料金", "가격"), amount: "$25", note: say("Tickets on sale", "门票热卖中", "チケット販売中", "티켓 판매 중"), icons: [], action: say("Get tickets", "购票", "チケットを購入", "티켓 구매"), done: "" })],
        body: [
          part("image", { alt: say("The event's picture", "活动配图", "イベントの画像", "이벤트 이미지"), height: 200 }),
          part("badge", { kind: "label", label: CATEGORY, variant: "secondary" }),
          txt(say("Event name", "活动名称", "イベント名", "이벤트 이름"), "headline"),
          part("item", {
            size: "sm",
            description: "",
            items: [
              { label: say("Sat, Nov 14 · 19:30", "11 月 14 日 周六 19:30", "11 月 14 日（土）19:30", "11월 14일 (토) 19:30"), icon: "calendar_today" },
              { label: say("Venue name, City", "场馆名称，城市", "会場名、都市名", "장소 이름, 도시"), icon: "location_on" },
              { label: say("128 going", "128 人参加", "128 人が参加", "128명 참여"), icon: "group" },
            ],
          }),
          row({ gap: 12 }, [part("avatar", { initials: FACE }), col({ gap: 0 }, [txt(PEOPLE.ada, "label"), txt(say("Organizer", "主办方", "主催者", "주최자"), "caption", { color: "muted" })], { fill: true }), part("button", { label: say("Follow", "关注", "フォロー", "팔로우"), size: "sm", variant: "tonal" })]),
          col({ gap: 4 }, [txt(say("About", "活动介绍", "概要", "소개"), "title"), txt(say("A few lines about what to expect, who it is for and what to bring.", "用几句话介绍活动内容、适合人群和需要携带的物品。", "内容、対象、持ち物を数行で紹介します。", "행사 내용과 대상, 준비물을 몇 줄로 소개합니다."), "body")]),
        ],
      }),
    ],
  },
  {
    slug: "course-detail",
    name: "Course detail",
    labels: { ja: "コース詳細", zh: "课程详情", ko: "강의 상세" },
    category: "content",
    frame: "phone",
    icon: "school",
    build: () => [
      screen({
        id: "course",
        name: say("Course detail", "课程详情", "コース詳細", "강의 상세"),
        top: [part("app-bar", { title: "", leading: "arrow_back", trailing: "share", trailing2: "bookmark" })],
        bottom: [part("checkout-bar", { label: say("Price", "价格", "価格", "가격"), amount: "$29", note: say("All lessons included", "含全部课时", "全レッスン込み", "모든 강의 포함"), icons: [], action: say("Enroll", "立即报名", "受講する", "수강하기"), done: "" })],
        body: [
          part("video", { title: "", time: "00:00 / 02:10" }),
          col({ gap: 2 }, [txt(say("Course name", "课程名称", "コース名", "강의 이름"), "headline"), txt(say("4.8 · 12 lessons · 3 h 20 min", "4.8 分 · 12 节课 · 3 小时 20 分", "4.8 · 全 12 回 · 3 時間 20 分", "4.8 · 12강 · 3시간 20분"), "caption", { color: "muted" })]),
          row({ gap: 12 }, [part("avatar", { initials: FACE }), col({ gap: 0 }, [txt(PEOPLE.ada, "label"), txt(say("Instructor", "讲师", "講師", "강사"), "caption", { color: "muted" })], { fill: true })]),
          part("playlist", {
            title: say("Lessons", "课程目录", "レッスン", "강의 목록"),
            selected: 0,
            data: {
              columns: ["Title", "Detail", "Length", "State"],
              rows: [
                [say("Introduction", "课程介绍", "はじめに", "소개"), say("Free preview", "免费试看", "無料プレビュー", "무료 미리보기"), "02:10", ""],
                [say("Getting started", "入门", "基本を学ぶ", "시작하기"), say("Chapter 1", "第 1 章", "第 1 章", "1장"), "12:30", "locked"],
                [say("Core ideas", "核心内容", "重要なポイント", "핵심 내용"), say("Chapter 2", "第 2 章", "第 2 章", "2장"), "18:45", "locked"],
                [say("Practice", "练习", "実践", "실습"), say("Chapter 3", "第 3 章", "第 3 章", "3장"), "24:00", "locked"],
                [say("Final project", "结课作业", "最終課題", "최종 과제"), say("Chapter 4", "第 4 章", "第 4 章", "4장"), "16:20", "locked"],
              ],
            },
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
        body: [
          /* a cover is square, in the middle of the row */
          row({ justify: "center" }, [part("image", { alt: say("Album cover", "专辑封面", "アルバムカバー", "앨범 커버"), width: 320, height: 320 })]),
          part("audio-player", { title: say("Song title", "歌曲名称", "曲名", "곡 제목"), artist: say("Artist", "歌手", "アーティスト", "아티스트"), seconds: 214 }),
          part("playlist", {
            title: say("Queue", "播放队列", "再生キュー", "재생 대기열"),
            selected: 0,
            data: {
              columns: ["Title", "Detail", "Length", "State"],
              rows: [
                [say("Song title", "歌曲名称", "曲名", "곡 제목"), say("Artist", "歌手", "アーティスト", "아티스트"), "03:34", ""],
                [say("Next song", "下一首", "次の曲", "다음 곡"), say("Artist", "歌手", "アーティスト", "아티스트"), "04:02", ""],
                [say("Another song", "再下一首", "その次の曲", "그다음 곡"), say("Another artist", "另一位歌手", "別のアーティスト", "다른 아티스트"), "02:48", ""],
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
        top: [part("app-bar", { title: say("Route", "路线", "ルート", "경로"), leading: "arrow_back", trailing: "more_vert" })],
        body: [
          /* one column, so the notices not on show leave no hole in the preview */
          col({ gap: 16 }, [
            /* the map is a capability view: the markers are the design's example, its center where the device is once
               asked (location.current below), the real map is the product's slot */
            part("map", {
              label: say("Destination", "目的地", "目的地", "목적지"),
              height: 440,
              center: "31.2304,121.4737",
              zoom: 13,
              route: true,
              markers: { columns: ["Id", "Title", "Lat", "Lng"], rows: [["start", say("Where you are", "当前位置", "現在地", "현재 위치"), "31.2240", "121.4690"], ["end", say("Destination", "目的地", "目的地", "목적지"), "31.2397", "121.4998"]] },
            }, { bind: { center: "=vars.here != '' ? vars.here : '31.2304,121.4737'" } }),
            /* where the device is, asked when the visitor wants it; a refusal and a timeout each have a design */
            row({ gap: 8, align: "center" }, [
              part("button", { label: say("Use my location", "使用当前位置", "現在地を使う", "현재 위치 사용"), icon: "my_location", variant: "tonal", size: "sm" }, {
                action: {
                  to: "none",
                  transition: "none",
                  effects: [
                    { do: "setVar", var: "locIssue", value: "" },
                    {
                      do: "invoke",
                      capability: "location.current",
                      args: { accuracy: "'high'" },
                      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
                      then: { to: "none", transition: "none", effects: [{ do: "setVar", var: "here", value: "", expr: "result.lat + ',' + result.lng" }] },
                      catch: { to: "none", transition: "none", effects: [{ do: "setVar", var: "locIssue", value: "", expr: "error.type" }] },
                    },
                  ],
                },
              }),
            ]),
            row({ gap: 12, align: "start", padX: 16, padY: 12, fill: "surface-container-highest", radius: 12 }, [part("icon", { name: "location_disabled", size: 24, color: "error" }), txt(say("Location is off for this app. Turn it on in Settings, or type where you are.", "这个应用的定位被关闭了。请在设置中打开，或手动输入出发地。", "このアプリの位置情報がオフです。設定でオンにするか、出発地を入力してください。", "이 앱의 위치 정보가 꺼져 있습니다. 설정에서 켜거나 출발지를 입력하세요."), "caption", { color: "muted" }, { fill: true })], { showWhen: { var: "locIssue", op: "eq", value: "denied" } }),
            row({ gap: 12, align: "start", padX: 16, padY: 12, fill: "surface-container-highest", radius: 12 }, [part("icon", { name: "location_searching", size: 24, color: "error" }), txt(say("Your location could not be found. Try again outdoors.", "暂时取不到你的位置，请到开阔处重试。", "現在地を取得できませんでした。屋外でもう一度お試しください。", "위치를 찾지 못했습니다. 실외에서 다시 시도하세요."), "caption", { color: "muted" }, { fill: true })], { showWhen: { expr: "vars.locIssue != '' && vars.locIssue != 'denied'" } }),
            part("toggle-group", {
              selected: 1,
              items: [
                { label: say("Drive", "驾车", "車", "자동차"), icon: "directions_car" },
                { label: say("Transit", "公交", "電車", "대중교통"), icon: "train" },
                { label: say("Walk", "步行", "徒歩", "도보"), icon: "directions_walk" },
              ],
            }),
            part("route-card", {
              from: say("Where you are", "当前位置", "現在地", "현재 위치"),
              to: say("Destination", "目的地", "目的地", "목적지"),
              fromTime: "08:30",
              toTime: "09:05",
              duration: say("35 min", "35 分钟", "35 分", "35분"),
              note: say("Fastest route", "最快路线", "最速ルート", "최단 경로"),
              price: "",
              action: say("Start", "开始导航", "案内開始", "안내 시작"),
              /* navigating is the maps app's: the card does not say "on the way" by itself */
              done: "",
            }, {
              actions: {
                action: {
                  to: "none",
                  transition: "none",
                  effects: [{ do: "invoke", capability: "link.open", args: { url: "'https://www.openstreetmap.org/directions?route=31.2240%2C121.4690%3B31.2397%2C121.4998'" }, catch: { to: "none", transition: "none", effects: [{ do: "snackbar", message: sayInAction("The maps app could not be opened", "无法打开地图应用", "地図アプリを開けませんでした", "지도 앱을 열 수 없습니다") }] } }],
                },
              },
            }),
          ]),
        ],
      }),
    ],
    contract: () => ({ vars: [{ id: "locIssue", name: "locIssue", type: "text", value: "" }, { id: "here", name: "here", type: "text", value: "" }] }),
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
        top: [part("app-bar", { title: WORDS.wallet, leading: "", trailing: "qr_code_scanner" })],
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
        body: [
          part(
            "balance-card",
            {
              title: say("Total balance", "总资产", "残高合計", "총 잔액"),
              amount: "$12,480.50",
              change: "+2.4%",
              actions: [
                { label: say("Send", "转账", "送金", "보내기"), icon: "north_east" },
                { label: say("Receive", "收款", "受取", "받기"), icon: "south_west" },
                { label: say("Pay", "支付", "支払い", "결제"), icon: "qr_code_scanner" },
                { label: say("More", "更多", "その他", "더보기"), icon: "more_horiz" },
              ],
            },
            {
              /* paying scans the merchant's code (scan.code); what it pays is the back end's, from what was scanned */
              actions: {
                "tab:2": {
                  to: "none",
                  transition: "none",
                  effects: [
                    {
                      do: "invoke",
                      capability: "scan.code",
                      args: { formats: "['qr']" },
                      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
                      then: { to: "none", transition: "none", effects: [{ do: "snackbar", message: sayInAction("Scanned: {{result.text}}", "已扫码：{{result.text}}", "読み取りました：{{result.text}}", "스캔함: {{result.text}}") }] },
                      catch: { to: "none", transition: "none", effects: [{ do: "snackbar", message: sayInAction("Nothing was scanned", "没有扫到二维码", "読み取れませんでした", "스캔하지 못했습니다") }] },
                    },
                  ],
                },
              },
            },
          ),
          part("transaction-list", {
            filters: [{ label: say("All", "全部", "すべて", "전체") }, { label: say("Income", "收入", "入金", "입금") }, { label: say("Spending", "支出", "出金", "지출") }],
            data: {
              columns: ["Name", "Detail", "Amount"],
              rows: [
                [say("Electricity", "电费", "電気代", "전기 요금"), say("Nov 4 · Direct debit", "11 月 4 日 · 自动扣款", "11 月 4 日 · 口座振替", "11월 4일 · 자동 이체"), "-112.75"],
                [say("Refund", "退款", "返金", "환불"), say("Nov 3 · Card", "11 月 3 日 · 银行卡", "11 月 3 日 · カード", "11월 3일 · 카드"), "+24.00"],
                [say("Groceries", "买菜", "食料品", "식료품"), say("Nov 2 · Card", "11 月 2 日 · 银行卡", "11 月 2 日 · カード", "11월 2일 · 카드"), "-86.40"],
                [say("Salary", "工资", "給与", "급여"), say("Nov 1 · Bank transfer", "11 月 1 日 · 银行转账", "11 月 1 日 · 銀行振込", "11월 1일 · 계좌 이체"), "+3,200.00"],
                [say("Phone bill", "话费", "携帯料金", "휴대폰 요금"), say("Oct 30 · Direct debit", "10 月 30 日 · 自动扣款", "10 月 30 日 · 口座振替", "10월 30일 · 자동 이체"), "-35.00"],
                [say("Transfer in", "转入", "入金", "입금"), say("Oct 28 · Bank transfer", "10 月 28 日 · 银行转账", "10 月 28 日 · 銀行振込", "10월 28일 · 계좌 이체"), "+150.00"],
              ],
            },
          }),
        ],
      }),
    ],
  },
];

