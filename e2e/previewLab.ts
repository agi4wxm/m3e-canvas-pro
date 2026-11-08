/* A small app for the preview's tap tests (e2e/preview.e2e.ts), built only through operations: a product list a search
 * field filters, an overlay that renames a product through a form, a screen opened with params whose buttons call the
 * back end (staying, or going on at once), a form there, and a screen with a text field to type in. A fake back end
 * (`installLab`) answers on the page, holding the calls a test wants to answer itself. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { defaultScenarios } from "../lib/mocks";
import type { Doc } from "../lib/tokens";

/** the lab and the ids of the parts a test presses */
export function labDoc(): { doc: Doc; ids: { search: string; noteForm: string; noteField: string; typing: string } } {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const ids = { search: "search", noteForm: "", noteField: "", typing: "typing" };
  store.transact("Build the lab", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Lab" });
    tx.run(ops.addModel, { name: "Product", schema: { type: "object", properties: { id: { type: "string" }, name: { type: "string", minLength: 1 } }, required: ["id", "name"] } });
    tx.run(ops.addEndpoint, {
      operationId: "listProducts",
      method: "get",
      path: "/products",
      parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
      returns: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Product" } } }, required: ["items"] },
    });
    tx.run(ops.addEndpoint, { operationId: "renameProduct", method: "patch", path: "/products/{productId}", body: { type: "object", properties: { name: { type: "string", minLength: 1, title: "Name" } }, required: ["name"] }, returns: { $ref: "#/components/schemas/Product" } });
    tx.run(ops.addEndpoint, { operationId: "saveNote", method: "post", path: "/notes", body: { type: "object", properties: { text: { type: "string", minLength: 1, title: "Note" } }, required: ["text"] }, returns: { type: "object", properties: { n: { type: "integer" } } } });
    tx.run(ops.addEndpoint, { operationId: "ping", method: "post", path: "/ping", returns: { type: "object", properties: { n: { type: "integer" } } } });

    tx.run(ops.addScreen, { id: "list", name: "List" });
    tx.run(ops.addScreen, { id: "rename", name: "Rename" });
    tx.run(ops.addScreen, { id: "notes", name: "Notes" });
    tx.run(ops.addScreen, { id: "done", name: "Done" });
    tx.run(ops.addScreen, { id: "keys", name: "Keys" });
    tx.run(ops.setScreenParams, { screen: "rename", params: [{ name: "productId", type: "string" }] });
    tx.run(ops.setScreenParams, { screen: "notes", params: [{ name: "cat", type: "string" }] });

    /* the list: a search field writing a variable the source's params read */
    tx.run(ops.addVar, { id: "q", name: "q", type: "text", value: "" });
    tx.run(ops.addPart, { slug: "text-field", id: ids.search, screen: "list", at: { x: 16, y: 40 }, props: { label: "Search" } });
    tx.run(ops.bindProp, { id: ids.search, prop: "value", var: "q" });
    tx.run(ops.wireScreen, { screen: "list", operationId: "listProducts", params: { q: "vars.q" } });
    tx.run(ops.addPart, { slug: "button", id: "rename-p2", screen: "list", at: { x: 16, y: 640 }, props: { label: "Rename p2" } });
    tx.run(ops.setAction, { id: "rename-p2", action: { to: "rename", transition: "fade", overlay: true, params: { productId: "'p2'" } } as never });
    tx.run(ops.addPart, { slug: "button", id: "to-notes", screen: "list", at: { x: 16, y: 700 }, props: { label: "Notes" } });
    tx.run(ops.setAction, { id: "to-notes", action: { to: "notes", params: { cat: "'tea'" } } as never });
    tx.run(ops.addPart, { slug: "button", id: "to-keys", screen: "list", at: { x: 16, y: 760 }, props: { label: "Keys" } });
    tx.run(ops.setAction, { id: "to-keys", action: { to: "keys" } });

    /* the overlay: a form that renames the product its params name */
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "rename", operationId: "renameProduct", submitLabel: "Save name", params: { productId: "params.productId" }, then: { to: "back", effects: [{ do: "snackbar", message: "Renamed {{params.productId}} to {{response.name}}" }] } });

    /* the screen opened with params: calls that stay, and ones whose tap goes on at once */
    const then = { to: "none", effects: [{ do: "snackbar", message: "Pong {{response.n}} {{params.cat}}" }] };
    const fail = { to: "none", effects: [{ do: "snackbar", message: "Ping failed {{params.cat}}" }] };
    tx.run(ops.addPart, { slug: "button", id: "ping", screen: "notes", at: { x: 16, y: 40 }, props: { label: "Ping" } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.setAction, { id: "ping", action: { to: "none", effects: [{ do: "call", operationId: "ping", then, catch: fail }] } as never });
    tx.run(ops.addPart, { slug: "button", id: "ping-go", screen: "notes", at: { x: 16, y: 100 }, props: { label: "Ping and go" } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.setAction, { id: "ping-go", action: { to: "done", effects: [{ do: "call", operationId: "ping", then, catch: fail }] } as never });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const form = tx.run(ops.makeForm, { screen: "notes", operationId: "saveNote", submitLabel: "Save note", then: { to: "none", effects: [{ do: "snackbar", message: "Saved {{response.n}}: {{form.values.text}} ({{params.cat}})" }] } }) as { formId: string; fields: { field: string; itemId?: string }[] };
    ids.noteForm = form.formId;
    ids.noteField = form.fields.find((f) => f.field === "text")?.itemId ?? "";
    tx.run(ops.addPart, { slug: "button", id: "save-go", screen: "notes", at: { x: 16, y: 760 }, props: { label: "Save and go" } });
    tx.run(ops.setAction, { id: "save-go", action: { to: "done", effects: [{ do: "submit", form: form.formId }] } as never });
    tx.run(ops.addPart, { slug: "text", id: "done-words", screen: "done", at: { x: 16, y: 40 }, props: { text: "All done" } });

    /* a field to type in, one screen into the stack */
    tx.run(ops.addPart, { slug: "text-field", id: ids.typing, screen: "keys", at: { x: 16, y: 40 }, props: { label: "Type here" } });
  });
  /* the mock library's scenarios, for the preview's switch: choosing one starts the bindings over */
  return { doc: { ...savedDoc(store.get()), mocks: { seed: 1, locale: "en", scenarios: defaultScenarios("en") } }, ids };
}

export type Lab = { hold: string[] };

/** The lab's back end on the page, as `window.m3ePreviewTransport`: products by search, a rename, a note saved, a
 *  ping counted. A call to an operation in `hold` waits until the test answers it (`window.__answer(i, status, body)`);
 *  every request is kept in `window.__calls`. Sent to the page as source: it reads nothing from outside itself. */
export function installLab(opts: Lab) {
  type Req = { operationId?: string; method: string; path: string; query?: Record<string, unknown>; body?: unknown };
  type Res = { status: number; headers: Record<string, string>; body?: unknown };
  const products = ["Green tea", "Black tea", "Coffee", "Cocoa", "Mint tea"].map((name, i) => ({ id: `p${i + 1}`, name }));
  const w = window as unknown as { __calls: unknown[]; __held: { op?: string; done: boolean; answer: (r: Res) => void }[]; __answer: (i: number, status: number, body?: unknown) => void; m3ePreviewTransport: unknown };
  w.__calls = [];
  w.__held = [];
  w.__answer = (i, status, body) => {
    const h = w.__held[i];
    if (!h || h.done) return;
    h.done = true;
    h.answer({ status, headers: {}, body });
  };
  let notes = 0;
  w.m3ePreviewTransport = {
    async request(req: Req): Promise<Res> {
      w.__calls.push({ op: req.operationId, path: req.path, query: req.query ?? null, body: req.body ?? null });
      if (req.operationId && opts.hold.includes(req.operationId)) return new Promise<Res>((answer) => w.__held.push({ op: req.operationId, done: false, answer }));
      await new Promise((r) => setTimeout(r, 60));
      const body = (req.body ?? {}) as Record<string, unknown>;
      switch (req.operationId) {
        case "listProducts": {
          const q = String(req.query?.q ?? "").toLowerCase();
          return { status: 200, headers: {}, body: { items: products.filter((p) => p.name.toLowerCase().includes(q)) } };
        }
        case "renameProduct": {
          const id = decodeURIComponent(req.path.split("/").pop() ?? "");
          return { status: 200, headers: {}, body: { id, name: String(body.name) } };
        }
        case "saveNote":
          return { status: 201, headers: {}, body: { n: ++notes } };
        case "ping":
          return { status: 200, headers: {}, body: { n: 0 } };
        default:
          return { status: 404, headers: {}, body: { title: "No such route", status: 404 } };
      }
    },
  };
}
