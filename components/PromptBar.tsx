/* Cmd/Ctrl+K: a prompt bar over the canvas that asks the agent about what is selected, without opening the panel
 * first. What it is about is shown beside the words (the selected parts, the selected screen, or the whole document);
 * a picture pasted, dropped or picked goes with the request (a screenshot to copy). The turn then runs in the AI tab,
 * which opens to show it. */

import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";
import { AttachedPictures, usePictures } from "./AgentPictures";
import type { PickedImage } from "@/src/editor/attachImage";

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

export function PromptBar({ p, open, about, busy, onClose, onSend }: { p: Palette; open: boolean; about: string; busy: boolean; onClose: () => void; onSend: (text: string, pictures: PickedImage[]) => void }) {
  const lang = useLang();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  /* the file dialog takes the focus away: the bar stays while it is up */
  const picking = useRef(false);
  const pics = usePictures(() => {});
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  if (!open) return null;
  const has = !!text.trim() || pics.pictures.length > 0;
  const send = () => {
    if (!has || busy) return;
    onSend(text.trim(), pics.pictures);
    setText("");
    pics.clear();
  };
  return (
    <div
      data-prompt-bar
      role="dialog"
      aria-label={t("agentPromptBar", lang)}
      onDragOver={(e) => [...e.dataTransfer.items].some((it) => it.kind === "file") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void pics.fromFiles(e.dataTransfer.files);
      }}
      style={{ position: "absolute", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 70, width: "min(640px, calc(100% - 48px))" }}
    >
      {pics.pictures.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <AttachedPictures pictures={pics.pictures} onRemove={pics.remove} p={p} />
        </div>
      )}
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
          onPaste={pics.onPaste}
          onBlur={(e) => !picking.current && !text.trim() && !pics.pictures.length && !e.currentTarget.closest("[data-prompt-bar]")?.contains(e.relatedTarget as Node | null) && onClose()}
          placeholder={t("agentPlaceholder", lang)}
          aria-label={t("agentPromptBar", lang)}
          style={{ flex: 1, minWidth: 0, height: 40, border: "none", outline: "none", background: "transparent", color: p.onSurface, fontSize: 14, fontFamily: "inherit" }}
        />
        <span style={{ flex: "0 0 auto", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: p.onSecondaryContainer, background: p.secondaryContainer, borderRadius: 12, padding: "4px 10px" }}>{about}</span>
        <input
          ref={file}
          data-prompt-file
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            picking.current = false;
            const f = e.target.files?.[0];
            if (f) void pics.pick(f);
            e.target.value = "";
            input.current?.focus();
          }}
        />
        <button type="button" data-prompt-attach className="m3-press" aria-label={t("agentAttach", lang)} title={t("agentAttach", lang)} onMouseDown={(e) => e.preventDefault()} onClick={() => {
            picking.current = true;
            window.addEventListener("focus", () => setTimeout(() => (picking.current = false), 500), { once: true });
            file.current?.click();
          }} style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "transparent", color: p.onSurfaceVariant, display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto" }}>
          <Icon name="add_photo_alternate" size={20} />
        </button>
        <button type="button" className="m3-press" aria-label={t("agentSend", lang)} disabled={!has || busy} onMouseDown={(e) => e.preventDefault()} onClick={send} style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: has && !busy ? p.primary : p.surfaceContainerHighest, color: has && !busy ? p.onPrimary : p.onSurfaceVariant, display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto" }}>
          <Icon name="arrow_upward" size={20} />
        </button>
      </div>
      <div style={{ display: "table", margin: "6px auto 0", padding: "2px 10px", borderRadius: 10, background: p.surfaceContainerHigh, fontSize: 11, color: p.onSurfaceVariant }}>{t("agentPromptHint", lang)}</div>
    </div>
  );
}
