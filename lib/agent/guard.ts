/* The guard on taking away the author's work. A call that removes much of it (clearing the canvas, whole screens,
 * many parts, a component or a data collection), or takes away what no removal's name says (a collection's rows
 * rewritten, modes or variables dropped, a custom style or a document icon replaced, a component's property gone:
 * lib/tools/removals.ts), is paused, and the author is asked in the chat panel, Allow or Don't, the way the MCP server
 * has the editor confirm a destructive call. Headless (the eval suite, a script) the caller's policy answers.
 * Declined, the call does not run and the model is told to keep the work and ask instead.
 *
 * A removal is measured by running the call on a scratch copy of the document and comparing with the author's work as
 * it stands (the document with the turn's own changes taken out, lib/agent/ledger.ts), so what the turn removed bit
 * by bit counts together, what the turn made itself is its own to change, and what the author added meanwhile is
 * theirs. A generative call is not run twice (it reaches a provider): what it would replace is read from its
 * arguments.
 *
 * What may go without asking is bound to exactly what goes: every screen, part, row, field, style… has a key
 * (`TakenKey`). An author's Allow covers the keys they were shown, nothing wider; a later call that takes more is asked
 * about again. A request that plainly asks for a removal ("delete the Settings screen") covers what it names, not
 * the whole turn, and a request that says not to remove ("don't delete anything") covers nothing. */

import { counterIds, DocStore, nodeTree, savedDoc, type CoreState, type TreeNode } from "../core";
import { executeTool, isDestructiveCall, type Registry, type ToolOutcome } from "../tools";
import { generativeTargets, takenTargets, takenText, type Taken, type TakenKey, type TakenTarget } from "../tools/removals";
import type { Doc } from "../tokens";
import { diffDocs, type Named } from "./diff";

/** what a call would take away, counted from the author's work as it stands */
export type RemovalAsk = {
  /** the tool that would do it */
  tool: string;
  screens: Named[];
  /** parts of the author's that would be gone (what a removed screen held included) */
  parts: number;
  components: Named[];
  collections: Named[];
  /** what else it takes away or replaces: rows, fields, modes, variables, a style, an icon, a component's property */
  takes: Taken[];
  /** exactly what would go, one key per thing: what the author's answer is bound to */
  keys: string[];
};

/** Asks the author whether a removal may go ahead: true to allow it. The signal aborts when the turn is stopped. */
export type ConfirmRemoval = (ask: RemovalAsk, signal?: AbortSignal) => boolean | Promise<boolean>;

/** how many parts a turn may take away without asking (rows of a list turned into cards, a header redone) */
export const PARTS_WITHOUT_ASKING = 10;

/** words that ask for a removal, in the four languages of the editor */
const REMOVE = /\b(delete|remove|clear|wipe|erase|get rid of|throw away|drop)\b|删|清空|清除|去掉|移除|拿掉|不要了|削除|消して|消す|消去|クリア|取り除|삭제|지워|지우|없애|비워/i;
/** words that ask for something to be made again: a removal in the same breath is a means, not the wish */
const REDO = /\b(redo|re-do|start over|from scratch|redesign|rebuild|remake|again)\b|重做|重新|重来|重画|重写|重新设计|再做|やり直|作り直|一から|다시|새로/i;
/** words that say not to remove, or to keep: "don't delete what is there", "不要删除现有内容", "消さないで" */
const KEEP =
  /\b(don'?t|do not|never|without|no need to|not to|stop)\s+(\w+\s+){0,2}(delete|remove|clear|wipe|erase|drop|touch)|\bkeep\b|不要(删|清|去掉|移除|拿掉|动)|别(删|清|去掉|移除|动)|不(删|清除|去掉|移除)|勿删|保留|削除しない|削除せず|消さない|消さず|残して|残す|삭제하지|지우지|없애지|남겨|유지/i;

/** Whether a request plainly asks for things to be taken away: it says so, does not say to keep them, and is not a
 *  wish for the work made anew ("it all looks bad, delete it and redo it" is the latter: a redesign can be built
 *  beside the old one). */
export function plainlyAsksToRemove(request: string): boolean {
  return REMOVE.test(request) && !KEEP.test(request) && !REDO.test(request);
}

/** Whether a request names this thing: one of its names (two characters or more; a Latin name as a whole word). */
export function namedIn(request: string, names: string[]): boolean {
  const text = request.toLowerCase();
  return names.some((raw) => {
    const n = raw.trim().toLowerCase();
    if (n.length < 2) return false;
    if (/^[\x20-\x7e]+$/.test(n)) return new RegExp(`(^|[^a-z0-9_])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9_])`).test(text);
    return text.includes(n);
  });
}

/** every part id at or under the given ones, in a tree of the document */
function under(doc: Doc, ids: string[]): Set<string> {
  const out = new Set<string>();
  const want = new Set(ids);
  const visit = (n: TreeNode, inside: boolean) => {
    const here = inside || want.has(n.id);
    if (here) out.add(n.id);
    n.children.forEach((c) => visit(c, here));
  };
  const tree = nodeTree(doc, {});
  for (const s of tree.screens) s.nodes.forEach((n) => visit(n, false));
  tree.loose.forEach((n) => visit(n, false));
  return out;
}

/** the screen each part was on, by part id, with the screen's names */
function screensOfParts(doc: Doc): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const tree = nodeTree(doc, {});
  for (const s of tree.screens) {
    const names = [s.id, s.name ?? ""];
    const visit = (n: TreeNode) => {
      out.set(n.id, names);
      n.children.forEach(visit);
    };
    s.nodes.forEach(visit);
  }
  return out;
}

/** What a call would take away of the author's work (`since`: the document the removal is counted against, the
 *  author's work as it stands), the parts the author selected left out (asked about, so theirs to lose), and what is
 *  `covered` already (allowed, or named by a plain request) left out too; null when what is left is not worth asking
 *  about. Throws when the check itself fails: that is never read as nothing taken. */
export async function removalOf(store: DocStore, since: Doc | CoreState, name: string, args: unknown, o: { registry: Registry; selection?: string[]; covered?: (k: TakenKey) => boolean }): Promise<RemovalAsk | null> {
  const t = o.registry.byName(name);
  if (!t || t.readOnly) return null;
  const before = ("session" in since ? savedDoc(since) : since) as Doc;
  const covered = o.covered ?? (() => false);
  const open = (keys: TakenKey[]) => keys.filter((x) => !covered(x));
  const none: RemovalAsk = { tool: name, screens: [], parts: 0, components: [], collections: [], takes: [], keys: [] };
  const takesOf = (targets: TakenTarget[]) => {
    const left = targets.map((x) => ({ taken: x.taken, keys: open(x.keys) })).filter((x) => x.keys.length);
    return { takes: left.map((x) => x.taken), keys: left.flatMap((x) => x.keys.map((y) => y.key)) };
  };
  if (t.group === "generate") {
    const left = takesOf(generativeTargets(before, savedDoc(store.get()), name, args));
    return left.takes.length ? { ...none, ...left } : null;
  }
  const scratch = new DocStore(store.get(), { measurer: store.options.measurer, lang: store.options.lang, ids: counterIds("dry") });
  const out: ToolOutcome = await executeTool(scratch, name, args, { origin: "ai", history: "none", registry: o.registry });
  /* a call that fails will fail for real too, and take nothing */
  if (!out.ok || scratch.get().doc === store.get().doc) return null;
  const after = savedDoc(scratch.get()) as Doc;
  const targets = takenTargets(before, after);
  /* screens, parts and whole components and collections count only for the operations named for removing them: parts
     moved into a component or split into atoms are not lost */
  if (!isDestructiveCall(name, args)) {
    const left = takesOf(targets);
    return left.takes.length ? { ...none, ...left } : null;
  }
  const diff = diffDocs(before, after);
  const chosen = o.selection?.length ? under(before, o.selection) : new Set<string>();
  const onScreen = screensOfParts(before);
  const screens = diff.screens.removed.filter((s) => !covered({ key: `screen:${s.id}`, names: [s.name, s.id] }));
  const parts = diff.nodes.removed.filter((n) => !chosen.has(n.id) && !covered({ key: `part:${n.id}`, names: [n.name, n.id, ...(onScreen.get(n.id) ?? [])] }));
  const gone = <T extends { id: string; name?: string }>(a: T[] | undefined, b: T[] | undefined): Named[] => (a ?? []).filter((x) => !(b ?? []).some((y) => y.id === x.id)).map((x) => ({ id: x.id, name: x.name ?? x.id }));
  const components = gone(before.components, after.components).filter((c) => !covered({ key: `component:${c.id}`, names: [c.name, c.id] }));
  const collections = gone(before.collections?.filter((c) => c.rows.length), after.collections).filter((c) => !covered({ key: `collection:${c.id}`, names: [c.name, c.id] }));
  const rest = takesOf(targets.filter((x) => x.taken.kind !== "component" && x.taken.kind !== "collection"));
  const keys = [...screens.map((s) => `screen:${s.id}`), ...parts.map((n) => `part:${n.id}`), ...components.map((c) => `component:${c.id}`), ...collections.map((c) => `collection:${c.id}`), ...rest.keys];
  const ask: RemovalAsk = { tool: name, screens, parts: parts.length, components, collections, takes: rest.takes, keys };
  return ask.screens.length || ask.parts >= PARTS_WITHOUT_ASKING || ask.components.length || ask.collections.length || ask.takes.length ? ask : null;
}

/** the removal in a line, for the model and the step list */
export function removalText(a: RemovalAsk): string {
  const names = (xs: Named[]) => xs.slice(0, 4).map((x) => `"${x.name}"`).join(", ") + (xs.length > 4 ? "…" : "");
  return [
    a.screens.length ? `${a.screens.length} screen${a.screens.length === 1 ? "" : "s"} (${names(a.screens)})` : "",
    a.parts ? `${a.parts} part${a.parts === 1 ? "" : "s"}` : "",
    a.components.length ? `${a.components.length} component${a.components.length === 1 ? "" : "s"} (${names(a.components)})` : "",
    a.collections.length ? `${a.collections.length} data collection${a.collections.length === 1 ? "" : "s"} (${names(a.collections)})` : "",
    ...a.takes.map(takenText),
  ]
    .filter(Boolean)
    .join(", ");
}

/** what the model reads back when the author said no */
export const declined = (a: RemovalAsk): ToolOutcome => ({
  ok: false,
  error: {
    code: "declined",
    message: `The author declined: this would take away ${removalText(a)} of their work, and the request did not plainly ask for that. Nothing was changed by this call.`,
    hint: "Keep their work. Do what was asked without removing it (build the new version beside the old one, or change what is there), or ask them one short question about what they want and end the turn.",
  },
});

/** what the model reads back when what the call would take away could not be worked out: it did not run */
export const unchecked = (e: unknown): ToolOutcome => ({
  ok: false,
  error: {
    code: "failed",
    message: `This call was not run: what it would take away of the author's work could not be checked (${e instanceof Error ? e.message : String(e)}).`,
    hint: "Change less at once, or add beside what is there instead of replacing it; if it keeps failing, tell the author.",
  },
});

/** what the model reads back when the author's work changed while they were asked, and the call now takes more */
export const changedMeanwhile = (a: RemovalAsk): ToolOutcome => ({
  ok: false,
  error: {
    code: "declined",
    message: `Not run: the document changed while the author was asked, and this call would now also take away ${removalText(a)}. Nothing was changed by this call.`,
    hint: "Read the document again (get_outline) before trying anything that removes, or ask the author.",
  },
});
