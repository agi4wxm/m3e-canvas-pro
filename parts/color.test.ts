/* The one color value (parts/color.ts, docs/组件规范.md "颜色"): every color prop holds it and it is read in one place;
 * a part draws the colors it was designed around with the classes it always had, and any other as a style. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { propValueError } from "../lib/core/ops/validate";
import { COLOR_WORDS_6 } from "../lib/converge";
import { colorChoicesOf, colorValue, cssColor, onColorOf, paintOf, parseColor, roleOf } from "./color";
import { PARTS, partBySlug, reader, treeOf } from "./registry";
import type { PropDef } from "./types";

beforeAll(() => setGlobalLang("en"));

const colorProps = PARTS.flatMap((def) => def.props.filter((d): d is Extract<PropDef, { kind: "color" }> => d.kind === "color").map((d) => [def, d] as const));

describe("a color value", () => {
  it("is a role, a role at a share of itself or a hex, or none; nothing else", () => {
    for (const v of ["primary", "on-surface-variant", "primary/40", "surface-container-highest/0", "#abc", "#abcd", "#7BAE7A", "#7bae7a80", ""]) expect(colorValue(v), v).toBe(v);
    for (const v of ["muted", "default", "red", "#12345", "primary/101", "url(x)", "var(--x)", "rgb(0,0,0)", 3, null]) expect(colorValue(v), String(v)).toBeUndefined();
  });

  it("is written as CSS: a role as its custom property, a share of one mixed with nothing, a hex as written", () => {
    expect(cssColor("primary")).toBe("var(--md-sys-color-primary)");
    expect(cssColor("primary/40")).toBe("color-mix(in srgb, var(--md-sys-color-primary) 40%, transparent)");
    expect(cssColor("#7BAE7A")).toBe("#7BAE7A");
    expect(cssColor("")).toBeUndefined();
    expect(cssColor("red")).toBeUndefined();
  });

  it("says the color that reads over it", () => {
    expect(onColorOf("primary")).toBe("on-primary");
    expect(onColorOf("tertiary-container")).toBe("on-tertiary-container");
    expect(onColorOf("surface-container-high")).toBe("on-surface");
    expect(onColorOf("inverse-surface")).toBe("inverse-on-surface");
    expect(onColorOf("#ffffff")).toBe("#000000");
    expect(onColorOf("#1d1b20")).toBe("#ffffff");
    expect(roleOf("primary")).toBe("primary");
    expect(roleOf("primary/40")).toBeUndefined();
    expect(parseColor("primary/40")).toEqual({ role: "primary", alpha: 40 });
  });

  it("paints a color a part was designed around with its class, any other as a style", () => {
    const classes = { "": "text-on-surface", primary: "text-primary" };
    expect(paintOf("primary", classes, "color")).toEqual({ className: "text-primary" });
    expect(paintOf("", classes, "color")).toEqual({ className: "text-on-surface" });
    expect(paintOf("#ff0000", classes, "color")).toEqual({ style: { color: "#ff0000" } });
    expect(paintOf("nope", classes, "color")).toEqual({});
  });
});

describe("every color prop", () => {
  it("holds the one color value: its default and the roles it offers are colors, checked in one place", () => {
    expect(colorProps.map(([def, d]) => `${def.slug}.${d.key}`).sort()).toEqual(["container.fill", "dot.color", "fab.color", "icon.color", "item-cell.rarityColor", "item.iconFill", "separator.color", "shape.color", "spinner.color", "stat-bar.color", "svg.color", "text.color"]);
    for (const [def, d] of colorProps) {
      expect(colorValue(d.default), `${def.slug}.${d.key}`).toBe(d.default);
      for (const r of d.roles ?? []) expect(parseColor(r), `${def.slug}.${d.key} ${r}`).toBeDefined();
      expect(propValueError(d, "primary/40")).toBeNull();
      expect(propValueError(d, "muted")).toMatch(/should be a color/);
      expect(colorChoicesOf(d)).toContain("");
    }
  });

  it("reads anything that is no color as its default", () => {
    for (const [def, d] of colorProps) expect(reader(def, { [d.key]: "chartreuse-ish" }).s(d.key)).toBe(d.default);
  });

  it("draws each color it was designed around as a class, with no style of its own; another color as a style", () => {
    for (const [def, d] of colorProps) {
      const drawn = (v: string) => JSON.stringify(treeOf(def, { [d.key]: v }));
      for (const r of [...(d.roles ?? []), ""]) expect(drawn(r), `${def.slug}.${d.key}=${r}`).not.toMatch(/var\(--md-sys-color-[a-z-]+\) \d+%|#123456/);
      /* a color of the author's own reaches the drawing */
      if (def.slug !== "item" && def.slug !== "stat-bar") expect(drawn("#123456"), `${def.slug}.${d.key}`).toMatch(/#123456/);
    }
  });

  it("had its own words written as the colors they drew by version 6 (lib/converge.ts), each now a color it offers", () => {
    for (const [at, words] of Object.entries(COLOR_WORDS_6)) {
      const [slug, key] = at.split(".");
      const d = partBySlug(slug)!.props.find((x) => x.key === key) as Extract<PropDef, { kind: "color" }>;
      for (const to of Object.values(words)) expect(to === "" || (d.roles ?? []).includes(to), `${at} → ${to}`).toBe(true);
    }
  });
});
