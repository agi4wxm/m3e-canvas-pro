/* Every gap the hub is told of (gaps.ts, the plan's J7): an asset the manifest does not have, what the design calls,
 * acts on or reads that the gameplay contract does not have (its snapshot's paths and events among them), linked data
 * gone stale (the data module's linked collections plug in as a `LinkedDataSource`; a stub stands in for them here), and
 * a contract version the hub's index differs on. Each is in `.m3e/gaps.json` and in every app's report. */

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import type { Doc, Item } from "../tokens";
import { EXAMPLE_GAME_CONTRACT, linkGame } from "../game";
import { readContractIndex, type ContractIndex } from "../hub/contractIndex";
import { parseAssetManifest } from "../assetManifest";
import { boundaryDifferences } from "./boundary";
import { GAPS_PATH, dataGaps, hubGaps, linkedDataOf, type LinkedData, type LinkedDataSource } from "./gaps";
import { buildProduct } from "./product";
import { webTarget } from "./targets";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const MANIFEST = parseAssetManifest(readFileSync(new URL("../fixtures/assets/asset-manifest.json", import.meta.url), "utf8")).manifest!;
const INDEX = readContractIndex(readFileSync(new URL("../hub/fixtures/contract-index.json", import.meta.url), "utf8")).index!;
const indexAt = (version: string): ContractIndex => ({ ...INDEX, modules: { ...INDEX.modules, "game-loop": { ...INDEX.modules["game-loop"], contractVersion: version } } });

const part = (id: string, component: string, extra: Partial<Item> & Record<string, unknown> = {}): Item => ({ id, kind: "component", component, label: "", icon: null, variant: "", props: {}, ...extra }) as Item;

/** a battle screen written to the example contract: a world view acting on an event it does not send, a HUD reading a
 *  key the snapshot does not have, and a picture the manifest does not have */
function battleDoc(): Doc {
  return {
    ...linkGame({ title: "Arena", groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT).doc,
    frames: [{ id: "battle", name: "Battle", x: 0, y: 0 }],
    groups: [
      {
        id: "g1",
        x: 0,
        y: 0,
        axis: "y",
        items: [
          part("world", "world-view", { label: "World", actions: { "on:dodged": { to: "none" } } }),
          part("lives", "text", { label: "Lives", frame: { text: "world.lives" } }),
          part("hero", "image", { label: "Hero", props: { src: "asset:ui/gone" } }),
        ],
      },
    ],
  } as unknown as Doc;
}

/** what J4's linked collections would say: one table as read, one changed since, one gone */
const stubSource: LinkedDataSource = async () => [
  { collection: "items", ref: "tables/items.json", read: "h1", now: "h1" },
  { collection: "heroes", ref: "tables/heroes.json", read: "h1", now: "h2", where: [{ screen: "Battle", part: "Roster", prop: "rows" }] },
  { collection: "quests", ref: "tables/quests.json", read: "h1", now: null },
];

describe("linked data", () => {
  it("is a gap when its table changed since the design read it, or is gone, and none when it is as read", async () => {
    const linked = await linkedDataOf(battleDoc(), stubSource);
    expect(dataGaps(linked)).toEqual([
      { kind: "data", module: "data", ref: "tables/heroes.json", reason: "stale", detail: "the table tables/heroes.json changed since the design read it: read it again", where: [{ screen: "Battle", part: "Roster", prop: "rows" }] },
      { kind: "data", module: "data", ref: "tables/quests.json", reason: "missing", detail: "the table tables/quests.json the design reads is gone from the data module", where: [{ prop: "collection quests" }] },
    ]);
    /* two collections on one table are one gap, with both places */
    const twice: LinkedData[] = [
      { collection: "a", ref: "t.json", read: "1", now: "2" },
      { collection: "b", ref: "t.json", read: "1", now: "3" },
    ];
    expect(dataGaps(twice).map((g) => g.where)).toEqual([[{ prop: "collection a" }, { prop: "collection b" }]]);
    /* no source, or one that fails, says nothing: it never stops an export */
    expect(await linkedDataOf(battleDoc(), undefined)).toEqual([]);
    expect(
      await linkedDataOf(battleDoc(), () => {
        throw new Error("the data module is not there");
      }),
    ).toEqual([]);
  });
});

describe("every gap of the design's", () => {
  it("is listed by kind for the hub: assets, the gameplay contract, linked data, contract versions", async () => {
    const doc = battleDoc();
    const gaps = hubGaps(doc, { assets: MANIFEST, linkedData: await linkedDataOf(doc, stubSource), contractIndex: indexAt("1.1.0") });
    expect(gaps.map((g) => [g.kind, g.module, g.ref, g.reason])).toEqual([
      ["asset", "asset-pipeline", "ui/gone", "missing"],
      ["game-event", "game-loop", "event dodged", "missing"],
      ["game-snapshot", "game-loop", "world.lives", "missing"],
      ["data", "data", "tables/heroes.json", "stale"],
      ["data", "data", "tables/quests.json", "missing"],
      ["contract-version", "game-loop", "game", "mismatch"],
    ]);
    /* an index that agrees, and no linked data: only the design's own references */
    expect(hubGaps(doc, { assets: MANIFEST, contractIndex: INDEX }).map((g) => g.kind)).toEqual(["asset", "game-event", "game-snapshot"]);
  });

  it("is in every app's report, by screen and part, beside the asset's", async () => {
    const doc = battleDoc();
    const report = boundaryDifferences(doc, "mobile", {}, { assets: MANIFEST, linkedData: await linkedDataOf(doc, stubSource), contractIndex: indexAt("1.1.0") });
    const hub = report.filter((d) => ["asset", "game", "data", "contract"].includes(d.kind));
    expect(hub.map((d) => [d.kind, d.screen ?? "", d.part ?? "", d.detail])).toEqual([
      ["asset", "Battle", "Hero", "src: asset:ui/gone is not in the asset manifest (removed, or not delivered yet); the app draws the part's placeholder"],
      ["game", "Battle", "World", "on:dodged: acts on the world's dodged, an event the contract does not have"],
      ["game", "Battle", "Lives", "frame text: reads world.lives, which the game's snapshot has no place for (it has entities, follow, score, status, byId, clock)"],
      ["data", "Battle", "Roster", "rows: the table tables/heroes.json changed since the design read it: read it again"],
      ["data", "", "", "collection quests: the table tables/quests.json the design reads is gone from the data module"],
      ["contract", "", "", "the design is written to game contract 1.0.0; the hub's index has game-loop at 1.1.0 (game-loop/contract.m3e-game.json): import that one again"],
    ]);
    /* the asset manifest alone, as before: the same asset gap, and the contract's own */
    expect(boundaryDifferences(doc, "web", {}, MANIFEST).filter((d) => ["asset", "game", "data", "contract"].includes(d.kind)).map((d) => d.kind)).toEqual(["asset", "game", "game"]);
  });

  it("goes into the product's .m3e/gaps.json and its report", async () => {
    const doc = battleDoc();
    const product = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", targets: [webTarget], assets: MANIFEST, linkedData: await linkedDataOf(doc, stubSource), contractIndex: indexAt("1.1.0") });
    const file = JSON.parse(product.files[GAPS_PATH].body as string);
    expect(file).toMatchObject({ format: "m3e-gaps", version: 1, product: "arena" });
    expect(file.gaps.map((g: { kind: string }) => g.kind)).toEqual(["asset", "game-event", "game-snapshot", "data", "data", "contract-version"]);
    expect(file.gaps.every((g: Record<string, unknown>) => Object.keys(g).join() === "kind,module,ref,reason,detail,where")).toBe(true);
    expect(product.differences.filter((d) => ["game", "data", "contract"].includes(d.kind)).map((d) => d.kind)).toEqual(["game", "game", "data", "data", "contract"]);
    expect(JSON.parse(product.files["apps/web/src/generated/warnings.json"].body as string).some((w: { kind: string }) => w.kind === "contract")).toBe(true);
  }, 120_000);
});
