import { Children, useState, type ReactNode } from "react";
import { PanResponder, Pressable, ScrollView, Text as RNText, View, type AccessibilityActionEvent, type GestureResponderEvent, type PanResponderGestureState, type ViewStyle } from "react-native";

import { Held, heldLayout, type PartBase } from "../atoms/basics";
import { withField, type FieldProps } from "../field";
import { Glyph } from "../icons/Icon";
import { useFill, type FlowProps } from "../layout";
import { withDefaults, type ListRow } from "../parts";
import { Popup } from "../picker";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { keysOf, tableOf, useDraft, type TableData } from "./data";

/* Lists that do more than show rows (a strip of states, rows to reorder, a row with an action under it, files) and the
 * parts of desktop software (a menu bar, a tree of rows, a window, a diff), drawn as the canvas draws them
 * (parts/defs/additions.ts, desktop.ts, menus.ts, app.ts and parts/widgets). An order or a row's open action is the
 * visitor's (a value from props, handed out as it changes); which rows there are, and which file is open, are the
 * data's: a remove button only asks (`remove:N`), and the row goes when the data says so. Dragging has its alternative
 * for a screen reader (the rows' "Move up" and "Move down", the swiped row's "Activate"). */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";
const SOFT = 0.7;
/** a control of the part's own that nothing is wired to: pressing it is no press of the whole part */
const noop = () => {};

/** A value the visitor changes: given `onChange`, the prop is the value (a variable, a form's field holds it) and a
 *  change only goes out; without, a draft that starts at the prop and starts over when it changes. */
export function useValue<T>(given: T, onChange: ((v: T) => void) | undefined): [T, (v: T) => void] {
  const [draft, setDraft] = useDraft(given);
  return [onChange ? given : draft, (v: T) => (onChange ? onChange(v) : setDraft(v))];
}

/* ---------- a strip of states ---------- */

const TRACK: Record<string, string> = { ok: "primary", warn: "tertiary", bad: "error", none: "surface-container-highest" };

export type TrackerProps = PartBase & { title?: string; states?: string; width?: number };

/** what stood each day (or hour): a bar per state, in the accent while all is well, the tertiary on a warning, the error
 *  color when it was down, and empty where nothing is known */
export function Tracker(props: TrackerProps) {
  const p = withDefaults<TrackerProps>("tracker", props);
  const kit = useKit();
  const fill = useFill();
  const states = String(p.states ?? "").split(",").map((s) => s.trim());
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), rowGap: 8, ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.title}</RNText> : null}
      <View accessible accessibilityRole="image" accessibilityLabel={`${p.title ?? ""} ${states.join(", ")}`.trim()} style={{ flexDirection: "row", height: 32, columnGap: 4 }}>
        {states.map((s, i) => (
          <View key={i} testID={`tracker-${TRACK[s] ? s : "none"}`} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, TRACK[s] ?? TRACK.none) }} />
        ))}
      </View>
    </Surface>
  );
}

/* ---------- rows to reorder ---------- */

/** a list moved: the row at `from` taken out and put at `to` (both kept inside the list), or the list as it was */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** a row and the gap under it: what a finger's travel is counted in */
const ROW = 52;

/** a list input's rows as their words: rows, words, or words one a line (as the kit's tag input reads its tags) */
export const rowWords = (items: unknown): string[] =>
  Array.isArray(items) ? items.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as { label?: unknown }).label ?? "") : String(x ?? ""))) : String(items ?? "").split("\n").filter((w) => w.trim());

export type SortableListProps = PartBase &
  FieldProps & {
    /** the rows: rows, words, or words one a line */
    items?: (ListRow | string)[] | string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** the rows' words in their new order, after each move (a form's field or a variable holds them, as a tag input's) */
    onChange?: (items: string[]) => void;
    /** each move on its own: from where to where */
    onReorder?: (e: { from: number; to: number }) => void;
  };

/** An order the visitor enters: the rows' words in the order shown are the value, handed out on every move (`onChange`,
 *  as the kit's tag input hands out its tags), each move also sent on its own (`onReorder`). A finger drags a row by its
 *  handle; a screen reader moves the row it is on up or down. */
export function SortableList(props: SortableListProps) {
  const p = withDefaults<SortableListProps>("sortable-list", props);
  const kit = useKit();
  const fill = useFill();
  const [order, setOrder] = useValue(rowWords(p.items), p.onChange);
  /* two rows with the same words keep apart: each is its words and which of the rows saying them it is */
  const keys = keysOf(order);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const held = !!p.disabled || !!p.readOnly;
  const move = (from: number, to: number) => {
    const next = moved(order, from, to);
    if (held || next.every((r, i) => r === order[i])) return;
    setOrder(next);
    p.onReorder?.({ from, to });
  };
  const target = (from: number, dy: number) => Math.max(0, Math.min(order.length - 1, from + Math.round(dy / ROW)));
  const handle = (i: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !held,
      onMoveShouldSetPanResponder: () => !held,
      onPanResponderGrant: () => setDrag({ from: i, dy: 0 }),
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => setDrag({ from: i, dy: g.dy }),
      onPanResponderRelease: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        setDrag(null);
        move(i, target(i, g.dy));
      },
      onPanResponderTerminate: () => setDrag(null),
    });
  const onAction = (i: number) => (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "moveUp") move(i, i - 1);
    else if (e.nativeEvent.actionName === "moveDown") move(i, i + 1);
  };
  return withField(
    p,
    <View testID={p.testID} accessibilityRole="list" accessibilityLabel={p.ariaLabel || undefined} accessibilityState={{ disabled: !!p.disabled }} style={{ width: Math.round(p.width ?? 320), rowGap: 4, opacity: p.disabled ? 0.38 : 1, ...fill }}>
      {order.map((row, i) => {
        const dragged = drag?.from === i;
        return (
          <View
            key={keys[i]}
            accessible
            accessibilityLabel={row}
            accessibilityActions={held ? [] : [...(i > 0 ? [{ name: "moveUp", label: "Move up" }] : []), ...(i < order.length - 1 ? [{ name: "moveDown", label: "Move down" }] : [])]}
            onAccessibilityAction={onAction(i)}
            style={{ height: 48, flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, dragged ? "secondary-container" : "surface-container-low"), ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null), ...(dragged ? { transform: [{ translateY: drag!.dy }], zIndex: 1 } : null) }}
          >
            <View testID={`sortable-handle-${i}`} hitSlop={8} {...handle(i).panHandlers}>
              <Glyph name="drag_indicator" size={20} color={c(kit, "on-surface-variant")} />
            </View>
            <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{row}</RNText>
          </View>
        );
      })}
    </View>,
  );
}

/* ---------- a row with an action under it ---------- */

/** how far the face slides to show the action */
const REVEAL = 88;

export type SwipeRowProps = PartBase & {
  title?: string;
  note?: string;
  action?: string;
  open?: boolean;
  width?: number;
  /** whether the action shows, as it changes (a variable holds it) */
  onValueChange?: (open: boolean) => void;
  /** the row was opened or shut */
  onOpen?: (e: { open: boolean }) => void;
};

/** whether a swipe that let go `dx` from where it started (the face at `from`) leaves the row open */
export const swipeOpens = (from: number, dx: number) => Math.min(0, Math.max(-REVEAL, from + dx)) < -REVEAL / 2;

/** A row with an action under it: whether the action shows is `open`, the visitor's (handed out, and sent as `onOpen`,
 *  whenever a swipe opens or shuts it). The action only asks (its place, `action`): the row goes when the data it stands
 *  for goes. A screen reader opens and shuts it by activating the row. */
export function SwipeRow(props: SwipeRowProps) {
  const p = withDefaults<SwipeRowProps>("swipe-row", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useValue(!!p.open, p.onValueChange);
  const [dx, setDx] = useState<number | null>(null);
  const shut = (to: boolean) => {
    if (to === open) return;
    setOpen(to);
    p.onOpen?.({ open: to });
  };
  const from = open ? -REVEAL : 0;
  const pan = PanResponder.create({
    /* only a sideways swipe: an up or down one is the screen's scroll */
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_e, g) => setDx(Math.min(0, Math.max(-REVEAL, from + g.dx))),
    onPanResponderRelease: (_e, g) => {
      setDx(null);
      shut(swipeOpens(from, g.dx));
    },
    onPanResponderTerminate: () => setDx(null),
  });
  const at = dx ?? from;
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c(kit, "error-container"), ...fill }} testID={p.testID}>
      <View accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: REVEAL, alignItems: "center", justifyContent: "center" }}>
        {p.action ? (
          <Pressable accessibilityRole="button" onPress={tapOf(p, "action")} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: "center" }}>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-error-container") }}>{p.action}</RNText>
          </Pressable>
        ) : null}
      </View>
      {/* the finger's swipe is the face's; what a screen reader reaches is the row's words inside it */}
      <View {...pan.panHandlers}>
        <Surface base={{ padding: 12, rowGap: 2, backgroundColor: c(kit, "surface-container-low"), transform: [{ translateX: at }] }} appearance={p}>
          <View
            testID={p.testID ? `${p.testID}-face` : "swipe-row-face"}
            accessible
            accessibilityLabel={p.title}
            accessibilityState={{ expanded: open }}
            accessibilityActions={[{ name: "activate" }]}
            onAccessibilityAction={(e) => e.nativeEvent.actionName === "activate" && shut(!open)}
          >
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{p.title}</RNText>
            {p.note ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{p.note}</RNText> : null}
          </View>
        </Surface>
      </View>
    </Surface>
  );
}

/* ---------- files ---------- */

const KIND_ICONS: Record<string, string> = { pdf: "picture_as_pdf", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", zip: "folder_zip", rar: "folder_zip", mp4: "movie", mov: "movie", mp3: "audio_file", wav: "audio_file", xls: "table_chart", xlsx: "table_chart", csv: "table_chart" };

/** the icon of a file, from its extension; a name without one is a folder */
export const fileIcon = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (KIND_ICONS[name.slice(dot + 1).toLowerCase()] ?? "description") : "folder";
};

export type FileListProps = PartBase & {
  data?: TableData;
  removable?: boolean;
  selected?: number;
  width?: number;
  /** a row was tapped: the place whoever draws the list moves `selected` to */
  onSelect?: (index: number) => void;
};

/** Files, each with its kind's icon, its size and date. The open one is `selected`, which whoever draws the list moves
 *  (`onSelect` says which was tapped); which files there are is the data's: a remove button (`remove:N`) only asks, and
 *  does nothing of itself when nothing is wired to it. */
export function FileList(props: FileListProps) {
  const p = withDefaults<FileListProps>("file-list", props);
  const kit = useKit();
  const fill = useFill();
  const rows = tableOf(p.data).rows;
  const on = Math.round(p.selected ?? -1);
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 8, rowGap: 2, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      {rows.map((r, i) => {
        const here = i === on;
        const ink = c(kit, here ? "on-secondary-container" : "on-surface");
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", columnGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: here ? c(kit, "secondary-container") : undefined }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={r[0] ?? ""}
              accessibilityState={{ selected: here }}
              onPress={() => {
                p.onSelect?.(i);
                tapOf(p, `tab:${i}`)?.();
              }}
              style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", columnGap: 12, padding: 8 }}
            >
              <Glyph name={fileIcon(r[0] ?? "")} size={24} color={ink} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: ink }}>{r[0] ?? ""}</RNText>
                <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-small"), color: ink, opacity: SOFT }}>{[r[1], r[2]].filter(Boolean).join(" · ")}</RNText>
              </View>
            </Pressable>
            {p.removable ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r[0] || i + 1}`} onPress={p.taps?.[`remove:${i}`] ?? noop} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
                <Glyph name="delete" size={24} color={ink} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a menu bar ---------- */

export type MenubarProps = PartBase & { menus?: ListRow[]; items?: ListRow[] };

/** The menus along a bar, as the canvas shows them; a tap on one opens its items over the screen (the kit's popup, as
 *  its menu does), and a tap on an item runs what that item is wired to (`tab:N`, the same in every menu). */
export function Menubar(props: MenubarProps) {
  const p = withDefaults<MenubarProps>("menubar", props);
  const kit = useKit();
  const [open, setOpen] = useState(-1);
  const menus = p.menus ?? [];
  const items = p.items ?? [];
  const run = (i: number) => {
    setOpen(-1);
    tapOf(p, `tab:${i}`)?.();
  };
  return (
    <Surface base={{ height: 48, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", columnGap: 4, padding: 4, borderRadius: 24, backgroundColor: c(kit, "surface-container") }} appearance={p} testID={p.testID}>
      {menus.map((m, i) => (
        <Pressable key={i} accessibilityRole="button" accessibilityLabel={m.label} accessibilityState={{ expanded: open === i }} onPress={() => setOpen(i)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: "center", backgroundColor: open === i ? c(kit, "secondary-container") : undefined }}>
          <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, open === i ? "on-secondary-container" : "on-surface-variant") }}>{m.label}</RNText>
        </Pressable>
      ))}
      <Popup open={open >= 0} onClose={() => setOpen(-1)}>
        {items.map((it, i) => (
          <Pressable key={i} accessibilityRole="menuitem" accessibilityLabel={it.label} onPress={() => run(i)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
            {it.icon ? <Glyph name={it.icon} size={20} color={c(kit, "on-surface-variant")} /> : null}
            <RNText style={{ flex: 1, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{it.label}</RNText>
          </Pressable>
        ))}
      </Popup>
    </Surface>
  );
}

/* ---------- a tree of rows ---------- */

/** a row's level: two leading spaces make a row one level deeper */
export const depthOf = (label = "") => Math.floor((label.length - label.trimStart().length) / 2);

export type TreeProps = PartBase & {
  items?: ListRow[];
  selected?: number;
  width?: number;
  /** a row was tapped: the place whoever draws the tree moves `selected` to */
  onSelect?: (index: number) => void;
};

/** Rows at their levels, each with its icon: it opens nothing, so it is a list of rows, not a tree to walk. The chosen
 *  row is `selected`, which whoever draws it moves (`onSelect` says which was tapped); a tap runs that row's own. */
export function Tree(props: TreeProps) {
  const p = withDefaults<TreeProps>("tree", props);
  const kit = useKit();
  const fill = useFill();
  const on = Math.round(p.selected ?? 0);
  return (
    <Surface base={{ width: Math.round(p.width ?? 260), rowGap: 2, ...fill }} appearance={p} testID={p.testID}>
      <View accessibilityRole="list">
        {(p.items ?? []).map((row, i) => {
          const here = i === on;
          const ink = c(kit, here ? "on-secondary-container" : "on-surface");
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={row.label.trim()}
              accessibilityState={{ selected: here }}
              accessibilityValue={{ text: `level ${depthOf(row.label) + 1}` }}
              onPress={() => {
                p.onSelect?.(i);
                tapOf(p, `tab:${i}`)?.();
              }}
              style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingVertical: 4, paddingRight: 8, paddingLeft: 8 + depthOf(row.label) * 16, borderRadius: corner(kit, "md"), backgroundColor: here ? c(kit, "secondary-container") : undefined }}
            >
              {row.icon ? <Glyph name={row.icon} size={16} color={ink} /> : null}
              <RNText numberOfLines={1} style={{ flexShrink: 1, ...typeStyle(kit, "body-medium"), color: ink }}>{row.label.trim()}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Surface>
  );
}

/* ---------- a window ---------- */

/** the bar along a window's top, as the title bar part draws it: the Mac's lights, the title, Windows' caption buttons */
function WindowBar({ controls, title }: { controls: string; title?: string }) {
  const kit = useKit();
  const dot: ViewStyle = { width: 12, height: 12, borderRadius: 6, backgroundColor: c(kit, "outline") };
  return (
    <View style={{ height: 36, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 12, backgroundColor: c(kit, "surface-container") }}>
      {controls === "mac" ? (
        <View style={{ flexDirection: "row", columnGap: 8 }}>
          <View style={dot} />
          <View style={dot} />
          <View style={dot} />
        </View>
      ) : null}
      <RNText numberOfLines={1} accessibilityRole="header" style={{ flex: 1, ...typeStyle(kit, "label-large"), color: c(kit, "on-surface"), textAlign: controls === "mac" ? "center" : "left" }}>{title}</RNText>
      {controls === "mac" ? <View style={{ width: 52 }} /> : null}
      {controls === "windows" ? (
        <View style={{ flexDirection: "row", columnGap: 12 }}>
          {["remove", "crop_square", "close"].map((g) => (
            <Glyph key={g} name={g} size={16} color={c(kit, "on-surface-variant")} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type WindowProps = PartBase & FlowProps & { title?: string; controls?: "mac" | "windows" | "none" | string; width?: number; height?: number; children?: ReactNode };

/** A desktop window: its title bar (36 tall, as the editor insets what it holds) and a body laying out the parts in it. */
export function Window(props: WindowProps) {
  const p = withDefaults<WindowProps>("window", props);
  const kit = useKit();
  const fill = useFill();
  const empty = Children.count(p.children) === 0;
  const own = heldLayout({ ...p, layout: "free" }, fill, empty);
  const base: ViewStyle = { width: own.width, height: own.height, ...fill, borderWidth: 1, borderColor: c(kit, "outline-variant"), borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c(kit, "surface") };
  const body = heldLayout({ ...p, hugWidth: true, hugHeight: true }, {});
  return (
    <Surface base={base} appearance={p} testID={p.testID}>
      <WindowBar controls={p.controls ?? "mac"} title={p.title} />
      <View style={{ ...body, flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <Held p={p}>{p.children}</Held>
      </View>
    </Surface>
  );
}

/* ---------- a diff ---------- */

/** a diff's lines as the part reads them: added (+), removed (-), or the same */
export const diffLines = (diff: string) => String(diff ?? "").split("\n").map((line) => ({ line: line || " ", kind: line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "same" }) as const);

const DIFF_ROLES = { added: ["primary-container", "on-primary-container"], removed: ["error-container", "on-error-container"], same: [undefined, "on-surface"] } as const;

export type FileDiffProps = PartBase & { file?: string; diff?: string; width?: number };

/** a file's name over its lines, each added line on the primary container, each removed one on the error container */
export function FileDiff(props: FileDiffProps) {
  const p = withDefaults<FileDiffProps>("file-diff", props);
  const kit = useKit();
  const fill = useFill();
  return (
    <Surface base={{ width: Math.round(p.width ?? 420), borderWidth: 1, borderColor: c(kit, "outline-variant"), borderRadius: corner(kit, "lgi"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {p.file ? <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), backgroundColor: c(kit, "surface-container"), paddingHorizontal: 12, paddingVertical: 8 }}>{p.file}</RNText> : null}
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, flexDirection: "column" }}>
        {diffLines(p.diff ?? "").map((l, i) => (
          <RNText key={i} testID={`diff-${l.kind}`} style={{ fontFamily: "monospace", ...typeStyle(kit, "body-small"), paddingHorizontal: 12, color: c(kit, DIFF_ROLES[l.kind][1]), backgroundColor: DIFF_ROLES[l.kind][0] ? c(kit, DIFF_ROLES[l.kind][0]!) : undefined }}>
            {l.line}
          </RNText>
        ))}
      </ScrollView>
    </Surface>
  );
}
