/* The prototype's interactions: their triggers and animations as the document keeps them, the older transitions they
 * stand beside, what set_action accepts and refuses, flows, and a file read back. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "./core";
import { openProject, projectFile } from "./project";
import { cleanMotion, cleanTrigger, flowStarts, motionOf, triggerOf, withMotion } from "./prototype";
import { makeItem, transitionOf, type Doc, type Group } from "./tokens";

beforeAll(() => setGlobalLang("en"));

describe("motions and triggers", () => {
  it("keeps what a motion of its kind has, and nothing else", () => {
    expect(cleanMotion({ kind: "push", dir: "up", easing: "inOut", ms: 320.4, extra: 1 })).toEqual({ kind: "push", dir: "up", easing: "inOut", ms: 320 });
    expect(cleanMotion({ kind: "instant", dir: "up", easing: "in", ms: 300 })).toEqual({ kind: "instant" });
    expect(cleanMotion({ kind: "dissolve", dir: "up", ms: 99999 })).toEqual({ kind: "dissolve", ms: 10000 });
    expect(cleanMotion({ kind: "teleport" })).toBeUndefined();
    expect(cleanTrigger({ on: "hover" })).toEqual({ on: "hover" });
    expect(cleanTrigger({ on: "delay", ms: -5 })).toEqual({ on: "delay", ms: 0 });
    expect(cleanTrigger({ on: "delay" })).toBeUndefined();
  });

  it("reads an older transition as a motion, and gives a motion the nearest older transition", () => {
    expect(motionOf({ transition: "slide" })).toEqual({ kind: "slide", dir: "left" });
    expect(motionOf({ transition: "slideLeft" })).toEqual({ kind: "slide", dir: "right" });
    expect(motionOf({ transition: "fade" })).toEqual({ kind: "dissolve" });
    expect(motionOf({ transition: "none" })).toEqual({ kind: "instant" });
    expect(transitionOf({ kind: "push", dir: "down" })).toBe("slideDown");
    expect(withMotion({ to: "s", transition: "slide" }, { kind: "move", dir: "up" })).toEqual({ to: "s", transition: "slideUp", motion: { kind: "move", dir: "up" } });
    expect(triggerOf(undefined)).toEqual({ on: "tap" });
  });
});

describe("set_action and set_flow_start", () => {
  const screens = [
    { id: "a", name: "A", x: 0, y: 0 },
    { id: "b", name: "B", x: 500, y: 0 },
  ];
  const store = () => new DocStore(stateOf({ groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id: "btn" }] } as Group, { id: "h", x: 16, y: 300, axis: "x", items: [{ ...makeItem("text"), id: "txt" }] } as Group], frames: screens }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const ai = { origin: "ai" as const };
  const action = (s: DocStore) => s.get().doc.groups[0].items[0].action;

  it("takes a trigger, an overlay, a part to scroll to and a motion, filling in the older transition", () => {
    const s = store();
    s.run(ops.setAction, { id: "btn", action: { to: "b", overlay: true, trigger: { on: "delay", ms: 500 }, motion: { kind: "push", dir: "up" } } as never }, ai);
    expect(action(s)).toEqual({ to: "b", overlay: true, trigger: { on: "delay", ms: 500 }, motion: { kind: "push", dir: "up" }, transition: "slideUp" });
    s.run(ops.setAction, { id: "btn", action: { to: "none", scrollTo: "txt" } as never }, ai);
    expect(action(s)).toMatchObject({ to: "none", scrollTo: "txt" });
  });

  it("refuses what is no trigger, no motion, an overlay of no screen, or a part that is not there", () => {
    const s = store();
    expect(() => s.run(ops.setAction, { id: "btn", action: { to: "b", trigger: { on: "swipe" } } as never }, ai)).toThrow(/trigger/);
    expect(() => s.run(ops.setAction, { id: "btn", action: { to: "b", motion: { kind: "zoom" } } as never }, ai)).toThrow(/motion/);
    expect(() => s.run(ops.setAction, { id: "btn", action: { to: "back", overlay: true } as never }, ai)).toThrow(/overlay/);
    expect(() => s.run(ops.setAction, { id: "btn", action: { to: "none", scrollTo: "gone" } as never }, ai)).toThrow(/scroll/);
  });

  it("starts a flow at a screen, and no longer", () => {
    const s = store();
    s.run(ops.setFlowStart, { screen: "b", name: "Checkout" }, ai);
    expect(flowStarts(s.get().doc.frames).map((f) => [f.id, f.flow])).toEqual([["b", "Checkout"]]);
    s.run(ops.setFlowStart, { screen: "b", name: null }, ai);
    expect(s.get().doc.frames[1].flow).toBeUndefined();
    expect(() => s.run(ops.setFlowStart, { screen: "b", name: null }, ai)).toThrow(/No flow/);
  });

  it("reads a file back with its interactions and flows, and drops what is of the wrong shape", () => {
    const doc: Doc = {
      groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: "btn", action: { to: "b", transition: "slideUp", overlay: true, trigger: { on: "hover" }, motion: { kind: "push", dir: "up", easing: "spring" } } }] }],
      frames: [{ ...screens[0], flow: "Main" }, screens[1]],
      paletteKey: "purple",
      frame: "phone",
      title: "",
      brief: "",
    };
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc))))!;
    expect(back.groups[0].items[0].action).toEqual(doc.groups[0].items[0].action);
    expect(back.frames[0].flow).toBe("Main");
    const broken = openProject({ ...doc, groups: [{ ...doc.groups[0], items: [{ ...doc.groups[0].items[0], action: { to: "b", transition: "slide", overlay: "yes", trigger: { on: 3 }, motion: { kind: "nope" } } }] }] })!;
    expect(broken.groups[0].items[0].action).toEqual({ to: "b", transition: "slide" });
  });
});
