import { atom, avatar, button, hbox, icon, iconButton, image, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { W, kit, lines, muted, rule, tag, variant } from "./shared";
import type { KitDef } from "./types";

/* Media and desktop settings as atoms: a player row, a video card and a section of settings. A player puts the
 * cover first and the transport last; a video card leads with its picture and puts the channel's avatar beside two
 * lines of title; a desktop settings page reads in two columns, what a setting is on the left and its control on the
 * right, where a phone stacks them. */

const SONG = say("Midnight City", "午夜城市", "ミッドナイト・シティ", "미드나잇 시티");
const ARTIST = say("M83", "M83", "M83", "M83");

const audio = kit(
  "audio-row",
  "Audio player row",
  ["音频播放行", "オーディオプレーヤーの行", "오디오 플레이어 행"],
  "Media",
  "music_note",
  "a panel row: the cover, the title over the artist taking the rest, a filled play button and next; a full card with a slider, the times at its ends and the transport centered; or a podcast row with the episode's length, two lines of title and a progress line",
  [
    variant("mini", "Mini player", ["迷你播放器", "ミニプレーヤー", "미니 플레이어"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 8, padY: 8, gap: 12 }, [image({ width: 48, height: 48, alt: "" }), lines(SONG, ARTIST, "label"), iconButton("play_arrow", say("Play", "播放", "再生", "재생"), { variant: "filled", size: "sm", iconFill: true }), iconButton("skip_next", say("Next", "下一首", "次の曲", "다음 곡"), { size: "sm", iconFill: true })], { corners: round(12) }),
    ),
    variant("full", "Full card", ["完整卡片", "フルカード", "전체 카드"], () =>
      vbox({ surface: "card", width: W, hugWidth: false, padX: 16, padY: 16, gap: 10 }, [
        hbox({ gap: 12 }, [image({ width: 64, height: 64, alt: "" }), lines(SONG, ARTIST, "lead"), iconButton("favorite", say("Like", "喜欢", "お気に入り", "좋아요"), { size: "sm" })]),
        atom("slider", { value: 35, label: "" }),
        hbox({ justify: "between" }, [muted("1:24", "caption"), muted("4:03", "caption")]),
        hbox({ justify: "center", gap: 12 }, [iconButton("shuffle", say("Shuffle", "随机播放", "シャッフル", "셔플"), { size: "sm" }), iconButton("skip_previous", say("Previous", "上一首", "前の曲", "이전 곡"), { size: "md", iconFill: true }), iconButton("pause", say("Pause", "暂停", "一時停止", "일시정지"), { variant: "filled", size: "md", iconFill: true }), iconButton("skip_next", say("Next", "下一首", "次の曲", "다음 곡"), { size: "md", iconFill: true }), iconButton("repeat", say("Repeat", "循环", "リピート", "반복"), { size: "sm", iconFill: true })]),
      ]),
    ),
    variant("podcast", "Podcast episode", ["播客单集", "ポッドキャストのエピソード", "팟캐스트 에피소드"], () =>
      hbox({ width: W, hugWidth: false, padX: 0, padY: 8, gap: 12 }, [
        image({ width: 64, height: 64, alt: "" }),
        vbox({ gap: 4, hugWidth: false, width: 200 }, [muted(say("EP 42 · 38 min", "第 42 期 · 38 分钟", "第 42 回 · 38 分", "42화 · 38분"), "caption"), para(say("How cities learned to sleep: lights, noise and the night shift", "城市如何学会入睡：灯光、噪音与夜班", "都市はどう眠るのか：光と音と夜勤", "도시는 어떻게 잠드는가: 빛, 소음, 야간 근무"), "label", { bold: true, maxLines: 2 }), atom("progress", { value: 40, thickness: 4 })], { grow: true }),
        iconButton("play_circle", say("Play", "播放", "再生", "재생"), { size: "md", iconFill: true }),
      ]),
    ),
  ],
);

const VIDEO = say("A slow day in Kyoto, start to finish", "京都慢生活的一天", "京都でゆっくり過ごす一日", "교토에서 보내는 느린 하루");
const CHANNEL = say("Walk Japan · 1.2M views · 3 days ago", "漫步日本 · 120 万次观看 · 3 天前", "Walk Japan · 120 万回視聴 · 3 日前", "Walk Japan · 조회수 120만회 · 3일 전");

const video = kit(
  "video-card",
  "Video card",
  ["视频卡片", "動画カード", "동영상 카드"],
  "Media",
  "smart_display",
  "the picture over a row of the channel's avatar, two lines of title over the channel, views and age, and a more button; a row with the picture at the side and the length as a tag; or a tall short-video tile with two lines and the likes",
  [
    variant("stacked", "Picture over details", ["图片在上", "画像の下に詳細", "이미지 아래 세부"], () =>
      vbox({ width: W, hugWidth: false, gap: 10 }, [image({ height: 214, alt: "" }), hbox({ gap: 12, align: "start" }, [avatar("WJ", { size: "sm" }), vbox({ gap: 2, hugWidth: false, width: 200 }, [para(VIDEO, "label", { bold: true, maxLines: 2 }), para(CHANNEL, "caption", { color: "muted", maxLines: 1 })], { grow: true }), iconButton("more_vert", say("More", "更多", "その他", "더보기"), { size: "xs" })])]),
    ),
    variant("row", "Picture at the side", ["图片在侧", "画像が横", "이미지 옆"], () =>
      hbox({ width: W, hugWidth: false, gap: 12, align: "start" }, [image({ width: 160, height: 90, alt: "" }), vbox({ gap: 4, hugWidth: false, width: 160, align: "stretch" }, [para(VIDEO, "label", { bold: true, maxLines: 2 }), para(say("Walk Japan", "漫步日本", "Walk Japan", "Walk Japan"), "caption", { color: "muted", maxLines: 1 }), hbox({ gap: 0 }, [tag("12:48", "secondary")])], { grow: true })]),
    ),
    variant("short", "Short-video tile", ["短视频卡片", "ショート動画タイル", "숏폼 타일"], () =>
      vbox({ width: 180, hugWidth: false, gap: 6 }, [image({ height: 300, alt: "" }), para(VIDEO, "label", { maxLines: 2 }), hbox({ gap: 6 }, [avatar("WJ", { size: "sm" }), para(say("Walk Japan", "漫步日本", "Walk Japan", "Walk Japan"), "caption", { color: "muted", maxLines: 1 }, { grow: true }), icon("favorite", { size: 16, color: "muted" }), muted("12k", "caption")])]),
    ),
  ],
);

const SETTINGS: [Say, Say, Node][] = [
  [say("Theme", "主题", "テーマ", "테마"), say("How the app looks", "应用的外观", "アプリの見た目", "앱의 모양"), button(say("System", "跟随系统", "システム", "시스템"), { variant: "outlined", size: "xs", trailingIcon: "keyboard_arrow_down" })],
  [say("Compact rows", "紧凑行距", "詰めた行", "촘촘한 행"), say("Show more on screen at once", "一屏显示更多内容", "一度に多くを表示", "한 화면에 더 많이 표시"), atom("switch", { label: "", checked: true })],
  [say("Font size", "字号", "文字サイズ", "글꼴 크기"), say("Used in the editor and lists", "用于编辑器和列表", "エディタとリストで使用", "편집기와 목록에 사용"), atom("slider", { value: 40, label: "", width: 200 })],
];

const settings = kit(
  "settings-pane",
  "Settings section",
  ["设置分区", "設定のセクション", "설정 섹션"],
  "Desktop",
  "settings",
  "a section of desktop settings: a heading, then rows of two columns (the setting's name over a muted line at the left, its control at the right: a menu button, a switch, a slider) parted by hairlines; or stacked, each name over its line over its control",
  [
    variant("columns", "Two columns", ["两栏", "二列", "두 열"], () =>
      vbox({ width: 640, hugWidth: false, gap: 0 }, [
        hbox({ padY: 8 }, [text(say("Appearance", "外观", "外観", "모양"), "title", { bold: true })]),
        ...SETTINGS.flatMap(([name, about, control], i) => [...(i ? [rule(640)] : []), hbox({ padX: 0, padY: 14, gap: 24 }, [vbox({ gap: 2, hugWidth: false, width: 300 }, [text(name, "label", { bold: true }), para(about, "caption", { color: "muted" })], { grow: true }), control])]),
      ]),
    ),
    variant("stacked", "Stacked", ["上下排列", "縦並び", "세로"], () =>
      vbox({ width: 560, hugWidth: false, gap: 18 }, [
        text(say("Editor", "编辑器", "エディタ", "편집기"), "title", { bold: true }),
        vbox({ gap: 6 }, [text(say("Editor: Font Size", "编辑器：字号", "エディタ：フォントサイズ", "편집기: 글꼴 크기"), "label", { bold: true }), para(say("Controls the font size in pixels.", "控制字号（像素）。", "フォントサイズをピクセルで指定します。", "글꼴 크기를 픽셀로 지정합니다."), "caption", { color: "muted" }), hbox({ gap: 0 }, [atom("input", { placeholder: "14", value: "14", variant: "outlined", size: "sm", width: 200 })])]),
        vbox({ gap: 6 }, [text(say("Editor: Word Wrap", "编辑器：自动换行", "エディタ：折り返し", "편집기: 줄 바꿈"), "label", { bold: true }), hbox({ gap: 0 }, [atom("checkbox", { label: say("Wrap lines at the viewport width", "在视口宽度处换行", "表示幅で折り返す", "화면 너비에서 줄 바꿈"), checked: true })])]),
      ]),
    ),
  ],
);

export const mediaKits: KitDef[] = [audio, video, settings];
