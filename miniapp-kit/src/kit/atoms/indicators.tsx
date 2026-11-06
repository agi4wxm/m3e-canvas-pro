import { Image as TaroImage, View } from "@tarojs/components";

import { c, ca, st } from "../color";
import { Glyph, svgUrl } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { extraColor } from "../recipes";
import { SHAPE_PATHS } from "../shapes.generated";
import { Surface, tagOf } from "../Surface";
import { sx, ROW, type CSS } from "../styles";
import { corner, extra, recipeOf, typeStyle, useKit } from "../theme";
import type { PartBase } from "./basics";
import { Words } from "./words";

/* What shows a state: badges, avatars, progress, spinners, a status dot, placeholders while loading, keys, page dots
 * and someone typing. What turns turns by the kit's stylesheet (`m3e-spin`), a CSS animation the web view runs. */

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
        base={{ ...ROW, alignSelf: "flex-start", height: 24, paddingLeft: 8, paddingRight: 8, justifyContent: "center", borderRadius: recipe === "square" ? corner(kit, "xs") : 12, backgroundColor: plain || outlined ? "transparent" : c(bg), ...(outlined || recipe === "rim" ? { border: `1px solid ${c("outline")}` } : null) }}
        appearance={p}
        testID={p.testID}
      >
        <Words text={p.label} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: plain || outlined ? c(p.variant === "link" ? "primary" : "on-surface") : c(ink), textDecoration: p.variant === "link" ? "underline" : "none" }} />
      </Surface>
    );
  }
  const dot = p.kind === "dot" || recipe === "dot";
  const n = Math.round(p.count ?? 0);
  return (
    <View {...tagOf(p.testID)} style={sx({ position: "relative", width: 32, height: 32, flexShrink: 0 })}>
      <Glyph name={p.icon || "notifications"} size={32} color="on-surface-variant" />
      {dot ? (
        <View style={sx({ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: c("error") })} />
      ) : (
        <View style={sx(ROW, { position: "absolute", top: -4, left: 20, minWidth: 16, height: 16, borderRadius: recipe === "square" ? 4 : 8, paddingLeft: 4, paddingRight: 4, boxSizing: "border-box", backgroundColor: c("error"), justifyContent: "center" })}>
          <Words text={n > 999 ? "999+" : String(n)} style={{ ...typeStyle(kit, "label-small"), lineHeight: "16px", color: c("on-error") }} />
        </View>
      )}
    </View>
  );
}

/* ---------- avatars ---------- */

const AVATAR: Record<string, number> = { sm: 32, default: 40, lg: 56 };
const INITIALS = ["AB", "CD", "EF", "GH", "IJ"];

export type AvatarProps = PartBase & { initials?: string; size?: "sm" | "default" | "lg"; image?: string; count?: number };

function Face({ s, initials, image }: { s: number; initials: string; image?: string }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "avatar");
  const radius = recipe === "square" ? Math.round(s * 0.2) : s / 2;
  const bg = extraColor(kit, "avatarBg");
  return (
    <View style={sx({ boxSizing: "border-box", width: s, height: s, borderRadius: radius, overflow: "hidden", backgroundColor: bg ?? c("primary-container"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...(recipe === "framed" ? { border: `2px solid ${st("rim")}` } : null) })}>
      {image ? (
        <TaroImage src={image} mode="aspectFill" style={sx({ width: s, height: s, display: "block" })} />
      ) : (
        <Words text={initials} style={{ ...typeStyle(kit, s >= 56 ? "title-large" : s <= 32 ? "label-medium" : "title-small"), color: bg ? c("on-surface-variant") : c("on-primary-container") }} />
      )}
    </View>
  );
}

export function Avatar(props: AvatarProps) {
  const p = withDefaults<AvatarProps>("avatar", props);
  const s = AVATAR[p.size ?? "default"] ?? 40;
  const count = clampInt(p.count ?? 1, 1, 5);
  if (count <= 1)
    return (
      <Surface base={{ alignSelf: "flex-start", borderRadius: s / 2, flexShrink: 0 }} appearance={p} onPress={p.onPress} testID={p.testID} role="img" label={p.initials}>
        <Face s={s} initials={p.initials ?? ""} image={p.image || undefined} />
      </Surface>
    );
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { alignSelf: "flex-start" })}>
      {INITIALS.slice(0, count).map((l, i) => (
        <View key={l} style={sx({ marginLeft: i ? -8 : 0, border: `2px solid ${c("surface")}`, borderRadius: s / 2 + 2 })}>
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
  const rest = thin ? ca("on-surface", 0.12) : c("secondary-container");
  return (
    <View {...tagOf(p.testID)} ariaRole="progressbar" style={sx({ display: "flex", flexDirection: "column", rowGap: 4, width: Math.round(p.width ?? 280), flexShrink: 0 }, fill)}>
      {p.label || (p.showValue && !p.indeterminate) ? (
        <View style={sx(ROW, { justifyContent: "space-between" })}>
          <Words text={p.label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface") }} />
          {p.showValue && !p.indeterminate ? <Words text={`${value}%`} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface-variant") }} /> : null}
        </View>
      ) : null}
      {thin ? (
        <View style={sx({ height: t, borderRadius: t / 2, backgroundColor: rest, overflow: "hidden" })}>
          <View style={sx({ width: `${value}%`, height: "100%", backgroundColor: c("primary"), borderRadius: t / 2, transition: "width 200ms" })} />
        </View>
      ) : (
        <View style={sx(ROW, { height: t, columnGap: 4 })}>
          <View style={sx({ flexGrow: value, flexBasis: 0, height: t, borderRadius: t / 2, backgroundColor: c("primary") })} />
          <View style={sx(ROW, { flexGrow: 100 - value, flexBasis: 0, height: t, borderRadius: t / 2, backgroundColor: rest, justifyContent: "flex-end" })}>
            {p.indeterminate ? null : <View style={sx({ width: t, height: t, borderRadius: t / 2, backgroundColor: c("primary") })} />}
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
  const arc = (len * value) / 100;
  const track = !p.indeterminate && value < 100 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${kit.paint("secondary-container")}" stroke-width="${t}" fill="none" stroke-linecap="round" stroke-dasharray="${Math.max(0, len - arc - gap * 2)} ${len}" stroke-dashoffset="${-(arc + gap)}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><g transform="rotate(-90 ${size / 2} ${size / 2})">${track}<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="currentColor" stroke-width="${t}" fill="none" stroke-linecap="round" stroke-dasharray="${arc} ${len}"/></g></svg>`;
  return (
    <View {...tagOf(p.testID)} ariaRole="progressbar" className={p.indeterminate ? "m3e-spin" : undefined} style={sx({ width: size, height: size, flexShrink: 0 })}>
      {/* the arc in the style's accent for words (WeChat's blue-grey), as the editor's text-primary is */}
      <TaroImage src={svgUrl(svg, kit.paint("st:primaryText"))} style={sx({ width: size, height: size, display: "block" })} />
    </View>
  );
}

const SPINNER: Record<string, number> = { xs: 16, sm: 20, md: 32, lg: 48 };

export type SpinnerProps = PartBase & { size?: string; color?: string };

/** an arc turning, in the part's color (primary is the style's accent for words, as the editor's text-primary is) */
export function Spinner(props: SpinnerProps) {
  const p = withDefaults<SpinnerProps>("spinner", props);
  const s = SPINNER[p.size ?? "sm"] ?? 20;
  const ink = /^[a-z-]+$/.test(p.color ?? "") && p.color !== "primary" ? c(p.color!) : st("primaryText");
  const t = Math.max(2, Math.round(s / 10));
  return (
    <View {...tagOf(p.testID)} ariaRole="progressbar" ariaLabel="Loading" className="m3e-spin" style={sx({ boxSizing: "border-box", width: s, height: s, borderRadius: s / 2, border: `${t}px solid transparent`, borderTopColor: ink, borderRightColor: ink, flexShrink: 0 })} />
  );
}

/** M3 Expressive's loading indicator: a morphing shape, here one Material shape turning */
export function LoadingIndicator(props: PartBase & { variant?: "default" | "contained"; size?: number; speed?: number }) {
  const p = withDefaults<{ variant?: string; size?: number; speed?: number; testID?: string }>("loading-indicator", props);
  const kit = useKit();
  const s = Math.round(p.size ?? 48);
  const contained = p.variant === "contained";
  const shape = Math.round(s * (contained ? 0.6 : 0.75));
  const src = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${shape}" height="${shape}" viewBox="0 0 100 100"><path d="${SHAPE_PATHS["soft-burst"] ?? SHAPE_PATHS.circle}" fill="currentColor"/></svg>`, kit.paint(contained ? "on-primary-container" : "st:primaryText"));
  return (
    <View {...tagOf(p.testID)} ariaRole="progressbar" style={sx({ width: s, height: s, borderRadius: s / 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: contained ? c("primary-container") : "transparent" })}>
      <View className="m3e-spin" style={sx({ width: shape, height: shape, animationDuration: `${Math.round(2400 / Math.max(0.25, p.speed ?? 1))}ms` })}>
        <TaroImage src={src} style={sx({ width: shape, height: shape, display: "block" })} />
      </View>
    </View>
  );
}

/* ---------- small marks ---------- */

const DOT: Record<string, string> = { primary: "primary", secondary: "secondary", tertiary: "tertiary", error: "error", outline: "outline", muted: "on-surface-variant", surface: "surface-container-highest" };

export function Dot(props: PartBase & { color?: string; size?: number; ring?: boolean }) {
  const p = withDefaults<{ color?: string; size?: number; ring?: boolean; testID?: string }>("dot", props);
  const s = Math.round(p.size ?? 8);
  return <View {...tagOf(p.testID)} style={sx({ width: s, height: s, borderRadius: s / 2, flexShrink: 0, backgroundColor: c(DOT[p.color ?? "primary"] ?? "primary"), ...(p.ring ? { boxShadow: `0 0 0 2px ${c("surface")}` } : null) })} />;
}

export function PageDots(props: PartBase & { count?: number; current?: number }) {
  const p = withDefaults<{ count?: number; current?: number; testID?: string }>("page-dots", props);
  const count = clampInt(p.count ?? 4, 1, 12);
  const current = clampInt(p.current ?? 0, 0, count - 1);
  return (
    <View {...tagOf(p.testID)} ariaLabel={`${current + 1} / ${count}`} style={sx(ROW, { columnGap: 8, height: 24, paddingLeft: 8, paddingRight: 8, alignSelf: "flex-start" })}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={sx({ width: 8, height: 8, borderRadius: 4, backgroundColor: i === current ? c("primary") : c("outline-variant") })} />
      ))}
    </View>
  );
}

export function TypingIndicator(props: PartBase & { label?: string }) {
  const p = withDefaults<{ label?: string; testID?: string }>("typing-indicator", props);
  const kit = useKit();
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { columnGap: 4, height: 32, paddingLeft: 12, paddingRight: 12, borderRadius: 16, backgroundColor: c("surface-container-high"), alignSelf: "flex-start" })}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={sx({ width: 6, height: 6, borderRadius: 3, backgroundColor: c("on-surface-variant"), opacity: 1 - i * 0.25 })} />
      ))}
      {p.label ? <Words text={p.label} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant"), marginLeft: 4 }} /> : null}
    </View>
  );
}

export function Kbd(props: PartBase & { keys?: ListRow[]; caption?: string }) {
  const p = withDefaults<{ keys?: ListRow[]; caption?: string; testID?: string }>("kbd", props);
  const kit = useKit();
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { columnGap: 8, alignSelf: "flex-start" })}>
      <View style={sx(ROW, { columnGap: 4 })}>
        {(p.keys ?? []).map((k, i) => (
          <View key={i} style={sx(ROW, { minWidth: 24, height: 24, paddingLeft: 6, paddingRight: 6, boxSizing: "border-box", borderRadius: corner(kit, "xs"), backgroundColor: c("surface-container-highest"), justifyContent: "center" })}>
            <Words text={k.label} style={{ ...typeStyle(kit, "label-medium"), fontSize: 15, fontFamily: "monospace", color: c("on-surface-variant") }} />
          </View>
        ))}
      </View>
      {p.caption ? <Words text={p.caption} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
    </View>
  );
}

/** placeholders where content is still loading */
export function Skeleton(props: PartBase & { layout?: "profile" | "text" | "card" | "block"; lines?: number; width?: number; height?: number }) {
  const p = withDefaults<{ layout?: string; lines?: number; width?: number; height?: number; testID?: string }>("skeleton", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 280);
  const bar = (style: CSS, key?: number) => <View key={key} className="m3e-shimmer" style={sx({ height: 16, borderRadius: corner(kit, "xs"), backgroundColor: c("surface-container-highest") }, style)} />;
  let body;
  switch (p.layout) {
    case "text": {
      const lines = clampInt(p.lines ?? 3, 1, 12);
      body = <View style={sx({ display: "flex", flexDirection: "column", rowGap: 8 })}>{Array.from({ length: lines }, (_, i) => bar({ width: i === lines - 1 && lines > 1 ? "66%" : "100%" }, i))}</View>;
      break;
    }
    case "card":
      body = (
        <View style={sx({ display: "flex", flexDirection: "column", rowGap: 12 })}>
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
        <View style={sx(ROW, { columnGap: 16 })}>
          <View className="m3e-shimmer" style={sx({ width: 48, height: 48, borderRadius: 24, flexShrink: 0, backgroundColor: c("surface-container-highest") })} />
          <View style={sx({ flexGrow: 1, display: "flex", flexDirection: "column", rowGap: 8 })}>
            {bar({ width: "100%" })}
            {bar({ width: "75%" })}
          </View>
        </View>
      );
  }
  return (
    <View {...tagOf(p.testID)} ariaLabel="Loading" style={sx({ width: w, flexShrink: 0 }, fill)}>
      {body}
    </View>
  );
}

export { extra };
