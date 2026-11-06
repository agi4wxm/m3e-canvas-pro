/* The MCP server: the registry's tools (lib/tools) described as MCP tools, with their JSON Schema in and out and the
 * hints a client reads (read-only, destructive, idempotent), the tool guide as the server's instructions and as a
 * prompt, and the document and the catalogs as resources. Calls go to the backend (live tab, file, or either); a
 * screenshot comes back as an image. One `Server` per MCP session; every session of a process shares its backend. */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type CallToolResult,
  type Tool as McpTool,
} from "@modelcontextprotocol/sdk/types.js";
import { DocStore, guessMeasurer, stateOf } from "../../lib/core";
import type { ClientInfo } from "../../lib/mcp/protocol";
import { executeTool, isDestructiveCall, toolDefs, toolGuide, type Registry, type Tool } from "../../lib/tools";
import type { Backend, CallContext, CallOutcome } from "./backend";
import type { Log } from "./log";

export type McpServerOptions = {
  backend: Backend;
  /** every tool this server may offer; a session the author made read-only gets the reading ones */
  registry: Registry;
  version: string;
  log: Log;
};

/* ---------- describing the tools ---------- */

/** what a tool is called on a client's screen: get_outline → Get outline */
const titleOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll("_", " ");

/** calls that leave the document the same when repeated with the same arguments */
const idempotent = (t: Tool<never>) => t.readOnly || /^(set_|update_|remove_)/.test(t.name) || ["bind_prop", "apply_style", "clear"].includes(t.name);

/** the tool the server adds of its own: where calls go and how to connect the editor */
const STATUS: McpTool = {
  name: "connection_status",
  title: "Connection status",
  description:
    "Where this server's calls go (a live editor tab, a project file, or the tab when one is paired and the file otherwise), whether an editor tab is paired and with what access, and, when none is, the pairing code and how the author connects one. Call it when a tool says no editor is connected.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object", properties: { result: { type: "object", description: "the backend's status" } }, required: ["result"] },
  annotations: { title: "Connection status", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

/** the tools a file's own history adds (file mode): the server's session of changes, taken back or made again */
const HISTORY: McpTool[] = (["undo", "redo"] as const).map((name) => ({
  name,
  title: titleOf(name),
  description:
    name === "undo"
      ? "Takes back the last change this server made to the project file (one tool call, or one apply_ops batch) and saves the file. The history is this server's session: it starts when the file is opened, and again whenever another program changes the file. Use it to step back from a change that made things worse."
      : "Makes the last change undo took back again, and saves the file. A new change after an undo ends what can be redone.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object", properties: { result: { type: "object", description: name === "undo" ? "{undone: the change's name, canUndo, canRedo}, or {nothing_to_do}" : "{redone: the change's name, canUndo, canRedo}, or {nothing_to_do}" } }, required: ["result"] },
  annotations: { title: titleOf(name), readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}));

export function describeTool(t: Tool<never>): McpTool {
  const def = toolDefs([t])[0];
  return {
    name: t.name,
    title: titleOf(t.name),
    description: def.description,
    inputSchema: t.input as McpTool["inputSchema"],
    /* a result is any JSON (an outline is words, a list is an array): it is carried under `result` */
    outputSchema: { type: "object", properties: { result: { description: t.output ?? "what the tool reports" } }, required: ["result"] },
    annotations: { title: titleOf(t.name), readOnlyHint: t.readOnly, destructiveHint: !t.readOnly && t.destructive, idempotentHint: idempotent(t), openWorldHint: t.group === "generate" },
  };
}

/** the words a session starts with: the registry's guide, and what is particular to MCP */
export function instructionsFor(tools: Tool<never>[]): string {
  return [
    "M3E Canvas Pro is a browser editor for interactive app prototypes. This server works on one of its documents: a live editor tab the author paired (changes appear on their canvas at once, each call is one step they can undo), or a project file. Destructive calls (removing screens or parts, clearing) wait for the author's confirmation. If a call says no editor is connected, call connection_status and tell the author the pairing code: they type it into the editor (it is never shown there, so only you can give it to them).",
    "",
    toolGuide(tools),
  ].join("\n");
}

/* ---------- results ---------- */

const imageOf = (url: string) => {
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]*)$/.exec(url);
  return m ? { type: "image" as const, data: m[2], mimeType: m[1] } : null;
};

export function callResult(out: CallOutcome): CallToolResult {
  const notice = out.notice ? [{ type: "text" as const, text: `Note: ${out.notice}` }] : [];
  if (!out.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: out.error }) }, ...notice] };
  const images = (out.images ?? []).map(imageOf).filter((x) => x !== null);
  const text = typeof out.result === "string" ? out.result : JSON.stringify(out.result);
  return { content: [{ type: "text", text }, ...images, ...notice], structuredContent: { result: out.result } };
}

/* ---------- resources ---------- */

type Res = { uri: string; name: string; title: string; description: string; mimeType: string; tool: string; args?: Record<string, unknown>; catalog?: boolean };

const RESOURCES: Res[] = [
  { uri: "m3e://document/outline", name: "outline", title: "Document outline", description: "Title, style, components, collections, variables, then every screen and the tree of its parts.", mimeType: "text/markdown", tool: "get_outline" },
  { uri: "m3e://document/screens", name: "screens", title: "Screens", description: "Every screen: id, name, size, background, part count.", mimeType: "application/json", tool: "list_screens" },
  { uri: "m3e://document/components", name: "components", title: "Reusable components", description: "The document's components and their instances.", mimeType: "application/json", tool: "list_components" },
  { uri: "m3e://document/data", name: "data", title: "Data and variables", description: "Collections and prototype variables.", mimeType: "application/json", tool: "list_data" },
  { uri: "m3e://document/styles", name: "styles", title: "Styles", description: "The style the document wears, the built-in style packs and the document's own styles.", mimeType: "application/json", tool: "list_styles" },
  { uri: "m3e://catalog/parts", name: "parts", title: "Parts catalog", description: "Atoms and composites: slug, name, category, props.", mimeType: "application/json", tool: "list_parts", catalog: true },
  { uri: "m3e://catalog/kits", name: "kits", title: "Kits catalog", description: "Compositions of atoms that follow the style.", mimeType: "application/json", tool: "list_kits", catalog: true },
  { uri: "m3e://catalog/templates", name: "templates", title: "Templates catalog", description: "Screen and flow templates.", mimeType: "application/json", tool: "list_templates", catalog: true },
  { uri: "m3e://catalog/looks", name: "looks", title: "Looks reference", description: "How to write a part's effects, the presets and the color roles.", mimeType: "application/json", tool: "look_reference", catalog: true },
  { uri: "m3e://catalog/icons", name: "icons", title: "Icon names", description: "The Material Symbols names every icon family draws offline.", mimeType: "application/json", tool: "list_icons", catalog: true },
];

const TEMPLATES = [
  { uriTemplate: "m3e://screen/{id}/outline", name: "screen-outline", title: "Outline of a screen", description: "One screen's tree of parts.", mimeType: "text/markdown" },
  { uriTemplate: "m3e://screen/{id}/screenshot", name: "screen-screenshot", title: "Screenshot of a screen", description: "A PNG of a screen (or a part) as the app draws it.", mimeType: "image/png" },
  { uriTemplate: "m3e://node/{id}", name: "node", title: "A part on the canvas", description: "Everything about one part: bounds, layout, props and the values they take.", mimeType: "application/json" },
  { uriTemplate: "m3e://part/{slug}", name: "part", title: "A part of the catalog", description: "One part or kit in full, with the JSON Schema of its props.", mimeType: "application/json" },
];

/** the call a resource address reads */
function resourceCall(uri: string): { tool: string; args: Record<string, unknown>; mimeType: string; catalog?: boolean } | null {
  const fixed = RESOURCES.find((r) => r.uri === uri);
  if (fixed) return { tool: fixed.tool, args: fixed.args ?? {}, mimeType: fixed.mimeType, catalog: fixed.catalog };
  let m = /^m3e:\/\/screen\/([^/]+)\/outline$/.exec(uri);
  if (m) return { tool: "get_outline", args: { screen: decodeURIComponent(m[1]) }, mimeType: "text/markdown" };
  m = /^m3e:\/\/screen\/([^/]+)\/screenshot$/.exec(uri);
  if (m) return { tool: "screenshot", args: { id: decodeURIComponent(m[1]) }, mimeType: "image/png" };
  m = /^m3e:\/\/node\/([^/]+)$/.exec(uri);
  if (m) return { tool: "describe_node", args: { id: decodeURIComponent(m[1]) }, mimeType: "application/json" };
  m = /^m3e:\/\/part\/([^/]+)$/.exec(uri);
  if (m) return { tool: "describe_part", args: { slug: decodeURIComponent(m[1]) }, mimeType: "application/json", catalog: true };
  return null;
}

/** what does not depend on the document can be read with no editor connected */
let scratch: DocStore | null = null;
const scratchStore = () => (scratch ??= new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer }));

/* ---------- the server ---------- */

export function createMcpServer(o: McpServerOptions): Server {
  const { backend, registry, log } = o;
  const visible = () => registry.tools.filter((t) => t.readOnly || backend.access() === "edit");
  const server = new Server(
    { name: "m3e-canvas", title: "M3E Canvas", version: o.version },
    { capabilities: { tools: { listChanged: true }, prompts: {}, resources: { subscribe: true } }, instructions: instructionsFor(registry.tools) },
  );
  let client: ClientInfo | null = null;
  server.oninitialized = () => {
    const v = server.getClientVersion();
    client = v ? { name: v.name, version: v.version, ...(v.title ? { title: v.title } : {}) } : null;
    backend.setClient(client);
    log.info(`MCP client: ${client ? `${client.title ?? client.name} ${client.version ?? ""}`.trim() : "unnamed"}.`);
  };

  /* a destructive call in file mode is put to the person at the client, when the client can ask them */
  const confirm = async (message: string): Promise<boolean | null> => {
    if (!server.getClientCapabilities()?.elicitation) return null;
    try {
      const r = await server.elicitInput({ message, requestedSchema: { type: "object", properties: { allow: { type: "boolean", title: "Allow", description: "Let this change go ahead" } }, required: ["allow"] } }, { timeout: 120_000 });
      return r.action === "accept" && r.content?.allow === true;
    } catch {
      return null;
    }
  };
  const ctx = (signal?: AbortSignal, destructive = false): CallContext => ({ signal, client, destructive, confirm });

  /* a file's own history, while the session may edit */
  const history = () => (backend.history && backend.access() === "edit" ? HISTORY : []);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...visible().map(describeTool), ...history(), STATUS] }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const { name } = req.params;
    const args = req.params.arguments ?? {};
    if (name === STATUS.name) return callResult({ ok: true, result: backend.status() });
    if ((name === "undo" || name === "redo") && history().length) return callResult(await backend.history!(name));
    const t = registry.byName(name);
    if (!t) return callResult({ ok: false, error: { code: "unknown_tool", message: `There is no tool "${name}".`, hint: `The tools are: ${visible().map((x) => x.name).join(", ")}.` } });
    if (!t.readOnly && backend.access() === "read") return callResult({ ok: false, error: { code: "refused", message: "This session is read-only.", hint: "Read and screenshot only, or ask the author for edit access." } });
    /* a long call (a drawing) says it is still going, so a client that waits on progress does not give up on it */
    const token = req.params._meta?.progressToken;
    let n = 0;
    const beat = token !== undefined ? setInterval(() => void extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message: `${name} is still running` } }).catch(() => {}), 5000) : null;
    try {
      const out = await backend.call(name, args, ctx(extra.signal, isDestructiveCall(name, args)));
      log.debug(`${name} → ${out.ok ? "ok" : `${out.error.code}: ${out.error.message}`}`);
      return callResult(out);
    } finally {
      if (beat) clearInterval(beat);
    }
  });

  /* ---------- the guide ---------- */

  const PROMPTS = [
    { name: "guide", title: "How to work on an M3E Canvas design", description: "The tool guide: how a document is read, built and checked with these tools." },
    { name: "design_screen", title: "Design a screen", description: "Builds a screen from a brief, then checks it by eye.", arguments: [{ name: "brief", description: "what the screen is for and what it holds", required: true }, { name: "style", description: "a style pack to wear (list_styles), optional" }] },
  ];
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const guide = instructionsFor(visible());
    if (req.params.name === "guide") return { description: PROMPTS[0].description, messages: [{ role: "user", content: { type: "text", text: guide } }] };
    if (req.params.name === "design_screen") {
      const brief = req.params.arguments?.brief?.trim();
      if (!brief) throw new McpError(ErrorCode.InvalidParams, "design_screen needs a brief.");
      const style = req.params.arguments?.style?.trim();
      const steps = [
        `Design this screen in the open M3E Canvas document: ${brief}`,
        "1. Read get_outline (small depth) to see what is there, and list_kits / list_parts for what to build with.",
        style ? `2. Wear the style "${style}" (apply_style) unless it already does.` : "2. Keep the document's style.",
        "3. Build the screen in one or two apply_ops batches, kits before hand-made compositions, giving new parts your own ids.",
        "4. Take a screenshot of the screen, look at it, and fix what looks wrong (spacing, overflow, contrast, anything missing).",
        "5. Say what you made in two or three sentences.",
      ];
      return { description: PROMPTS[1].description, messages: [{ role: "user", content: { type: "text", text: `${guide}\n\n${steps.join("\n")}` } }] };
    }
    throw new McpError(ErrorCode.InvalidParams, `There is no prompt "${req.params.name}".`);
  });

  /* ---------- resources ---------- */

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [...RESOURCES.map(({ uri, name, title, description, mimeType }) => ({ uri, name, title, description, mimeType })), { uri: "m3e://guide", name: "guide", title: "Tool guide", description: "How to work on a document with these tools.", mimeType: "text/markdown" }] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: TEMPLATES }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req, extra) => {
    const uri = req.params.uri;
    if (uri === "m3e://guide") return { contents: [{ uri, mimeType: "text/markdown", text: instructionsFor(visible()) }] };
    const call = resourceCall(uri);
    if (!call) throw new McpError(ErrorCode.InvalidParams, `There is no resource ${uri}.`);
    let out: CallOutcome = await backend.call(call.tool, call.args, ctx(extra.signal));
    /* the catalogs are the same everywhere: with no tab connected they are read here */
    if (!out.ok && out.error.code === "unavailable" && call.catalog) out = await executeTool(scratchStore(), call.tool, call.args, { origin: "mcp", registry });
    if (!out.ok) throw new McpError(out.error.code === "not_found" || out.error.code === "bad_args" ? ErrorCode.InvalidParams : ErrorCode.InternalError, `${out.error.message}${out.error.hint ? ` ${out.error.hint}` : ""}`);
    if (call.mimeType === "image/png") {
      const img = out.images?.[0] && imageOf(out.images[0]);
      if (!img) throw new McpError(ErrorCode.InternalError, "No picture came back.");
      return { contents: [{ uri, mimeType: img.mimeType, blob: img.data }] };
    }
    return { contents: [{ uri, mimeType: call.mimeType, text: typeof out.result === "string" ? out.result : JSON.stringify(out.result, null, 1) }] };
  });

  /* a client that subscribed to the document hears when it changes, a moment after (several changes, one word) */
  const subscribed = new Set<string>();
  server.setRequestHandler(SubscribeRequestSchema, async (req) => {
    subscribed.add(req.params.uri);
    return {};
  });
  server.setRequestHandler(UnsubscribeRequestSchema, async (req) => {
    subscribed.delete(req.params.uri);
    return {};
  });
  let soon: ReturnType<typeof setTimeout> | null = null;
  const off = backend.onChange((what) => {
    if (what === "access") {
      void server.sendToolListChanged().catch(() => {});
      return;
    }
    if (!subscribed.size || soon) return;
    soon = setTimeout(() => {
      soon = null;
      for (const uri of subscribed) if (!uri.startsWith("m3e://catalog/") && !uri.startsWith("m3e://part/")) void server.sendResourceUpdated({ uri }).catch(() => {});
    }, 400);
  });
  server.onclose = () => {
    off();
    if (soon) clearTimeout(soon);
  };
  return server;
}
