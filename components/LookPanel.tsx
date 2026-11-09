import { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clamp, type BlendMode, type ColorPaint, type ColorRef, type GradientStop, type Item, type ItemLook, type LookShadow, type LookStroke, type LookText, type LookTexture, type PaintLayer, type Palette, type TextureKind } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { roleName } from "@/lib/i18n/look";
import {
  BLEND_MODES,
  ELEVATION_LEVELS,
  LIMITS,
  LOOK_PRESETS,
  MAX_FILLS,
  MAX_SHADOWS,
  MAX_STOPS,
  PAINT_TYPES,
  TEXTURE_KINDS,
  TEXTURE_OPACITY,
  TEXTURE_SIZE,
  colorCss,
  colorsOfLook,
  formatColor,
  legacyGradient,
  legacyShadows,
  lookGradientTextStyle,
  lookStyle,
  paintCss,
  parseColor,
  strictLook,
  tidyLook,
  tokenRole,
  withAlpha,
  withPreset,
  type ColorRole,
} from "@/lib/look";
import { usePartTheme } from "@/parts/theme";
import { MATERIAL_BLENDS, type MaterialBlend, type MaterialLayer } from "@/lib/material";
import { MaterialThumb, useMaterials } from "./Materials";
import { BehaviorContext } from "./EffectsPanel";
import { Icon } from "./Icon";
import { Num } from "./PartPanel";
import { ConfirmDialog, IconBtn, RUN_CELL, Segmented, Select, Toggle } from "./ui";

/* The effects of a part (lib/look.ts), in the inspector's appearance section. A strip of one-click looks on top, then a
 * group per kind of effect, each folded until it has something in it. Whatever a preset or a control writes is an
 * ordinary look field, so everything stays editable. Held to a style, only what the rules leave open is offered:
 * elevation, opacity, blur, blend and transform. */

/* ---------- small pieces ---------- */

const CHECKER = "repeating-conic-gradient(#c8c8c8 0 25%, #ffffff 0 50%) 0 0 / 8px 8px";
const MONO = 'ui-monospace, "Cascadia Code", Consolas, monospace';

/** Where a role is read as the document has it: the parts' own scope, in the document's mode. It adds no box. */
function Scope({ children }: { children: React.ReactNode }) {
  const { dark } = usePartTheme();
  return (
    <span className={dark ? "dark" : undefined} style={{ display: "contents" }}>
      <span className="m3-part-scope" style={{ display: "contents" }}>
        {children}
      </span>
    </span>
  );
}

/** a color drawn over a checkerboard, so how much of it shows can be seen */
function Swatch({ color, size = 24, radius = 6, p }: { color?: ColorRef; size?: number; radius?: number; p: Palette }) {
  const css = color ? colorCss(color) : undefined;
  return (
    <Scope>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          flex: "0 0 auto",
          width: size,
          height: size,
          borderRadius: radius,
          background: css ? `linear-gradient(${css}, ${css}), ${CHECKER}` : `linear-gradient(135deg, transparent 46%, ${p.error} 46% 54%, transparent 54%), ${p.surface}`,
          boxShadow: `inset 0 0 0 1px ${p.outlineVariant}`,
        }}
      />
    </Scope>
  );
}

/** A number with a slider, its name beside it: the long run of numbers in this panel has to say what each one is. */
function Range({ label, value, min, max, step = 1, onChange, p }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; p: Palette }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 84px) minmax(0, 1fr) 48px", alignItems: "center", gap: 8 }}>
      <span title={label} style={{ fontSize: 12, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <input
        type="range"
        className="m3-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--track": p.secondaryContainer, "--thumb": p.primary } as React.CSSProperties}
      />
      <Num value={Math.round(value)} min={min} max={max} title={label} onChange={onChange} p={p} />
    </div>
  );
}

/** a number that may also be left empty, which leaves it to the part */
function OptNum({ value, min, max, label, onChange, p, width = 52 }: { value: number | undefined; min: number; max: number; label: string; onChange: (v: number | undefined) => void; p: Palette; width?: number }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    if (text.trim() === "") return onChange(undefined);
    const n = Number(text);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n * 10) / 10, min, max));
    else setText(value === undefined ? "" : String(value));
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: p.onSurfaceVariant, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder="–"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="m3-number"
        style={{ width, height: 28, padding: "0 6px", borderRadius: 8, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, fontWeight: 600, textAlign: "center", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
      />
    </label>
  );
}

const smallBtn = (p: Palette, on = false): React.CSSProperties => ({
  height: 32,
  padding: "0 12px",
  borderRadius: 16,
  border: on ? "none" : `1px solid ${p.outlineVariant}`,
  background: on ? p.secondaryContainer : "transparent",
  color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  whiteSpace: "nowrap",
  minWidth: 0,
});

/** One kind of effect, folded until it has something in it. Once the author opens or folds one, it stays that way. */
function Sub({ id, icon, title, on, actions, children, p }: { id: string; icon: string; title: string; on: boolean; actions?: React.ReactNode; children: React.ReactNode; p: Palette }) {
  const key = `m3e:look:${id}`;
  const [chosen, setChosen] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : v === "1";
    } catch {
      return null;
    }
  });
  const open = chosen ?? on;
  const toggle = () => {
    setChosen(!open);
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {}
  };
  return (
    <div data-look-group={id} style={{ borderTop: `1px solid ${p.outlineVariant}`, paddingTop: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 36 }}>
        <button
          onClick={toggle}
          aria-expanded={open}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 4px", border: "none", background: "transparent", color: p.onSurface, cursor: "pointer", borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: "left" }}
        >
          <Icon name={icon} size={18} color={p.onSurfaceVariant} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {on && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: p.primary, flex: "0 0 auto" }} />}
          <Icon name={open ? "expand_less" : "expand_more"} size={18} color={p.onSurfaceVariant} />
        </button>
        {actions}
      </div>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px 12px" }}>{children}</div>}
    </div>
  );
}

/* ---------- colors ---------- */

/** the roles a picker offers, in rows the way a scheme reads: the accents and their ons, then the surfaces and lines */
const PICK_ROLES: ColorRole[] = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "error",
  "on-error",
  "error-container",
  "on-error-container",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "surface",
  "surface-dim",
  "surface-bright",
  "on-surface",
  "on-surface-variant",
  "outline",
  "outline-variant",
  "inverse-surface",
  "inverse-on-surface",
  "inverse-primary",
  "scrim",
];

const BASICS: ColorRef[] = ["#ffffff", "#000000", "#0000"];
const RECENT_KEY = "m3e:look:recent";

function recentColors(): ColorRef[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((c): c is string => parseColor(c) !== undefined) : [];
  } catch {
    return [];
  }
}

function remember(c: ColorRef) {
  if (!parseColor(c)) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recentColors().filter((x) => x !== c)].slice(0, 10)));
  } catch {}
}

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` as six hex digits: what the browser worked a role out to */
function cssToHex(css: string): string | undefined {
  const rgb = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(css);
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  const parts = rgb ? rgb.slice(1, 4).map(Number) : srgb ? srgb.slice(1, 4).map((v) => Number(v) * 255) : undefined;
  return parts ? `#${parts.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}` : undefined;
}

/** A color: the theme's roles, any hex at any alpha, and the colors already in use on this screen. It opens in place
 *  under its row, so it scrolls with the panel and never covers what it changes. */
export function ColorPick({ value, onChange, label, p, clearable }: { value?: ColorRef; onChange: (c: ColorRef | undefined) => void; label: string; p: Palette; clearable?: boolean }) {
  const lang = useLang();
  const behavior = useContext(BehaviorContext);
  const [open, setOpen] = useState(false);
  const parsed = parseColor(value);
  const alpha = Math.round(parsed?.alpha ?? 100);
  const probe = useRef<HTMLSpanElement | null>(null);
  const [resolved, setResolved] = useState<string | undefined>();
  useEffect(() => {
    if (open && probe.current) setResolved(cssToHex(getComputedStyle(probe.current).color));
  }, [open, value]);
  const [hexText, setHexText] = useState("");
  useEffect(() => setHexText(parsed && "hex" in parsed ? parsed.hex.toUpperCase() : (resolved?.toUpperCase() ?? "")), [value, resolved]);
  const inUse = useMemo(() => {
    if (!open) return [];
    const all = [...recentColors(), ...behavior.groups.flatMap((g) => g.items.flatMap((it) => colorsOfLook(it.look)))];
    return [...new Set(all)].filter((c) => !BASICS.includes(c)).slice(0, 13);
  }, [open, behavior.groups]);
  const pick = (c: ColorRef) => {
    onChange(c);
    remember(c);
  };
  const name = !parsed ? t("lkColorNone", lang) : "role" in parsed ? roleName(parsed.role, lang) : parsed.hex.toUpperCase();
  /* a role from the grid keeps the share already chosen; a color in use comes as it is */
  const cell = (c: ColorRef, title: string, role = false) => {
    const on = role ? !!parsed && "role" in parsed && parsed.role === c : value === c;
    return (
      <button
        key={c}
        title={title}
        aria-label={title}
        aria-pressed={on}
        onClick={() => pick(role && alpha < 100 ? withAlpha(c, alpha) : c)}
        style={{ width: "100%", aspectRatio: "1", padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: `linear-gradient(${colorCss(c)}, ${colorCss(c)}), ${CHECKER}`, boxShadow: on ? `0 0 0 2px ${p.surfaceContainerLow}, 0 0 0 4px ${p.primary}` : `inset 0 0 0 1px ${p.outlineVariant}` }}
      />
    );
  };
  return (
    <div data-color-pick style={{ minWidth: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label}: ${name}`}
        className="m3-press"
        style={{ width: "100%", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 6px", border: "none", borderRadius: 10, background: p.surfaceContainerHigh, color: p.onSurface, cursor: "pointer", fontSize: 12, textAlign: "left" }}
      >
        <Swatch color={value} p={p} />
        <span style={{ fontSize: 12, color: p.onSurfaceVariant, flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, fontFamily: parsed && "hex" in parsed ? MONO : undefined }}>
          {name}
          {parsed && alpha < 100 ? ` ${alpha}%` : ""}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} color={p.onSurfaceVariant} />
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: 8, borderRadius: 12, background: p.surfaceContainerLow, display: "flex", flexDirection: "column", gap: 8 }}>
          <Scope>
            <span ref={probe} aria-hidden style={{ display: "none", color: colorCss(value) ?? "transparent" }} />
            <div role="group" aria-label={t("lkColorRoles", lang)} style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 4 }}>
              {PICK_ROLES.map((r) => cell(r, roleName(r, lang), true))}
            </div>
          </Scope>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ position: "relative", width: 28, height: 28, borderRadius: 8, overflow: "hidden", flex: "0 0 auto", boxShadow: `inset 0 0 0 1px ${p.outlineVariant}`, background: resolved ?? (parsed && "hex" in parsed ? parsed.hex : "#000000") }}>
              <input
                type="color"
                aria-label={t("lkColorPick", lang)}
                value={parsed && "hex" in parsed ? parsed.hex : (resolved ?? "#000000")}
                onChange={(e) => pick(formatColor({ hex: e.target.value.toLowerCase(), alpha }))}
                style={{ position: "absolute", inset: -8, width: 44, height: 44, opacity: 0, cursor: "pointer" }}
              />
            </span>
            <input
              value={hexText}
              aria-label={t("lkColorHex", lang)}
              spellCheck={false}
              onChange={(e) => {
                setHexText(e.target.value);
                const v = e.target.value.trim();
                const hex = parseColor(v.startsWith("#") ? v : `#${v}`);
                if (hex && "hex" in hex && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) pick(formatColor({ hex: hex.hex, alpha }));
              }}
              style={{ flex: 1, minWidth: 0, height: 28, padding: "0 8px", borderRadius: 8, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, fontFamily: MONO, outline: "none" }}
            />
            <span style={{ fontSize: 11, color: p.onSurfaceVariant }}>α</span>
            <Num value={alpha} min={0} max={100} title={t("lkColorAlpha", lang)} onChange={(a) => value && onChange(withAlpha(value, a))} p={p} />
            {clearable && value && <IconBtn icon="format_color_reset" size={28} p={p} title={t("lkColorNone", lang)} onClick={() => onChange(undefined)} />}
          </div>
          <div role="group" aria-label={t("lkColorInUse", lang)} style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 4 }}>
            <Scope>
              {[...BASICS, ...inUse].map((c) => cell(c, c))}
            </Scope>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- paint ---------- */

const TYPE_KEY: Record<PaintLayer["type"], UIKey> = { solid: "lkSolid", linear: "lkLinear", radial: "lkRadial", conic: "lkConic", material: "lkMaterial" };

/** a paint as a small picture of itself */
function PaintSwatch({ layer, size = 28, p }: { layer: PaintLayer; size?: number; p: Palette }) {
  const { materials } = useMaterials();
  if (layer.type === "material") return <span style={{ opacity: layer.hidden ? 0.4 : 1, display: "inline-flex" }}><MaterialThumb material={materials.find((m) => m.id === layer.material)} size={size} /></span>;
  const image = paintCss({ ...layer, hidden: false });
  return (
    <Scope>
      <span aria-hidden style={{ display: "inline-block", flex: "0 0 auto", width: size, height: size, borderRadius: 8, background: image ? `${image}, ${CHECKER}` : CHECKER, boxShadow: `inset 0 0 0 1px ${p.outlineVariant}`, opacity: layer.hidden ? 0.4 : 1 }} />
    </Scope>
  );
}

/** A gradient's colors on a bar: a press on the bar adds one there, a stop is dragged along it, and the chosen one is
 *  edited under it. */
function GradientStops({ stops, onChange, p }: { stops: GradientStop[]; onChange: (s: GradientStop[]) => void; p: Palette }) {
  const lang = useLang();
  const [sel, setSel] = useState(0);
  const bar = useRef<HTMLDivElement | null>(null);
  const cur = Math.min(sel, stops.length - 1);
  const atOf = (x: number) => {
    const r = bar.current?.getBoundingClientRect();
    return r ? clamp(Math.round(((x - r.left) / Math.max(1, r.width)) * 100), 0, 100) : 0;
  };
  const move = (i: number, at: number) => onChange(stops.map((s, j) => (j === i ? { ...s, at } : s)));
  const drag = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(i);
    e.currentTarget.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => move(i, atOf(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const add = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stops.length >= MAX_STOPS) return;
    const at = atOf(e.clientX);
    const near = [...stops].sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
    onChange([...stops, { color: near?.color ?? "#ffffff", at }]);
    setSel(stops.length);
  };
  const preview = paintCss({ type: "linear", angle: 90, stops });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Scope>
        <div style={{ padding: "0 8px" }}>
          <div ref={bar} onPointerDown={add} title={t("lkStopHint", lang)} data-gradient-bar style={{ position: "relative", height: 24, borderRadius: 6, cursor: "copy", background: preview ? `${preview}, ${CHECKER}` : CHECKER, boxShadow: `inset 0 0 0 1px ${p.outlineVariant}` }}>
            {stops.map((s, i) => (
              <button
                key={i}
                aria-label={`${t("lkStopAt", lang)} ${s.at}%`}
                onPointerDown={drag(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    move(i, clamp(s.at + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1), 0, 100));
                  }
                }}
                onFocus={() => setSel(i)}
                style={{
                  position: "absolute",
                  left: `calc(${s.at}% - 8px)`,
                  top: -4,
                  width: 16,
                  height: 32,
                  padding: 0,
                  borderRadius: 6,
                  cursor: "ew-resize",
                  touchAction: "none",
                  background: `linear-gradient(${colorCss(s.color)}, ${colorCss(s.color)}), ${CHECKER}`,
                  border: `2px solid ${i === cur ? p.primary : "#ffffff"}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  zIndex: i === cur ? 2 : 1,
                }}
              />
            ))}
          </div>
        </div>
      </Scope>
      {stops[cur] && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: p.onSurfaceVariant, flex: 1 }}>{t("lkStopAt", lang)}</span>
            <Num value={stops[cur].at} min={0} max={100} title={t("lkStopAt", lang)} onChange={(v) => move(cur, v)} p={p} />
            <span style={{ fontSize: 12, color: p.onSurfaceVariant }}>%</span>
            <IconBtn icon="delete" size={32} p={p} disabled={stops.length <= 2} title={t("lkRemove", lang)} onClick={() => stops.length > 2 && (onChange(stops.filter((_, j) => j !== cur)), setSel(Math.max(0, cur - 1)))} />
          </div>
          <ColorPick value={stops[cur].color} onChange={(c) => c && onChange(stops.map((s, j) => (j === cur ? { ...s, color: c } : s)))} label={`${t("lkStopAt", lang)} ${stops[cur].at}%`} p={p} />
        </>
      )}
    </div>
  );
}

const fillWords = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** A layer of a material of the document's library (lib/materials.ts): which one, laid as it is or tinted, and how its
 *  tile is laid. */
function MaterialEditor({ layer, onChange, p }: { layer: MaterialLayer; onChange: (l: MaterialLayer) => void; p: Palette }) {
  const lang = useLang();
  const { materials, importPack, remove, uses } = useMaterials();
  const [asking, setAsking] = useState<string | null>(null);
  const current = materials.find((m) => m.id === layer.material);
  const set = (patch: Partial<MaterialLayer>) => onChange(Object.fromEntries(Object.entries({ ...layer, ...patch }).filter(([, v]) => v !== undefined)) as MaterialLayer);
  const asked = asking ? materials.find((m) => m.id === asking) : undefined;
  return (
    <div data-material-editor style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div role="radiogroup" aria-label={t("mtLibrary", lang)} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {materials.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={m.id === layer.material}
            title={`${m.name} · ${m.swatch.palette.join(" ")}`}
            data-material-pick={m.id}
            onClick={() => set({ material: m.id })}
            style={{ padding: 2, borderRadius: 10, border: `2px solid ${m.id === layer.material ? p.primary : "transparent"}`, background: "transparent", cursor: "pointer", display: "inline-flex" }}
          >
            <MaterialThumb material={m} size={36} />
          </button>
        ))}
        {importPack && <IconBtn icon="upload_file" size={40} p={p} title={t("mtImport", lang)} onClick={importPack} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: current ? p.onSurface : p.error }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.name : `${layer.material} · ${t("mtMissing", lang)}`}</span>
        {current && remove && <IconBtn icon="delete" size={28} p={p} title={t("mtRemove", lang)} onClick={() => setAsking(current.id)} />}
      </div>
      <Segmented<"surface" | "tint">
        options={[
          { key: "surface", label: t("mtModeSurface", lang), style: RUN_CELL },
          { key: "tint", label: t("mtModeTint", lang), style: RUN_CELL },
        ]}
        value={layer.mode ?? "surface"}
        onChange={(mode) => set(mode === "tint" ? { mode, tint: layer.tint ?? "primary" } : { mode: undefined, tint: undefined })}
        p={p}
        height={32}
        tight
        label={t("lkMaterial", lang)}
      />
      {layer.mode === "tint" && <ColorPick value={layer.tint} onChange={(tint) => set({ tint })} label={layer.tint ? t("mtTint", lang) : t("mtTintAverage", lang)} p={p} clearable />}
      <Range label={t("mtScale", lang)} value={layer.scale ?? 100} min={5} max={400} onChange={(v) => set({ scale: v === 100 ? undefined : v })} p={p} />
      <Range label={t("mtOffsetX", lang)} value={layer.x ?? 0} min={-100} max={100} onChange={(v) => set({ x: v || undefined })} p={p} />
      <Range label={t("mtOffsetY", lang)} value={layer.y ?? 0} min={-100} max={100} onChange={(v) => set({ y: v || undefined })} p={p} />
      <Range label={t("lookOpacity", lang)} value={layer.opacity ?? 100} min={0} max={100} onChange={(v) => set({ opacity: v === 100 ? undefined : v })} p={p} />
      <Select
        label={t("lkBlendMode", lang)}
        p={p}
        value={layer.blend ?? "normal"}
        options={MATERIAL_BLENDS.map((b) => ({ key: b, label: `${b === "normal" ? `${t("lkBlendMode", lang)}: ` : ""}${t(blendKey(b), lang)}` }))}
        onChange={(k) => set({ blend: k === "normal" ? undefined : (k as MaterialBlend) })}
      />
      <ConfirmDialog
        open={!!asked}
        title={asked ? fillWords(t("mtRemoveAsk", lang), { name: asked.name }) : ""}
        body={asked ? ((uses?.(asked.id) ?? 0) > 0 ? fillWords(t("mtRemoveUsed", lang), { n: String(uses!(asked.id)) }) : t("mtRemoveUnused", lang)) : ""}
        p={p}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (asked) remove?.(asked.id);
          setAsking(null);
        }}
      />
    </div>
  );
}

/** One layer of paint: what kind it is, its color or its gradient, and where a gradient runs; a material's own editor
 *  for a material. */
function PaintEditor({ layer, onChange, p, types = PAINT_TYPES }: { layer: PaintLayer; onChange: (l: PaintLayer) => void; p: Palette; types?: readonly PaintLayer["type"][] }) {
  const lang = useLang();
  const { materials, importPack } = useMaterials();
  /* a material needs the library: with none to name, the kind is offered only where a pack can be imported */
  const offered = types.filter((k) => k !== "material" || materials.length > 0 || importPack);
  const retype = (type: PaintLayer["type"]) => {
    if (type === layer.type) return;
    if (type === "material") {
      const first = materials[0];
      if (!first) return importPack?.();
      return onChange({ type, material: first.id, ...(layer.hidden ? { hidden: true } : {}) });
    }
    if (layer.type === "material") {
      const color = layer.tint ?? materials.find((m) => m.id === layer.material)?.swatch.average ?? "primary";
      return onChange(type === "solid" ? { type, color } : { type, stops: [{ color, at: 0 }, { color: withAlpha(color, 0), at: 100 }], ...(type !== "radial" ? { angle: type === "linear" ? 180 : 0 } : {}), ...(type !== "linear" ? { x: 50, y: 50 } : {}) });
    }
    if (type === "solid") return onChange({ type, color: layer.stops?.[0]?.color ?? layer.color ?? "primary", ...(layer.hidden ? { hidden: true } : {}) });
    const stops = layer.stops ?? [
      { color: layer.color ?? "primary", at: 0 },
      { color: withAlpha(layer.color ?? "primary", 0), at: 100 },
    ];
    onChange({ type, stops, ...(type !== "radial" ? { angle: layer.angle ?? (type === "linear" ? 180 : 0) } : {}), ...(type !== "linear" ? { x: layer.x ?? 50, y: layer.y ?? 50 } : {}), ...(layer.hidden ? { hidden: true } : {}) });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Segmented<PaintLayer["type"]> options={offered.map((k) => ({ key: k, label: t(TYPE_KEY[k], lang), style: RUN_CELL }))} value={layer.type} onChange={retype} p={p} height={32} tight label={t("lkFill", lang)} />
      {layer.type === "material" ? (
        <MaterialEditor layer={layer} onChange={onChange} p={p} />
      ) : layer.type === "solid" ? (
        <ColorPick value={layer.color} onChange={(c) => c && onChange({ ...layer, color: c })} label={t("lkFill", lang)} p={p} />
      ) : (
        <>
          <GradientStops stops={layer.stops ?? []} onChange={(stops) => onChange({ ...layer, stops })} p={p} />
          {layer.type !== "radial" && <Range label={t("lkAngle", lang)} value={layer.angle ?? (layer.type === "linear" ? 180 : 0)} min={0} max={360} onChange={(angle) => onChange({ ...layer, angle })} p={p} />}
          {layer.type !== "linear" && (
            <>
              <Range label={t("lkCenterX", lang)} value={layer.x ?? 50} min={0} max={100} onChange={(x) => onChange({ ...layer, x })} p={p} />
              <Range label={t("lkCenterY", lang)} value={layer.y ?? 50} min={0} max={100} onChange={(y) => onChange({ ...layer, y })} p={p} />
            </>
          )}
          {layer.type === "radial" && <Toggle on={!!layer.circle} onChange={(circle) => onChange({ ...layer, circle: circle || undefined })} label={t("lkCircle", lang)} p={p} grow />}
        </>
      )}
    </div>
  );
}

/** A row of a list (a paint, a shadow): a picture of it, what it is, and what can be done to it. Pressing the picture
 *  opens it for editing under the row. */
function ListRow({ lead, title, open, onOpen, hidden, onHide, onUp, onDown, movable, onRemove, extra, p }: { lead: React.ReactNode; title: React.ReactNode; open: boolean; onOpen: () => void; hidden?: boolean; onHide?: () => void; onUp?: () => void; onDown?: () => void; /** in a list of more than one: the moves keep their places, so the first and last rows' buttons line up with the rest */ movable?: boolean; onRemove: () => void; extra?: React.ReactNode; p: Palette }) {
  const lang = useLang();
  const slot = <span aria-hidden style={{ width: 28, height: 28, flex: "0 0 auto" }} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 36, borderRadius: 10, background: open ? p.surfaceContainerHigh : "transparent", padding: "0 2px 0 4px" }}>
      <button onClick={onOpen} aria-expanded={open} aria-label={t("lkEdit", lang)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: 0, border: "none", background: "transparent", color: hidden ? p.outline : p.onSurface, cursor: "pointer", fontSize: 12, textAlign: "left" }}>
        {lead}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </button>
      {extra}
      {onHide && <IconBtn icon={hidden ? "visibility_off" : "visibility"} size={28} p={p} title={t(hidden ? "lkShow" : "lkHide", lang)} onClick={onHide} />}
      {onUp ? <IconBtn icon="arrow_upward" size={28} p={p} title={t("lkMoveUp", lang)} onClick={onUp} /> : movable && slot}
      {onDown ? <IconBtn icon="arrow_downward" size={28} p={p} title={t("lkMoveDown", lang)} onClick={onDown} /> : movable && slot}
      <IconBtn icon="close" size={28} p={p} title={t("lkRemove", lang)} onClick={onRemove} />
    </div>
  );
}

const swap = <T,>(list: T[], i: number, j: number) => {
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

/** a material layer in its row: the material's name, or that the library has none of that id */
function MaterialTitle({ layer }: { layer: MaterialLayer }) {
  const lang = useLang();
  const m = useMaterials().materials.find((d) => d.id === layer.material);
  return <>{`${t("lkMaterial", lang)} · ${m ? m.name : t("mtMissing", lang)}`}</>;
}

function FillList({ fills, onChange, p }: { fills: PaintLayer[]; onChange: (f: PaintLayer[]) => void; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {fills.map((layer, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ListRow
            lead={<PaintSwatch layer={layer} p={p} />}
            title={layer.type === "material" ? <MaterialTitle layer={layer} /> : t(TYPE_KEY[layer.type], lang)}
            open={open === i}
            onOpen={() => setOpen(open === i ? null : i)}
            hidden={layer.hidden}
            onHide={() => onChange(fills.map((l, j) => (j === i ? { ...l, hidden: !l.hidden || undefined } : l)))}
            onUp={i > 0 ? () => (onChange(swap(fills, i, i - 1)), setOpen(i - 1)) : undefined}
            onDown={i < fills.length - 1 ? () => (onChange(swap(fills, i, i + 1)), setOpen(i + 1)) : undefined}
            movable={fills.length > 1}
            onRemove={() => (onChange(fills.filter((_, j) => j !== i)), setOpen(null))}
            p={p}
          />
          {open === i && (
            <div style={{ padding: "0 2px 6px" }}>
              <PaintEditor layer={layer} onChange={(l) => onChange(fills.map((x, j) => (j === i ? l : x)))} p={p} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- shadows ---------- */

/** A shadow in a row of the list: each number with its name, the offset on one line and the softness under it. A spread
 *  is only written when there is one, so the row stays short; the whole of it is in the tooltip. */
function ShadowSummary({ s, words, p }: { s: LookShadow; words: boolean; p: Palette }) {
  const lang = useLang();
  const line: React.CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const blur = `${t("lkShadowBlur", lang)} ${s.blur}`;
  const spread = words ? "" : `${t("lkShadowSpread", lang)} ${s.spread}`;
  return (
    <span data-shadow-summary title={[`X ${s.x}`, `Y ${s.y}`, blur, spread].filter(Boolean).join(" · ")} style={{ display: "flex", flexDirection: "column", fontSize: 11, lineHeight: "14px", minWidth: 0 }}>
      <span style={line}>
        X {s.x} · Y {s.y}
      </span>
      <span style={{ ...line, color: p.onSurfaceVariant }}>{[blur, !words && s.spread ? spread : ""].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

/** A list of shadows, the box's or the words'. On words a shadow has no spread and is never inside. */
function ShadowList({ shadows, onChange, words = false, p }: { shadows: LookShadow[]; onChange: (s: LookShadow[]) => void; words?: boolean; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(null);
  const put = (i: number, patch: Partial<LookShadow>) => onChange(shadows.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const field = (i: number, k: "x" | "y" | "blur" | "spread", key: UIKey, lo: number, hi: number) => (
    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", minWidth: 0 }}>
      <span style={{ fontSize: 11, color: p.onSurfaceVariant }}>{t(key, lang)}</span>
      <Num value={shadows[i][k]} min={lo} max={hi} title={t(key, lang)} onChange={(v) => put(i, { [k]: v })} p={p} />
    </label>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {shadows.map((s, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ListRow
            lead={<Swatch color={s.color} p={p} />}
            title={<ShadowSummary s={s} words={words} p={p} />}
            open={open === i}
            onOpen={() => setOpen(open === i ? null : i)}
            hidden={s.hidden}
            onHide={() => put(i, { hidden: !s.hidden || undefined })}
            onUp={i > 0 ? () => (onChange(swap(shadows, i, i - 1)), setOpen(i - 1)) : undefined}
            onDown={i < shadows.length - 1 ? () => (onChange(swap(shadows, i, i + 1)), setOpen(i + 1)) : undefined}
            movable={shadows.length > 1}
            onRemove={() => (onChange(shadows.filter((_, j) => j !== i)), setOpen(null))}
            extra={
              !words && (
                <button onClick={() => put(i, { inset: !s.inset || undefined })} aria-pressed={!!s.inset} title={t("lkInset", lang)} style={{ ...smallBtn(p, !!s.inset), height: 24, padding: "0 8px", fontSize: 11 }}>
                  {t("lkInsetShort", lang)}
                </button>
              )
            }
            p={p}
          />
          {open === i && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 2px 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${words ? 3 : 4}, minmax(0, 1fr))`, gap: 6 }}>
                {field(i, "x", "lkShadowX", LIMITS.shadowOffset[0], LIMITS.shadowOffset[1])}
                {field(i, "y", "lkShadowY", LIMITS.shadowOffset[0], LIMITS.shadowOffset[1])}
                {field(i, "blur", "lkShadowBlur", LIMITS.shadowBlur[0], LIMITS.shadowBlur[1])}
                {!words && field(i, "spread", "lkShadowSpread", LIMITS.shadowSpread[0], LIMITS.shadowSpread[1])}
              </div>
              <ColorPick value={s.color} onChange={(c) => c && put(i, { color: c })} label={t("lkShadows", lang)} p={p} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const NEW_SHADOW: LookShadow = { x: 0, y: 4, blur: 12, spread: 0, color: "#00000033" };
const NEW_TEXT_SHADOW: LookShadow = { x: 0, y: 2, blur: 4, spread: 0, color: "#00000059" };

/* ---------- copying a look ---------- */

type Worn = Pick<Item, "fill" | "textColor" | "corners" | "look">;
const CLIP_KEY = "m3e:look:clipboard";
let clipboard: Worn | null = null;

function readClipboard(): Worn | null {
  if (clipboard) return clipboard;
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLIP_KEY) ?? "null");
    return v && typeof v === "object" ? (v as Worn) : null;
  } catch {
    return null;
  }
}

/* ---------- presets ---------- */

/** a preset drawn small: its paint, lines and shadows on a chip, and its words on "Aa" */
function PresetTile({ look, title, onPick, p }: { look: ItemLook; title: string; onPick: () => void; p: Palette }) {
  const box = lookStyle(look);
  const gradient = lookGradientTextStyle(look);
  return (
    <button onClick={onPick} title={title} aria-label={title} data-look-preset style={{ flex: "0 0 auto", width: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 0 2px", border: "none", background: "transparent", cursor: "pointer", color: p.onSurfaceVariant }}>
      <Scope>
        <span
          aria-hidden
          style={{
            width: 52,
            height: 34,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "var(--md-sys-color-surface-container-high)",
            color: "var(--md-sys-color-on-surface)",
            fontWeight: 700,
            ...(box as React.CSSProperties),
            /* the chip is a picture of the look, not the part: its size stays the chip's */
            fontSize: 15,
            rotate: undefined,
            scale: undefined,
          }}
        >
          {gradient ? <span style={gradient as React.CSSProperties}>Aa</span> : "Aa"}
        </span>
      </Scope>
      <span style={{ fontSize: 10, lineHeight: 1.2, maxWidth: 62, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
    </button>
  );
}

/* ---------- textures ---------- */

function TexturePick({ value, onChange, p }: { value?: LookTexture; onChange: (t: LookTexture | undefined) => void; p: Palette }) {
  const lang = useLang();
  const tile = (kind: TextureKind | "", title: string) => {
    const on = (value?.kind ?? "") === kind;
    const style = kind ? lookStyle({ texture: { kind, color: value?.color ?? "on-surface", opacity: Math.max(35, value?.opacity ?? 0), size: kind === "noise" || kind === "paper" ? undefined : Math.min(TEXTURE_SIZE[kind], 14) } }) : {};
    return (
      <button
        key={kind || "none"}
        title={title}
        aria-label={title}
        aria-pressed={on}
        onClick={() => onChange(kind ? { ...value, kind } : undefined)}
        style={{ width: "100%", aspectRatio: "1", padding: 0, borderRadius: 8, border: "none", cursor: "pointer", backgroundColor: "var(--md-sys-color-surface-container-high)", ...(style as React.CSSProperties), boxShadow: on ? `0 0 0 2px ${p.surfaceContainerLow}, 0 0 0 4px ${p.primary}` : `inset 0 0 0 1px ${p.outlineVariant}`, display: "grid", placeItems: "center", color: p.onSurfaceVariant }}
      >
        {!kind && <Icon name="block" size={16} />}
      </button>
    );
  };
  return (
    <Scope>
      <div role="group" aria-label={t("lkTexture", lang)} style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 }}>
        {tile("", t("lkTextureNone", lang))}
        {TEXTURE_KINDS.map((k) => tile(k, t(`lkTexture_${k}` as UIKey, lang)))}
      </div>
    </Scope>
  );
}

const blendKey = (b: BlendMode) => `lkBlend_${b.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}` as UIKey;

function BlendSelect({ value, onChange, label, p }: { value?: BlendMode; onChange: (b: BlendMode | undefined) => void; label: string; p: Palette }) {
  const lang = useLang();
  return <Select label={label} p={p} value={value ?? "normal"} options={BLEND_MODES.map((b) => ({ key: b, label: `${b === "normal" ? `${label}: ` : ""}${t(blendKey(b), lang)}` }))} onChange={(k) => onChange(k === "normal" ? undefined : (k as BlendMode))} />;
}

/* ---------- the panel ---------- */

/** what has nothing in it is left out, so an emptied group leaves no trace in the document */
function pruned<T extends object>(v: T): T | undefined {
  const out = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false)) as T;
  return Object.keys(out).length ? out : undefined;
}

/** the groups of effects the panel is made of, by the names a caller picks them by */
export type LookBlockKey = "presets" | "fill" | "stroke" | "shadows" | "blur" | "blend" | "filters" | "turn" | "distort" | "text" | "texture";
/** one group of effects: what its header says and offers, and what it holds */
export type LookBlock = { key: LookBlockKey; icon: string; title: string; on: boolean; actions?: React.ReactNode; body: React.ReactNode };

/** The effects of a part. Whole, a strip of looks and a folded group for each kind of effect. With `only`, just those
 *  groups; with `wrap`, each of them handed to the caller to frame (the design panel gives each its own section). */
export function LookPanel({ item, onChange, p, strict = false, only, wrap }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette; strict?: boolean; only?: LookBlockKey[]; wrap?: (block: LookBlock) => React.ReactNode }) {
  const lang = useLang();
  const look: ItemLook = item.look ?? {};
  const set = (patch: Partial<ItemLook>) => onChange({ look: tidyLook({ ...look, ...patch }) });
  const [clip, setClip] = useState(() => !!readClipboard());

  /* what the first look said is shown here as the effects it amounts to, and written as them once it is changed */
  const fills = look.fills ?? (legacyGradient(look) ? [legacyGradient(look)!] : []);
  const setFills = (next: PaintLayer[]) => set({ fills: next.length ? next : undefined, gradientTo: undefined, gradientAngle: undefined });
  const stroke: LookStroke | undefined = look.stroke ?? (look.borderWidth ? { width: look.borderWidth, color: tokenRole(look.borderColor ?? "onSurfaceVariant") } : undefined);
  const setStroke = (s: LookStroke | undefined) => set({ stroke: s, borderWidth: undefined, borderColor: undefined });
  const shadows = look.shadows ?? legacyShadows(look.shadow);
  const setShadows = (s: LookShadow[] | undefined) => set({ shadows: s, shadow: undefined });
  const text: LookText = look.text ?? {};
  const setText = (patch: Partial<LookText>) => set({ text: pruned({ ...text, ...patch }) });
  const tr = look.transform ?? {};
  const setTr = (patch: Partial<NonNullable<ItemLook["transform"]>>) => set({ transform: pruned({ ...tr, ...patch }) });
  const f = look.filter ?? {};
  const setF = (patch: Partial<NonNullable<ItemLook["filter"]>>) => set({ filter: pruned({ ...f, ...patch }) });

  const copy = () => {
    const worn: Worn = JSON.parse(JSON.stringify({ fill: item.fill, textColor: item.textColor, corners: item.corners, look: item.look }));
    clipboard = worn;
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(worn));
    } catch {}
    setClip(true);
  };
  const paste = () => {
    const worn = readClipboard();
    if (!worn) return;
    /* held to a style, a look copied in free mode brings only what the rules leave open: corners stay the style's */
    if (strict) onChange({ fill: worn.fill, textColor: worn.textColor, look: strictLook(worn.look) });
    else onChange({ fill: worn.fill, textColor: worn.textColor, corners: worn.corners, look: tidyLook(worn.look) });
  };

  const elevation = (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, color: p.onSurfaceVariant }}>{t("lkElevation", lang)}</span>
        <span style={{ fontSize: 11, color: p.outline, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("lkElevationHint", lang)}</span>
      </div>
      <Segmented<string>
        options={[{ key: "", label: "–", title: t("lkFromStyle", lang), style: RUN_CELL }, ...ELEVATION_LEVELS.map((n) => ({ key: String(n), label: String(n), style: RUN_CELL }))]}
        value={look.elevation === undefined ? "" : String(look.elevation)}
        onChange={(k) => set({ elevation: k === "" ? undefined : (Number(k) as ItemLook["elevation"]) })}
        p={p}
        height={32}
        tight
        label={t("lkElevation", lang)}
      />
    </div>
  );
  const opacity = <Range label={t("lookOpacity", lang)} value={look.opacity ?? 100} min={0} max={100} onChange={(v) => set({ opacity: v === 100 ? undefined : v })} p={p} />;
  const layerBlur = <Range label={t("lkLayerBlur", lang)} value={look.blur ?? 0} min={0} max={40} onChange={(v) => set({ blur: v || undefined })} p={p} />;
  const blend = <BlendSelect value={look.blend} onChange={(b) => set({ blend: b })} label={t("lkBlendMode", lang)} p={p} />;
  const turn = (
    <>
      <Range label={t("lookRotate", lang)} value={look.rotate ?? 0} min={-180} max={180} onChange={(v) => set({ rotate: v || undefined })} p={p} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setTr({ flipX: !tr.flipX || undefined })} aria-pressed={!!tr.flipX} style={{ ...smallBtn(p, !!tr.flipX), flex: 1 }}>
          <Icon name="swap_horiz" size={18} />
          {t("lkFlipX", lang)}
        </button>
        <button onClick={() => setTr({ flipY: !tr.flipY || undefined })} aria-pressed={!!tr.flipY} style={{ ...smallBtn(p, !!tr.flipY), flex: 1 }}>
          <Icon name="swap_vert" size={18} />
          {t("lkFlipY", lang)}
        </button>
      </div>
    </>
  );
  const distort = (
    <>
      <Range label={t("lkScaleX", lang)} value={tr.scaleX ?? 100} min={10} max={300} onChange={(v) => setTr({ scaleX: v === 100 ? undefined : v })} p={p} />
      <Range label={t("lkScaleY", lang)} value={tr.scaleY ?? 100} min={10} max={300} onChange={(v) => setTr({ scaleY: v === 100 ? undefined : v })} p={p} />
      <Range label={t("lkSkewX", lang)} value={tr.skewX ?? 0} min={-45} max={45} onChange={(v) => setTr({ skewX: v || undefined })} p={p} />
      <Range label={t("lkSkewY", lang)} value={tr.skewY ?? 0} min={-45} max={45} onChange={(v) => setTr({ skewY: v || undefined })} p={p} />
    </>
  );
  const transform = (
    <>
      {turn}
      {distort}
    </>
  );
  const transformOn = !!look.rotate || !!look.transform;

  const toolbar = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button data-look-copy onClick={copy} style={{ ...smallBtn(p), flex: 1 }}>
        <Icon name="content_copy" size={16} />
        {t("lkCopy", lang)}
      </button>
      <button data-look-paste onClick={paste} disabled={!clip} style={{ ...smallBtn(p), flex: 1, opacity: clip ? 1 : 0.5, cursor: clip ? "pointer" : "default" }}>
        <Icon name="content_paste" size={16} />
        {t("lkPaste", lang)}
      </button>
      {item.look && <IconBtn icon="restart_alt" size={32} p={p} title={t("lookReset", lang)} onClick={() => onChange({ look: undefined })} />}
    </div>
  );

  const textOn = !!look.text || !!look.font;
  const filterOn = !!look.filter;
  const presetsBody = (
    <>
      <div>
        <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px 2px" }}>{t("lkPresets", lang)}</div>
        <div className="no-scrollbar" style={{ display: "flex", gap: 2, overflowX: "auto", padding: "4px 2px 6px", margin: "0 -4px", scrollSnapType: "x proximity" }}>
          {LOOK_PRESETS.map((preset) => (
            <PresetTile key={preset.key} look={preset.look} title={t(`lkPreset_${preset.key}` as UIKey, lang)} onPick={() => onChange({ look: withPreset(item.look, preset.look) })} p={p} />
          ))}
        </div>
      </div>
      {toolbar}
    </>
  );
  const turnOn = !!look.rotate || !!tr.flipX || !!tr.flipY;
  const distortOn = tr.scaleX !== undefined || tr.scaleY !== undefined || tr.skewX !== undefined || tr.skewY !== undefined;
  const blocks: LookBlock[] = strict
    ? [
        {
          key: "presets",
          icon: "auto_awesome",
          title: t("lkPresets", lang),
          on: false,
          body: (
            <>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("lkStrictHint", lang)}</div>
              {toolbar}
            </>
          ),
        },
        { key: "shadows", icon: "shadow", title: t("lkShadows", lang), on: look.elevation !== undefined, body: elevation },
        { key: "blur", icon: "blur_on", title: t("lkBlurGlass", lang), on: !!look.blur, body: layerBlur },
        {
          key: "blend",
          icon: "opacity",
          title: t("lkBlendOpacity", lang),
          on: look.opacity !== undefined || !!look.blend,
          body: (
            <>
              {opacity}
              {blend}
            </>
          ),
        },
        { key: "turn", icon: "rotate_right", title: t("lkTransform", lang), on: turnOn, body: turn },
        { key: "distort", icon: "transform", title: t("lkTransform", lang), on: distortOn, body: distort },
      ]
    : [
        { key: "presets", icon: "auto_awesome", title: t("lkPresets", lang), on: false, body: presetsBody },
        {
          key: "fill",
          icon: "format_color_fill",
          title: t("lkFill", lang),
          on: fills.length > 0 || !!look.clearFill,
          actions: fills.length < MAX_FILLS && <IconBtn icon="add" size={32} p={p} title={t("lkAddFill", lang)} onClick={() => setFills([{ type: "linear", angle: 180, stops: [{ color: "primary", at: 0 }, { color: "tertiary", at: 100 }] }, ...fills])} />,
          body: (
            <>
        <FillList fills={fills} onChange={setFills} p={p} />
        <Toggle on={!!look.clearFill} onChange={(on) => set({ clearFill: on || undefined })} label={t("lkClearFill", lang)} p={p} grow />
            </>
          ),
        },
        {
          key: "stroke",
          icon: "border_style",
          title: t("lkStroke", lang),
          on: !!stroke,
          actions: stroke ? <IconBtn icon="close" size={32} p={p} title={t("lkRemove", lang)} onClick={() => setStroke(undefined)} /> : <IconBtn icon="add" size={32} p={p} title={t("lkStroke", lang)} onClick={() => setStroke({ width: 2, color: "outline" })} />,
          body: (
            <>
        {stroke && (
          <>
            <Range label={t("lkWidth", lang)} value={stroke.width} min={0} max={16} onChange={(width) => setStroke({ ...stroke, width })} p={p} />
            <ColorPick value={stroke.color} onChange={(c) => c && setStroke({ ...stroke, color: c })} label={t("lkStroke", lang)} p={p} />
            <Segmented<string>
              options={[
                { key: "solid", label: t("lkLineSolid", lang), style: RUN_CELL },
                { key: "dashed", label: t("lkLineDashed", lang), style: RUN_CELL },
                { key: "dotted", label: t("lkLineDotted", lang), style: RUN_CELL },
              ]}
              value={stroke.style ?? "solid"}
              onChange={(k) => setStroke({ ...stroke, style: k === "solid" ? undefined : (k as LookStroke["style"]), ...(k !== "solid" ? { sides: undefined } : {}) })}
              p={p}
              height={32}
              tight
              label={t("lkStroke", lang)}
            />
            <Segmented<string>
              options={[
                { key: "inside", label: t("lkInside", lang), style: RUN_CELL },
                { key: "center", label: t("lkCenter", lang), style: RUN_CELL },
                { key: "outside", label: t("lkOutside", lang), style: RUN_CELL },
              ]}
              value={stroke.position ?? "inside"}
              onChange={(k) => setStroke({ ...stroke, position: k === "inside" ? undefined : (k as LookStroke["position"]) })}
              p={p}
              height={32}
              tight
              label={t("lkStroke", lang)}
            />
            {(stroke.style ?? "solid") === "solid" && (
              <Toggle on={!!stroke.sides} onChange={(on) => setStroke({ ...stroke, sides: on ? { t: stroke.width, r: stroke.width, b: stroke.width, l: stroke.width } : undefined })} label={t("lkEachSide", lang)} p={p} grow />
            )}
            {stroke.sides && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                {(["t", "r", "b", "l"] as const).map((k) => (
                  <label key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 11, color: p.onSurfaceVariant }}>{t(`lkSide${k.toUpperCase()}` as UIKey, lang)}</span>
                    <Num value={stroke.sides![k]} min={0} max={LIMITS.strokeWidth[1]} title={t(`lkSide${k.toUpperCase()}` as UIKey, lang)} onChange={(v) => setStroke({ ...stroke, sides: { ...stroke.sides!, [k]: v } })} p={p} />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
            </>
          ),
        },
        {
          key: "shadows",
          icon: "shadow",
          title: t("lkShadows", lang),
          on: !!shadows || look.elevation !== undefined,
          actions: (shadows?.length ?? 0) < MAX_SHADOWS && <IconBtn icon="add" size={32} p={p} title={t("lkAddShadow", lang)} onClick={() => setShadows([...(shadows ?? []), NEW_SHADOW])} />,
          body: (
            <>
        {elevation}
        {shadows ? (
          <>
            <ShadowList shadows={shadows} onChange={setShadows} p={p} />
            {shadows.length === 0 && <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("lkNoShadow", lang)}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              {shadows.length > 0 && (
                <button onClick={() => setShadows([])} style={{ ...smallBtn(p), flex: 1 }}>
                  {t("lkNoShadow", lang)}
                </button>
              )}
              <button onClick={() => setShadows(undefined)} style={{ ...smallBtn(p), flex: 1 }}>
                {t("lkFromStyle", lang)}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: p.onSurfaceVariant, flex: 1, padding: "0 4px" }}>{t("lkFromStyle", lang)}</span>
            <button onClick={() => setShadows([])} style={smallBtn(p)}>
              {t("lkNoShadow", lang)}
            </button>
          </div>
        )}
            </>
          ),
        },
        {
          key: "blur",
          icon: "blur_on",
          title: t("lkBlurGlass", lang),
          on: !!look.blur || !!look.glass,
          body: (
            <>
        {layerBlur}
        <Range label={t("lkBackdropBlur", lang)} value={look.glass ?? 0} min={0} max={60} onChange={(v) => set({ glass: v || undefined, ...(v ? {} : { glassSaturate: undefined }) })} p={p} />
        {!!look.glass && <Range label={t("lkBackdropSaturate", lang)} value={look.glassSaturate ?? 150} min={0} max={300} onChange={(v) => set({ glassSaturate: v === 150 ? undefined : v })} p={p} />}
            </>
          ),
        },
        {
          key: "blend",
          icon: "opacity",
          title: t("lkBlendOpacity", lang),
          on: look.opacity !== undefined || !!look.blend || !!look.clip,
          body: (
            <>
        {opacity}
        {blend}
        <Toggle on={!!look.clip} onChange={(clip) => set({ clip: clip || undefined })} label={t("lkClip", lang)} p={p} grow />
            </>
          ),
        },
        {
          key: "filters",
          icon: "photo_filter",
          title: t("lkFilters", lang),
          on: filterOn,
          actions: filterOn && <IconBtn icon="restart_alt" size={32} p={p} title={t("lkResetSection", lang)} onClick={() => set({ filter: undefined })} />,
          body: (
            <>
        <Range label={t("lkBrightness", lang)} value={f.brightness ?? 100} min={0} max={200} onChange={(v) => setF({ brightness: v === 100 ? undefined : v })} p={p} />
        <Range label={t("lkContrast", lang)} value={f.contrast ?? 100} min={0} max={200} onChange={(v) => setF({ contrast: v === 100 ? undefined : v })} p={p} />
        <Range label={t("lkSaturate", lang)} value={f.saturate ?? 100} min={0} max={300} onChange={(v) => setF({ saturate: v === 100 ? undefined : v })} p={p} />
        <Range label={t("lkHueRotate", lang)} value={f.hueRotate ?? 0} min={-180} max={180} onChange={(v) => setF({ hueRotate: v || undefined })} p={p} />
        <Range label={t("lkGrayscale", lang)} value={f.grayscale ?? 0} min={0} max={100} onChange={(v) => setF({ grayscale: v || undefined })} p={p} />
        <Range label={t("lkSepia", lang)} value={f.sepia ?? 0} min={0} max={100} onChange={(v) => setF({ sepia: v || undefined })} p={p} />
        <Range label={t("lkInvert", lang)} value={f.invert ?? 0} min={0} max={100} onChange={(v) => setF({ invert: v || undefined })} p={p} />
            </>
          ),
        },
        {
          key: "text",
          icon: "text_fields",
          title: t("lkText", lang),
          on: textOn,
          actions: textOn && <IconBtn icon="restart_alt" size={32} p={p} title={t("lkResetSection", lang)} onClick={() => set({ text: undefined, font: undefined })} />,
          body: (
            <>
        {!text.gradient && <ColorPick value={text.color} onChange={(color) => setText({ color })} label={t("lkTextColor", lang)} p={p} clearable />}
        <Select
          label={t("lookFont", lang)}
          p={p}
          value={look.font ?? ""}
          options={[
            { key: "", label: `${t("lookFont", lang)}: ${t("lookFontOwn", lang)}` },
            { key: "display", label: t("lookFontDisplay", lang) },
            { key: "mono", label: t("lookFontMono", lang) },
          ]}
          onChange={(k) => set({ font: (k || undefined) as ItemLook["font"] })}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          <OptNum label={t("lkTextSize", lang)} value={text.size} min={LIMITS.textSize[0]} max={LIMITS.textSize[1]} onChange={(size) => setText({ size })} p={p} width={56} />
          <OptNum label={t("lkTextWeight", lang)} value={text.weight} min={100} max={900} onChange={(w) => setText({ weight: w === undefined ? undefined : Math.round(w / 100) * 100 })} p={p} width={56} />
          <OptNum label={t("lkLetterSpacing", lang)} value={text.letterSpacing} min={LIMITS.letterSpacing[0]} max={LIMITS.letterSpacing[1]} onChange={(letterSpacing) => setText({ letterSpacing })} p={p} width={56} />
          <OptNum label={t("lkLineHeight", lang)} value={text.lineHeight} min={LIMITS.lineHeight[0]} max={LIMITS.lineHeight[1]} onChange={(lineHeight) => setText({ lineHeight })} p={p} width={56} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Segmented<string>
              options={[
                { key: "", label: "–", title: t("lkCaseAsIs", lang), style: RUN_CELL },
                { key: "upper", label: "AB", title: t("lkCaseUpper", lang), style: RUN_CELL },
                { key: "lower", label: "ab", title: t("lkCaseLower", lang), style: RUN_CELL },
                { key: "title", label: "Ab", title: t("lkCaseTitle", lang), style: RUN_CELL },
              ]}
              value={text.case ?? ""}
              onChange={(k) => setText({ case: (k || undefined) as LookText["case"] })}
              p={p}
              height={32}
              tight
              label={t("lkText", lang)}
            />
          </div>
          <IconBtn icon="format_italic" size={32} p={p} on={!!text.italic} title={t("lkItalic", lang)} onClick={() => setText({ italic: !text.italic || undefined })} />
          <IconBtn icon="format_underlined" size={32} p={p} on={text.decoration === "underline"} title={t("lkUnderline", lang)} onClick={() => setText({ decoration: text.decoration === "underline" ? undefined : "underline" })} />
          <IconBtn icon="format_strikethrough" size={32} p={p} on={text.decoration === "line-through"} title={t("lkStrike", lang)} onClick={() => setText({ decoration: text.decoration === "line-through" ? undefined : "line-through" })} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: p.onSurfaceVariant, flex: 1 }}>{t("lkTextShadows", lang)}</span>
          <IconBtn icon="add" size={28} p={p} title={t("lkAddShadow", lang)} onClick={() => setText({ shadows: [...(text.shadows ?? []), NEW_TEXT_SHADOW].slice(0, MAX_SHADOWS) })} />
        </div>
        {!!text.shadows?.length && <ShadowList shadows={text.shadows} onChange={(s) => setText({ shadows: s.length ? s : undefined })} words p={p} />}
        <Toggle on={!!text.stroke} onChange={(on) => setText({ stroke: on ? { width: 2, color: "#000000" } : undefined })} label={t("lkTextStroke", lang)} p={p} grow />
        {text.stroke && (
          <>
            <Range label={t("lkWidth", lang)} value={text.stroke.width} min={0} max={LIMITS.textStroke[1]} onChange={(width) => setText({ stroke: { ...text.stroke!, width } })} p={p} />
            <ColorPick value={text.stroke.color} onChange={(c) => c && setText({ stroke: { ...text.stroke!, color: c } })} label={t("lkTextStroke", lang)} p={p} />
          </>
        )}
        <Toggle on={!!text.gradient} onChange={(on) => setText({ gradient: on ? { type: "linear", angle: 180, stops: [{ color: "primary", at: 0 }, { color: "tertiary", at: 100 }] } : undefined })} label={t("lkTextGradient", lang)} p={p} grow />
        {text.gradient && <PaintEditor layer={text.gradient} onChange={(gradient) => setText({ gradient: gradient as ColorPaint })} p={p} types={["linear", "radial", "conic"]} />}
            </>
          ),
        },
        {
          key: "texture",
          icon: "texture",
          title: t("lkTexture", lang),
          on: !!look.texture,
          body: (
            <>
        <TexturePick value={look.texture} onChange={(texture) => set({ texture })} p={p} />
        {look.texture && (
          <>
            <ColorPick value={look.texture.color ?? "#000000"} onChange={(color) => set({ texture: { ...look.texture!, color } })} label={t("lkTextureColor", lang)} p={p} />
            <Range label={t("lookOpacity", lang)} value={look.texture.opacity ?? TEXTURE_OPACITY} min={0} max={100} onChange={(opacity) => set({ texture: { ...look.texture!, opacity } })} p={p} />
            <Range label={t("lkTextureSize", lang)} value={look.texture.size ?? TEXTURE_SIZE[look.texture.kind]} min={2} max={look.texture.kind === "noise" || look.texture.kind === "paper" ? 400 : 64} onChange={(size) => set({ texture: { ...look.texture!, size } })} p={p} />
            <BlendSelect value={look.texture.blend} onChange={(b) => set({ texture: { ...look.texture!, blend: b } })} label={t("lkTextureBlend", lang)} p={p} />
          </>
        )}
            </>
          ),
        },
        { key: "turn", icon: "rotate_right", title: t("lkTransform", lang), on: turnOn, body: turn },
        { key: "distort", icon: "transform", title: t("lkTransform", lang), on: distortOn, body: distort },
      ];
  if (only || wrap) {
    const picked = only ? only.map((k) => blocks.find((b) => b.key === k)).filter((b): b is LookBlock => !!b) : blocks;
    if (wrap) return <>{picked.map((b) => <Fragment key={b.key}>{wrap(b)}</Fragment>)}</>;
    return (
      <div data-look-panel={strict ? "strict" : ""} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {picked.map((b) => (
          <Sub key={b.key} id={b.key} icon={b.icon} title={b.title} on={b.on} actions={b.actions} p={p}>
            {b.body}
          </Sub>
        ))}
      </div>
    );
  }
  /* the whole panel, as the phone's sheet shows it: the looks, then each kind of effect folded */
  const sub = (k: LookBlockKey) => {
    const b = blocks.find((x) => x.key === k);
    return b ? (
      <Sub key={b.key} id={b.key} icon={b.icon} title={b.title} on={b.on} actions={b.actions} p={p}>
        {b.body}
      </Sub>
    ) : null;
  };
  if (strict) {
    return (
      <div data-look-panel="strict" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("lkStrictHint", lang)}</div>
        {elevation}
        {opacity}
        {layerBlur}
        {blend}
        <Sub id="transform" icon="transform" title={t("lkTransform", lang)} on={transformOn} p={p}>
          {transform}
        </Sub>
        {toolbar}
      </div>
    );
  }
  return (
    <div data-look-panel style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {presetsBody}
      {sub("fill")}
      {sub("stroke")}
      {sub("shadows")}
      {sub("blur")}
      {sub("blend")}
      {sub("filters")}
      <Sub id="transform" icon="transform" title={t("lkTransform", lang)} on={transformOn} p={p}>
        {transform}
      </Sub>
      {sub("text")}
      {sub("texture")}
    </div>
  );
}
