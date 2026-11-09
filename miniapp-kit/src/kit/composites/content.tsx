import { Image as TaroImage, View } from "@tarojs/components";
import type { ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Button, Checkbox, RadioMark, Slider, Switch } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca, css, inkOver } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { withDefaults, type ListRow } from "../parts";
import { cardStyle } from "../recipes";
import { Surface } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { corner, extra, recipeOf, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";

/* What a screen's body is made of: list rows (one, or a group of them), cards, an alert and a snackbar. The list follows
 * the style's `list`, `row` and `icon` recipes: Material's open rows, iOS's inset group with chevrons and colored
 * tiles, WeChat's white cells from edge to edge with arrows. */

/* ---------- list rows ---------- */

const DISCS: Record<string, [string, string]> = {
  "primary-container": ["primary-container", "on-primary-container"],
  "secondary-container": ["secondary-container", "on-secondary-container"],
  "tertiary-container": ["tertiary-container", "on-tertiary-container"],
  primary: ["primary", "on-primary"],
  "surface-container-highest": ["surface-container-highest", "on-surface-variant"],
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
  const pad = 16;
  const showsArrow = (rowRecipe === "chevron" || rowRecipe === "arrow") && (p.trailing === "none" || p.trailing === "text");
  /* a disc of a color it was not designed around is that color, the glyph in what reads over it */
  const own = DISCS[p.iconFill ?? ""];
  const disc: [string, string] | undefined = own ?? (p.iconFill && css(p.iconFill) ? [p.iconFill, inkOver(p.iconFill)] : undefined);
  const iconBox = (name: string) => {
    if (iconRecipe === "tile")
      return (
        <View style={sx(ROW, { width: 29, height: 29, borderRadius: 7, backgroundColor: c("primary"), justifyContent: "center", flexShrink: 0 })}>
          <Glyph name={name} size={18} color="on-primary" />
        </View>
      );
    if (iconRecipe === "disc" || disc) {
      const [bg, ink] = disc ?? ["secondary-container", "on-secondary-container"];
      const s = p.size === "xs" ? 24 : p.size === "sm" ? 32 : 40;
      return (
        <View style={sx(ROW, { width: s, height: s, borderRadius: s / 2, backgroundColor: css(bg) ?? c(bg), justifyContent: "center", flexShrink: 0 })}>
          <Glyph name={name} size={s >= 40 ? 24 : 18} color={ink} />
        </View>
      );
    }
    return <Glyph name={name} size={24} color={iconRecipe === "muted" ? "outline" : "on-surface-variant"} />;
  };
  const end = (): ReactNode => {
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
        return p.trailingIcon ? <Glyph name={p.trailingIcon} size={24} color="on-surface-variant" /> : null;
      case "text":
        return p.trailingText ? <Words text={p.trailingText} lines={1} style={{ ...typeStyle(kit, rowRecipe === "chevron" ? "body-large" : "body-medium"), color: c("on-surface-variant"), flexShrink: 0 }} /> : null;
      default:
        return null;
    }
  };
  const textAt = (it: ListRow) => pad + (it.icon ? (iconRecipe === "tile" ? 29 + 12 : 24 + 16) : 0);
  const row = (it: ListRow, i: number) => {
    const seg = p.variant === "segmented";
    const ground: CSS = seg
      ? { backgroundColor: c("surface-container"), borderRadius: 4, ...(i === 0 ? { borderTopLeftRadius: 16, borderTopRightRadius: 16 } : null), ...(i === rows.length - 1 ? { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } : null) }
      : p.variant === "outline" && !grouped
        ? { border: `1px solid ${c("outline-variant")}`, borderRadius: corner(kit, "lg") }
        : p.variant === "muted" && !grouped
          ? { backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "lg") }
          : {};
    const tap = tapOf(p, `tab:${i}`);
    return (
      <Surface key={i} base={{ ...ROW, minHeight: min, paddingLeft: pad, paddingRight: pad, columnGap: iconRecipe === "tile" ? 12 : 16, ...ground }} appearance={grouped ? undefined : p} onPress={tap ?? undefined} label={it.label}>
        {i > 0 && grouped ? <View style={sx({ position: "absolute", top: 0, left: textAt(it), right: 0, height: 0.5, backgroundColor: ca("on-surface", 0.14) })} /> : null}
        {it.icon ? iconBox(it.icon) : null}
        <View style={sx({ flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 8 })}>
          <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface") }} />
          {p.description && rows.length === 1 ? <Words text={p.description} lines={2} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
        </View>
        {end()}
        {showsArrow ? <Glyph name="chevron_right" size={rowRecipe === "arrow" ? 18 : 20} color={rowRecipe === "arrow" ? "on-surface/30" : "outline"} /> : null}
      </Surface>
    );
  };
  const group: CSS =
    list === "inset"
      ? { backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "md"), overflow: "hidden" }
      : list === "flush"
        ? { backgroundColor: c("surface-container-low") }
        : list === "tile"
          ? { display: "flex", flexDirection: "column", rowGap: 8 }
          : p.variant === "segmented"
            ? { display: "flex", flexDirection: "column", rowGap: 2 }
            : {};
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 280) }, group, fill)} appearance={grouped ? p : undefined} testID={p.testID}>
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
    <TaroImage src={p.image} mode="aspectFill" style={sx({ width: "100%", height: "100%", display: "block" })} />
  ) : (
    <View style={sx(ROW, { width: "100%", height: "100%", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${c("primary-container")}, ${c("tertiary-container")})` })}>
      <Glyph name={p.imageIcon || "image"} size={34} color="on-primary-container" />
    </View>
  );
  const media = pos === "none" ? null : <View style={sx(bg ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } : side ? { width: extent, alignSelf: "stretch", flexShrink: 0 } : { height: extent, alignSelf: "stretch", flexShrink: 0 })}>{inner}</View>;
  const align = p.textAlign === "center" ? "center" : p.textAlign === "end" ? "right" : "left";
  const ink = bg ? (p.image ? "#FFFFFF" : c("on-primary-container")) : c("on-surface");
  const body = (
    <View style={sx({ position: "relative", padding: pad, display: "flex", flexDirection: "column", rowGap: 4, flex: side ? 1 : undefined, minWidth: 0, alignItems: p.textAlign === "center" ? "center" : p.textAlign === "end" ? "flex-end" : "stretch" })}>
      <Words text={p.title} style={{ ...typeStyle(kit, p.size === "sm" ? "title-medium" : "title-large"), color: ink, textAlign: align }} />
      {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: bg ? ink : c("on-surface-variant"), textAlign: align }} /> : null}
      {p.action ? (
        <View style={sx({ marginTop: 8, alignSelf: "flex-start" })}>
          <Button label={p.action} variant="text" size="sm" onPress={tapOf(p, "action")} />
        </View>
      ) : null}
    </View>
  );
  const first = pos === "top" || pos === "leading" || bg;
  return (
    <Surface
      base={merge(cardStyle(kit, p.variant ?? "filled"), { width: Math.round(p.width ?? 280), display: "flex", flexDirection: side ? "row" : "column", overflow: "hidden", justifyContent: p.contentAlign === "center" ? "center" : p.contentAlign === "end" ? "flex-end" : "flex-start" }, (p.height ?? 0) > 0 ? { height: Math.round(p.height!) } : null, fill)}
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
    <Surface base={merge({ ...ROW, alignItems: "flex-start", width: Math.round(p.width ?? 360), columnGap: 12, padding: 16, borderRadius: corner(kit, "lg"), backgroundColor: c(bg) }, fill)} appearance={p} testID={p.testID} role="alert">
      {p.icon ? <Glyph name={p.icon} size={20} color={ink} /> : null}
      <View style={sx({ flex: 1, display: "flex", flexDirection: "column", rowGap: 2 })}>
        <Words text={p.title} style={{ ...typeStyle(kit, "title-small"), color: c(ink) }} />
        {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c(ink), opacity: 0.85 }} /> : null}
      </View>
    </Surface>
  );
}

/* ---------- a snackbar ---------- */

export type SnackbarProps = PartBase & { label?: string; variant?: string; message?: string; action?: string; closeButton?: boolean };

/** A snackbar drawn shown, as the canvas draws it. The one a tap raises is the platform's toast (Taro.showToast). */
export function Snackbar(props: SnackbarProps) {
  const p = withDefaults<SnackbarProps>("sonner", props);
  const kit = useKit();
  return (
    <Surface base={{ ...ROW, minHeight: 48, width: 344, paddingLeft: 16, paddingRight: p.action || p.closeButton ? 8 : 16, borderRadius: corner(kit, "xs"), backgroundColor: c("inverse-surface"), boxShadow: "0px 2px 3px 0px rgba(0,0,0,0.3), 0px 6px 10px 4px rgba(0,0,0,0.15)" }} appearance={p} testID={p.testID} role="status">
      <Words text={p.message} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c("inverse-on-surface"), paddingTop: 14, paddingBottom: 14 }} />
      {p.action ? (
        <View hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, "action")?.())} style={sx(ROW, { paddingLeft: 12, paddingRight: 12, height: 40 })}>
          <Words text={p.action} style={{ ...typeStyle(kit, "label-large"), color: c("inverse-primary") }} />
        </View>
      ) : null}
      {p.closeButton ? <Glyph name="close" size={24} color="inverse-on-surface" /> : null}
    </Surface>
  );
}
