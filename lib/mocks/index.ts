/* The mock library (docs/模拟库.md): the document's API answered with made-up data while the product is designed, in
 * the editor's preview, in the exported apps' development servers and tests, and in a mini-program. No DOM, no
 * network, no Node: the same files are copied into the exported packages/mocks (lib/export/targets/mocks.ts). */

export * from "./types";
export { createMockTransport, bodyText, MOCK_ENGINE, type MockLogEntry, type MockOptions, type MockTransport } from "./transport";
export { MockData, type MockCollection, type MockSource } from "./data";
export { DEFAULT_COUNT, clone, idFieldOf, modelShape, listedModels, mergeAllOf } from "./shape";
export { generateValue, generateRecord, timeOf, type GenOptions } from "./generate";
export { inferHint, kindsFor, wordsOf } from "./hints";
export { compileRoutes, matchRoute, type Route, type RouteKind } from "./routes";
export { checkValue, type FieldError } from "./check";
export { fakeClock, realClock, type MockClock } from "./clock";
export { defaultScripts, type MockConnection, type MockMessage } from "./realtime";
export { defaultScenarios, fillMocks, inferredHints } from "./fill";
export { extensionOf, kindOfType, placeholderFile, posterOf, type FileKind } from "./files";
export { dataUrl, dataUrlSize, parseDataUrl, fromBase64, toBase64, utf8 } from "./bytes";
export { rngOf, hash53 } from "./rng";
