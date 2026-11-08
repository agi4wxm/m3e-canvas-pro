/* The project the editor has open (lib/projects): its name in the chrome and the page title, its picture for the
 * projects list, the file it is saved to as it changes, and the ways to another project: the projects home, a file or
 * folder opened or dropped, a new one. Going to another project is going to its address, so everything the editor
 * holds starts afresh for it; the tab goes only once what it holds is kept, or the person says to go anyway. Also
 * what failed to save and why, and a version an earlier tab could not keep, offered back. */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { DocStore } from "@/lib/core";
import type { PersistAdapter } from "@/lib/core/persist";
import { projectNameFromFile, digest } from "@/lib/core/projectFile";
import { t, type Lang } from "@/lib/i18n";
import { listProjects, putFileRecord, type FileRecord, type ProjectMeta } from "@/lib/projects/db";
import { downloadProject } from "@/lib/projects/download";
import { canPickFolder, canSyncFile, mayWrite, pickFolder, pickOpenFile, pickSaveFile, readFromDisk, type LinkState } from "@/lib/projects/fileLink";
import { ProjectsPersist, type Recovered, type SaveReport, type SaveState } from "@/lib/projects/persist";
import { createProject, freeName, projectUrl } from "@/lib/projects/projects";
import { newerVersionOf, projectFileName } from "@/lib/project";
import type { Doc, Frame } from "@/lib/tokens";
import { outsideInDoc } from "@/lib/outside";
import { holdOutside } from "./useOutsideImages";

/** a project file or folder opened or dropped, waiting for the person to say where it goes */
export type PendingOpen = { doc: Doc; name: string; handle?: FileSystemHandle; kind?: "file" | "folder"; written?: FileRecord["written"] };

export type ProjectInputs = {
  store: DocStore;
  persist: PersistAdapter;
  docRef: RefObject<Doc>;
  framesRef: RefObject<Frame[]>;
  lang: Lang;
  /** the document is in the store */
  loaded: boolean;
  editable: boolean;
  frameThumb: (f: Frame) => Promise<string | null>;
  /** opens a whole document over the one on the canvas, one undo away */
  importDoc: (doc: Doc) => void;
  /** the hidden file input, for browsers that cannot pick a file with a handle */
  pickFallback: () => void;
  showToast: (msg: string, ms?: number, icon?: string) => void;
};

/** how long the canvas rests before its picture is drawn again, and how often at most */
const THUMB_QUIET_MS = 4000;
const THUMB_EVERY_MS = 30_000;
const PAGE_TITLE = "M3E Canvas";

const problemOf = (s: SaveState | null) => (s && (s.status === "error" || s.status === "conflict") ? s : null);

const idle = (fn: () => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 200));

export function useProject(o: ProjectInputs) {
  const { store, persist, lang } = o;
  const projects = persist instanceof ProjectsPersist ? persist : null;
  const [meta, setMeta] = useState<ProjectMeta | null>(projects?.meta ?? null);
  const [mode, setMode] = useState<"projects" | "legacy" | null>(projects?.mode ?? null);
  const [link, setLink] = useState<LinkState | null>(projects?.link?.state ?? null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  /** What is wrong with the browser's copy (lib/projects/persist.ts): a failed write or another tab's save, else
   *  null. Only that is held here, so the editor draws again when a save fails or recovers, not on every save. */
  const [save, setSave] = useState<SaveState | null>(problemOf(projects?.save ?? null));
  /** The save state dialog: opened from the chrome, or by going to another project with something not kept, which
   *  then waits there (`leaving`) for the person to try again, take a copy, leave anyway or stay. */
  const [saveDialog, setSaveDialog] = useState<{ report: SaveReport; leaving?: string } | null>(null);
  /** a version an earlier tab could not keep, offered back once the tab may edit */
  const [recovered, setRecovered] = useState<Recovered | null>(null);
  const live = useRef(o);
  live.current = o;

  /* what the tab opened, and what it says about it */
  useEffect(() => {
    if (!projects) return;
    let active = true;
    const offMeta = projects.onMeta((m) => setMeta(m));
    const offLink = projects.onLink((s) => setLink(s));
    const offSave = projects.onSave((s) =>
      setSave((was) => {
        const next = problemOf(s);
        return next?.status === was?.status && next?.error === was?.error ? was : next;
      }),
    );
    void projects.opening.then((opened) => {
      if (!active) return;
      setMode(opened.mode);
      setMeta(projects.meta);
      setLink(projects.link?.state ?? null);
      setSave(problemOf(projects.save));
      if (opened.mode === "legacy") live.current.showToast(t("projectsBlocked", live.current.lang), 9000, "warning");
      else if (opened.missing) live.current.showToast(t("projectMissing", live.current.lang), 6000, "info");
    });
    return () => {
      active = false;
      offMeta();
      offLink();
      offSave();
    };
  }, [projects]);
  useEffect(() => {
    if (o.loaded && o.editable && projects?.recovered) setRecovered(projects.recovered);
  }, [o.loaded, o.editable, projects]);
  /* The dialog follows what is saved while it is open. On the way to another project, a save that goes through by
     itself (tried again a moment later) lets the tab go on, as asked. */
  useEffect(() => {
    if (!projects || !saveDialog) return;
    const report = projects.report();
    if (report.ok && saveDialog.leaving) {
      setSaveDialog(null);
      window.location.assign(saveDialog.leaving);
      return;
    }
    setSaveDialog({ ...saveDialog, report });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, save, link]);

  /* a file changed elsewhere asks once, on its own; afterwards the chip in the chrome asks again */
  const askedRef = useRef(false);
  useEffect(() => {
    if (link?.status === "conflict" && !askedRef.current) {
      askedRef.current = true;
      setConflictOpen(true);
    }
    if (link?.status !== "conflict") askedRef.current = false;
  }, [link?.status]);

  /* the project's name in the page title */
  useEffect(() => {
    document.title = meta?.name ? `${meta.name} – ${PAGE_TITLE}` : PAGE_TITLE;
  }, [meta?.name]);

  /* someone's edits (not the editor's own layout passes) move the project's time on, and its picture is due again */
  const thumbDirtyRef = useRef(true);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbAt = useRef(0);
  const drawingRef = useRef<Promise<void> | null>(null);
  const drawThumb = (): Promise<void> => {
    /* a read-only tab leaves the project's listing to the tab that edits it */
    if (!projects || !live.current.editable || drawingRef.current) return drawingRef.current ?? Promise.resolve();
    const first = live.current.framesRef.current?.[0];
    if (!first || !thumbDirtyRef.current) return Promise.resolve();
    thumbDirtyRef.current = false;
    thumbAt.current = Date.now();
    drawingRef.current = live.current
      .frameThumb(first)
      .then((url) => (url ? projects.setThumb(url) : undefined))
      .catch(() => {})
      .finally(() => {
        drawingRef.current = null;
      });
    return drawingRef.current;
  };
  useEffect(() => {
    if (!projects) return;
    return store.subscribe((e) => {
      if (e.kind === "session" || e.kind === "history") return;
      if (e.origin !== "system") projects.markEdited();
      thumbDirtyRef.current = true;
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      const wait = Math.max(THUMB_QUIET_MS, thumbAt.current + THUMB_EVERY_MS - Date.now());
      thumbTimer.current = setTimeout(() => idle(() => void drawThumb()), wait);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, projects]);
  /* the first picture once the canvas has settled, for a project that has none yet */
  useEffect(() => {
    if (!o.loaded || !projects || meta?.thumb) return;
    const id = setTimeout(() => idle(() => void drawThumb()), 2500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.loaded, projects]);
  useEffect(() => () => {
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
  }, []);

  /* ---------- going to another project ---------- */

  /** What is in hand kept (the store, the file, a fresh picture), then the tab goes to the project. When not all of
   *  it could be kept, the tab stays and says so: try again, download a copy, or leave anyway. */
  const goTo = async (id: string, newTab = false) => {
    const url = projectUrl(id);
    if (newTab) {
      window.open(url, "_blank", "noopener");
      return;
    }
    if (projects) {
      await Promise.race([drawThumb(), new Promise((r) => setTimeout(r, 1500))]);
      const report = await projects.flush();
      if (!report.ok) {
        setHomeOpen(false);
        setSaveDialog({ report, leaving: url });
        return;
      }
    }
    window.location.assign(url);
  };

  /** tries the failed saves again; on the way to another project, goes once all is kept */
  const retrySave = async () => {
    if (!projects) return;
    const report = await projects.retry();
    const leaving = saveDialog?.leaving;
    if (report.ok && leaving) {
      setSaveDialog(null);
      window.location.assign(leaving);
      return;
    }
    setSaveDialog((d) => (d ? { ...d, report } : d));
  };

  /** goes on although not all is kept: what is not is noted, and the project offers it back when it opens again */
  const leaveAnyway = () => {
    const leaving = saveDialog?.leaving;
    setSaveDialog(null);
    if (!leaving) return;
    projects?.commitNow();
    window.location.assign(leaving);
  };

  const openSaveState = () => projects && setSaveDialog({ report: projects.report() });

  /** the version an earlier tab could not keep: over the canvas (one undo away), or let go */
  const restoreRecovered = () => {
    const r = recovered;
    setRecovered(null);
    projects?.dropRecovered();
    if (r) live.current.importDoc(r.doc);
  };
  const discardRecovered = () => {
    setRecovered(null);
    projects?.dropRecovered();
  };

  const newProject = async () => {
    const list = await listProjects().catch(() => []);
    const made = await createProject({ name: freeName(t("untitledProject", lang), list) });
    await goTo(made.id);
  };

  /* ---------- files ---------- */

  const fileName = () => projectFileName(live.current.docRef.current!, meta?.name);

  const failed = (e: unknown) => {
    const name = projects?.link?.state.name ?? "";
    live.current.showToast(`${t("fileSaveFailed", lang).replace("{name}", name)}${e instanceof Error && e.message ? `: ${e.message}` : ""}`, 6000, "error");
  };

  /** binds the project to a file the person picks; where the browser cannot, the project is downloaded instead */
  const saveToFile = async () => {
    const doc = live.current.docRef.current!;
    if (!projects || !canSyncFile()) {
      downloadProject(doc, meta?.name);
      return;
    }
    try {
      const handle = await pickSaveFile(fileName());
      if (handle) await projects.bindFile(handle, "file");
    } catch (e) {
      failed(e);
    }
  };

  /** binds the project to a folder; one that already holds a project asks before it is written over */
  const saveToFolder = async () => {
    if (!projects || !canPickFolder()) return;
    try {
      const dir = await pickFolder();
      if (!dir) return;
      const there = await readFromDisk(dir).catch(() => null);
      /* a written mark that matches nothing makes the first write find the folder's project and ask */
      await projects.bindFile(dir, "folder", there?.text ? { size: -1, modified: -1, digest: "" } : undefined);
    } catch (e) {
      failed(e);
    }
  };

  const downloadCopy = () => downloadProject(live.current.docRef.current!, meta?.name);

  /** what a picked or dropped file or folder holds, offered to the person; an error when it holds no project */
  const offerHandle = async (handle: FileSystemHandle) => {
    const { doc, text, name } = await readFromDisk(handle).catch(() => ({ doc: null, text: null, name: handle.name }));
    if (!doc) {
      live.current.showToast(t(handle.kind === "directory" ? "fileFolderNoProject" : "invalidProject", lang), 4000, "error");
      return;
    }
    let written: FileRecord["written"];
    if (handle.kind === "file" && text !== null) {
      const f = await (handle as FileSystemFileHandle).getFile().catch(() => null);
      if (f) written = { size: f.size, modified: f.lastModified, digest: digest(text) };
    }
    setPendingOpen({ doc, name, handle, kind: handle.kind === "directory" ? "folder" : "file", written });
  };

  const openFile = async () => {
    const handle = await pickOpenFile().catch(() => null);
    if (handle === undefined) {
      live.current.pickFallback();
      return;
    }
    if (handle) await offerHandle(handle);
  };

  const openFolder = async () => {
    const dir = await pickFolder().catch(() => null);
    if (dir) await offerHandle(dir);
  };

  /** a file picked the old way (no handle): offered the same, without keeping it in sync */
  const offerDoc = (doc: Doc, name: string) => setPendingOpen({ doc, name });

  /** The person's answer to an opened file: a new project (the tab goes to it), or this canvas replaced. Kept in
   *  sync, the project is bound to the file once the browser allows writing to it, asked here, in the press. */
  const confirmOpen = async (where: "new" | "replace", keepSynced: boolean) => {
    const p = pendingOpen;
    setPendingOpen(null);
    if (!p) return;
    /* a file a newer version wrote is never kept in sync: nothing may write over it (lib/project.ts `Loaded.newer`) */
    const bind = keepSynced && !!p.handle && !!projects && newerVersionOf(p.doc) === undefined && (await mayWrite(p.handle, true));
    if (where === "replace" || !projects) {
      /* someone else's file: what it shows from other sites waits for the author to allow it */
      holdOutside(p.doc, persist);
      live.current.importDoc(p.doc);
      if (bind && p.handle && p.kind) await projects!.bindFile(p.handle, p.kind, p.written);
      return;
    }
    const list = await listProjects().catch(() => []);
    const name = freeName(projectNameFromFile(p.name) ?? (p.doc.title.trim() || t("untitledProject", lang)), list);
    const made = await createProject({ name, doc: p.doc, ...(outsideInDoc(p.doc).length ? { outside: "blocked" as const } : {}) });
    if (bind && p.handle && p.kind) await putFileRecord({ id: made.id, kind: p.kind, handle: p.handle, name: p.handle.name, ...(p.written ? { written: p.written } : {}) });
    await goTo(made.id);
  };

  const reconnect = async () => {
    const ok = await projects?.link?.reconnect();
    if (ok === false) live.current.showToast(t("fileReconnectHint", lang).replace("{name}", projects?.link?.state.name ?? ""), 5000, "info");
  };

  const keepMine = async () => {
    setConflictOpen(false);
    await projects?.link?.keepMine(projects.lastDoc).catch(failed);
  };

  const loadTheirs = async () => {
    setConflictOpen(false);
    const doc = await projects?.link?.loadDisk().catch(() => null);
    if (doc) live.current.importDoc(doc);
    else live.current.showToast(t("invalidProject", lang), 4000, "error");
  };

  const stopSaving = () => void projects?.unbindFile();

  /* ---------- a file or folder dropped anywhere on the editor ---------- */
  useEffect(() => {
    if (!o.editable) return;
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    let depth = 0;
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const item = e.dataTransfer?.items?.[0] as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | undefined;
      /* the handle has to be asked for while the drop is still being handled */
      const handle = item?.getAsFileSystemHandle?.();
      const file = e.dataTransfer?.files?.[0];
      void (async () => {
        const h = await handle?.catch(() => null);
        if (h) return offerHandle(h);
        if (!file) return;
        const { readProject } = await import("@/lib/project");
        const doc = await readProject(file);
        if (doc) offerDoc(doc, file.name);
        else live.current.showToast(t("invalidProject", lang), 3000, "error");
      })();
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.editable, lang]);

  return {
    projects,
    mode,
    meta,
    link,
    homeOpen,
    setHomeOpen: (open: boolean) => {
      setHomeOpen(open);
      /* the list shows this project as it is now */
      if (open) idle(() => void drawThumb());
    },
    pendingOpen,
    setPendingOpen,
    conflictOpen,
    setConflictOpen,
    save,
    saveDialog,
    closeSaveDialog: () => setSaveDialog(null),
    openSaveState,
    retrySave,
    leaveAnyway,
    recovered,
    restoreRecovered,
    discardRecovered,
    laterRecovered: () => setRecovered(null),
    dropping,
    goTo,
    newProject,
    saveToFile,
    saveToFolder,
    downloadCopy,
    openFile,
    openFolder,
    offerDoc,
    confirmOpen,
    reconnect,
    keepMine,
    loadTheirs,
    stopSaving,
    canSyncFile: canSyncFile(),
    canPickFolder: canPickFolder(),
  };
}
