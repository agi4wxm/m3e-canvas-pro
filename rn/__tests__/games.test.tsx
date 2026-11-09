import { act, fireEvent, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { EggSmash, GameBoard, GridDraw, Joystick, LevelMap, PrizeWheel, SkillButton, SlotMachine, ThemeProvider, DRAW_START, SPIN_MS, angleOf, boardStatus, cooldownLeft, drawAnswer, drawPress, drawRun, drawShown, givenOf, levelAt, pushOf, reelAt, reelsOf, vecOf, wheelTurn } from "../src/kit";
import { draw, MATERIAL_THEME } from "./helpers";

/* The game parts on a phone (composites/games.tsx): a machine only asks for its prize and plays to the one it is given,
 * a pad hands out where a finger pushes, a skill waits out the cooldown the other side gives, a level map picks and a
 * board shows the cells it is told. Nothing here decides a result: no prize, turn or cooldown of the kit's own. */

const themed = (ui: ReactElement) => <ThemeProvider theme={MATERIAL_THEME}>{ui}</ThemeProvider>;
const PRIZES = [{ label: "Gold", icon: "star" }, { label: "Silver" }, { label: "Bronze" }, { label: "Nothing" }];

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(SPIN_MS + 100);
  });
};

describe("a draw, as a state", () => {
  it("asks on a press and plays the answer that comes after it", () => {
    const asked = drawPress(DRAW_START, false, 4);
    expect(asked.asked).toBe(true);
    /* no answer yet: it waits */
    expect(drawAnswer(asked, -1, false)).toEqual({ state: asked });
    expect(drawAnswer(asked, 2, true)).toEqual({ state: asked });
    expect(drawAnswer(asked, 2, false).play).toBe(2);
    const run = drawRun(asked, 2);
    expect(run).toEqual({ phase: "running", won: 2, runs: 1, asked: false });
    /* busy while it runs, or while a result is on its way */
    expect(drawPress(run, false, 4)).toBe(run);
    expect(drawPress(DRAW_START, true, 4)).toBe(DRAW_START);
    expect(drawPress(DRAW_START, false, 0)).toBe(DRAW_START);
    expect(drawShown(asked, false)).toBe("pending");
  });

  it("once settled follows its result: another prize plays, none waits for a press again", () => {
    const done = { phase: "done" as const, won: 1, runs: 1, asked: false };
    expect(drawAnswer(done, 1, false)).toEqual({ state: done });
    expect(drawAnswer(done, 3, false).play).toBe(3);
    expect(drawAnswer(done, -1, false).state.phase).toBe("idle");
    /* pressed again with the same prize, it plays again */
    expect(drawAnswer(drawPress(done, false, 4), 1, false).play).toBe(1);
  });

  it("reads a result only among the prizes it shows, turns a wheel five times more each run, stops reels where told", () => {
    expect(givenOf(2, 4)).toBe(2);
    expect(givenOf(4, 4)).toBe(-1);
    expect(givenOf(1.5, 4)).toBe(-1);
    expect(wheelTurn(-1, 0, 8)).toBe(0);
    expect(wheelTurn(0, 1, 8)).toBe(1800 - 22.5);
    expect(wheelTurn(0, 2, 8)).toBe(3600 - 22.5);
    expect(reelsOf("0, 2,1", 4)).toEqual([0, 2, 1]);
    expect(reelsOf("0,9,1", 4)).toBeNull();
    expect([0, 1, 2].map((r) => reelAt("done", 0, r, 3, [0, 2, 1], 4))).toEqual([0, 2, 1]);
    expect([0, 1, 2].map((r) => reelAt("done", 0, r, 3, null, 4))).toEqual([3, 3, 3]);
  });
});

describe("a prize machine", () => {
  it("asks when pressed, waits with nothing given, and never picks a prize itself", async () => {
    const ask = jest.fn();
    const settled = jest.fn();
    await draw(<PrizeWheel label="Spin" prizes={PRIZES} taps={{ action: ask }} onSettled={settled} />);
    await fireEvent.press(screen.getByRole("button", { name: "Spin" }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Spin" }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await settle();
    expect(settled).not.toHaveBeenCalled();
    /* a second press while it waits is no press */
    await fireEvent.press(screen.getByRole("button", { name: "Spin" }));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("plays to the result that comes, settles on it and says so", async () => {
    const settled = jest.fn();
    const view = await draw(<PrizeWheel label="Spin" prizes={PRIZES} onSettled={settled} />);
    await fireEvent.press(screen.getByRole("button", { name: "Spin" }));
    await view.rerender(themed(<PrizeWheel label="Spin" prizes={PRIZES} result={2} onSettled={settled} />));
    expect(screen.queryByText("Bronze", { exact: true })).toBeTruthy();
    expect(settled).not.toHaveBeenCalled();
    await settle();
    expect(settled).toHaveBeenCalledWith({ index: 2, label: "Bronze" });
    /* the prize it settled on is said under it, and it can be pressed again */
    expect(screen.getAllByText("Bronze")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Spin" }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("waits for the new result while pending says one is coming, however old the one it has", async () => {
    const settled = jest.fn();
    const view = await draw(<PrizeWheel label="Spin" prizes={PRIZES} result={1} pending onSettled={settled} />);
    await settle();
    expect(settled).not.toHaveBeenCalled();
    await view.rerender(themed(<PrizeWheel label="Spin" prizes={PRIZES} result={3} onSettled={settled} />));
    await settle();
    /* told a result with no press, a machine that has not played waits for a press */
    expect(settled).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Spin" }));
    await settle();
    expect(settled).toHaveBeenCalledWith({ index: 3, label: "Nothing" });
  });

  it("a grid lights the prize it settles on; a slot machine stops its reels where it is told", async () => {
    const view = await draw(<GridDraw label="Draw" prizes={PRIZES} result={1} />);
    await fireEvent.press(screen.getByRole("button", { name: "Draw" }));
    await settle();
    await view.rerender(themed(<GridDraw label="Draw" prizes={PRIZES} result={1} />));
    expect(screen.getAllByText("Silver")).toHaveLength(2);
    /* the cell of the prize it settled on is lit, the others not */
    expect(screen.getAllByText("Silver")[0].parent?.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("Gold").parent?.props.accessibilityState).toMatchObject({ selected: false });
    await draw(<SlotMachine label="Pull" prizes={PRIZES} result={0} reels="1,2,3" />);
    await fireEvent.press(screen.getByRole("button", { name: "Pull" }));
    await settle();
    for (const words of ["Silver", "Bronze", "Nothing"]) expect(screen.getByText(words)).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
  });

  it("an egg is a place of its own: the one hit asks through its slot", async () => {
    const second = jest.fn();
    await draw(<EggSmash label="Pick" prizes={PRIZES} taps={{ "egg:1": second }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Pick 2" }));
    expect(second).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pick 2" }).props.accessibilityState).toMatchObject({ selected: true, disabled: true });
  });
});

/** a finger on a pad, where the pad has it */
const touch = (x: number, y: number) => ({
  nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [], identifier: 0, timestamp: 1 },
  touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 1, touchBank: [{ touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: 1, previousPageX: x, previousPageY: y, previousTimeStamp: 0 }] },
});

describe("a movement pad", () => {
  it("hands out the direction a finger pushes, and its letting go", async () => {
    const value = jest.fn();
    const release = jest.fn();
    await draw(<Joystick testID="pad" size={100} onValueChange={value} onRelease={release} />);
    const pad = screen.getByTestId("pad");
    await fireEvent(pad, "responderGrant", touch(100, 50));
    expect(value).toHaveBeenLastCalledWith("1,0");
    await fireEvent(pad, "responderMove", touch(50, 0));
    expect(value).toHaveBeenLastCalledWith("0,-1");
    await fireEvent(pad, "responderRelease", touch(50, 0));
    expect(release).toHaveBeenCalledWith({ x: 0, y: -1 });
    /* back to the middle */
    expect(value).toHaveBeenLastCalledWith("0,0");
  });

  it("shows the direction it is given, is pushed by a screen reader, and does nothing held still", async () => {
    const value = jest.fn();
    await draw(<Joystick testID="pad" value="0.71,-0.71" ariaLabel="Move" onValueChange={value} />);
    expect(screen.getByRole("adjustable", { name: "Move" }).props.accessibilityValue).toMatchObject({ now: 45, text: "0.71,-0.71" });
    await fireEvent(screen.getByTestId("pad"), "accessibilityAction", { nativeEvent: { actionName: "left" } });
    expect(value.mock.calls.map((c) => c[0])).toEqual(["-1,0", "0,0"]);
    const held = jest.fn();
    await draw(<Joystick testID="pad" disabled onValueChange={held} />);
    await fireEvent(screen.getByTestId("pad"), "accessibilityAction", { nativeEvent: { actionName: "up" } });
    expect(held).not.toHaveBeenCalled();
    expect(screen.getByTestId("pad").props.onResponderGrant).toBeUndefined();
  });

  it("reads a direction, its angle, and nothing near the middle", () => {
    expect(vecOf("2,-0.5")).toEqual({ x: 1, y: -0.5 });
    expect(vecOf("1")).toBeUndefined();
    expect(vecOf("a,b")).toBeUndefined();
    expect(angleOf({ x: 1, y: 0 })).toBe(90);
    expect(angleOf({ x: 0, y: 1 })).toBe(180);
    expect(pushOf(2, 2, 40)).toEqual({ x: 0, y: 0 });
    expect(pushOf(20, 0, 40)).toEqual({ x: 0.5, y: 0 });
    expect(pushOf(80, 0, 40)).toEqual({ x: 1, y: 0 });
  });
});

describe("a skill", () => {
  it("cools down until the other side's end, then asks when pressed", async () => {
    jest.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    const use = jest.fn();
    const ends = Date.now() + 2500;
    await draw(<SkillButton label="Dash" endsAt={ends} cooldown={5} taps={{ action: use }} />);
    const face = () => screen.getByRole("button", { name: "Dash" });
    expect(face().props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByText("3")).toBeTruthy();
    await fireEvent.press(face());
    expect(use).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("3")).toBeNull();
    await fireEvent.press(face());
    expect(use).toHaveBeenCalledTimes(1);
    /* a press starts no cooldown of its own */
    expect(face().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("reads the time left off the other side's clock", () => {
    expect(cooldownLeft(0, 1000)).toBe(0);
    expect(cooldownLeft(5000, 1000)).toBe(4);
    expect(cooldownLeft(500, 1000)).toBe(0);
  });
});

describe("a level map", () => {
  it("locks the levels past the current one and picks the one tapped", async () => {
    const second = jest.fn();
    const view = await draw(<LevelMap levels={6} level={2} perRow={3} taps={{ "tab:1": second }} />);
    expect(screen.getByRole("button", { name: "5" }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole("button", { name: "2" }));
    expect(second).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "2" }).props.accessibilityState).toMatchObject({ selected: true });
    /* the design picking another starts the visitor's pick again from it */
    await view.rerender(themed(<LevelMap levels={6} level={2} perRow={3} selected={0} />));
    expect(screen.getByRole("button", { name: "1" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole("button", { name: "2" }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it("lays its levels on a path that turns back at each row's end", () => {
    expect(levelAt(0, 4, 400)).toEqual({ x: 50, y: 46 });
    expect(levelAt(3, 4, 400)).toEqual({ x: 350, y: 46 });
    expect(levelAt(4, 4, 400)).toEqual({ x: 350, y: 138 });
  });
});

describe("a game board", () => {
  it("shows the cells and words it is told, and a press only asks", async () => {
    const cell = jest.fn();
    const reset = jest.fn();
    await draw(<GameBoard cells="X,,O" status="O to play" taps={{ "cell:1": cell, reset }} />);
    expect(screen.getByText("O to play")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1" }).props.accessibilityValue).toMatchObject({ text: "X" });
    await fireEvent.press(screen.getByRole("button", { name: "2" }));
    expect(cell).toHaveBeenCalled();
    /* the board is the game's: the kit places no mark of its own */
    expect(screen.getByRole("button", { name: "2" }).props.accessibilityValue?.text).toBeUndefined();
    await fireEvent.press(screen.getByText("Play again"));
    expect(reset).toHaveBeenCalled();
  });

  it("says whose turn it is at the start when told nothing, and never who won", () => {
    expect(boardStatus("", "mark", "{mark} to play", "X,O")).toBe("X to play");
    expect(boardStatus("Draw!", "mark", "{mark} to play", "X,O")).toBe("Draw!");
    expect(boardStatus("", "select", "{mark} to play", "X,O")).toBe("");
  });
});
