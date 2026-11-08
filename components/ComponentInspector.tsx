
import { useContext, useState } from "react";
import { Frame, Item, NavTab, PHONE_W, Palette, defaultTabRows, defaultTabs, frameSizeOf, listRowsPatch } from "@/lib/tokens";
import { t, useLang, type Lang } from "@/lib/i18n";
import { partBySlug, reader } from "@/parts/registry";
import { choiceLabelOf, choiceValueOf, labelOf, nameOf } from "@/parts/labels";
import { dpOf } from "@/parts/resize";
import type { Choice, ListItem, PropDef, TableData } from "@/parts/types";
import { AiHooks } from "./Inspector";
import { BehaviorContext, BindRow, StyleRulesContext, VisibilitySection } from "./EffectsPanel";
import { styleOwnsProp } from "@/lib/styleRules";
import { EntryList, IconRow, NoteSection, PartHeader, PartTabs, PlaceFn, SlotStrip, Tab, TriggerSection, WidthRows, actionOutletsOf } from "./PartPanel";
import { demoTakenOver } from "@/lib/partContract";
import { segmentedFits } from "@/lib/choices";
import { tableOf, tableText } from "@/lib/collections";
import { FlowControl } from "./FlowPanel";
import { PartDesign } from "./DesignPanel";
import { FLOW_KEYS } from "@/parts/flow";
import { type Flow } from "@/lib/flow";
import { Field, ImageRow, NamedSizes, PanelShell, Segmented, Select, Slider, Toggle, useDraft } from "./ui";

/* The panel of a part that is a real shadcn M3E component. It is built from the part's own prop
 * definitions: text, choices, switches, numbers, icons and lists, each drawn with the controls
 * the other panels use, and written back into `item.props`. */

const choices = (options: Choice[], lang: Lang) => options.map((o) => ({ key: choiceValueOf(o), label: choiceLabelOf(o, lang) }));

/** a list prop is edited as the rows the entry list knows: a label, and an icon when the part has them */
const toRows = (list: ListItem[]): NavTab[] => list.map((x) => ({ icon: x.icon ?? "", label: x.label, variant: x.variant, width: x.width, image: x.image }));
const fromRows = (rows: NavTab[], icons: boolean): ListItem[] =>
  rows.map((x) => ({ label: x.label, ...(icons && x.icon ? { icon: x.icon } : {}), ...(x.variant ? { variant: x.variant } : {}), ...(x.width ? { width: x.width } : {}), ...(x.image ? { image: x.image } : {}) }));

/** a table prop as the text it is edited in (lib/collections.ts): the words stay as typed while the rows follow them,
 *  so a line just started, a space after a comma and a quoted "$1,350.00" all survive the typing */
function TableField({ value, onChange, label, p }: { value: TableData; onChange: (v: TableData) => void; label: string; p: Palette }) {
  const [draft, type] = useDraft(value, tableText, tableOf);
  return <Field value={draft} onChange={(text) => onChange(type(text))} placeholder={label} label={label} p={p} multiline rows={6} height={44} />;
}

function PropRow({ def, value, onChange, onRows, item, p, frameW, lang }: { def: PropDef; value: unknown; onChange: (v: unknown) => void; onRows: (rows: ListItem[], order: number[]) => void; item: Item; p: Palette; frameW: number; lang: Lang }) {
  const labelText = labelOf(def, lang);
  const label = <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px 6px" }}>{labelText}</div>;
  switch (def.kind) {
    case "text":
      return (
        <div>
          {label}
          <Field value={String(value ?? "")} onChange={onChange} placeholder={labelText} label={labelText} p={p} multiline={def.multiline} rows={3} height={44} />
        </div>
      );
    case "enum": {
      const options = choices(def.options, lang);
      /* a size of named steps carries its dp in the label and is a row of presets */
      const dps = def.key === "size" ? def.options.map(dpOf) : [];
      if (dps.length > 1 && dps.every((v): v is number => v !== undefined)) {
        const steps = options.map((o, i) => ({ key: o.key, value: dps[i]! }));
        return (
          <div>
            {label}
            <NamedSizes steps={steps} value={steps[options.findIndex((o) => o.key === String(value))]?.value ?? steps[0].value} onChange={(dp) => onChange(steps.find((s) => s.value === dp)?.key ?? steps[0].key)} p={p} label={labelText} />
          </div>
        );
      }
      return (
        <div>
          {label}
          {/* short pairs (横/縦) stay a segmented run; style names that would clip drop into a select */}
          {segmentedFits(options.map((o) => o.label)) ? (
            <Segmented<string> options={options} value={String(value)} onChange={onChange} p={p} height={40} label={labelText} />
          ) : (
            <Select options={options} value={String(value)} onChange={onChange} p={p} label={labelText} />
          )}
        </div>
      );
    }
    case "bool":
      return <Toggle on={value === true} onChange={onChange} p={p} label={labelText} grow />;
    case "number":
      /* a width is set the way every other part's is: the slider, and the widths of the screen under it */
      if (def.key === "width" || def.axis === "width") {
        const clamp = (v: number) => Math.min(def.max, Math.max(def.min, v));
        return <WidthRows value={Number(value)} min={def.min} max={def.max} step={def.step ?? 4} frameW={frameW} onChange={(v) => v !== undefined && onChange(clamp(v))} p={p} />;
      }
      return (
        <div>
          {label}
          <Slider value={Number(value)} min={def.min} max={def.max} step={def.step ?? 1} unit={def.unit} title={labelText} onChange={onChange} p={p} />
        </div>
      );
    case "icon":
      return (
        <div>
          {label}
          <IconRow slots={[{ key: def.key, value: typeof value === "string" && value ? value : null, title: labelText }]} onPick={(_, icon) => onChange(icon ?? "")} p={p} />
        </div>
      );
    case "image":
      return (
        <div>
          {label}
          <ImageRow value={typeof value === "string" && value ? value : undefined} onChange={(src) => onChange(src ?? "")} p={p} />
        </div>
      );
    case "table":
      return (
        <div>
          {label}
          <TableField value={value as TableData} onChange={onChange} label={labelText} p={p} />
        </div>
      );
    case "list": {
      const list = (value as ListItem[]) ?? [];
      const icons = def.icons === true;
      /* a bar adds more destinations; any other list adds tabs */
      const bar = icons && (def.min ?? 0) >= 3;
      return (
        <div>
          {label}
          <EntryList
            id={item.id}
            tabs={toRows(list)}
            bounds={{ min: def.min ?? 1, max: def.max ?? 12 }}
            spare={bar ? defaultTabs() : defaultTabRows()}
            icons={icons}
            images={def.images === true}
            fields={def.fields?.map((f) => ({ key: f.key, label: labelOf(f, lang), options: choices(f.options, lang) }))}
            onChange={(tabs, order) => onRows(fromRows(tabs, icons), order)}
            p={p}
          />
        </div>
      );
    }
  }
}

/** A scene's picture from its words: generated here, or the words taken to another tool. */
function ScenePaint({ item, values, p }: { item: Item; values: ReturnType<typeof reader>; p: Palette }) {
  const lang = useLang();
  const behavior = useContext(BehaviorContext);
  const painting = behavior.paintingScene === item.id;
  const words = values.s("prompt").trim();
  const button = (active: boolean): React.CSSProperties => ({ height: 44, flex: 1, minWidth: 0, borderRadius: 22, border: "none", background: active ? p.secondaryContainer : p.surfaceContainerHigh, color: active ? p.onSecondaryContainer : p.onSurfaceVariant, fontSize: 13, fontWeight: 600, cursor: active ? "pointer" : "default" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button data-paint-scene className="m3-press" disabled={!words || !behavior.canPaint || painting} onClick={() => behavior.paintScene?.(item.id)} style={button(!!words && !!behavior.canPaint && !painting)}>
          {painting ? `${t(item.props?.image ? "repaintScene" : "paintScene", lang)}…` : t(item.props?.image ? "repaintScene" : "paintScene", lang)}
        </button>
        <button data-copy-scene className="m3-press" disabled={!words} onClick={() => behavior.copyScenePrompt?.(item.id)} style={button(!!words)}>
          {t("copyScenePrompt", lang)}
        </button>
      </div>
      {!behavior.canPaint && <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("sceneNoKey", lang)}</div>}
    </div>
  );
}

/** whether the panel shows a prop of a part in this state: auto layout has a control of its own (components/FlowPanel.tsx),
 *  a part a layout places has no place of its own on the screen, and a style that decides a prop takes it off */
export function shownProp(def: NonNullable<ReturnType<typeof partBySlug>>, d: PropDef, values: ReturnType<typeof reader>, strict: boolean, inFlow?: boolean) {
  return (!d.when || d.when(values)) && !(strict && styleOwnsProp(def.slug, d.key)) && !(def.flow && FLOW_KEYS.has(d.key)) && !(inFlow && d.screen);
}

/** the controls of a part's props, one per prop the part shows in this state */
export function ComponentProps({ item, palette: p, onChange, frame, layoutApart, inFlow, skip, only }: { item: Item; palette: Palette; onChange: (patch: Partial<Item>) => void; frame?: Frame | null; /** the panel shows auto layout in a section of its own */ layoutApart?: boolean; /** a layout places the part: where it would stand on the screen is not its to say */ inFlow?: boolean; /** props another section of the panel shows */ skip?: (d: PropDef) => boolean; /** just these props */ only?: (d: PropDef) => boolean }) {
  const lang = useLang();
  const behavior = useContext(BehaviorContext);
  const strict = useContext(StyleRulesContext);
  const def = partBySlug(item.component);
  if (!def) return null;
  const values = reader(def, item.props);
  const read = (d: PropDef) => (d.kind === "text" || d.kind === "icon" || d.kind === "enum" || d.kind === "image" ? values.s(d.key) : d.kind === "bool" ? values.b(d.key) : d.kind === "number" ? values.n(d.key) : d.kind === "table" ? values.table(d.key) : values.list(d.key));
  const set = (key: string, v: unknown) => onChange({ props: { ...item.props, [key]: v } });
  const tabs = def.panes ? def.slots?.(values) : undefined;
  /* a part's choice counts the rows of its first list */
  const firstList = def.props.find((d) => d.kind === "list");
  const rowsToPick = tabs?.map((s) => s.label) ?? (firstList ? values.list(firstList.key).map((r) => r.label) : undefined);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {def.props
        /* auto layout has a control of its own (components/FlowPanel.tsx); a part a layout places has no place of its own on the screen */
        .filter((d) => shownProp(def, d, values, strict, inFlow) && !skip?.(d) && (!only || only(d)))
        .map((d) =>
          /* the row a part has chosen is picked by its name, not by counting: a dock's tab is also what the canvas shows and what a drop lands on */
          d.key === def.selectKey && d.kind === "number" && rowsToPick ? (
            <BindRow key={d.key} def={d} item={item} onChange={onChange} p={p}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px 6px" }}>{labelOf(d, lang)}</div>
                <Select
                  options={[...((d.min ?? 0) < 0 ? [{ key: "-1", label: t("none", lang) }] : []), ...rowsToPick.map((label, i) => ({ key: String(i), label: label || String(i + 1) }))]}
                  value={String(Math.min(values.n(d.key), rowsToPick.length - 1))}
                  onChange={(k) => set(d.key, Number(k))}
                  p={p}
                  label={labelOf(d, lang)}
                />
              </div>
            </BindRow>
          ) : (
            <BindRow key={d.key} def={d} item={item} onChange={onChange} p={p}>
              <PropRow
                def={d}
                value={read(d)}
                onChange={(v) => set(d.key, v)}
                onRows={(rows, order) => {
                  onChange(listRowsPatch(item, d.key, rows, order));
                  /* what stands on a tab goes with the tab */
                  if (tabs) behavior.reorderPanes(order);
                }}
                item={item}
                p={p}
                frameW={frame ? frameSizeOf(frame).w : PHONE_W}
                lang={lang}
              />
            </BindRow>
          ),
        )}
      {def.slug === "scene" && <ScenePaint item={item} values={values} p={p} />}
      {def.flow && !layoutApart && <FlowControl item={item} onChange={onChange} p={p} />}
      {def.slug === "fab" && !!values.s("label") && !!values.s("icon") && <Toggle on={!!item.collapseOnScroll} onChange={(collapseOnScroll) => onChange({ collapseOnScroll: collapseOnScroll || undefined })} label={t("fabScrollSwitch", lang)} p={p} />}
    </div>
  );
}

export function ComponentInspector({
  ai,
  item,
  palette: p,
  frame,
  onChange,
  onDelete,
  onDuplicate,
  locked,
  onToggleLock,
  onPlace,
  selfRect,
  allFrames,
  inFlow,
  flowParent,
  onMoveTo,
  onMakeComponent,
  onAutoLayout,
  onSplit,
  onExport,
  tab: tabAsked,
  onTab,
}: {
  ai: AiHooks;
  item: Item;
  palette: Palette;
  frame: Frame | null;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  locked?: boolean;
  onToggleLock?: () => void;
  onPlace?: PlaceFn;
  selfRect: { x: number; y: number; w: number; h: number } | null;
  allFrames: Frame[];
  /** a container's auto layout places this part */
  inFlow?: boolean;
  /** the layout that places it, for how it is sized and lined up in it */
  flowParent?: Flow | null;
  /** puts the part at a place on its screen */
  onMoveTo?: (x: number, y: number) => void;
  /** turns this part into a reusable component */
  onMakeComponent?: () => void;
  /** puts this part in an auto layout, or gives a container one */
  onAutoLayout?: () => void;
  /** replaces this composite, where it stands, with the atoms it is made of */
  onSplit?: () => void;
  /** saves the part as a picture */
  onExport?: (scale: number) => void;
  /** the tab shown, when the editor keeps it */
  tab?: Tab;
  onTab?: (tab: Tab) => void;
}) {
  const lang = useLang();
  const [ownTab, setOwnTab] = useState<Tab>("design");
  const tab = tabAsked ?? ownTab;
  const setTab = onTab ?? setOwnTab;
  const [slot, setSlot] = useState("");
  const def = partBySlug(item.component);
  if (!def) return null;
  /* the places, families and events an action can be wired to (lib/partContract.ts) */
  const slots = actionOutletsOf(item, lang);
  const slotKey = slots.some((s) => s.key === slot) ? slot : (slots[0]?.key ?? "");
  const outlet = slots.find((s) => s.key === slotKey);
  const fields = Object.keys(outlet?.event?.payload ?? {}).map((k) => `event.${k}`);
  const outletNote = outlet?.kind === "event" ? t("dzOnEvent", lang).replace("{fields}", fields.join(", ") || "event") : outlet?.kind === "family" ? t("dzOnFamily", lang) : null;
  const demo = def.demo && !demoTakenOver(item) ? t("dzDemo", lang).replace("{props}", def.demo.takenOverBy.join(", ")) : null;
  const note = (words: string) => <div style={{ fontSize: 12, lineHeight: "16px", color: p.onSurfaceVariant }}>{words}</div>;

  return (
    <PanelShell
      p={p}
      locked={!!locked}
      onUnlock={onToggleLock}
      head={<PartHeader title={nameOf(def, lang)} icon={def.icon} p={p} locked={!!locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />}
      tabs={<PartTabs value={tab} onChange={setTab} p={p} />}
    >
      {tab === "design" && (
        <div role="tabpanel" id="part-panel-design" aria-labelledby="part-tab-design" style={{ margin: "0 -4px" }}>
          <PartDesign item={item} frame={frame} onChange={onChange} inFlow={inFlow} flowParent={flowParent} selfRect={selfRect} onMoveTo={onMoveTo} onPlace={onPlace} locked={locked} onSplit={onSplit} onMakeComponent={onMakeComponent} onAutoLayout={onAutoLayout} onExport={onExport} p={p} />
        </div>
      )}
      {tab === "behavior" && (
        <div role="tabpanel" id="part-panel-behavior" aria-labelledby="part-tab-behavior">
          {slots.length > 0 ? (
            <TriggerSection
              item={item}
              frame={frame}
              allFrames={allFrames}
              selfRect={selfRect}
              onChange={onChange}
              p={p}
              slot={slotKey || undefined}
              head={
                <>
                  <SlotStrip item={item} selected={slotKey} onSelect={setSlot} p={p} />
                  {outletNote && note(outletNote)}
                  {demo && note(demo)}
                </>
              }
            />
          ) : (
            <TriggerSection item={item} frame={frame} allFrames={allFrames} selfRect={selfRect} onChange={onChange} p={p} head={demo ? note(demo) : undefined} />
          )}
          <VisibilitySection p={p} />
          <NoteSection item={item} ai={ai} onChange={onChange} p={p} />
        </div>
      )}
    </PanelShell>
  );
}
