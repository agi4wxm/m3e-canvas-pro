/* The editor's preview: the document played as an app, in a device on the stage, with the preview's own controls
 * beside it. What a tap does is never decided here: every interaction (a tap, a hover, a delay, a part's event, a place
 * of a part) runs through the interpreter (lib/actions `run`, docs/交互规则.md) on the preview's host
 * (components/preview/host.ts), the same rules every exported app runs on. The pieces:
 *
 *   preview/store.ts     the interaction state, outside React: variables, shown and hidden parts, typed fields, the snackbar
 *   preview/host.ts      the interpreter's host: how the preview keeps and shows what the rules ask for
 *   preview/Screen.tsx   one screen and its parts; preview/LivePart.tsx one working part
 *   preview/swipe.ts     the screens' swipes; preview/Controls.tsx the bar beside the device
 *
 * What stays the preview's own is navigation (the stack of screens, an overlay over them, the slides between them),
 * the prototype's demos, the mock library's answers, scenarios and request log, and the look of all of it. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import {
  BEZEL,
  PHONE_H,
  PHONE_R,
  PHONE_W,
  darkVarOf,
  fontFamilyOf,
  frameRadius,
  frameSizeOf,
  groupsInFrame,
  linkUrlOf,
  normalizeTheme,
  paletteOf,
  sizeOf,
  type Action,
  type Doc,
  type Frame,
  type FramePreset,
  type Group as DocGroup,
  type Item,
  type Motion,
  type Palette,
} from "@/lib/tokens";
import { chooseBranch, run, type BackOptions, type GoOptions } from "@/lib/actions";
import { createRuntime } from "@/lib/app/runtime";
import { partBySlug } from "@/parts/registry";
import { PartThemeContext, usePartTheme } from "@/parts/theme";
import { roleOf } from "@/parts/role";
import { screenBackground } from "@/lib/styles";
import { useLang } from "@/lib/i18n";
import { applyEffects, closeOpened, liveGroups, screenVars, writeField, type FieldValue } from "@/lib/interact";
import type { Transport, TransportFile } from "@/lib/api/transport";
import { DesignRuntime, liveAuth, steadyTransport, type ScreenAt } from "@/lib/bindings/design";
import { setDomainClock } from "@/parts/widgets/host";
import { boundScreen, type BoundScreen } from "@/lib/bindings/view";
import { fallbackTransport, signedInAtStart } from "@/lib/bindings/transport";
import { MockLogPanel, PreviewMocksContext, usePreviewMocks } from "./MockPreview";
import { createMockCapabilities } from "@/lib/capabilities/mock";
import type { CapabilityHost } from "@/lib/capabilities/types";
import { variantFor } from "@/lib/variants";
import { flowStarts } from "@/lib/prototype";
import { DEFAULT_MOTION, EASE, SLIDE_S as SLIDE_MS, TRANSITION_MOTIONS, screenPoses, type ScreenMove } from "@/lib/screenMotion";
import { composing, goesBack } from "./previewKeys";
import { PreviewControls } from "./preview/Controls";
import { createPreviewHost, tapOf, type TapExtra } from "./preview/host";
import { Screen } from "./preview/Screen";
import { PreviewStore, usePreviewState } from "./preview/store";
import { useSwipe, type Peek } from "./preview/swipe";
import { PreviewMockWorld, PreviewWorlds } from "./preview/worlds";
import { createWorlds } from "@/lib/world/channel";

/** room reserved for the wide preview controls: panel, right margin and breathing space */
const WIDE_CONTROL_SPACE = 220;
/** the strip the controls take along the bottom of a phone */
const PHONE_BAR_H = 56;

/** how the current screen was reached, so "back" can play it in reverse, and what it was opened with */
type Entry = { id: string; m: Motion; params?: Record<string, unknown> };

/** the moves the preview makes on its own: a fade between screens of different sizes (and to sign in, to a screen picked
 *  by hand), none at all where a swipe has already moved the screen */
const FADE = TRANSITION_MOTIONS.fade;
const INSTANT = TRANSITION_MOTIONS.none;

/** the screen a tap lands on: the one on show or the overlay laid over it, and what it was opened with */
type TapScreen = { frame: Frame; params?: Record<string, unknown> };

/** where the app goes once signed in: back to where a refusal or a sign-out left it, or on to the screen that needed it */
type Return = { back: true } | { entry: Entry };

/* Each change of screen plays the poses an exported app plays too (lib/screenMotion.ts): the action's motion (the default
 * slide where it gives none), backwards for going back. */
const screenVariants: Variants = {
  initial: (c: ScreenMove) => screenPoses(c).initial,
  animate: (c: ScreenMove) => screenPoses(c).animate,
  exit: (c: ScreenMove) => screenPoses(c).exit,
};

/** how long a snackbar stands, M3's short duration */
const SNACK_MS = 4000;

/** the parts inside it are drawn in the mode the preview's own switch is on */
function PreviewTheme({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  const theme = usePartTheme();
  return <PartThemeContext.Provider value={theme.dark === dark ? theme : { ...theme, dark }}>{children}</PartThemeContext.Provider>;
}

export function Preview({
  doc,
  widths,
  palette,
  startId,
  onClose,
  transport,
  capabilities,
}: {
  doc: Doc;
  widths: Record<string, number>;
  palette: Palette;
  startId: string | null;
  onClose: () => void;
  /** what the preview's calls to the API go through (the mock library); a stand-in when none is given */
  transport?: Transport;
  /** what the preview's invokes of platform capabilities go through (the mock library's); the catalog's examples when
   *  none is given */
  capabilities?: CapabilityHost;
}) {
  const lang = useLang();
  const frames = doc.frames;
  /* the API answered by the mock library for this preview session (components/MockPreview.tsx) */
  const mocks = usePreviewMocks(doc);
  const [logOpen, setLogOpen] = useState(false);

  /* ---------- where the visitor is: a stack of screens, and an overlay over the top one ---------- */
  /* with no screen chosen, the preview starts where the first flow does */
  const [stack, setStackNow] = useState<Entry[]>(() => [{ id: startId ?? flowStarts(frames)[0]?.id ?? frames[0]?.id ?? "", m: INSTANT }]);
  /** a screen laid over the one on show by an interaction, and how it came in */
  const [overlay, setOverlayNow] = useState<Entry | null>(null);
  /* What a tap's steps read of where the visitor is: written as each move is made, ahead of React drawing it, so a
     step after a move (an answer, a guard) knows where the visitor now is. */
  const stackRef = useRef(stack);
  const overlayRef = useRef(overlay);
  /* How many times the visitor has gone somewhere: a screen opened, gone back from, laid over or closed, picked, swiped
     to. An answer to a tap made before the last move still runs its effects, but goes nowhere (lib/actions). */
  const moves = useRef(0);
  const setStack = useCallback((next: Entry[] | ((cur: Entry[]) => Entry[])) => {
    const value = typeof next === "function" ? next(stackRef.current) : next;
    stackRef.current = value;
    moves.current++;
    setStackNow(value);
  }, []);
  const setOverlay = useCallback((next: Entry | null) => {
    if (next !== null || overlayRef.current !== null) moves.current++;
    overlayRef.current = next;
    setOverlayNow(next);
  }, []);
  const [anim, setAnim] = useState<ScreenMove>({ motion: INSTANT, backwards: false });
  const theme = normalizeTheme(doc.theme);
  const spring = theme.motion === "expressive";
  const [scale, setScale] = useState(1);
  const [values, setValues] = useState<Record<string, number>>({});

  /* ---------- the interaction state: the prototype's, started over each time the preview opens ---------- */
  const [store] = useState(() => PreviewStore.start(doc, theme.dark));
  const state = usePreviewState(store);
  /* the width the visitor switched to; until then each screen shows at its own size */
  const [device, setDevice] = useState<FramePreset | null>(null);
  /** the sibling of a screen at the width chosen: navigation keeps naming the screen it was written for */
  const shownId = useCallback((id: string) => (device ? (variantFor(frames, id, device)?.id ?? id) : id), [device, frames]);
  /* a look at the other mode, for this preview only; a variable that drives the dark mode is that mode, so a tap that
     sets it switches the theme, and so does the bar's own button */
  const [ownDark, setOwnDark] = useState(theme.dark);
  const darkVar = darkVarOf(doc.vars);
  const dark = darkVar ? !!state.vars[darkVar.id] : ownDark;
  const toggleDark = () => (darkVar ? store.update((s) => ({ ...s, vars: { ...s.vars, [darkVar.id]: !s.vars[darkVar.id] } })) : setOwnDark((d) => !d));
  const p = dark === theme.dark ? palette : paletteOf(doc.paletteKey, doc.customPalette, { ...theme, dark });

  const top = stack[stack.length - 1];
  const current = frames.find((f) => f.id === (top ? shownId(top.id) : undefined)) ?? frames[0];

  /* ---------- the data, the calls, the forms, the session: the runtime every exported app runs on (lib/app) ---------- */
  /* What the calls go through: a page's own back end (a test's fake, an embedding app's), the transport the preview is
     handed, else the mock library's in the scenario the bar has chosen. A document with endpoints waits for the mocks
     to load rather than show answers they would take back; one without has nothing to call but the stand-in. */
  const pageTransport = typeof window !== "undefined" ? window.m3ePreviewTransport : undefined;
  const api = doc.api;
  const standIn = useMemo(() => fallbackTransport({ api }), [api]);
  const hasApi = !!api?.endpoints?.length || !!api?.channels?.length;
  const answering: Transport | null = pageTransport ?? transport ?? (hasApi ? mocks?.transport : undefined) ?? (api?.endpoints?.length ? null : standIn);
  const transportRef = useRef<Transport | null>(answering);
  transportRef.current = answering;
  /* The capabilities: what the preview is handed, else the mocks' (in the scenario on show), else the catalog's examples.
     Another one is another session: what the one before answers late lands nowhere. */
  const mockCapabilities = doc.mocks;
  const ownCapabilities = doc.capabilities;
  const standInCapabilities = useMemo(() => createMockCapabilities({ ...mockCapabilities, locale: mockCapabilities?.locale ?? lang }, ownCapabilities, { scenario: mockCapabilities?.scenario }), [mockCapabilities, ownCapabilities, lang]);
  const capabilityHost: CapabilityHost = capabilities ?? mocks?.capabilities ?? standInCapabilities;
  const docRef = useRef(doc);
  docRef.current = doc;
  /* The runtime every exported app runs on (lib/app), the preview's one data engine: its data sources, forms, session
     and calls, read from the document by lib/bindings/design.ts; it also says when the preview has started over (an answer
     to a session gone lands nowhere), keeps where a sign-in goes back to, and invokes the capabilities. */
  const [runtime] = useState(() => createRuntime({ transport: steadyTransport(() => transportRef.current), auth: liveAuth(() => docRef.current.api), lang, capabilities: capabilityHost }));
  runtime.setLang(lang);
  const [data] = useState(
    () =>
      new DesignRuntime(runtime, () => docRef.current, {
        /* the transports of the preview cannot say how an upload goes: a stand-in steps it toward the end */
        tick: (fn) => {
          const t = window.setInterval(fn, 120);
          return () => window.clearInterval(t);
        },
      }),
  );
  /* what the screens read of it changed: they are drawn again */
  const dataVersion = useSyncExternalStore(data.subscribe, data.version, data.version);
  const unauthorized = useRef<() => void>(() => {});
  useEffect(() => runtime.whenUnauthorized(() => unauthorized.current()), [runtime]);
  const files = useRef<Record<string, TransportFile[]>>({});
  /** each screen as its bindings had it when last drawn: what a tap reads */
  const boundRef = useRef<Record<string, BoundScreen>>({});
  const varNames = useMemo(() => (doc.vars ?? []).map((v) => ({ id: v.id, name: v.name })), [doc.vars]);
  /** where a screen's data is read now: its params, the variables as it shows them */
  const atNow = (f: Frame, params?: Record<string, unknown>): ScreenAt => ({ frame: f, params, vars: screenVars(store.get(), doc, f, dark).vars, varNames });

  /* ---------- navigation ---------- */
  /* a slide between a phone and a desktop screen would drag one shape through the
   * other; screens of different sizes cross-fade while the shell changes size */
  const sameSize = useCallback(
    (fromId: string, toId: string) => {
      const a = frames.find((f) => f.id === shownId(fromId));
      const b = frames.find((f) => f.id === shownId(toId));
      if (!a || !b) return true;
      const sa = frameSizeOf(a);
      const sb = frameSizeOf(b);
      return sa.w === sb.w && sa.h === sb.h;
    },
    [frames, shownId],
  );
  /** the screen a step lands on now: the overlay, else the top of the stack */
  const onShow = (): Frame | undefined => {
    const id = overlayRef.current?.id ?? stackRef.current[stackRef.current.length - 1]?.id;
    return id ? frames.find((f) => f.id === shownId(id)) : undefined;
  };
  const loginFrame = frames.find((f) => f.auth === "login");
  /** to the sign-in screen, and back to where the visitor was once signed in */
  const toSignIn = () => {
    if (!loginFrame) return;
    runtime.rememberReturn({ back: true } satisfies Return);
    setOverlay(null);
    setAnim({ motion: FADE, backwards: false, spring });
    setStack((cur) => [...cur, { id: loginFrame.id, m: FADE }]);
  };
  /* a 401 ends the session and sends the app to the sign-in screen, which goes back to where it was once signed in */
  unauthorized.current = () => {
    const s = stackRef.current;
    if (!loginFrame || s[s.length - 1]?.id === loginFrame.id) return;
    toSignIn();
  };

  /** a swipe under way (its peek), which going back waits for */
  const peeking = useRef<{ current: unknown }>({ current: null });
  const back = useCallback((o?: BackOptions) => {
    /* an overlay is what going back closes first */
    if (overlayRef.current) {
      setOverlay(null);
      return;
    }
    const s = stackRef.current;
    if (s.length < 2 || peeking.current.current) return;
    const from = s[s.length - 1];
    const to = s[s.length - 2];
    const same = sameSize(from.id, to.id);
    /* a back action's own motion, played backwards, in place of the way the screen came in */
    const m = same ? (o?.motion ?? from.m) : FADE;
    setAnim({ motion: m, backwards: true, spring });
    setStack(s.slice(0, -1));
  }, [spring, sameSize, setStack, setOverlay]);

  /** opens a screen, as an interaction asks: one that needs a session, without one, has the sign-in screen first */
  const go = (to: string, o: GoOptions) => {
    const target = frames.find((f) => f.id === to);
    if (!target) return;
    if (target.auth === "required" && !data.signedIn && loginFrame && loginFrame.id !== target.id) {
      runtime.rememberReturn({ entry: { id: to, m: o.motion ?? DEFAULT_MOTION, ...(o.params ? { params: o.params } : {}) } } satisfies Return);
      setOverlay(null);
      setAnim({ motion: FADE, backwards: false, spring });
      setStack((cur) => [...cur, { id: loginFrame.id, m: FADE }]);
      return;
    }
    if (o.overlay) {
      setOverlay({ id: to, m: o.motion ?? DEFAULT_MOTION, ...(o.params ? { params: o.params } : {}) });
      return;
    }
    /* an overlay closes when its screen goes on to another */
    setOverlay(null);
    const s = stackRef.current;
    const same = sameSize(s[s.length - 1].id, to);
    const m = same ? (o.motion ?? DEFAULT_MOTION) : FADE;
    setAnim({ motion: m, backwards: false, spring });
    setStack((cur) => [...cur, { id: to, m, ...(o.params ? { params: o.params } : {}) }]);
  };

  /** once signed in: back to where a 401 or a sign-out left the app, or on to the screen that needed the session */
  const returnAfterSignIn = (): boolean => {
    const r = runtime.takeReturn<Return>();
    if (!r) return false;
    if ("back" in r) {
      back();
      return true;
    }
    setAnim({ motion: FADE, backwards: false, spring });
    setStack((cur) => [...cur.slice(0, -1), r.entry]);
    return true;
  };

  /* A screen that needs a session does not stay on show once the visitor signs out (docs/交互规则.md, “会话”): after
     the steps of the tap have gone where they go, a screen on show that still needs the session gives way to the
     sign-in screen, which brings the visitor back once signed in again. */
  const afterSignOut = () => {
    const f = onShow();
    if (!f || f.auth !== "required" || data.signedIn || !loginFrame || f.id === loginFrame.id) return;
    toSignIn();
  };

  /* ---------- the interpreter's host: made once, reading the preview as it is now ---------- */
  /** how many times the capabilities were handed over: an invoke out across it answers into nothing */
  const capabilitySession = useRef(0);
  const nav = useRef({ go, back, returnAfterSignIn, afterSignOut, onShow, dark });
  nav.current = { go, back, returnAfterSignIn, afterSignOut, onShow, dark };
  /* the world views' channels: the input actions go there, the views listen (docs/交互规则.md “输入动作”) */
  const [worlds] = useState(() => createWorlds());
  /* the mock world the bar has chosen, played on the mocks' clock (which the bar stops and speeds up) */
  const chosenScript = mocks?.worldScript ?? null;
  const mocksNow = mocks?.clock.now;
  const mockWorld = useMemo(() => (chosenScript ? { script: chosenScript, ...(mocksNow ? { now: mocksNow } : {}) } : null), [chosenScript, mocksNow]);
  const [host] = useState(() =>
    createPreviewHost({
      worldInput: (part, action, value) => worlds.send(part, action, value),
      doc: () => docRef.current,
      store,
      dark: () => nav.current.dark,
      onShow: () => nav.current.onShow(),
      data,
      capabilitySession: () => capabilitySession.current,
      bound: (id) => boundRef.current[id],
      files: () => files.current,
      go: (to, o) => nav.current.go(to, o),
      back: (o) => nav.current.back(o),
      /* a link leaves the sketch: the page opens in a tab of its own, and the preview stays put */
      openLink: (url) => {
        const href = linkUrlOf({ url });
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      },
      /* a part to scroll to, on the screen on show */
      scrollTo: (part) => document.querySelector(`[data-preview-active] [data-part="${CSS.escape(part)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }),
      moves: () => moves.current,
      returnAfterSignIn: () => nav.current.returnAfterSignIn(),
      /* an effect has just said which tab is chosen: an earlier tap on the tabs no longer speaks for it */
      told: (part) => setValues((m) => (m[part] === -1 ? m : { ...m, [part]: -1 })),
      signedOut: () => queueMicrotask(() => nav.current.afterSignOut()),
    }),
  );

  /* ---------- starting over ---------- */
  /* Another transport, or another session of the mocks (a scenario chosen in the bar, the log's start over): the
     runtime (its data, forms and session) starts over with it, signed in as the mocks' session starts (`auth.signedIn`, true unless
     the scenario says not), and the screens on show load again just below. */
  const mockSession = mocks?.session ?? 0;
  const presumed = !!mocks && answering === mocks.transport && signedInAtStart(doc.mocks, mocks.scenario);
  const startedWith = useRef<{ t: Transport; session: number } | null>(null);
  useEffect(() => {
    if (!answering) return;
    /* the same again (React running effects twice in development) starts nothing over */
    const was = startedWith.current;
    if (was && was.t === answering && was.session === mockSession) return;
    startedWith.current = { t: answering, session: mockSession };
    runtime.restart(presumed);
    /* what the world views' inputs held belongs to the session before */
    worlds.clear();
    // the scenario `presumed` reads comes with a session of its own
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answering, mockSession, runtime]);
  /* Another capability host is another session of the capabilities: what one before it answers late lands nowhere
     (the host drops it), while the data and the session, the back end's, stay as they are. */
  const capabilitiesNow = useRef(capabilityHost);
  useEffect(() => {
    if (capabilitiesNow.current === capabilityHost) return;
    capabilitiesNow.current = capabilityHost;
    capabilitySession.current++;
    runtime.setCapabilities(capabilityHost);
  }, [capabilityHost, runtime]);

  /* ---------- loading what the screens on show read ---------- */
  /* a screen loads its data as it comes on show, and again when it is opened with other params */
  const topParams = top?.params;
  const paramsKey = JSON.stringify(topParams ?? null);
  useEffect(() => {
    if (!answering || !current?.data?.length) return;
    void data.enter(atNow(current, topParams));
    // the params are read through their key: a new object with the same values loads nothing again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, paramsKey, data, answering, mockSession]);
  const overlayParams = overlay?.params;
  const overlayKey = JSON.stringify(overlayParams ?? null);
  useEffect(() => {
    const f = overlay ? frames.find((x) => x.id === shownId(overlay.id)) : undefined;
    if (!answering || !f?.data?.length) return;
    void data.enter(atNow(f, overlayParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.id, overlayKey, data, answering, mockSession]);
  /* What a source is asked with can change while its screen is up: its params read a variable a search field writes,
     another source's answer, the session. Read as the screen's scope has them now, they are the key it loads by, as in
     the exported app (lib/app/react.ts `useDataSource`): a change enters it again with them, a key that holds what it
     gave showing that while it loads behind it. The bindings set no wait before a load, so each change asks at once; an
     older answer gives way to the newest. */
  const argsKey = (f: Frame | undefined, params: Record<string, unknown> | undefined): string => {
    if (!f || !(f.data ?? []).some((d) => (d.load ?? "enter") === "enter")) return "";
    /* the time is read when the load is made: a key that changed every moment would never stop loading */
    void dataVersion;
    return data.keysOf({ frame: f, params, vars: screenVars(state, doc, f, dark).vars, varNames, now: 0 });
  };
  const reload = (f: Frame | undefined, params: Record<string, unknown> | undefined) => {
    if (!answering || !f) return;
    void data.enter(atNow(f, params), { changed: true });
  };
  const currentArgs = argsKey(current, topParams);
  // the arguments are read through their key: the screen coming on show is loaded just above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reload(current, topParams), [currentArgs]);
  const overlayShown = overlay ? frames.find((x) => x.id === shownId(overlay.id)) : undefined;
  const overlayArgs = argsKey(overlayShown, overlayParams);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reload(overlayShown, overlayParams), [overlayArgs]);

  /* ---------- listening to what the screens on show subscribe to ---------- */
  /* Each subscription of a screen on show (the top of the stack, and the overlay over it) is open while it is (an
     overlay over a screen leaves it on show), afresh when what it is asked with changes or the preview starts over, and
     closed as the screen goes. A message runs the action on it on that screen, with the message as the event, as a
     part's event does (docs/交互规则.md “订阅”). */
  const epoch = useSyncExternalStore(runtime.epoch.subscribe, runtime.epoch.get, runtime.epoch.get);
  const fireRef = useRef<typeof fire | null>(null);
  const channelsKey = (f: Frame | undefined, params: Record<string, unknown> | undefined): string => {
    if (!f?.subscriptions?.length) return "";
    void dataVersion;
    return data.channelKeysOf({ frame: f, params, vars: screenVars(state, doc, f, dark).vars, varNames });
  };
  const listenOn = (f: Frame | undefined, params: Record<string, unknown> | undefined) => {
    if (!answering || !f?.subscriptions?.length) return undefined;
    return data.listen(atNow(f, params), (action, event) => fireRef.current?.(action, undefined, { frame: f, params }, { event }));
  };
  const currentChannels = channelsKey(current, topParams);
  // the screen's params and what its subscriptions are asked with are read through their keys
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => listenOn(current, topParams), [current?.id, paramsKey, currentChannels, epoch, !!answering]);
  const overlayChannels = channelsKey(overlayShown, overlayParams);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => listenOn(overlayShown, overlayParams), [overlayShown?.id, overlayKey, overlayChannels, epoch, !!answering]);
  /* the parts' countdowns read the time off the runtime's clock: the mock library's, which the bar can stop */
  useEffect(() => setDomainClock(() => runtime.now()), [runtime]);

  const snack = state.snack;
  useEffect(() => {
    if (!snack) return;
    const id = window.setTimeout(() => store.update((s) => (s.snack === snack ? { ...s, snack: null } : s)), SNACK_MS);
    return () => window.clearTimeout(id);
  }, [snack, store]);

  /* ---------- the stage: the device the size of the screen on show ---------- */
  const prog = useMotionValue(0);
  const swipe = useSwipe({
    frames,
    shownId,
    onShow: () => stackRef.current[stackRef.current.length - 1]?.id,
    scale,
    prog,
    onCommit: (pk: Peek) => {
      setAnim({ motion: INSTANT, backwards: false, spring });
      setStack((s) => [...s, { id: pk.frameId, m: pk.m }]);
    },
  });
  peeking.current = swipe.peekRef;
  const peek = swipe.peek;
  const peekRef = swipe.peekRef;
  const peekFrame = peek ? frames.find((f) => f.id === peek.frameId) : undefined;

  /* A tap on a screen (the one on show, or the overlay over it): the interpreter runs it where it was made. A tap from
     a repeated part of a collection makes its row the current one (`{{current.field}}`), when it runs anything. */
  const fire = (a: Action, it: Item | undefined, on: TapScreen, extra?: TapExtra) => {
    if (swipe.swiped.current) return;
    const was = store.get().current;
    const tap = tapOf(on, it, it?.row ?? was, extra);
    if (!chooseBranch(a, host, tap)) return;
    if (it?.row && it.row !== was) store.update((s) => ({ ...s, current: it.row }));
    void run(a, host, tap);
  };
  fireRef.current = fire;

  const { w: frameW, h: frameH } = current ? frameSizeOf(current) : { w: PHONE_W, h: PHONE_H };
  /* every screen sits in the same bezel; only the corners tell a phone from a window */
  const radius = current ? frameRadius(current) : PHONE_R;
  const outerW = frameW + BEZEL * 2;
  const outerH = frameH + BEZEL * 2;
  const targetFrame = peekFrame ?? current;
  const { w: targetFrameW, h: targetFrameH } = targetFrame ? frameSizeOf(targetFrame) : { w: frameW, h: frameH };
  const targetRadius = targetFrame ? frameRadius(targetFrame) : radius;
  const targetOuterW = targetFrameW + BEZEL * 2;
  const targetOuterH = targetFrameH + BEZEL * 2;

  /* The shell is the size of the screen on show. When the screen changes it eases to
   * the new size in step with the slide; a tracked swipe steers it toward the target
   * with the finger, so a phone and a desktop screen hand over without a snap. */
  const shellW = useMotionValue(outerW);
  const shellH = useMotionValue(outerH);
  const screenRadius = useMotionValue(radius);
  useEffect(() => {
    const opts = { duration: SLIDE_MS, ease: EASE };
    const runs = [animate(shellW, outerW, opts), animate(shellH, outerH, opts), animate(screenRadius, radius, opts)];
    return () => runs.forEach((r) => r.stop());
  }, [outerW, outerH, radius, shellW, shellH, screenRadius]);
  useEffect(
    () =>
      prog.on("change", (v) => {
        if (!peekRef.current) return;
        shellW.set(outerW + (targetOuterW - outerW) * v);
        shellH.set(outerH + (targetOuterH - outerH) * v);
        screenRadius.set(radius + (targetRadius - radius) * v);
      }),
    [prog, peekRef, outerW, outerH, radius, targetOuterW, targetOuterH, targetRadius, shellW, shellH, screenRadius],
  );
  const screenW = useTransform(shellW, (v) => v - BEZEL * 2);
  const screenH = useTransform(shellH, (v) => v - BEZEL * 2);
  const shellRadius = useTransform(screenRadius, (v) => v + BEZEL);
  /* on a wide window the controls stand in a column at the right edge, clear of the phone;
   * on a phone they stay along the bottom, where the frame fills the width anyway */
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 720);
  /* the stage is sized for the largest screen in the document, so the scale never changes while a
   * swipe crosses sizes or a screen is opened from the picker. On a phone the screen on show fills the
   * window instead: a desktop size elsewhere in the document would leave it the size of a stamp */
  const onStage = wide || !current ? frames : [current];
  const maxOuterW = Math.max(outerW, ...onStage.map((f) => frameSizeOf(f).w + BEZEL * 2));
  const maxOuterH = Math.max(outerH, ...onStage.map((f) => frameSizeOf(f).h + BEZEL * 2));
  const shellLeft = useTransform(shellW, (v) => ((maxOuterW - v) * scale) / 2);
  const shellTop = useTransform(shellH, (v) => ((maxOuterH - v) * scale) / 2);

  useEffect(() => {
    const fit = () => {
      const isWide = window.innerWidth >= 720;
      setWide(isWide);
      setScale(
        /* along the bottom, the controls take a strip of the height */
        Math.min(1.4, (window.innerHeight - 32 - (isWide ? 0 : PHONE_BAR_H)) / maxOuterH, (window.innerWidth - (isWide ? WIDE_CONTROL_SPACE + 16 : 16)) / maxOuterW),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [maxOuterH, maxOuterW]);

  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* an input method putting a character together owns every key, Escape too */
      if (composing(e)) return;
      if (e.key === "Escape") {
        /* an open menu is the thing Escape dismisses, then an overlay */
        if (picker) setPicker(false);
        else if (overlayRef.current) setOverlay(null);
        else onClose();
      }
      /* Backspace in a field deletes, ← in a slider or a row of tabs moves: only elsewhere do they go back */
      if (goesBack(e)) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, onClose, picker, setOverlay]);
  /* The control that opened the preview gets the keyboard back when it closes, whichever
   * screens were shown in between. Read
   * during the first render, before a screen's effect moves focus onto its rail. */
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => () => { if (opener?.isConnected && !opener.closest("[inert]")) opener.focus(); }, [opener]);

  /* ---------- the screens as the state has them ---------- */
  /* how tall bound words are drawn in the preview (components/previewText.ts), over what the canvas measured */
  const [wordHeights, setWordHeights] = useState<Record<string, number>>({});
  const onWordHeights = useCallback((next: Record<string, number>) => setWordHeights((was) => (Object.entries(next).some(([k, v]) => was[k] !== v) ? { ...was, ...next } : was)), []);
  /* a screen's parts as they are right now. The tab a visitor chose goes in first, since which parts
   * the dock shows and how they are laid out both follow from it; then its bindings: the data drawn in, the regions in
   * the state their data is in, the forms' errors (lib/bindings/view.ts), the bound words as tall as they are. */
  const groupsFor = useCallback(
    (f: Frame, params?: Record<string, unknown>): { groups: DocGroup[]; widths: Record<string, number> } => {
      const tabbed = groupsInFrame(doc.groups, f, frames, widths).map((g) => {
        const it = g.items[0];
        const def = g.items.length === 1 ? partBySlug(it.component) : undefined;
        return def?.panes && def.selectKey && values[it.id] >= 0 ? { ...g, items: [{ ...it, props: { ...it.props, [def.selectKey]: values[it.id] } }] } : g;
      });
      const vars = screenVars(state, doc, f, dark);
      try {
        const scope = data.scope({ frame: f, params, vars: vars.vars, varNames });
        const form = (g: DocGroup, gs: DocGroup[], owner: Map<string, string>) => data.formView({ form: g, groups: gs, owner, fields: state.fields, files: files.current });
        const bound = boundScreen({ groups: tabbed, frame: f, doc, scope, form, vars: vars.vars, widths, ctx: { lang } });
        boundRef.current[f.id] = bound;
        const laid = { ...bound.widths, ...wordHeights };
        return { groups: liveGroups(bound.groups, { ...vars, ctx: bound.ctx }, doc, laid), widths: laid };
      } catch {
        /* a binding that cannot be drawn leaves the screen as designed: the preview never stops for it */
        return { groups: liveGroups(tabbed, vars, doc, widths), widths };
      }
    },
    // what the runtime holds is read through its version
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, frames, widths, values, state, dark, dataVersion, data, varNames, lang, wordHeights],
  );
  /** the variables as a screen shows them, for the design fields bound to them */
  const boundFor = useCallback((f: Frame | undefined) => (doc.vars?.length && f ? screenVars(state, doc, f, dark).vars : null), [doc, state, dark]);
  const live = useMemo(() => (current ? groupsFor(current, top?.params) : { groups: [], widths }), [current, groupsFor, top?.params, widths]);
  const groups = live.groups;
  const overlayFrame = overlay ? frames.find((f) => f.id === shownId(overlay.id)) : undefined;
  const overlayLive = useMemo(() => (overlayFrame ? groupsFor(overlayFrame, overlay?.params) : { groups: [], widths }), [overlayFrame, groupsFor, overlay?.params, widths]);
  const peekLive = useMemo(() => (peekFrame ? groupsFor(peekFrame) : { groups: [], widths }), [peekFrame, groupsFor, widths]);

  if (!current) {
    return null;
  }

  const screenProps = {
    widths,
    onWordHeights,
    p,
    styled: { ...theme, dark },
    values,
    onValue: (id: string, v: number) => setValues((m) => ({ ...m, [id]: v })),
    opened: state.opened,
    onField: (it: Item, value: FieldValue) => store.update((s) => writeField(s, it, value, doc)),
    onCloseOverlay: (id: string) => store.update((s) => applyEffects(s, [{ do: "close", part: id }], doc)),
    onScrim: () => store.update((s) => closeOpened(s, doc)),
    onFiles: (it: Item, list: TransportFile[]) => {
      files.current = { ...files.current, [it.id]: list };
      /* the names stand for the files where a value is read (a condition, a required field) */
      const names = list.map((x) => x.name).join(", ");
      store.update((s) => writeField({ ...s, fields: { ...s.fields, [it.id]: names } }, it, names, doc));
    },
  };
  /** what a screen does on a pull and at the end of its scrolling, and whether a pull's load is under way */
  const dataHandlers = (f: Frame, params?: Record<string, unknown>) => {
    const pulls = (f.data ?? []).filter((d) => d.pullToRefresh);
    const pages = (f.data ?? []).filter((d) => d.paging === "scroll");
    return {
      onPull: pulls.length ? () => pulls.forEach((d) => void data.load(atNow(f, params), d.name)) : undefined,
      onNearEnd: pages.length ? () => pages.forEach((d) => void data.load(atNow(f, params), d.name, { more: true })) : undefined,
      refreshing: pulls.some((d) => {
        const spec = data.sourceOf(atNow(f, params), d.name);
        const s = spec ? data.state(spec) : undefined;
        return !!s?.loading && s.value !== undefined && s.key === spec?.key;
      }),
    };
  };
  /* a snackbar sits over the content, above a bar at the foot of the screen */
  const footH = Math.max(0, ...groups.filter((g) => g.items.length === 1 && roleOf(g.items[0]) === "bottom").map((g) => sizeOf(g.items[0], widths).h));
  /** a screen picked by hand, or a flow's start: shown as it is, whichever width was on, and the visitor starts there */
  const pick = (id: string) => {
    setDevice(null);
    setOverlay(null);
    setAnim({ motion: FADE, backwards: false, spring });
    setStack([{ id, m: FADE }]);
  };

  return (
    <PreviewMocksContext.Provider value={mocks}>
    <PreviewWorlds.Provider value={worlds}>
    <PreviewMockWorld.Provider value={mockWorld}>
    <PreviewTheme dark={dark}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: p.surfaceContainer,
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box",
        paddingRight: wide ? WIDE_CONTROL_SPACE : 0,
      }}
    >
      <div
        style={{
          width: maxOuterW * scale,
          height: maxOuterH * scale,
          position: "relative",
          marginBottom: wide ? 0 : PHONE_BAR_H,
        }}
      >
        <motion.div
          onPointerDown={(e) => swipe.onPointerDown(e, frameW)}
          style={{
            position: "absolute",
            left: shellLeft,
            top: shellTop,
            width: shellW,
            height: shellH,
            transform: `scale(${scale})`,
            touchAction: "none",
            transformOrigin: "0 0",
            borderRadius: shellRadius,
            background: p.inverseSurface,
            boxShadow: "0 30px 80px rgba(0,0,0,0.22)",
          }}
        >
          <motion.div
            onClickCapture={(e) => {
              if (swipe.swiped.current) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            style={{
              position: "absolute",
              left: BEZEL,
              top: BEZEL,
              width: screenW,
              height: screenH,
              borderRadius: screenRadius,
              overflow: "hidden",
              background: screenBackground(p[current.bg ?? "surface"], { ...theme, dark }),
              fontFamily: fontFamilyOf(theme.font, lang),
              touchAction: "none",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                x: swipe.curX,
                y: swipe.curY,
                opacity: swipe.curOp,
              }}
            >
              <AnimatePresence initial={false} mode="popLayout" custom={anim}>
                <motion.div
                  key={current.id}
                  custom={anim}
                  variants={screenVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  style={{ position: "absolute", inset: 0 }}
                >
                  <Screen frame={current} groups={groups} {...screenProps} onAction={(a, it, extra) => fire(a, it, { frame: current, params: top?.params }, extra)} widths={live.widths} {...dataHandlers(current, top?.params)} active={!overlayFrame} bound={boundFor(current)} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
            <AnimatePresence>
              {overlayFrame && overlay && (
                <motion.div key={`overlay:${overlay.id}`} data-preview-overlay={overlay.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center" }}>
                  <div aria-hidden onClick={() => setOverlay(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)" }} />
                  <motion.div
                    custom={{ motion: overlay.m, backwards: false, spring } satisfies ScreenMove}
                    variants={screenVariants}
                    initial="initial"
                    animate="animate"
                    style={{ position: "relative", width: frameSizeOf(overlayFrame).w, height: frameSizeOf(overlayFrame).h, borderRadius: frameRadius(overlayFrame) / 2, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
                  >
                    <Screen frame={overlayFrame} groups={overlayLive.groups} {...screenProps} onAction={(a, it, extra) => fire(a, it, { frame: overlayFrame, params: overlay.params }, extra)} widths={overlayLive.widths} {...dataHandlers(overlayFrame, overlay?.params)} bound={boundFor(overlayFrame)} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {peek && peekFrame && (
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  x: swipe.peekX,
                  y: swipe.peekY,
                  pointerEvents: "none",
                }}
              >
                <Screen {...screenProps} onAction={(a, it, extra) => fire(a, it, { frame: peekFrame }, extra)} active={false} frame={peekFrame} groups={peekLive.groups} widths={peekLive.widths} bound={boundFor(peekFrame)} />
              </motion.div>
            )}
            <AnimatePresence>
              {snack && (
                <motion.div
                  key={snack.id}
                  role="status"
                  data-preview-snackbar
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  style={{ position: "absolute", left: 16, right: 16, bottom: 16 + footH, zIndex: 3, padding: "14px 16px", borderRadius: 4, background: p.inverseSurface, color: p.inverseOnSurface, fontSize: 14, lineHeight: "20px", boxShadow: "0 3px 8px rgba(0,0,0,0.24)" }}
                >
                  {snack.message}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {mocks && logOpen && <MockLogPanel mocks={mocks} p={p} onClose={() => setLogOpen(false)} />}

      <PreviewControls
        doc={doc}
        current={current}
        p={p}
        wide={wide}
        canGoBack={stack.length >= 2 || !!overlay}
        onBack={() => back()}
        picker={picker}
        setPicker={setPicker}
        onPick={pick}
        mocks={mocks}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((v) => !v)}
        dark={dark}
        onToggleDark={toggleDark}
        onSize={(preset) => {
          setAnim({ motion: FADE, backwards: false, spring });
          setDevice(preset);
        }}
        onClose={onClose}
      />
    </motion.div>
    </PreviewTheme>
    </PreviewMockWorld.Provider>
    </PreviewWorlds.Provider>
    </PreviewMocksContext.Provider>
  );
}
