import { col, part, row, say, screen, txt, type Say, type Template } from "./kit";
import { atomsOf } from "./atoms";
import { homeNav } from "./words";

/* The screens every app ends up needing: settings, a form, a screen with nothing on it yet. */

const CONTROL = { onOff: "switch", open: "arrow", value: "value" };

/* a skeleton says its height outright: only a block goes by the prop, but the guess at its size before it is drawn reads it too */
const SKELETON = { card: 184, row: 48 };

/** the bar of a screen reached from another: a way back, and no navigation of its own */
const inner = (title: Say | string) => part("app-bar", { title, leading: "arrow_back", trailing: "" });

export const tools: Template[] = [
  {
    slug: "error-state",
    name: "Error",
    labels: { ja: "エラー", zh: "错误页", ko: "오류" },
    category: "tools",
    frame: "phone",
    icon: "error",
    build: () => [
      screen({
        id: "error",
        name: say("Error", "错误页", "エラー", "오류"),
        top: [inner("")],
        place: "center",
        body: [part("empty", { icon: "error", title: say("Something went wrong", "出错了", "問題が発生しました", "문제가 발생했습니다"), description: say("Check your connection and try again.", "请检查网络后重试。", "接続を確認してもう一度お試しください。", "연결을 확인하고 다시 시도하세요."), action: say("Try again", "重试", "再試行", "다시 시도") })],
      }),
    ],
  },
  {
    slug: "loading-state",
    name: "Loading",
    labels: { ja: "読み込み中", zh: "加载中", ko: "불러오는 중" },
    category: "tools",
    frame: "phone",
    icon: "hourglass_empty",
    build: () => [
      screen({
        id: "loading",
        name: say("Loading", "加载中", "読み込み中", "불러오는 중"),
        top: [inner(say("Title", "标题", "タイトル", "제목"))],
        body: [part("skeleton", { layout: "card", height: SKELETON.card }), ...Array.from({ length: 8 }, () => part("skeleton", { layout: "profile", height: SKELETON.row }))],
      }),
    ],
  },
  {
    slug: "permission",
    name: "Permission request",
    labels: { ja: "権限の確認", zh: "权限请求", ko: "권한 요청" },
    category: "tools",
    frame: "phone",
    icon: "shield",
    build: () => [
      screen({
        id: "permission",
        name: say("Permission request", "权限请求", "権限の確認", "권한 요청"),
        place: "center",
        body: [
          col({ gap: 24 }, [
            /* as tall as the icon it holds, which says nothing of its size before it is drawn */
            row({ justify: "center", height: 96, hugHeight: false }, [part("icon", { name: "notifications_active", size: 96, color: "primary" })]),
            col({ gap: 8 }, [
              txt(say("Turn on notifications", "开启通知", "通知をオンにする", "알림 켜기"), "headline", { align: "center" }),
              txt(say("Hear about what matters as soon as it happens.", "重要动态第一时间告诉你。", "大切なお知らせをすぐに受け取れます。", "중요한 소식을 바로 받아 보세요."), "body", { align: "center", color: "muted" }),
            ]),
            col({ gap: 8 }, [part("button", { label: say("Allow", "允许", "許可する", "허용"), size: "md" }), part("button", { label: say("Not now", "以后再说", "後で", "나중에"), size: "md", variant: "text" })]),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "feedback",
    name: "Feedback",
    labels: { ja: "フィードバック", zh: "意见反馈", ko: "의견 보내기" },
    category: "tools",
    frame: "phone",
    icon: "feedback",
    build: () => [
      screen({
        id: "feedback",
        name: say("Feedback", "意见反馈", "フィードバック", "의견 보내기"),
        top: [inner(say("Feedback", "意见反馈", "フィードバック", "의견 보내기"))],
        body: [
          /* one column: an upload comes out taller than it guesses, and what follows it must not land on it */
          col({ gap: 16 }, [
            part("chip", { kind: "filter", selected: 0, items: [{ label: say("Problem", "问题", "不具合", "문제") }, { label: say("Idea", "建议", "提案", "제안") }, { label: say("Other", "其他", "その他", "기타") }] }),
            part("textarea", { placeholder: say("Tell us what happened", "请描述你遇到的情况", "状況を教えてください", "어떤 일이 있었는지 알려 주세요"), rows: 5 }),
            part("file-upload", { title: say("Add a screenshot", "添加截图", "スクリーンショットを追加", "스크린샷 추가"), helperText: say("PNG or JPG, up to 5 MB", "PNG 或 JPG，不超过 5 MB", "PNG または JPG、5 MB まで", "PNG 또는 JPG, 최대 5 MB"), action: say("Choose a file", "选择文件", "ファイルを選択", "파일 선택") }),
            part("text-field", { label: say("Email (optional)", "邮箱（选填）", "メールアドレス（任意）", "이메일(선택)"), value: "", helperText: "" }),
            part("button", { label: say("Send", "提交", "送信", "보내기"), size: "md" }),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "about",
    name: "About",
    labels: { ja: "このアプリについて", zh: "关于", ko: "정보" },
    category: "tools",
    frame: "phone",
    icon: "info",
    build: () => [
      screen({
        id: "about",
        name: say("About", "关于", "このアプリについて", "정보"),
        top: [inner(say("About", "关于", "このアプリについて", "정보"))],
        body: [
          /* as tall as what is left of the screen, the small print held at its foot */
          col({ justify: "between", hugHeight: false }, [
            col({ gap: 16 }, [
              row({ justify: "center" }, [part("shape", { name: "sunny", color: "primary", width: 72, height: 72 })]),
              col({ gap: 4 }, [txt(say("App name", "应用名称", "アプリ名", "앱 이름"), "title", { align: "center" }), txt("1.0.0", "caption", { align: "center", color: "muted" })]),
              part("item", { description: "", size: "sm", trailing: "icon", items: [{ label: say("Terms of service", "用户协议", "利用規約", "이용약관"), icon: "description" }, { label: say("Privacy policy", "隐私政策", "プライバシーポリシー", "개인정보 처리방침"), icon: "shield" }, { label: say("Check for updates", "检查更新", "アップデートを確認", "업데이트 확인"), icon: "system_update" }] }),
            ]),
            txt(say("© 2026 Company name", "© 2026 公司名称", "© 2026 会社名", "© 2026 회사명"), "caption", { align: "center", color: "muted" }),
          ], { fill: true }),
        ],
      }),
    ],
  },
  {
    slug: "settings",
    name: "Settings",
    labels: { ja: "設定", zh: "设置", ko: "설정" },
    category: "tools",
    frame: "phone",
    icon: "settings",
    build: () => [
      screen({
        id: "settings",
        name: say("Settings", "设置", "設定", "설정"),
        top: [inner(say("Settings", "设置", "設定", "설정"))],
        body: [
          atomsOf("settings-group", {
            title: say("General", "通用", "一般", "일반"),
            data: {
              columns: ["Icon", "Label", "Control", "Value"],
              rows: [
                ["notifications", say("Notifications", "通知", "通知", "알림"), CONTROL.onOff, "on"],
                ["dark_mode", say("Dark theme", "深色主题", "ダークテーマ", "어두운 테마"), CONTROL.onOff, "off"],
                ["language", say("Language", "语言", "言語", "언어"), CONTROL.open, say("English", "简体中文", "日本語", "한국어")],
                ["info", say("Version", "版本", "バージョン", "버전"), CONTROL.value, "1.0.0"],
              ],
            },
          }),
          atomsOf("settings-group", {
            title: say("Account", "账号", "アカウント", "계정"),
            data: {
              columns: ["Icon", "Label", "Control", "Value"],
              rows: [
                ["person", say("Personal details", "个人信息", "個人情報", "개인 정보"), CONTROL.open, ""],
                ["lock", say("Password", "密码", "パスワード", "비밀번호"), CONTROL.open, ""],
                ["shield", say("Privacy", "隐私", "プライバシー", "개인정보 보호"), CONTROL.open, ""],
              ],
            },
          }),
          part("button", { label: say("Sign out", "退出登录", "ログアウト", "로그아웃"), icon: "logout", variant: "text" }),
        ],
      }),
    ],
  },
  {
    slug: "form",
    name: "Form",
    labels: { ja: "フォーム", zh: "表单", ko: "양식" },
    category: "tools",
    frame: "phone",
    icon: "edit_note",
    build: () => [
      screen({
        id: "form",
        name: say("Form", "表单", "フォーム", "양식"),
        top: [part("app-bar", { title: say("New", "新建", "新規作成", "새로 만들기"), leading: "close", trailing: "" })],
        body: [
          col({ gap: 12 }, [
            part("text-field", { label: say("Title", "标题", "タイトル", "제목"), value: "", helperText: "" }),
            /* a date picker and a select are drawn open on the canvas and would cover the rest of the form */
            col({ gap: 8 }, [
              txt(say("Category", "分类", "カテゴリ", "분류"), "label", { color: "muted" }),
              part("native-select", { selected: 0, items: [{ label: say("General", "通用", "一般", "일반") }, { label: say("Work", "工作", "仕事", "업무") }, { label: say("Personal", "个人", "個人", "개인") }] }),
            ]),
            part("text-field", { label: say("Date", "日期", "日付", "날짜"), value: say("Nov 12, 2026", "2026 年 11 月 12 日", "2026 年 11 月 12 日", "2026년 11월 12일"), helperText: "", trailingIcon: "calendar_today" }),
            part("textarea", { placeholder: say("Description", "描述", "説明", "설명"), rows: 3 }),
            part("file-upload", {
              title: say("Add an attachment", "添加附件", "添付ファイルを追加", "첨부 파일 추가"),
              helperText: say("PNG or PDF, up to 5 MB", "PNG 或 PDF，不超过 5 MB", "PNG または PDF、5 MB まで", "PNG 또는 PDF, 최대 5 MB"),
              action: say("Choose a file", "选择文件", "ファイルを選択", "파일 선택"),
            }),
            part("switch", { label: say("Notify me", "通知我", "通知する", "알림 받기"), checked: true }),
            part("button", { label: say("Create", "创建", "作成", "만들기"), size: "md" }),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "empty-state",
    name: "Empty state",
    labels: { ja: "空の状態", zh: "空状态", ko: "빈 상태" },
    category: "tools",
    frame: "phone",
    icon: "inbox",
    build: () => [
      screen({
        id: "empty",
        name: say("Empty state", "空状态", "空の状態", "빈 상태"),
        top: [part("app-bar", { title: say("Items", "列表", "一覧", "목록"), leading: "", trailing: "" })],
        bottom: [homeNav(0)],
        place: "center",
        body: [
          part("empty", {
            icon: "inbox",
            title: say("Nothing here yet", "暂无内容", "まだ何もありません", "아직 항목이 없습니다"),
            description: say("What you add will show up here.", "你添加的内容会显示在这里。", "追加したものがここに表示されます。", "추가한 항목이 여기에 표시됩니다."),
            action: say("Add", "添加", "追加", "추가"),
          }),
        ],
      }),
    ],
  },
];
