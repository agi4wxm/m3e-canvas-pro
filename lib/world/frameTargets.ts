/* What a binding per frame (lib/bindings/frame.ts) can drive, and how a web host writes it into what it drew. A frame's
 * value never goes through a render: it is written straight into the part's drawing, so only a prop whose drawing is
 * known to the writer can be bound per frame: the words of a text, the current value of a stat bar (a health bar), and
 * the opacity of any part (`@opacity`, 0–100, a damage number fading). The phone's and the mini-program's kits write the
 * same props their own way (an animated value, the page's node: rn/src/kit/frame.tsx, miniapp-kit/src/kit/frame.tsx).
 *
 * The web writers work on any node shaped like the DOM's (the preview's, an exported web app's); the types here are
 * structural so the file goes into an exported app's runtime, which names no DOM. Each writer sets only what differs
 * from what is there, so writing the same value every frame costs a read and nothing else, and a part React drew again
 * (its design's own value back) is written over on the next frame. */

import { propValueOf } from "../bindings/expr";

/** what a prop bound per frame comes to: words, or a number kept to the prop's range */
export type FrameKind = "text" | "number";

/** a prop that can be bound per frame: what kind of value it takes, and its range */
export type FrameTarget = { kind: FrameKind; min?: number; max?: number; summary: string };

/** the generic target every part has: how opaque it is, 0–100, as the design field `@opacity` */
export const FRAME_OPACITY = "@opacity";

/** every prop that can be bound per frame, by part */
export const FRAME_TARGETS: Record<string, Record<string, FrameTarget>> = {
  text: { text: { kind: "text", summary: "its words (a damage number, a cooldown's seconds)" } },
  "stat-bar": { value: { kind: "number", min: 0, max: 1_000_000, summary: "the current value: the fill and the numbers (a health bar)" } },
};

/** the opacity target, which every part has */
const OPACITY: FrameTarget = { kind: "number", min: 0, max: 100, summary: "how opaque the part is, 0-100" };

/** what a part's prop is as a target per frame, or undefined when it cannot be bound per frame */
export function frameTargetOf(slug: string | undefined, prop: string): FrameTarget | undefined {
  if (prop === FRAME_OPACITY) return OPACITY;
  return slug ? FRAME_TARGETS[slug]?.[prop] : undefined;
}

/** the props of a part that can be bound per frame */
export const frameProps = (slug: string | undefined): string[] => [...Object.keys((slug && FRAME_TARGETS[slug]) || {}), FRAME_OPACITY];

/** The bindings per frame of a part, each with the kind of value its prop takes: what a host's frame loop is handed
 *  (lib/app/frame.ts `FrameSpec`). A prop no frame can write is left out. */
export function framesOfItem(it: { id: string; component?: string; frame?: Record<string, string> }): { part: string; prop: string; expr: string; kind: FrameKind; min?: number; max?: number }[] {
  return Object.entries(it.frame ?? {}).flatMap(([prop, expr]) => {
    const t = frameTargetOf(it.component, prop);
    return t && typeof expr === "string" ? [{ part: it.id, prop, expr, kind: t.kind, ...(t.min !== undefined ? { min: t.min } : {}), ...(t.max !== undefined ? { max: t.max } : {}) }] : [];
  });
}

/** A value as a target takes it: words for words (nothing is ""), a number kept to the range (none when it reads as no
 *  number). The rule of every binding (lib/bindings/expr.ts `propValueOf`). */
export function frameValueOf(v: unknown, t: Pick<FrameTarget, "kind" | "min" | "max">): string | number | undefined {
  return propValueOf(v, t.kind === "number" ? { kind: "number", min: t.min, max: t.max } : { kind: "text" }) as string | number | undefined;
}

/* ---------- writing it on the web ---------- */

/** the little of a DOM node a writer touches */
export type FrameNode = {
  nodeType: number;
  nodeValue: string | null;
  textContent: string | null;
  firstChild: FrameNode | null;
  nextSibling: FrameNode | null;
  style: { getPropertyValue(name: string): string; setProperty(name: string, value: string): void };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): FrameNode | null;
};

/** Words into a node: into its one text node where it has one (React keeps that node and writes it again itself), else
 *  as its whole content. A mini-program's page nodes (Taro's) take it the same way. */
export function frameText(el: Pick<FrameNode, "firstChild" | "textContent">, text: string) {
  const only = el.firstChild;
  if (only && only.nodeType === 3 && !only.nextSibling) {
    if (only.nodeValue !== text) only.nodeValue = text;
  } else if (el.textContent !== text) el.textContent = text;
}

/** a style of a node, set only where it differs */
export const frameStyle = (el: Pick<FrameNode, "style">, name: string, value: string) => {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
};
const setAttr = (el: FrameNode, name: string, value: string) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};
const slot = (root: FrameNode, name: string): FrameNode | null => (root.getAttribute("data-slot") === name ? root : root.querySelector(`[data-slot="${name}"]`));

/** Writes a value of a prop bound per frame into a part drawn on the web: `box` is the element the part is drawn in
 *  (the preview's part box, the element an exported screen marks with the part's key). Nothing happens where the
 *  drawing is not there (yet). */
export function writeFrameDom(slug: string | undefined, prop: string, box: FrameNode, value: string | number | undefined) {
  if (value === undefined) return;
  if (prop === FRAME_OPACITY) return frameStyle(box, "opacity", String(Math.min(100, Math.max(0, Number(value))) / 100));
  if (slug === "text" && prop === "text") {
    const el = slot(box, "text");
    if (el) frameText(el, String(value));
    return;
  }
  if (slug === "stat-bar" && prop === "value") {
    const n = Number(value);
    const track = slot(box, "stat-bar-track");
    const max = Math.max(1, Number(track?.getAttribute("aria-valuemax") ?? 100) || 100);
    const share = Math.min(100, Math.max(0, (n / max) * 100));
    if (track) setAttr(track, "aria-valuenow", String(Math.round(n)));
    const fill = slot(box, "stat-bar-fill");
    if (fill) frameStyle(fill, "width", `${share}%`);
    const words = slot(box, "stat-bar-value");
    if (words) frameText(words, `${Math.round(n)}/${Math.round(max)}`);
  }
}
