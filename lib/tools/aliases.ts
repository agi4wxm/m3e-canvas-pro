/* What a model means by the names it reaches for first: a tap place called after the prop that shows it (an app bar's
 * `leading` is its `icon` place), a row by its number or words, and a few prop names every model guesses (a button's
 * `text`, an image's `url`). Read as meant before an operation checks them, so a near miss costs no round trip; what
 * is not near anything is left for the operation to refuse with its own error. Shared by the in-app agent and MCP. */

import { defaultValues, partBySlug } from "../../parts/registry";
import { actionSlotsOf, type Item } from "../tokens";
import type { CoreState } from "../core";

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
};

/** a part's props with the names it does not have read as the ones meant, where the meant one is not given too */
export function propsAliased(slug: string, props: Rec): Rec {
  const def = partBySlug(slug);
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

/** An operation's arguments with the names a model got nearly right read as meant, against the state it runs on. */
export function withAliases(name: string, args: Rec, s: CoreState): Rec {
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
