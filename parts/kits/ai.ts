import { area, button, entry, hbox, iconButton, round, vbox } from "../atoms";
import { say, type Node } from "../templates/kit";
import { MATERIAL_LOOK, type KitDef, type KitLook } from "./types";

/* The boxes people type a prompt into. Each is one card: a bare entry that grows with the words,
 * over a row of small controls (attach, tools, the model, send). They are compositions modeled on
 * what the products show; the colors and corners are the document's style. */

const W = 380;

/** a small square-ish control with a quiet outline, as these composers draw them */
const tool = (name: string, label: ReturnType<typeof say>, extra: Partial<Node> = {}) => iconButton(name, label, { variant: "outlined", size: "xs" }, { corners: round(10), ...extra });

const T = {
  attach: say("Add files", "添加文件", "ファイルを追加", "파일 추가"),
  tools: say("Tools", "工具", "ツール", "도구"),
  think: say("Extended thinking", "深度思考", "拡張思考", "확장 사고"),
  model: say("Model", "模型", "モデル", "모델"),
  send: say("Send", "发送", "送信", "보내기"),
  voice: say("Voice", "语音", "音声", "음성"),
  dictate: say("Dictate", "语音输入", "音声入力", "음성 입력"),
};

/** the controls along the foot of a Claude-style box: what to add on the left, the model and send on the right */
const claudeFoot = (home: boolean): Node =>
  hbox({ justify: "between", gap: 8 }, [
    hbox({ gap: 8 }, [tool("add", T.attach), tool("tune", T.tools), ...(home ? [tool("schedule", T.think)] : [])]),
    hbox({ gap: 6 }, [button(T.model, { variant: "ghost", size: "xs", trailingIcon: "keyboard_arrow_down" }), iconButton("arrow_upward", T.send, { variant: "filled", size: "xs", iconFill: true }, { corners: round(10) })]),
  ]);

const claude: KitDef = {
  slug: "claude-prompt",
  name: "Claude-style prompt box",
  labels: { zh: "Claude 风格输入框", ja: "Claude 風入力ボックス", ko: "Claude 스타일 입력창" },
  category: "AI",
  icon: "auto_awesome",
  about: "a card holding a growing plain textarea over a row of attach / tools buttons, a model picker and a square send button",
  variants: [
    {
      key: "home",
      name: "Home, large",
      labels: { zh: "首页大输入框", ja: "ホーム・大", ko: "홈·크게" },
      build: () =>
        vbox(
          { surface: "card", width: W, hugWidth: false, padX: 16, padY: 16, gap: 16 },
          [area(say("How can I help you today?", "今天有什么可以帮你？", "今日はどのようなご用件ですか？", "오늘 무엇을 도와드릴까요?"), { rows: 2 }), claudeFoot(true)],
          { name: say("Prompt box", "输入框", "入力ボックス", "입력창"), fill: "surface", corners: round(24), look: { shadow: "soft" } },
        ),
    },
    {
      key: "thread",
      name: "In a conversation",
      labels: { zh: "对话中紧凑", ja: "会話中・小", ko: "대화 중·작게" },
      build: () =>
        vbox(
          { surface: "card", width: W, hugWidth: false, padX: 12, padY: 12, gap: 10 },
          [area(say("Reply to Claude…", "回复 Claude…", "Claude に返信…", "Claude에게 답장…"), { rows: 1 }), claudeFoot(false)],
          { name: say("Prompt box", "输入框", "入力ボックス", "입력창"), fill: "surface", corners: round(20), look: { shadow: "soft" } },
        ),
    },
  ],
};

/** On a light page the Codex box is the dark one it is known for: the box takes the inverse surface
 *  and everything on it the words that read on it. On a dark page it already is. */
function darkened(node: Node, look: KitLook): Node {
  if (look.dark) return node;
  const ink = (n: Node): Node => {
    const own: Partial<Node> = n.slug === "box" ? {} : n.fill ? { textColor: "onSurface" } : { textColor: "inverseOnSurface" };
    return { ...n, ...own, kids: n.kids?.map(ink) };
  };
  return { ...ink(node), fill: "inverseSurface" };
}

const codexFoot = (wide: boolean): Node[] => {
  const pickers = hbox({ gap: 6 }, [
    button(say("my-app", "my-app", "my-app", "my-app"), { variant: "outlined", size: "xs", icon: "book_2", trailingIcon: "keyboard_arrow_down" }),
    button(say("main", "main", "main", "main"), { variant: "outlined", size: "xs", icon: "account_tree", trailingIcon: "keyboard_arrow_down" }),
  ]);
  const actions = hbox({ gap: 6 }, [
    iconButton("mic", T.dictate, { variant: "ghost", size: "xs" }),
    button(say("Ask", "提问", "質問", "질문"), { variant: "outlined", size: "xs" }),
    /* the main action reads light on the dark box */
    button(say("Code", "写代码", "コード", "코드"), { variant: "filled", size: "xs" }, { fill: "surface" }),
  ]);
  return wide ? [hbox({ justify: "between", gap: 8 }, [pickers, actions])] : [pickers, hbox({ justify: "end", gap: 6 }, [actions])];
};

const codex: KitDef = {
  slug: "codex-prompt",
  name: "Codex-style prompt box",
  labels: { zh: "Codex 风格输入框", ja: "Codex 風入力ボックス", ko: "Codex 스타일 입력창" },
  category: "AI",
  icon: "terminal",
  about: "a dark panel with a growing plain textarea, repository and branch pickers, a mic, and Ask / Code buttons",
  variants: [
    {
      key: "phone",
      name: "Phone, stacked",
      labels: { zh: "手机竖排", ja: "スマホ・縦並び", ko: "휴대폰·세로" },
      suits: (l) => (l.room ?? (l.group === "desktop" || l.group === "pcGame" ? 640 : 380)) < 560,
      build: (look = MATERIAL_LOOK) =>
        darkened(
          vbox({ surface: "panel", width: W, hugWidth: false, padX: 16, padY: 16, gap: 12 }, [area(say("Ask Codex anything…", "问 Codex 任何问题…", "Codex に何でも聞く…", "Codex에게 무엇이든 물어보세요…"), { rows: 2 }), ...codexFoot(false)], {
            name: say("Prompt box", "输入框", "入力ボックス", "입력창"),
            corners: round(24),
          }),
          look,
        ),
    },
    {
      key: "wide",
      name: "Desktop, one row",
      labels: { zh: "桌面单行", ja: "デスクトップ・一行", ko: "데스크톱·한 줄" },
      suits: (l) => (l.room ?? (l.group === "desktop" || l.group === "pcGame" ? 640 : 380)) >= 560,
      build: (look = MATERIAL_LOOK) =>
        darkened(
          vbox({ surface: "panel", width: 640, hugWidth: false, padX: 16, padY: 16, gap: 16 }, [area(say("Describe a task", "描述一个任务", "タスクを説明", "작업을 설명하세요"), { rows: 2 }), ...codexFoot(true)], {
            name: say("Prompt box", "输入框", "入力ボックス", "입력창"),
            corners: round(20),
          }),
          look,
        ),
    },
  ],
};

const chatgpt: KitDef = {
  slug: "chatgpt-composer",
  name: "ChatGPT-style composer",
  labels: { zh: "ChatGPT 风格输入栏", ja: "ChatGPT 風入力欄", ko: "ChatGPT 스타일 입력창" },
  category: "AI",
  icon: "chat",
  about: "a rounded field: attach button, a plain entry that takes the rest, a mic and a round voice / send button; or the same over two rows",
  variants: [
    {
      key: "pill",
      name: "One line",
      labels: { zh: "单行胶囊", ja: "一行", ko: "한 줄" },
      suits: (l) => l.group !== "desktop",
      build: () =>
        hbox(
          { surface: "field", width: W, hugWidth: false, padX: 6, padY: 6, gap: 4 },
          [iconButton("add", T.attach, { variant: "ghost", size: "sm" }), entry(say("Ask anything", "有问题，尽管问", "何でも聞いてください", "무엇이든 물어보세요")), iconButton("mic", T.dictate, { variant: "ghost", size: "sm" }), iconButton("graphic_eq", T.voice, { variant: "filled", size: "sm", iconFill: true })],
          { name: say("Composer", "输入栏", "入力欄", "입력창"), corners: round(28) },
        ),
    },
    {
      key: "box",
      name: "Two rows",
      labels: { zh: "两行", ja: "二行", ko: "두 줄" },
      suits: (l) => l.group === "desktop",
      build: () =>
        vbox(
          { surface: "field", width: 560, hugWidth: false, padX: 12, padY: 12, gap: 8 },
          [
            area(say("Ask anything", "有问题，尽管问", "何でも聞いてください", "무엇이든 물어보세요"), { rows: 1 }, {}),
            hbox({ justify: "between", gap: 8 }, [
              hbox({ gap: 4 }, [iconButton("add", T.attach, { variant: "ghost", size: "sm" }), button(T.tools, { variant: "ghost", size: "xs", icon: "tune" })]),
              hbox({ gap: 4 }, [iconButton("mic", T.dictate, { variant: "ghost", size: "sm" }), iconButton("graphic_eq", T.voice, { variant: "filled", size: "sm", iconFill: true })]),
            ]),
          ],
          { name: say("Composer", "输入栏", "入力欄", "입력창"), corners: round(28) },
        ),
    },
  ],
};

export const ai: KitDef[] = [claude, codex, chatgpt];
