//! Filled in for the product (lib/export/regions.ts, lib/export/copy.ts filledFile) into apps/mobile/src/generated/contract.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import type { AuthConfig, FieldRule, HttpMethod, ListAt, Paging } from "@m3e/app-runtime"

/** an operation of the contract as the app calls it */
export type Operation = {
  method: HttpMethod
  path: string
  /** where each parameter goes, by name */
  params: Record<string, "path" | "query" | "header">
  /** the request body's media type when it is not JSON */
  media?: string
  /** the status a success answers with */
  status: number
  list?: ListAt
  paging?: Paging
}

/** every operation of the contract (packages/api/openapi.yaml), by its id */
export const OPERATIONS: Record<string, Operation> = /*$operations*/{}/*$*/

/** what the session needs of the contract: which operations sign in, refresh and sign out, how each one's token rides */
export const AUTH: AuthConfig = /*$auth*/{
  security: {
  },
}/*$*/

/** the rules of the fields of each operation a form of the design sends, from its body's schema */
export const FORMS: Record<string, Record<string, FieldRule>> = /*$forms*/{}/*$*/
