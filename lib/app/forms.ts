/* A form of an exported app: what was entered in each field (controlled), what the schema says is wrong with it (the
 * rules the export wrote from the contract), the server's errors put on the fields their JSON Pointers name, the
 * form's own error, whether it is submitting, and how far its upload has gone. A submit checks first and sends nothing
 * while a field is wrong; after the first try the errors follow what is typed. Plain TypeScript in a store, so React,
 * React Native and a mini-program read it alike; lib/bindings/form.ts and rules.ts are the preview's own rules. */

import type { TransportRequest } from "../api/transport";
import { formViewOf, idleForm, readFields, setPath, type FormRun, type FormView } from "../bindings/form";
import { problemFieldErrors, type FieldRule, type Problem } from "../bindings/rules";
import { Store } from "./store";

/** the rules of a form's fields, by field ("email", "price.amount") */
export type FormFields = Readonly<Record<string, FieldRule>>;

/** What a call came to: its answer, or the problem it is (`unauthorized` when a 401 has sent the app to sign in).
 *  `dropped` when it was answered into nothing: the runtime started over while it was out, or a newer call of the same
 *  kind (`CallOptions.key`) speaks for it now (docs/交互规则.md, “迟到的回答”). */
export type CallResult<T = unknown> = { ok: true; response: T; status: number } | { ok: false; error: Problem; status: number; unauthorized: boolean; dropped?: boolean };

/** what a form's send is given beyond its body: what hears how its upload goes */
export type SendInit = Pick<TransportRequest, "onUploadProgress">;

export type FormState = { values: Readonly<Record<string, unknown>>; run: FormRun; changed: Readonly<Record<string, true>> };

/** a file as a platform hands one over: a Blob or File (its size and type), the transport's data URL, a React Native
 *  `{ uri }`, a mini-program's temporary `{ path }` */
const isFile = (v: unknown): boolean => {
  if (!v || typeof v !== "object") return false;
  const f = v as { size?: unknown; type?: unknown; dataUrl?: unknown; uri?: unknown; path?: unknown };
  return (typeof f.size === "number" && typeof f.type === "string") || typeof f.dataUrl === "string" || typeof f.uri === "string" || typeof f.path === "string";
};

export class FormController {
  readonly store: Store<FormState>;
  private viewed?: { state: FormState; view: FormView };

  constructor(
    private readonly fields: FormFields,
    private readonly o: { lang: () => string; call: <T>(fn: () => Promise<T>) => Promise<CallResult<T>>; initial?: Record<string, unknown> },
  ) {
    this.store = new Store<FormState>({ values: { ...o.initial }, run: idleForm(), changed: {} });
  }

  get state(): FormState {
    return this.store.get();
  }

  /** what is entered in a field now */
  value(field: string): unknown {
    return this.state.values[field];
  }

  /** a field's words, for a text input: nothing is "" */
  text(field: string): string {
    const v = this.value(field);
    return v === undefined || v === null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  }

  /** what a field shows as its error: the schema's once a submit was tried, else the server's */
  error(field: string): string | undefined {
    return this.view().errors[field];
  }

  /** enters a value; the server's error on that field goes with what it was about */
  set = (field: string, value: unknown) => {
    this.store.set((s) => {
      const { [field]: _gone, ...errors } = s.run.errors;
      return { ...s, values: { ...s.values, [field]: value }, changed: { ...s.changed, [field]: true }, run: field in s.run.errors ? { ...s.run, errors } : s.run };
    });
  };

  /** the fields read: the body, the values as their types have them, and what is wrong */
  read(extra?: Record<string, unknown>) {
    const read = readFields(
      Object.keys({ ...this.fields, ...this.state.values }).map((field) => ({ field, raw: this.state.values[field], rule: this.fields[field] })),
      this.o.lang(),
    );
    for (const [k, v] of Object.entries(extra ?? {})) if (v !== undefined) setPath(read.body, k, v);
    return read;
  }

  /** the form as `form.` reads it in expressions */
  view(): FormView {
    const state = this.state;
    if (this.viewed?.state === state) return this.viewed.view;
    const view = formViewOf(this.read(), state.run);
    this.viewed = { state, view };
    return view;
  }

  /** whether a file is among what was entered */
  get hasFiles(): boolean {
    return Object.values(this.state.values).some((v) => isFile(v) || (Array.isArray(v) && v.some(isFile)));
  }

  private setRun(patch: Partial<FormRun>) {
    this.store.set((s) => ({ ...s, run: { ...s.run, ...patch } }));
  }

  /** Checks the form and sends its body (with `extra`, the fields no input gives). Nothing is sent while a field is
   *  wrong or a submit is under way. */
  async submit<T>(send: (body: Record<string, unknown>, init: SendInit) => Promise<T>, extra?: Record<string, unknown>): Promise<CallResult<T> | { ok: false; invalid: true }> {
    if (this.state.run.submitting) return { ok: false, invalid: true };
    const read = this.read(extra);
    if (Object.keys(read.errors).length) {
      this.setRun({ submitted: true, error: null, errors: {} });
      return { ok: false, invalid: true };
    }
    const files = this.hasFiles;
    this.setRun({ submitting: true, submitted: true, error: null, errors: {}, progress: files ? 0 : null });
    const onUploadProgress = files ? (sent: number, total: number) => this.setRun({ progress: total > 0 ? Math.min(99, Math.round((sent / total) * 100)) : null }) : undefined;
    const out = await this.o.call(() => send(read.body, onUploadProgress ? { onUploadProgress } : {}));
    if (out.ok) this.setRun({ submitting: false, errors: {}, error: null, progress: files ? 100 : null, response: out.response });
    else if (out.dropped) {
      /* answered into nothing (the runtime started over): what it says is no one's to show */
      this.setRun({ submitting: false, progress: null });
    }
    else this.setRun({ submitting: false, errors: problemFieldErrors(out.error), error: out.error, progress: null });
    return out;
  }

  /** back to nothing entered */
  reset(initial?: Record<string, unknown>) {
    this.store.set({ values: { ...(initial ?? this.o.initial) }, run: idleForm(), changed: {} });
  }
}
