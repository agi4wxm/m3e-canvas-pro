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
