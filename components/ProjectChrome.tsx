/* The project in the editor's chrome: its name (which opens the projects home), whether it is being saved to a file
 * and whether that file needs the person (reconnect, a change made elsewhere); the project menu (save to a file or a
 * folder, open one, download); and the two questions a file asks: where an opened file goes, and which version
 * stands when the file changed outside the editor. */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import type { LinkState } from "@/lib/projects/fileLink";
import { Icon } from "./Icon";
import { Toggle } from "./ui";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/* ---------- the name in the toolbar ---------- */

export function ProjectPill({ p, name, link, onHome, onReconnect, onConflict, compact }: { p: Palette; name: string; link: LinkState | null; onHome: () => void; onReconnect: () => void; onConflict: () => void; compact?: boolean }) {
  const lang = useLang();
  const status = link?.status;
  const busy = status === "pending" || status === "saving";
  const linkTitle = link ? fill(t(busy ? "fileSavingTo" : status === "error" ? "fileSaveFailed" : "fileSavedTo", lang), { name: link.name }) + (status === "error" && link.error ? `: ${link.error}` : "") : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-project-pill data-file-status={status ?? "none"}>
      <button
        onClick={onHome}
        title={t("allProjects", lang)}
        aria-label={`${t("allProjects", lang)}: ${name}`}
        className="m3-press"
        style={{
          height: 40,
          maxWidth: compact ? 168 : 240,
          padding: "0 14px 0 8px",
          borderRadius: 20,
          border: "none",
          background: "transparent",
          color: p.onSurface,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          minWidth: 0,
        }}
      >
        <span style={{ width: 28, height: 28, borderRadius: 10, background: p.primaryContainer, color: p.onPrimaryContainer, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          <Icon name="stacks" size={18} fill />
        </span>
        <span data-project-name style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {name}
        </span>
        {link && (status === "saved" || busy || status === "error") && (
          <span title={linkTitle} aria-label={linkTitle} role="status" style={{ display: "inline-flex", color: status === "error" ? p.error : p.onSurfaceVariant, flex: "0 0 auto" }}>
            <Icon name={status === "error" ? "sync_problem" : busy ? "sync" : "check_circle"} size={18} />
          </span>
        )}
      </button>
      {status === "reconnect" && link && (
        <button
          onClick={onReconnect}
          title={fill(t("fileReconnectHint", lang), { name: link.name })}
          className="m3-press"
          data-file-reconnect
          style={{ height: 32, padding: "0 12px 0 8px", borderRadius: 16, border: "none", background: p.tertiaryContainer, color: p.onTertiaryContainer, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <Icon name="link" size={18} />
          {t("fileReconnect", lang)}
        </button>
      )}
      {status === "conflict" && link && (
        <button
          onClick={onConflict}
          title={fill(t("fileConflictTitle", lang), { name: link.name })}
          className="m3-press"
          data-file-conflict
          style={{ height: 32, padding: "0 12px 0 8px", borderRadius: 16, border: "none", background: p.errorContainer, color: p.onErrorContainer, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <Icon name="warning" size={18} />
          {t("fileChanged", lang)}
        </button>
      )}
    </div>
  );
}

/* ---------- the project menu ---------- */

export type ProjectMenuActions = {
  onHome: () => void;
  onSaveToFile: () => void;
  onSaveToFolder?: () => void;
  onOpenFile: () => void;
  onOpenFolder?: () => void;
  onDownload: () => void;
  onStopSaving?: () => void;
  /** the browser can keep a file in sync (else saving to a file downloads it) */
  canSync: boolean;
  link: LinkState | null;
};

export function ProjectMenu({ p, close, a }: { p: Palette; close: () => void; a: ProjectMenuActions }) {
  const lang = useLang();
  const row = (icon: string, label: string, run: () => void, o: { hint?: string; danger?: boolean } = {}) => (
    <button
      key={label}
      role="menuitem"
      title={o.hint ?? label}
      onClick={() => {
        close();
        run();
      }}
      className="m3-press"
      style={{ height: 40, padding: "0 14px 0 10px", borderRadius: 12, border: "none", background: "transparent", color: o.danger ? p.error : p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap", textAlign: "left" }}
    >
      <Icon name={icon} size={20} color={o.danger ? p.error : p.onSurfaceVariant} />
      {label}
    </button>
  );
  const rule = (key: string) => <div key={key} role="separator" style={{ height: 1, margin: "4px 8px", background: p.outlineVariant }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
      {row("grid_view", t("allProjects", lang), a.onHome)}
      {(a.link || a.canSync) && rule("a")}
      {a.link && (
        <div key="linked" style={{ padding: "6px 14px 6px 10px", display: "flex", alignItems: "center", gap: 12, color: p.onSurfaceVariant, fontSize: 12, maxWidth: 280 }}>
          <Icon name={a.link.kind === "folder" ? "folder" : "description"} size={20} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fill(t("fileSavedTo", lang), { name: a.link.name })}</span>
        </div>
      )}
      {a.link && a.onStopSaving && row("link_off", t("stopSaving", lang), a.onStopSaving)}
      {/* where the browser cannot keep a file in sync, downloading (below) is the way to a file */}
      {!a.link && a.canSync && row("save", t("saveToFile", lang), a.onSaveToFile, { hint: t("saveToFileHint", lang) })}
      {!a.link && a.canSync && a.onSaveToFolder && row("create_new_folder", t("saveToFolder", lang), a.onSaveToFolder, { hint: t("saveToFolderHint", lang) })}
      {rule("b")}
      {row("file_open", t("openFile", lang), a.onOpenFile)}
      {a.onOpenFolder && row("folder_open", t("openFolder", lang), a.onOpenFolder)}
      {row("download", t("downloadProjectFile", lang), a.onDownload)}
    </div>
  );
}

/* ---------- the questions ---------- */

function Dialog({ p, open, label, icon, iconColor, title, body, children, onCancel }: { p: Palette; open: boolean; label: string; icon: string; iconColor: string; title: string; body: string; children: React.ReactNode; onCancel: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onCancel}
          style={{ position: "fixed", inset: 0, zIndex: 720, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={label}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(100%, 440px)", padding: 24, borderRadius: 28, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div style={{ textAlign: "center", color: iconColor }}>
              <Icon name={icon} size={28} />
            </div>
            <div style={{ fontSize: 22, lineHeight: 1.3, textAlign: "center", overflowWrap: "anywhere" }}>{title}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: p.onSurfaceVariant }}>{body}</div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const button = (p: Palette, kind: "text" | "tonal" | "filled", label: string, onClick: () => void, data?: string) => (
  <button
    onClick={onClick}
    className="m3-press"
    {...(data ? { [`data-${data}`]: "" } : {})}
    style={{
      minHeight: 40,
      padding: "0 18px",
      borderRadius: 20,
      border: "none",
      background: kind === "filled" ? p.primary : kind === "tonal" ? p.secondaryContainer : "transparent",
      color: kind === "filled" ? p.onPrimary : kind === "tonal" ? p.onSecondaryContainer : p.primary,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
);

/** where an opened or dropped project goes: a project of its own (the default), or over this canvas */
export function OpenFileDialog({ p, open, name, canBind, onCancel, onConfirm }: { p: Palette; open: boolean; name: string; canBind: boolean; onCancel: () => void; onConfirm: (where: "new" | "replace", keepSynced: boolean) => void }) {
  const lang = useLang();
  const [keep, setKeep] = useState(true);
  useEffect(() => {
    if (open) setKeep(true);
  }, [open]);
  const title = fill(t("openFileTitle", lang), { name });
  return (
    <Dialog p={p} open={open} label={title} icon="file_open" iconColor={p.primary} title={title} body={t("openFileBody", lang)} onCancel={onCancel}>
      {canBind && (
        <div style={{ padding: "4px 0" }} data-keep-synced>
          <Toggle on={keep} onChange={setKeep} p={p} icon="sync" label={t("keepFileSynced", lang)} grow />
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
        {button(p, "text", t("cancel", lang), onCancel)}
        {button(p, "tonal", t("openReplaceCanvas", lang), () => onConfirm("replace", canBind && keep), "open-replace")}
        {button(p, "filled", t("openAsNewProject", lang), () => onConfirm("new", canBind && keep), "open-new")}
      </div>
    </Dialog>
  );
}

/** the file changed outside the editor: which version stands */
export function FileConflictDialog({ p, open, name, onCancel, onLoad, onKeep }: { p: Palette; open: boolean; name: string; onCancel: () => void; onLoad: () => void; onKeep: () => void }) {
  const lang = useLang();
  const title = fill(t("fileConflictTitle", lang), { name });
  return (
    <Dialog p={p} open={open} label={title} icon="warning" iconColor={p.error} title={title} body={t("fileConflictBody", lang)} onCancel={onCancel}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
        {button(p, "text", t("cancel", lang), onCancel)}
        {button(p, "tonal", t("fileConflictKeep", lang), onKeep, "conflict-keep")}
        {button(p, "filled", t("fileConflictLoad", lang), onLoad, "conflict-load")}
      </div>
    </Dialog>
  );
}

/** what covers the editor while a file is carried over it */
export function DropCover({ p, on }: { p: Palette; on: boolean }) {
  const lang = useLang();
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          key="drop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          style={{ position: "fixed", inset: 12, zIndex: 710, borderRadius: 28, border: `2px dashed ${p.primary}`, background: `color-mix(in srgb, ${p.primaryContainer} 55%, transparent)`, display: "grid", placeItems: "center", pointerEvents: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderRadius: 24, background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 16, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.16)" }}>
            <Icon name="file_open" size={24} color={p.primary} />
            {t("dropToOpen", lang)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
