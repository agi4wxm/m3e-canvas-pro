/* A game loop's fixture in the editor and its preview (docs/玩法契约.md “fixture”): the summon's and the check-in's
 * screens of the example contract, a world view on the summon's; the example fixture imported from the project menu
 * (one that does not match the contract refused with nothing kept) becomes the scene the preview starts in: the world
 * view stands in the fixture's snapshot (its entities, score and status), a summon answers what the fixture says it
 * gives, and the check-in, done already in that state, lands on its own design. Then the same fixture headless: an MCP
 * server on the project file draws the summon's screen at the fixture with the render page. Screenshots of failures
 * go to e2e/.out. */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc as docOf, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import { serializeProject } from "../lib/core/projectFile";
import type { Doc } from "../lib/tokens";
import { check, equal, savedDoc, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CONTRACT = readFileSync(new URL("../lib/game/fixtures/example.m3e-game.json", import.meta.url), "utf8");
const FIXTURE = readFileSync(new URL("../lib/game/fixtures/example.m3e-fixture.json", import.meta.url), "utf8");

/** the summon's and the check-in's screens, a world view on the summon's: built with operations, as the AI builds them */
function gameDoc(): { doc: Doc; summon: string; checkIn: string; pullOne: string; checkInButton: string } {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the game's screens", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Game" });
    tx.run(ops.importGameContract, { text: CONTRACT });
    tx.run(ops.addTemplate, { slug: "gacha-pull" });
    tx.run(ops.addTemplate, { slug: "daily-check-in" });
  });
  const made = docOf(store.get());
  const items = made.groups.flatMap((g) => g.items);
  const calling = (op: string) => items.filter((it) => it.action?.effects?.some((e) => e.do === "call" && e.operationId === op));
  const pullOne = calling("game.pull").find((it) => it.action?.effects?.some((e) => e.do === "call" && (e as { args?: { count?: string } }).args?.count === "1"))!.id;
  const checkInButton = calling("game.checkIn")[0].id;
  const screenOf = (name: string) => made.frames.find((f) => f.name === name)!.id;
  const summon = screenOf("Summon");
  store.run(ops.addPart, { slug: "world-view", id: "world", screen: summon, at: { x: 16, y: 120 }, props: { label: "Arena", width: 200, height: 120 } }, { origin: "mcp" });
  return { doc: docOf(store.get()), summon, checkIn: screenOf("Daily check-in"), pullOne, checkInButton };
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const part = (page: Page, id: string) => onShow(page).locator(`[data-part="${id}"]`).first();
const view = (page: Page) => part(page, "world").locator('[data-slot="world-view"]').first();
const snack = async (page: Page) => ((await page.locator("[data-preview-snackbar]").count()) ? ((await page.locator("[data-preview-snackbar]").first().textContent()) ?? "") : null);
async function until(what: string, ok: () => Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never: ${what}`);
}

async function importFixture(page: Page, file: string) {
  await page.locator('button[title="Project"]').first().click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[role="menuitem"]').filter({ hasText: "Import game fixture" }).first().click()]);
  await chooser.setFiles(file);
  await settle(page, 900);
}

async function preview(page: Page, screen: string) {
  await page.keyboard.press("Escape");
  await settle(page, 200);
  await selectScreen(page, screen);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
}

type Saved = { game?: { fixtures?: { fixture: { id: string } }[] }; mocks?: { scenario?: string; world?: string } };

export const tests: E2ETest[] = [
  {
    name: "game fixture: imported from the project menu, the preview starts in its state: the world view in its snapshot, the summon and the check-in answered as it says",
    async run({ page, base, out }) {
      const built = gameDoc();
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(built.doc))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector(`[data-screen="${built.summon}"]`, { timeout: 30_000 });
      await settle(page, 1500);

      /* a fixture the contract does not take: refused, nothing kept */
      const wrong = join(out, "wrong.m3e-fixture.json");
      writeFileSync(wrong, JSON.stringify({ ...JSON.parse(FIXTURE), answers: { pull: { rejection: "sold-out" } } }));
      await importFixture(page, wrong);
      check(!((await savedDoc(page)) as unknown as Saved).game?.fixtures, "a fixture that does not match the contract is not taken");

      const file = join(out, "day-12.m3e-fixture.json");
      writeFileSync(file, FIXTURE);
      await importFixture(page, file);
      const doc = (await savedDoc(page)) as unknown as Saved;
      equal(doc.game?.fixtures?.map((l) => l.fixture.id), ["day-12"], "the fixture is imported");
      equal([doc.mocks?.scenario, doc.mocks?.world], ["fixture.day-12", "fixture.day-12"], "its scene is the one the preview starts in");

      /* the world view stands in the fixture's snapshot */
      await preview(page, built.summon);
      await until("the world view plays the fixture's scene", async () => (await view(page).count()) > 0 && (await view(page).getAttribute("data-world-script")) === "fixture.day-12");
      equal(await view(page).getAttribute("data-score"), "7", "the score is the fixture's");
      equal(await view(page).getAttribute("data-status"), "paused", "the status is the fixture's");
      const ids: string[] = [];
      const entities = part(page, "world").locator("[data-entity]");
      for (let i = 0; i < (await entities.count()); i++) ids.push((await entities.nth(i).getAttribute("data-entity")) ?? "");
      equal(ids.sort(), ["coin2", "hero", "slime"], "its entities are the fixture's: one coin left");
      await page.screenshot({ path: join(out, "fixture-summon.png") });
      /* the summon answers what the fixture says it gives */
      await part(page, built.pullOne).locator("button").first().click();
      await until("the summon shows what the fixture gives", async () => (await snack(page)) === "Aurora Knight");
      await page.keyboard.press("Escape");
      await settle(page, 600);

      /* the check-in is done already in this state: it lands on its own design */
      await preview(page, built.checkIn);
      await part(page, built.checkInButton).locator("button").first().click();
      await until("the check-in done today shows its notice", async () => ((await onShow(page).textContent()) ?? "").includes("Checked in already today"));
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "game fixture: an MCP server on the project file draws a screen at the fixture headless",
    async run({ base }) {
      const built = gameDoc();
      const dir = mkdtempSync(join(tmpdir(), "m3e-fixture-e2e-"));
      const file = join(dir, "m3e-canvas Game.json");
      writeFileSync(file, serializeProject(built.doc).text);
      const app = existsSync(join(root, "dist", "index.html")) ? join(root, "dist") : base;
      const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, "mcp", "src", "cli.ts"), "--origin", base, "--quiet", "--file", file, "--app", app, "--lang", "en"], cwd: root, stderr: "pipe", env: { ...process.env, OPENAI_API_KEY: "", M3E_MCP_CONFIG_DIR: mkdtempSync(join(tmpdir(), "m3e-mcp-trust-")) } as Record<string, string> });
      const client = new Client({ name: "e2e-fixture", version: "1.0.0" });
      await client.connect(transport);
      const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
      const text = (r: CallToolResult) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
      try {
        const imported = await call("import_game_fixture", { text: FIXTURE, path: "day-12.m3e-fixture.json" });
        check(!imported.isError, `the fixture is imported: ${text(imported)}`);
        const plain = await call("screenshot", { id: built.summon });
        const shot = await call("screenshot", { id: built.summon, fixture: "day-12" });
        const img = shot.content.find((c) => c.type === "image") as { data: string } | undefined;
        check(img, `a picture came back: ${text(shot).slice(0, 300)}`);
        const said = JSON.parse(text(shot)) as { data: { fixture: { scene: string }; world: { views: string[] } } };
        equal(said.data.fixture.scene, "fixture.day-12", "drawn at the fixture's scene");
        equal(said.data.world.views, ["world"], "its world view drawn in the fixture's snapshot");
        const before = plain.content.find((c) => c.type === "image") as { data: string } | undefined;
        check(before && before.data !== img.data, "the screen at the fixture is not the screen as designed");
      } finally {
        await client.close();
      }
    },
  },
];
