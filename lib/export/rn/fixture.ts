import { proofDoc } from "../../exportProject.fixture";
import { kitGroups, kitLookOf } from "../../kits";
import { normalizeTheme, withIds, type Doc, type Frame, type Group } from "../../tokens";
import { KITS } from "../../../parts/kits";
import { KIT_ICONS } from "../../../rn/src/kit/icons/names";
import { RnPictures, appModule, iconsModule, themeModule } from "./app";
import { rnIconData } from "./icons";
import { printRnScreens, screensIndex } from "./print";
import { rnThemeOf } from "./theme";

/* Documents printed into the kit's test bed (rn/src/printed), so that what the printer writes is type-checked, linted,
 * rendered by the kit's tests and bundled by Metro there, exactly as an exported app would be: the export's proof
 * document (every system of the web export) under Material, and a screen of kits under iOS (bars pinned to their edges,
 * grouped rows, a search box: atoms in auto layout all the way down). */

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
  return { ...(await printed("proof", proof.doc, proof.widths)), ...(await printed("kits", kits.doc, kits.widths)) };
}

