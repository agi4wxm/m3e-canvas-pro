import { describe, expect, it } from "vitest";
import { partBySlug, viewOf, overhangs } from "./registry";

/* A part drawn open off its trigger stands at its closed size: its canvas drawing is the closed part, out of sight,
 * with the open drawing hanging from its top left (parts/contained.tsx `Overhang`), so auto layout and every measure
 * go by the closed part. */

describe("parts drawn open off their trigger", () => {
  it("hang from the closed part when the menu opens from the trigger's top left", () => {
    for (const slug of ["select", "combobox", "dropdown-menu", "menubar", "search"]) {
      const def = partBySlug(slug)!;
      expect(overhangs(def), slug).toBe(true);
      const node = viewOf(def, {});
      expect(node.type, slug).toBe("Overhang");
      /* the closed part first, the open drawing in its box second */
      const [closed, open] = node.children ?? [];
      expect(typeof closed === "object" && closed.type, slug).not.toBe("Contained");
      expect(typeof open === "object" && open.type, slug).toBe("Contained");
    }
  });

  it("leave alone what opens around its trigger, and what has none", () => {
    for (const slug of ["tooltip", "popover", "dialog", "sheet"]) {
      const def = partBySlug(slug)!;
      expect(overhangs(def), slug).toBe(false);
      expect(viewOf(def, {}).type, slug).toBe("Contained");
    }
    expect(overhangs(partBySlug("button"))).toBe(false);
  });

  it("open by themselves in the preview, the box only taking the trigger's pointer", () => {
    const node = viewOf(partBySlug("select")!, {}, undefined, undefined, true);
    expect(node.type).toBe("Overhang");
    expect(node.props?.live).toBe(true);
  });

  it("draw the date picker's calendar hanging under its field on the canvas, and the real picker in the preview", () => {
    const def = partBySlug("date-picker")!;
    const canvas = JSON.stringify(viewOf(def, {}));
    expect(canvas).toContain("date-picker-popup");
    expect(canvas).toContain('"position":"absolute"');
    expect(JSON.stringify(viewOf(def, {}, undefined, undefined, true))).not.toContain("date-picker-popup");
  });
});
