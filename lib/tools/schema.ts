/* The JSON Schema a tool is described with: a part's props as a schema (from its PropDefs, so a new part is described
 * the moment it is registered), and the shallow `object` arguments of some operations spelled out, so a model sees the
 * fields it may write. The operations still check every value themselves (lib/core/ops/validate.ts): these schemas
 * describe, they leave unknown keys to the operation's own, better, error. */

import { choiceValueOf } from "../../parts/labels";
import { FLOW_PROPS } from "../../parts/flow";
import type { PartDef, PropDef } from "../../parts/types";
import { COLOR_TOKENS, FONTS, ICON_FAMILIES, TEXT_TOKENS } from "../tokens";
import type { Schema } from "../core";

const nullable = (s: Schema): Schema => ({ ...s, type: [...(Array.isArray(s.type) ? s.type : [s.type]), "null"], ...(Array.isArray(s.enum) ? { enum: [...s.enum, null] } : {}) });

/** one prop as JSON Schema */
export function propSchema(d: PropDef): Schema {
  const description = d.label;
  switch (d.kind) {
    case "text":
      return { type: "string", description };
    case "icon":
      return { type: "string", description: `${description}: a Material Symbols name in snake_case ("" for none)` };
    case "enum":
      return { type: "string", enum: d.options.map(choiceValueOf), description };
    case "bool":
      return { type: "boolean", description };
    case "number":
      return { type: "number", minimum: d.min, maximum: d.max, description: d.unit ? `${description} (${d.unit})` : description };
    case "image":
      return { type: "string", description: `${description}: a picture drawn into the document, a data:image URL (generate_image paints one; outside https: addresses are refused), or "" for none` };
    case "list": {
      const row: Record<string, Schema> = { label: { type: "string" } };
      if (d.icons) row.icon = { type: "string", description: "a Material Symbols name" };
      if (d.images) row.image = { type: "string" };
      for (const f of d.fields ?? []) row[f.key] = { type: "string" };
      return { type: "array", items: { type: "object", properties: row, required: ["label"] }, ...(d.min !== undefined ? { minItems: d.min } : {}), ...(d.max !== undefined ? { maxItems: d.max } : {}), description };
    }
    case "table":
      return { type: "object", properties: { columns: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } }, required: ["columns", "rows"], description };
  }
}

/** every prop of a part as one object schema, closed: a key it does not have is not one of its props */
export const partPropsSchema = (def: PartDef): Schema => ({ type: "object", properties: Object.fromEntries(def.props.map((d) => [d.key, propSchema(d)])), additionalProperties: false });

const FILL = COLOR_TOKENS.map((t) => t.key);
const TEXT = TEXT_TOKENS.map((t) => t.key);
const wh = (items: Schema): Schema => ({ type: "object", properties: { w: items, h: items } });

/** what a look is, said briefly; look_reference has all of it */
const LOOK = "effects: fills, stroke, shadows, elevation, opacity, blur, glass, blend, filter, rotate, transform, text, texture (see look_reference; on a document held to its style only opacity, rotate, transform, blur, blend and elevation stay)";

const ACTION: Schema = {
  type: "object",
  description: "what a tap does",
  properties: {
    to: { type: "string", description: 'a screen id, "back", "link" (with url) or "none" (effects only, the default)' },
    transition: { type: "string", enum: ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"] },
    url: { type: "string" },
    effects: {
      type: "array",
      description: "{do: show|hide|toggle|open|close, part} | {do: setVar, var, value} | {do: toggleVar, var} | {do: addVar, var, by} | {do: setProp, part, prop, value} | {do: snackbar, message}",
      items: { type: "object", properties: { do: { type: "string", enum: ["show", "hide", "toggle", "open", "close", "setVar", "toggleVar", "addVar", "setProp", "snackbar"] } }, required: ["do"] },
    },
    when: { type: "object", description: "{var, op: eq|neq, value} or {filled: a text field's part id}" },
    else: { type: "object", description: "the action taken when `when` does not hold" },
  },
};

/** the patch of a part's own fields (set_item) */
const ITEM_PATCH: Schema = {
  type: "object",
  description: "the fields to set; null clears one",
  properties: {
    props: { type: "object", description: "prop values over what the part has (describe_part lists them)" },
    fill: nullable({ type: "string", enum: FILL, description: "the surface's color role" }),
    textColor: nullable({ type: "string", enum: TEXT, description: "the words' color role" }),
    corners: nullable({ type: "object", properties: { tl: { type: "number" }, tr: { type: "number" }, bl: { type: "number" }, br: { type: "number" } }, description: "four corner radii in dp (not on a document held to its style)" }),
    look: nullable({ type: "object", description: LOOK }),
    note: nullable({ type: "string", description: "what the part does, for the prompt" }),
    action: nullable(ACTION),
    actions: nullable({ type: "object", description: "{slot: action} for parts with places of their own (describe_node lists its slots)" }),
    flowSize: nullable(wh({ type: "string", enum: ["fixed", "hug", "fill"] })),
    alignSelf: nullable({ type: "string", enum: ["start", "center", "end", "stretch", "baseline"] }),
    flowAbsolute: nullable({ type: "boolean", description: "out of its container's layout, drawn over it" }),
    flowMin: nullable(wh({ type: "number", minimum: 0 })),
    flowMax: nullable(wh({ type: "number", minimum: 0 })),
    flowSpan: nullable({ type: "integer", minimum: 1, maximum: 12, description: "grid columns it spans" }),
  },
};

const THEME_PATCH: Schema = {
  type: "object",
  description: "theme fields; a document held to its style takes only dark, bothModes and contrast",
  properties: {
    dark: { type: "boolean" },
    bothModes: { type: "boolean", description: "the app has light and dark" },
    contrast: { type: "string", enum: ["standard", "medium", "high"] },
    shape: { type: "string", enum: ["none", "square", "soft", "rounded", "full"] },
    font: { type: "string", enum: FONTS.map((f) => f.key) },
    displayFont: { type: "string", enum: FONTS.map((f) => f.key) },
    motion: { type: "string", enum: ["standard", "expressive"] },
    emphasized: { type: "boolean" },
    icons: { type: "string", enum: [...ICON_FAMILIES], description: "the icon family the parts draw with" },
    recipes: { type: "object", description: "how each kind of control is built (get_style lists the recipes)" },
  },
};

const SCREEN_PATCH: Schema = {
  type: "object",
  description: "null clears a field",
  properties: {
    name: nullable({ type: "string" }),
    bg: nullable({ type: "string", enum: FILL, description: "the screen's background role" }),
    note: nullable({ type: "string", description: "what the screen is for" }),
    swipe: nullable({ type: "object", description: "{left|right|up|down: screen id}" }),
    deviceBars: nullable({ type: "boolean", description: "draw the phone's status and gesture bars" }),
    backgroundImage: nullable({ type: "string", description: "a tracing image under the screen" }),
    backgroundOpacity: nullable({ type: "number", minimum: 0, maximum: 100 }),
  },
};

const LAYOUT_PROPS: Schema = { type: "object", description: "the layout props to set", properties: Object.fromEntries(FLOW_PROPS.filter((d) => d.key !== "layout").map((d) => [d.key, propSchema(d)])) };

const UX_PATCH: Schema = {
  type: "object",
  properties: {
    margin: { type: "number", minimum: 0, description: "px between a screen's edge and its parts" },
    gap: { type: "number", minimum: 0, description: "px between the sections of a screen" },
    tight: { type: "number", minimum: 0, description: "px between rows of a kind" },
    nav: { type: "string", enum: ["keep", "bottom", "rail", "top"], description: "where the navigation stands" },
    place: { type: "string", enum: ["top", "center", "bottom", "spread"] },
  },
};

const HEX = { type: "string", description: "#rrggbb" };
const PALETTE: Schema = nullable({ type: "object", description: "hex colors for the roles: primary, onPrimary, primaryContainer, secondary, surface, onSurface… (null clears it)", properties: { primary: HEX, secondary: HEX, tertiary: HEX, surface: HEX } });

/** an argument schema of an operation spelled out further: (operation name, the path of the argument) → its schema */
const DEEPER: Record<string, Record<string, Schema>> = {
  set_item: { patch: ITEM_PATCH },
  set_theme: { patch: THEME_PATCH },
  set_screen: { patch: SCREEN_PATCH },
  set_layout: { props: LAYOUT_PROPS },
  set_style_layout: { patch: UX_PATCH },
  set_custom_palette: { palette: PALETTE },
  set_action: { action: nullable(ACTION) },
  add_part: { props: { type: "object", description: "prop values over the part's defaults (describe_part lists them)" } },
  set_props: { props: { type: "object", description: "prop values to set, null resets one (describe_part or describe_node lists them)" } },
};

/** an operation's arguments as a tool takes them */
export function opInput(name: string, args: Schema): Schema {
  const more = DEEPER[name];
  if (!more) return args;
  const props = { ...(args.properties as Record<string, Schema>) };
  for (const [k, s] of Object.entries(more)) {
    const was = props[k] ?? {};
    props[k] = { ...s, ...(was.description && !s.description ? { description: was.description } : {}) };
  }
  return { ...args, properties: props };
}
