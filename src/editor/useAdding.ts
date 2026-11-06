/* Parts, kits and instances added without a drag (a tile clicked, Enter on it, the phone's plus button), where the view
 * is looking: on the selected screen or the one in view, clear of what already stands there. A kit is built for the
 * document as it is and lands as its atoms; a composite splits back into them. Each is one undo step. */

import { useRef, type RefObject } from "react";
import { clamp, ComponentDef, Frame, FrameMode, frameLengthOf, frameOfGroup, frameRect, frameSizeOf, Group } from "@/lib/tokens";
import type { NoteAction } from "@/components/Toolbar";
import { canNest } from "@/lib/instances";
import { moveTo, treeSize } from "@/lib/kits";
import { defaultMeasures } from "@/parts/templates/kit";
import { getLang, t } from "@/lib/i18n";
import { ops, type CoreState, type DocStore, type Op, type OpError, type TxOptions } from "@/lib/core";
import { freshPart, freshSize } from "@/lib/core/ops/common";
import { buildKit as buildKitGroups } from "@/lib/core/ops/nodes";
import { FRAME_MARGIN, type DragState, type View } from "./model";

export type AddingInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => R | undefined;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  selectedIds: string[];
  selectedFrameId: string | null;
  canvasRect: () => DOMRect | undefined;
  viewRef: RefObject<View>;
  frameRef: RefObject<FrameMode>;
  framesRef: RefObject<Frame[]>;
  groupsRef: RefObject<Group[]>;
  widthsRef: RefObject<Record<string, number>>;
  mobileRef: RefObject<boolean>;
  defEditRef: { readonly current: CoreState["editing"] };
  componentsRef: RefObject<ComponentDef[] | undefined>;
  itemRects: () => { id: string; l: number; t: number; r: number; b: number }[];
  setRightTab: (tab: "edit" | "prompt") => void;
  setSheet: (sheet: null) => void;
};

export function useAdding({ store, runOp, showToast, selectedIds, selectedFrameId, canvasRect, viewRef, frameRef, framesRef, groupsRef, widthsRef, mobileRef, defEditRef, componentsRef, itemRects, setRightTab, setSheet }: AddingInputs) {
  const selectedFrameIdRef = useRef(selectedFrameId);
  selectedFrameIdRef.current = selectedFrameId;
  /** A kit's groups for the document as it is: in the variant asked for or the one its style calls for,
   *  in the editor's language, no wider than a phone's content. */
  const buildKit = (slug: string, variant: string | undefined, screen: Frame | undefined) => buildKitGroups(store.get(), slug, variant, screen, getLang());

  /** A kit's groups put down with their top left near (x, y): inside the screen under them, brought to
   *  its width, taken into the layout they were let go in (lib/core `add_kit`). Selected as one: the outermost box.
   *  One undo step. */
  const landKit = (kit: NonNullable<DragState["kit"]>, x: number, y: number) => {
    if (!runOp(ops.addKit, { slug: kit.slug, variant: kit.variant, at: { x, y }, built: kit.groups }, { history: "step" })) return;
    setRightTab("edit");
    setSheet(null);
  };

  /** Where a part or a kit chosen without a drag lands: on the selected screen (or the one the selection is on) while it is
   *  in view, else on the screen under the middle of the view, else on the nearest screen in view; on a phone, the screen
   *  shown. The spot is the middle of the view brought onto that screen, so nothing lands in the gap between two. */
  const landingSpot = (): { f: Frame | undefined; cx: number; cy: number } => {
    const r = canvasRect();
    const v = viewRef.current;
    const w = r?.width ?? 0;
    const h = r?.height ?? 0;
    let cx = (w / 2 - v.x) / v.z;
    let cy = (h / 2 - v.y) / v.z;
    /* screens are hidden on a blank canvas */
    if (frameRef.current !== "phone") return { f: undefined, cx, cy };
    const frames = framesRef.current;
    const holds = (fr: Frame) => {
      const b = frameRect(fr);
      return cx >= b.l && cx <= b.r && cy >= b.t && cy <= b.b;
    };
    const view = { l: -v.x / v.z, t: -v.y / v.z, r: (w - v.x) / v.z, b: (h - v.y) / v.z };
    const seen = frames.filter((fr) => {
      const b = frameRect(fr);
      return b.l < view.r && b.r > view.l && b.t < view.b && b.b > view.t;
    });
    const held = groupsRef.current.find((g) => g.items.some((it) => it.id === selectedIds[0]));
    const chosen = frames.find((fr) => fr.id === selectedFrameIdRef.current) ?? (held ? frameOfGroup(held, frames, widthsRef.current) : undefined);
    const away = (fr: Frame) => {
      const b = frameRect(fr);
      return Math.hypot(Math.max(b.l - cx, 0, cx - b.r), Math.max(b.t - cy, 0, cy - b.b));
    };
    const f = (chosen && seen.includes(chosen) ? chosen : undefined) ?? frames.find(holds) ?? [...seen].sort((a, b) => away(a) - away(b))[0] ?? (mobileRef.current ? frames[0] : undefined);
    if (f && !holds(f)) {
      const b = frameRect(f);
      cx = (b.l + b.r) / 2;
      cy = Math.min(Math.max(cy, b.t), b.b);
    }
    return { f, cx, cy };
  };

  /** A kit chosen without a drag: it lands where the view is looking, as a part does, on the screen in view and below what
   *  already stands at that spot. */
  const addKit = (slug: string, variant?: string) => {
    if (defEditRef.current) return;
    const { f, cx, cy } = landingSpot();
    const groups = buildKit(slug, variant, f ?? framesRef.current[0]);
    if (!groups?.length) return;
    const sz = treeSize(groups);
    let x = cx - sz.w / 2;
    let y = cy - sz.h / 2;
    if (f) {
      const h = frameLengthOf(f);
      const taken = (yy: number) => itemRects().some((o) => o.l < x + sz.w && o.r > x && o.t < yy + sz.h && o.b > yy);
      x = clamp(x, f.x + FRAME_MARGIN, Math.max(f.x + FRAME_MARGIN, f.x + frameSizeOf(f).w - FRAME_MARGIN - sz.w));
      y = clamp(y, f.y + FRAME_MARGIN, Math.max(f.y + FRAME_MARGIN, f.y + h - FRAME_MARGIN - sz.h));
      let tries = 0;
      while (taken(y) && y + sz.h * 2 < f.y + h && tries++ < 12) y += Math.min(sz.h, 120) + 12;
    }
    landKit({ slug, variant, groups: moveTo(groups, { x: 0, y: 0 }), measures: defaultMeasures(groups) }, x, y);
  };
  const addKitRef = useRef(addKit);
  addKitRef.current = addKit;

  /** the selected composite, replaced where it stands by the atoms it is made of. One undo step. */
  const splitSelected = () => {
    const id = selectedIds[0];
    if (!id) return;
    if (!runOp(ops.split, { id }, { history: "step", refused: () => {} })) return;
    showToast(t("splitDone", getLang()));
  };
  /** A palette tile chosen without a pointer, and the phone's plus button, drop a part where
   *  the view is looking, landing as a drop there would. Over a screen it is kept inside it and
   *  nudged down when that spot is already taken; over empty canvas it stays at the centre of
   *  the view, so the new part is always in sight */
  const addPart = (slug: string, instance?: ComponentDef) => {
    const sz = instance ? { w: instance.w, h: instance.h } : freshSize(freshPart(slug));
    /* the selected screen or the one in view, never the gap between two; the phone shows one screen at a time */
    const { f, cx, cy } = landingSpot();
    let x = cx - sz.w / 2;
    let y = cy - sz.h / 2;
    if (f) {
      const { w } = frameSizeOf(f);
      const h = frameLengthOf(f);
      const lx = f.x + Math.min(FRAME_MARGIN, (w - sz.w) / 2);
      const ly = f.y + Math.min(FRAME_MARGIN, (h - sz.h) / 2);
      x = clamp(x, lx, Math.max(lx, f.x + w - FRAME_MARGIN - sz.w));
      y = clamp(y, ly, Math.max(ly, f.y + h - FRAME_MARGIN - sz.h));
      const taken = (yy: number) =>
        itemRects().some((o) => o.l < x + sz.w && o.r > x && o.t < yy + sz.h && o.b > yy);
      let tries = 0;
      while (taken(y) && y + sz.h * 2 < f.y + h && tries++ < 12) y += sz.h + 12;
    }
    /* a scene is its screen's picture: it fills the screen in view, or the one selected, behind everything on it */
    const backdrop = { screen: (framesRef.current.find((fr) => fr.id === selectedFrameIdRef.current) ?? f)?.id, x: cx, y: cy };
    const added = instance
      ? runOp(ops.addInstance, { component: instance.id, at: { x, y } }, { history: "step", refused: (e) => e.code === "refused" && showToast(t("nestRefused", getLang())) })
      : runOp(ops.addPart, { slug, at: { x, y }, seed: true, backdrop }, { history: "step" });
    if (!added) return;
    setRightTab("edit");
    setSheet(null);
  };

  /** a definition added without a drag, where the view is looking */
  const addInstance = (id: string) => {
    const def = componentsRef.current?.find((c) => c.id === id);
    if (!def) return;
    if (!canNest(componentsRef.current, defEditRef.current?.id ?? null, id)) {
      showToast(t("nestRefused", getLang()));
      return;
    }
    addPart("container", def);
  };
  const addPartRef = useRef(addPart);
  addPartRef.current = addPart;
  const addInstanceRef = useRef(addInstance);
  addInstanceRef.current = addInstance;
  return { buildKit, landKit, addKit, addKitRef, splitSelected, addPart, addInstance, addPartRef, addInstanceRef };
}
