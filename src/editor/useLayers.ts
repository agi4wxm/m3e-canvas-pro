/* The layers: the canvas read as a tree (lib/layerTree.ts), which the layers panel lists and the canvas's selection
 * goes by, and what the panel's rows do. Each change from the panel is one operation and one undo step. While
 * something is being carried the tree waits, the way the canvas's own layout pass does. */

import { useMemo, useRef, type RefObject } from "react";
import { Frame, FrameMode, Group } from "@/lib/tokens";
import { layerTree, type LayerTree } from "@/lib/layerTree";
import { ops, type DocStore, type Op, type TxOptions } from "@/lib/core";
import { moveLayer } from "@/lib/core/ops/layers";

export type LayerInputs = {
  store: DocStore;
  frame: FrameMode;
  primaryId: string | null;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  /** which screen each group stands on */
  frameOf: Map<string, string>;
  selectedFrameId: string | null;
  /** the screen listed when nothing on a screen is selected */
  layersFrameId: string | null;
  /** what stands on a dock's other tab */
  offTab: Set<string>;
  /** something is being carried: the tree worked out last stands meanwhile */
  carrying: boolean;
  instantRef: RefObject<Set<string>>;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string; refused?: () => void }) => R | undefined;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string; refused?: () => void }) => boolean;
  setSelectedIds: (ids: string[]) => void;
  setSelectedFrameId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
};

export function useLayers({ store, frame, primaryId, groups, frames, widths, frameOf, selectedFrameId, layersFrameId, offTab, carrying, instantRef, runOp, didOp, setSelectedIds, setSelectedFrameId, setSelectedLinkId }: LayerInputs) {
  const last = useRef<LayerTree | null>(null);
  const tree = useMemo(() => (carrying && last.current ? last.current : layerTree(groups, frames, widths, { phone: frame === "phone", frameOf })), [carrying, groups, frames, widths, frame, frameOf]);
  last.current = tree;

  /** the screen the panel opens first: the selection's, else the chosen one */
  const layersFrame = useMemo(() => {
    if (frame !== "phone") return null;
    if (primaryId) {
      const g = groups.find((x) => x.items.some((it) => it.id === primaryId));
      const fid = g ? frameOf.get(g.id) : undefined;
      if (fid) return frames.find((f) => f.id === fid) ?? null;
    }
    if (selectedFrameId) return frames.find((f) => f.id === selectedFrameId) ?? null;
    return frames.find((f) => f.id === layersFrameId) ?? frames[0] ?? null;
  }, [frame, primaryId, groups, frameOf, frames, selectedFrameId, layersFrameId]);
  const layerGroups = useMemo(() => (layersFrame ? groups.filter((g) => frameOf.get(g.id) === layersFrame.id) : []), [groups, frameOf, layersFrame]);

  /* the current screen is the one the layers list; a blank canvas has only the one place */
  const selectAll = () => {
    const on = frame === "phone" ? layerGroups : groups;
    /* what stands on a dock's other tab is not on the canvas: a delete must not reach what cannot be seen */
    setSelectedIds(on.filter((g) => !offTab.has(g.id)).flatMap((g) => g.items.map((it) => it.id)));
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  /** a layer taken to another place in the tree by a drag of its row */
  const moveLayerTo = (id: string, parent: string | null, index: number) => {
    const before = store.get().doc.groups;
    if (!didOp(moveLayer, { id, parent, index }, { history: "step", label: "Move layer" })) return;
    for (const g of store.get().doc.groups) if (!before.includes(g)) instantRef.current.add(g.id);
  };

  /** flips a group's lock from its row */
  const toggleGroupLock = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { locked: !g.locked } }, { history: "step" });
  };

  /** flips whether a group starts the preview hidden, from its row's eye */
  const toggleGroupHidden = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { hidden: g.hidden ? null : true } }, { history: "step" });
  };

  /** names a group from its row; no words give up the name */
  const renameGroup = (id: string, name: string) => runOp(ops.setGroup, { id, patch: { name: name || null } }, { history: "step" });

  /** The parts of a hand-made group or a run in a new order: reading order for a run, back to front for a group. */
  const reorderGroupItems = (groupId: string, order: string[]) => {
    if (!didOp(ops.reorderItems, { group: groupId, order }, { history: "step", refused: () => {} })) return;
    instantRef.current.add(groupId);
  };
  return { tree, layersFrame, layerGroups, selectAll, moveLayerTo, toggleGroupLock, toggleGroupHidden, renameGroup, reorderGroupItems };
}
