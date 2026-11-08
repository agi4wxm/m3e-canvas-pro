import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tiny } from "../../lib/actions/consistency/tiny";
import type { Element } from "../../lib/actions/consistency/tinyReact";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import type { PreviewState } from "../../lib/interact";
import { PALETTES, makeItem, type Doc, type DocVar, type Item } from "../../lib/tokens";
import type { Effect } from "../../lib/actions/model";

/* The preview's built-in inputs are controlled (parts/render.tsx): the control shows the value the part is drawn with,
 * which is the preview's state, and what the visitor does goes to that state through the control's own callback and
 * the part host. Here the real preview (components/Preview.tsx), its screens, LivePart, PartView and render.tsx run
 * headless on the small stand-in for React the consistency table uses (lib/actions/consistency/tinyReact.ts); the M3E
 * components themselves are stand-ins that only hold their props, so what a control is given can be read and its
 * callbacks called as the component would. */

vi.mock("react", async () => {
  const { tiny } = await import("../../lib/actions/consistency/tiny");
  /* what PartView needs beyond the hooks: a base for its error boundary, and Suspense, which draws its children here */
  return { ...tiny.react, Component: class {}, Suspense: "suspense" };
});
vi.mock("react/jsx-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("react/jsx-dev-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("motion/react", () => {
  const value = (v: unknown) => ({ get: () => v, set: () => {}, on: () => () => {} });
  return { AnimatePresence: "presence", motion: { div: "div", button: "button" }, useReducedMotion: () => false, useIsPresent: () => true, useMotionValue: value, useTransform: () => value(0), animate: () => ({ stop: () => {} }) };
});
vi.mock("@/lib/i18n", async () => ({ ...(await import("../../lib/i18n")), useLang: () => "en" }));
vi.mock("@/components/Icon", () => ({ Icon: "icon" }));
vi.mock("@/components/DeviceBars", () => ({ DeviceBars: "device-bars" }));
vi.mock("@/parts/icons", () => ({ useIcons: () => "0" }));
/* every module a part's tree names comes as stand-ins: a component that is only its name, holding its props */
vi.mock("@/parts/components.generated", async (original) => {
  const real = await original<typeof import("../../parts/components.generated")>();
  const { FILE_OF } = await import("../../parts/files.generated");
  const stand = (name: string) => Object.defineProperty(() => null, "name", { value: name });
  const modules = Object.fromEntries(Object.keys(real.MODULES).map((key) => [key, async () => Object.fromEntries(Object.entries(FILE_OF).filter(([, file]) => file === key).map(([name]) => [name, stand(name)]))]));
  return { ...real, MODULES: modules };
});

const { setGlobalLang } = await import("../../lib/i18n");
setGlobalLang("en");
const { Preview } = await import("../Preview");
const { PreviewStore } = await import("./store");
const { modulesSettled } = await import("../../parts/components");

const VARS: DocVar[] = [
  { id: "name", name: "name", type: "text", value: "Start" },
  { id: "on", name: "on", type: "bool", value: true },
  { id: "level", name: "level", type: "number", value: 10 },
  { id: "fruit", name: "fruit", type: "number", value: 0 },
  { id: "dark", name: "dark", type: "bool", value: false },
];

type Case = { id: string; slug: string; props?: Record<string, unknown>; bind?: Record<string, string>; effects?: Effect[] };
const CASES: Case[] = [
  { id: "name", slug: "text-field", props: { label: "Name" }, bind: { value: "name" } },
  { id: "twin", slug: "text-field", props: { label: "Twin" }, bind: { value: "name" } },
  { id: "notes", slug: "textarea", props: { value: "first" } },
  { id: "count", slug: "input", bind: { value: "level" } },
  { id: "wifi", slug: "switch", bind: { checked: "on" } },
  { id: "agree", slug: "checkbox", props: { checked: false } },
  { id: "volume", slug: "slider", bind: { value: "level" } },
  { id: "range", slug: "slider", props: { range: true, value: 20, end: 70 } },
  { id: "density", slug: "radio-group", props: { selected: 1 } },
  { id: "fruit", slug: "select", bind: { selected: "fruit" } },
  /* bound to a variable, with a tap that toggles that variable too (what the agent writes for a dark mode switch) */
  { id: "darkSwitch", slug: "switch", bind: { checked: "dark" }, effects: [{ do: "toggleVar", var: "dark" }] },
  { id: "set", slug: "button", props: { label: "Set" }, effects: [{ do: "setVar", var: "name", value: "From a button" }, { do: "toggleVar", var: "on" }, { do: "setVar", var: "level", value: 80 }, { do: "setVar", var: "fruit", value: 2 }, { do: "setProp", part: "agree", prop: "checked", value: true }] },
  { id: "clear", slug: "button", props: { label: "Clear" }, effects: [{ do: "setVar", var: "name", value: "" }] },
];

function inputsDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Inputs", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "inputs", name: "Inputs", preset: "desktop" });
    tx.set((s) => {
      const f = s.doc.frames.find((x) => x.id === "inputs")!;
      const groups = CASES.map((c, i) => {
        const it: Item = { ...makeItem(c.slug), id: c.id, props: c.props ?? {}, ...(c.bind ? { bind: c.bind } : {}), ...(c.effects ? { action: { to: "", transition: "none", effects: c.effects } } : {}) } as Item;
        return { id: `g-${c.id}`, axis: "x" as const, x: f.x + 16 + (i % 4) * 300, y: f.y + 24 + Math.floor(i / 4) * 120, items: [it] };
      });
      return { ...s, doc: { ...s.doc, groups: [...s.doc.groups, ...groups], vars: VARS } };
    });
  });
  return savedDoc(store.get());
}

/** what the stand-in calls: the preview and its screens, each part's LivePart and PartView, and the controlled input */
const CALLED = new Set(["Preview", "Screen", "LivePart", "GuardedPartView", "PartViewBody", "Controlled"]);
const called = (t: unknown) => typeof t === "function" && CALLED.has(t.name);
const nameOf = (e: Element) => (typeof e.type === "function" ? e.type.name : String(e.type));

function open(doc: Doc) {
  let tree: unknown;
  const draw = () => {
    tree = tiny.render(tiny.react.createElement(Preview, { doc, widths: {}, palette: PALETTES[0], startId: doc.frames[0].id, onClose: () => {} }), called);
  };
  draw();
  const state = (): PreviewState => (tiny.states().find((v) => v instanceof PreviewStore) as InstanceType<typeof PreviewStore>).get();
  const live = (id: string): Element => {
    const found = tiny.elements(tree).find((e) => nameOf(e) === "LivePart" && (e.props.item as Item).id === id);
    if (!found) throw new Error(`the part ${id} is not drawn`);
    return found;
  };
  /** the control a part is drawn with: the M3E component the tree names */
  const control = (id: string, type: string): Element => {
    const found = tiny.elements(live(id).props.children).filter((e) => nameOf(e) === type);
    if (!found.length) throw new Error(`the part ${id} has no ${type}`);
    /* a part drawn open hangs its open drawing over the closed one (parts/contained.tsx Overhang): the one that works is the last */
    return found[found.length - 1];
  };
  /** the key the part's PartView is drawn under: a new key would be a fresh drawing */
  const drawing = (id: string) => tiny.elements(live(id).props.children).find((e) => nameOf(e) === "GuardedPartView")?.key;
  const tap = (id: string) => {
    const screen = tiny.elements(tree).find((e) => nameOf(e) === "Screen")!;
    const it = (screen.props.groups as { items: Item[] }[]).flatMap((g) => g.items).find((x) => x.id === id)!;
    (screen.props.onAction as (a: unknown, it: Item) => void)(it.action, it);
    draw();
  };
  /** the visitor uses a control: its callback, called as the component calls it */
  const use = async (id: string, type: string, callback: string, ...args: unknown[]) => {
    (control(id, type).props[callback] as (...a: unknown[]) => void)(...args);
    /* the value goes to the state once the event it came in is over (parts/render.tsx) */
    await Promise.resolve();
    draw();
  };
  /** a press on a control that is also the part's tap: the control's callback, then the tap, in one event */
  const press = async (id: string, type: string, callback: string, ...args: unknown[]) => {
    (control(id, type).props[callback] as (...a: unknown[]) => void)(...args);
    tap(id);
    await Promise.resolve();
    draw();
  };
  return { draw, state, control, drawing, tap, use, press };
}

describe("the preview's built-in inputs", () => {
  beforeEach(() => {
    tiny.reset();
    const listen = () => {};
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900, addEventListener: listen, removeEventListener: listen, setTimeout, clearTimeout, setInterval, clearInterval, open: () => null, matchMedia: () => ({ matches: false, addEventListener: listen, removeEventListener: listen }), dispatchEvent: () => true });
    vi.stubGlobal("document", { activeElement: null, querySelector: () => null, documentElement: { lang: "en" }, addEventListener: listen, removeEventListener: listen });
  });
  afterEach(() => {
    tiny.reset();
    vi.unstubAllGlobals();
  });

  async function opened() {
    const p = open(inputsDoc());
    /* the parts' components arrive (stand-ins), and the parts are drawn with them */
    await modulesSettled();
    p.draw();
    return p;
  }

  it("show what the preview's state holds, as controlled values", async () => {
    const p = await opened();
    expect(p.control("name", "TextField").props).toMatchObject({ value: "Start" });
    expect(p.control("name", "TextField").props).not.toHaveProperty("defaultValue");
    expect(p.control("notes", "Textarea").props).toMatchObject({ value: "first" });
    expect(p.control("count", "Input").props).toMatchObject({ value: "10" });
    expect(p.control("wifi", "Switch").props).toMatchObject({ checked: true });
    expect(p.control("agree", "Checkbox").props).toMatchObject({ checked: false });
    expect(p.control("volume", "Slider").props).toMatchObject({ value: [10] });
    expect(p.control("range", "Slider").props).toMatchObject({ value: [20, 70] });
    expect(p.control("density", "RadioGroup").props).toMatchObject({ value: "Comfortable" });
    expect(p.control("fruit", "Select").props).toMatchObject({ value: "Apple" });
  });

  it("hand what the visitor does to the state through the control's own callback", async () => {
    const p = await opened();
    await p.use("name", "TextField", "onChange", { target: { value: "Typed" } });
    expect(p.state().vars.name).toBe("Typed");
    expect(p.state().fields.name).toBe("Typed");
    expect(p.control("name", "TextField").props.value).toBe("Typed");
    await p.use("notes", "Textarea", "onChange", { target: { value: "first\nsecond" } });
    expect(p.state().fields.notes).toBe("first\nsecond");
    await p.use("wifi", "Switch", "onCheckedChange", false);
    expect(p.state().vars.on).toBe(false);
    expect(p.control("wifi", "Switch").props.checked).toBe(false);
    await p.use("agree", "Checkbox", "onCheckedChange", true);
    expect(p.state().fields.agree).toBe(true);
    await p.use("volume", "Slider", "onValueChange", [42]);
    expect(p.state().vars.level).toBe(42);
    expect(p.control("volume", "Slider").props.value).toEqual([42]);
    /* a choice is its row's place in the list */
    await p.use("density", "RadioGroup", "onValueChange", "Compact");
    expect(p.state().fields.density).toBe(2);
    expect(p.control("density", "RadioGroup").props.value).toBe("Compact");
    await p.use("fruit", "Select", "onValueChange", "Cherry");
    expect(p.state().vars.fruit).toBe(2);
    expect(p.control("fruit", "Select").props.value).toBe("Cherry");
  });

  it("show a value set from elsewhere at once, without drawing the part afresh", async () => {
    const p = await opened();
    await p.use("name", "TextField", "onChange", { target: { value: "Typed" } });
    await p.use("wifi", "Switch", "onCheckedChange", false);
    await p.use("fruit", "Select", "onValueChange", "Banana");
    const before = ["name", "wifi", "volume", "fruit", "agree"].map(p.drawing);
    /* an effect sets the variables the inputs are bound to, and a prop of an unbound one */
    p.tap("set");
    expect(p.control("name", "TextField").props.value).toBe("From a button");
    expect(p.control("wifi", "Switch").props.checked).toBe(true);
    expect(p.control("volume", "Slider").props.value).toEqual([80]);
    expect(p.control("count", "Input").props.value).toBe("80");
    expect(p.control("fruit", "Select").props.value).toBe("Cherry");
    expect(["name", "wifi", "volume", "fruit", "agree"].map(p.drawing)).toEqual(before);
    /* cleared from elsewhere: back to nothing typed, though the visitor had typed something */
    await p.use("name", "TextField", "onChange", { target: { value: "From a button!" } });
    p.tap("clear");
    expect(p.control("name", "TextField").props.value).toBe("");
    expect(p.state().vars.name).toBe("");
  });

  it("show what the visitor typed in one input in another bound to the same variable", async () => {
    const p = await opened();
    await p.use("name", "TextField", "onChange", { target: { value: "Ada" } });
    expect(p.control("twin", "TextField").props.value).toBe("Ada");
    await p.use("count", "Input", "onChange", { target: { value: "33" } });
    expect(p.control("volume", "Slider").props.value).toEqual([33]);
  });

  it("keep what the visitor did that the state does not hold, until a value comes from elsewhere", async () => {
    const p = await opened();
    /* letters in a field bound to a number: the variable stays, the field shows what was typed */
    await p.use("count", "Input", "onChange", { target: { value: "10x" } });
    expect(p.state().vars.level).toBe(10);
    expect(p.control("count", "Input").props.value).toBe("10x");
    p.tap("set");
    expect(p.control("count", "Input").props.value).toBe("80");
    /* a range's value is its first thumb: the second stays where the visitor put it */
    await p.use("range", "Slider", "onValueChange", [20, 75]);
    expect(p.control("range", "Slider").props.value).toEqual([20, 75]);
    await p.use("range", "Slider", "onValueChange", [25, 75]);
    expect(p.state().fields.range).toBe(25);
    expect(p.control("range", "Slider").props.value).toEqual([25, 75]);
  });

  it("count a press on a control that is also the part's tap once: a switch whose tap toggles its own variable toggles it", async () => {
    const p = await opened();
    await p.press("darkSwitch", "Switch", "onCheckedChange", true);
    expect(p.state().vars.dark).toBe(true);
    expect(p.control("darkSwitch", "Switch").props.checked).toBe(true);
    await p.press("darkSwitch", "Switch", "onCheckedChange", false);
    expect(p.state().vars.dark).toBe(false);
    expect(p.control("darkSwitch", "Switch").props.checked).toBe(false);
  });
});
