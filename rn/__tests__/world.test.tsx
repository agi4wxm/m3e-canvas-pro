import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { App as WorldApp } from "../src/printed/world/App";

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
