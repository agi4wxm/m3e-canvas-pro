import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Children, useState, type ReactNode } from "react";

import { Held, heldLayout, type PartBase } from "../atoms/basics";
import { Words } from "../atoms/words";
import { c } from "../color";
import { withField, type FieldProps } from "../field";
import { Glyph } from "../icons";
import { useFill, type FlowProps } from "../layout";
import { withDefaults, type ListRow } from "../parts";
import { Surface, tagOf } from "../Surface";
import { COL, merge, ROW, sx, type CSS } from "../styles";
import { corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";
import { tableOf, useDraft, type TableData } from "./data";

/* Lists that do more than show rows (a strip of states, rows to reorder, a row with an action under it, files) and the
 * parts of desktop software (a menu bar, a tree of rows, a window, a block of code, a diff) in a mini-program, drawn as
 * the canvas draws them (parts/defs/additions.ts, desktop.ts, menus.ts, app.ts and parts/widgets). An order or a row's
 * open action is the visitor's (a value from props, handed out as it changes); which rows there are, and which file is
 * open, are the data's: a remove button only asks (`remove:N`), and the row goes when the data says so. Dragging has
 * a way without it: a tapped row of a sortable list shows arrows that move it, a long press opens a swipe row. */

const SOFT = 0.7;
/** a control of the part's own that nothing is wired to: pressing it is no press of the whole part */
const noop = () => {};

/** A value the visitor changes: given `onChange`, the prop is the value (a variable, a form's field holds it) and a
 *  change only goes out; without, a draft that starts at the prop and starts over when it changes. */
export function useValue<T>(given: T, onChange: ((v: T) => void) | undefined): [T, (v: T) => void] {
  const [draft, setDraft] = useDraft(given);
  return [onChange ? given : draft, (v: T) => (onChange ? onChange(v) : setDraft(v))];
}

/** a press target of the kit's own: a view that runs `onPress` and stops there, with its name for a screen reader */
function Tap({ onPress, label, role = "button", selected, style, children }: { onPress?: () => void; label?: string; role?: string; selected?: boolean; style?: CSS; children?: ReactNode }) {
  return (
    <View ariaRole={role} ariaLabel={label} ariaSelected={selected} hoverClass={onPress ? "m3e-pressed" : "none"} onClick={onPress ? (e) => (e.stopPropagation(), onPress()) : undefined} style={sx({ boxSizing: "border-box" }, style)}>
      {children}
    </View>
  );
}

/** a round button with an icon only, its name for a screen reader */
function IconTap({ icon, label, size = 40, color = "on-surface-variant", disabled, onPress }: { icon: string; label: string; size?: number; color?: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Tap label={label} onPress={disabled ? undefined : onPress} style={{ ...ROW, justifyContent: "center", width: size, height: size, borderRadius: size / 2, flexShrink: 0, opacity: disabled ? 0.38 : 1 }}>
      <Glyph name={icon} size={size >= 40 ? 24 : 20} color={color} />
    </Tap>
  );
}

/** the first touch of a touch event, where it is on the page */
const touchOf = (e: unknown) => (e as { touches?: { clientX: number; clientY: number }[]; changedTouches?: { clientX: number; clientY: number }[] }).touches?.[0] ?? (e as { changedTouches?: { clientX: number; clientY: number }[] }).changedTouches?.[0];

/* ---------- a strip of states ---------- */

/** the role a tracker's state is drawn in: the accent while all is well, the tertiary on a warning, the error color
 *  when it was down, and empty where nothing is known */
export const trackRole = (state: string) => ({ ok: "primary", warn: "tertiary", bad: "error" })[state.trim()] ?? "surface-container-highest";

export type TrackerProps = PartBase & { title?: string; states?: string; width?: number };

export function Tracker(props: TrackerProps) {
  const p = withDefaults<TrackerProps>("tracker", props);
  const kit = useKit();
  const fill = useFill();
  const states = String(p.states ?? "").split(",").map((s) => s.trim());
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 360), rowGap: 8 }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null}
      <View ariaRole="img" ariaLabel={`${p.title ?? ""} ${states.join(", ")}`.trim()} style={sx({ display: "flex", flexDirection: "row", height: 32, columnGap: 4 })}>
        {states.map((s, i) => (
          <View key={i} style={sx({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: corner(kit, "sm"), backgroundColor: c(trackRole(s)) })} />
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
const ROW_STEP = 52;

/** where a row dragged `dy` from `from` lands, among `count` rows */
export const dragTarget = (from: number, dy: number, count: number) => Math.max(0, Math.min(count - 1, from + Math.round(dy / ROW_STEP)));

export type SortableListProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** the rows in their new order, after each move (a form's field or a variable holds them) */
    onChange?: (items: ListRow[]) => void;
    /** each move on its own: from where to where */
    onReorder?: (e: { from: number; to: number }) => void;
  };

/** An order the visitor enters: the rows in the order shown are the value, handed out on every move, each move also sent
 *  on its own (`onReorder`). A finger drags a row by its handle; a tapped row shows arrows that move it up and down. */
export function SortableList(props: SortableListProps) {
  const p = withDefaults<SortableListProps>("sortable-list", props);
  const kit = useKit();
  const fill = useFill();
  const [order, setOrder] = useValue<ListRow[]>(Array.isArray(p.items) ? p.items : [], p.onChange);
  const [drag, setDrag] = useState<{ from: number; y: number; dy: number } | null>(null);
  const [picked, setPicked] = useState(-1);
  const held = !!p.disabled || !!p.readOnly;
  const move = (from: number, to: number) => {
    const next = moved(order, from, to);
    if (held || next.every((r, i) => r === order[i])) return;
    setOrder(next);
    if (picked === from) setPicked(to);
    p.onReorder?.({ from, to });
  };
  return withField(
    p,
    <View {...tagOf(p.testID)} ariaRole="list" ariaLabel={p.ariaLabel || undefined} style={sx(COL, { width: Math.round(p.width ?? 320), rowGap: 4, opacity: p.disabled ? 0.38 : 1 }, fill)}>
      {order.map((row, i) => {
        const dragged = drag?.from === i;
        const on = picked === i && !held;
        return (
          <View
            key={`${i}:${row.label}`}
            ariaRole="listitem"
            ariaLabel={row.label}
            ariaSelected={on}
            onClick={held ? undefined : () => setPicked(on ? -1 : i)}
            style={sx(ROW, { boxSizing: "border-box", height: 48, columnGap: 8, padding: "0 8px", borderRadius: corner(kit, "lg"), backgroundColor: c(dragged || on ? "secondary-container" : "surface-container-low") }, p.error ? { border: `1px solid ${c("error")}` } : null, dragged ? { transform: `translateY(${drag!.dy}px)`, zIndex: "1", position: "relative" } : null)}
          >
            <View
              catchMove
              onTouchStart={(e) => {
                const t = touchOf(e);
                if (!held && t) setDrag({ from: i, y: t.clientY, dy: 0 });
              }}
              onTouchMove={(e) => {
                const t = touchOf(e);
                if (drag && t) setDrag({ ...drag, dy: t.clientY - drag.y });
              }}
              onTouchEnd={(e) => {
                const t = touchOf(e);
                if (!drag) return;
                setDrag(null);
                move(i, dragTarget(i, t ? t.clientY - drag.y : drag.dy, order.length));
              }}
              onTouchCancel={() => setDrag(null)}
              style={sx({ display: "flex", padding: 4, margin: -4 })}
            >
              <Glyph name="drag_indicator" size={20} color="on-surface-variant" />
            </View>
            <Words text={row.label} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(on || dragged ? "on-secondary-container" : "on-surface") }} />
            {on ? <IconTap icon="arrow_upward" label="Move up" size={32} disabled={i === 0} onPress={() => move(i, i - 1)} /> : null}
            {on ? <IconTap icon="arrow_downward" label="Move down" size={32} disabled={i === order.length - 1} onPress={() => move(i, i + 1)} /> : null}
          </View>
        );
      })}
    </View>,
  );
}

/* ---------- a row with an action under it ---------- */

/** how far the face slides to show the action */
const REVEAL = 88;

/** whether a swipe that let go `dx` from where it started (the face at `from`) leaves the row open */
export const swipeOpens = (from: number, dx: number) => Math.min(0, Math.max(-REVEAL, from + dx)) < -REVEAL / 2;

export type SwipeRowProps = PartBase & {
  title?: string;
  note?: string;
  action?: string;
  open?: boolean;
  width?: number;
  /** whether the action shows, as it changes (a variable holds it) */
  onChange?: (open: boolean) => void;
  /** the row was opened or shut */
  onOpen?: (e: { open: boolean }) => void;
};

/** A row with an action under it: whether the action shows is `open`, the visitor's (handed out, and sent as `onOpen`,
 *  whenever a swipe or a long press opens or shuts it). The action only asks (its place, `action`): the row goes when the
 *  data it stands for goes. */
export function SwipeRow(props: SwipeRowProps) {
  const p = withDefaults<SwipeRowProps>("swipe-row", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useValue(!!p.open, p.onChange);
  const [swipe, setSwipe] = useState<{ x: number; y: number; dx: number; sideways: boolean } | null>(null);
  const shut = (to: boolean) => {
    if (to === open) return;
    setOpen(to);
    p.onOpen?.({ open: to });
  };
  const from = open ? -REVEAL : 0;
  const at = swipe?.sideways ? Math.min(0, Math.max(-REVEAL, from + swipe.dx)) : from;
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 360), borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c("error-container") }, fill)} testID={p.testID}>
      <View ariaHidden={!open} style={sx(ROW, { position: "absolute", top: 0, bottom: 0, right: 0, width: REVEAL, justifyContent: "center" })}>
        {p.action ? (
          <Tap onPress={tapOf(p, "action")} style={{ ...ROW, height: 32, padding: "0 12px", borderRadius: 16 }}>
            <Words text={p.action} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c("on-error-container") }} />
          </Tap>
        ) : null}
      </View>
      <View
        ariaRole="button"
        ariaLabel={p.title}
        onTouchStart={(e) => {
          const t = touchOf(e);
          if (t) setSwipe({ x: t.clientX, y: t.clientY, dx: 0, sideways: false });
        }}
        onTouchMove={(e) => {
          const t = touchOf(e);
          if (!swipe || !t) return;
          const dx = t.clientX - swipe.x;
          /* only a sideways swipe: an up or down one is the page's scroll */
          setSwipe({ ...swipe, dx, sideways: swipe.sideways || (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(t.clientY - swipe.y)) });
        }}
        onTouchEnd={(e) => {
          const t = touchOf(e);
          if (swipe?.sideways) shut(swipeOpens(from, t ? t.clientX - swipe.x : swipe.dx));
          setSwipe(null);
        }}
        onTouchCancel={() => setSwipe(null)}
        onLongPress={() => shut(!open)}
      >
        <Surface base={{ ...COL, boxSizing: "border-box", padding: 12, rowGap: 2, backgroundColor: c("surface-container-low"), transform: `translateX(${at}px)`, transition: swipe ? "none" : "transform 200ms" }} appearance={p}>
          <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface") }} />
          {p.note ? <Words text={p.note} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
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
    <Surface base={merge(COL, { width: Math.round(p.width ?? 380), boxSizing: "border-box", padding: 8, rowGap: 2, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low") }, fill)} appearance={p} testID={p.testID}>
      {rows.map((r, i) => {
        const here = i === on;
        const ink = here ? "on-secondary-container" : "on-surface";
        return (
          <View key={i} style={sx(ROW, { columnGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: here ? c("secondary-container") : undefined })}>
            <Tap
              label={r[0] ?? ""}
              selected={here}
              onPress={() => {
                p.onSelect?.(i);
                tapOf(p, `tab:${i}`)?.();
              }}
              style={{ ...ROW, flex: 1, minWidth: 0, columnGap: 12, padding: 8 }}
            >
              <Glyph name={fileIcon(r[0] ?? "")} size={24} color={ink} />
              <View style={sx(COL, { flex: 1, minWidth: 0 })}>
                <Words text={r[0] ?? ""} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c(ink) }} />
                <Words text={[r[1], r[2]].filter(Boolean).join(" · ")} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c(ink), opacity: SOFT }} />
              </View>
            </Tap>
            {p.removable ? <IconTap icon="delete" label={`Remove ${r[0] || i + 1}`} color={ink} onPress={p.taps?.[`remove:${i}`] ?? noop} /> : null}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a menu bar ---------- */

export type MenubarProps = PartBase & { menus?: ListRow[]; items?: ListRow[] };

/** The menus along a bar, as the canvas shows them; a tap on one opens its items in the platform's action sheet (at most
 *  six, as the kit's menu does), and a tap on an item runs what that item is wired to (`tab:N`, the same in every menu). */
export function Menubar(props: MenubarProps) {
  const p = withDefaults<MenubarProps>("menubar", props);
  const kit = useKit();
  const [open, setOpen] = useState(-1);
  const menus = p.menus ?? [];
  const labels = (p.items ?? []).map((it) => it.label).slice(0, 6);
  const show = (i: number) => {
    if (!labels.length) return;
    setOpen(i);
    Taro.showActionSheet({ itemList: labels })
      .then((r) => tapOf(p, `tab:${r.tapIndex}`)?.())
      .catch(() => {})
      .finally(() => setOpen(-1));
  };
  return (
    <Surface base={{ ...ROW, height: 48, boxSizing: "border-box", alignSelf: "flex-start", columnGap: 4, padding: 4, borderRadius: 24, backgroundColor: c("surface-container") }} appearance={p} testID={p.testID}>
      {menus.map((m, i) => (
        <Tap key={i} label={m.label} selected={open === i} onPress={() => show(i)} style={{ ...ROW, height: 40, padding: "0 16px", borderRadius: 20, backgroundColor: open === i ? c("secondary-container") : undefined }}>
          <Words text={m.label} style={{ ...typeStyle(kit, "label-large"), color: c(open === i ? "on-secondary-container" : "on-surface-variant") }} />
        </Tap>
      ))}
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
    <Surface base={merge(COL, { width: Math.round(p.width ?? 260), rowGap: 2 }, fill)} appearance={p} testID={p.testID} role="list">
      {(p.items ?? []).map((row, i) => {
        const here = i === on;
        const ink = here ? "on-secondary-container" : "on-surface";
        return (
          <Tap
            key={i}
            role="listitem"
            label={row.label.trim()}
            selected={here}
            onPress={() => {
              p.onSelect?.(i);
              tapOf(p, `tab:${i}`)?.();
            }}
            style={{ ...ROW, columnGap: 8, padding: `4px 8px 4px ${8 + depthOf(row.label) * 16}px`, borderRadius: corner(kit, "md"), backgroundColor: here ? c("secondary-container") : undefined }}
          >
            {row.icon ? <Glyph name={row.icon} size={16} color={ink} /> : null}
            <Words text={row.label.trim()} lines={1} style={{ flexShrink: 1, ...typeStyle(kit, "body-medium"), color: c(ink) }} />
          </Tap>
        );
      })}
    </Surface>
  );
}

/* ---------- a window ---------- */

/** the bar along a window's top, as the title bar part draws it: the Mac's lights, the title, Windows' caption buttons */
function WindowBar({ controls, title }: { controls: string; title?: string }) {
  const kit = useKit();
  const dot = sx({ width: 12, height: 12, borderRadius: 6, backgroundColor: c("outline") });
  return (
    <View style={sx(ROW, { height: 36, flexShrink: 0, boxSizing: "border-box", columnGap: 12, padding: "0 12px", backgroundColor: c("surface-container") })}>
      {controls === "mac" ? (
        <View style={sx(ROW, { columnGap: 8 })}>
          <View style={dot} />
          <View style={dot} />
          <View style={dot} />
        </View>
      ) : null}
      <View ariaRole="heading" style={sx({ flex: 1, minWidth: 0 })}>
        <Words text={title} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface"), textAlign: controls === "mac" ? "center" : "left" }} />
      </View>
      {controls === "mac" ? <View style={sx({ width: 52, flexShrink: 0 })} /> : null}
      {controls === "windows" ? (
        <View style={sx(ROW, { columnGap: 12 })}>
          {["remove", "crop_square", "close"].map((g) => (
            <Glyph key={g} name={g} size={16} color="on-surface-variant" />
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
  const own = heldLayout({ ...p, layout: "free" }, fill, Children.count(p.children) === 0);
  const body = heldLayout({ ...p, hugWidth: true, hugHeight: true }, {});
  return (
    <Surface base={merge(COL, { width: own.width, height: own.height, boxSizing: "border-box", border: `1px solid ${c("outline-variant")}`, borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c("surface") }, fill)} appearance={p} testID={p.testID}>
      <WindowBar controls={p.controls ?? "mac"} title={p.title} />
      <View style={sx(body, { flexGrow: 1, flexShrink: 1, minHeight: 0 })}>
        <Held>{p.children}</Held>
      </View>
    </Surface>
  );
}

/* ---------- code and a diff ---------- */

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export type CodeBlockProps = PartBase & { code?: string; language?: string; width?: number };

/** the author's code in a monospace face, its language over it and a button that copies it (the platform's clipboard) */
export function CodeBlock(props: CodeBlockProps) {
  const p = withDefaults<CodeBlockProps>("code-block", props);
  const kit = useKit();
  const fill = useFill();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    Taro.setClipboardData({ data: p.code ?? "" })
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      /* the platform refused: the button simply does not say it copied */
      .catch(() => {});
  };
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 420), borderRadius: corner(kit, "lgi"), overflow: "hidden", backgroundColor: c("surface-container-highest") }, fill)} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { height: 40, justifyContent: "space-between", padding: "0 4px 0 16px" })}>
        <Words text={p.language} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} />
        <IconTap icon={copied ? "check" : "content_copy"} label="Copy" onPress={copy} />
      </View>
      <View style={sx({ overflowX: "auto", padding: "0 16px 16px" })}>
        <View style={sx({ whiteSpace: "pre", fontFamily: MONO, ...typeStyle(kit, "body-small"), color: c("on-surface") })}>{p.code ?? ""}</View>
      </View>
    </Surface>
  );
}

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
    <Surface base={merge(COL, { width: Math.round(p.width ?? 420), boxSizing: "border-box", border: `1px solid ${c("outline-variant")}`, borderRadius: corner(kit, "lgi"), overflow: "hidden" }, fill)} appearance={p} testID={p.testID}>
      {p.file ? <Words text={p.file} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), backgroundColor: c("surface-container"), padding: "8px 12px" }} /> : null}
      <View style={sx({ overflowX: "auto" })}>
        <View style={sx({ display: "inline-flex", flexDirection: "column", minWidth: "100%" })}>
          {diffLines(p.diff ?? "").map((l, i) => (
            <View key={i} style={sx({ whiteSpace: "pre", fontFamily: MONO, ...typeStyle(kit, "body-small"), padding: "0 12px", color: c(DIFF_ROLES[l.kind][1]), backgroundColor: DIFF_ROLES[l.kind][0] ? c(DIFF_ROLES[l.kind][0]!) : undefined })}>
              {l.line}
            </View>
          ))}
        </View>
      </View>
    </Surface>
  );
}
