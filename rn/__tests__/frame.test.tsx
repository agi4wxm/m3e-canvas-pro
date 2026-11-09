import { act, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";

import { FrameBar, FrameText, type FrameHandle } from "../src/kit";
import { draw, styleOf } from "./helpers";

/* The parts a frame writes on a phone (src/kit/frame.tsx, docs/数据绑定.md “每帧绑定”): they draw the design's value,
 * listen to the app's frame loop for their part's props, and take each value past React: the words onto the native
 * text input, the fill and the opacity into React Native's animated values: what React drew stays the design's. */

/** a frame loop's handle a test writes by hand: each part's prop, and how many listen */
function handle() {
  const sinks = new Map<string, Set<(v: string | number) => void>>();
  const h: FrameHandle = {
    listen(part, prop, write) {
      const k = `${part}:${prop}`;
      const set = sinks.get(k) ?? new Set();
      sinks.set(k, set);
      set.add(write);
      return () => void set.delete(write);
    },
  };
  const write = (part: string, prop: string, v: string | number) => act(() => [...(sinks.get(`${part}:${prop}`) ?? [])].forEach((fn) => fn(v)));
  return { h, write, listening: (part: string, prop: string) => sinks.get(`${part}:${prop}`)?.size ?? 0 };
}

describe("a part bound per frame", () => {
  it("draws a text's design words, then takes each frame's words onto its native view without a render", async () => {
    const f = handle();
    /* the native view the text input's ref reaches (React Native's stand-in under Jest): what the words are set on */
    const set = jest.spyOn((TextInput as unknown as { prototype: { setNativeProps: (p: object) => void } }).prototype, "setNativeProps");
    await draw(<FrameText frames={f.h} part="score" text="Score ?" testID="score" />);
    const input = screen.getByTestId("score");
    expect(input.props.defaultValue).toBe("Score ?");
    expect(input.props.editable).toBe(false);
    expect(f.listening("score", "text")).toBe(1);
    expect(f.listening("score", "@opacity")).toBe(1);
    await f.write("score", "text", "Score 7");
    expect(set).toHaveBeenCalledWith({ text: "Score 7" });
    /* the design's words stay what React drew: the frame's are on the native view */
    expect(screen.getByTestId("score").props.defaultValue).toBe("Score ?");
  });

  it("draws a stat bar's design value, and takes each frame's value into the fill and the numbers", async () => {
    const f = handle();
    await draw(<FrameBar frames={f.h} part="hp" label="HP" value={30} max={200} testID="hp" />);
    expect(screen.getByText("HP")).toBeTruthy();
    expect(screen.getByDisplayValue("30/200")).toBeTruthy();
    expect(f.listening("hp", "value")).toBe(2);
    await f.write("hp", "value", 150);
    await f.write("hp", "@opacity", 40);
    /* the bar's view is driven by the animated values: their values are what the frame wrote */
    const bar = screen.getByTestId("hp");
    expect(styleOf(bar).opacity).toBe(0.4);
  });

  it("draws the design's value outside an app, where no loop is handed in", async () => {
    await draw(<FrameText part="score" text="Score ?" testID="score" />);
    expect(screen.getByTestId("score").props.defaultValue).toBe("Score ?");
  });
});
