import { atom, box, button, hbox, icon, iconButton, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { presetOf } from "../../lib/look";
import { SCREEN, T, isDense, isGame, isIosLike, kit, muted, push, rule, variant } from "./shared";
import type { KitDef } from "./types";

/* Bars and navigation as atoms. Each product puts the same things in its own order: Material's bottom bar marks the
 * chosen tab with a pill behind its icon, an iPhone's tints it, a game raises it on a tile; a Windows window has its
 * caption buttons at the right where a Mac has traffic lights at the left. Which one a look gets comes from its
 * recipes, never its name. */

const TABS: [string, Say][] = [
  ["home", say("Home", "首页", "ホーム", "홈")],
  ["explore", say("Discover", "发现", "見つける", "발견")],
  ["chat_bubble", say("Messages", "消息", "メッセージ", "메시지")],
  ["person", say("Me", "我的", "マイページ", "나")],
];

/** one tab of a bottom bar: as wide as the others, its icon over its name */
const tabItem = (kids: Node[], gap = 4, extra: Partial<Node> = {}): Node => vbox({ align: "center", gap, hugWidth: false, width: 80 }, kids, { grow: true, ...extra });

const LIP = presetOf("pressedLip");

const tabBar = kit(
  "tab-bar",
  "Bottom tab bar",
  ["底部标签栏", "ボトムタブバー", "하단 탭 바"],
  "Navigation",
  "bottom_navigation",
  "a bar box of equal tab columns, each an icon over its name: the chosen one on a pill (Material), tinted (iOS, icons only where the style shows no names), in a floating capsule, or raised on a tile with a lip (games)",
  [
    variant(
      "pill",
      "Pill behind the icon",
      ["图标背后胶囊", "アイコンの背後にピル", "아이콘 뒤 알약"],
      () =>
        hbox(
          { surface: "bar", width: SCREEN, hugWidth: false, padX: 8, padY: 12, gap: 8, align: "start" },
          TABS.map(([name, label], i) =>
            tabItem([
              box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 64, height: 32, hugWidth: false, hugHeight: false }, [icon(name, { filled: i === 0, color: i === 0 ? "default" : "muted" })], i === 0 ? { fill: "secondaryContainer", corners: round(16) } : {}),
              text(label, "caption", { bold: i === 0, color: i === 0 ? "default" : "muted" }),
            ]),
          ),
        ),
      { span: "screen" },
    ),
    variant(
      "tint",
      "Tinted icons",
      ["着色图标", "色付きアイコン", "색 아이콘"],
      (l) =>
        hbox(
          { surface: "bar", width: SCREEN, hugWidth: false, padX: 8, padY: l.nav === "icononly" ? 12 : 6, gap: 0, align: "start" },
          TABS.map(([name, label], i) => tabItem([icon(name, { size: 26, filled: true, color: i === 0 ? "primary" : "muted" }), ...(l.nav === "icononly" ? [] : [text(label, "tiny", { bold: i === 0, color: i === 0 ? "primary" : "muted" })])], 2)),
        ),
      { span: "screen", suits: (l) => l.nav === "plain" || l.nav === "icononly" || l.nav === "topline" },
    ),
    variant(
      "floating",
      "Floating capsule",
      ["悬浮胶囊", "浮かぶカプセル", "떠 있는 캡슐"],
      () =>
        hbox({ width: SCREEN, hugWidth: false, padX: 16, padY: 8, justify: "center" }, [
          hbox(
            { surface: "overlay", padX: 4, padY: 4, gap: 0 },
            TABS.map(([name, label], i) =>
              vbox({ align: "center", gap: 0, padX: 0, padY: 6, hugWidth: false, width: 76 }, [icon(name, { size: 24, filled: true, color: i === 0 ? "primary" : "default" }), text(label, "tiny", { bold: true, color: i === 0 ? "primary" : "default" })], i === 0 ? { fill: "surfaceContainerHighest", corners: round(26) } : {}),
            ),
            { corners: round(32) },
          ),
        ]),
      { span: "screen", suits: (l) => l.nav === "floating" },
    ),
    variant(
      "game",
      "Raised game tiles",
      ["游戏凸起方块", "ゲームのタイル", "게임 타일"],
      () =>
        hbox(
          { surface: "panel", width: SCREEN, hugWidth: false, padX: 8, padY: 8, gap: 6, align: "end" },
          TABS.map(([name, label], i) =>
            i === 0
              ? vbox({ surface: "button", align: "center", gap: 2, padY: 10, hugWidth: false, width: 80 }, [icon(name, { size: 30, filled: true, color: "on-primary" }), text(label, "caption", { bold: true, color: "on-primary" })], { grow: true, corners: round(14), look: LIP })
              : vbox({ surface: "well", align: "center", gap: 2, padY: 6, hugWidth: false, width: 80 }, [icon(name, { size: 26, filled: true, color: "muted" }), text(label, "caption", { bold: true, color: "muted" })], { grow: true, corners: round(14) }),
          ),
        ),
      { span: "screen", suits: isGame },
    ),
  ],
);

const SEGMENTS = [say("All", "全部", "すべて", "전체"), say("Photos", "照片", "写真", "사진"), say("Videos", "视频", "動画", "동영상")];

const segmented = kit(
  "segmented-header",
  "Segmented header",
  ["分段标题栏", "セグメントヘッダー", "세그먼트 헤더"],
  "Navigation",
  "tab",
  "a bar box holding the ways to view a screen: Material tabs (equal columns, the chosen one with a short line under it, a hairline below), an iOS segmented control (a grey track, the chosen segment on a raised white pill), or a row of capsule buttons",
  [
    variant(
      "tabs",
      "Tabs with an underline",
      ["下划线标签", "下線タブ", "밑줄 탭"],
      () =>
        vbox({ surface: "bar", width: SCREEN, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
          hbox(
            { gap: 0, align: "start" },
            SEGMENTS.map((label, i) =>
              vbox({ align: "center", gap: 0, hugWidth: false, width: 100 }, [hbox({ padX: 0, padY: 14 }, [text(label, "label", { bold: i === 0, color: i === 0 ? "primary" : "muted" })]), box({ layout: "row", padX: 0, padY: 0, width: 48, height: 3, hugWidth: false, hugHeight: false }, [], i === 0 ? { fill: "primary", corners: { tl: 3, tr: 3, br: 0, bl: 0 } } : {})], { grow: true }),
            ),
          ),
          rule(SCREEN),
        ]),
      { span: "screen" },
    ),
    variant(
      "control",
      "Segmented control",
      ["分段控件", "セグメントコントロール", "세그먼트 컨트롤"],
      () =>
        hbox({ surface: "bar", width: SCREEN, hugWidth: false, padX: 16, padY: 8 }, [
          hbox(
            { padX: 2, padY: 2, gap: 0, hugWidth: false, width: 380 },
            SEGMENTS.map((label, i) => hbox({ justify: "center", padX: 8, padY: 6, hugWidth: false, width: 100 }, [text(label, "label", { bold: i === 0 })], { grow: true, ...(i === 0 ? { fill: "surface" as const, corners: round(7), look: { elevation: 1 as const } } : {}) })),
            { grow: true, fill: "surfaceContainerHigh", corners: round(9) },
          ),
        ]),
      { span: "screen", suits: (l) => l.segmented === "ios" || l.tabs === "segmented" },
    ),
    variant(
      "capsules",
      "Capsule buttons",
      ["胶囊按钮", "カプセルボタン", "캡슐 버튼"],
      () => hbox({ surface: "bar", width: SCREEN, hugWidth: false, padX: 16, padY: 8, gap: 8 }, SEGMENTS.map((label, i) => button(label, { variant: i === 0 ? "filled" : "tonal", size: "xs" }))),
      { span: "screen", suits: (l) => l.segmented === "capsules" || l.tabs === "pill" || l.tabs === "short" },
    ),
  ],
);

const toolbar = kit(
  "toolbar-row",
  "Toolbar row",
  ["工具栏组合", "ツールバー行", "툴바 행"],
  "Navigation",
  "tune",
  "a floating rounded overlay box of icon buttons beside a larger tonal action (Material); a bar spanning the screen with its icon buttons spread out (iOS); or a desktop command bar of small labeled buttons parted by upright hairlines",
  [
    variant("floating", "Floating, with an action", ["悬浮，带主操作", "浮かぶ・アクション付き", "떠 있음·동작 포함"], () =>
      hbox({ gap: 8 }, [
        hbox({ surface: "overlay", padX: 8, padY: 8, gap: 4 }, [iconButton("undo", say("Undo", "撤销", "元に戻す", "실행 취소")), iconButton("redo", say("Redo", "重做", "やり直す", "다시 실행")), iconButton("crop", say("Crop", "裁剪", "切り抜き", "자르기"), { iconFill: true }), iconButton("tune", say("Adjust", "调整", "調整", "조정")), iconButton("share", T.share)], { corners: round(28) }),
        iconButton("check", T.done, { variant: "tonal", size: "md" }, { corners: round(16) }),
      ]),
    ),
    variant(
      "docked",
      "Docked across",
      ["贴底通栏", "下部に固定", "하단 고정"],
      () =>
        hbox({ surface: "bar", width: SCREEN, hugWidth: false, padX: 16, padY: 8, justify: "between" }, [iconButton("share", T.share), iconButton("favorite", T.like), iconButton("info", say("Info", "信息", "情報", "정보")), iconButton("delete", T.remove)]),
      { span: "screen", suits: isIosLike },
    ),
    variant(
      "command",
      "Command bar",
      ["命令栏", "コマンドバー", "명령 모음"],
      () =>
        hbox({ surface: "bar", width: 640, hugWidth: false, padX: 8, padY: 4, gap: 2 }, [
          button(say("New", "新建", "新規", "새로 만들기"), { variant: "ghost", size: "xs", icon: "add" }),
          rule(20, true),
          button(T.copy, { variant: "ghost", size: "xs", icon: "content_copy" }),
          button(say("Paste", "粘贴", "貼り付け", "붙여넣기"), { variant: "ghost", size: "xs", icon: "assignment" }),
          button(T.remove, { variant: "ghost", size: "xs", icon: "delete" }),
          rule(20, true),
          button(T.share, { variant: "ghost", size: "xs", icon: "share" }),
          push(),
          iconButton("more_horiz", T.more, { size: "xs" }),
        ]),
      { suits: isDense },
    ),
  ],
);

const CRUMBS = [say("Projects", "项目", "プロジェクト", "프로젝트"), say("Design", "设计", "デザイン", "디자인"), say("Mobile app", "移动应用", "モバイルアプリ", "모바일 앱")];
const chevron = () => icon("chevron_right", { size: 16, color: "muted" });

const breadcrumb = kit(
  "breadcrumb-bar",
  "Breadcrumb bar",
  ["面包屑栏", "パンくずバー", "이동 경로 바"],
  "Navigation",
  "more_horiz",
  "a row of the way down: a home icon, muted levels parted by chevrons and the current one in bold; on desktop slashes and the page's actions at the far end; on a phone a back button before the last two levels",
  [
    variant("chevrons", "Chevrons", ["箭头分隔", "矢印区切り", "화살표 구분"], () =>
      hbox({ gap: 4 }, [icon("home", { size: 18, color: "muted" }), chevron(), muted(CRUMBS[0]), chevron(), muted(CRUMBS[1]), chevron(), text(CRUMBS[2], "body", { bold: true })]),
    ),
    variant(
      "page",
      "Page header with slashes",
      ["斜杠与页面操作", "スラッシュとページ操作", "슬래시와 페이지 동작"],
      () =>
        hbox({ width: 640, hugWidth: false, justify: "between" }, [
          hbox({ gap: 6 }, [muted(say("Workspace", "工作区", "ワークスペース", "작업 공간")), muted("/"), muted(CRUMBS[0]), muted("/"), text(say("Q3 roadmap", "第三季度路线图", "Q3 ロードマップ", "3분기 로드맵"), "body", { bold: true })]),
          hbox({ gap: 4 }, [button(T.share, { variant: "outlined", size: "xs" }), iconButton("more_horiz", T.more, { size: "xs" })]),
        ]),
      { suits: isDense },
    ),
    variant("back", "Back and the last levels", ["返回与末级", "戻ると下位階層", "뒤로와 하위 단계"], () =>
      hbox({ gap: 2 }, [iconButton("arrow_back", T.back, { size: "sm" }), muted(CRUMBS[1]), chevron(), text(CRUMBS[2], "body", { bold: true })]),
    ),
  ],
);

const MAIL: [string, Say, string][] = [
  ["inbox", say("Inbox", "收件箱", "受信トレイ", "받은편지함"), "24"],
  ["star", say("Starred", "已加星标", "スター付き", "별표"), ""],
  ["send", say("Sent", "已发送", "送信済み", "보낸편지함"), ""],
  ["draft", say("Drafts", "草稿", "下書き", "임시보관함"), "3"],
  ["delete", say("Trash", "回收站", "ゴミ箱", "휴지통"), ""],
];

const sidebar = kit(
  "sidebar-nav",
  "Sidebar navigation",
  ["侧边导航", "サイドバーナビゲーション", "사이드바 내비게이션"],
  "Navigation",
  "side_navigation",
  "a column of destinations, each a row of an icon, a name that takes the rest and a count: Material's drawer on a sheet with the chosen one on a full pill; a dense desktop list under a small section title; or a rail of icon buttons only, settings at the foot",
  [
    variant("drawer", "Drawer", ["抽屉导航", "ドロワー", "서랍"], () =>
      vbox({ surface: "sheet", width: 300, hugWidth: false, padX: 12, padY: 12, gap: 0 }, [
        hbox({ padX: 16, padY: 16 }, [text(say("Mail", "邮件", "メール", "메일"), "title")]),
        ...MAIL.map(([name, label, n], i) => hbox({ padX: 16, padY: 16, gap: 12 }, [icon(name, { filled: i === 0, color: i === 0 ? "default" : "muted" }), para(label, "label", { bold: i === 0, maxLines: 1 }, { grow: true }), ...(n ? [text(n, "label", { color: "muted" })] : [])], i === 0 ? { fill: "secondaryContainer", corners: round(28) } : {})),
      ]),
    ),
    variant(
      "list",
      "Dense list",
      ["紧凑列表", "詰めたリスト", "촘촘한 목록"],
      () =>
        vbox({ surface: "panel", width: 240, hugWidth: false, padX: 8, padY: 12, gap: 2 }, [
          hbox({ padX: 10, padY: 4 }, [muted(say("Mailboxes", "邮箱", "メールボックス", "편지함"), "caption", { bold: true })]),
          ...MAIL.map(([name, label, n], i) => hbox({ padX: 10, padY: 6, gap: 10 }, [icon(name, { size: 18, color: i === 0 ? "primary" : "muted" }), para(label, "body", { maxLines: 1 }, { grow: true }), ...(n ? [muted(n, "caption")] : [])], i === 0 ? { fill: "surfaceContainerHigh", corners: round(6) } : {})),
        ]),
      { suits: isDense },
    ),
    variant(
      "rail",
      "Icon rail",
      ["图标侧栏", "アイコンレール", "아이콘 레일"],
      () =>
        vbox({ surface: "bar", width: 52, hugWidth: false, height: 360, hugHeight: false, padX: 6, padY: 8, gap: 4, align: "center", justify: "between" }, [
          vbox({ gap: 4, align: "center" }, [iconButton("description", say("Files", "文件", "ファイル", "파일"), { variant: "tonal", size: "sm" }), iconButton("search", T.search, { size: "sm" }), iconButton("account_tree", say("Branches", "分支", "ブランチ", "브랜치"), { size: "sm" }), iconButton("extension", say("Extensions", "扩展", "拡張機能", "확장"), { size: "sm" })]),
          vbox({ gap: 4, align: "center" }, [iconButton("account_circle", say("Account", "账号", "アカウント", "계정"), { size: "sm" }), iconButton("settings", T.settings, { size: "sm" })]),
        ]),
      { suits: (l) => l.nav === "icononly" && isDense(l) },
    ),
  ],
);

const PAGES = [say("Kyoto travel guide", "京都旅行指南", "京都旅行ガイド", "교토 여행 가이드"), say("Train timetable", "列车时刻表", "電車の時刻表", "열차 시간표"), say("Weather", "天气", "天気", "날씨")];
const FILES = ["app.tsx", "routes.ts", "README.md"].map((f) => say(f, f, f, f));

const tabStrip = kit(
  "tab-strip",
  "Tab strip",
  ["标签条", "タブストリップ", "탭 스트립"],
  "Desktop",
  "tab",
  "a bar box of tabs, each a row of a small icon, a title that takes the rest and a close icon: a browser's with the open tab on a lighter rounded tile and a plus after them; or an editor's, the open one lit by a line along its top and parted by upright hairlines",
  [
    variant("browser", "Browser tabs", ["浏览器标签", "ブラウザのタブ", "브라우저 탭"], () =>
      hbox({ surface: "bar", width: 640, hugWidth: false, padX: 8, padY: 6, gap: 4 }, [
        ...PAGES.map((title, i) => hbox({ padX: 10, padY: 7, gap: 8, hugWidth: false, width: 180 }, [icon("travel_explore", { size: 16, color: i === 0 ? "primary" : "muted" }), para(title, "caption", { maxLines: 1, color: i === 0 ? "default" : "muted" }, { grow: true }), icon("close", { size: 16, color: "muted" })], i === 0 ? { fill: "surface", corners: round(8) } : {})),
        iconButton("add", say("New tab", "新标签页", "新しいタブ", "새 탭"), { size: "xs" }),
      ]),
    ),
    variant(
      "editor",
      "Editor tabs",
      ["编辑器标签", "エディタのタブ", "편집기 탭"],
      () =>
        hbox(
          { surface: "bar", width: 640, hugWidth: false, padX: 0, padY: 0, gap: 0, align: "start" },
          FILES.flatMap((f, i) => [
            /* a tab of a set width, so the line along the top of the open one runs its whole width */
            vbox({ gap: 0, padX: 0, padY: 0, hugWidth: false, width: 148 }, [box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: 8, height: 2 }, [], i === 0 ? { fill: "primary" } : {}), hbox({ padX: 12, padY: 8, gap: 6 }, [icon("description", { size: 16, color: i === 0 ? "primary" : "muted" }), para(f, "caption", { maxLines: 1, color: i === 0 ? "default" : "muted" }, { grow: true }), icon("close", { size: 16, color: i === 0 ? "default" : "muted" })])], i === 0 ? { fill: "surface" } : {}),
            rule(34, true),
          ]),
        ),
      { suits: (l) => l.tabs === "topline" || isDense(l) },
    ),
  ],
);

/** a Mac's three window buttons, in their own colors */
const LIGHTS = '<svg viewBox="0 0 52 12"><circle cx="6" cy="6" r="6" fill="#ff5f57"/><circle cx="26" cy="6" r="6" fill="#febc2e"/><circle cx="46" cy="6" r="6" fill="#28c840"/></svg>';
const lights = (): Node => atom("svg", { mode: "markup", markup: LIGHTS, width: 52, height: 12, label: say("Close, minimize, zoom", "关闭、最小化、缩放", "閉じる・しまう・拡大", "닫기, 최소화, 확대") });
/** a Windows caption button: a 46 × 32 hit area around a 16 px glyph */
const caption = (name: string, filled = true): Node => box({ layout: "row", align: "center", justify: "center", padX: 15, padY: 8 }, [icon(name, { size: 16, filled })]);
const WINDOW = say("Notes — Untitled", "笔记 — 未命名", "メモ — 無題", "메모 — 제목 없음");

const titleBar = kit(
  "window-title-bar",
  "Window title bar",
  ["窗口标题栏", "ウィンドウのタイトルバー", "창 제목 표시줄"],
  "Desktop",
  "web_asset",
  "a bar box across a window: an app icon and the title at the left and minimize / maximize / close caption buttons at the right (Windows); or the three traffic lights at the left with the title centered between two equal sides (Mac), or with a sidebar toggle and toolbar buttons",
  [
    variant(
      "buttons",
      "Caption buttons at the right",
      ["右侧窗口按钮", "右にキャプションボタン", "오른쪽 창 버튼"],
      () => hbox({ surface: "bar", width: 640, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [hbox({ padX: 12, padY: 8, gap: 8 }, [icon("edit_note", { size: 16, color: "primary" }), text(WINDOW, "caption")]), push(), caption("remove"), caption("square", false), caption("close")]),
      { suits: (l) => l.caption === "buttons" },
    ),
    variant(
      "lights",
      "Traffic lights, title centered",
      ["红绿灯，标题居中", "信号ボタン・中央タイトル", "신호등·가운데 제목"],
      () =>
        hbox({ surface: "bar", width: 640, hugWidth: false, padX: 12, padY: 10, gap: 8 }, [
          hbox({ gap: 0, hugWidth: false, width: 100 }, [lights()], { grow: true }),
          text(WINDOW, "caption", { bold: true }),
          hbox({ gap: 0, hugWidth: false, width: 100, hugHeight: false, height: 12, justify: "end" }, [], { grow: true }),
        ]),
      { suits: (l) => l.caption === "lights" },
    ),
    variant("toolbar", "Traffic lights and a toolbar", ["红绿灯与工具栏", "信号ボタンとツールバー", "신호등과 도구 모음"], () =>
      hbox({ surface: "bar", width: 640, hugWidth: false, padX: 12, padY: 6, gap: 8 }, [lights(), iconButton("view_sidebar", say("Sidebar", "侧边栏", "サイドバー", "사이드바"), { size: "xs" }), text(say("Notes", "笔记", "メモ", "메모"), "label", { bold: true }), push(), iconButton("search", T.search, { size: "xs" }), iconButton("share", T.share, { size: "xs" }), iconButton("more_horiz", T.more, { size: "xs" })]),
    ),
  ],
);

/** a status item: a small glyph and its words, in the color of what it stands on */
const status = (name: string, words: string | Say, color = "on-primary"): Node => hbox({ gap: 4 }, [...(name ? [icon(name, { size: 16, filled: true, color })] : []), ...(words ? [text(words, "caption", { color })] : [])]);

const statusRow = kit(
  "status-row",
  "Status row",
  ["状态栏", "ステータス行", "상태 행"],
  "Desktop",
  "info",
  "a thin row of small icon-and-words items: an editor's status bar on the primary color (branch, sync, problems at the left; cursor, encoding, language at the right); a phone's (the time, then signal, Wi-Fi and battery); or a game's chip of ping, frame rate and battery",
  [
    variant(
      "phone",
      "Phone status bar",
      ["手机状态栏", "スマホのステータスバー", "휴대폰 상태 표시줄"],
      () => hbox({ width: SCREEN, hugWidth: false, padX: 24, padY: 12, justify: "between" }, [text("9:41", "label", { bold: true }), hbox({ gap: 6 }, [icon("signal_cellular_alt", { size: 18, filled: true }), icon("wifi", { size: 18, filled: true }), icon("battery_full", { size: 18, filled: true })])]),
      { span: "screen" },
    ),
    variant(
      "editor",
      "Editor status bar",
      ["编辑器状态栏", "エディタのステータスバー", "편집기 상태 표시줄"],
      () =>
        hbox({ width: 640, hugWidth: false, padX: 8, padY: 3, gap: 14 }, [status("account_tree", "main"), status("sync", ""), status("cancel", "0"), status("warning", "2"), push(), status("", say("Ln 12, Col 8", "行 12，列 8", "12 行、8 列", "줄 12, 열 8")), status("", say("UTF-8", "UTF-8", "UTF-8", "UTF-8")), status("", say("TypeScript", "TypeScript", "TypeScript", "TypeScript"))], { fill: "primary" }),
      { suits: isDense },
    ),
    variant(
      "game",
      "Game readout",
      ["游戏状态读数", "ゲームの表示", "게임 표시"],
      () => hbox({ surface: "chip", padX: 10, padY: 4, gap: 12 }, [status("wifi", "32 ms", "default"), status("", say("60 FPS", "60 FPS", "60 FPS", "60 FPS"), "default"), status("battery_5_bar", "82%", "default")], { corners: round(12) }),
      { suits: isGame },
    ),
  ],
);

export const navigationKits: KitDef[] = [tabBar, segmented, toolbar, breadcrumb, sidebar, tabStrip, titleBar, statusRow];
