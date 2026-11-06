import { labelOfPart } from "@/parts/resize";
import { partBySlug } from "@/parts/registry";
import { kitBySlug } from "@/parts/kits";
import { nameOf as partNameOf } from "@/parts/labels";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComponentDef, Frame, Group, Item, Palette, framePresetOf, isPhoneFrame, paletteIconOf } from "@/lib/tokens";
import { familyOf } from "@/lib/variants";
import { ancestorsOf, selectedNodes, type LayerNode, type LayerTree } from "@/lib/layerTree";
import { Icon } from "./Icon";
import { sizeWord } from "./ReusePanels";
import { Field } from "./ui";
import { Lang, t, useLang } from "@/lib/i18n";

/* The layers panel as a tree, the way Figma's reads: every screen, the boxes on it, what each box holds, down to the
 * atoms. A row opens and closes with its chevron, shows what kind of layer it is (a box's auto layout direction, a
 * kit, an instance), is renamed in place, and is dragged to another place in its box or into another box. Hovering a
 * row offers its lock and its eye. Click selects, Shift extends the range, Ctrl/Cmd adds or takes away one; the
 * canvas's selection opens the tree to itself and scrolls into view. A search keeps the matches and what holds them.
 *
 * A layout's children are listed in its run (first at the top); anything else front first, as it is drawn. */

const ROW_H = 28;
const INDENT = 14;

/** a part is called by the first text it shows, then by its type */
function nameOf(it: Item, lang: Lang) {
  const def = partBySlug(it.component);
  return labelOfPart(def, it.props) || (def && partNameOf(def, lang)) || it.label;
}

function typeOf(it: Item, lang: Lang) {
  const def = partBySlug(it.component);
  return (def && partNameOf(def, lang)) || it.label;
}

/** the author's name for a group, or what its parts make it; an instance goes by its definition, a kit by the kit */
export function layerLabel(g: Group, lang: Lang, components?: ComponentDef[]) {
  const named = g.name?.trim();
  if (named) return named;
  const first = g.items[0];
  if (g.instanceOf) return components?.find((c) => c.id === g.instanceOf)?.name || first.label;
  if (g.kit) {
    const kit = kitBySlug(g.kit.slug);
    if (kit) return partNameOf(kit, lang);
  }
  return g.free ? `${t("group", lang)} × ${g.items.length}` : g.items.length > 1 ? `${typeOf(first, lang)} × ${g.items.length}` : nameOf(first, lang);
}

/** The field a row's name is edited in: Enter or leaving it keeps the words, Escape keeps the old ones.
 *  An emptied name gives the group back the name its parts make it. */
function RenameField({ p, value, onDone }: { p: Palette; value: string; onDone: (next: string | null) => void }) {
  const lang = useLang();
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  /* Escape ends the edit and the blur that follows must not undo that */
  const done = useRef(false);
  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  const keep = useRef(() => {});
  keep.current = () => finish(text);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    /* the canvas keeps the focus where it is when pressed, so a press there is no blur */
    const press = (e: PointerEvent) => {
      if (e.target !== ref.current) keep.current();
    };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, []);
  return (
    <input
      ref={ref}
      value={text}
      data-layer-rename
      aria-label={t("layerName", lang)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(text);
        if (e.key === "Escape") finish(null);
      }}
      style={{ flex: 1, minWidth: 0, height: 22, boxSizing: "border-box", padding: "0 6px", border: `1.5px solid ${p.primary}`, borderRadius: 4, outline: "none", background: p.surface, color: p.onSurface, font: "inherit", fontSize: 12 }}
    />
  );
}

/** the glyph a layer is drawn with: what kind of thing it is, and for a box which way its layout runs */
function iconOf(n: LayerNode, frame: Frame | undefined): { icon: string; title?: "lyRow" | "lyColumn" | "lyGrid" | "lyWrap" | "lyFrame" | "lyKit" | "lyInstance" } {
  switch (n.kind) {
    case "screen":
      return { icon: frame && isPhoneFrame(frame) ? "smartphone" : frame && framePresetOf(frame) === "tablet" ? "tablet" : "desktop_windows" };
    case "box":
    case "kit": {
      const dir = n.flow === "row" ? { icon: "view_column", title: "lyRow" as const } : n.flow === "column" ? { icon: "view_agenda", title: "lyColumn" as const } : n.flow === "grid" ? { icon: "grid_view", title: "lyGrid" as const } : n.flow === "wrap" ? { icon: "wrap_text", title: "lyWrap" as const } : { icon: "crop_free", title: "lyFrame" as const };
      /* a box that is not a plain box (a card, a sheet) keeps its own glyph unless it lays out */
      if (n.kind === "box" && !n.flow && n.item && n.item.component !== "box") return { icon: paletteIconOf(n.item) };
      return n.kind === "kit" && !n.flow ? { icon: "auto_awesome_mosaic", title: "lyKit" } : dir;
    }
    case "instance":
      return { icon: "diamond", title: "lyInstance" };
    case "group":
      return { icon: "select_all" };
    case "run":
      return { icon: "view_week" };
    default:
      return { icon: n.item ? paletteIconOf(n.item) : "widgets" };
  }
}

type Row = { id: string; depth: number; node: LayerNode };
type Drop = { parent: string | null; index: number; line: { depth: number; at: number } | null; into: string | null; items?: { group: string; order: string[] } };

export type LayersPanelProps = {
  p: Palette;
  tree: LayerTree;
  groups: Group[];
  frames: Frame[];
  components?: ComponentDef[];
  selectedIds: string[];
  selectedFrameId: string | null;
  /** the screen opened when nothing on a screen is selected */
  focusFrameId: string | null;
  /** `range` with Shift, `toggle` with Ctrl/Cmd */
  onSelect: (itemIds: string[], how: "set" | "toggle" | "range") => void;
  onSelectScreen: (frameId: string) => void;
  /** a group taken to another place in the tree (lib/core/ops/layers.ts) */
  onMove: (groupId: string, parent: string | null, index: number) => void;
  /** the parts of a hand-made group or a run in a new order */
  onReorderItems: (groupId: string, ids: string[]) => void;
  onToggleLock: (groupId: string) => void;
  onToggleHidden: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onRenameScreen?: (frameId: string, name: string) => void;
  /** the row under the pointer, outlined on the canvas */
  onHover?: (nodeId: string | null) => void;
};

export function LayersPanel({ p, tree, groups, frames, components, selectedIds, selectedFrameId, focusFrameId, onSelect, onSelectScreen, onMove, onReorderItems, onToggleLock, onToggleHidden, onRename, onRenameScreen, onHover }: LayersPanelProps) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusFrameId ? [`s:${focusFrameId}`] : []));
  const byGroup = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byFrame = useMemo(() => new Map(frames.map((f) => [f.id, f])), [frames]);
  const selNodes = useMemo(() => selectedNodes(tree, selectedIds), [tree, selectedIds]);
  const selSet = useMemo(() => new Set(selNodes), [selNodes]);

  const labelOf = (n: LayerNode): string => {
    if (n.kind === "screen") {
      const f = n.frameId ? byFrame.get(n.frameId) : undefined;
      if (!f) return "";
      const fam = familyOf(frames, f.id);
      return `${f.name || t("screen", lang)}${fam.length > 1 ? ` · ${sizeWord(f, lang)}` : ""}`;
    }
    if (n.kind === "item") return n.item ? nameOf(n.item, lang) : "";
    const g = n.groupId ? byGroup.get(n.groupId) : undefined;
    return g ? layerLabel(g, lang, components) : "";
  };
  /* what a search finds a layer by: its name and its part's kind */
  const wordsOf = (n: LayerNode) => [labelOf(n), ...(n.item ? [typeOf(n.item, lang), n.item.component ?? ""] : [])].map((w) => w.toLowerCase());

  /* the canvas's selection opens the tree down to it, and the last of it scrolls into view */
  const listRef = useRef<HTMLDivElement>(null);
  const primary = selNodes[selNodes.length - 1];
  useEffect(() => {
    if (!selNodes.length && !selectedFrameId) return;
    setOpen((cur) => {
      const next = new Set(cur);
      let changed = false;
      for (const s of selNodes)
        for (const a of ancestorsOf(tree, s))
          if (!next.has(a)) {
            next.add(a);
            changed = true;
          }
      return changed ? next : cur;
    });
    // opened for a new selection only; the author's own folding stays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(" "), selectedFrameId]);
  useEffect(() => {
    const id = primary ?? (selectedFrameId ? `s:${selectedFrameId}` : null);
    if (!id) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [primary, selectedFrameId, open]);
  /* a screen picked elsewhere opens in the tree */
  useEffect(() => {
    if (!focusFrameId) return;
    setOpen((cur) => (cur.has(`s:${focusFrameId}`) ? cur : new Set([...cur, `s:${focusFrameId}`])));
  }, [focusFrameId]);

  /* the rows shown, top to bottom: the open part of the tree, or the matches with what holds them */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let keep: Set<string> | null = null;
    if (query) {
      keep = new Set();
      for (const [id, n] of tree.nodes) {
        if (n.kind === "screen" || !wordsOf(n).some((w) => w.includes(query))) continue;
        keep.add(id);
        for (const a of ancestorsOf(tree, id)) keep.add(a);
      }
    }
    const walk = (id: string, depth: number) => {
      const node = tree.nodes.get(id);
      if (!node || (keep && !keep.has(id))) return;
      out.push({ id, depth, node });
      if ((keep || open.has(id)) && node.children.length) for (const c of node.children) walk(c, depth + 1);
    };
    for (const r of tree.roots) walk(r, 0);
    for (const r of tree.loose) walk(r, 0);
    return out;
    // the words of a layer change with its group or its language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, open, query, lang, byGroup]);

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ---------- selecting ---------- */
  const anchor = useRef<string | null>(null);
  const pick = (row: Row, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const n = row.node;
    if (n.kind === "screen") {
      anchor.current = null;
      if (n.frameId) onSelectScreen(n.frameId);
      return;
    }
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => r.id === anchor.current);
      const b = rows.findIndex((r) => r.id === row.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        /* a range takes the rows at the anchor's level, so a box and its own parts are not picked together */
        const depth = rows[a].depth;
        const ids = rows.slice(lo, hi + 1).filter((r) => r.depth === depth && r.node.kind !== "screen").flatMap((r) => r.node.itemIds);
        onSelect(ids, "range");
        return;
      }
    }
    anchor.current = row.id;
    onSelect(n.itemIds, e.metaKey || e.ctrlKey ? "toggle" : "set");
  };

  /* F2 names the selected layer, wherever the focus is short of a field being typed in */
  const f2 = useRef<(e: KeyboardEvent) => void>(() => {});
  f2.current = (e) => {
    if (e.key !== "F2") return;
    const to = e.target as HTMLElement | null;
    if (to && (to.tagName === "INPUT" || to.tagName === "TEXTAREA" || to.isContentEditable)) return;
    const n = primary ? tree.nodes.get(primary) : undefined;
    if (!n || n.kind === "item" || !n.groupId) return;
    e.preventDefault();
    setRenamingId(n.id);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => f2.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /* ---------- dragging a row ---------- */
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDropState] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const setDrop = (d: Drop | null) => {
    dropRef.current = d;
    setDropState(d);
  };
  const press = useRef<{ id: string; y: number; moved: boolean } | null>(null);
  /** a drag has just ended: the click that follows its release selects nothing */
  const justDragged = useRef(false);
  const blocked = (dragged: LayerNode, target: string | null): boolean => {
    /* not into itself or what it holds */
    for (let at = target; at; at = tree.nodes.get(at)?.parent ?? null) if (at === dragged.id) return true;
    return false;
  };
  /** where a row being dragged would go with the pointer at `y` (from the top of the list's content) */
  const dropAt = (y: number, dragged: LayerNode): Drop | null => {
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor(y / ROW_H)));
    const row = rows[i];
    if (!row) return null;
    const frac = y / ROW_H - i;
    const n = row.node;
    /* a part of a hand-made group or a run moves only among its siblings */
    if (dragged.kind === "item") {
      if (n.kind !== "item" || n.parent !== dragged.parent || !dragged.parent) return null;
      const g = tree.nodes.get(dragged.parent)!;
      const order = g.children.filter((c) => c !== dragged.id);
      let at = order.indexOf(n.id);
      if (at < 0) at = order.length;
      if (frac >= 0.5) at++;
      order.splice(at, 0, dragged.id);
      const group = byGroup.get(dragged.parent);
      if (!group) return null;
      /* a hand-made group is listed front first, and kept back to front */
      const ids = order.map((c) => tree.nodes.get(c)!.item!.id);
      return { parent: dragged.parent, index: at, line: { depth: row.depth, at: frac >= 0.5 ? i + 1 : i }, into: null, items: { group: dragged.parent, order: group.free ? [...ids].reverse() : ids } };
    }
    if (n.kind === "item") return null;
    const holds = n.kind === "box" || n.kind === "kit" || n.kind === "screen";
    const into = holds && (n.kind === "screen" || (frac > 0.25 && frac < 0.75) || (frac >= 0.75 && open.has(n.id) && n.children.length > 0));
    if (into) {
      if (n.kind !== "screen" && blocked(dragged, n.id)) return null;
      /* only on its own screen: a layer is taken to another screen by dragging it there on the canvas */
      if (n.kind === "screen" && !screenHolds(n.id, dragged)) return null;
      return { parent: n.kind === "screen" ? null : n.id, index: 0, line: null, into: n.id };
    }
    /* before or after the row, among its siblings */
    const parent = n.parent;
    const parentNode = parent ? tree.nodes.get(parent) : undefined;
    if (parent && blocked(dragged, parent)) return null;
    if (parentNode?.kind === "screen" ? !screenHolds(parentNode.id, dragged) : !parentNode && tree.nodes.get(tree.roots[0] ?? "")?.kind === "screen") return null;
    const siblings = (parentNode ? parentNode.children : tree.roots).filter((c) => c !== dragged.id);
    let at = siblings.indexOf(n.id);
    if (at < 0) return null;
    if (frac >= 0.5) at++;
    return { parent: parentNode?.kind === "screen" ? null : (parent ?? null), index: at, line: { depth: row.depth, at: frac >= 0.5 ? i + 1 : i }, into: null };
  };
  /** the screen a dragged layer stands on is the only one it can be dropped at the top of */
  const screenHolds = (screenNode: string, dragged: LayerNode) => ancestorsOf(tree, dragged.id).includes(screenNode);

  const onRowPointerDown = (e: React.PointerEvent, row: Row) => {
    if (e.button !== 0 || renamingId) return;
    const target = e.target as HTMLElement;
    if (target.closest("button[data-layer-toggle], input")) return;
    press.current = { id: row.id, y: e.clientY, moved: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      if (!pr.moved && Math.abs(e.clientY - pr.y) < 4) return;
      const node = tree.nodes.get(pr.id);
      if (!node || node.kind === "screen" || query || node.locked) return;
      pr.moved = true;
      setDragId(pr.id);
      const list = listRef.current;
      if (!list) return;
      const box = list.getBoundingClientRect();
      /* near the edges the list scrolls on its own */
      if (e.clientY < box.top + 24) list.scrollTop -= 8;
      if (e.clientY > box.bottom - 24) list.scrollTop += 8;
      setDrop(dropAt(e.clientY - box.top + list.scrollTop - 6, node));
    };
    const up = () => {
      const pr = press.current;
      press.current = null;
      if (!pr?.moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      const node = tree.nodes.get(pr.id);
      setDragId(null);
      const d = dropRef.current;
      setDrop(null);
      if (d && node) {
        if (d.items) onReorderItems(d.items.group, d.items.order);
        else if (node.groupId) onMove(node.groupId, d.parent, d.index);
        /* the box it went into opens, so the layer is seen where it landed */
        const into = d.into ?? d.parent;
        if (into) setOpen((cur) => (cur.has(into) ? cur : new Set([...cur, into])));
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !press.current?.moved) return;
      press.current = null;
      setDragId(null);
      setDrop(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  });

  /* a row's background: chosen, under a chosen layer, or under the pointer */
  const underChosen = useMemo(() => {
    const s = new Set<string>();
    const add = (id: string) => {
      for (const c of tree.nodes.get(id)?.children ?? []) {
        s.add(c);
        add(c);
      }
    };
    for (const id of selNodes) add(id);
    return s;
  }, [tree, selNodes]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const hover = (id: string | null) => {
    setHoverId(id);
    onHover?.(id);
  };

  return (
    <div data-layers-panel style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "10px 10px 6px", flex: "0 0 auto" }}>
        <Field value={q} onChange={setQ} placeholder={t("lyFind", lang)} p={p} icon="search" height={34} />
      </div>
      <div
        ref={listRef}
        role="tree"
        aria-label={t("layers", lang)}
        className="no-scrollbar"
        onPointerLeave={() => hover(null)}
        style={{ flex: 1, overflowY: "auto", padding: "6px 6px 16px", position: "relative", userSelect: "none" }}
      >
        {rows.length === 0 ? (
          <div role={query ? "status" : undefined} style={{ padding: 24, textAlign: "center", color: p.outline, fontSize: 12 }}>
            <Icon name={query ? "search_off" : "layers_clear"} size={32} />
            <div style={{ marginTop: 8 }}>{t(query ? "noLayerMatch" : "noLayers", lang)}</div>
          </div>
        ) : (
          rows.map((row) => {
            const n = row.node;
            const on = selSet.has(n.id) || (n.kind === "screen" && n.frameId === selectedFrameId);
            const g = n.groupId ? byGroup.get(n.groupId) : undefined;
            const frame = n.frameId ? byFrame.get(n.frameId) : undefined;
            const { icon, title } = iconOf(n, frame);
            const label = labelOf(n);
            const canToggle = n.kind !== "screen" && n.kind !== "item" && !!g;
            const isHover = hoverId === n.id && !dragId;
            const showTools = canToggle && (isHover || on);
            const opened = open.has(n.id) || !!query;
            const accent = n.kind === "instance" || n.kind === "kit" ? p.onTertiaryContainer : p.onSurfaceVariant;
            return (
              <div
                key={row.id}
                data-layer-row={row.id}
                data-layer-kind={n.kind}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={on}
                aria-expanded={n.children.length ? opened : undefined}
                title={n.placed === "absolute" ? t("lyAbsolute", lang) : undefined}
                onPointerDown={(e) => onRowPointerDown(e, row)}
                onPointerEnter={() => hover(n.id)}
                onClick={(e) => {
                  if (justDragged.current || renamingId === n.id) return;
                  pick(row, e);
                }}
                onDoubleClick={() => {
                  if (n.kind === "screen" ? onRenameScreen : canToggle) setRenamingId(n.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  height: ROW_H,
                  boxSizing: "border-box",
                  paddingLeft: 4 + row.depth * INDENT,
                  paddingRight: 4,
                  borderRadius: 6,
                  background: on ? p.secondaryContainer : drop?.into === n.id ? `${p.primary}1f` : underChosen.has(n.id) ? `${p.secondaryContainer}66` : isHover ? p.surfaceContainerHigh : "transparent",
                  outline: drop?.into === n.id ? `1.5px solid ${p.primary}` : "none",
                  outlineOffset: -1.5,
                  color: on ? p.onSecondaryContainer : p.onSurface,
                  opacity: dragId === n.id ? 0.45 : n.hidden ? 0.55 : 1,
                  cursor: "default",
                }}
              >
                {n.children.length ? (
                  <button
                    data-layer-toggle
                    aria-label={t(opened ? "hideParts" : "showParts", lang)}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(n.id);
                    }}
                    style={{ width: 16, height: 20, border: "none", background: "transparent", padding: 0, color: on ? p.onSecondaryContainer : p.onSurfaceVariant, cursor: "pointer", display: "grid", placeItems: "center", flex: "0 0 auto" }}
                  >
                    <span style={{ display: "inline-flex", transform: opened ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
                      <Icon name="chevron_right" size={16} />
                    </span>
                  </button>
                ) : (
                  <span style={{ width: 16, flex: "0 0 auto" }} />
                )}
                <span title={title ? t(title, lang) : undefined} style={{ display: "inline-flex", flex: "0 0 auto", color: on ? p.onSecondaryContainer : accent }}>
                  <Icon name={icon} size={16} fill={n.kind === "instance"} />
                </span>
                {renamingId === n.id ? (
                  <RenameField
                    p={p}
                    value={n.kind === "screen" ? (frame?.name ?? "") : (g?.name ?? label)}
                    onDone={(next) => {
                      setRenamingId(null);
                      if (next === null) return;
                      if (n.kind === "screen" && n.frameId) {
                        if (next.trim() && next.trim() !== frame?.name) onRenameScreen?.(n.frameId, next.trim());
                        return;
                      }
                      /* a name left as what the parts already make it is no name */
                      if (g && next.trim() !== (g.name ?? label)) onRename(g.id, next.trim());
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: n.kind === "screen" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                )}
                {n.kind === "kit" && (
                  <span title={t("lyKit", lang)} style={{ display: "inline-flex", flex: "0 0 auto", color: on ? p.onSecondaryContainer : p.onTertiaryContainer }}>
                    <Icon name="auto_awesome_mosaic" size={12} />
                  </span>
                )}
                {n.placed === "absolute" && <Icon name="push_pin" size={12} color={p.outline} />}
                {g && (showTools || g.hidden) && (
                  <button
                    data-layer-toggle="hidden"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidden(g.id);
                    }}
                    title={t(g.hidden ? "showLayer" : "hideLayer", lang)}
                    aria-label={t(g.hidden ? "showLayer" : "hideLayer", lang)}
                    aria-pressed={!!g.hidden}
                    style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: g.hidden ? (on ? p.onSecondaryContainer : p.primary) : on ? p.onSecondaryContainer : p.outline, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto" }}
                  >
                    <Icon name={g.hidden ? "visibility_off" : "visibility"} size={15} />
                  </button>
                )}
                {g && (showTools || g.locked) && (
                  <button
                    data-layer-toggle="lock"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(g.id);
                    }}
                    title={t(g.locked ? "unlock" : "lock", lang)}
                    aria-label={t(g.locked ? "unlock" : "lock", lang)}
                    aria-pressed={!!g.locked}
                    style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: g.locked ? (on ? p.onSecondaryContainer : p.primary) : on ? p.onSecondaryContainer : p.outline, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto" }}
                  >
                    <Icon name={g.locked ? "lock" : "lock_open"} size={15} />
                  </button>
                )}
              </div>
            );
          })
        )}
        {drop?.line && <div aria-hidden data-layer-drop-line style={{ position: "absolute", left: 6 + 4 + drop.line.depth * INDENT + 16, right: 10, top: 6 + drop.line.at * ROW_H - 1, height: 2, borderRadius: 1, background: p.primary, pointerEvents: "none" }} />}
      </div>
    </div>
  );
}
