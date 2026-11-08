import { Input as TaroInput, View } from "@tarojs/components";
import { useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Words } from "../atoms/words";
import { Spinner } from "../atoms/indicators";
import { c, ca, st } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { barStyle, extraColor } from "../recipes";
import { usePinnedTop, useChrome } from "../screen";
import { Surface } from "../Surface";
import { BARE, merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, extra, recipeOf, typeStyle, useKit } from "../theme";
import { useValue } from "../value";

/* The bars a screen is framed by and moves with: the app bar, the navigation bar, tabs, search, the floating action
 * button and the mini-program's own header. Each is composed the way its style composes it (lib/styles/recipes:
 * `appbar`, `bar`, `nav`, `tabs`, `search`, `fab`). A bar pinned to the top keeps clear of the capsule (WeChat's and
 * Douyin's "… ◎" button): its right end stops where the capsule starts. */

const BACK = ["arrow_back", "arrow_back_ios", "arrow_back_ios_new", "chevron_left"];

/** a tap on one of a part's places, else on the part */
export const tapOf = (p: PartBase, slot: string) => p.taps?.[slot] ?? p.onPress;

/* ---------- the app bar ---------- */

export type AppBarProps = PartBase & { title?: string; subtitle?: string; size?: "small" | "medium" | "large"; leading?: string; trailing?: string; trailing2?: string; centered?: boolean; scrolled?: boolean; width?: number };

export function AppBar(props: AppBarProps) {
  const p = withDefaults<AppBarProps>("app-bar", props);
  const kit = useKit();
  const fill = useFill();
  const top = usePinnedTop();
  const ch = useChrome();
  const recipe = recipeOf(kit, "appbar");
  const ios = recipe === "ios";
  const centered = !!p.centered || recipe === "center" || ios || recipeOf(kit, "bar") === "center";
  const row = ios ? 44 : recipe === "compact" ? 48 : 64;
  const big = p.size === "large" || p.size === "medium" || (recipe === "large" && p.size !== "small");
  const back = BACK.includes(p.leading ?? "");
  const iconInk = ios ? "primary" : ((extra(kit, "appbarIcon") as string | undefined) ?? "on-surface-variant");
  const capsule = top ? ch.capsule : 0;
  const bar = merge(
    barStyle(kit),
    recipeOf(kit, "bar") === "m3" ? { backgroundColor: p.scrolled ? c("surface-container") : c("surface") } : null,
    extraColor(kit, "appbarBg") ? { backgroundColor: extraColor(kit, "appbarBg") } : null,
    extraColor(kit, "barLine") ? { borderBottom: `0.5px solid ${extraColor(kit, "barLine")}` } : null,
    { width: Math.round(p.width ?? 412) },
    fill,
  );
  const icon = (name: string | undefined, slot: string, label: string) =>
    name ? (
      <View key={slot} ariaRole="button" ariaLabel={label} hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, slot)?.())} style={sx(ROW, { width: ios ? 36 : 48, height: 48, justifyContent: "center", flexShrink: 0 })}>
        <Glyph name={ios && back ? "chevron_left" : name} size={24} color={iconInk} />
      </View>
    ) : null;
  const leading =
    p.leading && ios && back ? (
      <View ariaRole="button" ariaLabel="Back" hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, "icon")?.())} style={sx(ROW, { height: 44 })}>
        <Glyph name="chevron_left" size={24} color={iconInk} />
        <Words text="Back" style={{ ...typeStyle(kit, "body-large"), color: c(iconInk) }} />
      </View>
    ) : (
      icon(p.leading, "icon", "Navigate")
    );
  const trailing = (
    <View style={sx(ROW)}>
      {icon(p.trailing, "icon2", "More")}
      {icon(p.trailing2, "icon3", "Action")}
    </View>
  );
  const title = (
    <View style={sx({ flexShrink: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start" })}>
      {!big || ios ? <Words text={big && (ios || recipe === "large") ? "" : p.title} lines={1} style={merge(typeStyle(kit, ios ? "title-medium" : "title-large"), ios ? { fontSize: 17, fontWeight: 600 } : null, { color: c("on-surface") })} /> : null}
      {p.subtitle && !big ? <Words text={p.subtitle} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} /> : null}
    </View>
  );
  return (
    <Surface base={bar} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { height: row, paddingLeft: ios ? 8 : 4, paddingRight: Math.max(ios ? 8 : 4, capsule), boxSizing: "border-box" })}>
        {centered ? (
          <>
            <View style={sx(ROW, { flex: 1 })}>{leading}</View>
            {title}
            <View style={sx(ROW, { flex: 1, justifyContent: "flex-end" })}>{trailing}</View>
          </>
        ) : (
          <>
            {leading}
            <View style={sx({ flex: 1, minWidth: 0, paddingLeft: p.leading ? 4 : 12 })}>{big ? null : title}</View>
            {trailing}
          </>
        )}
      </View>
      {big ? (
        <View style={sx({ paddingLeft: 16, paddingRight: 16, paddingBottom: ios ? 8 : p.size === "large" ? 12 : 16, paddingTop: ios ? 4 : 0 })}>
          <Words
            text={p.title}
            lines={2}
            style={merge(
              typeStyle(kit, ios || recipe === "large" ? "headline-large" : p.size === "large" ? "display-small" : "headline-small"),
              ios ? { fontSize: 34, lineHeight: "41px", fontWeight: 700 } : typeof extra(kit, "largeTitle") === "number" ? { fontSize: Number(extra(kit, "largeTitle")), lineHeight: `${Number(extra(kit, "largeTitle")) + 8}px`, fontWeight: 600 } : null,
              { color: c("on-surface") },
            )}
          />
          {p.subtitle ? <Words text={p.subtitle} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- the mini-program's own header ---------- */

export type MiniProgramHeaderProps = PartBase & { title?: string; back?: boolean; width?: number };

/** The header a mini-program draws under the status bar: a back arrow, the title in the middle, and room at the right
 *  for the platform's capsule (drawn by the platform itself, so only on the web is it drawn here). */
export function MiniProgramHeader(props: MiniProgramHeaderProps) {
  const p = withDefaults<MiniProgramHeaderProps>("mini-program-header", props);
  const kit = useKit();
  const fill = useFill();
  const ch = useChrome();
  const h = ch.nav || 56;
  return (
    <Surface base={merge({ ...ROW, height: h, backgroundColor: c("surface"), paddingLeft: 8, paddingRight: 8, justifyContent: "space-between", width: Math.round(p.width ?? 412) }, fill)} appearance={p} testID={p.testID}>
      {p.back ? (
        <View ariaRole="button" ariaLabel="Back" hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, "icon")?.())} style={sx(ROW, { width: 40, height: 40, justifyContent: "center" })}>
          <Glyph name="arrow_back" size={24} color="st:primaryText" />
        </View>
      ) : (
        <View style={sx({ width: 40 })} />
      )}
      <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface"), position: "absolute", left: 96, right: 96, textAlign: "center" }} />
      {process.env.TARO_ENV === "h5" ? (
        <View style={sx(ROW, { height: 32, columnGap: 8, paddingLeft: 8, paddingRight: 8, borderRadius: 16, border: `1px solid ${c("outline-variant")}`, boxSizing: "border-box" })}>
          <Glyph name="more_horiz" size={20} color="on-surface" />
          <View style={sx({ width: 1, height: 16, backgroundColor: c("outline-variant") })} />
          <Glyph name="radio_button_checked" size={20} color="on-surface" />
        </View>
      ) : (
        <View style={sx({ width: ch.capsule })} />
      )}
    </Surface>
  );
}

/* ---------- the navigation bar ---------- */

export type NavigationBarProps = PartBase & { items?: ListRow[]; selected?: number; tall?: boolean; layout?: "vertical" | "horizontal"; elevated?: boolean; badge?: number; badgeOn?: number; width?: number; onChange?: (i: number) => void };

/** The bar of destinations at the foot (and the custom tab bar of an app whose screens it switches between). Material
 *  puts the chosen one's icon in a pill; iOS and WeChat tint it and fill its glyph. */
export function NavigationBar(props: NavigationBarProps) {
  const p = withDefaults<NavigationBarProps>("navigation-bar", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useValue(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const recipe = recipeOf(kit, "nav");
  const pill = recipe === "m3" || recipe === "block";
  const floating = recipe === "floating";
  const labelSize = extra(kit, "navLabelSize");
  const inactive = (extra(kit, "navInactive") as string | undefined) ?? "on-surface-variant";
  const bar = merge(
    { ...ROW, height: p.tall ? 80 : 64, alignItems: "stretch", backgroundColor: extraColor(kit, "navBg") ?? st("navBg") },
    extraColor(kit, "navLine") ? { borderTop: `0.5px solid ${extraColor(kit, "navLine")}` } : null,
    recipe === "plain" && !extraColor(kit, "navLine") && !extra(kit, "navNoLine") ? { borderTop: `0.5px solid ${c("outline-variant")}` } : null,
    floating ? { borderRadius: 32, marginLeft: 16, marginRight: 16, boxShadow: "0px 4px 16px 0px rgba(0,0,0,0.15)" } : null,
    p.elevated ? { boxShadow: "0px 2px 6px 2px rgba(0,0,0,0.15)" } : null,
    { width: Math.round(p.width ?? 412) },
    fill,
  );
  const glass = extra(kit, "navBlur");
  return (
    <Surface base={bar} appearance={glass ? { ...p, look: { ...p.look, glass: Number(glass) } } : p} testID={p.testID} role="tablist">
      {items.map((it, i) => {
        const on = i === chosen;
        const ink = on ? (pill ? "on-secondary-container" : "nav-on") : inactive;
        const badge = p.badge && i === (p.badgeOn ?? 0) - 1 ? p.badge : 0;
        const inkCss = ink === "nav-on" ? st("navOn") : c(ink);
        return (
          <View
            key={i}
            ariaRole="tab"
            ariaLabel={it.label}
            ariaSelected={on}
            hoverClass="m3e-pressed"
            onClick={(e) => {
              e.stopPropagation();
              setChosen(i);
              tapOf(p, `tab:${i}`)?.();
            }}
            style={sx({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: p.layout === "horizontal" ? "row" : "column", columnGap: 4, rowGap: pill ? 4 : 2, paddingTop: 4 })}
          >
            <View style={sx(ROW, { position: "relative", width: pill ? 56 : 32, height: 32, borderRadius: pill ? 16 : 0, justifyContent: "center", backgroundColor: on && pill ? st("navActive") : "transparent" })}>
              <Glyph name={it.icon || "circle"} size={24} filled={on} color={on && pill ? "on-secondary-container" : ink === "nav-on" ? "st:navOn" : ink} />
              {badge ? (
                <View style={sx(ROW, { position: "absolute", top: 0, right: pill ? 10 : -4, minWidth: 16, height: 16, borderRadius: 8, paddingLeft: 4, paddingRight: 4, boxSizing: "border-box", backgroundColor: c("error"), justifyContent: "center" })}>
                  <Words text={String(badge)} style={{ ...typeStyle(kit, "label-small"), lineHeight: "16px", color: c("on-error") }} />
                </View>
              ) : null}
            </View>
            {recipe === "icononly" ? null : (
              <Words
                text={it.label}
                lines={1}
                style={merge(typeStyle(kit, "label-medium"), typeof labelSize === "number" ? { fontSize: labelSize, lineHeight: `${labelSize + 4}px` } : null, { color: on ? (pill ? c("on-surface") : inkCss) : c(inactive), fontWeight: on && pill ? 700 : typeStyle(kit, "label-medium").fontWeight })}
              />
            )}
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- tabs ---------- */

export type TabsProps = PartBase & { items?: ListRow[]; selected?: number; variant?: "primary" | "secondary" | "segmented"; width?: number; onChange?: (i: number) => void };

/** A row of tabs: Material's underlined row, iOS's segmented control, a row of capsules. A tap chooses one. */
export function Tabs(props: TabsProps) {
  const p = withDefaults<TabsProps>("tabs", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useValue(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const recipe = recipeOf(kit, "tabs");
  const segmented = p.variant === "segmented" || recipe === "segmented";
  const capsules = recipe === "pill" || extra(kit, "tabsCapsules") === 1;
  const w = Math.round(p.width ?? 360);
  const tab = (i: number, style: CSS, body: ReactNode) => (
    <View
      key={i}
      ariaRole="tab"
      ariaSelected={i === chosen}
      hoverClass="m3e-pressed"
      onClick={(e) => {
        e.stopPropagation();
        setChosen(i);
        tapOf(p, `tab:${i}`)?.();
      }}
      style={sx(style)}
    >
      {body}
    </View>
  );
  if (segmented)
    return (
      <Surface base={{ ...ROW, width: w, height: 36, padding: 2, borderRadius: 18, alignItems: "stretch", backgroundColor: ca("on-surface", kit.dark ? 0.16 : 0.07), ...fill }} appearance={p} testID={p.testID} role="tablist">
        {items.map((it, i) =>
          tab(i, { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: i === chosen ? (kit.dark ? c("surface-container-highest") : "#FFFFFF") : "transparent", boxShadow: i === chosen ? "0px 1px 3px 0px rgba(0,0,0,0.12)" : undefined }, <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), fontWeight: i === chosen ? 600 : 400, color: c("on-surface") }} />),
        )}
      </Surface>
    );
  if (capsules)
    return (
      <Surface base={{ ...ROW, width: w, height: 48, columnGap: 8, ...fill }} appearance={p} testID={p.testID} role="tablist">
        {items.map((it, i) => tab(i, { ...ROW, height: 32, paddingLeft: 14, paddingRight: 14, borderRadius: 16, backgroundColor: i === chosen ? c("primary") : c("surface-container-high") }, <Words text={it.label} style={{ ...typeStyle(kit, "label-large"), fontWeight: 400, color: i === chosen ? c("on-primary") : c("on-surface") }} />))}
      </Surface>
    );
  const short = recipe === "short";
  return (
    <Surface base={{ ...ROW, width: w, height: 48, alignItems: "stretch", borderBottom: `1px solid ${c("surface-container-highest")}`, ...fill }} appearance={p} testID={p.testID} role="tablist">
      {items.map((it, i) => {
        const on = i === chosen;
        return tab(
          i,
          { flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
          <>
            <View style={sx(ROW, { columnGap: 8, height: 24, position: "relative" })}>
              {it.icon ? <Glyph name={it.icon} size={24} filled={on} color={on ? "primary" : "on-surface-variant"} /> : null}
              <Words text={it.label} lines={1} style={merge(typeStyle(kit, "title-small"), { color: on ? (p.variant === "secondary" || short ? c("on-surface") : st("tabOn")) : c("on-surface-variant") }, on && short ? { fontWeight: 600 } : null, kit.theme.capsLabels ? { textTransform: "uppercase" } : null)} />
              {on && p.variant !== "secondary" ? <View style={sx({ position: "absolute", bottom: -12, left: short ? "50%" : -2, right: short ? undefined : -2, marginLeft: short ? -10 : 0, width: short ? 20 : undefined, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: st("tabOn") })} /> : null}
            </View>
            {on && p.variant === "secondary" ? <View style={sx({ position: "absolute", left: 0, bottom: 0, height: 2, width: "100%", backgroundColor: st("tabOn") })} /> : null}
          </>,
        );
      })}
    </Surface>
  );
}

/* ---------- search ---------- */

export type SearchProps = PartBase & { kind?: "view" | "bar"; styleVariant?: "elevated" | "outlined"; placeholder?: string; leading?: string; trailing?: string; size?: "default" | "sm"; results?: ListRow[]; width?: number; value?: string; onChange?: (text: string) => void };

/** Search: Material's floating bar (or its open view with suggestions), the style's grey box, iOS's Cancel beside it */
export function Search(props: SearchProps) {
  const p = withDefaults<SearchProps>("search", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useValue(p.value ?? "", p.onChange);
  const [open, setOpen] = useState(false);
  const recipe = recipeOf(kit, "search");
  const ios = recipe === "cancel";
  const own = recipe !== "m3";
  const h = own ? (recipe === "pill" ? 44 : recipe === "boxed" ? 32 : 36) : p.size === "sm" ? 48 : 56;
  const ground = extraColor(kit, "searchBg") ?? (ios ? ca("on-surface", 0.07) : recipe === "filled" ? c("surface-container-highest") : recipe === "pill" || recipe === "boxed" ? c("surface-container-low") : c("surface-container-high"));
  const box = merge(
    { ...ROW, flex: 1, minWidth: 0, height: h, columnGap: own ? 6 : 16, paddingLeft: own ? 8 : 16, paddingRight: own ? 8 : 16, boxSizing: "border-box", backgroundColor: ground, borderRadius: ios ? 10 : recipe === "filled" ? corner(kit, "sm") : recipe === "boxed" ? corner(kit, "xs") : h / 2 },
    recipe === "pill" || recipe === "boxed" ? { border: `1px solid ${c("outline-variant")}` } : null,
    !own && p.styleVariant === "outlined" ? { border: `1px solid ${c("outline-variant")}`, backgroundColor: c("surface") } : null,
    !own && p.styleVariant !== "outlined" && p.kind === "bar" ? { boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)" } : null,
    !own && p.kind === "view" ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: `1px solid ${c("outline")}` } : null,
  );
  const results = p.kind === "view" && !own && open ? (p.results ?? []) : [];
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 360) }, fill)} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { columnGap: 8 })}>
        <View style={sx(box)}>
          {p.leading ? <Glyph name={p.leading} size={own ? 20 : 24} color="on-surface-variant" /> : null}
          <TaroInput
            value={text}
            placeholder={p.placeholder}
            placeholderStyle={`color: ${kit.paint("on-surface-variant")}`}
            confirmType="search"
            onInput={(e) => setText(e.detail.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            style={sx(typeStyle(kit, "body-large"), BARE, ios ? { fontSize: 17 } : recipe === "filled" ? { fontSize: 15 } : null, { flex: 1, minWidth: 0, color: c("on-surface"), height: 24 })}
          />
          {p.trailing ? (
            <View ariaRole="button" ariaLabel={p.trailing} onClick={(e) => (e.stopPropagation(), tapOf(p, "icon")?.())}>
              <Glyph name={p.trailing} size={own ? 20 : 24} color="on-surface-variant" />
            </View>
          ) : null}
        </View>
        {ios ? <Words text="Cancel" style={{ ...typeStyle(kit, "body-large"), fontSize: 17, color: c("primary") }} /> : null}
      </View>
      {results.length ? (
        <View style={sx({ marginTop: 4 })}>
          {results.map((r, i) => (
            <View key={i} hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, `tab:${i}`)?.())} style={sx(ROW, { height: 56, columnGap: 16, paddingLeft: 16, paddingRight: 16 })}>
              <Glyph name={r.icon || "history"} size={24} color="on-surface-variant" />
              <Words text={r.label} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface") }} />
            </View>
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

export type FabProps = PartBase & {
  icon?: string;
  label?: string;
  size?: string;
  color?: string;
  lowered?: boolean;
  collapsed?: boolean;
  toggle?: boolean;
  onIcon?: string;
  onLabel?: string;
  /** a toggle that starts on */
  pressed?: boolean;
  disabled?: boolean;
  /** what it started is under way: a spinner where its icon was, and it cannot be pressed again */
  loading?: boolean;
  ariaLabel?: string;
};

export function Fab(props: FabProps) {
  const p = withDefaults<FabProps>("fab", props);
  const kit = useKit();
  const [on, setOn] = useState(!!p.pressed);
  const held = !!p.disabled || !!p.loading;
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
      base={{ ...ROW, height: s.side, minWidth: s.side, paddingLeft: extended ? 16 : 0, paddingRight: extended ? 16 : 0, justifyContent: "center", columnGap: 12, borderRadius: radius, backgroundColor: c(bg), boxShadow: recipe === "flat" ? "none" : p.lowered ? "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)" : "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)", alignSelf: "flex-start", boxSizing: "border-box", transition: "width 200ms", opacity: p.disabled ? 0.38 : 1 }}
      appearance={p}
      onPress={() => {
        if (held) return;
        if (p.toggle) setOn((v) => !v);
        p.onPress?.();
      }}
      testID={p.testID}
      label={label || p.ariaLabel || icon}
    >
      {p.loading ? <Spinner size="sm" /> : icon ? <Glyph name={icon} size={s.icon} color={ink} /> : null}
      {extended ? <Words text={label} lines={1} style={{ ...typeStyle(kit, "title-medium"), color: c(ink) }} /> : null}
    </Surface>
  );
}
