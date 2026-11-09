import { createElement } from "react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isProject } from "../lib/project";
import { makeItem, type Doc } from "../lib/tokens";
import { setGlobalLang } from "../lib/i18n";
import { COMPONENTS, loadAllModules, modulesOf } from "./components";
import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, type PNode, type PValue } from "./node";
import { applyAppearance } from "./appearance";
import { CATEGORIES, CATEGORY_TIER, PARTS, defaultValues, partBySlug, reader, tierOf, treeOf } from "./registry";
import { KITS } from "./kits";
import { renderNode } from "./render";
import { WIDGET_SOURCES } from "./widgets/sources";
import { WIDGET_MODULES } from "./widgets/modules";

/* The contract every part keeps (docs/组件规范.md), checked for all of them: a new part is
 * covered the moment it is in PARTS, with no test of its own to write. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

/** the component names a tree uses, in its children and in its props */
function componentsIn(node: PNode, into = new Set<string>()) {
  if (/^[A-Z]/.test(node.type)) into.add(node.type);
  const visit = (v: PValue): void => {
    if (isNode(v)) componentsIn(v, into);
    else if (Array.isArray(v)) v.forEach(visit);
  };
  Object.values(node.props ?? {}).forEach(visit);
  for (const c of node.children ?? []) if (typeof c !== "string") componentsIn(c, into);
  return into;
}

const draw = (slug: string, props?: Record<string, unknown>) => renderToStaticMarkup(createElement("div", null, renderNode(treeOf(partBySlug(slug)!, props))));

/** a value of the wrong type for every prop: a file edited by hand, or saved by another version */
const WRONG = [null, 7, "nope", true, [], {}, [{}], { columns: "x", rows: 1 }, { columns: ["a"], rows: [null, [1], "x"] }, { columns: [], rows: [] }];

const dir = new URL("./", import.meta.url);
const sourceFiles = (sub: string) => readdirSync(new URL(`${sub}/`, dir)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map((f) => ({ name: f, text: readFileSync(new URL(`${sub}/${f}`, dir), "utf8") }));

describe("the palette", () => {
  it("files every part it offers under a section, each by what the part is for", () => {
    for (const d of PARTS) expect(CATEGORIES as readonly string[], d.slug).toContain(d.category);
    for (const c of CATEGORIES) expect(PARTS.filter((d) => d.category === c).length, c).toBeGreaterThan(0);
  });

  it("puts every section in one tier, the atoms first", () => {
    for (const c of CATEGORIES) expect(["atom", "composite"], c).toContain(CATEGORY_TIER[c]);
    const tiers = CATEGORIES.map((c) => CATEGORY_TIER[c]);
    expect(tiers.indexOf("composite")).toBeGreaterThan(0);
    expect(tiers.slice(tiers.indexOf("composite"))).not.toContain("atom");
    /* among the atoms only the box holds other parts: anything else that does is made of more than itself */
    for (const d of PARTS.filter((x) => tierOf(x) === "atom")) expect(!!d.holds && d.slug !== "box", d.slug).toBe(false);
  });

  it("files every kit under a composite section, beside the parts there", () => {
    for (const k of KITS) {
      expect(CATEGORIES as readonly string[], k.slug).toContain(k.category);
      expect(tierOf(k), k.slug).toBe("composite");
      expect(partBySlug(k.slug), `${k.slug} takes a part's id`).toBeUndefined();
    }
    expect(new Set(KITS.map((k) => k.slug)).size).toBe(KITS.length);
  });

  it("offers each thing once: no two parts or kits by the same name in one section", () => {
    for (const c of CATEGORIES) {
      const names = [...PARTS.filter((d) => d.category === c).map((d) => d.name), ...KITS.filter((k) => k.category === c).map((k) => k.name)];
      expect(new Set(names).size, c).toBe(names.length);
    }
  });
});

describe("every part", () => {
  it("has a plain id of its own", () => {
    for (const d of PARTS) expect(d.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(new Set(PARTS.map((d) => d.slug)).size).toBe(PARTS.length);
  });

  it("is plain data: its definition loads no React", () => {
    for (const { name, text } of sourceFiles("defs")) {
      const imports = [...text.matchAll(/^import (?!type )[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
      /* the look's traits (kits/types) are plain functions of a look, so a split composes by the same ones a kit does */
      /* the field states and the accessible names are plain data and plain functions too (parts/fieldState.ts, parts/a11y.ts),
         and so is the mark on the control that holds an input (parts/inputNode.ts) */
      for (const from of imports) expect(from, `defs/${name} imports ${from}`).toMatch(/^\.\.\/(node|labels|types|flow|atoms|svg|kits\/types|fieldState|a11y|tables|inputNode|color|rows)$/);
    }
  });

  it("draws every component it names with something that exists", () => {
    for (const d of PARTS)
      for (const name of componentsIn(treeOf(d, defaultValues(d)))) {
        expect(COMPONENTS[name], `${d.slug}: ${name}`).toBeTruthy();
        expect(FILE_OF[name] ?? EXTERNAL[name] ?? WIDGET_SOURCES[name], `${d.slug}: ${name} has nowhere to be imported from`).toBeTruthy();
      }
  });

  it("draws from its defaults", () => {
    for (const d of PARTS) {
      const out = draw(d.slug, defaultValues(d));
      expect(out, d.slug).not.toMatch(/undefined|\[object|did not load/);
    }
  });

  it("draws whatever a saved prop holds", () => {
    for (const d of PARTS)
      for (const p of d.props)
        for (const wrong of WRONG) expect(() => draw(d.slug, { [p.key]: wrong }), `${d.slug}.${p.key} = ${JSON.stringify(wrong)}`).not.toThrow();
    /* every prop of every part ten times over: its time grows with the catalog */
  }, 30000);

  it("takes a fill, a text color and corners, unless it has no surface of its own to paint", () => {
    /* a progress mark and a skeleton read through their own motion; a snackbar is the toast library's,
     * on the theme's inverse role; the rest paint themselves from their own props */
    const noSurface = new Set(["progress", "circular-progress", "loading-indicator", "spinner", "skeleton", "sonner", "icon", "container", "shape", "image"]);
    const look = { fill: "tertiaryContainer", corners: { tl: 3, tr: 3, br: 3, bl: 3 } } as const;
    const painted = (n: PNode): boolean => String(n.props?.className ?? "").includes("bg-tertiary-container") && /3px/.test(String((n.props?.style as { borderRadius?: string } | undefined)?.borderRadius)) ? true : (n.children ?? []).some((c) => typeof c !== "string" && painted(c));
    for (const d of PARTS) {
      if (noSurface.has(d.slug)) expect(d.appearance, `${d.slug} is listed as having no surface`).toBeUndefined();
      else {
        expect(d.appearance, `${d.slug} has no appearance`).toBeTruthy();
        const tree = (d.view ?? d.tree)(reader(d, defaultValues(d)));
        expect(painted(applyAppearance(tree, look, d.appearance?.target)), `${d.slug}: nothing in its tree is what it paints`).toBe(true);
      }
    }
  });

  it("carries that look through a widget to what it draws", () => {
    for (const d of PARTS) {
      if (!d.appearance || !(treeOf(d, defaultValues(d)).type in WIDGET_SOURCES)) continue;
      const out = renderToStaticMarkup(createElement("div", null, renderNode(treeOf(d, defaultValues(d), { fill: "tertiaryContainer", corners: { tl: 3, tr: 3, br: 3, bl: 3 } }))));
      expect(out, d.slug).toContain("bg-tertiary-container");
      expect(out, d.slug).toContain("border-radius:3px");
    }
  });

  it("survives a save and an open with its values", () => {
    for (const d of PARTS) {
      const item = { ...makeItem(d.slug), props: defaultValues(d) };
      const doc = { groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
      const back = JSON.parse(JSON.stringify(doc));
      expect(isProject(back), d.slug).toBe(true);
      expect(back.groups[0].items[0].props).toEqual(defaultValues(d));
    }
  });
});

describe("one way of writing a part", () => {
  const widgets = sourceFiles("widgets");
  const defs = sourceFiles("defs");

  it("presses through Button or Tap, never a bare control", () => {
    for (const { name, text } of widgets) {
      if (name !== "Tap.tsx") expect(text, name).not.toMatch(/<button\b/);
      /* a file picker and a color well have no M3E counterpart: the browser's own is the control */
      if (name !== "ColorField.tsx" && name !== "Inputs.tsx") expect(text, name).not.toMatch(/<(input|select|textarea)\b/);
    }
    for (const { name, text } of defs) expect(text, name).not.toMatch(/h\("(button|input|select|textarea)"/);
  });

  it("colors by theme role, so a theme reaches every part", () => {
    /* words over a photo: its scrim and ink are the one place no theme role can answer for */
    const overPhoto = (text: string) => text.replace(/const SCRIM = \{[\s\S]*?\} as const;/, "").replace(/const (ink|body) = bg \? \(src \? "text-white[^\n]*/g, "");
    for (const { name, text } of [...widgets, ...defs]) expect(overPhoto(text), name).not.toMatch(/\b(text|bg|border|fill|stroke)-(white|black|gray|red|green|blue|yellow|slate|zinc|neutral|stone)\b|\b(text|bg|border)-\[#/);
    for (const { name, text } of widgets) if (!["ColorField.tsx", "Inputs.tsx"].includes(name)) expect(text, name).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe("the widgets", () => {
  it("are all used by a part", () => {
    /* the frame a field state draws around an input is used once a state is on */
    const states = { disabled: true, readOnly: true, required: true, loading: true, error: true, errorText: "Required" };
    const used = new Set(PARTS.flatMap((d) => [...componentsIn(treeOf(d, defaultValues(d))), ...(d.field ? componentsIn(treeOf(d, { ...defaultValues(d), ...states })) : [])]));
    for (const name of Object.keys(WIDGET_SOURCES)) expect(used.has(name), `${name} is not used`).toBe(true);
  });

  it("do not take a name shadcn M3E or Recharts already has", () => {
    for (const name of Object.keys(WIDGET_SOURCES)) {
      expect(FILE_OF[name], name).toBeUndefined();
      expect(EXTERNAL[name], name).toBeUndefined();
    }
  });

  it("all arrive when loaded, from the file printed code names", async () => {
    await loadAllModules();
    for (const [name, from] of Object.entries(WIDGET_SOURCES)) {
      expect(COMPONENTS[name], name).toBeTruthy();
      const file = from.slice("@/components/widgets/".length);
      expect(existsSync(new URL(`widgets/${file}.tsx`, dir)), from).toBe(true);
      /* the canvas fetches it from the file the printed code imports it from */
      expect(WIDGET_MODULES[file], from).toBeTypeOf("function");
      expect(modulesOf({ type: name }), name).toEqual([`widgets/${file}`]);
      expect(name in (await WIDGET_MODULES[file]()), name).toBe(true);
    }
    /* and fetches no file the printed code does not name */
    expect(Object.keys(WIDGET_MODULES).sort()).toEqual([...new Set(Object.values(WIDGET_SOURCES).map((f) => f.slice("@/components/widgets/".length)))].sort());
  });
});

/* ---------- state and outlets (docs/组件规范.md "组件的状态和出口", docs/边界与契约.md) ---------- */

const LANGS = ["ja", "zh", "ko"] as const;
/** the prop kinds an input of each kind can be held in */
const KIND_OF_INPUT: Record<string, string[]> = { text: ["text"], number: ["number"], bool: ["bool"], choice: ["number", "enum", "text"], choices: ["list", "text"], files: ["text"], date: ["text"], vec2: ["text"] };

describe("what a part declares", () => {
  it("names an input by a prop it has, of a kind that prop can hold", () => {
    for (const d of PARTS.filter((x) => x.input)) {
      const prop = d.props.find((p) => p.key === d.input!.prop);
      expect(prop, `${d.slug}.${d.input!.prop}`).toBeTruthy();
      expect(KIND_OF_INPUT[d.input!.kind], `${d.slug}: a ${d.input!.kind} input in a ${prop!.kind} prop`).toContain(prop!.kind);
    }
  });

  it("names its events and slot families plainly, in every language, apart from its slots", () => {
    for (const d of PARTS) {
      const names = (d.events ?? []).map((e) => e.name);
      expect(new Set(names).size, d.slug).toBe(names.length);
      for (const e of d.events ?? []) {
        expect(e.name, d.slug).toMatch(/^[A-Za-z][A-Za-z0-9]{0,39}$/);
        for (const l of LANGS) expect(e.labels?.[l], `${d.slug} on:${e.name} in ${l}`).toBeTruthy();
        for (const kind of Object.values(e.payload ?? {})) expect(["text", "number", "bool", "list", "object"]).toContain(kind);
      }
      const keys = (d.slots?.(reader(d, {})) ?? []).map((s) => s.key);
      for (const k of keys) expect(k.startsWith("on:") || k.endsWith(":*"), `${d.slug}: slot ${k} looks like an event or a family`).toBe(false);
      for (const f of d.families ?? []) {
        expect(f.prefix, d.slug).toMatch(/^[a-z][a-z0-9-]*$/);
        for (const l of LANGS) expect(f.labels?.[l], `${d.slug} ${f.prefix}:* in ${l}`).toBeTruthy();
        /* a family answers slots the part has: tab:0, tab:1… */
        expect(keys.some((k) => k.startsWith(`${f.prefix}:`)), `${d.slug} has no ${f.prefix}: slots`).toBe(true);
      }
    }
  });

  it("says what its demo is, and which props take it over", () => {
    for (const d of PARTS.filter((x) => x.demo)) {
      expect(d.demo!.what.length, d.slug).toBeGreaterThan(10);
      expect(d.demo!.takenOverBy.length, d.slug).toBeGreaterThan(0);
      for (const k of d.demo!.takenOverBy) expect(d.props.some((p) => p.key === k), `${d.slug}.${k}`).toBe(true);
    }
  });
});

describe("a widget's state", () => {
  const widgets = sourceFiles("widgets");

  it("draws no random result outside a prototype's demo", () => {
    /* a random outcome is a result, and a result is the other side's: only a demo, which a product never runs, picks one */
    for (const { name, text } of widgets) for (const line of text.split("\n").filter((l) => l.includes("Math.random"))) expect(line, name).toMatch(/\bdemo\b/);
  });

  it("takes the contract's props where its part declares an input, events or a demo", () => {
    for (const d of PARTS.filter((x) => x.input || x.events?.length || x.demo)) {
      const root = treeOf(d, defaultValues(d)).type;
      const from = WIDGET_SOURCES[root];
      if (!from) continue;
      const text = readFileSync(new URL(`widgets/${from.slice("@/components/widgets/".length)}.tsx`, dir), "utf8");
      /* the widget's own signature, from its name to the end of its props */
      const own = text.slice(text.indexOf(`export function ${root}(`));
      expect(own.slice(0, own.indexOf("{\n")), `${root} (${d.slug})`).toMatch(/demo, onValueChange, onEvent/);
    }
  });

  it("in a product shows what it is given, not what it would act out", () => {
    /* drawn with no host is a product: the coupon and the pad say claimed and sent only when told */
    expect(draw("coupon")).not.toContain('data-claimed="true"');
    expect(draw("coupon", { claimed: true })).toContain('data-claimed="true"');
    expect(draw("number-pad")).not.toContain('data-sent="true"');
    expect(draw("number-pad", { sent: true })).toContain('data-sent="true"');
    expect(draw("number-pad", { value: "120" })).toContain('data-entry="120"');
    expect(draw("rating", { value: 3 })).toContain('data-value="3"');
    expect(draw("prize-wheel")).toContain('data-phase="idle"');
  });
});
