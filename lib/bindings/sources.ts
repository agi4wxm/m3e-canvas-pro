/* What a data source holds and what the screen shows for it, as plain functions over plain data: the state of one
 * source as its loads go (idle, loading, ready, error; pages so far, the next page's cursor or offset), the parameters
 * the next page is asked with, what an answer makes of the state (the list across pages, whether there is more, the
 * total, an answer that holds no list where the contract promised one), what `data.<name>` reads, an optimistic change
 * of a list and the state a region shows (loading, empty, error, forbidden, ready). The preview's engine
 * (runtime.ts) and the exported apps' runtime (packages/app-runtime copies this file) both go by these, so a list pages,
 * empties and fails the same way in both. */

import type { ApiPagination } from "../api/types";
import type { Problem } from "./rules";

export type SourceStatus = "idle" | "loading" | "ready" | "error";

/** one data source, as far as it has got */
export type SourceState = {
  status: SourceStatus;
  /** what it was last asked with, so entering the screen again with the same keeps it */
  key?: string;
  /** the last answer's body; for a paged list, its list field holds every element loaded so far */
  value?: unknown;
  /** the list it holds: every page so far, or the body itself when that is the list */
  items?: unknown[];
  error?: Problem | null;
  /** a load (the first, or again) is under way */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** the next page's cursor, or how many to skip */
  next?: string | number | null;
  total?: number;
  /** which load is the latest: an answer to an earlier one is dropped */
  seq: number;
};

export const idleSource = (): SourceState => ({ status: "idle", loading: false, loadingMore: false, hasMore: false, seq: 0 });

/** the most elements a list may come to across its pages, so a runaway server cannot grow the app without end */
export const MAX_ITEMS = 2000;

/** how an endpoint pages, every name filled in (lib/api/types `paginationOf`) */
export type Paging = Required<ApiPagination>;

/** where an answer holds its list: a field of the body, or "" for the body itself */
export type ListAt = { field: string };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** a field of a body, when the body is an object that has it as its own */
const fieldOf = (body: unknown, key: string): unknown => (isRecord(body) && Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined);

/** The parameters a load adds for paging: the page size when it is given and not set already, and for the next page the
 *  cursor the last answer gave or how many elements are there to skip. */
export function pageParams(pg: Paging | undefined, o: { more?: boolean; was: SourceState; pageSize?: number; params: Record<string, unknown> }): Record<string, unknown> {
  if (!pg) return {};
  const out: Record<string, unknown> = {};
  if (o.pageSize && o.params[pg.limitParam] === undefined) out[pg.limitParam] = o.pageSize;
  if (o.more) {
    if (pg.style === "cursor") out[pg.cursorParam] = o.was.next;
    else out[pg.offsetParam] = o.was.items?.length ?? 0;
  }
  return out;
}

/** The state a load starts: a new seq, and for a load with other arguments (`fresh`) none of what the old ones gave. */
export function loadStarted(s: SourceState, o: { seq: number; more?: boolean; key: string; fresh: boolean }): SourceState {
  if (o.more) return { ...s, seq: o.seq, loadingMore: true };
  return { ...s, seq: o.seq, key: o.key, loading: true, loadingMore: false, status: o.fresh || s.status === "idle" ? "loading" : s.status, ...(o.fresh ? { value: undefined, items: undefined, error: null, hasMore: false } : {}) };
}

/** The state a failed load leaves: what was there stays on show (an error beside it), else the error is the state. */
export function loadFailed(s: SourceState, problem: Problem, o: { more?: boolean; fresh: boolean }): SourceState {
  return { ...s, status: s.value !== undefined && o.more ? s.status : s.value !== undefined && !o.fresh ? "ready" : "error", loading: false, loadingMore: false, error: problem };
}

/** An answer that should hold a list and holds none: the problem it is (the contract promised a list). Null when the
 *  answer is what it should be. */
export function missingList(list: ListAt | undefined, body: unknown, o: { more?: boolean; operation: string; status: number; title: string }): Problem | null {
  if (!list || o.more) return null;
  const page = list.field ? fieldOf(body, list.field) : body;
  if (Array.isArray(page)) return null;
  return { status: o.status, title: o.title, detail: `The answer of ${o.operation} holds no list${list.field ? ` at "${list.field}"` : ""}.` };
}

/** What an answer makes of the state: the list across the pages so far (capped), whether there is more and where it
 *  starts, the total, and the body as `data.<name>.value` reads it (its list field holding every page's elements). */
export function loadSettled(s: SourceState, body: unknown, o: { list?: ListAt; paging?: Paging; more?: boolean; limit?: number }): SourceState {
  const { list, paging: pg } = o;
  const page = list ? (list.field ? fieldOf(body, list.field) : body) : undefined;
  const pageItems = Array.isArray(page) ? page : undefined;
  const items = pageItems ? (o.more ? [...(s.items ?? []), ...pageItems] : pageItems).slice(0, MAX_ITEMS) : undefined;
  let next: string | number | null | undefined;
  let hasMore = false;
  let total: number | undefined;
  if (pg && pageItems) {
    if (pg.style === "cursor") {
      const n = fieldOf(body, pg.nextField);
      next = typeof n === "string" || typeof n === "number" ? n : null;
      hasMore = next !== null && next !== "";
    } else {
      const t = fieldOf(body, pg.totalField);
      total = typeof t === "number" ? t : undefined;
      hasMore = total !== undefined ? (items?.length ?? 0) < total : o.limit !== undefined && pageItems.length >= o.limit;
      next = items?.length ?? 0;
    }
    if ((items?.length ?? 0) >= MAX_ITEMS) hasMore = false;
  }
  const value = list?.field && isRecord(body) && items ? { ...body, [list.field]: items } : list && !list.field && items ? items : body;
  return { ...s, status: "ready", value, items, error: null, loading: false, loadingMore: false, hasMore, next, ...(total !== undefined ? { total } : {}) };
}

/** the list field of a source's value, when it is an object holding the list */
export const listFieldOf = (s: SourceState): string | undefined => (isRecord(s.value) ? Object.keys(s.value).find((k) => (s.value as Record<string, unknown>)[k] === s.items) : undefined);

/** whether a list's element is the one given: the same object, or one with the same id */
export const sameRow = (x: unknown, row: unknown) => x === row || (isRecord(x) && isRecord(row) && x.id !== undefined && x.id === row.id);

/** A source's list changed before a call answers: the row given taken out (`remove`), or `patch` made of it. The state
 *  as it was is what puts it back. */
export function optimisticChange(was: SourceState, row: unknown, change: { remove: true } | { patch: (x: Record<string, unknown>) => Record<string, unknown> }): SourceState {
  if (!was.items || row === undefined) return was;
  const items = "remove" in change ? was.items.filter((x) => !sameRow(x, row)) : was.items.map((x) => (sameRow(x, row) && isRecord(x) ? { ...x, ...change.patch(x) } : x));
  const field = listFieldOf(was);
  const value = field && isRecord(was.value) ? { ...was.value, [field]: items } : Array.isArray(was.value) ? items : was.value;
  return { ...was, items, value };
}

/* ---------- what the screen reads ---------- */

/** a data source as `data.<name>` reads it */
export type SourceView = {
  value: unknown;
  items: unknown[] | undefined;
  status: SourceStatus;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Problem | null;
  empty: boolean;
  ready: boolean;
  total?: number;
};

/** whether what a source holds is nothing to show */
const isEmptyValue = (v: unknown, items: unknown[] | undefined) => (items ? items.length === 0 : v === null || v === undefined || (Array.isArray(v) && !v.length));

export function sourceView(s: SourceState | undefined): SourceView {
  const x = s ?? idleSource();
  return {
    value: x.value,
    items: x.items,
    status: x.status,
    loading: x.loading,
    loadingMore: x.loadingMore,
    hasMore: x.hasMore,
    error: x.error ?? null,
    empty: x.status === "ready" && isEmptyValue(x.value, x.items),
    ready: x.status === "ready",
    ...(x.total !== undefined ? { total: x.total } : {}),
  };
}

/** the states a region designs, in the order of its panes: content, loading, empty, error, forbidden */
export type RegionShows = "ready" | "loading" | "empty" | "error" | "forbidden";

/** The state a region shows for its source: loading until it has something (empty for a source that loads only on
 *  demand and has not), forbidden (401, 403), empty (404) or an error when it failed with nothing to show, empty when it
 *  holds nothing or `emptyWhen` says so, else its content. */
export function regionOf(v: SourceView | undefined, o: { load?: "enter" | "demand"; emptyWhen?: () => boolean } = {}): RegionShows {
  if (!v) return "ready";
  if (v.status === "idle") return o.load === "demand" ? "empty" : "loading";
  if (v.status === "loading" && v.value === undefined) return "loading";
  if (v.status === "error" && v.value === undefined) {
    const st = v.error?.status ?? 0;
    return st === 401 || st === 403 ? "forbidden" : st === 404 ? "empty" : "error";
  }
  if (o.emptyWhen) return o.emptyWhen() ? "empty" : "ready";
  return v.empty ? "empty" : "ready";
}

/* ---------- a screen's params ---------- */

/** what a screen says of one of its params */
export type ParamSpec = { name: string; type?: string; example?: unknown };

/** a param as its declared type has it: an address carries words, a number param reads as a number */
export function typedParam(v: unknown, type: string | undefined): unknown {
  if (type === "number") return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  if (type === "boolean") return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : v;
  return v;
}

/** The params a screen reads: what it was opened with, each as its type has it, and the example of each it was not
 *  given (a screen opened straight, with nothing, is not blank); what it was given beyond its declared ones too. */
export function screenParams(specs: readonly ParamSpec[] | undefined, given: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of specs ?? []) {
    const v = given && Object.prototype.hasOwnProperty.call(given, p.name) ? given[p.name] : p.example;
    if (v !== undefined) out[p.name] = typedParam(v, p.type);
  }
  for (const [k, v] of Object.entries(given ?? {})) if (!(k in out)) out[k] = v;
  return out;
}
