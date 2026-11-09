import { act, fireEvent, screen } from "@testing-library/react-native";

import { CallStandIn, Marker, MessageScroller, NumberTicker, Questionnaire, ShimmerText, StoryRow, ThemeProvider, Timer, VoiceMessage, timerSeconds } from "../src/kit";
import { lettersOf, waveOf } from "../src/kit/composites/live";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* What talks and keeps time, drawn natively (src/kit/composites/live.tsx): what each shows from its props, what a press
 * on each of its places sends, and that a clock is read off the one the props name. The call is the stand-in its
 * capability view's slot draws until the product writes the real one. */

const colors = MATERIAL_THEME.light.colors;

afterEach(() => jest.useRealTimers());

describe("a row of stories", () => {
  it("rings the stories not seen yet, quietly the seen ones, and the visitor's own not at all", async () => {
    const ada = jest.fn();
    await draw(<StoryRow items={[{ label: "Your story" }, { label: "Ada Lovelace" }, { label: "Grace", variant: "seen" }]} taps={{ "tab:1": ada }} />);
    expect(screen.getByText("AL")).toBeTruthy();
    const ring = (label: string) => styleOf(screen.getByLabelText(label).children[0] as never);
    expect(ring("Your story").borderColor).toBe("transparent");
    expect(ring("Ada Lovelace").borderColor).toBe(colors.primary);
    expect(ring("Grace").borderColor).toBe(colors["outline-variant"]);
    await fireEvent.press(screen.getByLabelText("Ada Lovelace"));
    expect(ada).toHaveBeenCalled();
    expect(lettersOf("grace")).toBe("G");
  });
});

describe("a voice note", () => {
  it("shows its length, runs its bar while playing, and shows what was said", async () => {
    jest.useFakeTimers();
    await draw(<VoiceMessage seconds={2} transcript="See you at six." transcribe="Show text" />);
    expect(screen.getByText("0:02")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Play"));
    await act(async () => void jest.advanceTimersByTime(1000));
    expect(screen.getByText("0:01")).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(1500));
    expect(screen.getByLabelText("Play")).toBeTruthy();
    await fireEvent.press(screen.getByText("Show text"));
    expect(screen.getByText("See you at six.")).toBeTruthy();
    expect(waveOf(12)).toEqual(waveOf(12));
  });
});

describe("the call's stand-in", () => {
  it("shows its status until the call's adapter says when it started, then the time it has run", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-11-08T10:00:00Z") });
    await draw(<CallStandIn name="Ada" status="Calling…" />);
    expect(screen.getByText("Calling…")).toBeTruthy();
    await draw(<CallStandIn name="Ada" status="Calling…" startedAt="2026-11-08T09:58:55Z" />);
    expect(screen.getByText("1:05")).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(2000));
    expect(screen.getByText("1:07")).toBeTruthy();
    await draw(<CallStandIn connected={false} status="Ended" startedAt="2026-11-08T09:58:55Z" />);
    expect(screen.getByText("Ended")).toBeTruthy();
  });

  it("asks to mute and to hang up; whether the microphone is on stays the call's", async () => {
    const muted = jest.fn();
    const ended = jest.fn();
    const camera = jest.fn();
    await draw(<CallStandIn mic onMuted={muted} onEnded={ended} taps={{ camera }} />);
    await fireEvent.press(screen.getByLabelText("Microphone"));
    expect(muted).toHaveBeenCalledWith({ muted: true });
    expect(screen.getByLabelText("Microphone").props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText("Camera"));
    expect(camera).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("End call"));
    expect(ended).toHaveBeenCalled();
  });
});

describe("the marks and the scroller of a chat", () => {
  it("a marker draws its words with hairlines either side", async () => {
    await draw(<Marker testID="m" text="Today" variant="separator" />);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByTestId("m").children).toHaveLength(3);
    await draw(<Marker testID="m" text="Earlier" variant="border" />);
    expect(styleOf(screen.getByTestId("m"))).toMatchObject({ borderBottomWidth: 1, paddingBottom: 8 });
  });

  it("a scroller alternates received and sent, and brings back the newest when scrolled up", async () => {
    await draw(<MessageScroller testID="ms" messages={[{ label: "Hi" }, { label: "Hello" }, { label: "How?" }]} />);
    expect(styleOf(screen.getByText("Hello"))).toMatchObject({ color: colors["on-primary"] });
    expect(styleOf(screen.getByText("Hi"))).toMatchObject({ color: colors["on-surface"] });
    expect(screen.queryByLabelText("Scroll to end")).toBeNull();
    await fireEvent.scroll(screen.getByTestId("ms-list"), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 600 }, layoutMeasurement: { height: 288 } } });
    expect(screen.getByLabelText("Scroll to end")).toBeTruthy();
  });
});

describe("a questionnaire", () => {
  it("will not go on without an answer, goes back and forth, and hands out the answers when submitted", async () => {
    const submit = jest.fn();
    await draw(<Questionnaire question="Which?" choices={[{ label: "React" }, { label: "Vue" }]} steps={2} onSubmit={submit} />);
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    expect(screen.queryByText("Previous")).toBeNull();
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Choose one to continue.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Vue"));
    expect(screen.getByRole("radio", { name: "Vue" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("Anything else?")).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText("Optional"), "Nice");
    await fireEvent.press(screen.getByText("Previous"));
    expect(screen.getByText("Which?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Next"));
    await fireEvent.press(screen.getByText("Submit"));
    expect(submit).toHaveBeenCalledWith({ choice: ["Vue"], note: "Nice", feedback: "" });
  });

  it("takes several answers when it says so", async () => {
    await draw(<Questionnaire choices={[{ label: "A" }, { label: "B" }]} multiple steps={1} />);
    await fireEvent.press(screen.getByLabelText("A"));
    await fireEvent.press(screen.getByLabelText("B"));
    expect(screen.getAllByRole("checkbox").map((c) => c.props.accessibilityState.checked)).toEqual([true, true]);
    expect(screen.getByText("Submit")).toBeTruthy();
  });
});

describe("words and numbers that move", () => {
  it("shimmering words, and a number with its marks, at once under test (motion held still)", async () => {
    await draw(<ShimmerText text="Thinking…" />);
    expect(screen.getByText("Thinking…")).toBeTruthy();
    await draw(<NumberTicker value={1234567} prefix="$" suffix=" left" />);
    expect(screen.getByText("$1,234,567 left")).toBeTruthy();
  });
});

describe("a timer", () => {
  it("reads its time off the other side's clock, skew and all", () => {
    expect(timerSeconds({ seconds: 60 }, 0)).toBe(60);
    expect(timerSeconds({ endsAt: 10_500, clockSkew: 1000 }, 5000)).toBe(5);
    expect(timerSeconds({ countdown: false, startedAt: 1000 }, 62_000)).toBe(61);
    expect(timerSeconds({ countdown: false }, 62_000)).toBe(0);
  });

  it("stands still at its seconds with no clock given, and only asks with its buttons", async () => {
    const toggle = jest.fn();
    await draw(<Timer seconds={90} running taps={{ toggle }} />);
    expect(screen.getByText("01:30")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Pause"));
    expect(toggle).toHaveBeenCalled();
    expect(screen.getByText("01:30")).toBeTruthy();
  });

  it("counts down to the end it is given while it runs, and says it ended once", async () => {
    jest.useFakeTimers({ now: 100_000 });
    const ended = jest.fn();
    await draw(<Timer endsAt={102_000} running onEnded={ended} />);
    expect(screen.getByText("00:02")).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(1000));
    expect(screen.getByText("00:01")).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(3000));
    expect(screen.getByText("00:00")).toBeTruthy();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("reads the clock as it draws: a new end shows at once, not at the next tick", async () => {
    jest.useFakeTimers({ now: 100_000 });
    const drawn = await draw(<Timer endsAt={160_000} running />);
    expect(screen.getByText("01:00")).toBeTruthy();
    /* half a second on, before the next tick, the other side moves the end to ten seconds from now */
    jest.setSystemTime(100_500);
    await drawn.rerender(
      <ThemeProvider theme={MATERIAL_THEME}>
        <Timer endsAt={110_500} running />
      </ThemeProvider>,
    );
    expect(screen.getByText("00:10")).toBeTruthy();
  });
});
