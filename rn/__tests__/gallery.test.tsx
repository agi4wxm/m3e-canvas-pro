import { render, screen } from "@testing-library/react-native";

import { Gallery, queryOf } from "../src/gallery/Gallery";
import { THEMES } from "../src/gallery/themes.generated";
import "./helpers";

/* The test bed's gallery: every part under every style it is checked in, as the web build is photographed. */

describe("the gallery", () => {
  it("reads the style, the mode and the parts from the address", () => {
    expect(queryOf("?style=ios&dark=1&part=button,switch")).toMatchObject({ style: "ios", dark: true, kits: true });
    expect(queryOf("?style=nope").style).toBe("material");
    expect([...queryOf("?part=a,b").parts!]).toEqual(["a", "b"]);
  });

  it.each(Object.keys(THEMES))("draws every part and kit under %s", async (style) => {
    await render(<Gallery initial={queryOf(`?style=${style}`)} />);
    expect(screen.getByTestId("coverage")).toBeTruthy();
    expect(screen.getByTestId("cell-app-bar")).toBeTruthy();
    expect(screen.getByTestId("cell-prize-wheel")).toBeTruthy();
    expect(screen.getByTestId("kit-tab-bar")).toBeTruthy();
  }, 60_000);
});
