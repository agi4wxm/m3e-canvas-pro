import { atom, avatar, box, button, hbox, icon, iconButton, image, para, round, svg, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { presetOf } from "../../lib/look";
import { SCREEN, T, W, kit, muted, push, rule, stars, tag, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Game screens as atoms: the bar of resources along the top, rewards and quests, the shop, a skill with its
 * cooldown, a story line, the path of levels, the result and the banner of a wish. Games draw their own shapes,
 * so the marks that are the game's own (a cooldown arc, a star, a burst) are vector atoms, and the buttons that
 * pay out stand on a pressed lip; a strict style keeps the composition and lets its own surfaces dress it. */

const LIP = presetOf("pressedLip");
const GOLD = presetOf("goldFrame");
const TITLE = presetOf("gameTitle");
const pcGame = (l: KitLook) => l.group === "pcGame";

/** a resource: its mark, the amount in bold and, on a phone, a plus that opens the shop */
const resource = (mark: Node, amount: string, plus = true): Node =>
  hbox({ surface: "chip", padX: 4, padY: 4, gap: 6 }, [mark, text(amount, "label", { bold: true }), ...(plus ? [iconButton("add", say("Get more", "获取更多", "追加", "더 얻기"), { variant: "filled", size: "xs" })] : [])], { fill: "surfaceContainerHigh", corners: round(20) });
const coin = (size = 20) => icon("paid", { size, filled: true, color: "tertiary" });
const gem = (size = 18) => svg("diamond", { width: size, height: size, color: "primary" });

const hud = kit(
  "hud-top-bar",
  "HUD top bar",
  ["游戏顶部信息栏", "ゲームの上部 HUD", "게임 상단 HUD"],
  "Game",
  "sports_esports",
  "a row across the top of a game screen: a framed avatar, the level tag and name over an experience bar, then resource pills (a coin or gem mark, the amount, a filled plus); on frosted glass; or a PC game's thin bar of the chapter, the resources without pluses and settings",
  [
    variant(
      "mobile",
      "Avatar and resources",
      ["头像与资源", "アバターとリソース", "아바타와 자원"],
      () =>
        hbox({ width: SCREEN, hugWidth: false, padX: 8, padY: 8, gap: 8 }, [
          box({ surface: "chip", layout: "row", padX: 2, padY: 2 }, [avatar("AS")], { corners: round(12), look: { stroke: { width: 2, color: "tertiary" } } }),
          vbox({ gap: 4, hugWidth: false, width: 104 }, [hbox({ gap: 4 }, [tag("42", "default"), text(say("Aster", "星辰", "アスター", "아스터"), "label", { bold: true })]), atom("progress", { value: 64, thickness: 6 })]),
          push(),
          resource(coin(), "12,480"),
          resource(gem(), "860", false),
        ]),
      { span: "screen" },
    ),
    variant(
      "glass",
      "On frosted glass",
      ["毛玻璃底", "すりガラスの上", "반투명 유리"],
      () =>
        hbox({ surface: "bar", width: SCREEN, hugWidth: false, padX: 12, padY: 8, gap: 8 }, [iconButton("arrow_back", T.back, { variant: "tonal", size: "xs" }), text(say("Shop", "商店", "ショップ", "상점"), "heading", { bold: true }), push(), resource(icon("bolt", { size: 20, filled: true, color: "secondary" }), "86/120", false), resource(coin(), "12,480", false)], { look: presetOf("glass") }),
      { span: "screen" },
    ),
    variant(
      "pc",
      "PC, thin",
      ["端游细条", "PC・細い", "PC·얇게"],
      () =>
        hbox({ surface: "bar", width: 960, hugWidth: false, padX: 16, padY: 6, gap: 16 }, [
          icon("shield", { size: 20, filled: true, color: "tertiary" }),
          text(say("Chapter 3 · The Ashen Vale", "第三章 · 灰烬山谷", "第 3 章 · 灰の谷", "3장 · 잿빛 골짜기"), "label", { bold: true }),
          push(),
          hbox({ gap: 6 }, [coin(18), text("12,480", "label")]),
          hbox({ gap: 6 }, [gem(16), text("860", "label")]),
          iconButton("settings", T.settings, { size: "xs" }),
        ]),
      { suits: pcGame },
    ),
  ],
);

/** an item on its rarity's well: the glyph large, the count under it */
const loot = (glyph: Node, count: string | Say, rare = false, size = 64): Node =>
  vbox({ gap: 4, align: "center" }, [box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: size, height: size, hugWidth: false, hugHeight: false }, [glyph], { corners: round(12), ...(rare ? { look: GOLD } : {}) }), text(count, "caption", { bold: true })]);

const reward = kit(
  "reward-card",
  "Reward card",
  ["奖励卡片", "報酬カード", "보상 카드"],
  "Game",
  "stars",
  "a panel box: the reward on a rarity well (gold-framed when rare), its count and name; a day's reward with a claim button on a lip; or a row of small reward wells with their counts",
  [
    variant("item", "One item", ["单个物品", "アイテム一つ", "아이템 하나"], () =>
      vbox({ surface: "panel", width: 104, hugWidth: false, padX: 8, padY: 10, gap: 4, align: "center" }, [loot(gem(36), "×120", true), muted(say("Gems", "宝石", "ジェム", "보석"), "tiny")], { corners: round(14) }),
    ),
    variant("claim", "With a claim button", ["带领取按钮", "受け取りボタン付き", "받기 버튼"], () =>
      vbox({ surface: "card", width: 152, hugWidth: false, padX: 12, padY: 12, gap: 10, align: "center" }, [text(say("Day 7", "第 7 天", "7 日目", "7일차"), "label", { bold: true }), loot(icon("redeem", { size: 40, filled: true, color: "tertiary" }), say("Mystery chest", "神秘宝箱", "ふしぎな宝箱", "신비한 상자"), true, 72), button(T.claim, { variant: "filled", size: "sm" }, { look: LIP })], { corners: round(16) }),
    ),
    variant("row", "A row of rewards", ["一排奖励", "報酬の列", "보상 줄"], () =>
      hbox({ gap: 8 }, [loot(coin(28), "×5,000", false, 56), loot(gem(26), "×300", true, 56), loot(icon("bolt", { size: 28, filled: true, color: "secondary" }), "×60", false, 56), loot(icon("local_fire_department", { size: 28, filled: true, color: "error" }), "×3", false, 56)]),
    ),
  ],
);

/** what a quest pays: a small gem and the count */
const pays = (n: string): Node => hbox({ gap: 2 }, [gem(14), text(n, "caption", { bold: true })]);

const quest = kit(
  "quest-row",
  "Quest row",
  ["任务行", "クエストの行", "퀘스트 행"],
  "Game",
  "task_alt",
  "a panel row: the quest's glyph on a tile, its name over a progress bar with the count, and at the end what it pays over a Go button; complete, with a lipped Claim button; or done, muted with a check",
  [
    variant("progress", "In progress", ["进行中", "進行中", "진행 중"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [
        box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 44, height: 44, hugWidth: false, hugHeight: false }, [icon("swords", { size: 26, filled: true })], { fill: "secondaryContainer", corners: round(10) }),
        vbox({ gap: 6, hugWidth: false, width: 160 }, [para(say("Win 3 matches", "赢得 3 场对局", "3 回勝利する", "3번 승리하기"), "label", { bold: true, maxLines: 1 }), hbox({ gap: 8 }, [atom("progress", { value: 66, thickness: 6 }, { grow: true }), text("2/3", "caption", { bold: true })])], { grow: true }),
        vbox({ gap: 4, align: "center" }, [pays("×50"), button(T.go, { variant: "tonal", size: "xs" })]),
      ], { corners: round(14) }),
    ),
    variant("claim", "Ready to claim", ["可领取", "受け取り可能", "받기 가능"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [
        box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 44, height: 44, hugWidth: false, hugHeight: false }, [icon("trophy", { size: 26, filled: true, color: "tertiary" })], { fill: "tertiaryContainer", corners: round(10) }),
        vbox({ gap: 6, hugWidth: false, width: 160 }, [para(say("Log in 5 days", "累计登录 5 天", "5 日ログイン", "5일 접속"), "label", { bold: true, maxLines: 1 }), hbox({ gap: 8 }, [atom("progress", { value: 100, thickness: 6 }, { grow: true }), text("5/5", "caption", { bold: true })])], { grow: true }),
        vbox({ gap: 4, align: "center" }, [pays("×100"), button(T.claim, { variant: "filled", size: "xs" }, { look: LIP })]),
      ], { corners: round(14) }),
    ),
    variant("done", "Claimed", ["已领取", "受取済み", "받음"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [
        box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 44, height: 44, hugWidth: false, hugHeight: false }, [icon("check_circle", { size: 26, filled: true, color: "muted" })], { fill: "surfaceContainerHigh", corners: round(10) }),
        vbox({ gap: 2, hugWidth: false, width: 160 }, [para(say("Open 2 chests", "打开 2 个宝箱", "宝箱を 2 つ開ける", "상자 2개 열기"), "label", { color: "muted", maxLines: 1 }), muted("2/2", "caption")], { grow: true }),
        button(T.claimed, { variant: "tonal", size: "xs", disabled: true }),
      ], { corners: round(14), look: { opacity: 80 } }),
    ),
  ],
);

/** a price on a lipped button: the coin and the amount */
const price = (amount: string, size = "xs"): Node => button(amount, { variant: "filled", size, icon: "paid" }, { look: LIP });

const shopItem = kit(
  "shop-item",
  "Shop item",
  ["商店物品", "ショップのアイテム", "상점 아이템"],
  "Game",
  "storefront",
  "a panel box: the item on a well, its name and a lipped price button with a coin; on offer with a discount tag and the old price struck through; or a wide bundle row with a burst behind a glyph, the name over what is in it and a price button",
  [
    variant("card", "Card", ["卡片", "カード", "카드"], () =>
      vbox({ surface: "panel", width: 120, hugWidth: false, padX: 8, padY: 8, gap: 6, align: "center" }, [box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 104, height: 88, hugWidth: false, hugHeight: false }, [icon("water_drop", { size: 44, filled: true, color: "error" })], { corners: round(10) }), para(say("Health potion", "生命药水", "回復ポーション", "체력 물약"), "caption", { bold: true, align: "center", maxLines: 1, width: 104 }), price("120")], { corners: round(14) }),
    ),
    variant("offer", "On offer", ["特惠", "セール中", "할인 중"], () =>
      vbox({ surface: "panel", width: 120, hugWidth: false, padX: 8, padY: 8, gap: 6, align: "center" }, [
        hbox({ justify: "between", hugWidth: false, width: 104 }, [tag("-30%", "destructive"), muted("180", "caption", {}, { look: { text: { decoration: "line-through" } } })]),
        box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 104, height: 72, hugWidth: false, hugHeight: false }, [icon("swords", { size: 40, filled: true, color: "primary" })], { corners: round(10) }),
        para(say("Steel sword", "钢剑", "鋼の剣", "강철 검"), "caption", { bold: true, align: "center", maxLines: 1, width: 104 }),
        price("120"),
      ], { corners: round(14) }),
    ),
    variant("bundle", "Bundle row", ["礼包行", "パックの行", "패키지 행"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12 }, [
        box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 72, height: 72, hugWidth: false, hugHeight: false }, [svg("starburst", { width: 56, height: 56, color: "tertiary" })], { corners: round(12), look: GOLD }),
        vbox({ gap: 4, hugWidth: false, width: 140, align: "stretch" }, [para(say("Starter pack", "新手礼包", "スターターパック", "스타터 팩"), "label", { bold: true, maxLines: 1 }), para(say("Gems ×300 · Coins ×5,000", "宝石 ×300 · 金币 ×5,000", "ジェム ×300 · コイン ×5,000", "보석 ×300 · 코인 ×5,000"), "caption", { color: "muted", maxLines: 2 }), hbox({ gap: 0 }, [tag(say("Once only", "限购一次", "1 回限り", "1회 한정"), "tertiary")])], { grow: true }),
        button(say("$4.99", "¥30", "¥600", "₩6,500"), { variant: "filled", size: "sm" }, { look: LIP }),
      ], { corners: round(14) }),
    ),
  ],
);

/** A round skill: a disc, its track and, once used, the arc of what is left of its cooldown, with a bolt drawn into
 *  the same picture so nothing has to stand over anything else. `left` is how much of the cooldown remains, 0–1. */
function skillFace(left: number, size = 64): Node {
  const r = 28;
  const a = (1 - left) * 2 * Math.PI - Math.PI / 2;
  const x = (32 + r * Math.cos(a)).toFixed(2);
  const y = (32 + r * Math.sin(a)).toFixed(2);
  const sweep = left === 0 ? `<circle cx="32" cy="32" r="${r}" fill="none" stroke="currentColor" stroke-width="4"/>` : `<path d="M32 4A${r} ${r} 0 ${1 - left > 0.5 ? 1 : 0} 1 ${x} ${y}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`;
  const markup = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="currentColor" fill-opacity="${left ? 0.12 : 0.2}"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="4"/>${sweep}<path d="M35 14L21 36H31L28 50L43 28H33Z" fill="currentColor" fill-opacity="${left ? 0.5 : 1}"/></svg>`;
  return atom("svg", { mode: "markup", markup, width: size, height: size, color: "primary", label: say("Skill", "技能", "スキル", "스킬") });
}

const skill = kit(
  "cooldown-skill",
  "Cooldown skill",
  ["冷却技能按钮", "クールダウンスキル", "쿨다운 스킬"],
  "Game",
  "bolt",
  "a vector skill face (a disc, a track and the arc of the cooldown that has passed, the glyph dimmed until ready) over the seconds left; ready, the ring closed and glowing; or a PC skill bar of four faces over their keys",
  [
    variant("cooldown", "Cooling down", ["冷却中", "クールダウン中", "쿨다운 중"], () => vbox({ gap: 4, align: "center" }, [skillFace(0.3), text("3.2s", "caption", { bold: true })])),
    variant("ready", "Ready", ["就绪", "使用可能", "준비됨"], () => vbox({ gap: 4, align: "center" }, [box({ layout: "row", padX: 0, padY: 0 }, [skillFace(0)], { corners: round(32), look: { shadows: [{ x: 0, y: 0, blur: 16, spread: 0, color: "primary/60" }] } }), text(say("Ready", "就绪", "準備完了", "준비"), "caption", { bold: true, color: "primary" })])),
    variant(
      "bar",
      "Skill bar with keys",
      ["带按键的技能栏", "キー付きスキルバー", "키가 있는 스킬 바"],
      () => hbox({ surface: "panel", padX: 10, padY: 8, gap: 10 }, ["Q", "W", "E", "R"].map((k, i) => vbox({ gap: 4, align: "center" }, [skillFace([0, 0.6, 0, 0.9][i], 48), atom("kbd", { keys: [{ label: k }] })])), { corners: round(12) }),
      { suits: pcGame },
    ),
  ],
);

const LINE = say("The wind has changed. Whatever sleeps under the mountain is waking up.", "风向变了。沉睡在山下的东西，正在醒来。", "風向きが変わった。山の下で眠るものが目を覚まそうとしている。", "바람이 바뀌었다. 산 아래 잠든 것이 깨어나고 있다.");
const SPEAKER = say("Lumine", "荧", "蛍", "루미네");

/** a name on its own plate */
const plate = (name: Say): Node => hbox({ surface: "chip", padX: 12, padY: 2 }, [text(name, "label", { bold: true })], { fill: "primaryContainer", corners: round(6) });

const dialogue = kit(
  "dialogue-panel",
  "Dialogue panel",
  ["剧情对话框", "会話パネル", "대화 패널"],
  "Game",
  "forum",
  "a panel row: a portrait picture, then a name plate over the spoken line with a next mark at the end; a band across a wide screen with the name over a short rule and the line centered; or the line over two choice rows, each a speech glyph and words",
  [
    variant("portrait", "Portrait and name plate", ["立绘与名牌", "立ち絵と名札", "초상화와 이름표"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 12, padY: 12, gap: 12, align: "start" }, [
        image({ width: 84, height: 108, alt: "" }),
        vbox({ gap: 8, hugWidth: false, width: 200 }, [hbox({ gap: 0 }, [plate(SPEAKER)]), para(LINE, "body"), hbox({ justify: "end" }, [icon("arrow_drop_down", { size: 24, color: "primary" })])], { grow: true }),
      ], { corners: round(14) }),
    ),
    variant(
      "band",
      "Band across",
      ["横贯屏幕的光带", "横長の帯", "가로 띠"],
      () =>
        vbox({ width: 640, hugWidth: false, padX: 48, padY: 16, gap: 8, align: "center" }, [text(SPEAKER, "heading", { bold: true, color: "tertiary" }, { look: { text: { color: "#f3d27a" } } }), rule(120, false, "tertiaryContainer"), para(LINE, "lead", { align: "center", width: 520 }, { look: { text: { color: "#ffffff", shadows: [{ x: 0, y: 1, blur: 2, spread: 0, color: "#00000099" }] } } }), icon("arrow_drop_down", { size: 24, color: "tertiary" })], { look: { fills: [{ type: "linear", angle: 180, stops: [{ color: "#00000000", at: 0 }, { color: "#000000b3", at: 35 }, { color: "#000000cc", at: 100 }] }] } }),
      { suits: (l) => l.dialogue === "band" },
    ),
    variant("choices", "With choices", ["带选项", "選択肢付き", "선택지"], () =>
      vbox({ width: W, hugWidth: false, gap: 8 }, [
        vbox({ surface: "panel", padX: 14, padY: 12, gap: 6 }, [hbox({ gap: 0 }, [plate(SPEAKER)]), para(say("Will you come with me?", "你愿意和我一起去吗？", "一緒に来てくれる？", "나와 함께 가줄래?"), "body")], { corners: round(14) }),
        ...[say("Of course.", "当然。", "もちろん。", "물론이지."), say("I need more time.", "我还需要时间。", "もう少し時間がほしい。", "시간이 좀 더 필요해.")].map((c) => hbox({ surface: "chip", padX: 16, padY: 10, gap: 10 }, [icon("chat_bubble", { size: 18, filled: true, color: "primary" }), para(c, "body", { maxLines: 1 }, { grow: true })], { corners: round(22) })),
      ]),
    ),
  ],
);

/** a level on the path: done (its number on the filled disc, three stars), here (ringed), or locked */
const node = (n: number, state: "done" | "here" | "locked", got = 3): Node => {
  const disc = state === "locked"
    ? box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 48, height: 48, hugWidth: false, hugHeight: false }, [icon("lock_person", { size: 20, filled: true, color: "muted" })], { corners: round(24) })
    : /* a disc of the primary color rather than a button surface: a style that draws its buttons as bare words would
       * leave the number on nothing */
      box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 48, height: 48, hugWidth: false, hugHeight: false }, [text(String(n), "heading", { bold: true, color: "on-primary" })], { fill: "primary", corners: round(24), ...(state === "here" ? { look: LIP } : {}) });
  return vbox({ gap: 4, align: "center" }, [state === "here" ? box({ layout: "row", padX: 4, padY: 4 }, [disc], { corners: round(28), look: { stroke: { width: 3, color: "primary" } } }) : box({ layout: "row", padX: 4, padY: 4 }, [disc]), stars(state === "done" ? got : 0, 3, 12, 1)]);
};
/** the road between two levels, at the height of their discs */
const road = (lit: boolean): Node => vbox({ gap: 0, padX: 0, padY: 0 }, [box({ layout: "row", padX: 0, padY: 0, width: 24, height: 4, hugWidth: false, hugHeight: false }, [], { fill: lit ? "primary" : "surfaceContainerHighest", corners: round(2) }), box({ layout: "row", padX: 0, padY: 0, width: 24, height: 16, hugWidth: false, hugHeight: false }, [])]);

const path = kit(
  "level-path",
  "Level path",
  ["关卡路径", "ステージの道", "레벨 경로"],
  "Game",
  "linear_scale",
  "a row of level nodes joined by short roads: done ones (the number on a filled disc over the stars earned), the current one ringed on a lip, and locked ones in a well with a lock; or the same running down a column",
  [
    variant("row", "Across", ["横向", "横に", "가로"], () => hbox({ gap: 0, align: "center" }, [node(1, "done"), road(true), node(2, "done", 2), road(true), node(3, "here"), road(false), node(4, "locked"), road(false), node(5, "locked")])),
    variant("column", "Down", ["纵向", "縦に", "세로"], () =>
      vbox({ gap: 0, align: "center" }, [node(5, "locked"), box({ layout: "row", padX: 0, padY: 0, width: 4, height: 20, hugWidth: false, hugHeight: false }, [], { fill: "surfaceContainerHighest" }), node(4, "here"), box({ layout: "row", padX: 0, padY: 0, width: 4, height: 20, hugWidth: false, hugHeight: false }, [], { fill: "primary" }), node(3, "done", 3)]),
    ),
  ],
);

const result = kit(
  "result-panel",
  "Result panel",
  ["结算面板", "リザルトパネル", "결과 패널"],
  "Game",
  "military_tech",
  "a panel box, centered: the outcome in a game title face, stars (the middle one larger), a row of rewards on wells, and Retry / Next buttons sharing the row; a defeat with no stars and a tip; or a mission summary of stat lines",
  [
    variant("victory", "Victory", ["胜利", "勝利", "승리"], () =>
      vbox({ surface: "panel", width: 320, hugWidth: false, padX: 20, padY: 20, gap: 14, align: "center" }, [
        text(say("VICTORY", "胜利", "勝利", "승리"), "display", { align: "center" }, { look: TITLE }),
        hbox({ gap: 6, align: "end" }, [svg("star", { width: 36, height: 36, color: "tertiary" }), svg("star", { width: 48, height: 48, color: "tertiary" }), svg("star", { width: 36, height: 36, color: "tertiary" })]),
        hbox({ gap: 10 }, [loot(coin(26), "×1,200", false, 52), loot(gem(24), "×30", true, 52), loot(icon("bolt", { size: 26, filled: true, color: "secondary" }), "×10", false, 52)]),
        hbox({ gap: 10, hugWidth: false, width: 280 }, [button(say("Retry", "重试", "リトライ", "다시"), { variant: "tonal", size: "md" }, { grow: true }), button(T.next, { variant: "filled", size: "md" }, { grow: true, look: LIP })]),
      ], { corners: round(20) }),
    ),
    variant("defeat", "Defeat", ["失败", "敗北", "패배"], () =>
      vbox({ surface: "panel", width: 320, hugWidth: false, padX: 20, padY: 20, gap: 12, align: "center" }, [
        text(say("DEFEAT", "失败", "敗北", "패배"), "display", { align: "center", color: "muted" }),
        stars(0, 3, 32, 6),
        para(say("Tip: upgrade your shield before the next try.", "提示：下次挑战前先升级盾牌。", "ヒント：次の挑戦の前に盾を強化しよう。", "팁: 다음 도전 전에 방패를 강화하세요."), "body", { color: "muted", align: "center", width: 280 }),
        hbox({ gap: 10, hugWidth: false, width: 280 }, [button(say("Upgrade", "强化", "強化", "강화"), { variant: "tonal", size: "md" }, { grow: true }), button(say("Retry", "重试", "リトライ", "다시"), { variant: "filled", size: "md" }, { grow: true, look: LIP })]),
      ], { corners: round(20) }),
    ),
    variant(
      "summary",
      "Mission summary",
      ["任务总结", "ミッション結果", "임무 요약"],
      () =>
        vbox({ surface: "panel", width: 360, hugWidth: false, padX: 20, padY: 18, gap: 10 }, [
          text(say("MISSION COMPLETE", "任务完成", "ミッション完了", "임무 완료"), "title", { bold: true }),
          rule(320),
          ...([[say("Time", "用时", "タイム", "시간"), "03:42"], [say("Eliminations", "击败", "撃破", "처치"), "18"], [say("Accuracy", "命中率", "命中率", "명중률"), "64%"]] as [Say, string][]).map(([k, v]) => hbox({ justify: "between" }, [muted(k), text(v, "label", { bold: true })])),
          hbox({ justify: "between" }, [muted(say("Rating", "评级", "評価", "등급")), stars(4, 5, 16)]),
        ], { corners: round(4) }),
      { suits: pcGame },
    ),
  ],
);

const wish = kit(
  "wish-banner",
  "Wish banner",
  ["祈愿横幅", "ガチャバナー", "뽑기 배너"],
  "Game",
  "auto_awesome",
  "a panel box: the key art, a Limited tag with the time left, the banner's name over the featured character, and ×1 / ×10 buttons with their gem prices; or a compact row of art, name over time left, and a Wish button",
  [
    variant("banner", "Banner", ["横幅", "バナー", "배너"], () =>
      vbox({ surface: "panel", width: W, hugWidth: false, padX: 8, padY: 8, gap: 10 }, [
        image({ height: 170, alt: "" }),
        vbox({ padX: 6, padY: 0, gap: 8 }, [
          hbox({ justify: "between" }, [tag(say("Limited", "限定", "期間限定", "한정"), "destructive"), muted(say("Ends in 6d 12h", "剩余 6 天 12 小时", "残り 6 日 12 時間", "6일 12시간 남음"), "caption")]),
          vbox({ gap: 0 }, [text(say("Starlit Wishes", "星光祈愿", "星降る願い", "별빛 소원"), "title", { bold: true }), muted(say("Rate up: Aster", "概率提升：星辰", "ピックアップ：アスター", "확률 업: 아스터"), "caption")]),
          hbox({ gap: 10 }, [button("×1 · 160", { variant: "tonal", size: "md", icon: "diamond" }, { grow: true }), button("×10 · 1,600", { variant: "filled", size: "md", icon: "diamond" }, { grow: true, look: LIP })]),
        ]),
      ], { corners: round(16) }),
    ),
    variant("compact", "Compact row", ["紧凑行", "コンパクトな行", "컴팩트 행"], () =>
      hbox({ surface: "panel", width: W, hugWidth: false, padX: 10, padY: 10, gap: 12 }, [image({ width: 72, height: 72, alt: "" }), vbox({ gap: 2, hugWidth: false, width: 140 }, [para(say("Starlit Wishes", "星光祈愿", "星降る願い", "별빛 소원"), "label", { bold: true, maxLines: 1 }), para(say("Ends in 6d 12h", "剩余 6 天 12 小时", "残り 6 日 12 時間", "6일 12시간 남음"), "caption", { color: "muted", maxLines: 1 })], { grow: true }), button(say("Wish", "祈愿", "ガチャ", "뽑기"), { variant: "filled", size: "sm" }, { look: LIP })], { corners: round(16) }),
    ),
  ],
);

export const playKits: KitDef[] = [hud, reward, quest, shopItem, skill, dialogue, path, result, wish];
