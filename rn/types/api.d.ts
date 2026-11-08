/* What the product's packages/api has beside the client every product has (lib/export/files/api, which "@m3e/api" is
 * here): the API by operation, printed from the contract (lib/export/targets/api.ts). The app's own files in src/app
 * call it only through `request`. */
import type { TransportRequest } from "@m3e/api"

declare module "@m3e/api" {
  export function createApi(transport: Transport): { request: <T = unknown>(request: TransportRequest) => Promise<T> }
}
