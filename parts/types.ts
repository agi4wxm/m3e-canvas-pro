import type { PNode, PValue } from "./node";

/** the languages the editor speaks; kept in step with `Lang` in lib/i18n without importing it */
export type PartLang = "ja" | "en" | "zh" | "ko";

/** a label or a seed text in the editor's languages: `en` is the canonical `label`/`default` */
export type Labels = Partial<Record<PartLang, string>>;

/** a choice of an `enum` prop: the value the component takes, and what the panel calls it */
export type Choice = string | { value: string; label: string; labels?: Labels };

/** one row of a `list` prop: a tab, a menu entry, a destination */
export type ListItem = { label: string; icon?: string; variant?: string; width?: string; image?: string };

/** a per-row choice of a `list` prop: one more column beside the icon and the words
 *  (a button group's per-row variant, say) */
type ListField = { key: "variant" | "width"; label: string; options: Choice[] };

/** One editable prop of a part. The panel builds its controls from these, and `tree` reads the values back. */
export type PropDef = {
  key: string;
  label: string;
  /** what the panel calls the prop in each language; `label` stays the English one */
  labels?: Labels;
  /** the prop only exists when this holds for the current values (a basic dialog's icon, a full-screen one's size) */
  when?: (p: P) => boolean;
  /** the prop is about where the part stands on its screen (a box pinned to an edge as a bar): it means nothing while
   *  a layout places the part, and the panel leaves it out then */
  screen?: boolean;
} & (
  | { kind: "text"; default: string; multiline?: boolean; /** the seed in each language; `default` stays English */ defaults?: Labels }
  | { kind: "enum"; default: string; options: Choice[] }
  | { kind: "bool"; default: boolean }
  | {
      kind: "number";
      default: number;
      min: number;
      max: number;
      step?: number;
      unit?: string;
      /** the measure the canvas handles pull when it is not the prop's name (a basic
       *  dialog's `dialogWidth` is still a width) */
      axis?: "width" | "height";
    }
  /** a Material Symbols name; "" means no icon */
  | { kind: "icon"; default: string }
  /** an image the author picks or links: a `data:` URL or an http(s) address; "" is none */
  | { kind: "image"; default?: string }
  /** rows the author adds and removes; `icons` gives each row an icon as well, `images` a
   *  picture, `fields` one more choice per row */
  | { kind: "list"; default: ListItem[]; min?: number; max?: number; icons?: boolean; images?: boolean; fields?: ListField[] }
  /** rows of cells under named columns: the data a table or a chart shows */
  | { kind: "table"; default: TableData }
);

export type TableData = { columns: string[]; rows: string[][] };

/** the prop values of one part, read by key with the part's own defaults filled in */
export type P = {
  s: (key: string) => string;
  n: (key: string) => number;
  b: (key: string) => boolean;
  list: (key: string) => ListItem[];
  table: (key: string) => TableData;
  /** words a part says by itself, in the editor's language */
  say: (words: string) => string;
  /** a name for the part being drawn, the same wherever it is drawn or printed (from its item's id), or "" when
   *  the tree is drawn for no item: what a part names inside its own drawing (an SVG's gradients) is kept apart
   *  from every other part's by it */
  scope: string;
};

/** the screen a part is drawn on, when it is on one: the frame's size. Anything a part draws
 *  that would fill or be bounded by a real screen is bounded by this instead. */
export type Screen = { w: number; h: number };

/** a place inside a part a tap can be sent from: a destination, a menu item, an icon at a bar's
 *  end. `key` is what the item's `actions` map stores under ("tab:2", "icon"); the nodes that
 *  answer to it carry `data-tap` so the preview can tell the places of one part apart. */
export type PartSlot = {
  key: string;
  label: string;
  icon?: string;
  /** A control of the part's own (a heart, a close button): a press on it counts as a press on the whole part only
   *  where something is wired to it, so an unwired heart never opens what a tap on the card opens. The printers hand
   *  the widget the own slots they wire (`wired`). */
  own?: boolean;
};

/** The kind of value an input hands out: words, a number, yes or no, one row of a list or several, files, a date, a
 *  direction (x and y from -1 to 1). Every host reads and writes an input by this, never by the part's slug. */
export type InputKind = "text" | "number" | "bool" | "choice" | "choices" | "files" | "date" | "vec2";

/** What the visitor enters into a part: the prop that holds it, and its kind. The value is UI state (a draft until
 *  something submits it): a host keeps it, binds it to a variable or a form field, and draws the part with it again. */
export type PartInput = {
  prop: string;
  kind: InputKind;
  /** props of the design's start that the visitor's value takes over from (a split view's `collapsed`: once the divider
   *  has been moved, the share says whether a pane is folded) */
  resets?: string[];
  /** For a choice: the prop whose entries it picks from, a list (its rows' labels) or words separated by commas
   *  (a palette's colors). `items` when left out. A form field and a text variable hold the words of what is picked. */
  options?: string;
};

/** the kind of a field of an event's payload */
export type PayloadKind = "text" | "number" | "bool" | "list" | "object";

/** A named event the part sends out with a payload, beside a tap: an action stored under `Item.actions["on:<name>"]`
 *  runs when it is sent, and its expressions read the payload as `event.<field>`. */
export type PartEvent = {
  /** an identifier: the key is `on:<name>` */
  name: string;
  label: string;
  labels?: Labels;
  /** what `event` carries, field by field */
  payload?: Record<string, PayloadKind>;
};

/** A slot family: one action for every slot whose key starts with `<prefix>:` (the rows of a list, the cells of a
 *  grid), stored under `Item.actions["<prefix>:*"]`. A slot's own action wins over it; its expressions read the slot
 *  tapped as `slot.index` (and `slot.key`). */
export type SlotFamily = { prefix: string; label: string; labels?: Labels };

/** A domain behaviour the part only acts out for a prototype (a prize drawn at random, a coupon that says it was
 *  claimed): it runs only in an explicit prototype mode, and stops as soon as the part is wired to the real thing,
 *  one of `takenOverBy` bound or an action of the part reaching the API. A product never runs it. */
export type PartDemo = { what: string; takenOverBy: string[] };

/** A whole-screen part that keeps its data and its behaviour to itself (a cart that adds up its own rows, a sign-in
 *  form that checks its own fields), retired in favour of the same look built from atoms with bindings. It still draws,
 *  so an old document looks the same, but the palette and the AI's catalog no longer offer it, and adding one is
 *  refused; splitting it (lib/retire.ts) turns it into atoms, its rows into a data collection where they are alike. */
export type PartRetired = {
  /** what to build instead, in a sentence: the kits and atoms, where the data goes, what the taps call */
  use: string;
  /** the kits and parts that replace it, by slug: what the palette shows for a search by the retired part's name */
  with?: string[];
  /** why it retired, where that is not that it keeps its data to itself */
  why?: string;
  /** the operation that turns an old one into what replaces it, where that is no split into atoms (a resizable
   *  becomes a split view whose panes hold parts) */
  convert?: string;
};

/** the part's place on a screen: a bar pinned to an edge, a corner FAB, a centered overlay.
 *  Tidy pins it and the prompt describes it by this. A box takes `top`, `bottom` or `floatingBottom` from its `pin`. */
export type PartRole = "top" | "bottom" | "floatingBottom" | "fab" | "overlay" | "rail" | "label" | "control" | "listLike" | "fullWidth" | "backdrop";

export type PartDef = {
  /** the docs page of the component: /components/<slug> */
  slug: string;
  /** the name the docs and the palette give it */
  name: string;
  /** the name in each language; `name` stays the docs' English one */
  labels?: Labels;
  /** one of the docs' categories */
  category: string;
  /** Material Symbols name, for the palette tile */
  icon: string;
  /** the role it plays on a screen, fixed or read off the props; none flows with the body rows */
  role?: PartRole | ((p: P) => PartRole | undefined);
  /** the size it takes on the canvas until it has been measured */
  w: number;
  h: number;
  props: PropDef[];
  /** the part can take a fill role, a text role and custom corners: the panel offers them, and
   *  they are painted onto the node(s) named by `target` (the tree's root when left out).
   *  `radius` is the corner radius the component already has, the seed the corner editor starts from. */
  appearance?: { target?: string | string[]; radius?: number };
  /** the places inside the part a tap can be sent from, for the panel's slot strip and the
   *  preview's `data-tap` delegation */
  slots?: (p: P) => PartSlot[];
  /** slots that come in families, one action for all of them (see `SlotFamily`) */
  families?: SlotFamily[];
  /** the named events it sends out (see `PartEvent`) */
  events?: PartEvent[];
  /** what the visitor enters into it, when it is an input */
  input?: PartInput;
  /** the domain behaviour it acts out in a prototype, and what takes it over */
  demo?: PartDemo;
  /** it floats over a screen when opened: an open or close effect acts on it */
  overlay?: boolean;
  /** a destination bar: a tap on a destination is shared with the bar of the same entries on every other screen */
  nav?: boolean;
  /** retired: still drawn, no longer offered (see `PartRetired`); parts/defs/retired.ts says it for each */
  retired?: PartRetired;
  /** A container: what lies wholly inside it moves with it, the way a screen carries its parts.
   *  It keeps no list of them; see `heldBy`. */
  holds?: boolean;
  /** The container can lay out what it holds (parts/flow.ts): it carries the props for it, `grid` when it
   *  is always a grid, and `inset` for what it draws around the room it lays out in (a tab bar, a title). */
  flow?: { grid?: boolean; inset?: (p: P) => Partial<{ t: number; r: number; b: number; l: number }> };
  /** The number prop that remembers which row of the part's list is chosen. It goes with its row
   *  when the rows are edited. Where the rows are `slots`, a tap moves it in the preview, and the
   *  destination bars that share their entries share the choice across screens too. */
  selectKey?: string;
  /** A container with tabs: each thing it holds belongs to one (`Group.pane`), and only the chosen
   *  tab's show. The tabs are its `slots`, the chosen one its `selectKey`. */
  panes?: boolean;
  /** the JSX the part stands for */
  tree: (p: P) => PNode;
  /** A composite that can be split: the same thing as a tree of atoms in nested auto-layout boxes,
   *  for its current values. The inspector then offers to replace the part with it in place. It is
   *  composed the way the document's look composes the part (a `KitLook`, parts/kits/types.ts: this
   *  file ships in exported projects, so it does not name it); left out, Material's. */
  atoms?: (p: P, look?: object) => AtomTree;
  /** How big the part comes out before it has been drawn, where no width or height prop says so
   *  (a line of text that hugs its words, an icon button of a named size). Only a guess: the canvas
   *  measures it as soon as it is drawn. */
  guess?: (p: P) => { w?: number; h?: number };
  /** What a part starts with when a person adds it from the palette, over its defaults: a line of text
   *  added by hand hugs its words, as one does in a design tool, while one a template or a model
   *  writes keeps the default it always had. */
  seed?: PropValues;
  /** what the canvas draws instead of `tree`, for a part whose open look is not `tree` made to start open */
  view?: (p: P, screen?: Screen) => PNode;
  /** A part that opens something (a dialog, a menu, a popover) is drawn open on the canvas, inside
   *  a box of this size, so it looks the way it does in use. The code it prints is `tree`, closed. */
  open?: {
    box: (p: P) => { w: number; h: number; ax?: "start" | "end" | "center"; ay?: "start" | "end" | "center" };
    /** the trigger is drawn too (a menu hangs off its button) unless this is "hide" (a dialog stands alone) */
    trigger?: "show" | "hide";
    /** the box hugs the overlay drawn inside it: it is measured and the part stands where the overlay is,
     *  instead of the overlay floating inside a larger box. For parts whose trigger is hidden. */
    fit?: boolean;
    /** props for the overlay's root while it is drawn open, over `open: true` and `modal: false` */
    root?: Record<string, PValue>;
    /** the component to draw in place of another while the part is open (a context menu opens at the pointer, which a drawing has none of) */
    rename?: (type: string) => string;
  };
};

export type PropValues = Record<string, unknown>;

/** A node of a tree of atoms: a part by its id, its props, and the parts its box lays out. The full
 *  shape (names, looks, taps) is `Node` in parts/templates/kit.ts; this file ships in exported
 *  projects, so it only says as much as it needs to. */
export type AtomTree = { slug: string; props: Record<string, unknown>; kids?: AtomTree[] };

/** the box a popup that opens to one side of its trigger is drawn in, with the trigger placed so the popup has room */
export function around(side: string, popupW: number, popupH: number, triggerW: number, triggerH: number, gap = 8) {
  const across = side === "left" || side === "right";
  const w = across ? triggerW + gap + popupW : Math.max(triggerW, popupW);
  const h = across ? Math.max(triggerH, popupH) : triggerH + gap + popupH;
  /* the trigger sits where the popup has room: popups open centered on it, so across a vertical gap it is centered, and it hugs the side the popup is not on */
  return { w, h, ax: across ? (side === "left" ? ("end" as const) : ("start" as const)) : ("center" as const), ay: across ? ("center" as const) : side === "top" ? ("end" as const) : ("start" as const) };
}
