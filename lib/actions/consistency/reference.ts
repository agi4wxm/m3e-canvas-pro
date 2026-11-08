/* The table's reference host: the smallest app the interpreter can run in, kept as plain state (a stack of screens and
 * an overlay, the variables, what is shown and open, what was typed, the session, the snackbar) over a row's document.
 * It is what the interpreter's own run of the table uses, and a model of what every host's side of `Host` has to do. */

import { endpointOf, formFields, paramsOf } from "../../bindings/contract";
import { groupsInFrame, type Doc, type Frame, type Group, type Item } from "../../tokens";
import type { CallArgs, Change, FormRef, Host, Outcome, Tap } from "../host";
import type { VarValue } from "../model";
import { run, startOf } from "../run";
import { Backend, givenOf } from "./check";
import type { Observed } from "./types";

type Entry = { id: string; params?: Record<string, unknown> };

/** the words a part shows: its label, its text, a dialog's headline, an input's placeholder */
export const wordsOf = (it: Item): string => {
  const p = (it.props ?? {}) as Record<string, unknown>;
  const w = p.label ?? p.text ?? p.headline ?? p.placeholder;
  return typeof w === "string" ? w : "";
};

export class ReferenceHost implements Host {
  vars: Record<string, VarValue>;
  stack: Entry[];
  overlay: Entry | null = null;
  hidden: Record<string, boolean> = {};
  opened: Record<string, boolean> = {};
  props: Record<string, Record<string, VarValue>> = {};
  fields: Record<string, VarValue> = {};
  snack: string | null = null;
  signedIn = false;
  private epoch = 0;
  private count = 0;
  private sending = new Set<string>();
  private returnTo: Entry | null = null;
  private readonly groupOfItem = new Map<string, Group>();

  constructor(
    readonly doc: Doc,
    readonly backend: Backend,
  ) {
    this.vars = Object.fromEntries((doc.vars ?? []).map((v) => [v.id, v.value]));
    this.stack = [{ id: doc.frames[0].id }];
    for (const g of doc.groups) for (const it of g.items) this.groupOfItem.set(it.id, g);
    this.inUse();
  }

  /* ---------- what the table reads ---------- */

  private frame = (id: string): Frame | undefined => this.doc.frames.find((f) => f.id === id);
  private top = () => this.stack[this.stack.length - 1];
  private groupsOn = (id: string) => {
    const f = this.frame(id);
    return f ? groupsInFrame(this.doc.groups, f, this.doc.frames, {}) : [];
  };

  /** the parts on show on a screen, as the state has them */
  private partsOn(id: string): Item[] {
    return this.groupsOn(id).flatMap((g) => (this.hidden[g.id] ?? !!g.hidden ? [] : g.items));
  }

  observe(): Observed {
    const words: string[] = [];
    for (const on of [this.top().id, ...(this.overlay ? [this.overlay.id] : [])])
      for (const it of this.partsOn(on)) {
        const set = this.props[it.id];
        words.push(typeof set?.text === "string" ? set.text : typeof set?.label === "string" ? set.label : wordsOf(it));
        if (it.component === "dropdown-menu" && this.opened[it.id]) for (const row of ((it.props?.items as { label?: string }[] | undefined) ?? [])) words.push(row.label ?? "");
      }
    return { vars: { ...this.vars }, words, toast: this.snack, screen: this.top().id, calls: this.backend.calls };
  }

  /** the tap on the part with these words, on the overlay if one is up, else the screen on show; what it starts is
   *  left to run (an answer may be held) */
  tap(words: string) {
    this.start(words, "tap");
  }

  /** the pointer comes over the part with these words */
  hover(words: string) {
    this.start(words, "hover");
  }

  /** the part's action, if it starts this way (a part whose action starts on a hover does nothing on a tap) */
  private start(words: string, how: "tap" | "hover") {
    const on = this.overlay ?? this.top();
    const it = this.partsOn(on.id).find((x) => wordsOf(x) === words);
    if (!it) throw new Error(`no words "${words}" on show`);
    if (it.action && startOf(it.action, { pointer: true }).on === how) this.runOn(it, on);
  }

  private runOn(it: Item, on: Entry) {
    if (!it.action) return;
    const g = this.groupOfItem.get(it.id);
    const form = g ? this.formOf(g)?.id : undefined;
    void run(it.action, this, { screen: on.id, ...(on.params ? { params: on.params } : {}), part: it.id, ...(form ? { form } : {}) });
  }

  /* what starts some time after its screen comes into use: timed again each time one does */
  private timers: ReturnType<typeof setTimeout>[] = [];
  private inUse() {
    for (const t of this.timers) clearTimeout(t);
    const on = this.overlay ?? this.top();
    this.timers = this.partsOn(on.id).flatMap((it) => {
      const s = startOf(it.action, { pointer: true });
      return s.on === "delay" ? [setTimeout(() => this.runOn(it, on), s.ms)] : [];
    });
  }

  /** stops what is timed: the run is over */
  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  type(words: string, value: string) {
    const it = this.partsOn((this.overlay ?? this.top()).id).find((x) => wordsOf(x) === words);
    if (!it) throw new Error(`no field with the words "${words}"`);
    this.fields[it.id] = value;
  }

  restart() {
    this.epoch++;
    this.signedIn = false;
    this.sending.clear();
    this.returnTo = null;
  }

  /* ---------- forms ---------- */

  /** the form a group is in: the nearest container up its auto layouts with one */
  private formOf(g: Group): Group | undefined {
    const byId = new Map(this.doc.groups.map((x) => [x.id, x]));
    let at: Group | undefined = g;
    for (let i = 0; at && i < 64; i++) {
      if (at.form) return at;
      at = at.inFlow ? byId.get(at.inFlow) : undefined;
    }
    return undefined;
  }

  private formValues(formId: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const g of this.doc.groups)
      for (const it of g.items) if (it.field && this.formOf(g)?.id === formId && it.id in this.fields) out[it.field] = this.fields[it.id];
    return out;
  }

  /* ---------- the host ---------- */

  scope(tap: Tap) {
    const named: Record<string, VarValue> = { ...this.vars };
    for (const v of this.doc.vars ?? []) named[v.name] = this.vars[v.id];
    const form = tap.form ? this.formValues(tap.form) : undefined;
    return {
      vars: named,
      params: tap.params ?? {},
      data: {},
      auth: { signedIn: this.signedIn, user: null },
      ...(tap.item !== undefined ? { item: tap.item, index: tap.index } : {}),
      ...(form ? { form: { ...form, values: form, errors: {}, submitting: tap.form ? this.sending.has(tap.form) : false } } : {}),
    };
  }

  ctx() {
    return { lang: "en", now: 0 };
  }

  variable(id: string) {
    const v = this.doc.vars?.find((x) => x.id === id);
    return v ? { type: v.type, value: this.vars[id] ?? v.value } : undefined;
  }

  setVar(id: string, value: VarValue) {
    this.vars = { ...this.vars, [id]: value };
  }

  filled(part: string) {
    const v = this.fields[part];
    return typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : false;
  }

  shown(part: string) {
    const g = this.groupOfItem.get(part);
    return !!g && !(this.hidden[g.id] ?? !!g.hidden);
  }

  setShown(part: string, on: boolean) {
    const g = this.groupOfItem.get(part);
    if (g) this.hidden = { ...this.hidden, [g.id]: !on };
  }

  setOpen(part: string, on: boolean) {
    const g = this.groupOfItem.get(part);
    if (!g) return;
    this.opened = { ...this.opened, [part]: on };
    /* an overlay with no trigger of its own stands only while it is open */
    const it = g.items.find((x) => x.id === part);
    if (on || it?.component !== "dropdown-menu") this.hidden = { ...this.hidden, [g.id]: !on };
  }

  setProp(part: string, prop: string, value: VarValue) {
    this.props = { ...this.props, [part]: { ...this.props[part], [prop]: value } };
  }

  toast(text: string) {
    this.snack = text;
  }

  go(to: string, o: { overlay?: boolean; params?: Record<string, unknown> }) {
    const f = this.frame(to);
    if (!f) return;
    this.moved();
    const login = this.doc.frames.find((x) => x.auth === "login");
    if (f.auth === "required" && !this.signedIn && login && login.id !== to) {
      this.returnTo = { id: to, ...(o.params ? { params: o.params } : {}) };
      this.overlay = null;
      this.stack = [...this.stack, { id: login.id }];
      return;
    }
    if (o.overlay) {
      this.overlay = { id: to, ...(o.params ? { params: o.params } : {}) };
      return;
    }
    this.overlay = null;
    this.stack = [...this.stack, { id: to, ...(o.params ? { params: o.params } : {}) }];
  }

  back() {
    this.moved();
    if (this.overlay) this.overlay = null;
    else if (this.stack.length > 1) this.stack = this.stack.slice(0, -1);
  }

  openLink() {}
  scrollTo() {}

  private async send(operationId: string, query: Record<string, unknown>, body: unknown): Promise<Outcome> {
    const epoch = this.epoch;
    const answer = await this.backend.receive(operationId, givenOf(query, body));
    if (epoch !== this.epoch) return { ok: false, status: answer.status, error: {}, dropped: true };
    const login = this.doc.api?.auth?.login;
    if (answer.status >= 200 && answer.status < 300) {
      if (operationId === login) this.signedIn = true;
      return { ok: true, status: answer.status, response: answer.body };
    }
    if (answer.status === 401 && operationId !== login) {
      this.signedIn = false;
      return { ok: false, status: 401, error: { status: 401 }, unauthorized: true };
    }
    return { ok: false, status: answer.status, error: { status: answer.status } };
  }

  call(operationId: string, a: CallArgs): Promise<Outcome> {
    const e = endpointOf(this.doc.api, operationId);
    if (!e || !this.doc.api) return Promise.resolve({ ok: false, status: 0, error: { status: 0 } });
    const takes = new Set(paramsOf(this.doc.api, e).map((p) => p.name));
    const query: Record<string, unknown> = {};
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.args)) (takes.has(k) ? query : fields)[k] = v;
    return this.send(operationId, query, a.body !== undefined ? a.body : Object.keys(fields).length ? fields : undefined);
  }

  /* the table's designs hold no data sources: there is no row to change first */
  optimistic(_source: string, _change: Change, _tap: Tap): (() => void) | undefined {
    return undefined;
  }
  refresh() {}
  loadMore() {}

  form(id: string | undefined, tap: Tap): FormRef | undefined {
    const g = this.doc.groups.find((x) => x.id === (id ?? tap.form));
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    return g?.form ? { id: g.id, operationId: g.form.operationId, ...(g.form.then ? { then: g.form.then } : {}), ...(g.form.catch ? { catch: g.form.catch } : {}) } : undefined;
  }

  async submit(form: FormRef): Promise<Outcome | null> {
    if (this.sending.has(form.id)) return null;
    const e = endpointOf(this.doc.api, form.operationId);
    if (!e || !this.doc.api) return null;
    const values = this.formValues(form.id);
    /* a required field left empty: nothing is sent */
    if (formFields(this.doc.api, e).some((f) => f.required && (values[f.name] === undefined || String(values[f.name]).trim() === ""))) return null;
    this.sending.add(form.id);
    try {
      return await this.send(form.operationId, {}, values);
    } finally {
      this.sending.delete(form.id);
    }
  }

  signOut() {
    this.signedIn = false;
    /* a screen that needs a session does not stay on show without one */
    const login = this.doc.frames.find((x) => x.auth === "login");
    if (login && this.frame(this.top().id)?.auth === "required") {
      this.moved();
      this.returnTo = null;
      this.overlay = null;
      this.stack = [...this.stack, { id: login.id }];
    }
  }

  afterSignIn(operationId: string) {
    if (operationId !== this.doc.api?.auth?.login || !this.returnTo) return false;
    const to = this.returnTo;
    this.returnTo = null;
    this.moved();
    this.stack = [...this.stack.slice(0, -1), to];
    return true;
  }

  moves() {
    return this.count;
  }

  /** a move: counted, and the screen it leaves in use starts what it times (done once the move is made) */
  private moved() {
    this.count++;
    queueMicrotask(() => this.inUse());
  }
}
