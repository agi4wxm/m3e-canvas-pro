/* What the preview draws of an old project file, for lib/converge.test.ts: every part (the document drawn out, as the
 * preview draws it: instances and repeats expanded) with every prop as the part reads it and its design fields as bound,
 * and what is off the screen, at the start, after each of its taps (made in its row) and after a visitor enters a value
 * into each input (and the variables that leaves). Each state is kept as a digest: `drawn.json` holds what the version
 * that understood the files made of them (written by `UPDATE_HISTORY=1`), and a later version must draw the same.
 *
 * Kept free of anything one version has and another lacks, so the same file runs on the code before a step and after. */

import { createHash } from "node:crypto";
import { applyEffects, chooseBranch, goneIds, inRow, INPUT_PROP, leftRow, liveItem, startState, writeField, type PreviewState } from "../../interact";
import { expandDoc } from "../../expand";
import { partBySlug, reader } from "../../../parts/registry";
import { boundItem } from "../../variables";
import { actionsOf, type Doc, type Item } from "../../tokens";

/** every prop of a part as the part reads it (its range kept, a choice it does not have its default) */
function readAll(it: Item): unknown {
  const def = partBySlug(it.component);
  if (!def) return it.props ?? null;
  const p = reader(def, it.props) as unknown as { s: (k: string) => unknown };
  return Object.fromEntries(def.props.map((d) => [d.key, p.s(d.key)]));
}

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/** what a visitor may enter into an input, whatever kind of value it holds */
const ENTERED: unknown[] = ["Kiwi", "", "2", 2, 0, true, false, [{ label: "a" }, { label: "b" }]];

export function drawnStates(source: Doc): Record<string, string> {
  const doc = expandDoc(source, {});
  const s0 = startState(doc.vars, doc.collections);
  const all = doc.groups.flatMap((g) => g.items);
  const drawn = (s: PreviewState) => ({
    parts: all.map((it) => {
      const live = boundItem(liveItem(it, s), s.vars);
      return [it.id, readAll(live), live.look ?? null, live.corners ?? null];
    }),
    gone: [...goneIds(doc.groups, s, doc, {})].sort(),
    vars: s.vars,
  });
  const out: Record<string, string> = { start: digest(drawn(s0)) };
  for (const it of all)
    for (const { slot, action } of actionsOf(it)) {
      const sIn = inRow(s0, it.row);
      const body = chooseBranch(action, sIn, doc, it);
      const s1 = leftRow(body ? applyEffects(sIn, body.effects, doc, { it }) : sIn, it.row);
      out[`tap ${it.id}${slot ? `/${slot}` : ""}`] = digest({ to: body?.to ?? null, ...drawn(s1) });
    }
  for (const it of all) {
    if (INPUT_PROP[it.component ?? ""] === undefined) continue;
    for (const v of ENTERED) out[`input ${it.id} ${JSON.stringify(v)}`] = digest(drawn(writeField(s0, it, v as never, doc)));
  }
  return out;
}
