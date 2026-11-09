/* The focus as the document has it: which parts take it, and the map of a screen worked out from where its parts stand,
 * on the game menus flow, the template the keyboard walk runs on (e2e/focus.e2e.ts). A file's focus is cleaned as it
 * is read, and copying parts carries where the focus goes from them. */

import { describe, expect, it } from "vitest";
import { instantiate } from "../../parts/templates/kit";
import { templateBySlug } from "../../parts/templates";
import { defaultMeasures } from "../../parts/templates/kit";
import { makeItem, retarget, type Doc, type Group } from "../tokens";
import { openProject, PROJECT_FORMAT, PROJECT_VERSION } from "../project";
import { focusMap, takesFocus, usesFocus } from "./design";
import { cleanFrameFocus, cleanItemFocus } from "./clean";

const flow = () => {
  const t = templateBySlug("game-menu-flow")!;
  const { frames, groups } = instantiate(t, "en");
  const doc: Doc = { frames, groups, paletteKey: "purple", frame: "phone", title: "menus", brief: "" };
  return { doc, widths: defaultMeasures(groups) };
};
const words = (doc: Doc, id: string | null | undefined) => {
  const it = doc.groups.flatMap((g) => g.items).find((x) => x.id === id);
  return (it?.props?.label as string | undefined) ?? it?.component;
};

describe("which parts take the focus", () => {
  it("is what a press can start, unless the part says otherwise", () => {
    const button = makeItem("button");
    expect(takesFocus(button)).toBe(false);
    expect(takesFocus({ ...button, action: { to: "back" } })).toBe(true);
    /* a tap that starts on the pointer is no press */
    expect(takesFocus({ ...button, action: { to: "back", trigger: { on: "hover" } } })).toBe(false);
    expect(takesFocus({ ...button, focus: { focusable: true } })).toBe(true);
    expect(takesFocus({ ...button, action: { to: "back" }, focus: { focusable: false } })).toBe(false);
    expect(takesFocus(makeItem("switch"))).toBe(true);
    expect(takesFocus(makeItem("tabs"))).toBe(true);
    expect(takesFocus(makeItem("text"))).toBe(false);
  });
});

describe("the game menus flow", () => {
  it("starts the lobby on play, cancels to the menu, and holds the pause menu round", () => {
    const { doc, widths } = flow();
    const [lobby, shop, bag, pause] = doc.frames;
    expect(words(doc, lobby.focus?.first)).toBe("Play");
    expect(doc.groups.flatMap((g) => g.items).find((it) => it.id === lobby.focus?.cancel)?.props?.icon).toBe("menu");
    expect(pause.focus).toMatchObject({ wrap: true });
    expect(words(doc, pause.focus?.first)).toBe("Resume");
    expect(shop.focus).toBeUndefined();
    expect(bag.focus).toBeUndefined();
    expect(usesFocus(doc)).toBe(true);

    const m = focusMap(doc, pause, widths);
    expect(m.parts.map((p) => p.label)).toEqual(["Resume", "Restart", "Settings", "Quit"]);
    expect(m.first).toBe(pause.focus!.first);
    /* down from the last goes round to the first */
    const quit = m.parts[3];
    expect(m.parts.find((p) => p.id === quit.next.down)?.label).toBe("Resume");
    expect(m.parts.find((p) => p.id === m.parts[0].next.down)?.label).toBe("Restart");

    const l = focusMap(doc, lobby, widths);
    expect(l.cancel).toBe(lobby.focus!.cancel);
    /* the play button, the menu, the bag's shortcut and the bar take it */
    expect(l.parts.map((p) => p.label)).toEqual(expect.arrayContaining(["Play", "Menu", "Bag"]));
  });

  it("is no focus at all in a document that never says one", () => {
    const t = templateBySlug("game-flow")!;
    const { frames, groups } = instantiate(t, "en");
    expect(usesFocus({ frames, groups })).toBe(false);
  });
});

describe("a file's focus", () => {
  it("keeps what holds and drops the rest", () => {
    expect(cleanItemFocus({ focusable: "yes", next: { up: "a", sideways: "b", down: 3, left: "" } })).toEqual({ next: { up: "a" } });
    expect(cleanItemFocus({ focusable: false })).toEqual({ focusable: false });
    expect(cleanItemFocus("x")).toBeUndefined();
    expect(cleanFrameFocus({ first: "p", cancel: 4, wrap: "true" })).toEqual({ first: "p" });
    expect(cleanFrameFocus({ wrap: true, first: "x".repeat(500) })).toEqual({ wrap: true });
  });

  it("reads a project's focus back as it was saved, cleaned", () => {
    const { doc } = flow();
    const g0 = doc.groups[0];
    const dirty: Doc = { ...doc, groups: [{ ...g0, items: [{ ...g0.items[0], focus: { next: { up: 7 } } as never }] }, ...doc.groups.slice(1)] };
    const read = openProject({ format: PROJECT_FORMAT, version: PROJECT_VERSION, document: dirty });
    expect(read?.frames[0].focus).toEqual(doc.frames[0].focus);
    expect(read?.groups[0].items[0].focus).toBeUndefined();
  });

  it("carries where the focus goes from a part over to its copy", () => {
    const g: Group = { id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: "a", focus: { next: { right: "b", down: "none" } } }] };
    const copied = retarget(g, new Map([["b", "b2"]]));
    expect(copied.items[0].focus).toEqual({ next: { right: "b2", down: "none" } });
  });
});
