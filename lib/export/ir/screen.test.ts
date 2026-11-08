import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { makeItem, withIds, type Doc, type Group, type Item } from "../../tokens";
import { proofDoc } from "../../exportProject.fixture";
import { printRnScreens } from "../rn/print";
import { printMiniScreens } from "../miniapp/print";
import { PARTS as RN_PARTS } from "../../../rn/src/kit/parts.generated";
import { PARTS as MINI_PARTS } from "../../../miniapp-kit/src/kit/parts.generated";
import { factsOf } from "./facts";
import { planScreens, type Placement, type RunNode } from "./screen";

/* The screen intermediate representation (report 9.2): what a screen is, worked out once, which the phone app's and the
 * mini-program's printers only print. */

beforeAll(() => setGlobalLang("en"));

const rnPlan = (doc: Doc, widths: Record<string, number>) => planScreens(doc, widths, { names: { lower: false, reservedComponents: ["screen"] }, regions: true, foot: true, defaults: (s) => RN_PARTS[s]?.defaults ?? {} });
const miniPlan = (doc: Doc, widths: Record<string, number>) => planScreens(doc, widths, { names: { lower: true, reservedKeys: ["back", "link", "none"], reservedComponents: ["screen"] }, regions: true, foot: true, defaults: (s) => MINI_PARTS[s]?.defaults ?? {} });

/** every run of a plan, depth first, as `<kind>:<group id>` */
const runs = (ps: Placement[]): string[] => {
  const out: string[] = [];
  const walk = (n: RunNode) => {
    out.push(`${n.content.kind}:${n.run.id}`);
    const c = n.content;
    if (c.kind === "flow") c.kids.forEach(walk);
    if (c.kind === "split") c.panes.forEach(walk);
    if (c.kind === "instance") c.kids.forEach((k) => walk(k.node));
  };
  ps.forEach((p) => walk(p.node));
  return out;
};

describe("the screen plan", () => {
  it("is the same reading of the design for the phone and the mini-program: screens, placement, runs, parts", () => {
    const { doc, widths } = withIds(counter(), proofDoc);
    const rn = rnPlan(doc, widths);
    const mini = miniPlan(doc, widths);
    expect(rn.screens.map((s) => s.frame.id)).toEqual(mini.screens.map((s) => s.frame.id));
    for (const [i, s] of rn.screens.entries()) {
      const m = mini.screens[i];
      expect(s.body.map((p) => [p.at, p.layer]), s.frame.name).toEqual(m.body.map((p) => [p.at, p.layer]));
      expect(runs(s.body), s.frame.name).toEqual(runs(m.body));
      expect(s.groups.map((g) => g.id)).toEqual(m.groups.map((g) => g.id));
    }
    /* a bar at the foot is pinned there, a dialog that starts hidden is a layer, what stands loose is placed */
    const all = rn.screens.flatMap((s) => s.body);
    expect(all.some((p) => p.at === "pin" && p.edge === "bottom")).toBe(true);
    expect(all.some((p) => p.layer)).toBe(true);
    expect(all.some((p) => p.at === "loose")).toBe(true);
  });

  it("says what is attached to each part: its taps of places, its families and its events, with what they carry", () => {
    const tabs: Item = { ...makeItem("button-group"), id: "tabs", actions: { "tab:1": { to: "f2", motion: { kind: "instant" } }, "tab:*": { to: "none", effects: [{ do: "snackbar", message: "{{slot.index}}" }] } } };
    const pad: Item = { ...makeItem("number-pad"), id: "pad", actions: { "on:submit": { to: "none", effects: [{ do: "snackbar", message: "{{event.value}}" }] } } };
    const doc = docOf([group("g1", 16, 100, tabs), group("g2", 16, 300, pad)]);
    const plan = rnPlan(doc, {});
    const parts = plan.screens[0].body.map((p) => (p.node.content.kind === "part" ? p.node.content.part : undefined));
    expect(parts[0]?.places.map(([k]) => k)).toEqual(["tab:1"]);
    expect(parts[0]?.families.map(([k]) => k)).toEqual(["tab"]);
    expect(parts[1]?.events.map((e) => [e.name, Object.keys(e.payload)])).toEqual([["submit", ["value"]]]);
  });

  it("is what both printers print: what stands loose stands at the same place on a phone and in a mini-program", () => {
    const { doc, widths } = withIds(counter(), proofDoc);
    const plan = rnPlan(doc, widths);
    const rn = printRnScreens(doc, widths);
    const mini = printMiniScreens(doc, widths);
    for (const [i, s] of plan.screens.entries()) {
      const at = (src: string) => [...src.matchAll(/^ {6}<At x=\{(-?[\d.]+)\} y=\{(-?[\d.]+)\}/gm)].map((m) => `${m[1]},${m[2]}`);
      const loose = s.body.flatMap((p) => (p.at === "loose" && !p.layer ? [`${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`] : []));
      expect(at(rn.screens[i].source), s.frame.name).toEqual(s.body.flatMap((p) => (p.at === "loose" ? [`${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`] : [])));
      expect(at(mini.screens[i].source), s.frame.name).toEqual(loose);
    }
  });
});

describe("what the document's taps do, read once for both apps", () => {
  /* a call whose answer picks a branch (docs/交互规则.md, 回答上的条件): the branch it does not take hides a note */
  const branchy = (): Doc => {
    const ask: Item = {
      ...makeItem("button"),
      id: "ask",
      props: { label: "Ask" },
      // eslint-disable-next-line unicorn/no-thenable -- an action body as data, never a function: nothing awaits it
      action: { to: "none", effects: [{ do: "call", operationId: "getHealth", then: { to: "none", when: { expr: "response.ok" }, else: { to: "none", effects: [{ do: "hide", part: "note" }] } } }] },
    };
    const note: Item = { ...makeItem("text"), id: "note", props: { text: "All good" } };
    return docOf([group("g-ask", 16, 100, ask), group("g-note", 16, 200, note)]);
  };

  it("sees the parts an answer's other branch shows or hides", () => {
    expect([...factsOf(branchy()).toggled]).toEqual(["g-note"]);
  });

  it("draws such a part while the app's memory shows it, on the phone and in the mini-program alike", () => {
    expect(printRnScreens(branchy(), {}, { runtime: { bind: "../bind" } }).screens[0].source).toContain('app.shown("g-note")');
    /* the mini-program read only a call's then and catch, not the branch an answer picks: the note never hid */
    expect(printMiniScreens(branchy(), {}).screens[0].source).toContain('s.shows("text")');
  });
});

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

function group(id: string, x: number, y: number, it: Item): Group {
  return { id, x, y, axis: "x", items: [it] };
}

function docOf(groups: Group[]): Doc {
  return { groups, frames: [{ id: "f1", name: "Home", x: 0, y: 0 }, { id: "f2", name: "Next", x: 600, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" };
}
