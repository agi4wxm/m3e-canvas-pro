import { PARTS, partBySlug } from "../parts/registry";
import { instantiate, templateBySlug } from "../parts/templates";
import { defaultMeasures } from "../parts/templates/kit";
import { FRAME_GAP, PHONE_H, PHONE_W, makeItem, type Action, type Doc, type Frame, type Group, type Item } from "./tokens";

/* A document that uses everything a tap can do, with the shop flow behind a menu screen: what the
 * export is tested on, in vitest for its files and in scripts/check-export.ts in a real browser. */

/** one red pixel: a picture the author picked from a file, held as data */
export const PICKED_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const STAY = { to: "none", transition: "none" } as const;
const stay = (effects: Action["effects"]): Action => ({ ...STAY, effects });

export const FORM = "f-form";
export const WELCOME = "f-welcome";
export const COUNTER = "f-counter";
export const INPUTS = "f-inputs";
export const DOCK = "f-dock";
const BARS = "f-bars";
const BARS_TWO = "f-bars-two";
const LONG = "f-long";
const MENU = "f-menu";

const part = (id: string, slug: string, props: Record<string, unknown>, extra: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...extra });
const button = (id: string, label: string, action: Action): Item => part(id, "button", { label, icon: "", variant: "filled", width: 160 }, { action });
const text = (id: string, words: string, extra: Partial<Item> = {}): Item => part(id, "text", { text: words }, extra);

/** the parts of one screen, one under another, in the frame at `index` */
function column(index: number, items: Item[], more: Record<string, Partial<Group>> = {}): Group[] {
  const x = index * (PHONE_W + FRAME_GAP) + 16;
  return items.map((it, i) => ({ id: `g-${it.id}`, x, y: 24 + i * 54, axis: "x", items: [it], ...more[it.id] }));
}

export function proofDoc(): { doc: Doc; widths: Record<string, number> } {
  const names = ["Menu", "Form", "Welcome", "Counter", "Inputs", "Dock", "Bars", "Bars two", "Long"];
  const ids = [MENU, FORM, WELCOME, COUNTER, INPUTS, DOCK, BARS, BARS_TWO, LONG];
  const own: Frame[] = names.map((name, i) => ({ id: ids[i], name, x: i * (PHONE_W + FRAME_GAP), y: 0, ...(ids[i] === LONG ? { length: PHONE_H * 2 } : {}) }));
  /* the long screen stands tall, so nothing beside it shares its height */
  const shop = instantiate(templateBySlug("shop-flow")!, "en", { x: names.length * (PHONE_W + FRAME_GAP), y: 0 });
  const start = shop.frames[0].id;
  const go = (to: string, transition: Action["transition"] = "slide"): Action => ({ to, transition });

  const menu = column(0, [button("to-shop", "Shop", go(start)), button("to-form", "Form", go(FORM, "slideUp")), button("to-counter", "Counter", go(COUNTER, "fade")), button("to-inputs", "Inputs", go(INPUTS, "expand")), button("to-dock", "Dock", go(DOCK, "none")), button("to-bars", "Bars", go(BARS)), button("to-long", "Long", go(LONG))]);

  const form = column(
    1,
    [
      text("form-title", "Sign up"),
      part("email", "text-field", { label: "Email", value: "" }, { bind: { value: "v-email" } }),
      part("terms", "checkbox", { label: "Accept terms", checked: false }),
      text("thanks", "We will write to you", {}),
      button("continue", "Continue", { to: WELCOME, transition: "fade", when: { filled: "terms" }, else: stay([{ do: "snackbar", message: "Accept the terms first" }]) }),
    ],
    { thanks: { showWhen: { filled: "email" } } },
  );

  const welcome = column(2, [text("hello", "", { bind: { text: "v-email" } }), button("welcome-back", "Back to form", { to: "back", transition: "slide" })]);

  const counter = column(
    3,
    [
      text("count", "0", { bind: { text: "v-count" } }),
      button("add", "Add", stay([{ do: "addVar", var: "v-count", by: 1 }])),
      button("reset", "Reset", stay([{ do: "setVar", var: "v-count", value: 0 }])),
      text("three", "Three!"),
      text("secret", "A secret"),
      button("reveal", "Reveal", stay([{ do: "toggle", part: "secret" }])),
      text("title", "Old title"),
      button("retitle", "Retitle", stay([{ do: "setProp", part: "title", prop: "text", value: "New title" }])),
      part("flag", "switch", { label: "Flag", checked: false }, { bind: { checked: "v-flag" } }),
      button("flip", "Flip", stay([{ do: "toggleVar", var: "v-flag" }])),
      text("flag-on", "Flag is on"),
      button("ask", "Ask", stay([{ do: "open", part: "confirm" }])),
      part("confirm", "dialog", { title: "Set it to 100?", description: "Really?", dismiss: "Cancel", confirm: "Accept" }, { actions: { confirm: stay([{ do: "setVar", var: "v-count", value: 100 }]) } }),
      part("picture", "image", { src: PICKED_PNG, alt: "Picked", width: 96, height: 48 }),
      part("more", "dropdown-menu", { label: "More", items: [{ label: "Set to 7" }, { label: "Say hi" }], destructive: "" }, { actions: { "tab:0": stay([{ do: "setVar", var: "v-count", value: 7 }]), "tab:1": stay([{ do: "snackbar", message: "Hi" }]) } }),
    ],
    {
      three: { showWhen: { var: "v-count", op: "eq", value: "3" } },
      secret: { hidden: true },
      "flag-on": { showWhen: { var: "v-flag", op: "eq", value: true } },
      confirm: { hidden: true },
    },
  );

  const inputs = column(
    4,
    [
      part("fruit", "select", { items: [{ label: "Apple" }, { label: "Banana" }, { label: "Cherry" }], selected: 0, width: 224 }, { bind: { selected: "v-fruit" } }),
      text("fruit-said", "", { bind: { text: "v-fruit" } }),
      part("volume", "slider", { value: 40, width: 240 }, { bind: { value: "v-volume" } }),
      text("volume-said", "", { bind: { text: "v-volume" } }),
      part("size", "radio-group", { items: [{ label: "Small" }, { label: "Large" }], selected: 0 }),
      button("large", "Pick large", stay([{ do: "setProp", part: "size", prop: "selected", value: 1 }])),
      text("note", "Note"),
      part("notes", "textarea", { placeholder: "Notes", value: "" }),
      text("noted", "Noted", {}),
      part("city", "input", { placeholder: "City", value: "Oslo" }, { bind: { value: "v-city" } }),
      text("city-said", "", { bind: { text: "v-city" } }),
    ],
    { noted: { showWhen: { filled: "notes" } } },
  );

  /* a destination bar on two screens: the same bar, one choice, as the preview has it */
  const destinations = [{ label: "Home", icon: "home" }, { label: "Search", icon: "search" }, { label: "Inbox", icon: "inbox" }];
  const barAt = (index: number, id: string, selected: number, actions: Item["actions"]): Group => ({ id: `g-${id}`, x: index * (PHONE_W + FRAME_GAP), y: PHONE_H - 96, axis: "x", items: [part(id, "navigation-bar", { items: destinations, selected, width: PHONE_W }, { actions })] });
  const bars = [
    ...column(6, [text("bars-title", "First bars"), part("tabs", "tabs", { items: [{ label: "Red" }, { label: "Green" }, { label: "Blue" }], selected: 0 })]),
    barAt(6, "bar-one", 0, { "tab:1": go(BARS_TWO, "none") }),
    ...column(7, [text("bars-two-title", "Second bars"), button("bars-back", "Bars back", { to: "back", transition: "none" })]),
    barAt(7, "bar-two", 1, { "tab:0": go(BARS, "none") }),
  ];

  /* a screen longer than the device: its body scrolls, what is pinned stays, the FAB folds */
  const long = [
    ...column(8, [text("long-top", "Top of the page")]),
    { id: "g-low", x: 8 * (PHONE_W + FRAME_GAP) + 16, y: PHONE_H + 400, axis: "x" as const, items: [button("low", "Below the fold", stay([{ do: "snackbar", message: "Reached" }]))] },
    { id: "g-long-fab", x: 8 * (PHONE_W + FRAME_GAP) + 200, y: PHONE_H * 2 - 180, axis: "x" as const, items: [part("long-fab", "fab", { label: "Compose", icon: "add" }, { collapseOnScroll: true })] },
    barAt(8, "bar-long", 0, undefined),
  ].map((g) => (g.id === "g-bar-long" ? { ...g, y: PHONE_H * 2 - 96 } : g));

  /* a dock with something on each tab, held in its own layout */
  const dockX = 5 * (PHONE_W + FRAME_GAP) + 16;
  const host: Group = { id: "g-dock", x: dockX, y: 40, axis: "x", items: [part("dock", "dock", { items: [{ label: "One" }, { label: "Two" }, { label: "Three" }], width: 360, height: 320 })] };
  const onTab = (id: string, pane: number, item: Item): Group => ({ id, x: dockX + 16, y: 96, axis: "x", inFlow: "g-dock", pane, items: [item] });
  const dock: Group[] = [
    host,
    onTab("g-tab-a", 0, text("tab-a", "Content one")),
    onTab("g-tab-b", 1, text("tab-b", "Content two")),
    onTab("g-tab-c", 2, button("tab-c", "Content three", stay([{ do: "snackbar", message: "Pressed three" }]))),
  ];

  const groups = [...menu, ...form, ...welcome, ...counter, ...inputs, ...dock, ...bars, ...long, ...shop.groups];
  const doc: Doc = {
    groups,
    frames: [...own, ...shop.frames],
    paletteKey: "purple",
    frame: "phone",
    title: "Proof app",
    brief: "",
    theme: { dark: false, bothModes: false, contrast: "standard", shape: "full", font: "roboto", emphasized: false, motion: "expressive" },
    vars: [
      { id: "v-email", name: "Email", type: "text", value: "" },
      { id: "v-count", name: "Count", type: "number", value: 0 },
      { id: "v-flag", name: "Flag", type: "bool", value: false },
      { id: "v-fruit", name: "Fruit", type: "text", value: "Apple" },
      { id: "v-volume", name: "Volume", type: "number", value: 40 },
      { id: "v-city", name: "City", type: "text", value: "Oslo" },
    ],
  };
  return { doc, widths: defaultMeasures(groups) };
}

/** One screen per part whose chosen entry a tap moves, and one per overlay an effect opens, each with
 *  a way on to the next: every kind there is, without naming them, so a new one is covered too. */
export function sweepDoc(): { doc: Doc; widths: Record<string, number>; pickers: string[]; overlays: string[] } {
  /* a dock and a rail are covered by name elsewhere; a menu's rows are in a popup a sweep would have to open first */
  const pickers = PARTS.filter((d) => d.selectKey && d.slots && !d.panes && !d.open).map((d) => d.slug);
  const overlays = PARTS.filter((d) => d.open?.trigger === "hide" || (d.category === "Overlays" && !d.open)).map((d) => d.slug);
  const all = [...pickers, ...overlays];
  const frames: Frame[] = all.map((slug, i) => ({ id: `s-${slug}`, name: `Sweep ${i + 1}`, x: i * (PHONE_W + FRAME_GAP), y: 0 }));
  const groups: Group[] = all.flatMap((slug, i) => {
    const x = i * (PHONE_W + FRAME_GAP);
    const overlay = overlays.includes(slug);
    const next = frames[(i + 1) % frames.length].id;
    const def = partBySlug(slug)!;
    const buttons: Group[] = [
      { id: `next-${slug}`, x: x + 16, y: PHONE_H - 120, axis: "x", items: [button(`n-${slug}`, "Next", { to: next, transition: "none" })] },
      ...(overlay ? [{ id: `open-${slug}`, x: x + 16, y: PHONE_H - 180, axis: "x" as const, items: [button(`o-${slug}`, "Open it", stay([{ do: "open", part: `p-${slug}` }]))] }] : []),
    ];
    const seed = def.props.find((d) => d.kind === "list");
    const props = seed?.kind === "list" && seed.default.length < 3 ? { [seed.key]: [{ label: "A" }, { label: "B" }, { label: "C" }] } : {};
    return [{ id: `g-${slug}`, x: x + 16, y: 40, axis: "x" as const, ...(overlay ? { hidden: true } : {}), items: [part(`p-${slug}`, slug, props)] }, ...buttons];
  });
  const doc: Doc = { groups, frames, paletteKey: "indigo", frame: "phone", title: "Sweep", brief: "", theme: { dark: true, bothModes: false, contrast: "high", shape: "square", font: "robotoFlex", emphasized: false, motion: "standard" } };
  return { doc, widths: defaultMeasures(groups), pickers, overlays };
}
