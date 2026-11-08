import { col, deskScreen, grid, panel, part, row, say, screen, split, txt, type Node, type Say, type Template } from "./kit";
import { AUTH_WORDS, PEOPLE } from "./words";

/* Screens for a window rather than a hand: a dashboard, a back office table, a landing page. */

const sidebar = (selected: number): Node =>
  part("sidebar", {
    label: say("Workspace", "工作区", "ワークスペース", "워크스페이스"),
    selected,
    width: 240,
    items: [
      { label: say("Overview", "总览", "概要", "개요"), icon: "dashboard" },
      { label: say("Items", "条目", "アイテム", "항목"), icon: "view_list" },
      { label: say("People", "成员", "メンバー", "구성원"), icon: "group" },
      { label: say("Reports", "报表", "レポート", "보고서"), icon: "bar_chart" },
      { label: say("Settings", "设置", "設定", "설정"), icon: "settings" },
    ],
  });

const stat = (title: Say, value: string, trend: string, direction = "up"): Node => part("stat-card", { title, value, trend, direction });

const MONTHS = [say("Jan", "1 月", "1 月", "1월"), say("Feb", "2 月", "2 月", "2월"), say("Mar", "3 月", "3 月", "3월"), say("Apr", "4 月", "4 月", "4월"), say("May", "5 月", "5 月", "5월"), say("Jun", "6 月", "6 月", "6월")];
const REVENUE = ["186", "305", "237", "273", "209", "314"];
const VISITS = ["80", "200", "120", "190", "130", "240"];

const STATUS = { active: say("Active", "进行中", "進行中", "진행 중"), pending: say("Pending", "待处理", "保留中", "대기 중"), archived: say("Archived", "已归档", "アーカイブ済み", "보관됨") };

const DAY = { mon: say("Mon", "周一", "月", "월"), tue: say("Tue", "周二", "火", "화"), wed: say("Wed", "周三", "水", "수"), thu: say("Thu", "周四", "木", "목"), fri: say("Fri", "周五", "金", "금"), sat: say("Sat", "周六", "土", "토"), sun: say("Sun", "周日", "日", "일") };

const SEARCH = say("Search", "搜索", "検索", "검색");

/** a pane holding a split view of its own, which takes all of it */
const holding = (inner: Node, name: Say): Node => col({ gap: 0 }, [{ ...inner, fill: true }], { name });

const PANE = {
  list: say("Message list", "邮件列表", "メール一覧", "메일 목록"),
  reading: say("Reading pane", "阅读窗格", "閲覧ウィンドウ", "읽기 창"),
  files: say("Files", "文件", "ファイル", "파일"),
  details: say("Details", "详细信息", "詳細", "세부 정보"),
  editors: say("Editors", "编辑区", "エディター", "편집기"),
  terminal: say("Terminal", "终端", "ターミナル", "터미널"),
  work: say("Work area", "工作区", "作業領域", "작업 영역"),
};

const feature = (icon: string, title: Say, description: Say): Node => panel({ gap: 8, padY: 20 }, [part("icon", { name: icon, size: 32, color: "primary" }), txt(title, "title"), txt(description, "body", { color: "muted" })]);

const plan = (title: Say, price: string, description: Say, action: Say, variant: string): Node => panel({ gap: 8, padY: 20 }, [txt(title, "title"), txt(price, "headline", { bold: true }), txt(description, "body", { color: "muted" }), part("button", { label: action, variant })]);

/** a row of icon buttons, as tight as it is wide */
const actions = (icons: [string, Say][]): Node => row({ gap: 4, hugWidth: true }, icons.map(([icon, label]) => part("icon-button", { icon, label })));

const ACT = {
  archive: say("Archive", "归档", "アーカイブ", "보관"),
  remove: say("Delete", "删除", "削除", "삭제"),
  unread: say("Mark as unread", "标为未读", "未読にする", "읽지 않음으로 표시"),
  more: say("More", "更多", "その他", "더 보기"),
  compose: say("New message", "写邮件", "メッセージを作成", "새 메일"),
  call: say("Call", "语音通话", "音声通話", "음성 통화"),
  video: say("Video call", "视频通话", "ビデオ通話", "영상 통화"),
};

/** one line of a conversation, on the side of whoever said it: a bubble is no wider than a reading line, and the row takes it there */
const said = (text: Say, mine: boolean): Node => row({ justify: mine ? "end" : "start" }, [part("bubble", { text, align: mine ? "end" : "start", variant: mine ? "default" : "muted", reaction: "", width: 560 })]);

const CODE_MAIN = `function total(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.price * item.count;
  }
  return sum;
}

function average(items) {
  if (items.length === 0) {
    return 0;
  }
  return total(items) / items.length;
}

function largest(items) {
  let top = items[0];
  for (const item of items) {
    if (item.price > top.price) top = item;
  }
  return top;
}

export { total, average, largest };`;

const CODE_TEST = `import { total, average, largest } from "./main";

const items = [
  { price: 2, count: 3 },
  { price: 5, count: 1 },
];

test("adds up", () => {
  expect(total(items)).toBe(11);
});

test("is zero when empty", () => {
  expect(total([])).toBe(0);
});

test("finds the mean", () => {
  expect(average(items)).toBe(5.5);
});

test("finds the largest", () => {
  expect(largest(items).price).toBe(5);
});`;

export const desktop: Template[] = [
  {
    slug: "desktop-login",
    name: "Desktop sign-in",
    labels: { ja: "デスクトップログイン", zh: "桌面登录页", ko: "데스크톱 로그인" },
    category: "desktop",
    frame: "desktop",
    icon: "login",
    build: () => [
      deskScreen({
        id: "desk-login",
        name: say("Sign in", "登录", "ログイン", "로그인"),
        /* half the window for a picture, kept off its edges, and the form standing in the middle of the other half */
        side: col({ width: 640, padX: 16, padY: 16, hugHeight: false }, [part("image", { alt: say("Brand picture", "品牌图", "ブランド画像", "브랜드 이미지") }, { fill: true })]),
        bodyProps: { align: "center", justify: "center" },
        body: [part("auth-form", { mode: "sign-in", width: 400, ...AUTH_WORDS })],
      }),
    ],
  },
  {
    slug: "desktop-settings",
    name: "Desktop settings",
    labels: { ja: "デスクトップ設定", zh: "桌面设置页", ko: "데스크톱 설정" },
    category: "desktop",
    frame: "desktop",
    icon: "settings",
    build: () => [
      deskScreen({
        id: "desk-settings",
        name: say("Settings", "设置", "設定", "설정"),
        side: sidebar(4),
        body: [
          txt(say("Settings", "设置", "設定", "설정"), "headline"),
          row({}, [part("tabs", { selected: 0, width: 480, items: [{ label: say("General", "通用", "一般", "일반") }, { label: say("Account", "账号", "アカウント", "계정") }, { label: say("Notifications", "通知", "通知", "알림") }] })]),
          row({ gap: 16, align: "start" }, [
            panel({ gap: 16, padX: 24 }, [
              txt(say("Profile", "个人资料", "プロフィール", "프로필"), "title"),
              row({ gap: 12 }, [part("avatar", { initials: say("MC", "小雨", "葵", "하늘"), size: "lg" }), part("button", { label: say("Change photo", "更换头像", "写真を変更", "사진 변경"), variant: "tonal", size: "sm" })]),
              grid(2, {}, [
                part("text-field", { label: say("Name", "姓名", "名前", "이름"), value: "", supporting: "" }),
                part("text-field", { label: say("Email", "邮箱", "メールアドレス", "이메일"), value: "", supporting: "" }),
                part("text-field", { label: say("Phone", "电话", "電話番号", "전화번호"), value: "", supporting: "" }),
                part("text-field", { label: say("Location", "所在地", "所在地", "위치"), value: "", supporting: "" }),
              ]),
              part("textarea", { placeholder: say("A short bio", "个人简介", "自己紹介", "짧은 소개"), rows: 3 }),
              row({ justify: "end" }, [part("button", { label: say("Save changes", "保存修改", "変更を保存", "변경 저장") })]),
            ], { fill: true }),
            col({ width: 440, gap: 16 }, [
              part("settings-group", {
                title: say("Preferences", "偏好", "環境設定", "환경설정"),
                data: { columns: ["Icon", "Label", "Control", "Value"], rows: [["dark_mode", say("Dark theme", "深色主题", "ダークテーマ", "어두운 테마"), "switch", "off"], ["notifications", say("Email updates", "邮件通知", "メール通知", "이메일 알림"), "switch", "on"], ["language", say("Language", "语言", "言語", "언어"), "arrow", say("English", "简体中文", "日本語", "한국어")], ["schedule", say("Time zone", "时区", "タイムゾーン", "시간대"), "arrow", "UTC+8"]] },
              }),
              part("settings-group", {
                title: say("Security", "安全", "セキュリティ", "보안"),
                data: { columns: ["Icon", "Label", "Control", "Value"], rows: [["lock", say("Password", "密码", "パスワード", "비밀번호"), "arrow", ""], ["shield", say("Two-step sign-in", "两步验证登录", "2 段階ログイン", "2단계 로그인"), "switch", "off"], ["devices", say("Signed-in devices", "已登录设备", "ログイン中のデバイス", "로그인된 기기"), "arrow", "2"]] },
              }),
            ]),
          ]),
          panel({ padX: 24, padY: 12 }, [
            row({ justify: "between" }, [
              col({ gap: 4, width: 560 }, [txt(say("Delete account", "注销账号", "アカウントを削除", "계정 삭제"), "label"), txt(say("This removes your data and cannot be undone.", "将删除你的数据，且无法恢复。", "データが削除され、元に戻せません。", "데이터가 삭제되며 되돌릴 수 없습니다."), "caption", { color: "muted" })]),
              part("button", { label: say("Delete", "注销", "削除", "삭제"), variant: "outlined" }),
            ]),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "mail-inbox",
    name: "Three-pane inbox",
    labels: { ja: "3 ペインの受信箱", zh: "三栏收件箱", ko: "3단 받은 편지함" },
    category: "desktop",
    frame: "desktop",
    icon: "inbox",
    build: () => [
      deskScreen({
        id: "inbox",
        name: say("Inbox", "收件箱", "受信箱", "받은 편지함"),
        /* a mailbox's own folders, not the destinations of a back office */
        side: part("sidebar", {
          label: say("Mail", "邮件", "メール", "메일"),
          selected: 0,
          width: 240,
          items: [
            { label: say("Inbox", "收件箱", "受信箱", "받은 편지함"), icon: "inbox" },
            { label: say("Starred", "已加星标", "スター付き", "별표 편지함"), icon: "star" },
            { label: say("Sent", "已发送", "送信済み", "보낸 편지함"), icon: "send" },
            { label: say("Drafts", "草稿", "下書き", "임시 보관함"), icon: "draft" },
            { label: say("Archive", "归档", "アーカイブ", "보관함"), icon: "archive" },
            { label: say("Trash", "已删除", "ゴミ箱", "휴지통"), icon: "delete" },
          ],
        }),
        body: [
          /* the list and the message beside it, with a divider between them the reader moves (a split view) */
          split(
            { split: 34, minFirst: 280, maxFirst: 520, minSecond: 360, divider: "gap" },
            /* the list's own ground runs on to the foot of its pane, however many rows there are */
            panel({ gap: 8, padX: 8, padY: 8 }, [
              row({ gap: 8 }, [part("search", { kind: "bar", placeholder: SEARCH, trailing: "" }, { fill: true }), part("icon-button", { icon: "edit", label: ACT.compose, variant: "tonal" })]),
              part("conversation-list", {
                selected: 0,
                data: {
                  columns: ["Name", "Last message", "Time", "Unread"],
                  rows: [
                    [PEOPLE.grace, say("Notes from the review", "评审记录", "レビューのメモ", "리뷰 메모"), "09:41", "1"],
                    [PEOPLE.alan, say("Thanks for the update", "感谢你的更新", "更新ありがとうございます", "업데이트 감사합니다"), "08:15", "1"],
                    [PEOPLE.katherine, say("The numbers check out", "数字没问题", "数字は合っています", "숫자가 맞습니다"), DAY.mon, "0"],
                    [PEOPLE.marie, say("Samples sent today", "样品今天寄出", "本日サンプルを送りました", "오늘 샘플을 보냈습니다"), DAY.mon, "0"],
                    [PEOPLE.ada, say("Agenda for Thursday", "周四议程", "木曜日の議題", "목요일 안건"), DAY.sun, "0"],
                    [PEOPLE.grace, say("Your request was approved", "你的申请已通过", "申請が承認されました", "요청이 승인되었습니다"), DAY.sat, "0"],
                    [PEOPLE.alan, say("Draft for your comments", "请看草稿并提意见", "下書きにご意見を", "초안 의견 부탁드립니다"), DAY.fri, "0"],
                    [PEOPLE.katherine, say("Schedule for next week", "下周安排", "来週の予定", "다음 주 일정"), DAY.thu, "0"],
                    [PEOPLE.marie, say("Meeting moved to 3 PM", "会议改到下午 3 点", "会議は午後 3 時に変更", "회의가 오후 3시로 변경"), DAY.wed, "0"],
                    [PEOPLE.ada, say("Welcome to the team", "欢迎加入团队", "チームへようこそ", "팀에 오신 것을 환영합니다"), DAY.tue, "0"],
                  ],
                },
              }),
            ], { name: PANE.list }),
            panel({ justify: "between", padX: 24, padY: 16 }, [
              col({ gap: 12 }, [
                row({ justify: "end" }, [actions([["archive", ACT.archive], ["delete", ACT.remove], ["mark_email_unread", ACT.unread], ["more_vert", ACT.more]])]),
                txt(say("Notes from the review", "评审记录", "レビューのメモ", "리뷰 메모"), "headline"),
                row({ gap: 12 }, [part("avatar", { initials: say("NB", "思远", "蓮", "서준") }), txt(PEOPLE.grace, "label", {}, { fill: true }), txt("09:41", "caption", { color: "muted", width: 60, align: "end" })]),
                txt(
                  say(
                    "Hi,\n\nHere are the notes from this morning's review. The main points are in the attached file, and the next steps are listed at the end.\n\nLet me know if anything is missing.\n\nBest regards",
                    "你好：\n\n这是今天上午的评审记录。要点都在附件里，后续步骤列在最后。\n\n如有遗漏请告诉我。\n\n此致敬礼",
                    "お疲れさまです。\n\n今朝のレビューのメモをお送りします。要点は添付ファイルにまとめ、今後の作業は最後に記載しました。\n\n不足があればお知らせください。\n\nよろしくお願いします。",
                    "안녕하세요.\n\n오늘 오전 리뷰 메모를 보내드립니다. 주요 내용은 첨부 파일에 있고, 다음 단계는 마지막에 정리했습니다.\n\n빠진 내용이 있으면 알려 주세요.\n\n감사합니다.",
                  ),
                  "body",
                ),
                part("attachment", { title: say("Notes.pdf", "评审记录.pdf", "メモ.pdf", "메모.pdf"), description: "2.4 MB" }),
              ]),
              row({ gap: 8 }, [part("button", { label: say("Reply", "回复", "返信", "답장"), icon: "reply" }), part("button", { label: say("Forward", "转发", "転送", "전달"), icon: "forward", variant: "tonal" })]),
            ], { name: PANE.reading }),
            { fill: true },
          ),
        ],
      }),
    ],
  },
  {
    slug: "dashboard",
    name: "Dashboard",
    labels: { ja: "ダッシュボード", zh: "数据看板", ko: "대시보드" },
    category: "desktop",
    frame: "desktop",
    icon: "dashboard",
    build: () => [
      deskScreen({
        id: "dashboard",
        name: say("Dashboard", "数据看板", "ダッシュボード", "대시보드"),
        side: sidebar(0),
        body: [
          row({ justify: "between" }, [txt(say("Overview", "总览", "概要", "개요"), "headline", { width: 480 }), part("button", { label: say("Export", "导出", "書き出し", "내보내기"), icon: "download", variant: "tonal" })]),
          grid(4, {}, [
            stat(say("Revenue", "收入", "売上", "매출"), "$48,200", "+12.5%"),
            stat(say("New users", "新增用户", "新規ユーザー", "신규 사용자"), "1,284", "+4.1%"),
            stat(say("Active users", "活跃用户", "アクティブユーザー", "활성 사용자"), "892", "+2.3%"),
            stat(say("Sessions", "访问次数", "セッション", "세션"), "5,230", "-1.2%", "down"),
          ]),
          row({ gap: 16, align: "start" }, [
            part(
              "chart",
              {
                type: "bar",
                title: say("Trend by month", "月度趋势", "月別の推移", "월별 추이"),
                subtitle: say("Last six months", "最近六个月", "過去 6 か月", "최근 6개월"),
                height: 504,
                data: { columns: [say("Month", "月份", "月", "월"), say("Revenue", "收入", "売上", "매출"), say("Visits", "访问", "訪問", "방문")], rows: MONTHS.map((m, i) => [m, REVENUE[i], VISITS[i]]) },
              },
              { fill: true },
            ),
            col({ width: 320 }, [
              part("bar-list", {
                title: say("Traffic by source", "流量来源", "流入元", "유입 경로"),
                data: {
                  columns: ["Label", "Value"],
                  rows: [
                    [SEARCH, "4,820"],
                    [say("Direct", "直接访问", "直接", "직접"), "2,140"],
                    [say("Social", "社交", "ソーシャル", "소셜"), "1,360"],
                    [say("Email", "邮件", "メール", "이메일"), "640"],
                  ],
                },
              }),
              part("sparkline", { title: say("Weekly visitors", "本周访客", "週間訪問者", "주간 방문자"), value: "1,284", trend: "+12%", kind: "area", height: 72 }),
              part("sparkline", { title: say("Conversion", "转化率", "コンバージョン", "전환율"), value: "3.8%", trend: "+0.4%", kind: "bar", height: 72, values: "3,3.2,3.1,3.4,3.6,3.5,3.8" }),
            ]),
          ]),
        ],
      }),
    ],
  },
  {
    slug: "admin-table",
    name: "Admin table",
    labels: { ja: "管理テーブル", zh: "后台数据表", ko: "관리자 표" },
    category: "desktop",
    frame: "desktop",
    icon: "table_view",
    build: () => [
      deskScreen({
        id: "admin",
        name: say("Admin table", "后台数据表", "管理テーブル", "관리자 표"),
        side: sidebar(1),
        body: [
          part("breadcrumb", { items: [{ label: say("Workspace", "工作区", "ワークスペース", "워크스페이스") }, { label: say("Items", "条目", "アイテム", "항목") }] }),
          row({ justify: "between" }, [txt(say("Items", "条目", "アイテム", "항목"), "headline", { width: 480 }), part("button", { label: say("New item", "新建条目", "新規アイテム", "새 항목"), icon: "add" })]),
          part("filter-bar", {
            placeholder: say("Search items", "搜索条目", "アイテムを検索", "항목 검색"),
            filters: [{ label: STATUS.active }, { label: STATUS.pending }, { label: STATUS.archived }],
          }),
          part("data-table", {
            title: say("All items", "全部条目", "すべてのアイテム", "전체 항목"),
            search: "",
            pageSize: 8,
            data: {
              columns: [say("Name", "名称", "名前", "이름"), say("Owner", "负责人", "担当者", "담당자"), say("Status", "状态", "状態", "상태"), say("Updated", "更新时间", "更新日", "수정일")],
              rows: [
                [say("Item 1001", "条目 1001", "アイテム 1001", "항목 1001"), PEOPLE.ada, STATUS.active, "2026-11-03"],
                [say("Item 1002", "条目 1002", "アイテム 1002", "항목 1002"), PEOPLE.grace, STATUS.pending, "2026-11-02"],
                [say("Item 1003", "条目 1003", "アイテム 1003", "항목 1003"), PEOPLE.alan, STATUS.active, "2026-10-30"],
                [say("Item 1004", "条目 1004", "アイテム 1004", "항목 1004"), PEOPLE.katherine, STATUS.archived, "2026-10-28"],
                [say("Item 1005", "条目 1005", "アイテム 1005", "항목 1005"), PEOPLE.marie, STATUS.pending, "2026-10-27"],
                [say("Item 1006", "条目 1006", "アイテム 1006", "항목 1006"), PEOPLE.ada, STATUS.active, "2026-10-24"],
                [say("Item 1007", "条目 1007", "アイテム 1007", "항목 1007"), PEOPLE.grace, STATUS.active, "2026-10-21"],
                [say("Item 1008", "条目 1008", "アイテム 1008", "항목 1008"), PEOPLE.alan, STATUS.pending, "2026-10-20"],
                [say("Item 1009", "条目 1009", "アイテム 1009", "항목 1009"), PEOPLE.katherine, STATUS.active, "2026-10-16"],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "file-manager",
    name: "File manager",
    labels: { ja: "ファイルマネージャー", zh: "文件管理器", ko: "파일 관리자" },
    category: "desktop",
    frame: "desktop",
    icon: "folder_open",
    build: () => [
      deskScreen({
        id: "files",
        name: say("File manager", "文件管理器", "ファイルマネージャー", "파일 관리자"),
        side: col({ width: 240, padX: 12, padY: 16, justify: "between", fill: "surface-container-low", hugHeight: false }, [
          col({ gap: 8 }, [
            part("button", { label: say("New folder", "新建文件夹", "新しいフォルダ", "새 폴더"), icon: "create_new_folder" }),
            part("tree", {
              selected: 0,
              items: [
                { label: say("Documents", "文档", "ドキュメント", "문서"), icon: "folder_open" },
                { label: say("  Reports", "  报告", "  レポート", "  보고서"), icon: "folder" },
                { label: say("  Templates", "  模板", "  テンプレート", "  템플릿"), icon: "folder" },
                { label: say("Pictures", "图片", "ピクチャ", "사진"), icon: "folder" },
                { label: say("Music", "音乐", "ミュージック", "음악"), icon: "folder" },
                { label: say("Videos", "视频", "ビデオ", "동영상"), icon: "folder" },
                { label: say("Downloads", "下载", "ダウンロード", "다운로드"), icon: "folder" },
                { label: say("Trash", "回收站", "ゴミ箱", "휴지통"), icon: "delete" },
              ],
            }),
          ]),
          part("progress", { value: 24, label: say("12 GB of 50 GB used", "已用 12 GB，共 50 GB", "50 GB 中 12 GB を使用", "50GB 중 12GB 사용") }),
        ]),
        body: [
          row({ justify: "between" }, [
            part("breadcrumb", { items: [{ label: say("Home", "主目录", "ホーム", "홈") }, { label: say("Documents", "文档", "ドキュメント", "문서") }] }),
            row({ gap: 8, hugWidth: true }, [part("button", { label: say("Upload", "上传", "アップロード", "업로드"), icon: "upload", variant: "tonal" }), part("icon-button", { icon: "view_list", label: say("Change view", "切换视图", "表示を切り替え", "보기 전환") }), part("icon-button", { icon: "more_vert", label: ACT.more })]),
          ]),
          /* the files and what is picked beside them, the divider the reader's to move (a split view) */
          split(
            { split: 72, minFirst: 360, minSecond: 240, maxSecond: 420, divider: "gap" },
            panel({ padX: 8, padY: 8 }, [
              part("file-list", {
                removable: false,
                selected: 2,
                data: {
                  columns: ["Name", "Size", "Date"],
                  rows: [
                    [say("Reports", "报告", "レポート", "보고서"), say("12 items", "12 项", "12 個の項目", "12개 항목"), "2026-11-03"],
                    [say("Templates", "模板", "テンプレート", "템플릿"), say("8 items", "8 项", "8 個の項目", "8개 항목"), "2026-10-29"],
                    [say("Report.pdf", "报告.pdf", "レポート.pdf", "보고서.pdf"), "2.4 MB", "2026-10-28"],
                    [say("Budget.xlsx", "预算.xlsx", "予算.xlsx", "예산.xlsx"), "86 KB", "2026-10-21"],
                    [say("Slides.pptx", "演示文稿.pptx", "スライド.pptx", "슬라이드.pptx"), "5.1 MB", "2026-10-15"],
                    [say("Photo.jpg", "照片.jpg", "写真.jpg", "사진.jpg"), "4.1 MB", "2026-10-12"],
                    [say("Notes.txt", "笔记.txt", "メモ.txt", "메모.txt"), "12 KB", "2026-10-02"],
                    [say("Archive.zip", "归档.zip", "アーカイブ.zip", "보관.zip"), "120 MB", "2026-09-30"],
                    [say("Video.mp4", "视频.mp4", "動画.mp4", "동영상.mp4"), "48 MB", "2026-09-18"],
                    [say("Recording.mp3", "录音.mp3", "録音.mp3", "녹음.mp3"), "7.2 MB", "2026-09-04"],
                  ],
                },
              }),
            ], { name: PANE.files }),
            panel({ justify: "between" }, [
              col({ gap: 12 }, [
                part("image", { alt: say("Preview", "预览", "プレビュー", "미리 보기"), height: 160 }),
                txt(say("Report.pdf", "报告.pdf", "レポート.pdf", "보고서.pdf"), "title"),
                part("description-list", {
                  data: {
                    columns: ["Name", "Value"],
                    rows: [
                      [say("Type", "类型", "種類", "유형"), "PDF"],
                      [say("Size", "大小", "サイズ", "크기"), "2.4 MB"],
                      [say("Modified", "修改时间", "更新日", "수정일"), "2026-10-28"],
                      [say("Owner", "所有者", "所有者", "소유자"), PEOPLE.ada],
                    ],
                  },
                }),
              ]),
              col({ gap: 8 }, [part("button", { label: say("Open", "打开", "開く", "열기") }), part("button", { label: say("Share", "共享", "共有", "공유"), variant: "tonal" })]),
            ], { name: PANE.details }),
            { fill: true },
          ),
        ],
      }),
    ],
  },
  {
    slug: "desktop-chat",
    name: "Desktop chat",
    labels: { ja: "デスクトップチャット", zh: "桌面聊天", ko: "데스크톱 채팅" },
    category: "desktop",
    frame: "desktop",
    icon: "forum",
    build: () => [
      deskScreen({
        id: "desk-chat",
        name: say("Chat", "聊天", "チャット", "채팅"),
        side: col({ width: 340, padX: 8, padY: 16, gap: 8, fill: "surface-container-low", hugHeight: false }, [
          part("search", { kind: "bar", placeholder: SEARCH, trailing: "" }),
          part("conversation-list", {
            selected: 0,
            data: {
              columns: ["Name", "Last message", "Time", "Unread"],
              rows: [
                [PEOPLE.grace, say("See you at the review.", "评审时见。", "レビューでお会いしましょう。", "리뷰 때 봬요."), "09:41", "0"],
                [say("Team", "团队", "チーム", "팀"), say("New files are up.", "新文件已上传。", "新しいファイルを置きました。", "새 파일을 올렸어요."), "09:12", "4"],
                [PEOPLE.alan, say("Thanks!", "谢谢！", "ありがとう！", "고마워요!"), "08:30", "1"],
                [PEOPLE.katherine, say("The numbers check out.", "数字没问题。", "数字は合っています。", "숫자가 맞네요."), DAY.mon, "0"],
                [PEOPLE.marie, say("Sending the samples today.", "今天寄出样品。", "今日サンプルを送ります。", "오늘 샘플 보낼게요."), DAY.mon, "0"],
                [PEOPLE.ada, say("Can we talk tomorrow?", "明天能聊聊吗？", "明日お話しできますか？", "내일 얘기할 수 있을까요?"), DAY.sun, "0"],
                [say("Project group", "项目群", "プロジェクト", "프로젝트 그룹"), say("The date is confirmed.", "日期已确认。", "日程が確定しました。", "날짜가 확정됐어요."), DAY.fri, "0"],
                [say("Announcements", "公告", "お知らせ", "공지"), say("Office closed on Friday.", "周五休息。", "金曜日は休業です。", "금요일은 쉽니다."), DAY.thu, "0"],
                [say("Help desk", "服务台", "ヘルプデスク", "헬프 데스크"), say("Your request is closed.", "你的请求已关闭。", "リクエストは完了しました。", "요청이 종료되었습니다."), DAY.wed, "0"],
              ],
            },
          }),
        ]),
        body: [
          row({ justify: "between" }, [
            row({ gap: 12, hugWidth: true }, [part("avatar", { initials: say("NB", "思远", "蓮", "서준") }), col({ gap: 0, width: 320 }, [txt(PEOPLE.grace, "label"), txt(say("Online", "在线", "オンライン", "온라인"), "caption", { color: "muted" })])]),
            actions([["call", ACT.call], ["videocam", ACT.video], ["more_vert", ACT.more]]),
          ]),
          col({ gap: 8, justify: "end", hugHeight: false }, [
            row({ justify: "center" }, [part("marker", { text: say("Yesterday", "昨天", "昨日", "어제"), variant: "separator", width: 320 })]),
            said(say("Could you send the files over?", "能把文件发给我吗？", "ファイルを送ってもらえますか？", "파일을 보내 주실 수 있나요?"), true),
            said(say("Sure, first thing tomorrow.", "好的，明天一早发。", "はい、明日の朝一番で。", "네, 내일 아침에 바로요."), false),
            row({ justify: "center" }, [part("marker", { text: say("Today", "今天", "今日", "오늘"), variant: "separator", width: 320 })]),
            said(say("Did the files arrive?", "文件收到了吗？", "ファイルは届きましたか？", "파일 받으셨어요?"), false),
            said(say("Yes, they look good. One note on the first page.", "收到了，很不错。第一页有一点意见。", "はい、良いですね。最初のページに一点だけ。", "네, 좋아요. 첫 페이지에 의견이 하나 있어요."), true),
            said(say("Go on.", "你说。", "どうぞ。", "말씀하세요."), false),
            said(say("Could the title sit a little lower?", "标题能再往下一点吗？", "タイトルをもう少し下げられますか？", "제목을 조금 내릴 수 있을까요?"), true),
            said(say("Done. See you at the review.", "改好了，评审时见。", "直しました。レビューでお会いしましょう。", "수정했어요. 리뷰 때 봬요."), false),
          ], { fill: true }),
          part("chat-composer", { placeholder: say("Message", "发消息", "メッセージ", "메시지") }),
        ],
      }),
    ],
  },
  {
    slug: "kanban-board",
    name: "Kanban board",
    labels: { ja: "カンバンボード", zh: "看板", ko: "칸반 보드" },
    category: "desktop",
    frame: "desktop",
    icon: "view_kanban",
    build: () => [
      deskScreen({
        id: "board",
        name: say("Kanban board", "看板", "カンバンボード", "칸반 보드"),
        side: sidebar(1),
        body: [
          row({ justify: "between" }, [
            txt(say("Board", "看板", "ボード", "보드"), "headline", { width: 480 }),
            row({ gap: 12, hugWidth: true }, [part("avatar", { initials: "", count: 3 }), part("button", { label: say("New card", "新建卡片", "新しいカード", "새 카드"), icon: "add" })]),
          ]),
          part("filter-bar", { placeholder: say("Search cards", "搜索卡片", "カードを検索", "카드 검색"), filters: [{ label: say("Assigned to me", "分配给我", "自分の担当", "내 담당") }, { label: say("Due soon", "即将到期", "期限間近", "마감 임박") }] }),
          part("kanban", {
            add: say("Add card", "添加卡片", "カードを追加", "카드 추가"),
            data: {
              columns: [say("To do", "待办", "未着手", "할 일"), say("In progress", "进行中", "進行中", "진행 중"), say("In review", "待审核", "レビュー中", "검토 중"), say("Done", "已完成", "完了", "완료")],
              rows: [
                [say("Write the brief", "撰写简介", "概要を書く", "개요 작성"), say("Draw the screens", "绘制界面", "画面を描く", "화면 그리기"), say("Review the copy", "审阅文案", "文章を確認する", "문구 검토"), say("Pick a name", "确定名称", "名前を決める", "이름 정하기")],
                [say("Book the room", "预订会议室", "会議室を予約する", "회의실 예약"), say("Prepare the demo", "准备演示", "デモを準備する", "데모 준비"), say("Check the numbers", "核对数字", "数字を確認する", "숫자 확인"), say("Set up the project", "搭建项目", "プロジェクトを準備する", "프로젝트 설정")],
                [say("Plan the launch", "规划发布", "公開を計画する", "출시 계획"), say("Fix the header", "修复页头", "ヘッダーを直す", "헤더 수정"), say("Approve the layout", "确认版式", "レイアウトを承認する", "레이아웃 승인"), say("Invite the team", "邀请团队", "チームを招待する", "팀 초대")],
                [say("Collect feedback", "收集反馈", "意見を集める", "피드백 수집"), say("Test the new flow", "测试新流程", "新しい流れを試す", "새 흐름 테스트"), "", say("Agree the scope", "确定范围", "範囲を決める", "범위 확정")],
                [say("Update the docs", "更新文档", "資料を更新する", "문서 업데이트"), "", "", say("Draft the plan", "起草计划", "計画を作る", "계획 초안")],
                [say("Send the invites", "发送邀请", "招待状を送る", "초대장 보내기"), "", "", say("Hold the kickoff", "召开启动会", "キックオフを開く", "킥오프 진행")],
                [say("Prepare the budget", "准备预算", "予算を準備する", "예산 준비"), "", "", ""],
                [say("Share the notes", "分享笔记", "メモを共有する", "메모 공유"), "", "", ""],
                [say("Order the supplies", "采购物资", "備品を注文する", "비품 주문"), "", "", ""],
              ],
            },
          }),
        ],
      }),
    ],
  },
  {
    slug: "editor-workspace",
    name: "Editor workspace",
    labels: { ja: "エディターワークスペース", zh: "编辑器工作区", ko: "편집기 작업 공간" },
    category: "desktop",
    frame: "desktop",
    icon: "code",
    build: () => [
      screen({
        id: "workspace",
        name: say("Editor workspace", "编辑器工作区", "エディターワークスペース", "편집기 작업 공간"),
        frame: "desktop",
        top: [part("title-bar", { title: say("Project", "项目", "プロジェクト", "프로젝트"), controls: "windows" })],
        bottom: [part("status-bar", { text: say("Ready", "就绪", "準備完了", "준비됨"), trailing: say("Line 4, column 12", "第 4 行，第 12 列", "4 行 12 列", "4행 12열") })],
        body: [
          /* the files, the editors side by side and the terminal under them: split views, each divider the reader's to move,
             the terminal folding away */
          split(
            { split: 20, minFirst: 180, maxFirst: 400, divider: "gap" },
            panel({ gap: 8, padX: 8, padY: 12 }, [
              txt(say("Files", "文件", "ファイル", "파일"), "label", { color: "muted" }),
              part("tree", {
                selected: 1,
                items: [
                  { label: "src", icon: "folder_open" },
                  { label: "  main.js", icon: "draft" },
                  { label: "  main.test.js", icon: "draft" },
                  { label: "  styles.css", icon: "draft" },
                  { label: "docs", icon: "folder" },
                  { label: "tests", icon: "folder" },
                  { label: "README.md", icon: "draft" },
                  { label: "config.json", icon: "draft" },
                ],
              }),
            ], { name: PANE.files }),
            holding(
              split(
                { orientation: "vertical", split: 74, minFirst: 240, collapsible: "second", minSecond: 96, divider: "gap" },
                holding(
                  split(
                    { split: 50, minFirst: 240, minSecond: 240, divider: "gap" },
                    col({ gap: 8 }, [part("tabs", { selected: 0, items: [{ label: "main.js" }, { label: "styles.css" }] }), part("code-block", { code: CODE_MAIN, language: "JavaScript" })], { name: say("main.js", "main.js", "main.js", "main.js") }),
                    col({ gap: 8 }, [part("tabs", { selected: 0, items: [{ label: "main.test.js" }, { label: "README.md" }] }), part("code-block", { code: CODE_TEST, language: "JavaScript" })], { name: say("main.test.js", "main.test.js", "main.test.js", "main.test.js") }),
                  ),
                  PANE.editors,
                ),
                col({ gap: 0 }, [part("code-block", { code: say("$ run tests\n  4 passed, 0 failed\n  Done in 1.8 s", "$ 运行测试\n  通过 4 项，失败 0 项\n  用时 1.8 秒", "$ テストを実行\n  成功 4 件、失敗 0 件\n  1.8 秒で完了", "$ 테스트 실행\n  성공 4개, 실패 0개\n  1.8초 만에 완료"), language: say("Terminal", "终端", "ターミナル", "터미널") })], { name: PANE.terminal }),
              ),
              PANE.work,
            ),
            { fill: true },
          ),
        ],
      }),
    ],
  },
  {
    slug: "landing-page",
    name: "Landing page",
    labels: { ja: "ランディングページ", zh: "落地页", ko: "랜딩 페이지" },
    category: "desktop",
    frame: "desktop",
    icon: "web",
    build: () => [
      deskScreen({
        id: "landing",
        name: say("Landing page", "落地页", "ランディングページ", "랜딩 페이지"),
        length: 1320,
        bodyProps: { padX: 64, gap: 48 },
        body: [
          row({ justify: "between" }, [
            txt(say("Product", "产品名称", "製品名", "제품명"), "title", { bold: true, width: 160 }),
            row({ gap: 24, hugWidth: true }, [
              part("link", { label: say("Features", "功能", "機能", "기능"), href: "#" }),
              part("link", { label: say("Pricing", "价格", "料金", "요금"), href: "#" }),
              part("button", { label: say("Sign up", "注册", "登録", "가입"), size: "sm" }),
            ]),
          ]),
          col({ align: "center", gap: 16, padY: 16 }, [
            txt(say("Say what your product does in one line", "一句话说清你的产品", "製品の価値を一文で", "제품이 하는 일을 한 줄로"), "display", { align: "center", width: 900 }),
            txt(say("One or two sentences on who it is for and why it helps.", "用一两句话说明它适合谁、解决什么问题。", "誰のための製品で、どう役立つのかを一、二文で。", "누구를 위한 제품이고 어떻게 도움이 되는지 한두 문장으로."), "title", { align: "center", color: "muted", width: 720 }),
            row({ justify: "center", gap: 12, width: 720 }, [
              part("button", { label: say("Start free", "免费开始", "無料で始める", "무료로 시작"), size: "md" }),
              part("button", { label: say("See how it works", "了解原理", "仕組みを見る", "작동 방식 보기"), variant: "outlined", size: "md" }),
            ]),
          ]),
          /* a style's gaps are its own: the picture takes up what they leave, so the page always runs to its foot */
          part("image", { alt: say("The product", "产品展示图", "製品画像", "제품 이미지") }, { fill: true }),
          grid(3, { gap: 16 }, [
            feature("bolt", say("Feature one", "核心功能一", "機能 1", "기능 1"), say("What it does, and what that gets you.", "它能做什么，带来什么好处。", "何ができて、何が得られるか。", "무엇을 하고 어떤 도움이 되는지.")),
            feature("group", say("Feature two", "核心功能二", "機能 2", "기능 2"), say("What it does, and what that gets you.", "它能做什么，带来什么好处。", "何ができて、何が得られるか。", "무엇을 하고 어떤 도움이 되는지.")),
            feature("shield", say("Feature three", "核心功能三", "機能 3", "기능 3"), say("What it does, and what that gets you.", "它能做什么，带来什么好处。", "何ができて、何が得られるか。", "무엇을 하고 어떤 도움이 되는지.")),
          ]),
          txt(say("Simple pricing", "简单的价格", "シンプルな料金", "간단한 요금"), "headline", { align: "center" }),
          grid(3, { gap: 16 }, [
            plan(say("Free", "免费版", "無料", "무료"), "$0", say("For one person getting started.", "适合个人上手使用。", "個人で始める方に。", "개인이 시작하기에."), say("Start free", "免费开始", "無料で始める", "무료로 시작"), "tonal"),
            plan(say("Team", "团队版", "チーム", "팀"), "$12", say("For a team working together.", "适合协作的团队。", "一緒に働くチームに。", "함께 일하는 팀에."), say("Start a trial", "开始试用", "試用を開始", "체험 시작"), "filled"),
            plan(say("Company", "企业版", "企業", "기업"), "$29", say("For many teams, with support.", "适合多个团队，含支持服务。", "複数のチームに、サポート付き。", "여러 팀을 위한 지원 포함."), say("Talk to us", "联系我们", "問い合わせる", "문의하기"), "tonal"),
          ]),
          row({ justify: "between" }, [
            txt(say("© 2026 Product", "© 2026 产品名称", "© 2026 製品名", "© 2026 제품명"), "caption", { color: "muted", width: 240 }),
            /* a layout is never shorter than this: the links stand in the middle of it, in line with the words */
            row({ gap: 24, hugWidth: true, height: 40, hugHeight: false }, [part("link", { label: say("Privacy", "隐私", "プライバシー", "개인정보"), href: "#" }), part("link", { label: say("Terms", "条款", "利用規約", "약관"), href: "#" })]),
          ]),
        ],
      }),
    ],
  },
];
