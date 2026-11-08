import { useRef, useState, type ReactNode } from "react";
import { Dimensions, Modal, Pressable, Text as RNText, TextInput, View, type AccessibilityActionEvent, type HostInstance, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { buttonColors } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { elevation } from "../look";
import { withDefaults, type ListRow } from "../parts";
import { Popup } from "../picker";
import { capsOf, extra, extraColor, fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { controlRadius, corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* Actions, and menus and search, on a phone (parts/defs/actions.ts, mobile.ts, menus.ts, navigation.ts, data.ts,
 * additions.ts): a split button, a FAB that opens a menu of actions, a sign-in or pay button, a command list, a context
 * menu, a bar of filters and a menu with a submenu. A menu opens over the screen when its trigger is tapped (a `Modal`,
 * as the kit's select and menu open): the editor draws it closed, its content is the app's. Each of its rows is a place
 * of its own (`tab:N`, `sub:N`): a tap runs what that place is wired to, and the menu closes.
 *
 * A sign-in or pay button decides nothing (docs/平台能力.md): its press is what the design wires to it, which invokes
 * `auth.oauth` or `payment.pay`; it says which it asks for (`onAsk`), and what comes back is the service's and the back
 * end's to say, never the button's. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** one action of a menu: its icon, its words, and a chevron when it opens more */
function MenuRow({ label, icon, more, back, onPress }: { label: string; icon?: string; more?: boolean; back?: boolean; onPress: () => void }) {
  const kit = useKit();
  const ink = c(kit, "on-surface");
  return (
    <Pressable accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={more ? { expanded: false } : undefined} onPress={onPress} style={({ pressed }) => ({ height: 48, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 12, backgroundColor: pressed ? c(kit, "surface-container-highest") : "transparent" })}>
      {back ? <Glyph name="arrow_back" size={24} color={c(kit, "on-surface-variant")} /> : icon ? <Glyph name={icon} size={24} color={c(kit, "on-surface-variant")} /> : null}
      <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "label-large"), color: ink }}>{label}</RNText>
      {more ? <Glyph name="chevron_right" size={24} color={c(kit, "on-surface-variant")} /> : null}
    </Pressable>
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
  const items = p.menuItems ?? [];
  const half = (rest: ViewStyle): ViewStyle => ({ height: s.h, flexDirection: "row", alignItems: "center", justifyContent: "center", ...look.box, ...rest });
  const run = (slot: string) => {
    setOpen(false);
    tapOf(p, slot)?.();
  };
  return (
    <View testID={p.testID} style={{ flexDirection: "row", columnGap: 2, alignSelf: "flex-start" }}>
      <Surface base={half({ paddingLeft: s.lead[0], paddingRight: s.lead[1], columnGap: 8, borderTopLeftRadius: end, borderBottomLeftRadius: end, borderTopRightRadius: inner, borderBottomRightRadius: inner })} appearance={p} onPress={tapOf(p, "main") ?? (() => {})} accessibilityLabel={p.label || p.icon}>
        {p.icon ? <Glyph name={p.icon} size={s.icon} color={look.ink} /> : null}
        {p.label ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, s.type), color: look.ink, ...(look.weight ? { fontWeight: look.weight } : null), ...capsOf(kit) }}>{p.label}</RNText> : null}
      </Surface>
      {/* while its menu is open the trailing half is a circle and its arrow points up */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More options"
        accessibilityState={p.menu ? { expanded: open } : undefined}
        onPress={() => (p.menu ? setOpen(true) : tapOf(p, "more")?.())}
        style={({ pressed }) => [half({ width: s.trail, borderTopRightRadius: end, borderBottomRightRadius: end, borderTopLeftRadius: open ? end : inner, borderBottomLeftRadius: open ? end : inner }), pressed ? { opacity: 0.85 } : null]}
      >
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Glyph name="keyboard_arrow_down" size={s.arrow} color={look.ink} />
        </View>
      </Pressable>
      {p.menu ? (
        <Popup open={open} onClose={() => setOpen(false)}>
          {items.map((it, i) => (
            <MenuRow key={i} label={it.label} icon={it.icon} onPress={() => run(`tab:${i}`)} />
          ))}
        </Popup>
      ) : null}
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

/** where a FAB stands on the screen: from the right and from the foot of the window */
type Anchor = { right: number; bottom: number };

/** M3 Expressive's FAB menu: a FAB that turns into a round close button, its actions in pills stacked above it, at its
 *  right edge. They open over the screen (a `Modal`, standing where the FAB is); a tap outside them closes them. */
export function FabMenu(props: FabMenuProps) {
  const p = withDefaults<FabMenuProps>("fab-menu", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [open, setOpen] = useState({ from: !!p.open, value: !!p.open });
  const shown = open.from === !!p.open ? open.value : !!p.open;
  const toggle = (v: boolean) => setOpen({ from: !!p.open, value: v });
  const trigger = useRef<HostInstance>(null);
  /* where the FAB is, measured as it is laid out; before that, where a FAB stands: the screen's foot, at its right */
  const [anchor, setAnchor] = useState<Anchor>({ right: 16, bottom: 16 });
  const measure = () =>
    trigger.current?.measureInWindow?.((x, y, w, h) => {
      if (!w && !h) return;
      const win = Dimensions.get("window");
      setAnchor({ right: Math.max(0, win.width - x - w), bottom: Math.max(0, win.height - y - h) });
    });
  /* the FAB's corner and color under the style's recipe, as the kit's FAB has them */
  const recipe = recipeOf(kit, "fab");
  const radius = recipe === "round" ? 28 : recipe === "square" ? corner(kit, "md") : corner(kit, "lg") || controlRadius(kit, 56);
  const forced = extra(kit, "fabColor");
  const bg = typeof forced === "string" ? forced : "primary-container";
  const pick = (i: number) => {
    toggle(false);
    tapOf(p, `tab:${i}`)?.();
  };
  return (
    <View testID={p.testID} ref={trigger} onLayout={measure} collapsable={false} style={{ alignSelf: "flex-start" }}>
      <Surface
        base={{ width: 56, height: 56, borderRadius: radius, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, bg), boxShadow: recipe === "flat" ? undefined : elevation(3) }}
        appearance={p}
        onPress={() => {
          measure();
          toggle(true);
        }}
        accessibilityLabel="Create"
      >
        <Glyph name={p.icon || "add"} size={24} color={c(kit, `on-${bg}`)} />
      </Surface>
      <Modal transparent visible={shown} animationType="fade" onRequestClose={() => toggle(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => toggle(false)} style={{ flex: 1 }}>
          <View accessibilityRole="menu" accessibilityLabel="Actions" pointerEvents="box-none" style={{ position: "absolute", right: anchor.right, bottom: anchor.bottom + 56 + 8, alignItems: "flex-end", rowGap: 4 }}>
            {items.map((it, i) => (
              <Pressable key={i} accessibilityRole="menuitem" accessibilityLabel={it.label || it.icon} onPress={() => pick(i)} style={({ pressed }) => ({ height: 56, borderRadius: 28, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", columnGap: 8, backgroundColor: c(kit, "primary-container"), boxShadow: elevation(3), opacity: pressed ? 0.85 : 1 })}>
                {it.icon ? <Glyph name={it.icon} size={24} color={c(kit, "on-primary-container")} /> : null}
                {it.label ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-primary-container") }}>{it.label}</RNText> : null}
              </Pressable>
            ))}
          </View>
          {/* the FAB, open: a round button that closes the menu, where the FAB was */}
          <Pressable accessibilityRole="button" accessibilityLabel="Close actions" accessibilityState={{ expanded: true }} onPress={() => toggle(false)} style={{ position: "absolute", right: anchor.right, bottom: anchor.bottom, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, "primary"), boxShadow: elevation(3) }}>
            <Glyph name="close" size={20} color={c(kit, "on-primary")} />
          </Pressable>
        </Pressable>
      </Modal>
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
  const look = BRAND_LOOK[p.provider ?? ""];
  const bg = look?.bg ?? c(kit, "inverse-surface");
  const ink = look?.ink ?? c(kit, "inverse-on-surface");
  const words = p.label || brandWords(p.provider, p.intent);
  return (
    <Surface
      base={{ width: Math.round(p.width ?? 380), height: 40, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 8, borderRadius: controlRadius(kit, 40), backgroundColor: bg, ...(look?.edge ? { borderWidth: 1, borderColor: c(kit, "outline") } : null), ...fill }}
      appearance={p}
      testID={p.testID}
      accessibilityLabel={words}
      onPress={() => {
        p.onAsk?.(brandCapability(p.intent), p.provider ?? "other");
        p.onPress?.();
      }}
    >
      <Glyph name={p.intent === "pay" ? "payments" : "login"} size={20} color={ink} />
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: ink }}>{words}</RNText>
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
    <Surface base={{ width: Math.round(p.width ?? 384), padding: 4, borderRadius: corner(kit, "xl"), borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface-container-high"), alignSelf: "flex-start", ...fill }} appearance={p} testID={p.testID}>
      <View style={{ padding: 4, paddingBottom: 0 }}>
        <View style={{ height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 16, backgroundColor: c(kit, "surface-container-highest") }}>
          <Glyph name="search" size={20} color={c(kit, "on-surface-variant")} />
          <TextInput
            accessibilityLabel="Search commands"
            value={query}
            onChangeText={(v) => {
              setOwn(v);
              p.onSearch?.(v);
            }}
            placeholder={p.placeholder}
            placeholderTextColor={c(kit, "on-surface-variant")}
            style={{ flex: 1, ...typeStyle(kit, "label-large"), color: c(kit, "on-surface"), paddingVertical: 0 }}
          />
        </View>
      </View>
      {shown.length ? (
        <View style={{ padding: 4 }}>
          {p.heading ? <RNText style={{ paddingHorizontal: 12, paddingVertical: 8, ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.heading}</RNText> : null}
          {shown.map((i) => (
            <Pressable key={i} accessibilityRole="menuitem" accessibilityLabel={items[i].label} onPress={tapOf(p, `tab:${i}`)} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: corner(kit, "md"), flexDirection: "row", alignItems: "center", columnGap: 12, backgroundColor: pressed ? c(kit, "surface-container-highest") : "transparent" })}>
              {items[i].icon ? <Glyph name={items[i].icon} size={20} color={c(kit, "on-surface")} /> : null}
              <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{items[i].label}</RNText>
            </Pressable>
          ))}
        </View>
      ) : (
        <RNText accessibilityLiveRegion="polite" style={{ paddingVertical: 24, textAlign: "center", ...typeStyle(kit, "label-large"), color: c(kit, "on-surface") }}>No results found.</RNText>
      )}
    </Surface>
  );
}

/* ---------- a context menu ---------- */

export type ContextMenuProps = PartBase & { label?: string; items?: ListRow[]; width?: number; height?: number };

/** An area that opens a menu when it is held down, as a right click does on the web; a screen reader opens it with its
 *  long press action. */
export function ContextMenu(props: ContextMenuProps) {
  const p = withDefaults<ContextMenuProps>("context-menu", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useState(false);
  const items = p.items ?? [];
  const run = (i: number) => {
    setOpen(false);
    tapOf(p, `tab:${i}`)?.();
  };
  return (
    <>
      <Pressable
        testID={p.testID}
        accessibilityRole="button"
        accessibilityLabel={p.label}
        accessibilityHint="Opens a menu when held down"
        accessibilityActions={[{ name: "longpress" }]}
        onAccessibilityAction={(e: AccessibilityActionEvent) => e.nativeEvent.actionName === "longpress" && setOpen(true)}
        onLongPress={() => setOpen(true)}
        style={{ width: Math.round(p.width ?? 256), height: Math.round(p.height ?? 128), borderRadius: corner(kit, "lg"), borderWidth: 1, borderStyle: "dashed", borderColor: c(kit, "outline"), alignItems: "center", justifyContent: "center", ...fill }}
      >
        <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), textAlign: "center" }}>{p.label}</RNText>
      </Pressable>
      <Popup open={open} onClose={() => setOpen(false)}>
        {items.map((it, i) => (
          <MenuRow key={i} label={it.label} icon={it.icon} onPress={() => run(i)} />
        ))}
      </Popup>
    </>
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
    <View testID={p.testID} style={{ width: Math.round(p.width ?? 420), flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, ...fill }}>
      <View style={{ flexGrow: 1, flexBasis: 160, minWidth: 160 }}>
        <TextInput
          accessibilityLabel={p.placeholder || "Search"}
          value={text}
          onChangeText={(v) => {
            setText(v);
            p.onChangeText?.(v);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={p.placeholder}
          placeholderTextColor={c(kit, "on-surface-variant")}
          keyboardType="web-search"
          style={{ height: 56, paddingHorizontal: 16, paddingVertical: 0, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), ...box, ...(focused ? focus : null) }}
        />
      </View>
      {filters.map((f, i) => {
        const chosen = on.includes(i);
        const ink = chosen ? (extraColor(kit, "chipOnText") ?? c(kit, "on-secondary-container")) : c(kit, "on-surface-variant");
        return (
          <Pressable
            key={i}
            accessibilityRole="togglebutton"
            accessibilityLabel={f.label}
            accessibilityState={{ checked: chosen }}
            onPress={() => {
              const next = toggled(on, i);
              setOn(next);
              p.onFilter?.(next);
            }}
            style={{ height: 32, paddingLeft: chosen ? 8 : 16, paddingRight: 16, flexDirection: "row", alignItems: "center", columnGap: 8, borderRadius: radius, ...(chosen ? { backgroundColor: extraColor(kit, "chipOn") ?? c(kit, "secondary-container") } : { borderWidth: 1, borderColor: c(kit, "outline-variant") }) }}
          >
            {chosen ? <Glyph name="check" size={18} color={ink} /> : null}
            <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{f.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- a menu with a submenu ---------- */

export type CascadingMenuProps = PartBase & { label?: string; items?: ListRow[]; subLabel?: string; subItems?: ListRow[] };

/** A button that opens a menu whose last row opens its submenu: on a phone the submenu takes the menu's place, with a
 *  row to go back, rather than standing beside it. */
export function CascadingMenu(props: CascadingMenuProps) {
  const p = withDefaults<CascadingMenuProps>("cascading-menu", props);
  const kit = useKit();
  const [open, setOpen] = useState<"" | "menu" | "sub">("");
  const look = buttonColors(kit, "outlined");
  const items = p.items ?? [];
  const sub = p.subItems ?? [];
  const run = (slot: string) => {
    setOpen("");
    tapOf(p, slot)?.();
  };
  let rows: ReactNode;
  if (open === "sub")
    rows = (
      <>
        <MenuRow label={p.subLabel || "Back"} back onPress={() => setOpen("menu")} />
        {sub.map((it, i) => (
          <MenuRow key={i} label={it.label} icon={it.icon} onPress={() => run(`sub:${i}`)} />
        ))}
      </>
    );
  else
    rows = (
      <>
        {items.map((it, i) => (
          <MenuRow key={i} label={it.label} icon={it.icon} onPress={() => run(`tab:${i}`)} />
        ))}
        {sub.length ? <MenuRow label={p.subLabel || "More"} more onPress={() => setOpen("sub")} /> : null}
      </>
    );
  return (
    <View testID={p.testID} style={{ alignSelf: "flex-start" }}>
      <Surface base={{ height: 40, paddingHorizontal: 16, borderRadius: controlRadius(kit, 40), flexDirection: "row", alignItems: "center", columnGap: 8, ...look.box }} appearance={p} onPress={() => setOpen("menu")} accessibilityLabel={p.label}>
        <RNText style={{ ...typeStyle(kit, "label-large"), color: look.ink, ...capsOf(kit) }}>{p.label}</RNText>
      </Surface>
      <Popup open={open !== ""} onClose={() => setOpen("")}>
        {rows}
      </Popup>
    </View>
  );
}
