/* A style's layout over the document: putting a style on (its colours, its shapes, its layout), the passes that lay
 * the screens out its way once its parts have been measured in it, a model's draft moved apart once its parts have
 * held their sizes, and a document held to a style's rules laid out again after every change has come to rest. */

import { useEffect, useRef, type RefObject } from "react";
import { Frame, Group, Theme } from "@/lib/tokens";
import type { NoteAction } from "@/components/Toolbar";
import { isStrict, styleOf, styleTextOf, type CustomStyle, type StyleUX } from "@/lib/styles";
import { conformGroups } from "@/lib/styleRules";
import { afterPass, relayoutDue, startRelayout, type Relayout } from "@/lib/relayoutClock";
import { layoutForStyle, metricsOf } from "@/lib/styleLayout";
import { standingTogether } from "@/lib/tidy";
import { pushApart } from "@/lib/settle";
import { getLang, t } from "@/lib/i18n";
import { ops, withFrames, withGroups, type CoreState, type DocStore, type Op, type TxOptions } from "@/lib/core";
import type { DragState, Gesture } from "./model";

type RunOp = <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;

export type StyleLayoutInputs = {
  store: DocStore;
  runOp: RunOp;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string }) => boolean;
  undo: () => void;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  theme: Theme;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  drag: DragState | null;
  gesture: Gesture | null;
  defEdit: CoreState["editing"];
  previewId: string | null;
  groupsRef: RefObject<Group[]>;
  framesRef: RefObject<Frame[]>;
  widthsRef: RefObject<Record<string, number>>;
  themeRef: RefObject<Theme>;
  dragRef: RefObject<DragState | null>;
  gestureRef: RefObject<Gesture | null>;
  /** a model's draft has just arrived, and waits for its parts' sizes to be moved apart */
  settleDraftRef: { current: boolean };
  tidyRef: { current: unknown };
  setGroups: (next: Group[]) => void;
  setFrames: (next: Frame[]) => void;
  setWidths: (next: Record<string, number>) => void;
};

export function useStyleLayout({ store, runOp, didOp, undo, showToast, theme, groups, frames, widths, drag, gesture, defEdit, previewId, groupsRef, framesRef, widthsRef, themeRef, dragRef, gestureRef, settleDraftRef, tidyRef, setGroups, setFrames, setWidths }: StyleLayoutInputs) {
  /* A style is built to other sizes, so the screens are laid out its way once its parts have been measured in it,
   * and once more when what that resized has been measured too. */
  const relayoutRef = useRef<Relayout | null>(null);
  useEffect(() => {
    if (!settleDraftRef.current && !relayoutRef.current) return;
    const id = setTimeout(() => {
      const again = relayoutRef.current;
      if (again) {
        /* the next pass waits only a while: a pass that changed no size is never measured, and nothing would set it off */
        relayoutRef.current = afterPass(again, Date.now());
        const laid = layoutForStyle(groupsRef.current, framesRef.current, widthsRef.current, themeRef.current, { together: again.together, pick: true });
        if (laid) {
          setGroups(laid.groups);
          setFrames(laid.frames);
        }
      }
      if (!settleDraftRef.current) return;
      settleDraftRef.current = false;
      /* a draft in a style is laid out that style's way before what ran together is moved apart */
      const styled = themeRef.current.style || isStrict(themeRef.current) ? layoutForStyle(groupsRef.current, framesRef.current, widthsRef.current, themeRef.current) : null;
      const out = pushApart(styled?.groups ?? groupsRef.current, styled?.frames ?? framesRef.current, widthsRef.current);
      if (out || styled) {
        setGroups(out?.groups ?? styled!.groups);
        setFrames(out?.frames ?? styled!.frames);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [widths]);

  /** Puts a style on the document: its colors, its shapes, and unless the author said not to, its layout. One undo step.
   *  A style is a spec, so what the parts carry against it comes off (lib/core `apply_style`); the author is told how
   *  many parts that touched, and one tap on the notice takes it all back. */
  const applyStyle = (key: string, styles?: CustomStyle[] | null) => {
    /* what stands on what is read now: in the style's sizes a part may grow into the next without being put on it */
    const s = store.get();
    const together = standingTogether(s.doc.groups, s.doc.frames, s.session.widths, metricsOf(s.doc.theme));
    /* with the document's own styles, when they change with the pick: the two are one step */
    const out = runOp(ops.applyStyle, styles === undefined ? { style: key } : { style: key, styles }, { history: "whole" });
    if (!out) return;
    tidyRef.current = null;
    relayoutRef.current = startRelayout(together, Date.now());
    /* nothing may change size, and then nothing else would set it off */
    setWidths({});
    if (!out.stripped) return;
    const step = store.view().history.steps;
    const lang = getLang();
    const pack = styleOf(key);
    showToast(t("styleStripped", lang).replace("{style}", pack ? styleTextOf(pack.name, lang) : "Android").replace("{n}", String(out.stripped)), 8000, "format_paint", {
      label: t("undo", lang),
      /* only while the pick is still the last step: anything done since is what an undo would take back */
      run: () => {
        if (store.view().history.steps === step && !store.canRedo()) undo();
      },
    });
  };
  /** a style card picked: the one already on the document changes nothing, not even what the author made of it */
  const pickStyle = (key: string) => {
    if ((themeRef.current.style ?? "") === key) return;
    applyStyle(key);
  };
  /** holds the document to its style's rules, or lets it go; coming back is putting the style on again. One undo step. */
  const setRules = (on: boolean) => {
    if (on) {
      applyStyle(store.get().doc.theme.style ?? "");
      return;
    }
    runOp(ops.setRules, { on: false }, { history: "whole" });
  };
  /** The document's own styles changed (components/CustomStyleEditor.tsx): a style made, imported, edited or deleted,
   *  and with `pick` a style to put on the document after, which is then the one undo step. A style edited in place is
   *  worn as it now is, and a run of edits to the style worn is one undo step (lib/core `set_custom_styles`). */
  const changeStyles = (next: CustomStyle[] | undefined, pick?: string) => {
    const worn = themeRef.current.style ?? "";
    if (pick !== undefined && worn !== pick) {
      applyStyle(pick, next ?? null);
      return;
    }
    runOp(ops.setStyles, { styles: next ?? null }, { history: { coalesce: `styles:${worn}` } });
  };

  /* Held to a style's rules, nothing stays where the rules would not put it. Whatever just changed, a part dropped, added,
   * removed or resized, or a word that made one wider, the screens are laid out again once it has come to rest, and what
   * a part carries against the rules comes off. It belongs to the change: an undo takes both back. */
  const strictNow = isStrict(theme);
  useEffect(() => {
    if (!strictNow || drag || gesture || defEdit || previewId !== null) return;
    let id: ReturnType<typeof setTimeout>;
    const run = () => {
      if (dragRef.current || gestureRef.current || settleDraftRef.current) return;
      /* a style's own passes go first; one that is not coming is not waited for past its time */
      const due = relayoutRef.current;
      if (relayoutDue(due, Date.now())) {
        id = setTimeout(run, Math.max(50, due.until - Date.now() + 20));
        return;
      }
      relayoutRef.current = null;
      /* nothing has been measured yet: its sizes are coming, and with them this again */
      if (!Object.keys(widthsRef.current).length) return;
      const conformed = conformGroups(groupsRef.current, themeRef.current);
      const laid = layoutForStyle(conformed, framesRef.current, widthsRef.current, themeRef.current);
      if (laid) {
        tidyRef.current = null;
        store.update("Layout", "system", (st) => withFrames(withGroups(st, laid.groups), laid.frames));
      } else if (conformed !== groupsRef.current) store.update("Style rules", "system", (st) => withGroups(st, conformed));
    };
    id = setTimeout(run, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strictNow, theme, groups, frames, widths, drag, gesture, defEdit, previewId]);
  /** lays every screen out by the document's theme, as one undo step */
  const relayout = () => {
    if (didOp(ops.relayout, {}, { history: "step" })) tidyRef.current = null;
  };
  /** One layout setting changed, and the screens follow it: `set_style_layout`, as the agent and MCP change it. The
   *  setting and the layout it brings are one step, which one undo takes back together. */
  const patchUx = (patch: Partial<StyleUX>) => {
    const was = store.get().doc.groups;
    didOp(ops.patchUx, { patch }, { label: "Style layout" });
    if (store.get().doc.groups !== was) tidyRef.current = null;
  };
  return { relayoutRef, applyStyle, pickStyle, setRules, changeStyles, relayout, patchUx };
}
