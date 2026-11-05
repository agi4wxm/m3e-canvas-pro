import { atom, box, button, entry, hbox, icon, iconButton, image, line, para, round, text, vbox } from "../atoms";
import type { Node } from "../templates/kit";
import type { P } from "../types";

/* What the common composites are made of, as trees of atoms: the inspector's "split into atoms"
 * replaces a part with its tree, in place, for its current words and settings. Kept apart from the
 * definitions so a composite's drawing and its split can change on their own; the registry hands
 * each tree to its part as `PartDef.atoms`. Each tree is as wide as the part, and its outermost box
 * keeps the part's look and its tap. */

const px = (p: P, key = "width") => Math.round(p.n(key));
const some = (...nodes: (Node | false | "" | undefined | null)[]): Node[] => nodes.filter((n): n is Node => !!n);

/** a title over a supporting line, taking what the row leaves */
const lines = (title: string, sub: string, style = "lead"): Node =>
  vbox({ gap: 2, hugWidth: false, width: 160 }, some(para(title, style, { maxLines: 1 }), sub && para(sub, "body", { color: "muted", maxLines: 1 })), { grow: true });

/** one side of a bar whose title is centered: as wide as the other side */
const side = (justify: string, kids: Node[]): Node => hbox({ justify, gap: 0, hugWidth: false, width: 80 }, kids, { grow: true });

/** the bar of a search: what leads, the entry taking the rest, what trails */
const searchBar = (p: P): Node =>
  hbox({ padX: 16, padY: 4, gap: 12, hugWidth: false, width: px(p) }, some(p.s("leading") && icon(p.s("leading")), entry(p.s("placeholder")), p.s("trailing") && iconButton(p.s("trailing"), p.s("trailing"), { variant: "ghost" })));

export const SPLITS: Record<string, (p: P) => Node> = {
  search: (p) => {
    const outlined = p.s("style") === "outlined";
    if (p.s("kind") === "bar") return { ...searchBar(p), props: { ...searchBar(p).props, surface: outlined ? "chip" : "field" }, corners: round(28) };
    /* a view: the bar over the suggestions, in one surface */
    return vbox(
      { surface: outlined ? "chip" : "field", width: px(p), hugWidth: false, padX: 0, padY: 0, gap: 0 },
      [searchBar(p), line({ length: px(p) }), ...p.list("results").map((r) => hbox({ padX: 16, padY: 12, gap: 16 }, some(r.icon && icon(r.icon, { color: "muted" }), para(r.label, "lead", { maxLines: 1 }, { grow: true }))))],
      { corners: round(28) },
    );
  },

  "app-bar": (p) => {
    const lead = p.s("leading") && iconButton(p.s("leading"), p.say("Navigate"));
    const actions = some(p.s("trailing") && iconButton(p.s("trailing"), p.say("More")), p.s("trailing2") && iconButton(p.s("trailing2"), "Action"));
    const size = p.s("size");
    if (size === "medium" || size === "large")
      return vbox({ surface: "bar", width: px(p), hugWidth: false, padX: 4, padY: 8, gap: 8 }, [
        hbox({ justify: "between", gap: 4 }, [hbox({ gap: 0 }, some(lead)), hbox({ gap: 0 }, actions)]),
        vbox({ padX: 12, padY: 4, gap: 2 }, some(para(p.s("title"), size === "large" ? "display" : "headline", { maxLines: 1 }), p.s("subtitle") && para(p.s("subtitle"), "body", { color: "muted", maxLines: 1 }))),
      ]);
    if (p.b("centered"))
      return hbox({ surface: "bar", width: px(p), hugWidth: false, padX: 4, padY: 8, gap: 4 }, [side("start", some(lead)), vbox({ gap: 0, align: "center" }, some(text(p.s("title"), "title"), p.s("subtitle") && text(p.s("subtitle"), "caption", { color: "muted" }))), side("end", actions)]);
    return hbox({ surface: "bar", width: px(p), hugWidth: false, padX: 4, padY: 8, gap: 4 }, [...some(lead), lines(p.s("title"), p.s("subtitle"), "title"), ...actions]);
  },

  item: (p) => {
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
    /* a plain row keeps to the screen's margins, as the part's own does; one with a surface keeps its words off its edge */
    const flush = p.s("variant") === "default";
    const rows = p.list("items").map((it) =>
      hbox(
        { surface: p.s("variant") === "outline" ? "chip" : p.s("variant") === "muted" ? "panel" : "none", padX: flush ? 0 : 16, padY: pad, gap: 12 },
        some(it.icon && (disc ? box({ surface: "well", layout: "row", align: "center", justify: "center", padX: 8, padY: 8 }, [icon(it.icon)], { corners: round(20) }) : icon(it.icon, { color: "muted" })), lines(it.label, p.s("description")), end),
      ),
    );
    return vbox({ width: px(p), hugWidth: false, padX: 0, padY: 0, gap: p.s("variant") === "default" ? 0 : 4 }, rows);
  },

  card: (p) => {
    const pos = p.s("imagePos");
    const center = p.s("textAlign") === "center";
    const words = vbox({ gap: 6, align: "stretch" }, some(para(p.s("title"), "title", center ? { align: "center" } : {}), p.s("description") && para(p.s("description"), "body", { color: "muted", ...(center ? { align: "center" } : {}) })));
    const action = p.s("action") && hbox({ justify: "end", gap: 8 }, [button(p.s("action"), { variant: "text", size: "xs" })]);
    const picture = (w?: number) => image({ src: p.s("image"), height: px(p, "imageSize"), ...(w ? { width: w } : {}) });
    const surface = p.s("variant") === "outlined" ? "chip" : p.s("variant") === "elevated" ? "card" : "panel";
    if (pos === "leading" || pos === "trailing")
      return hbox({ surface, width: px(p), hugWidth: false, padX: 12, padY: 12, gap: 12, align: "start" }, pos === "leading" ? [picture(px(p, "imageSize")), vbox({ gap: 8, hugWidth: false, width: 120 }, some(words, action), { grow: true })] : [vbox({ gap: 8, hugWidth: false, width: 120 }, some(words, action), { grow: true }), picture(px(p, "imageSize"))]);
    return vbox({ surface, width: px(p), hugWidth: false, padX: 16, padY: 16, gap: 12 }, some(pos === "top" && picture(), words, action, pos === "bottom" && picture()));
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
};
