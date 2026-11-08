/* One screen as its bindings have it at a moment: its scope (lib/bindings/design.ts `DesignRuntime.screen`: the data the
 * runtime holds, the params, the variables, the session), each form's values and errors (lib/app's form controller),
 * its repeats over data drawn from what the data holds, each region showing the state its data is in, inputs with an
 * error showing it, a form's submit buttons held while it submits. What comes out is plain groups the preview lays
 * out and draws like any other (lib/interact.ts `liveGroups`), and the context expressions on them read. The pure
 * readings of a form's inputs (`inputValue`, `readForm`) and of a region (`regionState`) live here too. */

import { partBySlug, reader } from "../../parts/registry";
import { formStateProps } from "../../parts/fieldState";
import { expandRepeats, measuresFor } from "../collections";
import { INPUT_PROP, type FieldValue } from "../interact";
import { optionsOf } from "../partContract";
import type { DataSource, Doc, Frame, Group, Item, ItemScope, VarValue } from "../tokens";
import type { TransportFile } from "../api/transport";
import { endpointOf, formFields, type FieldSpec } from "./contract";
import { readFields, setPath, type FieldEntry, type FormView } from "./form";
import { evaluate, readKey, truthy, type EvalContext, type Scope } from "./expr";
import { regionOf, type SourceView } from "./sources";
import { scopeFor, type BindingContext } from "./scope";

type Widths = Record<string, number>;

/** the containers around each group: the nearest with a form, by group id */
export function formsOf(groups: Group[]): Map<string, string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Map<string, string>();
  const find = (g: Group): string | undefined => {
    let at: Group | undefined = g;
    for (let i = 0; at && i < 64; i++) {
      if (out.has(at.id)) return out.get(at.id);
      if (at.form) return at.id;
      at = at.inFlow ? byId.get(at.inFlow) : undefined;
    }
    return undefined;
  };
  for (const g of groups) {
    const f = find(g);
    if (f) out.set(g.id, f);
  }
  return out;
}

/** a form's errors as a design reads them: `form.errors.email`, `form.errors["address.city"]` */
const ERRORS_READ = /form\.errors(?:\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)|\[\s*["']([^"']+)["']\s*\])/g;

/** The fields whose error a form's design shows by itself (a helper line bound to `form.errors.<field>`, as make_form
 *  writes one), as `<form id>:<field>`: their inputs are not handed the message again, so a design that shows it once
 *  still shows it once. */
export function messagesShown(groups: Group[], owner: Map<string, string> = formsOf(groups)): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    const form = owner.get(g.id);
    if (!form) continue;
    for (const it of g.items) {
      const read = [...Object.values(it.bind ?? {}), ...Object.values(it.props ?? {}).filter((v): v is string => typeof v === "string" && v.includes("{{"))];
      for (const text of read) for (const m of String(text).matchAll(ERRORS_READ)) out.add(`${form}:${m[1] ?? m[2]}`);
    }
  }
  return out;
}

/** what an input holds now, as its field's value: the words, the tick, the option chosen, the file */
export function inputValue(it: Item, fields: Record<string, FieldValue>, files?: Record<string, TransportFile[]>): unknown {
  if (it.component === "file-upload") {
    const f = files?.[it.id];
    return f?.length ? (f.length === 1 ? f[0] : f) : undefined;
  }
  const key = INPUT_PROP[it.component ?? ""];
  if (key === undefined) return undefined;
  const def = partBySlug(it.component);
  const d = def?.props.find((x) => x.key === key);
  const r = def ? reader(def, it.props) : undefined;
  const raw = fields[it.id] !== undefined ? fields[it.id] : !r || !d ? undefined : d.kind === "bool" ? r.b(key) : d.kind === "number" ? r.n(key) : d.kind === "list" ? r.list(key) : r.s(key);
  /* a choice sends the words of what is picked, a list the words of its rows */
  if (def?.input?.kind === "choice" && typeof raw === "number") return raw >= 0 ? optionsOf(it)[raw] : undefined;
  if (Array.isArray(raw)) return raw.map((r) => r.label);
  return raw;
}

/** what a form is read from: its group, the screen's groups (`owner` says which are in it), what the visitor gave */
export type FormInputs = { form: Group; groups: Group[]; owner: Map<string, string>; doc: Pick<Doc, "api">; fields: Record<string, FieldValue>; files?: Record<string, TransportFile[]> };

/** What a form's inputs hold, field by field, each with its rule from the contract when the schema has the field. */
export function formEntries(o: FormInputs): FieldEntry[] {
  const api = o.doc.api ?? {};
  const e = o.form.form ? endpointOf(api, o.form.form.operationId) : undefined;
  const specs: FieldSpec[] = e ? formFields(api, e) : [];
  const entries: FieldEntry[] = [];
  for (const g of o.groups) {
    if (o.owner.get(g.id) !== o.form.id) continue;
    for (const it of g.items) {
      if (!it.field) continue;
      const spec = specs.find((s) => s.name === it.field);
      entries.push({ field: it.field, raw: inputValue(it, o.fields, o.files), ...(spec ? { rule: { kind: spec.kind, required: spec.required, schema: spec.schema } } : {}) });
    }
  }
  return entries;
}

/** A form's inputs read: the body they make (each field as its schema's type has it, the form's `values` added) and
 *  what the schema says is wrong with each (lib/app's form controller reads them the same way, from the same entries). */
export function readForm(o: FormInputs & { scope: Scope; ctx: EvalContext }): { body: Record<string, unknown>; values: Record<string, unknown>; errors: Record<string, string> } {
  const { body, values, errors } = readFields(formEntries(o), o.ctx.lang);
  for (const [k, x] of Object.entries(o.form.form?.values ?? {})) {
    const v = evaluate(x, o.scope, o.ctx);
    if (v !== undefined) setPath(body, k, v);
  }
  return { body, values, errors };
}

/** the effects of a tap, for whether it submits a form */
const submits = (it: Item) => [it.action, ...Object.values(it.actions ?? {})].some((a) => a?.effects?.some((e) => e.do === "submit"));

const withProps = (g: Group, i: number, props: Record<string, unknown>): Group => ({ ...g, items: g.items.map((it, j) => (j === i ? { ...it, props: { ...it.props, ...props } } : it)) });

export type BoundScreen = { groups: Group[]; ctx: BindingContext; widths: Widths };

/** The state a region shows for its source: loading until it has something, forbidden or an error when it failed with
 *  nothing to show, empty when it holds nothing (or `emptyWhen` says so), else its content (sources.ts `regionOf`). */
export function regionState(region: { source?: string; emptyWhen?: string }, scope: Scope, load: DataSource["load"] | undefined, ctx?: EvalContext): "ready" | "loading" | "empty" | "error" | "forbidden" {
  const data = scope.data && typeof scope.data === "object" ? (scope.data as Record<string, SourceView | undefined>) : {};
  const v = region.source && Object.prototype.hasOwnProperty.call(data, region.source) ? data[region.source] : undefined;
  const emptyWhen = region.emptyWhen;
  return regionOf(v, { load, ...(emptyWhen ? { emptyWhen: () => truthy(evaluate(emptyWhen, scope, ctx)) } : {}) });
}

/** the fields of a form's operation the contract requires */
const requiredOf = (doc: Pick<Doc, "api">, form: Group): Set<string> => {
  const e = form.form ? endpointOf(doc.api, form.form.operationId) : undefined;
  return new Set(e && doc.api ? formFields(doc.api, e).filter((s) => s.required).map((s) => s.name) : []);
};

/** One screen with its bindings applied (see the top of this file). `scope` is the screen's own (its data, params, the
 *  session), `form` what a form of it reads as `form.`, `vars` the variables as the screen shows them. */
export function boundScreen(o: {
  groups: Group[];
  frame: Frame;
  doc: Pick<Doc, "api" | "vars" | "frames" | "collections">;
  scope: Scope;
  /** a form of the screen as `form.` reads it, from what its inputs (in `groups`, `owner` saying which) hold */
  form: (form: Group, groups: Group[], owner: Map<string, string>) => FormView;
  vars: Record<string, VarValue>;
  widths: Widths;
  ctx: EvalContext;
}): BoundScreen {
  const varNames = (o.doc.vars ?? []).map((v) => ({ id: v.id, name: v.name }));
  const base: BindingContext = { scope: o.scope, varNames, forms: {}, eval: o.ctx };
  if (!o.groups.some((g) => g.repeat || g.states || g.form || g.items.some((it) => it.bind || it.field)) && !o.frame.data?.length) return { groups: o.groups, ctx: base, widths: o.widths };
  /* the forms first: what is typed in them is read before the repeats copy anything */
  let owner = formsOf(o.groups);
  const forms: Record<string, FormView> = {};
  /* the fields each form's contract requires: they show as required */
  const required: Record<string, Set<string>> = {};
  for (const g of o.groups) {
    if (!g.form) continue;
    forms[g.id] = o.form(g, o.groups, owner);
    required[g.id] = requiredOf(o.doc, g);
  }
  const ctx: BindingContext = { ...base, forms };
  /* the repeats over data, each element its copy's `item` */
  const rowsOf = (host: Group): ItemScope[] | null => {
    const it = host.items[0];
    const list = evaluate(host.repeat!.data!, scopeFor(ctx, o.vars, it), o.ctx);
    return Array.isArray(list) ? list.map((item, index) => ({ item, index })) : [];
  };
  let groups = o.groups.some((g) => g.repeat?.data !== undefined) ? expandRepeats(o.groups, { widths: o.widths, dataRows: rowsOf }) : o.groups;
  const widths = groups === o.groups ? o.widths : measuresFor(groups, o.widths);
  owner = groups === o.groups ? owner : formsOf(groups);
  const loads = new Map((o.frame.data ?? []).map((d) => [d.name, d.load]));
  const shownApart = Object.keys(forms).length ? messagesShown(groups, owner) : new Set<string>();
  groups = groups.map((g) => {
    let out = g;
    /* a part in a form reads it as `form` */
    const formId = owner.get(g.id);
    if (formId && forms[formId]) {
      out = { ...out, items: out.items.map((it) => ({ ...it, scope: { ...it.scope, form: formId } })) };
      const view = forms[formId];
      out.items.forEach((it, i) => {
        /* by the part's field states (parts/fieldState.ts): its error and message, required as the contract says, a
           submit button held and loading while the form submits */
        const message = it.field ? view.errors[it.field] : undefined;
        const set = formStateProps<string | boolean>(partBySlug(it.component), {
          ...(message ? { invalid: true, ...(shownApart.has(`${formId}:${it.field}`) ? {} : { message }) } : {}),
          required: !!it.field && !!required[formId]?.has(it.field),
          ...(view.submitting && submits(it) ? { submitting: true } : {}),
        });
        if (set.length) out = withProps(out, i, Object.fromEntries(set));
      });
    }
    /* a region shows the state its data is in */
    if (out.states) {
      const st = regionState(out.states, scopeFor(ctx, o.vars, out.items[0]), out.states.source ? loads.get(out.states.source) : undefined, o.ctx);
      out = { ...out, states: { ...out.states, show: st } };
    }
    return out;
  });
  return { groups, ctx, widths };
}

/** whether a group holds the item of a source's list, for an optimistic change: the element of its copy */
export const itemOf = (it: Pick<Item, "scope">): unknown => it.scope?.item;

export { readKey };
