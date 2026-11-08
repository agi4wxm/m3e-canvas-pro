import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PARTS } from "../../parts/registry";
import { NATIVE as RN_NATIVE } from "../../rn/src/kit/coverage";
import { NATIVE as MINI_NATIVE } from "../../miniapp-kit/src/kit/coverage";
import { eventProp } from "./partEvents";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

/** every source file of a kit, as one text */
const sourcesOf = (dir: string) =>
  readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("generated"))
    .map((f) => readFileSync(join(root, dir, f), "utf8"))
    .join("\n");

/** a component's props type as the kit writes it (`export type XProps = …;`), up to its end */
function propsOf(source: string, component: string): string {
  const at = source.indexOf(`export type ${component}Props =`);
  if (at < 0) return "";
  let depth = 0;
  let i = at;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "{" || c === "(") depth++;
    else if (c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) break;
  }
  return source.slice(at, i);
}

const KITS = [
  { name: "rn", source: sourcesOf("rn/src/kit"), native: RN_NATIVE as Record<string, string> },
  { name: "miniapp", source: sourcesOf("miniapp-kit/src/kit"), native: MINI_NATIVE as Record<string, string> },
];

describe("the events the kits hand out", () => {
  it("are callbacks every kit's component of the part declares", () => {
    let wired = 0;
    for (const d of PARTS)
      for (const e of d.events ?? []) {
        const ep = eventProp(d.slug, e.name);
        if (!ep) continue;
        for (const kit of KITS) {
          const component = kit.native[d.slug];
          expect(component, `${kit.name} ${d.slug}`).toBeTruthy();
          /* its props type (the one its function takes), and the ones it is made of (the draws' `DrawProps & …`) */
          const type = new RegExp(`export function ${component}\\(props: (\\w+)Props\\b`).exec(kit.source)?.[1] ?? component;
          const own = propsOf(kit.source, type);
          const made = [...own.matchAll(/=\s*(\w+)Props\s*&/g)].map((m) => propsOf(kit.source, m[1]));
          expect(own, `${kit.name} ${component}`).not.toBe("");
          expect([own, ...made].join("\n"), `${kit.name} ${component} ${ep.prop}`).toMatch(new RegExp(`\\b${ep.prop}\\?: \\(`));
        }
        wired++;
      }
    /* most parts' events are wired: a few no component sends (the map stand-in never moves) */
    expect(wired).toBeGreaterThan(30);
  });

  it("make the payload of a callback that hands a single value", () => {
    expect(eventProp("number-pad", "submit")).toEqual({ prop: "onSubmit", params: "value: string", payload: "{ value }" });
    expect(eventProp("prize-wheel", "settled")).toEqual({ prop: "onSettled", params: "e: unknown", payload: "e" });
    expect(eventProp("map", "regionChange")).toBeNull();
    expect(eventProp("button", "submit")).toBeNull();
  });
});
