/* Moving a focus over a designed screen with a keyboard or a gamepad, as data and rules no platform owns (docs/焦点与输入.md):
 * which parts take the focus, where it starts on a screen, where each direction takes it (worked out from where the parts
 * stand, with the author's own overrides kept in the document), what confirm and cancel do, and how an overlay holds the
 * focus while it is open and gives it back when it closes. The same rules drive the editor's preview, the exported web
 * app, and the data printed for the phone app and the engines (Godot's focus neighbours, batch 9 P8).
 *
 * Plain types and functions with no imports, so the file can be copied into an exported app as it is (as lib/actions is).
 * The input actions a world takes (`move: vec2`, `attack: bool`, lib/world) are another set of names: a table that maps
 * keys and buttons to both kinds of action can be laid beside `UI_BINDINGS` here without changing what is below. */

/** the four ways the focus moves */
export const FOCUS_DIRS = ["up", "down", "left", "right"] as const;
export type FocusDir = (typeof FOCUS_DIRS)[number];

/** What a visitor does to a focused interface: move the focus, confirm (the focused part's tap), cancel (close what is
 *  open, else go back). The names an engine's own UI actions are made from (Godot's `ui_up`, `ui_accept`, `ui_cancel`). */
export const UI_ACTIONS = [...FOCUS_DIRS, "confirm", "cancel"] as const;
export type UiAction = (typeof UI_ACTIONS)[number];

/** the target `next` names to say a direction goes nowhere from this part */
export const FOCUS_NONE = "none";

/** What a part says about the focus, over what its layout and its taps give (`Item.focus`). */
export type ItemFocus = {
  /** false: never takes the focus, though it does something (a tap on a picture that only repeats a button beside it);
   *  true: takes it though it does nothing of its own (a card to read on a television) */
  focusable?: boolean;
  /** where each direction goes from it: a part (item id) on the same screen over the nearest one the layout gives,
   *  or "none" for nowhere */
  next?: Partial<Record<FocusDir, string>>;
};

/** What a screen says about the focus (`Frame.focus`). */
export type FrameFocus = {
  /** the part (item id) the focus starts on when the screen comes on show; else the first that takes it, in reading
   *  order (top to bottom, then left to right) */
  first?: string;
  /** The part (item id) whose tap cancel runs on this screen, before going back: a pause button on a battle screen,
   *  the "No" of a question laid over another. Without one, cancel closes what is open or goes back. */
  cancel?: string;
  /** a direction with nothing beyond goes round to the far side of the screen */
  wrap?: boolean;
};

/** where a thing stands, in any one space (a screen's pixels, the window's) */
export type Box = { x: number; y: number; w: number; h: number };

/** Something the focus can be on: a part, or one place of a part (a tab of a bar, an entry of a menu). `key` tells it
 *  from every other on the layer; `part` is the item id overrides are kept under (a place of a part shares its part's). */
export type FocusTarget = { key: string; part?: string; box: Box };

/** the most targets a layer is read with: past it the rest are left out, so a hostile screen cannot make a move slow */
export const MAX_TARGETS = 400;

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

/** the gap between two runs along one axis, 0 where they overlap */
const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, b0 - a1, a0 - b1);

/** Reading order: top to bottom, and left to right along what stands in one row (boxes that share most of their
 *  height). The order the first focus and a wrap go by. */
export function readingOrder<T extends { box: Box }>(targets: readonly T[]): T[] {
  const rows: { top: number; bottom: number; items: T[] }[] = [];
  for (const t of [...targets].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const row = rows.find((r) => {
      const overlap = Math.min(r.bottom, t.box.y + t.box.h) - Math.max(r.top, t.box.y);
      return overlap > Math.min(r.bottom - r.top, t.box.h) / 2;
    });
    if (row) {
      row.items.push(t);
      row.top = Math.min(row.top, t.box.y);
      row.bottom = Math.max(row.bottom, t.box.y + t.box.h);
    } else rows.push({ top: t.box.y, bottom: t.box.y + t.box.h, items: [t] });
  }
  return rows.sort((a, b) => a.top - b.top).flatMap((r) => r.items.sort((a, b) => a.box.x - b.box.x));
}

/** How far a target is from another in a direction, or null when it is not that way at all. The distance along the
 *  direction counts once, and how far it stands off the line twice: the next of a row before the one below it. */
export function distanceTo(from: Box, to: Box, dir: FocusDir): number | null {
  const along = dir === "up" ? cy(from) - cy(to) : dir === "down" ? cy(to) - cy(from) : dir === "left" ? cx(from) - cx(to) : cx(to) - cx(from);
  /* its middle has to be past this one's, by more than a rounding */
  if (along <= 0.5) return null;
  const vertical = dir === "up" || dir === "down";
  const primary = vertical ? (dir === "down" ? Math.max(0, to.y - (from.y + from.h)) : Math.max(0, from.y - (to.y + to.h))) : dir === "right" ? Math.max(0, to.x - (from.x + from.w)) : Math.max(0, from.x - (to.x + to.w));
  const off = vertical ? gap(from.x, from.x + from.w, to.x, to.x + to.w) : gap(from.y, from.y + from.h, to.y, to.y + to.h);
  /* the distance between the middles across breaks a tie between two equally near */
  const across = vertical ? Math.abs(cx(to) - cx(from)) : Math.abs(cy(to) - cy(from));
  return primary + off * 2 + across * 0.001;
}

/** the target a direction lands on by where things stand: the nearest that way; with `wrap`, the farthest the other way
 *  that stands most in line, when nothing is that way */
export function nearestTo(targets: readonly FocusTarget[], from: FocusTarget, dir: FocusDir, wrap = false): FocusTarget | null {
  let best: FocusTarget | null = null;
  let score = Infinity;
  for (const t of targets) {
    if (t.key === from.key) continue;
    const d = distanceTo(from.box, t.box, dir);
    if (d !== null && d < score) {
      score = d;
      best = t;
    }
  }
  if (best || !wrap) return best;
  /* round to the far side: in line first, then the farthest along */
  const vertical = dir === "up" || dir === "down";
  const far = (t: FocusTarget) => (dir === "down" ? cy(t.box) : dir === "up" ? -cy(t.box) : dir === "right" ? cx(t.box) : -cx(t.box));
  const off = (t: FocusTarget) => (vertical ? gap(from.box.x, from.box.x + from.box.w, t.box.x, t.box.x + t.box.w) : gap(from.box.y, from.box.y + from.box.h, t.box.y, t.box.y + t.box.h));
  for (const t of targets) {
    if (t.key === from.key) continue;
    const s = off(t) * 1e6 + far(t);
    if (s < score) {
      score = s;
      best = t;
    }
  }
  return best;
}

/** the targets a part's id names: the part itself, or its places in reading order */
const ofPart = (targets: readonly FocusTarget[], part: string) => readingOrder(targets.filter((t) => t.part === part || baseId(t.part) === part));

/** The id a part's copy is kept under in the document: a repeated row's copy (`host#2/part`) and a part of an instance
 *  (`inst/part`) are the part they were drawn from. */
export const baseId = (id: string | undefined): string | undefined => (id === undefined ? undefined : id.slice(id.lastIndexOf("/") + 1));

/** What a layer of the interface is read as, to move over it: the targets on it, the screen's focus, the parts'. */
export type FocusLayer = {
  /** what tells it from the other layers on show: a screen at its depth in the history, an overlay, an open menu */
  key: string;
  targets: readonly FocusTarget[];
  screen?: FrameFocus;
  /** a part's own focus, by its item id (a copy reads the part it was drawn from) */
  part?: (id: string) => ItemFocus | undefined;
};

/** where a move from a target lands: the part's own `next` when it names one there is ("none" stays), else the nearest */
export function neighbourOf(layer: FocusLayer, fromKey: string, dir: FocusDir): string | null {
  const targets = layer.targets.slice(0, MAX_TARGETS);
  const from = targets.find((t) => t.key === fromKey);
  if (!from) return null;
  const own = from.part === undefined ? undefined : (layer.part?.(from.part) ?? layer.part?.(baseId(from.part)!));
  const named = own?.next?.[dir];
  if (named === FOCUS_NONE) return null;
  if (named) {
    const to = ofPart(targets, named).filter((t) => t.key !== from.key);
    if (to.length) return (nearestAmong(to, from, dir) ?? to[0]).key;
  }
  return nearestTo(targets, from, dir, !!layer.screen?.wrap)?.key ?? null;
}

/** of the targets named, the one nearest that way (a bar's tabs named as one part) */
const nearestAmong = (to: FocusTarget[], from: FocusTarget, dir: FocusDir) => (to.length > 1 ? nearestTo(to, from, dir) : to[0]);

/** where the focus starts on a layer: the screen's `first` when it is there, else the first in reading order */
export function firstOf(layer: FocusLayer): string | null {
  const targets = layer.targets.slice(0, MAX_TARGETS);
  const named = layer.screen?.first;
  if (named) {
    const t = ofPart(targets, named);
    if (t.length) return t[0].key;
  }
  return readingOrder(targets)[0]?.key ?? null;
}

/** what the focus is on, on which layer */
export type FocusAt = { layer: string; key: string };

/** What cancel comes to on the layer on top: the screen's own cancel part's tap when it is on the layer, else closing
 *  what is open (a menu, a dialog, a screen laid over) or going back, which the host does. */
export type CancelStep = { tap: string } | { dismiss: true };

export function cancelOf(layer: FocusLayer): CancelStep {
  const named = layer.screen?.cancel;
  const t = named ? ofPart(layer.targets, named) : [];
  return t.length ? { tap: t[0].key } : { dismiss: true };
}

/** A focus moving over the layers on show (pure: what is on show is handed to it each time). The top layer holds the
 *  focus: nothing under an open overlay can take it. Each layer remembers where its focus was, so when the overlay over
 *  it closes, or the visitor comes back to its screen, the focus is where it was left. A layer no longer on show is
 *  forgotten: a screen opened again starts afresh. */
export class FocusNav {
  private at: FocusAt | null = null;
  private kept = new Map<string, string>();

  /** where the focus is */
  get current(): FocusAt | null {
    return this.at;
  }

  /** The layers on show now, bottom first: the focus goes to the top one, where it was left on it, else to its first
   *  target. `under` names the layers not drawn now that will come back (the screens under the one on show, in the
   *  history): where the focus was on them is remembered too. Returns the key it is on (null on a layer with nothing
   *  to take it). */
  sync(layers: readonly FocusLayer[], under: readonly string[] = []): string | null {
    const top = layers[layers.length - 1];
    const live = new Set([...under, ...layers.map((l) => l.key)]);
    for (const k of this.kept.keys()) if (!live.has(k)) this.kept.delete(k);
    if (!top) {
      this.at = null;
      return null;
    }
    const has = (key: string | undefined) => !!key && top.targets.some((t) => t.key === key);
    if (this.at?.layer === top.key && has(this.at.key)) return this.at.key;
    const kept = this.kept.get(top.key);
    const key = has(kept) ? kept! : firstOf(top);
    this.at = key ? { layer: top.key, key } : null;
    if (key) this.kept.set(top.key, key);
    return key;
  }

  /** puts the focus on a target of the top layer (a tap or a press landed on it) */
  focus(layer: FocusLayer, key: string): void {
    if (!layer.targets.some((t) => t.key === key)) return;
    this.at = { layer: layer.key, key };
    this.kept.set(layer.key, key);
  }

  /** Moves the focus on the top layer; returns where it is now, the same key when nothing is that way. */
  move(layers: readonly FocusLayer[], dir: FocusDir, under: readonly string[] = []): string | null {
    const from = this.sync(layers, under);
    const top = layers[layers.length - 1];
    if (!from || !top) return from;
    const to = neighbourOf(top, from, dir);
    if (to) this.focus(top, to);
    return this.at?.key ?? null;
  }
}

/* ---------- input devices and their hints ---------- */

/** what the visitor is using now: the hints and the focus ring follow it (a pointer or a finger shows no ring) */
export type InputDevice = "keyboard" | "gamepad" | "touch";
export const INPUT_DEVICES: readonly InputDevice[] = ["keyboard", "gamepad", "touch"];

/** the family of a gamepad, for the words on its buttons: the face button at the bottom is A on one, ✕ on another */
export type PadKind = "xbox" | "playstation" | "nintendo" | "generic";

/** A key on a keyboard by its `KeyboardEvent.key`, a button of a gamepad by its place in the standard mapping
 *  (w3.org/TR/gamepad): `pad:0` the bottom face button, `pad:12` the d-pad's up; `stick:-y` the left stick pushed up. */
export type InputKey = string;

/** The keys and buttons the UI actions are on by default. A key map of the design (built on the declared input actions,
 *  after batch 5 K2) can lay its own over these per action. */
export const UI_BINDINGS: Record<UiAction, { keyboard: InputKey[]; gamepad: InputKey[] }> = {
  up: { keyboard: ["ArrowUp"], gamepad: ["pad:12", "stick:-y"] },
  down: { keyboard: ["ArrowDown"], gamepad: ["pad:13", "stick:+y"] },
  left: { keyboard: ["ArrowLeft"], gamepad: ["pad:14", "stick:-x"] },
  right: { keyboard: ["ArrowRight"], gamepad: ["pad:15", "stick:+x"] },
  confirm: { keyboard: ["Enter", " "], gamepad: ["pad:0"] },
  cancel: { keyboard: ["Escape", "Backspace"], gamepad: ["pad:1"] },
};

/** the UI action a keyboard key is, by the default bindings */
export function uiActionOfKey(key: string, bindings: typeof UI_BINDINGS = UI_BINDINGS): UiAction | null {
  for (const a of UI_ACTIONS) if (bindings[a].keyboard.includes(key)) return a;
  return null;
}

/** what a key says on its cap: the hint shown for it */
const KEY_WORDS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter", " ": "Space", Escape: "Esc", Backspace: "Backspace" };
/** what a gamepad's button says, by family: the standard mapping's face buttons and the d-pad */
const PAD_WORDS: Record<PadKind, Record<string, string>> = {
  xbox: { "pad:0": "A", "pad:1": "B", "pad:2": "X", "pad:3": "Y" },
  playstation: { "pad:0": "✕", "pad:1": "○", "pad:2": "□", "pad:3": "△" },
  /* the standard mapping puts the bottom face button first: B on a Nintendo pad */
  nintendo: { "pad:0": "B", "pad:1": "A", "pad:2": "Y", "pad:3": "X" },
  generic: { "pad:0": "A", "pad:1": "B", "pad:2": "X", "pad:3": "Y" },
};
const DPAD_WORDS: Record<string, string> = { "pad:12": "↑", "pad:13": "↓", "pad:14": "←", "pad:15": "→" };

/** the words of a key or a button for a hint */
export function keyWords(key: InputKey, pad: PadKind = "generic"): string {
  return KEY_WORDS[key] ?? PAD_WORDS[pad][key] ?? DPAD_WORDS[key] ?? key;
}

/** the family of a gamepad from what the browser calls it (`Gamepad.id`): Sony's and Nintendo's vendor ids and names */
export function padKindOf(id: string): PadKind {
  const s = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense/.test(s)) return "playstation";
  if (/057e|nintendo|switch|joy-con/.test(s)) return "nintendo";
  if (/045e|xbox|xinput/.test(s)) return "xbox";
  return "generic";
}

/** The hint for an action on a device: the words of the first key or button it is on (`Enter`, `A`, `✕`), "" for touch,
 *  where nothing is pressed but the part itself. */
export function hintOf(action: UiAction, device: InputDevice, pad: PadKind = "generic", bindings: typeof UI_BINDINGS = UI_BINDINGS): string {
  if (device === "touch") return "";
  const keys = bindings[action][device];
  return keys.length ? keyWords(keys[0], pad) : "";
}

/** What an expression reads as `input` (lib/bindings/expr.ts): the device in use, a yes or no for each, and the hint for
 *  each UI action on it, so words can say `{{input.hint.confirm}} 购买` and a part show only for a gamepad
 *  (`showWhen: input.gamepad`). A world's input actions have their hints there too (`input.hint.attack`), handed in as
 *  words by the action's name (lib/focus/inputs.ts `actionHint`). */
export type InputScope = { device: InputDevice; keyboard: boolean; gamepad: boolean; touch: boolean; pad: PadKind; hint: Record<string, string> };

export function inputScope(device: InputDevice, pad: PadKind = "generic", more: Record<string, string> = {}, bindings: typeof UI_BINDINGS = UI_BINDINGS): InputScope {
  return {
    device,
    keyboard: device === "keyboard",
    gamepad: device === "gamepad",
    touch: device === "touch",
    pad,
    hint: { ...more, ...Object.fromEntries(UI_ACTIONS.map((a) => [a, hintOf(a, device, pad, bindings)])) },
  };
}
