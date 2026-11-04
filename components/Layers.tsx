
import { labelOfPart } from "@/parts/resize";
import { partBySlug } from "@/parts/registry";
import { nameOf as partNameOf } from "@/parts/labels";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ComponentDef, Frame, Group, Item, Palette, explodeGroup, framePresetOf, isPhoneFrame, paletteIconOf } from "@/lib/tokens";
import { familiesOf, familyOf } from "@/lib/variants";
import { Icon } from "./Icon";
import { sizeWord } from "./ReusePanels";
import { Field, Select } from "./ui";
import { Lang, t, useLang } from "@/lib/i18n";

/* Rows never animate their size: opening a row only adds rows under it, so
 * nothing stretches. Only the drag itself moves.
 *
 * The panel is a tree with two kinds of level. A z level lists what is drawn on
 * top of what, front first: the groups of a screen, and the parts of a free group.
 * A group level lists the parts of one group in reading order (left to right, top
 * to bottom). Every level is reordered by dragging the handle; the page turns the
 * new order back into a group. */

/** a part is called by the first text it shows, then by its type */
function nameOf(it: Item, lang: Lang) {
  const def = partBySlug(it.component);
  return labelOfPart(def, it.props) || (def && partNameOf(def, lang)) || it.label;
}

function typeOf(it: Item, lang: Lang) {
  const def = partBySlug(it.component);
  return (def && partNameOf(def, lang)) || it.label;
}

/** the author's name for a group, or what its parts make it; an instance goes by its definition */
function runLabel(g: Group, lang: Lang, components?: ComponentDef[]) {
  const named = g.name?.trim();
  if (named) return named;
  const first = g.items[0];
  if (g.instanceOf) return components?.find((c) => c.id === g.instanceOf)?.name || first.label;
  return g.free ? `${t("group", lang)} × ${g.items.length}` : g.items.length > 1 ? `${typeOf(first, lang)} × ${g.items.length}` : nameOf(first, lang);
}

/** what a search can find a group by: its name, and the name and type of each of its parts */
function searchWords(g: Group, lang: Lang, components?: ComponentDef[]): string[] {
  return [
    runLabel(g, lang, components),
    ...g.items.flatMap((it) => {
      const def = partBySlug(it.component);
      return [nameOf(it, lang), typeOf(it, lang), def?.name ?? "", it.component ?? ""];
    }),
  ];
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
      aria-label={t("layerName", lang)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(text);
        if (e.key === "Escape") finish(null);
      }}
      style={{ flex: 1, minWidth: 0, height: 28, boxSizing: "border-box", padding: "0 8px", border: `1.5px solid ${p.primary}`, borderRadius: 8, outline: "none", background: p.surface, color: p.onSurface, font: "inherit", fontSize: 12 }}
    />
  );
}

function Row({
  id,
  p,
  depth,
  icon,
  label,
  on,
  onSelect,
  open,
  onToggle,
  locked,
  onLock,
  hidden,
  onHide,
  renaming,
  renameFrom,
  onRenameStart,
  onRenameDone,
  still,
  onDragging,
  children,
}: {
  id: string;
  p: Palette;
  depth: number;
  icon: ReactNode;
  label: string;
  on: boolean;
  onSelect: (add: boolean) => void;
  /** set when the row can open to show what it holds */
  open?: boolean;
  onToggle?: () => void;
  /** the group's lock, so the row shows which state it is in */
  locked?: boolean;
  /** flips the group's lock; set only on a whole group's row */
  onLock?: () => void;
  /** the group starts the preview hidden */
  hidden?: boolean;
  /** flips that; set only on a whole group's row */
  onHide?: () => void;
  /** the row's name is being edited, starting from `renameFrom` */
  renaming?: boolean;
  renameFrom?: string;
  /** set on a row whose name can be edited */
  onRenameStart?: () => void;
  onRenameDone?: (next: string | null) => void;
  /** the list is filtered: its order is not all there, so it cannot be dragged */
  still?: boolean;
  onDragging: (dragging: boolean) => void;
  children?: ReactNode;
}) {
  const lang = useLang();
  const controls = useDragControls();
  const h = depth === 0 ? 40 : 36;
  return (
    <Reorder.Item value={id} layout="position" transition={{ layout: { duration: 0 } }} dragListener={false} dragControls={controls} onDragStart={() => onDragging(true)} onDragEnd={() => onDragging(false)} style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: h,
          padding: "0 6px 0 2px",
          marginLeft: depth * 14,
          borderRadius: depth === 0 ? 14 : 12,
          background: on ? p.secondaryContainer : depth === 0 ? p.surfaceContainerLow : p.surface,
          color: on ? p.onSecondaryContainer : p.onSurface,
          userSelect: "none",
        }}
      >
        <span
          onPointerDown={(e) => {
            if (still) return;
            e.preventDefault();
            controls.start(e);
          }}
          style={{ cursor: still ? "default" : "grab", color: still ? p.outlineVariant : p.outline, display: "grid", placeItems: "center", width: depth === 0 ? 24 : 20, height: h, touchAction: "none" }}
        >
          <Icon name="drag_indicator" size={18} />
        </span>
        {renaming ? (
          <RenameField p={p} value={renameFrom ?? label} onDone={(next) => onRenameDone?.(next)} />
        ) : (
          <button
            onClick={(e) => onSelect(e.shiftKey)}
            onDoubleClick={onRenameStart}
            onKeyDown={(e) => {
              if (e.key !== "F2" || !onRenameStart) return;
              e.preventDefault();
              e.stopPropagation();
              onRenameStart();
            }}
            title={onRenameStart ? t("renameLayer", lang) : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              height: h,
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              opacity: hidden ? 0.55 : 1,
            }}
          >
            <span style={{ display: "inline-flex", gap: 2, color: on ? p.onSecondaryContainer : p.primary }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: depth === 0 ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          </button>
        )}
        {onHide && (
          <button
            onClick={onHide}
            title={t(hidden ? "showLayer" : "hideLayer", lang)}
            aria-label={t(hidden ? "showLayer" : "hideLayer", lang)}
            aria-pressed={!!hidden}
            className="m3-press"
            style={{ width: 28, height: 28, borderRadius: 14, border: "none", background: "transparent", color: hidden ? (on ? p.onSecondaryContainer : p.primary) : p.outline, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto" }}
          >
            <Icon name={hidden ? "visibility_off" : "visibility"} size={20} fill={hidden} />
          </button>
        )}
        {onLock && (
          <button
            onClick={onLock}
            title={t(locked ? "unlock" : "lock", lang)}
            aria-label={t(locked ? "unlock" : "lock", lang)}
            aria-pressed={!!locked}
            className="m3-press"
            style={{ width: 28, height: 28, borderRadius: 14, border: "none", background: "transparent", color: locked ? (on ? p.onSecondaryContainer : p.primary) : p.outline, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto" }}
          >
            <Icon name={locked ? "lock" : "lock_open"} size={20} fill={locked} />
          </button>
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            title={t(open ? "hideParts" : "showParts", lang)}
            aria-expanded={open}
            className="m3-press"
            style={{ width: 28, height: 28, borderRadius: 14, border: "none", background: "transparent", color: on ? p.onSecondaryContainer : p.onSurfaceVariant, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto" }}
          >
            <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms" }}>
              <Icon name="chevron_right" size={20} />
            </span>
          </button>
        )}
      </div>
      {open && children}
    </Reorder.Item>
  );
}

/** One reorderable level: drag the handles; `values` is the shown order. */
function Level({ values, onReorder, children }: { values: string[]; onReorder: (next: string[]) => void; children: ReactNode }) {
  return (
    <Reorder.Group axis="y" values={values} onReorder={onReorder} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 0, margin: 0 }}>
      {children}
    </Reorder.Group>
  );
}

/** the parts of one group, in reading order */
function RunParts({
  run,
  p,
  depth,
  sel,
  onSelect,
  onReorder,
  onDragging,
}: {
  run: Group;
  p: Palette;
  depth: number;
  sel: Set<string>;
  onSelect: (itemIds: string[], add: boolean) => void;
  /** the run's parts in a new reading order */
  onReorder: (ids: string[]) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const lang = useLang();
  const ids = run.items.map((it) => it.id);
  return (
    <Level values={ids} onReorder={onReorder}>
      {run.items.map((it) => (
        <Row
          key={it.id}
          id={it.id}
          p={p}
          depth={depth}
          icon={<Icon name={paletteIconOf(it)} size={16} />}
          label={nameOf(it, lang)}
          on={sel.has(it.id)}
          onSelect={(add) => onSelect([it.id], add)}
          onDragging={onDragging}
        />
      ))}
    </Level>
  );
}

/** The z-order of one screen, top layer first, reordered by dragging the handles.
 *  A group opens to its parts in reading order; a free group opens to the
 *  runs it holds, front first, and each of those opens in turn. */
export function LayersPanel({
  p,
  frames,
  frameId,
  onFrame,
  groups,
  components,
  widths,
  selectedIds,
  onSelect,
  onReorder,
  onToggleLock,
  onToggleHidden,
  onRename,
  onReorderItems,
  onDragging,
}: {
  p: Palette;
  frames: Frame[];
  frameId: string | null;
  onFrame: (id: string) => void;
  /** the runs on the chosen frame, in canvas order (bottom first) */
  groups: Group[];
  /** what an instance on the screen is an instance of */
  components?: ComponentDef[];
  widths: Record<string, number>;
  selectedIds: string[];
  /** `add` is set when Shift was held, to extend the selection */
  onSelect: (itemIds: string[], add: boolean) => void;
  /** new order, top layer first */
  onReorder: (topFirst: string[]) => void;
  /** flips a group's lock from its row's lock icon */
  onToggleLock: (groupId: string) => void;
  /** flips whether a group starts the preview hidden, from its row's eye */
  onToggleHidden: (groupId: string) => void;
  /** a group's name, or "" to give it up */
  onRename: (groupId: string, name: string) => void;
  /** a group's parts in a new order: back to front for a free group, reading order for any other */
  onReorderItems: (groupId: string, ids: string[]) => void;
  /** a drag on any level starting or ending, so the page can record one undo step for the whole drag */
  onDragging: (dragging: boolean) => void;
}) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const allTopFirst = useMemo(() => [...groups].reverse(), [groups]);
  const topFirst = useMemo(() => (query ? allTopFirst.filter((g) => searchWords(g, lang, components).some((w) => w.toLowerCase().includes(query))) : allTopFirst), [allTopFirst, query, lang, components]);
  /* sizes of one screen stand together under its name; a family of one is just the screen */
  const families = useMemo(() => familiesOf(frames), [frames]);
  const family = useMemo(() => (frameId ? familyOf(frames, frameId) : []), [frames, frameId]);
  const ids = topFirst.map((g) => g.id);
  const sel = new Set(selectedIds);
  /* F2 names the selected group, wherever the focus is short of a field being typed in */
  const f2 = useRef<(e: KeyboardEvent) => void>(() => {});
  f2.current = (e) => {
    if (e.key !== "F2") return;
    const to = e.target as HTMLElement | null;
    if (to && (to.tagName === "INPUT" || to.tagName === "TEXTAREA" || to.isContentEditable)) return;
    const g = topFirst.find((x) => x.items.some((it) => sel.has(it.id)));
    if (!g) return;
    e.preventDefault();
    setRenamingId(g.id);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => f2.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** the parts of a free group, front first, and the flat back-to-front list they make */
  const freeRuns = (g: Group) => [...explodeGroup(g, widths)].reverse();
  const flatten = (runsTopFirst: Group[]) => [...runsTopFirst].reverse().flatMap((r) => r.items.map((it) => it.id));

  const groupBody = (g: Group, depth: number) => {
    if (!g.free) {
      return <RunParts run={g} p={p} depth={depth} sel={sel} onSelect={onSelect} onReorder={(order) => onReorderItems(g.id, order)} onDragging={onDragging} />;
    }
    const runs = freeRuns(g);
    const runIds = runs.map((r) => r.id);
    const byId = new Map(runs.map((r) => [r.id, r]));
    const reorderRuns = (next: string[]) => onReorderItems(g.id, flatten(next.map((id) => byId.get(id)).filter((r): r is Group => !!r)));
    return (
      <Level values={runIds} onReorder={reorderRuns}>
        {runs.map((r) => (
            <Row
              key={r.id}
              id={r.id}
              p={p}
              depth={depth}
              icon={r.items.slice(0, 3).map((it, k) => <Icon key={k} name={paletteIconOf(it)} size={16} />)}
              label={runLabel(r, lang)}
              on={r.items.some((it) => sel.has(it.id))}
              onSelect={(add) => onSelect(r.items.map((it) => it.id), add)}
              onDragging={onDragging}
            />
        ))}
      </Level>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {frames.length > 1 && (
        /* the screen whose layers are listed, picked from a dropdown the way a tap's target is */
        <div style={{ padding: "12px 12px 4px", flex: "0 0 auto" }}>
          <Select
            options={families.flatMap((list) =>
              list.map((f, i) => ({
                key: f.id,
                label: list.length > 1 ? `${i ? "↳ " : ""}${f.name || t("screen", lang)} · ${sizeWord(f, lang)}` : f.name || t("screen", lang),
                icon: isPhoneFrame(f) ? "smartphone" : framePresetOf(f) === "tablet" ? "tablet" : "desktop_windows",
              })),
            )}
            value={frameId && frames.some((f) => f.id === frameId) ? frameId : frames[0].id}
            onChange={onFrame}
            p={p}
            label={t("screens", lang)}
          />
          {family.length > 1 && (
            <div data-layer-sizes style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {family.map((f) => (
                <button key={f.id} onClick={() => onFrame(f.id)} aria-current={f.id === frameId || undefined} className="m3-press" style={{ height: 32, padding: "0 10px 0 6px", borderRadius: 16, border: "none", background: f.id === frameId ? p.secondaryContainer : p.surfaceContainerLow, color: f.id === frameId ? p.onSecondaryContainer : p.onSurfaceVariant, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name={isPhoneFrame(f) ? "smartphone" : framePresetOf(f) === "tablet" ? "tablet" : "desktop_windows"} size={16} />
                  {sizeWord(f, lang)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: "12px 12px 0", flex: "0 0 auto" }}>
        <Field value={q} onChange={setQ} placeholder={t("search", lang)} p={p} icon="search" height={40} />
      </div>
      <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "8px 10px 12px" }}>
        {topFirst.length === 0 ? (
          <div role={query ? "status" : undefined} style={{ padding: 24, textAlign: "center", color: p.outline, fontSize: 12 }}>
            <Icon name={query ? "search_off" : "layers_clear"} size={32} />
            <div style={{ marginTop: 8 }}>{t(query ? "noLayerMatch" : "noLayers", lang)}</div>
          </div>
        ) : (
          /* a filtered list is not the whole order: reordering it would throw the rest out of place */
          <Level values={ids} onReorder={query ? () => {} : onReorder}>
            {topFirst.map((g) => {
              const canOpen = g.free || g.items.length > 1;
              const open = canOpen && openIds.has(g.id);
              return (
                <Row
                  key={g.id}
                  id={g.id}
                  p={p}
                  depth={0}
                  icon={g.free ? <Icon name="group_work" size={18} /> : g.instanceOf ? <Icon name="widgets" size={18} /> : g.items.slice(0, 3).map((it, k) => <Icon key={k} name={paletteIconOf(it)} size={18} />)}
                  label={runLabel(g, lang, components)}
                  on={g.items.some((it) => sel.has(it.id))}
                  onSelect={(add) => onSelect(g.items.map((it) => it.id), add)}
                  open={canOpen ? open : undefined}
                  onToggle={canOpen ? () => toggle(g.id) : undefined}
                  locked={g.locked}
                  onLock={() => onToggleLock(g.id)}
                  hidden={g.hidden}
                  onHide={() => onToggleHidden(g.id)}
                  renaming={renamingId === g.id}
                  renameFrom={g.name ?? runLabel(g, lang, components)}
                  onRenameStart={() => setRenamingId(g.id)}
                  onRenameDone={(next) => {
                    setRenamingId(null);
                    /* a name left as what the parts already make it is no name */
                    if (next !== null && next.trim() !== (g.name ?? runLabel(g, lang, components))) onRename(g.id, next.trim());
                  }}
                  still={!!query}
                  onDragging={onDragging}
                >
                  {groupBody(g, 1)}
                </Row>
              );
            })}
          </Level>
        )}
      </div>
    </div>
  );
}
