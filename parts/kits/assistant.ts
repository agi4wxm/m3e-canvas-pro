import { atom, avatar, box, button, chip, hbox, icon, iconButton, image, para, round, svg, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { T, W, busy, isDense, kit, lines, muted, tag, tile, variant } from "./shared";
import type { KitDef } from "./types";

/* The pieces of a conversation with an assistant, around the prompt box (ai.ts): what it answers and the row of
 * actions under it, what the person asked, the steps it took, where it cites, and the screen before anything is
 * asked. Chat products set the answer on the page with no bubble and keep the bubble for the person; a product
 * of the Material family leads the answer with a mark; desktop software sets it all smaller. */

const ANSWER = say(
  "Here's a plan for a relaxed day in Kyoto: start early at Fushimi Inari before the crowds, have lunch by the Kamo River, and save the evening for Gion.",
  "京都轻松一日游可以这样安排：一早去伏见稻荷避开人潮，中午在鸭川边吃午饭，傍晚留给祇园。",
  "京都でゆったり過ごす一日のプランです。朝早く伏見稲荷へ行って人混みを避け、昼は鴨川沿いでランチ、夕方は祇園で過ごしましょう。",
  "교토에서 여유로운 하루를 보내는 계획입니다. 아침 일찍 후시미 이나리에 가서 인파를 피하고, 점심은 가모강 근처에서, 저녁은 기온에서 보내세요.",
);
const ASKED = say("Plan a relaxed day in Kyoto", "帮我规划京都轻松一日游", "京都でゆったり過ごす一日を計画して", "교토에서 여유로운 하루 계획 짜줘");
const ASSISTANT = say("Assistant", "助手", "アシスタント", "어시스턴트");

/** the actions under an answer: copy, try again, a thumb either way, more */
const actions = (size = "xs"): Node =>
  hbox({ gap: 0 }, [iconButton("content_copy", T.copy, { size }), iconButton("refresh", T.retry, { size, iconFill: true }), iconButton("thumb_up", T.good, { size }), iconButton("thumb_down", T.bad, { size }), iconButton("more_horiz", T.more, { size })], {
    name: say("Actions", "操作", "操作", "작업"),
  });

const reply = kit(
  "ai-reply",
  "Assistant reply",
  ["助手回复", "アシスタントの返答", "어시스턴트 답변"],
  "AI",
  "smart_toy",
  "a column: the answer as words on the page (led by a sparkle mark in Material, under a name on desktop) over a row of ghost icon buttons: copy, regenerate, thumbs up and down, more",
  [
    variant("mark", "Led by a mark", ["标记引导", "マーク付き", "마크와 함께"], () =>
      hbox({ width: W, hugWidth: false, gap: 12, align: "start" }, [svg("sparkle", { width: 24, height: 24, color: "primary" }), vbox({ gap: 8, hugWidth: false, width: 200 }, [para(ANSWER, "lead"), actions()], { grow: true })]),
    ),
    variant(
      "page",
      "On the page, no bubble",
      ["直接在页面上，无气泡", "吹き出しなし", "말풍선 없이"],
      () => vbox({ width: W, hugWidth: false, gap: 8 }, [para(ANSWER, "lead"), actions()]),
      { suits: (l) => l.group === "app" && l.surface !== "m3" },
    ),
    variant(
      "named",
      "Under a name, small",
      ["带名称，紧凑", "名前付き・小", "이름과 함께·작게"],
      () =>
        hbox({ width: 520, hugWidth: false, gap: 10, align: "start" }, [
          tile("smart_toy", "primaryContainer", 28, 18, 8),
          vbox({ gap: 4, hugWidth: false, width: 200 }, [hbox({ gap: 8 }, [text(ASSISTANT, "label", { bold: true }), muted("9:41", "caption")]), para(ANSWER, "body"), hbox({ gap: 4 }, [button(T.copy, { variant: "ghost", size: "xs", icon: "content_copy" }), button(T.retry, { variant: "ghost", size: "xs", icon: "autorenew" })])], { grow: true }),
        ]),
      { suits: isDense },
    ),
  ],
);

const asked = kit(
  "user-message",
  "User message",
  ["用户消息", "ユーザーのメッセージ", "사용자 메시지"],
  "AI",
  "person",
  "a row pushed to the end: a rounded panel box holding the person's words, with copy and edit under it; on desktop an avatar and a name instead",
  [
    variant("bubble", "Bubble at the end", ["靠右气泡", "右寄せの吹き出し", "오른쪽 말풍선"], () =>
      vbox({ width: W, hugWidth: false, gap: 4, align: "end" }, [
        hbox({ surface: "panel", padX: 16, padY: 10 }, [text(ASKED, "lead")], { fill: "surfaceContainerHigh", corners: round(20) }),
        hbox({ gap: 0 }, [iconButton("content_copy", T.copy, { size: "xs" }), iconButton("edit", T.edit, { size: "xs" })]),
      ]),
    ),
    variant("picture", "With a picture", ["附带图片", "画像付き", "이미지 포함"], () =>
      vbox({ width: W, hugWidth: false, gap: 6, align: "end" }, [image({ width: 160, height: 120, alt: "" }), hbox({ surface: "panel", padX: 16, padY: 10 }, [text(say("What plant is this?", "这是什么植物？", "これは何の植物？", "이건 무슨 식물이야?"), "lead")], { fill: "surfaceContainerHigh", corners: round(20) })]),
    ),
    variant(
      "named",
      "Avatar and name",
      ["头像和名称", "アバターと名前", "아바타와 이름"],
      () =>
        hbox({ width: 520, hugWidth: false, gap: 10, align: "start" }, [avatar("MC", { size: "sm" }), vbox({ gap: 2, hugWidth: false, width: 200 }, [hbox({ gap: 8 }, [text(say("Mia Carter", "林小雨", "佐藤 葵", "김하늘"), "label", { bold: true }), muted("9:40", "caption")]), para(ASKED, "body")], { grow: true })]),
      { suits: isDense },
    ),
  ],
);

const THOUGHT = say("Thought for 12 seconds", "已思考 12 秒", "12 秒間思考しました", "12초 동안 생각함");
const REASONING = say(
  "The user wants a relaxed pace, so three stops is enough. Fushimi Inari is busiest after 9, so it goes first; Gion is best in the evening.",
  "用户想要轻松的节奏，三个地点就够了。伏见稻荷九点后人最多，所以放在最前；祇园傍晚最好。",
  "ゆったりしたペースが希望なので三か所で十分。伏見稲荷は9時以降混むので最初に、祇園は夕方が一番。",
  "여유로운 일정을 원하니 세 곳이면 충분하다. 후시미 이나리는 9시 이후 붐비니 먼저, 기온은 저녁이 가장 좋다.",
);

const thinking = kit(
  "thinking-block",
  "Reasoning block",
  ["思考过程", "思考ブロック", "추론 블록"],
  "AI",
  "psychology",
  "a row saying how long it thought with a chevron that opens it; open, an outlined box with that row over the reasoning in muted words; or a spinner while it is still thinking",
  [
    variant("closed", "Closed", ["收起", "閉じた状態", "닫힘"], () => hbox({ gap: 6 }, [icon("lightbulb", { size: 18, color: "muted" }), muted(THOUGHT, "label"), icon("chevron_right", { size: 18, color: "muted" })])),
    variant(
      "open",
      "Open, in a box",
      ["展开，带边框", "開いた状態・枠付き", "펼침·테두리"],
      () =>
        vbox({ surface: "chip", width: W, hugWidth: false, padX: 14, padY: 12, gap: 8 }, [
          hbox({ justify: "between" }, [hbox({ gap: 6 }, [icon("lightbulb", { size: 18, color: "muted" }), text(THOUGHT, "label")]), icon("expand_less", { size: 18, color: "muted", filled: true })]),
          para(REASONING, "body", { color: "muted" }),
        ], { corners: round(12) }),
      { suits: (l) => l.card === "paper" || l.card === "outlined" },
    ),
    variant("live", "Still thinking", ["思考中", "思考中", "생각 중"], () =>
      hbox({ gap: 8 }, [busy(), text(say("Thinking…", "思考中…", "考え中…", "생각 중…"), "label"), muted(say("Checking opening hours", "正在查看营业时间", "営業時間を確認中", "영업시간 확인 중"), "label")]),
    ),
  ],
);

const toolStep = kit(
  "tool-step",
  "Tool step",
  ["工具步骤", "ツールのステップ", "도구 단계"],
  "AI",
  "build",
  "a row: a done mark or a spinner, what the assistant did, a muted detail and a chevron; or an outlined box with a tool tile, its name, a status tag and its output in a well",
  [
    variant("done", "Done", ["已完成", "完了", "완료"], () =>
      hbox({ width: W, hugWidth: false, gap: 10 }, [icon("check_circle", { size: 20, color: "primary", filled: true }), text(say("Searched the web", "已搜索网页", "ウェブを検索しました", "웹을 검색함"), "label"), muted(say("8 results", "8 条结果", "8 件", "결과 8개"), "caption"), box({ layout: "row", padX: 0, padY: 0, hugWidth: false, width: 8, height: 8 }, [], { grow: true }), icon("chevron_right", { size: 18, color: "muted" })]),
    ),
    variant("running", "Running", ["进行中", "実行中", "실행 중"], () =>
      hbox({ width: W, hugWidth: false, gap: 10 }, [busy(), text(say("Reading 3 files", "正在读取 3 个文件", "3 ファイルを読み込み中", "파일 3개 읽는 중"), "label"), para(say("src/app.ts, src/routes.ts…", "src/app.ts、src/routes.ts…", "src/app.ts、src/routes.ts…", "src/app.ts, src/routes.ts…"), "caption", { color: "muted", maxLines: 1 }, { grow: true })]),
    ),
    variant("card", "In a box with output", ["带输出的框", "出力付きの枠", "출력이 있는 상자"], () =>
      vbox({ surface: "chip", width: W, hugWidth: false, padX: 12, padY: 12, gap: 10 }, [
        hbox({ gap: 10 }, [tile("terminal", "surfaceContainerHigh", 28, 18, 8), para(say("Ran a command", "运行了命令", "コマンドを実行", "명령 실행함"), "label", { maxLines: 1 }, { grow: true }), tag(say("Done", "完成", "完了", "완료"))]),
        vbox({ surface: "well", padX: 12, padY: 10, gap: 2 }, [para(say("$ npm test", "$ npm test", "$ npm test", "$ npm test"), "caption", {}, { look: { font: "mono" } }), para(say("42 passed, 0 failed", "42 个通过，0 个失败", "42 件成功、0 件失敗", "42개 통과, 0개 실패"), "caption", { color: "muted" }, { look: { font: "mono" } })], { corners: round(8) }),
      ], { corners: round(12) }),
    ),
  ],
);

const MODELS: [Say, Say, boolean][] = [
  [say("Fast", "快速", "高速", "빠름"), say("Answers right away", "立即回答", "すぐに回答", "바로 답변"), false],
  [say("Thinking", "深度思考", "じっくり思考", "깊은 사고"), say("Thinks longer for better answers", "思考更久，回答更好", "時間をかけてより良い回答", "더 오래 생각해 더 나은 답변"), true],
  [say("Pro", "专业", "プロ", "프로"), say("Research-grade answers", "研究级回答", "研究レベルの回答", "연구 수준의 답변"), false],
];

const modelPicker = kit(
  "model-picker",
  "Model picker",
  ["模型选择", "モデル選択", "모델 선택"],
  "AI",
  "expand_circle_down",
  "a ghost button with a sparkle and a down chevron; a bar pinned to the top with the picker centered between a menu and a new-chat button; or a menu panel of rows, each a name over a line, the chosen one checked",
  [
    variant("button", "A button", ["按钮", "ボタン", "버튼"], () => hbox({ gap: 0 }, [button(MODELS[1][0], { variant: "ghost", size: "sm", icon: "auto_awesome", trailingIcon: "keyboard_arrow_down" })])),
    variant("bar", "Centered in a bar", ["栏中居中", "バーの中央", "바 가운데"], () =>
      hbox({ surface: "bar", pin: "top", width: 412, hugWidth: false, padX: 4, padY: 8, gap: 0 }, [
        hbox({ justify: "start", gap: 0, hugWidth: false, width: 100 }, [iconButton("menu", say("Menu", "菜单", "メニュー", "메뉴"))], { grow: true }),
        button(ASSISTANT, { variant: "ghost", size: "sm", trailingIcon: "chevron_right" }),
        hbox({ justify: "end", gap: 0, hugWidth: false, width: 100 }, [iconButton("edit_square", say("New chat", "新对话", "新しいチャット", "새 채팅"))], { grow: true }),
      ]),
      { span: "screen" },
    ),
    variant("menu", "A menu of models", ["模型菜单", "モデルのメニュー", "모델 메뉴"], () =>
      vbox({ surface: "overlay", width: 280, hugWidth: false, padX: 6, padY: 6, gap: 0 }, MODELS.map(([name, about, on]) => hbox({ padX: 10, padY: 8, gap: 12 }, [lines(name, about, "label"), ...(on ? [icon("check", { size: 20, color: "primary" })] : [])], on ? { fill: "surfaceContainerHigh", corners: round(10) } : {})), { corners: round(16) }),
    ),
  ],
);

const IDEAS = [
  say("Plan a trip", "规划旅行", "旅行を計画", "여행 계획"),
  say("Summarize a PDF", "总结 PDF", "PDF を要約", "PDF 요약"),
  say("Write a cover letter", "写求职信", "カバーレターを書く", "자기소개서 쓰기"),
  say("Explain a concept", "解释一个概念", "概念を説明", "개념 설명"),
];

const suggestions = kit(
  "suggestion-chips",
  "Suggestion chips",
  ["建议标签", "提案チップ", "제안 칩"],
  "AI",
  "lightbulb",
  "a wrapping row of assist chips; a row of outlined buttons each with an icon; or a list of follow-up questions, each a row with a turn-down arrow and a plus, parted by hairlines",
  [
    variant("chips", "Chips", ["标签", "チップ", "칩"], () => hbox({ width: W, hugWidth: false, gap: 8, wrap: true, align: "start" }, IDEAS.map((w) => chip(w)))),
    variant(
      "buttons",
      "Buttons with icons",
      ["带图标的按钮", "アイコン付きボタン", "아이콘 버튼"],
      () =>
        hbox({ width: W, hugWidth: false, gap: 8, wrap: true, align: "start" }, [
          button(say("Write", "写作", "書く", "글쓰기"), { variant: "outlined", size: "xs", icon: "edit" }),
          button(say("Learn", "学习", "学ぶ", "배우기"), { variant: "outlined", size: "xs", icon: "school" }),
          button(say("Code", "编程", "コード", "코드"), { variant: "outlined", size: "xs", icon: "code" }),
          button(say("Life stuff", "生活", "暮らし", "일상"), { variant: "outlined", size: "xs", icon: "local_cafe" }),
        ]),
      { suits: (l) => l.group === "app" && l.surface === "line" },
    ),
    variant("follow-ups", "Follow-up questions", ["追问列表", "関連する質問", "후속 질문"], () =>
      vbox({ width: W, hugWidth: false, gap: 0 }, [
        text(say("Related", "相关问题", "関連", "관련 질문"), "heading", { bold: true }),
        ...[say("Best time to visit Kyoto?", "京都什么时候去最好？", "京都のベストシーズンは？", "교토 가기 좋은 때는?"), say("How to get from Osaka to Kyoto", "大阪怎么去京都", "大阪から京都への行き方", "오사카에서 교토 가는 법")].map((q) =>
          hbox({ padX: 0, padY: 12, gap: 12 }, [icon("subdirectory_arrow_right", { size: 20, color: "muted", filled: true }), para(q, "body", { maxLines: 1 }, { grow: true }), icon("add", { size: 20, color: "primary" })]),
        ),
      ]),
    ),
  ],
);

const NAMES = [say("Itinerary.pdf", "行程.pdf", "旅程.pdf", "일정.pdf"), say("Budget.xlsx", "预算.xlsx", "予算.xlsx", "예산.xlsx")];

const fileChip = (name: Say, kind: Say, glyph: string, fill: Node["fill"]): Node =>
  hbox({ surface: "chip", padX: 8, padY: 8, gap: 10 }, [tile(glyph, fill, 36, 20, 8), vbox({ gap: 0, align: "start" }, [text(name, "label", { bold: true }), muted(kind, "caption")]), iconButton("close", T.remove, { size: "xs" })], { corners: round(12) });

const attachments = kit(
  "attachment-chips",
  "Attachments",
  ["附件", "添付ファイル", "첨부 파일"],
  "AI",
  "attach_file",
  "a wrapping row of file chips (a colored file-type tile, the name over its type and size, a remove button); a row of picture thumbnails and a well saying how many more; or small chips with a clip icon",
  [
    variant("files", "File chips", ["文件卡片", "ファイルチップ", "파일 칩"], () =>
      hbox({ width: W, hugWidth: false, gap: 8, wrap: true, align: "start" }, [fileChip(NAMES[0], say("PDF · 2.4 MB", "PDF · 2.4 MB", "PDF · 2.4 MB", "PDF · 2.4 MB"), "picture_as_pdf", "tertiaryContainer"), fileChip(NAMES[1], say("Sheet · 18 KB", "表格 · 18 KB", "表 · 18 KB", "시트 · 18 KB"), "table", "secondaryContainer")]),
    ),
    variant("pictures", "Pictures", ["图片", "画像", "이미지"], () =>
      hbox({ gap: 8 }, [image({ width: 64, height: 64, alt: "" }), image({ width: 64, height: 64, alt: "" }), image({ width: 64, height: 64, alt: "" }), box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 64, height: 64, hugWidth: false, hugHeight: false }, [text("+2", "label", { bold: true })], { corners: round(12) })]),
    ),
    variant("small", "Small chips", ["小标签", "小さなチップ", "작은 칩"], () =>
      hbox({ gap: 6, wrap: true, width: W, hugWidth: false, align: "start" }, NAMES.map((n) => hbox({ surface: "chip", padX: 10, padY: 4, gap: 6 }, [icon("attach_file", { size: 16, color: "muted" }), text(n, "caption"), icon("close", { size: 16, color: "muted" })], { corners: round(16) }))),
    ),
  ],
);

const CODE = say("def greet(name):\n    return f\"Hello, {name}!\"", "def greet(name):\n    return f\"你好，{name}！\"", "def greet(name):\n    return f\"こんにちは、{name}！\"", "def greet(name):\n    return f\"안녕하세요, {name}!\"");

const artifact = kit(
  "artifact-card",
  "Code and artifact card",
  ["代码与成果卡片", "コードと成果物カード", "코드·결과물 카드"],
  "AI",
  "code_blocks",
  "a panel box: a header row with the language and a copy button over the code in a monospace face; an outlined row with a document tile, a title over its kind and an open button; or a card with a preview picture and a download row",
  [
    variant("code", "Code block", ["代码块", "コードブロック", "코드 블록"], () =>
      vbox({ surface: "panel", width: W, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
        hbox({ padX: 14, padY: 4, justify: "between" }, [muted("python", "caption"), button(T.copy, { variant: "ghost", size: "xs", icon: "content_copy" })], { fill: "surfaceContainerHigh" }),
        vbox({ padX: 16, padY: 14, gap: 0 }, [para(CODE, "body", {}, { look: { font: "mono" } })]),
      ], { corners: round(12) }),
    ),
    variant("document", "Document to open", ["可打开的文档", "開くドキュメント", "열 수 있는 문서"], () =>
      hbox({ surface: "chip", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [tile("description", "surfaceContainerHigh", 48, 24, 10), lines(say("Kyoto itinerary", "京都行程", "京都の旅程", "교토 일정"), say("Document · Click to open", "文档 · 点击打开", "ドキュメント・クリックして開く", "문서 · 클릭하여 열기"), "label"), iconButton("open_in_new", T.open, { size: "sm" })], { corners: round(14) }),
    ),
    variant("preview", "With a preview", ["带预览", "プレビュー付き", "미리보기"], () =>
      vbox({ surface: "card", width: 300, hugWidth: false, padX: 8, padY: 8, gap: 8 }, [image({ height: 140, alt: "" }), hbox({ padX: 6, padY: 0, gap: 8 }, [lines(say("Landing page", "落地页", "ランディングページ", "랜딩 페이지"), say("HTML · 12 KB", "HTML · 12 KB", "HTML · 12 KB", "HTML · 12 KB"), "label"), iconButton("download", say("Download", "下载", "ダウンロード", "다운로드"), { size: "sm" })])]),
    ),
  ],
);

const SOURCES = [say("wikipedia.org", "wikipedia.org", "wikipedia.org", "wikipedia.org"), say("japan-guide.com", "japan-guide.com", "japan-guide.com", "japan-guide.com")];

const citations = kit(
  "citation-chips",
  "Citations",
  ["引用来源", "引用元", "출처"],
  "AI",
  "format_quote",
  "a line of words followed by small numbered tags; a row of source chips (a globe and the site); or one chip with stacked avatars saying how many sources",
  [
    variant("numbers", "Numbered", ["编号", "番号", "번호"], () =>
      hbox({ gap: 4, wrap: true, width: W, hugWidth: false, align: "center" }, [text(say("Fushimi Inari opens all day.", "伏见稻荷全天开放。", "伏見稲荷は終日開いています。", "후시미 이나리는 종일 개방됩니다."), "body"), tag("1"), tag("2")]),
    ),
    variant("sites", "Site chips", ["网站标签", "サイトチップ", "사이트 칩"], () =>
      hbox({ gap: 6, wrap: true, width: W, hugWidth: false, align: "start" }, SOURCES.map((s) => hbox({ surface: "chip", padX: 8, padY: 4, gap: 6 }, [icon("travel_explore", { size: 16, color: "muted" }), text(s, "caption")], { corners: round(14) }))),
    ),
    variant("stack", "Stacked sources", ["来源汇总", "ソースのまとめ", "출처 모음"], () =>
      hbox({ surface: "chip", padX: 8, padY: 4, gap: 8 }, [avatar("A", { size: "sm", count: 3 }), text(say("12 sources", "12 个来源", "12 件のソース", "출처 12개"), "label")], { corners: round(20) }),
    ),
  ],
);

const STARTERS: [Say, Say][] = [
  [say("Plan a trip", "规划旅行", "旅行を計画", "여행 계획"), say("to see the autumn leaves", "去看秋天的红叶", "紅葉を見に行く", "단풍 구경 가기")],
  [say("Help me write", "帮我写", "文章を手伝って", "글쓰기 도와줘"), say("a thank-you note", "一封感谢信", "お礼のメッセージ", "감사 편지")],
  [say("Explain", "解释", "説明して", "설명해 줘"), say("how vaccines work", "疫苗如何起作用", "ワクチンの仕組み", "백신의 원리")],
  [say("Make a plan", "制定计划", "計画を立てる", "계획 세우기"), say("for a 5K in six weeks", "六周跑完 5 公里", "6 週間で 5km 完走", "6주 안에 5km 완주")],
];

const greeting = kit(
  "ai-greeting",
  "Greeting with starters",
  ["开场问候与建议", "あいさつと提案", "인사와 추천"],
  "AI",
  "waving_hand",
  "an empty conversation: a centered question over a 2-column grid of outlined starter cards (a bold line over a muted one); a mark and a greeting over outlined buttons; or a large gradient hello at the start over a muted question and chips",
  [
    variant("grid", "Question and starter cards", ["问题和建议卡片", "質問と提案カード", "질문과 추천 카드"], () =>
      vbox({ width: W, hugWidth: false, gap: 24, align: "center" }, [
        text(say("What can I help with?", "有什么可以帮忙的？", "何かお手伝いできますか？", "무엇을 도와드릴까요?"), "headline", { align: "center" }),
        box({ layout: "grid", columns: 2, gap: 8, padX: 0, padY: 0, align: "stretch", width: W, hugWidth: false }, STARTERS.map(([a, b]) => vbox({ surface: "chip", padX: 12, padY: 10, gap: 2 }, [para(a, "label", { bold: true, maxLines: 1 }), para(b, "caption", { color: "muted", maxLines: 1 })], { corners: round(14) }))),
      ]),
    ),
    variant(
      "mark",
      "Mark, greeting and buttons",
      ["标记、问候和按钮", "マークとあいさつ", "마크와 인사"],
      () =>
        vbox({ width: W, hugWidth: false, gap: 20, align: "center" }, [
          hbox({ gap: 10 }, [svg("sparkle", { width: 32, height: 32, color: "primary" }), text(say("Good evening, Alex", "晚上好，Alex", "こんばんは、Alex さん", "좋은 저녁이에요, Alex"), "headline", {}, { look: { font: "display" } })]),
          hbox({ gap: 8, wrap: true, justify: "center", width: W, hugWidth: false, align: "start" }, [button(say("Write", "写作", "書く", "글쓰기"), { variant: "outlined", size: "xs", icon: "edit" }), button(say("Learn", "学习", "学ぶ", "배우기"), { variant: "outlined", size: "xs", icon: "school" }), button(say("Code", "编程", "コード", "코드"), { variant: "outlined", size: "xs", icon: "code" })]),
        ]),
      { suits: (l) => l.group === "app" && l.surface === "line" },
    ),
    variant("hello", "Large hello", ["大号问候", "大きなあいさつ", "큰 인사"], () =>
      vbox({ width: W, hugWidth: false, gap: 16 }, [
        vbox({ gap: 2 }, [
          text(say("Hello, Alex", "你好，Alex", "こんにちは、Alex さん", "안녕하세요, Alex"), "display", {}, { look: { text: { gradient: { type: "linear", angle: 90, stops: [{ color: "primary", at: 0 }, { color: "tertiary", at: 100 }] } } } }),
          text(say("How can I help today?", "今天想做点什么？", "今日は何をしましょう？", "오늘 무엇을 도와드릴까요?"), "headline", { color: "muted" }),
        ]),
        hbox({ gap: 8, wrap: true, width: W, hugWidth: false, align: "start" }, IDEAS.slice(0, 3).map((w) => chip(w))),
      ]),
    ),
  ],
);

export const assistantKits: KitDef[] = [reply, asked, thinking, toolStep, modelPicker, suggestions, attachments, artifact, citations, greeting];
