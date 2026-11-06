/* The author's own model at work on the canvas: the settings it is reached with, the one field it writes at a time (a
 * screen's description, a part's behaviour note), and the pictures it paints for scenes. What it writes goes straight
 * in as one undo step; the field remembers what it said before (lib/ai `pushHistory`). */

import { useEffect, useRef, useState } from "react";
import { Doc, Frame, Group, Item, Theme } from "@/lib/tokens";
import { AiSettings, DEFAULT_AI, generateImage, hasImageKey, hasKey, imageSpec, isSecureUrl, proposeBehavior, proposeDescription, pushHistory, saveAiSettings, scenePrompt } from "@/lib/ai";
import { AiActionKey, aiErrorText } from "@/components/AiPanel";
import type { NoteAction } from "@/components/Toolbar";
import { artOf } from "@/lib/styles";
import { partBySlug, reader } from "@/parts/registry";
import { Lang, t } from "@/lib/i18n";

export type AiInputs = {
  lang: Lang;
  theme: Theme;
  /** the document as this render has it */
  doc: Doc;
  groupsRef: { current: Group[] };
  widthsRef: { current: Record<string, number> };
  snapshot: () => void;
  setGroups: (next: (g: Group[]) => Group[]) => void;
  setFrames: (next: (f: Frame[]) => Frame[]) => void;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  showAiNote: (text: string, icon?: string, ms?: number, action?: NoteAction) => void;
};

export function useAi({ lang, theme, doc, groupsRef, widthsRef, snapshot, setGroups, setFrames, showToast, showAiNote }: AiInputs) {
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI);
  const [aiBusy, setAiBusy] = useState(false);
  /** the screen the model is working on, which wears the animated ring meanwhile */
  const [aiFrameId, setAiFrameId] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  /* ---------- a scene's picture ---------- */
  const [paintingScene, setPaintingScene] = useState<string | null>(null);
  const paintAbort = useRef<AbortController | null>(null);
  const canPaint = hasImageKey(aiSettings) && isSecureUrl(aiSettings.imageBaseUrl?.trim() || imageSpec(aiSettings.imageProvider).baseUrl);
  const sceneItem = (id: string) => groupsRef.current.flatMap((g) => g.items).find((it) => it.id === id && it.component === "scene");
  /** paints scenes one at a time, each showing as soon as it is done; what was painted stays if a later one fails */
  const paintScenes = async (scenes: Item[], look: Theme = theme) => {
    if (!scenes.length) return;
    if (!canPaint) {
      showToast(t("scenesWaiting", lang).replace("{n}", String(scenes.length)), 6000);
      return;
    }
    paintAbort.current?.abort();
    const ac = new AbortController();
    paintAbort.current = ac;
    let painted = 0;
    try {
      for (const [i, item] of scenes.entries()) {
        const id = item.id;
        const def = partBySlug("scene");
        if (!def) continue;
        setPaintingScene(id);
        if (scenes.length > 1) showToast(t("scenesPainting", lang).replace("{n}", String(i + 1)).replace("{all}", String(scenes.length)), 60000, "auto_awesome");
        const p = reader(def, item.props);
        const moving = p.s("motion") === "animated";
        /* a scene that names no style of its own is painted in the document's */
        const image = await generateImage(aiSettings, scenePrompt(p.s("prompt"), p.s("style").trim() || artOf(look), moving), { w: p.n("width"), h: p.n("height") }, ac.signal, moving ? { frames: Math.round(p.n("frames")), ms: Math.round(p.n("frameMs")) } : undefined);
        if (ac.signal.aborted) return;
        setGroups((gs) => gs.map((g) => (g.items.some((it) => it.id === id) ? { ...g, items: g.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, image } } : it)) } : g)));
        painted++;
      }
      showToast(t("scenesPainted", lang).replace("{n}", String(painted)), 2600, "check");
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 6000, "error");
    } finally {
      if (paintAbort.current === ac) setPaintingScene(null);
    }
  };
  const updateAiSettings = (s: AiSettings) => {
    setAiSettings(s);
    saveAiSettings(s);
  };

  const aiReady = hasKey(aiSettings) && aiSettings.model.trim().length > 0 && isSecureUrl(aiSettings.baseUrl);
  /** Writes one field with the model: a part's behavior note, or a screen's description.
   *  The result goes straight in; the field remembers what it said so the rewrite can be undone. */
  const runAi = async (action: AiActionKey, f: Frame, itemId?: string) => {
    if (!aiReady) {
      showToast(t("aiNoKey", lang));
      return;
    }
    const curDoc = doc;
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiBusy(true);
    setAiFrameId(f.id);
    try {
      if (action === "describe") {
        const r = await proposeDescription(aiSettings, curDoc, widthsRef.current, f, lang, ac.signal);
        if (ac.signal.aborted) return;
        snapshot();
        setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, note: r.note, noteHistory: pushHistory(x.noteHistory, x.note), name: r.name ?? x.name } : x)));
        showAiNote(t("aiApplied", lang));
        return;
      }
      if (!itemId) return;
      const note = await proposeBehavior(aiSettings, curDoc, widthsRef.current, f, lang, itemId, ac.signal);
      if (ac.signal.aborted) return;
      if (!note) {
        showToast(t("aiErrorJson", lang));
        return;
      }
      snapshot();
      setGroups((gs) => gs.map((g) => (g.items.some((it) => it.id === itemId) ? { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, note, noteHistory: pushHistory(it.noteHistory, it.note) } : it)) } : g)));
      showAiNote(t("aiApplied", lang));
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 4000, "error");
    } finally {
      if (aiAbortRef.current === ac) {
        aiAbortRef.current = null;
        setAiBusy(false);
        setAiFrameId(null);
      }
    }
  };

  const cancelAi = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiBusy(false);
    setAiFrameId(null);
  };

  useEffect(
    () => () => {
      aiAbortRef.current?.abort();
    },
    [],
  );
  /** a draft taken back: the scenes still being painted for it are not wanted */
  const stopPainting = () => {
    paintAbort.current?.abort();
    setPaintingScene(null);
  };
  return { aiSettings, setAiSettings, updateAiSettings, aiReady, aiBusy, aiFrameId, runAi, cancelAi, canPaint, paintingScene, sceneItem, paintScenes, stopPainting };
}
