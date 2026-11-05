import { h, ic, listSlots, type PNode } from "../node";
import type { ListItem, PartDef } from "../types";

const TONES = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
];

const SLIDES: ListItem[] = [{ label: "Sunrise" }, { label: "Forest" }, { label: "Ocean" }, { label: "Desert" }, { label: "Glacier" }, { label: "Canyon" }];

/* words over a photo: no theme role can answer for what the photo is */
const SCRIM = { caption: "bg-gradient-to-t from-black/60 to-transparent text-white" } as const;

const pictureOf = (s: ListItem) => (typeof s.image === "string" ? s.image : "");

/** what a slide shows: its picture with its words over it, or its words alone */
function slideFace(s: ListItem): (PNode | string)[] {
  const src = pictureOf(s);
  if (!src) return [s.label];
  const picture = h("img", { src, alt: s.label, className: "absolute inset-0 size-full object-cover" });
  return s.label ? [picture, h("span", { className: `absolute inset-x-0 bottom-0 block truncate p-3 text-title-medium ${SCRIM.caption}` }, s.label)] : [picture];
}

/** the Material shape library, in the order of the docs page */
const SHAPES = [
  "4-leaf-clover", "4-sided-cookie", "6-sided-cookie", "7-sided-cookie", "8-leaf-clover", "9-sided-cookie", "12-sided-cookie",
  "burst", "oval", "pentagon", "pill", "soft-burst", "sunny", "very-sunny", "bun", "boom", "arch", "arrow", "diamond", "fan",
  "flower", "gem", "ghost-ish", "heart", "hexagon", "pixel-circle", "pixel-triangle", "puffy", "puffy-diamond", "semicircle",
  "slanted", "soft-boom", "square", "circle", "triangle",
];

const ICON_COLORS: Record<string, string | undefined> = {
  default: undefined,
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  error: "text-error",
  muted: "text-on-surface-variant",
  "on-surface": "text-on-surface",
  "on-primary": "text-on-primary",
  inverse: "text-inverse-on-surface",
};

const SHAPE_COLORS: Record<string, string | undefined> = {
  primary: undefined,
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  "primary-container": "bg-primary-container",
  "secondary-container": "bg-secondary-container",
  "tertiary-container": "bg-tertiary-container",
  "surface-container": "bg-surface-container",
  "surface-container-high": "bg-surface-container-high",
  outline: "bg-outline",
  error: "bg-error",
};

const RATIOS: Record<string, number> = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1, "3:4": 3 / 4, "21:9": 21 / 9 };

const INITIALS = ["A", "B", "C", "D", "E"];

const px = (n: number) => Math.round(n);

export const content: PartDef[] = [
  {
    slug: "icon",
    name: "Icon",
    category: "Basics",
    icon: "emoji_symbols",
    w: 24,
    h: 24,
    props: [
      { key: "name", label: "Icon", kind: "icon", default: "favorite" },
      { key: "size", label: "Size", kind: "number", default: 24, min: 16, max: 96, step: 4, unit: "px" },
      { key: "filled", label: "Filled", kind: "bool", default: false },
      { key: "color", label: "Color", kind: "enum", default: "default", options: Object.keys(ICON_COLORS) },
    ],
    guess: (p) => ({ w: px(p.n("size")), h: px(p.n("size")) }),
    tree: (p) =>
      h("Icon", {
        name: p.s("name") || "favorite",
        size: p.n("size") === 24 ? undefined : px(p.n("size")),
        fill: p.b("filled") || undefined,
        className: ICON_COLORS[p.s("color")],
      }),
  },
  {
    slug: "avatar",
    appearance: { target: "AvatarFallback", radius: 999 },
    name: "Avatar",
    category: "Indicators",
    icon: "account_circle",
    w: 40,
    h: 40,
    props: [
      { key: "initials", label: "Initials", kind: "text", default: "TK" },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["sm", "default", "lg"] },
      { key: "image", label: "Image", kind: "image" },
      { key: "count", label: "People (a group when more than one)", kind: "number", default: 1, min: 1, max: 5, step: 1 },
    ],
    tree: (p) => {
      const size = p.s("size") === "default" ? undefined : p.s("size");
      if (p.n("count") <= 1)
        return h("Avatar", { size }, p.s("image") && h("AvatarImage", { src: p.s("image"), alt: p.s("initials") || "Avatar" }), h("AvatarFallback", null, p.s("initials")));
      return h(
        "AvatarGroup",
        null,
        ...INITIALS.slice(0, px(p.n("count"))).map((l) => h("Avatar", { size }, h("AvatarFallback", null, l))),
      );
    },
  },
  {
    slug: "carousel",
    name: "Carousel (Embla)",
    category: "Media",
    icon: "view_carousel",
    role: "fullWidth",
    /* the slides are the tree's only divs: the fill and corners land on each of them */
    appearance: { target: "div", radius: 28 },
    w: 320,
    h: 200,
    props: [
      { key: "slides", label: "Slides", kind: "list", images: true, default: SLIDES.slice(0, 5), min: 2, max: 8 },
      { key: "arrows", label: "Arrows", kind: "bool", default: true },
      { key: "orientation", label: "Orientation", kind: "enum", default: "horizontal", options: ["horizontal", "vertical"] },
      { key: "itemWidth", label: "Slide width (0: full)", kind: "number", default: 0, min: 0, max: 480, step: 4, unit: "px" },
      { key: "gap", label: "Gap", kind: "number", default: 16, min: 0, max: 32, step: 2, unit: "px" },
      { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 640, step: 4, unit: "px" },
      { key: "height", label: "Slide height", kind: "number", default: 200, min: 80, max: 400, step: 4, unit: "px" },
    ],
    slots: (p) => listSlots(p.list("slides")),
    tree: (p) => {
      const vertical = p.s("orientation") === "vertical";
      const gap = px(p.n("gap"));
      const slideW = px(p.n("itemWidth"));
      const pad = vertical ? { paddingTop: gap } : { paddingLeft: gap };
      return h(
        "Carousel",
        { orientation: vertical ? "vertical" : undefined, className: "mx-auto", style: { width: px(p.n("width")) } },
        h(
          "CarouselContent",
          { style: vertical ? { marginTop: -gap } : { marginLeft: -gap } },
          ...p.list("slides").map((s, i) =>
            h(
              "CarouselItem",
              { style: { ...pad, ...(slideW > 0 ? { flexBasis: slideW } : {}) } },
              h(
                "div",
                { className: `relative flex items-center justify-center overflow-hidden rounded-2xl text-title-large ${pictureOf(s) ? "bg-surface-container-highest" : TONES[i % 3]}`, style: { height: px(p.n("height")) }, "data-tap": `tab:${i}` },
                ...slideFace(s),
              ),
            ),
          ),
        ),
        p.b("arrows") && h("CarouselPrevious"),
        p.b("arrows") && h("CarouselNext"),
      );
    },
  },
  {
    slug: "expressive-carousel",
    name: "Expressive carousel",
    category: "Media",
    icon: "view_carousel",
    role: "fullWidth",
    appearance: { target: "CarouselSlide", radius: 28 },
    w: 420,
    h: 180,
    props: [
      { key: "variant", label: "Variant", kind: "enum", default: "multi-browse", options: ["multi-browse", "hero", "uncontained", "full-screen"] },
      {
        key: "slides",
        label: "Slides",
        kind: "list",
        images: true,
        default: SLIDES,
        min: 3,
        max: 8,
      },
      { key: "itemWidth", label: "Slide width", kind: "number", default: 186, min: 120, max: 400, step: 4, unit: "px", when: (p) => p.s("variant") !== "full-screen" },
      { key: "gap", label: "Gap", kind: "number", default: 8, min: 0, max: 24, step: 2, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 180, min: 100, max: 320, step: 4, unit: "px" },
      { key: "width", label: "Width", kind: "number", default: 420, min: 240, max: 800, step: 4, unit: "px" },
    ],
    slots: (p) => listSlots(p.list("slides")),
    tree: (p) =>
      h(
        "ExpressiveCarousel",
        { variant: p.s("variant"), itemWidth: p.s("variant") === "full-screen" ? undefined : px(p.n("itemWidth")), gap: px(p.n("gap")), height: px(p.n("height")), style: { width: px(p.n("width")) } },
        ...p.list("slides").map((s, i) => h("CarouselSlide", { className: `relative overflow-hidden text-title-large ${pictureOf(s) ? "" : TONES[i % 3]}`, "data-tap": `tab:${i}` }, ...slideFace(s))),
      ),
  },
  {
    slug: "kbd",
    appearance: { target: "Kbd", radius: 4 },
    name: "Kbd",
    category: "Indicators",
    icon: "keyboard",
    w: 80,
    h: 24,
    props: [
      { key: "keys", label: "Keys", kind: "list", default: [{ label: "Ctrl" }, { label: "K" }], min: 1, max: 4 },
      { key: "caption", label: "Caption", kind: "text", default: "" },
    ],
    tree: (p) => {
      const keys = p.list("keys");
      const shortcut = keys.length > 1 ? h("KbdGroup", null, ...keys.map((k) => h("Kbd", null, k.label))) : h("Kbd", null, keys[0]?.label ?? "");
      return p.s("caption") ? h("div", { className: "flex items-center gap-2 text-body-medium text-on-surface-variant" }, shortcut, p.s("caption")) : shortcut;
    },
  },
  {
    slug: "aspect-ratio",
    appearance: { radius: 8 },
    name: "Aspect ratio",
    category: "Layout",
    icon: "aspect_ratio",
    w: 288,
    h: 162,
    props: [
      { key: "ratio", label: "Ratio", kind: "enum", default: "16:9", options: Object.keys(RATIOS) },
      { key: "label", label: "Label", kind: "text", default: "16:9" },
      { key: "width", label: "Width", kind: "number", default: 288, min: 120, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { style: { width: px(p.n("width")) } },
        h(
          "AspectRatio",
          { ratio: Math.round((RATIOS[p.s("ratio")] ?? 16 / 9) * 10000) / 10000 },
          h("div", { className: "flex size-full items-center justify-center rounded-lg bg-tertiary-container text-title-large text-on-tertiary-container" }, p.s("label")),
        ),
      ),
  },
  {
    slug: "empty",
    name: "Empty",
    category: "Feedback",
    icon: "inbox",
    appearance: { radius: 16 },
    w: 360,
    h: 280,
    props: [
      { key: "title", label: "Title", kind: "text", default: "No messages" },
      { key: "description", label: "Description", kind: "text", default: "New messages will show up here.", multiline: true },
      { key: "icon", label: "Icon", kind: "icon", default: "inbox" },
      { key: "action", label: "Action button", kind: "text", default: "Compose" },
      { key: "bordered", label: "Dashed border", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 360, min: 200, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "Empty",
        { className: p.b("bordered") ? "border" : undefined, style: { width: px(p.n("width")) } },
        h(
          "EmptyHeader",
          null,
          p.s("icon") && h("EmptyMedia", { variant: "icon" }, ic(p.s("icon"))),
          h("EmptyTitle", null, p.s("title")),
          p.s("description") && h("EmptyDescription", null, p.s("description")),
        ),
        p.s("action") && h("EmptyContent", null, h("Button", { variant: "tonal" }, p.s("action"))),
      ),
  },
  {
    slug: "shape",
    name: "Shape",
    category: "Basics",
    icon: "interests",
    w: 96,
    h: 96,
    props: [
      { key: "name", label: "Shape", kind: "enum", default: "sunny", options: SHAPES },
      { key: "color", label: "Color", kind: "enum", default: "primary", options: Object.keys(SHAPE_COLORS) },
      { key: "width", label: "Width", kind: "number", default: 96, min: 8, max: 800, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 96, min: 8, max: 800, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h("Shape", {
        name: p.s("name"),
        className: SHAPE_COLORS[p.s("color")],
        style: { width: px(p.n("width")), height: px(p.n("height")) },
      }),
  },
];
