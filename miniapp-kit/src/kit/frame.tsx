import { View } from "@tarojs/components";
import { createFrameLoop, frameStyle, frameText, type FrameLoop, type FrameSpec } from "@m3e/app-runtime";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Icon, Text, useTextStyle, type PartBase, type TextProps } from "./atoms/basics";
import { Words } from "./atoms/words";
import { c } from "./color";
import { withDefaults } from "./parts";
import { tagOf } from "./Surface";
import { ROW, sx } from "./styles";
import { WORLDS } from "./world";

/* What a frame writes in a mini-program (docs/数据绑定.md “每帧绑定”, docs/小程序.md): a HUD's words and a health bar bound
 * per frame to the world's snapshot change every frame, so they are never drawn again by React. The screen's frame loop
 * (`useFrames`: the shared runtime's, on the platform's frame API, `requestAnimationFrame`, which Taro provides in a
 * mini-program and the browser in H5) evaluates them on each frame over the world an engine connected to a view's
 * channel (`WORLDS`), and hands each value that changed to these parts, which write it into the page's node they drew:
 * the text node of the words, the width of the fill, the opacity, each a change of that node alone (Taro sends it to
 * the page by itself), no render. */

/** what a part bound per frame listens to: each new value of one of its props, until it stops */
export type FrameHandle = Pick<FrameLoop, "listen">;

/* the frame loops of the screens drawn, so a test (the consistency table) can run a frame by hand and read them */
const LOOPS = new Set<FrameLoop>();

/** the frame loops of the screens drawn now */
export const liveFrames = (): FrameLoop[] => [...LOOPS];

const frameApi = globalThis as unknown as { requestAnimationFrame?: (fn: () => void) => unknown; cancelAnimationFrame?: (h: unknown) => void };

/** A screen's props bound per frame: the loop that evaluates them on every frame and hands each value to its part. */
export function useFrames(specs: readonly FrameSpec[]): FrameHandle {
  const loop = useMemo(
    () =>
      createFrameLoop({
        world: () => WORLDS.attached(),
        ...(frameApi.requestAnimationFrame ? { schedule: (fn: () => void) => frameApi.requestAnimationFrame!(fn), cancel: (h: unknown) => frameApi.cancelAnimationFrame?.(h) } : {}),
      }),
    [],
  );
  useEffect(() => {
    LOOPS.add(loop);
    const off = loop.add(specs);
    return () => {
      off();
      LOOPS.delete(loop);
    };
  }, [loop, specs]);
  return loop;
}

/** the page's node a part drew, as a frame writes it */
type Drawn = Parameters<typeof frameText>[0] & Parameters<typeof frameStyle>[0];

/** writes each value of a part's prop into the node `holder` was handed, as `write` puts it */
function useFrameWrite(frames: FrameHandle | undefined, part: string, prop: string, write: (node: Drawn, v: string | number) => void) {
  const node = useRef<Drawn | null>(null);
  useEffect(() => (frames ? frames.listen(part, prop, (v) => node.current && write(node.current, v), true) : undefined), [frames, part, prop, write]);
  return useCallback((n: unknown) => void (node.current = (n as Drawn | null) ?? null), []);
}

const words = (n: Drawn, v: string | number) => frameText(n, String(v));
const fade = (n: Drawn, v: string | number) => frameStyle(n, "opacity", String(Math.min(100, Math.max(0, Number(v))) / 100));

/** A text part bound per frame: its words, and its opacity (0–100), written by the screen's frame loop. */
export function FrameText(props: TextProps & { frames?: FrameHandle; part: string }) {
  const { p, style, lines } = useTextStyle(props);
  const text = useFrameWrite(props.frames, props.part, "text", words);
  const opacity = useFrameWrite(props.frames, props.part, "@opacity", fade);
  return (
    <View ref={opacity as never} {...tagOf(p.testID)} style={sx({ boxSizing: "border-box" }, p.fit === "auto" ? { flexShrink: 0 } : null)}>
      <Words text={p.text} lines={lines > 0 ? lines : undefined} style={style} holder={text} />
    </View>
  );
}

export type FrameBarProps = PartBase & { icon?: string; label?: string; value?: number; max?: number; color?: string; numbers?: boolean; width?: number; frames?: FrameHandle; part: string };

/** the fill's role for each of a stat bar's colors */
const BAR_ROLES: Record<string, string> = { error: "error", primary: "primary", secondary: "secondary", tertiary: "tertiary" };

/** A stat bar (a health bar) bound per frame, drawn as the part's atoms are: its icon, its label, a track and its fill,
 *  the numbers; the current value (the fill's width and the numbers) and the opacity written by the screen's frame loop. */
export function FrameBar(props: FrameBarProps) {
  const p = withDefaults<FrameBarProps>("stat-bar", props);
  const max = Math.max(1, Math.round(p.max ?? 100));
  const start = Math.min(1e6, Math.max(0, p.value ?? 0));
  const share = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const fillWrite = useCallback((n: Drawn, v: string | number) => frameStyle(n, "width", `${Math.min(100, Math.max(0, (Number(v) / max) * 100))}%`), [max]);
  const numbersWrite = useCallback((n: Drawn, v: string | number) => frameText(n, `${Math.round(Number(v))}/${max}`), [max]);
  const fill = useFrameWrite(p.frames, p.part, "value", fillWrite);
  const numbers = useFrameWrite(p.frames, p.part, "value", numbersWrite);
  const opacity = useFrameWrite(p.frames, p.part, "@opacity", fade);
  const tiny = useTextStyle({ text: "", styleVariant: "tiny", fit: "auto" });
  return (
    <View ref={opacity as never} {...tagOf(p.testID)} ariaRole="progressbar" style={sx(ROW, { width: Math.round(p.width ?? 240), alignItems: "center", gap: 8 })}>
      {p.icon ? <Icon name={p.icon} size={20} /> : null}
      {p.label ? <Text text={p.label} styleVariant="caption" bold fit="auto" /> : null}
      <View style={sx({ flex: 1, height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: c("surface-container-highest") })}>
        <View ref={fill as never} style={sx({ height: 12, borderRadius: 6, width: share(start), backgroundColor: c(BAR_ROLES[p.color ?? ""] ?? "primary") })} />
      </View>
      {p.numbers !== false ? <Words text={`${Math.round(start)}/${max}`} lines={1} style={tiny.style} holder={numbers} /> : null}
    </View>
  );
}
