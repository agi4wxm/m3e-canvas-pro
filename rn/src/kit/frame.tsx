import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, TextInput, View, type TextInputInstance, type TextStyle } from "react-native";

import { Icon, Text, useTextStyle, type PartBase, type TextProps } from "./atoms/basics";
import { withDefaults } from "./parts";
import { useKit } from "./theme/ThemeProvider";

/* What a frame writes on a phone (docs/数据绑定.md “每帧绑定”, docs/手机端.md): a HUD's words and a health bar bound per
 * frame to the world's snapshot change every frame, so they are never drawn again by React. The app's frame loop (the
 * screen's `useFrames`, src/app/bind.ts, on the shared runtime's loop and requestAnimationFrame) evaluates them on each
 * frame and hands each value that changed to these parts, which write it past React: the words into a text input that
 * cannot be edited (`setNativeProps`), the fill's width and the opacity into React Native's own animated values
 * (`Animated.Value#setValue`, which updates the view it drives and renders nothing). Drawn outside an app (the gallery,
 * a printed test bed with no runtime) they show the design's value. The kit never imports the editor: the loop is the
 * app's, handed in as `frames`. */

/** what a part bound per frame listens to: each new value of one of its props (a text's `text`, a stat bar's `value`,
 *  any part's `@opacity`), until it stops */
export type FrameHandle = { listen(part: string, prop: string, write: (value: string | number) => void): () => void };

/** an animated value a frame writes: the design's at first, then each value the loop hands the part's prop */
function useFrameNumber(frames: FrameHandle | undefined, part: string, prop: string, start: number, as: (v: string | number) => number): Animated.Value {
  const [value] = useState(() => new Animated.Value(start));
  useEffect(() => (frames ? frames.listen(part, prop, (v) => value.setValue(as(v))) : undefined), [frames, part, prop, value, as]);
  return value;
}

const share = (v: string | number) => Math.min(100, Math.max(0, Number(v)));

/** words a frame writes, in a style: a text input that cannot be edited, its words set on the native view */
function FrameWords({ frames, part, prop, start, as, style, lines, testID }: { frames?: FrameHandle; part: string; prop: string; start: string; as: (v: string | number) => string; style: TextStyle; lines?: number; testID?: string }) {
  const input = useRef<TextInputInstance>(null);
  useEffect(() => (frames ? frames.listen(part, prop, (v) => input.current?.setNativeProps({ text: as(v) })) : undefined), [frames, part, prop, as]);
  return <TextInput ref={input} testID={testID} editable={false} multiline={lines !== 1} numberOfLines={lines} scrollEnabled={false} defaultValue={start} style={[style, { padding: 0, margin: 0 }]} />;
}

const asWords = (v: string | number) => String(v);

/** A text part bound per frame: its words, and its opacity (0–100), written by the app's frame loop. */
export function FrameText(props: TextProps & { frames?: FrameHandle; part: string }) {
  const { p, style, lines } = useTextStyle(props);
  const opacity = useFrameNumber(props.frames, props.part, "@opacity", 100, share);
  return (
    <Animated.View style={{ opacity: opacity.interpolate({ inputRange: [0, 100], outputRange: [0, 1] }) }}>
      <FrameWords frames={props.frames} part={props.part} prop="text" start={p.text ?? ""} as={asWords} style={style} lines={lines > 0 ? lines : undefined} testID={p.testID} />
    </Animated.View>
  );
}

export type FrameBarProps = PartBase & { icon?: string; label?: string; value?: number; max?: number; color?: string; numbers?: boolean; width?: number; frames?: FrameHandle; part: string };

/** the fill's role for each of a stat bar's colors */
const BAR_ROLES: Record<string, string> = { error: "error", primary: "primary", secondary: "secondary", tertiary: "tertiary" };

/** A stat bar (a health bar) bound per frame, drawn as the part's atoms are: its icon, its label, a track and its fill,
 *  the numbers; the current value (the fill's width and the numbers) and the opacity written by the app's frame loop. */
export function FrameBar(props: FrameBarProps) {
  const p = withDefaults<FrameBarProps>("stat-bar", props);
  const kit = useKit();
  const max = Math.max(1, Math.round(p.max ?? 100));
  const start = Math.min(1e6, Math.max(0, p.value ?? 0));
  const toShare = useCallback((v: string | number) => Math.min(100, Math.max(0, (Number(v) / max) * 100)), [max]);
  const ratio = useCallback((v: string | number) => `${Math.round(Number(v))}/${max}`, [max]);
  const fill = useFrameNumber(p.frames, p.part, "value", toShare(start), toShare);
  const opacity = useFrameNumber(p.frames, p.part, "@opacity", 100, share);
  const tiny = useTextStyle({ text: "", styleVariant: "tiny", fit: "auto" });
  return (
    <Animated.View testID={p.testID} accessibilityRole="progressbar" style={{ width: Math.round(p.width ?? 240), flexDirection: "row", alignItems: "center", columnGap: 8, opacity: opacity.interpolate({ inputRange: [0, 100], outputRange: [0, 1] }) }}>
      {p.icon ? <Icon name={p.icon} size={20} /> : null}
      {p.label ? <Text text={p.label} styleVariant="caption" bold fit="auto" /> : null}
      <View style={{ flex: 1, height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: kit.colors["surface-container-highest"] }}>
        <Animated.View style={{ height: 12, borderRadius: 6, backgroundColor: kit.colors[BAR_ROLES[p.color ?? ""] ?? "primary"], width: fill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }} />
      </View>
      {p.numbers !== false ? <FrameWords frames={p.frames} part={p.part} prop="value" start={ratio(start)} as={ratio} style={tiny.style} lines={1} /> : null}
    </Animated.View>
  );
}
