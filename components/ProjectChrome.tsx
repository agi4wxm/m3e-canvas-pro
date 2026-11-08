/* The project in the editor's chrome: its name (which opens the projects home), whether it is being saved to a file
 * and whether that file needs the person (reconnect, a change made elsewhere); the project menu (save to a file or a
 * folder, open one, download); and the two questions a file asks: where an opened file goes, and which version
 * stands when the file changed outside the editor. */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import type { LinkState } from "@/lib/projects/fileLink";
import type { Recovered, SaveReport, SaveState } from "@/lib/projects/persist";
import { saveKindKey } from "@/lib/i18n/projects";
import { Icon } from "./Icon";
import { Toggle } from "./ui";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/* ---------- the name in the toolbar ---------- */

export function ProjectPill({
  p,
  name,
  link,
  save,
  onHome,
  onReconnect,
  onConflict,
  onSaveState,
  size = "full",
}: {
  p: Palette;
  name: string;
  link: LinkState | null;
  /** where the browser's copy stands: a failed save shows here until one goes through */
  save?: SaveState | null;
  onHome: () => void;
  onReconnect: () => void;
  onConflict: () => void;
  onSaveState?: () => void;
  /** how much room the name has: all of it, a little, or none (the name is then in the tooltip) */
  size?: "full" | "compact" | "icon";
}) {
  const lang = useLang();
  const status = link?.status;
  const busy = status === "pending" || status === "saving";
  const linkTitle = link ? fill(t(busy ? "fileSavingTo" : status === "error" ? "fileSaveFailed" : "fileSavedTo", lang), { name: link.name }) + (status === "error" && link.error ? `: ${link.error}` : "") : "";
  const failed = save?.status === "error" ? save.error : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-project-pill data-file-status={status ?? "none"} data-save-status={save?.status ?? "none"}>
      <button
        onClick={onHome}
        title={size === "icon" ? `${name} · ${t("allProjects", lang)}` : t("allProjects", lang)}
        aria-label={`${t("allProjects", lang)}: ${name}`}
        className="m3-press"
        style={{
          height: 40,
          maxWidth: size === "compact" ? 168 : 240,
          padding: size === "icon" ? "0 6px" : "0 14px 0 8px",
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
        <span data-project-name style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, display: size === "icon" ? "none" : undefined }}>
          {name}
        </span>
        {link && (status === "saved" || busy || status === "error") && (
          <span title={linkTitle} aria-label={linkTitle} role="status" style={{ display: "inline-flex", color: status === "error" ? p.error : p.onSurfaceVariant, flex: "0 0 auto" }}>
            <Icon name={status === "error" ? "sync_problem" : busy ? "sync" : "check_circle"} size={18} />
          </span>
        )}
      </button>
      {failed && (
        <button
          onClick={onSaveState}
          title={`${t("saveNotKeptTitle", lang)}: ${t(saveKindKey(failed.kind), lang)}`}
          className="m3-press"
          data-save-error={failed.kind}
          style={{ height: 32, padding: "0 12px 0 8px", borderRadius: 16, border: "none", background: p.errorContainer, color: p.onErrorContainer, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <Icon name="sync_problem" size={18} />
          {t("saveNotKept", lang)}
        </button>
      )}
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
  /** where the browser's copy and the file's stand, at any time */
  onSaveState?: () => void;
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
      {a.onSaveState && row("cloud_done", t("saveStatusMenu", lang), a.onSaveState)}
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

/** Where the browser's copy and the file's stand, each on its own row, with what can be done: try again, download
 *  a copy; on the way to another project also leave anyway or stay. */
export function SaveStateDialog({ p, open, report, leaving, onRetry, onDownload, onLeave, onClose }: { p: Palette; open: boolean; report: SaveReport | null; leaving: boolean; onRetry: () => void; onDownload: () => void; onLeave: () => void; onClose: () => void }) {
  const lang = useLang();
  const browser = report?.browser;
  const file = report?.file ?? null;
  const browserKept = browser?.status === "saved";
  const why = (kind: Parameters<typeof saveKindKey>[0], message?: string) => t(saveKindKey(kind), lang) + (message && kind !== "conflict" ? ` (${message})` : "");
  const browserText = !browser ? "" : browser.status === "saved" ? t("saveStateSaved", lang) : browser.error ? why(browser.error.kind, browser.error.message) : t("saveStateSaving", lang);
  const fileText = !file
    ? ""
    : file.status === "saved"
      ? t("saveStateSaved", lang)
      : file.status === "reconnect"
        ? t("saveStateReconnect", lang)
        : file.status === "conflict"
          ? t("saveStateChanged", lang)
          : file.status === "error"
            ? why(file.errorKind ?? "io", file.error)
            : t("saveStateSaving", lang);
  const ok = !!report?.ok;
  const title = ok ? t("saveAllKept", lang) : leaving ? t("saveLeaveTitle", lang) : t("saveNotKeptTitle", lang);
  const body = ok ? "" : browserKept ? t("saveLeaveFileBody", lang) : t("saveLeaveBrowserBody", lang);
  const row = (icon: string, label: string, text: string, ok: boolean, data: string) => (
    <div {...{ [`data-save-row`]: data }} data-ok={ok ? "1" : "0"} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 16, background: p.surfaceContainer }}>
      <Icon name={ok ? "check_circle" : icon} size={20} color={ok ? p.primary : p.error} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{label}</span>
        <span style={{ fontSize: 13, color: p.onSurfaceVariant, overflowWrap: "anywhere" }}>{text}</span>
      </div>
    </div>
  );
  return (
    <Dialog p={p} open={open} label={title} icon={ok ? "cloud_done" : "sync_problem"} iconColor={ok ? p.primary : p.error} title={title} body={body} onCancel={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-save-state={ok ? "ok" : "not-ok"}>
        {browser && row("sync_problem", t("saveInBrowser", lang), browserText, browserKept, "browser")}
        {file && row(file.kind === "folder" ? "folder" : "description", file.name, fileText, file.status === "saved", "file")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
        {button(p, "text", leaving ? t("saveStay", lang) : t("closeBtn", lang), onClose, "save-stay")}
        {leaving && button(p, "text", t("saveLeaveAnyway", lang), onLeave, "save-leave")}
        {button(p, "tonal", t("saveDownloadCopy", lang), onDownload, "save-download")}
        {!ok && button(p, "filled", t("saveRetry", lang), onRetry, "save-retry")}
      </div>
    </Dialog>
  );
}

/** A version an earlier tab could not keep: restored over the canvas (one undo away), or let go. Dismissed any other
 *  way (Escape, the scrim) it is kept, and offered again next time. */
export function RecoveryDialog({ p, recovered, onRestore, onDiscard, onLater }: { p: Palette; recovered: Recovered | null; onRestore: () => void; onDiscard: () => void; onLater: () => void }) {
  const lang = useLang();
  const when = recovered?.at ? new Date(recovered.at).toLocaleString(lang) : "";
  return (
    <Dialog p={p} open={!!recovered} label={t("recoveryTitle", lang)} icon="history" iconColor={p.primary} title={t("recoveryTitle", lang)} body={fill(t("recoveryBody", lang), { when })} onCancel={onLater}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }} data-recovery>
        {button(p, "text", t("recoveryDiscard", lang), onDiscard, "recovery-discard")}
        {button(p, "filled", t("recoveryRestore", lang), onRestore, "recovery-restore")}
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
