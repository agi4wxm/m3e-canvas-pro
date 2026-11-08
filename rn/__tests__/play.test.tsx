import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NavProvider, registerIcons, ThemeProvider } from "../src/kit";
import { App as PlayApp } from "../src/printed/play/App";
import { icons } from "../src/printed/play/icons";
import { SCREENS } from "../src/printed/play/screens";
import { theme } from "../src/printed/play/theme";
import warnings from "../src/printed/play/warnings.json";

/* What the code printer (lib/export/rn) writes for the game parts, actions and menus (lib/export/rn/fixture.ts
 * `playDoc`), drawn as an exported app draws it: every one is the kit's own component, none a placeholder, and a tap on
 * each of their places goes where the design sends it. */

registerIcons(icons);

const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() };

function screenOf(Screen: ComponentType) {
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

describe("the game parts, actions and menus, printed", () => {
  it("prints every one as the kit's own, with nothing to report", async () => {
    expect(warnings).toEqual([]);
    for (const key of Object.keys(SCREENS)) {
      await screenOf(SCREENS[key]);
      expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
    }
  });

  it("sends a machine's press, an egg, a level and a cell where the design does", async () => {
    await screenOf(SCREENS.Draws);
    await fireEvent.press(screen.getByRole("button", { name: "Spin" }));
    expect(nav.go).toHaveBeenCalledWith("Menus");
    /* a machine that is pending waits, and asks nothing */
    expect(screen.getByRole("button", { name: "Draw once" }).props.accessibilityState).toMatchObject({ disabled: true });
    await screenOf(SCREENS.Machines);
    await fireEvent.press(screen.getByRole("button", { name: "Pick an egg 2" }));
    expect(nav.go).toHaveBeenLastCalledWith("Draws");
    await screenOf(SCREENS.Play);
    /* the level map's levels, then the board's cells */
    await fireEvent.press(screen.getAllByRole("button", { name: "1" })[0]);
    expect(nav.go).toHaveBeenLastCalledWith("Draws");
    expect(screen.getAllByRole("button", { name: "1" })[0].props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getAllByRole("button", { name: "2" })[1]);
    expect(nav.go).toHaveBeenLastCalledWith("Menus");
    expect(screen.getByText("O to play")).toBeTruthy();
    expect(screen.getByRole("adjustable", { name: "Move" })).toBeTruthy();
  });

  it("opens a split button's menu and runs its row; a sign-in button in its service's words", async () => {
    await screenOf(SCREENS.Menus);
    expect(screen.getByText("Sign in with Google")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
    expect(nav.go).toHaveBeenLastCalledWith("Draws");
    await fireEvent.press(screen.getByRole("button", { name: "More options" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "Share" }));
    expect(nav.go).toHaveBeenLastCalledWith("Play");
    await fireEvent.press(screen.getByRole("button", { name: "Open menu" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "More" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "Filter" }));
    expect(nav.go).toHaveBeenLastCalledWith("Machines");
  });

  it("runs as an app", async () => {
    await render(<PlayApp dark={false} />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeTruthy();
  });
});
