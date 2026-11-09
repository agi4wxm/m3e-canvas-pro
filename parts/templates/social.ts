import { col, panel, part, row, say, screen, txt, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { atomsOf } from "./atoms";
import { homeNav, PEOPLE, WORDS } from "./words";

/* People: a feed, a profile, messages and what comes in. */

const you = "end";
const them = "start";
const line = (text: Say, align: typeof you | typeof them) => part("bubble", { text, align, variant: align === you ? "default" : "muted", reaction: "" });

/** a row of what a person can do with a picture: it stands at the edge of the screen, over the picture */
const sideAction = (icon: string, label: Say) => part("icon-button", { icon, label, variant: "tonal" });

/** what someone else said in a group: who said it stands with it */
const said = (who: Say, face: Say, text: Say) => part("message", { align: "start", variant: "muted", avatar: face, header: who, footer: "", text });
const iSaid = (text: Say) => part("message", { align: "end", variant: "default", avatar: "", header: "", footer: "", text });

const MESSAGE = say("Message", "发消息", "メッセージ", "메시지");

const tally = (icon: string, count: number): Node[] => [part("icon", { name: icon, size: 20 }), txt(String(count), "label", { width: 40 })];

/* One post-card is as many as a screen holds beside the stories, so the post with no picture is made of its pieces. */
const homeFeedScreen = (): ScreenSeed =>
  screen({
    id: "home",
    name: WORDS.home,
    top: [part("app-bar", { title: WORDS.home, leading: "", trailing: "notifications" })],
    bottom: [homeNav(0)],
    body: [
      part("story-row", {
        items: [
          { label: say("Your story", "我的故事", "あなた", "내 스토리") },
          { label: say("Mia", "小雨", "葵", "하늘") },
          { label: say("Noah", "思远", "蓮", "서준") },
          { label: say("Liam", "浩然", "陽", "지민") },
          { label: say("Ella", "一诺", "結衣", "유나") },
        ],
      }),
      part("post-card", { author: PEOPLE.ada, time: say("2 hours ago", "2 小时前", "2 時間前", "2시간 전"), text: say("Morning light over the water.", "清晨的水面。", "朝の光に包まれた水面。", "아침 햇살이 비치는 물가."), showImage: true, likes: 128, comments: 21, shares: 6 }),
      panel({ gap: 8 }, [
        row({ gap: 12 }, [
          part("avatar", { initials: say("NB", "陈", "鈴", "이") }),
          col({ gap: 0 }, [txt(PEOPLE.grace, "label", { bold: true }), txt(say("5 hours ago", "5 小时前", "5 時間前", "5시간 전"), "caption", { color: "on-surface-variant" })], { fill: true }),
        ]),
        txt(say("Finished the first draft. Tell me what to cut.", "初稿写完了，看看哪里该删。", "初稿が書けました。削るべき所を教えてください。", "초고를 끝냈어요. 뺄 부분을 알려 주세요."), "body"),
        row({ gap: 4 }, [...tally("favorite", 42), ...tally("chat_bubble", 7), ...tally("share", 2)]),
      ]),
    ],
  });

export const social: Template[] = [
  {
    slug: "me-center",
    name: "Me",
    labels: { ja: "マイページ", zh: "个人中心", ko: "마이페이지" },
    category: "social",
    frame: "phone",
    icon: "person",
    build: () => [
      screen({
        id: "me",
        name: say("Me", "我的", "マイページ", "마이페이지"),
        top: [part("app-bar", { title: say("Me", "我的", "マイページ", "마이페이지"), leading: "", trailing: "settings" })],
        bottom: [homeNav(3)],
        body: [
          row({ gap: 12 }, [part("avatar", { initials: say("MC", "小雨", "葵", "하늘"), size: "lg" }), col({ gap: 2 }, [txt(PEOPLE.ada, "title"), txt(say("View and edit your profile", "查看并编辑个人资料", "プロフィールを表示・編集", "프로필 보기 및 수정"), "caption", { color: "on-surface-variant" })], { fill: true })]),
          part("icon-grid", { columns: 4, badge: "", items: [{ label: say("Orders", "订单", "注文", "주문"), icon: "receipt_long" }, { label: say("Saved", "收藏", "保存", "저장"), icon: "bookmark" }, { label: say("History", "足迹", "履歴", "기록"), icon: "history" }, { label: say("Coupons", "优惠券", "クーポン", "쿠폰"), icon: "sell" }] }),
          part("item", {
            description: "",
            size: "sm",
            trailing: "icon",
            items: [
              { label: say("Wallet", "钱包", "ウォレット", "지갑"), icon: "account_balance_wallet" },
              { label: say("Addresses", "收货地址", "お届け先", "주소"), icon: "location_on" },
              { label: say("Notifications", "消息通知", "通知", "알림"), icon: "notifications" },
              { label: say("Privacy", "隐私", "プライバシー", "개인정보"), icon: "lock" },
              { label: say("Help and feedback", "帮助与反馈", "ヘルプとフィードバック", "도움말 및 의견"), icon: "help" },
              { label: say("About", "关于我们", "このアプリについて", "정보"), icon: "info" },
            ],
          }),
        ],
      }),
    ],
  },
  {
    slug: "contacts",
    name: "Contacts",
    labels: { ja: "連絡先", zh: "通讯录", ko: "연락처" },
    category: "social",
    frame: "phone",
    icon: "contacts",
    build: () => [
      screen({
        id: "contacts",
        name: say("Contacts", "通讯录", "連絡先", "연락처"),
        /* reached from the chats: the navigation has no entry of its own for it */
        top: [part("app-bar", { title: say("Contacts", "通讯录", "連絡先", "연락처"), leading: "arrow_back", trailing: "person_add" })],
        body: [
          atomsOf("contact-list", {
            search: say("Search", "搜索", "検索", "검색"),
            grouped: false,
            trailing: "message",
            action: MESSAGE,
            done: say("Sent", "已发送", "送信済み", "보냄"),
            data: {
              columns: ["Name", "Note"],
              rows: [
                [PEOPLE.ada, say("Designer", "设计师", "デザイナー", "디자이너")],
                [PEOPLE.grace, say("Engineer", "工程师", "エンジニア", "엔지니어")],
                [PEOPLE.alan, say("Researcher", "研究员", "研究者", "연구원")],
                [PEOPLE.katherine, say("Analyst", "分析师", "アナリスト", "분석가")],
                [PEOPLE.marie, say("Teacher", "老师", "先生", "선생님")],
                [say("Noah Bennett", "孙浩宇", "山本 健", "강도윤"), say("Doctor", "医生", "医師", "의사")],
                [say("Mia Foster", "李思琪", "中村 美咲", "윤서연"), say("Writer", "作者", "ライター", "작가")],
                [say("Owen Clarke", "吴俊杰", "小林 翔", "임하준"), say("Manager", "经理", "マネージャー", "매니저")],
                [say("Ruth Parker", "郑雅文", "加藤 花", "한지우"), say("Photographer", "摄影师", "写真家", "사진작가")],
                [say("Leo Hayes", "冯天宇", "吉田 海", "오시우"), say("Student", "学生", "学生", "학생")],
                [say("Ivy Morgan", "何若曦", "松本 優", "서하은"), say("Nurse", "护士", "看護師", "간호사")],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "ai-chat",
    name: "AI assistant",
    labels: { ja: "AI アシスタント", zh: "AI 助手", ko: "AI 어시스턴트" },
    category: "social",
    frame: "phone",
    icon: "smart_toy",
    build: () => [
      screen({
        id: "assistant",
        name: say("AI assistant", "AI 助手", "AI アシスタント", "AI 어시스턴트"),
        place: "bottom",
        top: [part("app-bar", { title: say("Assistant", "助手", "アシスタント", "어시스턴트"), leading: "menu", trailing: "edit_square" })],
        bottom: [atomsOf("chat-composer", { placeholder: say("Ask anything", "有问题尽管问", "何でも聞いてください", "무엇이든 물어보세요") })],
        body: [
          col({ gap: 12 }, [
            part("message", { align: "end", variant: "default", avatar: "", header: "", footer: "", text: say("Help me plan a three-day trip.", "帮我规划一次三天的旅行。", "3 日間の旅行を計画して。", "3일 여행 계획을 도와줘.") }),
            part("message", { align: "start", variant: "muted", avatar: "AI", header: "", footer: "", text: say("Gladly. Where to, and what do you enjoy most?", "好的。你想去哪里，最喜欢什么样的活动？", "喜んで。どこへ行きたいですか？どんなことが好きですか？", "좋아요. 어디로 가고 싶고 무엇을 가장 좋아하세요?") }),
            part("message", { align: "end", variant: "default", avatar: "", header: "", footer: "", text: say("Somewhere quiet, with good food and short walks.", "想去安静点的地方，吃得好，走得不用太多。", "静かな場所で、おいしいものと軽い散歩を楽しみたいです。", "조용한 곳에서 맛있는 음식과 가벼운 산책을 즐기고 싶어요.") }),
            part("message", {
              align: "start",
              variant: "muted",
              avatar: "AI",
              header: "",
              footer: "",
              text: say(
                "Here is a simple plan. Day one: arrive and settle in. Day two: a morning walk and a long lunch. Day three: a slow start, then home.",
                "这是一个简单的安排。第一天：抵达并安顿下来。第二天：上午散步，午餐慢慢吃。第三天：睡个懒觉，然后回家。",
                "簡単なプランです。1 日目は到着してゆっくり。2 日目は朝の散歩と遅めの昼食。3 日目はのんびりしてから帰宅。",
                "간단한 계획이에요. 첫째 날은 도착해서 쉬고, 둘째 날은 아침 산책과 여유로운 점심, 셋째 날은 느긋하게 시작해 돌아옵니다.",
              ),
            }),
          ]),
          part("chip", { kind: "assist", selected: -1, items: [{ label: say("Shorter", "再短一点", "もっと短く", "더 짧게") }, { label: say("Add a budget", "加上预算", "予算を追加", "예산 추가") }, { label: say("Another idea", "换个想法", "別の案", "다른 아이디어") }] }),
        ],
      }),
    ],
  },
  {
    slug: "short-video",
    name: "Short video",
    labels: { ja: "ショート動画", zh: "短视频", ko: "숏폼 영상" },
    category: "social",
    frame: "phone",
    icon: "smart_display",
    build: () => [
      screen({
        id: "short-video",
        name: say("Short video", "短视频", "ショート動画", "숏폼 영상"),
        scene: part("scene", { prompt: say("A vertical video still of a person talking to the camera, no text", "竖屏视频画面：一个人对着镜头说话，画面中不要有文字", "縦型動画の一場面：カメラに向かって話す人、文字なし", "세로 영상 장면: 카메라를 보고 말하는 사람, 글자 없음"), scrim: "both" }),
        top: [part("tabs", { selected: 1, variant: "secondary", items: [{ label: say("Following", "关注", "フォロー中", "팔로잉") }, { label: say("For you", "推荐", "おすすめ", "추천") }] })],
        bottom: [homeNav(0)],
        spots: [
          col({ gap: 12, width: 48, align: "center" }, [part("avatar", { initials: say("C", "创", "ク", "크") }), sideAction("favorite", say("Like", "点赞", "いいね", "좋아요")), sideAction("mode_comment", say("Comment", "评论", "コメント", "댓글")), sideAction("bookmark", say("Save", "收藏", "保存", "저장")), sideAction("share", say("Share", "分享", "共有", "공유"))], { at: { r: 12, b: 200 } }),
          panel({ gap: 2, padX: 12, padY: 8, width: 300 }, [txt(say("@creator", "@创作者", "@クリエイター", "@크리에이터"), "label"), txt(say("One sentence about this video. #topic", "一句话介绍这条视频。#话题", "この動画の紹介を一文で。#トピック", "이 영상을 한 문장으로 소개합니다. #주제"), "body")], { at: { l: 12, b: 88 } }),
        ],
      }),
    ],
  },
  { slug: "home-feed", name: "Home feed", labels: { ja: "ホームフィード", zh: "首页动态", ko: "홈 피드" }, category: "social", frame: "phone", icon: "dynamic_feed", build: () => [homeFeedScreen()] },
  {
    slug: "post-detail",
    name: "Post detail",
    labels: { ja: "投稿の詳細", zh: "动态详情", ko: "게시물 상세" },
    category: "social",
    frame: "phone",
    icon: "comment",
    build: () => [
      screen({
        id: "post",
        name: say("Post detail", "动态详情", "投稿の詳細", "게시물 상세"),
        top: [part("app-bar", { title: say("Post", "动态", "投稿", "게시물"), leading: "arrow_back", trailing: "more_vert" })],
        body: [
          part("post-card", { author: PEOPLE.ada, time: say("2 hours ago", "2 小时前", "2 時間前", "2시간 전"), text: say("A few lines about what this post shares.", "用几句话说说这条动态想分享什么。", "この投稿で伝えたいことを数行で。", "이 게시물에서 나누고 싶은 내용을 몇 줄로 적습니다."), likes: 128, comments: 3, shares: 6 }),
          atomsOf("comment-list", {
            you: say("You", "我", "自分", "나"),
            now: say("Now", "刚刚", "たった今", "방금"),
            reply: say("Reply", "回复", "返信", "답글"),
            placeholder: say("Add a comment", "写评论", "コメントを追加", "댓글 추가"),
            data: {
              columns: ["Name", "Time", "Comment", "Likes"],
              rows: [
                [PEOPLE.grace, say("1 h", "1 小时", "1 時間", "1시간"), say("Love this, thanks for sharing.", "很喜欢，谢谢分享。", "素敵です。共有ありがとう。", "정말 좋아요, 공유해 주셔서 고마워요."), "12"],
                [PEOPLE.alan, say("3 h", "3 小时", "3 時間", "3시간"), say("Where can I find out more?", "哪里可以了解更多？", "もっと詳しく知るには？", "더 알아보려면 어디로 가야 하나요?"), "3"],
                [PEOPLE.marie, say("5 h", "5 小时", "5 時間", "5시간"), say("Saved this for later.", "先收藏了。", "あとで読むために保存しました。", "나중에 보려고 저장했어요."), "1"],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "profile",
    name: "Profile",
    labels: { ja: "プロフィール", zh: "个人主页", ko: "프로필" },
    category: "social",
    frame: "phone",
    icon: "account_box",
    build: () => [
      screen({
        id: "profile",
        name: say("Profile", "个人主页", "プロフィール", "프로필"),
        top: [part("app-bar", { title: say("Profile", "个人主页", "プロフィール", "프로필"), leading: "", trailing: "share", trailing2: "settings" })],
        bottom: [homeNav(3)],
        body: [
          part("profile-header", {
            name: PEOPLE.ada,
            bio: say("A short line about this person.", "一句话介绍自己。", "自己紹介をひとことで。", "자신을 한 줄로 소개합니다."),
            stats: [{ label: say("128 Posts", "128 动态", "128 投稿", "게시물 128") }, { label: say("4.2k Followers", "4.2k 粉丝", "4.2k フォロワー", "팔로워 4.2k") }, { label: say("312 Following", "312 关注", "312 フォロー", "팔로잉 312") }],
            action: say("Edit profile", "编辑资料", "プロフィールを編集", "프로필 수정"),
            done: say("Saved", "已保存", "保存しました", "저장됨"),
          }),
          /* in a layout, so that they stand under the header rather than under the bar */
          col({ gap: 0 }, [part("tabs", { selected: 0, items: [{ label: say("Posts", "动态", "投稿", "게시물") }, { label: say("Saved", "收藏", "保存済み", "저장됨") }, { label: say("Likes", "喜欢", "いいね", "좋아요") }] })]),
          part("photo-grid", { count: 6, columns: 3 }),
        ],
      }),
    ],
  },
  {
    slug: "chat-list",
    name: "Chat list",
    labels: { ja: "チャット一覧", zh: "聊天列表", ko: "채팅 목록" },
    category: "social",
    frame: "phone",
    icon: "forum",
    build: () => [
      screen({
        id: "chats",
        name: WORDS.chats,
        top: [part("app-bar", { title: WORDS.chats, leading: "", trailing: "edit_square" })],
        bottom: [homeNav(2)],
        body: [
          part("search", { kind: "bar", placeholder: say("Search chats", "搜索聊天", "チャットを検索", "채팅 검색"), trailing: "" }),
          part("story-row", {
            add: false,
            items: [{ label: say("Noah", "思远", "蓮", "서준") }, { label: say("Liam", "浩然", "陽", "지민") }, { label: say("Ella", "一诺", "結衣", "유나") }, { label: say("Owen", "子涵", "凛", "민서") }, { label: say("Mia", "小雨", "葵", "하늘") }],
          }),
          part("conversation-list", {
            data: {
              columns: ["Name", "Last message", "Time", "Unread"],
              rows: [
                [PEOPLE.grace, say("See you at four.", "四点见。", "4 時に会いましょう。", "4시에 봬요."), "09:41", "2"],
                [say("Project team", "项目组", "プロジェクトチーム", "프로젝트 팀"), say("The files are ready.", "文件准备好了。", "ファイルの準備ができました。", "파일 준비됐어요."), WORDS.yesterday, "12"],
                [PEOPLE.alan, say("Thanks!", "谢谢！", "ありがとう！", "고마워요!"), say("Mon", "周一", "月", "월"), "0"],
                [PEOPLE.katherine, say("All good on my side.", "我这边没问题。", "こちらは問題ありません。", "저는 괜찮아요."), say("Sun", "周日", "日", "일"), "0"],
                [PEOPLE.marie, say("I will send it today.", "我今天发给你。", "今日送ります。", "오늘 보낼게요."), say("Fri", "周五", "金", "금"), "1"],
                [PEOPLE.ada, say("Here are the photos.", "照片发你了。", "写真を送ります。", "사진 보내요."), say("Thu", "周四", "木", "목"), "0"],
                [say("Family group", "家人群", "家族グループ", "가족 모임"), say("Dinner on Sunday?", "周日一起吃饭？", "日曜に夕食はどう？", "일요일에 저녁 어때요?"), say("Wed", "周三", "水", "수"), "0"],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "chat-thread",
    name: "Chat thread",
    labels: { ja: "チャット画面", zh: "聊天会话", ko: "채팅 대화" },
    category: "social",
    frame: "phone",
    icon: "chat",
    build: () => [
      screen({
        id: "thread",
        name: say("Chat thread", "聊天会话", "チャット画面", "채팅 대화"),
        top: [part("app-bar", { title: PEOPLE.grace, subtitle: say("Online", "在线", "オンライン", "온라인"), leading: "arrow_back", trailing: "call" })],
        bottom: [atomsOf("chat-composer", { placeholder: MESSAGE })],
        place: "bottom",
        body: [
          col({ gap: 8 }, [
            part("marker", { text: WORDS.today, variant: "separator" }),
            line(say("Are you free this afternoon?", "今天下午有空吗？", "今日の午後は空いていますか？", "오늘 오후에 시간 있어요?"), them),
            line(say("Yes, after three. What's up?", "有，三点以后。怎么了？", "はい、3 時以降なら。どうしましたか？", "네, 3시 이후에요. 무슨 일이에요?"), you),
            line(say("I would like your thoughts on something.", "有件事想听听你的意见。", "ご意見を聞きたいことがあります。", "의견을 듣고 싶은 게 있어요."), them),
            line(say("Sure. Send it over and I will read it first.", "好啊，发给我，我先看看。", "いいですよ。送ってください。先に読んでおきます。", "좋아요. 보내 주시면 먼저 읽어 볼게요."), you),
            line(say("Just sent it. Take your time.", "刚发了，不着急。", "今送りました。急ぎません。", "방금 보냈어요. 천천히 보세요."), them),
            line(say("Got it, thanks.", "收到，谢谢。", "受け取りました。ありがとう。", "받았어요, 고마워요."), you),
            line(say("Shall we talk at four?", "四点聊聊？", "4 時に話しませんか？", "4시에 얘기할까요?"), them),
            line(say("Four works. See you then.", "四点可以，到时见。", "4 時で大丈夫です。ではのちほど。", "4시 좋아요. 그때 봬요."), you),
            part("typing-indicator"),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "group-chat",
    name: "Group chat",
    labels: { ja: "グループチャット", zh: "群聊", ko: "그룹 채팅" },
    category: "social",
    frame: "phone",
    icon: "groups",
    build: () => [
      screen({
        id: "group",
        name: say("Group chat", "群聊", "グループチャット", "그룹 채팅"),
        top: [part("app-bar", { title: say("Group name", "群聊名称", "グループ名", "그룹 이름"), subtitle: say("8 members", "8 位成员", "メンバー 8 人", "멤버 8명"), leading: "arrow_back", trailing: "more_vert" })],
        bottom: [atomsOf("chat-composer", { placeholder: MESSAGE })],
        place: "bottom",
        body: [
          col({ gap: 12 }, [
            part("marker", { text: WORDS.today, variant: "separator" }),
            said(PEOPLE.grace, say("G", "陈", "鈴", "이"), say("Morning, everyone. Is ten still good?", "大家早，十点还可以吗？", "皆さんおはよう。10 時で大丈夫ですか？", "다들 안녕하세요. 10시 괜찮아요?")),
            said(PEOPLE.alan, say("A", "王", "高", "박"), say("Works for me.", "我可以。", "大丈夫です。", "저는 좋아요.")),
            iSaid(say("I will be there.", "我会到。", "行きます。", "저도 갈게요.")),
            row({ justify: "center" }, [txt(say("A new member joined", "有新成员加入", "新しいメンバーが参加しました", "새 멤버가 참여했어요"), "caption", { color: "on-surface-variant", width: 240, align: "center" })]),
            said(PEOPLE.katherine, say("K", "赵", "田", "최"), say("Hello! Thanks for adding me.", "大家好，谢谢拉我进群。", "こんにちは。追加ありがとうございます。", "안녕하세요! 초대해 주셔서 고마워요.")),
            said(PEOPLE.grace, say("G", "陈", "鈴", "이"), say("Welcome. The details are in the pinned note.", "欢迎。详情看置顶消息。", "ようこそ。詳細はピン留めをご覧ください。", "환영해요. 자세한 내용은 고정 메시지를 보세요.")),
            iSaid(say("See you all at ten.", "十点见。", "では 10 時に。", "10시에 봬요.")),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "notifications",
    name: "Notifications",
    labels: { ja: "通知", zh: "通知", ko: "알림" },
    category: "social",
    frame: "phone",
    icon: "notifications",
    build: () => [
      screen({
        id: "notifications",
        name: say("Notifications", "通知", "通知", "알림"),
        top: [part("app-bar", { title: say("Notifications", "通知", "通知", "알림"), leading: "arrow_back", trailing: "tune" })],
        body: [
          atomsOf("notification-list", {
            title: WORDS.today,
            unread: 2,
            markAll: say("Mark all read", "全部已读", "すべて既読", "모두 읽음"),
            data: {
              columns: ["Title", "Body", "Time", "Icon"],
              rows: [
                [say("New message", "新消息", "新しいメッセージ", "새 메시지"), say("You have a new message.", "你收到一条新消息。", "新しいメッセージが届きました。", "새 메시지가 도착했습니다."), say("5 min", "5 分钟", "5 分", "5분"), "chat"],
                [say("New follower", "新粉丝", "新しいフォロワー", "새 팔로워"), say("A new person followed you.", "有人关注了你。", "新しくフォローされました。", "새로운 사람이 팔로우했습니다."), say("1 h", "1 小时", "1 時間", "1시간"), "person_add"],
                [say("Security check", "安全提醒", "セキュリティ確認", "보안 확인"), say("A new device signed in.", "有新设备登录。", "新しい端末からログインしました。", "새 기기에서 로그인했습니다."), say("3 h", "3 小时", "3 時間", "3시간"), "shield"],
                [say("Reminder", "日程提醒", "リマインダー", "리마인더"), say("You have something planned tomorrow.", "明天有一项安排。", "明日の予定があります。", "내일 일정이 있습니다."), say("6 h", "6 小时", "6 時間", "6시간"), "event"],
              ],
            },
          }),
          atomsOf("notification-list", {
            title: say("Earlier", "更早", "以前", "이전"),
            unread: 0,
            markAll: "",
            data: {
              columns: ["Title", "Body", "Time", "Icon"],
              rows: [
                [say("New comment", "新评论", "新しいコメント", "새 댓글"), say("Someone replied to your post.", "有人回复了你的动态。", "投稿に返信がありました。", "게시물에 답글이 달렸습니다."), WORDS.yesterday, "mode_comment"],
                [say("Payment received", "付款成功", "お支払い完了", "결제 완료"), say("Your payment went through.", "你的付款已完成。", "お支払いが完了しました。", "결제가 완료되었습니다."), say("Mon", "周一", "月", "월"), "payments"],
                [say("Weekly summary", "每周摘要", "週間サマリー", "주간 요약"), say("See how your week went.", "看看这一周的情况。", "今週の様子を確認しましょう。", "이번 주를 확인해 보세요."), say("Sun", "周日", "日", "일"), "bar_chart"],
              ],
            },
          }),
          row({ justify: "center" }, [txt(say("You are all caught up", "没有更多了", "すべて確認しました", "모두 확인했습니다"), "caption", { color: "on-surface-variant", width: 240, align: "center" })]),
        ],
      }),
    ],
  },
];
