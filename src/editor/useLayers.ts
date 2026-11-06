/* The Layers panel: the screen whose layers it lists, and what its rows do. A drag in it is one undo step, taken when
 * it starts; a reorder outside a drag joins the reorders of the same list before it. */

import { useMemo, useRef, type RefObject } from "react";
import { Frame, FrameMode, Group } from "@/lib/tokens";
import { ops, type DocStore, type Op, type TxOptions } from "@/lib/core";

export type LayerInputs = {
  store: DocStore;
  frame: FrameMode;
  primaryId: string | null;
  groups: Group[];
  frames: Frame[];
  /** which screen each group stands on */
  frameOf: Map<string, string>;
  selectedFrameId: string | null;
  /** the screen listed when nothing on a screen is selected */
  layersFrameId: string | null;
  /** what stands on a dock's other tab */
  offTab: Set<string>;
  instantRef: RefObject<Set<string>>;
  snapshot: () => void;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string; refused?: () => void }) => R | undefined;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string; refused?: () => void }) => boolean;
  setSelectedIds: (ids: string[]) => void;
  setSelectedFrameId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
};

export function useLayers({ store, frame, primaryId, groups, frames, frameOf, selectedFrameId, layersFrameId, offTab, instantRef, snapshot, runOp, didOp, setSelectedIds, setSelectedFrameId, setSelectedLinkId }: LayerInputs) {
  /** the screen whose layers the panel lists: the selection's, else the chosen one */
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
  const layerGroups = useMemo(
    () => (layersFrame ? groups.filter((g) => frameOf.get(g.id) === layersFrame.id) : []),
    [groups, frameOf, layersFrame],
  );
  /* the current screen is the one the layers list; a blank canvas has only the one place */
  const selectAll = () => {
    const on = frame === "phone" ? layerGroups : groups;
    /* what stands on a dock's other tab is not on the canvas: a delete must not reach what cannot be seen */
    setSelectedIds(on.filter((g) => !offTab.has(g.id)).flatMap((g) => g.items.map((it) => it.id)));
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };
  /** A drag in the layers panel is one undo step: the snapshot is taken when it starts,
   *  and the reorders it fires along the way record nothing more. */
  const layerDragRef = useRef(false);
  const onLayerDragging = (dragging: boolean) => {
    if (dragging && !layerDragRef.current) snapshot();
    layerDragRef.current = dragging;
  };
  /** a reorder from the layers panel: while a drag of it goes on, its step was taken when it began */
  const layerHistory = (key: string) => (layerDragRef.current ? ("none" as const) : { coalesce: key });

  const reorderLayers = (topFirst: string[]) => {
    if (!didOp(ops.reorderLayers, { order: topFirst }, { history: layerHistory("layers:" + (layersFrame?.id ?? "")) })) return;
    for (const id of topFirst) instantRef.current.add(id);
  };

  /** flips a group's lock from its row's lock icon in the Layers panel */
  const toggleGroupLock = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { locked: !g.locked } }, { history: "step" });
  };

  /** flips whether a group starts the preview hidden, from its row's eye in the Layers panel */
  const toggleGroupHidden = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { hidden: g.hidden ? null : true } }, { history: "step" });
  };

  /** names a group from its row in the Layers panel; no words give up the name */
  const renameGroup = (id: string, name: string) => runOp(ops.setGroup, { id, patch: { name: name || null } }, { history: "step" });

  /** The parts of one group in a new order: reading order for a group laid out along its axis,
   *  back to front for a free group. */
  const reorderGroupItems = (groupId: string, order: string[]) => {
    if (!didOp(ops.reorderItems, { group: groupId, order }, { history: layerHistory("layers:items:" + groupId), refused: () => {} })) return;
    instantRef.current.add(groupId);
  };
  return { layersFrame, layerGroups, selectAll, onLayerDragging, reorderLayers, toggleGroupLock, toggleGroupHidden, renameGroup, reorderGroupItems };
}
