/* The retired whole-screen parts (parts/defs/retired.ts, lib/retire.ts): still drawn, never offered, and split into
 * atoms only when asked, one undoable step that keeps the look, the words and the taps, and turns a list's alike rows
 * into a data collection; what that makes exports on the web, a phone and a mini-program as atoms. */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "./core";
import { executeTool, toolGuide } from "./tools";
import { setGlobalLang } from "./i18n";
import { OFFERED_PARTS, PARTS, partBySlug, reader, tierOf, viewOf } from "../parts/registry";
import { partCatalog } from "../parts/catalog";
import { kitBySlug } from "../parts/kits";
import { TEMPLATES } from "../parts/templates";
import { seedGroups } from "../parts/templates/kit";
import { buildCode } from "./codegen";
import { expandDoc } from "./expand";
import { kitTree, splitIntoAtoms } from "./kits";
import { loadDocument, openProject } from "./project";
import { MIGRATIONS } from "./migrations";
import { RETIRED_SLUGS, retiredParts, retiredRows } from "./retire";
import { turnContext } from "./agent/prompt";
import { printRnScreens } from "./export/rn/print";
import { printMiniScreens } from "./export/miniapp/print";
import { PHONE_W, type Action, type Doc, type Frame, type Group, type Item } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const SLUGS = ["inventory", "task-row", "pull-to-refresh", "cart-list", "contact-list", "comment-list", "notification-list", "settings-group", "todo-list", "auth-form", "chat-composer"];
/** the widget each retired part was drawn with */
const WIDGETS = ["Inventory", "TaskBar", "PullToRefresh", "CartList", "ContactList", "CommentList", "NotificationList", "SettingsGroup", "TodoList", "AuthForm", "ChatComposer"];

const go = (to: string): Action => ({ to, transition: "slide" });
const item = (slug: string, id: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ id, kind: "component", label: "", icon: null, variant: "filled", component: slug, props, ...more });

/** each part on a phone screen of its own, with a screen called "Target" to go to */
function docOf(items: Item[], more: Partial<Doc> = {}): Doc {
  const frames: Frame[] = [...items.map((it, i) => ({ id: `s${i}`, name: `Screen ${i}`, x: i * (PHONE_W + 80), y: 0 })), { id: "target", name: "Target", x: items.length * (PHONE_W + 80), y: 0 }];
  const groups: Group[] = items.map((it, i) => ({ id: `g-${it.id}`, x: i * (PHONE_W + 80) + 16, y: 120, axis: "x", items: [it] }));
  return { groups, frames, paletteKey: "purple", frame: "phone", title: "Old", brief: "", ...more };
}

const storeOf = (doc: Doc) => new DocStore(stateOf(doc), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });

/** every part of a split, outermost first, the way it lays out */
const subtree = (doc: Pick<Doc, "groups">, itemId: string): Group[] => {
  const root = doc.groups.find((g) => g.items[0]?.id === itemId);
  return root ? kitTree(doc.groups, root.id) : [];
};
/** the words in props, in order */
const wordsOf = (v: unknown, into: string[] = []): string[] => {
  if (typeof v === "string") into.push(v);
  else if (Array.isArray(v)) v.forEach((x) => wordsOf(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => wordsOf(x, into));
  return into;
};
/** what a split draws, part by part: its atom and the props it draws with, leaving out where a layout puts it */
const drawn = (groups: Group[], skip = new Set<string>()) =>
  groups
    .filter((g) => !skip.has(g.id))
    .map((g) => {
      const it = g.items[0];
      const { width: _w, height: _h, ...props } = it.props ?? {};
      return `${it.component} ${JSON.stringify(props)}${it.fill ? ` ${it.fill}` : ""}`;
    });

describe("the retired parts", () => {
  it("are the eleven whole-screen parts, each with a split and a word on what to build instead, and the resizable", () => {
    expect(PARTS.filter((d) => d.retired).map((d) => d.slug).sort()).toEqual([...SLUGS, "resizable"].sort());
    expect([...RETIRED_SLUGS].sort()).toEqual([...SLUGS, "resizable"].sort());
    for (const slug of SLUGS) {
      const def = partBySlug(slug)!;
      expect(def.atoms, slug).toBeTruthy();
      expect(def.retired!.use.length, slug).toBeGreaterThan(20);
      expect(OFFERED_PARTS.includes(def), slug).toBe(false);
    }
  });

  it("name what replaces them, every one a kit or a part that is offered, for the palette to find by the old name", () => {
    for (const slug of SLUGS) {
      const use = partBySlug(slug)!.retired!.with ?? [];
      /* a pull to refresh is a data source's setting, no part */
      expect(use.length > 0, slug).toBe(slug !== "pull-to-refresh");
      for (const x of use) expect(!!kitBySlug(x) || OFFERED_PARTS.some((d) => d.slug === x), `${slug}: ${x}`).toBe(true);
    }
  });

  it("still draw as they did: an old document is the same and draws the same until it is split", () => {
    SLUGS.forEach((slug, i) => {
      const def = partBySlug(slug)!;
      expect(viewOf(def, {}).type, slug).toBe(WIDGETS[i]);
    });
    /* project files written by earlier versions: their retired parts come back as they were, with nothing split */
    for (const name of ["2026-11-04-bf2463d-all-parts", "2026-11-05-65278cb-proof"]) {
      const file = JSON.parse(readFileSync(new URL(`./fixtures/history/${name}.json`, import.meta.url), "utf8")) as { document: Doc };
      const wrote = file.document.groups.flatMap((g) => g.items).filter((it) => partBySlug(it.component)?.retired);
      expect(wrote.length, name).toBeGreaterThan(0);
      const loaded = loadDocument(file)!;
      /* the format's own steps run (version 3 converges how taps and conditions are written); none splits a part */
      expect(loaded.migrated, name).toEqual(MIGRATIONS.map((m) => m.name));
      const read = loaded.doc.groups.flatMap((g) => g.items).filter((it) => partBySlug(it.component)?.retired);
      expect(read.map((it) => [it.id, it.component, it.props]), name).toEqual(wrote.map((it) => [it.id, it.component, it.props]));
      expect(retiredParts(loaded.doc.groups).length, name).toBe(wrote.length);
    }
    /* one written now, with all eleven: read back the same */
    const doc = docOf(SLUGS.map((slug, i) => item(slug, `p${i}`)));
    expect(openProject({ format: "m3e-project", version: 2, document: doc })!.groups).toEqual(doc.groups);
  });

  it("are not offered: not in the parts the AI reads or lists, and adding one is refused", async () => {
    const catalog = partCatalog();
    const [offered, retired] = catalog.split("#### Retired");
    for (const slug of SLUGS) {
      expect(offered, slug).not.toContain(`| \`${slug}\` |`);
      expect(retired, slug).toContain(`| \`${slug}\` |`);
    }
    expect(readFileSync(new URL("../public/agent.md", import.meta.url), "utf8").replaceAll("\r\n", "\n")).toContain(catalog);
    const s = storeOf(docOf([]));
    const listed = (await executeTool(s, "list_parts", {}, { origin: "mcp" })) as { ok: true; result: { parts: string[] } };
    expect(listed.result.parts.some((row) => SLUGS.includes(row.split(" | ")[0]))).toBe(false);
    const described = (await executeTool(s, "describe_part", { slug: "cart-list" }, { origin: "mcp" })) as { ok: true; result: { retired?: { use: string } } };
    expect(described.result.retired?.use).toContain("cart-row");
    for (const slug of SLUGS) {
      const added = await executeTool(s, "add_part", { slug, screen: "s0" }, { origin: "ai" });
      expect(!added.ok && added.error.code, slug).toBe("refused");
      const tree = await executeTool(s, "add_tree", { screen: "s0", tree: { part: "box", props: { layout: "column" }, children: [{ part: slug }] } }, { origin: "ai" });
      expect(!tree.ok && tree.error.code, slug).toBe("refused");
    }
    expect(savedDoc(s.get()).groups).toEqual([]);
    expect(toolGuide()).toContain("split_retired");
  });

  it("are pointed out to the in-app AI when a design holds some", () => {
    const doc = docOf([item("cart-list", "cart"), item("button", "b", { label: "Go" })]);
    const context = turnContext({ doc, widths: {}, selection: [], frameId: null, lang: "en" });
    expect(context).toContain("Retired parts on the screens, drawn as before but no longer built with: cart (cart-list)");
    /* and the outline an MCP client reads marks it */
    expect(context).toMatch(/- cart cart-list .*\[[^\]]*retired/);
    expect(turnContext({ doc: docOf([item("button", "b")]), widths: {}, selection: [], frameId: null, lang: "en" })).not.toContain("Retired parts");
  });

  it("are gone from every template, which build the same look in atoms", () => {
    for (const t of TEMPLATES)
      for (const seed of t.build()) for (const g of seedGroups(seed)) for (const it of g.items) expect(partBySlug(it.component)?.retired, `${t.slug}: ${it.component}`).toBeFalsy();
  });
});

describe("splitting the retired parts", () => {
  it("splits every one on the screens in one step, the same place and id, only atoms; one undo puts them all back", () => {
    const doc = docOf(SLUGS.map((slug, i) => item(slug, `p${i}`, {}, { action: go("target"), note: "old" })));
    const s = storeOf(doc);
    const out = s.run(ops.splitRetired, {}, { origin: "user" });
    expect(out.split.map((x) => x.slug)).toEqual(SLUGS);
    const after = savedDoc(s.get());
    expect(retiredParts(after.groups)).toEqual([]);
    SLUGS.forEach((slug, i) => {
      const tree = subtree(after, `p${i}`);
      expect(tree[0].items[0], slug).toMatchObject({ id: `p${i}`, component: "box", action: go("target"), note: "old" });
      expect(tree[0].id, slug).toBe(`g-p${i}`);
      for (const g of tree) expect(tierOf(partBySlug(g.items[0].component)!), `${slug}: ${g.items[0].component}`).toBe("atom");
    });
    s.undo("user");
    expect(savedDoc(s.get()).groups).toEqual(doc.groups);
    expect(savedDoc(s.get()).collections).toBeUndefined();
  });

  it("splits only the ones named, refuses a part that is not retired, and says when there is none", async () => {
    const s = storeOf(docOf([item("cart-list", "cart"), item("todo-list", "todo"), item("app-bar", "bar")]));
    expect(s.run(ops.splitRetired, { ids: ["todo"] }, { origin: "mcp" }).split.map((x) => x.id)).toEqual(["todo"]);
    expect(retiredParts(savedDoc(s.get()).groups).map((r) => r.item.id)).toEqual(["cart"]);
    expect(() => s.run(ops.splitRetired, { ids: ["bar"] }, { origin: "mcp" })).toThrow(/not retired/);
    s.run(ops.splitRetired, {}, { origin: "mcp" });
    const none = await executeTool(s, "split_retired", {}, { origin: "mcp" });
    expect(none.ok && (none.result as Record<string, unknown>).nothing_to_do).toBeTruthy();
  });

  it("hands a pull to refresh to the data its screen loads, and leaves a screen that loads none as it was", async () => {
    const doc = docOf([item("pull-to-refresh", "pull"), item("pull-to-refresh", "bare")]);
    doc.frames[0] = { ...doc.frames[0], data: [{ name: "feed", operationId: "listFeed" }, { name: "me", operationId: "getMe", pullToRefresh: true }] };
    const s = storeOf(doc);
    const out = await executeTool(s, "split_retired", {}, { origin: "mcp" });
    const split = (out.ok ? (out.result as { split: { id: string; refreshes?: string[] }[] }) : { split: [] }).split;
    expect(split.map((x) => [x.id, x.refreshes])).toEqual([["pull", ["feed"]], ["bare", undefined]]);
    const after = savedDoc(s.get());
    expect(after.frames[0].data).toEqual([{ name: "feed", operationId: "listFeed", pullToRefresh: true }, { name: "me", operationId: "getMe", pullToRefresh: true }]);
    expect(after.frames[1].data).toBeUndefined();
    expect(retiredParts(after.groups)).toEqual([]);
    /* the same one step: an undo takes the pull back with the part */
    s.undo("mcp");
    expect(savedDoc(s.get()).frames).toEqual(doc.frames);
  });

  it("keeps what each one says and shows", () => {
    for (const slug of SLUGS) {
      const s = storeOf(docOf([item(slug, "p")]));
      s.run(ops.splitRetired, {}, { origin: "mcp" });
      const after = expandDoc(savedDoc(s.get()), {});
      const said = subtree(after, "p").flatMap((g) => wordsOf(g.items[0].props)).join("\n");
      /* every word the plain split shows is there, rows that became data filled in from it */
      const plain = splitIntoAtoms(docOf([item(slug, "p")]).groups, "p", "en")!.groups.flatMap((g) => wordsOf(g.items[0].props));
      for (const w of plain) expect(said, `${slug}: ${w}`).toContain(w);
      expect(said, slug).not.toContain("{{");
    }
  });

  it("keeps the tap of every place on the atom that shows it, a list's rows each their own", () => {
    for (const slug of SLUGS) {
      const def = partBySlug(slug)!;
      const slots = def.slots?.(reader(def, {})) ?? [];
      const it = item(slug, "p", {}, { actions: Object.fromEntries(slots.map((x) => [x.key, go(`to-${x.key}`)])) });
      const s = storeOf(docOf([it]));
      s.run(ops.splitRetired, {}, { origin: "mcp" });
      const taps = subtree(savedDoc(s.get()), "p").flatMap((g) => (g.items[0].action ? [g.items[0].action.to] : []));
      for (const x of slots) expect(taps, `${slug} ${x.key}`).toContain(`to-${x.key}`);
    }
  });
});

describe("a retired list split into data", () => {
  /** a retired list split as the editor splits it, and as a plain split */
  const both = (slug: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}) => {
    const doc = docOf([item(slug, "p", props, more)]);
    const s = storeOf(doc);
    const out = s.run(ops.splitRetired, {}, { origin: "mcp" }).split[0];
    const after = savedDoc(s.get());
    const plain = { groups: splitIntoAtoms(doc.groups, "p", "en")!.groups };
    return { out, after, plain };
  };

  it("holds a cart's rows as a collection the row repeats over, and looks the same once the rows are drawn", () => {
    const { out, after, plain } = both("cart-list", {}, { actions: { action: go("checkout") } });
    const cart = after.collections!.find((c) => c.id === out.collection)!;
    expect(cart).toMatchObject({ name: "Shopping cart", fields: ["name", "variant", "price", "quantity"], rows: [["Everyday canvas tote", "Sand / Large", "24.00", "1"], ["Ceramic mug", "Glazed white", "12.50", "2"]] });
    const host = after.groups.find((g) => g.repeat?.collection === cart.id)!;
    expect(host).toBeTruthy();
    const template = subtree(after, host.items[0].id).flatMap((g) => wordsOf(g.items[0].props));
    expect(template).toEqual(expect.arrayContaining(["{{name}}", "{{variant}}", "{{price}}", "{{quantity}}"]));
    /* drawn out, the rows are the plain split's, part for part */
    expect(drawn(subtree(expandDoc(after, {}), "p"), new Set([host.id]))).toEqual(drawn(subtree(plain, "p")));
    /* the checkout keeps its tap, and the total is the words the part showed, no longer worked out */
    expect(subtree(after, "p").find((g) => g.items[0].action?.to === "checkout")?.items[0].props?.label).toBe("Checkout (3)");
  });

  it("keeps the rows that read alike as data: comments, contacts in one run, unread-free notifications, tasks of one state, a settings list of one kind", () => {
    const cases: [string, Record<string, unknown>, string[]][] = [
      ["comment-list", {}, ["name", "time", "comment", "likes", "initials"]],
      ["contact-list", { grouped: false, search: "" }, ["name", "note", "initials"]],
      ["notification-list", { unread: 0 }, ["title", "body", "time", "icon"]],
      ["todo-list", { items: [{ label: "Reply to Grace", variant: "todo" }, { label: "Book the flights", variant: "todo" }] }, ["task", "status"]],
      ["settings-group", { data: { columns: ["Icon", "Label", "Control", "Value"], rows: [["wifi", "Wi-Fi", "arrow", "Home"], ["bluetooth", "Bluetooth", "arrow", "On"]] } }, ["icon", "label", "control", "value"]],
    ];
    for (const [slug, props, fields] of cases) {
      const { out, after, plain } = both(slug, props);
      expect(out.collection, slug).toBeTruthy();
      const c = after.collections!.find((x) => x.id === out.collection)!;
      expect(c.fields, slug).toEqual(fields);
      const host = after.groups.find((g) => g.repeat?.collection === c.id)!;
      /* the box that repeats a row is drawn around the rows, unless it is the outermost box itself */
      const skip = new Set(host.items[0].id === "p" ? [] : [host.id]);
      expect(drawn(subtree(expandDoc(after, {}), "p"), skip), slug).toEqual(drawn(subtree(plain, "p")));
    }
  });

  it("leaves rows as atoms where they do not read alike, or their taps differ", () => {
    const cases: [string, Record<string, unknown>, Partial<Item>][] = [
      /* letters between the contacts, unread notifications drawn apart, done and open tasks, switches beside arrows */
      ["contact-list", {}, {}],
      ["notification-list", {}, {}],
      ["todo-list", {}, {}],
      ["settings-group", {}, {}],
      /* each row going somewhere of its own */
      ["notification-list", { unread: 0 }, { actions: { "tab:0": go("a"), "tab:1": go("b") } }],
    ];
    for (const [slug, props, more] of cases) {
      const { out, after, plain } = both(slug, props, more);
      expect(out.collection, slug).toBeUndefined();
      expect(after.collections ?? [], slug).toEqual([]);
      expect(drawn(subtree(after, "p")), slug).toEqual(drawn(subtree(plain, "p")));
    }
    /* the same tap on every row is the row's tap, data or not */
    const { out, after } = both("notification-list", { unread: 0 }, { actions: { "tab:0": go("open"), "tab:1": go("open"), "tab:2": go("open") } });
    expect(out.collection).toBeTruthy();
    const host = after.groups.find((g) => g.repeat)!;
    expect(subtree(after, host.items[0].id)[1].items[0].action).toEqual(go("open"));
  });

  it("reads a table's own words as the fields, and names a second collection apart", () => {
    const rows = retiredRows(partBySlug("cart-list")!, reader(partBySlug("cart-list")!, { data: { columns: ["Product name", "Size", "Cost", "Qty"], rows: [["A", "S", "1", "1"]] } }));
    expect(rows!.fields).toEqual(["productName", "size", "cost", "qty"]);
    const s = storeOf(docOf([item("cart-list", "a"), item("cart-list", "b")]));
    s.run(ops.splitRetired, {}, { origin: "mcp" });
    expect(savedDoc(s.get()).collections!.map((c) => c.name)).toEqual(["Shopping cart", "Shopping cart 2"]);
  });
});

describe("a split retired part, exported", () => {
  const split = () => {
    const slots = (slug: string) => partBySlug(slug)!.slots?.(reader(partBySlug(slug)!, {})) ?? [];
    const s = storeOf(docOf(SLUGS.map((slug, i) => item(slug, `p${i}`, {}, { actions: Object.fromEntries(slots(slug).map((x) => [x.key, go("target")])) }))));
    s.run(ops.splitRetired, {}, { origin: "mcp" });
    return savedDoc(s.get());
  };

  it("is atoms on the web: none of the parts' own components", () => {
    const { code } = buildCode(split(), {});
    for (const name of WIDGETS) expect(code, name).not.toMatch(new RegExp(`<${name}\\b`));
  });

  it("is the kit's own atoms on a phone and in a mini-program, with every tap", () => {
    const doc = split();
    const rn = printRnScreens(doc, {});
    const mini = printMiniScreens(doc, {});
    for (const printed of [rn, mini]) {
      expect(printed.warnings.filter((w) => ["placeholder", "slot", "atoms", "unknown"].includes(w.kind))).toEqual([]);
      for (const sc of printed.screens) expect(sc.source).not.toContain("<Placeholder");
    }
    expect(rn.screens.filter((sc) => sc.source.includes('nav.go("Target")')).length).toBe(SLUGS.filter((slug) => partBySlug(slug)!.slots).length);
  });

  it("draws an old document's unsplit ones as their atoms on a phone and in a mini-program, their taps kept", () => {
    const slots = (slug: string) => partBySlug(slug)!.slots?.(reader(partBySlug(slug)!, {})) ?? [];
    const doc = docOf(SLUGS.map((slug, i) => item(slug, `p${i}`, {}, { actions: Object.fromEntries(slots(slug).map((x) => [x.key, go("target")])) })));
    for (const printed of [printRnScreens(doc, {}), printMiniScreens(doc, {})]) {
      for (const sc of printed.screens) expect(sc.source).not.toContain("<Placeholder");
      expect(printed.warnings.filter((w) => w.kind === "placeholder" || w.kind === "slot")).toEqual([]);
    }
  });
});

describe("the retired resizable", () => {
  /** an old design: a resizable with a button over its second panel, and a retired cart on a screen of its own */
  const oldDoc = (): Doc => {
    const doc = docOf([item("resizable", "rz", { width: 360, height: 160, split: 40, first: "Folders" }), item("cart-list", "cart")]);
    const rz = doc.groups[0];
    doc.groups.push({ id: "g-b", x: rz.x + 240, y: rz.y + 60, axis: "x", items: [item("button", "b", { label: "Go" })] });
    return doc;
  };

  it("is retired like the others: drawn and opened as before, not offered, refused when added, a split view in its place", async () => {
    const def = partBySlug("resizable")!;
    expect(def.retired).toMatchObject({ with: ["split-view"], convert: "convert_to_split_view" });
    expect(OFFERED_PARTS.includes(def)).toBe(false);
    expect(viewOf(def, {}).type).toBe("ResizablePanelGroup");
    const doc = oldDoc();
    expect(openProject({ format: "m3e-project", version: 2, document: doc })!.groups).toEqual(doc.groups);
    const [offered, retired] = partCatalog().split("#### Retired");
    expect(offered).not.toContain("| `resizable` |");
    expect(retired).toContain("| `resizable` |");
    const s = storeOf(docOf([]));
    const listed = (await executeTool(s, "list_parts", {}, { origin: "mcp" })) as { ok: true; result: { parts: string[] } };
    expect(listed.result.parts.some((row) => row.startsWith("resizable |"))).toBe(false);
    const added = await executeTool(s, "add_part", { slug: "resizable", screen: "s0" }, { origin: "ai" });
    expect(!added.ok && added.error.code).toBe("refused");
    expect(!added.ok && added.error.message).toContain("convert_to_split_view");
  });

  it("converts to a split view in split_retired, in the one step that splits the others, its parts in their pane; one undo puts all back", async () => {
    const doc = oldDoc();
    const s = storeOf(doc);
    expect(retiredParts(doc.groups).map((r) => r.item.id)).toEqual(["rz", "cart"]);
    /* it is no split into atoms */
    const atoms = await executeTool(s, "split_into_atoms", { id: "rz" }, { origin: "mcp" });
    expect(!atoms.ok && atoms.error.message).toContain("convert_to_split_view");
    const out = s.run(ops.splitRetired, {}, { origin: "user" });
    expect(out.split.map((x) => [x.id, x.became])).toEqual([["rz", "split-view"], ["cart", undefined]]);
    const after = savedDoc(s.get());
    expect(retiredParts(after.groups)).toEqual([]);
    const host = after.groups.find((g) => g.items[0]?.id === "rz")!;
    expect(host.items[0]).toMatchObject({ component: "split-view", props: { split: 40, width: 360, height: 160 } });
    const pane = after.groups.find((g) => g.id === after.groups.find((x) => x.items[0]?.id === "b")!.inFlow)!;
    expect(pane).toMatchObject({ inFlow: host.id, splitPane: "second" });
    expect(after.groups.find((g) => g.items[0]?.id === "cart")!.items[0].component).toBe("box");
    s.undo("user");
    expect(savedDoc(s.get()).groups).toEqual(doc.groups);
  });
});
