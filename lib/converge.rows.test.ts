/* Version 6 (lib/converge.ts, the last part): the parts' colors on the one color value, a palette's colors as rows of
 * the row model, and the places that were counted from 1 counted from 0 under keys of their own. Old files draw and
 * behave as before: lib/converge.names.test.ts (`trees.json`), lib/converge.test.ts (`drawn.json`) and
 * lib/migrations.test.ts (`behaviour.json`) hold every history file to it, the version-5 one
 * (`2026-11-09-07bd67d-rows-colors.json`) setting, binding, tapping and overriding each prop this step changes. */

import { describe, expect, it } from "vitest";
import { asWrittenAt5, CONVERGE_6, COLOR_WORDS_6, enteredNow, placesFrom0, PROP_CHANGES_6, treeAsWrittenAt5 } from "./converge";
import { MIGRATIONS, PROJECT_VERSION } from "./migrations";
import { partBySlug } from "../parts/registry";

const item = (id: string, component: string, extra: Record<string, unknown> = {}) => ({ id, kind: "component", component, label: "", icon: null, variant: "filled", ...extra });
const group = (id: string, items: unknown[], extra: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, axis: "x", items, ...extra });
const doc = (groups: unknown[], extra: Record<string, unknown> = {}) => ({ title: "T", frames: [{ id: "a", name: "A", x: 0, y: 0 }], groups, ...extra });
const itemsOf = (d: Record<string, unknown>) => (d.groups as { items: Record<string, unknown>[] }[]).flatMap((g) => g.items);
const propsOf = (d: Record<string, unknown>) => Object.fromEntries(itemsOf(d).map((it) => [it.id, it.props]));

describe("version 6: the row model and the one color value", () => {
  it("is the step after 5, and saving writes 6", () => {
    expect(PROJECT_VERSION).toBe(6);
    expect(MIGRATIONS.at(-1)).toBe(CONVERGE_6);
  });

  it("writes a part's own words for a color as the color they drew, and leaves a role and every other part alone", () => {
    const before = doc([
      group("g", [
        item("t1", "text", { props: { color: "muted" } }),
        item("t2", "text", { props: { color: "default" } }),
        item("t3", "text", { props: { color: "inverse" } }),
        item("t4", "text", { props: { color: "primary" } }),
        item("s1", "svg", { props: { color: "current" } }),
        item("s2", "svg", { props: { color: "default" } }),
        item("d1", "dot", { props: { color: "surface" } }),
        item("l1", "item", { props: { iconFill: "surface" } }),
        item("l2", "item", { props: { iconFill: "none" } }),
        item("c1", "container", { props: { fill: "none" } }),
        item("sep", "separator", { props: { color: "default" } }),
        item("fab", "fab", { props: { color: "surface" } }),
        /* a key of the same name on a part whose words are no colors */
        item("bar", "toolbar", { props: { color: "vibrant" } }),
        item("chip", "chip", { props: { variant: "default" } }),
      ]),
    ]);
    expect(propsOf(CONVERGE_6.up(before))).toEqual({
      t1: { color: "on-surface-variant" },
      t2: { color: "" },
      t3: { color: "inverse-on-surface" },
      t4: { color: "primary" },
      s1: { color: "" },
      s2: { color: "on-surface" },
      d1: { color: "surface-container-highest" },
      l1: { iconFill: "surface-container-highest" },
      l2: { iconFill: "" },
      c1: { fill: "" },
      sep: { color: "" },
      fab: { color: "surface" },
      bar: { color: "vibrant" },
      chip: { variant: "default" },
    });
  });

  it("makes a rarity's words a color, and words that were never painted none; a palette's colors rows", () => {
    const out = CONVERGE_6.up(doc([group("g", [item("a", "item-cell", { props: { rarityColor: " #E0A030 " } }), item("b", "item-cell", { props: { rarityColor: "gold" } }), item("c", "item-cell", { props: { rarityColor: "tertiary/60" } }), item("p", "color-palette", { props: { colors: "#6750A4, primary,,nope" } })])]));
    expect(propsOf(out)).toEqual({
      a: { rarityColor: "#E0A030" },
      b: { rarityColor: "" },
      c: { rarityColor: "tertiary/60" },
      p: { colors: [{ label: "#6750A4", color: "#6750A4" }, { label: "primary", color: "primary" }, { label: "", color: "" }, { label: "nope", color: "nope" }] },
    });
  });

  it("counts the places from 0 under keys of their own, a table's none -1", () => {
    const out = CONVERGE_6.up(doc([group("g", [item("t", "table", { props: { selected: 2 } }), item("t0", "table", { props: { selected: 0 } }), item("pg", "pagination", { props: { current: 3 } }), item("lv", "level-map", { props: { current: 5, selected: 1 } }), item("ms", "multi-select", { props: { selected: "1,3" } })])]));
    expect(propsOf(out)).toEqual({ t: { selectedRow: 1 }, t0: { selectedRow: -1 }, pg: { page: 2 }, lv: { level: 4, selected: 1 }, ms: { picked: "0,2" } });
  });

  it("moves bindings, wrapping an expression so it comes to the same color or row, once", () => {
    const before = doc([
      group("g", [
        item("t", "text", { bind: { color: "=vars.tone" } }),
        item("tb", "table", { bind: { selected: "=vars.row" } }),
        item("pg", "pagination", { bind: { current: "=vars.page + 1" } }),
      ]),
    ]);
    const once = CONVERGE_6.up(before);
    expect(itemsOf(once).map((it) => it.bind)).toEqual([
      { color: '=(vars.tone) == "default" ? "" : (vars.tone) == "muted" ? "on-surface-variant" : (vars.tone) == "inverse" ? "inverse-on-surface" : (vars.tone)' },
      { selectedRow: "=(vars.row) - 1" },
      { page: "=(vars.page + 1) - 1" },
    ]);
    expect(CONVERGE_6.up(once)).toEqual(once);
  });

  it("keeps a multiple choice bound two ways to its variable, and writes the variable's value from 0 too", () => {
    const before = doc([group("g", [item("ms", "multi-select", { bind: { selected: "=vars.picks" } }), item("ms2", "multi-select", { bind: { selected: '=vars["v-b"]' } })])], {
      vars: [
        { id: "v-a", name: "picks", type: "text", value: "1,3", modes: { m1: "2" } },
        { id: "v-b", name: "other picks", type: "text", value: "2" },
        { id: "v-c", name: "untouched", type: "text", value: "1,3" },
      ],
    });
    const once = CONVERGE_6.up(before);
    expect(itemsOf(once).map((it) => it.bind)).toEqual([{ picked: "=vars.picks" }, { picked: '=vars["v-b"]' }]);
    expect(once.vars).toEqual([
      { id: "v-a", name: "picks", type: "text", value: "0,2", modes: { m1: "1" } },
      { id: "v-b", name: "other picks", type: "text", value: "1" },
      { id: "v-c", name: "untouched", type: "text", value: "1,3" },
    ]);
    expect(CONVERGE_6.up(once)).toEqual(once);
  });

  it("moves what a tap sets, what an instance overrides and what a component property writes", () => {
    const set = (part: string, prop: string, value: unknown) => ({ do: "setProp", part, prop, value });
    const before = doc(
      [
        group("g", [item("t", "text"), item("pg", "pagination"), item("pal", "color-palette"), item("go", "button", { action: { to: "none", effects: [set("t", "color", "muted"), set("pg", "current", 4), set("pal", "colors", "#000000,#ffffff")] } })]),
        group("i", [item("i-part", "container", { props: { fill: "none" } })], { instanceOf: "c", overrides: { "c-t/color": "inverse", "c-tb/selected": 3, "c-ms/selected": "2" }, properties: { "p-tone": "default" } }),
      ],
      {
        components: [{ id: "c", name: "C", w: 10, h: 10, groups: [group("cg", [item("c-t", "text"), item("c-tb", "table"), item("c-ms", "multi-select")])], props: [{ id: "p-tone", name: "Tone", type: "text", value: "muted", targets: ["c-t/color"] }] }],
      },
    );
    const out = CONVERGE_6.up(before) as { groups: Record<string, unknown>[]; components: { props: unknown[] }[] };
    const go = itemsOf(out).find((it) => it.id === "go")!.action as { effects: unknown[] };
    /* a tap sets words, never rows: a palette's colors set by a tap stay the words it reads its colors from */
    expect(go.effects).toEqual([set("t", "color", "on-surface-variant"), set("pg", "page", 3), set("pal", "colors", "#000000,#ffffff")]);
    expect(out.groups[1].overrides).toEqual({ "c-t/color": "inverse-on-surface", "c-tb/selectedRow": 2, "c-ms/picked": "1" });
    expect(out.groups[1].properties).toEqual({ "p-tone": "" });
    expect(out.components[0].props).toEqual([{ id: "p-tone", name: "Tone", type: "text", value: "on-surface-variant", targets: ["c-t/color"] }]);
    expect((out.groups[1].items as Record<string, unknown>[])[0].props).toEqual({ fill: "" });
  });

  it("reads back, for the tests of old files, what a part reads now as version 5 read it", () => {
    expect(asWrittenAt5("text", { text: "x", color: "on-surface-variant" })).toEqual({ text: "x", color: "muted" });
    expect(asWrittenAt5("svg", { color: "" })).toEqual({ color: "current" });
    expect(asWrittenAt5("table", { title: "t", selectedRow: -1 })).toEqual({ title: "t", selected: 0 });
    expect(asWrittenAt5("multi-select", { picked: "0,2" })).toEqual({ selected: "1,3" });
    expect(asWrittenAt5("color-palette", { colors: [{ label: "a", color: "#111111" }, { label: "b", color: "#222222" }] })).toEqual({ colors: "#111111,#222222" });
    expect(enteredNow("multi-select", "2,3")).toBe("1,2");
    expect(enteredNow("text-field", "2,3")).toBe("2,3");
    expect(treeAsWrittenAt5({ type: "MultiSelect", props: { items: [], picked: "0,2" } })).toEqual({ type: "MultiSelect", props: { items: [], selected: "1,3" } });
  });

  it("counts places down and back without losing what is no place", () => {
    for (const v of ["1,3", "", "Kiwi", "0", "1, 3,x"]) expect(asWrittenAt5("multi-select", { picked: placesFrom0(v) }).selected).toBe(v);
  });

  it("names only props the parts have, each a color prop or a prop of rows or a place among them, under a key they have now", () => {
    for (const r of PROP_CHANGES_6) {
      const keys = partBySlug(r.slug)!.props.map((d) => d.key);
      expect(keys, `${r.slug}.${r.to}`).toContain(r.to);
      if (r.from !== r.to) expect(keys, `${r.slug}.${r.from}`).not.toContain(r.from);
    }
    for (const at of Object.keys(COLOR_WORDS_6)) {
      const [slug, key] = at.split(".");
      expect(partBySlug(slug)!.props.find((d) => d.key === key)?.kind, at).toBe("color");
    }
  });
});
