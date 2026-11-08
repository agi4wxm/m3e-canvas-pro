/* Projects in IndexedDB (fake-indexeddb): made, listed, renamed, copied, put in the bin and back, forgotten with the
 * pictures only they used; the earlier version's single document moved in once; and the editor's adapter opening the
 * project the address names, writing it, and keeping each project's pictures apart from the document. */

import "fake-indexeddb/auto";
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripAssets } from "../assets";
import { BEFORE_KEY, DOC_KEY, PersistFullError } from "../core/persist";
import type { Doc } from "../tokens";
import { getAssets, getKv, listProjects, openDb, pruneAssets, putKv, readProjectRecords, useIndexedDb } from "./db";
import { LEGACY_MARK, migrateLegacy } from "./migrate";
import { ProjectsPersist, resolveOpening, unsavedKey, type OpeningEnv } from "./persist";
import { agentConversationKey, createProject, duplicateProject, freeName, purgeProject, purgeTrashed, renameProject, restoreProject, trashProject, UNDO_DELETE_MS, visibleProjects } from "./projects";

beforeEach(() => {
  useIndexedDb(() => fresh);
  fresh = new IDBFactory();
});
let fresh = new IDBFactory();

const frame = (id: string) => ({ id, name: id, x: 0, y: 0 });
const doc = (title: string, frames = 1, extra: Partial<Doc> = {}): Doc =>
  ({ groups: [], frames: Array.from({ length: frames }, (_, i) => frame(`f${i}`)), title, paletteKey: "purple", frame: "phone", brief: "", theme: { style: "ios" }, ...extra }) as unknown as Doc;
/** a picture large enough to be kept apart from the document */
const picture = (n: number) => `data:image/png;base64,${String(n).repeat(60_000)}`;
const withPicture = (d: Doc, src: string): Doc => ({ ...d, groups: [{ id: "g", x: 0, y: 0, axis: "y", items: [{ id: "i", kind: "component", component: "image", label: "Image", icon: null, variant: "filled", props: { src } }] }] }) as Doc;

const storage = (items: Record<string, string> = {}) => ({
  items,
  getItem: (k: string) => items[k] ?? null,
  setItem: (k: string, v: string) => {
    items[k] = v;
  },
  removeItem: (k: string) => {
    delete items[k];
  },
});

/* A store that refuses to keep a document: a transaction that writes one fails with `refuse()` while it is set, after
   `onPut` (a write handed over while one is under way) has run, the way the browser refuses one (a closed connection,
   storage blocked, no room, a disk error). */
let refuse: (() => DOMException) | null = null;
let onPut: (() => void) | null = null;
const transaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...a: Parameters<IDBDatabase["transaction"]>) {
  const [stores, mode] = a;
  if (mode === "readwrite" && [stores].flat().includes("docs")) {
    const hook = onPut;
    onPut = null;
    hook?.();
    if (refuse) throw refuse();
  }
  return transaction.apply(this, a);
} as IDBDatabase["transaction"];
afterEach(() => {
  refuse = null;
  onPut = null;
  vi.unstubAllGlobals();
});
const titleKept = async (id: string) => (JSON.parse((await readProjectRecords(id)).doc ?? "null") as Doc | null)?.title;

const env = (search = "", items: Record<string, string> = {}, now = 1000): OpeningEnv & { urls: string[]; store: ReturnType<typeof storage> } => {
  const urls: string[] = [];
  const store = storage(items);
  return { location: { pathname: "/", search, hash: "" }, replaceUrl: (u) => urls.push(u), storage: store, names: { untitled: "Untitled", first: "My project" }, now: () => now, urls, store };
};

describe("projects", () => {
  it("are made, listed by recent use, searched, renamed, copied", async () => {
    const a = await createProject({ name: "Alpha", doc: doc("A", 2), now: 10 });
    const b = await createProject({ name: "Beta shop", now: 20 });
    expect(a.screens).toBe(2);
    expect(a.style).toBe("ios");
    expect(visibleProjects(await listProjects()).map((m) => m.name)).toEqual(["Beta shop", "Alpha"]);
    expect(visibleProjects(await listProjects(), { sort: "name" }).map((m) => m.name)).toEqual(["Alpha", "Beta shop"]);
    expect(visibleProjects(await listProjects(), { query: "SHOP" }).map((m) => m.id)).toEqual([b.id]);

    await renameProject(a.id, "  Alpha app ");
    expect((await listProjects()).find((m) => m.id === a.id)?.name).toBe("Alpha app");
    expect(await renameProject(a.id, "   ")).toBeUndefined();

    const copy = await duplicateProject(a.id, "Alpha app copy", 30);
    expect(copy).toMatchObject({ name: "Alpha app copy", screens: 2, created: 30 });
    expect((await readProjectRecords(copy!.id)).doc).toBe((await readProjectRecords(a.id)).doc);
    expect(freeName("Untitled", [{ name: "Untitled" }, { name: "Untitled 2" }])).toBe("Untitled 3");
  });

  it("go to the bin and come back, and are forgotten for good with the pictures only they used", async () => {
    const shared = picture(1);
    const own = picture(2);
    const a = await createProject({ name: "A", doc: withPicture(doc("A"), shared) });
    const b = await createProject({ name: "B", doc: { ...withPicture(doc("B"), shared), frames: [frame("x")], groups: [...withPicture(doc("B"), shared).groups, ...withPicture(doc("B"), own).groups.map((g) => ({ ...g, id: "g2" }))] } });
    const names = [...stripAssets(shared).found.keys(), ...stripAssets(own).found.keys()];
    expect((await getAssets(names)).size).toBe(2);

    await trashProject(b.id, 100);
    expect(visibleProjects(await listProjects()).map((m) => m.id)).toEqual([a.id]);
    await restoreProject(b.id);
    expect(visibleProjects(await listProjects())).toHaveLength(2);

    await purgeProject(b.id);
    expect((await listProjects()).map((m) => m.id)).toEqual([a.id]);
    /* the picture A still uses stays; the one only B used is gone */
    expect([...(await getAssets(names)).keys()]).toEqual([names[0]]);
  });

  it("take their agent conversation with them once their undo has passed, and only theirs", async () => {
    const a = await createProject({ name: "A" });
    const b = await createProject({ name: "B" });
    const c = await createProject({ name: "C", now: 1 });
    for (const m of [a, b, c]) await putKv(agentConversationKey(m.id), { version: 1, messages: [{ role: "user", content: m.name }], turns: [] });
    await trashProject(b.id, 100);
    /* while it can still be undone, the conversation waits with the project */
    expect(await getKv(agentConversationKey(b.id))).toBeTruthy();
    await restoreProject(b.id);
    await trashProject(b.id, 100);
    await purgeProject(b.id);
    expect(await getKv(agentConversationKey(b.id))).toBeUndefined();
    expect(await getKv(agentConversationKey(a.id))).toBeTruthy();
    /* one a closed tab left in the bin goes when a tab next clears it */
    await trashProject(c.id, 1000);
    await purgeTrashed(1000 + UNDO_DELETE_MS * 3);
    expect(await getKv(agentConversationKey(c.id))).toBeUndefined();
    expect(await getKv(agentConversationKey(a.id))).toBeTruthy();
  });

  it("left in the bin by a tab that closed are forgotten when a tab next opens", async () => {
    const a = await createProject({ name: "A", now: 1 });
    await trashProject(a.id, 1000);
    await purgeTrashed(1000 + UNDO_DELETE_MS);
    expect(await listProjects()).toHaveLength(1);
    await purgeTrashed(1000 + UNDO_DELETE_MS * 3);
    expect(await listProjects()).toHaveLength(0);
  });
});

describe("the earlier version's document", () => {
  const legacyDoc = withPicture(doc("Mail", 3), "m3e-asset:abc-123");
  const raw = JSON.stringify(legacyDoc);

  it("becomes the first project, exactly as it was written, with its kept design and its pictures", async () => {
    const before = doc("Before", 1);
    const items = { [DOC_KEY]: raw, [BEFORE_KEY]: JSON.stringify(before) };
    const id = await migrateLegacy({ storage: storage(items), fallbackName: "My project", now: 5, id: "p1", legacyAssets: async (names) => new Map([...names].map((n) => [n, "data:image/png;base64,AAAA"])) });
    expect(id).toBe("p1");
    const rec = await readProjectRecords("p1");
    expect(rec.doc).toBe(raw);
    expect(JSON.parse(rec.before!)).toEqual(before);
    expect(rec.meta).toMatchObject({ name: "Mail", screens: 3, style: "ios", created: 5 });
    expect((await getAssets(["m3e-asset:abc-123"])).get("m3e-asset:abc-123")).toBe("data:image/png;base64,AAAA");
    /* nothing of it is removed */
    expect(items[DOC_KEY]).toBe(raw);
  });

  it("is moved in once, even when two tabs start together", async () => {
    const items = { [DOC_KEY]: raw };
    const [one, two] = await Promise.all([migrateLegacy({ storage: storage(items), fallbackName: "x", id: "a", legacyAssets: async () => new Map() }), migrateLegacy({ storage: storage(items), fallbackName: "x", id: "b", legacyAssets: async () => new Map() })]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(await listProjects()).toHaveLength(1);
    expect(await migrateLegacy({ storage: storage(items), fallbackName: "x", id: "c" })).toBeNull();
  });

  it("is noted as absent when there was none, so nothing is moved in later", async () => {
    expect(await migrateLegacy({ storage: storage(), fallbackName: "x" })).toBeNull();
    expect(await getKv(LEGACY_MARK)).toMatchObject({ project: null });
    expect(await migrateLegacy({ storage: storage({ [DOC_KEY]: raw }), fallbackName: "x" })).toBeNull();
  });

  it("takes the fallback name when it has no title, and passes over a kept design that is not a document", async () => {
    await migrateLegacy({ storage: storage({ [DOC_KEY]: JSON.stringify(doc("")), [BEFORE_KEY]: "{oops" }), fallbackName: "My project", id: "p" });
    const rec = await readProjectRecords("p");
    expect(rec.meta?.name).toBe("My project");
    expect(rec.before).toBeNull();
  });
});

describe("opening a tab", () => {
  it("moves the earlier document in on the first run, opens it, and names it in the address", async () => {
    const e = env("", { [DOC_KEY]: JSON.stringify(doc("Mail", 2)) });
    const o = await resolveOpening(e);
    expect(o.mode).toBe("projects");
    if (o.mode !== "projects") return;
    expect(o.meta.name).toBe("Mail");
    expect((o.stored.doc as Doc).title).toBe("Mail");
    expect(e.urls).toEqual([`/?project=${o.id}`]);
    expect(e.store.items["m3e:project:last"]).toBe(o.id);
  });

  it("makes a project when there is none, opens the one the address names, else the one last in use", async () => {
    const first = await resolveOpening(env());
    expect(first.mode === "projects" && first.meta.name).toBe("Untitled");
    const other = await createProject({ name: "Other", doc: doc("Other"), now: 5000 });
    const named = await resolveOpening(env(`?project=${first.mode === "projects" ? first.id : ""}`, {}, 9000));
    expect(named.mode === "projects" && named.id).toBe(first.mode === "projects" && first.id);
    /* the first was opened last (at 9000): it is the most recent */
    const recent = await resolveOpening(env("", {}, 9500));
    expect(recent.mode === "projects" && recent.id).toBe(first.mode === "projects" && first.id);
    const gone = await resolveOpening(env("?project=nope&x=1", {}, 9600));
    expect(gone.mode === "projects" && gone.missing).toBe("nope");
    expect(other.id).toBeTruthy();
  });

  it("falls back to the earlier way when IndexedDB cannot be opened", async () => {
    useIndexedDb(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const o = await resolveOpening(env());
    expect(o.mode).toBe("legacy");
  });
});

describe("the editor's adapter", () => {
  it("reads the project whole, pictures and all, and writes it with them kept apart", async () => {
    const pic = picture(7);
    await createProject({ id: "p", name: "P", doc: withPicture(doc("P"), pic), now: 1 });
    const persist = new ProjectsPersist(resolveOpening(env("?project=p", {}, 2)));
    const stored = await persist.read();
    expect(JSON.stringify(stored.doc)).toContain(pic);
    expect(persist.id).toBe("p");

    const next = { ...withPicture(doc("P", 3), pic) };
    await persist.write(next);
    const rec = await readProjectRecords("p");
    expect(rec.doc).not.toContain(pic);
    expect(rec.doc).toContain("m3e-asset:");
    expect(rec.meta?.screens).toBe(3);
  });

  it("writes the latest of a burst once a write is in flight, and only moves the project's time on for edits", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const persist = new ProjectsPersist(resolveOpening(env("?project=p", {}, 2)));
    await persist.read();
    /* the first write only brings the document to how this version writes it */
    await persist.write(doc("P", 2));
    expect((await readProjectRecords("p")).meta?.updated).toBe(1);
    persist.markEdited();
    void persist.write(doc("P", 3));
    void persist.write(doc("P", 4));
    await persist.write(doc("P", 5));
    const rec = await readProjectRecords("p");
    expect(rec.meta?.screens).toBe(5);
    expect(rec.meta!.updated).toBeGreaterThan(1);
  });

  it("writes a document handed over just as the write before it is finishing, without another change after it", async () => {
    /* A write that changes nothing ends its drain at once; a document handed over a few ticks later, at any tick,
       must still be written by itself (a design from a link arrives right after the editor's first write). */
    for (let ticks = 0; ticks < 12; ticks++) {
      const id = `p${ticks}`;
      await createProject({ id, name: "P", doc: doc("P"), now: 1 });
      const persist = new ProjectsPersist(resolveOpening(env(`?project=${id}`, {}, 2)));
      const stored = (await persist.read()).doc as Doc;
      await persist.write(stored);
      void persist.write(stored);
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      void persist.write(doc(`Linked ${ticks}`, 2));
      await new Promise((r) => setTimeout(r, 30));
      const rec = await readProjectRecords(id);
      expect(JSON.parse(rec.doc ?? "null")?.title, `handed over ${ticks} ticks after`).toBe(`Linked ${ticks}`);
    }
  });

  it("keeps and forgets the design a draft replaced, per project", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    await createProject({ id: "q", name: "Q", doc: doc("Q"), now: 1 });
    const persist = new ProjectsPersist(resolveOpening(env("?project=p")));
    await persist.read();
    persist.writeBefore(doc("Before"));
    await persist.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse((await readProjectRecords("p")).before!).title).toBe("Before");
    expect((await readProjectRecords("q")).before).toBeNull();
    const again = new ProjectsPersist(resolveOpening(env("?project=p")));
    expect((await again.read()).before?.title).toBe("Before");
    persist.writeBefore(null);
    await new Promise((r) => setTimeout(r, 20));
    expect((await readProjectRecords("p")).before).toBeNull();
  });

  it("forgets pictures nothing refers to", async () => {
    await createProject({ id: "p", name: "P", doc: withPicture(doc("P"), picture(3)), now: 1 });
    const persist = new ProjectsPersist(resolveOpening(env("?project=p")));
    await persist.read();
    await persist.write(doc("P", 2));
    expect(await pruneAssets()).toBe(1);
  });

  it("lets the tab edit where the browser has no locks", async () => {
    const persist = new ProjectsPersist(resolveOpening(env()));
    const said = await new Promise<string>((resolve) => persist.lock(resolve));
    expect(said).toBe("editable");
  });
});

describe("a save that fails", () => {
  const opened = async (id = "p", o: { items?: Record<string, string>; retryMs?: number[] } = {}) => {
    await createProject({ id, name: "P", doc: doc("P"), now: 1 });
    const store = storage(o.items ?? {});
    const persist = new ProjectsPersist(resolveOpening(env(`?project=${id}`, store.items)), { storage: store, retryMs: o.retryMs ?? [60_000] });
    await persist.read();
    return { persist, store };
  };

  it("keeps the last edit waiting when nothing comes after it, says so, and writes it once the store takes it again", async () => {
    const { persist } = await opened();
    refuse = () => new DOMException("The disk said no.", "UnknownError");
    await expect(persist.write(doc("Last", 2))).rejects.toMatchObject({ kind: "io" });
    expect(persist.save).toMatchObject({ status: "error", handed: 1, kept: 0, writing: null, error: { kind: "io", rev: 1 } });
    expect(await titleKept("p")).toBe("P");
    /* switching projects now would be told the truth */
    const still = await persist.flush();
    expect(still.ok).toBe(false);
    expect(still.browser.status).toBe("error");

    refuse = null;
    const report = await persist.flush();
    expect(report).toMatchObject({ ok: true, browser: { status: "saved", kept: 1 } });
    expect(report.browser.error).toBeUndefined();
    expect(await titleKept("p")).toBe("Last");
  });

  it("is tried again by itself a moment later", async () => {
    const { persist } = await opened("p", { retryMs: [20] });
    refuse = () => new DOMException("busy", "UnknownError");
    await expect(persist.write(doc("Later", 2))).rejects.toBeTruthy();
    refuse = null;
    await new Promise((r) => setTimeout(r, 80));
    expect(persist.save.status).toBe("saved");
    expect(await titleKept("p")).toBe("Later");
  });

  it.each([
    ["QuotaExceededError", "quota"],
    ["InvalidStateError", "closed"],
    ["SecurityError", "permission"],
    ["UnknownError", "io"],
    ["NotReadableError", "io"],
  ])("tells a %s apart (%s)", async (name, kind) => {
    const { persist } = await opened();
    refuse = () => new DOMException("no", name);
    const err = await persist.write(doc("X", 2))!.then(() => null, (e: unknown) => e);
    expect(err).toMatchObject({ kind });
    expect(err instanceof PersistFullError).toBe(kind === "quota");
    expect(persist.save.error?.kind).toBe(kind);
    refuse = null;
    await persist.flush();
  });

  it("never lets an older version that failed take the place of a newer one handed over meanwhile", async () => {
    const { persist } = await opened();
    void persist.write(doc("Old", 2))!.catch(() => {});
    /* the newer one comes while the old one is being written, which then fails */
    let newer: Promise<void> | void;
    onPut = () => {
      newer = persist.write(doc("New", 3));
    };
    refuse = () => {
      refuse = null;
      return new DOMException("once", "UnknownError");
    };
    await new Promise((r) => setTimeout(r, 20));
    expect(newer!).toBeTruthy();
    expect(persist.save).toMatchObject({ status: "error", handed: 2, error: { rev: 1 } });
    const report = await persist.flush();
    expect(report.browser).toMatchObject({ status: "saved", kept: 2 });
    expect(await titleKept("p")).toBe("New");
    /* and no try later brings the old one back */
    await persist.retry();
    expect(await titleKept("p")).toBe("New");
  });

  it("finds its way back when the browser closed the database under the tab", async () => {
    const { persist } = await opened();
    (await openDb()).close();
    await persist.write(doc("After close", 2));
    expect(await titleKept("p")).toBe("After close");
    expect(persist.save.status).toBe("saved");
  });
});

describe("two tabs and closing", () => {
  it.each([
    ["no Web Locks", undefined],
    ["Web Locks that refuse", { request: () => Promise.reject(new DOMException("no", "SecurityError")) }],
  ])("with %s, the second tab to write finds the first one's save and turns read-only instead of writing over it", async (_, locks) => {
    vi.stubGlobal("navigator", { locks });
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const first = new ProjectsPersist(resolveOpening(env("?project=p")), { storage: null });
    const items: Record<string, string> = {};
    const secondStore = storage(items);
    const second = new ProjectsPersist(resolveOpening(env("?project=p", items)), { storage: secondStore });
    const saidFirst: string[] = [];
    const saidSecond: string[] = [];
    first.lock((s) => saidFirst.push(s));
    second.lock((s) => saidSecond.push(s));
    await first.read();
    await second.read();
    await new Promise((r) => setTimeout(r, 0));
    expect([saidFirst, saidSecond]).toEqual([["editable"], ["editable"]]);

    await first.write(doc("From the first", 2));
    await expect(second.write(doc("From the second", 3))).rejects.toMatchObject({ kind: "conflict" });
    expect(saidSecond).toEqual(["editable", "readonly"]);
    expect(second.save.status).toBe("conflict");
    expect(await titleKept("p")).toBe("From the first");
    /* the first goes on writing; the second writes nothing more */
    await first.write(doc("First again", 2));
    second.write(doc("Second again", 3));
    await second.flush();
    expect(await titleKept("p")).toBe("First again");

    /* the second tab's version is not lost: the next tab on the project offers it */
    const next = await resolveOpening(env("?project=p", items));
    expect(next.mode === "projects" && next.recovered?.doc.title).toBe("Second again");
  });

  it("writes an edit handed over just before the tab goes to another project, before saying all is kept", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const persist = new ProjectsPersist(resolveOpening(env("?project=p")), { storage: null });
    await persist.read();
    void persist.write(doc("Edited", 2));
    void persist.write(doc("Edited again", 3));
    const report = await persist.flush();
    expect(report).toMatchObject({ ok: true, file: null, browser: { status: "saved", handed: 2, kept: 2 } });
    expect(await titleKept("p")).toBe("Edited again");
  });

  it("notes the last edit at once when the page goes before it is written, and the next tab offers it back", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const items: Record<string, string> = {};
    const persist = new ProjectsPersist(resolveOpening(env("?project=p", items)), { storage: storage(items) });
    await persist.read();
    /* the write cannot land before the page is gone */
    refuse = () => new DOMException("gone", "UnknownError");
    const write = persist.write(doc("Last edit", 2))!.catch(() => {});
    persist.commitNow();
    expect(JSON.parse(items[unsavedKey("p")]).doc.title).toBe("Last edit");
    await write;
    refuse = null;

    const next = await resolveOpening(env("?project=p", items));
    expect(next.mode === "projects" && next.recovered?.doc.title).toBe("Last edit");
    const again = new ProjectsPersist(Promise.resolve(next), { storage: storage(items) });
    await again.read();
    expect(again.recovered?.doc.title).toBe("Last edit");
    again.dropRecovered();
    expect(items[unsavedKey("p")]).toBeUndefined();
    expect(again.recovered).toBeNull();
  });

  it("notes a version with a large picture by reference, leaving localStorage room for the rest", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const items: Record<string, string> = {};
    const persist = new ProjectsPersist(resolveOpening(env("?project=p", items)), { storage: storage(items) });
    await persist.read();
    refuse = () => new DOMException("gone", "UnknownError");
    await persist.write(withPicture(doc("Big"), `data:image/png;base64,${"A".repeat(2_500_000)}`))!.catch(() => {});
    refuse = null;
    const noted = items[unsavedKey("p")];
    expect(noted.length).toBeLessThan(10_000);
    expect(noted).toContain("m3e-asset:");
    expect(JSON.parse(noted).doc.title).toBe("Big");
    await persist.flush();
    expect(items[unsavedKey("p")]).toBeUndefined();
  });

  it("forgets the note once the write it was for lands, and offers nothing when what is kept is that version", async () => {
    await createProject({ id: "p", name: "P", doc: doc("P"), now: 1 });
    const items: Record<string, string> = {};
    const persist = new ProjectsPersist(resolveOpening(env("?project=p", items)), { storage: storage(items) });
    await persist.read();
    const done = persist.write(doc("Landed", 2));
    persist.commitNow();
    expect(items[unsavedKey("p")]).toBeTruthy();
    await done;
    expect(items[unsavedKey("p")]).toBeUndefined();

    /* a note left by a page that went just after its write landed */
    items[unsavedKey("p")] = JSON.stringify({ at: 5, doc: doc("Landed", 2) });
    const next = await resolveOpening(env("?project=p", items));
    expect(next.mode === "projects" && next.recovered).toBeFalsy();
    expect(items[unsavedKey("p")]).toBeUndefined();
  });
});
