import { isColorRef, tidyLook } from "./look";
import { uniformRadii, type Doc, type DocVar, type Frame, type Item, type VarCollection, type VarValue } from "./tokens";
import { fieldVarOf } from "./bindings/bind";

/* Variables the way Figma has them: collections of typed variables (color, number, words, on/off), each collection with
 * modes (light and dark, compact and roomy) and a value of every variable in each mode. Which mode shows is chosen for
 * the document and, over that, for a screen; a collection can also follow the app's dark mode. A field of the design
 * (a fill, a stroke, the opacity, a corner radius) is bound to a variable with an `@field` key in `Item.bind` (by its
 * key: `"@fill": "=vars[\"v-brand\"]"`, lib/bindings/bind.ts `fieldVarOf`), beside
 * the props bound by their own keys, and drawn with the variable's value in the mode on show: on the canvas, in the
 * preview, in a saved picture and in the exported app.
 *
 * A document from before collections keeps working as it was: its variables have no `collection`, belong to the default
 * one, and that has a single mode whose values are their `value`. */

/** the collection a variable with none named belongs to */
export const DEFAULT_COLLECTION = "vars";
/** the first mode of the default collection, until it is given others */
export const DEFAULT_MODE = "default";

/** the design fields a variable can be bound to, and the kind of value each takes */
export const BIND_FIELDS = { "@fill": "color", "@text": "color", "@stroke": "color", "@opacity": "number", "@radius": "number", "@rotation": "number" } as const;
export type BindField = keyof typeof BIND_FIELDS;
export const isBindField = (key: string): key is BindField => key in BIND_FIELDS;

/** Every collection of the document: the ones it lists, and the default one wherever a variable needs it. The default
 *  one is listed only once it has been changed (named, given modes). */
export function collectionsOf(doc: Pick<Doc, "vars" | "varCollections">): VarCollection[] {
  const listed = Array.isArray(doc.varCollections) ? doc.varCollections : [];
  if (listed.some((c) => c.id === DEFAULT_COLLECTION)) return listed;
  const needed = !listed.length || (doc.vars ?? []).some((v) => !v.collection || !listed.some((c) => c.id === v.collection));
  return needed ? [{ id: DEFAULT_COLLECTION, name: "", modes: [{ id: DEFAULT_MODE, name: "" }] }, ...listed] : listed;
}

/** the collection a variable belongs to, by id: one that names a collection no longer there is in the default one */
export function collectionIdOf(v: DocVar, collections: VarCollection[]): string {
  return v.collection && collections.some((c) => c.id === v.collection) ? v.collection : DEFAULT_COLLECTION;
}

/** a variable's value in a mode: its own `value` in the first mode of its collection, else what it says for that mode */
export function valueIn(v: DocVar, mode: string, c: VarCollection | undefined): VarValue {
  if (!c || c.modes[0]?.id === mode) return v.value;
  const own = v.modes?.[mode];
  return own === undefined ? v.value : own;
}

/** The mode of a collection on show: the screen's own choice, else the document's, else the one the collection uses in
 *  dark mode while the app is dark, else its first. A choice of a mode the collection no longer has counts for nothing. */
export function modeFor(doc: Pick<Doc, "varModes">, c: VarCollection, frame?: Pick<Frame, "varModes"> | null, dark?: boolean): string {
  const has = (id: string | undefined) => !!id && c.modes.some((m) => m.id === id);
  const own = frame?.varModes?.[c.id];
  if (has(own)) return own!;
  const docs = doc.varModes?.[c.id];
  if (has(docs)) return docs!;
  if (dark && has(c.dark)) return c.dark!;
  return c.modes[0]?.id ?? DEFAULT_MODE;
}

/** every variable's value as a screen shows it (a screen of none: the document's modes) */
export function varValues(doc: Pick<Doc, "vars" | "varCollections" | "varModes">, frame?: Pick<Frame, "varModes"> | null, dark?: boolean): Record<string, VarValue> {
  const vars = Array.isArray(doc.vars) ? doc.vars : [];
  if (!vars.length) return {};
  const collections = collectionsOf(doc);
  const modes = new Map(collections.map((c) => [c.id, { c, mode: modeFor(doc, c, frame, dark) }]));
  return Object.fromEntries(
    vars.map((v) => {
      const at = modes.get(collectionIdOf(v, collections));
      return [v.id, at ? valueIn(v, at.mode, at.c) : v.value];
    }),
  );
}

/** whether any part binds a design field: until one does, nothing need be worked out for the drawing */
export const bindsFields = (it: Item) => !!it.bind && Object.keys(it.bind).some(isBindField);

const asNumber = (v: VarValue | undefined): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : typeof v === "boolean" ? (v ? 1 : 0) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** The part with the design fields it binds drawn with the values given: a fill, the words' color, a stroke, the
 *  opacity, the corner radius and the rotation. A value of the wrong kind leaves the field as the part has it. With
 *  `cssVar`, a field names the CSS variable an exported app paints it with (`--m3e-v-<name>`, set by its runtime), the
 *  value given standing in until that is defined. The same item comes back when nothing is bound. */
export function boundItem(it: Item, values: Record<string, VarValue>, cssVar?: (varId: string, field: BindField) => string | undefined): Item {
  if (!bindsFields(it)) return it;
  let look = it.look ? { ...it.look } : {};
  let corners = it.corners;
  let changed = false;
  for (const [key, bind] of Object.entries(it.bind!)) {
    if (!isBindField(key)) continue;
    const id = fieldVarOf(bind);
    if (id === undefined) continue;
    const v = values[id];
    if (v === undefined) continue;
    const name = cssVar?.(id, key);
    const named = name ? { cssVar: name } : {};
    if (BIND_FIELDS[key] === "color") {
      if (!isColorRef(v)) continue;
      changed = true;
      if (key === "@fill") look = { ...look, fills: [{ type: "solid", color: v, ...named }] };
      else if (key === "@text") look = { ...look, text: { ...look.text, color: v, ...named } };
      else look = { ...look, stroke: { ...(look.stroke ?? { width: 1 }), color: v, ...named } };
      continue;
    }
    const n = asNumber(v);
    if (n === undefined) continue;
    changed = true;
    const field = key === "@opacity" ? "opacity" : key === "@rotation" ? "rotate" : "radius";
    if (name) look = { ...look, vars: { ...look.vars, [field]: name } };
    if (key === "@opacity") look = { ...look, opacity: Math.max(0, Math.min(100, n)) };
    else if (key === "@rotation") look = { ...look, rotate: Math.max(-360, Math.min(360, n)) };
    else corners = uniformRadii(Math.max(0, Math.min(999, n)));
  }
  return changed ? { ...it, look: tidyLook(look), corners } : it;
}

/** A name a variable can be called by in CSS: its own words where they will do, else its id, always the same for the
 *  same variable. */
export const cssNameOf = (v: Pick<DocVar, "id" | "name">) => {
  const words = v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const id = v.id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (/^[a-z]/.test(words) ? `${words}-${id}` : `v-${id}`).slice(0, 40).replace(/-+$/, "");
};

/** the value a new variable of a type starts at */
export const startValueOf = (type: DocVar["type"]): VarValue => (type === "text" ? "" : type === "number" ? 0 : type === "bool" ? false : "#6750a4");

/** whether a value is one a variable of the type can hold */
export function fitsType(value: unknown, type: DocVar["type"]): value is VarValue {
  if (type === "color") return isColorRef(value);
  if (type === "text") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "boolean";
}
