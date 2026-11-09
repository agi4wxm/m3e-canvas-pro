import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transport } from "../../api/transport";
import type { CapabilityHost, FailureKind } from "../../capabilities/types";
import { createRuntime, RuntimeProvider, type AuthConfig, type Runtime } from "../../app";
import { buildScreens } from "../../codegen";
import { apiModelOf } from "../../export/api";
import { contractOf } from "../../export/product";
import { authSource } from "../../export/targets/webSources";
import { RUNTIME_TEMPLATE, runtimeSource } from "../../runtimeSource";
import type { Doc } from "../../tokens";
import { drive, givenOf, turns, verdict, type Backend, type Driver } from "./check";
import { designDoc } from "./design";
import { ROWS } from "./rows";
import { tiny } from "./tiny";
import type { Element } from "./tinyReact";
import type { HostName, Observed } from "./types";
import { inputLog } from "../../world/channel";
import type { WorldChannel } from "../../world/types";
import { fillSpawnWords, type Spawns } from "../../spawn";

/* The table on both web exports, as the printers write them: the screens printed by lib/codegen (lib/printBehaviour.ts,
 * and lib/printBindings.ts for the product), the app's runtime printed by lib/runtimeSource.ts, and for the product the
 * shared runtime (lib/app, which packages/app-runtime copies). Each row's code is written to a folder of its own and
 * imported as the app imports it; the stand-in React (tinyReact.ts) draws it, a tap is the handler the printed code put
 * on the part, typing its `onChange`. The design system's components are names only: what they draw is not under test. */

vi.mock("react", async () => (await import("./tiny")).tiny.react);
vi.mock("react/jsx-runtime", async () => (await import("./tiny")).tiny.jsxRuntime);
vi.mock("react/jsx-dev-runtime", async () => (await import("./tiny")).tiny.jsxRuntime);

const root = mkdtempSync(join(tmpdir(), "m3e-table-web-"));
afterAll(() => {
  if (!process.env.TABLE_KEEP) rmSync(root, { recursive: true, force: true });
});
let made = 0;

type App = {
  screen: string;
  /** the last screen move (src/runtime.tsx `Move`) */
  move?: { backwards: boolean; motion?: { kind: string } };
  overlay?: { screen: string; params?: Record<string, unknown> } | null;
  params?: Record<string, unknown>;
  vars: Record<string, string | number | boolean>;
  snack: { message: string } | null;
  /** the instances spawned on events, and the clock they live on (src/runtime.tsx) */
  spawns?: Spawns;
  spawnClock?: () => number;
};
type RuntimeModule = { AppProvider: (p: { children?: unknown }) => unknown; useApp: () => App; ScreenContext?: { Provider: unknown }; Pressable?: unknown };

/** the client of the API (packages/api) as the printed code calls it: each operation by its name, over the runtime's
 *  transport (the session's tokens on it), throwing what the client throws for an answer outside 2XX */
function clientOf(doc: Doc, runtime: () => Runtime) {
  const ops = apiModelOf("Consistency", contractOf(doc, "Consistency")).operations;
  return Object.fromEntries(
    ops.map((op) => [
      op.name,
      async (input?: { query?: Record<string, unknown>; body?: unknown }) => {
        const e = doc.api?.endpoints?.find((x) => x.operationId === op.operationId);
        const res = await runtime().transport.request({ operationId: op.operationId, method: (e?.method ?? "post").toUpperCase() as "POST", path: e?.path ?? "/", ...(input?.query ? { query: input.query as Record<string, string> } : {}), ...(input?.body !== undefined ? { body: input.body } : {}) });
        if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(`${op.operationId} failed with status ${res.status}`), { status: res.status, body: res.body, operationId: op.operationId });
        return res.body;
      },
    ]),
  );
}

/** a row's app, printed and written out: its runtime, its screens (with their data files), the client */
async function printed(doc: Doc, product: boolean, runtime: () => Runtime) {
  const dir = join(root, `app${++made}`);
  rmSync(dir, { recursive: true, force: true });
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  /* the product prints every screen against its runtime, a design with no API too */
  const binds = product ? { runtime: "@/lib/app", api: doc.api ?? {}, operations: apiModelOf("Consistency", contractOf(doc, "Consistency")).operations } : undefined;
  const out = buildScreens(doc, {}, { live: true, ...(binds ? { binds } : {}) });
  /* the widgets' host contract is parts/widgets/host.ts, which an export copies to src/components/widgets */
  writeFileSync(join(dir, "runtime.tsx"), runtimeSource(out.runtime, readFileSync(fileURLToPath(new URL(`../../../${RUNTIME_TEMPLATE}`, import.meta.url)), "utf8")).replace('"@/components/widgets/host"', JSON.stringify(fileURLToPath(new URL("../../../parts/widgets/host.ts", import.meta.url)))));
  (globalThis as { __tableApi?: unknown }).__tableApi = clientOf(doc, runtime);
  writeFileSync(join(dir, "api.ts"), "export const api = (globalThis as { __tableApi?: never }).__tableApi as never\n");
  const at = (source: string) => (source === "@/runtime" ? "./runtime" : source === "@/api" ? "./api" : source);
  for (const s of out.screens) {
    const lines: string[] = [];
    for (const [source, names] of s.imports) {
      const values = [...names].filter((n) => !n.startsWith("type "));
      if (!values.length) continue;
      /* the design system's components (and the web app's platform pieces) are names: what they draw is not under test */
      if (source.startsWith("@/components/") || source === "@/platform" || source === "@/DataScroll") lines.push(...values.map((n) => `const ${n} = ${/^[A-Z]/.test(n) ? JSON.stringify(n) : "(..._: unknown[]) => undefined"}`));
      else lines.push(`import { ${values.join(", ")} } from ${JSON.stringify(at(source))}`);
    }
    writeFileSync(join(dir, `${s.component}.tsx`), `${lines.join("\n")}\n\n${s.source}\n`);
    if (s.data) writeFileSync(join(dir, `${s.component}.data.ts`), s.data.replaceAll('"@/api"', '"./api"'));
  }
  const rt = (await import(/* @vite-ignore */ join(dir, "runtime.tsx"))) as RuntimeModule;
  const screens: Record<string, () => unknown> = {};
  for (const s of out.screens) screens[s.key] = ((await import(/* @vite-ignore */ join(dir, `${s.component}.tsx`))) as Record<string, () => unknown>)[s.component];
  return { rt, screens, spec: out.runtime };
}

const isElement = (v: unknown): v is Element => !!v && typeof v === "object" && "props" in v && "type" in v;
const nameOf = (t: unknown) => (typeof t === "string" ? t : typeof t === "function" ? t.name : "");

/** the words of a drawn tree: what a closed overlay holds (a menu's content) is not on show */
function wordsIn(node: unknown, out: string[] = [], closed = false): string[] {
  if (Array.isArray(node)) for (const x of node) wordsIn(x, out, closed);
  else if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (isElement(node)) {
    if (closed && nameOf(node.type).endsWith("Content")) return out;
    /* a template's pool waits hidden for its instances, which are read off the app (`spawnedWords`) */
    if (nameOf(node.type) === "SpawnPool") return out;
    wordsIn(node.props.children, out, node.props.open === false);
  }
  return out;
}

/** The handler a tap on these words reaches: the nearest element around them that takes a press; a no-op where none
 *  does (the printer left the tap out). Null when the words are not on show. */
function handlerOf(node: unknown, words: string, around: Element[] = [], props = ["onClick", "onPress"], slot: string | null = null): (() => void) | null {
  if (Array.isArray(node)) {
    for (const x of node) {
      const h = handlerOf(x, words, around, props, slot);
      if (h) return h;
    }
    return null;
  }
  if (typeof node === "string" && node === words) {
    for (const e of [...around].reverse()) {
      const h = props.map((k) => e.props[k]).find((f) => typeof f === "function") as ((ev: unknown) => void) | undefined;
      /* a press on a place of the part is one on the element that carries its mark (`data-tap`) */
      const target = { closest: (selector: string) => (slot !== null && selector === "[data-tap]" ? { getAttribute: () => slot } : null) };
      if (typeof h === "function") return () => h({ preventDefault() {}, stopPropagation() {}, nativeEvent: {}, target });
    }
    return () => {};
  }
  return isElement(node) ? handlerOf(node.props.children, words, [...around, node], props, slot) : null;
}

function inputOf(node: unknown, words: string): Element | null {
  /* a required field's label carries a star after its words (parts/fieldState.ts `requiredMark`) */
  const said = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? wordsIn(v).join("").replace(/\s*\*$/, "") : undefined);
  for (const e of tiny.elements(node)) if ((said(e.props.label) === words || e.props.placeholder === words) && typeof e.props.onChange === "function") return e;
  return null;
}

async function webOf(doc: Doc, backend: Backend, product: boolean): Promise<Driver> {
  const base: Transport = {
    request: async (r) => {
      const a = await backend.receive(r.operationId ?? "", givenOf(r.query, r.body));
      return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
    },
    /* the back end's realtime channels and its clock */
    connect: (address, onMessage) => backend.connect(address, onMessage),
    now: () => backend.now(),
  };
  // eslint-disable-next-line no-new-func -- the printer's own auth configuration, read as the app reads it
  const auth = (doc.api ? new Function(`return ${authSource(doc.api)}`)() : undefined) as AuthConfig | undefined;
  /* the product's registry of capabilities (the prototype's in place of its mocks): each invoke reaches the row's back
     end, as an adapter would the platform */
  const capabilities: CapabilityHost = {
    invoke: async (name, args) => {
      const a = await backend.invoke(name, args);
      return a.ok ? { ok: true, result: a.result } : { ok: false, error: { type: a.type as FailureKind, capability: name } };
    },
  };
  const runtime = createRuntime({ transport: base, ...(auth ? { auth } : {}), lang: "en", capabilities });
  const { rt, screens, spec } = await printed(doc, product, () => runtime);
  let app: App | undefined;
  let tree: unknown;
  /* the app as src/App.tsx mounts it: the screen on show, and an overlay over it, each in its page's context */
  function Mount() {
    app = rt.useApp();
    const page = (key: string, params: Record<string, unknown> | undefined, covered: boolean) => {
      const Screen = screens[key];
      const el = tiny.react.createElement(Screen as never, { key });
      return rt.ScreenContext ? tiny.react.createElement(rt.ScreenContext.Provider, { value: { screen: key, active: !covered, ...(params ? { params } : {}) }, key }, el) : el;
    };
    return [page(app.screen, app.params, !!app.overlay), ...(app.overlay ? [page(app.overlay.screen, app.overlay.params, false)] : [])];
  }
  /* the runtime's Pressable is drawn too: what starts as the pointer comes over a part, or some time after its screen */
  const own = new Set<unknown>([Mount, rt.AppProvider, RuntimeProvider, rt.Pressable, ...Object.values(screens)]);
  /* A world view's stand-in (parts/widgets/World.tsx) draws its name and lists what it hears on the channel the printed
     code hands it: each channel is listened to from when it is first drawn, as the stand-in does. */
  const heard = new Map<WorldChannel, string[]>();
  const draw = () => {
    tree = tiny.render(tiny.react.createElement(RuntimeProvider as never, { runtime }, tiny.react.createElement(rt.AppProvider as never, (product ? {} : { capabilities }) as never, tiny.react.createElement(Mount, null))), (t) => own.has(t));
    for (const e of tiny.elements(tree)) {
      const c = e.props.channel as WorldChannel | undefined;
      if (!c || typeof c.listen !== "function" || heard.has(c)) continue;
      heard.set(c, []);
      c.listen((action, value) => heard.set(c, inputLog(heard.get(c) ?? [], action, value)));
    }
  };
  /** what the world views drawn on a page show: their names, and what each heard */
  const worldWords = (page: unknown): string[] =>
    tiny.elements(page).flatMap((e) => {
      const c = e.props.channel as WorldChannel | undefined;
      return c && heard.has(c) && e.type === "WorldView" ? [String(e.props.label ?? ""), ...(heard.get(c) ?? [])] : [];
    });
  /** what each template's pool on a page shows: its words as each instance alive now fills them */
  const spawnedWords = (page: unknown): string[] =>
    tiny.elements(page).flatMap((e) => {
      if (nameOf(e.type) !== "SpawnPool" || !app?.spawns || !app.spawnClock) return [];
      const marked = wordsIn(e.props.children);
      return app.spawns.live(String(e.props.of), app.spawnClock()).flatMap((s) => marked.map((w) => fillSpawnWords(w, s)));
    });
  /** the pages drawn: the screen on show, then any overlay */
  const pages = (): unknown[] => {
    const all = tiny.elements(tree).filter((e) => e.type === rt.ScreenContext?.Provider);
    return all.length ? all : [tree];
  };
  const top = () => pages()[pages().length - 1];
  draw();
  /* the design's variables come first, in its order; an input's own state comes after them */
  const varIds = new Map((doc.vars ?? []).map((v, i) => [spec.vars[i].key, v.id]));
  return {
    tap: (words) => {
      const h = handlerOf(top(), words);
      if (!h) throw new Error(`no words "${words}" on show`);
      h();
      draw();
    },
    hover: (words) => {
      const h = handlerOf(top(), words, [], ["onPointerEnter"]);
      if (!h) throw new Error(`no words "${words}" on show`);
      h();
      draw();
    },
    tapSlot: (words, slot) => {
      const h = handlerOf(top(), words, [], ["onClick", "onPress"], slot);
      if (!h) throw new Error(`no words "${words}" on show`);
      h();
      draw();
    },
    /* a widget sends its events through its host's onEvent (parts/widgets/host.ts): the part is the one showing the words */
    emit: (words, event, payload) => {
      const part = tiny.elements(top()).find((e) => typeof e.props.onEvent === "function" && Object.values(e.props).includes(words));
      if (!part) throw new Error(`no part that sends events with the words "${words}"`);
      (part.props.onEvent as (name: string, payload?: unknown) => void)(event, payload);
      draw();
    },
    type: (words, value) => {
      const input = inputOf(top(), words);
      if (!input) throw new Error(`no input with the words "${words}"`);
      (input.props.onChange as (e: unknown) => void)({ target: { value }, currentTarget: { value } });
      draw();
    },
    restart: () => {
      runtime.restart();
      draw();
    },
    /* the web app keeps no history of the browser's: its own back (src/runtime.tsx), which no tap asked for */
    platformBack: () => {
      (app as unknown as { back: () => void }).back();
      draw();
    },
    settle: async () => {
      for (let i = 0; i < 6; i++) {
        await turns(2);
        draw();
      }
    },
    observe: (): Observed => {
      const words = pages().flatMap((p) => [...wordsIn(p), ...worldWords(p), ...spawnedWords(p)]);
      const vars = Object.fromEntries(Object.entries(app?.vars ?? {}).map(([k, v]) => [varIds.get(k) ?? k, v]));
      const screen = doc.frames[spec.screens.indexOf(app?.screen ?? "")]?.id ?? "";
      const move = app?.move ? { back: app.move.backwards, motion: app.move.motion?.kind ?? "none" } : undefined;
      return { vars, words, toast: app?.snack?.message ?? null, screen, calls: backend.calls, ...(move ? { move } : {}) };
    },
  };
}

for (const [host, product] of [["webPrototype", false], ["webProduct", true]] as [HostName, boolean][])
  describe(`the consistency table on the ${product ? "product's" : "prototype's"} web export`, () => {
    beforeEach(() => {
      tiny.reset();
      const listen = () => {};
      vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900, addEventListener: listen, removeEventListener: listen, setTimeout, clearTimeout, setInterval, clearInterval, open: () => null, location: { search: "" }, matchMedia: () => ({ matches: false }) });
      vi.stubGlobal("document", { activeElement: null, querySelector: () => null, documentElement: { lang: "en" } });
    });
    afterEach(() => {
      tiny.reset();
      vi.unstubAllGlobals();
    });

    it.each(ROWS.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
      const { doc } = designDoc(row.design);
      const { problems, seen } = await drive(row, (backend) => webOf(doc, backend, product));
      if (process.env.TABLE_DEBUG) process.stdout.write(`${host} ${row.id}: ${JSON.stringify(problems)} ${JSON.stringify({ ...seen, words: seen.words.slice(0, 12) })}\n`);
      const v = verdict(row, host, problems);
      expect(v.ok ? "" : v.why).toBe("");
    });
  });
