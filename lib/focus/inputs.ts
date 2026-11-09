/* The input-action → key and button table (`Doc.inputs`, docs/焦点与输入.md “输入映射”): the keys and gamepad buttons
 * that drive a world's declared input actions (a world view's `inputs`: `move: vec2`, `attack: bool`, lib/world/types.ts),
 * beside the UI actions' own (`UI_BINDINGS`, lib/focus/model.ts), which the table may change too. A direction (`vec2`) is
 * driven by four sets of keys (WASD and the arrows by default) or a stick or the d-pad, a button (`bool`) by keys or a
 * gamepad's buttons; each press is sent as the design's own `press` and `release` and each change of direction as its
 * `move` are (lib/world/channel.ts). Plain types and functions with no imports beyond the model, copied into an exported
 * app as it is. */

import { UI_ACTIONS, UI_BINDINGS, keyWords, type InputDevice, type InputKey, type PadKind, type UiAction } from "./model";

/** the keys of each way a direction is pushed */
export type DirKeys = { up?: InputKey[]; down?: InputKey[]; left?: InputKey[]; right?: InputKey[] };

/** What drives one action: keys of the keyboard (four sets for a direction, a list for a button), and of a gamepad its
 *  buttons (`pad:0`) for a button, `stick:left`, `stick:right` or `dpad` for a direction. */
export type InputBinding = { keys?: InputKey[] | DirKeys; pad?: InputKey[] };

/** `Doc.inputs`: the table, by the action's name (a world's input action, as its world view declares it), and the UI
 *  actions' own keys over the defaults (`ui`) */
export type InputMap = { actions?: Record<string, InputBinding>; ui?: Partial<Record<UiAction, { keyboard?: InputKey[]; gamepad?: InputKey[] }>> };

/** an action as it is driven: its name, its type, and the keys and buttons on it */
export type DrivenAction = { name: string; type: "vec2" | "bool"; keys: InputKey[] | DirKeys; pad: InputKey[] };

/** the keys of the directions a gamepad's direction can be on */
export const PAD_DIRECTIONS = ["stick:left", "stick:right", "dpad"] as const;

/** a direction's default keys, by how many directions came before it: WASD and the arrows, then IJKL */
const DIR_DEFAULTS: { keys: DirKeys; pad: InputKey[] }[] = [
  { keys: { up: ["w", "ArrowUp"], down: ["s", "ArrowDown"], left: ["a", "ArrowLeft"], right: ["d", "ArrowRight"] }, pad: ["stick:left", "dpad"] },
  { keys: { up: ["i"], down: ["k"], left: ["j"], right: ["l"] }, pad: ["stick:right"] },
];
/** a button's default keys and buttons, by how many buttons came before it: Space, then J, K, L, U, I, O; A, X, Y, the
 *  shoulders and the triggers (B stays cancel, Start and Back the menus') */
const BOOL_KEYS: InputKey[][] = [[" ", "j"], ["k"], ["l"], ["u"], ["i"], ["o"]];
const BOOL_PAD: InputKey[][] = [["pad:0"], ["pad:2"], ["pad:3"], ["pad:5"], ["pad:4"], ["pad:7"], ["pad:6"]];

const isDir = (k: InputBinding["keys"]): k is DirKeys => !!k && !Array.isArray(k);

/** The actions as they are driven: each declared action (a direction when it says `vec2`, or when it is named `move` and
 *  says nothing), with the table's keys and buttons where it gives them, else the defaults in turn. */
export function drivenActions(decls: readonly { name: string; type?: "vec2" | "bool" }[], map?: InputMap): DrivenAction[] {
  let dirs = 0;
  let bools = 0;
  return decls.map((d) => {
    const type: "vec2" | "bool" = d.type ?? (d.name === "move" ? "vec2" : "bool");
    const own = map?.actions?.[d.name];
    if (type === "vec2") {
      const base = DIR_DEFAULTS[dirs++] ?? { keys: {}, pad: [] };
      return { name: d.name, type, keys: own?.keys && isDir(own.keys) ? own.keys : base.keys, pad: own?.pad ?? base.pad };
    }
    const i = bools++;
    return { name: d.name, type, keys: own?.keys && Array.isArray(own.keys) ? own.keys : (BOOL_KEYS[i] ?? []), pad: own?.pad ?? BOOL_PAD[i] ?? [] };
  });
}

/** the UI actions' keys, the table's over the defaults */
export function uiBindings(map?: InputMap): typeof UI_BINDINGS {
  if (!map?.ui) return UI_BINDINGS;
  return Object.fromEntries(UI_ACTIONS.map((a) => [a, { keyboard: map.ui?.[a]?.keyboard ?? UI_BINDINGS[a].keyboard, gamepad: map.ui?.[a]?.gamepad ?? UI_BINDINGS[a].gamepad }])) as typeof UI_BINDINGS;
}

/** a key as the table names it: a letter in small, any other key as the browser names it (`ArrowUp`, `" "`) */
export const keyName = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

/** every key a set of actions is on */
export function keysOf(actions: readonly DrivenAction[]): Set<string> {
  const out = new Set<string>();
  for (const a of actions) for (const k of isDir(a.keys) ? Object.values(a.keys).flat() : a.keys) out.add(keyName(k));
  return out;
}

/** a direction held as a unit vector, or the middle */
function toward(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** what an action holds: a direction, or a button held */
export type HeldValue = { x: number; y: number } | boolean;
const same = (a: HeldValue | undefined, b: HeldValue) => (typeof b === "boolean" ? a === b : typeof a === "object" && Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02);
const neutral = (v: HeldValue) => (typeof v === "boolean" ? !v : v.x === 0 && v.y === 0);

/** what a gamepad says, as far as this reads it (the Gamepad API's shape) */
export type PadSnapshot = { buttons: readonly { pressed: boolean; value?: number }[]; axes: readonly number[] };

/** a stick pushed less than this is in the middle */
const DEAD_ZONE = 0.2;

/** Turns keys held and gamepads into the actions' values, and says only what changed (each change one input to send). */
export class ActionReader {
  private keys = new Set<string>();
  private sent = new Map<string, HeldValue>();

  /** a key went down or up: the changes it makes to the actions it is on */
  key(actions: readonly DrivenAction[], key: string, down: boolean): { action: string; value: HeldValue }[] {
    const k = keyName(key);
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    return this.read(actions, null);
  }

  /** the pads now: the changes they make (the keys held count too) */
  pads(actions: readonly DrivenAction[], pads: readonly (PadSnapshot | null | undefined)[]): { action: string; value: HeldValue }[] {
    return this.read(actions, pads);
  }

  private lastPads: readonly (PadSnapshot | null | undefined)[] = [];

  private read(actions: readonly DrivenAction[], pads: readonly (PadSnapshot | null | undefined)[] | null): { action: string; value: HeldValue }[] {
    if (pads) this.lastPads = pads;
    const live = this.lastPads.filter((p): p is PadSnapshot => !!p);
    const out: { action: string; value: HeldValue }[] = [];
    for (const a of actions) {
      let value: HeldValue;
      if (a.type === "vec2") {
        const d = isDir(a.keys) ? a.keys : {};
        const on = (ks?: InputKey[]) => (ks ?? []).some((k) => this.keys.has(keyName(k)));
        let x = (on(d.right) ? 1 : 0) - (on(d.left) ? 1 : 0);
        let y = (on(d.down) ? 1 : 0) - (on(d.up) ? 1 : 0);
        for (const p of live)
          for (const src of a.pad) {
            if (src === "dpad") {
              const b = (i: number) => !!p.buttons[i]?.pressed;
              x += (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
              y += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
            } else if (src === "stick:left" || src === "stick:right") {
              const at = src === "stick:left" ? 0 : 2;
              const sx = p.axes[at] ?? 0;
              const sy = p.axes[at + 1] ?? 0;
              if (Math.hypot(sx, sy) > DEAD_ZONE) {
                x += sx;
                y += sy;
              }
            }
          }
        const v = toward(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
        value = { x: Math.round(v.x * 100) / 100 || 0, y: Math.round(v.y * 100) / 100 || 0 };
      } else {
        const keys = Array.isArray(a.keys) ? a.keys : [];
        value = keys.some((k) => this.keys.has(keyName(k))) || live.some((p) => a.pad.some((src) => { const m = /^pad:(\d+)$/.exec(src); return !!m && !!p.buttons[Number(m[1])]?.pressed; }));
      }
      const was = this.sent.get(a.name);
      if (was === undefined ? neutral(value) : same(was, value)) continue;
      this.sent.set(a.name, value);
      out.push({ action: a.name, value });
    }
    return out;
  }

  /** Lets go of everything (an overlay opened over the world, the page lost the keyboard): each action that holds
   *  something goes back to the middle or is let go, and the keys held are forgotten. */
  release(): { action: string; value: HeldValue }[] {
    this.keys.clear();
    this.lastPads = [];
    const out: { action: string; value: HeldValue }[] = [];
    for (const [action, v] of this.sent) if (!neutral(v)) out.push({ action, value: typeof v === "boolean" ? false : { x: 0, y: 0 } });
    this.sent.clear();
    return out;
  }
}

const PAD_DIR_WORDS: Record<string, string> = { "stick:left": "L", "stick:right": "R", dpad: "✚" };

/** The hint for a world's action on a device: `WASD`, `↑↓←→`, `Space`, `A`, `L` (a stick), "" for touch, where the screen's
 *  own controls drive it. */
export function actionHint(a: DrivenAction, device: InputDevice, pad: PadKind = "generic"): string {
  if (device === "touch") return "";
  if (device === "gamepad") return a.pad.length ? (PAD_DIR_WORDS[a.pad[0]] ?? keyWords(a.pad[0], pad)) : "";
  if (isDir(a.keys)) {
    const first = (["up", "left", "down", "right"] as const).map((d) => a.keys && isDir(a.keys) ? a.keys[d]?.[0] : undefined);
    if (first.every((k) => k && k.length === 1)) return first.join("").toUpperCase();
    return (["up", "down", "left", "right"] as const).map((d) => (isDir(a.keys) && a.keys[d]?.[0] ? keyWords(a.keys[d]![0]) : "")).join("");
  }
  const k = a.keys[0];
  return k ? (k.length === 1 && k !== " " ? k.toUpperCase() : keyWords(k)) : "";
}
