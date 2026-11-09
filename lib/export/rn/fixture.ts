import { proofDoc } from "../../exportProject.fixture";
import { kitGroups, kitLookOf } from "../../kits";
import { FRAME_GAP, PHONE_W, makeItem, normalizeTheme, withIds, type Action, type Doc, type DocVar, type Frame, type Group, type Item } from "../../tokens";
import { arrangeFlows } from "../../flow";
import { defaultMeasures } from "../../../parts/templates/kit";
import { KITS } from "../../../parts/kits";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { RnPictures, appModule, iconsModule, themeModule } from "./app";
import { rnIconData } from "./icons";
import { printRnScreens, screensIndex } from "./print";
import { rnThemeOf } from "./theme";
import { layoutsDoc } from "./layoutsFixture";
import { slotFiles, slotNames, slotsOf, type SlotPaths } from "../appCapabilities";

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
  const go = (to: string) => ({ to });
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

/* D3: the pickers and the entry parts */

/** The pickers and what a person enters beyond a plain field, down two long phone screens as the editor adds them, some
 *  bound to variables: words, a choice held as the words of its option and as its place, a number, a list one a line. */
export function inputsDoc(): { doc: Doc; widths: Record<string, number> } {
  const pickers: Frame = { id: "pickers", name: "Pickers", x: 0, y: 0, h: 3000 };
  const entry: Frame = { id: "entry", name: "Entry", x: 480, y: 0, h: 2800 };
  const vars: DocVar[] = [
    { id: "color", name: "color", type: "text", value: "#386A20" },
    { id: "trip", name: "trip", type: "text", value: "Travel" },
    { id: "swatch", name: "swatch", type: "number", value: 2 },
    { id: "area", name: "area", type: "text", value: "" },
    { id: "seats", name: "seats", type: "text", value: "" },
    { id: "count", name: "count", type: "number", value: 2 },
    { id: "tags", name: "tags", type: "text", value: "Design\nPrototype" },
    { id: "notes", name: "notes", type: "text", value: "" },
  ];
  const groups: Group[] = [];
  let y = 24;
  const add = (frame: Frame, slug: string, h: number, props: Record<string, unknown> = {}, bind?: Record<string, string>) => {
    /* a variable is bound by the expression that reads it (its name is its id here) */
    const it: Item = { ...makeItem(slug), id: slug, props, ...(bind ? { bind: Object.fromEntries(Object.entries(bind).map(([k, v]) => [k, v.startsWith("=") ? v : `=vars.${v}`])) } : {}) };
    groups.push({ id: `g-${slug}`, x: frame.x + 16, y, axis: "x", items: [it] });
    y += h + 24;
  };
  add(pickers, "native-select", 56);
  add(pickers, "combobox", 56, { clear: true, selected: 1 });
  add(pickers, "calendar", 340, { mode: "range" });
  add(pickers, "color-field", 56, {}, { value: "color" });
  add(pickers, "wheel-picker", 180);
  add(pickers, "item-picker", 168, {}, { selected: "trip" });
  add(pickers, "multi-select", 80, { picked: "0,2" });
  add(pickers, "color-palette", 96, {}, { selected: "swatch" });
  add(pickers, "number-picker", 200, { unit: "kg" });
  add(pickers, "transfer-list", 220);
  add(pickers, "region-picker", 372, {}, { value: "area" });
  add(pickers, "seat-map", 380, { total: "$90" }, { picked: "seats" });
  y = 24;
  add(entry, "input-group", 56, { button: "Go" });
  add(entry, "input-otp", 56, { value: "12" });
  add(entry, "field", 96, { control: "switch", errorText: "Turn it on" });
  add(entry, "form", 240);
  add(entry, "copy-row", 40);
  add(entry, "quantity-stepper", 56, {}, { value: "count" });
  add(entry, "tag-input", 104, {}, { items: "tags" });
  add(entry, "phone-input", 56);
  add(entry, "number-pad", 440, { mode: "pin", length: 4 });
  add(entry, "signature-pad", 260);
  add(entry, "rich-text-editor", 300, {}, { text: "notes" });
  return { doc: { groups, frames: [pickers, entry], vars, paletteKey: "purple", frame: "phone", title: "Inputs", brief: "" }, widths: {} };
}

/* D2: the data, list and desktop parts */

/** The data, list and desktop parts as an author places them: charts down a long phone screen, tables, a board and a
 *  month down another, the lists that do more than show rows on a third (a tap on a file and on a table's row going on to
 *  the next screen), and on a desktop screen a menu bar over a window whose auto layout holds a tree, code and a diff. */
export function dataDoc(): { doc: Doc; widths: Record<string, number> } {
  const at = (i: number) => i * (PHONE_W + FRAME_GAP);
  const frames: Frame[] = [
    { id: "d-charts", name: "Charts", x: at(0), y: 0, length: 2000 },
    { id: "d-tables", name: "Tables", x: at(1), y: 0, length: 2400 },
    { id: "d-lists", name: "Lists", x: at(2), y: 0 },
    { id: "d-desk", name: "Desk", x: at(3), y: 0, w: 1280, h: 800 },
  ];
  const go = (to: string): Action => ({ to, motion: { kind: "instant" } });
  const item = (id: string, slug: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
  const place = (frame: number, y: number, it: Item, more: Partial<Group> = {}): Group => ({ id: `g-${it.id}`, x: at(frame) + 16, y, axis: "x", items: [it], ...more });
  const sales = { columns: ["Day", "Shop", "Web"], rows: [["Mon", "3", "5"], ["Tue", "4", "6"], ["Wed", "2", "7"]] };
  const groups: Group[] = [
    place(0, 24, item("bars", "chart", { width: 380 })),
    place(0, 340, item("areas", "chart", { type: "area", title: "Sales", subtitle: "", data: sales, width: 380, height: 180 })),
    place(0, 580, item("ring", "chart", { type: "pie", title: "Share", data: sales, width: 380, height: 200 })),
    place(0, 840, item("points", "scatter-plot", { width: 380 })),
    place(0, 1100, item("heat", "heatmap", { width: 380 })),
    place(0, 1320, item("battery", "gauge", { value: 40, label: "Fuel" })),
    place(0, 1460, item("trend", "sparkline", { values: "3,5,2,8", kind: "bar", width: 380 })),
    place(0, 1620, item("funnel", "funnel-chart", { width: 380 })),
    place(1, 24, item("invoices", "table", { data: { columns: ["Invoice", "Amount", "Paid"], rows: [["INV-1", "250", "yes"], ["INV-2", "1200.5", "no"]], spec: [{ key: "invoice", width: 120 }, { key: "amount", type: "currency", format: "EUR" }, { key: "paid", type: "bool" }] }, caption: "Q3", selectedRow: 0, width: 380 })),
    place(1, 280, item("orders", "data-table", { pageSize: 3, width: 380 }, { actions: { "row:0": go("d-lists") } })),
    place(1, 760, item("sources", "bar-list", { selected: 1, width: 380 })),
    place(1, 1000, item("notes", "markdown", { text: "## Notes\n\nShip **today**, run `deploy`.\n\n- Check\n- Ship", width: 380 })),
    place(1, 1200, item("month", "agenda", { width: 380 })),
    place(1, 1700, item("board", "kanban", { width: 380 })),
    place(1, 2060, item("plan", "gantt-chart", { width: 380 })),
    place(2, 24, item("uptime", "tracker", { width: 380 })),
    place(2, 120, item("order", "sortable-list", { items: [{ label: "Wash" }, { label: "Dry" }, { label: "Fold" }], width: 380 })),
    place(2, 320, item("swipe", "swipe-row", { title: "Invoice 42", note: "Due today", open: true, width: 380 })),
    place(2, 420, item("files", "file-list", { selected: 0, width: 380 }, { actions: { "tab:1": go("d-desk") } })),
    { ...place(3, 16, item("menus", "menubar")), x: at(3) + 16 },
    { ...place(3, 80, item("window", "window", { title: "Project", controls: "windows", layout: "column", gap: 12, padX: 16, padY: 16, align: "stretch", width: 900, height: 640 })), x: at(3) + 16 },
    { id: "g-files-tree", x: 0, y: 0, axis: "x", items: [item("tree", "tree", { width: 300 })], inFlow: "g-window" },
    { id: "g-code", x: 0, y: 0, axis: "x", items: [item("code", "code-block", { width: 600 })], inFlow: "g-window" },
    { id: "g-diff", x: 0, y: 0, axis: "x", items: [item("diff", "file-diff", { width: 600 })], inFlow: "g-window" },
  ];
  const widths = defaultMeasures(groups);
  let laid = groups;
  for (let i = 0; i < 4; i++) laid = arrangeFlows(laid, widths);
  return { doc: { groups: laid, frames, paletteKey: "purple", frame: "phone", title: "Data", brief: "" }, widths };
}

/** D1: the media parts, the capability views' stand-ins and the parts that talk and keep time, as the kits draw them
 *  natively: three phone screens of them, each with props of its own (markers and a route, a playlist's rows, stories
 *  seen and not, a call under way), so what the printer writes for them is held to the kits' props. */
export function mediaDoc(): { doc: Doc; widths: Record<string, number> } {
  const frames: Frame[] = [
    { id: "media-watch", name: "Media watch", x: 0, y: 0 },
    { id: "media-listen", name: "Media listen", x: 480, y: 0 },
    { id: "media-talk", name: "Media talk", x: 960, y: 0 },
  ];
  const item = (id: string, slug: string, props: Record<string, unknown>) => ({ ...makeItem(slug), id, props });
  const at = (frame: number, x: number, y: number, it: Item): Group => ({ id: `g-${it.id}`, x: frames[frame].x + x, y: frames[frame].y + y, axis: "x", items: [it] });
  const markers = { columns: ["Id", "Title", "Lat", "Lng"], rows: [["a", "Harbour", "31.2", "121.4"], ["b", "Old town", "31.25", "121.5"]] };
  const groups: Group[] = [
    at(0, 0, 16, item("carousel-x", "expressive-carousel", { width: 412, height: 140, slides: [{ label: "Sunrise" }, { label: "Forest" }, { label: "Ocean" }, { label: "Desert" }] })),
    at(0, 16, 170, item("video", "video", { width: 380, title: "Trailer", time: "00:30" })),
    at(0, 16, 400, item("map", "map", { width: 380, height: 180, markers, selected: "a", route: true, label: "Stores" })),
    at(0, 16, 600, item("photos", "photo-grid", { count: 6, columns: 3, width: 180 })),
    at(0, 212, 600, item("qr", "qr-code", { text: "https://m3e.dev", size: 120, caption: "Scan to open" })),
    at(0, 16, 800, item("marquee", "marquee", { text: "Doors open at six", seconds: 8, width: 380 })),
    at(1, 16, 16, item("player", "audio-player", { title: "Morning song", artist: "Ada", seconds: 200, position: 30, playing: true, width: 380 })),
    at(1, 16, 130, item("lessons", "playlist", { title: "Getting started", selected: 1, playing: true, width: 380 })),
    at(1, 16, 450, item("viewer", "image-viewer", { height: 160, width: 380, images: [{ label: "Harbour" }, { label: "Old town" }] })),
    at(1, 16, 700, item("ticker", "number-ticker", { value: 1280, prefix: "$" })),
    at(1, 200, 700, item("timer", "timer", { seconds: 90, width: 196 })),
    at(1, 16, 780, item("shimmer", "shimmer-text", { text: "Thinking…" })),
    at(1, 16, 820, item("animation", "animation", { size: 56, file: "spin.json" })),
    at(2, 0, 16, item("stories", "story-row", { width: 412, items: [{ label: "Your story" }, { label: "Ada" }, { label: "Grace", variant: "seen" }] })),
    at(2, 16, 120, item("today", "marker", { text: "Today", width: 380 })),
    at(2, 16, 150, item("scroller", "message-scroller", { width: 380, height: 200 })),
    at(2, 16, 360, item("voice", "voice-message", { seconds: 9, mine: true, width: 240 })),
    at(2, 16, 440, item("quiz", "questionnaire", { question: "Which do you use?", steps: 2, width: 380 })),
    at(2, 16, 640, item("call", "video-call", { name: "Ada", width: 240, height: 240, mic: false })),
    at(2, 264, 640, item("camera", "camera", { mode: "scan", width: 132, height: 240 })),
  ];
  const widths = defaultMeasures(groups);
  return { doc: { groups, frames, paletteKey: "purple", frame: "phone", title: "Media", brief: "" }, widths };
}

/** Parts the product draws itself (`Item.slot`, report 9.3): a button the kit has a component for, by the name the
 *  design gives its slot, and a stat card the kit draws as its atoms; their slots are written beside the screens as an
 *  exported app has them (src/generated/slots.tsx, src/custom/slots), so that what they are handed type-checks. */
export function slotsDoc(): { doc: Doc; widths: Record<string, number> } {
  const home: Frame = { id: "slots-home", name: "Slots", x: 0, y: 0, flow: "Slots" };
  const done: Frame = { id: "slots-done", name: "Bought", x: PHONE_W + FRAME_GAP, y: 0 };
  const groups: Group[] = [
    { id: "g-buy", x: 16, y: 120, axis: "x", items: [{ ...makeItem("button"), id: "buy", props: { label: "Buy" }, slot: "BuyButton", action: { to: done.id } }] },
    { id: "g-stat", x: 16, y: 200, axis: "x", name: "Sales today", items: [{ ...makeItem("stat-card"), id: "stat", slot: true }] },
    { id: "g-done", x: 16, y: 120, axis: "x", items: [{ ...makeItem("text"), id: "thanks", props: { text: "Thank you" } }] },
  ];
  return { doc: { groups: groups.map((g) => (g.id === "g-done" ? { ...g, x: g.x + done.x } : g)), frames: [home, done], paletteKey: "purple", frame: "phone", title: "Slots", brief: "" }, widths: defaultMeasures(groups) };
}

/** where a test bed's slots reach the kit and each other: beside its screens */
export const TEST_BED_SLOTS: SlotPaths = { kit: "../../kit", custom: "./custom/slots", kitFromCustom: "../../../../kit" };

/** the slots of a printed document, at their places beside its screens (`at`) */
export function testBedSlots(at: string, doc: Doc, platform: "mobile" | "miniapp"): Record<string, string> {
  const files = slotFiles("@m3e", slotsOf(doc).filter((s) => !s.view), platform, TEST_BED_SLOTS);
  return Object.fromEntries(Object.entries(files).map(([path, f]) => [`${at}/${path.replace(/^src\/generated\//, "").replace(/^src\//, "")}`, f.body as string]));
}

/** a printed document's files, under rn/src/printed/<name>: its pictures as files beside it, as an exported app has them */
async function printed(name: string, doc: Doc, widths: Record<string, number>): Promise<Record<string, string | Uint8Array>> {
  const at = `rn/src/printed/${name}`;
  const pictures = new RnPictures("assets", "./assets");
  /* the parts the design marks as the product's own: a capability view's slot types come from a package the test bed has not */
  const slots = slotsOf(doc).filter((s) => !s.view);
  const screens = printRnScreens(doc, widths, { kitImport: "../../../kit", images: { from: "../images", name: pictures.name }, ...(slots.length ? { slots: { from: "../slots", names: slotNames(slots) } } : {}) });
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
    ...testBedSlots(at, doc, "mobile"),
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
  /* D3 */
  const inputs = withIds(next, inputsDoc);
  /* D2: the data, list and desktop parts */
  const data = withIds(next, dataDoc);
  /* D1: the media parts, the capability views' stand-ins, what talks and keeps time */
  const media = withIds(next, mediaDoc);
  /* the parts the product draws itself (report 9.3) */
  const slots = withIds(next, slotsDoc);
  return { ...(await printed("proof", proof.doc, proof.widths)), ...(await printed("kits", kits.doc, kits.widths)), ...(await printed("splits", splits.doc, splits.widths)), ...(await printed("play", play.doc, play.widths)), ...(await printed("layouts", layouts.doc, layouts.widths)), ...(await printed("inputs", inputs.doc, inputs.widths)), ...(await printed("data", data.doc, data.widths)), ...(await printed("media", media.doc, media.widths)), ...(await printed("slots", slots.doc, slots.widths)) };
}

