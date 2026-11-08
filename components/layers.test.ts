import { describe, expect, it } from "vitest";
import { escapeTop, modalOpen, openLayer, openLayers } from "./layers";
import { keyIsNotOurs } from "../src/editor/useShortcuts";

/* The editor's layers and who a key belongs to: one Escape closes one layer, and the canvas does not hear what a
 * dialog, a control or an IME has. The same in a real browser: e2e/keys.e2e.ts. */

const press = (key: string, more: Partial<KeyboardEvent> = {}) => {
  const e = { key, isComposing: false, prevented: false, stopped: false, preventDefault() {
    this.prevented = true;
  }, stopPropagation() {
    this.stopped = true;
  }, ...more };
  return e;
};

describe("the layer stack", () => {
  it("gives Escape to the topmost layer only, one layer a press", () => {
    const closed: string[] = [];
    const closePanel = openLayer(() => closed.push("panel"));
    const closePicker = openLayer(() => closed.push("picker"));
    const e = press("Escape");
    expect(escapeTop(e)).toBe(true);
    expect(closed).toEqual(["picker"]);
    expect(e.prevented && e.stopped).toBe(true);
    closePicker();
    expect(escapeTop(press("Escape"))).toBe(true);
    expect(closed).toEqual(["picker", "panel"]);
    closePanel();
    /* with nothing open, Escape is the canvas's */
    const free = press("Escape");
    expect(escapeTop(free)).toBe(false);
    expect(free.prevented || free.stopped).toBe(false);
    expect(openLayers()).toBe(0);
  });

  it("leaves other keys alone, and an Escape that ends a composition to the IME", () => {
    const closed: string[] = [];
    const close = openLayer(() => closed.push("menu"));
    expect(escapeTop(press("Enter"))).toBe(false);
    expect(escapeTop(press("Escape", { isComposing: true }))).toBe(false);
    expect(closed).toEqual([]);
    close();
  });

  it("closes a layer taken away out of order without disturbing the others", () => {
    const closed: string[] = [];
    const a = openLayer(() => closed.push("a"));
    const b = openLayer(() => closed.push("b"));
    a();
    a();
    escapeTop(press("Escape"));
    expect(closed).toEqual(["b"]);
    b();
    expect(openLayers()).toBe(0);
  });

  it("knows when a dialog that asks something is up", () => {
    const menu = openLayer(() => {});
    expect(modalOpen()).toBe(false);
    const dialog = openLayer(() => {}, true);
    expect(modalOpen()).toBe(true);
    dialog();
    expect(modalOpen()).toBe(false);
    menu();
  });
});

/** a stand-in for a focused element: its tag, and the selectors one of its ancestors (or itself) matches */
const el = (tagName: string, matches: string[] = [], isContentEditable = false) =>
  ({ tagName, isContentEditable, closest: (sel: string) => (sel.split(",").some((s) => matches.includes(s.trim())) ? {} : null) }) as unknown as EventTarget;
const key = (k: string, target: EventTarget | null, more: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, metaKey: false, defaultPrevented: false, isComposing: false, target, ...more });

describe("which keys the canvas hears", () => {
  const body = el("BODY");
  it("hears plain keys on the page and on a plain button", () => {
    expect(keyIsNotOurs(key("Delete", body))).toBe(false);
    expect(keyIsNotOurs(key("ArrowLeft", el("BUTTON")))).toBe(false);
  });

  it("keeps out of text, as before", () => {
    expect(keyIsNotOurs(key("Delete", el("INPUT")))).toBe(true);
    expect(keyIsNotOurs(key("v", el("TEXTAREA")))).toBe(true);
    expect(keyIsNotOurs(key("Backspace", el("DIV", [], true)))).toBe(true);
  });

  it("does not answer a key a control has answered already", () => {
    expect(keyIsNotOurs(key("ArrowRight", el("BUTTON", ["[role=radio]"]), { defaultPrevented: true }))).toBe(true);
    expect(keyIsNotOurs(key("ArrowRight", body, { defaultPrevented: true }))).toBe(true);
  });

  it("leaves a composition to the IME", () => {
    expect(keyIsNotOurs(key("Enter", body, { isComposing: true }))).toBe(true);
    expect(keyIsNotOurs(key("Process", body))).toBe(true);
  });

  it("leaves a focused select, slider, radio run or list its arrows, Home, End and page keys; the canvas's other keys still reach it", () => {
    for (const control of [el("BUTTON", ["[aria-haspopup=listbox]"]), el("DIV", ["[role=slider]"]), el("BUTTON", ["[role=radio]", "[role=radiogroup]"]), el("BUTTON", ["[role=option]", "[role=listbox]"]), el("BUTTON", ["[role=tab]"])]) {
      for (const k of ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Home", "End", "PageUp"]) expect(keyIsNotOurs(key(k, control)), k).toBe(true);
      for (const k of ["Delete", "p", "v", "Escape", " "]) expect(keyIsNotOurs(key(k, control)), k).toBe(false);
      expect(keyIsNotOurs(key("z", control, { ctrlKey: true }))).toBe(false);
    }
  });

  it("leaves a native select every key, as a text field: it finds an option by the letters typed", () => {
    for (const k of ["ArrowDown", "p", "Delete"]) expect(keyIsNotOurs(key(k, el("SELECT")))).toBe(true);
  });

  it("hears nothing while a dialog that asks something is up", () => {
    const dialog = openLayer(() => {}, true);
    expect(keyIsNotOurs(key("Delete", el("BUTTON")))).toBe(true);
    expect(keyIsNotOurs(key("z", body, { ctrlKey: true }))).toBe(true);
    dialog();
    expect(keyIsNotOurs(key("Delete", el("BUTTON")))).toBe(false);
  });
});
