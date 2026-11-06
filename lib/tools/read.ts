/* The tools that read: the document as an outline at a chosen depth, finding parts, one part in full, the screens, the
 * selection, the catalogs a model writes from (parts with their props schema, kits, templates, styles, looks, icons),
 * the reusable components and the data, and a picture of a screen. None of them changes anything. */

import { PARTS, partBySlug, tierOf, TIERS, CATEGORIES, defaultValues } from "../../parts/registry";
import { KITS, kitBySlug, pickVariant } from "../../parts/kits";
import { TEMPLATES, templateBySlug } from "../../parts/templates";
import { searchTerms } from "../../parts/keywords";
import { roleOf } from "../../parts/role";
import { describeNode, find, nodeTree, outline, type CoreState, type FindQuery, type Schema } from "../core";
import { propKindText } from "../core/ops/validate";
import { kitLookOf } from "../kits";
import { COLOR_ROLES, LOOK_PRESETS, STRICT_LOOK_KEYS, lookForModel } from "../look";
import { rulesForModel } from "../styleRules";
import { STYLE_PACKS, isStrict, recipesOf, styleOf, uxOf, withDocStyles } from "../styles";
import { COLOR_TOKENS, ICON_FAMILIES, TEXT_TOKENS, frameLengthOf, frameSizeOf, type Doc } from "../tokens";
import { FAMILY_LACKS, ICON_NAMES } from "./icons.generated";
import { partPropsSchema } from "./schema";
import { tool, ToolFailure, type Tool, type ToolEnv } from "./types";

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const str = (description?: string): Schema => ({ type: "string", ...(description ? { description } : {}) });
const int = (description?: string, more: Schema = {}): Schema => ({ type: "integer", ...(description ? { description } : {}), ...more });

/** the canvas as operations see it, and the sizes its parts measure */
function reading(env: ToolEnv): { s: CoreState; doc: Doc; widths: Record<string, number> } {
  const s = env.store.get();
  return { s, doc: s.doc as Doc, widths: env.store.ctx(env.origin).widths };
}

/** a word query against a few strings, with the editor's own synonyms (so "cart" finds commerce parts) */
function matcher(query: string | undefined): (...texts: (string | undefined)[]) => boolean {
  const terms = query ? searchTerms(query) : [];
  if (!terms.length) return () => true;
  return (...texts) => {
    const hay = texts.filter(Boolean).join(" ").toLowerCase();
    return terms.some((t) => hay.includes(t));
  };
}

const labelsOf = (l: Partial<Record<string, string>> | undefined) => Object.values(l ?? {}).join(" ");

/* ---------- the document ---------- */

const getOutline = tool<{ screen?: string; depth?: number; props?: "set" | "none" | "all"; format?: "text" | "json" }>({
  name: "get_outline",
  group: "read",
  description:
    "The document as a compact outline: title and style, components, collections and variables, then each screen and the tree of its parts, one line each (id, part, name, position and size on its screen, layout, props set over the defaults, fill, look, tap). Use `screen` for one screen and `depth` to keep it short; `props: all` shows every prop.",
  input: obj({ screen: str("only this screen"), depth: int("how deep the tree goes (0 = only the top level)", { minimum: 0 }), props: { type: "string", enum: ["set", "none", "all"] }, format: { type: "string", enum: ["text", "json"] } }),
  output: "the outline as text (or the node tree as JSON)",
  readOnly: true,
  destructive: false,
  run(a, env) {
    const { s, doc, widths } = reading(env);
    if (a.screen && !s.doc.frames.some((f) => f.id === a.screen)) throw new ToolFailure("not_found", `There is no screen ${JSON.stringify(a.screen)}.`, "list_screens gives the ids of the screens.");
    return { result: outline(doc, widths, a) };
  },
});

const listScreens = tool<Record<string, never>>({
  name: "list_screens",
  group: "read",
  description: "Every screen: id, name, size, how far it scrolls, background, what it is for, which screen it is another size of, and how many parts stand on it.",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const { s, doc, widths } = reading(env);
    const tree = nodeTree(doc, widths);
    const count = (nodes: { children: unknown[] }[]): number => nodes.reduce((n, x) => n + 1 + count(x.children as { children: unknown[] }[]), 0);
    return {
      result: s.doc.frames.map((f) => {
        const { w, h } = frameSizeOf(f);
        const t = tree.screens.find((x) => x.id === f.id);
        return { id: f.id, name: f.name, w, h, ...(frameLengthOf(f) > h ? { length: frameLengthOf(f) } : {}), ...(f.bg ? { bg: f.bg } : {}), ...(f.note ? { note: f.note } : {}), ...(f.variantOf ? { variantOf: f.variantOf } : {}), parts: t ? count(t.nodes) : 0 };
      }),
    };
  },
});

const findNodes = tool<FindQuery>({
  name: "find_nodes",
  group: "read",
  description: "Finds parts that match everything given: on a screen, of a part slug, tier or category, with a name or shown words containing `name` / `text` (case-insensitive). Returns id, group id, slug, screen, name and bounds on its screen.",
  input: obj({ screen: str(), slug: str("a part slug (button, text, box…)"), name: str(), text: str("words the part shows"), tier: { type: "string", enum: [...TIERS] }, category: { type: "string", enum: [...CATEGORIES] }, limit: int(undefined, { minimum: 1 }) }),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const { doc, widths } = reading(env);
    return { result: find(doc, widths, { limit: 50, ...a }) };
  },
});

const describeNodeTool = tool<{ id: string }>({
  name: "describe_node",
  group: "read",
  description: "Everything about one part: what it is, its screen and bounds, its group's fields, its parent and children, its auto layout and how it sits in its parent's, its own fields (fill, look, tap…), each prop with its value, default and the values it takes, and the places a tap can be set on (slots).",
  input: obj({ id: str("the part's id (a screen's id gives the screen and its outline)") }, ["id"]),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const { doc, widths } = reading(env);
    const d = describeNode(doc, widths, a.id);
    if (d) return { result: d };
    /* a screen asked about as if it were a part: what a model reaches for first */
    const f = doc.frames.find((x) => x.id === a.id);
    if (f) return { result: { screen: { id: f.id, name: f.name, ...frameSizeOf(f), ...(f.note ? { note: f.note } : {}) }, outline: outline(doc, widths, { screen: f.id, depth: 2 }) } };
    throw new ToolFailure("not_found", `There is no part ${JSON.stringify(a.id)} on the canvas.`, "get_outline or find_nodes gives the ids of the parts.");
  },
});

const getSelection = tool<Record<string, never>>({
  name: "get_selection",
  group: "read",
  description: "What the author has selected in the editor: the parts (the last one is the one the panel shows) and the selected screen.",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const { s, doc, widths } = reading(env);
    const parts = s.session.selection.map((id) => {
      const d = describeNode(doc, widths, id);
      return d ? { id, slug: d.slug, name: d.name, screen: d.screen?.id, bounds: d.bounds } : { id };
    });
    return { result: { parts, screen: s.session.frameId } };
  },
});

/* ---------- the catalogs ---------- */

const listParts = tool<{ tier?: "atom" | "composite"; category?: string; query?: string }>({
  name: "list_parts",
  group: "read",
  description:
    "The catalog of parts: atoms (box, text, icon, svg, image, button, input… compose them in boxes) and ready-made composites. Filter by tier, category or a word. Each row: slug, name, category, and its prop keys. describe_part gives one part's props with their kinds, defaults and schema.",
  input: obj({ tier: { type: "string", enum: [...TIERS] }, category: { type: "string", enum: [...CATEGORIES] }, query: str("a word to look for in slugs, names and categories") }),
  readOnly: true,
  destructive: false,
  run(a) {
    const hit = matcher(a.query);
    const rows = PARTS.filter((d) => (!a.tier || tierOf(d) === a.tier) && (!a.category || d.category === a.category) && hit(d.slug, d.name, labelsOf(d.labels), d.category));
    return { result: { count: rows.length, parts: rows.map((d) => `${d.slug} | ${d.name} | ${tierOf(d)}/${d.category}${d.holds ? " | holds parts" : ""}${d.atoms ? " | splits" : ""} | props: ${d.props.map((p) => p.key).join(", ")}`) } };
  },
});

const describePart = tool<{ slug: string }>({
  name: "describe_part",
  group: "read",
  description: "One part (or kit) of the catalog in full: its tier and category, default size, whether it holds parts, has an auto layout or splits into atoms, and each prop with its kind, default and the values it takes, plus `propsSchema` (JSON Schema of its props). For a kit: what it is made of and its variants, with the one the document's style would pick.",
  input: obj({ slug: str("a part slug, or a kit slug") }, ["slug"]),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const def = partBySlug(a.slug);
    if (def) {
      const defaults = defaultValues(def);
      const role = typeof def.role === "string" ? def.role : roleOf({ component: def.slug, props: {} } as never);
      return {
        result: {
          slug: def.slug,
          name: def.name,
          tier: tierOf(def),
          category: def.category,
          size: { w: def.w, h: def.h },
          ...(role ? { role } : {}),
          holds: !!def.holds,
          autoLayout: !!def.flow,
          splits: !!def.atoms,
          appearance: !!def.appearance,
          props: def.props.map((d) => ({ key: d.key, label: d.label, kind: d.kind, default: defaults[d.key], takes: propKindText(d) })),
          propsSchema: partPropsSchema(def),
        },
      };
    }
    const kit = kitBySlug(a.slug);
    if (kit) {
      const look = kitLookOf(env.store.get().doc.theme);
      return { result: { kit: true, slug: kit.slug, name: kit.name, category: kit.category, about: kit.about, variants: kit.variants.map((v) => ({ key: v.key, name: v.name })), styleWouldPick: pickVariant(kit, look).key, add: "add_kit {slug, variant?, screen, at | into}" } };
    }
    const tpl = templateBySlug(a.slug);
    if (tpl) return { result: { template: true, slug: tpl.slug, name: tpl.name, category: tpl.category, frame: tpl.frame, screens: tpl.build().length, add: "add_template {slug}" } };
    throw new ToolFailure("not_found", `There is no part, kit or template ${JSON.stringify(a.slug)}.`, "list_parts, list_kits or list_templates gives the slugs.");
  },
});

const listKits = tool<{ query?: string; category?: string }>({
  name: "list_kits",
  group: "read",
  description: "Kits: composites built from atoms in nested auto layouts (search bar, list row, prompt box, tab bar…), each composed the way the document's style composes it and re-composed when the style changes. Each row: slug, category, what it is made of, its variants.",
  input: obj({ query: str(), category: { type: "string", enum: [...CATEGORIES] } }),
  readOnly: true,
  destructive: false,
  run(a) {
    const hit = matcher(a.query);
    const rows = KITS.filter((k) => (!a.category || k.category === a.category) && hit(k.slug, k.name, labelsOf(k.labels), k.about, k.category));
    return { result: { count: rows.length, kits: rows.map((k) => `${k.slug} | ${k.category} | ${k.name}: ${k.about} | variants: ${k.variants.map((v) => v.key).join(", ")}`) } };
  },
});

const listTemplates = tool<{ query?: string }>({
  name: "list_templates",
  group: "read",
  description: "Screen and flow templates (sign-in, shop, social, content, tools, games, desktop) that add_template puts on the canvas. Each row: slug, name, category, device, number of screens.",
  input: obj({ query: str() }),
  readOnly: true,
  destructive: false,
  run(a) {
    const hit = matcher(a.query);
    const rows = TEMPLATES.filter((d) => hit(d.slug, d.name, labelsOf(d.labels), d.category));
    return { result: { count: rows.length, templates: rows.map((d) => `${d.slug} | ${d.name} | ${d.category} | ${d.frame}`) } };
  },
});

/* ---------- styles and looks ---------- */

const listStyles = tool<Record<string, never>>({
  name: "list_styles",
  group: "read",
  description: "The style the document wears (and whether it is held to that style's rules), the built-in style packs modeled on real products (key, name, products), and the document's own custom styles (custom: keys).",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const s = env.store.get();
    const theme = s.doc.theme;
    return withDocStyles(s.doc.styles, () => ({
      result: {
        current: { style: theme.style ?? "", name: styleOf(theme.style)?.name.en ?? "Material 3", strict: isStrict(theme), dark: theme.dark },
        builtIn: STYLE_PACKS.map((p) => `${p.key} | ${p.name.en} | ${p.refs.join(", ")}`),
        custom: (s.doc.styles ?? []).map((c) => ({ key: c.key, name: c.name.en ?? c.key, ...(c.extends ? { extends: c.extends } : {}) })),
      },
    }));
  },
});

const getStyle = tool<{ key?: string }>({
  name: "get_style",
  group: "read",
  description:
    "One style in full (the document's own when no key is given): colors (light and dark roles), faces, shape, icon family, control recipes, how its screens are spaced and composed, and, for the style the document wears, what its rules leave to you. A custom style comes as the data set_custom_styles takes.",
  input: obj({ key: str('a style key ("" for Material), or a custom: key') }),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const s = env.store.get();
    const theme = s.doc.theme;
    const key = a.key ?? theme.style ?? "";
    return withDocStyles(s.doc.styles, () => {
      const pack = styleOf(key);
      if (key && !pack) throw new ToolFailure("not_found", `There is no style ${JSON.stringify(key)}.`, "list_styles gives the keys.");
      const wearing = key === (theme.style ?? "");
      const custom = s.doc.styles?.find((c) => c.key === key);
      const look = wearing ? theme : { ...theme, style: key || undefined, strict: undefined, recipes: undefined, ux: undefined };
      return {
        result: {
          key,
          name: pack?.name.en ?? "Material 3",
          ...(pack ? { refs: pack.refs, layout: pack.layout.en, font: pack.font, display: pack.display, icons: pack.icons, shape: pack.shape, mode: pack.mode, light: pack.light, dark: pack.dark } : {}),
          recipes: recipesOf(look),
          ux: uxOf(look),
          ...(wearing ? { worn: true, strict: isStrict(theme), rules: isStrict(theme) ? rulesForModel(theme) : "Not held to its rules: colors, shapes and every look field are yours to set." } : {}),
          ...(custom ? { custom } : {}),
        },
      };
    });
  },
});

const lookReference = tool<Record<string, never>>({
  name: "look_reference",
  group: "read",
  description: "How to write a part's `look` (its effects: fills, strokes, shadows, glass, text effects, textures…), the look presets with the look each one writes, and the color roles fill, textColor and looks take. Says which fields survive when the document is held to its style.",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const strict = isStrict(env.store.get().doc.theme);
    return {
      result: {
        strict,
        ...(strict ? { survives: [...STRICT_LOOK_KEYS], note: "The document is held to its style: every other look field, corners, a button's shape and an image's radius are removed. set_style_rules {on:false} frees it, if the author wants that." } : {}),
        fields: lookForModel(),
        presets: strict ? LOOK_PRESETS.map((p) => p.key) : LOOK_PRESETS.map((p) => ({ key: p.key, look: p.look })),
        fillRoles: COLOR_TOKENS.map((t) => t.key),
        textRoles: TEXT_TOKENS.map((t) => t.key),
        lookColors: `${COLOR_ROLES.join(", ")} (kebab case, optionally /alpha like primary/40), or #rrggbb / #rrggbbaa`,
      },
    };
  },
});

const ICONS = ICON_NAMES.split(" ");

const listIcons = tool<{ family?: string; query?: string; limit?: number }>({
  name: "list_icons",
  group: "read",
  description:
    "Material Symbols names (snake_case) every icon family draws offline. Icons are always named this way; a style's family (sf, fluentui, lucide…) draws its own glyph for the name, or Rounded's where it has none. Other Material names also work in the editor but are fetched online. With `family`, says which names that family draws itself. `document` lists the document's own icons (svg:<id>, drawings kept with set_icon or generate_svg's icon), which go wherever an icon name does.",
  input: obj({ family: { type: "string", enum: [...ICON_FAMILIES] }, query: str("part of a name: cart, arrow, person…"), limit: int(undefined, { minimum: 1 }) }),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const family = a.family ?? env.store.get().doc.theme.icons ?? "rounded";
    const q = a.query?.trim().toLowerCase().replaceAll(" ", "_");
    const lacks = new Set((FAMILY_LACKS[family] ?? "").split(" ").filter(Boolean));
    const names = ICONS.filter((n) => !q || n.includes(q)).slice(0, a.limit ?? 200);
    const own = Object.keys(env.store.get().doc.icons ?? {}).map((id) => `svg:${id}`).filter((n) => !q || n.includes(q));
    return { result: { family, count: names.length, names: names.map((n) => (lacks.has(n) ? `${n}*` : n)), ...(lacks.size ? { note: "* drawn from Rounded: this family has no glyph of its own" } : {}), ...(own.length ? { document: own } : {}) } };
  },
});

/* ---------- reuse and data ---------- */

const listComponents = tool<Record<string, never>>({
  name: "list_components",
  group: "read",
  description: "The document's reusable components (id, name, size, the parts in their definition, how many instances there are). add_instance places one; set_overrides changes an instance's words, icons or pictures.",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const s = env.store.get();
    const groups = s.editing ? s.editing.main.groups : s.doc.groups;
    return {
      result: (s.doc.components ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        w: c.w,
        h: c.h,
        parts: c.groups.flatMap((g) => g.items.map((it) => `${it.id}:${it.component}`)),
        instances: groups.filter((g) => g.instanceOf === c.id).length,
      })),
    };
  },
});

const listData = tool<{ rows?: number }>({
  name: "list_data",
  group: "read",
  description: "The document's data collections (id, name, fields, rows) and prototype variables (id, name, type, starting value). A container repeats its first child once per row with set_repeat; {{field}} in words reads the row. Variables drive set_action effects, bind_prop and showWhen.",
  input: obj({ rows: int("how many rows of each collection to show (default 20)", { minimum: 0 }) }),
  readOnly: true,
  destructive: false,
  run(a, env) {
    const s = env.store.get();
    const n = a.rows ?? 20;
    return { result: { collections: (s.doc.collections ?? []).map((c) => ({ id: c.id, name: c.name, fields: c.fields, rowCount: c.rows.length, rows: c.rows.slice(0, n) })), vars: s.doc.vars ?? [] } };
  },
});

/* ---------- pictures ---------- */

const screenshot = tool<{ id: string; scale?: number }>({
  name: "screenshot",
  group: "read",
  description: "A picture of a screen (or of one part, cut out of its screen) as the app draws it, to check your work by eye: alignment, spacing, overflow, contrast, anything missing. Open selects, menus and date pickers are drawn open on the canvas by design; leave the room they take as it is. The picture uses a fallback face a little wider than the real one, so a word cut short at the end of a tight line may be only the picture: check the outline before changing it.",
  input: obj({ id: str("a screen id or a part id"), scale: { type: "number", minimum: 0.25, maximum: 2, description: "1 = one pixel per dp (the default)" } }, ["id"]),
  output: "a PNG",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    if (!env.renderer) throw new ToolFailure("unavailable", "Pictures cannot be taken here (no renderer).", "Read the outline instead.");
    const s = env.store.get();
    const isScreen = s.doc.frames.some((f) => f.id === a.id);
    const isPart = !isScreen && s.doc.groups.some((g) => g.items.some((it) => it.id === a.id));
    if (!isScreen && !isPart) throw new ToolFailure("not_found", `There is no screen or part ${JSON.stringify(a.id)}.`, "list_screens gives the screens' ids.");
    const png = await env.renderer.screenshot(a.id, { scale: a.scale, signal: env.signal });
    return { result: { id: a.id, kind: isScreen ? "screen" : "part" }, images: [png] };
  },
});

export const READ_TOOLS: Tool<never>[] = [getOutline, listScreens, findNodes, describeNodeTool, getSelection, listParts, describePart, listKits, listTemplates, listStyles, getStyle, lookReference, listIcons, listComponents, listData, screenshot] as unknown as Tool<never>[];
