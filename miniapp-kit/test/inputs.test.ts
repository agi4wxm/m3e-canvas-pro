/* The pickers and the entry parts (D3) in the mini-program kit, drawn headless by the table's stand-in React
 * (test/table/tinyReact.ts): Taro's components are names whose props (their handlers among them) the test reads and
 * calls, Taro's API a fake. Each part is an input whose value is its prop: given `onChange` it shows the prop as given
 * and only hands a change out, else it keeps a draft that starts over when the prop changes. */
import { beforeEach, describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";
import { fakeTaro } from "./taro";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);

/** where the signature pad stands on the page, as the fake's selector query measures it */
const rect = { left: 100, top: 200, width: 336, height: 180 };
mock.module("@tarojs/taro", () => {
  const taro = {
    createSelectorQuery: () => {
      const q = { select: () => q, boundingClientRect: (fn: (r: typeof rect) => void) => (fn(rect), q), exec: () => {} };
      return q;
    },
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
    onThemeChange: () => {},
    offThemeChange: () => {},
    getStorageSync: () => "",
    setStorage: async () => {},
    showActionSheet: async () => ({ tapIndex: 0 }),
    setClipboardData: async () => {},
    getCurrentPages: () => [],
    /* every name the other test files' fakes give: a fake replaced later keeps the names the first one had */
    navigateTo: async () => {},
    redirectTo: async () => {},
    navigateBack: async () => {},
    reLaunch: async () => {},
    switchTab: async () => {},
    showToast: async () => {},
    stopPullDownRefresh: () => {},
    getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280 }),
    getStorage: async () => Promise.reject(new Error("none")),
    removeStorage: async () => {},
    request: async () => ({ statusCode: 404, data: "", header: {} }),
    uploadFile: () => Promise.resolve({ statusCode: 404, data: "", header: {} }),
    getFileSystemManager: () => ({ writeFile: () => {} }),
    env: {},
    useRouter: () => ({ params: {} }),
    usePullDownRefresh: () => {},
    useReachBottom: () => {},
  };
  return fakeTaro(taro);
});
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text" }));

const { ThemeProvider } = await import("../src/kit/theme");
const { MATERIAL } = await import("../src/kit/theme.generated");
const P = await import("../src/kit/composites/pickers");
const E = await import("../src/kit/composites/entry");

const h = tiny.react.createElement as (type: unknown, props: Record<string, unknown> | null, ...kids: unknown[]) => Element;
let root: Element | undefined;
let tree: unknown;
/** draws a part as a screen would, under Material */
const draw = (part: unknown, props: Record<string, unknown> = {}) => {
  root = h(ThemeProvider, { theme: MATERIAL }, h(part, props));
  tree = tiny.render(root, (t) => typeof t === "function");
};
/** draws the same again, as after a change */
const again = () => (tree = tiny.render(root, (t) => typeof t === "function"));
const all = () => tiny.elements(tree);
const named = (label: string) => all().find((e) => e.props.ariaLabel === label);
const of = (type: string) => all().filter((e) => e.type === type);
const words = () => all().flatMap((e) => (e.type === "View" && (typeof e.props.children === "string" || typeof e.props.children === "number") ? [String(e.props.children)] : []));
/** a press on a view: its handler with an event that stops there; a view held has none */
const press = (e: Element | undefined) => {
  if (!e) throw new Error("nothing to press");
  if (typeof e.props.onClick !== "function") throw new Error(`${String(e.props.ariaLabel)} cannot be pressed`);
  (e.props.onClick as (ev: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} });
  again();
};
/** the Surface a button is drawn on (a kit button is a Surface, its handler `onPress`) */
const button = (label: string) => all().find((e) => typeof e.type === "function" && e.props.label === label && "onPress" in e.props);
/** a press on a kit button */
const tap = (label: string) => {
  const run = button(label)?.props.onPress;
  if (typeof run !== "function") throw new Error(`no button "${label}" to press`);
  (run as () => void)();
  again();
};

beforeEach(() => tiny.reset());

describe("the pickers", () => {
  it("a native select and a combobox open the platform's picker and hand the option chosen out", () => {
    const onChange = mock(() => {});
    draw(P.NativeSelect, { items: [{ label: "One" }, { label: "Two" }], selected: 0, onChange, ariaLabel: "Count", required: true });
    const picker = of("Picker")[0];
    expect(picker.props.range).toEqual(["One", "Two"]);
    (picker.props.onChange as (e: { detail: { value: number } }) => void)({ detail: { value: 1 } });
    expect(onChange).toHaveBeenCalledWith(1);
    expect(named("Count *")).toBeDefined();
    draw(P.Combobox, { items: [{ label: "Astro" }], selected: 0, clear: true, placeholder: "Pick" });
    press(named("Clear"));
    expect(words()).toContain("Pick");
  });

  it("a calendar picks a range and hands its two ends out", () => {
    const onChange = mock(() => {});
    draw(P.Calendar, { mode: "range", month: "2026-03", value: "2026-03-02", onChange });
    expect(words()).toContain("March 2026");
    press(named("2026-03-05"));
    expect(onChange).toHaveBeenCalledWith("2026-03-02,2026-03-05");
    draw(P.Calendar, { mode: "range", month: "2026-03", value: "2026-03-02,2026-03-05", readOnly: true });
    expect(named("2026-03-04")?.props.ariaSelected).toBe(true);
    expect(named("2026-03-04")?.props.onClick).toBeUndefined();
  });

  it("a color field hands out a color once what is typed is one", () => {
    const onChange = mock(() => {});
    draw(P.ColorField, { label: "Accent", value: "#6750A4", onChange });
    const input = of("Input")[0];
    (input.props.onInput as (e: { detail: { value: string } }) => void)({ detail: { value: "#38" } });
    expect(onChange).not.toHaveBeenCalled();
    (input.props.onInput as (e: { detail: { value: string } }) => void)({ detail: { value: "386A20" } });
    expect(onChange).toHaveBeenCalledWith("#386a20");
  });

  it("a choice given its value shows it as given, and hands out what is picked", () => {
    const onChange = mock(() => {});
    draw(P.ItemPicker, { items: [{ label: "Home" }, { label: "Work" }], selected: 0, onChange });
    press(named("Work"));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(named("Home")?.props.ariaChecked).toBe(true);
    draw(P.ColorPalette, { colors: "#6750A4,nope,#386A20", selected: 0 });
    expect(named("nope")).toBeUndefined();
    press(named("#386A20"));
    expect(named("#386A20")?.props.ariaChecked).toBe(true);
  });

  it("several choices keep a draft that starts over when what they are given changes", () => {
    draw(P.MultiSelect, { items: [{ label: "A" }, { label: "B" }], selected: "1" });
    press(named("B"));
    expect(named("B")?.props.ariaChecked).toBe(true);
    draw(P.MultiSelect, { items: [{ label: "A" }, { label: "B" }], selected: "" });
    expect(named("A")?.props.ariaChecked).toBe(false);
    expect(named("B")?.props.ariaChecked).toBe(false);
  });

  it("a wheel and a number picker step to what is tapped, kept to the range", () => {
    const wheel = mock(() => {});
    draw(P.WheelPicker, { items: [{ label: "5" }, { label: "10" }], selected: 0, onChange: wheel });
    press(all().filter((e) => e.props.ariaRole === "option")[1]);
    expect(wheel).toHaveBeenCalledWith(1);
    const n = mock(() => {});
    draw(P.NumberPicker, { value: 10, max: 10, onChange: n });
    expect(named("Increase")?.props.onClick).toBeUndefined();
    press(named("Decrease"));
    expect(n).toHaveBeenCalledWith(9);
  });

  it("a transfer list moves the rows ticked", () => {
    const onChange = mock(() => {});
    draw(P.TransferList, { items: [{ label: "View" }, { label: "Edit" }, { label: "Bill" }], chosen: "3", onChange });
    press(named("Edit"));
    expect(words()).toContain("1 / 2");
    press(named("Move right"));
    expect(onChange).toHaveBeenCalledWith("3,2");
  });

  it("a region picker opens a level once the one above is picked", () => {
    const data = { columns: ["P", "C"], rows: [["Zhejiang", "Hangzhou"], ["Zhejiang", "Ningbo"]] };
    draw(P.RegionPicker, { label: "Area", data, action: "Confirm" });
    expect(all().some((e) => e.props.children === "Ningbo")).toBe(false);
    press(all().find((e) => e.props.ariaRole === "option"));
    press(all().filter((e) => e.props.ariaRole === "option").at(-1));
    expect(words()).toContain("Zhejiang / Ningbo");
  });

  it("a seat map holds the taken seats and picks at most so many", () => {
    const onChange = mock(() => {});
    draw(P.SeatMap, { rows: 2, columns: 3, taken: "A2", most: 1, picked: "B1", onChange });
    expect(named("A2")?.props.onClick).toBeUndefined();
    press(named("A3"));
    expect(onChange).not.toHaveBeenCalled();
    press(named("B1"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("the entry parts", () => {
  it("an input group hands out what is typed and runs its button's place", () => {
    const onChange = mock(() => {});
    const go = mock(() => {});
    draw(E.InputGroup, { placeholder: "Search", button: "Go", onChange, taps: { button: go } });
    (of("Input")[0].props.onInput as (e: { detail: { value: string } }) => void)({ detail: { value: "lamp" } });
    expect(onChange).toHaveBeenCalledWith("lamp");
    tap("Go");
    expect(go).toHaveBeenCalled();
  });

  it("a code keeps to its length", () => {
    const onChange = mock(() => {});
    draw(E.InputOtp, { length: 4, onChange });
    (of("Input")[0].props.onInput as (e: { detail: { value: string } }) => void)({ detail: { value: "12345" } });
    expect(onChange).toHaveBeenCalledWith("1234");
  });

  it("a field stars its label while required and shows its error's message", () => {
    draw(E.Field, { label: "Email", required: true, error: "Not an address" });
    expect(words()).toEqual(expect.arrayContaining(["Email *", "Not an address"]));
  });

  it("a copy row hands its words to what copies them", () => {
    const onCopy = mock(() => {});
    draw(E.CopyRow, { text: "npm run deploy", onCopy });
    press(named("Copy"));
    expect(onCopy).toHaveBeenCalledWith("npm run deploy");
    expect(named("Copied")).toBeDefined();
  });

  it("a quantity steps inside its range, each step a place of its own", () => {
    const onChange = mock(() => {});
    const dec = mock(() => {});
    draw(E.QuantityStepper, { value: 2, max: 2, onChange, taps: { dec } });
    expect(named("Increase")?.props.onClick).toBeUndefined();
    press(named("Decrease"));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(dec).toHaveBeenCalled();
  });

  it("tags: one typed is added when sent, one taken away, each said", () => {
    const onChange = mock(() => {});
    const onAdd = mock(() => {});
    const onRemove = mock(() => {});
    draw(E.TagInput, { items: "Design\nPrototype", onChange, onAdd, onRemove });
    (of("Input")[0].props.onConfirm as (e: { detail: { value: string } }) => void)({ detail: { value: "Ship" } });
    expect(onChange).toHaveBeenCalledWith(["Design", "Prototype", "Ship"]);
    expect(onAdd).toHaveBeenCalledWith("Ship");
    press(named("Remove Design"));
    expect(onRemove).toHaveBeenCalledWith("Design");
  });

  it("a number pad types, confirms with what is typed, and says sent only as it is given", () => {
    const onSubmit = mock(() => {});
    draw(E.NumberPad, { mode: "amount", prefix: "$", action: "Pay", done: "Sent", onSubmit });
    press(named("4"));
    press(named("2"));
    expect(words()).toContain("$42");
    tap("Pay");
    expect(onSubmit).toHaveBeenCalledWith("42");
    expect(button("Sent")).toBeUndefined();
    draw(E.NumberPad, { action: "Pay", done: "Sent", value: "42", sent: true });
    expect(button("Sent")).toBeDefined();
  });

  it("a signature pad draws a stroke where the finger goes and hands it out when it lifts", () => {
    const onChange = mock(() => {});
    const clear = mock(() => {});
    draw(E.SignaturePad, { hint: "Sign here", clear: "Clear", action: "Done", onChange, taps: { clear } });
    const pad = () => named("Sign here")!;
    const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
    (pad().props.onTouchStart as (e: unknown) => void)(touch(110, 220));
    again();
    (pad().props.onTouchMove as (e: unknown) => void)(touch(130, 240));
    again();
    (pad().props.onTouchEnd as (e: unknown) => void)(touch(130, 240));
    expect(onChange).toHaveBeenCalledWith("M10.0 20.0 L10.0 20.0 L30.0 40.0");
    draw(E.SignaturePad, { hint: "Sign here", clear: "Clear", action: "Done", value: "M1 1 L2 2", taps: { clear } });
    expect(of("Image").length).toBe(1);
    tap("Clear");
    expect(clear).toHaveBeenCalled();
  });

  it("words with a toolbar: a mark is their look, the words are the value", () => {
    const onChange = mock(() => {});
    draw(E.RichTextEditor, { text: "Hello", onChange });
    expect(words()).toContain("5");
    press(named("Bold"));
    expect(named("Bold")?.props.ariaSelected).toBe(true);
    expect((of("Textarea")[0].props.style as Record<string, unknown>).fontWeight).toBe(700);
    (of("Textarea")[0].props.onInput as (e: { detail: { value: string } }) => void)({ detail: { value: "Hello there" } });
    expect(onChange).toHaveBeenCalledWith("Hello there");
  });
});
