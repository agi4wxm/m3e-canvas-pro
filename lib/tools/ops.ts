/* Every operation of the document core as a tool, and `apply_ops`, the batch: many operations as one change, all of
 * them or none, one undo step. An operation's own summary and argument schema describe it (lib/core/ops); here it
 * gets a group, a word more for the model where the summary leaves something out, and its shallow object arguments
 * spelled out (schema.ts). */

import { OPS, OpError, opByName, schemaError, sessionMeasurer, type CoreState, type Op, type Schema } from "../core";
import { definitionOpened } from "../core/ops/definition";
import { laidOut } from "../core/ops/common";
import { picturesCleaned } from "../core/images";
import { idAliased, withAliases } from "./aliases";
import { opInput } from "./schema";
import { tool, ToolFailure, type Tool, type ToolEnv, type ToolGroup } from "./types";

const STYLE_OPS = new Set(["set_theme", "apply_style", "set_custom_styles", "add_custom_style", "set_style_rules", "set_style_layout", "set_palette", "set_custom_palette", "set_dynamic_color"]);
/** the operations on the API section (lib/core/ops/api.ts): data too, the contract the data comes through */
export const API_OPS = new Set(["add_model", "update_model", "rename_model", "remove_model", "add_endpoint", "update_endpoint", "remove_endpoint", "set_auth", "add_channel", "update_channel", "remove_channel", "set_servers", "set_api_info", "import_openapi", "import_asyncapi"]);
/** the operations on the mock library (lib/core/ops/mocks.ts): data too, what the API answers with */
export const MOCK_OPS = new Set(["set_mocks", "set_mock_model", "pin_mock_records", "unpin_mock_records", "add_mock_scenario", "update_mock_scenario", "remove_mock_scenario", "add_mock_file", "generate_mock_files", "update_mock_file", "remove_mock_file", "set_mock_realtime", "remove_mock_realtime", "set_mock_auth", "set_mock_route", "fill_mocks", "clear_mocks", "set_mock_capability"]);
/** the operations on the platform capabilities (lib/core/ops/capabilities.ts): the product's own, the ones it uses */
export const CAPABILITY_OPS = new Set(["declare_capability", "remove_capability", "use_capabilities"]);
/** the operations on the gameplay contract (lib/core/ops/game.ts): the game loop's, linked and unlinked */
export const GAME_OPS = new Set(["import_game_contract", "remove_game_contract"]);
/** the operations that bind screens to the contract (lib/core/ops/bindings.ts) */
export const BINDING_OPS = new Set(["add_data_source", "update_data_source", "remove_data_source", "set_subscription", "remove_subscription", "set_screen_params", "rename_screen_param", "set_screen_auth", "bind_expression", "set_region", "remove_region", "set_form", "make_form", "bind_field", "wire_screen"]);
const DATA_OPS = new Set([...BINDING_OPS, "add_collection", "update_collection", "remove_collection", "set_repeat", "add_var", "update_var", "remove_var", "set_action", "bind_prop", "add_var_collection", "update_var_collection", "remove_var_collection", "set_var_mode", ...API_OPS, ...MOCK_OPS, ...CAPABILITY_OPS, ...GAME_OPS]);
/** what takes away something the author made: a client asks the author first */
export const DESTRUCTIVE_OPS = new Set(["clear", "remove_screen", "remove_nodes", "remove_component", "remove_collection", "remove_var", "remove_var_collection", "set_custom_styles", "remove_icon", "remove_model", "remove_endpoint", "remove_channel", "unpin_mock_records", "remove_mock_scenario", "remove_mock_file", "remove_mock_realtime", "clear_mocks", "remove_data_source", "remove_subscription", "remove_region", "remove_capability", "remove_game_contract"]);

const groupOf = (name: string): ToolGroup => (STYLE_OPS.has(name) ? "style" : DATA_OPS.has(name) ? "data" : "edit");

/** what a model should know about an operation that its one-line summary does not say */
const MORE: Record<string, string> = {
  add_part:
    "Compose with `into` (a box's auto layout, at `index`); `at` places it freely on the screen. Give `id` when later calls name the part. A `box` is the container atom: surface (none, card, panel, field, bar, chip, button, sheet, overlay, well), layout (row, column, grid), gap, padding. Returns {itemId, groupId}; a split-view also {panes: {first, second}}, the ids of its two panes, the boxes to put parts into.",
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
  set_action: 'Screens are named by id; {"to": "back"} goes back. A tap that only has effects (set or toggle a variable, show or hide a part) may leave "to" out. To make a switch or checkbox drive a variable, bind its prop with bind_prop and toggle the variable here. The API: {do: "call", operationId, args: {param or body field: expression}, then: {to, params, effects}, catch: {...}} (then reads response, catch reads error; either may branch on it with when: {expr} and else: {...}), {do: "refresh", source}, {do: "loadMore", source}, {do: "submit"} (the form the part is in), {do: "signOut"}. A platform capability (list_capabilities): {do: "invoke", capability: "payment.pay", args: {orderId: "response.id"}, then: {...} (reads result), catch: {...} (reads error.type: cancelled, failed, unavailable, not-implemented, denied, timeout)}; a payment\'s then only means submitted: go to a screen that loads the order and shows its status. A world-view (an engine\'s picture) takes input actions: {do: "move", part: <its id>, vector: "event"} on a joystick\'s on:move, {do: "press", part, action: "attack"} and {do: "release", part, action: "attack"} on a tap; its events on:hit, on:collected, on:ended take actions. params: {name: expression} gives the screen it opens its params (declared there if missing; for API data, while a detail opened from a row of a data collection reads {{current.field}}); when: {expr} tests an expression; setVar {expr} sets a variable from one.',
  wrap_in_auto_layout: "Returns {itemId}: the new outer box.",
  make_component: "Its parts then live in the component's definition, no longer on the screen: change them with edit_component (every instance follows); an instance's own words with set_instance_props or set_overrides. Returns {id, instanceId, itemId}.",
  edit_component:
    'e.g. {id: "prompt-box", ops: [{op: "set_props", args: {id: "send", props: {icon: "arrow_upward"}}}, {op: "add_part", args: {slug: "chip", into: {container: "row"}}}]}. Returns {ran, results}.',
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
  split_into_atoms: "Returns {rootItemId, collection?}: a retired list whose rows are alike gets a data collection its rows repeat over (list_data shows it).",
  split_retired: "Use it before changing a retired part, or when the author asks to modernize an old design. Returns {split: [{id, slug, rootItemId, collection?, refreshes?}], left}: refreshes names the screen's data sources a pull-to-refresh turned pull to refresh on for.",
  set_split: "The visitor's own drag in an app never changes this: it starts from it each time (or from what they left, with persist).",
  convert_to_split_view: "Returns {itemId, groupId, panes: {first, second}}.",
  add_model: "get_api shows the models there are. Name fields in camelCase; required lists what is always there. Returns {name}.",
  update_model: "To rename a model use rename_model (references follow).",
  remove_model: "Refused while something refers to the model; the error lists what.",
  add_endpoint:
    "REST shape: GET /products (listProducts, paged: pagination {style: \"cursor\", items: \"items\"} with returns {type: object, properties: {items: {type: array, items: {$ref: Product}}, nextCursor: {type: [string, null]}}}), GET /products/{id}, POST /products, PATCH /products/{id}, DELETE /products/{id}. Returns {operationId, parameters, responses}.",
  update_endpoint: "describe_endpoint shows one in full first.",
  set_auth: "A login endpoint is usually public (update_endpoint {security: []}) and returns {accessToken, refreshToken}.",
  add_channel: "A chat: a WebSocket channel whose operations are the server sending new messages (send) and receiving the user's (receive).",
  import_openapi: "Give the whole file's text. Returns {models, endpoints, converted, kept, dropped, problems}.",
  import_asyncapi: "Give the whole file's text. Returns {models, channels, converted, kept, dropped, problems}.",
  fill_mocks: "Start here when the API has no mocks yet; then get_mocks shows what it wrote and try_mock shows what an endpoint answers. Returns {models, hints, scenarios, scripts}.",
  set_mock_model: "get_mocks lists each model's fields with the hint they have now; list_mock_records shows the records they make.",
  pin_mock_records: "list_mock_records gives records to start from. Returns {model, pinned}.",
  add_mock_scenario: "An operation is named by its operationId (get_api lists them). Returns {id}.",
  update_mock_scenario: "get_mocks lists the scenarios.",
  add_mock_file: "Returns {id}; a hint's files: [id] makes a field use it.",
  generate_mock_files: "Returns {ids}.",
  set_mock_realtime: "get_api lists each channel's messages. Returns {id}.",
  set_mock_capability: "list_capabilities lists the capabilities and how the mocks answer them now. For a shop: one scenario per outcome of a payment (cancelled, failed) and the order's status from the API per scenario (its getOrder answering status paid, pending or failed).",
  import_game_contract: "Only with a file the game loop wrote, as the author gave it. get_game_contract then lists each command's call and refusals.",
  declare_capability: "Only for a capability the catalog does not have (list_capabilities): the standard ones are used as they are.",
  wire_screen:
    "The quickest way to a working screen: one call per screen and endpoint (a list with detail: the screen a row opens, given the row's id as its params, in either order). It composes a region of its own below what the screen holds: a list already designed is bound in place instead (set_repeat, bind_expression, set_region). Restyle what it made like any parts. Returns {source, region, template, states}.",
  set_subscription:
    'A live screen (a chat, an order\'s status, a ticker, a match found): get_api lists the channels and the messages the server sends; set_mock_realtime makes the mocks play them in the preview. Bind parts to data.<name>.value.<field> (the latest message), set_repeat {data: "data.<name>.items"} for every message kept, or run an action on each: actions {"on:<message>": {to: "none", effects: [{do: "setVar", var, expr: "event.payload.status"}, {do: "refresh", source}]}} (a tap\'s rules: to a screen only when the visitor should be taken there). Returns {name, addedParams}.',
  add_data_source: "Returns {name, addedParams}. The screen then reads data.<name>.value (the body), .items (a list, every page so far), .status, .loading, .error, .hasMore, .empty.",
  bind_expression:
    'Paths: data.<source>.value.<field>, data.<source>.items, item.<field> (inside a repeat over data), index, params.<name>, vars.<name>, form.<field>, form.errors.<field>, form.error, form.submitting, auth.signedIn, auth.user.<field>. Operators: + - * / % == != < <= > >= && || ! ?? ?:. Helpers: date(v, "date|time|datetime|short|long|relative"), relative(v), number(v, digits), currency(v, code), percent(v), fileSize(v), plural(n, "# item", "# items"), truncate(s, n), upper, lower, len, join, pluck, sum, first, last, contains, isEmpty, round, min, max. describe_bindings {screen, expr, at} checks one first.',
  set_region: "A region is usually a repeat's container (a list) or the column showing one item. Returns {states}: the states it has designs for; each design is an ordinary box on the region's pane for that state, edited like any parts (set_region {show} brings it on the canvas).",
  make_form: "Returns {formId, fields: [{field, itemId}], submitId}. The login endpoint's form (set_auth login) starts the session; then {to: screen} goes on. A list opened after saving loads again by itself: refresh only names a source of the screen the form is on.",
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
 *  document spells "none". So do the answers of its calls and invokes (a payment's `then` inside an order's), as deep
 *  as the nesting limit lets them go. */
const tapOf = (a: unknown, depth = 0): unknown => {
  if (!isRec(a) || depth > 8) return a;
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  const effects = Array.isArray(a.effects) ? a.effects.map((e) => (isRec(e) && (e.do === "call" || e.do === "invoke") ? { ...e, ...(isRec(e.then) ? { then: tapOf(e.then, depth + 1) } : {}), ...(isRec(e.catch) ? { catch: tapOf(e.catch, depth + 1) } : {}) } : e)) : a.effects;
  return { ...a, ...(a.to === undefined ? { to: "none" } : {}), ...(effects !== a.effects ? { effects } : {}), ...(isRec(a.else) ? { else: tapOf(a.else, depth + 1) } : {}) };
};

/** arguments as a model writes them, read the way the operation means them, against the state they will run on: the
 *  names it got nearly right (aliases.ts), pictures cleaned (an SVG goes through the sanitizer), taps filled in */
function prepared(name: string, given: Rec, s: CoreState): Rec {
  /* the operations run inside a component are read against its definition, as they will run on it */
  if (name === "edit_component" && typeof given.id === "string" && Array.isArray(given.ops)) {
    let inside: CoreState;
    try {
      inside = s.editing?.id === given.id ? s : definitionOpened(s, given.id);
    } catch {
      return given;
    }
    return { ...given, ops: (given.ops as unknown[]).map((c) => (isRec(c) && typeof c.op === "string" ? { ...c, args: prepared(c.op, isRec(c.args) ? c.args : {}, inside) } : c)) };
  }
  const args = picturesCleaned(withAliases(name, given, s)) as Rec;
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
    result = env.store.run(o, prepared(o.name, args, prev) as never, { origin: env.origin, ...(env.history ? { history: env.history } : {}) });
  } catch (e) {
    if (e instanceof OpError && e.code === "nothing_to_do") return { result: { nothing_to_do: e.message } };
    throw e;
  }
  afterWrite(env, prev);
  return { result: lean(o.name, result) };
}

/** Operations that change what another adds, with the same fields: their fields are described once, on the adding
 *  one, and only named here (the operation still checks every value). Every request carries every loaded tool. */
const SAME_FIELDS_AS: Record<string, string> = { update_endpoint: "add_endpoint", update_mock_scenario: "add_mock_scenario", update_channel: "add_channel" };

/** a tool's input with the fields it shares with the operation it updates left undescribed */
function leanInput(name: string, input: Schema): Schema {
  const like = SAME_FIELDS_AS[name] ? opByName(SAME_FIELDS_AS[name]) : undefined;
  const shared = like ? ((like.args as Schema).properties as Record<string, Schema> | undefined) : undefined;
  const props = input.properties as Record<string, Schema> | undefined;
  if (!shared || !props) return input;
  const bare = (s: Schema): Schema => {
    const { description: _d, ...rest } = s;
    const out: Schema = { ...rest };
    if (out.properties && typeof out.properties === "object") out.properties = Object.fromEntries(Object.entries(out.properties as Record<string, Schema>).map(([k, v]) => [k, bare(v)]));
    if (out.items && typeof out.items === "object" && !Array.isArray(out.items)) out.items = bare(out.items as Schema);
    if (out.additionalProperties && typeof out.additionalProperties === "object") out.additionalProperties = bare(out.additionalProperties as Schema);
    return out;
  };
  return { ...input, properties: Object.fromEntries(Object.entries(props).map(([k, s]) => [k, k in shared ? bare(s) : s])) };
}

/** one tool for one operation */
const opTool = (o: Op<never, unknown>): Tool<Record<string, unknown>> => ({
  name: o.name,
  group: groupOf(o.name),
  description: [o.summary, MORE[o.name], SAME_FIELDS_AS[o.name] ? `The fields are as ${SAME_FIELDS_AS[o.name]} describes them.` : ""].filter(Boolean).join(" "),
  input: leanInput(o.name, opInput(o.name, o.args)),
  readOnly: false,
  destructive: DESTRUCTIVE_OPS.has(o.name),
  prepare: (args, s) => idAliased(o.name, args, s),
  run: (args, env) => runOne(o, args, env),
});

export const OP_TOOLS: Tool<Record<string, unknown>>[] = OPS.map(opTool);
const BY_NAME = new Map(OP_TOOLS.map((t) => [t.name, t]));

type Call = { op: string; args?: Record<string, unknown> };

/** an operation of a batch that failed: which one, and why */
type Failed = { index: number; op: string; code: string; message: string };

/** the batch failed: every operation that did, so they can all be fixed in one go */
class BatchFailure extends Error {
  constructor(readonly failed: Failed[]) {
    super(failed.map((f) => f.message).join("; "));
  }
}

const failedOf = (index: number, op: string, e: unknown): Failed => ({ index, op, code: e instanceof OpError || e instanceof ToolFailure ? e.code : "failed", message: e instanceof Error ? e.message : String(e) });

/** The words a failed batch comes back with: each operation that failed and why, said once, and that the others were
 *  fine, so the model changes only those and sends the batch again rather than rewriting it. One that names a part
 *  an earlier failed one was to make is marked as probably following from it. */
function batchError(failed: Failed[], total: number): ToolFailure {
  const first = failed[0];
  const lines = failed.map((f) => `ops[${f.index}] (${f.op}): ${f.message}${f !== first && f.code === "not_found" ? " (may only follow from an earlier failure)" : ""}`);
  const ok = total - failed.length;
  const message = failed.length === 1 ? `ops[${first.index}] (${first.op}) failed, so none of the ${total} operations ran: ${first.message}` : `${failed.length} of the ${total} operations failed, so none ran:\n${lines.join("\n")}`;
  const hint = ok ? `The other ${ok} ${ok === 1 ? "operation is" : "operations are"} fine: change only ${failed.length === 1 ? `ops[${first.index}]` : "those"} (or drop ${failed.length === 1 ? "it" : "them"}) and send the batch again.` : "Fix them and send the batch again.";
  return new ToolFailure(first.code as never, message, hint);
}

export const applyOps = tool<{ ops: Call[]; label?: string }>({
  name: "apply_ops",
  group: "edit",
  description:
    "Runs many operations as one change: all of them or none (if any fail, the document stays as it was and the error lists each one that failed and why: fix only those), one undo step. The fastest way to build: a screen, its parts and their props in one call. Give new screens and parts your own ids (`id`, `groupId`) so later operations in the same batch can name them. Each entry is {op: an operation tool's name, args: its arguments}; read tools and generate tools cannot be batched.",
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
          /* an operation that fails changes nothing, so the rest are still tried: every failure is reported at once,
             and the whole batch is then taken back */
          const failed: Failed[] = [];
          a.ops.forEach((c, i) => {
            const t = BY_NAME.get(c.op);
            const o = opByName(c.op);
            if (!t || !o) return void failed.push(failedOf(i, c.op, new OpError("bad_args", `There is no operation "${c.op}".`)));
            try {
              const args = prepared(c.op, c.args ?? {}, tx.state);
              const bad = schemaError(t.input as Schema, args, "args");
              if (bad) throw new OpError("bad_args", `${c.op}: ${bad}`);
              results.push(lean(c.op, tx.run(o, args as never)));
            } catch (e) {
              if (e instanceof OpError && e.code === "nothing_to_do") results.push({ nothing_to_do: e.message });
              else failed.push(failedOf(i, c.op, e));
            }
          });
          if (failed.length) throw new BatchFailure(failed);
        },
        env.history ? { history: env.history } : {},
      );
    } catch (e) {
      if (!(e instanceof BatchFailure)) throw e;
      throw batchError(e.failed, a.ops.length);
    }
    afterWrite(env, prev);
    return { result: { ran: a.ops.length, results } };
  },
});

/** whether a call takes away something the author made: a destructive operation, or a batch (or a component's edit)
 *  holding one */
export function isDestructiveCall(name: string, args: unknown): boolean {
  if (DESTRUCTIVE_OPS.has(name)) return true;
  if (name !== "apply_ops" && name !== "edit_component") return false;
  const ops = (args as { ops?: Call[] } | null)?.ops;
  return Array.isArray(ops) && ops.some((c) => typeof c?.op === "string" && isDestructiveCall(c.op, c.args));
}
