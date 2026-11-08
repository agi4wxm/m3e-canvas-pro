/* The preview's back keys, as a behaviour: a key press where the focus is → whether the preview goes back. The page
 * itself is checked in the browser (e2e/preview.e2e.ts): Backspace in a field deletes a character and stays. */

import { describe, expect, it } from "vitest";
import { goesBack, type KeyPress } from "./previewKeys";

/** an element as far as the check reads it: what it matches, and whether it is editable as a whole */
const el = (matches: (selector: string) => boolean, editable = false) => ({ isContentEditable: editable, closest: (s: string) => (s.split(", ").some(matches) ? {} : null) }) as unknown as EventTarget;
const press = (key: string, target: EventTarget | null, o: Partial<KeyPress> = {}): KeyPress => ({ key, target, isComposing: false, keyCode: 0, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, ...o });

const screen = el(() => false);
const button = el((s) => s === '[role="button"]');

describe("the preview's back keys", () => {
  it.each(["Backspace", "ArrowLeft"])("%s on the screen or a button goes back", (key) => {
    expect(goesBack(press(key, screen))).toBe(true);
    expect(goesBack(press(key, button))).toBe(true);
    expect(goesBack(press(key, null))).toBe(true);
  });

  it.each([
    ["a text field", el((s) => s === "input")],
    ["a text area", el((s) => s === "textarea")],
    ["a native select", el((s) => s === "select")],
    ["editable words", el((s) => s.startsWith("[contenteditable]"))],
    ["inside editable words", el(() => false, true)],
    ["a select's trigger", el((s) => s === '[role="combobox"]')],
    ["a slider", el((s) => s === '[role="slider"]')],
    ["a row of tabs", el((s) => s === '[role="tablist"]')],
    ["a radio group", el((s) => s === '[role="radiogroup"]')],
    ["a menu", el((s) => s === '[role="menu"]')],
  ])("Backspace and ← in %s stay with it", (_, target) => {
    expect(goesBack(press("Backspace", target))).toBe(false);
    expect(goesBack(press("ArrowLeft", target))).toBe(false);
  });

  it("leaves a key an input method is composing, one a control answered, and one with a modifier", () => {
    expect(goesBack(press("Backspace", screen, { isComposing: true }))).toBe(false);
    expect(goesBack(press("Backspace", screen, { keyCode: 229 }))).toBe(false);
    expect(goesBack(press("ArrowLeft", screen, { defaultPrevented: true }))).toBe(false);
    expect(goesBack(press("ArrowLeft", screen, { altKey: true }))).toBe(false);
    expect(goesBack(press("Backspace", screen, { metaKey: true }))).toBe(false);
    expect(goesBack(press("Backspace", screen, { ctrlKey: true }))).toBe(false);
  });

  it("is only Backspace and ←", () => {
    for (const key of ["ArrowRight", "Delete", "Escape", "Enter", "b"]) expect(goesBack(press(key, screen))).toBe(false);
  });
});
