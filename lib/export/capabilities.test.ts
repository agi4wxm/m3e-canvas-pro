/* The platform capabilities in the exported product (docs/平台能力.md): a product that invokes one or draws a capability
 * view gets packages/capabilities (the editor's catalog, registry and mocks copied as they are, the types of what it
 * uses), each app a registry its runtime invokes through, the adapters' file and a slot for each view written once,
 * the screens drawing the slot with the design's stand-in, the platform's defaults only for the generic capabilities
 * it uses; the boundary report says what is left to write. A product that uses none gets none of it, byte for byte. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { makeItem, type Doc } from "../tokens";
import { planExport } from "./merge";
import { buildProduct } from "./product";
import { slotsOf } from "./appCapabilities";
import type { Product } from "./types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const build = (doc: Doc) => buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

/** a shop's checkout that pays, a store's map, and a copy button */
function payingDoc(): Doc {
  const pay = { ...makeItem("button"), id: "pay", label: "Pay", props: { label: "Pay" } };
  const map = { ...makeItem("map"), id: "map", props: { markers: { columns: ["Id", "Title", "Lat", "Lng"], rows: [["s1", "Store", "31.2", "121.4"]] } } };
  const copy = { ...makeItem("button"), id: "copy", label: "Copy", props: { label: "Copy" } };
  return {
    title: "Paying",
    brief: "",
    paletteKey: "purple",
    frame: "phone",
    frames: [{ id: "f", name: "Checkout", x: 0, y: 0 }],
    groups: [
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      { id: "g1", x: 16, y: 100, axis: "x", items: [{ ...pay, action: { to: "none", transition: "none", effects: [{ do: "invoke", capability: "payment.pay", args: { orderId: "'o1'" }, then: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "{{result.status}}" }] }, catch: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "{{error.type}}" }] } }] } }] },
      { id: "g2", x: 16, y: 200, axis: "x", name: "Store map", items: [map] },
      { id: "g3", x: 16, y: 500, axis: "x", items: [{ ...copy, action: { to: "none", transition: "none", effects: [{ do: "invoke", capability: "clipboard.write", args: { text: "'x'" } }] } }] },
    ],
  };
}

describe("the capabilities a product uses", () => {
  let p: Product;
  beforeAll(async () => {
    p = await build(payingDoc());
  }, 60_000);

  it("are a package of their own: the editor's catalog, registry and mocks, and the types of what the design uses", async () => {
    const root = JSON.parse(text(p, "package.json"));
    expect(root.workspaces).toContain("packages/capabilities");
    for (const f of ["types", "catalog", "registry", "mock"]) expect(text(p, `packages/capabilities/src/engine/capabilities/${f}.ts`), f).toBe(await fromDisk(`lib/capabilities/${f}.ts`));
    const types = text(p, "packages/capabilities/src/generated/types.ts");
    expect(types).toContain("export type PaymentPayArgs = {");
    expect(types).toMatch(/orderId: string;/);
    expect(types).toContain("export type MapProps =");
    expect(types).toContain('"payment.pay": { args: PaymentPayArgs; result: PaymentPayResult }');
    expect(text(p, "packages/capabilities/src/generated/used.ts")).toContain('"clipboard.write",\n  "map",\n  "payment.pay"');
    expect(text(p, "packages/capabilities/src/index.test.ts")).toContain("not-implemented");
  });

  it("give every app a registry its runtime invokes through, and an adapters' file written once", () => {
    expect(text(p, "apps/web/src/generated/api.ts")).toContain("capabilities: registry,");
    expect(text(p, "apps/mobile/src/generated/runtime.ts")).toContain("capabilities: registry,");
    expect(text(p, "apps/miniapp/src/generated/runtime.ts")).toContain("capabilities: registry,");
    for (const app of ["web", "mobile", "miniapp"]) {
      expect(p.files[`apps/${app}/src/custom/capabilities.ts`].kind, app).toBe("seeded");
      expect(text(p, `apps/${app}/src/custom/capabilities.ts`), app).toContain("export const capabilities: Capabilities = {};");
      expect(text(p, `apps/${app}/src/generated/capabilities.ts`), app).toContain("createAppCapabilities({ adapters: capabilities, defaults: PLATFORM_CAPABILITIES");
      expect(JSON.parse(text(p, `apps/${app}/package.json`)).dependencies["@paying/capabilities"], app).toBe("0.1.0");
    }
  });

  it("have the platform's defaults for the generic capabilities used, and none for a payment", () => {
    const web = text(p, "apps/web/src/generated/platformCapabilities.ts");
    expect(web).toContain('"clipboard.write"');
    expect(web).not.toContain('"payment.pay"');
    expect(web).not.toContain('"link.open"');
    expect(text(p, "apps/miniapp/src/generated/platformCapabilities.ts")).toContain("Taro.setClipboardData");
    /* the phone has no clipboard without a package to add: it answers not-implemented */
    expect(text(p, "apps/mobile/src/generated/platformCapabilities.ts")).not.toContain('"clipboard.write"');
  });

  it("embed no SDK, key or permission declaration: those are the product's to add", () => {
    const sdk = /maps|camera|location|notification|firebase|stripe|alipay|wechat|apple-auth|google-sign|purchase|payment|agora|webrtc|twilio|biometric|local-auth|barcode|scanner/i;
    for (const app of ["web", "mobile", "miniapp"]) {
      const pkg = JSON.parse(text(p, `apps/${app}/package.json`)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => sdk.test(d)), app).toEqual([]);
    }
    expect(text(p, "apps/mobile/app.json")).not.toMatch(/permissions|UsageDescription|NSLocation|NSCamera|ACCESS_FINE_LOCATION/);
    expect(text(p, "apps/miniapp/src/app.config.ts")).not.toMatch(/permission|requiredPrivateInfos/);
    for (const app of ["web", "mobile", "miniapp"]) expect(text(p, `apps/${app}/src/custom/capabilities.ts`), app).not.toMatch(/apiKey|secret|appId\s*[:=]/i);
  });

  it("draw each capability view with a slot the product writes once, its stand-in until then", () => {
    expect(slotsOf(payingDoc()).map((s) => s.name)).toEqual(["StoreMap"]);
    for (const app of ["web", "mobile", "miniapp"]) {
      const slot = p.files[`apps/${app}/src/custom/slots/StoreMap.tsx`];
      expect(slot?.kind, app).toBe("seeded");
      /* custom code, which the product's lint holds to Prettier: semicolons, and a line it would not break */
      expect(slot.body as string, app).toContain("type Props = ViewSlotProps<MapProps, MapEvents, ReactNode>;\n\nexport default function StoreMap({ children }: Props) {\n  return <>{children}</>;\n}");
      expect(text(p, `apps/${app}/src/generated/slots.ts`), app).toContain('export { default as StoreMap } from "../custom/slots/StoreMap"');
    }
    const web = text(p, "apps/web/src/generated/screens/CheckoutScreen.tsx");
    expect(web).toContain('import { StoreMap } from "@/generated/slots"');
    /* the slot is handed what the stand-in is, the chosen marker as its value too */
    const slot = web.slice(web.indexOf("<StoreMap"), web.indexOf("</StoreMap>"));
    expect(slot).toContain('markers={[{ id: "s1", title: "Store", lat: 31.2, lng: 121.4 }]}');
    expect(slot).toContain("onValueChange=");
    expect(slot).toContain("<MapView");
    expect(text(p, "apps/mobile/src/generated/screens/CheckoutScreen.tsx")).toMatch(/<StoreMap\s[^>]*>\s*<Placeholder part="map"/);
    expect(text(p, "apps/miniapp/src/generated/screens/CheckoutScreen.tsx")).toMatch(/<StoreMap\s[^>]*>\s*<Placeholder part="map"/);
  });

  it("run the invoke on every app", () => {
    expect(text(p, "apps/web/src/generated/screens/CheckoutScreen.tsx")).toMatch(/void invoke\("payment\.pay", \{ orderId: \$\.ev\("'o1'"\) \}, \{ then: \(result\) =>/);
    expect(text(p, "apps/mobile/src/generated/effects.ts")).toContain('case "invoke": {');
  });

  it("are reported where the product has code to write", () => {
    const left = p.differences.filter((d) => d.kind === "capability");
    for (const app of ["web", "mobile", "miniapp"] as const) {
      const mine = left.filter((d) => d.app === app).map((d) => d.detail);
      expect(mine.some((d) => d.includes("invokes payment.pay")), app).toBe(true);
      expect(mine.some((d) => d.includes("capability view (map)")), app).toBe(true);
    }
    /* the web and the mini-program copy with the platform's own API; the phone needs an adapter */
    expect(left.some((d) => d.app === "web" && d.detail.includes("clipboard.write"))).toBe(false);
    expect(left.some((d) => d.app === "mobile" && d.detail.includes("clipboard.write"))).toBe(true);
  });

  it("keep what the product wrote when it is exported again", () => {
    /* the adapters and the slot are on disk already, whatever they hold now: they are kept, never written */
    const disk = { "apps/web/src/custom/capabilities.ts": "0".repeat(64), "apps/web/src/custom/slots/StoreMap.tsx": "1".repeat(64) };
    const plan = planExport({ product: p.name, next: p.files, disk, previous: null });
    expect(plan.kept).toEqual(expect.arrayContaining(Object.keys(disk)));
    expect(plan.writes.map((w) => w.path)).not.toContain("apps/web/src/custom/capabilities.ts");
  });

});

describe("a product that only pays", () => {
  /* what check:product's proof caught: a package that typechecks on its own, and no import left unused */
  it("imports nothing for the platform's defaults, and types the timers its package uses", async () => {
    const doc = payingDoc();
    doc.groups = doc.groups.filter((g) => g.id === "g1");
    const p = await build(doc);
    for (const app of ["web", "mobile", "miniapp"]) {
      const defaults = text(p, `apps/${app}/src/generated/platformCapabilities.ts`);
      expect(defaults.split("\n").filter((l) => l.startsWith("import ")), app).toEqual([`import type { Capabilities } from "@paying/capabilities"`]);
    }
    expect(JSON.parse(text(p, "packages/capabilities/tsconfig.json")).compilerOptions.lib).toContain("DOM");
    expect(text(p, "packages/capabilities/src/engine/capabilities/registry.ts")).toContain("setTimeout");
  }, 60_000);

  it("imports only what the defaults it uses reach", async () => {
    const doc = payingDoc();
    const share = { ...makeItem("button"), id: "share", props: { label: "Share" }, action: { to: "none", transition: "none" as const, effects: [{ do: "invoke" as const, capability: "share.open", args: { url: "'https://example.com'" } }] } };
    doc.groups = [...doc.groups.filter((g) => g.id === "g1"), { id: "g4", x: 16, y: 600, axis: "x", items: [share] }];
    const mobile = text(await build(doc), "apps/mobile/src/generated/platformCapabilities.ts");
    expect(mobile).toContain('import { Share } from "react-native"');
    expect(mobile).not.toContain("Linking");
    expect(mobile).not.toContain("DocumentPicker");
  }, 60_000);
});

describe("a product that uses no capability", () => {
  it("has none of it", async () => {
    const doc: Doc = { title: "Plain", brief: "", paletteKey: "purple", frame: "phone", frames: [{ id: "f", name: "Home", x: 0, y: 0 }], groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id: "b", props: { label: "Hi" } }] }] };
    const p = await build(doc);
    /* the shared runtime and the mocks read what an invoke comes to and how the mocks answer one: the types only */
    expect(Object.keys(p.files).filter((f) => /capabilit|Capabilit|\/slots/.test(f)).sort()).toEqual(["packages/app-runtime/src/engine/capabilities/types.ts", "packages/mocks/src/engine/capabilities/types.ts"]);
    expect(text(p, "apps/web/src/generated/api.ts")).not.toContain("registry");
  }, 60_000);
});
