import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
/** what the field edits: the part, its words, where it is drawn and in what type */
export type TextEditing = { itemId: string; value: string; multiline: boolean; rect: { l: number; t: number; r: number; b: number }; font: React.CSSProperties };

/** The field a part's words are edited in on the canvas: laid over the part in its own type, the words selected.
 *  Enter keeps them (Shift+Enter breaks a line of words that may run over several), Escape lets them go, and a click
 *  away keeps them. Keys go no further than the field, so the canvas's shortcuts leave it alone. */
export function TextEditor({ edit, onCommit, onCancel, z, p }: { edit: TextEditing; onCommit: (value: string) => void; onCancel: () => void; z: number; p: Palette }) {
  const lang = useLang();
  const [value, setValue] = useState(edit.value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep) onCommit(value);
    else onCancel();
  };
  const { l, t: top, r, b } = edit.rect;
  return (
    <textarea
      ref={ref}
      data-text-editor={edit.itemId}
      aria-label={t("cmEditText", lang)}
      title={t("txEditHint", lang)}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        } else if (e.key === "Enter" && !(e.shiftKey && edit.multiline)) {
          e.preventDefault();
          finish(true);
        }
      }}
      style={{
        position: "absolute",
        left: l - 2,
        top: top - 2,
        width: Math.max(40, r - l) + 4,
        minHeight: Math.max(20, b - top) + 4,
        boxSizing: "border-box",
        padding: 2,
        margin: 0,
        border: "none",
        borderRadius: 4,
        outline: `${2 / z}px solid ${p.primary}`,
        background: p.surface,
        resize: "none",
        overflow: "hidden",
        zIndex: 80,
        ...edit.font,
      }}
    />
  );
}
