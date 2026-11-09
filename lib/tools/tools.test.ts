/* The tool registry headless, in Node: every tool run against a DocStore whose parts are measured by their own
 * guesses, the schemas well formed, a batch all or nothing and one undo step, and errors a model can act on. */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, OPS, savedDoc, stateOf, type Schema } from "../core";
import { setGlobalLang } from "../i18n";
import { PARTS } from "../../parts/registry";
import { TEMPLATES } from "../../parts/templates";
import { fakeFetch, scriptedAdapter, sseResponse, sseText } from "../llm/testkit";
import type { AiSettings } from "../ai";
import { CORE_REGISTRY, createRegistry, executeTool, isDestructiveCall, toolDefs, toolGuide, TOOL_GROUPS, type Renderer, type ToolOutcome } from ".";
import { GENERATE_TOOLS, stripBackdrop, toCurrentColor } from "./generate";
import { iconSource } from "../../scripts/gen-tool-icons";
import { makeItem } from "../tokens";
import { setAssetCatalog } from "../assetCatalog";
import { parseAssetManifest } from "../assetManifest";

beforeAll(() => setGlobalLang("en"));

const fresh = () => new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const ok = (o: ToolOutcome, what = "") => {
  if (!o.ok) throw new Error(`${what}: ${o.error.code} ${o.error.message}`);
  return o.result as Record<string, unknown>;
};

const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
/** every node of a schema has known types, enums with values, and `required` naming its own properties */
function wellFormed(s: Schema, at: string) {
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  for (const t of types) expect(TYPES.has(t as string), `${at}: type ${t}`).toBe(true);
  if (s.enum) expect((s.enum as unknown[]).length, `${at}: enum`).toBeGreaterThan(0);
  if (s.properties) {
    const props = s.properties as Record<string, Schema>;
    for (const r of (s.required as string[] | undefined) ?? []) expect(props[r], `${at}: required ${r}`).toBeDefined();
    for (const [k, v] of Object.entries(props)) wellFormed(v, `${at}.${k}`);
  }
  if (s.items) wellFormed(s.items as Schema, `${at}[]`);
}

describe("the registry", () => {
  it("has one tool for every operation, the read tools and the batch, with unique snake_case names", () => {
    const names = CORE_REGISTRY.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
    for (const o of OPS) expect(names).toContain(o.name);
    for (const n of ["get_outline", "find_nodes", "describe_node", "list_screens", "list_parts", "describe_part", "list_kits", "list_styles", "get_style", "look_reference", "list_icons", "list_components", "list_data", "screenshot", "apply_ops"]) expect(names).toContain(n);
  });

  it("describes every tool with an object schema a provider accepts", () => {
    for (const t of [...CORE_REGISTRY.tools, ...GENERATE_TOOLS]) {
      expect(t.description.length, t.name).toBeGreaterThan(10);
      expect(t.input.type, t.name).toBe("object");
      expect(TOOL_GROUPS).toContain(t.group);
      wellFormed(t.input, t.name);
      if (t.readOnly) expect(t.destructive, t.name).toBe(false);
    }
    const defs = toolDefs(CORE_REGISTRY.tools);
    expect(JSON.parse(JSON.stringify(defs))).toEqual(defs);
  });

  it("cuts down to groups and to read-only tools", () => {
    const read = createRegistry({ groups: ["read"] });
    expect(read.tools.every((t) => t.group === "read" && t.readOnly)).toBe(true);
    expect(createRegistry({ readOnly: true }).tools.some((t) => t.name === "add_part")).toBe(false);
    expect(createRegistry({ groups: ["style"] }).tools.map((t) => t.name)).toContain("apply_style");
    expect(createRegistry({ extra: GENERATE_TOOLS }).byName("generate_svg")).toBeDefined();
  });

  it("writes a guide that names the tools there are", () => {
    const guide = toolGuide(CORE_REGISTRY.tools);
    expect(guide).toContain("apply_ops");
    expect(guide).toContain("- read: get_outline");
    expect(toolGuide(createRegistry({ groups: ["read"] }).tools)).not.toContain("apply_ops runs");
  });

  it("marks what takes things away, inside a batch too", () => {
    expect(isDestructiveCall("remove_nodes", { ids: ["a"] })).toBe(true);
    expect(isDestructiveCall("apply_ops", { ops: [{ op: "add_screen" }, { op: "clear" }] })).toBe(true);
    expect(isDestructiveCall("apply_ops", { ops: [{ op: "add_screen" }] })).toBe(false);
    expect(isDestructiveCall("set_props", {})).toBe(false);
  });

  it("knows the icon names as the bundled sets have them (bun scripts/gen-tool-icons.ts)", () => {
    expect(readFileSync(new URL("./icons.generated.ts", import.meta.url), "utf8")).toBe(iconSource());
  });
});

/** A part an old design holds that no tool adds any more (a retired one), put on a screen the way a file has it: the
 *  `old_part` step of `opCalls`. */
function oldPart(store: DocStore, a: Record<string, unknown>) {
  const { slug, id, screen, at, props } = a as { slug: string; id: string; screen: string; at: { x: number; y: number }; props: Record<string, unknown> };
  store.update("An old part", "system", (s) => {
    const f = s.doc.frames.find((x) => x.id === screen)!;
    return { ...s, doc: { ...s.doc, groups: [...s.doc.groups, { id: `g-${id}`, x: f.x + at.x, y: f.y + at.y, axis: "x", items: [{ ...makeItem(slug), id, props }] }] } };
  });
}

/** a call per operation, in an order that leaves each one something to work on */
function opCalls(): [string, Record<string, unknown>][] {
  const splittable = PARTS.find((d) => d.atoms && d.category !== "Basics")!.slug;
  const dock = PARTS.find((d) => d.panes)!.slug;
  return [
    ["set_title", { title: "Shop" }],
    ["set_brief", { brief: "Buy fruit." }],
    ["set_prompt", { promptOptions: null }],
    ["add_screen", { id: "home", name: "Home" }],
    ["add_screen", { id: "detail", name: "Detail" }],
    ["set_screen", { id: "home", patch: { note: "Where it starts" } }],
    ["add_part", { slug: "box", id: "col", screen: "home", at: { x: 16, y: 80 } }],
    ["set_layout", { id: "col", layout: "column", props: { gap: 12 } }],
    ["add_part", { slug: "text", id: "title", into: { container: "col" }, props: { text: "Hello" } }],
    ["add_part", { slug: "button", id: "b1", into: { container: "col" }, props: { label: "One" } }],
    ["add_part", { slug: "button", id: "b2", screen: "home", at: { x: 16, y: 400 }, props: { label: "Two" } }],
    ["add_part", { slug: "button", id: "b3", screen: "home", at: { x: 200, y: 420 }, props: { label: "Three" } }],
    ["add_part", { slug: "button", id: "b4", screen: "home", at: { x: 16, y: 600 }, props: { label: "Four" } }],
    ["set_props", { id: "title", props: { text: "Welcome" } }],
    ["set_item", { id: "b2", patch: { note: "Does the second thing", fill: "primaryContainer" } }],
    ["set_group", { id: "b2", patch: { name: "Second" } }],
    ["align", { ids: ["b2", "b3"], how: "top" }],
    ["align_to_parent", { id: "b2", how: "centerH" }],
    ["distribute", { ids: ["b2", "b3"], axis: "x", gap: 24 }],
    ["tidy_up", { ids: ["b2", "b3"] }],
    ["nudge", { ids: ["b2"], dx: 4, dy: 0 }],
    ["move_node", { id: "b3", x: 200, y: 480, screen: "home" }],
    ["z_order", { ids: ["b3"], to: "back" }],
    ["move_into", { id: "b3", container: "col" }],
    ["duplicate_nodes", { ids: ["b2"] }],
    ["group_nodes", { ids: ["b2", "b4"], id: "pair" }],
    ["reorder_items", { group: "pair", order: ["b4", "b2"] }],
    ["ungroup", { id: "pair" }],
    ["toggle_lock", { ids: ["b4"] }],
    ["toggle_lock", { ids: ["b4"] }],
    ["show_nodes", { ids: ["title"] }],
    ["add_kit", { slug: "search-bar", screen: "detail", at: { x: 16, y: 40 } }],
    ["add_tree", { screen: "detail", at: { x: 16, y: 120 }, tree: { part: "box", id: "tree", props: { layout: "row", gap: 8 }, children: [{ part: "icon", props: { name: "star" } }, { part: "text", props: { text: "Starred" } }] } }],
    ["add_part", { slug: splittable, id: "comp", screen: "detail", at: { x: 16, y: 200 } }],
    ["split_into_atoms", { id: "comp" }],
    /* an old design's retired parts: there are none in one built by the tools, which cannot add them (lib/retire.test.ts splits some) */
    ["split_retired", {}],
    ["add_part", { slug: dock, id: "dock", screen: "detail", at: { x: 16, y: 500 } }],
    ["reorder_panes", { id: "dock", order: [1, 0] }],
    ["add_part", { slug: "navigation-bar", id: "navb", screen: "detail", at: { x: 0, y: 760 }, props: { items: [{ label: "A" }, { label: "B" }, { label: "C" }] } }],
    ["set_rows", { id: "navb", prop: "items", rows: [{ label: "C" }, { label: "A" }, { label: "B" }] }],
    ["add_part", { slug: "split-view", id: "sv", screen: "detail", at: { x: 16, y: 560 }, props: { width: 380, height: 160, collapsible: "second" } }],
    ["set_split", { id: "sv", split: 30, collapsed: true }],
    /* a resizable is retired: an old design holds one, no tool adds it */
    ["old_part", { slug: "resizable", id: "rz", screen: "detail", at: { x: 16, y: 740 }, props: { width: 380 } }],
    ["convert_to_split_view", { id: "rz" }],
    ["wrap_in_auto_layout", { ids: ["b4"], id: "wrap" }],
    ["auto_layout_screen", { screen: "detail" }],
    ["tidy_screen", { screen: "home" }],
    ["place_in_screen", { ids: ["b4"], col: "centerH", row: "bottom" }],
    ["combine_buttons", { screen: "home" }],
    ["relayout", {}],
    ["make_component", { ids: ["col"], name: "Card", id: "cmp" }],
    ["rename_component", { id: "cmp", name: "Product card" }],
    ["edit_component", { id: "cmp", ops: [{ op: "set_props", args: { id: "b1", props: { label: "Inside" } } }] }],
    ["add_instance", { component: "cmp", id: "inst", screen: "detail", at: { x: 16, y: 700 } }],
    ["set_overrides", { id: "inst", overrides: null }],
    ["detach_instance", { id: "inst" }],
    ["add_instance", { component: "cmp", id: "inst2", screen: "detail", at: { x: 16, y: 760 } }],
    ["add_variant", { component: "cmp", id: "cmpB", setId: "cset", values: { State: "Pressed" } }],
    ["update_component_set", { id: "cset", name: "Card set" }],
    ["set_variant_values", { component: "cmpB", values: { State: "Hover" } }],
    ["swap_instance", { id: "inst2", component: "cmpB" }],
    ["set_component_prop", { component: "cmpB", id: "label", name: "Label", type: "text", targets: ["b1/label"] }],
    ["set_instance_props", { id: "inst2", values: { Label: "Buy" } }],
    ["reset_overrides", { id: "inst2" }],
    ["remove_component_prop", { component: "cmpB", id: "label" }],
    ["add_collection", { id: "fruit", name: "Fruit", fields: ["name"], rows: [["Apple"]] }],
    ["update_collection", { id: "fruit", rows: [["Apple"], ["Pear"]] }],
    ["add_part", { slug: "box", id: "rows", screen: "detail", at: { x: 16, y: 800 }, props: { layout: "column" } }],
    ["add_part", { slug: "text", id: "row", into: { container: "rows" }, props: { text: "{{name}}" } }],
    ["set_repeat", { id: "rows", repeat: { collection: "fruit" } }],
    ["add_var", { id: "who", name: "who", type: "text", value: "Ann" }],
    ["update_var", { id: "who", value: "Bo" }],
    ["add_var", { id: "flag", name: "flag", type: "bool", value: false }],
    ["remove_var", { id: "flag" }],
    ["add_var_collection", { id: "theme", name: "Theme", modes: ["Light", "Dark"] }],
    ["add_var", { id: "brand", name: "brand", type: "color", value: "#ffffff", collection: "theme", values: { Dark: "#000000" } }],
    ["update_var_collection", { id: "theme", name: "Colors" }],
    ["set_var_mode", { collection: "theme", mode: "Dark", screen: "home" }],
    ["bind_prop", { id: "b2", prop: "@fill", var: "brand" }],
    ["add_var_collection", { id: "spare", name: "Spare" }],
    ["remove_var_collection", { id: "spare" }],
    ["add_part", { slug: "button", id: "go", screen: "home", at: { x: 16, y: 760 }, props: { label: "Go" } }],
    ["set_action", { id: "go", action: { to: "detail" } }],
    ["set_action", { id: "go", action: { to: "detail", overlay: true, trigger: { on: "hover" }, motion: { kind: "push", dir: "up", easing: "inOut", ms: 300 } } }],
    ["set_flow_start", { screen: "home", name: "Checkout" }],
    ["bind_prop", { id: "row", prop: "text", var: "who" }],
    ["remove_collection", { id: "fruit" }],
    ["remove_component", { id: "cmp" }],
    ["set_theme", { patch: { dark: true } }],
    ["set_palette", { key: "blue" }],
    ["set_custom_palette", { palette: null }],
    ["set_dynamic_color", { on: true }],
    ["apply_style", { style: "ios" }],
    ["set_style_rules", { on: false }],
    ["set_style_layout", { patch: { margin: 20 } }],
    ["set_custom_styles", { styles: null }],
    ["add_custom_style", { style: { name: "Paper", extends: "ios", light: { primary: "#1F4E79" } }, wear: false }],
    ["set_icon", { id: "leaf", svg: '<svg viewBox="0 0 24 24"><path d="M4 20C4 9 11 4 20 4c0 9-5 16-16 16z"/></svg>' }],
    ["set_icon", { id: "gone", svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>' }],
    /* the asset pipeline's: the manifest in reach is the test fixtures' example (set before the calls) */
    ["set_asset_manifest", { path: "art/asset-manifest.json" }],
    ["set_asset", { id: "go", asset: "ui/coin" }],
    ["remove_icon", { id: "gone" }],
    ["resize_screen", { id: "detail", preset: "tablet" }],
    ["set_phone_model", { w: 390, h: 844 }],
    ["set_screen_length", { id: "home", length: 1200 }],
    ["set_screen_place", { id: "home", place: "center" }],
    ["move_screen", { id: "detail", x: 2400, y: 0 }],
    ["duplicate_screen", { id: "home", newId: "home2" }],
    ["create_screen_variant", { id: "home", preset: "desktop" }],
    ["add_template", { slug: TEMPLATES[0].slug }],
    ["remove_nodes", { ids: ["b4"] }],
    ["remove_screen", { id: "home2" }],
    ["set_canvas_mode", { mode: "blank" }],
    ["set_canvas_mode", { mode: "phone" }],
    ["set_api_info", { title: "Shop", version: "1.0.0" }],
    ["set_servers", { servers: [{ env: "dev", url: "http://localhost:3000" }, { env: "prod", url: "https://api.example.com", realtime: "wss://rt.example.com" }] }],
    ["add_model", { name: "Product", schema: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } }, required: ["id", "name"] } }],
    ["update_model", { name: "Product", properties: { price: { type: "number" } } }],
    ["rename_model", { name: "Product", to: "Item" }],
    ["add_endpoint", { operationId: "listItems", method: "get", path: "/items", pagination: { style: "cursor", items: "items" }, returns: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Item" } }, nextCursor: { type: ["string", "null"] } } } }],
    ["add_endpoint", { operationId: "login", method: "post", path: "/auth/login", security: [], body: { type: "object", properties: { email: { type: "string" } } }, returns: { type: "object", properties: { accessToken: { type: "string" } } } }],
    ["update_endpoint", { operationId: "listItems", summary: "Lists the items" }],
    ["set_auth", { schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, security: [{ bearerAuth: [] }], login: "login" }],
    ["add_channel", { id: "chat", address: "/rooms/{roomId}", messages: [{ name: "said", payload: { type: "string" } }], operations: [{ id: "onSaid", action: "send" }] }],
    ["update_channel", { id: "chat", summary: "A room" }],
    ["fill_mocks", {}],
    ["set_mocks", { seed: 7, locale: "en", latency: { min: 0, max: 10 } }],
    ["set_mock_model", { model: "Item", count: 5, hints: { name: { kind: "productName" } } }],
    ["pin_mock_records", { model: "Item", records: [{ id: "00000000-0000-4000-8000-000000000001", name: "Pinned" }] }],
    ["unpin_mock_records", { model: "Item", all: true }],
    ["add_mock_scenario", { name: "Empty", ops: { listItems: { empty: true } } }],
    ["update_mock_scenario", { id: "empty", latency: { min: 100, max: 200 } }],
    ["set_mocks", { scenario: "empty" }],
    ["remove_mock_scenario", { id: "empty" }],
    ["generate_mock_files", { kinds: ["image", "pdf"] }],
    ["add_mock_file", { name: "dot.png", data: "data:image/png;base64,iVBORw0KGgo=" }],
    ["update_mock_file", { id: "dot", tags: ["avatar"] }],
    ["remove_mock_file", { id: "dot" }],
    ["set_mock_realtime", { channel: "chat", steps: [{ at: 500, message: "said" }] }],
    ["remove_mock_realtime", { id: "chat-script" }],
    ["set_mock_auth", { signedIn: false, tokenTtl: 60 }],
    ["set_mock_route", { operationId: "listItems", kind: "list", model: "Item" }],
    /* the platform capabilities (lib/core/ops/capabilities.ts) */
    ["declare_capability", { name: "acme.ticket.scan", kind: "call", args: { type: "object", properties: { gate: { type: "string" } } }, result: { type: "object", properties: { ticket: { type: "string" } } }, failures: ["cancelled"] }],
    ["use_capabilities", { add: ["push.opened", "acme.ticket.scan"] }],
    ["set_mock_capability", { capability: "payment.pay", fail: "cancelled" }],
    ["set_mock_capability", { capability: "payment.pay", clear: true }],
    ["remove_capability", { name: "acme.ticket.scan" }],
    /* the gameplay contract (lib/core/ops/game.ts): the game loop's file linked, then unlinked */
    ["import_game_contract", { text: readFileSync(new URL("../game/fixtures/example.m3e-game.json", import.meta.url), "utf8"), path: "game-loop/contract.m3e-game.json" }],
    ["remove_game_contract", {}],
    ["clear_mocks", {}],
    ["remove_channel", { id: "chat" }],
    /* screens bound to the contract (lib/core/ops/bindings.ts) */
    ["add_screen", { id: "shop", name: "Shop" }],
    ["set_screen_params", { screen: "detail", params: [{ name: "itemId", type: "string", example: "i1" }] }],
    ["rename_screen_param", { screen: "detail", from: "itemId", to: "id" }],
    ["rename_screen_param", { screen: "detail", from: "id", to: "itemId" }],
    ["set_screen_auth", { screen: "shop", auth: "login" }],
    ["add_data_source", { screen: "shop", operationId: "listItems", name: "items" }],
    ["update_data_source", { screen: "shop", name: "items", pageSize: 10, paging: "button" }],
    ["wire_screen", { screen: "shop", operationId: "listItems", name: "more", detail: "detail" }],
    ["add_part", { slug: "box", id: "region", screen: "shop", at: { x: 16, y: 600 }, props: { layout: "column" } }],
    ["set_region", { id: "region", source: "items" }],
    ["set_region", { id: "region", show: "empty" }],
    ["remove_region", { id: "region" }],
    ["add_part", { slug: "text", id: "count", screen: "shop", at: { x: 16, y: 40 } }],
    ["bind_expression", { id: "count", prop: "text", expr: "plural(len(data.items.items), '# item', '# items')" }],
    ["make_form", { screen: "shop", operationId: "login" }],
    ["add_part", { slug: "box", id: "form2", screen: "shop", at: { x: 16, y: 700 }, props: { layout: "column" } }],
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    ["set_form", { id: "form2", form: { operationId: "login", then: { to: "detail", params: { itemId: "response.accessToken" } } } }],
    ["add_part", { slug: "input", id: "email2", into: { container: "form2" } }],
    ["bind_field", { id: "email2", field: "email" }],
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    ["set_action", { id: "go", action: { to: "detail", params: { itemId: "'i1'" }, when: { expr: "auth.signedIn || true" }, effects: [{ do: "call", operationId: "login", args: { email: "'a@b.co'" }, then: { to: "none", effects: [{ do: "refresh", source: "items" }] } }, { do: "signOut" }] } }],
    ["remove_data_source", { screen: "shop", name: "more" }],
    ["remove_endpoint", { operationId: "listItems" }],
    ["import_openapi", { text: "openapi: 3.1.0\ninfo: {title: X, version: '1'}\npaths:\n  /ping:\n    get:\n      operationId: ping\n      responses:\n        '204': {description: No Content}\n" }],
    ["import_asyncapi", { text: "asyncapi: 3.0.0\ninfo: {title: X, version: '1'}\nchannels:\n  pings:\n    address: /pings\n    messages:\n      ping: {payload: {type: string}}\n" }],
    ["add_channel", { id: "live", address: "/live/{itemId}", messages: [{ name: "tick", payload: { type: "object" } }], operations: [{ id: "onTick", action: "send" }] }],
    ["set_subscription", { screen: "detail", name: "live", channel: "live", actions: { "on:tick": { to: "none", effects: [{ do: "snackbar", message: "Tick {{event.payload.n}}" }] } } }],
    ["remove_subscription", { screen: "detail", name: "live" }],
    ["remove_model", { name: "Item", force: true }],
    ["clear", {}],
  ];
}

describe("every tool, headless", () => {
  it("runs every operation as a tool, each one undoable", async () => {
    const store = fresh();
    setAssetCatalog({ path: "art/asset-manifest.json", manifest: parseAssetManifest(readFileSync(new URL("../fixtures/assets/asset-manifest.json", import.meta.url), "utf8")).manifest, urls: {}, problems: [], stamp: "" });
    const called = new Set<string>();
    for (const [name, args] of opCalls()) {
      if (name === "old_part") {
        oldPart(store, args);
        continue;
      }
      const steps = store.history().length;
      const out = await executeTool(store, name, args, { origin: "mcp" });
      ok(out, name);
      called.add(name);
      if (!("nothing_to_do" in (out as { result: object }).result)) expect(store.history().length, name).toBeGreaterThanOrEqual(Math.min(steps + 1, 100));
    }
    for (const o of OPS) expect(called, o.name).toContain(o.name);
  });

  it("places what it adds into a layout where the editor would, without a canvas", async () => {
    const store = fresh();
    ok(await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { id: "s" } }, { op: "add_part", args: { slug: "box", id: "col", screen: "s", at: { x: 16, y: 80 } } }, { op: "add_part", args: { slug: "text", id: "a", into: { container: "col" } } }, { op: "add_part", args: { slug: "text", id: "b", into: { container: "col" } } }] }, { origin: "mcp" }));
    const at = (id: string) => store.get().doc.groups.find((g) => g.items[0].id === id)!;
    expect(at("a").y).toBeGreaterThan(at("col").y);
    expect(at("b").y).toBeGreaterThan(at("a").y);
  });

  it("runs every read tool", async () => {
    const store = fresh();
    const calls = opCalls();
    for (const [name, args] of calls.slice(0, calls.findIndex(([n]) => n === "make_component"))) {
      if (name === "old_part") oldPart(store, args);
      else await executeTool(store, name, args, { origin: "mcp" });
    }
    const shots: string[] = [];
    const renderer: Renderer = { screenshot: async (id) => (shots.push(id), "data:image/png;base64,iVBORw0KGgo=") };
    const reads: [string, Record<string, unknown>][] = [
      ["get_outline", {}],
      ["get_outline", { screen: "home", depth: 1, props: "none" }],
      ["get_outline", { format: "json" }],
      ["list_screens", {}],
      ["find_nodes", { slug: "button" }],
      ["describe_node", { id: "title" }],
      ["describe_node", { id: "home" }],
      ["get_selection", {}],
      ["list_parts", { tier: "atom" }],
      ["list_parts", { query: "cart" }],
      ["describe_part", { slug: "box" }],
      ["describe_part", { slug: "search-bar" }],
      ["describe_part", { slug: TEMPLATES[0].slug }],
      ["list_kits", { query: "tab" }],
      ["list_templates", { query: "login" }],
      ["list_styles", {}],
      ["get_style", {}],
      ["get_style", { key: "ios" }],
      ["look_reference", {}],
      ["list_icons", { query: "arrow", family: "lucide" }],
      ["list_components", {}],
      ["list_data", {}],
      ["screenshot", { id: "home" }],
    ];
    const before = store.get();
    for (const [name, args] of reads) {
      const out = await executeTool(store, name, args, { origin: "ai", renderer });
      ok(out, name);
    }
    expect(store.get().doc).toBe(before.doc);
    expect(shots).toEqual(["home"]);
    const part = ok(await executeTool(store, "describe_part", { slug: "button" }, { origin: "ai" }));
    expect((part.propsSchema as Schema).properties).toHaveProperty("label");
    const outline = (await executeTool(store, "get_outline", { screen: "home" }, { origin: "ai" })) as { result: string };
    expect(outline.result).toContain("title text");
  });

  it("hands back a screenshot as a picture, and says when there is no renderer", async () => {
    const store = fresh();
    await executeTool(store, "add_screen", { id: "s" }, { origin: "ai" });
    const shot = await executeTool(store, "screenshot", { id: "s" }, { origin: "ai", renderer: { screenshot: async () => "data:image/png;base64,AAAA" } });
    expect(shot.ok && shot.images).toEqual(["data:image/png;base64,AAAA"]);
    const none = await executeTool(store, "screenshot", { id: "s" }, { origin: "ai" });
    expect(!none.ok && none.error.code).toBe("unavailable");
  });
});

describe("apply_ops", () => {
  it("is one undo step for the whole batch", async () => {
    const store = fresh();
    const out = ok(await executeTool(store, "apply_ops", { label: "Login", ops: [{ op: "add_screen", args: { id: "login" } }, { op: "add_part", args: { slug: "text", id: "t", screen: "login" } }, { op: "set_props", args: { id: "t", props: { text: "Sign in" } } }] }, { origin: "ai" }));
    expect(out.ran).toBe(3);
    expect(store.history()).toEqual(["Login"]);
    store.undo();
    expect(store.get().doc.frames).toEqual([]);
    expect(store.get().doc.groups).toEqual([]);
  });

  it("is all or nothing: one failure leaves the document and the history as they were", async () => {
    const store = fresh();
    await executeTool(store, "add_screen", { id: "s" }, { origin: "ai" });
    const before = savedDoc(store.get());
    const steps = store.history().length;
    const out = await executeTool(store, "apply_ops", { ops: [{ op: "add_part", args: { slug: "text", id: "t", screen: "s" } }, { op: "set_props", args: { id: "t", props: { colour: "red" } } }] }, { origin: "ai" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_value");
      expect(out.error.message).toMatch(/^ops\[1\] \(set_props\) failed, so none of the 2 operations ran/);
      expect(out.error.message).toContain("colour");
      expect(out.error.hint).toBeTruthy();
    }
    expect(savedDoc(store.get())).toEqual(before);
    expect(store.history().length).toBe(steps);
  });

  it("checks each entry against its operation's schema", async () => {
    const store = fresh();
    const out = await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { w: "wide" } }] }, { origin: "ai" });
    expect(!out.ok && out.error.code).toBe("bad_args");
    const unknown = await executeTool(store, "apply_ops", { ops: [{ op: "get_outline" }] }, { origin: "ai" });
    expect(!unknown.ok && unknown.error.code).toBe("bad_args");
  });

  it("joins the step its caller keeps when told to keep none", async () => {
    const store = fresh();
    const prevs: unknown[] = [];
    await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { id: "s" } }] }, { origin: "ai", history: "none", onWrite: (p) => prevs.push(p) });
    expect(store.history()).toEqual([]);
    expect(prevs).toHaveLength(1);
  });
});

describe("errors a model can act on", () => {
  it("names an unknown tool and lists the ones there are", async () => {
    const out = await executeTool(fresh(), "make_it_pretty", {}, { origin: "ai" });
    expect(!out.ok && out.error.code).toBe("unknown_tool");
    expect(!out.ok && out.error.hint).toContain("get_outline");
  });

  it("refuses arguments the schema does not allow, saying which", async () => {
    const out = await executeTool(fresh(), "add_screen", { preset: "watch" }, { origin: "ai" });
    expect(out).toMatchObject({ ok: false, error: { code: "bad_args" } });
    expect(!out.ok && out.error.message).toContain("preset");
  });

  it("says what is missing and where to look", async () => {
    const out = await executeTool(fresh(), "describe_node", { id: "ghost" }, { origin: "ai" });
    expect(out).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(!out.ok && out.error.hint).toMatch(/get_outline|find_nodes/);
  });

  it("refuses a locked part", async () => {
    const store = fresh();
    await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { id: "s" } }, { op: "add_part", args: { slug: "text", id: "t", screen: "s" } }, { op: "toggle_lock", args: { ids: ["t"] } }] }, { origin: "ai" });
    const out = await executeTool(store, "set_props", { id: "t", props: { text: "x" } }, { origin: "ai" });
    expect(out).toMatchObject({ ok: false, error: { code: "locked" } });
  });

  it("reads a tap with only effects as going nowhere, alone and in a batch", async () => {
    const store = fresh();
    ok(await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { id: "s" } }, { op: "add_var", args: { id: "dark", name: "dark", type: "bool", value: false } }, { op: "add_part", args: { slug: "switch", id: "sw", screen: "s" } }, { op: "set_action", args: { id: "sw", action: { effects: [{ do: "toggleVar", var: "dark" }] } } }] }, { origin: "ai" }));
    const tap = () => store.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === "sw")?.action;
    expect(tap()).toMatchObject({ to: "none", effects: [{ do: "toggleVar", var: "dark" }] });
    ok(await executeTool(store, "set_item", { id: "sw", patch: { action: { effects: [{ do: "setVar", var: "dark", value: true }] } } }, { origin: "ai" }));
    expect(tap()).toMatchObject({ to: "none" });
    /* the answers of an invoke inside a call's answer too */
    ok(await executeTool(store, "apply_ops", { ops: [{ op: "add_endpoint", args: { operationId: "createOrder", method: "post", path: "/orders", returns: { type: "object", properties: { id: { type: "string" } } } } }] }, { origin: "ai" }));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const pay = { do: "invoke", capability: "payment.pay", args: { orderId: "response.id" }, then: { effects: [{ do: "setVar", var: "dark", value: false }] }, catch: { effects: [{ do: "snackbar", message: "x" }] } };
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    ok(await executeTool(store, "set_action", { id: "sw", action: { effects: [{ do: "call", operationId: "createOrder", then: { effects: [pay] } }] } }, { origin: "ai" }));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    expect(tap()).toMatchObject({ to: "none", effects: [{ do: "call", then: { to: "none", effects: [{ do: "invoke", then: { to: "none" }, catch: { to: "none" } }] } }] });
  });

  it("reports nothing to do as done, not as an error", async () => {
    const store = fresh();
    await executeTool(store, "set_title", { title: "A" }, { origin: "ai" });
    const out = await executeTool(store, "set_title", { title: "A" }, { origin: "ai" });
    expect(out.ok).toBe(true);
  });
});

/* ---------- drawing ---------- */

const SETTINGS: AiSettings = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", key: "k" };

describe("generate_svg and generate_image", () => {
  const withScreen = async () => {
    const store = fresh();
    await executeTool(store, "apply_ops", { ops: [{ op: "add_screen", args: { id: "s" } }, { op: "add_part", args: { slug: "box", id: "bar", screen: "s", at: { x: 0, y: 800 }, props: { layout: "row" } } }, { op: "add_part", args: { slug: "icon", id: "ic", into: { container: "bar" } } }, { op: "add_part", args: { slug: "text", id: "lbl", into: { container: "bar" }, props: { text: "Home" } } }] }, { origin: "ai" });
    return store;
  };
  const reg = createRegistry({ extra: GENERATE_TOOLS });

  it("writes an icon as code and puts it in place of another part, in its layout", async () => {
    const store = await withScreen();
    const adapter = scriptedAdapter([{ text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z" fill="currentColor"/></svg>' }]);
    const out = ok(await executeTool(store, "generate_svg", { prompt: "a leaf", route: "code", replace: "ic", id: "leaf" }, { origin: "ai", registry: reg, gen: { settings: SETTINGS, adapter } }));
    expect(out).toMatchObject({ itemId: "leaf", route: "code", replaced: "ic" });
    const groups = store.get().doc.groups;
    const leaf = groups.find((g) => g.items[0].id === "leaf")!;
    expect(leaf.items[0].component).toBe("svg");
    expect(leaf.items[0].props).toMatchObject({ mode: "markup" });
    expect(String(leaf.items[0].props?.markup)).toContain("<path");
    expect(groups.some((g) => g.items[0].id === "ic")).toBe(false);
    /* first in the bar's run, where the icon was */
    const bar = groups.find((g) => g.items[0].id === "bar")!;
    expect(groups.filter((g) => g.inFlow === bar.id).map((g) => g.items[0].id)).toEqual(["leaf", "lbl"]);
  });

  it("keeps a drawing as a document icon: an icon atom takes its name, a place gets a new one, or it is only kept", async () => {
    const store = await withScreen();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z" fill="currentColor"/></svg>';
    const adapter = scriptedAdapter([{ text: svg }, { text: svg.replace("M2 2", "M4 4") }, { text: svg.replace("M2 2", "M6 6") }]);
    const env = { origin: "ai" as const, registry: reg, gen: { settings: SETTINGS, adapter } };
    const steps = store.history().length;
    const first = ok(await executeTool(store, "generate_svg", { prompt: "a leaf", route: "code", replace: "ic", icon: "leaf" }, env));
    expect(first).toMatchObject({ icon: "svg:leaf", itemId: "ic", route: "code" });
    const ic = store.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === "ic")!;
    expect(ic.component).toBe("icon");
    expect(ic.props?.name).toBe("svg:leaf");
    expect(store.get().doc.icons?.leaf).toContain("<path");
    /* one step for the drawing kept and put to use */
    expect(store.history().length).toBe(steps + 1);
    const placed = ok(await executeTool(store, "generate_svg", { prompt: "A rocket ship", route: "code", screen: "s", at: { x: 40, y: 200 }, icon: "" }, env));
    expect(placed.itemId).toBeTruthy();
    const kept = ok(await executeTool(store, "generate_svg", { prompt: "a coffee cup", route: "code", icon: "cup" }, env));
    expect(kept).toEqual(expect.objectContaining({ icon: "svg:cup" }));
    expect(kept.itemId).toBeUndefined();
    expect(Object.keys(store.get().doc.icons ?? {}).sort()).toEqual(["cup", "leaf"]);
    /* a tab bar's tabs take it like any name */
    ok(await executeTool(store, "add_part", { slug: "navigation-bar", id: "nav", screen: "s" }, { origin: "ai" }));
    ok(await executeTool(store, "set_props", { id: "nav", props: { items: [{ label: "Coffee", icon: "svg:cup" }, { label: "Home", icon: "home" }, { label: "Me", icon: "person" }] } }, { origin: "ai" }));
    expect(ok(await executeTool(store, "list_icons", { query: "cup" }, { origin: "ai" })).document).toEqual(["svg:cup"]);
  });

  it("traces an icon from the image model, without its backdrop, in the part's own color", async () => {
    const store = await withScreen();
    const svg = '<svg viewBox="0 0 1024 1024" width="1024" height="1024"><title>x</title><rect width="1024" height="1024" fill="#ffffff"/><path d="M100 100L900 900" fill="#111111"/><circle cx="500" cy="500" r="40" fill="#fefefe"/></svg>';
    const b64 = Buffer.from(svg).toString("base64");
    const f = fakeFetch(sseResponse(sseText([{ type: "response.image_generation_call.generating" }, { type: "response.output_item.done", item: { type: "image_generation_call", status: "completed", result: b64 } }, { type: "response.completed", response: { usage: { input_tokens: 5, output_tokens: 5 } } }])));
    const out = ok(await executeTool(store, "generate_svg", { prompt: "a house", screen: "s", at: { x: 20, y: 20 } }, { origin: "ai", registry: reg, gen: { settings: SETTINGS, fetch: f } }));
    expect(out.route).toBe("image");
    expect(f.calls[0].url).toBe("https://api.openai.com/v1/responses");
    const markup = String(store.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === out.itemId)?.props?.markup);
    expect(markup).not.toContain("<rect");
    expect(markup).toContain('fill="currentColor"');
    expect(markup).toContain('fill="none"');
  });

  it("keeps to a turn's budget of drawings, and says when it cannot draw", async () => {
    const store = await withScreen();
    const out = await executeTool(store, "generate_svg", { prompt: "x" }, { origin: "ai", registry: reg, gen: { settings: SETTINGS, budget: { left: 0 } } });
    expect(out).toMatchObject({ ok: false, error: { code: "refused" } });
    const none = await executeTool(store, "generate_svg", { prompt: "x" }, { origin: "ai", registry: reg });
    expect(none).toMatchObject({ ok: false, error: { code: "unavailable" } });
  });

  it("paints a picture into an image part", async () => {
    const store = await withScreen();
    await executeTool(store, "add_part", { slug: "image", id: "pic", screen: "s", at: { x: 0, y: 100 } }, { origin: "ai" });
    const f = fakeFetch(new Response(JSON.stringify({ data: [{ b64_json: "/9j/AAAA" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = f;
    try {
      const out = ok(await executeTool(store, "generate_image", { prompt: "apples on a table", replace: "pic" }, { origin: "ai", registry: reg, gen: { settings: SETTINGS } }));
      expect(out.itemId).toBe("pic");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(store.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === "pic")?.props?.src).toBe("data:image/jpeg;base64,/9j/AAAA");
  });

  it("strips only a rectangle that covers the whole drawing, and inks one-color icons", () => {
    const m = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><rect x="10" y="10" width="20" height="20" fill="#000"/></svg>';
    expect(stripBackdrop(m)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20" fill="#000"/></svg>');
    expect(toCurrentColor('<path fill="#222" stroke="none"/><path fill="#ffffff"/><path style="fill:#333;opacity:1"/>')).toBe('<path fill="currentColor" stroke="none"/><path fill="none"/><path style="fill:currentColor;opacity:1"/>');
  });
});
