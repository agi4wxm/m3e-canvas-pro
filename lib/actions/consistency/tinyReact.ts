/* A small stand-in for React, for running a host's own React code headless in the table's runners (no DOM, no
 * renderer): the hooks keep their state by the place of the component in the tree, effects run after a render when
 * their dependencies change, contexts hand down what their providers give. Only the components a runner names are
 * called (each stays in the tree, what it drew as its children); every other element stays as data, with its props (its
 * handlers among them) for the runner to read and use.
 * Written into the mini-program kit's test bed by scripts/gen-miniapp.ts, so it imports nothing. */

type Props = Record<string, unknown> & { children?: unknown };
export type Element = { $$typeof: symbol; type: unknown; key: string | null; props: Props };
type Context<T> = { $$context: true; _default: T; _stack: T[]; Provider: { $$provider: Context<T> }; Consumer: { $$consumer: Context<T> } };
type Effect = { deps?: unknown[]; run?: () => void | (() => void); cleanup?: void | (() => void); due: boolean };
type Instance = { slots: unknown[]; effects: Effect[]; alive: boolean };

const ELEMENT = Symbol.for("react.transitional.element");
const FRAGMENT = Symbol.for("react.fragment");

const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

export function createTinyReact() {
  const instances = new Map<string, Instance>();
  let current: { inst: Instance; slot: number; effect: number } | null = null;
  let dirty = false;
  const seen = new Set<string>();

  const hook = () => {
    if (!current) throw new Error("a hook was called outside a component the runner renders");
    return current;
  };

  function useState<T>(initial: T | (() => T)): [T, (next: T | ((was: T) => T)) => void] {
    const c = hook();
    const i = c.slot++;
    if (!(i in c.inst.slots)) {
      const box: { value: T; set?: (next: T | ((was: T) => T)) => void } = { value: typeof initial === "function" ? (initial as () => T)() : initial };
      box.set = (next) => {
        const value = typeof next === "function" ? (next as (was: T) => T)(box.value) : next;
        if (Object.is(value, box.value)) return;
        box.value = value;
        dirty = true;
      };
      c.inst.slots[i] = box;
    }
    const box = c.inst.slots[i] as { value: T; set: (next: T | ((was: T) => T)) => void };
    return [box.value, box.set];
  }

  function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, (a: A) => void] {
    const [s, set] = useState(initial);
    return [s, (a: A) => set((was) => reducer(was, a))];
  }

  function useRef<T>(value: T): { current: T } {
    const c = hook();
    const i = c.slot++;
    if (!(i in c.inst.slots)) c.inst.slots[i] = { current: value };
    return c.inst.slots[i] as { current: T };
  }

  function useMemo<T>(make: () => T, deps?: unknown[]): T {
    const c = hook();
    const i = c.slot++;
    const was = c.inst.slots[i] as { value: T; deps?: unknown[] } | undefined;
    if (was && deps && !changed(was.deps, deps)) return was.value;
    const value = make();
    c.inst.slots[i] = { value, deps };
    return value;
  }

  const useCallback = <T>(fn: T, deps?: unknown[]): T => useMemo(() => fn, deps);

  function useEffect(run: () => void | (() => void), deps?: unknown[]) {
    const c = hook();
    const i = c.effect++;
    const was = c.inst.effects[i];
    if (!was) c.inst.effects[i] = { deps, run, due: true };
    else if (changed(was.deps, deps)) Object.assign(was, { deps, run, due: true });
  }

  function useSyncExternalStore<T>(subscribe: (fn: () => void) => () => void, get: () => T): T {
    const box = useRef<{ unsubscribe?: () => void; value?: T }>({});
    if (!box.current.unsubscribe)
      box.current.unsubscribe = subscribe(() => {
        if (!Object.is(get(), box.current.value)) dirty = true;
      });
    box.current.value = get();
    return box.current.value;
  }

  const useId = () => {
    const c = hook();
    const i = c.slot++;
    if (!(i in c.inst.slots)) c.inst.slots[i] = `:t${instances.size}:${i}:`;
    return c.inst.slots[i] as string;
  };

  function createContext<T>(value: T): Context<T> {
    const ctx = { $$context: true, _default: value, _stack: [] as T[] } as unknown as Context<T>;
    ctx.Provider = { $$provider: ctx };
    ctx.Consumer = { $$consumer: ctx };
    return ctx;
  }

  const useContext = <T>(ctx: Context<T>): T => (ctx._stack.length ? ctx._stack[ctx._stack.length - 1] : ctx._default);

  function createElement(type: unknown, config: Record<string, unknown> | null, ...children: unknown[]): Element {
    const { key, ...props } = config ?? {};
    if (children.length) props.children = children.length === 1 ? children[0] : children;
    return { $$typeof: ELEMENT, type, key: key === undefined || key === null ? null : String(key), props };
  }
  const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown): Element => ({ $$typeof: ELEMENT, type, key: key === undefined || key === null ? null : String(key), props: { ...props } });
  const isValidElement = (v: unknown): v is Element => !!v && typeof v === "object" && (v as Element).$$typeof === ELEMENT;
  const memo = <T>(c: T) => c;
  const forwardRef = <T>(render: T) => render;

  const nameOf = (type: unknown) => (typeof type === "function" ? type.name || "anonymous" : typeof type === "string" ? type : "node");

  /** the tree with the components `calls` names called (and theirs, as far as `calls` reaches), the rest left as data */
  function renderNode(node: unknown, path: string, calls: (type: unknown) => boolean): unknown {
    if (Array.isArray(node)) return node.map((x, i) => renderNode(x, `${path}[${isValidElement(x) && x.key !== null ? `k${x.key}` : i}]`, calls));
    if (!isValidElement(node)) return node;
    const type = node.type as { $$provider?: Context<unknown> } | ((p: Props) => unknown) | string | symbol;
    if (type && typeof type === "object" && "$$provider" in type && type.$$provider) {
      const ctx = type.$$provider;
      ctx._stack.push(node.props.value);
      try {
        return { ...node, props: { ...node.props, children: renderNode(node.props.children, `${path}/P`, calls) } };
      } finally {
        ctx._stack.pop();
      }
    }
    if (type === FRAGMENT) return renderNode(node.props.children, `${path}/F`, calls);
    if (typeof type === "function" && calls(type)) {
      const at = `${path}/${nameOf(type)}`;
      seen.add(at);
      const inst = instances.get(at) ?? { slots: [], effects: [], alive: true };
      instances.set(at, inst);
      const was = current;
      current = { inst, slot: 0, effect: 0 };
      let out: unknown;
      try {
        out = type(node.props);
      } finally {
        current = was;
      }
      /* the element stays, with what it drew as its children: a runner reads the props it was given */
      return { ...node, props: { ...node.props, children: renderNode(out, at, calls) } };
    }
    return { ...node, props: { ...node.props, children: renderNode(node.props.children, `${path}/${nameOf(type)}`, calls) } };
  }

  /** Renders the tree and runs the effects that are due, again while that changes state (a few times at most). */
  function render(root: unknown, calls: (type: unknown) => boolean): unknown {
    let out: unknown;
    for (let pass = 0; pass < 20; pass++) {
      dirty = false;
      seen.clear();
      out = renderNode(root, "", calls);
      /* what is no longer drawn is gone: its effects are cleaned up */
      for (const [at, inst] of instances)
        if (!seen.has(at)) {
          for (const e of inst.effects) if (typeof e.cleanup === "function") e.cleanup();
          instances.delete(at);
        }
      for (const inst of instances.values())
        for (const e of inst.effects) {
          if (!e.due || !e.run) continue;
          e.due = false;
          if (typeof e.cleanup === "function") e.cleanup();
          e.cleanup = e.run();
        }
      if (!dirty) break;
    }
    return out;
  }

  /** every element of a rendered tree, in order */
  function elements(node: unknown, out: Element[] = []): Element[] {
    if (Array.isArray(node)) for (const x of node) elements(x, out);
    else if (isValidElement(node)) {
      out.push(node);
      elements(node.props.children, out);
    }
    return out;
  }

  /** whether something has changed state since the last render */
  const isDirty = () => dirty;

  /** the hooks' state of every component rendered, for a runner to find a value it cannot read otherwise */
  const states = () => [...instances.values()].flatMap((i) => i.slots.map((s) => (s && typeof s === "object" && "value" in s ? (s as { value: unknown }).value : s)));

  /** forgets every component: the next render starts afresh, with effects cleaned up */
  function reset() {
    for (const inst of instances.values()) for (const e of inst.effects) if (typeof e.cleanup === "function") e.cleanup();
    instances.clear();
  }

  const react = {
    useState,
    useReducer,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useInsertionEffect: useEffect,
    useSyncExternalStore,
    useId,
    useContext,
    createContext,
    createElement,
    isValidElement,
    memo,
    forwardRef,
    Fragment: FRAGMENT,
    Children: { toArray: (c: unknown) => (Array.isArray(c) ? c : c === undefined || c === null ? [] : [c]), map: (c: unknown, fn: (x: unknown, i: number) => unknown) => (Array.isArray(c) ? c : c === undefined || c === null ? [] : [c]).map(fn) },
    startTransition: (fn: () => void) => fn(),
    useTransition: () => [false, (fn: () => void) => fn()] as const,
    useDeferredValue: <T>(v: T) => v,
    version: "tiny",
  };
  const jsxRuntime = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: FRAGMENT };
  return { react, jsxRuntime, render, elements, isDirty, states, reset };
}

export type TinyReact = ReturnType<typeof createTinyReact>;
