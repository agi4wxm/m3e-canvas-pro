//! Written once (lib/export/copy.ts seededFile) into apps/mobile/src/custom/setup.ts of every product with a mobile app, never
//! changed again: custom code's place. Typechecked and linted with the kit.
/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. setup() runs as the app starts: start an SDK
 * (analytics, payments, push), or answer the API another way:
 *   import { runtime } from "../generated/runtime";
 *   runtime.setTransport(myTransport);
 * In development the mocks answer the API; @@scope@@/mocks/native (startNative)
 * serves them through MSW instead.
 */
export async function setup(): Promise<void> {}
