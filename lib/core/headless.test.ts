/* The document core with no editor and no DOM: a three-screen app built only through operations, saved as a project
 * file, opened again, printed as code and exported as a project. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCode } from "../codegen";
import { buildProject } from "../exportProject";
import { setGlobalLang } from "../i18n";
import { openProject, projectFile } from "../project";
import { guessMeasurer } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import { find, outline, describeNode, nodeTree } from "./query";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

/** a store with nothing in it, deterministic ids, parts measured by their own guesses */
const empty = () => new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });

function buildApp() {
  const store = empty();
  store.transact("Build the app", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Shop" });
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addScreen, { id: "detail", name: "Detail" });
    tx.run(ops.addScreen, { id: "list", name: "List" });

    /* a kit, composed the way the style composes it */
    tx.run(ops.addKit, { slug: "search-bar", screen: "home", at: { x: 16, y: 40 } });

    /* atoms in a box with an auto layout */
    tx.run(ops.addPart, { slug: "box", id: "card", screen: "home", at: { x: 16, y: 140 }, props: { surface: "card", padX: 16, padY: 16 } });
    tx.run(ops.setLayout, { id: "card", layout: "column", props: { gap: 8 } });
    tx.run(ops.addPart, { slug: "text", id: "card-title", into: { container: "card" }, props: { text: "Fresh fruit", style: "title" } });
    tx.run(ops.addPart, { slug: "button", id: "buy", into: { container: "card" }, props: { label: "Buy" } });

    /* the card as a component, and an instance of it on the detail screen */
    const made = tx.run(ops.makeComponentOp, { ids: ["card"], name: "Product card", id: "product" });
    tx.run(ops.addInstance, { component: made.id, id: "card-copy", screen: "detail", at: { x: 16, y: 100 } });

    /* a collection repeated by a column */
    tx.run(ops.addCollection, { id: "fruit", name: "Fruit", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear", "2"], ["Plum", "3"]] });
    tx.run(ops.addPart, { slug: "box", id: "rows", screen: "list", at: { x: 16, y: 40 } });
    tx.run(ops.setLayout, { id: "rows", layout: "column", props: { gap: 4 } });
    tx.run(ops.addPart, { slug: "text", id: "row", into: { container: "rows" }, props: { text: "{{name}} — {{price}}" } });
    tx.run(ops.setRepeat, { id: "rows", repeat: { collection: "fruit" } });

    /* a variable, and a tap on the instance's screen that counts and goes to the list */
    tx.run(ops.addVar, { id: "count", name: "count", type: "number", value: 0 });
    tx.run(ops.addPart, { slug: "button", id: "go", screen: "detail", at: { x: 16, y: 400 }, props: { label: "See all" } });
    tx.run(ops.setAction, { id: "go", action: { to: "list", transition: "slide", effects: [{ do: "addVar", var: "count", by: 1 }] } });
    tx.run(ops.bindProp, { id: "row", prop: "text", var: null });

    /* a style picked */
    tx.run(ops.applyStyle, { style: "ios" });
  });
  return store;
}

describe("a document built headless, through operations only", () => {
  it("builds a three-screen app as one undo step", () => {
    const store = buildApp();
    const doc = savedDoc(store.get());
    expect(doc.title).toBe("Shop");
    expect(doc.frames.map((f) => f.name)).toEqual(["Home", "Detail", "List"]);
    expect(doc.theme?.style).toBe("ios");
    expect(doc.components?.[0]).toMatchObject({ id: "product", name: "Product card" });
    expect(doc.collections?.[0].rows).toHaveLength(3);
    expect(doc.vars).toEqual([{ id: "count", name: "count", type: "number", value: 0 }]);
    /* the kit is marked as the kit it was added as; the rows are laid out by their box */
    expect(doc.groups.some((g) => g.kit?.slug === "search-bar")).toBe(true);
    expect(doc.groups.find((g) => g.items[0].id === "row")?.inFlow).toBe(doc.groups.find((g) => g.items[0].id === "rows")?.id);
    expect(doc.groups.find((g) => g.items[0].id === "rows")?.repeat).toEqual({ collection: "fruit" });
    expect(doc.groups.find((g) => g.items[0].id === "card-copy")?.instanceOf).toBe("product");
    expect(doc.groups.flatMap((g) => g.items).find((it) => it.id === "go")?.action).toMatchObject({ to: "list", effects: [{ do: "addVar", var: "count", by: 1 }] });
    expect(store.history()).toEqual(["Build the app"]);
    store.undo();
    expect(savedDoc(store.get()).frames).toEqual([]);
  });

  it("is the same document every time", () => {
    expect(JSON.stringify(savedDoc(buildApp().get()))).toBe(JSON.stringify(savedDoc(buildApp().get())));
  });

  it("saves as a project file and opens again whole", () => {
    const doc = savedDoc(buildApp().get());
    const opened = openProject(JSON.parse(JSON.stringify(projectFile(doc))));
    expect(opened).not.toBeNull();
    expect(opened!.groups.map((g) => g.id)).toEqual(doc.groups.map((g) => g.id));
    expect(opened!.components).toEqual(doc.components);
    expect(opened!.collections).toEqual(doc.collections);
    /* a store opened on it reads the same document */
    const again = empty();
    again.replace(projectFile(doc));
    expect(savedDoc(again.get()).groups.map((g) => g.id)).toEqual(doc.groups.map((g) => g.id));
  });

  it("prints code for every screen and exports a project", async () => {
    const store = buildApp();
    const doc = savedDoc(store.get());
    const widths = guessMeasurer.measure(store.get());
    const { code } = buildCode(doc, widths);
    for (const word of ["Fresh fruit", "See all"]) expect(code).toContain(word);
    const project = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const screens = Object.keys(project.files).filter((p) => p.startsWith("src/screens/"));
    expect(screens.length).toBeGreaterThanOrEqual(3);
    expect(project.files["package.json"]).toBeTruthy();
    expect(project.warnings).toEqual([]);
  });

  it("can be read back as an outline, a tree and a part's description", () => {
    const store = buildApp();
    const doc = savedDoc(store.get());
    const widths = guessMeasurer.measure(store.get());
    const text = outline(doc, widths);
    expect(text).toContain('## screen home "Home"');
    expect(text).toContain("- go button");
    const tree = nodeTree(doc, widths);
    const rows = tree.screens.find((s) => s.id === "list")!.nodes.find((n) => n.id === "rows")!;
    expect(rows.children.map((c) => c.id)).toEqual(["row"]);
    expect(find(doc, widths, { text: "see all" }).map((f) => f.id)).toEqual(["go"]);
    const go = describeNode(doc, widths, "go")!;
    expect(go.screen?.id).toBe("detail");
    expect(go.props.find((p) => p.key === "variant")?.takes).toMatch(/one of/);
  });
});
