import { Image as ExpoImage } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, Easing, Text as RNText, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { colorOf, withAlpha } from "../look";
import { clampInt, sourceOf, withDefaults, type ListRow, type Picture } from "../parts";
import { extraColor } from "../recipes";
import { SHAPE_PATHS } from "../shapes.generated";
import { Surface } from "../Surface";
import { corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import type { PartBase } from "./basics";

/* What shows a state: badges, avatars, progress, spinners, a status dot, placeholders while loading, keys, page dots
 * and someone typing. Motion stops when the app asks for less of it (React Native's `AccessibilityInfo` reaches
 * Animated through `isReduceMotionEnabled`), and a loop is never started under test. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** a value going round and round, for what spins */
function useSpin(ms: number, on = true) {
  const [v] = useState(() => new Animated.Value(0));
  const turn = useMemo(() => v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }), [v]);
  useEffect(() => {
    if (!on || process.env.NODE_ENV === "test") return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, ms, on]);
  return turn;
}

/* ---------- badges ---------- */

const BADGE: Record<string, [bg: string, ink: string]> = {
  default: ["primary", "on-primary"],
  secondary: ["secondary-container", "on-secondary-container"],
  tertiary: ["tertiary-container", "on-tertiary-container"],
  destructive: ["error", "on-error"],
};

export type BadgeProps = PartBase & { kind?: "label" | "dot" | "count"; label?: string; variant?: string; icon?: string; count?: number };

export function Badge(props: BadgeProps) {
  const p = withDefaults<BadgeProps>("badge", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "badge");
  if (p.kind === "label") {
    const [bg, ink] = BADGE[p.variant ?? "default"] ?? ["transparent", "on-surface"];
    const outlined = p.variant === "outline";
    const plain = p.variant === "ghost" || p.variant === "link";
    return (
      <Surface
        base={{ alignSelf: "flex-start", height: 24, paddingHorizontal: 8, justifyContent: "center", borderRadius: recipe === "square" ? corner(kit, "xs") : 12, backgroundColor: plain || outlined ? "transparent" : c(kit, bg), borderWidth: outlined || recipe === "rim" ? 1 : 0, borderColor: c(kit, "outline") }}
        appearance={p}
        testID={p.testID}
      >
        <RNText style={{ ...typeStyle(kit, "label-medium"), color: plain || outlined ? c(kit, p.variant === "link" ? "primary" : "on-surface") : c(kit, ink), textDecorationLine: p.variant === "link" ? "underline" : "none" }}>{p.label}</RNText>
      </Surface>
    );
  }
  const dot = p.kind === "dot" || recipe === "dot";
  const n = Math.round(p.count ?? 0);
  return (
    <View testID={p.testID} style={{ width: 32, height: 32 }}>
      <Glyph name={p.icon || "notifications"} size={32} color={c(kit, "on-surface-variant")} />
      {dot ? (
        <View style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: c(kit, "error") }} />
      ) : (
        <View style={{ position: "absolute", top: -4, left: 20, minWidth: 16, height: 16, borderRadius: recipe === "square" ? 4 : 8, paddingHorizontal: 4, backgroundColor: c(kit, "error"), alignItems: "center", justifyContent: "center" }}>
          <RNText style={{ ...typeStyle(kit, "label-small"), lineHeight: 16, color: c(kit, "on-error") }}>{n > 999 ? "999+" : String(n)}</RNText>
        </View>
      )}
    </View>
  );
}

/* ---------- avatars ---------- */

const AVATAR: Record<string, number> = { sm: 32, default: 40, lg: 56 };
const INITIALS = ["AB", "CD", "EF", "GH", "IJ"];

export type AvatarProps = PartBase & { initials?: string; size?: "sm" | "default" | "lg"; image?: Picture; count?: number };

function Face({ s, initials, image }: { s: number; initials: string; image?: Picture }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "avatar");
  const radius = recipe === "square" ? Math.round(s * 0.2) : s / 2;
  const bg = extraColor(kit, "avatarBg") ?? c(kit, "primary-container");
  return (
    <View style={{ width: s, height: s, borderRadius: radius, overflow: "hidden", backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: recipe === "framed" ? 2 : 0, borderColor: kit.st.rim }}>
      {image ? <ExpoImage source={sourceOf(image)} style={{ width: s, height: s }} accessibilityLabel={initials || "Avatar"} /> : <RNText style={{ ...typeStyle(kit, s >= 56 ? "title-large" : s <= 32 ? "label-medium" : "title-small"), color: extraColor(kit, "avatarBg") ? c(kit, "on-surface-variant") : c(kit, "on-primary-container") }}>{initials}</RNText>}
    </View>
  );
}

export function Avatar(props: AvatarProps) {
  const p = withDefaults<AvatarProps>("avatar", props);
  const kit = useKit();
  const s = AVATAR[p.size ?? "default"] ?? 40;
  const count = clampInt(p.count ?? 1, 1, 5);
  if (count <= 1)
    return (
      <Surface base={{ alignSelf: "flex-start", borderRadius: s / 2 }} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="image" accessibilityLabel={p.initials}>
        <Face s={s} initials={p.initials ?? ""} image={p.image || undefined} />
      </Surface>
    );
  return (
    <View testID={p.testID} style={{ flexDirection: "row" }}>
      {INITIALS.slice(0, count).map((l, i) => (
        <View key={l} style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: c(kit, "surface"), borderRadius: s / 2 + 2 }}>
          <Face s={s} initials={l} />
        </View>
      ))}
    </View>
  );
}

/* ---------- progress ---------- */

export type ProgressProps = PartBase & { value?: number; indeterminate?: boolean; variant?: "flat" | "wavy"; thickness?: number; label?: string; showValue?: boolean; width?: number };

/** a bar: M3 Expressive's track with a gap and a stop at its end, or the style's thin one */
export function Progress(props: ProgressProps) {
  const p = withDefaults<ProgressProps>("progress", props);
  const kit = useKit();
  const fill = useFill();
  const thin = recipeOf(kit, "progress") === "thin";
  const t = Math.max(2, Math.round(p.thickness ?? 4));
  const value = p.indeterminate ? 35 : clampInt(p.value ?? 0, 0, 100);
  const active = c(kit, "primary");
  const rest = thin ? withAlpha(c(kit, "on-surface"), 0.12) : c(kit, "secondary-container");
  const w = Math.round(p.width ?? 280);
  return (
    <View testID={p.testID} accessible accessibilityRole="progressbar" accessibilityValue={p.indeterminate ? undefined : { min: 0, max: 100, now: value }} style={[{ width: w, rowGap: 4 }, fill]}>
      {p.label || (p.showValue && !p.indeterminate) ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface") }}>{p.label}</RNText>
          {p.showValue && !p.indeterminate ? <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface-variant") }}>{`${value}%`}</RNText> : null}
        </View>
      ) : null}
      {thin ? (
        <View style={{ height: t, borderRadius: t / 2, backgroundColor: rest, overflow: "hidden" }}>
          <View style={{ width: `${value}%`, height: "100%", backgroundColor: active, borderRadius: t / 2 }} />
        </View>
      ) : (
        <View style={{ height: t, flexDirection: "row", alignItems: "center", columnGap: 4 }}>
          <View style={{ flexGrow: value, flexBasis: 0, height: t, borderRadius: t / 2, backgroundColor: active }} />
          <View style={{ flexGrow: 100 - value, flexBasis: 0, height: t, borderRadius: t / 2, backgroundColor: rest, alignItems: "flex-end", justifyContent: "center" }}>
            {p.indeterminate ? null : <View style={{ width: t, height: t, borderRadius: t / 2, backgroundColor: active }} />}
          </View>
        </View>
      )}
    </View>
  );
}

export type CircularProgressProps = PartBase & { value?: number; indeterminate?: boolean; variant?: "flat" | "wavy"; size?: number; thickness?: number };

export function CircularProgress(props: CircularProgressProps) {
  const p = withDefaults<CircularProgressProps>("circular-progress", props);
  const kit = useKit();
  const size = Math.round(p.size ?? 40);
  const t = Math.max(2, Math.round(p.thickness ?? 4));
  const r = (size - t) / 2;
  const len = 2 * Math.PI * r;
  const value = p.indeterminate ? 30 : clampInt(p.value ?? 0, 0, 100);
  const gap = Math.min(len * 0.04 + t, len * 0.1);
  const spin = useSpin(1400, !!p.indeterminate);
  const arc = (len * value) / 100;
  return (
    <Animated.View testID={p.testID} accessible accessibilityRole="progressbar" accessibilityValue={p.indeterminate ? undefined : { min: 0, max: 100, now: value }} style={{ width: size, height: size, transform: p.indeterminate ? [{ rotate: spin }] : [] }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        {!p.indeterminate && value < 100 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={c(kit, "secondary-container")} strokeWidth={t} fill="none" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - arc - gap * 2)} ${len}`} strokeDashoffset={-(arc + gap)} /> : null}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c(kit, "primary")} strokeWidth={t} fill="none" strokeLinecap="round" strokeDasharray={`${arc} ${len}`} />
      </Svg>
    </Animated.View>
  );
}

const SPINNER: Record<string, number> = { xs: 16, sm: 24, md: 32, lg: 48 };

export type SpinnerProps = PartBase & { size?: string; color?: string };

/** the platform's own spinner, in the part's color */
export function Spinner(props: SpinnerProps) {
  const p = withDefaults<SpinnerProps>("spinner", props);
  const kit = useKit();
  const s = SPINNER[p.size ?? "sm"] ?? 24;
  return (
    <View testID={p.testID} style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size={s >= 32 ? "large" : "small"} color={colorOf(kit, p.color || "primary") ?? c(kit, "primary")} />
    </View>
  );
}

/** M3 Expressive's loading indicator: a morphing shape, here one Material shape turning */
export function LoadingIndicator(props: PartBase & { variant?: "default" | "contained"; size?: number; speed?: number }) {
  const p = withDefaults<{ variant?: string; size?: number; speed?: number; testID?: string }>("loading-indicator", props);
  const kit = useKit();
  const s = Math.round(p.size ?? 48);
  const spin = useSpin(Math.round(2400 / Math.max(0.25, p.speed ?? 1)));
  const contained = p.variant === "contained";
  const shape = Math.round(s * (contained ? 0.6 : 0.75));
  return (
    <View testID={p.testID} accessible accessibilityRole="progressbar" style={{ width: s, height: s, borderRadius: s / 2, alignItems: "center", justifyContent: "center", backgroundColor: contained ? c(kit, "primary-container") : "transparent" }}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Svg width={shape} height={shape} viewBox="0 0 100 100">
          <Path d={SHAPE_PATHS["soft-burst"] ?? SHAPE_PATHS.circle} fill={c(kit, contained ? "on-primary-container" : "primary")} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ---------- small marks ---------- */

/* by the one color value: any other color is drawn as it is, none draws no dot's color */
const DOT: Record<string, string> = { primary: "primary", secondary: "secondary", tertiary: "tertiary", error: "error", outline: "outline", "on-surface-variant": "on-surface-variant", "surface-container-highest": "surface-container-highest" };

export function Dot(props: PartBase & { color?: string; size?: number; ring?: boolean }) {
  const p = withDefaults<{ color?: string; size?: number; ring?: boolean; testID?: string }>("dot", props);
  const kit = useKit();
  const s = Math.round(p.size ?? 8);
  return <View testID={p.testID} accessibilityRole="none" style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: DOT[p.color ?? "primary"] ? c(kit, DOT[p.color ?? "primary"]) : (colorOf(kit, p.color) ?? "transparent"), ...(p.ring ? { outlineWidth: 2, outlineColor: c(kit, "surface") } : null) }} />;
}

export function PageDots(props: PartBase & { count?: number; current?: number }) {
  const p = withDefaults<{ count?: number; current?: number; testID?: string }>("page-dots", props);
  const kit = useKit();
  const count = clampInt(p.count ?? 4, 1, 12);
  const current = clampInt(p.current ?? 0, 0, count - 1);
  return (
    <View testID={p.testID} accessibilityLabel={`${current + 1} / ${count}`} style={{ flexDirection: "row", columnGap: 8, height: 24, alignItems: "center", paddingHorizontal: 8, alignSelf: "flex-start" }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === current ? c(kit, "primary") : c(kit, "outline-variant") }} />
      ))}
    </View>
  );
}

export function TypingIndicator(props: PartBase & { label?: string }) {
  const p = withDefaults<{ label?: string; testID?: string }>("typing-indicator", props);
  const kit = useKit();
  return (
    <View testID={p.testID} accessibilityRole="none" style={{ flexDirection: "row", alignItems: "center", columnGap: 4, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c(kit, "surface-container-high"), alignSelf: "flex-start" }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c(kit, "on-surface-variant"), opacity: 1 - i * 0.25 }} />
      ))}
      {p.label ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant"), marginLeft: 4 }}>{p.label}</RNText> : null}
    </View>
  );
}

export function Kbd(props: PartBase & { keys?: ListRow[]; caption?: string }) {
  const p = withDefaults<{ keys?: ListRow[]; caption?: string; testID?: string }>("kbd", props);
  const kit = useKit();
  const key = (label: string, i: number) => (
    <View key={i} style={{ minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: corner(kit, "xs"), backgroundColor: c(kit, "surface-container-highest"), alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ ...typeStyle(kit, "label-small"), fontFamily: "monospace", color: c(kit, "on-surface-variant") }}>{label}</RNText>
    </View>
  );
  return (
    <View testID={p.testID} style={{ flexDirection: "row", alignItems: "center", columnGap: 8, alignSelf: "flex-start" }}>
      <View style={{ flexDirection: "row", columnGap: 4 }}>{(p.keys ?? []).map((k, i) => key(k.label, i))}</View>
      {p.caption ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.caption}</RNText> : null}
    </View>
  );
}

/** placeholders where content is still loading */
export function Skeleton(props: PartBase & { layout?: "profile" | "text" | "card" | "block"; lines?: number; width?: number; height?: number }) {
  const p = withDefaults<{ layout?: string; lines?: number; width?: number; height?: number; testID?: string }>("skeleton", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 280);
  const bar = (style: ViewStyle, key?: number) => <View key={key} style={{ height: 16, borderRadius: corner(kit, "xs"), backgroundColor: c(kit, "surface-container-highest"), ...style }} />;
  let body;
  switch (p.layout) {
    case "text": {
      const lines = clampInt(p.lines ?? 3, 1, 12);
      body = <View style={{ rowGap: 8 }}>{Array.from({ length: lines }, (_, i) => bar({ width: i === lines - 1 && lines > 1 ? "66%" : "100%" }, i))}</View>;
      break;
    }
    case "card":
      body = (
        <View style={{ rowGap: 12 }}>
          {bar({ height: 128, borderRadius: corner(kit, "lg") })}
          {bar({ width: "75%" })}
          {bar({ width: "50%" })}
        </View>
      );
      break;
    case "block":
      body = bar({ height: Math.round(p.height ?? 96) });
      break;
    default:
      body = (
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c(kit, "surface-container-highest") }} />
          <View style={{ flex: 1, rowGap: 8 }}>
            {bar({ width: "100%" })}
            {bar({ width: "75%" })}
          </View>
        </View>
      );
  }
  return (
    <View testID={p.testID} accessibilityLabel="Loading" style={[{ width: w }, fill]}>
      {body}
    </View>
  );
}

export { Glyph };
