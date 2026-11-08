import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Element } from "../../lib/actions/consistency/tinyReact";

/* The widgets' state and outlets (docs/组件规范.md "组件的状态和出口"), each part on its own: run headless on the small
 * stand-in React (lib/actions/consistency/tinyReact.ts), its controls left as data with their handlers to press. For
 * each kind of part what the spec asks:
 *   - an input: controlled while someone takes its value (the prop shows, a change only goes out, a change turned down
 *     shows turned down); a draft with nobody taking it, starting over when the prop changes (the external reset)
 *   - a part that acts out a domain result: a product shows what it is given and only asks; a prototype's demo acts it
 *     out, and starts over from what it is given
 *   - picked rows keep who they are when the data moves; a control of its own keeps its press unless it is wired
 *   - the defects report 3.5 lists, each pinned
 * The preview's side (what it hands a widget and draws it with again) is checked at the end with lib/interact. */

vi.mock("react", async () => (await import("../../lib/actions/consistency/tiny")).tiny.react);
vi.mock("react/jsx-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("react/jsx-dev-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("react-dom", () => ({ createPortal: (c: unknown) => c }));
vi.mock("@/components/m3e/button", () => ({ Button: "Button" }));
vi.mock("@/components/m3e/checkbox", () => ({ Checkbox: "Checkbox" }));
vi.mock("@/components/m3e/chip", () => ({ Chip: "Chip", FilterChip: "FilterChip", InputChip: "InputChip" }));
vi.mock("@/components/m3e/input", () => ({ Input: "Input" }));
vi.mock("@/components/m3e/text-field", () => ({ TextField: "TextField" }));
vi.mock("@/components/m3e/table", () => ({ Table: "Table", TableBody: "TableBody", TableCell: "TableCell", TableHead: "TableHead", TableHeader: "TableHeader", TableRow: "TableRow" }));
vi.mock("@/components/m3e/switch", () => ({ Switch: "Switch" }));
vi.mock("@/components/m3e/avatar", () => ({ Avatar: "Avatar", AvatarFallback: "AvatarFallback", AvatarImage: "AvatarImage" }));
vi.mock("@/components/m3e/icon", () => ({ Icon: "Icon" }));
vi.mock("@/components/m3e/progress", () => ({ Progress: "Progress" }));
vi.mock("@/components/m3e/loading-indicator", () => ({ LoadingIndicator: "LoadingIndicator" }));
vi.mock("@/components/m3e/ripple", () => ({ Ripple: "Ripple" }));
vi.mock("@/components/m3e/say", () => ({ pageLocale: () => "en" }));
vi.mock("@/components/m3e/reduced-motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("../icons", () => ({ ensureIcons: () => {}, useIconVersion: () => 0 }));

const { tiny } = await import("../../lib/actions/consistency/tiny");
const { createElement } = tiny.react;
const { PartHostContext } = await import("./host");
const { amountOf, keysOf } = await import("./seed");
const Inputs = await import("./Inputs");
const { Rating } = await import("./Rating");
const { QuantityStepper } = await import("./QuantityStepper");
const { ColorField } = await import("./ColorField");
const { Joystick } = await import("./Joystick");
const { SortableList } = await import("./Content");
const Motion = await import("./Motion");
const Draws = await import("./Draws");
const Game = await import("./GameParts");
const Panels = await import("./Panels");
const App = await import("./AppParts");
const Tools = await import("./AppTools");
const More = await import("./AppMore");

type Host = { demo?: boolean; input?: (v: unknown) => void; emit?: (name: string, payload?: Record<string, unknown>) => void; wired?: (slot: string) => boolean };
type Widget = (p: never) => unknown;
type Press = { stopped: boolean };

/** A widget drawn headless: its props can change, what it draws can be read and pressed. `host` is what the preview
 *  would hand it (a demo, an input it takes, an event it runs); left out, nobody draws it but the widget itself. */
function mount(W: Widget, props: Record<string, unknown> = {}, host?: Host) {
  let now = props;
  let tree: unknown;
  const draw = () => {
    const el = createElement(W as never, now as never);
    tree = tiny.render(host ? createElement(PartHostContext.Provider as never, { value: host } as never, el) : el, (t) => t === W);
  };
  draw();
  const all = () => tiny.elements(tree).slice(1);
  const one = (match: (e: Element) => boolean, what: string) => {
    const e = all().find(match);
    if (!e) throw new Error(`nothing drawn is ${what}`);
    return e;
  };
  const by = (attr: string, value: unknown) => one((e) => e.props[attr] === value, `${attr}=${String(value)}`);
  /** a press, and the widget drawn again; `redraw` false leaves that to what the press set off (a host's effects) */
  const press = (e: Element, how = "onClick", arg?: unknown, redraw = true): Press => {
    const out = { stopped: false };
    const fn = e.props[how] as ((x: unknown) => void) | undefined;
    if (!fn) throw new Error(`it has no ${how}`);
    fn(arg ?? { stopPropagation: () => (out.stopped = true), preventDefault: () => {}, target: { closest: () => null }, currentTarget: { children: [] } });
    if (redraw) draw();
    return out;
  };
  return {
    all,
    by,
    one,
    press,
    tap: (attr: string, value: unknown) => press(by(attr, value)),
    /** the widget's own root: the first element it draws with this data-slot */
    root: (slot: string) => by("data-slot", slot).props,
    set: (next: Record<string, unknown>) => {
      now = { ...now, ...next };
      draw();
    },
    draw,
  };
}

/** a host that takes the value (the preview, a bound variable) and remembers what was handed out and sent */
function taking(extra: Host = {}) {
  const given: unknown[] = [];
  const sent: [string, Record<string, unknown> | undefined][] = [];
  return { host: { input: (v: unknown) => given.push(v), emit: (n: string, p?: Record<string, unknown>) => sent.push([n, p]), ...extra } as Host, given, sent };
}

beforeEach(() => {
  tiny.reset();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => {
  vi.useRealTimers();
});

/* ---------- inputs ---------- */

type InputCase = {
  name: string;
  W: Widget;
  slot: string;
  attr: string;
  /** the prop that holds the value, two values for it, and what a press hands out when it holds the first */
  prop: string;
  a: unknown;
  b: unknown;
  shown?: (v: unknown) => unknown;
  /** presses something, starting from `a`, and says what it hands out */
  act: (m: ReturnType<typeof mount>) => unknown;
  base?: Record<string, unknown>;
};

const CASES: InputCase[] = [
  { name: "rating", W: Rating as Widget, slot: "rating", attr: "data-value", prop: "value", a: 2, b: 4, act: (m) => (m.press(m.all().filter((e) => e.props["data-slot"] === "rating-star")[4]), 5) },
  { name: "number picker", W: Inputs.NumberPicker as Widget, slot: "number-picker", attr: "data-value", prop: "value", a: 5, b: 7, base: { min: 0, max: 10 }, act: (m) => (m.tap("aria-label", "Increase"), 6) },
  { name: "quantity stepper", W: QuantityStepper as Widget, slot: "quantity-stepper", attr: "data-value", prop: "value", a: 2, b: 9, act: (m) => (m.tap("data-tap", "inc"), 3) },
  { name: "item picker", W: Inputs.ItemPicker as Widget, slot: "item-picker", attr: "data-selected", prop: "selected", a: 0, b: 2, base: { items: [{ label: "A" }, { label: "B" }, { label: "C" }] }, act: (m) => (m.press(m.all().filter((e) => e.props.role === "radio")[1]), 1) },
  { name: "color palette", W: Inputs.ColorPalette as Widget, slot: "color-palette", attr: "data-selected", prop: "selected", a: 0, b: 2, shown: (v) => ["#111111", "#222222", "#333333"][v as number], base: { colors: ["#111111", "#222222", "#333333"] }, act: (m) => (m.press(m.all().filter((e) => e.props.role === "radio")[1]), 1) },
  { name: "multiple choice", W: Inputs.MultiSelect as Widget, slot: "multi-select", attr: "data-selected", prop: "selected", a: "1", b: "2,3", shown: (v) => String(v).split(",").map((n) => Number(n) - 1).join(","), base: { items: ["A", "B", "C"] }, act: (m) => (m.press(m.all().filter((e) => e.type === "FilterChip")[2], "onPressedChange", true), "1,3") },
  { name: "tag input", W: Inputs.TagInput as Widget, slot: "tag-input", attr: "data-count", prop: "items", a: ["x", "y"], b: ["x"], shown: (v) => (v as string[]).length, act: (m) => (m.press(m.all().filter((e) => e.type === "InputChip")[0], "onRemove", undefined), ["y"]) },
  { name: "sortable list", W: SortableList as Widget, slot: "sortable-list", attr: "data-order", prop: "items", a: ["a", "b", "c"], b: ["c", "a", "b"], shown: (v) => (v as string[]).join("|"), act: (m) => (m.press(m.all().filter((e) => e.props["data-slot"] === "sortable-list-row")[0], "onKeyDown", { altKey: true, key: "ArrowDown", preventDefault() {}, currentTarget: { parentElement: null } }), ["b", "a", "c"]) },
  { name: "color field", W: ColorField as Widget, slot: "color-field", attr: "data-color", prop: "value", a: "#112233", b: "#445566", shown: (v) => v, act: (m) => (m.press(m.one((e) => e.type === "input", "the color well"), "onChange", { target: { value: "#abcdef" } }), "#abcdef") },
  { name: "balance card", W: App.BalanceCard as Widget, slot: "balance-card", attr: "data-masked", prop: "hidden", a: false, b: true, shown: (v) => (v ? true : undefined), act: (m) => (m.tap("aria-label", "Hide"), true) },
  { name: "transactions' filter", W: App.TransactionList as Widget, slot: "transaction-list", attr: "data-filter", prop: "filter", a: 0, b: 2, base: { filters: ["All", "In", "Out"], rows: [["A", "", "+1", "in"]] }, act: (m) => (m.press(m.all().filter((e) => e.type === "FilterChip")[1], "onPressedChange", true), 1) },
  { name: "transfer list", W: Tools.TransferList as Widget, slot: "transfer-list", attr: "data-right", prop: "chosen", a: "2", b: "1,3", shown: (v) => String(v).split(",").map((n) => Number(n) - 1).join(","), base: { items: ["A", "B", "C"] }, act: (m) => (m.press(m.all().filter((e) => e.props["data-row"] === 0)[0]), m.tap("aria-label", "Move right"), "2,1") },
  { name: "region picker", W: More.RegionPicker as Widget, slot: "region-picker", attr: "data-value", prop: "value", a: "", b: "G/S", shown: (v) => v, base: { rows: [["G", "S", "N"], ["Z", "H", "X"]] }, act: (m) => (m.press(m.all().filter((e) => e.props.role === "option")[1]), "Z") },
  { name: "seat map", W: More.SeatMap as Widget, slot: "seat-map", attr: "data-picked", prop: "picked", a: "", b: "B2", shown: (v) => v, base: { rows: 2, columns: 2 }, act: (m) => (m.tap("data-seat", "A1"), "A1") },
  { name: "onboarding", W: Tools.Onboarding as Widget, slot: "onboarding", attr: "data-page", prop: "page", a: 0, b: 2, base: { rows: [["a", "A", ""], ["b", "B", ""], ["c", "C", ""]], next: "Next", done: "Go" }, act: (m) => (m.tap("data-tap", "next"), 1) },
  { name: "image viewer", W: More.ImageViewer as Widget, slot: "image-viewer", attr: "data-index", prop: "index", a: 0, b: 2, base: { images: [{ label: "a" }, { label: "b" }, { label: "c" }] }, act: (m) => (m.tap("data-tap", "tab:1"), 1) },
  { name: "swipe row", W: Motion.SwipeRow as Widget, slot: "swipe-row", attr: "data-open", prop: "open", a: false, b: true, shown: (v) => (v ? true : undefined), base: { title: "Row", action: "Delete" }, act: (m) => (m.press(m.by("data-slot", "swipe-row-face"), "onKeyDown", { key: "ArrowLeft", preventDefault() {} }), true) },
  { name: "audio player", W: Motion.AudioPlayer as Widget, slot: "audio-player", attr: "data-playing", prop: "playing", a: false, b: true, shown: (v) => (v ? true : undefined), act: (m) => (m.tap("data-tap", "toggle"), true) },
  { name: "number pad", W: Tools.NumberPad as Widget, slot: "number-pad", attr: "data-entry", prop: "value", a: "1", b: "42", shown: (v) => v, base: { mode: "phone" }, act: (m) => (m.tap("data-key", "7"), "17") },
  { name: "joystick", W: Joystick as Widget, slot: "joystick", attr: "data-value", prop: "value", a: "0,0", b: "0,-1", shown: (v) => v, act: () => undefined },
];

describe("an input", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s follows the value it is given while someone takes it", (_, c) => {
    const { host } = taking();
    const m = mount(c.W, { ...c.base, [c.prop]: c.a }, host);
    const shown = c.shown ?? ((v: unknown) => v);
    expect(m.root(c.slot)[c.attr]).toEqual(shown(c.a));
    m.set({ [c.prop]: c.b });
    expect(m.root(c.slot)[c.attr]).toEqual(shown(c.b));
  });

  it.each(CASES.filter((c) => c.name !== "joystick").map((c) => [c.name, c] as const))("%s hands a change out and shows it turned down when it is", (_, c) => {
    const { host, given } = taking();
    const m = mount(c.W, { ...c.base, [c.prop]: c.a }, host);
    const out = c.act(m);
    expect(given.at(-1)).toEqual(out);
    /* the other side kept the old value: that is what shows, never the visitor's own copy */
    m.draw();
    expect(m.root(c.slot)[c.attr]).toEqual((c.shown ?? ((v: unknown) => v))(c.a));
  });

  it.each(CASES.filter((c) => c.name !== "joystick").map((c) => [c.name, c] as const))("%s keeps a draft with nobody taking it, and starts over when the prop changes", (_, c) => {
    const m = mount(c.W, { ...c.base, [c.prop]: c.a });
    const shown = c.shown ?? ((v: unknown) => v);
    const out = c.act(m);
    expect(m.root(c.slot)[c.attr]).toEqual(shown(out));
    m.set({ [c.prop]: c.b });
    expect(m.root(c.slot)[c.attr]).toEqual(shown(c.b));
  });
});

/* ---------- what a product shows, and what a demo acts out ---------- */

type DemoCase = {
  name: string;
  W: Widget;
  slot: string;
  attr: string;
  base?: Record<string, unknown>;
  /** what the visitor does */
  act: (m: ReturnType<typeof mount>) => void;
  /** the attribute before, and after the demo acted */
  before: unknown;
  acted: unknown;
  /** what the other side gives, and how it shows; with the demo, what it acted out on a row still there stays */
  given: Record<string, unknown>;
  shows: unknown;
  demoShows?: unknown;
};

const DEMOS: DemoCase[] = [
  { name: "product card's heart", W: App.ProductCard as Widget, slot: "product-card", attr: "data-liked", act: (m) => m.tap("data-tap", "like"), before: undefined, acted: true, given: { liked: true }, shows: true },
  { name: "product card's cart", W: App.ProductCard as Widget, slot: "product-card", attr: "data-added", base: { action: "Add" }, act: (m) => m.tap("data-tap", "action"), before: undefined, acted: 1, given: { added: 3 }, shows: 3 },
  { name: "post's like", W: App.PostCard as Widget, slot: "post-card", attr: "data-liked", act: (m) => m.press(m.by("tap", "like")), before: undefined, acted: true, given: { liked: true }, shows: true },
  { name: "post's bookmark", W: App.PostCard as Widget, slot: "post-card", attr: "data-kept", act: (m) => m.tap("data-tap", "save"), before: undefined, acted: true, given: { saved: true }, shows: true },
  { name: "route card", W: App.RouteCard as Widget, slot: "route-card", attr: "data-booked", base: { action: "Book", done: "Booked" }, act: (m) => m.tap("data-tap", "action"), before: undefined, acted: true, given: { booked: true }, shows: true },
  { name: "profile header", W: App.ProfileHeader as Widget, slot: "profile-header", attr: "data-following", base: { action: "Follow" }, act: (m) => m.tap("data-tap", "action"), before: undefined, acted: true, given: { following: true }, shows: true },
  { name: "reward track", W: Panels.RewardTrack as Widget, slot: "reward-track", attr: "data-claimed", base: { value: 30, rewards: [{ at: 10, label: "a" }, { at: 20, label: "b" }, { at: 90, label: "c" }] }, act: (m) => m.tap("data-tap", "tab:0"), before: 0, acted: 1, given: { claimed: "1,2" }, shows: 2 },
  { name: "check-in", W: Panels.CheckIn as Widget, slot: "check-in", attr: "data-signed", base: { signed: 3 }, act: (m) => m.tap("data-tap", "today"), before: 3, acted: 4, given: { signed: 5 }, shows: 5 },
  { name: "playlist", W: App.Playlist as Widget, slot: "playlist", attr: "data-playing", base: { rows: [["a"], ["b"]], selected: 0 }, act: (m) => m.tap("data-tap", "tab:0"), before: undefined, acted: true, given: { playing: true }, shows: true },
  { name: "file list", W: App.FileList as Widget, slot: "file-list", attr: "data-count", base: { rows: [["a.pdf"], ["b.png"]] }, act: (m) => m.tap("data-tap", "remove:0"), before: 2, acted: 1, given: { rows: [["b.png"]] }, shows: 1 },
  { name: "icon grid", W: App.IconGrid as Widget, slot: "icon-grid", attr: "data-opened", base: { items: [{ label: "a", mark: "dot" }, { label: "b" }] }, act: (m) => m.tap("data-tap", "tab:0"), before: "", acted: "0", given: { items: [{ label: "b", mark: "dot" }, { label: "a" }] }, shows: "", demoShows: "1" },
  { name: "story row", W: App.StoryRow as Widget, slot: "story-row", attr: "data-seen", base: { items: ["Me", "Ada", "Bo"] }, act: (m) => m.tap("data-tap", "tab:1"), before: "", acted: "1", given: { items: ["Me", { label: "Bo", seen: true }, "Ada"] }, shows: "1", demoShows: "1,2" },
  { name: "signature pad", W: Tools.SignaturePad as Widget, slot: "signature-pad", attr: "data-signed", base: { action: "Done", value: "M1 1 L2 2" }, act: (m) => m.tap("data-tap", "done"), before: undefined, acted: true, given: { signed: true }, shows: true },
  { name: "image cropper", W: More.ImageCropper as Widget, slot: "image-cropper", attr: "data-done", base: { action: "Crop", doneText: "Done" }, act: (m) => m.tap("data-tap", "done"), before: undefined, acted: true, given: { cropped: true }, shows: true },
  { name: "game board", W: Game.GameBoard as Widget, slot: "game-board", attr: "data-board", base: { rows: 1, columns: 3 }, act: (m) => m.tap("data-tap", "cell:1"), before: ",,", acted: ",X,", given: { cells: "O,,X" }, shows: "O,,X" },
  { name: "dialogue box", W: Game.DialogueBox as Widget, slot: "dialogue-box", attr: "data-line", base: { lines: ["one", "two", "three"] }, act: (m) => m.tap("data-tap", "next"), before: 0, acted: 1, given: { line: 2 }, shows: 2 },
  { name: "kanban", W: Tools.Kanban as Widget, slot: "kanban", attr: "data-counts", base: { columns: ["To do", "Done"], rows: [["a", ""], ["b", ""]] }, act: (m) => (m.press(m.all().filter((e) => e.props["aria-pressed"] !== undefined)[0]), m.tap("aria-label", "Move right")), before: "2,0", acted: "1,1", given: { rows: [["a", ""], ["", "b"]] }, shows: "1,1" },
  { name: "seat map's total", W: More.SeatMap as Widget, slot: "seat-map", attr: "data-total", base: { rows: 1, columns: 2, price: 5, currency: "$" }, act: (m) => m.tap("data-seat", "A1"), before: undefined, acted: "$5", given: { total: "$9.50" }, shows: "$9.50" },
];

describe("a part that acts out a domain result", () => {
  it.each(DEMOS.map((c) => [c.name, c] as const))("%s: in a product shows what it is given and only asks", (_, c) => {
    const m = mount(c.W, { ...c.base });
    expect(m.root(c.slot)[c.attr]).toEqual(c.before);
    c.act(m);
    expect(m.root(c.slot)[c.attr]).toEqual(c.before);
    m.set(c.given);
    expect(m.root(c.slot)[c.attr]).toEqual(c.shows);
  });

  it.each(DEMOS.map((c) => [c.name, c] as const))("%s: a prototype's demo acts it out, and starts over from what it is given", (_, c) => {
    const m = mount(c.W, { ...c.base }, { demo: true });
    c.act(m);
    expect(m.root(c.slot)[c.attr]).toEqual(c.acted);
    m.set(c.given);
    expect(m.root(c.slot)[c.attr]).toEqual(c.demoShows ?? c.shows);
  });
});

describe("a prize machine", () => {
  const prizes = Array.from({ length: 10 }, (_, i) => ({ label: `P${i}` }));
  const settle = () => vi.advanceTimersByTime(2000);

  it("waits for the answer that comes after a press, settles on it and says so", () => {
    vi.useFakeTimers();
    const { host, sent } = taking();
    const m = mount(Draws.Wheel as Widget, { prizes, label: "Spin" }, host);
    m.tap("data-tap", "action");
    expect(m.root("wheel")["data-phase"]).toBe("pending");
    settle();
    m.draw();
    expect(m.root("wheel")["data-phase"]).toBe("pending");
    m.set({ result: 3 });
    settle();
    m.draw();
    expect(m.root("wheel")["data-result"]).toBe("P3");
    expect(sent).toContainEqual(["settled", { index: 3, label: "P3" }]);
    /* told no prize any more, it waits for a press again */
    m.set({ result: -1 });
    expect(m.root("wheel")["data-phase"]).toBe("idle");
  });

  it("holds while `pending` says a new answer is on its way, even with an old one there", () => {
    vi.useFakeTimers();
    const m = mount(Draws.Gacha as Widget, { prizes, label: "Go", result: 2 });
    /* the press's own action says a draw is pending before the machine looks again */
    m.press(m.by("data-tap", "action"), "onClick", undefined, false);
    m.set({ pending: true });
    settle();
    m.draw();
    expect(m.root("gacha")["data-phase"]).toBe("pending");
    expect(m.root("gacha")["data-result"]).toBeUndefined();
    m.set({ result: 4, pending: false });
    settle();
    m.draw();
    expect(m.root("gacha")["data-result"]).toBe("P4");
  });

  it("turns again for the same prize twice", () => {
    vi.useFakeTimers();
    const m = mount(Draws.Wheel as Widget, { prizes, label: "Spin", result: 1 });
    const turn = () => (m.root("wheel-track").style as { transform: string }).transform;
    m.tap("data-tap", "action");
    settle();
    m.draw();
    const first = turn();
    m.tap("data-tap", "action");
    settle();
    m.draw();
    expect(turn()).not.toBe(first);
    expect(m.root("wheel")["data-result"]).toBe("P1");
  });

  it("lights the cell of the prize it announces: a grid of eight has no ninth", () => {
    vi.useFakeTimers();
    const m = mount(Draws.GridWheel as Widget, { prizes, label: "Draw", result: 9 });
    m.tap("data-tap", "action");
    settle();
    m.draw();
    /* a result the grid cannot show is no answer */
    expect(m.root("grid-wheel")["data-phase"]).toBe("pending");
    m.set({ result: 5 });
    settle();
    m.draw();
    const lit = m.all().filter((e) => e.props["data-slot"] === "grid-wheel-cell" && e.props["data-lit"]);
    expect(lit).toHaveLength(1);
    expect(JSON.stringify(lit[0].props.children)).toContain("P5");
    expect(m.root("grid-wheel")["data-result"]).toBe("P5");
  });

  it("lets an egg be smashed again once one has", () => {
    vi.useFakeTimers();
    const m = mount(Draws.EggSmash as Widget, { prizes, label: "Pick", result: 0 });
    m.tap("data-tap", "egg:0");
    settle();
    m.draw();
    expect(m.by("data-tap", "egg:2").props.disabled).toBe(false);
    m.tap("data-tap", "egg:2");
    expect(m.root("egg-smash")["data-egg"]).toBe(2);
  });

  it("shows a miss as unlike reels", () => {
    vi.useFakeTimers();
    const m = mount(Draws.SlotMachine as Widget, { prizes, label: "Pull", result: 3, reels: "0,2,1" });
    m.tap("data-tap", "action");
    settle();
    m.draw();
    const reels = m.all().filter((e) => e.props["data-slot"] === "slot-machine-cell").map((e) => JSON.stringify(e.props.children));
    expect(reels.map((r) => r.match(/P\d/)?.[0])).toEqual(["P0", "P2", "P1"]);
  });

  it("draws at random only in a prototype's demo", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.55);
    const product = mount(Draws.MoneyTree as Widget, { prizes, label: "Shake" });
    product.tap("data-tap", "action");
    settle();
    product.draw();
    expect(random).not.toHaveBeenCalled();
    expect(product.root("money-tree")["data-phase"]).toBe("pending");
    tiny.reset();
    const demo = mount(Draws.MoneyTree as Widget, { prizes, label: "Shake" }, { demo: true });
    demo.tap("data-tap", "action");
    settle();
    demo.draw();
    expect(demo.root("money-tree")["data-result"]).toBe("P5");
    random.mockRestore();
  });
});

describe("a time read off the other side's clock", () => {
  it("a skill cools down until `endsAt`, and only a demo starts a cooldown itself", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const m = mount(Game.SkillButton as Widget, { label: "Dash", cooldown: 5 });
    m.tap("data-tap", "action");
    expect(m.root("skill-button")["data-cooling"]).toBeUndefined();
    m.set({ endsAt: 1_003_000 });
    expect(m.root("skill-button")["data-cooling"]).toBe(true);
    /* its label is no press while it cools down */
    expect(m.press(m.by("data-slot", "skill-button-label")).stopped).toBe(true);
    tiny.reset();
    const demo = mount(Game.SkillButton as Widget, { label: "Dash", cooldown: 5 }, { demo: true });
    demo.tap("data-tap", "action");
    expect(demo.root("skill-button")["data-cooling"]).toBe(true);
  });

  it("a function button counts down to `endsAt` and shows `timer` only as words, never starting over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
    const m = mount(Panels.FunctionButton as Widget, { label: "Event", timer: 3, unit: "minute" });
    expect(m.root("function-button")["data-left"]).toBe(180);
    vi.advanceTimersByTime(5000);
    m.draw();
    expect(m.root("function-button")["data-left"]).toBe(180);
    vi.setSystemTime(5_000_000);
    m.set({ endsAt: 5_060_000 });
    expect(m.root("function-button")["data-left"]).toBe(60);
    vi.setSystemTime(5_030_000);
    m.draw();
    expect(m.root("function-button")["data-left"]).toBe(30);
  });

  it("a timer runs on `endsAt` while `running`, and says when it ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { host, sent } = taking();
    const m = mount(Motion.Timer as Widget, { seconds: 60 }, host);
    m.tap("data-tap", "toggle");
    expect(m.root("timer")["data-running"]).toBeUndefined();
    m.set({ running: true, endsAt: 2000 });
    expect(m.root("timer")["data-left"]).toBe(2);
    vi.setSystemTime(2000);
    vi.advanceTimersByTime(1000);
    m.draw();
    expect(m.root("timer")["data-left"]).toBe(0);
    expect(sent.map(([n]) => n)).toContain("ended");
  });
});

describe("rows that keep who they are", () => {
  it("rows checked in a data table stay checked when the data moves, and drop out when they go", () => {
    const { host, sent } = taking();
    const rows = [["A-1", "x"], ["A-2", "y"], ["A-3", "z"]];
    const m = mount(Tools.DataTable as Widget, { columns: ["Order", "Name"], rows }, host);
    const box = (cell: string) => m.one((e) => e.type === "Checkbox" && e.props["aria-label"] === cell, cell);
    m.press(box("A-2"), "onCheckedChange", true);
    expect(sent.at(-1)).toEqual(["select", { rows: [1] }]);
    m.set({ rows: [rows[2], rows[1], rows[0]] });
    expect(m.root("data-table")["data-picked"]).toBe("1");
    m.set({ rows: [rows[0], rows[2]] });
    expect(m.root("data-table")["data-picked"]).toBe("");
  });

  it("a data table given `total` shows the rows as the other side cut them, and only asks for others", () => {
    const { host, sent } = taking();
    const rows = [["b"], ["a"]];
    const m = mount(Tools.DataTable as Widget, { columns: ["Name"], rows, total: 40, pageSize: 2, search: "Find" }, host);
    m.press(m.by("type", "search"), "onChange", { target: { value: "zzz" } });
    expect(m.root("data-table")["data-rows"]).toBe(40);
    expect(m.all().filter((e) => e.type === "TableRow" && e.props["data-tap"]).length).toBe(2);
    m.tap("aria-label", "Next");
    expect(sent).toContainEqual(["search", { query: "zzz" }]);
    expect(sent).toContainEqual(["page", { page: 1 }]);
  });

  it("ticks in a transfer list follow their rows", () => {
    const m = mount(Tools.TransferList as Widget, { items: ["A", "B", "C"], chosen: "" });
    m.press(m.all().filter((e) => e.props["data-row"] === 1)[0]);
    m.set({ items: ["B", "A", "C"] });
    const ticked = m.all().filter((e) => e.props.role === "checkbox" && e.props["aria-checked"]);
    expect(ticked.map((e) => e.props["data-row"])).toEqual([0]);
  });

  it("a removed file stays hidden in the demo when the rows move", () => {
    const m = mount(App.FileList as Widget, { rows: [["a.pdf"], ["b.png"], ["c.zip"]] }, { demo: true });
    m.tap("data-tap", "remove:1");
    m.set({ rows: [["b.png"], ["c.zip"], ["a.pdf"]] });
    expect(m.root("file-list")["data-count"]).toBe(2);
    expect(m.all().some((e) => e.props["data-tap"] === "remove:0")).toBe(false);
  });

  it("a reward the demo claimed stays claimed with its reward when the rows move, and goes with it", () => {
    const rewards = [{ at: 10, label: "a" }, { at: 20, label: "b" }, { at: 30, label: "c" }];
    const m = mount(Panels.RewardTrack as Widget, { value: 30, rewards }, { demo: true });
    m.tap("data-tap", "tab:1");
    const claimed = () => m.all().filter((e) => e.props["data-slot"] === "reward-track-cell" && e.props["data-claimed"]).map((e) => e.props["data-tap"]);
    expect(claimed()).toEqual(["tab:1"]);
    m.set({ rewards: [rewards[1], rewards[0], rewards[2]] });
    expect(claimed()).toEqual(["tab:0"]);
    m.set({ rewards: [rewards[0], rewards[2]] });
    expect(claimed()).toEqual([]);
  });

  it("a leaderboard's open row is the one it is given, never one of its own", () => {
    const m = mount(App.Leaderboard as Widget, { rows: [["Ada", "9"], ["Bo", "7"]], selected: -1 });
    /* a press on a row only reaches whoever draws it, which moves `selected` */
    expect(m.by("data-tap", "tab:0").props.onClick).toBeUndefined();
    expect(m.root("leaderboard")["data-selected"]).toBe(-1);
    m.set({ selected: 1 });
    expect(m.root("leaderboard")["data-selected"]).toBe(1);
  });

  it("two rows that read the same keep keys of their own", () => {
    expect(keysOf(["a", "b", "a"])).toHaveLength(3);
    expect(new Set(keysOf(["a", "b", "a"])).size).toBe(3);
    const m = mount(SortableList as Widget, { items: ["Same", "Same", "Other"] });
    const keys = m.all().filter((e) => e.props["data-slot"] === "sortable-list-row").map((e) => e.key);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("a control of the part's own", () => {
  it.each([
    ["product card's heart", App.ProductCard, {}, "like"],
    ["post's bookmark", App.PostCard, {}, "save"],
    ["file list's remove", App.FileList, { rows: [["a"]] }, "remove:0"],
    ["banner's close", App.Banner, { closable: true }, "close"],
    ["data table's row", Tools.DataTable, { columns: ["A"], rows: [["x"]] }, "row:0"],
  ] as const)("%s keeps its press to itself until something is wired to it", (_, W, props, slot) => {
    const loose = mount(W as Widget, props as Record<string, unknown>);
    expect(loose.tap("data-tap", slot).stopped).toBe(true);
    tiny.reset();
    const wired = mount(W as Widget, props as Record<string, unknown>, { wired: (s) => s === slot });
    expect(wired.tap("data-tap", slot).stopped).toBe(false);
  });

  it("a banner wired to close leaves closing to its action; unwired, it closes and opens again when its words change", () => {
    const wired = mount(App.Banner as Widget, { text: "Hi", closable: true }, { wired: (s) => s === "close" });
    wired.tap("data-tap", "close");
    expect(wired.root("banner")["data-closed"]).toBeUndefined();
    tiny.reset();
    const loose = mount(App.Banner as Widget, { text: "Hi", closable: true });
    loose.tap("data-tap", "close");
    expect(loose.root("banner")["data-closed"]).toBe("true");
    loose.set({ text: "Back again" });
    expect(loose.root("banner")["data-closed"]).toBeUndefined();
  });
});

describe("what report 3.5 found", () => {
  it("a joystick tells the middle from straight up", () => {
    const up = mount(Joystick as Widget, { value: "0,-1", size: 132 });
    expect(up.root("joystick")["data-angle"]).toBe(0);
    expect((up.root("joystick-handle").style as { top: string }).top).toBe("calc(50% + -42px)");
    tiny.reset();
    const middle = mount(Joystick as Widget, { value: "0,0", size: 132 });
    expect((middle.root("joystick-handle").style as { top: string }).top).toBe("calc(50% + 0px)");
  });

  it("a joystick hands out where the finger pushes, and says when it lets go", () => {
    const { host, given, sent } = taking();
    const m = mount(Joystick as Widget, { size: 100 }, host);
    const pad = m.by("data-slot", "joystick");
    const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: { setPointerCapture() {} } });
    /* a stand-in for the pad's box on the page */
    Object.assign(pad.props.ref as object, { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } });
    m.press(pad, "onPointerDown", at(50, 0));
    expect(given.at(-1)).toBe("0,-1");
    m.press(m.by("data-slot", "joystick"), "onPointerUp", at(50, 0));
    expect(sent.at(-1)).toEqual(["release", { x: 0, y: -1 }]);
    expect(given.at(-1)).toBe("0,0");
  });

  it("a palette keeps its pick when another color is mistyped", () => {
    const m = mount(Inputs.ColorPalette as Widget, { colors: ["nope", "#222222", "#333333"], selected: 2 });
    expect(m.root("color-palette")["data-selected"]).toBe("#333333");
  });

  it("a dialogue box's next line is a place of its own, and finishing a line being typed asks for nothing", () => {
    const m = mount(Game.DialogueBox as Widget, { lines: ["one", "two"] });
    expect(m.by("data-slot", "dialogue-words").props["data-tap"]).toBe("next");
  });

  it("a level map starts at the level its definition says", async () => {
    const { partBySlug, defaultValues } = await import("../registry");
    const def = partBySlug("level-map")!;
    expect(defaultValues(def).current).toBe(5);
    const m = mount(Game.LevelMap as Widget, {});
    expect(m.all().filter((e) => e.props["data-current"]).length).toBe(1);
    expect(m.all().findIndex((e) => e.props["data-current"])).toBe(m.all().findIndex((e) => e.props["aria-label"] === "5"));
  });

  it("a file upload declares the button its kits answer to", async () => {
    const { partBySlug, reader } = await import("../registry");
    const def = partBySlug("file-upload")!;
    expect(def.slots?.(reader(def, {})).map((s) => s.key)).toEqual(["action"]);
  });

  it("reads amounts with a decimal comma", () => {
    expect(amountOf("€12,50")).toBe(12.5);
    expect(amountOf("1.234,50")).toBe(1234.5);
    expect(amountOf("$1,280.50")).toBe(1280.5);
    expect(amountOf("-86.40")).toBe(-86.4);
    expect(amountOf("9,820")).toBe(9820);
    expect(amountOf("none")).toBe(0);
  });

  it("conversations show what the data says is unread, opened or not: opening a row only asks", () => {
    const m = mount(App.ConversationList as Widget, { rows: [["A", "hi", "now", "2"]] });
    expect(m.by("data-tap", "tab:0").props.onClick).toBeUndefined();
    expect(m.all().some((e) => e.props["data-slot"] === "conversation-row-badge")).toBe(true);
    m.set({ rows: [["A", "hi", "now", "0"]] });
    expect(m.all().some((e) => e.props["data-slot"] === "conversation-row-badge")).toBe(false);
  });

  it("a bar list shows the share the data gives", () => {
    const m = mount(App.BarList as Widget, { rows: [["A", "10", "80%"], ["B", "5", "20%"]], selected: 0 });
    expect(JSON.stringify(m.all().map((e) => e.props.children))).toContain("80%");
  });
});

/* ---------- the preview's side ---------- */

describe("in the preview", () => {
  it("an input it draws again with what the visitor entered, and with the variable's value when that is turned down", async () => {
    const { startState, writeField, liveItem, fieldValueOf } = await import("../../lib/interact");
    const { makeItem } = await import("../../lib/tokens");
    const { partBySlug, reader, treeOf } = await import("../registry");
    const doc = { groups: [], vars: [{ id: "n", name: "n", type: "number" as const, value: 2 }] };
    const item = { ...makeItem("rating"), id: "r", bind: { value: "n" } };
    let s = startState(doc.vars);
    const props = () => treeOf(partBySlug("rating")!, liveItem(item, s).props).props as Record<string, unknown>;
    const m = mount(Rating as Widget, props(), { input: (v) => (s = writeField(s, item, fieldValueOf(item, v)!, doc)) });
    m.press(m.all().filter((e) => e.props["data-slot"] === "rating-star")[3]);
    m.set(props());
    expect(m.root("rating")["data-value"]).toBe(4);
    /* bound to an expression nothing can write, a pick is turned down and the stars stay */
    const fixed = { ...item, bind: { value: "=3" } };
    s = startState(doc.vars);
    const fixedProps = () => treeOf(partBySlug("rating")!, liveItem(fixed, s).props).props as Record<string, unknown>;
    tiny.reset();
    const f = mount(Rating as Widget, fixedProps(), { input: (v) => (s = writeField(s, fixed, fieldValueOf(fixed, v)!, doc)) });
    f.press(f.all().filter((e) => e.props["data-slot"] === "rating-star")[0]);
    f.set(fixedProps());
    expect(f.root("rating")["data-value"]).toBe(3);
    expect(reader(partBySlug("rating")!, liveItem(fixed, s).props).n("value")).toBe(3);
  });

  it("a list input's rows come back as rows, each keeping what it had, and a text variable holds them a line each", async () => {
    const { startState, writeField, liveItem, fieldValueOf } = await import("../../lib/interact");
    const { makeItem } = await import("../../lib/tokens");
    const doc = { groups: [], vars: [{ id: "t", name: "t", type: "text" as const, value: "" }] };
    const item = { ...makeItem("sortable-list"), id: "s", bind: { items: "t" }, props: { items: [{ label: "a", icon: "star" }, { label: "b" }] } };
    const back = fieldValueOf(item, ["b", "a"]);
    expect(back).toEqual([{ label: "b" }, { label: "a", icon: "star" }]);
    const s = writeField(startState(doc.vars), item, back!, doc);
    expect(s.vars.t).toBe("b\na");
    expect(liveItem(item, s).props?.items).toEqual([{ label: "b" }, { label: "a", icon: "star" }]);
    /* what is not a value the prop can hold is not taken */
    expect(fieldValueOf(item, [1, 2])).toBeUndefined();
  });

  it("a choice written to a text variable is the words of what is picked, among the options the part declares", async () => {
    const { startState, writeField } = await import("../../lib/interact");
    const { makeItem } = await import("../../lib/tokens");
    const doc = { groups: [], vars: [{ id: "c", name: "c", type: "text" as const, value: "" }] };
    const palette = { ...makeItem("color-palette"), id: "p", bind: { selected: "c" }, props: { colors: "#111111,#222222" } };
    expect(writeField(startState(doc.vars), palette, 1, doc).vars.c).toBe("#222222");
  });
});
