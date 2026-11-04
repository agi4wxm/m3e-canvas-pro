import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES, PHONE_H, makeItem, sizeOf, type Doc, type Group, type Item } from "../lib/tokens";
import { Preview } from "./Preview";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  present: true,
  peek: false,
  states: [] as unknown[],
  stateCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  /* the slots are keyed by call order and hold the value the component last gave them, so a
     screen can be driven through its own setter the way the real one is */
  useState: (initial: unknown) => {
    const i = hooks.stateCursor++;
    if (!(i in hooks.states)) hooks.states[i] = hooks.peek && initial === null ? { frameId: "next", t: "slideLeft" } : typeof initial === "function" ? initial() : initial;
    return [
      hooks.states[i],
      (v: unknown) => { hooks.states[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(hooks.states[i]) : v; },
    ];
  },
  useRef: (current: unknown) => hooks.refs[hooks.cursor++] ?? (hooks.refs[hooks.cursor - 1] = { current }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useMemo: (value: () => unknown) => value(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("motion/react", () => ({
  AnimatePresence: "presence",
  motion: { div: "div", button: "button" },
  useReducedMotion: () => false,
  useIsPresent: () => hooks.present,
  useMotionValue: (value: number) => ({ get: () => value }),
  useTransform: () => 0,
}));
vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/tidy", () => import("../lib/tidy"));
vi.mock("@/lib/i18n", async () => ({ ...await import("../lib/i18n"), useLang: () => "en" }));
vi.mock("./Icon", () => ({ Icon: "icon" }));
vi.mock("./PartView", () => ({ PartView: "part-view" }));

const part = (slug: string, id: string, props: Record<string, unknown> = {}): Item => ({ ...makeItem("component", slug), id, props });
const doc: Doc = {
  frame: "phone", paletteKey: "purple", title: "", brief: "",
  frames: [{ id: "first", name: "First", x: 0, y: 0, w: 1280, h: 800 }, { id: "next", name: "Next", x: 1400, y: 0, w: 1280, h: 800 }],
  groups: [0, 1400].map((x, i) => ({
    id: `group-${i}`, x, y: 0, axis: "y",
    items: [part("navigation-rail", `rail-${i}`, { expanded: true })],
  })),
};
type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

// Like Loading.test.tsx, inspect the actual elements and effect callbacks without
// a DOM runtime. Browser tests cover Motion's presence propagation and real focus.
function screenElement(peek = false) {
  hooks.peek = peek;
  hooks.states = [];
  hooks.stateCursor = 0;
  const tree = Preview({ doc, widths: {}, palette: PALETTES[0], startId: "first", onClose: vi.fn() });
  const screens = elements(tree).filter((element) => typeof element.type === "function" && "frame" in element.props);
  hooks.peek = false;
  hooks.refs = [];
  // chosen by its prop rather than by position, so reordering the JSX cannot swap them
  const screen = screens.find((element) => (element.props.active === false) === peek);
  if (!screen) throw new Error(`no ${peek ? "peek" : "current"} screen rendered`);
  return screen;
}
function renderScreen(element: Element, fresh = true) {
  hooks.cursor = 0;
  hooks.stateCursor = 0;
  if (fresh) {
    hooks.effects = [];
    hooks.states = [];
  }
  return (element.type as (props: Record<string, unknown>) => Element)(element.props);
}
function runEffects() {
  const cleanups = hooks.effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

describe("preview screen lifecycle", () => {
  const previous = { closest: vi.fn(), focus: vi.fn() };
  const body = { closest: () => null };
  const documentState = { activeElement: previous as typeof previous | typeof body | null, body };
  const host = { focus: vi.fn() };
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const attach = (tree: Element) => { (tree.props.ref as { current: unknown }).current = host; };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.refs = [];
    hooks.cursor = 0;
    hooks.effects = [];
    hooks.present = true;
    hooks.peek = false;
    previous.closest.mockReturnValue(null);
    documentState.activeElement = previous;
    vi.stubGlobal("document", documentState);
    vi.stubGlobal("window", { addEventListener, removeEventListener });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the peek screen inert and free of side effects", () => {
    const element = screenElement(true);
    expect(element.props.active).toBe(false);
    const tree = renderScreen(element);
    attach(tree);
    const cleanup = runEffects();
    expect(tree.props).toMatchObject({ inert: true, "aria-hidden": true, role: "group", "aria-label": "Next" });
    expect(host.focus).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    cleanup();
    expect(previous.focus).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
  });

  it.each(["nothing", "the body", "an inert subtree"])("takes focus itself when %s holds it as the screen on show", (holder) => {
    if (holder === "nothing") documentState.activeElement = null;
    else if (holder === "the body") documentState.activeElement = documentState.body;
    else previous.closest.mockReturnValue({});
    const element = screenElement();
    const tree = renderScreen({ ...element, props: { ...element.props, groups: [] } });
    attach(tree);
    runEffects();
    expect(tree.props).toMatchObject({ tabIndex: -1, role: "group", "aria-label": "First" });
    expect(host.focus).toHaveBeenCalledOnce();
  });

  it("goes inert without reclaiming focus when it exits", () => {
    documentState.activeElement = null;
    const element = screenElement();
    attach(renderScreen(element));
    const cleanup = runEffects();
    expect(host.focus).toHaveBeenCalledOnce();
    vi.clearAllMocks();

    hooks.present = false;
    const exiting = renderScreen(element);
    expect(exiting.props).toMatchObject({ inert: true, "aria-hidden": true, role: "group" });
    cleanup();
    const cleanupExiting = runEffects();
    expect(host.focus).not.toHaveBeenCalled();
    cleanupExiting();
    expect(host.focus).not.toHaveBeenCalled();
  });
});

describe("preview of a screen longer than the device", () => {
  const navH = sizeOf(part("navigation-bar", "nav"), {}).h;
  const groups: Group[] = [
    { id: "bar", x: 0, y: 0, axis: "x", items: [part("app-bar", "bar")] },
    { id: "row", x: 16, y: 1200, axis: "y", items: [part("item", "row")] },
    { id: "head-fab", x: 300, y: 300, axis: "x", items: [part("fab", "head-fab")] },
    { id: "mid-fab", x: 300, y: 850, axis: "x", items: [part("fab", "mid-fab")] },
    { id: "foot-fab", x: 300, y: 1200, axis: "x", items: [part("fab", "foot-fab")] },
    { id: "nav", x: 0, y: PHONE_H * 2 - navH, axis: "x", items: [part("navigation-bar", "nav")] },
  ];
  const render = (length?: number) => {
    const element = screenElement();
    return renderScreen({ ...element, props: { ...element.props, frame: { id: "long", name: "Long", x: 0, y: 0, length }, groups } });
  };
  const tops = (node: unknown) =>
    Object.fromEntries(elements(node).filter((e) => e.props["data-preview-group"]).map((e) => [e.props["data-preview-group"], (e.props.style as { top: number }).top]));

  beforeEach(() => {
    hooks.refs = [];
    hooks.present = true;
  });

  it("scrolls the body in a layer as long as the screen, under what stays put", () => {
    const tree = render(PHONE_H * 2);
    const body = elements(tree).find((e) => e.props["data-scroll-body"]);
    expect(body?.props.style).toMatchObject({ overflowY: "auto", touchAction: "pan-y" });
    expect(Object.keys(tops(body))).toEqual(["row", "mid-fab"]);
    expect(tops(tree)).toEqual({
      bar: 0,
      row: 1200,
      /* one in the first screenful stays there, one in the last keeps its distance from the foot,
         and one across the fold of the two is part of the body */
      "head-fab": 300,
      "mid-fab": 850,
      "foot-fab": 1200 - PHONE_H,
      nav: PHONE_H - navH,
    });
  });

  it("draws a screen the device holds as before", () => {
    const tree = render();
    expect(elements(tree).some((e) => e.props["data-scroll-body"])).toBe(false);
    expect(tops(tree)).toMatchObject({ row: 1200, nav: PHONE_H * 2 - navH });
  });
});

describe("a label-bearing FAB that folds while the screen scrolls", () => {
  const ext = (id: string, extra: Partial<Item> = {}): Item => ({ ...part("fab", id, { icon: "add", label: "Create" }), ...extra });
  const navH = sizeOf(part("navigation-bar", "nav"), {}).h;
  const groups: Group[] = [
    /* the bar is anchored to the head, so it stays put while the body scrolls */
    { id: "bar", x: 0, y: 0, axis: "x", items: [part("app-bar", "bar"), ext("bar-fab", { collapseOnScroll: true })] },
    { id: "fab", x: 200, y: 850, axis: "x", items: [ext("fab", { collapseOnScroll: true })] },
    { id: "keep", x: 200, y: 500, axis: "x", items: [ext("keep")] },
    { id: "nav", x: 0, y: PHONE_H * 2 - navH, axis: "x", items: [part("navigation-bar", "nav")] },
  ];
  const long = { id: "long", name: "Long", x: 0, y: 0, length: PHONE_H * 2 };
  const treeOf = (element: Element, fresh: boolean) => renderScreen({ ...element, props: { ...element.props, frame: long, groups } }, fresh);
  /* whether each part on the screen is drawn folded */
  const foldedParts = (node: unknown) =>
    Object.fromEntries(
      elements(node)
        .filter((e) => typeof e.type === "function" && "item" in e.props)
        .map((e) => [(e.props.item as Item).id, (e.props.item as Item).props?.collapsed === true]),
    );
  const scrollBody = (node: unknown, scrollTop: number) => {
    const body = elements(node).find((e) => e.props["data-scroll-body"]);
    const onScroll = body?.props.onScroll;
    expect(onScroll).toBeTypeOf("function");
    (onScroll as (e: { currentTarget: { scrollTop: number } }) => void)({ currentTarget: { scrollTop } });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hooks.refs = [];
    hooks.present = true;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("folds when the body scrolls down, stays folded at rest, and unfolds when it scrolls up", () => {
    const element = screenElement();
    let tree = treeOf(element, true);
    const extended = { bar: false, "bar-fab": false, fab: false, keep: false, nav: false };
    const folded = { ...extended, "bar-fab": true, fab: true };
    expect(foldedParts(tree)).toEqual(extended);
    /* even the first small movement down folds both a pinned and a body-riding FAB */
    scrollBody(tree, 1);
    tree = treeOf(element, false);
    expect(foldedParts(tree)).toEqual(folded);
    scrollBody(tree, 240);
    vi.runAllTimers();
    tree = treeOf(element, false);
    expect(foldedParts(tree)).toEqual(folded);
    /* any movement back up unfolds, without reaching the top */
    scrollBody(tree, 200);
    tree = treeOf(element, false);
    expect(foldedParts(tree)).toEqual(extended);
    scrollBody(tree, 220);
    tree = treeOf(element, false);
    expect(foldedParts(tree)).toEqual(folded);
  });

  it("keeps the button's right edge in a stable, right-aligned slot", () => {
    /* the width the extended FAB measures at */
    const widths = { "bar-fab": 128, fab: 128 };
    const base = screenElement();
    const tree = renderScreen({ ...base, props: { ...base.props, frame: long, groups, widths } });
    const anchors: Record<string, unknown> = {};
    for (const element of elements(tree)) {
      const child = element.props.children;
      if (!isValidElement<Record<string, unknown>>(child) || !("item" in child.props)) continue;
      const item = child.props.item as Item;
      if (item.collapseOnScroll) anchors[item.id] = element.props.style;
    }
    expect(anchors).toEqual({
      "bar-fab": expect.objectContaining({ width: 128, justifyContent: "flex-end" }),
      fab: expect.objectContaining({ width: 128, justifyContent: "flex-end" }),
    });
  });

  it("never folds on a screen the device holds", () => {
    const element = screenElement();
    const tree = renderScreen({ ...element, props: { ...element.props, frame: { id: "long", name: "Long", x: 0, y: 0 }, groups } });
    expect(elements(tree).some((e) => e.props["data-scroll-body"])).toBe(false);
    expect(foldedParts(tree).fab).toBe(false);
  });

  it("derives collapsed props for real FABs without changing the authored document", () => {
    const base = screenElement();
    const element = { ...base, props: { ...base.props, frame: long, groups } };
    let tree = renderScreen(element, true);
    const realFab = (node: unknown) => elements(node).map((e) => e.props.item as Item | undefined).find((it) => it?.component === "fab" && it.id === "fab");
    expect(realFab(tree)?.props?.collapsed).not.toBe(true);
    scrollBody(tree, 100);
    tree = renderScreen(element, false);
    expect(realFab(tree)?.props?.collapsed).toBe(true);
    expect(groups.find((g) => g.id === "fab")!.items[0].props?.collapsed).toBeUndefined();
    scrollBody(tree, 50);
    tree = renderScreen(element, false);
    expect(realFab(tree)?.props?.collapsed).not.toBe(true);
  });
});
