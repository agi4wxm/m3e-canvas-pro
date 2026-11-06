/* Words edited where they stand, as in Figma: a double-click on a text atom (or on a part whose words are a prop of it,
 * a button's label) opens a field over it in the part's own type; Enter or a click away keeps what was typed, as one
 * undo step, and Escape lets it go. */

import { useState } from "react";
import { partBySlug, reader } from "@/parts/registry";
import type { Item } from "@/lib/tokens";
import type { PropDef } from "@/parts/types";
import { ops, type DocStore, type Op, type TxOptions } from "@/lib/core";

/** what is being edited: the part, the prop its words are, what they say, where it is drawn and in what type */
export type TextEdit = { itemId: string; key: string; value: string; multiline: boolean; rect: { l: number; t: number; r: number; b: number }; font: React.CSSProperties };

/** the props whose words read as a part's own, in the order they are looked for */
const FIRST = ["text", "label", "title", "headline", "value", "placeholder"];

/** the prop a part's words are, when it has one on show: the text of a text atom, a button's label */
export function textPropOf(it: Item): PropDef | undefined {
  const def = partBySlug(it.component);
  if (!def) return undefined;
  const values = reader(def, it.props);
  const shown = def.props.filter((d) => d.kind === "text" && (!d.when || d.when(values)));
  return FIRST.map((k) => shown.find((d) => d.key === k)).find(Boolean) ?? shown[0];
}

/** the type the words of a part are drawn in, read off the canvas: what the field over them is set in */
function fontOf(itemId: string): React.CSSProperties {
  const node = document.querySelector(`[data-node="${CSS.escape(itemId)}"]`);
  const words = node && [...node.querySelectorAll<HTMLElement>("*")].find((el) => [...el.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim()));
  if (!words) return {};
  const cs = getComputedStyle(words);
  return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight as React.CSSProperties["fontWeight"], lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, color: cs.color, textAlign: cs.textAlign as React.CSSProperties["textAlign"] };
}

export type TextEditInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
  itemRects: () => { id: string; l: number; t: number; r: number; b: number }[];
};

export function useTextEdit({ store, runOp, itemRects }: TextEditInputs) {
  const [edit, setEdit] = useState<TextEdit | null>(null);
  /** opens the field over a part's words; false when it has none to edit, or is locked */
  const startTextEdit = (itemId: string): boolean => {
    const g = store.get().doc.groups.find((x) => x.items.some((it) => it.id === itemId));
    const it = g?.items.find((x) => x.id === itemId);
    if (!g || !it || g.locked || g.instanceOf) return false;
    const d = textPropOf(it);
    const rect = itemRects().find((r) => r.id === itemId);
    if (!d || d.kind !== "text" || !rect) return false;
    const def = partBySlug(it.component)!;
    setEdit({ itemId, key: d.key, value: reader(def, it.props).s(d.key), multiline: !!d.multiline, rect, font: fontOf(itemId) });
    return true;
  };
  /** what was typed kept, as one step */
  const commitTextEdit = (value: string) => {
    const e = edit;
    setEdit(null);
    if (!e || value === e.value) return;
    runOp(ops.setProps, { id: e.itemId, props: { [e.key]: value } }, { history: "step", label: "Edit text" });
  };
  const cancelTextEdit = () => setEdit(null);
  return { textEdit: edit, startTextEdit, commitTextEdit, cancelTextEdit };
}
