/* The asset pipeline's assets named by a document (`asset:<id>`): where a document names them, what is a gap in the
 * manifest, how a part's values are drawn from it, the catalog read from a folder and read again as the pipeline
 * changes it, and the operations and the read tool the agent and MCP use. The plan's acceptance (docs/游戏阶段整改计划.md,
 * 第七批): a picture swapped in the manifest is the new one in every part that names it; an asset taken out of it is a
 * gap. */

import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "./core";
import { parseProject, serializeProject } from "./core/projectFile";
import { assetCatalog, assetCatalogChanged, assetIconSet, assetManifestPathOf, drawnAssetUrl, loadAssetCatalog, setAssetCatalog, type AssetReader } from "./assetCatalog";
import { parseAssetManifest } from "./assetManifest";
import { assetGapOf, assetUsesOf, isAssetName, withAssetUrls } from "./assetRefs";
import { setGlobalLang } from "./i18n";
import { openProject } from "./project";
import { partBySlug } from "../parts/registry";
import { AssetWatch } from "./projects/assetLink";
import { executeTool, CORE_REGISTRY } from "./tools";

beforeAll(() => setGlobalLang("en"));
beforeEach(() => setAssetCatalog(null));

const FIXTURE = new URL("./fixtures/assets/", import.meta.url);
const fixtureFile = (path: string) => new Uint8Array(readFileSync(new URL(path, FIXTURE)));

/** a folder in memory, as the catalog reads one: files by path, each with a stamp that moves when it is written */
function memoryFolder(files: Record<string, Uint8Array | string>) {
  const at = new Map<string, { bytes: Uint8Array; n: number }>();
  let n = 0;
  const put = (path: string, v: Uint8Array | string) => at.set(path, { bytes: typeof v === "string" ? new TextEncoder().encode(v) : v, n: ++n });
  for (const [p, v] of Object.entries(files)) put(p, v);
  const reader: AssetReader = { read: async (p) => at.get(p)?.bytes ?? null, stamp: async (p) => (at.has(p) ? `${at.get(p)!.bytes.length}:${at.get(p)!.n}` : null) };
  return { reader, put, remove: (p: string) => at.delete(p) };
}

const fixtureFolder = () =>
  memoryFolder({
    "asset-manifest.json": fixtureFile("asset-manifest.json"),
    "ui/hero.png": fixtureFile("ui/hero.png"),
    "ui/coin.svg": fixtureFile("ui/coin.svg"),
    "fx/intro.mp4": fixtureFile("fx/intro.mp4"),
    "web/hero.png": fixtureFile("web/hero.png"),
    "wechat/hero.png": fixtureFile("wechat/hero.png"),
  });

const ai = { origin: "ai" as const };
function store() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  s.run(ops.addScreen, { id: "shop", name: "Shop" }, { origin: "user" });
  return s;
}

describe("an asset named by a document", () => {
  it("is asset:<id>, with an id the manifest's format allows", () => {
    expect(isAssetName("asset:ui/hero")).toBe(true);
    expect(isAssetName("asset:")).toBe(false);
    expect(isAssetName("asset:../x")).toBe(false);
    expect(isAssetName("m3e-asset:abc-12")).toBe(false);
  });

  it("is found wherever a part takes a picture, an icon or a clip, on every screen and in the components", () => {
    const s = store();
    s.run(ops.addPart, { slug: "image", id: "hero1", screen: "home", props: { src: "asset:ui/hero" } }, ai);
    s.run(ops.addPart, { slug: "image", id: "hero2", screen: "shop", props: { src: "asset:ui/hero" } }, ai);
    s.run(ops.addPart, { slug: "icon", id: "coin", screen: "shop", props: { name: "asset:ui/coin" } }, ai);
    s.run(ops.addPart, { slug: "video", id: "clip", screen: "home", props: { src: "asset:fx/intro" } }, ai);
    const uses = assetUsesOf(s.get().doc);
    expect(uses.map((u) => [u.id, u.slot, u.item, u.prop, u.screen])).toEqual([
      ["ui/hero", "image", "hero1", "src", "Home"],
      ["fx/intro", "video", "clip", "src", "Home"],
      ["ui/hero", "image", "hero2", "src", "Shop"],
      ["ui/coin", "icon", "coin", "name", "Shop"],
    ]);
  });

  it("is a gap when the manifest does not have it, has it as another type, or there is none", () => {
    const { manifest } = parseAssetManifest(new TextDecoder().decode(fixtureFile("asset-manifest.json")));
    expect(assetGapOf({ id: "ui/hero", slot: "image" }, manifest)).toBeNull();
    expect(assetGapOf({ id: "ui/coin", slot: "image" }, manifest)).toBeNull();
    expect(assetGapOf({ id: "gone", slot: "image" }, manifest)?.reason).toBe("missing");
    expect(assetGapOf({ id: "fx/intro", slot: "image" }, manifest)?.reason).toBe("wrong-type");
    expect(assetGapOf({ id: "ui/hero", slot: "image" }, null)?.reason).toBe("no-manifest");
  });

  it("goes through a project file and back as the reference alone, and the project's configuration with it", () => {
    const s = store();
    s.run(ops.addPart, { slug: "image", id: "hero1", screen: "home", props: { src: "asset:ui/hero" } }, ai);
    s.run(ops.setAssetManifest, { path: "pipeline/out/assets.json" }, ai);
    const doc = savedDoc(s.get());
    expect(assetManifestPathOf(doc)).toBe("pipeline/out/assets.json");
    for (const assets of ["inline", "files"] as const) {
      const { text } = serializeProject(doc, { assets });
      expect(text).toContain('"src":"asset:ui/hero"');
      const back = parseProject(text)!;
      expect(back.doc.external).toEqual({ assetManifest: "pipeline/out/assets.json" });
      expect(serializeProject(back.doc, { assets }).text).toBe(text);
    }
    /* a path out of the folder is no configuration; what a later version says beside it stays */
    const opened = openProject({ format: "m3e-project", version: 5, document: { ...doc, external: { assetManifest: "../secret.json", contractIndex: "hub/index.json" } } })!;
    expect(opened.external).toEqual({ contractIndex: "hub/index.json" });
    expect(assetManifestPathOf(opened)).toBe("asset-manifest.json");
  });
});

describe("the catalog of a project's manifest", () => {
  it("reads every asset's file from beside the manifest, and says what is not there", async () => {
    const folder = fixtureFolder();
    folder.remove("fx/intro.mp4");
    const c = await loadAssetCatalog(folder.reader, "asset-manifest.json");
    expect(Object.keys(c.manifest!.assets)).toEqual(["ui/hero", "ui/coin", "fx/intro"]);
    expect(c.urls["ui/hero"]).toMatch(/^data:image\/png;base64,/);
    expect(c.urls["ui/coin"]).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(c.urls["fx/intro"]).toBeUndefined();
    expect(c.problems).toEqual(["fx/intro: its file fx/intro.mp4 is not there"]);
    const none = await loadAssetCatalog(folder.reader, "elsewhere/asset-manifest.json");
    expect(none.manifest).toBeNull();
  });

  it("draws a part naming an asset from it, and the placeholder for one it does not have", async () => {
    setAssetCatalog(await loadAssetCatalog(fixtureFolder().reader, "asset-manifest.json"));
    const image = partBySlug("image")!;
    expect(withAssetUrls(image, { src: "asset:ui/hero" }, drawnAssetUrl)!.src).toBe(assetCatalog()!.urls["ui/hero"]);
    expect(withAssetUrls(image, { src: "asset:gone" }, drawnAssetUrl)!.src).toBe("");
    const plain = { src: "data:image/png;base64,AAAA" };
    expect(withAssetUrls(image, plain, drawnAssetUrl)).toBe(plain);
    /* an icon stays a name: the icon component draws it from the set registered for it */
    const icon = partBySlug("icon")!;
    expect(withAssetUrls(icon, { name: "asset:ui/coin" }, drawnAssetUrl)!.name).toBe("asset:ui/coin");
    const { set, drawn } = assetIconSet(assetCatalog());
    expect(set.prefix).toBe("m3e-asset");
    expect(Object.keys(drawn).sort()).toEqual(["ui/coin", "ui/hero"]);
    expect(Object.values(set.icons)[0].body).toMatch(/^<image href="data:image\//);
  });

  it("is read again when the pipeline swaps a picture: every part naming it draws the new one", async () => {
    const folder = fixtureFolder();
    const seen: string[] = [];
    const watch = new AssetWatch(folder.reader, "asset-manifest.json", (c) => (setAssetCatalog(c), seen.push(c.urls["ui/hero"])), 0);
    await watch.start();
    const s = store();
    s.run(ops.addPart, { slug: "image", id: "hero1", screen: "home", props: { src: "asset:ui/hero" } }, ai);
    s.run(ops.addPart, { slug: "image", id: "hero2", screen: "shop", props: { src: "asset:ui/hero" } }, ai);
    const drawnOf = (id: string) => {
      const it = s.get().doc.groups.flatMap((g) => g.items).find((x) => x.id === id)!;
      return withAssetUrls(partBySlug("image")!, it.props, drawnAssetUrl)!.src;
    };
    const before = drawnOf("hero1");
    await watch.check();
    expect(seen.length).toBe(1);
    /* the pipeline writes another picture under the same name */
    folder.put("ui/hero.png", fixtureFile("ui/hero-night.png"));
    expect(await assetCatalogChanged(folder.reader, assetCatalog()!)).toBe(true);
    await watch.check();
    expect(seen.length).toBe(2);
    expect(drawnOf("hero1")).not.toBe(before);
    expect(drawnOf("hero1")).toBe(drawnOf("hero2"));
    expect(drawnOf("hero1")).toBe(`data:image/png;base64,${Buffer.from(fixtureFile("ui/hero-night.png")).toString("base64")}`);
    /* the document still holds the reference alone */
    expect(JSON.stringify(savedDoc(s.get()))).not.toContain("data:image");
    /* or points the id at another file in a new manifest */
    const manifest = JSON.parse(new TextDecoder().decode(fixtureFile("asset-manifest.json")));
    manifest.assets["ui/hero"].file = "web/hero.png";
    folder.put("asset-manifest.json", JSON.stringify(manifest));
    await watch.check();
    expect(drawnOf("hero2")).toBe(`data:image/png;base64,${Buffer.from(fixtureFile("web/hero.png")).toString("base64")}`);
    watch.close();
  });
});

describe("the agent's and MCP's tools", () => {
  it("list the manifest's assets, put one on a part, and refuse one it does not have", async () => {
    const s = store();
    s.run(ops.addPart, { slug: "image", id: "hero1", screen: "home" }, ai);
    s.run(ops.addPart, { slug: "icon", id: "coin", screen: "home" }, ai);
    s.run(ops.addPart, { slug: "video", id: "clip", screen: "home" }, ai);
    const none = await executeTool(s, "set_asset", { id: "hero1", asset: "ui/hero" }, { origin: "ai", registry: CORE_REGISTRY });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.message).toMatch(/No asset manifest is in reach.*asset-manifest\.json/);

    setAssetCatalog(await loadAssetCatalog(fixtureFolder().reader, "asset-manifest.json"));
    const listed = await executeTool(s, "list_assets", {}, { origin: "ai", registry: CORE_REGISTRY });
    expect(listed.ok && String(listed.result)).toMatch(/asset:ui\/hero \(image 8×4\) "Hero banner"; variants: web, wechat; licence CC0-1.0/);
    expect(await executeTool(s, "set_asset", { id: "hero1", asset: "asset:ui/hero" }, { origin: "ai", registry: CORE_REGISTRY })).toMatchObject({ ok: true, result: { prop: "src", value: "asset:ui/hero" } });
    expect(await executeTool(s, "set_asset", { id: "coin", asset: "ui/coin" }, { origin: "ai", registry: CORE_REGISTRY })).toMatchObject({ ok: true, result: { prop: "name", value: "asset:ui/coin" } });
    expect(await executeTool(s, "set_asset", { id: "clip", asset: "fx/intro" }, { origin: "ai", registry: CORE_REGISTRY })).toMatchObject({ ok: true, result: { prop: "src" } });
    const wrong = await executeTool(s, "set_asset", { id: "hero1", asset: "fx/intro" }, { origin: "ai", registry: CORE_REGISTRY });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.message).toMatch(/takes no video/);
    const missing = await executeTool(s, "set_props", { id: "hero1", props: { src: "asset:ui/nope" } }, { origin: "ai", registry: CORE_REGISTRY });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toMatch(/not in the asset manifest.*asset:ui\/hero/);
    const used = await executeTool(s, "list_assets", { type: "image" }, { origin: "ai", registry: CORE_REGISTRY });
    expect(used.ok && String(used.result)).toMatch(/asset:ui\/hero .*named by hero1\.src/);
    expect(used.ok && String(used.result)).not.toMatch(/ui\/coin/);
  });
});
