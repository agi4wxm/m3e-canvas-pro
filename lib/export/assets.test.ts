/* The asset pipeline's assets in an export: the screens keep the reference (`asset("<id>")`), each app gets a lookup
 * made from the manifest with its platform's variant, nothing of the asset is copied, and an asset the manifest does
 * not have is a gap: in the apps' differences (the export's report) and in `.m3e/gaps.json` for the hub. */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { buildProject } from "../exportProject";
import { parseAssetManifest, type AssetManifest } from "../assetManifest";
import { setGlobalLang } from "../i18n";
import type { Doc } from "../tokens";
import { boundaryDifferences } from "./boundary";
import { GAPS_PATH, assetGaps } from "./gaps";
import { planExport } from "./merge";
import { buildProduct } from "./product";
import { lookupFor, miniappAssetsFile, rnAssetsFile, webAssetsFile } from "./assets";
import { miniappTarget, mobileTarget, webTarget } from "./targets";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const MANIFEST = parseAssetManifest(readFileSync(new URL("../fixtures/assets/asset-manifest.json", import.meta.url), "utf8")).manifest!;

/** the manifest without one of its assets: the pipeline took it out */
const without = (id: string): AssetManifest => ({ ...MANIFEST, assets: Object.fromEntries(Object.entries(MANIFEST.assets).filter(([k]) => k !== id)) });

function assetDoc(): Doc {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const ai = { origin: "ai" as const };
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  s.run(ops.addScreen, { id: "shop", name: "Shop" }, { origin: "user" });
  s.run(ops.addPart, { slug: "image", id: "hero1", screen: "home", props: { src: "asset:ui/hero", alt: "Hero" } }, ai);
  s.run(ops.addPart, { slug: "image", id: "hero2", screen: "shop", props: { src: "asset:ui/hero" } }, ai);
  s.run(ops.addPart, { slug: "icon", id: "coin", screen: "shop", props: { name: "asset:ui/coin" } }, ai);
  s.run(ops.addPart, { slug: "video", id: "clip", screen: "home", props: { src: "asset:fx/intro" } }, ai);
  return savedDoc(s.get());
}

describe("an app's lookup of the assets", () => {
  it("holds each id the design names with its platform's variant, the main file where there is none", () => {
    const doc = assetDoc();
    expect(lookupFor(doc, MANIFEST, ["web"])).toEqual({ "fx/intro": { type: "video", file: "fx/intro.mp4", width: 320, height: 180 }, "ui/coin": { type: "icon", file: "ui/coin.svg", width: 24, height: 24 }, "ui/hero": { type: "image", file: "web/hero.png", width: 8, height: 4 } });
    expect(lookupFor(doc, MANIFEST, ["wechat"])["ui/hero"].file).toBe("wechat/hero.png");
    expect(lookupFor(doc, MANIFEST, ["ios"])["ui/hero"].file).toBe("ui/hero.png");
    expect(lookupFor(doc, without("ui/hero"), ["web"])["ui/hero"]).toBeUndefined();
    expect(webAssetsFile(doc, MANIFEST)).toContain('registerIcons({ prefix: "m3e-asset", icons: {');
    expect(rnAssetsFile(doc, MANIFEST)).toContain('"ios": "ui/hero.png",\n    "android": "ui/hero.png"');
    expect(miniappAssetsFile(doc, MANIFEST)).toContain('"wechat": "wechat/hero.png"');
    const none: Doc = { ...doc, groups: [] };
    expect(webAssetsFile(none, MANIFEST)).toBeUndefined();
  });
});

describe("the prototype export", () => {
  it("reads every asset from the lookup by its id, and copies none of them", async () => {
    const { files } = await buildProject(assetDoc(), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", assets: MANIFEST });
    const screens = Object.entries(files).filter(([p]) => p.startsWith("src/screens/")).map(([, t]) => String(t)).join("\n");
    expect(screens).toContain('src={asset("ui/hero")}');
    expect(screens).toContain('src={asset("fx/intro")}');
    expect(screens).toContain('name="asset:ui/coin"');
    expect(screens).toContain('import { asset } from "@/assets"');
    expect(files["src/assets.ts"]).toContain('"file": "web/hero.png"');
    expect(files["src/theme.tsx"]).toContain('import "@/assets"');
    expect(files["src/components/m3e/icon.tsx"]).toContain("asset-icon-name");
    expect("src/components/m3e/asset-icon-name.ts" in files).toBe(true);
    /* nothing of the pipeline's files is in the project */
    expect(Object.keys(files).filter((p) => /hero|coin|intro/.test(p) && !p.startsWith("src/screens/"))).toEqual([]);
  }, 60_000);
});

describe("an asset the manifest does not have", () => {
  it("is a gap every app's report lists, and the hub's gap file", () => {
    const doc = assetDoc();
    expect(boundaryDifferences(doc, "web", {}, MANIFEST).filter((d) => d.kind === "asset")).toEqual([]);
    const gone = without("ui/hero");
    const report = boundaryDifferences(doc, "mobile", {}, gone).filter((d) => d.kind === "asset");
    expect(report.map((d) => [d.screen, d.part, d.detail.split(";")[0]])).toEqual([
      ["Home", "Image", "src: asset:ui/hero is not in the asset manifest (removed, or not delivered yet)"],
      ["Shop", "Image", "src: asset:ui/hero is not in the asset manifest (removed, or not delivered yet)"],
    ]);
    expect(assetGaps(doc, gone)).toEqual([
      {
        kind: "asset",
        module: "asset-pipeline",
        ref: "ui/hero",
        reason: "missing",
        detail: "asset:ui/hero is not in the asset manifest (removed, or not delivered yet)",
        where: [
          { screen: "Home", part: "Image", prop: "src" },
          { screen: "Shop", part: "Image", prop: "src" },
        ],
      },
    ]);
    expect(assetGaps(doc, null).map((g) => [g.ref, g.reason])).toEqual([
      ["fx/intro", "no-manifest"],
      ["ui/coin", "no-manifest"],
      ["ui/hero", "no-manifest"],
    ]);
  });

  it("is listed in the product's report and in .m3e/gaps.json, which the export writes with no gaps as well", async () => {
    const doc = assetDoc();
    const targets = [webTarget, mobileTarget, miniappTarget];
    const whole = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", targets, assets: MANIFEST });
    expect(JSON.parse(whole.files[GAPS_PATH].body as string)).toEqual({ format: "m3e-gaps", version: 1, generator: "M3E Canvas Pro", product: "m3e-app", gaps: [] });
    expect(whole.differences.filter((d) => d.kind === "asset" && !/icon/.test(d.detail))).toEqual([]);
    expect(whole.files["apps/web/src/generated/assets.ts"].body).toContain('"file": "web/hero.png"');
    expect(whole.files["apps/mobile/src/generated/assets.ts"].body).toContain("Platform.OS");
    expect(whole.files["apps/miniapp/src/generated/assets.ts"].body).toContain('"wechat": "wechat/hero.png"');
    const screen = (app: string) => Object.entries(whole.files).filter(([p]) => p.startsWith(`apps/${app}/src/generated/screens/`)).map(([, f]) => String(f.body)).join("\n");
    expect(screen("web")).toContain('import { asset } from "@/generated/assets"');
    expect(screen("mobile")).toContain('src={asset("ui/hero")}');
    expect(screen("mobile")).toContain('import { asset } from "../assets";');
    expect(screen("miniapp")).toContain('src={asset("ui/hero")}');
    /* the phone's and the mini-program's kits draw no asset as an icon yet: said, not hidden */
    expect(whole.differences.filter((d) => d.kind === "asset").map((d) => d.app)).toEqual(["mobile", "miniapp"]);

    const gone = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", targets, assets: without("ui/hero") });
    const gaps = JSON.parse(gone.files[GAPS_PATH].body as string);
    expect(gaps.gaps.map((g: { ref: string; where: unknown[] }) => [g.ref, g.where.length])).toEqual([["ui/hero", 2]]);
    expect(gone.differences.filter((d) => d.kind === "asset" && /ui\/hero/.test(d.detail)).map((d) => [d.app, d.screen])).toEqual([
      ["web", "Home"],
      ["web", "Shop"],
      ["mobile", "Home"],
      ["mobile", "Shop"],
      ["miniapp", "Home"],
      ["miniapp", "Shop"],
    ]);
    expect(gone.files["apps/web/src/generated/assets.ts"].body).not.toContain("ui/hero");
    /* the gap file is the export's own: written and kept in the manifest like any generated file */
    const plan = planExport({ product: gone.name, next: gone.files, disk: {}, previous: null });
    expect(plan.writes.some((w) => w.path === GAPS_PATH)).toBe(true);
  }, 120_000);
});
