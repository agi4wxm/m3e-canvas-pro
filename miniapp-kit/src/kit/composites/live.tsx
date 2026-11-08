import { Image as TaroImage, Input as TaroInput, ScrollView, View, type CommonEvent } from "@tarojs/components";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Button, IconButton } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { NoFill, useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Surface, tagOf } from "../Surface";
import { BARE, merge, sx, ROW, COL, type CSS } from "../styles";
import { corner, typeStyle, useKit, type TypeRole } from "../theme";
import { tapOf } from "./bars";
import { calm, clock, grouped, pictureOf } from "./media";

/* What talks and what keeps time, drawn with Taro's views: a row of stories, a voice note, a call's picture (a capability
 * view: the stand-in an exported mini-program's slot draws until the product writes the real call, with
 * <LivePusher>/<LivePlayer> or a vendor's plugin), the marks and scroller of a chat with an assistant, a questionnaire,
 * shimmering words while something thinks, a number that counts up to its value and a timer.
 *
 * What is true comes in as props: which stories are seen (the rows' state), whether the call is connected and since
 * when, the microphone and camera, the time a timer reads off the other side's clock. What the visitor does goes out as
 * the part's taps and as callbacks named after its events (`onMuted`, `onEnded`), which an exported mini-program wires
 * once it runs events. Nothing here keeps a clock of its own, apart from the moving pictures a part is drawn with. */

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
    <View style={sx(ROW, { width: size, height: size, borderRadius: size / 2, backgroundColor: c("primary-container"), justifyContent: "center", flexShrink: 0 })}>
      <Words text={lettersOf(name)} style={{ ...typeStyle(kit, size >= 40 ? "title-medium" : "label-medium"), color: c("on-primary-container") }} />
    </View>
  );
}

/** a place inside a part a finger presses: its own tap, which goes no further */
function Press({ label, onPress, style, selected, children }: { label?: string; onPress?: () => void; style?: CSS; selected?: boolean; children?: ReactNode }) {
  return (
    <View ariaRole="button" ariaLabel={label} ariaSelected={selected} hoverClass={onPress ? "m3e-pressed" : "none"} onClick={(e) => (e.stopPropagation(), onPress?.())} style={sx(style)}>
      {children}
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
    <Surface base={merge({ width: Math.round(p.width ?? 380), borderRadius: corner(kit, "lg"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <ScrollView scrollX enhanced showScrollbar={false} style={sx({ width: "100%", whiteSpace: "nowrap" })}>
        <View style={sx(ROW, { columnGap: 12, padding: 8 })}>
          {items.map((it, i) => {
            const own = !!p.add && i === 0;
            const seen = it.variant === "seen";
            return (
              <Press key={i} label={it.label} selected={seen} onPress={tapOf(p, `tab:${i}`)} style={{ ...COL, alignItems: "center", rowGap: 6, width: 64, padding: 4, flexShrink: 0, boxSizing: "border-box" }}>
                <View style={sx({ position: "relative", padding: 2, borderRadius: 999, border: `2px solid ${own ? "transparent" : seen ? c("outline-variant") : c("primary")}` })}>
                  <Face name={it.label} />
                  {own ? (
                    <View style={sx(ROW, { position: "absolute", right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: c("primary"), justifyContent: "center" })}>
                      <Glyph name="add" size={12} color="on-primary" />
                    </View>
                  ) : null}
                </View>
                <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface"), textAlign: "center", alignSelf: "stretch" }} />
              </Press>
            );
          })}
        </View>
      </ScrollView>
    </Surface>
  );
}

/* ---------- a voice note ---------- */

export type VoiceMessageProps = PartBase & { seconds?: number; mine?: boolean; transcript?: string; transcribe?: string; width?: number };

/** the bars of a note's wave: the same note always draws the same wave */
export const waveOf = (seconds: number) => Array.from({ length: 24 }, (_, i) => 30 + ((i * 37 + Math.round(seconds) * 13) % 70));

/** a note's length as the canvas writes it: 0:12 */
export const voiceClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

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
  const ink = p.mine ? "on-primary" : "on-surface";
  const bars = waveOf(seconds);
  return (
    <Surface base={merge({ ...COL, rowGap: 4, padding: 8, width: Math.round(p.width ?? 240), borderRadius: corner(kit, "xl"), backgroundColor: c(p.mine ? "primary" : "surface-container-high"), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { columnGap: 8 })}>
        <Press label={playing ? "Pause" : "Play"} onPress={() => setPlaying((v) => !v)} style={{ ...ROW, justifyContent: "center", width: 36, height: 36, borderRadius: 18, backgroundColor: ca(ink, 0.15), flexShrink: 0 }}>
          <Glyph name={playing ? "pause" : "play_arrow"} size={20} color={ink} />
        </Press>
        <View style={sx(ROW, { flex: 1, minWidth: 0, height: 32, columnGap: 1 })}>
          {bars.map((h, i) => (
            <View key={i} style={sx({ flex: 1, minWidth: 0, height: `${h}%`, borderRadius: 999, backgroundColor: c(ink), opacity: i / bars.length > at / seconds ? 0.4 : 1 })} />
          ))}
        </View>
        <Words text={voiceClock(playing || at ? at : seconds)} style={{ ...typeStyle(kit, "label-small"), color: c(ink), flexShrink: 0, fontVariantNumeric: "tabular-nums" }} />
      </View>
      {p.transcript && p.transcribe && !shown ? (
        <Press label={p.transcribe} onPress={() => setShown(true)} style={{ alignSelf: "flex-start", padding: "2px 8px" }}>
          <Words text={p.transcribe} style={{ ...typeStyle(kit, "label-small"), color: c(ink), textDecoration: "underline" }} />
        </Press>
      ) : null}
      {p.transcript && shown ? <Words text={p.transcript} style={{ ...typeStyle(kit, "body-small"), color: c(ink), padding: "0 4px" }} /> : null}
    </Surface>
  );
}

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
  image?: string;
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
  const scrim = ca("scrim", 0.55);
  const pic = pictureOf(p.image);
  const round: CSS = { ...ROW, justifyContent: "center", width: 48, height: 48, borderRadius: 24 };
  const toggle = (key: "mic" | "camera" | "speaker", on: boolean, yes: string, no: string, label: string) => (
    <Press
      label={label}
      selected={on}
      onPress={() => {
        if (key === "mic") p.onMuted?.({ muted: on });
        p.taps?.[key]?.();
      }}
      style={{ ...round, backgroundColor: c(on ? "surface-container-high" : "inverse-on-surface") }}
    >
      <Glyph name={on ? yes : no} size={24} color={on ? "on-surface" : "inverse-surface"} />
    </Press>
  );
  return (
    <Surface base={merge({ ...COL, position: "relative", width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 560), borderRadius: corner(kit, "xl"), backgroundColor: c("inverse-surface"), overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <View style={sx({ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 })}>
        {pic ? (
          <TaroImage src={pic} mode="aspectFill" style={sx({ width: "100%", height: "100%", display: "block" })} />
        ) : (
          <View style={sx(ROW, { width: "100%", height: "100%", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${c("primary-container")}, ${c("tertiary-container")})` })}>
            <Glyph name={p.icon || "person"} size={40} color="on-primary-container" />
          </View>
        )}
      </View>
      <View style={sx(COL, { position: "relative", alignItems: "center", rowGap: 2, padding: 16, backgroundImage: `linear-gradient(${scrim}, transparent)` })}>
        <Words text={p.name} style={{ ...typeStyle(kit, "title-large"), color: c("inverse-on-surface") }} />
        <View ariaRole={time !== null ? "timer" : undefined}>
          <Words text={time !== null ? voiceClock(time) : p.status} style={{ ...typeStyle(kit, "body-small"), color: c("inverse-on-surface"), fontVariantNumeric: "tabular-nums" }} />
        </View>
      </View>
      <View style={sx(ROW, { position: "absolute", top: 80, right: 12, width: 80, height: 112, borderRadius: corner(kit, "lg"), overflow: "hidden", backgroundColor: c("surface-container"), justifyContent: "center" })}>
        <Glyph name={p.camera ? "person" : "videocam_off"} size={28} color="on-surface-variant" />
      </View>
      <View style={sx(ROW, { position: "relative", marginTop: "auto", justifyContent: "center", columnGap: 12, padding: 16, backgroundImage: `linear-gradient(transparent, ${scrim})` })}>
        {toggle("mic", !!p.mic, "mic", "mic_off", "Microphone")}
        {toggle("camera", !!p.camera, "videocam", "videocam_off", "Camera")}
        {toggle("speaker", !!p.speaker, "volume_up", "volume_off", "Speaker")}
        <Press
          label="End call"
          onPress={() => {
            p.onEnded?.();
            p.taps?.end?.();
          }}
          style={{ ...round, backgroundColor: c("error") }}
        >
          <Glyph name="call_end" size={24} color="on-error" />
        </Press>
      </View>
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
  const separator = p.variant === "separator";
  const line = <View style={sx({ flex: 1, minWidth: 0, height: 1, backgroundColor: c("outline-variant") })} />;
  return (
    <Surface base={merge({ ...ROW, columnGap: 8, minHeight: 16, width: Math.round(p.width ?? 320), flexShrink: 0 }, p.variant === "border" ? { borderBottom: `1px solid ${c("outline-variant")}`, paddingBottom: 8 } : null, fill)} appearance={p} onPress={p.onPress} testID={p.testID} role="heading">
      {separator ? line : null}
      {p.icon ? <Glyph name={p.icon} size={16} color="on-surface-variant" /> : null}
      <Words text={p.text} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), flexShrink: separator ? 0 : 1, textAlign: separator ? "center" : "left" }} />
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
  const height = Math.round(p.height ?? 288);
  /* far past the end is the end; a value a hair from the last one asks for the end again */
  const [top, setTop] = useState(1_000_000);
  const [away, setAway] = useState(false);
  const onScroll = (e: CommonEvent) => {
    const d = e.detail as { scrollTop?: number; scrollHeight?: number };
    setAway((d.scrollHeight ?? 0) - height - (d.scrollTop ?? 0) > 24);
  };
  const messages = p.messages ?? [];
  const body = typeStyle(kit, "body-medium");
  return (
    <Surface base={merge({ position: "relative", width: Math.round(p.width ?? 360), height, borderRadius: corner(kit, "lg"), border: `1px solid ${c("outline-variant")}`, backgroundColor: c("surface"), overflow: "hidden", boxSizing: "border-box", flexShrink: 0 }, fill)} testID={p.testID}>
      <ScrollView {...tagOf(p.testID ? `${p.testID}-list` : undefined)} scrollY scrollTop={top} scrollWithAnimation onScroll={onScroll} style={sx({ height: "100%" })}>
        <View style={sx(COL, { rowGap: 12, padding: 16, minHeight: "100%", justifyContent: "flex-end", boxSizing: "border-box" })}>
          {messages.map((m, i) => {
            const mine = i % 2 === 1;
            return (
              <View key={i} style={sx(ROW, { flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-start", columnGap: 8 })}>
                {!mine ? <Face name="AI" size={32} /> : null}
                <Surface base={{ maxWidth: "80%", padding: "10px 14px", borderRadius: corner(kit, "xli"), backgroundColor: c(mine ? "primary" : "surface-container-highest") }} appearance={p}>
                  <Words text={m.label} style={{ ...body, lineHeight: "1.625", color: c(mine ? "on-primary" : "on-surface") }} />
                </Surface>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {p.button && away ? (
        <View style={sx(ROW, { position: "absolute", bottom: 16, left: 0, right: 0, justifyContent: "center" })}>
          <NoFill>
            <IconButton icon="arrow_downward" variant="tonal" size="sm" ariaLabel="Scroll to end" onPress={() => setTop((t) => (t === 1_000_000 ? 999_999 : 1_000_000))} />
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
 *  has no word list (docs/小程序.md). */
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
  const next = () => {
    if (first && !picked.length) return setMissing(true);
    setMissing(false);
    if (last) {
      p.onSubmit?.({ choice: picked.map((i) => choices[i]?.label ?? ""), note: notes[0], feedback: notes[1] });
      p.onPress?.();
    } else setStep(at + 1);
  };
  const pick = (i: number) => {
    setMissing(false);
    setPicked((was) => (p.multiple ? (was.includes(i) ? was.filter((x) => x !== i) : [...was, i]) : [i]));
  };
  const title = first ? p.question : at === 1 ? "Anything else?" : "How can we improve?";
  return (
    <Surface base={merge({ ...COL, rowGap: 24, width: Math.round(p.width ?? 400), flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <NoFill>
        <Words text={`Question ${at + 1} of ${total}`} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant"), fontVariantNumeric: "tabular-nums" }} />
        <View style={sx(COL, { rowGap: 20 })}>
          <View style={sx(COL, { rowGap: 4 })}>
            <View ariaRole="heading">
              <Words text={title} style={{ ...typeStyle(kit, "body-large"), fontWeight: 600, color: c("on-surface") }} />
            </View>
            {first && p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
          </View>
          {first ? (
            <View ariaRole={p.multiple ? "group" : "radiogroup"} style={sx(COL, { rowGap: 12 })}>
              {choices.map((ch, i) => {
                const on = picked.includes(i);
                return (
                  <View
                    key={i}
                    ariaRole={p.multiple ? "checkbox" : "radio"}
                    ariaChecked={on}
                    ariaLabel={ch.label}
                    hoverClass="m3e-pressed"
                    onClick={(e) => (e.stopPropagation(), pick(i))}
                    style={sx(ROW, { minHeight: 44, columnGap: 12, padding: "14px 16px", borderRadius: corner(kit, "lg"), border: `1px solid ${missing ? c("error") : on ? ca("primary", 0.4) : c("outline-variant")}`, backgroundColor: on ? ca("primary", 0.1) : undefined, boxSizing: "border-box" })}
                  >
                    <View style={sx(ROW, { justifyContent: "center", width: 16, height: 16, flexShrink: 0, borderRadius: p.multiple ? 6 : 8, border: `1px solid ${on ? c("primary") : c("outline")}`, backgroundColor: on ? c("primary") : undefined, boxSizing: "border-box" })}>
                      {on ? p.multiple ? <Glyph name="check" size={14} color="on-primary" /> : <View style={sx({ width: 8, height: 8, borderRadius: 4, backgroundColor: c("on-primary") })} /> : null}
                    </View>
                    <Words text={ch.label} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
                  </View>
                );
              })}
              {missing ? (
                <View ariaRole="alert">
                  <Words text="Choose one to continue." style={{ ...typeStyle(kit, "body-medium"), color: c("error"), marginTop: 8 }} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={sx(ROW, { height: 56, padding: "0 12px", borderRadius: corner(kit, "xs"), border: `1px solid ${c("outline")}`, boxSizing: "border-box" })}>
              <TaroInput
                ariaLabel={title}
                value={notes[at - 1]}
                placeholder="Optional"
                placeholderStyle={`color: ${kit.paint("on-surface-variant")}`}
                onInput={(e) => setNotes((was) => was.map((v, i) => (i === at - 1 ? e.detail.value : v)))}
                style={sx(typeStyle(kit, "body-large"), BARE, { flex: 1, minWidth: 0, color: c("on-surface"), height: 24 })}
              />
            </View>
          )}
        </View>
        <View style={sx(ROW, { minHeight: 44, columnGap: 8 })}>
          <View style={sx(ROW, { flex: 1 })}>{!first ? <Button label="Previous" variant="outlined" onPress={() => setStep(at - 1)} /> : null}</View>
          {!first ? <Button label="Skip" variant="outlined" onPress={() => (last ? next() : setStep(at + 1))} /> : null}
          <Button label={last ? "Submit" : "Next"} onPress={next} />
        </View>
      </NoFill>
    </Surface>
  );
}

/* ---------- words that shimmer while something thinks ---------- */

export type ShimmerTextProps = PartBase & { text?: string };

/** the words pulse, as the canvas's do (the kit's stylesheet: `m3e-shimmer`) */
export function ShimmerText(props: ShimmerTextProps) {
  const p = withDefaults<ShimmerTextProps>("shimmer-text", props);
  const kit = useKit();
  return (
    <Surface base={{ alignSelf: "flex-start", flexShrink: 0 }} appearance={p} onPress={p.onPress} testID={p.testID} role="status">
      <View className={calm() ? undefined : "m3e-shimmer"}>
        <Words text={p.text} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} />
      </View>
    </Surface>
  );
}

/* ---------- a number that counts up to its value ---------- */

export type NumberTickerProps = PartBase & { value?: number; prefix?: string; suffix?: string; size?: "title" | "headline" | "display" };

const TICKER: Record<string, TypeRole> = { display: "display-small", title: "title-large", headline: "headline-medium" };

/** The value is the prop's: each time it changes the number runs up to it from nothing in 0.9 s, easing out, as the
 *  canvas's does (a timer of the page's own: a mini-program has no animation frames); it shows the value at once where
 *  motion is held still. */
export function NumberTicker(props: NumberTickerProps) {
  const p = withDefaults<NumberTickerProps>("number-ticker", props);
  const kit = useKit();
  const value = Math.round(p.value ?? 0);
  const still = calm();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (still) return;
    let t = 0;
    const id = setInterval(() => {
      t = Math.min(1, t + 16 / 900);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [value, still]);
  const words = `${p.prefix ?? ""}${grouped(still ? value : shown)}${p.suffix ?? ""}`;
  return (
    <Surface base={{ alignSelf: "flex-start", flexShrink: 0 }} appearance={p} onPress={p.onPress} testID={p.testID} label={`${p.prefix ?? ""}${grouped(value)}${p.suffix ?? ""}`}>
      <Words text={words} style={{ ...typeStyle(kit, TICKER[p.size ?? "headline"] ?? "headline-medium"), color: c("on-surface"), fontVariantNumeric: "tabular-nums" }} />
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
    <Surface base={merge({ ...ROW, justifyContent: "space-between", columnGap: 8, padding: 12, width: Math.round(p.width ?? 200), borderRadius: corner(kit, "xl"), backgroundColor: c("surface-container-low"), boxSizing: "border-box", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      <NoFill>
        <View ariaRole="timer">
          <Words text={clock(left)} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface"), fontVariantNumeric: "tabular-nums" }} />
        </View>
        <View style={sx(ROW, { columnGap: 4 })}>
          <IconButton icon={p.running ? "pause" : "play_arrow"} variant="tonal" size="xs" ariaLabel={p.running ? "Pause" : "Start"} onPress={tapOf(p, "toggle")} />
          <IconButton icon="replay" variant="text" size="xs" ariaLabel="Reset" onPress={tapOf(p, "reset")} />
        </View>
      </NoFill>
    </Surface>
  );
}
