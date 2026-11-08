import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KITS, kitBySlug } from "../parts/kits";
import { FILE_OF } from "../parts/files.generated";
import { isNode, type PNode, type PValue } from "../parts/node";
import { LOCAL_M3E } from "../parts/print";
import { PARTS, defaultValues, partBySlug, treeOf } from "../parts/registry";
import { buildCode } from "./codegen";
import { setGlobalLang } from "./i18n";
import { kitGroups, kitLookOf, splitIntoAtoms } from "./kits";
import { STYLE_PACKS } from "./styles";
import { DEFAULT_THEME, makeItem, type Doc, type Group } from "./tokens";
import { inLang, type Node as KitNode } from "../parts/templates/kit";

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

const docOf = (groups: Group[]): Doc => ({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" });
const header = (code: string) => code.split("\n").filter((l) => l.startsWith("//")).join("\n");

/** the props a component is dressed by, which a copy of it may have more values of than another */
const KNOBS = new Set(["variant", "size", "shape", "width"]);

/** Every knob value the kits and the split composites print, under every style, and every part as it comes;
 *  and, of the components this repo's copy extends, every value any choice of any part prints. */
function knobValues(): Map<string, string> {
  const seen = new Map<string, string>();
  const walk = (n: PNode, from: string, only?: (type: string) => boolean) => {
    if (n.type in FILE_OF && (!only || only(n.type)))
      for (const [k, v] of Object.entries(n.props ?? {})) if (KNOBS.has(k) && typeof v === "string" && !seen.has(`${n.type} ${k}=${v}`)) seen.set(`${n.type} ${k}=${v}`, from);
    const visit = (v: PValue) => {
      if (isNode(v)) walk(v, from, only);
      else if (Array.isArray(v)) v.forEach(visit);
    };
    Object.values(n.props ?? {}).forEach(visit);
    for (const c of n.children ?? []) if (typeof c !== "string") walk(c, from, only);
  };
  for (const d of PARTS) {
    const base = defaultValues(d);
    walk(treeOf(d, base), d.slug);
    for (const p of d.props) if (p.kind === "enum") for (const o of p.options) walk(treeOf(d, { ...base, [p.key]: typeof o === "string" ? o : o.value }), `${d.slug} ${p.key}`, (type) => type in LOCAL_M3E);
  }
  /* a kit is built from what a style is like, not from its name: each different look once */
  const looks = new Map([DEFAULT_THEME, ...STYLE_PACKS.map((s) => ({ ...DEFAULT_THEME, style: s.key }))].map((t) => kitLookOf(t)).map((l) => [JSON.stringify(l), l]));
  /* what each atom of a kit's tree prints, as it would once added */
  const atoms = (n: KitNode, from: string): void => {
    walk(treeOf(partBySlug(n.slug)!, inLang(n.props, "en")), from);
    for (const k of n.kids ?? []) atoms(k, from);
  };
  for (const look of looks.values()) for (const kit of KITS) for (const v of kit.variants) atoms(v.build(look), `kit ${kit.slug}`);
  /* and once added the way the editor adds one */
  for (const kit of KITS) for (const g of kitGroups(kit, kitLookOf(DEFAULT_THEME), "en")) for (const it of g.items) walk(treeOf(partBySlug(it.component)!, it.props), `kit ${kit.slug}`);
  for (const d of PARTS.filter((p) => p.atoms)) {
    const split = splitIntoAtoms([{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem(d.slug), id: "x" }] }], "x", "en");
    for (const g of split?.groups ?? []) for (const it of g.items) walk(treeOf(partBySlug(it.component)!, it.props), `split ${d.slug}`);
  }
  return seen;
}

/* The values printed that the shadcn M3E registry's own copies of the components take too. A value the
 * editor comes to print that is neither here nor in `LOCAL_M3E` fails the test below until it is put in
 * one or the other: in `LOCAL_M3E` when only this repo's copy (components/m3e) has it. */
const REGISTRY = new Set([
  "AppBar size=small",
  "Avatar size=lg",
  "Avatar size=sm",
  "Badge variant=destructive",
  "Badge variant=outline",
  "Badge variant=secondary",
  "Badge variant=tertiary",
  "Bubble variant=muted",
  "Button shape=square",
  "Button size=icon",
  "Button size=icon-lg",
  "Button size=icon-md",
  "Button size=icon-sm",
  "Button size=icon-xl",
  "Button size=lg",
  "Button size=md",
  "Button size=sm",
  "Button size=xl",
  "Button size=xs",
  "Button variant=elevated",
  "Button variant=filled",
  "Button variant=outlined",
  "Button variant=text",
  "Button variant=tonal",
  "Card variant=filled",
  "DropdownMenuItem variant=destructive",
  "EmptyMedia variant=icon",
  "ExpressiveCarousel variant=multi-browse",
  "Input size=sm",
  "Input variant=filled",
  "ItemMedia variant=icon",
  "Marker variant=separator",
  "SplitButton variant=filled",
  "TabsList variant=primary",
  "Textarea variant=filled",
  "ToggleGroup variant=filled",
]);

const isLocal = (key: string) => {
  const [, type, prop, value] = /^(\S+) (\w+)=(.*)$/.exec(key)!;
  return !!LOCAL_M3E[type]?.props[prop]?.includes(value);
};

describe("copied code that uses this repo's own components", () => {
  it("says which of this repo's files to take, and for what", () => {
    const groups = kitGroups(kitBySlug("claude-prompt")!, kitLookOf(DEFAULT_THEME), "en", { at: { x: 16, y: 100 } });
    const said = header(buildCode(docOf(groups), {}).code);
    expect(said).toMatch(/copy components\/m3e\/textarea\.tsx from the canvas over src\/components\/m3e\/textarea\.tsx: this code uses Textarea variant="plain"/);
    expect(said).toMatch(/copy components\/m3e\/input\.tsx .*Textarea variant="plain"/);
    expect(said).toMatch(/copy components\/m3e\/button\.tsx .*Button size="icon-xs"/);
    expect(said).toMatch(/copy components\/m3e\/button\.tsx .*Button variant="ghost"/);
    /* after the registry's are added, so that this repo's go over them */
    const lines = said.split("\n");
    expect(lines.findIndex((l) => l.includes("textarea.tsx"))).toBeGreaterThan(lines.findIndex((l) => l.startsWith("// 2. npx shadcn")));
  });

  it("says nothing of them when the registry's do", () => {
    const groups: Group[] = [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id: "b", props: { label: "Go", variant: "tonal" } }, { ...makeItem("text-field"), id: "t" }] }];
    expect(header(buildCode(docOf(groups), {}).code)).not.toMatch(/components\/m3e\//);
  });

  it("knows every value only this repo's copies have", () => {
    const unknown = [...knobValues()].filter(([key]) => !REGISTRY.has(key) && !isLocal(key)).map(([key, from]) => `${key} (from ${from})`);
    expect(unknown, "put each in REGISTRY above, or in LOCAL_M3E (parts/print.ts) when only components/m3e has it").toEqual([]);
  }, 60_000);

  it("lists only values this repo's files really have", () => {
    for (const [type, { files, props }] of Object.entries(LOCAL_M3E)) {
      const text = files.map((f) => readFileSync(new URL(`../components/m3e/${f}.tsx`, import.meta.url), "utf8")).join("\n");
      for (const [prop, values] of Object.entries(props))
        for (const value of values) expect(new RegExp(`(^|\\s)"?${value.replace(/[-]/g, "\\-")}"?:`, "m").test(text), `${type} ${prop}=${value}`).toBe(true);
    }
  });
});

describe("an empty layout in printed code", () => {
  const box = (props: Record<string, unknown> = {}): Group => ({ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("box"), id: "b", props: { surface: "panel", hugWidth: true, hugHeight: true, width: 146, height: 96, ...props } }] });
  const boxStyle = (code: string) => /data-slot="box"[\s\S]*?style=\{\{([^}]*)\}\}/.exec(code)?.[1] ?? "";

  it("keeps the size it has on the canvas", () => {
    const style = boxStyle(buildCode(docOf([box()]), {}).code);
    expect(style).toMatch(/width: 146/);
    expect(style).toMatch(/height: 96/);
  });

  it("keeps it while all it holds stands loose, and takes the size of what it holds once something flows in it", () => {
    const loose: Group = { id: "k", x: 0, y: 0, axis: "x", inFlow: "g", items: [{ ...makeItem("text"), id: "t", props: { text: "Hi" }, flowAbsolute: true }] };
    expect(boxStyle(buildCode(docOf([box(), loose]), {}).code)).toMatch(/width: 146/);
    const held: Group = { id: "k", x: 0, y: 0, axis: "x", inFlow: "g", items: [{ ...makeItem("text"), id: "t", props: { text: "Hi" } }] };
    expect(boxStyle(buildCode(docOf([box(), held]), {}).code)).not.toMatch(/width: 146|height: 96/);
  });
});
