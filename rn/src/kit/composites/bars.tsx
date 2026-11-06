import { useState } from "react";
import { Pressable, Text as RNText, TextInput, View, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { accentText, barStyle, extra, extraColor } from "../recipes";
import { Surface } from "../Surface";
import { controlRadius, corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";

/* The bars a screen is framed by and moves with: the app bar, the navigation bar, tabs, search and the floating action
 * button. Each is composed the way its style composes it (lib/styles/recipes: `appbar`, `bar`, `nav`, `tabs`, `search`,
 * `fab`): iOS's centered title with "Back", WeChat's grey bar, Spotify's row of capsules. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";
const BACK = ["arrow_back", "arrow_back_ios", "arrow_back_ios_new", "chevron_left"];

/** a tap on one of a part's places, else on the part */
export const tapOf = (p: PartBase, slot: string) => p.taps?.[slot] ?? p.onPress;

/* ---------- the app bar ---------- */

export type AppBarProps = PartBase & { title?: string; subtitle?: string; size?: "small" | "medium" | "large"; leading?: string; trailing?: string; trailing2?: string; centered?: boolean; scrolled?: boolean; width?: number };

export function AppBar(props: AppBarProps) {
  const p = withDefaults<AppBarProps>("app-bar", props);
  const kit = useKit();
  const fill = useFill();
  const recipe = recipeOf(kit, "appbar");
  const ios = recipe === "ios";
  const centered = !!p.centered || recipe === "center" || ios || recipeOf(kit, "bar") === "center";
  const row = ios ? 44 : recipe === "compact" ? 48 : 64;
  const big = p.size === "large" || p.size === "medium" || (recipe === "large" && p.size !== "small");
  const back = BACK.includes(p.leading ?? "");
  const iconInk = ios ? c(kit, "primary") : extraColor(kit, "appbarIcon") ?? c(kit, "on-surface-variant");
  const titleInk = c(kit, "on-surface");
  const bar: ViewStyle = {
    ...barStyle(kit),
    ...(recipeOf(kit, "bar") === "m3" ? { backgroundColor: p.scrolled ? c(kit, "surface-container") : c(kit, "surface") } : null),
    ...(extraColor(kit, "appbarBg") ? { backgroundColor: extraColor(kit, "appbarBg") } : null),
    ...(extraColor(kit, "barLine") ? { borderBottomWidth: 0.5, borderBottomColor: extraColor(kit, "barLine") } : null),
    width: Math.round(p.width ?? 412),
    ...fill,
  };
  const icon = (name: string | undefined, slot: string, label: string) =>
    name ? (
      <Pressable key={slot} accessibilityRole="button" accessibilityLabel={label} onPress={tapOf(p, slot)} style={{ width: ios ? 36 : 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={ios && back ? "chevron_left" : name} size={24} color={iconInk} />
      </Pressable>
    ) : null;
  const leading =
    p.leading && ios && back ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={tapOf(p, "icon")} style={{ flexDirection: "row", alignItems: "center", height: 44 }}>
        <Glyph name="chevron_left" size={24} color={iconInk} />
        <RNText style={{ ...typeStyle(kit, "body-large"), color: iconInk }}>Back</RNText>
      </Pressable>
    ) : (
      icon(p.leading, "icon", "Navigate")
    );
  const trailing = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {icon(p.trailing, "icon2", "More")}
      {icon(p.trailing2, "icon3", "Action")}
    </View>
  );
  const title = (
    <View style={{ flexShrink: 1, alignItems: centered ? "center" : "flex-start" }}>
      {!big || ios ? (
        <RNText numberOfLines={1} style={{ ...typeStyle(kit, ios ? "title-medium" : "title-large"), ...(ios ? { fontSize: 17, fontWeight: "600" } : null), color: titleInk }}>
          {big && (ios || recipe === "large") ? "" : p.title}
        </RNText>
      ) : null}
      {p.subtitle && !big ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.subtitle}</RNText> : null}
    </View>
  );
  return (
    <Surface base={bar} appearance={p} testID={p.testID}>
      <View style={{ height: row, flexDirection: "row", alignItems: "center", paddingHorizontal: ios ? 8 : 4 }}>
        {centered ? (
          <>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>{leading}</View>
            {title}
            <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>{trailing}</View>
          </>
        ) : (
          <>
            {leading}
            <View style={{ flex: 1, paddingLeft: p.leading ? 4 : 12 }}>{big ? null : title}</View>
            {trailing}
          </>
        )}
      </View>
      {big ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: ios ? 8 : p.size === "large" ? 12 : 16, paddingTop: ios ? 4 : 0 }}>
          <RNText numberOfLines={2} style={{ ...typeStyle(kit, ios || recipe === "large" ? "headline-large" : p.size === "large" ? "display-small" : "headline-small"), ...(ios ? { fontSize: 34, lineHeight: 41, fontWeight: "700" } : typeof extra(kit, "largeTitle") === "number" ? { fontSize: Number(extra(kit, "largeTitle")), lineHeight: Number(extra(kit, "largeTitle")) + 8, fontWeight: "600" } : null), color: titleInk }}>
            {p.title}
          </RNText>
          {p.subtitle ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.subtitle}</RNText> : null}
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- the navigation bar ---------- */

export type NavigationBarProps = PartBase & { items?: ListRow[]; selected?: number; tall?: boolean; layout?: "vertical" | "horizontal"; elevated?: boolean; badge?: number; badgeOn?: number; width?: number };

/** The bar of destinations at the foot. Material puts the chosen one's icon in a pill; iOS and WeChat tint it and fill its
 *  glyph; a floating style lifts the bar into a capsule. A tap chooses it, then runs what it is wired to. */
export function NavigationBar(props: NavigationBarProps) {
  const p = withDefaults<NavigationBarProps>("navigation-bar", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useState(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)));
  const recipe = recipeOf(kit, "nav");
  const pill = recipe === "m3" || recipe === "block";
  const floating = recipe === "floating";
  const labelSize = extra(kit, "navLabelSize");
  const inactive = extraColor(kit, "navInactive") ?? c(kit, "on-surface-variant");
  const onColor = kit.st.navOn ?? c(kit, "primary");
  const bar: ViewStyle = {
    flexDirection: "row",
    height: p.tall ? 80 : 64,
    alignItems: "stretch",
    backgroundColor: extraColor(kit, "navBg") ?? kit.st.navBg ?? c(kit, "surface-container"),
    ...(extraColor(kit, "navLine") ? { borderTopWidth: 0.5, borderTopColor: extraColor(kit, "navLine") } : null),
    ...(recipe === "plain" && !extraColor(kit, "navLine") && !extra(kit, "navNoLine") ? { borderTopWidth: 0.5, borderTopColor: c(kit, "outline-variant") } : null),
    ...(floating ? { borderRadius: 32, marginHorizontal: 16, boxShadow: "0px 4px 16px 0px #00000026" } : null),
    ...(p.elevated ? { boxShadow: "0px 2px 6px 2px #00000026" } : null),
    width: Math.round(p.width ?? 412),
    ...fill,
  };
  const glass = extra(kit, "navBlur");
  return (
    <Surface base={bar} appearance={glass ? { ...p, look: { ...p.look, glass: Number(glass) } } : p} testID={p.testID}>
      {items.map((it, i) => {
        const on = i === chosen;
        const ink = on ? (pill ? c(kit, "on-secondary-container") : onColor) : inactive;
        const badge = p.badge && i === (p.badgeOn ?? 0) - 1 ? p.badge : 0;
        return (
          <Pressable
            key={i}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            onPress={() => {
              setChosen(i);
              tapOf(p, `tab:${i}`)?.();
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", flexDirection: p.layout === "horizontal" ? "row" : "column", columnGap: 4, rowGap: pill ? 4 : 2, paddingTop: 4 }}
          >
            <View style={{ width: pill ? 56 : 32, height: 32, borderRadius: pill ? 16 : 0, alignItems: "center", justifyContent: "center", backgroundColor: on && pill ? (kit.st.navActive ?? c(kit, "secondary-container")) : "transparent" }}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={on && pill ? c(kit, "on-secondary-container") : ink} />
              {badge ? (
                <View style={{ position: "absolute", top: 0, right: pill ? 10 : -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c(kit, "error"), alignItems: "center", justifyContent: "center" }}>
                  <RNText style={{ ...typeStyle(kit, "label-small"), lineHeight: 16, color: c(kit, "on-error") }}>{String(badge)}</RNText>
                </View>
              ) : null}
            </View>
            {recipe === "icononly" ? null : (
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), ...(typeof labelSize === "number" ? { fontSize: labelSize, lineHeight: labelSize + 4 } : null), color: on ? (pill ? c(kit, "on-surface") : onColor) : inactive, fontWeight: on && pill ? "700" : (typeStyle(kit, "label-medium").fontWeight as "500") }}>
                {it.label}
              </RNText>
            )}
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- tabs ---------- */

export type TabsProps = PartBase & { items?: ListRow[]; selected?: number; variant?: "primary" | "secondary" | "segmented"; width?: number };

/** A row of tabs: Material's underlined row, iOS's segmented control, a row of capsules. A tap chooses one. */
export function Tabs(props: TabsProps) {
  const p = withDefaults<TabsProps>("tabs", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useState(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)));
  const recipe = recipeOf(kit, "tabs");
  const segmented = p.variant === "segmented" || recipe === "segmented";
  const capsules = recipe === "pill" || extra(kit, "tabsCapsules") === 1;
  const onColor = kit.st.tabOn ?? c(kit, "primary");
  const w = Math.round(p.width ?? 360);
  const tap = (i: number) => {
    setChosen(i);
    tapOf(p, `tab:${i}`)?.();
  };
  if (segmented)
    return (
      <Surface base={{ width: w, height: 36, flexDirection: "row", padding: 2, borderRadius: 18, backgroundColor: withAlpha(c(kit, "on-surface"), kit.dark ? 0.16 : 0.07), ...fill }} appearance={p} testID={p.testID}>
        {items.map((it, i) => (
          <Pressable key={i} accessibilityRole="tab" accessibilityState={{ selected: i === chosen }} onPress={() => tap(i)} style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: i === chosen ? (kit.dark ? c(kit, "surface-container-highest") : "#FFFFFF") : "transparent", boxShadow: i === chosen ? "0px 1px 3px 0px #0000001F" : undefined }}>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), fontWeight: i === chosen ? "600" : "400", color: c(kit, "on-surface") }}>
              {it.label}
            </RNText>
          </Pressable>
        ))}
      </Surface>
    );
  if (capsules)
    return (
      <Surface base={{ width: w, height: 48, flexDirection: "row", alignItems: "center", columnGap: 8, ...fill }} appearance={p} testID={p.testID}>
        {items.map((it, i) => (
          <Pressable key={i} accessibilityRole="tab" accessibilityState={{ selected: i === chosen }} onPress={() => tap(i)} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: "center", backgroundColor: i === chosen ? c(kit, "primary") : c(kit, "surface-container-high") }}>
            <RNText style={{ ...typeStyle(kit, "label-large"), fontWeight: "400", color: i === chosen ? c(kit, "on-primary") : c(kit, "on-surface") }}>{it.label}</RNText>
          </Pressable>
        ))}
      </Surface>
    );
  const short = recipe === "short";
  return (
    <Surface base={{ width: w, height: 48, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c(kit, "surface-container-highest"), ...fill }} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const on = i === chosen;
        return (
          <Pressable key={i} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => tap(i)} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, height: 24 }}>
              {it.icon ? <Glyph name={it.icon} size={24} filled={on} color={on ? onColor : c(kit, "on-surface-variant")} /> : null}
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: on ? (p.variant === "secondary" || short ? c(kit, "on-surface") : onColor) : c(kit, "on-surface-variant"), ...(on && short ? { fontWeight: "600" } : null), ...(kit.theme.capsLabels ? { textTransform: "uppercase" } : null) }}>
                {it.label}
              </RNText>
              {/* the primary tabs' indicator is as wide as the words, the secondary's as the tab */}
              {on && p.variant !== "secondary" ? <View style={{ position: "absolute", bottom: -12, left: short ? undefined : -2, right: short ? undefined : -2, alignSelf: "center", width: short ? 20 : undefined, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: onColor }} /> : null}
            </View>
            {on && p.variant === "secondary" ? <View style={{ position: "absolute", bottom: 0, height: 2, width: "100%", backgroundColor: onColor }} /> : null}
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- search ---------- */

export type SearchProps = PartBase & { kind?: "view" | "bar"; styleVariant?: "elevated" | "outlined"; placeholder?: string; leading?: string; trailing?: string; size?: "default" | "sm"; results?: ListRow[]; width?: number };

/** Search: Material's floating bar (or its open view with suggestions), the style's grey box, iOS's Cancel beside it */
export function Search(props: SearchProps) {
  const p = withDefaults<SearchProps>("search", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const recipe = recipeOf(kit, "search");
  const ios = recipe === "cancel";
  const own = recipe !== "m3";
  const h = own ? (recipe === "pill" ? 44 : recipe === "boxed" ? 32 : 36) : p.size === "sm" ? 48 : 56;
  const ground = extraColor(kit, "searchBg") ?? (ios ? withAlpha(c(kit, "on-surface"), 0.07) : recipe === "filled" ? c(kit, "surface-container-highest") : recipe === "pill" || recipe === "boxed" ? c(kit, "surface-container-low") : c(kit, "surface-container-high"));
  const box: ViewStyle = {
    flex: 1,
    height: h,
    flexDirection: "row",
    alignItems: "center",
    columnGap: own ? 6 : 16,
    paddingHorizontal: own ? 8 : 16,
    backgroundColor: ground,
    borderRadius: ios ? 10 : recipe === "filled" ? corner(kit, "sm") : recipe === "boxed" ? corner(kit, "xs") : h / 2,
    ...(recipe === "pill" || recipe === "boxed" ? { borderWidth: 1, borderColor: c(kit, "outline-variant") } : null),
    ...(!own && p.styleVariant === "outlined" ? { borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface") } : null),
    /* Material's search bar floats; its search view, closed, is a header ruled off from the suggestions under it */
    ...(!own && p.styleVariant !== "outlined" && p.kind === "bar" ? { boxShadow: "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026" } : null),
    ...(!own && p.kind === "view" ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 1, borderBottomColor: c(kit, "outline") } : null),
  };
  const ink = c(kit, "on-surface-variant");
  const field = (
    <View style={box}>
      {p.leading ? <Glyph name={p.leading} size={own ? 20 : 24} color={ink} /> : null}
      <TextInput accessibilityLabel={p.placeholder} value={text} onChangeText={setText} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} placeholder={p.placeholder} placeholderTextColor={ink} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "body-large"), ...(ios ? { fontSize: 17 } : recipe === "filled" ? { fontSize: 15 } : null), color: c(kit, "on-surface"), paddingVertical: 0 }} />
      {p.trailing ? (
        <Pressable accessibilityRole="button" accessibilityLabel={p.trailing} onPress={tapOf(p, "icon")}>
          <Glyph name={p.trailing} size={own ? 20 : 24} color={ink} />
        </Pressable>
      ) : null}
    </View>
  );
  /* a search view's suggestions show while it is being typed in */
  const results = p.kind === "view" && !own && open ? (p.results ?? []) : [];
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), ...fill }} appearance={p} testID={p.testID}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
        {field}
        {ios ? <RNText style={{ ...typeStyle(kit, "body-large"), fontSize: 17, color: c(kit, "primary") }}>Cancel</RNText> : null}
      </View>
      {results.length ? (
        <View style={{ marginTop: 4 }}>
          {results.map((r, i) => (
            <Pressable key={i} onPress={tapOf(p, `tab:${i}`)} style={{ height: 56, flexDirection: "row", alignItems: "center", columnGap: 16, paddingHorizontal: 16 }}>
              <Glyph name={r.icon || "history"} size={24} color={ink} />
              <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{r.label}</RNText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- the floating action button ---------- */

const FAB: Record<string, { side: number; icon: number; radius: "md" | "lg" | "xl" | "lgi" }> = { sm: { side: 40, icon: 24, radius: "md" }, default: { side: 56, icon: 24, radius: "lg" }, md: { side: 80, icon: 28, radius: "lgi" }, lg: { side: 96, icon: 36, radius: "xl" } };
const FAB_COLORS: Record<string, [string, string]> = {
  "primary-container": ["primary-container", "on-primary-container"],
  "secondary-container": ["secondary-container", "on-secondary-container"],
  "tertiary-container": ["tertiary-container", "on-tertiary-container"],
  primary: ["primary", "on-primary"],
  secondary: ["secondary", "on-secondary"],
  tertiary: ["tertiary", "on-tertiary"],
  surface: ["surface-container-high", "primary"],
};

export type FabProps = PartBase & { icon?: string; label?: string; size?: string; color?: string; lowered?: boolean; collapsed?: boolean; toggle?: boolean; onIcon?: string; onLabel?: string };

export function Fab(props: FabProps) {
  const p = withDefaults<FabProps>("fab", props);
  const kit = useKit();
  const [on, setOn] = useState(false);
  const s = FAB[p.size ?? "default"] ?? FAB.default;
  const recipe = recipeOf(kit, "fab");
  const forced = extra(kit, "fabColor");
  const [bg, ink] = typeof forced === "string" ? [forced, `on-${forced}`] : (FAB_COLORS[p.color ?? "primary-container"] ?? FAB_COLORS["primary-container"]);
  const label = p.toggle && on && p.onLabel ? p.onLabel : p.label;
  const icon = p.toggle && on && p.onIcon ? p.onIcon : p.icon;
  const extended = !!label && !p.collapsed;
  const radius = recipe === "round" ? s.side / 2 : recipe === "square" ? corner(kit, "md") : recipe === "flat" ? corner(kit, "lg") : corner(kit, s.radius) || controlRadius(kit, s.side);
  return (
    <Surface
      base={{ height: s.side, minWidth: s.side, paddingHorizontal: extended ? 16 : 0, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 12, borderRadius: radius, backgroundColor: c(kit, bg), boxShadow: recipe === "flat" ? undefined : p.lowered ? "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026" : "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026", alignSelf: "flex-start" }}
      appearance={p}
      onPress={() => {
        if (p.toggle) setOn((v) => !v);
        p.onPress?.();
      }}
      testID={p.testID}
      accessibilityLabel={label || icon}
    >
      {icon ? <Glyph name={icon} size={s.icon} color={c(kit, ink)} /> : null}
      {extended ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, ink) }}>{label}</RNText> : null}
    </Surface>
  );
}

export { accentText };
