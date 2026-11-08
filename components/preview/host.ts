/* The editor's preview as a host of the interpreter (lib/actions/host.ts): what a tap does is decided by lib/actions
 * `run`, the one set of rules every host follows (docs/交互规则.md); this file only says how the preview keeps and
 * shows what the rules ask for. Its interaction state is the store (store.ts); its data, calls, forms and session are
 * the runtime every exported app runs on (lib/app: its data sources' cache, its form controllers, its session store),
 * read from the document by lib/bindings/design.ts: this file is the preview's only contact with it. The runtime also says
 * when the preview has started over, so an answer to the session before lands nowhere, and invokes the platform
 * capabilities (the mock library's, the catalog's examples). Navigation is the preview's own and is handed in. No React
 * and no page here: the preview's click-path tests run this file as it is. */

import type { BackOptions, CallArgs, Change, FormRef, GoOptions, Host, InvokeOutcome, Tap } from "@/lib/actions";
import { outcomeOf } from "@/lib/app/actions";
import type { DesignRuntime, FormAt, ScreenAt } from "@/lib/bindings/design";
import type { TransportFile } from "@/lib/api/transport";
import { endpointOf, paramsOf } from "@/lib/bindings/contract";
import { evaluate } from "@/lib/bindings/expr";
import { NO_BINDINGS, scopeFor, type BindingContext } from "@/lib/bindings/scope";
import { formsOf, type BoundScreen } from "@/lib/bindings/view";
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
  /** the data, the calls, the forms and the session: lib/app's runtime, read from the document; when the preview
   *  started over, and the capabilities */
  data: DesignRuntime;
  /** how many times the capabilities were handed over (another mock session of theirs): an invoke made before the last
   *  time answers into nothing */
  capabilitySession?: () => number;
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

/** The preview's host. Made once for a preview session: the interpreter keeps which call of a part is the newest by
 *  its host, so every tap runs on this same object. */
export function createPreviewHost(d: PreviewHostDeps): Host {
  const frameOf = (id: string): Frame | undefined => d.doc().frames.find((f) => f.id === id);
  const varNames = () => (d.doc().vars ?? []).map((v) => ({ id: v.id, name: v.name }));
  /** the variables as a screen shows them: those nothing has written in its modes */
  const varsOn = (f: Frame | undefined): PreviewState => screenVars(d.store.get(), d.doc(), f, d.dark());
  const write = (fn: (s: PreviewState) => PreviewState) => d.store.update(fn);

  const runtime = d.data.runtime;
  /** where a screen's data is read now: its params, the variables as it shows them */
  const atScreen = (f: Frame, params: Record<string, unknown> | undefined, s: PreviewState): ScreenAt => ({ frame: f, params, vars: s.vars, varNames: varNames() });

  /** a form of a screen as the visitor has filled it in now */
  const formAt = (b: BoundScreen, form: Group): FormAt => ({ form, groups: b.groups, owner: formsOf(b.groups), fields: d.store.get().fields, files: d.files() });

  const host: Host = {
    scope(tap) {
      const f = frameOf(tap.screen);
      const s = varsOn(f);
      const part = partOf(tap);
      if (!f) return scopeFor({ ...NO_BINDINGS, varNames: varNames(), eval: host.ctx() }, s.vars, part);
      const b = d.bound(f.id);
      const base: BindingContext = { scope: d.data.scope(atScreen(f, tap.params, s)), varNames: varNames(), forms: b?.ctx.forms ?? {}, eval: host.ctx() };
      /* the form of the tap as it is now: what is typed in it, what its submission has come to */
      const group = tap.form ? b?.groups.find((g) => g.id === tap.form) : undefined;
      const form = b && group?.form ? d.data.formView(formAt(b, group)) : undefined;
      return scopeFor(form ? { ...base, forms: { ...base.forms, [tap.form!]: form } } : base, s.vars, part);
    },
    ctx: () => runtime.ctx(),

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
      return outcomeOf(await d.data.call(operationId, { params, body }));
    },
    async invoke(capability, args): Promise<InvokeOutcome> {
      const session = d.capabilitySession?.();
      const out = await runtime.invoke(capability, args);
      /* the capabilities were handed over while it was out: it belongs to their session before */
      if (session !== d.capabilitySession?.() && !(!out.ok && out.dropped)) return { ok: false, error: out.ok ? { type: "failed", capability } : out.error, dropped: true };
      /* the page a link.open was given leaves the sketch the way a link action does */
      if (out.ok && capability === "link.open" && typeof args.url === "string") d.openLink(args.url);
      return out;
    },
    optimistic(source, change: Change, tap) {
      const f = frameOf(tap.screen);
      const spec = f ? d.data.sourceOf(atScreen(f, tap.params, varsOn(f)), source) : undefined;
      const was = spec ? d.data.state(spec) : undefined;
      if (!spec || !was?.items || was.key !== spec.key || tap.item === undefined) return undefined;
      return runtime.sources.optimistic(spec.key, tap.item, change);
    },
    refresh(source, tap) {
      const f = frameOf(tap.screen);
      if (f) void d.data.load(atScreen(f, tap.params, varsOn(f)), source);
    },
    loadMore(source, tap) {
      const f = frameOf(tap.screen);
      if (f) void d.data.load(atScreen(f, tap.params, varsOn(f)), source, { more: true });
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
      const b = d.bound(tap.screen);
      const form = b?.groups.find((g) => g.id === ref.id) ?? d.doc().groups.find((g) => g.id === ref.id);
      if (!frameOf(tap.screen) || !b || !form?.form) return null;
      const scope = host.scope(tap);
      const params = Object.fromEntries(Object.entries(form.form.params ?? {}).map(([k, x]) => [k, evaluate(x, scope, host.ctx())]));
      const extra = Object.fromEntries(Object.entries(form.form.values ?? {}).map(([k, x]) => [k, evaluate(x, scope, host.ctx())]));
      /* checked and sent by lib/app's form controller; nothing sent (a field is wrong, or it is out already) is null */
      const out = await d.data.submit(formAt(b, form), { params, extra });
      return out ? outcomeOf(out) : null;
    },

    signOut() {
      /* wherever a sign-in would have taken the app back to is forgotten with the session */
      runtime.takeReturn();
      d.data.signOut();
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
