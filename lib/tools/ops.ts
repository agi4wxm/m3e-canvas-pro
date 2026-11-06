/* Every operation of the document core as a tool, and `apply_ops`, the batch: many operations as one change, all of
 * them or none, one undo step. An operation's own summary and argument schema describe it (lib/core/ops); here it
 * gets a group, a word more for the model where the summary leaves something out, and its shallow object arguments
 * spelled out (schema.ts). */

import { OPS, OpError, opByName, schemaError, sessionMeasurer, type CoreState, type Op, type Schema } from "../core";
import { laidOut } from "../core/ops/common";
import { opInput } from "./schema";
import { tool, ToolFailure, type Tool, type ToolEnv, type ToolGroup } from "./types";

const STYLE_OPS = new Set(["set_theme", "apply_style", "set_custom_styles", "add_custom_style", "set_style_rules", "set_style_layout", "set_palette", "set_custom_palette", "set_dynamic_color"]);
const DATA_OPS = new Set(["add_collection", "update_collection", "remove_collection", "set_repeat", "add_var", "update_var", "remove_var", "set_action", "bind_prop", "add_var_collection", "update_var_collection", "remove_var_collection", "set_var_mode"]);
/** what takes away something the author made: a client asks the author first */
export const DESTRUCTIVE_OPS = new Set(["clear", "remove_screen", "remove_nodes", "remove_component", "remove_collection", "remove_var", "remove_var_collection", "set_custom_styles"]);

const groupOf = (name: string): ToolGroup => (STYLE_OPS.has(name) ? "style" : DATA_OPS.has(name) ? "data" : "edit");

/** what a model should know about an operation that its one-line summary does not say */
const MORE: Record<string, string> = {
  add_part:
    "Compose with `into` (a box's auto layout, at `index`); `at` places it freely on the screen. Give `id` when later calls name the part. A `box` is the container atom: surface (none, card, panel, field, bar, chip, button, sheet, overlay, well), layout (row, column, grid), gap, padding. Returns {itemId, groupId}.",
  add_tree:
    "Compose with nested boxes the way Figma's auto layout does: a box's props set surface, layout (row, column, grid), gap, padding, align, justify and its size; children are laid out in order. Give ids to the nodes later calls name. Text hugs its words in a row and wraps at the column's width in a column with align stretch. To keep it as a reusable component, follow it with make_component {ids: [root id]}. Returns {itemId: the root, groupId, parts}.",
  add_kit: "Prefer a kit over composing the same by hand. Returns {itemId, groupId}; the kit's root box is itemId.",
  add_screen: "Returns {id}.",
  set_item: "To change words, icons and other props use set_props; set_item is for fill, textColor, corners, look, note, taps, constraints ({h, v}: what a part in a box with no auto layout keeps when the box changes size) and the auto layout fields.",
  set_props: "describe_part (or describe_node) lists a part's props and the values they take.",
  set_layout: "Only a container (a box, or a part that holds parts) has a layout.",
  apply_style: "On a document held to its rules, what the style decides (corners, a button's shape, most looks) is removed from every part.",
  set_style_rules: "Off frees colors, shapes and every look field; on removes what the style decides. Only when the author asks for it.",
  clear: "Removes everything the canvas holds. Only when the author asks for a fresh start.",
  remove_nodes: "A container's children are not removed with it: remove them too when the whole block should go.",
  set_action: 'Screens are named by id; {"to": "back"} goes back. A tap that only has effects (set or toggle a variable, show or hide a part) may leave "to" out. To make a switch or checkbox drive a variable, bind its prop with bind_prop and toggle the variable here.',
  wrap_in_auto_layout: "Returns {itemId}: the new outer box.",
  add_variant: "Returns {id, set}. Variants are whole components: edit one by its id like any other. An instance picks one with swap_instance.",
  update_component_set: "The set's id is a variant's `set` (list_components). Renaming a value keeps the variants that had it.",
  set_variant_values: "Each variant of a set should have a different combination of values.",
  swap_instance: "To change an instance's variant, swap it to the variant with the values wanted (list_components lists each variant's values).",
  set_component_prop: "Returns {id}. Text targets are what set_overrides takes as keys; instances then set the words with set_instance_props.",
  set_instance_props: "Keys may be the property's name. Overrides by hand (set_overrides) still win over a text property.",
  reset_overrides: "Leaves the instance exactly as its component is.",
  add_var_collection: "Returns {id, modes}. For light and dark colors: a collection with modes Light and Dark, color variables with a value in each, then update_var_collection {dark: the Dark mode's id} so dark mode shows it.",
  update_var_collection: "Give every mode that stays its id, or its values go.",
  set_var_mode: "A screen's own choice wins over the document's; list_data lists the collections and their modes.",
  bind_prop: "A fill bound to a color variable shows its value in the mode on show; to drive a switch's checked prop by a bool variable, bind it and toggle the variable with set_action.",
  split_into_atoms: "Returns {rootItemId}.",
};

/** what an operation reports that a model has no use for */
const lean = (name: string, result: unknown): unknown => {
  if (result === undefined) return { done: true };
  if (name === "tidy_screen") return { done: true };
  return result;
};

/** whether a change reached the document (not just the selection or the measures) */
export const wrote = (prev: CoreState, next: CoreState) => prev.doc !== next.doc || prev.editing !== next.editing;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

/** A tap that only has effects (set a variable, show a part) goes nowhere: models leave `to` out for it, which the
 *  document spells "none". */
const tapOf = (a: unknown): unknown => (isRec(a) ? { ...a, ...(a.to === undefined ? { to: "none" } : {}), ...(isRec(a.else) ? { else: tapOf(a.else) } : {}) } : a);

/** arguments as a model writes them, read the way the operation means them */
function prepared(name: string, args: Rec): Rec {
  if (name === "set_action" && isRec(args.action)) return { ...args, action: tapOf(args.action) };
  if (name === "set_item" && isRec(args.patch)) {
    const p = args.patch;
    return { ...args, patch: { ...p, ...(isRec(p.action) ? { action: tapOf(p.action) } : {}), ...(isRec(p.actions) ? { actions: Object.fromEntries(Object.entries(p.actions).map(([k, v]) => [k, tapOf(v)])) } : {}) } };
  }
  return args;
}

/** A change made where no canvas measures what it added (Node, the MCP file backend): an operation lays its layouts
 *  out with the sizes known before it ran, so a part it just added has none yet and waits where it landed. Laid out
 *  once more with every part's guess, it stands where the editor would put it. In the editor the canvas measures the
 *  new part and lays it out itself. */
function settle(env: ToolEnv) {
  if (env.store.options.measurer === sessionMeasurer) return;
  env.store.update("Layout", env.origin, (s) => laidOut(s, env.store.ctx(env.origin).widths));
}

/** what follows a call that may have changed the document: the layout settled, and the caller told */
export function afterWrite(env: ToolEnv, prev: CoreState) {
  if (!wrote(prev, env.store.get())) return;
  settle(env);
  env.onWrite?.(prev);
}

function runOne(o: Op<never, unknown>, args: Record<string, unknown>, env: ToolEnv) {
  const prev = env.store.get();
  let result: unknown;
  try {
    result = env.store.run(o, prepared(o.name, args) as never, { origin: env.origin, ...(env.history ? { history: env.history } : {}) });
  } catch (e) {
    if (e instanceof OpError && e.code === "nothing_to_do") return { result: { nothing_to_do: e.message } };
    throw e;
  }
  afterWrite(env, prev);
  return { result: lean(o.name, result) };
}

/** one tool for one operation */
const opTool = (o: Op<never, unknown>): Tool<Record<string, unknown>> => ({
  name: o.name,
  group: groupOf(o.name),
  description: MORE[o.name] ? `${o.summary} ${MORE[o.name]}` : o.summary,
  input: opInput(o.name, o.args),
  readOnly: false,
  destructive: DESTRUCTIVE_OPS.has(o.name),
  run: (args, env) => runOne(o, args, env),
});

export const OP_TOOLS: Tool<Record<string, unknown>>[] = OPS.map(opTool);
const BY_NAME = new Map(OP_TOOLS.map((t) => [t.name, t]));

type Call = { op: string; args?: Record<string, unknown> };

/** an operation of a batch failed: which one, and why */
class BatchFailure extends Error {
  constructor(
    readonly index: number,
    readonly op: string,
    readonly reason: unknown,
  ) {
    super(reason instanceof Error ? reason.message : String(reason));
  }
}

export const applyOps = tool<{ ops: Call[]; label?: string }>({
  name: "apply_ops",
  group: "edit",
  description:
    "Runs many operations as one change: all of them or none (if one fails, the document stays as it was and the error says which one), one undo step. The fastest way to build: a screen, its parts and their props in one call. Give new screens and parts your own ids (`id`, `groupId`) so later operations in the same batch can name them. Each entry is {op: an operation tool's name, args: its arguments}; read tools and generate tools cannot be batched.",
  input: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        minItems: 1,
        items: { type: "object", properties: { op: { type: "string", enum: OPS.map((o) => o.name), description: "the operation" }, args: { type: "object", description: "its arguments, as its own tool takes them" } }, required: ["op"], additionalProperties: false },
      },
      label: { type: "string", description: "what the step is called in the history" },
    },
    required: ["ops"],
    additionalProperties: false,
  },
  output: "{ran, results: what each operation reported, in order}",
  readOnly: false,
  destructive: false,
  run(a, env) {
    const prev = env.store.get();
    const results: unknown[] = [];
    try {
      env.store.transact(
        a.label ?? `${a.ops.length} changes`,
        env.origin,
        (tx) => {
          a.ops.forEach((c, i) => {
            const t = BY_NAME.get(c.op);
            const o = opByName(c.op);
            if (!t || !o) throw new BatchFailure(i, c.op, new OpError("bad_args", `There is no operation "${c.op}".`));
            const args = prepared(c.op, c.args ?? {});
            const bad = schemaError(t.input as Schema, args, "args");
            if (bad) throw new BatchFailure(i, c.op, new OpError("bad_args", `${c.op}: ${bad}`));
            try {
              results.push(lean(c.op, tx.run(o, args as never)));
            } catch (e) {
              if (e instanceof OpError && e.code === "nothing_to_do") results.push({ nothing_to_do: e.message });
              else throw new BatchFailure(i, c.op, e);
            }
          });
        },
        env.history ? { history: env.history } : {},
      );
    } catch (e) {
      if (!(e instanceof BatchFailure)) throw e;
      const cause = e.reason;
      const code = cause instanceof OpError ? cause.code : "failed";
      throw new ToolFailure(code, `ops[${e.index}] (${e.op}) failed, so none of the ${a.ops.length} operations ran: ${e.message}`, "Fix that operation (or drop it) and send the whole batch again.");
    }
    afterWrite(env, prev);
    return { result: { ran: a.ops.length, results } };
  },
});

/** whether a call takes away something the author made: a destructive operation, or a batch holding one */
export function isDestructiveCall(name: string, args: unknown): boolean {
  if (DESTRUCTIVE_OPS.has(name)) return true;
  if (name !== "apply_ops") return false;
  const ops = (args as { ops?: Call[] } | null)?.ops;
  return Array.isArray(ops) && ops.some((c) => DESTRUCTIVE_OPS.has(c?.op));
}
