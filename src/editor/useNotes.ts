/* The editor's short messages: on the desktop a pill beside the tidy button, on a phone a centred toast. Either may
 * carry one action (an undo) for as long as it shows. */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Note, NoteAction } from "@/components/Toolbar";

export function useNotes(mobileRef: RefObject<boolean>) {
  const [toast, setToast] = useState<Note | null>(null);
  /** the "applied" confirmation beside the tidy button */
  const [aiNote, setAiNote] = useState<Note | null>(null);
  const aiNoteTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  /** the desktop's message pill beside the tidy button; the phone keeps its centered toast */
  const showAiNote = (text: string, icon = "check", ms = 2200, action?: NoteAction) => {
    const hide = () => setAiNote(null);
    /* the notice's own button does its work and takes the notice away */
    setAiNote({ text, icon, ...(action ? { action: { label: action.label, run: () => (action.run(), hide()) } } : {}) });
    if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
    aiNoteTimer.current = window.setTimeout(hide, ms);
  };

  /** a short message; with an action, a button on it (an undo) for as long as it shows */
  const showToast = (msg: string, ms = 2200, icon = "info", action?: NoteAction) => {
    if (!mobileRef.current) {
      showAiNote(msg, icon, ms, action);
      return;
    }
    const hide = () => setToast(null);
    setToast({ text: msg, icon, ...(action ? { action: { label: action.label, run: () => (action.run(), hide()) } } : {}) });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(hide, ms);
  };

  useEffect(
    () => () => {
      if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );
  return { toast, aiNote, showToast, showAiNote };
}
