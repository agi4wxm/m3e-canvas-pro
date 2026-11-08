import { Image as ExpoImage } from "expo-image";
import { Children, useMemo, type ReactNode } from "react";
import { Text as RNText, View, type DimensionValue, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path, SvgXml } from "react-native-svg";

import { Glyph } from "../icons/Icon";
import { Cell, flowStyle, GridRows, NoFill, useFill, type FlowProps } from "../layout";
import { paint, type Appearance } from "../look";
import { sourceOf, withDefaults, type Picture } from "../parts";
import { accentText, surfaceInk, surfaceStyle } from "../recipes";
import { SHAPE_PATHS, SVG_PRESETS } from "../shapes.generated";
import { Surface, useTextLook } from "../Surface";
import { Ink, corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import type { TypeRole } from "../theme/types";
import type { BuildViewStyle } from "../styles";

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
export function wordsColor(kit: Kit, color: string): string {
  switch (color) {
    case "muted":
      return kit.colors["on-surface-variant"];
    case "primary":
      return accentText(kit);
    case "inverse":
      return kit.colors["inverse-on-surface"];
    case "default":
    case "":
    case undefined:
      return kit.colors["on-surface"];
    default:
      return kit.colors[color] ?? kit.colors["on-surface"];
  }
}

export type TextProps = PartBase & {
  text?: string;
  styleVariant?: keyof typeof TEXT_ROLES | string;
  color?: string;
  align?: "start" | "center" | "end";
  bold?: boolean;
  fit?: "auto" | "fixed";
  width?: number;
  maxLines?: number;
};

/** words in a type role of the theme */
export function Text(props: TextProps) {
  const p = withDefaults<TextProps>("text", props);
  const kit = useKit();
  const fill = useFill();
  const look = useTextLook();
  const painted = useMemo(() => paint(kit, p), [kit, p]);
  const auto = p.fit === "auto";
  const lines = auto ? (p.text ?? "").split("\n").length : Math.round(p.maxLines ?? 0);
  const color = p.textColor ? (painted.ink?.["on-surface"] ?? wordsColor(kit, p.color ?? "default")) : wordsColor(kit, p.color ?? "default");
  const style: TextStyle = {
    ...typeStyle(kit, TEXT_ROLES[p.styleVariant ?? "body"] ?? "body-medium", p.bold),
    color,
    textAlign: p.align === "center" ? "center" : p.align === "end" ? "right" : "left",
    ...(auto ? {} : { width: p.width }),
    ...(painted.style as TextStyle),
    ...look,
    ...painted.text,
    ...fill,
  };
  return (
    <RNText testID={p.testID} onPress={p.onPress} numberOfLines={lines > 0 ? lines : undefined} style={style}>
      {p.text}
    </RNText>
  );
}

/* ---------- an icon ---------- */

const ICON_COLORS: Record<string, string | undefined> = { default: undefined, primary: "primary", secondary: "secondary", tertiary: "tertiary", error: "error", muted: "on-surface-variant", "on-surface": "on-surface", "on-primary": "on-primary", inverse: "inverse-on-surface" };

export type IconAtomProps = PartBase & { name?: string; size?: number; filled?: boolean; color?: string };

export function Icon(props: IconAtomProps) {
  const p = withDefaults<IconAtomProps>("icon", props);
  const kit = useKit();
  const painted = useMemo(() => paint(kit, p), [kit, p]);
  const role = ICON_COLORS[p.color ?? "default"];
  const color = p.textColor ? painted.ink?.["on-surface"] : role ? kit.colors[role] : undefined;
  const glyph = <Glyph name={p.name || "favorite"} size={Math.round(p.size ?? 24)} filled={!!p.filled} color={color} testID={p.testID} label={p.name || "favorite"} />;
  return p.onPress || Object.keys(painted.style).length ? (
    <Surface appearance={p} onPress={p.onPress} accessibilityRole={p.onPress ? "button" : "image"}>
      {glyph}
    </Surface>
  ) : (
    glyph
  );
}

/* ---------- a vector drawing ---------- */

const INK: Record<string, string | undefined> = {
  current: undefined,
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

/** a shape of the library, one path, or markup the editor cleaned */
export function Svg_(props: SvgProps) {
  const p = withDefaults<SvgProps>("svg", props);
  const kit = useKit();
  const role = INK[p.color ?? "current"];
  const color = role ? kit.colors[role] : kit.colors["on-surface"];
  const w = Math.round(p.width ?? 48);
  const h = Math.round(p.height ?? 48);
  const aspect = p.stretch ? "none" : "xMidYMid meet";
  let drawing: ReactNode;
  if (p.mode === "markup" && p.markup) drawing = <SvgXml xml={p.markup} width={w} height={h} color={color} preserveAspectRatio={aspect} />;
  else {
    const preset = SVG_PRESETS[p.preset ?? "sparkle"] ?? SVG_PRESETS.sparkle;
    const fromPath = p.mode === "path" && !!p.path;
    const viewBox = fromPath ? (VIEWBOX.test((p.viewBox ?? "").trim()) ? p.viewBox!.trim() : "0 0 24 24") : preset.viewBox;
    const ds = fromPath ? [p.path!] : preset.d;
    const stroke = fromPath ? (p.outline ? (p.strokeWidth ?? 2) : undefined) : (preset.stroke ?? (p.outline ? (p.strokeWidth ?? 2) : undefined));
    drawing = (
      <Svg width={w} height={h} viewBox={viewBox} preserveAspectRatio={aspect}>
        {ds.map((d, i) => (stroke !== undefined ? <Path key={i} d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" /> : <Path key={i} d={d} fill={color} />))}
      </Svg>
    );
  }
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" accessibilityLabel={p.label || undefined} base={{ width: w, height: h }}>
      {drawing}
    </Surface>
  );
}

/* ---------- a picture ---------- */

export type ImageProps = PartBase & { src?: Picture; alt?: string; fit?: "cover" | "contain"; radius?: number; width?: number; height?: number };

export function Image(props: ImageProps) {
  const p = withDefaults<ImageProps>("image", props);
  const kit = useKit();
  const fill = useFill();
  const radius = p.radius === 12 || p.radius === undefined ? corner(kit, "md") : p.radius;
  const box: ViewStyle = { width: Math.round(p.width ?? 240), height: Math.round(p.height ?? 160), borderRadius: radius, overflow: "hidden", ...fill };
  if (!p.src)
    return (
      <Surface appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" accessibilityLabel={p.alt || undefined} base={{ ...box, backgroundColor: kit.colors["surface-container-high"], alignItems: "center", justifyContent: "center" }}>
        <Glyph name="image" size={32} color={kit.colors.outline} />
      </Surface>
    );
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} base={box}>
      <ExpoImage source={sourceOf(p.src)} accessibilityLabel={p.alt} contentFit={p.fit === "contain" ? "contain" : "cover"} style={{ width: "100%", height: "100%" }} />
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
  const colored = p.color && p.color !== "default";
  const base: ViewStyle = {
    backgroundColor: colored ? kit.colors[p.color!] : kit.colors["outline-variant"],
    ...(vertical ? { width: t, height: length } : { height: t, width: length }),
    ...(colored ? { borderRadius: 999 } : null),
  };
  return <Surface appearance={p} testID={p.testID} base={base} style={vertical ? undefined : fill.width ? { width: "100%" } : undefined} />;
}

export type SpacerProps = PartBase & { width?: number; height?: number };

export function Spacer(props: SpacerProps) {
  const p = withDefaults<SpacerProps>("spacer", props);
  const fill = useFill();
  return <View testID={p.testID} style={[{ width: Math.round(p.width ?? 24), height: Math.round(p.height ?? 24) }, fill]} />;
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
  return (
    <Surface appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" base={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path d={d} fill={kit.colors[SHAPE_COLORS[p.color ?? "primary"] ?? "primary"]} />
      </Svg>
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
export function heldLayout(p: FlowProps & { width?: number; height?: number }, fill: ViewStyle, empty = false): ViewStyle {
  const out: BuildViewStyle = { ...flowStyle(p) };
  if ((empty || !p.hugWidth) && fill.width === undefined) out.width = p.width as DimensionValue;
  if ((empty || !p.hugHeight) && fill.flexGrow === undefined) out.height = p.height as DimensionValue;
  return { ...out, ...fill };
}

/** what a view that lays out its parts holds: rows of a grid, or the parts as they come */
export function Held({ p, children }: { p: FlowProps; children: ReactNode }) {
  const dir = p.layout ?? "column";
  if (dir === "grid") return <NoFill>{<GridRows columns={p.columns ?? 2} gap={p.gap ?? 0} align={p.align}>{children}</GridRows>}</NoFill>;
  return <NoFill>{children}</NoFill>;
}

/** A frame with auto layout and no words of its own: what it looks like is its surface role, which the style dresses. */
export function Box(props: BoxProps) {
  const p = withDefaults<BoxProps>("box", props);
  const kit = useKit();
  const fill = useFill();
  /* a box with nothing laid out in it yet keeps its own size, as on the canvas */
  const base = { ...surfaceStyle(kit, p.surface), ...heldLayout(p, fill, Children.count(p.children) === 0) };
  const body = <Held p={p}>{p.children}</Held>;
  return (
    <Surface base={base} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole={p.surface === "button" ? "button" : undefined}>
      {surfaceInk(kit, p.surface) ? <Ink roles={surfaceInk(kit, p.surface)}>{body}</Ink> : body}
    </Surface>
  );
}

/* ---------- the layout container ---------- */

const BORDER: Record<string, ViewStyle> = { none: {}, solid: { borderWidth: 1 }, dashed: { borderWidth: 1, borderStyle: "dashed" } };

export type ContainerProps = PartBase &
  FlowProps & { label?: string; note?: string; place?: "center" | "start"; fill_?: string; border?: string; radius?: number; blur?: number; width?: number; height?: number; children?: ReactNode };

/** The plain container the editor's "add auto layout" makes: its own ground, edge and corner, and what it holds. Its
 *  `fill` prop is a role name, which the printer passes as `ground` so it is not taken for the look's fill. */
export function Container(props: ContainerProps & { ground?: string }) {
  const p = withDefaults<ContainerProps & { ground?: string; fill?: string }>("container", props);
  const kit = useKit();
  const fillStyle = useFill();
  const ground = props.ground ?? "surface-container-low";
  const free = (p.layout ?? "free") === "free";
  const base: ViewStyle = {
    ...BORDER[p.border ?? "dashed"],
    borderColor: kit.colors["outline-variant"],
    backgroundColor: ground === "none" ? undefined : kit.colors[ground],
    borderRadius: ground === "none" && p.border === "none" ? 0 : p.radius === 12 || p.radius === undefined ? corner(kit, "md") : p.radius,
    overflow: "hidden",
    ...heldLayout(free ? { ...p, layout: "column", padX: 16, padY: 16, align: p.place === "start" ? "start" : "center", justify: p.place === "start" ? "start" : "center" } : p, fillStyle),
  };
  return (
    <Surface base={base} appearance={{ fill: props.fill, textColor: p.textColor, corners: p.corners, look: p.blur ? { ...p.look, glass: p.blur } : p.look }} onPress={p.onPress} testID={p.testID}>
      {free && p.label ? <RNText style={{ ...typeStyle(kit, p.place === "start" ? "title-small" : "label-large"), color: kit.colors[p.place === "start" ? "on-surface" : "on-surface-variant"] }}>{p.label}</RNText> : null}
      {free && p.note ? <RNText style={{ ...typeStyle(kit, "body-small"), color: kit.colors["on-surface-variant"] }}>{p.note}</RNText> : null}
      <Held p={p}>{p.children}</Held>
    </Surface>
  );
}

export { Cell };
