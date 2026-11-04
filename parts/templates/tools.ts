import { part, say, screen, txt, type Template } from "./kit";
import { homeNav } from "./words";

/* The screens every app ends up needing: settings, a form, a screen with nothing on it yet. */

const CONTROL = { onOff: "switch", open: "arrow", value: "value" };

export const tools: Template[] = [
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
        top: [part("app-bar", { title: say("Settings", "设置", "設定", "설정"), leading: "arrow_back", trailing: "" })],
        bodyProps: { padY: 8, gap: 12 },
        body: [
          part("settings-group", {
            title: say("General", "通用", "一般", "일반"),
            data: {
              columns: ["Icon", "Label", "Control", "Value"],
              rows: [
                ["notifications", say("Notifications", "通知", "通知", "알림"), CONTROL.onOff, "on"],
                ["dark_mode", say("Dark theme", "深色主题", "ダークテーマ", "어두운 테마"), CONTROL.onOff, "off"],
                ["language", say("Language", "语言", "言語", "언어"), CONTROL.open, say("English", "简体中文", "日本語", "한국어")],
              ],
            },
          }),
          part("settings-group", {
            title: say("Account", "账号", "アカウント", "계정"),
            data: {
              columns: ["Icon", "Label", "Control", "Value"],
              rows: [
                ["person", say("Personal details", "个人信息", "個人情報", "개인 정보"), CONTROL.open, ""],
                ["lock", say("Password", "密码", "パスワード", "비밀번호"), CONTROL.open, ""],
                ["info", say("Version", "版本", "バージョン", "버전"), CONTROL.value, "2.4.1"],
              ],
            },
          }),
          part("settings-group", {
            title: say("Privacy", "隐私", "プライバシー", "개인정보"),
            data: {
              columns: ["Icon", "Label", "Control", "Value"],
              rows: [
                ["visibility", say("Show my activity", "显示我的动态", "アクティビティを表示", "내 활동 표시"), CONTROL.onOff, "on"],
                ["shield", say("Two-step sign-in", "两步验证登录", "2 段階ログイン", "2단계 로그인"), CONTROL.onOff, "off"],
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
        name: say("New event", "新建活动", "新しいイベント", "새 일정"),
        top: [part("app-bar", { title: say("New event", "新建活动", "新しいイベント", "새 일정"), leading: "close", trailing: "" })],
        bodyProps: { gap: 12 },
        body: [
          part("text-field", { label: say("Title", "标题", "タイトル", "제목"), value: "", supporting: say("What is it called?", "活动叫什么？", "イベントの名前は？", "일정 이름은 무엇인가요?") }),
          part("text-field", { label: say("Place", "地点", "場所", "장소"), value: "", supporting: "", leadingIcon: "location_on" }),
          /* a date picker and a select are drawn open on the canvas and would cover the rest of the form */
          part("text-field", { label: say("Date", "日期", "日付", "날짜"), value: say("Nov 12, 2026", "2026 年 11 月 12 日", "2026 年 11 月 12 日", "2026년 11월 12일"), supporting: "", trailingIcon: "calendar_today" }),
          txt(say("Reminder", "提醒", "リマインダー", "알림"), "label", { color: "muted" }),
          part("native-select", {
            selected: 0,
            items: [{ label: say("10 minutes before", "提前 10 分钟", "10 分前", "10분 전") }, { label: say("1 hour before", "提前 1 小时", "1 時間前", "1시간 전") }, { label: say("1 day before", "提前 1 天", "1 日前", "1일 전") }],
          }),
          part("textarea", { placeholder: say("Notes", "备注", "メモ", "메모"), rows: 3 }),
          part("file-upload", {
            title: say("Add a cover picture", "添加封面图", "カバー画像を追加", "커버 사진 추가"),
            hint: say("PNG or JPG, up to 5 MB", "PNG 或 JPG，不超过 5 MB", "PNG または JPG、5 MB まで", "PNG 또는 JPG, 최대 5 MB"),
            action: say("Choose a file", "选择文件", "ファイルを選択", "파일 선택"),
          }),
          part("switch", { label: say("Invite my team", "邀请团队成员", "チームを招待", "팀 초대"), checked: true }),
          part("button", { label: say("Create event", "创建活动", "イベントを作成", "일정 만들기") }),
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
        name: say("Nothing here yet", "暂无内容", "まだ何もありません", "아직 없음"),
        top: [part("app-bar", { title: say("Projects", "项目", "プロジェクト", "프로젝트"), leading: "menu", trailing: "" })],
        bottom: [homeNav(0)],
        bodyProps: { justify: "center" },
        body: [
          part("empty", {
            icon: "folder_open",
            title: say("No projects yet", "还没有项目", "プロジェクトはまだありません", "아직 프로젝트가 없습니다"),
            description: say("Start your first one. It only takes a minute.", "创建第一个项目，只要一分钟。", "最初の一つを始めましょう。一分で済みます。", "첫 프로젝트를 시작하세요. 1분이면 충분합니다."),
            action: say("New project", "新建项目", "新しいプロジェクト", "새 프로젝트"),
          }),
        ],
      }),
    ],
  },
];
