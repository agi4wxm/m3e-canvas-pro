/* set_focus as a model calls it: a screen's first and cancel, its wrap, a part's focusable and next, each checked to be
 * on the screen; null clears; the result is the screen's focus map. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { makeItem, type Group } from "../../tokens";
import { guessMeasurer, OpError } from "../op";
import { counterIds, DocStore } from "../store";
import { stateOf } from "../state";
import { opByName } from ".";
import type { FocusMap } from "../../focus/design";

beforeAll(() => setGlobalLang("en"));

const button = (id: string, y: number, label: string): Group => ({ id: `g-${id}`, x: 16, y, axis: "x", items: [{ ...makeItem("button"), id, props: { label }, action: { to: "none" } }] });
const screens = [{ id: "s", name: "Menu", x: 0, y: 0 }, { id: "t", name: "Other", x: 600, y: 0 }];
const make = () => new DocStore(stateOf({ groups: [button("a", 100, "Resume"), button("b", 200, "Settings"), button("c", 300, "Quit"), { ...button("x", 100, "Elsewhere"), x: 616 }], frames: screens }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const ai = { origin: "ai" as const };
const run = (s: DocStore, args: object) => ({ result: s.run(opByName("set_focus")!, args as never, ai) as unknown as FocusMap });

describe("set_focus", () => {
  it("sets where the focus starts, what cancel runs and the wrap, and returns the map", () => {
    const s = make();
    const out = run(s, { screen: "s", first: "b", cancel: "c", wrap: true });
    expect(s.get().doc.frames[0].focus).toEqual({ first: "b", cancel: "c", wrap: true });
    expect(out.result.first).toBe("b");
    expect(out.result.parts.map((p) => p.label)).toEqual(["Resume", "Settings", "Quit"]);
    /* round from the last to the first */
    expect(out.result.parts[2].next.down).toBe("a");
    run(s, { screen: "s", cancel: null, wrap: false });
    expect(s.get().doc.frames[0].focus).toEqual({ first: "b" });
    run(s, { screen: "s", first: null });
    expect(s.get().doc.frames[0].focus).toBeUndefined();
  });

  it("sets a part's own next and focusable, and clears them", () => {
    const s = make();
    const out = run(s, { screen: "s", parts: { a: { next: { down: "c", up: "none" } }, b: { focusable: false } } });
    expect(s.get().doc.groups[0].items[0].focus).toEqual({ next: { down: "c", up: "none" } });
    expect(out.result.parts.map((p) => p.label)).toEqual(["Resume", "Quit"]);
    expect(out.result.parts[0].next).toEqual({ down: "c" });
    run(s, { screen: "s", parts: { a: { next: { up: null } }, b: null } });
    expect(s.get().doc.groups[0].items[0].focus).toEqual({ next: { down: "c" } });
    expect(s.get().doc.groups[1].items[0].focus).toBeUndefined();
  });

  it("refuses a part that is not on the screen, a part leading to itself and a direction that is none", () => {
    const s = make();
    const fails = (args: object) => {
      try {
        run(s, args);
      } catch (e) {
        return e instanceof OpError ? e.message : String(e);
      }
      return "";
    };
    expect(fails({ screen: "s", first: "x" })).toMatch(/no part on the screen/);
    expect(fails({ screen: "s", parts: { a: { next: { down: "x" } } } })).toMatch(/no part on the screen/);
    expect(fails({ screen: "s", parts: { a: { next: { down: "a" } } } })).toMatch(/itself/);
    expect(fails({ screen: "s", parts: { a: { next: { sideways: "b" } } } })).toMatch(/direction/);
    expect(fails({ screen: "nope" })).not.toBe("");
    expect(s.get().doc.frames[0].focus).toBeUndefined();
  });
});

describe("set_input_keys", () => {
  const withWorld = () => {
    const world: Group = { id: "g-w", x: 16, y: 400, axis: "x", items: [{ ...makeItem("world-view"), id: "w", props: { inputs: "move: vec2, attack: bool" } }] };
    return new DocStore(stateOf({ groups: [world], frames: screens }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  };
  type Table = { actions: { name: string; keys: unknown; pad: string[]; hints: Record<string, string> }[] };
  const keys = (s: DocStore, args: object) => s.run(opByName("set_input_keys")!, args as never, ai) as unknown as Table;

  it("sets a world's action's keys and buttons, puts the defaults back with null, and returns the table with its hints", () => {
    const s = withWorld();
    const out = keys(s, { action: "attack", keys: ["F"], pad: ["pad:3"] });
    expect(s.get().doc.inputs).toEqual({ actions: { attack: { keys: ["f"], pad: ["pad:3"] } } });
    expect(out.actions.find((a) => a.name === "attack")).toMatchObject({ keys: ["f"], pad: ["pad:3"], hints: { keyboard: "F", gamepad: "Y" } });
    expect(out.actions.find((a) => a.name === "move")?.hints.keyboard).toBe("WASD");
    keys(s, { action: "move", keys: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] } });
    keys(s, { action: "attack", keys: null, pad: null });
    expect(s.get().doc.inputs).toEqual({ actions: { move: { keys: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] } } } });
    keys(s, { action: "move", keys: null });
    expect(s.get().doc.inputs).toBeUndefined();
  });

  it("sets a UI action's keys over the defaults", () => {
    const s = withWorld();
    keys(s, { action: "confirm", keys: ["e", "Enter"], pad: ["pad:0"] });
    expect(s.get().doc.inputs).toEqual({ ui: { confirm: { keyboard: ["e", "Enter"], gamepad: ["pad:0"] } } });
  });

  it("refuses an action no world declares, and keys of the wrong shape", () => {
    const s = withWorld();
    const fails = (args: object) => {
      try {
        keys(s, args);
      } catch (e) {
        return e instanceof OpError ? e.message : String(e);
      }
      return "";
    };
    expect(fails({ action: "jump", keys: ["x"] })).toMatch(/declare move, attack/);
    expect(fails({ action: "move", keys: ["x"] })).toMatch(/direction/);
    expect(fails({ action: "attack", keys: { up: ["x"] } })).toMatch(/button/);
    expect(fails({ action: "move", pad: ["pad:0"] })).toMatch(/stick:left/);
    expect(fails({ action: "attack", pad: ["stick:left"] })).toMatch(/pad:N/);
    expect(s.get().doc.inputs).toBeUndefined();
  });
});
