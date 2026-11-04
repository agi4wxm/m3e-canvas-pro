import { h, ic } from "../../node";
import type { ListItem, P, PartDef, TableData } from "../../types";
import { defined, kept, materialIcon, num, rows, text } from "../legacy";
import type { LegacyKind, PartPack } from "../types";

/* The game parts of 17722797729/m3e-canvas game-ui (MIT). In the fork one part reaches into seven
 * source files; here the whole of it is a definition below and a component file beside this one. */

const PRIZES: ListItem[] = [
  { label: "First prize", icon: "trophy" },
  { label: "Try again", icon: "refresh" },
  { label: "Second prize", icon: "military_tech" },
  { label: "No luck", icon: "sentiment_dissatisfied" },
  { label: "Third prize", icon: "workspace_premium" },
  { label: "Gift", icon: "redeem" },
  { label: "Lucky", icon: "star" },
  { label: "Coins", icon: "paid" },
];
const REWARDS: TableData = { columns: ["At", "Label", "Icon"], rows: [["10", "4 h", "redeem"], ["20", "8 h", "savings"], ["30", "50", "inventory_2"], ["60", "1", "workspace_premium"]] };

/** a fork's prizes: label and icon, which is a list's row as it is */
const prizesOf = (it: Record<string, unknown>): ListItem[] | undefined =>
  Array.isArray(it.prizes) && it.prizes.length ? it.prizes.map((p: { label?: unknown; icon?: unknown }) => { const icon = materialIcon(p?.icon); return { label: String(p?.label ?? ""), ...(icon ? { icon } : {}) }; }) : undefined;

/** one machine of the six: they differ in what they draw, not in what they hold */
function drawDef(slug: string, component: string, name: string, labels: PartDef["labels"], icon: string, side: number, height: number, buttonDefault: string): PartDef {
  return {
    slug,
    name,
    labels,
    category: "Game",
    icon,
    w: side,
    h: height,
    props: [
      { key: "label", label: "Label", kind: "text", default: buttonDefault },
      { key: "prizes", label: "Prizes", labels: { ja: "賞品", zh: "奖品", ko: "상품" }, kind: "list", icons: true, default: PRIZES, min: 1, max: 12 },
      { key: "result", label: "Forced result (-1: random)", labels: { ja: "固定の結果（-1: ランダム）", zh: "固定结果（-1 为随机）", ko: "고정 결과 (-1: 무작위)" }, kind: "number", default: -1, min: -1, max: 11, step: 1 },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: side, min: 120, max: 480, step: 4, unit: "px" },
    ],
    tree: (p: P) => h(component, { prizes: p.list("prizes").map((x) => ({ label: x.label, ...(x.icon ? { icon: x.icon } : {}) })), label: p.s("label"), result: Math.round(p.n("result")), size: Math.round(p.n("size")) }),
  };
}

const drawKind = (slug: string): LegacyKind => ({ slug, props: (it) => defined({ label: text(it, "label"), prizes: prizesOf(it), size: num(it, "size") }) });

export const game: PartPack = {
  id: "game",
  version: "0.1.0",
  sources: {
    Joystick: { from: "@/components/packs/game/Joystick" },
    QuantityStepper: { from: "@/components/packs/game/QuantityStepper" },
    Wheel: { from: "@/components/packs/game/Draws" },
    GridWheel: { from: "@/components/packs/game/Draws" },
    Gacha: { from: "@/components/packs/game/Draws" },
    SlotMachine: { from: "@/components/packs/game/Draws" },
    MoneyTree: { from: "@/components/packs/game/Draws" },
    EggSmash: { from: "@/components/packs/game/Draws" },
    SideTabs: { from: "@/components/packs/game/Panels" },
    Inventory: { from: "@/components/packs/game/Panels" },
    ItemCell: { from: "@/components/packs/game/Panels" },
    TaskBar: { from: "@/components/packs/game/Panels" },
    RewardTrack: { from: "@/components/packs/game/Panels" },
    CheckIn: { from: "@/components/packs/game/Panels" },
    FunctionButton: { from: "@/components/packs/game/Panels" },
  },
  load: () => import("./parts"),
  retired: {
    "game/slider-input": { slug: "slider", props: (o) => defined({ label: kept(o, "label"), value: num(o, "value"), width: num(o, "width") }) },
    "game/confirm-box": { slug: "alert-dialog", props: (o) => defined({ title: kept(o, "title"), description: kept(o, "message"), action: kept(o, "confirm"), cancel: kept(o, "cancel") }) },
  },
  legacyKinds: {
    /* a quantity row here and in the iOS fork; the GPUI canvas's row of steps is told apart by its dialect first */
    stepper: { slug: "game/quantity-stepper", props: (item) => (typeof item.value === "number" ? { value: item.value } : {}) },
    wheel: drawKind("game/wheel"),
    gridWheel: drawKind("game/grid-wheel"),
    gacha: drawKind("game/gacha"),
    slot: drawKind("game/slot-machine"),
    moneyTree: drawKind("game/money-tree"),
    eggSmash: drawKind("game/egg-smash"),
    /* the GPUI canvas's date grid is told apart by its dialect first; what is left is a daily check-in */
    calendar: { slug: "game/check-in", props: (it) => defined({ title: text(it, "label"), signed: num(it, "value"), width: num(it, "size") }) },
    assetPill: { slug: "game/asset-pill", props: (it) => defined({ value: text(it, "label"), icon: materialIcon(it.icon) }) },
    sliderInput: { slug: "slider", props: (it) => defined({ label: text(it, "label"), value: num(it, "value"), width: num(it, "size") }) },
    sideTabs: { slug: "game/side-tabs", props: (it) => defined({ items: rows(it), selected: num(it, "selected") }) },
    invGrid: {
      slug: "game/inventory",
      /* the cells a fork saved say how many columns and rows it had */
      props: (it) => {
        const cells = Array.isArray(it.children) ? (it.children as { cellCol?: unknown; cellRow?: unknown }[]) : [];
        const most = (key: "cellCol" | "cellRow") => Math.max(0, ...cells.map((c) => (typeof c[key] === "number" ? (c[key] as number) : 0))) + 1;
        /* the fork's cells are empty boxes: its items are the author's, and not in the saved part */
        return defined({ columns: cells.length ? most("cellCol") : undefined, rows: cells.length ? most("cellRow") : undefined, filled: 0, width: num(it, "size") });
      },
    },
    itemCell: {
      slug: "game/item-cell",
      props: (it) => defined({ icon: materialIcon(it.icon), name: text(it, "label"), count: text(it, "supporting"), rarity: it.badge2 === true ? text(it, "badge2Text") : "", rarityColor: text(it, "badge2Color"), badge: it.badge === true ? text(it, "badgeText") : "", size: num(it, "size") }),
    },
    taskBar: { slug: "game/task-bar", props: (it) => defined({ title: text(it, "label"), action: text(it, "label2"), width: num(it, "size") }) },
    rewardTrack: {
      slug: "game/reward-track",
      props: (it) =>
        defined({
          data: Array.isArray(it.rewards) ? { columns: REWARDS.columns, rows: (it.rewards as { at?: unknown; label?: unknown; icon?: unknown }[]).map((r) => [String(r.at ?? 0), String(r.label ?? ""), materialIcon(r.icon) ?? ""]) } : undefined,
          value: num(it, "value"),
          max: num(it, "max"),
          action: text(it, "label"),
          width: num(it, "size"),
        }),
    },
    fnButton: { slug: "game/function-button", props: (it) => defined({ label: text(it, "label"), icon: materialIcon(it.icon), timer: it.timer === true ? num(it, "timerValue") : 0, unit: text(it, "timerUnit"), size: num(it, "size") }) },
    confirmBox: { slug: "alert-dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), action: text(it, "label2"), cancel: text(it, "label3") }) },
    joystick: {
      slug: "game/joystick",
      props: (item) => ({
        ...(typeof item.size === "number" ? { size: item.size } : {}),
        ...(typeof item.value === "number" ? { angle: item.value } : {}),
        ...(typeof item.joystickReturn === "boolean" ? { autoCenter: item.joystickReturn } : {}),
      }),
    },
  },
  defs: [
    drawDef("game/wheel", "Wheel", "Prize wheel", { ja: "ルーレット", zh: "转盘", ko: "룰렛" }, "donut_large", 220, 252, "Spin"),
    drawDef("game/grid-wheel", "GridWheel", "Grid draw", { ja: "グリッド抽選", zh: "九宫格抽奖", ko: "격자 추첨" }, "grid_view", 240, 272, "Draw"),
    drawDef("game/gacha", "Gacha", "Gacha", { ja: "ガチャ", zh: "扭蛋", ko: "가챠" }, "toys", 170, 250, "Draw once"),
    drawDef("game/slot-machine", "SlotMachine", "Slot machine", { ja: "スロット", zh: "老虎机", ko: "슬롯머신" }, "casino", 280, 160, "Shake"),
    drawDef("game/money-tree", "MoneyTree", "Money tree", { ja: "金のなる木", zh: "摇钱树", ko: "돈나무" }, "park", 190, 180, "Shake"),
    drawDef("game/egg-smash", "EggSmash", "Egg smash", { ja: "卵割り", zh: "砸金蛋", ko: "알 깨기" }, "egg", 260, 130, "Pick an egg"),
    {
      slug: "game/asset-pill",
      name: "Asset pill",
      labels: { ja: "資産表示", zh: "资源胶囊", ko: "자원 표시" },
      category: "Game",
      icon: "paid",
      w: 110,
      h: 32,
      props: [
        { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "text", default: "1.6M" },
        { key: "icon", label: "Icon", kind: "icon", default: "paid" },
      ],
      tree: (p) => h("div", { "data-slot": "asset-pill", className: "bg-surface-container-high text-label-large text-on-surface inline-flex h-8 items-center gap-1 rounded-full px-3" }, p.s("icon") && ic(p.s("icon"), { className: "size-4" }), p.s("value")),
    },
    {
      slug: "game/side-tabs",
      name: "Side tabs",
      labels: { ja: "サイドタブ", zh: "侧边标签", ko: "측면 탭" },
      category: "Navigation",
      icon: "side_navigation",
      w: 120,
      h: 220,
      props: [
        { key: "items", label: "Tabs", labels: { ja: "タブ", zh: "标签", ko: "탭" }, kind: "list", default: [{ label: "For you" }, { label: "Following" }, { label: "Popular" }, { label: "New" }], min: 1, max: 12 },
        { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 11, step: 1 },
        { key: "width", label: "Width", kind: "number", default: 120, min: 80, max: 320, step: 4, unit: "px" },
      ],
      tree: (p) => h("SideTabs", { items: p.list("items").map((x) => ({ label: x.label })), selected: Math.round(p.n("selected")), width: Math.round(p.n("width")) }),
    },
    {
      slug: "game/inventory",
      name: "Inventory",
      labels: { ja: "インベントリ", zh: "背包", ko: "인벤토리" },
      category: "Game",
      icon: "backpack",
      w: 380,
      h: 320,
      props: [
        { key: "columns", label: "Columns", labels: { ja: "列", zh: "列数", ko: "열" }, kind: "number", default: 5, min: 1, max: 12, step: 1 },
        { key: "rows", label: "Rows", labels: { ja: "行", zh: "行数", ko: "행" }, kind: "number", default: 4, min: 1, max: 12, step: 1 },
        { key: "filled", label: "Filled cells", labels: { ja: "埋まっているマス", zh: "已有物品的格子", ko: "채워진 칸" }, kind: "number", default: 7, min: 0, max: 144, step: 1 },
        { key: "width", label: "Width", kind: "number", default: 380, min: 160, max: 800, step: 4, unit: "px" },
      ],
      tree: (p) => h("Inventory", { columns: Math.round(p.n("columns")), rows: Math.round(p.n("rows")), filled: Math.round(p.n("filled")), width: Math.round(p.n("width")) }),
    },
    {
      slug: "game/item-cell",
      name: "Item cell",
      labels: { ja: "アイテムマス", zh: "物品格", ko: "아이템 칸" },
      category: "Game",
      icon: "category",
      w: 60,
      h: 80,
      props: [
        { key: "icon", label: "Icon", kind: "icon", default: "eco" },
        { key: "name", label: "Name", labels: { ja: "名前", zh: "名称", ko: "이름" }, kind: "text", default: "Leaf", defaults: { zh: "树叶" } },
        { key: "count", label: "Count", labels: { ja: "数量", zh: "数量", ko: "수량" }, kind: "text", default: "23" },
        { key: "rarity", label: "Rarity", labels: { ja: "レア度", zh: "稀有度", ko: "희귀도" }, kind: "text", default: "" },
        { key: "rarityColor", label: "Rarity color", labels: { ja: "レア度の色", zh: "稀有度颜色", ko: "희귀도 색상" }, kind: "text", default: "#7BAE7A" },
        { key: "badge", label: "Badge", labels: { ja: "バッジ", zh: "角标", ko: "배지" }, kind: "text", default: "" },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 60, min: 32, max: 160, step: 4, unit: "px" },
      ],
      tree: (p) => h("ItemCell", { icon: p.s("icon"), name: p.s("name"), count: p.s("count"), rarity: p.s("rarity"), rarityColor: p.s("rarityColor"), badge: p.s("badge"), size: Math.round(p.n("size")) }),
    },
    {
      slug: "game/task-bar",
      name: "Task row",
      labels: { ja: "タスク行", zh: "任务条", ko: "작업 행" },
      category: "Game",
      icon: "task_alt",
      w: 380,
      h: 64,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Daily login (1/1)", defaults: { zh: "每日登录 (1/1)" } },
        { key: "action", label: "Button", labels: { ja: "ボタン", zh: "按钮文字", ko: "버튼" }, kind: "text", default: "Claim", defaults: { zh: "领取" } },
        { key: "done", label: "When claimed", labels: { ja: "受け取り後", zh: "领取后文字", ko: "받은 후" }, kind: "text", default: "Claimed", defaults: { zh: "已领取" } },
        { key: "width", label: "Width", kind: "number", default: 380, min: 200, max: 800, step: 4, unit: "px" },
      ],
      tree: (p) => h("TaskBar", { title: p.s("title"), action: p.s("action"), done: p.s("done"), width: Math.round(p.n("width")) }),
    },
    {
      slug: "game/reward-track",
      name: "Reward track",
      labels: { ja: "報酬トラック", zh: "奖励进度", ko: "보상 트랙" },
      category: "Game",
      icon: "military_tech",
      w: 380,
      h: 108,
      props: [
        { key: "data", label: "Rewards", labels: { ja: "報酬", zh: "奖励", ko: "보상" }, kind: "table", default: REWARDS },
        { key: "value", label: "Progress", labels: { ja: "進捗", zh: "进度", ko: "진행" }, kind: "number", default: 20, min: 0, max: 100000, step: 1 },
        { key: "max", label: "Goal", labels: { ja: "目標", zh: "目标值", ko: "목표" }, kind: "number", default: 60, min: 1, max: 100000, step: 1 },
        { key: "action", label: "Claim label", labels: { ja: "受け取りの文言", zh: "领取文字", ko: "받기 문구" }, kind: "text", default: "Claim", defaults: { zh: "领取" } },
        { key: "width", label: "Width", kind: "number", default: 380, min: 200, max: 800, step: 4, unit: "px" },
      ],
      tree: (p) => h("RewardTrack", { rewards: p.table("data").rows.map((r) => ({ at: Number(r[0]) || 0, label: r[1] ?? "", icon: r[2] ?? "" })), value: Math.round(p.n("value")), max: Math.round(p.n("max")), action: p.s("action"), width: Math.round(p.n("width")) }),
    },
    {
      slug: "game/check-in",
      name: "Daily check-in",
      labels: { ja: "デイリーチェックイン", zh: "每日签到", ko: "출석 체크" },
      category: "Game",
      icon: "event_available",
      w: 300,
      h: 280,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Check in", defaults: { zh: "签到" } },
        { key: "days", label: "Days", labels: { ja: "日数", zh: "天数", ko: "일수" }, kind: "number", default: 30, min: 7, max: 31, step: 1 },
        { key: "signed", label: "Days checked in", labels: { ja: "チェックイン済み", zh: "已签到天数", ko: "출석한 일수" }, kind: "number", default: 3, min: 0, max: 31, step: 1 },
        { key: "width", label: "Width", kind: "number", default: 300, min: 200, max: 640, step: 4, unit: "px" },
      ],
      tree: (p) => h("CheckIn", { title: p.s("title"), days: Math.round(p.n("days")), signed: Math.round(p.n("signed")), width: Math.round(p.n("width")) }),
    },
    {
      slug: "game/function-button",
      name: "Function button",
      labels: { ja: "機能ボタン", zh: "功能按钮", ko: "기능 버튼" },
      category: "Actions",
      icon: "bolt",
      w: 74,
      h: 96,
      props: [
        { key: "label", label: "Label", kind: "text", default: "Event", defaults: { zh: "活动" } },
        { key: "icon", label: "Icon", kind: "icon", default: "bolt" },
        { key: "timer", label: "Countdown (0: none)", labels: { ja: "カウントダウン（0: なし）", zh: "倒计时（0 为无）", ko: "카운트다운 (0: 없음)" }, kind: "number", default: 3, min: 0, max: 999, step: 1 },
        { key: "unit", label: "Unit", labels: { ja: "単位", zh: "单位", ko: "단위" }, kind: "enum", default: "minute", options: ["second", "minute", "hour"] },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 50, min: 32, max: 120, step: 2, unit: "px" },
      ],
      tree: (p) => h("FunctionButton", { label: p.s("label"), icon: p.s("icon"), timer: Math.round(p.n("timer")), unit: p.s("unit"), size: Math.round(p.n("size")) }),
    },
    {
      slug: "game/joystick",
      name: "Joystick",
      labels: { ja: "方向ホイール", zh: "方向轮盘", ko: "방향 휠" },
      category: "Game",
      icon: "gamepad",
      w: 132,
      h: 132,
      props: [
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 132, min: 64, max: 320, step: 4, unit: "px" },
        { key: "angle", label: "Direction when drawn", labels: { ja: "静止時の方向", zh: "静止时的方向", ko: "정지 시 방향" }, kind: "number", default: 0, min: 0, max: 360, step: 1, unit: "°" },
        { key: "autoCenter", label: "Back to the middle on release", labels: { ja: "指を離したら中央へ", zh: "松手回中", ko: "손을 떼면 중앙으로" }, kind: "bool", default: true },
      ],
      tree: (p) => h("Joystick", { size: Math.round(p.n("size")), angle: Math.round(p.n("angle")), autoCenter: p.b("autoCenter") }),
    },
    {
      slug: "game/quantity-stepper",
      name: "Quantity stepper",
      labels: { ja: "数量ステッパー", zh: "数量加减器", ko: "수량 스테퍼" },
      category: "Selection",
      icon: "exposure",
      w: 200,
      h: 56,
      props: [
        { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "number", default: 1, min: 0, max: 999, step: 1 },
        { key: "min", label: "Minimum", labels: { ja: "最小値", zh: "最小值", ko: "최솟값" }, kind: "number", default: 0, min: 0, max: 999, step: 1 },
        { key: "max", label: "Maximum", labels: { ja: "最大値", zh: "最大值", ko: "최댓값" }, kind: "number", default: 99, min: 0, max: 999, step: 1 },
        { key: "width", label: "Width", kind: "number", default: 200, min: 120, max: 400, step: 4, unit: "px" },
      ],
      tree: (p) => h("QuantityStepper", { value: Math.round(p.n("value")), min: Math.round(p.n("min")), max: Math.round(p.n("max")), width: Math.round(p.n("width")) }),
    },
  ],
};
