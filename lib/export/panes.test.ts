import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { outOfPane } from "../flow";
import { makeItem, type Doc, type Group, type Item } from "../tokens";
import { partBySlug, reader } from "../../parts/registry";
import { dockPanes, isLaidOutDock, offTabOf, paneOf } from "./panes";
import { iconNamesOf, printRnScreens } from "./rn/print";
import { printMiniScreens } from "./miniapp/print";
import { layoutsDoc } from "./rn/layoutsFixture";

/* The printers on the parts the kits draw with components of their own since the third batch's last package: a dock
 * that switches its tabs itself gets what every tab holds, tab by tab; the containers get the parts they lay out; the
 * ways of getting around keep their taps of places; an onboarding's icons travel with the app. */

beforeAll(() => setGlobalLang("en"));

const item = (id: string, slug: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
const group = (id: string, it: Item, more: Partial<Group> = {}): Group => ({ id, x: 0, y: 0, axis: "x", items: [it], ...more });
const docOf = (groups: Group[]): Doc => ({ groups, frames: [{ id: "f1", name: "Home", x: 0, y: 0 }, { id: "f2", name: "Other", x: 600, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" });
const sizes = { dock: 300, "dock:h": 300, a: 100, "a:h": 40, b: 100, "b:h": 40, c: 100, "c:h": 40 };

/** a dock on its second tab, a part on each tab, and one laid out in a box on the first */
function docked(layout: string) {
  return [
    group("g-dock", item("dock", "dock", { items: [{ label: "One" }, { label: "Two" }], selected: 1, layout, width: 300, height: 300 })),
    group("g-a", item("a", "button", { label: "On one" }), { inFlow: "g-dock", pane: 0, y: 40 }),
    group("g-b", item("b", "text", { text: "On two" }), { inFlow: "g-dock", pane: 1, y: 40 }),
    group("g-box", item("box", "box", { layout: "column" }), { inFlow: "g-dock", pane: 0, y: 90 }),
    group("g-c", item("c", "text", { text: "In the box" }), { inFlow: "g-box" }),
  ];
}

describe("a dock's tabs", () => {
  it("keeps what a laid-out dock's other tabs hold, all the way down", () => {
    const groups = docked("column");
    expect(isLaidOutDock(groups[0])).toBe(true);
    expect([...outOfPane(groups, sizes)].sort()).toEqual(["g-a", "g-box", "g-c"]);
    expect(offTabOf(groups, sizes).size).toBe(0);
    expect(dockPanes(groups[0], groups.filter((g) => g.inFlow === "g-dock")).map(([pane, gs]) => [pane, gs.map((g) => g.id)])).toEqual([
      [0, ["g-a", "g-box"]],
      [1, ["g-b"]],
    ]);
  });

  it("keeps a tab that was taken away on the last one there is", () => {
    const groups = docked("column");
    expect(paneOf({ ...groups[1], pane: 7 }, groups[0])).toBe(1);
  });

  it("leaves out what lies loose over a dock with no auto layout, as before", () => {
    const loose = [group("g-dock", item("dock", "dock", { items: [{ label: "One" }, { label: "Two" }], selected: 1, layout: "free", width: 300, height: 300 })), group("g-a", item("a", "button", { label: "On one" }), { pane: 0, x: 10, y: 40 })];
    expect(isLaidOutDock(loose[0])).toBe(false);
    expect(offTabOf(loose, sizes)).toEqual(outOfPane(loose, sizes));
  });

  it("prints each tab's parts in a DockPane, on a phone and in a mini-program", () => {
    const doc = docOf(docked("column"));
    const rn = printRnScreens(doc, sizes).screens[0].source;
    expect(rn).toMatch(/<Dock [^>]*selected=\{1\}[^>]*>\s+<DockPane pane=\{0\}>\s+<Button label="On one"/);
    expect(rn).toMatch(/<DockPane pane=\{1\}>\s+<Text text="On two" \/>/);
    expect(rn).toContain('<Text text="In the box" />');
    const mini = printMiniScreens(doc, sizes).screens[0].source;
    expect(mini).toMatch(/<DockPane pane=\{0\}>\s+<Button label="On one"/);
    expect(mini).toMatch(/<DockPane pane=\{1\}>\s+<Text text="On two"/);
    expect(mini).toContain("import { At, Box, Button, Dock, DockPane,");
  });
});

describe("the layouts document", () => {
  const { doc, widths } = layoutsDoc();

  it("prints no placeholder and nothing drawn as atoms, on a phone or in a mini-program", () => {
    const rn = printRnScreens(doc, widths);
    expect(rn.warnings.filter((w) => w.kind === "placeholder" || w.kind === "holder" || w.kind === "atoms")).toEqual([]);
    const mini = printMiniScreens(doc, widths);
    expect(mini.warnings.filter((w) => w.kind === "placeholder" || w.kind === "holder" || w.kind === "atoms")).toEqual([]);
  });

  it("nests what a container lays out inside it", () => {
    const [layouts] = printRnScreens(doc, widths).screens;
    expect(layouts.source).toMatch(/<GridView[^>]*>\s+<Text text="Cell one" \/>/);
    expect(layouts.source).toMatch(/<SupportingPane layout="column"[^>]*>\s+<Text text="Pane words" \/>/);
    expect(layouts.source).toMatch(/<CustomComponent [^>]*layout="row"[^>]*>\s+<Text text="Custom words" \/>/);
    const mini = printMiniScreens(doc, widths).screens[0].source;
    expect(mini).toMatch(/<GridView[^>]*>\s+<Text text="Cell one"/);
  });

  it("keeps the taps of the destinations, wired the way the navigation bar's are", () => {
    const around = printRnScreens(doc, widths).screens.find((s) => s.key === "Around")!.source;
    expect(around).toContain('taps={{ "tab:3": () => nav.go("Layouts") }}');
    expect(around).toContain('taps={{ "tab:0": () => nav.go("Layouts"), "tab:2": () => nav.go("Floating") }}');
    const mini = printMiniScreens(doc, widths).screens.find((s) => s.key === "around")!.source;
    expect(mini).toMatch(/<Pagination [^>]*taps=\{\{ "tab:3": s\.tap\(A\d, \{ \$: \$ \}\) \}\}/);
  });
});

describe("the icons an app carries", () => {
  it("are an onboarding's too: its pages' column of icons", () => {
    const def = partBySlug("onboarding")!;
    const data = reader(def, {}).table("data");
    expect(iconNamesOf("onboarding", { data })).toEqual(["explore", "bolt", "verified_user"]);
    expect(iconNamesOf("onboarding", { data: { columns: ["Icon"], rows: [["rocket"], [""], [3]] } })).toEqual(["rocket"]);
  });
});
