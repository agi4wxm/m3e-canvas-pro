/* The document core: one store the editor, the in-app agent and the MCP server all change a document through, typed
 * operations, and queries. See docs/组件规范.md, “文档核心”. */

export * from "./state";
export * from "./store";
export { OpError, op, runOp, schemaError, guessMeasurer, sessionMeasurer, type Op, type OpCtx, type OpResult, type Measurer, type Schema } from "./op";
export * as ops from "./ops";
export { OPS, opByName } from "./ops";
export * from "./query";
