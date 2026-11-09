/* The input-action table: the defaults dealt out in turn, the document's keys over them, keys and pads read as the
 * actions' values with only the changes sent, letting go of everything, the hints, the UI actions' own keys, and what a
 * file may say. */

import { describe, expect, it } from "vitest";
import { ActionReader, actionHint, drivenActions, uiBindings, type DrivenAction } from "./inputs";
import { cleanInputMap } from "./clean";
import { uiActionOfKey } from "./model";

const decls = [{ name: "move", type: "vec2" as const }, { name: "attack", type: "bool" as const }, { name: "aim", type: "vec2" as const }, { name: "dash" }];

describe("the actions as they are driven", () => {
  it("deals the defaults out in turn: WASD and the arrows and the left stick, then IJKL and the right; Space or J and A, then K and X", () => {
    const [move, attack, aim, dash] = drivenActions(decls);
    expect(move).toMatchObject({ type: "vec2", keys: { up: ["w", "ArrowUp"], left: ["a", "ArrowLeft"] }, pad: ["stick:left", "dpad"] });
    expect(attack).toMatchObject({ type: "bool", keys: [" ", "j"], pad: ["pad:0"] });
    expect(aim).toMatchObject({ type: "vec2", keys: { up: ["i"] }, pad: ["stick:right"] });
    expect(dash).toMatchObject({ type: "bool", keys: ["k"], pad: ["pad:2"] });
    /* `move` saying nothing is a direction */
    expect(drivenActions([{ name: "move" }])[0].type).toBe("vec2");
  });

  it("takes the document's keys over the defaults, of the right shape only", () => {
    const [move, attack] = drivenActions(decls, { actions: { move: { keys: { up: ["z"] } }, attack: { keys: ["f"], pad: ["pad:3"] } } });
    expect(move.keys).toEqual({ up: ["z"] });
    expect(attack).toMatchObject({ keys: ["f"], pad: ["pad:3"] });
    /* a list for a direction is no direction's keys: the default stays */
    expect(drivenActions([decls[0]], { actions: { move: { keys: ["x"] } } })[0].keys).toMatchObject({ up: ["w", "ArrowUp"] });
  });
});

describe("reading the keys and the pads", () => {
  const actions: DrivenAction[] = drivenActions(decls.slice(0, 2));

  it("sends a direction as the keys held make it, the diagonal at length 1, and only when it changes", () => {
    const r = new ActionReader();
    expect(r.key(actions, "d", true)).toEqual([{ action: "move", value: { x: 1, y: 0 } }]);
    /* a capital D (Shift held) is the same key; held again it changes nothing */
    expect(r.key(actions, "D", true)).toEqual([]);
    expect(r.key(actions, "ArrowUp", true)).toEqual([{ action: "move", value: { x: 0.71, y: -0.71 } }]);
    expect(r.key(actions, "d", false)).toEqual([{ action: "move", value: { x: 0, y: -1 } }]);
    expect(r.key(actions, "ArrowUp", false)).toEqual([{ action: "move", value: { x: 0, y: 0 } }]);
    expect(r.key(actions, "q", true)).toEqual([]);
  });

  it("presses and lets go of a button", () => {
    const r = new ActionReader();
    expect(r.key(actions, " ", true)).toEqual([{ action: "attack", value: true }]);
    expect(r.key(actions, "j", true)).toEqual([]);
    expect(r.key(actions, " ", false)).toEqual([]);
    expect(r.key(actions, "j", false)).toEqual([{ action: "attack", value: false }]);
  });

  it("reads a stick past its dead zone, the d-pad and a button", () => {
    const r = new ActionReader();
    const pad = (axes: number[], pressed: number[] = []) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });
    expect(r.pads(actions, [pad([0.1, 0.1])])).toEqual([]);
    expect(r.pads(actions, [pad([0.6, 0])])).toEqual([{ action: "move", value: { x: 0.6, y: 0 } }]);
    expect(r.pads(actions, [pad([0, 0], [13, 0])])).toEqual([
      { action: "move", value: { x: 0, y: 1 } },
      { action: "attack", value: true },
    ]);
    expect(r.pads(actions, [null])).toEqual([
      { action: "move", value: { x: 0, y: 0 } },
      { action: "attack", value: false },
    ]);
  });

  it("lets go of everything held at once, and forgets the keys", () => {
    const r = new ActionReader();
    r.key(actions, "a", true);
    r.key(actions, " ", true);
    expect(r.release()).toEqual([
      { action: "move", value: { x: 0, y: 0 } },
      { action: "attack", value: false },
    ]);
    expect(r.release()).toEqual([]);
    /* the key let go after the release sends nothing more */
    expect(r.key(actions, "a", false)).toEqual([]);
  });
});

describe("hints and the UI actions' keys", () => {
  it("says each action's keys on the device in use", () => {
    const [move, attack, aim] = drivenActions(decls);
    expect(actionHint(move, "keyboard")).toBe("WASD");
    expect(actionHint(aim, "keyboard")).toBe("IJKL");
    expect(actionHint(attack, "keyboard")).toBe("Space");
    expect(actionHint(move, "gamepad")).toBe("L");
    expect(actionHint(attack, "gamepad", "playstation")).toBe("✕");
    expect(actionHint(attack, "touch")).toBe("");
    const arrows = drivenActions([decls[0]], { actions: { move: { keys: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] } } } })[0];
    expect(actionHint(arrows, "keyboard")).toBe("↑↓←→");
  });

  it("takes the document's keys for a UI action over the defaults", () => {
    const ui = uiBindings({ ui: { confirm: { keyboard: ["e"] } } });
    expect(uiActionOfKey("e", ui)).toBe("confirm");
    expect(uiActionOfKey("Enter", ui)).toBeNull();
    expect(uiActionOfKey("Escape", ui)).toBe("cancel");
  });

  it("keeps what a file says that holds, and drops the rest", () => {
    expect(cleanInputMap({ actions: { move: { keys: { up: ["w", 3], sideways: ["q"] }, pad: ["stick:left", "rocket"] }, "Bad Name": { keys: ["x"] }, attack: { keys: "j" } }, ui: { confirm: { keyboard: ["e"], gamepad: ["pad:0", "stick:left"] }, jump: { keyboard: ["x"] } } })).toEqual({
      actions: { move: { keys: { up: ["w"] }, pad: ["stick:left"] } },
      ui: { confirm: { keyboard: ["e"], gamepad: ["pad:0"] } },
    });
    expect(cleanInputMap({ actions: {} })).toBeUndefined();
    expect(cleanInputMap("x")).toBeUndefined();
  });
});
