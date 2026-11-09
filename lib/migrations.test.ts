/* The migration framework (lib/migrations.ts) and every step in it.
 *
 * - The list of steps is well formed: one step per version, in order, ending at PROJECT_VERSION.
 * - Every step, the real ones in MIGRATIONS and the worked examples below, keeps the contract: it is pure, it keeps
 *   every field it does not know, it is idempotent (a bare document may already be of the version it brings one to),
 *   and what it gives for every real fixture is a document.
 * - Real project files written by earlier versions of the editor (lib/fixtures/history/, each made by that commit's
 *   own code from its own test fixtures) open, migrate, write back stably and behave in the preview as they did when
 *   they were written: `behaviour.json` holds what the preview's rules (lib/interact.ts) made of each of them at the
 *   version that understood them, and a step that changes what an old file does fails here.
 *
 * The worked examples are not shipped. They show the three kinds of change the first real steps will make: a field
 * renamed (and reshaped), a default given to what used to be left out, and one part split into several (what retiring
 * a whole-screen component into atoms does). */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { applyEffects, chooseBranch, goneIds, inRow, leftRow, startState } from "./interact";
import { expandDoc } from "./expand";
import { asWrittenAt4, asWrittenAt5, CONVERGE_PARTS } from "./converge";
import { BARE_VERSION, MIGRATIONS, PROJECT_VERSION, migrate, migrationProblems, versionOf, type Migration, type MigrationDoc } from "./migrations";
import { isProject, loadDocument, loadStored, newerVersionOf, PROJECT_FORMAT } from "./project";
import { serializeProject } from "./core/projectFile";
import { motionOf, triggerOf } from "./prototype";
import { screenPoses } from "./screenMotion";
import { setGlobalLang } from "./i18n";
import type { Action, ActionBody, Doc } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const HISTORY = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "history");
/** the project files earlier versions wrote, by name; the one of the old kinds (before a8b123f) is refused on purpose */
const FIXTURES = readdirSync(HISTORY)
  .filter((f) => f.endsWith(".json") && f !== "behaviour.json" && f !== "drawn.json" && f !== "trees.json")
  .sort()
  .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(HISTORY, f), "utf8")) as Record<string, unknown>] as const);
const OLD_KINDS = "2026-11-04-72e234c-scrolling";
const OPENABLE = FIXTURES.filter(([name]) => name !== OLD_KINDS);

/* ---------- the worked examples (tests only) ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Example version 3, a rename and a default: a part's `note` is now `notes`, a list (one note becomes a list of one),
 *  and a document without a `brief` says so with an empty one. A part that already has `notes` is left as it is. */
const toV3: Migration = {
  to: 3,
  name: "example: a part's note is a list of notes; the brief is always there",
  up(doc) {
    const item = (it: unknown) => {
      if (!isRecord(it) || !("note" in it) || "notes" in it) return it;
      const { note, ...rest } = it;
      return { ...rest, notes: typeof note === "string" && note ? [note] : [] };
    };
    const group = (g: unknown) => (isRecord(g) && Array.isArray(g.items) ? { ...g, items: g.items.map(item) } : g);
    return {
      ...doc,
      ...(typeof doc.brief === "string" ? {} : { brief: "" }),
      groups: list(doc.groups).map(group),
      ...(Array.isArray(doc.components) ? { components: doc.components.map((c) => (isRecord(c) ? { ...c, groups: list(c.groups).map(group) } : c)) } : {}),
    };
  },
};

/** Example version 4, a split: a retired part, `example-pair` (two lines of words in one part), becomes two `text`
 *  parts in a column, each with an id made from the old one, so a document already split is not split again and a
 *  tap that pointed at the pair points at the first line. */
const toV4: Migration = {
  to: 4,
  name: "example: the retired pair splits into two texts",
  up(doc) {
    const moved = new Map<string, string>();
    const groups = list(doc.groups).flatMap((g) => {
      if (!isRecord(g) || !Array.isArray(g.items) || g.items.length !== 1) return [g];
      const it = g.items[0];
      if (!isRecord(it) || it.component !== "example-pair") return [g];
      const props = isRecord(it.props) ? it.props : {};
      const { props: _props, component: _component, ...own } = it;
      const id = String(it.id);
      moved.set(id, `${id}-1`);
      const line = (n: 1 | 2, words: unknown) => ({ ...own, id: `${id}-${n}`, component: "text", props: { text: typeof words === "string" ? words : "" } });
      return [{ ...g, axis: "y", items: [line(1, props.first), line(2, props.second)] }];
    });
    if (!moved.size) return doc;
    /* what pointed at the pair points at its first line */
    const retarget = (v: unknown): unknown => (Array.isArray(v) ? v.map(retarget) : isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === "part" || k === "filled" || k === "scrollTo") && typeof x === "string" ? (moved.get(x) ?? x) : retarget(x)])) : v);
    return { ...doc, groups: groups.map(retarget) };
  },
};

const EXAMPLES: readonly Migration[] = [toV3, toV4];

/* ---------- the contract every step keeps ---------- */

/** a deep copy frozen all the way down: a step that changes what it is given throws */
function frozen<T>(v: T): T {
  const copy = structuredClone(v);
  const freeze = (x: unknown) => {
    if (x && typeof x === "object") {
      Object.freeze(x);
      for (const y of Object.values(x)) freeze(y);
    }
  };
  freeze(copy);
  return copy;
}

/** the document with a field of a newer version's own at the document, a screen, a group and a part */
function withFuture(doc: MigrationDoc): MigrationDoc {
  const g = list(doc.groups)[0] as Record<string, unknown> | undefined;
  return {
    ...doc,
    "x-future-doc": { kept: true },
    frames: list(doc.frames).map((f) => (isRecord(f) ? { ...f, "x-future-frame": 1 } : f)),
    groups: g ? [{ ...g, "x-future-group": [1], items: list(g.items).map((it) => (isRecord(it) ? { ...it, "x-future-item": "x" } : it)) }, ...list(doc.groups).slice(1)] : list(doc.groups),
  };
}

/** a document of `version`, from a fixture: brought there by the steps before it */
const documentAt = (raw: MigrationDoc, version: number, steps: readonly Migration[]) => migrate(raw, BARE_VERSION, { steps, target: version - 1 }).doc;

function contract(steps: readonly Migration[], label: string) {
  describe(label, () => {
    if (!steps.length) it("has none yet: the format is still the bare version's", () => expect(PROJECT_VERSION).toBe(BARE_VERSION));
    for (const step of steps) {
      describe(`to ${step.to}: ${step.name}`, () => {
        const inputs = OPENABLE.map(([name, file]) => [name, documentAt(file.document as MigrationDoc, step.to, steps)] as const);

        it.each(inputs)("leaves what it is given untouched: %s", (_, doc) => {
          const input = frozen(doc);
          expect(() => step.up(input)).not.toThrow();
          expect(input).toEqual(doc);
        });

        it.each(inputs)("is idempotent, so a bare document already of its version comes back as it was: %s", (_, doc) => {
          const once = step.up(doc);
          expect(step.up(once)).toEqual(once);
        });

        it.each(inputs)("keeps every field it does not know: %s", (_, doc) => {
          const out = step.up(withFuture(doc));
          expect(out["x-future-doc"]).toEqual({ kept: true });
          expect(list(out.frames).every((f) => isRecord(f) && f["x-future-frame"] === 1)).toBe(true);
          const g = list(out.groups).find((x) => isRecord(x) && "x-future-group" in x) as Record<string, unknown> | undefined;
          expect(g?.["x-future-group"]).toEqual([1]);
          expect(list(g?.items).every((it) => isRecord(it) && it["x-future-item"] === "x")).toBe(true);
        });

        it.each(inputs)("gives a document: %s", (_, doc) => {
          expect(isProject(step.up(doc))).toBe(true);
        });
      });
    }
  });
}

/* ---------- the list ---------- */

describe("the list of steps", () => {
  it("runs from the bare version up to this one, one step a version, in order", () => {
    expect(migrationProblems(MIGRATIONS)).toEqual([]);
    expect(MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].to : BARE_VERSION).toBe(PROJECT_VERSION);
    expect(new Set(MIGRATIONS.map((m) => m.name)).size).toBe(MIGRATIONS.length);
  });

  it("says what is wrong with one that skips, repeats, runs out of order or ends elsewhere", () => {
    expect(migrationProblems(EXAMPLES, 4)).toEqual([]);
    expect(migrationProblems([toV4], 4)[0]).toContain("goes to 4, but the step in that place goes to 3");
    expect(migrationProblems([toV3, toV3], 4).length).toBeGreaterThan(0);
    expect(migrationProblems([toV4, toV3], 4).length).toBeGreaterThan(0);
    expect(migrationProblems(EXAMPLES, 5)).toEqual(["the steps end at version 4, but the format is version 5"]);
    expect(migrationProblems([{ ...toV3, name: " " }], 3)).toEqual(["step 0 has no name"]);
    expect(migrationProblems([], 2)).toEqual([]);
  });

  it("runs the steps after the version a document was written at, and none on one of a later version", () => {
    const doc = { groups: [], frames: [] };
    expect(migrate(doc, 2, { steps: EXAMPLES, target: 4 }).ran).toEqual([toV3.name, toV4.name]);
    expect(migrate(doc, 0, { steps: EXAMPLES, target: 4 }).ran).toEqual([toV3.name, toV4.name]);
    expect(migrate(doc, 3, { steps: EXAMPLES, target: 4 }).ran).toEqual([toV4.name]);
    expect(migrate(doc, 2, { steps: EXAMPLES, target: 3 }).ran).toEqual([toV3.name]);
    const later = migrate(doc, 5, { steps: EXAMPLES, target: 4 });
    expect(later.ran).toEqual([]);
    expect(later.doc).toBe(doc);
    expect(later.to).toBe(5);
  });

  it("reads an envelope's version as it always was: a number, else none", () => {
    expect(versionOf({ version: 2 })).toBe(2);
    expect(versionOf({ version: "2" })).toBe(0);
    expect(versionOf({})).toBe(0);
  });
});

contract(MIGRATIONS, "every step of the format");
/* version 3 is three changes in one step (lib/converge.ts); each keeps the contract on its own as well */
for (const part of CONVERGE_PARTS) contract([{ to: 3, name: `version 3's ${part.name}, on its own`, up: part.up }], `version 3's ${part.name}`);
contract(EXAMPLES, "the worked examples keep the same contract");

/* ---------- the worked examples, each on its own ---------- */

describe("the worked examples", () => {
  const base = (): MigrationDoc => ({
    title: "T",
    frames: [{ id: "f", name: "F", x: 0, y: 0 }],
    groups: [
      { id: "g1", x: 0, y: 0, axis: "x", items: [{ id: "p", kind: "component", component: "example-pair", label: "", icon: null, variant: "filled", props: { first: "One", second: "Two" }, note: "a pair", "x-mine": 1 }] },
      { id: "g2", x: 0, y: 100, axis: "x", items: [{ id: "b", kind: "component", component: "button", label: "", icon: null, variant: "filled", note: "", action: { to: "none", effects: [{ do: "hide", part: "p" }], when: { filled: "p" } } }] },
    ],
  });

  it("renames a field and reshapes it, and gives a default to what was left out", () => {
    const out = toV3.up(base());
    expect(out.brief).toBe("");
    const [pair, button] = list(out.groups).map((g) => (g as { items: Record<string, unknown>[] }).items[0]);
    expect(pair.notes).toEqual(["a pair"]);
    expect(pair).not.toHaveProperty("note");
    expect(button.notes).toEqual([]);
    expect(toV3.up({ ...base(), brief: "kept" }).brief).toBe("kept");
  });

  it("splits one part into several, and points what pointed at it to the first", () => {
    const out = toV4.up(toV3.up(base()));
    const groups = list(out.groups) as { id: string; axis: string; items: Record<string, unknown>[] }[];
    expect(groups[0].axis).toBe("y");
    expect(groups[0].items.map((it) => [it.id, it.component, (it.props as { text: string }).text])).toEqual([
      ["p-1", "text", "One"],
      ["p-2", "text", "Two"],
    ]);
    /* what the pair had of its own goes with each line */
    expect(groups[0].items.every((it) => it["x-mine"] === 1 && JSON.stringify(it.notes) === '["a pair"]')).toBe(true);
    expect(groups[1].items[0].action).toEqual({ to: "none", effects: [{ do: "hide", part: "p-1" }], when: { filled: "p-1" } });
  });

  it("run through the one way in: a version 2 file comes out at 4, cleaned, and what 4 added is kept", () => {
    const file = { format: PROJECT_FORMAT, version: 2, document: base() };
    const loaded = loadDocument(file, { steps: EXAMPLES, target: 4 })!;
    expect(loaded.migrated).toEqual([toV3.name, toV4.name]);
    expect(loaded.version).toBe(2);
    expect(loaded.newer).toBeUndefined();
    /* `notes` is no field of this version's: the cleaning keeps it as it came */
    expect(loaded.doc.groups[0].items.map((it) => (it as unknown as { notes: string[] }).notes)).toEqual([["a pair"], ["a pair"]]);
    /* a bare document of version 4 read as the bare version: the steps find nothing to do */
    const bare = loadDocument(loaded.doc, { steps: EXAMPLES, target: 4 })!;
    expect(serializeProject(bare.doc).text).toBe(serializeProject(loaded.doc).text);
  });
});

/* ---------- documents written by earlier versions ---------- */

/** The poses the preview plays for a tap's move to a screen, forwards and back, eased and on springs
 *  (lib/screenMotion.ts): its motion, the default slide where it gives none. Recorded by version 3, where the move was
 *  its `transition` unless it had a motion; version 4 says it by the motion alone. */
const playedMoves = (body: ActionBody) => [false, true].flatMap((backwards) => [false, true].map((spring) => screenPoses({ motion: motionOf(body), backwards, spring })));

/** What a document does in the preview, by the preview's own rules (lib/interact.ts): what shows at the start, and for
 *  every tap (a part's and each of its places') where it goes and how, and what its effects leave behind. */
function behaviour(source: Doc, version = 4) {
  /* what taps set, under the names of the version that wrote the file (versions 5 and 6 renamed some, lib/converge.ts) */
  const asBefore = version <= 4 ? asWrittenAt4 : asWrittenAt5;
  /* as the preview draws it: instances and repeats drawn out, a tap on a row's part made in its row */
  const doc = expandDoc(source, {});
  const s0 = startState(doc.vars, doc.collections);
  const gone = (s: typeof s0) => [...goneIds(doc.groups, s, doc, {})].sort();
  const slugs = new Map([...doc.groups, ...(doc.components ?? []).flatMap((c) => c.groups)].flatMap((g) => g.items.map((it) => [it.id, it.component] as const)));
  const taps: Record<string, unknown> = {};
  for (const g of [...doc.groups, ...(doc.components ?? []).flatMap((c) => c.groups)])
    for (const it of g.items) {
      const slots: [string, Action | undefined][] = [["tap", it.action], ...Object.entries(it.actions ?? {})];
      for (const [slot, a] of slots) {
        if (!a) continue;
        const sIn = inRow(s0, it.row);
        const body = chooseBranch(a, sIn, doc, it);
        const s1 = leftRow(body ? applyEffects(sIn, body.effects, doc, { it }) : sIn, it.row);
        taps[`${it.id}/${slot}`] = {
          to: body?.to ?? null,
          /* what plays as the screen comes in and as it goes back, in either motion scheme */
          moves: body && doc.frames.some((f) => f.id === body.to) ? JSON.stringify(playedMoves(body)) : null,
          trigger: triggerOf(a),
          overlay: !!body?.overlay,
          scrollTo: body?.scrollTo ?? null,
          params: body?.params ?? null,
          vars: s1.vars,
          hidden: s1.hidden,
          props: Object.fromEntries(Object.entries(s1.props).map(([id, set]) => [id, asBefore(slugs.get(id), set)])),
          opened: s1.opened,
          snack: s1.snack?.message ?? null,
          gone: gone(s1),
        };
      }
    }
  return { screens: doc.frames.map((f) => f.id), vars: s0.vars, gone: gone(s0), taps };
}

/* What the preview made of each, written when the files came in by `UPDATE_HISTORY=1 bunx vitest run lib/migrations.test.ts`;
   it is the version that wrote them that says what they do, so a later step must not change it. */
if (process.env.UPDATE_HISTORY) writeFileSync(join(HISTORY, "behaviour.json"), JSON.stringify(Object.fromEntries(OPENABLE.map(([name, file]) => [name, behaviour(loadDocument(file)!.doc)])), null, 1) + "\n");
const GOLDEN = JSON.parse(readFileSync(join(HISTORY, "behaviour.json"), "utf8")) as Record<string, unknown>;

describe("project files written by earlier versions", () => {
  it("are all here, with what the preview made of each when it was written", () => {
    expect(OPENABLE.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(GOLDEN).sort()).toEqual(OPENABLE.map(([name]) => name));
  });

  it.each(OPENABLE)("opens, brought up to this version by every step after its own: %s", (_, file) => {
    const loaded = loadDocument(file)!;
    expect(loaded).not.toBeNull();
    expect(loaded.version).toBe(versionOf(file));
    expect(loaded.newer).toBeUndefined();
    expect(loaded.migrated).toEqual(MIGRATIONS.filter((m) => m.to > versionOf(file)).map((m) => m.name));
  });

  it.each(OPENABLE)("writes back the same bytes once it has been read: %s", (_, file) => {
    const once = serializeProject(loadDocument(file)!.doc).text;
    expect(serializeProject(loadDocument(JSON.parse(once))!.doc).text).toBe(once);
  });

  it.each(OPENABLE)("behaves in the preview as it did at the version that wrote it: %s", (name, file) => {
    expect(JSON.parse(JSON.stringify(behaviour(loadDocument(file)!.doc, versionOf(file))))).toEqual(GOLDEN[name]);
  });

  it.each(OPENABLE)("is the same document as the browser's copy, without its envelope, and as a bare document: %s", (_, file) => {
    const doc = loadDocument(file)!.doc;
    expect(loadStored(file.document, versionOf(file))).toEqual(doc);
    expect(loadDocument(file.document)!.doc).toEqual(doc);
  });

  it("a file of the kinds before components (before a8b123f) is still refused, as it has been since", () => {
    const old = FIXTURES.find(([name]) => name === OLD_KINDS)![1];
    expect(loadDocument(old)).toBeNull();
  });
});

/* ---------- a newer version's document ---------- */

describe("a document of a newer version", () => {
  const [, file] = OPENABLE[0];
  const newer = { ...file, version: PROJECT_VERSION + 1, document: { ...(file.document as object), "x-next": { a: 1 } } };

  it("opens as this version understands it, migrated by nothing, marked newer", () => {
    const loaded = loadDocument(newer)!;
    expect(loaded.newer).toBe(PROJECT_VERSION + 1);
    expect(loaded.migrated).toEqual([]);
    expect(newerVersionOf(loaded.doc)).toBe(PROJECT_VERSION + 1);
    expect((loaded.doc as unknown as Record<string, unknown>)["x-next"]).toEqual({ a: 1 });
  });

  it("is marked newer from the version a record of the browser's says, too", () => {
    expect(newerVersionOf(loadStored(newer.document, PROJECT_VERSION + 1))).toBe(PROJECT_VERSION + 1);
    expect(newerVersionOf(loadStored(newer.document))).toBeUndefined();
  });

  it("is written back, when it is copied, exactly as it came and under its own version", () => {
    const loaded = loadDocument(newer)!;
    const text = serializeProject(loaded.doc).text;
    expect(JSON.parse(text)).toEqual({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1, document: newer.document });
  });
});
