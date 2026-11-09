/* The focus ring on a phone or a TV (docs/焦点与输入.md): where the platform moves its focus over the parts (Android TV's
 * d-pad, a keyboard), the focused part wears M3's ring in the style's secondary color; a touch never focuses, so nothing
 * changes for a finger. */

import { act, fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Surface } from "../src/kit/Surface";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

describe("the focus ring", () => {
  it("is drawn round a part while the platform's focus is on it, in the secondary color", async () => {
    await draw(
      <Surface testID="buy" base={{ borderRadius: 20 }} onPress={() => {}}>
        <Text>Buy</Text>
      </Surface>,
    );
    expect(screen.queryByTestId("buy-focus")).toBeNull();
    await act(() => fireEvent(screen.getByTestId("buy"), "focus"));
    const ring = screen.getByTestId("buy-focus");
    expect(styleOf(ring)).toMatchObject({ borderWidth: 3, borderColor: MATERIAL_THEME.light.colors.secondary, borderRadius: 25 });
    await act(() => fireEvent(screen.getByTestId("buy"), "blur"));
    expect(screen.queryByTestId("buy-focus")).toBeNull();
  });

  it("is never drawn on a part that does nothing", async () => {
    await draw(
      <Surface testID="card">
        <Text>Card</Text>
      </Surface>,
    );
    expect(screen.queryByTestId("card-focus")).toBeNull();
  });
});
