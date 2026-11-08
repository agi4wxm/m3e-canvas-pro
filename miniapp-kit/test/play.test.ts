/* The game parts, actions and menus of the kit (src/kit/composites/games.tsx, actions.tsx), drawn headless by the
 * consistency table's stand-in React (test/table/tinyReact.ts): only the part under test is called, every element it
 * draws stays as data with its handlers, which a test calls as a finger would. Taro is a fake that answers an action
 * sheet with the row a test picks and measures every view as 100 × 100 at the page's corner. A machine only asks for its
 * prize and plays to the one it is given, a pad hands out where a finger pushes, a menu's row runs its own place, a
 * sign-in button only says what it asks for. */
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";
import { fakeTaro } from "./taro";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);

/** the rows each action sheet was opened with, and the rows the next ones are answered with (-1: closed) */
const sheets: string[][] = [];
const answers: number[] = [];
mock.module("@tarojs/taro", () => {
  const taro = {
    showActionSheet: ({ itemList }: { itemList: string[] }) => {
      sheets.push(itemList);
      const pick = answers.shift() ?? -1;
      return pick < 0 ? Promise.reject(new Error("cancel")) : Promise.resolve({ tapIndex: pick });
    },
    createSelectorQuery: () => ({ select: () => ({ boundingClientRect: (cb: (r: unknown) => void) => ({ exec: () => cb({ left: 0, top: 0, width: 100, height: 100 }) }) }) }),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
    getStorageSync: () => "",
    setStorage: async () => {},
    /* the rest of what the kit names from Taro, standing in: Bun keeps one module per name for the whole run, so a mock
       that names less would leave the other test files' imports without it */
    getStorage: async () => Promise.reject(new Error("none")),
    removeStorage: async () => {},
    request: async () => ({ statusCode: 404, data: "", header: {} }),
    uploadFile: async () => ({ statusCode: 404, data: "", header: {} }),
    getFileSystemManager: () => ({ writeFile: () => {} }),
    navigateTo: async () => {},
    redirectTo: async () => {},
    navigateBack: async () => {},
    reLaunch: async () => {},
    switchTab: async () => {},
    getCurrentPages: () => [],
    showToast: async () => {},
    setClipboardData: async () => {},
    stopPullDownRefresh: () => {},
    getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280 }),
    onThemeChange: () => {},
    offThemeChange: () => {},
    env: {},
    useRouter: () => ({ params: {} }),
    usePullDownRefresh: () => {},
    useReachBottom: () => {},
  };
  return fakeTaro(taro);
});
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text" }));

const G = await import("../src/kit/composites/games");
const A = await import("../src/kit/composites/actions");

/* the page asks for less motion: a run settles at once rather than after its 1.2 seconds */
const was = (globalThis as { window?: unknown }).window;
beforeAll(() => void ((globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) }));
afterAll(() => void ((globalThis as { window?: unknown }).window = was));

const PRIZES = [{ label: "Gold", icon: "star" }, { label: "Silver" }, { label: "Bronze" }, { label: "Nothing" }];
const tap = { stopPropagation() {} };

/** a part drawn: only it is called, and what it drew is there to read and press */
function drawn(part: unknown, props: Record<string, unknown>) {
  let tree: unknown;
  const draw = (next: Record<string, unknown> = props) => {
    tree = tiny.render(tiny.react.createElement(part as never, next), (t) => t === part);
  };
  draw();
  const all = () => tiny.elements(tree);
  return {
    draw,
    all,
    /** the elements of a component the part draws with, by its name */
    named: (name: string) => all().filter((e) => typeof e.type === "function" && (e.type as { name?: string }).name === name),
    /** the views a screen reader is told are this, by their name */
    role: (role: string, label?: string) => all().filter((e) => e.props.ariaRole === role && (label === undefined || e.props.ariaLabel === label)),
    /** the words drawn */
    words: () => all().filter((e) => (e.type as { name?: string }).name === "Words").map((e) => e.props.text),
  };
}

const press = (e: Element | undefined) => (e?.props.onClick as ((x: typeof tap) => void) | undefined)?.(tap);
const settle = () => new Promise((r) => setTimeout(r, 5));

describe("a prize machine", () => {
  it("asks when pressed, waits with nothing given, and plays to the result that comes", async () => {
    tiny.reset();
    const asked = mock(() => {});
    const settled = mock(() => {});
    const props = { label: "Spin", prizes: PRIZES, taps: { action: asked }, onSettled: settled };
    const w = drawn(G.PrizeWheel, props);
    const button = () => w.named("DrawButton")[0];
    expect(button().props.busy).toBe(false);
    (button().props.onPress as () => void)();
    w.draw();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(button().props.busy).toBe(true);
    await settle();
    w.draw();
    expect(settled).not.toHaveBeenCalled();
    /* the answer comes */
    w.draw({ ...props, result: 2 });
    await settle();
    w.draw({ ...props, result: 2 });
    expect(settled).toHaveBeenCalledWith({ index: 2, label: "Bronze" });
    expect(w.named("Result")[0].props.prize).toEqual({ label: "Bronze" });
    expect(button().props.busy).toBe(false);
    /* the winner's wedge stops under the pointer, five turns on */
    expect(G.wheelTurn(2, 1, 4)).toBe(1800 - 225);
  });

  it("waits for a new result while pending says one is coming", async () => {
    tiny.reset();
    const settled = mock(() => {});
    const props = { label: "Spin", prizes: PRIZES, result: 1, onSettled: settled };
    const w = drawn(G.Gacha, { ...props, pending: true });
    expect(w.named("DrawButton")[0].props.busy).toBe(true);
    w.draw(props);
    (w.named("DrawButton")[0].props.onPress as () => void)();
    w.draw(props);
    await settle();
    w.draw(props);
    /* the result already there when pressed is played, as nothing says a new one is coming */
    expect(settled).toHaveBeenCalledWith({ index: 1, label: "Silver" });
  });

  it("an egg is a place of its own, and the one hit is broken", () => {
    tiny.reset();
    const second = mock(() => {});
    const w = drawn(G.EggSmash, { label: "Pick", prizes: PRIZES, taps: { "egg:1": second } });
    press(w.role("button", "Pick 2")[0]);
    w.draw();
    expect(second).toHaveBeenCalled();
    expect(w.role("button", "Pick 2")[0].props.ariaSelected).toBe(true);
    /* a press while it waits is no press */
    expect(w.role("button", "Pick 1")[0].props.onClick).toBeUndefined();
  });

  it("reads its state as the RN kit does", () => {
    const asked = G.drawPress(G.DRAW_START, false, 4);
    expect(G.drawAnswer(asked, -1, false).play).toBeUndefined();
    expect(G.drawAnswer(asked, 3, false).play).toBe(3);
    expect(G.drawAnswer({ phase: "done", won: 1, runs: 1, asked: false }, -1, false).state.phase).toBe("idle");
    expect(G.givenOf(8, 8)).toBe(-1);
    expect(G.litOf("done", 5, 3, 8)).toBe(3);
    expect(G.reelsOf("1,2", 4)).toBeNull();
    expect(G.wheelStops(2)).toBe("var(--md-sys-color-surface-container-low) 0deg 180deg, var(--md-sys-color-surface-container-high) 180deg 360deg");
  });
});

describe("a movement pad", () => {
  it("hands out where a finger pushes it, and its letting go", () => {
    tiny.reset();
    const value = mock((v: string) => void v);
    const release = mock((v: unknown) => void v);
    const w = drawn(G.Joystick, { onValueChange: value, onRelease: release });
    const pad = () => w.role("slider", "Joystick")[0];
    (pad().props.onTouchStart as (e: unknown) => void)({ touches: [{ clientX: 100, clientY: 50 }] });
    w.draw();
    expect(value).toHaveBeenLastCalledWith("1,0");
    (pad().props.onTouchMove as (e: unknown) => void)({ touches: [{ clientX: 50, clientY: 100 }] });
    w.draw();
    expect(value).toHaveBeenLastCalledWith("0,1");
    expect(pad().props.ariaValuenow).toBe("180");
    (pad().props.onTouchEnd as (e: unknown) => void)({ changedTouches: [{ clientX: 50, clientY: 100 }] });
    w.draw();
    expect(release).toHaveBeenCalledWith({ x: 0, y: 1 });
    expect(value).toHaveBeenLastCalledWith("0,0");
  });

  it("rests where it is let go without going back to the middle, and as its value says", () => {
    expect(G.restingOf({ at: { x: 1, y: 0 }, given: "" }, "", false, 0)).toEqual({ x: 1, y: 0 });
    expect(G.restingOf({ at: { x: 1, y: 0 }, given: "" }, "0,-1", false, 0)).toEqual({ x: 0, y: -1 });
    expect(G.restingOf(null, "", false, 90)).toEqual({ x: 1, y: 0 });
    expect(G.pushOf(1, 1, 30)).toEqual({ x: 0, y: 0 });
    expect(G.angleOf({ x: -1, y: 0 })).toBe(270);
  });
});

describe("a skill, a level map, a board", () => {
  it("a skill waits out the other side's cooldown, then asks", () => {
    tiny.reset();
    const use = mock(() => {});
    const w = drawn(G.SkillButton, { label: "Dash", endsAt: Date.now() + 2500, taps: { action: use } });
    expect(w.role("button", "Dash")[0].props.onClick).toBeUndefined();
    expect(w.words()).toContain("3");
    w.draw({ label: "Dash", endsAt: Date.now() - 1, taps: { action: use } });
    press(w.role("button", "Dash")[0]);
    expect(use).toHaveBeenCalled();
    expect(G.cooldownLeft(3000, 1000)).toBe(2);
  });

  it("a level map locks what is ahead and picks the level tapped", () => {
    tiny.reset();
    const second = mock(() => {});
    const w = drawn(G.LevelMap, { levels: 6, current: 3, taps: { "tab:1": second } });
    expect(w.role("button", "5")[0].props.onClick).toBeUndefined();
    press(w.role("button", "2")[0]);
    w.draw();
    expect(second).toHaveBeenCalled();
    expect(w.role("button", "2")[0].props.ariaSelected).toBe(true);
    expect(G.levelAt(5, 4, 400)).toEqual({ x: 250, y: 138 });
  });

  it("a board shows the cells it is told, and a press only asks", () => {
    tiny.reset();
    const cell = mock(() => {});
    const w = drawn(G.GameBoard, { cells: "X,,O", taps: { "cell:1": cell } });
    expect(w.role("button", "1 X")).toHaveLength(1);
    expect(w.words()).toContain("X to play");
    press(w.role("button", "2")[0]);
    w.draw();
    expect(cell).toHaveBeenCalled();
    expect(w.role("button", "2")).toHaveLength(1);
    expect(G.boardStatus("Draw", "mark", "{mark}", "X,O")).toBe("Draw");
    expect(G.pickedOf("1, 5,5,9,10", 9)).toEqual([0, 4, 8]);
  });
});

describe("actions", () => {
  it("a group of buttons: each its own place, an icon alone as wide as tall", () => {
    tiny.reset();
    const play = mock(() => {});
    const w = drawn(A.ButtonGroup, { items: [{ label: "Back" }, { label: "", icon: "play_arrow" }], taps: { "tab:1": play } });
    const [, icon] = w.role("button");
    expect(icon.props.ariaLabel).toBe("play_arrow");
    expect((icon.props.style as Record<string, unknown>).width).toBe(40);
    press(icon);
    expect(play).toHaveBeenCalled();
  });

  it("a split button runs its main action, and its arrow opens the sheet of its menu", async () => {
    tiny.reset();
    const main = mock(() => {});
    const share = mock(() => {});
    const w = drawn(A.SplitButton, { label: "Edit", taps: { main, "tab:1": share } });
    (w.named("Surface")[0].props.onPress as () => void)();
    expect(main).toHaveBeenCalled();
    answers.push(1);
    press(w.role("button", "More options")[0]);
    await settle();
    expect(sheets.at(-1)).toEqual(["Duplicate", "Share", "Delete"]);
    expect(share).toHaveBeenCalled();
  });

  it("a FAB menu opens its actions above it and runs the one picked", () => {
    tiny.reset();
    const event = mock(() => {});
    const w = drawn(A.FabMenu, { taps: { "tab:1": event } });
    expect(w.role("menuitem")).toHaveLength(0);
    press(w.role("button", "Create")[0]);
    w.draw();
    expect(w.role("menuitem").map((e) => e.props.ariaLabel)).toEqual(["Mail", "Event", "Task"]);
    press(w.role("menuitem", "Event")[0]);
    w.draw();
    expect(event).toHaveBeenCalled();
    expect(w.role("menuitem")).toHaveLength(0);
  });

  it("a sign-in button says which capability its press asks for, and decides nothing", () => {
    tiny.reset();
    const ask = mock(() => {});
    const pressed = mock(() => {});
    const w = drawn(A.BrandButton, { provider: "google", label: "", onAsk: ask, onPress: pressed });
    const face = w.named("Surface")[0];
    expect(face.props.label).toBe("Sign in with Google");
    expect((face.props.base as Record<string, unknown>).backgroundColor).toBe("#ffffff");
    (face.props.onPress as () => void)();
    expect(ask).toHaveBeenCalledWith("auth.oauth", "google");
    expect(pressed).toHaveBeenCalled();
    expect(A.brandCapability("pay")).toBe("payment.pay");
    expect(A.brandLook("nope").ink).toBe("inverse-on-surface");
  });
});

describe("menus and search", () => {
  it("a command list narrows to what is typed and runs the command tapped by its place", () => {
    tiny.reset();
    const calc = mock(() => {});
    const w = drawn(A.Command, { taps: { "tab:2": calc } });
    const field = w.all().find((e) => e.type === "Input")!;
    (field.props.onInput as (e: unknown) => void)({ detail: { value: "calc" } });
    w.draw();
    expect(w.role("menuitem").map((e) => e.props.ariaLabel)).toEqual(["Calculator"]);
    press(w.role("menuitem", "Calculator")[0]);
    expect(calc).toHaveBeenCalled();
    (w.all().find((e) => e.type === "Input")!.props.onInput as (e: unknown) => void)({ detail: { value: "zzz" } });
    w.draw();
    expect(w.words()).toContain("No results found.");
  });

  it("a context menu opens its sheet when held down", async () => {
    tiny.reset();
    const reload = mock(() => {});
    const w = drawn(A.ContextMenu, { taps: { "tab:2": reload } });
    answers.push(2);
    (w.role("button", "Right click here")[0].props.onLongPress as () => void)();
    await settle();
    expect(sheets.at(-1)).toEqual(["Back", "Forward", "Reload"]);
    expect(reload).toHaveBeenCalled();
  });

  it("a filter bar hands out what is typed and the filters on", () => {
    tiny.reset();
    const typed = mock(() => {});
    const on = mock(() => {});
    const w = drawn(A.FilterBar, { onChangeText: typed, onFilter: on });
    (w.all().find((e) => e.type === "Input")!.props.onInput as (e: unknown) => void)({ detail: { value: "May" } });
    expect(typed).toHaveBeenCalledWith("May");
    press(w.role("checkbox", "Currency")[0]);
    w.draw();
    expect(on).toHaveBeenLastCalledWith([2]);
    expect(w.role("checkbox", "Currency")[0].props.ariaChecked).toBe(true);
  });

  it("a cascading menu opens its submenu as a second sheet, each row its own place", async () => {
    tiny.reset();
    const filter = mock(() => {});
    const w = drawn(A.CascadingMenu, { taps: { "sub:1": filter } });
    answers.push(2, 1);
    (w.named("Surface")[0].props.onPress as () => void)();
    await settle();
    expect(sheets.slice(-2)).toEqual([
      ["Edit", "Share", "More"],
      ["Sort", "Filter"],
    ]);
    expect(filter).toHaveBeenCalled();
    /* the sheet takes six rows: the submenu's row stays */
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `R${i}` }));
    expect(A.cascadeSheet(many, "More", 2)).toEqual({ labels: ["R0", "R1", "R2", "R3", "R4", "More"], places: ["tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "sub"] });
    expect(A.cascadeSheet(many, "More", 0).labels).toHaveLength(6);
  });
});
