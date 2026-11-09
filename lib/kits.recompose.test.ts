import { beforeAll, describe, expect, it, vi } from "vitest";
import { kitBySlug } from "../parts/kits";
import { setGlobalLang } from "./i18n";
import { rekeyedAll } from "./instances";
import { openProject } from "./project";
import { conformGroups } from "./styleRules";
import { stylePatch } from "./styles";
import { kitGroups, kitLookOf, kitSig, kitTree, recomposeKits, resignKits, treeSize } from "./kits";
import { DEFAULT_THEME, makeItem, normalizeTheme, type Action, type ComponentDef, type Frame, type Group, type Theme } from "./tokens";

/* A kit remembers what it was added as. While nobody has changed it, a change of style composes it again for the new
 * look, in place, keeping what belongs to its box; a kit a person has changed is left as it is. */

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

const styled = (key: string, more: Partial<Theme> = {}): Theme => normalizeTheme({ ...DEFAULT_THEME, ...stylePatch(key), ...more });
const MATERIAL = normalizeTheme({ ...DEFAULT_THEME, strict: false });
const IOS = styled("ios");
const WECHAT = styled("wechat");
const phone: Frame = { id: "f", name: "Home", x: 1000, y: 200 };
const go = (to: string): Action => ({ to });

/** a kit added on the phone under a theme, its box at (x, y) */
const added = (slug: string, theme: Theme, opts: { variant?: string; x?: number; y?: number } = {}) =>
  kitGroups(kitBySlug(slug)!, kitLookOf(theme), "en", { variant: opts.variant, screen: phone, theme, at: { x: opts.x ?? phone.x, y: opts.y ?? phone.y + 40 } });

const textOf = (groups: Group[], words: string) => groups.find((g) => g.items[0].props?.text === words || g.items[0].props?.label === words);
const setProp = (groups: Group[], id: string, key: string, value: unknown) => groups.map((g) => (g.id === id ? { ...g, items: [{ ...g.items[0], props: { ...g.items[0].props, [key]: value } }] } : g));

describe("a kit's signature", () => {
  it("is on the box of every kit added, with the variant it came as", () => {
    const bar = added("top-app-bar", MATERIAL);
    expect(bar[0].kit).toMatchObject({ slug: "top-app-bar", variant: "start", auto: true });
    expect(bar[0].kit!.sig).toBe(kitSig(bar, bar[0].id));
    const chosen = added("top-app-bar", MATERIAL, { variant: "large" });
    expect(chosen[0].kit).toMatchObject({ variant: "large", auto: false });
    /* a key it does not have is no choice */
    expect(added("top-app-bar", MATERIAL, { variant: "nope" })[0].kit).toMatchObject({ variant: "start", auto: true });
    expect(bar.slice(1).every((g) => !g.kit)).toBe(true);
  });

  it("does not change with ids, places, measures, names of the box, or taps", () => {
    const bar = added("top-app-bar", MATERIAL);
    const root = bar[0];
    const sig = kitSig(bar, root.id);
    /* copied under new ids, somewhere else */
    const copy = rekeyedAll(bar, 300, 120);
    expect(kitSig(copy, copy[0].id)).toBe(sig);
    /* sized by a layout, wider and taller */
    const sized = bar.map((g) => ({ ...g, items: [{ ...g.items[0], props: { ...g.items[0].props, ...(typeof g.items[0].props?.width === "number" ? { width: 999 } : {}) } }] }));
    expect(kitSig(sized, root.id)).toBe(sig);
    /* the box renamed, locked, hidden, taken into a layout; a button inside given somewhere to go */
    const back = textOf(bar, "Back")!;
    const owned = bar.map((g) => (g.id === root.id ? { ...g, name: "Header", locked: true, hidden: true, inFlow: "host" } : g.id === back.id ? { ...g, items: [{ ...g.items[0], action: go("home") }] } : g));
    expect(kitSig(owned, root.id)).toBe(sig);
    /* in the document among other things, in another order of drawing */
    const other: Group = { id: "o", x: 0, y: 0, axis: "x", items: [{ ...makeItem("text"), id: "ot" }] };
    expect(kitSig([other, ...bar.slice(1), root], root.id)).toBe(sig);
  });

  it("changes when a word changes, a part is added or taken out, or a part inside is painted", () => {
    const bar = added("top-app-bar", MATERIAL);
    const root = bar[0];
    const sig = kitSig(bar, root.id);
    const title = textOf(bar, "Title")!;
    expect(kitSig(setProp(bar, title.id, "text", "Inbox"), root.id)).not.toBe(sig);
    const extra: Group = { id: "x", x: 0, y: 0, axis: "x", inFlow: root.id, items: [{ ...makeItem("icon"), id: "xi", props: { icon: "star" } }] };
    expect(kitSig([...bar, extra], root.id)).not.toBe(sig);
    expect(kitSig(bar.filter((g) => g.id !== title.id), root.id)).not.toBe(sig);
    expect(kitSig(bar.map((g) => (g.id === title.id ? { ...g, items: [{ ...g.items[0], textColor: "primary" as const }] } : g)), root.id)).not.toBe(sig);
    expect(kitSig(bar.map((g) => (g.id === title.id ? { ...g, hidden: true } : g)), root.id)).not.toBe(sig);
  });

  it("reads a kit as the rules leave it, so one the rules have dressed down is still the kit it was", () => {
    const box = added("claude-prompt", MATERIAL);
    expect(box[0].items[0].corners).toBeTruthy();
    const ruled = conformGroups(box, IOS);
    expect(ruled[0].items[0].corners).toBeUndefined();
    expect(kitSig(ruled, box[0].id, IOS)).toBe(kitSig(box, box[0].id, IOS));
    expect(kitSig(ruled, box[0].id)).not.toBe(box[0].kit!.sig);
  });

  it("opens with the document, and a mark of another shape is dropped", () => {
    const bar = added("top-app-bar", MATERIAL);
    const doc = { groups: [...bar, { ...bar[1], id: "bad", kit: { slug: 1 } }], frames: [phone], paletteKey: "purple", frame: "phone", title: "", brief: "" };
    const opened = openProject(JSON.parse(JSON.stringify(doc)))!;
    expect(opened.groups[0].kit).toEqual(bar[0].kit);
    expect(opened.groups.find((g) => g.id === "bad")!.kit).toBeUndefined();
  });
});

describe("a kit composed again for another style", () => {
  /** a screen-wide layout holding a kit, with something before it and after it */
  const onScreen = (slug: string, theme: Theme, opts: { variant?: string } = {}) => {
    const host: Group = { id: "host", x: phone.x, y: phone.y, axis: "x", items: [{ ...makeItem("box"), id: "hi", props: { layout: "column", gap: 8, padX: 0, padY: 0, width: 412, hugWidth: false } }] };
    const before: Group = { id: "b", x: phone.x, y: phone.y, axis: "x", inFlow: "host", items: [{ ...makeItem("text"), id: "bt", props: { text: "Before" } }] };
    const kit = added(slug, theme, opts).map((g, i) => (i === 0 ? { ...g, inFlow: "host", name: g.name } : g));
    const after: Group = { id: "a", x: phone.x, y: phone.y + 400, axis: "x", inFlow: "host", items: [{ ...makeItem("text"), id: "at", props: { text: "After" } }] };
    return { groups: [host, before, ...kit, after], root: kit[0] };
  };

  it("takes the variant the new look calls for, where it stood, with its ids, its place in the layout and its taps", () => {
    const { groups, root } = onScreen("top-app-bar", MATERIAL);
    const back = textOf(groups, "Back")!;
    const more = groups.find((g) => g.items[0].props?.label === "More")!;
    const tapped = groups.map((g) =>
      g.id === root.id ? { ...g, name: "Header", locked: true, items: [{ ...g.items[0], action: go("top"), flowFill: true }] } : g.id === back.id ? { ...g, items: [{ ...g.items[0], action: go("home") }] } : g.id === more.id ? { ...g, items: [{ ...g.items[0], action: go("menu") }] } : g,
    );
    const out = recomposeKits({ groups: tapped }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    const box = out.find((g) => g.id === root.id)!;
    expect(box.kit).toMatchObject({ slug: "top-app-bar", variant: "center", auto: true });
    expect(box).toMatchObject({ x: root.x, y: root.y, inFlow: "host", name: "Header", locked: true });
    expect(box.items[0]).toMatchObject({ id: root.items[0].id, action: { to: "top" }, flowFill: true });
    /* in the same place among the others: what came before still does, and what came after */
    expect(out.map((g) => g.id).slice(0, 3)).toEqual(["host", "b", root.id]);
    expect(out[out.length - 1].id).toBe("a");
    /* everything inside is the new composition, in its box; the old parts are gone */
    const inside = kitTree(out, root.id);
    expect(inside.length).toBe(out.length - 3);
    expect(out.some((g) => g.id === back.id)).toBe(false);
    /* the way back and the more button are known by their words, and keep where they go */
    expect(textOf(inside, "Back")!.items[0]).toMatchObject({ component: "button", action: { to: "home" } });
    expect(inside.find((g) => g.items[0].props?.label === "More")!.items[0]).toMatchObject({ props: { icon: "more_horiz" }, action: { to: "menu" } });
    /* signed for what it says now, so it can go on following the style */
    expect(box.kit!.sig).toBe(kitSig(out, root.id, WECHAT));
    const back2 = recomposeKits({ groups: out }, WECHAT, MATERIAL, "en", { frames: [phone] }).groups;
    expect(back2.find((g) => g.id === root.id)!.kit!.variant).toBe("start");
  });

  it("keeps a width the person gave its box, and takes the new composition's otherwise", () => {
    /* the bare rows are as wide as the content; the edge-to-edge cells span the screen */
    const { groups, root } = onScreen("inset-group", MATERIAL);
    expect(root.items[0].props?.width).toBe(380);
    const out = recomposeKits({ groups }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    const box = out.find((g) => g.id === root.id)!;
    expect(box.kit!.variant).toBe("flush");
    expect(box.items[0].props?.width).toBe(412);
    const narrower = setProp(groups, root.id, "width", 300);
    const kept = recomposeKits({ groups: narrower }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups.find((g) => g.id === root.id)!;
    expect(kept.kit!.variant).toBe("flush");
    expect(kept.items[0].props?.width).toBe(300);
  });

  it("leaves a kit the person has changed exactly as it is", () => {
    const { groups, root } = onScreen("top-app-bar", MATERIAL);
    const title = textOf(groups, "Title")!;
    const edited = setProp(groups, title.id, "text", "Inbox");
    const doc = { groups: edited };
    expect(recomposeKits(doc, MATERIAL, WECHAT, "en", { frames: [phone] })).toBe(doc);
    /* and one with a tap that would have nowhere to go: the search button is not in the centered bar */
    const search = edited.find((g) => g.items[0].props?.label === "Search")!;
    const untouched = groups.map((g) => (g.id === search.id ? { ...g, items: [{ ...g.items[0], action: go("find") }] } : g));
    const kept = recomposeKits({ groups: untouched }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    expect(kitTree(kept, root.id).map((g) => g.id)).toEqual(kitTree(untouched, root.id).map((g) => g.id));
    expect(kept.find((g) => g.id === root.id)!.kit!.variant).toBe("start");
  });

  it("leaves a kit whose parts something reaches for by their ids", () => {
    const { groups, root } = onScreen("top-app-bar", MATERIAL);
    const title = textOf(groups, "Title")!;
    const button: Group = { id: "btn", x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: "bi", action: { to: "stay", motion: { kind: "instant" }, effects: [{ do: "hide", part: title.items[0].id }] } }] };
    const out = recomposeKits({ groups: [...groups, button] }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    expect(out.some((g) => g.id === title.id)).toBe(true);
    expect(out.find((g) => g.id === root.id)!.kit!.variant).toBe("start");
  });

  it("keeps a variant chosen by hand while the kit has it, and the style's choice otherwise", () => {
    const { groups, root } = onScreen("top-app-bar", MATERIAL, { variant: "large" });
    const out = recomposeKits({ groups }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    expect(out.find((g) => g.id === root.id)!.kit).toMatchObject({ variant: "large", auto: false });
    const gone = groups.map((g) => (g.id === root.id ? { ...g, kit: { ...g.kit!, variant: "gone" } } : g));
    const picked = recomposeKits({ groups: gone }, MATERIAL, WECHAT, "en", { frames: [phone] }).groups;
    expect(picked.find((g) => g.id === root.id)!.kit!.variant).toBe("center");
  });

  it("follows the style through the rules, a change of mode and back", () => {
    const { groups, root } = onScreen("inset-group", MATERIAL);
    expect(root.kit!.variant).toBe("material");
    const ios = recomposeKits({ groups }, MATERIAL, IOS, "en", { frames: [phone] }).groups;
    expect(ios.find((g) => g.id === root.id)!.kit!.variant).toBe("inset");
    /* the rules dress it down; it is still the kit, and follows the next style too */
    const ruled = conformGroups(ios, IOS);
    const dark = recomposeKits({ groups: ruled }, IOS, { ...IOS, dark: true }, "en", { frames: [phone] }).groups;
    const wechat = recomposeKits({ groups: dark }, { ...IOS, dark: true }, WECHAT, "en", { frames: [phone] }).groups;
    expect(wechat.find((g) => g.id === root.id)!.kit!.variant).toBe("flush");
  });

  it("moves what stood under it on its screen by as much as it grew or shrank, and leaves a bar at the foot", () => {
    const list = added("inset-group", MATERIAL, { y: phone.y + 100 });
    const listH = treeSize(list).h;
    const below = added("settings-row", MATERIAL, { y: phone.y + 100 + listH + 12 });
    const foot: Group = { id: "foot", x: phone.x, y: phone.y + 915 - 80, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "fi", props: { width: 412 } }] };
    const aside: Group = { id: "aside", x: phone.x + 600, y: phone.y + 400, axis: "x", items: [{ ...makeItem("text"), id: "ai", props: { text: "Elsewhere" } }] };
    const groups = [...list, ...below, foot, aside];
    for (const theme of [IOS, WECHAT]) {
      const out = recomposeKits({ groups }, MATERIAL, theme, "en", { frames: [phone] }).groups;
      const grown = treeSize(kitTree(out, list[0].id)).h;
      expect(grown).not.toBe(listH);
      const row = out.find((g) => g.id === below[0].id)!;
      /* the same gap under the list as before, and not taken into its box */
      expect(row.y - (list[0].y + grown)).toBe(12);
      expect(row.inFlow).toBeUndefined();
      /* what it holds came with it */
      for (const g of kitTree(out, row.id).slice(1)) expect(g.y).toBeGreaterThanOrEqual(row.y);
      expect(out.find((g) => g.id === "foot")!.y).toBe(foot.y);
      expect(out.find((g) => g.id === "aside")!.y).toBe(aside.y);
    }
  });

  it("composes a definition's kits too", () => {
    const kit = added("top-app-bar", MATERIAL).map((g) => ({ ...g, x: g.x - phone.x, y: g.y - phone.y - 40 }));
    const def: ComponentDef = { id: "d", name: "Header", groups: kit, w: 412, h: 64 };
    const out = recomposeKits({ groups: [], components: [def] }, MATERIAL, WECHAT, "en");
    const box = out.components![0].groups[0];
    expect(box.kit!.variant).toBe("center");
    expect([box.x, box.y]).toEqual([0, 0]);
  });

  it("gives back the same document when nothing changes", () => {
    const { groups } = onScreen("top-app-bar", MATERIAL);
    const doc = { groups };
    expect(recomposeKits(doc, MATERIAL, { ...MATERIAL, motion: "expressive" }, "en", { frames: [phone] })).toBe(doc);
    const plain = { groups: groups.map(({ kit: _k, ...g }) => g) };
    expect(recomposeKits(plain, MATERIAL, WECHAT, "en", { frames: [phone] })).toBe(plain);
  });

  it("is signed again when its words were put in another language", () => {
    const { groups, root } = onScreen("top-app-bar", MATERIAL);
    const back = textOf(groups, "Back")!;
    const translated = setProp(groups, back.id, "label", "返回");
    const signed = resignKits(groups, translated, MATERIAL);
    expect(signed.find((g) => g.id === root.id)!.kit!.sig).toBe(kitSig(translated, root.id, MATERIAL));
    /* but not one a person had changed before */
    const edited = setProp(groups, textOf(groups, "Title")!.id, "text", "Inbox");
    expect(resignKits(edited, setProp(edited, back.id, "label", "返回"), MATERIAL).find((g) => g.id === root.id)!.kit!.sig).toBe(root.kit!.sig);
  });
});
