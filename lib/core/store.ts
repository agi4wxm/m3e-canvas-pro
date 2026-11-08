/* The document core's store: the one place a document changes. The editor's panels and canvas, the in-app agent and
 * the MCP server all change it through here, with operations (lib/core/ops) inside transactions, and all of them can
 * listen to what changed and who changed it. Plain TypeScript: it runs in the browser and in Node.
 *
 * History works the way the editor's always has. A step keeps the canvas's screens, parts, definitions and data as
 * they were before it (`Snapshot`); a step that crosses the whole document (a style picked, a file opened) keeps all
 * of it. Consecutive edits of one field within a moment of each other are one step (coalescing). While a definition
 * is open for editing it has a history of its own, and the document's waits until it is closed; closing it is then
 * one step of the document's history if the definition changed. */

import { openProject } from "../project";
import { definitionFrom } from "../instances";
import { withIds, type ComponentDef, type Doc, type FrameMode, type Theme } from "../tokens";
import { getLang, type Lang } from "../i18n";
import { withDocStyles } from "../styles";
import { OpError, runOp, sessionMeasurer, type Measurer, type Op, type OpCtx } from "./op";
import {
  DEF_INSET,
  definitionScreen,
  loadInto,
  restoreSnapshot,
  savedDoc,
  snapshotOf,
  translateSnapshot,
  type CoreState,
  type Origin,
  type Snapshot,
} from "./state";

/** how many steps back the history goes */
export const HISTORY_MAX = 100;
/** edits of one field closer together than this are one step */
export const COALESCE_MS = 800;

/** A step of the history. `seq` numbers the steps in the order they were taken, undone and redone ones included:
 *  what `rebaseHistory` reads to know which steps came after a moment. */
export type HistoryEntry = { snap: Snapshot; label: string; origin: Origin; seq?: number };

/** What a change did, for whoever listens: who asked, what it is called, and the ids it touched (screens, groups,
 *  parts, definitions, collections, variables, and `doc:<field>` for the rest of the document). */
export type ChangeEvent = {
  origin: Origin;
  label: string;
  changedIds: string[];
  /** `edit` a change of the document, `undo`/`redo` a step taken back or again, `replace` a whole document
   *  arriving, `session` only the selection or the measures, `history` a step taken with nothing changed yet */
  kind: "edit" | "undo" | "redo" | "replace" | "session" | "history";
  /** the whole document was replaced (a step that crossed it, a file): what was measured is stale */
  whole?: boolean;
  /** a new undo step was taken for it */
  step?: boolean;
  state: CoreState;
  prev: CoreState;
};

export type HistoryView = { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string; steps: number };
/** what a view of the store reads: the state and where the history stands, one object until the next change */
export type StoreView = { state: CoreState; history: HistoryView };

/** How a change is kept in the history:
 *  - `auto` (the default): a step of its own, taken before it; one that changed more than the canvas's screens,
 *    parts, definitions and data (a theme, the variables, the title) crosses the whole document. An operation may
 *    ask for `whole` or `none` itself (a style picked; a theme patch that composes nothing anew)
 *  - `step`: a step of the canvas's screens, parts, definitions and data, whatever else changed
 *  - `whole`: a step that crosses the whole document
 *  - `{ coalesce }`: merged into the step before when that was the same key a moment ago (a step of the whole document
 *    when an operation in it asked for `whole`)
 *  - `none`: no step: it belongs to the step before it (a layout pass after a change, a drag in progress) */
export type HistoryMode = "auto" | "step" | "whole" | "none" | { coalesce: string };

export type TxOptions = { history?: HistoryMode };

export type StoreOptions = {
  measurer?: Measurer;
  /** the language words are written in; the editor's current one by default */
  lang?: () => Lang;
  /** where new ids come from; random by default. Given, every operation is deterministic. */
  ids?: () => string;
  /** the clock coalescing reads */
  now?: () => number;
  /** whether arguments and prop values are checked strictly for this origin (all but the editor's own, by default) */
  strict?: (origin: Origin) => boolean;
};

/** The transaction an operation runs in: the state as it is so far, a way to replace it, and the operations. */
export type Tx = {
  readonly state: CoreState;
  set(next: CoreState | ((s: CoreState) => CoreState)): void;
  run<A, R>(o: Op<A, R>, args: A): R;
  readonly origin: Origin;
};

/** what the document's history does while a definition is open: it waits here */
type Stash = { past: HistoryEntry[]; future: HistoryEntry[]; before: Snapshot; selection: string[]; seq?: number };

/** the ids a change touched, by comparing what it left with what was there */
export function changedIds(prev: CoreState, next: CoreState): string[] {
  if (prev.doc === next.doc && prev.editing === next.editing) return [];
  const out = new Set<string>();
  const list = <T extends { id: string }>(a: T[] | undefined, b: T[] | undefined, inner?: (x: T) => string[]) => {
    if (a === b) return;
    const before = new Map((a ?? []).map((x) => [x.id, x]));
    for (const x of b ?? []) {
      const was = before.get(x.id);
      before.delete(x.id);
      if (was === x) continue;
      out.add(x.id);
      for (const id of inner?.(x) ?? []) out.add(id);
      if (was) for (const id of inner?.(was) ?? []) out.add(id);
    }
    for (const [id, x] of before) {
      out.add(id);
      for (const i of inner?.(x) ?? []) out.add(i);
    }
  };
  const a = prev.doc;
  const b = next.doc;
  list(a.groups, b.groups, (g) => g.items.map((it) => it.id));
  list(a.frames, b.frames);
  list(a.components, b.components);
  list(a.collections, b.collections);
  list(a.vars, b.vars);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "groups" || k === "frames" || k === "components" || k === "collections" || k === "vars") continue;
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) out.add(`doc:${k}`);
  }
  if (prev.editing !== next.editing) out.add("doc:editing");
  return [...out];
}

/** whether a change reached past the canvas's screens, parts, definitions and data */
const crossesDoc = (prev: CoreState, next: CoreState) => {
  if (prev.doc === next.doc) return false;
  for (const k of new Set([...Object.keys(prev.doc), ...Object.keys(next.doc)])) {
    if (k === "groups" || k === "frames" || k === "components" || k === "componentSets" || k === "collections") continue;
    if ((prev.doc as Record<string, unknown>)[k] !== (next.doc as Record<string, unknown>)[k]) return true;
  }
  return false;
};

/** A client outside the editor (MCP) changes the document, not what the person at the editor has selected: the
 *  selection and the selected screen stay as they were, less what the change took away. */
function keptSelection(before: CoreState, after: CoreState): CoreState {
  const was = before.session;
  const now = after.session;
  if (now.selection === was.selection && now.frameId === was.frameId) return after;
  const ids = new Set(after.doc.groups.flatMap((g) => g.items.map((it) => it.id)));
  const selection = was.selection.filter((id) => ids.has(id));
  const frameId = was.frameId && after.doc.frames.some((f) => f.id === was.frameId) ? was.frameId : null;
  return { ...after, session: { ...now, selection: selection.length === was.selection.length ? was.selection : selection, frameId } };
}

export class DocStore {
  private state: CoreState;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private stash: Stash | null = null;
  private last = { key: "", at: 0 };
  private listeners = new Set<(e: ChangeEvent) => void>();
  private current: StoreView;
  private tx: { start: CoreState; origin: Origin; label: string; depth: number; ran: number; whole: boolean; none: boolean } | null = null;
  private pinMode: FrameMode | null = null;
  /** a step was taken since the last change was told */
  private stepped = false;
  /** the number of the last step taken (`HistoryEntry.seq`) */
  private seq = 0;
  readonly options: Required<Omit<StoreOptions, "ids">> & { ids?: () => string };

  constructor(state: CoreState, options: StoreOptions = {}) {
    this.state = state;
    this.options = {
      measurer: options.measurer ?? sessionMeasurer,
      lang: options.lang ?? getLang,
      now: options.now ?? Date.now,
      strict: options.strict ?? ((o) => o !== "user" && o !== "system"),
      ids: options.ids,
    };
    this.current = { state, history: this.historyView() };
  }

  /* ---------- reading ---------- */

  /** the state as it is now */
  get = (): CoreState => this.state;
  /** the state and the history, one object until the next change: what `useSyncExternalStore` reads */
  view = (): StoreView => this.current;
  /** the document as it is saved (lib/project.ts) */
  document = (): Doc => savedDoc(this.state);

  subscribe = (fn: (e: ChangeEvent) => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private historyView(): HistoryView {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0, undoLabel: this.past[this.past.length - 1]?.label, redoLabel: this.future[this.future.length - 1]?.label, steps: this.past.length };
  }

  /** the labels of the steps that can be undone, oldest first */
  history = (): string[] => this.past.map((e) => e.label);
  canUndo = () => this.past.length > 0;
  canRedo = () => this.future.length > 0;

  private emit(prev: CoreState, kind: ChangeEvent["kind"], origin: Origin, label: string, whole?: boolean) {
    this.current = { state: this.state, history: this.historyView() };
    const e: ChangeEvent = { origin, label, kind, changedIds: changedIds(prev, this.state), state: this.state, prev, ...(whole ? { whole } : {}), ...(this.stepped ? { step: true } : {}) };
    this.stepped = false;
    for (const fn of this.listeners) fn(e);
  }

  /* ---------- operations ---------- */

  /** the context an operation runs with */
  ctx(origin: Origin): OpCtx {
    return { widths: this.options.measurer.measure(this.state), lang: this.options.lang(), newId: this.options.ids ?? defaultId, origin, strict: this.options.strict(origin) };
  }

  /** Runs `fn` as one change: all of it lands or none of it does (a throw puts the state back as it was and leaves
   *  the history alone). Transactions inside a transaction are part of it. */
  transact<T>(label: string, origin: Origin, fn: (tx: Tx) => T, o: TxOptions = {}): T {
    const outer = !this.tx;
    const start = this.state;
    if (outer) this.tx = { start, origin, label, depth: 0, ran: 0, whole: false, none: false };
    const tx = this.tx!;
    tx.depth++;
    const read = () => this.state;
    const write = (next: CoreState) => {
      this.state = next;
    };
    const runIn = <A, R>(o: Op<A, R>, args: A): R => {
      const ctx = this.ctx(tx.origin);
      const go = () => runOp(o, this.state, args, ctx);
      const out = this.options.ids ? withIds(this.options.ids, go) : go();
      this.state = tx.origin === "mcp" ? keptSelection(this.state, out.state) : out.state;
      tx.ran++;
      if (out.history === "whole") tx.whole = true;
      if (out.history === "none") tx.none = true;
      return out.result as R;
    };
    const handle: Tx = {
      get state() {
        return read();
      },
      origin: tx.origin,
      set: (next) => write(typeof next === "function" ? next(read()) : next),
      run: runIn,
    };
    let value: T;
    try {
      value = fn(handle);
    } catch (e) {
      this.state = start;
      tx.depth--;
      if (outer) this.tx = null;
      throw e;
    }
    tx.depth--;
    if (!outer) return value;
    this.tx = null;
    const asked = o.history ?? "auto";
    /* an operation run on its own by the editor may ask for no step (a theme patch that composes nothing anew, as the
     * editor has always kept them); what an agent or a client does is always a step it can take back */
    const quiet = tx.ran === 1 && tx.none && (origin === "user" || origin === "system");
    const mode: HistoryMode = asked !== "auto" ? asked : tx.whole ? "whole" : quiet ? "none" : "auto";
    /* a run of changes that each cross the whole document (one style edited) joins as one step of the whole document */
    this.commit(start, mode, origin, label, tx.whole);
    return value;
  }

  /** runs one operation as one change and returns what it reports (new ids, counts) */
  run<A, R>(o: Op<A, R>, args: A, opts: TxOptions & { origin?: Origin; label?: string } = {}): R {
    const label = opts.label ?? o.label?.(args) ?? o.name;
    return this.transact(label, opts.origin ?? "user", (tx) => tx.run(o, args), opts);
  }

  /** a change with no step of its own: it belongs to the step before (a layout pass, a drag in progress) */
  update(label: string, origin: Origin, fn: (s: CoreState) => CoreState) {
    this.transact(label, origin, (tx) => tx.set(fn), { history: "none" });
  }

  private commit(start: CoreState, mode: HistoryMode, origin: Origin, label: string, whole = false) {
    if (mode !== "none") {
      if (typeof mode === "object") this.coalesced(start, mode.coalesce, label, origin, whole);
      else this.step(start, mode === "whole" || (mode === "auto" && crossesDoc(start, this.state)), label, origin);
    }
    if (start === this.state && mode === "none") return;
    this.emit(start, start === this.state ? "history" : "edit", origin, label);
  }

  /** Takes a step now, from the state as it is: what a gesture does before it starts changing things (a drag, a
   *  size handle). With `coalesce`, only when the last step was not the same key a moment ago. With `from`, the step
   *  keeps a state the store was in a moment ago: what an agent's turn of many changes, each run with no step of its
   *  own, leaves behind once its first change has landed. Returns whether a step was taken. */
  checkpoint(label: string, o: { whole?: boolean; coalesce?: string; origin?: Origin; from?: CoreState } = {}): boolean {
    const origin = o.origin ?? "user";
    const before = this.past.length;
    const from = o.from ?? this.state;
    if (o.coalesce !== undefined) this.coalesced(from, o.coalesce, label, origin);
    else this.step(from, !!o.whole, label, origin);
    this.emit(this.state, "history", origin, label);
    return this.past.length !== before || !o.coalesce;
  }

  private coalesced(from: CoreState, key: string, label: string, origin: Origin, whole = false) {
    const now = this.options.now();
    const last = this.last;
    if (last.key !== key || now - last.at > COALESCE_MS) this.step(from, whole, label, origin);
    this.last = { key, at: now };
  }

  private step(from: CoreState, whole: boolean, label: string, origin: Origin) {
    this.last = { key: "", at: 0 };
    /* a whole document going is a step of the document's history, even from inside a definition, whose own ends with it */
    if (whole && this.stash) {
      this.past = this.stash.past;
      this.stash.future = [];
    }
    this.past.push({ snap: snapshotOf(from, whole), label, origin, seq: ++this.seq });
    this.stepped = true;
    if (this.past.length > HISTORY_MAX) this.past.shift();
    this.future = [];
  }

  /* ---------- undo ---------- */

  /** Takes the last step back; its label, or null when there was none. With `forget`, the step is gone for good,
   *  not waiting to be redone: what a stopped agent turn did is discarded, not undone. */
  undo(origin: Origin = "user", o: { forget?: boolean } = {}): string | null {
    if (this.tx) throw new OpError("busy", "undo inside a transaction");
    const prev = this.past.pop();
    if (!prev) return null;
    /* a whole document's step taken back from inside a definition ends the definition: the steps of its own waiting
       to be redone were steps of a screen that is no longer there, and would put its parts on the document's */
    if (prev.snap.meta && this.stash) this.future = [];
    if (!o.forget) this.future.push({ snap: snapshotOf(this.state, !!prev.snap.meta), label: prev.label, origin: prev.origin, seq: ++this.seq });
    this.restore(prev, "undo", origin);
    return prev.label;
  }

  /** Forgets every step, done and undone: what comes next starts the history afresh (a document read again after
   *  another program changed it, whose earlier states are no longer this session's to bring back). */
  clearHistory(origin: Origin = "system") {
    if (this.tx) throw new OpError("busy", "the history cannot be cleared inside a transaction");
    if (!this.past.length && !this.future.length && !this.stash) return;
    this.past = [];
    this.future = [];
    if (this.stash) this.stash = { ...this.stash, past: [], future: [] };
    this.last = { key: "", at: 0 };
    this.emit(this.state, "history", origin, "Clear history");
  }

  /** The number of the last step taken: a step taken after this moment has a larger `seq`. */
  historySeq = (): number => this.seq;

  /** Rewrites the steps taken after `since` (a `historySeq()`), done and undone alike, those of a definition open
   *  for editing included: `fn` gives each its snapshot again, or null to forget it. What an agent's turn that was
   *  stopped leaves behind: its own steps gone, and the author's steps taken meanwhile without its changes in them,
   *  so neither undo nor redo brings back what it was stopped from doing. Nothing in the document changes. */
  rebaseHistory(since: number, fn: (e: { snap: Snapshot; label: string; origin: Origin; seq: number }) => Snapshot | null) {
    if (this.tx) throw new OpError("busy", "the history cannot be rewritten inside a transaction");
    const rebase = (list: HistoryEntry[]) =>
      list.flatMap((e) => {
        if (e.seq === undefined || e.seq <= since) return [e];
        const snap = fn({ snap: e.snap, label: e.label, origin: e.origin, seq: e.seq });
        return snap ? [snap === e.snap ? e : { ...e, snap }] : [];
      });
    this.past = rebase(this.past);
    this.future = rebase(this.future);
    if (this.stash) {
      const st = this.stash;
      const before = st.seq !== undefined && st.seq > since ? fn({ snap: st.before, label: "Edit component", origin: "user", seq: st.seq }) : st.before;
      this.stash = { ...st, past: rebase(st.past), future: rebase(st.future), before: before ?? st.before };
    }
    this.last = { key: "", at: 0 };
    this.emit(this.state, "history", "system", "Rewrite history");
  }

  /** takes the last step undone again; its label, or null */
  redo(origin: Origin = "user"): string | null {
    if (this.tx) throw new OpError("busy", "redo inside a transaction");
    const next = this.future.pop();
    if (!next) return null;
    this.past.push({ snap: snapshotOf(this.state, !!next.snap.meta), label: next.label, origin: next.origin, seq: ++this.seq });
    this.restore(next, "redo", origin);
    return next.label;
  }

  private restore(e: HistoryEntry, kind: "undo" | "redo", origin: Origin) {
    const prev = this.state;
    this.last = { key: "", at: 0 };
    if (e.snap.meta && this.stash) {
      /* a whole document coming back ends the editing of a definition of the one it replaces */
      this.stash = null;
    }
    this.state = restoreSnapshot(this.state, e.snap, this.pinMode);
    this.emit(prev, kind, origin, e.label, !!e.snap.meta);
  }

  /* ---------- whole documents ---------- */

  /** The canvas's mode kept whatever a document says (a phone edits screens only); null lets documents say. */
  pinFrameMode(mode: FrameMode | null) {
    this.pinMode = mode;
  }

  /** Puts a stored document into the state with no step: fields it leaves out keep their value, or go back to their
   *  default when `reset`. What the editor does with the copy it saved itself. */
  load(doc: Partial<Doc>, reset = false, origin: Origin = "system") {
    const prev = this.state;
    if (this.stash) {
      this.past = this.stash.past;
      this.future = this.stash.future;
      this.stash = null;
    }
    this.state = loadInto(this.state, doc, reset);
    this.emit(prev, "replace", origin, "Load", true);
  }

  /** Opens a whole document over the one there, as one step an undo takes back: a file, a shared link, a draft.
   *  Anything that is not a document (lib/project.ts `openProject`) is refused unless `trusted`, which says it has
   *  already been through it. Returns the document that came in. */
  replace(value: unknown, o: { origin?: Origin; trusted?: boolean; label?: string } = {}): Doc {
    if (this.tx) throw new OpError("busy", "a document cannot be replaced inside a transaction");
    const doc = o.trusted ? (value as Doc) : openProject(value);
    if (!doc) throw new OpError("invalid_value", "That is not an M3E Canvas project.");
    const origin = o.origin ?? "user";
    const label = o.label ?? "Open project";
    const prev = this.state;
    this.step(this.state, true, label, origin);
    if (this.stash) {
      this.past = this.stash.past;
      this.future = this.stash.future;
      this.stash = null;
    }
    const loaded = loadInto(this.state, doc, true);
    const mode: FrameMode = this.pinMode ?? (doc.frame === "blank" ? "blank" : "phone");
    this.state = { ...loaded, doc: { ...loaded.doc, frame: mode }, session: { selection: [], frameId: null, widths: {} } };
    this.last = { key: "", at: 0 };
    this.emit(prev, "replace", origin, label, true);
    return doc;
  }

  /* ---------- definitions ---------- */

  /** the definition open for editing, if one is */
  editingId = (): string | null => this.state.editing?.id ?? null;

  /** Opens a definition as the one screen of the canvas. The document's screens and its history wait until it is
   *  closed; while it is open every tool works on it as on any screen. */
  openDefinition(id: string, origin: Origin = "user"): void {
    if (this.tx) throw new OpError("busy", "a definition cannot be opened inside a transaction");
    const def = this.state.doc.components?.find((c) => c.id === id);
    if (!def) throw new OpError("not_found", `There is no component ${id}.`, id);
    if (this.state.editing?.id === id) return;
    if (this.state.editing) this.closeDefinition(origin);
    const prev = this.state;
    const s = this.state;
    this.stash = { past: this.past, future: this.future, before: snapshotOf(s, false), selection: s.session.selection, seq: ++this.seq };
    this.past = [];
    this.future = [];
    this.state = {
      ...s,
      doc: { ...s.doc, groups: def.groups.map((g) => ({ ...g, x: g.x + DEF_INSET, y: g.y + DEF_INSET })), frames: [definitionScreen(def)], frame: "phone" },
      editing: { id, main: { groups: s.doc.groups, frames: s.doc.frames, mode: s.doc.frame } },
      session: { ...s.session, selection: [], frameId: null },
    };
    this.emit(prev, "edit", origin, "Edit component");
  }

  /** Closes the definition being edited: the document comes back, with its instances following. One undo takes it
   *  all back, when anything changed. */
  closeDefinition(origin: Origin = "user"): void {
    if (this.tx) throw new OpError("busy", "a definition cannot be closed inside a transaction");
    const editing = this.state.editing;
    if (!editing) return;
    const prev = this.state;
    const s = this.state;
    const stash = this.stash;
    const was = s.doc.components?.find((c) => c.id === editing.id);
    const done = was && definitionFrom(was, s.doc.groups, s.session.widths);
    /* its name, or the data, may have changed from the tabs while it was open, as much as its parts */
    const rest = (list: ComponentDef[] | undefined) => JSON.stringify(list?.map((c) => (c.id === editing.id ? { id: c.id, name: c.name, props: c.props, set: c.set, variant: c.variant } : c)));
    const changed =
      !!stash &&
      !!was &&
      !!done &&
      (JSON.stringify(done.groups) !== JSON.stringify(was.groups) ||
        rest(s.doc.components) !== rest(stash.before.components) ||
        JSON.stringify(s.doc.componentSets) !== JSON.stringify(stash.before.componentSets) ||
        JSON.stringify(s.doc.collections) !== JSON.stringify(stash.before.collections));
    const components = done ? s.doc.components?.map((c) => (c.id === editing.id ? done : c)) : s.doc.components;
    this.state = {
      ...s,
      doc: { ...s.doc, groups: editing.main.groups, frames: editing.main.frames, frame: editing.main.mode, ...(components ? { components } : {}) },
      editing: null,
      session: { ...s.session, selection: stash?.selection ?? [], frameId: null },
    };
    if (stash) {
      this.past = changed ? [...stash.past, { snap: stash.before, label: "Edit component", origin, seq: stash.seq }] : stash.past;
      this.future = changed ? [] : stash.future;
    }
    this.stash = null;
    this.last = { key: "", at: 0 };
    this.emit(prev, "edit", origin, "Edit component");
  }

  /* ---------- language ---------- */

  /** The editor's language changed: the seed words of the parts, the default names of the screens and the steps of
   *  the history follow it. Nobody's change, so no step. */
  translate(lang: Lang, origin: Origin = "user") {
    const prev = this.state;
    const s = this.state;
    const theme: Theme = s.doc.theme;
    /* read against the document's own styles, as everything that reads its theme is */
    withDocStyles(s.doc.styles, () => {
      const translated = translateSnapshot({ groups: s.doc.groups, frames: s.doc.frames }, lang, theme);
      const components = s.doc.components?.map((c) => ({ ...c, groups: translateSnapshot({ groups: c.groups, frames: [] }, lang, theme).groups }));
      this.state = { ...s, doc: { ...s.doc, groups: translated.groups, frames: translated.frames, ...(components ? { components } : {}) } };
      this.past = this.past.map((e) => ({ ...e, snap: translateSnapshot(e.snap, lang, theme) }));
      this.future = this.future.map((e) => ({ ...e, snap: translateSnapshot(e.snap, lang, theme) }));
    });
    this.emit(prev, "edit", origin, "Language");
  }

  /* ---------- session ---------- */

  private session(patch: Partial<CoreState["session"]>, label: string) {
    const prev = this.state;
    const cur = prev.session;
    if (Object.entries(patch).every(([k, v]) => (cur as Record<string, unknown>)[k] === v)) return;
    this.state = { ...prev, session: { ...cur, ...patch } };
    this.emit(prev, "session", "user", label);
  }

  /** the selected parts, by item id */
  select = (ids: string[] | ((cur: string[]) => string[])) => this.session({ selection: typeof ids === "function" ? ids(this.state.session.selection) : ids }, "Select");
  /** the selected screen */
  selectFrame = (id: string | null | ((cur: string | null) => string | null)) => this.session({ frameId: typeof id === "function" ? id(this.state.session.frameId) : id }, "Select screen");
  /** the sizes the canvas measured */
  setWidths = (widths: CoreState["session"]["widths"] | ((cur: CoreState["session"]["widths"]) => CoreState["session"]["widths"])) =>
    this.session({ widths: typeof widths === "function" ? widths(this.state.session.widths) : widths }, "Measure");
}

const defaultId = () => Math.random().toString(36).slice(2, 10);

/** an id source for deterministic runs: `prefix1`, `prefix2`… */
export const counterIds = (prefix = "n") => {
  let n = 0;
  return () => `${prefix}${++n}`;
};
