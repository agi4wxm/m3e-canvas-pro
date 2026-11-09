import { Image as TaroImage, View } from "@tarojs/components";
import { Children, useMemo, type ReactNode } from "react";

import { c, ca, css, st } from "../color";
import { Glyph, svgUrl } from "../icons";
import { Cell, flowStyle, NoFill, useFill, type FlowProps } from "../layout";
import { paint, type Appearance } from "../look";
import { withDefaults } from "../parts";
import { accentText, surfaceStyle } from "../recipes";
import { SHAPE_PATHS, SVG_PRESETS } from "../shapes.generated";
import { Surface, tagOf, useTextLook } from "../Surface";
import { merge, sx, type CSS } from "../styles";
import { corner, recipeOf, typeStyle, useKit, type TypeRole } from "../theme";
import { Words } from "./words";

/* The plainest atoms: a box that lays out what it holds, words, an icon, a vector drawing, a picture, a line, a gap and a
 * Material shape. Each takes the props of the part it draws (parts/defs), and a part's look beside them. */

/** what every part takes beside its own props: its look, a tap, and taps on its places (`tab:0`, `icon`) */
export type PartBase = Appearance & {
  onPress?: () => void;
  taps?: Record<string, (() => void) | undefined>;
  testID?: string;
};

/* ---------- words ---------- */

const TEXT_ROLES: Record<string, TypeRole> = {
  display: "display-small",
  headline: "headline-small",
  title: "title-large",
  heading: "title-medium",
  subtitle: "title-small",
  lead: "body-large",
  body: "body-medium",
  label: "label-large",
  caption: "body-small",
  tiny: "label-small",
};

/** the color of a text part's words, by its color prop */
export function wordsColor(color: string | undefined): string {
  switch (color) {
    case "muted":
      return c("on-surface-variant");
    case "primary":
      return accentText();
    case "inverse":
      return c("inverse-on-surface");
    case "default":
    case "":
    case undefined:
      return c("on-surface");
    default:
      return /^[a-z-]+$/.test(color) ? c(color) : c("on-surface");
  }
}

export type TextProps = PartBase & {
  text?: string;
  styleVariant?: string;
  color?: string;
  align?: "start" | "center" | "end";
  bold?: boolean;
  fit?: "auto" | "fixed";
  width?: number;
  maxLines?: number;
};

/** what a text part's words are drawn in, and how many lines they keep to: the text atom's, and the words a frame
 *  writes (frame.tsx `FrameText`) */
export function useTextStyle(props: TextProps): { p: TextProps; style: CSS; lines: number } {
  const p = withDefaults<TextProps>("text", props);
  const kit = useKit();
  const fill = useFill();
  const look = useTextLook();
  const painted = useMemo(() => paint(p), [p]);
  const auto = p.fit === "auto";
  const lines = auto ? 0 : Math.round(p.maxLines ?? 0);
  const style = merge(
    typeStyle(kit, (TEXT_ROLES[p.styleVariant ?? "body"] ?? "body-medium") as TypeRole, p.bold),
    { color: p.textColor ? c("on-surface") : wordsColor(p.color), textAlign: p.align === "center" ? "center" : p.align === "end" ? "right" : "left" },
    auto ? { whiteSpace: "pre" } : { width: p.width },
    painted.style,
    look,
    painted.text,
    fill,
  );
  return { p, style, lines };
}

/** words in a type role of the theme */
export function Text(props: TextProps) {
  const { p, style, lines } = useTextStyle(props);
  const auto = p.fit === "auto";
  return (
    <View {...tagOf(p.testID)} style={sx({ boxSizing: "border-box" }, auto ? { flexShrink: 0 } : null)} onClick={p.onPress ? (e) => (e.stopPropagation(), p.onPress!()) : undefined}>
      <Words text={p.text} lines={lines > 0 ? lines : undefined} style={style} />
    </View>
  );
}

/* ---------- an icon ---------- */

const ICON_COLORS: Record<string, string | undefined> = { default: undefined, primary: "st:primaryText", secondary: "secondary", tertiary: "tertiary", error: "error", muted: "on-surface-variant", "on-surface": "on-surface", "on-primary": "on-primary", inverse: "inverse-on-surface" };

export type IconAtomProps = PartBase & { name?: string; size?: number; filled?: boolean; color?: string };

export function Icon(props: IconAtomProps) {
  const p = withDefaults<IconAtomProps>("icon", props);
  const painted = useMemo(() => paint(p), [p]);
  const role = ICON_COLORS[p.color ?? "default"];
  const color = p.textColor ? painted.ink : (role ?? "on-surface");
  const glyph = <Glyph name={p.name || "favorite"} size={Math.round(p.size ?? 24)} filled={!!p.filled} color={color} label={p.name || "favorite"} />;
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} base={{ display: "flex", flexShrink: 0, alignSelf: "flex-start" }} role="img">
      {glyph}
    </Surface>
  );
}

/* ---------- a vector drawing ---------- */

const INK: Record<string, string> = {
  current: "on-surface",
  default: "on-surface",
  muted: "on-surface-variant",
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
  error: "error",
  outline: "outline",
  "primary-container": "primary-container",
  "secondary-container": "secondary-container",
  "tertiary-container": "tertiary-container",
  "surface-container-high": "surface-container-high",
  "on-primary": "on-primary",
};

export type SvgProps = PartBase & {
  mode?: "preset" | "markup" | "path";
  preset?: string;
  /** cleaned markup: the printer passes it through the editor's sanitizer (parts/svg.ts) first */
  markup?: string;
  path?: string;
  viewBox?: string;
  outline?: boolean;
  strokeWidth?: number;
  color?: string;
  stretch?: boolean;
  label?: string;
  width?: number;
  height?: number;
};

const VIEWBOX = /^-?[\d.]+(\s+-?[\d.]+){3}$/;
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** a shape of the library, one path, or markup the editor cleaned, shown as a picture */
export function Svg(props: SvgProps) {
  const p = withDefaults<SvgProps>("svg", props);
  const kit = useKit();
  const color = kit.paint(INK[p.color ?? "current"] ?? "on-surface");
  const w = Math.round(p.width ?? 48);
  const h = Math.round(p.height ?? 48);
  const aspect = p.stretch ? "none" : "xMidYMid meet";
  let svg: string;
  if (p.mode === "markup" && p.markup) svg = p.markup.replace(/^<svg\b/, `<svg width="${w}" height="${h}" preserveAspectRatio="${aspect}"`);
  else {
    const preset = SVG_PRESETS[p.preset ?? "sparkle"] ?? SVG_PRESETS.sparkle;
    const fromPath = p.mode === "path" && !!p.path;
    const viewBox = fromPath ? (VIEWBOX.test((p.viewBox ?? "").trim()) ? p.viewBox!.trim() : "0 0 24 24") : preset.viewBox;
    const ds = fromPath ? [p.path!] : preset.d;
    const stroke = fromPath ? (p.outline ? (p.strokeWidth ?? 2) : undefined) : (preset.stroke ?? (p.outline ? (p.strokeWidth ?? 2) : undefined));
    const paths = ds.map((d) => (stroke !== undefined ? `<path d="${attr(d)}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${attr(d)}" fill="currentColor"/>`)).join("");
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${attr(viewBox)}" preserveAspectRatio="${aspect}">${paths}</svg>`;
  }
  const src = svgUrl(svg, color);
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} role="img" label={p.label || undefined} base={{ width: w, height: h, flexShrink: 0 }}>
      <TaroImage src={src} style={sx({ width: w, height: h, display: "block" })} mode={p.stretch ? "scaleToFill" : "aspectFit"} />
    </Surface>
  );
}

/* ---------- a picture ---------- */

export type ImageProps = PartBase & { src?: string; alt?: string; fit?: "cover" | "contain"; radius?: number; width?: number; height?: number };

export function Image(props: ImageProps) {
  const p = withDefaults<ImageProps>("image", props);
  const kit = useKit();
  const fill = useFill();
  const radius = p.radius === 12 || p.radius === undefined ? corner(kit, "md") : p.radius;
  const box: CSS = { width: Math.round(p.width ?? 240), height: Math.round(p.height ?? 160), borderRadius: radius, overflow: "hidden", flexShrink: 0, ...fill };
  if (!p.src)
    return (
      <Surface appearance={p} onPress={p.onPress} testID={p.testID} role="img" label={p.alt || undefined} base={{ ...box, backgroundColor: c("surface-container-high"), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Glyph name="image" size={32} color="outline" />
      </Surface>
    );
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} base={box} role="img" label={p.alt || undefined}>
      <TaroImage src={p.src} mode={p.fit === "contain" ? "aspectFit" : "aspectFill"} style={sx({ width: "100%", height: "100%", display: "block" })} />
    </Surface>
  );
}

/* ---------- a line and a gap ---------- */

export type SeparatorProps = PartBase & { orientation?: "horizontal" | "vertical"; length?: number; thickness?: number; color?: string };

export function Separator(props: SeparatorProps) {
  const p = withDefaults<SeparatorProps>("separator", props);
  const kit = useKit();
  const fill = useFill();
  const vertical = p.orientation === "vertical";
  const length = Math.round(p.length ?? 240);
  const t = Math.round(p.thickness ?? 1);
  const colored = !!p.color && p.color !== "default";
  /* the style's divider (the editor's recipe): iOS's and WeChat's barely-there line, the games' fading rim, dashes */
  const recipe = colored ? "m3" : recipeOf(kit, "divider");
  const fade = recipe === "fade" || recipe === "ornament";
  const thick = recipe === "hairline" ? 0.5 : recipe === "bold" ? kit.theme.edge : t;
  const ground = colored && /^[a-z-]+$/.test(p.color!) ? c(p.color!) : recipe === "hairline" ? ca("on-surface", 0.12) : recipe === "bold" ? c("outline") : c("outline-variant");
  const base: CSS = {
    backgroundColor: fade || recipe === "dashed" ? "transparent" : ground,
    ...(fade ? { backgroundImage: `linear-gradient(${vertical ? 180 : 90}deg, transparent, ${st("rim")} ${recipe === "ornament" ? "30%" : "50%"}, ${recipe === "ornament" ? `${st("rim")} 70%, ` : ""}transparent)` } : null),
    ...(recipe === "dashed" ? (vertical ? { borderLeft: `1px dashed ${c("outline")}` } : { borderTop: `1px dashed ${c("outline")}` }) : null),
    flexShrink: 0,
    ...(vertical ? { width: recipe === "dashed" ? 0 : thick, height: length } : { height: recipe === "dashed" ? 0 : thick, width: length }),
    ...(colored ? { borderRadius: 999 } : null),
    ...(recipe === "ornament" ? { display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" } : null),
  };
  return (
    <Surface appearance={p} testID={p.testID} base={base} style={vertical ? undefined : fill.width ? { width: "100%" } : undefined}>
      {recipe === "ornament" ? <View style={sx({ width: 7, height: 7, flexShrink: 0, transform: "rotate(45deg)", backgroundColor: st("rim"), boxShadow: `0px 0px 0px 2px ${c("surface")}` })} /> : null}
    </Surface>
  );
}

export type SpacerProps = PartBase & { width?: number; height?: number };

export function Spacer(props: SpacerProps) {
  const p = withDefaults<SpacerProps>("spacer", props);
  const fill = useFill();
  return <View {...tagOf(p.testID)} style={sx({ width: Math.round(p.width ?? 24), height: Math.round(p.height ?? 24), flexShrink: 0 }, fill)} />;
}

/* ---------- a Material shape ---------- */

const SHAPE_COLORS: Record<string, string> = { primary: "primary", secondary: "secondary", tertiary: "tertiary", "primary-container": "primary-container", "secondary-container": "secondary-container", "tertiary-container": "tertiary-container", "surface-container": "surface-container", "surface-container-high": "surface-container-high", outline: "outline", error: "error" };

export type ShapeProps = PartBase & { name?: string; color?: string; width?: number; height?: number };

export function Shape(props: ShapeProps) {
  const p = withDefaults<ShapeProps>("shape", props);
  const kit = useKit();
  const d = SHAPE_PATHS[p.name ?? "sunny"] ?? SHAPE_PATHS.circle;
  const w = Math.round(p.width ?? 96);
  const h = Math.round(p.height ?? 96);
  const src = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${attr(d)}" fill="currentColor"/></svg>`, kit.paint(SHAPE_COLORS[p.color ?? "primary"] ?? "primary"));
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} role="img" base={{ width: w, height: h, flexShrink: 0 }}>
      <TaroImage src={src} style={sx({ width: w, height: h, display: "block" })} mode="scaleToFill" />
    </Surface>
  );
}

/* ---------- the box ---------- */

export type BoxProps = PartBase &
  FlowProps & {
    surface?: "none" | "card" | "panel" | "field" | "bar" | "chip" | "button" | "sheet" | "overlay" | "well";
    /** where it stands on its screen: the screen pins it (see `Pin`); in a layout it means nothing */
    pin?: "none" | "top" | "bottom" | "floatingBottom";
    width?: number;
    height?: number;
    children?: ReactNode;
  };

/** the layout of a view that holds parts, and the size it keeps on each axis it does not hug */
export function heldLayout(p: FlowProps & { width?: number; height?: number }, fill: CSS, empty = false): CSS {
  const out: CSS = { ...flowStyle(p) };
  if ((empty || !p.hugWidth) && fill.width === undefined) out.width = p.width;
  if ((empty || !p.hugHeight) && fill.flexGrow === undefined) out.height = p.height;
  return { ...out, ...fill };
}

/** what a view that lays out its parts holds: they are in no cell of the layout around it */
export function Held({ children }: { children?: ReactNode }) {
  return <NoFill>{children}</NoFill>;
}

/** A frame with auto layout and no words of its own: what it looks like is its surface role, which the style dresses. */
export function Box(props: BoxProps) {
  const p = withDefaults<BoxProps>("box", props);
  const kit = useKit();
  const fill = useFill();
  /* a box with nothing laid out in it yet keeps its own size, as on the canvas */
  const base = { ...surfaceStyle(kit, p.surface), ...heldLayout(p, fill, Children.count(p.children) === 0) };
  return (
    <Surface base={base} appearance={p} onPress={p.onPress} testID={p.testID} ink={p.surface === "button" ? "on-primary" : undefined}>
      <Held>{p.children}</Held>
    </Surface>
  );
}

/* ---------- the layout container ---------- */

const BORDER: Record<string, CSS> = { none: {}, solid: { borderWidth: 1, borderStyle: "solid" }, dashed: { borderWidth: 1, borderStyle: "dashed" } };

export type ContainerProps = PartBase &
  FlowProps & { label?: string; note?: string; place?: "center" | "start"; border?: string; radius?: number; blur?: number; width?: number; height?: number; ground?: string; children?: ReactNode };

/** The plain container the editor's "add auto layout" makes: its own ground, edge and corner, and what it holds. Its
 *  `fill` prop is a role name, which the printer passes as `ground` so it is not taken for the look's fill. */
export function Container(props: ContainerProps) {
  const p = withDefaults<ContainerProps>("container", props);
  const kit = useKit();
  const fillStyle = useFill();
  const ground = props.ground ?? "surface-container-low";
  const free = (p.layout ?? "free") === "free";
  const base: CSS = {
    ...BORDER[p.border ?? "dashed"],
    borderColor: c("outline-variant"),
    backgroundColor: ground === "none" ? undefined : css(ground),
    borderRadius: ground === "none" && p.border === "none" ? 0 : p.radius === 12 || p.radius === undefined ? corner(kit, "md") : p.radius,
    overflow: "hidden",
    ...heldLayout(free ? { ...p, layout: "column", padX: 16, padY: 16, align: p.place === "start" ? "start" : "center", justify: p.place === "start" ? "start" : "center" } : p, fillStyle),
  };
  return (
    <Surface base={base} appearance={{ fill: props.fill, textColor: p.textColor, corners: p.corners, look: p.blur ? { ...p.look, glass: p.blur } : p.look }} onPress={p.onPress} testID={p.testID}>
      {free && p.label ? <Words text={p.label} style={{ ...typeStyle(kit, p.place === "start" ? "title-small" : "label-large"), color: c(p.place === "start" ? "on-surface" : "on-surface-variant") }} /> : null}
      {free && p.note ? <Words text={p.note} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      <Held>{p.children}</Held>
    </Surface>
  );
}

export { Cell };
