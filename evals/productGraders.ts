/* Checks of the product layer: the contract (models and endpoints exist, are valid, take and give what the request
 * needs), the bindings (screens load data, lists repeat a row bound to the elements, expressions resolve, forms map
 * the body's fields, taps pass params, sign-in guards), the states designed, the mocks filled, the preview answering
 * with data under each scenario, and the exported product compiling. Like every grader they read only the observation:
 * what needs a mock transport or a compiler was worked out once after the turn (evals/product.ts). */

import { apiProblems } from "../lib/api";
import type { ApiEndpoint, ApiSpec, JsonSchema, JsonSchemaObject } from "../lib/api/types";
import { exprPlaceError } from "../lib/bindings/check";
import { shapeFor } from "../lib/bindings/complete";
import { endpointOf, listOf, requestOf, resolved } from "../lib/bindings/contract";
import { regionDesigns } from "../lib/core/ops/bindings";
import type { MockScenario } from "../lib/mocks/types";
import { frameOfPart, REGION_STATES, type Action, type ActionBody, type Effect, type Frame, type Group, type Item, type RegionState } from "../lib/tokens";
import type { Graded } from "./graders";
import type { Check, CheckResult } from "./types";

const ok = (pass: boolean, detail: string): CheckResult => ({ pass, detail });
const crit = (o: { critical?: boolean; weight?: number }) => ({ ...(o.critical ? { critical: true } : {}), ...(o.weight ? { weight: o.weight } : {}) });

/** a screen named by its id, or by a pattern its name or id matches */
export type ScreenSel = string | RegExp;

const apiOf = (g: Graded): ApiSpec => g.doc.api ?? {};
export const framesBy = (g: Graded, sel: ScreenSel): Frame[] => g.doc.frames.filter((f) => (typeof sel === "string" ? f.id === sel : sel.test(f.name) || sel.test(f.id)));
const groupsOn = (g: Graded, f: Frame): Group[] => g.doc.groups.filter((x) => frameOfPart(x, g.doc.groups, g.doc.frames, g.o.widths)?.id === f.id);
const label = (sel: ScreenSel) => (typeof sel === "string" ? sel : String(sel));
const noScreen = (sel: ScreenSel, g: Graded) => ok(false, `no screen like ${label(sel)} (screens: ${g.doc.frames.map((f) => `${f.id} "${f.name}"`).join(", ")})`);

/** what a group holds, at every depth, by the flow it is in */
function inside(g: Graded, host: Group): Group[] {
  const out: Group[] = [];
  const visit = (id: string, depth: number) => {
    if (depth > 30) return;
    for (const x of g.doc.groups)
      if (x.inFlow === id) {
        out.push(x);
        visit(x.id, depth + 1);
      }
  };
  visit(host.id, 0);
  return out;
}

/** every tap of an item and the bodies its call branches run, deep */
function tapsOf(it: Item): ActionBody[] {
  const out: ActionBody[] = [];
  const add = (b: ActionBody | Action | undefined, depth = 0) => {
    if (!b || depth > 5) return;
    out.push(b);
    for (const e of b.effects ?? [])
      if (e.do === "call") {
        add(e.then, depth + 1);
        add(e.catch, depth + 1);
      }
    if ("else" in b && b.else) add(b.else as ActionBody, depth + 1);
  };
  add(it.action);
  for (const a of Object.values(it.actions ?? {})) add(a);
  return out;
}

const fieldsOf = (api: ApiSpec, s: JsonSchema | undefined): Record<string, JsonSchemaObject> => {
  const r = resolved(api, s);
  const props = r?.properties && typeof r.properties === "object" ? r.properties : {};
  const out: Record<string, JsonSchemaObject> = {};
  for (const [k, v] of Object.entries(props)) out[k] = resolved(api, v as JsonSchema) ?? {};
  /* allOf parts, one level */
  for (const part of Array.isArray(r?.allOf) ? r.allOf : []) Object.assign(out, fieldsOf(api, part as JsonSchema));
  return out;
};

/* ---------- the contract ---------- */

/** the API has endpoints and no error-level problems */
export const apiValid = (o: { critical?: boolean } = { critical: true }): Check => ({
  id: "api-valid",
  label: "the API has endpoints and no errors",
  ...crit(o),
  run(g) {
    const api = g.doc.api;
    const errors = apiProblems(api, { collections: g.doc.collections }).filter((p) => p.level === "error");
    return ok(!!api?.endpoints?.length && !errors.length, `${api?.models?.length ?? 0} models, ${api?.endpoints?.length ?? 0} endpoints; ${errors.length ? `errors: ${errors.slice(0, 3).map((p) => `${p.at}: ${p.message}`).join("; ")}` : "no errors"}`);
  },
});

export type EndpointMatch = { method?: string; path?: RegExp; list?: boolean; body?: boolean; paged?: boolean; public?: boolean };

export const matchesEndpoint = (api: ApiSpec, e: ApiEndpoint, m: EndpointMatch) =>
  (!m.method || e.method.toLowerCase() === m.method) &&
  (!m.path || m.path.test(e.path)) &&
  (m.list === undefined || !!listOf(api, e) === m.list) &&
  (m.body === undefined || !!requestOf(api, e) === m.body) &&
  (m.paged === undefined || !!e.pagination === m.paged) &&
  (m.public === undefined || (Array.isArray(e.security) && !e.security.length) === m.public);

const endpointWords = (e: ApiEndpoint) => `${e.method.toUpperCase()} ${e.path} (${e.operationId})`;

/** an endpoint like this one exists */
export const endpointLike = (id: string, what: string, m: EndpointMatch, o: { critical?: boolean; weight?: number } = {}): Check => ({
  id,
  label: what,
  ...crit(o),
  run(g) {
    const api = apiOf(g);
    const found = (api.endpoints ?? []).filter((e) => matchesEndpoint(api, e, m));
    return ok(found.length > 0, found.length ? found.map(endpointWords).join(", ") : `none among ${(api.endpoints ?? []).map(endpointWords).join(", ") || "no endpoints"}`);
  },
});

/** a model has fields like these (each pattern matches a field's name) */
export const modelWith = (id: string, what: string, fields: RegExp[], o: { critical?: boolean } = {}): Check => ({
  id,
  label: what,
  ...crit(o),
  run(g) {
    const api = apiOf(g);
    const models = api.models ?? [];
    const hit = models.find((m) => {
      const names = Object.keys(fieldsOf(api, m.schema));
      return fields.every((p) => names.some((n) => p.test(n)));
    });
    return ok(!!hit, hit ? `${hit.name}: ${Object.keys(fieldsOf(api, hit.schema)).join(", ")}` : `no model with ${fields.map(String).join(", ")} (models: ${models.map((m) => `${m.name}(${Object.keys(fieldsOf(api, m.schema)).slice(0, 6).join(",")})`).join("; ") || "none"})`);
  },
});

/* ---------- bindings ---------- */

/** the repeats over data on a screen, with the source they read and whether their row binds the element */
function dataRepeats(g: Graded, f: Frame): { host: Group; source?: string; bound: number }[] {
  return groupsOn(g, f)
    .filter((x) => x.repeat?.data !== undefined)
    .map((host) => {
      const source = /data\.([A-Za-z_]\w*)\./.exec(host.repeat!.data ?? "")?.[1];
      const bound = inside(g, host).flatMap((x) => x.items).filter((it) => Object.values(it.bind ?? {}).some((v) => typeof v === "string" && v.startsWith("=") && /\bitem\b/.test(v))).length;
      return { host, ...(source ? { source } : {}), bound };
    });
}

/** a screen loads a list from an endpoint (matching `m` when given) and repeats a row over it with words bound to the
 *  elements */
export const listBound = (sel: ScreenSel, o: { m?: EndpointMatch; critical?: boolean; id?: string } = {}): Check => ({
  id: o.id ?? "list-bound",
  label: `${label(sel)} loads a list and repeats a bound row`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const api = apiOf(g);
    const notes: string[] = [];
    for (const f of frames) {
      const lists = (f.data ?? []).filter((d) => {
        const e = endpointOf(api, d.operationId);
        return !!e && !!listOf(api, e) && (!o.m || matchesEndpoint(api, e, o.m));
      });
      const reps = dataRepeats(g, f).filter((r) => r.source && lists.some((d) => d.name === r.source));
      const good = reps.find((r) => r.bound >= 1);
      if (lists.length && good) return ok(true, `${f.id}: ${lists.map((d) => `${d.name}=${d.operationId}`).join(", ")}; repeat over ${good.host.repeat!.data} with ${good.bound} bound parts`);
      notes.push(`${f.id}: ${lists.length ? `loads ${lists.map((d) => d.operationId).join(", ")}` : `no list source (${(f.data ?? []).map((d) => d.operationId).join(", ") || "no data"})`}, ${reps.length ? `repeat binds ${reps[0].bound} parts` : "no repeat over it"}`);
    }
    return ok(false, notes.join("; "));
  },
});

/** a screen loads one thing (not a list) from an endpoint like `m` and shows some of its fields */
export const detailBound = (sel: ScreenSel, o: { m?: EndpointMatch; critical?: boolean; fields?: RegExp[] } = {}): Check => ({
  id: "detail-bound",
  label: `${label(sel)} loads one record and shows its fields`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const api = apiOf(g);
    const notes: string[] = [];
    for (const f of frames) {
      const one = (f.data ?? []).filter((d) => {
        const e = endpointOf(api, d.operationId);
        return !!e && !listOf(api, e) && (!o.m || matchesEndpoint(api, e, o.m));
      });
      const reads = groupsOn(g, f)
        .flatMap((x) => x.items)
        .flatMap((it) => Object.values(it.bind ?? {}))
        .filter((v): v is string => typeof v === "string" && one.some((d) => v.includes(`data.${d.name}.`)));
      const missing = (o.fields ?? []).filter((p) => !reads.some((r) => p.test(r)));
      if (one.length && reads.length && !missing.length) return ok(true, `${f.id}: ${one.map((d) => `${d.name}=${d.operationId}`).join(", ")}; ${reads.length} bound props`);
      notes.push(`${f.id}: ${one.length ? one.map((d) => d.operationId).join(", ") : "no single-record source"}, ${reads.length} bound props${missing.length ? `, nothing shows ${missing.map(String).join(", ")}` : ""}`);
    }
    return ok(false, notes.join("; "));
  },
});

/** Every expression on a screen that loads data or binds something reads what is there: bound props, repeats,
 *  conditions, a source's params, a region's source. */
export const bindingsResolve = (o: { critical?: boolean } = { critical: true }): Check => ({
  id: "bindings-resolve",
  label: "every expression and source on the bound screens resolves",
  ...crit(o),
  run(g) {
    const bad: string[] = [];
    let n = 0;
    for (const f of g.doc.frames) {
      const groups = groupsOn(g, f);
      if (!f.data?.length && !groups.some((x) => x.repeat?.data || x.states || x.form || x.items.some((it) => it.bind && Object.values(it.bind).some((v) => v.startsWith("="))))) continue;
      const at = (x: Group) => shapeFor(g.doc, f, x.id, g.o.widths);
      const check = (expr: unknown, x: Group, where: string) => {
        n++;
        const e = exprPlaceError(expr, at(x));
        if (e) bad.push(`${f.id} ${where}: ${e}`);
      };
      for (const d of f.data ?? []) {
        if (!endpointOf(g.doc.api, d.operationId)) bad.push(`${f.id} data ${d.name}: no endpoint ${d.operationId}`);
        for (const [k, x] of Object.entries(d.params ?? {})) {
          n++;
          const e = exprPlaceError(x, shapeFor(g.doc, f, undefined, g.o.widths));
          if (e) bad.push(`${f.id} data ${d.name}.params.${k}: ${e}`);
        }
      }
      for (const x of groups) {
        if (x.repeat?.data !== undefined) check(x.repeat.data, x, `${x.items[0]?.id} repeat`);
        if (x.showWhen && "expr" in x.showWhen) check(x.showWhen.expr, x, `${x.items[0]?.id} showWhen`);
        if (x.states?.source && !(f.data ?? []).some((d) => d.name === x.states!.source)) bad.push(`${f.id} region ${x.items[0]?.id}: no source ${x.states.source}`);
        for (const it of x.items) for (const [p, v] of Object.entries(it.bind ?? {})) if (typeof v === "string" && v.startsWith("=")) check(v.slice(1), x, `${it.id}.${p}`);
      }
    }
    return ok(n > 0 && !bad.length, n ? `${n} expressions${bad.length ? `; ${bad.length} wrong: ${bad.slice(0, 3).join("; ")}` : ", all resolve"}` : "nothing is bound");
  },
});

/** each region on the screens (at least one) has a design for loading, empty, error and forbidden */
export const statesDesigned = (sel: ScreenSel, o: { critical?: boolean; weight?: number } = {}): Check => ({
  id: "states",
  label: `${label(sel)}: its regions design every state`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const regions = frames.flatMap((f) => groupsOn(g, f).filter((x) => x.states));
    if (!regions.length) return ok(false, "no region");
    const lacking = regions.map((r) => ({ r, missing: REGION_STATES.filter((st) => st !== "ready" && !regionDesigns(g.doc.groups, r)[st]?.length) })).filter((x) => x.missing.length);
    return ok(!lacking.length, `${regions.length} regions${lacking.length ? `; ${lacking.map((x) => `${x.r.items[0]?.id} lacks ${x.missing.join(", ")}`).join("; ")}` : ", every state designed"}`);
  },
});

/** a form on the screen submits to an endpoint like `m`, with an input bound to a field matching each pattern */
export const formBound = (sel: ScreenSel, o: { m?: EndpointMatch; fields: RegExp[]; critical?: boolean; id?: string }): Check => ({
  id: o.id ?? "form",
  label: `${label(sel)}: a form for the body with its fields bound`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const api = apiOf(g);
    const notes: string[] = [];
    for (const f of frames) {
      for (const form of groupsOn(g, f).filter((x) => x.form)) {
        const e = endpointOf(api, form.form!.operationId);
        if (!e) {
          notes.push(`form ${form.items[0]?.id}: no endpoint ${form.form!.operationId}`);
          continue;
        }
        if (o.m && !matchesEndpoint(api, e, o.m)) {
          notes.push(`form of ${endpointWords(e)} is not the one asked for`);
          continue;
        }
        const bound = inside(g, form).flatMap((x) => x.items).map((it) => it.field).filter((x): x is string => !!x);
        const missing = o.fields.filter((p) => !bound.some((b) => p.test(b)));
        const submits = inside(g, form).flatMap((x) => x.items).some((it) => tapsOf(it).some((b) => b.effects?.some((ef) => ef.do === "submit")));
        if (!missing.length && submits) return ok(true, `${f.id}: form of ${endpointWords(e)}, fields ${bound.join(", ")}`);
        notes.push(`${f.id}: form of ${endpointWords(e)}, fields ${bound.join(", ") || "none"}${missing.length ? `, missing ${missing.map(String).join(", ")}` : ""}${submits ? "" : ", nothing submits it"}`);
      }
    }
    return ok(false, notes.join("; ") || "no form on the screen");
  },
});

/** a tap on the list's rows opens the detail screen with params read from the element, and the detail screen loads
 *  its record with them */
export const tapPassesParams = (from: ScreenSel, to: ScreenSel, o: { critical?: boolean } = {}): Check => ({
  id: "tap-params",
  label: `a row on ${label(from)} opens ${label(to)} with its id, which loads that record`,
  ...crit(o),
  run(g) {
    const targets = framesBy(g, to);
    const sources = framesBy(g, from);
    if (!sources.length) return noScreen(from, g);
    if (!targets.length) return noScreen(to, g);
    const notes: string[] = [];
    for (const f of sources)
      for (const r of dataRepeats(g, f)) {
        const taps = [r.host, ...inside(g, r.host)].flatMap((x) => x.items).flatMap((it) => tapsOf(it));
        const open = taps.find((b) => targets.some((t) => t.id === b.to) && Object.values(b.params ?? {}).some((v) => /\bitem\b/.test(String(v))));
        if (!open) {
          notes.push(`${f.id}: no row tap opens ${targets.map((t) => t.id).join("/")} with item params (taps: ${taps.map((b) => `${b.to}${b.params ? JSON.stringify(b.params) : ""}`).join(", ") || "none"})`);
          continue;
        }
        const t = targets.find((x) => x.id === open.to)!;
        const names = Object.keys(open.params ?? {});
        const reads = (t.data ?? []).some((d) => Object.values(d.params ?? {}).some((v) => names.some((n) => new RegExp(`\\bparams\\.${n}\\b`).test(String(v)))));
        if (reads) return ok(true, `${f.id} → ${t.id} with ${JSON.stringify(open.params)}; ${t.id} loads ${(t.data ?? []).map((d) => d.operationId).join(", ")} with it`);
        notes.push(`${t.id} is opened with ${names.join(", ")} but no source of it reads them (${(t.data ?? []).map((d) => `${d.name}${JSON.stringify(d.params ?? {})}`).join(", ") || "no data"})`);
      }
    return ok(false, notes.join("; ") || "no list on the screen");
  },
});

/** a screen's sign-in requirement */
export const screenAuth = (sel: ScreenSel, auth: "required" | "login", o: { critical?: boolean } = {}): Check => ({
  id: `auth-${auth}`,
  label: `${label(sel)} is ${auth === "login" ? "the sign-in screen" : "behind sign-in"}`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const hit = frames.find((f) => f.auth === auth);
    return ok(!!hit, frames.map((f) => `${f.id}: ${f.auth ?? "anyone"}`).join(", "));
  },
});

/** a part on the screen calls an endpoint like `m` when tapped */
export const callsEndpoint = (sel: ScreenSel, m: EndpointMatch, o: { critical?: boolean; then?: "refresh" } = {}): Check => ({
  id: "calls",
  label: `${label(sel)}: a tap calls ${m.method?.toUpperCase() ?? ""} ${m.path ?? "an endpoint"}`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const api = apiOf(g);
    const calls = frames.flatMap((f) => groupsOn(g, f)).flatMap((x) => x.items).flatMap((it) => tapsOf(it)).flatMap((b) => (b.effects ?? []).filter((e): e is Extract<Effect, { do: "call" }> => e.do === "call"));
    const hit = calls.find((c) => {
      const e = endpointOf(api, c.operationId);
      return !!e && matchesEndpoint(api, e, m);
    });
    const refreshes = !!hit && (hit.then?.effects?.some((e) => e.do === "refresh") || !!hit.optimistic);
    const pass = !!hit && (o.then !== "refresh" || refreshes);
    return ok(pass, hit ? `calls ${hit.operationId}${refreshes ? ", then refreshes" : ", no refresh after"}` : `calls: ${calls.map((c) => c.operationId).join(", ") || "none"}`);
  },
});

/** a tap on the screen sends to an endpoint like `m`: a call, or the submit of a form for it */
export const sendsTo = (sel: ScreenSel, m: EndpointMatch, o: { critical?: boolean } = {}): Check => ({
  id: "sends",
  label: `${label(sel)}: a tap sends to ${m.method?.toUpperCase() ?? ""} ${m.path ?? "an endpoint"} (a call or a form)`,
  ...crit(o),
  run(g) {
    const frames = framesBy(g, sel);
    if (!frames.length) return noScreen(sel, g);
    const api = apiOf(g);
    const groups = frames.flatMap((f) => groupsOn(g, f));
    const like = (op: string) => {
      const e = endpointOf(api, op);
      return !!e && matchesEndpoint(api, e, m);
    };
    const call = groups.flatMap((x) => x.items).flatMap((it) => tapsOf(it)).flatMap((b) => b.effects ?? []).find((e) => e.do === "call" && like((e as Extract<Effect, { do: "call" }>).operationId));
    if (call) return ok(true, `calls ${(call as Extract<Effect, { do: "call" }>).operationId}`);
    const form = groups.find((x) => x.form && like(x.form.operationId) && inside(g, x).flatMap((y) => y.items).some((it) => tapsOf(it).some((b) => b.effects?.some((e) => e.do === "submit"))));
    if (form) return ok(true, `a form of ${form.form!.operationId} with a submit; fields ${inside(g, form).flatMap((y) => y.items).map((it) => it.field).filter(Boolean).join(", ") || "none"}`);
    return ok(false, `no call or form sends to such an endpoint (forms: ${groups.filter((x) => x.form).map((x) => x.form!.operationId).join(", ") || "none"})`);
  },
});

/* ---------- mocks ---------- */

/** the mock library is set up: scenarios (at least `min`) */
export const mocksFilled = (o: { min?: number; critical?: boolean } = {}): Check => ({
  id: "mocks",
  label: `the mocks are set up${o.min ? ` with at least ${o.min} scenarios` : ""}`,
  ...crit(o),
  run(g) {
    const m = g.doc.mocks;
    const n = m?.scenarios?.length ?? 0;
    return ok(!!m && n >= (o.min ?? 0), m ? `${n} scenarios (${(m.scenarios ?? []).map((s) => s.id).join(", ")}), ${m.models?.length ?? 0} models set` : "no mock settings");
  },
});

/** a scenario like `pick` exists and, in the preview, the screen's regions show one of `states` under it */
export const scenarioShows = (id: string, what: string, pick: (s: MockScenario, g: Graded) => boolean, sel: ScreenSel, states: RegionState[], o: { critical?: boolean } = {}): Check => ({
  id,
  label: what,
  ...crit(o),
  run(g) {
    const found = (g.doc.mocks?.scenarios ?? []).filter((s) => pick(s, g));
    if (!found.length) return ok(false, `no such scenario among ${(g.doc.mocks?.scenarios ?? []).map((s) => `${s.id} ${JSON.stringify({ all: s.all, ops: s.ops, latency: s.latency })}`).join("; ").slice(0, 300) || "none"}`);
    const frames = new Set(framesBy(g, sel).map((f) => f.id));
    const reports = (g.o.preview?.reports ?? []).filter((r) => frames.has(r.screen) && found.some((s) => s.id === r.scenario));
    const good = reports.find((r) => r.regions.length && r.regions.every((x) => states.includes(x.state)));
    if (!states.length) return ok(true, found.map((s) => s.id).join(", "));
    return ok(!!good, good ? `${good.scenario} on ${good.screen}: ${good.regions.map((x) => x.state).join(", ")}` : `${found.map((s) => s.id).join(", ")}: ${reports.map((r) => `${r.screen} shows ${r.regions.map((x) => x.state).join(",") || "no region"}`).join("; ") || "not previewed"}`);
  },
});

/** realtime: a channel the server pushes on, and a mock script for it */
export const channelScripted = (o: { critical?: boolean } = {}): Check => ({
  id: "realtime",
  /* the app may send over the socket or with a POST: the request "posts" a message; what must be real time is the push */
  label: "a realtime channel the server pushes new messages on, with a mock script for it",
  ...crit(o),
  run(g) {
    const chans = g.doc.api?.channels ?? [];
    const pushed = chans.find((c) => (c.operations ?? []).some((x) => x.action === "send"));
    const script = pushed && (g.doc.mocks?.realtime ?? []).some((s) => s.channel === pushed.id);
    return ok(!!pushed && !!script, chans.length ? `${chans.map((c) => `${c.id}(${(c.operations ?? []).map((x) => x.action).join("/")})`).join(", ")}; scripts: ${(g.doc.mocks?.realtime ?? []).map((s) => `${s.channel}${s.trigger ? ` on ${s.trigger.on}` : ""}`).join(", ") || "none"}` : "no channel");
  },
});

/* ---------- what ran after the turn ---------- */

/** in the preview under the normal answers (or `scenario`), the screen's sources load (lists with at least `min`
 *  elements) and its regions show `state` */
export const previewShows = (sel: ScreenSel, o: { scenario?: string; min?: number; state?: RegionState; critical?: boolean; id?: string } = {}): Check => ({
  id: o.id ?? "preview",
  label: `in the preview ${label(sel)} shows mock data${o.min ? ` (${o.min}+ rows)` : ""}`,
  ...crit(o),
  run(g) {
    const frames = new Set(framesBy(g, sel).map((f) => f.id));
    if (!frames.size) return noScreen(sel, g);
    const reports = (g.o.preview?.reports ?? []).filter((r) => frames.has(r.screen) && r.scenario === (o.scenario ?? ""));
    if (!reports.length) return ok(false, `not previewed${g.o.preview?.errors.length ? `: ${g.o.preview.errors.slice(0, 2).join("; ")}` : " (no data source on it)"}`);
    const want = o.state ?? "ready";
    const good = reports.find((r) => r.sources.length && r.sources.every((s) => s.status === "ready") && (!o.min || r.sources.some((s) => (s.items ?? 0) >= o.min!)) && r.regions.every((x) => x.state === want));
    const words = (r: (typeof reports)[number]) => `${r.screen}: ${r.sources.map((s) => `${s.name} ${s.status}${s.items !== undefined ? ` ${s.items} items` : ""}${s.error ? ` (${s.error.slice(0, 60)})` : ""}`).join(", ")}; regions ${r.regions.map((x) => x.state).join(",") || "none"}`;
    return ok(!!good, (good ? [good] : reports).map(words).join(" | "));
  },
});

/** the sign-in endpoint answers the mocks with a token */
export const signInWorks = (o: { critical?: boolean } = {}): Check => ({
  id: "sign-in",
  label: "the sign-in endpoint answers with a token (mocks)",
  ...crit(o),
  run(g) {
    const l = g.o.preview?.login;
    if (!g.doc.api?.auth?.login) return ok(false, "no login endpoint in the auth");
    if (!l) return ok(false, "not tried");
    return ok(l.status >= 200 && l.status < 300 && l.token, `${l.operationId} → ${l.status}${l.token ? " with a token" : " without a token"}`);
  },
});

/** the exported product builds and its generated API package and web app type-check */
export const productCompiles = (o: { critical?: boolean } = {}): Check => ({
  id: "export",
  label: "the exported product builds and type-checks (packages/api, apps/web)",
  ...crit(o),
  run(g) {
    const p = g.o.product;
    if (!p) return ok(false, "not exported");
    if (!p.ok) return ok(false, `export failed: ${p.error ?? "?"}`);
    const tc = Object.entries(p.typecheck).map(([k, v]) => ("skipped" in v ? `${k} skipped (${v.skipped})` : `${k} ${v.errors} errors${v.errors ? `: ${v.sample.slice(0, 2).join(" | ")}` : ""}`));
    const errors = Object.values(p.typecheck).reduce((n, v) => n + ("errors" in v ? v.errors : 0), 0);
    return ok(errors === 0, `${p.files} files, screens ${p.screens.join(", ")}; ${tc.join("; ")}`);
  },
});

/** a field of an endpoint's request body (by pattern), its schema resolved */
export function bodyField(g: Graded, m: EndpointMatch, field: RegExp): { e?: ApiEndpoint; schema?: JsonSchemaObject; required: boolean } {
  const api = apiOf(g);
  for (const e of (api.endpoints ?? []).filter((x) => matchesEndpoint(api, x, m))) {
    const body = requestOf(api, e)?.schema;
    const fields = fieldsOf(api, body);
    const name = Object.keys(fields).find((n) => field.test(n));
    if (!name) continue;
    const r = resolved(api, body);
    const required = Array.isArray(r?.required) && r.required.includes(name);
    return { e, schema: fields[name], required };
  }
  return { required: false };
}
