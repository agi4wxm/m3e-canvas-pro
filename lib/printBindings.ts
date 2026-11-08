/* The bindings of a screen as code (lib/bindings, docs/数据绑定.md), for the product's web app: its data sources as hooks
 * named after them (in a `<Screen>.data.ts` beside the screen), each calling the typed client of packages/api; its
 * bound props, `{{templates}}` and conditions read through the shared runtime (packages/app-runtime: the design's own
 * expressions, evaluated by the editor's own evaluator); its repeats over data as `.map` with keys from ids; its forms
 * as controlled forms checked by the contract's schema; its regions as one branch per state; its taps that call the
 * API, load again, page, submit and sign out. Pure, like the rest of the printer: a document in, strings out.
 *
 * lib/printBehaviour.ts asks this for what a part shows and what a tap does; lib/codegen.ts for a screen's hooks, its
 * repeats and its imports. Expressions reach code only as escaped strings (`str`), names only through `identifierOf`. */

import type { ApiOperation } from "./export/api";
import { answerShape, clientCallCode, fieldRule, fillCode, holdsCode, isApiEffect, listCode, pageSizeOf, paneState, paramPlaces, placeArgs, readCode, readOf, regionOptions } from "./export/bindCode";
import { endpointOf, formFields, type FieldSpec } from "./bindings/contract";
import { hasTemplate, parseExpr, type Expr } from "./bindings/expr";
import { exprOfBind } from "./bindings/scope";
import type { ApiSpec } from "./api/types";
import { partBySlug, reader } from "../parts/registry";
import type { PartDef, PropDef } from "../parts/types";
import { mapNodes, raw, type PNode, type PValue } from "../parts/node";
import { str } from "../parts/print";
import { WIDGET_SOURCES } from "../parts/widgets/sources";
import { optionsOf } from "./partContract";
import { identifierOf } from "./export/paths";
import { literal } from "./export/code";
import { commentText } from "./export/server/comments";
import type { DataSource, Doc, Effect, FormBinding, Frame, Group, Item, Optimistic, VarType } from "./tokens";

/** what the printer is told of the product: where the runtime is, the contract and its client's operations */
export type BindPrintOptions = {
  /** the runtime package the screens import: `@shop/app-runtime` */
  runtime: string;
  /** the contract (Doc.api, or the one the export was given, read back) */
  api: ApiSpec;
  /** the client's operations (packages/api): the function each operation is, its input and its types */
  operations: ApiOperation[];
};

/** a form of the screen as its code knows it */
export type FormInfo = {
  id: string;
  /** the variable its hook is kept in: `createProductForm` */
  name: string;
  /** the variable of its scope: `$form` */
  scope: string;
  /** the constant of its fields' rules */
  fields: string;
  form: FormBinding;
  /** the contract's fields, by name */
  specs: Map<string, FieldSpec>;
  /** its inputs: the field each fills, what it starts with */
  inputs: { field: string; start?: unknown }[];
};

/** a data source of the screen: its variable and hook, and what its arguments read (the screen's scope, its params, the
 *  sources before it) */
type SourceInfo = { src: DataSource; name: string; hook: string; scoped: boolean; readsData: boolean; readsParams: boolean };
type RegionInfo = { name: string; source: string; emptyWhen?: string };

/** the screen being printed */
type ScreenBind = {
  frame: Frame;
  component: string;
  sources: SourceInfo[];
  /** by the region host's group id */
  regions: Map<string, RegionInfo>;
  forms: Map<string, FormInfo>;
  /** the form each group is in, by group id */
  formOf: Map<string, string>;
  /** what the screen takes from the runtime package */
  runtime: Set<string>;
  /** it calls the API */
  api: boolean;
  /** what it takes from the web app's platform module */
  platform: Set<string>;
  /** the types of the client it names */
  types: Set<string>;
  /** it uses `$` (the screen's scope) */
  dollar: boolean;
  /** it makes calls */
  call: boolean;
  /** it reads its params */
  params: boolean;
  react: Set<string>;
  /** what it takes from the app's runtime (useApp) for the bindings */
  app: Set<string>;
  /** the names taken in the screen's function */
  taken: Set<string>;
  /** the scopes' names taken */
  scopes: Set<string>;
};

const RESERVED = new Set(["$", "scope", "params", "vars", "call", "api", "item", "index", "row", "response", "status", "error", "body", "init", "args", "query", "path", "page", "signal", "event", "value", "on", "go", "back", "navigate", "snackbar", "setVar", "signOut", "afterSignIn", "React", "Fragment"]);

const pascal = (s: string) => s[0].toUpperCase() + s.slice(1);
const constName = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
/** a document's name in a block comment: one line, and never the comment's end */
const inComment = (s: unknown) => commentText(s, 80).replace(/\*\//g, "* /");

/** whether a document's screens use any bindings at all */
export function usesBindings(doc: Pick<Doc, "frames" | "groups">): boolean {
  if (doc.frames.some((f) => f.data?.length || f.params?.length || f.auth)) return true;
  return JSON.stringify(doc.groups).match(/"(repeat|states|form|field|showWhen|when)":|"=|"do":"(call|refresh|loadMore|submit|signOut)"|"params":\{|\{\{/) !== null;
}

/** the kinds of value a prop bound to an expression is read as */
const WORDS = new Set(["text", "image", "icon"]);

export class BoundPrint {
  readonly ops = new Map<string, ApiOperation>();
  private screen?: ScreenBind;
  /** the scope variable what is printed now reads */
  scope = "$";
  /** the form what is printed now is in */
  form?: FormInfo;

  constructor(
    readonly doc: Doc,
    readonly o: BindPrintOptions,
  ) {
    for (const op of o.operations) this.ops.set(op.operationId, op);
  }

  private get s(): ScreenBind {
    if (!this.screen) throw new Error("no screen is being printed");
    return this.screen;
  }

  /* ---------- a screen ---------- */

  /** Starts a screen: its data sources, regions and forms named. `groups` are the screen's own (expanded). */
  begin(frame: Frame, groups: Group[], component: string) {
    const taken = new Set(RESERVED);
    const name = (want: string, fallback: string) => {
      let base = identifierOf(want, fallback);
      if (RESERVED.has(base)) base = `${base}Data`;
      let n = base;
      for (let i = 2; taken.has(n); i++) n = `${base}${i}`;
      taken.add(n);
      return n;
    };
    const sources = (frame.data ?? []).map((src, i): SourceInfo => {
      const n = name(src.name, `source${i + 1}`);
      const op = this.ops.get(src.operationId);
      /* a path parameter not given reads the screen's param of the same name */
      const exprs = op ? [...Object.values(src.params ?? {}), ...(src.body && op.body ? [src.body] : []), ...op.params.filter((p) => src.params?.[p] === undefined).map((p) => `params.${p}`)] : [];
      return { src, name: n, hook: `use${pascal(n)}`, scoped: exprs.length > 0, readsData: exprs.some((x) => /\bdata\b/.test(x)), readsParams: exprs.some((x) => /\bparams\b/.test(x)) };
    });
    const regions = new Map<string, RegionInfo>();
    const forms = new Map<string, FormInfo>();
    const formOf = new Map<string, string>();
    const byId = new Map(groups.map((g) => [g.id, g]));
    for (const g of groups) {
      if (g.states?.source && sources.some((x) => x.src.name === g.states!.source)) regions.set(g.id, { name: name(`${sources.find((x) => x.src.name === g.states!.source)!.name}State`, "regionState"), source: g.states.source, ...(g.states.emptyWhen ? { emptyWhen: g.states.emptyWhen } : {}) });
    }
    const formGroups = groups.filter((g) => g.form && this.ops.has(g.form.operationId));
    for (const g of formGroups) {
      const op = g.form!.operationId;
      const e = endpointOf(this.o.api, op);
      const specs = new Map((e ? formFields(this.o.api, e) : []).map((f) => [f.name, f]));
      const n = name(`${op}Form`, "form");
      forms.set(g.id, { id: g.id, name: n, scope: formGroups.length === 1 ? "$form" : `$${n}`, fields: constName(identifierOf(`${op}Fields`, "formFields")), form: g.form!, specs, inputs: [] });
    }
    /* the form each group is in: the nearest container with one */
    for (const g of groups) {
      let at: Group | undefined = g;
      for (let i = 0; at && i < 64; i++) {
        if (forms.has(at.id)) {
          formOf.set(g.id, at.id);
          break;
        }
        at = at.inFlow ? byId.get(at.inFlow) : undefined;
      }
    }
    for (const g of groups)
      for (const it of g.items) {
        const f = formOf.get(g.id);
        if (!f || !it.field) continue;
        const info = forms.get(f)!;
        if (!info.inputs.some((x) => x.field === it.field)) info.inputs.push({ field: it.field, start: startOf(it) });
      }
    this.screen = { frame, component, sources, regions, forms, formOf, runtime: new Set(), api: false, platform: new Set(), types: new Set(), dollar: false, call: false, params: !!frame.params?.length, react: new Set(), app: new Set(), taken, scopes: new Set(["$", ...[...forms.values()].map((f) => f.scope)]) };
    this.scope = "$";
    this.form = undefined;
  }

  /** the names of the app's runtime the screen uses, from here */
  private app(name: string) {
    this.s.app.add(name);
  }

  /** the scope variable now, marked as used */
  private use(): string {
    if (this.scope === "$") this.s.dollar = true;
    this.s.runtime.add("useBindings");
    return this.scope;
  }

  /** prints `fn` inside another scope: a form's, a repeat's row, a call's answer */
  within<T>(scope: string, form: FormInfo | undefined, fn: () => T): T {
    const was = { scope: this.scope, form: this.form };
    this.scope = scope;
    this.form = form;
    try {
      return fn();
    } finally {
      this.scope = was.scope;
      this.form = was.form;
    }
  }

  formHost(groupId: string): FormInfo | undefined {
    return this.s.forms.get(groupId);
  }

  /** a fresh name for a scope inside this one (a row, a call's answer) */
  fresh(base: string): string {
    let n = base;
    for (let i = 2; this.s.scopes.has(n) || [...this.s.sources, ...this.s.forms.values()].some((x) => x.name === n); i++) n = `${base}${i}`;
    this.s.scopes.add(n);
    return n;
  }

  /* ---------- what a part shows ---------- */

  /** The code of a prop bound to an expression, or of words with `{{templates}}` in them; null when it is neither. A
   *  choice comes with the values it can take: those the expression names among the prop's options, and the design's. */
  prop(it: Item, d: PropDef, design: unknown): { code: string; samples?: string[] } | null {
    const b = it.bind?.[d.key];
    const expr = typeof b === "string" ? exprOfBind(b) : null;
    if (expr !== null) {
      /* the web's components take words, a number, yes or no and a choice from an expression; the rest keep the design */
      const $ = this.use();
      const read = readOf(d.kind);
      if (read === "text" ? !WORDS.has(d.kind) : read !== "num" && read !== "bool" && read !== "pick") return null;
      if (read === "num" && d.kind === "number") return { code: readCode(read, $, expr, [str(typeof design === "number" ? design : 0), ...(Number.isFinite(d.min) ? [`${d.min}`] : []), ...(Number.isFinite(d.max) ? [`${d.max}`] : [])]) };
      if (read === "bool") return { code: readCode(read, $, expr, [`${design === true}`]) };
      if (read === "pick" && d.kind === "enum") {
        const options = d.options.map((o) => (typeof o === "string" ? o : o.value));
        const own = String(design ?? d.default);
        const named = literalsOf(expr).filter((x) => options.includes(x));
        const can = named.length ? [...new Set([...named, own])] : options;
        return { code: readCode(read, $, expr, [literal(can), str(own)]), samples: can };
      }
      return { code: readCode("text", $, expr) };
    }
    if (d.kind === "text" && typeof design === "string" && hasTemplate(design)) return { code: fillCode(this.use(), design) };
    return null;
  }

  /** what the screen takes from the app's runtime for the bindings (a sign-out, the way back after a sign-in) */
  appNames(): string[] {
    return [...(this.screen?.app ?? [])];
  }

  /** the props a form gives its parts: an input shows its field's error, a submit button holds while it submits */
  formProps(it: Item, def: PartDef): { key: string; expr: string }[] {
    const f = this.form;
    if (!f) return [];
    const out: { key: string; expr: string }[] = [];
    if (it.field && def.props.some((d) => d.key === "error")) out.push({ key: "error", expr: `!!${f.name}.error(${str(it.field)})` });
    if (submits(it) && def.props.some((d) => d.key === "disabled")) out.push({ key: "disabled", expr: `${f.name}.submitting` });
    return out;
  }

  /** An input of a form, kept by the form: its value, what it writes. Null when it is no field of a form. */
  wireField(tree: PNode, it: Item, def: PartDef): { tree: PNode; wrap?: (source: string) => string } | null {
    const f = this.form;
    if (!f || !it.field) return null;
    const field = str(it.field);
    const spec = f.specs.get(it.field);
    const patch = (type: string, drop: string[], props: Record<string, PValue>) => mapNodes(tree, (n) => (n.type === type ? { ...n, props: { ...Object.fromEntries(Object.entries(n.props ?? {}).filter(([k]) => !drop.includes(k))), ...props } } : n));
    switch (def.slug) {
      case "text-field":
      case "input":
      case "textarea": {
        const type = def.slug === "text-field" ? "TextField" : def.slug === "input" ? "Input" : "Textarea";
        /* a date is picked from the browser's own date picker; a date and time too, written as the contract wants it */
        if (spec?.kind === "date") return { tree: patch(type, ["defaultValue"], { type: "date", value: raw(`${f.name}.text(${field})`), onChange: raw(`(event) => ${f.name}.set(${field}, event.target.value)`) }) };
        if (spec?.kind === "datetime") {
          this.s.platform.add("localDateTime").add("isoDateTime");
          return { tree: patch(type, ["defaultValue"], { type: "datetime-local", value: raw(`localDateTime(${f.name}.text(${field}))`), onChange: raw(`(event) => ${f.name}.set(${field}, isoDateTime(event.target.value))`) }) };
        }
        return { tree: patch(type, ["defaultValue"], { value: raw(`${f.name}.text(${field})`), onChange: raw(`(event) => ${f.name}.set(${field}, event.target.value)`) }) };
      }
      case "switch":
      case "checkbox":
        return { tree: patch(def.slug === "switch" ? "Switch" : "Checkbox", ["defaultChecked"], { checked: raw(`!!${f.name}.value(${field})`), onCheckedChange: raw(`(on) => ${f.name}.set(${field}, on)`) }) };
      case "slider": {
        const p = reader(def, it.props);
        const read = `Number(${f.name}.value(${field}) ?? ${p.n("value")})`;
        return { tree: patch("Slider", ["defaultValue"], { value: p.b("range") ? [raw(read), p.n("end")] : [raw(read)], onValueChange: raw(`(value) => ${f.name}.set(${field}, Array.isArray(value) ? value[0] : value)`) }) };
      }
      case "select":
      case "radio-group":
        return { tree: patch(def.slug === "select" ? "Select" : "RadioGroup", ["defaultValue"], { value: raw(def.slug === "select" ? `${f.name}.text(${field}) || null` : `${f.name}.text(${field})`), onValueChange: raw(`(value) => ${f.name}.set(${field}, value ?? "")`) }) };
      case "file-upload": {
        this.s.platform.add("pickFiles");
        const many = reader(def, it.props).b("multiple");
        /* the file input inside it says what was picked; the form keeps the file (or the files) */
        return { tree, wrap: (source) => `<div className="contents" onChange={pickFiles(${many}, (files) => ${f.name}.set(${field}, files))}>${source}</div>` };
      }
      default: {
        /* a widget that declares an input takes the field's value as a prop and hands changes out (parts/widgets/host.ts) */
        const input = def.input;
        if (!input || !(tree.type in WIDGET_SOURCES)) return null;
        const d = def.props.find((x) => x.key === input.prop);
        /* a choice sends the words of what is picked, and a list its rows' words */
        if (input.kind === "choice" && d?.kind === "number") {
          const options = str(optionsOf(it));
          return { tree: { ...tree, props: { ...tree.props, [input.prop]: raw(`${options}.indexOf(${f.name}.text(${field}))`), onValueChange: raw(`(value) => ${f.name}.set(${field}, ${options}[Number(value)] ?? "")`) } } };
        }
        if (d?.kind === "list") {
          const now = `${f.name}.value(${field})`;
          return { tree: { ...tree, props: { ...tree.props, [input.prop]: raw(`Array.isArray(${now}) ? ${now} : []`), onValueChange: raw(`(value) => ${f.name}.set(${field}, value)`) } } };
        }
        const read = input.kind === "number" ? `Number(${f.name}.value(${field}) ?? 0)` : input.kind === "bool" ? `!!${f.name}.value(${field})` : `${f.name}.text(${field})`;
        return { tree: { ...tree, props: { ...tree.props, [input.prop]: raw(read), onValueChange: raw(`(value) => ${f.name}.set(${field}, value)`) } } };
      }
    }
  }

  /** whether a condition's expression holds, as code */
  holds(expr: string): string {
    return holdsCode(this.use(), expr);
  }

  /** the gate of a region's design: shown while its region is in that state */
  regionGate(g: Group, host: Group | undefined): string | null {
    if (!host?.states || !this.screen) return null;
    const r = this.s.regions.get(host.id);
    if (!r) return null;
    return `${r.name} === ${str(paneState(g))}`;
  }

  /* ---------- repeats ---------- */

  /** The opening of a repeat over data: the list read, each element its row's scope, keyed by its id. Gives the lines
   *  that open it and the scope its template is printed in. */
  repeatOpen(data: string, gates: string[], limit: number | undefined): { open: string; row: string; key: string; close: string } {
    const outer = this.use();
    const row = this.fresh("row");
    this.s.runtime.add("keyOf");
    this.s.react.add("Fragment");
    const list = listCode(outer, data, limit);
    return { open: `{${gates.length ? `${gates.join(" && ")} && ` : ""}${list}.map((item, index) => {`, row: `const ${row} = ${outer}.with({ item, index })`, key: `<Fragment key={keyOf(item, index)}>`, close: row };
  }

  /* ---------- what a tap does ---------- */

  private sourceOf(name: string): SourceInfo | undefined {
    return this.screen?.sources.find((x) => x.src.name === name);
  }

  /** a data source as the screen's variable, for a refresh or a page */
  sourceVar(name: string): string | undefined {
    return this.sourceOf(name)?.name;
  }

  /** the call of an operation through the client: its input built from args by the contract's parameters */
  private clientCall(operationId: string, args: Record<string, string>, body: string | undefined, $: string, init = ""): string | null {
    const op = this.ops.get(operationId);
    const e = endpointOf(this.o.api, operationId);
    if (!op || !e) return null;
    this.s.api = true;
    const pathArgs = op.params.map((p) => `${propName(p)}: ${args[p] !== undefined ? `${$}.path(${str(args[p])})` : `""`}`);
    const { query, headers, fields } = placeArgs(args, paramPlaces(this.o.api, e));
    const input: string[] = [];
    if (op.params.length) input.push(`params: { ${pathArgs.join(", ")} }`);
    if (op.query && query.length) input.push(`query: { ${query.map(([k, x]) => `${propName(k)}: ${$}.arg(${str(x)})`).join(", ")} }`);
    if (op.body) {
      const value = body !== undefined ? `${$}.ev(${str(body)})` : fields.length ? `{ ${fields.map(([k, x]) => `${propName(k)}: ${$}.ev(${str(x)})`).join(", ")} }` : "{}";
      input.push(`body: ${value}${this.castTo(op.bodyType)}`);
    }
    const inits = [...(headers.length ? [`headers: { ${headers.map(([k, x]) => `${propName(k)}: ${$}.text(${str(x)})`).join(", ")} }`] : []), ...(init ? [`...${init}`] : [])];
    const initArg = init && !headers.length ? init : inits.length ? `{ ${inits.join(", ")} }` : "";
    return clientCallCode("api", op, input.length ? `{ ${input.join(", ")} }` : undefined, initArg || undefined);
  }

  /** the cast a value needs to be a client type: none to `unknown` or a record, else to the named type, imported */
  private castTo(t: string): string {
    if (!/^[A-Za-z_$][\w$]*$/.test(t) || t === "unknown") return "";
    if (t === "void" || t === "never") return " as never";
    this.s.types.add(t);
    return ` as ${t}`;
  }

  /** The statement of an effect that reaches the bindings, or undefined for an effect that is not one of them.
   *  `body` prints a then or catch body in the scope given. */
  effect(e: Effect, body: (b: NonNullable<Extract<Effect, { do: "call" }>["then"]>, scope: string) => string[]): string | null | undefined {
    if (!isApiEffect(e)) return undefined;
    switch (e.do) {
      case "refresh":
      case "loadMore": {
        const v = this.sourceVar(e.source);
        return v ? `void ${v}.${e.do === "refresh" ? "refresh" : "loadMore"}()` : null;
      }
      case "submit": {
        const f = e.form ? this.s.forms.get(e.form) : this.form;
        return f ? `void ${f.name}.submit()` : null;
      }
      case "signOut":
        this.app("signOut");
        return "signOut()";
      case "call": {
        const $ = this.use();
        const call = this.clientCall(e.operationId, e.args ?? {}, e.body, $);
        if (!call) return null;
        this.s.call = true;
        this.s.runtime.add("useCall");
        const op = this.ops.get(e.operationId)!;
        const opts: string[] = [];
        const optimistic = e.optimistic && this.optimistic(e.optimistic, $);
        if (optimistic) opts.push(`optimistic: ${optimistic}`);
        if (e.then) {
          const r = this.fresh("answer");
          const lines = this.loginNav(e.operationId, body(e.then, r));
          opts.push(`then: (response, status) => { ${uses(lines, r) ? `const ${r} = ${$}.with({ response, status }); ` : ""}${lines.join("; ")} }`);
        } else if (e.operationId === this.o.api.auth?.login) {
          this.app("afterSignIn");
          opts.push("then: () => void afterSignIn()");
        }
        if (e.catch) {
          const r = this.fresh("failure");
          const lines = body(e.catch, r);
          opts.push(`catch: (error, status) => { ${uses(lines, r) ? `const ${r} = ${$}.with({ error, status }); ` : ""}${lines.join("; ")} }`);
        }
        if (op.status !== 200) opts.push(`status: ${op.status}`);
        return `void call(() => ${call}${opts.length ? `, { ${opts.join(", ")} }` : ""})`;
      }
      default:
        return undefined;
    }
  }

  /** a sign-in's then: back to where the app was sent from, if anywhere, else on as it says; its effects run either way */
  loginNav(operationId: string, lines: string[]): string[] {
    if (operationId !== this.o.api.auth?.login) return lines;
    this.app("afterSignIn");
    const nav = lines.filter((l) => NAV.test(l));
    const rest = lines.filter((l) => !NAV.test(l));
    return [...rest, nav.length ? `if (!afterSignIn()) { ${nav.join("; ")} }` : "void afterSignIn()"];
  }

  /** what a call changes before it is answered: the tapped row taken out, or fields of it set */
  private optimistic(o: Optimistic, $: string): string | null {
    const v = this.sourceVar(o.source);
    if (!v) return null;
    if (o.remove) return `() => ${v}.remove(${$}.ev("item"))`;
    const fields = Object.entries(o.patch ?? {});
    if (!fields.length) return null;
    return `() => ${v}.patch(${$}.ev("item"), (x) => ({ ${fields.map(([k, x]) => `${propName(k)}: ${$}.with({ item: x }).ev(${str(x)})`).join(", ")} }))`;
  }

  /** a variable set from an expression, as its type has it */
  setVarValue(expr: string, type: VarType): string {
    const $ = this.use();
    return type === "number" ? `${$}.num(${str(expr)}, 0)` : type === "bool" ? `${$}.bool(${str(expr)})` : `${$}.text(${str(expr)})`;
  }

  /** words that may hold `{{expressions}}`, as code; null when they hold none */
  words(text: string): string | null {
    return hasTemplate(text) ? fillCode(this.use(), text) : null;
  }

  /** the params a tap gives the screen it opens, as code */
  navParams(params: Record<string, string>): string {
    const $ = this.use();
    return `{ ${Object.entries(params).map(([k, x]) => `${propName(k)}: ${$}.ev(${str(x)})`).join(", ")} }`;
  }

  /* ---------- the screen's code ---------- */

  /** the scroll body's handlers: a pull loads again what loads on a pull, the end of the body pages what pages on scroll */
  scrollProps(): string {
    const pulls = this.s.sources.filter((x) => x.src.pullToRefresh);
    const pages = this.s.sources.filter((x) => x.src.paging === "scroll");
    const out: string[] = [];
    if (pulls.length) out.push(`onRefresh={() => { ${pulls.map((x) => `void ${x.name}.refresh()`).join("; ")} }}`, `refreshing={${pulls.map((x) => `(${x.name}.loading && ${x.name}.value !== undefined)`).join(" || ")}}`);
    if (pages.length) out.push(`onEnd={() => { ${pages.map((x) => `void ${x.name}.loadMore()`).join("; ")} }}`);
    this.s.platform.add("DataScroll");
    return out.map((x) => ` ${x}`).join("");
  }

  /** whether the screen loads data */
  get loads(): boolean {
    return !!this.screen?.sources.length;
  }

  /** The lines that open the screen's function: its params, its data, its scope, its regions' states, its forms. `body`
   *  prints a then or catch body in a scope. Called after the screen's parts are printed (they say what is used). */
  head(body: (b: NonNullable<FormBinding["then"]>, scope: string) => string[], usesVars: boolean): { lines: string[]; app: Set<string> } {
    const s = this.s;
    const app = new Set<string>();
    const lines: string[] = [];
    /* the forms first, so their handlers say what else they use */
    const forms: string[] = [];
    for (const f of s.forms.values()) {
      const op = this.ops.get(f.form.operationId)!;
      const rules = this.within(f.scope, f, () => {
        const send = this.clientCall(f.form.operationId, f.form.params ?? {}, undefined, f.scope, "init");
        const extra = Object.entries(f.form.values ?? {});
        /* kept by the runtime under the screen and its name, so what is typed outlives a trip to the sign-in screen */
        const out = [`id: ${str(`${s.component}/${f.name}`)}`, `fields: ${f.fields}`];
        const start = Object.fromEntries(f.inputs.filter((x) => x.start !== undefined).map((x) => [x.field, x.start]));
        if (Object.keys(start).length) out.push(`initial: ${str(start)}`);
        out.push(`send: (body, init) => ${send ? send.replace(/body: \{\}( as [\w$]+)?/, (_, cast?: string) => (cast ? `body: body${cast}` : "body")) : "Promise.resolve(body)"}`);
        if (extra.length) out.push(`extra: () => ({ ${extra.map(([k, x]) => `${str(k)}: ${f.scope}.ev(${str(x)})`).join(", ")} })`);
        if (op.status !== 200) out.push(`status: ${op.status}`);
        const thenLines = f.form.then ? this.loginNav(f.form.operationId, body(f.form.then, "answer")) : f.form.operationId === this.o.api.auth?.login ? (this.app("afterSignIn"), ["void afterSignIn()"]) : [];
        if (thenLines.length) out.push(`then: (${uses(thenLines, "answer") ? "response, status" : ""}) => {\n${uses(thenLines, "answer") ? `      const answer = ${f.scope}.with({ response, status })\n` : ""}${thenLines.map((l) => `      ${l}`).join("\n")}\n    }`);
        const catchLines = f.form.catch ? body(f.form.catch, "failure") : [];
        if (catchLines.length) out.push(`catch: (${uses(catchLines, "failure") ? "error, status" : ""}) => {\n${uses(catchLines, "failure") ? `      const failure = ${f.scope}.with({ error, status })\n` : ""}${catchLines.map((l) => `      ${l}`).join("\n")}\n    }`);
        return out;
      });
      s.runtime.add("useForm");
      forms.push(`const ${f.name} = useForm({\n${rules.map((r) => `    ${r},`).join("\n")}\n  })`, `const ${f.scope} = $.with({ form: ${f.name}.view })`);
      s.dollar = true;
    }
    if (s.dollar || s.sources.length) s.runtime.add("useBindings");
    /* the params are read where there is a scope to read them in */
    if ((s.params && (s.dollar || s.sources.length > 0)) || s.sources.some((x) => x.readsParams)) {
      lines.push("const params = useScreenParams()");
      app.add("useScreenParams");
    }
    /* the variables are in the scope only where there is one: a screen that reads no expression has none */
    const scoped = usesVars && (s.dollar || s.sources.length > 0);
    const base = [...(lines.length ? ["params"] : []), ...(scoped ? ["vars: scopeVars(vars)"] : [])];
    if (scoped) app.add("vars").add("scopeVars");
    for (const n of s.app) app.add(n);
    const scopeArg = `{ ${base.join(", ")} }`.replace("{  }", "{}");
    if (s.sources.length) {
      lines.push(`const scope = useBindings(${scopeArg})`);
      s.sources.forEach((x, i) => {
        const before = s.sources.slice(0, i).map((y) => y.name);
        const arg = !x.scoped ? "" : x.readsData && before.length ? `scope.with({ data: { ${before.join(", ")} } })` : "scope";
        lines.push(`const ${x.name} = ${x.hook}(${arg})`);
      });
      lines.push(`const $ = scope.with({ data: { ${s.sources.map((x) => x.name).join(", ")} } })`);
    } else if (s.dollar) lines.push(`const $ = useBindings(${scopeArg})`);
    for (const r of s.regions.values()) {
      const src = this.sourceOf(r.source)!;
      const o = regionOptions(src.src.load, r.emptyWhen, "$", false);
      lines.push(`const ${r.name} = useRegion(${src.name}${o.length ? `, { ${o.join(", ")} }` : ""})`);
      s.runtime.add("useRegion");
    }
    if (s.call) lines.push("const call = useCall()");
    lines.push(...forms);
    return { lines, app };
  }

  /** what the screen imports beyond its parts: the runtime's hooks, its data hooks, the client, the platform's pieces */
  imports(): Map<string, Set<string>> {
    const s = this.s;
    const out = new Map<string, Set<string>>();
    if (s.runtime.size) out.set(this.o.runtime, new Set(s.runtime));
    const data = [...s.sources.map((x) => x.hook), ...[...s.forms.values()].map((f) => f.fields)];
    if (data.length) out.set(`./${s.component}.data`, new Set(data));
    if (s.api) out.set("@/api", new Set(["api"]));
    const platform = [...s.platform].filter((n) => n !== "DataScroll");
    if (platform.length) out.set("@/platform", new Set(platform));
    if (s.platform.has("DataScroll")) out.set("@/DataScroll", new Set(["DataScroll"]));
    if (s.react.size) out.set("react", new Set(s.react));
    if (s.types.size) out.set(this.o.runtime.replace(/\/app-runtime$/, "/api"), new Set([...s.types].map((t) => `type ${t}`)));
    return out;
  }

  /** The screen's `<Screen>.data.ts`: a hook per data source, on the typed client, and the rules of each form's fields.
   *  Undefined when it has neither. */
  dataFile(): string | undefined {
    const s = this.s;
    if (!s.sources.length && !s.forms.size) return undefined;
    const rt = new Set<string>();
    let usesApi = false;
    let bindings = false;
    const parts: string[] = [];
    for (const x of s.sources) {
      const e = endpointOf(this.o.api, x.src.operationId);
      const op = this.ops.get(x.src.operationId);
      if (!e || !op) {
        rt.add("useDataSource");
        parts.push(`/** \`data.${inComment(x.src.name)}\`: its operation is not in the contract, so it only ever fails */\nexport function ${x.hook}() {\n  return useDataSource({ key: ${str(`missing:${x.src.name}`)}, load: () => Promise.reject(new Error(${str(`No operation ${x.src.operationId}`)})) })\n}`);
        continue;
      }
      usesApi = true;
      rt.add("useDataSource").add("sourceKey");
      const given = x.src.params ?? {};
      const pathArgs = op.params.map((p) => [p, given[p] ?? `params.${p}`] as const);
      const { query, headers } = placeArgs(given, paramPlaces(this.o.api, e));
      const { list, paging: pg } = answerShape(this.o.api, e);
      const pageSize = pageSizeOf(x.src, !!pg);
      const reads = x.scoped;
      if (reads) bindings = true;
      const lines: string[] = [];
      if (pathArgs.length) lines.push(`const path = { ${pathArgs.map(([k, v]) => `${propName(k)}: $.path(${str(v)})`).join(", ")} }`);
      const hasQuery = !!op.query && query.length > 0;
      if (hasQuery) lines.push(`const query = { ${query.map(([k, v]) => `${propName(k)}: $.arg(${str(v)})`).join(", ")} }`);
      if (x.src.body && op.body) lines.push(`const body = $.ev(${str(x.src.body)}) as ${this.typeOfData(op.bodyType, rt)}`);
      const keyArgs = [...(pathArgs.length ? ["...path"] : []), ...(hasQuery ? ["...query"] : []), ...(x.src.body && op.body ? ["body"] : [])];
      const input = [...(pathArgs.length ? ["params: path"] : []), ...(hasQuery ? [pg ? "query: { ...query, ...page }" : "query"] : pg && op.query ? ["query: page"] : []), ...(x.src.body && op.body ? ["body"] : [])];
      const init = [...(headers.length ? [`headers: { ${headers.map(([k, v]) => `${propName(k)}: $.text(${str(v)})`).join(", ")} }`] : []), "signal"];
      const spec = [
        `key: sourceKey(${str(x.src.operationId)}${keyArgs.length === 1 && keyArgs[0] !== "body" ? `, ${keyArgs[0].slice(3)}` : keyArgs.length ? `, { ${keyArgs.join(", ")} }` : ""})`,
        `operation: ${str(x.src.operationId)}`,
        ...(hasQuery ? ["args: query"] : []),
        ...(list ? [`list: { field: ${str(list.field)} }`] : []),
        ...(pg ? [`paging: ${literal(pg)}`] : []),
        ...(pageSize ? [`pageSize: ${pageSize}`] : []),
        `load: ({ ${pg ? "page, " : ""}signal }) => ${clientCallCode("api", op, input.length ? `{ ${input.join(", ")} }` : undefined, `{ ${init.join(", ")} }`)}`,
      ];
      const how = [list ? (pg ? `a ${pg.style}-paged list` : "a list") : "one thing", ...(x.src.pageSize && pg ? [`${x.src.pageSize} at a time`] : []), ...(x.src.paging === "scroll" ? ["the next page on scroll"] : x.src.paging === "button" ? ["the next page by a tap"] : []), ...(x.src.pullToRefresh ? ["pull to refresh"] : []), ...(x.src.load === "demand" ? ["loaded only when asked"] : [])];
      parts.push(
        `/** \`data.${inComment(x.src.name)}\`: ${inComment(x.src.operationId)}, ${how.join(", ")} */\nexport function ${x.hook}(${reads ? "$: Bindings" : ""}) {\n${lines.map((l) => `  ${l}\n`).join("")}  return useDataSource({\n${spec.map((l) => `    ${l},\n`).join("")}  }${x.src.load === "demand" ? ', { load: "demand" }' : ""})\n}`,
      );
    }
    for (const f of s.forms.values()) {
      rt.add("FormFields");
      const rows = f.inputs.map((x) => {
        return `  ${propName(x.field)}: ${literal(fieldRule(f.specs.get(x.field)))},`;
      });
      parts.push(`/** the fields of the ${inComment(f.form.operationId)} form: what the contract's schema asks of each */\nexport const ${f.fields}: FormFields = {\n${rows.join("\n")}\n}`);
    }
    if (bindings) rt.add("Bindings");
    const isType = (n: string) => n === "Bindings" || n === "FormFields";
    const sorted = [...rt].sort((a, b) => a.localeCompare(b));
    const runtimeImport = sorted.every(isType) ? `import type { ${sorted.join(", ")} } from ${str(this.o.runtime)}` : `import { ${sorted.map((n) => (isType(n) ? `type ${n}` : n)).join(", ")} } from ${str(this.o.runtime)}`;
    const types = [...this.dataTypes];
    this.dataTypes.clear();
    return `${[runtimeImport, ...(types.length ? [`import type { ${types.sort().join(", ")} } from ${str(this.o.runtime.replace(/\/app-runtime$/, "/api"))}`] : []), ...(usesApi ? ['import { api } from "@/api"'] : [])].join("\n")}\n\n${parts.join("\n\n")}\n`;
  }

  private dataTypes = new Set<string>();
  private typeOfData(t: string, _rt: Set<string>): string {
    if (t === "unknown" || t === "void" || t === "never") return "never";
    this.dataTypes.add(t);
    return t;
  }
}

/** whether statements read a scope variable */
const uses = (lines: string[], name: string) => {
  const re = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}\\.`);
  return lines.some((l) => re.test(l));
};

/** the string literals an expression names: the values a choice bound to it can take */
function literalsOf(expr: string): string[] {
  const p = parseExpr(expr);
  if (!p.ok) return [];
  const out: string[] = [];
  const visit = (e: Expr) => {
    if (e.k === "lit") {
      if (typeof e.v === "string") out.push(e.v);
    } else if (e.k === "get") {
      visit(e.obj);
      visit(e.key);
    } else if (e.k === "call") e.args.forEach(visit);
    else if (e.k === "un") visit(e.x);
    else if (e.k === "bin") {
      visit(e.a);
      visit(e.b);
    } else if (e.k === "cond") {
      visit(e.test);
      visit(e.yes);
      visit(e.no);
    }
  };
  visit(p.expr);
  return [...new Set(out)];
}

/** a key of an object literal: bare when it is a plain name, else an escaped string */
const propName = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));

/** a navigation statement of a body (what a sign-in's then gives way to) */
const NAV = /^(go|navigate|back|openOverlay)\(/;

/** whether a part's tap submits a form */
const submits = (it: Item) => [it.action, ...Object.values(it.actions ?? {})].some((a) => a?.effects?.some((e) => e.do === "submit"));

/** what an input starts with in its form: the value it was drawn with, when it was drawn with one */
function startOf(it: Item): unknown {
  const def = partBySlug(it.component);
  if (!def) return undefined;
  const p = reader(def, it.props);
  switch (def.slug) {
    case "switch":
    case "checkbox":
      return p.b("checked") || undefined;
    case "select":
    case "radio-group": {
      const rows = p.list("items");
      const at = Math.round(p.n("selected"));
      return at >= 0 ? rows[at]?.label : undefined;
    }
    case "slider":
      return p.n("value");
    case "input":
    case "text-field":
    case "textarea":
      return p.s("value") || undefined;
    default:
      return undefined;
  }
}
