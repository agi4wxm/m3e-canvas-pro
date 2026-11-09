/* The hub's contract index beside a project on disk, in file mode (hub.ts): read afresh on each export where the
 * project's configuration says, and the gameplay contract's version compared with it in export_product's gap file. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../lib/i18n";
import { diskContractIndex } from "./hub";
import { connect, errorOf, scratchDir, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done) await d();
  done = [];
});

const CONTRACT = readFileSync(new URL("../../lib/game/fixtures/example.m3e-game.json", import.meta.url), "utf8");
const INDEX = JSON.parse(readFileSync(new URL("../../lib/hub/fixtures/contract-index.json", import.meta.url), "utf8"));
const indexAt = (version: string) => JSON.stringify({ ...INDEX, modules: { ...INDEX.modules, "game-loop": { ...INDEX.modules["game-loop"], contractVersion: version } } });

describe("the hub's contract index in file mode", () => {
  it("is read where the configuration says, inside the project's folder only", async () => {
    const dir = scratchDir();
    expect(await diskContractIndex(dir, {})).toEqual({ status: "none", path: "contract-index.json" });
    writeFileSync(join(dir, "contract-index.json"), indexAt("1.0.0"));
    expect(await diskContractIndex(dir, {})).toMatchObject({ status: "read", index: { modules: { "game-loop": { contractVersion: "1.0.0" } } } });
    expect(await diskContractIndex(dir, { external: { contractIndex: "hub/index.json" } })).toEqual({ status: "missing", path: "hub/index.json" });
    expect(await diskContractIndex(dir, { external: { contractIndex: "../index.json" } })).toMatchObject({ status: "read", path: "contract-index.json" });
  });

  it("puts a gameplay contract version the index differs on into export_product's gap file", async () => {
    const dir = scratchDir();
    const path = join(dir, "m3e-canvas Arena.json");
    writeProject(path);
    const s = await connect({ file: path });
    done.push(s.close);
    expect(errorOf(await s.call("import_game_contract", { text: CONTRACT }))).toBeNull();
    const gapsOf = async (out: string) => {
      expect((await s.call("export_product", { dir: out })).isError).toBeFalsy();
      return JSON.parse(readFileSync(join(dir, out, ".m3e/gaps.json"), "utf8")).gaps.filter((g: { kind: string }) => g.kind === "contract-version");
    };
    /* no index: nothing to compare with */
    expect(await gapsOf("p1")).toEqual([]);
    mkdirSync(join(dir, "hub"));
    writeFileSync(join(dir, "hub/index.json"), indexAt("1.3.0"));
    expect(errorOf(await s.call("set_contract_index", { path: "hub/index.json" }))).toBeNull();
    expect(await gapsOf("p2")).toEqual([expect.objectContaining({ module: "game-loop", ref: "game", reason: "mismatch", where: [] })]);
    /* the hub catches up: read afresh, the gap is gone */
    writeFileSync(join(dir, "hub/index.json"), indexAt("1.0.0"));
    expect(await gapsOf("p3")).toEqual([]);
  }, 180_000);
});
