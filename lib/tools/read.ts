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
import { STYLE_PACKS, isStrict, recipesOf, styleContext, styleOf, uxOf } from "../styles";
import { COLOR_TOKENS, ICON_FAMILIES, REGION_STATES, TEXT_TOKENS, frameLengthOf, frameSizeOf, type ComponentDef, type Doc, type RegionState } from "../tokens";
import { overridableParts } from "../instances";
import { FAMILY_LACKS, ICON_NAMES } from "./icons.generated";
import { partPropsSchema } from "./schema";
import { declarationsOf } from "../partContract";
import type { PartDef } from "../../parts/types";
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
  description: "Everything about one part (also one inside a component's definition, with its overrideKeys; or a component by its id): what it is, its screen and bounds, its group's fields, its parent and children, its auto layout and how it sits in its parent's, its own fields (fill, look, tap…), each prop with its value, default and the values it takes, and the places a tap can be set on (slots).",
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
    /* a component, or a part inside one's definition: what its instances show, and the keys that change it */
    const c = doc.components?.find((x) => x.id === a.id);
    if (c) return { result: componentOf(doc, c) };
    const inDef = doc.components?.find((x) => x.groups.some((g) => g.items.some((it) => it.id === a.id)));
    if (inDef) {
      const part = describeNode({ ...doc, groups: inDef.groups, frames: [] }, widths, a.id);
      const keys = overridableParts(inDef, doc.components).find((p) => p.path === a.id)?.props.map((p) => `${a.id}/${p.key}`) ?? [];
      if (part) {
        const { screen: _s, ...rest } = part;
        return { result: { ...rest, component: { id: inDef.id, name: inDef.name }, overrideKeys: keys, note: keys.length ? "A part of a component's definition: set_overrides {id: an instance, key, value} changes it in one instance; editing the definition changes every instance." : "A part of a component's definition, with nothing an instance can override." } };
      }
    }
    throw new ToolFailure("not_found", `There is no part ${JSON.stringify(a.id)} on the canvas or in a component.`, "get_outline or find_nodes gives the ids of the parts; list_components those inside components.");
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

/** a part's input, events and demo, briefly, for its row in the catalog */
const outletsLine = (d: PartDef) =>
  [d.input ? ` | input: ${d.input.prop} (${d.input.kind})` : "", d.events?.length ? ` | events: ${d.events.map((e) => `on:${e.name}`).join(", ")}` : "", d.families?.length ? ` | families: ${d.families.map((f) => `${f.prefix}:*`).join(", ")}` : "", d.demo ? " | prototype demo" : ""].join("");

const listParts = tool<{ tier?: "atom" | "composite"; category?: string; query?: string }>({
  name: "list_parts",
  group: "read",
  description:
    "The catalog of parts: atoms (box, text, icon, svg, image, button, input… compose them in boxes) and ready-made composites. Filter by tier, category or a word. Each row: slug, name, category, its prop keys, and its input, events, slot families and prototype demo when it has them. describe_part gives one part's props with their kinds, defaults and schema.",
  input: obj({ tier: { type: "string", enum: [...TIERS] }, category: { type: "string", enum: [...CATEGORIES] }, query: str("a word to look for in slugs, names and categories") }),
  readOnly: true,
  destructive: false,
  run(a) {
    const hit = matcher(a.query);
    const rows = PARTS.filter((d) => (!a.tier || tierOf(d) === a.tier) && (!a.category || d.category === a.category) && hit(d.slug, d.name, labelsOf(d.labels), d.category));
    return { result: { count: rows.length, parts: rows.map((d) => `${d.slug} | ${d.name} | ${tierOf(d)}/${d.category}${d.holds ? " | holds parts" : ""}${d.atoms ? " | splits" : ""} | props: ${d.props.map((p) => p.key).join(", ")}${outletsLine(d)}`) } };
  },
});

const describePart = tool<{ slug: string }>({
  name: "describe_part",
  group: "read",
  description: "One part (or kit) of the catalog in full: its tier and category, default size, whether it holds parts, has an auto layout or splits into atoms, and each prop with its kind, default and the values it takes, plus `propsSchema` (JSON Schema of its props), and what it declares: `input` (the prop the visitor's value goes in), `events` (on:<name> keys of set_action, their payload read as event.<field>), `families` (tab:* keys, read slot.index), `demo` (a domain behaviour it only acts out in a prototype until bound or wired to the API). For a kit: what it is made of and its variants, with the one the document's style would pick.",
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
          ...declarationsOf(def),
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
    /* read in this document's own styles, whatever another has in reach */
    const styles = styleContext(s.doc.styles);
    return {
      result: {
        current: { style: theme.style ?? "", name: styleOf(theme.style, styles)?.name.en ?? "Material 3", strict: isStrict(theme, styles), dark: theme.dark },
        builtIn: STYLE_PACKS.map((p) => `${p.key} | ${p.name.en} | ${p.refs.join(", ")}`),
        custom: (s.doc.styles ?? []).map((c) => ({ key: c.key, name: c.name.en ?? c.key, ...(c.extends ? { extends: c.extends } : {}) })),
      },
    };
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
    const styles = styleContext(s.doc.styles);
    const pack = styleOf(key, styles);
    if (key && !pack) throw new ToolFailure("not_found", `There is no style ${JSON.stringify(key)}.`, "list_styles gives the keys.");
    const wearing = key === (theme.style ?? "");
    const custom = s.doc.styles?.find((c) => c.key === key);
    const look = wearing ? theme : { ...theme, style: key || undefined, strict: undefined, recipes: undefined, ux: undefined };
    const strict = isStrict(theme, styles);
    return {
      result: {
        key,
        name: pack?.name.en ?? "Material 3",
        ...(pack ? { refs: pack.refs, layout: pack.layout.en, font: pack.font, display: pack.display, icons: pack.icons, shape: pack.shape, mode: pack.mode, light: pack.light, dark: pack.dark } : {}),
        recipes: recipesOf(look, styles),
        ux: uxOf(look, styles),
        ...(wearing ? { worn: true, strict, rules: strict ? rulesForModel(theme, styles) : "Not held to its rules: colors, shapes and every look field are yours to set." } : {}),
        ...(custom ? { custom } : {}),
      },
    };
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
    const { doc } = env.store.get();
    const strict = isStrict(doc.theme, styleContext(doc.styles));
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

/** what a part shows in words, short */
const wordsOf = (props: Record<string, unknown> | undefined): string | undefined => {
  for (const k of ["text", "label", "title", "initials", "placeholder", "name"]) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  }
  return undefined;
};

/** A component as a model uses it: its parts and what each shows, and the keys an instance changes them by
 *  (set_overrides `key`), with the value the definition gives each; switches are named without their values. */
function componentOf(doc: Doc, c: ComponentDef, instances?: number) {
  const parts = overridableParts(c, doc.components);
  const value = (v: unknown) => (typeof v === "string" && v.startsWith("data:") ? "(a picture)" : JSON.stringify(v ?? ""));
  return {
    id: c.id,
    name: c.name,
    w: c.w,
    h: c.h,
    parts: c.groups.flatMap((g) => g.items.map((it) => `${it.id}:${it.component}${wordsOf(it.props) ? ` "${wordsOf(it.props)}"` : ""}`)),
    overrideKeys: parts.flatMap((p) => {
      const defaults = defaultValues(partBySlug(p.item.component)!);
      return p.props.filter((d) => d.kind !== "bool").map((d) => `${p.path}/${d.key} = ${value(p.item.props?.[d.key] ?? defaults[d.key])}`);
    }),
    switches: parts.flatMap((p) => p.props.filter((d) => d.kind === "bool").map((d) => `${p.path}/${d.key}`)),
    ...(instances !== undefined ? { instances } : {}),
  };
}

const listComponents = tool<Record<string, never>>({
  name: "list_components",
  group: "read",
  description:
    "The document's reusable components: id, name, size, the parts in their definition (id:slug \"words\"), the keys an instance overrides them by (overrideKeys: `partId/prop = the definition's value`, switches), how many instances there are, the set each variant belongs to with its values, and each component's properties. add_instance places one; set_overrides {id: instance, key, value} changes an instance's words, icons or pictures; swap_instance picks another variant; set_instance_props sets its properties.",
  input: obj({}),
  readOnly: true,
  destructive: false,
  run(_a, env) {
    const s = env.store.get();
    const groups = s.editing ? s.editing.main.groups : s.doc.groups;
    return {
      result: (s.doc.components ?? []).map((c) => ({
        ...componentOf(s.doc as Doc, c, groups.filter((g) => g.instanceOf === c.id).length),
        ...(c.set ? { set: c.set, setName: s.doc.componentSets?.find((x) => x.id === c.set)?.name, variant: c.variant } : {}),
        ...(c.props?.length ? { props: c.props } : {}),
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

type ShotArgs = { id: string; scale?: number; scenario?: string; params?: Record<string, unknown>; state?: RegionState; region?: string };

const screenshot = tool<ShotArgs>({
  name: "screenshot",
  group: "read",
  description:
    "A picture of a screen (or of one part, cut out of its screen) as the app draws it, to check your work by eye: alignment, spacing, overflow, contrast, anything missing. With scenario (a mock scenario's id, \"\" for the normal answers) the screen is drawn as the preview shows it: its data loaded from the mocks, lists repeated, words bound, each region in the state its data is in; the result says what each data source got. With state, the regions (or the one named by region) are drawn in that state (loading, empty, error, forbidden, ready). Open selects, menus and date pickers hang over the parts below them on the canvas by design; leave the layout as it is. The picture uses a fallback face a little wider than the real one, so a word cut short at the end of a tight line may be only the picture: check the outline before changing it.",
  input: obj(
    {
      id: str("a screen id or a part id"),
      scale: { type: "number", minimum: 0.25, maximum: 2, description: "1 = one pixel per dp (the default)" },
      scenario: str('draw the screen with its mock data under this scenario (get_mocks lists them; "" for the normal answers)'),
      params: { type: "object", description: "the params the screen is opened with, under a scenario (an id from the mocks is used when left out)" },
      state: { type: "string", enum: [...REGION_STATES], description: "draw the regions in this state" },
      region: str("with state: only this region (its container's id)"),
    },
    ["id"],
  ),
  output: "a PNG; under a scenario also {data: what each source got and the state each region shows}",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    const s = env.store.get();
    const isScreen = s.doc.frames.some((f) => f.id === a.id);
    const isPart = !isScreen && s.doc.groups.some((g) => g.items.some((it) => it.id === a.id));
    if (!isScreen && !isPart) throw new ToolFailure("not_found", `There is no screen or part ${JSON.stringify(a.id)}.`, "list_screens gives the screens' ids.");
    const widths = env.store.ctx(env.origin).widths;
    const screen = isScreen ? a.id : describeNode(s.doc as Doc, widths, a.id)?.screen?.id;
    let doc: Doc | undefined;
    let drawWidths: Record<string, number> | undefined;
    let data: unknown;
    if (a.scenario !== undefined || a.state) {
      if (!screen) throw new ToolFailure("not_found", `${JSON.stringify(a.id)} is on no screen.`, "Name a screen.");
      const { previewScreen, regionsShowing } = await import("../bindings/headless");
      doc = s.doc as Doc;
      if (a.scenario !== undefined) {
        try {
          const out = await previewScreen(doc, screen, { scenario: a.scenario === "normal" ? "" : a.scenario, params: a.params, lang: env.store.options.lang(), widths });
          /* laid out once here, as the canvas lays out what it shows, before whoever draws it measures it again */
          const { laidOut } = await import("../core/ops/common");
          drawWidths = { ...widths, ...out.widths };
          doc = laidOut({ ...s, doc: out.doc as CoreState["doc"], session: { ...s.session, widths: drawWidths } }, drawWidths).doc as Doc;
          data = out.report;
        } catch (e) {
          throw new ToolFailure("not_found", e instanceof Error ? e.message : String(e), "get_mocks lists the scenarios.");
        }
      }
      if (a.state) {
        const shown = regionsShowing(doc, screen, a.state, { region: a.region, widths: drawWidths ?? widths });
        if (!shown.regions.length) throw new ToolFailure("not_found", a.region ? `${JSON.stringify(a.region)} is no region on ${screen}.` : `The screen ${screen} has no region (set_region or wire_screen makes one).`, "describe_bindings lists a screen's regions.");
        doc = shown.doc;
      }
    }
    if (!env.renderer) {
      if (data) return { result: { id: a.id, data, note: "No picture can be taken here; this is what the screen got." } };
      throw new ToolFailure("unavailable", "Pictures cannot be taken here (no renderer).", "Read the outline instead.");
    }
    let skipped: string[] = [];
    const png = await env.renderer.screenshot(a.id, { scale: a.scale, signal: env.signal, onSkipped: (urls) => (skipped = urls), ...(doc ? { doc, widths: drawWidths ?? widths } : {}) });
    const left = skipped.length ? { skipped: skipped.map((u) => (u.length > 120 ? `${u.slice(0, 120)}…` : u)), note: `${skipped.length === 1 ? "A picture" : `${skipped.length} pictures`} would not load and ${skipped.length === 1 ? "is" : "are"} drawn as a grey patch. Only pictures drawn into the document (data: URLs) and the project's own are sure to show: replace outside addresses with generate_image, an icon, or an empty image placeholder.` } : {};
    return { result: { id: a.id, kind: isScreen ? "screen" : "part", ...(data ? { data } : {}), ...(a.state ? { state: a.state } : {}), ...left }, images: [png] };
  },
});

export const READ_TOOLS: Tool<never>[] = [getOutline, listScreens, findNodes, describeNodeTool, getSelection, listParts, describePart, listKits, listTemplates, listStyles, getStyle, lookReference, listIcons, listComponents, listData, screenshot] as unknown as Tool<never>[];
