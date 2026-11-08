import { fireEvent, render, screen } from "@testing-library/react-native";

import { App as SlotsApp } from "../src/printed/slots/App";
import { BuyButton, SalesToday } from "../src/printed/slots/slots";

/* Parts the design marks as the product's own (lib/export/appCapabilities.ts, report 9.3), printed as an exported app
 * prints them: each drawn by its slot (src/printed/slots/custom/slots, written once), which draws the design's part
 * until it is changed. The button's slot is handed what the kit's Button is, its tap among it; the stat card, drawn as
 * its atoms, is handed its size. */

describe("a part the product draws itself", () => {
  it("draws the design's part until its slot is written, its tap where the design sends it", async () => {
    await render(<SlotsApp dark={false} />);
    expect(screen.getByText("Buy")).toBeTruthy();
    expect(screen.getByText("Revenue")).toBeTruthy();
    await fireEvent.press(screen.getByText("Buy"));
    expect(screen.getByText("Thank you")).toBeTruthy();
  });

  it("is a slot handed the kit component's props, the kit's drawing as its children", async () => {
    const onPress = jest.fn();
    await render(<BuyButton label="Pay now" onPress={onPress} />);
    await fireEvent.press(screen.getByText("Pay now"));
    expect(onPress).toHaveBeenCalled();
    await render(
      <SalesToday width={190} height={120}>
        <></>
      </SalesToday>,
    );
    expect(screen.toJSON()).toBeNull();
  });
});
