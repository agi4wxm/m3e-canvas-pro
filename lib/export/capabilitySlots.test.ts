/* What the exported apps hand a capability view's slot, and the types the product's packages/capabilities declares,
 * held to what the product's own typecheck and lint ask without running them (scripts/check-product.ts `parts` does,
 * on GitHub): every slot is handed only what its view's props type has (the call's stand-in is drawn with an `icon` the
 * call has no prop for, which failed the exported apps' typecheck), and no type of the capabilities is an empty
 * interface or an empty object type (a product that draws views and invokes no call had `interface CapabilityMap {}`,
 * which the product's lint turns down). */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { allPartsDoc } from "../codegen.fixture";
import { PARTS } from "../../parts/registry";
import { CAPABILITY_CATALOG, capabilityOf } from "../capabilities/catalog";
import { VIEW_SLOT_OWN, slotTakes, viewPropKeys } from "../capabilities/doc";
import type { CapabilityDef } from "../capabilities/types";
import { slotsOf } from "./appCapabilities";
import { buildProduct } from "./product";
import { typesModule } from "./targets/capabilities";
import type { Product } from "./types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

/** the attribute names of each JSX element named `name` in a source: braces, strings and template literals skipped */
function attributesOf(source: string, name: string): string[][] {
  const out: string[][] = [];
  for (let at = source.indexOf(`<${name}`); at >= 0; at = source.indexOf(`<${name}`, at + 1)) {
    if (/[\w$]/.test(source[at + name.length + 1] ?? "")) continue;
    const names: string[] = [];
    let i = at + name.length + 1;
    while (i < source.length && source[i] !== ">" && !(source[i] === "/" && source[i + 1] === ">")) {
      const word = /^[A-Za-z_$][\w$-]*/.exec(source.slice(i));
      if (word && /\s/.test(source[i - 1])) {
        names.push(word[0]);
        i += word[0].length;
        continue;
      }
      if (source[i] === '"') i = source.indexOf('"', i + 1) + 1;
      else if (source[i] === "{") {
        /* an expression: to its closing brace, strings inside it skipped */
        let depth = 0;
        for (; i < source.length; i++) {
          const c = source[i];
          if (c === '"' || c === "'" || c === "`") {
            for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
        }
        i++;
      } else i++;
    }
    out.push(names);
  }
  return out;
}

const APPS = ["web", "mobile", "miniapp"] as const;
const views = CAPABILITY_CATALOG.filter((d) => d.kind === "view");

/* the all-parts document draws one of each part: every capability view, and no call invoked */
let p: Product;
beforeAll(async () => {
  p = await buildProduct(allPartsDoc(), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
}, 120_000);

describe("a capability view's slot", () => {
  it("has a props type of named keys for every view of the catalog, and a part that draws each", () => {
    for (const v of views) expect(viewPropKeys(v)?.size, v.name).toBeGreaterThan(0);
    expect(new Set(PARTS.flatMap((d) => (d.capability ? [d.capability] : [])))).toEqual(new Set(views.map((v) => v.name)));
  });

  it("is handed, in every app, only what its view's props type has (and what every view's slot has)", () => {
    const slots = slotsOf(allPartsDoc()).filter((s) => s.view && s.view !== "world");
    /* every part that is a capability view is there: the all-parts document has one of each */
    expect(new Set(slots.map((s) => s.slug))).toEqual(new Set(PARTS.filter((d) => d.capability).map((d) => d.slug)));
    for (const s of slots) {
      const keys = viewPropKeys(capabilityOf(undefined, s.view))!;
      for (const app of APPS) {
        const screens = Object.entries(p.files).filter(([f, v]) => f.startsWith(`apps/${app}/src/generated/screens/`) && typeof v.body === "string");
        const handed = screens.flatMap(([, v]) => attributesOf(v.body as string, s.name));
        expect(handed.length, `${app} ${s.name}`).toBeGreaterThan(0);
        for (const names of handed) {
          expect(names, `${app} ${s.name}`).toContain("width");
          expect(names.filter((n) => !keys.has(n) && !VIEW_SLOT_OWN.includes(n)), `${app} ${s.name} (${s.view})`).toEqual([]);
        }
      }
    }
  });

  it("is not handed what only the stand-in is drawn with, which the stand-in still is", () => {
    /* the call's stand-in draws an icon while there is no picture: the call has no prop for it */
    expect(viewPropKeys(capabilityOf(undefined, "rtc.view"))?.has("icon")).toBe(false);
    const call = slotsOf(allPartsDoc()).find((s) => s.slug === "video-call")!;
    const web = p.files["apps/web/src/generated/screens/AllPartsScreen.tsx"].body as string;
    const inside = web.slice(web.indexOf(`<${call.name}`), web.indexOf(`</${call.name}>`));
    expect(attributesOf(inside, call.name)[0]).not.toContain("icon");
    expect(attributesOf(inside, "VideoCall")[0]).toContain("icon");
  });

  it("takes any key of a view whose props are a record, and only the named ones otherwise", () => {
    const own: CapabilityDef = { name: "acme.board", kind: "view", version: 1, props: { type: "object" } };
    expect(slotTakes({ own: [own] }, "acme.board")("anything")).toBe(true);
    expect(slotTakes(undefined, "rtc.view")("icon")).toBe(false);
    expect(slotTakes(undefined, "rtc.view")("name")).toBe(true);
    expect(slotTakes(undefined, "rtc.view")("onEvent")).toBe(true);
  });
});

describe("the capabilities' types", () => {
  /** what typescript-eslint's no-empty-object-type turns down: an empty interface, an empty object type */
  const empty = (source: string) => [...source.matchAll(/interface\s+\w+\s*\{\s*\}|=\s*\{\s*\}/g)].map((m) => m[0]);
  const call = capabilityOf(undefined, "payment.pay")!;
  const map = capabilityOf(undefined, "map")!;
  const silent: CapabilityDef = { name: "acme.badge", kind: "view", version: 1, props: { type: "object", properties: { text: { type: "string" } } } };

  it("have no empty interface or object type, whatever the product uses", () => {
    for (const defs of [[], [map], [silent], [map, silent], [call], [call, map], [...CAPABILITY_CATALOG]]) {
      const source = typesModule(defs);
      expect(empty(source), defs.map((d) => d.name).join(", ") || "none").toEqual([]);
      /* nothing turns the rule off for them */
      expect(source).not.toMatch(/eslint-disable/);
    }
  });

  it("say a product that invokes no call has a map of no key, and one that does has its calls", () => {
    expect(typesModule([map])).toContain("export type CapabilityMap = Record<never, never>");
    expect(typesModule([silent])).toContain("export type AcmeBadgeEvents = Record<never, never>");
    expect(typesModule([call, map])).toContain('export interface CapabilityMap {\n  "payment.pay": { args: PaymentPayArgs; result: PaymentPayResult }\n}');
  });

  it("are what the all-parts product's package declares, which draws views and invokes no call", () => {
    const types = p.files["packages/capabilities/src/generated/types.ts"].body as string;
    expect(empty(types)).toEqual([]);
    expect(types).toContain("export type CapabilityMap = Record<never, never>");
  });
});
