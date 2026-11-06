
import { createContext, useContext, useState } from "react";
import { Action, ActionBody, BACK_TARGET, Collection, Condition, DocVar, Effect, Group, Item, LINK_TARGET, Palette, STAY_TARGET, VarCollection, VarType, VarValue, paletteIconOf, uid } from "@/lib/tokens";
import { INPUT_PROP, isOverlayPart } from "@/lib/interact";
import { t, useLang, type Lang, type UIKey } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { choiceLabelOf, labelOf, nameOf } from "@/parts/labels";
import { labelOfPart } from "@/parts/resize";
import type { PropDef } from "@/parts/types";
import { Num } from "./PartPanel";
import { Field, IconBtn, Section, Segmented, Select, SelectOption, Toggle } from "./ui";
import { Icon } from "./Icon";

/* The panels that say what a prototype does beyond going to another screen: what else a tap runs, when
 * it runs, what hides, and the variables behind it all. What they need of the document comes by context,
 * because the part panels between here and the editor have no other use for it. */

export type Behavior = {
  vars: DocVar[];
  setVars: (vars: DocVar[]) => void;
  /** the parts on the screen of the selected part, which is what an effect can reach by name */
  groups: Group[];
  /** the group of the selected part */
  group: Group | null;
  patchGroup: (patch: Partial<Group>) => void;
  /** the selected dock's tabs moved or went: `order` holds the index each now had */
  reorderPanes: (order: number[]) => void;
  /** a scene's picture: whether one can be generated here, which is being generated, and the two ways to get one */
  canPaint?: boolean;
  paintingScene?: string | null;
  paintScene?: (itemId: string) => void;
  copyScenePrompt?: (itemId: string) => void;
  /** the data a repeat can draw from */
  collections?: Collection[];
  /** the fields of the row the selected part is repeated for: a condition can read them, as `row.field` */
  rowFields?: string[];
  /** The layout the selected part can repeat through: its own, or the one it is the first child of,
   *  since a column hugging its only child can hardly be pressed on the canvas. */
  repeatHost?: Group | null;
  patchRepeat?: (repeat: Group["repeat"]) => void;
  /** the collections of variables with their modes, and how a screen (or the document) picks one */
  varCollections?: VarCollection[];
  setVarMode?: (collection: string, mode: string | null, screen?: string) => void;
  /** what each variable is in the modes the selected part's screen shows */
  bound?: Record<string, VarValue>;
};

/** whether the document is held to its style's rules: then the panels offer only what the rules leave open */
export const StyleRulesContext = createContext(false);

export const BehaviorContext = createContext<Behavior>({ vars: [], setVars: () => {}, groups: [], group: null, patchGroup: () => {}, reorderPanes: () => {} });

const NEW_VAR = "__new";

/** a part is called what the layers panel calls it */
function partName(g: Group, it: Item, lang: Lang): string {
  const def = partBySlug(it.component);
  /* an instance goes by its definition: its item is only an empty container standing in for it */
  if (g.instanceOf && !g.name) return it.label;
  return (g.items.length === 1 && g.name) || labelOfPart(def, it.props) || (def && nameOf(def, lang)) || it.label;
}

const partOptions = (groups: Group[], lang: Lang, only: (it: Item) => boolean = () => true): SelectOption[] => groups.flatMap((g) => g.items.filter(only).map((it) => ({ key: it.id, label: partName(g, it, lang), icon: paletteIconOf(it) })));

const isInput = (it: Item) => INPUT_PROP[it.component ?? ""] !== undefined;

/** a new variable, added to the document; the name is only a start, the screen panel renames it */
function addVar(b: Behavior, type: VarType, name: string): DocVar {
  const v: DocVar = { id: uid(), name, type, value: type === "text" ? "" : type === "number" ? 0 : false };
  b.setVars([...b.vars, v]);
  return v;
}

const nextVarName = (vars: DocVar[]) => `var${vars.length + 1}`;

/** the variables a condition can read: the document's, and the fields of the row it runs in, which nothing can write */
const readableVars = (b: Behavior): DocVar[] => [...b.vars, ...(b.rowFields ?? []).map((f): DocVar => ({ id: `row.${f}`, name: `row.${f}`, type: "text", value: "" }))];

function VarSelect({ value, onPick, p, type = "number", reading }: { value: string; onPick: (v: DocVar) => void; p: Palette; /** the type a variable made from here takes */ type?: VarType; /** only read, so a row's fields are on offer too */ reading?: boolean }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const vars = reading ? readableVars(b) : b.vars;
  const options: SelectOption[] = [...vars.map((v) => ({ key: v.id, label: v.name || v.id, icon: "data_object" })), { key: NEW_VAR, label: t("newVariable", lang), icon: "add" }];
  return (
    <Select
      options={options}
      value={value}
      onChange={(k) => {
        const v = k === NEW_VAR ? addVar(b, type, nextVarName(b.vars)) : vars.find((x) => x.id === k);
        if (v) onPick(v);
      }}
      p={p}
      label={t("condVar", lang)}
    />
  );
}

function BoolRun({ value, onChange, p }: { value: boolean; onChange: (v: boolean) => void; p: Palette }) {
  const lang = useLang();
  return <Segmented<string> options={[{ key: "1", label: t("varTrue", lang) }, { key: "0", label: t("varFalse", lang) }]} value={value ? "1" : "0"} onChange={(k) => onChange(k === "1")} p={p} height={36} label={t("effectValue", lang)} />;
}

/** a value typed the way its variable holds it */
function ValueField({ type, value, onChange, p }: { type: VarType; value: VarValue; onChange: (v: VarValue) => void; p: Palette }) {
  const lang = useLang();
  if (type === "bool") return <BoolRun value={value === true} onChange={onChange} p={p} />;
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value) || 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>{t("effectValue", lang)}</span>
        <Num value={n} min={-99999} max={99999} title={t("effectValue", lang)} onChange={onChange} p={p} />
      </div>
    );
  }
  return <Field value={String(value ?? "")} onChange={onChange} placeholder={t("effectValue", lang)} p={p} height={40} />;
}

/** a new prop value, in the control that prop has in the part's own panel */
function PropValueField({ def, value, onChange, p }: { def: PropDef; value: VarValue; onChange: (v: VarValue) => void; p: Palette }) {
  const lang = useLang();
  switch (def.kind) {
    case "bool":
      return <BoolRun value={value === true} onChange={onChange} p={p} />;
    case "number":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>{t("effectValue", lang)}</span>
          <Num value={typeof value === "number" ? value : def.default} min={def.min} max={def.max} title={labelOf(def, lang)} onChange={onChange} p={p} />
        </div>
      );
    case "enum":
      return <Select options={def.options.map((o) => ({ key: typeof o === "string" ? o : o.value, label: choiceLabelOf(o, lang) }))} value={String(value)} onChange={onChange} p={p} label={labelOf(def, lang)} />;
    default:
      return <Field value={String(value ?? "")} onChange={onChange} placeholder={t("effectValue", lang)} p={p} height={40} />;
  }
}

/** the props an effect can change: the ones with a value that fits on one line */
const settableProps = (it: Item | undefined) => (partBySlug(it?.component)?.props ?? []).filter((d) => d.kind === "text" || d.kind === "number" || d.kind === "bool" || d.kind === "enum");

const startOfProp = (d: PropDef | undefined): VarValue => (d && (d.kind === "text" || d.kind === "number" || d.kind === "bool" || d.kind === "enum") ? d.default : "");

const KINDS: { key: Effect["do"]; text: UIKey; icon: string }[] = [
  { key: "show", text: "effShow", icon: "visibility" },
  { key: "hide", text: "effHide", icon: "visibility_off" },
  { key: "toggle", text: "effToggle", icon: "swap_horiz" },
  { key: "open", text: "effOpen", icon: "web_asset" },
  { key: "close", text: "effClose", icon: "close" },
  { key: "setVar", text: "effSetVar", icon: "data_object" },
  { key: "toggleVar", text: "effToggleVar", icon: "toggle_on" },
  { key: "addVar", text: "effAddVar", icon: "add" },
  { key: "setProp", text: "effSetProp", icon: "tune" },
  { key: "snackbar", text: "effSnackbar", icon: "chat_bubble" },
];

/** an effect of another kind, keeping the part or variable it was already about where it can */
function changedKind(kind: Effect["do"], was: Effect | null, b: Behavior): Effect {
  const parts = b.groups.flatMap((g) => g.items);
  const part = was && "part" in was ? was.part : "";
  const first = (only: (it: Item) => boolean) => (parts.some((it) => it.id === part && only(it)) ? part : (parts.find(only)?.id ?? ""));
  const v = was && "var" in was ? b.vars.find((x) => x.id === was.var) : b.vars[0];
  const type = v?.type ?? "number";
  switch (kind) {
    case "show":
    case "hide":
    case "toggle":
      return { do: kind, part: first(() => true) };
    case "open":
    case "close":
      return { do: kind, part: first(isOverlayPart) };
    case "setVar":
      return { do: kind, var: v?.id ?? "", value: type === "text" ? "" : type === "number" ? 0 : true };
    case "toggleVar":
      return { do: kind, var: (v?.type === "bool" ? v : b.vars.find((x) => x.type === "bool"))?.id ?? "" };
    case "addVar":
      return { do: kind, var: (v?.type === "number" ? v : b.vars.find((x) => x.type === "number"))?.id ?? "", by: 1 };
    case "setProp": {
      const id = first(() => true);
      const d = settableProps(parts.find((it) => it.id === id))[0];
      return { do: kind, part: id, prop: d?.key ?? "", value: startOfProp(d) };
    }
    case "snackbar":
      return { do: kind, message: "" };
  }
}

function EffectRow({ effect, index, onChange, onRemove, onUp, p }: { effect: Effect; index: number; onChange: (e: Effect) => void; onRemove: () => void; onUp: () => void; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const parts = b.groups.flatMap((g) => g.items);
  const partSelect = (only?: (it: Item) => boolean) => {
    if (!("part" in effect)) return null;
    const options = partOptions(b.groups, lang, only);
    /* A part that has since become part of a component: it stays on offer under the instance's name, or
       the list would seem to say the first part when the tap goes on reaching this one. */
    const inside = effect.part.includes("/") ? b.groups.find((g) => effect.part.startsWith(`${g.id}/`)) : undefined;
    if (inside) options.unshift({ key: effect.part, label: partName(inside, inside.items[0], lang), icon: "widgets" });
    if (!options.length) return <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("noParts", lang)}</div>;
    return (
      <Select
        options={options}
        value={effect.part}
        onChange={(part) => {
          if (effect.do !== "setProp") return onChange({ ...effect, part });
          /* another part has other props */
          const list = settableProps(parts.find((it) => it.id === part));
          const d = list.find((x) => x.key === effect.prop) ?? list[0];
          onChange({ ...effect, part, prop: d?.key ?? "", value: d?.key === effect.prop ? effect.value : startOfProp(d) });
        }}
        p={p}
        label={t("effectPart", lang)}
      />
    );
  };
  const varType = "var" in effect ? b.vars.find((v) => v.id === effect.var)?.type : undefined;
  let body: React.ReactNode = null;
  switch (effect.do) {
    case "show":
    case "hide":
    case "toggle":
      body = partSelect();
      break;
    case "open":
    case "close":
      body = partSelect(isOverlayPart);
      break;
    case "setVar":
      body = (
        <>
          <VarSelect value={effect.var} onPick={(v) => onChange({ ...effect, var: v.id, value: v.value })} p={p} />
          {varType && <ValueField type={varType} value={effect.value} onChange={(value) => onChange({ ...effect, value })} p={p} />}
        </>
      );
      break;
    case "toggleVar":
      body = <VarSelect value={effect.var} type="bool" onPick={(v) => onChange({ ...effect, var: v.id })} p={p} />;
      break;
    case "addVar":
      body = (
        <>
          <VarSelect value={effect.var} onPick={(v) => onChange({ ...effect, var: v.id })} p={p} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>{t("effectBy", lang)}</span>
            <Num value={effect.by} min={-99999} max={99999} title={t("effectBy", lang)} onChange={(by) => onChange({ ...effect, by })} p={p} />
          </div>
        </>
      );
      break;
    case "setProp": {
      const props = settableProps(parts.find((it) => it.id === effect.part));
      const d = props.find((x) => x.key === effect.prop);
      body = (
        <>
          {partSelect()}
          {props.length > 0 && <Select options={props.map((x) => ({ key: x.key, label: labelOf(x, lang) }))} value={effect.prop} onChange={(prop) => onChange({ ...effect, prop, value: startOfProp(props.find((x) => x.key === prop)) })} p={p} label={t("effectProp", lang)} />}
          {d && <PropValueField def={d} value={effect.value} onChange={(value) => onChange({ ...effect, value })} p={p} />}
        </>
      );
      break;
    }
    case "snackbar":
      body = <Field value={effect.message} onChange={(message) => onChange({ ...effect, message })} placeholder={t("effectMessage", lang)} p={p} height={40} />;
      break;
  }
  return (
    <div data-effect={effect.do} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 12, background: p.surfaceContainerLow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Select options={KINDS.map((k) => ({ key: k.key, label: t(k.text, lang), icon: k.icon }))} value={effect.do} onChange={(k) => onChange(changedKind(k as Effect["do"], effect, b))} p={p} label={t("effectKind", lang)} />
        </div>
        {index > 0 && <IconBtn icon="arrow_upward" p={p} size={32} onClick={onUp} title={t("effectUp", lang)} />}
        <IconBtn icon="close" p={p} size={32} onClick={onRemove} title={t("effectRemove", lang)} />
      </div>
      {body}
    </div>
  );
}

function AddButton({ label, onClick, p }: { label: string; onClick: () => void; p: Palette }) {
  return (
    <button
      onClick={onClick}
      className="m3-press"
      style={{ height: 40, borderRadius: 20, border: `1px solid ${p.outline}`, background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}
    >
      <Icon name="add" size={18} />
      {label}
    </button>
  );
}

function EffectList({ effects, onChange, p }: { effects: Effect[]; onChange: (e: Effect[]) => void; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {effects.map((e, i) => (
        <EffectRow
          key={i}
          effect={e}
          index={i}
          onChange={(next) => onChange(effects.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
          onUp={() => onChange(effects.map((x, j) => (j === i ? effects[i - 1] : j === i - 1 ? effects[i] : x)))}
          p={p}
        />
      ))}
      <AddButton label={t("addEffect", lang)} onClick={() => onChange([...effects, changedKind("show", null, b)])} p={p} />
    </div>
  );
}

/** a test on a variable, or on a form field having something in it */
function ConditionEditor({ value, onChange, p }: { value: Condition; onChange: (c: Condition) => void; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const fields = partOptions(b.groups, lang, isInput);
  const onField = "filled" in value;
  const v = !onField ? readableVars(b).find((x) => x.id === value.var) : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 12, background: p.surfaceContainerLow }}>
      <Segmented<string>
        options={[{ key: "var", label: t("condVar", lang) }, { key: "field", label: t("condField", lang) }]}
        value={onField ? "field" : "var"}
        onChange={(k) => onChange(k === "field" ? { filled: fields[0]?.key ?? "" } : { var: b.vars[0]?.id ?? "", op: "eq", value: b.vars[0]?.value ?? 0 })}
        p={p}
        height={36}
        label={t("onlyWhen", lang)}
      />
      {onField ? (
        fields.length ? <Select options={fields} value={value.filled} onChange={(filled) => onChange({ filled })} p={p} label={t("condFilled", lang)} /> : <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("noParts", lang)}</div>
      ) : (
        <>
          <VarSelect reading value={value.var} onPick={(x) => onChange({ ...value, var: x.id, value: x.value })} p={p} />
          <Segmented<string> options={[{ key: "eq", label: t("condIs", lang) }, { key: "neq", label: t("condIsNot", lang) }]} value={value.op} onChange={(op) => onChange({ ...value, op: op as "eq" | "neq" })} p={p} height={36} label={t("onlyWhen", lang)} />
          {v && <ValueField type={v.type} value={value.value} onChange={(x) => onChange({ ...value, value: x })} p={p} />}
        </>
      )}
    </div>
  );
}

/** a condition to start from: a field when the screen has one, since that is what a form asks */
function firstCondition(b: Behavior): Condition {
  const field = b.groups.flatMap((g) => g.items).find(isInput);
  if (field) return { filled: field.id };
  return { var: b.vars[0]?.id ?? "", op: "eq", value: b.vars[0]?.value ?? 0 };
}

/** an action with nothing in it is no action, and what is empty is not kept */
export function tidiedAction(a: Action): Action | undefined {
  const { effects, when, else: other, ...rest } = a;
  const out: Action = { ...rest };
  if (effects?.length) out.effects = effects;
  if (when) {
    out.when = when;
    if (other && (other.to !== STAY_TARGET || other.effects?.length)) out.else = other;
  }
  return out.to === STAY_TARGET && !out.effects && !out.when ? undefined : out;
}

/** What else a tap does, under where it goes: its effects in order, a condition it runs on, and what
 *  runs when that condition does not hold. `navOptions` is the same list of places the section above offers. */
export function ActionExtras({ action, onChange, navOptions, p }: { action: Action | undefined; onChange: (a: Action | undefined) => void; navOptions: SelectOption[]; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const base: Action = action ?? { to: STAY_TARGET, transition: "none" };
  const set = (patch: Partial<Action>) => onChange(tidiedAction({ ...base, ...patch }));
  const other: ActionBody = base.else ?? { to: STAY_TARGET, transition: "none" };
  const setOther = (patch: Partial<ActionBody>) => set({ else: { ...other, ...patch } });
  const label = (text: string) => <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" }}>{text}</div>;
  return (
    <div data-action-extras style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {label(t("effects", lang))}
      <EffectList effects={base.effects ?? []} onChange={(effects) => set({ effects })} p={p} />
      <Toggle on={!!base.when} onChange={(on) => set({ when: on ? firstCondition(b) : undefined })} p={p} label={t("onlyWhen", lang)} grow />
      {base.when && (
        <>
          <ConditionEditor value={base.when} onChange={(when) => set({ when })} p={p} />
          {label(t("otherwise", lang))}
          <Select
            options={navOptions.map((o) => (o.key === "none" ? { ...o, key: STAY_TARGET } : o))}
            value={other.to}
            onChange={(to) => setOther({ to, transition: to === STAY_TARGET || to === LINK_TARGET || to === BACK_TARGET ? "none" : "slide" })}
            p={p}
            label={t("otherwise", lang)}
          />
          {other.to === LINK_TARGET && <Field value={other.url ?? ""} onChange={(url) => setOther({ url })} placeholder="https://example.com" icon="link" p={p} />}
          <EffectList effects={other.effects ?? []} onChange={(effects) => setOther({ effects })} p={p} />
        </>
      )}
    </div>
  );
}

/** when the selected part is on the screen at all */
export function VisibilitySection({ p }: { p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const g = b.group;
  if (!g) return null;
  return (
    <Section id="part-visibility" icon="visibility" title={t("visibility", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Toggle on={!!g.hidden} onChange={(hidden) => b.patchGroup({ hidden: hidden || undefined })} p={p} label={t("hiddenAtStart", lang)} grow />
        <Toggle on={!!g.showWhen} onChange={(on) => b.patchGroup({ showWhen: on ? firstCondition(b) : undefined })} p={p} label={t("showOnlyWhen", lang)} grow />
        {g.showWhen && <ConditionEditor value={g.showWhen} onChange={(showWhen) => b.patchGroup({ showWhen })} p={p} />}
      </div>
    </Section>
  );
}

/** the props that can follow a variable: a part's measure is the layout's to set */
const bindable = (d: PropDef) => (d.kind === "text" || d.kind === "number" || d.kind === "bool") && d.key !== "width" && d.key !== "height" && !(d.kind === "number" && d.axis);

const typeOfProp = (d: PropDef): VarType => (d.kind === "bool" ? "bool" : d.kind === "number" ? "number" : "text");

/** A prop's row with a small control beside it that ties the prop to a variable. Quiet until it is
 *  used: the row stays what it was for anyone who never touches it. */
export function BindRow({ def, item, onChange, p, children }: { def: PropDef; item: Item; onChange: (patch: Partial<Item>) => void; p: Palette; children: React.ReactNode }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  const [open, setOpen] = useState(false);
  if (!bindable(def)) return <>{children}</>;
  const id = item.bind?.[def.key];
  const bound = id ? b.vars.find((v) => v.id === id) : undefined;
  const put = (varId: string | undefined) => {
    const { [def.key]: _was, ...rest } = item.bind ?? {};
    const bind = varId ? { ...rest, [def.key]: varId } : rest;
    onChange({ bind: Object.keys(bind).length ? bind : undefined });
    setOpen(false);
  };
  const title = bound ? `${t("bindVariable", lang)}: ${bound.name}` : t("bindVariable", lang);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        <span data-bind={def.key} style={{ flex: "0 0 auto", color: bound ? undefined : p.outline, opacity: bound || open ? 1 : 0.7 }}>
          <IconBtn icon="link" p={p} size={28} on={!!bound || open} onClick={() => setOpen((o) => !o)} title={title} expanded={open} hasPopup="listbox" />
        </span>
      </div>
      {bound && !open && <div style={{ fontSize: 12, color: p.primary, padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bound.name}</div>}
      {open && (
        <Select
          options={[{ key: "", label: t("noVariable", lang), icon: "link_off" }, ...b.vars.map((v) => ({ key: v.id, label: v.name || v.id, icon: "data_object" })), { key: NEW_VAR, label: t("newVariable", lang), icon: "add" }]}
          value={bound?.id ?? ""}
          onChange={(k) => put(k === NEW_VAR ? addVar(b, typeOfProp(def), labelOf(def, lang)).id : k || undefined)}
          p={p}
          label={t("bindVariable", lang)}
        />
      )}
    </div>
  );
}
