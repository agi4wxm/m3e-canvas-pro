/* What is done to the selection: its panel's edits, delete, lock, duplicate, copy and paste, place, align, distribute,
 * tidy up, auto layout, make a component, group and ungroup, nudge and layer steps. Each is one lib/core operation and
 * one undo step (consecutive edits of one field, nudges and layer steps of one selection join into one). */

import { useCallback, useRef, type RefObject } from "react";
import { Frame, Group, Item } from "@/lib/tokens";
import type { NoteAction } from "@/components/Toolbar";
import { type AlignHow } from "@/lib/align";
import { tidyLook } from "@/lib/look";
import { getLang, t } from "@/lib/i18n";
import { ops, type DocStore, type Op, type OpError, type TxOptions } from "@/lib/core";
import { clipOf, movedGroups, type Clip } from "@/lib/core/ops/nodes";
import { groupRefusedMsg, lockedGroupMsg, type DragState, type LeftTab } from "./model";

export type CommandInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => R | undefined;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => boolean;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  selectedIds: string[];
  selectedFrameId: string | null;
  /** the part the panels edit: the last one selected */
  primaryId: string | null;
  selected: Item | null;
  /** the free group the whole selection is, if it is one */
  selectedGroup: Group | null;
  selectedRect: { x: number; y: number; w: number; h: number } | null;
  dragRef: RefObject<DragState | null>;
  instantRef: RefObject<Set<string>>;
  framesRef: RefObject<Frame[]>;
  widthsRef: RefObject<Record<string, number>>;
  setLeftTab: (tab: LeftTab) => void;
  setLeftOpen: (open: boolean) => void;
};

export function useCommands({ store, runOp, didOp, showToast, selectedIds, selectedFrameId, primaryId, selected, selectedGroup, selectedRect, dragRef, instantRef, framesRef, widthsRef, setLeftTab, setLeftOpen }: CommandInputs) {
  const patchSelected = (patch: Partial<Item>) => {
    if (!primaryId) return;
    const id = primaryId;
    /* a locked part is not to be changed at all: its panel is behind a blur, and anything that asks for a change anyway
     * -- a shortcut, the phone's panel -- is turned away (lib/core `set_item`); consecutive edits of one field are one step */
    const done = runOp(ops.setItem, { id, patch }, { history: { coalesce: id + ":" + Object.keys(patch).join(",") }, label: "Edit" });
    if (done === undefined && store.get().doc.groups.some((g) => g.locked && g.items.some((it) => it.id === id))) return;
    if (dragRef.current?.item.id === id) {
      dragRef.current.item = { ...dragRef.current.item, ...("look" in patch ? { ...patch, look: tidyLook(patch.look) } : patch) };
    }
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const before = store.get().doc.groups;
    /* nothing deletable when every selected part sits in a locked group: no step, the selection kept */
    const out = runOp(ops.removeNodes, { ids: selectedIds }, { history: "step", refused: () => showToast(lockedGroupMsg()) });
    if (!out) return;
    /* some of the selection sits in a locked group: the rest went, and the author is told why that part stayed */
    if (out.kept) showToast(t("lockedKept", getLang()));
    /* a run whose first part went has a new anchor: it is drawn there at once */
    for (const id of movedGroups(before, store.get().doc.groups)) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** locks every group holding a selected part, or unlocks them all when they already are */
  const toggleLockSelected = useCallback(() => {
    if (!selectedIds.length) return;
    runOp(ops.toggleLock, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** duplicates everything selected a step aside, and selects the copies */
  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    runOp(ops.duplicateNodes, { ids: selectedIds, primary: primaryId ?? undefined }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, primaryId, store]);

  /* The in-app clipboard: Ctrl+C keeps a copy of the selection (whole groups where the
   * selection covers them) with its offset inside its screen, so Ctrl+V can put it at the
   * same spot on another screen, or a step aside on the same one. The offset is that of the
   * selection's top-left corner, so several units keep their places relative to each other. */
  const clipboardRef = useRef<Clip | null>(null);

  const copySelected = useCallback(() => {
    if (!selected) return;
    const clip = clipOf(store.get(), selectedIds, selected.id, widthsRef.current);
    if (clip) clipboardRef.current = clip;
  }, [selected, selectedIds, store]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    /* pasted into a definition, an instance must not put that definition inside itself */
    runOp(ops.pasteClip, { clip, selected: selected?.id }, { history: "step", refused: (e) => e.code === "refused" && showToast(t("nestRefused", getLang())) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, store]);

  /** Puts the selection at one of nine spots in its screen's body, the box Tidy fills between the bars, as one block,
   *  clear of what is already there (lib/core `place_in_screen`). */
  const placeSelected = useCallback(
    (col: "left" | "centerH" | "right", row: "top" | "centerV" | "bottom") => {
      runOp(ops.placeInScreen, { ids: selectedIds, col, row }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** the selected parts lined up against each other, the way their own edges say */
  const alignSelected = useCallback(
    (how: AlignHow) => {
      runOp(ops.align, { ids: selectedIds, how }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** the selected parts spread out evenly; with `gap`, that exact space between them */
  const distributeSelected = useCallback(
    (axis: "x" | "y", gap?: number) => {
      runOp(ops.distribute, { ids: selectedIds, axis, gap }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** Figma's Tidy up: the selected parts as an even row, column or grid, read off where they stand */
  const tidyUpSelected = useCallback(() => {
    runOp(ops.tidyUp, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** The selected parts in nested containers that keep them the way they stand: rows, columns and grids read off their
   *  places, as Figma suggests auto layout. A lone container takes the layout itself; a lone part goes in a row. */
  const autoLayoutSelected = useCallback(() => {
    runOp(ops.autoLayout, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);
  /** the selected parts, with what they hold, as a new definition and an instance of it in their place */
  const makeComponentOfSelection = useCallback(() => {
    if (!runOp(ops.makeComponentOp, { ids: selectedIds, name: t("componentDefaultName", getLang()).replace("{n}", String((store.get().doc.components?.length ?? 0) + 1)) }, { history: "step", refused: () => showToast(lockedGroupMsg()) })) return;
    setLeftTab("components");
    setLeftOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);
  /** Pull the selected parts out of their runs into one free group that keeps
   *  their positions. It takes the layer slot of the topmost run involved. */
  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    const before = store.get().doc.groups;
    /* regrouping would carry a locked group's parts into an unlocked group; an instance or a repeat would be lost in it */
    if (!runOp(ops.groupNodes, { ids: selectedIds }, { history: "step", refused: (e) => (e.code === "locked" ? showToast(lockedGroupMsg()) : e.code === "refused" ? showToast(groupRefusedMsg()) : undefined) })) return;
    for (const id of movedGroups(before, store.get().doc.groups)) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** Split a free group back into single runs at their current positions, in the same layer slot. */
  const ungroupSelected = useCallback(() => {
    const g = selectedGroup;
    if (!g) return;
    /* ungrouping would replace a locked group with unlocked single runs */
    const out = runOp(ops.ungroup, { id: g.id }, { history: "step" });
    for (const id of out?.ids ?? []) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, store]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0 && selectedFrameId) {
        if (!framesRef.current.some((x) => x.id === selectedFrameId)) return;
        const out = runOp(ops.nudge, { screen: selectedFrameId, dx, dy }, { history: { coalesce: "nudge:frame:" + selectedFrameId } });
        for (const id of out?.moved ?? []) instantRef.current.add(id);
        return;
      }
      if (selectedIds.length === 0) return;
      /* a locked group stays where it is, even when its parts are selected; a layout places what it holds */
      runOp(ops.nudge, { ids: selectedIds, dx, dy }, { history: { coalesce: "nudge:" + selectedIds.join(",") } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, selectedFrameId, store],
  );
  /** the selected part put at a place given in numbers */
  const moveSelectedTo = useCallback(
    (x: number, y: number) => {
      if (selectedRect) nudge(x - selectedRect.x, y - selectedRect.y);
    },
    [selectedRect, nudge],
  );
  /** One step forward or back for what is selected, with whatever it holds. */
  const stepSelectedLayers = (dir: 1 | -1) => {
    const all = store.get().doc.groups;
    if (!didOp(ops.zOrder, { ids: selectedIds, to: dir === 1 ? "forward" : "backward" }, { history: { coalesce: "layer-step:" + selectedIds.join(",") } })) return;
    store.get().doc.groups.forEach((g, i) => {
      if (g !== all[i]) instantRef.current.add(g.id);
    });
  };
  return { patchSelected, deleteSelected, toggleLockSelected, duplicateSelected, clipboardRef, copySelected, pasteClipboard, placeSelected, alignSelected, distributeSelected, tidyUpSelected, autoLayoutSelected, makeComponentOfSelection, groupSelected, ungroupSelected, nudge, moveSelectedTo, stepSelectedLayers };
}
