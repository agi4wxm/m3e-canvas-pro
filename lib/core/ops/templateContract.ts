/* What a template brings beside its screens (parts/templates/kit.ts `TemplateContract`): the endpoints and models its
 * screens call and load, the mock scenarios that show each outcome (a payment cancelled, an order still processing),
 * the variables its states read. Added where the document has none of the same name; what it has stays as it is, so
 * adding a template never rewrites the author's contract. */

import { cleanApi } from "../../api/clean";
import { cleanMocks } from "../../mocks/clean";
import type { Doc } from "../../tokens";
import type { TemplateContract } from "../../../parts/templates/kit";

export function withContract<D extends Doc>(doc: D, c: TemplateContract | undefined): D {
  if (!c) return doc;
  let out = doc;
  if (c.api) {
    const api = doc.api ?? {};
    const models = new Set((api.models ?? []).map((m) => m.name));
    const ops = new Set((api.endpoints ?? []).map((e) => e.operationId));
    const routes = new Set((api.endpoints ?? []).map((e) => `${e.method} ${e.path}`));
    const next = {
      ...api,
      models: [...(api.models ?? []), ...(c.api.models ?? []).filter((m) => !models.has(m.name))],
      endpoints: [...(api.endpoints ?? []), ...(c.api.endpoints ?? []).filter((e) => !ops.has(e.operationId) && !routes.has(`${e.method} ${e.path}`))],
    };
    out = { ...out, api: cleanApi(next) };
  }
  if (c.mocks) {
    const mocks = doc.mocks ?? {};
    const scenarios = new Set((mocks.scenarios ?? []).map((s) => s.id));
    const next = {
      ...mocks,
      scenarios: [...(mocks.scenarios ?? []), ...(c.mocks.scenarios ?? []).filter((s) => !scenarios.has(s.id))],
      ...(c.mocks.capabilities ? { capabilities: { ...c.mocks.capabilities, ...mocks.capabilities } } : {}),
    };
    out = { ...out, mocks: cleanMocks(next) };
  }
  if (c.vars?.length) {
    const ids = new Set((doc.vars ?? []).map((v) => v.id));
    const names = new Set((doc.vars ?? []).map((v) => v.name));
    const more = c.vars.filter((v) => !ids.has(v.id) && !names.has(v.name));
    if (more.length) out = { ...out, vars: [...(doc.vars ?? []), ...more] };
  }
  return out;
}
