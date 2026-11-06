/* Time for the mocks: when answers arrive, when tokens expire, when realtime messages come. The real one uses the
 * platform's timers (found on globalThis, so no DOM or Node types are needed); the fake one moves only when a test
 * says so. */

/** what a caller can stop */
export type Abortable = { readonly aborted: boolean };

export type MockClock = {
  now(): number;
  /** waits ms; ends early (resolving) when the signal is aborted, if the platform tells */
  sleep(ms: number, signal?: Abortable): Promise<void>;
  /** calls fn after ms; the function returned cancels it */
  setTimer(fn: () => void, ms: number): () => void;
};

type Timers = { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
const timers = () => globalThis as unknown as Timers;

export const realClock: MockClock = {
  now: () => Date.now(),
  sleep: (ms) => (ms > 0 ? new Promise<void>((resolve) => timers().setTimeout(resolve, ms)) : Promise.resolve()),
  setTimer(fn, ms) {
    const id = timers().setTimeout(fn, ms);
    return () => timers().clearTimeout(id);
  },
};

/** A clock that stands still until `advance` moves it: every sleep and timer due by then runs, in order. */
export function fakeClock(start = Date.UTC(2026, 0, 15, 9, 0, 0)): MockClock & { advance(ms: number): Promise<void>; readonly pending: number } {
  let time = start;
  let seq = 0;
  const queue: { at: number; n: number; fn: () => void; live: boolean }[] = [];
  const add = (fn: () => void, ms: number) => {
    const item = { at: time + Math.max(0, ms), n: seq++, fn, live: true };
    queue.push(item);
    return item;
  };
  return {
    now: () => time,
    sleep: (ms) => (ms > 0 ? new Promise<void>((resolve) => add(resolve, ms)) : Promise.resolve()),
    setTimer(fn, ms) {
      const item = add(fn, ms);
      return () => {
        item.live = false;
      };
    },
    get pending() {
      return queue.filter((x) => x.live).length;
    },
    async advance(ms: number) {
      const until = time + ms;
      /* what was started just before (a call on its way to its wait) gets there first */
      for (let i = 0; i < 20; i++) await Promise.resolve();
      for (;;) {
        queue.sort((a, b) => a.at - b.at || a.n - b.n);
        const next = queue.find((x) => x.live && x.at <= until);
        if (!next) break;
        next.live = false;
        queue.splice(queue.indexOf(next), 1);
        time = Math.max(time, next.at);
        next.fn();
        /* what the timer started (a promise's continuation) runs before the next one */
        for (let i = 0; i < 20; i++) await Promise.resolve();
      }
      time = until;
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
  };
}
