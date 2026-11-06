/* The guard on taking away the author's work. A call that removes much of it (clearing the canvas, whole screens,
 * many parts, a component or a data collection), or takes away what no removal's name says (a collection's rows
 * rewritten, modes or variables dropped, a custom style or a document icon replaced, a component's property gone:
 * lib/tools/removals.ts), when the request does not plainly ask for that is paused, and the author is asked in the chat
 * panel, Allow or Don't, the way the MCP server has the editor confirm a destructive call. Headless (the eval suite, a
 * script) the caller's policy answers. Declined, the call does not run and the model is told to keep the work and ask
 * instead. A removal is measured by running the call on a scratch copy of the document and comparing with how the turn
 * found it, so what the turn removed bit by bit counts together, and what the turn made itself is its own to change.
 * A generative call is not run twice (it reaches a provider): what it would replace is read from its arguments. */

import { counterIds, DocStore, nodeTree, savedDoc, type CoreState, type TreeNode } from "../core";
import { executeTool, isDestructiveCall, type Registry, type ToolOutcome } from "../tools";
import { generativeTakes, takenAway, takenText, type Taken } from "../tools/removals";
import type { Doc } from "../tokens";
import { diffDocs, type Named } from "./diff";

/** what a call would take away, counted from how the turn found the document */
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
};

/** Asks the author whether a removal may go ahead: true to allow it. The signal aborts when the turn is stopped. */
export type ConfirmRemoval = (ask: RemovalAsk, signal?: AbortSignal) => boolean | Promise<boolean>;

/** how many parts a turn may take away without asking (rows of a list turned into cards, a header redone) */
export const PARTS_WITHOUT_ASKING = 10;

/** words that ask for a removal, in the four languages of the editor */
const REMOVE = /\b(delete|remove|clear|wipe|erase|get rid of|throw away|drop)\b|删|清空|清除|去掉|移除|拿掉|不要了|削除|消して|消す|消去|クリア|取り除|삭제|지워|지우|없애|비워/i;
/** words that ask for something to be made again: a removal in the same breath is a means, not the wish */
const REDO = /\b(redo|re-do|start over|from scratch|redesign|rebuild|remake|again)\b|重做|重新|重来|重画|重写|重新设计|再做|やり直|作り直|一から|다시|새로/i;

/** Whether a request plainly asks for things to be taken away: it says so, and is not a wish for the work made anew
 *  ("it all looks bad, delete it and redo it" is the latter: a redesign can be built beside the old one). */
export function plainlyAsksToRemove(request: string): boolean {
  return REMOVE.test(request) && !REDO.test(request);
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

/** What a call would take away of the document as the turn found it (`start`), the parts the author selected left
 *  out (asked about, so theirs to lose); null when it takes away nothing worth asking about. */
export async function removalOf(store: DocStore, start: CoreState, name: string, args: unknown, o: { registry: Registry; selection?: string[] }): Promise<RemovalAsk | null> {
  const t = o.registry.byName(name);
  if (!t || t.readOnly) return null;
  const before = savedDoc(start) as Doc;
  const none: RemovalAsk = { tool: name, screens: [], parts: 0, components: [], collections: [], takes: [] };
  if (t.group === "generate") {
    const takes = generativeTakes(before, savedDoc(store.get()), name, args);
    return takes.length ? { ...none, takes } : null;
  }
  const scratch = new DocStore(store.get(), { measurer: store.options.measurer, lang: store.options.lang, ids: counterIds("dry") });
  const out: ToolOutcome = await executeTool(scratch, name, args, { origin: "ai", history: "none", registry: o.registry });
  /* a call that fails will fail for real too, and take nothing */
  if (!out.ok || scratch.get().doc === store.get().doc) return null;
  const after = savedDoc(scratch.get()) as Doc;
  const taken = takenAway(before, after);
  /* screens, parts and whole components and collections count only for the operations named for removing them: parts
     moved into a component or split into atoms are not lost */
  if (!isDestructiveCall(name, args)) return taken.length ? { ...none, takes: taken } : null;
  const diff = diffDocs(before, after);
  const chosen = o.selection?.length ? under(before, o.selection) : new Set<string>();
  const parts = diff.nodes.removed.filter((n) => !chosen.has(n.id)).length;
  const gone = <T extends { id: string; name?: string }>(a: T[] | undefined, b: T[] | undefined): Named[] => (a ?? []).filter((x) => !(b ?? []).some((y) => y.id === x.id)).map((x) => ({ id: x.id, name: x.name ?? x.id }));
  const components = gone(before.components, after.components);
  const collections = gone(before.collections?.filter((c) => c.rows.length), after.collections);
  const takes = taken.filter((x) => x.kind !== "component" && x.kind !== "collection");
  const ask: RemovalAsk = { tool: name, screens: diff.screens.removed, parts, components, collections, takes };
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
