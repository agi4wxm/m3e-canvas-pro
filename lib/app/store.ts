/* A value that tells who listens when it changes: what the runtime's sessions, data and forms are kept in, so React
 * (useSyncExternalStore), React Native and a mini-program read them the same way. */

export type Listener = () => void;

export class Store<T> {
  private listeners = new Set<Listener>();

  constructor(private value: T) {}

  get = (): T => this.value;

  /** a new value, or one made from the last; listeners hear of it only when it is another value */
  set(next: T | ((was: T) => T)) {
    const value = typeof next === "function" ? (next as (was: T) => T)(this.value) : next;
    if (Object.is(value, this.value)) return;
    this.value = value;
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
}
