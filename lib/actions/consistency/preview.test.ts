import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES, type Doc, type Item } from "../../tokens";
import type { Transport } from "../../api/transport";
import type { CapabilityHost, FailureKind } from "../../capabilities/types";
import type { PreviewState } from "../../interact";
import { drive, givenOf, tableWorld, turns, verdict, type Backend, type Driver } from "./check";
import type { FrameLoop } from "../../app/frame";
import { designDoc } from "./design";
import { wordsOf } from "./reference";
import { ROWS } from "./rows";
import { tiny } from "./tiny";
import type { Element } from "./tinyReact";
import type { ScreenMove } from "../../screenMotion";
import type { Observed } from "./types";
import { inputLog, type Worlds } from "../../world/channel";

/* The table on the editor's preview: the real `Preview` component (components/Preview.tsx) and everything a tap goes
 * through there (its `fire`, the interpreter on its host, its calls through the bindings engine, its forms, its
 * navigation), run headless on a small stand-in for React (tinyReact.ts). A tap is the screen's own `onAction` with the part as the screen drew it,
 * typing its `onField`; what is on show is read off the screens it renders. */

vi.mock("react", async () => (await import("./tiny")).tiny.react);
vi.mock("react/jsx-runtime", async () => (await import("./tiny")).tiny.jsxRuntime);
vi.mock("react/jsx-dev-runtime", async () => (await import("./tiny")).tiny.jsxRuntime);
vi.mock("motion/react", () => {
  const value = (v: unknown) => ({ get: () => v, set: () => {}, on: () => () => {} });
  return { AnimatePresence: "presence", motion: { div: "div", button: "button" }, useReducedMotion: () => false, useIsPresent: () => true, useMotionValue: value, useTransform: () => value(0), animate: () => ({ stop: () => {} }) };
});
vi.mock("@/lib/i18n", async () => ({ ...(await import("../../i18n")), useLang: () => "en" }));
vi.mock("@/components/Icon", () => ({ Icon: "icon" }));
vi.mock("@/components/PartView", () => ({ PartView: "part-view" }));
vi.mock("@/components/DeviceBars", () => ({ DeviceBars: "device-bars" }));

const { Preview } = await import("../../../components/Preview");
const { PreviewStore } = await import("../../../components/preview/store");

/** the preview's interaction state: what its store holds now */
const stateOf = (): PreviewState | undefined => (tiny.states().find((v) => v instanceof PreviewStore) as InstanceType<typeof PreviewStore> | undefined)?.get();

/** what the stand-in draws: the preview, and its screens (what a screen starts on its own, a delay, is theirs) */
const drawn = (t: unknown) => t === Preview || (typeof t === "function" && t.name === "Screen");

function previewOf(doc: Doc, backend: Backend): Driver {
  const transportOf = (): Transport => ({
    request: async (r) => {
      const a = await backend.receive(r.operationId ?? "", givenOf(r.query, r.body));
      return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
    },
    /* the back end's realtime channels and its clock */
    connect: (address, onMessage) => backend.connect(address, onMessage),
    now: () => backend.now(),
  });
  /* the platform's adapters: each invoke goes to the row's back end */
  const capabilitiesOf = (): CapabilityHost => ({
    invoke: async (name, args) => {
      const a = await backend.invoke(name, args);
      return a.ok ? { ok: true, result: a.result } : { ok: false, error: { type: a.type as FailureKind, capability: name } };
    },
  });
  let transport = transportOf();
  let capabilities = capabilitiesOf();
  let tree: unknown;
  const draw = () => {
    tree = tiny.render(tiny.react.createElement(Preview, { doc, widths: {}, palette: PALETTES[0], startId: doc.frames[0].id, onClose: () => {}, transport, capabilities }), drawn);
  };
  /** the screens drawn: the one on show, and the overlay over it (drawn after it); no swipe is under way here */
  const screens = (): Element[] => tiny.elements(tree).filter((e) => typeof e.type === "function" && "frame" in e.props && "onAction" in e.props);
  const partsOf = (s: Element): Item[] => ((s.props.groups as { items: Item[] }[]) ?? []).flatMap((g) => g.items);
  /** the part with these words on the topmost screen drawn, with its screen */
  const find = (words: string): { screen: Element; it: Item } => {
    for (const screen of [...screens()].reverse()) {
      const it = partsOf(screen).find((x) => wordsOf(x) === words);
      if (it) return { screen, it };
    }
    throw new Error(`no part with the words "${words}" on show`);
  };
  /** the part as its screen drew it, with what it does when used that way (`onHover`, `onSlot`, `onEvent`) */
  const drawnPart = (words: string, handler: string): Element | undefined => {
    const { it } = find(words);
    return tiny.elements(tree).find((e) => (e.props.item as Item | undefined)?.id === it.id && handler in e.props);
  };
  draw();
  /* what each world view's stand-in lists: it listens on the channel the preview gives it (parts/widgets/World.tsx) */
  const heard: Record<string, string[]> = {};
  const worlds = tiny.elements(tree).find((e) => { const v = e.props.value as Partial<Worlds> | undefined; return !!v && typeof v.channel === "function" && typeof v.send === "function"; })?.props.value as Worlds | undefined;
  for (const it of doc.groups.flatMap((g) => g.items)) if (it.component === "world-view") worlds?.channel(it.id).listen((action, value) => (heard[it.id] = inputLog(heard[it.id] ?? [], action, value)));
  /* the preview's frame loop (components/preview/frames.ts), which its screens hand their props bound per frame */
  const frames = (): FrameLoop | undefined => tiny.elements(tree).find((e) => { const v = e.props.value as Partial<FrameLoop> | undefined; return !!v && typeof v.tick === "function" && typeof v.listen === "function"; })?.props.value as FrameLoop | undefined;
  let letGo: (() => void) | undefined;
  return {
    tap: (words) => {
      const { screen, it } = find(words);
      if (!it.action) return;
      (screen.props.onAction as (a: unknown, it: Item) => void)(it.action, it);
      draw();
    },
    hover: (words) => {
      (drawnPart(words, "onHover")?.props.onHover as (() => void) | undefined)?.();
      draw();
    },
    tapSlot: (words, slot) => {
      (drawnPart(words, "onSlot")?.props.onSlot as ((slot: string) => void) | undefined)?.(slot);
      draw();
    },
    emit: (words, name, payload) => {
      (drawnPart(words, "onEvent")?.props.onEvent as ((name: string, payload?: Record<string, unknown>) => void) | undefined)?.(name, payload);
      draw();
    },
    type: (words, value) => {
      const { screen, it } = find(words);
      (screen.props.onField as (it: Item, v: string) => void)(it, value);
      draw();
    },
    restart: () => {
      /* another transport is another session of the back end: the preview's bindings start over with it */
      transport = transportOf();
      capabilities = capabilitiesOf();
      draw();
    },
    /* the back of the preview's own controls (its bar, Escape), which no tap asks for */
    platformBack: () => {
      const controls = tiny.elements(tree).find((e) => typeof e.props.onBack === "function" && "canGoBack" in e.props);
      if (!controls) throw new Error("the preview's controls are not drawn");
      (controls.props.onBack as () => void)();
      draw();
    },
    /* the world an engine connects to a view's channel, and the frame the browser would run next */
    world: (w) => {
      letGo?.();
      letGo = worlds?.channel("table-world").attach?.(tableWorld(w));
      frames()?.tick();
      draw();
    },
    settle: async () => {
      for (let i = 0; i < 6; i++) {
        await turns(2);
        draw();
      }
    },
    observe: (): Observed => {
      const state = stateOf();
      const shown = screens();
      const words: string[] = [];
      for (const s of shown) {
        const opened = (s.props.opened as Record<string, boolean>) ?? {};
        for (const it of partsOf(s)) {
          words.push(wordsOf(it));
          if (it.component === "dropdown-menu" && opened[it.id]) for (const row of (it.props?.items as { label?: string }[] | undefined) ?? []) words.push(row.label ?? "");
          words.push(...(heard[it.id] ?? []));
        }
      }
      /* what the last frame wrote into the parts bound per frame */
      words.push(...(frames()?.words() ?? []));
      /* the move the screen on show plays: what the preview hands the motion of its screens (`custom`) */
      const played = tiny.elements(tree).find((e) => { const c = e.props.custom as ScreenMove | undefined; return !!c && typeof c === "object" && "backwards" in c; })?.props.custom as ScreenMove | undefined;
      const move = played ? { back: played.backwards, motion: played.motion?.kind ?? "none" } : undefined;
      return { vars: state?.vars ?? {}, words, toast: state?.snack?.message ?? null, screen: (shown[0]?.props.frame as { id: string } | undefined)?.id ?? "", calls: backend.calls, ...(move ? { move } : {}) };
    },
  };
}

describe("the consistency table on the preview", () => {
  beforeEach(() => {
    tiny.reset();
    const listen = () => {};
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900, addEventListener: listen, removeEventListener: listen, setTimeout, clearTimeout, setInterval, clearInterval, open: () => null, matchMedia: () => ({ matches: false, addEventListener: listen, removeEventListener: listen }) });
    vi.stubGlobal("document", { activeElement: null, querySelector: () => null, documentElement: { lang: "en" } });
  });
  afterEach(() => {
    tiny.reset();
    vi.unstubAllGlobals();
  });

  it.each(ROWS.map((r) => [r.id, r] as const))("%s", async (_id, row) => {
    const { doc } = designDoc(row.design);
    const { problems, seen } = await drive(row, (backend) => previewOf(doc, backend));
    if (process.env.TABLE_DEBUG) process.stdout.write(`${row.id}: ${JSON.stringify(problems)} ${JSON.stringify({ ...seen, words: seen.words.slice(0, 12) })}\n`);
    const v = verdict(row, "preview", problems);
    expect(v.ok ? "" : v.why).toBe("");
  });
});
