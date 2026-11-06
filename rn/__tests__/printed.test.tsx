import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, registerIcons, ThemeProvider, type KitTheme } from "../src/kit";
import { App as KitsApp } from "../src/printed/kits/App";
import { icons as kitsIcons } from "../src/printed/kits/icons";
import { SCREENS as KITS } from "../src/printed/kits/screens";
import { theme as kitsTheme } from "../src/printed/kits/theme";
import { App as ProofApp } from "../src/printed/proof/App";
import { icons as proofIcons } from "../src/printed/proof/icons";
import { INITIAL, SCREENS as PROOF } from "../src/printed/proof/screens";
import { theme as proofTheme } from "../src/printed/proof/theme";

/* What the code printer (lib/export/rn) wrote for the export's proof document and a screen of kits, drawn as an exported
 * app draws it: every screen renders, its words are there, and a tap goes where the design sends it. */

registerIcons(proofIcons);
registerIcons(kitsIcons);

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
