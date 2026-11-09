/* The tool that reads how a screen is bound to the contract (lib/bindings): its params and sign-in, the data it loads
 * with the shape of what each answers, its regions and the state designs they have, its forms with their fields and
 * rules, the parts bound to expressions, and the names an expression on it can read. Nothing changes. */

import { endpointLine } from "../api";
import { endpointOf, formFields, stepsOf } from "../bindings/contract";
import type { JsonSchema } from "../api/types";
import { listPaths, shapeFor } from "../bindings/complete";
import { exprPlaceError, framePlaceError } from "../bindings/check";
import { HELPERS } from "../bindings/expr";
import { regionDesigns } from "../core/ops/bindings";
import { frameOfPart, REGION_STATES, type Group } from "../tokens";
import { tool, ToolFailure, type Tool } from "./types";

const describeBindings = tool<{ screen: string; expr?: string; at?: string; frame?: boolean }>({
  name: "describe_bindings",
  group: "read",
  description:
    "How a screen is bound to the API: its params and sign-in, each data source (endpoint, params, paging, and the paths it offers: data.<name>.items[], value fields), its regions with the state designs they have, its forms with each field's input and rules, the parts bound to expressions, the props bound per frame and what world (the snapshot of the world a world view hosts) offers them, the lists a repeat can go over, the helpers. With expr (and at: a part's id), checks an expression where it would be read; with frame: true, as a binding per frame.",
  input: {
    type: "object",
    properties: { screen: { type: "string" }, expr: { type: "string", description: "an expression to check" }, at: { type: "string", description: "the part it would be read on (its repeat and form count)" }, frame: { type: "boolean", description: "check expr as a binding per frame (bind_expression frame: true)" } },
    required: ["screen"],
    additionalProperties: false,
  },
  output: "{params, auth, sources, regions, forms, bound, frames, world?, lists, helpers, check?}",
  readOnly: true,
  destructive: false,
  run(a, env) {
    const s = env.store.get();
    const f = s.doc.frames.find((x) => x.id === a.screen);
    if (!f) throw new ToolFailure("not_found", `There is no screen ${JSON.stringify(a.screen)}.`, "list_screens lists them.");
    const api = s.doc.api ?? {};
    const widths = s.session.widths;
    const on = (g: Group) => frameOfPart(g, s.doc.groups, s.doc.frames, widths)?.id === f.id;
    const groups = s.doc.groups.filter(on);
    const shape = shapeFor(s.doc, f, undefined, widths);
    const atGroup = a.at ? s.doc.groups.find((g) => g.id === a.at || g.items.some((it) => it.id === a.at)) : undefined;
    return {
      result: {
        params: f.params ?? [],
        auth: f.auth ?? "anyone",
        sources: (f.data ?? []).map((d) => {
          const e = endpointOf(api, d.operationId);
          return { ...d, endpoint: e ? endpointLine(api, e) : "missing", reads: shape.sources.find((x) => x.name === d.name)?.item ? [`data.${d.name}.items`, `data.${d.name}.value`] : [`data.${d.name}.value`] };
        }),
        ...(f.subscriptions?.length
          ? {
              subscriptions: f.subscriptions.map((sub) => {
                const c = (api.channels ?? []).find((x) => x.id === sub.channel);
                return { ...sub, channel: c ? `${c.id} ${c.address}` : `${sub.channel} (missing)`, reads: [`data.${sub.name}.value`, `data.${sub.name}.items`, `data.${sub.name}.latest`, `data.${sub.name}.count`], actionReads: "event.message, event.payload, event.at" };
              }),
            }
          : {}),
        regions: groups
          .filter((g) => g.states)
          .map((g) => {
            const designs = regionDesigns(s.doc.groups, g);
            return { id: g.items[0].id, source: g.states!.source ?? null, showing: g.states!.show ?? "ready", designs: REGION_STATES.filter((st) => st === "ready" || !!designs[st]?.length), missing: REGION_STATES.filter((st) => st !== "ready" && !designs[st]?.length) };
          }),
        forms: groups
          .filter((g) => g.form)
          .map((g) => {
            const e = endpointOf(api, g.form!.operationId);
            const specs = e ? formFields(api, e) : [];
            const bound = new Set(s.doc.groups.flatMap((x) => x.items.map((it) => it.field)).filter(Boolean));
            return { id: g.items[0].id, operationId: g.form!.operationId, fields: specs.map((x) => ({ name: x.name, input: x.kind, required: x.required, bound: bound.has(x.name) })), onSuccess: g.form!.then ?? null, onFailure: g.form!.catch ?? null };
          }),
        bound: groups.flatMap((g) => g.items.flatMap((it) => Object.entries(it.bind ?? {}).filter(([, v]) => v.startsWith("=")).map(([prop, v]) => ({ id: it.id, prop, expr: v.slice(1) })))),
        /* the props bound per frame (lib/bindings/frame.ts), and what `world` offers them: the snapshot's keys (as the
           world's contract describes them), the entities' ids under world.byId, the clock */
        frames: groups.flatMap((g) => g.items.flatMap((it) => Object.entries(it.frame ?? {}).map(([prop, expr]) => ({ id: it.id, prop, expr })))),
        ...(shape.world
          ? {
              world: {
                reads: [...stepsOf(api, shape.world).map((x) => `world.${x.name}: ${x.type}`), ...(shape.worldIds ?? []).slice(0, 20).map((id) => `world.byId.${id}`)],
                entity: stepsOf(api, (shape.world as { properties?: { byId?: { additionalProperties?: JsonSchema } } }).properties?.byId?.additionalProperties).map((x) => `${x.name}: ${x.type}`),
                bindable: "text.text, stat-bar.value, and @opacity (0-100) of any part; reads, literals and arithmetic only, no helper",
              },
            }
          : {}),
        lists: listPaths(api, shape).map((l) => l.path),
        helpers: Object.keys(HELPERS),
        ...(a.expr !== undefined ? { check: (a.frame ? framePlaceError(a.expr, shape) : exprPlaceError(a.expr, atGroup ? shapeFor(s.doc, f, atGroup.id, widths) : shape)) ?? "ok" } : {}),
      },
    };
  },
});

export const BINDINGS_READ_TOOLS: Tool<never>[] = [describeBindings] as unknown as Tool<never>[];
