/* The consistency table (lib/actions/consistency, docs/交互规则.md) on the mini-program kit: each row's design as the
 * exported mini-program has it (test/table/<row>: the screens lib/export/miniapp printed, its calls and spec, written by
 * `bun run gen:miniapp`), run by the kit's own runtime (src/kit/app/screen.tsx) over the shared one (@m3e/app-runtime),
 * drawn headless by a stand-in React (test/table/tinyReact.ts). Taro is a fake that keeps a stack of pages and the
 * toasts; the components are names. A row the kit does not do yet passes only while the row says so (`known.miniapp`). */
import { describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";

const tiny = createTinyReact();
/* the kit's React, and the one the shared runtime (lib/app, outside this package) resolves */
mock.module("react", () => tiny.react);
mock.module(Bun.resolveSync("react", new URL("../../lib/app/", import.meta.url).pathname), () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);

/* a page of the stack; `n` tells a page opened again apart from the one it replaced (a relaunch draws it anew) */
type Page = { route: string; options: Record<string, string>; n: number };
const stack: Page[] = [];
let opened = 0;
let toast: string | null = null;
const PageContext = tiny.react.createContext<{ params: Record<string, string> }>({ params: {} });

/** a page's address as the platform keeps it: its route, and its query still encoded */
const pageOf = (url: string): Page => {
  const [path, query = ""] = url.replace(/^\//, "").split("?");
  return { route: path, options: Object.fromEntries(query.split("&").filter(Boolean).map((kv) => kv.split("=") as [string, string])), n: ++opened };
};

mock.module("@tarojs/taro", () => {
  const taro = {
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
  };
  return { default: taro, ...taro };
});
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text", ScrollView: "ScrollView" }));

const { RuntimeProvider } = await import("@m3e/app-runtime");
const { AppSpecProvider } = await import("../src/kit/app/screen");
const { screenOfPath } = await import("../src/kit/app/nav");
const { readVar } = await import("../src/kit/app/vars");
const { answerWith } = await import("./table/backend");
const { drive, turns, verdict } = await import("./table/check");
const { ROWS } = await import("./table/rows");

type Runtime = import("@m3e/app-runtime").Runtime;
type AppSpec = import("../src/kit/app/spec").AppSpec;

const isElement = (v: unknown): v is Element => !!v && typeof v === "object" && "props" in v && "type" in v;
/** the words a kit part shows */
const wordsOf = (e: Element): string[] => ["label", "text", "title", "placeholder"].flatMap((k) => (typeof e.props[k] === "string" ? [e.props[k] as string] : []));

/** the words of a drawn page: what a closed layer holds is not on show, nor a menu's entries while it is shut */
function wordsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const x of node) wordsIn(x, out);
  else if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (isElement(node)) {
    out.push(...wordsOf(node));
    if (node.props.open === false) return out;
    wordsIn(node.props.children, out);
  }
  return out;
}

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
        return tiny.react.createElement(PageContext.Provider, { value: { params: p.options }, key: `${i}:${p.n}` }, tiny.react.createElement(SCREENS[key] as never, null));
      });
    }
    const own = new Set<unknown>([RuntimeProvider, AppSpecProvider, Pages, ...Object.values(SCREENS)]);
    let tree: unknown;
    const draw = () => {
      tree = tiny.render(tiny.react.createElement(RuntimeProvider as never, { runtime }, tiny.react.createElement(AppSpecProvider as never, { spec: SPEC, components: SCREENS }, tiny.react.createElement(Pages, null))), (t) => own.has(t));
    };
    /** the page on top of the stack, as drawn */
    const top = () => tiny.elements(tree).filter((e) => e.type === PageContext.Provider).at(-1);
    const { problems, seen } = await drive(row, (backend: import("./table/check").Backend) => {
      answerWith(async (r) => {
        const a = await backend.receive(r.operationId ?? "", { ...r.query, ...(r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : {}) });
        return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
      });
      runtime.restart();
      draw();
      return {
        tap: (words) => {
          const e = tiny.elements(top()).find((x) => wordsOf(x).includes(words));
          if (!e) throw new Error(`no words "${words}" on show`);
          if (typeof e.props.onPress === "function") (e.props.onPress as () => void)();
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
        settle: async () => {
          for (let i = 0; i < 6; i++) {
            await turns(2);
            draw();
          }
        },
        observe: () => {
          const page = stack.at(-1);
          const key = page ? (screenOfPath(SPEC, page.route) ?? "") : "";
          return { vars: Object.fromEntries(row.vars.map((id) => [id, readVar(id)])) as Record<string, string | number | boolean>, words: wordsIn(top()), toast, screen: row.screens[key] ?? key, calls: backend.calls };
        },
      };
    });
    if (process.env.TABLE_DEBUG) console.log(`miniapp ${row.id}: ${JSON.stringify(problems)} ${JSON.stringify({ ...seen, words: seen.words.slice(0, 12) })}`);
    const v = verdict(row, "miniapp", problems);
    expect(v.ok ? "" : v.why).toBe("");
  });
});
