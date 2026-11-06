/* The mock library in a few lines a model (and the MCP client) can read: the settings, each model with its count, its
 * hints (the author's, and what is read from the field names) and its pinned records, how each operation is
 * answered, the scenarios, the files and the realtime scripts. */

import type { ApiSpec } from "../api/types";
import { DEFAULT_COUNT } from "./shape";
import { defaultScripts } from "./realtime";
import { inferredHints } from "./fill";
import { compileRoutes } from "./routes";
import type { MockHint, MockSpec } from "./types";

const hintText = (h: MockHint) =>
  [h.kind, h.min !== undefined || h.max !== undefined ? `${h.min ?? ""}..${h.max ?? ""}` : "", h.from || h.to ? `${h.from ?? ""}..${h.to ?? ""}` : "", h.weights ? `weights ${JSON.stringify(h.weights)}` : "", h.files?.length ? `files ${h.files.join(",")}` : "", h.nullRate !== undefined ? `null ${h.nullRate}` : ""]
    .filter(Boolean)
    .join(" ");

export function mocksOutline(api: ApiSpec | undefined, spec: MockSpec | undefined, o: { locale?: string } = {}): string {
  if (!api?.endpoints?.length && !api?.models?.length) return "The document has no API yet, so there is nothing to mock: add models and endpoints first (the api tools).";
  const m = spec ?? {};
  const out: string[] = [];
  out.push(`Mocks: seed ${m.seed ?? 1}, locale ${m.locale ?? o.locale ?? "the editor's"}, latency ${m.latency ? `${m.latency.min}-${m.latency.max} ms` : "150-450 ms"}${m.errorRate ? `, error rate ${m.errorRate}` : ""}${m.scenario ? `, preview starts in scenario ${m.scenario}` : ""}`);
  const a = m.auth;
  out.push(`Auth: ${a?.signedIn === false ? "starts signed out" : "starts signed in"}; sign-in accepts ${a?.accept?.length ? `${a.accept.length} credential set(s)` : "any credentials"}; tokens last ${a?.tokenTtl ?? 3600}s`);
  const routes = compileRoutes(api, m);
  out.push(`Operations (${routes.length}): ${routes.map((r) => `${r.operationId} ${r.kind}${r.model ? ` ${r.model}` : ""}${r.pagination ? ` paged by ${r.pagination.style}` : ""}`).join("; ")}`);
  const models = api.models ?? [];
  if (models.length) {
    out.push("Models:");
    for (const model of models) {
      const c = m.models?.find((x) => x.name === model.name);
      const inferred = inferredHints(api, model.name);
      const own = c?.hints ?? {};
      const fields = Object.entries({ ...inferred, ...own }).map(([path, h]) => `${path}=${hintText(h)}${own[path] ? "*" : ""}`);
      out.push(`- ${model.name}: ${c?.count ?? DEFAULT_COUNT} records${c?.fixtures?.length ? `, ${c.fixtures.length} pinned` : ""}${c?.seed ? `, seed +${c.seed}` : ""}${fields.length ? `; ${fields.join(", ")}` : ""}`);
    }
    out.push("(* = the author's hint; the rest are read from the field names)");
  }
  out.push(m.scenarios?.length ? `Scenarios: ${m.scenarios.map((s) => `${s.id} "${s.name}"${s.all ? ` all ${JSON.stringify(s.all)}` : ""}${s.ops ? ` ops ${Object.keys(s.ops).join(",")}` : ""}${s.latency ? ` latency ${s.latency.min}-${s.latency.max}` : ""}${s.counts ? ` counts ${JSON.stringify(s.counts)}` : ""}${s.signedIn === false ? " signed out" : ""}${s.errorRate ? ` errors ${s.errorRate}` : ""}`).join("; ")}` : "Scenarios: none (fill_mocks adds new user, lots of data, network error, slow network, signed out)");
  out.push(m.files?.length ? `Files (${m.files.length}): ${m.files.map((f) => `${f.id} ${f.name} ${f.type}${f.tags?.length ? ` [${f.tags.join(",")}]` : ""}`).join("; ")}` : "Files: none (placeholders are made: SVG pictures, PDF, WAV, MP4)");
  const scripts = m.realtime ?? (api.channels?.length ? defaultScripts(api) : []);
  if (scripts.length) out.push(`Realtime${m.realtime ? "" : " (defaults)"}: ${scripts.map((s) => `${s.id} on ${s.channel} ${s.trigger?.on ?? "connect"}${s.trigger && "operationId" in s.trigger ? ` ${s.trigger.operationId}` : ""}${s.trigger && "message" in s.trigger ? ` ${s.trigger.message}` : ""}: ${s.steps.map((x) => `${x.at}ms ${x.message}`).join(", ")}${s.repeat ? ` every ${s.repeat.every}ms${s.repeat.times !== undefined ? ` x${s.repeat.times}` : ""}` : ""}`).join("; ")}`);
  if (m.routes?.length) out.push(`Overrides: ${m.routes.map((r) => `${r.operationId} ${r.kind ?? "auto"}${r.model ? ` ${r.model}` : ""}`).join("; ")}`);
  return out.join("\n");
}
