import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { proofDoc, systemsDoc } from "./exportProject.fixture";
import { buildProject, type ProjectFiles } from "./exportProject";
import { printRnApp } from "./export/rn/app";
import { setGlobalLang } from "./i18n";
import { openProject } from "./project";
import { makeItem, type Doc } from "./tokens";

/* An exported project is code someone installs and runs, so a document's words must never come out as code: whatever
 * a field holds, it is printed as a string, a JSX text or a comment's words. Every text field of real documents is
 * given words with each character that ends a string or an expression (quotes, backticks and `${`, braces, comment
 * ends, line breaks and separators, backslashes), each next to a marker name, and the project's sources are read back:
 * they still parse, and no marker is a name in the code. */

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

/** words that try to end whatever they are printed in; each carries a marker that would be a name if it got out */
const ENDINGS = [`"+markA+"`, `'+markB+'`, "`+markC+`${markD}", "{markE}", "*/markF/*", "\nmarkG//", "\u2028markH//", '\\"+markI//'];
const WORDS = ENDINGS.join(" ");
const MARK = /^mark[A-I]$/;

/** keys whose strings name something (an id, a part, a kind) rather than say something */
const NAMING = new Set(["id", "to", "var", "part", "component", "slug", "inFlow", "instanceOf", "collection", "frame", "paletteKey", "variant", "kind", "type", "do", "op", "axis", "transition", "set", "variantOf", "on", "trigger", "key", "style", "font", "displayFont", "icons", "shape", "motion", "contrast", "dark", "drives", "pane", "expandedFrom", "src", "image", "backgroundImage", "mode", "layout", "surface", "align", "justify", "size", "place", "bg", "fill", "textColor", "color", "url"]);

/** every string of a document that says something, with the words added */
function withWords<T>(v: T, key = ""): T {
  if (typeof v === "string") return (NAMING.has(key) || /^[a-z]+(-[a-z]+)*$/.test(v) ? v : `${v}${WORDS}`) as T;
  if (Array.isArray(v)) return v.map((x) => withWords(x, key)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, NAMING.has(k) ? x : withWords(x, k)])) as T;
  return v;
}

/** the markers that came out as names in a TypeScript source, or why it cannot be read as code */
function codeNames(path: string, text: string): string[] {
  let ast: unknown;
  try {
    ast = parse(text, { sourceType: "module", plugins: ["typescript", ...(path.endsWith(".tsx") ? (["jsx"] as const) : [])] });
  } catch (e) {
    /* a source the words broke is not the code it was meant to be */
    return [`${path}: ${e instanceof Error ? e.message : String(e)}`];
  }
  const out: string[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; name?: unknown; start?: number };
    if ((node.type === "Identifier" || node.type === "JSXIdentifier") && typeof node.name === "string" && MARK.test(node.name)) out.push(`${path}: ${node.name} at ${node.start}`);
    for (const [k, v] of Object.entries(n)) if (!["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(k)) visit(v);
  };
  visit(ast);
  return out;
}

async function escapesOf(doc: Doc, opened: Doc | null = openProject(JSON.parse(JSON.stringify(withWords(doc))))): Promise<string[]> {
  expect(opened).toBeTruthy();
  const { files } = await buildProject(opened!, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
  const written = Object.entries(files as ProjectFiles).filter(([p, v]) => typeof v === "string" && /\.(ts|tsx)$/.test(p) && !/^src\/(components|lib|styles)\//.test(p)) as [string, string][];
  /* the words reached the files written from the document */
  expect(written.some(([, v]) => v.includes("markA"))).toBe(true);
  return written.flatMap(([p, v]) => codeNames(p, v));
}

describe("a document's words in the exported project", () => {
  it("never come out as code in the proof document", async () => {
    expect(await escapesOf(proofDoc().doc)).toEqual([]);
  }, 120_000);

  it("never come out as code in the document of every system (components, variables, prototype)", async () => {
    expect(await escapesOf(systemsDoc().doc)).toEqual([]);
  }, 120_000);

  /* What names something rather than saying it (an id, a mode, an animation's kind, a CSS variable's name) is left
     alone above. Here every one of those is hostile too, read back from a file and also as the editor's own state may
     hold it, unchecked: the prototype's moves, triggers, overlays and scroll targets, flows, collections and their
     modes, variables and their values in each mode, and the CSS variables of bound fields. */
  it("never come out as code from what the prototype, flows and variables in modes name", async () => {
    const raw = hostileDoc();
    expect(await escapesOf(raw, openProject(JSON.parse(JSON.stringify(raw))))).toEqual([]);
    expect(await escapesOf(raw, raw)).toEqual([]);
  }, 120_000);
});

/* The React Native app (lib/export/rn) prints the same documents again, as screens on the kit: the same words must come
   out as strings there too, whatever part they are in, whatever tap or name carries them. */
async function rnEscapesOf(doc: Doc | null): Promise<string[]> {
  expect(doc).toBeTruthy();
  const { files } = await printRnApp(doc!, {});
  const written = files.filter((f) => f.kind === "generated" && /\.(ts|tsx)$/.test(f.path));
  expect(written.some((f) => f.text.includes("markA"))).toBe(true);
  return written.flatMap((f) => codeNames(f.path, f.text));
}

describe("a document's words in the React Native screens", () => {
  it("never come out as code in the proof document", async () => {
    expect(await rnEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(proofDoc().doc)))))).toEqual([]);
  }, 120_000);

  it("never come out as code in the document of every system", async () => {
    expect(await rnEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(systemsDoc().doc)))))).toEqual([]);
  }, 120_000);

  it("never come out as code from what the prototype and the variables name", async () => {
    expect(await rnEscapesOf(hostileDoc())).toEqual([]);
  }, 120_000);
});

/** a document whose every id, mode, name and value of the prototype and the variables carries words that try to end what they are printed in */
function hostileDoc(): Doc {
  const w = (s: string) => `${s}${WORDS}`;
  const theme = w("c");
  const [light, dark] = [w("m1"), w("m2")];
  const look = { fills: [{ type: "solid", color: "#ffffff", cssVar: w("x") }], text: { color: "#000000", cssVar: w("y") }, stroke: { width: 1, color: "#000000", cssVar: w("z") }, vars: { opacity: w("o"), rotate: w("r"), radius: w("q") } };
  const button = (id: string, action: unknown) => ({ id: w(`g${id}`), x: 16, y: 40 + Number(id) * 60, axis: "x", items: [{ ...makeItem("button"), id: w(id), props: { label: w("Go"), icon: "" }, action }] });
  return {
    groups: [
      button("1", { to: w("f2"), transition: w("slide"), overlay: true, motion: { kind: w("push"), dir: w("up"), easing: w("in"), ms: w("5") }, trigger: { on: "delay", ms: w("9") } }),
      button("2", { to: w("f2"), transition: "slide", overlay: w("yes"), motion: { kind: "push", dir: w("up"), easing: w("in"), ms: 300 }, trigger: { on: "hover" } }),
      button("3", { to: "none", transition: "none", scrollTo: w("t"), trigger: { on: w("hover") } }),
      button("4", { to: "none", transition: "none", effects: [{ do: "setVar", var: w("v1"), value: "#ff0000" }, { do: "setVar", var: w("v2"), value: w("set") }, { do: "toggleVar", var: w("v4") }] }),
      { id: w("gt"), x: 16, y: 400, axis: "x", items: [{ ...makeItem("text"), id: w("t"), props: { text: w("Hi") }, look, bind: { "@text": w("v1"), "@stroke": w("v1"), "@fill": w("v1"), "@opacity": w("v3"), "@radius": w("v3"), "@rotation": w("v3"), text: w("v2") } }] },
    ],
    frames: [
      { id: w("f1"), name: w("Home"), x: 0, y: 0, flow: w("Main"), varModes: { [theme]: dark } },
      { id: w("f2"), name: w("Sheet"), x: 600, y: 0, w: 320, h: 240, flow: w("Second") },
    ],
    vars: [
      { id: w("v1"), name: w("brand"), type: "color", value: "#ffffff", collection: theme, modes: { [dark]: "#000000" } },
      { id: w("v2"), name: w("words"), type: "text", value: w("hello"), collection: theme, modes: { [dark]: w("bye") } },
      { id: w("v3"), name: w("size"), type: "number", value: 4, collection: theme, modes: { [dark]: 8 } },
      { id: w("v4"), name: w("night"), type: "bool", value: false, drives: "dark" },
    ],
    varCollections: [{ id: theme, name: w("Theme"), modes: [{ id: light, name: w("Light") }, { id: dark, name: w("Dark") }], dark }],
    varModes: { [theme]: light },
    paletteKey: "purple",
    frame: "phone",
    title: w("Hostile"),
    brief: "",
  } as unknown as Doc;
}

/* ---------- the product (lib/export) ---------- */

/** a contract whose every name, path, parameter and example carries words that try to end what they are printed in:
 *  operations, paths, path and query parameters, models and their properties, security schemes, realtime channels
 *  and their messages; summaries and descriptions also carry what a comment would read as a directive */
function hostileApi() {
  const w = (s: string) => `${s}${WORDS}`;
  const directive = (s: string) => `@ts-nocheck ${w(s)} eslint-disable`;
  const X = { $ref: `#/components/schemas/${w("X")}` };
  const op = (id: string, extra: Record<string, unknown> = {}) => ({
    operationId: w(id),
    summary: directive("s"),
    description: w("d"),
    security: [{ [w("auth")]: [w("scope")] }],
    responses: { "200": { description: w("ok"), content: { "application/json": { schema: X, example: { [w("k")]: w("v") } } } }, [w("4XX")]: { description: w("bad") } },
    ...extra,
  });
  return {
    openapi: {
      openapi: "3.1.0",
      info: { title: w("T"), version: w("1") },
      servers: [{ url: w("http://x"), "x-m3e-env": "dev", "x-m3e-realtime": `ws://localhost/${w("rt")}` }],
      paths: {
        [`/a/{${w("id")}}`]: { get: op("get"), post: op("post", { requestBody: { content: { "application/json": { schema: { type: "object", properties: { [w("p")]: { type: "string", pattern: w("(") } }, required: [w("p")] } } } } }) },
        [`/b"+markA+"/{x}`]: { delete: op("del"), put: op("put", { parameters: [{ name: w("q"), in: "query", schema: { type: "integer", minimum: 1, description: w("q") } }, { name: w("h"), in: "header", required: true }] }) },
        [`/c/{${w("id")}}/up`]: {
          post: op("up", {
            "x-m3e-pagination": { style: "cursor", items: w("items"), nextField: w("next"), cursorParam: w("c"), limitParam: w("l") },
            requestBody: { content: { [`multipart/form-data`]: { schema: { type: "object", properties: { [w("f")]: { type: "string", format: "binary" } } }, encoding: { [w("f")]: { contentType: w("image/png") } } } } },
          }),
        },
        "/ok": { get: op("") },
        /* paths that keep their words (a path with a space is no path): a parameter, a template, a wildcard */
        [`/d/{id${ENDINGS[0]}}`]: { post: op("d", { requestBody: { required: true, content: { "application/json": { schema: X } } } }) },
        [`/e/${ENDINGS[2]}/{x}`]: { get: op("e") },
        [`/f/${ENDINGS[4]}`]: { get: op("f") },
      },
      components: {
        schemas: { [w("X")]: { type: "object", description: w("x"), properties: { [w("prop")]: { type: "string", format: w("fmt"), enum: [w("e")] }, ["__proto__"]: { type: "string" } } } },
        securitySchemes: { [w("auth")]: { type: "apiKey", in: "header", name: w("X-Key") }, [w("bear")]: { type: "http", scheme: w("bearer") } },
      },
    },
    asyncapi: {
      asyncapi: "3.0.0",
      info: { title: w("T"), version: "1" },
      channels: {
        [w("ch")]: { address: `/r/{${w("room")}}`, description: directive("c"), messages: { [w("m")]: { payload: { type: "object", properties: { [w("t")]: { type: "string" } }, required: [w("t")] } } } },
        [w("sse")]: { address: w("/s"), "x-m3e-transport": "sse", messages: { [w("n")]: { payload: X } } },
      },
      operations: {
        [w("o1")]: { action: "send", channel: { $ref: `#/channels/${encodeURIComponent(w("ch")).replace(/~/g, "~0")}` } },
        [w("o2")]: { action: "receive", channel: { $ref: `#/channels/${encodeURIComponent(w("ch")).replace(/~/g, "~0")}` } },
      },
    },
    types: "",
  };
}

/** the markers of a source that stand anywhere but in a string, a template's text or a comment */
function markersInLiteralsOnly(path: string, text: string): string[] {
  const ast = parse(text, { sourceType: "module", plugins: ["typescript"] }) as unknown as { comments: { start: number; end: number }[] };
  const ranges: [number, number][] = ast.comments.map((c) => [c.start, c.end]);
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; start?: number; end?: number };
    if ((node.type === "StringLiteral" || node.type === "TemplateElement" || node.type === "DirectiveLiteral") && node.start !== undefined && node.end !== undefined) ranges.push([node.start, node.end]);
    for (const [k, v] of Object.entries(n)) if (!["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(k)) visit(v);
  };
  visit(ast);
  const out: string[] = [];
  /* a marker inside a longer identifier is a name the export made of the words' letters and digits (identifierOf) */
  for (const m of text.matchAll(/(?<![\w$])mark[A-I](?![\w$])/g)) if (!ranges.some(([a, b]) => m.index! >= a && m.index! < b)) out.push(`${path}: ${m[0]} at ${m.index}`);
  return out;
}

/** the comments of a source that carry words of the contract, and every comment that reads as a directive */
function commentsOf(text: string): { type: string; value: string }[] {
  return (parse(text, { sourceType: "module", plugins: ["typescript"] }) as unknown as { comments: { type: string; value: string }[] }).comments;
}

/** the npm names npm accepts */
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

describe("a document's and a contract's words in the exported product", () => {
  it("never come out as code, a path, a package name or YAML structure", async () => {
    const { buildProduct } = await import("./export/product");
    const doc = openProject(JSON.parse(JSON.stringify(withWords(systemsDoc().doc))))!;
    doc.frames = doc.frames.map((f, i) => ({ ...f, name: i ? `../../${f.name}` : `CON ${WORDS}` }));
    const product = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", api: hostileApi() });
    const paths = Object.keys(product.files);
    /* every path is plain ASCII the export chose: no word of the document or the contract names a file or a folder */
    for (const p of paths) expect(p, p).toMatch(/^[A-Za-z0-9._/-]+$/);
    for (const p of paths) expect(p.split("/"), p).not.toContain("..");
    /* the code the export writes (not the editor's copied components) parses, and no marker is a name in it */
    const code = paths.filter((p) => /\.(ts|tsx|js|mjs)$/.test(p) && !/^apps\/web\/src\/(components|lib|hooks|styles)\//.test(p));
    expect(code.some((p) => (product.files[p].body as string).includes("markA"))).toBe(true);
    const escapes = code.flatMap((p) => codeNames(p.endsWith(".mjs") ? `${p}.js` : p, product.files[p].body as string));
    expect(escapes).toEqual([]);
    /* package names */
    for (const p of paths.filter((x) => x.endsWith("package.json"))) {
      const pkg = JSON.parse(product.files[p].body as string) as { name: string; workspaces?: string[] };
      expect(pkg.name, p).toMatch(NPM_NAME);
    }
    /* route paths */
    const routes = product.files["apps/web/src/generated/routes.ts"].body as string;
    for (const m of routes.matchAll(/: ("[^"]*"),$/gm)) expect(JSON.parse(m[1]), m[1]).toMatch(/^\/[a-z0-9-]+$/);
    /* the YAML: every line a key and a value, the markers only ever inside a quoted string */
    for (const file of ["packages/api/openapi.yaml", "packages/api/asyncapi.yaml"]) {
      for (const line of (product.files[file].body as string).split("\n").filter(Boolean)) {
        const bare = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
        expect(bare, line).toMatch(/^ *(- )?([A-Za-z_][A-Za-z0-9_-]*|""):?( ("")|( -?[0-9.]+)| true| false| null| \[\]| \{\})?$|^ *- ""$/);
        expect(bare).not.toContain("mark");
      }
    }
    /* the JSON files read back as JSON */
    for (const p of paths.filter((x) => x.endsWith(".json"))) expect(() => JSON.parse(product.files[p].body as string), p).not.toThrow();

    /* the server and its contract tests: the contract's words reached them (the stubs show the contract in comments) */
    const backEnd = code.filter((p) => p.startsWith("server/") || p.startsWith("contract-tests/"));
    expect(backEnd.filter((p) => (product.files[p].body as string).includes("markA")).length).toBeGreaterThan(5);
    expect(paths.filter((p) => p.startsWith("server/src/handlers/")).length).toBeGreaterThanOrEqual(8);
    expect(product.warnings.some((x) => x.includes("cannot be routed"))).toBe(true);
    /* each marker is in a string, a template's text or a comment, never in the code between them */
    expect(backEnd.flatMap((p) => markersInLiteralsOnly(p.endsWith(".mjs") ? `${p}.js` : p, product.files[p].body as string))).toEqual([]);
    for (const p of backEnd) {
      for (const c of commentsOf(product.files[p].body as string)) {
        /* words of the contract only ever in line comments, and none of those reads as a directive */
        if (/mark[A-I]|@ts-nocheck/.test(c.value)) {
          expect(c.type, `${p}: ${c.value}`).toBe("CommentLine");
          expect(c.value, p).not.toMatch(/^\s*(@ts-|eslint|\/\s*<|global\b|prettier-ignore)/);
        }
        /* the only directive the export writes in the back end is its own */
        if (/^\s*(@ts-|eslint-)/.test(c.value)) expect(c.value.trim(), p).toBe("eslint-disable-next-line @typescript-eslint/no-explicit-any");
      }
    }
    /* the handler files are named by identifiers, and the server routes what it can and says what it cannot */
    for (const p of paths.filter((x) => x.startsWith("server/src/handlers/"))) expect(p, p).toMatch(/^server\/src\/handlers\/(channels\/)?[A-Za-z][A-Za-z0-9]*\.ts$/);
    expect(product.warnings.join("\n")).not.toMatch(/undefined|\[object/);
    /* a key JavaScript would read as the prototype stays a key: such data is parsed, not written as an object literal */
    expect(product.files["server/src/generated/contract.ts"].body as string).toMatch(/REQUEST_DEFINITIONS: Record<string, unknown> = JSON\.parse\(/);
    /* the realtime channels came through too, each with its own stub */
    expect(paths.filter((p) => p.startsWith("server/src/handlers/channels/")).length).toBe(2);
  }, 120_000);
});

/* The mini-program (lib/export/miniapp) prints the same documents a third time, as Taro pages on its kit, with the
   bindings a contract's screens carry (expressions, data sources, forms, calls) as strings the shared runtime reads:
   the same words, and those of a contract's operations, fields and paths, must come out as strings there too. */
async function miniEscapesOf(doc: Doc | null, api?: ReturnType<typeof hostileApi>): Promise<string[]> {
  expect(doc).toBeTruthy();
  const { buildProduct } = await import("./export/product");
  const { miniappTarget } = await import("./export/targets");
  const product = await buildProduct(doc!, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", targets: [miniappTarget], ...(api ? { api } : {}) });
  const written = Object.entries(product.files).filter(([p, f]) => f.kind === "generated" && /^apps\/miniapp\/src\/(generated\/|pages\/|app\.config\.ts)/.test(p) && /\.(ts|tsx)$/.test(p)) as [string, { body: string }][];
  expect(written.some(([, f]) => f.body.includes("markA"))).toBe(true);
  for (const [p, f] of Object.entries(product.files)) if (p.endsWith(".json")) expect(() => JSON.parse(f.body as string), p).not.toThrow();
  return written.flatMap(([p, f]) => codeNames(p, f.body));
}

describe("a document's words in the mini-program", () => {
  it("never come out as code in the proof document", async () => {
    expect(await miniEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(proofDoc().doc)))))).toEqual([]);
  }, 120_000);

  it("never come out as code in the document of every system", async () => {
    expect(await miniEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(systemsDoc().doc)))))).toEqual([]);
  }, 120_000);

  it("never come out as code from what the prototype and the variables name", async () => {
    expect(await miniEscapesOf(hostileDoc())).toEqual([]);
  }, 120_000);

  it("never come out as code from a contract's names, nor from the screens bound to one", async () => {
    expect(await miniEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(systemsDoc().doc)))), hostileApi())).toEqual([]);
    const { boundShopDoc } = await import("./export/product.fixture");
    expect(await miniEscapesOf(openProject(JSON.parse(JSON.stringify(withWords(boundShopDoc().doc)))))).toEqual([]);
  }, 120_000);
});
