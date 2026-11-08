
import { useContext, useEffect, useMemo, useState } from "react";
import { type Collection, type ComponentDef, type ComponentProp, type ComponentSet, type Frame, type FramePreset, type Group, type Palette, type VarValue, framePresetOf, layoutOf, paletteIconOf, uid } from "@/lib/tokens";
import { collectionOf, collectionText } from "@/lib/collections";
import { arrangeFlows } from "@/lib/flow";
import { canNest, expandInstances, overridableParts, propertyTargets, variantMatching, variantsOf, withOverride } from "@/lib/instances";
import { labelOfPart } from "@/parts/resize";
import { defaultMeasures } from "@/parts/templates/kit";
import { t, useLang, type Lang, type UIKey } from "@/lib/i18n";
import { partBySlug, reader } from "@/parts/registry";
import { labelOf, nameOf } from "@/parts/labels";
import type { SelectOption } from "./ui";
import type { PropDef } from "@/parts/types";
import { StaticPart } from "./ComponentNode";
import { BehaviorContext } from "./EffectsPanel";
import { Icon } from "./Icon";
import { AlignBox, IconRow, Num, PartMenu, type PlaceFn } from "./PartPanel";
import { Field, IconBtn, ImageRow, PanelShell, Section, Select, Toggle, useDraft } from "./ui";

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

/** What the components tab does to variants and properties, each one operation of the core */
export type ComponentsApi = {
  addVariant: (id: string) => void;
  updateSet: (id: string, patch: { name?: string; props?: { name: string; values: string[]; was?: string; renamed?: Record<string, string> }[] }) => void;
  setVariantValues: (id: string, values: Record<string, string>) => void;
  setProp: (component: string, prop: { id?: string; name: string; type: ComponentProp["type"]; value?: VarValue; targets: string[] }) => void;
  removeProp: (component: string, id: string) => void;
};

const NO_API: ComponentsApi = { addVariant: () => {}, updateSet: () => {}, setVariantValues: () => {}, setProp: () => {}, removeProp: () => {} };

/** what a part in a definition is called in a list of targets: its name, else the words it shows, else its kind */
function partLabel(g: Group | undefined, it: Group["items"][number], lang: Lang): string {
  const def = partBySlug(it.component);
  return (g?.items.length === 1 && g.name) || labelOfPart(def, it.props) || (def ? nameOf(def, lang) : it.label) || it.id;
}

/** The properties a definition gives its instances: each one's name, what it reaches and what it starts as, and buttons
 *  for a new one of each kind there is something for. */
function PropsEditor({ def, components, api, p }: { def: ComponentDef; components: ComponentDef[]; api: ComponentsApi; p: Palette }) {
  const lang = useLang();
  const can = useMemo(() => propertyTargets(def, components), [def, components]);
  const groupOfItem = (id: string) => def.groups.find((g) => g.items.some((it) => it.id === id));
  const options = (type: ComponentProp["type"]): SelectOption[] =>
    type === "text"
      ? can.text.map((x) => {
          const itemId = x.key.slice(0, x.key.lastIndexOf("/")).split("/").pop()!;
          return { key: x.key, label: `${partLabel(groupOfItem(itemId), x.item, lang)} · ${labelOf(x.prop, lang)}`, icon: "title" };
        })
      : type === "bool"
        ? can.layers.map((g) => ({ key: g.id, label: g.instanceOf ? (components.find((c) => c.id === g.instanceOf)?.name ?? g.id) : partLabel(g, g.items[0], lang), icon: g.instanceOf ? "widgets" : paletteIconOf(g.items[0]) }))
        : can.nested.map((g) => ({ key: g.id, label: components.find((c) => c.id === g.instanceOf)?.name ?? g.id, icon: "widgets" }));
  const kinds: { type: ComponentProp["type"]; key: UIKey; icon: string; name: UIKey }[] = [
    { type: "text", key: "cpAddText", icon: "title", name: "cpPropText" },
    { type: "bool", key: "cpAddBool", icon: "toggle_on", name: "cpPropShow" },
    { type: "swap", key: "cpAddSwap", icon: "swap_horiz", name: "cpPropSwap" },
  ];
  const nameFor = (k: (typeof kinds)[number]) => {
    const base = t(k.name, lang);
    const taken = new Set((def.props ?? []).map((x) => x.name));
    let n = 1;
    while (taken.has(n === 1 ? base : `${base} ${n}`)) n++;
    return n === 1 ? base : `${base} ${n}`;
  };
  return (
    <div data-component-props={def.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(def.props ?? []).map((prop) => (
        <div key={prop.id} data-component-prop={prop.name} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 12, background: p.surfaceContainer }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name={kinds.find((k) => k.type === prop.type)!.icon} size={18} color={p.onSurfaceVariant} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field value={prop.name} onChange={(name) => name.trim() && api.setProp(def.id, { ...prop, name })} placeholder={t("cpPropName", lang)} label={t("cpPropName", lang)} p={p} height={36} />
            </div>
            <IconBtn icon="delete" p={p} size={32} onClick={() => api.removeProp(def.id, prop.id)} title={t("cpRemoveProp", lang)} />
          </div>
          <Select options={options(prop.type)} value={prop.targets[0] ?? ""} onChange={(k) => api.setProp(def.id, { ...prop, targets: [k], ...(prop.type === "swap" ? { value: undefined } : {}) })} p={p} label={t("cpPropTarget", lang)} height={36} />
          {prop.type === "bool" && <Toggle on={prop.value !== false} onChange={(on) => api.setProp(def.id, { ...prop, value: on })} p={p} label={t("cpPropDefault", lang)} grow />}
        </div>
      ))}
      {!(def.props ?? []).length && <div style={hintStyle(p)}>{t("cpNoProps", lang)}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {kinds
          .filter((k) => options(k.type).length > 0)
          .map((k) => (
            <button key={k.type} data-add-prop={k.type} onClick={() => api.setProp(def.id, { name: nameFor(k), type: k.type, targets: [options(k.type)[0].key] })} className="m3-press" style={chipBtn(p)}>
              <Icon name="add" size={16} />
              {t(k.key, lang)}
            </button>
          ))}
      </div>
    </div>
  );
}

const chipBtn = (p: Palette): React.CSSProperties => ({ height: 32, padding: "0 12px 0 8px", borderRadius: 16, border: `1px solid ${p.outlineVariant}`, background: "transparent", color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 });

/** a definition drawn as a tile that is dragged onto the canvas, or added from the keyboard */
function ComponentTile({ def, components, onPointerDown, onActivate, p }: { def: ComponentDef; components: ComponentDef[]; onPointerDown: (e: React.PointerEvent, id: string) => void; onActivate: (id: string) => void; p: Palette }) {
  const lang = useLang();
  return (
    /* a button in the look of the thing, not a <button>: what it draws has real buttons in it, and a button may not hold a button */
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
  );
}

/** a definition's own row of controls: how often it is used, editing it, a variant of it, deleting it */
function ComponentActions({ def, uses, editingId, onEdit, onDelete, api, open, onOpen, p }: { def: ComponentDef; uses: number; editingId: string | null; onEdit: (id: string) => void; onDelete: (id: string) => void; api: ComponentsApi; open: boolean; onOpen: () => void; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 2px 0 6px" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("componentUses", lang).replace("{n}", String(uses))}</span>
      <IconBtn icon="tune" p={p} size={32} on={open} onClick={onOpen} title={t("cpComponentProps", lang)} expanded={open} />
      <IconBtn icon="library_add" p={p} size={32} onClick={() => api.addVariant(def.id)} title={t("cpAddVariant", lang)} />
      <IconBtn icon="edit" p={p} size={32} on={editingId === def.id} onClick={() => onEdit(def.id)} title={t("editComponent", lang)} />
      <IconBtn icon="delete" p={p} size={32} danger disabled={!!editingId} onClick={() => onDelete(def.id)} title={t(editingId ? "deleteComponentBusy" : "deleteComponent", lang)} />
    </div>
  );
}

/** A set's variant properties, each a name and its values written out with commas: renaming one keeps the variants
 *  that had it, a value renamed in place keeps them too. */
function SetProps({ set, api, p }: { set: ComponentSet; api: ComponentsApi; p: Palette }) {
  const lang = useLang();
  const write = (i: number, name: string, text: string) => {
    const values = text.split(",").map((v) => v.trim()).filter(Boolean);
    if (!name.trim() || !values.length) return;
    const was = set.props[i];
    /* a value at the same place under other words is that value renamed */
    const renamed = Object.fromEntries(was.values.flatMap((v, j) => (values[j] && values[j] !== v && !values.includes(v) ? [[v, values[j]]] : [])));
    api.updateSet(set.id, { props: set.props.map((x, j) => (j === i ? { name: name.trim(), values, was: x.name, renamed } : { name: x.name, values: x.values, was: x.name })) });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {set.props.map((prop, i) => (
        <SetPropRow key={`${i}:${prop.name}`} name={prop.name} values={prop.values.join(", ")} onWrite={(name, values) => write(i, name, values)} onRemove={set.props.length > 1 ? () => api.updateSet(set.id, { props: set.props.filter((_, j) => j !== i).map((x) => ({ name: x.name, values: x.values, was: x.name })) }) : undefined} p={p} />
      ))}
      <button
        data-add-variant-prop
        onClick={() => {
          let n = set.props.length + 1;
          const taken = new Set(set.props.map((x) => x.name));
          while (taken.has(t("variantFirstProp", lang).replace("1", String(n)))) n++;
          api.updateSet(set.id, { props: [...set.props.map((x) => ({ name: x.name, values: x.values, was: x.name })), { name: t("variantFirstProp", lang).replace("1", String(n)), values: [t("variantDefault", lang)] }] });
        }}
        className="m3-press"
        style={chipBtn(p)}
      >
        <Icon name="add" size={16} />
        {t("cpAddVariantProp", lang)}
      </button>
    </div>
  );
}

/** one variant property as it is typed: written when the field is left, so a comma just typed does not split a value */
function SetPropRow({ name, values, onWrite, onRemove, p }: { name: string; values: string; onWrite: (name: string, values: string) => void; onRemove?: () => void; p: Palette }) {
  const lang = useLang();
  const [n, setN] = useState(name);
  const [v, setV] = useState(values);
  useEffect(() => setN(name), [name]);
  useEffect(() => setV(values), [values]);
  const commit = () => (n !== name || v !== values) && onWrite(n, v);
  return (
    <div data-variant-prop={name} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, borderRadius: 12, background: p.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field value={n} onChange={setN} placeholder={t("cpVariantProp", lang)} label={t("cpVariantProp", lang)} p={p} height={36} />
        </div>
        {onRemove && <IconBtn icon="delete" p={p} size={28} onClick={onRemove} title={t("cpRemoveVariantProp", lang)} />}
      </div>
      <Field value={v} onChange={setV} placeholder={t("cpVariantValues", lang)} label={t("cpVariantValues", lang)} p={p} height={36} />
    </div>
  );
}

export function ComponentsPanel({
  p,
  components,
  sets = [],
  uses,
  editingId,
  onPointerDown,
  onActivate,
  onEdit,
  onRename,
  onDelete,
  api = NO_API,
}: {
  p: Palette;
  components: ComponentDef[];
  /** the sets of variants, by `ComponentDef.set` */
  sets?: ComponentSet[];
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
  api?: ComponentsApi;
}) {
  const lang = useLang();
  /** the definitions whose properties are open */
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  /* a set is listed where its first variant stands; the variants after it go with it */
  const listed = components.filter((c) => !c.set || !sets.some((s) => s.id === c.set) || variantsOf(components, c.set)[0] === c);
  const card = (style?: React.CSSProperties): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 16, background: p.surfaceContainerLow, ...style });
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
      <div style={hintStyle(p)}>{t(components.length ? "componentHint" : "noComponents", lang)}</div>
      {listed.map((first) => {
        const set = first.set ? sets.find((s) => s.id === first.set) : undefined;
        if (!set)
          return (
            <div key={first.id} data-component={first.id} style={card()}>
              <ComponentTile def={first} components={components} onPointerDown={onPointerDown} onActivate={onActivate} p={p} />
              <Field value={first.name} onChange={(name) => onRename(first.id, name)} placeholder={t("componentName", lang)} label={t("componentName", lang)} p={p} height={40} />
              <ComponentActions def={first} uses={uses[first.id] ?? 0} editingId={editingId} onEdit={onEdit} onDelete={onDelete} api={api} open={open.includes(first.id)} onOpen={() => toggle(first.id)} p={p} />
              {open.includes(first.id) && <PropsEditor def={first} components={components} api={api} p={p} />}
            </div>
          );
        return (
          <div key={set.id} data-component-set={set.id} style={card({ border: `1px dashed ${p.primary}` })}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 2px 0 4px", color: p.primary }}>
              <Icon name="category" size={18} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{t("cpVariants", lang)}</span>
            </div>
            <Field value={set.name} onChange={(name) => api.updateSet(set.id, { name })} placeholder={t("cpSetName", lang)} label={t("cpSetName", lang)} p={p} height={40} />
            <SetProps set={set} api={api} p={p} />
            {variantsOf(components, set.id).map((def) => (
              <div key={def.id} data-component={def.id} data-variant={def.name} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 6, borderRadius: 12, background: p.surface }}>
                <ComponentTile def={def} components={components} onPointerDown={onPointerDown} onActivate={onActivate} p={p} />
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(2, set.props.length)}, minmax(0, 1fr))`, gap: 4 }}>
                  {set.props.map((prop) => {
                    /* a value that would give two variants the same values is not on offer */
                    const taken = (v: string) => variantsOf(components, set.id).some((c) => c.id !== def.id && set.props.every((x) => (x.name === prop.name ? v : (def.variant?.[x.name] ?? x.values[0])) === (c.variant?.[x.name] ?? x.values[0])));
                    return <Select key={prop.name} options={prop.values.filter((v) => v === def.variant?.[prop.name] || !taken(v)).map((v) => ({ key: v, label: v }))} value={def.variant?.[prop.name] ?? prop.values[0]} onChange={(v) => api.setVariantValues(def.id, { [prop.name]: v })} p={p} label={`${prop.name} · ${def.name}`} height={36} />;
                  })}
                </div>
                <ComponentActions def={def} uses={uses[def.id] ?? 0} editingId={editingId} onEdit={onEdit} onDelete={onDelete} api={api} open={open.includes(def.id)} onOpen={() => toggle(def.id)} p={p} />
                {open.includes(def.id) && <PropsEditor def={def} components={components} api={api} p={p} />}
              </div>
            ))}
          </div>
        );
      })}
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

/** The variant properties of an instance's set, each a choice of its values, and the swap to any other component. */
function SwapSection({ group, def, components, sets, hostId, onSwap, p }: { group: Group; def: ComponentDef; components: ComponentDef[]; sets: ComponentSet[]; hostId: string | null; onSwap: (component: string) => void; p: Palette }) {
  const lang = useLang();
  const set = def.set ? sets.find((s) => s.id === def.set) : undefined;
  /* what it may become: anything that would not put a component inside itself */
  const others = components.filter((c) => canNest(components, hostId, c.id));
  const nameOfDef = (c: ComponentDef) => {
    const s = c.set ? sets.find((x) => x.id === c.set) : undefined;
    return s ? `${s.name} · ${Object.values(c.variant ?? {}).join(", ")}` : c.name;
  };
  return (
    <Section id="instance-swap" icon="swap_horiz" title={set ? t("cpVariants", lang) : t("cpSwap", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {set?.props.map((prop) => (
          <div key={prop.name} data-variant-choice={prop.name}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px 6px" }}>{prop.name}</div>
            <Select
              options={prop.values.map((v) => ({ key: v, label: v }))}
              value={def.variant?.[prop.name] ?? prop.values[0]}
              onChange={(v) => {
                const to = variantMatching(components, set.id, { ...def.variant, [prop.name]: v }, [prop.name, ...set.props.map((x) => x.name).filter((x) => x !== prop.name)]);
                if (to && to.id !== group.instanceOf) onSwap(to.id);
              }}
              p={p}
              label={prop.name}
            />
          </div>
        ))}
        <Select options={others.map((c) => ({ key: c.id, label: nameOfDef(c), icon: c.set ? "category" : "widgets" }))} value={def.id} onChange={(id) => id !== def.id && onSwap(id)} p={p} label={t("cpSwap", lang)} />
      </div>
    </Section>
  );
}

/** what an instance gives its component's properties: words, on or off, a component for a nested instance */
function InstanceProps({ group, def, components, onProps, p }: { group: Group; def: ComponentDef; components: ComponentDef[]; onProps: (values: Record<string, VarValue | null>) => void; p: Palette }) {
  const lang = useLang();
  const can = useMemo(() => propertyTargets(def, components), [def, components]);
  if (!def.props?.length) return null;
  return (
    <Section id="instance-props" icon="tune" title={t("cpComponentProps", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {def.props.map((prop) => {
          const own = group.properties?.[prop.id];
          const changed = own !== undefined;
          const text = prop.type === "text" ? can.text.find((x) => x.key === prop.targets[0]) : undefined;
          const base = prop.type === "text" ? String(text?.item.props?.[text.prop.key] ?? prop.value) : prop.value;
          const value = changed ? own : base;
          const reset = changed && <IconBtn icon="restart_alt" p={p} size={28} onClick={() => onProps({ [prop.id]: null })} title={t("resetOverride", lang)} />;
          return (
            <div key={prop.id} data-instance-prop={prop.name}>
              {prop.type !== "bool" && (
                <div style={{ display: "flex", alignItems: "center", minHeight: 28, padding: "0 4px 4px", gap: 4 }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: changed ? p.primary : p.onSurfaceVariant }}>{prop.name}</span>
                  {reset}
                </div>
              )}
              {prop.type === "text" ? (
                <Field value={String(value ?? "")} onChange={(v) => onProps({ [prop.id]: v })} placeholder={String(base ?? "")} label={prop.name} p={p} height={44} />
              ) : prop.type === "bool" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Toggle on={value !== false} onChange={(on) => onProps({ [prop.id]: on })} p={p} label={prop.name} grow />
                  </div>
                  {reset}
                </div>
              ) : (
                <Select options={components.filter((c) => c.id !== def.id && canNest(components, def.id, c.id)).map((c) => ({ key: c.id, label: c.name, icon: "widgets" }))} value={String(value ?? "")} onChange={(id) => onProps({ [prop.id]: id })} p={p} label={prop.name} />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** The panel of a placed instance: which definition it comes from, its variant and what it can be swapped for, its
 *  component's properties, the ways to the main component and back to plain parts, and what it changes. */
export function InstanceInspector({
  group,
  def,
  components,
  sets = [],
  hostId = null,
  palette: p,
  locked,
  inFlow,
  onToggleLock,
  onDuplicate,
  onDelete,
  onEdit,
  onDetach,
  onOverrides,
  onSwap,
  onProps,
  onReset,
  onPlace,
  selectionKey,
}: {
  group: Group;
  def: ComponentDef;
  components: ComponentDef[];
  sets?: ComponentSet[];
  /** the definition being edited, which the instance stands in: what would nest it in itself is not on offer */
  hostId?: string | null;
  palette: Palette;
  locked: boolean;
  inFlow: boolean;
  onToggleLock?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** goes to the main component; a phone has no way to edit one */
  onEdit?: () => void;
  onDetach: () => void;
  onOverrides: (overrides: Group["overrides"]) => void;
  onSwap?: (component: string) => void;
  onProps?: (values: Record<string, VarValue | null>) => void;
  onReset?: () => void;
  onPlace?: PlaceFn;
  selectionKey: string;
}) {
  const lang = useLang();
  const parts = useMemo(() => overridableParts(def, components), [def, components]);
  const set = def.set ? sets.find((s) => s.id === def.set) : undefined;
  const title = set ? `${set.name} · ${Object.values(def.variant ?? {}).join(", ")}` : def.name;
  const changes = !!group.overrides || !!group.properties;
  return (
    <PanelShell
      p={p}
      locked={locked}
      onUnlock={onToggleLock}
      head={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "0 2px 0 6px", color: p.onSurfaceVariant }}>
          <Icon name={set ? "category" : "widgets"} size={20} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("instanceOfName", lang).replace("{name}", title)}</span>
          <PartMenu p={p} locked={locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 4px 14px" }}>
        {onEdit && (
          <button onClick={onEdit} data-instance-edit data-go-to-main className="m3-press" style={wideBtn(p, true)}>
            <Icon name="north_east" size={20} />
            {t("cpGoToMain", lang)}
          </button>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {onReset && (
            <button onClick={onReset} disabled={!changes} data-instance-reset className="m3-press" style={{ ...wideBtn(p), opacity: changes ? 1 : 0.5, cursor: changes ? "pointer" : "default" }}>
              <Icon name="restart_alt" size={20} />
              {t("cpResetAll", lang)}
            </button>
          )}
          <button onClick={onDetach} data-instance-detach title={t("detachInstance", lang)} className="m3-press" style={{ ...wideBtn(p), ...(onReset ? { width: 44, flex: "0 0 44px", padding: 0 } : {}) }}>
            <Icon name="link_off" size={20} />
            {!onReset && t("detachInstance", lang)}
          </button>
        </div>
        <div style={hintStyle(p)}>{t("instanceHint", lang)}</div>
      </div>
      {onSwap && <SwapSection group={group} def={def} components={components} sets={sets} hostId={hostId} onSwap={onSwap} p={p} />}
      {onProps && <InstanceProps group={group} def={def} components={components} onProps={onProps} p={p} />}
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

function CollectionCard({ c, models, onChange, onDelete, p }: { c: Collection; models?: string[]; onChange: (patch: Partial<Collection>) => void; onDelete: () => void; p: Palette }) {
  const lang = useLang();
  /* The words typed are kept as typed: reading them back from the rows would swallow a line just
   * started or a space after a comma. They give way when the rows change from elsewhere, an undo say. */
  const [draft, type] = useDraft({ fields: c.fields, rows: c.rows }, collectionText, collectionOf);
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
        onChange={(text) => onChange(type(text))}
        placeholder={t("collectionTable", lang)}
        label={t("collectionTable", lang)}
        p={p}
        multiline
        rows={7}
        height={44}
      />
      <div style={hintStyle(p)}>{t("collectionTable", lang)}</div>
      {/* the API model the rows are examples of: what mock data is made from */}
      {(models?.length || c.model) && (
        <div data-collection-model>
          <Select
            options={[{ key: "", label: t("apiNoModel", lang), icon: "block" }, ...[...new Set([...(models ?? []), ...(c.model ? [c.model] : [])])].map((m) => ({ key: m, label: m, icon: "data_object" }))]}
            value={c.model ?? ""}
            onChange={(model) => onChange({ model: model || undefined })}
            p={p}
            label={t("apiCollectionModel", lang)}
            height={40}
          />
        </div>
      )}
    </div>
  );
}

/** a collection without the fields a patch took away (a model unlinked), so what is saved never says `undefined` */
const withoutUndefined = (c: Collection): Collection => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as Collection;

export function DataPanel({ p, collections, models, onChange }: { p: Palette; collections: Collection[]; /** the API's models, for a collection to name */ models?: string[]; onChange: (next: Collection[]) => void }) {
  const lang = useLang();
  const add = () => onChange([...collections, { id: uid(), name: t("collectionDefaultName", lang).replace("{n}", String(collections.length + 1)), fields: ["title", "subtitle"], rows: [["A", "1"], ["B", "2"], ["C", "3"]] }]);
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
      <div style={hintStyle(p)}>{t("noCollections", lang)}</div>
      {collections.map((c) => (
        <CollectionCard key={c.id} c={c} models={models} p={p} onChange={(patch) => onChange(collections.map((x) => (x.id === c.id ? withoutUndefined({ ...x, ...patch }) : x)))} onDelete={() => onChange(collections.filter((x) => x.id !== c.id))} />
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
