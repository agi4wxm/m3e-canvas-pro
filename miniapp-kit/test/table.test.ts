/* The consistency table (lib/actions/consistency, docs/交互规则.md) on the mini-program kit: each row's design as the
 * exported mini-program has it (test/table/<row>: the screens lib/export/miniapp printed, its calls and spec, written by
 * `bun run gen:miniapp`), run by the kit's own runtime (src/kit/app/screen.tsx) over the shared one (@m3e/app-runtime),
 * drawn headless by a stand-in React (test/table/tinyReact.ts). Taro is a fake that keeps a stack of pages and the
 * toasts; the components are names. A row the kit does not do yet passes only while the row says so (`known.miniapp`). */
import { describe, expect, it, mock } from "bun:test";

import { runtimeTiny } from "./runtimeReact";
import type { Element } from "./table/tinyReact";
import { fakeComponents, fakeTaro } from "./taro";

/* the kit's React is the one the shared runtime (lib/app, outside this package) is loaded with (./runtimeReact.ts) */
const tiny = runtimeTiny;
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);

/* a page of the stack; `n` tells a page opened again apart from the one it replaced (a relaunch draws it anew) */
type Page = { route: string; options: Record<string, string>; n: number };
const stack: Page[] = [];
let opened = 0;
let toast: string | null = null;
const PageContext = tiny.react.createContext<{ params: Record<string, string>; top?: boolean }>({ params: {} });

/** the platform's word to a page that it is shown again (`shown`) or hidden under another: when its place on the stack
 *  changes from under to on top, or back */
const onShown = (shown: boolean) => (fn: () => void) => {
  const top = tiny.react.useContext(PageContext).top ?? true;
  const was = tiny.react.useRef(top);
  tiny.react.useEffect(() => {
    if (top !== was.current && top === shown) fn();
    was.current = top;
  }, [top]);
};

/** a page's address as the platform keeps it: its route, and its query still encoded */
const pageOf = (url: string): Page => {
  const [path, query = ""] = url.replace(/^\//, "").split("?");
  return { route: path, options: Object.fromEntries(query.split("&").filter(Boolean).map((kv) => kv.split("=") as [string, string])), n: ++opened };
};

const taroOwn = {
  navigateTo: async ({ url }: { url: string }) => void stack.push(pageOf(url)),
  redirectTo: async ({ url }: { url: string }) => void stack.splice(stack.length - 1, 1, pageOf(url)),
  navigateBack: async ({ delta = 1 }: { delta?: number } = {}) => void stack.splice(Math.max(1, stack.length - delta)),
  reLaunch: async ({ url }: { url: string }) => void stack.splice(0, stack.length, pageOf(url)),
  switchTab: async ({ url }: { url: string }) => void stack.splice(0, stack.length, pageOf(url)),
  getCurrentPages: () => stack.map((p) => ({ route: p.route, options: p.options })),
  showToast: async ({ title }: { title: string }) => void (toast = title),
  setClipboardData: async () => {},
  stopPullDownRefresh: () => {},
  getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280 }),
  onThemeChange: () => {},
  offThemeChange: () => {},
  getStorage: async () => Promise.reject(new Error("none")),
  setStorage: async () => {},
  removeStorage: async () => {},
  env: {},
  useRouter: () => tiny.react.useContext(PageContext),
  usePullDownRefresh: () => {},
  useReachBottom: () => {},
  useDidShow: onShown(true),
  useDidHide: onShown(false),
};
/* said now, not only when the module is first asked for: one an earlier file mocked is not asked for again, and what
   its fake does is what the last fake said (./taro.ts) */
fakeTaro(taroOwn);
mock.module("@tarojs/taro", () => fakeTaro(taroOwn));
mock.module("@tarojs/components", () => fakeComponents());

const { RuntimeProvider, hostLog, inputLog } = await import("@m3e/app-runtime");
type WorldChannel = import("@m3e/app-runtime").WorldChannel;
const { AppSpecProvider } = await import("../src/kit/app/screen");
const { goBack, lastMove, movesSoFar, openPlace, screenOfPath } = await import("../src/kit/app/nav");
const { readVar } = await import("../src/kit/app/vars");
const { answerWith } = await import("./table/backend");
const { drive, turns, verdict } = await import("./table/check");
const { ROWS } = await import("./table/rows");

type Runtime = import("@m3e/app-runtime").Runtime;
type AppSpec = import("../src/kit/app/spec").AppSpec;

const isElement = (v: unknown): v is Element => !!v && typeof v === "object" && "props" in v && "type" in v;
/** the words a kit part shows */
const wordsOf = (e: Element): string[] => ["label", "text", "title", "placeholder"].flatMap((k) => (typeof e.props[k] === "string" ? [e.props[k] as string] : []));

/** the entries of a part's list (a menu's, a group of buttons'), by their words */
const entriesOf = (e: Element): string[] => (Array.isArray(e.props.items) ? (e.props.items as { label?: unknown }[]).flatMap((r) => (r && typeof r.label === "string" ? [r.label] : [])) : []);

/** the words of a drawn page: what a closed layer holds is not on show, nor a menu's entries while it is shut; an open
 *  menu shows its entries (its sheet is the platform's, drawn over the page) */
function wordsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const x of node) wordsIn(x, out);
  else if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (isElement(node)) {
    out.push(...wordsOf(node));
    if (node.props.open === false) return out;
    if (node.props.open === true) out.push(...entriesOf(node));
    wordsIn(node.props.children, out);
  }
  return out;
}

/** the part drawn with these words (its own, its first entry's, its confirm button's) that handles `prop` */
const partWith = (elements: Element[], words: string, prop: string): Element => {
  const e = elements.find((x) => typeof x.props[prop] === "function" || (prop === "taps" && !!x.props.taps) ? [...wordsOf(x), ...entriesOf(x), ...(typeof x.props.action === "string" ? [x.props.action] : [])].includes(words) : false);
  if (!e) throw new Error(`no part "${words}" on show handles ${prop}`);
  return e;
};

describe("the consistency table on the mini-program kit", () => {
  it.each(ROWS.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const { SPEC } = (await import(`./table/${row.id}/spec`)) as { SPEC: AppSpec };
    const { SCREENS } = (await import(`./table/${row.id}/screens`)) as { SCREENS: Record<string, () => unknown> };
    const { runtime } = (await import(`./table/${row.id}/runtime`)) as { runtime: Runtime };
    tiny.reset();
    toast = null;
    stack.splice(0, stack.length, pageOf(SPEC.screens[SPEC.start].path));
    /* the app's pages, each with what its router says */
    function Pages() {
      return stack.map((p, i) => {
        const key = screenOfPath(SPEC, p.route) ?? "";
        return tiny.react.createElement(PageContext.Provider, { value: { params: p.options, top: i === stack.length - 1 }, key: `${i}:${p.n}` }, tiny.react.createElement(SCREENS[key] as never, null));
      });
    }
    const own = new Set<unknown>([RuntimeProvider, AppSpecProvider, Pages, ...Object.values(SCREENS)]);
    let tree: unknown;
    /* A world view's stand-in (src/kit/world.tsx) lists what it hears on the channel the printed screen hands it: each
       channel is listened to from when it is first drawn, as the stand-in does. */
    const heard = new Map<WorldChannel, string[]>();
    const draw = () => {
      tree = tiny.render(tiny.react.createElement(RuntimeProvider as never, { runtime }, tiny.react.createElement(AppSpecProvider as never, { spec: SPEC, components: SCREENS }, tiny.react.createElement(Pages, null))), (t) => own.has(t));
      for (const e of tiny.elements(tree)) {
        const c = e.props.channel as WorldChannel | undefined;
        if (!c || typeof c.listen !== "function" || heard.has(c)) continue;
        heard.set(c, []);
        c.listen((action, value) => heard.set(c, inputLog(heard.get(c) ?? [], action, value)));
        /* and what the app tells the world beside its inputs: to pause, to go on (docs/世界宿主契约.md “分层”) */
        c.watch?.((signal) => heard.set(c, hostLog(heard.get(c) ?? [], signal)));
      }
    };
    /** what the world views drawn on a page list of what they heard */
    const worldWords = (page: unknown): string[] => tiny.elements(page).flatMap((e) => (heard.has(e.props.channel as WorldChannel) ? (heard.get(e.props.channel as WorldChannel) ?? []) : []));
    /** the page on top of the stack, as drawn */
    const top = () => tiny.elements(tree).filter((e) => e.type === PageContext.Provider).at(-1);
    const { problems, seen } = await drive(row, (backend: import("./table/check").Backend) => {
      answerWith(async (r) => {
        const a = await backend.receive(r.operationId ?? "", { ...r.query, ...(r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : {}) });
        return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
      }, { connect: (address, onMessage) => backend.connect(address, onMessage), now: () => backend.now() });
      runtime.restart();
      draw();
      return {
        tap: (words) => {
          const e = tiny.elements(top()).find((x) => wordsOf(x).includes(words));
          if (!e) throw new Error(`no words "${words}" on show`);
          if (typeof e.props.onPress === "function") (e.props.onPress as () => void)();
          draw();
        },
        tapSlot: (words, slot) => {
          const e = partWith(tiny.elements(top()), words, "taps");
          (e.props.taps as Record<string, (() => void) | undefined>)[slot]?.();
          draw();
        },
        emit: (words, event, payload = {}) => {
          /* the part's callback for the event: its one value where it takes one (the number pad's words), else the payload */
          const prop = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
          const e = partWith(tiny.elements(top()), words, prop);
          (e.props[prop] as (v: unknown) => void)("value" in payload ? payload.value : payload);
          draw();
        },
        type: (words, value) => {
          const e = tiny.elements(top()).find((x) => wordsOf(x).includes(words) && typeof x.props.onChange === "function");
          if (!e) throw new Error(`no input "${words}" on show`);
          (e.props.onChange as (v: string) => void)(value);
          draw();
        },
        restart: () => {
          runtime.restart();
          draw();
        },
        /* the platform's own back (its button, a swipe): the page on top goes, no page of the kit's asked for */
        platformBack: () => {
          if (stack.length > 1) stack.pop();
          draw();
        },
        settle: async () => {
          for (let i = 0; i < 6; i++) {
            await turns(2);
            draw();
          }
        },
        observe: () => {
          const page = stack.at(-1);
          const key = page ? (screenOfPath(SPEC, page.route) ?? "") : "";
          /* the motion a back is handed is what the kit's navigator keeps (the page stack plays the platform's own) */
          const last = lastMove();
          const move = last ? { back: last.back, motion: last.motion?.kind ?? "none" } : undefined;
          return { vars: Object.fromEntries(row.vars.map((id) => [id, readVar(id)])) as Record<string, string | number | boolean>, words: [...wordsIn(top()), ...worldWords(top())], toast, screen: row.screens[key] ?? key, calls: backend.calls, ...(move ? { move } : {}) };
        },
      };
    });
    if (process.env.TABLE_DEBUG) console.log(`miniapp ${row.id}: ${JSON.stringify(problems)} ${JSON.stringify({ ...seen, words: seen.words.slice(0, 12) })}`);
    const v = verdict(row, "miniapp", problems);
    expect(v.ok ? "" : v.why).toBe("");
  });
});

describe("the visitor's moves on the mini-program kit", () => {
  it("count a page the platform shows by itself (its tab bar, its back), and not twice one the kit asked for", async () => {
    const spec = { start: "home", screens: { home: { path: "pages/home/index", tab: 0 }, deals: { path: "pages/deals/index", tab: 1 }, item: { path: "pages/item/index" } } } as unknown as AppSpec;
    stack.splice(0, stack.length, pageOf("/pages/home/index"));
    const at = movesSoFar();
    /* the kit opens a page: one move, however often the moves are read */
    await openPlace(spec, { screen: "item" });
    expect(movesSoFar()).toBe(at + 1);
    expect(movesSoFar()).toBe(at + 1);
    /* the platform's tab bar switches to another tab, which empties the stack down to it */
    stack.splice(0, stack.length, pageOf("/pages/deals/index"));
    expect(movesSoFar()).toBe(at + 2);
    /* the app shown again from the background is the same page: no move */
    expect(movesSoFar()).toBe(at + 2);
    /* the kit's own back is one move */
    await openPlace(spec, { screen: "item" });
    await goBack(spec);
    expect(movesSoFar()).toBe(at + 4);
  });
});

describe("a world view hosting the example engine, in the mini-program kit", () => {
  /* The printed test bed (src/printed/world, lib/export/rn/fixture.ts `worldDoc`): the world view drawn by its slot,
     which plugs M3E's example engine in (exampleWorld.tsx, what every export writes beside the slots); the pad's pushes
     go to the world as its `move` input, the skill presses `attack`, and the design's actions run on its events. */
  it("moves the player with the pad, runs the design's actions on what the world says, and ends the round", async () => {
    const { SPEC } = (await import("../src/printed/world/spec")) as { SPEC: AppSpec };
    const { SCREENS } = (await import("../src/printed/world/screens")) as { SCREENS: Record<string, () => unknown> };
    const { Arena } = (await import("../src/printed/world/slots")) as { Arena: unknown };
    const { ExampleWorld } = (await import("../src/printed/world/exampleWorld")) as { ExampleWorld: unknown };
    const { createRuntime } = await import("@m3e/app-runtime");
    const runtime = createRuntime({ transport: { request: async () => ({ status: 404, headers: {}, body: undefined }) }, lang: "en" });
    tiny.reset();
    toast = null;
    stack.splice(0, stack.length, pageOf(SPEC.screens[SPEC.start].path));
    function Pages() {
      return stack.map((p, i) => tiny.react.createElement(PageContext.Provider, { value: { params: p.options }, key: `${i}:${p.n}` }, tiny.react.createElement(SCREENS[screenOfPath(SPEC, p.route) ?? ""] as never, null)));
    }
    /* the slot and the example engine are drawn; the kit's components stay as data, their props to read */
    const own = new Set<unknown>([RuntimeProvider, AppSpecProvider, Pages, Arena, ExampleWorld, ...Object.values(SCREENS)]);
    let tree: unknown;
    const draw = () => {
      tree = tiny.render(tiny.react.createElement(RuntimeProvider as never, { runtime }, tiny.react.createElement(AppSpecProvider as never, { spec: SPEC, components: SCREENS }, tiny.react.createElement(Pages, null))), (t) => own.has(t));
    };
    const top = () => tiny.elements(tree).filter((e) => e.type === PageContext.Provider).at(-1);
    const named = (name: string) => tiny.elements(top()).find((e) => typeof e.type === "function" && e.type.name === name);
    draw();
    expect(named("WorldStandIn")?.props.label).toBe("Arena");
    /* the skill presses attack: the slime is near the hero, and the world says it was hit */
    (named("SkillButton")!.props.taps as { action: () => void }).action();
    draw();
    expect(toast).toBe("Hit the slime");
    /* the pad pushes right: the world moves the hero onto the coin, picks it up, and the round is over */
    (named("Joystick")!.props.onMove as (at: { x: number; y: number }) => void)({ x: 1, y: 0 });
    for (let i = 0; i < 10 && stack.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
      draw();
    }
    expect(toast).toBe("Got a coin");
    expect(screenOfPath(SPEC, stack.at(-1)!.route)).toBe("won");
  });
});

describe("a world view's stand-in", () => {
  it("draws the world's state as the props say, and lists the inputs it hears on its channel", async () => {
    tiny.reset();
    /* the stand-in imports the app runtime (its channels): it is drawn here, where the runtime's React is the stand-in's */
    const W = await import("../src/kit/world");
    const { createWorlds } = await import("@m3e/app-runtime");
    const worlds = createWorlds();
    const entities = { columns: ["Id", "Kind", "X", "Y", "Label"], rows: [["hero", "player", "20", "50", "Hero"], ["bad", "enemy", "x", "1", ""]] };
    let tree: unknown;
    const draw = () => void (tree = tiny.render(tiny.react.createElement(W.WorldStandIn as never, { label: "Arena", entities, score: 3, status: "paused", channel: worlds.channel("arena") }), (t) => t === W.WorldStandIn));
    draw();
    const w = { draw, words: () => tiny.elements(tree).filter((e) => typeof e.type === "function" && e.type.name === "Words").map((e) => e.props.text) };
    expect(w.words()).toEqual(expect.arrayContaining(["Arena", "Hero", "★ 3", "paused"]));
    expect(W.entitiesOf(entities).map((e) => e.id)).toEqual(["hero"]);
    worlds.send("arena", "move", { x: 0.5, y: -1 });
    worlds.send("arena", "move", { x: 1, y: 0 });
    worlds.send("arena", "attack", true);
    worlds.send("other", "attack", true);
    w.draw();
    /* a new direction of the same input takes the place of the one before; another world's inputs are not its own */
    expect(w.words().filter((t) => /^(move|attack) /.test(String(t)))).toEqual(["move 1,0", "attack ↓"]);
  });
});
