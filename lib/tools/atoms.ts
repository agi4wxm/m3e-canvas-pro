/* A short reference of the parts a model builds with most (the atoms, and the bars and rows every app has): each prop
 * and the values it takes, and the places a tap can be set on, written from the parts registry so it never drifts
 * from it. It goes into the in-app agent's system prompt, which the provider caches, so a turn starts building
 * instead of looking the same few parts up with describe_part each time; describe_part stays for the rest. */

import { defaultValues, partBySlug } from "../../parts/registry";
import { choiceValueOf } from "../../parts/labels";
import type { PartDef, PropDef } from "../../parts/types";
import { actionSlotsOf, makeItem, type Item } from "../tokens";

/** the parts the reference covers, in the order a screen is usually built from them */
export const REFERENCE_PARTS = [
  "box", "text", "icon", "image", "svg", "button", "icon-button", "input", "textarea", "switch", "checkbox", "radio", "slider", "chip", "avatar", "badge", "progress", "separator",
  "app-bar", "navigation-bar", "tabs", "item", "card", "fab",
] as const;

/** a prop the reference leaves out: how the editor keeps a part, not something a model sets */
const SKIP = new Set(["seed"]);

/** one enum's choices, the default first */
function choices(d: Extract<PropDef, { kind: "enum" }>, def: unknown): string {
  const values = d.options.map(choiceValueOf);
  return [...values.filter((v) => v === def), ...values.filter((v) => v !== def)].join("|");
}

/** the places a tap can be set on, in words */
function tapsOf(def: PartDef): string {
  const it = { ...makeItem(def.slug), props: { ...defaultValues(def) } } as Item;
  const slots = actionSlotsOf(it);
  if (!slots.length) return "";
  const rows = slots.filter((s) => /:\d+$/.test(s.key));
  const named = slots.filter((s) => !/:\d+$/.test(s.key));
  const list = def.props.find((d) => d.kind === "list")?.key ?? "items";
  return [
    ...named.map((s) => `${s.key} (${s.label.toLowerCase()})`),
    ...(rows.length ? [`${rows[0].key.replace(/\d+$/, "")}0, ${rows[0].key.replace(/\d+$/, "")}1… (one per row of ${list})`] : []),
  ].join(", ");
}

/** one part in a line: its props grouped by kind, enums with their choices, then its tap places */
export function partLine(def: PartDef): string {
  const values = defaultValues(def);
  const props = def.props.filter((d) => !SKIP.has(d.key));
  const of = (kind: PropDef["kind"]) => props.filter((d) => d.kind === kind).map((d) => d.key);
  const enums = props.filter((d): d is Extract<PropDef, { kind: "enum" }> => d.kind === "enum").map((d) => `${d.key} ${choices(d, values[d.key])}`);
  const lists = props.filter((d): d is Extract<PropDef, { kind: "list" }> => d.kind === "list").map((d) => `${d.key} [{label${d.icons ? ", icon" : ""}${d.images ? ", image" : ""}${(d.fields ?? []).map((f) => `, ${f.key}`).join("")}}]`);
  const bits = [
    of("text").length ? `words: ${of("text").join(", ")}` : "",
    of("icon").length ? `icon names: ${of("icon").join(", ")}` : "",
    of("image").length ? `picture: ${of("image").join(", ")}` : "",
    ...lists,
    ...enums,
    of("number").length ? `numbers: ${of("number").join(", ")}` : "",
    of("bool").length ? `true/false: ${of("bool").join(", ")}` : "",
  ].filter(Boolean);
  const taps = tapsOf(def);
  return `- ${def.slug}: ${bits.join("; ")}${taps ? `. Tap places: ${taps}` : ""}`;
}

/** The reference as the system prompt carries it. */
export function atomsReference(slugs: readonly string[] = REFERENCE_PARTS): string {
  const lines = slugs.map((s) => partBySlug(s)).filter((d): d is PartDef => !!d).map(partLine);
  return [
    "## The parts used most, with their props (enum choices default first) and tap places",
    "A part with no tap places takes one tap on the whole part (set_action without slot); with places, set_action {slot} or set_item {actions: {place: …}}. Sizes are dp. describe_part gives any other part.",
    ...lines,
  ].join("\n");
}
