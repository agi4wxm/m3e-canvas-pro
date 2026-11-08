import { arrangeFlows } from "../../flow";
import { PHONE_H, makeItem, type Action, type Doc, type Frame, type Group, type Item } from "../../tokens";
import { defaultMeasures } from "../../../parts/templates/kit";

/* A document of the layouts, ways of getting around and floating parts the kits draw with components of their own,
 * printed into both kits' test beds (rn/src/printed/layouts, miniapp-kit/src/printed/layouts) beside the proof
 * document: containers laying out what they hold (a grid, a dock with something on each tab, a supporting pane, a
 * custom component), the bars and lists of destinations wired to other screens, and what opens off a trigger. */

const go = (to: string): Action => ({ to });

export function layoutsDoc(): { doc: Doc; widths: Record<string, number> } {
  const lay: Frame = { id: "f-layouts", name: "Layouts", x: 0, y: 0, length: 1700 };
  const around: Frame = { id: "f-around", name: "Around", x: 492, y: 0, length: 1320 };
  const floating: Frame = { id: "f-floating", name: "Floating", x: 984, y: 0 };
  const rail: Frame = { id: "f-rail", name: "Rail", x: 1476, y: 0, w: 1024, h: 640 };
  const item = (id: string, slug: string, props: Record<string, unknown>, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
  const g = (id: string, x: number, y: number, it: Item, more: Partial<Group> = {}): Group => ({ id, x, y, axis: "x", items: [it], ...more });
  const flowing = { layout: "column", gap: 8, padX: 16, padY: 16, align: "start" };
  const groups: Group[] = [
    /* ---------- the layouts screen ---------- */
    g("g-grid", 16, 16, item("grid", "grid-view", { label: "Grid", note: "Two columns", columns: 2, rows: 2, width: 380, height: 200 })),
    ...["Cell one", "Cell two", "Cell three", "Cell four"].map((words, i) => g(`g-cell${i}`, 16, 16, item(`cell${i}`, "text", { text: words }), { inFlow: "g-grid" })),
    g("g-dock", 16, 236, item("dock", "dock", { items: [{ label: "Overview" }, { label: "Activity" }], selected: 0, width: 380, height: 180, ...flowing })),
    g("g-on-overview", 16, 236, item("on-overview", "text", { text: "Overview words" }), { inFlow: "g-dock", pane: 0 }),
    g("g-on-activity", 16, 236, item("on-activity", "button", { label: "Activity button" }, { action: go("f-around") }), { inFlow: "g-dock", pane: 1 }),
    g("g-pane", 16, 436, item("pane", "supporting-pane", { label: "Details", note: "More about what is selected.", width: 380, height: 240, ...flowing })),
    g("g-pane-words", 16, 436, item("pane-words", "text", { text: "Pane words" }), { inFlow: "g-pane" }),
    g("g-pane-button", 16, 436, item("pane-button", "button", { label: "Pane button" }), { inFlow: "g-pane" }),
    g("g-custom", 16, 696, item("custom", "custom", { name: "Map of stores", description: "Drawn by the app.", width: 380, height: 140, ...flowing, layout: "row" })),
    g("g-custom-words", 16, 696, item("custom-words", "text", { text: "Custom words" }), { inFlow: "g-custom" }),
    g("g-stack", 16, 856, item("stack", "stack", { label: "Layers", note: "One over another", width: 380, height: 160 })),
    g("g-ratio", 16, 1036, item("ratio", "aspect-ratio", { ratio: "4:3", label: "Four by three", width: 240 })),
    g("g-scroll", 16, 1236, item("scroll", "scroll-area", { label: "Row", count: 8, width: 256, height: 120 })),
    g("g-collapsible", 16, 1376, item("collapsible", "collapsible", { trigger: "Toggle details", content: "The hidden details", open: false })),
    g("g-accordion", 16, 1476, item("accordion", "accordion", { items: [{ label: "First question" }, { label: "Second question" }], content: "The answer" })),

    /* ---------- getting around ---------- */
    g("g-header", 492, 0, item("header", "mini-program-header", { title: "Around" })),
    g("g-menu", 508, 72, item("menu", "navigation-menu", { menus: [{ label: "Guides" }], pages: [{ label: "Start here" }], links: [{ label: "Docs" }] })),
    g("g-pages", 508, 240, item("pages", "pagination", { pages: 8, current: 3, width: 380 }, { actions: { "tab:3": go("f-layouts") } })),
    g("g-toc", 508, 300, item("toc", "toc", { items: [{ label: "Overview" }, { label: "  Install" }, { label: "API" }] }, { actions: { "tab:2": go("f-floating") } })),
    g("g-slide", 508, 460, item("slide", "slide-group", { items: [{ label: "All" }, { label: "Music" }, { label: "Podcasts" }, { label: "Live" }], width: 380 })),
    g("g-shortcuts", 508, 520, item("shortcuts", "icon-grid", { items: [{ label: "Deals", icon: "local_offer", variant: "new" }, { label: "Orders", icon: "receipt_long" }], columns: 4, width: 380 }, { actions: { "tab:1": go("f-layouts") } })),
    g("g-sidebar", 508, 640, item("sidebar", "sidebar", { label: "Places", height: 240 }, { actions: { "tab:1": go("f-floating") } })),
    g("g-onboarding", 508, 900, item("onboarding", "onboarding", { width: 380, height: 300 })),
    g("g-floating-nav", 492 + 46, 1320 - 96, item("floating-nav", "floating-nav", { selected: 1 }, { actions: { "tab:0": go("f-layouts"), "tab:2": go("f-floating") } })),

    /* ---------- what floats ---------- */
    g("g-tooltip", 1000, 16, item("tooltip", "tooltip", { label: "Library", text: "Add to library" })),
    g("g-popover", 1000, 120, item("popover", "popover", { trigger: "Size", title: "Dimensions" })),
    g("g-hover", 1000, 360, item("hover", "hover-card", { trigger: "@material" })),
    g("g-side-sheet", 1000, 540, item("side-sheet", "side-sheet", { title: "Filters", width: 256, height: 240 }, { actions: { confirm: go("f-layouts") } })),
    g("g-drawer", 984, PHONE_H - 240, item("drawer", "drawer", { title: "Share", close: "Close" })),

    /* ---------- a rail on a wide screen ---------- */
    g("g-rail", 1476, 0, item("rail", "navigation-rail", { height: 640 }, { actions: { "tab:1": go("f-around") } })),
  ];
  const widths = defaultMeasures(groups);
  let laid = groups;
  for (let i = 0; i < 4; i++) laid = arrangeFlows(laid, widths);
  return { doc: { groups: laid, frames: [lay, around, floating, rail], paletteKey: "purple", frame: "phone", title: "Layouts", brief: "" }, widths };
}
