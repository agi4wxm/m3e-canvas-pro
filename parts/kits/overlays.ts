import { button, hbox, icon, iconButton, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { presetOf } from "../../lib/look";
import { SCREEN, T, W, grabber, isDense, isGame, isIosLike, isWeui, kit, muted, rule, variant } from "./shared";
import type { KitDef } from "./types";

/* What floats over a screen, as atoms. A dialog is where products differ most: Material sets a left-aligned title
 * and text with text buttons at the end; an iPhone centers a bold title and a small message over a hairline and
 * splits the buttons between hairlines; WeChat does the same with more room and its green; a game puts the title on
 * a colored band and gives the buttons a lip. A sheet starts with a grabber; an iPhone's action sheet is a rounded
 * group with Cancel apart under it, WeChat's runs edge to edge with a gap before Cancel. */

/** words centered in an equal share of a row of split buttons */
const cell = (words: Say, color = "primary", bold = false, padY = 11): Node => hbox({ justify: "center", padX: 8, padY, hugWidth: false, width: 100 }, [text(words, "lead", { color, bold })], { grow: true });
/** a full-width tappable line of a sheet or an alert */
const line = (words: Say, color = "primary", bold = false, padY = 16): Node => hbox({ justify: "center", padX: 16, padY }, [text(words, "lead", { color, bold })]);

const toast = kit(
  "snackbar-toast",
  "Snackbar and toast",
  ["提示条与轻提示", "スナックバーとトースト", "스낵바와 토스트"],
  "Feedback",
  "notifications_active",
  "a short message on the inverse surface: Material's snackbar (one line, an action, a close); a centered dark square with a glyph over a word (iPhone and WeChat toasts); or a raised card with a glyph, a title over a muted line and an undo button (web toasts)",
  [
    variant("snackbar", "Snackbar", ["提示条", "スナックバー", "스낵바"], () =>
      hbox({ surface: "overlay", width: 344, hugWidth: false, padX: 16, padY: 6, gap: 8 }, [para(say("Photo archived", "照片已归档", "写真をアーカイブしました", "사진을 보관했습니다"), "body", { color: "inverse", maxLines: 1 }, { grow: true }), button(say("Undo", "撤销", "元に戻す", "실행 취소"), { variant: "text", size: "xs" }, { textColor: "inverseOnSurface" }), iconButton("close", T.close, { size: "xs" }, { textColor: "inverseOnSurface" })], { fill: "inverseSurface", corners: round(4) }),
    ),
    variant(
      "toast",
      "Centered toast",
      ["居中轻提示", "中央のトースト", "가운데 토스트"],
      () => vbox({ surface: "overlay", width: 136, hugWidth: false, padX: 16, padY: 20, gap: 10, align: "center" }, [icon("check_circle", { size: 40, color: "inverse" }), text(say("Saved", "已保存", "保存しました", "저장됨"), "body", { color: "inverse", align: "center" })], { fill: "inverseSurface", corners: round(12) }),
      { suits: (l) => isWeui(l) || isIosLike(l) },
    ),
    variant(
      "card",
      "Card with an action",
      ["带操作的卡片", "アクション付きカード", "동작이 있는 카드"],
      () =>
        hbox({ surface: "overlay", width: 356, hugWidth: false, padX: 16, padY: 14, gap: 12, align: "start" }, [
          icon("check_circle", { size: 20, filled: true, color: "primary" }),
          vbox({ gap: 2, hugWidth: false, width: 200 }, [text(say("Event created", "已创建日程", "予定を作成しました", "일정이 생성됨"), "label", { bold: true }), para(say("Sunday, December 3 at 9:00 AM", "12 月 3 日（周日）上午 9:00", "12 月 3 日（日）午前 9:00", "12월 3일 일요일 오전 9:00"), "caption", { color: "muted" })], { grow: true }),
          button(say("Undo", "撤销", "元に戻す", "실행 취소"), { variant: "tonal", size: "xs" }),
        ], { corners: round(12) }),
      { suits: isDense },
    ),
  ],
);

const alertBanner = kit(
  "alert-banner",
  "Inline alert",
  ["内联提醒", "インラインアラート", "인라인 알림"],
  "Feedback",
  "info",
  "a tinted panel row: a glyph, a bold title over a line; an outlined one with a warning glyph, a review button under the words and a close at the end; or a thin strip across the screen with one line and a fix button",
  [
    variant("tonal", "Tinted", ["浅色底", "淡い背景", "옅은 배경"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 16, padY: 14, gap: 12, align: "start" }, [icon("info", { size: 22, color: "default" }), vbox({ gap: 2, hugWidth: false, width: 200 }, [text(say("Update available", "有可用更新", "アップデートがあります", "업데이트 가능"), "label", { bold: true }), para(say("Restart the app to get the latest fixes.", "重启应用即可获得最新修复。", "アプリを再起動して最新の修正を適用してください。", "앱을 다시 시작해 최신 수정 사항을 받으세요."), "body")], { grow: true })], { fill: "secondaryContainer", corners: round(12) }),
    ),
    variant("outlined", "Outlined, with actions", ["描边带操作", "枠線・アクション付き", "윤곽선·동작"], () =>
      hbox({ surface: "chip", width: W, hugWidth: false, padX: 16, padY: 14, gap: 12, align: "start" }, [
        icon("warning", { size: 22, color: "tertiary" }),
        vbox({ gap: 4, hugWidth: false, width: 200 }, [text(say("Storage almost full", "存储空间即将用完", "ストレージがほぼいっぱいです", "저장 공간이 거의 찼습니다"), "label", { bold: true }), para(say("You have 1.2 GB left. Free up space to keep syncing.", "仅剩 1.2 GB，请清理空间以继续同步。", "残り 1.2 GB です。同期を続けるには空き容量を増やしてください。", "1.2GB 남았습니다. 동기화를 계속하려면 공간을 확보하세요."), "body", { color: "muted" }), hbox({ gap: 0 }, [button(say("Review", "查看", "確認する", "확인"), { variant: "text", size: "xs" })])], { grow: true }),
        iconButton("close", T.close, { size: "xs" }),
      ], { corners: round(12) }),
    ),
    variant(
      "strip",
      "Strip across",
      ["通栏条", "横長の帯", "가로 띠"],
      () => hbox({ width: SCREEN, hugWidth: false, padX: 16, padY: 6, gap: 8 }, [icon("error", { size: 18, color: "default" }), para(say("You're offline. Changes will sync later.", "当前离线，更改稍后同步。", "オフラインです。変更は後で同期されます。", "오프라인입니다. 변경 사항은 나중에 동기화됩니다."), "caption", { maxLines: 1 }, { grow: true }), button(say("Retry", "重试", "再試行", "재시도"), { variant: "text", size: "xs" })], { fill: "tertiaryContainer" }),
      { span: "screen" },
    ),
  ],
);

const DISCARD_TITLE = say("Discard draft?", "放弃草稿？", "下書きを破棄しますか？", "임시 저장본을 삭제할까요?");
const DISCARD_TEXT = say("Your message will be lost.", "你的消息将不会被保存。", "メッセージは保存されません。", "메시지가 저장되지 않습니다.");
const DISCARD = say("Discard", "放弃", "破棄", "삭제");

const dialog = kit(
  "dialog-body",
  "Dialog body",
  ["对话框内容", "ダイアログの中身", "대화상자 본문"],
  "Overlays",
  "chat_info",
  "an overlay box: Material's left-aligned headline and text over text buttons at the end; an iPhone alert's centered bold title and small message over a hairline and two buttons split by an upright hairline; WeChat's with more room and the confirm in the primary color; or a game's with the title on a colored band and two lipped buttons",
  [
    variant("material", "Material", ["Material", "Material", "Material"], () =>
      vbox({ surface: "overlay", width: 312, hugWidth: false, padX: 24, padY: 24, gap: 16 }, [text(DISCARD_TITLE, "headline"), para(DISCARD_TEXT, "body", { color: "muted" }), hbox({ justify: "end", gap: 8 }, [button(T.cancel, { variant: "text" }), button(DISCARD, { variant: "text" })])], { corners: round(28) }),
    ),
    variant(
      "alert",
      "Centered alert",
      ["居中提醒", "中央アラート", "가운데 알림"],
      () =>
        vbox({ surface: "overlay", width: 270, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
          vbox({ padX: 16, padY: 20, gap: 4, align: "center" }, [text(DISCARD_TITLE, "heading", { bold: true, align: "center" }), para(DISCARD_TEXT, "caption", { align: "center", width: 238 })]),
          rule(270),
          hbox({ gap: 0, padX: 0, padY: 0 }, [cell(T.cancel), rule(44, true), cell(DISCARD, "error", true)]),
        ], { corners: round(14) }),
      { suits: (l) => l.dialog === "alert" },
    ),
    variant(
      "weui",
      "Split buttons, roomy",
      ["宽松分栏按钮", "ゆったり分割ボタン", "넉넉한 분할 버튼"],
      () =>
        vbox({ surface: "overlay", width: 320, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
          vbox({ padX: 24, padY: 32, gap: 16, align: "center" }, [text(DISCARD_TITLE, "heading", { bold: true, align: "center" }), para(DISCARD_TEXT, "body", { color: "muted", align: "center", width: 272 })]),
          rule(320),
          hbox({ gap: 0, padX: 0, padY: 0 }, [cell(T.cancel, "default", true, 16), rule(56, true), cell(DISCARD, "primary", true, 16)]),
        ], { corners: round(12) }),
      { suits: (l) => l.dialog === "weui" },
    ),
    variant(
      "game",
      "Colored header band",
      ["彩色标题条", "色付きヘッダー", "색 머리글"],
      () =>
        vbox({ surface: "panel", width: 320, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
          hbox({ justify: "center", padX: 16, padY: 12 }, [text(say("Leave the battle?", "离开战斗？", "バトルを離れますか？", "전투를 떠날까요?"), "heading", { bold: true, color: "on-primary" })], { fill: "primary", corners: { tl: 16, tr: 16, br: 0, bl: 0 } }),
          vbox({ padX: 20, padY: 20, gap: 18 }, [para(say("Rewards from this round will be lost.", "本局的奖励将不会保留。", "このラウンドの報酬は失われます。", "이번 판의 보상은 사라집니다."), "body", { align: "center" }), hbox({ gap: 12 }, [button(T.cancel, { variant: "tonal", size: "md" }, { grow: true }), button(say("Leave", "离开", "離れる", "떠나기"), { variant: "filled", size: "md" }, { grow: true, look: presetOf("pressedLip") })])]),
        ], { corners: round(16) }),
      { suits: (l) => l.dialog === "game" || isGame(l) },
    ),
  ],
);

const OPTIONS: [string, Say][] = [
  ["photo_camera", say("Take photo", "拍照", "写真を撮る", "사진 찍기")],
  ["photo_library", say("Choose from library", "从相册选择", "ライブラリから選ぶ", "보관함에서 선택")],
  ["draft", say("Browse files", "浏览文件", "ファイルを参照", "파일 찾아보기")],
];
const DELETE = say("Delete photo", "删除照片", "写真を削除", "사진 삭제");

const actionSheet = kit(
  "option-sheet",
  "Option sheet",
  ["选项面板", "選択肢シート", "옵션 시트"],
  "Overlays",
  "list",
  "a sheet of choices pinned to the bottom of the screen: Material's bottom sheet with a handle and rows of an icon and words; an iPhone's rounded group of centered choices parted by hairlines, the destructive one in red, with Cancel in a group of its own under it; or WeChat's edge-to-edge rows with a grey gap before Cancel",
  [
    variant(
      "material",
      "Bottom sheet list",
      ["底部面板列表", "ボトムシートのリスト", "하단 시트 목록"],
      () => vbox({ surface: "sheet", pin: "bottom", width: SCREEN, hugWidth: false, padX: 0, padY: 8, gap: 0 }, [hbox({ justify: "center", padY: 8, hugWidth: false, width: SCREEN }, [grabber(32, 4)]), ...OPTIONS.map(([name, label]) => hbox({ padX: 24, padY: 14, gap: 16 }, [icon(name, { color: "muted" }), text(label, "lead")]))]),
      { span: "screen" },
    ),
    variant(
      "ios",
      "Grouped, Cancel apart",
      ["分组，取消单独", "グループ・キャンセル別", "묶음·취소 분리"],
      () =>
        vbox({ pin: "floatingBottom", width: W, hugWidth: false, gap: 8 }, [
          vbox({ surface: "overlay", padX: 0, padY: 0, gap: 0 }, [hbox({ justify: "center", padY: 14 }, [muted(say("Change profile photo", "更换头像", "プロフィール写真を変更", "프로필 사진 변경"), "caption")]), ...OPTIONS.slice(0, 2).flatMap(([, label]) => [rule(), line(label)]), rule(), line(DELETE, "error")], { corners: round(14) }),
          vbox({ surface: "overlay", padX: 0, padY: 0, gap: 0 }, [line(T.cancel, "primary", true)], { corners: round(14) }),
        ]),
      { suits: (l) => isIosLike(l) && !isWeui(l) },
    ),
    variant(
      "weui",
      "Edge to edge, gap before Cancel",
      ["通栏，取消前留空", "端まで・キャンセル前に余白", "가장자리·취소 앞 간격"],
      () =>
        vbox({ surface: "sheet", pin: "bottom", width: SCREEN, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
          ...OPTIONS.slice(0, 2).flatMap(([, label], i) => [...(i ? [rule(SCREEN)] : []), line(label, "default")]),
          rule(SCREEN),
          line(DELETE, "error"),
          hbox({ padX: 0, padY: 0, hugWidth: false, width: SCREEN, hugHeight: false, height: 8 }, [], { fill: "surfaceContainer" }),
          line(T.cancel, "default"),
        ]),
      { span: "screen", suits: isWeui },
    ),
  ],
);

const NEW_EVENT = say("New event", "新建日程", "新規イベント", "새 일정");

const sheetHead = kit(
  "sheet-header",
  "Sheet header",
  ["面板标题栏", "シートのヘッダー", "시트 머리글"],
  "Overlays",
  "bottom_panel_open",
  "the top of a sheet: a handle over the title at the start and a tonal close button at the end; an iPhone's grabber over Cancel, a bold centered title and a bold Add; or Material's handle over a title and a muted line",
  [
    variant("close", "Title and close", ["标题与关闭", "タイトルと閉じる", "제목과 닫기"], () =>
      vbox({ surface: "sheet", width: SCREEN, hugWidth: false, padX: 16, padY: 8, gap: 8 }, [grabber(), hbox({ justify: "between" }, [text(say("Share", "分享", "共有", "공유"), "title", { bold: true }), iconButton("close", T.close, { variant: "tonal", size: "xs" })])]),
      { span: "screen" },
    ),
    variant(
      "ios",
      "Cancel, title, Add",
      ["取消·标题·添加", "キャンセル・タイトル・追加", "취소·제목·추가"],
      () =>
        vbox({ surface: "sheet", width: SCREEN, hugWidth: false, padX: 8, padY: 6, gap: 4 }, [
          grabber(),
          hbox({ gap: 4 }, [hbox({ gap: 0, hugWidth: false, width: 100 }, [button(T.cancel, { variant: "text", size: "sm" })], { grow: true }), text(NEW_EVENT, "heading", { bold: true }), hbox({ gap: 0, hugWidth: false, width: 100, justify: "end" }, [button(T.add, { variant: "text", size: "sm" })], { grow: true })]),
        ]),
      { span: "screen", suits: isIosLike },
    ),
    variant("material", "Handle, title and line", ["拖动条·标题·说明", "ハンドル・タイトル・説明", "핸들·제목·설명"], () =>
      vbox({ surface: "sheet", width: SCREEN, hugWidth: false, padX: 24, padY: 12, gap: 6 }, [grabber(32, 4), text(NEW_EVENT, "title"), para(say("Add the details and invite people.", "填写详情并邀请他人。", "詳細を入力して招待しましょう。", "세부 정보를 입력하고 초대하세요."), "body", { color: "muted" })]),
    ),
  ],
);

export const overlayKits: KitDef[] = [toast, alertBanner, dialog, actionSheet, sheetHead];
