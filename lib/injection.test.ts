import { parse } from "@babel/parser";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCode } from "./codegen";
import { buildProject, type ProjectFiles } from "./exportProject";
import { setGlobalLang } from "./i18n";
import { openProject, projectFile } from "./project";
import { PALETTES, makeItem, type Doc, type Group, type Item } from "./tokens";

/* A document is data from anywhere: a file, a shared link, a model. Whatever its words say, printed
 * code and an exported project hold them as words. Every hostile string below is fed through every
 * place a document's words reach code, and the code is then parsed: no `pwned` may come out as a
 * name the code calls or reads, and no element the document did not ask for may appear. */

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

/** what ends a comment, a string, a template, an expression, a line or a script, and what the printer marks with */
const PIECES = [
  `*/}{pwned()}{/*`,
  `}pwned(){`,
  "`${pwned()}`",
  "${pwned()}",
  `</script><script>pwned()</script>`,
  `"+pwned()+"`,
  `'+pwned()+'`,
  "a\nb\r\nc\td",
  " pwned()//",
  " pwned()//",
  "\\",
  "\\u2028",
  "pwned()",
  "pwned() x ",
  "",
  "",
  "flow",
  "@@flow@@",
  "&lt;b&gt; &amp; &#123;",
  `{{current.a"]; pwned(); //}}`,
  "{{current.name}}",
];
const HOSTILE = PIECES.join(" ");

const part = (id: string, slug: string, props: Record<string, unknown>, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
const at = (id: string, y: number, item: Item, more: Partial<Group> = {}): Group => ({ id, x: 16, y, axis: "x", items: [item], ...more });

function hostileDoc(): Doc {
  const stay = { to: "none" } as const;
  return {
    title: HOSTILE,
    brief: HOSTILE,
    frame: "phone",
    paletteKey: "custom",
    customPalette: { ...PALETTES[0], key: "custom", label: HOSTILE, seed: " pwned()//", primary: "#6750A4 pwned()//" },
    theme: { contrast: " pwned()//", motion: " pwned()//" } as never,
    frames: [
      { id: "f1", name: HOSTILE, x: 0, y: 0, bg: "surface bg-[url(https://evil.example/a.png)]" as never, note: HOSTILE },
      { id: "f2", name: `Two ${HOSTILE}`, x: 600, y: 0 },
    ],
    vars: [
      { id: "v1", name: HOSTILE, type: "text", value: HOSTILE },
      { id: "v2", name: "x = pwned(); //", type: "number", value: 3 },
    ],
    collections: [{ id: "c1", name: HOSTILE, fields: ["name", HOSTILE], rows: [[HOSTILE, HOSTILE], ["two", HOSTILE]] }],
    groups: [
      at("g-unknown", 20, { id: "unknown", kind: "component", component: "x */}{pwned()}{/* y", label: HOSTILE, icon: null, variant: "filled", note: HOSTILE }),
      at("g-text", 80, part("t", "text", { text: HOSTILE }), { name: HOSTILE }),
      at("g-current", 120, part("t-current", "text", { text: `{{current.name}} ${HOSTILE}` })),
      at(
        "g-button",
        160,
        part("b", "button", { label: HOSTILE }, {
          action: {
            ...stay,
            effects: [
              { do: "snackbar", message: HOSTILE },
              { do: "setVar", var: "v1", value: HOSTILE },
              { do: "setProp", part: "t", prop: "text", value: HOSTILE },
              { do: "toggle", part: "t" },
            ],
          },
        }),
      ),
      at("g-link", 220, part("b-link", "button", { label: "Link" }, { action: { to: "link", url: `https://x.test/"+pwned()+"${HOSTILE}` } })),
      at("g-current-link", 260, part("b-current-link", "button", { label: "Row link" }, { action: { to: "link", url: `{{current.${HOSTILE}}}` } })),
      at("g-go", 300, part("b-go", "button", { label: "Go" }, { action: { to: "f2", transition: HOSTILE } as never })),
      at("g-input", 340, part("in", "text-field", { label: HOSTILE, value: HOSTILE }, { bind: { value: "v1" } })),
      at("g-show", 400, part("t-show", "text", { text: "shown" }), { showWhen: { var: "v1", op: "eq", value: HOSTILE } as never }),
      at(
        "g-nav",
        700,
        part("nav", "navigation-bar", {
          items: [
            { label: HOSTILE, icon: { $raw: "pwned()" } },
            { label: "Two", icon: { type: "iframe", props: { srcDoc: "<script>pwned()</script>" } }, variant: { $raw: "pwned()" } },
            { label: "Three", icon: "home", image: { $raw: "pwned()" } },
          ],
        }, { actions: { "tab:1": { ...stay, effects: [{ do: "snackbar", message: HOSTILE }] } } }),
      ),
      at("g-box", 460, part("box", "box", { layout: "column", surface: "card", hugWidth: true, hugHeight: true, width: 200, height: 100 }), { name: HOSTILE }),
      { id: "g-in-box", x: 0, y: 0, axis: "x", inFlow: "g-box", items: [part("t-in-box", "text", { text: HOSTILE })] },
      at("g-rows", 560, part("rows", "box", { layout: "column", surface: "none" }), { repeat: { collection: "c1" } }),
      { id: "g-row", x: 0, y: 0, axis: "x", inFlow: "g-rows", items: [part("t-row", "text", { text: `{{name}} ${HOSTILE}` }, { action: { to: "f2" } })] },
      at("g-svg", 640, part("art", "svg", { mode: "markup", label: HOSTILE, markup: `<svg viewBox="0 0 10 10"><linearGradient id="g&quot;}{pwned()}"/><rect fill="url(&quot;https://evil.example/x'y#g&quot;)" width="1" height="1"/><text>${HOSTILE.replace(/</g, "&lt;")}</text></svg>` })),
    ],
  };
}

type AstNode = { type: string; name?: unknown; [key: string]: unknown };

/** every node of a syntax tree, comments left out */
function* nodesOf(node: unknown): Generator<AstNode> {
  if (Array.isArray(node)) {
    for (const n of node) yield* nodesOf(n);
    return;
  }
  if (!node || typeof node !== "object") return;
  const n = node as AstNode;
  if (typeof n.type === "string") yield n;
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "leadingComments" && k !== "trailingComments" && k !== "innerComments" && k !== "comments" && k !== "extra") yield* nodesOf(v);
}

/** Parses source as TSX (throwing on anything that does not parse) and says what in it is code of the
 *  document's making: the name `pwned` read or called (a name the printer makes of the words, letters only, is its own), or an element the printer never writes. */
function codeFromWords(source: string, file: string): string[] {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"], sourceFilename: file });
  const found: string[] = [];
  for (const n of nodesOf(ast.program)) {
    if ((n.type === "Identifier" || n.type === "JSXIdentifier") && typeof n.name === "string" && /^(pwned|script|iframe)$/.test(n.name)) found.push(`${file}: ${n.type} ${n.name}`);
  }
  return found;
}

/** the files an export writes for the document itself, rather than copies of the editor's */
const written = (files: ProjectFiles) => Object.keys(files).filter((p) => /^src\/(screens\/.*|App|runtime|theme|main|style-icons)\.tsx?$/.test(p) || p === "src/components/m3e/icon-data.app.ts");

describe("a document's words in printed code", () => {
  it("stay words in copied code, however they are written", () => {
    for (const doc of [hostileDoc(), openProject(JSON.parse(JSON.stringify(projectFile(hostileDoc()))))!]) {
      const { code } = buildCode(doc, {});
      expect(codeFromWords(code, "copied.tsx")).toEqual([]);
      /* the header is comments, each one line, and says nothing the document made up */
      for (const line of code.split("\n").filter((l) => l.startsWith("//"))) expect(line).not.toMatch(/pwned/);
      expect(code).toContain("unknown component");
      expect(code).not.toMatch(/evil\.example|bg-\[url/);
    }
  });

  it("stay words in an exported project, from a file or straight from the editor", async () => {
    for (const doc of [openProject(JSON.parse(JSON.stringify(projectFile(hostileDoc()))))!, hostileDoc()]) {
      const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
      const paths = written(files);
      expect(paths).toEqual(expect.arrayContaining(["src/App.tsx", "src/runtime.tsx", "src/theme.tsx", "src/main.tsx"]));
      expect(paths.some((p) => p.startsWith("src/screens/"))).toBe(true);
      for (const path of paths) expect(codeFromWords(files[path] as string, path)).toEqual([]);
      /* the page has its one script, and the title is text in it */
      const html = files["index.html"] as string;
      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html).not.toMatch(/<script>pwned/);
      /* the readme's title is one heading line */
      expect((files["README.md"] as string).split("\n")[0]).toMatch(/^# [^\n]*$/);
      expect((files["README.md"] as string).split("\n")[1]).toBe("");
      for (const css of ["src/index.css", "src/style.css"]) if (files[css]) expect(files[css] as string).not.toMatch(/evil|pwned/);
      expect(files["src/theme.tsx"] as string).toMatch(/primary: "#[0-9A-Fa-f]{6}"/);
    }
  }, 60_000);

  it("keep the words themselves, only escaped", () => {
    const { code } = buildCode(hostileDoc(), {});
    /* the words are there as data: a string of them, with what JSX would read as an entity kept as typed */
    expect(code).toContain("*/}{pwned()}{/*");
    expect(code).toContain("&lt;b&gt; &amp; &#123;");
    /* and the printer's own marks are gone from them */
    expect(code).not.toMatch(/[-]/);
  });
});
