import { describe, expect, it } from "vitest";
import { fullWidth, roleOf } from "./role";

describe("roleOf", () => {
  it("maps each part to its role", () => {
    expect(roleOf({ component: "app-bar" })).toBe("top");
    expect(roleOf({ component: "navigation-bar" })).toBe("bottom");
    expect(roleOf({ component: "navigation-rail" })).toBe("rail");
    expect(roleOf({ component: "sonner" })).toBe("floatingBottom");
    expect(roleOf({ component: "fab" })).toBe("fab");
    expect(roleOf({ component: "dialog" })).toBe("overlay");
    expect(roleOf({ component: "label" })).toBe("label");
    expect(roleOf({ component: "switch" })).toBe("control");
    expect(roleOf({ component: "carousel" })).toBe("fullWidth");
    expect(roleOf({ component: "item" })).toBe("listLike");
  });

  it("answers undefined for the parts that belong in the body", () => {
    expect(roleOf({ component: "button" })).toBeUndefined();
    expect(roleOf({ component: "container" })).toBeUndefined();
  });

  it("reads a component's role from its PartDef", () => {
    expect(roleOf({ component: "navigation-bar" })).toBe("bottom");
    expect(roleOf({ component: "app-bar" })).toBe("top");
    expect(roleOf({ component: "navigation-rail" })).toBe("rail");
    expect(roleOf({ component: "dialog" })).toBe("overlay");
    expect(roleOf({ component: "button" })).toBeUndefined();
  });

  it("resolves dynamic roles from the props", () => {
    expect(roleOf({ component: "toolbar", props: { kind: "floating" } })).toBe("floatingBottom");
    expect(roleOf({ component: "toolbar", props: { kind: "docked" } })).toBe("bottom");
  });

  it("answers undefined for an unknown component slug", () => {
    expect(roleOf({ component: "no-such-part" })).toBeUndefined();
  });
});

describe("fullWidth", () => {
  it("spans edge to edge for top bars, the carousel and the navigation bar", () => {
    expect(fullWidth({ component: "app-bar" })).toBe(true);
    expect(fullWidth({ component: "tabs" })).toBe(true);
    expect(fullWidth({ component: "carousel" })).toBe(true);
    expect(fullWidth({ component: "navigation-bar" })).toBe(true);
  });

  it("keeps its own width for bottom parts that are not the navigation bar", () => {
    expect(fullWidth({ component: "drawer" })).toBe(false);
    expect(fullWidth({ component: "toolbar", props: { kind: "docked" } })).toBe(false);
  });

  it("is false for body parts", () => {
    expect(fullWidth({ component: "button" })).toBe(false);
    expect(fullWidth({ component: "card" })).toBe(false);
  });
});
