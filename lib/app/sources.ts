/* The data sources of an exported app: one entry per operation and arguments (the cache key), loaded through the typed
 * client by a function the generated hook gives, page after page. A newer load of the same key cancels the older one
 * (its signal is aborted where the platform has AbortController, and its answer is dropped anyway); a key loaded before
 * shows what it holds while it loads again behind it; a list's next page is asked with the cursor or offset the last
 * answer gave. Every state change is a new state (lib/bindings/sources.ts makes them, as the preview does). */

import type { AbortSignalLike } from "../api/transport";
import type { Problem } from "../bindings/rules";
import { idleSource, loadFailed, loadSettled, loadStarted, missingList, optimisticChange, pageParams, sameRow, type ListAt, type Paging, type SourceState } from "../bindings/sources";
import { appMessage } from "../bindings/messages";
import { Store } from "./store";

/** what a load is asked with beyond its own arguments: the page parameters, and a signal that says it is no longer wanted */
/** the value of a page parameter: a cursor, how many to skip, how many to take */
export type PageValue = string | number | null | undefined;

export type LoadInit = { page: Readonly<Record<string, PageValue>>; signal?: AbortSignalLike };

/** One data source as the generated hook describes it. */
export type SourceSpec<T = unknown> = {
  /** the cache key: the operation and what it is asked with, as words (`sourceKey`) */
  key: string;
  /** the operation's id, for what an error says */
  operation?: string;
  /** asks for it (a page of it): the typed client's call */
  load: (init: LoadInit) => Promise<T>;
  /** where the answer holds its list, for a list */
  list?: ListAt;
  /** how it pages, for a paged list */
  paging?: Paging;
  /** the page size asked for, unless the arguments set it */
  pageSize?: number;
  /** the arguments it is asked with, to know whether they set the page size */
  args?: Record<string, unknown>;
};

/** the cache key of an operation and its arguments */
export const sourceKey = (operation: string, args?: unknown) => `${operation}:${JSON.stringify(args ?? null)}`;

/** the most entries kept; the oldest that is not loading goes first */
const MAX_ENTRIES = 100;

type Abortable = { abort(): void; signal: AbortSignalLike };

/** an AbortController where the platform has one */
function controller(): Abortable | undefined {
  const Ctor = (globalThis as { AbortController?: new () => Abortable }).AbortController;
  try {
    return Ctor ? new Ctor() : undefined;
  } catch {
    return undefined;
  }
}

export class SourceCache {
  readonly store = new Store<Readonly<Record<string, SourceState>>>({});
  private readonly controllers = new Map<string, Abortable>();
  /** how many times it was cleared: a load started before the last time answers into nothing */
  private epoch = 0;

  constructor(private readonly o: { lang: () => string; errorOf: (e: unknown) => Problem }) {}

  state(key: string): SourceState {
    return this.store.get()[key] ?? IDLE;
  }

  private put(key: string, fn: (s: SourceState) => SourceState) {
    this.store.set((all) => {
      const next = { ...all, [key]: fn(all[key] ?? idleSource()) };
      const keys = Object.keys(next);
      if (keys.length > MAX_ENTRIES) {
        const old = keys.find((k) => k !== key && !next[k].loading && !next[k].loadingMore);
        if (old) delete next[old];
      }
      return next;
    });
  }

  /** Loads a source: afresh, its next page (`more`), or not at all when it holds what the same key gave and `force` is
   *  not asked. Resolves once it has settled; never rejects. */
  async load(spec: SourceSpec, o: { more?: boolean; force?: boolean } = {}): Promise<void> {
    const was = this.state(spec.key);
    if (o.more) {
      if (!was.hasMore || was.loadingMore || was.loading || was.key !== spec.key) return;
    } else if (!o.force && was.key === spec.key && (was.status === "ready" || was.loading)) return;
    const page = pageParams(spec.paging, { more: o.more, was, pageSize: spec.pageSize, params: spec.args ?? {} }) as Record<string, PageValue>;
    const seq = was.seq + 1;
    const fresh = was.key !== spec.key;
    const epoch = this.epoch;
    /* the load this one replaces is no longer wanted */
    if (!o.more) this.controllers.get(spec.key)?.abort();
    const ctl = controller();
    if (ctl && !o.more) this.controllers.set(spec.key, ctl);
    this.put(spec.key, (s) => loadStarted(s, { seq, more: o.more, key: spec.key, fresh }));
    const current = () => epoch === this.epoch && this.state(spec.key).seq === seq;
    let body: unknown;
    try {
      body = await spec.load({ page, ...(ctl ? { signal: ctl.signal } : {}) });
    } catch (e) {
      if (current()) this.put(spec.key, (s) => loadFailed(s, this.o.errorOf(e), { more: o.more, fresh }));
      return;
    } finally {
      if (this.controllers.get(spec.key) === ctl) this.controllers.delete(spec.key);
    }
    if (!current()) return;
    const missing = missingList(spec.list, body, { more: o.more, operation: spec.operation ?? spec.key, status: 200, title: appMessage("failed", this.o.lang()) });
    if (missing) {
      this.put(spec.key, (s) => ({ ...s, status: "error", loading: false, loadingMore: false, value: undefined, items: undefined, error: missing }));
      return;
    }
    const limitParam = spec.paging?.limitParam;
    const limit = limitParam ? (typeof page[limitParam] === "number" ? (page[limitParam] as number) : typeof spec.args?.[limitParam] === "number" ? (spec.args[limitParam] as number) : undefined) : undefined;
    this.put(spec.key, (s) => loadSettled(s, body, { list: spec.list, paging: spec.paging, more: o.more, limit }));
  }

  /** A screen comes on show with the source: one that holds what the same key gave is loaded again behind what it
   *  shows (a list come back to after something was added shows it), one already loading is left to finish. */
  enter(spec: SourceSpec): Promise<void> {
    const was = this.store.get()[spec.key];
    return this.load(spec, { force: was?.status === "ready" && !was.loading });
  }

  refresh(spec: SourceSpec): Promise<void> {
    return this.load(spec, { force: true });
  }

  loadMore(spec: SourceSpec): Promise<void> {
    return this.load(spec, { more: true });
  }

  /** Changes a source's list before a call answers: the row taken out, or fields of it set. What it gives back puts
   *  the list back as it was, for when the call fails. */
  optimistic(key: string, row: unknown, change: { remove: true } | { patch: (x: Record<string, unknown>) => Record<string, unknown> }): () => void {
    const was = this.store.get()[key];
    if (!was?.items || row === undefined || !was.items.some((x) => sameRow(x, row))) return () => {};
    const changed = optimisticChange(was, row, change);
    this.put(key, (s) => ({ ...s, items: changed.items, value: changed.value }));
    return () => this.put(key, (s) => ({ ...s, items: was.items, value: was.value }));
  }

  /** forgets everything: every load still out answers into nothing */
  clear() {
    this.epoch++;
    for (const c of this.controllers.values()) c.abort();
    this.controllers.clear();
    this.store.set({});
  }
}

const IDLE: SourceState = idleSource();
