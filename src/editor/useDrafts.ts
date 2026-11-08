/* A whole document arriving over the one on the canvas: a project file opened, a design from a link, a draft from the
 * author's model. A design from a link or a model eases its colours over, and the one it replaced waits (and is kept
 * on disk, lib/core/persist.ts `writeBefore`) until the author keeps or undoes it. */

import { useEffect, useRef, useState, type RefObject } from "react";
import { Doc, FrameMode, normalizeTheme, Theme } from "@/lib/tokens";
import { AiSettings, draftDesign, scenesToPaint } from "@/lib/ai";
import type { Progress } from "@/lib/agent/complete";
import type { NoteAction } from "@/components/Toolbar";
import { aiErrorText } from "@/components/AiPanel";
import { hasShareHash, readShareLink } from "@/lib/share";
import { holdOutside } from "./useOutsideImages";
import { isStrict, styleContext, withStyle, type CustomStyle } from "@/lib/styles";
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
  /** how far the streamed draft has got, while it streams */
  const [draftProgress, setDraftProgress] = useState<Progress | null>(null);
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
      void readShareLink(window.location.hash).then(({ doc: next, problem }) => {
        if (!active) return;
        if (next) {
          setShareOpen(false);
          /* a link is someone else's design: what it shows from other sites waits for the author to allow it */
          holdOutside(next, persist);
          arrive(next);
          clearShareHash();
        } else {
          clearShareHash();
          /* one past the limits (lib/share.ts) is stopped before it costs the tab: said apart from a broken one */
          const tooMuch = problem && problem !== "broken";
          showToast(t(tooMuch ? "shareLinkTooLarge" : "invalidProject", getLang()), tooMuch ? 6000 : 3000, "error");
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
      /* the streaming providers come with the first draft, not with the editor */
      const { streamedComplete } = await import("@/lib/agent/complete");
      const drafted = await draftDesign(aiSettings, guideRef.current, idea, lang, undefined, held ? rulesForModel(held) : undefined, streamedComplete(setDraftProgress));
      /* a model may bring styles of its own: they join the document's, each in place of one of its key */
      const styles = (drafted.styles ?? []).reduce<CustomStyle[] | undefined>((list, s) => withStyle(list, s), store.get().doc.styles);
      /* the model was told; what it wrote regardless does not stand. The document keeps its own strictness: a draft on a
         canvas held to a style is held to it, one on a free canvas keeps the looks it was allowed */
      /* read in the styles the draft comes with: they are not the document's until it arrives */
      const inDraft = styleContext(styles);
      const look = normalizeTheme({ ...drafted.theme, ...(held ? { style: held.style } : {}), strict: !!held }, inDraft);
      const next = conformDoc({ ...drafted, theme: look, ...(styles ? { styles } : {}) }, look, inDraft);
      settleDraftRef.current = true;
      arrive(next);
      void paintScenes(scenesToPaint(next.groups), normalizeTheme(next.theme));
    } catch (e) {
      /* said the way the other AI actions say it: what went wrong and, where the author can act, what to check */
      const m = e instanceof Error ? e.message : "";
      showToast(m === "guide" ? t("aiError", lang) : aiErrorText(e, lang), 6000, "error");
    } finally {
      setDraftBusy(false);
      setDraftProgress(null);
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
  return { ideaText, setIdeaText, draftBusy, draftProgress, draftBefore, setDraftBefore, revealing, quickUndo, setQuickUndo, importDoc, startDraft, keepDraft, undoDraft, settleDraftRef };
}
