/* A screen as the preview shows it, with no editor and no page: its data loaded from the mock library under a
 * scenario (lib/mocks), its repeats drawn from what came back, each region in the state its data is in, the words
 * bound to expressions read in — the same engine (lib/app's Runtime, read from the document by lib/bindings/design.ts),
 * view (view.ts) and live parts (lib/interact.ts) the preview runs, and every exported app runs that engine too. What comes out is the document with that screen's parts as they would show, for a screenshot of it,
 * and a short report of what each data source got. The agent's and MCP's screenshot tool draws a screen this way
 * (`scenario`), the evaluation suite reads the reports, and a region can be drawn in any one of its states instead
 * (`regionsShowing`). Plain TypeScript: the mock library is loaded the first time it is needed. */

import type { MockTransport } from "../mocks/transport";
import { conditionHolds, inRow, isHidden, liveItem, screenVars, startState } from "../interact";
import { groupsInFrame, heldBy, type Doc, type Group, type RegionState } from "../tokens";
import type { Lang } from "../i18n";
import { createRuntime } from "../app/runtime";
import { DesignRuntime, authConfigOf, steadyTransport, type ScreenAt } from "./design";
import { signedInAtStart } from "./transport";
import { boundScreen } from "./view";

type Widths = Record<string, number>;

/** what one data source of the screen got */
export type PreviewSource = { name: string; operationId: string; status: string; items?: number; total?: number; error?: string };

/** what a screen showed under a scenario */
export type PreviewReport = {
  screen: string;
  /** the scenario played: its id, or "" for none (the normal answers) */
  scenario: string;
  signedIn: boolean;
  /** the params the screen was opened with: those given, the examples, and ids taken from the mock records */
  params: Record<string, unknown>;
  sources: PreviewSource[];
  /** each region on the screen and the state it shows */
  regions: { id: string; source?: string; state: RegionState }[];
  /** the calls made, in order: "GET /products → 200 (20 of 24)" */
  calls: string[];
  /** a screen that needs a session opened without one: the preview would go to the sign-in screen */
  needsSignIn?: boolean;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The groups as drawn on a canvas that does not evaluate anything: what the repeats and conditions decided is already
 *  in them, so the canvas must not repeat or fade them again. */
const asDrawn = (groups: Group[]): Group[] =>
  groups.map((g) => {
    if (!g.repeat && !(g.showWhen && "expr" in g.showWhen)) return g;
    const { repeat: _r, ...rest } = g;
    const out: Group = rest;
    if (out.showWhen && "expr" in out.showWhen) delete out.showWhen;
    return out;
  });

/** the document with the regions of a screen (or one region) showing a state on the canvas */
export function regionsShowing(doc: Doc, screen: string, state: RegionState, o: { region?: string; widths?: Widths } = {}): { doc: Doc; regions: string[] } {
  const frame = doc.frames.find((f) => f.id === screen);
  const mine = frame ? new Set(groupsInFrame(doc.groups, frame, doc.frames, o.widths ?? {}).map((g) => g.id)) : new Set<string>();
  const regions: string[] = [];
  const groups = doc.groups.map((g) => {
    if (!g.states || !mine.has(g.id)) return g;
    if (o.region && g.id !== o.region && g.items[0]?.id !== o.region) return g;
    regions.push(g.items[0]?.id ?? g.id);
    const { show: _show, ...rest } = g.states;
    return { ...g, states: state === "ready" ? rest : { ...rest, show: state } };
  });
  return { doc: { ...doc, groups }, regions };
}

/** The params a screen is opened with: those given, else each param's example, else (for a param a data source reads
 *  as a path parameter) the id of the first record the mock library hands out for that endpoint. */
async function paramsOf(doc: Doc, screen: string, given: Record<string, unknown> | undefined, transport: MockTransport): Promise<Record<string, unknown>> {
  const frame = doc.frames.find((f) => f.id === screen)!;
  const out: Record<string, unknown> = { ...given };
  for (const p of frame.params ?? []) if (out[p.name] === undefined && p.example !== undefined) out[p.name] = p.example;
  const missing = (frame.params ?? []).map((p) => p.name).filter((n) => out[n] === undefined);
  if (!missing.length || !doc.api) return out;
  const { compileRoutes } = await import("../mocks/routes");
  const routes = compileRoutes(doc.api, doc.mocks ?? {});
  for (const d of frame.data ?? []) {
    const route = routes.find((r) => r.operationId === d.operationId);
    if (!route?.model) continue;
    for (const [param, expr] of Object.entries(d.params ?? {})) {
      const m = /^\s*params\.([A-Za-z_]\w*)\s*$/.exec(expr);
      if (!m || !missing.includes(m[1]) || out[m[1]] !== undefined || param !== route.idParam) continue;
      const first = transport.records(route.model)[0];
      const id = first?.[route.idField ?? "id"];
      if (id !== undefined) out[m[1]] = id;
    }
  }
  return out;
}

/** What a call's answer amounted to, in a few words, from the request log. */
const callLine = (e: { method: string; path: string; status: number; note?: string }) => `${e.method} ${e.path} → ${e.status || "no answer"}${e.note ? ` (${e.note})` : ""}`;

/** One screen as the preview would show it under a scenario of the mock library (the document's own choice when left
 *  out, "" for none): the document with that screen's parts drawn from the data, and what each source got. A document
 *  with no endpoints shows the screen as designed. */
export async function previewScreen(doc: Doc, screen: string, o: { scenario?: string; params?: Record<string, unknown>; lang: Lang; widths: Widths; now?: number }): Promise<{ doc: Doc; widths: Widths; report: PreviewReport }> {
  const frame = doc.frames.find((f) => f.id === screen);
  if (!frame) throw new Error(`There is no screen ${JSON.stringify(screen)}.`);
  const scenario = o.scenario === undefined ? (doc.mocks?.scenario ?? "") : o.scenario;
  const known = !scenario || doc.mocks?.scenarios?.some((x) => x.id === scenario);
  if (!known) throw new Error(`There is no scenario ${JSON.stringify(scenario)}${doc.mocks?.scenarios?.length ? ` (the scenarios are ${doc.mocks.scenarios.map((x) => x.id).join(", ")})` : " (fill_mocks adds the usual ones)"}.`);
  const now = o.now ?? Date.now();
  const report: PreviewReport = { screen, scenario, signedIn: signedInAtStart(doc.mocks, scenario || undefined), params: {}, sources: [], regions: [], calls: [] };
  const groups = groupsInFrame(doc.groups, frame, doc.frames, o.widths);
  let transport: MockTransport | undefined;
  if (doc.api?.endpoints?.length) {
    const { createMockTransport, fakeClock } = await import("../mocks");
    transport = createMockTransport({ api: doc.api, mocks: doc.mocks, collections: doc.collections }, { scenario: scenario || "", latency: false, clock: fakeClock(now), locale: doc.mocks?.locale ?? (o.lang as "en") });
  }
  try {
    report.params = transport ? await paramsOf(doc, screen, o.params, transport) : { ...o.params };
    /* the runtime every exported app runs on, over the mocks, signed in as their session starts */
    const runtime = createRuntime({ transport: steadyTransport(() => transport), auth: authConfigOf(doc.api), presumed: report.signedIn, lang: o.lang, now: () => now });
    const data = new DesignRuntime(runtime, () => doc);
    const pv = screenVars(startState(doc.vars, doc.collections, false), doc, frame, false);
    const varNames = (doc.vars ?? []).map((v) => ({ id: v.id, name: v.name }));
    const at: ScreenAt = { frame, params: report.params, vars: pv.vars, varNames, now };
    if (transport && frame.data?.length) {
      if (frame.auth === "required" && !report.signedIn) report.needsSignIn = true;
      await data.enter(at);
    }
    const bound = boundScreen({ groups, frame, doc, scope: data.scope(at), form: (form, gs, owner) => data.formView({ form, groups: gs, owner, fields: {} }), vars: pv.vars, widths: o.widths, ctx: { lang: o.lang, now } });
    /* The parts as they are now (bound props read, conditions met), the rest left to whoever draws them: the canvas
       shows each region's pane and lays the flows out from the sizes it measures, as it does for any document. */
    const ps = { ...pv, ctx: bound.ctx };
    const parts = bound.groups.map((g) => {
      const items = g.items.map((it) => liveItem(it, ps));
      return items.every((it, i) => it === g.items[i]) ? g : { ...g, items };
    });
    const gone = new Set<string>();
    for (const g of parts) {
      if (gone.has(g.id) || (!isHidden(ps, g) && conditionHolds(g.showWhen, inRow(ps, g.items[0]?.row), doc, g.items[0]))) continue;
      gone.add(g.id);
      for (const h of heldBy(g, parts, bound.widths)) gone.add(h.id);
    }
    /* the row of a list that came back empty stays in its region, on the content pane the region does not show, as on
       the canvas: a region with nothing on that pane is laid out differently from the one the author sees */
    const kept = new Set(parts.map((g) => g.id));
    const byId = new Map(groups.map((g) => [g.id, g]));
    const showing = new Map(bound.groups.filter((g) => g.states).map((g) => [g.id, g.states!.show ?? "ready"]));
    const regionAbove = (g: Group): string | undefined => {
      for (let at = g.inFlow ? byId.get(g.inFlow) : undefined, i = 0; at && i < 64; at = at.inFlow ? byId.get(at.inFlow) : undefined, i++) if (showing.has(at.id)) return showing.get(at.id);
      return undefined;
    };
    const resting = groups.filter((g) => !kept.has(g.id) && !(g.pane ?? 0) && regionAbove(g) !== undefined && regionAbove(g) !== "ready");
    /* and the list it was a row of stays one: nothing was drawn for it, so the canvas has nothing to draw twice */
    const restingIds = new Set(resting.map((g) => g.id));
    const listsAtRest = new Set(groups.filter((g) => g.repeat?.data !== undefined && groups.some((c) => c.inFlow === g.id && restingIds.has(c.id))).map((g) => g.id));
    /* in the document's order: a row drawn for the data right after the one before it */
    const order = new Map(groups.map((g, i) => [g.id, i]));
    let last = -1;
    const keyed = parts.filter((g) => !gone.has(g.id)).map((g) => ({ g, k: (last = order.get(g.id) ?? last + 1e-3) }));
    const placed = [...keyed, ...resting.map((g) => ({ g, k: order.get(g.id)! }))].sort((x, y) => x.k - y.k).map((x) => x.g);
    const live = asDrawn(placed).map((g) => (listsAtRest.has(g.id) ? { ...g, repeat: byId.get(g.id)!.repeat } : g));
    const sources = data.screen(at).sources;
    for (const { src: d, spec } of sources) {
      const s = data.state(spec);
      const items = Array.isArray(s?.items) ? s.items.length : undefined;
      const err = s?.error;
      report.sources.push({
        name: d.name,
        operationId: d.operationId,
        status: s?.status ?? "idle",
        ...(items !== undefined ? { items } : {}),
        ...(typeof s?.total === "number" ? { total: s.total } : {}),
        ...(s?.status === "error" && isRecord(err) ? { error: [err.status, err.title, err.detail].filter((x) => x !== undefined && x !== "").join(" ") } : {}),
      });
    }
    report.regions = bound.groups.filter((g) => g.states).map((g) => ({ id: g.items[0]?.id ?? g.id, ...(g.states!.source ? { source: g.states!.source } : {}), state: (g.states!.show ?? "ready") as RegionState }));
    report.calls = (transport?.log ?? []).map(callLine);
    /* the screen's parts where they stood in the document's order, the rows drawn for the data right after the part
       they follow */
    const liveById = new Map(live.map((g) => [g.id, g]));
    const after = new Map<string, Group[]>();
    let prev = "";
    for (const g of live) {
      if (order.has(g.id)) prev = g.id;
      else (after.get(prev) ?? after.set(prev, []).get(prev)!).push(g);
    }
    const out: Group[] = [];
    let first = true;
    for (const g of doc.groups) {
      if (!order.has(g.id)) {
        out.push(g);
        continue;
      }
      if (first) out.push(...(after.get("") ?? []));
      first = false;
      const l = liveById.get(g.id);
      if (l) out.push(l);
      out.push(...(after.get(g.id) ?? []));
    }
    return { doc: { ...doc, groups: out }, widths: bound.widths, report };
  } finally {
    transport?.close();
  }
}

/** what a world view showed at a moment of a mock world */
export type WorldMoment = { script: string; at: number; views: string[]; events: string[] };

/** The document with its world views (those on `screen`, else every one) drawn as a mock world's script shows them at
 *  a moment (docs/模拟库.md “世界脚本”): the script's entities (with their hit points), score, status and follow, its
 *  words and its picture at `at` ms of world time, for a screenshot of a scene. The script is the one named, else the
 *  one the document's preview starts with; the events it sent up to then come back with it. */
export async function worldAt(doc: Doc, o: { script?: string; at?: number; screen?: string; widths?: Widths }): Promise<{ doc: Doc; moment: WorldMoment }> {
  const { findWorldScript, resolveWorldScript, worldScriptsOf } = await import("../mocks/world");
  const { eventsBetween, playsOn, roundTime, sceneAt } = await import("../world/script");
  const { partBySlug } = await import("../../parts/registry");
  const id = o.script || doc.mocks?.world;
  const found = findWorldScript(doc.mocks, id);
  if (!found) throw new Error(id ? `There is no world script ${JSON.stringify(id)} (the scripts are ${worldScriptsOf(doc.mocks).map((s) => s.id).join(", ")}).` : `Name a world script: the document's preview starts with none (the scripts are ${worldScriptsOf(doc.mocks).map((s) => s.id).join(", ")}).`);
  const script = resolveWorldScript(found, doc.mocks?.files);
  const at = Math.max(0, Number.isFinite(o.at) ? (o.at as number) : 0);
  const frame = o.screen ? doc.frames.find((f) => f.id === o.screen) : undefined;
  const onScreen = frame ? new Set(groupsInFrame(doc.groups, frame, doc.frames, o.widths ?? {}).map((g) => g.id)) : undefined;
  const views: string[] = [];
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const groups = doc.groups.map((g) => {
    if (onScreen && !onScreen.has(g.id)) return g;
    let changed = false;
    const items = g.items.map((it) => {
      if (!partBySlug(it.component)?.world || !playsOn(script, it.id)) return it;
      changed = true;
      views.push(it.id);
      const table = isRecord(it.props?.entities) ? (it.props.entities as { rows?: string[][] }) : undefined;
      const base = { entities: (table?.rows ?? []).map((r) => ({ id: r[0], kind: r[1], x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}) })), score: it.props?.score, status: it.props?.status, follow: it.props?.follow };
      const scene = sceneAt(script, at, base);
      const list = (Array.isArray(scene.snapshot.entities) ? scene.snapshot.entities : []).filter(isRecord);
      const hp = list.some((e) => typeof e.hp === "number" && typeof e.maxHp === "number");
      const entities = { columns: ["Id", "Kind", "X", "Y", "Label", ...(hp ? ["HP", "Max HP"] : [])], rows: list.map((e) => [str(e.id), str(e.kind), str(e.x), str(e.y), str(e.label), ...(hp ? [str(e.hp), str(e.maxHp)] : [])]) };
      const s = scene.snapshot;
      const props = { ...it.props, entities, ...(typeof s.score === "number" ? { score: s.score } : {}), ...(typeof s.status === "string" ? { status: s.status } : {}), ...(typeof s.follow === "string" ? { follow: s.follow } : {}), scene: scene.scene ?? it.props?.scene ?? "", picture: scene.picture ?? it.props?.picture ?? "" };
      return { ...it, props };
    });
    return changed ? { ...g, items } : g;
  });
  const round = roundTime(script, at);
  const events = eventsBetween(script, -1, round).slice(-20).map((e) => `${e.at}ms ${e.name} ${JSON.stringify(e.payload)}`);
  return { doc: { ...doc, groups }, moment: { script: script.id, at: round, views, events } };
}
