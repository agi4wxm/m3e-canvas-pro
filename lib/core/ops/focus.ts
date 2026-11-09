/* The operations that set a screen's keyboard and gamepad focus, and the keys and buttons that drive the input actions
 * (`set_input_keys`, `Doc.inputs`). The first sets (lib/focus, docs/焦点与输入.md): where the focus starts,
 * what cancel runs there, whether directions wrap round, and, per part, whether it takes the focus and where each
 * direction goes from it over what the layout gives. One undo step, and through OPS a tool of the in-app AI and of MCP. */

import { frameOfPart, type Frame, type Group, type Item } from "../../tokens";
import { FOCUS_DIRS, FOCUS_NONE, UI_ACTIONS, type FocusDir, type FrameFocus, type ItemFocus, type UiAction } from "../../focus/model";
import { declaredInputs, focusMap, inputTable, type FocusMap } from "../../focus/design";
import { PAD_DIRECTIONS, keyName, type DirKeys, type InputBinding, type InputMap } from "../../focus/inputs";
import { cleanInputMap } from "../../focus/clean";
import { op, OpError, S } from "../op";
import { withDoc, withFrames, withGroups, type CoreState } from "../state";
import { frameById } from "./common";

type PartFocusArgs = { focusable?: boolean | null; next?: Partial<Record<FocusDir, string | null>> | null } | null;

export type SetFocusArgs = { screen: string; first?: string | null; cancel?: string | null; wrap?: boolean | null; parts?: Record<string, PartFocusArgs> };

/** the parts standing on a screen, by id */
function partsOn(s: CoreState, f: Frame, widths: Record<string, number>): Map<string, Item> {
  const on = (g: Group) => frameOfPart(g, s.doc.groups, s.doc.frames, widths)?.id === f.id;
  return new Map(s.doc.groups.filter(on).flatMap((g) => g.items.map((it) => [it.id, it] as const)));
}

export const setFocus = op<SetFocusArgs, FocusMap>({
  name: "set_focus",
  summary:
    "Sets how a keyboard's or a gamepad's focus moves over a screen (arrow keys or the d-pad move it, Enter / Space / A runs the focused part's tap, Escape / Backspace / B cancels: closes what is open, else goes back). first: the part the focus starts on (else the first in reading order); cancel: a part whose tap cancel runs on this screen before going back (a pause or menu button); wrap: directions with nothing beyond go round. parts: by part id, focusable (false: never takes it though it has a tap; true: takes it though it has none) and next {up|down|left|right: a part's id on the screen, or \"none\"} over the nearest one the layout gives. null clears a field. Returns the screen's focus map: each part that takes the focus in reading order, where each direction goes from it.",
  args: S.obj(
    {
      screen: S.str(),
      first: { type: ["string", "null"], description: "a part's id on the screen" },
      cancel: { type: ["string", "null"], description: "a part's id on the screen" },
      wrap: { type: ["boolean", "null"] },
      parts: { type: "object", description: "by part id: {focusable?: boolean | null, next?: {up?, down?, left?, right?: part id | \"none\" | null} | null}, or null to clear the part's focus" },
    },
    ["screen"],
  ),
  label: () => "Focus",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const parts = partsOn(s, f, ctx.widths);
    const onScreen = (id: unknown, what: string) => {
      if (typeof id !== "string" || !parts.has(id)) throw new OpError("not_found", `${what}: ${JSON.stringify(id)} is no part on the screen ${JSON.stringify(f.name)}${parts.size ? "" : " (it has no parts)"}; get_outline lists its parts.`, what);
      return id;
    };
    const focus: FrameFocus = { ...f.focus };
    for (const key of ["first", "cancel"] as const) {
      if (a[key] === null) delete focus[key];
      else if (a[key] !== undefined) focus[key] = onScreen(a[key], key);
    }
    if (a.wrap === null || a.wrap === false) delete focus.wrap;
    else if (a.wrap === true) focus.wrap = true;
    else if (a.wrap !== undefined) throw new OpError("invalid_value", "wrap should be true, false or null.", "wrap");

    const changed = new Map<string, ItemFocus | undefined>();
    for (const [id, p] of Object.entries(a.parts ?? {})) {
      const it = parts.get(onScreen(id, `parts.${id}`) as string)!;
      if (p === null) {
        changed.set(id, undefined);
        continue;
      }
      if (typeof p !== "object" || Array.isArray(p)) throw new OpError("invalid_value", `parts.${id} should be {focusable?, next?} or null.`, id);
      const own: ItemFocus = { ...it.focus };
      if (p.focusable === null) delete own.focusable;
      else if (typeof p.focusable === "boolean") own.focusable = p.focusable;
      else if (p.focusable !== undefined) throw new OpError("invalid_value", `parts.${id}.focusable should be true, false or null.`, id);
      if (p.next === null) delete own.next;
      else if (p.next !== undefined) {
        if (typeof p.next !== "object" || Array.isArray(p.next)) throw new OpError("invalid_value", `parts.${id}.next should be {up|down|left|right: part id | "none" | null}.`, id);
        const next = { ...own.next };
        for (const [d, to] of Object.entries(p.next)) {
          if (!(FOCUS_DIRS as readonly string[]).includes(d)) throw new OpError("invalid_value", `parts.${id}.next.${d}: a direction is up, down, left or right.`, d);
          if (to === null) delete next[d as FocusDir];
          else if (to === FOCUS_NONE) next[d as FocusDir] = FOCUS_NONE;
          else if (to === id) throw new OpError("invalid_value", `parts.${id}.next.${d}: a part cannot lead to itself ("none" stays put).`, d);
          else next[d as FocusDir] = onScreen(to, `parts.${id}.next.${d}`);
        }
        if (Object.keys(next).length) own.next = next;
        else delete own.next;
      }
      changed.set(id, Object.keys(own).length ? own : undefined);
    }

    const frame: Frame = { ...f };
    if (Object.keys(focus).length) frame.focus = focus;
    else delete frame.focus;
    let state = withFrames(s, s.doc.frames.map((x) => (x.id === f.id ? frame : x)));
    if (changed.size) {
      state = withGroups(
        state,
        state.doc.groups.map((g) =>
          g.items.some((it) => changed.has(it.id))
            ? {
                ...g,
                items: g.items.map((it) => {
                  if (!changed.has(it.id)) return it;
                  const own = changed.get(it.id);
                  const { focus: _was, ...rest } = it;
                  return own ? { ...rest, focus: own } : rest;
                }),
              }
            : g,
        ),
      );
    }
    return { state, result: focusMap(state.doc, frame, ctx.widths) };
  },
});

type KeysArg = string[] | Partial<Record<FocusDir, string[]>> | null;

export const setInputKeys = op<{ action: string; keys?: KeysArg; pad?: string[] | null }, { actions: ReturnType<typeof inputTable> }>({
  name: "set_input_keys",
  summary:
    "Sets the keyboard keys and gamepad buttons that drive an input action: one a world view declares (its inputs, \"move: vec2, attack: bool\"; a direction takes keys {up, down, left, right: [keys]} and pad stick:left, stick:right or dpad; a button takes keys [keys] and pad [pad:0 the bottom face button (A, ✕), pad:2 X, pad:3 Y, pad:4/5 the shoulders, pad:6/7 the triggers]), or a UI action (up, down, left, right, confirm, cancel: keys are what the keyboard's keys are named, \"ArrowUp\", \"Enter\", \" \", \"w\"; pad is pad:N or stick:±x/±y). Keys are KeyboardEvent.key names, a letter in small. null puts the default back (WASD and the arrows and the left stick for the first direction, Space or J and A for the first button, then K and X, L and Y…). Keys and buttons drive the world while its screen has nothing laid over it; a menu or a dialog takes them back for the focus and lets go of what the world held. Returns every declared action as it is driven, with its hint per device (what {{input.hint.<action>}} shows).",
  args: S.obj(
    {
      action: S.str("an input action a world view declares, or a UI action"),
      keys: { type: ["array", "object", "null"], description: "a button's keys, or a direction's {up, down, left, right}; null for the default" },
      pad: { type: ["array", "null"], items: { type: "string" }, description: "gamepad buttons or sticks; null for the default" },
    },
    ["action"],
  ),
  label: () => "Input keys",
  run(s, a) {
    const map: InputMap = { ...s.doc.inputs };
    const keyList = (v: unknown, what: string): string[] => {
      if (!Array.isArray(v) || !v.every((k) => typeof k === "string" && k.length > 0 && k.length <= 24)) throw new OpError("invalid_value", `${what} should be a list of key names ("w", "ArrowUp", " ", "Enter").`, what);
      return [...new Set((v as string[]).map(keyName))].slice(0, 8);
    };
    if ((UI_ACTIONS as readonly string[]).includes(a.action)) {
      const ui = { ...map.ui };
      const own = { ...ui[a.action as UiAction] };
      if (a.keys === null) delete own.keyboard;
      else if (a.keys !== undefined) own.keyboard = keyList(a.keys, "keys");
      if (a.pad === null) delete own.gamepad;
      else if (a.pad !== undefined) {
        const pad = keyList(a.pad, "pad");
        if (!pad.every((k) => /^pad:\d{1,2}$|^stick:[+-][xy]$/.test(k))) throw new OpError("invalid_value", "A UI action's pad is pad:N (a button of the standard mapping) or stick:+x, stick:-x, stick:+y, stick:-y.", "pad");
        own.gamepad = pad;
      }
      if (Object.keys(own).length) ui[a.action as UiAction] = own;
      else delete ui[a.action as UiAction];
      map.ui = Object.keys(ui).length ? ui : undefined;
    } else {
      const decl = declaredInputs(s.doc).decls.find((d) => d.name === a.action);
      if (!decl) {
        const names = declaredInputs(s.doc).decls.map((d) => d.name);
        throw new OpError("not_found", `No world view declares an input action ${JSON.stringify(a.action)}${names.length ? ` (they declare ${names.join(", ")})` : " (there is no world view: add_part world-view, its inputs prop declares them)"}; the UI actions are ${UI_ACTIONS.join(", ")}.`, "action");
      }
      const dir = (decl.type ?? (decl.name === "move" ? "vec2" : "bool")) === "vec2";
      const actions = { ...map.actions };
      const own: InputBinding = { ...actions[a.action] };
      if (a.keys === null) delete own.keys;
      else if (a.keys !== undefined) {
        if (dir) {
          if (Array.isArray(a.keys) || typeof a.keys !== "object") throw new OpError("invalid_value", `${a.action} is a direction: its keys are {up, down, left, right: [keys]}.`, "keys");
          const d: DirKeys = {};
          for (const [k, v] of Object.entries(a.keys)) {
            if (!(FOCUS_DIRS as readonly string[]).includes(k)) throw new OpError("invalid_value", `keys.${k}: a direction is up, down, left or right.`, k);
            d[k as FocusDir] = keyList(v, `keys.${k}`);
          }
          own.keys = d;
        } else {
          if (!Array.isArray(a.keys)) throw new OpError("invalid_value", `${a.action} is a button: its keys are a list (["j", " "]).`, "keys");
          own.keys = keyList(a.keys, "keys");
        }
      }
      if (a.pad === null) delete own.pad;
      else if (a.pad !== undefined) {
        const pad = keyList(a.pad, "pad");
        const ok = dir ? pad.every((k) => (PAD_DIRECTIONS as readonly string[]).includes(k)) : pad.every((k) => /^pad:\d{1,2}$/.test(k));
        if (!ok) throw new OpError("invalid_value", dir ? `${a.action} is a direction: its pad is stick:left, stick:right or dpad.` : `${a.action} is a button: its pad is pad:N (pad:0 the bottom face button).`, "pad");
        own.pad = pad;
      }
      if (Object.keys(own).length) actions[a.action] = own;
      else delete actions[a.action];
      map.actions = Object.keys(actions).length ? actions : undefined;
    }
    const clean = cleanInputMap(map);
    const state = withDoc(s, { inputs: clean });
    return { state, result: { actions: inputTable(state.doc) } };
  },
});
