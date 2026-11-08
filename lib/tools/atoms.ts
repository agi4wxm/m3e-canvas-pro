/* A short reference of the parts a model builds with most (the atoms, and the bars and rows every app has): each prop
 * and the values it takes, and the places a tap can be set on, written from the parts registry so it never drifts
 * from it. It goes into the in-app agent's system prompt, which the provider caches, so a turn starts building
 * instead of looking the same few parts up with describe_part each time; describe_part stays for the rest. */

import { defaultValues, partBySlug } from "../../parts/registry";
import { choiceValueOf } from "../../parts/labels";
import type { PartDef, PropDef } from "../../parts/types";
import { FIELD_STATES } from "../../parts/fieldState";
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

/** a range in a few characters: 40–960, ≥2, ≤8, or nothing */
function range(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `≥${min}`;
  return max !== undefined ? `≤${max}` : "";
}

/** One part in a line: its props grouped by kind, enums with their choices, numbers with the range they take and
 *  lists with how many rows (a value outside is refused, which costs a round trip), then its tap places. */
export function partLine(def: PartDef): string {
  const values = defaultValues(def);
  /* its field states in one word each, under their own names (parts/fieldState.ts): every input has the same ones */
  const states = FIELD_STATES.filter((s) => def.field?.[s] === s);
  const props = def.props.filter((d) => !SKIP.has(d.key) && d.key !== "ariaLabel" && !(states as string[]).includes(d.key));
  const of = (kind: PropDef["kind"]) => props.filter((d) => d.kind === kind).map((d) => d.key);
  const enums = props.filter((d): d is Extract<PropDef, { kind: "enum" }> => d.kind === "enum").map((d) => `${d.key} ${choices(d, values[d.key])}`);
  const lists = props
    .filter((d): d is Extract<PropDef, { kind: "list" }> => d.kind === "list")
    .map((d) => {
      const rows = range(d.min, d.max);
      return `${d.key}${rows ? ` (${rows} rows)` : ""} [{label${d.icons ? ", icon" : ""}${d.images ? ", image" : ""}${(d.fields ?? []).map((f) => `, ${f.key}`).join("")}}]`;
    });
  const numbers = props.filter((d): d is Extract<PropDef, { kind: "number" }> => d.kind === "number").map((d) => [d.key, range(d.min, d.max)].filter(Boolean).join(" "));
  const bits = [
    of("text").length ? `words: ${of("text").join(", ")}` : "",
    of("icon").length ? `icon names: ${of("icon").join(", ")}` : "",
    of("image").length ? `picture: ${of("image").join(", ")}` : "",
    ...lists,
    ...enums,
    numbers.length ? `numbers: ${numbers.join(", ")}` : "",
    of("bool").length ? `true/false: ${of("bool").join(", ")}` : "",
    /* the whole package, some of it perhaps under older names that are listed with the words */
    FIELD_STATES.every((s) => def.field?.[s]) ? "field states" : states.length ? `states: ${states.join("/")}` : "",
    def.props.some((d) => d.key === "ariaLabel") ? "ariaLabel" : "",
  ].filter(Boolean);
  const taps = tapsOf(def);
  return `- ${def.slug}: ${bits.join("; ")}${taps ? `. Tap places: ${taps}` : ""}`;
}

/** The reference as the system prompt carries it. */
export function atomsReference(slugs: readonly string[] = REFERENCE_PARTS): string {
  const lines = slugs.map((s) => partBySlug(s)).filter((d): d is PartDef => !!d).map(partLine);
  return [
    "## The parts used most: every prop with the values it takes (enum choices with the default first, number ranges, rows a list takes) and the tap places",
    "These lines hold what describe_part would say about these parts' props: build with them straight away, without describing them first; describe_part is for other parts and kits. A part with no tap places takes one tap on the whole part (set_action without slot); with places, set_action {slot} or set_item {actions: {place: …}}. Sizes are dp.",
    "field states: the true/false disabled, readOnly, required, loading, error and the words errorText and helperText (a form sets error, errorText and required itself). ariaLabel: the name a screen reader says where the part shows no words.",
    ...lines,
  ].join("\n");
}
