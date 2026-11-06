/* A whole document arriving over the one on the canvas: a project file opened, a design from a link, a draft from the
 * author's model. A design from a link or a model eases its colours over, and the one it replaced waits (and is kept
 * on disk, lib/core/persist.ts `writeBefore`) until the author keeps or undoes it. */

import { useEffect, useRef, useState, type RefObject } from "react";
import { Doc, FrameMode, normalizeTheme, Theme } from "@/lib/tokens";
import { AiSettings, draftDesign, scenesToPaint } from "@/lib/ai";
import type { NoteAction } from "@/components/Toolbar";
import { hasShareHash, readShareHash } from "@/lib/share";
import { isStrict } from "@/lib/styles";
import { conformDoc, rulesForModel } from "@/lib/styleRules";
import { Lang, getLang, t } from "@/lib/i18n";
import type { DocStore } from "@/lib/core";
import type { PersistAdapter } from "@/lib/core/persist";
import { BASE_PATH } from "./model";

export type DraftInputs = {
  store: DocStore;
  persist: PersistAdapter;
  editAccess: "checking" | "editable" | "readonly";
  lang: Lang;
  aiSettings: AiSettings;
  mobileRef: RefObject<boolean>;
  docRef: RefObject<Doc>;
  themeRef: RefObject<Theme>;
  frameRef: { current: FrameMode };
  hadDocRef: { current: boolean };
  fitRef: RefObject<() => void>;
  /** what was open over the document it replaces closes */
  leaveForNewDoc: () => void;
  setSelectedLinkId: (id: string | null) => void;
  setShareOpen: (open: boolean) => void;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  paintScenes: (scenes: Doc["groups"][number]["items"], look?: Theme) => Promise<void>;
  stopPainting: () => void;
};

export function useDrafts({ store, persist, editAccess, lang, aiSettings, mobileRef, docRef, themeRef, frameRef, hadDocRef, fitRef, leaveForNewDoc, setSelectedLinkId, setShareOpen, showToast, paintScenes, stopPainting }: DraftInputs) {
  /** the idea typed into the "ask an AI" dialog; kept here so a failed draft does not lose it */
  const [ideaText, setIdeaText] = useState("");
  /** a model is drafting a design right now */
  const [draftBusy, setDraftBusy] = useState(false);
  /** the design a draft replaced, kept until the author keeps or undoes the draft */
  const [draftBefore, setDraftBefore] = useState<Doc | null>(null);
  const draftBeforeRef = useRef<Doc | null>(null);
  draftBeforeRef.current = draftBefore;
  /** true for the moment after a design arrives, so its colours ease over */
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);
  const guideRef = useRef<string | null>(null);
  /** Opening a project file replaces the canvas with the same restore path the saved
   *  document goes through, then starts the editor fresh on it. */
  const importDoc = (next: Doc) => {
    hadDocRef.current = true;
    /* whatever was under review is over: a file, a clear or a new arrival replaces it */
    setDraftBefore(null);
    setQuickUndo(false);
    persist.writeBefore(null);
    leaveForNewDoc();
    /* the whole document being replaced stays one undo away */
    store.replace(next, { trusted: true });
    frameRef.current = store.get().doc.frame;
    setSelectedLinkId(null);
    queueMicrotask(() => fitRef.current());
  };
  /* A link with a design in its hash offers it once the editor is ready to take it,
     whether the page opened on that link or the link was pasted into this tab. */
  useEffect(() => {
    if (editAccess !== "editable" || typeof window === "undefined") return;
    let active = true;
    const offer = () => {
      if (!hasShareHash(window.location.hash)) return;
      void readShareHash(window.location.hash).then((next) => {
        if (!active) return;
        if (next) {
          setShareOpen(false);
          arrive(next);
          clearShareHash();
        } else {
          clearShareHash();
          showToast(t("invalidProject", getLang()), 3000, "error");
        }
      });
    };
    offer();
    window.addEventListener("hashchange", offer);
    return () => {
      active = false;
      window.removeEventListener("hashchange", offer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAccess]);

  /** Asks the author's own model for a design and puts it on the canvas. The guide it reads
   *  is the one a coding agent reads (public/agent.md). The replaced design waits in
   *  `draftBefore` until the author keeps or undoes the draft. */
  /** A design that arrived from a model or a link takes the canvas with its colours easing
   *  over; the design it replaced waits in `draftBefore` until the author keeps or undoes it. */
  const arrive = (next: Doc) => {
    /* the phone editor has no keep / undo buttons: a link simply opens there, undoable as usual */
    if (mobileRef.current) {
      importDoc(next);
      return;
    }
    const before = draftBeforeRef.current ?? docRef.current;
    setRevealing(true);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealing(false), 900);
    importDoc(next);
    setDraftBefore(before);
    persist.writeBefore(before);
  };
  /* A model guesses how tall its parts come out. Once a new draft's parts have held their measured
   * sizes for a moment (icons and lazy widgets arrive late), what ran together is moved apart. */
  const settleDraftRef = useRef(false);
  const startDraft = async (idea: string) => {
    setShareOpen(false);
    setDraftBusy(true);
    try {
      if (guideRef.current === null) {
        const res = await fetch(`${BASE_PATH}/agent.md`);
        if (!res.ok) throw new Error("guide");
        guideRef.current = await res.text();
      }
      const held = isStrict(themeRef.current) ? themeRef.current : null;
      const drafted = await draftDesign(aiSettings, guideRef.current, idea, lang, undefined, held ? rulesForModel(held) : undefined);
      /* the model was told; what it wrote regardless does not stand. A design from a model is held to rules from then on */
      const look = normalizeTheme({ ...drafted.theme, ...(held ? { style: held.style } : {}), strict: true });
      const next = conformDoc({ ...drafted, theme: look }, look);
      settleDraftRef.current = true;
      arrive(next);
      void paintScenes(scenesToPaint(next.groups), normalizeTheme(next.theme));
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      showToast(m === "json" ? t("aiErrorJson", lang) : m === "refusal" ? t("aiErrorRefusal", lang) : m === "long" ? t("aiErrorLong", lang) : t("aiError", lang), 3200, "error");
    } finally {
      setDraftBusy(false);
    }
  };
  /** true after a kept draft until the author undoes something, so the header's undo also sits by the opener */
  const [quickUndo, setQuickUndo] = useState(false);
  const keepDraft = () => {
    setDraftBefore(null);
    setQuickUndo(true);
    persist.writeBefore(null);
  };
  const undoDraft = () => {
    settleDraftRef.current = false;
    stopPainting();
    if (draftBefore) {
      setRevealing(true);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setRevealing(false), 900);
      importDoc(draftBefore);
    }
    setDraftBefore(null);
  };

  /** drops the design from the URL once it has been taken or declined */
  const clearShareHash = () => {
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  return { ideaText, setIdeaText, draftBusy, draftBefore, setDraftBefore, revealing, quickUndo, setQuickUndo, importDoc, startDraft, keepDraft, undoDraft, settleDraftRef };
}
