import { describe, expect, it, beforeAll } from "vitest";
import { parse } from "@babel/parser";
import { setGlobalLang } from "../../i18n";
import { makeItem, normalizeTheme, type Doc, type Group } from "../../tokens";
import { PARTS, partBySlug } from "../../../parts/registry";
import { NATIVE, PROP_RENAMES } from "../../../rn/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../rn/src/kit/parts.generated";
import { propValues, SET_ONLY } from "./data";
import { rnIconData } from "./icons";
import { printRnScreens, screensIndex } from "./print";
import { resolveColor, rnThemeOf } from "./theme";
import { printRnApp, rnAgentsSection, rnDependencies } from "./app";

/* The React Native printer: a screen's parts become the kit's components with their own props, nested as their auto
 * layout nests them, pinned where the design pins them; the theme comes resolved for the kit; and the kit's data, written
 * by scripts/gen-rn.ts, still says what the editor's registry says. */

beforeAll(() => setGlobalLang("en"));

const parses = (path: string, text: string) => parse(text, { sourceType: "module", plugins: ["typescript", ...(path.endsWith(".tsx") ? (["jsx"] as const) : [])] });

function item(slug: string, props: Record<string, unknown> = {}, more: Partial<ReturnType<typeof makeItem>> = {}) {
  return { ...makeItem(slug), id: `${slug}-${Math.random().toString(36).slice(2, 7)}`, props, ...more };
}

function docOf(groups: Group[], theme?: Doc["theme"]): Doc {
  return { groups, frames: [{ id: "f1", name: "Home", x: 0, y: 0 }, { id: "f2", name: "Detail page", x: 600, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "", ...(theme ? { theme } : {}) };
}

describe("the kit's data", () => {
  it("covers only parts the registry has, under the names the kit takes them by", () => {
    for (const slug of Object.keys(NATIVE)) expect(partBySlug(slug), slug).toBeDefined();
    for (const [slug, renames] of Object.entries(PROP_RENAMES)) for (const key of Object.keys(renames)) if (slug !== "*") expect(partBySlug(slug)?.props.some((d) => d.key === key)).toBe(true);
  });

  it("holds every part's defaults as the registry reads them (run bun run gen:rn when this fails)", () => {
    expect(Object.keys(KIT_PARTS).sort()).toEqual(PARTS.map((d) => d.slug).sort());
    for (const d of PARTS) {
      const own = Object.fromEntries(Object.entries(propValues(d, {})).filter(([k]) => !SET_ONLY.has(k)));
      const kit = KIT_PARTS[d.slug].defaults;
      expect(Object.keys(kit).length, d.slug).toBe(Object.keys(own).length);
      expect(JSON.stringify(Object.values(kit)), d.slug).toBe(JSON.stringify(Object.values(own)));
    }
  });
});

describe("the theme", () => {
  it("resolves a style's colors in both modes, its type ramp, corners and recipes", () => {
    const ios = rnThemeOf({ theme: normalizeTheme({ style: "ios" }), paletteKey: "purple" });
    expect(ios.key).toBe("ios");
    expect(ios.light.colors.primary).toBe("#007AFF");
    expect(ios.dark.colors.primary).toBe("#0A84FF");
    expect(ios.light.st.toggleOn).toBe("#34C759");
    expect(ios.type["body-large"]).toEqual({ size: 17, line: 22, weight: 400, track: -0.4 });
    expect(ios.recipes.toggle).toBe("ios");
    expect(ios.icons).toBe("sf");
    expect(ios.extras.fieldFill).toBe("outline/20");
    for (const mode of [ios.light, ios.dark]) for (const v of Object.values(mode.colors)) expect(v).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/i);
  });

  it("is Material's baseline with no style, and dark where the theme is", () => {
    const m3 = rnThemeOf({ paletteKey: "purple" });
    expect(m3.key).toBe("material");
    expect(m3.light.colors.primary.toUpperCase()).toBe("#6750A4");
    expect(m3.type["title-large"].size).toBe(22);
    expect(m3.control.radius).toBe(999);
    expect(m3.extras).toEqual({});
  });

  it("resolves the colors a style writes: a hex, a role, a role mixed", () => {
    const colors = { outline: "#808080", surface: "#FFFFFF" };
    expect(resolveColor("var(--md-sys-color-outline)", colors)).toBe("#808080");
    expect(resolveColor("color-mix(in srgb,var(--md-sys-color-outline) 50%,transparent)", colors)).toBe("#80808080");
    expect(resolveColor("color-mix(in srgb,var(--md-sys-color-outline) 50%,var(--md-sys-color-surface))", colors)).toBe("#C0C0C0");
    expect(resolveColor("url(x)", colors)).toBeUndefined();
  });
});

describe("the screens", () => {
  it("prints a part with the props it changed, its look and its tap to another screen", () => {
    const button = item("button", { label: "Save", variant: "tonal" }, { action: { to: "f2", transition: "slide" }, fill: "primary", look: { opacity: 50, texture: { kind: "noise" } } });
    const { screens, warnings } = printRnScreens(docOf([{ id: "g1", x: 16, y: 100, axis: "x", items: [button] }]), {});
    const home = screens[0].source.replace(/\n\s*/g, " ");
    expect(home).toContain('<At x={16} y={100}>');
    expect(home).toContain('<Button label="Save" variant="tonal" fill="primary" look={{ opacity: 50, texture: { kind: "noise" } }} onPress={() => nav.go("DetailPage")} />');
    expect(home).toContain("const nav = useNav();");
    expect(warnings.map((w) => w.kind)).toContain("look");
    for (const s of screens) parses(`${s.component}.tsx`, s.source);
  });

  it("nests what an auto layout holds, each in the cell its layout gives it", () => {
    const box = item("box", { layout: "row", gap: 12, align: "center", hugWidth: false, width: 380 });
    const grow = item("text", { text: "Left" }, { flowFill: true });
    const icon = item("icon", { name: "star" }, { alignSelf: "end", flowMin: { w: 20 } });
    const { screens } = printRnScreens(docOf([{ id: "host", x: 16, y: 40, axis: "x", items: [box] }, { id: "k1", x: 16, y: 40, axis: "x", items: [grow], inFlow: "host" }, { id: "k2", x: 100, y: 40, axis: "x", items: [icon], inFlow: "host" }]), {});
    const s = screens[0].source;
    expect(s).toMatch(/<Box layout="row" gap=\{12\} align="center"[^>]*hugWidth=\{false\}[^>]*>/);
    expect(s).toContain('<Cell dir="row" grow>');
    expect(s).toContain('<Cell dir="row" self="end" minW={20}>');
  });

  it("pins a bar to its edge and spans it", () => {
    const bar = item("navigation-bar", {});
    const top = item("app-bar", { title: "Inbox" });
    const { screens } = printRnScreens(docOf([{ id: "t", x: 0, y: 0, axis: "x", items: [top] }, { id: "b", x: 0, y: 892 - 64, axis: "x", items: [bar] }]), { "b-x": 0 });
    expect(screens[0].source).toContain('<Pin edge="top">');
    expect(screens[0].source).toContain('<Pin edge="bottom">');
  });

  it("prints a composite without a component as its atoms, and one with neither as a placeholder, and says so", () => {
    const stat = item("stat-card", {});
    const wheel = item("prize-wheel", {});
    const { screens, warnings } = printRnScreens(docOf([{ id: "a", x: 0, y: 0, axis: "x", items: [stat] }, { id: "b", x: 0, y: 200, axis: "x", items: [wheel] }]), {});
    expect(screens[0].source).toContain("<Box");
    expect(screens[0].source).toContain('<Placeholder part="prize-wheel" name="Prize wheel"');
    expect(warnings.map((w) => w.kind).sort()).toEqual(["atoms", "placeholder"]);
  });

  it("names screens and keys by the author's words, letters only, and writes the index", () => {
    const doc = docOf([]);
    doc.frames = [{ id: "a", name: "Home */ evil", x: 0, y: 0, flow: "Main" }, { id: "b", name: "Home */ evil", x: 600, y: 0 }, { id: "c", name: "合计", x: 1200, y: 0 }];
    const printed = printRnScreens(doc, {});
    expect(printed.screens.map((s) => s.component)).toEqual(["HomeEvilScreen", "HomeEvilScreen2", "Screen3"]);
    expect(printed.initial).toBe(printed.screens[0].key);
    const index = screensIndex(printed);
    parses("index.ts", index);
    expect(index).toContain('FLOWS: { name: string; screen: string }[] = [{ name: "Main"');
  });
});

describe("the app", () => {
  it("writes the screens, the theme, the glyphs, the index and the app, all generated", async () => {
    const doc = docOf([{ id: "g", x: 16, y: 40, axis: "x", items: [item("icon", { name: "home" })] }], normalizeTheme({ style: "wechat" }));
    const app = await printRnApp(doc, {}, { kit: { "index.ts": "export {};" } });
    const paths = app.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["src/generated/theme.ts", "src/generated/icons.ts", "src/generated/screens/HomeScreen.tsx", "src/generated/screens/index.ts", "src/generated/App.tsx", "src/kit/index.ts"]));
    for (const f of app.files) parses(f.path, f.text);
    const icons = app.files.find((f) => f.path === "src/generated/icons.ts")!.text;
    expect(icons).toContain('"mingcute"');
    expect(app.theme.key).toBe("wechat");
  });

  it("carries the glyphs of a family and Material's for what it lacks", async () => {
    const data = await rnIconData(["sf"], ["home", "arrow_back"]);
    expect(Object.keys(data.maps.sf ?? {})).toContain("home");
    expect(data.glyphs["material-symbols:arrow-back-rounded"]).toBeDefined();
  });

  it("names the kit's packages at exact versions, and its part of AGENTS.md", () => {
    const { dependencies } = rnDependencies();
    for (const v of Object.values(dependencies)) expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(dependencies.expo).toBeDefined();
    expect(rnAgentsSection()).toContain("自定义代码（人或 AI 写）");
  });
});
