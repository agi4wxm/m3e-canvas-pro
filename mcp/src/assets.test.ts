/* The asset manifest beside a project on disk, in file mode: read from the project's folder (where its configuration
 * says), read again when the pipeline changes it, what list_assets and set_asset work with, and what export_product's
 * lookups and gap file are made from. */

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../lib/i18n";
import { connect, errorOf, scratchDir, textOf, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done) await d();
  done = [];
});

const FIXTURE = fileURLToPath(new URL("../../lib/fixtures/assets", import.meta.url));

async function open(manifestAt = "") {
  const dir = scratchDir();
  const path = join(dir, "m3e-canvas Shop.json");
  writeProject(path);
  cpSync(FIXTURE, join(dir, manifestAt), { recursive: true });
  const s = await connect({ file: path });
  done.push(s.close);
  return { ...s, dir, path };
}

describe("the asset manifest in file mode", () => {
  it("is read beside the project, puts an asset on a part, and is read again when the pipeline changes it", async () => {
    const { call, dir, path } = await open();
    expect(textOf(await call("list_assets"))).toMatch(/Asset manifest asset-manifest\.json .*: 3 asset\(s\)/);
    const put = await call("set_asset", { id: "card", asset: "ui/hero" });
    expect(errorOf(put)?.message).toMatch(/box takes no image/);
    await call("add_part", { slug: "image", id: "hero", screen: "home" });
    expect(errorOf(await call("set_asset", { id: "hero", asset: "ui/hero" }))).toBeNull();
    expect(readFileSync(path, "utf8")).toContain('"src":"asset:ui/hero"');
    /* the pipeline takes the asset out: the next call reads the manifest again */
    const manifest = JSON.parse(readFileSync(join(dir, "asset-manifest.json"), "utf8"));
    delete manifest.assets["ui/hero"];
    writeFileSync(join(dir, "asset-manifest.json"), JSON.stringify(manifest));
    const listed = textOf(await call("list_assets"));
    expect(listed).toMatch(/: 2 asset\(s\)/);
    expect(listed).toMatch(/gaps.*\n- hero\.src on Home: asset:ui\/hero is not in the asset manifest/s);
    const out = await call("export_product", { dir: "shop-product" });
    expect(out.isError).toBeFalsy();
    const gaps = JSON.parse(readFileSync(join(dir, "shop-product", ".m3e/gaps.json"), "utf8"));
    expect(gaps.gaps).toEqual([expect.objectContaining({ kind: "asset", ref: "ui/hero", reason: "missing", where: [{ screen: "Home", part: "Image", prop: "src" }] })]);
    expect(readFileSync(join(dir, "shop-product", "apps/web/src/generated/assets.ts"), "utf8")).not.toContain('"ui/hero"');
  }, 120_000);

  it("is read where the project's configuration says, and only inside the project's folder", async () => {
    const { call } = await open("art");
    expect(textOf(await call("list_assets"))).toMatch(/No asset manifest is in reach: the project looks for it at asset-manifest\.json/);
    expect(errorOf(await call("set_asset_manifest", { path: "../elsewhere.json" }))?.code).toBe("invalid_value");
    expect(errorOf(await call("set_asset_manifest", { path: "art/asset-manifest.json" }))).toBeNull();
    expect(textOf(await call("list_assets"))).toMatch(/Asset manifest art\/asset-manifest\.json/);
    const status = textOf(await call("connection_status"));
    expect(status).toMatch(/art\/asset-manifest\.json: 3 asset/);
    expect(existsSync(FIXTURE)).toBe(true);
  });
});
