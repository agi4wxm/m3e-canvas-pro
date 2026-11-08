//! Not copied: the product's packages/api/src/index.ts is printed with its contract (lib/export/targets/api.ts INDEX).
//! It stands here for "@m3e/api" (tsconfig.json, vitest.config.ts): the client every product has, before its operations.
export * from "./transport"
export * from "./client"
export * from "./fetch"
export { readBody, textBody, type RawResponse, type ResponseFile } from "./body"
