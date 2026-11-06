import { beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setGlobalLang } from "../../lib/i18n";
import { choiceValueOf } from "../labels";
import { PARTS, defaultValues, partBySlug, reader, tierOf, treeOf } from "../registry";
import { renderNode } from "../render";
import { inLang, type Node } from "../templates/kit";
import type { PropDef } from "../types";
import { KITS, MATERIAL_LOOK, kitBySlug, kitCatalog, kitOfKey, kitKey, pickVariant, type KitLook } from ".";

/* Every kit, in every variant and under every kind of look, is a tree the canvas can lay out: only
 * atoms, only boxes holding anything, every prop one its part has, of the kind and in the range the
 * part takes, and words in every language. */

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

/* looks of the kinds the styles come in, written as fields: no style is named */
const IPHONE: KitLook = { ...MATERIAL_LOOK, field: "soft", bar: "center", appbar: "ios", list: "inset", toggle: "ios", nav: "floating", segmented: "ios", dialog: "alert", sheet: "grabber", row: "chevron", caption: "lights", dark: true };
const MESSENGER: KitLook = { ...MATERIAL_LOOK, field: "soft", bar: "center", appbar: "center", list: "flush", toggle: "ios", nav: "plain", dialog: "weui", sheet: "weui", avatar: "square", caption: "lights" };
const DESK: KitLook = { ...MATERIAL_LOOK, group: "desktop", field: "boxed", list: "hairline", toggle: "outline", nav: "icononly", tabs: "topline", dialog: "modal", compact: true };
const MOBILE_GAME: KitLook = { ...MATERIAL_LOOK, group: "mobileGame", field: "hard", bar: "hud", button: "gloss", list: "tile", nav: "gamebar", dialog: "game", dialogue: "band" };
const PC_GAME: KitLook = { ...MATERIAL_LOOK, group: "pcGame", field: "line", bar: "hud", list: "tile", nav: "topline", dialog: "plain", dialogue: "portrait", dark: true };
const LOOKS: KitLook[] = [MATERIAL_LOOK, IPHONE, MESSENGER, DESK, MOBILE_GAME, PC_GAME];

const walk = (n: Node, depth = 0, into: { node: Node; depth: number }[] = []) => {
  into.push({ node: n, depth });
  for (const k of n.kids ?? []) walk(k, depth + 1, into);
  return into;
};

const isSay = (v: unknown) => typeof v === "object" && v !== null && "en" in v && "zh" in v && "ja" in v && "ko" in v;

/** what is wrong with a prop value for its definition, or "" */
function wrongValue(d: PropDef, v: unknown): string {
  switch (d.kind) {
    case "text":
    case "icon":
    case "image":
      return typeof v === "string" ? "" : "not a string";
    case "enum":
      return d.options.map(choiceValueOf).includes(String(v)) ? "" : `${String(v)} is not one of ${d.options.map(choiceValueOf).join(", ")}`;
    case "bool":
      return typeof v === "boolean" ? "" : "not true or false";
    case "number":
      return typeof v === "number" && v >= d.min && v <= d.max ? "" : `${String(v)} is out of ${d.min}–${d.max}`;
    case "list":
      return Array.isArray(v) && v.every((x) => typeof x?.label === "string") ? "" : "not rows";
    case "table":
      return typeof v === "object" ? "" : "not a table";
  }
}

describe("every kit", () => {
  it("has an id of its own and at least one variant, each with its own key", () => {
    for (const k of KITS) {
      expect(k.slug).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(partBySlug(k.slug), k.slug).toBeUndefined();
      expect(k.variants.length, k.slug).toBeGreaterThan(0);
      expect(new Set(k.variants.map((v) => v.key)).size, k.slug).toBe(k.variants.length);
      for (const l of ["ja", "zh", "ko"] as const) {
        expect(k.labels[l], `${k.slug} ${l}`).toBeTruthy();
        for (const v of k.variants) expect(v.labels[l], `${k.slug}/${v.key} ${l}`).toBeTruthy();
      }
    }
    expect(KITS.length).toBeGreaterThanOrEqual(55);
  });

  it("has a variant for a document with no style: Material's", () => {
    for (const k of KITS) expect(k.variants.some((v) => !v.suits || v.suits(MATERIAL_LOOK)), k.slug).toBe(true);
  });

  it("builds a tree of atoms only, in which only boxes hold anything", () => {
    for (const k of KITS)
      for (const v of k.variants)
        for (const look of LOOKS) {
          const all = walk(v.build(look));
          expect(all[0].node.slug, `${k.slug}/${v.key}: its root is a box`).toBe("box");
          for (const { node } of all) {
            const def = partBySlug(node.slug);
            expect(def, `${k.slug}/${v.key}: ${node.slug}`).toBeTruthy();
            expect(tierOf(def!), `${k.slug}/${v.key}: ${node.slug} is not an atom`).toBe("atom");
            if (node.kids?.length) expect(!!def!.holds && !!def!.flow, `${k.slug}/${v.key}: ${node.slug} holds`).toBe(true);
          }
        }
  });

  it("sets only props its parts have, each of the right kind and in range, in every language", () => {
    for (const k of KITS)
      for (const v of k.variants)
        for (const { node } of LOOKS.flatMap((look) => walk(v.build(look)))) {
          const def = partBySlug(node.slug)!;
          for (const lang of ["en", "zh", "ja", "ko"] as const) {
            const props = inLang(node.props, lang);
            for (const [key, value] of Object.entries(props)) {
              const d = def.props.find((x) => x.key === key);
              expect(d, `${k.slug}/${v.key}: ${node.slug} has no prop ${key}`).toBeTruthy();
              expect(wrongValue(d!, value), `${k.slug}/${v.key}: ${node.slug}.${key}`).toBe("");
            }
          }
          /* words a person reads are written in every language */
          for (const d of def.props) if ((d.key === "text" || d.key === "placeholder" || d.key === "label") && typeof node.props[d.key] === "string" && /[a-z]{3}/i.test(node.props[d.key] as string) && !/^[\d.,/:]+$/.test(node.props[d.key] as string)) expect(isSay(node.props[d.key]) || /^[a-z0-9-]+$/.test(node.props[d.key] as string), `${k.slug}/${v.key}: ${node.slug}.${d.key} "${node.props[d.key]}" is in one language`).toBe(true);
        }
  });

  it("draws every atom of every variant", () => {
    for (const k of KITS)
      for (const v of k.variants)
        for (const { node } of walk(v.build(MATERIAL_LOOK))) {
          const def = partBySlug(node.slug)!;
          const out = renderToStaticMarkup(createElement("div", null, renderNode(treeOf(def, { ...defaultValues(def), ...inLang(node.props, "en") }))));
          expect(out, `${k.slug}/${v.key}: ${node.slug}`).not.toMatch(/undefined|\[object/);
        }
  });

  it("is chosen by the look where its variants say which they suit", () => {
    const search = kitBySlug("search-bar")!;
    expect(pickVariant(search, MATERIAL_LOOK).key).toBe("material");
    expect(pickVariant(search, { ...MATERIAL_LOOK, field: "soft" }).key).toBe("soft");
    expect(pickVariant(search, { ...MATERIAL_LOOK, group: "desktop", field: "boxed" }).key).toBe("desktop");
    expect(pickVariant(search, MATERIAL_LOOK, "desktop").key).toBe("desktop");
    expect(pickVariant(kitBySlug("top-app-bar")!, { ...MATERIAL_LOOK, bar: "center" }).key).toBe("center");
    /* each product's own composition, from the look's fields */
    const picked = (slug: string, look: KitLook) => pickVariant(kitBySlug(slug)!, look).key;
    expect(picked("dialog-body", MATERIAL_LOOK)).toBe("material");
    expect(picked("dialog-body", IPHONE)).toBe("alert");
    expect(picked("dialog-body", MESSENGER)).toBe("weui");
    expect(picked("dialog-body", MOBILE_GAME)).toBe("game");
    expect(picked("option-sheet", IPHONE)).toBe("ios");
    expect(picked("option-sheet", MESSENGER)).toBe("weui");
    expect(picked("tab-bar", MATERIAL_LOOK)).toBe("pill");
    expect(picked("tab-bar", IPHONE)).toBe("floating");
    expect(picked("tab-bar", MESSENGER)).toBe("tint");
    expect(picked("tab-bar", MOBILE_GAME)).toBe("game");
    expect(picked("window-title-bar", MATERIAL_LOOK)).toBe("buttons");
    expect(picked("window-title-bar", IPHONE)).toBe("lights");
    expect(picked("inset-group", IPHONE)).toBe("inset");
    expect(picked("inset-group", MESSENGER)).toBe("flush");
    expect(picked("inset-group", MATERIAL_LOOK)).toBe("material");
    expect(picked("button-stack", IPHONE)).toBe("stacked");
    expect(picked("button-stack", MESSENGER)).toBe("halves");
    expect(picked("button-stack", DESK)).toBe("desk");
    expect(picked("conversation-row", MESSENGER)).toBe("im");
    expect(picked("hud-top-bar", PC_GAME)).toBe("pc");
    expect(picked("dialogue-panel", MOBILE_GAME)).toBe("band");
    /* a key it does not have falls back on the look */
    expect(pickVariant(search, MATERIAL_LOOK, "nope").key).toBe("material");
  });

  it("follows the page's mode, so a document that changes mode keeps it readable", () => {
    /* a box painted in a fixed inverse would turn white on a dark page; the Codex box is a panel of the page's
     * mode, and its main action is the style's own filled button */
    const codex = kitBySlug("codex-prompt")!;
    for (const dark of [false, true]) {
      const tree = codex.variants[0].build({ ...MATERIAL_LOOK, dark });
      expect(tree.fill).toBeUndefined();
      expect(tree.props.surface).toBe("panel");
      expect(walk(tree).find(({ node }) => node.slug === "button" && node.props.variant === "filled")!.node.fill).toBeUndefined();
    }
  });

  it("paints no button, so a style that draws its buttons as bare words leaves them readable", () => {
    /* such a style drops a fill painted on a button but keeps its words in the color meant for that fill */
    const bad = KITS.flatMap((k) => k.variants.flatMap((v) => LOOKS.flatMap((look) => walk(v.build(look)).filter(({ node }) => (node.slug === "button" || node.slug === "icon-button") && node.fill).map(({ node }) => `${k.slug}/${v.key}: ${node.slug}`))));
    expect([...new Set(bad)]).toEqual([]);
  });

  it("puts a setting's icon on a colored tile only in grouped inset lists", () => {
    const tiled = (look: KitLook) => walk(kitBySlug("settings-row")!.variants[0].build(look)).some(({ node }) => node.slug === "box" && node.fill === "primary");
    expect(tiled({ ...MATERIAL_LOOK, list: "inset" })).toBe(true);
    expect(tiled({ ...MATERIAL_LOOK, toggle: "ios", list: "plain" })).toBe(false);
  });

  it("is kept by a favorite under a key of its own", () => {
    expect(kitOfKey(kitKey("claude-prompt"))?.slug).toBe("claude-prompt");
    expect(kitOfKey("claude-prompt")).toBeUndefined();
    expect(kitOfKey("kit:nope")).toBeUndefined();
  });

  it("is listed for the AI guide", () => {
    for (const k of KITS) expect(kitCatalog()).toContain(`\`${k.slug}\``);
  });
});

describe("what a part starts with from the palette", () => {
  it("is props it has, with values it takes", () => {
    const seeded = PARTS.filter((d) => d.seed);
    expect(seeded.map((d) => d.slug)).toContain("text");
    for (const d of seeded)
      for (const [key, value] of Object.entries(d.seed!)) {
        const p = d.props.find((x) => x.key === key);
        expect(p, `${d.slug}.${key}`).toBeTruthy();
        expect(wrongValue(p!, value), `${d.slug}.${key}`).toBe("");
      }
  });
});

describe("the composites that split", () => {
  const splits = PARTS.filter((d) => d.atoms);

  it("cover the common ones", () => {
    const common = ["search", "app-bar", "item", "card", "alert", "banner", "notice-bar", "section-header", "stat-card", "asset-pill", "chat-composer", "empty"];
    const more = ["navigation-bar", "tabs", "toolbar", "breadcrumb", "steps", "title-bar", "status-bar", "dialog", "alert-dialog", "action-sheet", "sonner", "settings-group", "notification-list", "conversation-list", "contact-list", "comment-list", "transaction-list", "leaderboard", "product-card", "price-tag", "coupon", "checkout-bar", "balance-card", "profile-header", "post-card", "route-card", "subscription", "review-summary", "description-list", "timeline", "message", "bubble", "attachment", "task-row", "item-cell", "character-card", "game-result", "dialogue-box", "stat-bar", "reward-track", "check-in"];
    for (const slug of [...common, ...more]) expect(partBySlug(slug)?.atoms, slug).toBeTruthy();
    for (const d of splits) expect(tierOf(d), d.slug).toBe("composite");
    expect(splits.length).toBeGreaterThanOrEqual(common.length + 30);
  });

  it("keep the part's words", () => {
    /* what a part shows only after a press, or only to code, is not on it to begin with */
    const unseen: Record<string, string[]> = {
      sonner: ["label"],
      "price-tag": ["amount"],
      "review-summary": ["values"],
      "comment-list": ["you", "now"],
      "product-card": ["done"],
      coupon: ["done"],
      "checkout-bar": ["done"],
      "route-card": ["done"],
      "profile-header": ["done"],
      "contact-list": ["done"],
      "task-row": ["done"],
      "item-cell": ["rarityColor"],
      dialog: ["width", "height"],
      /* a dialogue shows its first line; the rest, and the choices, come with the taps */
      "dialogue-box": ["lines", "choices"],
      /* a notice bar scrolls its notices through one line: the split keeps the one showing */
      "notice-bar": ["items"],
    };
    const strings = (v: unknown, into: string[] = []): string[] => {
      if (typeof v === "string") into.push(v);
      else if (Array.isArray(v)) v.forEach((x) => strings(x, into));
      else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, into));
      return into;
    };
    for (const d of splits) {
      const values = defaultValues(d);
      const p = reader(d, values);
      const said = walk(d.atoms!(p) as Node).flatMap(({ node }) => strings(node.props)).join("\n");
      const words = [
        ...d.props.filter((x) => x.kind === "text" && !(unseen[d.slug] ?? []).includes(x.key) && (!x.when || x.when(p))).map((x) => p.s(x.key)),
        ...d.props.filter((x) => x.kind === "list" && !(unseen[d.slug] ?? []).includes(x.key)).flatMap((x) => p.list(x.key).map((it) => it.label)),
        ...d.props.filter((x) => x.kind === "table").flatMap((x) => p.table(x.key).rows.map((r) => r[0] ?? "")),
      ].filter((w) => w && !w.startsWith("#"));
      /* word by word: a stat of "128 Posts" is a figure over a name */
      for (const w of words) for (const piece of w.split(/\s+/)) expect(said, `${d.slug}: "${w}"`).toContain(piece);
      if (d.slug === "dialogue-box") expect(said).toContain(p.list("lines")[0].label);
    }
  });

  it("split into atoms with the props those take, for their defaults and for other values", () => {
    const others: Record<string, Record<string, unknown>> = {
      search: { kind: "bar", style: "outlined" },
      "app-bar": { size: "large", trailing2: "share" },
      item: { items: [{ label: "A", icon: "home" }, { label: "B" }], trailing: "switch", iconFill: "primary", variant: "outline" },
      card: { imagePos: "leading", action: "Open", textAlign: "center" },
      alert: { variant: "destructive" },
      empty: { bordered: true, action: "" },
      "navigation-bar": { layout: "horizontal", badge: 3, tall: true, elevated: true },
      tabs: { variant: "segmented", items: [{ label: "A", icon: "home" }, { label: "B" }] },
      toolbar: { kind: "docked", toggles: true },
      breadcrumb: { separator: "slash", collapse: true, items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }] },
      "title-bar": { controls: "windows" },
      dialog: { style: "fullscreen" },
      "alert-dialog": { size: "sm", icon: "delete" },
      sonner: { action: "Undo", closeButton: true },
      "contact-list": { trailing: "call", grouped: false, search: "" },
      leaderboard: { faces: false, selected: 1 },
      "product-card": { layout: "horizontal", liked: true, badge: "" },
      "price-tag": { size: "large", amount: "99" },
      "balance-card": { hidden: true },
      "profile-header": { showCover: false, following: true },
      "post-card": { showImage: false },
      message: { align: "end", variant: "destructive", header: "Ada", footer: "Read" },
      bubble: { variant: "ghost", reaction: "👍", align: "end" },
      attachment: { state: "uploading", orientation: "vertical", remove: true, size: "xs" },
      "item-cell": { rarity: "SSR", badge: "New" },
      "stat-bar": { numbers: false, color: "tertiary", label: "" },
      "check-in": { signed: 0, days: 7 },
      "dialogue-box": { lines: [{ label: "Only line" }] },
    };
    for (const d of splits)
      for (const values of [defaultValues(d), { ...defaultValues(d), ...others[d.slug] }]) {
        const all = walk(d.atoms!(reader(d, values)) as Node);
        expect(all[0].node.slug, d.slug).toBe("box");
        for (const { node } of all) {
          const def = partBySlug(node.slug);
          expect(def && tierOf(def), `${d.slug}: ${node.slug}`).toBe("atom");
          for (const [key, value] of Object.entries(node.props)) {
            const p = def!.props.find((x) => x.key === key);
            expect(p, `${d.slug}: ${node.slug} has no prop ${key}`).toBeTruthy();
            expect(wrongValue(p!, value), `${d.slug}: ${node.slug}.${key}`).toBe("");
          }
          if (node.kids?.length) expect(node.slug, d.slug).toBe("box");
        }
      }
  });
});
