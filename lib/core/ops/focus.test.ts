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
