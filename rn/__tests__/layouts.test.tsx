import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text as RNText } from "react-native";

import {
  AspectRatio,
  Cell,
  Collapsible,
  CustomComponent,
  Dock,
  DockPane,
  Drawer,
  FloatingNav,
  GridView,
  HoverCard,
  MiniProgramHeader,
  NavigationMenu,
  NavigationRail,
  Onboarding,
  Pagination,
  Popover,
  ScrollArea,
  SideSheet,
  SlideGroup,
  Stack,
  SupportingPane,
  TableOfContents,
  Tooltip,
  around,
  onPane,
  pagesShown,
  ratioOf,
  sideSheetWindow,
  tocRow,
  useDraft,
} from "../src/kit";
import { draw, styleOf } from "./helpers";

/* The layouts, ways of getting around and floating parts the kit draws with components of its own (composites/
 * layouts.tsx, navs.tsx, floating.tsx): what each shows from its props, what it lays out, what a tap on each of its
 * places does, and that what is chosen or open is the prop's, a change only told when someone takes it. */

describe("a draft of what is chosen or open", () => {
  function Probe({ given, onChange }: { given: number; onChange?: (v: number) => void }) {
    const [v, set] = useDraft(given, onChange);
    return <RNText onPress={() => set(v + 1)}>{`value ${v}`}</RNText>;
  }

  it("starts at the prop, keeps a change, and starts over when the prop changes", async () => {
    const { rerender } = await render(<Probe given={1} />);
    await fireEvent.press(screen.getByText("value 1"));
    expect(screen.getByText("value 2")).toBeTruthy();
    await rerender(<Probe given={5} />);
    expect(screen.getByText("value 5")).toBeTruthy();
  });

  it("is the prop while someone takes the change: one turned down stays turned down", async () => {
    const onChange = jest.fn();
    await render(<Probe given={1} onChange={onChange} />);
    await fireEvent.press(screen.getByText("value 1"));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByText("value 1")).toBeTruthy();
  });
});

describe("layouts", () => {
  it("a collapsible shows what it holds while open, and says it is", async () => {
    await draw(<Collapsible trigger="More" content="Hidden words" open={false} />);
    expect(screen.queryByText("Hidden words")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Hidden words")).toBeTruthy();
    expect(screen.getByRole("button", { name: "More" }).props.accessibilityState).toMatchObject({ expanded: true });
  });

  it("a controlled collapsible only tells", async () => {
    const onOpenChange = jest.fn();
    await draw(<Collapsible trigger="More" content="Hidden words" open onOpenChange={onOpenChange} />);
    await fireEvent.press(screen.getByRole("button", { name: "More" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("Hidden words")).toBeTruthy();
  });

  it("a scroll area holds its rows, or what it is given in their place", async () => {
    await draw(<ScrollArea label="Row" count={3} />);
    expect(screen.getByText("Row 3")).toBeTruthy();
    await draw(
      <ScrollArea>
        <RNText>Mine</RNText>
      </ScrollArea>,
    );
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Item 1")).toBeNull();
  });

  it("an aspect ratio is as tall as its width says", async () => {
    expect(ratioOf("4:3")).toBeCloseTo(4 / 3);
    expect(ratioOf("nope")).toBeCloseTo(16 / 9);
    await draw(<AspectRatio ratio="4:3" width={240} label="Four" testID="ratio" />);
    expect(styleOf(screen.getByTestId("ratio"))).toMatchObject({ width: 240, height: 180 });
    expect(screen.getByText("Four")).toBeTruthy();
  });

  it("a stack names itself on its front layer", async () => {
    await draw(<Stack label="Layers" note="One over another" />);
    expect(screen.getByText("Layers")).toBeTruthy();
    expect(screen.getByText("One over another")).toBeTruthy();
  });

  it("a grid shows its cells empty, and lays out what it holds a cell each, rows sharing its height", async () => {
    await draw(<GridView label="Grid" note="Two" testID="grid" />);
    expect(screen.getByText("Grid")).toBeTruthy();
    await draw(
      <GridView columns={2} rows={2} height={200} padY={12} gap={8} testID="grid">
        <RNText>A</RNText>
        <RNText>B</RNText>
        <Cell span={2}>
          <RNText>C</RNText>
        </Cell>
      </GridView>,
    );
    for (const w of ["A", "B", "C"]) expect(screen.getByText(w)).toBeTruthy();
    /* 200 less 12 above, 12 below and the header's 28, less one gap, in two */
    expect(styleOf(screen.getByTestId("grid-row0")).height).toBe(70);
    expect(styleOf(screen.getByTestId("grid-row1")).height).toBe(70);
  });

  it("a dock shows the chosen tab's parts, and another tab's on a tap, which runs its wiring", async () => {
    const second = jest.fn();
    await draw(
      <Dock items={[{ label: "One" }, { label: "Two" }]} taps={{ "tab:1": second }}>
        <DockPane pane={0}>
          <RNText>First pane</RNText>
        </DockPane>
        <DockPane pane={1}>
          <RNText>Second pane</RNText>
        </DockPane>
        <RNText>Always</RNText>
      </Dock>,
    );
    expect(screen.getByText("First pane")).toBeTruthy();
    expect(screen.queryByText("Second pane")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Two" }));
    expect(second).toHaveBeenCalled();
    expect(screen.getByText("Second pane")).toBeTruthy();
    expect(screen.queryByText("First pane")).toBeNull();
    expect(screen.getByText("Always")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Two" }).props.accessibilityState.selected).toBe(true);
  });

  it("a dock told what is chosen follows it", async () => {
    const onSelect = jest.fn();
    function Host() {
      const [at, setAt] = useState(0);
      return (
        <Dock
          items={[{ label: "One" }, { label: "Two" }]}
          selected={at}
          onSelect={(i) => {
            onSelect(i);
            setAt(i);
          }}
        >
          <DockPane pane={0}>
            <RNText>First pane</RNText>
          </DockPane>
          <DockPane pane={1}>
            <RNText>Second pane</RNText>
          </DockPane>
        </Dock>
      );
    }
    await draw(<Host />);
    await fireEvent.press(screen.getByRole("tab", { name: "Two" }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.getByText("Second pane")).toBeTruthy();
    expect(onPane([<DockPane key="a" pane={0} />, <RNText key="b">x</RNText>], 1)).toHaveLength(1);
  });

  it("a supporting pane and a custom component say what they are over what they lay out", async () => {
    await draw(
      <SupportingPane label="Details" note="More" layout="column" gap={12}>
        <RNText>Held one</RNText>
      </SupportingPane>,
    );
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByText("Held one")).toBeTruthy();
    expect(styleOf(screen.getByText("Held one").parent as never)).toMatchObject({ flexDirection: "column", rowGap: 12, paddingTop: 16 });
    await draw(
      <CustomComponent name="Map" description="Drawn by the app" layout="row">
        <RNText>Held two</RNText>
      </CustomComponent>,
    );
    expect(screen.getByText("Map")).toBeTruthy();
    expect(styleOf(screen.getByText("Held two").parent as never)).toMatchObject({ flexDirection: "row" });
  });
});

describe("getting around", () => {
  it("a rail chooses a destination and runs its wiring; its menu button opens it out", async () => {
    const saved = jest.fn();
    await draw(<NavigationRail items={[{ label: "Home", icon: "home" }, { label: "Saved", icon: "favorite" }]} taps={{ "tab:1": saved }} testID="rail" />);
    expect(styleOf(screen.getByTestId("rail")).width).toBe(96);
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));
    expect(saved).toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Saved" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Expand" }));
    expect(styleOf(screen.getByTestId("rail")).width).toBe(220);
    expect(screen.getByText("Compose")).toBeTruthy();
  });

  it("a modal rail opened out lies over the rest, and shuts once a destination is chosen", async () => {
    await draw(<NavigationRail modal expanded testID="rail" />);
    expect(styleOf(screen.getByTestId("rail"))).toMatchObject({ position: "absolute", width: 220 });
    await fireEvent.press(screen.getByRole("tab", { name: "Search" }));
    expect(styleOf(screen.getByTestId("rail")).width).toBe(96);
  });

  it("pagination shows the pages around the current one and goes to one", async () => {
    expect(pagesShown(10, 2)).toEqual([1, 2, 3, "gap", 10]);
    expect(pagesShown(10, 5)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pagesShown(5, 3)).toEqual([1, 2, 3, 4, 5]);
    const fourth = jest.fn();
    const next = jest.fn();
    await draw(<Pagination pages={10} page={1} taps={{ "tab:3": fourth, next }} />);
    expect(screen.getByLabelText("More pages")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(next).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "3" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "4" }));
    expect(fourth).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "4" }).props.accessibilityState.selected).toBe(true);
  });

  it("a navigation menu opens a menu's links under its row, in the room it is drawn open in", async () => {
    await draw(<NavigationMenu menus={[{ label: "Guides" }]} pages={[{ label: "Start" }, { label: "Theming" }]} testID="menu" />);
    expect(styleOf(screen.getByTestId("menu"))).toMatchObject({ width: 380, height: 44 + 12 + 2 * 48 + 24 });
    expect(screen.queryByText("Theming")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Guides" }));
    expect(screen.getByText("Theming")).toBeTruthy();
  });

  it("a floating bar chooses and runs its wiring", async () => {
    const home = jest.fn();
    await draw(<FloatingNav selected={1} taps={{ "tab:0": home }} />);
    expect(screen.getByRole("tab", { name: "Search" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("tab", { name: "Home" }));
    expect(home).toHaveBeenCalled();
  });

  it("the mini-program's header: its title, and back", async () => {
    const back = jest.fn();
    await draw(<MiniProgramHeader title="Orders" onPress={back} />);
    expect(screen.getByText("Orders")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalled();
  });

  it("a table of contents sets a level down in, and goes to a heading", async () => {
    expect(tocRow("  Install")).toEqual({ words: "Install", sub: true });
    const api = jest.fn();
    await draw(<TableOfContents items={[{ label: "Overview" }, { label: "  Install" }, { label: "API" }]} taps={{ "tab:2": api }} />);
    expect(styleOf(screen.getByRole("link", { name: "Install" })).paddingLeft).toBe(24);
    await fireEvent.press(screen.getByRole("link", { name: "API" }));
    expect(api).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "API" }).props.accessibilityState.selected).toBe(true);
  });

  it("a slide group shows its chips between two chevrons", async () => {
    await draw(<SlideGroup items={[{ label: "All" }, { label: "Music" }]} />);
    expect(screen.getByText("Music")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy();
  });

  it("onboarding turns its pages, tells each turn, and skips to the last unless Skip is wired", async () => {
    const onPage = jest.fn();
    const done = jest.fn();
    const data = { columns: ["Icon", "Title", "Text"], rows: [["explore", "First", "One"], ["bolt", "Second", "Two"], ["star", "Third", "Three"]] };
    await draw(<Onboarding data={data} onPage={onPage} taps={{ done }} />);
    expect(screen.getByText("First")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Second")).toBeTruthy();
    expect(onPage).toHaveBeenLastCalledWith(1);
    await fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Third")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Get started" }));
    expect(done).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "1" }));
    expect(screen.getByText("First")).toBeTruthy();
    const skip = jest.fn();
    await draw(<Onboarding data={data} taps={{ skip }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    expect(skip).toHaveBeenCalled();
    expect(screen.getByText("First")).toBeTruthy();
  });

  it("onboarding turns on a swipe", async () => {
    const data = { columns: ["Icon", "Title", "Text"], rows: [["explore", "First", "One"], ["bolt", "Second", "Two"]] };
    await draw(<Onboarding data={data} testID="tour" />);
    await fireEvent(screen.getByTestId("tour-page"), "touchStart", { nativeEvent: { pageX: 200 } });
    await fireEvent(screen.getByTestId("tour-page"), "touchEnd", { nativeEvent: { pageX: 100 } });
    expect(screen.getByText("Second")).toBeTruthy();
  });
});

describe("what floats", () => {
  it("keeps the room a popup is drawn open in, the trigger where it stands", () => {
    expect(around("top", 150, 40, 120, 40)).toEqual({ w: 150, h: 88 });
    expect(around("right", 300, 190, 120, 40)).toEqual({ w: 428, h: 190 });
    expect(sideSheetWindow(360, 412)).toBe(380);
    expect(sideSheetWindow(256, 1280)).toBe(536);
  });

  it("a tooltip shows its words on a long press; a tap is the button's", async () => {
    const tap = jest.fn();
    await draw(<Tooltip label="Library" text="Add to library" onPress={tap} testID="tip" />);
    expect(styleOf(screen.getByTestId("tip"))).toMatchObject({ width: 150, height: 88, justifyContent: "flex-end" });
    expect(screen.queryByText("Add to library")).toBeNull();
    await fireEvent(screen.getByRole("button", { name: "Library" }), "longPress");
    expect(screen.getByText("Add to library")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Library" }));
    expect(tap).toHaveBeenCalled();
    expect(screen.queryByText("Add to library")).toBeNull();
  });

  it("a popover and a hover card open on a tap and shut on another", async () => {
    await draw(<Popover trigger="Size" title="Dimensions" description="Set the size" />);
    await fireEvent.press(screen.getByRole("button", { name: "Size" }));
    expect(screen.getByText("Dimensions")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Size" }));
    expect(screen.queryByText("Dimensions")).toBeNull();
    const onOpenChange = jest.fn();
    await draw(<HoverCard trigger="@material" title="Material Design" onOpenChange={onOpenChange} />);
    await fireEvent.press(screen.getByRole("link", { name: "@material" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Material Design")).toBeNull();
    await draw(<HoverCard trigger="@material" title="Material Design" avatar="M" open />);
    expect(screen.getByText("Material Design")).toBeTruthy();
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("a drawer: its handle, its words and a close that runs its wiring", async () => {
    const close = jest.fn();
    await draw(<Drawer title="Share" description="Where to" close="Close" taps={{ close }} />);
    expect(screen.getByText("Where to")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalled();
  });

  it("a side sheet docks to its window: close, apply and cancel each run their wiring", async () => {
    const taps = { close: jest.fn(), confirm: jest.fn(), dismiss: jest.fn() };
    await draw(<SideSheet title="Filters" content="Narrow it down" width={300} taps={taps} testID="sheet" />);
    expect(screen.getByText("Narrow it down")).toBeTruthy();
    expect(styleOf(screen.getByTestId("sheet")).width).toBe(580);
    for (const name of ["Close", "Apply", "Cancel"]) await fireEvent.press(screen.getByRole("button", { name }));
    expect(taps.close).toHaveBeenCalled();
    expect(taps.confirm).toHaveBeenCalled();
    expect(taps.dismiss).toHaveBeenCalled();
  });
});
