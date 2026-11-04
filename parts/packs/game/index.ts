import { h } from "../../node";
import type { PartPack } from "../types";

/* The game parts of 17722797729/m3e-canvas game-ui (MIT). In the fork one part reaches into seven
 * source files; here the whole of it is a definition below and a component file beside this one. */

export const game: PartPack = {
  id: "game",
  version: "0.1.0",
  category: { key: "Game", icon: "sports_esports", labels: { ja: "ゲーム", zh: "游戏", ko: "게임" } },
  sources: {
    Joystick: { from: "@/components/packs/game/Joystick" },
    QuantityStepper: { from: "@/components/packs/game/QuantityStepper" },
  },
  load: () => import("./parts"),
  legacyKinds: {
    /* a quantity row here and in the iOS fork; the GPUI canvas's row of steps is told apart by its dialect first */
    stepper: { slug: "game/quantity-stepper", props: (item) => (typeof item.value === "number" ? { value: item.value } : {}) },
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
      category: "Game",
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
