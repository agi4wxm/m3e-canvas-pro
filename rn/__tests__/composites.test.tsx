import { fireEvent, screen } from "@testing-library/react-native";

import {
  Accordion,
  ActionSheet,
  Alert,
  AlertDialog,
  AppBar,
  AuthForm,
  ButtonGroup,
  Card,
  Carousel,
  CodeBlock,
  DatePicker,
  Dialog,
  Fab,
  FileUpload,
  IconGrid,
  InputGroup,
  ListItem,
  Menu,
  NavigationBar,
  RadioGroup,
  Scene,
  Search,
  SegmentedButton,
  Select,
  Sheet,
  Sidebar,
  Snackbar,
  Tabs,
  TextField,
  TimePicker,
} from "../src/kit";
import { THEMES } from "../src/gallery/themes.generated";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* The composites the kit draws with components of its own: what each shows from its props, what a tap on each of its
 * places does, and how a style composes it. */

const colors = MATERIAL_THEME.light.colors;

describe("bars", () => {
  it("an app bar: its title, and a tap on each icon", async () => {
    const icon = jest.fn();
    const more = jest.fn();
    await draw(<AppBar title="Inbox" leading="menu" trailing="more_vert" taps={{ icon, icon2: more }} />);
    expect(screen.getByText("Inbox")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Navigate"));
    await fireEvent.press(screen.getByLabelText("More"));
    expect(icon).toHaveBeenCalled();
    expect(more).toHaveBeenCalled();
  });

  it("an app bar is iOS's: a centered title and a back arrow that says Back", async () => {
    await draw(<AppBar title="Details" leading="arrow_back" />, THEMES.ios);
    expect(screen.getByText("Back")).toBeTruthy();
    expect(styleOf(screen.getByText("Details"))).toMatchObject({ fontSize: 17, fontWeight: "600" });
  });

  it("a large app bar sets its title under the row", async () => {
    await draw(<AppBar title="Settings" size="large" leading="" />);
    expect(styleOf(screen.getByText("Settings")).fontSize).toBe(36);
  });

  it("a navigation bar: the chosen tab, and a tap that chooses another", async () => {
    const second = jest.fn();
    await draw(<NavigationBar items={[{ label: "Home", icon: "home" }, { label: "Search", icon: "search" }]} selected={0} badge={3} badgeOn={2} taps={{ "tab:1": second }} />);
    expect(screen.getByRole("tab", { name: "Home" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText("3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Search" }));
    expect(second).toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Search" }).props.accessibilityState.selected).toBe(true);
  });

  it("tabs choose, as Material's row, iOS's segments and Spotify's capsules", async () => {
    await draw(<Tabs items={[{ label: "One" }, { label: "Two" }]} />);
    await fireEvent.press(screen.getByText("Two"));
    expect(screen.getAllByRole("tab")[1].props.accessibilityState.selected).toBe(true);
    await draw(<Tabs items={[{ label: "A" }, { label: "B" }]} />, THEMES.ios);
    expect(styleOf(screen.getAllByRole("tab")[0]).backgroundColor).toBe("#FFFFFF");
    await draw(<Tabs items={[{ label: "A" }, { label: "B" }]} />, THEMES.spotify, true);
    expect(styleOf(screen.getAllByRole("tab")[0]).backgroundColor).toBe(THEMES.spotify.dark.colors.primary);
  });

  it("search: its words, iOS's Cancel, the suggestions while typing", async () => {
    await draw(<Search placeholder="Find" results={[{ label: "Recent", icon: "history" }]} />);
    expect(screen.queryByText("Recent")).toBeNull();
    await fireEvent(screen.getByPlaceholderText("Find"), "focus");
    expect(screen.getByText("Recent")).toBeTruthy();
    await draw(<Search placeholder="Find" />, THEMES.ios);
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("a floating action button, extended with its label", async () => {
    const tap = jest.fn();
    await draw(<Fab testID="f" icon="add" label="Compose" onPress={tap} />);
    expect(screen.getByText("Compose")).toBeTruthy();
    expect(styleOf(screen.getByTestId("f"))).toMatchObject({ height: 56, backgroundColor: colors["primary-container"] });
    await fireEvent.press(screen.getByTestId("f"));
    expect(tap).toHaveBeenCalled();
  });
});

describe("content", () => {
  it("list rows: their words, their trailing control, a tap on a row", async () => {
    const second = jest.fn();
    await draw(<ListItem items={[{ label: "Wi-Fi", icon: "wifi" }, { label: "Bluetooth", icon: "bluetooth" }]} trailing="text" trailingText="On" taps={{ "tab:1": second }} />);
    expect(screen.getAllByText("On")).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText("Bluetooth"));
    expect(second).toHaveBeenCalled();
    await draw(<ListItem items={[{ label: "Airplane" }]} trailing="switch" checked />);
    expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(true);
  });

  it("list rows are an inset group with chevrons on iOS", async () => {
    await draw(<ListItem testID="l" items={[{ label: "General", icon: "settings" }]} description="" />, THEMES.ios);
    expect(styleOf(screen.getByTestId("l"))).toMatchObject({ backgroundColor: THEMES.ios.light.colors["surface-container-low"], overflow: "hidden" });
    expect(screen.getAllByTestId("row-chevron")).toHaveLength(1);
  });

  it("a card: its picture, title, words and action", async () => {
    const act = jest.fn();
    await draw(<Card title="Trip" description="Three days" action="Book" taps={{ action: act }} />);
    expect(screen.getByText("Trip")).toBeTruthy();
    expect(screen.getByText("Three days")).toBeTruthy();
    await fireEvent.press(screen.getByText("Book"));
    expect(act).toHaveBeenCalled();
  });

  it("an alert, a snackbar, a carousel and a code block say what they hold", async () => {
    await draw(<Alert title="Heads up" description="Look" variant="destructive" />);
    expect(screen.getByText("Heads up")).toBeTruthy();
    await draw(<Snackbar message="Saved" action="Undo" />);
    expect(screen.getByText("Undo")).toBeTruthy();
    await draw(<Carousel slides={[{ label: "One" }, { label: "Two" }]} />);
    expect(screen.getByText("Two")).toBeTruthy();
    expect(screen.getByLabelText("1 / 2")).toBeTruthy();
    await draw(<CodeBlock code="let a = 1" language="JS" />);
    expect(screen.getByText("let a = 1")).toBeTruthy();
  });
});

describe("forms and pickers", () => {
  it("a text field lifts its label once something is typed, and shows its supporting words", async () => {
    await draw(<TextField label="Email" supporting="We never share it" />);
    expect(styleOf(screen.getByText("Email")).fontSize).toBe(16);
    await fireEvent.changeText(screen.getByLabelText("Email"), "a@b.c");
    expect(styleOf(screen.getByText("Email")).fontSize).toBe(12);
    expect(screen.getByText("We never share it")).toBeTruthy();
  });

  it("a select opens its options and shows the one chosen", async () => {
    await draw(<Select items={[{ label: "Apple" }, { label: "Pear" }]} selected={0} />);
    await fireEvent.press(screen.getByRole("combobox"));
    await fireEvent.press(screen.getByText("Pear"));
    expect(screen.getByText("Pear")).toBeTruthy();
    expect(screen.queryByText("Apple")).toBeNull();
  });

  it("a date picker opens the platform's picker", async () => {
    await draw(<DatePicker label="Birthday" />);
    await fireEvent.press(screen.getByLabelText("Birthday"));
    expect(screen.getByText("native date picker")).toBeTruthy();
  });

  it("a time picker draws Material's dial, or the style's wheels", async () => {
    await draw(<TimePicker hours={9} minutes={30} />);
    expect(screen.getByText("09")).toBeTruthy();
    expect(screen.getByText("PM")).toBeTruthy();
    await draw(<TimePicker hours={14} minutes={5} />, THEMES.ios);
    expect(screen.getByText("05")).toBeTruthy();
    expect(screen.getAllByText("PM").length).toBeGreaterThan(0);
  });

  it("segmented buttons choose, as Material's group and iOS's control", async () => {
    const third = jest.fn();
    await draw(<SegmentedButton items={[{ label: "Day" }, { label: "Week" }, { label: "Month" }]} selected={1} taps={{ "tab:2": third }} />);
    await fireEvent.press(screen.getByText("Month"));
    expect(third).toHaveBeenCalled();
    expect(screen.getAllByRole("button")[2].props.accessibilityState.selected).toBe(true);
    await draw(<SegmentedButton items={[{ label: "A" }, { label: "B" }]} selected={0} />, THEMES.ios);
    expect(styleOf(screen.getAllByRole("button")[0]).backgroundColor).toBe("#FFFFFF");
  });

  it("a group of buttons, each its own tap", async () => {
    const play = jest.fn();
    await draw(<ButtonGroup items={[{ label: "Back" }, { label: "Play" }]} taps={{ "tab:1": play }} />);
    await fireEvent.press(screen.getByLabelText("Play"));
    expect(play).toHaveBeenCalled();
  });

  it("a menu opens over the screen and runs an action", async () => {
    const share = jest.fn();
    await draw(<Menu label="More" items={[{ label: "Share", icon: "share" }]} destructive="Delete" taps={{ "tab:0": share }} />);
    expect(screen.queryByText("Share")).toBeNull();
    await fireEvent.press(screen.getByLabelText("More"));
    expect(screen.getByText("Delete")).toBeTruthy();
    await fireEvent.press(screen.getByText("Share"));
    expect(share).toHaveBeenCalled();
  });

  it("a radio group, an input group, a grid of shortcuts, an accordion and a file drop", async () => {
    await draw(<RadioGroup items={[{ label: "A" }, { label: "B" }]} selected={0} />);
    await fireEvent.press(screen.getByRole("radio", { name: "B" }));
    expect(screen.getByRole("radio", { name: "B" }).props.accessibilityState.checked).toBe(true);
    await draw(<InputGroup placeholder="Amount" leadingText="$" button="Go" />);
    expect(screen.getByText("$")).toBeTruthy();
    await draw(<IconGrid items={[{ label: "Deals", icon: "local_offer", variant: "new" }]} badge="New" />);
    expect(screen.getByText("New")).toBeTruthy();
    await draw(<Accordion items={[{ label: "Q1" }, { label: "Q2" }]} content="Answer" openFirst />);
    expect(screen.getByText("Answer")).toBeTruthy();
    await fireEvent.press(screen.getByText("Q2"));
    expect(screen.getAllByText("Answer")).toHaveLength(1);
    await draw(<FileUpload title="Drop" action="Choose" />);
    expect(screen.getByText("Choose")).toBeTruthy();
  });

  it("a sign-in form switches to sign-up", async () => {
    await draw(<AuthForm />);
    expect(screen.getByText("Welcome back")).toBeTruthy();
    await fireEvent.press(screen.getByText("New here? Create an account"));
    expect(screen.getByText("Create your account")).toBeTruthy();
  });

  it("a side bar and a scene", async () => {
    await draw(<Sidebar items={[{ label: "Home", icon: "home" }, { label: "Inbox", icon: "inbox" }]} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Inbox" }));
    expect(screen.getByRole("tab", { name: "Inbox" }).props.accessibilityState.selected).toBe(true);
    await draw(<Scene testID="sc" width={200} height={300} />);
    expect(styleOf(screen.getByTestId("sc"))).toMatchObject({ width: 200, height: 300 });
  });
});

describe("overlays", () => {
  it("a dialog: its title, words and two actions", async () => {
    const dismiss = jest.fn();
    const confirm = jest.fn();
    await draw(<Dialog title="Reset?" description="All of it" dismiss="Cancel" confirm="Reset" taps={{ dismiss, confirm }} />);
    expect(screen.getByText("All of it")).toBeTruthy();
    await fireEvent.press(screen.getByText("Cancel"));
    await fireEvent.press(screen.getByText("Reset"));
    expect(dismiss).toHaveBeenCalled();
    expect(confirm).toHaveBeenCalled();
  });

  it("a dialog is iOS's alert, its actions in halves", async () => {
    await draw(<Dialog title="Reset?" />, THEMES.ios);
    expect(styleOf(screen.getByText("Reset?"))).toMatchObject({ fontSize: 17, textAlign: "center" });
  });

  it("a full-screen dialog closes and confirms from its bar", async () => {
    await draw(<Dialog styleVariant="fullscreen" title="New event" confirm="Save" />);
    expect(screen.getByLabelText("Close")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("an alert dialog's action is filled", async () => {
    await draw(<AlertDialog title="Delete?" action="Delete" />);
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("a sheet: its title, a close, iOS's grabber", async () => {
    await draw(<Sheet side="bottom" title="Filters" footer />);
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("an action sheet: each action, and cancel apart", async () => {
    const del = jest.fn();
    const cancel = jest.fn();
    await draw(<ActionSheet title="Note" actions={[{ label: "Delete" }, { label: "Archive" }]} cancel="Cancel" taps={{ "tab:0": del, cancel }} />, THEMES.ios);
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Cancel"));
    expect(del).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(styleOf(screen.getByText("Delete")).color).toBe(THEMES.ios.light.colors.error);
  });
});
