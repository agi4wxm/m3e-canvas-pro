import { act as flush, fireEvent, render, screen } from "@testing-library/react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RuntimeProvider, useRequireAuth, type Runtime } from "@m3e/app-runtime";

import { AppProvider, MATERIAL, NavProvider, SnackHost, ThemeProvider, useApp, type AppState, type EffectHandler, type Nav, type Reader } from "../src/kit";
import { answerWith } from "./table/backend";
import { Backend, drive, turns, verdict, type Driver } from "./table/check";
import { ROWS } from "./table/rows";

/* The consistency table (lib/actions/consistency, docs/交互规则.md) on the React Native kit: each row's design as the
 * exported phone app has it (__tests__/table/<row>: the screens, bindings, effects and contract lib/export printed,
 * written by `bun run gen:rn`), run by the kit (src/kit/app.tsx) over the shared runtime (lib/app), drawn by React
 * Native as the kit's other tests draw it. Expo Router is stood in for by a stack that does what the app's routes do: a
 * screen pushed, put in place of another, laid over the one on show, and a screen that needs a session guarded. A row
 * the kit does not do yet passes only while the row says so (`known.rn`). */

type Row = (typeof ROWS)[number];
type Place = { key: string; params?: Record<string, unknown> };
type Modules = { SCREENS: Record<string, ComponentType<{ params?: Record<string, unknown> }>>; handleEffect: EffectHandler; reader: Reader; runtime: Runtime };

const load = (id: string): Modules => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- each row's printed app, loaded when its row runs
  ...(require(`./table/${id}/screens`) as Pick<Modules, "SCREENS">),
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- as above
  ...(require(`./table/${id}/effects`) as Pick<Modules, "handleEffect" | "reader">),
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- as above
  ...(require(`./table/${id}/runtime`) as Pick<Modules, "runtime">),
});

/** what the app's memory is, read by a part inside it */
const probe: { app?: AppState; place?: Place } = {};
function Probe() {
  const app = useApp();
  useEffect(() => {
    probe.app = app;
  });
  return null;
}

/** the routes: the screen on top of the stack and an overlay over it, a screen that needs a session guarded */
function Routes({ row, m }: { row: Row; m: Modules }) {
  const [stack, setStack] = useState<Place[]>([{ key: row.initial }]);
  const [overlay, setOverlay] = useState<Place | null>(null);
  const live = useRef({ stack, overlay });
  useEffect(() => {
    live.current = { stack, overlay };
    probe.place = stack[stack.length - 1];
  });
  const login = Object.keys(row.auth).find((k) => row.auth[k] === "login");
  const nav = useMemo<Nav>(
    () => ({
      go: (key, o = {}) => {
        if (!m.SCREENS[key]) return;
        const place = { key, ...(o.params ? { params: o.params } : {}) };
        if (o.overlay) return setOverlay(place);
        setOverlay(null);
        setStack((s) => (o.replace ? [...s.slice(0, -1), place] : [...s, place]));
      },
      back: () => (live.current.overlay ? setOverlay(null) : setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))),
      open: () => {},
      todo: () => {},
    }),
    [m],
  );
  const top = stack[stack.length - 1];
  /* to sign in, and back where the app was after (the app's routing.tsx `toSignIn`) */
  const toSignIn = useCallback(() => {
    if (!login) return;
    const from = live.current.stack[live.current.stack.length - 1];
    if (from && from.key !== login) m.runtime.rememberReturn(from);
    nav.go(login, { replace: true });
  }, [login, m, nav]);
  useEffect(() => m.runtime.whenUnauthorized(() => toSignIn()), [m, toSignIn]);
  useRequireAuth(row.auth[top.key] === "required", toSignIn);
  const Top = m.SCREENS[top.key];
  const Over = overlay ? m.SCREENS[overlay.key] : undefined;
  return (
    <NavProvider value={nav}>
      <Top key={stack.length} params={top.params} />
      {Over ? <Over params={overlay?.params} /> : null}
    </NavProvider>
  );
}

/** every piece of words drawn */
function wordsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const x of node) wordsIn(x, out);
  else if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object" && "children" in node) wordsIn((node as { children: unknown }).children, out);
  return out;
}

describe("the consistency table on the React Native kit", () => {
  it.each(ROWS.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const m = load(row.id);
    const { problems } = await drive(row, async (backend: Backend): Promise<Driver> => {
      answerWith(async (r) => {
        const a = await backend.receive(r.operationId ?? "", { ...r.query, ...(r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : {}) });
        return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
      });
      m.runtime.restart();
      await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
          <RuntimeProvider runtime={m.runtime}>
            <ThemeProvider theme={MATERIAL} dark={false}>
              <AppProvider vars={row.appVars} hidden={row.hidden} reader={m.reader} handle={m.handleEffect}>
                <Probe />
                <Routes row={row} m={m} />
                <SnackHost />
              </AppProvider>
            </ThemeProvider>
          </RuntimeProvider>
        </SafeAreaProvider>,
      );
      return {
        tap: async (words) => {
          await fireEvent.press(screen.getAllByText(words).at(-1)!);
        },
        type: async (words, value) => {
          /* the field with these words: its label, or what it shows while empty */
          const field = [...screen.queryAllByLabelText(words), ...screen.queryAllByPlaceholderText(words)].at(-1);
          if (!field) throw new Error(`no field "${words}" on show`);
          await fireEvent.changeText(field, value);
        },
        restart: async () => {
          await flush(async () => m.runtime.restart());
        },
        settle: async () => {
          await flush(async () => turns(4));
        },
        observe: () => ({
          vars: Object.fromEntries(row.vars.map((id) => [id, probe.app?.vars[id] as string | number | boolean])),
          words: wordsIn(screen.toJSON()),
          toast: probe.app?.snack?.message ?? null,
          screen: row.screens[probe.place?.key ?? ""] ?? "",
          calls: backend.calls,
        }),
      };
    });
    if (process.env.TABLE_DEBUG) console.log(`rn ${row.id}: ${JSON.stringify(problems)}`);
    const v = verdict(row, "rn", problems);
    expect(v.ok ? "" : v.why).toBe("");
  });
});
