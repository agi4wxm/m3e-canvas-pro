/* The gamepads a browser sees (the Gamepad API, w3.org/TR/gamepad), read as UI actions: the d-pad and the left stick move
 * the focus, the bottom face button confirms, the right one cancels (lib/focus/model.ts `UI_BINDINGS`). A browser only
 * says where each button and stick is now, so this polls: it is handed what the pads say each frame and gives back the
 * actions pressed since the last, a direction held repeating as a key held does. No DOM, no imports beyond the model. */

import { UI_ACTIONS, UI_BINDINGS, padKindOf, type PadKind, type UiAction } from "./model";

/** what the poller reads of a pad: the Gamepad API's own shape, as far as it is read */
export type PadState = { id: string; connected?: boolean; mapping?: string; buttons: readonly { pressed: boolean; value?: number }[]; axes: readonly number[] };

/** how far a stick has to be pushed to count as pressed, and back under which it counts as let go */
export const STICK_ON = 0.5;
export const STICK_OFF = 0.35;
/** a direction held repeats after this long, then at this pace */
export const REPEAT_AFTER_MS = 400;
export const REPEAT_EVERY_MS = 120;

/** whether one binding of the standard mapping is held on a pad: a button (`pad:N`) or the left stick (`stick:+x`) */
function held(pad: PadState, key: string, was: boolean): boolean {
  const button = /^pad:(\d+)$/.exec(key);
  if (button) {
    const b = pad.buttons[Number(button[1])];
    return !!b && (b.pressed || (b.value ?? 0) > STICK_ON);
  }
  const stick = /^stick:([+-])([xy])$/.exec(key);
  if (stick) {
    const v = pad.axes[stick[2] === "x" ? 0 : 1] ?? 0;
    const signed = stick[1] === "+" ? v : -v;
    /* once pushed it stays pushed until it comes back past the lower mark, so a stick at the edge does not flicker */
    return signed > (was ? STICK_OFF : STICK_ON);
  }
  return false;
}

/** Reads pads frame by frame. `poll(pads, now)` gives the UI actions that started (or repeat) at `now`, and the family of
 *  the pad they came from, for the hints. */
export class PadReader {
  private down = new Map<string, { since: number; last: number }>();

  poll(pads: readonly (PadState | null | undefined)[], now: number): { actions: UiAction[]; pad?: PadKind } {
    const actions: UiAction[] = [];
    let pad: PadKind | undefined;
    const seen = new Set<string>();
    pads.forEach((p, i) => {
      if (!p || p.connected === false) return;
      for (const a of UI_ACTIONS) {
        const id = `${i}:${a}`;
        const was = this.down.get(id);
        const on = UI_BINDINGS[a].gamepad.some((k) => held(p, k, !!was));
        if (!on) continue;
        seen.add(id);
        if (!was) {
          this.down.set(id, { since: now, last: now });
          actions.push(a);
          pad = padKindOf(p.id);
          continue;
        }
        /* confirm and cancel do not repeat: holding A presses once */
        const moves = a !== "confirm" && a !== "cancel";
        if (moves && now - was.since >= REPEAT_AFTER_MS && now - was.last >= REPEAT_EVERY_MS) {
          was.last = now;
          actions.push(a);
          pad = padKindOf(p.id);
        }
      }
    });
    for (const id of this.down.keys()) if (!seen.has(id)) this.down.delete(id);
    return { actions, ...(pad ? { pad } : {}) };
  }
}
