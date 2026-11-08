import { fireEvent, screen } from "@testing-library/react-native";

import { BrandButton, CascadingMenu, Command, ContextMenu, FabMenu, FilterBar, SplitButton, brandCapability, brandWords, commandMatches, toggled } from "../src/kit";
import { draw, styleOf } from "./helpers";

/* Actions, menus and search on a phone (composites/actions.tsx): each half of a split button and each row of a menu is a
 * place of its own, a menu opens over the screen and closes once a row is picked, a sign-in or pay button only says it
 * was pressed and which capability that asks for, and what is typed or turned on is the visitor's. */

describe("a split button", () => {
  it("runs its main action, and opens its menu from the arrow", async () => {
    const main = jest.fn();
    const share = jest.fn();
    await draw(<SplitButton label="Edit" icon="edit" taps={{ main, "tab:1": share }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
    expect(main).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("button", { name: "More options" }).props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByRole("menuitem", { name: "Share" }));
    expect(share).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
  });

  it("without a menu its arrow is a place of its own", async () => {
    const more = jest.fn();
    await draw(<SplitButton label="Edit" menu={false} taps={{ more }} />);
    await fireEvent.press(screen.getByRole("button", { name: "More options" }));
    expect(more).toHaveBeenCalled();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});

describe("a FAB menu", () => {
  it("opens its actions over the screen and runs the one picked", async () => {
    const event = jest.fn();
    await draw(<FabMenu taps={{ "tab:1": event }} />);
    expect(screen.queryByRole("menuitem", { name: "Event" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "Event" }));
    expect(event).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Event" })).toBeNull();
  });

  it("starts open when the design draws it open, and its close button closes it", async () => {
    await draw(<FabMenu open />);
    expect(screen.getByRole("menuitem", { name: "Mail" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close actions" }));
    expect(screen.queryByRole("menuitem", { name: "Mail" })).toBeNull();
  });
});

describe("a sign-in or pay button", () => {
  it("says the service's words in its colors, and a press only asks", async () => {
    const press = jest.fn();
    const ask = jest.fn();
    await draw(<BrandButton testID="b" provider="apple" label="" onPress={press} onAsk={ask} />);
    expect(screen.getByText("Sign in with Apple")).toBeTruthy();
    expect(styleOf(screen.getByTestId("b"))).toMatchObject({ backgroundColor: "#000000", height: 40 });
    await fireEvent.press(screen.getByTestId("b"));
    expect(press).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("auth.oauth", "apple");
    /* nothing it shows says the sign-in went through: that is the service's and the back end's to say */
    expect(screen.getByText("Sign in with Apple")).toBeTruthy();
  });

  it("pays through payment.pay, in the theme's inverse colors for a service it does not know", async () => {
    const ask = jest.fn();
    await draw(<BrandButton testID="b" intent="pay" label="" onAsk={ask} />);
    expect(screen.getByText("Pay")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("b"));
    expect(ask).toHaveBeenCalledWith("payment.pay", "other");
    expect(brandWords("wechat", "pay")).toBe("Pay with WeChat");
    expect(brandCapability("signin")).toBe("auth.oauth");
  });
});

describe("a command list", () => {
  it("narrows its commands to what is typed, and runs the one tapped by its place", async () => {
    const calc = jest.fn();
    await draw(<Command taps={{ "tab:2": calc }} />);
    expect(screen.getByText("Suggestions")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search commands"), "calc");
    expect(screen.queryByText("Calendar")).toBeNull();
    await fireEvent.press(screen.getByRole("menuitem", { name: "Calculator" }));
    expect(calc).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Search commands"), "zzz");
    expect(screen.getByText("No results found.")).toBeTruthy();
  });

  it("matches without minding case or spaces", () => {
    expect(commandMatches([{ label: "Calendar" }, { label: "Search emoji" }], " EMO ")).toEqual([1]);
    expect(commandMatches([{ label: "A" }, { label: "B" }], "")).toEqual([0, 1]);
  });
});

describe("a context menu", () => {
  it("opens when held down, or by a screen reader's long press, and runs the row picked", async () => {
    const reload = jest.fn();
    await draw(<ContextMenu taps={{ "tab:2": reload }} />);
    await fireEvent(screen.getByRole("button", { name: "Right click here" }), "longPress");
    await fireEvent.press(screen.getByRole("menuitem", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Reload" })).toBeNull();
    await fireEvent(screen.getByRole("button", { name: "Right click here" }), "accessibilityAction", { nativeEvent: { actionName: "longpress" } });
    expect(screen.getByRole("menuitem", { name: "Back" })).toBeTruthy();
  });
});

describe("a filter bar", () => {
  it("hands out what is typed and the filters turned on", async () => {
    const typed = jest.fn();
    const on = jest.fn();
    await draw(<FilterBar onChangeText={typed} onFilter={on} />);
    await fireEvent.changeText(screen.getByLabelText("Search invoices"), "May");
    expect(typed).toHaveBeenCalledWith("May");
    await fireEvent.press(screen.getByRole("togglebutton", { name: "Due date" }));
    expect(on).toHaveBeenLastCalledWith([1]);
    expect(screen.getByRole("togglebutton", { name: "Due date" }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("togglebutton", { name: "Due date" }));
    expect(on).toHaveBeenLastCalledWith([]);
    expect(toggled([2], 0)).toEqual([0, 2]);
  });
});

describe("a cascading menu", () => {
  it("opens its menu, then its submenu in its place, and runs the row picked there", async () => {
    const sort = jest.fn();
    const share = jest.fn();
    await draw(<CascadingMenu taps={{ "sub:0": sort, "tab:1": share }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("menuitem", { name: "More" }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    await fireEvent.press(screen.getByRole("menuitem", { name: "Sort" }));
    expect(sort).toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Sort" })).toBeNull();
    /* back from the submenu to the menu */
    await fireEvent.press(screen.getByRole("button", { name: "Open menu" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "More" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "More" }));
    await fireEvent.press(screen.getByRole("menuitem", { name: "Share" }));
    expect(share).toHaveBeenCalled();
  });
});
