/* The harness: one task run as the editor runs a request, but headless. The starting document goes into a `DocStore`
 * that sizes parts by their own guesses (`guessMeasurer`) until headless Chromium has drawn them (the MCP file
 * backend's renderer, src/editor/RenderPage.tsx), and the request goes through the in-app agent's own turn runner
 * (lib/agent `runTurn`): the same system prompt, tool sets, loop, review and undo step as in the app. The provider
 * adapter is the one the app makes from its settings, wrapped to count every model call (the tools' own calls
 * included) and to stop asking once the task's token or time budget is spent; what was done until then is kept and
 * graded. Afterwards the changed screens are drawn, the reference compared, and one undo tried and redone. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiSettings, Provider } from "../lib/ai";
import { runTurn, type TurnEvent } from "../lib/agent";
import { touchedScreens } from "../lib/agent/diff";
import { DocStore, guessMeasurer, savedDoc, stateOf, type CoreState } from "../lib/core";
import { laidOut } from "../lib/core/ops/common";
import { setGlobalLang, type Lang } from "../lib/i18n";
import { addUsage, createAdapter, emptyUsage, type Adapter, type Message, type Usage } from "../lib/llm";
import { setDocStyles } from "../lib/styles";
import { compareGrid, decodePng, ToolFailure, type Attachment, type GenerateEnv, type RemoteDrawing, type Renderer } from "../lib/tools";
import { drawSvg, paintPicture } from "../lib/tools/generate";
import { dataUrlBytes } from "../lib/tools/pixels";
import { frameOfPart, type Doc } from "../lib/tokens";
import { silentLog } from "../mcp/src/log";
import { findApp, HeadlessRenderer } from "../mcp/src/render";
import { fixtureDoc } from "./fixtures";
import type { CallRecord, EvalTask, Observed } from "./types";

export const REFS = join(new URL(".", import.meta.url).pathname, "refs");

/** how the suite talks to the model */
export type ModelConfig = {
  provider: Provider;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl: string;
  /** the key, or the placeholder a proxy replaces on the way out; never printed */
  key: string;
  imageModel: string;
  fetch?: typeof fetch;
};

export const DEFAULT_MODEL: ModelConfig = { provider: "openai", model: "gpt-6.1-sol", effort: "medium", baseUrl: "https://api.openai.com/v1", key: "", imageModel: "gpt-image-2.6-sunburst" };

/** the settings the editor would hold for this configuration */
export const settingsOf = (m: ModelConfig): AiSettings => ({ provider: m.provider, baseUrl: m.baseUrl, model: m.model, key: m.key, imageProvider: "openai", imageBaseUrl: m.provider === "openai" ? m.baseUrl : "https://api.openai.com/v1", imageModel: m.imageModel, imageKey: m.provider === "openai" ? m.key : "", effort: m.effort });

/* ---------- pictures ---------- */

/** One headless Chromium per language the suite writes in, kept open across tasks. */
export class Renderers {
  private by = new Map<Lang, HeadlessRenderer>();
  constructor(private readonly app = findApp()) {}
  get available() {
    return !!this.app;
  }
  /** a renderer drawing what the store holds; what it measures goes back into the store */
  forStore(store: DocStore, lang: Lang): Renderer {
    let r = this.by.get(lang);
    if (!r) this.by.set(lang, (r = new HeadlessRenderer(this.app, lang, silentLog)));
    return r.forStore(() => store.get(), (w) => store.setWidths((cur) => ({ ...cur, ...w })));
  }
  async close() {
    await Promise.all([...this.by.values()].map((r) => r.close()));
    this.by.clear();
  }
}

/** a reference picture from evals/refs as an attachment, the way the editor hands one over */
export function attachmentOf(file: string, id = "ref1"): Attachment {
  const bytes = readFileSync(join(REFS, file));
  const px = decodePng(new Uint8Array(bytes));
  return { id, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, w: px.w, h: px.h, name: file };
}

const pixelsOf = (dataUrl: string) => decodePng(dataUrlBytes(dataUrl)!.bytes);

/** how alike a screenshot is to a reference, as compare_to_reference reckons it */
export function likenessOf(reference: string, shot: string): number {
  const ref = pixelsOf(reference);
  const sp = pixelsOf(shot);
  const rows = Math.max(4, Math.min(12, Math.round((4 * sp.h) / sp.w)));
  return compareGrid(ref, sp, 4, rows).similarity;
}

/* ---------- spending ---------- */

export class BudgetSpent extends Error {
  override name = "BudgetSpent";
}

export type Meter = { usage: Usage; calls: number; cut?: string; /** each call's own usage, in order */ each?: Usage[] };

/** The adapter with every call counted, refusing to ask again once the budget is spent (the turn then ends as a
 *  provider error would, keeping what it did). */
export function metered(inner: Adapter, budget: { tokens: number; ms: number }, t0: number, meter: Meter): Adapter {
  return {
    kind: inner.kind,
    model: inner.model,
    async *stream(req, signal) {
      const tokens = meter.usage.input + meter.usage.output;
      if (tokens >= budget.tokens || Date.now() - t0 >= budget.ms) {
        meter.cut = tokens >= budget.tokens ? "tokens" : "time";
        yield { type: "error", error: new BudgetSpent(`The task's ${meter.cut} budget is spent.`) };
        return;
      }
      meter.calls++;
      for await (const e of inner.stream(req, signal)) {
        if (e.type === "done") {
          meter.usage = addUsage(meter.usage, e.usage);
          meter.each?.push(e.usage);
        }
        yield e;
      }
    },
  };
}

/** Drawing as the editor draws, with the editor's settings, but no more than `allowed` times: the turn keeps the app's
 *  own allowance (and the prompt that names it), while the suite caps what it spends on the image model. A drawing
 *  past the cap is refused the way a spent allowance is. */
export function cappedDrawing(local: GenerateEnv, allowed: number): { remote: RemoteDrawing; drew: () => number } {
  let left = allowed;
  let drew = 0;
  const take = () => {
    if (left <= 0) throw new ToolFailure("refused", "No more drawings are allowed this turn.", "Use what was drawn already, an icon or the svg atom's library shapes.");
    left--;
    drew++;
  };
  return {
    drew: () => drew,
    remote: {
      async svg(args, signal) {
        take();
        return drawSvg(args as never, local, signal);
      },
      async image(a, signal) {
        take();
        return paintPicture(local, a.prompt, a.box, signal);
      },
    },
  };
}

/* ---------- one run ---------- */

export type RunOptions = {
  model: ModelConfig;
  /** an adapter instead of the provider's (tests, a scripted model) */
  adapter?: (task: EvalTask) => Adapter;
  /** null: no pictures at all (the turn cannot screenshot, nothing is drawn after it) */
  renderers: Renderers | null;
  /** a cap on every task's token budget */
  budgetTokens?: number;
  /** drawings the whole suite may still make; each task takes what it uses */
  drawings: { left: number };
  onEvent?: (e: TurnEvent) => void;
};

/** What a run leaves: the observation the graders read, and what a recording keeps beside it. */
export type RunOutput = {
  observed: Observed;
  /** the conversation, pictures left as references to the files in `pictures` */
  transcript: Message[];
  /** every picture seen or drawn, by file name */
  pictures: Record<string, string>;
};

const clip = (v: unknown, n = 4000): unknown => {
  const s = JSON.stringify(v ?? null);
  return s.length <= n ? v : `${s.slice(0, n)}…(${s.length} chars)`;
};

/** the conversation with its pictures written out as files and the opaque replay data of reasoning left out */
function transcriptOf(messages: Message[], pictures: Record<string, string>): Message[] {
  let n = 0;
  const known = new Map(Object.entries(pictures).map(([name, url]) => [url, name]));
  const file = (dataUrl: string) => {
    const had = known.get(dataUrl);
    if (had) return had;
    const name = `msg-${String(++n).padStart(2, "0")}.${/^data:image\/jpe?g/.test(dataUrl) ? "jpg" : "png"}`;
    pictures[name] = dataUrl;
    known.set(dataUrl, name);
    return name;
  };
  const parts = <T extends { type: string }>(list: T[]): T[] => list.map((p) => (p.type === "image" ? ({ type: "text", text: `[picture ${file((p as unknown as { dataUrl: string }).dataUrl)}]` } as unknown as T) : p));
  return messages.map((m): Message => {
    if (m.role === "user") return typeof m.content === "string" ? m : { ...m, content: parts(m.content) };
    if (m.role === "tool") return { ...m, results: m.results.map((r) => ({ ...r, content: parts(r.content) })) };
    return { ...m, content: m.content.map((p) => ("native" in p ? (({ native: _n, ...rest }) => rest)(p as { native?: unknown }) : p)) as never };
  });
}

/** the error of each failed call, from the results the model read */
function errorsOf(messages: Message[]): Map<string, { code: string; message: string }> {
  const out = new Map<string, { code: string; message: string }>();
  for (const m of messages) {
    if (m.role !== "tool") continue;
    for (const r of m.results) {
      if (!r.isError) continue;
      const text = r.content.map((p) => (p.type === "text" ? p.text : "")).join("");
      try {
        const e = JSON.parse(text) as { code?: string; message?: string };
        out.set(r.callId, { code: String(e.code ?? "failed"), message: String(e.message ?? text) });
      } catch {
        out.set(r.callId, { code: "failed", message: text.slice(0, 300) });
      }
    }
  }
  return out;
}

const same = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);

export async function runTask(task: EvalTask, o: RunOptions): Promise<RunOutput> {
  setGlobalLang(task.lang);
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => task.lang });
  /* the editor keeps the document's own styles in reach for whatever reads a style by its key */
  store.subscribe((e) => setDocStyles(e.state.doc.styles));
  store.load(fixtureDoc(task.fixture), true);
  setDocStyles(store.get().doc.styles);
  const pictures: Record<string, string> = {};
  const renderer = o.renderers?.forStore(store, task.lang);

  /* the canvas has measured what the author sees, and laid it out by those sizes, before they type */
  if (renderer) {
    for (const f of store.get().doc.frames.slice(0, 4)) pictures[`before-${f.id}.png`] = await renderer.screenshot(f.id);
    store.update("Measure", "system", (s: CoreState) => laidOut(s, guessMeasurer.measure(s)));
  }
  if (task.select?.length) store.select(task.select);
  if (task.selectScreen) store.selectFrame(task.selectScreen);
  const start = savedDoc(store.get());
  const startWidths = guessMeasurer.measure(store.get());
  const stepsBefore = store.history().length;

  const budget = { ...task.budget, tokens: Math.min(task.budget.tokens, o.budgetTokens ?? Infinity) };
  const t0 = Date.now();
  const meter: Meter = { usage: emptyUsage(), calls: 0, each: [] };
  const settings = settingsOf(o.model);
  const inner = o.adapter ? o.adapter(task) : createAdapter(settings, { effort: o.model.effort, ...(o.model.fetch ? { fetch: o.model.fetch } : {}) });
  const adapter = metered(inner, budget, t0, meter);
  const images = task.reference ? [attachmentOf(task.reference)] : [];
  const capped = cappedDrawing({ settings, adapter, ...(o.model.fetch ? { fetch: o.model.fetch } : {}) }, Math.min(task.budget.drawings ?? 2, o.drawings.left));

  /* a call that hangs is stopped well after the budget; that takes the turn back, as stopping does in the editor */
  const ac = new AbortController();
  const hard = setTimeout(() => ac.abort(new BudgetSpent("The task ran far over its time budget.")), budget.ms + 120_000);
  const calls = new Map<string, CallRecord>();
  let shot = 0;
  const keepShots = (images: string[], what: string) => {
    for (const url of images) pictures[`${what}-${String(++shot).padStart(2, "0")}.${/^data:image\/jpe?g/.test(url) ? "jpg" : "png"}`] = url;
  };
  const r = await runTurn({
    store,
    adapter,
    history: [],
    request: task.request,
    images,
    attachments: images,
    lang: task.lang,
    ...(renderer ? { renderer } : {}),
    gen: { settings, adapter, remote: capped.remote },
    maxSteps: budget.steps,
    signal: ac.signal,
    onEvent: (e) => {
      if (e.type === "tool_start") {
        const batch = e.name === "apply_ops" && Array.isArray(e.args?.ops) ? (e.args.ops as { op?: unknown }[]).map((x) => String(x?.op ?? "")) : undefined;
        calls.set(e.id, { step: e.step, id: e.id, name: e.name, args: clip(e.args), ...(batch ? { ops: batch } : {}), ok: false, summary: "", ms: 0 });
      } else if (e.type === "tool_end") {
        const c = calls.get(e.id);
        if (c) Object.assign(c, { ok: e.ok, summary: e.summary.slice(0, 300), ms: e.ms });
        keepShots(e.images, `tool-${e.name}`);
      } else if (e.type === "review") keepShots(e.images, "review");
      o.onEvent?.(e);
    },
  }).finally(() => clearTimeout(hard));
  o.drawings.left = Math.max(0, o.drawings.left - capped.drew());
  const errors = errorsOf(r.messages);
  const callList = [...calls.values()].map((c) => (c.ok ? c : { ...c, ...(errors.has(c.id) ? { error: errors.get(c.id)! } : { error: { code: "failed", message: c.summary } }) }));

  /* what the turn changed, drawn: the sizes measured as they come out */
  const now = store.get();
  const screens = touchedScreens(r.diff, now.doc as Doc, (id) => {
    const g = now.doc.groups.find((x) => x.items.some((it) => it.id === id));
    return g ? frameOfPart(g, now.doc.groups, now.doc.frames, guessMeasurer.measure(now))?.id : undefined;
  }).slice(0, 4);
  const shots: Observed["shots"] = [];
  const likeness: NonNullable<Observed["likeness"]> = [];
  if (renderer) {
    /* a change of the whole document (a style, the theme) touches no screen of its own: every screen shows it */
    const shown = screens.length ? screens : r.changed ? now.doc.frames.slice(0, 4).map((f) => f.id) : [];
    /* one picture measures every part, so the sizes are right even when nothing was changed */
    const ids = shown.length ? shown : now.doc.frames.slice(0, 1).map((f) => f.id);
    for (const id of ids) {
      try {
        const png = await renderer.screenshot(id);
        const name = `after-${id}.png`;
        pictures[name] = png;
        if (shown.includes(id)) shots.push({ screen: id, file: name });
        if (images[0] && shown.includes(id)) likeness.push({ screen: id, similarity: likenessOf(images[0].dataUrl, png) });
      } catch {
        /* a screen that will not draw is graded on its outline alone */
      }
    }
  }
  const final = savedDoc(store.get());
  const widths = guessMeasurer.measure(store.get());

  /* one undo takes the turn back whole, and redo brings it again */
  let undo: Observed["undo"] = null;
  if (r.changed) {
    const steps = store.history().length - stepsBefore;
    store.undo("user");
    const restores = same(savedDoc(store.get()), start);
    store.redo("user");
    undo = { steps, restores: restores && same(savedDoc(store.get()), final) };
  }

  const observed: Observed = {
    task: task.id,
    lang: task.lang,
    request: task.request,
    model: inner.model,
    effort: o.model.effort,
    start,
    final,
    startWidths,
    widths,
    calls: callList,
    stop: r.stop,
    ...(r.error !== undefined ? { error: r.error instanceof Error ? `${r.error.name}: ${r.error.message}` : String(r.error) } : {}),
    text: r.text,
    usage: meter.usage,
    turnUsage: r.usage,
    ms: r.ms,
    steps: r.steps,
    drawings: capped.drew(),
    undo,
    ...(images.length ? { likeness } : {}),
    shots,
    budget,
    ...(meter.cut ? { cut: meter.cut } : {}),
    perCall: (meter.each ?? []).map((u) => ({ input: u.input, cachedInput: u.cachedInput, output: u.output })),
  };
  return { observed, transcript: transcriptOf(r.messages, pictures), pictures };
}
