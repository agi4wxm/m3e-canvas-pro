import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text as RNText, View, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Button, RadioMark, Slider, Switch, Checkbox } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { accentText, cardStyle, extra } from "../recipes";
import { Surface } from "../Surface";
import { corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* What a screen's body is made of: list rows (one, or a group of them), cards, an alert, a snackbar and a carousel. The
 * list follows the style's `list`, `row` and `icon` recipes: Material's open rows, iOS's inset group with chevrons and
 * colored tiles, WeChat's white cells from edge to edge with arrows. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/* ---------- list rows ---------- */

const DISCS: Record<string, [string, string]> = {
  "primary-container": ["primary-container", "on-primary-container"],
  "secondary-container": ["secondary-container", "on-secondary-container"],
  "tertiary-container": ["tertiary-container", "on-tertiary-container"],
  primary: ["primary", "on-primary"],
  surface: ["surface-container-highest", "on-surface-variant"],
};

export type ListItemProps = PartBase & {
  items?: ListRow[];
  iconFill?: string;
  description?: string;
  variant?: "default" | "outline" | "muted" | "segmented";
  size?: "default" | "sm" | "xs";
  trailing?: "none" | "icon" | "switch" | "checkbox" | "radio" | "slider" | "text";
  trailingIcon?: string;
  checked?: boolean;
  trailingText?: string;
  width?: number;
};

/** One list row, or a group of them sharing the same trailing control. A tap on a row runs what that row is wired to. */
export function ListItem(props: ListItemProps) {
  const p = withDefaults<ListItemProps>("item", props);
  const kit = useKit();
  const fill = useFill();
  const rows = p.items ?? [];
  const list = recipeOf(kit, "list");
  const rowRecipe = recipeOf(kit, "row");
  const iconRecipe = recipeOf(kit, "icon");
  const grouped = list === "inset" || list === "flush" || list === "tile";
  const min = typeof extra(kit, "rowMin") === "number" ? (extra(kit, "rowMin") as number) : list === "inset" || rowRecipe === "chevron" ? 44 : rowRecipe === "dense" || list === "hairline" ? 40 : p.size === "xs" ? 40 : p.size === "sm" ? 48 : p.description ? 72 : 56;
  const pad = list === "inset" || list === "flush" ? 16 : 16;
  const showsArrow = (rowRecipe === "chevron" || rowRecipe === "arrow") && (p.trailing === "none" || p.trailing === "text");
  const disc = DISCS[p.iconFill ?? "none"];
  const iconBox = (name: string) => {
    if (iconRecipe === "tile") return <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: c(kit, "primary"), alignItems: "center", justifyContent: "center" }}><Glyph name={name} size={18} color={c(kit, "on-primary")} /></View>;
    if (iconRecipe === "disc" || disc) {
      const [bg, ink] = disc ?? ["secondary-container", "on-secondary-container"];
      const s = p.size === "xs" ? 24 : p.size === "sm" ? 32 : 40;
      return <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: c(kit, bg), alignItems: "center", justifyContent: "center" }}><Glyph name={name} size={s >= 40 ? 24 : 18} color={c(kit, ink)} /></View>;
    }
    return <Glyph name={name} size={24} color={iconRecipe === "muted" ? c(kit, "outline") : c(kit, "on-surface-variant")} />;
  };
  const end = (i: number): ReactNode => {
    switch (p.trailing) {
      case "switch":
        return <Switch label="" checked={!!p.checked} />;
      case "checkbox":
        return <Checkbox label="" checked={!!p.checked} />;
      case "radio":
        return <RadioMark on={!!p.checked} />;
      case "slider":
        return <Slider value={50} width={128} />;
      case "icon":
        return p.trailingIcon ? <Glyph name={p.trailingIcon} size={24} color={c(kit, "on-surface-variant")} /> : null;
      case "text":
        return p.trailingText ? <RNText key={i} style={{ ...typeStyle(kit, rowRecipe === "chevron" ? "body-large" : "body-medium"), color: c(kit, rowRecipe === "chevron" || rowRecipe === "arrow" ? "on-surface-variant" : "on-surface-variant") }}>{p.trailingText}</RNText> : null;
      default:
        return null;
    }
  };
  /* where a hairline between rows starts: at the words, past the icon */
  const textAt = (it: ListRow) => pad + (it.icon ? (iconRecipe === "tile" ? 29 + 12 : 24 + 16) : 0);
  const row = (it: ListRow, i: number) => {
    const seg = p.variant === "segmented";
    const ground: ViewStyle = seg
      ? { backgroundColor: c(kit, "surface-container"), borderRadius: i === 0 ? 16 : 4, ...(i === rows.length - 1 ? { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } : null), ...(i === 0 ? { borderTopLeftRadius: 16, borderTopRightRadius: 16 } : null) }
      : p.variant === "outline" && !grouped
        ? { borderWidth: 1, borderColor: c(kit, "outline-variant"), borderRadius: corner(kit, "lg") }
        : p.variant === "muted" && !grouped
          ? { backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "lg") }
          : {};
    return (
      <Surface key={i} base={{ minHeight: min, paddingHorizontal: pad, flexDirection: "row", alignItems: "center", columnGap: iconRecipe === "tile" ? 12 : 16, ...ground }} appearance={grouped ? undefined : p} onPress={tapOf(p, `tab:${i}`) ?? (() => {})} accessibilityLabel={it.label}>
        {i > 0 && grouped ? <View style={{ position: "absolute", top: 0, left: textAt(it), right: 0, height: list === "flush" ? 0.5 : 0.5, backgroundColor: withAlpha(c(kit, "on-surface"), 0.14) }} /> : null}
        {it.icon ? iconBox(it.icon) : null}
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{it.label}</RNText>
          {p.description && rows.length === 1 ? <RNText numberOfLines={2} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.description}</RNText> : null}
        </View>
        {end(i)}
        {showsArrow ? <Glyph testID="row-chevron" name="chevron_right" size={rowRecipe === "arrow" ? 18 : 20} color={rowRecipe === "arrow" ? withAlpha(c(kit, "on-surface"), 0.3) : c(kit, "outline")} /> : null}
      </Surface>
    );
  };
  const group: ViewStyle =
    list === "inset"
      ? { backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden" }
      : list === "flush"
        ? { backgroundColor: c(kit, "surface-container-low") }
        : list === "tile"
          ? { rowGap: 8 }
          : p.variant === "segmented"
            ? { rowGap: 2 }
            : {};
  return (
    <Surface base={{ width: Math.round(p.width ?? 280), ...group, ...fill }} appearance={grouped ? p : undefined} testID={p.testID}>
      {rows.map(row)}
    </Surface>
  );
}

/* ---------- cards ---------- */

export type CardProps = PartBase & {
  title?: string;
  description?: string;
  variant?: "filled" | "elevated" | "outlined";
  imagePos?: "none" | "top" | "bottom" | "leading" | "trailing" | "background";
  image?: string;
  imageIcon?: string;
  imageSize?: number;
  textAlign?: "start" | "center" | "end";
  contentAlign?: "start" | "center" | "end";
  size?: "sm" | "default" | "lg";
  interactive?: boolean;
  action?: string;
  width?: number;
  height?: number;
};

const SPACING: Record<string, number> = { sm: 12, default: 16, lg: 24 };

export function Card(props: CardProps) {
  const p = withDefaults<CardProps>("card", props);
  const kit = useKit();
  const fill = useFill();
  const pos = p.imagePos ?? "top";
  const side = pos === "leading" || pos === "trailing";
  const bg = pos === "background";
  const pad = SPACING[p.size ?? "default"] ?? 16;
  const extent = Math.round(p.imageSize ?? 96);
  const inner = p.image ? (
    <ExpoImage source={{ uri: p.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
  ) : (
    <LinearGradient colors={[c(kit, "primary-container"), c(kit, "tertiary-container")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Glyph name={p.imageIcon || "image"} size={34} color={c(kit, "on-primary-container")} />
    </LinearGradient>
  );
  const media = pos === "none" ? null : <View style={bg ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } : side ? { width: extent, alignSelf: "stretch" } : { height: extent, alignSelf: "stretch" }}>{inner}</View>;
  const align = p.textAlign === "center" ? "center" : p.textAlign === "end" ? "right" : "left";
  const ink = bg ? (p.image ? "#FFFFFF" : c(kit, "on-primary-container")) : c(kit, "on-surface");
  const body = (
    <View style={{ padding: pad, rowGap: 4, flex: side ? 1 : undefined, alignItems: p.textAlign === "center" ? "center" : p.textAlign === "end" ? "flex-end" : "stretch" }}>
      <RNText style={{ ...typeStyle(kit, p.size === "sm" ? "title-medium" : "title-large"), color: ink, textAlign: align }}>{p.title}</RNText>
      {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: bg ? ink : c(kit, "on-surface-variant"), textAlign: align }}>{p.description}</RNText> : null}
      {p.action ? (
        <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
          <Button label={p.action} variant="text" size="sm" onPress={tapOf(p, "action")} />
        </View>
      ) : null}
    </View>
  );
  const first = pos === "top" || pos === "leading" || bg;
  return (
    <Surface
      base={{ ...cardStyle(kit, p.variant ?? "filled"), width: Math.round(p.width ?? 280), ...((p.height ?? 0) > 0 ? { height: Math.round(p.height!) } : null), flexDirection: side ? "row" : "column", overflow: "hidden", justifyContent: p.contentAlign === "center" ? "center" : p.contentAlign === "end" ? "flex-end" : "flex-start", ...fill }}
      appearance={p}
      onPress={p.interactive || p.onPress ? (p.onPress ?? (() => {})) : undefined}
      testID={p.testID}
    >
      {first ? media : null}
      {body}
      {!first ? media : null}
    </Surface>
  );
}

/* ---------- an alert ---------- */

const ALERT: Record<string, [string, string]> = { default: ["surface-container-high", "on-surface"], info: ["secondary-container", "on-secondary-container"], tertiary: ["tertiary-container", "on-tertiary-container"], destructive: ["error-container", "on-error-container"] };

export type AlertProps = PartBase & { variant?: string; icon?: string; title?: string; description?: string; width?: number };

export function Alert(props: AlertProps) {
  const p = withDefaults<AlertProps>("alert", props);
  const kit = useKit();
  const fill = useFill();
  const [bg, ink] = ALERT[p.variant ?? "default"] ?? ALERT.default;
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), flexDirection: "row", columnGap: 12, padding: 16, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, bg), ...fill }} appearance={p} testID={p.testID} accessibilityRole="summary">
      {p.icon ? <Glyph name={p.icon} size={20} color={c(kit, ink)} /> : null}
      <View style={{ flex: 1, rowGap: 2 }}>
        <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, ink) }}>{p.title}</RNText>
        {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, ink), opacity: 0.85 }}>{p.description}</RNText> : null}
      </View>
    </Surface>
  );
}

/* ---------- a snackbar ---------- */

export type SnackbarProps = PartBase & { label?: string; variant?: string; message?: string; action?: string; closeButton?: boolean };

/** A snackbar drawn shown, as the canvas draws it: the inverse surface, its words, its action and a close. On a phone
 *  the part is the message itself; a tap that should raise it is printed as a call. */
export function Snackbar(props: SnackbarProps) {
  const p = withDefaults<SnackbarProps>("sonner", props);
  const kit = useKit();
  return (
    <Surface base={{ minHeight: 48, width: 344, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: p.action || p.closeButton ? 8 : 16, borderRadius: corner(kit, "xs"), backgroundColor: c(kit, "inverse-surface"), boxShadow: "0px 2px 3px 0px #0000004D, 0px 6px 10px 4px #00000026" }} appearance={p} testID={p.testID} accessibilityRole="summary">
      <RNText style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "inverse-on-surface"), paddingVertical: 14 }}>{p.message}</RNText>
      {p.action ? (
        <Pressable onPress={tapOf(p, "action")} style={{ paddingHorizontal: 12, height: 40, justifyContent: "center" }}>
          <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "inverse-primary") }}>{p.action}</RNText>
        </Pressable>
      ) : null}
      {p.closeButton ? <Glyph name="close" size={24} color={c(kit, "inverse-on-surface")} /> : null}
    </Surface>
  );
}

/* ---------- a carousel ---------- */

export type CarouselProps = PartBase & { slides?: ListRow[]; arrows?: boolean; orientation?: "horizontal" | "vertical"; itemWidth?: number; gap?: number; width?: number; height?: number };

const SLIDE_COLORS = ["primary-container", "secondary-container", "tertiary-container", "surface-container-highest"];

/** slides a finger pages through, each a picture or a tinted card with its words */
export function Carousel(props: CarouselProps) {
  const p = withDefaults<CarouselProps>("carousel", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 320);
  const h = Math.round(p.height ?? 200);
  const vertical = p.orientation === "vertical";
  const item = (p.itemWidth ?? 0) > 0 ? Math.round(p.itemWidth!) : vertical ? h : w;
  const gap = Math.round(p.gap ?? 16);
  const [at, setAt] = useState(0);
  const slides = p.slides ?? [];
  return (
    <View testID={p.testID} style={[{ width: w, height: h }, fill]}>
      <ScrollView horizontal={!vertical} pagingEnabled={item === (vertical ? h : w)} snapToInterval={item + gap} decelerationRate="fast" showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={vertical ? { rowGap: gap } : { columnGap: gap }} onMomentumScrollEnd={(e) => setAt(Math.round((vertical ? e.nativeEvent.contentOffset.y : e.nativeEvent.contentOffset.x) / (item + gap)))}>
        {slides.map((s, i) => (
          <Pressable key={i} onPress={tapOf(p, `tab:${i}`)} style={{ width: vertical ? w : item, height: vertical ? item : h, borderRadius: corner(kit, "xl"), overflow: "hidden", backgroundColor: c(kit, SLIDE_COLORS[i % SLIDE_COLORS.length]), alignItems: "center", justifyContent: "center" }}>
            {s.image ? <ExpoImage source={{ uri: s.image }} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} contentFit="cover" /> : null}
            <RNText style={{ ...typeStyle(kit, "title-large"), color: s.image ? "#FFFFFF" : c(kit, `on-${SLIDE_COLORS[i % SLIDE_COLORS.length]}`.replace("on-surface-container-highest", "on-surface")) }}>{s.label}</RNText>
          </Pressable>
        ))}
      </ScrollView>
      {p.arrows && slides.length > 1 ? <RNText accessibilityLabel={`${clampInt(at, 0, slides.length - 1) + 1} / ${slides.length}`} style={{ position: "absolute", right: 12, bottom: 8, ...typeStyle(kit, "label-small"), color: accentText(kit) }}>{`${clampInt(at, 0, slides.length - 1) + 1}/${slides.length}`}</RNText> : null}
    </View>
  );
}
