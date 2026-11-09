/* What talks and keeps time in the mini-program kit (src/kit/composites/live.tsx), drawn headless by the stand-in React
 * the consistency table runs on (test/table/tinyReact.ts): what each part shows from its props, what a press on each of
 * its places sends, and that a clock is read off the one the props name. The call is the stand-in its capability
 * view's slot draws until the product writes the real one. */
import { afterEach, describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";
import { fakeComponents, fakeTaro } from "./taro";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);
mock.module("@tarojs/components", () => fakeComponents());
mock.module("@tarojs/taro", () => {
  const taro = { getSystemInfoSync: () => ({ windowWidth: 375 }), onThemeChange: () => {}, offThemeChange: () => {} };
  return fakeTaro(taro);
});

const { ThemeProvider } = await import("../src/kit/theme");
const { MATERIAL } = await import("../src/kit/theme.generated");
const { c } = await import("../src/kit/color");
const L = await import("../src/kit/composites/live");
/* the device's clock: a run of the whole kit has an app's runtime clock handed in by an earlier file (the table) */
(await import("../src/kit/clock")).setClock(() => Date.now());

const h = tiny.react.createElement as (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => Element;
let root: unknown = null;
const redraw = (): Element[] => tiny.elements(tiny.render(h(ThemeProvider, { theme: MATERIAL, dark: false }, root), (t) => typeof t === "function"));
function draw(type: unknown, props: Record<string, unknown> = {}): Element[] {
  tiny.reset();
  root = h(type, props);
  return redraw();
}
function again(type: unknown, props: Record<string, unknown>): Element[] {
  root = h(type, props);
  return redraw();
}
const views = (els: Element[]) => els.filter((e) => typeof e.type === "string");
const byLabel = (els: Element[], label: string) => views(els).filter((e) => e.props.ariaLabel === label);
const one = (els: Element[], label: string) => {
  const found = byLabel(els, label);
  if (!found.length) throw new Error(`nothing is called ${label}`);
  return found[0];
};
const byPart = (els: Element[], id: string) => views(els).find((e) => e.props["data-part"] === id);
const words = (els: Element[]) => views(els).flatMap((e) => (typeof e.props.children === "string" ? [e.props.children] : []));
const styleOf = (el: Element | undefined) => (el?.props.style ?? {}) as Record<string, unknown>;
function press(el: Element): Element[] {
  (el.props.onClick as (e: unknown) => void)({ stopPropagation: () => {} });
  return redraw();
}

afterEach(() => tiny.reset());

describe("a row of stories", () => {
  it("rings the stories not seen yet, quietly the seen ones, and the visitor's own not at all", () => {
    const ada = mock(() => {});
    const els = draw(L.StoryRow, { items: [{ label: "Your story" }, { label: "Ada Lovelace" }, { label: "Grace", variant: "seen" }], taps: { "tab:1": ada } });
    expect(words(els)).toContain("AL");
    const ring = (label: string) => String(styleOf((one(els, label).props.children as Element[])[0]).border);
    expect(ring("Your story")).toContain("transparent");
    expect(ring("Ada Lovelace")).toContain(c("primary"));
    expect(ring("Grace")).toContain(c("outline-variant"));
    press(one(els, "Ada Lovelace"));
    expect(ada).toHaveBeenCalled();
    expect(L.lettersOf("grace")).toBe("G");
  });
});

describe("a voice note", () => {
  it("shows its length, plays in name only, and shows what was said", () => {
    let els = draw(L.VoiceMessage, { seconds: 72, transcript: "See you at six.", transcribe: "Show text" });
    expect(words(els)).toContain("1:12");
    els = press(one(els, "Play"));
    expect(byLabel(els, "Pause")).toHaveLength(1);
    els = press(one(els, "Show text"));
    expect(words(els)).toContain("See you at six.");
    expect(L.waveOf(12)).toHaveLength(24);
  });
});

describe("the call's stand-in", () => {
  it("shows its status until the call's adapter says when it started, then the time it has run", () => {
    expect(words(draw(L.CallStandIn, { name: "Ada", status: "Calling…" }))).toContain("Calling…");
    const startedAt = new Date(Date.now() - 65_000).toISOString();
    const els = draw(L.CallStandIn, { name: "Ada", status: "Calling…", startedAt });
    expect(words(els)).toContain("1:05");
    expect(views(els).some((e) => e.props.ariaRole === "timer")).toBe(true);
    expect(words(draw(L.CallStandIn, { connected: false, status: "Ended", startedAt }))).toContain("Ended");
    expect(L.callSeconds("nope", 0)).toBeNull();
  });

  it("asks to mute and to hang up; whether the microphone is on stays the call's", () => {
    const muted = mock(() => {});
    const ended = mock(() => {});
    const camera = mock(() => {});
    let els = draw(L.CallStandIn, { mic: true, onMuted: muted, onEnded: ended, taps: { camera } });
    els = press(one(els, "Microphone"));
    expect(muted).toHaveBeenCalledWith({ muted: true });
    expect(one(els, "Microphone").props.ariaSelected).toBe(true);
    press(one(els, "Camera"));
    expect(camera).toHaveBeenCalled();
    press(one(els, "End call"));
    expect(ended).toHaveBeenCalled();
  });
});

describe("the marks and the scroller of a chat", () => {
  it("a marker draws its words with hairlines either side, or a rule under them", () => {
    let els = draw(L.Marker, { testID: "m", text: "Today", variant: "separator" });
    expect(words(els)).toContain("Today");
    expect((byPart(els, "m")!.props.children as unknown[]).filter(Boolean)).toHaveLength(3);
    els = draw(L.Marker, { testID: "m", text: "Earlier", variant: "border" });
    expect(styleOf(byPart(els, "m"))).toMatchObject({ paddingBottom: 8 });
  });

  it("a scroller starts at the newest, and brings it back when scrolled up", () => {
    let els = draw(L.MessageScroller, { testID: "ms", height: 288, messages: [{ label: "Hi" }, { label: "Hello" }] });
    const list = () => byPart(els, "ms-list")!;
    expect(list().props.scrollTop).toBe(1_000_000);
    expect(byLabel(els, "Scroll to end")).toHaveLength(0);
    (list().props.onScroll as (e: unknown) => void)({ detail: { scrollTop: 0, scrollHeight: 600 } });
    els = redraw();
    els = press(one(els, "Scroll to end"));
    expect(list().props.scrollTop).toBe(999_999);
  });
});

describe("a questionnaire", () => {
  it("will not go on without an answer, goes back and forth, and hands out the answers when submitted", () => {
    const submit = mock(() => {});
    let els = draw(L.Questionnaire, { question: "Which?", choices: [{ label: "React" }, { label: "Vue" }], steps: 2, onSubmit: submit });
    expect(words(els)).toContain("Question 1 of 2");
    expect(byLabel(els, "Previous")).toHaveLength(0);
    els = press(one(els, "Next"));
    expect(words(els)).toContain("Choose one to continue.");
    els = press(one(els, "Vue"));
    expect(one(els, "Vue").props.ariaChecked).toBe(true);
    els = press(one(els, "Next"));
    expect(words(els)).toContain("Anything else?");
    const input = views(els).find((e) => e.type === "Input")!;
    (input.props.onInput as (e: unknown) => void)({ detail: { value: "Nice" } });
    els = press(one(redraw(), "Previous"));
    expect(words(els)).toContain("Which?");
    els = press(one(els, "Next"));
    press(one(els, "Submit"));
    expect(submit).toHaveBeenCalledWith({ choice: ["Vue"], note: "Nice", feedback: "" });
  });

  it("takes several answers when it says so", () => {
    let els = draw(L.Questionnaire, { choices: [{ label: "A" }, { label: "B" }], multiple: true, steps: 1 });
    els = press(one(els, "A"));
    els = press(one(els, "B"));
    expect(views(els).filter((e) => e.props.ariaRole === "checkbox").map((e) => e.props.ariaChecked)).toEqual([true, true]);
    expect(byLabel(els, "Submit")).toHaveLength(1);
  });
});

describe("words and numbers that move", () => {
  it("shimmering words, and a number with its marks, at once under test (motion held still)", () => {
    expect(words(draw(L.ShimmerText, { text: "Thinking…" }))).toContain("Thinking…");
    expect(words(draw(L.NumberTicker, { value: 1234567, prefix: "$", suffix: " left" }))).toContain("$1,234,567 left");
  });
});

describe("a timer", () => {
  it("reads its time off the other side's clock, skew and all", () => {
    expect(L.timerSeconds({ seconds: 60 }, 0)).toBe(60);
    expect(L.timerSeconds({ endsAt: 10_500, clockSkew: 1000 }, 5000)).toBe(5);
    expect(L.timerSeconds({ countdown: false, startedAt: 1000 }, 62_000)).toBe(61);
  });

  it("stands still at its seconds with no clock given, and only asks with its buttons", () => {
    const toggle = mock(() => {});
    const els = draw(L.Timer, { seconds: 90, running: true, taps: { toggle } });
    expect(words(els)).toContain("01:30");
    expect(words(press(one(els, "Pause")))).toContain("01:30");
    expect(toggle).toHaveBeenCalled();
  });

  it("reads the time off the app's clock (the back end's, setClock), never the device's", async () => {
    const { setClock } = await import("../src/kit/clock");
    const restore = setClock(() => 500_000);
    try {
      expect(words(draw(L.Timer, { endsAt: 530_000, running: true }))).toContain("00:30");
    } finally {
      restore();
    }
  });

  it("counts down to the end it is given, and says it ended once", () => {
    const ended = mock(() => {});
    expect(words(draw(L.Timer, { endsAt: Date.now() + 4500, running: true, onEnded: ended }))).toContain("00:05");
    /* time passes before the end it is given changes: the timer reads the clock as it draws, not when it first did */
    Bun.sleepSync(20);
    expect(words(again(L.Timer, { endsAt: Date.now() - 1, running: true, onEnded: ended }))).toContain("00:00");
    again(L.Timer, { endsAt: Date.now() - 1, running: true, onEnded: ended });
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
