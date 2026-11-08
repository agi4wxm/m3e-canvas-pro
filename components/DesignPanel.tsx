import { useContext, useEffect, useState } from "react";
import { BLEND_MODES } from "@/lib/look";
import { Frame, Item, PHONE_W, Palette, frameSizeOf, uniformRadii, type BlendMode, type FlowSizing } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { isStateProp } from "@/parts/fieldState";
import { axisValue, axisWrite, resizeOf, type PartAxis } from "@/parts/resize";
import type { PartDef } from "@/parts/types";
import { childLayoutOf, type Flow } from "@/lib/flow";
import { tidyLook } from "@/lib/look";
import { Icon } from "./Icon";
import { FieldToggle, NumberField } from "./NumberField";
import { ComponentProps } from "./ComponentInspector";
import { FlowDirection, FlowSpacing, SelfAlign, SizeLimits, sizingChoices, sizingNow, sizingPatch } from "./FlowPanel";
import { LookPanel, type LookBlockKey } from "./LookPanel";
import { AlignBox, FillRun, LineUp, TextRun, WidthRun, type PlaceFn } from "./PartPanel";
import { RepeatSection } from "./ReusePanels";
import { PartDataSection } from "./BindingsPanel";
import { BehaviorContext, StyleRulesContext } from "./EffectsPanel";
import { Select, Toggle } from "./ui";
import { BindButton, BoundChip } from "./VariablesPanel";
import type { BindField } from "@/lib/variables";
import type { AlignHow } from "@/lib/align";

/* The design tab of the right panel, organised the way Figma's is: the part's own properties (what an instance shows
 * first), then Position, Layout, Appearance, Typography, Fill, Stroke, Effects, the look presets and Export. The
 * controls are the existing panels' (FlowPanel, LookPanel, PartPanel), packed denser: numbers are scrubbed by their
 * label, stepped with the arrow keys and take arithmetic. Several parts selected show what they share, "Mixed" where
 * they differ, and a value set goes to each of them. */

/** One section of the panel: a quiet title with what it offers on the right, folded or not as it was left. */
export function DesignSection({ id, title, actions, children, p, defaultOpen = true }: { id: string; title: string; actions?: React.ReactNode; children?: React.ReactNode; p: Palette; defaultOpen?: boolean }) {
  const key = `m3e:dz:${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOpen(v === "1");
    } catch {}
  }, [key]);
  const toggle = () => {
    const next = !open;
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {}
    setOpen(next);
  };
  const body = open && children;
  return (
    <section data-design-section={id} aria-label={title} style={{ borderTop: `1px solid ${p.outlineVariant}`, padding: body ? "6px 4px 12px" : "6px 4px 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, height: 28 }}>
        <button
          onClick={toggle}
          aria-expanded={open}
          style={{ flex: 1, minWidth: 0, height: 28, display: "flex", alignItems: "center", gap: 4, padding: "0 2px", border: "none", background: "transparent", color: children ? p.onSurface : p.onSurfaceVariant, cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ display: "inline-flex", color: p.outline, transform: open ? "none" : "rotate(-90deg)", transition: "transform 120ms" }}>
            <Icon name="expand_more" size={16} />
          </span>
        </button>
        {actions}
      </div>
      {body && <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>{body}</div>}
    </section>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 };

/** the measure a W / H field writes on an axis: the part's width or height prop */
function axisFor(def: PartDef | undefined, it: Item, axis: "w" | "h"): PartAxis | undefined {
  /* a named size (an avatar's, a chip's) is one measure for both: it is picked among the properties */
  const r = resizeOf(def, it.props);
  return axis === "w" ? r?.width : r?.height;
}

/** W or H with how it is sized: a number while it is the part's own, the measure it comes to while a layout decides */
function SizeField({ item, def, axis, measured, parent, onChange, p }: { item: Item; def: PartDef; axis: "w" | "h"; measured: number | undefined; parent: Flow | null; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const ax = axisFor(def, item, axis);
  const sizing = sizingNow(item, parent, axis);
  const choices = sizingChoices(item, parent, axis);
  const own = ax && sizing === "fixed" ? axisValue(ax, item.props) : undefined;
  const write = (v: number) => {
    if (!ax) return;
    /* typing a measure makes it the part's own, as in Figma */
    const base = sizing === "fixed" ? {} : sizingPatch(item, parent, axis, "fixed");
    onChange({ ...base, props: { ...(base.props ?? item.props), [ax.key]: axisWrite(ax, v) } });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <NumberField
        name={axis === "w" ? "width" : "height"}
        word={axis === "w" ? "W" : "H"}
        value={own ?? measured}
        disabled={!ax}
        min={ax?.min ?? 0}
        max={ax?.max ?? 9999}
        step={1}
        title={!ax ? `${t(axis === "w" ? "dzWidth" : "dzHeight", lang)} · ${t("dzSetByLayout", lang)}` : t(axis === "w" ? "dzWidth" : "dzHeight", lang)}
        onChange={write}
        p={p}
      />
      {choices.length > 1 && (
        <Select
          height={26}
          label={t(axis === "w" ? "dzWidthSizing" : "dzHeightSizing", lang)}
          options={choices.map((k) => ({ key: k, label: t(k === "fixed" ? "sizeFixed" : k === "hug" ? "sizeHug" : "sizeFill", lang), icon: k === "fixed" ? "lock_open_right" : k === "hug" ? "compress" : "expand" }))}
          value={sizing}
          onChange={(k) => onChange(sizingPatch(item, parent, axis, k as FlowSizing))}
          p={p}
        />
      )}
    </div>
  );
}

const blendKey = (b: BlendMode) => `lkBlend_${b.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}` as UIKey;

/** what a field bound to a variable shows: the variable's value in the mode on show, when it is a number */
function useBoundNumber(item: Item, field: BindField): number | undefined {
  const b = useContext(BehaviorContext);
  const id = item.bind?.[field];
  const v = id !== undefined ? b.bound?.[id] : undefined;
  return typeof v === "number" ? v : undefined;
}

/** a number field with the button that binds it to a variable beside it; bound, it shows the variable's value */
function BoundNumber({ item, field, onChange, p, children }: { item: Item; field: BindField; onChange: (patch: Partial<Item>) => void; p: Palette; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <BindButton field={field} item={item} onChange={onChange} p={p} />
    </div>
  );
}

/** opacity, corner radius and blend mode: what Figma's appearance row holds */
function Appearance({ item, def, strict, onChange, p }: { item: Item; def: PartDef; strict: boolean; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const boundOpacity = useBoundNumber(item, "@opacity");
  const boundRadius = useBoundNumber(item, "@radius");
  const look = item.look ?? {};
  const setLook = (patch: Partial<NonNullable<Item["look"]>>) => onChange({ look: tidyLook({ ...look, ...patch }) });
  const corners = item.corners;
  const even = !corners || (corners.tl === corners.tr && corners.tr === corners.br && corners.br === corners.bl);
  const [each, setEach] = useState(!even);
  const seed = Math.min(def.appearance?.radius ?? 16, 64);
  const shown = corners ? (even ? corners.tl : "mixed") : seed;
  return (
    <>
      <div style={grid2}>
        <BoundNumber item={item} field="@opacity" onChange={onChange} p={p}>
          <NumberField name="opacity" icon="opacity" value={boundOpacity ?? look.opacity ?? 100} disabled={boundOpacity !== undefined} min={0} max={100} unit="%" title={t("dzOpacity", lang)} onChange={(v) => setLook({ opacity: v === 100 ? undefined : v })} p={p} />
        </BoundNumber>
        {!strict && def.appearance && (
          <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
            <BoundNumber item={item} field="@radius" onChange={onChange} p={p}>
              <NumberField name="radius" icon="rounded_corner" value={boundRadius ?? shown} disabled={boundRadius !== undefined} min={0} max={64} title={t("dzRadius", lang)} onChange={(v) => onChange({ corners: uniformRadii(v) })} p={p} />
            </BoundNumber>
            <FieldToggle
              icon="crop_free"
              name="radiusEach"
              on={each}
              title={t("dzRadiusEach", lang)}
              p={p}
              onClick={() => {
                const on = !each;
                setEach(on);
                if (on && !corners) onChange({ corners: uniformRadii(typeof shown === "number" ? shown : seed) });
              }}
            />
          </div>
        )}
      </div>
      {!strict && each && (
        <div style={grid2}>
          {(["tl", "tr", "bl", "br"] as const).map((k) => (
            <NumberField key={k} name={`radius-${k}`} word={k.toUpperCase()} value={corners?.[k] ?? seed} min={0} max={64} title={`${t("dzRadius", lang)} ${k.toUpperCase()}`} onChange={(v) => onChange({ corners: { ...(corners ?? uniformRadii(seed)), [k]: v } })} p={p} />
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Select height={28} label={t("dzBlend", lang)} p={p} value={look.blend ?? "normal"} options={BLEND_MODES.map((b) => ({ key: b, label: t(blendKey(b), lang) }))} onChange={(k) => setLook({ blend: k === "normal" ? undefined : (k as BlendMode) })} />
        </div>
        {!strict && corners && <FieldToggle icon="restart_alt" name="radiusReset" title={t("dzRadiusOwn", lang)} p={p} onClick={() => {
          setEach(false);
          onChange({ corners: undefined });
        }} />}
        {!strict && <FieldToggle icon="crop" name="clip" on={!!look.clip} title={t("lkClip", lang)} p={p} onClick={() => setLook({ clip: !look.clip || undefined })} />}
      </div>
    </>
  );
}

export type PartDesignProps = {
  item: Item;
  frame: Frame | null;
  onChange: (patch: Partial<Item>) => void;
  /** a container's auto layout places this part */
  inFlow?: boolean;
  /** the layout that places it */
  flowParent?: Flow | null;
  /** where the part stands on the canvas, and how big it came out */
  selfRect: { x: number; y: number; w: number; h: number } | null;
  /** puts the part at a place on its screen */
  onMoveTo?: (x: number, y: number) => void;
  onPlace?: PlaceFn;
  locked?: boolean;
  onSplit?: () => void;
  onMakeComponent?: () => void;
  /** puts the part in an auto layout, or gives a container one of its own */
  onAutoLayout?: () => void;
  /** saves the part as a picture at a scale */
  onExport?: (scale: number) => void;
  p: Palette;
};

export function PartDesign({ item, frame, onChange, inFlow, flowParent, selfRect, onMoveTo, onPlace, locked, onSplit, onMakeComponent, onAutoLayout, onExport, p }: PartDesignProps) {
  const lang = useLang();
  const strict = useContext(StyleRulesContext);
  const behavior = useContext(BehaviorContext);
  const [scale, setScale] = useState("2");
  const def = partBySlug(item.component);
  if (!def) return null;
  const parent = inFlow && flowParent ? flowParent : null;
  const loose = childLayoutOf(item).absolute;
  const placed = inFlow && !loose;
  const axes = resizeOf(def, item.props);
  /* W and H stand in the layout section, a pin in the position one, the field states in their own: the properties
     leave them out */
  const isState = (d: { key: string }) => isStateProp(def, d.key);
  const shownElsewhere = (d: { key: string; kind: string; screen?: boolean }) => !!d.screen || isState(d) || (d.kind === "number" && (d.key === axes?.width?.key || d.key === axes?.height?.key));
  const hasProps = def.props.some((d) => !shownElsewhere(d));
  const fx = frame?.x ?? 0;
  const fy = frame?.y ?? 0;
  const look = item.look ?? {};
  const tr = look.transform ?? {};
  const setLook = (patch: Partial<NonNullable<Item["look"]>>) => onChange({ look: tidyLook({ ...look, ...patch }) });
  const setTr = (patch: Partial<NonNullable<NonNullable<Item["look"]>["transform"]>>) => {
    const next = Object.fromEntries(Object.entries({ ...tr, ...patch }).filter(([, v]) => v !== undefined && v !== false));
    setLook({ transform: Object.keys(next).length ? next : undefined });
  };
  const group = behavior.group;
  const effects: LookBlockKey[] = strict ? ["shadows", "blur", "distort"] : ["shadows", "blur", "filters", "texture", "distort"];
  const textual = def.slug === "text" || def.category === "Basics" && def.props.some((d) => d.key === "text");
  const boundRotation = useBoundNumber(item, "@rotation");
  const widthAxis = axes?.width?.kind === "number" ? axes.width : undefined;

  return (
    <div data-design-panel style={{ display: "flex", flexDirection: "column" }}>
      {hasProps && (
        <DesignSection id="props" title={t("dzProperties", lang)} p={p}>
          <ComponentProps item={item} palette={p} onChange={onChange} frame={frame} layoutApart inFlow={inFlow} skip={shownElsewhere} />
        </DesignSection>
      )}
      {def.field && (
        <DesignSection id="field-state" title={t("dzFieldState", lang)} p={p}>
          <ComponentProps item={item} palette={p} onChange={onChange} frame={frame} layoutApart inFlow={inFlow} only={isState} />
          <div style={{ fontSize: 12, lineHeight: "16px", color: p.onSurfaceVariant, padding: "8px 4px 0" }}>{t("dzFieldStateNote", lang)}</div>
        </DesignSection>
      )}

      <DesignSection id="position" title={t("dzPosition", lang)} p={p}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {onPlace && !inFlow && !strict && <AlignBox compact onPlace={onPlace} p={p} />}
          <div style={{ ...grid2, flex: 1, minWidth: 0 }}>
            <NumberField name="x" word="X" value={selfRect ? Math.round(selfRect.x - fx) : undefined} disabled={!onMoveTo || !selfRect || placed} title={placed ? `X · ${t("dzSetByLayout", lang)}` : "X"} onChange={(v) => selfRect && onMoveTo?.(v + fx, selfRect.y)} p={p} />
            <NumberField name="y" word="Y" value={selfRect ? Math.round(selfRect.y - fy) : undefined} disabled={!onMoveTo || !selfRect || placed} title={placed ? `Y · ${t("dzSetByLayout", lang)}` : "Y"} onChange={(v) => selfRect && onMoveTo?.(selfRect.x, v + fy)} p={p} />
            {def.appearance && (
              <BoundNumber item={item} field="@rotation" onChange={onChange} p={p}>
                <NumberField name="rotation" icon="rotate_right" value={boundRotation ?? look.rotate ?? 0} disabled={boundRotation !== undefined} min={-180} max={180} unit="°" title={t("dzRotation", lang)} onChange={(v) => setLook({ rotate: v || undefined })} p={p} />
              </BoundNumber>
            )}
            {def.appearance && (
              <div style={{ display: "flex", gap: 2 }}>
                <FieldToggle icon="flip" name="flipX" on={!!tr.flipX} title={t("dzFlipH", lang)} p={p} onClick={() => setTr({ flipX: !tr.flipX || undefined })} />
                <span style={{ display: "inline-flex", transform: "rotate(90deg)" }}>
                  <FieldToggle icon="flip" name="flipY" on={!!tr.flipY} title={t("dzFlipV", lang)} p={p} onClick={() => setTr({ flipY: !tr.flipY || undefined })} />
                </span>
              </div>
            )}
          </div>
        </div>
        {onPlace && !inFlow && strict && <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 2px" }}>{t("styleDecidesPlace", lang)}</div>}
        {(!inFlow || loose) && behavior.alignToParent && !locked && <AlignToParent onAlign={behavior.alignToParent} p={p} />}
        {behavior.inFreeBox && (!inFlow || loose) && <Constraints item={item} onChange={onChange} p={p} />}
        {inFlow && <Toggle on={loose} onChange={(on) => onChange({ flowAbsolute: on || undefined })} label={t("flowAbsolute", lang)} p={p} grow />}
        {!inFlow && def.props.some((d) => d.screen) && <ComponentProps item={item} palette={p} onChange={onChange} frame={frame} layoutApart only={(d) => !!d.screen} />}
      </DesignSection>

      <DesignSection id="layout" title={def.flow ? t("layoutSection", lang) : t("dzLayout", lang)} p={p}>
        {def.flow && <FlowDirection item={item} onChange={onChange} p={p} />}
        <div style={grid2}>
          <SizeField item={item} def={def} axis="w" measured={selfRect?.w} parent={parent} onChange={onChange} p={p} />
          <SizeField item={item} def={def} axis="h" measured={selfRect?.h} parent={parent} onChange={onChange} p={p} />
        </div>
        {parent && (["w", "h"] as const).some((a) => sizingNow(item, parent, a) !== "fixed") && (
          <div style={grid2}>
            {(["w", "h"] as const).map((a) => (sizingNow(item, parent, a) !== "fixed" ? <SizeLimits key={a} item={item} axis={a} onChange={onChange} p={p} /> : <span key={a} />))}
          </div>
        )}
        {widthAxis && sizingNow(item, parent, "w") === "fixed" && (
          <div title={t("dzScreenWidths", lang)}>
            <WidthRun value={axisValue(widthAxis, item.props)} onChange={(v) => v !== undefined && onChange({ props: { ...item.props, [widthAxis.key]: axisWrite(widthAxis, v) } })} frameW={frame ? frameSizeOf(frame).w : PHONE_W} p={p} height={26} />
          </div>
        )}
        {def.flow && <FlowSpacing item={item} onChange={onChange} p={p} />}
        {parent && <SelfAlign item={item} parent={parent} onChange={onChange} p={p} />}
        {inFlow && !flowParent && <Toggle on={!!item.flowFill} onChange={(flowFill) => onChange({ flowFill: flowFill || undefined })} label={t("flowFill", lang)} p={p} grow />}
      </DesignSection>

      <RepeatSection p={p} />

      <PartDataSection item={item} frame={frame ?? null} p={p} />

      {def.appearance && (
        <DesignSection
          id="appearance"
          title={t("dzAppearance", lang)}
          p={p}
          actions={
            group && (
              <FieldToggle icon={group.hidden ? "visibility_off" : "visibility"} name="hidden" on={!!group.hidden} title={t(group.hidden ? "dzHiddenStart" : "dzVisibleStart", lang)} p={p} onClick={() => behavior.patchGroup({ hidden: group.hidden ? undefined : true })} />
            )
          }
        >
          <Appearance key={item.id} item={item} def={def} strict={strict} onChange={onChange} p={p} />
        </DesignSection>
      )}

      {def.appearance && (
        <DesignSection id="typography" title={t("dzTypography", lang)} p={p} defaultOpen={textual} actions={<BindButton field="@text" item={item} onChange={onChange} p={p} />}>
          <BoundChip field="@text" item={item} p={p} />
          <TextRun value={item.textColor} onChange={(textColor) => onChange({ textColor })} p={p} />
          {!strict && <LookPanel key={`${item.id}:text`} item={item} onChange={onChange} p={p} only={["text"]} wrap={(b) => b.body} />}
        </DesignSection>
      )}

      {def.appearance && (
        <LookPanel
          key={`${item.id}:fill`}
          item={item}
          onChange={onChange}
          p={p}
          strict={strict}
          only={strict ? [] : ["fill"]}
          wrap={(b) => (
            <DesignSection id="fill" title={t("dzFill", lang)} p={p} actions={<><BindButton field="@fill" item={item} onChange={onChange} p={p} />{b.actions}</>}>
              <BoundChip field="@fill" item={item} p={p} />
              <FillRun value={item.fill} onChange={(fill) => onChange({ fill })} p={p} clearable />
              {b.body}
            </DesignSection>
          )}
        />
      )}
      {def.appearance && strict && (
        <DesignSection id="fill" title={t("dzFill", lang)} p={p} actions={<BindButton field="@fill" item={item} onChange={onChange} p={p} />}>
          <BoundChip field="@fill" item={item} p={p} />
          <FillRun value={item.fill} onChange={(fill) => onChange({ fill })} p={p} clearable />
        </DesignSection>
      )}

      {def.appearance && !strict && (
        <LookPanel
          key={`${item.id}:stroke`}
          item={item}
          onChange={onChange}
          p={p}
          only={["stroke"]}
          wrap={(b) => (
            <DesignSection id="stroke" title={t("dzStroke", lang)} p={p} actions={<><BindButton field="@stroke" item={item} onChange={onChange} p={p} />{b.actions}</>}>
              {item.bind?.["@stroke"] ? <BoundChip field="@stroke" item={item} p={p} /> : null}
              {b.on ? b.body : null}
            </DesignSection>
          )}
        />
      )}

      {def.appearance && (
        <DesignSection id="effects" title={t("dzEffects", lang)} p={p}>
          <LookPanel key={`${item.id}:effects`} item={item} onChange={onChange} p={p} strict={strict} only={effects} />
        </DesignSection>
      )}

      {def.appearance && <LookPanel key={`${item.id}:presets`} item={item} onChange={onChange} p={p} strict={strict} only={["presets"]} wrap={(b) => <DesignSection id="looks" title={t("dzLooks", lang)} p={p}>{b.body}</DesignSection>} />}

      {onExport && (
        <DesignSection id="export" title={t("dzExport", lang)} p={p}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 72, flex: "0 0 auto" }}>
              <Select height={28} label={t("dzExportScale", lang)} p={p} value={scale} options={["1", "2", "3"].map((k) => ({ key: k, label: `${k}x` }))} onChange={setScale} />
            </div>
            <button data-export-part onClick={() => onExport(Number(scale))} className="m3-press" style={{ flex: 1, height: 28, borderRadius: 6, border: `1px solid ${p.outlineVariant}`, background: "transparent", color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="download" size={16} />
              {t("dzExportPng", lang)}
            </button>
          </div>
        </DesignSection>
      )}

      {((onSplit && def.atoms) || onMakeComponent || onAutoLayout) && !locked && (
        <DesignSection id="actions" title={t("dzActions", lang)} p={p}>
          {/* a container with a layout of its own has nothing to gain from this */}
          {onAutoLayout && !(def.holds && def.flow && item.props?.layout && item.props.layout !== "free") && (
            <button onClick={onAutoLayout} data-suggest-layout title={t("suggestLayoutKeys", lang)} className="m3-press" style={actionBtn(p)}>
              <Icon name="view_quilt" size={16} />
              {t("suggestLayout", lang)}
            </button>
          )}
          {onSplit && def.atoms && (
            <button onClick={onSplit} data-split-atoms title={t("splitAtomsHint", lang)} className="m3-press" style={actionBtn(p)}>
              <Icon name="call_split" size={16} />
              {t("splitAtoms", lang)}
            </button>
          )}
          {onMakeComponent && (
            <button onClick={onMakeComponent} data-make-component className="m3-press" style={actionBtn(p)}>
              <Icon name="widgets" size={16} />
              {t("makeComponent", lang)}
            </button>
          )}
        </DesignSection>
      )}
    </div>
  );
}

/** Figma's six align buttons for one layer: against the box it stands in, or its screen */
function AlignToParent({ onAlign, p }: { onAlign: NonNullable<React.ContextType<typeof BehaviorContext>["alignToParent"]>; p: Palette }) {
  const lang = useLang();
  const cells = [
    { how: "left", icon: "align_horizontal_left", title: "lineLeft" },
    { how: "centerH", icon: "align_horizontal_center", title: "lineCenterH" },
    { how: "right", icon: "align_horizontal_right", title: "lineRight" },
    { how: "top", icon: "align_vertical_top", title: "lineTop" },
    { how: "centerV", icon: "align_vertical_center", title: "lineCenterV" },
    { how: "bottom", icon: "align_vertical_bottom", title: "lineBottom" },
  ] as const;
  return (
    <div data-align-parent role="group" aria-label={t("csAlignParent", lang)} title={t("csAlignParent", lang)} style={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      {cells.map((c) => (
        <FieldToggle key={c.how} icon={c.icon} name={`align-${c.how}`} title={`${t("csAlignParent", lang)}: ${t(c.title, lang)}`} p={p} onClick={() => onAlign(c.how)} />
      ))}
    </div>
  );
}

const H_RULES = [
  { key: "left", text: "csLeft" },
  { key: "right", text: "csRight" },
  { key: "stretch", text: "csLeftRight" },
  { key: "center", text: "csCenter" },
  { key: "scale", text: "csScale" },
] as const;
const V_RULES = [
  { key: "top", text: "csTop" },
  { key: "bottom", text: "csBottom" },
  { key: "stretch", text: "csTopBottom" },
  { key: "center", text: "csCenter" },
  { key: "scale", text: "csScale" },
] as const;

/** what a part in a box with no auto layout keeps when the box changes size, on each axis */
function Constraints({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const c = item.constraints ?? {};
  const put = (patch: NonNullable<Item["constraints"]>) => {
    const next = { ...c, ...patch };
    if (next.h === "left") delete next.h;
    if (next.v === "top") delete next.v;
    onChange({ constraints: next.h || next.v ? next : undefined });
  };
  return (
    <div data-constraints style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant, padding: "2px 2px 0" }}>{t("csConstraints", lang)}</div>
      <div style={grid2}>
        <Select height={28} label={t("csHorizontal", lang)} p={p} value={c.h ?? "left"} options={H_RULES.map((r) => ({ key: r.key, label: t(r.text, lang) }))} onChange={(k) => put({ h: k as (typeof H_RULES)[number]["key"] })} />
        <Select height={28} label={t("csVertical", lang)} p={p} value={c.v ?? "top"} options={V_RULES.map((r) => ({ key: r.key, label: t(r.text, lang) }))} onChange={(k) => put({ v: k as (typeof V_RULES)[number]["key"] })} />
      </div>
    </div>
  );
}

export const actionBtn = (p: Palette): React.CSSProperties => ({ height: 32, borderRadius: 8, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" });

/* ---------- several parts at once ---------- */

/** what several selected parts share, read off each: one value, or "mixed" */
export type Shared = { x: number | "mixed"; y: number | "mixed"; w: number | "mixed" | undefined; h: number | "mixed" | undefined; opacity: number | "mixed"; radius: number | "mixed" | undefined; canSize: { w: boolean; h: boolean } };

export function MultiDesign({
  p,
  shared,
  onEach,
  onAlign,
  onDistribute,
  onTidyUp,
  onPlace,
  selectionKey,
  strict,
}: {
  p: Palette;
  shared: Shared;
  /** sets one field on every selected part */
  onEach: (field: "x" | "y" | "w" | "h" | "opacity" | "radius", v: number) => void;
  onAlign?: (how: AlignHow) => void;
  onDistribute?: (axis: "x" | "y", gap?: number) => void;
  onTidyUp?: () => void;
  onPlace?: PlaceFn;
  selectionKey: string;
  strict: boolean;
}) {
  const lang = useLang();
  return (
    <div data-design-panel="multi" style={{ display: "flex", flexDirection: "column" }}>
      {onAlign && onDistribute && (
        <DesignSection id="multi-align" title={t("dzAlignment", lang)} p={p}>
          <LineUp key={selectionKey} onAlign={onAlign} onDistribute={onDistribute} p={p} />
          {onTidyUp && (
            <button onClick={onTidyUp} data-tidy-up title={t("tidyUpKeys", lang)} className="m3-press" style={actionBtn(p)}>
              <Icon name="grid_on" size={16} />
              {t("tidyUp", lang)}
            </button>
          )}
        </DesignSection>
      )}
      <DesignSection id="multi-position" title={t("dzPosition", lang)} p={p}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {onPlace && <AlignBox key={selectionKey} compact onPlace={onPlace} p={p} />}
          <div style={{ ...grid2, flex: 1, minWidth: 0 }}>
            <NumberField name="x" word="X" value={shared.x} title="X" onChange={(v) => onEach("x", v)} p={p} />
            <NumberField name="y" word="Y" value={shared.y} title="Y" onChange={(v) => onEach("y", v)} p={p} />
            <NumberField name="width" word="W" value={shared.w} disabled={!shared.canSize.w} title={t("dzWidth", lang)} onChange={(v) => onEach("w", v)} p={p} />
            <NumberField name="height" word="H" value={shared.h} disabled={!shared.canSize.h} title={t("dzHeight", lang)} onChange={(v) => onEach("h", v)} p={p} />
          </div>
        </div>
      </DesignSection>
      <DesignSection id="multi-appearance" title={t("dzAppearance", lang)} p={p}>
        <div style={grid2}>
          <NumberField name="opacity" icon="opacity" value={shared.opacity} min={0} max={100} unit="%" title={t("dzOpacity", lang)} onChange={(v) => onEach("opacity", v)} p={p} />
          {!strict && <NumberField name="radius" icon="rounded_corner" value={shared.radius} min={0} max={64} title={t("dzRadius", lang)} onChange={(v) => onEach("radius", v)} p={p} />}
        </div>
      </DesignSection>
    </div>
  );
}

/** what the selected parts share, for the panel of several */
export function sharedOf(items: Item[], rects: Map<string, { x: number; y: number; w: number; h: number }>, frameOrigin: (id: string) => { x: number; y: number }): Shared {
  const one = <V,>(vs: V[]): V | "mixed" => (vs.every((v) => v === vs[0]) ? vs[0] : "mixed");
  const pos = items.map((it) => {
    const r = rects.get(it.id);
    const o = frameOrigin(it.id);
    return r ? { x: Math.round(r.x - o.x), y: Math.round(r.y - o.y), w: Math.round(r.w), h: Math.round(r.h) } : { x: 0, y: 0, w: 0, h: 0 };
  });
  const sizeAxis = (axis: "w" | "h") => items.every((it) => !!axisFor(partBySlug(it.component), it, axis));
  return {
    x: one(pos.map((r) => r.x)),
    y: one(pos.map((r) => r.y)),
    w: one(pos.map((r) => r.w)),
    h: one(pos.map((r) => r.h)),
    opacity: one(items.map((it) => it.look?.opacity ?? 100)),
    radius: items.every((it) => partBySlug(it.component)?.appearance) ? one(items.map((it) => (it.corners ? it.corners.tl : Math.min(partBySlug(it.component)?.appearance?.radius ?? 16, 64)))) : undefined,
    canSize: { w: sizeAxis("w"), h: sizeAxis("h") },
  };
}

/** what setting one shared field writes on one part, or null when it has nothing to write */
export function eachPatch(it: Item, field: "w" | "h" | "opacity" | "radius", v: number): Partial<Item> | null {
  const def = partBySlug(it.component);
  if (field === "opacity") return { look: tidyLook({ ...it.look, opacity: v === 100 ? undefined : v }) };
  if (field === "radius") return def?.appearance ? { corners: uniformRadii(v) } : null;
  const ax = axisFor(def, it, field);
  return ax ? { props: { ...it.props, [ax.key]: axisWrite(ax, v) } } : null;
}
