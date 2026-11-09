/* What a file may say about the focus (lib/focus/model.ts), cleaned as it is read (lib/project.ts): a field of the wrong
 * kind goes, an id is only ever an id (words of a sane length), and nothing else the file put there is kept as focus. */

import { FOCUS_DIRS, type FrameFocus, type ItemFocus } from "./model";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : undefined);

/** a part's focus (`Item.focus`), or nothing when nothing of it holds */
export function cleanItemFocus(v: unknown): ItemFocus | undefined {
  if (!isRecord(v)) return undefined;
  const out: ItemFocus = {};
  if (typeof v.focusable === "boolean") out.focusable = v.focusable;
  if (isRecord(v.next)) {
    const next: NonNullable<ItemFocus["next"]> = {};
    for (const d of FOCUS_DIRS) {
      const to = id(v.next[d]);
      if (to) next[d] = to;
    }
    if (Object.keys(next).length) out.next = next;
  }
  return Object.keys(out).length ? out : undefined;
}

/** a screen's focus (`Frame.focus`), or nothing when nothing of it holds */
export function cleanFrameFocus(v: unknown): FrameFocus | undefined {
  if (!isRecord(v)) return undefined;
  const out: FrameFocus = {};
  const first = id(v.first);
  if (first) out.first = first;
  const cancel = id(v.cancel);
  if (cancel) out.cancel = cancel;
  if (v.wrap === true) out.wrap = true;
  return Object.keys(out).length ? out : undefined;
}
