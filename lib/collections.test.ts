import { describe, expect, it } from "vitest";
import { CURRENT_TOKEN, collectionOf, collectionText, expandRepeats, fillCurrent, fillRow, markCurrent, repeatAround, rowOf, rowsOfRepeat, tableOf, tableText } from "./collections";
import { canvasView, expandDoc } from "./expand";
import { arrangeFlows } from "./flow";
import { expandInstances, rekeyedAll, standIn } from "./instances";
import { applyEffects, chooseBranch, inRow, leftRow, liveItem, startState } from "./interact";
import { openProject, projectFile } from "./project";
import { buildPrompt } from "./prompt";
import { buildCode } from "./codegen";
import { type Collection, type ComponentDef, type Doc, type Group, makeItem } from "./tokens";

const posts: Collection = { id: "posts", name: "Posts", fields: ["title", "tag"], rows: [["One", "a"], ["Two", "b"], ["Three", "c"], ["Four", "d"], ["Five", "e"]] };

const hostItem = (extra: Record<string, unknown> = {}) => ({ ...makeItem("container"), id: "hi", props: { layout: "column", gap: 8, padX: 0, padY: 0, hugHeight: true, width: 300, height: 40, ...extra } });
const host = (repeat: Group["repeat"] = { collection: "posts" }): Group => ({ id: "h", x: 16, y: 100, axis: "x", items: [hostItem()], ...(repeat ? { repeat } : {}) });
const row: Group = { id: "t", x: 16, y: 100, axis: "x", inFlow: "h", items: [{ ...makeItem("button"), id: "b", props: { label: "{{title}}" }, action: { to: "detail" } }] };
const sizes = { b: 100, "b:h": 40 };
const doc = (over: Partial<Doc> = {}): Doc => ({ groups: [host(), row], frames: [{ id: "f", name: "F", x: 0, y: 0 }, { id: "detail", name: "D", x: 500, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "", collections: [posts], ...over });

describe("rows", () => {
  it("reads a row by its fields, and a limit takes the first rows", () => {
    expect(rowOf(posts, 1)).toEqual({ title: "Two", tag: "b" });
    expect(rowsOfRepeat(posts, 2)).toHaveLength(2);
    expect(rowsOfRepeat(posts)).toHaveLength(5);
    expect(rowOf({ ...posts, rows: [["only"]] }, 0)).toEqual({ title: "only", tag: "" });
  });

  it("fills tokens it knows and leaves the rest as written", () => {
    expect(fillRow("{{row.title}} / {{ row.tag }} / {{row.nope}}! / {{vars.n}} / {{current.title}}", rowOf(posts, 0))).toBe("One / a / ! / {{vars.n}} / {{current.title}}");
    /* the older bare field, read-only, where version 4 could not tell a part is in the repeat */
    expect(fillRow("{{title}} / {{ tag }} / {{nope}} / {{current.title}}", rowOf(posts, 0))).toBe("One / a / {{nope}} / {{current.title}}");
    expect(fillCurrent({ a: ["{{current.title}} {{title}}"] }, { title: "X" })).toEqual({ a: ["X {{title}}"] });
    expect(fillCurrent({ a: "{{current.none}}!" }, {})).toEqual({ a: "!" });
    const same = { a: "plain" };
    expect(fillCurrent(same, { title: "X" })).toBe(same);
  });

  /* `{{` and a long run of spaces with no `}}`: the token's pattern used to try every split of the run (cubic), so a
     row's or a part's words could freeze the canvas, the preview and the export */
  it("reads an unclosed {{ before a long run of spaces at once", () => {
    const t = performance.now();
    for (const words of [`{{${" ".repeat(50_000)}x`, `{{current.${" ".repeat(50_000)}x`, `{{ current.title${" ".repeat(50_000)}`]) {
      expect(fillRow(words, rowOf(posts, 0))).toBe(words);
      expect(fillCurrent(words, { title: "X" })).toBe(words);
      expect(words.split(CURRENT_TOKEN)).toEqual([words]);
      expect(markCurrent(words, () => "!")).toBe(words);
    }
    expect(performance.now() - t).toBeLessThan(500);
    expect("a {{ current.title }} b {{current.first name}}".split(CURRENT_TOKEN)).toEqual(["a ", "title", " b ", "first name", ""]);
  });

  it("edits a collection as the table text a table prop uses", () => {
    expect(collectionText(posts).split("\n")[1]).toBe("One, a");
    expect(collectionOf("name, age\nAda, 36\n\n")).toEqual({ fields: ["name", "age"], rows: [["Ada", "36"]] });
  });
});

describe("a table as text", () => {
  /* the defaults the parts carry: an amount with a comma used to come back from the editor as two cells */
  const money = { columns: ["Item", "Amount"], rows: [["Desk", "$1,350.00"], ["Credit", "+3,200.00"], ["Views", "9,820"]] };

  it("keeps a cell with a comma in one cell, in quotes", () => {
    const text = tableText(money);
    expect(text.split("\n")[1]).toBe('Desk, "$1,350.00"');
    expect(tableOf(text)).toEqual(money);
    expect(tableOf('Item, Amount\nDesk, "$1,350.00"').rows[0]).toEqual(["Desk", "$1,350.00"]);
  });

  it("writes a plain table as it always did", () => {
    expect(tableText({ columns: ["a", "b"], rows: [["1", "2"]] })).toBe("a, b\n1, 2");
    expect(tableOf("a,b\n 1 ,2 ")).toEqual({ columns: ["a", "b"], rows: [["1", "2"]] });
  });

  it("reads CSV quotes: a doubled quote, a line break and a comma inside, space kept inside", () => {
    expect(tableOf('q\n"He said ""hi"""')).toEqual({ columns: ["q"], rows: [['He said "hi"']] });
    expect(tableOf('q, r\n"two\nlines", x')).toEqual({ columns: ["q", "r"], rows: [["two\nlines", "x"]] });
    expect(tableOf('q\n" padded "')).toEqual({ columns: ["q"], rows: [[" padded "]] });
    expect(tableOf("q\r\na\r\nb")).toEqual({ columns: ["q"], rows: [["a"], ["b"]] });
  });

  it("takes a quote no other closes as a letter, so one just typed swallows nothing", () => {
    expect(tableOf('Item, Amount\nDesk, "$1,350\nLamp, 20')).toEqual({ columns: ["Item", "Amount"], rows: [["Desk", '"$1', "350"], ["Lamp", "20"]] });
    expect(tableOf('a\n5" screen')).toEqual({ columns: ["a"], rows: [['5" screen']] });
  });

  it("drops blank lines but keeps a row whose one cell is empty, written as quotes", () => {
    expect(tableOf("a\n\n   \nx\n")).toEqual({ columns: ["a"], rows: [["x"]] });
    const lone = { columns: ["a"], rows: [[""], ["x"]] };
    expect(tableText(lone)).toBe('a\n""\nx');
    expect(tableOf(tableText(lone))).toEqual(lone);
  });

  it("reads back every table it writes", () => {
    const pieces = ["", " ", "a", "b c", ",", '"', '""', "\n", "x,y", ' lead', "trail ", "$1,350.00", '5" screen', "a\nb", "\t", "中文，逗号", "é"];
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647);
    const word = () => Array.from({ length: next() % 3 }, () => pieces[next() % pieces.length]).join("");
    for (let n = 0; n < 400; n++) {
      const width = 1 + (next() % 4);
      const row = () => Array.from({ length: width }, word);
      const table = { columns: row(), rows: Array.from({ length: next() % 4 }, row) };
      expect(tableOf(tableText(table)), JSON.stringify(table)).toEqual(table);
    }
  });
});

describe("expanding a repeat", () => {
  const out = expandDoc(doc(), sizes).groups;

  it("draws the template once per row, and row one keeps its ids", () => {
    const rows = out.filter((g) => g.inFlow === "h");
    expect(rows.map((g) => g.id)).toEqual(["t", "h#1/t", "h#2/t", "h#3/t", "h#4/t"]);
    expect(rows[0].items[0].id).toBe("b");
    expect(rows.map((g) => g.items[0].props?.label)).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(out.some((g) => g.repeat)).toBe(false);
  });

  it("stamps each copy with its row, for a tap to run with", () => {
    expect(out.find((g) => g.id === "h#3/t")?.items[0].row).toEqual({ title: "Four", tag: "d" });
  });

  it("drives the layout: a hugging column grows with the rows, in order", () => {
    const h = out.find((g) => g.id === "h")!;
    expect(h.items[0].props?.height).toBe(5 * 40 + 4 * 8);
    expect(out.filter((g) => g.inFlow === "h").map((g) => g.y)).toEqual([100, 148, 196, 244, 292]);
  });

  it("settles: a second arrangeFlows changes nothing", () => {
    const measures = Object.fromEntries(out.flatMap((g) => g.items.flatMap((it) => [[it.id, 100], [`${it.id}:h`, 40]])));
    expect(arrangeFlows(out, measures)).toBe(out);
  });

  it("makes room below it in an outer layout", () => {
    const outer: Group = { id: "o", x: 0, y: 0, axis: "x", items: [{ ...makeItem("container"), id: "oi", props: { layout: "column", gap: 0, padX: 0, padY: 0, hugHeight: true, width: 300, height: 40 } }] };
    const after: Group = { id: "after", x: 0, y: 0, axis: "x", inFlow: "o", items: [{ ...makeItem("button"), id: "ab", props: {} }] };
    const groups = expandDoc(doc({ groups: [outer, { ...host(), inFlow: "o" }, row, after] }), { ...sizes, ab: 100, "ab:h": 40 }).groups;
    expect(groups.find((g) => g.id === "after")?.y).toBe(5 * 40 + 4 * 8);
  });

  it("takes a limit, and an empty collection draws no row in the expansion", () => {
    expect(expandDoc(doc({ groups: [host({ collection: "posts", limit: 2 }), row] }), sizes).groups.filter((g) => g.inFlow === "h")).toHaveLength(2);
    const empty = doc({ collections: [{ ...posts, rows: [] }] });
    expect(expandDoc(empty, sizes).groups.filter((g) => g.inFlow === "h")).toHaveLength(0);
    /* the canvas keeps the template, or it could not be selected */
    expect(canvasView(empty, sizes).groups.filter((g) => g.inFlow === "h")).toHaveLength(1);
  });

  it("is a plain container when the collection is gone or the layout is off", () => {
    const gone = expandDoc(doc({ collections: [] }), sizes).groups;
    expect(gone.filter((g) => g.inFlow === "h")).toHaveLength(1);
    expect(gone.some((g) => g.repeat)).toBe(false);
    const free: Group = { ...host(), items: [hostItem({ layout: "free" })] };
    expect(expandRepeats([free, row], { collections: [posts], widths: sizes }).filter((g) => g.id.includes("#"))).toHaveLength(0);
  });

  it("copies what the template holds, keeping what it points at inside its row", () => {
    const card: Group = { id: "t", x: 16, y: 100, axis: "x", inFlow: "h", items: [{ ...makeItem("container"), id: "ci", props: { layout: "column", gap: 0, padX: 0, padY: 0, hugHeight: true, width: 200, height: 40 } }] };
    const inner: Group = { id: "k", x: 16, y: 100, axis: "x", inFlow: "t", items: [{ ...makeItem("button"), id: "kb", props: { label: "{{tag}}" }, action: { to: "none", effects: [{ do: "hide", part: "ci" }] } }] };
    const groups = expandDoc(doc({ groups: [host(), card, inner] }), { kb: 100, "kb:h": 40 }).groups;
    const copy = groups.find((g) => g.id === "h#2/k")!;
    expect(copy.inFlow).toBe("h#2/t");
    expect(copy.items[0].props?.label).toBe("c");
    expect(copy.items[0].action?.effects?.[0]).toEqual({ do: "hide", part: "h#2/ci" });
    expect(groups.find((g) => g.id === "k")?.items[0].props?.label).toBe("a");
  });

  it("repeats an instance, and a definition may hold a repeat", () => {
    const def: ComponentDef = { id: "d", name: "Row", w: 100, h: 40, groups: [{ id: "x", x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: "xb", props: { label: "{{title}}" } }] }] };
    const tmpl = { ...standIn(def, 16, 100, "t"), inFlow: "h" };
    const groups = expandDoc(doc({ components: [def], groups: [host(), tmpl] }), { xb: 100, "xb:h": 40 }).groups;
    expect(groups.find((g) => g.id === "t/x")?.items[0].props?.label).toBe("One");
    const second = groups.find((g) => g.id === "h#1/t/x")!;
    expect(second.items[0].props?.label).toBe("Two");
    expect(second.y).toBe(groups.find((g) => g.id === "h#1/t")!.y);
    /* each row's parts stay on their own row: rows start out stacked and must not carry one another along */
    expect(["t/x", "h#1/t/x", "h#2/t/x", "h#3/t/x", "h#4/t/x"].map((id) => groups.find((g) => g.id === id)!.y)).toEqual([100, 148, 196, 244, 292]);
    const holding: ComponentDef = { id: "list", name: "List", w: 300, h: 40, groups: [{ ...host(), x: 0, y: 0 }, { ...row, x: 0, y: 0 }] };
    const inst = expandInstances({ groups: [standIn(holding, 10, 10, "i")], components: [holding], collections: [posts] }, sizes);
    expect(inst.filter((g) => g.inFlow === "i/h")).toHaveLength(5);
    expect(inst[0].items[0].props?.height).toBe(5 * 40 + 4 * 8);
  });
});

describe("on the canvas", () => {
  const view = canvasView(doc(), sizes);

  it("draws row one on the template, and the other rows dimmed on the host", () => {
    expect(view.shown.get("b")?.props?.label).toBe("One");
    const drawn = view.drawn.get("h")!;
    expect(drawn.map((p) => p.item.props?.label)).toEqual(["Two", "Three", "Four", "Five"]);
    expect(drawn.every((p) => p.dim)).toBe(true);
    expect(drawn[0].dy).toBe(48);
  });

  it("writes only places and measures back on the document, never a row's words", () => {
    const t = view.groups.find((g) => g.id === "t")!;
    expect(t.items[0].props?.label).toBe("{{title}}");
    expect(t.items[0].row).toBeUndefined();
    expect(view.groups.find((g) => g.id === "h")?.items[0].props?.height).toBe(232);
    expect(view.groups.find((g) => g.id === "h")?.repeat).toEqual({ collection: "posts" });
    expect(canvasView(doc({ groups: view.groups }), sizes).groups).toBe(view.groups);
  });

  it("knows which repeat a part is the template of", () => {
    expect(repeatAround(doc().groups, row, sizes)?.id).toBe("h");
    expect(repeatAround(doc().groups, host(), sizes)).toBeUndefined();
  });
});

describe("a tap from a row", () => {
  const scope = { groups: [], vars: [{ id: "n", name: "n", type: "text" as const, value: "" }] };
  const row2 = rowOf(posts, 1);

  it("reads the row as read-only variables, for that tap", () => {
    const s = inRow(startState(scope.vars, [posts]), row2);
    expect(s.vars["row.title"]).toBe("Two");
    /* a condition reads the row of the part tapped as `row.<field>` */
    expect(chooseBranch({ to: "x", motion: { kind: "instant" }, when: { expr: 'row.title == "Two"' } }, s, scope, { row: row2 })).not.toBeNull();
    expect(chooseBranch({ to: "x", motion: { kind: "instant" }, when: { expr: 'row.title == "One"' } }, s, scope, { row: row2 })).toBeNull();
    /* nothing can write to it: no variable of the document has that id */
    expect(applyEffects(s, [{ do: "setVar", var: "row.title", value: "Hack" }], scope).vars["row.title"]).toBe("Two");
    const after = leftRow(s, row2);
    expect(after.vars["row.title"]).toBeUndefined();
    expect(after.vars.n).toBe("");
    expect(after.current).toEqual(row2);
  });

  it("fills {{current.field}} from the row last tapped, and starts on the first row", () => {
    const it0 = { ...makeItem("text"), id: "d", props: { text: "{{current.title}}" } };
    const start = startState(undefined, [posts]);
    expect(liveItem(it0, start).props?.text).toBe("One");
    expect(liveItem(it0, inRow(start, row2)).props?.text).toBe("Two");
    expect(startState(undefined)).toEqual({ vars: {}, hidden: {}, props: {}, opened: {}, fields: {}, snack: null });
  });
});

describe("in a file and on a copy", () => {
  it("saves and opens with the collection and the repeat in place", () => {
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc()))))!;
    expect(back.collections).toEqual([posts]);
    expect(back.groups[0].repeat).toEqual({ collection: "posts" });
  });

  it("drops what is of the wrong kind and never refuses the file for it", () => {
    const base = JSON.parse(JSON.stringify(doc()));
    expect(openProject({ ...base, collections: 5 })?.collections).toBeUndefined();
    expect(openProject({ ...base, collections: [{ id: 1 }, { id: "c", fields: "no", rows: [["a", 1, {}], "bad"] }] })?.collections).toEqual([{ id: "c", name: "", fields: [], rows: [["a", "1", ""]] }]);
    expect(openProject({ ...base, groups: [{ ...base.groups[0], repeat: "posts" }] })?.groups[0].repeat).toBeUndefined();
    expect(openProject({ ...base, groups: [{ ...base.groups[0], repeat: { collection: "posts", limit: "x" } }] })?.groups[0].repeat).toEqual({ collection: "posts" });
    expect(openProject({ ...base, groups: [{ ...base.groups[0], rowsOf: {}, expandedFrom: "x" }] })?.groups[0]).not.toHaveProperty("rowsOf");
  });

  it("a copy of a host keeps its repeat, and its template follows it", () => {
    const [newHost, newRow] = rekeyedAll([host(), row], 10, 0);
    expect(newHost.repeat).toEqual({ collection: "posts" });
    expect(newRow.inFlow).toBe(newHost.id);
    const groups = expandDoc(doc({ groups: [newHost, newRow] }), { [newRow.items[0].id]: 100, [`${newRow.items[0].id}:h`]: 40 }).groups;
    expect(groups.filter((g) => g.inFlow === newHost.id)).toHaveLength(5);
  });
});

describe("what is said about it", () => {
  it.each([
    ["en", "one row per item of \"Posts\", 5 rows (fields: title, tag), template: "],
    ["ja", "「Posts」の 1 件につき 1 行、5 行"],
    ["zh", "“Posts”的每一项一行，共 5 行"],
    ["ko", "\"Posts\"의 항목마다 한 행, 5행"],
  ] as const)("the prompt says it once rather than drawing the rows, in %s", (lang, words) => {
    const text = buildPrompt(doc(), sizes, undefined, lang);
    expect(text).toContain(words);
    expect(text).toContain("{{title}}");
    expect(text).not.toContain("Three");
    expect(text).toContain("{{current.");
  });

  it("printed code draws every row", () => {
    const { code } = buildCode(doc(), sizes);
    for (const word of ["One", "Three", "Five"]) expect(code).toContain(word);
    expect(code).not.toContain("{{title}}");
  });
});
