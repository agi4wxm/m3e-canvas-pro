
import { useContext, useEffect, useMemo, useState } from "react";
import { type Collection, type ComponentDef, type Frame, type FramePreset, type Group, type Palette, framePresetOf, layoutOf, paletteIconOf, uid } from "@/lib/tokens";
import { collectionOf, collectionText } from "@/lib/collections";
import { arrangeFlows } from "@/lib/flow";
import { expandInstances, overridableParts, withOverride } from "@/lib/instances";
import { defaultMeasures } from "@/parts/templates/kit";
import { t, useLang, type Lang, type UIKey } from "@/lib/i18n";
import { partBySlug, reader } from "@/parts/registry";
import { labelOf, nameOf } from "@/parts/labels";
import type { PropDef } from "@/parts/types";
import { StaticPart } from "./ComponentNode";
import { BehaviorContext } from "./EffectsPanel";
import { Icon } from "./Icon";
import { AlignBox, IconRow, Num, PartMenu, type PlaceFn } from "./PartPanel";
import { Field, IconBtn, ImageRow, PanelShell, Section, Select, Toggle } from "./ui";

/* The panels of the three things a document can reuse: components (the left tab, and the panel of a
 * placed instance), data (the left tab, and the Repeat section of a layout container) and the sizes of
 * a screen. They wear the inline Palette style of components/ui.tsx. */

const PRESET_TEXT: Record<FramePreset, { icon: string; key: UIKey }> = {
  phone: { icon: "smartphone", key: "phoneFrame" },
  tablet: { icon: "tablet", key: "tabletFrame" },
  desktop: { icon: "desktop_windows", key: "desktopFrame" },
};

/** what a size is called, for the labels on and around a screen */
export const sizeWord = (f: Frame, lang: Lang): string => {
  const preset = framePresetOf(f);
  return preset === "custom" ? `${f.w ?? ""}×${f.h ?? ""}` : t(PRESET_TEXT[preset].key, lang);
};

const hintStyle = (p: Palette): React.CSSProperties => ({ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" });

const wideBtn = (p: Palette, primary?: boolean): React.CSSProperties => ({ height: 44, borderRadius: 22, border: "none", background: primary ? p.primaryContainer : p.secondaryContainer, color: primary ? p.onPrimaryContainer : p.onSecondaryContainer, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" });

/* ---------- components ---------- */

/** a definition drawn small, from the same expansion the canvas draws an instance with */
function ComponentThumb({ def, components, p }: { def: ComponentDef; components: ComponentDef[]; p: Palette }) {
  /* from a file, a layout in a definition may not have been placed yet; a part's own guess of its size is plenty at this scale */
  const parts = useMemo(() => {
    const all = expandInstances({ groups: def.groups, components });
    const guess = defaultMeasures(all);
    return arrangeFlows(all, guess).flatMap((g) => layoutOf(g, guess));
  }, [def, components]);
  const zoom = Math.min(1, 216 / Math.max(1, def.w), 96 / Math.max(1, def.h));
  return (
    <div style={{ height: Math.max(48, def.h * zoom) + 16, borderRadius: 12, background: p.surfaceContainer, overflow: "hidden", position: "relative", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 8, top: 8, width: def.w, height: def.h, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        {parts.map((pl) => (
          <div key={pl.item.id} style={{ position: "absolute", left: pl.x, top: pl.y }}>
            <StaticPart item={pl.item} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComponentsPanel({
  p,
  components,
  uses,
  editingId,
  onPointerDown,
  onActivate,
  onEdit,
  onRename,
  onDelete,
}: {
  p: Palette;
  components: ComponentDef[];
  /** how many instances each definition has, by id */
  uses: Record<string, number>;
  /** the definition being edited right now */
  editingId: string | null;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  /** chosen without a pointer, or clicked: added where the view is looking */
  onActivate: (id: string) => void;
  onEdit: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const lang = useLang();
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
      <div style={hintStyle(p)}>{t(components.length ? "componentHint" : "noComponents", lang)}</div>
      {components.map((def) => (
        <div key={def.id} data-component={def.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 16, background: p.surfaceContainerLow }}>
          {/* a button in the look of the thing, not a <button>: what it draws has real buttons in it, and a button may not hold a button */}
          <div
            role="button"
            tabIndex={0}
            data-component-tile={def.id}
            aria-label={`${def.name}: ${t("componentHint", lang)}`}
            onPointerDown={(e) => onPointerDown(e, def.id)}
            /* a click made with a pointer is the drag's business; this is the one from the keyboard */
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onActivate(def.id);
            }}
            className="m3-tile-face"
            style={{ display: "block", width: "100%", cursor: "grab", touchAction: "none" }}
          >
            <ComponentThumb def={def} components={components} p={p} />
          </div>
          <Field value={def.name} onChange={(name) => onRename(def.id, name)} placeholder={t("componentName", lang)} label={t("componentName", lang)} p={p} height={40} />
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 2px 0 6px" }}>
            <span style={{ flex: 1, fontSize: 12, color: p.onSurfaceVariant }}>{t("componentUses", lang).replace("{n}", String(uses[def.id] ?? 0))}</span>
            <IconBtn icon="edit" p={p} size={36} on={editingId === def.id} onClick={() => onEdit(def.id)} title={t("editComponent", lang)} />
            <IconBtn icon="delete" p={p} size={36} danger disabled={!!editingId} onClick={() => onDelete(def.id)} title={t(editingId ? "deleteComponentBusy" : "deleteComponent", lang)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** one thing an instance can change of a part */
function OverrideRow({ d, base, value, changed, onSet, p }: { d: PropDef; base: unknown; value: unknown; changed: boolean; onSet: (v: string | boolean | undefined) => void; p: Palette }) {
  const lang = useLang();
  const label = labelOf(d, lang);
  const control =
    d.kind === "text" ? (
      <Field value={String(value ?? "")} onChange={onSet} placeholder={String(base ?? "") || label} label={label} p={p} multiline={d.multiline} rows={3} height={44} />
    ) : d.kind === "icon" ? (
      <IconRow slots={[{ key: d.key, value: typeof value === "string" && value ? value : null, title: label }]} onPick={(_, icon) => onSet(icon ?? "")} p={p} />
    ) : d.kind === "image" ? (
      <ImageRow value={typeof value === "string" && value ? value : undefined} onChange={(src) => onSet(src ?? "")} p={p} />
    ) : (
      <Toggle on={value === true} onChange={onSet} p={p} label={label} grow />
    );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", minHeight: d.kind === "bool" && !changed ? 0 : 28, padding: "0 4px 4px", gap: 4 }}>
        {d.kind !== "bool" && <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: changed ? p.primary : p.onSurfaceVariant }}>{label}</span>}
        {d.kind === "bool" && changed && <span style={{ flex: 1 }} />}
        {changed && <IconBtn icon="restart_alt" p={p} size={28} onClick={() => onSet(undefined)} title={t("resetOverride", lang)} />}
      </div>
      {control}
    </div>
  );
}

/** The panel of a placed instance: which definition it comes from, the way back to plain parts, and what it changes. */
export function InstanceInspector({
  group,
  def,
  components,
  palette: p,
  locked,
  inFlow,
  onToggleLock,
  onDuplicate,
  onDelete,
  onEdit,
  onDetach,
  onOverrides,
  onPlace,
  selectionKey,
}: {
  group: Group;
  def: ComponentDef;
  components: ComponentDef[];
  palette: Palette;
  locked: boolean;
  inFlow: boolean;
  onToggleLock?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** opens the definition; a phone has no way to edit one */
  onEdit?: () => void;
  onDetach: () => void;
  onOverrides: (overrides: Group["overrides"]) => void;
  onPlace?: PlaceFn;
  selectionKey: string;
}) {
  const lang = useLang();
  const parts = useMemo(() => overridableParts(def, components), [def, components]);
  return (
    <PanelShell
      p={p}
      locked={locked}
      onUnlock={onToggleLock}
      head={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "0 2px 0 6px", color: p.onSurfaceVariant }}>
          <Icon name="widgets" size={20} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("instanceOfName", lang).replace("{name}", def.name)}</span>
          <PartMenu p={p} locked={locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 4px 14px" }}>
        {onEdit && (
          <button onClick={onEdit} data-instance-edit className="m3-press" style={wideBtn(p, true)}>
            <Icon name="edit" size={20} />
            {t("editComponent", lang)}
          </button>
        )}
        <button onClick={onDetach} data-instance-detach className="m3-press" style={wideBtn(p)}>
          <Icon name="link_off" size={20} />
          {t("detachInstance", lang)}
        </button>
        <div style={hintStyle(p)}>{t("instanceHint", lang)}</div>
      </div>
      {parts.length === 0 && <div style={{ ...hintStyle(p), padding: "0 8px" }}>{t("noOverrides", lang)}</div>}
      {parts.map(({ path, item, props }) => {
        const part = partBySlug(item.component);
        if (!part) return null;
        const values = reader(part, item.props);
        const read = (d: PropDef) => (d.kind === "bool" ? values.b(d.key) : values.s(d.key));
        return (
          <Section key={path} id={`override:${path}`} icon={paletteIconOf(item)} title={nameOf(part, lang)} p={p}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {props
                .filter((d) => !d.when || d.when(values))
                .map((d) => {
                  const key = `${path}/${d.key}`;
                  const changed = group.overrides?.[key] !== undefined;
                  return <OverrideRow key={key} d={d} base={read(d)} value={changed ? group.overrides?.[key] : read(d)} changed={changed} p={p} onSet={(v) => onOverrides(withOverride(group.overrides, key, v, read(d)))} />;
                })}
            </div>
          </Section>
        );
      })}
      <RepeatSection p={p} />
      {onPlace && !inFlow && (
        <Section id="part-align" icon="grid_on" title={t("align", lang)} p={p}>
          <AlignBox key={selectionKey} onPlace={onPlace} p={p} />
        </Section>
      )}
    </PanelShell>
  );
}

/* ---------- data ---------- */

function CollectionCard({ c, onChange, onDelete, p }: { c: Collection; onChange: (patch: Partial<Collection>) => void; onDelete: () => void; p: Palette }) {
  const lang = useLang();
  /* The words typed are kept as typed: reading them back from the rows would swallow a line just
   * started or a space after a comma. They give way when the rows change from elsewhere, an undo say. */
  const [draft, setDraft] = useState(() => collectionText(c));
  const parsed = JSON.stringify(collectionOf(draft));
  const now = JSON.stringify({ fields: c.fields, rows: c.rows });
  useEffect(() => {
    if (parsed !== now) setDraft(collectionText(c));
    // only a change of the rows themselves can make the draft stale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  return (
    <div data-collection={c.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 16, background: p.surfaceContainerLow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field value={c.name} onChange={(name) => onChange({ name })} placeholder={t("collectionName", lang)} label={t("collectionName", lang)} p={p} height={40} />
        </div>
        <IconBtn icon="delete" p={p} size={36} danger onClick={onDelete} title={t("deleteCollection", lang)} />
      </div>
      <Field
        value={draft}
        onChange={(text) => {
          setDraft(text);
          onChange(collectionOf(text));
        }}
        placeholder={t("collectionTable", lang)}
        label={t("collectionTable", lang)}
        p={p}
        multiline
        rows={7}
        height={44}
      />
      <div style={hintStyle(p)}>{t("collectionTable", lang)}</div>
    </div>
  );
}

export function DataPanel({ p, collections, onChange }: { p: Palette; collections: Collection[]; onChange: (next: Collection[]) => void }) {
  const lang = useLang();
  const add = () => onChange([...collections, { id: uid(), name: t("collectionDefaultName", lang).replace("{n}", String(collections.length + 1)), fields: ["title", "subtitle"], rows: [["A", "1"], ["B", "2"], ["C", "3"]] }]);
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
      <div style={hintStyle(p)}>{t("noCollections", lang)}</div>
      {collections.map((c) => (
        <CollectionCard key={c.id} c={c} p={p} onChange={(patch) => onChange(collections.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))} onDelete={() => onChange(collections.filter((x) => x.id !== c.id))} />
      ))}
      <button onClick={add} data-add-collection className="m3-press" style={wideBtn(p)}>
        <Icon name="add" size={20} />
        {t("addCollection", lang)}
      </button>
    </div>
  );
}

/** On a layout container: draw its first child once per row of a collection. */
export function RepeatSection({ p }: { p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const repeat = b.repeatHost?.repeat;
  const collections = b.collections ?? [];
  const chosen = collections.find((c) => c.id === repeat?.collection);
  if (!b.repeatHost) return null;
  return (
    <Section id="part-repeat" icon="repeat" title={t("repeat", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {collections.length ? (
          <Select
            options={[{ key: "", label: t("repeatNone", lang), icon: "block" }, ...collections.map((c) => ({ key: c.id, label: c.name || c.id, icon: "table_chart" }))]}
            value={chosen?.id ?? ""}
            onChange={(collection) => b.patchRepeat?.(collection ? { collection } : undefined)}
            p={p}
            label={t("repeat", lang)}
          />
        ) : (
          <div style={hintStyle(p)}>{t("noCollections", lang)}</div>
        )}
        {chosen && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("repeatLimit", lang)}</span>
              <Num value={repeat?.limit ?? chosen.rows.length} min={0} max={200} title={t("repeatLimit", lang)} lazy onChange={(limit) => b.patchRepeat?.({ collection: chosen.id, ...(limit < chosen.rows.length ? { limit } : {}) })} p={p} />
            </div>
            <div style={hintStyle(p)}>
              {t("repeatFields", lang)}: {chosen.fields.map((f) => `{{${f}}}`).join(" ")}
            </div>
            <div style={hintStyle(p)}>{t("repeatHint", lang)}</div>
          </>
        )}
      </div>
    </Section>
  );
}

/* ---------- sizes ---------- */

/** On a screen: its other sizes, and the sizes it can still be given. */
export function VariantSection({ p, frame, family, missing, onCreate, onJump }: { p: Palette; frame: Frame; family: Frame[]; missing: FramePreset[]; onCreate: (preset: FramePreset) => void; onJump: (id: string) => void }) {
  const lang = useLang();
  return (
    <Section id="frame-variants" icon="devices" title={t("variants", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {family.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {family.map((f) => (
              <button key={f.id} onClick={() => onJump(f.id)} data-variant-jump={f.id} aria-current={f.id === frame.id || undefined} className="m3-press" style={{ height: 36, padding: "0 12px 0 8px", borderRadius: 18, border: "none", background: f.id === frame.id ? p.secondaryContainer : p.surfaceContainerLow, color: f.id === frame.id ? p.onSecondaryContainer : p.onSurfaceVariant, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name={framePresetOf(f) === "phone" ? "smartphone" : framePresetOf(f) === "tablet" ? "tablet" : "desktop_windows"} size={18} />
                {sizeWord(f, lang)}
              </button>
            ))}
          </div>
        )}
        {missing.map((preset) => {
          const word = t(PRESET_TEXT[preset].key, lang);
          return (
            <button key={preset} onClick={() => onCreate(preset)} data-create-variant={preset} className="m3-press" style={wideBtn(p)}>
              <Icon name={PRESET_TEXT[preset].icon} size={20} />
              {t("createVariant", lang).replace("{size}", lang === "en" ? word.toLowerCase() : word)}
            </button>
          );
        })}
        <div style={hintStyle(p)}>{t("variantHint", lang)}</div>
      </div>
    </Section>
  );
}
