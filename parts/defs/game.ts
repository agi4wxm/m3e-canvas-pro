import { h, ic, listSlots } from "../node";
import type { ListItem, P, PartDef, TableData } from "../types";
import { FIELD, fieldFrame, fieldValues } from "../fieldState";
import { ariaLabelProp } from "../a11y";
import { cssColor } from "../color";

/* The game parts, after 17722797729/m3e-canvas game-ui (MIT): a definition below and a widget in
 * parts/widgets for each. */

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
const EVERY_ENTRY = { prefix: "tab", label: "Every entry", labels: { ja: "すべての項目", zh: "每一项", ko: "모든 항목" } };
const ENDS_AT = { label: "Ends at (ms, 0: none)", labels: { ja: "終了時刻（ミリ秒、0: なし）", zh: "结束时刻（毫秒，0 为无）", ko: "종료 시각 (밀리초, 0: 없음)" } };
const SKEW = { label: "Clock ahead of the device (ms)", labels: { ja: "端末より進んでいる時計（ミリ秒）", zh: "时钟比设备快多少（毫秒）", ko: "기기보다 앞선 시계 (밀리초)" } };

const REWARDS: TableData = { columns: ["At", "Label", "Icon"], rows: [["10", "4 h", "redeem"], ["20", "8 h", "savings"], ["30", "50", "inventory_2"], ["60", "1", "workspace_premium"]] };

/** one machine of the six: they differ in what they draw, not in what they hold */
function drawDef(slug: string, component: string, name: string, labels: PartDef["labels"], icon: string, side: number, height: number, buttonDefault: string): PartDef {
  return {
    slug,
    appearance: { radius: 16 },
    name,
    labels,
    category: "Game",
    icon,
    w: side,
    h: height,
    props: [
      { key: "label", label: "Label", kind: "text", default: buttonDefault },
      { key: "prizes", label: "Prizes", labels: { ja: "賞品", zh: "奖品", ko: "상품" }, kind: "list", icons: true, default: PRIZES, min: 1, max: 12 },
      { key: "result", label: "Result (-1: none yet)", labels: { ja: "結果（-1: まだない）", zh: "结果（-1 为还没有）", ko: "결과 (-1: 아직 없음)" }, kind: "number", default: -1, min: -1, max: 11, step: 1 },
      { key: "pending", label: "Waiting for the result", labels: { ja: "結果を待っている", zh: "正在等待结果", ko: "결과 기다리는 중" }, kind: "bool", default: false },
      ...(slug === "slot-machine" ? [{ key: "reels", label: "Reels to stop on (0,2,1)", labels: { ja: "止まる絵柄（0,2,1）", zh: "停在哪些图案（如 0,2,1）", ko: "멈출 그림 (0,2,1)" }, kind: "text", default: "" } as const] : []),
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: side, min: 120, max: 480, step: 4, unit: "px" },
    ],
    /* a press asks: the button, or one of the eggs (one action for all three) */
    slots: (p: P) => (slug === "egg-smash" ? [0, 1, 2].map((i) => ({ key: `egg:${i}`, label: `${p.s("label") || "Egg"} ${i + 1}` })) : [{ key: "action", label: p.s("label") || "Draw" }]),
    ...(slug === "egg-smash" ? { families: [{ prefix: "egg", label: "Every egg", labels: { ja: "すべての卵", zh: "每一个蛋", ko: "모든 알" } }] } : {}),
    /* the prize is the other side's to decide: a press asks, `result` brings the answer in, and the machine settles on it */
    events: [{ name: "settled", label: "Shown the result", labels: { ja: "結果を表示した", zh: "结果展示完", ko: "결과를 보여 줌" }, payload: { index: "number", label: "text" } }],
    demo: { what: "picks a prize at random when pressed and nothing else gives one", takenOverBy: ["result", "pending"] },
    tree: (p: P) =>
      h(component, {
        prizes: p.list("prizes").map((x) => ({ label: x.label, ...(x.icon ? { icon: x.icon } : {}) })),
        label: p.s("label"),
        result: Math.round(p.n("result")),
        ...(p.b("pending") ? { pending: true } : {}),
        ...(slug === "slot-machine" && p.s("reels") ? { reels: p.s("reels") } : {}),
        size: Math.round(p.n("size")),
      }),
  };
}

export const game: PartDef[] = [
  drawDef("prize-wheel", "Wheel", "Prize wheel", { ja: "ルーレット", zh: "转盘", ko: "룰렛" }, "donut_large", 220, 252, "Spin"),
  drawDef("grid-draw", "GridWheel", "Grid draw", { ja: "グリッド抽選", zh: "九宫格抽奖", ko: "격자 추첨" }, "grid_view", 240, 272, "Draw"),
  drawDef("gacha", "Gacha", "Gacha", { ja: "ガチャ", zh: "扭蛋", ko: "가챠" }, "toys", 170, 250, "Draw once"),
  drawDef("slot-machine", "SlotMachine", "Slot machine", { ja: "スロット", zh: "老虎机", ko: "슬롯머신" }, "casino", 280, 160, "Shake"),
  drawDef("money-tree", "MoneyTree", "Money tree", { ja: "金のなる木", zh: "摇钱树", ko: "돈나무" }, "park", 190, 180, "Shake"),
  drawDef("egg-smash", "EggSmash", "Egg smash", { ja: "卵割り", zh: "砸金蛋", ko: "알 깨기" }, "egg", 260, 130, "Pick an egg"),
  {
    slug: "asset-pill",
    appearance: { radius: 999 },
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
    slug: "side-tabs",
    appearance: { radius: 12 },
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
    /* a tap on a tab picks it: whoever draws the part moves `selected`. Plain M3E buttons, so every app draws it */
    selectKey: "selected",
    slots: (p) => listSlots(p.list("items")),
    families: [EVERY_ENTRY],
    tree: (p) => {
      const on = Math.round(p.n("selected"));
      return h(
        "div",
        { "data-slot": "side-tabs", "data-selected": on, className: "bg-surface-container flex flex-col gap-1 rounded-xl p-1", style: { width: Math.round(p.n("width")) } },
        ...p.list("items").map((t, i) =>
          h(
            "Button",
            { variant: i === on ? "tonal" : "ghost", "aria-pressed": i === on, "data-slot": "side-tabs-item", "data-active": i === on || undefined, "data-tap": `tab:${i}`, className: "h-9 w-full justify-start truncate px-3 text-left [--btn-r-pressed:8px] [--btn-r:8px] hover:shadow-none" },
            t.label,
          ),
        ),
      );
    },
  },
  {
    slug: "inventory",
    appearance: { radius: 16 },
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
    slug: "item-cell",
    appearance: { radius: 8 },
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
      { key: "rarityColor", label: "Rarity color", labels: { ja: "レア度の色", zh: "稀有度颜色", ko: "희귀도 색상" }, kind: "color", default: "#7BAE7A", roles: ["primary", "secondary", "tertiary", "error", "outline"], none: "default" },
      { key: "badge", label: "Badge", labels: { ja: "バッジ", zh: "角标", ko: "배지" }, kind: "text", default: "" },
      { key: "pressed", label: "Selected", labels: { ja: "選択中", zh: "选中", ko: "선택됨" }, kind: "bool", default: false },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 60, min: 32, max: 160, step: 4, unit: "px" },
    ],
    tree: (p) => h("ItemCell", { icon: p.s("icon"), name: p.s("name"), count: p.s("count"), rarity: p.s("rarity"), rarityColor: cssColor(p.s("rarityColor")) ?? "", badge: p.s("badge"), ...(p.b("pressed") ? { selected: true } : {}), size: Math.round(p.n("size")) }),
  },
  {
    slug: "task-row",
    appearance: { radius: 16 },
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
    slug: "reward-track",
    appearance: { radius: 16 },
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
      { key: "claimed", label: "Claimed rows (1,2)", labels: { ja: "受け取り済みの行（1,2）", zh: "已领取第几项（如 1,2）", ko: "받은 행 (1,2)" }, kind: "text", default: "" },
      { key: "action", label: "Claim label", labels: { ja: "受け取りの文言", zh: "领取文字", ko: "받기 문구" }, kind: "text", default: "Claim", defaults: { zh: "领取" } },
      { key: "width", label: "Width", kind: "number", default: 380, min: 200, max: 800, step: 4, unit: "px" },
    ],
    /* a press on a reward that is ready asks to claim it; what is claimed is the game's to say */
    slots: (p) => p.rows("data").map((r, i) => ({ key: `tab:${i}`, label: r.label || `${i + 1}` })),
    families: [EVERY_ENTRY],
    demo: { what: "marks a reward claimed as soon as it is pressed", takenOverBy: ["claimed"] },
    tree: (p) => h("RewardTrack", { rewards: p.rows("data").map((r) => ({ at: Number(r.at) || 0, label: r.label ?? "", icon: r.icon ?? "" })), value: Math.round(p.n("value")), max: Math.round(p.n("max")), ...(p.s("claimed") ? { claimed: p.s("claimed") } : {}), action: p.s("action"), width: Math.round(p.n("width")) }),
  },
  {
    slug: "check-in",
    appearance: { radius: 16 },
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
      { key: "today", label: "Today (0: the next day)", labels: { ja: "今日（0: 次の日）", zh: "今天是第几天（0 为下一天）", ko: "오늘 (0: 다음 날)" }, kind: "number", default: 0, min: 0, max: 31, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 300, min: 200, max: 640, step: 4, unit: "px" },
    ],
    /* a press on today asks to check in; how many days are checked in is the other side's to say */
    slots: (p) => [{ key: "today", label: p.s("title") || "Today" }],
    demo: { what: "checks today in as soon as it is pressed", takenOverBy: ["signed", "today"] },
    tree: (p) => h("CheckIn", { title: p.s("title"), days: Math.round(p.n("days")), signed: Math.round(p.n("signed")), ...(p.n("today") > 0 ? { today: Math.round(p.n("today")) } : {}), width: Math.round(p.n("width")) }),
  },
  {
    slug: "function-button",
    appearance: { radius: 12 },
    name: "Function button",
    labels: { ja: "機能ボタン", zh: "功能按钮", ko: "기능 버튼" },
    category: "Actions",
    icon: "bolt",
    w: 74,
    h: 96,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Event", defaults: { zh: "活动" } },
      { key: "icon", label: "Icon", kind: "icon", default: "bolt" },
      { key: "timer", label: "Countdown (0: none)", labels: { ja: "カウントダウン（0: なし）", zh: "倒计时（0 为无）", ko: "카운트다운 (0: 없음)" }, kind: "number", unit: "s", default: 3, min: 0, max: 999, step: 1 },
      { key: "unit", label: "Unit", labels: { ja: "単位", zh: "单位", ko: "단위" }, kind: "enum", default: "minute", options: ["second", "minute", "hour"] },
      { key: "endsAt", ...ENDS_AT, kind: "number", unit: "ms", default: 0, min: 0, max: 1e14, step: 1 },
      { key: "clockSkew", ...SKEW, kind: "number", unit: "ms", default: 0, min: -1e10, max: 1e10, step: 1 },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 50, min: 32, max: 120, step: 2, unit: "px" },
    ],
    tree: (p) =>
      h("FunctionButton", {
        label: p.s("label"),
        icon: p.s("icon"),
        timer: Math.round(p.n("timer")),
        unit: p.s("unit"),
        ...(p.n("endsAt") > 0 ? { endsAt: Math.round(p.n("endsAt")) } : {}),
        ...(p.n("clockSkew") ? { clockSkew: Math.round(p.n("clockSkew")) } : {}),
        size: Math.round(p.n("size")),
      }),
  },
  {
    slug: "joystick",
    /* a pad can be held still; it is named for a screen reader as any input is */
    field: { disabled: "disabled" },
    appearance: { radius: 999 },
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
      { key: "value", label: "Direction (x,y from -1 to 1)", labels: { ja: "方向（x,y は -1 から 1）", zh: "方向（x,y 在 -1 到 1 之间）", ko: "방향 (x,y는 -1에서 1)" }, kind: "text", default: "" },
      ariaLabelProp(),
    ],
    /* the direction the finger pushes is what the visitor enters; letting go is also sent */
    input: { prop: "value", kind: "vec2" },
    events: [{ name: "release", label: "Let go", labels: { ja: "指を離した", zh: "松开了", ko: "손을 뗌" }, payload: { x: "number", y: "number" } }],
    tree: (p) => h("Joystick", { size: Math.round(p.n("size")), angle: Math.round(p.n("angle")), autoCenter: p.b("autoCenter"), ...(p.s("value") ? { value: p.s("value") } : {}), ...(p.b("disabled") ? { disabled: true } : {}), ...(p.s("ariaLabel").trim() ? { label: p.s("ariaLabel").trim() } : {}) }),
  },
  {
    slug: "quantity-stepper",
    field: FIELD,
    input: { prop: "value", kind: "number" },
    appearance: { target: "QuantityStepper", radius: 999 },
    name: "Quantity stepper",
    labels: { ja: "数量ステッパー", zh: "数量加减器", ko: "수량 스테퍼" },
    category: "Forms",
    icon: "exposure",
    w: 200,
    h: 56,
    props: [
      { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "number", default: 1, min: 0, max: 999, step: 1 },
      { key: "min", label: "Minimum", labels: { ja: "最小値", zh: "最小值", ko: "최솟값" }, kind: "number", default: 0, min: 0, max: 999, step: 1 },
      { key: "max", label: "Maximum", labels: { ja: "最大値", zh: "最大值", ko: "최댓값" }, kind: "number", default: 99, min: 0, max: 999, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 200, min: 120, max: 400, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    /* the minus and the plus, for an action that changes the number somewhere else as well */
    slots: () => [
      { key: "dec", label: "Decrease" },
      { key: "inc", label: "Increase" },
    ],
    tree: (p) => fieldFrame(fieldValues(p), h("QuantityStepper", { value: Math.round(p.n("value")), min: Math.round(p.n("min")), max: Math.round(p.n("max")), width: Math.round(p.n("width")) })),
  },
];
