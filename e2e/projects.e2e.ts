/* Projects: the earlier version's single document moved in as the first project with nothing lost; projects made,
 * switched, renamed, deleted and taken back, and still there after a reload; two tabs on one project and on two;
 * a project saved to a file (the browser's own private file system stands in for the picker) and kept up to date,
 * reconnected after a reload, opened back as a project, and not written over when the file changed elsewhere. */

import { check, clickAdd, equal, projectId, ready, savedDoc, settle, type Doc, type E2ETest, type Page } from "./lib";

const pill = (page: Page) => page.locator("[data-project-pill]").first();
const projectName = async (page: Page) => (await page.locator("[data-project-name]").first().textContent())?.trim();

async function openHome(page: Page) {
  await pill(page).locator("button").first().click();
  await page.waitForSelector("[data-projects-home] [data-project-card]", { timeout: 10_000 });
  await settle(page, 500);
}

async function projectMenu(page: Page, item: string) {
  await page.locator('button[title="Project"]').first().click();
  await settle(page, 250);
  await page.locator('[role="menuitem"]').filter({ hasText: item }).first().click();
}

/** waits for the tab to be on another project, and for that project's editor to be up */
async function arrived(page: Page, from: string | null) {
  await page.waitForURL((u) => !!u.searchParams.get("project") && u.searchParams.get("project") !== from, { timeout: 30_000 });
  await ready(page);
}

const card = (page: Page, id: string) => page.locator(`[data-project-card="${id}"]`).first();
async function cardAction(page: Page, id: string, action: string) {
  await card(page, id).locator('button[title="More actions"]').click();
  await settle(page, 250);
  await page.locator('[data-projects-home] [role="menuitem"]').filter({ hasText: action }).first().click();
  await settle(page, 400);
}
const cardIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[data-project-card]")].map((e) => e.getAttribute("data-project-card")));

/** the private file system's file, as text */
const fileText = (page: Page, name: string) => page.evaluate(async (n) => (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text(), name);

/** The pickers answer with a file of the browser's private file system. The handle stands in for one: headless
 *  Chromium crashes reading a private-file-system handle back from IndexedDB after a reload, so the editor is given a
 *  handle of plain data (which it keeps in IndexedDB like any other) whose methods reach the real file, put back on it
 *  whenever IndexedDB hands it out. Permission is granted, unless `e2e:ask` says the browser asks again after a reload
 *  (as it does), and then until the person allows it for the session. */
async function stubPickers(page: Page, file: string) {
  await page.context().addInitScript((name: string) => {
    class Handle {
      kind = "file";
      constructor(
        public name: string,
        public opfs = name,
      ) {}
      async real() {
        return (await navigator.storage.getDirectory()).getFileHandle(this.opfs, { create: true });
      }
      async getFile() {
        return (await this.real()).getFile();
      }
      async createWritable() {
        return (await this.real()).createWritable();
      }
      async queryPermission() {
        return sessionStorage.getItem("e2e:ask") && !sessionStorage.getItem("e2e:allowed") ? "prompt" : "granted";
      }
      async requestPermission() {
        sessionStorage.setItem("e2e:allowed", "1");
        return "granted";
      }
    }
    const revive = (v: unknown) => {
      const h = (v as { handle?: { opfs?: string } } | null)?.handle;
      if (h && typeof h === "object" && typeof h.opfs === "string") Object.setPrototypeOf(h, Handle.prototype);
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore["get"]>) {
      const r = get.apply(this, a);
      r.addEventListener("success", () => revive(r.result));
      return r;
    };
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = async () => new Handle(name);
    w.showOpenFilePicker = async () => [new Handle(name)];
  }, file);
}

export const tests: E2ETest[] = [
  {
    name: "projects: the earlier version's document becomes the first project, nothing lost",
    async run({ page, base }) {
      const legacy = {
        groups: [
          { id: "g1", x: 40, y: 80, axis: "y", items: [{ id: "b1", kind: "component", component: "button", label: "Button", icon: null, variant: "filled", props: { label: "Kept button" } }] },
          { id: "g2", x: 40, y: 160, axis: "y", items: [{ id: "img1", kind: "component", component: "image", label: "Image", icon: null, variant: "filled", props: { src: "m3e-asset:legacy-1" } }] },
        ],
        frames: [{ id: "f1", name: "Old home", x: 0, y: 0 }],
        title: "Legacy mail",
        paletteKey: "green",
        frame: "phone",
        brief: "",
      };
      const before = { ...legacy, title: "Before the draft", groups: [legacy.groups[0]] };
      const picture = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').toString("base64");
      /* a browser as the earlier version left it: no projects, the document in localStorage, its picture in m3e-assets */
      await page.goto(base + "/gallery", { waitUntil: "load" });
      await page.evaluate(
        async ({ doc, before, picture }) => {
          await new Promise((ok) => {
            const r = indexedDB.deleteDatabase("m3e-projects");
            r.onsuccess = r.onerror = r.onblocked = () => ok(null);
          });
          localStorage.removeItem("m3e:project:last");
          localStorage.setItem("m3e:doc", JSON.stringify(doc));
          localStorage.setItem("m3e:doc:before", JSON.stringify(before));
          const db = await new Promise<IDBDatabase>((ok) => {
            const r = indexedDB.open("m3e-assets", 1);
            r.onupgradeneeded = () => r.result.createObjectStore("assets");
            r.onsuccess = () => ok(r.result);
          });
          await new Promise((ok) => {
            const tx = db.transaction("assets", "readwrite");
            tx.objectStore("assets").put(picture, "m3e-asset:legacy-1");
            tx.oncomplete = () => ok(null);
          });
          db.close();
        },
        { doc: legacy, before, picture },
      );
      await page.goto(base + "/", { waitUntil: "load" });
      await ready(page);
      const id = await projectId(page);
      check(id, "the tab names its project in its address");
      equal(await projectName(page), "Legacy mail", "the project is named after the document");
      check((await page.title()).startsWith("Legacy mail"), "the page title names the project");
      const doc = await savedDoc(page);
      equal(doc.title, "Legacy mail", "the document's title");
      equal(doc.frames.map((f) => f.name), ["Old home"], "its screen");
      equal(doc.groups.map((g) => g.id), ["g1", "g2"], "its parts");
      check((await page.locator('[data-node="b1"]').first().textContent())?.includes("Kept button"), "the button drawn");
      equal(await page.locator('[data-node="img1"] img[data-slot="image"]').first().getAttribute("src"), picture, "the picture came back from where the earlier version kept it");
      /* the design a draft replaced still waits for a verdict */
      check(await page.locator('button[title="Keep this design"]').first().isVisible(), "the kept design is offered back");
      /* nothing of the earlier copy is removed */
      check(await page.evaluate(() => !!localStorage.getItem("m3e:doc")), "the earlier copy stays");

      /* a reload opens the same project, moved in once */
      await page.reload({ waitUntil: "load" });
      await ready(page);
      equal(await projectId(page), id, "the same project after a reload");
      await openHome(page);
      equal(await cardIds(page), [id], "one project, moved in once");
    },
  },
  {
    name: "projects: made, switched, renamed, deleted and taken back, kept over a reload",
    async run({ page }) {
      const a = await projectId(page);
      check(a, "the first project");
      await clickAdd(page, "Chip");
      const docA = await savedDoc(page);

      /* a new project from the home: the tab goes to it, starting from the starter sketch */
      await openHome(page);
      await page.locator("[data-new-project]").click();
      await arrived(page, a);
      const b = (await projectId(page))!;
      check(b !== a, "a new project");
      equal(await projectName(page), "Untitled 2", "named so as not to take the first one's name");
      await clickAdd(page, "Switch");
      const docB = await savedDoc(page);
      check(docB.groups.some((g) => g.items.some((it) => it.component === "switch")), "the switch is in the new project");
      check(!docB.groups.some((g) => g.items.some((it) => it.component === "chip")), "the chip is not");

      /* renamed from the home, and opened */
      await openHome(page);
      equal((await cardIds(page)).sort(), [a, b].sort(), "both projects listed");
      await cardAction(page, a!, "Rename");
      await page.locator("[data-rename-input]").fill("Alpha");
      await page.keyboard.press("Enter");
      await settle(page, 500);
      equal(await card(page, a!).locator("[data-project-title]").textContent(), "Alpha", "the new name");
      /* this tab's own project renamed: its name in the chrome follows at once */
      await cardAction(page, b, "Rename");
      await page.locator("[data-rename-input]").fill("Beta");
      await page.keyboard.press("Enter");
      await settle(page, 600);
      equal(await card(page, b).locator("[data-project-title]").textContent(), "Beta", "this tab's project renamed");
      equal(await projectName(page), "Beta", "and named so in the chrome");
      await card(page, a!).locator("a").first().click();
      await arrived(page, b);
      equal(await projectId(page), a, "back on the first project");
      equal(await projectName(page), "Alpha", "its name in the chrome");
      check((await page.title()).startsWith("Alpha"), "and in the title");
      equal(await savedDoc(page), docA, "its document as it was left");

      /* the other one deleted, taken back, deleted for good */
      await openHome(page);
      await cardAction(page, a!, "Delete");
      check(await page.locator("[data-projects-notice]").filter({ hasText: "Close the tab" }).first().isVisible(), "the open project cannot be deleted");
      await cardAction(page, b, "Delete");
      equal(await cardIds(page), [a], "deleted from the list");
      await page.locator("[data-undo-delete]").click();
      await settle(page, 500);
      equal((await cardIds(page)).sort(), [a, b].sort(), "taken back");
      await cardAction(page, b, "Delete");
      equal(await cardIds(page), [a], "deleted again");
      /* leaving the home lets it go for good */
      await page.keyboard.press("Escape");
      await settle(page, 800);

      await page.reload({ waitUntil: "load" });
      await ready(page);
      equal(await projectId(page), a, "the reload keeps the project");
      await openHome(page);
      equal(await cardIds(page), [a], "and the list");
      equal(await card(page, a!).locator("[data-project-title]").textContent(), "Alpha", "and the name");
    },
  },
  {
    name: "projects: two tabs on one project, one edits; two tabs on two projects, both edit",
    async run({ page, base }) {
      const a = await projectId(page);
      const second = await page.context().newPage();
      await second.goto(`${base}/?project=${a}`, { waitUntil: "load" });
      await second.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await second.waitForSelector("#edit-access-title", { timeout: 15_000 });
      check(await second.locator("#edit-access-title").isVisible(), "the second tab on the same project is read-only");
      /* from there, another project */
      await second.locator('[role="dialog"] button').filter({ hasText: "All projects" }).first().click();
      await second.waitForSelector("[data-projects-home] [data-project-card]");
      await settle(second, 400);
      check(await second.locator(`[data-project-card="${a}"]`).filter({ hasText: "This tab" }).count(), "the project is this tab's");
      await second.locator("[data-new-project]").click();
      await arrived(second, a);
      check(!(await second.locator("#edit-access-title").count()), "the second tab edits its own project");
      await clickAdd(second, "Chip");
      check((await savedDoc(second)).groups.some((g) => g.items.some((it) => it.component === "chip")), "the second tab's change is kept");
      await clickAdd(page, "Switch");
      check((await savedDoc(page)).groups.some((g) => g.items.some((it) => it.component === "switch")), "and the first tab's");
      check(!(await savedDoc(page)).groups.some((g) => g.items.some((it) => it.component === "chip")), "each in its own project");
      /* the first tab's home says the other project is open elsewhere */
      await openHome(page);
      const other = await projectId(second);
      check(await page.locator(`[data-project-card="${other}"]`).filter({ hasText: "Open in another tab" }).count(), "the other tab's project is marked");
      await second.close();
    },
  },
  {
    name: "projects: saved to a file, kept up to date, reconnected after a reload, opened back the same",
    async run({ page }) {
      await stubPickers(page, "shop.json");
      await page.reload({ waitUntil: "load" });
      await ready(page);
      await projectMenu(page, "Save to file");
      await page.waitForSelector('[data-project-pill][data-file-status="saved"]', { timeout: 10_000 });
      let text = await fileText(page, "shop.json");
      check(text.startsWith('{\n  "format": "m3e-project",\n  "version": 2,\n  "document": {\n'), "the project file's envelope, two spaces in");
      const doc = await savedDoc(page);
      const file = JSON.parse(text) as { document: Doc };
      equal(file.document, doc, "the file holds the document");
      const lines = text.split("\n");
      for (const g of doc.groups) check(lines.some((l) => l.startsWith('      {"axis"') && l.includes(`"id":"${g.id}"`) && (l.endsWith("}") || l.endsWith("},"))), `part ${g.id} on a line of its own`);

      /* a change reaches the file a moment later */
      await clickAdd(page, "Switch");
      await settle(page, 2000);
      text = await fileText(page, "shop.json");
      const switchId = (await savedDoc(page)).groups.flatMap((g) => g.items).find((it) => it.component === "switch")!.id;
      check(text.includes(`"id":"${switchId}"`), "the new part in the file");

      /* after a reload the browser asks again: nothing is written until the person reconnects */
      await page.evaluate(() => sessionStorage.setItem("e2e:ask", "1"));
      await page.reload({ waitUntil: "load" });
      await ready(page);
      await page.waitForSelector("[data-file-reconnect]", { timeout: 10_000 });
      const kept = await fileText(page, "shop.json");
      await clickAdd(page, "Chip");
      await settle(page, 1500);
      equal(await fileText(page, "shop.json"), kept, "nothing written before reconnecting");
      await page.locator("[data-file-reconnect]").click();
      await page.waitForSelector('[data-project-pill][data-file-status="saved"]', { timeout: 10_000 });
      text = await fileText(page, "shop.json");
      equal((JSON.parse(text) as { document: Doc }).document, await savedDoc(page), "the file caught up once reconnected");

      /* opened back as a project of its own, kept in sync: what it writes is what it read, byte for byte */
      const from = await projectId(page);
      await projectMenu(page, "Open file");
      await page.waitForSelector("[data-open-new]");
      check(await page.locator("[data-keep-synced]").isVisible(), "keeping it in sync is offered");
      await page.locator("[data-open-new]").click();
      await arrived(page, from);
      check((await projectId(page)) !== from, "a project of its own");
      equal(await projectName(page), "shop", "named after the file");
      equal(await savedDoc(page), (JSON.parse(text) as { document: Doc }).document, "the file's document");
      await page.waitForSelector('[data-project-pill][data-file-status="saved"]', { timeout: 10_000 });
      await settle(page, 2500);
      equal(await fileText(page, "shop.json"), text, "the file unchanged by opening it: the same bytes written back");
    },
  },
  {
    name: "projects: a file changed elsewhere is not written over without asking",
    async run({ page }) {
      await stubPickers(page, "shared.json");
      await page.reload({ waitUntil: "load" });
      await ready(page);
      await projectMenu(page, "Save to file");
      await page.waitForSelector('[data-project-pill][data-file-status="saved"]', { timeout: 10_000 });
      /* another program writes the file */
      const theirs = JSON.parse(await fileText(page, "shared.json")) as { document: Doc };
      theirs.document.title = "Changed elsewhere";
      await page.evaluate(async (t: string) => {
        const w = await (await (await navigator.storage.getDirectory()).getFileHandle("shared.json")).createWritable();
        await w.write(t);
        await w.close();
      }, JSON.stringify(theirs, null, 2));
      await clickAdd(page, "Chip");
      await page.waitForSelector("[data-conflict-load]", { timeout: 10_000 });
      check(JSON.parse(await fileText(page, "shared.json")).document.title === "Changed elsewhere", "their version untouched");
      await page.locator("[data-conflict-load]").click();
      await settle(page, 1500);
      equal((await savedDoc(page)).title, "Changed elsewhere", "their version on the canvas");
      await page.waitForSelector('[data-project-pill][data-file-status="saved"]', { timeout: 10_000 });
    },
  },
  {
    name: "projects: a link from someone else fetches no outside picture until the author allows it, and the project remembers",
    async run({ page, base }) {
      const asked: string[] = [];
      page.on("request", (r) => {
        if (r.url().startsWith("https://outside.example/")) asked.push(r.url());
      });
      await page.route(/^https:\/\/outside\.example\//, (route) => route.fulfill({ status: 200, headers: { "content-type": "image/svg+xml" }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>' }));
      const theirs = {
        groups: [{ id: "g1", x: 40, y: 120, axis: "y", items: [{ id: "pic", kind: "component", component: "image", label: "Image", icon: null, variant: "filled", props: { src: "https://outside.example/tracker.svg" } }] }],
        frames: [{ id: "f1", name: "Shared", x: 0, y: 0 }],
        title: "Shared",
        paletteKey: "purple",
        frame: "phone",
        brief: "",
      };
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(theirs))}`, { waitUntil: "load" });
      await page.waitForSelector('[data-node="pic"]', { timeout: 30_000 });
      await page.waitForSelector("[data-outside-banner]", { timeout: 10_000 });
      await settle(page, 1500);
      equal(asked, [], "nothing fetched from the other site");
      equal(await page.locator('img[src^="https://outside.example/"]').count(), 0, "the picture is not drawn");
      check(((await page.locator("[data-outside-banner]").textContent()) ?? "").includes("Load external images"), "the banner offers to load them");

      await page.locator("[data-outside-load]").click();
      await page.waitForSelector('[data-node="pic"] img[src="https://outside.example/tracker.svg"]', { timeout: 10_000 });
      check(asked.length > 0, "fetched once allowed");
      equal(await page.locator("[data-outside-banner]").count(), 0, "the banner is gone");

      /* the project remembers: it opens with its pictures (an edit first, so the arrived design is saved) */
      await clickAdd(page, "Chip");
      await settle(page, 1500);
      await page.reload({ waitUntil: "load" });
      await ready(page);
      await page.waitForSelector('[data-node="pic"] img[src="https://outside.example/tracker.svg"]', { timeout: 10_000 });
      equal(await page.locator("[data-outside-banner]").count(), 0, "nothing to allow again");
    },
  },
  {
    name: "projects: a project read slowly shows no starter sketch and writes nothing over it",
    async run({ page }) {
      await clickAdd(page, "Rating");
      const kept = await savedDoc(page);
      const url = await page.evaluate(() => location.href);
      /* the next page waits 2.5 s for IndexedDB to answer */
      const slow = await page.context().newPage();
      await slow.context().addInitScript(() => {
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<IDBFactory["open"]>) {
          const r = open.apply(this, a);
          if (a[0] !== "m3e-projects") return r;
          let handler: ((e: Event) => void) | null = null;
          Object.defineProperty(r, "onsuccess", { configurable: true, set: (fn: (e: Event) => void) => (handler = fn), get: () => handler });
          r.addEventListener("success", (e) => setTimeout(() => handler?.call(r, e), 2500));
          return r;
        };
      }, null);
      await page.close();
      await slow.goto(url, { waitUntil: "load" });
      for (let i = 0; i < 5; i++) {
        await slow.waitForTimeout(300);
        check(await slow.locator(".m3e-boot").count(), "the boot cover stays up while the project is read");
      }
      await ready(slow);
      await settle(slow, 1200);
      equal(await savedDoc(slow), kept, "the project as it was: nothing written over it while it was read");
      check((await slow.locator("[data-node]").count()) > 0, "its parts drawn");
    },
  },
];
