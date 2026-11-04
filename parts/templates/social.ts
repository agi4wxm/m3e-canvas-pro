import { part, row, say, screen, txt, type Say, type Template } from "./kit";
import { homeFeedScreen } from "./auth";
import { homeNav, PEOPLE, WORDS } from "./words";

/* People: a feed, a profile, messages and what comes in. */

const you = "end";
const them = "start";
const line = (text: Say, align: typeof you | typeof them) => part("bubble", { text, align, variant: align === you ? "default" : "muted", reaction: "" });

export const social: Template[] = [
  { slug: "home-feed", name: "Home feed", labels: { ja: "ホームフィード", zh: "首页动态", ko: "홈 피드" }, category: "social", frame: "phone", icon: "dynamic_feed", build: () => [homeFeedScreen()] },
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
        name: WORDS.profile,
        top: [part("app-bar", { title: WORDS.profile, leading: "menu", trailing: "settings" })],
        bottom: [homeNav(3)],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("profile-header", {
            name: PEOPLE.ada,
            bio: say("Writes about maths and engines.", "记录数学与机器的日常。", "数学と機械について書いています。", "수학과 기계에 대해 씁니다."),
            stats: [{ label: say("128 Posts", "128 动态", "128 投稿", "게시물 128") }, { label: say("4.2k Followers", "4.2k 粉丝", "4.2k フォロワー", "팔로워 4.2k") }, { label: say("312 Following", "312 关注", "312 フォロー", "팔로잉 312") }],
            action: say("Edit profile", "编辑资料", "プロフィールを編集", "프로필 수정"),
            done: say("Saved", "已保存", "保存しました", "저장됨"),
          }),
          part("item", {
            items: [
              { label: say("Saved posts", "收藏的动态", "保存した投稿", "저장한 게시물"), icon: "bookmark" },
              { label: say("Your activity", "我的活动", "アクティビティ", "내 활동"), icon: "history" },
              { label: say("Invite friends", "邀请好友", "友だちを招待", "친구 초대"), icon: "group_add" },
            ],
            description: "",
            size: "sm",
            trailing: "icon",
          }),
          part("section-header", { title: say("Latest photos", "最新照片", "最近の写真", "최근 사진"), action: say("See all", "查看全部", "すべて見る", "모두 보기") }),
          part("photo-grid", { count: 3, columns: 3 }),
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
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("search", { kind: "bar", placeholder: say("Search chats", "搜索聊天", "チャットを検索", "채팅 검색"), trailing: "" }),
          part("story-row", {
            add: false,
            items: [{ label: say("Grace", "思远", "蓮", "서준") }, { label: say("Alan", "浩然", "陽", "지민") }, { label: say("Kate", "一诺", "結衣", "유나") }, { label: say("Marie", "子涵", "凛", "민서") }, { label: say("Ada", "小雨", "葵", "하늘") }],
          }),
          part("conversation-list", {
            data: {
              columns: ["Name", "Last message", "Time", "Unread"],
              rows: [
                [PEOPLE.grace, say("See you at the review.", "评审时见。", "レビューでお会いしましょう。", "리뷰 때 봬요."), "09:41", "2"],
                [say("Design team", "设计组", "デザインチーム", "디자인 팀"), say("New mockups are up.", "新稿已上传。", "新しいモックアップを上げました。", "새 시안 올렸어요."), WORDS.yesterday, "12"],
                [PEOPLE.alan, say("Thanks!", "谢谢！", "ありがとう！", "고마워요!"), say("Mon", "周一", "月", "월"), "0"],
                [PEOPLE.katherine, say("The numbers check out.", "数字没问题。", "数字は合っています。", "숫자가 맞네요."), say("Sun", "周日", "日", "일"), "0"],
                [PEOPLE.marie, say("Sending the samples today.", "今天寄出样品。", "今日サンプルを送ります。", "오늘 샘플 보낼게요."), say("Fri", "周五", "金", "금"), "1"],
                [PEOPLE.ada, say("Photos from the trip.", "旅行的照片。", "旅行の写真です。", "여행 사진이에요."), say("Thu", "周四", "木", "목"), "0"],
                [say("Book club", "读书会", "読書会", "독서 모임"), say("Next month's pick is in.", "下个月的书选好了。", "来月の本が決まりました。", "다음 달 책이 정해졌어요."), say("Wed", "周三", "水", "수"), "0"],
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
        name: PEOPLE.grace,
        top: [part("app-bar", { title: PEOPLE.grace, subtitle: say("Online", "在线", "オンライン", "온라인"), leading: "arrow_back", trailing: "call" })],
        bottom: [part("chat-composer", { placeholder: say("Message", "发消息", "メッセージ", "메시지") })],
        bodyProps: { justify: "end", gap: 8 },
        body: [
          part("marker", { text: WORDS.today, variant: "separator" }),
          line(say("Did the mockups land?", "设计稿收到了吗？", "モックアップは届きましたか？", "시안 받으셨어요?"), them),
          line(say("Yes, they look good. One note on the header.", "收到了，很不错。页头有一点意见。", "はい、良いですね。ヘッダーに一点だけ。", "네, 좋아요. 헤더에 의견이 하나 있어요."), you),
          line(say("Go on.", "你说。", "どうぞ。", "말씀하세요."), them),
          line(say("Could the title sit a little lower?", "标题能再往下一点吗？", "タイトルをもう少し下げられますか？", "제목을 조금 내릴 수 있을까요?"), you),
          line(say("Done. See you at the review.", "改好了，评审时见。", "直しました。レビューでお会いしましょう。", "수정했어요. 리뷰 때 봬요."), them),
          part("typing-indicator"),
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
        bottom: [homeNav(0)],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("notification-list", {
            title: WORDS.today,
            unread: 2,
            markAll: say("Mark all read", "全部已读", "すべて既読", "모두 읽음"),
            data: {
              columns: ["Title", "Body", "Time", "Icon"],
              rows: [
                [say("Order shipped", "订单已发货", "注文を発送しました", "주문이 발송되었습니다"), say("Your order left the warehouse.", "你的订单已出库。", "ご注文の品が倉庫を出ました。", "주문이 창고에서 출발했습니다."), say("5 min", "5 分钟", "5 分", "5분"), "local_shipping"],
                [say("New follower", "新粉丝", "新しいフォロワー", "새 팔로워"), say("A new person followed you.", "有人关注了你。", "新しくフォローされました。", "새로운 사람이 팔로우했습니다."), say("1 h", "1 小时", "1 時間", "1시간"), "person_add"],
                [say("Security check", "安全提醒", "セキュリティ確認", "보안 확인"), say("A new device signed in.", "有新设备登录。", "新しい端末からログインしました。", "새 기기에서 로그인했습니다."), WORDS.yesterday, "shield"],
                [say("Price drop", "降价提醒", "値下げ", "가격 인하"), say("An item you saved is on sale.", "你收藏的商品降价了。", "保存した商品がセール中です。", "저장한 상품이 할인 중입니다."), WORDS.yesterday, "sell"],
              ],
            },
          }),
          part("notification-list", {
            title: say("Earlier", "更早", "以前", "이전"),
            unread: 0,
            markAll: "",
            data: {
              columns: ["Title", "Body", "Time", "Icon"],
              rows: [
                [say("Payment received", "已收到付款", "入金がありました", "결제가 완료되었습니다"), say("Your refund is on its way.", "退款正在路上。", "返金の手続きが進んでいます。", "환불이 진행 중입니다."), say("Mon", "周一", "月", "월"), "payments"],
                [say("Weekly summary", "每周摘要", "週間サマリー", "주간 요약"), say("See how your week went.", "看看这一周的情况。", "今週の様子を確認しましょう。", "이번 주를 확인해 보세요."), say("Sun", "周日", "日", "일"), "bar_chart"],
              ],
            },
          }),
          row({ justify: "center" }, [txt(say("You are all caught up", "没有更多了", "すべて確認しました", "모두 확인했습니다"), "caption", { color: "muted", width: 240, align: "center" })]),
        ],
      }),
    ],
  },
];
