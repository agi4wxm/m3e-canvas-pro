import { avatar, box, entry, hbox, iconButton, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { SCREEN, T, W, kit, muted, tag, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Chat as atoms. In most messengers a bubble that comes in sits on a grey panel after a small avatar at its foot,
 * with the time under it, and one that goes out is the primary color at the end; where avatars are square (WeChat)
 * both sides carry an avatar at the top and the bubble going out is the light accent. The input bar is the same
 * split: a field and a send button, or voice, field, emoji and plus. */

/** the look of a messenger with square avatars and full-width lists: avatars on both sides, at the top */
const imLike = (l: KitLook) => l.avatar === "square" || l.list === "flush";

const IN = say("Are we still on for tonight?", "今晚还约吗？", "今夜の予定、変わりない？", "오늘 밤 약속 그대로지?");
const OUT = say("Yes! See you at 7", "约！七点见", "うん！7時にね", "응! 7시에 봐");

const tailIn = { tl: 18, tr: 18, br: 18, bl: 4 };
const tailOut = { tl: 18, tr: 18, br: 4, bl: 18 };
const bubble = (words: Say, fill: Node["fill"], corners: Node["corners"], color = "default"): Node => hbox({ surface: "panel", padX: 12, padY: 8 }, [text(words, "body", { color })], { fill, corners });

const chatBubble = kit(
  "chat-bubble",
  "Chat bubble",
  ["聊天气泡", "チャットの吹き出し", "채팅 말풍선"],
  "Social & chat",
  "chat",
  "a row: a small avatar at the foot of a grey panel bubble with the time under it (coming in), or a primary bubble at the end with the time and read state (going out); in a group the sender's name over the bubble; where avatars are square both sides carry an avatar at the top",
  [
    variant("in", "Coming in", ["收到", "受信", "받은 메시지"], (l) =>
      imLike(l)
        ? hbox({ width: W, hugWidth: false, gap: 8, align: "start" }, [avatar("MC"), bubble(IN, "surface", round(6))])
        : hbox({ width: W, hugWidth: false, gap: 8, align: "end" }, [avatar("MC", { size: "sm" }), vbox({ gap: 2, align: "start" }, [bubble(IN, "surfaceContainerHigh", tailIn), muted("9:41", "tiny")])]),
    ),
    variant("out", "Going out", ["发出", "送信", "보낸 메시지"], (l) =>
      imLike(l)
        ? hbox({ width: W, hugWidth: false, gap: 8, align: "start", justify: "end" }, [bubble(OUT, "primaryContainer", round(6)), avatar("ME")])
        : hbox({ width: W, hugWidth: false, gap: 8, align: "end", justify: "end" }, [vbox({ gap: 2, align: "end" }, [bubble(OUT, "primary", tailOut, "on-primary"), muted(say("9:42 · Read", "9:42 · 已读", "9:42 · 既読", "9:42 · 읽음"), "tiny")])]),
    ),
    variant("group", "In a group", ["群聊中", "グループ内", "그룹에서"], (l) =>
      hbox({ width: W, hugWidth: false, gap: 8, align: imLike(l) ? "start" : "end" }, [
        avatar("LP", { size: imLike(l) ? "default" : "sm" }),
        vbox({ gap: 2, align: "start" }, [muted(say("Leo Park", "陈子昂", "鈴木 蓮", "박지훈"), "caption"), bubble(say("I'll bring the tickets 🎟️", "票我带着 🎟️", "チケットは僕が持っていくよ 🎟️", "표는 내가 가져갈게 🎟️"), imLike(l) ? "surface" : "surfaceContainerHigh", imLike(l) ? round(6) : tailIn), hbox({ gap: 4 }, [tag("❤️ 2", "outline")])]),
      ]),
    ),
  ],
);

const MESSAGE = say("Message", "发消息", "メッセージ", "메시지");

const chatInput = kit(
  "chat-input",
  "Chat input bar",
  ["聊天输入栏", "チャット入力バー", "채팅 입력 바"],
  "Social & chat",
  "keyboard",
  "a bar box pinned to the bottom of the screen: a rounded field box with a bare entry and a filled send button; a messenger's voice button, a plain field, emoji and plus buttons; or a field holding emoji, entry, attach and camera with a round mic button after it",
  [
    variant(
      "simple",
      "Field and send",
      ["输入框与发送", "入力欄と送信", "입력란과 보내기"],
      () => hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 12, padY: 8, gap: 8 }, [hbox({ surface: "field", padX: 16, padY: 6, gap: 8, hugWidth: false, width: 200 }, [entry(MESSAGE)], { grow: true, corners: round(20) }), iconButton("send", T.send, { variant: "filled", size: "sm" })]),
      { span: "screen" },
    ),
    variant(
      "im",
      "Voice, field, emoji, plus",
      ["语音·输入·表情·加号", "音声・入力・絵文字・追加", "음성·입력·이모지·더하기"],
      () =>
        hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 8, padY: 8, gap: 8 }, [
          iconButton("graphic_eq", T.voice, { variant: "outlined", size: "xs", iconFill: true }),
          hbox({ surface: "field", padX: 10, padY: 4, gap: 0, hugWidth: false, width: 200 }, [entry("")], { grow: true, corners: round(6) }),
          iconButton("sentiment_satisfied", T.emoji, { variant: "outlined", size: "xs" }),
          iconButton("add", T.add, { variant: "outlined", size: "xs" }),
        ]),
      { span: "screen", suits: imLike },
    ),
    variant(
      "rich",
      "Field with tools, round mic",
      ["带工具的输入框，圆形麦克风", "ツール付き入力欄と丸いマイク", "도구 입력란과 둥근 마이크"],
      () =>
        hbox({ surface: "bar", pin: "bottom", width: SCREEN, hugWidth: false, padX: 8, padY: 8, gap: 6 }, [
          hbox({ surface: "field", padX: 4, padY: 2, gap: 0, hugWidth: false, width: 200 }, [iconButton("mood", T.emoji, { size: "xs" }), entry(MESSAGE), iconButton("attach_file", T.attach, { size: "xs" }), iconButton("photo_camera", say("Camera", "相机", "カメラ", "카메라"), { size: "xs" })], { grow: true, corners: round(24) }),
          iconButton("mic", T.voice, { variant: "filled", size: "sm" }),
        ]),
      { span: "screen" },
    ),
  ],
);

const PEOPLE: [string, Say][] = [
  ["MC", say("Mia", "小雨", "葵", "하늘")],
  ["LP", say("Leo", "子昂", "蓮", "지훈")],
  ["AK", say("Alex", "小明", "アレックス", "알렉스")],
  ["SN", say("Sana", "思诺", "紗奈", "사나")],
];
const STORY_RING = { fills: [{ type: "linear" as const, angle: 45, stops: [{ color: "#feda75", at: 0 }, { color: "#d62976", at: 55 }, { color: "#4f5bd5", at: 100 }] }] };

/** an avatar inside a colored ring: the ring is a round box, a sliver of the screen between it and the face */
const ringed = (initials: string, seen = false): Node =>
  box({ layout: "row", padX: 3, padY: 3 }, [box({ layout: "row", padX: 2, padY: 2 }, [avatar(initials, { size: "lg" })], { fill: "surface", corners: round(40) })], { fill: seen ? "surfaceContainerHighest" : "primary", corners: round(40), ...(seen ? {} : { look: STORY_RING }) });

const stories = kit(
  "story-rings",
  "Story rings",
  ["动态头像圈", "ストーリーリング", "스토리 링"],
  "Social & chat",
  "motion_photos_on",
  "a row of columns, each a large avatar inside a colored ring (a round box, a gap of the screen's color, the face) over a short name; your own first with no ring; or with a LIVE tag under the ring",
  [
    variant("rings", "Rings", ["圆环", "リング", "링"], () =>
      hbox({ width: W, hugWidth: false, gap: 14, align: "start" }, [
        vbox({ gap: 6, align: "center" }, [box({ layout: "row", padX: 5, padY: 5 }, [avatar("ME", { size: "lg" })]), muted(say("Your story", "我的动态", "ストーリーズ", "내 스토리"), "caption")]),
        ...PEOPLE.slice(0, 3).map(([a, n], i) => vbox({ gap: 6, align: "center" }, [ringed(a, i === 2), text(n, "caption")])),
      ]),
    ),
    variant("live", "Live now", ["正在直播", "ライブ中", "라이브 중"], () =>
      hbox({ width: W, hugWidth: false, gap: 14, align: "start" }, PEOPLE.map(([a, n], i) => vbox({ gap: 4, align: "center" }, [ringed(a), ...(i < 2 ? [tag(say("LIVE", "直播", "ライブ", "라이브"), "destructive")] : [text(n, "caption")])]))),
    ),
  ],
);

export const socialKits: KitDef[] = [chatBubble, chatInput, stories];
