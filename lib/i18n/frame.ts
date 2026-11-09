/* Editor words for bindings per frame (docs/数据绑定.md “每帧绑定”): the part panel's section where a text's words, a
 * stat bar's value and any part's opacity are bound to the world's snapshot. Spread into `UI` and `KO` in lib/i18n.ts;
 * each entry has ja, en and zh, and Korean is in `FRAME_KO` below with exactly the same keys. */

export const FRAME_UI = {
  frTitle: { ja: "毎フレーム（ワールド）", en: "Per frame (world)", zh: "每帧（世界）" },
  frBindProp: { ja: "毎フレーム結び付ける", en: "Bind per frame", zh: "按帧绑定" },
  frUnbind: { ja: "毎フレームの結び付けを外す", en: "Unbind per frame", zh: "取消每帧绑定" },
  frOpacity: { ja: "不透明度（0–100）", en: "Opacity (0–100)", zh: "不透明度（0–100）" },
  frHint: {
    ja: "world（ワールドのスナップショット、world.byId.<id>、world.clock.now）だけを読み、毎フレーム描き直さずに書き込みます。関数は使えません。",
    en: "Reads world only (the world's snapshot, world.byId.<id>, world.clock.now) and is written every frame without drawing again. No helpers.",
    zh: "只读 world（世界快照、world.byId.<id>、world.clock.now），每帧直接写进画面，不重新渲染；不能调用辅助函数。",
  },
};

type Keys = keyof typeof FRAME_UI;

export const FRAME_KO: Record<Keys, string> = {
  frTitle: "매 프레임(월드)",
  frBindProp: "매 프레임 연결",
  frUnbind: "매 프레임 연결 해제",
  frOpacity: "불투명도(0–100)",
  frHint: "world(월드 스냅샷, world.byId.<id>, world.clock.now)만 읽고, 다시 그리지 않고 매 프레임 씁니다. 도우미 함수는 쓸 수 없습니다.",
};
