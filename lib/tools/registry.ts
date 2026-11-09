/* The registry: every tool by name, the subsets a client is given by group, running a call with errors a model can act
 * on, the tools as the provider layer (lib/llm) and an MCP server describe them, and a short guide to using them,
 * written from the registry so it names exactly the tools there are. The generative tools (generate.ts) are not in it
 * by default: they need keys, so whoever has them adds them. */

import { OpError, schemaError, type DocStore } from "../core";
import type { ToolDef } from "../llm/types";
import { applyOps, OP_TOOLS } from "./ops";
import { READ_TOOLS } from "./read";
import { API_READ_TOOLS } from "./apiRead";
import { BINDINGS_READ_TOOLS } from "./bindingsRead";
import { MOCK_READ_TOOLS } from "./mocksRead";
import { CAPABILITY_READ_TOOLS } from "./capabilitiesRead";
import { REFERENCE_TOOLS } from "./reference";
import { TOOL_GROUPS, ToolFailure, type Tool, type ToolEnv, type ToolError, type ToolGroup, type ToolOutcome } from "./types";
import { RETIRED_SLUGS } from "../retire";

/** every tool that needs nothing but a document: reading, building, styling, data */
export const CORE_TOOLS: Tool<never>[] = [...READ_TOOLS, ...API_READ_TOOLS, ...MOCK_READ_TOOLS, ...CAPABILITY_READ_TOOLS, ...BINDINGS_READ_TOOLS, ...REFERENCE_TOOLS, applyOps as unknown as Tool<never>, ...(OP_TOOLS as unknown as Tool<never>[])];

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
  const given = args ?? {};
  const a = t.prepare && given && typeof given === "object" && !Array.isArray(given) ? t.prepare(given as Record<string, unknown>, store.get()) : given;
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

/** A working product (data, sign-in, an API) is built in the document, never in code: the order the work goes in,
 *  and what the tools do not say alone. */
const PRODUCT_GUIDE = [
  "- A working app (real data, forms that save, sign-in, \"connect to the API\") is made in the document, never in code:",
  "  1. Contract (get_api first): from the screens infer models (camelCase fields; uuid ids, date-time, email, uri pictures, enums; a title per field in the canvas language: forms and labels show it) and REST endpoints: GET /things (listThings, cursor paging {items, nextCursor}), GET /things/{thingId}, POST /things (body: the writable fields with their rules), PATCH, DELETE; errors are problem+json. Sign-in: public POST /auth/login (security []) returning accessToken, refreshToken, user, then set_auth {schemes: bearer, security, login}. One apply_ops batch, or import_openapi for a given spec.",
  "  2. Bindings: wire_screen per screen and endpoint (source, region, row bound to the fields, state designs; detail: the screen a row opens). A designed list keeps its design: add_data_source, set_repeat {data: \"data.<source>.items\"} on its container (the first child is the row), remove the other sample rows, bind_expression the row's parts (item.name, currency(item.price)), set_region on the container. A row of API data opens a detail by set_action {to, params: {thingId: \"item.id\"}}, read there as params.thingId (a data collection's row is read as {{current.field}} instead). make_form for create, edit and sign-in forms; a button calling an endpoint: effects [{do: \"call\", operationId, args, then}]; set_screen_auth login / required; a screen showing what the server pushes over a channel (chat, an order's status, a match found): set_subscription (data.<name>.value / .items, actions on:message).",
  "  3. States: each region has loading, empty, error and no-access designs in the document's style: word them for the product (set_props).",
  "  4. Mocks: fill_mocks (they draw placeholder pictures for image fields: draw none for the data); add_mock_scenario as asked ({all: {empty: true}}, {all: {status: 500}}, latency); set_mock_realtime for a channel.",
  "  5. Check: screenshot {id, scenario: \"\"} shows a screen with mock data and what each source got, {state} a region's design; try_mock calls endpoints.",
].join("\n");

/** What the design is responsible for and what it leaves to the other side (docs/边界与契约.md): the screens draw state
 *  and send intents; results, platform capabilities and the rules come from the back end, the game or the platform. */
export const BOUNDARY_GUIDE = [
  "- The boundary: a design draws state and sends what the user means; results come from the other side (the API, the game, the platform).",
  "  - Variables hold UI state only (a tab, a toggle, a draft, the dark mode, a copy of data for display): never a balance, stock, score, points, an order's status, or whether a claim, a payment or a draw went through. Those come from the API as data.* or response.*.",
  "  - Never decide a result on the screen: no button that goes straight to a \"success\", \"paid\" or \"claimed\" screen or state, no random or computed outcome (prizes, wins, prices). The button calls the endpoint (effects [{do: \"call\", operationId, then, catch}]) or submits a form; `then` shows what the answer says, `catch` shows the failure, each with a design of its own.",
  "  - Platform capabilities (payment, in-app purchase, third-party sign-in, location, scanning, push, share, clipboard, links, files, analytics, biometrics, calls) are capability calls, never built here (no SDK, key or permission): the effect {do: \"invoke\", capability, args, then, catch} (list_capabilities says what each takes and returns). Maps, the camera and a call's picture are capability views: the parts map, camera and video-call, wired by their events. Every invoke has a catch that shows its failures (error.type: cancelled, failed, unavailable, not-implemented, denied, timeout); never act out a success.",
  "  - A game world (the scene, physics, camera, rules, what is hit or picked up) is an engine's, never built here: place a world-view part (its props are the world's state the HUD shows: entities, score, status, its inputs prop declares the input actions it takes with their types, \"move: vec2, attack: bool\") and wire the controls to it with input actions: a joystick's on:move {do: \"move\", part: <world-view id>, vector: \"event\"}, a skill-button or button tap {do: \"press\", part, action: \"attack\"} then {do: \"release\", …}. The world's events (on:hit, on:collected, on:ended) take the design's actions (a snackbar, the results screen); never decide a hit, a score or a win in the design. With no engine the world view plays a mock world script: set_mock_world {from: \"battle\"} gives twenty enemies with hp, maxHp, positions, cooldowns and hits to design a HUD against (set_mocks {world} makes the preview start with it, screenshot {world, at} draws a moment of it).",
  "  - A payment: the button calls the order endpoint (createOrder), its then invokes payment.pay with the order the back end made (response.id, response.amount), and payment.pay's then only means submitted: it opens a result screen that loads the order (params.orderId) and shows paid, processing or failed by the order's status from the API (showWhen data.order.value.status), with a way to load it again; its catch shows cancelled and failed. Never a button straight to a \"paid\" screen.",
  `  - The retired parts (${RETIRED_SLUGS.join(", ")}) are not offered and adding one is refused. Each but the resizable keeps its data to itself: compose atoms and kits with make_form, set_repeat and calls instead; a resizable's panels hold only words: use a split-view. An old design's still draw; before changing one, split_retired turns them into atoms (a list's rows into a data collection, a resizable into a split view).`,
  "  - A part with a `demo` (describe_part) acts out a domain behaviour only in a prototype: for a product, bind the props it names or wire its events.",
  "- Events: a part that declares events (describe_part, describe_node) runs set_action {slot: \"on:<name>\"} when it sends one, its expressions reading event.<field> (a number pad's on:submit: event.value). A family slot such as \"tab:*\" is one action for every row, reading slot.index.",
].join("\n");

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
    "- Two panes side by side (or one over the other) with a divider the visitor drags: a split-view. It comes with its two panes, boxes with a column layout (add_part returns their ids as panes.first and panes.second; in add_tree its two children are the panes): put parts into a pane, never into the split view, and nest split views for more panes. split is the design's share of the first pane in percent (set_split); minFirst, maxFirst, minSecond, maxSecond (px), collapsible and persist are props. Both panes always show: for one at a time use tabs or a dock. resizable is a legacy demo whose panels hold only words: use split-view (convert_to_split_view turns one into it).",
    has("apply_ops")
      ? "- Batch: apply_ops runs many operations as one change, all or nothing. Build a screen in one or two batches, giving new screens and parts your own short ids (`id`) so later entries can name them; send the next batch after reading the results."
      : "",
    "- Places and sizes are in dp, from the screen's top left. A phone screen is 412×892 unless the document says otherwise. Bars (app-bar, navigation-bar, a box pinned top or bottom) find their own edge; the style's layout spaces the rest, so put parts in reading order rather than computing positions. A tab bar or bottom navigation you compose from boxes is a box with pin: \"bottom\" (a top bar: pin: \"top\"); placed at the bottom without the pin it scrolls away with the screen.",
    "- Words go in the author's language. Colors are theme roles: fill takes surface, surfaceContainer…, primary, primaryContainer…; textColor takes onSurface, onSurfaceVariant, primary…; a look takes kebab-case roles or hex.",
    "- A document held to its style's rules keeps only what the style allows: no corners, no button shapes, only opacity, rotate, transform, blur, blend and elevation of the look. get_style says what the rules leave you. A document not held to them takes every look field.",
    "- Taps: set_action {id, action: {to: screen id | \"back\", effects…}}; variables (add_var) drive effects, bind_prop and showWhen.",
    BOUNDARY_GUIDE,
    has("screenshot") ? "- Check by eye: screenshot a screen after changing it, and fix what looks wrong. Open selects, menus and date pickers hang over the parts below them on the canvas by design: leave the layout as it is." : "",
    "- Errors come back as {code, message, hint}; fix the call and try again. nothing_to_do means it already was so.",
    ...(has("wire_screen") ? [PRODUCT_GUIDE] : []),
    ...(o.list === false ? [] : ["", "Tools by group:", ...byGroup.map(([g, names]) => `- ${g}: ${names.join(", ")}`)]),
  ]
    .filter((l) => l !== "")
    .join("\n");
}
