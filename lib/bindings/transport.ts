/* What the preview calls the API through, beside the mock library (lib/mocks, components/MockPreview.tsx), which
 * answers it in the editor: what a page embedding the editor (and an end-to-end test) puts on
 * `window.m3ePreviewTransport` goes first, and where neither is (a run with no DOM, a document with no endpoints) an
 * answer made from the contract's own examples stands in (an `example` or `examples` on the success response's media
 * type, else an empty list or an empty success). The preview only ever sees a `Transport`. */

import type { Transport, TransportRequest, TransportResponse } from "../api/transport";
import { successOf } from "../api";
import { isRecord } from "../api/schema";
import type { Doc } from "../tokens";
import type { MockSpec } from "../mocks/types";
import { endpointOf, listOf } from "./contract";

declare global {
  interface Window {
    /** a transport a page hands the preview, over its own: a test's fake back end, an embedding app's */
    m3ePreviewTransport?: Transport;
  }
}

/** the example a contract gives for an endpoint's success answer, if it gives one */
function exampleAnswer(doc: Pick<Doc, "api">, req: TransportRequest): TransportResponse {
  const e = req.operationId ? endpointOf(doc.api, req.operationId) : undefined;
  const code = e ? successOf(e) : undefined;
  const res: unknown = e && code ? e.responses[code] : undefined;
  const media = isRecord(res) && isRecord(res.content) ? Object.values(res.content)[0] : undefined;
  const example = isRecord(media) ? (media.example !== undefined ? media.example : isRecord(media.examples) ? (Object.values(media.examples)[0] as { value?: unknown } | undefined)?.value : undefined) : undefined;
  const status = code && /^\d{3}$/.test(code) ? Number(code) : 200;
  /* with no example, a list endpoint answers an empty list, so its screen shows its empty design rather than an error */
  const list = example === undefined && e && doc.api ? listOf(doc.api, e) : undefined;
  const body = example !== undefined ? example : list ? (list.field ? { [list.field]: [] } : []) : undefined;
  return { status, headers: body === undefined ? {} : { "content-type": "application/json" }, body };
}

/** Whether the mock library's session starts signed in, as lib/mocks/transport.ts starts it: the scenario's word, else
 *  the mock settings' sign-in, else yes. The preview's `auth.signedIn` starts so, and a screen that needs a session
 *  opens without the sign-in screen first. */
export const signedInAtStart = (mocks: MockSpec | undefined, scenario: string | undefined): boolean =>
  mocks?.scenarios?.find((s) => s.id === scenario)?.signedIn ?? mocks?.auth?.signedIn ?? true;

/** The preview's transport when it is given none: the page's, else the contract's examples. */
export function fallbackTransport(doc: Pick<Doc, "api">): Transport {
  return {
    request(req) {
      const page = typeof window !== "undefined" ? window.m3ePreviewTransport : undefined;
      if (page && typeof page.request === "function") return page.request(req);
      return Promise.resolve(exampleAnswer(doc, req));
    },
  };
}
