import type { Node } from "../templates/kit";
import type { PartCategory } from "../registry";
import type { Labels } from "../types";

/* A kit is a composite that exists only as a tree of atoms: dropped on the canvas it is boxes, words,
 * icons and bare fields in nested auto layouts, each one a part the person can change, move or take
 * out. Its variants are compositions of the same thing (a prompt box on an empty home screen and the
 * one under a conversation); where the right one depends on the style, a variant says which looks it
 * suits, and the kit code never names a style. */

/** What the document's style is like, as far as a composition goes: worked out from the theme
 *  (lib/kits.ts) so that no kit has to know a style by name. Recipe names are the style system's
 *  own words for how it builds each kind of control. */
export type KitLook = {
  /** the kind of product the style is modeled on */
  group: "app" | "desktop" | "mobileGame" | "pcGame";
  /** how the style builds a text field: "m3", "soft", "pill", "boxed", "line"… */
  field: string;
  /** how it builds a top bar: "m3", "center", "line", "plain", "hud"… */
  bar: string;
  /** how it builds a button */
  button: string;
  /** how it builds a list: "m3", "inset", "flush", "plain", "hairline", "tile" */
  list: string;
  /** how it builds a card or a panel */
  surface: string;
  /** how it builds a switch: "m3", "ios", "outline", "block", "chunky" */
  toggle: string;
  /** desktop software sets its controls closer and smaller */
  compact: boolean;
  dark: boolean;
  /** the room the style leaves at a screen's edge, between rows, and between rows of a kind */
  margin: number;
  gap: number;
  tight: number;
};

/** the look of a document with no style: Material's */
export const MATERIAL_LOOK: KitLook = { group: "app", field: "m3", bar: "m3", button: "m3", list: "m3", surface: "m3", toggle: "m3", compact: false, dark: false, margin: 16, gap: 16, tight: 8 };

export type KitVariant = {
  key: string;
  /** what the variant is called, in English; `labels` in the other languages */
  name: string;
  labels: Labels;
  /** The tree of atoms, with the words in every language. A composition may read the look it is
   *  added under (a box that is dark on a light page); left out, Material's. */
  build: (look?: KitLook) => Node;
  /** the looks this composition is the one for; a kit added without a choice takes the first that suits */
  suits?: (look: KitLook) => boolean;
};

export type KitDef = {
  /** an id of its own, apart from every part's */
  slug: string;
  name: string;
  labels: Labels;
  /** the composite section it is shown in */
  category: PartCategory;
  /** Material Symbols name, for the palette tile */
  icon: string;
  /** one line for the AI guide: what it is made of */
  about: string;
  variants: KitVariant[];
};
