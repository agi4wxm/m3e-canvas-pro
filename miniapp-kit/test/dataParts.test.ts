/* The data and chart parts, the lists that do more than show rows and the desktop parts, as the kit draws them
 * (src/kit/composites/data.tsx, desk.tsx), under bun: their pure pieces (a table read by its structure, a chart drawn
 * as an SVG, Markdown's blocks, a month, a board's lanes, a reorder, a swipe), and the parts themselves drawn headless
 * by the stand-in React the consistency table runs on (test/table/tinyReact.ts, components as names, Taro a fake): what
 * a visitor's taps send out, and that the data's own state (which rows, which card where) is never decided inside. */
import { describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);

const sheets: string[][] = [];
let sheetAnswer = 0;
const copied: string[] = [];
mock.module("@tarojs/taro", () => {
  const taro = {
    showActionSheet: async ({ itemList }: { itemList: string[] }) => (sheets.push(itemList), { tapIndex: sheetAnswer }),
    setClipboardData: async ({ data }: { data: string }) => void copied.push(data),
    createSelectorQuery: () => {
      const q = { select: () => q, boundingClientRect: (fn: (r: { left: number }) => void) => (fn({ left: 100 }), q), exec: () => {} };
      return q;
    },
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    onThemeChange: () => {},
    offThemeChange: () => {},
    getStorageSync: () => "",
    setStorage: async () => {},
  };
  return { default: taro, ...taro };
});
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text" }));

const data = await import("../src/kit/composites/data");
const desk = await import("../src/kit/composites/desk");
const { Agenda, BarList, Chart, DataTable, Kanban, Markdown, Table } = data;
const { CodeBlock, FileList, Menubar, SortableList, SwipeRow } = desk;

/* ---------- drawing a part headless ---------- */

let tree: unknown;
let ui: unknown;
/** draws a part, calling every component in it (the platform's are names) */
const draw = (el?: unknown) => {
  if (el !== undefined) {
    tiny.reset();
    ui = el;
  }
  tree = tiny.render(ui, (t) => typeof t === "function");
  return tree;
};
const h = (type: unknown, props: Record<string, unknown> = {}) => tiny.react.createElement(type as never, props as never);
const all = () => tiny.elements(tree);
/** the words shown, in order */
const wordsIn = (node: unknown, out: string[] = []): string[] => {
  if (Array.isArray(node)) for (const x of node) wordsIn(x, out);
  else if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (node && typeof node === "object" && "props" in node) wordsIn((node as Element).props.children, out);
  return out;
};
const words = (node: unknown = tree) => wordsIn(node);
const named = (label: string) => all().filter((e) => e.type === "View" && e.props.ariaLabel === label);
/** taps the view a screen reader calls `label` (the one that answers a tap), and draws again */
const tap = (label: string) => {
  const e = named(label).find((x) => typeof x.props.onClick === "function");
  if (!e) throw new Error(`nothing called "${label}" to tap`);
  (e.props.onClick as (ev: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} });
  draw();
};
const input = (label: string) => {
  const e = all().find((x) => x.type === "Input" && x.props.ariaLabel === label);
  if (!e) throw new Error(`no input "${label}"`);
  return e.props as Record<string, (ev: { detail: { value: string } }) => void>;
};
const paint = (role: string) => `#${role}`;

/* ---------- tables and charts ---------- */

describe("tables as the parts read them", () => {
  it("takes a table prop as words, writes a cell as its column says, and reads amounts as the canvas does", () => {
    expect(data.tableOf({ columns: ["A", 2], rows: [["x", 3, null]], spec: [{ key: "a" }, "no"] })).toEqual({ columns: ["A", "2"], rows: [["x", "3", ""]], spec: [{ key: "a" }] });
    expect(data.tableOf(7)).toEqual({ columns: [], rows: [] });
    expect(data.formatCell("250", { key: "t", type: "currency" })).toBe("$250.00");
    expect(data.formatCell("0.54", { key: "s", type: "percent" })).toBe("54%");
    expect(data.formatCell("no", { key: "b", type: "bool" })).toBe("—");
    expect(data.columnsOf({ columns: ["Due date", ""], rows: [] }).map((c) => c.key)).toEqual(["dueDate", "col2"]);
    expect(data.alignOf({ key: "n", type: "number" })).toBe("end");
    expect(data.amountOf("$1,350.00")).toBe(1350);
  });

  it("a table draws by its structure: values written by type, numbers at the end", () => {
    draw(h(Table, { data: { columns: ["Invoice", "Amount"], rows: [["INV-1", "250"]], spec: [{ key: "invoice", width: 120 }, { key: "amount", type: "currency", format: "EUR" }] } }));
    expect(words()).toContain("€250.00");
    const cell = all().find((e) => e.props.children === "€250.00")!;
    expect((cell.props.style as Record<string, unknown>).textAlign).toBe("right");
  });
});

describe("charts drawn as pictures", () => {
  const t = { columns: ["Month", "Desktop", "Mobile"], rows: [["Jan", "186", "80"], ["Feb", "305", "200"], ["Mar", "237", "120"]] };
  const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;

  it("tops the value axis as Recharts does", () => {
    expect(data.niceTop(305)).toBe(320);
    expect(data.niceTop(840)).toBe(1000);
    expect(data.seriesOf(t).series.map((s) => s.label)).toEqual(["Desktop", "Mobile"]);
  });

  it("draws bars side by side or stacked, lines, areas, a ring and a radar, in the series' colors", () => {
    const bar = data.chartPicture("bar", t, 420, 220, paint);
    expect(count(bar.svg, "rect")).toBe(6);
    expect(bar.svg).toContain('fill="#primary"');
    expect(bar.svg).toContain('fill="#tertiary"');
    expect(count(bar.svg, "line")).toBe(5);
    expect(bar.labels.map((l) => l.text)).toEqual(["Jan", "Feb", "Mar"]);
    expect(count(data.chartPicture("stacked-bar", t, 420, 220, paint).svg, "rect")).toBe(6);
    expect(count(data.chartPicture("line", t, 420, 220, paint).svg, "path")).toBe(2);
    expect(count(data.chartPicture("area", t, 420, 220, paint).svg, "path")).toBe(4);
    const pie = data.chartPicture("pie", t, 420, 220, paint);
    expect(pie.polar).toBe(true);
    expect(count(pie.svg, "path")).toBe(3);
    expect(pie.svg).toContain('preserveAspectRatio="xMidYMid meet"');
    const radar = data.chartPicture("radar", t, 420, 220, paint);
    expect(count(radar.svg, "polygon")).toBe(6);
    expect(radar.labels.map((l) => l.anchor)).toEqual(["middle", "start", "end"]);
  });

  it("plots points, fills a gauge, draws a sparkline and heats cells", () => {
    expect(data.scatterPicture({ columns: ["X", "Y"], rows: [["0", "0"], ["10", "10"]] }, "#p")).toContain('<ellipse cx="0" cy="100"');
    expect(data.gaugePicture(0, "#t", "#p").split("<path").length - 1).toBe(1);
    expect(data.gaugePicture(100, "#t", "#p")).toContain("A 50 50 0 0 1 110 60");
    expect(data.sparkValues("1, 2,x,,3")).toEqual([1, 2, 3]);
    expect(data.sparkPicture([1, 2, 3], "bar", 100, 40, 1, paint).split('opacity="0.4"').length - 1).toBe(2);
    expect(data.heatOf("9", 9)).toBeCloseTo(1);
    expect(data.heatOf("0", 9)).toBeCloseTo(0.1);
  });

  it("a chart is a picture with the names over it, and says its values", () => {
    draw(h(Chart, {}));
    expect(all().some((e) => e.type === "Image" && String(e.props.src).startsWith("data:image/svg+xml;base64,"))).toBe(true);
    expect(words()).toEqual(expect.arrayContaining(["Visitors", "Jan", "Jun"]));
    expect(all().some((e) => e.props.ariaRole === "img" && String(e.props.ariaLabel).includes("Desktop: 186, 305"))).toBe(true);
  });

  it("a bar list puts the largest first and says which row was tapped", () => {
    expect(data.barLines([["a", "1", "10%"], ["b", "2", "90%"]], true).map((l) => [l.label, l.part])).toEqual([["b", 1], ["a", 1 / 9]]);
    const picked: number[] = [];
    draw(h(BarList, { selected: 0, onSelect: (i: number) => picked.push(i) }));
    expect(words()).toContain("54%");
    tap("Direct 2,140");
    expect(picked).toEqual([1]);
  });
});

describe("Markdown", () => {
  it("reads the blocks and marks the canvas renders, and draws HTML as words", () => {
    expect(data.markdownBlocks("## Two\n- a\n- b\n> q").map((b) => b.kind)).toEqual(["heading", "list", "quote"]);
    expect(data.markdownSpans("**b** `c`")).toEqual([{ kind: "bold", text: "b" }, { kind: "text", text: " " }, { kind: "code", text: "c" }]);
    draw(h(Markdown, { text: "# Hello\n\nA <b>x</b>" }));
    expect(all().some((e) => e.props.ariaRole === "heading")).toBe(true);
    expect(words()).toContain("A <b>x</b>");
  });
});

/* ---------- parts that answer ---------- */

describe("a data table", () => {
  it("searches, sorts and pages a draft of its own", () => {
    const rows = [["b", "10"], ["a", "9"], ["c", "100"]];
    expect(data.tableLines(rows, { query: "", sort: { column: 1, down: true }, page: 0, pageSize: 5, total: 0 }).shown.map((l) => l.id)).toEqual([2, 0, 1]);
    expect(data.tableLines(rows, { query: "", sort: null, page: 9, pageSize: 2, total: 0 })).toMatchObject({ current: 1, pages: 2 });
  });

  it("sends what is asked of it, a row's tap runs only that row's, and new props start it over", () => {
    const heard: [string, unknown][] = [];
    const say = (name: string) => (e: unknown) => heard.push([name, e]);
    let row = 0;
    let whole = 0;
    const props = { onSearch: say("search"), onSort: say("sort"), onPage: say("page"), onSelect: say("select"), onPress: () => whole++, taps: { "row:1": () => row++ } };
    draw(h(DataTable, props));
    expect(words()).toContain("1–5 / 7");
    tap("Next");
    expect(words()).toContain("6–7 / 7");
    tap("Total");
    expect(heard).toEqual([["page", { page: 1 }], ["sort", { column: 3, dir: "asc" }], ["page", { page: 0 }]]);
    input("Search").onInput({ detail: { value: "grace" } });
    draw();
    expect(heard.at(-1)).toEqual(["search", { query: "grace" }]);
    expect(all().filter((e) => String(e.props["data-part"] ?? "").startsWith("row:")).map((e) => e.props["data-part"])).toEqual(["row:1"]);
    tap("A-1002");
    expect(row).toBe(1);
    expect(whole).toBe(0);
    draw(h(DataTable, { ...props, query: "Paid" }));
    expect(words()).toContain("1–4 / 4");
  });
});

describe("a board", () => {
  it("sends a card opened, moved and added (once), and shows the data's cards as they are", () => {
    const heard: [string, unknown][] = [];
    draw(h(Kanban, { onOpen: (e: unknown) => heard.push(["open", e]), onMove: (e: unknown) => heard.push(["move", e]), onAdd: (e: unknown) => heard.push(["add", e]) }));
    tap("Draw the screens");
    tap("Move right");
    expect(heard).toEqual([["open", { row: 0, lane: 1 }], ["move", { row: 0, from: 1, to: 2, before: -1 }]]);
    expect(named("In progress")).toHaveLength(1);
    expect(words().filter((w) => w === "Draw the screens")).toHaveLength(1);
    /* the board's own words: the second card in "Done" stays where the data has it */
    expect(data.lanesOf({ columns: ["A"], rows: [["x"], ["x"]] })[0].cards.map((c) => c.id)).toEqual(["0\u0001x", "0\u0001x\u00001"]);
    const add = all().filter((e) => e.type === "View" && typeof e.props.onClick === "function" && words(e).includes("Add card"))[0];
    (add.props.onClick as (ev: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} });
    draw();
    input("Add card").onConfirm({ detail: { value: " Plan " } });
    input("Add card").onBlur({ detail: { value: " Plan " } });
    draw();
    expect(heard.at(-1)).toEqual(["add", { lane: 0, text: "Plan" }]);
    expect(heard.filter(([n]) => n === "add")).toHaveLength(1);
  });
});

describe("an agenda", () => {
  it("lays out a month and sends the day picked and the month turned, and starts over on new props", () => {
    expect(data.monthOf(2026, 11, "sunday", [], 40)).toMatchObject({ days: 30, lead: 0, today: 30, title: "November 2026" });
    const heard: [string, unknown][] = [];
    draw(h(Agenda, { onDay: (e: unknown) => heard.push(["day", e]), onMonth: (e: unknown) => heard.push(["month", e]) }));
    expect(words()).toContain("Team stand-up");
    tap("2026-11-20");
    expect(words()).toContain("Dinner with Ada");
    tap("Next month");
    expect(words()).toContain("December 2026");
    expect(heard).toEqual([["day", { year: 2026, month: 11, day: 20, date: "2026-11-20" }], ["month", { year: 2026, month: 12 }]]);
    draw(h(Agenda, { month: 10 }));
    expect(words()).toContain("October 2026");
  });
});

describe("lists", () => {
  it("reorders, lands a drag, opens a swipe, and knows a file's kind and a tree row's level", () => {
    expect(desk.moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(desk.dragTarget(0, 60, 3)).toBe(1);
    expect(desk.dragTarget(1, -500, 3)).toBe(0);
    expect(desk.swipeOpens(0, -45)).toBe(true);
    expect(desk.swipeOpens(-88, 45)).toBe(false);
    expect([desk.fileIcon("a.mp3"), desk.fileIcon("Notes")]).toEqual(["audio_file", "folder"]);
    expect(desk.depthOf("    deep")).toBe(2);
    expect(desk.trackRole(" warn")).toBe("tertiary");
    expect(desk.diffLines("+x\n-y").map((l) => l.kind)).toEqual(["added", "removed"]);
  });

  it("a sortable list moves a tapped row with its arrows, hands out the order, and holds it when controlled", () => {
    const orders: string[][] = [];
    const moves: unknown[] = [];
    draw(h(SortableList, { onChange: (v: { label: string }[]) => orders.push(v.map((r) => r.label)), onReorder: (e: unknown) => moves.push(e) }));
    tap("First");
    tap("Move down");
    expect(moves).toEqual([{ from: 0, to: 1 }]);
    expect(orders).toEqual([["Second", "First", "Third"]]);
    expect(words().filter((w) => ["First", "Second", "Third"].includes(w))).toEqual(["First", "Second", "Third"]);
    /* nobody takes the order: a draft moves */
    draw(h(SortableList, {}));
    tap("Third");
    tap("Move up");
    expect(words().filter((w) => ["First", "Second", "Third"].includes(w))).toEqual(["First", "Third", "Second"]);
    /* a held list moves nothing */
    draw(h(SortableList, { disabled: true, onReorder: (e: unknown) => moves.push(e) }));
    expect(named("First").every((e) => e.props.onClick === undefined)).toBe(true);
  });

  it("a swipe row opens on a swipe past half its action or a long press, and its action only asks", () => {
    const heard: unknown[] = [];
    const values: boolean[] = [];
    let acted = 0;
    draw(h(SwipeRow, { onOpen: (e: unknown) => heard.push(e), onChange: (v: boolean) => values.push(v), taps: { action: () => acted++ } }));
    const face = () => named("Swipe me left")[0].props as Record<string, (e: unknown) => void>;
    face().onTouchStart({ touches: [{ clientX: 200, clientY: 10 }] });
    draw();
    face().onTouchMove({ touches: [{ clientX: 140, clientY: 12 }] });
    draw();
    face().onTouchEnd({ changedTouches: [{ clientX: 140, clientY: 12 }] });
    draw();
    expect(heard).toEqual([{ open: true }]);
    expect(values).toEqual([true]);
    draw(h(SwipeRow, { open: true, onOpen: (e: unknown) => heard.push(e) }));
    face().onLongPress({});
    expect(heard.at(-1)).toEqual({ open: false });
    draw(h(SwipeRow, { taps: { action: () => acted++ } }));
    const button = all().find((e) => e.type === "View" && typeof e.props.onClick === "function" && words(e).includes("Delete"))!;
    (button.props.onClick as (ev: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} });
    expect(acted).toBe(1);
  });

  it("a file list's remove button only asks, and does nothing of itself when nothing is wired", () => {
    let removed = 0;
    let whole = 0;
    const picked: number[] = [];
    draw(h(FileList, { onPress: () => whole++, onSelect: (i: number) => picked.push(i), taps: { "remove:1": () => removed++ } }));
    tap("Remove Q3 report.pdf");
    tap("Remove Budget.xlsx");
    expect([removed, whole]).toEqual([1, 0]);
    expect(words()).toContain("Q3 report.pdf");
    tap("Budget.xlsx");
    expect(picked).toEqual([3]);
    expect(whole).toBe(1);
  });
});

describe("desktop parts", () => {
  it("a menu bar opens a menu's items in the platform's sheet and runs the one picked", async () => {
    let printed = 0;
    sheetAnswer = 2;
    draw(h(Menubar, { taps: { "tab:2": () => printed++ } }));
    tap("Edit");
    expect(named("Edit")[0].props.ariaSelected).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    draw();
    expect(sheets.at(-1)).toEqual(["New tab", "New window", "Print"]);
    expect(printed).toBe(1);
    expect(named("Edit")[0].props.ariaSelected).toBe(false);
  });

  it("a code block copies its code to the clipboard", async () => {
    draw(h(CodeBlock, { code: "let a = 1", language: "JS" }));
    expect(words()).toEqual(expect.arrayContaining(["JS", "let a = 1"]));
    tap("Copy");
    await new Promise((r) => setTimeout(r, 0));
    expect(copied).toEqual(["let a = 1"]);
  });
});
