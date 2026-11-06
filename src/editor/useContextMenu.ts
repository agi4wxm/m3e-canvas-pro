/* The canvas's right-click menu: a press with the other button picks what is under it the way a click would (unless it
 * is selected already), and the menu offers what can be done to the selection there, Figma's commands with their keys.
 * Every entry runs a command the editor already has (src/editor/useCommands.ts), so the menu changes nothing itself. */

import { useCallback, useState, type RefObject } from "react";
import { t, type Lang } from "@/lib/i18n";
import { chainOf, pickTarget, type LayerTree } from "@/lib/layerTree";
import { partBySlug } from "@/parts/registry";
import { labelOfPart } from "@/parts/resize";
import { nameOf } from "@/parts/labels";
import type { DocStore } from "@/lib/core";
import type { MenuEntry } from "@/components/ContextMenu";
import { textPropOf } from "./useTextEdit";

export type MenuCommands = {
  copy: () => void;
  paste: () => void;
  canPaste: boolean;
  duplicate: () => void;
  remove: () => void;
  order: (to: "front" | "forward" | "backward" | "back") => void;
  group: () => void;
  ungroup: () => void;
  grouped: boolean;
  autoLayout: () => void;
  makeComponent: () => void;
  goToMain?: () => void;
  editText: (id: string) => void;
  selectAll: () => void;
  select: (ids: string[]) => void;
};

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

export function useContextMenu({ store, layersRef, setSelectedIds, setSelectedFrameId }: { store: DocStore; layersRef: RefObject<LayerTree | null>; setSelectedIds: (ids: string[]) => void; setSelectedFrameId: (id: string | null) => void }) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  /** the press that opens the menu picks what is under it, the way a click would, unless that is selected already */
  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.getAttribute("data-node");
    const cur = store.get().session.selection;
    const tree = layersRef.current;
    if (id && tree && !cur.includes(id)) {
      const ids = pickTarget(tree, id, cur, e.ctrlKey || e.metaKey);
      setSelectedIds(ids);
      setSelectedFrameId(null);
    }
    setMenuAt({ x: e.clientX, y: e.clientY });
  };
  const closeMenu = useCallback(() => setMenuAt(null), []);
  return { menuAt, openMenu, closeMenu };
}

/** what the menu offers for the selection now */
export function menuEntries(store: DocStore, tree: LayerTree | null, c: MenuCommands, lang: Lang): MenuEntry[] {
  const sel = store.get().session.selection;
  if (!sel.length) return [{ key: "paste", label: t("cmPaste", lang), icon: "content_paste", keys: `${mod}V`, run: c.paste, disabled: !c.canPaste }, { key: "select-all", label: t("cmSelectAll", lang), icon: "select_all", keys: `${mod}A`, run: c.selectAll }];
  const items = store.get().doc.groups.flatMap((g) => g.items);
  const one = sel.length === 1 ? items.find((it) => it.id === sel[0]) : undefined;
  /* the layers this one stands in, nearest first: Figma's Select layer */
  const chain = one && tree ? chainOf(tree, tree.nodeOfItem.get(one.id) ?? "").slice(1) : [];
  const layerName = (nodeId: string) => {
    const n = tree?.nodes.get(nodeId);
    const it = n?.item;
    const def = partBySlug(it?.component);
    return (it && (labelOfPart(def, it.props) || (def && nameOf(def, lang)))) || nodeId;
  };
  const text = one && textPropOf(one);
  return [
    { key: "copy", label: t("cmCopy", lang), icon: "content_copy", keys: `${mod}C`, run: c.copy },
    { key: "paste", label: t("cmPaste", lang), icon: "content_paste", keys: `${mod}V`, run: c.paste, disabled: !c.canPaste },
    { key: "duplicate", label: t("cmDuplicate", lang), icon: "control_point_duplicate", keys: `${mod}D`, run: c.duplicate },
    { key: "delete", label: t("cmDelete", lang), icon: "delete", keys: "Del", run: c.remove, danger: true },
    "divider",
    { key: "front", label: t("cmFront", lang), icon: "flip_to_front", run: () => c.order("front") },
    { key: "forward", label: t("cmForward", lang), icon: "arrow_upward", keys: "]", run: () => c.order("forward") },
    { key: "backward", label: t("cmBackward", lang), icon: "arrow_downward", keys: "[", run: () => c.order("backward") },
    { key: "back", label: t("cmBack", lang), icon: "flip_to_back", run: () => c.order("back") },
    "divider",
    ...(c.grouped ? [{ key: "ungroup", label: t("cmUngroup", lang), icon: "ungroup", keys: `${mod}⇧G`, run: c.ungroup }] : sel.length > 1 ? [{ key: "group", label: t("cmGroup", lang), icon: "group_work", keys: `${mod}G`, run: c.group }] : []),
    { key: "auto-layout", label: t("cmAutoLayout", lang), icon: "view_quilt", keys: "⇧A", run: c.autoLayout },
    { key: "make-component", label: t("cmMakeComponent", lang), icon: "widgets", run: c.makeComponent },
    ...(c.goToMain ? [{ key: "go-to-main", label: t("cmGoToMain", lang), icon: "north_east", run: c.goToMain }] : []),
    ...(one && text ? [{ key: "edit-text", label: t("cmEditText", lang), icon: "edit_note", keys: "Enter", run: () => c.editText(one.id) }] : []),
    ...(chain.length
      ? [
          "divider" as const,
          {
            key: "select-layer",
            label: t("cmSelectLayer", lang),
            icon: "layers",
            sub: chain.map((nodeId) => ({ key: `layer:${nodeId}`, label: layerName(nodeId), icon: "subdirectory_arrow_left", run: () => c.select(tree?.nodes.get(nodeId)?.itemIds ?? []) })),
          },
        ]
      : []),
  ];
}
