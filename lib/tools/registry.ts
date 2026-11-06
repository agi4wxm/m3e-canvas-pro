/* The registry: every tool by name, the subsets a client is given by group, running a call with errors a model can act
 * on, the tools as the provider layer (lib/llm) and an MCP server describe them, and a short guide to using them,
 * written from the registry so it names exactly the tools there are. The generative tools (generate.ts) are not in it
 * by default: they need keys, so whoever has them adds them. */

import { OpError, schemaError, type DocStore } from "../core";
import type { ToolDef } from "../llm/types";
import { applyOps, OP_TOOLS } from "./ops";
import { READ_TOOLS } from "./read";
import { REFERENCE_TOOLS } from "./reference";
import { TOOL_GROUPS, ToolFailure, type Tool, type ToolEnv, type ToolError, type ToolGroup, type ToolOutcome } from "./types";

/** every tool that needs nothing but a document: reading, building, styling, data */
export const CORE_TOOLS: Tool<never>[] = [...READ_TOOLS, ...REFERENCE_TOOLS, applyOps as unknown as Tool<never>, ...(OP_TOOLS as unknown as Tool<never>[])];

export type Registry = {
  tools: Tool<never>[];
  byName: (name: string) => Tool<never> | undefined;
};

/** A registry of the core tools and any others given (the generative ones), cut down to some groups, or to some
 *  names. A name in two lists is the later one's. */
export function createRegistry(o: { extra?: Tool<never>[]; groups?: readonly ToolGroup[]; only?: readonly string[]; readOnly?: boolean } = {}): Registry {
  const all = new Map<string, Tool<never>>();
  for (const t of [...CORE_TOOLS, ...(o.extra ?? [])]) all.set(t.name, t);
  const tools = [...all.values()].filter((t) => (!o.groups || o.groups.includes(t.group)) && (!o.only || o.only.includes(t.name)) && (!o.readOnly || t.readOnly));
  const map = new Map(tools.map((t) => [t.name, t]));
  return { tools, byName: (name) => map.get(name) };
}

export const CORE_REGISTRY = createRegistry();

/** the tools as a model is given them */
export const toolDefs = (tools: Tool<never>[]): ToolDef[] => tools.map((t) => ({ name: t.name, description: t.output ? `${t.description} Returns ${t.output}.` : t.description, parameters: t.input }));

/** what a model is told to do about each kind of error */
const HINTS: Partial<Record<ToolError["code"], string>> = {
  bad_args: "Check the call against the tool's input schema; describe_part lists a part's props and the values they take.",
  not_found: "Look the id up first: get_outline, list_screens or find_nodes.",
  locked: "That part is locked by the author. Leave it, or ask before unlocking it (set_group {locked: false}).",
  invalid_value: "The message says which values are allowed; describe_node and describe_part list them.",
  refused: "The document's rules do not allow it: work within them, or ask the author.",
  busy: "Try again in a moment.",
};

const errorOf = (e: unknown): ToolError => {
  if (e instanceof ToolFailure) return { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : HINTS[e.code] ? { hint: HINTS[e.code] } : {}) };
  if (e instanceof OpError) return { code: e.code, message: e.message, ...(HINTS[e.code] ? { hint: HINTS[e.code] } : {}), ...(e.about ? { about: e.about } : {}) };
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return { code: "aborted", message: "Stopped before it finished." };
  return { code: "failed", message: e instanceof Error ? e.message : String(e) };
};

/** a value as JSON can carry it: what is not plain data (a function, a cycle) is left out */
const jsonSafe = (v: unknown): unknown => {
  if (v === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return String(v);
  }
};

export type ExecOptions = Omit<ToolEnv, "store"> & { registry?: Registry };

/** Runs one call of a tool on a store. Never throws: an error comes back as {ok: false, error: {code, message,
 *  hint}}, in words a model can act on. The arguments are checked against the tool's schema first. */
export async function executeTool(store: DocStore, name: string, args: unknown, o: ExecOptions): Promise<ToolOutcome> {
  const reg = o.registry ?? CORE_REGISTRY;
  const t = reg.byName(name);
  if (!t) return { ok: false, error: { code: "unknown_tool", message: `There is no tool "${name}".`, hint: `The tools are: ${reg.tools.map((x) => x.name).join(", ")}.` } };
  const a = args ?? {};
  const bad = schemaError(t.input, a, "args");
  if (bad) return { ok: false, error: { code: "bad_args", message: `${name}: ${bad}`, hint: HINTS.bad_args } };
  if (o.signal?.aborted) return { ok: false, error: { code: "aborted", message: "Stopped before it ran." } };
  try {
    const out = await t.run(a as never, { ...o, store });
    return { ok: true, result: jsonSafe(out.result), ...(out.images?.length ? { images: out.images } : {}) };
  } catch (e) {
    return { ok: false, error: errorOf(e) };
  }
}

/** The short guide to the tools: how a document is built, read and checked with them, then the tools there are by
 *  group. The in-app agent's system prompt starts from it; an MCP server serves it as its instructions. */
export function toolGuide(tools: Tool<never>[] = CORE_REGISTRY.tools, o: { list?: boolean } = {}): string {
  const has = (n: string) => tools.some((t) => t.name === n);
  const byGroup = TOOL_GROUPS.map((g) => [g, tools.filter((t) => t.group === g).map((t) => t.name)] as const).filter(([, names]) => names.length);
  return [
    "## Working on an M3E Canvas document",
    "A document is screens with parts on them, plus a theme (often a style pack modeled on a real product), reusable components, data collections and prototype variables. Every part has an id; take ids from the outline or from what a tool returned, never guess them.",
    "- Read first, briefly: get_outline (one screen, a small depth) or find_nodes, then describe_node for one part. The catalogs: list_parts and describe_part (props and the values they take), list_kits, list_templates, list_styles and get_style, look_reference, list_icons.",
    "- Compose the way Figma's auto layout does: a `box` (surface none, card, panel, field, bar, chip, button, sheet, overlay or well) with layout column, row or grid holds parts in a run; add parts with add_part {into: {container, index}}. A box hugs what it holds (hugWidth and hugHeight are on): set them false to give it a width or height of its own, and give a child flowSize {w: \"fill\"} to stretch it across its container. Kits (add_kit) are ready compositions of atoms that follow the style: prefer them to composing the same by hand. Composites (app-bar, navigation-bar, list…) are single parts; split_into_atoms turns one into its atoms when it must change inside." + (has("add_tree") ? " What no kit has, compose in one add_tree call: a nested tree of boxes and atoms with their props, colors and looks." : ""),
    has("apply_ops")
      ? "- Batch: apply_ops runs many operations as one change, all or nothing. Build a screen in one or two batches, giving new screens and parts your own short ids (`id`) so later entries can name them; send the next batch after reading the results."
      : "",
    "- Places and sizes are in dp, from the screen's top left. A phone screen is 412×892 unless the document says otherwise. Bars (app-bar, navigation-bar, a box pinned top or bottom) find their own edge; the style's layout spaces the rest, so put parts in reading order rather than computing positions.",
    "- Words go in the author's language. Colors are theme roles: fill takes surface, surfaceContainer…, primary, primaryContainer…; textColor takes onSurface, onSurfaceVariant, primary…; a look takes kebab-case roles or hex.",
    "- A document held to its style's rules keeps only what the style allows: no corners, no button shapes, only opacity, rotate, transform, blur, blend and elevation of the look. get_style says what the rules leave you. A document not held to them takes every look field.",
    "- Taps: set_action {id, action: {to: screen id | \"back\", effects…}}; variables (add_var) drive effects, bind_prop and showWhen.",
    has("screenshot") ? "- Check by eye: screenshot a screen after changing it, and fix what looks wrong. Open selects, menus and date pickers hang over the parts below them on the canvas by design: leave the layout as it is." : "",
    "- Errors come back as {code, message, hint}; fix the call and try again. nothing_to_do means it already was so.",
    ...(o.list === false ? [] : ["", "Tools by group:", ...byGroup.map(([g, names]) => `- ${g}: ${names.join(", ")}`)]),
  ]
    .filter((l) => l !== "")
    .join("\n");
}
