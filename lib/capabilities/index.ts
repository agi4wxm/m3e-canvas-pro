/* Platform capabilities (docs/平台能力.md): the catalog, a document's own, the registry an app invokes them through, the
 * mock library's answers. types.ts, catalog.ts, registry.ts and mock.ts stand on their own and are copied into an
 * exported app's packages/capabilities; clean.ts and doc.ts read documents. */

export * from "./types";
export { CAPABILITY_CATALOG, PROVIDERS, allCapabilities, argNamesOf, capabilityOf, exampleOf, failuresOf, requiredArgsOf, standardCapability, type Provider } from "./catalog";
export { CapabilityFailure, createCapabilities, fail, missingAdapterWords, type CapabilityRegistry, type RegistryOptions } from "./registry";
export { createMockCapabilities, type CapabilityLogEntry, type MockCapabilities, type MockCapabilityOptions, type MockCapabilitySource } from "./mock";
export { cleanCapabilities, cleanCapabilityDef, isCapabilityName } from "./clean";
export { capabilitiesUsed, invokesIn, invokesOfItem, usedDefinitions, viewOf } from "./doc";
