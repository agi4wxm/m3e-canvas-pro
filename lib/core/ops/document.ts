/* Operations on the document as a whole: its title, brief and prompt, its colors, its theme and style (with the kits
 * composed again and the parts held to the style's rules), whether it is screens or a blank canvas, and clearing it. */

import { kitLookOf, recomposeKits, sameKitLook } from "../../kits";
import type { KitLook } from "../../../parts/kits";
import { conformDoc, conformGroups } from "../../styleRules";
import { cleanStyles, isCustomKey, isStrict, styleContext, styleOf, stylePatch, withDocStyles, type CustomStyle, type StyleContext, type StyleUX } from "../../styles";
import { layoutForStyle } from "../../styleLayout";
import { normalizeTheme, PALETTES, type ComponentDef, type FrameMode, type Group, type Item, type Palette, type Theme } from "../../tokens";
import { t } from "../../i18n";
import { op, OpError, S, type OpCtx } from "../op";
import { withDoc, withSession, type CoreState } from "../state";
import { ensureScreen } from "./screens";

/** The document's kits composed again for a change of theme (lib/kits.ts `recomposeKits`): each one nobody has
 *  changed takes the composition the new look calls for, where it stands. Null when none changed. A definition open
 *  for editing has the document's own screens waiting: their kits follow too. */
export function recomposed(s: CoreState, from: Theme, to: Theme, ctx: OpCtx, fromLook?: KitLook): { state: CoreState; changed: boolean } {
  let state = s;
  let changed = false;
  if (s.editing) {
    const main = recomposeKits({ groups: s.editing.main.groups }, from, to, ctx.lang, { frames: s.editing.main.frames, widths: ctx.widths, fromLook });
    if (main.groups !== s.editing.main.groups) state = { ...state, editing: { ...s.editing, main: { ...s.editing.main, groups: main.groups } } };
  }
  const doc = { groups: s.doc.groups, components: s.doc.components };
  const out = recomposeKits(doc, from, to, ctx.lang, { frames: s.doc.frames, widths: ctx.widths, fromLook });
  if (out !== doc) {
    changed = true;
    state = { ...state, doc: { ...state.doc, groups: out.groups, ...(out.components ? { components: out.components } : {}) } };
  }
  return { state, changed };
}

/** how many parts a rewrite of the groups touched; it keeps every group and part in its place, so they are compared
 *  there. With `only`, just the parts given count. */
const changedItems = (before: Group[], after: Group[], only?: Set<Item>) =>
  before.reduce((n, g, i) => (after[i] === g ? n : n + g.items.filter((it, j) => after[i]?.items[j] !== it && (!only || only.has(it))).length), 0);

export const setTitle = op<{ title: string }>({
  name: "set_title",
  summary: "Sets the app's name.",
  args: S.obj({ title: S.str() }, ["title"]),
  label: () => "Title",
  run: (s, a) => ({ state: withDoc(s, { title: a.title }), history: "none" }),
});

export const setBrief = op<{ brief: string }>({
  name: "set_brief",
  summary: "Sets the brief: what the app is for, in the author's words; it goes into the prompt.",
  args: S.obj({ brief: S.str() }, ["brief"]),
  label: () => "Brief",
  run: (s, a) => ({ state: withDoc(s, { brief: a.brief }), history: "none" }),
});

/** the prompt panel's fields: the title and brief, the prompt rewritten by hand, the guidance lines switched on */
export const setPrompt = op<{ title?: string; brief?: string; promptEdit?: string | null; promptOptions?: string[] | null }>({
  name: "set_prompt",
  summary: "Sets the prompt's fields: title, brief, promptEdit (the prompt as rewritten by hand; null for the generated one), promptOptions (the guidance lines; null for the default set).",
  args: S.obj({ title: S.str(), brief: S.str(), promptEdit: { type: ["string", "null"] }, promptOptions: { type: ["array", "null"], items: { type: "string" } } }),
  label: () => "Prompt",
  run(s, a) {
    const patch: Record<string, unknown> = {};
    if (a.title !== undefined) patch.title = a.title;
    if (a.brief !== undefined) patch.brief = a.brief;
    if ("promptEdit" in a) patch.promptEdit = a.promptEdit ?? undefined;
    if ("promptOptions" in a) patch.promptOptions = a.promptOptions ?? undefined;
    return { state: withDoc(s, patch), history: "none" };
  },
});

/** Whatever asks, a theme held to its style stays what the style says. A change that composes kits another way
 *  (light and dark, the recipes, the face) composes the kits nobody has changed again, as one step that crosses the
 *  whole document; any other is no step of its own. */
export const patchTheme = op<{ patch: Partial<Theme> }, { recomposed: boolean }>({
  name: "set_theme",
  summary: "Changes the theme: dark, contrast (standard, medium, high), shape (none, square, soft, rounded, full), font, displayFont, motion, icons, recipes, emphasized, bothModes. Kits nobody changed are composed again when their look changes.",
  args: S.obj({ patch: S.any("theme fields") }, ["patch"]),
  label: () => "Theme",
  run(s, a, ctx) {
    const from = s.doc.theme;
    const styles = styleContext(s.doc.styles);
    const next = normalizeTheme({ ...from, ...a.patch }, styles);
    if (ctx.strict) {
      const strict = isStrict(from, styles) && from.style;
      const touched = Object.keys(a.patch).filter((k) => k !== "dark" && k !== "bothModes" && k !== "contrast");
      if (strict && touched.length) throw new OpError("refused", `The document is held to its style, which decides ${touched.join(", ")}: switch its rules off first (set_style_rules).`);
    }
    const kits = sameKitLook(from, next) ? null : recomposed(s, from, next, ctx);
    const state = withDoc(kits?.changed ? kits.state : s, { theme: next });
    return { state, result: { recomposed: !!kits?.changed }, history: kits?.changed ? "whole" : "none" };
  },
});

/** Puts a style on the document: its colors, its shapes, and its layout once its parts are measured in it. A style is
 *  a spec, so what the parts carry against it comes off; the result says how many parts that touched. One step. */
export const applyStyle = op<{ style: string; styles?: CustomStyle[] | null }, { stripped: number; together?: string[][] }>({
  name: "apply_style",
  summary: "Puts one of the style packs on the document (\"\" for Android's Material 3), or one of the document's own styles by its custom: key: its colors, shapes, faces, icons and control recipes; kits are composed its way and what the parts carry against its rules comes off. With styles, the document's own styles are replaced first, in the same step.",
  args: S.obj({ style: S.str("the style's key, as the style catalog names it (or a custom: key of the document's own styles); \"\" for Material"), styles: S.arr(S.any(), "the document's own styles to set first (lib/styles/custom.ts), or null for none", { type: ["array", "null"] }) }, ["style"]),
  label: (a) => `Style ${a.style || "Material"}`,
  run(before, a, ctx) {
    /* what the kits were composed for is read while the styles are as they were: the one worn may change with them */
    const fromLook = a.styles === undefined ? undefined : kitLookOf(before.doc.theme, styleContext(before.doc.styles));
    const s = a.styles === undefined ? before : withDoc(before, { styles: (ctx.strict ? cleanStyles(a.styles) : a.styles) ?? undefined });
    const styles = styleContext(s.doc.styles);
    /* composing the kits again reads a style further down without being handed one: in reach for this call too */
    return withDocStyles(styles, () => putStyle(s, a.style, ctx, fromLook, styles));
  },
});

/** apply_style's work, read in the document's own styles */
function putStyle(s: CoreState, style: string, ctx: OpCtx, fromLook: KitLook | undefined, styles: StyleContext) {
  if (style && !styleOf(style, styles)) throw new OpError("not_found", `There is no style "${style}".`, style);
  const from = s.doc.theme;
  const next = normalizeTheme({ ...from, ...stylePatch(style, styles) }, styles);
  /* the kits nobody has changed are composed the new style's way first, then everything is held to its rules */
  const kits = recomposed(s, from, next, ctx, fromLook);
  const base = kits.changed ? kits.state : s;
  const groups = conformGroups(base.doc.groups, next, styles);
  const defs = base.doc.components;
  const components = defs ? conformDoc({ groups: [] as Group[], components: defs }, next, styles).components : defs;
  /* what the author had on their parts and the rules took off; a kit composed anew had nothing of the author's on it */
  const had = new Set([...s.doc.groups, ...(s.doc.components ?? []).flatMap((c) => c.groups)].flatMap((g) => g.items));
  const stripped = changedItems(base.doc.groups, groups, had) + (defs ?? []).reduce((n, c, i) => n + changedItems(c.groups, components?.[i]?.groups ?? c.groups, had), 0);
  const state: CoreState = { ...base, doc: { ...base.doc, theme: next, groups, ...(components ? { components: components as ComponentDef[] } : {}) } };
  return { state: ctx.origin === "user" ? state : styled(state, ctx.widths), result: { stripped }, history: "whole" as const };
}

/** The document's own styles replaced (components/CustomStyleEditor.tsx: a style made, imported, edited or deleted).
 *  The style worn, when it is one of them, is worn as it now is: the theme takes what it changed of what picking it
 *  writes (the faces, the icons, the shapes, the motion), and the kits nobody has changed are composed its new way. A
 *  step of the whole document; the editor joins a run of edits to one style into one. */
export const setStyles = op<{ styles: CustomStyle[] | null }>({
  name: "set_custom_styles",
  summary: "Replaces the document's own styles (custom styles, each with a custom: key). The style the document wears, when it is one of them, is worn as it now is. To put one on, use apply_style.",
  args: S.obj({ styles: S.arr(S.any(), "the document's own styles (lib/styles/custom.ts), or null for none", { type: ["array", "null"] }) }, ["styles"]),
  label: () => "Styles",
  run(s, a, ctx) {
    const next = (ctx.strict ? cleanStyles(a.styles) : a.styles) ?? undefined;
    const from = s.doc.theme;
    /* what the kits were composed for, read while the style is still as it was */
    const was = styleContext(s.doc.styles);
    const now = styleContext(next);
    const fromLook = kitLookOf(from, was);
    const before = styleOf(from.style, was);
    const set = withDoc(s, { styles: next });
    /* composing the kits again reads a style further down without being handed one: in reach for this call too */
    return withDocStyles(now, () => {
      const after = styleOf(from.style, now);
      /* the style worn is as it was (another one changed): nothing on the document changes with it */
      if (after === before) return { state: set, history: "whole" as const };
      const patch: Partial<Theme> = {};
      if (isCustomKey(from.style) && before && after) {
        if (before.font !== after.font) patch.font = after.font;
        if (before.display !== after.display) patch.displayFont = after.display;
        if (before.icons !== after.icons) patch.icons = after.icons;
        if (before.shape !== after.shape) patch.shape = after.shape;
        if (before.motion !== after.motion) patch.motion = after.motion;
      }
      /* a new theme object either way: what is worked out from the style is worked out again */
      const to = normalizeTheme({ ...from, ...patch }, now);
      let state = withDoc(set, { theme: to });
      if (JSON.stringify(kitLookOf(to, now)) !== JSON.stringify(fromLook)) {
        const kits = recomposed(state, from, to, ctx, fromLook);
        if (kits.changed) state = withDoc(kits.state, { groups: conformGroups(kits.state.doc.groups, to, now) });
      }
      return { state, history: "whole" as const };
    });
  },
});

/** the screens laid out a style's way, for a document no editor will lay out after it is measured */
function styled(s: CoreState, widths: Record<string, number>): CoreState {
  const laid = layoutForStyle(s.doc.groups, s.doc.frames, widths, s.doc.theme, { pick: true, styles: styleContext(s.doc.styles) });
  return laid ? { ...s, doc: { ...s.doc, groups: laid.groups, frames: laid.frames } } : s;
}

/** Holds the document to its style's rules, or lets it go; coming back is putting the style on again. */
export const setRules = op<{ on: boolean }, { stripped: number }>({
  name: "set_style_rules",
  summary: "Holds the document to its style's rules (on), or lets its colors, shapes and looks be the author's (off).",
  args: S.obj({ on: S.bool() }, ["on"]),
  label: (a) => (a.on ? "Style rules on" : "Style rules off"),
  run(s, a, ctx) {
    if (a.on) return applyStyle.run(s, { style: s.doc.theme.style ?? "" }, ctx);
    return { state: withDoc(s, { theme: normalizeTheme({ ...s.doc.theme, strict: false }, styleContext(s.doc.styles)) }), result: { stripped: 0 }, history: "whole" };
  },
});

/** one of the style's layout settings changed (its navigation, its margins); the screens follow it */
export const patchUx = op<{ patch: Partial<StyleUX> }>({
  name: "set_style_layout",
  summary: "Changes one of the style's layout settings, and lays the screens out by it.",
  args: S.obj({ patch: S.any() }, ["patch"]),
  label: () => "Style layout",
  run(s, a, ctx) {
    const theme: Theme = { ...s.doc.theme, ux: { ...s.doc.theme.ux, ...a.patch } as Theme["ux"] };
    const laid = layoutForStyle(s.doc.groups, s.doc.frames, ctx.widths, theme, { pick: true, styles: styleContext(s.doc.styles) });
    const state = withDoc(s, { theme });
    return { state: laid ? { ...state, doc: { ...state.doc, groups: laid.groups, frames: laid.frames } } : state };
  },
});

/** One of the editor's color schemes. Colors picked after a style are the author's: the style keeps everything else. */
export const setPalette = op<{ key: string }>({
  name: "set_palette",
  summary: "Picks one of the editor's color schemes by key (purple, blue, green…), or \"custom\" for the document's own.",
  args: S.obj({ key: S.str() }, ["key"]),
  label: () => "Colors",
  run(s, a, ctx) {
    if (s.doc.theme.style && isStrict(s.doc.theme, styleContext(s.doc.styles))) throw new OpError("refused", "The document is held to its style, which decides its colors.");
    if (ctx.strict && a.key !== "custom" && !PALETTES.some((p) => p.key === a.key)) throw new OpError("not_found", `There is no color scheme "${a.key}" (${PALETTES.map((p) => p.key).join(", ")}).`, a.key);
    const state = withDoc(s, { paletteKey: a.key });
    return s.doc.theme.style ? patchTheme.run(state, { patch: { ownColors: true } }, ctx) : { state, history: "none" };
  },
});

export const setCustomPalette = op<{ palette: Palette | null }>({
  name: "set_custom_palette",
  summary: "Sets the document's own color scheme (hex colors for every role), or clears it.",
  args: S.obj({ palette: { type: ["object", "null"] } }, ["palette"]),
  label: () => "Colors",
  run(s, a, ctx) {
    if (s.doc.theme.style && isStrict(s.doc.theme, styleContext(s.doc.styles))) throw new OpError("refused", "The document is held to its style, which decides its colors.");
    if (ctx.strict && a.palette && Object.entries(a.palette).some(([k, v]) => k !== "key" && k !== "label" && (typeof v !== "string" || !/^#[0-9a-f]{3,8}$/i.test(v)))) throw new OpError("invalid_value", "A custom scheme holds hex colors only.");
    const state = withDoc(s, { customPalette: a.palette ?? undefined });
    return s.doc.theme.style ? patchTheme.run(state, { patch: { ownColors: true } }, ctx) : { state, history: "none" };
  },
});

export const setDynamicColor = op<{ on: boolean }>({
  name: "set_dynamic_color",
  summary: "Whether the app takes its colors from the user's wallpaper (Material You).",
  args: S.obj({ on: S.bool() }, ["on"]),
  label: () => "Dynamic color",
  run: (s, a) => ({ state: withDoc(s, { dynamicColor: a.on }), history: "none" }),
});

/** screens, or a blank canvas; screens with none there wrap what is on the canvas in one */
export const setFrameMode = op<{ mode: FrameMode; id?: string }>({
  name: "set_canvas_mode",
  summary: "Switches between screens (phone) and a blank canvas (blank).",
  args: S.obj({ mode: S.enum(["phone", "blank"]), id: S.str("an id for a screen made to hold what is there") }, ["mode"]),
  label: () => "Canvas mode",
  run(s, a, ctx) {
    if (s.editing) throw new OpError("refused", "A component is being edited.");
    if (s.doc.frame === a.mode) throw new OpError("nothing_to_do", `The canvas is ${a.mode === "phone" ? "screens" : "blank"} already.`);
    const state = withSession(withDoc(s, { frame: a.mode }), { frameId: null });
    return { state: a.mode === "phone" ? ensureScreen(state, ctx.widths, a.id ?? ctx.newId(), t("home", ctx.lang)) : state };
  },
});

/** Everything off the canvas; with a definition open, the definition emptied and its screen kept. */
export const clearAll = op<Record<string, never>>({
  name: "clear",
  summary: "Clears the canvas: every screen and part (with a component open, everything in it).",
  args: S.obj({}),
  label: () => "Clear",
  run(s) {
    if (s.editing) return { state: withSession({ ...s, doc: { ...s.doc, groups: [] } }, { selection: [] }) };
    if (!s.doc.groups.length && !s.doc.frames.length) throw new OpError("nothing_to_do", "The canvas is empty already.");
    return { state: withSession({ ...s, doc: { ...s.doc, groups: [], frames: [] } }, { selection: [], frameId: null }) };
  },
});
