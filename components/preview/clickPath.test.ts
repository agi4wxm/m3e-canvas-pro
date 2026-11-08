import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES, type Item } from "../../lib/tokens";
import type { Transport } from "../../lib/api/transport";
import { drive, givenOf, turns, type Driver } from "../../lib/actions/consistency/check";
import { designDoc } from "../../lib/actions/consistency/design";
import { wordsOf } from "../../lib/actions/consistency/reference";
import { tiny } from "../../lib/actions/consistency/tiny";
import type { Element } from "../../lib/actions/consistency/tinyReact";
import type { Row } from "../../lib/actions/consistency/types";

/* Click paths of the preview that are its own, beyond the consistency table every host runs
 * (lib/actions/consistency/preview.test.ts): the real `Preview` component on the table's small stand-in for React,
 * tapped the way its screens are, through to the screen it ends on and what it holds. */

vi.mock("react", async () => (await import("../../lib/actions/consistency/tiny")).tiny.react);
vi.mock("react/jsx-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("react/jsx-dev-runtime", async () => (await import("../../lib/actions/consistency/tiny")).tiny.jsxRuntime);
vi.mock("motion/react", () => {
  const value = (v: unknown) => ({ get: () => v, set: () => {}, on: () => () => {} });
  return { AnimatePresence: "presence", motion: { div: "div", button: "button" }, useReducedMotion: () => false, useIsPresent: () => true, useMotionValue: value, useTransform: () => value(0), animate: () => ({ stop: () => {} }) };
});
vi.mock("@/lib/i18n", async () => ({ ...(await import("../../lib/i18n")), useLang: () => "en" }));
vi.mock("@/components/Icon", () => ({ Icon: "icon" }));
vi.mock("@/components/PartView", () => ({ PartView: "part-view" }));
vi.mock("@/components/DeviceBars", () => ({ DeviceBars: "device-bars" }));

const { Preview } = await import("../Preview");
const { PreviewStore } = await import("./store");

function previewOf(row: Row): (backend: Parameters<Parameters<typeof drive>[1]>[0]) => Driver {
  const { doc } = designDoc(row.design);
  return (backend) => {
    const transport: Transport = {
      request: async (r) => {
        const a = await backend.receive(r.operationId ?? "", givenOf(r.query, r.body));
        return { status: a.status, headers: { "content-type": "application/json" }, body: a.body };
      },
    };
    let tree: unknown;
    const draw = () => {
      tree = tiny.render(tiny.react.createElement(Preview, { doc, widths: {}, palette: PALETTES[0], startId: doc.frames[0].id, onClose: () => {}, transport }), (t) => t === Preview || (typeof t === "function" && t.name === "Screen"));
    };
    const screens = (): Element[] => tiny.elements(tree).filter((e) => typeof e.type === "function" && "frame" in e.props && "onAction" in e.props);
    const partsOf = (s: Element): Item[] => ((s.props.groups as { items: Item[] }[]) ?? []).flatMap((g) => g.items);
    draw();
    return {
      tap: (words) => {
        for (const screen of [...screens()].reverse()) {
          const it = partsOf(screen).find((x) => wordsOf(x) === words);
          if (!it) continue;
          if (it.action) (screen.props.onAction as (a: unknown, it: Item) => void)(it.action, it);
          draw();
          return;
        }
        throw new Error(`no part with the words "${words}" on show`);
      },
      type: () => {},
      restart: () => {},
      settle: async () => {
        for (let i = 0; i < 6; i++) {
          await turns(2);
          draw();
        }
      },
      observe: () => {
        const store = tiny.states().find((v) => v instanceof PreviewStore) as InstanceType<typeof PreviewStore> | undefined;
        const shown = screens();
        return { vars: store?.get().vars ?? {}, words: shown.flatMap(partsOf).map(wordsOf), toast: store?.get().snack?.message ?? null, screen: (shown[0]?.props.frame as { id: string } | undefined)?.id ?? "", calls: backend.calls };
      },
    };
  };
}

/** a design with a screen that needs a session, a sign-in screen, and the ways in and out of both */
const SIGNED: Row["design"] = {
  screens: [
    { id: "home", name: "Home" },
    { id: "account", name: "Account", auth: "required" },
    { id: "login", name: "Login", auth: "login" },
  ],
  api: [{ operationId: "login", path: "/login", returns: { token: "string" } }],
  login: "login",
  parts: [
    { id: "in", label: "Sign in", action: { to: "none", transition: "none", effects: [{ do: "call", operationId: "login" }] } },
    { id: "acct", label: "Account", action: { to: "account", transition: "none" } },
    { id: "out", label: "Sign out", screen: "account", action: { to: "none", transition: "none", effects: [{ do: "signOut" }] } },
    { id: "outHome", label: "Sign out and go home", screen: "account", action: { to: "home", transition: "none", effects: [{ do: "signOut" }] } },
    { id: "again", label: "Sign in again", screen: "login", action: { to: "none", transition: "none", effects: [{ do: "call", operationId: "login" }] } },
  ],
};
const signedRow = (steps: Row["steps"], expect: Row["expect"]): Row => ({ id: "signed", title: "", ref: "", design: SIGNED, answers: { login: { status: 200, body: { token: "t1" } } }, steps, expect });

async function ends(row: Row) {
  const { problems } = await drive(row, previewOf(row));
  expect(problems).toEqual([]);
}

describe("the preview's own click paths", () => {
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

  it("a sign-out on a screen that needs the session goes to the sign-in screen", () => ends(signedRow([{ tap: "Sign in" }, { tap: "Account" }, { tap: "Sign out" }], { screen: "login" })));

  it("a sign-out whose tap goes on to a screen anyone may see goes there, not to the sign-in screen", () => ends(signedRow([{ tap: "Sign in" }, { tap: "Account" }, { tap: "Sign out and go home" }], { screen: "home" })));

  it("signing in again after a sign-out brings the visitor back to the screen that needed it", () => ends(signedRow([{ tap: "Sign in" }, { tap: "Account" }, { tap: "Sign out" }, { tap: "Sign in again" }], { screen: "account" })));

  it("a screen that needs a session, opened without one, has the sign-in screen first and then opens", () => ends(signedRow([{ tap: "Account" }, { tap: "Sign in again" }], { screen: "account" })));
});
