import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Agenda, BarList, Chart, DataTable, FileDiff, FileList, FunnelChart, GanttChart, Gauge, Heatmap, Kanban, Markdown, Menubar, NavProvider, registerIcons, ScatterPlot, SortableList, Sparkline, SwipeRow, Table, Text, ThemeProvider, Tracker, Tree, Window } from "../src/kit";
import { amountOf, formatCell, lanesOf, markdownBlocks, markdownSpans, monthOf, niceTop, seriesOf, sparkValues, tableLines, tableOf, type TableData } from "../src/kit/composites/data";
import { depthOf, diffLines, fileIcon, moved, rowWords, swipeOpens } from "../src/kit/composites/desk";
import { App as DataApp } from "../src/printed/data/App";
import { icons as dataIcons } from "../src/printed/data/icons";
import { SCREENS as DATA } from "../src/printed/data/screens";
import { theme as dataTheme } from "../src/printed/data/theme";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* The data and chart parts, the lists that do more than show rows and the desktop parts, as the kit draws them
 * (composites/data.tsx, composites/desk.tsx): what each shows of its props and its table, what a visitor's taps and
 * moves send out, and that the data's own state (which rows, which card where) is never decided inside. */

const colors = MATERIAL_THEME.light.colors;
const again = (ui: ReactElement) => <ThemeProvider theme={MATERIAL_THEME}>{ui}</ThemeProvider>;
const action = (actionName: string) => ({ nativeEvent: { actionName } });
/** the shapes of a kind the drawing holds (react-native-svg draws a polygon as a path) */
const shapes = (type: "RNSVGRect" | "RNSVGPath" | "RNSVGEllipse") => screen.container.queryAll((n) => n.type === type);

describe("tables as the parts read them", () => {
  it("takes a table prop as words, and anything else as an empty table", () => {
    expect(tableOf({ columns: ["A", 2], rows: [["x", 3, null]], spec: [{ key: "a" }, "no"] })).toEqual({ columns: ["A", "2"], rows: [["x", "3", ""]], spec: [{ key: "a" }] });
    expect(tableOf("nope")).toEqual({ columns: [], rows: [] });
  });

  it("writes a cell as its column says, and reads amounts as the canvas does", () => {
    expect(formatCell("250", { key: "total", type: "currency" })).toBe("$250.00");
    expect(formatCell("0.54", { key: "share", type: "percent" })).toBe("54%");
    expect(formatCell("1234.5", { key: "n", type: "number", format: "2" })).toBe("1,234.50");
    expect(formatCell("yes", { key: "ok", type: "bool" })).toBe("✓");
    expect(formatCell("words", { key: "n", type: "number" })).toBe("words");
    expect(amountOf("$1,350.00")).toBe(1350);
    expect(amountOf("54%")).toBe(54);
    expect(amountOf("-€12,5")).toBe(-12.5);
  });
});

describe("charts", () => {
  const data: TableData = { columns: ["Month", "Desktop", "Mobile"], rows: [["Jan", "186", "80"], ["Feb", "305", "200"], ["Mar", "237", "120"]] };

  it("tops the value axis as Recharts does, and reads the first column as names and the rest as series", () => {
    expect(niceTop(305)).toBe(320);
    expect(niceTop(0)).toBe(4);
    expect(seriesOf(data)).toEqual({ names: ["Jan", "Feb", "Mar"], series: [{ label: "Desktop", values: [186, 305, 237] }, { label: "Mobile", values: [80, 200, 120] }] });
  });

  it("draws a bar for each value side by side, the names along the foot, and says its values", async () => {
    await draw(<Chart data={data} width={320} />);
    expect(screen.getByText("Visitors")).toBeTruthy();
    for (const name of ["Jan", "Feb", "Mar"]) expect(screen.getByText(name)).toBeTruthy();
    expect(shapes("RNSVGRect")).toHaveLength(6);
    expect(screen.getByLabelText(/Desktop: 186, 305, 237; Mobile: 80, 200, 120/)).toBeTruthy();
  });

  it("stacks bars, runs lines and areas, rings a pie and spreads a radar", async () => {
    await draw(<Chart type="stacked-bar" data={data} />);
    expect(shapes("RNSVGRect")).toHaveLength(6);
    await draw(<Chart type="line" data={data} />);
    expect(shapes("RNSVGPath")).toHaveLength(2);
    await draw(<Chart type="area" data={data} />);
    expect(shapes("RNSVGPath")).toHaveLength(4);
    await draw(<Chart type="pie" data={data} />);
    expect(shapes("RNSVGPath")).toHaveLength(3);
    await draw(<Chart type="radar" data={data} />);
    /* four rings of grid and a shape for each series */
    expect(shapes("RNSVGPath")).toHaveLength(6);
    expect(screen.getByText("Feb")).toBeTruthy();
  });

  it("plots points, heats cells and fills a gauge as far as its value", async () => {
    await draw(<ScatterPlot />);
    expect(shapes("RNSVGEllipse")).toHaveLength(7);
    await draw(<Heatmap />);
    expect(screen.getByText("Wed")).toBeTruthy();
    expect(styleOf(screen.getByLabelText("Tue 9"))).toMatchObject({ opacity: 1, backgroundColor: colors.primary });
    await draw(<Gauge value={40} label="Fuel" />);
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 40 });
  });

  it("a sparkline reads its values from words, and a finger along it shows the value under it", async () => {
    expect(sparkValues("420, 512,x,,480")).toEqual([420, 512, 480]);
    await draw(<Sparkline values="10,20,30" value="30" />);
    expect(screen.getByText("30")).toBeTruthy();
    const plot = screen.getByRole("image");
    await fireEvent(plot, "responderGrant", { nativeEvent: { locationX: 0 } });
    expect(screen.getByText("10")).toBeTruthy();
    await fireEvent(plot, "responderRelease", { nativeEvent: {} });
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("a bar list puts the largest first, shows the open row's share and runs a row's tap", async () => {
    const tap = jest.fn();
    await draw(<BarList selected={1} taps={{ "tab:2": tap }} />);
    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Search 4,820", "Direct 2,140", "Social 1,360", "Email 640"]);
    expect(screen.getByText("24%")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Social 1,360"));
    expect(tap).toHaveBeenCalled();
  });

  it("a funnel says each step's rate to the next, a Gantt chart picks a task", async () => {
    await draw(<FunnelChart />);
    expect(screen.getByText("↓ 40%")).toBeTruthy();
    expect(screen.getAllByTestId("funnel-bar")).toHaveLength(4);
    await draw(<GanttChart />);
    await fireEvent.press(screen.getByLabelText("Design 70%"));
    expect(screen.getByLabelText("Design 70%").props.accessibilityState.selected).toBe(true);
  });
});

describe("a table", () => {
  it("draws the design's rows as they are without a structure, the last column to the right when asked", async () => {
    await draw(<Table alignLast selectedRow={1} caption="Q3" />);
    expect(screen.getByText("Invoices")).toBeTruthy();
    expect(styleOf(screen.getByText("$150.00"))).toMatchObject({ textAlign: "right", color: colors["on-secondary-container"] });
    expect(styleOf(screen.getByText("INV-001"))).toMatchObject({ textAlign: "left" });
    expect(screen.getByText("Q3")).toBeTruthy();
  });

  it("follows the author's column structure: widths, where words stand, how values are written", async () => {
    const data: TableData = { columns: ["Invoice", "Amount"], rows: [["INV-1", "250"]], spec: [{ key: "invoice", width: 120 }, { key: "amount", type: "currency", format: "EUR" }] };
    await draw(<Table data={data} />);
    expect(styleOf(screen.getByText("€250.00"))).toMatchObject({ textAlign: "right" });
    expect(styleOf(screen.getByText("INV-1").parent!)).toMatchObject({ width: 120 });
  });
});

describe("Markdown", () => {
  it("reads the blocks the canvas renders, and only marks of bold and code", () => {
    expect(markdownBlocks("# Title\n\nSome text\n- a\n* b\n> note\n```\nx < 1\n```\n### Small")).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "Some text" },
      { kind: "list", items: ["a", "b"] },
      { kind: "quote", text: "note" },
      { kind: "code", text: "x < 1" },
      { kind: "heading", level: 3, text: "Small" },
    ]);
    expect(markdownSpans("a **b** `c` <i>d</i>")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " " },
      { kind: "code", text: "c" },
      { kind: "text", text: " <i>d</i>" },
    ]);
  });

  it("draws headings as headings, bold in bold and HTML as words", async () => {
    await draw(<Markdown text={"# Hello\n\nA **strong** word <b>x</b>"} />);
    expect(screen.getByRole("header")).toBeTruthy();
    expect(styleOf(screen.getByText("strong"))).toMatchObject({ fontWeight: "700" });
    expect(screen.getByText(/<b>x<\/b>/)).toBeTruthy();
  });
});

describe("a data table", () => {
  it("searches, sorts numbers as numbers and pages by itself, by the draft it keeps", () => {
    const rows = [["b", "10"], ["a", "9"], ["c", "100"]];
    expect(tableLines(rows, { query: "", sort: { column: 1, down: false }, page: 0, pageSize: 2, total: 0 }).shown.map((l) => l.id)).toEqual([1, 0]);
    expect(tableLines(rows, { query: "C", sort: null, page: 0, pageSize: 2, total: 0 }).shown.map((l) => l.id)).toEqual([2]);
    /* rows the other side has cut already are shown as they come, and count as many as it says */
    expect(tableLines(rows, { query: "zzz", sort: { column: 0, down: true }, page: 3, pageSize: 2, total: 40 })).toMatchObject({ count: 40, pages: 20, current: 3 });
  });

  it("sends what the visitor asks of it, and a row's tap only runs that row's", async () => {
    const onSearch = jest.fn();
    const onSort = jest.fn();
    const onPage = jest.fn();
    const onSelect = jest.fn();
    const row = jest.fn();
    const whole = jest.fn();
    await draw(<DataTable onSearch={onSearch} onSort={onSort} onPage={onPage} onSelect={onSelect} onPress={whole} taps={{ "row:1": row }} />);
    expect(screen.getByText("1–5 / 7")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Next"));
    expect(onPage).toHaveBeenLastCalledWith({ page: 1 });
    expect(screen.getByText("6–7 / 7")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Total" }));
    expect(onSort).toHaveBeenLastCalledWith({ column: 3, dir: "asc" });
    /* a sort starts at the first page again, the cheapest first */
    expect(onPage).toHaveBeenLastCalledWith({ page: 0 });
    expect(screen.getAllByTestId(/^row:/)[0].props.testID).toBe("row:3");
    await fireEvent.changeText(screen.getByLabelText("Search"), "grace");
    expect(onSearch).toHaveBeenLastCalledWith({ query: "grace" });
    expect(screen.getAllByTestId(/^row:/).map((r) => r.props.testID)).toEqual(["row:1"]);
    await fireEvent.press(screen.getByTestId("row:1"));
    expect(row).toHaveBeenCalled();
    expect(whole).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "A-1002" }));
    expect(onSelect).toHaveBeenLastCalledWith({ rows: [1] });
    expect(screen.getByText("Orders · 1")).toBeTruthy();
  });

  it("starts over from its props when they change", async () => {
    const r = await draw(<DataTable query="ada" />);
    expect(screen.getAllByTestId(/^row:/)).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText("Search"), "");
    expect(screen.getAllByTestId(/^row:/)).toHaveLength(5);
    await r.rerender(again(<DataTable query="Paid" />));
    expect(screen.getAllByTestId(/^row:/)).toHaveLength(4);
  });
});

describe("a board", () => {
  it("makes each column a lane and its filled cells the cards, each keeping who it is", () => {
    const lanes = lanesOf({ columns: ["A", "B"], rows: [["x", ""], ["x", "y"]] });
    expect(lanes.map((l) => l.cards.map((c) => [c.id, c.row]))).toEqual([[["0\u0001x", 0], ["0\u0001x\u00001", 1]], [["1\u0001y", 1]]]);
  });

  it("sends a card opened, moved and added, and keeps showing the data's cards", async () => {
    const onOpen = jest.fn();
    const onMove = jest.fn();
    const onAdd = jest.fn();
    await draw(<Kanban onOpen={onOpen} onMove={onMove} onAdd={onAdd} />);
    await fireEvent.press(screen.getByText("Draw the screens"));
    expect(onOpen).toHaveBeenCalledWith({ row: 0, lane: 1 });
    await fireEvent.press(screen.getByLabelText("Move right"));
    expect(onMove).toHaveBeenCalledWith({ row: 0, from: 1, to: 2, before: -1 });
    /* nothing moves until the data says so */
    expect(screen.getByLabelText("In progress")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(1);
    await fireEvent.press(screen.getAllByText("Add card")[0]);
    await fireEvent.changeText(screen.getByLabelText("Add card"), " Plan ");
    await fireEvent(screen.getByLabelText("Add card"), "submitEditing");
    expect(onAdd).toHaveBeenCalledWith({ lane: 0, text: "Plan" });
    expect(screen.queryByText("Plan")).toBeNull();
  });
});

describe("an agenda", () => {
  it("lays out a month from the week's first day, and finds the things on a day", () => {
    const m = monthOf(2026, 11, "monday", [["2026-11-04", "09:30", "Stand-up"], ["2026-12-04", "", "Not this month"]], 4);
    expect(m).toMatchObject({ days: 30, lead: 6, title: "November 2026" });
    expect(m.names[0]).toBe("M");
    expect(m.events.map((e) => e.i)).toEqual([0]);
  });

  it("sends the day picked and the month turned, and starts over when its props change", async () => {
    const onDay = jest.fn();
    const onMonth = jest.fn();
    const r = await draw(<Agenda onDay={onDay} onMonth={onMonth} />);
    expect(screen.getByText("Team stand-up")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("2026-11-12"));
    expect(onDay).toHaveBeenCalledWith({ year: 2026, month: 11, day: 12, date: "2026-11-12" });
    expect(screen.getByText("Company holiday")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(onMonth).toHaveBeenCalledWith({ year: 2026, month: 12 });
    expect(screen.getByText("December 2026")).toBeTruthy();
    expect(screen.getByText("Nothing planned")).toBeTruthy();
    await r.rerender(again(<Agenda month={10} />));
    expect(screen.getByText("October 2026")).toBeTruthy();
    await r.rerender(again(<Agenda month={11} day={20} />));
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByText("Dinner with Ada")).toBeTruthy();
  });
});

describe("lists", () => {
  it("a tracker draws a bar for each state in its color", async () => {
    await draw(<Tracker states="ok,warn,bad,none,odd" />);
    expect(styleOf(screen.getByTestId("tracker-warn"))).toMatchObject({ backgroundColor: colors.tertiary });
    expect(styleOf(screen.getByTestId("tracker-bad"))).toMatchObject({ backgroundColor: colors.error });
    expect(screen.getAllByTestId("tracker-none")).toHaveLength(2);
  });

  it("a sortable list hands out the new order and the move, and a screen reader moves a row", async () => {
    expect(moved(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moved(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(rowWords([{ label: "a" }, "b"])).toEqual(["a", "b"]);
    expect(rowWords("a\n\nb")).toEqual(["a", "b"]);
    const onChange = jest.fn();
    const onReorder = jest.fn();
    await draw(<SortableList onChange={onChange} onReorder={onReorder} />);
    await fireEvent(screen.getByLabelText("First"), "accessibilityAction", action("moveDown"));
    expect(onReorder).toHaveBeenCalledWith({ from: 0, to: 1 });
    expect(onChange).toHaveBeenCalledWith(["Second", "First", "Third"]);
    /* controlled: the order is the prop's, which nobody changed */
    expect(screen.getAllByText(/First|Second|Third/).map((t) => t.props.children)).toEqual(["First", "Second", "Third"]);
  });

  it("a sortable list nobody takes the order of keeps a draft, two rows with the same words apart, and a held one does not move", async () => {
    await draw(<SortableList items={["Same", "Same", "Other"]} />);
    await fireEvent(screen.getByLabelText("Other"), "accessibilityAction", action("moveUp"));
    expect(screen.getAllByText(/Same|Other/).map((t) => t.props.children)).toEqual(["Same", "Other", "Same"]);
    await draw(<SortableList />);
    await fireEvent(screen.getByLabelText("Third"), "accessibilityAction", action("moveUp"));
    expect(screen.getAllByText(/First|Second|Third/).map((t) => t.props.children)).toEqual(["First", "Third", "Second"]);
    const onReorder = jest.fn();
    await draw(<SortableList disabled onReorder={onReorder} />);
    await fireEvent(screen.getByLabelText("First"), "accessibilityAction", action("moveDown"));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("a swipe row opens past half its action, hands out whether it shows, and its action only asks", async () => {
    expect(swipeOpens(0, -50)).toBe(true);
    expect(swipeOpens(0, -40)).toBe(false);
    expect(swipeOpens(-88, 30)).toBe(true);
    expect(swipeOpens(-88, 50)).toBe(false);
    const onOpen = jest.fn();
    const onValueChange = jest.fn();
    const act = jest.fn();
    await draw(<SwipeRow onOpen={onOpen} onValueChange={onValueChange} taps={{ action: act }} />);
    await fireEvent(screen.getByLabelText("Swipe me left"), "accessibilityAction", action("activate"));
    expect(onOpen).toHaveBeenCalledWith({ open: true });
    expect(onValueChange).toHaveBeenCalledWith(true);
    /* the prop did not change: the row stays shut */
    expect(screen.getByLabelText("Swipe me left").props.accessibilityState.expanded).toBe(false);
    await draw(<SwipeRow open taps={{ action: act }} />);
    expect(screen.getByLabelText("Swipe me left").props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(screen.getByText("Delete"));
    expect(act).toHaveBeenCalled();
  });

  it("a file list shows each file's kind, says which was tapped, and a remove button only asks", async () => {
    expect([fileIcon("Projects"), fileIcon("a.PDF"), fileIcon("b.xyz")]).toEqual(["folder", "picture_as_pdf", "description"]);
    const onSelect = jest.fn();
    const remove = jest.fn();
    const whole = jest.fn();
    await draw(<FileList selected={1} onSelect={onSelect} onPress={whole} taps={{ "remove:2": remove }} />);
    expect(screen.getByLabelText("Q3 report.pdf").props.accessibilityState.selected).toBe(true);
    expect(screen.getByText("12 items · Nov 3")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove Team photo.jpg"));
    expect(remove).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Remove Budget.xlsx"));
    expect(whole).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(4);
    await fireEvent.press(screen.getByLabelText("Budget.xlsx"));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(whole).toHaveBeenCalled();
  });
});

describe("desktop parts", () => {
  it("a menu bar opens a menu's items and runs the one tapped", async () => {
    const print = jest.fn();
    await draw(<Menubar taps={{ "tab:2": print }} />);
    expect(screen.queryByText("Print")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Edit" }).props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(screen.getByRole("menuitem", { name: "Print" }));
    expect(print).toHaveBeenCalled();
    expect(screen.queryByText("Print")).toBeNull();
  });

  it("a tree sets its rows in by their level and says which row was tapped", async () => {
    expect([depthOf("a"), depthOf("  b"), depthOf("    c")]).toEqual([0, 1, 2]);
    const onSelect = jest.fn();
    await draw(<Tree onSelect={onSelect} />);
    expect(styleOf(screen.getByLabelText("main.rs"))).toMatchObject({ paddingLeft: 24 });
    expect(screen.getByLabelText("src").props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText("Cargo.toml"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("a window has its title bar over the parts it holds", async () => {
    await draw(
      <Window title="Editor" controls="windows" width={400} height={300}>
        <Text text="Inside" />
      </Window>,
    );
    expect(screen.getByRole("header")).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("a diff tints the lines added and removed", async () => {
    expect(diffLines("+a\n-b\n c\n").map((l) => l.kind)).toEqual(["added", "removed", "same", "same"]);
    await draw(<FileDiff />);
    expect(screen.getByText("main.ts")).toBeTruthy();
    expect(styleOf(screen.getByTestId("diff-added"))).toMatchObject({ backgroundColor: colors["primary-container"] });
    expect(styleOf(screen.getByTestId("diff-removed"))).toMatchObject({ backgroundColor: colors["error-container"] });
    expect(screen.getAllByTestId("diff-same")).toHaveLength(2);
  });
});

describe("the data, list and desktop parts, printed", () => {
  registerIcons(dataIcons);
  const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() };
  const screenOf = (Screen: ComponentType) =>
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
        <ThemeProvider theme={dataTheme} dark={false}>
          <NavProvider value={nav}>
            <Screen />
          </NavProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );

  it.each(Object.keys(DATA))("draws %s with no placeholder", async (key) => {
    await screenOf(DATA[key]);
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("draws what the design set, and sends a tap on a row where the design does", async () => {
    await screenOf(DATA.Tables);
    expect(screen.getByText("€250.00")).toBeTruthy();
    expect(screen.getByText("1–3 / 7")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("row:0"));
    expect(nav.go).toHaveBeenCalledWith("Lists");
    await screenOf(DATA.Lists);
    expect(screen.getByLabelText("Invoice 42").props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(screen.getByLabelText("Q3 report.pdf"));
    expect(nav.go).toHaveBeenCalledWith("Desk");
    await screenOf(DATA.Desk);
    for (const words of ["Project", "File", "main.ts", "TypeScript"]) expect(screen.getByText(words)).toBeTruthy();
  });

  it("runs as an app", async () => {
    await render(<DataApp dark={false} />);
    expect(screen.getByText("Visitors")).toBeTruthy();
  });
});
