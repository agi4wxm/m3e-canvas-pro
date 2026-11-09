import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { createScriptedWorld } from "@m3e/app-runtime";

import { setStandInWorld, WorldStandIn } from "../src/kit";
import { App as WorldApp } from "../src/printed/world/App";
import { draw } from "./helpers";

/** a React fiber, as far as the test reads one: its props and what holds it */
type Fiber = { memoizedProps?: Record<string, unknown> | null; return: Fiber | null };

/** the pad's `onMove`, found up from its accessible element through what React holds it in */
function padPush(): (at: { x: number; y: number }) => void {
  let at = (screen.getByLabelText("Move") as unknown as { unstable_fiber: Fiber | null }).unstable_fiber;
  while (at && typeof at.memoizedProps?.onMove !== "function") at = at.return;
  if (!at?.memoizedProps) throw new Error("the pad hands out no pushes");
  return at.memoizedProps.onMove as (at: { x: number; y: number }) => void;
}

/* The world view hosting M3E's example engine (docs/组件规范.md “世界视口”, lib/export/rn/fixture.ts `worldDoc`), printed
 * as an exported app prints it: the world view drawn by its slot (src/printed/world/custom/slots/Arena.tsx, the
 * product's own), which plugs the example engine in (exampleWorld.tsx, what every export writes beside the slots). The
 * pad's pushes go to the world as its `move` input, the skill presses `attack`, and the design's actions run on the
 * world's events: a snackbar for a hit and for a coin picked up, the round over opening another screen. */

describe("a world view hosting the example engine", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("draws the world's state, and lists what it hears", async () => {
    await render(<WorldApp dark={false} />);
    expect(screen.getByText("Arena")).toBeTruthy();
    expect(screen.getByText("Hero")).toBeTruthy();
    expect(screen.getByText("★ 0")).toBeTruthy();
    await fireEvent.press(screen.getByText("Attack"));
    expect(screen.getByText("attack ↓")).toBeTruthy();
    expect(screen.getByText("attack ↑")).toBeTruthy();
  });

  it("runs the design's action on a hit the world says it took", async () => {
    await render(<WorldApp dark={false} />);
    await fireEvent.press(screen.getByText("Attack"));
    expect(screen.getByText("Hit the slime")).toBeTruthy();
  });

  it("moves the player with the pad, picks up the coin and ends the round", async () => {
    await render(<WorldApp dark={false} />);
    const push = padPush();
    await act(async () => push({ x: 1, y: 0 }));
    expect(screen.getByText("move 1,0")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    /* the coin picked up, said by the design's snackbar; the last one gone, the round over opens another screen */
    expect(screen.getByText("Got a coin")).toBeTruthy();
    expect(screen.getByText("You won")).toBeTruthy();
  });
});

/* A development build's mock world (docs/模拟库.md “世界脚本”): the stand-in plays what the app's mocks hand in (the
 * design's world script, played by the app runtime's createScriptedWorld), on the app's clock: its entities with their
 * hit points, its score, the words of its scene; with none handed in it draws the design's state as it always did. */
describe("the stand-in with a mock world handed in", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("plays it from the design's state, and stops when it is taken out", async () => {
    let now = 0;
    const script = {
      id: "duel",
      name: "Duel",
      start: { entities: [{ id: "boss", kind: "enemy", x: 50, y: 30, label: "Boss", hp: 100, maxHp: 100 }] },
      scene: "A cave",
      steps: [{ at: 500, entities: [{ id: "boss", hp: 40 }], set: { score: 60 }, scene: "The boss staggers" }],
    };
    const undo = setStandInWorld((start) => createScriptedWorld(script, { now: () => now, base: start, tickMs: 10 }));
    try {
      await draw(<WorldStandIn label="Cave" entities={{ columns: ["Id", "Kind", "X", "Y", "Label"], rows: [["hero", "player", "20", "80", "Hero"]] }} testID="w" />);
      expect(screen.getByText("A cave")).toBeTruthy();
      expect(screen.getByText("Boss")).toBeTruthy();
      expect(screen.getByText("★ 0")).toBeTruthy();
      await act(async () => {
        now += 600;
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByText("The boss staggers")).toBeTruthy();
      expect(screen.getByText("★ 60")).toBeTruthy();
    } finally {
      undo();
    }
    /* none handed in: the design's own state, its table's hit points drawn as a bar */
    await draw(<WorldStandIn label="Plain" scene="A field" entities={{ columns: ["Id", "Kind", "X", "Y", "Label", "HP", "Max HP"], rows: [["slime", "enemy", "50", "50", "Slime", "3", "10"]] }} />);
    expect(screen.getByText("A field")).toBeTruthy();
    expect(screen.getByText("Slime")).toBeTruthy();
  });
});
