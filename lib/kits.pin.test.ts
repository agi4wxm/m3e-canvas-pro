import { beforeAll, describe, expect, it, vi } from "vitest";
import { KITS, MATERIAL_LOOK, kitBySlug } from "../parts/kits";
import { roleOf } from "../parts/role";
import { defaultMeasures, type Node } from "../parts/templates/kit";
import { buildCode } from "./codegen";
import { setGlobalLang } from "./i18n";
import { kitGroups, kitLookOf, kitSig, kitTree, landTree, recomposeKits, treeSize } from "./kits";
import { openProject } from "./project";
import { buildPrompt } from "./prompt";
import { layoutForStyle } from "./styleLayout";
import { stylePatch } from "./styles";
import { MATERIAL_METRICS, tidyFrame } from "./tidy";
import { DEFAULT_THEME, GESTURE_BAR_H, STATUS_BAR_H, makeItem, normalizeTheme, type Doc, type Frame, type Group, type Theme } from "./tokens";

/* A kit's bar is a box pinned to an edge of its screen: its root plays the bar's role there, so it is laid out, printed
 * and described as the screen's bar, not as a row of its body. A box without a pin is what every box was before. */

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

const styled = (key: string): Theme => normalizeTheme({ ...DEFAULT_THEME, ...stylePatch(key) });
const MATERIAL = normalizeTheme({ ...DEFAULT_THEME, strict: false });
const IOS = styled("ios");
const phone: Frame = { id: "f", name: "Home", x: 1000, y: 200 };
const W = 412;
const H = 892;

/** a kit added on a screen under a theme, its box at (x, y) on it */
const added = (slug: string, theme: Theme, opts: { variant?: string; y?: number; screen?: Frame } = {}) => {
  const screen = opts.screen ?? phone;
  return kitGroups(kitBySlug(slug)!, kitLookOf(theme), "en", { variant: opts.variant, screen, theme, at: { x: screen.x, y: screen.y + (opts.y ?? 300) } });
};
const rootOf = (groups: Group[], id: string) => groups.find((g) => g.id === id)!;
const pinOf = (g: Group) => g.items[0].props?.pin;
const text = (id: string, y: number, words = "Body"): Group => ({ id, x: phone.x + 16, y: phone.y + y, axis: "x", items: [{ ...makeItem("text"), id: `${id}-i`, props: { text: words, width: 380 } }] });

describe("a kit's bars", () => {
  const pinned: Record<string, Record<string, string | undefined>> = {
    "top-app-bar": { start: "top", center: "top", large: "top" },
    "tab-bar": { pill: "bottom", tint: "bottom", floating: "floatingBottom", game: "bottom" },
    "hud-top-bar": { mobile: "top", glass: "top", pc: "top" },
    "buy-bar": { total: "bottom", product: "bottom", cart: "bottom" },
    "chat-input": { simple: "bottom", im: "bottom", rich: "bottom" },
    "segmented-header": { tabs: "top", control: "top", capsules: "top" },
    "option-sheet": { material: "bottom", ios: "floatingBottom", weui: "bottom" },
    "toolbar-row": { floating: "floatingBottom", docked: "bottom", command: undefined },
    "window-title-bar": { buttons: "top", lights: "top", toolbar: "top" },
    "status-row": { phone: "top", editor: "bottom", game: undefined },
  };

  it("are pinned at their root to the edge they belong to", () => {
    for (const [slug, variants] of Object.entries(pinned)) {
      const kit = kitBySlug(slug)!;
      expect(kit.variants.map((v) => v.key).sort(), slug).toEqual(Object.keys(variants).sort());
      for (const v of kit.variants) expect(v.build(MATERIAL_LOOK).props.pin, `${slug}/${v.key}`).toBe(variants[v.key]);
    }
  });

  it("are pinned only at the root: a box inside a kit stands where its layout puts it", () => {
    const inner = (n: Node): Node[] => (n.kids ?? []).flatMap((k) => [k, ...inner(k)]);
    for (const kit of KITS) for (const v of kit.variants) for (const n of inner(v.build(MATERIAL_LOOK))) expect(n.props.pin, `${kit.slug}/${v.key}`).toBeUndefined();
  });
});

describe("a kit's bar on a screen", () => {
  it("lands on its edge wherever it is let go, as wide as the screen", () => {
    for (const [slug, edge] of [
      ["top-app-bar", "top"],
      ["tab-bar", "bottom"],
      ["buy-bar", "bottom"],
      ["chat-input", "bottom"],
      ["hud-top-bar", "top"],
    ] as const) {
      const kit = added(slug, MATERIAL);
      const { groups } = landTree(kit, phone.x + 20, phone.y + 400, [phone]);
      const { h } = treeSize(groups);
      expect(groups[0].x, slug).toBe(phone.x);
      expect(groups[0].y, slug).toBe(edge === "top" ? phone.y : phone.y + H - h);
      expect(groups[0].items[0].props?.width, slug).toBe(W);
    }
  });

  it("lands inside the device's own bars, past the bars already on its edge, and beside a rail", () => {
    const framed: Frame = { ...phone, deviceBars: true };
    const top = landTree(added("top-app-bar", MATERIAL), phone.x, phone.y + 300, [framed]).groups;
    expect(top[0].y).toBe(phone.y + STATUS_BAR_H);
    const tabs = added("tab-bar", MATERIAL);
    const foot = landTree(tabs, phone.x, phone.y + 300, [framed]).groups;
    expect(foot[0].y).toBe(phone.y + H - GESTURE_BAR_H - treeSize(tabs).h);
    /* a navigation bar already at the foot: the buy bar stands on it */
    const nav: Group = { id: "nav", x: phone.x, y: phone.y + H - 80, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "navi", props: { width: W } }] };
    const widths = { navi: W, "navi:h": 80 };
    const buy = added("buy-bar", MATERIAL);
    const stacked = landTree(buy, phone.x, phone.y + 300, [phone], true, { groups: [nav], widths }).groups;
    expect(stacked[0].y).toBe(phone.y + H - 80 - treeSize(buy).h);
    /* a floating one keeps the style's margin above it, centered */
    const floating = added("tab-bar", MATERIAL, { variant: "floating" });
    const floats = landTree(floating, phone.x, phone.y + 300, [phone], false, { groups: [nav], widths, margin: 16 }).groups;
    const size = treeSize(floats);
    expect(floats[0].y).toBe(phone.y + H - 80 - 16 - size.h);
    expect(floats[0].x).toBe(phone.x + Math.round((W - size.w) / 2));
    /* a rail at the left: the bar spans what it leaves */
    const rail: Group = { id: "rail", x: phone.x, y: phone.y, axis: "x", items: [{ ...makeItem("navigation-rail"), id: "raili", props: { narrow: true, height: H } }] };
    const beside = landTree(added("tab-bar", MATERIAL), phone.x + 100, phone.y + 300, [phone], true, { groups: [rail], widths: { raili: 80, "raili:h": H } }).groups;
    expect(beside[0].x).toBe(phone.x + 80);
    expect(beside[0].items[0].props?.width).toBe(W - 80);
  });

  it("is pinned by Tidy to its edge, inside the device's bars, while the body flows between", () => {
    for (const deviceBars of [false, true]) {
      const screen: Frame = { ...phone, deviceBars };
      const bar = added("top-app-bar", MATERIAL, { y: 400 });
      const tabs = added("tab-bar", MATERIAL, { y: 300 });
      const groups = [text("t1", 120), ...bar, ...tabs];
      const widths = defaultMeasures(groups);
      const out = tidyFrame(groups, screen, [screen], widths, MATERIAL_METRICS)!;
      const top = rootOf(out, bar[0].id);
      const foot = rootOf(out, tabs[0].id);
      const safe = deviceBars ? { t: STATUS_BAR_H, b: GESTURE_BAR_H } : { t: 0, b: 0 };
      expect([top.x, top.y]).toEqual([phone.x, phone.y + safe.t]);
      expect([foot.x, foot.y]).toEqual([phone.x, phone.y + H - safe.b - widths[`${tabs[0].items[0].id}:h`]]);
      /* the body starts under the top bar, not pulled up into it */
      expect(rootOf(out, "t1").y).toBe(top.y + widths[`${bar[0].items[0].id}:h`] + 16);
    }
  });

  it("spans the body under a style, and stays the box it is where the style turns the navigation into a rail", () => {
    const nav: Group = { id: "nav", x: phone.x, y: phone.y + H - 80, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "navi", props: { width: W } }] };
    const tabs = added("tab-bar", MATERIAL, { y: 400 });
    /* a pinned box that hugs what it holds is made a bar: as wide as the body */
    const hug: Group = { id: "hug", x: phone.x + 40, y: phone.y + 300, axis: "x", items: [{ ...makeItem("box"), id: "hugi", props: { pin: "top", surface: "bar", hugWidth: true, width: 200 } }] };
    const capsule = added("tab-bar", MATERIAL, { variant: "floating", y: 500 });
    const groups = [nav, ...tabs, hug, ...capsule];
    const widths: Record<string, number> = { ...defaultMeasures(groups), navi: W, "navi:h": 80, hugi: 200, "hugi:h": 48 };
    for (const key of ["souls", "vscode"]) {
      const out = layoutForStyle(groups, [phone], widths, styled(key))!.groups;
      expect(rootOf(out, "nav").items[0].component, key).toBe("navigation-rail");
      const box = rootOf(out, tabs[0].id);
      expect(box.items[0].component).toBe("box");
      expect(box.items[0].props).toMatchObject({ pin: "bottom", width: W - 80 });
      expect([box.x, box.y + widths[`${tabs[0].items[0].id}:h`]]).toEqual([phone.x + 80, phone.y + H]);
      expect(rootOf(out, "hug").items[0].props).toMatchObject({ width: W - 80, hugWidth: false });
      expect(rootOf(out, "hug").x).toBe(phone.x + 80);
      /* the floating capsule is as wide as its tabs: centered over the body beside the rail, never past the screen */
      const floats = rootOf(out, capsule[0].id);
      const w = widths[capsule[0].items[0].id];
      expect(w).toBeLessThan(W - 80);
      expect(floats.items[0].props?.width).toBe(capsule[0].items[0].props?.width);
      expect(floats.x).toBe(phone.x + 80 + Math.round((W - 80 - w) / 2));
      expect(floats.x + w).toBeLessThanOrEqual(phone.x + W);
    }
    /* under a style that keeps a bar, it stays at the foot of the phone, and the real one above or below it */
    const ios = layoutForStyle(groups, [phone], widths, IOS)!.groups;
    expect(rootOf(ios, tabs[0].id).items[0].props?.width).toBe(W);
  });
});

describe("a kit's pin, composed again", () => {
  it("is not what the kit says: its signature is the same pinned or not, while a pin inside it counts", () => {
    const bar = added("tab-bar", MATERIAL);
    const sig = kitSig(bar, bar[0].id);
    const set = (pin: string | undefined, id = bar[0].id) => bar.map((g) => (g.id === id ? { ...g, items: [{ ...g.items[0], props: { ...g.items[0].props, pin } }] } : g));
    expect(kitSig(set("none"), bar[0].id)).toBe(sig);
    expect(kitSig(set(undefined), bar[0].id)).toBe(sig);
    expect(kitSig(set("top"), bar[0].id)).toBe(sig);
    const inner = bar.find((g) => g.id !== bar[0].id && g.items[0].component === "box")!;
    expect(kitSig(set("top", inner.id), bar[0].id)).not.toBe(sig);
  });

  it("stays on the box through a change of style, and follows the composition where nobody set it", () => {
    const bar = added("tab-bar", MATERIAL, { y: H - 76 });
    const out = recomposeKits({ groups: bar }, MATERIAL, IOS, "en", { frames: [phone] }).groups;
    const box = rootOf(out, bar[0].id);
    expect(box.kit!.variant).not.toBe("pill");
    expect(pinOf(box)).toBe("bottom");
    /* at the foot of the screen it keeps its foot there, however tall the new composition is */
    expect(box.y + treeSize(kitTree(out, box.id)).h).toBe(bar[0].y + treeSize(bar).h);
  });

  it("floats or docks as the new composition does: a capsule keeps its middle, a docked bar stands on the edge", () => {
    const FLOATING = { ...MATERIAL, recipes: { ...MATERIAL.recipes, nav: "floating" } } as Theme;
    const capsule = added("tab-bar", FLOATING);
    const landed = landTree(capsule, phone.x, phone.y + 300, [phone]).groups;
    expect(landed[0].kit!.variant).toBe("floating");
    expect(pinOf(landed[0])).toBe("floatingBottom");
    const docked = recomposeKits({ groups: landed }, FLOATING, MATERIAL, "en", { frames: [phone] }).groups;
    const bar = rootOf(docked, landed[0].id);
    expect(bar.kit!.variant).toBe("pill");
    expect(pinOf(bar)).toBe("bottom");
    expect(bar.x).toBe(phone.x);
    expect(bar.y + treeSize(kitTree(docked, bar.id)).h).toBe(landed[0].y + treeSize(landed).h);
    const again = recomposeKits({ groups: docked }, MATERIAL, FLOATING, "en", { frames: [phone] }).groups;
    const floats = rootOf(again, bar.id);
    expect(pinOf(floats)).toBe("floatingBottom");
    expect(floats.x + treeSize(kitTree(again, floats.id)).w / 2).toBeCloseTo(phone.x + W / 2, 0);
  });

  it("keeps a pin a person changed", () => {
    const bar = added("tab-bar", MATERIAL);
    const unpinned = bar.map((g, i) => (i ? g : { ...g, items: [{ ...g.items[0], props: { ...g.items[0].props, pin: "none" } }] }));
    const out = recomposeKits({ groups: unpinned }, MATERIAL, IOS, "en", { frames: [phone] }).groups;
    const box = rootOf(out, bar[0].id);
    expect(box.kit!.variant).not.toBe("pill");
    expect(pinOf(box)).toBe("none");
    expect(roleOf(box.items[0])).toBeUndefined();
  });

  it("leaves a kit added before there were pins unpinned", () => {
    const bar = added("tab-bar", MATERIAL);
    const { pin: _pin, ...props } = bar[0].items[0].props!;
    const old = [{ ...bar[0], items: [{ ...bar[0].items[0], props }] }, ...bar.slice(1)];
    const out = recomposeKits({ groups: old }, MATERIAL, IOS, "en", { frames: [phone] }).groups;
    const box = rootOf(out, bar[0].id);
    expect(box.kit!.variant).not.toBe("pill");
    expect("pin" in box.items[0].props!).toBe(false);
  });
});

describe("a document of boxes without pins", () => {
  /** a bar built of boxes before there were pins: a box at the foot, holding an icon */
  const old = (): Doc => ({
    groups: [
      { id: "head", x: 0, y: 300, axis: "x", items: [{ ...makeItem("box"), id: "headi", props: { surface: "bar", layout: "row", width: W, hugWidth: false } }] },
      { id: "ic", x: 0, y: 300, axis: "x", inFlow: "head", items: [{ ...makeItem("icon"), id: "ici", props: { name: "home" } }] },
      { ...text("body", 0), x: 16, y: 120 },
    ],
    frames: [{ ...phone, x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    title: "Old",
    brief: "",
  });

  it("opens as it was saved, its boxes in the body", () => {
    const opened = openProject(JSON.parse(JSON.stringify(old())))!;
    const box = opened.groups.find((g) => g.id === "head")!;
    expect("pin" in (box.items[0].props ?? {})).toBe(false);
    expect(roleOf(box.items[0])).toBeUndefined();
  });

  it("is tidied as rows of the body, printed where it stands and described without an edge", () => {
    const doc = old();
    const frame = doc.frames[0];
    const widths = { headi: W, "headi:h": 56, ici: 24, "ici:h": 24, "body-i": 380, "body-i:h": 20 };
    const out = tidyFrame(doc.groups, frame, doc.frames, widths, MATERIAL_METRICS) ?? doc.groups;
    /* the box is a row: it stays below the text rather than going to an edge */
    expect(rootOf(out, "head").y).toBeGreaterThan(rootOf(out, "body").y);
    expect(rootOf(out, "head").y + 56).toBeLessThan(H - 100);
    const { code } = buildCode(doc, widths);
    expect(code).toContain("absolute left-[0px] top-[300px]");
    expect(code).not.toContain("inset-x-0 bottom-0");
    expect(buildPrompt(doc, widths, undefined, "en")).not.toContain("fixed to the");
  });
});

describe("a pinned box in code and words", () => {
  const doc = (): Doc => {
    const tabs = added("tab-bar", MATERIAL, { screen: { ...phone, x: 0, y: 0 }, y: 400 });
    const body: Group = { ...text("body", 0), x: 16, y: 120 };
    return { groups: [body, ...tabs], frames: [{ ...phone, x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Pinned", brief: "" };
  };

  it("is printed as a bar fixed to its edge, as wide as the screen, with what it holds inside it", () => {
    const d = doc();
    const root = d.groups.find((g) => g.kit)!;
    const widths = defaultMeasures(d.groups);
    const at = (y: number) => ({ ...d, groups: d.groups.map((g) => (g.id === root.id ? { ...g, y } : g)) });
    /* at the foot it is pinned there */
    const foot = buildCode(at(H - widths[`${root.items[0].id}:h`]), widths).code;
    expect(foot).toContain('className="absolute inset-x-0 bottom-0"');
    expect(foot).toContain('data-slot="box"');
    expect(foot).toMatch(/data-surface="bar"[^>]*width: "100%"|width: "100%"[^>]*data-surface="bar"/);
    expect(foot).toContain("Discover");
    /* left in the middle of the screen it stays where it is, still across it */
    expect(buildCode(at(400), widths).code).toContain('className="absolute inset-x-0 top-[400px]"');
  });

  it("is described as the screen's bar, fixed to its edge", () => {
    const d = doc();
    const widths = defaultMeasures(d.groups);
    for (const [lang, words] of [
      ["en", "fixed to the bottom edge of the screen"],
      ["zh", "固定在屏幕底部"],
      ["ja", "画面の下端"],
      ["ko", "화면 아래쪽 가장자리"],
    ] as const)
      expect(buildPrompt(d, widths, undefined, lang), lang).toContain(words);
  });
});
