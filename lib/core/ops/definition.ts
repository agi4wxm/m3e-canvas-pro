/* Changing the parts inside a component's definition without opening it on the canvas. After make_component the parts
 * a model built live in the definition, not on a screen, so set_props and the rest no longer find them there. Here
 * the operations a screen takes run on the definition as the canvas shows it open (DocStore.openDefinition: its parts
 * on a screen of their own, `editing` set, so nesting rules hold), and the definition is put back as closing it does
 * (`definitionFrom`): every instance follows. One operation, so it is one step and fits in apply_ops. */

import { definitionFrom } from "../../instances";
import { defaultMeasures } from "../../../parts/templates/kit";
import { op, OpError, runOp, S, type Op } from "../op";
import { DEF_INSET, definitionScreen, type CoreState } from "../state";
import { componentById } from "./common";

/** what may run inside a definition: what changes its parts, never screens, the document, data or other components */
export const DEFINITION_OPS: readonly string[] = [
  "add_part", "add_kit", "add_tree", "add_instance", "remove_nodes", "duplicate_nodes", "set_item", "set_props", "set_group", "toggle_lock", "nudge", "move_node", "move_into", "z_order", "reorder_items", "show_nodes", "group_nodes", "ungroup",
  "set_layout", "tidy_up", "align", "align_to_parent", "distribute", "wrap_in_auto_layout", "split_into_atoms", "split_retired", "combine_buttons", "relayout",
  "set_overrides", "swap_instance", "set_instance_props", "reset_overrides", "detach_instance", "set_action", "bind_prop", "set_repeat",
];

type Call = { op: string; args?: Record<string, unknown> };

/** The definition `id` as the canvas shows it open: its parts on a screen of their own, the document's waiting. */
export function definitionOpened(s: CoreState, id: string): CoreState {
  const def = componentById(s, id);
  return {
    ...s,
    doc: { ...s.doc, groups: def.groups.map((g) => ({ ...g, x: g.x + DEF_INSET, y: g.y + DEF_INSET })), frames: [definitionScreen(def)], frame: "phone" },
    editing: { id, main: { groups: s.doc.groups, frames: s.doc.frames, mode: s.doc.frame } },
    session: { ...s.session, selection: [], frameId: null },
  };
}

/** `edit_component`, running its operations with `lookup` (the list of operations, which this one is part of) */
export function editComponentOp(lookup: (name: string) => Op<never, unknown> | undefined) {
  return op<{ id: string; ops: Call[] }, { ran: number; results: unknown[] }>({
    name: "edit_component",
    summary:
      "Changes the parts inside a component's definition (after make_component they live there, not on the screen): runs operations on it as if it were open on a screen of its own, naming its own part ids (list_components and describe_node show them), and every instance follows. Takes set_props, set_item, add_part, add_tree, remove_nodes, set_layout, move_into and the other operations on parts; all of them or none.",
    args: S.obj(
      {
        id: S.str("the component"),
        ops: S.arr(S.obj({ op: S.enum(DEFINITION_OPS, "an operation on parts"), args: S.any("its arguments, as its own tool takes them") }, ["op"]), "what to do inside it, in order", { minItems: 1 }),
      },
      ["id", "ops"],
    ),
    label: () => "Edit component",
    run(s, a, ctx) {
      /* the screens wait outside an open definition: another one is not reached from in there */
      if (s.editing && s.editing.id !== a.id) throw new OpError("refused", "Another component is being edited: finish editing it first.", a.id);
      const open = !s.editing;
      const def = componentById(s, a.id);
      let sub = open ? definitionOpened(s, a.id) : s;
      const results: unknown[] = [];
      a.ops.forEach((c, i) => {
        const o = DEFINITION_OPS.includes(c?.op) ? lookup(c.op) : undefined;
        if (!o) throw new OpError("bad_args", `ops[${i}]: ${JSON.stringify(c?.op)} cannot run inside a component; it takes ${DEFINITION_OPS.join(", ")}.`, a.id);
        /* parts the canvas has not measured go by their own guesses, as they do on a screen nobody measured */
        const widths = { ...defaultMeasures(sub.doc.groups), ...ctx.widths };
        try {
          const out = runOp(o, sub, (c.args ?? {}) as never, { ...ctx, widths });
          sub = out.state;
          results.push(out.result === undefined ? { done: true } : out.result);
        } catch (e) {
          if (e instanceof OpError && e.code === "nothing_to_do") return void results.push({ nothing_to_do: e.message });
          if (e instanceof OpError) throw new OpError(e.code, `ops[${i}] (${c.op}): ${e.message}`, e.about);
          throw e;
        }
      });
      if (!open) return { state: sub, result: { ran: a.ops.length, results } };
      /* put back as closing it puts it back: on its own top left, its size what its parts come to */
      const done = definitionFrom(def, sub.doc.groups, { ...defaultMeasures(sub.doc.groups), ...ctx.widths, ...sub.session.widths });
      const components = (sub.doc.components ?? []).map((c) => (c.id === a.id ? done : c));
      const state: CoreState = {
        ...sub,
        doc: { ...sub.doc, groups: s.doc.groups, frames: s.doc.frames, frame: s.doc.frame, components },
        editing: null,
        session: { ...sub.session, selection: s.session.selection, frameId: s.session.frameId },
      };
      return { state, result: { ran: a.ops.length, results } };
    },
  });
}
