import { atom, avatar, hbox, icon, para, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { MATERIAL_LOOK, type KitDef, type KitLook } from "./types";
import { section, tile } from "./shared";

/* Rows of a list, as atoms: what leads (an icon, an avatar), two lines of words that take the rest
 * of the row and cut off with an ellipsis, and what trails (a chevron, a switch, a value, a time). */

const W = 380;

/** the two lines of a row: they take what the row leaves, each on one line */
const lines = (title: Say, sub?: Say): Node =>
  vbox({ gap: 2, hugWidth: false, width: 200 }, [para(title, "lead", { maxLines: 1 }), ...(sub ? [para(sub, "body", { color: "muted", maxLines: 1 })] : [])], { grow: true });

/** a row: a fixed width, the parts centered across it */
const row = (kids: Node[], name: Say, pad = 12): Node => hbox({ width: W, hugWidth: false, padX: 16, padY: pad, gap: 16 }, kids, { name });

const chevron = () => icon("chevron_right", { color: "muted" });

const listRow: KitDef = {
  slug: "list-row",
  name: "List row",
  labels: { zh: "列表行", ja: "リスト行", ko: "목록 행" },
  category: "Lists",
  icon: "list",
  about: "a row box: a leading icon or avatar, a column of a title and a supporting line that takes the rest, and a chevron, a switch or a value at the end",
  variants: [
    {
      key: "icon",
      name: "Icon, two lines, chevron",
      labels: { zh: "图标·两行·箭头", ja: "アイコン・二行・矢印", ko: "아이콘·두 줄·화살표" },
      build: () => row([icon("inbox", { color: "muted" }), lines(say("Inbox", "收件箱", "受信トレイ", "받은편지함"), say("12 new messages", "12 条新消息", "新着 12 件", "새 메시지 12개")), chevron()], say("List row", "列表行", "リスト行", "목록 행")),
    },
    {
      key: "avatar",
      name: "Avatar, two lines, time",
      labels: { zh: "头像·两行·时间", ja: "アバター・二行・時刻", ko: "아바타·두 줄·시간" },
      build: () =>
        row(
          [avatar("MC"), lines(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), say("See you at the station at six.", "六点车站见。", "6時に駅で会おう。", "6시에 역에서 봐요.")), vbox({ gap: 4, align: "end" }, [text("9:41", "caption", { color: "muted" }), atom("badge", { kind: "label", label: "2" })])],
          say("Conversation row", "会话行", "会話の行", "대화 행"),
        ),
    },
    {
      key: "switch",
      name: "Icon, two lines, switch",
      labels: { zh: "图标·两行·开关", ja: "アイコン・二行・スイッチ", ko: "아이콘·두 줄·스위치" },
      build: () => row([icon("wifi", { color: "muted", filled: true }), lines(say("Wi-Fi", "无线网络", "Wi-Fi", "Wi-Fi"), say("Home network", "家庭网络", "自宅のネットワーク", "집 네트워크")), atom("switch", { label: "", checked: true })], say("Switch row", "开关行", "スイッチの行", "스위치 행")),
    },
    {
      key: "value",
      name: "Title, value, chevron",
      labels: { zh: "标题·取值·箭头", ja: "タイトル・値・矢印", ko: "제목·값·화살표" },
      build: () => row([lines(say("Language", "语言", "言語", "언어")), text(say("English", "简体中文", "日本語", "한국어"), "body", { color: "muted" }), chevron()], say("Value row", "取值行", "値の行", "값 행"), 16),
    },
    {
      key: "section",
      name: "Several, as a section",
      labels: { zh: "多行成组", ja: "複数行のセクション", ko: "여러 행 묶음" },
      /* grouped the way the style groups a list; the hairlines start at the words, past the 24 px icon */
      build: (look = MATERIAL_LOOK) =>
        section(
          [
            row([icon("inbox", { color: "muted" }), lines(say("Inbox", "收件箱", "受信トレイ", "받은편지함")), chevron()], say("List row", "列表行", "リスト行", "목록 행")),
            row([icon("star", { color: "muted" }), lines(say("Starred", "星标", "スター付き", "별표")), chevron()], say("List row", "列表行", "リスト行", "목록 행")),
            row([icon("send", { color: "muted" }), lines(say("Sent", "已发送", "送信済み", "보낸편지함")), chevron()], say("List row", "列表行", "リスト行", "목록 행")),
          ],
          look,
          56,
        ),
    },
  ],
};

/** where a setting's icon sits: on a small tile of the primary color where lists are grouped on a grey ground (an
 *  iPhone's settings), bare where they are not; a switch drawn the iOS way says nothing about the list around it. The
 *  tile is painted, not a surface a style dresses as a button: one that draws its buttons as bare words would leave the
 *  white glyph on nothing. */
const settingIcon = (name: string, look: KitLook): Node => (look.list === "inset" ? tile(name, "primary", 28, 20, 7) : icon(name, { color: "muted" }));

const settingsRow: KitDef = {
  slug: "settings-row",
  name: "Settings row",
  labels: { zh: "设置行", ja: "設定の行", ko: "설정 행" },
  category: "Lists",
  icon: "settings",
  about: "a row box: a setting's icon (on a small colored tile where the style groups lists), its name taking the rest, and a switch or its value and a chevron",
  variants: [
    {
      key: "switch",
      name: "With a switch",
      labels: { zh: "带开关", ja: "スイッチ付き", ko: "스위치 포함" },
      build: (look = MATERIAL_LOOK) => row([settingIcon("dark_mode", look), lines(say("Dark mode", "深色模式", "ダークモード", "다크 모드")), atom("switch", { label: "", checked: false })], say("Settings row", "设置行", "設定の行", "설정 행"), 10),
    },
    {
      key: "value",
      name: "With a value",
      labels: { zh: "带取值", ja: "値付き", ko: "값 포함" },
      build: (look = MATERIAL_LOOK) =>
        row([settingIcon("notifications", look), lines(say("Notifications", "通知", "通知", "알림")), text(say("On", "开启", "オン", "켬"), "body", { color: "muted" }), chevron()], say("Settings row", "设置行", "設定の行", "설정 행"), 14),
    },
    {
      key: "section",
      name: "Several, as a section",
      labels: { zh: "多行成组", ja: "複数行のセクション", ko: "여러 행 묶음" },
      /* grouped the way the style groups a list, the hairlines from the words: past a 28 px tile or a 24 px icon */
      build: (look = MATERIAL_LOOK) =>
        section(
          [
            row([settingIcon("dark_mode", look), lines(say("Dark mode", "深色模式", "ダークモード", "다크 모드")), atom("switch", { label: "", checked: false })], say("Settings row", "设置行", "設定の行", "설정 행"), 10),
            row([settingIcon("notifications", look), lines(say("Notifications", "通知", "通知", "알림")), text(say("On", "开启", "オン", "켬"), "body", { color: "muted" }), chevron()], say("Settings row", "设置行", "設定の行", "설정 행"), 14),
            row([settingIcon("text_fields", look), lines(say("Text size", "字体大小", "文字サイズ", "글자 크기")), text(say("Default", "默认", "標準", "기본"), "body", { color: "muted" }), chevron()], say("Settings row", "设置行", "設定の行", "설정 행"), 14),
          ],
          look,
          16 + (look.list === "inset" ? 28 : 24) + 16,
        ),
    },
  ],
};

export const listKits: KitDef[] = [listRow, settingsRow];
