import { describe, expect, it } from "vitest";
import { layoutForStyle, metricsOf } from "./styleLayout";
import { standingTogether } from "./tidy";
import { STYLE_PACKS, stylePatch, uxOf } from "./styles";
import { DEFAULT_THEME, frameLengthOf, makeItem, normalizeTheme, type Frame, type Group, type Theme } from "./tokens";

const phone: Frame = { id: "f", name: "One", x: 0, y: 0 };
const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown>, extra: Partial<Group> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }], ...extra });
const screen = (): Group[] => [
  part("bar", "app-bar", 0, 0, { title: "T", width: 412 }),
  part("list", "item", 16, 100, { items: [{ label: "A" }, { label: "B" }], width: 380 }),
  part("go", "button", 16, 300, { label: "Go", width: 380 }),
  part("nav", "navigation-bar", 0, 828, { items: [{ label: "Home", icon: "home" }, { label: "Me", icon: "person" }], selected: 1, width: 412 }),
];
const sizes: Record<string, number> = { bar: 412, "bar:h": 64, list: 380, "list:h": 120, go: 380, "go:h": 40, nav: 412, "nav:h": 64 };
const themed = (key: string, extra: Partial<Theme> = {}): Theme => ({ ...DEFAULT_THEME, ...stylePatch(key), ...extra });
const laid = (key: string, groups = screen(), extra: Partial<Theme> = {}) => layoutForStyle(groups, [phone], sizes, themed(key, extra))!;
const find = (groups: Group[], id: string) => groups.find((g) => g.items[0].id === id)!;
const widthOf = (g: Group) => g.items[0].props?.width;

describe("a style's layout", () => {
  it("is part of every style, and Material's is the default", () => {
    for (const s of STYLE_PACKS) {
      expect(s.ux.margin, s.key).toBeGreaterThanOrEqual(0);
      expect(s.layout.zh.length, s.key).toBeGreaterThan(10);
      expect(s.layout.en.length, s.key).toBeGreaterThan(10);
    }
    expect(uxOf(DEFAULT_THEME)).toMatchObject({ margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" });
  });

  it("gives the body the margin of the style, wider or narrower", () => {
    const souls = laid("souls");
    /* a rail takes 80 of the 412, and the margin comes off what is left */
    const body = 412 - 80;
    expect(find(souls.groups, "go").x).toBe(80 + 24);
    expect(widthOf(find(souls.groups, "go"))).toBe(body - 48);
    const shop = laid("shop");
    expect(find(shop.groups, "go").x).toBe(12);
    expect(widthOf(find(shop.groups, "go"))).toBe(412 - 24);
  });

  it("runs WeChat's lists from edge to edge, and nothing else of it", () => {
    const out = laid("wechat");
    expect(find(out.groups, "list").x).toBe(0);
    expect(widthOf(find(out.groups, "list"))).toBe(412);
    expect(find(out.groups, "go").x).toBe(16);
    expect(metricsOf(themed("wechat")).flush?.(find(out.groups, "list").items[0])).toBe(true);
    expect(metricsOf(themed("ios")).flush).toBeUndefined();
  });

  it("spaces the rows by the style's gap", () => {
    const gapOf = (key: string) => {
      const out = laid(key);
      const list = find(out.groups, "list");
      return find(out.groups, "go").y - (list.y + sizes["list:h"]);
    };
    expect(gapOf("ios")).toBe(24);
    expect(gapOf("wechat")).toBe(8);
  });

  it("moves the navigation to where the product has it, keeping what it holds", () => {
    const top = find(laid("cyber").groups, "nav");
    expect(top.items[0]).toMatchObject({ component: "tabs", navTabs: true });
    expect(top.items[0].props).toMatchObject({ selected: 1 });
    expect(top.y).toBeLessThan(200);

    const rail = find(laid("vscode").groups, "nav");
    expect(rail.items[0].component).toBe("navigation-rail");
    expect(rail.items[0].props?.items).toEqual(find(screen(), "nav").items[0].props?.items);
    expect(rail.x).toBe(0);

    expect(find(laid("ios").groups, "nav").items[0].component).toBe("navigation-bar");
  });

  it("brings the navigation back from a style that moved it", () => {
    const tabs = laid("cyber").groups;
    const back = layoutForStyle(tabs, [phone], sizes, themed("ios"))!;
    const nav = find(back.groups, "nav");
    expect(nav.items[0].component).toBe("navigation-bar");
    expect(nav.items[0].navTabs).toBeUndefined();
    expect(nav.y).toBeGreaterThan(700);
    /* and from one that keeps whatever there is */
    const kept = find(layoutForStyle(tabs, [phone], sizes, themed("chatgpt"))!.groups, "nav");
    expect(kept.items[0].component).toBe("navigation-bar");
  });

  it("keeps a wide screen from having a phone's bar", () => {
    const wide: Frame = { id: "f", name: "One", x: 0, y: 0, w: 1280, h: 800 };
    const groups = [part("nav", "navigation-rail", 0, 0, { items: [{ label: "A" }, { label: "B" }, { label: "C" }], height: 800 })];
    const out = layoutForStyle(groups, [wide], { nav: 96, "nav:h": 800 }, themed("ios"));
    const nav = (out?.groups ?? groups)[0];
    expect(nav.items[0].component).toBe("navigation-rail");
  });

  it("leaves a screen's own place alone, until a style is put on the document", () => {
    const placed = { ...phone, place: "bottom" as const };
    expect(layoutForStyle(screen(), [placed], sizes, themed("ios"))?.frames[0].place ?? "bottom").toBe("bottom");
    expect(layoutForStyle(screen(), [placed], sizes, themed("ios"), { pick: true })!.frames[0].place).toBeUndefined();
    expect(layoutForStyle(screen(), [phone], sizes, themed("ios", { strict: false, ux: { place: "center" } }), { pick: true })!.frames[0].place).toBe("center");
  });

  it("composes a screen on a picture from where its parts stand, not in rows", () => {
    const hud = [
      part("pic", "scene", 0, 0, { width: 412, height: 892 }),
      part("coin", "asset-pill", 20, 30, { value: "1" }),
      part("stick", "joystick", 30, 700, {}),
      part("go", "skill-button", 300, 720, {}),
      part("mid", "button", 150, 400, { label: "Mid", width: 112 }),
    ];
    const measured = { pic: 412, "pic:h": 892, coin: 110, "coin:h": 32, stick: 120, "stick:h": 120, go: 96, "go:h": 96, mid: 112, "mid:h": 40 };
    const out = layoutForStyle(hud, [phone], measured, themed("casual"))!;
    /* near an edge, on its margin; the rest where it was, on the grid */
    expect(find(out.groups, "coin")).toMatchObject({ x: 12, y: 12 });
    expect(find(out.groups, "stick").x).toBe(12);
    expect(find(out.groups, "go").x).toBe(412 - 12 - 96);
    expect(find(out.groups, "stick").y).toBe(700);
    /* in the middle of the screen, centered */
    expect(find(out.groups, "mid")).toMatchObject({ x: 150, y: 400 });
  });

  it("keeps a game's counters at the head when the author gathers the rest at the foot", () => {
    const groups = [
      part("pic", "scene", 0, 0, { width: 412, height: 892 }),
      part("coin", "asset-pill", 12, 40, { value: "1" }),
      part("go", "button", 16, 300, { label: "Go", width: 380 }),
    ];
    const measured = { pic: 412, "pic:h": 892, coin: 110, "coin:h": 32, go: 388, "go:h": 40 };
    const out = layoutForStyle(groups, [{ ...phone, place: "bottom" }], measured, themed("casual"))!;
    expect(find(out.groups, "coin").y).toBeLessThan(40);
    expect(find(out.groups, "go").y).toBe(892 - 12 - 40);
  });

  const tall = () => [...screen(), ...[1, 2, 3, 4, 5].map((n) => part(`card${n}`, "button", 16, 240 + n * 104, { label: `C${n}`, width: 380 }))];
  const tallSizes = (h: number) => ({ ...sizes, ...Object.fromEntries([1, 2, 3, 4, 5].flatMap((n) => [[`card${n}`, 380], [`card${n}:h`, h]])) });

  it("lengthens a screen before anything is left behind, and every row keeps its place in the order", () => {
    const out = layoutForStyle(tall(), [phone], tallSizes(100), themed("ios"))!;
    expect(frameLengthOf(out.frames[0])).toBeGreaterThan(892);
    const cards = [1, 2, 3, 4, 5].map((n) => find(out.groups, `card${n}`));
    for (let i = 1; i < cards.length; i++) expect(cards[i].y, `card ${i}`).toBeGreaterThanOrEqual(cards[i - 1].y + 100);
    /* every part is still on the screen, and the navigation stands at its foot */
    const nav = find(out.groups, "nav");
    expect(nav.y).toBe(frameLengthOf(out.frames[0]) - 64);
    expect(cards[4].y + 100).toBeLessThanOrEqual(nav.y);
  });

  it("gives back what a style took when the next needs less, and not what the author made", () => {
    const grown = layoutForStyle(tall(), [phone], tallSizes(100), themed("ios"))!;
    expect(grown.frames[0].grownFrom).toBe(892);
    const back = layoutForStyle(grown.groups, grown.frames, tallSizes(40), themed("ios"))!;
    expect(back.frames[0].length).toBeUndefined();
    expect(back.frames[0].grownFrom).toBeUndefined();
    expect(find(back.groups, "nav").y).toBe(828);
    /* a screen the author made long stays that long, with nothing to be given back */
    const long: Frame = { ...phone, length: 1400 };
    const kept = layoutForStyle(screen(), [long], sizes, themed("ios"))!;
    expect(kept.frames[0].length).toBe(1400);
    expect(kept.frames[0].grownFrom).toBeUndefined();
  });

  it("lets a locked bar at the foot say how long the screen is", () => {
    const groups = tall().map((g) => (g.id === "g-nav" ? { ...g, locked: true } : g));
    const out = layoutForStyle(groups, [phone], tallSizes(100), themed("ios"))!;
    expect(out.frames[0].length).toBeUndefined();
    expect(find(out.groups, "nav").y).toBe(828);
  });

  it("keeps apart what a style's sizes ran together, and together what was put on something", () => {
    const groups = [
      part("bar", "app-bar", 0, 0, { title: "T", width: 412 }),
      part("list", "item", 16, 100, { items: [{ label: "A" }], width: 380 }),
      part("go", "button", 16, 228, { label: "Go", width: 100 }),
      part("pic", "image", 16, 300, { width: 380, height: 200 }),
      part("tag", "button", 40, 320, { label: "Tag", width: 60 }),
    ];
    const before = { bar: 412, "bar:h": 64, list: 380, "list:h": 120, go: 100, "go:h": 40, pic: 380, "pic:h": 200, tag: 60, "tag:h": 30 };
    const together = standingTogether(groups, [phone], before);
    expect(together).toEqual([expect.arrayContaining(["g-pic", "g-tag"])]);
    /* in the new style the list has grown into the button below it */
    const after = { ...before, "list:h": 150 };
    const out = layoutForStyle(groups, [phone], after, themed("ios"), { together })!;
    const list = find(out.groups, "list");
    expect(find(out.groups, "go").y).toBeGreaterThanOrEqual(list.y + 150);
    const pic = find(out.groups, "pic");
    expect(find(out.groups, "tag").y - pic.y).toBe(20);
    expect(find(out.groups, "tag").x - pic.x).toBe(24);
  });

  it("hangs a list a style runs edge to edge from the bar above it", () => {
    const out = laid("wechat");
    expect(find(out.groups, "list").y).toBe(64);
    expect(find(laid("ios").groups, "list").y).toBe(64 + 16);
  });

  it("floats a dialogue at the foot, inside the body beside a rail", () => {
    const groups = [part("nav", "navigation-bar", 0, 828, { items: [{ label: "A", icon: "home" }, { label: "B", icon: "person" }], selected: 0, width: 412 }), part("talk", "dialogue-box", 16, 100, { speaker: "S", width: 380 })];
    const measured = { nav: 412, "nav:h": 64, talk: 380, "talk:h": 170 };
    const out = layoutForStyle(groups, [phone], measured, themed("souls"))!;
    const talk = find(out.groups, "talk");
    expect(widthOf(talk)).toBe(412 - 80 - 48);
    expect(talk.y).toBeGreaterThan(600);
    expect(talk.x).toBeGreaterThanOrEqual(80);
  });

  it("keeps a part that plainly stands to one side of a wide screen on that side", () => {
    const wide: Frame = { id: "f", name: "One", x: 0, y: 0, w: 1280, h: 800 };
    const groups = [part("l", "item", 40, 100, { items: [{ label: "A" }], width: 320 }), part("r", "button", 880, 300, { label: "R", width: 360 })];
    const out = layoutForStyle(groups, [wide], { l: 320, "l:h": 100, r: 360, "r:h": 40 }, themed("souls"))!;
    expect(find(out.groups, "l").x).toBe(24);
    expect(find(out.groups, "r").x).toBe(1280 - 24 - 360);
  });

  it("gives widths in whole shares of the body, and leaves a part that shares its row", () => {
    const row = [part("a", "button", 16, 100, { label: "A", width: 280 })];
    const out = layoutForStyle(row, [phone], { a: 280, "a:h": 40 }, themed("ios"))!;
    expect(widthOf(find(out.groups, "a"))).toBe(380);
    const shared = [part("a", "button", 16, 100, { label: "A", width: 270 }), part("b", "button", 296, 100, { label: "B", width: 100 })];
    const kept = layoutForStyle(shared, [phone], { a: 270, "a:h": 40, b: 100, "b:h": 40 }, themed("ios"));
    expect(widthOf(find(kept?.groups ?? shared, "a"))).toBe(270);
  });

  it("runs a style's media from edge to edge and hangs it from the bar, as the product does", () => {
    const groups = [part("top", "app-bar", 0, 0, { title: "T", width: 412 }), part("clip", "video", 12, 90, { width: 380 }), part("go", "button", 12, 320, { label: "Go", width: 380 })];
    const measured = { top: 412, "top:h": 64, clip: 380, "clip:h": 214, go: 380, "go:h": 40 };
    const out = layoutForStyle(groups, [phone], measured, themed("shortvideo"))!;
    expect(find(out.groups, "clip")).toMatchObject({ x: 0, y: 64 });
    expect(widthOf(find(out.groups, "clip"))).toBe(412);
    /* and the other parts keep their margins */
    expect(find(out.groups, "go").x).toBe(12);
    /* a style that does not say so keeps the video on the margins */
    expect(find(layoutForStyle(groups, [phone], measured, themed("ios"))!.groups, "clip").x).toBe(16);
  });

  it("measures the body by what keeps to the margins, not by a list that runs past them", () => {
    const groups = [part("list", "item", 0, 100, { items: [{ label: "A" }], width: 412 }), part("go", "button", 16, 240, { label: "Go", width: 290 })];
    const out = layoutForStyle(groups, [phone], { list: 412, "list:h": 100, go: 290, "go:h": 40 }, themed("wechat"))!;
    expect(widthOf(find(out.groups, "go"))).toBe(380);
  });

  it("does not tie a part to the one whose edge it grazes, under the rules", () => {
    const groups = [part("a", "button", 16, 100, { label: "A", width: 380 }), part("b", "button", 16, 130, { label: "B", width: 380 })];
    const measured = { a: 380, "a:h": 40, b: 380, "b:h": 40 };
    const out = layoutForStyle(groups, [phone], measured, themed("ios"))!;
    expect(find(out.groups, "b").y).toBeGreaterThanOrEqual(find(out.groups, "a").y + 40);
  });

  it("does not touch what is locked or what a layout holds", () => {
    const groups = [...screen(), part("mine", "button", 200, 500, { label: "Mine", width: 100 }, { locked: true }), part("in", "button", 0, 0, { label: "In", width: 380 }, { inFlow: "g-list" })];
    const out = laid("souls", groups);
    expect(find(out.groups, "mine")).toMatchObject({ x: 200, y: 500 });
    expect(widthOf(find(out.groups, "in"))).toBe(380);
  });

  it("follows what the author changed over the style", () => {
    const out = laid("wechat", screen(), { strict: false, ux: { margin: 32 } });
    expect(find(out.groups, "go").x).toBe(32);
    expect(widthOf(find(out.groups, "go"))).toBe(412 - 64);
  });

  it("settles: laying a screen out again moves nothing further", () => {
    for (const key of ["ios", "wechat", "vscode", "cyber", "casual"]) {
      const once = laid(key);
      /* by then the navigation has been drawn as what it now is, and measured */
      const nav = find(once.groups, "nav").items[0].component;
      const drawn = { ...sizes, nav: nav === "navigation-rail" ? 80 : 412, "nav:h": nav === "tabs" ? 48 : nav === "navigation-rail" ? 892 : 64 };
      const twice = layoutForStyle(once.groups, once.frames, drawn, themed(key));
      const pos = (gs: Group[]) => gs.map((g) => [g.id, g.x, g.y, widthOf(g)]);
      expect(pos(twice?.groups ?? once.groups), key).toEqual(pos(once.groups));
    }
  });

  it("is stored with the theme, and what makes no sense is not", () => {
    const read = normalizeTheme({ style: "ios", strict: false, ux: { margin: 20, gap: "x", nav: "sideways", place: "center" } } as unknown as Theme);
    expect(read.ux).toEqual({ margin: 20, place: "center" });
    expect(uxOf(read)).toMatchObject({ margin: 20, gap: 24, nav: "bottom", place: "center" });
  });
});
