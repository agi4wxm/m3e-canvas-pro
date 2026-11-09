import { ScrollView, View, type ITouchEvent } from "@tarojs/components";
import { useRef, useState } from "react";

import type { PartBase } from "../atoms/basics";
import { Words } from "../atoms/words";
import { c } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Surface } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { corner, recipeOf, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";
import { own, TriggerButton, useDraft } from "./layouts";

/* Getting around, after the navigation bar and tabs: a rail down the side, pages to step through, a menu of sections,
 * a side bar, a floating bar, a table of contents, a row of chips that slides, a grid of shortcuts, and the pages a new
 * visitor is walked through. Each draws the destination it is given as chosen (`selected`, `current`, `page`); a tap
 * chooses another, says so (`onChange`, `onPage`) and runs what the design wires to it (`taps`), as the navigation bar
 * does. */

const SHADOW = "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)";
const COL: CSS = { display: "flex", flexDirection: "column" };

/* ---------- a navigation rail ---------- */

/** how wide a rail is: opened out, or slim (narrower when it says so, and while a modal one lies open over the rest) */
export function railWidths(expanded: boolean, narrow: boolean, modal: boolean): { room: number; drawn: number } {
  const slim = narrow && (!expanded || modal) ? 80 : 96;
  return { room: modal ? slim : expanded ? 220 : slim, drawn: expanded ? 220 : slim };
}

export type NavigationRailProps = PartBase & {
  items?: ListRow[];
  selected?: number;
  expanded?: boolean;
  narrow?: boolean;
  modal?: boolean;
  compact?: boolean;
  menu?: boolean;
  fab?: boolean;
  height?: number;
  onChange?: (index: number) => void;
  /** told when the menu button opens or shuts the rail; given, `expanded` says whether it is */
  onExpandedChange?: (expanded: boolean) => void;
};

/** The rail down the side of a wide screen: a menu button that opens it out, a compose button, and the destinations, the
 *  chosen one's icon in a pill. Opened out, each destination is a row; a modal one opens over what is beside it. */
export function NavigationRail(props: NavigationRailProps) {
  const p = withDefaults<NavigationRailProps>("navigation-rail", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const [expanded, setExpanded] = useDraft(!!p.expanded, p.onExpandedChange);
  const w = railWidths(expanded, !!p.narrow, !!p.modal);
  const height = Math.round(p.height ?? 400);
  const over = !!p.modal && expanded;
  const ink = (on: boolean) => (on ? "on-secondary-container" : "on-surface-variant");
  const choose = (i: number) => {
    setChosen(i);
    /* choosing a destination is what a modal rail is open for */
    if (over) setExpanded(false);
    tapOf(p, `tab:${i}`)?.();
  };
  const rail = merge(COL, { width: w.drawn, height, paddingTop: 44, paddingBottom: 16, paddingLeft: expanded ? 16 : 0, paddingRight: expanded ? 16 : 0, boxSizing: "border-box", rowGap: 4, alignItems: expanded ? "stretch" : "center", backgroundColor: c(over ? "surface-container" : "surface"), overflow: "hidden" }, over ? { position: "absolute", top: 0, left: 0, zIndex: "50", borderTopRightRadius: corner(kit, "lg"), borderBottomRightRadius: corner(kit, "lg"), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)" } : null);
  return (
    <View style={sx({ position: "relative", width: w.room, height, flexShrink: 0 })}>
      <Surface base={rail} appearance={p} testID={p.testID} role="tablist">
        {p.menu || p.fab ? (
          <View style={sx(COL, { rowGap: 12, paddingBottom: 24, alignItems: expanded ? "flex-start" : "center" })}>
            {p.menu ? (
              <View ariaRole="button" ariaLabel={expanded ? "Collapse" : "Expand"} hoverClass="m3e-pressed" onClick={own(() => setExpanded(!expanded))} style={sx(ROW, { width: 48, height: 48, borderRadius: 24, justifyContent: "center" })}>
                <Glyph name="menu" size={24} color="on-surface-variant" />
              </View>
            ) : null}
            {p.fab ? (
              <View ariaRole="button" ariaLabel="Compose" hoverClass="m3e-pressed" onClick={own(() => tapOf(p, "fab")?.())} style={sx(ROW, { height: 56, minWidth: 56, paddingLeft: expanded ? 16 : 0, paddingRight: expanded ? 16 : 0, boxSizing: "border-box", borderRadius: corner(kit, "lg"), justifyContent: "center", columnGap: 12, backgroundColor: c("primary-container"), boxShadow: SHADOW })}>
                <Glyph name="edit" size={24} color="on-primary-container" />
                {expanded ? <Words text="Compose" style={{ ...typeStyle(kit, "title-medium"), color: c("on-primary-container") }} /> : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {items.map((it, i) => {
          const on = i === chosen;
          return expanded ? (
            <View key={i} ariaRole="tab" ariaLabel={it.label} ariaSelected={on} hoverClass="m3e-pressed" onClick={own(() => choose(i))} style={sx(ROW, { height: p.compact ? 40 : 56, borderRadius: 28, columnGap: 8, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", backgroundColor: on ? c("secondary-container") : "transparent" })}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={ink(on)} />
              <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c(ink(on)) }} />
            </View>
          ) : (
            <View key={i} ariaRole="tab" ariaLabel={it.label} ariaSelected={on} hoverClass="m3e-pressed" onClick={own(() => choose(i))} style={sx(COL, { height: 64, alignSelf: "stretch", alignItems: "center", justifyContent: "center", rowGap: 4 })}>
              <View style={sx(ROW, { width: 56, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: on ? c("secondary-container") : "transparent" })}>
                <Glyph name={it.icon || "circle"} size={24} filled={on} color={ink(on)} />
              </View>
              <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(on ? "on-surface" : "on-surface-variant"), fontWeight: on ? 700 : typeStyle(kit, "label-medium").fontWeight }} />
            </View>
          );
        })}
      </Surface>
    </View>
  );
}

/* ---------- pagination ---------- */

/** The pages a pagination shows (the web's): the first, the last, the current one and one either side; a gap of one page
 *  is that page, a longer one an ellipsis ("gap"). */
export function pagesShown(pages: number, current: number): (number | "gap")[] {
  const last = Math.max(1, Math.round(pages));
  const at = Math.min(last, Math.max(1, Math.round(current)));
  const wanted = [...new Set([1, at - 1, at, at + 1, last])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  wanted.forEach((n, i) => {
    const before = wanted[i - 1];
    if (before !== undefined && n - before === 2) out.push(n - 1);
    else if (before !== undefined && n - before > 2) out.push("gap");
    out.push(n);
  });
  return out;
}

export type PaginationProps = PartBase & {
  pages?: number;
  /** the page it is on, counted from 0 as every place is; it shows it counted from 1 */
  page?: number;
  previous?: string;
  next?: string;
  width?: number;
  /** told of the page gone to, from 0 */
  onChange?: (page: number) => void;
};

/** Previous, the pages around the current one, Next. A tap on a page goes to it (`tab:N` is page N, from 0). */
export function Pagination(props: PaginationProps) {
  const p = withDefaults<PaginationProps>("pagination", props);
  const kit = useKit();
  const fill = useFill();
  const pages = Math.max(1, Math.round(p.pages ?? 10));
  const [page, setPage] = useDraft(clampInt(p.page ?? 1, 0, pages - 1), p.onChange);
  const current = page + 1;
  const go = (n: number, slot: string) => {
    setPage(clampInt(n, 1, pages) - 1);
    tapOf(p, slot)?.();
  };
  const step = (slot: "previous" | "next", label: string | undefined, to: number) => (
    <View ariaRole="button" ariaLabel={label || (slot === "previous" ? "Previous" : "Next")} hoverClass="m3e-pressed" onClick={own(() => go(to, slot))} style={sx(ROW, { height: 40, flexDirection: slot === "previous" ? "row" : "row-reverse", columnGap: 4, paddingLeft: slot === "previous" ? 8 : 16, paddingRight: slot === "previous" ? 16 : 8, boxSizing: "border-box", borderRadius: 20, flexShrink: 0 })}>
      <Glyph name={slot === "previous" ? "chevron_left" : "chevron_right"} size={16} color="on-surface-variant" />
      {label ? <Words text={label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface-variant") }} /> : null}
    </View>
  );
  return (
    <Surface base={merge(ROW, { width: Math.round(p.width ?? 480), justifyContent: "center", columnGap: 4 }, fill)} appearance={p} testID={p.testID}>
      {step("previous", p.previous, current - 1)}
      {pagesShown(pages, current).map((n, i) =>
        n === "gap" ? (
          <View key={`gap${i}`} ariaLabel="More pages" style={sx(ROW, { width: 36, height: 36, justifyContent: "center" })}>
            <Glyph name="more_horiz" size={16} color="on-surface-variant" />
          </View>
        ) : (
          <View key={n} ariaRole="button" ariaLabel={String(n)} ariaSelected={n === current} hoverClass="m3e-pressed" onClick={own(() => go(n, `tab:${n - 1}`))} style={sx(ROW, { width: 40, height: 40, borderRadius: 20, justifyContent: "center", boxSizing: "border-box", flexShrink: 0, border: n === current ? `1px solid ${c("outline-variant")}` : undefined })}>
            <Words text={String(n)} style={{ ...typeStyle(kit, "label-large"), color: c(n === current ? "on-surface" : "on-surface-variant") }} />
          </View>
        ),
      )}
      {step("next", p.next, current + 1)}
    </Surface>
  );
}

/* ---------- a navigation menu ---------- */

/** the box the canvas draws a navigation menu open in: its row and one menu's links under it */
export const navigationMenuBox = (pages: number) => ({ w: 380, h: 44 + 12 + Math.max(1, pages) * 48 + 24 });

export type NavigationMenuProps = PartBase & {
  menus?: ListRow[];
  pages?: ListRow[];
  links?: ListRow[];
  /** the menu open, by its place among `menus`, -1 for none */
  open?: number;
  onOpenChange?: (open: number) => void;
};

/** A row of menus and plain links; a tap on a menu opens its links under the row, as the canvas draws it open. The part
 *  keeps the room it is drawn open in, so nothing moves when it opens. */
export function NavigationMenu(props: NavigationMenuProps) {
  const p = withDefaults<NavigationMenuProps>("navigation-menu", props);
  const kit = useKit();
  const menus = p.menus ?? [];
  const pages = p.pages ?? [];
  const [open, setOpen] = useDraft(clampInt(p.open ?? -1, -1, menus.length - 1), p.onOpenChange);
  const box = navigationMenuBox(pages.length);
  const item: CSS = { ...ROW, height: 40, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", borderRadius: corner(kit, "sm"), columnGap: 4, flexShrink: 0 };
  return (
    <View style={sx(COL, { width: box.w, height: box.h, flexShrink: 0 })}>
      <Surface base={merge(ROW, { columnGap: 4, alignSelf: "flex-start", padding: 2 })} appearance={p} testID={p.testID}>
        {menus.map((m, i) => (
          <View key={`m${i}`} ariaRole="button" ariaLabel={m.label} ariaSelected={open === i} hoverClass="m3e-pressed" onClick={own(() => setOpen(open === i ? -1 : i))} style={sx(item, { backgroundColor: open === i ? c("surface-container-high") : "transparent" })}>
            <Words text={m.label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface") }} />
            <Glyph name={open === i ? "expand_less" : "expand_more"} size={16} color="on-surface-variant" />
          </View>
        ))}
        {(p.links ?? []).map((l, i) => (
          <View key={`l${i}`} ariaRole="link" ariaLabel={l.label} hoverClass="m3e-pressed" onClick={own(() => p.onPress?.())} style={sx(item)}>
            <Words text={l.label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface") }} />
          </View>
        ))}
      </Surface>
      {open >= 0 ? (
        <View style={sx(COL, { marginTop: 12, width: 256, padding: 8, boxSizing: "border-box", rowGap: 4, borderRadius: corner(kit, "md"), backgroundColor: c("surface-container"), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)" })}>
          {pages.map((l, i) => (
            <View key={i} ariaRole="link" ariaLabel={l.label} hoverClass="m3e-pressed" onClick={own(() => p.onPress?.())} style={sx(ROW, { height: 40, paddingLeft: 12, paddingRight: 12, borderRadius: corner(kit, "sm") })}>
              <Words text={l.label} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- a side bar ---------- */

export type SidebarProps = PartBase & { label?: string; items?: ListRow[]; selected?: number; size?: string; width?: number; height?: number; onChange?: (index: number) => void };

/** a side bar of an app: a group's name over its entries, the chosen one in a pill */
export function Sidebar(props: SidebarProps) {
  const p = withDefaults<SidebarProps>("sidebar", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const rowH = p.size === "sm" ? 40 : p.size === "lg" ? 56 : 48;
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 288), height: Math.round(p.height ?? 400), padding: 12, rowGap: 4, backgroundColor: c("surface-container-low"), flexShrink: 0 })} appearance={p} testID={p.testID} role="tablist">
      {p.label ? <Words text={p.label} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant"), paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }} /> : null}
      {items.map((it, i) => {
        const on = i === chosen;
        const ink = on ? "on-secondary-container" : "on-surface-variant";
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
            style={sx(ROW, { height: rowH, borderRadius: rowH / 2, columnGap: 12, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", backgroundColor: on ? c("secondary-container") : "transparent" })}
          >
            {it.icon ? <Glyph name={it.icon} size={24} filled={on} color={ink} /> : null}
            <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c(ink) }} />
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a floating navigation bar ---------- */

export type FloatingNavProps = PartBase & { items?: ListRow[]; selected?: number; width?: number; onChange?: (index: number) => void };

/** the bar of destinations lifted into a capsule over the foot of the screen */
export function FloatingNav(props: FloatingNavProps) {
  const p = withDefaults<FloatingNavProps>("floating-nav", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  return (
    <Surface base={merge(ROW, { width: Math.round(p.width ?? 320), height: 64, borderRadius: 32, alignItems: "stretch", backgroundColor: c("surface-container"), overflow: "hidden", boxShadow: SHADOW, flexShrink: 0 })} appearance={p} testID={p.testID} role="tablist">
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
            style={sx(COL, { flex: 1, alignItems: "center", justifyContent: "center", rowGap: 4 })}
          >
            <View style={sx(ROW, { width: 56, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: on ? c("secondary-container") : "transparent" })}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={on ? "on-secondary-container" : "on-surface-variant"} />
            </View>
            <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(on ? "on-surface" : "on-surface-variant"), fontWeight: on ? 700 : typeStyle(kit, "label-medium").fontWeight }} />
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a table of contents ---------- */

/** a heading of a table of contents: its words, and whether it is a level down (it starts with two spaces) */
export const tocRow = (label: string) => ({ words: label.trim(), sub: label.startsWith("  ") });

export type TableOfContentsProps = PartBase & { title?: string; items?: ListRow[]; selected?: number; width?: number; onChange?: (index: number) => void };

/** the headings of a page, a level down set in, the one being read marked; a tap goes to one */
export function TableOfContents(props: TableOfContentsProps) {
  const p = withDefaults<TableOfContentsProps>("toc", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 220), rowGap: 4, flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null}
      {items.map((it, i) => {
        const row = tocRow(it.label);
        const on = i === chosen;
        return (
          <View
            key={i}
            ariaRole="link"
            ariaLabel={row.words}
            ariaSelected={on}
            hoverClass="m3e-pressed"
            onClick={own(() => {
              setChosen(i);
              tapOf(p, `tab:${i}`)?.();
            })}
            style={sx({ paddingTop: 4, paddingBottom: 4, paddingLeft: row.sub ? 24 : 12, paddingRight: 8, boxSizing: "border-box", borderRadius: corner(kit, "xs"), backgroundColor: on ? c("secondary-container") : "transparent" })}
          >
            <Words text={row.words} lines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(on ? "on-secondary-container" : "on-surface-variant") }} />
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a slide group ---------- */

export type SlideGroupProps = PartBase & { items?: ListRow[]; width?: number };

/** a chevron at an end of a slide group */
function SlideArrow({ back, onPress }: { back: boolean; onPress: () => void }) {
  return (
    <View ariaRole="button" ariaLabel={back ? "Previous" : "Next"} hoverClass="m3e-pressed" onClick={own(onPress)} style={sx(ROW, { width: 32, height: 32, borderRadius: 16, justifyContent: "center", flexShrink: 0 })}>
      <Glyph name={back ? "chevron_left" : "chevron_right"} size={20} color="on-surface-variant" />
    </View>
  );
}

/** a row of chips that slides sideways, a chevron at each end moving it a step */
export function SlideGroup(props: SlideGroupProps) {
  const p = withDefaults<SlideGroupProps>("slide-group", props);
  const kit = useKit();
  const fill = useFill();
  /* where the row is slid to: presentation only, and where a chevron steps from */
  const [x, setX] = useState(0);
  const seen = useRef(0);
  return (
    <Surface base={merge(ROW, { width: Math.round(p.width ?? 320), columnGap: 4, flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <SlideArrow back onPress={() => setX(Math.max(0, seen.current - 160))} />
      <ScrollView
        scrollX
        scrollLeft={x}
        scrollWithAnimation
        enhanced
        showScrollbar={false}
        onScroll={(e) => {
          seen.current = e.detail.scrollLeft;
        }}
        style={sx({ flex: 1, minWidth: 0, whiteSpace: "nowrap" })}
      >
        <View style={sx(ROW, { columnGap: 8, width: "max-content" })}>
          {(p.items ?? []).map((it, i) => (
            <View key={i} style={sx(ROW, { height: 32, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", flexShrink: 0, borderRadius: corner(kit, "sm"), border: `1px solid ${c("outline-variant")}` })}>
              <Words text={it.label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface-variant"), whiteSpace: "nowrap" }} />
            </View>
          ))}
        </View>
      </ScrollView>
      <SlideArrow back={false} onPress={() => setX(seen.current + 160)} />
    </Surface>
  );
}

/* ---------- a grid of shortcuts ---------- */

export type IconGridProps = PartBase & { items?: ListRow[]; columns?: number; badge?: string; width?: number };

/** a grid of shortcuts: an icon in a tinted tile and its name under it, a dot or a word on the new ones (each row's
 *  `variant`, the data's: a mark is cleared by the data, not by a tap) */
export function IconGrid(props: IconGridProps) {
  const p = withDefaults<IconGridProps>("icon-grid", props);
  const kit = useKit();
  const fill = useFill();
  const cols = clampInt(p.columns ?? 4, 1, 8);
  const tile = recipeOf(kit, "icon") === "tile";
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 380), display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, rowGap: 16, flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {(p.items ?? []).map((it, i) => (
        <View key={i} ariaRole="button" ariaLabel={it.label} hoverClass="m3e-pressed" onClick={own(() => tapOf(p, `tab:${i}`)?.())} style={sx(COL, { alignItems: "center", rowGap: 6, minWidth: 0 })}>
          <View style={sx(ROW, { position: "relative", width: 48, height: 48, borderRadius: tile ? 12 : 24, justifyContent: "center", backgroundColor: c("secondary-container") })}>
            <Glyph name={it.icon || "apps"} size={24} color="on-secondary-container" />
            {it.variant === "dot" ? <View style={sx({ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: c("error") })} /> : null}
            {it.variant === "new" ? (
              <View style={sx(ROW, { position: "absolute", top: -6, right: -14, height: 16, paddingLeft: 4, paddingRight: 4, boxSizing: "border-box", borderRadius: 8, backgroundColor: c("error") })}>
                <Words text={p.badge} style={{ ...typeStyle(kit, "label-small"), lineHeight: "16px", color: c("on-error") }} />
              </View>
            ) : null}
          </View>
          <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), maxWidth: "100%" }} />
        </View>
      ))}
    </Surface>
  );
}

/* ---------- onboarding ---------- */

export type OnboardingProps = PartBase & {
  /** the pages: an icon, a title and a line each (parts/tableColumns.ts `onboarding.data`) */
  data?: { columns?: string[]; rows?: string[][] };
  skip?: string;
  next?: string;
  done?: string;
  page?: number;
  width?: number;
  height?: number;
  /** told of the page now on show; given, `page` says which it is */
  onChange?: (page: number) => void;
  /** the part's `page` event: every turn of the page */
  onPage?: (page: number) => void;
};

/** The pages a new visitor is walked through: a big icon, a title and a line, dots for the pages, and Next (Get started on
 *  the last). Skip goes to the last page unless the design wires it somewhere; a swipe turns the page too. */
export function Onboarding(props: OnboardingProps) {
  const p = withDefaults<OnboardingProps>("onboarding", props);
  const kit = useKit();
  const fill = useFill();
  const rows = Array.isArray(p.data?.rows) ? p.data!.rows : [];
  const last = Math.max(0, rows.length - 1);
  const [page, setPage] = useDraft(clampInt(p.page ?? 0, 0, last), p.onChange);
  const at = clampInt(page, 0, last);
  const r = rows[at] ?? [];
  const from = useRef<number | null>(null);
  const go = (to: number) => {
    const next = clampInt(to, 0, last);
    if (next === at) return;
    setPage(next);
    p.onPage?.(next);
  };
  const end = at === last;
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 520), padding: 16, borderRadius: corner(kit, "md"), backgroundColor: c("surface"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { height: 40, justifyContent: "flex-end" })}>
        {p.skip && !end ? (
          <View
            ariaRole="button"
            ariaLabel={p.skip}
            hoverClass="m3e-pressed"
            onClick={own(() => {
              /* wired, Skip goes where the design says; else it turns to the last page */
              if (p.taps?.skip) p.taps.skip();
              else {
                go(last);
                p.onPress?.();
              }
            })}
            style={sx(ROW, { height: 32, paddingLeft: 12, paddingRight: 12, borderRadius: 16 })}
          >
            <Words text={p.skip} style={{ ...typeStyle(kit, "label-large"), color: c("primary") }} />
          </View>
        ) : null}
      </View>
      <View
        onTouchStart={(e) => {
          from.current = (e as unknown as ITouchEvent).touches?.[0]?.pageX ?? null;
        }}
        onTouchEnd={(e) => {
          const t = (e as unknown as ITouchEvent).changedTouches?.[0];
          if (from.current === null || !t) return;
          const dx = t.pageX - from.current;
          from.current = null;
          if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
        }}
        style={sx(COL, { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", rowGap: 16, textAlign: "center" })}
      >
        <View style={sx(ROW, { width: 128, height: 128, flexShrink: 0, borderRadius: corner(kit, "lg"), justifyContent: "center", backgroundColor: c("primary-container") })}>{r[0] ? <Glyph name={r[0]} size={64} color="on-primary-container" /> : null}</View>
        <Words text={r[1] ?? ""} style={{ ...typeStyle(kit, "headline-small"), color: c("on-surface") }} />
        <Words text={r[2] ?? ""} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface-variant") }} />
      </View>
      <View style={sx(ROW, { justifyContent: "center", columnGap: 4, paddingTop: 12, paddingBottom: 12 })}>
        {rows.map((_, i) => (
          <View key={i} ariaRole="button" ariaLabel={`${i + 1}`} ariaSelected={i === at} onClick={own(() => go(i))} style={sx(ROW, { width: 24, height: 24, justifyContent: "center" })}>
            <View style={sx({ width: 8, height: 8, borderRadius: 4, backgroundColor: c(i === at ? "primary" : "outline-variant") })} />
          </View>
        ))}
      </View>
      <TriggerButton
        label={end ? p.done : p.next}
        variant="filled"
        wide
        onPress={() => {
          go(at + 1);
          tapOf(p, end ? "done" : "next")?.();
        }}
      />
    </Surface>
  );
}
