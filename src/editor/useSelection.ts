/* What the selection is, read off the document: the part the panels edit, the group or screen it stands on, whether it
 * is locked, placeable, whole, laid out by a container, and the screen the tidy button works on. Nothing here changes
 * anything. */

import { useMemo } from "react";
import { Frame, FrameMode, frameOfGroup, Group, groupBounds } from "@/lib/tokens";
import { childLayoutOf, flowOf } from "@/lib/flow";
import { holdsEdgeBar, minFrameLength } from "@/lib/tidy";
import type { CoreState } from "@/lib/core";
import type { DragState } from "./model";

export type SelectionInputs = {
  selectedIds: string[];
  selectedFrameId: string | null;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  frame: FrameMode;
  /** a part being carried is still the selected one, though it stands in no group yet */
  drag: DragState | null;
  isMobile: boolean;
  defEdit: CoreState["editing"];
};

export function useSelection({ selectedIds, selectedFrameId, groups, frames, widths, frame, drag, isMobile, defEdit }: SelectionInputs) {
  const primaryId = selectedIds[selectedIds.length - 1] ?? null;
  const selected = useMemo(() => {
    for (const g of groups) {
      const it = g.items.find((i) => i.id === primaryId);
      if (it) return it;
    }
    return drag?.item.id === primaryId ? (drag?.item ?? null) : null;
  }, [groups, primaryId, drag]);
  /** every group holding a selected part is locked, so the menu offers to unlock instead */
  const selectedLocked = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => !!g.locked);
  }, [groups, selectedIds]);

  /** the selection can be placed in a screen: something in it is not a bar, and all of that
   *  stands on one screen -- a selection of bars alone, or one spread over several screens,
   *  has no one body to go to */
  const selectionPlaceable = useMemo(() => {
    const ids = new Set(selectedIds);
    const units = groups.filter((g) => g.items.some((it) => ids.has(it.id)) && !holdsEdgeBar(g) && !g.inFlow);
    if (!units.length) return false;
    const f = frameOfGroup(units[0], frames, widths);
    return !!f && units.every((g) => frameOfGroup(g, frames, widths)?.id === f.id);
  }, [groups, frames, widths, selectedIds]);

  /** the selection covers every group it touches, so locking it locks nothing that was not selected */
  const selectionWhole = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => g.items.every((it) => ids.has(it.id)));
  }, [groups, selectedIds]);
  /** the free group the whole selection belongs to, if it is exactly one */
  const selectedGroup = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const g = groups.find((x) => x.free && x.items.some((it) => it.id === selectedIds[0]));
    if (!g) return null;
    const ids = new Set(g.items.map((it) => it.id));
    return selectedIds.every((id) => ids.has(id)) && selectedIds.length === g.items.length ? g : null;
  }, [groups, selectedIds]);
  const selectedFrame = useMemo(
    () => frames.find((f) => f.id === selectedFrameId) ?? null,
    [frames, selectedFrameId],
  );
  const selectedMinLength = useMemo(
    () => (selectedFrame ? minFrameLength(groups, selectedFrame, frames, widths) : 0),
    [groups, selectedFrame, frames, widths],
  );
  const selectedRect = useMemo(() => {
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    if (!g) return null;
    const b = groupBounds(g, widths);
    return { x: b.l, y: b.t, w: b.r - b.l, h: b.b - b.t };
  }, [primaryId, groups, widths]);
  /** a container's auto layout places the selected part, so its place is not the author's to set */
  const selectedInFlow = useMemo(() => {
    const g = primaryId ? groups.find((x) => x.items.some((it) => it.id === primaryId)) : undefined;
    const host = g?.inFlow ? groups.find((x) => x.id === g.inFlow) : undefined;
    return !!host && !!flowOf(host);
  }, [primaryId, groups]);
  /** the layout that places the selected part, for how it is sized and lined up in it */
  const selectedFlowParent = useMemo(() => {
    const g = primaryId ? groups.find((x) => x.items.some((it) => it.id === primaryId)) : undefined;
    const host = g?.inFlow ? groups.find((x) => x.id === g.inFlow) : undefined;
    return host ? flowOf(host) : null;
  }, [primaryId, groups]);
  /** the selected part stands loose in its layout, where it was put: its place is the author's again */
  const selectedLoose = useMemo(() => {
    const it = primaryId ? groups.flatMap((g) => g.items).find((x) => x.id === primaryId) : undefined;
    return childLayoutOf(it).absolute;
  }, [primaryId, groups]);
  const selectedPartFrame = useMemo(() => {
    if (!primaryId || frame !== "phone") return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [primaryId, frame, groups, frames, widths]);

  /** the screen the tidy button works on: the selected one, or the one under the selected part */
  const tidyTarget = useMemo((): Frame | null => {
    if (frame !== "phone" || isMobile || defEdit) return null;
    if (selectedFrame) return selectedFrame;
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [frame, isMobile, defEdit, selectedFrame, primaryId, groups, frames, widths]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  return { primaryId, selected, selectedSet, selectedLocked, selectionPlaceable, selectionWhole, selectedGroup, selectedFrame, selectedMinLength, selectedRect, selectedInFlow, selectedFlowParent, selectedLoose, selectedPartFrame, tidyTarget };
}
