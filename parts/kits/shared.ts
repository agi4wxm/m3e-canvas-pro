import { atom, box, hbox, icon, text, vbox, round, type Words } from "../atoms";
import type { PartCategory } from "../registry";
import { say, type Node } from "../templates/kit";
import { MATERIAL_LOOK, groupingOf, type KitDef, type KitLook, type KitVariant } from "./types";

/* What the kits share: the width of a phone's content, the traits of a look that decide a composition, and the
 * words most kits say. A trait reads only the look's fields (lib/kits.ts works them out from the theme), never a
 * style by name. */

/** a phone's content width, between the screen's margins */
export const W = 380;
/** a phone screen, edge to edge: what a bar spans */
export const SCREEN = 412;

/* ---------- writing a kit short ---------- */

type Three = [zh: string, ja: string, ko: string];

/** a variant: its key, its name in English and then in zh, ja and ko, and its tree for a look */
export const variant = (key: string, name: string, [zh, ja, ko]: Three, build: (look: KitLook) => Node, more: Pick<KitVariant, "suits" | "span"> = {}): KitVariant => ({
  key,
  name,
  labels: { zh, ja, ko },
  build: (look = MATERIAL_LOOK) => build(look),
  ...more,
});

/** A kit: its outermost box is called what the kit is, unless a variant names it itself. */
export function kit(slug: string, name: string, [zh, ja, ko]: Three, category: PartCategory, iconName: string, about: string, variants: KitVariant[]): KitDef {
  const called = say(name, zh, ja, ko);
  return {
    slug,
    name,
    labels: { zh, ja, ko },
    category,
    icon: iconName,
    about,
    variants: variants.map((v) => ({ ...v, build: (look?: KitLook) => {
      const root = v.build(look);
      return root.name ? root : { ...root, name: called };
    } })),
  };
}

/* ---------- traits of a look ---------- */

/* they live beside the look itself, so a split (parts/defs/splits.ts) composes by the same traits a kit does */
export { isGame, isDesk, isDense, isIosLike, isWeui, centersTitle, isMobileGame, groupingOf } from "./types";

/* ---------- small pieces ---------- */

/** A hairline across what holds it: a box one pixel high, so a column stretches it to its own width (a
 *  separator keeps the length it is given). `down` stands it on end, as tall as `length`, between the parts of a row. */
export const rule = (length = W, down = false, fill: Node["fill"] = "surfaceContainerHighest"): Node =>
  box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: down ? 1 : length, height: down ? length : 1 }, [], { fill, name: say("Divider", "分隔线", "区切り線", "구분선") });

/** a hairline between two rows that starts where their words do, as grouped lists draw it */
export const insetRule = (left: number): Node =>
  hbox({ gap: 0, padX: 0, padY: 0, hugWidth: false, width: W }, [box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: left, height: 1 }, []), { ...rule(100), grow: true }], { name: say("Divider", "分隔线", "区切り線", "구분선") });

/** Rows as one section of a list, the way the look groups them: a card box holding them, parted by hairlines from
 *  `textAt` (where the rows' words start), so a style dresses the section as its own; bare rows where the look
 *  sets them on the page. `how` forces a grouping. */
export function section(rows: Node[], look: KitLook, textAt: number, width = W, how = groupingOf(look)): Node {
  if (how === "bare") return vbox({ width, hugWidth: false, gap: 0 }, rows);
  return vbox({ surface: "card", width, hugWidth: false, padX: 0, padY: 0, gap: 0 }, rows.flatMap((r, i) => (i ? [insetRule(textAt), r] : [r])), { corners: round(how === "inset" ? 12 : 0) });
}

/** a short bar a sheet is dragged by, centered */
export const grabber = (w = 36, h = 5): Node => hbox({ justify: "center", hugWidth: false, width: W }, [box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: w, height: h }, [], { fill: "surfaceContainerHighest", corners: round(h / 2) })]);

/** a title over a supporting line, taking what the row leaves */
export const lines = (title: Words, sub?: Words, titleStyle = "lead", more: { subLines?: number; subColor?: string } = {}): Node =>
  vbox({ gap: 2, hugWidth: false, width: 160 }, [atom("text", { text: title, style: titleStyle, fit: "fixed", maxLines: 1 }), ...(sub ? [atom("text", { text: sub, style: "body", color: more.subColor ?? "muted", fit: "fixed", maxLines: more.subLines ?? 1 })] : [])], { grow: true });

/** a glyph on a small tile of its own color: settings, files, merchants */
export const tile = (name: string, fill: Node["fill"] = "primaryContainer", size = 40, iconSize = 24, r = 12): Node =>
  box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: size, height: size, hugWidth: false, hugHeight: false }, [icon(name, { size: iconSize, filled: true, color: fill === "primary" ? "on-primary" : "default" })], { fill, corners: round(r) });

/** a round tile: a disc behind a glyph */
export const disc = (name: string, fill: Node["fill"] = "secondaryContainer", size = 40, iconSize = 20): Node => tile(name, fill, size, iconSize, size / 2);

/** a ring part way round, for what is still under way: on the canvas nothing spins */
export const busy = (size = 24): Node => atom("circular-progress", { value: 70, size, thickness: 3 });

/** a little words-only pill: "NEW", "-20%", "Lv. 12" */
export const tag = (words: Words, variant = "secondary"): Node => atom("badge", { kind: "label", label: words, variant });

/** a stretch of empty room in a row, so what follows goes to the end */
export const push = (): Node => box({ layout: "row", padX: 0, padY: 0, hugWidth: false, width: 8, height: 8 }, [], { grow: true });

/** words in the muted color */
export const muted = (words: Words, style = "body", more: Record<string, unknown> = {}, extra: Partial<Node> = {}): Node => text(words, style, { color: "muted", ...more }, extra);

/** stars out of five, drawn with the vector atom so a style cannot turn them into its own icon */
export const stars = (n: number, of = 5, size = 20, gap = 2): Node =>
  hbox({ gap }, Array.from({ length: of }, (_, i) => atom("svg", { mode: "preset", preset: "star", width: size, height: size, color: i < n ? "tertiary" : "outline" })));

/* ---------- words ---------- */

export const T = {
  copy: say("Copy", "复制", "コピー", "복사"),
  copied: say("Copied", "已复制", "コピーしました", "복사됨"),
  retry: say("Regenerate", "重新生成", "再生成", "다시 생성"),
  good: say("Good response", "赞", "良い回答", "좋은 답변"),
  bad: say("Bad response", "踩", "良くない回答", "나쁜 답변"),
  share: say("Share", "分享", "共有", "공유"),
  more: say("More", "更多", "その他", "더보기"),
  close: say("Close", "关闭", "閉じる", "닫기"),
  cancel: say("Cancel", "取消", "キャンセル", "취소"),
  ok: say("OK", "确定", "OK", "확인"),
  done: say("Done", "完成", "完了", "완료"),
  back: say("Back", "返回", "戻る", "뒤로"),
  send: say("Send", "发送", "送信", "보내기"),
  search: say("Search", "搜索", "検索", "검색"),
  settings: say("Settings", "设置", "設定", "설정"),
  edit: say("Edit", "编辑", "編集", "편집"),
  remove: say("Remove", "移除", "削除", "삭제"),
  open: say("Open", "打开", "開く", "열기"),
  seeAll: say("See all", "查看全部", "すべて表示", "모두 보기"),
  claim: say("Claim", "领取", "受け取る", "받기"),
  claimed: say("Claimed", "已领取", "受取済み", "받음"),
  go: say("Go", "前往", "行く", "가기"),
  add: say("Add", "添加", "追加", "추가"),
  attach: say("Attach", "添加附件", "添付", "첨부"),
  voice: say("Voice", "语音", "音声", "음성"),
  emoji: say("Emoji", "表情", "絵文字", "이모지"),
  call: say("Call", "通话", "通話", "통화"),
  message: say("Message", "发消息", "メッセージ", "메시지"),
  play: say("Play", "播放", "再生", "재생"),
  next: say("Next", "下一个", "次へ", "다음"),
  previous: say("Previous", "上一个", "前へ", "이전"),
  minimize: say("Minimize", "最小化", "最小化", "최소화"),
  maximize: say("Maximize", "最大化", "最大化", "최대화"),
  like: say("Like", "点赞", "いいね", "좋아요"),
  comment: say("Comment", "评论", "コメント", "댓글"),
  save: say("Save", "收藏", "保存", "저장"),
  follow: say("Follow", "关注", "フォロー", "팔로우"),
  today: say("Today", "今天", "今日", "오늘"),
  yesterday: say("Yesterday", "昨天", "昨日", "어제"),
  justNow: say("Just now", "刚刚", "たった今", "방금"),
};
