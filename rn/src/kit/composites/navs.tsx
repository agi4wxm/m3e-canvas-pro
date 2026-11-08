import { useRef, useState } from "react";
import { Pressable, ScrollView, Text as RNText, View, type ScrollViewInstance, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { c, TriggerButton, useDraft } from "./layouts";

/* Getting around, after the navigation bar, tabs and the side bar: a rail down the side, pages to step through, a menu
 * of sections, a floating bar, the mini-program's own header, a table of contents, a row of chips that slides, and
 * the pages a new visitor is walked through. Each draws the destination it is given as chosen (`selected`, `current`,
 * `page`); a tap chooses another, says so (`onSelect`, `onValueChange`, `onPage`) and runs what the design wires to
 * it (`taps`), as the navigation bar does. */

/* ---------- a navigation rail ---------- */

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
  onSelect?: (index: number) => void;
  /** told when the menu button opens or shuts the rail; given, `expanded` says whether it is */
  onExpandedChange?: (expanded: boolean) => void;
};

/** The rail down the side of a wide screen: a menu button that opens it out, a compose button, and the destinations, the
 *  chosen one's icon in a pill. Opened out, each destination is a row; a modal one opens over what is beside it. */
export function NavigationRail(props: NavigationRailProps) {
  const p = withDefaults<NavigationRailProps>("navigation-rail", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onSelect);
  const [expanded, setExpanded] = useDraft(!!p.expanded, p.onExpandedChange);
  const slim = p.narrow && (!expanded || p.modal) ? 80 : 96;
  const width = expanded ? 220 : slim;
  const height = Math.round(p.height ?? 400);
  const over = !!p.modal && expanded;
  const ink = (on: boolean) => c(kit, on ? "on-secondary-container" : "on-surface-variant");
  const rail: ViewStyle = {
    width,
    height,
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: expanded ? 16 : 0,
    rowGap: 4,
    alignItems: expanded ? "stretch" : "center",
    backgroundColor: c(kit, over ? "surface-container" : "surface"),
    overflow: "hidden",
    ...(over ? { position: "absolute", top: 0, left: 0, zIndex: 50, borderTopRightRadius: corner(kit, "lg"), borderBottomRightRadius: corner(kit, "lg"), boxShadow: "0px 1px 2px 0px #0000004D, 0px 2px 6px 2px #00000026" } : null),
  };
  const choose = (i: number) => {
    setChosen(i);
    /* choosing a destination is what a modal rail is open for */
    if (over) setExpanded(false);
    tapOf(p, `tab:${i}`)?.();
  };
  const body = (
    <Surface base={rail} appearance={p} testID={p.testID}>
      {p.menu || p.fab ? (
        <View style={{ rowGap: 12, paddingBottom: 24, alignItems: expanded ? "flex-start" : "center" }}>
          {p.menu ? (
            <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Collapse" : "Expand"} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginLeft: expanded ? -4 : 0 }}>
              <Glyph name="menu" size={24} color={c(kit, "on-surface-variant")} />
            </Pressable>
          ) : null}
          {p.fab ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Compose" onPress={tapOf(p, "fab")} style={{ height: 56, minWidth: 56, paddingHorizontal: expanded ? 16 : 0, borderRadius: corner(kit, "lg"), flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 12, backgroundColor: c(kit, "primary-container"), boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026" }}>
              <Glyph name="edit" size={24} color={c(kit, "on-primary-container")} />
              {expanded ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-primary-container") }}>Compose</RNText> : null}
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {items.map((it, i) => {
        const on = i === chosen;
        return expanded ? (
          <Pressable key={i} accessibilityRole="tab" accessibilityLabel={it.label} accessibilityState={{ selected: on }} onPress={() => choose(i)} style={{ height: p.compact ? 40 : 56, borderRadius: 28, flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 16, backgroundColor: on ? c(kit, "secondary-container") : "transparent" }}>
            <Glyph name={it.icon || "circle"} size={24} filled={on} color={ink(on)} />
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: ink(on), flexShrink: 1 }}>
              {it.label}
            </RNText>
          </Pressable>
        ) : (
          <Pressable key={i} accessibilityRole="tab" accessibilityLabel={it.label} accessibilityState={{ selected: on }} onPress={() => choose(i)} style={{ height: 64, alignSelf: "stretch", alignItems: "center", justifyContent: "center", rowGap: 4, paddingHorizontal: 4 }}>
            <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? c(kit, "secondary-container") : "transparent" }}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={ink(on)} />
            </View>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, on ? "on-surface" : "on-surface-variant"), ...(on ? { fontWeight: "700" } : null) }}>
              {it.label}
            </RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
  /* a modal rail keeps the room of the slim one; opened, it lies over what is beside it */
  return p.modal ? <View style={{ width: slim, height, zIndex: over ? 50 : undefined }}>{body}</View> : body;
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

export type PaginationProps = PartBase & { pages?: number; current?: number; previous?: string; next?: string; width?: number; onSelect?: (page: number) => void };

/** Previous, the pages around the current one, Next. A tap on a page goes to it (`tab:N` is page N + 1). */
export function Pagination(props: PaginationProps) {
  const p = withDefaults<PaginationProps>("pagination", props);
  const kit = useKit();
  const fill = useFill();
  const pages = Math.max(1, Math.round(p.pages ?? 10));
  const [current, setCurrent] = useDraft(clampInt(p.current ?? 1, 1, pages), p.onSelect);
  const go = (n: number, slot: string) => {
    setCurrent(clampInt(n, 1, pages));
    tapOf(p, slot)?.();
  };
  const ink = c(kit, "on-surface-variant");
  const step = (slot: "previous" | "next", label: string | undefined, icon: string, to: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label || (slot === "previous" ? "Previous" : "Next")} onPress={() => go(to, slot)} style={{ height: 40, flexDirection: slot === "previous" ? "row" : "row-reverse", alignItems: "center", columnGap: 4, paddingLeft: slot === "previous" ? 8 : 16, paddingRight: slot === "previous" ? 16 : 8, borderRadius: 20 }}>
      <Glyph name={icon} size={16} color={ink} />
      {label ? <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{label}</RNText> : null}
    </Pressable>
  );
  return (
    <Surface base={{ width: Math.round(p.width ?? 480), flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 4, ...fill }} appearance={p} testID={p.testID}>
      {step("previous", p.previous, "chevron_left", current - 1)}
      {pagesShown(pages, current).map((n, i) =>
        n === "gap" ? (
          <View key={`gap${i}`} accessibilityLabel="More pages" style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
            <Glyph name="more_horiz" size={16} color={ink} />
          </View>
        ) : (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={String(n)} accessibilityState={{ selected: n === current }} onPress={() => go(n, `tab:${n - 1}`)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", ...(n === current ? { borderWidth: 1, borderColor: c(kit, "outline-variant") } : null) }}>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, n === current ? "on-surface" : "on-surface-variant") }}>{String(n)}</RNText>
          </Pressable>
        ),
      )}
      {step("next", p.next, "chevron_right", current + 1)}
    </Surface>
  );
}

/* ---------- a navigation menu ---------- */

export type NavigationMenuProps = PartBase & {
  menus?: ListRow[];
  pages?: ListRow[];
  links?: ListRow[];
  /** the menu open, by its place among `menus`, -1 for none */
  open?: number;
  onOpenChange?: (open: number) => void;
};

/** the box the canvas draws a navigation menu open in: its row and one menu's links under it */
export const navigationMenuBox = (pages: number) => ({ w: 380, h: 44 + 12 + Math.max(1, pages) * 48 + 24 });

/** A row of menus and plain links; a tap on a menu opens its links under the row, as the canvas draws it open. The part
 *  keeps the room it is drawn open in, so nothing moves when it opens. */
export function NavigationMenu(props: NavigationMenuProps) {
  const p = withDefaults<NavigationMenuProps>("navigation-menu", props);
  const kit = useKit();
  const menus = p.menus ?? [];
  const pages = p.pages ?? [];
  const [open, setOpen] = useDraft(clampInt(p.open ?? -1, -1, menus.length - 1), p.onOpenChange);
  const box = navigationMenuBox(pages.length);
  const ink = c(kit, "on-surface");
  const item: ViewStyle = { height: 40, paddingHorizontal: 16, borderRadius: corner(kit, "sm"), flexDirection: "row", alignItems: "center", columnGap: 4 };
  return (
    <View testID={p.testID} style={{ width: box.w, height: box.h }} pointerEvents="box-none">
      <Surface base={{ flexDirection: "row", alignItems: "center", columnGap: 4, alignSelf: "flex-start", padding: 2 }} appearance={p}>
        {menus.map((m, i) => (
          <Pressable key={`m${i}`} accessibilityRole="button" accessibilityLabel={m.label} accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? -1 : i)} style={{ ...item, backgroundColor: open === i ? c(kit, "surface-container-high") : "transparent" }}>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{m.label}</RNText>
            <Glyph name={open === i ? "expand_less" : "expand_more"} size={16} color={c(kit, "on-surface-variant")} />
          </Pressable>
        ))}
        {(p.links ?? []).map((l, i) => (
          <Pressable key={`l${i}`} accessibilityRole="link" accessibilityLabel={l.label} onPress={p.onPress} style={item}>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{l.label}</RNText>
          </Pressable>
        ))}
      </Surface>
      {open >= 0 ? (
        <View style={{ marginTop: 12, width: 256, padding: 8, rowGap: 4, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container"), boxShadow: "0px 1px 2px 0px #0000004D, 0px 2px 6px 2px #00000026" }}>
          {pages.map((l, i) => (
            <Pressable key={i} accessibilityRole="link" accessibilityLabel={l.label} onPress={p.onPress} style={{ height: 40, paddingHorizontal: 12, borderRadius: corner(kit, "sm"), justifyContent: "center" }}>
              <RNText style={{ ...typeStyle(kit, "body-medium"), color: ink }}>{l.label}</RNText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- a floating navigation bar ---------- */

export type FloatingNavProps = PartBase & { items?: ListRow[]; selected?: number; width?: number; onSelect?: (index: number) => void };

/** the bar of destinations lifted into a capsule over the foot of the screen */
export function FloatingNav(props: FloatingNavProps) {
  const p = withDefaults<FloatingNavProps>("floating-nav", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onSelect);
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), height: 64, borderRadius: 32, flexDirection: "row", alignItems: "stretch", backgroundColor: c(kit, "surface-container"), overflow: "hidden", boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026" }} appearance={p} testID={p.testID}>
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
            style={{ flex: 1, alignItems: "center", justifyContent: "center", rowGap: 4 }}
          >
            <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? c(kit, "secondary-container") : "transparent" }}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={c(kit, on ? "on-secondary-container" : "on-surface-variant")} />
            </View>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, on ? "on-surface" : "on-surface-variant"), ...(on ? { fontWeight: "700" } : null) }}>
              {it.label}
            </RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- the mini-program's header ---------- */

export type MiniProgramHeaderProps = PartBase & { title?: string; back?: boolean; width?: number };

/** The header a mini-program draws under the status bar, as the design has it in an app: a back arrow, the title in the
 *  middle and, at the right, the platform's capsule (here only drawn: an app has no capsule of its own to stand for). */
export function MiniProgramHeader(props: MiniProgramHeaderProps) {
  const p = withDefaults<MiniProgramHeaderProps>("mini-program-header", props);
  const kit = useKit();
  const fill = useFill();
  const line = c(kit, "outline-variant");
  return (
    <Surface base={{ width: Math.round(p.width ?? 412), height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, backgroundColor: c(kit, "surface"), ...fill }} appearance={p} testID={p.testID}>
      {p.back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={tapOf(p, "icon")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Glyph name="arrow_back" size={24} color={c(kit, "on-surface")} />
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface"), position: "absolute", left: 96, right: 96, textAlign: "center" }}>
        {p.title}
      </RNText>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 32, flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: line }}>
        <Glyph name="more_horiz" size={20} color={c(kit, "on-surface")} />
        <View style={{ width: 1, height: 16, backgroundColor: line }} />
        <Glyph name="radio_button_checked" size={20} color={c(kit, "on-surface")} />
      </View>
    </Surface>
  );
}

/* ---------- a table of contents ---------- */

/** a heading of a table of contents: its words, and whether it is a level down (it starts with two spaces) */
export const tocRow = (label: string) => ({ words: label.trim(), sub: label.startsWith("  ") });

export type TableOfContentsProps = PartBase & { title?: string; items?: ListRow[]; selected?: number; width?: number; onSelect?: (index: number) => void };

/** the headings of a page, a level down set in, the one being read marked; a tap goes to one */
export function TableOfContents(props: TableOfContentsProps) {
  const p = withDefaults<TableOfContentsProps>("toc", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useDraft(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onSelect);
  return (
    <Surface base={{ width: Math.round(p.width ?? 220), rowGap: 4, ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.title}</RNText> : null}
      {items.map((it, i) => {
        const row = tocRow(it.label);
        const on = i === chosen;
        return (
          <Pressable
            key={i}
            accessibilityRole="link"
            accessibilityLabel={row.words}
            accessibilityState={{ selected: on }}
            onPress={() => {
              setChosen(i);
              tapOf(p, `tab:${i}`)?.();
            }}
            style={{ paddingVertical: 4, paddingLeft: row.sub ? 24 : 12, paddingRight: 8, borderRadius: corner(kit, "xs"), backgroundColor: on ? c(kit, "secondary-container") : "transparent" }}
          >
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, on ? "on-secondary-container" : "on-surface-variant") }}>
              {row.words}
            </RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- a slide group ---------- */

export type SlideGroupProps = PartBase & { items?: ListRow[]; width?: number };

/** a row of chips that slides sideways, a chevron at each end moving it a step */
export function SlideGroup(props: SlideGroupProps) {
  const p = withDefaults<SlideGroupProps>("slide-group", props);
  const kit = useKit();
  const fill = useFill();
  const row = useRef<ScrollViewInstance>(null);
  /* where the row is slid to, to step from: presentation only */
  const [x, setX] = useState(0);
  const by = (dx: number) => {
    const to = Math.max(0, x + dx);
    row.current?.scrollTo({ x: to, animated: true });
    setX(to);
  };
  const ink = c(kit, "on-surface-variant");
  const arrow = (dx: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={dx < 0 ? "Previous" : "Next"} onPress={() => by(dx)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
      <Glyph name={dx < 0 ? "chevron_left" : "chevron_right"} size={20} color={ink} />
    </Pressable>
  );
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), flexDirection: "row", alignItems: "center", columnGap: 4, ...fill }} appearance={p} testID={p.testID}>
      {arrow(-160)}
      <ScrollView ref={row} horizontal showsHorizontalScrollIndicator={false} onScroll={(e) => setX(e.nativeEvent.contentOffset.x)} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ columnGap: 8, alignItems: "center" }}>
        {(p.items ?? []).map((it, i) => (
          <View key={i} style={{ height: 32, paddingHorizontal: 16, justifyContent: "center", borderRadius: corner(kit, "sm"), borderWidth: 1, borderColor: c(kit, "outline-variant") }}>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{it.label}</RNText>
          </View>
        ))}
      </ScrollView>
      {arrow(160)}
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
  onValueChange?: (page: number) => void;
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
  const [page, setPage] = useDraft(clampInt(p.page ?? 0, 0, last), p.onValueChange);
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
    <Surface
      base={{ width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 520), padding: 16, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface"), ...fill }}
      appearance={p}
      testID={p.testID}
    >
      <View style={{ height: 40, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
        {p.skip && !end ? (
          <Pressable accessibilityRole="button" accessibilityLabel={p.skip} onPress={() => {
              /* wired, Skip goes where the design says; else it turns to the last page */
              if (p.taps?.skip) p.taps.skip();
              else {
                go(last);
                p.onPress?.();
              }
            }} style={{ height: 32, paddingHorizontal: 12, justifyContent: "center", borderRadius: 16 }}>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "primary") }}>{p.skip}</RNText>
          </Pressable>
        ) : null}
      </View>
      <View
        testID={p.testID ? `${p.testID}-page` : undefined}
        onTouchStart={(e) => {
          from.current = e.nativeEvent.pageX;
        }}
        onTouchEnd={(e) => {
          if (from.current === null) return;
          const dx = e.nativeEvent.pageX - from.current;
          from.current = null;
          if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
        }}
        style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", rowGap: 16 }}
      >
        <View style={{ width: 128, height: 128, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "primary-container"), alignItems: "center", justifyContent: "center" }}>
          {r[0] ? <Glyph name={r[0]} size={64} color={c(kit, "on-primary-container")} /> : null}
        </View>
        <RNText style={{ ...typeStyle(kit, "headline-small"), color: c(kit, "on-surface"), textAlign: "center" }}>{r[1] ?? ""}</RNText>
        <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface-variant"), textAlign: "center" }}>{r[2] ?? ""}</RNText>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", columnGap: 4, paddingVertical: 12 }}>
        {rows.map((_, i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i + 1}`} accessibilityState={{ selected: i === at }} onPress={() => go(i)} style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c(kit, i === at ? "primary" : "outline-variant") }} />
          </Pressable>
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
