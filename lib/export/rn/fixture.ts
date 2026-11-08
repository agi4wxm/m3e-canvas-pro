import { proofDoc } from "../../exportProject.fixture";
import { kitGroups, kitLookOf } from "../../kits";
import { makeItem, normalizeTheme, withIds, type Doc, type Frame, type Group, type Item } from "../../tokens";
import { arrangeFlows } from "../../flow";
import { defaultMeasures } from "../../../parts/templates/kit";
import { KITS } from "../../../parts/kits";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { RnPictures, appModule, iconsModule, themeModule } from "./app";
import { rnIconData } from "./icons";
import { printRnScreens, screensIndex } from "./print";
import { rnThemeOf } from "./theme";
import { layoutsDoc } from "./layoutsFixture";

/* Documents printed into the kit's test bed (rn/src/printed), so that what the printer writes is type-checked, linted,
 * rendered by the kit's tests and bundled by Metro there, exactly as an exported app would be: the export's proof
 * document (every system of the web export) under Material, a screen of kits under iOS (bars pinned to their edges,
 * grouped rows, a search box: atoms in auto layout all the way down), split views (two panes and a divider, nested,
 * and stacked on a phone), and the game parts, actions and menus (D4). */

/** a screen of kits as the editor adds them, stacked down an iOS screen with its tab bar at the foot */
export function kitsDoc(): { doc: Doc; widths: Record<string, number> } {
  const theme = normalizeTheme({ style: "ios" });
  const look = kitLookOf(theme);
  const frame: Frame = { id: "kits", name: "Kits", x: 0, y: 0, flow: "Kits" };
  const groups: Group[] = [];
  /* where each stands on the screen: the editor places them by what they measure, which this headless fixture has not */
  const add = (slug: string, y: number, variant?: string, x = 0) => {
    const kit = KITS.find((k) => k.slug === slug)!;
    groups.push(...kitGroups(kit, look, "en", { variant, at: { x, y }, screen: frame, theme }));
  };
  add("top-app-bar", 0);
  add("search-bar", 72, undefined, 16);
  add("inset-group", 136, undefined, 16);
  add("settings-row", 400, "switch", 16);
  add("button-stack", 480, undefined, 16);
  add("tab-bar", 892 - 90);
  return { doc: { groups, frames: [frame], paletteKey: "purple", frame: "phone", title: "Kits", brief: "", theme }, widths: {} };
}

/** Split views as the editor lays them out: on a desktop screen a split whose second pane holds a split of its own (one
 *  over the other, its second pane folding), each pane holding parts; on a phone a split narrower than its breakpoint,
 *  which stacks its panes. */
export function splitsDoc(): { doc: Doc; widths: Record<string, number> } {
  const desk: Frame = { id: "split-desk", name: "Split desk", x: 0, y: 0, w: 1280, h: 800 };
  const phone: Frame = { id: "split-phone", name: "Split phone", x: 1360, y: 0 };
  const item = (id: string, slug: string, props: Record<string, unknown>) => ({ ...makeItem(slug), id, props });
  const pane = (id: string, props: Record<string, unknown> = {}) => item(id, "box", { surface: "none", layout: "column", gap: 8, padX: 16, padY: 16, align: "stretch", hugWidth: false, hugHeight: false, ...props });
  const g = (id: string, it: Item, more: Partial<Group> = {}): Group => ({ id, x: 0, y: 0, axis: "x", items: [it], ...more });
  const groups: Group[] = [
    g("g-outer", item("outer", "split-view", { width: 1280, height: 800, split: 35, minFirst: 240, persist: true })),
    g("g-left", pane("left"), { inFlow: "g-outer", splitPane: "first", name: "Folders" }),
    g("g-folders", item("folders", "text", { text: "Folders", style: "title" }), { inFlow: "g-left" }),
    g("g-new", item("new-folder", "button", { label: "New folder" }), { inFlow: "g-left" }),
    g("g-right", pane("right", { padX: 0, padY: 0 }), { inFlow: "g-outer", splitPane: "second", name: "Reading" }),
    g("g-inner", { ...item("inner", "split-view", { orientation: "vertical", split: 60, collapsible: "second", minSecond: 120, width: 832, height: 800 }), flowSize: { w: "fill", h: "fill" } }, { inFlow: "g-right" }),
    g("g-top", pane("top"), { inFlow: "g-inner", splitPane: "first", name: "Message" }),
    g("g-message", item("message", "text", { text: "Message", style: "title" }), { inFlow: "g-top" }),
    g("g-bottom", pane("bottom", { surface: "panel" }), { inFlow: "g-inner", splitPane: "second", name: "Terminal" }),
    g("g-terminal", item("terminal", "text", { text: "Terminal", style: "title" }), { inFlow: "g-bottom" }),
    { ...g("g-stack", item("stacked", "split-view", { width: 380, height: 640, split: 40 })), x: 1376, y: 120 },
    g("g-list", pane("list"), { inFlow: "g-stack", splitPane: "first", name: "List" }),
    g("g-list-title", item("list-title", "text", { text: "List", style: "title" }), { inFlow: "g-list" }),
    g("g-detail", pane("detail", { surface: "panel" }), { inFlow: "g-stack", splitPane: "second", name: "Detail" }),
    g("g-detail-title", item("detail-title", "text", { text: "Detail", style: "title" }), { inFlow: "g-detail" }),
  ];
  const widths = defaultMeasures(groups);
  let laid = groups;
  for (let i = 0; i < 4; i++) laid = arrangeFlows(laid, widths);
  return { doc: { groups: laid, frames: [desk, phone], paletteKey: "purple", frame: "phone", title: "Splits", brief: "" }, widths };
}

/** D4: the game parts and the actions and menus a phone draws with components of their own, as the editor adds them
 *  to phone screens: the six prize machines, a pad, a skill, a level map and a board, and a group of buttons, a split
 *  button, a FAB menu, a sign-in button, a command list, a context menu, a bar of filters and a cascading menu. A tap
 *  on a place of each (a machine's button, an egg, a level, a cell, a menu's row) goes to another screen. */
export function playDoc(): { doc: Doc; widths: Record<string, number> } {
  const frames: Frame[] = ["Draws", "Machines", "Play", "Menus"].map((name, i) => ({ id: name.toLowerCase(), name, x: i * 500, y: 0 }));
  const go = (to: string) => ({ to, transition: "slide" as const });
  const part = (id: string, slug: string, at: [screen: number, x: number, y: number], props: Record<string, unknown> = {}, actions: Item["actions"] = {}): Group => ({ id: `g-${id}`, x: at[0] * 500 + at[1], y: at[2], axis: "x", items: [{ ...makeItem(slug), id, props, actions }] });
  const groups: Group[] = [
    part("wheel", "prize-wheel", [0, 16, 40], { result: 2 }, { action: go("menus") }),
    part("grid", "grid-draw", [0, 16, 320]),
    part("gacha", "gacha", [0, 16, 620], { pending: true }),
    part("slot", "slot-machine", [1, 16, 40], { reels: "0,2,1" }),
    part("tree", "money-tree", [1, 16, 220]),
    part("eggs", "egg-smash", [1, 16, 420], {}, { "egg:1": go("draws") }),
    part("pad", "joystick", [2, 16, 40], { ariaLabel: "Move" }),
    part("skill", "skill-button", [2, 180, 40], { label: "Dash" }, { action: go("draws") }),
    part("levels", "level-map", [2, 16, 200], { selected: 1 }, { "tab:0": go("draws") }),
    part("board", "game-board", [2, 16, 500], { cells: "X,,O,,X", status: "O to play", width: 280 }, { "cell:1": go("menus"), reset: go("draws") }),
    part("split", "split-button", [3, 16, 40], {}, { main: go("draws"), "tab:1": go("play") }),
    part("brand", "brand-button", [3, 16, 100], { provider: "google", label: "" }),
    part("command", "command", [3, 16, 160], { width: 380 }, { "tab:2": go("play") }),
    part("context", "context-menu", [3, 16, 400], {}, { "tab:0": go("draws") }),
    part("filters", "filter-bar", [3, 16, 548], { width: 380 }),
    part("cascade", "cascading-menu", [3, 16, 680], {}, { "sub:1": go("machines") }),
    part("buttons", "button-group", [3, 16, 740], {}, { "tab:1": go("play") }),
    part("fab", "fab-menu", [3, 340, 820], {}, { "tab:0": go("draws") }),
  ];
  return { doc: { groups, frames, paletteKey: "purple", frame: "phone", title: "Play", brief: "" }, widths: defaultMeasures(groups) };
}

/** a printed document's files, under rn/src/printed/<name>: its pictures as files beside it, as an exported app has them */
async function printed(name: string, doc: Doc, widths: Record<string, number>): Promise<Record<string, string | Uint8Array>> {
  const at = `rn/src/printed/${name}`;
  const pictures = new RnPictures("assets", "./assets");
  const screens = printRnScreens(doc, widths, { kitImport: "../../../kit", images: { from: "../images", name: pictures.name } });
  const theme = rnThemeOf(doc);
  const icons = await rnIconData([theme.icons], [...screens.icons, ...KIT_ICONS]);
  return {
    [`${at}/theme.ts`]: themeModule(theme, "../../kit"),
    [`${at}/icons.ts`]: iconsModule(icons, "../../kit"),
    ...Object.fromEntries(screens.screens.map((s) => [`${at}/screens/${s.component}.tsx`, s.source])),
    [`${at}/screens/index.ts`]: screensIndex(screens),
    [`${at}/App.tsx`]: appModule("../../kit", screens),
    [`${at}/warnings.json`]: `${JSON.stringify(screens.warnings, null, 1)}\n`,
    ...(pictures.any ? { [`${at}/images.ts`]: pictures.module() } : {}),
    ...Object.fromEntries(Object.entries(pictures.files).map(([path, bytes]) => [`${at}/${path}`, bytes])),
  };
}

/** every file of the test bed's printed documents, by its path from the repo's root */
export async function printedFixture(): Promise<Record<string, string | Uint8Array>> {
  /* the same ids every time, so the files are the same every time */
  let n = 0;
  const next = () => `id${++n}`;
  const proof = withIds(next, proofDoc);
  const kits = withIds(next, kitsDoc);
  const splits = withIds(next, splitsDoc);
  const play = withIds(next, playDoc);
  const layouts = withIds(next, layoutsDoc);
  return { ...(await printed("proof", proof.doc, proof.widths)), ...(await printed("kits", kits.doc, kits.widths)), ...(await printed("splits", splits.doc, splits.widths)), ...(await printed("play", play.doc, play.widths)), ...(await printed("layouts", layouts.doc, layouts.widths)) };
}

