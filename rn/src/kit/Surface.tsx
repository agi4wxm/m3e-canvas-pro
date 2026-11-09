import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { paint, type Appearance, type Layer } from "./look";
import { Ink, useKit } from "./theme/ThemeProvider";

/* A view painted with a part's look: its own style under what the author set (a fill, corners, effects), the paint layers
 * drawn beneath what it holds, a blur of what is behind it, and the roles and text look its words take inside. Every
 * part with a surface is drawn on one, so the look lands where the web lands it (`appearance.target`). */

/** what a look sets on the words of the part it paints, for every `Text` inside */
const TextLook = createContext<TextStyle | undefined>(undefined);
export const useTextLook = () => useContext(TextLook);

/** the start and end of a CSS angle (0deg points up, 90deg right) across a unit box */
function ends(angle: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}

let radialIds = 0;

function LayerView({ layer }: { layer: Layer }) {
  const id = useMemo(() => `rg${++radialIds}`, []);
  if (layer.kind === "linear") {
    const { start, end } = ends(layer.angle);
    return <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFill} colors={layer.colors as [string, string, ...string[]]} locations={layer.at as [number, number, ...number[]]} start={start} end={end} />;
  }
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={id} cx={`${layer.x}%`} cy={`${layer.y}%`} r={layer.circle ? "50%" : "70%"}>
          {layer.colors.map((c, i) => (
            <Stop key={i} offset={layer.at[i]} stopColor={c} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** the corners of a style, for the layers drawn inside it */
function cornersOf(s: ViewStyle): ViewStyle {
  const out: ViewStyle = {};
  for (const k of ["borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"] as const) if (s[k] !== undefined) (out as Record<string, unknown>)[k] = s[k];
  return out;
}

export type SurfaceProps = {
  /** the part's own look, before the author's */
  base?: StyleProp<ViewStyle>;
  appearance?: Appearance;
  /** what the layout around asks (a cell's fill) */
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "image" | "none" | "header" | "link" | "summary";
  children?: ReactNode;
};

/** the focus ring stands this far off a part and is this wide (M3's focus indicator: 2dp off, 3dp wide) */
const RING_OFF = 2;
const RING_W = 3;

export function Surface({ base, appearance, style, onPress, testID, accessibilityLabel, accessibilityRole, children }: SurfaceProps) {
  const kit = useKit();
  /* Where the platform moves a focus over the parts (Android TV's d-pad, a keyboard, the web), the focused part wears
     M3's focus ring in the secondary color, as the editor's preview and the web app draw it (docs/焦点与输入.md). A
     touch never focuses, so a phone looks as it always did. */
  const [focused, setFocused] = useState(false);
  const painted = useMemo(() => paint(kit, appearance), [kit, appearance]);
  const flat = StyleSheet.flatten([base, painted.style, style]) ?? {};
  const corners = cornersOf(flat);
  const behind = (
    <>
      {painted.glass ? <BlurView pointerEvents="none" intensity={Math.min(100, painted.glass * 2.5)} tint={kit.dark ? "dark" : "light"} style={[StyleSheet.absoluteFill, corners, { overflow: "hidden" }]} /> : null}
      {painted.layers.length ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, corners, { overflow: "hidden" }]}>
          {[...painted.layers].reverse().map((l, i) => (
            <LayerView key={i} layer={l} />
          ))}
        </View>
      ) : null}
    </>
  );
  let body = (
    <>
      {behind}
      {children}
    </>
  );
  if (painted.ink) body = <Ink roles={painted.ink}>{body}</Ink>;
  if (painted.text) body = <TextLook.Provider value={painted.text}>{body}</TextLook.Provider>;
  if (onPress) {
    const out = RING_OFF + RING_W;
    const ring = focused ? <View pointerEvents="none" testID={testID ? `${testID}-focus` : "focus-ring"} style={{ position: "absolute", top: -out, left: -out, right: -out, bottom: -out, borderWidth: RING_W, borderColor: kit.colors.secondary ?? kit.colors.primary ?? "#625B71", borderRadius: (typeof flat.borderRadius === "number" ? flat.borderRadius : 0) + out }} /> : null;
    return (
      <Pressable testID={testID} accessibilityRole={accessibilityRole ?? "button"} accessibilityLabel={accessibilityLabel} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [flat, pressed ? { opacity: (flat.opacity ?? 1) * 0.85 } : null]}>
        {body}
        {ring}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} style={flat}>
      {body}
    </View>
  );
}
