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

/** A clock the preview can stop and speed up: the time it tells, the timers it runs (the realtime scripts' messages,
 *  the answers' waits) and so the countdowns read off it. */
export type ControlledClock = MockClock & {
  readonly paused: boolean;
  /** how many of its milliseconds pass in one of the clock under it */
  readonly rate: number;
  pause(): void;
  resume(): void;
  /** from 0.1 to 10 times as fast */
  setRate(rate: number): void;
  /** hears of each pause, resume and change of rate; what it gives back stops it */
  listen(fn: () => void): () => void;
};

/** the rates a controlled clock takes */
export const CLOCK_RATES = { min: 0.1, max: 10 } as const;

/** A clock over another (the platform's, or a test's fake one) that can stand still and run at another rate. Its time
 *  goes on from where it stood; its timers wait the time it tells, so while it is paused nothing it holds runs, and at
 *  twice the rate a step 2 s later comes after 1 s of the clock under it. */
export function controlledClock(under: MockClock = realClock): ControlledClock {
  let paused = false;
  let rate = 1;
  /* the time it told when it was last set, and the time under it then */
  let told = under.now();
  let at = under.now();
  let seq = 0;
  const queue: { at: number; n: number; fn: () => void; live: boolean }[] = [];
  const listeners = new Set<() => void>();
  let cancel: (() => void) | undefined;
  const now = () => (paused ? told : told + (under.now() - at) * rate);
  const anchor = () => {
    told = now();
    at = under.now();
  };
  /** the clock under it is asked to wake it when the first timer is due */
  const schedule = () => {
    cancel?.();
    cancel = undefined;
    if (paused) return;
    const next = queue.filter((x) => x.live).sort((a, b) => a.at - b.at || a.n - b.n)[0];
    if (!next) return;
    cancel = under.setTimer(fire, Math.max(0, Math.ceil((next.at - now()) / rate)));
  };
  const fire = () => {
    cancel = undefined;
    for (;;) {
      if (paused) break;
      queue.sort((a, b) => a.at - b.at || a.n - b.n);
      const due = queue.findIndex((x) => x.live && x.at <= now() + 0.5);
      if (due < 0) break;
      const [item] = queue.splice(due, 1);
      item.live = false;
      try {
        item.fn();
      } catch {
        /* a timer's mistake is its own */
      }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].live) queue.splice(i, 1);
    schedule();
  };
  const notify = () => {
    for (const fn of listeners) fn();
  };
  const setTimer = (fn: () => void, ms: number) => {
    const item = { at: now() + Math.max(0, ms), n: seq++, fn, live: true };
    queue.push(item);
    schedule();
    return () => {
      item.live = false;
    };
  };
  return {
    now,
    sleep: (ms) => (ms > 0 ? new Promise<void>((resolve) => setTimer(resolve, ms)) : Promise.resolve()),
    setTimer,
    get paused() {
      return paused;
    },
    get rate() {
      return rate;
    },
    pause() {
      if (paused) return;
      anchor();
      paused = true;
      schedule();
      notify();
    },
    resume() {
      if (!paused) return;
      at = under.now();
      paused = false;
      schedule();
      notify();
    },
    setRate(next) {
      const r = Number.isFinite(next) ? Math.min(CLOCK_RATES.max, Math.max(CLOCK_RATES.min, next)) : 1;
      if (r === rate) return;
      anchor();
      rate = r;
      schedule();
      notify();
    },
    listen(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
