/* Bars and FABs added with no place given land on their edge of the screen, the way the tool guide says and Tidy
 * puts them, where no editor lays the screen out afterwards (an agent, the MCP file backend). Given a place, they keep
 * it. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { groupBounds } from "../tokens";
import { guessMeasurer } from "./op";
import { counterIds, DocStore } from "./store";
import { stateOf } from "./state";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const ai = { origin: "ai" as const };
const fresh = () => new DocStore(stateOf({ groups: [], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const boundsOf = (s: DocStore, id: string) => {
  const g = s.get().doc.groups.find((x) => x.items.some((it) => it.id === id))!;
  return groupBounds(g, guessMeasurer.measure(s.get()));
};

describe("bars and FABs given no place", () => {
  it("put a navigation bar at the foot and an app bar at the head", () => {
    const s = fresh();
    s.run(ops.addPart, { slug: "text", id: "t", screen: "F1", props: { text: "Body" } }, ai);
    s.run(ops.addPart, { slug: "navigation-bar", id: "nav", screen: "F1" }, ai);
    s.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "F1", props: { title: "Home" } }, ai);
    const nav = boundsOf(s, "nav");
    expect(nav.b).toBe(892);
    expect(nav.l).toBe(0);
    expect(nav.r).toBe(412);
    const bar = boundsOf(s, "bar");
    expect(bar.t).toBe(0);
    expect(bar.l).toBe(0);
  });

  it("stack a tab row under the app bar, and a FAB in the bottom right corner above the navigation bar", () => {
    const s = fresh();
    s.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "F1" }, ai);
    s.run(ops.addPart, { slug: "tabs", id: "tabs", screen: "F1" }, ai);
    s.run(ops.addPart, { slug: "navigation-bar", id: "nav", screen: "F1" }, ai);
    s.run(ops.addPart, { slug: "fab", id: "fab", screen: "F1" }, ai);
    expect(boundsOf(s, "tabs").t).toBe(boundsOf(s, "bar").b);
    const fab = boundsOf(s, "fab");
    const nav = boundsOf(s, "nav");
    expect(fab.b).toBeLessThanOrEqual(nav.t - 8);
    expect(fab.r).toBeGreaterThan(412 - 32);
    expect(fab.r).toBeLessThanOrEqual(412);
  });

  it("put a box pinned to the bottom (a kit's sheet or buy bar) at the foot", () => {
    const s = fresh();
    s.run(ops.addPart, { slug: "box", id: "sheet", screen: "F1", props: { pin: "bottom", surface: "sheet", height: 120, hugHeight: false } }, ai);
    expect(boundsOf(s, "sheet").b).toBe(892);
  });

  it("keep the place they were given", () => {
    const s = fresh();
    s.run(ops.addPart, { slug: "navigation-bar", id: "nav", screen: "F1", at: { x: 0, y: 400 } }, ai);
    s.run(ops.addPart, { slug: "fab", id: "fab", screen: "F1", at: { x: 40, y: 200 } }, ai);
    expect(boundsOf(s, "nav").t).toBe(400);
    expect(boundsOf(s, "fab")).toMatchObject({ l: 40, t: 200 });
  });
});
