import { describe, expect, it } from "vitest";
import { run, type Action, type Effect, type GoOptions } from "../../lib/actions";
import { createRuntime } from "../../lib/app/runtime";
import type { Transport, TransportRequest } from "../../lib/api/transport";
import { BindingEngine, emptyBindings, type BindingState } from "../../lib/bindings/runtime";
import { boundScreen } from "../../lib/bindings/view";
import { designDoc } from "../../lib/actions/consistency/design";
import type { Design } from "../../lib/actions/consistency/types";
import { screenVars } from "../../lib/interact";
import { groupsInFrame, type Doc, type Item } from "../../lib/tokens";
import type { CapabilityHost } from "../../lib/capabilities/types";
import { createPreviewHost, tapOf } from "./host";
import { PreviewStore } from "./store";

/* The preview's host of the interpreter (host.ts) on its own, with the real bindings engine and runtime under it and a
 * back end that answers when told: the click paths the preview's taps take, step by step. The whole preview runs the
 * consistency table (lib/actions/consistency/preview.test.ts); these pin what is the preview's own. */

type Held = { req: TransportRequest; answer: (status: number, body?: unknown) => void };

function bed(design: Design, o: { hold?: string[]; capabilities?: CapabilityHost } = {}) {
  const { doc } = designDoc(design);
  const sent: TransportRequest[] = [];
  const held: Held[] = [];
  const transport: Transport = {
    request: (req) => {
      sent.push(req);
      if (o.hold?.includes(req.operationId ?? "")) return new Promise((ok) => held.push({ req, answer: (status, body = {}) => ok({ status, headers: {}, body }) }));
      return Promise.resolve({ status: 200, headers: {}, body: { token: "t1" } });
    },
  };
  let bindings: BindingState = emptyBindings();
  const store = PreviewStore.start(doc, false);
  const engine = new BindingEngine({ doc: () => doc, transport, get: () => bindings, set: (next) => (bindings = next), ctx: () => ({ lang: "en" }) });
  const runtime = createRuntime({ transport, lang: "en", ...(o.capabilities ? { capabilities: o.capabilities } : {}) });
  const went: { to: string; o: GoOptions }[] = [];
  const opened: string[] = [];
  let moves = 0;
  let signedOut = 0;
  const host = createPreviewHost({
    doc: () => doc,
    store,
    dark: () => false,
    onShow: () => doc.frames[0],
    engine,
    bindings: () => bindings,
    setBindings: (next) => (bindings = next),
    runtime,
    bound: (id) => {
      const frame = doc.frames.find((f) => f.id === id)!;
      return boundScreen({ groups: groupsInFrame(doc.groups, frame, doc.frames, {}), frame, doc, state: bindings, vars: screenVars(store.get(), doc, frame, false).vars, fields: store.get().fields, widths: {}, ctx: { lang: "en" } });
    },
    files: () => ({}),
    go: (to, go) => {
      went.push({ to, o: go });
      moves++;
    },
    back: () => moves++,
    openLink: (url) => opened.push(url),
    scrollTo: () => {},
    moves: () => moves,
    returnAfterSignIn: () => false,
    signedOut: () => signedOut++,
  });
  const part = (id: string): Item => doc.groups.flatMap((g) => g.items).find((it) => it.id === id)!;
  /** a tap on the part with this id, on the first screen, run to the end of what it starts */
  const tap = (id: string) => run(part(id).action as Action, host, tapOf({ frame: doc.frames[0] }, part(id), undefined));
  return {
    doc: doc as Doc,
    host,
    store,
    runtime,
    sent,
    held,
    went,
    opened,
    tap,
    part,
    get signedOut() {
      return signedOut;
    },
    leave: () => moves++,
    bindings: () => bindings,
    setBindings: (next: BindingState) => (bindings = next),
  };
}

const HOME = { id: "home", name: "Home" };
const DONE = { id: "done", name: "Done" };
const stay = (...effects: Effect[]): Action => ({ to: "none", transition: "none", effects });
const turns = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("the preview's host of the interpreter", () => {
  it("sends a call with its arguments as they are at its step, before the effects after it", async () => {
    const b = bed({
      screens: [HOME],
      vars: [{ id: "qty", name: "qty", type: "number", value: 1 }],
      api: [{ operationId: "create", path: "/create", body: { qty: { title: "Qty", type: "number" } } }],
      parts: [{ id: "go", label: "Go", action: stay({ do: "call", operationId: "create", args: { qty: "vars.qty" } }, { do: "setVar", var: "qty", value: 5 }) }],
    });
    await b.tap("go");
    expect(b.sent.map((r) => r.body)).toEqual([{ qty: 1 }]);
    expect(b.store.get().vars.qty).toBe(5);
  });

  it("runs an answer's effects once the visitor has moved on, but goes nowhere", async () => {
    const b = bed({
      screens: [HOME, DONE],
      vars: [{ id: "saved", name: "saved", type: "bool", value: false }],
      api: [{ operationId: "save", path: "/save" }],
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      parts: [{ id: "go", label: "Save", action: stay({ do: "call", operationId: "save", then: { to: "done", transition: "none", effects: [{ do: "setVar", var: "saved", value: true }, { do: "snackbar", message: "Saved" }] } }) }],
    }, { hold: ["save"] });
    const done = b.tap("go");
    await turns();
    b.leave();
    b.held[0].answer(200);
    await done;
    expect(b.store.get().vars.saved).toBe(true);
    expect(b.store.get().snack?.message).toBe("Saved");
    expect(b.went).toEqual([]);
  });

  it("drops an answer that comes after the preview started over: nothing runs, nothing is undone", async () => {
    const b = bed({
      screens: [HOME],
      vars: [{ id: "saved", name: "saved", type: "bool", value: false }],
      api: [{ operationId: "save", path: "/save" }],
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      parts: [{ id: "go", label: "Save", action: stay({ do: "call", operationId: "save", then: { to: "none", transition: "none", effects: [{ do: "setVar", var: "saved", value: true }] }, catch: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "No" }] } }) }],
    }, { hold: ["save"] });
    const done = b.tap("go");
    await turns();
    b.runtime.restart();
    b.held[0].answer(500);
    await done;
    expect(b.store.get().vars.saved).toBe(false);
    expect(b.store.get().snack).toBeNull();
  });

  it("lets the older of two answers to one part's call give way to the newer", async () => {
    const b = bed({
      screens: [HOME],
      vars: [{ id: "n", name: "n", type: "number", value: 0 }],
      api: [{ operationId: "like", path: "/like", returns: { n: "number" } }],
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      parts: [{ id: "go", label: "Like", action: stay({ do: "call", operationId: "like", then: { to: "none", transition: "none", effects: [{ do: "setVar", var: "n", value: 0, expr: "response.n" }] } }) }],
    }, { hold: ["like"] });
    const first = b.tap("go");
    const second = b.tap("go");
    await turns();
    b.held[1].answer(200, { n: 2 });
    b.held[0].answer(200, { n: 1 });
    await Promise.all([first, second]);
    expect(b.store.get().vars.n).toBe(2);
  });

  it("stops calls nested in one another's then at four deep", async () => {
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const chain = (n: number): Effect => ({ do: "call", operationId: `c${n}`, ...(n < 6 ? { then: { to: "none", transition: "none", effects: [chain(n + 1)] } } : {}) }) as Effect;
    const b = bed({ screens: [HOME], api: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ operationId: `c${n}`, path: `/c${n}` })), parts: [{ id: "go", label: "Chain", action: stay(chain(0)), unchecked: true }] });
    await b.tap("go");
    expect(b.sent.map((r) => r.operationId)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("signs out: where a sign-in would have gone back to is forgotten, and the preview hears of it", () => {
    const b = bed({ screens: [HOME], parts: [{ id: "out", label: "Out", action: stay({ do: "signOut" }) }] });
    b.runtime.rememberReturn({ back: true });
    void b.tap("out");
    expect(b.runtime.takeReturn()).toBeUndefined();
    expect(b.signedOut).toBe(1);
  });

  it("keeps a color variable to colors", async () => {
    const b = bed({ screens: [HOME], vars: [{ id: "tint", name: "tint", type: "color", value: "primary" }], parts: [{ id: "go", label: "Tint", action: stay({ do: "setVar", var: "tint", value: "not a color" }, { do: "setVar", var: "tint", value: "#ff0000" }) }] });
    b.host.setVar("tint", "not a color");
    expect(b.store.get().vars.tint).toBe("primary");
    await b.tap("go");
    expect(b.store.get().vars.tint).toBe("#ff0000");
  });

  it("sends no form whose required field is empty, and shows why", async () => {
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const b = bed({ screens: [HOME], api: [{ operationId: "note", path: "/note", body: { text: { title: "Note", required: true } } }], forms: [{ operationId: "note", submit: "Save note", ok: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Saved" }] } }], parts: [] });
    const submit = b.doc.groups.flatMap((g) => g.items).find((it) => it.props?.label === "Save note")!;
    const form = b.doc.groups.find((g) => g.form)!;
    await run(submit.action as Action, b.host, tapOf({ frame: b.doc.frames[0] }, { ...submit, scope: { form: form.id } }, undefined));
    expect(b.sent).toEqual([]);
    expect(b.store.get().snack).toBeNull();
    expect(Object.keys(b.bindings().forms[form.id]?.errors ?? {})).toEqual(["text"]);
  });

  it("takes a row out of a source before the answer, and puts it back when asked", () => {
    const b = bed({ screens: [HOME], parts: [] });
    const rows = [{ id: "a" }, { id: "b" }];
    b.setBindings({ ...b.bindings(), sources: { "home/items": { ...({} as BindingState["sources"][string]), status: "ready", items: rows, value: rows, seq: 1 } } });
    const undo = b.host.optimistic("items", { remove: true }, { screen: "home", item: { id: "a" } });
    expect(b.bindings().sources["home/items"].items).toEqual([{ id: "b" }]);
    undo?.();
    expect(b.bindings().sources["home/items"].items).toEqual(rows);
    expect(b.host.optimistic("items", { remove: true }, { screen: "home" })).toBeUndefined();
  });

  it("opens the page a link.open was given, as a link action does", async () => {
    const capabilities: CapabilityHost = { invoke: async () => ({ ok: true, result: {} }) };
    const b = bed({ screens: [HOME], parts: [{ id: "go", label: "Open", action: stay({ do: "invoke", capability: "link.open", args: { url: "'https://example.com/a'" } }) }] }, { capabilities });
    await b.tap("go");
    expect(b.opened).toEqual(["https://example.com/a"]);
  });

  it("freezes a tap where it was made: the screen and its params, the part, its element, row, form, place and event", () => {
    const it = { id: "p1", component: "button", props: {}, scope: { item: { id: 7 }, index: 2, form: "f1" }, row: { name: "Tea" } } as unknown as Item;
    expect(tapOf({ frame: { id: "home" }, params: { cat: "tea" } }, it, { name: "Tea" }, { slot: { key: "tab:1", index: 1 }, event: { value: 3 } })).toEqual({
      screen: "home",
      params: { cat: "tea" },
      part: "p1",
      item: { id: 7 },
      index: 2,
      row: { name: "Tea" },
      current: { name: "Tea" },
      form: "f1",
      slot: { key: "tab:1", index: 1 },
      event: { value: 3 },
    });
    expect(tapOf({ frame: { id: "home" } }, undefined, undefined)).toEqual({ screen: "home" });
  });
});
