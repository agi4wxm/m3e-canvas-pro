/* A document keeps what this version does not know (lib/keep.ts, docs/项目文件.md "不认识的字段"): a field added at any
 * level by a newer version, a tool of its own or a person with a text editor survives reading the file and writing it
 * again, through every way a document comes in and goes out: the project file, the editor's store, the browser's copy
 * with its pictures kept apart, a shared link (and the MCP server's file mode, in mcp/src/file.test.ts). The fields are put in at random,
 * everywhere a document has fields, into documents that use every kind of thing a document holds. */

import { beforeAll, describe, expect, it } from "vitest";
import { DocStore, savedDoc, stateOf } from "./core";
import { parseProject, serializeProject } from "./core/projectFile";
import { restoreAssets, stripAssets } from "./assets";
import { openProject } from "./project";
import { readShareLink, shareLink } from "./share";
import { fields, unknownFields, withUnknown } from "./keep";
import { setGlobalLang } from "./i18n";
import { withIds, type Doc } from "./tokens";
import { proofDoc, reuseDoc, systemsDoc } from "./exportProject.fixture";
import { boundShopDoc } from "./export/product.fixture";

beforeAll(() => setGlobalLang("en"));

/** a small deterministic random source (mulberry32), so a failure can be run again */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a JSON value of some shape: what a newer version might keep in a field of its own */
function someValue(r: () => number, depth = 0): unknown {
  const n = Math.floor(r() * (depth > 1 ? 4 : 6));
  if (n === 0) return `v${Math.floor(r() * 1000)}`;
  if (n === 1) return Math.round(r() * 1e6) / 100;
  if (n === 2) return r() < 0.5;
  if (n === 3) return null;
  if (n === 4) return [someValue(r, depth + 1), someValue(r, depth + 1)];
  return { a: someValue(r, depth + 1), "b-c": someValue(r, depth + 1) };
}

/* Objects whose keys are names the author gave (prop values, expressions by name, variables' values by mode, status
 * codes, credentials…), not fields: a key put into one of them is an entry, held to what its entries must be. And the
 * few places this version keeps only what it knows, by design: a custom scheme is only colors (each is painted); a
 * theme's recipes and screen rules and a style's insides are the style system's to read (lib/styles); what an instance
 * shows is drawn from its definition. docs/项目文件.md lists them. */
const NAMES = new Set(["bind", "overrides", "properties", "varModes", "icons", "responses", "hints", "ops", "counts", "weights", "schemes", "args", "params", "patch", "values", "variant", "security[]", "customPalette", "recipes", "ux", "headers", "actions", "modes", "accept[]"]);
/** under these keys a value is opaque JSON the format keeps whole: an entry put in is kept, as anything in it is */
const OPAQUE = new Set(["schema", "extra", "requestBody", "payload", "body", "fixtures", "value", "examples", "parameters"]);

type Planted = { path: (string | number)[]; key: string; value: unknown };

/** The document with a field this version does not know put into its objects, each with probability `rate`, and
 *  where each went. `under` is the key an object is held under (`key[]` for an entry of a list); `standIn` says it is
 *  inside the part an instance stands in for, which is drawn from its definition. */
function plant(doc: Doc, seed: number, rate = 0.5): { doc: Doc; planted: Planted[] } {
  const r = random(seed);
  const planted: Planted[] = [];
  let n = 0;
  const walk = (v: unknown, path: (string | number)[], under: string | undefined, standIn: number): unknown => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, [...path, i], `${under}[]`, standIn && standIn + 1));
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    const instance = typeof (v as { instanceOf?: unknown }).instanceOf === "string";
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, [...path, k], k, instance && k === "items" ? 1 : standIn && standIn + 1);
    const names = under !== undefined && NAMES.has(under);
    const styleInside = path[0] === "styles" && path.length > 2;
    const opaque = path.some((p) => typeof p === "string" && OPAQUE.has(p));
    /* the stand-in itself keeps a field of its own (standIn 2: the item, under its group's list) */
    if (!names && !styleInside && !opaque && !(standIn > 2) && r() < rate) {
      const key = `x-future-${++n}`;
      const value = someValue(r);
      out[key] = value;
      planted.push({ path, key, value });
    }
    return out;
  };
  return { doc: walk(doc, [], undefined, 0) as Doc, planted };
}

const at = (v: unknown, path: (string | number)[]) => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string | number, unknown>)[k] : undefined), v);

/** every field planted is where it was put, as it was */
function expectKept(doc: unknown, planted: Planted[], where: string) {
  const lost = planted.filter((p) => JSON.stringify((at(doc, p.path) as Record<string, unknown> | undefined)?.[p.key]) !== JSON.stringify(p.value));
  expect(lost.map((p) => `${[...p.path, p.key].join(".")}`), where).toEqual([]);
}

/** documents that between them hold every kind of thing a document has */
function documents(): Record<string, Doc> {
  let n = 0;
  return withIds(
    () => `k${++n}`,
    () => ({ proof: proofDoc().doc, reuse: reuseDoc().doc, systems: systemsDoc().doc, shop: boundShopDoc().doc, everything: everything() }),
  );
}

/** what the corpus does not have: a look with all its layers, variable collections and modes, a style and a theme of
 *  its own, a kit, constraints, a motion and a trigger, an optimistic call, a region, a repeat over data, every part
 *  of the mock library */
function everything(): Doc {
  const shop = boundShopDoc().doc;
  const look = {
    opacity: 80,
    fills: [{ type: "linear", angle: 90, stops: [{ color: "#ffffff", at: 0 }, { color: "#000000", at: 100 }] }],
    stroke: { width: 2, color: "#112233", sides: { t: 1, r: 0, b: 1, l: 0 } },
    shadows: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#00000033" }],
    filter: { sepia: 10 },
    transform: { scaleX: 1.2 },
    text: { color: "#333333", size: 14, shadows: [{ x: 1, y: 1, blur: 0, spread: 0, color: "#ffffff" }], stroke: { width: 1, color: "#000000" }, gradient: { type: "linear", stops: [{ color: "#ff0000", at: 0 }, { color: "#0000ff", at: 100 }] } },
    texture: { kind: "dots", opacity: 20 },
    vars: { opacity: "fade" },
  };
  const item = (id: string, extra: Record<string, unknown>) => ({ id, kind: "component", component: "button", label: "Go", icon: null, variant: "filled", props: { label: "Go" }, ...extra });
  return {
    ...shop,
    theme: { dark: false, bothModes: true, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" },
    vars: [
      { id: "fade", name: "fade", type: "number", value: 50, collection: "c1", modes: { light: 50, dark: 80 } },
      { id: "night", name: "night", type: "bool", value: false, drives: "dark" },
    ],
    varCollections: [{ id: "c1", name: "Theme", modes: [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }], dark: "dark" }],
    collections: [{ id: "fruit", name: "Fruit", fields: ["name"], rows: [["Apple"]] }],
    componentSets: [{ id: "set", name: "Set", props: [{ name: "State", values: ["Rest", "Down"] }] }],
    styles: [{ key: "custom:mine", name: { zh: "我的", en: "Mine", ja: "Mine", ko: "Mine" }, extends: "ios", rules: [] }] as unknown as Doc["styles"],
    groups: [
      ...shop.groups,
      {
        id: "eg1",
        x: 0,
        y: 0,
        axis: "y",
        kit: { slug: "list-row", variant: "plain", auto: true, sig: "abc" },
        showWhen: { expr: "true" },
        repeat: { data: "data.products", limit: 3 },
        states: { source: "products", emptyWhen: "data.products.length == 0" },
        items: [
          item("e1", {
            look,
            constraints: { h: "left", v: "top" },
            action: {
              to: "none",
              transition: "none",
              trigger: { on: "delay", ms: 300 },
              motion: { kind: "push", dir: "left", easing: "out", ms: 300 },
              when: { var: "night", op: "eq", value: true },
              else: { to: "none", effects: [{ do: "toggleVar", var: "night" }] },
              effects: [
                // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
                { do: "call", operationId: "listProducts", optimistic: { source: "products", remove: true }, then: { to: "none", effects: [{ do: "snackbar", message: "ok" }] }, catch: { to: "none" } },
                { do: "setVar", var: "fade", value: 1 },
                { do: "refresh", source: "products" },
                { do: "submit" },
                { do: "signOut" },
              ],
            },
          }),
        ],
      },
    ] as Doc["groups"],
    mocks: {
      ...shop.mocks,
      latency: { min: 10, max: 20 },
      realtime: [{ id: "s1", channel: "chat", trigger: { on: "connect" }, steps: [{ at: 0, message: "hello", payload: { text: "hi" } }], repeat: { every: 1000, times: 2 } }],
      routes: [{ operationId: "listProducts", kind: "list", model: "Product" }],
    },
  } as Doc;
}

describe("the helpers", () => {
  it("add after the fields known what is not one of them, and only that", () => {
    const known = fields("a", "b");
    const built = { a: 1 };
    expect(withUnknown({ a: 9, b: "wrong", c: 3 }, built, known)).toEqual({ a: 1, c: 3 });
    expect(Object.keys(withUnknown({ c: 3, a: 9 }, built, known))).toEqual(["a", "c"]);
    expect(withUnknown({ a: 9 }, built, known)).toBe(built);
    expect(unknownFields({ a: 1, z: 2 }, known)).toEqual(["z"]);
  });

  it("keep a key such as __proto__ as a field, not a prototype", () => {
    const raw = JSON.parse('{"a":1,"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const out = withUnknown(raw, { a: 1 }, fields("a"));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out)).toEqual(["a", "__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("a field this version does not know, at any level", () => {
  const docs = documents();

  for (const [name, doc] of Object.entries(docs)) {
    for (const seed of [1, 2, 3]) {
      it(`survives the project file, the store, the browser's copy and a link: ${name}, seed ${seed}`, async () => {
        const base = openProject(JSON.parse(serializeProject(doc).text))!;
        expect(base).not.toBeNull();
        const { doc: future, planted } = plant(base, seed);
        expect(planted.length).toBeGreaterThan(20);
        const text = serializeProject(future).text;

        /* the project file: read and written again, byte for byte */
        const read = parseProject(text)!.doc;
        expectKept(read, planted, "project file");
        expect(serializeProject(read).text).toBe(text);
        expect(serializeProject(read, { assets: "files" }).text).toBe(serializeProject(future, { assets: "files" }).text);

        /* the editor's store: opened as a file, loaded as the browser's copy, undone and redone over */
        const store = new DocStore(stateOf({ groups: [], frames: [] }));
        store.replace(JSON.parse(text));
        expectKept(savedDoc(store.get()), planted, "store, opened");
        /* saved from the store and opened again, it writes the same bytes */
        const once = serializeProject(savedDoc(store.get())).text;
        const again = new DocStore(stateOf({ groups: [], frames: [] }));
        again.replace(JSON.parse(once));
        expect(serializeProject(savedDoc(again.get())).text).toBe(once);
        const loaded = new DocStore(stateOf({ groups: [], frames: [] }));
        loaded.load(read, true);
        expectKept(savedDoc(loaded.get()), planted, "store, loaded");

        /* the browser's copy: large pictures kept apart and put back */
        const { doc: light, found } = stripAssets(savedDoc(loaded.get()));
        expectKept(restoreAssets(JSON.parse(JSON.stringify(light)), found), planted, "browser's copy");

        /* a link that carries everything */
        const link = await shareLink(read, "https://x.test/");
        const back = (await readShareLink(new URL(link).hash)).doc!;
        expectKept(back, planted.filter((p) => !p.path.includes("noteHistory")), "share link");
      });
    }
  }

  it("leaves a document that holds none byte for byte as it was", () => {
    for (const doc of Object.values(docs)) {
      const text = serializeProject(openProject(JSON.parse(serializeProject(doc).text))!).text;
      expect(serializeProject(parseProject(text)!.doc).text).toBe(text);
    }
  });

  it("is kept at the top of the document and of its envelope's document through a store that is reset", () => {
    const store = new DocStore(stateOf({ groups: [], frames: [] }));
    store.replace({ format: "m3e-project", version: 2, document: { groups: [], frames: [], futureSection: { a: 1 } } });
    expect(savedDoc(store.get())).toMatchObject({ futureSection: { a: 1 } });
    store.replace({ groups: [], frames: [], other: true });
    expect(savedDoc(store.get())).not.toHaveProperty("futureSection");
    expect(savedDoc(store.get())).toMatchObject({ other: true });
    store.undo();
    expect(savedDoc(store.get())).toMatchObject({ futureSection: { a: 1 } });
    expect(savedDoc(store.get())).not.toHaveProperty("other");
  });

  it("is kept by an effect of a kind this version does not know, which every runtime skips", () => {
    const doc = openProject({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ id: "b", kind: "component", component: "button", label: "B", icon: null, variant: "filled", action: { to: "none", effects: [{ do: "invoke", capability: "pay", args: { amount: "1" } }, { do: "show", part: "b" }] } }] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }] })!;
    expect(doc.groups[0].items[0].action!.effects).toEqual([{ do: "invoke", capability: "pay", args: { amount: "1" } }, { do: "show", part: "b" }]);
  });
});
