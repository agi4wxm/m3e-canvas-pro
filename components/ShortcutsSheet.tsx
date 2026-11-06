import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Palette } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { Icon } from "./Icon";
import { IconBtn } from "./ui";

/* The keyboard shortcuts, the way Figma's `?` sheet lists them: selection (in and out of boxes, siblings), editing,
 * arranging and the view. The modifier is written as the platform has it. */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";

type Row = { keys: string[]; what: UIKey; or?: string[] };
const GROUPS: { title: UIKey; rows: Row[] }[] = [
  {
    title: "kbSelection",
    rows: [
      { keys: ["kbClick"], what: "kbSelectTop" },
      { keys: [MOD, "kbClick"], what: "kbDeepSelect" },
      { keys: ["Shift", "kbClick"], what: "kbAddSelection" },
      { keys: ["kbDoubleClick"], what: "kbEnterChildren", or: ["Enter"] },
      { keys: ["Shift", "Enter"], what: "kbSelectParent", or: ["Esc"] },
      { keys: ["Tab"], what: "kbNextSibling", or: ["Shift", "Tab"] },
      { keys: [MOD, "A"], what: "kbSelectAll" },
      { keys: ["kbDrag"], what: "kbMarquee" },
      { keys: [ALT, "kbHover"], what: "kbMeasure" },
    ],
  },
  {
    title: "kbEdit",
    rows: [
      { keys: [MOD, "Z"], what: "kbUndo", or: [MOD, "Shift", "Z"] },
      { keys: [MOD, "C"], what: "kbCopyPaste", or: [MOD, "V"] },
      { keys: [MOD, "D"], what: "kbDuplicate" },
      { keys: ["Delete"], what: "kbDelete" },
      { keys: ["F2"], what: "kbRename" },
      { keys: ["kbDoubleClick"], what: "kbEditText", or: ["Enter"] },
      { keys: ["kbRightClick"], what: "kbContextMenu" },
      { keys: [MOD, "K"], what: "kbAskAi" },
    ],
  },
  {
    title: "kbArrange",
    rows: [
      { keys: [MOD, "G"], what: "kbGroup", or: [MOD, "Shift", "G"] },
      { keys: ["Shift", "A"], what: "kbAutoLayout" },
      { keys: [MOD, ALT, "T"], what: "kbTidy" },
      { keys: ["←↑→↓"], what: "kbNudge", or: ["Shift", "←↑→↓"] },
      { keys: ["]"], what: "kbLayerOrder", or: ["["] },
      { keys: ["Shift", "kbHandle"], what: "kbResizeAspect" },
      { keys: [ALT, "kbHandle"], what: "kbResizeCenter" },
      { keys: [MOD, "kbDrag"], what: "kbNoSnap" },
    ],
  },
  {
    title: "kbView",
    rows: [
      { keys: [MOD, "+"], what: "kbZoomInOut", or: [MOD, "−"] },
      { keys: [MOD, "0"], what: "kbZoom100" },
      { keys: ["Shift", "1"], what: "kbZoomFit" },
      { keys: ["Shift", "2"], what: "kbZoomSelection" },
      { keys: ["Space", "kbDrag"], what: "kbPan" },
      { keys: ["V"], what: "kbMoveTool", or: ["H"] },
      { keys: ["P"], what: "kbPreview" },
      { keys: ["?"], what: "kbShowSheet" },
    ],
  },
];

function Keys({ keys, p }: { keys: string[]; p: Palette }) {
  const lang = useLang();
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {keys.map((k, i) =>
        k.startsWith("kb") ? (
          <span key={i} style={{ fontSize: 11, color: p.onSurfaceVariant }}>
            {t(k as UIKey, lang)}
          </span>
        ) : (
          <kbd key={i} style={{ minWidth: 18, height: 20, padding: "0 5px", boxSizing: "border-box", display: "inline-grid", placeItems: "center", borderRadius: 5, background: p.surfaceContainerHighest, color: p.onSurface, fontSize: 11, fontFamily: "inherit", fontWeight: 600, boxShadow: `inset 0 -1px 0 ${p.outlineVariant}` }}>
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}

export function ShortcutsSheet({ open, onClose, p }: { open: boolean; onClose: () => void; p: Palette }) {
  const lang = useLang();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
          style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.28)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <motion.div
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={t("kbTitle", lang)}
            data-shortcuts-sheet
            tabIndex={-1}
            initial={{ y: 12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            style={{ width: "min(860px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: 24, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 12px 40px rgba(0,0,0,0.22)", padding: "18px 22px 22px", outline: "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Icon name="keyboard" size={22} color={p.onSurfaceVariant} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1 }}>{t("kbTitle", lang)}</h2>
              <IconBtn icon="close" p={p} onClick={onClose} title={t("close", lang)} size={36} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "6px 28px" }}>
              {GROUPS.map((g) => (
                <section key={g.title} aria-label={t(g.title, lang)}>
                  <h3 style={{ margin: "10px 0 6px", fontSize: 12, fontWeight: 700, color: p.primary, letterSpacing: 0.3 }}>{t(g.title, lang)}</h3>
                  {g.rows.map((r) => (
                    <div key={r.what} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 28, borderBottom: `1px solid ${p.outlineVariant}55` }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: p.onSurface }}>{t(r.what, lang)}</span>
                      <Keys keys={r.keys} p={p} />
                      {r.or && (
                        <>
                          <span style={{ fontSize: 11, color: p.outline }}>/</span>
                          <Keys keys={r.or} p={p} />
                        </>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
