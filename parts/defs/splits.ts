import { atom, avatar, box, button, entry, hbox, icon, iconButton, image, line, para, round, text, vbox } from "../atoms";
import { MATERIAL_LOOK, centersTitle, type KitLook } from "../kits/types";
import type { Node } from "../templates/kit";
import type { P } from "../types";

/* What the common composites are made of, as trees of atoms: the inspector's "split into atoms"
 * replaces a part with its tree, in place, for its current words and settings. Kept apart from the
 * definitions so a composite's drawing and its split can change on their own; the registry hands
 * each tree to its part as `PartDef.atoms`. Each tree is as wide as the part, and its outermost box
 * keeps the part's look and its tap.
 *
 * A style composes some parts its own way (an iPhone's bar centers its title and says where its arrow
 * leads; its list rows close up on a rounded card): a split is handed the document's look and composes
 * the tree as the style draws the part, by the same traits a kit reads (parts/kits/types.ts), never by
 * a style's name. Left without one, it is Material's. */

const px = (p: P, key = "width") => Math.round(p.n(key));
const some = (...nodes: (Node | false | "" | undefined | null)[]): Node[] => nodes.filter((n): n is Node => !!n);

/** a hairline as a box one pixel thick, so a column stretches it; `down` stands it on end in a row */
const rule = (length: number, down = false, fill: Node["fill"] = "surfaceContainerHighest"): Node => box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: down ? 1 : length, height: down ? length : 1 }, [], { fill });

/** a title over a supporting line, taking what the row leaves */
const lines = (title: string, sub: string, style = "lead"): Node =>
  vbox({ gap: 2, hugWidth: false, width: 160 }, some(para(title, style, { maxLines: 1 }), sub && para(sub, "body", { color: "muted", maxLines: 1 })), { grow: true });

/** one side of a bar whose title is centered: as wide as the other side */
const side = (justify: string, kids: Node[]): Node => hbox({ justify, gap: 0, hugWidth: false, width: 80 }, kids, { grow: true });

/** The bar of a search as the part draws it: 56 tall, what leads in the middle of a 48 square, the entry taking the
 *  rest, what trails in another; `sm` is a 44 bar with 40 squares */
const searchBar = (p: P, sm = false): Node =>
  hbox(
    { padLeft: sm ? 12 : 16, padRight: sm ? 4 : 8, padY: 0, gap: sm ? 12 : 16, hugWidth: false, width: px(p), hugHeight: false, height: sm ? 44 : 56 },
    some(p.s("leading") && icon(p.s("leading")), entry(p.s("placeholder")), p.s("trailing") && iconButton(p.s("trailing"), p.s("trailing"), { variant: "ghost" })),
  );

/** the paint of a search: raised on the high container, or outlined on the surface */
const searchSurface = (p: P) => (p.s("style") === "outlined" ? { surface: "chip" } : { surface: "field" });
const searchLook = (p: P): Pick<Node, "look"> => (p.s("style") === "outlined" ? {} : { look: { elevation: 3 } });

/** an app bar's title and the line under it, the room it is given less the 12 the heading keeps on each side (16 with nothing before it) */
const barTitle = (p: P, lead: boolean): Node =>
  vbox({ gap: 0, padLeft: lead ? 12 : 16, padRight: 12, hugWidth: false, width: 160 }, some(para(p.s("title"), "title", { maxLines: 1 }), p.s("subtitle") && para(p.s("subtitle"), "label", { color: "muted", maxLines: 1 })), { grow: true });

/** the arrows that lead back, which an iPhone's bar names with where they go */
const BACK = ["arrow_back", "arrow_back_ios", "arrow_back_ios_new", "chevron_left"];

/** the hairline between two rows a style groups, from where the rows' words start; named so their taps can tell it from a row */
const DIVIDER: NonNullable<Node["name"]> = { en: "Divider", zh: "分隔线", ja: "区切り線", ko: "구분선" };
const between = (width: number, from: number): Node =>
  hbox({ gap: 0, padX: 0, padY: 0, hugWidth: false, width }, [...(from ? [box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: from, height: 1 }, [])] : []), { ...rule(Math.max(1, width - from)), grow: true }], { name: DIVIDER });

/** Rows of a list as the style sets them (its `list` recipe): closed up on a rounded card with lines from the words (an
 *  iPhone's), on a card from edge to edge (WeChat's cells), closed up with lines across (desktop software), each on a
 *  plate of its own (the games), or as they come (Material). */
function listOf(rows: Node[], look: KitLook, width: number, lineFrom: number): Node {
  const column = { width, hugWidth: false, padX: 0, padY: 0, gap: 0 };
  const parted = (from: number) => rows.flatMap((r, i) => (i ? [between(width, from), r] : [r]));
  if (look.list === "inset") return vbox(column, parted(lineFrom), { fill: "surfaceContainerLow", corners: round(12) });
  if (look.list === "flush") return vbox(column, parted(16), { fill: "surfaceContainerLow" });
  if (look.list === "hairline") return vbox(column, parted(0));
  if (look.list === "tile") return vbox({ ...column, gap: 6 }, rows.map((r) => ({ ...r, fill: "surfaceContainer" as const, corners: round(8) })));
  return vbox(column, rows);
}

/** how far in and how far from its top and foot a row of a list the style sets stands: rows are 44 on an iPhone's card,
 *  56 in WeChat's cells, 40 under desktop hairlines; `two` when the row has a supporting line */
function rowPad(look: KitLook, two: boolean, pad: number): { padX: number; padY: number } {
  if (look.list === "inset") return { padX: 16, padY: two ? 6 : 10 };
  if (look.list === "flush") return { padX: 16, padY: two ? 6 : 16 };
  if (look.list === "hairline") return { padX: 8, padY: two ? 4 : 8 };
  if (look.list === "tile") return { padX: 12, padY: pad };
  return { padX: 0, padY: pad };
}

/** the chevron a row that leads somewhere ends in, where the style shows it (the part carries it hidden) */
const rowChevron = (look: KitLook): Node | null => (look.row === "chevron" ? icon("chevron_right", { size: 20, color: "muted" }) : look.row === "arrow" ? icon("chevron_right", { size: 16, color: "muted" }) : null);

/** An iPhone's alert or a WeChat dialog, as the style draws a dialog part: a small card, its words centered, its buttons
 *  the halves of a foot under a hairline (one over another when they are stacked). */
function alertOf(look: KitLook, title: string, words: string, buttons: string[], stacked: boolean, glyph?: string): Node {
  const weui = look.dialog === "weui";
  const w = weui ? 320 : 280;
  const half = (label: string) => button(label, { variant: "text" }, { grow: !stacked });
  const foot = stacked
    ? vbox({ width: w, hugWidth: false, padX: 0, padY: 0, gap: 0 }, buttons.flatMap((b, i) => [...(i ? [rule(w)] : []), hbox({ justify: "center", hugWidth: false, width: w, padX: 0, padY: 2 }, [half(b)])]))
    : hbox({ width: w, hugWidth: false, padX: 0, padY: 2, gap: 0 }, buttons.flatMap((b, i) => [...(i ? [rule(40, true)] : []), half(b)]));
  return vbox({ surface: "overlay", width: w, hugWidth: false, padX: 0, padTop: weui ? 24 : 20, padBottom: 0, gap: 0 }, [
    vbox(
      { padX: 16, padTop: 0, padBottom: weui ? 24 : 20, gap: weui ? 8 : 6, align: "center", hugWidth: false, width: w },
      some(glyph && icon(glyph, { color: "secondary" }), para(title, "heading", { align: "center", bold: true, width: w - 32 }), words && para(words, weui ? "body" : "caption", { color: "muted", align: "center", width: w - 32 })),
    ),
    ...(buttons.length ? [rule(w), foot] : []),
  ], { corners: round(weui ? 12 : 14) });
}

/** a dialog the style draws as an alert: an iPhone's or WeChat's */
const asAlert = (look: KitLook) => look.dialog === "alert" || look.dialog === "weui";

/** an app bar is the screen's own surface until something scrolls under it; then it is the container, raised */
const barSurface = (p: P) => (p.b("scrolled") ? { surface: "bar" } : { surface: "none" });
const barLook = (p: P): Pick<Node, "look"> => (p.b("scrolled") ? { look: { elevation: 2 } } : {});

export const SPLITS: Record<string, (p: P, look?: KitLook) => Node> = {
  search: (p) => {
    if (p.s("kind") === "bar") {
      const bar = searchBar(p);
      return { ...bar, props: { ...bar.props, ...searchSurface(p) }, corners: round(28), ...searchLook(p) };
    }
    /* a view: the bar over the suggestions, in one surface; each suggestion a 56 row */
    const sm = p.s("size") === "sm";
    return vbox(
      { ...searchSurface(p), width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 },
      [
        searchBar(p, sm),
        line({ length: px(p) }),
        ...p.list("results").map((r) => hbox({ padX: 16, padY: 0, gap: 16, hugWidth: false, width: px(p), hugHeight: false, height: 56 }, some(r.icon && icon(r.icon, { color: "muted" }), para(r.label, "lead", { maxLines: 1 }, { grow: true })))),
      ],
      { corners: round(28), ...searchLook(p) },
    );
  },

  "app-bar": (p, look = MATERIAL_LOOK) => {
    const leading = p.s("leading");
    /* an iPhone's bar draws its buttons in the accent color, and its arrow back says where it leads */
    const ios = look.appbar === "ios";
    const ink = { textColor: ios ? ("primary" as const) : ("onSurfaceVariant" as const) };
    const lead = leading && (ios && BACK.includes(leading) ? button(p.say("Back"), { variant: "text", size: "sm", icon: leading }) : iconButton(leading, p.say("Navigate"), {}, ios ? ink : {}));
    const actions = some(p.s("trailing") && iconButton(p.s("trailing"), p.say("More"), {}, ink), p.s("trailing2") && iconButton(p.s("trailing2"), "Action", {}, ink));
    const size = p.s("size");
    /* the row of icons is 64 tall, 4 in from each end and 4 between; 44 where the style builds its bars an iPhone's way
       or sets the title large under them, 48 in desktop software */
    const rowH = look.appbar === "ios" || look.appbar === "large" ? 44 : look.appbar === "compact" ? 48 : 64;
    const row = { width: px(p), hugWidth: false, height: rowH, hugHeight: false, padX: 4, padY: 0, gap: 4 };
    if (size === "medium" || size === "large") {
      /* under the row, the title stands on the foot of a block of its own height, 16 in and 12 up */
      const block = size === "large" ? (p.s("subtitle") ? 88 : 56) : p.s("subtitle") ? 72 : 48;
      return vbox({ ...barSurface(p), width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
        hbox({ ...row, justify: "between" }, [hbox({ gap: 0 }, some(lead)), hbox({ gap: 0 }, actions)]),
        vbox({ padX: 16, padTop: 0, padBottom: 12, gap: 0, justify: "end", hugWidth: false, width: px(p), hugHeight: false, height: block }, some(para(p.s("title"), size === "large" ? "display" : "headline", { maxLines: 1 }), p.s("subtitle") && para(p.s("subtitle"), size === "large" ? "subtitle" : "label", { color: "muted", maxLines: 1 }))),
      ], barLook(p));
    }
    /* a style that sets the title large keeps the row for the buttons and puts the title under it */
    if (look.appbar === "large")
      return vbox({ ...barSurface(p), width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
        hbox({ ...row, justify: "between" }, [hbox({ gap: 0 }, some(lead)), hbox({ gap: 0 }, actions)]),
        vbox({ padX: 16, padTop: 0, padBottom: 8, gap: 0, hugWidth: false, width: px(p) }, some(para(p.s("title"), "headline", { maxLines: 1 }), p.s("subtitle") && para(p.s("subtitle"), "label", { color: "muted", maxLines: 1 }))),
      ], barLook(p));
    /* a style that centers the title sets it smaller and bolder than Material's centered bar does */
    const styled = centersTitle(look);
    if (p.b("centered") || styled)
      return hbox({ ...barSurface(p), ...row }, [side("start", some(lead)), vbox({ gap: 0, align: "center", padX: 8 }, some(text(p.s("title"), styled ? "heading" : "title", styled ? { bold: true } : {}), p.s("subtitle") && text(p.s("subtitle"), "caption", { color: "muted" }))), side("end", actions)], barLook(p));
    return hbox({ ...barSurface(p), ...row }, [...some(lead), barTitle(p, !!lead), ...actions], barLook(p));
  },

  item: (p, look = MATERIAL_LOOK) => {
    const trailing = p.s("trailing");
    const end =
      trailing === "icon" && p.s("trailingIcon")
        ? iconButton(p.s("trailingIcon"), p.say("Open"), { variant: "text" })
        : trailing === "switch"
          ? atom("switch", { label: "", checked: p.b("checked") })
          : trailing === "checkbox"
            ? atom("checkbox", { label: "", checked: p.b("checked") })
            : trailing === "radio"
              ? atom("radio", { label: "", checked: p.b("checked") })
              : trailing === "slider"
                ? atom("slider", { width: 128 })
                : trailing === "text" && p.s("trailingText")
                  ? text(p.s("trailingText"), "body", { color: "muted" })
                  : null;
    const disc = p.s("iconFill") !== "none";
    const pad = p.s("size") === "xs" || p.s("size") === "sm" ? 8 : 10;
    /* a plain row keeps to the screen's margins, as the part's own does; one with a surface keeps its words off its edge.
       A plain list is the one a style sets its own way, and a row that leads somewhere ends in its chevron there */
    const flush = p.s("variant") === "default";
    const set = flush ? rowPad(look, !!p.s("description"), pad) : { padX: 16, padY: pad };
    const chevron = (trailing === "none" || trailing === "text") && rowChevron(look);
    const rows = p.list("items").map((it) =>
      hbox(
        { surface: p.s("variant") === "outline" ? "chip" : p.s("variant") === "muted" ? "panel" : "none", ...set, gap: 12 },
        some(it.icon && (disc ? box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 8, padY: 8 }, [icon(it.icon)], { corners: round(20) }) : icon(it.icon, { color: "muted" })), lines(it.label, p.s("description")), end, chevron),
      ),
    );
    /* the lines between grouped rows start where an icon's row has its words */
    if (flush) return listOf(rows, look, px(p), 52);
    return vbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 4 }, rows);
  },

  card: (p) => {
    const pos = p.s("imagePos");
    const align = p.s("textAlign");
    const aligned = align === "start" ? {} : { align };
    /* the card's spacing, by its density: around its body, between its parts, and in from its sides */
    const space = p.s("size") === "sm" ? 12 : p.s("size") === "lg" ? 24 : 16;
    const extent = px(p, "imageSize");
    const width = px(p);
    const beside = pos === "leading" || pos === "trailing";
    const room = beside ? width - extent - space * 3 : width - space * 2;
    const words = vbox({ gap: 4, align: "stretch", padX: space, hugWidth: false, width: room + space * 2 }, some(para(p.s("title"), "title", aligned), p.s("description") && para(p.s("description"), "body", { color: "muted", ...aligned })));
    const action = p.s("action") && hbox({ gap: 8, padX: space, justify: align === "center" ? "center" : align === "end" ? "end" : "start" }, [button(p.s("action"), { variant: "text", size: "sm" })]);
    /* the media runs to the card's edges; with no picture of its own it is the part's gradient with its icon */
    const media = (w: number | undefined, h: number): Node =>
      p.s("image")
        ? image({ src: p.s("image"), height: h, radius: 0, ...(w ? { width: w } : {}) })
        : box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: w ?? width, height: h }, [icon(p.s("imageIcon") || "image", { size: 34 })], {
            fill: "primaryContainer",
            textColor: "onPrimaryContainer",
            look: { fills: [{ type: "linear", angle: 135, stops: [{ color: "primary-container", at: 0 }, { color: "tertiary-container", at: 100 }] }] },
          });
    const surface = p.s("variant") === "outlined" ? "chip" : p.s("variant") === "elevated" ? "card" : "panel";
    /* a filled card is the highest container, as the part paints it */
    const paint = p.s("variant") === "filled" ? { fill: "surfaceContainerHighest" as const } : {};
    if (beside) {
      /* the media stands the card's height beside the body: as tall as the words and the action come to */
      const lines = (words: string, perLine: number) => Math.max(1, Math.ceil(words.length / Math.max(1, perLine)));
      const tall = space * 2 + lines(p.s("title"), room / 11) * 28 + (p.s("description") ? 4 + lines(p.s("description"), room / 7.5) * 20 : 0) + (p.s("action") ? space + 40 : 0);
      const body = vbox({ padX: 0, padY: space, gap: space, hugWidth: false, width: room + space * 2 }, some(words, action), { grow: true });
      return hbox({ surface, width, hugWidth: false, padX: 0, padY: 0, gap: space, align: "start" }, pos === "leading" ? [media(extent, tall), body] : [body, media(extent, tall)], paint);
    }
    /* the media on top or at the foot takes the card's spacing on that side */
    return vbox({ surface, width, hugWidth: false, padX: 0, padTop: pos === "top" ? 0 : space, padBottom: pos === "bottom" ? 0 : space, gap: space }, some(pos === "top" && media(undefined, extent), words, action, pos === "bottom" && media(undefined, extent)), paint);
  },

  alert: (p) => {
    const tone = p.s("variant");
    return hbox(
      { surface: "panel", width: px(p), hugWidth: false, padX: 16, padY: 16, gap: 12, align: "start" },
      some(p.s("icon") && icon(p.s("icon"), { color: tone === "destructive" ? "error" : tone === "tertiary" ? "tertiary" : "primary" }), vbox({ gap: 4, hugWidth: false, width: 160 }, some(p.s("title") && para(p.s("title"), "subtitle"), p.s("description") && para(p.s("description"), "body", { color: "muted" })), { grow: true })),
      tone === "info" ? { fill: "secondaryContainer" } : tone === "tertiary" ? { fill: "tertiaryContainer" } : {},
    );
  },

  banner: (p) =>
    vbox({ surface: "panel", width: px(p), hugWidth: false, padX: 12, padY: 12, gap: 8 }, [
      hbox({ gap: 12, align: "start" }, some(p.s("icon") && box({ surface: "button", layout: "row", align: "center", justify: "center", padX: 10, padY: 10 }, [icon(p.s("icon"), { size: 20, color: "on-primary" })], { fill: "primaryContainer", corners: round(20) }), para(p.s("text"), "body", {}, { grow: true }), p.b("closable") && iconButton("close", p.say("Close"), { variant: "ghost", size: "sm" }))),
      ...some((p.s("action") || p.s("secondary")) && hbox({ justify: "end", gap: 8 }, some(p.s("secondary") && button(p.s("secondary"), { variant: "text", size: "xs" }), p.s("action") && button(p.s("action"), { variant: "tonal", size: "xs" })))),
    ]),

  "notice-bar": (p) =>
    hbox(
      { surface: "panel", width: px(p), hugWidth: false, padX: 12, padY: 8, gap: 8 },
      some(p.s("icon") && icon(p.s("icon"), { size: 20 }), para(p.list("items")[0]?.label ?? "", "body", { maxLines: 1 }, { grow: true }), p.b("closable") && iconButton("close", p.say("Close"), { variant: "ghost", size: "xs" })),
      { fill: "tertiaryContainer" },
    ),

  "section-header": (p) => hbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 8 }, some(lines(p.s("title"), p.s("subtitle"), "heading"), p.s("action") && button(p.s("action"), { variant: "text", size: "xs", trailingIcon: "chevron_right" }))),

  "stat-card": (p) =>
    vbox({ surface: "panel", width: px(p), hugWidth: false, padX: 16, padY: 16, gap: 4 }, [
      text(p.s("title"), "label", { color: "muted" }),
      text(p.s("value"), "headline"),
      text(p.s("trend"), "caption", { color: p.s("direction") === "up" ? "primary" : p.s("direction") === "down" ? "error" : "muted" }),
    ]),

  "asset-pill": (p) => hbox({ surface: "chip", padX: 12, padY: 6, gap: 4 }, some(p.s("icon") && icon(p.s("icon"), { size: 16 }), text(p.s("value"), "label")), { fill: "surfaceContainerHigh", corners: round(16) }),

  "chat-composer": (p) =>
    hbox(
      { surface: "bar", width: px(p), hugWidth: false, padX: 8, padY: 8, gap: 4 },
      some(
        p.b("attach") && iconButton("add_circle", "Attach", { variant: "ghost", size: "sm" }),
        hbox({ surface: "field", padX: 16, padY: 8, gap: 8, hugWidth: false, width: 160 }, [entry(p.s("placeholder"))], { grow: true, corners: round(20) }),
        p.b("emoji") && iconButton("sentiment_satisfied", "Emoji", { variant: "ghost", size: "sm" }),
        iconButton("send", p.say("Send"), { variant: "filled", size: "sm" }),
      ),
    ),

  empty: (p) =>
    vbox(
      { surface: p.b("bordered") ? "chip" : "none", width: px(p), hugWidth: false, padX: 24, padY: 32, gap: 12, align: "center" },
      some(
        p.s("icon") && box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 12, padY: 12 }, [icon(p.s("icon"), { size: 32, color: "muted" })], { corners: round(28) }),
        text(p.s("title"), "heading", { align: "center" }),
        p.s("description") && para(p.s("description"), "body", { color: "muted", align: "center", width: Math.max(40, px(p) - 48) }),
        p.s("action") && button(p.s("action"), { variant: "tonal" }),
      ),
    ),

  /* ---------- bars and navigation ---------- */

  "navigation-bar": (p) => {
    const items = p.list("items");
    const on = Math.round(p.n("selected"));
    const side = p.s("layout") === "horizontal";
    const badgeAt = Math.round(p.n("badgeOn")) - 1;
    const badge = (i: number) => (p.n("badge") > 0 && i === badgeAt ? [atom("badge", { kind: "label", label: String(Math.round(p.n("badge"))), variant: "destructive" })] : []);
    const pill = (it: { label: string; icon?: string }, i: number): Node =>
      side
        ? hbox({ padX: 16, padY: 8, gap: 4 }, [icon(it.icon || "circle", { filled: i === on, color: i === on ? "default" : "muted" }), text(it.label, "caption", { bold: i === on, color: i === on ? "default" : "muted" }), ...badge(i)], i === on ? { fill: "secondaryContainer", corners: round(20) } : {})
        : box({ layout: "row", align: "center", justify: "center", gap: 2, padX: 0, padY: 0, width: 56, height: 32, hugWidth: false, hugHeight: false }, [icon(it.icon || "circle", { filled: i === on, color: i === on ? "default" : "muted" }), ...badge(i)], i === on ? { fill: "secondaryContainer", corners: round(16) } : {});
    return hbox(
      { surface: "bar", width: px(p), hugWidth: false, padX: 0, padY: p.b("tall") ? 12 : 6, gap: 0, align: "start" },
      items.map((it, i) => (side ? hbox({ justify: "center", hugWidth: false, width: 80 }, [pill(it, i)], { grow: true }) : vbox({ align: "center", gap: 4, hugWidth: false, width: 80 }, [pill(it, i), text(it.label, "caption", { bold: i === on, color: i === on ? "default" : "muted" })], { grow: true }))),
      p.b("elevated") ? { look: { elevation: 2 } } : {},
    );
  },

  tabs: (p) => {
    const items = p.list("items");
    const on = Math.min(Math.round(p.n("selected")), items.length - 1);
    const variant = p.s("variant");
    if (variant === "segmented")
      return hbox(
        { width: px(p), hugWidth: false, padX: 2, padY: 2, gap: 0 },
        items.map((it, i) => hbox({ justify: "center", padX: 8, padY: 8, gap: 6, hugWidth: false, width: 80 }, some(it.icon && icon(it.icon, { size: 18 }), text(it.label, "label", { bold: i === on })), { grow: true, ...(i === on ? { fill: "surface" as const, corners: round(18), look: { elevation: 1 as const } } : {}) })),
        { fill: "surfaceContainerHigh", corners: round(20) },
      );
    const primary = variant === "primary";
    return vbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 }, [
      hbox(
        { gap: 0, align: "start" },
        items.map((it, i) =>
          vbox({ align: primary ? "center" : "stretch", gap: 0, hugWidth: false, width: 80 }, [
            hbox({ justify: "center", padX: 8, padY: 12, gap: 8 }, some(it.icon && icon(it.icon, { size: 20, color: i === on && primary ? "primary" : i === on ? "default" : "muted" }), text(it.label, "label", { color: i === on && primary ? "primary" : i === on ? "default" : "muted" }))),
            box({ layout: "row", padX: 0, padY: 0, width: primary ? 48 : 8, height: primary ? 3 : 2, hugWidth: false, hugHeight: false }, [], i === on ? { fill: "primary", corners: primary ? { tl: 3, tr: 3, br: 0, bl: 0 } : undefined } : {}),
          ], { grow: true }),
        ),
      ),
      rule(px(p)),
    ]);
  },

  toolbar: (p) => {
    const buttons = p.list("items").map((it, i) => iconButton(it.icon || "circle", it.label, p.b("toggles") && i === 0 ? { variant: "tonal" } : {}));
    if (p.s("kind") === "docked") return hbox({ surface: "bar", width: px(p), hugWidth: false, padX: 16, padY: 12, justify: "between" }, buttons);
    const vibrant = p.s("color") === "vibrant";
    const props = { surface: "overlay", padX: 8, padY: 8, gap: 4 };
    const extra = { corners: round(28), ...(vibrant ? { fill: "primaryContainer" as const } : {}) };
    return p.s("orientation") === "vertical" ? vbox({ ...props, align: "center" }, buttons, extra) : hbox(props, buttons, extra);
  },

  breadcrumb: (p) => {
    const trail = p.list("items");
    const last = trail.length - 1;
    const collapsed = p.b("collapse") && trail.length > 3;
    const sep = () => (p.s("separator") === "slash" ? text("/", "body", { color: "muted" }) : icon("chevron_right", { size: 16, color: "muted" }));
    const kids: Node[] = [];
    trail.forEach((it, i) => {
      if (collapsed && i > 0 && i < last - 1) return;
      if (kids.length) kids.push(sep());
      kids.push(text(it.label, "body", { color: i === last ? "default" : "muted" }));
      if (collapsed && i === 0) kids.push(sep(), icon("more_horiz", { size: 16, color: "muted" }));
    });
    return hbox({ gap: 6, padX: 0, padY: 2 }, kids);
  },

  steps: (p) => {
    const at = Math.round(p.n("current"));
    return hbox(
      { width: px(p), hugWidth: false, gap: 8 },
      p.list("items").map((s, i) =>
        hbox({ gap: 8, hugWidth: false, width: 80 }, [box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 24, height: 24, hugWidth: false, hugHeight: false }, [text(String(i + 1), "caption", { bold: true, color: i <= at ? "on-primary" : "muted" })], { fill: i <= at ? "primary" : "surfaceContainerHighest", corners: round(12) }), para(s.label, "label", { maxLines: 1, color: i === at ? "default" : "muted" }, { grow: true })], { grow: true }),
      ),
    );
  },

  "title-bar": (p) => {
    const controls = p.s("controls");
    const dots = hbox({ gap: 8 }, [atom("dot", { color: "outline", size: 12 }), atom("dot", { color: "outline", size: 12 }), atom("dot", { color: "outline", size: 12 })]);
    const caption = hbox({ gap: 12 }, [icon("remove", { size: 16, color: "muted" }), icon("crop_square", { size: 16, color: "muted" }), icon("close", { size: 16, color: "muted" })]);
    return hbox(
      { surface: "bar", width: px(p), hugWidth: false, height: 36, hugHeight: false, padX: 12, padY: 0, gap: 12 },
      some(controls === "mac" && dots, para(p.s("title"), "label", { maxLines: 1, align: controls === "mac" ? "center" : "start" }, { grow: true }), controls === "windows" && caption),
    );
  },

  "status-bar": (p) =>
    hbox(
      { surface: "bar", width: px(p), hugWidth: false, height: 28, hugHeight: false, padX: 12, padY: 0, gap: 8 },
      some(p.s("icon") && icon(p.s("icon"), { size: 16, color: "muted" }), para(p.s("text"), "caption", { color: "muted", maxLines: 1 }, { grow: true }), p.s("trailing") && text(p.s("trailing"), "caption", { color: "muted" })),
    ),

  /* ---------- overlays and feedback ---------- */

  dialog: (p, look = MATERIAL_LOOK) => {
    if (p.s("style") !== "fullscreen" && asAlert(look)) return alertOf(look, p.s("title"), p.s("description"), [p.s("dismiss"), p.s("confirm")].filter(Boolean), p.b("stacked"), p.s("icon") || undefined);
    if (p.s("style") === "fullscreen")
      return vbox({ surface: "sheet", width: px(p), hugWidth: false, height: px(p, "height"), hugHeight: false, padX: 0, padY: 0, gap: 0 }, [
        hbox({ padX: 12, padY: 8, gap: 8 }, some(iconButton("close", p.say("Close")), para(p.s("title"), "heading", { maxLines: 1 }, { grow: true }), p.s("confirm") && button(p.s("confirm"), { variant: "text" }))),
        rule(px(p)),
        vbox({ padX: 24, padY: 16, gap: 8 }, some(p.s("description") && para(p.s("description"), "body", { color: "muted" }))),
      ]);
    /* left as it comes, the card is the screen's width less its margins, at most 448 */
    const w = p.n("dialogWidth") === 412 ? DIALOG_W : Math.min(560, px(p, "dialogWidth"));
    const actions = some(p.s("dismiss") && button(p.s("dismiss"), { variant: "text" }), p.s("confirm") && button(p.s("confirm"), { variant: "text" }));
    return vbox({ surface: "overlay", width: w, hugWidth: false, padX: 24, padY: 24, gap: 16 }, [
      ...some(p.s("icon") && hbox({ justify: "center" }, [icon(p.s("icon"), { color: "secondary" })])),
      vbox({ gap: 16 }, some(para(p.s("title"), "headline", p.s("icon") ? { align: "center" } : {}), p.s("description") && para(p.s("description"), "body", { color: "muted" }))),
      ...(actions.length ? [p.b("stacked") ? vbox({ gap: 8, align: "end", padY: 0 }, actions.reverse()) : hbox({ justify: "end", gap: 8 }, actions)] : []),
    ], { corners: round(28) });
  },

  "alert-dialog": (p, look = MATERIAL_LOOK) => {
    if (asAlert(look)) return alertOf(look, p.s("title"), p.s("description"), [p.s("cancel"), p.s("action")].filter(Boolean), false, p.s("icon") || undefined);
    const small = p.s("size") === "sm";
    const center = small || !!p.s("icon");
    const w = small ? 320 : DIALOG_W;
    const buttons = some(p.s("cancel") && button(p.s("cancel"), { variant: "text" }, small ? { grow: true } : {}), p.s("action") && button(p.s("action"), { variant: "filled" }, small ? { grow: true } : {}));
    return vbox({ surface: "overlay", width: w, hugWidth: false, padX: 24, padY: 24, gap: 16 }, [
      vbox({ gap: 16, align: center ? "center" : "stretch" }, some(p.s("icon") && icon(p.s("icon"), { color: "secondary" }), para(p.s("title"), "headline", { align: center ? "center" : "start", width: w - 48 }), p.s("description") && para(p.s("description"), "body", { color: "muted", align: center ? "center" : "start", width: w - 48 }))),
      ...(buttons.length ? [hbox({ justify: small ? "start" : "end", gap: 8, padY: 0 }, buttons)] : []),
    ], { corners: round(28) });
  },

  "action-sheet": (p) =>
    vbox({ width: px(p), hugWidth: false, gap: 8 }, [
      vbox(
        { padX: 0, padY: 0, gap: 0 },
        [vbox({ padX: 12, padY: 12, gap: 2, align: "center" }, some(text(p.s("title"), "label"), p.s("message") && text(p.s("message"), "caption", { color: "muted" }))), ...p.list("actions").flatMap((a) => [rule(px(p)), hbox({ justify: "center", padX: 16, padY: 10 }, [text(a.label, "label", { color: "primary" })])])],
        { fill: "surfaceContainerHigh", corners: round(16) },
      ),
      ...some(p.s("cancel") && button(p.s("cancel"), { variant: "tonal" })),
    ]),

  sonner: (p) =>
    hbox(
      { surface: "overlay", width: 344, hugWidth: false, padX: 16, padY: 6, gap: 8 },
      some(para(p.s("message"), "body", { color: "inverse", maxLines: 2 }, { grow: true }), p.s("action") && button(p.s("action"), { variant: "text", size: "xs" }), p.b("closeButton") && iconButton("close", p.say("Close"), { size: "xs" }, { textColor: "inverseOnSurface" })),
      { fill: "inverseSurface", corners: round(4) },
    ),

  /* ---------- lists of things ---------- */

  "settings-group": (p) =>
    listPanel(px(p), [
      ...some(p.s("title") && hbox({ padX: 8, padY: 4 }, [text(p.s("title"), "label", { color: "muted" })])),
      ...p.table("data").rows.map(([glyph = "", label = "", control = "arrow", value = ""]) =>
        hbox(
          { padX: 8, padY: 4, gap: 12, height: 48, hugHeight: false },
          some(
            glyph && icon(glyph),
            para(label, "lead", { maxLines: 1 }, { grow: true }),
            control === "switch" && atom("switch", { label: "", checked: value === "on" }),
            control === "check" && value === "on" && icon("check", { color: "primary" }),
            (control === "arrow" || control === "value") && value && text(value, "body", { color: "muted" }),
            control === "arrow" && icon("chevron_right", { color: "muted" }),
          ),
        ),
      ),
    ], 8, 0),

  "notification-list": (p) => {
    const unread = Math.round(p.n("unread"));
    return listPanel(
      px(p),
      [
        ...some(
          (p.s("title") || p.s("markAll")) &&
            hbox({ padX: 0, padY: 0, gap: 8, height: 40, hugHeight: false }, [hbox({ padX: 8, gap: 8 }, some(text(p.s("title"), "heading"), unread > 0 && atom("badge", { kind: "label", label: String(Math.min(unread, p.table("data").rows.length)), variant: "destructive" }))), spacer(), ...some(p.s("markAll") && button(p.s("markAll"), { variant: "text", size: "xs" }))]),
        ),
        ...p.table("data").rows.map(([title = "", body = "", time = "", glyph = ""], i) =>
          hbox(
            { padX: 8, padY: 8, gap: 12, align: "start" },
            some(
              box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 40, height: 40, hugWidth: false, hugHeight: false }, [icon(glyph || "notifications", { size: 20 })], { fill: "secondaryContainer", corners: round(20) }),
              vbox({ gap: 0, hugWidth: false, width: 160 }, some(hbox({ gap: 8 }, [para(title, "lead", { maxLines: 1, bold: i < unread }, { grow: true }), text(time, "tiny", { color: "muted" })]), body && para(body, "caption", { color: "muted", maxLines: 2 })), { grow: true }),
              i < unread && hbox({ padY: 8, padX: 0 }, [atom("dot", { color: "primary", size: 8 })]),
            ),
            i < unread ? { fill: "surfaceContainerHigh", corners: round(12) } : {},
          ),
        ),
      ],
      4,
    );
  },

  "conversation-list": (p) => {
    const on = Math.round(p.n("selected"));
    return listPanel(
      px(p),
      p.table("data").rows.map(([name = "", last = "", time = "", count = ""], i) => {
        const unread = Math.round(amount(count));
        return hbox(
          { padX: 8, padY: 8, gap: 12 },
          [
            avatar(initialsOf(name)),
            vbox({ gap: 0, hugWidth: false, width: 160 }, [para(name, "lead", { maxLines: 1, bold: unread > 0 }), para(last, "caption", { color: "muted", maxLines: 1 })], { grow: true }),
            vbox({ gap: 4, align: "end" }, some(text(time, "tiny", { color: "muted" }), unread > 0 && atom("badge", { kind: "label", label: String(unread) }))),
          ],
          i === on ? { fill: "secondaryContainer", corners: round(12) } : {},
        );
      }),
    );
  },

  "contact-list": (p) => {
    const grouped = p.b("grouped");
    const people = p.table("data").rows.map(([name = "", note = ""]) => ({ name, note }));
    const ordered = grouped ? [...people].sort((a, b) => a.name.localeCompare(b.name)) : people;
    const trailing = p.s("trailing");
    const end = trailing === "call" ? iconButton("call", "call", { size: "sm" }) : trailing === "message" ? iconButton("chat", "message", { size: "sm" }) : trailing === "follow" && p.s("action") ? button(p.s("action"), { variant: "filled", size: "xs" }) : null;
    const kids: Node[] = some(p.s("search") && hbox({ padX: 4, padY: 4 }, [atom("input", { placeholder: p.s("search"), type: "search", variant: "outlined", size: "sm" }, { grow: true })]));
    ordered.forEach((c, k) => {
      const letter = initialsOf(c.name).slice(0, 1);
      if (grouped && (k === 0 || initialsOf(ordered[k - 1].name).slice(0, 1) !== letter)) kids.push(hbox({ padX: 8, padY: 4 }, [text(letter, "caption", { color: "muted" })]));
      kids.push(hbox({ padX: 8, padY: 8, gap: 12 }, some(avatar(initialsOf(c.name)), vbox({ gap: 0, hugWidth: false, width: 160 }, some(para(c.name, "lead", { maxLines: 1 }), c.note && para(c.note, "caption", { color: "muted", maxLines: 1 })), { grow: true }), end && { ...end })));
    });
    return listPanel(px(p), kids);
  },

  "comment-list": (p) =>
    listPanel(
      px(p),
      [
        ...p.table("data").rows.map(([name = "", time = "", words = "", likes = ""]) =>
          hbox({ gap: 12, align: "start" }, [
            avatar(initialsOf(name), { size: "sm" }),
            vbox({ gap: 2, hugWidth: false, width: 160 }, [
              hbox({ gap: 8 }, [text(name, "subtitle"), text(time, "tiny", { color: "muted" })]),
              para(words, "body"),
              hbox({ gap: 4 }, some(hbox({ padX: 0, padY: 4, gap: 4 }, [icon("favorite", { size: 20 }), text(String(Math.round(amount(likes))), "caption")]), p.s("reply") && button(p.s("reply"), { variant: "text", size: "xs" }))),
            ], { grow: true }),
          ]),
        ),
        hbox({ gap: 4 }, [atom("input", { placeholder: p.s("placeholder"), variant: "outlined", size: "sm" }, { grow: true }), iconButton("send", p.say("Send"), { size: "sm" })]),
      ],
      16,
      12,
    ),

  "transaction-list": (p) => {
    const filters = p.list("filters");
    return listPanel(
      px(p),
      [
        ...some(filters.length > 0 && hbox({ padX: 4, padY: 4, gap: 8, wrap: true }, filters.map((f, i) => atom("chip", { items: [{ label: f.label }], kind: "filter", selected: i === 0 ? 0 : -1 })))),
        ...p.table("data").rows.map(([name = "", detail = "", sum = ""]) => {
          const income = amount(sum) > 0;
          return hbox({ padX: 8, padY: 8, gap: 12 }, [
            box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 40, height: 40, hugWidth: false, hugHeight: false }, [icon(income ? "south_west" : "north_east", { size: 20, color: income ? "default" : "muted" })], { fill: income ? "primaryContainer" : "surfaceContainerHigh", corners: round(20) }),
            vbox({ gap: 0, hugWidth: false, width: 160 }, some(para(name, "lead", { maxLines: 1 }), detail && para(detail, "caption", { color: "muted", maxLines: 1 })), { grow: true }),
            text(sum, "subtitle", { color: income ? "primary" : "default" }),
          ]);
        }),
      ],
      8,
      4,
    );
  },

  leaderboard: (p) => {
    const on = Math.round(p.n("selected"));
    const podium: Node["fill"][] = ["primary", "secondaryContainer", "tertiaryContainer"];
    return listPanel(px(p), [
      ...some(p.s("title") && hbox({ padX: 8, padY: 4 }, [text(p.s("title"), "heading")])),
      ...p.table("data").rows.map(([name = "", score = "", change = ""], i) => {
        const moved = amount(change);
        return hbox(
          { padX: 8, padY: 8, gap: 12 },
          some(
            box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 28, height: 28, hugWidth: false, hugHeight: false }, [text(String(i + 1), "label", { color: i === 0 ? "on-primary" : "default" })], { corners: round(14), ...(podium[i] ? { fill: podium[i] } : {}) }),
            p.b("faces") && avatar(initialsOf(name), { size: "sm" }),
            para(name, "lead", { maxLines: 1 }, { grow: true }),
            moved !== 0 && icon(moved > 0 ? "arrow_upward" : "arrow_downward", { size: 16, filled: true, color: moved > 0 ? "primary" : "error" }),
            text(score, "subtitle"),
          ),
          i === on ? { fill: "secondaryContainer", corners: round(12) } : {},
        );
      }),
    ]);
  },

  "description-list": (p) => {
    const rows = p.table("data").rows;
    /* the names take the width of the longest, as the grid's auto column does */
    const nameWidth = Math.max(40, ...rows.map((r) => Math.ceil((r[0] ?? "").length * 8.2)));
    return vbox({ width: px(p), hugWidth: false, gap: 8 }, rows.map(([name = "", value = ""]) => hbox({ gap: 16, align: "start" }, [hbox({ gap: 0, hugWidth: false, width: nameWidth }, [text(name, "label", { color: "muted" })]), para(value, "body", {}, { grow: true })])));
  },

  timeline: (p) => {
    const rows = p.table("data").rows;
    const at = Math.round(p.n("current"));
    return vbox(
      { width: px(p), hugWidth: false, gap: 0 },
      rows.map(([when = "", title = "", detail = ""], i) => {
        const tall = 16 + 24 + (detail ? 16 : 0);
        return hbox({ gap: 12, align: "start" }, [
          vbox({ gap: 0, align: "center", padY: 4 }, some(atom("dot", { color: i <= at ? "primary" : "outline", size: 12 }), i < rows.length - 1 && box({ layout: "row", padX: 0, padY: 0, width: 2, height: tall, hugWidth: false, hugHeight: false }, [], { fill: i < at ? "primary" : "surfaceContainerHighest" }))),
          vbox({ gap: 0, padY: 0, hugWidth: false, width: 160 }, some(text(when, "tiny", { color: "muted" }), para(title, "lead"), detail && para(detail, "caption", { color: "muted" }), i < rows.length - 1 && spacer(16)), { grow: true }),
        ]);
      }),
    );
  },

  /* ---------- commerce ---------- */

  "product-card": (p) => {
    const across = p.s("layout") === "horizontal";
    const body = vbox({ padX: 12, padY: 12, gap: 4, hugWidth: false, width: 120 }, [
      ...some(p.s("badge") && hbox({ gap: 0 }, [atom("badge", { kind: "label", label: p.s("badge"), variant: "destructive" })])),
      para(p.s("title"), "subtitle", { maxLines: 2 }),
      ...some(p.s("subtitle") && para(p.s("subtitle"), "caption", { color: "muted", maxLines: 1 })),
      ...some(p.n("rating") > 0 && hbox({ gap: 2 }, [icon("star", { size: 16, filled: true, color: "tertiary" }), text(p.n("rating").toFixed(1), "caption")])),
      hbox({ gap: 4 }, some(text(p.s("price"), "heading", { color: "primary" }), p.s("original") && text(p.s("original"), "caption", { color: "muted" }, { look: { text: { decoration: "line-through" } } }), spacer(), iconButton("favorite", "Favorite", { size: "sm", iconFill: p.b("liked") }))),
      ...some(p.s("action") && button(p.s("action"), { variant: "filled", size: "xs" })),
    ], across ? { grow: true } : {});
    return across
      ? hbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0, align: "start" }, [image({ src: p.s("image"), width: 112, height: 160, radius: 0 }), body], { fill: "surfaceContainerLow", corners: round(16) })
      : vbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 }, [image({ src: p.s("image"), height: px(p), radius: 0 }), body], { fill: "surfaceContainerLow", corners: round(16) });
  },

  "price-tag": (p) => {
    const [whole, cents] = p.s("amount").split(".");
    const big = { small: "heading", medium: "headline", large: "display" }[p.s("size")] ?? "headline";
    return hbox(
      { gap: 4, align: "end", wrap: true },
      some(
        hbox({ gap: 0, align: "end" }, some(text(p.s("currency"), "label", { color: "primary" }), text(whole ?? "", big, { color: "primary" }), cents !== undefined && text(`.${cents}`, "subtitle", { color: "primary" }))),
        p.s("original") && text(p.s("original"), "caption", { color: "muted" }, { look: { text: { decoration: "line-through" } } }),
        p.s("discount") && atom("badge", { kind: "label", label: p.s("discount"), variant: "destructive" }),
      ),
    );
  },

  coupon: (p) =>
    hbox(
      { width: px(p), hugWidth: false, height: 96, hugHeight: false, padX: 0, padY: 0, gap: 0, align: "stretch" },
      [
        vbox({ width: 104, hugWidth: false, padX: 8, padY: 8, gap: 2, align: "center", justify: "center" }, some(text(p.s("amount"), "headline"), p.s("condition") && text(p.s("condition"), "tiny", { color: "muted" }))),
        rule(96, true, "primary"),
        hbox({ padX: 12, padY: 12, gap: 8, hugWidth: false, width: 120 }, some(vbox({ gap: 0, hugWidth: false, width: 100 }, some(para(p.s("title"), "subtitle", { maxLines: 2 }), p.s("expiry") && para(p.s("expiry"), "caption", { color: "muted", maxLines: 1 })), { grow: true }), p.s("action") && button(p.s("action"), { variant: "filled", size: "xs" })), { grow: true }),
      ],
      { fill: "primaryContainer", corners: round(12) },
    ),

  "checkout-bar": (p) =>
    hbox(
      { surface: "bar", width: px(p), hugWidth: false, padX: 12, padY: 8, gap: 8 },
      [
        ...p.list("icons").map((it) => vbox({ gap: 2, align: "center", hugWidth: false, width: 48 }, some(it.icon && icon(it.icon, { size: 20 }), text(it.label, "tiny")))),
        spacer(),
        vbox({ gap: 0, align: "end" }, some(hbox({ gap: 4, align: "end" }, some(p.s("label") && text(p.s("label"), "caption", { color: "muted" }), text(p.s("amount"), "title", { color: "primary" }))), p.s("note") && text(p.s("note"), "tiny", { color: "muted" }))),
        ...some(p.s("action") && button(p.s("action"), { variant: "filled", size: "sm" })),
      ],
    ),

  "balance-card": (p) =>
    vbox(
      { surface: "panel", width: px(p), hugWidth: false, padX: 16, padY: 16, gap: 12 },
      [
        hbox({ gap: 4 }, [text(p.s("title"), "label"), iconButton(p.b("hidden") ? "visibility_off" : "visibility", p.b("hidden") ? "Show" : "Hide", { size: "xs" })]),
        hbox({ gap: 8, align: "end", wrap: true }, some(text(p.b("hidden") ? "••••••" : p.s("amount"), "display"), p.s("change") && text(p.b("hidden") ? "••" : p.s("change"), "label"))),
        ...some(p.list("actions").length > 0 && hbox({ gap: 4 }, p.list("actions").map((a) => vbox({ gap: 4, align: "center", padY: 8, hugWidth: false, width: 60 }, some(box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 40, height: 40, hugWidth: false, hugHeight: false }, some(a.icon && icon(a.icon, { size: 20 })), { fill: "surface", corners: round(20) }), text(a.label, "caption")), { grow: true })))),
      ],
      { fill: "primaryContainer", corners: round(16) },
    ),

  "route-card": (p) =>
    listPanel(
      px(p),
      [
        hbox({ gap: 12, align: "start" }, [
          /* the times stand at the ends of the column of places, the dots and the line between them as tall */
          vbox({ gap: 0, hugWidth: false, width: 48, justify: "between", height: 80, hugHeight: false }, [text(p.s("fromTime"), "subtitle"), text(p.s("toTime"), "subtitle")]),
          vbox({ gap: 4, align: "center", padY: 6 }, [box({ layout: "row", padX: 0, padY: 0, width: 10, height: 10, hugWidth: false, hugHeight: false }, [], { corners: round(5), look: { stroke: { width: 2, color: "primary" } } }), box({ layout: "row", padX: 0, padY: 0, width: 2, height: 40, hugWidth: false, hugHeight: false }, [], { fill: "surfaceContainerHighest" }), atom("dot", { color: "primary", size: 10 })]),
          vbox({ gap: 8, hugWidth: false, width: 160 }, some(para(p.s("from"), "lead", { maxLines: 1 }), p.s("duration") && hbox({ gap: 4 }, some(p.s("icon") && icon(p.s("icon"), { size: 16, color: "muted" }), text(p.s("duration"), "caption", { color: "muted" }))), para(p.s("to"), "lead", { maxLines: 1 })), { grow: true }),
        ]),
        hbox({ gap: 8 }, some(vbox({ gap: 0, hugWidth: false, width: 160 }, some(p.s("price") && text(p.s("price"), "heading", { color: "primary" }), p.s("note") && para(p.s("note"), "caption", { color: "muted", maxLines: 1 })), { grow: true }), p.s("action") && button(p.s("action"), { variant: "filled", size: "sm" }))),
      ],
      16,
      12,
    ),

  subscription: (p) =>
    listPanel(
      px(p),
      [
        text(p.s("title"), "title"),
        ...some(p.s("description") && para(p.s("description"), "body", { color: "muted" })),
        ...p.list("plans").map((plan) => hbox({ surface: "chip", padX: 12, padY: 12 }, [para(plan.label, "lead", {}, { grow: true })], { corners: round(12) })),
        ...some(p.s("action") && button(p.s("action"), { variant: "filled" })),
      ],
      16,
      8,
    ),

  "review-summary": (p) => {
    const values = p.s("values").split(",").map((v) => amount(v));
    const most = Math.max(1, ...values);
    const stars = Math.round(Number(p.s("score")) || 0);
    return listPanel(
      px(p),
      [
        hbox({ gap: 16 }, [
          vbox({ gap: 0, align: "center" }, [text(p.s("score"), "display"), hbox({ gap: 0 }, Array.from({ length: 5 }, (_, i) => icon("star", { size: 16, color: i < stars ? "tertiary" : "outline" }))), text(p.s("count"), "tiny", { color: "muted" })]),
          vbox({ gap: 4, hugWidth: false, width: 160 }, values.map((v, i) => hbox({ gap: 8 }, [text(String(values.length - i), "tiny", { color: "muted" }), atom("progress", { value: Math.round((v / most) * 100), thickness: 8 }, { grow: true })])), { grow: true }),
        ]),
        ...some(p.list("tags").length > 0 && hbox({ gap: 8, wrap: true }, p.list("tags").map((t) => hbox({ surface: "chip", padX: 12, padY: 4 }, [text(t.label, "label", { color: "muted" })], { corners: round(8) })))),
        ...some(p.s("action") && button(p.s("action"), { variant: "tonal" })),
      ],
      16,
      12,
    );
  },

  /* ---------- people ---------- */

  "profile-header": (p) =>
    vbox(
      { width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 },
      [
        ...some(p.b("showCover") && image({ src: p.s("cover"), height: 112, radius: 0 })),
        vbox({ padX: 16, padY: 16, gap: 12 }, [
          hbox({ justify: "between", align: "end", gap: 12 }, some(avatar(initialsOf(p.s("name")), { size: "lg", ...(p.s("avatar") ? { image: p.s("avatar") } : {}) }), p.s("action") && button(p.b("following") ? p.s("done") || p.s("action") : p.s("action"), { variant: p.b("following") ? "tonal" : "filled", size: "xs" }))),
          vbox({ gap: 0 }, some(para(p.s("name"), "title"), p.s("bio") && para(p.s("bio"), "body", { color: "muted" }))),
          ...some(
            p.list("stats").length > 0 &&
              hbox({ gap: 4 }, p.list("stats").map((s) => {
                const gap = s.label.indexOf(" ");
                return vbox({ gap: 0, align: "center", padY: 4, hugWidth: false, width: 60 }, some(text(gap > 0 ? s.label.slice(0, gap) : s.label, "heading"), gap > 0 && text(s.label.slice(gap + 1), "tiny", { color: "muted" })), { grow: true });
              })),
          ),
        ]),
      ],
      { fill: "surfaceContainerLow", corners: round(16) },
    ),

  "post-card": (p) => {
    const tally = (glyph: string, count: number) => hbox({ padX: 8, padY: 4, gap: 4 }, [icon(glyph, { size: 20 }), text(String(Math.round(count)), "caption")]);
    return listPanel(
      px(p),
      [
        hbox({ gap: 12 }, [avatar(initialsOf(p.s("author"))), vbox({ gap: 0 }, some(text(p.s("author"), "subtitle"), p.s("time") && text(p.s("time"), "caption", { color: "muted" })))]),
        ...some(p.s("text") && para(p.s("text"), "body")),
        ...some(p.b("showImage") && image({ src: p.s("image"), height: 176 })),
        hbox({ gap: 4 }, [tally("favorite", p.n("likes")), tally("chat_bubble", p.n("comments")), tally("share", p.n("shares")), spacer(), iconButton("bookmark", "Save", { size: "sm" })]),
      ],
      16,
      12,
    );
  },

  /* ---------- AI and chat ---------- */

  message: (p) => {
    const end = p.s("align") === "end";
    const content = vbox({ gap: 4, align: end ? "end" : "start" }, some(p.s("header") && text(p.s("header"), "caption", { color: "muted" }), bubbleOf(p.s("text"), p.s("variant"), Math.max(80, px(p) - 48)), p.s("footer") && text(p.s("footer"), "caption", { color: "muted" })));
    const face = p.s("avatar") && avatar(p.s("avatar"), { size: "sm" });
    return hbox({ width: px(p), hugWidth: false, gap: 8, align: "end", justify: end ? "end" : "start" }, end ? some(content, face) : some(face, content));
  },

  bubble: (p) => {
    const end = p.s("align") === "end";
    return vbox({ width: px(p), hugWidth: false, gap: 4, align: end ? "end" : "start" }, some(bubbleOf(p.s("text"), p.s("variant"), px(p)), p.s("reaction") && hbox({ padX: 6, padY: 2 }, [text(p.s("reaction"), "body")], { fill: "surfaceContainerHighest", corners: round(12) })));
  },

  attachment: (p) => {
    const size = p.s("size");
    const pad = size === "xs" ? 4 : size === "sm" ? 6 : 8;
    const tall = p.s("orientation") === "vertical";
    const media = box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: size === "default" ? 40 : 32, height: size === "default" ? 40 : 32, hugWidth: false, hugHeight: false }, [p.s("state") === "uploading" || p.s("state") === "processing" ? atom("circular-progress", { value: 60, size: 24, thickness: 3 }) : icon(p.s("state") === "error" ? "error" : p.s("icon") || "description", { size: 20, color: p.s("state") === "error" ? "error" : "default" })], { fill: "surfaceContainerHigh", corners: round(8) });
    const words = vbox({ gap: 0, align: tall ? "center" : "start" }, some(text(p.s("title"), size === "default" ? "body" : "caption"), p.s("description") && text(p.s("description"), "caption", { color: "muted" })));
    const kids = some(media, words, p.b("remove") && iconButton("close", p.say("Remove"), { size: "xs" }));
    return tall ? vbox({ surface: "chip", padX: pad, padY: pad, gap: 8, align: "center" }, kids, { corners: round(16) }) : hbox({ surface: "chip", padX: pad, padY: pad, gap: 8 }, kids, { corners: round(28) });
  },

  /* ---------- game ---------- */

  "task-row": (p) => hbox({ width: px(p), hugWidth: false, padX: 12, padY: 12, gap: 12 }, [para(p.s("title"), "body", { maxLines: 1 }, { grow: true }), button(p.s("action"), { variant: "filled", size: "xs" })], { fill: "surfaceContainerLow", corners: round(16) }),

  "item-cell": (p) => {
    const size = Math.round(p.n("size"));
    return vbox({ gap: 2, align: "center", width: size, hugWidth: false }, [
      box({ surface: "chip", layout: "column", align: "center", justify: "center", gap: 0, padX: 0, padY: 0, width: size, height: size, hugWidth: false, hugHeight: false }, some(p.s("rarity") && atom("badge", { kind: "label", label: p.s("rarity"), variant: "default" }), p.s("icon") && icon(p.s("icon"), { size: 28 }), p.s("count") && text(p.s("count"), "tiny"), p.s("badge") && atom("badge", { kind: "label", label: p.s("badge"), variant: "destructive" })), { fill: "surfaceContainerHigh", corners: round(8) }),
      ...some(p.s("name") && para(p.s("name"), "tiny", { color: "muted", align: "center", maxLines: 1, width: size })),
    ]);
  },

  "reward-track": (p) => {
    const rows = p.table("data").rows.map((r) => ({ at: Number(r[0]) || 0, label: r[1] ?? "", glyph: r[2] ?? "" }));
    const value = Math.round(p.n("value"));
    const share = Math.min(100, Math.max(0, (value / Math.max(1, p.n("max"))) * 100));
    return vbox({ width: px(p), hugWidth: false, gap: 8 }, [
      hbox({ gap: 8, align: "start" }, rows.map((r) => {
        const ready = value >= r.at;
        return vbox({ gap: 2, align: "center", padX: 8, padY: 8, hugWidth: false, width: 60 }, some(r.glyph && icon(r.glyph, { size: 20 }), text(r.label, "tiny", { color: ready ? "default" : "muted" }), ready && p.s("action") && text(p.s("action"), "tiny")), { grow: true, fill: ready ? "primaryContainer" : "surfaceContainer", corners: round(8) });
      })),
      atom("progress", { value: Math.round(share), thickness: 6 }),
      hbox({ gap: 0 }, rows.map((r) => hbox({ justify: "center", hugWidth: false, width: 40 }, [text(String(r.at), "tiny", { color: "muted" })], { grow: true }))),
    ]);
  },

  "check-in": (p) => {
    const signed = Math.round(p.n("signed"));
    const days = Math.round(p.n("days"));
    const cell = Math.max(24, Math.floor((px(p) - 24 - 24) / 7));
    return listPanel(
      px(p),
      [
        ...some(p.s("title") && text(p.s("title"), "subtitle")),
        box(
          { layout: "grid", columns: 7, gap: 4, padX: 0, padY: 0, align: "stretch" },
          Array.from({ length: days }, (_, i) =>
            box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: cell, height: cell, hugWidth: false, hugHeight: false }, [i < signed ? icon("check", { size: 16, color: "on-primary" }) : text(String(i + 1), "tiny", { color: i === signed ? "primary" : "muted" })], {
              corners: round(cell / 2),
              ...(i < signed ? { fill: "primary" as const } : i === signed ? { look: { stroke: { width: 2, color: "primary" } } } : {}),
            }),
          ),
        ),
      ],
      12,
      8,
    );
  },

  "stat-bar": (p) => {
    const share = Math.min(1, Math.max(0, p.n("value") / Math.max(1, p.n("max"))));
    const numbers = `${Math.round(p.n("value"))}/${Math.round(p.n("max"))}`;
    /* the fill is its share of the track; the track is what the row leaves, worked out from what stands beside it */
    const track = Math.max(24, px(p) - (p.s("icon") ? 28 : 0) - (p.s("label") ? p.s("label").length * 8 + 8 : 0) - (p.b("numbers") ? numbers.length * 6.5 + 8 : 0));
    const paint = { error: "error", primary: "primary", secondary: "secondary", tertiary: "tertiary" }[p.s("color")] ?? "primary";
    return hbox({ width: px(p), hugWidth: false, gap: 8 }, some(
      p.s("icon") && icon(p.s("icon"), { size: 20 }),
      p.s("label") && text(p.s("label"), "caption", { bold: true }),
      hbox({ padX: 0, padY: 0, gap: 0, height: 12, hugHeight: false, hugWidth: false, width: Math.round(track) }, [box({ layout: "row", padX: 0, padY: 0, width: Math.max(4, Math.round(track * share)), height: 12, hugWidth: false, hugHeight: false }, [], { fill: "primary", corners: round(6), look: { fills: [{ type: "solid", color: paint }] } })], { grow: true, fill: "surfaceContainerHighest", corners: round(6) }),
      p.b("numbers") && text(numbers, "tiny"),
    ));
  },

  "character-card": (p) => {
    const stats = p.table("data").rows;
    return vbox(
      { width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 },
      [
        vbox({ width: px(p), hugWidth: false, height: 160, hugHeight: false, padX: 8, padY: 8, gap: 0, align: "stretch", justify: "between" }, [
          hbox({ justify: "between" }, some(p.s("rarity") ? atom("badge", { kind: "label", label: p.s("rarity"), variant: "tertiary" }) : spacer(8), p.s("level") && hbox({ padX: 8, padY: 2 }, [text(p.s("level"), "caption", { bold: true, color: "inverse" })], { fill: "inverseSurface", corners: round(6) }))),
          hbox({ justify: "center" }, [icon(p.s("icon") || "person", { size: 56 })]),
          spacer(8),
        ], { fill: "primaryContainer", look: { fills: [{ type: "linear", angle: 135, stops: [{ color: "primary-container", at: 0 }, { color: "tertiary-container", at: 100 }] }] } }),
        vbox({ padX: 12, padY: 12, gap: 8 }, [
          vbox({ gap: 0 }, some(text(p.s("name"), "title"), p.s("role") && text(p.s("role"), "caption", { color: "muted" }))),
          ...stats.map(([stat = "", value = "", max = ""]) => hbox({ gap: 8 }, [hbox({ gap: 0, hugWidth: false, width: 48 }, [text(stat, "caption")]), atom("progress", { value: Math.round(Math.min(100, (amount(value) / Math.max(1, amount(max))) * 100)), thickness: 8 }, { grow: true }), hbox({ gap: 0, hugWidth: false, width: 32, justify: "end" }, [text(value, "tiny")])])),
          ...some(p.s("action") && button(p.s("action"), { variant: "filled" })),
        ]),
      ],
      { fill: "surfaceContainerLow", corners: round(16) },
    );
  },

  "game-result": (p) =>
    vbox(
      { width: px(p), hugWidth: false, padX: 20, padY: 20, gap: 12, align: "center" },
      [
        text(p.s("title"), "headline", { align: "center" }),
        hbox({ gap: 4 }, [0, 1, 2].map((i) => icon("star", { size: 40, filled: true, color: "tertiary" }, i < p.n("stars") ? {} : { look: { opacity: 25 } }))),
        vbox({ gap: 0, align: "center" }, [text(p.s("scoreLabel"), "caption", { color: "muted" }), text(p.s("score"), "display")]),
        ...some(p.list("rewards").length > 0 && hbox({ gap: 8, justify: "center", wrap: true }, p.list("rewards").map((r) => vbox({ gap: 2, align: "center", padX: 8, padY: 8 }, some(r.icon && icon(r.icon), text(r.label, "caption")), { fill: "surfaceContainerLow", corners: round(8) })))),
        hbox({ gap: 8, hugWidth: false, width: px(p) - 40 }, some(p.s("retry") && button(p.s("retry"), { variant: "tonal" }, { grow: true }), p.s("next") && button(p.s("next"), { variant: "filled" }, { grow: true }))),
      ],
      { fill: "surfaceContainerHigh", corners: round(24) },
    ),

  "dialogue-box": (p) => {
    const lines = p.list("lines");
    const last = lines.length <= 1;
    return vbox(
      { surface: "chip", width: px(p), hugWidth: false, padX: 12, padY: 12, gap: 8 },
      [
        hbox({ gap: 8 }, [box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 40, height: 40, hugWidth: false, hugHeight: false }, [p.s("image") ? image({ src: p.s("image"), width: 40, height: 40, radius: 20 }) : icon(p.s("icon") || "person")], { fill: "primaryContainer", corners: round(20) }), para(p.s("speaker"), "subtitle", { color: "primary", maxLines: 1 }, { grow: true })]),
        vbox({ padX: 4, padY: 4, gap: 0, height: 64, hugHeight: false }, [para(lines[0]?.label ?? "", "lead")]),
        ...(last && p.list("choices").length ? [vbox({ gap: 4 }, p.list("choices").map((c) => button(c.label, { variant: "tonal" })))] : some(p.s("next") && hbox({ justify: "end", gap: 4 }, [text(p.s("next"), "tiny", { color: "muted" }), icon("keyboard_arrow_down", { size: 16, color: "muted" })]))),
      ],
      { fill: "surfaceContainerHigh", corners: round(16) },
    );
  },
};

/* ---------- where a split's taps and variables go ---------- */

/** What becomes of the taps on a composite's slots and the variables its props follow, where the shape of its tree
 *  says it better than the atoms' words do: for a slot, the atom a tap on it lands on now (a row of a list, a tab, a
 *  button); for a prop, the atom that shows it and the prop it shows it under. Each is handed the tree `SPLITS` made
 *  from the same props. What is left out here goes to the one button that says the slot's words or shows its icon,
 *  and a variable to the one atom showing the prop's words (`lib/kits.ts`); what finds no atom is not kept. */
export type SplitTaps = {
  slots?: (p: P, tree: Node) => Record<string, Node | undefined>;
  binds?: (p: P, tree: Node) => Record<string, [Node, string] | undefined>;
};

/** a tree's nodes, each before what it holds: the order its groups come in */
export const nodesOf = (n: Node): Node[] => [n, ...(n.kids ?? []).flatMap(nodesOf)];
const firstOf = (n: Node, slug: string) => nodesOf(n).find((x) => x.slug === slug);
/** rows as the slots of a list: `tab:0`, `tab:1`… */
const tabs = (rows: (Node | undefined)[] | undefined) => Object.fromEntries((rows ?? []).map((r, i) => [`tab:${i}`, r]));
/** the rows of a list panel, after the head rows it puts above them */
const rowsAfter = (t: Node, head: unknown) => (t.kids ?? []).slice(head ? 1 : 0);
const entryOf = (t: Node, key: string): [Node, string] | undefined => {
  const e = firstOf(t, "input");
  return e ? [e, key] : undefined;
};

export const SPLIT_TAPS: Record<string, SplitTaps> = {
  search: {
    /* the trailing icon is the bar's one button; a view's suggestions come after the bar and its rule */
    slots: (p, t) => ({ ...(p.s("trailing") ? { icon: firstOf(t, "icon-button") } : {}), ...(p.s("kind") === "view" ? tabs((t.kids ?? []).slice(2)) : {}) }),
    /* what is typed, and what stands there before, are the entry's */
    binds: (_p, t) => ({ value: entryOf(t, "value"), placeholder: entryOf(t, "placeholder") }),
  },
  "app-bar": {
    /* its buttons, in order: what leads (an iPhone's says where it goes), then what trails */
    slots: (p, t) => {
      const buttons = nodesOf(t).filter((x) => x.slug === "icon-button" || x.slug === "button");
      const keys = [p.s("leading") && "icon", p.s("trailing") && "icon2", p.s("trailing2") && "icon3"].filter((k): k is string => !!k);
      return Object.fromEntries(keys.map((k, i) => [k, buttons[i]]));
    },
  },
  item: {
    /* the rows, past the hairlines a style parts them with */
    slots: (_p, t) => tabs(t.kids?.filter((k) => k.name !== DIVIDER)),
    /* every row shows the one tick: it follows a variable only where one row shows it */
    binds: (_p, t) => {
      const marks = nodesOf(t).filter((x) => x.slug === "switch" || x.slug === "checkbox" || x.slug === "radio");
      return { checked: marks.length === 1 ? [marks[0], "checked"] : undefined };
    },
  },
  "navigation-bar": { slots: (_p, t) => tabs(t.kids) },
  tabs: { slots: (p, t) => tabs(p.s("variant") === "segmented" ? t.kids : t.kids?.[0]?.kids) },
  toolbar: { slots: (_p, t) => tabs(t.kids) },
  /* only the first notice is split out */
  "notice-bar": { slots: (_p, t) => ({ "tab:0": firstOf(t, "text") }) },
  "checkout-bar": { slots: (p, t) => tabs((t.kids ?? []).slice(0, p.list("icons").length)) },
  "balance-card": { slots: (p, t) => tabs(p.list("actions").length ? t.kids?.[2]?.kids : []) },
  "profile-header": {
    slots: (p, t) => {
      const body = t.kids?.[p.b("showCover") ? 1 : 0];
      return { ...(p.s("action") ? { action: firstOf(t, "button") } : {}), ...tabs(p.list("stats").length ? body?.kids?.[2]?.kids : []) };
    },
  },
  "post-card": {
    slots: (_p, t) => {
      const tallies = t.kids?.[(t.kids?.length ?? 1) - 1]?.kids;
      return { author: t.kids?.[0], comment: tallies?.[1], share: tallies?.[2] };
    },
  },
  "product-card": { slots: (_p, t) => ({ open: firstOf(t, "image") }) },
  "settings-group": { slots: (p, t) => tabs(rowsAfter(t, p.s("title"))) },
  "notification-list": { slots: (p, t) => tabs(rowsAfter(t, p.s("title") || p.s("markAll"))) },
  "conversation-list": { slots: (_p, t) => tabs(t.kids) },
  leaderboard: { slots: (p, t) => tabs(rowsAfter(t, p.s("title"))) },
  "transaction-list": { slots: (p, t) => tabs(rowsAfter(t, p.list("filters").length)) },
  "contact-list": {
    /* rows may be sorted under letters: each is found by the name it shows, and its call or message button with it */
    slots: (p, t) => {
      const rows = nodesOf(t).filter((x) => x.kids?.some((k) => k.slug === "avatar"));
      const out: Record<string, Node | undefined> = {};
      p.table("data").rows.forEach(([name = ""], i) => {
        const mine = rows.filter((r) => nodesOf(r).some((x) => x.props.text === name));
        if (!name || mine.length !== 1) return;
        out[`tab:${i}`] = mine[0];
        out[`act:${i}`] = mine[0].kids?.find((k) => k.slug === "icon-button");
      });
      return out;
    },
  },
};

/** a dialog's card on a phone: the screen less its margins (412 - 48), within the 448 a card may take */
const DIALOG_W = 364;

/** a panel of rows on the lowest container, as the list parts draw theirs */
function listPanel(width: number, kids: Node[], pad = 8, gap = 2): Node {
  return vbox({ surface: "panel", width, hugWidth: false, padX: pad, padY: pad, gap }, kids, { fill: "surfaceContainerLow", corners: round(16) });
}

/** empty room that takes what is left of a row, or a fixed gap in a column */
function spacer(height = 8): Node {
  return box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: 8, height }, [], { grow: true });
}

/** a number in words people write: "+3,200.00", "-86.40", "12" */
function amount(s: string): number {
  const v = Number(String(s).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

/** one or two letters that stand for a name */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toUpperCase();
  return (Array.from(words[0] ?? "?")[0] ?? "?").toUpperCase();
}

/** a chat bubble as the bubble part paints each of its variants */
function bubbleOf(words: string, variant: string, max: number): Node {
  const paint: Record<string, { fill?: Node["fill"]; color?: string; surface?: string; look?: Node["look"] }> = {
    default: { fill: "primary", color: "on-primary" },
    secondary: { fill: "secondaryContainer" },
    muted: { fill: "surfaceContainerHighest" },
    tinted: { fill: "primaryContainer" },
    outline: { fill: "surface", surface: "chip" },
    ghost: {},
    destructive: { fill: "surfaceContainerHighest", color: "error", look: { fills: [{ type: "solid", color: "error-container" }] } },
  };
  const v = paint[variant] ?? paint.default;
  const ghost = variant === "ghost";
  /* short words hug them; longer ones wrap in the room the part gives */
  const long = words.length * 7.5 > max - 28;
  return hbox({ surface: v.surface ?? "none", padX: ghost ? 0 : 14, padY: ghost ? 0 : 10, gap: 0 }, [long ? para(words, "body", { color: v.color ?? "default", width: Math.max(40, max - 28) }) : text(words, "body", { color: v.color ?? "default" })], { ...(v.fill ? { fill: v.fill } : {}), ...(ghost ? {} : { corners: round(24) }), ...(v.look ? { look: v.look } : {}) });
}
