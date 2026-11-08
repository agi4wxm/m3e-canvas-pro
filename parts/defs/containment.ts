import { h, ic, listSlots, type PNode } from "../node";
import { around, type P, type PartDef, type PropDef } from "../types";
import { iconMeaning } from "../a11y";
import { FLOW_PROPS } from "../flow";

/* An overlay that holds parts (`holds: "laidOut"`): with its auto layout on, what it shows between its title and its
 * buttons is the parts laid out in it, not a fixed description. Its body is drawn at a size it says, and its title on
 * one line, so where the body starts and ends is known as it is drawn (`flow.inset`), and the printed code nests the
 * parts in the body itself, inside the dialog that opens. Off, it draws as it always did. */
const laidOut = (p: P) => p.s("layout") !== "free";
/** a dialog's padding, the line its title takes and the gap after it, its icon's, and its buttons' row (M3E dialog) */
const DIALOG = { pad: 24, gap: 16, title: 32, icon: 24, buttons: 8 + 40 };
const dialogTop = (icon: boolean, title: boolean) => DIALOG.pad + (icon ? DIALOG.icon + DIALOG.gap : 0) + (title ? DIALOG.title + DIALOG.gap : 0);
const dialogFoot = (buttons: boolean) => DIALOG.pad + (buttons ? DIALOG.gap + DIALOG.buttons : 0);
/** an alert dialog's foot is always there, its buttons or none */
const alertFoot = (buttons: boolean) => DIALOG.pad + DIALOG.gap + 8 + (buttons ? 40 : 0);
/** the height of a laid-out dialog's card: the body is what is left inside it */
const cardHeight = (key: string, value: number): PropDef => ({ key, label: "Height", kind: "number", default: value, min: 120, max: 900, step: 4, unit: "px", axis: "height", when: laidOut });
/** a sheet's header round its title, and its footer round its buttons (M3E sheet) */
const SHEET_HEAD = 24 + 28 + 24;
const SHEET_FOOT = 1 + 16 + 40 + 16;
/** the body a laid-out overlay lays its parts out in */
const body = (height: number) => h("div", { "data-flow": "body", "data-slot": "overlay-body", className: "min-h-0 overflow-y-auto", style: { height: Math.max(0, Math.round(height)) } });

const BUTTON_VARIANTS = ["filled", "tonal", "elevated", "outlined", "text"];

/* literal class names: Tailwind only sees what is written out */
const ALIGN_ITEMS = { start: undefined, center: "items-center", end: "items-end" } as const;
const ALIGN_TEXT = { start: undefined, center: "text-center", end: "text-end" } as const;
const JUSTIFY = { start: undefined, center: "justify-center", end: "justify-end" } as const;
const SCRIM = {
  start: "bg-gradient-to-b from-black/60 via-black/15 to-transparent",
  center: "bg-black/40",
  end: "bg-gradient-to-t from-black/60 via-black/15 to-transparent",
} as const;

/** the disc a list row's icon can sit on */
const ICON_DISCS: Record<string, string> = {
  none: "",
  "primary-container": "bg-primary-container text-on-primary-container",
  "secondary-container": "bg-secondary-container text-on-secondary-container",
  "tertiary-container": "bg-tertiary-container text-on-tertiary-container",
  primary: "bg-primary text-on-primary",
  surface: "bg-surface-container-highest text-on-surface-variant",
};

/** the card's image area: a band along the top or bottom, a column down a side, or the whole
 *  background behind a scrim. The placeholder is an icon on primary-container. */
function cardTree(p: P): PNode {
  const pos = p.s("imagePos");
  const src = p.s("image");
  const bg = pos === "background";
  const side = pos === "leading" || pos === "trailing";
  const extent = Math.round(p.n("imageSize"));
  const inner = src
    ? h("img", { src, alt: p.s("alt"), className: "size-full object-cover" })
    : h("div", { className: "grid size-full place-items-center bg-gradient-to-br from-primary-container to-tertiary-container text-on-primary-container" }, ic(p.s("imageIcon") || "image", { size: 34 }));
  const media =
    pos === "none"
      ? null
      : bg
        ? h("div", { "data-slot": "card-media", className: "absolute inset-0" }, inner)
        : side
          ? h("div", { "data-slot": "card-media", className: "shrink-0 self-stretch overflow-hidden -my-(--card-spacing)", style: { width: extent } }, inner)
          : h("div", { "data-slot": "card-media", className: "w-full shrink-0 overflow-hidden", style: { height: extent } }, inner);
  /* over a photo the words need a scrim; over the placeholder they take the container's on-color */
  const ink = bg ? (src ? "text-white" : "text-on-primary-container") : undefined;
  const body = bg ? (src ? "text-white/80" : "text-on-primary-container/80") : undefined;
  const first = pos === "top" || pos === "leading" || bg;
  const textCls = ALIGN_TEXT[p.s("textAlign") as keyof typeof ALIGN_TEXT];
  const style: Record<string, number> = { width: Math.round(p.n("width")) };
  if (p.n("height") > 0) style.height = Math.round(p.n("height"));
  if (pos === "top") style.paddingTop = 0;
  if (pos === "bottom") style.paddingBottom = 0;
  /* The header measures itself as a container, so left to its content it comes out as narrow as one character: it takes
     the card's width (the rest of the row beside a picture) and its words are aligned inside it instead */
  const header = h(
    "CardHeader",
    { className: [bg && "relative", side ? "min-w-0 flex-1" : "self-stretch"].filter(Boolean).join(" ") },
    h("CardTitle", { className: [ink, textCls].filter(Boolean).join(" ") || undefined }, p.s("title")),
    p.s("description") && h("CardDescription", { className: [body, textCls].filter(Boolean).join(" ") || undefined }, p.s("description")),
  );
  const footer = p.s("action") && h("CardFooter", { className: bg ? "relative" : undefined }, h("Button", { variant: "text", size: "sm", "data-tap": "action" }, p.s("action")));
  return h(
    "Card",
    {
      variant: p.s("variant"),
      size: p.s("size") === "default" ? undefined : p.s("size"),
      interactive: p.b("interactive") || undefined,
      className:
        [
          side && "flex-row",
          ALIGN_ITEMS[p.s("textAlign") as keyof typeof ALIGN_ITEMS],
          JUSTIFY[p.s("contentAlign") as keyof typeof JUSTIFY],
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      style,
    },
    media && first && media,
    media && first && bg && src && h("div", { className: `absolute inset-0 ${SCRIM[p.s("contentAlign") as keyof typeof SCRIM]}` }),
    header,
    footer,
    media && !first && media,
  );
}

/** a line in a color of its own; the default is the separator's */
const LINE_COLORS: Record<string, string | undefined> = {
  default: undefined,
  primary: "bg-primary rounded-full",
  "primary-container": "bg-primary-container rounded-full",
  "secondary-container": "bg-secondary-container rounded-full",
  "tertiary-container": "bg-tertiary-container rounded-full",
  "surface-container": "bg-surface-container rounded-full",
  "surface-container-high": "bg-surface-container-high rounded-full",
  outline: "bg-outline rounded-full",
};

export const containment: PartDef[] = [
  {
    slug: "card",
    name: "Card",
    category: "Layout",
    icon: "credit_card",
    role: "listLike",
    appearance: { radius: 12 },
    w: 280,
    h: 120,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Card title" },
      { key: "description", label: "Description", kind: "text", default: "Supporting text for the card.", multiline: true },
      { key: "variant", label: "Variant", kind: "enum", default: "filled", options: ["filled", "elevated", "outlined"] },
      {
        key: "imagePos",
        label: "Image position",
        kind: "enum",
        default: "top",
        options: [
          { value: "none", label: "None" },
          { value: "top", label: "Top" },
          { value: "bottom", label: "Bottom" },
          { value: "leading", label: "Left" },
          { value: "trailing", label: "Right" },
          { value: "background", label: "Background" },
        ],
      },
      { key: "image", label: "Image", kind: "image", when: (p) => p.s("imagePos") !== "none" },
      /* what a screen reader says for the picture; empty, it is decoration */
      { key: "alt", label: "Alt text", labels: { ja: "代替テキスト", zh: "替代文字", ko: "대체 텍스트" }, kind: "text", default: "", when: (p) => p.s("imagePos") !== "none" && !!p.s("image") },
      { key: "imageIcon", label: "Placeholder icon", kind: "icon", default: "image", when: (p) => p.s("imagePos") !== "none" && !p.s("image") },
      { key: "imageSize", label: "Image size", kind: "number", default: 96, min: 40, max: 320, step: 4, unit: "px", when: (p) => ["top", "bottom", "leading", "trailing"].includes(p.s("imagePos")) },
      { key: "textAlign", label: "Text align", kind: "enum", default: "start", options: ["start", "center", "end"] },
      { key: "contentAlign", label: "Content align", kind: "enum", default: "start", options: ["start", "center", "end"] },
      { key: "size", label: "Density", kind: "enum", default: "default", options: ["sm", "default", "lg"] },
      { key: "interactive", label: "Interactive", kind: "bool", default: false },
      { key: "action", label: "Action button", kind: "text", default: "" },
      { key: "width", label: "Width", kind: "number", default: 280, min: 160, max: 520, step: 4, unit: "px" },
      { key: "height", label: "Height (0: auto)", kind: "number", default: 0, min: 0, max: 480, step: 4, unit: "px" },
    ],
    /* its button does something of its own; a tap anywhere else is the whole card's */
    slots: (p) => (p.s("action") ? [{ key: "action", label: p.s("action") }] : []),
    tree: (p) => cardTree(p),
  },
  {
    slug: "item",
    families: [{ prefix: "tab", label: "Every entry", labels: { ja: "すべての項目", zh: "每一项", ko: "모든 항목" } }],
    name: "List item",
    category: "Lists",
    icon: "list_alt",
    role: "listLike",
    /* the paint goes on each row, not the group they share */
    appearance: { target: "Item", radius: 16 },
    w: 280,
    h: 64,
    props: [
      { key: "items", label: "Rows", kind: "list", default: [{ label: "Inbox", icon: "inbox" }], min: 1, max: 6, icons: true },
      { key: "iconFill", label: "Icon background", labels: { ja: "アイコンの背景", zh: "图标底色", ko: "아이콘 배경" }, kind: "enum", default: "none", options: Object.keys(ICON_DISCS) },
      { key: "description", label: "Supporting text", kind: "text", default: "12 new messages" },
      { key: "variant", label: "Variant", kind: "enum", default: "default", options: ["default", "outline", "muted", "segmented"] },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm", "xs"] },
      { key: "trailing", label: "Trailing", kind: "enum", default: "none", options: ["none", "icon", "switch", "checkbox", "radio", "slider", "text"] },
      { key: "trailingIcon", label: "Trailing icon", kind: "icon", default: "chevron_right", when: (p) => p.s("trailing") === "icon" },
      { key: "checked", label: "Switch on", kind: "bool", default: false, when: (p) => ["switch", "checkbox", "radio"].includes(p.s("trailing")) },
      { key: "trailingText", label: "Trailing text", labels: { ja: "末尾のテキスト", zh: "末尾文字", ko: "끝 텍스트" }, kind: "text", default: "2.4.1", when: (p) => p.s("trailing") === "text" },
      { key: "width", label: "Width", kind: "number", default: 280, min: 160, max: 520, step: 4, unit: "px" },
    ],
    slots: (p) => listSlots(p.list("items")),
    tree: (p) => {
      const trailing = p.s("trailing");
      const color = ICON_DISCS[p.s("iconFill")];
      const disc = color ? `size-10 rounded-full group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 ${color}` : "";
      /* a control at a row's end is named by its row; an icon there by what it means */
      const end = (name: string) =>
        trailing === "switch"
          ? h("ItemActions", null, h("Switch", { defaultChecked: p.b("checked") || undefined, "aria-label": name || undefined }))
          : trailing === "checkbox"
            ? h("ItemActions", null, h("Checkbox", { defaultChecked: p.b("checked") || undefined, "aria-label": name || undefined }))
            : trailing === "radio"
              ? h("ItemActions", null, h("RadioGroup", { defaultValue: p.b("checked") ? "on" : undefined }, h("RadioGroupItem", { value: "on", "aria-label": name || undefined })))
              : trailing === "slider"
                ? h("ItemActions", { className: "w-32" }, h("Slider", { defaultValue: [50], "aria-label": name || undefined }))
                : trailing === "icon" && p.s("trailingIcon")
            ? h("ItemActions", null, h("Button", { variant: "text", size: "icon", "aria-label": iconMeaning(p, p.s("trailingIcon")) }, ic(p.s("trailingIcon"))))
            : trailing === "text" && p.s("trailingText")
              ? h("ItemActions", null, h("span", { "data-slot": "item-value", className: "text-body-medium text-on-surface-variant" }, p.s("trailingText")))
              : null;
      /* a composition hook: the chevron a row that leads somewhere ends in, hidden unless a style shows it */
      const chevron = trailing === "none" || trailing === "text" ? h("span", { "data-slot": "item-chevron", "aria-hidden": true, className: "hidden" }, ic("chevron_right")) : null;
      const row = (it: { label: string; icon?: string }, i: number) =>
        h(
          "Item",
          { variant: p.s("variant") === "default" ? undefined : p.s("variant"), size: p.s("size") === "default" ? undefined : p.s("size"), "data-flush": p.s("variant") === "default" ? true : undefined, "data-tap": `tab:${i}` },
          it.icon && h("ItemMedia", { variant: "icon", className: disc || undefined }, ic(it.icon)),
          h("ItemContent", null, h("ItemTitle", null, it.label), p.s("description") && h("ItemDescription", null, p.s("description"))),
          end(it.label),
          chevron,
        );
      const rows = p.list("items").map(row);
      return h("div", { style: { width: Math.round(p.n("width")) } }, rows.length === 1 ? rows[0] : h("ItemGroup", null, ...rows));
    },
  },
  {
    slug: "dialog",
    overlay: true,
    holds: "laidOut",
    flow: {
      inset: (p) => {
        if (!laidOut(p)) return {};
        if (p.s("style") === "fullscreen") return { t: 56 + 16, r: 24, b: 16, l: 24 };
        return { t: dialogTop(!!p.s("icon"), !!p.s("title")), r: DIALOG.pad, b: dialogFoot(!!(p.s("dismiss") || p.s("confirm"))), l: DIALOG.pad };
      },
    },
    appearance: { target: "DialogContent", radius: 28 },
    name: "Dialog",
    category: "Overlays",
    icon: "web_asset",
    role: "overlay",
    w: 360,
    h: 232,
    props: [
      { key: "style", label: "Style", kind: "enum", default: "basic", options: [{ value: "basic", label: "Basic" }, { value: "fullscreen", label: "Full-screen" }] },
      { key: "icon", label: "Icon", kind: "icon", default: "", when: (p) => p.s("style") === "basic" },
      { key: "title", label: "Title", kind: "text", default: "Reset settings?" },
      /* laid out, its parts say what it says */
      { key: "description", label: "Description", kind: "text", default: "This will reset your app preferences back to their default settings.", multiline: true, when: (p) => !laidOut(p) },
      { key: "dismiss", label: "Dismiss action", kind: "text", default: "Cancel", when: (p) => p.s("style") === "basic" },
      { key: "confirm", label: "Confirm action", kind: "text", default: "Accept" },
      { key: "stacked", label: "Stacked actions", kind: "bool", default: false, when: (p) => p.s("style") === "basic" },
      { key: "closeButton", label: "Close button", kind: "bool", default: false, when: (p) => p.s("style") === "basic" },
      /* the basic style sizes its card too, under its own key — the `axis` mark still
       *  makes it the prop the width handle pulls */
      { key: "dialogWidth", label: "Width", kind: "number", default: 412, min: 280, max: 560, step: 4, unit: "px", axis: "width", when: (p) => p.s("style") === "basic" },
      { key: "width", label: "Width", kind: "number", default: 412, min: 280, max: 1280, step: 4, unit: "px", when: (p) => p.s("style") === "fullscreen" },
      { key: "height", label: "Height", kind: "number", default: 640, min: 320, max: 900, step: 4, unit: "px", when: (p) => p.s("style") === "fullscreen" },
      { ...cardHeight("dialogHeight", 320), when: (p) => p.s("style") === "basic" && laidOut(p) },
      ...FLOW_PROPS,
    ],
    // a basic dialog is only its card: the box is a screen the card floats in, and the part
    // stands where the card lands (fit). A full-screen one fills a screen of its own size.
    open: { box: (p) => (p.s("style") === "fullscreen" ? { w: p.n("width"), h: p.n("height") } : { w: 560, h: 400 }), trigger: "hide", fit: true },
    /* a dialog's point is what its two buttons each do: "Delete?" has one answer that deletes */
    slots: (p) => [...(p.s("style") === "basic" && p.s("dismiss") ? [{ key: "dismiss", label: p.s("dismiss") }] : []), ...(p.s("confirm") ? [{ key: "confirm", label: p.s("confirm") }] : [])],
    tree: (p) => {
      const trigger = h("DialogTrigger", { render: h("Button", { variant: "tonal" }) }, p.say("Open dialog"));
      if (p.s("style") === "fullscreen") {
        return h(
          "Dialog",
          null,
          trigger,
          h(
            "DialogContent",
            { variant: "fullscreen" },
            h(
              "DialogTopBar",
              { divider: true },
              h("DialogClose", { render: h("Button", { variant: "text", size: "icon", "aria-label": p.say("Close") }) }, ic("close")),
              h("DialogTitle", null, p.s("title")),
              p.s("confirm") && h("DialogClose", { render: h("Button", { variant: "text" }), "data-tap": "confirm" }, p.s("confirm")),
            ),
            h("DialogBody", null, laidOut(p) ? body(p.n("height") - 56 - 32) : p.s("description") && h("DialogDescription", null, p.s("description"))),
          ),
        );
      }
      const icon = !!p.s("icon");
      const buttons = !!(p.s("dismiss") || p.s("confirm"));
      return h(
        "Dialog",
        null,
        trigger,
        h(
          "DialogContent",
          { showCloseButton: p.b("closeButton") ? undefined : false, style: p.n("dialogWidth") === 412 ? undefined : { width: Math.min(560, Math.round(p.n("dialogWidth"))) } },
          icon && h("DialogIcon", null, ic(p.s("icon"))),
          laidOut(p)
            ? p.s("title") && h("DialogHeader", null, h("DialogTitle", { className: "truncate" }, p.s("title")))
            : h("DialogHeader", null, h("DialogTitle", null, p.s("title")), p.s("description") && h("DialogDescription", null, p.s("description"))),
          laidOut(p) && body(p.n("dialogHeight") - dialogTop(icon, !!p.s("title")) - dialogFoot(buttons)),
          buttons &&
            h(
              "DialogFooter",
              { stacked: p.b("stacked") || undefined },
              p.s("dismiss") && h("DialogClose", { render: h("Button", { variant: "text" }), "data-tap": "dismiss" }, p.s("dismiss")),
              p.s("confirm") && h("DialogClose", { render: h("Button", { variant: "text" }), "data-tap": "confirm", "data-slot": "dialog-action" }, p.s("confirm")),
            ),
        ),
      );
    },
  },
  {
    slug: "alert-dialog",
    overlay: true,
    holds: "laidOut",
    /* its media and title stand together in its header, its buttons in its foot */
    flow: { inset: (p) => (laidOut(p) ? { t: dialogTop(!!p.s("icon"), true), r: DIALOG.pad, b: alertFoot(!!(p.s("cancel") || p.s("action"))), l: DIALOG.pad } : {}) },
    appearance: { target: "AlertDialogContent", radius: 28 },
    name: "Alert dialog",
    category: "Overlays",
    icon: "report",
    role: "overlay",
    w: 320,
    h: 200,
    props: [
      { key: "icon", label: "Icon", kind: "icon", default: "" },
      { key: "title", label: "Title", kind: "text", default: "Delete your account?" },
      { key: "description", label: "Description", kind: "text", default: "This action cannot be undone.", multiline: true, when: (p) => !laidOut(p) },
      { key: "cancel", label: "Cancel action", kind: "text", default: "Cancel" },
      { key: "action", label: "Confirm action", kind: "text", default: "Delete" },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm"] },
      cardHeight("dialogHeight", 280),
      ...FLOW_PROPS,
    ],
    open: { box: () => ({ w: 560, h: 360 }), trigger: "hide", fit: true },
    slots: (p) => [...(p.s("cancel") ? [{ key: "dismiss", label: p.s("cancel") }] : []), ...(p.s("action") ? [{ key: "confirm", label: p.s("action") }] : [])],
    tree: (p) =>
      h(
        "AlertDialog",
        null,
        h("AlertDialogTrigger", { render: h("Button", { variant: "outlined" }) }, p.say("Delete account")),
        h(
          "AlertDialogContent",
          { size: p.s("size") === "default" ? undefined : p.s("size") },
          h(
            "AlertDialogHeader",
            null,
            p.s("icon") && h("AlertDialogMedia", null, ic(p.s("icon"))),
            h("AlertDialogTitle", laidOut(p) ? { className: "truncate" } : null, p.s("title")),
            !laidOut(p) && p.s("description") && h("AlertDialogDescription", null, p.s("description")),
          ),
          laidOut(p) && body(p.n("dialogHeight") - dialogTop(!!p.s("icon"), true) - alertFoot(!!(p.s("cancel") || p.s("action")))),
          h("AlertDialogFooter", null, p.s("cancel") && h("AlertDialogCancel", { "data-tap": "dismiss" }, p.s("cancel")), p.s("action") && h("AlertDialogAction", { "data-tap": "confirm" }, p.s("action"))),
        ),
      ),
  },
  {
    slug: "sheet",
    overlay: true,
    holds: "laidOut",
    /* under its title (its padding round a line of title-large), above its footer (a hairline, its padding round a row of buttons) */
    flow: { inset: (p) => (laidOut(p) ? { t: SHEET_HEAD, b: p.b("footer") ? SHEET_FOOT : 0 } : {}) },
    name: "Sheet",
    category: "Overlays",
    icon: "side_navigation",
    role: "overlay",
    w: 300,
    h: 480,
    props: [
      { key: "side", label: "Side", kind: "enum", default: "right", options: ["right", "left", "bottom", "top"] },
      { key: "title", label: "Title", kind: "text", default: "Filters" },
      { key: "description", label: "Description", kind: "text", default: "Narrow down the results.", multiline: true, when: (p) => !laidOut(p) },
      { key: "footer", label: "Save and Cancel", kind: "bool", default: false },
      { key: "confirm", label: "Confirm button", labels: { ja: "確定ボタン", zh: "确认按钮", ko: "확인 버튼" }, kind: "text", default: "Save", when: (p) => p.b("footer") },
      { key: "dismiss", label: "Dismiss button", labels: { ja: "閉じるボタン", zh: "关闭按钮", ko: "닫기 버튼" }, kind: "text", default: "Cancel", when: (p) => p.b("footer") },
      /* a sheet down a side is as tall as its window; one from the top or the foot is as tall as it says */
      { ...cardHeight("sheetHeight", 320), when: (p) => laidOut(p) && (p.s("side") === "bottom" || p.s("side") === "top") },
      ...FLOW_PROPS,
    ],
    slots: (p) => (p.b("footer") ? [...(p.s("confirm") ? [{ key: "confirm", label: p.s("confirm") }] : []), ...(p.s("dismiss") ? [{ key: "dismiss", label: p.s("dismiss") }] : [])] : []),
    /* the look belongs to the panel inside the portal, not the root that opens it */
    appearance: { target: "SheetContent", radius: 16 },
    // the sheet docks to an edge of the screen the box stands in for; the part is the sheet itself
    open: { box: () => ({ w: 412, h: 560 }), trigger: "hide", fit: true },
    tree: (p) =>
      h(
        "Sheet",
        null,
        h("SheetTrigger", { render: h("Button", { variant: "tonal" }) }, p.say("Open sheet")),
        h(
          "SheetContent",
          { side: p.s("side") === "right" ? undefined : p.s("side") },
          laidOut(p)
            ? h("SheetHeader", null, h("SheetTitle", { className: "truncate" }, p.s("title")))
            : h("SheetHeader", null, h("SheetTitle", null, p.s("title")), p.s("description") && h("SheetDescription", null, p.s("description"))),
          laidOut(p) &&
            (p.s("side") === "bottom" || p.s("side") === "top"
              ? body(p.n("sheetHeight") - SHEET_HEAD - (p.b("footer") ? SHEET_FOOT : 0))
              : h("div", { "data-flow": "body", "data-slot": "overlay-body", className: "min-h-0 flex-1 overflow-y-auto" })),
          p.b("footer") &&
            h(
              "SheetFooter",
              null,
              p.s("confirm") && h("SheetClose", { render: h("Button", { "data-tap": "confirm" }) }, p.s("confirm")),
              p.s("dismiss") && h("SheetClose", { render: h("Button", { variant: "outlined", "data-tap": "dismiss" }) }, p.s("dismiss")),
            ),
        ),
      ),
  },
  {
    slug: "side-sheet",
    overlay: true,
    name: "Side sheet",
    category: "Overlays",
    icon: "right_panel_open",
    w: 640,
    h: 320,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Filters" },
      { key: "content", label: "Content", kind: "text", default: "Narrow the messages down by sender, date or label.", multiline: true },
      { key: "side", label: "Side", kind: "enum", default: "right", options: ["right", "left"] },
      { key: "detached", label: "Detached", kind: "bool", default: false },
      { key: "closeButton", label: "Close button", kind: "bool", default: true },
      { key: "footer", label: "Apply and Cancel", kind: "bool", default: true },
      { key: "confirm", label: "Confirm button", labels: { ja: "確定ボタン", zh: "确认按钮", ko: "확인 버튼" }, kind: "text", default: "Apply", when: (p) => p.b("footer") },
      { key: "dismiss", label: "Dismiss button", labels: { ja: "閉じるボタン", zh: "关闭按钮", ko: "닫기 버튼" }, kind: "text", default: "Cancel", when: (p) => p.b("footer") },
      { key: "width", label: "Sheet width", kind: "number", default: 360, min: 256, max: 400, step: 4, unit: "px" },
      { key: "height", label: "Frame height", kind: "number", default: 320, min: 200, max: 560, step: 8, unit: "px" },
    ],
    appearance: { target: "SideSheet", radius: 16 },
    /* the box stands in for the app window the sheet docks to; on a screen it never outgrows
     * the real one (the layout margins are 16dp on each side) */
    slots: (p) => [
      ...(p.b("closeButton") ? [{ key: "close", label: p.say("Close"), icon: "close" }] : []),
      ...(p.b("footer") && p.s("confirm") ? [{ key: "confirm", label: p.s("confirm") }] : []),
      ...(p.b("footer") && p.s("dismiss") ? [{ key: "dismiss", label: p.s("dismiss") }] : []),
    ],
    view: (p, s) => sideSheetTree(p, Math.min(Math.round(p.n("width")) + 280, s ? Math.max(200, s.w - 32) : Number.POSITIVE_INFINITY)),
    tree: (p) => sideSheetTree(p, Math.round(p.n("width")) + 280),
  },
  {
    slug: "drawer",
    overlay: true,
    name: "Drawer",
    category: "Overlays",
    icon: "vertical_align_bottom",
    role: "bottom",
    w: 412,
    h: 200,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Share" },
      { key: "description", label: "Description", kind: "text", default: "Choose where to send this.", multiline: true },
      { key: "close", label: "Close action", kind: "text", default: "Close" },
      { key: "swipeHandle", label: "Swipe handle", kind: "bool", default: true },
      { key: "inline", label: "Inline (standard sheet)", kind: "bool", default: false },
    ],
    slots: (p) => (p.s("close") ? [{ key: "close", label: p.s("close") }] : []),
    appearance: { target: "DrawerContent", radius: 28 },
    open: { box: () => ({ w: 412, h: 560 }), trigger: "hide", fit: true },
    tree: (p) =>
      h(
        "Drawer",
        { showSwipeHandle: p.b("swipeHandle") || undefined, modal: p.b("inline") ? false : undefined },
        h("DrawerTrigger", { render: h("Button", { variant: "tonal" }) }, p.say("Open drawer")),
        h(
          "DrawerContent",
          null,
          h("DrawerHeader", null, h("DrawerTitle", null, p.s("title")), p.s("description") && h("DrawerDescription", null, p.s("description"))),
          p.s("close") && h("DrawerFooter", null, h("DrawerClose", { render: h("Button", { variant: "text", "data-tap": "close" }) }, p.s("close"))),
        ),
      ),
  },
  {
    slug: "popover",
    overlay: true,
    appearance: { target: "PopoverContent", radius: 16 },
    name: "Popover",
    category: "Overlays",
    icon: "comment",
    w: 120,
    h: 40,
    props: [
      { key: "trigger", label: "Button label", kind: "text", default: "Open popover" },
      { key: "variant", label: "Button variant", kind: "enum", default: "outlined", options: BUTTON_VARIANTS },
      { key: "title", label: "Title", kind: "text", default: "Dimensions" },
      { key: "description", label: "Description", kind: "text", default: "Set the size of the layer.", multiline: true },
      { key: "side", label: "Side", kind: "enum", default: "bottom", options: ["bottom", "top", "right", "left"] },
    ],
    open: { box: (p) => around(p.s("side"), 300, 190, 120, 40) },
    tree: (p) =>
      h(
        "Popover",
        null,
        h("PopoverTrigger", { render: h("Button", { variant: p.s("variant") }) }, p.s("trigger")),
        h(
          "PopoverContent",
          { side: p.s("side") === "bottom" ? undefined : p.s("side") },
          h("PopoverHeader", null, h("PopoverTitle", null, p.s("title")), p.s("description") && h("PopoverDescription", null, p.s("description"))),
        ),
      ),
  },
  {
    slug: "hover-card",
    overlay: true,
    appearance: { target: "HoverCardContent", radius: 16 },
    name: "Hover card",
    category: "Overlays",
    icon: "ads_click",
    w: 72,
    h: 24,
    props: [
      { key: "trigger", label: "Link text", kind: "text", default: "@material" },
      { key: "avatar", label: "Avatar letter", kind: "text", default: "M" },
      { key: "title", label: "Title", kind: "text", default: "Material Design" },
      { key: "description", label: "Description", kind: "text", default: "Google's open-source design system.", multiline: true },
      { key: "side", label: "Side", kind: "enum", default: "bottom", options: ["bottom", "top", "right", "left"] },
    ],
    open: { box: (p) => around(p.s("side"), 288, 150, 90, 24) },
    tree: (p) =>
      h(
        "HoverCard",
        null,
        h("HoverCardTrigger", { render: h("a", { href: "#", className: "text-primary underline" }, p.s("trigger")) }),
        h(
          "HoverCardContent",
          { className: "flex gap-3", side: p.s("side") === "bottom" ? undefined : p.s("side") },
          p.s("avatar") && h("Avatar", null, h("AvatarFallback", null, p.s("avatar"))),
          h("div", null, h("p", { className: "text-title-small text-on-surface" }, p.s("title")), p.s("description") && h("p", { className: "text-body-small text-on-surface-variant" }, p.s("description"))),
        ),
      ),
  },
  {
    slug: "accordion",
    appearance: { target: "AccordionItem", radius: 12 },
    name: "Accordion",
    category: "Layout",
    icon: "expand_circle_down",
    w: 360,
    h: 220,
    props: [
      {
        key: "items",
        label: "Items",
        kind: "list",
        default: [{ label: "What is M3 Expressive?" }, { label: "Where do the values come from?" }, { label: "Can I use it with shadcn?" }],
        min: 1,
        max: 8,
      },
      { key: "content", label: "Panel text", kind: "text", default: "An expansion of Material 3 with richer shapes, springier motion and bolder type.", multiline: true },
      { key: "openFirst", label: "First item open", kind: "bool", default: true },
      { key: "multiple", label: "Several open at once", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 360, min: 200, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "Accordion",
        { defaultValue: p.b("openFirst") ? ["item-1"] : undefined, multiple: p.b("multiple") || undefined, style: { width: Math.round(p.n("width")) } },
        ...p.list("items").map((item, i) => h("AccordionItem", { value: `item-${i + 1}` }, h("AccordionTrigger", null, item.label), h("AccordionContent", null, p.s("content")))),
      ),
  },
  {
    slug: "collapsible",
    appearance: { radius: 12 },
    name: "Collapsible",
    category: "Layout",
    icon: "unfold_less",
    w: 256,
    h: 112,
    props: [
      { key: "trigger", label: "Button label", kind: "text", default: "Toggle details" },
      { key: "variant", label: "Button variant", kind: "enum", default: "tonal", options: BUTTON_VARIANTS },
      { key: "content", label: "Content", kind: "text", default: "Here are the details that were hidden.", multiline: true },
      { key: "open", label: "Open", kind: "bool", default: true },
      { key: "width", label: "Width", kind: "number", default: 256, min: 160, max: 520, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "Collapsible",
        { defaultOpen: p.b("open") || undefined, className: "flex flex-col gap-2", style: { width: Math.round(p.n("width")) } },
        h("CollapsibleTrigger", { render: h("Button", { variant: p.s("variant") }) }, p.s("trigger")),
        h("CollapsibleContent", { className: "rounded-md bg-surface-container p-3 text-body-medium text-on-surface" }, p.s("content")),
      ),
  },
  {
    slug: "separator",
    appearance: { radius: 0 },
    name: "Separator",
    category: "Basics",
    icon: "horizontal_rule",
    role: "listLike",
    w: 280,
    h: 1,
    props: [
      { key: "orientation", label: "Orientation", kind: "enum", default: "horizontal", options: ["horizontal", "vertical"] },
      { key: "length", label: "Length", kind: "number", default: 280, min: 8, max: 1600, step: 4, unit: "px" },
      { key: "thickness", label: "Thickness", kind: "number", default: 1, min: 1, max: 64, step: 1, unit: "px" },
      { key: "color", label: "Color", kind: "enum", default: "default", options: Object.keys(LINE_COLORS) },
    ],
    tree: (p) => {
      const vertical = p.s("orientation") === "vertical";
      const length = Math.round(p.n("length"));
      const thickness = Math.round(p.n("thickness"));
      return h("Separator", {
        orientation: vertical ? "vertical" : undefined,
        className: LINE_COLORS[p.s("color")],
        style: { ...(vertical ? { height: length } : { width: length }), ...(thickness === 1 ? {} : vertical ? { width: thickness } : { height: thickness }) },
      });
    },
  },
  {
    slug: "scroll-area",
    appearance: { radius: 6 },
    name: "Scroll area",
    category: "Layout",
    icon: "swap_vert",
    w: 256,
    h: 192,
    props: [
      { key: "scrollbars", label: "Scrollbars", kind: "enum", default: "vertical", options: ["vertical", "horizontal", "both"] },
      { key: "label", label: "Row label", kind: "text", default: "Item" },
      { key: "count", label: "Rows", kind: "number", default: 30, min: 1, max: 100, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 256, min: 120, max: 560, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 192, min: 80, max: 480, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const scrollbars = p.s("scrollbars");
      const rows = Array.from({ length: Math.round(p.n("count")) }, (_, i) => h("span", null, `${p.s("label")} ${i + 1}`));
      // literal class names: Tailwind only sees what is written out
      const inner = { vertical: "flex flex-col gap-2 p-4 text-body-medium text-on-surface", horizontal: "flex w-max gap-4 p-4 text-body-medium text-on-surface", both: "flex w-max flex-col gap-2 p-4 text-body-medium text-on-surface" }[scrollbars];
      return h(
        "ScrollArea",
        { scrollbars: scrollbars === "vertical" ? undefined : scrollbars, className: "rounded-md border border-outline-variant", style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) } },
        h("div", { className: inner }, ...rows),
      );
    },
  },
  {
    slug: "resizable",
    appearance: { radius: 8 },
    name: "Resizable",
    category: "Desktop",
    icon: "vertical_split",
    holds: true,
    w: 400,
    h: 160,
    props: [
      { key: "orientation", label: "Orientation", kind: "enum", default: "horizontal", options: ["horizontal", "vertical"] },
      { key: "first", label: "First panel", kind: "text", default: "Left" },
      { key: "second", label: "Second panel", kind: "text", default: "Right" },
      { key: "split", label: "First panel size", kind: "number", default: 40, min: 10, max: 90, step: 5, unit: "%" },
      { key: "handle", label: "Grip on the handle", kind: "bool", default: true },
      { key: "width", label: "Width", kind: "number", default: 400, min: 160, max: 2400, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 160, min: 80, max: 2400, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const split = Math.round(p.n("split"));
      /* react-resizable-panels v4 reads a bare number as pixels: the split is a share of the group, so it says "%" */
      const panel = (text: string, size: number) =>
        h("ResizablePanel", { defaultSize: `${size}%` }, h("div", { className: "flex h-full items-center justify-center text-on-surface" }, text));
      return h(
        "ResizablePanelGroup",
        {
          orientation: p.s("orientation"),
          className: "rounded-lg border border-outline-variant",
          style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) },
        },
        panel(p.s("first"), split),
        h("ResizableHandle", { withHandle: p.b("handle") || undefined }),
        panel(p.s("second"), 100 - split),
      );
    },
  },
];

/** the side sheet's demo: the sheet docked in a stand-in app window `w` wide */
const sideSheetTree = (p: P, w: number) => {
  const width = Math.round(p.n("width"));
  return h(
    "div",
    { className: "flex overflow-hidden rounded-lg border border-outline-variant", style: { width: w, height: Math.round(p.n("height")) } },
    h(
      "div",
      { className: "flex min-w-0 flex-1 flex-col items-start gap-3 p-6" },
      h("h3", { className: "text-title-medium text-on-surface" }, p.say("Inbox")),
      h("p", { className: "text-body-medium text-on-surface-variant" }, p.say("The list keeps its place; only its width changes.")),
    ),
    h(
      "SideSheet",
      { side: p.s("side") === "right" ? undefined : p.s("side"), detached: p.b("detached") || undefined, width: width === 360 ? undefined : width },
      // onClose is a handler the canvas cannot run, so the close button is a child of the header
      h("SideSheetHeader", { title: p.s("title") }, p.b("closeButton") && h("Button", { variant: "ghost", size: "icon", "aria-label": p.say("Close"), "data-tap": "close", className: "text-on-surface-variant" }, ic("close"))),
      h("SideSheetContent", null, h("p", null, p.s("content"))),
      p.b("footer") && h("SideSheetFooter", null, p.s("confirm") && h("Button", { "data-tap": "confirm" }, p.s("confirm")), p.s("dismiss") && h("Button", { variant: "outlined", "data-tap": "dismiss" }, p.s("dismiss"))),
    ),
  );
};
