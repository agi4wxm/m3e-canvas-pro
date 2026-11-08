import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, registerIcons, ThemeProvider } from "../src/kit";
import { App as LayoutsApp } from "../src/printed/layouts/App";
import { icons } from "../src/printed/layouts/icons";
import { SCREENS } from "../src/printed/layouts/screens";
import { theme } from "../src/printed/layouts/theme";
import { SCREENS as PROOF } from "../src/printed/proof/screens";
import { theme as proofTheme } from "../src/printed/proof/theme";

/* What the code printer (lib/export/rn) wrote for the layouts document (lib/export/rn/layoutsFixture.ts): every layout,
 * way of getting around and floating part the kit draws with a component of its own, none of them a placeholder, the
 * parts the containers hold laid out in them, a dock switching what its tabs hold, and taps going where the design
 * sends them. */

registerIcons(icons);

const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() };

function screenOf(Screen: ComponentType, kitTheme = theme) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
      <ThemeProvider theme={kitTheme} dark={false}>
        <NavProvider value={nav}>
          <Screen />
        </NavProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => Object.values(nav).forEach((f) => f.mockClear()));

describe("the layouts document, printed", () => {
  it.each(Object.keys(SCREENS))("draws %s with no placeholder", async (key) => {
    await screenOf(SCREENS[key]);
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("lays out what the containers hold in them", async () => {
    await screenOf(SCREENS.Layouts);
    for (const words of ["Cell one", "Cell four", "Overview words", "Pane words", "Pane button", "Custom words"]) expect(screen.getByText(words)).toBeTruthy();
  });

  it("switches what a dock's tabs hold, and a part on the other tab goes where the design says", async () => {
    await screenOf(SCREENS.Layouts);
    expect(screen.queryByText("Activity button")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.queryByText("Overview words")).toBeNull();
    await fireEvent.press(screen.getByText("Activity button"));
    expect(nav.go).toHaveBeenCalledWith("Around");
  });

  it("sends the taps of destinations where the design wires them", async () => {
    await screenOf(SCREENS.Around);
    await fireEvent.press(screen.getByRole("button", { name: "4" }));
    expect(nav.go).toHaveBeenLastCalledWith("Layouts");
    await fireEvent.press(screen.getByRole("link", { name: "API" }));
    expect(nav.go).toHaveBeenLastCalledWith("Floating");
    await fireEvent.press(screen.getByRole("button", { name: "Orders" }));
    expect(nav.go).toHaveBeenLastCalledWith("Layouts");
    nav.go.mockClear();
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));
    expect(nav.go).toHaveBeenLastCalledWith("Floating");
    nav.go.mockClear();
    await fireEvent.press(screen.getByRole("tab", { name: "Inbox" }));
    expect(nav.go).toHaveBeenLastCalledWith("Floating");
    await screenOf(SCREENS.Rail);
    await fireEvent.press(screen.getByRole("tab", { name: "Search" }));
    expect(nav.go).toHaveBeenLastCalledWith("Around");
  });

  it("opens what floats off its trigger, and runs a side sheet's buttons", async () => {
    await screenOf(SCREENS.Floating);
    await fireEvent.press(screen.getByRole("button", { name: "Size" }));
    expect(screen.getByText("Dimensions")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(nav.go).toHaveBeenCalledWith("Layouts");
  });

  it("prints the proof document's dock with what each tab holds", async () => {
    await screenOf(PROOF.Dock, proofTheme);
    expect(screen.getByText("Content one")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Three" }));
    expect(screen.getByText("Content three")).toBeTruthy();
    expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
  });

  it("runs as an app", async () => {
    await render(<LayoutsApp dark={false} />);
    expect(screen.getByText("Cell one")).toBeTruthy();
  });
});
