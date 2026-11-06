import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { readNumber } from "@/lib/expr";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";

/* A number the way a design tool's panel takes one: drag its label left and right to scrub it (Shift for ten at a
 * time), the arrow keys step it (Shift for ten), and what is typed may be a little arithmetic (`12*2`, `+8`). Several
 * parts with different values show "Mixed"; whatever is set then goes to all of them. A field that cannot be set
 * (a measure a layout decides) still shows the number, dimmed. */

export type NumberFieldProps = {
  value: number | "mixed" | undefined;
  onChange: (v: number) => void;
  /** the field's name, for its tooltip and for screen readers */
  title: string;
  /** what stands in front of the number and is dragged to scrub it: a symbol or a short word */
  icon?: string;
  word?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** keeps decimals (an opacity of 0.5): otherwise a whole number */
  decimals?: number;
  disabled?: boolean;
  /** shown when there is no value */
  placeholder?: string;
  /** the scrub or a typed value has been let go: for what joins a whole gesture into one change */
  onDone?: () => void;
  width?: number | string;
  p: Palette;
  /** extra attribute that names the field for tests and tools */
  name?: string;
};

const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function NumberField({ value, onChange, title, icon, word, unit, min = -99999, max = 99999, step = 1, decimals = 0, disabled = false, placeholder, onDone, width, p, name }: NumberFieldProps) {
  const lang = useLang();
  const mixed = value === "mixed";
  const num = typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const fmt = (v: number | undefined) => (v === undefined ? "" : decimals ? String(Math.round(v * 10 ** decimals) / 10 ** decimals) : String(Math.round(v)));
  const [text, setText] = useState(fmt(num));
  const [editing, setEditing] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setText(fmt(num));
    // the shown text follows the value whenever it is not being typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num, editing]);
  const round = (v: number) => (decimals ? Math.round(v * 10 ** decimals) / 10 ** decimals : Math.round(v));
  const set = (v: number) => {
    const next = clampTo(round(v), min, max);
    if (next !== num) onChange(next);
    return next;
  };
  const commit = () => {
    setEditing(false);
    const v = readNumber(text, num);
    if (v !== null) set(v);
    else setText(fmt(num));
    onDone?.();
  };

  /* the label is a handle: a press and a drag sideways scrubs, one step a pixel, ten with Shift */
  const scrub = useRef<{ x: number; from: number; last: number; moved: boolean } | null>(null);
  const onScrubDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = { x: e.clientX, from: num ?? 0, last: num ?? 0, moved: false };
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved && Math.abs(dx) < 2) return;
    if (!s.moved) {
      s.moved = true;
      setScrubbing(true);
    }
    const v = s.from + Math.round(dx) * step * (e.shiftKey ? 10 : 1);
    s.last = set(v);
  };
  const onScrubUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    scrub.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setScrubbing(false);
    if (s?.moved) onDone?.();
    /* a press without a drag puts the caret in the field, as a press on a label does */ else inputRef.current?.focus();
  };

  return (
    <div
      data-number-field={name ?? title}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        width: width ?? "100%",
        minWidth: 0,
        boxSizing: "border-box",
        borderRadius: 6,
        background: p.surfaceContainerHigh,
        color: p.onSurfaceVariant,
        outline: editing || scrubbing ? `1.5px solid ${p.primary}` : "none",
        outlineOffset: -1.5,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {(icon || word) && (
        <span
          data-scrub
          aria-hidden
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          style={{ flex: "0 0 auto", height: 28, minWidth: 24, padding: "0 2px 0 6px", display: "grid", placeItems: "center", cursor: disabled ? "default" : "ew-resize", touchAction: "none", userSelect: "none", fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant }}
        >
          {icon ? <Icon name={icon} size={15} /> : word}
        </span>
      )}
      <input
        ref={inputRef}
        aria-label={title}
        inputMode="decimal"
        disabled={disabled}
        value={editing ? text : mixed ? "" : fmt(num)}
        placeholder={mixed ? t("dzMixed", lang) : placeholder ?? (num === undefined ? "–" : undefined)}
        onFocus={(e) => {
          setEditing(true);
          setText(mixed ? "" : fmt(num));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          /* the canvas's shortcuts do not hear what is typed here */
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(fmt(num));
            setEditing(false);
            requestAnimationFrame(() => inputRef.current?.blur());
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = readNumber(text, num) ?? num ?? 0;
            const next = set(base + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            setText(fmt(next));
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          width: "100%",
          height: 26,
          padding: icon || word ? "0 6px 0 2px" : "0 6px 0 8px",
          border: "none",
          background: "transparent",
          color: p.onSurface,
          fontSize: 12,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {unit && <span style={{ flex: "0 0 auto", padding: "0 6px 0 0", fontSize: 11, color: p.outline }}>{unit}</span>}
    </div>
  );
}

/** a short icon toggle beside a field, the size of one */
export function FieldToggle({ icon, on, onClick, title, p, disabled, name }: { icon: string; on?: boolean; onClick: () => void; title: string; p: Palette; disabled?: boolean; name?: string }) {
  return (
    <button
      type="button"
      data-field-toggle={name}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={on}
      className="m3-press"
      style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: 6, border: "none", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurfaceVariant, cursor: disabled ? "default" : "pointer", display: "grid", placeItems: "center", padding: 0, opacity: disabled ? 0.5 : 1 }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
