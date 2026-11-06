/* Cmd/Ctrl+K: a prompt bar over the canvas that asks the agent about what is selected, without opening the panel
 * first. What it is about is shown beside the words (the selected parts, the selected screen, or the whole document);
 * the turn then runs in the AI tab, which opens to show it. */

import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";

/** opens the bar with Cmd/Ctrl+K wherever the focus is, unless something else owns the keyboard */
export function usePromptBarKey(enabled: boolean, open: () => void) {
  const latest = useRef({ enabled, open });
  latest.current = { enabled, open };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      if (!latest.current.enabled) return;
      e.preventDefault();
      latest.current.open();
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, []);
}

export function PromptBar({ p, open, about, busy, onClose, onSend }: { p: Palette; open: boolean; about: string; busy: boolean; onClose: () => void; onSend: (text: string) => void }) {
  const lang = useLang();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  if (!open) return null;
  const send = () => {
    const words = text.trim();
    if (!words || busy) return;
    onSend(words);
    setText("");
  };
  return (
    <div data-prompt-bar role="dialog" aria-label={t("agentPromptBar", lang)} style={{ position: "absolute", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 70, width: "min(640px, calc(100% - 48px))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 16px", borderRadius: 28, background: p.surfaceContainerHigh, boxShadow: "0 8px 28px rgba(0,0,0,0.22)", border: `1px solid ${p.outlineVariant}` }}>
        <Icon name="auto_awesome" size={20} color={p.primary} />
        <input
          ref={input}
          data-prompt-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onBlur={() => !text.trim() && onClose()}
          placeholder={t("agentPlaceholder", lang)}
          aria-label={t("agentPromptBar", lang)}
          style={{ flex: 1, minWidth: 0, height: 40, border: "none", outline: "none", background: "transparent", color: p.onSurface, fontSize: 14, fontFamily: "inherit" }}
        />
        <span style={{ flex: "0 0 auto", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: p.onSecondaryContainer, background: p.secondaryContainer, borderRadius: 12, padding: "4px 10px" }}>{about}</span>
        <button type="button" className="m3-press" aria-label={t("agentSend", lang)} disabled={!text.trim() || busy} onMouseDown={(e) => e.preventDefault()} onClick={send} style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: text.trim() && !busy ? p.primary : p.surfaceContainerHighest, color: text.trim() && !busy ? p.onPrimary : p.onSurfaceVariant, display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto" }}>
          <Icon name="arrow_upward" size={20} />
        </button>
      </div>
      <div style={{ display: "table", margin: "6px auto 0", padding: "2px 10px", borderRadius: 10, background: p.surfaceContainerHigh, fontSize: 11, color: p.onSurfaceVariant }}>{t("agentPromptHint", lang)}</div>
    </div>
  );
}
