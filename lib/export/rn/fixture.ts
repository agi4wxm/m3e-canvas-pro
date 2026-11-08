import { proofDoc } from "../../exportProject.fixture";
import { kitGroups, kitLookOf } from "../../kits";
import { makeItem, normalizeTheme, withIds, type Doc, type DocVar, type Frame, type Group, type Item } from "../../tokens";
import { arrangeFlows } from "../../flow";
import { defaultMeasures } from "../../../parts/templates/kit";
import { KITS } from "../../../parts/kits";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { RnPictures, appModule, iconsModule, themeModule } from "./app";
import { rnIconData } from "./icons";
import { printRnScreens, screensIndex } from "./print";
import { rnThemeOf } from "./theme";

/* Documents printed into the kit's test bed (rn/src/printed), so that what the printer writes is type-checked, linted,
 * rendered by the kit's tests and bundled by Metro there, exactly as an exported app would be: the export's proof
 * document (every system of the web export) under Material, a screen of kits under iOS (bars pinned to their edges,
 * grouped rows, a search box: atoms in auto layout all the way down), and split views (two panes and a divider, nested,
 * and stacked on a phone). */

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
    const it: Item = { ...makeItem(slug), id: slug, props, ...(bind ? { bind } : {}) };
    groups.push({ id: `g-${slug}`, x: frame.x + 16, y, axis: "x", items: [it] });
    y += h + 24;
  };
  add(pickers, "native-select", 56);
  add(pickers, "combobox", 56, { clear: true, selected: 1 });
  add(pickers, "calendar", 340, { mode: "range" });
  add(pickers, "color-field", 56, {}, { value: "color" });
  add(pickers, "wheel-picker", 180);
  add(pickers, "item-picker", 168, {}, { selected: "trip" });
  add(pickers, "multi-select", 80, { selected: "1,3" });
  add(pickers, "color-palette", 96, {}, { selected: "swatch" });
  add(pickers, "number-picker", 200, { unit: "kg" });
  add(pickers, "transfer-list", 220);
  add(pickers, "region-picker", 372, {}, { value: "area" });
  add(pickers, "seat-map", 380, { total: "$90" }, { picked: "seats" });
  y = 24;
  add(entry, "input-group", 56, { button: "Go" });
  add(entry, "input-otp", 56, { value: "12" });
  add(entry, "field", 96, { control: "switch", error: "Turn it on" });
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
  /* D3 */
  const inputs = withIds(next, inputsDoc);
  return { ...(await printed("proof", proof.doc, proof.widths)), ...(await printed("kits", kits.doc, kits.widths)), ...(await printed("splits", splits.doc, splits.widths)), ...(await printed("inputs", inputs.doc, inputs.widths)) };
}

