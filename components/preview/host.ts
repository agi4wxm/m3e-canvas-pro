/* The editor's preview as a host of the interpreter (lib/actions/host.ts): what a tap does is decided by lib/actions
 * `run`, the one set of rules every host follows (docs/交互规则.md); this file only says how the preview keeps and
 * shows what the rules ask for. Its interaction state is the store (store.ts); its data, calls, forms and session are
 * the bindings engine (lib/bindings/runtime.ts) that draws the screens; the runtime (lib/app) says when the preview has
 * started over, so an answer to the session before lands nowhere, and invokes the platform capabilities (the mock
 * library's, the catalog's examples). Navigation is the preview's own and is handed in. No React and no page here:
 * the preview's click-path tests run this file as it is. */

import type { BackOptions, CallArgs, Change, FormRef, GoOptions, Host, InvokeOutcome, Outcome, Tap } from "@/lib/actions";
import type { Runtime } from "@/lib/app/runtime";
import type { TransportFile } from "@/lib/api/transport";
import { endpointOf, paramsOf } from "@/lib/bindings/contract";
import { evaluate, type Scope } from "@/lib/bindings/expr";
import { formViewOf } from "@/lib/bindings/form";
import { screenScope, sourceKey, type BindingEngine, type BindingState, type CallOutcome } from "@/lib/bindings/runtime";
import { NO_BINDINGS, scopeFor, type BindingContext } from "@/lib/bindings/scope";
import { optimisticChange } from "@/lib/bindings/sources";
import { formsOf, readForm, type BoundScreen } from "@/lib/bindings/view";
import { applyEffects, conditionHolds, isHidden, screenVars, type PreviewState } from "@/lib/interact";
import type { Doc, Frame, Group, Item, ItemScope, VarValue } from "@/lib/tokens";
import type { PreviewStore } from "./store";

export type PreviewHostDeps = {
  doc: () => Doc;
  /** the interaction state */
  store: PreviewStore;
  /** the mode the preview shows: a variable nothing has written reads its value in it */
  dark: () => boolean;
  /** the screen on show (the overlay over it, when there is one): what a variable read without a tap reads in */
  onShow: () => Frame | undefined;
  /** the data, the calls, the forms and the session */
  engine: BindingEngine;
  bindings: () => BindingState;
  setBindings: (next: BindingState) => void;
  /** when the preview started over, and the capabilities */
  runtime: Runtime;
  /** each screen as its bindings had it when last drawn (its repeats, its forms) */
  bound: (frameId: string) => BoundScreen | undefined;
  /** the files the visitor gave the file inputs, by item id */
  files: () => Record<string, TransportFile[]>;
  /* where the visitor goes: the preview's own */
  go: (to: string, o: GoOptions) => void;
  back: (o?: BackOptions) => void;
  openLink: (url: string) => void;
  scrollTo: (part: string) => void;
  /** how many times the visitor has gone somewhere */
  moves: () => number;
  /** a sign-in answered: back where a guard or a refusal sent the app from, if one did; whether it went */
  returnAfterSignIn: () => boolean;
  /** an effect said which entry of a part is chosen (`setProp`): an earlier tap on its entries no longer speaks for it */
  told?: (part: string) => void;
  /** the visitor signed out: a screen that needs a session cannot stay on show */
  signedOut?: () => void;
  /** a timer for a form's upload progress */
  tick?: (fn: () => void) => () => void;
};

/** where in the document a part is: its group */
const groupOf = (groups: Group[], part: string): Group | undefined => groups.find((g) => g.items.some((it) => it.id === part));

/** the part a tap was made on, as the bindings' scope reads it: its element of a data repeat, its form, its row */
const partOf = (tap: Tap): Pick<Item, "scope" | "row"> => {
  const scope: ItemScope = {
    ...("item" in tap ? { item: tap.item } : {}),
    ...(tap.index !== undefined ? { index: tap.index } : {}),
    ...(tap.form ? { form: tap.form } : {}),
  };
  return { scope, ...(tap.row ? { row: tap.row } : {}) };
};

/** A call's answer as the interpreter takes it. One that comes after the preview started over (another scenario, the
 *  log's "start over", another transport) is `dropped`: it belongs to a session that is gone. */
function outcomeOf(out: CallOutcome, stale: boolean): Outcome {
  if (stale || (!out.ok && out.dropped)) return { ok: false, status: out.status, error: out.ok ? null : out.problem, dropped: true };
  if (out.ok) return { ok: true, status: out.status, response: out.body };
  return { ok: false, status: out.status, error: out.problem, ...(out.unauthorized ? { unauthorized: true } : {}) };
}

/** The preview's host. Made once for a preview session: the interpreter keeps which call of a part is the newest by
 *  its host, so every tap runs on this same object. */
export function createPreviewHost(d: PreviewHostDeps): Host {
  const frameOf = (id: string): Frame | undefined => d.doc().frames.find((f) => f.id === id);
  const varNames = () => (d.doc().vars ?? []).map((v) => ({ id: v.id, name: v.name }));
  /** the variables as a screen shows them: those nothing has written in its modes */
  const varsOn = (f: Frame | undefined): PreviewState => screenVars(d.store.get(), d.doc(), f, d.dark());
  const write = (fn: (s: PreviewState) => PreviewState) => d.store.update(fn);

  /** a screen's own scope as it is now: its data, its params, the variables, the session, the time */
  const screenNow = (f: Frame, params: Record<string, unknown> | undefined, s: PreviewState): Scope =>
    screenScope({ frame: f, state: d.bindings(), params, vars: s.vars, varNames: varNames(), collections: d.doc().collections });

  /** the form of a tap as it is now: what is typed in it, what its submission has come to */
  const formNow = (f: Frame, id: string, scope: Scope, s: PreviewState) => {
    const b = d.bound(f.id);
    const form = b?.groups.find((g) => g.id === id);
    if (!b || !form?.form) return undefined;
    const read = readForm({ form, groups: b.groups, owner: formsOf(b.groups), doc: d.doc(), fields: s.fields, files: d.files(), scope, ctx: host.ctx() });
    return formViewOf(read, d.bindings().forms[id]);
  };

  const host: Host = {
    scope(tap) {
      const f = frameOf(tap.screen);
      const s = varsOn(f);
      const part = partOf(tap);
      if (!f) return scopeFor({ ...NO_BINDINGS, varNames: varNames(), eval: host.ctx() }, s.vars, part);
      const base: BindingContext = { scope: screenNow(f, tap.params, s), varNames: varNames(), forms: d.bound(f.id)?.ctx.forms ?? {}, eval: host.ctx() };
      const form = tap.form ? formNow(f, tap.form, scopeFor(base, s.vars), s) : undefined;
      return scopeFor(form ? { ...base, forms: { ...base.forms, [tap.form!]: form } } : base, s.vars, part);
    },
    ctx: () => d.runtime.ctx(),

    variable(id) {
      const v = (d.doc().vars ?? []).find((x) => x.id === id);
      if (!v) return undefined;
      return { type: v.type, value: varsOn(d.onShow()).vars[id] ?? v.value };
    },
    /* the preview's own rules keep a variable to its type: a color only takes a color */
    setVar: (id, value: VarValue) => write((s) => applyEffects(s, [{ do: "setVar", var: id, value }], d.doc())),
    filled: (part) => conditionHolds({ filled: part }, varsOn(d.onShow()), d.doc()),
    shown(part) {
      const g = groupOf(d.doc().groups, part);
      return !!g && !isHidden(d.store.get(), g);
    },
    setShown: (part, on) => write((s) => applyEffects(s, [{ do: on ? "show" : "hide", part }], d.doc())),
    setOpen: (part, on) => write((s) => applyEffects(s, [{ do: on ? "open" : "close", part }], d.doc())),
    setProp(part, prop, value) {
      write((s) => applyEffects(s, [{ do: "setProp", part, prop, value }], d.doc()));
      d.told?.(part);
    },
    toast: (text) => write((s) => ({ ...s, snack: { id: (s.snack?.id ?? 0) + 1, message: text } })),

    go: (to, o) => d.go(to, o),
    back: (o) => d.back(o),
    openLink: (url) => d.openLink(url),
    scrollTo: (part) => d.scrollTo(part),

    async call(operationId, given: CallArgs) {
      /* the contract places what an endpoint takes (path, query, header); the rest is the JSON body */
      const api = d.doc().api;
      const ep = api ? endpointOf(api, operationId) : undefined;
      const takes = new Set(api && ep ? paramsOf(api, ep).map((p) => p.name) : []);
      const params: Record<string, unknown> = {};
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(given.args)) (takes.has(k) ? params : fields)[k] = v;
      const body = given.body !== undefined ? given.body : Object.keys(fields).length ? fields : undefined;
      const epoch = d.runtime.epoch.get();
      const out = await d.engine.call(operationId, { params, body });
      return outcomeOf(out, epoch !== d.runtime.epoch.get());
    },
    async invoke(capability, args): Promise<InvokeOutcome> {
      const out = await d.runtime.invoke(capability, args);
      /* the page a link.open was given leaves the sketch the way a link action does */
      if (out.ok && capability === "link.open" && typeof args.url === "string") d.openLink(args.url);
      return out;
    },
    optimistic(source, change: Change, tap) {
      const key = sourceKey(tap.screen, source);
      const was = d.bindings().sources[key];
      if (!was?.items || tap.item === undefined) return undefined;
      const changed = optimisticChange(was, tap.item, change);
      const put = (items: unknown[] | undefined, value: unknown) => {
        const now = d.bindings();
        d.setBindings({ ...now, sources: { ...now.sources, [key]: { ...(now.sources[key] ?? was), items, value } } });
      };
      put(changed.items, changed.value);
      return () => put(was.items, was.value);
    },
    refresh(source, tap) {
      const f = frameOf(tap.screen);
      const src = f?.data?.find((x) => x.name === source);
      if (f && src) void d.engine.load(f, src, screenNow(f, tap.params, varsOn(f)), { force: true }).catch(() => {});
    },
    loadMore(source, tap) {
      const f = frameOf(tap.screen);
      const src = f?.data?.find((x) => x.name === source);
      if (f && src) void d.engine.load(f, src, screenNow(f, tap.params, varsOn(f)), { more: true }).catch(() => {});
    },

    form(id, tap): FormRef | undefined {
      const b = d.bound(tap.screen);
      if (!b) return undefined;
      const owner = formsOf(b.groups);
      const gid = id ?? (tap.part ? owner.get(groupOf(b.groups, tap.part)?.id ?? "") : undefined);
      const g = b.groups.find((x) => x.id === gid) ?? (gid ? d.doc().groups.find((x) => x.id === gid) : undefined);
      if (!g?.form) return undefined;
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      return { id: g.id, operationId: g.form.operationId, ...(g.form.then ? { then: g.form.then } : {}), ...(g.form.catch ? { catch: g.form.catch } : {}) };
    },
    async submit(ref, tap) {
      const f = frameOf(tap.screen);
      const b = d.bound(tap.screen);
      const form = b?.groups.find((g) => g.id === ref.id) ?? d.doc().groups.find((g) => g.id === ref.id);
      if (!f || !b || !form?.form) return null;
      /* a second press while it is out is no new submission, nor a failed one */
      if (d.engine.formState(form.id).submitting) return null;
      const scope = host.scope(tap);
      const read = readForm({ form, groups: b.groups, owner: formsOf(b.groups), doc: d.doc(), fields: d.store.get().fields, files: d.files(), scope, ctx: host.ctx() });
      if (Object.keys(read.errors).length) {
        d.engine.setForm(form.id, { errors: read.errors, submitted: true, error: null });
        return null;
      }
      const params = Object.fromEntries(Object.entries(form.form.params ?? {}).map(([k, x]) => [k, evaluate(x, scope, host.ctx())]));
      const epoch = d.runtime.epoch.get();
      const out = await d.engine.submit(form.id, form.form.operationId, { params, body: read.body }, { files: read.files, tick: d.tick });
      return outcomeOf(out, epoch !== d.runtime.epoch.get());
    },

    signOut() {
      /* wherever a sign-in would have taken the app back to is forgotten with the session */
      d.runtime.takeReturn();
      d.engine.signOut();
      d.signedOut?.();
    },
    afterSignIn: (operationId) => d.doc().api?.auth?.login === operationId && d.returnAfterSignIn(),
    moves: () => d.moves(),
  };
  return host;
}

/** What a tap on a part of a screen is, fixed as it is made (lib/actions `Tap`): the screen and its params, the part,
 *  its element of a data repeat, its collection row, its form, the row `{{current.*}}` reads, and what the place or the
 *  event that started it carries. */
export function tapOf(on: { frame: Pick<Frame, "id">; params?: Record<string, unknown> }, it: Item | undefined, current: Record<string, string> | undefined, extra: TapExtra = {}): Tap {
  const own = it?.scope;
  return {
    screen: on.frame.id,
    ...(on.params ? { params: on.params } : {}),
    ...(it ? { part: it.id } : {}),
    ...(own && "item" in own ? { item: own.item } : {}),
    ...(own?.index !== undefined ? { index: own.index } : {}),
    ...(it?.row ? { row: it.row } : {}),
    ...(current ? { current } : {}),
    ...(own?.form ? { form: own.form } : {}),
    ...(extra.slot ? { slot: extra.slot } : {}),
    ...(extra.event !== undefined ? { event: extra.event } : {}),
  };
}

/** what a part's place or event adds to a tap: the place a family's action ran for, the payload of an event */
export type TapExtra = { slot?: { key: string; index: number }; event?: unknown };
