/* What a model means by the names it reaches for first: a tap place called after the prop that shows it (an app bar's
 * `leading` is its `icon` place), a row by its number or words, and a few prop names every model guesses (a button's
 * `text`, an image's `url`). Read as meant before an operation checks them, so a near miss costs no round trip; what
 * is not near anything is left for the operation to refuse with its own error. Shared by the in-app agent and MCP. */

import { defaultValues, partBySlug } from "../../parts/registry";
import { colorRowsOf, colorValue } from "../../parts/color";
import { COLOR_WORDS_6 } from "../converge";
import { actionSlotsOf, type Item } from "../tokens";
import { opByName, type CoreState } from "../core";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** prop names models write for a part's own, by part: alias → the prop */
const PROP_ALIASES: Record<string, Record<string, string>> = {
  text: { content: "text", value: "text", label: "text", variant: "style" },
  button: { text: "label", title: "label" },
  "icon-button": { name: "icon", ariaLabel: "label" },
  icon: { icon: "name", glyph: "name", symbol: "name" },
  image: { url: "src", image: "src", source: "src", href: "src" },
  avatar: { src: "image", url: "image", text: "initials" },
  switch: { value: "checked", on: "checked" },
  checkbox: { value: "checked" },
  "app-bar": { leadingIcon: "leading", navigationIcon: "leading", trailingIcon: "trailing", actionIcon: "trailing", headline: "title" },
  fab: { text: "label" },
  /* the names these parts had before version 5 gave each idea one name (lib/converge.ts `PROP_RENAMES_5`); a rename that
     changed the unit too (a scene's frameMs) is no alias: its value would be read in the wrong unit */
  "text-field": { supporting: "helperText", supportingText: "helperText" },
  select: { supporting: "helperText" },
  field: { description: "helperText", error: "errorText" },
  "file-upload": { hint: "helperText" },
  dialog: { style: "variant" },
  search: { style: "variant" },
  "alert-dialog": { cancel: "dismiss", action: "confirm" },
  banner: { closable: "closeButton" },
  "notice-bar": { closable: "closeButton" },
  "item-cell": { selected: "pressed" },
  "number-ticker": { size: "style" },
};

/** A part's color props with the words its colors had before version 6 (lib/converge.ts `COLOR_WORDS_6`: `muted`,
 *  `default`, `none`…) read as the colors they drew, and a palette's colors given as words as its rows: one color value
 *  (parts/color.ts), whatever a model remembers. */
function colorsAliased(slug: string, props: Rec): Rec {
  const def = partBySlug(slug);
  if (!def) return props;
  let out: Rec | null = null;
  for (const d of def.props) {
    const v = props[d.key];
    if (typeof v !== "string") continue;
    const words = d.kind === "color" ? COLOR_WORDS_6[`${slug}.${d.key}`] : undefined;
    const meant = words && Object.prototype.hasOwnProperty.call(words, v) && colorValue(v) === undefined ? words[v] : d.kind === "list" && d.colors ? colorRowsOf(v) : undefined;
    if (meant === undefined) continue;
    out ??= { ...props };
    out[d.key] = meant;
  }
  return out ?? props;
}

/** a part's props with the names it does not have read as the ones meant, where the meant one is not given too */
export function propsAliased(slug: string, given: Rec): Rec {
  const def = partBySlug(slug);
  const props = colorsAliased(slug, given);
  const table = PROP_ALIASES[slug];
  if (!def || !table) return props;
  const has = (k: string) => def.props.some((d) => d.key === k);
  let out: Rec | null = null;
  for (const [k, v] of Object.entries(props)) {
    const to = table[k];
    if (!to || has(k) || !has(to) || to in props) continue;
    out ??= { ...props };
    delete out[k];
    out[to] = v;
  }
  return out ?? props;
}

/** The tap place a model means by `key` on a part, when the part has no place of that name: the place that shows the
 *  icon a prop of that name holds (an app bar's `leading` is its `icon`), the one whose label starts with it, a row by
 *  its number (`0`, `tab1`, `items[2]`) or by its words. Undefined when the key is a place already or nothing fits. */
export function slotAlias(it: Pick<Item, "component" | "props">, key: string): string | undefined {
  const slots = actionSlotsOf(it as Item);
  if (!slots.length || slots.some((s) => s.key === key)) return undefined;
  const def = partBySlug(it.component);
  const prop = def?.props.find((d) => d.key === key);
  if (def && prop?.kind === "icon") {
    const shows = it.props?.[key] ?? defaultValues(def)[key];
    const hit = slots.filter((s) => s.value && s.value === shows);
    if (hit.length === 1) return hit[0].key;
  }
  const k = norm(key);
  if (k) {
    const byLabel = slots.filter((s) => norm(s.label).startsWith(k));
    if (byLabel.length === 1) return byLabel[0].key;
  }
  const n = /^(?:[a-z]+)?[[\-_: ]?(\d+)\]?$/i.exec(key.trim());
  if (n) {
    const row = slots.find((s) => /:\d+$/.test(s.key) && s.key.endsWith(`:${Number(n[1])}`));
    if (row) return row.key;
  }
  const byWords = slots.filter((s) => s.label.trim().toLowerCase() === key.trim().toLowerCase());
  return byWords.length === 1 ? byWords[0].key : undefined;
}

/** a `{slot: action}` map with each slot read as meant */
function actionsAliased(it: Pick<Item, "component" | "props">, actions: Rec): Rec {
  let out: Rec | null = null;
  for (const k of Object.keys(actions)) {
    const to = slotAlias(it, k);
    if (!to || to in actions) continue;
    out ??= { ...actions };
    out[to] = out[k];
    delete out[k];
  }
  return out ?? actions;
}

const itemOf = (s: CoreState, id: unknown): Item | undefined => (typeof id === "string" ? s.doc.groups.flatMap((g) => g.items).find((it) => it.id === id) : undefined);

/** an add_tree node and what it holds, with each part's props read as meant */
function treeAliased(n: unknown): unknown {
  if (!isRec(n) || typeof n.part !== "string") return n;
  const props = isRec(n.props) ? propsAliased(n.part, n.props) : n.props;
  const kids = Array.isArray(n.children) ? n.children.map(treeAliased) : n.children;
  return props === n.props && kids === n.children ? n : { ...n, ...(props !== undefined ? { props } : {}), ...(kids !== undefined ? { children: kids } : {}) };
}

/** names models give the one part an operation works on */
const ID_ALIASES = ["itemId", "nodeId", "partId", "part", "node", "target"];

/** The one part an operation takes as `id`, given the way models give it: as a list of one (`ids`, which most
 *  operations on parts take), or under another name; a list as `ids` given one `id`. What the schema has, or a list of
 *  more than one, is left for the operation to refuse. */
export function idAliased(name: string, args: Rec, s: CoreState): Rec {
  const schema = opByName(name)?.args as { properties?: Rec; required?: string[] } | undefined;
  const props = schema?.properties ?? {};
  const required = schema?.required ?? [];
  /* only where the part is what the operation is about (set_props, split_into_atoms), not a name for a new one */
  const takesId = required.includes("id") && !("ids" in props);
  const takesIds = required.includes("ids") && !("id" in props);
  if (takesId && args.id === undefined) {
    if (Array.isArray(args.ids) && args.ids.length === 1 && typeof args.ids[0] === "string") {
      const { ids, ...rest } = args;
      return { ...rest, id: ids[0] };
    }
    const alias = ID_ALIASES.find((k) => typeof args[k] === "string" && !(k in props));
    if (alias) {
      const { [alias]: id, ...rest } = args;
      return { ...rest, id };
    }
    /* "split this": the one part selected */
    const sel = s.session.selection;
    if (name === "split_into_atoms" && sel.length === 1) return { ...args, id: sel[0] };
  }
  if (takesIds && args.ids === undefined && typeof args.id === "string") {
    const { id, ...rest } = args;
    return { ...rest, ids: [id] };
  }
  return args;
}

/** An operation's arguments with the names a model got nearly right read as meant, against the state it runs on. */
export function withAliases(name: string, given: Rec, s: CoreState): Rec {
  const args = idAliased(name, given, s);
  switch (name) {
    case "add_part":
      return typeof args.slug === "string" && isRec(args.props) ? { ...args, props: propsAliased(args.slug, args.props) } : args;
    case "add_tree":
      return isRec(args.tree) ? { ...args, tree: treeAliased(args.tree) } : args;
    case "set_props": {
      const it = itemOf(s, args.id);
      return it && isRec(args.props) ? { ...args, props: propsAliased(it.component ?? "", args.props) } : args;
    }
    case "set_item": {
      const it = itemOf(s, args.id);
      if (!it || !isRec(args.patch)) return args;
      const p = args.patch;
      const props = isRec(p.props) ? propsAliased(it.component ?? "", p.props) : p.props;
      const actions = isRec(p.actions) ? actionsAliased({ component: it.component, props: { ...it.props, ...(isRec(props) ? props : {}) } }, p.actions) : p.actions;
      return props === p.props && actions === p.actions ? args : { ...args, patch: { ...p, ...(props !== undefined ? { props } : {}), ...(actions !== undefined ? { actions } : {}) } };
    }
    case "set_action": {
      const it = itemOf(s, args.id);
      const to = it && typeof args.slot === "string" ? slotAlias(it, args.slot) : undefined;
      return to ? { ...args, slot: to } : args;
    }
    default:
      return args;
  }
}
