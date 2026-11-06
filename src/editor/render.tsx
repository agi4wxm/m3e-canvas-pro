/* What the canvas draws of the document: a run of parts or a free group on its screen, what an instance or a repeat
 * draws on a group, and a screen drawn with plain parts for the PNG export. Pure drawing: everything it reads is given. */

import type { RefObject } from "react";
import { motion } from "motion/react";
import { Doc, Frame, frameLengthOf, frameOfPart, frameSizeOf, GAP, Group, groupBounds, Item, layoutOf, Palette, sizeOf, Theme } from "@/lib/tokens";
import { ComponentNode, StaticPart } from "@/components/ComponentNode";
import { PartView } from "@/components/PartView";
import { outOfPane } from "@/lib/flow";
import { expandDoc, type CanvasView, type DrawnPart } from "@/lib/expand";
import { screenBackground } from "@/lib/styles";
import { roleOf } from "@/parts/role";
import { drawnOpen, GAP_TWEEN, HIDDEN_DIM, INSTANT, OPEN, ROW_DIM, type View } from "./model";
import type { Gap } from "./useGap";

/** what a run on the canvas is drawn with */
export type GroupView = {
  /** groups that reposition without easing on this render */
  instantRef: RefObject<Set<string>>;
  selectedSet: Set<string>;
  /** what the preview starts without, drawn dimmed */
  startsHidden: Set<string>;
  widths: Record<string, number>;
  canvas: CanvasView;
  p: Palette;
  handMode: boolean;
  onItemPointerDown: (e: React.PointerEvent, g: Group, index: number, item: Item) => void;
  view: View;
  gapOut: Gap | null;
  widthShift: { gid: string; dx: number; dy: number } | null;
  pressedId: string | null;
  widthDragId: string | null;
  editDefinition: (id: string) => void;
};

/** what an instance or a repeat draws on a group: it rides along with it and takes no pointer */
export const drawnParts = (parts: DrawnPart[] | undefined, screen?: { w: number; h: number }) =>
  parts?.length ? (
    <div aria-hidden style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none" }}>
      {parts.map((part) => (
        <div key={part.item.id} data-drawn={part.item.id} data-drawn-dim={part.dim ? "" : undefined} style={{ position: "absolute", left: part.dx, top: part.dy, width: "max-content", opacity: part.dim ? ROW_DIM : undefined }}>
          <PartView item={part.item} screen={screen} />
        </div>
      ))}
    </div>
  ) : undefined;

/** One group on the canvas. A free group (or an instance) is drawn part by part where each stands; a run is a flex row
 *  or column, with the hole it keeps for a part being carried in or out of it. */
export function renderGroup(g: Group, ox: number, oy: number, screen: { w: number; h: number } | undefined, v: GroupView) {
  const { instantRef, selectedSet, startsHidden, widths, canvas, p, handMode, onItemPointerDown, view, gapOut, widthShift, pressedId, widthDragId, editDefinition } = v;
  if (g.free) {
    const instantG = instantRef.current.has(g.id);
    const allOn = g.items.every((it) => selectedSet.has(it.id));
    return (
      <motion.div
        key={g.id}
        data-group={g.id}
        initial={false}
        animate={{ x: g.x - ox, y: g.y - oy }}
        transition={instantG ? INSTANT : OPEN}
        /* keep any selection lift inside the group, so canvas-wide layer order is preserved */
        style={{ position: "absolute", left: 0, top: 0, zIndex: drawnOpen(g) ? 1 : undefined, isolation: "isolate", opacity: startsHidden.has(g.id) ? HIDDEN_DIM : undefined }}
      >
        {layoutOf(g, widths).map((pl) => (
          <div key={pl.item.id} style={{ position: "absolute", left: pl.x - g.x, top: pl.y - g.y }}>
            <ComponentNode
              item={canvas.shown.get(pl.item.id) ?? pl.item}
              palette={p}
              widths={widths}
              pressed={false}
              selected={selectedSet.has(pl.item.id)}
              interactive={!handMode}
              onPointerDown={(e) => onItemPointerDown(e, g, pl.index, pl.item)}
              screen={screen}
            />
          </div>
        ))}
        {allOn && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: -6,
              top: -6,
              width: groupBounds(g, widths).r - g.x + 12,
              height: groupBounds(g, widths).b - g.y + 12,
              border: `${1.5 / view.z}px dashed ${p.primary}`,
              borderRadius: 10,
              pointerEvents: "none",
            }}
          />
        )}
      </motion.div>
    );
  }
  const hole = gapOut?.gid === g.id ? gapOut : null;
  /* while the part is in reach the hole follows the magnet with no easing of its own, so the
   * run it sits in never wobbles; the closing is eased, and the run's own offset with it */
  /* a hole is either wanted or not: it opens and closes on one curve rather than tracking the
   * magnet, so a part arriving between two others is seen making room for itself. The run's own
   * offset travels on the same curve, so the parts behind the hole never drift. */
  const phMain = hole && hole.open ? (g.axis === "x" ? hole.w : hole.h) : 0;
  /* a hole at the front is taken off the run's own position, so the parts behind it stay put.
   * What it costs the run is its width plus the run's spacing, and a closed hole costs nothing:
   * it has already taken that spacing off its own margin. */
  const front = hole && hole.index === 0 ? -(phMain + (hole.open ? GAP : 0)) : 0;

  type Cell = { ph: true } | { ph: false; item: Item; index: number };
  const cells: Cell[] = [];
  for (let i = 0; i <= g.items.length; i++) {
    if (hole && hole.index === i) cells.push({ ph: true });
    if (i < g.items.length)
      cells.push({ ph: false, item: g.items[i], index: i });
  }
  const instant = instantRef.current.has(g.id);
  /* A FAB sits in the corner of a screen, and that is the corner it grows out of: the run is
   * drawn hanging from its own bottom right, so a box changing size moves its top and its left
   * and nothing else. Nothing has to be kept in step, because nothing else moves. */
  const corner = g.items.length === 1 && roleOf(g.items[0]) === "fab" ? sizeOf(g.items[0], widths) : null;
  /* The corner is held by the run's own translate rather than by the offset it is animated to.
   * Both halves of it -- the size in pixels and the box's own 100% -- are then settled by the
   * browser in the frame React hands them over in, so a size being dragged cannot leave the
   * drawn box a step behind the offset and make it shiver. */
  const hang = corner ? `calc(${corner.w}px - 100%) calc(${corner.h}px - 100%)` : undefined;

  return (
    <motion.div
      key={g.id}
      data-group={g.id}
      initial={false}
      animate={{
        x: g.x - ox + (g.axis === "x" ? front : 0),
        y: g.y - oy + (g.axis === "y" ? front : 0),
      }}
      transition={instant ? INSTANT : hole ? GAP_TWEEN : OPEN}
      style={{
        zIndex: drawnOpen(g) ? 1 : undefined,
        opacity: startsHidden.has(g.id) ? HIDDEN_DIM : undefined,
        position: "absolute",
        left: 0,
        top: 0,
        marginLeft: widthShift?.gid === g.id ? widthShift.dx : undefined,
        marginTop: widthShift?.gid === g.id ? widthShift.dy : undefined,
        /* hung from its own corner, a FAB changes size without moving that corner */
        translate: hang,
        display: "flex",
        flexDirection: g.axis === "x" ? "row" : "column",
        alignItems: g.axis === "x" ? "center" : "stretch",
        gap: GAP,
        /* keep any selection lift inside the run, so canvas-wide layer order is preserved */
        isolation: "isolate",
      }}
    >
      {cells.map((c) => {
        if (c.ph) {
          /* the hole is moved by the same clock the run's own offset is, and on the same
           * curve: a frame where one has moved and the other has not is a frame where the
           * parts behind the hole appear somewhere they never were */
          return (
            <motion.div
              key="__gap"
              /* The hole a part came out of is already the part's size; one a part is arriving
               * into opens from nothing. The run's own spacing sits beside the hole whatever
               * its width, so the hole takes that much off its own margin as it closes: what
               * it costs the run then travels to nothing exactly as the run's offset does. */
              initial={
                hole?.from
                  ? false
                  : g.axis === "x"
                    ? { width: 0, height: hole?.h ?? 0, marginRight: -GAP }
                    : { height: 0, width: hole?.w ?? 0, marginBottom: -GAP }
              }
              animate={
                g.axis === "x"
                  ? { width: phMain, height: hole?.h ?? 0, marginRight: hole?.open ? 0 : -GAP }
                  : { height: phMain, width: hole?.w ?? 0, marginBottom: hole?.open ? 0 : -GAP }
              }
              transition={GAP_TWEEN}
              style={{ flex: "0 0 auto" }}
            />
          );
        }
        return (
          <ComponentNode
            key={c.item.id}
            item={canvas.shown.get(c.item.id) ?? c.item}
            palette={p}
            widths={widths}
            pressed={pressedId === c.item.id}
            selected={selectedSet.has(c.item.id)}
            instant={widthDragId === c.item.id}
            interactive={!handMode}
            onPointerDown={(e) => onItemPointerDown(e, g, c.index, c.item)}
            onDoubleClick={g.instanceOf ? () => g.instanceOf && editDefinition(g.instanceOf) : undefined}
            screen={screen}
          >
            {drawnParts(canvas.drawn.get(g.id), screen)}
          </ComponentNode>
        );
      })}
    </motion.div>
  );
}

/** the runs of one screen drawn with plain divs: the export layer */
export function renderExport(f: Frame, { doc, widths, frames, p, theme }: { doc: Doc; widths: Record<string, number>; frames: Frame[]; p: Palette; theme: Theme }) {
  const all = expandDoc(doc, widths).groups;
  const off = outOfPane(all, widths);
  const gs = all.filter((g) => frameOfPart(g, all, frames, widths)?.id === f.id && !off.has(g.id));
  const { w } = frameSizeOf(f);
  const h = frameLengthOf(f);
  return (
    <div
      data-export={f.id}
      style={{
        position: "relative",
        width: w,
        height: h,
        background: screenBackground(p[f.bg ?? "surface"], theme),
        overflow: "hidden",
      }}
    >
      {gs.map((g) =>
        g.free ? (
          layoutOf(g, widths).map((pl) => (
            <div key={pl.item.id} style={{ position: "absolute", left: pl.x - f.x, top: pl.y - f.y }}>
              <StaticPart item={pl.item} screen={{ w, h }} />
            </div>
          ))
        ) : (
        <div
          key={g.id}
          style={{
            position: "absolute",
            left: g.x - f.x,
            top: g.y - f.y,
            display: "flex",
            flexDirection: g.axis === "x" ? "row" : "column",
            alignItems: g.axis === "x" ? "center" : "stretch",
            gap: GAP,
          }}
        >
          {g.items.map((it) => (
            <StaticPart key={it.id} item={it} screen={{ w, h }} />
          ))}
        </div>
        ),
      )}
    </div>
  );
}
