import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, ScrollView, Text as RNText, View, type DimensionValue, type ViewStyle } from "react-native";

import { Held, type PartBase } from "../atoms/basics";
import { buttonColors } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { Cell, FillWidth, NoFill, flowStyle, useFill, type CellProps, type FlowProps } from "../layout";
import { withAlpha } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import type { BuildViewStyle } from "../styles";
import { Surface } from "../Surface";
import { controlRadius, corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* The layout parts after the plain container and the split view: what folds away (a collapsible), what scrolls in a box
 * of its own, a box of a set shape, a stack of layers, a grid, a dock of tabs, the pane beside the main one and the box
 * that stands for a component the author will write. The ones the canvas lets hold parts (grid, dock, supporting pane,
 * custom component) lay them out under their own header as their auto layout says, as the placeholder did; what is
 * open, chosen or folded is the part's prop, and a change goes out through a callback (docs/组件规范.md 受控值和草稿). */

export const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

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

/** a button that opens or shuts something: the kit's button colors, with its state told to a screen reader */
export function TriggerButton({ label, variant = "tonal", expanded, wide, onPress }: { label?: string; variant?: string; expanded?: boolean; /** as wide as what it stands in */ wide?: boolean; onPress?: () => void }) {
  const kit = useKit();
  const look = buttonColors(kit, variant);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} style={{ height: 40, paddingHorizontal: 16, borderRadius: controlRadius(kit, 40), flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: wide ? "stretch" : "flex-start", ...look.box }}>
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: look.ink, ...(look.weight ? { fontWeight: look.weight } : null) }}>
        {label}
      </RNText>
    </Pressable>
  );
}

/** the parts a part lays out, in its own body, where the drawn content would be */
const laidOut = (children: ReactNode) => Children.count(children) > 0;

/** a holder's own size on each axis it does not hug, and what the layout around asks of it */
function sizeOf(p: FlowProps & { width?: number; height?: number }, fill: ViewStyle, empty: boolean): ViewStyle {
  const out: BuildViewStyle = {};
  if ((empty || !p.hugWidth) && fill.width === undefined) out.width = p.width as DimensionValue;
  if ((empty || !p.hugHeight) && fill.flexGrow === undefined) out.height = p.height as DimensionValue;
  return { ...out, ...fill };
}

/** the body a holder lays its parts out in, under its header: its auto layout, taking the room left */
function Body({ p, children }: { p: FlowProps; children?: ReactNode }) {
  return (
    <View style={{ ...flowStyle(p), flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
      <Held p={p}>{children}</Held>
    </View>
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
    <Surface base={{ width: Math.round(p.width ?? 256), rowGap: 8, ...fill }} appearance={p} testID={p.testID}>
      <TriggerButton label={p.trigger} variant={p.variant} expanded={open} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "surface-container"), padding: 12 }}>
          {laidOut(p.children) ? <NoFill>{p.children}</NoFill> : <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{p.content}</RNText>}
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
  const h = Math.round(p.height ?? 192);
  const rows = Array.from({ length: clampInt(p.count ?? 30, 1, 100) }, (_, i) => (
    <RNText key={i} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{`${p.label ?? ""} ${i + 1}`}</RNText>
  ));
  const inner: ViewStyle = { padding: 16, ...(across ? { flexDirection: "row", columnGap: 16 } : { rowGap: 8 }) };
  const content = laidOut(p.children) ? <NoFill>{p.children}</NoFill> : rows;
  return (
    <Surface base={{ width: Math.round(p.width ?? 256), height: h, borderWidth: 1, borderColor: c(kit, "outline-variant"), borderRadius: corner(kit, "xs") + 2, overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {both ? (
        <ScrollView horizontal testID={p.testID ? `${p.testID}-across` : undefined}>
          <ScrollView nestedScrollEnabled style={{ height: h }} contentContainerStyle={inner}>
            {content}
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView horizontal={across} contentContainerStyle={inner}>
          {content}
        </ScrollView>
      )}
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
  const size: ViewStyle = fill.width !== undefined ? { width: "100%", aspectRatio: ratio } : { width: w, height: Math.round(w / ratio) };
  return (
    <Surface base={{ ...size, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "tertiary-container"), alignItems: "center", justifyContent: "center", overflow: "hidden" }} style={fill.alignSelf ? { alignSelf: fill.alignSelf } : undefined} appearance={p} testID={p.testID}>
      {laidOut(p.children) ? <NoFill>{p.children}</NoFill> : <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-tertiary-container") }}>{p.label}</RNText>}
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
  const layer = (inset: { x: number; t: number; b: number }, ground: string, extra?: ViewStyle) => ({ position: "absolute" as const, left: inset.x, right: inset.x, top: inset.t, bottom: inset.b, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, ground), ...extra });
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 200), backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <View style={layer({ x: 32, t: 16, b: 40 }, "surface-container-high")} />
      <View style={layer({ x: 20, t: 28, b: 28 }, "surface-container-highest")} />
      <View style={layer({ x: 8, t: 40, b: 8 }, "surface-bright", { borderWidth: 1, borderColor: c(kit, "outline-variant"), justifyContent: "flex-end", padding: 12 })}>
        <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>
          {p.label}
        </RNText>
        {p.note ? (
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>
            {p.note}
          </RNText>
        ) : null}
      </View>
    </Surface>
  );
}

/* ---------- a grid ---------- */

const ALIGN: Record<string, ViewStyle["alignItems"]> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "flex-start" };
const spanOf = (child: ReactNode): number => (isValidElement(child) && child.type === Cell ? Math.max(1, Math.round((child as ReactElement<CellProps>).props.span ?? 1)) : 1);

/** Rows of cells: the grid's columns shared out, each row as tall as the grid's height shared among its rows (as the
 *  canvas lays out a grid that says how many rows it has), a part standing in its cell as the grid aligns it. */
function GridCells({ columns, gap, gapY, align, rowHeight, testID, children }: { columns: number; gap: number; gapY: number; align?: string; rowHeight?: number; testID?: string; children: ReactNode }) {
  const cols = Math.max(1, Math.round(columns));
  const rows: { child: ReactNode; span: number }[][] = [[]];
  let used = 0;
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || child === false) return;
    const span = Math.min(cols, spanOf(child));
    if (used + span > cols) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ child, span });
    used += span;
  });
  const stretch = align === "stretch";
  const at = ALIGN[align ?? "start"] ?? "flex-start";
  return (
    <View style={{ rowGap: gapY }}>
      {rows.map((row, r) => {
        const left = cols - row.reduce((n, x) => n + x.span, 0);
        return (
          <View key={r} testID={testID ? `${testID}-row${r}` : undefined} style={{ flexDirection: "row", columnGap: gap, ...(rowHeight ? { height: rowHeight } : null) }}>
            {row.map((x, i) => (
              <View key={i} style={{ flexGrow: x.span, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: at, justifyContent: stretch ? "flex-start" : (at as ViewStyle["justifyContent"]) }}>
                {stretch ? <FillWidth>{x.child}</FillWidth> : <NoFill>{x.child}</NoFill>}
              </View>
            ))}
            {left > 0 ? <View style={{ flexGrow: left, flexShrink: 1, flexBasis: 0 }} /> : null}
          </View>
        );
      })}
    </View>
  );
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
  /* what the canvas gives each row: the room under the header shared among the rows */
  const inner = h - Number(pad.paddingTop ?? 0) - Number(pad.paddingBottom ?? 0) - (header ? 28 : 0);
  const rowHeight = !p.hugHeight && fill.flexGrow === undefined ? Math.max(0, (inner - gapY * (rows - 1)) / rows) : undefined;
  return (
    <Surface base={{ ...pad, ...sizeOf({ ...p, width: Math.round(p.width ?? 380), height: h }, fill, !held), backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden", rowGap: 8 }} appearance={p} testID={p.testID}>
      {header ? (
        <View style={{ height: 20, flexDirection: "row", alignItems: "baseline", columnGap: 8 }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.label}</RNText>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{p.note}</RNText>
        </View>
      ) : null}
      {held ? (
        <GridCells columns={columns} gap={gap} gapY={gapY} align={p.align} rowHeight={rowHeight} testID={p.testID}>
          {p.children}
        </GridCells>
      ) : (
        <View style={{ flexGrow: 1, rowGap: gapY }}>
          {Array.from({ length: rows }, (_, r) => (
            <View key={r} style={{ flexGrow: 1, flexBasis: 0, flexDirection: "row", columnGap: gap }}>
              {Array.from({ length: columns }, (__, i) => (
                <View key={i} style={{ flexGrow: 1, flexBasis: 0, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "surface-container-high") }} />
              ))}
            </View>
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

export type DockProps = PartBase & FlowProps & { items?: ListRow[]; selected?: number; width?: number; height?: number; onSelect?: (index: number) => void; children?: ReactNode };

/** A dock: a row of tabs over a body. A tap chooses a tab, which shows what that tab holds, then runs what it is wired to. */
export function Dock(props: DockProps) {
  const p = withDefaults<DockProps>("dock", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onSelect);
  const shown = onPane(p.children, chosen);
  return (
    <Surface base={{ ...sizeOf({ ...p, width: Math.round(p.width ?? 640), height: Math.round(p.height ?? 360) }, fill, !shown.length), backgroundColor: c(kit, "surface"), borderRadius: corner(kit, "sm"), overflow: "hidden" }} appearance={p} testID={p.testID}>
      <View accessibilityRole="tablist" style={{ height: 40, flexDirection: "row", alignItems: "stretch", backgroundColor: c(kit, "surface-container"), borderBottomWidth: 1, borderBottomColor: c(kit, "outline-variant") }}>
        {items.map((it, i) => {
          const on = i === chosen;
          return (
            <Pressable
              key={i}
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setChosen(i);
                tapOf(p, `tab:${i}`)?.();
              }}
              style={{ paddingHorizontal: 12, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: on ? c(kit, "primary") : "transparent", backgroundColor: on ? c(kit, "surface") : "transparent" }}
            >
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: c(kit, on ? "on-surface" : "on-surface-variant") }}>
                {it.label}
              </RNText>
            </Pressable>
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
    <Surface base={{ ...sizeOf({ ...p, width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 480) }, fill, !held), backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "xl"), overflow: "hidden" }} appearance={p} testID={p.testID}>
      {/* the header takes what the canvas keeps clear above the parts (`flow.inset`): 48, or 96 with the line */}
      <View style={{ height: p.note ? 96 : 48, paddingTop: 20, paddingHorizontal: 20, rowGap: 8 }}>
        <View style={{ height: 28, flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          {p.icon ? <Glyph name={p.icon} size={20} color={c(kit, "on-surface")} /> : null}
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface"), flexShrink: 1 }}>
            {p.label}
          </RNText>
        </View>
        {p.note ? (
          <RNText numberOfLines={2} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), height: 40 }}>
            {p.note}
          </RNText>
        ) : null}
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
    <Surface base={{ ...sizeOf({ ...p, width: Math.round(p.width ?? 320), height: Math.round(p.height ?? 160) }, fill, !held), borderWidth: 2, borderStyle: "dashed", borderColor: c(kit, "primary"), backgroundColor: withAlpha(c(kit, "primary-container"), 0.3), borderRadius: corner(kit, "md"), overflow: "hidden" }} appearance={p} testID={p.testID}>
      {/* the header takes what the canvas keeps clear above the parts: 32, or 56 with the description */}
      <View style={{ height: p.description ? 56 : 32, paddingTop: 10, paddingHorizontal: 10, rowGap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 4 }}>
          <Glyph name="extension" size={16} color={c(kit, "on-surface")} />
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface"), flexShrink: 1 }}>
            {p.name}
          </RNText>
        </View>
        {p.description ? (
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>
            {p.description}
          </RNText>
        ) : null}
      </View>
      <Body p={p}>{p.children}</Body>
    </Surface>
  );
}
