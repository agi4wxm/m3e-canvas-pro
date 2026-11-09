/* The table's reference host: the smallest app the interpreter can run in, kept as plain state (a stack of screens and
 * an overlay, the variables, what is shown and open, what was typed, the session, the snackbar) over a row's document.
 * It is what the interpreter's own run of the table uses, and a model of what every host's side of `Host` has to do. */

import { endpointOf, formFields, paramsOf } from "../../bindings/contract";
import { eventAction, eventsOf, payloadOf, slotAction } from "../../partContract";
import { groupsInFrame, type Doc, type Frame, type Group, type Item } from "../../tokens";
import type { BackOptions, CallArgs, Change, FormRef, GoOptions, Host, InvokeOutcome, Outcome, Tap, WorldInput } from "../host";
import { inputLog } from "../../world/channel";
import type { FailureKind } from "../../capabilities/types";
import type { VarValue } from "../model";
import { run, startOf } from "../run";
import { Backend, givenOf } from "./check";
import { channelSpecOf } from "../../bindings/design";
import { channelView, idleChannel, isoOf, messageAction, received, type ChannelState } from "../../bindings/channels";
import type { Move, Observed } from "./types";
import { createSpawns, spawnedWords, type Spawns } from "../../spawn";
import { templateMembers } from "../../spawnPool";
import type { Scope } from "../../bindings/expr";

/** What a screen's templates show (docs/交互规则.md “按事件生成”): no template's own words, which wait for an instance,
 *  but each instance alive at `now`, its words filled from what its step read. `parts` are the screen's parts on show;
 *  what comes back is them without the templates' and the instances' words. */
export function withSpawned(groups: Group[], parts: Item[], spawns: Spawns, now: number, words: (it: Item) => string): { parts: Item[]; spawned: string[] } {
  const templates = groups.filter((g) => g.spawn);
  if (!templates.length) return { parts, spawned: [] };
  const inTemplate = new Map<string, Group[]>();
  for (const t of templates) inTemplate.set(t.id, templateMembers(t, groups, {}));
  const held = new Set([...inTemplate.values()].flat().flatMap((g) => g.items.map((it) => it.id)));
  const spawned: string[] = [];
  for (const [id, members] of inTemplate) for (const s of spawns.live(id, now)) for (const g of members) for (const it of g.items) spawned.push(spawnedWords(words(it), s));
  return { parts: parts.filter((it) => !held.has(it.id)), spawned };
}

/** a screen on the stack, with the motion it came in with (going back undoes it) */
type Entry = { id: string; params?: Record<string, unknown>; motion?: string };

/** the words a part shows: its label, its text, a dialog's headline, an input's placeholder */
export const wordsOf = (it: Item): string => {
  const p = (it.props ?? {}) as Record<string, unknown>;
  /* a number pad by its confirm button, a group of buttons by its first */
  const first = Array.isArray(p.items) ? (p.items[0] as { label?: unknown } | undefined)?.label : undefined;
  const w = p.label ?? p.text ?? p.headline ?? p.placeholder ?? (it.component === "number-pad" ? p.action : it.component === "button-group" ? first : undefined);
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
  /** the last screen move */
  move: Move | undefined;
  /** what each world view's stand-in lists of the inputs it heard, by its item id */
  heard: Record<string, string[]> = {};
  /** the instances spawned on events, by their template */
  readonly spawns = createSpawns();
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
    for (const on of [this.top().id, ...(this.overlay ? [this.overlay.id] : [])]) {
      const { parts, spawned } = withSpawned(this.groupsOn(on), this.partsOn(on), this.spawns, this.backend.now(), wordsOf);
      words.push(...spawned);
      for (const it of parts) {
        const set = this.props[it.id];
        words.push(typeof set?.text === "string" ? set.text : typeof set?.label === "string" ? set.label : wordsOf(it));
        if (it.component === "dropdown-menu" && this.opened[it.id]) for (const row of ((it.props?.items as { label?: string }[] | undefined) ?? [])) words.push(row.label ?? "");
        /* a world view's stand-in lists the inputs it heard */
        words.push(...(this.heard[it.id] ?? []));
      }
    }
    return { vars: { ...this.vars }, words, toast: this.snack, screen: this.top().id, calls: this.backend.calls, ...(this.move ? { move: this.move } : {}) };
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

  /** a tap on a place of the part: its own action, else its family's, which reads the place as `slot` */
  tapSlot(words: string, slot: string) {
    const on = this.overlay ?? this.top();
    const it = this.partsOn(on.id).find((x) => wordsOf(x) === words);
    if (!it) throw new Error(`no words "${words}" on show`);
    const wired = slotAction(it, slot);
    if (wired) this.runOn(it, on, wired.action, wired.scope?.slot ? { slot: wired.scope.slot } : {});
  }

  /** the part sends one of its events: what it declares of the payload is what the action reads as `event` */
  emit(words: string, name: string, payload?: Record<string, unknown>) {
    const on = this.overlay ?? this.top();
    const it = this.partsOn(on.id).find((x) => wordsOf(x) === words);
    if (!it) throw new Error(`no words "${words}" on show`);
    const declared = eventsOf(it).find((e) => e.name === name);
    const a = eventAction(it, name);
    if (declared && a) this.runOn(it, on, a, { event: payloadOf(declared, payload) });
  }

  /** the part's action, if it starts this way (a part whose action starts on a hover does nothing on a tap) */
  private start(words: string, how: "tap" | "hover") {
    const on = this.overlay ?? this.top();
    const it = this.partsOn(on.id).find((x) => wordsOf(x) === words);
    if (!it) throw new Error(`no words "${words}" on show`);
    if (it.action && startOf(it.action, { pointer: true }).on === how) this.runOn(it, on);
  }

  private runOn(it: Item, on: Entry, action = it.action, more: Partial<Tap> = {}) {
    if (!action) return;
    const g = this.groupOfItem.get(it.id);
    const form = g ? this.formOf(g)?.id : undefined;
    void run(action, this, { screen: on.id, ...(on.params ? { params: on.params } : {}), part: it.id, ...(form ? { form } : {}), ...more });
  }

  /* ---------- subscriptions ---------- */

  /** the subscriptions open on the screens on show, by screen and name: what each is asked with, what it has kept */
  private listening = new Map<string, { key: string; close: () => void; state: ChannelState; live: boolean }>();

  /** The subscriptions of the screens on show (the top of the stack, the overlay over it) are open; one asked with
   *  another address is opened again afresh, one of a screen gone is closed. `fresh` closes every one first (a restart). */
  private listen(fresh = false) {
    const wanted = new Set<string>();
    const close = (k: string) => {
      const o = this.listening.get(k);
      if (!o) return;
      o.live = false;
      o.close();
      this.listening.delete(k);
    };
    if (fresh) for (const k of this.listening.keys()) close(k);
    for (const on of [this.top(), ...(this.overlay ? [this.overlay] : [])]) {
      for (const sub of this.frame(on.id)?.subscriptions ?? []) {
        const tap: Tap = { screen: on.id, ...(on.params ? { params: on.params } : {}) };
        const spec = channelSpecOf(this.doc.api ?? {}, sub, this.scope(tap), this.ctx());
        if (!spec) continue;
        const k = `${on.id}/${sub.name}`;
        wanted.add(k);
        if (this.listening.get(k)?.key === spec.key) continue;
        close(k);
        const entry = { key: spec.key, close: () => {}, state: idleChannel(), live: true };
        const epoch = this.epoch;
        const conn = this.backend.connect(spec.address, (m) => {
          if (!entry.live || epoch !== this.epoch || (spec.messages && !spec.messages.includes(m.message))) return;
          entry.state = received(entry.state, { message: m.message, payload: m.payload, at: m.at }, spec.keep);
          const action = messageAction(sub.actions, m.message);
          if (action) void run(action, this, { ...tap, event: { channel: sub.channel, message: m.message, payload: m.payload, at: isoOf(m.at) } });
        });
        entry.state = { ...entry.state, status: "open" };
        entry.close = conn.close;
        this.listening.set(k, entry);
      }
    }
    for (const k of this.listening.keys()) if (!wanted.has(k)) close(k);
  }

  /** what a screen's subscriptions read as `data.<name>` */
  private channelsOf(screen: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const sub of this.frame(screen)?.subscriptions ?? []) out[sub.name] = channelView(this.listening.get(`${screen}/${sub.name}`)?.state, { newest: sub.newest });
    return out;
  }

  /* what starts some time after its screen comes into use: timed again each time one does */
  private timers: ReturnType<typeof setTimeout>[] = [];
  private inUse() {
    this.listen();
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
    this.spawns.clear();
    /* the subscriptions of the old session are gone; the screens on show open theirs again on the new one */
    this.listen(true);
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
      data: this.channelsOf(tap.screen),
      auth: { signedIn: this.signedIn, user: null },
      ...(tap.item !== undefined ? { item: tap.item, index: tap.index } : {}),
      ...(form ? { form: { ...form, values: form, errors: {}, submitting: tap.form ? this.sending.has(tap.form) : false } } : {}),
    };
  }

  /** the language, and the time on the back end's clock */
  ctx() {
    return { lang: "en", now: this.backend.now() };
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

  /** an instance of a template, spawned on the back end's clock with what its step read */
  spawn(group: string, scope: Scope) {
    const g = this.doc.groups.find((x) => x.id === group);
    if (g?.spawn) this.spawns.spawn(group, g.spawn, scope, this.backend.now(), this.ctx());
  }

  /** an input for a world view: its channel delivers it at once, and its stand-in lists it */
  worldInput(part: string, action: string, value: WorldInput) {
    this.heard = { ...this.heard, [part]: inputLog(this.heard[part] ?? [], action, value) };
  }

  go(to: string, o: Pick<GoOptions, "overlay" | "params" | "motion">) {
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
    const motion = o.motion?.kind;
    this.move = { back: false, motion: motion ?? "none" };
    this.stack = [...this.stack, { id: to, ...(o.params ? { params: o.params } : {}), ...(motion ? { motion } : {}) }];
  }

  /** back: an overlay closes; else the screen goes as the back action's motion says, played backwards, or the way it came */
  back(o?: BackOptions) {
    this.moved();
    if (this.overlay) this.overlay = null;
    else if (this.stack.length > 1) {
      this.move = { back: true, motion: o?.motion?.kind ?? this.top().motion ?? "none" };
      this.stack = this.stack.slice(0, -1);
    }
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

  async invoke(capability: string, args: Record<string, unknown>): Promise<InvokeOutcome> {
    const epoch = this.epoch;
    const a = await this.backend.invoke(capability, args);
    if (epoch !== this.epoch) return { ok: false, error: { type: "failed", capability }, dropped: true };
    return a.ok ? { ok: true, result: a.result } : { ok: false, error: { type: a.type as FailureKind, capability } };
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
