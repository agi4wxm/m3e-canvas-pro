import { Input as TaroInput, View, type ITouchEvent } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import type { PartBase } from "../atoms/basics";
import { buttonColors, inkCss } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { withDefaults, type ListRow } from "../parts";
import { capsOf, extraColor, fieldStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, extra, recipeOf, typeStyle, useKit, type Kit } from "../theme";
import { tapOf } from "./bars";

/* Actions, and menus and search, in a mini-program (parts/defs/actions.ts, mobile.ts, menus.ts, navigation.ts, data.ts,
 * additions.ts): a group of buttons, a split button, a FAB that opens a menu of actions, a sign-in or pay button, a
 * command list, a context menu, a bar of filters and a menu with a submenu. A menu opens as the platform's action sheet
 * (as the kit's menu does: at most six rows), its submenu as a second sheet; a FAB's actions stand above it. Each row is
 * a place of its own (`tab:N`, `sub:N`): a tap runs what that place is wired to.
 *
 * A sign-in or pay button decides nothing (docs/平台能力.md): its press is what the design wires to it, which invokes
 * `auth.oauth` or `payment.pay`; it says which it asks for (`onAsk`), and what comes back is the service's and the back
 * end's to say, never the button's. */

/** a press on a view, stopped there (a button in a row is not a tap on the row) */
const pressOf = (run: (() => void) | undefined) => (run ? (e: ITouchEvent) => (e.stopPropagation(), run()) : undefined);

/** the most rows the platform's action sheet takes */
export const SHEET_ROWS = 6;

/** Open the platform's action sheet of `labels` (no more than it takes); `pick` is told the row chosen. Closing it
 *  without a choice is no choice. */
function sheet(labels: string[], pick: (i: number) => void) {
  const rows = labels.slice(0, SHEET_ROWS);
  if (!rows.length) return;
  Taro.showActionSheet({ itemList: rows })
    .then((r) => pick(r.tapIndex))
    .catch(() => {});
}

/* ---------- a group of buttons ---------- */

const GROUP_H: Record<string, number> = { xs: 32, sm: 40, md: 56, lg: 96, xl: 136 };

export type ButtonGroupProps = PartBase & { items?: ListRow[]; variant?: "connected" | "standard"; orientation?: "horizontal" | "vertical"; buttonVariant?: string; size?: string };

/** M3 Expressive's button group: buttons 2 apart with small inner corners (connected), or 8 apart and round; a row may
 *  take its own look and width over the group's, and one with no words is as wide as it is tall (narrow or wide) */
export function ButtonGroup(props: ButtonGroupProps) {
  const p = withDefaults<ButtonGroupProps>("button-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const h = GROUP_H[p.size ?? "sm"] ?? 40;
  const connected = p.variant !== "standard";
  const vertical = p.orientation === "vertical";
  const end = controlRadius(kit, h);
  const inner = connected ? Math.min(end, corner(kit, "xs") + 4) : end;
  return (
    <Surface base={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: connected ? 2 : 8, alignSelf: "flex-start" }} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const look = buttonColors(kit, it.variant || p.buttonVariant || "tonal");
        const first = i === 0;
        const last = i === items.length - 1;
        const radius: CSS = vertical
          ? { borderTopLeftRadius: first ? end : inner, borderTopRightRadius: first ? end : inner, borderBottomLeftRadius: last ? end : inner, borderBottomRightRadius: last ? end : inner }
          : { borderTopLeftRadius: first ? end : inner, borderBottomLeftRadius: first ? end : inner, borderTopRightRadius: last ? end : inner, borderBottomRightRadius: last ? end : inner };
        const iconOnly = !it.label && !!it.icon;
        const width: CSS = iconOnly ? { width: it.width === "narrow" ? Math.round(h * 0.8) : it.width === "wide" ? Math.round(h * 1.3) : h, paddingLeft: 0, paddingRight: 0 } : it.width === "wide" ? { paddingLeft: 24, paddingRight: 24 } : it.width === "narrow" ? { paddingLeft: 12, paddingRight: 12 } : {};
        return (
          <View key={i} ariaRole="button" ariaLabel={it.label || it.icon} hoverClass="m3e-pressed" onClick={pressOf(tapOf(p, `tab:${i}`) ?? (() => {}))} style={sx(merge(ROW, { height: h, boxSizing: "border-box", paddingLeft: 16, paddingRight: 16, justifyContent: "center", columnGap: 8, flexShrink: 0 }, look.box, radius, width))}>
            {it.icon ? <Glyph name={it.icon} size={20} color={look.ink} /> : null}
            {it.label ? <Words text={it.label} lines={1} style={merge(typeStyle(kit, "label-large"), { color: inkCss(look.ink) }, capsOf(kit))} /> : null}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a split button ---------- */

/** M3 Expressive's split button sizes (components/m3e/split-button.tsx): height, inner corner, the leading half's
 *  padding either side, the trailing half's width, the arrow's size, and the leading content's type role and icon */
const SPLIT: Record<string, { h: number; inner: number; lead: [number, number]; trail: number; arrow: number; icon: number; type: "label-large" | "title-medium" | "headline-small" | "headline-large" }> = {
  xs: { h: 32, inner: 4, lead: [12, 10], trail: 32, arrow: 20, icon: 20, type: "label-large" },
  sm: { h: 40, inner: 4, lead: [16, 12], trail: 40, arrow: 22, icon: 20, type: "label-large" },
  md: { h: 56, inner: 4, lead: [24, 24], trail: 56, arrow: 26, icon: 24, type: "title-medium" },
  lg: { h: 96, inner: 8, lead: [48, 48], trail: 96, arrow: 38, icon: 32, type: "headline-small" },
  xl: { h: 136, inner: 12, lead: [64, 64], trail: 136, arrow: 50, icon: 40, type: "headline-large" },
};

export type SplitButtonProps = PartBase & {
  label?: string;
  icon?: string;
  variant?: string;
  size?: string;
  /** the trailing half opens a menu of `menuItems`; without one it is a place of its own (`more`) */
  menu?: boolean;
  menuItems?: ListRow[];
};

export function SplitButton(props: SplitButtonProps) {
  const p = withDefaults<SplitButtonProps>("split-button", props);
  const kit = useKit();
  const [open, setOpen] = useState(false);
  const s = SPLIT[p.size ?? "sm"] ?? SPLIT.sm;
  const look = buttonColors(kit, p.variant ?? "filled");
  const end = controlRadius(kit, s.h);
  const inner = Math.min(end, s.inner);
  const half = (rest: CSS): CSS => merge(ROW, { height: s.h, boxSizing: "border-box", justifyContent: "center", flexShrink: 0 }, look.box, rest);
  const items = p.menuItems ?? [];
  const more = () => {
    if (!p.menu) return tapOf(p, "more")?.();
    if (!items.length) return;
    /* while its menu is open the trailing half is a circle and its arrow points up */
    setOpen(true);
    Taro.showActionSheet({ itemList: items.slice(0, SHEET_ROWS).map((it) => it.label) })
      .then((r) => tapOf(p, `tab:${r.tapIndex}`)?.())
      .catch(() => {})
      .finally(() => setOpen(false));
  };
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { columnGap: 2, alignSelf: "flex-start" })}>
      <Surface base={half({ paddingLeft: s.lead[0], paddingRight: s.lead[1], columnGap: 8, borderTopLeftRadius: end, borderBottomLeftRadius: end, borderTopRightRadius: inner, borderBottomRightRadius: inner })} appearance={p} onPress={tapOf(p, "main") ?? (() => {})} label={p.label || p.icon} ink={look.ink}>
        {p.icon ? <Glyph name={p.icon} size={s.icon} color={look.ink} /> : null}
        {p.label ? <Words text={p.label} lines={1} style={merge(typeStyle(kit, s.type), { color: inkCss(look.ink) }, look.weight ? { fontWeight: look.weight } : null, capsOf(kit))} /> : null}
      </Surface>
      <View ariaRole="button" ariaLabel="More options" hoverClass="m3e-pressed" onClick={pressOf(more)} style={sx(half({ width: s.trail, borderTopRightRadius: end, borderBottomRightRadius: end, borderTopLeftRadius: open ? end : inner, borderBottomLeftRadius: open ? end : inner }))}>
        <View style={sx({ transform: open ? "rotate(180deg)" : "none" })}>
          <Glyph name="keyboard_arrow_down" size={s.arrow} color={look.ink} />
        </View>
      </View>
    </View>
  );
}

/* ---------- a FAB that opens a menu ---------- */

export type FabMenuProps = PartBase & {
  items?: ListRow[];
  icon?: string;
  /** the design draws it open: it starts open, then it is the visitor's */
  open?: boolean;
};

/** the corner of a FAB under the style's recipe, as the kit's FAB has it */
const fabRadius = (kit: Kit) => {
  const recipe = recipeOf(kit, "fab");
  return recipe === "round" ? 28 : recipe === "square" ? corner(kit, "md") : corner(kit, "lg") || controlRadius(kit, 56);
};

/** M3 Expressive's FAB menu: a FAB that turns into a round close button, its actions in pills stacked above it, at its
 *  right edge; a tap anywhere else closes them. */
export function FabMenu(props: FabMenuProps) {
  const p = withDefaults<FabMenuProps>("fab-menu", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [own, setOwn] = useState({ from: !!p.open, value: !!p.open });
  const open = own.from === !!p.open ? own.value : !!p.open;
  const toggle = (v: boolean) => setOwn({ from: !!p.open, value: v });
  const forced = extra(kit, "fabColor");
  const bg = typeof forced === "string" ? forced : "primary-container";
  const shadow = recipeOf(kit, "fab") === "flat" ? "none" : "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)";
  return (
    <View {...tagOf(p.testID)} style={sx({ position: "relative", width: 56, height: 56, flexShrink: 0, alignSelf: "flex-start" })}>
      {/* a tap outside the actions closes them */}
      {open ? <View onClick={() => toggle(false)} catchMove style={sx({ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: "90" })} /> : null}
      {open ? (
        <View ariaRole="menu" ariaLabel="Actions" style={sx({ position: "absolute", right: 0, bottom: 64, zIndex: "91", display: "flex", flexDirection: "column", alignItems: "flex-end", rowGap: 4 })}>
          {items.map((it, i) => (
            <View
              key={i}
              ariaRole="menuitem"
              ariaLabel={it.label || it.icon}
              hoverClass="m3e-pressed"
              onClick={pressOf(() => {
                toggle(false);
                tapOf(p, `tab:${i}`)?.();
              })}
              style={sx(ROW, { height: 56, boxSizing: "border-box", paddingLeft: 24, paddingRight: 24, columnGap: 8, whiteSpace: "nowrap", borderRadius: 28, backgroundColor: c("primary-container"), boxShadow: shadow })}
            >
              {it.icon ? <Glyph name={it.icon} size={24} color="on-primary-container" /> : null}
              {it.label ? <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: c("on-primary-container") }} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      <View
        ariaRole="button"
        ariaLabel={open ? "Close actions" : "Create"}
        hoverClass="m3e-pressed"
        onClick={pressOf(() => toggle(!open))}
        style={sx(ROW, { position: "relative", zIndex: open ? "91" : undefined, width: 56, height: 56, justifyContent: "center", borderRadius: open ? 28 : fabRadius(kit), backgroundColor: c(open ? "primary" : bg), boxShadow: shadow, transition: "border-radius 200ms, background-color 200ms" })}
      >
        {open ? <Glyph name="close" size={20} color="on-primary" /> : <Glyph name={p.icon || "add"} size={24} color={`on-${bg}`} />}
      </View>
    </View>
  );
}

/* ---------- a sign-in or pay button ---------- */

/** what each service's button looks like, after its own rules for its sign-in and payment buttons: its colors (the
 *  service's own, data as the canvas has them in parts/defs/mobile.ts); the service's mark is its SDK's to draw */
const BRAND_LOOK: Record<string, { bg: string; ink: string; edge?: boolean }> = {
  apple: { bg: "#000000", ink: "#ffffff" },
  google: { bg: "#ffffff", ink: "#1f1f1f", edge: true },
  wechat: { bg: "#07c160", ink: "#ffffff" },
  alipay: { bg: "#1677ff", ink: "#ffffff" },
  paypal: { bg: "#ffc439", ink: "#003087" },
  stripe: { bg: "#635bff", ink: "#ffffff" },
  github: { bg: "#24292f", ink: "#ffffff" },
  facebook: { bg: "#1877f2", ink: "#ffffff" },
  x: { bg: "#000000", ink: "#ffffff" },
  line: { bg: "#06c755", ink: "#ffffff" },
  kakao: { bg: "#fee500", ink: "#191919" },
};

const BRAND_NAMES: Record<string, string> = { apple: "Apple", google: "Google", wechat: "WeChat", alipay: "Alipay", paypal: "PayPal", stripe: "Stripe", github: "GitHub", facebook: "Facebook", x: "X", line: "LINE", kakao: "Kakao" };

/** the words a service's button says when the author gave none (the kit has no word list: English) */
export function brandWords(provider: string | undefined, intent: string | undefined): string {
  const name = BRAND_NAMES[provider ?? ""];
  if (!name) return intent === "pay" ? "Pay" : "Continue";
  return intent === "pay" ? `Pay with ${name}` : `Sign in with ${name}`;
}

/** the platform capability a press of the button asks for (docs/平台能力.md): it is the design's tap that invokes it */
export const brandCapability = (intent: string | undefined): "auth.oauth" | "payment.pay" => (intent === "pay" ? "payment.pay" : "auth.oauth");

/** a service's colors: its ground as CSS, its words as a hex or a role; the theme's inverse ones for a service the kit
 *  does not know */
export const brandLook = (provider: string | undefined): { bg: string; ink: string; edge: boolean } => {
  const look = BRAND_LOOK[provider ?? ""];
  return look ? { bg: look.bg, ink: look.ink, edge: !!look.edge } : { bg: c("inverse-surface"), ink: "inverse-on-surface", edge: false };
};

export type BrandButtonProps = PartBase & {
  provider?: string;
  intent?: "signin" | "pay";
  label?: string;
  width?: number;
  /** told which capability a press asks for, and of which service; the press itself is `onPress` */
  onAsk?: (capability: "auth.oauth" | "payment.pay", provider: string) => void;
};

export function BrandButton(props: BrandButtonProps) {
  const p = withDefaults<BrandButtonProps>("brand-button", props);
  const kit = useKit();
  const fill = useFill();
  const look = brandLook(p.provider);
  const words = p.label || brandWords(p.provider, p.intent);
  return (
    <Surface
      base={{ ...ROW, width: Math.round(p.width ?? 380), height: 40, paddingLeft: 16, paddingRight: 16, justifyContent: "center", columnGap: 8, borderRadius: controlRadius(kit, 40), backgroundColor: look.bg, ...(look.edge ? { border: `1px solid ${c("outline")}` } : null), flexShrink: 0, ...fill }}
      appearance={p}
      testID={p.testID}
      label={words}
      ink={look.ink}
      onPress={() => {
        p.onAsk?.(brandCapability(p.intent), p.provider ?? "other");
        p.onPress?.();
      }}
    >
      <Glyph name={p.intent === "pay" ? "payments" : "login"} size={20} color={look.ink} />
      <Words text={words} lines={1} style={{ ...typeStyle(kit, "label-large"), color: inkCss(look.ink) }} />
    </Surface>
  );
}

/* ---------- a command list ---------- */

/** the rows a command list shows for what is typed: each one whose words have it in them, by its place in the list */
export function commandMatches(items: ListRow[], query: string): number[] {
  const q = query.trim().toLowerCase();
  return items.flatMap((it, i) => (!q || (it.label ?? "").toLowerCase().includes(q) ? [i] : []));
}

export type CommandProps = PartBase & {
  placeholder?: string;
  heading?: string;
  items?: ListRow[];
  width?: number;
  /** what the words typed into it narrow the list to; given with `onSearch`, it is what the field shows */
  query?: string;
  onSearch?: (query: string) => void;
};

/** A command list as the canvas draws it, open: a search field and the commands under it. What is typed narrows the
 *  list (the visitor's own words, never sent anywhere); a tap on a command runs what it is wired to. */
export function Command(props: CommandProps) {
  const p = withDefaults<CommandProps>("command", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [own, setOwn] = useState("");
  const query = p.onSearch ? (p.query ?? "") : own;
  const shown = commandMatches(items, query);
  return (
    <Surface base={{ display: "flex", flexDirection: "column", boxSizing: "border-box", width: Math.round(p.width ?? 384), padding: 4, borderRadius: corner(kit, "xl"), border: `1px solid ${c("outline-variant")}`, backgroundColor: c("surface-container-high"), alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      <View style={sx({ padding: 4, paddingBottom: 0 })}>
        <View style={sx(ROW, { height: 56, columnGap: 12, paddingLeft: 16, paddingRight: 16, borderRadius: 28, backgroundColor: c("surface-container-highest") })}>
          <Glyph name="search" size={20} color="on-surface-variant" />
          <TaroInput
            ariaLabel="Search commands"
            value={query}
            placeholder={p.placeholder}
            placeholderStyle={`color: ${c("on-surface-variant")}`}
            onInput={(e) => {
              setOwn(e.detail.value);
              p.onSearch?.(e.detail.value);
            }}
            style={sx(BARE, typeStyle(kit, "label-large"), { flex: 1, minWidth: 0, color: c("on-surface") })}
          />
        </View>
      </View>
      {shown.length ? (
        <View style={sx({ padding: 4 })}>
          {p.heading ? <Words text={p.heading} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant"), paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }} /> : null}
          {shown.map((i) => (
            <View key={i} ariaRole="menuitem" ariaLabel={items[i].label} hoverClass="m3e-pressed" onClick={pressOf(tapOf(p, `tab:${i}`) ?? (() => {}))} style={sx(ROW, { minHeight: 48, boxSizing: "border-box", paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, columnGap: 12, borderRadius: corner(kit, "md") })}>
              {items[i].icon ? <Glyph name={items[i].icon!} size={20} color="on-surface" /> : null}
              <Words text={items[i].label} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface"), flex: 1 }} />
            </View>
          ))}
        </View>
      ) : (
        <Words text="No results found." style={{ ...typeStyle(kit, "label-large"), color: c("on-surface"), textAlign: "center", paddingTop: 24, paddingBottom: 24 }} />
      )}
    </Surface>
  );
}

/* ---------- a context menu ---------- */

export type ContextMenuProps = PartBase & { label?: string; items?: ListRow[]; width?: number; height?: number };

/** An area that opens the platform's action sheet of its rows when it is held down, as a right click does on the web. */
export function ContextMenu(props: ContextMenuProps) {
  const p = withDefaults<ContextMenuProps>("context-menu", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  return (
    <View
      {...tagOf(p.testID)}
      ariaRole="button"
      ariaLabel={p.label}
      onLongPress={() => sheet(items.map((it) => it.label), (i) => tapOf(p, `tab:${i}`)?.())}
      style={sx(ROW, { boxSizing: "border-box", width: Math.round(p.width ?? 256), height: Math.round(p.height ?? 128), justifyContent: "center", borderRadius: corner(kit, "lg"), border: `1px dashed ${c("outline")}`, ...fill })}
    >
      <Words text={p.label} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), textAlign: "center" }} />
    </View>
  );
}

/* ---------- a bar of filters ---------- */

export type FilterBarProps = PartBase & {
  placeholder?: string;
  filters?: ListRow[];
  width?: number;
  /** told of what is typed into its search field */
  onChangeText?: (text: string) => void;
  /** told of the filters turned on, by their place */
  onFilter?: (on: number[]) => void;
};

/** a filter chip turned on or off among those that are on */
export const toggled = (on: number[], i: number) => (on.includes(i) ? on.filter((x) => x !== i) : [...on, i].sort((a, b) => a - b));

/** A search field and a row of filter chips, as the canvas draws them: what is typed and the chips turned on are the
 *  visitor's (they narrow what the screen shows, which is the screen's to do), each handed out as it changes. */
export function FilterBar(props: FilterBarProps) {
  const p = withDefaults<FilterBarProps>("filter-bar", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useState("");
  const [on, setOn] = useState<number[]>([]);
  const [focused, setFocused] = useState(false);
  const { box, focus } = fieldStyle(kit, "outlined");
  const filters = p.filters ?? [];
  const radius = recipeOf(kit, "chip") === "pill" ? 16 : recipeOf(kit, "chip") === "tag" ? corner(kit, "xs") : Math.min(corner(kit, "sm"), controlRadius(kit, 32));
  return (
    <View {...tagOf(p.testID)} style={sx({ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, width: Math.round(p.width ?? 420), ...fill })}>
      <View style={sx(merge(ROW, { flexGrow: 1, flexBasis: 160, minWidth: 160, height: 56, boxSizing: "border-box", paddingLeft: 16, paddingRight: 16 }, box, focused ? focus : null))}>
        <TaroInput
          type="text"
          confirmType="search"
          ariaLabel={p.placeholder || "Search"}
          value={text}
          placeholder={p.placeholder}
          placeholderStyle={`color: ${c("on-surface-variant")}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={(e) => {
            setText(e.detail.value);
            p.onChangeText?.(e.detail.value);
          }}
          style={sx(BARE, typeStyle(kit, "body-large"), { flex: 1, minWidth: 0, color: c("on-surface") })}
        />
      </View>
      {filters.map((f, i) => {
        const chosen = on.includes(i);
        /* a role or a color the style names, for the glyph and (as CSS) the words */
        const ink = chosen ? ((extra(kit, "chipOnText") as string | undefined) ?? "on-secondary-container") : "on-surface-variant";
        return (
          <View
            key={i}
            ariaRole="checkbox"
            ariaLabel={f.label}
            ariaChecked={chosen}
            hoverClass="m3e-pressed"
            onClick={pressOf(() => {
              const next = toggled(on, i);
              setOn(next);
              p.onFilter?.(next);
            })}
            style={sx(ROW, { height: 32, boxSizing: "border-box", paddingLeft: chosen ? 8 : 16, paddingRight: 16, columnGap: 8, flexShrink: 0, borderRadius: radius, ...(chosen ? { backgroundColor: extraColor(kit, "chipOn") ?? c("secondary-container") } : { border: `1px solid ${c("outline-variant")}` }) })}
          >
            {chosen ? <Glyph name="check" size={18} color={ink} /> : null}
            <Words text={f.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: inkCss(ink) }} />
          </View>
        );
      })}
    </View>
  );
}

/* ---------- a menu with a submenu ---------- */

/** The rows of a cascading menu's first sheet: its items, as many as fit beside the row that opens the submenu, and
 *  that row last; each row's place (`tab:N`), or "sub" for the submenu's. */
export function cascadeSheet(items: ListRow[], subLabel: string | undefined, subCount: number): { labels: string[]; places: string[] } {
  const sub = subCount > 0;
  const kept = items.slice(0, sub ? SHEET_ROWS - 1 : SHEET_ROWS);
  return { labels: [...kept.map((it) => it.label), ...(sub ? [subLabel || "More"] : [])], places: [...kept.map((_, i) => `tab:${i}`), ...(sub ? ["sub"] : [])] };
}

export type CascadingMenuProps = PartBase & { label?: string; items?: ListRow[]; subLabel?: string; subItems?: ListRow[] };

/** A button that opens the platform's action sheet of the menu, its last row opening a second sheet of the submenu. */
export function CascadingMenu(props: CascadingMenuProps) {
  const p = withDefaults<CascadingMenuProps>("cascading-menu", props);
  const kit = useKit();
  const look = buttonColors(kit, "outlined");
  const items = p.items ?? [];
  const sub = p.subItems ?? [];
  const open = () => {
    const first = cascadeSheet(items, p.subLabel, sub.length);
    sheet(first.labels, (i) => {
      const place = first.places[i];
      if (place !== "sub") return tapOf(p, place)?.();
      sheet(
        sub.map((it) => it.label),
        (j) => tapOf(p, `sub:${j}`)?.(),
      );
    });
  };
  return (
    <Surface base={{ ...ROW, height: 40, paddingLeft: 16, paddingRight: 16, columnGap: 8, borderRadius: controlRadius(kit, 40), alignSelf: "flex-start", ...look.box }} appearance={p} testID={p.testID} onPress={open} label={p.label} ink={look.ink}>
      <Words text={p.label} style={merge(typeStyle(kit, "label-large"), { color: inkCss(look.ink) }, capsOf(kit))} />
      <Glyph name="arrow_drop_down" size={20} color={look.ink} />
    </Surface>
  );
}
