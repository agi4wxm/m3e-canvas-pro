import { fieldBindOf, fieldVarOf } from "@/lib/bindings/bind";
import { useContext, useEffect, useState } from "react";
import type { Doc, DocVar, Item, Palette, VarCollection, VarType, VarValue } from "@/lib/tokens";
import { BIND_FIELDS, collectionIdOf, collectionsOf, DEFAULT_COLLECTION, startValueOf, valueIn, type BindField } from "@/lib/variables";
import { colorCss } from "@/lib/look";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { BehaviorContext } from "./EffectsPanel";
import { ColorPick } from "./LookPanel";
import { Icon } from "./Icon";
import { Field, IconBtn, Section, Select, Toggle, type SelectOption } from "./ui";
import { Num } from "./PartPanel";

/* Variables the way Figma's panel has them: a collection at a time, its modes as columns of values (here, rows under
 * each variable, since the panel is narrow), typed variables (color, number, words, on/off), and which mode the
 * document shows. A screen's own mode is chosen in its panel (`ScreenModes`), and a field of the design is bound to a
 * variable by the button beside it (`BindButton`). Every change is an operation of the core (lib/core/ops/data.ts). */

export type VariablesApi = {
  addCollection: (name: string, modes: string[]) => void;
  updateCollection: (id: string, patch: { name?: string; modes?: { id?: string; name: string }[]; dark?: string | null }) => void;
  removeCollection: (id: string) => void;
  addVar: (v: { name: string; type: VarType; value: VarValue; collection: string }) => void;
  updateVar: (id: string, patch: { name?: string; type?: VarType; value?: VarValue; values?: Record<string, VarValue>; drives?: "dark" | null }) => void;
  removeVar: (id: string) => void;
  setMode: (collection: string, mode: string | null, screen?: string) => void;
};

export const TYPE_TEXT: Record<VarType, { key: UIKey; icon: string }> = {
  color: { key: "vrTypeColor", icon: "palette" },
  number: { key: "vrTypeNumber", icon: "tag" },
  text: { key: "vrTypeText", icon: "text_fields" },
  bool: { key: "vrTypeBool", icon: "toggle_on" },
};

/** what a collection is called: its name, or the default one's own */
export const collectionName = (c: VarCollection, lang: Parameters<typeof t>[1]) => c.name || (c.id === DEFAULT_COLLECTION ? t("vrDefaultCollection", lang) : c.id);
/** what a mode is called: its name, or its place */
export const modeName = (c: VarCollection, id: string, lang: Parameters<typeof t>[1]) => {
  const at = c.modes.findIndex((m) => m.id === id);
  return c.modes[at]?.name || t("vrModeNth", lang).replace("{n}", String(at + 1));
};

const label = (p: Palette): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "4px 4px 0" });
const hint = (p: Palette): React.CSSProperties => ({ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" });
const chip = (p: Palette): React.CSSProperties => ({ height: 32, padding: "0 12px 0 8px", borderRadius: 16, border: `1px solid ${p.outlineVariant}`, background: "transparent", color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 });

/** a field that writes when it is left, so a name being typed is not refused half way for clashing */
function LazyField({ value, onCommit, label, p, height = 36, grow }: { value: string; onCommit: (v: string) => void; label: string; p: Palette; height?: number; /** takes the room left in a row */ grow?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === "Enter" && v !== value && onCommit(v)} style={{ flex: grow ? 1 : undefined, minWidth: 0 }}>
      <Field value={v} onChange={setV} placeholder={label} label={label} p={p} height={height} />
    </div>
  );
}

/** one value of a variable, in the control its type takes */
export function VarValueControl({ type, value, onChange, label, p }: { type: VarType; value: VarValue; onChange: (v: VarValue) => void; label: string; p: Palette }) {
  const lang = useLang();
  if (type === "color") return <ColorPick value={typeof value === "string" ? value : undefined} onChange={(c) => c && onChange(c)} label={label} p={p} />;
  if (type === "bool") return <Toggle on={value === true} onChange={onChange} p={p} label={label} grow />;
  if (type === "number")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <Num value={typeof value === "number" ? value : 0} min={-99999} max={99999} step="any" title={label} onChange={onChange} p={p} />
      </div>
    );
  return <LazyField value={String(value ?? "")} onCommit={onChange} label={label || t("effectValue", lang)} p={p} />;
}

function VarCard({ v, c, api, p }: { v: DocVar; c: VarCollection; api: VariablesApi; p: Palette }) {
  const lang = useLang();
  return (
    <div data-var-row={v.name} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 12, background: p.surfaceContainerLow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span title={t(TYPE_TEXT[v.type].key, lang)} style={{ display: "inline-flex", color: p.onSurfaceVariant }}>
          {v.type === "color" ? <span style={{ width: 18, height: 18, borderRadius: 5, background: colorCss(v.value) ?? "transparent", boxShadow: `inset 0 0 0 1px ${p.outlineVariant}` }} /> : <Icon name={TYPE_TEXT[v.type].icon} size={18} />}
        </span>
        <LazyField grow value={v.name} onCommit={(name) => name.trim() && api.updateVar(v.id, { name: name.trim() })} label={t("vrName", lang)} p={p} />
        <IconBtn icon="delete" p={p} size={32} danger onClick={() => api.removeVar(v.id)} title={t("vrRemoveVar", lang)} />
      </div>
      {c.modes.map((m) => (
        <div key={m.id} data-var-mode={modeName(c, m.id, lang)}>
          <VarValueControl type={v.type} value={valueIn(v, m.id, c)} onChange={(x) => api.updateVar(v.id, { values: { [m.id]: x } })} label={modeName(c, m.id, lang)} p={p} />
        </div>
      ))}
      {v.type === "bool" && <Toggle on={v.drives === "dark"} onChange={(on) => api.updateVar(v.id, { drives: on ? "dark" : null })} p={p} label={t("vrDrivesDark", lang)} grow />}
    </div>
  );
}

export function VariablesPanel({ p, doc, api }: { p: Palette; doc: Pick<Doc, "vars" | "varCollections" | "varModes">; api: VariablesApi }) {
  const lang = useLang();
  const collections = collectionsOf(doc);
  const [chosen, setChosen] = useState(collections[0]?.id ?? DEFAULT_COLLECTION);
  const c = collections.find((x) => x.id === chosen) ?? collections[0];
  const vars = (doc.vars ?? []).filter((v) => c && collectionIdOf(v, collections) === c.id);
  /* a collection just added is the one shown */
  const [count, setCount] = useState(collections.length);
  useEffect(() => {
    if (collections.length > count) setChosen(collections[collections.length - 1].id);
    setCount(collections.length);
  }, [collections.length]);
  if (!c) return null;
  const modeRow = (m: { id: string; name: string }, i: number) => (
    <div key={m.id} data-mode={m.name || String(i + 1)} style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <LazyField grow value={m.name || modeName(c, m.id, lang)} onCommit={(name) => name.trim() && api.updateCollection(c.id, { modes: c.modes.map((x) => (x.id === m.id ? { id: x.id, name: name.trim() } : { id: x.id, name: x.name || modeName(c, x.id, lang) })) })} label={t("vrModeName", lang)} p={p} />
      {c.modes.length > 1 && <IconBtn icon="delete" p={p} size={28} onClick={() => api.updateCollection(c.id, { modes: c.modes.filter((x) => x.id !== m.id).map((x) => ({ id: x.id, name: x.name || modeName(c, x.id, lang) })) })} title={t("vrRemoveMode", lang)} />}
    </div>
  );
  const modeOptions: SelectOption[] = c.modes.map((m) => ({ key: m.id, label: modeName(c, m.id, lang) }));
  return (
    <div data-variables-panel className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 16px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
      <div style={hint(p)}>{t("vrEmpty", lang)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Select options={collections.map((x) => ({ key: x.id, label: collectionName(x, lang), icon: "folder" }))} value={c.id} onChange={setChosen} p={p} label={t("vrCollection", lang)} height={40} />
        </div>
        <IconBtn icon="create_new_folder" p={p} size={36} onClick={() => api.addCollection(t("vrCollection", lang) + " " + (collections.length + 1), [t("vrLight", lang), t("vrDark", lang)])} title={t("vrAddCollection", lang)} />
        <IconBtn icon="folder_delete" p={p} size={36} danger disabled={c.id === DEFAULT_COLLECTION && !vars.length} onClick={() => api.removeCollection(c.id)} title={t("vrRemoveCollection", lang)} />
      </div>
      <LazyField value={collectionName(c, lang)} onCommit={(name) => name.trim() && api.updateCollection(c.id, { name: name.trim() })} label={t("vrCollectionName", lang)} p={p} height={40} />
      <Section id="var-modes" icon="view_column" title={t("vrModes", lang)} p={p}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {c.modes.map(modeRow)}
          <button
            data-add-mode
            onClick={() => api.updateCollection(c.id, { modes: [...c.modes.map((x) => ({ id: x.id, name: x.name || modeName(c, x.id, lang) })), { name: c.modes.length === 1 ? t("vrDark", lang) : t("vrModeNth", lang).replace("{n}", String(c.modes.length + 1)) }] })}
            className="m3-press"
            style={chip(p)}
          >
            <Icon name="add" size={16} />
            {t("vrAddMode", lang)}
          </button>
          {c.modes.length > 1 && (
            <>
              <div style={label(p)}>{t("vrDarkMode", lang)}</div>
              <Select options={[{ key: "", label: t("vrNone", lang), icon: "block" }, ...modeOptions]} value={c.dark ?? ""} onChange={(k) => api.updateCollection(c.id, { dark: k || null })} p={p} label={t("vrDarkMode", lang)} />
              <div style={label(p)}>{t("vrModeOfDoc", lang)}</div>
              <Select options={[{ key: "", label: c.dark ? t("vrModeAutoDoc", lang) : modeName(c, c.modes[0].id, lang), icon: "auto_mode" }, ...modeOptions]} value={doc.varModes?.[c.id] ?? ""} onChange={(k) => api.setMode(c.id, k || null)} p={p} label={t("vrModeOfDoc", lang)} />
            </>
          )}
        </div>
      </Section>
      {vars.length ? vars.map((v) => <VarCard key={v.id} v={v} c={c} api={api} p={p} />) : <div style={hint(p)}>{t("vrNoVars", lang)}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(["color", "number", "text", "bool"] as const).map((type) => (
          <button
            key={type}
            data-add-var={type}
            onClick={() => {
              const taken = new Set((doc.vars ?? []).map((v) => v.name));
              const base = type === "color" ? "color" : type === "number" ? "number" : type === "text" ? "string" : "flag";
              let n = 1;
              while (taken.has(`${base}${n}`)) n++;
              api.addVar({ name: `${base}${n}`, type, value: startValueOf(type), collection: c.id });
            }}
            className="m3-press"
            style={chip(p)}
          >
            <Icon name={TYPE_TEXT[type].icon} size={16} />
            {t(TYPE_TEXT[type].key, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** On a screen: the mode it shows of each collection that has more than one, over the document's choice. */
export function ScreenModes({ frame, p }: { frame: { id: string; varModes?: Record<string, string> }; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const collections = (b.varCollections ?? []).filter((c) => c.modes.length > 1);
  if (!collections.length || !b.setVarMode) return null;
  return (
    <Section id="screen-modes" icon="view_column" title={t("vrModeOfScreen", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {collections.map((c) => (
          <div key={c.id} data-screen-mode={collectionName(c, lang)}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px 6px" }}>{collectionName(c, lang)}</div>
            <Select options={[{ key: "", label: t("vrModeAuto", lang), icon: "auto_mode" }, ...c.modes.map((m) => ({ key: m.id, label: modeName(c, m.id, lang) }))]} value={frame.varModes?.[c.id] ?? ""} onChange={(k) => b.setVarMode?.(c.id, k || null, frame.id)} p={p} label={`${t("vrModeOfScreen", lang)}: ${collectionName(c, lang)}`} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The button beside a field of the design that binds it to a variable of its kind, the variable it is bound to shown
 *  under it. Quiet until it is used, like a prop's. */
export function BindButton({ field, item, onChange, p }: { field: BindField; item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const [open, setOpen] = useState(false);
  const kind = BIND_FIELDS[field];
  /* a field of the design follows its variable by key (lib/bindings/bind.ts) */
  const id = fieldVarOf(item.bind?.[field]);
  const bound = id ? b.vars.find((v) => v.id === id) : undefined;
  const put = (varId: string | undefined) => {
    const { [field]: _was, ...rest } = item.bind ?? {};
    const bind = varId ? { ...rest, [field]: fieldBindOf(varId) } : rest;
    onChange({ bind: Object.keys(bind).length ? bind : undefined });
    setOpen(false);
  };
  const options = b.vars.filter((v) => v.type === kind);
  return (
    <span data-bind-field={field} style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
      <IconBtn icon={bound ? "link" : "data_object"} p={p} size={28} on={!!bound || open} onClick={() => setOpen((o) => !o)} title={bound ? t("vrBoundTo", lang).replace("{name}", bound.name) : t("vrBind", lang)} expanded={open} hasPopup="listbox" />
      {open && (
        <div role="listbox" aria-label={t("vrBind", lang)} style={{ position: "absolute", right: 0, top: 32, zIndex: 20, minWidth: 180, maxHeight: 260, overflowY: "auto", padding: 4, borderRadius: 12, background: p.surfaceContainer, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          {bound && (
            <button role="option" aria-selected={false} data-unbind onClick={() => put(undefined)} style={menuRow(p)}>
              <Icon name="link_off" size={16} />
              {t("vrUnbind", lang)}
            </button>
          )}
          {options.map((v) => (
            <button key={v.id} role="option" aria-selected={v.id === id} data-bind-to={v.name} onClick={() => put(v.id)} style={{ ...menuRow(p), background: v.id === id ? p.secondaryContainer : "transparent" }}>
              {kind === "color" ? <span style={{ width: 16, height: 16, borderRadius: 4, background: colorCss(b.bound?.[v.id] ?? v.value) ?? "transparent", boxShadow: `inset 0 0 0 1px ${p.outlineVariant}` }} /> : <Icon name="tag" size={16} />}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
            </button>
          ))}
          {!options.length && <div style={{ ...hint(p), padding: 8 }}>{t("vrNoVars", lang)}</div>}
        </div>
      )}
    </span>
  );
}

const menuRow = (p: Palette): React.CSSProperties => ({ width: "100%", height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 8, background: "transparent", color: p.onSurface, fontSize: 12, cursor: "pointer", textAlign: "left" });

/** the variable a field is bound to, shown where its value would be */
export function BoundChip({ field, item, p }: { field: BindField; item: Item; p: Palette }) {
  const b = useContext(BehaviorContext);
  const id = fieldVarOf(item.bind?.[field]);
  const v = id ? b.vars.find((x) => x.id === id) : undefined;
  if (!v) return null;
  const now = b.bound?.[v.id] ?? v.value;
  return (
    <div data-bound-chip={field} style={{ display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 8px", borderRadius: 8, background: p.secondaryContainer, color: p.onSecondaryContainer, fontSize: 12, fontWeight: 600 }}>
      {v.type === "color" ? <span style={{ width: 16, height: 16, borderRadius: 4, background: colorCss(now) ?? "transparent", boxShadow: `inset 0 0 0 1px ${p.outlineVariant}` }} /> : <Icon name="data_object" size={16} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
      {v.type !== "color" && <span style={{ opacity: 0.8 }}>{String(now)}</span>}
    </div>
  );
}
