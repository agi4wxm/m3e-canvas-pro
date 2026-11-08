import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, registerIcons, ThemeProvider, type KitTheme } from "../src/kit";
import { App as KitsApp } from "../src/printed/kits/App";
import { icons as kitsIcons } from "../src/printed/kits/icons";
import { SCREENS as KITS } from "../src/printed/kits/screens";
import { theme as kitsTheme } from "../src/printed/kits/theme";
import { App as ProofApp } from "../src/printed/proof/App";
import { icons as proofIcons } from "../src/printed/proof/icons";
import { IMAGES } from "../src/printed/proof/images";
import { INITIAL, SCREENS as PROOF } from "../src/printed/proof/screens";
import { theme as proofTheme } from "../src/printed/proof/theme";
import { App as SplitsApp } from "../src/printed/splits/App";
import { icons as splitsIcons } from "../src/printed/splits/icons";
import { SCREENS as SPLITS } from "../src/printed/splits/screens";
import { theme as splitsTheme } from "../src/printed/splits/theme";
/* D3 */
import { App as InputsApp } from "../src/printed/inputs/App";
import { icons as inputsIcons } from "../src/printed/inputs/icons";
import { SCREENS as INPUTS } from "../src/printed/inputs/screens";
import { theme as inputsTheme } from "../src/printed/inputs/theme";

/* What the code printer (lib/export/rn) wrote for the export's proof document and a screen of kits, drawn as an exported
 * app draws it: every screen renders, its words are there, and a tap goes where the design sends it. */

registerIcons(proofIcons);
registerIcons(kitsIcons);
registerIcons(splitsIcons);
registerIcons(inputsIcons);

const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() };

function screenOf(Screen: ComponentType, theme: KitTheme) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
      <ThemeProvider theme={theme} dark={false}>
        <NavProvider value={nav}>
          <Screen />
        </NavProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => Object.values(nav).forEach((f) => f.mockClear()));

describe("the proof document, printed", () => {
  it.each(Object.keys(PROOF))("draws %s", async (key) => {
    await screenOf(PROOF[key], proofTheme);
    expect(screen.toJSON()).toBeTruthy();
  });

  it("sends a tap where the design does", async () => {
    await screenOf(PROOF[INITIAL], proofTheme);
    await fireEvent.press(screen.getByText("Form"));
    expect(nav.go).toHaveBeenCalledWith("Form");
    await fireEvent.press(screen.getByText("Shop"));
    expect(nav.go).toHaveBeenCalledWith("Products");
  });

  it("goes back from a screen that says so", async () => {
    await screenOf(PROOF.Welcome, proofTheme);
    await fireEvent.press(screen.getByText("Back to form"));
    expect(nav.back).toHaveBeenCalled();
  });

  it("runs as an app, from the first screen through a tap", async () => {
    await render(<ProofApp dark={false} />);
    await fireEvent.press(screen.getByText("Form"));
    expect(screen.getByText("Sign up")).toBeTruthy();
  });

  it("runs what a tap sets and shows: variables, a hidden part, a prop, a condition, a snackbar", async () => {
    await render(<ProofApp dark={false} initial="Counter" />);
    expect(screen.queryByText("A secret")).toBeNull();
    expect(screen.queryByText("Three!")).toBeNull();
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByText("Add"));
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Three!")).toBeTruthy();
    await fireEvent.press(screen.getByText("Reset"));
    expect(screen.getByText("0")).toBeTruthy();
    await fireEvent.press(screen.getByText("Reveal"));
    expect(screen.getByText("A secret")).toBeTruthy();
    await fireEvent.press(screen.getByText("Retitle"));
    expect(screen.getByText("New title")).toBeTruthy();
    expect(screen.queryByText("Flag is on")).toBeNull();
    await fireEvent.press(screen.getByText("Flip"));
    expect(screen.getByText("Flag is on")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ask"));
    expect(screen.getByText("Set it to 100?")).toBeTruthy();
  });

  it("draws a picture the design holds from the file the app bundles", async () => {
    await screenOf(PROOF.Counter, proofTheme);
    /* the native view expo-image draws with: its source is the file's module, not an address */
    expect(screen.getByLabelText("Picked").props.source).toEqual([IMAGES.image1]);
    expect(IMAGES.image1).toEqual({ testUri: "../../../src/printed/proof/assets/image1.png" });
  });

  it("takes a tap's other branch while its condition does not hold, and the first once it does", async () => {
    await render(<ProofApp dark={false} initial="Form" />);
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.getByTestId("snackbar")).toBeTruthy();
    expect(screen.getByText("Accept the terms first")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox"));
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.queryByText("Sign up")).toBeNull();
  });
});

describe("a screen of kits, printed under iOS", () => {
  it("draws the kits as atoms with the bars pinned", async () => {
    await screenOf(KITS.Kits, kitsTheme);
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("runs as an app", async () => {
    await render(<KitsApp dark />);
    expect(screen.getByText("Title")).toBeTruthy();
  });
});

describe("split views, printed", () => {
  it("draws both panes of each split, nested, with a divider each", async () => {
    await screenOf(SPLITS.SplitDesk, splitsTheme);
    for (const words of ["Folders", "New folder", "Message", "Terminal"]) expect(screen.getByText(words)).toBeTruthy();
    expect(screen.getAllByRole("adjustable")).toHaveLength(2);
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("lays its panes side by side on a desktop, one over the other on a phone", async () => {
    await screenOf(SPLITS.SplitDesk, splitsTheme);
    expect(StyleSheet.flatten(screen.getAllByRole("adjustable")[0].props.style)).toMatchObject({ width: 1 });
    await screenOf(SPLITS.SplitPhone, splitsTheme);
    expect(StyleSheet.flatten(screen.getAllByRole("adjustable")[0].props.style)).toMatchObject({ height: 1 });
  });

  it("moves the divider when a screen reader adjusts it", async () => {
    await screenOf(SPLITS.SplitPhone, splitsTheme);
    expect(screen.getAllByRole("adjustable")[0].props.accessibilityValue).toMatchObject({ now: 40 });
    await fireEvent(screen.getAllByRole("adjustable")[0], "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(screen.getAllByRole("adjustable")[0].props.accessibilityValue).toMatchObject({ now: 45 });
  });

  it("runs as an app", async () => {
    await render(<SplitsApp dark={false} />);
    expect(screen.getByText("Folders")).toBeTruthy();
  });
});

/* D3 */
describe("the pickers and the entry parts, printed", () => {
  it.each(Object.keys(INPUTS))("draws %s with the kit's own components, no placeholder among them", async (key) => {
    await screenOf(INPUTS[key], inputsTheme);
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("shows what the variables hold and writes what is picked into them", async () => {
    await render(<InputsApp dark={false} initial="Pickers" />);
    /* a choice bound to words: the option they name is the one chosen, and a tap writes another's words */
    expect(screen.getByRole("radio", { name: "Travel" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("radio", { name: "Work" }));
    expect(screen.getByRole("radio", { name: "Work" }).props.accessibilityState.checked).toBe(true);
    /* a choice bound to a number: its place */
    expect(screen.getByRole("radio", { name: "#7D5260" }).props.accessibilityState.checked).toBe(true);
    /* words: the color the variable holds */
    expect(screen.getByRole("image", { name: "#386A20" })).toBeTruthy();
  });

  it("steps a number and adds a tag into the variables they are bound to", async () => {
    await render(<InputsApp dark={false} initial="Entry" />);
    expect(screen.getByRole("adjustable", { name: "Quantity" }).props.accessibilityValue).toMatchObject({ now: 2 });
    await fireEvent.press(screen.getByLabelText("Increase"));
    expect(screen.getByRole("adjustable", { name: "Quantity" }).props.accessibilityValue).toMatchObject({ now: 3 });
    await fireEvent.changeText(screen.getByLabelText("Add a tag"), "Ship");
    await fireEvent(screen.getByLabelText("Add a tag"), "submitEditing");
    expect(screen.getByText("Ship")).toBeTruthy();
    expect(screen.getByText("Prototype")).toBeTruthy();
  });
});
