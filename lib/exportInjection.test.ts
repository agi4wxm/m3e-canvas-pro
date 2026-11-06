import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { proofDoc, systemsDoc } from "./exportProject.fixture";
import { buildProject, type ProjectFiles } from "./exportProject";
import { setGlobalLang } from "./i18n";
import { openProject } from "./project";
import type { Doc } from "./tokens";

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

async function escapesOf(doc: Doc): Promise<string[]> {
  const opened = openProject(JSON.parse(JSON.stringify(withWords(doc))));
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
});
