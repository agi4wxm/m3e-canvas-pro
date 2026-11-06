import { memo, useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { useKit } from "../theme/ThemeProvider";

/* Icons drawn offline from the glyphs an app carries (lib/export/rn/icons.ts writes them): a Material name drawn in the
 * theme's family, as the web does (components/m3e/icon-family.ts). A family's own glyph where its table has the name,
 * Material Rounded where it does not; an icon of the document's own (`svg:<id>`) is one of its drawings. A name nothing
 * draws leaves an empty square of the icon's size. */

export type IconData = {
  maps: Record<string, Record<string, [string, string]>>;
  glyphs: Record<string, [string, number, number]>;
};

const maps = new Map<string, Record<string, [string, string]>>();
const glyphs = new Map<string, [string, number, number]>();

/** make glyphs drawable; an app registers its own once, before its first screen */
export function registerIcons(data: IconData) {
  for (const [family, map] of Object.entries(data.maps)) maps.set(family, { ...maps.get(family), ...map });
  for (const [id, g] of Object.entries(data.glyphs)) glyphs.set(id, g);
}

const base = (name: string) => name.replaceAll("_", "-");

/** the ids that draw a name in a family, outlined then filled (components/m3e/icon-family.ts `familyIds`) */
function idsOf(family: string, name: string): [string, string] {
  const b = base(name);
  const own = maps.get(family)?.[b];
  if (own) return own;
  if (family === "filled") return [`material-symbols:${b}-rounded`, `material-symbols:${b}-rounded`];
  if (family === "light") return [`material-symbols-light:${b}-outline-rounded`, `material-symbols-light:${b}-rounded`];
  if (family === "sharp" || family === "pixel") return [`material-symbols:${b}-outline-sharp`, `material-symbols:${b}-sharp`];
  return [`material-symbols:${b}-outline-rounded`, `material-symbols:${b}-rounded`];
}

/** the glyph that draws a name, filled or not, in a family; Rounded stands in for what the family lacks */
export function glyphFor(family: string, name: string, filled: boolean): [string, number, number] | undefined {
  if (name.startsWith("svg:")) return glyphs.get(`m3e-doc:${name.slice(4)}`);
  const own = idsOf(family, name);
  const fallback = idsOf("rounded", name);
  /* a family that draws no filled glyph draws its outlined one both ways */
  return glyphs.get(own[filled ? 1 : 0]) ?? glyphs.get(own[0]) ?? glyphs.get(fallback[filled ? 1 : 0]) ?? glyphs.get(fallback[0]);
}

/** whether a name can be drawn at all */
export const hasGlyph = (family: string, name: string) => !!glyphFor(family, name, false);

export type IconProps = {
  name: string;
  size?: number;
  filled?: boolean;
  /** a color; the words' color of what it stands in when left out */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** one icon: a glyph of the theme's family */
export const Glyph = memo(function Glyph({ name, size = 24, filled = false, color, style, testID }: IconProps) {
  const kit = useKit();
  const glyph = name ? glyphFor(kit.theme.icons, name, filled) : undefined;
  const xml = useMemo(() => (glyph ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${glyph[1]} ${glyph[2]}">${glyph[0]}</svg>` : undefined), [glyph]);
  const ink = color ?? kit.colors["on-surface"];
  if (!xml) return <View testID={testID} accessibilityLabel={name} style={[{ width: size, height: size }, style]} />;
  return (
    <View testID={testID} accessibilityLabel={name} style={[{ width: size, height: size }, style]}>
      <SvgXml xml={xml} width={size} height={size} color={ink} />
    </View>
  );
});
