/* The operation that sets a screen's keyboard and gamepad focus (lib/focus, docs/焦点与输入.md): where the focus starts,
 * what cancel runs there, whether directions wrap round, and, per part, whether it takes the focus and where each
 * direction goes from it over what the layout gives. One undo step, and through OPS a tool of the in-app AI and of MCP. */

import { frameOfPart, type Frame, type Group, type Item } from "../../tokens";
import { FOCUS_DIRS, FOCUS_NONE, type FocusDir, type FrameFocus, type ItemFocus } from "../../focus/model";
import { focusMap, type FocusMap } from "../../focus/design";
import { op, OpError, S } from "../op";
import { withFrames, withGroups, type CoreState } from "../state";
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
