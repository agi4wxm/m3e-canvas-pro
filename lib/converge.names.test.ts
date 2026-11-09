/* Version 5 (lib/converge.ts, the last part): the props renamed and rescaled so that one idea has one name and one
 * unit across the parts (docs/组件规范.md "属性的名字和单位"). Old files draw exactly as before: every part reads,
 * under its old name and in its old unit, what it read at the version that wrote the file (`drawn.json`), and the tree
 * it draws on the canvas, in the preview and as printed web code is the same tree (`trees.json`), at the start, after
 * each tap and after each input is used. */

import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDocument } from "./project";
import { setGlobalLang } from "./i18n";
import { asWrittenAt4, CONVERGE_5, enteredNow, PROP_RENAMES_5, treeAsWrittenAt5 } from "./converge";
import { MIGRATIONS, PROJECT_VERSION } from "./migrations";
import { partBySlug } from "../parts/registry";
import type { Doc } from "./tokens";
import { drawnStates, drawnTrees } from "./fixtures/history/drawn";

beforeAll(() => setGlobalLang("en"));

const dir = new URL("./fixtures/history/", import.meta.url);
const FILES = ["2026-11-04-bf2463d-all-parts", "2026-11-05-65278cb-proof", "2026-11-06-55ab801-systems", "2026-11-06-79ec9e7-reuse", "2026-11-06-cf3fa45-bound-shop", "2026-11-09-0228f1c-names", "2026-11-09-07bd67d-rows-colors"];
const fileOf = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as { document: Doc };
const readJson = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, Record<string, string>>;

/* A file comes in once, recorded by the version that wrote it (`UPDATE_HISTORY=1`): what is recorded already stays. */
if (process.env.UPDATE_HISTORY) {
  setGlobalLang("en");
  for (const [json, of] of [
    ["drawn.json", (d: Doc) => drawnStates(d)],
    ["trees.json", (d: Doc) => drawnTrees(d)],
  ] as const) {
    let golden: Record<string, Record<string, string>> = {};
    try {
      golden = readJson(json);
    } catch {
      /* none yet */
    }
    for (const name of FILES) golden[name] ??= of(loadDocument(fileOf(name))!.doc);
    writeFileSync(new URL(json, dir), JSON.stringify(golden, null, 1) + "\n");
  }
}

describe("old files drawn by the version after the renames", () => {
  const trees = readJson("trees.json");
  it.each(FILES)("draw every part as the same tree on the canvas, in the preview and printed, in every state: %s", (name) => {
    /* the trees as version 5 drew them where version 6 hands a widget its value in another form (a multiple choice's
       picks, from 0), and what a visitor enters as the same act */
    const now = drawnTrees(loadDocument(fileOf(name))!.doc, treeAsWrittenAt5, enteredNow);
    expect(Object.keys(now).sort()).toEqual(Object.keys(trees[name]).sort());
    expect(Object.entries(now).filter(([k, v]) => trees[name][k] !== v).map(([k]) => k)).toEqual([]);
  });
});

/* ---------- the step itself ---------- */

const item = (id: string, component: string, extra: Record<string, unknown> = {}) => ({ id, kind: "component", component, label: "", icon: null, variant: "filled", ...extra });
const group = (id: string, items: unknown[], extra: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, axis: "x", items, ...extra });
const doc = (groups: unknown[], extra: Record<string, unknown> = {}) => ({ title: "T", frames: [{ id: "a", name: "A", x: 0, y: 0 }], groups, ...extra });
const itemsOf = (d: Record<string, unknown>) => (d.groups as { items: Record<string, unknown>[] }[]).flatMap((g) => g.items);

describe("version 5: the props' names and units", () => {
  it("is the step after 4", () => {
    expect(PROJECT_VERSION).toBeGreaterThanOrEqual(5);
    expect(MIGRATIONS.find((m) => m.to === 5)).toBe(CONVERGE_5);
  });

  it("moves every renamed prop to its new name, in its new unit, and leaves every other prop and part alone", () => {
    const before = doc([
      group("g", [
        item("tf", "text-field", { props: { label: "Email", supporting: "Help" } }),
        item("sel", "select", { props: { supporting: "Pick", selected: 1 } }),
        item("f", "field", { props: { description: "Work", error: "Not an address" } }),
        item("up", "file-upload", { props: { hint: "PNG" } }),
        item("d", "dialog", { props: { style: "fullscreen", dismiss: "Back" } }),
        item("s", "search", { props: { style: "outlined" } }),
        item("ad", "alert-dialog", { props: { cancel: "Keep", action: "Delete" } }),
        item("b", "banner", { props: { closable: true } }),
        item("n", "notice-bar", { props: { closable: false } }),
        item("c", "item-cell", { props: { selected: true } }),
        item("t", "number-ticker", { props: { size: "display" } }),
        item("sc", "scene", { props: { frameMs: 350 } }),
        item("p1", "price-tag", { props: { size: "small" } }),
        item("p2", "price-tag", { props: { size: "large" } }),
        item("p3", "price-tag", { props: { size: "medium" } }),
        /* the same keys on parts that keep them */
        item("tx", "text", { props: { style: "headline", size: "large" } }),
        item("tb", "table", { props: { selected: 2 } }),
      ]),
    ]);
    const props = Object.fromEntries(itemsOf(CONVERGE_5.up(before)).map((it) => [it.id, it.props]));
    expect(props).toEqual({
      tf: { label: "Email", helperText: "Help" },
      sel: { helperText: "Pick", selected: 1 },
      f: { helperText: "Work", errorText: "Not an address" },
      up: { helperText: "PNG" },
      d: { variant: "fullscreen", dismiss: "Back" },
      s: { variant: "outlined" },
      ad: { dismiss: "Keep", confirm: "Delete" },
      b: { closeButton: true },
      n: { closeButton: false },
      c: { pressed: true },
      t: { style: "display" },
      sc: { frameSeconds: 0.35 },
      p1: { size: "sm" },
      p2: { size: "lg" },
      p3: { size: "default" },
      tx: { style: "headline", size: "large" },
      tb: { selected: 2 },
    });
  });

  it("keeps the old key's value where a new one was written beside it, and what is not of the kind it converts", () => {
    const out = CONVERGE_5.up(doc([group("g", [item("tf", "text-field", { props: { supporting: "old", helperText: "unread" } }), item("sc", "scene", { props: { frameMs: "fast" } }), item("p", "price-tag", { props: { size: "huge" } })])]));
    expect(itemsOf(out).map((it) => it.props)).toEqual([{ helperText: "old" }, { frameSeconds: "fast" }, { size: "huge" }]);
  });

  it("moves bindings, wrapping an expression so it comes to the same in the new unit, once", () => {
    const before = doc([
      group("g", [
        item("tf", "text-field", { bind: { supporting: "=vars.help", value: "=vars.name" } }),
        item("sc", "scene", { bind: { frameMs: "=vars.ms" } }),
        item("p", "price-tag", { bind: { size: "=vars.size" } }),
        item("b", "banner", { bind: { closable: "=vars.close", "@fill": '=vars["v-brand"]' } }),
      ]),
    ]);
    const once = CONVERGE_5.up(before);
    expect(itemsOf(once).map((it) => it.bind)).toEqual([
      { helperText: "=vars.help", value: "=vars.name" },
      { frameSeconds: "=(vars.ms) / 1000" },
      { size: '=(vars.size) == "small" ? "sm" : (vars.size) == "medium" ? "default" : (vars.size) == "large" ? "lg" : null' },
      { closeButton: "=vars.close", "@fill": '=vars["v-brand"]' },
    ]);
    expect(CONVERGE_5.up(once)).toEqual(once);
  });

  it("renames what a tap sets, at any depth, on the canvas and in a component, by the part it sets", () => {
    const set = (part: string, prop: string, value: unknown) => ({ do: "setProp", part, prop, value });
    const before = doc(
      [
        group("g", [
          item("sc", "scene"),
          item("tx", "text"),
          item("go", "button", {
            // eslint-disable-next-line unicorn/no-thenable -- action bodies, never functions: nothing awaits them
            action: { to: "none", effects: [set("sc", "frameMs", 90), set("tx", "style", "title"), { do: "call", operationId: "x", then: { to: "none", effects: [set("i/c-p", "size", "small")] } }] },
          }),
        ]),
      ],
      { components: [{ id: "c", name: "C", w: 10, h: 10, groups: [group("cg", [item("c-p", "price-tag"), item("c-go", "button", { actions: { tap: { to: "none", effects: [set("c-p", "size", "large")] } } })])] }] },
    );
    const out = CONVERGE_5.up(before);
    const go = itemsOf(out).find((it) => it.id === "go")!.action as { effects: Record<string, unknown>[] };
    expect(go.effects[0]).toEqual(set("sc", "frameSeconds", 0.09));
    expect(go.effects[1]).toEqual(set("tx", "style", "title"));
    expect((go.effects[2].then as { effects: unknown[] }).effects[0]).toEqual(set("i/c-p", "size", "sm"));
    const inside = (out.components as { groups: { items: { actions?: Record<string, { effects: unknown[] }> }[] }[] }[])[0].groups[0].items[1].actions!.tap.effects[0];
    expect(inside).toEqual(set("c-p", "size", "lg"));
  });

  it("renames what an instance overrides and what a component property writes, with its value in the new unit", () => {
    const before = doc([group("i", [item("i-part", "container")], { instanceOf: "c", overrides: { "c-tf/supporting": "Over", "c-p/size": "small", "c-p/amount": "3", "nested/c-sc/frameMs": 500 }, properties: { "p-size": "large", "p-help": "Hi" } })], {
      components: [
        {
          id: "c",
          name: "C",
          w: 10,
          h: 10,
          groups: [group("cg", [item("c-tf", "text-field"), item("c-p", "price-tag"), item("c-sc", "scene")])],
          props: [
            { id: "p-help", name: "Help", type: "text", value: "Help", targets: ["c-tf/supporting"] },
            { id: "p-size", name: "Size", type: "text", value: "medium", targets: ["c-p/size"] },
          ],
        },
      ],
    });
    const out = CONVERGE_5.up(before) as { groups: Record<string, unknown>[]; components: { props: unknown[] }[] };
    expect(out.groups[0].overrides).toEqual({ "c-tf/helperText": "Over", "c-p/size": "sm", "c-p/amount": "3", "nested/c-sc/frameSeconds": 0.5 });
    expect(out.groups[0].properties).toEqual({ "p-size": "lg", "p-help": "Hi" });
    expect(out.components[0].props).toEqual([
      { id: "p-help", name: "Help", type: "text", value: "Help", targets: ["c-tf/helperText"] },
      { id: "p-size", name: "Size", type: "text", value: "default", targets: ["c-p/size"] },
    ]);
  });

  it("reads back, for the tests of old files, what a part reads now as version 4 read it", () => {
    expect(asWrittenAt4("scene", { frames: 4, frameSeconds: 0.205 })).toEqual({ frames: 4, frameMs: 205 });
    expect(asWrittenAt4("price-tag", { size: "lg" })).toEqual({ size: "large" });
    expect(Object.keys(asWrittenAt4("field", { label: "", helperText: "", errorText: "" }))).toEqual(["label", "description", "error"]);
    expect(asWrittenAt4("text", { style: "body" })).toEqual({ style: "body" });
  });

  it("names only props the parts have, each to a name its part has now and not before", () => {
    for (const r of PROP_RENAMES_5) {
      const keys = partBySlug(r.slug)!.props.map((d) => d.key);
      expect(keys, `${r.slug}.${r.to}`).toContain(r.to);
      if (r.from !== r.to) expect(keys, `${r.slug}.${r.from}`).not.toContain(r.from);
    }
  });
});
