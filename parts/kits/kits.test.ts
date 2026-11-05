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

const LOOKS: KitLook[] = [
  MATERIAL_LOOK,
  { ...MATERIAL_LOOK, field: "soft", bar: "center", list: "inset", toggle: "ios", dark: true },
  { ...MATERIAL_LOOK, group: "desktop", field: "boxed", compact: true },
  { ...MATERIAL_LOOK, group: "pcGame", field: "line", bar: "hud", dark: true },
];

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
    expect(KITS.length).toBeGreaterThanOrEqual(10);
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
        for (const { node } of walk(v.build(MATERIAL_LOOK))) {
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
    /* a key it does not have falls back on the look */
    expect(pickVariant(search, MATERIAL_LOOK, "nope").key).toBe("material");
  });

  it("is dark on a light page where its product is, and follows a dark one", () => {
    const codex = kitBySlug("codex-prompt")!;
    expect(codex.variants[0].build(MATERIAL_LOOK).fill).toBe("inverseSurface");
    expect(codex.variants[0].build({ ...MATERIAL_LOOK, dark: true }).fill).toBeUndefined();
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
    for (const slug of ["search", "app-bar", "item", "card", "alert", "banner", "notice-bar", "section-header", "stat-card", "asset-pill", "chat-composer", "empty"]) expect(partBySlug(slug)?.atoms, slug).toBeTruthy();
    for (const d of splits) expect(tierOf(d), d.slug).toBe("composite");
  });

  it("split into atoms with the props those take, for their defaults and for other values", () => {
    const others: Record<string, Record<string, unknown>> = {
      search: { kind: "bar", style: "outlined" },
      "app-bar": { size: "large", trailing2: "share" },
      item: { items: [{ label: "A", icon: "home" }, { label: "B" }], trailing: "switch", iconFill: "primary", variant: "outline" },
      card: { imagePos: "leading", action: "Open", textAlign: "center" },
      alert: { variant: "destructive" },
      empty: { bordered: true, action: "" },
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
