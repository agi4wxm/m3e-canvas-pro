import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { TARO_DEFAULTS } from "./taro";

/* The shared stand-in for @tarojs/taro has to name everything the kit and the printed pages take from Taro: a name it
 * leaves out breaks whichever test file loads that code after a file whose fake was the first. */

const src = join(import.meta.dir, "..", "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) ? [join(dir, f)] : []));

describe("the stand-in for Taro", () => {
  it("names every Taro API and hook the kit and the printed pages use", () => {
    const used = new Set<string>();
    for (const file of files(src)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bTaro\.([a-zA-Z]+)/g)) used.add(m[1]);
      for (const m of text.matchAll(/import Taro, \{([^}]*)\} from "@tarojs\/taro"/g)) for (const n of m[1].split(",")) used.add(n.trim());
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((n) => n && !(n in TARO_DEFAULTS))).toEqual([]);
  });
});
