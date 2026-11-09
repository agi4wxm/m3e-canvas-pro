import { h } from "../node";
import type { PartDef } from "../types";

/** The input actions a world view's `inputs` declares (words: "move: vec2, attack: bool"), in order, each once: a name,
 *  and its type where one is given (`vec2` a direction, `bool` a button). A name of the wrong form is left out. */
export function inputDeclsOf(words: unknown): { name: string; type?: "vec2" | "bool" }[] {
  if (typeof words !== "string") return [];
  const out = new Map<string, { name: string; type?: "vec2" | "bool" }>();
  for (const piece of words.split(/[,，、;\n]+/)) {
    const m = /^\s*([a-z][a-zA-Z0-9]{0,31})\s*(?::\s*(vec2|bool)\s*)?$/.exec(piece);
    if (m && !out.has(m[1])) out.set(m[1], { name: m[1], ...(m[2] ? { type: m[2] as "vec2" | "bool" } : {}) });
  }
  return [...out.values()];
}

/** an entity's hit points from the table's HP and Max HP columns, when both are numbers (a mock world's snapshot, a
 *  screenshot of one at a moment) */
function hitPoints(hp: string | undefined, max: string | undefined): { hp?: number; maxHp?: number } {
  const a = hp ? Number(hp) : NaN;
  const b = max ? Number(max) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? { hp: Math.max(0, a), maxHp: b } : {};
}

/* The world view (docs/组件规范.md “世界视口”, docs/边界与契约.md “实时玩法”): a viewport whose picture an engine draws.
 * M3E defines only what goes in and out: the world's state the design shows (its entities, the one the camera follows,
 * the score, how it is going: props, bindable to data), the input actions it takes (`inputs`; the design sends them with
 * `move`, `press` and `release`, on a channel of the view's own; each declared once with its type, `move: vec2`,
 * `attack: bool`, what a joystick, a skill key and later a keyboard or a gamepad are mapped to), and the events it sends (`hit`, `collected`, `ended`),
 * on which the design's actions run. The canvas and the preview draw a stand-in: the scene in words, the entities where
 * they stand and, below them, the inputs as they come. A prototype plays M3E's example engine on it (lib/world/example.ts)
 * until the entities come from data; an exported app hands the view to a slot written once, where the real engine goes. */

export const world: PartDef[] = [
  {
    slug: "world-view",
    world: true,
    appearance: { radius: 12 },
    name: "World view",
    labels: { ja: "ワールドビュー", zh: "世界视口", ko: "월드 뷰" },
    category: "Basics",
    icon: "sports_esports",
    w: 360,
    h: 240,
    props: [
      { key: "label", label: "Name", labels: { ja: "名前", zh: "名称", ko: "이름" }, kind: "text", default: "World", defaults: { zh: "世界", ja: "ワールド", ko: "월드" } },
      { key: "scene", label: "What the picture is", labels: { ja: "画面の内容", zh: "画面是什么", ko: "화면 내용" }, kind: "text", default: "A meadow seen from above", defaults: { zh: "从上方看的一片草地", ja: "上から見た草原", ko: "위에서 본 초원" } },
      /* a picture of the scene under the words (an image, or a 3D model drawn turning): the stand-in's, never the engine's */
      { key: "picture", label: "Picture of the scene (an image or a 3D model)", labels: { ja: "シーンの画像（画像または 3D モデル）", zh: "场景的图像（图片或 3D 模型）", ko: "장면 이미지 (이미지 또는 3D 모델)" }, kind: "image" },
      {
        key: "entities",
        label: "Entities (x, y from 0 to 100; HP and Max HP if they have hit points)",
        labels: { ja: "エンティティ（x, y は 0〜100、HP があれば HP と最大 HP）", zh: "实体（x、y 在 0 到 100 之间；有生命值时加 HP、最大 HP 两列）", ko: "엔티티 (x, y는 0~100, 체력이 있으면 HP와 최대 HP)" },
        kind: "table",
        default: {
          columns: ["Id", "Kind", "X", "Y", "Label"],
          rows: [
            ["hero", "player", "20", "50", "Hero"],
            ["coin1", "coin", "50", "50", ""],
            ["coin2", "coin", "80", "30", ""],
            ["slime", "enemy", "70", "75", "Slime"],
          ],
        },
      },
      { key: "follow", label: "The camera follows (an id)", labels: { ja: "カメラが追う（id）", zh: "镜头跟随（id）", ko: "카메라가 따라감 (id)" }, kind: "text", default: "" },
      { key: "score", label: "Score", labels: { ja: "スコア", zh: "得分", ko: "점수" }, kind: "number", default: 0, min: 0, max: 1e9, step: 1 },
      { key: "status", label: "How it is going", labels: { ja: "状態", zh: "状态", ko: "상태" }, kind: "enum", default: "running", options: ["running", "paused", "ended"] },
      { key: "inputs", label: "Input actions it takes (name: vec2 | bool)", labels: { ja: "受け取る入力アクション（名前: vec2 | bool）", zh: "接受的输入动作（名字: vec2 | bool）", ko: "받는 입력 동작 (이름: vec2 | bool)" }, kind: "text", default: "move: vec2, attack: bool" },
      { key: "width", label: "Width", kind: "number", default: 360, min: 120, max: 1920, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 240, min: 96, max: 1280, step: 4, unit: "px" },
    ],
    events: [
      { name: "hit", label: "Something was hit", labels: { ja: "何かに当たった", zh: "击中了什么", ko: "무언가를 맞힘" }, payload: { id: "text", by: "text" } },
      { name: "collected", label: "Something was picked up", labels: { ja: "何かを拾った", zh: "捡到了什么", ko: "무언가를 주움" }, payload: { id: "text", kind: "text" } },
      { name: "ended", label: "The round is over", labels: { ja: "ラウンドが終わった", zh: "这一局结束了", ko: "라운드가 끝남" }, payload: { score: "number" } },
    ],
    /* a prototype plays the example engine; once the world's state comes from data (or how it is going), the stand-in
       only shows it */
    demo: { what: "plays M3E's example engine: the player moves with the move input, picks up coins and items and hits enemies with attack", takenOverBy: ["entities", "status"] },
    tree: (p) => {
      const entities = p
        .table("entities")
        .rows.map((r) => ({ id: r[0] ?? "", kind: r[1] ?? "", x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}), ...hitPoints(r[5], r[6]) }))
        .filter((e) => e.id && Number.isFinite(e.x) && Number.isFinite(e.y))
        .map((e) => ({ ...e, x: Math.min(100, Math.max(0, e.x)), y: Math.min(100, Math.max(0, e.y)) }));
      return h("WorldView", {
        label: p.s("label"),
        scene: p.s("scene"),
        ...(p.s("picture") ? { picture: p.s("picture") } : {}),
        entities,
        follow: p.s("follow"),
        score: Math.round(p.n("score")),
        status: p.s("status"),
        inputs: inputDeclsOf(p.s("inputs")),
        width: Math.round(p.n("width")),
        height: Math.round(p.n("height")),
      });
    },
  },
];
