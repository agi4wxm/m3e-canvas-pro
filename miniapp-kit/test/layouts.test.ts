/* The layouts, ways of getting around and floating parts the kit draws with components of its own (src/kit/composites/
 * layouts.tsx, navs.tsx, floating.tsx), drawn headless by the table's stand-in React (test/table/tinyReact.ts): what each
 * shows from its props, what it lays out, what a tap on each of its places does, and that what is chosen or open is the
 * prop's, a change only told when someone takes it. Taro is a fake; its components are names. */
import { beforeEach, describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";
import { fakeTaro } from "./taro";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);
/* every name the kit and the other suites read off Taro, so whichever suite runs first leaves what the next one needs */
mock.module("@tarojs/taro", () => {
  const none = () => {};
  const taro = {
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
    getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280 }),
    showActionSheet: async () => ({ tapIndex: 0 }),
    request: none,
    uploadFile: none,
    getStorage: async () => Promise.reject(new Error("none")),
    setStorage: async () => {},
    removeStorage: async () => {},
    env: {},
    getFileSystemManager: () => ({}),
    getCurrentPages: () => [],
    navigateTo: none,
    redirectTo: none,
    navigateBack: none,
    reLaunch: none,
    switchTab: none,
    showToast: none,
    setClipboardData: none,
    stopPullDownRefresh: none,
    onThemeChange: none,
    offThemeChange: none,
    useRouter: () => ({ params: {} }),
    usePullDownRefresh: none,
    useReachBottom: none,
  };
  return fakeTaro(taro);
});
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text", ScrollView: "ScrollView" }));

const { ThemeProvider } = await import("../src/kit/theme");
const { MATERIAL } = await import("../src/kit/theme.generated");
const { Cell } = await import("../src/kit/layout");
const L = await import("../src/kit/composites/layouts");
const N = await import("../src/kit/composites/navs");
const F = await import("../src/kit/composites/floating");

const h = tiny.react.createElement;
type Props = Record<string, unknown>;

/** a part drawn under Material, as a page draws it; drawn again, it keeps its state */
let root: unknown;
function draw(type: unknown, props: Props = {}, ...kids: unknown[]) {
  tiny.reset();
  root = h(ThemeProvider, { theme: MATERIAL }, h(type, props, ...kids));
  return again();
}
const again = () => tiny.render(root, (t) => typeof t === "function");

/** the elements of what was drawn: a view's `ariaLabel` and role, and the words in it */
const all = (tree: unknown): Element[] => tiny.elements(tree);
const words = (tree: unknown): string[] => {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object" && "props" in n) walk((n as Element).props.children);
  };
  walk(tree);
  return out;
};
const byRole = (tree: unknown, role: string, label?: string) => all(tree).filter((e) => e.props.ariaRole === role && (label === undefined || e.props.ariaLabel === label));
const one = (tree: unknown, role: string, label: string) => {
  const found = byRole(tree, role, label);
  expect(found.length, `${role} ${label}`).toBe(1);
  return found[0];
};
/** a tap on a view, as the platform gives it, and the part drawn again */
function tap(e: Element, event = "onClick") {
  (e.props[event] as (ev: unknown) => void)({ stopPropagation() {} });
  return again();
}
const styleOf = (e: Element) => (e.props.style ?? {}) as Record<string, unknown>;

beforeEach(() => tiny.reset());

describe("a draft of what is chosen or open", () => {
  it("starts at the prop, keeps a change, and starts over when the prop changes", () => {
    let tree = draw(L.Collapsible, { trigger: "More", content: "Hidden words", open: false });
    expect(words(tree)).not.toContain("Hidden words");
    tree = tap(one(tree, "button", "More"));
    expect(words(tree)).toContain("Hidden words");
    root = h(ThemeProvider, { theme: MATERIAL }, h(L.Collapsible, { trigger: "More", content: "Hidden words", open: true, testID: "x" }));
    tree = tap(one(again(), "button", "More"));
    expect(words(tree)).not.toContain("Hidden words");
  });

  it("is the prop while someone takes the change", () => {
    const onOpenChange = mock(() => {});
    let tree = draw(L.Collapsible, { trigger: "More", content: "Hidden words", open: true, onOpenChange });
    tree = tap(one(tree, "button", "More"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(words(tree)).toContain("Hidden words");
  });
});

describe("layouts", () => {
  it("an accordion opens one panel at a time, or several", () => {
    expect(L.toggledOpen([0], 1, false)).toEqual([1]);
    expect(L.toggledOpen([0], 1, true)).toEqual([0, 1]);
    expect(L.toggledOpen([0, 1], 0, true)).toEqual([1]);
    let tree = draw(L.Accordion, { items: [{ label: "First" }, { label: "Second" }], content: "Answer" });
    expect(words(tree).filter((w) => w === "Answer")).toHaveLength(1);
    tree = tap(one(tree, "button", "Second"));
    expect(one(tree, "button", "Second").props.ariaSelected).toBe(true);
    expect(one(tree, "button", "First").props.ariaSelected).toBe(false);
  });

  it("a scroll area scrolls its rows the way it says, or what it is given in their place", () => {
    let tree = draw(L.ScrollArea, { label: "Row", count: 3, scrollbars: "horizontal" });
    expect(words(tree)).toContain("Row 3");
    expect(all(tree).find((e) => e.type === "ScrollView")?.props).toMatchObject({ scrollX: true, scrollY: false });
    tree = draw(L.ScrollArea, {}, h("View", { key: "a" }, "Mine"));
    expect(words(tree)).toContain("Mine");
    expect(words(tree)).not.toContain("Item 1");
  });

  it("an aspect ratio is as tall as its width says", () => {
    expect(L.ratioOf("3:4")).toBeCloseTo(3 / 4);
    const tree = draw(L.AspectRatio, { ratio: "4:3", width: 240, label: "Four", testID: "ratio" });
    expect(styleOf(all(tree).find((e) => e.props["data-part"] === "ratio")!)).toMatchObject({ width: 240, height: 180 });
  });

  it("a stack names itself on its front layer", () => {
    expect(words(draw(L.Stack, { label: "Layers", note: "Below" }))).toEqual(["Layers", "Below"]);
  });

  it("a grid shows its cells empty, and lays out what it holds, rows as tall as the canvas gives them", () => {
    expect(L.gridRowHeight(200, 12, 12, true, 2, 8)).toBe(70);
    expect(L.gridRowHeight(200, 0, 0, false, 1, 8)).toBe(200);
    const empty = draw(L.GridView, { columns: 3, rows: 2 });
    expect(all(empty).filter((e) => e.type === "View" && (styleOf(e).backgroundColor as string)?.includes("surface-container-high"))).toHaveLength(6);
    const held = draw(L.GridView, { columns: 2, rows: 2, height: 200, padY: 12 }, h(Cell, { key: "a", span: 2, dir: "grid" }, "Wide"), h("View", { key: "b" }, "Narrow"));
    expect(words(held)).toEqual(["Grid", "Two columns", "Wide", "Narrow"]);
    expect(all(held).some((e) => styleOf(e).gridAutoRows === "70px" && styleOf(e).gridTemplateColumns === "repeat(2, minmax(0, 1fr))")).toBe(true);
    expect(all(held).some((e) => styleOf(e).gridColumn === "span 2")).toBe(true);
  });

  it("a dock shows the chosen tab's parts, and another tab's on a tap, which runs its wiring", () => {
    const second = mock(() => {});
    let tree = draw(L.Dock, { items: [{ label: "One" }, { label: "Two" }], taps: { "tab:1": second } }, h(L.DockPane, { key: "a", pane: 0 }, "First pane"), h(L.DockPane, { key: "b", pane: 1 }, "Second pane"), h("View", { key: "c" }, "Always"));
    expect(words(tree)).toContain("First pane");
    expect(words(tree)).not.toContain("Second pane");
    tree = tap(one(tree, "tab", "Two"));
    expect(second).toHaveBeenCalled();
    expect(words(tree)).toContain("Second pane");
    expect(words(tree)).not.toContain("First pane");
    expect(words(tree)).toContain("Always");
    const onChange = mock(() => {});
    tree = draw(L.Dock, { items: [{ label: "One" }, { label: "Two" }], onChange }, h(L.DockPane, { key: "a", pane: 0 }, "First pane"), h(L.DockPane, { key: "b", pane: 1 }, "Second pane"));
    tree = tap(one(tree, "tab", "Two"));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(words(tree)).toContain("First pane");
  });

  it("a supporting pane and a custom component say what they are over what they lay out", () => {
    let tree = draw(L.SupportingPane, { label: "Details", note: "More", layout: "row", gap: 12 }, h("View", { key: "a" }, "Held"));
    expect(words(tree)).toEqual(["Details", "More", "Held"]);
    expect(all(tree).some((e) => styleOf(e).flexDirection === "row" && styleOf(e).columnGap === 12 && styleOf(e).flexGrow === 1)).toBe(true);
    tree = draw(L.CustomComponent, { name: "Map", description: "", layout: "column" }, h("View", { key: "a" }, "Held"));
    expect(words(tree)).toEqual(["Map", "Held"]);
    expect(all(tree).some((e) => styleOf(e).height === 32)).toBe(true);
  });
});

describe("getting around", () => {
  it("a rail chooses and runs its wiring; its menu button opens it out, a modal one shuts once one is chosen", () => {
    expect(N.railWidths(false, true, false)).toEqual({ room: 80, drawn: 80 });
    expect(N.railWidths(true, true, true)).toEqual({ room: 80, drawn: 220 });
    const saved = mock(() => {});
    let tree = draw(N.NavigationRail, { items: [{ label: "Home", icon: "home" }, { label: "Saved", icon: "favorite" }], taps: { "tab:1": saved } });
    tree = tap(one(tree, "tab", "Saved"));
    expect(saved).toHaveBeenCalled();
    expect(one(tree, "tab", "Saved").props.ariaSelected).toBe(true);
    tree = tap(one(tree, "button", "Expand"));
    expect(words(tree)).toContain("Compose");
    tree = draw(N.NavigationRail, { modal: true, expanded: true });
    expect(byRole(tree, "button", "Collapse")).toHaveLength(1);
    tree = tap(one(tree, "tab", "Search"));
    expect(byRole(tree, "button", "Expand")).toHaveLength(1);
  });

  it("pagination shows the pages around the current one and goes to one", () => {
    expect(N.pagesShown(10, 2)).toEqual([1, 2, 3, "gap", 10]);
    expect(N.pagesShown(10, 9)).toEqual([1, "gap", 8, 9, 10]);
    const third = mock(() => {});
    const previous = mock(() => {});
    let tree = draw(N.Pagination, { pages: 10, current: 3, taps: { "tab:2": third, previous } });
    tree = tap(one(tree, "button", "Previous"));
    expect(previous).toHaveBeenCalled();
    expect(one(tree, "button", "2").props.ariaSelected).toBe(true);
    tree = tap(one(tree, "button", "3"));
    expect(third).toHaveBeenCalled();
    expect(one(tree, "button", "3").props.ariaSelected).toBe(true);
    expect(byRole(tree, "button", "4")).toHaveLength(1);
  });

  it("a navigation menu opens a menu's links under its row", () => {
    expect(N.navigationMenuBox(3)).toEqual({ w: 380, h: 44 + 12 + 3 * 48 + 24 });
    let tree = draw(N.NavigationMenu, { menus: [{ label: "Guides" }], pages: [{ label: "Start" }] });
    expect(byRole(tree, "link", "Start")).toHaveLength(0);
    tree = tap(one(tree, "button", "Guides"));
    expect(byRole(tree, "link", "Start")).toHaveLength(1);
  });

  it("a side bar, a floating bar and a table of contents choose and run their wiring", () => {
    const inbox = mock(() => {});
    let tree = draw(N.Sidebar, { taps: { "tab:1": inbox } });
    tree = tap(one(tree, "tab", "Inbox"));
    expect(inbox).toHaveBeenCalled();
    expect(one(tree, "tab", "Inbox").props.ariaSelected).toBe(true);
    const home = mock(() => {});
    tree = draw(N.FloatingNav, { selected: 2, taps: { "tab:0": home } });
    expect(one(tree, "tab", "Saved").props.ariaSelected).toBe(true);
    tap(one(tree, "tab", "Home"));
    expect(home).toHaveBeenCalled();
    expect(N.tocRow("  Install")).toEqual({ words: "Install", sub: true });
    tree = draw(N.TableOfContents, { items: [{ label: "Overview" }, { label: "  Install" }] });
    expect(styleOf(one(tree, "link", "Install")).paddingLeft).toBe(24);
    tree = tap(one(tree, "link", "Install"));
    expect(one(tree, "link", "Install").props.ariaSelected).toBe(true);
  });

  it("a slide group steps its row along", () => {
    let tree = draw(N.SlideGroup, { items: [{ label: "All" }, { label: "Music" }] });
    expect(words(tree)).toEqual(["All", "Music"]);
    tree = tap(one(tree, "button", "Next"));
    expect(all(tree).find((e) => e.type === "ScrollView")?.props.scrollLeft).toBe(160);
  });

  it("an icon grid marks the new ones and runs a shortcut's wiring", () => {
    const orders = mock(() => {});
    const tree = draw(N.IconGrid, { taps: { "tab:1": orders } });
    expect(words(tree)).toContain("New");
    tap(one(tree, "button", "Orders"));
    expect(orders).toHaveBeenCalled();
  });

  it("onboarding turns its pages, tells each turn, skips to the last unless Skip is wired, and turns on a swipe", () => {
    const onPage = mock(() => {});
    const done = mock(() => {});
    const data = { columns: ["Icon", "Title", "Text"], rows: [["explore", "First", "One"], ["bolt", "Second", "Two"], ["star", "Third", "Three"]] };
    let tree = draw(N.Onboarding, { data, onPage, taps: { done } });
    tree = tap(one(tree, "button", "Next"));
    expect(words(tree)).toContain("Second");
    expect(onPage).toHaveBeenLastCalledWith(1);
    tree = tap(one(tree, "button", "Skip"));
    expect(words(tree)).toContain("Third");
    expect(byRole(tree, "button", "Skip")).toHaveLength(0);
    tap(one(tree, "button", "Get started"));
    expect(done).toHaveBeenCalled();
    const skip = mock(() => {});
    tree = draw(N.Onboarding, { data, taps: { skip } });
    tree = tap(one(tree, "button", "Skip"));
    expect(skip).toHaveBeenCalled();
    expect(words(tree)).toContain("First");
    const page = all(tree).find((e) => typeof e.props.onTouchStart === "function")!;
    (page.props.onTouchStart as (e: unknown) => void)({ touches: [{ pageX: 200 }] });
    (page.props.onTouchEnd as (e: unknown) => void)({ changedTouches: [{ pageX: 100 }] });
    expect(words(again())).toContain("Second");
  });
});

describe("what floats", () => {
  it("keeps the room a popup is drawn open in, the trigger where it stands", () => {
    expect(F.around("top", 150, 40, 120, 40)).toEqual({ w: 150, h: 88 });
    expect(F.placeOf("top")).toMatchObject({ flexDirection: "column", justifyContent: "flex-end" });
    expect(F.placeOf("right")).toMatchObject({ flexDirection: "row", justifyContent: "flex-start" });
  });

  it("a tooltip shows its words on a long press; a tap is the button's", () => {
    const onPress = mock(() => {});
    let tree = draw(F.Tooltip, { label: "Library", text: "Add to library", onPress });
    expect(words(tree)).not.toContain("Add to library");
    tree = tap(one(tree, "button", "Library"), "onLongPress");
    expect(words(tree)).toContain("Add to library");
    tree = tap(one(tree, "button", "Library"));
    expect(onPress).toHaveBeenCalled();
    expect(words(tree)).not.toContain("Add to library");
  });

  it("a popover and a hover card open on a tap and shut on another", () => {
    let tree = draw(F.Popover, { trigger: "Size", title: "Dimensions" });
    tree = tap(one(tree, "button", "Size"));
    expect(words(tree)).toContain("Dimensions");
    tree = tap(one(tree, "button", "Size"));
    expect(words(tree)).not.toContain("Dimensions");
    tree = draw(F.HoverCard, { trigger: "@material", title: "Material Design", avatar: "M" });
    tree = tap(one(tree, "link", "@material"));
    expect(words(tree)).toEqual(expect.arrayContaining(["M", "Material Design"]));
  });

  it("a drawer's close and a side sheet's buttons run their wiring", () => {
    const close = mock(() => {});
    tap(one(draw(F.Drawer, { title: "Share", close: "Close", taps: { close } }), "button", "Close"));
    expect(close).toHaveBeenCalled();
    const taps = { close: mock(() => {}), confirm: mock(() => {}), dismiss: mock(() => {}) };
    const tree = draw(F.SideSheet, { title: "Filters", taps });
    for (const name of ["Close", "Apply", "Cancel"]) tap(one(tree, "button", name));
    expect(taps.close).toHaveBeenCalled();
    expect(taps.confirm).toHaveBeenCalled();
    expect(taps.dismiss).toHaveBeenCalled();
    expect(styleOf(all(tree).find((e) => styleOf(e).maxWidth === "calc(100vw - 32px)")!).width).toBe(640);
  });
});
