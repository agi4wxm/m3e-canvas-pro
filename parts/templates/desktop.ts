import { col, deskScreen, grid, panel, part, row, say, txt, type Node, type Say, type Template } from "./kit";
import { PEOPLE } from "./words";

/* Screens for a window rather than a hand: a dashboard, a back office table, a landing page. */

const sidebar = (selected: number): Node =>
  part("sidebar", {
    label: say("Workspace", "工作区", "ワークスペース", "워크스페이스"),
    selected,
    width: 240,
    items: [
      { label: say("Overview", "总览", "概要", "개요"), icon: "dashboard" },
      { label: say("Orders", "订单", "注文", "주문"), icon: "receipt_long" },
      { label: say("Customers", "客户", "顧客", "고객"), icon: "group" },
      { label: say("Reports", "报表", "レポート", "보고서"), icon: "bar_chart" },
      { label: say("Settings", "设置", "設定", "설정"), icon: "settings" },
    ],
  });

const stat = (title: Say, value: string, trend: string, direction = "up"): Node => part("stat-card", { title, value, trend, direction });

const MONTHS = [say("Jan", "1 月", "1 月", "1월"), say("Feb", "2 月", "2 月", "2월"), say("Mar", "3 月", "3 月", "3월"), say("Apr", "4 月", "4 月", "4월"), say("May", "5 月", "5 月", "5월"), say("Jun", "6 月", "6 月", "6월")];
const SALES = ["186", "305", "237", "273", "209", "314"];
const VISITS = ["80", "200", "120", "190", "130", "240"];

const STATUS = { paid: say("Paid", "已支付", "支払い済み", "결제 완료"), pending: say("Pending", "待处理", "保留中", "대기 중"), refunded: say("Refunded", "已退款", "返金済み", "환불됨") };

const feature = (icon: string, title: Say, description: Say): Node => panel({ gap: 8, padY: 20 }, [part("icon", { name: icon, size: 32, color: "primary" }), txt(title, "title"), txt(description, "body", { color: "muted" })]);

const plan = (title: Say, price: string, description: Say, action: Say, variant: string): Node => panel({ gap: 8, padY: 20 }, [txt(title, "title"), txt(price, "headline", { bold: true }), txt(description, "body", { color: "muted" }), part("button", { label: action, variant })]);

export const desktop: Template[] = [
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
        name: say("Dashboard", "看板", "ダッシュボード", "대시보드"),
        side: sidebar(0),
        body: [
          row({ justify: "between" }, [txt(say("Overview", "总览", "概要", "개요"), "headline", { width: 480 }), part("button", { label: say("Export", "导出", "書き出し", "내보내기"), icon: "download", variant: "tonal" })]),
          grid(4, {}, [
            stat(say("Revenue", "收入", "売上", "매출"), "$48,200", "+12.5%"),
            stat(say("Orders", "订单", "注文", "주문"), "1,284", "+4.1%"),
            stat(say("Customers", "客户", "顧客", "고객"), "892", "+2.3%"),
            stat(say("Refunds", "退款", "返金", "환불"), "23", "-1.2%", "down"),
          ]),
          row({ gap: 16, align: "start" }, [
            part(
              "chart",
              {
                type: "bar",
                title: say("Sales by month", "月度销售", "月別売上", "월별 매출"),
                subtitle: say("Last six months", "最近六个月", "過去 6 か月", "최근 6개월"),
                height: 480,
                data: { columns: [say("Month", "月份", "月", "월"), say("Sales", "销售", "売上", "매출"), say("Visits", "访问", "訪問", "방문")], rows: MONTHS.map((m, i) => [m, SALES[i], VISITS[i]]) },
              },
              { fill: true },
            ),
            col({ width: 320 }, [
              part("bar-list", {
                title: say("Traffic by source", "流量来源", "流入元", "유입 경로"),
                data: {
                  columns: ["Label", "Value"],
                  rows: [
                    [say("Search", "搜索", "検索", "검색"), "4,820"],
                    [say("Direct", "直接访问", "直接", "직접"), "2,140"],
                    [say("Social", "社交", "ソーシャル", "소셜"), "1,360"],
                    [say("Email", "邮件", "メール", "이메일"), "640"],
                  ],
                },
              }),
              part("sparkline", { title: say("Weekly visitors", "本周访客", "週間訪問者", "주간 방문자"), value: "1,284", trend: "+12%", kind: "area", height: 56 }),
              part("sparkline", { title: say("Conversion", "转化率", "コンバージョン", "전환율"), value: "3.8%", trend: "+0.4%", kind: "bar", height: 56, values: "3,3.2,3.1,3.4,3.6,3.5,3.8" }),
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
        name: say("Orders", "订单", "注文", "주문"),
        side: sidebar(1),
        body: [
          part("breadcrumb", { items: [{ label: say("Workspace", "工作区", "ワークスペース", "워크스페이스") }, { label: say("Orders", "订单", "注文", "주문") }] }),
          row({ justify: "between" }, [txt(say("Orders", "订单", "注文", "주문"), "headline", { width: 480 }), part("button", { label: say("New order", "新建订单", "新規注文", "새 주문"), icon: "add" })]),
          part("filter-bar", {
            placeholder: say("Search orders", "搜索订单", "注文を検索", "주문 검색"),
            filters: [{ label: STATUS.paid }, { label: STATUS.pending }, { label: STATUS.refunded }],
          }),
          part("data-table", {
            title: say("All orders", "全部订单", "すべての注文", "전체 주문"),
            search: "",
            pageSize: 7,
            data: {
              columns: [say("Order", "订单号", "注文番号", "주문 번호"), say("Customer", "客户", "顧客", "고객"), say("Status", "状态", "状態", "상태"), say("Total", "金额", "合計", "합계")],
              rows: [
                ["A-1001", PEOPLE.ada, STATUS.paid, "$250.00"],
                ["A-1002", PEOPLE.grace, STATUS.pending, "$150.00"],
                ["A-1003", PEOPLE.alan, STATUS.paid, "$1,350.00"],
                ["A-1004", PEOPLE.katherine, STATUS.refunded, "$75.50"],
                ["A-1005", PEOPLE.marie, STATUS.pending, "$420.00"],
                ["A-1006", PEOPLE.ada, STATUS.paid, "$98.00"],
                ["A-1007", PEOPLE.grace, STATUS.paid, "$610.00"],
                ["A-1008", PEOPLE.alan, STATUS.pending, "$320.00"],
                ["A-1009", PEOPLE.katherine, STATUS.paid, "$44.00"],
              ],
            },
          }),
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
            txt(say("Harbour", "海港", "ハーバー", "하버"), "title", { bold: true, width: 160 }),
            row({ gap: 24, hugWidth: true }, [
              part("link", { label: say("Features", "功能", "機能", "기능"), href: "#" }),
              part("link", { label: say("Pricing", "价格", "料金", "요금"), href: "#" }),
              part("button", { label: say("Sign up", "注册", "登録", "가입"), size: "sm" }),
            ]),
          ]),
          col({ align: "center", gap: 16, padY: 16 }, [
            txt(say("Plan your week in one calm place", "在一个安静的地方规划一周", "一週間の予定を、ひとつの静かな場所で", "한 곳에서 차분하게 한 주를 계획하세요"), "display", { align: "center", width: 900 }),
            txt(say("Tasks, notes and people together, without the noise.", "任务、笔记和同事都在一起，没有干扰。", "タスク、メモ、仲間をひとまとめに。雑音なしで。", "할 일, 메모, 사람을 한데 모으고 소음은 없앴습니다."), "title", { align: "center", color: "muted", width: 720 }),
            row({ justify: "center", gap: 12, width: 720 }, [
              part("button", { label: say("Start free", "免费开始", "無料で始める", "무료로 시작"), size: "md" }),
              part("button", { label: say("See how it works", "了解原理", "仕組みを見る", "작동 방식 보기"), variant: "outlined", size: "md" }),
            ]),
          ]),
          part("image", { alt: say("The app on a laptop", "笔记本上的应用", "ノートパソコンで開いたアプリ", "노트북에서 연 앱"), height: 360, radius: 28 }),
          grid(3, { gap: 16 }, [
            feature("event_available", say("One plan", "一份计划", "ひとつの計画", "하나의 계획"), say("Your week on a single page, always up to date.", "一周安排在一页，始终最新。", "一週間を一枚に。いつも最新です。", "한 주를 한 페이지에, 항상 최신으로.")),
            feature("group", say("Shared with your team", "与团队共享", "チームで共有", "팀과 공유"), say("Everyone sees the same thing at the same time.", "所有人同时看到同样的内容。", "全員が同じものを同時に見られます。", "모두가 같은 내용을 동시에 봅니다.")),
            feature("notifications_off", say("Quiet by default", "默认安静", "標準で静か", "기본은 조용하게"), say("Only what needs you reaches you.", "只有需要你的事才会打扰你。", "必要なことだけが届きます。", "필요한 것만 전달됩니다.")),
          ]),
          txt(say("Simple pricing", "简单的价格", "シンプルな料金", "간단한 요금"), "headline", { align: "center" }),
          grid(3, { gap: 16 }, [
            plan(say("Free", "免费版", "無料", "무료"), "$0", say("For one person and one plan.", "适合个人和一份计划。", "一人と一つの計画に。", "한 사람, 하나의 계획에."), say("Start free", "免费开始", "無料で始める", "무료로 시작"), "tonal"),
            plan(say("Team", "团队版", "チーム", "팀"), "$12", say("For a team that plans together.", "适合一起规划的团队。", "一緒に計画するチームに。", "함께 계획하는 팀에."), say("Start a trial", "开始试用", "試用を開始", "체험 시작"), "filled"),
            plan(say("Company", "企业版", "企業", "기업"), "$29", say("For many teams, with support.", "适合多个团队，含支持服务。", "複数のチームに、サポート付き。", "여러 팀을 위한 지원 포함."), say("Talk to us", "联系我们", "問い合わせる", "문의하기"), "tonal"),
          ]),
          row({ justify: "between" }, [
            txt(say("© 2026 Harbour", "© 2026 海港", "© 2026 ハーバー", "© 2026 하버"), "caption", { color: "muted", width: 240 }),
            row({ gap: 24, hugWidth: true }, [part("link", { label: say("Privacy", "隐私", "プライバシー", "개인정보"), href: "#" }), part("link", { label: say("Terms", "条款", "利用規約", "약관"), href: "#" })]),
          ]),
        ],
      }),
    ],
  },
];
