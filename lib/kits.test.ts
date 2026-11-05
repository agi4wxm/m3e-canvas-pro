import { beforeAll, describe, expect, it, vi } from "vitest";
import { KITS, kitBySlug } from "../parts/kits";
import { defaultMeasures } from "../parts/templates/kit";
import { partBySlug } from "../parts/registry";
import { withoutSampleWords } from "./ai";
import { arrangeFlows } from "./flow";
import { setGlobalLang } from "./i18n";
import { isProject } from "./project";
import { kitGroups, kitLookOf, landTree, roomOn, splitIntoAtoms, treeSize } from "./kits";
import { DEFAULT_THEME, frameRect, makeItem, type Frame, type Group } from "./tokens";

/* A kit added to a document, and a composite split into atoms: groups that name their box, stand
 * inside it, land on the screen they are let go on, and keep what the part they replace had. */

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

const look = kitLookOf(DEFAULT_THEME);
const phone: Frame = { id: "f", name: "Home", x: 1000, y: 200 };
const small: Frame = { id: "s", name: "Small", x: 2000, y: 200, w: 360, h: 780 };

const inside = (g: Group, host: Group, m: Record<string, number>) => {
  const it = g.items[0];
  const hi = host.items[0];
  return g.x >= host.x - 1 && g.y >= host.y - 1 && g.x + m[it.id] <= host.x + m[hi.id] + 1 && g.y + m[`${it.id}:h`] <= host.y + m[`${hi.id}:h`] + 1;
};

describe("a kit added", () => {
  it("is its outermost box first, and every other group names the box it stands in, before it", () => {
    for (const kit of KITS)
      for (const v of kit.variants) {
        const groups = kitGroups(kit, look, "en", { variant: v.key });
        expect(groups[0].inFlow, `${kit.slug}/${v.key}`).toBeUndefined();
        expect(groups[0].items[0].component).toBe("box");
        const ids = new Set(groups.map((g) => g.id));
        expect(ids.size).toBe(groups.length);
        groups.slice(1).forEach((g, i) => {
          expect(g.inFlow && ids.has(g.inFlow), `${kit.slug}/${v.key}: ${g.items[0].component}`).toBe(true);
          const host = groups.findIndex((x) => x.id === g.inFlow);
          expect(host, `${kit.slug}/${v.key}: a box comes before what it holds`).toBeLessThan(i + 1);
          expect(partBySlug(groups[host].items[0].component)?.flow).toBeTruthy();
        });
      }
  });

  it("is laid out already, everything inside its box, and stays put when laid out again", () => {
    for (const kit of KITS)
      for (const v of kit.variants) {
        const groups = kitGroups(kit, look, "en", { variant: v.key, at: { x: 40, y: 60 } });
        const m = defaultMeasures(groups);
        expect(groups[0].x).toBe(40);
        expect(groups[0].y).toBe(60);
        for (const g of groups.slice(1)) expect(inside(g, groups.find((x) => x.id === g.inFlow)!, m), `${kit.slug}/${v.key}: ${g.items[0].component} at ${g.x},${g.y}`).toBe(true);
        expect(arrangeFlows(groups, m), `${kit.slug}/${v.key}`).toBe(groups);
      }
  });

  it("speaks the language it is added in", () => {
    const zh = kitGroups(kitBySlug("claude-prompt")!, look, "zh");
    const area = zh.find((g) => g.items[0].component === "textarea")!;
    expect(area.items[0].props?.placeholder).toBe("今天有什么可以帮你？");
    expect(zh[0].name).toBe("输入框");
  });

  it("is brought down to the width of a smaller phone, and what it holds follows", () => {
    const groups = kitGroups(kitBySlug("claude-prompt")!, look, "en", { screen: small });
    expect(treeSize(groups).w).toBe(328);
    const m = defaultMeasures(groups);
    for (const g of groups.slice(1)) expect(g.x + m[g.items[0].id]).toBeLessThanOrEqual(groups[0].x + 328 + 1);
    expect(roomOn({ id: "d", name: "D", x: 0, y: 0, w: 1280, h: 800 })).toBeUndefined();
    /* a bar spans the screen it is for, edge to edge */
    const bar = kitGroups(kitBySlug("top-app-bar")!, look, "en", { screen: small });
    expect(treeSize(bar).w).toBe(360);
    expect(landTree(bar, small.x + 30, small.y + 100, [small], true).groups[0].x).toBe(small.x);
  });

  it("lands inside the screen it is let go on, on its grid, and off any screen where it is let go", () => {
    const groups = kitGroups(kitBySlug("claude-prompt")!, look, "en");
    const { w, h } = treeSize(groups);
    /* let go hanging off the right and the foot of the screen */
    const landed = landTree(groups, phone.x + 100, phone.y + 800, [phone, small]);
    expect(landed.frame?.id).toBe("f");
    const r = frameRect(phone);
    expect(landed.groups[0].x).toBeGreaterThanOrEqual(r.l + 16);
    expect(landed.groups[0].x + w).toBeLessThanOrEqual(r.r - 16);
    expect(landed.groups[0].y + h).toBeLessThanOrEqual(r.b - 16);
    expect((landed.groups[0].x - r.l) % 4).toBe(0);
    expect((landed.groups[0].y - r.t) % 4).toBe(0);
    /* everything moved with its box */
    expect(landed.groups[1].x - landed.groups[0].x).toBe(groups[1].x - groups[0].x);
    const loose = landTree(groups, -500, -500, [phone]);
    expect(loose.frame).toBeUndefined();
    expect(loose.groups[0].x).toBe(-500);
  });

  it("takes the variant the style calls for", () => {
    const desk = kitLookOf({ ...DEFAULT_THEME, style: "vscode" });
    expect(desk.group).toBe("desktop");
    const groups = kitGroups(kitBySlug("search-bar")!, desk, "en");
    expect(groups.some((g) => g.items[0].component === "kbd")).toBe(true);
    expect(kitLookOf({ ...DEFAULT_THEME, dark: true }).dark).toBe(true);
    /* and the room there is: the one-row box is for a wide screen, whatever the style */
    const desktop: Frame = { id: "d", name: "D", x: 0, y: 0, w: 1280, h: 800 };
    expect(treeSize(kitGroups(kitBySlug("codex-prompt")!, desk, "en", { screen: phone })).w).toBe(380);
    expect(treeSize(kitGroups(kitBySlug("codex-prompt")!, look, "en", { screen: desktop })).w).toBe(640);
  });
});

describe("a document of atoms", () => {
  it("is an ordinary document: it saves, opens, and comes through a model's cleaning", () => {
    const groups = [...kitGroups(kitBySlug("codex-prompt")!, look, "en", { screen: phone }), { id: "v", x: 0, y: 0, axis: "x" as const, items: [{ ...makeItem("svg"), props: { mode: "markup", markup: '<svg viewBox="0 0 4 4"><path d="M0 0h4v4z" onclick="x()"/></svg>' } }] }];
    const doc = JSON.parse(JSON.stringify({ groups, frames: [phone], paletteKey: "purple", frame: "phone", title: "", brief: "" }));
    expect(isProject(doc)).toBe(true);
    const clean = withoutSampleWords(doc);
    expect(clean.groups.map((g: Group) => g.items[0].component)).toEqual(groups.map((g) => g.items[0].component));
    expect(clean.groups.find((g: Group) => g.id === "v")?.items[0].props?.markup).toContain("<path");
  });
});

describe("a composite split into atoms", () => {
  const card = (): Group[] => {
    const host: Group = { id: "host", x: 0, y: 0, axis: "x", items: [{ ...makeItem("container"), id: "hi", props: { layout: "column", width: 412, height: 600 } }] };
    const before: Group = { id: "b", x: 16, y: 16, axis: "x", inFlow: "host", items: [{ ...makeItem("text"), id: "bt" }] };
    const it = { ...makeItem("card"), id: "card-item", props: { title: "Soup", description: "Hot", action: "Order" }, action: { to: "detail", transition: "slide" as const }, fill: "primaryContainer" as const };
    const target: Group = { id: "c", x: 16, y: 64, axis: "x", inFlow: "host", name: "Dinner", items: [it] };
    const after: Group = { id: "a", x: 16, y: 300, axis: "x", inFlow: "host", items: [{ ...makeItem("button"), id: "at" }] };
    return [host, before, target, after];
  };

  it("stands where the part stood, in its place among the others, with its ids, name, tap and paint", () => {
    const groups = card();
    const out = splitIntoAtoms(groups, "card-item", "en", { "card-item": 300 })!;
    expect(out.rootItemId).toBe("card-item");
    const at = out.groups.findIndex((g) => g.id === "c");
    expect(at).toBe(2);
    const root = out.groups[at];
    expect(root.x).toBe(16);
    expect(root.y).toBe(64);
    expect(root.inFlow).toBe("host");
    expect(root.name).toBe("Dinner");
    expect(splitIntoAtoms(groups.map((g) => (g.id === "c" ? { ...g, name: undefined } : g)), "card-item", "en")!.groups[2].name).toBe("Card");
    expect(root.items[0]).toMatchObject({ id: "card-item", component: "box", action: { to: "detail" }, fill: "primaryContainer" });
    expect(root.items[0].props?.width).toBe(300);
    /* what was before and after it still is */
    expect(out.groups[1].id).toBe("b");
    expect(out.groups[out.groups.length - 1].id).toBe("a");
    /* its words are now atoms in its box */
    const words = out.groups.filter((g) => g.items[0].component === "text").map((g) => g.items[0].props?.text);
    expect(words).toEqual(expect.arrayContaining(["Soup", "Hot"]));
    const kids = out.groups.slice(at + 1, -1);
    expect(kids.length).toBeGreaterThan(2);
    for (const k of kids) expect(out.groups.some((g) => g.id === k.inFlow)).toBe(true);
  });

  it("leaves a part that cannot be split, and one that is not there, alone", () => {
    const groups = card();
    expect(splitIntoAtoms(groups, "bt", "en")).toBeNull();
    expect(splitIntoAtoms(groups, "nope", "en")).toBeNull();
  });
});
