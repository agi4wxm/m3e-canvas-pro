/* What a file may say about the focus (lib/focus/model.ts), cleaned as it is read (lib/project.ts): a field of the wrong
 * kind goes, an id is only ever an id (words of a sane length), and nothing else the file put there is kept as focus. */

import { FOCUS_DIRS, UI_ACTIONS, type FrameFocus, type ItemFocus } from "./model";
import type { DirKeys, InputBinding, InputMap } from "./inputs";

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

/** what names an input action (lib/actions/model.ts `WORLD_ACTION`) */
const ACTION = /^[a-z][a-zA-Z0-9]{0,31}$/;
/** a key (`KeyboardEvent.key`, a few characters at most) or a button (`pad:0`, `stick:left`, `dpad`) */
const keyList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 24))].slice(0, 8);
  return out.length ? out : undefined;
};

function cleanBinding(v: unknown): InputBinding | undefined {
  if (!isRecord(v)) return undefined;
  const out: InputBinding = {};
  if (Array.isArray(v.keys)) {
    const keys = keyList(v.keys);
    if (keys) out.keys = keys;
  } else if (isRecord(v.keys)) {
    const dir: DirKeys = {};
    for (const d of FOCUS_DIRS) {
      const keys = keyList((v.keys as Record<string, unknown>)[d]);
      if (keys) dir[d] = keys;
    }
    if (Object.keys(dir).length) out.keys = dir;
  }
  const pad = keyList(v.pad)?.filter((k) => /^pad:\d{1,2}$|^stick:(left|right)$|^dpad$/.test(k));
  if (pad?.length) out.pad = pad;
  return Object.keys(out).length ? out : undefined;
}

/** the document's input map (`Doc.inputs`), or nothing when nothing of it holds */
export function cleanInputMap(v: unknown): InputMap | undefined {
  if (!isRecord(v)) return undefined;
  const out: InputMap = {};
  if (isRecord(v.actions)) {
    const actions: Record<string, InputBinding> = {};
    for (const [name, b] of Object.entries(v.actions).slice(0, 64)) {
      const clean = ACTION.test(name) ? cleanBinding(b) : undefined;
      if (clean) actions[name] = clean;
    }
    if (Object.keys(actions).length) out.actions = actions;
  }
  if (isRecord(v.ui)) {
    const ui: NonNullable<InputMap["ui"]> = {};
    for (const a of UI_ACTIONS) {
      const b = (v.ui as Record<string, unknown>)[a];
      if (!isRecord(b)) continue;
      const keyboard = keyList(b.keyboard);
      const gamepad = keyList(b.gamepad)?.filter((k) => /^pad:\d{1,2}$|^stick:[+-][xy]$/.test(k));
      if (keyboard || gamepad?.length) ui[a] = { ...(keyboard ? { keyboard } : {}), ...(gamepad?.length ? { gamepad } : {}) };
    }
    if (Object.keys(ui).length) out.ui = ui;
  }
  return Object.keys(out).length ? out : undefined;
}
