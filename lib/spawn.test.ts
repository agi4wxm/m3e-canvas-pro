import { describe, expect, it } from "vitest";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "./core";
import { openProject, projectFile } from "./project";
import { createSpawns, fillSpawnWords, markSpawnWords, spawnLook, spawnProgress, spawnSpecOf, spawnedWords } from "./spawn";
import { driveSpawns } from "./spawnDom";
import { markTemplates, poolCopies } from "./spawnPool";
import type { Doc, Group } from "./tokens";

/* Templates spawned on events (docs/交互规则.md “按事件生成”): the pool's rules, the words, the operation, the file, and
 * the page's nodes driven frame by frame. */

describe("the pool of a template's instances", () => {
  const spec = { life: 1, max: 2 };
  it("keeps each instance for its life on the clock it is given, and none longer", () => {
    const s = createSpawns();
    s.spawn("t", spec, { event: { amount: 5 } }, 1000);
    expect(s.live("t", 1999).length).toBe(1);
    expect(s.live("t", 2000).length).toBe(0);
    /* a clock that stands still keeps it: what is alive is a function of the time read */
    expect(s.live("t", 1000).length).toBe(1);
  });

  it("gives the oldest's place to one more when the cap is reached, and the lowest free place otherwise", () => {
    const s = createSpawns();
    const a = s.spawn("t", spec, {}, 0);
    const b = s.spawn("t", spec, {}, 10);
    const c = s.spawn("t", spec, {}, 20);
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 0]);
    expect(s.live("t", 30).map((x) => x.serial)).toEqual([b.serial, c.serial]);
    /* gone by its life, a place is free again: the lowest */
    const d = s.spawn("t", spec, {}, 1015);
    expect(d.slot).toBe(1);
  });

  it("reads where an instance stands at its spawn, keeps its numbers in bounds and forgets everything when cleared", () => {
    const s = createSpawns();
    const told: number[] = [];
    s.subscribe(() => told.push(s.groups().length));
    expect(s.spawn("t", { life: 1, max: 4, at: "event.id" }, { event: { id: "slime" } }, 0).at).toBe("slime");
    expect(spawnSpecOf({ life: 999, max: 0, motion: "spin" })).toEqual({ life: 60, max: 1 });
    expect(spawnSpecOf({ life: "1" })).toEqual({ life: 1, max: 8 });
    s.clear();
    expect(s.live("t", 0)).toEqual([]);
    expect(told).toEqual([1, 0]);
  });

  it("fills a template's words from what its step read, once", () => {
    expect(markSpawnWords("-{{event.amount}} ({{ event.id }})")).toBe("-⟦event.amount⟧ (⟦ event.id ⟧)");
    expect(spawnedWords("-{{event.amount}}", { scope: { event: { amount: 12 } } })).toBe("-12");
    expect(fillSpawnWords("no marks", { scope: {} })).toBe("no marks");
  });

  it("floats a damage number up and fades it out over its life", () => {
    expect(spawnProgress({ born: 0, ends: 1000 }, 500)).toBe(0.5);
    expect(spawnLook("float", 0)).toEqual({ opacity: 1, rise: 0 });
    expect(spawnLook("float", 1)).toEqual({ opacity: 0, rise: 32 });
    expect(spawnLook("fade", 0.8)).toEqual({ opacity: 0.5, rise: 0 });
    expect(spawnLook("none", 0.9)).toEqual({ opacity: 1, rise: 0 });
  });
});

function doc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: "home", at: { x: 16, y: 80 }, props: { label: "Arena" } });
    tx.run(ops.addPart, { slug: "text", id: "dmg", screen: "home", at: { x: 40, y: 420 }, props: { text: "-{{event.id}}" } });
    tx.run(ops.setSpawn, { id: "dmg", spawn: { life: 1, max: 3, motion: "float", at: "event.id" }, on: { part: "world", event: "hit" } });
  });
  return savedDoc(store.get());
}

describe("set_spawn", () => {
  it("makes a group a template and spawns it on the event it is given, once", () => {
    const d = doc();
    const template = d.groups.find((g) => g.items.some((it) => it.id === "dmg"))!;
    expect(template.spawn).toEqual({ life: 1, max: 3, at: "event.id", motion: "float" });
    const world = d.groups.flatMap((g) => g.items).find((it) => it.id === "world")!;
    expect(world.actions?.["on:hit"]?.effects).toEqual([{ do: "spawn", group: template.id }]);
  });

  it("refuses an event the part does not send and a motion there is none of", () => {
    const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    store.load(doc(), true);
    expect(() => store.transact("x", "mcp", (tx) => tx.run(ops.setSpawn, { id: "dmg", spawn: { life: 1 }, on: { part: "world", event: "damaged" } }))).toThrow(/sends/);
    expect(() => store.transact("x", "mcp", (tx) => tx.run(ops.setSpawn, { id: "dmg", spawn: { motion: "spin" as never } }))).toThrow(/motion/);
    /* an effect naming no template is refused where an action is set */
    expect(() => store.transact("x", "mcp", (tx) => tx.run(ops.setAction, { id: "world", slot: "on:collected", action: { to: "none", effects: [{ do: "spawn", group: "nowhere" }] } }))).toThrow(/no group/);
  });

  it("survives the file: a template and its spawn are read back as they were, out-of-bounds numbers kept to their bounds", () => {
    const d = doc();
    const reopened = (x: Doc) => openProject(JSON.parse(JSON.stringify(projectFile(x))))!;
    const template = reopened(d).groups.find((g) => g.spawn)!;
    expect(template.spawn).toEqual({ life: 1, max: 3, at: "event.id", motion: "float" });
    const wild = reopened({ ...d, groups: d.groups.map((g) => (g.spawn ? { ...g, spawn: { life: 500, max: 99, extra: 1 } as never, spawnSlot: { of: "x", slot: 2 } } : g)) });
    expect(wild.groups.find((g) => g.spawn)?.spawn).toEqual({ life: 60, max: 50, extra: 1 });
    expect(wild.groups.some((g) => g.spawnSlot)).toBe(false);
  });
});

describe("a template laid out as its pool", () => {
  it("marks its words, and copies it max times where it stands, the copies being no templates", () => {
    const d = doc();
    const marked = markTemplates(d.groups, {});
    const pooled = poolCopies(marked, {});
    const copies = pooled.groups.filter((g) => g.spawnSlot);
    expect(copies.map((g) => g.spawnSlot!.slot)).toEqual([0, 1, 2]);
    expect(copies.filter((g) => g.spawn).length).toBe(1);
    const t = copies[0];
    expect(copies.every((g) => g.x === t.x && g.y === t.y)).toBe(true);
    expect(copies.map((g) => g.items[0].props?.text)).toEqual(["-⟦event.id⟧", "-⟦event.id⟧", "-⟦event.id⟧"]);
  });
});

/* ---------- the page's nodes, driven frame by frame (a small stand-in for the DOM: elements, text, a tree walker) ---------- */

class Txt {
  constructor(public nodeValue: string) {}
}
class El {
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  constructor(
    public kids: (El | Txt)[] = [],
    public ownerDocument: unknown = FAKE_DOC,
  ) {}
  getAttribute = (k: string) => this.attrs.get(k) ?? null;
  setAttribute = (k: string, v: string) => void this.attrs.set(k, v);
  removeAttribute = (k: string) => void this.attrs.delete(k);
  hasAttribute = (k: string) => this.attrs.has(k);
  querySelectorAll(sel: string): El[] {
    const key = /^\[([\w-]+)\]$/.exec(sel)![1];
    const out: El[] = [];
    const walk = (e: El) => e.kids.forEach((k) => k instanceof El && (k.attrs.has(key) && out.push(k), walk(k)));
    walk(this);
    return out;
  }
}
const texts = (e: El): Txt[] => e.kids.flatMap((k) => (k instanceof Txt ? [k] : texts(k)));
const FAKE_DOC = {
  createTreeWalker(root: El) {
    const list = texts(root);
    let i = 0;
    return { nextNode: () => list[i++] ?? null };
  },
};

describe("the page's copies of a template, driven on the app's clock", () => {
  it("shows, fills and moves each instance in its copy, hides it when its life is over, and stops when none is alive", async () => {
    const slot = (n: number) => {
      const e = new El([new El([new Txt("-⟦event.amount⟧")])]);
      e.attrs.set("data-spawn-of", "t");
      e.attrs.set("data-spawn-slot", String(n));
      e.style.visibility = "hidden";
      return e;
    };
    const root = new El([slot(0), slot(1)]);
    const spawns = createSpawns();
    let now = 0;
    const frames: (() => void)[] = [];
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (f: () => void) => frames.push(f);
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
    const tick = () => frames.splice(0).forEach((f) => f());
    try {
      const stop = driveSpawns(() => root as unknown as ParentNode, spawns, { now: () => now, motion: () => "float" });
      tick();
      spawns.spawn("t", { life: 1, max: 2 }, { event: { amount: 7 } }, now);
      tick();
      const [a, b] = root.kids as El[];
      expect(a.style.visibility).toBe("visible");
      expect(texts(a)[0].nodeValue).toBe("-7");
      expect(b.style.visibility).toBe("hidden");
      now = 500;
      tick();
      expect(a.style.translate).toBe("0px -16px");
      /* the next instance takes the free copy; the words of the first stay its own */
      spawns.spawn("t", { life: 1, max: 2 }, { event: { amount: 9 } }, now);
      tick();
      expect([texts(a)[0].nodeValue, texts(b)[0].nodeValue]).toEqual(["-7", "-9"]);
      now = 1600;
      tick();
      expect([a.style.visibility, b.style.visibility]).toEqual(["hidden", "hidden"]);
      /* none alive: no frame is asked for */
      expect(frames.length).toBe(0);
      /* a copy taken again is filled from its words as drawn, not from the last instance's */
      spawns.spawn("t", { life: 1, max: 2 }, { event: { amount: 3 } }, now);
      tick();
      expect(texts(a)[0].nodeValue).toBe("-3");
      stop();
    } finally {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    }
  });
});

/** a group, for the type checker */
export type { Group };
