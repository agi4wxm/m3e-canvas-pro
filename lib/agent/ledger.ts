/* What one turn of the agent changed, kept apart from what the author (or an MCP client) changed while it ran, so that
 * the turn alone can be taken back. The editor does not lock the canvas while the agent works: the author may edit
 * between its calls. Undoing the turn's last history step, or putting back the document as it was before the turn,
 * would either leave earlier changes of the turn in place or take the author's edits away with it.
 *
 * The ledger listens to the store from the start of the turn. Changes the turn made itself (origin `ai`) form runs;
 * a change of the author's, or a step the author took, ends a run. The editor's own upkeep that follows a change (a
 * layout pass, origin `system`) belongs to the run before it. Each run of the turn is a patch over the document's
 * pieces: screens, groups of parts, definitions, collections, variables, styles, icons and the other fields, each by
 * id. Taking the turn back applies the patches in reverse:
 * - a piece the author did not touch after the turn changed it goes back to what it was;
 * - a piece the author changed afterwards stays as they left it (a conflict, reported), unless they changed it back;
 * - a piece the turn added that something of the author's now uses (a part they put in its container, a part on its
 *   screen, a reference by id) stays too, reported as used.
 * The history is rewritten with it (DocStore.rebaseHistory): the turn's own steps go, and the author's steps taken
 * meanwhile lose the turn's changes, so undo and redo bring back neither. What the author sees is said precisely:
 * all of it taken back, part of it (and what stayed and why), or none. */

import { savedDoc, type ChangeEvent, type CoreState, type DocStore, type Snapshot } from "../core";
import { frameOfPart, type Doc, type Group } from "../tokens";
import { labelOfPart } from "../../parts/resize";
import { partBySlug } from "../../parts/registry";

const LISTS = ["groups", "frames", "components", "componentSets", "collections", "vars", "varCollections", "styles"] as const;
type List = (typeof LISTS)[number];
/** what a step of the canvas's own keeps (a snapshot without `meta`) */
const SNAPSHOT_LISTS = new Set<string>(["groups", "frames", "components", "componentSets", "collections"]);

type Rec = Record<string, unknown>;
/** a document as its pieces: `list:id`, `icons:id` and `field:name`, with each list's order */
type Pieces = { map: Map<string, unknown>; order: Record<List, string[]> };
type Change = { before: unknown; after: unknown };

const listOf = (key: string) => key.slice(0, key.indexOf(":"));
const idOfKey = (key: string) => key.slice(key.indexOf(":") + 1);

function piecesOf(doc: Rec): Pieces {
  const map = new Map<string, unknown>();
  const order = {} as Record<List, string[]>;
  for (const l of LISTS) {
    order[l] = [];
    const arr = Array.isArray(doc[l]) ? (doc[l] as Rec[]) : [];
    for (const x of arr) {
      const id = String(l === "styles" ? x.key : x.id);
      map.set(`${l}:${id}`, x);
      order[l].push(id);
    }
  }
  const icons = doc.icons && typeof doc.icons === "object" ? (doc.icons as Record<string, string>) : {};
  for (const [id, svg] of Object.entries(icons)) map.set(`icons:${id}`, svg);
  for (const [f, v] of Object.entries(doc)) if (!(LISTS as readonly string[]).includes(f) && f !== "icons" && v !== undefined) map.set(`field:${f}`, v);
  return { map, order };
}

/** JSON with every object's keys in order: two equal values read the same however they were built */
function stable(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v as Rec)
    .filter((k) => (v as Rec)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable((v as Rec)[k])}`)
    .join(",")}}`;
}

/** Whether two values of a piece are the same, apart from where a layout put it: a group placed by its container's
 *  auto layout moves whenever something before it changes, which is nobody's edit. */
function same(key: string, a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (listOf(key) === "groups") {
    const ga = a as Group;
    const gb = b as Group;
    if (ga.inFlow && gb.inFlow) return stable({ ...ga, x: 0, y: 0 }) === stable({ ...gb, x: 0, y: 0 });
  }
  return stable(a) === stable(b);
}

/** the pieces two documents differ in, each with what it was and what it became */
function diff(a: Pieces, b: Pieces): Map<string, Change> {
  const out = new Map<string, Change>();
  for (const [key, va] of a.map) {
    const vb = b.map.get(key);
    if (va !== vb && !same(key, va, vb)) out.set(key, { before: va, after: vb });
  }
  for (const [key, vb] of b.map) if (!a.map.has(key)) out.set(key, { before: undefined, after: vb });
  return out;
}

/** the ids two lists share, in the order of the first */
const common = (a: string[], b: string[]) => {
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
};
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** one run of changes: the turn's own, or the author's */
type Run = {
  own: boolean;
  from: Rec;
  to: Rec;
  /** the first and the last change it holds, by their place among every change the ledger saw */
  first: number;
  last: number;
  /** the author's: the pieces they changed (not what a layout pass after them moved) */
  touched: Set<string>;
  /** the turn's: what it changed, worked out once the run is over */
  patch?: Map<string, Change>;
  /** the lists whose order it changed, with the order before and after */
  orders?: Map<List, { before: string[]; after: string[] }>;
  /** the order of every list when it began */
  fromOrder?: Record<List, string[]>;
};

/** one piece of the turn's that was not taken back, and why: the author changed it afterwards, or uses it */
export type Kept = { key: string; kind: string; id: string; name: string; why: "edited" | "used" | "open" };

/** what taking the turn back did */
export type RevertReport = {
  /** `full`: everything the turn changed was taken back; `partial`: some of it, `kept` lists what stayed; `kept`:
   *  none of it could be; `none`: it had changed nothing; `unavailable`: another document was opened meanwhile */
  outcome: "full" | "partial" | "kept" | "none" | "unavailable";
  /** how many pieces the turn changed, and how many of them went back */
  total: number;
  reverted: number;
  kept: Kept[];
  /** the author changed something while the turn ran (and it stays) */
  authorEdited: boolean;
};

type Plan = { doc: Rec; changed: Set<string>; reverted: Set<string>; kept: Kept[]; total: number };

export class TurnLedger {
  private runs: Run[] = [];
  private cur: Run | null = null;
  private marks: number[] = [];
  private broken = false;
  private off: (() => void) | null;
  /** the history's place when the turn began: steps after it are rewritten when the turn is taken back */
  readonly since: number;
  private start: Rec;

  constructor(private store: DocStore) {
    this.since = store.historySeq();
    this.start = savedDoc(store.get()) as unknown as Rec;
    this.off = store.subscribe((e) => {
      /* a change the ledger cannot read leaves the turn unable to be taken back, never the store unable to change */
      try {
        this.seen(e);
      } catch {
        this.broken = true;
        this.cur = null;
      }
    });
  }

  /** stops listening: what changes after this is no part of the turn */
  close() {
    this.off?.();
    this.off = null;
    this.cur = null;
  }

  /** whether the turn has changed anything of its own so far */
  get changed() {
    return this.runs.some((r) => r.own);
  }

  /** whether the author (or a client) changed anything while the turn ran */
  get authorEdited() {
    return this.runs.some((r) => !r.own && r.touched.size > 0);
  }

  private seen(e: ChangeEvent) {
    const i = this.marks.length;
    this.marks.push(this.store.historySeq());
    if (e.kind === "session") return;
    if (e.kind === "replace") {
      this.broken = true;
      this.cur = null;
      return;
    }
    const own = e.origin === "ai" && (e.kind === "edit" || e.kind === "history");
    if (e.kind === "history") {
      /* a step of the author's ends a run of the turn's: what it keeps is the document as it stands */
      if (!own && this.cur?.own) this.cur = null;
      return;
    }
    if (e.state.doc === e.prev.doc && e.state.editing === e.prev.editing) return;
    const to = savedDoc(e.state) as unknown as Rec;
    if (e.origin === "system" && e.kind === "edit") {
      /* upkeep belongs to the change before it */
      if (this.cur) this.grow(this.cur, to, i);
      return;
    }
    if (own) {
      if (this.cur?.own) this.grow(this.cur, to, i);
      else this.runs.push((this.cur = { own: true, from: savedDoc(e.prev) as unknown as Rec, to, first: i, last: i, touched: new Set() }));
      return;
    }
    const from = savedDoc(e.prev) as unknown as Rec;
    if (!this.cur || this.cur.own) this.runs.push((this.cur = { own: false, from, to, first: i, last: i, touched: new Set() }));
    else this.grow(this.cur, to, i);
    for (const key of diff(piecesOf(from), piecesOf(to)).keys()) this.cur.touched.add(key);
  }

  /** a run goes on: what was worked out of it so far is out of date */
  private grow(r: Run, to: Rec, i: number) {
    r.to = to;
    r.last = i;
    r.patch = undefined;
    r.orders = undefined;
  }

  private patched(r: Run) {
    if (r.patch) return r;
    const a = piecesOf(r.from);
    const b = piecesOf(r.to);
    r.patch = diff(a, b);
    r.orders = new Map();
    for (const l of LISTS) {
      const before = common(a.order[l], b.order[l]);
      const after = common(b.order[l], a.order[l]);
      if (!sameOrder(before, after)) r.orders.set(l, { before, after });
    }
    return r;
  }

  /** the pieces the author changed after the run at `index` */
  private touchedAfter(index: number): Set<string> {
    const out = new Set<string>();
    for (const r of this.runs.slice(index + 1)) if (!r.own) for (const k of r.touched) out.add(k);
    return out;
  }

  /** What taking the turn back would make of `doc`: every run of the turn's undone, last first, under the rules above. */
  private plan(doc: Rec, editingId: string | null): Plan {
    const p = piecesOf(doc);
    const changed = new Set<string>();
    const reverted = new Set<string>();
    const all = new Set<string>();
    const keptMap = new Map<string, Kept>();
    const set = (key: string, v: unknown) => {
      if (v === undefined) p.map.delete(key);
      else p.map.set(key, v);
      changed.add(key);
    };
    const keep = (key: string, why: Kept["why"], v: unknown) => keptMap.set(key, { key, why, ...this.named(key, v ?? doc) });
    const added = new Set<string>();
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      if (!run.own) continue;
      this.patched(run);
      const later = this.touchedAfter(i);
      for (const [key, c] of run.patch!) {
        all.add(key);
        const now = p.map.get(key);
        if (editingId && key === `components:${editingId}`) {
          keep(key, "open", now ?? c.after);
          continue;
        }
        if (!later.has(key) || same(key, now, c.after)) {
          set(key, c.before);
          reverted.add(key);
          keptMap.delete(key);
          if (c.before === undefined) added.add(key);
          else added.delete(key);
        } else if (!same(key, now, c.before)) keep(key, "edited", now);
        else reverted.add(key);
      }
      for (const [l, o] of run.orders!) {
        /* the order goes back too, when nobody reordered those pieces since */
        const present = new Set(p.order[l]);
        const moved = new Set(o.after);
        const now = p.order[l].filter((id) => moved.has(id));
        const want = o.before.filter((id) => present.has(id));
        if (!sameOrder(now, o.after.filter((id) => present.has(id))) || sameOrder(now, want)) continue;
        let at = 0;
        p.order[l] = p.order[l].map((id) => (moved.has(id) ? want[at++] : id));
        changed.add(`order:${l}`);
      }
    }
    /* what the turn added and something of the author's uses stays, with whatever it in turn uses */
    const authors = new Set<string>();
    for (const r of this.runs) if (!r.own) for (const k of r.touched) if (p.map.has(k) && !reverted.has(k)) authors.add(k);
    const frames = () => [...p.map.entries()].filter(([k]) => listOf(k) === "frames").map(([, v]) => v) as Doc["frames"];
    const groups = () => [...p.map.entries()].filter(([k]) => listOf(k) === "groups").map(([, v]) => v as Group);
    const users = new Set(authors);
    for (let pass = 0; pass < 8 && added.size; pass++) {
      let more = false;
      const texts = [...users].map((k) => stable(p.map.get(k)));
      for (const key of added) {
        /* named by its id, or (a group) by the id of a part in it */
        const v0 = this.lastValue(key);
        const ids = [idOfKey(key), ...(listOf(key) === "groups" ? ((v0 as Group | undefined)?.items ?? []).map((it) => it.id) : [])].map((x) => JSON.stringify(x));
        let used = texts.some((t) => ids.some((id) => t.includes(id)));
        if (!used && listOf(key) === "frames") {
          /* a part of the author's standing on a screen the turn added */
          const was = this.lastValue(key);
          const gs = groups();
          used = [...users].some((u) => listOf(u) === "groups" && p.map.has(u) && frameOfPart(p.map.get(u) as Group, gs, [...frames(), was as Doc["frames"][number]], {})?.id === idOfKey(key));
        }
        if (!used) continue;
        const v = this.lastValue(key);
        p.map.set(key, v);
        if (!p.order[listOf(key) as List]?.includes(idOfKey(key)) && (LISTS as readonly string[]).includes(listOf(key))) p.order[listOf(key) as List].push(idOfKey(key));
        reverted.delete(key);
        added.delete(key);
        keep(key, "used", v);
        users.add(key);
        more = true;
      }
      if (!more) break;
    }
    return { doc: this.rebuilt(doc, p, changed), changed, reverted, kept: [...keptMap.values()].filter((x) => !reverted.has(x.key)), total: all.size };
  }

  /** what a piece of the turn's last was, as the turn left it */
  private lastValue(key: string): unknown {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      if (r.own && r.patch?.has(key)) return r.patch.get(key)!.after;
    }
    return undefined;
  }

  /** a piece in words: what kind it is and what it is called */
  private named(key: string, v: unknown): { kind: string; id: string; name: string } {
    const kind = listOf(key);
    const id = idOfKey(key);
    const x = (v ?? {}) as Rec;
    if (kind === "groups") {
      const g = v as Group | undefined;
      const it = g?.items?.[0];
      const words = [it?.props?.text, it?.props?.label, it?.props?.title].find((x): x is string => typeof x === "string" && !!x.trim());
      const label = g?.name || words?.slice(0, 40) || (it ? labelOfPart(partBySlug(it.component), it.props) || partBySlug(it.component)?.name || it.component : undefined);
      return { kind: "part", id, name: String(label || id) };
    }
    if (kind === "field") return { kind: "field", id, name: id };
    if (kind === "icons") return { kind: "icon", id, name: `svg:${id}` };
    return { kind: kind.replace(/s$/, ""), id, name: String(x.name || x.key || id) };
  }

  /** `doc` with the planned pieces written in, everything else as it was (the same objects) */
  private rebuilt(doc: Rec, p: Pieces, changed: Set<string>): Rec {
    const out: Rec = { ...doc };
    const lists = new Set([...changed].map((k) => (k.startsWith("order:") ? k.slice(6) : listOf(k))));
    for (const l of LISTS) {
      if (!lists.has(l)) continue;
      const ids = p.order[l].filter((id) => p.map.has(`${l}:${id}`));
      const placed = new Set(ids);
      for (const [key] of p.map) {
        if (listOf(key) !== l || placed.has(idOfKey(key))) continue;
        /* a piece that comes back goes after the one it followed before it went, or first */
        const id = idOfKey(key);
        const ref = this.orderWith(l, id);
        const at = ref.indexOf(id);
        const before = at < 0 ? undefined : ref.slice(0, at).reverse().find((x) => placed.has(x));
        ids.splice(before === undefined ? (at < 0 ? ids.length : 0) : ids.indexOf(before) + 1, 0, id);
        placed.add(id);
      }
      const arr = ids.map((id) => p.map.get(`${l}:${id}`));
      if (arr.length || Array.isArray(this.start[l])) out[l] = arr;
      else delete out[l];
    }
    if (lists.has("icons")) {
      const icons = Object.fromEntries([...p.map.entries()].filter(([k]) => listOf(k) === "icons").map(([k, v]) => [idOfKey(k), v]));
      if (Object.keys(icons).length || doc.icons !== undefined) out.icons = icons;
      else delete out.icons;
    }
    for (const key of changed) {
      if (listOf(key) !== "field") continue;
      const v = p.map.get(key);
      if (v === undefined) delete out[idOfKey(key)];
      else out[idOfKey(key)] = v;
    }
    return out;
  }

  /** a list's order as a run of the turn's found it, the first that still had this piece */
  private orderWith(l: List, id: string): string[] {
    for (const r of this.runs) {
      if (!r.own) continue;
      const order = (r.fromOrder ??= piecesOf(r.from).order)[l];
      if (order.includes(id)) return order;
    }
    return [];
  }

  /** The author's work as it stands: the document with the turn's own changes taken out, what the author changed
   *  meanwhile kept. What the agent's guard counts a removal against (guard.ts). */
  baseline(): Doc {
    const now = savedDoc(this.store.get()) as unknown as Rec;
    if (!this.changed || this.broken) return now as unknown as Doc;
    return this.plan(now, null).doc as unknown as Doc;
  }

  /** Takes the turn's own changes back, keeping the author's, and rewrites the history so that nothing of the turn
   *  comes back: its steps (`label`, origin ai) are forgotten and the author's steps taken meanwhile lose its changes.
   *  Stops listening. */
  revert(label: string): RevertReport {
    this.close();
    const authorEdited = this.authorEdited;
    if (this.broken) return { outcome: "unavailable", total: 0, reverted: 0, kept: [], authorEdited };
    const s = this.store.get();
    const editingId = s.editing?.id ?? null;
    const plan = this.plan(savedDoc(s) as unknown as Rec, editingId);
    if (plan.changed.size) this.store.transact(`${label} (stopped)`, "ai", (tx) => tx.set((st) => this.written(st, plan)), { history: "none" });
    this.store.rebaseHistory(this.since, (e) => (e.origin === "ai" && e.label === label ? null : this.rebased(e.snap, e.seq, plan)));
    const reverted = [...plan.reverted].length;
    const outcome: RevertReport["outcome"] = !plan.total ? "none" : !plan.kept.length ? "full" : reverted ? "partial" : "kept";
    return { outcome, total: plan.total, reverted, kept: plan.kept, authorEdited };
  }

  /** the state with the planned document written in; while a definition is open, the document's screens wait in it */
  private written(st: CoreState, plan: Plan): CoreState {
    const next = plan.doc as unknown as Doc;
    const doc = { ...st.doc } as Rec;
    let editing = st.editing;
    const touched = new Set([...plan.changed].map((k) => (k.startsWith("order:") ? k.slice(6) : listOf(k) === "field" ? `field:${idOfKey(k)}` : listOf(k))));
    for (const l of touched) {
      if (l === "groups" || l === "frames") {
        if (editing) editing = { ...editing, main: { ...editing.main, [l]: next[l] ?? [] } };
        else doc[l] = next[l] ?? [];
      } else if (l === "components" && editing) {
        const open = (st.doc.components ?? []).find((c) => c.id === editing!.id);
        doc.components = (next.components ?? []).map((c) => (c.id === editing!.id && open ? open : c));
      } else if (l === "field:frame" && editing) editing = { ...editing, main: { ...editing.main, mode: next.frame } };
      else if (l.startsWith("field:")) {
        const f = l.slice(6);
        if ((next as Rec)[f] === undefined) delete doc[f];
        else doc[f] = (next as Rec)[f];
      } else if ((next as Rec)[l] === undefined) delete doc[l];
      else doc[l] = (next as Rec)[l];
    }
    const ids = new Set(((editing ? st.doc.groups : (doc.groups as Group[])) ?? []).flatMap((g) => g.items.map((it) => it.id)));
    const selection = st.session.selection.filter((id) => ids.has(id));
    return { ...st, doc: doc as CoreState["doc"], editing, session: selection.length === st.session.selection.length ? st.session : { ...st.session, selection } };
  }

  /** A step of the history without the turn's changes in it: only the runs that came before the step was taken, and
   *  only what the plan took back, where the step still holds what the turn left. */
  private rebased(snap: Snapshot, seq: number, plan: Plan): Snapshot {
    const at = this.marks.findIndex((m) => m >= seq);
    const upTo = at < 0 ? Infinity : at;
    const doc: Rec = snap.meta ? { ...snap.meta, groups: snap.groups, frames: snap.frames } : { groups: snap.groups, frames: snap.frames, components: snap.components, componentSets: snap.componentSets, collections: snap.collections };
    const inScope = (key: string) => !!snap.meta || SNAPSHOT_LISTS.has(listOf(key));
    const p = piecesOf(doc);
    const changed = new Set<string>();
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      if (!run.own || run.last >= upTo) continue;
      this.patched(run);
      for (const [key, c] of run.patch!) {
        if (!plan.reverted.has(key) || !inScope(key) || !same(key, p.map.get(key), c.after)) continue;
        if (c.before === undefined) p.map.delete(key);
        else p.map.set(key, c.before);
        changed.add(key);
      }
    }
    if (!changed.size) return snap;
    const out = this.rebuilt(doc, p, changed);
    if (snap.meta) {
      const { groups, frames, ...meta } = out as unknown as Doc;
      return { groups, frames, components: meta.components, componentSets: meta.componentSets, collections: meta.collections, meta };
    }
    return { groups: (out.groups as Group[]) ?? [], frames: (out.frames as Doc["frames"]) ?? [], components: out.components as Snapshot["components"], componentSets: out.componentSets as Snapshot["componentSets"], collections: out.collections as Snapshot["collections"] };
  }
}
