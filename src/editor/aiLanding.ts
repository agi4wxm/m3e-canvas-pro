/* Where an answer of the author's own model lands (useAi.ts): a screen's description, a part's behaviour note, a
 * scene's painted picture. The answer comes back seconds later, and meanwhile the author may have edited that field,
 * deleted the part (and made another under the same id), or opened another document or draft. So each request takes
 * a ticket: the document's generation, the target's id and what its fields held. The answer lands only on that same
 * target with its fields as they were; otherwise it is set aside for the author to apply or leave, and never written
 * over what they did. A newer request about the same target supersedes an older one. */

import type { ChangeEvent, CoreState, DocStore } from "@/lib/core";
import type { Frame, Item } from "@/lib/tokens";

export type AnswerTarget = { kind: "screen" | "part"; id: string };

/** what an answer may do: land, wait for the author (they edited the field), or go (its target is gone, or a newer
 *  request about it was made) */
export type Landing = "land" | "edited" | "gone" | "superseded";

export type Ticket = { readonly no: number; readonly target: AnswerTarget };

type Open = Ticket & { gen: number; was: string; read: (s: CoreState) => unknown; lost: boolean };

/** the screen with this id, as the canvas shows it */
export const screenIn = (s: CoreState, id: string): Frame | undefined => s.doc.frames.find((f) => f.id === id);
/** the part with this id, as the canvas shows it */
export const partIn = (s: CoreState, id: string): Item | undefined => {
  for (const g of s.doc.groups) for (const it of g.items) if (it.id === id) return it;
  return undefined;
};
const exists = (s: CoreState, t: AnswerTarget) => (t.kind === "screen" ? !!screenIn(s, t.id) : !!partIn(s, t.id));

const stable = (v: unknown): string => {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
};

/** the most answers kept waiting for the author at once; older ones are let go */
const KEPT = 20;

export class AnswerDesk {
  private gen = 0;
  private no = 0;
  private open = new Map<number, Open>();
  /** the newest ticket about each target */
  private newest = new Map<string, number>();
  private off: () => void;

  constructor(private store: DocStore) {
    this.off = store.subscribe((e) => this.seen(e));
  }

  dispose() {
    this.off();
    this.open.clear();
  }

  private seen(e: ChangeEvent) {
    /* another document or draft: nothing asked about the one before is for it */
    if (e.kind === "replace") {
      this.gen++;
      return;
    }
    if (e.kind === "session" || (e.state.doc === e.prev.doc && e.state.editing === e.prev.editing)) return;
    /* gone once is gone: a part made again under the same id is another part */
    for (const t of this.open.values()) if (!t.lost && !exists(e.state, t.target)) t.lost = true;
  }

  /** A ticket for a request about `target`, remembering what `read` gives now: the fields the answer would replace. */
  take(target: AnswerTarget, read: (s: CoreState) => unknown): Ticket {
    const t: Open = { no: ++this.no, target, gen: this.gen, was: stable(read(this.store.get())), read, lost: !exists(this.store.get(), target) };
    this.open.set(t.no, t);
    this.newest.set(`${target.kind}:${target.id}`, t.no);
    if (this.open.size > KEPT) this.open.delete(this.open.keys().next().value!);
    return t;
  }

  /** where the answer to a ticket may go now */
  check(ticket: Ticket): Landing {
    const t = this.open.get(ticket.no);
    if (!t || t.gen !== this.gen || t.lost || !exists(this.store.get(), t.target)) return "gone";
    if (this.newest.get(`${t.target.kind}:${t.target.id}`) !== t.no) return "superseded";
    return stable(t.read(this.store.get())) === t.was ? "land" : "edited";
  }

  /** whether the target is still the one the request was about (an answer set aside may still be applied to it) */
  present(ticket: Ticket): boolean {
    const t = this.open.get(ticket.no);
    return !!t && t.gen === this.gen && !t.lost && exists(this.store.get(), t.target);
  }

  /** the answer has gone where it goes */
  close(ticket: Ticket) {
    this.open.delete(ticket.no);
  }
}
