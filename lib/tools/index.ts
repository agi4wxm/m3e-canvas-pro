/* The tool registry: typed tools over the document core, shared by the in-app agent (lib/agent) and the MCP server.
 * See docs/组件规范.md, “AI”. The generative tools live in ./generate and are added by whoever has the keys. */

export * from "./types";
export { CORE_REGISTRY, CORE_TOOLS, createRegistry, executeTool, toolDefs, toolGuide, type ExecOptions, type Registry } from "./registry";
export { DESTRUCTIVE_OPS, OP_TOOLS, applyOps, isDestructiveCall } from "./ops";
export { READ_TOOLS } from "./read";
export { API_READ_TOOLS } from "./apiRead";
export { MOCK_READ_TOOLS } from "./mocksRead";
export { CAPABILITY_READ_TOOLS } from "./capabilitiesRead";
export { ASSET_READ_TOOLS } from "./assetsRead";
export { REFERENCE_TOOLS } from "./reference";
export { compareGrid, decodePng, paletteOf, readPixels, regionColor, type Pixels } from "./pixels";
export { opInput, partPropsSchema, propSchema } from "./schema";
