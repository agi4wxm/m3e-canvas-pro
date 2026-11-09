/* The author's own model at work on the canvas: the settings it is reached with, the one field it writes at a time (a
 * screen's description, a part's behaviour note), and the pictures it paints for scenes. What it writes goes in through
 * the document's operations (lib/core/ops), as one undo step, held to what any edit is held to (a locked part is turned
 * away); the field remembers what it said before (lib/ai `pushHistory`). An answer lands only where it was asked for
 * (aiLanding.ts): if the author edited that field meanwhile it is set aside for them to apply or leave, and if the part
 * or the document is gone it is dropped. */

import { useEffect, useRef, useState } from "react";
import { Doc, Frame, Group, Item, Theme } from "@/lib/tokens";
import { ops, type DocStore, type Op, type OpError, type TxOptions } from "@/lib/core";
import { AiSettings, DEFAULT_AI, generateImage, hasImageKey, hasKey, imageSpec, isSecureUrl, proposeBehavior, proposeDescription, pushHistory, saveAiSettings, scenePrompt } from "@/lib/ai";
import { AiActionKey, aiErrorText } from "@/components/AiPanel";
import type { NoteAction } from "@/components/Toolbar";
import { artOf } from "@/lib/styles";
import { partBySlug, reader } from "@/parts/registry";
import { Lang, t } from "@/lib/i18n";
import { AnswerDesk, partIn, screenIn, type Ticket } from "./aiLanding";

export type AiInputs = {
  store: DocStore;
  lang: Lang;
  theme: Theme;
  /** the document as this render has it */
  doc: Doc;
  groupsRef: { current: Group[] };
  widthsRef: { current: Record<string, number> };
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => boolean;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  showAiNote: (text: string, icon?: string, ms?: number, action?: NoteAction) => void;
};

/** what a scene's picture is painted from, and the picture: an answer lands only while these are as they were */
const SCENE_FIELDS = ["image", "prompt", "style", "width", "height", "motion", "frames", "frameSeconds"];

export function useAi({ store, lang, theme, doc, groupsRef, widthsRef, didOp, showToast, showAiNote }: AiInputs) {
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI);
  const [aiBusy, setAiBusy] = useState(false);
  /** the screen the model is working on, which wears the animated ring meanwhile */
  const [aiFrameId, setAiFrameId] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  /** where the answers may land */
  const desk = useRef<AnswerDesk | null>(null);
  useEffect(() => {
    const d = new AnswerDesk(store);
    desk.current = d;
    return () => {
      d.dispose();
      if (desk.current === d) desk.current = null;
    };
  }, [store]);
  const deskNow = () => (desk.current ??= new AnswerDesk(store));

  /** An answer that found its field edited: the author is told, and may still put it in (what they wrote goes into the
   *  field's history, as any rewrite's does). */
  const setAside = (ticket: Ticket, apply: () => void) =>
    showAiNote(t("aiAnswerAside", lang), "edit_note", 15000, {
      label: t("aiAnswerUse", lang),
      run: () => {
        if (!deskNow().present(ticket)) return showToast(t("aiAnswerGone", lang), 4000);
        deskNow().close(ticket);
        apply();
      },
    });

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
        const ticket = deskNow().take({ kind: "part", id }, (s) => SCENE_FIELDS.map((k) => partIn(s, id)?.props?.[k]));
        const p = reader(def, item.props);
        const moving = p.s("motion") === "animated";
        /* a scene that names no style of its own is painted in the document's */
        const image = await generateImage(aiSettings, scenePrompt(p.s("prompt"), p.s("style").trim() || artOf(look), moving), { w: p.n("width"), h: p.n("height") }, ac.signal, moving ? { frames: Math.round(p.n("frames")), ms: Math.round(p.n("frameSeconds") * 1000) } : undefined);
        if (ac.signal.aborted) return;
        /* the picture belongs to the step that asked for it (a draft, the panel's button): no step of its own */
        const put = () => didOp(ops.setProps, { id, props: { image } }, { history: "none" });
        const where = deskNow().check(ticket);
        if (where === "land") {
          deskNow().close(ticket);
          if (put()) painted++;
        } else if (where === "edited") setAside(ticket, put);
        else deskNow().close(ticket);
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
  /** Writes one field with the model: a part's behavior note, or a screen's description. The result goes in where it
   *  was asked for, if that field is as it was; the field remembers what it said so the rewrite can be undone. */
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
    let ticket: Ticket | null = null;
    /* lands, waits for the author, or goes */
    const land = (apply: () => void) => {
      const where = deskNow().check(ticket!);
      if (where === "land") {
        deskNow().close(ticket!);
        apply();
      } else if (where === "edited") setAside(ticket!, apply);
      else {
        deskNow().close(ticket!);
        if (where === "gone") showToast(t("aiAnswerGone", lang), 4000);
      }
    };
    try {
      if (action === "describe") {
        ticket = deskNow().take({ kind: "screen", id: f.id }, (s) => {
          const x = screenIn(s, f.id);
          return x && [x.note, x.name];
        });
        const r = await proposeDescription(aiSettings, curDoc, widthsRef.current, f, lang, ac.signal);
        if (ac.signal.aborted) return;
        land(() => {
          const x = screenIn(store.get(), f.id);
          if (x && didOp(ops.patchScreen, { id: f.id, patch: { note: r.note, noteHistory: pushHistory(x.noteHistory, x.note), name: r.name ?? x.name } }, { label: "Edit" })) showAiNote(t("aiApplied", lang));
        });
        return;
      }
      if (!itemId) return;
      ticket = deskNow().take({ kind: "part", id: itemId }, (s) => partIn(s, itemId)?.note);
      const note = await proposeBehavior(aiSettings, curDoc, widthsRef.current, f, lang, itemId, ac.signal);
      if (ac.signal.aborted) return;
      if (!note) {
        showToast(t("aiErrorJson", lang));
        return;
      }
      land(() => {
        const it = partIn(store.get(), itemId);
        if (it && didOp(ops.setItem, { id: itemId, patch: { note, noteHistory: pushHistory(it.noteHistory, it.note) } }, { label: "Edit" })) showAiNote(t("aiApplied", lang));
      });
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 4000, "error");
    } finally {
      if (ticket && ac.signal.aborted) deskNow().close(ticket);
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

  /* leaving the editor stops what is still being asked: a field's words and a scene's picture alike */
  useEffect(
    () => () => {
      aiAbortRef.current?.abort();
      paintAbort.current?.abort();
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
