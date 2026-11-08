import { ScrollView, View } from "@tarojs/components";
import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";

import { Held, type PartBase } from "../atoms/basics";
import { buttonColors, inkCss } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { flowStyle, NoFill, useFill, type FlowProps } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Surface } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";

/* The layout parts after the plain container and the split view: an accordion, what folds away (a collapsible), what
 * scrolls in a box of its own, a box of a set shape, a stack of layers, a grid, a dock of tabs, the pane beside the main
 * one and the box that stands for a component the author will write. The ones the canvas lets hold parts (grid, dock,
 * supporting pane, custom component) lay them out under their own header as their auto layout says, as the placeholder
 * did; what is open, chosen or folded is the part's prop, and a change goes out through a callback (docs/组件规范.md
 * 受控值和草稿). */

/** A value a person changes on the part (a tab chosen, a panel open). With `onChange` given it is controlled: the prop is
 *  the value and a change only goes out. Without it the prop is where a draft starts, and the draft starts over whenever
 *  the prop becomes something else (a variable bound to it, a tap that sets it). */
export function useDraft<T>(given: T, onChange?: (value: T) => void): [T, (value: T) => void] {
  const key = JSON.stringify(given) ?? "";
  const [held, setHeld] = useState({ key, value: given });
  /* the external reset: a different prop throws the draft away (React's "adjust state while rendering") */
  if (held.key !== key) setHeld({ key, value: given });
  const value = onChange || held.key !== key ? given : held.value;
  const set = (next: T) => {
    if (onChange) onChange(next);
    else setHeld((h) => ({ key: h.key, value: next }));
  };
  return [value, set];
}

/** a tap that stops at the view it is on: a button in a part is not a tap on the part */
export const own = (fn: () => void) => (e: { stopPropagation: () => void }) => {
  e.stopPropagation();
  fn();
};

/** a button that opens or shuts something, or moves on: the kit's button colors */
export function TriggerButton({ label, variant = "tonal", wide, onPress, onLongPress }: { label?: string; variant?: string; /** as wide as what it stands in */ wide?: boolean; onPress?: () => void; onLongPress?: () => void }) {
  const kit = useKit();
  const look = buttonColors(kit, variant);
  return (
    <View
      ariaRole="button"
      ariaLabel={label}
      hoverClass="m3e-pressed"
      onClick={own(() => onPress?.())}
      onLongPress={onLongPress ? own(onLongPress) : undefined}
      style={sx(ROW, { height: 40, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", justifyContent: "center", borderRadius: controlRadius(kit, 40), alignSelf: wide ? "stretch" : "flex-start", flexShrink: 0 }, look.box)}
    >
      <Words text={label} lines={1} style={merge(typeStyle(kit, "label-large"), { color: inkCss(look.ink) }, look.weight ? { fontWeight: look.weight } : null)} />
    </View>
  );
}

/** whether a part was handed parts to lay out */
const laidOut = (children: ReactNode) => Children.toArray(children).length > 0;

/** a holder's own size on each axis it does not hug, and what the layout around asks of it */
function sizeOf(p: FlowProps & { width?: number; height?: number }, fill: CSS, empty: boolean): CSS {
  const out: CSS = {};
  if ((empty || !p.hugWidth) && fill.width === undefined) out.width = p.width;
  if ((empty || !p.hugHeight) && fill.flexGrow === undefined) out.height = p.height;
  return { ...out, ...fill };
}

/** the body a holder lays its parts out in, under its header: its auto layout, taking the room left */
function Body({ p, children }: { p: FlowProps; children?: ReactNode }) {
  return (
    <View style={sx(flowStyle(p), { flexGrow: 1, flexShrink: 1, minHeight: 0 })}>
      <Held>{children}</Held>
    </View>
  );
}

/* ---------- an accordion ---------- */

/** the panels open after a tap on one: it opens or shuts, and alone unless several may be open at once */
export const toggledOpen = (open: number[], i: number, multiple: boolean): number[] => (open.includes(i) ? open.filter((x) => x !== i) : multiple ? [...open, i] : [i]);

export type AccordionProps = PartBase & { items?: ListRow[]; content?: string; openFirst?: boolean; multiple?: boolean; width?: number; open?: number[]; onOpenChange?: (open: number[]) => void };

/** rows that each open on a panel of words under them */
export function Accordion(props: AccordionProps) {
  const p = withDefaults<AccordionProps>("accordion", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useDraft(p.open ?? (p.openFirst ? [0] : []), p.onOpenChange);
  const items = p.items ?? [];
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 360) }, fill)} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const on = open.includes(i);
        return (
          <View key={i} style={sx({ borderBottom: `1px solid ${c("outline-variant")}` })}>
            <View ariaRole="button" ariaLabel={it.label} ariaSelected={on} hoverClass="m3e-pressed" onClick={own(() => setOpen(toggledOpen(open, i, !!p.multiple)))} style={sx(ROW, { minHeight: 56, columnGap: 12 })}>
              <Words text={it.label} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface"), flex: 1 }} />
              <Glyph name={on ? "expand_less" : "expand_more"} size={24} color="on-surface-variant" />
            </View>
            {on && p.content ? <Words text={p.content} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), paddingBottom: 16 }} /> : null}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a collapsible ---------- */

export type CollapsibleProps = PartBase & { trigger?: string; variant?: string; content?: string; open?: boolean; width?: number; onOpenChange?: (open: boolean) => void; children?: ReactNode };

/** a button and what it shows or hides under it */
export function Collapsible(props: CollapsibleProps) {
  const p = withDefaults<CollapsibleProps>("collapsible", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useDraft(!!p.open, p.onOpenChange);
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 256), display: "flex", flexDirection: "column", rowGap: 8 }, fill)} appearance={p} testID={p.testID}>
      <TriggerButton label={p.trigger} variant={p.variant} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={sx({ borderRadius: corner(kit, "sm"), backgroundColor: c("surface-container"), padding: 12 })}>
          {laidOut(p.children) ? <NoFill>{p.children}</NoFill> : <Words text={p.content} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />}
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- a scroll area ---------- */

export type ScrollAreaProps = PartBase & { scrollbars?: "vertical" | "horizontal" | "both"; label?: string; count?: number; width?: number; height?: number; children?: ReactNode };

/** a box of its own size whose rows scroll inside it: down, across or both */
export function ScrollArea(props: ScrollAreaProps) {
  const p = withDefaults<ScrollAreaProps>("scroll-area", props);
  const kit = useKit();
  const fill = useFill();
  const across = p.scrollbars === "horizontal";
  const both = p.scrollbars === "both";
  const rows = Array.from({ length: clampInt(p.count ?? 30, 1, 100) }, (_, i) => <Words key={i} text={`${p.label ?? ""} ${i + 1}`} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface"), whiteSpace: "nowrap", flexShrink: 0 }} />);
  const inner: CSS = { padding: 16, display: across ? "inline-flex" : "flex", flexDirection: across ? "row" : "column", columnGap: 16, rowGap: 8, boxSizing: "border-box", width: across || both ? "max-content" : undefined };
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 256), height: Math.round(p.height ?? 192), border: `1px solid ${c("outline-variant")}`, borderRadius: corner(kit, "xs") + 2, overflow: "hidden" }, fill)} appearance={p} testID={p.testID}>
      <ScrollView scrollX={across || both} scrollY={!across} style={sx({ width: "100%", height: "100%" })}>
        <View style={sx(inner)}>{laidOut(p.children) ? <NoFill>{p.children}</NoFill> : rows}</View>
      </ScrollView>
    </Surface>
  );
}

/* ---------- an aspect ratio ---------- */

const RATIOS: Record<string, number> = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1, "3:4": 3 / 4, "21:9": 21 / 9 };

/** width over height of one of the part's ratios, 16:9 for one it does not know */
export const ratioOf = (ratio: string | undefined): number => RATIOS[ratio ?? ""] ?? 16 / 9;

export type AspectRatioProps = PartBase & { ratio?: string; label?: string; width?: number; children?: ReactNode };

/** a box as tall as its width says at its ratio */
export function AspectRatio(props: AspectRatioProps) {
  const p = withDefaults<AspectRatioProps>("aspect-ratio", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 288);
  const ratio = ratioOf(p.ratio);
  /* filling its cell it keeps its ratio over the width it is given */
  const size: CSS = fill.width !== undefined ? { width: "100%", aspectRatio: `${ratio}` } : { width: w, height: Math.round(w / ratio) };
  return (
    <Surface base={merge(size, { borderRadius: corner(kit, "sm"), backgroundColor: c("tertiary-container"), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }, fill.alignSelf ? { alignSelf: fill.alignSelf } : null)} appearance={p} testID={p.testID}>
      {laidOut(p.children) ? <NoFill>{p.children}</NoFill> : <Words text={p.label} style={{ ...typeStyle(kit, "title-large"), color: c("on-tertiary-container") }} />}
    </Surface>
  );
}

/* ---------- a stack ---------- */

export type StackProps = PartBase & { label?: string; note?: string; width?: number; height?: number };

/** Layers one over another, the front one naming the stack. What the author puts on it stands on the screen over it
 *  (a stack has no auto layout of its own), as on the canvas. */
export function Stack(props: StackProps) {
  const p = withDefaults<StackProps>("stack", props);
  const kit = useKit();
  const fill = useFill();
  const layer = (x: number, t: number, b: number, ground: string, extra?: CSS) => sx({ position: "absolute", left: x, right: x, top: t, bottom: b, borderRadius: corner(kit, "sm"), backgroundColor: c(ground), boxSizing: "border-box" }, extra);
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 200), backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <View style={layer(32, 16, 40, "surface-container-high")} />
      <View style={layer(20, 28, 28, "surface-container-highest")} />
      <View style={layer(8, 40, 8, "surface-bright", { border: `1px solid ${c("outline-variant")}`, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 12 })}>
        <Words text={p.label} lines={1} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
        {p.note ? <Words text={p.note} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      </View>
    </Surface>
  );
}

/* ---------- a grid ---------- */

/** The height the canvas gives each row of a grid that says how many rows it has: what is left of its height under its
 *  padding and header, shared among the rows past the gaps between them. */
export function gridRowHeight(height: number, padTop: number, padBottom: number, header: boolean, rows: number, gapY: number): number {
  const n = Math.max(1, Math.round(rows));
  return Math.max(0, (height - padTop - padBottom - (header ? 28 : 0) - gapY * (n - 1)) / n);
}

export type GridViewProps = PartBase & FlowProps & { label?: string; note?: string; rows?: number; width?: number; height?: number; children?: ReactNode };

/** A grid: its name over cells in columns. Holding parts it lays them out a cell each; empty, it shows its cells. */
export function GridView(props: GridViewProps) {
  const p = withDefaults<GridViewProps>("grid-view", props);
  const kit = useKit();
  const fill = useFill();
  const held = laidOut(p.children);
  const columns = clampInt(p.columns ?? 2, 1, 12);
  const rows = clampInt(p.rows ?? 2, 1, 12);
  const gap = Math.round(p.gap ?? 8);
  const gapY = Math.round(p.gapY ?? gap);
  const pad = flowStyle({ ...p, layout: "free" });
  const header = !!(p.label || p.note);
  const h = Math.round(p.height ?? 280);
  const rowHeight = !p.hugHeight && fill.flexGrow === undefined ? gridRowHeight(h, Number(pad.paddingTop ?? 0), Number(pad.paddingBottom ?? 0), header, rows, gapY) : undefined;
  /* the web view's own grid: columns shared out, each row as tall as the canvas gives it */
  const grid = sx(flowStyle({ ...p, layout: "grid", columns, padX: 0, padY: 0, padTop: 0, padRight: 0, padBottom: 0, padLeft: 0 }), rowHeight !== undefined ? { gridAutoRows: `${rowHeight}px` } : null);
  return (
    <Surface base={merge(pad, { position: "relative", display: "flex", flexDirection: "column", rowGap: 8, backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden", flexShrink: 0 }, sizeOf({ ...p, width: Math.round(p.width ?? 380), height: h }, fill, !held))} appearance={p} testID={p.testID}>
      {header ? (
        <View style={sx(ROW, { height: 20, alignItems: "baseline", columnGap: 8 })}>
          <Words text={p.label} lines={1} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
          <Words text={p.note} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} />
        </View>
      ) : null}
      {held ? (
        <View style={grid}>
          <Held>{p.children}</Held>
        </View>
      ) : (
        <View style={sx({ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, columnGap: gap, rowGap: gapY, flexGrow: 1, minHeight: 0 })}>
          {Array.from({ length: columns * rows }, (_, i) => (
            <View key={i} style={sx({ borderRadius: corner(kit, "sm"), backgroundColor: c("surface-container-high") })} />
          ))}
        </View>
      )}
    </Surface>
  );
}

/* ---------- a dock ---------- */

/** What one tab of a dock holds, as the printer hands it over: the dock shows the tab that is chosen. */
export function DockPane({ children }: { pane: number; children?: ReactNode }) {
  return <>{children}</>;
}

/** the parts a dock shows on a tab: what that tab's pane holds, and whatever stands in no pane */
export function onPane(children: ReactNode, pane: number): ReactNode[] {
  return Children.toArray(children).flatMap((child) => (isValidElement(child) && child.type === DockPane ? ((child as ReactElement<{ pane: number }>).props.pane === pane ? Children.toArray((child as ReactElement<{ children?: ReactNode }>).props.children) : []) : [child]));
}

export type DockProps = PartBase & FlowProps & { items?: ListRow[]; selected?: number; width?: number; height?: number; onChange?: (index: number) => void; children?: ReactNode };

/** A dock: a row of tabs over a body. A tap chooses a tab, which shows what that tab holds, then runs what it is wired to. */
export function Dock(props: DockProps) {
  const p = withDefaults<DockProps>("dock", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const shown = onPane(p.children, chosen);
  return (
    <Surface base={merge({ display: "flex", flexDirection: "column", backgroundColor: c("surface"), borderRadius: corner(kit, "sm"), overflow: "hidden", flexShrink: 0 }, sizeOf({ ...p, width: Math.round(p.width ?? 640), height: Math.round(p.height ?? 360) }, fill, !shown.length))} appearance={p} testID={p.testID}>
      <View ariaRole="tablist" style={sx(ROW, { height: 40, alignItems: "stretch", flexShrink: 0, backgroundColor: c("surface-container"), borderBottom: `1px solid ${c("outline-variant")}`, boxSizing: "border-box", overflow: "hidden" })}>
        {items.map((it, i) => {
          const on = i === chosen;
          return (
            <View
              key={i}
              ariaRole="tab"
              ariaLabel={it.label}
              ariaSelected={on}
              hoverClass="m3e-pressed"
              onClick={own(() => {
                setChosen(i);
                tapOf(p, `tab:${i}`)?.();
              })}
              style={sx(ROW, { paddingLeft: 12, paddingRight: 12, flexShrink: 0, boxSizing: "border-box", borderBottom: `2px solid ${on ? c("primary") : "transparent"}`, backgroundColor: on ? c("surface") : "transparent" })}
            >
              <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c(on ? "on-surface" : "on-surface-variant") }} />
            </View>
          );
        })}
      </View>
      <Body p={p}>{shown}</Body>
    </Surface>
  );
}

/* ---------- a supporting pane ---------- */

export type SupportingPaneProps = PartBase & FlowProps & { label?: string; note?: string; icon?: string; width?: number; height?: number; children?: ReactNode };

/** the pane beside the main one: an icon and a title, a line about what is selected, and what it holds under them */
export function SupportingPane(props: SupportingPaneProps) {
  const p = withDefaults<SupportingPaneProps>("supporting-pane", props);
  const kit = useKit();
  const fill = useFill();
  const held = laidOut(p.children);
  return (
    <Surface base={merge({ display: "flex", flexDirection: "column", backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "xl"), overflow: "hidden", flexShrink: 0 }, sizeOf({ ...p, width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 480) }, fill, !held))} appearance={p} testID={p.testID}>
      {/* the header takes what the canvas keeps clear above the parts (`flow.inset`): 48, or 96 with the line */}
      <View style={sx({ height: p.note ? 96 : 48, flexShrink: 0, paddingTop: 20, paddingLeft: 20, paddingRight: 20, boxSizing: "border-box", display: "flex", flexDirection: "column", rowGap: 8 })}>
        <View style={sx(ROW, { height: 28, columnGap: 8 })}>
          {p.icon ? <Glyph name={p.icon} size={20} color="on-surface" /> : null}
          <Words text={p.label} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} />
        </View>
        {p.note ? <Words text={p.note} lines={2} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), height: 40 }} /> : null}
      </View>
      <Body p={p}>{p.children}</Body>
    </Surface>
  );
}

/* ---------- a custom component ---------- */

export type CustomComponentProps = PartBase & FlowProps & { name?: string; description?: string; width?: number; height?: number; children?: ReactNode };

/** Where a component the author writes goes: a dashed box that says what it is, and what is laid out in it. */
export function CustomComponent(props: CustomComponentProps) {
  const p = withDefaults<CustomComponentProps>("custom", props);
  const kit = useKit();
  const fill = useFill();
  const held = laidOut(p.children);
  return (
    <Surface base={merge({ display: "flex", flexDirection: "column", border: `2px dashed ${c("primary")}`, backgroundColor: ca("primary-container", 0.3), borderRadius: corner(kit, "md"), overflow: "hidden", flexShrink: 0 }, sizeOf({ ...p, width: Math.round(p.width ?? 320), height: Math.round(p.height ?? 160) }, fill, !held))} appearance={p} testID={p.testID}>
      {/* the header takes what the canvas keeps clear above the parts: 32, or 56 with the description */}
      <View style={sx({ height: p.description ? 56 : 32, flexShrink: 0, paddingTop: 10, paddingLeft: 10, paddingRight: 10, boxSizing: "border-box", display: "flex", flexDirection: "column", rowGap: 4 })}>
        <View style={sx(ROW, { columnGap: 4 })}>
          <Glyph name="extension" size={16} color="on-surface" />
          <Words text={p.name} lines={1} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
        </View>
        {p.description ? <Words text={p.description} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      </View>
      <Body p={p}>{p.children}</Body>
    </Surface>
  );
}
