import { Doc, Group, makeItem, PHONE_H, sizeOf } from "./tokens";
import { PARTS } from "../parts/registry";

/** A sketch with one part of every slug, each on its own row of a phone screen, so
 *  the generated code can be tested and type-checked against the real components. */
export function allPartsDoc(): Doc {
  const slugs = PARTS.map((d) => d.slug);
  const groups: Group[] = slugs.map((slug, i) => ({
    id: `g-${slug}`,
    x: 16,
    y: 24 + i * 120,
    axis: "x",
    items: [{ ...makeItem("component", slug), id: `i-${slug}` }],
  }));
  return {
    groups,
    frames: [
      { id: "f-all", name: "All parts", x: 0, y: 0, h: 24 + slugs.length * 120 + 24 },
      { id: "f-2", name: "日本語", x: 600, y: 0 },
    ],
    paletteKey: "purple",
    frame: "phone",
    title: "All parts",
    brief: "",
  };
}

/** A long screen exercises the scrolling scaffold and the folding FAB. */
export function scrollingDoc(): Doc {
  const nav = { ...makeItem("component", "navigation-bar"), id: "nav" };
  return {
    ...allPartsDoc(), title: "Scrolling", frames: [{ id: "long", name: "Long", x: 0, y: 0, length: PHONE_H * 2 }],
    groups: [
      { id: "top", x: 0, y: 0, axis: "x", items: [{ ...makeItem("component", "app-bar"), id: "top" }] },
      { id: "body", x: 16, y: 1200, axis: "x", items: [{ ...makeItem("component", "button"), id: "body", props: { label: "Below the fold" } }] },
      { id: "fab", x: 200, y: PHONE_H * 2 - 180, axis: "x", items: [{ ...makeItem("component", "fab"), id: "fab", props: { label: "Create", icon: "add" }, collapseOnScroll: true }] },
      { id: "nav", x: 0, y: PHONE_H * 2 - sizeOf(nav, {}).h, axis: "x", items: [nav] },
    ],
  };
}
