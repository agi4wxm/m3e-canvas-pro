import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ApiSpec } from "@/lib/api/types";
import type { Palette } from "@/lib/tokens";
import { suggest, type ScopeShape } from "@/lib/bindings/complete";
import { exprSyntaxError } from "@/lib/bindings/check";
import { t, useLang } from "@/lib/i18n";

/* An expression typed with what it can read offered as it goes (lib/bindings/complete.ts): after `data.` the screen's
 * sources, after `data.products.items[0].` the fields of a product, after `item.` the fields of the element the row
 * is drawn for, helpers at the start of a word. Arrow keys move through the offer, Enter or Tab takes one; the
 * expression is kept when the field is left or Enter is pressed with nothing offered. What does not parse is said
 * under the field and not kept. */

export function ExprField({
  value,
  onCommit,
  shape,
  api,
  p,
  label,
  placeholder,
  name,
}: {
  value: string;
  onCommit: (v: string) => void;
  shape: ScopeShape;
  api: ApiSpec | undefined;
  p: Palette;
  label?: string;
  placeholder?: string;
  /** what tests and the layers call the field */
  name?: string;
}) {
  const lang = useLang();
  const [text, setText] = useState(value);
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  /* a value changed from elsewhere (undo, the AI) shows unless it is being typed over */
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);
  const offer = useMemo(() => (open ? suggest(api ?? {}, shape, text, caret) : { from: caret, items: [] }), [open, api, shape, text, caret]);
  const items = offer.items.slice(0, 12);
  const error = text.trim() ? exprSyntaxError(text) : null;
  const commit = (v = text) => {
    typing.current = false;
    setOpen(false);
    if (v.trim() && exprSyntaxError(v)) return;
    if (v !== value) onCommit(v.trim());
  };
  const take = (i: number) => {
    const s = items[i];
    if (!s) return;
    const next = text.slice(0, offer.from) + s.insert + text.slice(caret);
    const at = offer.from + s.insert.length;
    setText(next);
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => input.current?.setSelectionRange(at, at));
  };
  return (
    <div data-expr-field={name ?? ""} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <input
        ref={input}
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-label={label ?? t("bdExpr", lang)}
        aria-invalid={!!error || undefined}
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        placeholder={placeholder ?? t("bdExpr", lang)}
        onFocus={() => {
          setOpen(true);
          setCaret(input.current?.selectionStart ?? text.length);
        }}
        onBlur={() => commit()}
        onChange={(e) => {
          typing.current = true;
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setOpen(true);
          setActive(0);
        }}
        onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? text.length)}
        onKeyDown={(e) => {
          if (open && items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
            return;
          }
          if (open && items.length && (e.key === "Tab" || (e.key === "Enter" && items.length && text.slice(offer.from, caret) !== items[active]?.insert))) {
            e.preventDefault();
            take(active);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            input.current?.blur();
          }
          if (e.key === "Escape") {
            if (open) {
              e.stopPropagation();
              setOpen(false);
            }
          }
        }}
        style={{
          height: 32,
          minWidth: 0,
          width: "100%",
          boxSizing: "border-box",
          padding: "0 8px",
          borderRadius: 8,
          border: `1px solid ${error ? p.error : p.outlineVariant}`,
          background: p.surface,
          color: p.onSurface,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          outline: "none",
        }}
      />
      {error && (
        <div role="alert" style={{ fontSize: 11, lineHeight: 1.4, color: p.error, padding: "0 2px", wordBreak: "break-word" }}>
          {t("bdExprBad", lang).replace("{message}", error.replace(/^".*?" is no expression: /, ""))}
        </div>
      )}
      {open && items.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("bdSuggestions", lang)}
          data-expr-suggestions
          /* a press on an offer must not leave the field first */
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", top: 34, left: 0, right: 0, zIndex: 30, maxHeight: 220, overflowY: "auto", padding: 4, borderRadius: 10, background: p.surfaceContainerHigh, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}
        >
          {items.map((s, i) => (
            <div
              key={`${s.label}:${i}`}
              role="option"
              aria-selected={i === active}
              data-expr-suggestion={s.label}
              onClick={() => take(i)}
              onMouseEnter={() => setActive(i)}
              style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: i === active ? p.secondaryContainer : "transparent", color: i === active ? p.onSecondaryContainer : p.onSurface }}
            >
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ fontSize: 11, color: i === active ? p.onSecondaryContainer : p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
