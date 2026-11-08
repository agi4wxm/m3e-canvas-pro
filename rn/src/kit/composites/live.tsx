import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text as RNText, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Button, IconButton } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { NoFill, useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, sourceOf, withDefaults, type ListRow, type Picture } from "../parts";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit } from "../theme/ThemeProvider";
import type { TypeRole } from "../theme/types";
import { tapOf } from "./bars";
import { c, clock, grouped, pictureOf, useCalm } from "./media";

/* What talks and what keeps time, drawn natively: a row of stories, a voice note, a call's picture (a capability view:
 * the stand-in an exported app's slot draws until the product writes the real call), the marks and scroller of a chat
 * with an assistant, a questionnaire, shimmering words while something thinks, a number that counts up to its value and
 * a timer.
 *
 * What is true comes in as props: which stories are seen (the rows' state), whether the call is connected and since
 * when, the microphone and camera, the time a timer reads off the other side's clock. What the visitor does goes out as
 * the part's taps and as callbacks named after its events (`onMuted`, `onEnded`), which an exported app wires once it
 * runs events. Nothing here keeps a clock of its own, apart from the moving pictures a part is drawn with. */

/** one or two letters that stand for a name */
export const lettersOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toUpperCase();
  return (Array.from(words[0] ?? "?")[0] ?? "?").toUpperCase();
};

/** a round face: the person's letters on the primary container */
function Face({ name, size = 40 }: { name: string; size?: number }) {
  const kit = useKit();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c(kit, "primary-container"), alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ ...typeStyle(kit, size >= 40 ? "title-medium" : "label-medium"), color: c(kit, "on-primary-container") }}>{lettersOf(name)}</RNText>
    </View>
  );
}

/* ---------- a row of stories ---------- */

export type StoryRowProps = PartBase & { items?: ListRow[]; add?: boolean; width?: number };

/** Faces in a row a finger scrolls, each in a ring: the primary color until it is seen, a quiet one after. Which are seen
 *  is the data's (a row's state, `seen`): opening one is a tap on it (`tab:N`), which asks. With `add` the first is the
 *  visitor's own, with a plus. */
export function StoryRow(props: StoryRowProps) {
  const p = withDefaults<StoryRowProps>("story-row", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), borderRadius: corner(kit, "lg"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ columnGap: 12, padding: 8 }}>
        {items.map((it, i) => {
          const own = !!p.add && i === 0;
          const seen = it.variant === "seen";
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={it.label} accessibilityState={{ selected: seen }} onPress={tapOf(p, `tab:${i}`)} style={{ width: 64, alignItems: "center", rowGap: 6, padding: 4 }}>
              <View style={{ padding: 2, borderRadius: 999, borderWidth: 2, borderColor: own ? "transparent" : seen ? c(kit, "outline-variant") : c(kit, "primary") }}>
                <Face name={it.label} />
                {own ? (
                  <View style={{ position: "absolute", right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: c(kit, "primary"), alignItems: "center", justifyContent: "center" }}>
                    <Glyph name="add" size={12} color={c(kit, "on-primary")} />
                  </View>
                ) : null}
              </View>
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface"), textAlign: "center", alignSelf: "stretch" }}>{it.label}</RNText>
            </Pressable>
          );
        })}
      </ScrollView>
    </Surface>
  );
}

/* ---------- a voice note ---------- */

export type VoiceMessageProps = PartBase & { seconds?: number; mine?: boolean; transcript?: string; transcribe?: string; width?: number };

/** the bars of a note's wave: the same note always draws the same wave */
export const waveOf = (seconds: number) => Array.from({ length: 24 }, (_, i) => 30 + ((i * 37 + Math.round(seconds) * 13) % 70));

/** A note's wave, its length, a play button that runs the bar along it (the canvas's own presentation: no sound is
 *  played), and a link that shows what was said. */
export function VoiceMessage(props: VoiceMessageProps) {
  const p = withDefaults<VoiceMessageProps>("voice-message", props);
  const kit = useKit();
  const fill = useFill();
  const seconds = Math.max(1, p.seconds ?? 12);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setAt((now) => {
          if (now + 0.25 < seconds) return now + 0.25;
          setPlaying(false);
          return 0;
        }),
      250,
    );
    return () => clearInterval(id);
  }, [playing, seconds]);
  const ink = c(kit, p.mine ? "on-primary" : "on-surface");
  const bars = waveOf(seconds);
  return (
    <Surface base={{ width: Math.round(p.width ?? 240), padding: 8, rowGap: 4, borderRadius: corner(kit, "xl"), backgroundColor: c(kit, p.mine ? "primary" : "surface-container-high"), ...fill }} appearance={p} testID={p.testID}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} onPress={() => setPlaying((v) => !v)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: withAlpha(ink, 0.15), alignItems: "center", justifyContent: "center" }}>
          <Glyph name={playing ? "pause" : "play_arrow"} size={20} color={ink} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, height: 32, flexDirection: "row", alignItems: "center", columnGap: 1 }}>
          {bars.map((h, i) => (
            <View key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 999, backgroundColor: ink, opacity: i / bars.length > at / seconds ? 0.4 : 1 }} />
          ))}
        </View>
        <RNText style={{ ...typeStyle(kit, "label-small"), color: ink, fontVariant: ["tabular-nums"] }}>{voiceClock(playing || at ? at : seconds)}</RNText>
      </View>
      {p.transcript && p.transcribe && !shown ? (
        <Pressable accessibilityRole="button" onPress={() => setShown(true)} style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2 }}>
          <RNText style={{ ...typeStyle(kit, "label-small"), color: ink, textDecorationLine: "underline" }}>{p.transcribe}</RNText>
        </Pressable>
      ) : null}
      {p.transcript && shown ? <RNText style={{ ...typeStyle(kit, "body-small"), color: ink, paddingHorizontal: 4 }}>{p.transcript}</RNText> : null}
    </Surface>
  );
}

/** a note's length as the canvas writes it: 0:12 */
const voiceClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/* ---------- a call's picture: a capability view ---------- */

export type CallStandInProps = PartBase & {
  name?: string;
  connected?: boolean;
  status?: string;
  mic?: boolean;
  camera?: boolean;
  speaker?: boolean;
  /** when the call was connected, ISO time from the call's adapter */
  startedAt?: string;
  image?: Picture;
  icon?: string;
  height?: number;
  width?: number;
  onMuted?: (e: { muted: boolean }) => void;
  onEnded?: () => void;
};

/** how long a call has run, from when it started to now (ms) */
export const callSeconds = (startedAt: string | undefined, now: number) => {
  const started = Date.parse(startedAt ?? "");
  return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null;
};

/** The call's stand-in (lib/capabilities `rtc.view`): the other person's picture, their name and the time the call has
 *  run (from `startedAt`, which the call's adapter gives), a window for the visitor's own camera, and the controls.
 *  Whether the microphone, camera and speaker are on is the call's (props); a press on one is its place (`taps`), and
 *  the microphone's and the end's are sent as `muted` and `ended`. It connects nothing: the slot draws the real call. */
export function CallStandIn(props: CallStandInProps) {
  const p = withDefaults<CallStandInProps>("video-call", props);
  const kit = useKit();
  const fill = useFill();
  const ticks = !!p.connected && callSeconds(p.startedAt, 0) !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticks) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticks]);
  const time = ticks ? callSeconds(p.startedAt, now) : null;
  const scrim = withAlpha(c(kit, "scrim"), 0.55);
  const pic = pictureOf(p.image);
  const toggle = (key: "mic" | "camera" | "speaker", on: boolean, yes: string, no: string, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={() => {
        if (key === "mic") p.onMuted?.({ muted: on });
        p.taps?.[key]?.();
      }}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, on ? "surface-container-high" : "inverse-on-surface") }}
    >
      <Glyph name={on ? yes : no} size={24} color={c(kit, on ? "on-surface" : "inverse-surface")} />
    </Pressable>
  );
  const ink = c(kit, "inverse-on-surface");
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 560), borderRadius: corner(kit, "xl"), backgroundColor: c(kit, "inverse-surface"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
        {pic !== undefined && pic !== "" ? (
          <ExpoImage source={sourceOf(pic)} contentFit="cover" style={{ flex: 1 }} />
        ) : (
          <LinearGradient colors={[c(kit, "primary-container"), c(kit, "tertiary-container")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Glyph name={p.icon || "person"} size={40} color={c(kit, "on-primary-container")} />
          </LinearGradient>
        )}
      </View>
      <LinearGradient colors={[scrim, "transparent"]} style={{ alignItems: "center", rowGap: 2, padding: 16 }}>
        <RNText style={{ ...typeStyle(kit, "title-large"), color: ink }}>{p.name}</RNText>
        <RNText accessibilityRole={time !== null ? "timer" : undefined} style={{ ...typeStyle(kit, "body-small"), color: ink, fontVariant: ["tabular-nums"] }}>{time !== null ? voiceClock(time) : p.status}</RNText>
      </LinearGradient>
      <View style={{ position: "absolute", top: 80, right: 12, width: 80, height: 112, borderRadius: corner(kit, "lg"), overflow: "hidden", backgroundColor: c(kit, "surface-container"), alignItems: "center", justifyContent: "center" }}>
        <Glyph name={p.camera ? "person" : "videocam_off"} size={28} color={c(kit, "on-surface-variant")} />
      </View>
      <LinearGradient colors={["transparent", scrim]} style={{ marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 12, padding: 16 }}>
        {toggle("mic", !!p.mic, "mic", "mic_off", "Microphone")}
        {toggle("camera", !!p.camera, "videocam", "videocam_off", "Camera")}
        {toggle("speaker", !!p.speaker, "volume_up", "volume_off", "Speaker")}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End call"
          onPress={() => {
            p.onEnded?.();
            p.taps?.end?.();
          }}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, "error") }}
        >
          <Glyph name="call_end" size={24} color={c(kit, "on-error")} />
        </Pressable>
      </LinearGradient>
    </Surface>
  );
}

/* ---------- a marker in a conversation ---------- */

export type MarkerProps = PartBase & { text?: string; variant?: "default" | "separator" | "border"; icon?: string; width?: number };

/** a quiet line in a chat ("Today"): with hairlines either side, a rule under it, or alone */
export function Marker(props: MarkerProps) {
  const p = withDefaults<MarkerProps>("marker", props);
  const kit = useKit();
  const fill = useFill();
  const line = <View style={{ flex: 1, minWidth: 0, height: 1, backgroundColor: c(kit, "outline-variant") }} />;
  const separator = p.variant === "separator";
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), minHeight: 16, flexDirection: "row", alignItems: "center", columnGap: 8, ...(p.variant === "border" ? { borderBottomWidth: 1, borderBottomColor: c(kit, "outline-variant"), paddingBottom: 8 } : null), ...fill }} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityRole="header">
      {separator ? line : null}
      {p.icon ? <Glyph name={p.icon} size={16} color={c(kit, "on-surface-variant")} /> : null}
      <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), flexShrink: separator ? 0 : 1, textAlign: separator ? "center" : "left" }}>{p.text}</RNText>
      {separator ? line : null}
    </Surface>
  );
}

/* ---------- a scroller of messages ---------- */

export type MessageScrollerProps = PartBase & { messages?: ListRow[]; button?: boolean; width?: number; height?: number };

/** Messages that alternate between received (with the assistant's face, on a quiet bubble) and sent (on the primary
 *  color, at the end), starting scrolled to the newest. Scrolled up, a button brings the newest back. */
export function MessageScroller(props: MessageScrollerProps) {
  const p = withDefaults<MessageScrollerProps>("message-scroller", props);
  const kit = useKit();
  const fill = useFill();
  const list = useRef<ScrollViewInstance>(null);
  const [away, setAway] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setAway(contentSize.height - layoutMeasurement.height - contentOffset.y > 24);
  };
  const messages = p.messages ?? [];
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), height: Math.round(p.height ?? 288), borderRadius: corner(kit, "lg"), borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface"), overflow: "hidden", ...fill }} testID={p.testID}>
      <ScrollView ref={list} testID={p.testID ? `${p.testID}-list` : undefined} onScroll={onScroll} scrollEventThrottle={64} onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 16, rowGap: 12, flexGrow: 1, justifyContent: "flex-end" }}>
        {messages.map((m, i) => {
          const mine = i % 2 === 1;
          return (
            <View key={i} style={{ flexDirection: mine ? "row-reverse" : "row", columnGap: 8, alignItems: "flex-start" }}>
              {!mine ? <Face name="AI" size={32} /> : null}
              <Surface base={{ maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: corner(kit, "xli"), backgroundColor: c(kit, mine ? "primary" : "surface-container-highest") }} appearance={p}>
                <RNText style={{ ...typeStyle(kit, "body-medium"), lineHeight: Math.round(typeStyle(kit, "body-medium").fontSize! * 1.625), color: c(kit, mine ? "on-primary" : "on-surface") }}>{m.label}</RNText>
              </Surface>
            </View>
          );
        })}
      </ScrollView>
      {p.button && away ? (
        <View style={{ position: "absolute", bottom: 16, left: 0, right: 0, alignItems: "center" }}>
          <NoFill>
            <IconButton icon="arrow_downward" variant="tonal" size="sm" ariaLabel="Scroll to end" onPress={() => list.current?.scrollToEnd({ animated: true })} />
          </NoFill>
        </View>
      ) : null}
    </Surface>
  );
}

/* ---------- a questionnaire ---------- */

export type QuestionnaireProps = PartBase & {
  question?: string;
  description?: string;
  choices?: ListRow[];
  multiple?: boolean;
  steps?: number;
  width?: number;
  /** told of the answers when the last step is submitted */
  onSubmit?: (answers: { choice: string[]; note: string; feedback: string }) => void;
};

/** One question at a time, as the canvas's questionnaire runs it: the choice (one, or several) that must be answered to
 *  go on, then the optional notes; back, skip (the optional ones), next, and submit on the last. Where it is and what is
 *  answered is the visitor's draft; submitting hands the answers out. The words it says itself are in English: the kit
 *  has no word list (docs/手机端.md). */
export function Questionnaire(props: QuestionnaireProps) {
  const p = withDefaults<QuestionnaireProps>("questionnaire", props);
  const kit = useKit();
  const fill = useFill();
  const total = clampInt(p.steps ?? 2, 1, 3);
  const choices = p.choices ?? [];
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [notes, setNotes] = useState(["", ""]);
  const [missing, setMissing] = useState(false);
  const at = Math.min(step, total - 1);
  const first = at === 0;
  const last = at === total - 1;
  const answers = () => ({ choice: picked.map((i) => choices[i]?.label ?? ""), note: notes[0], feedback: notes[1] });
  const next = () => {
    if (first && !picked.length) return setMissing(true);
    setMissing(false);
    if (last) {
      p.onSubmit?.(answers());
      p.onPress?.();
    } else setStep(at + 1);
  };
  const pick = (i: number) => {
    setMissing(false);
    setPicked((was) => (p.multiple ? (was.includes(i) ? was.filter((x) => x !== i) : [...was, i]) : [i]));
  };
  const title = first ? p.question : at === 1 ? "Anything else?" : "How can we improve?";
  const muted = c(kit, "on-surface-variant");
  return (
    <Surface base={{ width: Math.round(p.width ?? 400), rowGap: 24, ...fill }} appearance={p} testID={p.testID}>
      <NoFill>
        <RNText style={{ ...typeStyle(kit, "label-medium"), color: muted, fontVariant: ["tabular-nums"] }}>{`Question ${at + 1} of ${total}`}</RNText>
        <View style={{ rowGap: 20 }}>
          <View style={{ rowGap: 4 }}>
            <RNText accessibilityRole="header" style={{ ...typeStyle(kit, "body-large"), fontWeight: "600", color: c(kit, "on-surface") }}>{title}</RNText>
            {first && p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: muted }}>{p.description}</RNText> : null}
          </View>
          {first ? (
            <View accessibilityRole={p.multiple ? undefined : "radiogroup"} style={{ rowGap: 12 }}>
              {choices.map((ch, i) => {
                const on = picked.includes(i);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole={p.multiple ? "checkbox" : "radio"}
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={ch.label}
                    onPress={() => pick(i)}
                    style={{ minHeight: 44, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: corner(kit, "lg"), borderWidth: 1, borderColor: missing ? c(kit, "error") : on ? withAlpha(c(kit, "primary"), 0.4) : c(kit, "outline-variant"), backgroundColor: on ? withAlpha(c(kit, "primary"), 0.1) : "transparent" }}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: p.multiple ? 6 : 8, borderWidth: 1, borderColor: on ? c(kit, "primary") : c(kit, "outline"), backgroundColor: on ? c(kit, "primary") : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {on ? p.multiple ? <Glyph name="check" size={14} color={c(kit, "on-primary")} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c(kit, "on-primary") }} /> : null}
                    </View>
                    <RNText style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{ch.label}</RNText>
                  </Pressable>
                );
              })}
              {missing ? <RNText accessibilityRole="alert" style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "error"), marginTop: 8 }}>Choose one to continue.</RNText> : null}
            </View>
          ) : (
            <TextInput
              accessibilityLabel={title}
              value={notes[at - 1]}
              onChangeText={(t) => setNotes((was) => was.map((v, i) => (i === at - 1 ? t : v)))}
              placeholder="Optional"
              placeholderTextColor={muted}
              style={{ height: 56, borderRadius: corner(kit, "xs"), borderWidth: 1, borderColor: c(kit, "outline"), paddingHorizontal: 12, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}
            />
          )}
        </View>
        <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          <View style={{ flex: 1, alignItems: "flex-start" }}>{!first ? <Button label="Previous" variant="outlined" onPress={() => setStep(at - 1)} /> : null}</View>
          {!first ? <Button label="Skip" variant="outlined" onPress={() => (last ? next() : setStep(at + 1))} /> : null}
          <Button label={last ? "Submit" : "Next"} onPress={next} />
        </View>
      </NoFill>
    </Surface>
  );
}

/* ---------- words that shimmer while something thinks ---------- */

export type ShimmerTextProps = PartBase & { text?: string };

/** the words pulse, as the canvas's do, and hold still when the system asks for less motion */
export function ShimmerText(props: ShimmerTextProps) {
  const p = withDefaults<ShimmerTextProps>("shimmer-text", props);
  const kit = useKit();
  const calm = useCalm();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (calm) return;
    const ease = Easing.bezier(0.4, 0, 0.6, 1);
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.5, duration: 1000, easing: ease, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 1000, easing: ease, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [o, calm]);
  return (
    <Surface base={{ alignSelf: "flex-start" }} appearance={p} onPress={p.onPress} testID={p.testID}>
      <Animated.Text accessibilityLiveRegion="polite" style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), opacity: o }}>{p.text}</Animated.Text>
    </Surface>
  );
}

/* ---------- a number that counts up to its value ---------- */

export type NumberTickerProps = PartBase & { value?: number; prefix?: string; suffix?: string; size?: "title" | "headline" | "display" };

const TICKER: Record<string, TypeRole> = { display: "display-small", title: "title-large", headline: "headline-medium" };

/** The value is the prop's: each time it changes the number runs up to it from nothing in 0.9 s, easing out, as the
 *  canvas's does; it shows the value at once when the system asks for less motion. */
export function NumberTicker(props: NumberTickerProps) {
  const p = withDefaults<NumberTickerProps>("number-ticker", props);
  const kit = useKit();
  const calm = useCalm();
  const value = Math.round(p.value ?? 0);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (calm) return;
    const start = Date.now();
    let frame = 0;
    const run = () => {
      const t = Math.min(1, (Date.now() - start) / 900);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [value, calm]);
  const words = `${p.prefix ?? ""}${grouped(calm ? value : shown)}${p.suffix ?? ""}`;
  return (
    <Surface base={{ alignSelf: "flex-start" }} appearance={p} onPress={p.onPress} testID={p.testID} accessibilityLabel={`${p.prefix ?? ""}${grouped(value)}${p.suffix ?? ""}`}>
      <RNText style={{ ...typeStyle(kit, TICKER[p.size ?? "headline"] ?? "headline-medium"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>{words}</RNText>
    </Surface>
  );
}

/* ---------- a timer ---------- */

export type TimerProps = PartBase & {
  seconds?: number;
  countdown?: boolean;
  running?: boolean;
  /** the end, ms on the other side's clock */
  endsAt?: number;
  /** the start, ms on the other side's clock */
  startedAt?: number;
  /** how far the other side's clock is ahead of the device's, ms */
  clockSkew?: number;
  width?: number;
  onEnded?: () => void;
};

/** the seconds a timer shows at `now` (the device's clock, ms), read off the other side's (docs/边界与契约.md) */
export function timerSeconds(p: Pick<TimerProps, "seconds" | "countdown" | "endsAt" | "startedAt" | "clockSkew">, now: number): number {
  const skew = Number.isFinite(p.clockSkew) ? (p.clockSkew ?? 0) : 0;
  const countdown = p.countdown !== false;
  if (countdown) return (p.endsAt ?? 0) > 0 ? Math.max(0, Math.ceil(((p.endsAt ?? 0) - (now + skew)) / 1000)) : Math.max(0, Math.round(p.seconds ?? 60));
  return (p.startedAt ?? 0) > 0 ? Math.max(0, Math.floor((now + skew - (p.startedAt ?? 0)) / 1000)) : 0;
}

/** A clock read off the one the other side keeps: counting down to `endsAt`, or up from `startedAt`, while `running`
 *  says it runs; with neither given it shows `seconds` (or nothing yet, counting up) and stands still. Its buttons only
 *  ask (`toggle`, `reset`), and a countdown it shows reaching the end sends `ended` once. */
export function Timer(props: TimerProps) {
  const p = withDefaults<TimerProps>("timer", props);
  const kit = useKit();
  const fill = useFill();
  const countdown = p.countdown !== false;
  const given = countdown ? (p.endsAt ?? 0) > 0 : (p.startedAt ?? 0) > 0;
  const live = !!p.running && given;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const left = given ? timerSeconds(p, now) : timerSeconds({ ...p, endsAt: 0, startedAt: 0 }, 0);
  /* the end of a countdown on show is said once */
  const before = useRef(left);
  const ended = p.onEnded;
  useEffect(() => {
    if (countdown && before.current > 0 && left === 0) ended?.();
    before.current = left;
  }, [left, countdown, ended]);
  return (
    <Surface base={{ width: Math.round(p.width ?? 200), flexDirection: "row", alignItems: "center", justifyContent: "space-between", columnGap: 8, padding: 12, borderRadius: corner(kit, "xl"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      <NoFill>
        <RNText accessibilityRole="timer" style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>{clock(left)}</RNText>
        <View style={{ flexDirection: "row", columnGap: 4 }}>
          <IconButton icon={p.running ? "pause" : "play_arrow"} variant="tonal" size="xs" ariaLabel={p.running ? "Pause" : "Start"} onPress={tapOf(p, "toggle")} />
          <IconButton icon="replay" variant="text" size="xs" ariaLabel="Reset" onPress={tapOf(p, "reset")} />
        </View>
      </NoFill>
    </Surface>
  );
}
