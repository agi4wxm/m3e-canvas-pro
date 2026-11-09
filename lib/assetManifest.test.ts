import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSET_ID, ASSET_PATH, ASSET_PLATFORM, ASSET_TYPES, assetFileFor, assetMime, besideManifest, parseAssetManifest, readAssetManifest } from "./assetManifest";

const fixture = readFileSync(new URL("./fixtures/assets/asset-manifest.json", import.meta.url), "utf8");
const schema = JSON.parse(readFileSync(new URL("./assetManifest.schema.json", import.meta.url), "utf8"));

describe("the asset manifest", () => {
  it("reads the example manifest of the test fixtures whole", () => {
    const { manifest, problems } = parseAssetManifest(fixture);
    expect(problems).toEqual([]);
    expect(Object.keys(manifest!.assets)).toEqual(["ui/hero", "ui/coin", "fx/intro"]);
    expect(manifest!.assets["ui/hero"]).toMatchObject({ type: "image", file: "ui/hero.png", width: 8, height: 4, license: "CC0-1.0", variants: { web: { file: "web/hero.png" }, wechat: { file: "wechat/hero.png", width: 4 } } });
  });

  it("holds a file to the same rules as its JSON Schema", () => {
    expect(schema.properties.format.const).toBe("asset-manifest");
    expect(schema.properties.version.const).toBe(1);
    expect(schema.required).toEqual(["format", "version", "assets"]);
    expect(schema.properties.assets.propertyNames.pattern).toBe(ASSET_ID.source);
    expect(schema.$defs.file.properties.file.pattern).toBe(ASSET_PATH.source);
    expect(schema.$defs.asset.properties.variants.propertyNames.pattern).toBe(ASSET_PLATFORM.source);
    expect(schema.$defs.asset.properties.type.enum).toEqual([...ASSET_TYPES]);
    expect(schema.$defs.asset.required).toEqual(["type", "file"]);
  });

  it("drops an entry that does not keep to the format, says why, and keeps the others", () => {
    const { manifest, problems } = readAssetManifest({
      format: "asset-manifest",
      version: 1,
      assets: {
        ok: { type: "image", file: "a.png" },
        "bad id": { type: "image", file: "a.png" },
        noType: { file: "a.png" },
        escapes: { type: "image", file: "../secret.png" },
        absolute: { type: "image", file: "/etc/passwd" },
        drive: { type: "image", file: "C:/x.png" },
        sized: { type: "image", file: "b.png", width: -3, height: 2.5, variants: { Web: { file: "w.png" }, ios: { file: "i.png" }, android: { nofile: true } } },
      },
    });
    expect(Object.keys(manifest!.assets)).toEqual(["ok", "sized"]);
    expect(manifest!.assets.sized).toEqual({ type: "image", file: "b.png", variants: { ios: { file: "i.png" } } });
    expect(problems.length).toBe(9);
    expect(problems.join("\n")).toMatch(/escapes/);
  });

  it("refuses what is no manifest, and a later version, saying which", () => {
    expect(parseAssetManifest("{").problems).toEqual(["not JSON"]);
    expect(readAssetManifest({ format: "m3e-project", version: 1, assets: {} }).manifest).toBeNull();
    expect(readAssetManifest({ format: "asset-manifest", version: 2, assets: {} }).problems[0]).toMatch(/version 2.*reads version 1/);
    expect(readAssetManifest({ format: "asset-manifest", version: 1, assets: [] }).manifest).toBeNull();
  });

  it("keeps an id such as __proto__ as an id", () => {
    const { manifest } = parseAssetManifest('{"format":"asset-manifest","version":1,"assets":{"__proto__":{"type":"icon","file":"p.svg"}}}');
    expect(Object.keys(manifest!.assets)).toEqual([]);
    const ok = parseAssetManifest('{"format":"asset-manifest","version":1,"assets":{"proto":{"type":"icon","file":"p.svg"}}}');
    expect(Object.getPrototypeOf(ok.manifest!.assets)).toBe(Object.prototype);
  });

  it("gives each platform its variant, the main file where it has none", () => {
    const { manifest } = parseAssetManifest(fixture);
    const hero = manifest!.assets["ui/hero"];
    expect(assetFileFor(hero, ["web"]).file).toBe("web/hero.png");
    expect(assetFileFor(hero, ["ios", "android"]).file).toBe("ui/hero.png");
    expect(assetFileFor(hero, ["douyin", "wechat"]).file).toBe("wechat/hero.png");
    expect(assetMime(manifest!.assets["ui/coin"])).toBe("image/svg+xml");
    expect(besideManifest("pipeline/out/asset-manifest.json", "ui/a.png")).toBe("pipeline/out/ui/a.png");
    expect(besideManifest("asset-manifest.json", "ui/a.png")).toBe("ui/a.png");
  });
});
