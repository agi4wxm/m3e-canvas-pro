import { describe, expect, it } from "vitest";
import { openProject, projectFile } from "./project";
import { buildPrompt } from "./prompt";
import { type Doc, DESKTOP_W, type Frame, type Group, TABLET_W, frameRect, frameSizeOf, makeItem, framePresetOf } from "./tokens";
import { createVariant, familiesOf, familyOf, framesWithout, missingSizes, rootOf, variantFor } from "./variants";

const f = (id: string, x: number, extra: Partial<Frame> = {}): Frame => ({ id, name: id, x, y: 0, ...extra });
const part = (id: string, x: number, y: number, slug = "button"): Group => ({ id, x, y, axis: "x", items: [{ ...makeItem(slug), id: `i-${id}`, props: {} }] });

describe("families", () => {
  const frames = [f("a", 0), f("b", 600), f("a2", 1200, { variantOf: "a", w: 1280, h: 800 }), f("a3", 2600, { variantOf: "a", w: 834, h: 1194 })];

  it("hang from one root, whichever size is asked about", () => {
    expect(familyOf(frames, "a3").map((x) => x.id)).toEqual(["a", "a2", "a3"]);
    expect(familyOf(frames, "b").map((x) => x.id)).toEqual(["b"]);
    expect(familiesOf(frames).map((list) => list.map((x) => x.id))).toEqual([["a", "a2", "a3"], ["b"]]);
  });

  it("ignore a link to nothing, and a loop stops where it closes", () => {
    expect(rootOf([f("x", 0, { variantOf: "gone" })], f("x", 0, { variantOf: "gone" })).id).toBe("x");
    const loop = [f("p", 0, { variantOf: "q" }), f("q", 500, { variantOf: "p" })];
    expect(() => familyOf(loop, "p")).not.toThrow();
  });

  it("resolve a width to the sibling of that size, or the nearest", () => {
    expect(variantFor(frames, "a", "desktop")?.id).toBe("a2");
    expect(variantFor(frames, "a2", "tablet")?.id).toBe("a3");
    expect(variantFor(frames, "a3", "phone")?.id).toBe("a");
    expect(variantFor(frames, "b", "desktop")?.id).toBe("b");
    const two = [f("p", 0), f("d", 500, { variantOf: "p", w: 1280, h: 800 })];
    /* a tablet's 834 lies nearer a phone's 412 than a desktop's 1280 */
    expect(variantFor(two, "d", "tablet")?.id).toBe("p");
    expect(variantFor([f("t", 0, { w: 834, h: 1194 }), f("d", 900, { variantOf: "t", w: 1280, h: 800 })], "d", "phone")?.id).toBe("t");
    expect(variantFor(two, "nope", "tablet")).toBeUndefined();
  });

  it("know which sizes are still to be made", () => {
    expect(missingSizes(frames, "a")).toEqual([]);
    expect(missingSizes(frames, "b")).toEqual(["tablet", "desktop"]);
  });

  it("stay together when the root goes", () => {
    const out = framesWithout(frames, "a");
    expect(out.find((x) => x.id === "a2")?.variantOf).toBeUndefined();
    expect(out.find((x) => x.id === "a3")?.variantOf).toBe("a2");
    expect(framesWithout(frames, "b").map((x) => x.id)).toEqual(["a", "a2", "a3"]);
  });
});

describe("creating a variant", () => {
  const frames = [f("home", 0), f("next", 532)];
  const groups = [part("g1", 16, 100), part("g2", 16, 200), part("other", 548, 100)];
  const widths = Object.fromEntries(groups.flatMap((g) => [[g.items[0].id, 100], [`${g.items[0].id}:h`, 40]]));
  const made = createVariant(groups, frames, "home", "desktop", widths, "desk")!;

  it("makes a linked sibling at the new size with the same name", () => {
    const v = made.frames.find((x) => x.id === "desk")!;
    expect(v.variantOf).toBe("home");
    expect(v.name).toBe("home");
    expect(framePresetOf(v)).toBe("desktop");
    expect(frameSizeOf(v).w).toBe(DESKTOP_W);
  });

  it("stands beside the original, with what is further right moved over", () => {
    expect(made.frames.map((x) => x.id)).toEqual(["home", "desk", "next"]);
    const home = made.frames[0];
    const desk = made.frames[1];
    const next = made.frames[2];
    expect(desk.x).toBeGreaterThan(frameRect(home).r);
    expect(next.x).toBeGreaterThan(frameRect(desk).r);
    expect(made.groups.find((g) => g.id === "other")!.x - next.x).toBe(16);
  });

  it("has parts of its own: editing one does not reach the other", () => {
    const own = made.groups.filter((g) => g.x >= made.frames[1].x && g.x < made.frames[2].x);
    expect(own).toHaveLength(2);
    const ids = new Set(groups.flatMap((g) => g.items.map((it) => it.id)));
    expect(own.every((g) => !ids.has(g.items[0].id))).toBe(true);
    expect(made.groups.filter((g) => g.id === "g1" || g.id === "g2").map((g) => g.x)).toEqual([16, 16]);
  });

  it("refuses a size the family already has, and hangs a variant of a variant from the root", () => {
    expect(createVariant(made.groups, made.frames, "home", "desktop", widths)).toBeNull();
    expect(createVariant(made.groups, made.frames, "desk", "phone", widths)).toBeNull();
    const again = createVariant(made.groups, made.frames, "desk", "tablet", widths, "tab")!;
    const tab = again.frames.find((x) => x.id === "tab")!;
    expect(tab.variantOf).toBe("home");
    expect(frameSizeOf(tab).w).toBe(TABLET_W);
    expect(again.frames.map((x) => x.id)).toEqual(["home", "desk", "tab", "next"]);
  });
});

describe("in a file and in the prompt", () => {
  const doc: Doc = { groups: [part("g", 16, 100), part("g2", 600, 100)], frames: [f("home", 0, { name: "Home" }), f("desk", 500, { name: "Home", variantOf: "home", w: 1280, h: 800 })], paletteKey: "purple", frame: "phone", title: "", brief: "" };

  it("saves and opens the link", () => {
    expect(openProject(JSON.parse(JSON.stringify(projectFile(doc))))?.frames[1].variantOf).toBe("home");
  });

  it("drops a link of the wrong kind, and one to itself, keeping the screen", () => {
    const base = JSON.parse(JSON.stringify(doc));
    const bad = openProject({ ...base, frames: [base.frames[0], { ...base.frames[1], variantOf: 7 }] })!;
    expect(bad.frames[1]).not.toHaveProperty("variantOf");
    expect(openProject({ ...base, frames: [{ ...base.frames[0], variantOf: "home" }] })?.frames[0]).not.toHaveProperty("variantOf");
  });

  it.each([
    ["en", "same screen as \"Home\" at another size"],
    ["ja", "「Home」画面と同じ画面の別サイズ"],
    ["zh", "与“Home”屏幕相同的屏幕"],
    ["ko", "\"Home\" 화면과 같은 화면의 다른 크기"],
  ] as const)("the prompt says so in %s", (lang, words) => {
    expect(buildPrompt(doc, {}, undefined, lang)).toContain(words);
  });
});
